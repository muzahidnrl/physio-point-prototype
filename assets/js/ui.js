/* Physio Point HTML prototype — UI components (design-system.md §3). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;

  /* ---------------------------------------------------------------- icons */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
    userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 21c.8-4.2 3.8-6.5 7.5-6.5 1.6 0 3 .4 4.2 1.1"/><path d="M19 14v6M16 17h6"/>',
    rx: '<path d="M6 21V4h6a4 4 0 0 1 0 8H6"/><path d="M11 12l8 9M19 13l-6 7"/>',
    wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v4"/><rect x="3" y="7.5" width="18" height="13" rx="2"/><path d="M16 14h2"/>',
    coins: '<ellipse cx="9" cy="6.5" rx="6" ry="2.8"/><path d="M3 6.5v4.5c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8V6.5"/><path d="M9 13.8v4.3c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8v-4.5c0-1.4-2-2.5-4.7-2.8"/>',
    tag: '<path d="M3 12.5V4h8.5L21 13.5 13.5 21z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
    stethoscope: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11.5" r="2.5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8.5 3 8.5H3S6 15 6 8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 19.5 7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5 11 15.5 16.5 9.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 20V9M7 13.5l5-5 5 5M4 4h16"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    filter: '<path d="M3 5h18l-7 8.5V20l-4-2v-4.5z"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    building: '<path d="M4 21V5l8-2v18M12 21V9l8 2v10M8 9v.01M8 13v.01M8 17v.01M16 14v.01M16 18v.01M2 21h20"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
    heart: '<path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    dumbbell: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
    body: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M7 9.5h10M9 21l3-7 3 7"/>',
  };
  PP.icon = (name, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra || ''}>${P[name] || P.info}</svg>`;
  PP.logoSvg = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="19" cy="6" r="3" fill="#fff"/><path d="M8 28c2-7 5-10 9-12 4-2 6-5 6-9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M6 20c3-1 6-1 9 1" stroke="#7fd6cf" stroke-width="2.4" stroke-linecap="round"/></svg>';

  /* --------------------------------------------------------------- badges */
  const TONES = {
    positive: ['Confirmed', 'Completed', 'Approved', 'Active', 'Enabled', 'Available', 'Paid', 'Issued', 'Delivered', 'Closed day', 'Settled', 'Paid out', 'Present', 'Verified', 'Success'],
    info: ['In session', 'Checked in', 'Sent', 'Open'],
    lavender: ['Scheduled', 'Planned', 'Approved settlement'],
    warning: ['Pending', 'Draft', 'Partly paid', 'Grace', 'Review', 'Leave', 'Prepared', 'Invited'],
    error: ['Cancelled', 'Rejected', 'No-show', 'Unpaid', 'Overdue', 'Failed', 'Reversed', 'Disabled', 'Closed', 'Expired', 'Suspended', 'Void', 'Absent'],
    neutral: ['Rescheduled', 'Inactive', 'Refunded', 'Archived', 'Merged', 'Discarded'],
  };
  PP.ui = PP.ui || {};
  PP.ui.tone = (status) => Object.keys(TONES).find((k) => TONES[k].includes(status)) || 'neutral';
  PP.ui.badge = (status, tone) => `<span class="badge ${tone || PP.ui.tone(status)}">${esc(status)}</span>`;

  /* ----------------------------------------------------------- page parts */
  PP.ui.pageHead = ({ title, subtitle, crumbs, actions }) => `
    <div class="page-head">
      <div>
        ${crumbs ? `<div class="breadcrumb">${crumbs.map(([l, h]) => (h ? `<a href="${h}">${esc(l)}</a>` : esc(l))).join(' &rsaquo; ')}</div>` : ''}
        <h1>${title}</h1>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
      </div>
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>`;
  PP.ui.card = ({ title, actions, body, flush, foot, id, cls }) => `
    <section class="card ${cls || ''}" ${id ? `id="${id}"` : ''}>
      ${title ? `<div class="card-head"><h2>${title}</h2>${actions ? `<div class="row">${actions}</div>` : ''}</div>` : ''}
      <div class="card-body ${flush ? 'flush' : ''}">${body || ''}</div>
      ${foot ? `<div class="card-foot">${foot}</div>` : ''}
    </section>`;
  PP.ui.kpi = ({ label, value, hint, tone, icon }) => `
    <div class="kpi tone-${tone || 'positive'}">
      <div class="kpi-icon">${PP.icon(icon || 'activity')}</div>
      <div><div class="kpi-label">${esc(label)}</div><div class="kpi-value mono">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}</div>
    </div>`;
  PP.ui.empty = ({ icon, title, text, action }) => `
    <div class="empty"><div class="empty-icon">${PP.icon(icon || 'search')}</div><h3>${esc(title || 'Nothing here yet')}</h3>
    ${text ? `<p class="muted">${text}</p>` : ''}${action ? `<div class="mt-3">${action}</div>` : ''}</div>`;
  PP.ui.skeletonPage = () => `
    <div aria-busy="true" aria-label="Loading">
      <div class="skeleton" style="height:28px;width:260px"></div>
      <div class="skeleton mt-2" style="height:14px;width:380px;max-width:80%"></div>
      <div class="grid grid-4 mt-5">${'<div class="skeleton" style="height:96px"></div>'.repeat(4)}</div>
      <div class="skeleton mt-4" style="height:320px"></div>
    </div>`;
  PP.ui.notFound = (path) => `<div class="card">${PP.ui.empty({ icon: 'alert', title: 'Page not found', text: `No prototype screen at <code>${esc(path)}</code>.`, action: '<a class="btn btn-primary" href="#/dashboard">Go to dashboard</a>' })}</div>`;
  PP.ui.noAccess = (perm) => `<div class="card">${PP.ui.empty({ icon: 'lock', title: 'You do not have access to this page', text: `Your role does not include the permission <code>${esc(perm)}</code>. Access is checked on the server in production, not only by hiding menus.`, action: '<a class="btn" href="#/dashboard">Back to dashboard</a>' })}</div>`;
  PP.ui.errorState = (err) => `<div class="card">${PP.ui.empty({ icon: 'alert', title: 'Something went wrong', text: esc(err && err.message ? err.message : String(err)), action: '<button class="btn" onclick="PP.render()">Try again</button>' })}</div>`;
  PP.ui.alert = (kind, html) => `<div class="alert ${kind}">${PP.icon(kind === 'positive' ? 'checkCircle' : kind === 'info' ? 'info' : 'alert')}<div>${html}</div></div>`;

  /* ---------------------------------------------------------------- toast */
  PP.ui.toast = function (msg, kind, ms) {
    let host = PP.$('.toasts'); if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const k = kind || 'positive';
    const el = document.createElement('div'); el.className = `toast ${k}`;
    el.innerHTML = `${PP.icon(k === 'positive' ? 'checkCircle' : k === 'error' ? 'alert' : k === 'warning' ? 'alert' : 'info')}<div>${msg}</div>`;
    host.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, ms || 3200);
  };

  /* ---------------------------------------------------------------- modal */
  PP.ui.modal = function ({ title, body, size, buttons, onOpen }) {
    const back = document.createElement('div'); back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal ${size || ''}" role="dialog" aria-modal="true" aria-label="${esc(PP.stripHtml(title))}">
      <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${PP.icon('x')}</button></div>
      <div class="modal-body"></div>
      ${buttons && buttons.length ? `<div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.kind ? 'btn-' + b.kind : ''}" data-btn="${i}" ${b.id ? `id="${b.id}"` : ''}>${b.label}</button>`).join('')}</div>` : ''}
    </div>`;
    const bodyEl = PP.$('.modal-body', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const prevFocus = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    PP.$$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
    (buttons || []).forEach((b, i) => {
      const btn = PP.$(`[data-btn="${i}"]`, back);
      btn.addEventListener('click', async () => {
        if (!b.onClick) return close();
        btn.classList.add('is-loading'); btn.disabled = true;
        try { const keep = await b.onClick({ close, el: back, body: bodyEl, btn }); if (keep !== false) close(); }
        finally { btn.classList.remove('is-loading'); btn.disabled = false; }
      });
    });
    document.body.appendChild(back);
    const first = PP.$('input:not([type=hidden]), select, textarea, button.btn-primary', bodyEl) || PP.$('[data-btn]', back);
    if (first) setTimeout(() => first.focus(), 30);
    if (onOpen) onOpen(bodyEl, back);
    return { el: back, body: bodyEl, close };
  };
  /** Resolves to false (cancelled), true (confirmed) or { reason } when reasonLabel is given. */
  PP.ui.confirm = function ({ title, message, confirmLabel, danger, reasonLabel, reasonRequired }) {
    return new Promise((resolve) => {
      let done = false;
      const m = PP.ui.modal({
        title: title || 'Are you sure?', size: 'sm',
        body: `<p style="margin-top:0">${message || ''}</p>${reasonLabel ? `<form class="stack" onsubmit="return false"><div class="field"><label for="cf-reason">${esc(reasonLabel)}${reasonRequired ? '<span class="req">*</span>' : ''}</label><textarea id="cf-reason" name="reason" class="textarea" ${reasonRequired ? 'required' : ''}></textarea><div class="error">Please enter a reason.</div></div></form>` : ''}`,
        buttons: [
          { label: 'Cancel', kind: 'ghost' },
          { label: confirmLabel || 'Confirm', kind: danger ? 'danger solid' : 'primary', onClick: async ({ body }) => {
            if (reasonLabel) { const f = PP.$('form', body); if (!PP.form.validate(f)) return false; done = true; resolve({ reason: PP.form.read(f).reason }); return; }
            done = true; resolve(true);
          } },
        ],
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(document.body, { childList: true });
    });
  };

  /* ------------------------------------------------------------------ tabs */
  PP.ui.tabs = function (container, { tabs, active, onChange }) {
    container.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t) => `<button class="tab ${t.id === active ? 'active' : ''}" role="tab" aria-selected="${t.id === active}" data-tab="${t.id}">${esc(t.label)}${t.count != null ? ` <span class="count-pill" style="background:${t.id === active ? 'var(--pp-action)' : '#9aa8b0'}">${t.count}</span>` : ''}</button>`).join('')}</div>`;
    PP.$$('[data-tab]', container).forEach((b) => b.addEventListener('click', () => {
      PP.$$('[data-tab]', container).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
      onChange(b.dataset.tab);
    }));
  };
  PP.ui.segmented = (name, options, active) => `<div class="segmented" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === active ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  PP.ui.bindSegmented = (root, name, onChange) => {
    const seg = PP.$(`[data-seg="${name}"]`, root); if (!seg) return;
    PP.$$('button', seg).forEach((b) => b.addEventListener('click', () => { PP.$$('button', seg).forEach((x) => x.classList.toggle('active', x === b)); onChange(b.dataset.v); }));
  };

  /* ---------------------------------------------------------------- table */
  /**
   * PP.ui.table(container, {
   *   columns: [{ key, label, render(row) => html, sort(row) => value, align, exportValue(row) }],
   *   rows: [] | getRows: () => [],
   *   search: { placeholder, text(row) => string },
   *   filters: [{ id, label, options: [[value, label]], match(row, value) }],
   *   tools: html (extra buttons), pageSize, exportName, empty: { title, text, action },
   *   onRowClick(row), rowAttrs(row) => string, footer(rows) => html (tfoot row) })
   * Returns { refresh(), state }.
   */
  PP.ui.table = function (container, cfg) {
    const state = { q: '', filters: {}, page: 1, pageSize: cfg.pageSize || 10, sortKey: cfg.sortKey || null, sortDir: cfg.sortDir || 'asc' };
    (cfg.filters || []).forEach((f) => { state.filters[f.id] = f.value || ''; });
    container.innerHTML = `
      ${cfg.search || cfg.filters || cfg.exportName || cfg.tools ? `<div class="table-tools">
        ${cfg.search ? `<div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="${esc(cfg.search.placeholder || 'Search…')}" aria-label="${esc(cfg.search.placeholder || 'Search')}"></div>` : ''}
        ${(cfg.filters || []).map((f) => `<select class="select" style="width:auto;min-width:150px" data-f="${f.id}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${state.filters[f.id] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
        ${cfg.tools || ''}
        ${cfg.exportName ? `<button class="btn" data-export>${PP.icon('download')} Export</button>` : ''}
      </div>` : ''}
      <div class="table-wrap"><table class="table"><thead><tr>${cfg.columns.map((c) => `<th class="${c.sort ? 'sortable' : ''} ${c.align === 'right' ? 'right' : ''}" ${c.sort ? `data-sort="${c.key}"` : ''} scope="col">${esc(c.label)}${c.sort ? ' <span data-arrow></span>' : ''}</th>`).join('')}</tr></thead><tbody></tbody><tfoot></tfoot></table></div>
      <div class="table-foot"><div class="muted small" data-count></div><div class="row"><label class="small muted" for="ps-${cfg.exportName || 'x'}">Show</label><select class="select" style="width:auto;height:32px" data-ps id="ps-${cfg.exportName || 'x'}">${[5, 10, 25, 50].map((n) => `<option ${n === state.pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select><div class="pager" data-pager></div></div></div>`;
    const tbody = PP.$('tbody', container); const tfoot = PP.$('tfoot', container);
    const all = () => (cfg.getRows ? cfg.getRows() : cfg.rows) || [];
    const filtered = () => {
      let rows = all();
      if (state.q && cfg.search) { const q = state.q.toLowerCase(); rows = rows.filter((r) => cfg.search.text(r).toLowerCase().includes(q)); }
      (cfg.filters || []).forEach((f) => { const v = state.filters[f.id]; if (v) rows = rows.filter((r) => f.match(r, v)); });
      if (state.sortKey) {
        const col = cfg.columns.find((c) => c.key === state.sortKey);
        rows = rows.slice().sort((a, b) => { const x = col.sort(a); const y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * (state.sortDir === 'asc' ? 1 : -1); });
      }
      return rows;
    };
    function draw() {
      const rows = filtered(); const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      if (state.page > pages) state.page = pages;
      const slice = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
      if (!rows.length) {
        const e = cfg.empty || {}; const filteredOut = all().length > 0;
        tbody.innerHTML = `<tr><td colspan="${cfg.columns.length}">${PP.ui.empty({ icon: filteredOut ? 'filter' : e.icon || 'search', title: filteredOut ? 'No results match your search or filters' : e.title || 'No records yet', text: filteredOut ? 'Try a different search term or clear the filters.' : e.text || '', action: filteredOut ? '<button class="btn" data-clear>Clear search and filters</button>' : e.action || '' })}</td></tr>`;
        const clear = PP.$('[data-clear]', tbody);
        if (clear) clear.addEventListener('click', () => { state.q = ''; const qi = PP.$('[data-q]', container); if (qi) qi.value = ''; Object.keys(state.filters).forEach((k) => { state.filters[k] = ''; }); PP.$$('[data-f]', container).forEach((s) => { s.value = ''; }); draw(); });
      } else {
        tbody.innerHTML = slice.map((r, i) => `<tr class="${cfg.onRowClick ? 'clickable' : ''} ${cfg.rowClass ? cfg.rowClass(r) : ''}" data-i="${i}" ${cfg.rowAttrs ? cfg.rowAttrs(r) : ''}>${cfg.columns.map((c) => `<td class="${c.align === 'right' ? 'right mono' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
        if (cfg.onRowClick) PP.$$('tr[data-i]', tbody).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('button, a, input, select, label')) return; cfg.onRowClick(slice[Number(tr.dataset.i)]); }));
      }
      tfoot.innerHTML = cfg.footer && rows.length ? cfg.footer(rows) : '';
      PP.$('[data-count]', container).textContent = rows.length ? `Showing ${(state.page - 1) * state.pageSize + 1}–${Math.min(rows.length, state.page * state.pageSize)} of ${rows.length}` : '0 records';
      const pager = PP.$('[data-pager]', container);
      const nums = []; for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
      pager.innerHTML = `<button data-p="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>${nums.map((p) => (p === '…' ? '<span class="muted">…</span>' : `<button data-p="${p}" class="${p === state.page ? 'active' : ''}">${p}</button>`)).join('')}<button data-p="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
      PP.$$('[data-p]', pager).forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.p); draw(); }));
      PP.$$('[data-sort]', container).forEach((th) => { const a = PP.$('[data-arrow]', th); if (a) a.textContent = th.dataset.sort === state.sortKey ? (state.sortDir === 'asc' ? '▲' : '▼') : ''; });
      if (cfg.afterDraw) cfg.afterDraw(container, slice);
    }
    const qi = PP.$('[data-q]', container);
    if (qi) qi.addEventListener('input', () => { state.q = qi.value.trim(); state.page = 1; draw(); });
    PP.$$('[data-f]', container).forEach((s) => s.addEventListener('change', () => { state.filters[s.dataset.f] = s.value; state.page = 1; draw(); }));
    PP.$('[data-ps]', container).addEventListener('change', (e) => { state.pageSize = Number(e.target.value); state.page = 1; draw(); });
    PP.$$('[data-sort]', container).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; state.sortDir = state.sortKey === k && state.sortDir === 'asc' ? 'desc' : 'asc'; state.sortKey = k; draw(); }));
    const ex = PP.$('[data-export]', container);
    if (ex) ex.addEventListener('click', () => {
      const rows = filtered(); const cols = cfg.columns.filter((c) => c.label);
      PP.downloadCsv(`${cfg.exportName}-${PP.today()}.csv`, [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => (c.exportValue ? c.exportValue(r) : PP.stripHtml(c.render ? c.render(r) : r[c.key]))))]);
      PP.ui.toast(`Exported ${rows.length} rows to CSV`);
    });
    draw();
    return { refresh: draw, state };
  };

  /* ---------------------------------------------------------------- forms */
  PP.form = {
    /** Builds a labelled field. type: text|number|date|time|email|tel|select|textarea|checkbox|range */
    field(o) {
      const id = o.id || `f-${o.name}-${Math.random().toString(36).slice(2, 7)}`;
      const req = o.required ? 'required' : '';
      const attrs = `${o.attrs || ''} ${o.rule ? `data-rule="${o.rule}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} ${o.step != null ? `step="${o.step}"` : ''} ${o.readonly ? 'readonly' : ''} ${o.disabled ? 'disabled' : ''}`;
      const v = o.value == null ? '' : o.value;
      let control;
      if (o.type === 'select') control = `<select class="select" id="${id}" name="${o.name}" ${req} ${attrs}>${o.placeholder !== false ? `<option value="">${esc(o.placeholder || 'Select…')}</option>` : ''}${(o.options || []).map((op) => { const [val, lab] = Array.isArray(op) ? op : [op, op]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
      else if (o.type === 'textarea') control = `<textarea class="textarea" id="${id}" name="${o.name}" rows="${o.rows || 3}" placeholder="${esc(o.placeholder || '')}" ${req} ${attrs}>${esc(v)}</textarea>`;
      else if (o.type === 'checkbox') return `<div class="field ${o.full ? 'full' : ''}"><label class="check"><input type="checkbox" name="${o.name}" ${v ? 'checked' : ''} ${attrs}> ${esc(o.label)}</label>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
      else control = `<input class="${o.type === 'range' ? 'range' : 'input'}" id="${id}" name="${o.name}" type="${o.type || 'text'}" value="${esc(v)}" placeholder="${esc(o.placeholder || '')}" ${req} ${attrs}>`;
      return `<div class="field ${o.full ? 'full' : ''}" data-field="${o.name}"><label for="${id}">${esc(o.label)}${o.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}<div class="error" role="alert">${esc(o.error || 'This field is required.')}</div></div>`;
    },
    read(form) {
      const out = {};
      PP.$$('input[name], select[name], textarea[name]', form).forEach((el) => {
        if (el.type === 'checkbox') out[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
        else out[el.name] = el.value.trim();
      });
      return out;
    },
    setError(form, name, msg) {
      const f = PP.$(`[data-field="${name}"]`, form) || (PP.$(`[name="${name}"]`, form) || {}).closest && PP.$(`[name="${name}"]`, form).closest('.field');
      if (!f) return; f.classList.add('has-error'); const e = PP.$('.error', f); if (e && msg) e.textContent = msg;
    },
    clearErrors(form) { PP.$$('.field.has-error', form).forEach((f) => f.classList.remove('has-error')); },
    /** Validates required fields and data-rule (mobile|email|positive|nonneg). Returns true when valid. */
    validate(form) {
      PP.form.clearErrors(form); let ok = true; let first = null;
      PP.$$('input[name], select[name], textarea[name]', form).forEach((el) => {
        if (el.disabled) return;
        const v = (el.value || '').trim(); let msg = null;
        if (el.required && !v && el.type !== 'checkbox') msg = 'This field is required.';
        else if (v && el.dataset.rule === 'mobile' && !PP.isMobile(v)) msg = 'Enter a valid Bangladesh mobile number (01XXXXXXXXX).';
        else if (v && el.dataset.rule === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter a valid email address.';
        else if (v && el.dataset.rule === 'positive' && !(Number(v) > 0)) msg = 'Enter an amount greater than zero.';
        else if (v && el.dataset.rule === 'nonneg' && !(Number(v) >= 0)) msg = 'Enter zero or a positive amount.';
        if (msg) { ok = false; const f = el.closest('.field'); if (f) { f.classList.add('has-error'); const e = PP.$('.error', f); if (e) e.textContent = msg; } if (!first) first = el; }
      });
      if (first) first.focus();
      return ok;
    },
  };
  /** Shows a loading state on a button for a moment (simulated network), then runs fn. */
  PP.ui.busy = async function (btn, fn, ms) {
    if (btn) { btn.classList.add('is-loading'); btn.disabled = true; }
    try { await PP.sleep(ms == null ? 450 : ms); return await fn(); }
    finally { if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; } }
  };

  /* --------------------------------------------------------------- charts */
  PP.chart = {
    /** Smooth area/line chart. series: [{ name, values, color, fill }] */
    area(el, { labels, series, height, format }) {
      const W = 640; const H = height || 220; const pad = { l: 40, r: 12, t: 12, b: 28 };
      const max = Math.max(1, ...series.flatMap((s) => s.values)); const nice = Math.ceil(max / 5) * 5 || 5;
      const x = (i) => pad.l + (labels.length === 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
      const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
      const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const grid = [0, 1, 2, 3, 4, 5].map((k) => { const v = (nice * k) / 5; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6edf1"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#7a8a94">${format ? format(v) : Math.round(v)}</text>`; }).join('');
      const xl = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#7a8a94">${esc(l)}</text>`).join('');
      const body = series.map((s) => `${s.fill !== false ? `<path d="${path(s.values)} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="${s.color}" opacity=".14"/>` : ''}<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2.4"/>${s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} · ${esc(labels[i])}: ${format ? format(v) : v}</title></circle>`).join('')}`).join('');
      el.innerHTML = `<div class="row" style="justify-content:flex-end;gap:14px;margin-bottom:6px">${series.map((s) => `<span class="small muted"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:6px"></span>${esc(s.name)}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} chart">${grid}${xl}${body}</svg>`;
    },
    /** Vertical bars. groups: [{ name, values, color }] (stacked when stacked=true) */
    bars(el, { labels, groups, height, format, stacked }) {
      const W = 640; const H = height || 220; const pad = { l: 56, r: 12, t: 12, b: 28 };
      const totals = labels.map((_, i) => (stacked ? PP.sum(groups, (g) => g.values[i]) : Math.max(...groups.map((g) => g.values[i]))));
      const max = Math.max(1, ...totals); const nice = Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max / 4 || 1)))) * Math.pow(10, Math.floor(Math.log10(max / 4 || 1))) * 4 || 4;
      const bw = (W - pad.l - pad.r) / labels.length; const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
      const grid = [0, 1, 2, 3, 4].map((k) => { const v = (nice * k) / 4; return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e6edf1"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#7a8a94">${format ? format(v) : Math.round(v)}</text>`; }).join('');
      let bars = '';
      labels.forEach((l, i) => {
        const x0 = pad.l + i * bw; let acc = 0;
        groups.forEach((g, gi) => {
          const v = g.values[i] || 0; const inner = stacked ? bw * 0.56 : (bw * 0.7) / groups.length;
          const bx = stacked ? x0 + bw * 0.22 : x0 + bw * 0.15 + gi * inner;
          const top = stacked ? y(acc + v) : y(v); const bh = stacked ? y(acc) - y(acc + v) : y(0) - y(v);
          bars += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${(inner - 3).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="3" fill="${g.color}"><title>${esc(g.name)} · ${esc(l)}: ${format ? format(v) : v}</title></rect>`;
          if (stacked) acc += v;
        });
        bars += `<text x="${x0 + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#7a8a94">${esc(l)}</text>`;
      });
      el.innerHTML = `<div class="row" style="justify-content:flex-end;gap:14px;margin-bottom:6px">${groups.map((g) => `<span class="small muted"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${g.color};margin-right:6px"></span>${esc(g.name)}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(groups.map((g) => g.name).join(' and '))} chart">${grid}${bars}</svg>`;
    },
  };

  /* ------------------------------------------------------------- dropdown */
  PP.ui.dropdown = function (anchor, html, onOpen) {
    const host = anchor.closest('.rel') || anchor.parentElement;
    const existing = PP.$('.dropdown', host); if (existing) { existing.remove(); return; }
    PP.$$('.dropdown').forEach((d) => d.remove());
    const dd = document.createElement('div'); dd.className = 'dropdown'; dd.innerHTML = html; host.appendChild(dd);
    const off = (e) => { if (!dd.contains(e.target) && !anchor.contains(e.target)) { dd.remove(); document.removeEventListener('mousedown', off); } };
    setTimeout(() => document.addEventListener('mousedown', off), 0);
    if (onOpen) onOpen(dd);
    return dd;
  };
})();
