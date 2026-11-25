/* Physio Point — Super Admin: vendor billing, support (tickets, announcements, remote-support consent log),
   vendor staff & roles, vendor audit log. Fictional data only.
   Vendor invoices are the vendor's invoices to customers — never the customer's patient invoices (control-plane.md §3). */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;
  const money = (n) => PP.fmt.money(n);
  const METHODS = ['Bank transfer', 'bKash', 'Nagad', 'Cheque', 'Card'];
  const STATUSES = ['Open', 'Waiting on customer', 'Resolved', 'Closed'];
  const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
  const CATEGORIES = ['How-to', 'Bug', 'Update', 'Licence', 'Billing', 'Domain', 'Infrastructure', 'Feature request'];
  const staffActive = () => PP.db.users.filter((u) => u.status === 'Active');
  const can = (p) => PP.can(p);
  const denied = (p) => { PP.ui.toast(`Your role does not include <code>${esc(p)}</code>. In production this is refused by the server.`, 'error', 4200); };
  const B = (SA.business = SA.business || {});

  /* ============================================================== vendor billing helpers */
  B.mrr = function () {
    return PP.round2(PP.sum(PP.db.customers.filter((c) => ['Active', 'Grace'].includes(SA.state(c))), (c) => {
      const p = SA.plan(c.planId); if (!p) return 0; return c.billingCycle === 'Monthly' ? p.priceMonthly : p.priceYearly / 12;
    }));
  };
  B.invoices = (cId) => (PP.db.vendorInvoices || []).filter((v) => !cId || v.customerId === cId).sort((a, b) => (a.date < b.date ? 1 : -1));
  B.remindersOf = (invId) => (PP.db.reminders || []).filter((r) => r.invoiceId === invId);

  /** Record a payment against a vendor invoice. Calls after() on success. */
  B.recordPayment = function (inv, after) {
    if (!can('billing.manage')) return denied('billing.manage');
    const t = SA.invoiceTotals(inv);
    if (t.due <= 0) { PP.ui.toast('This invoice is already fully paid.', 'info'); return; }
    PP.ui.modal({
      title: `Record payment · ${esc(inv.id)}`,
      body: `<p class="muted" style="margin-top:0">${esc(SA.customerName(inv.customerId))} · due ${money(t.due)}</p>
        <form class="form-grid" novalidate onsubmit="return false">
          ${PP.form.field({ name: 'amount', label: 'Amount (BDT)', type: 'number', required: true, rule: 'positive', value: t.due, step: '0.01' })}
          ${PP.form.field({ name: 'method', label: 'Method', type: 'select', required: true, options: METHODS, value: 'Bank transfer', placeholder: false })}
          ${PP.form.field({ name: 'date', label: 'Payment date', type: 'date', required: true, value: PP.today(), attrs: `max="${PP.today()}"` })}
          ${PP.form.field({ name: 'ref', label: 'Reference / transaction ID', required: true, placeholder: 'e.g. TRX8F21A0' })}
        </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Record payment', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const v = PP.form.read(f); const amt = PP.round2(Number(v.amount));
        if (amt > t.due) { PP.form.setError(f, 'amount', `Amount cannot be more than the due amount (${money(t.due)}).`); return false; }
        if (v.date < inv.date) { PP.form.setError(f, 'date', 'Payment date cannot be before the invoice date.'); return false; }
        await PP.sleep(350);
        inv.payments = inv.payments || [];
        inv.payments.push({ id: PP.nextId('PAY', 4), date: v.date, amount: amt, method: v.method, ref: v.ref, by: PP.currentUser().name });
        PP.audit('Vendor payment recorded', inv.customerId, `${inv.id} · ${money(amt)} · ${v.method} · ${v.ref}`);
        PP.save(); PP.ui.toast(`Payment of ${money(amt)} recorded on ${esc(inv.id)}. Status: ${esc(SA.invoiceTotals(inv).status)}.`);
        if (after) after();
      } }],
    });
  };

  /** Send an invoice or licence-renewal reminder (simulated). */
  B.sendReminder = function ({ customerId, invoiceId, kind, after }) {
    if (!can('billing.manage')) return denied('billing.manage');
    const c = SA.customer(customerId); const inv = invoiceId ? PP.db.vendorInvoices.find((x) => x.id === invoiceId) : null;
    const t = inv ? SA.invoiceTotals(inv) : null;
    const text = inv ? `Dear ${c.contact.name}, invoice ${inv.id} (${inv.period}) has ${money(t.due)} outstanding, due ${PP.fmt.date(inv.due)}. Please pay by bank transfer or bKash. Your system keeps working; thank you.`
      : `Dear ${c.contact.name}, your Physio Point licence ${kind ? '(' + kind + ')' : ''} needs renewal. Records are never deleted; after the grace period the system becomes read-only until renewal.`;
    PP.ui.modal({
      title: inv ? `Send payment reminder · ${esc(inv.id)}` : `Send renewal reminder · ${esc(c.name)}`,
      body: `<form class="stack" novalidate onsubmit="return false">
          ${PP.form.field({ name: 'channel', label: 'Channel', type: 'select', options: ['Email', 'SMS'], value: 'Email', placeholder: false })}
          <div class="small muted">To: ${esc(c.contact.name)} · <span data-to>${esc(c.contact.email)}</span></div>
          ${PP.form.field({ name: 'text', label: 'Message', type: 'textarea', rows: 4, required: true, value: text })}
          ${PP.ui.alert('info', 'Prototype: nothing is sent. In production the vendor messaging service delivers this.')}
        </form>`,
      onOpen: (body) => { const sel = PP.$('[name=channel]', body); sel.addEventListener('change', () => { PP.$('[data-to]', body).textContent = sel.value === 'SMS' ? c.contact.mobile : c.contact.email; }); },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: `${PP.icon('send')} Send reminder`, kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        await PP.sleep(400);
        PP.db.reminders.push({ id: PP.nextId('REM', 4), customerId, invoiceId: invoiceId || null, at: PP.nowStamp(), channel: v.channel, kind: inv ? (t.status === 'Overdue' ? 'Overdue invoice' : 'Payment reminder') : (kind || 'Licence renewal'), by: PP.currentUser().name, text: v.text });
        if (inv) inv.remindersSent = (inv.remindersSent || 0) + 1;
        PP.audit('Reminder sent', customerId, `${inv ? inv.id : 'Licence renewal'} · ${v.channel}`);
        PP.save(); PP.ui.toast(`Reminder sent to ${esc(c.name)} by ${esc(v.channel)} (simulated).`);
        if (after) after();
      } }],
    });
  };

  /** New vendor invoice (optionally for a given customer). */
  B.newInvoice = function (presetCustomerId, after) {
    if (!can('billing.manage')) return denied('billing.manage');
    const lineRow = (d, a) => `<div class="row sa-line" style="gap:8px;align-items:flex-start"><div class="field grow" style="flex:2 1 220px"><input class="input" name="ld" placeholder="Description" value="${esc(d || '')}" aria-label="Line description"><div class="error">Enter a description.</div></div><div class="field" style="flex:1 1 120px"><input class="input" name="la" type="number" min="0" step="0.01" placeholder="Amount" value="${a == null ? '' : a}" aria-label="Line amount"><div class="error">Enter an amount above zero.</div></div><button type="button" class="btn btn-ghost btn-sm" data-rm aria-label="Remove line">${PP.icon('trash')}</button></div>`;
    const planLine = (cid) => { const c = SA.customer(cid); const p = c && SA.plan(c.planId); if (!p) return ['', '']; const y = c.billingCycle !== 'Monthly'; return [`${p.name} plan · ${y ? 'yearly' : 'monthly'}`, y ? p.priceYearly : p.priceMonthly]; };
    const m = PP.ui.modal({
      title: 'New vendor invoice', size: 'lg',
      body: `<form novalidate onsubmit="return false">
        <div class="form-grid">
          ${PP.form.field({ name: 'customerId', label: 'Customer', type: 'select', required: true, options: PP.db.customers.map((c) => [c.id, `${c.name} (${c.id})`]), value: presetCustomerId || '' })}
          ${PP.form.field({ name: 'period', label: 'Billing period', required: true, placeholder: 'e.g. Dec 2026 or 01 Dec 2026 – 30 Nov 2027' })}
          ${PP.form.field({ name: 'date', label: 'Invoice date', type: 'date', required: true, value: PP.today() })}
          ${PP.form.field({ name: 'due', label: 'Due date', type: 'date', required: true, value: PP.addDays(PP.today(), 14) })}
        </div>
        <div class="row between mt-4"><b>Lines</b><button type="button" class="btn btn-sm" data-add>${PP.icon('plus')} Add line</button></div>
        <div class="stack mt-2" data-lines></div>
        <div class="row between mt-3"><span class="muted small">Amounts in BDT. Business usage only — no storage or server charges (D-016).</span><b>Total: <span class="mono" data-total>BDT 0</span></b></div>
        <div data-msg class="mt-2"></div>
      </form>`,
      onOpen: (body) => {
        const lines = PP.$('[data-lines]', body); const sel = PP.$('[name=customerId]', body);
        const total = () => { PP.$('[data-total]', body).textContent = money(PP.sum(PP.$$('[name=la]', body), (i) => Number(i.value) || 0)); };
        const bindRm = () => PP.$$('[data-rm]', lines).forEach((b) => { b.onclick = () => { b.closest('.sa-line').remove(); total(); }; });
        const add = (d, a) => { lines.insertAdjacentHTML('beforeend', lineRow(d, a)); bindRm(); };
        const pl = planLine(presetCustomerId); add(pl[0], pl[1]);
        PP.$('[data-add]', body).addEventListener('click', () => { add(); PP.$$('[name=ld]', lines).pop().focus(); });
        sel.addEventListener('change', () => { const first = PP.$('.sa-line', lines); const ld = first && PP.$('[name=ld]', first); if (ld && (!ld.value || / plan · /.test(ld.value))) { const p = planLine(sel.value); ld.value = p[0]; PP.$('[name=la]', first).value = p[1]; total(); } });
        lines.addEventListener('input', total); total();
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create invoice', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); let ok = PP.form.validate(f); const msg = PP.$('[data-msg]', body); msg.innerHTML = '';
        const rows = PP.$$('.sa-line', body);
        if (!rows.length) { msg.innerHTML = PP.ui.alert('error', 'Add at least one line.'); return false; }
        rows.forEach((r) => { const d = PP.$('[name=ld]', r); const a = PP.$('[name=la]', r); if (!d.value.trim()) { d.closest('.field').classList.add('has-error'); ok = false; } if (!(Number(a.value) > 0)) { a.closest('.field').classList.add('has-error'); ok = false; } });
        const v = PP.form.read(f);
        if (v.due && v.date && v.due < v.date) { PP.form.setError(f, 'due', 'Due date must be on or after the invoice date.'); ok = false; }
        if (!ok) return false;
        await PP.sleep(400);
        const inv = { id: PP.nextId('VIN', 4), customerId: v.customerId, date: v.date, due: v.due, period: v.period, lines: rows.map((r) => ({ description: PP.$('[name=ld]', r).value.trim(), amount: PP.round2(Number(PP.$('[name=la]', r).value)) })), payments: [], status: 'Open', remindersSent: 0 };
        PP.db.vendorInvoices.push(inv);
        PP.audit('Vendor invoice created', inv.customerId, `${inv.id} · ${money(SA.invoiceTotals(inv).amount)} · ${inv.period}`);
        PP.save(); PP.ui.toast(`Invoice ${esc(inv.id)} created for ${esc(SA.customerName(inv.customerId))}.`);
        if (after) after();
      } }],
    });
    return m;
  };

  /** Invoice detail modal. */
  B.invoiceDetail = function (inv, after) {
    const t = SA.invoiceTotals(inv); const c = SA.customer(inv.customerId); const rem = B.remindersOf(inv.id);
    const canSuspend = t.status === 'Overdue' && SA.lifecycle && SA.lifecycle.suspend && c && c.status !== 'Suspended' && can('customers.lifecycle');
    const buttons = [{ label: 'Close', kind: 'ghost' }];
    if (canSuspend) buttons.push({ label: 'Suspend customer…', kind: 'danger', onClick: async ({ close }) => { close(); await SA.lifecycle.suspend(c); if (after) after(); } });
    if (t.due > 0) {
      buttons.push({ label: `${PP.icon('send')} Send reminder`, onClick: ({ close }) => { close(); B.sendReminder({ customerId: inv.customerId, invoiceId: inv.id, after }); } });
      buttons.push({ label: 'Record payment', kind: 'primary', onClick: ({ close }) => { close(); B.recordPayment(inv, after); } });
    }
    PP.ui.modal({
      title: `Invoice ${esc(inv.id)} ${SA.badge(t.status)}`, size: 'lg',
      body: `<div class="grid grid-2">
          <dl class="kv kv-tight"><dt>Customer</dt><dd>${SA.customerLink(inv.customerId)}</dd><dt>Period</dt><dd>${esc(inv.period)}</dd><dt>Issued</dt><dd>${PP.fmt.date(inv.date)}</dd><dt>Due</dt><dd>${PP.fmt.date(inv.due)}${t.status === 'Overdue' ? ` <span class="sa-over">· ${Math.abs(SA.daysLeft(inv.due))} days overdue</span>` : ''}</dd></dl>
          <dl class="kv kv-tight"><dt>Amount</dt><dd class="mono">${money(t.amount)}</dd><dt>Paid</dt><dd class="mono">${money(t.paid)}</dd><dt>Due</dt><dd class="mono"><b>${money(t.due)}</b></dd><dt>Reminders</dt><dd>${inv.remindersSent || 0}</dd></dl>
        </div>
        <h3 class="mt-4">Lines</h3>
        <div class="table-wrap mt-2"><table class="table"><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead><tbody>${inv.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="right mono">${money(l.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="right mono">${money(t.amount)}</td></tr></tfoot></table></div>
        <h3 class="mt-4">Payments</h3>
        ${(inv.payments || []).length ? `<div class="table-wrap mt-2"><table class="table"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Recorded by</th><th class="right">Amount</th></tr></thead><tbody>${inv.payments.map((p) => `<tr><td>${PP.fmt.date(p.date)}</td><td>${esc(p.method)}</td><td><code>${esc(p.ref)}</code></td><td>${esc(p.by || '—')}</td><td class="right mono">${money(p.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No payments yet.</p>'}
        <h3 class="mt-4">Reminders</h3>
        ${rem.length ? `<ul class="list sa-list-compact">${rem.map((r) => `<li><span class="grow">${esc(r.kind)} · ${esc(r.channel)}</span><span class="small muted">${PP.fmt.stamp(r.at)} · ${esc(r.by)}</span></li>`).join('')}</ul>` : '<p class="muted small">No reminders sent.</p>'}
        ${canSuspend ? `<div class="mt-3">${PP.ui.alert('warning', 'This invoice is overdue. Suspending is a lifecycle action with a required reason. A suspended deployment runs read-only: records stay viewable and exportable; nothing is deleted (D-017).')}</div>` : ''}`,
      buttons,
    });
  };

  /** Invoice table (used on the billing page and the customer Billing tab). */
  B.invoiceTable = function (container, { customerId, onChange }) {
    const cols = [
      { key: 'id', label: 'Invoice', sort: (r) => r.date, render: (r) => `<b>${esc(r.id)}</b><span class="sub">${PP.fmt.date(r.date)}</span>` },
      ...(customerId ? [] : [{ key: 'customer', label: 'Customer', sort: (r) => SA.customerName(r.customerId), render: (r) => `${SA.customerLink(r.customerId)}<span class="sub">${esc(r.customerId)}</span>`, exportValue: (r) => SA.customerName(r.customerId) }]),
      { key: 'period', label: 'Period', render: (r) => `<span class="small">${esc(r.period)}</span>` },
      { key: 'due', label: 'Due date', sort: (r) => r.due, render: (r) => PP.fmt.date(r.due) },
      { key: 'amount', label: 'Amount', align: 'right', sort: (r) => SA.invoiceTotals(r).amount, render: (r) => money(SA.invoiceTotals(r).amount) },
      { key: 'paid', label: 'Paid', align: 'right', sort: (r) => SA.invoiceTotals(r).paid, render: (r) => money(SA.invoiceTotals(r).paid) },
      { key: 'balance', label: 'Due', align: 'right', sort: (r) => SA.invoiceTotals(r).due, render: (r) => money(SA.invoiceTotals(r).due) },
      { key: 'status', label: 'Status', sort: (r) => SA.invoiceTotals(r).status, render: (r) => SA.badge(SA.invoiceTotals(r).status), exportValue: (r) => SA.invoiceTotals(r).status },
      { key: 'act', label: '', render: (r) => { const d = SA.invoiceTotals(r).due; return d > 0 ? `<span class="row-actions"><button class="btn btn-sm" data-pay="${r.id}">Record payment</button><button class="btn btn-ghost btn-sm" data-rem="${r.id}" title="Send reminder" aria-label="Send reminder for ${esc(r.id)}">${PP.icon('send')}</button></span>` : ''; } },
    ];
    const byId = (id) => PP.db.vendorInvoices.find((x) => x.id === id);
    return PP.ui.table(container, {
      columns: cols, getRows: () => B.invoices(customerId), pageSize: customerId ? 5 : 10, sortKey: 'id', sortDir: 'desc',
      search: { placeholder: 'Search invoice, customer or period', text: (r) => `${r.id} ${SA.customerName(r.customerId)} ${r.period}` },
      filters: [
        { id: 'st', label: 'All statuses', options: ['Unpaid', 'Partly paid', 'Overdue', 'Paid'].map((s) => [s, s]), match: (r, v) => SA.invoiceTotals(r).status === v },
        ...(customerId ? [] : [{ id: 'cu', label: 'All customers', options: PP.db.customers.map((c) => [c.id, c.name]), match: (r, v) => r.customerId === v }]),
      ],
      exportName: customerId ? `vendor-invoices-${customerId}` : 'vendor-invoices',
      empty: { icon: 'receipt', title: 'No invoices yet', text: 'Create the first vendor invoice for this customer.' },
      rowClass: (r) => (SA.invoiceTotals(r).status === 'Overdue' ? 'sa-err-row' : ''),
      onRowClick: (r) => B.invoiceDetail(r, onChange),
      afterDraw: (el) => {
        PP.$$('[data-pay]', el).forEach((b) => b.addEventListener('click', () => B.recordPayment(byId(b.dataset.pay), onChange)));
        PP.$$('[data-rem]', el).forEach((b) => b.addEventListener('click', () => { const i = byId(b.dataset.rem); B.sendReminder({ customerId: i.customerId, invoiceId: i.id, after: onChange }); }));
      },
    });
  };

  /** Licences due for renewal: ending within 30 days, or in grace. */
  B.renewals = function () {
    return PP.db.customers.filter((c) => c.status !== 'Onboarding').map((c) => {
      const lic = SA.licenceOf(c.id); const st = SA.licenceState(lic); const days = lic ? SA.daysLeft(lic.end) : null;
      const last = (PP.db.reminders || []).filter((r) => r.customerId === c.id && !r.invoiceId).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      return { c, lic, st, days, last };
    }).filter((x) => x.lic && ((x.st === 'Active' && x.days <= 30) || x.st === 'Grace')).sort((a, b) => a.days - b.days);
  };

  /* ============================================================== /billing */
  PP.route('/billing', {
    title: 'Vendor billing',
    render({ el }) {
      const draw = () => {
        const all = PP.db.vendorInvoices.map((v) => SA.invoiceTotals(v));
        const outstanding = PP.sum(all, (t) => t.due); const overdue = all.filter((t) => t.status === 'Overdue');
        const month = PP.monthKey(PP.today());
        const collected = PP.sum(PP.db.vendorInvoices.flatMap((v) => v.payments || []).filter((p) => PP.monthKey(p.date) === month), (p) => p.amount);
        const ren = B.renewals();
        el.innerHTML = PP.ui.pageHead({ title: 'Vendor billing', subtitle: 'Invoices from the vendor to customers, payments and renewal reminders (platform.billing).', crumbs: [['Dashboard', '#/dashboard'], ['Vendor billing']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New invoice</button>` })
          + `<div class="grid grid-4">
            ${PP.ui.kpi({ label: 'Monthly recurring revenue', value: money(B.mrr()), hint: 'Active and grace customers · fictional', icon: 'chart', tone: 'positive' })}
            ${PP.ui.kpi({ label: 'Outstanding', value: money(outstanding), hint: `${all.filter((t) => t.due > 0).length} invoices with a balance`, icon: 'wallet', tone: 'info' })}
            ${PP.ui.kpi({ label: 'Overdue invoices', value: overdue.length, hint: money(PP.sum(overdue, (t) => t.due)), icon: 'alert', tone: overdue.length ? 'error' : 'positive' })}
            ${PP.ui.kpi({ label: 'Collected this month', value: money(collected), hint: PP.fmt.month(month), icon: 'banknote', tone: 'lavender' })}
          </div>
          <div class="mt-4">${PP.ui.alert('info', '<b>Vendor invoices only.</b> These are the vendor’s invoices to customer organisations for plans and add-ons. The customer’s own patient invoices and payments stay in the customer’s deployment and never reach the control plane (control-plane.md §3). Prices are fictional (PD-008 pending).')}</div>
          ${PP.ui.card({ title: 'Customer invoices', flush: true, body: '<div data-inv></div>', cls: 'mt-4' })}
          <div class="grid grid-2 mt-4">
            ${PP.ui.card({ title: `Renewal reminders <span class="count-pill" style="background:var(--pp-warning-fg)">${ren.length}</span>`, flush: true, body: ren.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Licence ends</th><th>State</th><th>Last reminder</th><th></th></tr></thead><tbody>${ren.map((x) => `<tr class="${x.st === 'Grace' ? 'sa-warn-row' : ''}"><td>${SA.customerLink(x.c.id)}<span class="sub">${esc(SA.planName(x.c.planId))} · ${esc(x.c.billingCycle)}</span></td><td>${PP.fmt.date(x.lic.end)}<span class="sub">${x.days >= 0 ? `${x.days} days left` : `${Math.abs(x.days)} days ago · grace ends ${PP.fmt.date(PP.addDays(x.lic.end, SA.graceDays()))}`}</span></td><td>${SA.badge(x.st === 'Active' ? 'Expiring' : x.st)}</td><td class="small">${x.last ? `${PP.fmt.stamp(x.last.at)}<span class="sub">${esc(x.last.channel)}</span>` : '<span class="muted">None</span>'}</td><td><button class="btn btn-sm" data-renew="${x.c.id}">${PP.icon('send')} Remind</button></td></tr>`).join('')}</tbody></table></div>` : PP.ui.empty({ icon: 'checkCircle', title: 'No renewals due', text: 'No licence ends in the next 30 days and none is in grace.' }) })}
            ${PP.ui.card({ title: 'Reminder log', flush: true, body: '<div data-rem></div>' })}
          </div>`;
        B.invoiceTable(PP.$('[data-inv]', el), { onChange: draw });
        PP.ui.table(PP.$('[data-rem]', el), {
          columns: [
            { key: 'at', label: 'Sent', sort: (r) => r.at, render: (r) => `<span class="small">${PP.fmt.stamp(r.at)}</span>` },
            { key: 'c', label: 'Customer', render: (r) => SA.customerLink(r.customerId), exportValue: (r) => SA.customerName(r.customerId) },
            { key: 'kind', label: 'Reminder', render: (r) => `${esc(r.kind)}<span class="sub">${esc(r.invoiceId || 'Licence')} · ${esc(r.channel)}</span>` },
            { key: 'by', label: 'By', render: (r) => esc(r.by) },
          ],
          getRows: () => PP.db.reminders.slice().sort((a, b) => (a.at < b.at ? 1 : -1)), pageSize: 5, exportName: 'vendor-reminders',
          empty: { icon: 'send', title: 'No reminders sent yet' },
        });
        PP.$('[data-new]', el).addEventListener('click', () => B.newInvoice(null, draw));
        PP.$$('[data-renew]', el).forEach((b) => b.addEventListener('click', () => { const x = ren.find((r) => r.c.id === b.dataset.renew); B.sendReminder({ customerId: x.c.id, kind: x.st === 'Grace' ? 'Licence in grace' : `Licence renewal (${x.days} days left)`, after: draw }); }));
      };
      draw();
    },
  });

  SA.panels.billing = function (el, c) {
    const draw = () => {
      const invs = B.invoices(c.id).map((v) => SA.invoiceTotals(v));
      const overdue = invs.filter((t) => t.status === 'Overdue');
      el.innerHTML = `<div class="grid grid-3">
          ${PP.ui.kpi({ label: 'Invoiced', value: money(PP.sum(invs, (t) => t.amount)), hint: `${invs.length} invoices`, icon: 'receipt', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Paid', value: money(PP.sum(invs, (t) => t.paid)), icon: 'checkCircle', tone: 'positive' })}
          ${PP.ui.kpi({ label: 'Outstanding', value: money(PP.sum(invs, (t) => t.due)), hint: overdue.length ? `${overdue.length} overdue` : 'Nothing overdue', icon: 'wallet', tone: overdue.length ? 'error' : 'lavender' })}
        </div>
        ${overdue.length ? `<div class="mt-3">${PP.ui.alert('warning', `${overdue.length} invoice(s) overdue. Send a reminder, record a payment, or — as a last resort — suspend the customer (read-only mode, nothing deleted).`)}</div>` : ''}
        ${PP.ui.card({ title: 'Vendor invoices', actions: `<button class="btn btn-sm btn-primary" data-new>${PP.icon('plus')} New invoice</button>`, flush: true, body: '<div data-inv></div>', cls: 'mt-4' })}`;
      B.invoiceTable(PP.$('[data-inv]', el), { customerId: c.id, onChange: draw });
      PP.$('[data-new]', el).addEventListener('click', () => B.newInvoice(c.id, draw));
    };
    draw();
  };

  /* ============================================================== /support (ticket inbox) */
  const ticketTone = (p) => (p === 'Urgent' || p === 'High' ? 'error' : 'neutral');
  B.requestRemote = function (customerId, ticketId, after) {
    if (!can('support.remote')) return denied('support.remote');
    const c = SA.customer(customerId);
    PP.ui.modal({
      title: `Request remote support · ${esc(c.name)}`,
      body: `<form class="stack" novalidate onsubmit="return false">
          ${PP.ui.alert('info', 'The customer admin must grant access. Access is time-limited, every action is audited, and patient records are out of scope unless the customer explicitly allows them (PD-004 pending).')}
          ${PP.form.field({ name: 'scope', label: 'Scope (what you need to see or do)', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Updater logs and migration status only' })}
          ${PP.form.field({ name: 'hours', label: 'Requested duration', type: 'select', options: [['1', '1 hour'], ['2', '2 hours'], ['4', '4 hours']], value: '2', placeholder: false })}
        </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Send request to customer', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        await PP.sleep(350);
        const s = { id: PP.nextId('RSS', 4), customerId, ticketId: ticketId || null, requestedBy: PP.currentUser().name, consentBy: null, scope: v.scope, requestedAt: PP.nowStamp(), start: null, end: null, hours: Number(v.hours), status: 'Requested', actions: [] };
        PP.db.remoteSessions.unshift(s);
        if (ticketId) { const t = PP.db.tickets.find((x) => x.id === ticketId); if (t) t.messages.push({ id: PP.nextId('MSG', 5), from: 'note', author: PP.currentUser().name, at: PP.nowStamp(), text: `Remote support requested (${s.id}, ${v.hours} h): ${v.scope}. Waiting for the customer admin to consent.` }); }
        PP.audit('Remote support requested', customerId, `${s.id} · ${v.hours} h · ${v.scope}`);
        PP.save(); PP.ui.toast(`Remote support request ${esc(s.id)} sent. The customer admin sees a consent prompt (simulated).`);
        if (after) after();
      } }],
    });
  };

  B.newTicket = function (after) {
    PP.ui.modal({
      title: 'New support ticket', size: 'lg',
      body: `<form class="form-grid" novalidate onsubmit="return false">
          ${PP.form.field({ name: 'customerId', label: 'Customer', type: 'select', required: true, options: PP.db.customers.map((c) => [c.id, c.name]) })}
          ${PP.form.field({ name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES, value: 'How-to', placeholder: false })}
          ${PP.form.field({ name: 'subject', label: 'Subject', required: true, full: true })}
          ${PP.form.field({ name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, value: 'Normal', placeholder: false })}
          ${PP.form.field({ name: 'assigneeId', label: 'Assignee', type: 'select', options: staffActive().map((u) => [u.id, u.name]), value: PP.currentUser().id, placeholder: false })}
          ${PP.form.field({ name: 'text', label: 'Customer’s message (as received by phone or email)', type: 'textarea', rows: 4, required: true, full: true })}
        </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create ticket', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        if (v.subject.length < 5) { PP.form.setError(f, 'subject', 'Use at least 5 characters.'); return false; }
        await PP.sleep(350);
        const c = SA.customer(v.customerId);
        const t = { id: PP.nextId('TCK', 4), customerId: v.customerId, subject: v.subject, category: v.category, priority: v.priority, status: 'Open', assigneeId: v.assigneeId, createdAt: PP.nowStamp(), messages: [{ id: PP.nextId('MSG', 5), from: 'customer', author: `${c.contact.name} (logged by ${PP.currentUser().name})`, at: PP.nowStamp(), text: v.text }] };
        PP.db.tickets.unshift(t);
        PP.audit('Ticket created', v.customerId, `${t.id} · ${v.subject}`);
        PP.save(); PP.ui.toast(`Ticket ${esc(t.id)} created.`);
        if (after) after(t.id);
      } }],
    });
  };

  PP.route('/support', {
    title: 'Support · Ticket inbox',
    render({ el, query }) {
      const st = { q: '', status: '', priority: '', sel: query.t || null };
      el.innerHTML = PP.ui.pageHead({ title: 'Ticket inbox', subtitle: 'Customer support (platform.support). Many clinics have no IT staff.', crumbs: [['Dashboard', '#/dashboard'], ['Support']], actions: `<a class="btn" href="#/support/remote">${PP.icon('shield')} Remote support log</a><button class="btn btn-primary" data-new>${PP.icon('plus')} New ticket</button>` })
        + `<div class="sa-inbox">
          <section class="card"><div class="table-tools sa-inbox-tools">
              <div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search tickets" aria-label="Search tickets"></div>
              <select class="select" data-fs aria-label="Status"><option value="">All statuses</option><option value="active">Open + waiting</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
              <select class="select" data-fp aria-label="Priority"><option value="">All priorities</option>${PRIORITIES.map((s) => `<option>${s}</option>`).join('')}</select>
            </div><div class="sa-ticket-list" data-list></div></section>
          <section class="card" data-thread></section>
        </div>`;
      const listEl = PP.$('[data-list]', el); const threadEl = PP.$('[data-thread]', el);
      const filtered = () => PP.db.tickets.filter((t) => {
        if (st.status === 'active' ? !['Open', 'Waiting on customer'].includes(t.status) : st.status && t.status !== st.status) return false;
        if (st.priority && t.priority !== st.priority) return false;
        if (st.q) { const q = st.q.toLowerCase(); if (!`${t.id} ${t.subject} ${SA.customerName(t.customerId)} ${t.category} ${t.messages.map((m) => m.text).join(' ')}`.toLowerCase().includes(q)) return false; }
        return true;
      }).sort((a, b) => { const la = a.messages[a.messages.length - 1]; const lb = b.messages[b.messages.length - 1]; return ((lb ? lb.at : b.createdAt) > (la ? la.at : a.createdAt) ? 1 : -1); });
      function drawList() {
        const rows = filtered();
        if (!st.sel || !PP.db.tickets.find((t) => t.id === st.sel)) st.sel = rows[0] ? rows[0].id : null;
        listEl.innerHTML = rows.length ? rows.map((t) => { const last = t.messages[t.messages.length - 1]; return `<a class="sa-ticket ${t.id === st.sel ? 'active' : ''}" data-t="${t.id}" href="#/support?t=${t.id}">
            <div class="row between" style="gap:6px"><b class="small">${esc(t.id)} · ${esc(SA.customerName(t.customerId))}</b>${SA.badge(t.priority, ticketTone(t.priority))}</div>
            <div style="font-weight:600;margin-top:2px">${esc(t.subject)}</div>
            <div class="row between mt-2" style="gap:6px">${SA.badge(t.status)}<span class="sa-mini">${last ? SA.ago(last.at) : ''} · ${esc(SA.staffName(t.assigneeId))}</span></div></a>`; }).join('')
          : PP.ui.empty({ icon: PP.db.tickets.length ? 'filter' : 'mail', title: PP.db.tickets.length ? 'No tickets match' : 'Inbox is empty', text: PP.db.tickets.length ? 'Clear the search or filters.' : 'New customer tickets appear here.' });
        PP.$$('[data-t]', listEl).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); st.sel = a.dataset.t; try { history.replaceState(null, '', `#/support?t=${st.sel}`); } catch (x) { /* ignore */ } drawList(); drawThread(); }));
      }
      function drawThread() {
        const t = PP.db.tickets.find((x) => x.id === st.sel);
        if (!t) { threadEl.innerHTML = `<div class="card-body">${PP.ui.empty({ icon: 'mail', title: 'No ticket selected', text: 'Pick a ticket from the list.' })}</div>`; return; }
        const c = SA.customer(t.customerId);
        threadEl.innerHTML = `<div class="card-head"><div><h2>${esc(t.subject)}</h2><div class="sa-meta mt-2"><span>${PP.icon('building')} ${SA.customerLink(t.customerId)}</span><span>${PP.icon('tag')} ${esc(t.category)}</span><span>${PP.icon('clock')} ${PP.fmt.stamp(t.createdAt)}</span><span>${SA.badge(SA.state(c))}</span></div></div>
            <div class="row"><button class="btn btn-sm" data-remote>${PP.icon('shield')} Request remote support</button></div></div>
          <div class="card-body">
            <div class="form-grid sa-ticket-ctrl" style="grid-template-columns:repeat(3,minmax(0,1fr))">
              ${PP.form.field({ name: 'status', label: 'Status', type: 'select', options: STATUSES, value: t.status, placeholder: false })}
              ${PP.form.field({ name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, value: t.priority, placeholder: false })}
              ${PP.form.field({ name: 'assigneeId', label: 'Assignee', type: 'select', options: staffActive().map((u) => [u.id, u.name]), value: t.assigneeId, placeholder: 'Unassigned' })}
            </div>
            <div class="divider"></div>
            <div class="sa-thread">${t.messages.map((m) => `<div class="sa-msg ${m.from === 'vendor' ? 'vendor' : m.from === 'note' ? 'note' : ''}"><div class="meta">${m.from === 'note' ? 'Internal note · ' : ''}${esc(m.author)} · ${PP.fmt.stamp(m.at)}</div>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')}</div>
            <form class="stack mt-4" novalidate onsubmit="return false" data-reply>
              ${PP.form.field({ name: 'text', label: 'Reply', type: 'textarea', rows: 3, required: true, placeholder: `Write to ${c.contact.name}…`, error: 'Write a message first.' })}
              <div class="row between"><label class="check small"><input type="checkbox" name="wait" ${t.status === 'Open' ? 'checked' : ''}> Set status to “Waiting on customer”</label>
              <div class="row"><button type="button" class="btn" data-note>${PP.icon('edit')} Add internal note</button><button type="button" class="btn btn-primary" data-send>${PP.icon('send')} Send reply</button></div></div>
              <div class="small muted">Never ask customers to send patient data by message. Internal notes are visible to vendor staff only.</div>
            </form>
          </div>`;
        ['status', 'priority', 'assigneeId'].forEach((k) => PP.$(`[name=${k}]`, threadEl).addEventListener('change', (e) => {
          if (!can('support.manage')) { e.target.value = t[k]; return denied('support.manage'); }
          const before = t[k]; t[k] = e.target.value || null;
          PP.audit('Ticket updated', t.customerId, `${t.id} · ${k}: ${k === 'assigneeId' ? SA.staffName(before) : before} → ${k === 'assigneeId' ? SA.staffName(t[k]) : t[k]}`);
          PP.save(); PP.ui.toast(`${esc(t.id)} updated.`); drawList();
        }));
        const form = PP.$('[data-reply]', threadEl);
        const post = async (btn, kind) => {
          if (!can('support.manage')) return denied('support.manage');
          if (!PP.form.validate(form)) return; const v = PP.form.read(form);
          await PP.ui.busy(btn, async () => {
            t.messages.push({ id: PP.nextId('MSG', 5), from: kind, author: PP.currentUser().name, at: PP.nowStamp(), text: v.text });
            if (kind === 'vendor' && v.wait) t.status = 'Waiting on customer';
            PP.audit(kind === 'vendor' ? 'Ticket reply sent' : 'Ticket note added', t.customerId, `${t.id} · ${v.text.slice(0, 60)}`);
            PP.save(); PP.ui.toast(kind === 'vendor' ? `Reply sent to ${esc(c.contact.name)} (simulated).` : 'Internal note added.');
            drawList(); drawThread();
          }, 350);
        };
        PP.$('[data-send]', form).addEventListener('click', (e) => post(e.currentTarget, 'vendor'));
        PP.$('[data-note]', form).addEventListener('click', (e) => post(e.currentTarget, 'note'));
        PP.$('[data-remote]', threadEl).addEventListener('click', () => B.requestRemote(t.customerId, t.id, drawThread));
      }
      PP.$('[data-q]', el).addEventListener('input', (e) => { st.q = e.target.value.trim(); drawList(); drawThread(); });
      PP.$('[data-fs]', el).addEventListener('change', (e) => { st.status = e.target.value; drawList(); drawThread(); });
      PP.$('[data-fp]', el).addEventListener('change', (e) => { st.priority = e.target.value; drawList(); drawThread(); });
      PP.$('[data-new]', el).addEventListener('click', () => B.newTicket((id) => { st.sel = id; st.q = ''; st.status = ''; st.priority = ''; PP.$('[data-q]', el).value = ''; PP.$('[data-fs]', el).value = ''; PP.$('[data-fp]', el).value = ''; drawList(); drawThread(); }));
      drawList(); drawThread();
    },
  });

  /* ============================================================== /support/announcements */
  const audienceLabel = (a) => {
    if (!a || a === 'all') return 'All customers';
    const [k, v] = a.split(':');
    return k === 'plan' ? `Plan: ${SA.planName(v)}` : `Customer: ${SA.customerName(v)}`;
  };
  const audienceReach = (a) => {
    if (!a || a === 'all') return PP.db.customers.length;
    const [k, v] = a.split(':'); return PP.db.customers.filter((c) => (k === 'plan' ? c.planId === v : c.id === v)).length;
  };
  const annPreview = (a) => {
    const tone = a.severity === 'Critical' ? 'error' : a.severity === 'Warning' ? 'warning' : 'info';
    return `<div class="sa-preview-frame"><div class="sa-preview-bar"><i></i><i></i><i></i> Customer workspace · notification centre</div>
      <div style="padding:14px">${PP.ui.alert(tone, `<b>${esc(a.title || 'Announcement title')}</b><br>${esc(a.body || 'Announcement text appears here.')}<div class="small" style="margin-top:6px;opacity:.8">From the Physio Point team</div>`)}</div></div>`;
  };
  function editAnnouncement(a, after) {
    if (!can('support.manage')) return denied('support.manage');
    const isNew = !a; const cur = a || { title: '', body: '', audience: 'all', severity: 'Info' };
    const [ak, av] = (cur.audience || 'all').split(':');
    PP.ui.modal({
      title: isNew ? 'New announcement' : `Edit ${esc(cur.id)}`, size: 'lg',
      body: `<form class="form-grid" novalidate onsubmit="return false">
          ${PP.form.field({ name: 'title', label: 'Title', required: true, value: cur.title, full: true })}
          ${PP.form.field({ name: 'body', label: 'Message', type: 'textarea', rows: 4, required: true, value: cur.body, full: true })}
          ${PP.form.field({ name: 'severity', label: 'Severity', type: 'select', options: ['Info', 'Warning', 'Critical'], value: cur.severity, placeholder: false })}
          ${PP.form.field({ name: 'ak', label: 'Audience', type: 'select', options: [['all', 'All customers'], ['plan', 'Customers on a plan'], ['customer', 'One customer']], value: ak, placeholder: false })}
          <div class="full" data-plan-f>${PP.form.field({ name: 'plan', label: 'Plan', type: 'select', options: PP.db.plans.map((p) => [p.id, p.name]), value: ak === 'plan' ? av : '' })}</div>
          <div class="full" data-cust-f>${PP.form.field({ name: 'customer', label: 'Customer', type: 'select', options: PP.db.customers.map((c) => [c.id, c.name]), value: ak === 'customer' ? av : '' })}</div>
          <div class="full small muted" data-reach></div>
          <div class="full"><div class="label" style="font-weight:600;margin-bottom:6px">Preview</div><div data-prev></div></div>
        </form>`,
      onOpen: (body) => {
        const f = PP.$('form', body);
        const sync = () => {
          const v = PP.form.read(f);
          PP.$('[data-plan-f]', body).classList.toggle('hidden', v.ak !== 'plan'); PP.$('[name=plan]', body).required = v.ak === 'plan'; PP.$('[name=plan]', body).disabled = v.ak !== 'plan';
          PP.$('[data-cust-f]', body).classList.toggle('hidden', v.ak !== 'customer'); PP.$('[name=customer]', body).required = v.ak === 'customer'; PP.$('[name=customer]', body).disabled = v.ak !== 'customer';
          const aud = v.ak === 'all' ? 'all' : `${v.ak}:${v.ak === 'plan' ? v.plan : v.customer}`;
          PP.$('[data-reach]', body).textContent = `Reaches ${audienceReach(aud)} customer deployment(s) through their in-app notification centre (notifications.in_app).`;
          PP.$('[data-prev]', body).innerHTML = annPreview({ title: v.title, body: v.body, severity: v.severity });
        };
        f.addEventListener('input', sync); f.addEventListener('change', sync); sync();
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' },
        { label: 'Save draft', onClick: ({ body }) => save(body, false) },
        { label: `${PP.icon('send')} Publish`, kind: 'primary', onClick: ({ body }) => save(body, true) }],
    });
    async function save(body, publish) {
      const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
      await PP.sleep(350);
      const aud = v.ak === 'all' ? 'all' : `${v.ak}:${v.ak === 'plan' ? v.plan : v.customer}`;
      const rec = a || { id: PP.nextId('ANN', 4), status: 'Draft', publishedAt: null, by: PP.currentUser().name, reads: 0 };
      Object.assign(rec, { title: v.title, body: v.body, severity: v.severity, audience: aud });
      if (publish) { rec.status = 'Published'; rec.publishedAt = PP.nowStamp(); }
      if (isNew) PP.db.announcements.unshift(rec);
      PP.audit(publish ? 'Announcement published' : (isNew ? 'Announcement drafted' : 'Announcement edited'), rec.id, `${rec.title} · ${audienceLabel(aud)}`);
      PP.save(); PP.ui.toast(publish ? `Published to ${audienceReach(aud)} customer(s).` : 'Draft saved.');
      if (after) after();
    }
  }
  PP.route('/support/announcements', {
    title: 'Support · Announcements',
    render({ el }) {
      el.innerHTML = PP.ui.pageHead({ title: 'Announcements', subtitle: 'In-app announcements to customer admins (maintenance, releases, incidents).', crumbs: [['Support', '#/support'], ['Announcements']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New announcement</button>` })
        + PP.ui.card({ flush: true, body: '<div data-t></div>' });
      const t = PP.ui.table(PP.$('[data-t]', el), {
        columns: [
          { key: 'title', label: 'Announcement', sort: (r) => r.title, render: (r) => `<b>${esc(r.title)}</b><span class="sub">${esc(r.body.slice(0, 90))}${r.body.length > 90 ? '…' : ''}</span>` },
          { key: 'aud', label: 'Audience', render: (r) => `${esc(audienceLabel(r.audience))}<span class="sub">${audienceReach(r.audience)} customer(s)</span>`, exportValue: (r) => audienceLabel(r.audience) },
          { key: 'severity', label: 'Severity', render: (r) => SA.badge(r.severity, r.severity === 'Critical' ? 'error' : r.severity === 'Warning' ? 'warning' : 'info') },
          { key: 'status', label: 'Status', sort: (r) => r.status, render: (r) => SA.badge(r.status) },
          { key: 'pub', label: 'Published', sort: (r) => r.publishedAt || '', render: (r) => (r.publishedAt ? `${PP.fmt.stamp(r.publishedAt)}<span class="sub">${esc(r.by)} · read by ${r.reads || 0}</span>` : '<span class="muted">—</span>') },
          { key: 'act', label: '', render: (r) => `<span class="row-actions"><button class="btn btn-ghost btn-sm" data-prev="${r.id}" aria-label="Preview">${PP.icon('eye')}</button>${r.status !== 'Archived' ? `<button class="btn btn-ghost btn-sm" data-edit="${r.id}" aria-label="Edit">${PP.icon('edit')}</button>` : ''}${r.status === 'Draft' ? `<button class="btn btn-sm" data-pub="${r.id}">Publish</button>` : ''}${r.status === 'Published' ? `<button class="btn btn-ghost btn-sm" data-arc="${r.id}">Archive</button>` : ''}</span>` },
        ],
        getRows: () => PP.db.announcements,
        search: { placeholder: 'Search announcements', text: (r) => `${r.title} ${r.body}` },
        filters: [{ id: 's', label: 'All statuses', options: [['Draft', 'Draft'], ['Published', 'Published'], ['Archived', 'Archived']], match: (r, v) => r.status === v }],
        exportName: 'announcements', empty: { icon: 'bell', title: 'No announcements yet', text: 'Tell customers about releases, maintenance or incidents.' },
        afterDraw: (c) => {
          const find = (id) => PP.db.announcements.find((x) => x.id === id);
          PP.$$('[data-prev]', c).forEach((b) => b.addEventListener('click', () => { const a = find(b.dataset.prev); PP.ui.modal({ title: `Preview · ${esc(a.id)}`, body: annPreview(a) + `<p class="small muted">Audience: ${esc(audienceLabel(a.audience))}</p>`, buttons: [{ label: 'Close' }] }); }));
          PP.$$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => editAnnouncement(find(b.dataset.edit), t.refresh)));
          PP.$$('[data-pub]', c).forEach((b) => b.addEventListener('click', async () => {
            if (!can('support.manage')) return denied('support.manage');
            const a = find(b.dataset.pub); const ok = await PP.ui.confirm({ title: 'Publish announcement?', message: `“${esc(a.title)}” goes to ${audienceReach(a.audience)} customer(s).`, confirmLabel: 'Publish' }); if (!ok) return;
            a.status = 'Published'; a.publishedAt = PP.nowStamp(); PP.audit('Announcement published', a.id, a.title); PP.save(); PP.ui.toast('Announcement published.'); t.refresh();
          }));
          PP.$$('[data-arc]', c).forEach((b) => b.addEventListener('click', async () => {
            if (!can('support.manage')) return denied('support.manage');
            const a = find(b.dataset.arc); const ok = await PP.ui.confirm({ title: 'Archive announcement?', message: 'It disappears from customer notification centres. The record is kept.', confirmLabel: 'Archive' }); if (!ok) return;
            a.status = 'Archived'; PP.audit('Announcement archived', a.id, a.title); PP.save(); PP.ui.toast('Announcement archived.'); t.refresh();
          }));
        },
      });
      PP.$('[data-new]', el).addEventListener('click', () => editAnnouncement(null, t.refresh));
    },
  });

  /* ============================================================== /support/remote (consent log) */
  B.expireSessions = function () {
    let changed = false; const now = PP.nowStamp();
    (PP.db.remoteSessions || []).forEach((s) => { if (s.status === 'Active' && s.end && s.end < now) { s.status = 'Expired'; s.actions.push('Session ended automatically at the end of the consented window'); changed = true; } });
    if (changed) PP.save();
  };
  PP.route('/support/remote', {
    title: 'Support · Remote support log',
    render({ el }) {
      B.expireSessions();
      el.innerHTML = PP.ui.pageHead({ title: 'Remote-support consent log', subtitle: 'Every vendor access to a customer deployment: who asked, who consented, for how long, and what was done.', crumbs: [['Support', '#/support'], ['Remote support']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New request</button>` })
        + `<div class="stack">${SA.pending('PD-004', 'Proposed rule: only explicit, time-limited, audited access. The customer admin grants each session; it ends automatically; every action is logged; patient records are out of scope unless the customer explicitly allows them.')}
          ${SA.pending('PD-026', 'Who operates the deployment (vendor-managed or customer-managed) is still open. Normal operation needs no inbound vendor access: the data plane pulls (D-021).')}</div>`
        + PP.ui.card({ flush: true, body: '<div data-t></div>', cls: 'mt-4' });
      const find = (id) => PP.db.remoteSessions.find((x) => x.id === id);
      const t = PP.ui.table(PP.$('[data-t]', el), {
        columns: [
          { key: 'id', label: 'Session', sort: (r) => r.requestedAt, render: (r) => `<b>${esc(r.id)}</b><span class="sub">${PP.fmt.stamp(r.requestedAt)}</span>` },
          { key: 'c', label: 'Customer', sort: (r) => SA.customerName(r.customerId), render: (r) => `${SA.customerLink(r.customerId)}${r.ticketId ? `<span class="sub"><a href="#/support?t=${esc(r.ticketId)}">${esc(r.ticketId)}</a></span>` : ''}`, exportValue: (r) => SA.customerName(r.customerId) },
          { key: 'who', label: 'Requested / consented', render: (r) => `${esc(r.requestedBy)}<span class="sub">${r.consentBy ? 'Consent: ' + esc(r.consentBy) : 'No consent yet'}</span>` },
          { key: 'scope', label: 'Scope', render: (r) => `<span class="small">${esc(r.scope)}</span>` },
          { key: 'win', label: 'Window', sort: (r) => r.start || '', render: (r) => (r.start ? `<span class="small">${PP.fmt.stamp(r.start)}<br>→ ${PP.fmt.stamp(r.end)}</span>` : `<span class="muted small">${r.hours ? r.hours + ' h requested' : '—'}</span>`) },
          { key: 'status', label: 'Status', sort: (r) => r.status, render: (r) => SA.badge(r.status) },
          { key: 'act', label: '', render: (r) => `<span class="row-actions">${r.status === 'Requested' ? `<button class="btn btn-sm" data-consent="${r.id}">Simulate consent</button>` : ''}${r.status === 'Active' ? `<button class="btn btn-sm" data-end="${r.id}">End session</button>` : ''}${['Requested', 'Active'].includes(r.status) ? `<button class="btn btn-ghost btn-sm" data-revoke="${r.id}">Revoke</button>` : ''}</span>` },
        ],
        getRows: () => PP.db.remoteSessions.slice().sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)),
        search: { placeholder: 'Search customer, staff or scope', text: (r) => `${r.id} ${SA.customerName(r.customerId)} ${r.requestedBy} ${r.consentBy || ''} ${r.scope}` },
        filters: [{ id: 's', label: 'All statuses', options: ['Requested', 'Active', 'Expired', 'Revoked'].map((s) => [s, s]), match: (r, v) => r.status === v }],
        exportName: 'remote-support-log', empty: { icon: 'shield', title: 'No remote sessions', text: 'Remote access is requested from a ticket and must be granted by the customer.' },
        onRowClick: (r) => PP.ui.modal({ title: `Session ${esc(r.id)} ${SA.badge(r.status)}`, body: `<dl class="kv kv-tight"><dt>Customer</dt><dd>${SA.customerLink(r.customerId)}</dd><dt>Ticket</dt><dd>${esc(r.ticketId || '—')}</dd><dt>Requested</dt><dd>${esc(r.requestedBy)} · ${PP.fmt.stamp(r.requestedAt)}</dd><dt>Consent</dt><dd>${esc(r.consentBy || 'Not granted')}</dd><dt>Scope</dt><dd>${esc(r.scope)}</dd><dt>Window</dt><dd>${r.start ? `${PP.fmt.stamp(r.start)} → ${PP.fmt.stamp(r.end)}` : '—'}</dd>${r.revokeReason ? `<dt>Revoked</dt><dd>${esc(r.revokeReason)}</dd>` : ''}</dl><h3 class="mt-4">Action log</h3>${r.actions.length ? `<ol class="small">${r.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>` : '<p class="muted small">No actions recorded.</p>'}`, buttons: [{ label: 'Close' }] }),
        afterDraw: (c) => {
          PP.$$('[data-consent]', c).forEach((b) => b.addEventListener('click', () => {
            const s = find(b.dataset.consent); const cu = SA.customer(s.customerId);
            PP.ui.modal({
              title: 'Simulate customer consent',
              body: `<form class="stack" novalidate onsubmit="return false">${PP.ui.alert('info', `Prototype: in production the customer admin of <b>${esc(cu.name)}</b> approves this inside their own workspace. The vendor cannot grant it.`)}
                ${PP.form.field({ name: 'who', label: 'Consenting customer admin', required: true, value: cu.contact.name })}
                ${PP.form.field({ name: 'hours', label: 'Granted duration', type: 'select', options: [['1', '1 hour'], ['2', '2 hours'], ['4', '4 hours']], value: String(s.hours || 2), placeholder: false })}</form>`,
              buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Grant (as customer)', kind: 'primary', onClick: async ({ body }) => {
                const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f); await PP.sleep(300);
                s.status = 'Active'; s.consentBy = `${v.who} (customer admin)`; s.start = PP.nowStamp(); s.end = new Date(Date.now() + Number(v.hours) * 3600000).toISOString();
                s.actions.push(`Consent granted by ${v.who} for ${v.hours} h`);
                PP.audit('Remote support consent granted', s.customerId, `${s.id} · ${v.who} · ${v.hours} h`); PP.save(); PP.ui.toast(`Session ${esc(s.id)} active until ${PP.fmt.stamp(s.end)}.`); t.refresh();
              } }],
            });
          }));
          PP.$$('[data-end]', c).forEach((b) => b.addEventListener('click', async () => {
            const s = find(b.dataset.end); const ok = await PP.ui.confirm({ title: 'End this session now?', message: 'Access is closed immediately. The log is kept.', confirmLabel: 'End session' }); if (!ok) return;
            s.status = 'Expired'; s.end = PP.nowStamp(); s.actions.push(`Session ended by ${PP.currentUser().name}`);
            PP.audit('Remote support session ended', s.customerId, s.id); PP.save(); PP.ui.toast('Session ended.'); t.refresh();
          }));
          PP.$$('[data-revoke]', c).forEach((b) => b.addEventListener('click', async () => {
            const s = find(b.dataset.revoke); const r = await PP.ui.confirm({ title: 'Revoke remote access?', message: 'The request or session is revoked immediately.', confirmLabel: 'Revoke', danger: true, reasonLabel: 'Reason', reasonRequired: true }); if (!r) return;
            s.status = 'Revoked'; s.revokeReason = r.reason; if (s.start && s.end > PP.nowStamp()) s.end = PP.nowStamp(); s.actions.push(`Revoked by ${PP.currentUser().name}: ${r.reason}`);
            PP.audit('Remote support revoked', s.customerId, `${s.id} · ${r.reason}`); PP.save(); PP.ui.toast('Access revoked.', 'warning'); t.refresh();
          }));
        },
      });
      PP.$('[data-new]', el).addEventListener('click', () => {
        PP.ui.modal({ title: 'Request remote support', body: `<form novalidate onsubmit="return false">${PP.form.field({ name: 'c', label: 'Customer', type: 'select', required: true, options: PP.db.customers.filter((c) => c.status !== 'Onboarding').map((c) => [c.id, c.name]) })}</form>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Continue', kind: 'primary', onClick: ({ body, close }) => { const f = PP.$('form', body); if (!PP.form.validate(f)) return false; close(); B.requestRemote(PP.form.read(f).c, null, t.refresh); } }] });
      });
    },
  });

  /* ============================================================== /staff (vendor staff & roles) */
  const nextStaffId = () => `VS-${Math.max(0, ...PP.db.users.map((u) => Number(String(u.id).replace(/\D/g, '')) || 0)) + 1}`;
  function editStaff(u, after) {
    if (!can('staff.manage')) return denied('staff.manage');
    const isNew = !u; const cur = u || { name: '', email: '', mobile: '', role: 'support' };
    PP.ui.modal({
      title: isNew ? 'Add vendor staff' : `Edit ${esc(cur.name)}`,
      body: `<form class="form-grid" novalidate onsubmit="return false">
          ${PP.form.field({ name: 'name', label: 'Full name', required: true, value: cur.name })}
          ${PP.form.field({ name: 'email', label: 'Work email', type: 'email', required: true, rule: 'email', value: cur.email })}
          ${PP.form.field({ name: 'mobile', label: 'Mobile (for the two-step code)', type: 'tel', required: true, rule: 'mobile', value: cur.mobile })}
          ${PP.form.field({ name: 'role', label: 'Role', type: 'select', required: true, options: PP.db.roles.map((r) => [r.id, r.name]), value: cur.role, placeholder: false, disabled: !isNew && u.id === PP.currentUser().id })}
          <div class="field full"><label class="check"><input type="checkbox" checked disabled> Two-step sign-in (MFA) required</label><div class="hint">Mandatory for every vendor account. It cannot be turned off.</div></div>
          ${isNew ? `<div class="full">${PP.ui.alert('info', 'An invitation is sent (simulated). The person sets a password and registers the two-step code on first sign-in.')}</div>` : ''}
        </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: isNew ? 'Add and invite' : 'Save changes', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        if (PP.db.users.some((x) => x.email.toLowerCase() === v.email.toLowerCase() && x !== u)) { PP.form.setError(f, 'email', 'Another staff account already uses this email.'); return false; }
        await PP.sleep(350);
        if (isNew) {
          const n = { id: nextStaffId(), name: v.name, email: v.email, mobile: v.mobile, role: v.role, status: 'Active', mfa: true, lastLogin: null, invitedAt: PP.nowStamp() };
          PP.db.users.push(n); PP.audit('Vendor staff added', n.id, `${n.name} · ${v.role}`);
        } else {
          const before = `${u.name} · ${u.role}`; u.name = v.name; u.email = v.email; u.mobile = v.mobile; if (v.role) u.role = v.role; u.mfa = true;
          PP.audit('Vendor staff edited', u.id, `${before} → ${u.name} · ${u.role}`);
        }
        PP.save(); PP.ui.toast(isNew ? `${esc(v.name)} added and invited (simulated).` : 'Staff account saved.');
        if (after) after();
      } }],
    });
  }
  PP.route('/staff', {
    title: 'Vendor staff & roles',
    render({ el }) {
      const draw = () => {
        el.innerHTML = PP.ui.pageHead({ title: 'Vendor staff & roles', subtitle: 'Who can use the Super Admin console and what each role may do (platform.staff).', crumbs: [['Administration'], ['Vendor staff']], actions: `<button class="btn btn-primary" data-new>${PP.icon('userPlus')} Add staff</button>` })
          + SA.pending('PD-033', 'The vendor roles below (Owner, Sales, Support, Billing, Release engineering, Auditor) are a proposal. In production every action is checked on the server, not only by hiding menus.')
          + PP.ui.card({ title: 'Staff accounts', flush: true, body: '<div data-t></div>', cls: 'mt-4' })
          + PP.ui.card({ title: 'Role permissions', actions: `<button class="btn btn-sm" data-addrole>${PP.icon('plus')} Add role</button><button class="btn btn-sm btn-primary" data-saveroles>Save permissions</button>`, flush: true, cls: 'mt-4',
            body: `<div class="table-wrap"><table class="table sa-perm-matrix"><thead><tr><th>Permission</th>${PP.db.roles.map((r) => `<th class="center" title="${esc(r.description || '')}">${esc(r.name)}</th>`).join('')}</tr></thead><tbody>
              ${SA.PERMISSIONS.map(([p, l]) => `<tr><td>${esc(l)}<span class="sub"><code>${esc(p)}</code></span></td>${PP.db.roles.map((r) => { const all = r.permissions.includes('*'); return `<td class="center"><input type="checkbox" aria-label="${esc(r.name)}: ${esc(l)}" data-role="${r.id}" data-perm="${p}" ${all || r.permissions.includes(p) ? 'checked' : ''} ${all ? 'disabled title="Owner has every permission"' : ''}></td>`; }).join('')}</tr>`).join('')}
            </tbody></table></div>` });
        PP.ui.table(PP.$('[data-t]', el), {
          columns: [
            { key: 'name', label: 'Name', sort: (r) => r.name, render: (r) => `<div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(PP.initials(r.name))}</span><span><b>${esc(r.name)}</b>${r.id === PP.currentUser().id ? ' <span class="sa-pill">You</span>' : ''}<span class="sub">${esc(r.email)}</span></span></div>`, exportValue: (r) => r.name },
            { key: 'role', label: 'Role', sort: (r) => r.role, render: (r) => esc((PP.db.roles.find((x) => x.id === r.role) || {}).name || r.role) },
            { key: 'mfa', label: 'Two-step', render: () => SA.badge('On', 'positive'), exportValue: () => 'On' },
            { key: 'status', label: 'Status', sort: (r) => r.status, render: (r) => SA.badge(r.invitedAt && !r.lastLogin && r.status === 'Active' ? 'Invited' : r.status, r.invitedAt && !r.lastLogin && r.status === 'Active' ? 'warning' : undefined) },
            { key: 'last', label: 'Last sign-in', sort: (r) => r.lastLogin || '', render: (r) => (r.lastLogin ? `<span class="small">${PP.fmt.stamp(r.lastLogin)}</span>` : '<span class="muted small">Never</span>') },
            { key: 'act', label: '', render: (r) => `<span class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${r.id}" aria-label="Edit ${esc(r.name)}">${PP.icon('edit')}</button>${r.id !== PP.currentUser().id ? `<button class="btn btn-sm ${r.status === 'Active' ? 'btn-ghost' : ''}" data-tog="${r.id}">${r.status === 'Active' ? 'Disable' : 'Enable'}</button>` : ''}</span>` },
          ],
          getRows: () => PP.db.users,
          search: { placeholder: 'Search staff', text: (r) => `${r.name} ${r.email} ${r.role}` },
          filters: [{ id: 'r', label: 'All roles', options: PP.db.roles.map((r) => [r.id, r.name]), match: (r, v) => r.role === v }, { id: 's', label: 'All statuses', options: [['Active', 'Active'], ['Disabled', 'Disabled']], match: (r, v) => r.status === v }],
          exportName: 'vendor-staff',
          afterDraw: (c) => {
            PP.$$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => editStaff(PP.find.user(b.dataset.edit), draw)));
            PP.$$('[data-tog]', c).forEach((b) => b.addEventListener('click', async () => {
              if (!can('staff.manage')) return denied('staff.manage');
              const u = PP.find.user(b.dataset.tog);
              if (u.id === PP.currentUser().id) { PP.ui.toast('You cannot disable your own account.', 'error'); return; }
              if (u.status === 'Active') {
                const r = await PP.ui.confirm({ title: `Disable ${esc(u.name)}?`, message: 'They are signed out everywhere and cannot sign in. The account and its audit history are kept.', confirmLabel: 'Disable', danger: true, reasonLabel: 'Reason', reasonRequired: true }); if (!r) return;
                if (u.role === 'owner' && PP.db.users.filter((x) => x.role === 'owner' && x.status === 'Active').length <= 1) { PP.ui.toast('At least one active Owner is required.', 'error'); return; }
                u.status = 'Disabled'; PP.audit('Vendor staff disabled', u.id, `${u.name} · ${r.reason}`);
              } else { u.status = 'Active'; PP.audit('Vendor staff enabled', u.id, u.name); }
              PP.save(); PP.ui.toast(`${esc(u.name)} is now ${u.status.toLowerCase()}.`); PP.refreshShell();
            }));
          },
        });
        PP.$('[data-new]', el).addEventListener('click', () => editStaff(null, draw));
        PP.$('[data-saveroles]', el).addEventListener('click', async (e) => {
          if (!can('staff.manage')) return denied('staff.manage');
          const changes = [];
          PP.db.roles.forEach((r) => {
            if (r.permissions.includes('*')) return;
            const next = SA.PERMISSIONS.map(([p]) => p).filter((p) => PP.$(`[data-role="${r.id}"][data-perm="${p}"]`, el).checked);
            const added = next.filter((p) => !r.permissions.includes(p)); const removed = r.permissions.filter((p) => !next.includes(p));
            if (added.length || removed.length) changes.push({ r, next, added, removed });
          });
          if (!changes.length) { PP.ui.toast('No permission changes to save.', 'info'); return; }
          const res = await PP.ui.confirm({ title: 'Save role permissions?', message: changes.map((x) => `<b>${esc(x.r.name)}</b>: ${x.added.length ? '+' + x.added.map(esc).join(', +') : ''} ${x.removed.length ? '−' + x.removed.map(esc).join(', −') : ''}`).join('<br>'), confirmLabel: 'Save', reasonLabel: 'Reason for the change', reasonRequired: true });
          if (!res) return;
          await PP.ui.busy(e.target.closest('button'), async () => {
            changes.forEach((x) => { x.r.permissions = x.next; PP.audit('Role permissions changed', `role:${x.r.id}`, `${x.added.length ? '+' + x.added.join(', +') : ''} ${x.removed.length ? '−' + x.removed.join(', −') : ''} · ${res.reason}`.trim()); });
            PP.save(); PP.ui.toast('Role permissions saved.'); PP.refreshShell();
          });
        });
        PP.$('[data-addrole]', el).addEventListener('click', () => {
          if (!can('staff.manage')) return denied('staff.manage');
          PP.ui.modal({ title: 'Add role', body: `<form class="stack" novalidate onsubmit="return false">${PP.form.field({ name: 'name', label: 'Role name', required: true })}${PP.form.field({ name: 'description', label: 'Description' })}<div class="hint">New roles start without permissions; tick them in the matrix, then save.</div></form>`,
            buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Add role', kind: 'primary', onClick: async ({ body }) => {
              const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
              const rid = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
              if (!rid || PP.db.roles.some((r) => r.id === rid || r.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'A role with this name already exists.'); return false; }
              PP.db.roles.push({ id: rid, name: v.name, description: v.description, permissions: ['dashboard.view'] });
              PP.audit('Role added', `role:${rid}`, v.name); PP.save(); PP.ui.toast(`Role “${esc(v.name)}” added.`); draw();
            } }] });
        });
      };
      draw();
    },
  });

  /* ============================================================== /audit (vendor audit log) */
  const AUDIT_CATS = [
    ['Licences', /licen/i], ['Entitlements', /entitle|feature|override|rollback|limit|plan/i], ['Billing', /invoice|payment|reminder/i],
    ['Support', /ticket|announce|remote/i], ['Demo & trial', /sandbox|lead|trial|demo/i], ['Releases & fleet', /release|roll ?out|update|deploy/i],
    ['Domains & branding', /domain|ssl|brand|dns/i], ['Staff & access', /staff|role|sign/i], ['Customers', /customer|suspend|reactivat|activat|onboard/i],
  ];
  const auditCat = (a) => (AUDIT_CATS.find(([, re]) => re.test(a.action)) || ['Other'])[0];
  PP.route('/audit', {
    title: 'Vendor audit log',
    perm: 'audit.view',
    render({ el }) {
      el.innerHTML = PP.ui.pageHead({ title: 'Vendor audit log', subtitle: 'Append-only record of every Super Admin change: who, when, what and why.', crumbs: [['Administration'], ['Audit log']] })
        + PP.ui.alert('info', 'Entries cannot be edited or deleted. Changes to entitlements, licences, lifecycle, releases, staff and remote support all land here. No patient data is ever recorded.')
        + PP.ui.card({ flush: true, body: '<div data-t></div>', cls: 'mt-4' });
      const range = { from: '', to: '' };
      const t = PP.ui.table(PP.$('[data-t]', el), {
        columns: [
          { key: 'at', label: 'Time', sort: (r) => r.at, render: (r) => `<span class="small nowrap">${PP.fmt.stamp(r.at)}</span><span class="sub">${esc(r.id)}</span>`, exportValue: (r) => r.at },
          { key: 'user', label: 'Staff', sort: (r) => r.userName, render: (r) => esc(r.userName) },
          { key: 'action', label: 'Action', sort: (r) => r.action, render: (r) => `<b>${esc(r.action)}</b><span class="sub">${esc(auditCat(r))}</span>`, exportValue: (r) => r.action },
          { key: 'target', label: 'Target', render: (r) => (/^CUS-\d+$/.test(r.target) && SA.customer(r.target) ? `${SA.customerLink(r.target)}<span class="sub">${esc(r.target)}</span>` : `<code>${esc(r.target || '—')}</code>`), exportValue: (r) => r.target },
          { key: 'detail', label: 'Detail', render: (r) => `<span class="small">${esc(r.detail)}</span>` },
        ],
        getRows: () => PP.db.audit.filter((a) => (!range.from || a.at.slice(0, 10) >= range.from) && (!range.to || a.at.slice(0, 10) <= range.to)),
        sortKey: 'at', sortDir: 'desc', pageSize: 25,
        search: { placeholder: 'Search action, target or detail', text: (r) => `${r.action} ${r.target} ${r.detail} ${r.userName} ${SA.customerName(r.target)}` },
        filters: [
          { id: 'u', label: 'All staff', options: [...PP.db.users.map((u) => [u.id, u.name]), ['__system', 'System']], match: (r, v) => (v === '__system' ? !r.userId : r.userId === v) },
          { id: 'c', label: 'All action types', options: [...AUDIT_CATS.map(([n]) => [n, n]), ['Other', 'Other']], match: (r, v) => auditCat(r) === v },
        ],
        tools: `<label class="small muted" for="au-from">From</label><input class="input" style="width:auto" type="date" id="au-from" data-from><label class="small muted" for="au-to">To</label><input class="input" style="width:auto" type="date" id="au-to" data-to>`,
        exportName: 'vendor-audit-log', empty: { icon: 'clipboard', title: 'No audit entries' },
      });
      const fromEl = PP.$('[data-from]', el); const toEl = PP.$('[data-to]', el);
      const onRange = () => {
        if (fromEl.value && toEl.value && fromEl.value > toEl.value) { PP.ui.toast('The “from” date must be before the “to” date.', 'error'); toEl.value = ''; }
        range.from = fromEl.value; range.to = toEl.value; t.state.page = 1; t.refresh();
      };
      fromEl.addEventListener('change', onRange); toEl.addEventListener('change', onRange);
    },
  });
})();
