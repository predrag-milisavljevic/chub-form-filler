const LOREM = [
  '{label}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
];

const DEFAULT_CFG = {
  version: '1.3.3',
  settings: {
    typeLabel: 'Type',
    subtypeLabel: 'Subtype',
    skipLabels: ['Business Unit'],
    delayMs: 150,
    overwrite: false,
    onlyRequired: false,
    pick: 'first',
    autoConfirmTypeChange: true,
    searchTerm: 'a',
    listRows: 2,
    practicalRows: 2,
    lateScanMs: 2000,
    textTemplate: 'QA {label} {stamp}',
    textareaTemplate: 'QA test text for {label} ({type}) {stamp}',
    rteTemplate: LOREM,
    number: 5,
    decimal: 1000,
    percentageSplitLeft: 60,
    time: '10:00',
    labelRules: [
      { match: '(\\bno\\.?|\\bnumber)$', value: '{n7}' },
      { match: 'email', value: 'qa.test@example.com' },
      { match: 'date of birth', value: '15/06/1990' },
      { match: 'end date', value: '+365*n' },
      { match: 'salary', value: 15000 },
      { match: 'years', value: 5 },
      { match: 'icv', value: 40 },
      { match: '^(technical|commercial)$', value: 80 }
    ]
  },
  overrides: {
    '*': { Subject: 'QA {type} {stamp}' },
    'Internal Transfer Requests': { 'Employment ID': 'EMP{n6}' },
    // Practical Experience rows: two non-overlapping periods of 230 and 250 days (~7.5 + ~8 months).
    // The app counts whole calendar months, which gives 7m + 8m = 1y 3m in total.
    // A list gives one value per occurrence of the label: 1st row, 2nd row.
    'New Hire Requests': { From: ['-520', '-270'], To: ['-290', '-20'] }
  }
};

// Old default values that are replaced by the current defaults when the saved values are still exactly the old ones.
// Each entry is all-or-nothing (From/To belong together): if the user changed any of them, all are kept.
const MIGRATIONS = [
  {
    parent: ['overrides', 'New Hire Requests'],
    old: { From: ['-450', '-230'], To: ['-240', '-20'] }
  }
];

const $ = (id) => document.getElementById(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

// Adds keys that exist in the defaults but not in the saved config (nested objects too). Saved values always win;
// arrays are not merged (the saved array replaces the default). Returns the paths of the added keys.
function addMissing(saved, defaults, path = [], added = []) {
  for (const k of Object.keys(defaults)) {
    if (k === 'version') continue;
    if (!(k in saved)) {
      saved[k] = clone(defaults[k]);
      added.push(path.concat(k).join(' › '));
    } else if (isObj(saved[k]) && isObj(defaults[k])) {
      addMissing(saved[k], defaults[k], path.concat(k), added);
    }
  }
  return added;
}

function migrate(saved) {
  const changed = [];
  const at = (root, path) => path.reduce((o, k) => (isObj(o) ? o[k] : undefined), root);
  for (const m of MIGRATIONS) {
    const parent = at(saved, m.parent);
    const keys = Object.keys(m.old);
    if (!isObj(parent) || !keys.every((k) => JSON.stringify(parent[k]) === JSON.stringify(m.old[k]))) continue;
    const def = at(DEFAULT_CFG, m.parent);
    for (const k of keys) parent[k] = clone(def[k]);
    changed.push(keys.map((k) => m.parent.concat(k).join(' › ')).join(', '));
  }
  return changed;
}

// Returns { cfg, notice }. Saved settings from an older version get the new default keys merged in (and old
// default values migrated); the result is saved back so this happens once.
async function loadCfg() {
  const { cfg } = await chrome.storage.local.get('cfg');
  if (!isObj(cfg)) return { cfg: clone(DEFAULT_CFG), notice: '' };
  if (cfg.version === DEFAULT_CFG.version) return { cfg, notice: '' };
  const from = cfg.version || 'an older version';
  const added = addMissing(cfg, DEFAULT_CFG);
  const migrated = migrate(cfg);
  cfg.version = DEFAULT_CFG.version;
  await chrome.storage.local.set({ cfg });
  const lines = [`Saved settings updated from ${from} to ${DEFAULT_CFG.version}. Your own values were kept.`];
  if (added.length) lines.push('Added defaults: ' + added.join(', '));
  if (migrated.length) lines.push('Updated old default values: ' + migrated.join(', '));
  return { cfg, notice: lines.join('\n') };
}

function show(text, isErr) {
  $('status').textContent = text;
  $('status').className = isErr ? 'err' : '';
}

function formatReport(r) {
  const sec = (title, arr) => (arr.length ? `${title} (${arr.length}):\n  ${arr.join('\n  ')}\n` : '');
  return (
    (r.stopped ? `STOPPED: ${r.stopped}. Below is what was done before that.\n\n` : '') +
    `Type: ${r.type}   (scope: ${r.scope})\n` +
    `Filled ${r.filled.length} · Skipped ${r.skipped.length} · Failed ${r.failed.length} · Unsupported ${r.unsupported.length}\n\n` +
    sec('Failed', r.failed) + sec('Unsupported (fill manually)', r.unsupported) +
    sec('Re-filled after a lost save', r.refilled || []) +
    sec('Skipped', r.skipped) + sec('Filled', r.filled)
  );
}

async function fill() {
  const { cfg } = await loadCfg();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('fill').disabled = true;
  show('Filling… a blue badge in the page corner shows the run (click it to stop). It turns green when finished; you can close this popup.');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['filler.js'], world: 'MAIN' });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (c) => window.__chubFiller.run(c),
      args: [cfg]
    });
    const r = res?.result;
    if (!r) show('No result returned. Check the page console ([CHub Form Filler]).', true);
    else if (r.error) show(r.error, true);
    else show(formatReport(r), !!r.stopped);
  } catch (e) {
    show('Error: ' + e.message, true);
  } finally {
    $('fill').disabled = false;
  }
}

async function init() {
  const { cfg, notice } = await loadCfg();
  if (notice) show(notice);
  $('cfg').value = JSON.stringify(cfg, null, 2);
  $('fill').onclick = fill;
  $('save').onclick = async () => {
    try {
      const parsed = JSON.parse($('cfg').value);
      await chrome.storage.local.set({ cfg: parsed });
      show('Settings saved.');
    } catch (e) {
      show('Invalid JSON: ' + e.message, true);
    }
  };
  $('reset').onclick = async () => {
    await chrome.storage.local.set({ cfg: DEFAULT_CFG });
    $('cfg').value = JSON.stringify(DEFAULT_CFG, null, 2);
    show('Defaults restored.');
  };
}

init();
