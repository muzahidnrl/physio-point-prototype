/* Super Admin — dashboard, customer list, customer detail (tabs) and lifecycle dialogs (activate / suspend / reactivate).
   Licence states follow D-017: Active → Grace → Read-only. Nothing is ever deleted; read-only keeps view and export. */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;

  /* ------------------------------------------------------------------ helpers */
  const logoBox = (c, size) => { const b = c.branding || {}; return `<div class="sa-logo-box" style="background:${esc(b.primary || '#083E44')};${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px` : ''}">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : esc(PP.initials(c.name))}</div>`; };
  const licEnd = (c) => { const l = SA.licenceOf(c.id); return l ? l.end : null; };
  const mrrOf = (c) => { const p = SA.plan(c.planId); if (!p) return 0; return c.billingCycle === 'Monthly' ? p.priceMonthly : PP.round2(p.priceYearly / 12); };
  SA.mrr = () => PP.round2(PP.sum(PP.db.customers.filter((c) => ['Active', 'Grace'].includes(SA.state(c))), mrrOf));
  const issuesOf = (dep) => {
    const out = [];
    if (!dep || dep.health === 'Not installed') return out;
    if (dep.updateStatus === 'Failed' || dep.updateStatus === 'Rolled back') out.push(`Update ${dep.updateStatus.toLowerCase()}`);
    if (dep.lastBackup && PP.diffDays(dep.lastBackup.slice(0, 10), PP.today()) > 7) out.push(`Backup ${PP.diffDays(dep.lastBackup.slice(0, 10), PP.today())} days old`);
    if (dep.lastHeartbeat && (Date.now() - new Date(dep.lastHeartbeat).getTime()) > 24 * 3600000) out.push(`No heartbeat for ${SA.ago(dep.lastHeartbeat).replace(' ago', '')}`);
    if (dep.health === 'Down') out.push('Deployment down');
    return out;
  };
  SA.deploymentIssues = issuesOf;
  const STATE_TONES = { Active: 'positive', Grace: 'warning', 'Read-only': 'error', Suspended: 'error', Trial: 'info', Onboarding: 'lavender' };

  /* ------------------------------------------------------------------ lifecycle (MP §3, D-017) */
  SA.lifecycle = {
    async suspend(c) {
      if (!PP.can('customers.lifecycle')) { PP.ui.toast('Your role cannot change the customer lifecycle.', 'error'); return false; }
      const r = await PP.ui.confirm({
        title: `Suspend ${esc(c.name)}?`, danger: true, confirmLabel: 'Suspend customer', reasonLabel: 'Reason (recorded in the audit log)', reasonRequired: true,
        message: `${PP.ui.alert('warning', 'Suspension <b>never deletes or encrypts data</b> and never blocks login, reading or export (D-017). The deployment switches to <b>read-only mode</b> at its next licence validation: records stay viewable, printable and exportable; new clinical and financial entries are paused.')}`,
      });
      if (!r) return false;
      c.status = 'Suspended'; c.suspendReason = r.reason; c.suspendedAt = PP.nowStamp();
      PP.audit('Customer suspended', c.id, r.reason); PP.notify(`Suspended: ${c.name}`, r.reason, `#/customers/${c.id}`); PP.save();
      PP.ui.toast(`${esc(c.name)} suspended. The deployment moves to read-only mode; no data is deleted.`, 'warning', 4200);
      return true;
    },
    async reactivate(c) {
      if (!PP.can('customers.lifecycle')) { PP.ui.toast('Your role cannot change the customer lifecycle.', 'error'); return false; }
      const ls = SA.licenceState(SA.licenceOf(c.id));
      const r = await PP.ui.confirm({
        title: `Reactivate ${esc(c.name)}?`, confirmLabel: 'Reactivate', reasonLabel: 'Reason', reasonRequired: true,
        message: `Full use returns at the deployment’s next licence validation (or when the customer presses “Check licence now”).${ls === 'Expired' || ls === 'Revoked' ? PP.ui.alert('warning', `The licence is <b>${esc(ls)}</b>, so the customer stays read-only until a licence is renewed or issued.`) : ''}`,
      });
      if (!r) return false;
      c.status = 'Active'; c.suspendReason = ''; c.reactivatedAt = PP.nowStamp();
      PP.audit('Customer reactivated', c.id, r.reason); PP.save();
      PP.ui.toast(`${esc(c.name)} reactivated`);
      return true;
    },
    /** Activation of an onboarded customer: domain verified + deployment registered (simulated). */
    activate(c) {
      return new Promise((resolve) => {
        if (!PP.can('customers.lifecycle')) { PP.ui.toast('Your role cannot activate customers. A SaaS Admin, License Manager or Super Admin activates them.', 'error'); resolve(false); return; }
        const dom = SA.primaryDomain(c.id); const lic = SA.licenceOf(c.id); const set = SA.latestSet(c.id);
        const checks = [
          { ok: !!dom && dom.status === 'Verified', label: 'Domain verified (DNS TXT challenge)', hint: dom ? `${esc(dom.host)} · ${esc(dom.status)}` : 'No domain', link: '#/domains' },
          { ok: !!lic && SA.licenceState(lic) === 'Active', label: 'Licence issued and bound to the domain', hint: lic ? esc(lic.key) : 'No licence', link: '#/licences' },
          { ok: !!set, label: 'Signed entitlement and configuration snapshot', hint: set ? `Version ${set.version} · ${esc(SA.shortSig(set.signature))}` : 'Not published', link: `#/entitlements/${c.id}` },
        ];
        const blocked = checks.some((x) => !x.ok);
        const m = PP.ui.modal({
          title: `Activate ${esc(c.name)}`,
          body: `<p style="margin-top:0">Activation happens when the deployment on the customer’s server registers with the control plane and pulls its signed licence and snapshots (deployment-architecture.md §3).</p>
            <ul class="list">${checks.map((x) => `<li>${PP.icon(x.ok ? 'checkCircle' : 'alert', `style="width:20px;color:var(--pp-${x.ok ? 'positive' : 'error'}-fg)"`)}<div class="grow"><b>${x.label}</b><span class="sub small muted" style="display:block">${x.hint}</span></div>${x.ok ? '' : `<a class="btn btn-sm" href="${x.link}" data-close>Fix</a>`}</li>`).join('')}</ul>
            ${blocked ? PP.ui.alert('error', 'Complete the missing steps first. The customer stays in Onboarding.') : PP.ui.alert('info', 'Prototype: this simulates the installer finishing on the customer’s server (identity key generated, first heartbeat, first backup).')}`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, blocked ? null : { label: 'Simulate install and activate', kind: 'primary', onClick: async () => {
            await PP.sleep(700);
            const dep = SA.deployment(c.id); const ch = c.channel || 'stable';
            if (dep) Object.assign(dep, { version: PP.db.channels[ch], channel: ch, updateStatus: 'Up to date', health: 'Healthy', lastHeartbeat: PP.nowStamp(), lastBackup: PP.nowStamp(), backupStatus: 'Success', lastRestoreTest: PP.today(), lastUpdateAt: PP.today() });
            c.status = 'Active'; c.activatedAt = PP.today();
            (PP.db.licenceChecks || []).unshift({ id: PP.nextId('VAL', 6), customerId: c.id, licenceId: lic.id, at: PP.nowStamp(), result: 'Valid', version: dep ? dep.version : '', entitlementVersion: set.version, nonce: SA.hash(Math.random(), 12), detail: 'First registration of the deployment identity key' });
            PP.audit('Customer activated', c.id, `Deployment registered · ${dep ? dep.version : ''}`); PP.notify(`Activated: ${c.name}`, 'Deployment registered with the control plane', `#/customers/${c.id}`); PP.save();
            PP.ui.toast(`${esc(c.name)} is live. The deployment registered and pulled licence and snapshot v${set.version}.`, 'positive', 4200);
            resolve(true);
          } }].filter(Boolean),
        });
        const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); resolve(false); } });
        obs.observe(document.body, { childList: true });
      });
    },
  };
  function lifecycleButtons(c) {
    const st = c.status; const out = []; if (!PP.can('customers.lifecycle')) return '';
    if (st === 'Onboarding') out.push(`<button class="btn btn-primary" data-life="activate">${PP.icon('zap')} Activate</button>`);
    if (st === 'Active') out.push(`<button class="btn btn-danger" data-life="suspend">${PP.icon('lock')} Suspend</button>`);
    if (st === 'Suspended') out.push(`<button class="btn btn-primary" data-life="reactivate">${PP.icon('refresh')} Reactivate</button>`);
    return out.join('');
  }
  function bindLifecycle(root, c, after) {
    PP.$$('[data-life]', root).forEach((b) => b.addEventListener('click', async () => { const ok = await SA.lifecycle[b.dataset.life](c); if (ok) after(); }));
  }

  /* ------------------------------------------------------------------ dashboard */
  PP.route('/dashboard', {
    title: 'Dashboard', perm: 'dashboard.view',
    render({ el }) {
      const cs = PP.db.customers; const counts = {};
      cs.forEach((c) => { const s = SA.state(c); counts[s] = (counts[s] || 0) + 1; });
      const trials = (PP.db.sandboxes || []).filter((s) => s.status === 'Active').length;
      const states = [['Active', 'Full use'], ['Grace', 'Expired, still full use'], ['Read-only', 'View and export only'], ['Suspended', 'By the vendor; read-only'], ['Trial', 'Demo sandboxes (14 days)'], ['Onboarding', 'Not activated yet']];
      const expiring = cs.map((c) => ({ c, lic: SA.licenceOf(c.id) })).filter((x) => x.lic && x.c.status !== 'Onboarding' && ['Active', 'Grace'].includes(SA.licenceState(x.lic)) && SA.daysLeft(x.lic.end) <= 30).sort((a, b) => (a.lic.end < b.lic.end ? -1 : 1));
      const attention = PP.db.deployments.map((d) => ({ d, c: SA.customer(d.customerId), issues: issuesOf(d) })).filter((x) => x.issues.length);
      const leads = (PP.db.leads || []).filter((l) => l.status === 'New').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const openTickets = (PP.db.tickets || []).filter((t) => t.status === 'Open').length;
      const outstanding = PP.sum(PP.db.vendorInvoices || [], (v) => SA.invoiceTotals(v).due);
      el.innerHTML = PP.ui.pageHead({
        title: 'Control plane overview', subtitle: `${cs.length} customers · ${PP.db.deployments.filter((d) => d.version).length} live deployments on customer-owned infrastructure`,
        actions: `${PP.can('onboarding.run') ? `<a class="btn btn-primary" href="#/onboarding">${PP.icon('plus')} Onboard a customer</a>` : ''}${PP.can('fleet.view') ? `<a class="btn" href="#/fleet">${PP.icon('activity')} Fleet</a>` : ''}`,
      }) + `
        <div class="sa-states">${states.map(([s, h]) => { const n = s === 'Trial' ? trials : counts[s] || 0; return `<a class="sa-state ${STATE_TONES[s]}" href="${s === 'Trial' ? '#/demo/sandboxes' : `#/customers?state=${encodeURIComponent(s)}`}"><div class="l">${esc(s)}</div><div class="n">${n}</div><div class="h">${esc(h)}</div></a>`; }).join('')}</div>
        <div class="grid grid-4 mt-4">
          ${!PP.can(['reports.view', 'billing.manage']) ? '' : PP.ui.kpi({ label: 'Monthly recurring revenue', value: PP.fmt.money(SA.mrr()), hint: 'Fictional · Active + Grace customers', icon: 'banknote', tone: 'positive' })}
          ${!PP.can('billing.manage') ? '' : PP.ui.kpi({ label: 'Outstanding vendor invoices', value: PP.fmt.money(outstanding), hint: `<a href="#/billing">Open vendor billing</a>`, icon: 'receipt', tone: outstanding ? 'warning' : 'positive' })}
          ${!PP.can('support.manage') ? '' : PP.ui.kpi({ label: 'Open support tickets', value: openTickets, hint: '<a href="#/support">Ticket inbox</a>', icon: 'mail', tone: 'info' })}
          ${!PP.can('demo.manage') ? '' : PP.ui.kpi({ label: 'New demo leads', value: leads.length, hint: '<a href="#/demo">Sign-up leads</a>', icon: 'zap', tone: 'lavender' })}
        </div>
        <div class="grid dash-row mt-4">
          ${!PP.can(SA.PAGE_PERMS.licences) ? '' : PP.ui.card({ title: 'Licences expiring soon (≤ 30 days) and in grace', actions: '<a class="btn btn-sm btn-ghost" href="#/licences">All licences</a>', flush: true, body: expiring.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Plan</th><th>Ends</th><th>State</th></tr></thead><tbody>${expiring.map(({ c, lic }) => { const d = SA.daysLeft(lic.end); return `<tr><td>${SA.customerLink(c.id)}<span class="sub">${esc(c.city)}</span></td><td>${esc(SA.planName(lic.planId))}</td><td class="nowrap">${PP.fmt.date(lic.end)}<span class="sub">${d >= 0 ? `${d} days left` : `ended ${-d} days ago`}</span></td><td>${SA.badge(SA.licenceState(lic))}</td></tr>`; }).join('')}</tbody></table></div>` : PP.ui.empty({ icon: 'shield', title: 'No licences expiring in the next 30 days' }) })}
          ${!PP.can('fleet.view') ? '' : PP.ui.card({ title: 'Deployments needing attention', actions: '<a class="btn btn-sm btn-ghost" href="#/fleet">Fleet monitoring</a>', flush: true, body: attention.length ? `<ul class="list sa-list-compact">${attention.map(({ c, d, issues }) => `<li>${PP.icon('alert', 'style="width:18px;color:var(--pp-warning-fg);flex:none"')}<div class="grow"><a href="#/customers/${c.id}?tab=deployment"><b>${esc(c.name)}</b></a><span class="sub small muted" style="display:block">${esc(issues.join(' · '))} · v${esc(d.version || '—')}</span></div>${SA.badge(d.health)}</li>`).join('')}</ul>` : PP.ui.empty({ icon: 'checkCircle', title: 'Every deployment is healthy' }) })}
        </div>
        <div class="grid dash-row-3 mt-4">
          ${!PP.can(['reports.view', 'billing.manage']) ? '' : PP.ui.card({ title: 'Monthly recurring revenue (fictional)', body: '<div data-mrr></div>' })}
          ${!PP.can('demo.manage') ? '' : PP.ui.card({ title: 'New demo leads', actions: '<a class="btn btn-sm btn-ghost" href="#/demo">All leads</a>', flush: true, body: leads.length ? `<ul class="list sa-list-compact">${leads.slice(0, 5).map((l) => `<li><span class="avatar">${esc(PP.initials(l.name))}</span><div class="grow"><b>${esc(l.organisation)}</b><span class="sub small muted" style="display:block">${esc(l.name)} · ${esc(SA.btLabel(l.businessType))} · ${SA.ago(l.createdAt)}</span></div>${PP.can('onboarding.run') ? `<a class="btn btn-sm" href="#/onboarding?lead=${l.id}">Convert</a>` : ''}</li>`).join('')}</ul>` : PP.ui.empty({ icon: 'zap', title: 'No new leads' }) })}
          ${PP.ui.card({ title: 'Customers by business type', body: `<div class="stack">${PP.db.businessTypes.map((b) => { const n = cs.filter((c) => c.businessType === b.id).length; return n ? `<div><div class="row between small"><span>${esc(b.label)}</span><b class="mono">${n}</b></div><div class="sa-usage-bar mt-2"><span style="width:${Math.round((n / cs.length) * 100)}%"></span></div></div>` : ''; }).join('')}</div>` })}
        </div>
        <div class="mt-4">${SA.noPatientData()}</div>`;
      // MRR history: customers counted from their activation month (fictional, from the seed)
      const months = []; for (let k = 5; k >= 0; k--) { const d = PP.parseISO(PP.monthStart(PP.today())); d.setMonth(d.getMonth() - k); months.push(PP.isoOf(d).slice(0, 7)); }
      const vals = months.map((m) => PP.round2(PP.sum(cs.filter((c) => c.activatedAt && c.activatedAt.slice(0, 7) <= m && !(c.status === 'Suspended' && m === months[5])), mrrOf)));
      if (PP.$('[data-mrr]', el)) PP.chart.bars(PP.$('[data-mrr]', el), { labels: months.map((m) => PP.fmt.month(m).slice(0, 3)), groups: [{ name: 'MRR (BDT)', values: vals, color: '#4f46e5' }], format: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)), height: 200 });
    },
  });

  /* ------------------------------------------------------------------ customers list */
  PP.route('/customers', {
    title: 'Customers', perm: 'customers.view',
    render({ el, query }) {
      el.innerHTML = PP.ui.pageHead({
        title: 'Customers', subtitle: 'Customer organisations (tenants). Each runs its own deployment on infrastructure it owns (D-015).',
        actions: PP.can('onboarding.run') ? `<a class="btn btn-primary" href="#/onboarding">${PP.icon('plus')} Onboard a customer</a>` : '',
      }) + '<div class="card"><div data-t></div></div>';
      PP.ui.table(PP.$('[data-t]', el), {
        getRows: () => PP.db.customers, exportName: 'customers', pageSize: 25,
        search: { placeholder: 'Search name, ID, tenant ID, city or domain', text: (c) => [c.name, c.id, c.tenantId, c.city, c.contact.name, ...SA.domainsOf(c.id).map((d) => d.host)].join(' ') },
        filters: [
          { id: 'state', label: 'All states', value: query.state || '', options: ['Onboarding', 'Active', 'Grace', 'Read-only', 'Suspended'].map((s) => [s, s]), match: (c, v) => SA.state(c) === v },
          { id: 'bt', label: 'All business types', options: PP.db.businessTypes.map((b) => [b.id, b.label]), match: (c, v) => c.businessType === v },
          { id: 'plan', label: 'All plans', options: PP.db.plans.map((p) => [p.id, p.name]), match: (c, v) => c.planId === v },
          { id: 'host', label: 'All hosting models', options: [['Vendor-managed', 'Vendor-managed'], ['Customer-managed', 'Customer-managed']], match: (c, v) => c.hostingModel === v },
        ],
        columns: [
          { key: 'name', label: 'Customer', sort: (c) => c.name, render: (c) => `<div class="row" style="gap:10px;flex-wrap:nowrap">${logoBox(c, 34)}<div><b>${esc(c.name)}</b><span class="sub">${esc(c.id)} · ${esc(c.city)}</span></div></div>`, exportValue: (c) => c.name },
          { key: 'bt', label: 'Business type', sort: (c) => c.businessType, render: (c) => `${esc(SA.btLabel(c.businessType))}<span class="sub">${esc(SA.term(c, 'professionals'))}</span>`, exportValue: (c) => SA.btLabel(c.businessType) },
          { key: 'plan', label: 'Plan', sort: (c) => SA.planName(c.planId), render: (c) => `${esc(SA.planName(c.planId))}<span class="sub">${esc(c.billingCycle)}</span>`, exportValue: (c) => SA.planName(c.planId) },
          { key: 'state', label: 'State', sort: (c) => SA.state(c), render: (c) => SA.badge(SA.state(c)), exportValue: (c) => SA.state(c) },
          !PP.can(SA.PAGE_PERMS.licences) ? null : { key: 'lic', label: 'Licence ends', sort: (c) => licEnd(c) || '', render: (c) => { const e = licEnd(c); if (!e) return '—'; const d = SA.daysLeft(e); return `${PP.fmt.date(e)}<span class="sub ${d < 0 ? 'sa-over' : ''}">${d >= 0 ? `${d} days left` : `ended ${-d} days ago`}</span>`; }, exportValue: (c) => licEnd(c) || '' },
          { key: 'domain', label: 'Domain', render: (c) => { const d = SA.primaryDomain(c.id); return d ? `${esc(d.host)}<span class="sub">${esc(d.status)}</span>` : '—'; }, exportValue: (c) => (SA.primaryDomain(c.id) || {}).host || '' },
          { key: 'ver', label: 'Version', sort: (c) => (SA.deployment(c.id) || {}).version || '', render: (c) => { const d = SA.deployment(c.id); return d && d.version ? `<span class="mono">${esc(d.version)}</span><span class="sub">${esc(d.updateStatus)}</span>` : '<span class="muted">Not installed</span>'; }, exportValue: (c) => (SA.deployment(c.id) || {}).version || '' },
          { key: 'patients', label: 'Patients (count)', align: 'right', sort: (c) => ((SA.deployment(c.id) || {}).usage || {}).patients || 0, render: (c) => PP.fmt.num(((SA.deployment(c.id) || {}).usage || {}).patients || 0) },
        ].filter(Boolean),
        rowClass: (c) => (['Read-only', 'Suspended'].includes(SA.state(c)) ? 'sa-err-row' : SA.state(c) === 'Grace' ? 'sa-warn-row' : ''),
        onRowClick: (c) => { location.hash = `#/customers/${c.id}`; },
        empty: { icon: 'building', title: 'No customers yet', text: 'Onboard the first customer with the 14-step wizard.', action: '<a class="btn btn-primary" href="#/onboarding">Onboard a customer</a>' },
      });
    },
  });

  /* ------------------------------------------------------------------ customer detail */
  /* Tabs follow the role: customers.view alone shows the profile and configuration (read-only). [id, label, permission(s)] */
  const ALL_TABS = [['profile', 'Profile'], ['configuration', 'Configuration'], ['entitlements', 'Entitlements', SA.PAGE_PERMS.entitlements], ['licence', 'Licence', SA.PAGE_PERMS.licences], ['domain', 'Domain', 'domains.manage'], ['branding', 'Branding', 'branding.manage'], ['deployment', 'Deployment', 'fleet.view'], ['billing', 'Billing', 'billing.manage'], ['history', 'History', SA.PAGE_PERMS.audit]];
  const tabsFor = () => ALL_TABS.filter((t) => !t[2] || PP.can(t[2]));
  PP.route('/customers/:id', {
    title: (p) => { const c = SA.customer(p.id); return c ? c.name : 'Customer'; }, perm: 'customers.view',
    render({ el, params, query }) {
      const c = SA.customer(params.id);
      if (!c) { el.innerHTML = `<div class="card">${PP.ui.empty({ icon: 'search', title: 'Customer not found', text: `No customer with ID <code>${esc(params.id)}</code>.`, action: '<a class="btn" href="#/customers">Back to customers</a>' })}</div>`; return; }
      const TABS = tabsFor();
      let tab = TABS.some(([k]) => k === query.tab) ? query.tab : 'profile';
      const draw = () => {
        const st = SA.state(c); const dom = SA.primaryDomain(c.id); const set = SA.latestSet(c.id);
        el.innerHTML = PP.ui.pageHead({
          crumbs: [['Customers', '#/customers'], [c.name]],
          title: `<span class="sa-detail-head">${logoBox(c)}<span>${esc(c.name)} ${SA.badge(st)}</span></span>`,
          subtitle: `<span class="sa-meta"><span>${PP.icon('building')} ${esc(SA.btLabel(c.businessType))}</span><span>${PP.icon('layers')} ${esc(SA.planName(c.planId))} · ${esc(c.billingCycle)}</span><span>${PP.icon('globe')} ${esc(dom ? dom.host : '—')}</span><span>${PP.icon('lock')} <code>${esc(c.tenantId)}</code></span><span>${PP.icon('shield')} Entitlements v${esc(set ? set.version : 0)}</span></span>`,
          actions: lifecycleButtons(c),
        }) + `${['Grace', 'Read-only', 'Suspended', 'Onboarding'].includes(st) ? PP.ui.alert(st === 'Onboarding' ? 'info' : st === 'Grace' ? 'warning' : 'error', `<b>${esc(st)}.</b> ${esc(SA.STATE_INFO[st])}${c.status === 'Suspended' && c.suspendReason ? `<br><span class="small">Reason: ${esc(c.suspendReason)}</span>` : ''}${['Grace', 'Read-only'].includes(st) && c.status !== 'Suspended' ? ' <a href="#/licences">Renew the licence</a> to return to full use.' : ''}`) : ''}
          <div class="card mt-4"><div data-tabs></div><div class="card-body" data-panel></div></div>`;
        bindLifecycle(el, c, draw);
        PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: TABS.map(([id, label]) => ({ id, label })), active: tab, onChange: (t) => { tab = t; try { history.replaceState(null, '', `#/customers/${c.id}?tab=${t}`); } catch (e) { /* ignore */ } panel(); } });
        panel();
      };
      const panel = () => {
        const p = PP.$('[data-panel]', el); p.innerHTML = '';
        if (tab === 'profile') return profileTab(p, c, draw);
        if (tab === 'configuration') return configTab(p, c, draw);
        if (tab === 'history') return historyTab(p, c);
        const fn = SA.panels[tab];
        if (fn) { try { fn(p, c); } catch (e) { console.error(e); p.innerHTML = PP.ui.errorState(e); } } else p.innerHTML = PP.ui.empty({ icon: 'info', title: 'Not available', text: 'This panel is not loaded.' });
      };
      draw();
    },
  });

  function profileTab(p, c, redraw) {
    const dep = SA.deployment(c.id); const admin = c.admin;
    p.innerHTML = `<div class="sa-split">
      <div>
        <div class="row between"><h3>Organisation</h3>${PP.can('customers.manage') ? `<button class="btn btn-sm" data-edit>${PP.icon('edit')} Edit profile</button>` : ''}</div>
        <dl class="kv mt-3">
          <dt>Customer ID</dt><dd class="mono">${esc(c.id)}</dd>
          <dt>Tenant ID</dt><dd><code>${esc(c.tenantId)}</code></dd>
          <dt>Legal name</dt><dd>${esc(c.legalName || c.name)}</dd>
          <dt>Address</dt><dd>${esc(c.address)}</dd>
          <dt>Contact</dt><dd>${esc(c.contact.name)}<span class="sub small muted" style="display:block">${esc(c.contact.mobile)} · ${esc(c.contact.email)}</span></dd>
          ${admin ? `<dt>Customer admin</dt><dd>${esc(admin.name)}<span class="sub small muted" style="display:block">${esc(admin.email)} · two-step sign-in required</span></dd>` : ''}
          <dt>Created</dt><dd>${PP.fmt.date(c.createdAt)}</dd>
          <dt>Activated</dt><dd>${c.activatedAt ? PP.fmt.date(c.activatedAt) : '<span class="muted">Not yet</span>'}</dd>
          <dt>Notes</dt><dd>${esc(c.notes || '—')}</dd>
        </dl>
      </div>
      <div class="stack">
        <div class="sa-callout"><b>Hosting (customer-owned, D-015)</b>
          <dl class="kv kv-tight mt-2 small"><dt>Model</dt><dd>${esc(c.hostingModel)}</dd><dt>Provider</dt><dd>${esc(c.hosting.provider)} · ${esc(c.hosting.region)}</dd><dt>Server</dt><dd>${esc(c.hosting.server)} · ${esc(c.hosting.os)}</dd></dl>
          <div class="sa-mini mt-2">Server size is the customer’s own capacity. The vendor sets no storage, RAM, CPU or bandwidth quotas (D-016). Operating model: PD-026 pending.</div></div>
        <div class="sa-callout"><b>Lifecycle</b><div class="mt-2">${SA.badge(SA.state(c))} <span class="small muted">${esc(SA.STATE_INFO[SA.state(c)] || '')}</span></div>
          <div class="sa-mini mt-2">Onboarding → Active → (Grace) → Read-only. Suspension is read-only too. Data is never deleted.</div></div>
        <div class="sa-callout"><b>Aggregated usage</b> <span class="sa-mini">(numbers only, from the heartbeat)</span>
          <div class="stack mt-2">${SA.LIMITS.map((l) => { const set = SA.latestSet(c.id); return `<div><div class="small">${esc(l.label)}</div>${SA.usageBar((dep && dep.usage[l.counter]) || 0, set ? set.limits[l.code] : null)}</div>`; }).join('')}</div></div>
      </div></div>`;
    const b = PP.$('[data-edit]', p);
    if (b) b.addEventListener('click', () => {
      PP.ui.modal({
        title: 'Edit customer profile', size: 'lg',
        body: `<form class="form-grid" novalidate>
          ${PP.form.field({ name: 'name', label: 'Organisation name', required: true, value: c.name })}
          ${PP.form.field({ name: 'legalName', label: 'Legal name', value: c.legalName })}
          ${PP.form.field({ name: 'city', label: 'City', required: true, value: c.city })}
          ${PP.form.field({ name: 'address', label: 'Address', required: true, value: c.address })}
          ${PP.form.field({ name: 'cname', label: 'Contact name', required: true, value: c.contact.name })}
          ${PP.form.field({ name: 'cmobile', label: 'Contact mobile', required: true, rule: 'mobile', value: c.contact.mobile })}
          ${PP.form.field({ name: 'cemail', label: 'Contact email', required: true, rule: 'email', value: c.contact.email })}
          ${PP.form.field({ name: 'billingCycle', label: 'Billing cycle', type: 'select', placeholder: false, options: ['Monthly', 'Yearly'], value: c.billingCycle })}
          ${PP.form.field({ name: 'notes', label: 'Internal notes', type: 'textarea', full: true, value: c.notes })}
        </form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save profile', kind: 'primary', onClick: async ({ body }) => {
          const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
          const v = PP.form.read(f);
          if (PP.db.customers.some((x) => x.id !== c.id && x.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'Another customer already uses this name.'); return false; }
          await PP.sleep(350);
          const before = `${c.name} · ${c.contact.mobile}`;
          Object.assign(c, { name: v.name, legalName: v.legalName, city: v.city, address: v.address, billingCycle: v.billingCycle, notes: v.notes });
          Object.assign(c.contact, { name: v.cname, mobile: v.cmobile, email: v.cemail });
          PP.audit('Customer profile updated', c.id, `${before} → ${c.name} · ${c.contact.mobile}`); PP.save();
          PP.ui.toast('Profile saved'); redraw();
        } }],
      });
    });
  }

  function configTab(p, c, redraw) {
    const can = PP.can('customers.manage');
    const set = SA.latestSet(c.id); const limit = set ? set.limits.branches : null;
    const types = PP.db.professionalTypes;
    p.innerHTML = `
      ${PP.ui.alert('info', 'Configuration is delivered to the deployment inside the <b>signed configuration snapshot</b>. A Business Type supplies defaults; Professional Types are separate from User Roles, and prescribing is a capability of the type (D-020).')}
      <form class="stack mt-4" novalidate data-cfg>
        <div class="form-grid">
          ${PP.form.field({ name: 'businessType', label: 'Business type', type: 'select', placeholder: false, options: PP.db.businessTypes.map((b) => [b.id, b.label + (b.status !== 'Active' ? ' (draft)' : '')]), value: c.businessType, disabled: !can })}
          <div class="field"><label>Hosting model</label><input class="input" value="${esc(c.hostingModel)}" readonly></div>
          ${PP.form.field({ name: 'professional', label: 'Professional (singular)', required: true, value: SA.term(c, 'professional'), disabled: !can, hint: 'Never hard-coded: “Therapist” is configuration (D-010).' })}
          ${PP.form.field({ name: 'professionals', label: 'Professionals (plural)', required: true, value: SA.term(c, 'professionals'), disabled: !can })}
        </div>
        <div class="sa-callout small" data-preview></div>
        <div><div class="label" style="font-weight:600">Professional types</div>
          <div class="sa-choices mt-2">${types.map((t) => `<label class="sa-choice"><input type="checkbox" name="pt_${t.id}" ${c.professionalTypes.includes(t.id) ? 'checked' : ''} ${can ? '' : 'disabled'}><span><b>${esc(t.name)}</b><span class="sub">${[t.canBeBooked && 'bookable', t.canRecordClinical && 'clinical notes', t.canPrescribeExercise && 'exercise Rx', t.canPrescribeMedication && 'medication Rx', t.canIssueCertificate && 'certificates'].filter(Boolean).join(' · ') || 'support role'}</span></span></label>`).join('')}</div></div>
        <div>
          <div class="row between"><div class="label" style="font-weight:600">Branches <span class="small muted">(${c.branches.length} of ${SA.fmtLimit(limit)} allowed)</span></div>${can ? `<button type="button" class="btn btn-sm" data-addbr>${PP.icon('plus')} Add branch</button>` : ''}</div>
          <div class="table-wrap mt-2"><table class="table"><thead><tr><th>ID</th><th>Name</th><th>Address</th><th></th></tr></thead><tbody>${c.branches.map((b, i) => `<tr><td class="mono">${esc(b.id)}</td><td>${esc(b.name)}</td><td>${esc(b.address)}</td><td class="right">${can && c.branches.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-rmbr="${i}" aria-label="Remove branch">${PP.icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="sa-callout small"><b>Initial configuration</b> · ${esc(Object.entries(c.initialConfig || {}).map(([k, v]) => `${SA.humanize(k)}: ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · '))}</div>
        ${can ? `<div class="form-actions"><button type="submit" class="btn btn-primary" data-save>${PP.icon('check')} Save configuration</button></div>` : ''}
      </form>`;
    const f = PP.$('[data-cfg]', p);
    const prev = () => { const v = PP.form.read(f); PP.$('[data-preview]', p).innerHTML = `Preview in the clinic app: “Book with a <b>${esc((v.professional || '').toLowerCase())}</b>” · menu item “<b>${esc(v.professionals)}</b>” · “${esc(SA.bt(v.businessType) ? SA.bt(v.businessType).org : 'Clinic')} settings”`; };
    prev(); f.addEventListener('input', prev);
    PP.$('[name=businessType]', f).addEventListener('change', async (e) => {
      const bt = SA.bt(e.target.value);
      const ok = await PP.ui.confirm({ title: 'Apply business type defaults?', message: `Use the default terminology of <b>${esc(bt.label)}</b> (“${esc(bt.professional)}” / “${esc(bt.professionals)}”) and its default professional types? Existing records are not changed.`, confirmLabel: 'Apply defaults' });
      if (ok) { PP.$('[name=professional]', f).value = bt.professional; PP.$('[name=professionals]', f).value = bt.professionals; PP.$$('[name^=pt_]', f).forEach((x) => { x.checked = bt.professionalTypes.includes(x.name.slice(3)); }); }
      prev();
    });
    const addBr = PP.$('[data-addbr]', p);
    if (addBr) addBr.addEventListener('click', () => {
      if (limit != null && c.branches.length >= limit) { PP.ui.toast(`<b>limit_reached:</b> the branch limit is ${limit}. Raise it under Entitlements → Usage limits. Existing branches are not affected.`, 'error', 4800); return; }
      PP.ui.modal({ title: 'Add branch', body: `<form class="stack" novalidate>${PP.form.field({ name: 'name', label: 'Branch name', required: true })}${PP.form.field({ name: 'address', label: 'Address', required: true })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Add branch', kind: 'primary', onClick: ({ body }) => {
          const fm = PP.$('form', body); if (!PP.form.validate(fm)) return false; const v = PP.form.read(fm);
          if (c.branches.some((b) => b.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(fm, 'name', 'A branch with this name exists.'); return false; }
          const n = Math.max(0, ...c.branches.map((b) => Number(b.id.split('-')[1]) || 0)) + 1;
          c.branches.push({ id: `BR-${n}`, name: v.name, address: v.address }); PP.audit('Branch added', c.id, v.name); PP.save(); PP.ui.toast('Branch added'); configTab(p, c, redraw);
        } }] });
    });
    PP.$$('[data-rmbr]', p).forEach((b) => b.addEventListener('click', async () => {
      const br = c.branches[Number(b.dataset.rmbr)];
      const r = await PP.ui.confirm({ title: `Close ${esc(br.name)}?`, message: 'The branch is removed from the configuration snapshot. In the deployment its records stay intact and readable; nothing is deleted.', confirmLabel: 'Remove branch', danger: true, reasonLabel: 'Reason', reasonRequired: true });
      if (!r) return; c.branches.splice(Number(b.dataset.rmbr), 1); PP.audit('Branch removed', c.id, `${br.name} · ${r.reason}`); PP.save(); PP.ui.toast('Branch removed'); configTab(p, c, redraw);
    }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(f)) return;
      const v = PP.form.read(f); const pts = types.filter((t) => v[`pt_${t.id}`]).map((t) => t.id);
      if (!pts.length) { PP.ui.toast('Select at least one professional type.', 'error'); return; }
      await PP.ui.busy(PP.$('[data-save]', f), async () => {
        const bt = SA.bt(v.businessType); const before = `${c.businessType} · ${SA.term(c, 'professional')}`;
        c.businessType = v.businessType; c.professionalTypes = pts;
        c.terminology = (v.professional === bt.professional && v.professionals === bt.professionals) ? {} : { professional: v.professional, professionals: v.professionals };
        c.configVersion = (c.configVersion || 1) + 1;
        PP.audit('Configuration updated', c.id, `${before} → ${c.businessType} · ${SA.term(c, 'professional')} · config v${c.configVersion}`); PP.save();
        PP.ui.toast(`Configuration v${c.configVersion} saved and signed. The deployment pulls it at its next check-in.`);
        redraw();
      });
    });
  }

  function historyTab(p, c) {
    const rows = () => PP.db.audit.filter((a) => SA.auditVisible(a)).filter((a) => a.target === c.id || String(a.detail).includes(c.id) || (SA.domainsOf(c.id).some((d) => d.host === a.target)) || (SA.setsOf(c.id).some((s) => s.id === a.target)));
    const sets = SA.setsOf(c.id);
    p.innerHTML = `<div class="sa-split"><div><h3>Change history</h3><p class="small muted">Every super admin change: who, when, what and why. Append-only.</p><div data-h></div></div>
      <div><h3>Entitlement versions</h3><ul class="timeline mt-3">${sets.map((s) => `<li><div class="tl-date">v${s.version}<br><span class="small">${PP.fmt.dateShort(s.issuedAt.slice(0, 10))}</span></div><div class="tl-body"><b>${esc(s.reason || '—')}</b>${s.kind === 'rollback' ? ` ${SA.badge('Rollback')}` : ''}<div class="small muted">${esc(s.by)} · ${s.features.length} features · ${esc(SA.shortSig(s.signature))}</div></div></li>`).join('') || '<li>No versions</li>'}</ul>
      <a class="btn btn-sm mt-2" href="#/entitlements/${c.id}">Compare and roll back</a></div></div>`;
    PP.ui.table(PP.$('[data-h]', p), {
      getRows: rows, pageSize: 10, exportName: `history-${c.id}`,
      search: { placeholder: 'Search history', text: (a) => `${a.action} ${a.detail} ${a.userName}` },
      columns: [
        { key: 'at', label: 'When', sort: (a) => a.at, render: (a) => `<span class="nowrap">${PP.fmt.stamp(a.at)}</span>` },
        { key: 'who', label: 'Who', render: (a) => esc(a.userName) },
        { key: 'action', label: 'Action', render: (a) => `<b>${esc(a.action)}</b><span class="sub">${esc(a.detail)}</span>` },
      ],
      sortKey: 'at', sortDir: 'desc', empty: { icon: 'clock', title: 'No changes recorded yet' },
    });
  }
})();
