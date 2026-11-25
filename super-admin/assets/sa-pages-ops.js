/* Physio Point — Super Admin: domains, branding, licences, releases & updates, fleet monitoring.
   Also registers the customer-detail panels: licence, domain, branding, deployment.
   Prototype only: every "verify", "issue", "sign" and "roll out" is a simulation (D-006). */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;
  const OPS = (SA.ops = SA.ops || {});
  const me = () => (PP.currentUser() || {}).name || 'System';
  const alive = (el) => !!el && document.body.contains(el);
  const guard = (perm) => { if (PP.can(perm)) return true; PP.ui.toast(`Your role does not include <code>${esc(perm)}</code>. In production this is refused by the server.`, 'error', 4200); return false; };
  const HEX = /^#[0-9a-f]{6}$/i;
  const DEFAULT_PRIMARY = '#083E44'; const DEFAULT_ACTION = '#008B83';
  const safeColor = (v, fb) => (HEX.test(String(v || '')) ? v : fb);
  const copyBtn = (text, label) => `<button type="button" class="btn btn-sm" data-copy="${esc(text)}" aria-label="Copy ${esc(label || 'value')}">${PP.icon('clipboard')} Copy</button>`;
  function bindCopy(root) {
    PP.$$('[data-copy]', root).forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); PP.ui.toast('Copied to the clipboard'); }
      catch (e) { PP.ui.toast('Copy is not available in this browser. Select the text and copy it manually.', 'warning'); }
    }));
  }
  const closeOnLinks = (m) => m.body.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) m.close(); });

  /* ================================================================== DOMAINS */
  OPS.sslLabel = (d) => (d.ssl === 'Issued' && d.sslExpires && SA.daysLeft(d.sslExpires) <= 14 ? 'Expiring' : d.ssl);
  const findDomain = (id) => PP.db.domains.find((d) => d.id === id) || null;
  const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

  OPS.verifyDomain = async function (d, btn) {
    if (!guard('domains.manage')) return;
    await PP.ui.busy(btn, async () => {
      d.lastCheck = PP.nowStamp();
      if (d.host.includes('booking.')) {
        d.status = 'Failed'; d.failReason = d.failReason || 'TXT record not found. Check that the record was added to the zone that serves this host.';
        PP.audit('Domain verification failed', d.customerId, `${d.host} · ${d.failReason}`); PP.save();
        PP.ui.toast(`Verification failed for ${esc(d.host)}: TXT record not found.`, 'error', 4200);
      } else {
        d.status = 'Verified'; d.verifiedAt = PP.today(); d.failReason = '';
        PP.audit('Domain verified', d.customerId, `${d.host} · DNS TXT challenge matched`); PP.save();
        const c = SA.customer(d.customerId);
        PP.ui.toast(`${esc(d.host)} verified.${c && c.status === 'Onboarding' ? ' The domain prerequisite for activation is now met.' : ''}`);
      }
    }, 1000);
  };
  OPS.issueSsl = async function (d, btn, redraw) {
    if (!guard('domains.manage')) return;
    if (d.status !== 'Verified') { PP.ui.toast('Verify the domain first. Certificates are issued only for verified domains.', 'warning'); return; }
    await PP.ui.busy(btn, async () => { d.ssl = 'Pending'; PP.save(); if (redraw) redraw(); }, 400);
    await PP.sleep(1100);
    d.ssl = 'Issued'; d.sslExpires = PP.addDays(PP.today(), 90);
    PP.audit('SSL certificate issued', d.customerId, `${d.host} · ACME on the customer's server · expires ${PP.fmt.date(d.sslExpires)}`); PP.save();
    PP.ui.toast(`Certificate issued for ${esc(d.host)} (valid 90 days, renews automatically).`);
    if (redraw) redraw();
  };
  OPS.setPrimary = function (d) {
    if (!guard('domains.manage')) return;
    SA.domainsOf(d.customerId).forEach((x) => { x.primary = x.id === d.id; });
    PP.audit('Primary domain changed', d.customerId, d.host); PP.save();
    PP.ui.toast(`${esc(d.host)} is now the primary domain. Re-issue the licence if its bound domains should change.`, 'info', 4200);
  };
  OPS.removeDomain = async function (d) {
    if (!guard('domains.manage')) return false;
    if (d.primary) { PP.ui.toast('The primary domain cannot be removed. Make another domain primary first.', 'warning'); return false; }
    const ok = await PP.ui.confirm({ title: 'Remove domain?', message: `<b>${esc(d.host)}</b> is removed from the domain-to-tenant mapping. The customer's deployment stops accepting it after the next configuration refresh. No customer data is touched.`, confirmLabel: 'Remove domain', danger: true });
    if (!ok) return false;
    PP.db.domains = PP.db.domains.filter((x) => x.id !== d.id);
    PP.audit('Domain removed', d.customerId, d.host); PP.save(); PP.ui.toast(`${esc(d.host)} removed`);
    return true;
  };

  OPS.domainModal = function (domId, onChange) {
    const d0 = findDomain(domId); if (!d0) return;
    const m = PP.ui.modal({ title: `Domain · ${esc(d0.host)}`, size: 'lg', body: '', buttons: [{ label: 'Close', kind: 'ghost' }] });
    closeOnLinks(m);
    const changed = () => { if (onChange) onChange(); };
    const draw = () => {
      const d = findDomain(domId); if (!d) { m.close(); return; }
      const c = SA.customer(d.customerId); const ssl = OPS.sslLabel(d);
      m.body.innerHTML = `
        <div class="row between"><div><div class="row"><b style="font-size:16px">${esc(d.host)}</b>${d.primary ? '<span class="sa-tag core">Primary</span>' : ''}</div>
          <div class="small muted mt-2">${SA.customerLink(d.customerId)} · tenant <code>${esc(c ? c.tenantId : '—')}</code></div></div>
          <div class="row">${SA.badge(d.status)} ${SA.badge(ssl === 'Issued' ? 'Issued' : ssl)}</div></div>
        ${d.status === 'Failed' ? `<div class="mt-3">${PP.ui.alert('error', `<b>Verification failed.</b> ${esc(d.failReason || '')}`)}</div>` : ''}
        ${c && c.status === 'Onboarding' && d.status !== 'Verified' ? `<div class="mt-3">${PP.ui.alert('warning', 'This customer is still onboarding. A verified domain is a prerequisite for activating the deployment and binding the licence.')}</div>` : ''}
        <h3 class="mt-4">1. Prove ownership with a DNS TXT record</h3>
        <p class="small muted">The customer (or their DNS provider) adds this record. The control plane checks it; nothing is installed on the vendor side.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Type</th><th>Value</th><th></th></tr></thead><tbody>
          <tr><td><span class="sa-code inline">${esc(d.txtName || `_pp-verify.${d.host}`)}</span></td><td>TXT</td><td><span class="sa-code inline">${esc(d.txtValue)}</span></td><td class="nowrap">${copyBtn(d.txtValue, 'TXT value')}</td></tr>
        </tbody></table></div>
        <h3 class="mt-4">2. Point the domain to the customer's server</h3>
        <div class="sa-copy mt-2"><span class="sa-code">${esc(d.target || `${d.host}. A → customer server`)}</span>${copyBtn(d.host, 'host')}</div>
        <h3 class="mt-4">3. TLS certificate</h3>
        <dl class="kv mt-2"><dt>SSL status</dt><dd>${SA.badge(ssl)}${d.sslExpires ? ` <span class="small muted">expires ${PP.fmt.date(d.sslExpires)} (${SA.daysLeft(d.sslExpires)} days)</span>` : ''}</dd>
          <dt>Issuer</dt><dd>${esc(d.sslIssuer || "Let's Encrypt (ACME, on the customer's server)")}</dd>
          <dt>Last check</dt><dd>${PP.fmt.stamp(d.lastCheck)}</dd><dt>Verified on</dt><dd>${d.verifiedAt ? PP.fmt.date(d.verifiedAt) : '—'}</dd></dl>
        <div class="row mt-4">
          ${d.status !== 'Verified' ? `<button class="btn btn-primary" data-verify>${PP.icon('refresh')} Verify now</button>` : `<button class="btn" data-verify>${PP.icon('refresh')} Re-check DNS</button>`}
          ${d.status === 'Verified' && ssl !== 'Issued' && ssl !== 'Pending' ? `<button class="btn btn-primary" data-ssl>${PP.icon('lock')} ${ssl === 'Expiring' ? 'Renew certificate' : 'Issue SSL'}</button>` : ''}
          ${!d.primary ? '<button class="btn" data-primary>Make primary</button>' : ''}
          ${!d.primary ? `<button class="btn btn-danger" data-remove>${PP.icon('trash')} Remove</button>` : ''}
        </div>
        <div class="mt-4">${SA.pending('PD-029', 'Whether the vendor registers domains as a reseller or only verifies domains the customer already owns, and whether a temporary vendor subdomain is allowed during onboarding.')}</div>`;
      bindCopy(m.body);
      const vb = PP.$('[data-verify]', m.body); if (vb) vb.addEventListener('click', async () => { await OPS.verifyDomain(findDomain(domId), vb); draw(); changed(); });
      const sb = PP.$('[data-ssl]', m.body); if (sb) sb.addEventListener('click', async () => { await OPS.issueSsl(findDomain(domId), sb, () => { if (alive(m.el)) draw(); changed(); }); });
      const pb = PP.$('[data-primary]', m.body); if (pb) pb.addEventListener('click', () => { OPS.setPrimary(findDomain(domId)); draw(); changed(); });
      const rb = PP.$('[data-remove]', m.body); if (rb) rb.addEventListener('click', async () => { if (await OPS.removeDomain(findDomain(domId))) { m.close(); changed(); } });
    };
    draw();
  };

  OPS.addDomainModal = function (customerId, onDone) {
    if (!guard('domains.manage')) return;
    PP.ui.modal({
      title: 'Add a domain', body: `<form class="form-grid" novalidate onsubmit="return false">
        ${PP.form.field({ name: 'customerId', label: 'Customer', type: 'select', required: true, value: customerId || '', options: PP.db.customers.map((c) => [c.id, c.name]), full: true })}
        ${PP.form.field({ name: 'host', label: 'Host name', required: true, placeholder: 'app.clinicname.com.bd', hint: 'The customer owns this domain. Use the exact host the app will run on.', full: true })}
        ${PP.form.field({ name: 'record', label: 'Pointing record', type: 'select', placeholder: false, options: [['A', 'A record → customer server IP'], ['CNAME', 'CNAME → existing customer host']], value: 'A' })}
        ${PP.form.field({ name: 'primary', label: 'Make this the primary domain', type: 'checkbox' })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Add domain', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const v = PP.form.read(f); const host = v.host.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!HOST_RE.test(host)) { PP.form.setError(f, 'host', 'Enter a valid host name, for example app.clinicname.com.bd.'); return false; }
        if (PP.db.domains.some((d) => d.host === host)) { PP.form.setError(f, 'host', 'This host is already mapped to a tenant. One domain maps to exactly one tenant.'); return false; }
        await PP.sleep(350);
        const first = !SA.domainsOf(v.customerId).length; const primary = v.primary || first;
        if (primary) SA.domainsOf(v.customerId).forEach((x) => { x.primary = false; });
        const pd = SA.primaryDomain(v.customerId);
        PP.db.domains.push({ id: PP.nextId('DOM', 4), customerId: v.customerId, host, primary, txtName: `_pp-verify.${host}`, txtValue: SA.genTxt(host + Date.now()), target: v.record === 'CNAME' && pd ? `CNAME → ${pd.host}` : `${host}. A → customer server`, status: 'Pending', verifiedAt: null, lastCheck: null, ssl: 'Not started', sslExpires: null, sslIssuer: "Let's Encrypt (ACME, on the customer's server)" });
        PP.audit('Domain added', v.customerId, `${host}${primary ? ' · primary' : ''}`); PP.save();
        PP.ui.toast(`${esc(host)} added. Send the customer the TXT record, then press “Verify now”.`);
        if (onDone) onDone();
      } }],
    });
  };

  function renderDomains(el) {
    const ds = PP.db.domains;
    const ver = ds.filter((d) => d.status === 'Verified').length; const pen = ds.filter((d) => d.status === 'Pending').length; const fail = ds.filter((d) => d.status === 'Failed').length;
    const exp = ds.filter((d) => OPS.sslLabel(d) === 'Expiring').length;
    el.innerHTML = PP.ui.pageHead({ title: 'Domains', subtitle: 'Each customer runs on its own domain. Ownership is proven with a DNS TXT challenge; TLS is issued on the customer’s server.', crumbs: [['Dashboard', '#/dashboard'], ['Domains']], actions: `<button class="btn btn-primary" data-add>${PP.icon('plus')} Add domain</button>` }) + `
      <div class="grid grid-4">${PP.ui.kpi({ label: 'Verified', value: ver, icon: 'checkCircle', tone: 'positive' })}${PP.ui.kpi({ label: 'Pending verification', value: pen, icon: 'clock', tone: 'warning' })}${PP.ui.kpi({ label: 'Failed', value: fail, icon: 'alert', tone: fail ? 'error' : 'positive' })}${PP.ui.kpi({ label: 'SSL expiring ≤ 14 days', value: exp, icon: 'lock', tone: exp ? 'warning' : 'positive', hint: 'Renewal runs automatically on the server' })}</div>
      <div class="mt-4">${SA.pending('PD-029', 'Domain registration as a reseller vs verification only, and temporary vendor subdomains during onboarding.')}</div>
      <section class="card mt-4"><div class="card-head"><h2>Domain-to-tenant mapping</h2></div><div class="card-body flush" data-table></div></section>`;
    PP.ui.table(PP.$('[data-table]', el), {
      getRows: () => PP.db.domains, exportName: 'domains', sortKey: 'host',
      search: { placeholder: 'Search host, customer or tenant ID', text: (d) => { const c = SA.customer(d.customerId); return `${d.host} ${c ? c.name + ' ' + c.tenantId : ''}`; } },
      filters: [
        { id: 'st', label: 'Any verification', options: [['Verified', 'Verified'], ['Pending', 'Pending'], ['Failed', 'Failed']], match: (d, v) => d.status === v },
        { id: 'ssl', label: 'Any SSL status', options: [['Issued', 'Issued'], ['Expiring', 'Expiring'], ['Pending', 'Pending'], ['Not started', 'Not started']], match: (d, v) => OPS.sslLabel(d) === v },
        { id: 'cu', label: 'All customers', options: PP.db.customers.map((c) => [c.id, c.name]), match: (d, v) => d.customerId === v },
      ],
      rowClass: (d) => (d.status === 'Failed' ? 'sa-err-row' : d.status === 'Pending' || OPS.sslLabel(d) === 'Expiring' ? 'sa-warn-row' : ''),
      columns: [
        { key: 'host', label: 'Host', sort: (d) => d.host, render: (d) => `<b>${esc(d.host)}</b>${d.primary ? ' <span class="sa-tag core">Primary</span>' : ''}<span class="sub">${esc(d.target || '')}</span>` },
        { key: 'cu', label: 'Customer · tenant', sort: (d) => SA.customerName(d.customerId), render: (d) => { const c = SA.customer(d.customerId); return `${SA.customerLink(d.customerId)}<span class="sub"><code>${esc(c ? c.tenantId : '')}</code></span>`; }, exportValue: (d) => SA.customerName(d.customerId) },
        { key: 'status', label: 'Verification', sort: (d) => d.status, render: (d) => SA.badge(d.status), exportValue: (d) => d.status },
        { key: 'ssl', label: 'SSL', sort: (d) => d.sslExpires || '', render: (d) => `${SA.badge(OPS.sslLabel(d))}${d.sslExpires ? `<span class="sub">until ${PP.fmt.date(d.sslExpires)}</span>` : ''}`, exportValue: (d) => OPS.sslLabel(d) },
        { key: 'check', label: 'Last check', sort: (d) => d.lastCheck || '', render: (d) => (d.lastCheck ? `${esc(SA.ago(d.lastCheck))}<span class="sub">${PP.fmt.stamp(d.lastCheck)}</span>` : '<span class="muted">Never</span>'), exportValue: (d) => d.lastCheck || '' },
        { key: 'act', label: '', render: (d) => (d.status !== 'Verified' ? `<button class="btn btn-sm" data-vrow="${d.id}">Verify now</button>` : '') },
      ],
      onRowClick: (d) => OPS.domainModal(d.id, () => { if (alive(el)) renderDomains(el); }),
      afterDraw: (box) => PP.$$('[data-vrow]', box).forEach((b) => b.addEventListener('click', async () => { await OPS.verifyDomain(findDomain(b.dataset.vrow), b); if (alive(el)) renderDomains(el); })),
      empty: { icon: 'globe', title: 'No domains yet', text: 'Add the customer’s domain during onboarding.' },
    });
    PP.$('[data-add]', el).addEventListener('click', () => OPS.addDomainModal('', () => { if (alive(el)) renderDomains(el); }));
  }
  PP.route('/domains', { title: 'Domains', perm: 'customers.view', render: ({ el }) => renderDomains(el) });

  SA.panels.domain = function (el, c) {
    const draw = () => {
      if (!alive(el) && el.isConnected === false) return;
      const ds = SA.domainsOf(c.id);
      el.innerHTML = PP.ui.card({ title: 'Domains', actions: `<button class="btn btn-sm btn-primary" data-add>${PP.icon('plus')} Add domain</button>`, flush: true,
        body: ds.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Host</th><th>Verification</th><th>SSL</th><th>Last check</th><th></th></tr></thead><tbody>${ds.map((d) => `<tr><td><b>${esc(d.host)}</b>${d.primary ? ' <span class="sa-tag core">Primary</span>' : ''}<span class="sub">${esc(d.txtName || '')}</span></td><td>${SA.badge(d.status)}</td><td>${SA.badge(OPS.sslLabel(d))}${d.sslExpires ? `<span class="sub">until ${PP.fmt.date(d.sslExpires)}</span>` : ''}</td><td>${d.lastCheck ? esc(SA.ago(d.lastCheck)) : '—'}</td><td class="right"><button class="btn btn-sm" data-open="${d.id}">DNS &amp; actions</button></td></tr>`).join('')}</tbody></table></div>`
          : PP.ui.empty({ icon: 'globe', title: 'No domain yet', text: 'A verified domain is required before the deployment can be activated.' }) }) +
        `<div class="mt-3">${SA.pending('PD-029', 'Vendor registration vs verification only; temporary vendor subdomain.')}</div>`;
      PP.$('[data-add]', el).addEventListener('click', () => OPS.addDomainModal(c.id, draw));
      PP.$$('[data-open]', el).forEach((b) => b.addEventListener('click', () => OPS.domainModal(b.dataset.open, draw)));
    };
    draw();
  };

  /* ================================================================== BRANDING */
  OPS.logoHtml = (b, size) => {
    const s = size || 56; const p = safeColor(b.primary, DEFAULT_PRIMARY);
    return `<div class="sa-logo-box" style="width:${s}px;height:${s}px;background:${p};font-size:${Math.round(s / 2.6)}px">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : esc(PP.initials(b.brandName || '?'))}</div>`;
  };
  OPS.previews = function (b, c) {
    const p = safeColor(b.primary, DEFAULT_PRIMARY); const a = safeColor(b.action, DEFAULT_ACTION);
    const host = (SA.primaryDomain(c.id) || {}).host || 'app.example.com';
    const fav = b.favicon ? `<img src="${esc(b.favicon)}" alt="" style="width:14px;height:14px;border-radius:3px">` : `<span style="width:14px;height:14px;border-radius:3px;background:${p};display:inline-block"></span>`;
    const bar = (label) => `<div class="sa-preview-bar"><i></i><i></i><i></i>${fav}<span>${esc(label)}</span></div>`;
    const pros = SA.term(c, 'professionals');
    return {
      login: `<div class="sa-preview-frame">${bar('https://' + host + '/login')}
        <div class="sa-ops-login"><div class="brand-side" style="background:linear-gradient(165deg, ${p}, ${p}dd)">${OPS.logoHtml(b, 42)}<b>${esc(b.brandName || '')}</b><span>${esc(b.tagline || '')}</span></div>
        <div class="form-side"><b class="h">${esc(b.loginHeadline || 'Welcome back')}</b><span class="ln"></span><span class="ln"></span><span class="btnx" style="background:${a}">Secure sign in</span><span class="small muted">Two-step sign-in for admins</span></div></div></div>`,
      app: `<div class="sa-preview-frame">${bar(host)}<div class="sa-ops-app"><div class="side" style="background:${p}"><div class="row" style="gap:6px">${OPS.logoHtml(b, 22)}<b>${esc(b.brandName || '')}</b></div>
        <span class="it act" style="background:${a}">Dashboard</span><span class="it">Appointments</span><span class="it">Patients</span><span class="it">${esc(pros)}</span><span class="it">Cash Flow</span></div>
        <div class="body"><div class="top"><b>Dashboard</b></div><div class="cards"><span></span><span></span><span></span></div><span class="btnx" style="background:${a}">+ New appointment</span></div></div></div>`,
      invoice: `<div class="sa-preview-frame"><div class="sa-ops-invoice"><div class="row between" style="border-bottom:3px solid ${p};padding-bottom:10px"><div class="row" style="gap:10px">${OPS.logoHtml(b, 36)}<div><b>${esc(b.brandName || '')}</b><div class="small muted">${esc(c.address || '')}</div></div></div><div class="right"><b style="color:${p}">INVOICE</b><div class="small muted">INV-000123 · sample</div></div></div>
        <table><tr><td>Consultation (sample line)</td><td class="right">BDT 1,000</td></tr><tr><td>Follow-up session (sample line)</td><td class="right">BDT 800</td></tr><tr class="tot"><td>Total</td><td class="right" style="color:${a}">BDT 1,800</td></tr></table>
        <div class="foot">${esc(b.invoiceFooter || '')}</div></div></div>`,
      email: `<div class="sa-preview-frame"><div class="sa-ops-email"><div class="hd" style="background:${p}">${OPS.logoHtml(b, 26)}<b>${esc(b.brandName || '')}</b></div>
        <div class="bd"><p>Dear patient,</p><p>Your appointment is confirmed for <b>Sunday, 10:30 AM</b>. (Sample text; real messages are sent by the customer's own notification providers.)</p><span class="btnx" style="background:${a}">View appointment</span><p class="sig">${esc(b.emailSignature || '')}</p></div></div></div>`,
    };
  };

  function renderBrandingList(el) {
    el.innerHTML = PP.ui.pageHead({ title: 'Branding', subtitle: 'White-label branding per customer: name, logo, colours, favicon, login page, invoice and email look.', crumbs: [['Dashboard', '#/dashboard'], ['Branding']] }) +
      PP.ui.alert('info', 'The original Physio Point identity (navy <span class="sa-swatch" style="background:#083E44"></span> and teal <span class="sa-swatch" style="background:#008B83"></span>) is the default theme. Customer branding ships to the deployment inside the signed configuration snapshot.') +
      '<section class="card mt-4"><div class="card-body flush" data-table></div></section>';
    PP.ui.table(PP.$('[data-table]', el), {
      getRows: () => PP.db.customers, exportName: 'branding', sortKey: 'name',
      search: { placeholder: 'Search customer or brand name', text: (c) => `${c.name} ${(c.branding || {}).brandName || ''}` },
      filters: [{ id: 'logo', label: 'Logo: any', options: [['yes', 'Has a logo'], ['no', 'No logo yet']], match: (c, v) => (v === 'yes' ? !!(c.branding || {}).logo : !(c.branding || {}).logo) }],
      columns: [
        { key: 'name', label: 'Customer', sort: (c) => c.name, render: (c) => `<div class="row" style="gap:10px;flex-wrap:nowrap">${OPS.logoHtml(c.branding || {}, 36)}<div><b>${esc(c.name)}</b><span class="sub">${esc(SA.btLabel(c.businessType))}</span></div></div>`, exportValue: (c) => c.name },
        { key: 'brand', label: 'Brand name', sort: (c) => (c.branding || {}).brandName || '', render: (c) => `${esc((c.branding || {}).brandName || '—')}<span class="sub">${esc((c.branding || {}).tagline || '')}</span>` },
        { key: 'col', label: 'Colours', render: (c) => { const b = c.branding || {}; return `<span class="sa-swatch" style="background:${safeColor(b.primary, DEFAULT_PRIMARY)}" title="Primary ${esc(b.primary)}"></span> <span class="sa-swatch" style="background:${safeColor(b.action, DEFAULT_ACTION)}" title="Action ${esc(b.action)}"></span> <span class="small muted mono">${esc(b.primary || '')} · ${esc(b.action || '')}</span>`; }, exportValue: (c) => `${(c.branding || {}).primary} ${(c.branding || {}).action}` },
        { key: 'fav', label: 'Favicon', render: (c) => ((c.branding || {}).favicon ? SA.badge('Active') : '<span class="muted small">Default</span>') },
        { key: 'up', label: 'Updated', sort: (c) => (c.branding || {}).updatedAt || '', render: (c) => ((c.branding || {}).updatedAt ? PP.fmt.stamp(c.branding.updatedAt) : '<span class="muted small">At onboarding</span>') },
        { key: 'go', label: '', render: (c) => `<a class="btn btn-sm" href="#/branding/${c.id}">${PP.icon('edit')} Edit</a>` },
      ],
      onRowClick: (c) => { location.hash = `#/branding/${c.id}`; },
    });
  }
  PP.route('/branding', { title: 'Branding', perm: 'customers.view', render: ({ el }) => renderBrandingList(el) });

  function readImage(file, maxKb) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file chosen.'));
      if (!/^image\/(png|jpeg|svg\+xml|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(file.type)) return reject(new Error('Choose an image file (PNG, JPG, SVG, WebP or ICO).'));
      if (file.size > maxKb * 1024) return reject(new Error(`The file is ${Math.round(file.size / 1024)} KB. The limit is ${maxKb} KB.`));
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('The file could not be read.')); r.readAsDataURL(file);
    });
  }

  PP.route('/branding/:id', {
    title: (p) => `Branding · ${SA.customerName(p.id)}`, perm: 'customers.view',
    render({ params, el }) {
      const c = SA.customer(params.id);
      if (!c) { el.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'alert', title: 'Customer not found', action: '<a class="btn" href="#/branding">Back to branding</a>' }) }); return; }
      const draft = Object.assign({ brandName: c.name, tagline: '', primary: DEFAULT_PRIMARY, action: DEFAULT_ACTION, logo: '', favicon: '', loginHeadline: '', invoiceFooter: '', emailSignature: '' }, PP.clone(c.branding || {}));
      const colorField = (name, label, hint) => `<div class="field" data-field="${name}"><label for="br-${name}">${label}<span class="req">*</span></label><div class="row" style="flex-wrap:nowrap;gap:8px"><input type="color" value="${esc(safeColor(draft[name], DEFAULT_PRIMARY))}" data-color-for="${name}" aria-label="${label} picker" style="width:44px;height:38px;padding:2px;border:1px solid var(--pp-border-strong);border-radius:6px;background:#fff"><input class="input mono" id="br-${name}" name="${name}" value="${esc(draft[name])}" required maxlength="7"></div><div class="hint">${hint}</div><div class="error">Enter a colour like #083E44.</div></div>`;
      el.innerHTML = PP.ui.pageHead({ title: `Branding · ${esc(c.name)}`, subtitle: 'Changes are previewed live. Saving records them in the customer configuration; the deployment receives them with the next signed configuration snapshot.', crumbs: [['Branding', '#/branding'], [c.name, `#/customers/${c.id}`], ['Branding']],
        actions: `<button class="btn" data-reset>${PP.icon('refresh')} Reset to default theme</button><button class="btn btn-primary" data-save>${PP.icon('check')} Save branding</button>` }) + `
        <div class="sa-split">
          <section class="card"><div class="card-head"><h2>Brand settings</h2></div><div class="card-body"><form class="form-grid" novalidate data-form onsubmit="return false">
            ${PP.form.field({ name: 'brandName', label: 'Brand name', required: true, value: draft.brandName, full: true, attrs: 'maxlength="60"' })}
            ${PP.form.field({ name: 'tagline', label: 'Tagline', value: draft.tagline, full: true, attrs: 'maxlength="80"' })}
            ${colorField('primary', 'Primary colour', 'Sidebar, headers. Default #083E44.')}
            ${colorField('action', 'Action colour', 'Buttons, active items. Default #008B83.')}
            <div class="field full"><label>Logo</label><div class="row" data-logo-row></div><div class="hint">PNG, JPG, SVG or WebP, up to 300 KB. Stored as a data URL in this prototype.</div><div class="error" data-logo-err></div></div>
            <div class="field full"><label>Favicon</label><div class="row" data-fav-row></div><div class="hint">Square image, up to 60 KB.</div><div class="error" data-fav-err></div></div>
            ${PP.form.field({ name: 'loginHeadline', label: 'Login page headline', value: draft.loginHeadline, full: true, attrs: 'maxlength="80"' })}
            ${PP.form.field({ name: 'invoiceFooter', label: 'Invoice footer', type: 'textarea', rows: 2, value: draft.invoiceFooter, full: true, attrs: 'maxlength="200"' })}
            ${PP.form.field({ name: 'emailSignature', label: 'Email signature', type: 'textarea', rows: 2, value: draft.emailSignature, full: true, attrs: 'maxlength="200"' })}
          </form></div></section>
          <div class="stack" data-previews></div>
        </div>`;
      const form = PP.$('[data-form]', el); const prevBox = PP.$('[data-previews]', el);
      const drawPreviews = () => { const pv = OPS.previews(draft, c); prevBox.innerHTML = `<div class="sa-ops-plabel">Login page</div>${pv.login}<div class="sa-ops-plabel">Workspace</div>${pv.app}<div class="sa-ops-plabel">Invoice</div>${pv.invoice}<div class="sa-ops-plabel">Email</div>${pv.email}`; };
      const imgRow = (key, rowSel, errSel, maxKb) => {
        const row = PP.$(rowSel, el); const err = PP.$(errSel, el);
        row.innerHTML = `${key === 'logo' ? OPS.logoHtml(draft, 48) : (draft.favicon ? `<img src="${esc(draft.favicon)}" alt="" style="width:32px;height:32px;border-radius:6px;border:1px solid var(--pp-border)">` : '<span class="muted small">Default favicon</span>')}
          <label class="btn btn-sm">${PP.icon('upload')} Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon" hidden data-file></label>${draft[key] ? '<button type="button" class="btn btn-sm btn-ghost" data-rm>Remove</button>' : ''}`;
        PP.$('[data-file]', row).addEventListener('change', async (e) => {
          const fld = row.closest('.field'); fld.classList.remove('has-error');
          try { draft[key] = await readImage(e.target.files[0], maxKb); PP.ui.toast(`${key === 'logo' ? 'Logo' : 'Favicon'} loaded. Save to keep it.`, 'info'); imgRow(key, rowSel, errSel, maxKb); drawPreviews(); }
          catch (ex) { err.textContent = ex.message; fld.classList.add('has-error'); }
        });
        const rm = PP.$('[data-rm]', row); if (rm) rm.addEventListener('click', () => { draft[key] = ''; imgRow(key, rowSel, errSel, maxKb); drawPreviews(); });
      };
      const imgs = () => { imgRow('logo', '[data-logo-row]', '[data-logo-err]', 300); imgRow('favicon', '[data-fav-row]', '[data-fav-err]', 60); };
      imgs(); drawPreviews();
      form.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.colorFor) { const inp = PP.$(`[name="${t.dataset.colorFor}"]`, form); inp.value = t.value.toUpperCase(); }
        const v = PP.form.read(form); ['brandName', 'tagline', 'loginHeadline', 'invoiceFooter', 'emailSignature', 'primary', 'action'].forEach((k) => { draft[k] = v[k]; });
        ['primary', 'action'].forEach((k) => { const fld = PP.$(`[data-field="${k}"]`, form); const ok = HEX.test(draft[k]); fld.classList.toggle('has-error', !ok && draft[k].length >= 7); if (ok) PP.$(`[data-color-for="${k}"]`, form).value = draft[k]; });
        if (t.name === 'brandName' && !draft.logo) imgs();
        drawPreviews();
      });
      PP.$('[data-reset]', el).addEventListener('click', () => {
        draft.primary = DEFAULT_PRIMARY; draft.action = DEFAULT_ACTION;
        ['primary', 'action'].forEach((k) => { PP.$(`[name="${k}"]`, form).value = draft[k]; PP.$(`[data-color-for="${k}"]`, form).value = draft[k]; });
        imgs(); drawPreviews(); PP.ui.toast('Colours set to the original Physio Point theme. Save to apply.', 'info');
      });
      PP.$('[data-save]', el).addEventListener('click', async (e) => {
        if (!guard('branding.manage')) return;
        if (!PP.form.validate(form)) return;
        let bad = false; ['primary', 'action'].forEach((k) => { if (!HEX.test(draft[k])) { PP.form.setError(form, k, 'Enter a colour like #083E44.'); bad = true; } });
        if (bad) { PP.ui.toast('Please fix the highlighted colours.', 'error'); return; }
        await PP.ui.busy(e.currentTarget, async () => {
          const before = c.branding || {}; const changes = ['brandName', 'tagline', 'primary', 'action', 'loginHeadline', 'invoiceFooter', 'emailSignature'].filter((k) => String(before[k] || '') !== String(draft[k] || ''));
          if (before.logo !== draft.logo) changes.push('logo'); if (before.favicon !== draft.favicon) changes.push('favicon');
          c.branding = Object.assign({}, draft, { updatedAt: PP.nowStamp(), updatedBy: me() });
          PP.audit('Branding updated', c.id, changes.length ? `Changed: ${changes.join(', ')}` : 'Saved without changes'); PP.save();
          PP.ui.toast('Branding saved. It ships to the deployment with the next signed configuration snapshot.');
        }, 500);
      });
    },
  });

  SA.panels.branding = function (el, c) {
    const b = c.branding || {}; const pv = OPS.previews(b, c);
    el.innerHTML = `<div class="sa-split">${PP.ui.card({ title: 'Branding', actions: `<a class="btn btn-sm btn-primary" href="#/branding/${c.id}">${PP.icon('edit')} Open editor</a>`,
      body: `<div class="row" style="gap:14px">${OPS.logoHtml(b, 56)}<div><b>${esc(b.brandName || c.name)}</b><div class="small muted">${esc(b.tagline || '')}</div></div></div>
        <dl class="kv mt-4"><dt>Primary colour</dt><dd><span class="sa-swatch" style="background:${safeColor(b.primary, DEFAULT_PRIMARY)}"></span> <span class="mono">${esc(b.primary || DEFAULT_PRIMARY)}</span></dd>
        <dt>Action colour</dt><dd><span class="sa-swatch" style="background:${safeColor(b.action, DEFAULT_ACTION)}"></span> <span class="mono">${esc(b.action || DEFAULT_ACTION)}</span></dd>
        <dt>Favicon</dt><dd>${b.favicon ? 'Custom' : 'Default'}</dd><dt>Login headline</dt><dd>${esc(b.loginHeadline || '—')}</dd><dt>Invoice footer</dt><dd>${esc(b.invoiceFooter || '—')}</dd><dt>Last change</dt><dd>${b.updatedAt ? `${PP.fmt.stamp(b.updatedAt)} · ${esc(b.updatedBy || '')}` : 'At onboarding'}</dd></dl>
        <p class="small muted mt-3">Branding ships in the signed configuration snapshot. The original Physio Point theme is the default.</p>` })}
      <div class="stack"><div class="sa-ops-plabel">Login page preview</div>${pv.login}</div></div>`;
  };

  /* ================================================================== LICENCES */
  const maskKey = (k) => { const parts = String(k || '').split('-'); return parts.length > 2 ? `${parts[0]}-${parts.slice(1, -1).map(() => '••••').join('-')}-${parts[parts.length - 1]}` : k; };
  OPS.maskKey = maskKey;
  const addMonths = (iso, n) => { const d = PP.parseISO(iso); d.setMonth(d.getMonth() + n); d.setDate(d.getDate() - 1); return PP.isoOf(d); };
  const findLic = (id) => PP.db.licences.find((l) => l.id === id) || null;
  const stateLabel = (s) => (s === 'Expired' ? 'Expired' : s);
  OPS.licenceToken = function (lic) {
    const c = SA.customer(lic.customerId) || {}; const set = SA.latestSet(lic.customerId); const plan = SA.plan(lic.planId) || {};
    const hours = (PP.db.settings && PP.db.settings.validationHours) || 24;
    const t = { tenant_id: c.tenantId, licence_id: lic.id, domains: lic.domains, plan: plan.code || lic.planId, period: { start: lic.start, end: lic.end }, state: SA.licenceState(lic).toUpperCase(), grace_days: SA.graceDays(), entitlement_set_version: set ? set.version : 0, issued_at: lic.issuedAt, next_refresh: new Date(Date.now() + hours * 3600000).toISOString() };
    t.signature = SA.sign(t);
    return t;
  };
  const stateNote = () => `<b>States (D-017, PD-028 pending):</b> Active → <b>Grace</b> for ${SA.graceDays()} days after expiry (full use, warning banner) → <b>Read-only</b> (records viewable, printable and exportable; no new clinical or financial entries). Nothing is ever deleted or encrypted, and login, reading and export are never blocked.`;

  function licenceForm(v, c) {
    const ds = SA.domainsOf(c ? c.id : v.customerId || '');
    return `<form class="form-grid" novalidate onsubmit="return false" data-lf>
      ${PP.form.field({ name: 'customerId', label: 'Customer', type: 'select', required: true, value: v.customerId || '', options: PP.db.customers.map((x) => [x.id, x.name]), full: true })}
      ${PP.form.field({ name: 'planId', label: 'Plan', type: 'select', required: true, value: v.planId || (c ? c.planId : ''), options: PP.db.plans.filter((p) => p.status !== 'Retired' || (c && c.planId === p.id)).map((p) => [p.id, p.name]) })}
      ${PP.form.field({ name: 'start', label: 'Start date', type: 'date', required: true, value: v.start || PP.today() })}
      ${PP.form.field({ name: 'duration', label: 'Duration', type: 'select', placeholder: false, value: v.duration || '12', options: [['12', '12 months'], ['24', '24 months'], ['36', '36 months'], ['custom', 'Custom end date']] })}
      ${PP.form.field({ name: 'end', label: 'End date', type: 'date', value: v.end || '', hint: 'Used with “Custom end date”.' })}
      <div class="field full" data-field="domains"><label>Bound domains<span class="req">*</span></label><div class="stack" style="gap:6px">${ds.length ? ds.map((d) => `<label class="check"><input type="checkbox" name="dom-${esc(d.id)}" data-dom="${esc(d.host)}" ${d.status === 'Verified' ? 'checked' : ''}> ${esc(d.host)} ${SA.badge(d.status)}</label>`).join('') : '<span class="small muted">This customer has no domain yet. Add one under Domains first.</span>'}</div><div class="error">Bind at least one domain.</div></div>
      ${PP.form.field({ name: 'note', label: 'Note (internal)', full: true })}
    </form>`;
  }
  function readLicenceForm(f) {
    const v = PP.form.read(f); PP.form.clearErrors(f);
    const domains = PP.$$('[data-dom]', f).filter((x) => x.checked).map((x) => x.dataset.dom);
    const end = v.duration === 'custom' ? v.end : addMonths(v.start, Number(v.duration));
    let ok = PP.form.validate(f);
    if (ok && v.duration === 'custom' && !v.end) { PP.form.setError(f, 'end', 'Choose the end date.'); ok = false; }
    if (ok && end <= v.start) { PP.form.setError(f, 'end', 'The end date must be after the start date.'); ok = false; }
    if (ok && !domains.length) { PP.form.setError(f, 'domains', 'Bind at least one domain.'); ok = false; }
    return ok ? Object.assign(v, { domains, end }) : null;
  }
  function supersede(cId) { PP.db.licences.filter((l) => l.customerId === cId && l.status === 'Issued').forEach((l) => { l.status = 'Superseded'; l.supersededAt = PP.nowStamp(); }); }

  OPS.issueLicence = function (customerId, onDone) {
    if (!guard('licences.manage')) return;
    const draw = (body, v) => {
      const c = SA.customer(v.customerId);
      body.innerHTML = `${licenceForm(v, c)}<div class="mt-3">${PP.ui.alert('info', 'Issuing supersedes the customer’s current licence. The deployment pulls the new signed licence at its next validation; no inbound vendor access is needed (D-021).')}</div>`;
      PP.$('[name=customerId]', body).addEventListener('change', (e) => { const cc = SA.customer(e.target.value); draw(body, { customerId: e.target.value, planId: cc ? cc.planId : '' }); });
    };
    const cur = customerId ? SA.licenceOf(customerId) : null;
    PP.ui.modal({
      title: 'Issue a licence', size: 'lg', body: '',
      onOpen: (body) => draw(body, { customerId: customerId || '', planId: customerId ? (SA.customer(customerId) || {}).planId : '', start: cur && SA.licenceState(cur) === 'Active' ? PP.addDays(cur.end, 1) : PP.today() }),
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Issue signed licence', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('[data-lf]', body); const v = readLicenceForm(f); if (!v) return false;
        await PP.sleep(500);
        supersede(v.customerId);
        const lic = { id: PP.nextId('LIC', 4), customerId: v.customerId, key: SA.genLicenceKey(), planId: v.planId, start: v.start, end: v.end, status: 'Issued', domains: v.domains, issuedAt: PP.nowStamp(), by: me(), note: v.note || '' };
        PP.db.licences.push(lic);
        PP.audit('Licence issued', v.customerId, `${lic.id} · ${SA.planName(v.planId)} · ${PP.fmt.date(v.start)} – ${PP.fmt.date(v.end)} · ${v.domains.join(', ')}`); PP.save();
        PP.ui.toast(`Licence ${lic.id} issued and signed. The deployment picks it up at the next validation.`);
        if (onDone) onDone();
      } }],
    });
  };
  OPS.renewLicence = function (lic, onDone) {
    if (!guard('licences.manage')) return;
    const st = SA.licenceState(lic); const start = st === 'Expired' || st === 'Revoked' ? PP.today() : PP.addDays(lic.end, 1);
    PP.ui.modal({
      title: `Renew licence · ${esc(SA.customerName(lic.customerId))}`, body: `<form class="form-grid" novalidate onsubmit="return false">
        <div class="field full"><label>Current licence</label><div>${esc(maskKey(lic.key))} · ${SA.badge(st)} · ends ${PP.fmt.date(lic.end)}</div></div>
        ${PP.form.field({ name: 'start', label: 'New period starts', type: 'date', required: true, value: start, hint: st === 'Expired' ? 'Expired licence: the new period starts today.' : 'Continues from the current end date.' })}
        ${PP.form.field({ name: 'duration', label: 'Extend by', type: 'select', placeholder: false, value: '12', options: [['12', '12 months'], ['24', '24 months'], ['custom', 'Custom end date']] })}
        ${PP.form.field({ name: 'end', label: 'Custom end date', type: 'date' })}
        ${PP.form.field({ name: 'note', label: 'Note (for example the paid invoice)', full: true })}
      </form><div class="mt-3">${PP.ui.alert('info', 'A new signed licence record is created; the current one is marked Superseded. The deployment pulls it at its next validation and leaves grace or read-only mode automatically.')}</div>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Renew licence', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        const end = v.duration === 'custom' ? v.end : addMonths(v.start, Number(v.duration));
        if (!end) { PP.form.setError(f, 'end', 'Choose the end date.'); return false; }
        if (end <= v.start) { PP.form.setError(f, 'end', 'The end date must be after the start date.'); return false; }
        await PP.sleep(500);
        supersede(lic.customerId);
        const n = { id: PP.nextId('LIC', 4), customerId: lic.customerId, key: SA.genLicenceKey(), planId: lic.planId, start: v.start, end, status: 'Issued', domains: lic.domains.slice(), issuedAt: PP.nowStamp(), by: me(), note: v.note || `Renewal of ${lic.id}`, renewalOf: lic.id };
        PP.db.licences.push(n);
        PP.audit('Licence renewed', lic.customerId, `${lic.id} → ${n.id} · until ${PP.fmt.date(end)}`); PP.save();
        PP.ui.toast(`Licence renewed until ${PP.fmt.date(end)}. The deployment pulls it at the next validation.`);
        if (onDone) onDone();
      } }],
    });
  };
  OPS.revokeLicence = async function (lic, onDone) {
    if (!guard('licences.manage')) return;
    const r = await PP.ui.confirm({ title: 'Revoke licence?', danger: true, confirmLabel: 'Revoke licence', reasonLabel: 'Reason (recorded in the audit log)', reasonRequired: true,
      message: `Revoking <b>${esc(maskKey(lic.key))}</b> for <b>${esc(SA.customerName(lic.customerId))}</b> moves the deployment to <b>read-only mode</b> at its next validation. All records stay viewable, printable and exportable; nothing is deleted or encrypted (D-017).` });
    if (!r) return;
    lic.status = 'Revoked'; lic.revokedAt = PP.nowStamp(); lic.revokedBy = me(); lic.revokedReason = r.reason;
    PP.audit('Licence revoked', lic.customerId, `${lic.id} · ${r.reason}`); PP.save();
    PP.ui.toast('Licence revoked. The deployment switches to read-only mode; data stays accessible.', 'warning', 4200);
    if (onDone) onDone();
  };
  OPS.licenceModal = function (licId, onChange) {
    const lic = findLic(licId); if (!lic) return;
    const st = SA.licenceState(lic); const showKey = PP.can('licences.manage');
    const m = PP.ui.modal({ title: `Licence ${esc(lic.id)}`, size: 'lg', buttons: [{ label: 'Close', kind: 'ghost' }], body: `
      <div class="row between"><div>${SA.customerLink(lic.customerId)} · ${esc(SA.planName(lic.planId))}</div>${SA.badge(stateLabel(st))}</div>
      <dl class="kv mt-3"><dt>Licence key</dt><dd><div class="sa-copy"><span class="sa-code">${esc(showKey ? lic.key : maskKey(lic.key))}</span>${showKey ? copyBtn(lic.key, 'licence key') : ''}</div></dd>
        <dt>Period</dt><dd>${PP.fmt.date(lic.start)} – ${PP.fmt.date(lic.end)} ${st === 'Active' ? `<span class="small muted">(${SA.daysLeft(lic.end)} days left)</span>` : ''}</dd>
        <dt>Bound domains</dt><dd><div class="sa-pill-list">${lic.domains.map((d) => `<span class="sa-pill">${esc(d)}</span>`).join('')}</div></dd>
        <dt>Issued</dt><dd>${PP.fmt.stamp(lic.issuedAt)} · ${esc(lic.by || '')}</dd>
        ${lic.status === 'Revoked' ? `<dt>Revoked</dt><dd>${PP.fmt.stamp(lic.revokedAt)} · ${esc(lic.revokedBy || '')} — ${esc(lic.revokedReason || '')}</dd>` : ''}
        ${lic.note ? `<dt>Note</dt><dd>${esc(lic.note)}</dd>` : ''}</dl>
      <h3 class="mt-4">Signed licence token</h3><p class="small muted">What the deployment receives and verifies with the vendor public key. There is no patient data and no secret in the token.</p>
      <pre class="sa-code sa-ops-json">${esc(JSON.stringify(OPS.licenceToken(lic), null, 2))}</pre>
      <div class="mt-3">${PP.ui.alert('info', stateNote())}</div>
      ${['Superseded', 'Revoked'].includes(st) ? '' : `<div class="row mt-4"><button class="btn btn-primary" data-renew>${PP.icon('refresh')} Renew</button><button class="btn btn-danger" data-revoke>Revoke</button></div>`}` });
    bindCopy(m.body); closeOnLinks(m);
    const done = () => { if (onChange) onChange(); };
    const rn = PP.$('[data-renew]', m.body); if (rn) rn.addEventListener('click', () => { m.close(); OPS.renewLicence(lic, done); });
    const rv = PP.$('[data-revoke]', m.body); if (rv) rv.addEventListener('click', () => { m.close(); OPS.revokeLicence(lic, done); });
  };
  /** Simulates one validation call from a deployment (pull model). */
  OPS.simulateHeartbeat = function (customerId) {
    const c = SA.customer(customerId); const dep = SA.deployment(customerId); const lic = SA.licenceOf(customerId);
    if (!c || !dep || dep.updateStatus === 'Not installed') { PP.ui.toast('This customer has no installed deployment yet, so there is nothing to call in.', 'warning'); return null; }
    const ls = SA.licenceState(lic);
    const result = c.status === 'Suspended' ? 'Suspended' : ls === 'Active' || ls === 'Scheduled' ? 'Valid' : ls === 'Grace' ? 'Grace' : 'Expired';
    const set = SA.latestSet(customerId);
    const chk = { id: PP.nextId('VAL', 6), customerId, licenceId: lic ? lic.id : null, at: PP.nowStamp(), result, version: dep.version, entitlementVersion: set ? set.version : 0, nonce: SA.hash(Math.random() + customerId, 12), detail: result === 'Valid' ? 'Signed licence and entitlement set returned.' : result === 'Grace' ? 'Licence expired; grace period running. Warning banner shown to admins.' : 'Read-only mode: records viewable and exportable; new entries paused (D-017).' };
    PP.db.licenceChecks.unshift(chk);
    dep.lastHeartbeat = chk.at; if (dep.health === 'Down') dep.health = 'Warning';
    c.entitlementVersion = set ? set.version : c.entitlementVersion;
    PP.audit('Heartbeat simulated', customerId, `${result} · app ${dep.version}`); PP.save();
    PP.ui.toast(`Heartbeat from ${esc(c.name)}: ${esc(result)}.`, result === 'Valid' ? 'positive' : 'warning');
    return chk;
  };

  function renderLicences(el, tab) {
    const cur = PP.db.licences.filter((l) => l.status !== 'Superseded');
    const states = cur.map((l) => ({ l, s: SA.licenceState(l) }));
    const active = states.filter((x) => x.s === 'Active').length; const soon = states.filter((x) => x.s === 'Active' && SA.daysLeft(x.l.end) <= 30).length;
    const grace = states.filter((x) => x.s === 'Grace').length; const ro = states.filter((x) => x.s === 'Expired' || x.s === 'Revoked').length;
    el.innerHTML = PP.ui.pageHead({ title: 'Licences', subtitle: 'Signed licences bound to the tenant ID and verified domains. Deployments validate them on a schedule (pull model).', crumbs: [['Dashboard', '#/dashboard'], ['Licences']],
      actions: `<button class="btn" data-hb>${PP.icon('activity')} Simulate heartbeat</button><button class="btn btn-primary" data-issue>${PP.icon('plus')} Issue licence</button>` }) + `
      <div class="grid grid-4">${PP.ui.kpi({ label: 'Active', value: active, icon: 'shield', tone: 'positive' })}${PP.ui.kpi({ label: 'Expiring ≤ 30 days', value: soon, icon: 'clock', tone: soon ? 'warning' : 'positive', hint: 'Send renewal reminders from Vendor billing' })}${PP.ui.kpi({ label: 'In grace', value: grace, icon: 'alert', tone: grace ? 'warning' : 'positive', hint: `${SA.graceDays()}-day grace (PD-028)` })}${PP.ui.kpi({ label: 'Expired or revoked', value: ro, icon: 'lock', tone: ro ? 'error' : 'positive', hint: 'Read-only mode, data kept' })}</div>
      <div class="mt-4">${PP.ui.alert('info', stateNote())}</div>
      <section class="card mt-4"><div data-tabs style="padding:0 12px"></div><div data-body></div></section>`;
    const body = PP.$('[data-body]', el);
    const redraw = (t) => { if (alive(el)) renderLicences(el, t || activeTab); };
    const drawList = () => {
      body.innerHTML = '<div data-t></div>';
      PP.ui.table(PP.$('[data-t]', body), {
        getRows: () => PP.db.licences, exportName: 'licences', sortKey: 'end',
        search: { placeholder: 'Search customer, licence ID or domain', text: (l) => `${SA.customerName(l.customerId)} ${l.id} ${l.domains.join(' ')} ${l.key.slice(-4)}` },
        filters: [
          { id: 'scope', label: 'All licences (incl. superseded)', value: 'current', options: [['current', 'Current licences only']], match: (l) => l.status !== 'Superseded' },
          { id: 'st', label: 'Any state', options: ['Active', 'Grace', 'Expired', 'Revoked', 'Scheduled', 'Superseded'].map((s) => [s, s]), match: (l, v) => SA.licenceState(l) === v },
          { id: 'exp', label: 'Any expiry', options: [['30', 'Expiring ≤ 30 days'], ['90', 'Expiring ≤ 90 days']], match: (l, v) => SA.licenceState(l) === 'Active' && SA.daysLeft(l.end) <= Number(v) },
        ],
        rowClass: (l) => { const s = SA.licenceState(l); return s === 'Expired' || s === 'Revoked' ? 'sa-err-row' : s === 'Grace' || (s === 'Active' && SA.daysLeft(l.end) <= 30) ? 'sa-warn-row' : ''; },
        columns: [
          { key: 'key', label: 'Licence', sort: (l) => l.id, render: (l) => `<span class="mono">${esc(maskKey(l.key))}</span><span class="sub">${esc(l.id)}</span>`, exportValue: (l) => maskKey(l.key) },
          { key: 'cu', label: 'Customer', sort: (l) => SA.customerName(l.customerId), render: (l) => SA.customerLink(l.customerId), exportValue: (l) => SA.customerName(l.customerId) },
          { key: 'plan', label: 'Plan', sort: (l) => SA.planName(l.planId), render: (l) => esc(SA.planName(l.planId)) },
          { key: 'start', label: 'Start', sort: (l) => l.start, render: (l) => PP.fmt.date(l.start) },
          { key: 'end', label: 'End', sort: (l) => l.end, render: (l) => PP.fmt.date(l.end) },
          { key: 'left', label: 'Days left', align: 'right', sort: (l) => SA.daysLeft(l.end), render: (l) => { const d = SA.daysLeft(l.end); return ['Superseded', 'Revoked'].includes(l.status) ? '—' : d < 0 ? `<span class="sa-over">${d}</span>` : String(d); } },
          { key: 'state', label: 'State', sort: (l) => SA.licenceState(l), render: (l) => SA.badge(stateLabel(SA.licenceState(l))), exportValue: (l) => SA.licenceState(l) },
          { key: 'dom', label: 'Bound domains', render: (l) => l.domains.map((d) => `<span class="small">${esc(d)}</span>`).join('<br>'), exportValue: (l) => l.domains.join(' ') },
          { key: 'act', label: '', render: (l) => (['Superseded', 'Revoked'].includes(l.status) ? '' : `<span class="row-actions"><button class="btn btn-sm" data-renew="${l.id}">Renew</button><button class="btn btn-sm btn-ghost" data-revoke="${l.id}" aria-label="Revoke ${esc(l.id)}">Revoke</button></span>`) },
        ],
        onRowClick: (l) => OPS.licenceModal(l.id, () => redraw('list')),
        afterDraw: (box) => {
          PP.$$('[data-renew]', box).forEach((b) => b.addEventListener('click', () => OPS.renewLicence(findLic(b.dataset.renew), () => redraw('list'))));
          PP.$$('[data-revoke]', box).forEach((b) => b.addEventListener('click', () => OPS.revokeLicence(findLic(b.dataset.revoke), () => redraw('list'))));
        },
        empty: { icon: 'shield', title: 'No licences issued yet' },
      });
    };
    const drawLog = () => {
      body.innerHTML = `<div style="padding:16px 20px 0">${PP.ui.alert('info', 'Each deployment calls the licence validation API with its deployment identity, a nonce and a timestamp. Replays are refused. Interval: every ' + ((PP.db.settings.validationHours) || 24) + ' h (PD-028 pending).')}</div><div data-t></div>`;
      PP.ui.table(PP.$('[data-t]', body), {
        getRows: () => PP.db.licenceChecks, exportName: 'licence-validation-log', pageSize: 25,
        search: { placeholder: 'Search customer, nonce or detail', text: (x) => `${SA.customerName(x.customerId)} ${x.nonce} ${x.detail} ${x.version}` },
        filters: [
          { id: 'res', label: 'Any result', options: ['Valid', 'Grace', 'Expired', 'Suspended', 'Rejected', 'Unreachable'].map((s) => [s, s]), match: (x, v) => x.result === v },
          { id: 'cu', label: 'All customers', options: PP.db.customers.map((c) => [c.id, c.name]), match: (x, v) => x.customerId === v },
        ],
        rowClass: (x) => (['Rejected', 'Expired', 'Suspended'].includes(x.result) ? 'sa-err-row' : ['Grace', 'Unreachable'].includes(x.result) ? 'sa-warn-row' : ''),
        columns: [
          { key: 'at', label: 'Time', sort: (x) => x.at, render: (x) => `${PP.fmt.stamp(x.at)}<span class="sub">${esc(SA.ago(x.at))}</span>`, exportValue: (x) => x.at },
          { key: 'cu', label: 'Customer', sort: (x) => SA.customerName(x.customerId), render: (x) => SA.customerLink(x.customerId), exportValue: (x) => SA.customerName(x.customerId) },
          { key: 'res', label: 'Result', sort: (x) => x.result, render: (x) => SA.badge(x.result), exportValue: (x) => x.result },
          { key: 'ver', label: 'App version', sort: (x) => x.version || '', render: (x) => `<span class="mono">${esc(x.version || '—')}</span>` },
          { key: 'ev', label: 'Entitlement set', align: 'right', sort: (x) => x.entitlementVersion, render: (x) => `v${esc(x.entitlementVersion)}` },
          { key: 'nonce', label: 'Nonce', render: (x) => `<code>${esc(x.nonce)}</code>` },
          { key: 'detail', label: 'Detail', render: (x) => `<span class="small">${esc(x.detail || '')}</span>` },
        ],
        empty: { icon: 'activity', title: 'No validation calls yet' },
      });
    };
    const activeTab = tab === 'log' ? 'log' : 'list';
    PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: [{ id: 'list', label: 'Licences', count: cur.length }, { id: 'log', label: 'Validation log' }], active: activeTab, onChange: (t) => { if (t === 'log') drawLog(); else drawList(); } });
    if (activeTab === 'log') drawLog(); else drawList();
    PP.$('[data-issue]', el).addEventListener('click', () => OPS.issueLicence('', () => redraw('list')));
    PP.$('[data-hb]', el).addEventListener('click', () => {
      PP.ui.modal({ title: 'Simulate a heartbeat', size: 'sm', body: `<form novalidate onsubmit="return false">${PP.form.field({ name: 'customerId', label: 'Deployment of', type: 'select', required: true, options: PP.db.customers.filter((c) => { const d = SA.deployment(c.id); return d && d.updateStatus !== 'Not installed'; }).map((c) => [c.id, c.name]) })}</form><p class="small muted">The deployment sends its version and aggregated counters, and receives the signed licence and entitlement set.</p>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Send heartbeat', kind: 'primary', onClick: async ({ body: b }) => { const f = PP.$('form', b); if (!PP.form.validate(f)) return false; await PP.sleep(500); OPS.simulateHeartbeat(PP.form.read(f).customerId); redraw('log'); } }] });
    });
  }
  PP.route('/licences', { title: 'Licences', perm: 'customers.view', render: ({ el, query }) => renderLicences(el, query.tab) });

  SA.panels.licence = function (el, c) {
    const draw = () => {
      const lic = SA.licenceOf(c.id); const st = SA.licenceState(lic);
      const checks = PP.db.licenceChecks.filter((x) => x.customerId === c.id).slice(0, 5);
      const hist = SA.licencesOf(c.id);
      el.innerHTML = `<div class="sa-split">${PP.ui.card({ title: 'Current licence', actions: `${lic && !['Revoked'].includes(st) ? `<button class="btn btn-sm" data-renew>${PP.icon('refresh')} Renew</button><button class="btn btn-sm btn-ghost" data-revoke>Revoke</button>` : ''}<button class="btn btn-sm btn-primary" data-issue>${PP.icon('plus')} Issue</button>`,
        body: lic ? `<div class="row between"><span class="mono">${esc(maskKey(lic.key))}</span>${SA.badge(stateLabel(st))}</div>
          <dl class="kv mt-3"><dt>Plan</dt><dd>${esc(SA.planName(lic.planId))}</dd><dt>Period</dt><dd>${PP.fmt.date(lic.start)} – ${PP.fmt.date(lic.end)}${st === 'Active' ? ` · ${SA.daysLeft(lic.end)} days left` : ''}</dd>
          <dt>Bound domains</dt><dd>${lic.domains.map(esc).join(', ')}</dd><dt>Issued</dt><dd>${PP.fmt.stamp(lic.issuedAt)} · ${esc(lic.by || '')}</dd>${lic.revokedReason ? `<dt>Revoked</dt><dd>${esc(lic.revokedReason)}</dd>` : ''}</dl>
          <div class="row mt-3"><button class="btn btn-sm" data-token>${PP.icon('file')} View signed token</button><button class="btn btn-sm" data-hb>${PP.icon('activity')} Simulate heartbeat</button></div>
          <div class="mt-3">${PP.ui.alert(st === 'Active' ? 'info' : 'warning', stateNote())}</div>` : PP.ui.empty({ icon: 'shield', title: 'No licence issued', text: 'Issue a licence bound to the verified domain.' }) })}
        <div class="stack">${PP.ui.card({ title: 'Recent validation calls', flush: true, actions: '<a class="btn btn-sm btn-ghost" href="#/licences?tab=log">Full log</a>', body: checks.length ? `<ul class="list sa-list-compact">${checks.map((x) => `<li><div class="grow"><b>${SA.badge(x.result)}</b> <span class="small muted">app ${esc(x.version || '—')} · set v${esc(x.entitlementVersion)}</span><span class="sub small muted" style="display:block">${PP.fmt.stamp(x.at)}${x.detail ? ' · ' + esc(x.detail) : ''}</span></div></li>`).join('')}</ul>` : PP.ui.empty({ icon: 'activity', title: 'No calls yet' }) })}
        ${PP.ui.card({ title: 'Licence history', flush: true, body: hist.length ? `<ul class="list sa-list-compact">${hist.map((l) => `<li><div class="grow"><span class="mono">${esc(l.id)}</span> ${SA.badge(SA.licenceState(l))}<span class="sub small muted" style="display:block">${PP.fmt.date(l.start)} – ${PP.fmt.date(l.end)} · ${esc(SA.planName(l.planId))}</span></div><button class="btn btn-sm btn-ghost" data-open="${l.id}">Open</button></li>`).join('')}</ul>` : PP.ui.empty({ title: 'No licences' }) })}</div></div>`;
      const q = (s) => PP.$(s, el);
      if (q('[data-issue]')) q('[data-issue]').addEventListener('click', () => OPS.issueLicence(c.id, draw));
      if (q('[data-renew]')) q('[data-renew]').addEventListener('click', () => OPS.renewLicence(lic, draw));
      if (q('[data-revoke]')) q('[data-revoke]').addEventListener('click', () => OPS.revokeLicence(lic, draw));
      if (q('[data-token]')) q('[data-token]').addEventListener('click', () => OPS.licenceModal(lic.id, draw));
      if (q('[data-hb]')) q('[data-hb]').addEventListener('click', () => { OPS.simulateHeartbeat(c.id); draw(); });
      PP.$$('[data-open]', el).forEach((b) => b.addEventListener('click', () => OPS.licenceModal(b.dataset.open, draw)));
    };
    draw();
  };

  /* ================================================================== RELEASES & UPDATES */
  OPS.semver = function (v) { const m = String(v || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/); return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] || null] : [0, 0, 0, null]; };
  OPS.cmpVersion = function (a, b) {
    const x = OPS.semver(a); const y = OPS.semver(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    if (x[3] === y[3]) return 0; if (!x[3]) return 1; if (!y[3]) return -1; return x[3] < y[3] ? -1 : 1;
  };
  const findRel = (id) => PP.db.releases.find((r) => r.id === id) || null;
  const statusFor = (dep) => {
    if (dep.updateStatus === 'Not installed' || dep.updateStatus === 'Updating') return dep.updateStatus;
    const target = PP.db.channels[dep.channel];
    if (OPS.cmpVersion(dep.version, target) >= 0) return 'Up to date';
    return dep.updateStatus === 'Failed' || dep.updateStatus === 'Rolled back' ? dep.updateStatus : 'Update available';
  };
  OPS.refreshUpdateStatus = () => PP.db.deployments.forEach((d) => { d.updateStatus = statusFor(d); });

  OPS.newReleaseModal = function (onDone) {
    if (!guard('releases.publish')) return;
    PP.ui.modal({ title: 'New release (draft)', size: 'lg', body: `<form class="form-grid" novalidate onsubmit="return false">
      ${PP.form.field({ name: 'version', label: 'Version', required: true, placeholder: '1.5.0 or 1.5.0-rc.3', hint: 'Semantic version, unique.' })}
      ${PP.form.field({ name: 'channel', label: 'Intended channel', type: 'select', placeholder: false, value: 'early', options: [['early', 'Early'], ['stable', 'Stable']] })}
      ${PP.form.field({ name: 'minPrevious', label: 'Minimum previous version', required: true, value: PP.db.channels.stable })}
      ${PP.form.field({ name: 'migrations', label: 'Contains database migrations', type: 'checkbox', value: true })}
      ${PP.form.field({ name: 'notes', label: 'Release notes', type: 'textarea', rows: 4, required: true, full: true })}
    </form><p class="small muted">CI builds the signed container images and migration bundle; this registry records the release and its update manifest.</p>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create draft', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(v.version)) { PP.form.setError(f, 'version', 'Use a semantic version such as 1.5.0 or 1.5.0-rc.3.'); return false; }
        if (PP.db.releases.some((r) => r.version === v.version)) { PP.form.setError(f, 'version', 'This version already exists in the registry.'); return false; }
        if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(v.minPrevious)) { PP.form.setError(f, 'minPrevious', 'Use a semantic version.'); return false; }
        await PP.sleep(400);
        PP.db.releases.unshift({ id: PP.nextId('REL', 4), version: v.version, date: PP.today(), channel: v.channel, status: 'Draft', signature: 'Unsigned', digest: `sha256:${SA.hash('img' + v.version + Date.now(), 64)}`, manifestSig: null, minPrevious: v.minPrevious, migrations: v.migrations, notes: v.notes, by: me(), rolledOutTo: [] });
        PP.audit('Release drafted', v.version, v.notes.slice(0, 80)); PP.save(); PP.ui.toast(`Release ${esc(v.version)} drafted. Sign it before publishing.`);
        if (onDone) onDone();
      } }] });
  };
  OPS.signRelease = async function (rel, btn) {
    if (!guard('releases.publish')) return;
    await PP.ui.busy(btn, async () => {
      rel.signature = 'Signed'; rel.manifestSig = SA.sign({ v: rel.version, d: rel.digest, min: rel.minPrevious }); rel.signedAt = PP.nowStamp(); rel.signedBy = me();
      PP.audit('Release signed', rel.version, `Manifest signed with the offline release key (simulated) · ${SA.shortSig(rel.manifestSig)}`); PP.save();
      PP.ui.toast(`Release ${esc(rel.version)} signed. Deployments verify this signature and the digests before installing.`);
    }, 900);
  };
  OPS.publishRelease = function (rel, onDone) {
    if (!guard('releases.publish')) return;
    if (rel.signature !== 'Signed') { PP.ui.toast('Unsigned releases can never be published. Sign it first.', 'error'); return; }
    PP.ui.modal({ title: `Publish ${esc(rel.version)}`, size: 'sm', body: `<form novalidate onsubmit="return false">${PP.form.field({ name: 'channel', label: 'Publish to channel', type: 'select', placeholder: false, value: rel.channel || 'early', options: [['early', 'Early (pilot customers)'], ['stable', 'Stable (everyone else)']] })}</form><p class="small muted">Publishing makes the signed update manifest available. Deployments on this channel pick it up when they check for updates; use “Roll out” to trigger it now.</p>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Publish', kind: 'primary', onClick: async ({ body }) => {
        const ch = PP.form.read(PP.$('form', body)).channel; await PP.sleep(500);
        PP.db.releases.filter((r) => r.id !== rel.id && r.channel === ch && r.status === 'Published').forEach((r) => { r.status = 'Superseded'; });
        rel.status = 'Published'; rel.channel = ch; rel.date = PP.today(); PP.db.channels[ch] = rel.version;
        OPS.refreshUpdateStatus();
        PP.audit('Release published', rel.version, `Channel ${ch} · signed`); PP.save();
        PP.ui.toast(`${esc(rel.version)} is now the ${esc(ch)} channel version.`);
        if (onDone) onDone();
      } }] });
  };
  /** Simulated rollout: every installed deployment on the channel updates; CUS-0004 fails deterministically and rolls back. */
  OPS.rollout = async function (ch, onDone) {
    if (!guard('releases.publish')) return;
    const target = PP.db.channels[ch];
    const deps = PP.db.deployments.filter((d) => d.channel === ch && d.updateStatus !== 'Not installed' && OPS.cmpVersion(d.version, target) < 0);
    if (!deps.length) { PP.ui.toast(`Every installed deployment on the ${esc(ch)} channel already runs ${esc(target)}.`, 'info'); return; }
    const ok = await PP.ui.confirm({ title: `Roll out ${esc(target)} to the ${esc(ch)} channel?`, confirmLabel: `Roll out to ${deps.length} deployment${deps.length > 1 ? 's' : ''}`,
      message: `${deps.map((d) => esc(SA.customerName(d.customerId))).join(', ')}.<br><br>Each updater verifies the signature and digests, takes a pre-update backup, runs migrations and a health check, and rolls back automatically on failure. Deployments that are offline pick up the update at their next heartbeat.` });
    if (!ok) return;
    const live = deps.filter((d) => d.health !== 'Down'); const offline = deps.filter((d) => d.health === 'Down');
    live.forEach((d) => { d.updateStatus = 'Updating'; });
    const rel = SA.release(target); if (rel) rel.rolledOutTo.push({ at: PP.nowStamp(), channel: ch, count: live.length, by: me() });
    PP.audit('Rollout started', target, `Channel ${ch} · ${live.length} deployments${offline.length ? ` · ${offline.length} offline (will pull later)` : ''}`); PP.save();
    PP.ui.toast(`Rollout of ${esc(target)} started on ${live.length} deployment(s).`, 'info');
    if (onDone) onDone();
    setTimeout(() => {
      let okN = 0; let failN = 0;
      live.forEach((d) => {
        const from = d.version;
        if (d.customerId === 'CUS-0004') {
          d.updateStatus = 'Failed'; d.failedUpdates = (d.failedUpdates || 0) + 1; d.health = 'Warning';
          d.lastError = `Health check failed after migrating to ${target}. Rolled back automatically to ${from} with the pre-update backup. No data lost.`;
          d.updateHistory = d.updateHistory || []; d.updateHistory.unshift({ at: PP.today(), from, to: target, result: 'Failed' }); failN++;
        } else {
          d.version = target; d.updateStatus = 'Up to date'; d.lastUpdateAt = PP.today(); d.updateHistory = d.updateHistory || []; d.updateHistory.unshift({ at: PP.today(), from, to: target, result: 'Success' }); okN++;
        }
      });
      PP.audit('Rollout finished', target, `${okN} updated · ${failN} failed and rolled back`);
      if (failN) PP.notify(`Update failed on ${failN} deployment(s)`, `${target} rolled back automatically`, '#/fleet');
      PP.save();
      PP.ui.toast(`Rollout finished: ${okN} updated${failN ? `, ${failN} failed and rolled back automatically` : ''}.`, failN ? 'warning' : 'positive', 4500);
      if (onDone) onDone();
    }, 1500);
  };
  OPS.moveChannel = function (dep, ch) {
    if (!guard('releases.publish')) return;
    const c = SA.customer(dep.customerId); const from = dep.channel;
    dep.channel = ch; if (c) c.channel = ch; dep.updateStatus = statusFor(dep);
    PP.audit('Rollout channel changed', dep.customerId, `${from} → ${ch}`); PP.save();
    PP.ui.toast(`${esc(SA.customerName(dep.customerId))} moved to the ${esc(ch)} channel.${OPS.cmpVersion(dep.version, PP.db.channels[ch]) > 0 ? ' No downgrade: it stays on its version until the channel catches up.' : ''}`, 'info', 4200);
  };

  function releaseModal(rel) {
    PP.ui.modal({ title: `Release ${esc(rel.version)}`, size: 'lg', buttons: [{ label: 'Close', kind: 'ghost' }], body: `
      <div class="row">${SA.badge(rel.status)} ${SA.badge(rel.signature)} <span class="sa-pill">${esc(rel.channel)}</span></div>
      <p>${esc(rel.notes)}</p>
      <dl class="kv"><dt>Date</dt><dd>${PP.fmt.date(rel.date)} · ${esc(rel.by || '')}</dd><dt>Minimum previous</dt><dd>${esc(rel.minPrevious)}</dd><dt>Migrations</dt><dd>${rel.migrations ? 'Yes (pre-update backup is mandatory)' : 'No'}</dd>
        <dt>Artefact digest</dt><dd><span class="sa-code">${esc(rel.digest)}</span></dd><dt>Manifest signature</dt><dd>${rel.manifestSig ? `<span class="sa-code">${esc(rel.manifestSig)}</span>` : '<span class="sa-over">Not signed — cannot be published</span>'}</dd>
        <dt>Rollouts</dt><dd>${(rel.rolledOutTo || []).length ? rel.rolledOutTo.map((r) => `${PP.fmt.stamp(r.at)} · ${esc(r.channel)} · ${r.count} deployments`).join('<br>') : '—'}</dd></dl>` });
  }

  function renderReleases(el) {
    OPS.refreshUpdateStatus();
    const deps = PP.db.deployments; const upd = deps.filter((d) => d.updateStatus === 'Updating').length; const failed = deps.filter((d) => d.updateStatus === 'Failed' || d.updateStatus === 'Rolled back').length;
    const avail = deps.filter((d) => d.updateStatus === 'Update available').length;
    el.innerHTML = PP.ui.pageHead({ title: 'Releases & updates', subtitle: 'Signed releases, rollout channels and the update status of every customer deployment.', crumbs: [['Dashboard', '#/dashboard'], ['Releases & updates']],
      actions: `<button class="btn" data-roll="early">${PP.icon('send')} Roll out early</button><button class="btn" data-roll="stable">${PP.icon('send')} Roll out stable</button><button class="btn btn-primary" data-new>${PP.icon('plus')} New release</button>` }) + `
      <div class="grid grid-4">${PP.ui.kpi({ label: 'Stable channel', value: esc(PP.db.channels.stable), icon: 'layers', tone: 'lavender', hint: `${deps.filter((d) => d.channel === 'stable').length} deployments` })}${PP.ui.kpi({ label: 'Early channel', value: esc(PP.db.channels.early), icon: 'zap', tone: 'info', hint: `${deps.filter((d) => d.channel === 'early').length} deployments` })}${PP.ui.kpi({ label: 'Update available / updating', value: `${avail} / ${upd}`, icon: 'refresh', tone: avail ? 'warning' : 'positive' })}${PP.ui.kpi({ label: 'Failed or rolled back', value: failed, icon: 'alert', tone: failed ? 'error' : 'positive', hint: 'Automatic rollback kept the data safe' })}</div>
      <div class="grid grid-2 mt-4">
        ${PP.ui.alert('info', '<b>Signed update flow.</b> CI builds versioned artefacts → the release is signed → a signed manifest lists the version, digests and minimum previous version → the updater verifies signature and digests <b>before</b> install → pre-update backup → migrations and health check → automatic rollback on failure.')}
        ${SA.pending('PD-026', 'Who applies updates: vendor-managed deployments update automatically; customer-managed ones show the update to their IT team. The prototype treats both the same.')}
      </div>
      <section class="card mt-4"><div class="card-head"><h2>Release registry</h2></div><div class="card-body flush" data-rel></div></section>
      <section class="card mt-4"><div class="card-head"><h2>Version and update status per customer</h2></div><div class="card-body flush" data-dep></div></section>`;
    const redraw = () => { if (alive(el)) renderReleases(el); };
    PP.ui.table(PP.$('[data-rel]', el), {
      getRows: () => PP.db.releases, exportName: 'releases',
      search: { placeholder: 'Search version or notes', text: (r) => `${r.version} ${r.notes}` },
      filters: [{ id: 'ch', label: 'Any channel', options: [['stable', 'Stable'], ['early', 'Early']], match: (r, v) => r.channel === v }, { id: 'st', label: 'Any status', options: ['Published', 'Draft', 'Superseded', 'Withdrawn'].map((s) => [s, s]), match: (r, v) => r.status === v }],
      columns: [
        { key: 'version', label: 'Version', sort: (r) => OPS.semver(r.version).slice(0, 3).map((n) => String(n).padStart(4, '0')).join('.') + (r.version.includes('-') ? '0' : '1'), render: (r) => `<b class="mono">${esc(r.version)}</b>${PP.db.channels[r.channel] === r.version && r.status === 'Published' ? ` <span class="sa-tag ${r.channel === 'stable' ? 'core' : 'beta'}">${esc(r.channel)} current</span>` : ''}` },
        { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => PP.fmt.date(r.date) },
        { key: 'ch', label: 'Channel', sort: (r) => r.channel, render: (r) => SA.badge(r.channel === 'stable' ? 'Stable' : 'Early') },
        { key: 'st', label: 'Status', sort: (r) => r.status, render: (r) => SA.badge(r.status) },
        { key: 'sig', label: 'Signature', sort: (r) => r.signature, render: (r) => (r.signature === 'Signed' ? `<span class="sa-signed">${PP.icon('checkCircle')} Signed</span>` : SA.badge('Unsigned')), exportValue: (r) => r.signature },
        { key: 'dig', label: 'Digest', render: (r) => `<code>${esc(r.digest.slice(0, 19))}…</code>`, exportValue: (r) => r.digest },
        { key: 'min', label: 'Min. previous', render: (r) => `<span class="mono">${esc(r.minPrevious)}</span>` },
        { key: 'mig', label: 'Migrations', render: (r) => (r.migrations ? 'Yes' : 'No') },
        { key: 'notes', label: 'Notes', render: (r) => `<span class="small">${esc(r.notes.length > 70 ? r.notes.slice(0, 70) + '…' : r.notes)}</span>`, exportValue: (r) => r.notes },
        { key: 'act', label: '', render: (r) => `<span class="row-actions">${r.signature !== 'Signed' ? `<button class="btn btn-sm" data-sign="${r.id}">Sign</button>` : ''}${r.status === 'Draft' ? `<button class="btn btn-sm btn-primary" data-pub="${r.id}" ${r.signature !== 'Signed' ? 'disabled title="Sign first"' : ''}>Publish</button>` : ''}${r.status === 'Published' && PP.db.channels[r.channel] === r.version ? `<button class="btn btn-sm" data-rrow="${r.channel}">Roll out</button>` : ''}</span>` },
      ],
      onRowClick: releaseModal,
      afterDraw: (box) => {
        PP.$$('[data-sign]', box).forEach((b) => b.addEventListener('click', async () => { await OPS.signRelease(findRel(b.dataset.sign), b); redraw(); }));
        PP.$$('[data-pub]', box).forEach((b) => b.addEventListener('click', () => OPS.publishRelease(findRel(b.dataset.pub), redraw)));
        PP.$$('[data-rrow]', box).forEach((b) => b.addEventListener('click', () => OPS.rollout(b.dataset.rrow, redraw)));
      },
    });
    PP.ui.table(PP.$('[data-dep]', el), {
      getRows: () => PP.db.deployments, exportName: 'update-status', sortKey: 'cu',
      search: { placeholder: 'Search customer or version', text: (d) => `${SA.customerName(d.customerId)} ${d.version || ''}` },
      filters: [{ id: 'ch', label: 'Any channel', options: [['stable', 'Stable'], ['early', 'Early']], match: (d, v) => d.channel === v }, { id: 'us', label: 'Any update status', options: ['Up to date', 'Update available', 'Updating', 'Failed', 'Rolled back', 'Not installed'].map((s) => [s, s]), match: (d, v) => d.updateStatus === v }],
      rowClass: (d) => (d.updateStatus === 'Failed' || d.updateStatus === 'Rolled back' ? 'sa-err-row' : d.updateStatus === 'Update available' ? 'sa-warn-row' : ''),
      columns: [
        { key: 'cu', label: 'Customer', sort: (d) => SA.customerName(d.customerId), render: (d) => { const c = SA.customer(d.customerId); return `${SA.customerLink(d.customerId)}<span class="sub">${esc(c ? c.hostingModel : '')}</span>`; }, exportValue: (d) => SA.customerName(d.customerId) },
        { key: 'ch', label: 'Channel', render: (d) => `<select class="select" style="width:auto;height:32px" data-ch="${d.id}" aria-label="Rollout channel" ${PP.can('releases.publish') ? '' : 'disabled'}><option value="stable" ${d.channel === 'stable' ? 'selected' : ''}>Stable</option><option value="early" ${d.channel === 'early' ? 'selected' : ''}>Early</option></select>`, exportValue: (d) => d.channel },
        { key: 'ver', label: 'Current version', sort: (d) => d.version || '', render: (d) => `<span class="mono">${esc(d.version || '—')}</span>` },
        { key: 'tgt', label: 'Channel version', render: (d) => `<span class="mono">${esc(PP.db.channels[d.channel])}</span>` },
        { key: 'us', label: 'Update status', sort: (d) => d.updateStatus, render: (d) => `${SA.badge(d.updateStatus)}${d.updateStatus === 'Update available' && d.health === 'Down' ? '<span class="sub">Offline · pulls at next heartbeat</span>' : ''}${d.lastError && (d.updateStatus === 'Failed' || d.updateStatus === 'Rolled back') ? `<span class="sub" title="${esc(d.lastError)}">${esc(d.lastError.slice(0, 48))}…</span>` : ''}`, exportValue: (d) => d.updateStatus },
        { key: 'last', label: 'Last update', sort: (d) => d.lastUpdateAt || '', render: (d) => (d.lastUpdateAt ? PP.fmt.date(d.lastUpdateAt) : '—') },
      ],
      onRowClick: (d) => { location.hash = `#/fleet/${d.id}`; },
      afterDraw: (box) => PP.$$('[data-ch]', box).forEach((s) => s.addEventListener('change', () => { OPS.moveChannel(PP.db.deployments.find((x) => x.id === s.dataset.ch), s.value); redraw(); })),
    });
    PP.$('[data-new]', el).addEventListener('click', () => OPS.newReleaseModal(redraw));
    PP.$$('[data-roll]', el).forEach((b) => b.addEventListener('click', () => OPS.rollout(b.dataset.roll, redraw)));
  }
  PP.route('/releases', { title: 'Releases & updates', perm: 'customers.view', render: ({ el }) => renderReleases(el) });

  /* ================================================================== FLEET */
  const H24 = 24 * 3600000;
  OPS.hbStale = (d) => !d.lastHeartbeat || Date.now() - new Date(d.lastHeartbeat).getTime() > H24;
  OPS.backupStale = (d) => !d.lastBackup || Date.now() - new Date(d.lastBackup).getTime() > 7 * H24;
  OPS.hasIssue = (d) => d.updateStatus !== 'Not installed' && (OPS.hbStale(d) || OPS.backupStale(d) || d.failedUpdates > 0 || d.health !== 'Healthy');
  const hbCell = (d) => (d.lastHeartbeat ? `<span class="${OPS.hbStale(d) ? 'sa-over' : ''}">${esc(SA.ago(d.lastHeartbeat))}</span><span class="sub">${PP.fmt.stamp(d.lastHeartbeat)}</span>` : '<span class="muted">Never</span>');
  const bkCell = (d) => (d.lastBackup ? `<span class="${OPS.backupStale(d) ? 'sa-over' : ''}">${esc(SA.ago(d.lastBackup))}</span><span class="sub">${SA.badge(d.backupStatus)}</span>` : `<span class="muted">None</span>`);

  function renderFleet(el) {
    const deps = PP.db.deployments.filter((d) => d.updateStatus !== 'Not installed');
    const healthy = deps.filter((d) => d.health === 'Healthy').length; const stale = deps.filter(OPS.hbStale).length; const bk = deps.filter(OPS.backupStale).length; const fu = deps.filter((d) => d.failedUpdates > 0).length;
    el.innerHTML = PP.ui.pageHead({ title: 'Fleet monitoring', subtitle: 'Every customer deployment: version, heartbeat, backups, failed updates and aggregated usage counters.', crumbs: [['Dashboard', '#/dashboard'], ['Fleet monitoring']] }) +
      SA.noPatientData() + `
      <div class="grid grid-4 mt-4">${PP.ui.kpi({ label: 'Healthy deployments', value: `${healthy} / ${deps.length}`, icon: 'checkCircle', tone: healthy === deps.length ? 'positive' : 'warning' })}${PP.ui.kpi({ label: 'Heartbeat older than 24 h', value: stale, icon: 'activity', tone: stale ? 'error' : 'positive' })}${PP.ui.kpi({ label: 'Backup older than 7 days', value: bk, icon: 'download', tone: bk ? 'warning' : 'positive' })}${PP.ui.kpi({ label: 'With failed updates', value: fu, icon: 'alert', tone: fu ? 'error' : 'positive' })}</div>
      <section class="card mt-4"><div class="card-body flush" data-table></div></section>`;
    PP.ui.table(PP.$('[data-table]', el), {
      getRows: () => PP.db.deployments, exportName: 'fleet', sortKey: 'cu',
      search: { placeholder: 'Search customer, provider or version', text: (d) => `${SA.customerName(d.customerId)} ${d.provider} ${d.version || ''} ${d.server}` },
      filters: [
        { id: 'h', label: 'Any health', options: ['Healthy', 'Warning', 'Down', 'Not installed'].map((s) => [s, s]), match: (d, v) => d.health === v },
        { id: 'iss', label: 'All deployments', options: [['yes', 'With issues only']], match: (d) => OPS.hasIssue(d) },
        { id: 'hm', label: 'Any hosting model', options: [['Vendor-managed', 'Vendor-managed'], ['Customer-managed', 'Customer-managed']], match: (d, v) => (SA.customer(d.customerId) || {}).hostingModel === v },
      ],
      rowClass: (d) => (d.health === 'Down' || d.updateStatus === 'Failed' ? 'sa-err-row' : OPS.hasIssue(d) ? 'sa-warn-row' : ''),
      columns: [
        { key: 'cu', label: 'Customer', sort: (d) => SA.customerName(d.customerId), render: (d) => { const c = SA.customer(d.customerId) || {}; return `<b>${esc(c.name || '')}</b><span class="sub">${esc(c.hostingModel || '')} · ${esc(d.provider)}</span>`; }, exportValue: (d) => SA.customerName(d.customerId) },
        { key: 'ver', label: 'Version', sort: (d) => d.version || '', render: (d) => `<span class="mono">${esc(d.version || '—')}</span><span class="sub">${esc(d.channel)}</span>` },
        { key: 'hb', label: 'Last heartbeat', sort: (d) => d.lastHeartbeat || '', render: hbCell, exportValue: (d) => d.lastHeartbeat || '' },
        { key: 'bk', label: 'Last backup', sort: (d) => d.lastBackup || '', render: bkCell, exportValue: (d) => d.lastBackup || '' },
        { key: 'rt', label: 'Restore test', sort: (d) => d.lastRestoreTest || '', render: (d) => (d.lastRestoreTest ? PP.fmt.date(d.lastRestoreTest) : '—') },
        { key: 'fu', label: 'Failed updates', align: 'right', sort: (d) => d.failedUpdates, render: (d) => (d.failedUpdates ? `<span class="sa-over">${d.failedUpdates}</span>` : '0') },
        { key: 'pat', label: 'Patients (count)', align: 'right', sort: (d) => d.usage.patients, render: (d) => PP.fmt.num(d.usage.patients) },
        { key: 'apt', label: 'Appts this month', align: 'right', sort: (d) => d.usage.appointments_month, render: (d) => PP.fmt.num(d.usage.appointments_month) },
        { key: 'h', label: 'Health', sort: (d) => d.health, render: (d) => SA.badge(d.health) },
      ],
      onRowClick: (d) => { location.hash = `#/fleet/${d.id}`; },
      empty: { icon: 'activity', title: 'No deployments yet' },
    });
  }
  PP.route('/fleet', { title: 'Fleet monitoring', perm: 'fleet.view', render: ({ el }) => renderFleet(el) });

  OPS.usageHtml = function (dep, c) {
    const set = SA.latestSet(c.id); const lim = set ? set.limits : {};
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Counter</th><th>Usage vs limit</th></tr></thead><tbody>${SA.LIMITS.map((l) => `<tr><td>${esc(l.label)}</td><td>${SA.usageBar(dep.usage[l.counter] || 0, lim[l.code])}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="padding:10px 16px;margin:0">Business limits only — never storage, disk, RAM, CPU or bandwidth (D-016). Limits come from entitlement set v${set ? set.version : 0}. Reaching a limit blocks only new records of that kind.</p>`;
  };
  OPS.queueBackup = async function (dep, btn, redraw) {
    if (!guard('fleet.view')) return;
    if (dep.updateStatus === 'Not installed') { PP.ui.toast('Nothing installed yet.', 'warning'); return; }
    await PP.ui.busy(btn, async () => { dep.backupRequested = PP.nowStamp(); PP.audit('Backup run requested', dep.customerId, 'Delivered with the next heartbeat response (pull model)'); PP.save(); }, 500);
    PP.ui.toast('Backup request queued. The deployment receives it with its next heartbeat response — the vendor never connects in.', 'info', 4200);
    if (redraw) redraw();
    setTimeout(() => {
      if (dep.health === 'Down') { PP.ui.toast(`${esc(SA.customerName(dep.customerId))} has not called in; the backup request is still waiting.`, 'warning', 4200); return; }
      dep.lastBackup = PP.nowStamp(); dep.backupStatus = 'Success'; dep.backupRequested = null;
      if (dep.health === 'Warning' && !dep.failedUpdates && !OPS.hbStale(dep)) dep.health = 'Healthy';
      PP.audit('Backup completed', dep.customerId, 'Reported by the deployment (simulated)'); PP.save();
      PP.ui.toast(`Backup completed on ${esc(SA.customerName(dep.customerId))}.`);
      if (redraw) redraw();
    }, 1600);
  };
  OPS.ping = async function (dep, btn, redraw) {
    if (dep.updateStatus === 'Not installed') { PP.ui.toast('Nothing installed yet.', 'warning'); return; }
    await PP.ui.busy(btn, async () => {
      if (dep.health === 'Down') { PP.audit('Heartbeat check', dep.customerId, 'No heartbeat received'); PP.save(); PP.ui.toast('No heartbeat received. Data stays with the customer; ask them to check the server or internet connection.', 'error', 4500); return; }
      dep.lastHeartbeat = PP.nowStamp(); PP.audit('Heartbeat check', dep.customerId, `Heartbeat received · app ${dep.version}`); PP.save(); PP.ui.toast('Fresh heartbeat received (simulated).');
    }, 900);
    if (redraw) redraw();
  };
  OPS.clearFailures = function (dep) { dep.failedUpdates = 0; dep.lastError = ''; if (dep.health === 'Warning' && !OPS.backupStale(dep)) dep.health = 'Healthy'; PP.audit('Update failures acknowledged', dep.customerId, ''); PP.save(); };

  function deploymentBody(dep, c, full) {
    return `<div class="grid grid-4">${PP.ui.kpi({ label: 'Version', value: esc(dep.version || '—'), icon: 'layers', tone: dep.updateStatus === 'Up to date' ? 'positive' : 'warning', hint: `${esc(dep.channel)} channel · ${esc(dep.updateStatus)}` })}${PP.ui.kpi({ label: 'Last heartbeat', value: esc(SA.ago(dep.lastHeartbeat)), icon: 'activity', tone: OPS.hbStale(dep) ? 'error' : 'positive', hint: PP.fmt.stamp(dep.lastHeartbeat) })}${PP.ui.kpi({ label: 'Last backup', value: esc(SA.ago(dep.lastBackup)), icon: 'download', tone: OPS.backupStale(dep) ? 'warning' : 'positive', hint: dep.backupRequested ? 'Backup run requested' : `Restore test ${PP.fmt.date(dep.lastRestoreTest)}` })}${PP.ui.kpi({ label: 'Failed updates', value: dep.failedUpdates || 0, icon: 'alert', tone: dep.failedUpdates ? 'error' : 'positive', hint: esc(dep.health) })}</div>
      ${dep.lastError ? `<div class="mt-4">${PP.ui.alert('error', `<b>Last error.</b> ${esc(dep.lastError)}`)}</div>` : ''}
      <div class="row mt-4"><button class="btn" data-ping>${PP.icon('activity')} Check heartbeat</button><button class="btn" data-backup>${PP.icon('download')} Request backup run</button>${dep.failedUpdates ? '<button class="btn btn-ghost" data-ack>Acknowledge failures</button>' : ''}${full ? `<a class="btn btn-ghost" href="#/customers/${c.id}">Customer profile</a>` : `<a class="btn btn-ghost" href="#/fleet/${dep.id}">Open in fleet</a>`}</div>
      <div class="sa-split mt-4">
        ${PP.ui.card({ title: 'Aggregated usage counters', flush: true, body: OPS.usageHtml(dep, c) })}
        <div class="stack">${PP.ui.card({ title: 'Deployment', body: `<dl class="kv"><dt>Hosting model</dt><dd>${esc(c.hostingModel)}</dd><dt>Provider</dt><dd>${esc(dep.provider)} · ${esc((c.hosting || {}).region || '')}</dd><dt>Server</dt><dd>${esc(dep.server)} · ${esc((c.hosting || {}).os || '')}</dd><dt>Runtime</dt><dd>${esc((c.hosting || {}).docker || 'Docker')}</dd><dt>Tenant ID</dt><dd><code>${esc(c.tenantId)}</code></dd></dl>` })}
        ${PP.ui.card({ title: 'Update history', flush: true, body: (dep.updateHistory || []).length ? `<ul class="list sa-list-compact">${dep.updateHistory.map((h) => `<li><div class="grow"><span class="mono">${esc(h.from)} → ${esc(h.to)}</span> ${SA.badge(h.result)}<span class="sub small muted" style="display:block">${PP.fmt.date(h.at)}</span></div></li>`).join('')}</ul>` : PP.ui.empty({ title: 'No updates yet' }) })}</div>
      </div>`;
  }
  function bindDeployment(root, dep, redraw) {
    const p = PP.$('[data-ping]', root); if (p) p.addEventListener('click', () => OPS.ping(dep, p, redraw));
    const b = PP.$('[data-backup]', root); if (b) b.addEventListener('click', () => OPS.queueBackup(dep, b, redraw));
    const a = PP.$('[data-ack]', root); if (a) a.addEventListener('click', () => { OPS.clearFailures(dep); PP.ui.toast('Failures acknowledged'); redraw(); });
  }

  PP.route('/fleet/:id', {
    title: (p) => { const d = PP.db.deployments.find((x) => x.id === p.id); return d ? `Deployment · ${SA.customerName(d.customerId)}` : 'Deployment'; }, perm: 'fleet.view',
    render({ params, el }) {
      const draw = () => {
        if (!alive(el)) return;
        const dep = PP.db.deployments.find((x) => x.id === params.id); const c = dep && SA.customer(dep.customerId);
        if (!dep || !c) { el.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'alert', title: 'Deployment not found', action: '<a class="btn" href="#/fleet">Back to fleet</a>' }) }); return; }
        el.innerHTML = PP.ui.pageHead({ title: esc(c.name), subtitle: `${esc(dep.id)} · ${esc((SA.primaryDomain(c.id) || {}).host || '')} · ${SA.badge(dep.health)}`, crumbs: [['Fleet monitoring', '#/fleet'], [c.name]] }) + SA.noPatientData() + '<div class="mt-4" data-b></div>';
        const box = PP.$('[data-b]', el);
        if (dep.updateStatus === 'Not installed') { box.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'activity', title: 'Not installed yet', text: 'The deployment registers itself with the control plane after installation on the customer’s server.' }) }); return; }
        box.innerHTML = deploymentBody(dep, c, true); bindDeployment(box, dep, draw);
      };
      draw();
    },
  });
  SA.panels.deployment = function (el, c) {
    const draw = () => {
      const dep = SA.deployment(c.id);
      if (!dep || dep.updateStatus === 'Not installed') { el.innerHTML = PP.ui.card({ title: 'Deployment', body: `${PP.ui.empty({ icon: 'activity', title: 'Not installed yet', text: `Hosting: ${esc(c.hostingModel)} · ${esc((c.hosting || {}).provider || '')}. The deployment registers after installation on the customer’s infrastructure.` })}` }); return; }
      el.innerHTML = `${SA.noPatientData()}<div class="mt-3">${deploymentBody(dep, c, false)}</div>`;
      bindDeployment(el, dep, draw);
    };
    draw();
  };
})();
