const LOREM = [
  '{label}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
];

const DEFAULT_CFG = {
  version: '1.3.0',
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
    // Practical Experience rows: two non-overlapping ~7-month periods (about 1 year 2 months in total).
    // A list gives one value per occurrence of the label: 1st row, 2nd row.
    'New Hire Requests': { From: ['-450', '-230'], To: ['-240', '-20'] }
  }
};

const $ = (id) => document.getElementById(id);

async function loadCfg() {
  const { cfg } = await chrome.storage.local.get('cfg');
  return cfg || DEFAULT_CFG;
}

function show(text, isErr) {
  $('status').textContent = text;
  $('status').className = isErr ? 'err' : '';
}

function formatReport(r) {
  const sec = (title, arr) => (arr.length ? `${title} (${arr.length}):\n  ${arr.join('\n  ')}\n` : '');
  return (
    `Type: ${r.type}   (scope: ${r.scope})\n` +
    `Filled ${r.filled.length} · Skipped ${r.skipped.length} · Failed ${r.failed.length} · Unsupported ${r.unsupported.length}\n\n` +
    sec('Failed', r.failed) + sec('Unsupported (fill manually)', r.unsupported) +
    sec('Re-filled after a lost save', r.refilled || []) +
    sec('Skipped', r.skipped) + sec('Filled', r.filled)
  );
}

async function fill() {
  const cfg = await loadCfg();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('fill').disabled = true;
  show('Filling… keep this popup open.');
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
    else show(formatReport(r));
  } catch (e) {
    show('Error: ' + e.message, true);
  } finally {
    $('fill').disabled = false;
  }
}

async function init() {
  const cfg = await loadCfg();
  if (cfg.version !== DEFAULT_CFG.version) {
    show(`Saved settings are from an older version. Click "Reset to defaults" in Settings to get the ${DEFAULT_CFG.version} defaults (re-add your own overrides after).`, true);
  }
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
