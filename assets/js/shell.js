/* Physio Point HTML prototype — app shell (sidebar, top bar, prototype controls) and boot. Loaded last. */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;

  // Navigation (original blueprint order, D-009). Labels for professionals come from terminology (D-010).
  PP.NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', href: '#/dashboard', perm: 'dashboard.view' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar', perm: 'appointments.view', children: [
      { label: () => (PP.ownProId() ? 'My Appointments' : 'All Appointments'), href: '#/appointments' },
      { label: 'Calendar View', href: '#/appointments/calendar' },
      { label: 'Online Requests', href: '#/appointments/requests', perm: 'requests.review', badge: () => PP.db.requests.filter((r) => r.status === 'Pending').length },
      { label: 'Add Appointment', href: '#/appointments/new', perm: 'appointments.manage' },
      { label: 'Queue & Check-in', href: '#/queue', perm: 'queue.manage' },
    ] },
    { id: 'patients', label: 'Patients', icon: 'users', perm: 'patients.view', children: [
      { label: () => (PP.ownProId('patients') ? 'My Patients' : 'Patient Directory'), href: '#/patients' },
      { label: 'Packages & Memberships', href: '#/packages', perm: 'packages.manage' },
      { label: 'Referrals', href: '#/referrals', perm: 'referrals.manage' },
      { label: 'Feedback', href: '#/feedback', perm: 'feedback.view' },
    ] },
    { id: 'clinical', label: 'Prescriptions', icon: 'rx', perm: 'clinical.view', children: [
      { label: 'Prescriptions', href: '#/prescriptions' },
      { label: 'New Clinical Visit', href: '#/visits/new', perm: 'clinical.write' },
      { label: 'Condition Templates', href: '#/prescriptions/templates' },
      { label: 'Session Plans', href: '#/session-plans' },
      { label: 'Exercise Library', href: '#/exercises' },
      { label: 'Dental Chart', href: '#/dental', when: () => PP.db.settings.businessType === 'dental' },
    ] },
    { id: 'lab', label: 'Lab & Diagnostics', icon: 'activity', perm: 'lab.manage', children: [
      { label: 'Lab Orders', href: '#/lab' },
      { label: 'Test Catalogue', href: '#/lab/tests' },
    ] },
    { id: 'cashflow', label: 'Cash Flow', icon: 'wallet', perm: 'billing.view', children: [
      { label: 'Invoices & Dues', href: '#/billing/invoices' },
      { label: 'New Invoice', href: '#/billing/new', perm: 'billing.manage' },
      { label: 'Income & Expenses', href: '#/finance', perm: 'finance.manage' },
      { label: 'Daily Cash Closing', href: '#/finance/closing', perm: 'finance.close' },
      { label: 'Commissions', href: '#/commissions', perm: 'commissions.manage' },
      { label: 'Payroll', href: '#/payroll', perm: 'payroll.manage' },
    ] },
    { id: 'inventory', label: 'Inventory', icon: 'layers', perm: 'inventory.manage', children: [
      { label: 'Items & Stock', href: '#/inventory' },
      { label: 'Suppliers', href: '#/inventory/suppliers' },
    ] },
    { id: 'myreferrals', label: 'My Referrals', icon: 'send', href: '#/referrals', perm: 'referrals.read', when: () => PP.scopeOf('referrals') === 'own' },
    { id: 'mycommission', label: 'My Commission', icon: 'coins', href: '#/commissions', perm: 'commissions.view_own', hideIf: 'commissions.manage' },
    { id: 'services', label: 'Services & Pricing', icon: 'tag', href: '#/services', perm: 'services.manage' },
    { id: 'professionals', label: () => PP.t('professionals'), icon: 'stethoscope', perm: 'professionals.view', children: [
      { label: () => `${PP.t('professional')} Directory`, href: '#/professionals' },
      { label: 'Availability & Leave', href: '#/professionals/availability' },
    ] },
    { id: 'reports', label: 'Reports', icon: 'chart', perm: 'reports.view', children: [
      { label: 'Collection Report', href: '#/reports/collections' },
      { label: 'Financial Summary', href: '#/reports/finance' },
      { label: 'Appointment Report', href: '#/reports/appointments' },
    ] },
    { id: 'settings', label: 'Settings', icon: 'settings', perm: 'settings.manage', children: [
      { label: 'Clinic Settings', href: '#/settings' },
      { label: 'Users & Roles', href: '#/settings/users', perm: 'users.manage' },
      { label: 'Notifications', href: '#/settings/notifications' },
      { label: 'Audit Log', href: '#/settings/audit', perm: 'audit.view' },
    ] },
    { id: 'support', label: 'Help & Support', icon: 'info', href: '#/support', perm: 'support.use' },
  ];
  const lbl = (x) => (typeof x === 'function' ? x() : x);
  /** First page this user may open (External Referrer has no dashboard, for example). */
  PP.homeHash = () => { for (const it of PP.NAV) { if (!visible(it)) continue; if (it.href) return it.href; const c = (it.children || []).find(visible); if (c) return c.href; } return '#/dashboard'; };
  const visible = (item) => (!item.perm || PP.can(item.perm)) && !(item.hideIf && PP.can(item.hideIf)) && (!item.when || item.when());

  function navHtml() {
    return PP.NAV.filter(visible).map((item) => {
      if (!item.children) return `<a class="nav-item" href="${item.href}" data-nav="${item.href}" title="${esc(lbl(item.label))}">${PP.icon(item.icon)}<span>${esc(lbl(item.label))}</span></a>`;
      const kids = item.children.filter(visible);
      if (!kids.length) return '';
      return `<details class="nav-group" data-group="${item.id}"><summary title="${esc(lbl(item.label))}">${PP.icon(item.icon)}<span>${esc(lbl(item.label))}</span>${PP.icon('chevR', 'class="chev"')}</summary>
        <div class="nav-sub">${kids.map((c) => { const n = c.badge ? c.badge() : 0; return `<a href="${c.href}" data-nav="${c.href}"><span>${esc(lbl(c.label))}</span>${n ? `<span class="count-pill">${n}</span>` : ''}</a>`; }).join('')}</div></details>`;
    }).join('');
  }

  function renderShell() {
    const s = PP.db.settings; const u = PP.currentUser(); const role = PP.db.roles.find((r) => r.id === u.role);
    const isAdmin = !!role && role.permissions.includes('*');
    const showBranch = isAdmin || (u.branchIds || []).length > 1;
    const unread = PP.db.notifications.filter((n) => !n.read).length;
    const lic = s.licence || {};
    PP.$('#app').innerHTML = `
      <div class="app" id="app-root">
        <aside class="sidebar" aria-label="Main navigation">
          <div class="brand"><div class="logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : PP.logoSvg}</div><div><div class="name">${esc(s.clinicName)}</div><div class="tag">${esc(s.tagline)}</div></div></div>
          <nav class="nav" id="nav">${navHtml()}</nav>
          <div class="sidebar-art" aria-hidden="true"><svg viewBox="0 0 120 80" fill="none" stroke="#bfe3e0" stroke-width="2" stroke-linecap="round"><circle cx="70" cy="14" r="7"/><path d="M70 21v18l-18 10M70 39l14 12"/><path d="M20 62h80M28 62v12M92 62v12M34 56h46"/><path d="M40 56c4-8 10-10 18-8"/></svg></div>
          <div class="sidebar-foot">Prototype · mock data only<br>Plan: ${esc(lic.plan || '—')} · Licence ${esc(lic.state || '—')}</div>
        </aside>
        <div class="scrim" data-scrim></div>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-toggle" data-menu aria-label="Toggle navigation">${PP.icon('menu')}</button>
            <div class="page-title" id="page-title"></div>
            <div class="spacer"></div>
            <div class="tb-group hide-md" ${showBranch ? '' : 'hidden style="display:none"'}><span class="tb-label">Branch</span>
              <select class="tb-select" data-branch aria-label="Active branch"><option value="ALL">All branches</option>${PP.db.branches.filter((b) => PP.isOrgWide() || u.branchIds.includes(b.id)).map((b) => `<option value="${b.id}" ${PP.activeBranchId() === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
            <div class="tb-group hide-md" ${isAdmin ? '' : 'hidden style="display:none"'} title="Prototype control: shows how terminology changes with the business type"><span class="tb-label">Demo business type</span>
              <select class="tb-select" data-btype aria-label="Demo business type">${Object.entries(PP.businessTypes).map(([k, v]) => `<option value="${k}" ${s.businessType === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
            <div class="tb-group hide-sm" ${isAdmin ? '' : 'hidden style="display:none"'} title="Prototype control: see the app as another role"><span class="tb-label">View as</span>
              <select class="tb-select" data-viewas aria-label="View as user">${PP.db.users.filter((x) => x.status === 'Active').map((x) => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.name)} · ${esc((PP.db.roles.find((r) => r.id === x.role) || {}).name || x.role)}</option>`).join('')}</select></div>
            <div class="rel"><button class="icon-btn" data-bell aria-label="Notifications">${PP.icon('bell')}${unread ? `<span class="dot">${unread}</span>` : ''}</button></div>
            <div class="rel"><button class="user-chip" data-user aria-label="Account menu"><span class="avatar">${esc(PP.initials(u.name))}</span><span class="who"><b>${esc(u.name)}</b><span>${esc(role ? role.name : '')}</span></span>${PP.icon('chevD', 'style="width:14px;height:14px"')}</button></div>
          </header>
          ${lic.state && lic.state !== 'Active' ? `<div class="licence-banner">${PP.icon('alert')} Licence ${esc(lic.state)}. ${lic.state === 'Grace' ? 'Everything works; please renew soon.' : 'Read-only mode: records stay viewable and exportable; new entries are paused (D-017).'}</div>` : ''}
          <main class="view" id="view" tabindex="-1"></main>
          <div class="proto-ribbon no-print">Physio Point HTML prototype · fictional data stored in this browser only · not a production system</div>
        </div>
      </div>`;
    bindShell();
  }

  function setActiveNav() {
    const path = '#' + PP.currentPath();
    let best = null;
    PP.$$('[data-nav]').forEach((a) => { const h = a.dataset.nav; if ((path === h || path.startsWith(h + '/')) && (!best || h.length > best.dataset.nav.length)) best = a; });
    PP.$$('[data-nav]').forEach((a) => a.classList.toggle('active', a === best));
    PP.$$('.nav-group').forEach((g) => { const has = best && g.contains(best); g.classList.toggle('active', !!has); if (has) g.open = true; });
  }

  function bindShell() {
    const root = PP.$('#app-root');
    PP.$('[data-menu]').addEventListener('click', () => root.classList.toggle('nav-open'));
    PP.$('[data-scrim]').addEventListener('click', () => root.classList.remove('nav-open'));
    PP.$('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) root.classList.remove('nav-open'); });
    PP.$('[data-branch]').addEventListener('change', (e) => { PP.db.session.branchId = e.target.value; PP.save(); PP.ui.toast(`Showing ${e.target.value === 'ALL' ? 'all branches' : PP.branchName(e.target.value)}`, 'info'); PP.render(); });
    PP.$('[data-btype]').addEventListener('change', (e) => {
      PP.db.settings.businessType = e.target.value; PP.db.settings.terminology = {}; PP.save();
      renderShell(); setActiveNav(); PP.render();
      PP.ui.toast(`Terminology switched: professionals are now called “${PP.t('professionals')}”. No code change needed (D-010).`, 'info', 4200);
    });
    PP.$('[data-viewas]').addEventListener('change', (e) => {
      PP.db.session.userId = e.target.value; PP.db.session.branchId = 'ALL'; PP.save(); renderShell();
      const route = PP.match(PP.currentPath());
      if (route && route.route.perm && !PP.can(route.route.perm)) location.hash = PP.homeHash(); else { setActiveNav(); PP.render(); }
      PP.ui.toast(`Now viewing as ${esc(PP.currentUser().name)}. Menus and pages follow this role’s permissions.`, 'info');
    });
    PP.$('[data-bell]').addEventListener('click', (e) => {
      PP.ui.dropdown(e.currentTarget, `<div class="dd-head row between"><b>Notifications</b><button class="btn btn-ghost btn-sm" data-readall>Mark all read</button></div>
        ${PP.db.notifications.slice(0, 8).map((n) => `<a class="notif-item ${n.read ? '' : 'unread'}" href="${n.link || '#/dashboard'}" data-ntf="${n.id}"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.text)} · ${PP.fmt.stamp(n.at)}</div></a>`).join('') || '<div class="empty small">No notifications</div>'}`, (dd) => {
        PP.$('[data-readall]', dd).addEventListener('click', () => { PP.db.notifications.forEach((n) => { n.read = true; }); PP.save(); renderShell(); setActiveNav(); PP.render(); });
        PP.$$('[data-ntf]', dd).forEach((a) => a.addEventListener('click', () => { const n = PP.db.notifications.find((x) => x.id === a.dataset.ntf); n.read = true; PP.save(); setTimeout(() => { renderShell(); setActiveNav(); }, 0); }));
      });
    });
    PP.$('[data-user]').addEventListener('click', (e) => {
      const u = PP.currentUser();
      PP.ui.dropdown(e.currentTarget, `<div class="dd-head"><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)}</div></div>
        <a href="#/settings">${PP.icon('settings', 'style="width:16px"')} Clinic settings</a>
        <a href="../index.html">${PP.icon('layers', 'style="width:16px"')} Prototype hub</a>
        <a href="booking.html" target="_blank">${PP.icon('globe', 'style="width:16px"')} Open public booking page</a>
        <button class="dd-item" data-reset>${PP.icon('refresh', 'style="width:16px"')} Reset demo data</button>
        <a href="login.html" data-logout>${PP.icon('logout', 'style="width:16px"')} Sign out</a>`, (dd) => {
        PP.$('[data-reset]', dd).addEventListener('click', async () => {
          dd.remove();
          const ok = await PP.ui.confirm({ title: 'Reset demo data?', message: 'All changes you made in this prototype will be replaced with the original sample data.', confirmLabel: 'Reset', danger: true });
          if (!ok) return; PP.resetData(); PP.applyBranding(); renderShell(); setActiveNav(); PP.render(); PP.ui.toast('Demo data reset');
        });
      });
    });
  }

  /** Rebuilds the sidebar and top bar, then re-renders the current page (the shell owns #view). */
  PP.refreshShell = function () { renderShell(); setActiveNav(); PP.render(); };
  PP.on('title', (t) => { const el = PP.$('#page-title'); if (el) el.textContent = t; });
  PP.on('route:change', () => setActiveNav());
  PP.on('data:changed', () => {
    // keep the Online Requests badge and bell count in sync without re-rendering the page
    PP.$$('[data-nav="#/appointments/requests"]').forEach((a) => { const n = PP.db.requests.filter((r) => r.status === 'Pending').length; const pill = PP.$('.count-pill', a); if (n && pill) pill.textContent = n; else if (n && !pill) a.insertAdjacentHTML('beforeend', `<span class="count-pill">${n}</span>`); else if (!n && pill) pill.remove(); });
    const bell = PP.$('[data-bell]'); if (bell) { const unread = PP.db.notifications.filter((n) => !n.read).length; const dot = PP.$('.dot', bell); if (unread && dot) dot.textContent = unread; else if (unread && !dot) bell.insertAdjacentHTML('beforeend', `<span class="dot">${unread}</span>`); else if (!unread && dot) dot.remove(); }
  });

  PP.boot = function () {
    PP.load();
    if (!PP.currentUser()) { PP.db.session.userId = 'USR-1'; PP.save(); }
    PP.applyBranding();
    renderShell();
    window.addEventListener('hashchange', PP.render);
    if (!location.hash || (location.hash === '#/dashboard' && !PP.can('dashboard.view'))) location.replace(PP.homeHash());
    PP.render();
    // Pick up changes made on the public booking page in another tab.
    let syncTimer = null;
    window.addEventListener('storage', (e) => {
      if (e.key !== PP.STORE_KEY || !e.newValue || e.newValue === PP._lastJson) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        PP.load();
        const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#view, .modal') && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
        if (editing || PP.$('.modal-backdrop')) { PP.emit('data:changed'); PP.ui.toast('Data changed in another tab. Your open form was kept; reload the page to see the changes.', 'info', 4500); }
        else PP.refreshShell();
      }, 300);
    });
  };
})();
