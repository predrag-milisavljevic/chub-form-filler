// CHub Form Filler v1.3.3 — runs in the page's MAIN world (needs window.tinymce).
// Built against spa/libs/components/src/lib/fields (formly + ng-select + PrimeNG + TinyMCE).
// Flow: user creates a submission and selects Type → extension fills the rest.
(() => {
  if (window.__chubFiller && window.__chubFiller.version === '1.3.3') return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) =>
    (s || '').replace(/★/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) =>
    !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  async function waitFor(fn, timeout = 4000, step = 100) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  // Idle = no save loader bar (lib-loader .loader) and no DOM node changes for quietMs.
  async function waitIdle(quietMs = 700, timeout = 15000) {
    let last = Date.now();
    const obs = new MutationObserver(() => (last = Date.now()));
    obs.observe(document.body, { subtree: true, childList: true });
    const t0 = Date.now();
    try {
      while (Date.now() - t0 < timeout) {
        checkStop(); // every long wait is also a point where a Type change / click on the banner stops the run
        const busy = !!document.querySelector('lib-loader .loader');
        if (!busy && Date.now() - last >= quietMs) return true;
        await sleep(100);
      }
      return false;
    } finally {
      obs.disconnect();
    }
  }

  function nativeSet(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }
  const fire = (el, ...types) =>
    types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));
  const blur = (el) => {
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  };

  // ---------- stop conditions & on-page status banner ----------
  class StopRun extends Error {}
  const submissionId = () => (location.hash.match(/submissions\/([^/?#]+)/) || [])[1] || '';
  // Throws StopRun when the user clicked the banner, the submission changed, or the Type was changed.
  // Changing the Type on a filled draft re-draws the form; carrying on would fill a form of another type.
  function checkStop() {
    if (!ctx) return;
    if (ctx.abort) throw new StopRun(ctx.abort);
    if (submissionId() !== ctx.subId) throw new StopRun('the submission changed during the fill');
    if (ctx.pageScope) {
      const now = findByLabel(document, ctx.settings.typeLabel)?.querySelector('.ng-value')?.textContent?.trim() || '';
      if (now && now !== ctx.type) throw new StopRun(`Type changed during the fill (was ${ctx.type}, now ${now})`);
    }
  }

  // A small badge in the top-right corner of the page, appended to <body> (outside the app's forms): blue while the
  // run is going (click = stop), green when finished (fades after 8 s), red/amber when something needs attention
  // (stays until clicked). It is created at the start and changed only after the run, so it can't disturb the
  // "page is quiet" checks that run in between.
  const BANNER_COLORS = { running: '#1f6feb', done: '#1a7f37', problem: '#cf222e', stopped: '#bf8700' };
  function banner(state, text) {
    try {
      clearTimeout(window.__chubBannerTimer);
      let b = document.getElementById('__chubFillerBanner');
      if (!b) {
        if (!document.getElementById('__chubFillerStyle')) {
          const st = document.createElement('style');
          st.id = '__chubFillerStyle';
          st.textContent = '@keyframes __chubPulse{0%{transform:scale(1)}35%{transform:scale(1.1)}100%{transform:scale(1)}}';
          document.head.appendChild(st);
        }
        b = document.createElement('div');
        b.id = '__chubFillerBanner';
        b.setAttribute('role', 'status');
        document.body.appendChild(b);
      }
      b.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:440px;padding:10px 16px;border-radius:8px;' +
        'font:600 14px/1.35 system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;' +
        `background:${BANNER_COLORS[state]};` + (state === 'running' ? '' : 'animation:__chubPulse .5s ease-out 3;');
      b.textContent = text;
      b.onclick = () => {
        if (state === 'running') { if (ctx && window.__chubFillerBusy) ctx.abort = 'you clicked the banner'; }
        else b.remove();
      };
      if (state === 'done') window.__chubBannerTimer = setTimeout(() => b.remove(), 8000);
    } catch (_) { /* the banner is only a convenience */ }
  }
  function showResult(r) {
    if (!r) return;
    if (r.error) return banner('stopped', `CHub Form Filler: ${r.error}`);
    if (r.stopped) return banner('stopped', `CHub Form Filler stopped: ${r.stopped}. ${r.filled.length} field(s) were filled before that. Click to dismiss.`);
    const nf = r.failed.length;
    const manual = r.unsupported.length ? ` · ${r.unsupported.length} to fill manually` : '';
    if (nf) {
      const names = r.failed.slice(0, 3).map((f) => f.replace(/ \(.*$/, '')).join(', ') + (nf > 3 ? ', …' : '');
      return banner('problem', `CHub Form Filler done: ${r.filled.length} filled · ${nf} failed (${names})${manual}. Click to dismiss.`);
    }
    banner('done', `CHub Form Filler done: ${r.filled.length} filled · 0 failed${manual}`);
  }

  // ---------- scope & discovery ----------
  const openModals = () =>
    [...document.querySelectorAll('.modal-background')].filter((m) => visible(m) && m.querySelector('formly-form'));
  const inModal = (el) => !!el.closest('.modal-background');

  // Top-level field wrappers (.f = FieldWrapperComponent) inside root.
  function wrappers(root) {
    const inPage = root === document;
    return [...root.querySelectorAll('formly-form .f')].filter(
      (w) => visible(w) && !w.parentElement.closest('.f') && (!inPage || !inModal(w))
    );
  }
  // Direct child wrappers of a container wrapper (e.g. rfp-chronology rows).
  function childWrappers(w) {
    return [...w.querySelectorAll('.f')].filter((c) => visible(c) && c.parentElement.closest('.f') === w);
  }
  function labelOf(w) {
    const span = w.querySelector(':scope > .semi-bold-XS-label > span');
    let t = (span?.textContent || '').trim();
    if (!t) {
      // list fields render their own header: <div class="regular-S-label separator ..."><span>Section title</span>
      const h = w.querySelector('.regular-S-label.separator > span');
      t = (h?.textContent || '').trim();
    }
    if (!t) {
      // fields without their own label (e.g. Scope Of Work): use the section card title
      const card = w.closest('.card');
      t = (card?.querySelector('.regular-S-label > span')?.textContent || '').trim();
    }
    return t;
  }
  function keyOf(w) {
    const l = labelOf(w);
    const same = wrappers(document).filter((x) => norm(labelOf(x)) === norm(l));
    const idx = same.indexOf(w);
    return idx < 0 ? null : { label: l, idx };
  }
  function byKey(k) {
    if (!k) return null;
    return wrappers(document).filter((x) => norm(labelOf(x)) === norm(k.label))[k.idx] || null;
  }
  const isRequired = (w) => !!w.querySelector(':scope > .semi-bold-XS-label > .sup');
  const findByLabel = (root, label) => wrappers(root).find((w) => norm(labelOf(w)) === norm(label));

  function detect(w) {
    const q = (s) => w.querySelector(s);
    if (q('input#left[type=number]') && q('input#right[type=number]')) return { kind: 'split' };
    if (q('.form-table') && q('button .icon--add')) return { kind: 'list' }; // BaseBidder lists → Add opens popup
    if (childWrappers(w).length) return { kind: 'container' }; // rfp-chronology
    if (q('ngx-dropzone, input[type=file]')) return { kind: 'upload' }; // never filled (photo, attachments)
    if (q('table')) return { kind: 'unsupported' };
    if (q('.fake-input--disabled')) return { kind: 'readonly' };
    if (q('editor')) return { kind: 'rte', el: q('editor') };
    if (q('p-datepicker')) return { kind: 'date', el: q('p-datepicker') };
    if (q('p-inputmask')) return { kind: 'time', el: q('p-inputmask input') };
    if (q('ng-select')) return { kind: 'select', el: q('ng-select') };
    if (q('input[currencymask]')) return { kind: 'decimal', el: q('input[currencymask]') };
    if (q('input[type=number]')) return { kind: 'number', el: q('input[type=number]') };
    if (q('textarea')) return { kind: 'textarea', el: q('textarea') };
    if (q('input[type=radio]')) return { kind: 'radio' };
    if (q('input[type=checkbox]')) return { kind: 'checkbox', el: q('input[type=checkbox]') };
    if (q('input[type=email]')) return { kind: 'text', el: q('input[type=email]') };
    if (q('input[type=text], input:not([type])')) return { kind: 'text', el: q('input[type=text], input:not([type])') };
    return { kind: 'unsupported' };
  }

  // ---------- fillers ----------
  async function fillText(el, value) {
    if (el.disabled || el.readOnly) return 'disabled';
    if (el.value && !ctx.overwrite) return 'has value';
    value = String(value);
    if (el.maxLength > 0) value = value.slice(0, el.maxLength);
    el.focus();
    nativeSet(el, value);
    fire(el, 'input', 'change'); // input -> FormControl, change -> emitChange() auto-save
    blur(el);
    return true;
  }

  async function fillNumber(el, value) {
    if (el.disabled || el.readOnly) return 'disabled';
    if (el.value && !ctx.overwrite) return 'has value';
    let n = Number(value);
    if (Number.isNaN(n)) n = Number(ctx.settings.number);
    if (el.min !== '' && n < Number(el.min)) n = Number(el.min);
    if (el.max !== '' && n > Number(el.max)) n = Number(el.max);
    return fillText(el, String(n));
  }

  // ng2-currency-mask formats on keypress; fall back to plain set + input.
  async function fillDecimal(el, value) {
    if (el.disabled || el.readOnly) return 'disabled';
    if (el.value && !/^[0.,\s]*$/.test(el.value) && !ctx.overwrite) return 'has value';
    el.focus();
    // clear first (overwrite / re-fill): select all + Backspace, the mask handles both via keydown
    if (/[1-9]/.test(el.value)) {
      for (let k = 0; k < 25 && /[1-9]/.test(el.value); k++) {
        el.setSelectionRange?.(0, el.value.length);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true }));
        await sleep(10);
      }
      if (/[1-9]/.test(el.value)) { nativeSet(el, ''); fire(el, 'input'); }
    }
    const digits = String(Math.round(Number(value) * 100));
    for (const ch of digits) {
      const code = ch.charCodeAt(0);
      el.dispatchEvent(
        new KeyboardEvent('keypress', { key: ch, charCode: code, keyCode: code, which: code, bubbles: true, cancelable: true })
      );
      await sleep(15);
    }
    if (!/[1-9]/.test(el.value)) {
      nativeSet(el, String(value));
      fire(el, 'input');
    }
    blur(el);
    return true;
  }

  // percentage-split: left input (e.g. Capex) — right side is calculated by the component.
  async function fillSplit(w, value) {
    const left = w.querySelector('input#left');
    if (left.disabled) return 'disabled';
    if (left.value && !ctx.overwrite) return 'has value';
    return fillText(left, String(value));
  }

  function ngOptions(ngs) {
    const panel = ngs.querySelector('ng-dropdown-panel') ||
      [...document.querySelectorAll('ng-dropdown-panel')].pop();
    if (!panel) return null;
    const opts = [...panel.querySelectorAll('.ng-option:not(.ng-option-disabled)')];
    return opts.length ? opts : null;
  }
  const ngHasValue = (ngs) => !!ngs.querySelector('.ng-value');
  function closeNg(ngs) {
    const input = ngs.querySelector('.ng-input input');
    (input || ngs).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  async function fillSelect(ngs, wanted) {
    if (ngs.classList.contains('ng-select-disabled')) return 'disabled';
    if (ngHasValue(ngs) && !ctx.overwrite) return 'has value';
    const container = ngs.querySelector('.ng-select-container');
    if (!container) return 'no container';
    container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    let opts = await waitFor(() => ngOptions(ngs), 1500);
    const input = ngs.querySelector('.ng-input input');
    if (!opts && input) {
      // API-backed / user-search selects only load options after typing
      nativeSet(input, wanted || ctx.settings.searchTerm || 'a');
      fire(input, 'input');
      opts = await waitFor(() => ngOptions(ngs), 5000);
    }
    if (!opts) {
      closeNg(ngs);
      return 'no options';
    }
    let opt;
    if (wanted) {
      opt = opts.find((o) => norm(o.textContent) === norm(wanted)) ||
        opts.find((o) => norm(o.textContent).includes(norm(wanted)));
      if (!opt) {
        closeNg(ngs);
        return `option "${wanted}" not found`;
      }
    } else {
      opt = ctx.settings.pick === 'random' ? opts[Math.floor(Math.random() * opts.length)] : opts[0];
    }
    opt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(100);
    if (ngs.classList.contains('ng-select-opened')) closeNg(ngs);
    return true;
  }

  const ddmmyyyy = (d) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  // value: undefined/'today' → today (or nearest enabled day), 'first' → first enabled day,
  // '+N' / '-N' → today ± N days (typed), 'dd/mm/yyyy' → typed (date-field commits typed dates on blur).
  async function fillDate(pd, value) {
    const input = pd.querySelector('input');
    if (!input || input.disabled) return 'disabled';
    if (input.value && !ctx.overwrite) return 'has value';
    if (value !== undefined && /^[+-]\d+$/.test(String(value).trim())) {
      const d = new Date();
      d.setDate(d.getDate() + Number(String(value).trim()));
      value = ddmmyyyy(d);
    }

    if (value && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(value))) {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true })); // sets typing=true
      nativeSet(input, String(value));
      fire(input, 'input');
      await sleep(150);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      blur(input);
      await sleep(150);
      return input.value ? true : document.contains(input) ? 'typed date not accepted' : 're-drawn';
    }

    input.focus();
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = await waitFor(
      () => [...document.querySelectorAll('.p-datepicker-panel, .p-datepicker-overlay, body > .p-datepicker')].find(visible),
      4000
    );
    if (!panel) {
      // calendar can open late (throttled/background tab): type today's date instead
      return fillDate(pd, ddmmyyyy(new Date()));
    }
    const enabled = () =>
      [...panel.querySelectorAll('td:not(.p-datepicker-other-month) span')].filter(
        (s) => /^\d{1,2}$/.test(s.textContent.trim()) && !s.classList.contains('p-disabled')
      );
    let day = null;
    // look forward up to 12 months, then backwards up to 12 (past-only pickers)
    for (const dir of ['next', 'prev']) {
      for (let i = 0; i < 12 && !day; i++) {
        if (value !== 'first') day = panel.querySelector('td.p-datepicker-today span:not(.p-disabled)');
        if (!day) day = (dir === 'prev' ? enabled().pop() : enabled()[0]) || null;
        if (!day) {
          const btn = panel.querySelector(
            dir === 'next' ? '.p-datepicker-next-button, .p-datepicker-next' : '.p-datepicker-prev-button, .p-datepicker-prev'
          );
          if (!btn) break;
          btn.click();
          await sleep(150);
        }
      }
      if (day) break;
    }
    if (!day) return 'no selectable day';
    day.click();
    await sleep(150);
    blur(input);
    return true;
  }

  async function fillTime(el, value) {
    if (!el || el.disabled) return 'disabled';
    if (el.value && /\d/.test(el.value) && !ctx.overwrite) return 'has value';
    el.focus();
    nativeSet(el, value);
    fire(el, 'input');
    blur(el);
    return true;
  }

  async function fillRte(editorEl, html) {
    const tm = window.tinymce;
    if (!tm) return 'tinymce not found';
    const ed = await waitFor(
      () => (tm.get ? tm.get() : tm.editors || []).find((e) => editorEl.contains(e.getContainer?.())),
      8000
    );
    if (!ed) return document.contains(editorEl) ? 'editor not initialised' : 're-drawn'; // detached = stale copy
    if (ed.mode?.isReadOnly?.()) return 'disabled';
    if (ed.getContent({ format: 'text' }).trim() && !ctx.overwrite) return 'has value';
    ed.focus();
    ed.setContent(html);
    const emit = (ev) => (typeof ed.dispatch === 'function' ? ed.dispatch(ev) : ed.fire(ev));
    emit('input');
    emit('change');
    ed.save();
    emit('blur'); // rte-field triggerSave() runs on blur
    await sleep(50);
    return true;
  }

  async function fillCheckbox(el, value) {
    if (el.disabled) return 'disabled';
    const want = value === undefined ? true : !/^(false|no|0|off)$/i.test(String(value));
    if (el.checked === want) return 'already set';
    el.click();
    return true;
  }

  async function fillRadio(w, wanted) {
    const radios = [...w.querySelectorAll('input[type=radio]')].filter((r) => !r.disabled);
    if (!radios.length) return 'disabled';
    if (radios.some((r) => r.checked) && !ctx.overwrite) return 'has value';
    let r = radios[0];
    if (wanted) {
      r = radios.find((x) => norm(x.closest('label')?.textContent).includes(norm(wanted)));
      if (!r) return `option "${wanted}" not found`;
    }
    r.click();
    return true;
  }

  // ---------- list fields (bidders, suppliers, …): Add → popup → fill → Save ----------
  async function fillList(w0, label) {
    const title = (w0.querySelector('.regular-S-label.separator > span')?.textContent || label).trim();
    (ctx.lists ||= []).push({ label, title });
    let w = w0;
    const fresh = () => {
      const span = [...document.querySelectorAll('formly-form .regular-S-label.separator > span')]
        .find((x) => !inModal(x) && norm(x.textContent) === norm(title));
      const f = span?.closest('.f');
      if (f) w = f;
      return w;
    };
    const rows = () => fresh().querySelectorAll('.form-table > .table-row').length;
    const target = ctx.settings.listRows ?? 2;
    const addBtn = () => w.querySelector('button .icon--add')?.closest('button');
    const notes = [];
    let added = 0;
    // attempt-based: the row can render late (re-draw after save), so don't block on seeing it
    const attempts = Math.max(0, target - rows());
    for (let a = 0; a < attempts; a++) {
      checkStop();
      const btn = addBtn();
      if (!btn || btn.disabled) { notes.push('Add button not available'); break; }
      const before = new Set(openModals());
      btn.click();
      const modal = await waitFor(() => openModals().find((m) => !before.has(m)), 3000);
      if (!modal) { notes.push('popup did not open'); break; }
      await sleep(300);
      const sub = await fillScope(modal, label, true);
      const save = modal.querySelector('.modal__footer .btn--primary');
      const ok = save && (await waitFor(() => !save.disabled, 3000));
      if (!ok) {
        const invalid = sub.failed.concat(sub.unsupported);
        notes.push('Save stayed disabled' + (invalid.length ? ': ' + invalid.join(', ') : ''));
        modal.querySelector('.modal__footer .btn--blank')?.click();
        break;
      }
      const n = rows();
      save.click();
      await waitFor(() => !document.contains(modal) || !visible(modal), 4000);
      added++;
      await waitIdle(500, 3000); // let the list save go out before the next Add (max 3 s)
      await waitFor(() => rows() > n, 2000); // short: a late row is picked up by the final re-count
    }
    // one row is enough (agreed): report extra-row problems as a note, not a failure
    if (added || rows() > 0) {
      const total = rows();
      return ['filled', `list: ${added} row(s) added, ${total} total${notes.length ? '; ' + notes.join('; ') : ''}`];
    }
    if (rows() >= target) return ['skipped', `list: already ${rows()} row(s)`];
    return ['failed', 'list: ' + notes.join('; ')];
  }

  // practical-experience-field (not wrapped): Add creates inline rows; row fields are filled by the normal pass.
  // Rows are added AFTER the first fill pass (see fillScope): a row added while the first field saves are
  // still in flight is dropped when the form re-draws. Returns the number of rows added.
  const inlineTarget = () => ctx.settings.practicalRows ?? ctx.settings.listRows ?? 2;
  function inlineTables(root) {
    return [...root.querySelectorAll('formly-form .form-table')].filter(
      (t) => visible(t) && !t.closest('.f') && (root !== document || !inModal(t)) &&
        t.querySelector('button.add-button-position, button.btn--border')
    );
  }
  const inlineRowCount = (t) => t.parentElement.querySelectorAll(':scope > .formly-group-table').length;

  async function ensureInlineRows(root) {
    const target = inlineTarget();
    let total = 0;
    for (const t of inlineTables(root)) {
      const count = () => inlineRowCount(t);
      let added = 0;
      while (count() < target) {
        checkStop();
        const btn = t.querySelector('button.add-button-position, button.btn--border');
        if (!btn || btn.disabled) break;
        const n = count();
        btn.click();
        if (!(await waitFor(() => count() > n, 2000))) break;
        added++;
      }
      total += added; // reported once, by the final recount in run()
    }
    return total;
  }

  async function confirmPopupIfAny() {
    const btn = await waitFor(
      () => document.querySelector('lib-confirmation-popup .modal__footer .btn--primary:not([disabled])'),
      2500
    );
    if (!btn) return false;
    if (!ctx.settings.autoConfirmTypeChange) return 'popup left open';
    btn.click();
    return true;
  }

  // ---------- values ----------
  function template(str, label) {
    return String(str)
      .replace(/\{label\}/g, label)
      .replace(/\{type\}/g, ctx.type || '')
      .replace(/\{stamp\}/g, ctx.stamp)
      .replace(/\{n(\d)\}/g, (_, d) => String(10 ** (d - 1) + Math.floor(Math.random() * 9 * 10 ** (d - 1)))); // no leading zero
  }
  function findKey(obj, label) {
    return Object.keys(obj || {}).find((k) => norm(k) === norm(label));
  }
  // explicit override (type-specific, then "*") → label rule → undefined (kind default)
  function valueFor(label) {
    const o = ctx.cfg.overrides || {};
    const byType = (ctx.type && o[findKey(o, ctx.type)]) || {};
    let k = findKey(byType, label);
    if (k !== undefined) return byType[k];
    k = findKey(o['*'], label);
    if (k !== undefined) return o['*'][k];
    for (const r of ctx.settings.labelRules || []) {
      try {
        if (new RegExp(r.match, 'i').test(label)) return r.value;
      } catch (_) { /* bad regex in settings — ignore rule */ }
    }
    return undefined;
  }

  async function fillField(w, label) {
    checkStop();
    const s = ctx.settings;
    if ((s.skipLabels || []).some((x) => norm(x) === norm(label))) return ['skipped', 'in skipLabels'];
    let ov = valueFor(label);
    const d = detect(w);
    // an array gives one value per occurrence of the label on the page (1st, 2nd, …); the last one repeats.
    // Rich text is the exception: there an array is one paragraph per item.
    // Fields in list popups and RFP Chronology rows have no page occurrence index, so they get the 1st entry.
    if (Array.isArray(ov) && d.kind !== 'rte') ov = ov[Math.min(keyOf(w)?.idx ?? 0, ov.length - 1)];
    if (ov === 'skip') return ['skipped', 'override: skip'];
    if (s.onlyRequired && !isRequired(w)) return ['skipped', 'not required'];
    const text = ov !== undefined ? template(ov, label) : template(s.textTemplate, label);
    let r;
    switch (d.kind) {
      case 'text': r = await fillText(d.el, text); break;
      case 'textarea': r = await fillText(d.el, ov !== undefined ? text : template(s.textareaTemplate, label)); break;
      case 'number': r = await fillNumber(d.el, ov ?? s.number); break;
      case 'decimal': r = await fillDecimal(d.el, ov ?? s.decimal); break;
      case 'split': r = await fillSplit(w, ov ?? s.percentageSplitLeft ?? 60); break;
      case 'select': r = await fillSelect(d.el, ov !== undefined ? String(ov) : null); break;
      case 'date': {
        let v = ov;
        const m = /^\s*([+-]\d+)\s*\*\s*n\s*$/.exec(String(v ?? ''));
        if (m) {
          const k = keyOf(w);
          v = String(Number(m[1]) * ((k ? k.idx : 0) + 1));
          if (!v.startsWith('-')) v = '+' + v;
        }
        r = await fillDate(d.el, v);
        break;
      }
      case 'time': r = await fillTime(d.el, ov ?? s.time); break;
      case 'rte': {
        // string = one paragraph, array = one <p> per line
        const src = ov !== undefined ? ov : s.rteTemplate;
        const safeLabel = label.replace(/[()]/g, '').trim();
        const lines = (Array.isArray(src) ? src : [src]).map((l) => `<p>${template(l, safeLabel).replace(/^\s*\(+/, '')}</p>`);
        r = await fillRte(d.el, lines.join(''));
        break;
      }
      case 'checkbox': r = await fillCheckbox(d.el, ov); break;
      case 'radio': r = await fillRadio(w, ov); break;
      case 'list': return fillList(w, label);
      case 'container': {
        const kids = childWrappers(w);
        let filled = 0;
        const bad = [];
        for (const [i, c] of kids.entries()) {
          const [st, info] = await fillField(c, labelOf(c) || label);
          if (st === 'filled') filled++;
          else if (st === 'failed' || st === 'unsupported') bad.push(`#${i + 1} ${info}`);
          await sleep(s.delayMs ?? 150);
        }
        if (bad.length) return ['failed', `container: ${filled}/${kids.length} filled; ${bad.join('; ')}`];
        return [filled ? 'filled' : 'skipped', `container: ${filled}/${kids.length} filled`];
      }
      case 'readonly': return ['skipped', 'read-only'];
      case 'upload': return ['skipped', 'file upload (not supported)'];
      default: return ['unsupported', d.kind];
    }
    if (r === true) {
      if (ctx.verify && !inModal(w)) { const k = keyOf(w); if (k) ctx.verify.push({ label, kind: d.kind, key: k }); } // top-level page fields only
      return ['filled', d.kind];
    }
    if (r === 'has value' || r === 'already set' || r === 'disabled' || r === 're-drawn') return ['skipped', `${d.kind}: ${r}`];
    return ['failed', `${d.kind}: ${r}`];
  }

  // Fill all fields in one scope (page or a popup). Repeats passes so conditional fields get filled too.
  async function fillScope(root, prefix, quiet) {
    const s = ctx.settings;
    const report = { filled: [], skipped: [], failed: [], unsupported: [] };
    if (root === document && !quiet) ctx.pageReport = report; // what a stopped run reports
    const tag = (l) => (prefix ? `${prefix} › ${l}` : l);
    const done = new Set(ctx.structural || []);
    const doneKeys = new Set(); // page scope: the form is re-drawn after list saves, so track label#occurrence too
    if (root === document) for (const w of ctx.structural || []) {
      const k = w && keyOf(w);
      if (k) doneKeys.add(`${norm(k.label)}#${k.idx}`); // Type / Subtype are never filled here
    }
    const passes = async () => {
      for (let pass = 0; pass < 3; pass++) {
        // retry candidates are new elements (re-drawn) or keys released above
        const todo = wrappers(root).filter((w) => !done.has(w) || (root === document && pass > 0 && (() => {
          const k = keyOf(w); return k && !doneKeys.has(`${norm(k.label)}#${k.idx}`);
        })()));
        if (!todo.length) break;
        for (const w of todo) {
          done.add(w);
          if (!document.contains(w)) continue; // stale copy from before a re-draw
          let ks = null;
          if (root === document) {
            const k = keyOf(w);
            ks = k ? `${norm(k.label)}#${k.idx}` : null;
            if (ks && doneKeys.has(ks)) continue; // already handled before the re-draw
            if (ks) doneKeys.add(ks);
          }
          const label = labelOf(w) || 'Field';
          try {
            const [status, info] = await fillField(w, label);
            // failed or re-drawn mid-fill: let the next pass retry the new copy instead of reporting it now
            if (ks && pass < 2 && (status === 'failed' || /re-drawn/.test(info || ''))) { doneKeys.delete(ks); continue; }
            report[status].push(info ? `${tag(label)} (${info})` : tag(label));
          } catch (e) {
            if (e instanceof StopRun) throw e;
            report.failed.push(`${tag(label)} (${e.message})`);
          }
          await sleep(s.delayMs ?? 150);
        }
        if (root === document) await waitIdle(600);
        else await sleep(300);
      }
    };
    // new = an element not seen yet whose label#occurrence wasn't handled (a re-drawn copy of a filled field isn't new)
    const isNew = (w) => {
      if (done.has(w)) return false;
      const k = keyOf(w);
      return !k || !doneKeys.has(`${norm(k.label)}#${k.idx}`);
    };
    // The page can be quiet while the form template is still downloading (no DOM changes during the network wait),
    // so keep polling for a while and fill any field wrappers that appear.
    const pollLate = async (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        checkStop();
        if (wrappers(document).some(isNew)) {
          await waitIdle(600, 5000);
          await passes();
        } else await sleep(250);
      }
    };
    await passes();
    if (!quiet) {
      // The form body can render after the header (slow template load): scan again once the page is quiet,
      // then keep watching for lateScanMs (default 2 s) for fields that render even later.
      if (root === document) { await waitIdle(800, 15000); await passes(); await pollLate(s.lateScanMs ?? 2000); }
      // Inline rows (Practical Experience) are added only after the form has been quiet for a while: a save response
      // arriving shortly after a fill re-draws the form and drops a row added in the meantime. After another quiet
      // period the loop checks that the row survived, and adds + refills it if not (max 3 attempts).
      // Forms without such a table skip all of this waiting.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!inlineTables(root).length) break;
        if (root === document) await waitIdle(2500, 20000);
        const added = await ensureInlineRows(root);
        if (!added) break;
        for (const w of wrappers(root)) {
          if (!w.closest('lib-practical-experience-table-form')) continue;
          done.delete(w); // the new row's fields are fresh, even if the same labels were handled before a re-draw
          const k = keyOf(w);
          if (k) doneKeys.delete(`${norm(k.label)}#${k.idx}`);
        }
        await waitIdle(800);
        await passes(); // fill the new row's fields
        // no wait here: the next attempt starts with the same quiet period before it re-counts the rows
      }
    }
    return report;
  }

  // true = value present, false = gone, null = field not found (can't tell)
  function stillFilled(k) {
    const w = byKey(k);
    if (!w) return null;
    const d = detect(w);
    switch (d.kind) {
      case 'text': case 'textarea': case 'number': case 'time': return !!d.el.value;
      case 'decimal': return /[1-9]/.test(d.el.value);
      case 'date': return !!d.el.querySelector('input')?.value;
      case 'select': return ngHasValue(d.el);
      case 'rte': {
        const ed = (window.tinymce?.get() || []).find((e) => d.el.contains(e.getContainer?.()));
        return ed ? !!ed.getContent({ format: 'text' }).trim() : null;
      }
      default: return true;
    }
  }

  // stillFilled() is null while the field's wrapper isn't in the DOM (form mid-redraw): wait briefly for it to come
  // back before judging, so a re-draw at the wrong moment isn't read as "can't tell".
  async function settled(k, ms = 1500) {
    let v = stillFilled(k);
    for (let t = 0; v === null && t < ms; t += 150) { await sleep(150); v = stillFilled(k); }
    return v;
  }

  let ctx;

  // One run per tab: the popup can be reopened (Alt+Shift+F) while a run is still going.
  // The flag lives on window so a re-injected copy of the same version sees it too; a page reload clears it.
  async function run(cfg) {
    const busy = window.__chubFillerBusy;
    if (busy) {
      return { error: `A fill is already running on this tab (started ${new Date(busy.since).toLocaleTimeString()}). Wait for its report, or reload the page.` };
    }
    window.__chubFillerBusy = { since: Date.now() };
    banner('running', 'CHub Form Filler: filling… Click here to stop.');
    let r = null;
    try {
      r = await runOnce(cfg);
      return r;
    } catch (e) {
      r = { error: `error: ${e?.message || e}` };
      throw e;
    } finally {
      window.__chubFillerBusy = null;
      showResult(r);
    }
  }

  // Runs the fill; a StopRun (Type or submission changed, banner clicked) ends it early with what was done so far.
  async function runOnce(cfg) {
    try {
      return await runBody(cfg);
    } catch (e) {
      if (!(e instanceof StopRun)) throw e;
      if (ctx.pageScope) {
        // popups opened by this run (list "Add") are cancelled, never saved half-filled
        for (const m of openModals()) m.querySelector('.modal__footer .btn--blank')?.click();
      }
      const partial = ctx.pageReport || { filled: [], skipped: [], failed: [], unsupported: [] };
      const r = { type: ctx.type, scope: ctx.pageScope ? 'page' : 'popup', stopped: e.message };
      for (const k of ['filled', 'skipped', 'failed', 'unsupported']) r[k] = (ctx.pre?.[k] || []).concat(partial[k]);
      console.info('[CHub Form Filler] stopped:', r);
      return r;
    }
  }

  async function runBody(cfg) {
    const settings = cfg.settings || {};
    ctx = {
      cfg, settings, type: null, overwrite: !!settings.overwrite, subId: submissionId(),
      stamp: new Date().toISOString().slice(5, 16).replace('T', ' '),
    };

    // Scope: an already-open popup with a form (e.g. a create popup), otherwise the page.
    const modals = openModals();
    const root = modals.length ? modals[modals.length - 1] : document;
    if (root === document && !document.querySelector('formly-form')) {
      return { error: 'No CHub form found on this page. Create a submission and select its Type first.' };
    }
    ctx.pageScope = root === document;

    // 1) Type — selected by the user; read it, never change it.
    const tw = findByLabel(root, settings.typeLabel);
    const typeText = tw?.querySelector('.ng-value')?.textContent?.trim() || '';
    if (!typeText) return { error: `Select the submission Type first (field "${settings.typeLabel}" is empty or not found).` };
    ctx.type = typeText;
    ctx.structural = [tw];
    const pre = { filled: [], skipped: [], failed: [], unsupported: [] };
    ctx.pre = pre;

    // 2) Subtype — structural: may show a confirmation popup and reset form data.
    const sw = findByLabel(root, settings.subtypeLabel);
    if (sw) ctx.structural.push(sw);
    const ngs = sw?.querySelector('ng-select');
    if (ngs) {
      let ov = valueFor(settings.subtypeLabel);
      if (Array.isArray(ov)) ov = ov[0]; // only one Subtype field
      if (ov !== 'skip') {
        const r = await fillSelect(ngs, ov ? String(ov) : null);
        if (r === true) {
          if (root === document) {
            await confirmPopupIfAny();
            await waitIdle(900);
          }
          pre.filled.push(settings.subtypeLabel);
        } else pre[r === 'has value' || r === 'disabled' ? 'skipped' : 'failed'].push(`${settings.subtypeLabel} (${r})`);
      }
    }

    // 3) Everything else
    ctx.verify = [];
    const report = await fillScope(root === document ? document : root, '', false);
    // Values the app reverted (a save rejected by the server, or a save response re-drawing the form) show up empty
    // again after the run looked finished. After one quiet period, find filled fields that are empty now and
    // re-fill them; a field that is still empty after the re-fill is reported as failed.
    const checks = () => {
      const m = new Map(); // re-fills add the same field to ctx.verify again
      for (const v of ctx.verify) { const ks = `${norm(v.key.label)}#${v.key.idx}`; if (!m.has(ks)) m.set(ks, v); }
      return [...m.values()];
    };
    if (root === document) await waitIdle(1000, 15000);
    const lost = [];
    for (const v of checks()) if ((await settled(v.key)) === false) lost.push(v);
    const refilled = [];
    if (lost.length) {
      ctx.overwrite = true;
      for (const v of lost) {
        const w = byKey(v.key);
        if (w) { try { await fillField(w, v.label); } catch (e) { if (e instanceof StopRun) throw e; } }
        await waitIdle(500);
      }
      ctx.overwrite = !!settings.overwrite;
      await waitIdle(1000);
    }
    for (const v of lost) {
      if (stillFilled(v.key) === false) {
        const i = report.filled.findIndex((f) => f.startsWith(v.label + ' ('));
        if (i >= 0) report.filled.splice(i, 1);
        report.failed.push(`${v.label} (${v.kind}: value lost after save, re-fill also lost)`);
      } else refilled.push(v.label);
    }
    if (refilled.length) report.refilled = refilled;
    // list rows can appear several seconds after Save: re-count before reporting
    for (const l of ctx.lists || []) {
      const span = [...document.querySelectorAll('formly-form .regular-S-label.separator > span')]
        .find((x) => !inModal(x) && norm(x.textContent) === norm(l.title));
      const n = span?.closest('.f')?.querySelectorAll('.form-table > .table-row').length || 0;
      const i = report.failed.findIndex((f) => f.startsWith(l.label + ' (list'));
      if (n > 0 && i >= 0) {
        report.failed.splice(i, 1);
        report.filled.push(`${l.label} (list: ${n} row(s))`);
      }
    }
    // Practical Experience: a re-draw after the last check can still drop rows, so count them once more.
    for (const t of inlineTables(root)) {
      const n = inlineRowCount(t);
      const want = inlineTarget();
      if (n < want) report.failed.push(`Practical Experience (${n} of ${want} row(s) after final check)`);
      else report.filled.push(`Practical Experience (${n} row(s) after final check)`);
    }
    for (const k of Object.keys(pre)) report[k] = pre[k].concat(report[k]);
    report.type = typeText;
    report.scope = root === document ? 'page' : 'popup';
    console.info('[CHub Form Filler]', report);
    return report;
  }

  window.__chubFiller = { run, version: '1.3.3' };
})();
