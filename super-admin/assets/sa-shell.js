/* Physio Point — vendor Super Admin shell (sidebar, top bar, prototype controls) and boot. Loaded last.
   Modelled on assets/js/shell.js; reuses PP.route / PP.render / PP.ui.*. */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;

  SA.NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', href: '#/dashboard', perm: 'dashboard.view' },
    { id: 'customers', label: 'Customers', icon: 'building', perm: 'customers.view', children: [
      { label: 'All customers', href: '#/customers' },
      { label: 'Onboard a customer', href: '#/onboarding', perm: 'onboarding.run' },
    ] },
    { id: 'plans', label: 'Plans & entitlements', icon: 'layers', perm: 'customers.view', children: [
      { label: 'Plans & subscriptions', href: '#/plans' },
      { label: 'Entitlements', href: '#/entitlements' },
    ] },
    { id: 'catalog', label: 'Configuration', icon: 'clipboard', perm: 'customers.view', children: [
      { label: 'Business types', href: '#/catalog/business-types' },
      { label: 'Professional types', href: '#/catalog/professional-types' },
      { label: 'Clinical form templates', href: '#/catalog/forms' },
    ] },
    { id: 'domains', label: 'Domains & branding', icon: 'globe', perm: 'customers.view', children: [
      { label: 'Domains', href: '#/domains', badge: () => (PP.db.domains || []).filter((d) => d.status !== 'Verified').length },
      { label: 'Branding', href: '#/branding' },
    ] },
    { id: 'licences', label: 'Licences', icon: 'shield', href: '#/licences', perm: 'customers.view' },
    { id: 'releases', label: 'Releases & fleet', icon: 'activity', perm: 'customers.view', children: [
      { label: 'Releases & updates', href: '#/releases' },
      { label: 'Fleet monitoring', href: '#/fleet', badge: () => (PP.db.deployments || []).filter((d) => d.health === 'Down' || d.updateStatus === 'Failed').length },
    ] },
    { id: 'billing', label: 'Vendor billing', icon: 'receipt', href: '#/billing', perm: 'customers.view' },
    { id: 'support', label: 'Support', icon: 'mail', perm: 'customers.view', children: [
      { label: 'Ticket inbox', href: '#/support', badge: () => (PP.db.tickets || []).filter((t) => t.status === 'Open').length },
      { label: 'Announcements', href: '#/support/announcements' },
      { label: 'Remote support log', href: '#/support/remote' },
    ] },
    { id: 'demo', label: 'Demo & trial', icon: 'zap', perm: 'customers.view', children: [
      { label: 'Sign-up leads', href: '#/demo', badge: () => (PP.db.leads || []).filter((l) => l.status === 'New').length },
      { label: 'Sandboxes', href: '#/demo/sandboxes' },
    ] },
    { id: 'admin', label: 'Administration', icon: 'settings', perm: 'dashboard.view', children: [
      { label: 'Vendor staff & roles', href: '#/staff' },
      { label: 'Vendor audit log', href: '#/audit' },
    ] },
  ];
  const visible = (item) => !item.perm || PP.can(item.perm);

  function navHtml() {
    return SA.NAV.filter(visible).map((item) => {
      if (!item.children) return `<a class="nav-item" href="${item.href}" data-nav="${item.href}" title="${esc(item.label)}">${PP.icon(item.icon)}<span>${esc(item.label)}</span></a>`;
      const kids = item.children.filter(visible); if (!kids.length) return '';
      return `<details class="nav-group" data-group="${item.id}"><summary title="${esc(item.label)}">${PP.icon(item.icon)}<span>${esc(item.label)}</span>${PP.icon('chevR', 'class="chev"')}</summary>
        <div class="nav-sub">${kids.map((c) => { const n = c.badge ? c.badge() : 0; return `<a href="${c.href}" data-nav="${c.href}"><span>${esc(c.label)}</span>${n ? `<span class="count-pill" data-badge="${c.href}">${n}</span>` : ''}</a>`; }).join('')}</div></details>`;
    }).join('');
  }

  function renderShell() {
    const s = PP.db.settings; const u = PP.currentUser(); const role = PP.db.roles.find((r) => r.id === u.role);
    const unread = PP.db.notifications.filter((n) => !n.read).length;
    PP.$('#app').innerHTML = `
      <div class="app" id="app-root">
        <aside class="sidebar" aria-label="Vendor navigation">
          <div class="brand"><div class="logo">${PP.logoSvg}</div><div><div class="name">${esc(s.vendorName)}</div><div class="tag">Super Admin · control plane</div><span class="sa-vendor-chip">Vendor console</span></div></div>
          <nav class="nav" id="nav">${navHtml()}</nav>
          <div class="sidebar-foot">Prototype · fictional data only<br>No patient data in the control plane</div>
        </aside>
        <div class="scrim" data-scrim></div>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-toggle" data-menu aria-label="Toggle navigation">${PP.icon('menu')}</button>
            <div class="page-title" id="page-title"></div>
            <div class="spacer"></div>
            <div class="sa-search rel">${PP.icon('search')}<input class="input" type="search" data-gsearch placeholder="Find a customer, tenant ID or domain" aria-label="Find a customer"></div>
            <span class="sa-env" title="Prototype: there is no real control plane">${PP.icon('shield')} Control plane</span>
            <div class="tb-group hide-sm" title="Prototype control: see the console as another vendor role (PD-033)"><span class="tb-label">View as</span>
              <select class="tb-select" data-viewas aria-label="View as vendor staff">${PP.db.users.filter((x) => x.status === 'Active').map((x) => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.name)} · ${esc((PP.db.roles.find((r) => r.id === x.role) || {}).name || x.role)}</option>`).join('')}</select></div>
            <div class="rel"><button class="icon-btn" data-bell aria-label="Notifications">${PP.icon('bell')}${unread ? `<span class="dot">${unread}</span>` : ''}</button></div>
            <div class="rel"><button class="user-chip" data-user aria-label="Account menu"><span class="avatar">${esc(PP.initials(u.name))}</span><span class="who"><b>${esc(u.name)}</b><span>${esc(role ? role.name : '')}</span></span>${PP.icon('chevD', 'style="width:14px;height:14px"')}</button></div>
          </header>
          <main class="view" id="view" tabindex="-1"></main>
          <div class="proto-ribbon no-print">Physio Point Super Admin prototype · fictional data stored in this browser only · not a production system · no real licences are issued</div>
        </div>
      </div>`;
    bindShell();
  }

  function setActiveNav() {
    const path = '#' + PP.currentPath(); let best = null;
    PP.$$('[data-nav]').forEach((a) => { const h = a.dataset.nav; if ((path === h || path.startsWith(h + '/')) && (!best || h.length > best.dataset.nav.length)) best = a; });
    PP.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a === best));
    PP.$$('.nav-group').forEach((g) => { const has = best && g.contains(best); g.classList.toggle('active', !!has); if (has) g.open = true; });
  }

  function bindShell() {
    const root = PP.$('#app-root');
    PP.$('[data-menu]').addEventListener('click', () => root.classList.toggle('nav-open'));
    PP.$('[data-scrim]').addEventListener('click', () => root.classList.remove('nav-open'));
    PP.$('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) root.classList.remove('nav-open'); });
    // global customer search
    const gi = PP.$('[data-gsearch]'); const host = gi.parentElement;
    const close = () => { const r = PP.$('.sa-search-results', host); if (r) r.remove(); };
    gi.addEventListener('input', () => {
      close(); const q = gi.value.trim().toLowerCase(); if (!q) return;
      const hits = PP.db.customers.filter((c) => [c.name, c.id, c.tenantId, c.city, ...SA.domainsOf(c.id).map((d) => d.host)].join(' ').toLowerCase().includes(q)).slice(0, 8);
      const div = document.createElement('div'); div.className = 'sa-search-results';
      div.innerHTML = hits.length ? hits.map((c) => `<a href="#/customers/${c.id}"><span><b>${esc(c.name)}</b><span class="sub small muted" style="display:block">${esc(c.id)} · ${esc((SA.primaryDomain(c.id) || {}).host || '')}</span></span>${SA.badge(SA.state(c))}</a>`).join('') : '<div class="small muted" style="padding:10px">No customer matches.</div>';
      host.appendChild(div);
      PP.$$('a', div).forEach((a) => a.addEventListener('click', () => { gi.value = ''; close(); }));
    });
    gi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = PP.$('.sa-search-results a', host); if (a) { location.hash = a.getAttribute('href'); gi.value = ''; close(); } } if (e.key === 'Escape') { gi.value = ''; close(); } });
    document.addEventListener('mousedown', (e) => { if (!host.contains(e.target)) close(); });
    PP.$('[data-viewas]').addEventListener('change', (e) => {
      PP.db.session.userId = e.target.value; PP.save(); renderShell();
      const m = PP.match(PP.currentPath());
      if (m && m.route.perm && !PP.can(m.route.perm)) location.hash = '#/dashboard'; else { setActiveNav(); PP.render(); }
      PP.ui.toast(`Now viewing as ${esc(PP.currentUser().name)}. Menus and actions follow this role (PD-033 pending; in production every action is checked on the server).`, 'info', 4200);
    });
    PP.$('[data-bell]').addEventListener('click', (e) => {
      PP.ui.dropdown(e.currentTarget, `<div class="dd-head row between"><b>Alerts</b><button class="btn btn-ghost btn-sm" data-readall>Mark all read</button></div>
        ${PP.db.notifications.slice(0, 8).map((n) => `<a class="notif-item ${n.read ? '' : 'unread'}" href="${n.link || '#/dashboard'}" data-ntf="${n.id}"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.text)} · ${PP.fmt.stamp(n.at)}</div></a>`).join('') || '<div class="empty small">No alerts</div>'}`, (dd) => {
        PP.$('[data-readall]', dd).addEventListener('click', () => { PP.db.notifications.forEach((n) => { n.read = true; }); PP.save(); PP.refreshShell(); });
        PP.$$('[data-ntf]', dd).forEach((a) => a.addEventListener('click', () => { const n = PP.db.notifications.find((x) => x.id === a.dataset.ntf); n.read = true; PP.save(); setTimeout(() => { renderShell(); setActiveNav(); }, 0); }));
      });
    });
    PP.$('[data-user]').addEventListener('click', (e) => {
      const u = PP.currentUser();
      PP.ui.dropdown(e.currentTarget, `<div class="dd-head"><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)} · two-step sign-in on</div></div>
        <a href="#/staff">${PP.icon('users', 'style="width:16px"')} Vendor staff & roles</a>
        <a href="../index.html">${PP.icon('layers', 'style="width:16px"')} Prototype hub</a>
        <a href="../customer-web/app.html" target="_blank">${PP.icon('building', 'style="width:16px"')} Open the clinic workspace prototype</a>
        <button class="dd-item" data-reset>${PP.icon('refresh', 'style="width:16px"')} Reset control-plane demo data</button>
        <button class="dd-item" data-logout>${PP.icon('logout', 'style="width:16px"')} Sign out</button>`, (dd) => {
        PP.$('[data-reset]', dd).addEventListener('click', async () => {
          dd.remove();
          const ok = await PP.ui.confirm({ title: 'Reset control-plane data?', message: 'All changes made in this Super Admin prototype are replaced with the original sample data. The clinic workspace prototype is not affected (separate store).', confirmLabel: 'Reset', danger: true });
          if (!ok) return; const uid = PP.db.session.userId; PP.resetData(); PP.db.session.userId = uid; PP.db.session.mfaAt = PP.nowStamp(); PP.save(); PP.applyBranding(); PP.refreshShell(); PP.ui.toast('Control-plane demo data reset');
        });
        PP.$('[data-logout]', dd).addEventListener('click', () => { PP.audit('Signed out', u.id, u.email); PP.db.session.userId = null; PP.db.session.mfaAt = null; PP.save(); location.href = 'login.html'; });
      });
    });
  }

  /** Rebuilds the sidebar and top bar, then re-renders the current page. */
  PP.refreshShell = function () { renderShell(); setActiveNav(); PP.render(); };
  SA.refreshBadges = function () {
    SA.NAV.forEach((item) => (item.children || []).forEach((c) => {
      if (!c.badge) return; const a = PP.$(`[data-nav="${c.href}"]`); if (!a) return;
      const n = c.badge(); const pill = PP.$('.count-pill', a);
      if (n && pill) pill.textContent = n; else if (n && !pill) a.insertAdjacentHTML('beforeend', `<span class="count-pill">${n}</span>`); else if (!n && pill) pill.remove();
    }));
    const bell = PP.$('[data-bell]'); if (bell) { const unread = PP.db.notifications.filter((n) => !n.read).length; const dot = PP.$('.dot', bell); if (unread && dot) dot.textContent = unread; else if (unread && !dot) bell.insertAdjacentHTML('beforeend', `<span class="dot">${unread}</span>`); else if (!unread && dot) dot.remove(); }
  };
  PP.on('title', (t) => { const el = PP.$('#page-title'); if (el) el.textContent = t; });
  PP.on('route:change', () => setActiveNav());
  PP.on('data:changed', () => SA.refreshBadges());

  PP.boot = function () {
    PP.load();
    const u = PP.currentUser();
    if (!u || u.status !== 'Active' || !PP.db.session.mfaAt) { location.replace('login.html'); return; }
    PP.applyBranding();
    renderShell();
    window.addEventListener('hashchange', PP.render);
    if (!location.hash) location.replace('#/dashboard');
    PP.render();
    let syncTimer = null;
    window.addEventListener('storage', (e) => {
      if (e.key !== PP.STORE_KEY || !e.newValue || e.newValue === PP._lastJson) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        PP.load();
        if (!PP.currentUser()) { location.replace('login.html'); return; }
        if (PP.$('.modal-backdrop')) { SA.refreshBadges(); PP.ui.toast('Data changed in another tab. Your open dialog was kept.', 'info', 4000); } else PP.refreshShell();
      }, 300);
    });
  };
})();
