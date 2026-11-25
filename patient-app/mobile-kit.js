/* Physio Point HTML prototype — mobile app kit (shared by patient-app and professional-app).
   Phone frame, top bar, bottom tabs, bottom sheets, guarded hash routing and cross-tab sync.
   Uses the same clinic store as the clinic workspace, so actions show up there. Fictional data only (D-006). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  const M = (PP.m = {});

  /* ------------------------------------------------ app-local device state (not clinic data) */
  M.local = function (key, defaults) {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { data = {}; }
    const obj = Object.assign({}, defaults || {}, data);
    obj.save = () => { const copy = Object.assign({}, obj); delete copy.save; delete copy.clear; try { localStorage.setItem(key, JSON.stringify(copy)); } catch (e) { /* ignore */ } };
    obj.clear = () => { Object.keys(obj).forEach((k) => { if (k !== 'save' && k !== 'clear') delete obj[k]; }); Object.assign(obj, defaults || {}); try { localStorage.removeItem(key); } catch (e) { /* ignore */ } };
    return obj;
  };

  /** Reloads the shared store (other tabs may have written), runs fn, saves. */
  M.write = function (fn) { PP.load(); const out = fn(); PP.save(); return out; };

  /* ------------------------------------------------ mobile replacements for desktop states */
  PP.ui.skeletonPage = () => `<div class="m-skel" aria-busy="true" aria-label="Loading">
      <div class="skeleton" style="height:22px;width:60%"></div>
      <div class="skeleton" style="height:120px;border-radius:16px"></div>
      <div class="skeleton" style="height:64px;border-radius:16px"></div>
      <div class="skeleton" style="height:64px;border-radius:16px"></div>
      <div class="skeleton" style="height:64px;border-radius:16px"></div></div>`;
  PP.ui.notFound = (path) => M.emptyCard({ icon: 'alert', title: 'Screen not found', text: `No prototype screen at <code>${esc(path)}</code>.`, action: `<a class="btn btn-primary" href="${M.opts ? M.opts.home : '#/'}">Go home</a>` });
  PP.ui.errorState = (err) => M.emptyCard({ icon: 'alert', title: 'Something went wrong', text: esc(err && err.message ? err.message : String(err)), action: '<button class="btn" onclick="PP.render()">Try again</button>' });

  M.emptyCard = (o) => `<div class="m-card">${PP.ui.empty(o)}</div>`;
  M.sec = (title, action) => `<div class="m-sec"><h2>${title}</h2>${action || ''}</div>`;
  M.item = ({ href, icon, t, s, right, cls, attrs, avatar }) => {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="m-item ${cls || ''}" ${href ? `href="${href}"` : ''} ${attrs || ''}>${avatar || (icon ? `<span class="m-ic">${PP.icon(icon)}</span>` : '')}<span class="grow"><span class="t">${t}</span>${s ? `<span class="s">${s}</span>` : ''}</span>${right || ''}${href ? PP.icon('chevR', 'class="chev"') : ''}</${tag}>`;
  };
  M.switchHtml = (name, on, label) => `<label class="m-switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} aria-label="${esc(label || name)}"><span></span></label>`;
  M.seg = (name, options, active) => `<div class="m-seg" role="tablist" data-mseg="${name}">${options.map(([v, l]) => `<button type="button" role="tab" data-v="${v}" class="${v === active ? 'active' : ''}" aria-selected="${v === active}">${esc(l)}</button>`).join('')}</div>`;
  M.bindSeg = (root, name, fn) => { const seg = PP.$(`[data-mseg="${name}"]`, root); if (!seg) return; PP.$$('button', seg).forEach((b) => b.addEventListener('click', () => { PP.$$('button', seg).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); }); fn(b.dataset.v); })); };
  M.painClass = (n) => (n >= 7 ? 'high' : n >= 4 ? 'mid' : '');
  M.painWord = (n) => (n === 0 ? 'No pain' : n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : n <= 9 ? 'Severe' : 'Worst possible');
  M.toast = (msg, kind, ms) => PP.ui.toast(msg, kind, ms);

  /** Six one-digit boxes: typing, backspace, paste and autofill of the whole code spread across the boxes. */
  M.bindOtp = function (boxes) {
    const spread = (from, text) => { const d = String(text).replace(/D/g, "").slice(0, 6 - from); d.split("").forEach((c, k) => { boxes[from + k].value = c; }); (boxes[Math.min(5, from + d.length)] || boxes[5]).focus(); };
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => { const v = b.value.replace(/D/g, ""); if (v.length > 1) spread(i, v); else { b.value = v; if (v && boxes[i + 1]) boxes[i + 1].focus(); } });
      b.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
      b.addEventListener("paste", (e) => { const t = (e.clipboardData || window.clipboardData).getData("text"); if (!t) return; e.preventDefault(); spread(0, t); });
    });
    setTimeout(() => boxes[0].focus(), 50);
  };
  M.otpHtml = () => "<div class=\"m-otp\" data-otp>" + "<input inputmode=\"numeric\" autocomplete=\"one-time-code\" aria-label=\"Code digit\">".repeat(6) + "</div>";

  /* ------------------------------------------------ bottom sheet (stays inside the phone) */
  M.sheet = function ({ title, body, buttons, onOpen }) {
    const screen = PP.$('.m-screen') || document.body;
    const back = document.createElement('div'); back.className = 'm-sheet-back';
    back.innerHTML = `<div class="m-sheet" role="dialog" aria-modal="true" aria-label="${esc(PP.stripHtml(title))}">
      <div class="m-sheet-head"><h2>${title}</h2><button class="m-iconbtn" data-close aria-label="Close">${PP.icon('x')}</button></div>
      <div class="m-sheet-body"></div>
      ${buttons && buttons.length ? `<div class="m-sheet-foot">${buttons.map((b, i) => `<button class="btn ${b.kind ? 'btn-' + b.kind : ''}" data-btn="${i}">${b.label}</button>`).join('')}</div>` : ''}</div>`;
    const bodyEl = PP.$('.m-sheet-body', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    let closed = false; const listeners = [];
    const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); listeners.forEach((f) => f()); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    PP.$$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
    (buttons || []).forEach((b, i) => {
      const btn = PP.$(`[data-btn="${i}"]`, back);
      btn.addEventListener('click', async () => {
        if (!b.onClick) return close();
        btn.classList.add('is-loading'); btn.disabled = true;
        try { const keep = await b.onClick({ close, body: bodyEl, btn }); if (keep !== false) close(); }
        finally { btn.classList.remove('is-loading'); btn.disabled = false; }
      });
    });
    screen.appendChild(back);
    const first = PP.$('input:not([type=hidden]):not([type=checkbox]), select, textarea', bodyEl);
    if (first) setTimeout(() => first.focus(), 40);
    if (onOpen) onOpen(bodyEl, back);
    return { el: back, body: bodyEl, close, onClose: (f) => listeners.push(f) };
  };
  /** Resolves false (cancelled), true, or { reason } when reasonLabel is given. */
  M.confirm = function ({ title, message, confirmLabel, danger, reasonLabel, reasonRequired }) {
    return new Promise((resolve) => {
      let done = false;
      const s = M.sheet({
        title: title || 'Are you sure?',
        body: `<p style="margin-top:0">${message || ''}</p>${reasonLabel ? `<form class="m-form" onsubmit="return false">${PP.form.field({ name: 'reason', label: reasonLabel, type: 'textarea', required: !!reasonRequired, error: 'Please enter a reason.' })}</form>` : ''}`,
        buttons: [{ label: 'Back', kind: 'ghost' }, { label: confirmLabel || 'Confirm', kind: danger ? 'danger solid' : 'primary', onClick: ({ body }) => {
          if (reasonLabel) { const f = PP.$('form', body); if (!PP.form.validate(f)) return false; done = true; resolve({ reason: PP.form.read(f).reason }); return; }
          done = true; resolve(true);
        } }],
      });
      s.onClose(() => { if (!done) resolve(false); });
    });
  };

  /* ------------------------------------------------ frame + chrome */
  const statusBar = () => `<div class="m-status" data-status><span data-clock>${PP.fmt.time(PP.nowTime()).replace(/^0/, '')}</span><span class="m-sig"><span>${[5, 7, 9, 11].map((h) => `<i style="height:${h}px"></i>`).join('')}</span><span style="font-size:11px">4G</span><span class="m-bat"></span></span></div>`;

  /**
   * M.boot({ appName, side, tabs: [{ id, label, icon, href, badge() }], home, publicHome, guard(path, route) => redirectHash|null,
   *          brand() => html, onSync() })
   * Routes add: title, tab (id of active tab), back (hash or function), public (no sign-in), chrome: 'none' (no top/tab bar), light (light status bar).
   */
  M.boot = function (opts) {
    M.opts = opts;
    PP.load(); PP.applyBranding();
    document.body.classList.add('m-body');
    PP.$('#app').innerHTML = `<div class="m-stage"><div class="m-device" aria-label="${esc(opts.appName)} (phone preview)"><div class="m-notch" aria-hidden="true"></div>
        <div class="m-screen">${statusBar()}
          <header class="m-top" data-top></header>
          <main class="m-content" id="view" tabindex="-1"></main>
          <nav class="m-tabs" data-tabs aria-label="Main"></nav>
          <div class="toasts" role="status" aria-live="polite"></div>
        </div></div>
        <aside class="m-side">${opts.side ? opts.side() : ''}</aside></div>`;
    setInterval(() => { const c = PP.$('[data-clock]'); if (c) c.textContent = PP.fmt.time(PP.nowTime()).replace(/^0/, ''); }, 30000);
    const content = PP.$('#view');

    async function nav() {
      PP.$$('.m-sheet-back').forEach((s) => s.remove());
      const path = PP.currentPath(); const hit = PP.match(path);
      const redirect = opts.guard ? opts.guard(path, hit && hit.route) : null;
      if (redirect && redirect !== '#' + path) { location.replace(redirect); return; }
      M.chrome(hit);
      await PP.render();
      content.scrollTop = 0;
    }
    M.nav = nav;
    window.addEventListener('hashchange', nav);
    PP.on('data:changed', () => setTimeout(() => { M.refreshTabs(); const r = PP.match(PP.currentPath()); if (r && r.route.chrome !== 'none') M.chrome(r); }, 0));
    if (!location.hash || location.hash === '#' || location.hash === '#/') location.replace(opts.home);
    nav();

    // Pick up changes made in the clinic workspace or the other app (another tab).
    let t = null;
    window.addEventListener('storage', (e) => {
      if (e.key !== PP.STORE_KEY || !e.newValue || e.newValue === PP._lastJson) return;
      clearTimeout(t);
      t = setTimeout(() => {
        PP.load();
        const a = document.activeElement;
        const editing = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
        const hit = PP.match(PP.currentPath());
        // Never wipe a form or a multi-step flow (routes marked sync: false); just refresh the tab badges.
        if (editing || PP.$('.m-sheet-back') || (hit && hit.route.sync === false)) { M.refreshTabs(); return; }
        if (opts.onSync) opts.onSync();
        M.chrome(hit); const sc = PP.$('#view').scrollTop; PP.render().then(() => { PP.$('#view').scrollTop = sc; });
      }, 300);
    });
  };

  M.refreshTabs = function () {
    const opts = M.opts; const nav = PP.$('[data-tabs]'); if (!nav || !opts.tabs) return;
    const hit = PP.match(PP.currentPath()); const active = hit && hit.route.tab;
    nav.innerHTML = opts.tabs.map((t) => { const n = t.badge ? t.badge() : 0; return `<a href="${t.href}" class="${t.id === active ? 'active' : ''}" ${t.id === active ? 'aria-current="page"' : ''}>${PP.icon(t.icon)}<span>${esc(typeof t.label === 'function' ? t.label() : t.label)}</span>${n ? `<span class="dot">${n}</span>` : ''}</a>`; }).join('');
  };

  M.chrome = function (hit) {
    const opts = M.opts; const r = hit ? hit.route : null; const params = hit ? hit.params : {};
    const top = PP.$('[data-top]'); const tabs = PP.$('[data-tabs]'); const status = PP.$('[data-status]');
    const none = r && r.chrome === 'none';
    top.classList.toggle('hidden', !!none); tabs.classList.toggle('hidden', !!(none || (r && r.tabs === false)));
    status.classList.toggle('light', !!none);
    if (!none) {
      const title = r ? (typeof r.title === 'function' ? r.title(params) : r.title) : 'Not found';
      const back = r && r.back ? (typeof r.back === 'function' ? r.back(params) : r.back) : null;
      const right = opts.topRight ? opts.topRight(r) : '';
      top.innerHTML = back
        ? `<a class="m-iconbtn" href="${back}" aria-label="Back">${PP.icon('chevL')}</a><h1>${esc(PP.stripHtml(title || ''))}</h1>${right}`
        : `<div class="m-brand">${opts.brand ? opts.brand(title) : `<h1>${esc(title)}</h1>`}</div>${right}`;
    }
    M.refreshTabs();
  };

  /** Simple date chips for the next n days (Friday and closures marked). */
  M.dayChips = function (from, n, selected, closedFn) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const d = PP.addDays(from, i); const dt = PP.parseISO(d); const closed = closedFn ? closedFn(d) : false;
      html += `<button type="button" class="m-day ${d === selected ? 'active' : ''} ${closed ? 'closed' : ''}" data-day="${d}" aria-pressed="${d === selected}" aria-label="${PP.fmt.dateLong(d)}${closed ? ' (closed)' : ''}"><small>${PP.DAYS[dt.getDay()].slice(0, 3)}</small><b>${dt.getDate()}</b><small>${PP.MONTHS[dt.getMonth()]}</small></button>`;
    }
    return `<div class="m-chips" data-days>${html}</div>`;
  };

  /** Find-my-clinic directory (fictional). In production this is a vendor directory lookup or a typed domain (system-architecture §3, PD-010/PD-011). */
  M.lookupClinic = function (input) {
    const v = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) return null;
    const known = ['physiopoint', 'physiopoint.example', 'app.physiopoint.example', 'clinic.physiopoint.example', 'hello@physiopoint.example'];
    if (known.includes(v) || v.replace(/[\s-]/g, '') === 'physiopoint') {
      const s = PP.db.settings;
      return { code: 'PHYSIOPOINT', domain: 'app.physiopoint.example', api: 'https://app.physiopoint.example/api', name: s.clinicName, address: s.address, phone: s.phone, businessType: s.businessType };
    }
    return null;
  };
  M.clinicExplainer = () => `<div class="m-demo"><b>How one app finds each clinic.</b> Every clinic runs Physio Point on its own server and domain. The app asks for the clinic code (or the clinic’s web address), looks it up in a directory, then talks only to that clinic’s server. No patient data passes through the vendor. <span class="muted">(Proposed, system-architecture §3; the final method is pending PD-010 / PD-011.)</span><div class="mt-2">Demo code: <b class="mono">PHYSIOPOINT</b> · or domain <b class="mono">app.physiopoint.example</b></div></div>`;
  M.clinicIll = '<svg viewBox="0 0 150 110" fill="none" stroke="var(--pp-action)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="22" y="38" width="46" height="56" rx="4"/><path d="M45 50v14M38 57h14"/><rect x="88" y="16" width="40" height="78" rx="8"/><path d="M102 84h12"/><path d="M68 66c10 0 12-14 20-14" stroke-dasharray="4 5"/><circle cx="108" cy="42" r="9"/><path d="M104 42l3 3 6-6"/><path d="M10 94h130"/></svg>';
})();
