/* Physio Point HTML prototype — Services & Pricing, Billing, Finance, Commissions and Reports.
   Screens 18–21 plus finance (D-023) and commission (D-025, D-026).
   Money always flows through PP.bill (payments → income entries → commission entries). Mock data only (D-006). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;
  const $ = PP.$;
  const $$ = PP.$$;
  const money = (n) => PP.fmt.money(n);
  const r2 = (n) => PP.round2(Number(n) || 0);

  /* ================================================================ helpers */
  const VISIT_TYPES = [['first', 'First visit'], ['followup', 'Follow-up'], ['report', 'Report review']];
  const visitTypeLabel = (k) => (VISIT_TYPES.find((v) => v[0] === k) || [k, k])[1];
  const COMMISSION_MODELS = [
    ['percent', 'Percentage of money collected'], ['fixed', 'Fixed amount per visit'], ['per_service', 'Rate per service'],
    ['tiered', 'Tiered (monthly collection)'], ['mixed', 'Mixed (percentage + fixed per visit)'],
  ];
  const SYSTEM_INCOME = ['CAT-I-PAT', 'CAT-I-REF', 'CAT-I-REV'];

  function ensure() {
    const db = PP.db;
    ['cashClosings', 'advances', 'settlements', 'commissionEntries', 'incomes', 'expenses', 'financeCategories', 'payments', 'invoices'].forEach((k) => { if (!db[k]) db[k] = []; });
    if (!db.settings.professionalFees) db.settings.professionalFees = {};
  }
  const user = () => PP.currentUser() || {};
  const userName = (id) => { const u = id ? PP.find.user(id) : null; return u ? u.name : '—'; };
  const catName = (id) => { const c = (PP.db.financeCategories || []).find((x) => x.id === id); return c ? c.name : id || '—'; };
  const userBranches = () => { const u = user(); return PP.db.branches.filter((b) => PP.isOrgWide() || (u.branchIds || []).includes(b.id)); };
  const matchBranch = (rec, sel) => !sel || sel === 'ALL' || rec.branchId === sel;
  const branchLabel = (sel) => (!sel || sel === 'ALL' ? 'All branches' : PP.branchName(sel));
  const isClosed = (branchId, date) => (PP.db.cashClosings || []).some((c) => c.branchId === branchId && c.date === date && c.status === 'Closed');
  const invLink = (id) => (id ? `<a href="#/billing/${esc(id)}">${esc(id)}</a>` : '—');
  const patLink = (id) => (id ? `<a href="#/patients/${esc(id)}">${esc(PP.patientName(id))}</a>` : '—');
  const signed = (n) => `<span class="${n < 0 ? 'fin-neg' : ''}">${money(n)}</span>`;
  const short = (v) => { const a = Math.abs(v); return a >= 100000 ? `${(v / 1000).toFixed(0)}k` : a >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v)); };
  const cssVar = (name, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch (e) { return fb; } };
  const colors = () => ({ action: cssVar('--pp-action', '#008B83'), primary: cssVar('--pp-primary', '#083E44'), warn: '#d97706', error: '#c2410c', info: '#2563eb', lav: '#6d5bd0', grey: '#94a3b8' });
  const csv = (name, rows) => { PP.downloadCsv(`${name}-${PP.today()}.csv`, rows); PP.ui.toast(`Exported ${rows.length - 1} rows to CSV (opens in Excel)`); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const addMonths = (key, n) => { let [y, m] = key.split('-').map(Number); m += n; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return `${y}-${pad2(m)}`; };
  const monthEnd = (key) => { const [y, m] = key.split('-').map(Number); return PP.isoOf(new Date(y, m, 0)); };
  const monthsBetween = (fromKey, toKey) => { const out = []; let k = fromKey; let guard = 0; while (k <= toKey && guard++ < 60) { out.push(k); k = addMonths(k, 1); } return out; };
  const daysBetween = (from, to) => { const out = []; let d = from; let guard = 0; while (d <= to && guard++ < 400) { out.push(d); d = PP.addDays(d, 1); } return out; };
  const settlementTone = (s) => (s === 'Draft' ? 'warning' : s === 'Approved' ? 'lavender' : s === 'Paid out' ? 'positive' : 'neutral');
  const entryTone = (t) => (t === 'accrual' ? 'positive' : t === 'reversal' ? 'error' : 'warning');
  const typeLabel = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const proOptions = (activeOnly) => PP.db.professionals.filter((p) => !activeOnly || p.status === 'Active').map((p) => [p.id, PP.proName(p)]);
  const canSeeCommission = (inv) => PP.can('commissions.manage') || (PP.can('commissions.view_own') && user().professionalId && inv && inv.professionalId === user().professionalId);
  const unappliedAdvances = (patientId) => (PP.db.advances || []).filter((a) => a.patientId === patientId && !a.appliedInvoiceId && a.status !== 'Refunded');
  const refundedOf = (payId) => r2(PP.sum(PP.db.payments.filter((p) => p.type === 'refund' && p.refundOf === payId && p.status === 'Completed'), (p) => p.amount));
  const tabFrom = (query, allowed, fallback) => (allowed.includes(query.tab) ? query.tab : fallback);

  /** Applies a patient's unapplied advance deposits to an invoice (records 'Advance' payments → commission earned now, D-026). */
  function applyAdvances(inv, maxAmount) {
    let left = r2(maxAmount); let applied = 0;
    unappliedAdvances(inv.patientId).forEach((a) => {
      if (left <= 0) return;
      const take = r2(Math.min(a.amount, left));
      if (take < a.amount) {
        PP.db.advances.push({ id: PP.nextId('ADV'), patientId: a.patientId, amount: r2(a.amount - take), date: a.date, method: a.method, appliedInvoiceId: null, note: `Remainder of ${a.id}`, branchId: a.branchId, remainderOf: a.id });
        a.originalAmount = a.amount; a.amount = take;
      }
      a.appliedInvoiceId = inv.id; a.appliedAt = PP.today();
      PP.bill.recordPayment({ invoiceId: inv.id, amount: take, method: 'Advance', date: PP.today(), status: 'Completed', note: `Advance ${a.id} applied` });
      left = r2(left - take); applied = r2(applied + take);
    });
    if (applied) PP.audit('Advance applied', inv.id, `${money(applied)} from advance deposit`);
    return applied;
  }

  /* ---------------------------------------------------------------- printing */
  function printSheet(html) {
    let host = document.getElementById('fin-print');
    if (!host) { host = document.createElement('div'); host.id = 'fin-print'; document.body.appendChild(host); }
    host.innerHTML = html;
    document.body.classList.add('fin-printing');
    const done = () => { document.body.classList.remove('fin-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 300); }, 50);
  }
  function sheetHead(title, sub) {
    const s = PP.db.settings;
    const logo = s.logoImage ? `<img src="${esc(s.logoImage)}" alt="">` : esc(s.logoText || PP.initials(s.clinicName));
    return `<header class="fin-sheet-head">
      <div class="fin-sheet-brand"><div class="fin-sheet-logo" style="background:${esc(s.primary || '#083E44')}">${logo}</div>
        <div><div class="fin-sheet-clinic">${esc(s.clinicName)}</div><div class="fin-sheet-meta">${esc(s.address || '')}<br>${esc(s.phone || '')} · ${esc(s.email || '')}</div></div></div>
      <div class="fin-sheet-title"><h2>${esc(title)}</h2>${sub ? `<div class="fin-sheet-meta">${sub}</div>` : ''}</div>
    </header>`;
  }
  const sheetTable = (headers, rows, foot) => `<table class="fin-sheet-table"><thead><tr>${headers.map((h) => `<th class="${h.right ? 'right' : ''}">${esc(h.label || h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${headers[i] && headers[i].right ? 'right' : ''}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No entries.</td></tr>`}</tbody>
    ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${headers[i] && headers[i].right ? 'right' : ''}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
  const sheetFoot = (text) => `<footer class="fin-sheet-foot">${text ? `<div>${esc(text)}</div>` : ''}<div class="fin-sheet-meta">Printed ${esc(PP.fmt.stamp(PP.nowStamp()))} by ${esc(user().name || '—')} · Prototype with fictional data</div></footer>`;

  /* ---------------------------------------------------------- period toolbar */
  function quickRange(key) {
    const t = PP.today(); const m = PP.monthKey(t);
    if (key === 'last') { const lk = addMonths(m, -1); return [`${lk}-01`, monthEnd(lk)]; }
    if (key === '30') return [PP.addDays(t, -29), t];
    if (key === '90') return [PP.addDays(t, -89), t];
    return [PP.monthStart(t), t];
  }
  function periodBar(st, opts) {
    const o = opts || {};
    return `<div class="card fin-toolbar no-print"><div class="fin-toolbar-row">
      ${PP.ui.segmented('quick', [['month', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['90', 'Last 90 days']], st.quick)}
      <label class="fin-inline"><span>From</span><input type="date" class="input" data-from value="${esc(st.from)}" max="${PP.today()}"></label>
      <label class="fin-inline"><span>To</span><input type="date" class="input" data-to value="${esc(st.to)}" max="${PP.today()}"></label>
      ${o.branch === false ? '' : `<label class="fin-inline"><span>Branch</span><select class="select" data-branch-local>${[['ALL', 'All branches'], ...userBranches().map((b) => [b.id, b.name])].map(([v, l]) => `<option value="${v}" ${st.branch === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`}
      <div class="fin-toolbar-spacer"></div>${o.tools || ''}
    </div></div>`;
  }
  function bindPeriod(root, st, redraw) {
    PP.ui.bindSegmented(root, 'quick', (v) => { st.quick = v; [st.from, st.to] = quickRange(v); redraw(); });
    const f = $('[data-from]', root); const t = $('[data-to]', root); const b = $('[data-branch-local]', root);
    const onDate = () => {
      if (!f.value || !t.value) return;
      if (f.value > t.value) { PP.ui.toast('The start date must be on or before the end date.', 'error'); f.value = st.from; t.value = st.to; return; }
      st.from = f.value; st.to = t.value; st.quick = 'custom'; redraw();
    };
    if (f) f.addEventListener('change', onDate);
    if (t) t.addEventListener('change', onDate);
    if (b) b.addEventListener('change', () => { st.branch = b.value; redraw(); });
  }

  /* ================================================== pure calculations (testable) */
  const sign = (p) => (p.type === 'refund' ? -p.amount : p.amount);
  const calc = (PP.finCalc = {
    /** Completed payments and refunds in [from, to] for a branch ('ALL' = every branch). */
    collectedPayments(from, to, branch) {
      return PP.db.payments.filter((p) => p.status === 'Completed' && p.date >= from && p.date <= to && matchBranch(p, branch));
    },
    collections(from, to, branch) {
      const pays = calc.collectedPayments(from, to, branch);
      const total = r2(PP.sum(pays, sign));
      const cash = r2(PP.sum(pays.filter((p) => p.method === 'Cash'), sign));
      const advance = r2(PP.sum(pays.filter((p) => p.method === 'Advance'), sign));
      const online = r2(total - cash - advance);
      const refunds = r2(PP.sum(pays.filter((p) => p.type === 'refund'), (p) => p.amount));
      const invs = PP.db.invoices.filter((i) => i.status !== 'Void' && i.date >= from && i.date <= to && matchBranch(i, branch));
      const outstanding = r2(PP.sum(invs, (i) => PP.bill.totals(i).due));
      const withDues = invs.filter((i) => PP.bill.totals(i).due > 0).length;
      return { total, cash, online, advance, refunds, outstanding, withDues, invoiceCount: invs.length, paymentCount: pays.filter((p) => p.type === 'payment').length };
    },
    daily(from, to, branch) {
      const pays = calc.collectedPayments(from, to, branch);
      return daysBetween(from, to).map((d) => {
        const day = pays.filter((p) => p.date === d);
        const cash = r2(PP.sum(day.filter((p) => p.method === 'Cash'), sign));
        const total = r2(PP.sum(day, sign));
        const advance = r2(PP.sum(day.filter((p) => p.method === 'Advance'), sign));
        return { date: d, cash, online: r2(total - cash - advance), advance, total, count: day.filter((p) => p.type === 'payment').length };
      });
    },
    monthly(endKey, months, branch) {
      return monthsBetween(addMonths(endKey, -(months - 1)), endKey).map((k) => {
        const c = calc.collections(`${k}-01`, monthEnd(k), branch);
        return { key: k, label: PP.fmt.month(k), total: c.total, cash: c.cash, online: c.online, advance: c.advance, refunds: c.refunds, outstanding: c.outstanding };
      });
    },
    /** Allocates each collected amount to invoice lines in proportion to the line totals. */
    byService(from, to, branch) {
      const map = {};
      calc.collectedPayments(from, to, branch).forEach((p) => {
        const inv = PP.find.invoice(p.invoiceId); if (!inv) return;
        const gross = PP.sum(inv.lines, PP.bill.lineTotal) || 1;
        inv.lines.forEach((l) => {
          const key = l.serviceId || `x:${l.description}`;
          const name = l.serviceId ? PP.serviceName(l.serviceId) : l.description || 'Other';
          const m = (map[key] = map[key] || { key, name, amount: 0, payments: 0, refunds: 0 });
          const part = (p.amount * PP.bill.lineTotal(l)) / gross;
          if (p.type === 'refund') { m.amount -= part; m.refunds += part; } else { m.amount += part; m.payments += 1; }
        });
      });
      return Object.values(map).map((m) => ({ ...m, amount: r2(m.amount), refunds: r2(m.refunds) })).sort((a, b) => b.amount - a.amount);
    },
    byMethod(from, to, branch) {
      const map = {};
      [...PP.PAYMENT_METHODS, 'Advance'].forEach((m) => { map[m] = { method: m, received: 0, refunds: 0, net: 0, count: 0 }; });
      calc.collectedPayments(from, to, branch).forEach((p) => {
        const m = (map[p.method] = map[p.method] || { method: p.method, received: 0, refunds: 0, net: 0, count: 0 });
        if (p.type === 'refund') m.refunds += p.amount; else { m.received += p.amount; m.count += 1; }
      });
      return Object.values(map).map((m) => ({ ...m, received: r2(m.received), refunds: r2(m.refunds), net: r2(m.received - m.refunds) }));
    },
    /** Cash-based finance summary (D-023): income entries − paid expenses. */
    finance(from, to, branch) {
      const inc = PP.db.incomes.filter((x) => x.date >= from && x.date <= to && matchBranch(x, branch));
      const exp = PP.db.expenses.filter((x) => x.date >= from && x.date <= to && matchBranch(x, branch));
      const paid = exp.filter((x) => x.paymentStatus !== 'Unpaid');
      const income = r2(PP.sum(inc, (x) => x.amount));
      const expenses = r2(PP.sum(paid, (x) => x.amount));
      const unpaid = r2(PP.sum(exp.filter((x) => x.paymentStatus === 'Unpaid'), (x) => x.amount));
      const group = (arr) => { const m = {}; arr.forEach((x) => { m[x.categoryId] = r2((m[x.categoryId] || 0) + x.amount); }); return Object.entries(m).map(([id, amount]) => ({ id, name: catName(id), amount })).sort((a, b) => b.amount - a.amount); };
      return { income, expenses, unpaid, net: r2(income - expenses), incomeByCat: group(inc), expenseByCat: group(paid), incomeCount: inc.length, expenseCount: exp.length };
    },
    monthlyFinance(fromKey, toKey, branch) {
      return monthsBetween(fromKey, toKey).map((k) => { const f = calc.finance(`${k}-01`, monthEnd(k), branch); return { key: k, label: PP.fmt.month(k), income: f.income, expenses: f.expenses, unpaid: f.unpaid, net: f.net }; });
    },
    branchSummary(from, to, branchIds) {
      return branchIds.map((id) => { const f = calc.finance(from, to, id); return { branchId: id, name: PP.branchName(id), income: f.income, expenses: f.expenses, unpaid: f.unpaid, net: f.net }; });
    },
    appointments(from, to, branch) {
      const list = PP.db.appointments.filter((a) => a.date >= from && a.date <= to && matchBranch(a, branch));
      const bucket = (s) => (s === 'Completed' ? 'completed' : s === 'Cancelled' ? 'cancelled' : s === 'No-show' ? 'noShow' : s === 'Rescheduled' ? 'rescheduled' : 'upcoming');
      const byStatus = {}; list.forEach((a) => { byStatus[a.status] = (byStatus[a.status] || 0) + 1; });
      const pros = {};
      list.forEach((a) => {
        const p = (pros[a.professionalId] = pros[a.professionalId] || { proId: a.professionalId, name: PP.proName(a.professionalId), total: 0, completed: 0, cancelled: 0, noShow: 0, rescheduled: 0, upcoming: 0 });
        p.total += 1; p[bucket(a.status)] += 1;
      });
      const rate = (n, c) => (n + c ? r2((n / (n + c)) * 100) : 0);
      const byPro = Object.values(pros).map((p) => ({ ...p, noShowRate: rate(p.noShow, p.completed) })).sort((a, b) => b.total - a.total);
      const t = { total: list.length, completed: PP.sum(byPro, (p) => p.completed), cancelled: PP.sum(byPro, (p) => p.cancelled), noShow: PP.sum(byPro, (p) => p.noShow), upcoming: PP.sum(byPro, (p) => p.upcoming) };
      return { byStatus, byPro, totals: { ...t, noShowRate: rate(t.noShow, t.completed) } };
    },
    /** Cash position of one branch on one day. Opening = counted cash of the previous closing (editable). */
    cashDay(branchId, date) {
      const prev = (PP.db.cashClosings || []).filter((c) => c.branchId === branchId && c.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
      const ins = PP.db.incomes.filter((x) => x.branchId === branchId && x.date === date && x.method === 'Cash');
      const outs = PP.db.expenses.filter((x) => x.branchId === branchId && (x.paidDate || x.date) === date && x.method === 'Cash' && x.paymentStatus === 'Paid');
      const opening = prev ? r2(prev.counted) : 0;
      const cashIn = r2(PP.sum(ins, (x) => x.amount)); const cashOut = r2(PP.sum(outs, (x) => x.amount));
      return { opening, openingFrom: prev ? prev.date : null, ins, outs, cashIn, cashOut, expected: r2(opening + cashIn - cashOut) };
    },
    /** Unsettled entries of a professional up to a date (earlier unsettled entries, including negatives, are carried in — D-026 rule 6). */
    settlementPreview(proId, from, to) {
      const entries = PP.db.commissionEntries.filter((e) => e.professionalId === proId && !e.settlementId && e.date <= to);
      return { entries, total: r2(PP.sum(entries, (e) => e.value)), carried: entries.filter((e) => e.date < from).length };
    },
    commissionSummary(proId) {
      const all = PP.db.commissionEntries.filter((e) => e.professionalId === proId);
      const sets = PP.db.settlements.filter((s) => s.professionalId === proId);
      const open = sets.filter((s) => s.status === 'Draft' || s.status === 'Approved');
      const paid = sets.filter((s) => s.status === 'Paid out');
      const month = PP.monthKey(PP.today());
      return {
        balance: PP.commission.balance(proId), unsettledCount: all.filter((e) => !e.settlementId).length,
        inOpen: r2(PP.sum(open, (s) => s.total)), awaitingPayout: r2(PP.sum(sets.filter((s) => s.status === 'Approved'), (s) => s.total)),
        paidOut: r2(PP.sum(paid, (s) => s.total)), lastPaid: paid.map((s) => s.paidAt).sort().pop() || null,
        thisMonth: r2(PP.sum(all.filter((e) => PP.monthKey(e.date) === month), (e) => e.value)),
      };
    },
  });

  /* ======================================================= SERVICES & PRICING */
  PP.route('/services', {
    title: 'Services & Pricing',
    perm: 'services.manage',
    render({ el, query }) {
      ensure();
      let tab = tabFrom(query, ['services', 'fees'], 'services');
      el.innerHTML = PP.ui.pageHead({
        title: 'Services &amp; Pricing', crumbs: [['Dashboard', '#/dashboard'], ['Services & Pricing']],
        subtitle: `Service catalogue, default prices and ${esc(PP.tl('professional'))} fees. Price changes are recorded in the audit log.`,
        actions: `<button class="btn btn-primary" data-add>${PP.icon('plus')} Add service</button>`,
      }) + '<div class="card fin-card-tabs"><div data-tabs></div><div data-body></div></div>';
      const body = $('[data-body]', el);
      const draw = () => (tab === 'services' ? drawServices() : drawFees());
      PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'services', label: 'Services', count: PP.db.services.length }, { id: 'fees', label: `${PP.t('professional')} fees` }], active: tab, onChange: (t) => { tab = t; draw(); } });
      $('[data-add]', el).addEventListener('click', () => serviceModal(null, draw));

      function drawServices() {
        const cats = [...new Set(PP.db.services.map((s) => s.category))].sort();
        PP.ui.table(body, {
          rows: PP.db.services, exportName: 'services', sortKey: 'name',
          search: { placeholder: 'Search services…', text: (s) => `${s.id} ${s.name} ${s.category}` },
          filters: [
            { id: 'cat', label: 'All categories', options: cats.map((c) => [c, c]), match: (s, v) => s.category === v },
            { id: 'status', label: 'All statuses', options: [['Active', 'Active'], ['Inactive', 'Inactive']], match: (s, v) => s.status === v },
          ],
          columns: [
            { key: 'name', label: 'Service', sort: (s) => s.name, render: (s) => `<b>${esc(s.name)}</b><span class="sub">${esc(s.id)}${s.isPackage ? ` · Package: ${esc(s.sessions)} sessions, valid ${esc(s.validityDays)} days` : ''}${s.homeVisit ? ` · Home visit${s.travelCharge ? ` + travel ${money(s.travelCharge)}` : ''}` : ''}</span>`, exportValue: (s) => s.name },
            { key: 'category', label: 'Category', sort: (s) => s.category, render: (s) => esc(s.category) },
            { key: 'duration', label: 'Duration', sort: (s) => s.duration, render: (s) => `${esc(s.duration)} min`, exportValue: (s) => s.duration },
            { key: 'price', label: 'Default price', align: 'right', sort: (s) => s.price, render: (s) => money(s.price), exportValue: (s) => s.price },
            { key: 'custom', label: 'Custom price', render: (s) => (s.customPriceAllowed ? PP.ui.badge('Allowed', 'info') : PP.ui.badge('Fixed', 'neutral')), exportValue: (s) => (s.customPriceAllowed ? 'Allowed' : 'Fixed') },
            { key: 'status', label: 'Status', sort: (s) => s.status, render: (s) => PP.ui.badge(s.status) },
            { key: 'act', label: '', render: (s) => `<button class="btn btn-ghost btn-sm" data-edit="${esc(s.id)}">${PP.icon('edit')} Edit</button>` },
          ],
          onRowClick: (s) => serviceModal(s, draw),
          afterDraw: (c) => $$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => serviceModal(PP.find.service(b.dataset.edit), draw))),
          empty: { icon: 'tag', title: 'No services yet', text: 'Add the services your clinic offers.' },
        });
      }

      function drawFees() {
        const fees = PP.db.settings.professionalFees;
        const pros = PP.db.professionals.filter((p) => p.status === 'Active');
        body.innerHTML = `<div class="card-body">
          ${PP.ui.alert('info', `A fee can depend on the ${esc(PP.tl('professional'))} and on the visit type (FR-GA-11). Leave a cell blank to use the service's default price. Fees are added on the invoice screen with <b>Add fee</b>.`)}
          <form class="mt-4" novalidate data-fees><div class="table-wrap"><table class="table fin-fee-table"><thead><tr><th scope="col">${esc(PP.t('professional'))}</th><th scope="col">Branch</th>${VISIT_TYPES.map(([, l]) => `<th scope="col" class="right">${esc(l)}</th>`).join('')}</tr></thead>
          <tbody>${pros.map((p) => `<tr><td><b>${esc(PP.proName(p))}</b><span class="sub">${esc(p.designation || '')}</span></td><td>${esc(PP.branchName(p.branchId))}</td>
            ${VISIT_TYPES.map(([k, l]) => { const v = (fees[p.id] || {})[k]; return `<td class="right"><div class="field fin-fee-cell"><input class="input fin-num" type="number" min="0" step="50" name="fee__${esc(p.id)}__${k}" data-rule="nonneg" value="${v == null ? '' : esc(v)}" placeholder="Default" aria-label="${esc(PP.proName(p))} · ${esc(l)}"><div class="error"></div></div></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-reset>Discard changes</button><button type="submit" class="btn btn-primary">${PP.icon('check')} Save fees</button></div></form></div>`;
        const form = $('[data-fees]', body);
        $('[data-reset]', body).addEventListener('click', drawFees);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!PP.form.validate(form)) return;
          const btn = $('button[type=submit]', form);
          PP.ui.busy(btn, () => {
            const data = PP.form.read(form); const next = {}; let changes = 0;
            Object.entries(data).forEach(([k, v]) => {
              const [, pid, type] = k.split('__');
              const old = (fees[pid] || {})[type];
              const val = v === '' ? null : r2(v);
              if ((old == null ? null : Number(old)) !== val) changes += 1;
              if (val != null) { next[pid] = next[pid] || {}; next[pid][type] = val; }
            });
            PP.db.settings.professionalFees = next;
            PP.audit('Professional fees changed', 'settings.professionalFees', `${changes} fee value(s) changed`);
            PP.save(); PP.ui.toast(changes ? `${PP.t('professional')} fees saved (${changes} change${changes > 1 ? 's' : ''})` : 'No changes to save', changes ? 'positive' : 'info');
            drawFees();
          });
        });
      }
      draw();
    },
  });

  function serviceModal(svc, onSaved) {
    const s = svc || { name: '', category: '', duration: 30, price: '', customPriceAllowed: true, homeVisit: false, travelCharge: '', isPackage: false, sessions: '', validityDays: '', status: 'Active' };
    const cats = [...new Set(PP.db.services.map((x) => x.category))].sort();
    const body = `<form class="form-grid" novalidate>
      ${PP.form.field({ name: 'name', label: 'Service name', required: true, value: s.name, full: true })}
      <div class="field" data-field="category"><label for="svc-cat">Category<span class="req" aria-hidden="true">*</span></label><input class="input" id="svc-cat" name="category" list="svc-cats" required value="${esc(s.category)}" placeholder="Choose or type a new category"><datalist id="svc-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist><div class="error">This field is required.</div></div>
      ${PP.form.field({ name: 'duration', label: 'Duration (minutes)', type: 'number', required: true, rule: 'positive', min: 5, step: 5, value: s.duration })}
      ${PP.form.field({ name: 'price', label: 'Default price (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 50, value: s.price, hint: svc ? `Current price ${money(svc.price)}. Existing invoices keep their own price.` : '' })}
      ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, options: ['Active', 'Inactive'], value: s.status })}
      <div class="field full hidden" data-field="priceReason"><label for="svc-reason">Reason for the price change</label><input class="input" id="svc-reason" name="priceReason" placeholder="e.g. Annual price review"><div class="hint">Recorded in the audit log.</div><div class="error"></div></div>
      ${PP.form.field({ name: 'customPriceAllowed', type: 'checkbox', label: 'Custom price allowed on invoices', value: s.customPriceAllowed, full: true, hint: 'When allowed, staff can change the unit price on an invoice line and must give a reason.' })}
      ${PP.form.field({ name: 'homeVisit', type: 'checkbox', label: 'Home visit service', value: s.homeVisit })}
      <div class="field" data-field="travelCharge" data-show="homeVisit"><label for="svc-travel">Travel charge (BDT)</label><input class="input" id="svc-travel" name="travelCharge" type="number" min="0" step="50" data-rule="nonneg" value="${esc(s.travelCharge == null ? '' : s.travelCharge)}"><div class="hint">Added as a separate invoice line.</div><div class="error"></div></div>
      ${PP.form.field({ name: 'isPackage', type: 'checkbox', label: 'Package (several sessions sold together)', value: s.isPackage, full: true })}
      <div class="field" data-field="sessions" data-show="isPackage"><label for="svc-sessions">Sessions in package<span class="req" aria-hidden="true">*</span></label><input class="input" id="svc-sessions" name="sessions" type="number" min="1" step="1" data-rule="positive" value="${esc(s.sessions == null ? '' : s.sessions)}"><div class="error"></div></div>
      <div class="field" data-field="validityDays" data-show="isPackage"><label for="svc-valid">Validity (days)<span class="req" aria-hidden="true">*</span></label><input class="input" id="svc-valid" name="validityDays" type="number" min="1" step="1" data-rule="positive" value="${esc(s.validityDays == null ? '' : s.validityDays)}"><div class="error"></div></div>
    </form>`;
    PP.ui.modal({
      title: svc ? `Edit service · ${esc(svc.id)}` : 'Add service', size: 'lg', body,
      onOpen: (b) => {
        const form = $('form', b);
        const sync = () => {
          $$('[data-show]', form).forEach((f) => {
            const on = $(`[name="${f.dataset.show}"]`, form).checked;
            f.classList.toggle('hidden', !on);
            const inp = $('input', f); inp.disabled = !on; inp.required = on && f.dataset.show === 'isPackage';
          });
          const pr = $('[data-field="priceReason"]', form);
          pr.classList.toggle('hidden', !(svc && $('[name=price]', form).value !== '' && Number($('[name=price]', form).value) !== Number(svc.price)));
        };
        form.addEventListener('change', sync); form.addEventListener('input', sync); sync();
      },
      buttons: [
        { label: 'Cancel', kind: 'ghost' },
        { label: svc ? 'Save changes' : 'Add service', kind: 'primary', onClick: async ({ body: b }) => {
          const form = $('form', b);
          if (!PP.form.validate(form)) return false;
          const d = PP.form.read(form);
          const dup = PP.db.services.find((x) => x.name.trim().toLowerCase() === d.name.toLowerCase() && (!svc || x.id !== svc.id));
          if (dup) { PP.form.setError(form, 'name', `A service with this name already exists (${dup.id}).`); return false; }
          await PP.sleep(300);
          const rec = svc || { id: `SRV-${pad2(Math.max(0, ...PP.db.services.map((x) => Number(String(x.id).split('-')[1]) || 0)) + 1)}` };
          const oldPrice = svc ? svc.price : null;
          Object.assign(rec, {
            name: d.name, category: d.category, duration: Number(d.duration), price: r2(d.price), customPriceAllowed: !!d.customPriceAllowed, status: d.status,
            homeVisit: !!d.homeVisit, travelCharge: d.homeVisit && d.travelCharge !== '' ? r2(d.travelCharge) : null,
            isPackage: !!d.isPackage, sessions: d.isPackage ? Number(d.sessions) : null, validityDays: d.isPackage ? Number(d.validityDays) : null,
          });
          if (!svc) { PP.db.services.push(rec); PP.audit('Service created', rec.id, `${rec.name} · ${money(rec.price)}`); }
          else {
            PP.audit('Service updated', rec.id, rec.name);
            if (Number(oldPrice) !== rec.price) PP.audit('Price changed', rec.id, `${rec.name} ${PP.fmt.num(oldPrice)} → ${PP.fmt.num(rec.price)}${d.priceReason ? ` · ${d.priceReason}` : ''}`);
          }
          PP.save(); PP.ui.toast(svc ? `${esc(rec.name)} updated` : `${esc(rec.name)} added`);
          if (onSaved) onSaved();
        } },
      ],
    });
  }

  /* =============================================================== INVOICES */
  PP.route('/billing/invoices', {
    title: 'Invoices & Dues',
    perm: 'billing.view',
    render({ el, query }) {
      ensure();
      const rows = PP.db.invoices.filter(PP.inBranch).map((inv) => {
        const t = PP.bill.totals(inv);
        const pays = PP.db.payments.filter((p) => p.invoiceId === inv.id && p.type === 'payment');
        return { inv, t, id: inv.id, date: inv.date, methods: [...new Set(pays.filter((p) => p.status !== 'Failed').map((p) => p.method))], pending: pays.filter((p) => p.status === 'Pending').length };
      });
      const live = rows.filter((r) => r.t.status !== 'Void');
      const k = { payable: PP.sum(live, (r) => r.t.payable), collected: PP.sum(live, (r) => r.t.net), due: PP.sum(live, (r) => r.t.due), withDue: live.filter((r) => r.t.due > 0).length };
      const pending = rows.filter((r) => r.pending);
      el.innerHTML = PP.ui.pageHead({
        title: 'Invoices &amp; Outstanding Dues', crumbs: [['Dashboard', '#/dashboard'], ['Cash Flow'], ['Invoices & Dues']],
        subtitle: `${esc(branchLabel(PP.activeBranchId()))} · dues = payable − net posted payments`,
        actions: PP.can('billing.manage') ? `<a class="btn btn-primary" href="#/billing/new">${PP.icon('plus')} New invoice</a>` : '',
      }) + `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Total payable', value: money(k.payable), hint: `${live.length} invoices`, tone: 'info', icon: 'receipt' })}
          ${PP.ui.kpi({ label: 'Collected', value: money(k.collected), hint: 'Completed payments − refunds', tone: 'positive', icon: 'banknote' })}
          ${PP.ui.kpi({ label: 'Outstanding', value: money(k.due), hint: 'Still to collect', tone: 'error', icon: 'alert' })}
          ${PP.ui.kpi({ label: 'Invoices with dues', value: String(k.withDue), hint: k.withDue ? 'Follow up with patients' : 'All settled', tone: 'warning', icon: 'clock' })}
        </div>
        ${pending.length ? `<div class="mt-4">${PP.ui.alert('warning', `${pending.length} mobile banking payment${pending.length > 1 ? 's are' : ' is'} waiting for confirmation: ${pending.slice(0, 5).map((r) => invLink(r.id)).join(', ')}. Pending payments do not count as collected and earn no commission until completed (D-025).`)}</div>` : ''}
        <div class="card mt-4" data-table></div>`;
      PP.ui.table($('[data-table]', el), {
        rows, exportName: 'invoices', sortKey: 'date', sortDir: 'desc',
        search: { placeholder: 'Search invoice, patient, mobile…', text: (r) => { const p = PP.find.patient(r.inv.patientId) || {}; return `${r.id} ${p.name || ''} ${p.mobile || ''} ${p.id || ''} ${PP.proName(r.inv.professionalId)}`; } },
        filters: [
          { id: 'status', label: 'All statuses', value: ['Unpaid', 'Partly paid', 'Paid', 'Refunded'].includes(query.status) ? query.status : '', options: ['Unpaid', 'Partly paid', 'Paid', 'Refunded'].map((s) => [s, s]), match: (r, v) => r.t.status === v },
          { id: 'method', label: 'All methods', options: [...PP.PAYMENT_METHODS, 'Advance'].map((m) => [m, m]), match: (r, v) => r.methods.includes(v) },
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: proOptions(false), match: (r, v) => r.inv.professionalId === v },
        ],
        columns: [
          { key: 'id', label: 'Invoice', sort: (r) => r.id, render: (r) => `<a href="#/billing/${esc(r.id)}"><b>${esc(r.id)}</b></a>${r.pending ? '<span class="sub">Payment pending</span>' : ''}`, exportValue: (r) => r.id },
          { key: 'patient', label: 'Patient', sort: (r) => PP.patientName(r.inv.patientId), render: (r) => { const p = PP.find.patient(r.inv.patientId) || {}; return `${esc(p.name || '—')}<span class="sub">${esc(p.id || '')} · ${esc(p.mobile || '')}</span>`; }, exportValue: (r) => PP.patientName(r.inv.patientId) },
          { key: 'pro', label: PP.t('professional'), sort: (r) => PP.proName(r.inv.professionalId), render: (r) => esc(PP.proName(r.inv.professionalId)) },
          { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => `<span class="nowrap">${PP.fmt.date(r.date)}</span>`, exportValue: (r) => r.date },
          { key: 'payable', label: 'Payable', align: 'right', sort: (r) => r.t.payable, render: (r) => money(r.t.payable), exportValue: (r) => r.t.payable },
          { key: 'collected', label: 'Collected', align: 'right', sort: (r) => r.t.net, render: (r) => money(r.t.net), exportValue: (r) => r.t.net },
          { key: 'due', label: 'Due', align: 'right', sort: (r) => r.t.due, render: (r) => `<span class="${r.t.due > 0 ? 'fin-due' : ''}">${money(r.t.due)}</span>`, exportValue: (r) => r.t.due },
          { key: 'status', label: 'Status', sort: (r) => r.t.status, render: (r) => PP.ui.badge(r.t.status) },
        ],
        footer: (list) => `<tr><td colspan="4">Total (${list.length} invoices)</td><td class="right mono">${money(PP.sum(list, (r) => r.t.payable))}</td><td class="right mono">${money(PP.sum(list, (r) => r.t.net))}</td><td class="right mono">${money(PP.sum(list, (r) => r.t.due))}</td><td></td></tr>`,
        onRowClick: (r) => PP.go(`#/billing/${r.id}`),
        empty: { icon: 'receipt', title: 'No invoices yet', text: 'Invoices you create appear here with their payable, collected and due amounts.', action: PP.can('billing.manage') ? '<a class="btn btn-primary" href="#/billing/new">Create an invoice</a>' : '' },
      });
    },
  });

  /* ------------------------------------------------------------ NEW INVOICE */
  PP.route('/billing/new', {
    title: 'New Invoice',
    perm: 'billing.manage',
    render({ el, query }) {
      ensure();
      const st = { patientId: null, professionalId: '', appointmentId: '', lines: [], discount: 0, applyAdvance: false };
      const today = PP.today();
      const canCom = PP.can('commissions.manage');
      const pFees = PP.db.settings.professionalFees || {};
      const apt0 = query.appointment ? PP.find.appointment(query.appointment) : null;
      const lab0 = query.lab && PP.db.labOrders ? PP.db.labOrders.find((o) => o.id === query.lab) : null;
      const pat0 = PP.find.patient((apt0 && apt0.patientId) || (lab0 && lab0.patientId) || query.patient || '');
      const patLabel = (p) => `${p.id} · ${p.name} · ${p.mobile}`;
      const activeServices = () => PP.db.services.filter((s) => s.status === 'Active');
      const svcOptions = (sel) => `<option value="">Choose a service…</option>${PP.db.services.filter((s) => s.status === 'Active' || s.id === sel).map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)} · ${money(s.price)}</option>`).join('')}`;
      const newServiceLine = (svc) => ({ kind: 'service', serviceId: svc ? svc.id : '', description: svc ? svc.name : '', qty: 1, unitPrice: svc ? svc.price : 0, defaultPrice: svc ? svc.price : 0, overrideReason: '' });
      const travelLine = (svc) => ({ kind: 'travel', serviceId: null, description: `Travel charge (${svc.name})`, qty: 1, unitPrice: svc.travelCharge, defaultPrice: svc.travelCharge, overrideReason: '', forService: svc.id });

      el.innerHTML = PP.ui.pageHead({
        title: 'Invoice &amp; Payment Entry', crumbs: [['Dashboard', '#/dashboard'], ['Invoices & Dues', '#/billing/invoices'], ['New invoice']],
        subtitle: `Invoice date ${PP.fmt.date(today)} · one ${esc(PP.tl('professional'))} per invoice (D-026) · creating an invoice never creates commission (D-025)`,
      }) + `<form class="fin-entry" novalidate data-form>
        <div class="stack fin-entry-main">
          <section class="card"><div class="card-head"><h2>Patient and ${esc(PP.tl('professional'))}</h2></div><div class="card-body">
            <div class="form-grid">
              <div class="field" data-field="patient"><label for="inv-pat">Patient<span class="req" aria-hidden="true">*</span></label>
                <div class="input-icon">${PP.icon('search')}<input class="input" id="inv-pat" name="patient" list="inv-pat-list" autocomplete="off" placeholder="Search by name, ID or mobile" value="${pat0 ? esc(patLabel(pat0)) : ''}"></div>
                <datalist id="inv-pat-list">${PP.db.patients.filter((p) => !p.mergedInto).map((p) => `<option value="${esc(patLabel(p))}">`).join('')}</datalist>
                <div class="error">Choose a patient from the list.</div><div data-pat-info></div></div>
              <div class="field" data-field="professionalId"><label for="inv-pro">${esc(PP.t('professional'))}<span class="req" aria-hidden="true">*</span></label>
                <select class="select" id="inv-pro" name="professionalId"><option value="">Choose…</option>${PP.db.professionals.filter((p) => p.status === 'Active').map((p) => `<option value="${esc(p.id)}">${esc(PP.proName(p))} · ${esc(p.designation || '')}</option>`).join('')}</select>
                <div class="hint">Commission from this invoice goes to this ${esc(PP.tl('professional'))} only.</div><div class="error">This field is required.</div></div>
              <div class="field" data-field="appointmentId"><label for="inv-apt">Linked appointment</label><select class="select" id="inv-apt" name="appointmentId"></select><div class="hint" data-apt-hint>Optional</div><div class="error"></div></div>
              <div class="field"><label>Branch</label><input class="input" readonly data-branch-view value="—" aria-label="Branch"></div>
            </div></div></section>

          <section class="card"><div class="card-head"><h2>Service lines</h2><div class="row fin-fee-add">
              <select class="select" data-fee-type aria-label="Visit type for fee">${VISIT_TYPES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
              <button type="button" class="btn btn-sm" data-add-fee>${PP.icon('plus')} Add fee</button>
              <button type="button" class="btn btn-sm btn-primary" data-add-line>${PP.icon('plus')} Add service</button></div></div>
            <div class="card-body flush"><div class="table-wrap"><table class="table fin-lines"><thead><tr><th scope="col">Service</th><th scope="col">Description</th><th scope="col" class="right">Qty</th><th scope="col" class="right">Unit price</th><th scope="col" class="right">Line total</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody data-lines></tbody></table></div>
              <div class="fin-lines-note small muted" data-lines-note></div></div></section>

          <section class="card"><div class="card-head"><h2>Discount and notes</h2></div><div class="card-body"><div class="form-grid">
            ${PP.form.field({ name: 'discount', label: 'Discount (BDT)', type: 'number', min: 0, step: 50, rule: 'nonneg', value: 0 })}
            ${PP.form.field({ name: 'discountReason', label: 'Discount reason', placeholder: 'e.g. Senior citizen' })}
            ${canCom ? PP.form.field({ name: 'manualPct', label: 'Manual commission % (optional)', type: 'number', min: 0, max: 100, step: 0.5, rule: 'nonneg', placeholder: `Clinic model: ${esc((COMMISSION_MODELS.find((m) => m[0] === PP.db.settings.commission.model) || ['', ''])[1])}`, hint: 'Overrides the clinic model for this invoice only (D-026). Applied to money as it is collected.' }) : ''}
            ${PP.form.field({ name: 'notes', label: 'Notes', type: 'textarea', rows: 2, full: !canCom })}
          </div></div></section>

          <section class="card"><div class="card-head"><h2>Payment</h2></div><div class="card-body">
            <div data-advance></div>
            <div class="form-grid">
              ${PP.form.field({ name: 'paidNow', label: 'Paid now (BDT)', type: 'number', min: 0, step: 50, rule: 'nonneg', value: 0, hint: 'Leave 0 to record a payment later.' })}
              ${PP.form.field({ name: 'method', label: 'Payment method', type: 'select', placeholder: false, options: PP.PAYMENT_METHODS, value: 'Cash' })}
              ${PP.form.field({ name: 'payStatus', label: 'Payment status', type: 'select', placeholder: false, options: ['Completed', 'Pending'], value: 'Completed', hint: 'Use Pending for a mobile banking payment that is not yet confirmed. It earns no commission until completed.' })}
            </div></div></section>
        </div>
        <aside class="card fin-entry-summary"><div class="card-head"><h2>Summary</h2></div><div class="card-body">
          <dl class="fin-totals" data-totals></dl>
          <div data-com-preview></div>
          <div class="stack mt-4"><button type="submit" class="btn btn-primary" data-save>${PP.icon('check')} Save invoice</button><a class="btn btn-ghost" href="#/billing/invoices">Cancel</a></div>
        </div></aside>
      </form>`;

      const form = $('[data-form]', el);
      const linesEl = $('[data-lines]', el);
      const f = (n) => $(`[name="${n}"]`, form);

      const proBranch = () => { const apt = st.appointmentId ? PP.find.appointment(st.appointmentId) : null; const pro = PP.find.professional(st.professionalId); const ab = PP.activeBranchId(); return (apt && apt.branchId) || (pro && pro.branchId) || (ab !== 'ALL' ? ab : PP.db.branches[0].id); };
      const tmpInv = () => ({ id: '__draft__', lines: st.lines, discount: Number(f('discount').value) || 0, professionalId: st.professionalId, manualCommissionPercent: canCom && f('manualPct').value !== '' ? Number(f('manualPct').value) : null });
      const advAvail = () => (st.patientId ? r2(PP.sum(unappliedAdvances(st.patientId), (a) => a.amount)) : 0);

      function drawPatient() {
        const info = $('[data-pat-info]', form); const p = st.patientId ? PP.find.patient(st.patientId) : null;
        if (!p) { info.innerHTML = ''; } else {
          const dues = PP.sum(PP.db.invoices.filter((i) => i.patientId === p.id), (i) => PP.bill.totals(i).due);
          info.innerHTML = `<div class="fin-pat-chip"><span class="avatar">${esc(PP.initials(p.name))}</span><div><b>${esc(p.name)}</b><div class="small muted">${esc(p.id)} · ${esc(p.mobile)} · ${esc(PP.fmt.age(p.dob))}</div>${dues > 0 ? `<div class="small fin-due">Previous dues ${money(dues)}</div>` : ''}${advAvail() > 0 ? `<div class="small fin-pos">Advance available ${money(advAvail())}</div>` : ''}</div></div>`;
        }
        const invoiced = new Set(PP.db.invoices.map((i) => i.appointmentId).filter(Boolean));
        const apts = p ? PP.db.appointments.filter((a) => a.patientId === p.id && !invoiced.has(a.id) && !['Cancelled', 'No-show', 'Rescheduled'].includes(a.status)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)).slice(0, 12) : [];
        if (st.appointmentId && !apts.find((a) => a.id === st.appointmentId)) st.appointmentId = '';
        f('appointmentId').innerHTML = `<option value="">No linked appointment</option>${apts.map((a) => `<option value="${esc(a.id)}" ${a.id === st.appointmentId ? 'selected' : ''}>${esc(a.id)} · ${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)} · ${esc(PP.serviceName(a.serviceId))} · ${esc(a.status)}</option>`).join('')}`;
        $('[data-apt-hint]', form).textContent = p ? (apts.length ? `${apts.length} appointment(s) not yet invoiced` : 'No open appointments for this patient') : 'Choose a patient first';
        drawAdvance(); drawBranch();
      }
      function drawBranch() { $('[data-branch-view]', form).value = PP.branchName(proBranch()); }
      function drawAdvance() {
        const box = $('[data-advance]', form); const avail = advAvail();
        if (!avail) { st.applyAdvance = false; box.innerHTML = ''; return; }
        box.innerHTML = `<div class="fin-advance"><label class="check"><input type="checkbox" data-apply-adv ${st.applyAdvance ? 'checked' : ''}> Apply advance deposit · <b>${money(avail)}</b> available</label>
          <div class="small muted">${unappliedAdvances(st.patientId).map((a) => `${esc(a.id)} · ${PP.fmt.date(a.date)} · ${money(a.amount)}${a.note ? ` · ${esc(a.note)}` : ''}`).join('<br>')}</div>
          <div class="small muted">Applying it records a payment with method “Advance”. Commission is earned at that moment, not when the deposit was taken (D-026).</div></div>`;
        $('[data-apply-adv]', box).addEventListener('change', (e) => { st.applyAdvance = e.target.checked; recalc(); });
      }

      function lineRow(l, i) {
        const svc = l.serviceId ? PP.find.service(l.serviceId) : null;
        const editable = l.kind === 'service' && svc && svc.customPriceAllowed;
        const overridden = l.kind === 'service' && svc && Number(l.unitPrice) !== Number(l.defaultPrice);
        return `<tr data-line="${i}">
          <td data-th="Service">${l.kind === 'service' ? `<div class="field" data-field="svc-${i}"><select class="select" data-l="serviceId" aria-label="Service">${svcOptions(l.serviceId)}</select><div class="error">Choose a service.</div></div>` : `<span class="badge ${l.kind === 'fee' ? 'lavender' : l.kind === 'lab' ? 'warning' : 'info'}">${l.kind === 'fee' ? 'Fee' : l.kind === 'lab' ? 'Lab test' : 'Travel'}</span>`}</td>
          <td data-th="Description"><input class="input" data-l="description" value="${esc(l.description)}" aria-label="Description"></td>
          <td data-th="Qty" class="right"><div class="field" data-field="qty-${i}"><input class="input fin-num fin-qty" type="number" min="1" step="1" data-l="qty" value="${esc(l.qty)}" aria-label="Quantity"><div class="error"></div></div></td>
          <td data-th="Unit price" class="right"><div class="field" data-field="price-${i}"><input class="input fin-num" type="number" min="0" step="50" data-l="unitPrice" value="${esc(l.unitPrice)}" ${editable ? '' : 'readonly'} aria-label="Unit price" title="${editable ? 'Custom price allowed' : 'Fixed price'}">${l.kind === 'service' && svc && !svc.customPriceAllowed ? '<div class="hint">Fixed price</div>' : ''}<div class="error"></div></div></td>
          <td data-th="Line total" class="right mono" data-total>${money(PP.bill.lineTotal(l))}</td>
          <td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove aria-label="Remove line">${PP.icon('trash')}</button></td></tr>
          <tr class="fin-override-row ${overridden ? '' : 'hidden'}" data-override="${i}"><td colspan="6"><div class="field" data-field="reason-${i}"><label>Reason for the different price (default ${money(l.defaultPrice)})<span class="req" aria-hidden="true">*</span></label><input class="input" data-l="overrideReason" value="${esc(l.overrideReason || '')}" placeholder="e.g. Extended session (60 minutes)"><div class="error">A price different from the default needs a reason.</div></div></td></tr>`;
      }
      function drawLines() {
        linesEl.innerHTML = st.lines.length ? st.lines.map(lineRow).join('') : `<tr><td colspan="6">${PP.ui.empty({ icon: 'tag', title: 'No service lines yet', text: 'Add a service, or link an appointment to add its service.' })}</td></tr>`;
        const fees = pFees[st.professionalId] || {};
        $('[data-add-fee]', el).disabled = !st.professionalId || fees[$('[data-fee-type]', el).value] == null;
        $('[data-lines-note]', el).innerHTML = st.professionalId && Object.keys(fees).length ? `${esc(PP.t('professional'))} fees set for ${esc(PP.proName(st.professionalId))}: ${VISIT_TYPES.filter(([k]) => fees[k] != null).map(([k, l]) => `${esc(l)} ${money(fees[k])}`).join(' · ')}` : `Unit prices are editable only for services that allow a custom price. ${esc(PP.t('professional'))} fees are set in <a href="#/services?tab=fees">Services &amp; Pricing</a>.`;
        recalc();
      }
      linesEl.addEventListener('input', (e) => {
        const tr = e.target.closest('[data-line],[data-override]'); if (!tr) return;
        const i = Number(tr.dataset.line != null ? tr.dataset.line : tr.dataset.override); const l = st.lines[i]; const key = e.target.dataset.l;
        if (!l || !key || key === 'serviceId') return;
        l[key] = key === 'qty' || key === 'unitPrice' ? e.target.value : e.target.value;
        if (key === 'qty' || key === 'unitPrice') {
          $(`[data-line="${i}"] [data-total]`, linesEl).textContent = money(PP.bill.lineTotal(l));
          const svc = l.serviceId ? PP.find.service(l.serviceId) : null;
          $(`[data-override="${i}"]`, linesEl).classList.toggle('hidden', !(l.kind === 'service' && svc && Number(l.unitPrice) !== Number(l.defaultPrice)));
        }
        recalc();
      });
      linesEl.addEventListener('change', (e) => {
        if (e.target.dataset.l !== 'serviceId') return;
        const i = Number(e.target.closest('[data-line]').dataset.line); const svc = PP.find.service(e.target.value);
        const prev = st.lines[i];
        st.lines = st.lines.filter((x) => !(x.kind === 'travel' && x.forService === prev.serviceId));
        const idx = st.lines.indexOf(prev);
        st.lines[idx] = newServiceLine(svc);
        if (svc && svc.homeVisit && svc.travelCharge) st.lines.splice(idx + 1, 0, travelLine(svc));
        drawLines();
      });
      linesEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]'); if (!b) return;
        const l = st.lines[Number(b.closest('[data-line]').dataset.line)];
        st.lines = st.lines.filter((x) => x !== l && !(l.kind === 'service' && x.kind === 'travel' && x.forService === l.serviceId));
        drawLines();
      });
      $('[data-add-line]', el).addEventListener('click', () => { st.lines.push(newServiceLine(null)); drawLines(); const sel = $$('[data-l="serviceId"]', linesEl).pop(); if (sel) sel.focus(); });
      $('[data-fee-type]', el).addEventListener('change', drawLines);
      $('[data-add-fee]', el).addEventListener('click', () => {
        const type = $('[data-fee-type]', el).value; const fee = (pFees[st.professionalId] || {})[type]; if (fee == null) return;
        st.lines.push({ kind: 'fee', serviceId: null, description: `${PP.t('professional')} fee – ${visitTypeLabel(type)}`, qty: 1, unitPrice: fee, defaultPrice: fee, overrideReason: '', feeType: type });
        drawLines();
      });

      function recalc() {
        const t = PP.bill.totals(tmpInv());
        const paidNow = r2(f('paidNow').value);
        const adv = st.applyAdvance ? r2(Math.min(advAvail(), t.payable)) : 0;
        const out = r2(Math.max(0, t.payable - adv - paidNow));
        $('[data-totals]', el).innerHTML = `<dt>Gross</dt><dd>${money(t.gross)}</dd><dt>Discount</dt><dd>${t.discount ? '−' + money(t.discount) : money(0)}</dd>
          <dt class="fin-strong">Payable</dt><dd class="fin-strong">${money(t.payable)}</dd>${adv ? `<dt>Advance applied</dt><dd>${money(adv)}</dd>` : ''}<dt>Paid now</dt><dd>${money(paidNow)}${paidNow && f('payStatus').value === 'Pending' ? ' <span class="badge warning">Pending</span>' : ''}</dd>
          <dt class="fin-strong">Outstanding</dt><dd class="fin-strong ${out > 0 ? 'fin-due' : 'fin-pos'}">${money(out)}</dd>`;
        const prev = $('[data-com-preview]', el);
        if (canCom && st.professionalId && t.payable > 0) {
          const collectedNow = adv + (f('payStatus').value === 'Completed' ? paidNow : 0);
          const c = collectedNow > 0 ? PP.commission.calc(tmpInv(), Math.min(collectedNow, t.payable), PP.today()) : { value: 0, basis: '' };
          prev.innerHTML = `<div class="fin-com-preview small"><b>Commission preview</b><br>${collectedNow > 0 ? `${money(c.value)} on ${money(Math.min(collectedNow, t.payable))} collected now · ${esc(c.basis)}` : 'No commission yet: nothing is collected now.'}<br><span class="muted">Commission comes only from collected money (D-025).</span></div>`;
        } else prev.innerHTML = '';
      }
      function syncMethod() {
        const cash = f('method').value === 'Cash'; const ps = f('payStatus');
        $('option[value="Pending"]', ps).disabled = cash; if (cash) ps.value = 'Completed';
        recalc();
      }

      f('patient').addEventListener('change', () => {
        const m = f('patient').value.match(/PAT-\d+/); const p = m ? PP.find.patient(m[0]) : null;
        st.patientId = p ? p.id : null; PP.form.clearErrors(form);
        if (!p && f('patient').value) PP.form.setError(form, 'patient', 'No patient matches. Choose one from the list.');
        if (p && !st.professionalId && p.assignedProfessionalId) { f('professionalId').value = p.assignedProfessionalId; st.professionalId = f('professionalId').value; }
        drawPatient(); drawLines();
      });
      f('professionalId').addEventListener('change', () => {
        st.professionalId = f('professionalId').value;
        const apt = st.appointmentId ? PP.find.appointment(st.appointmentId) : null;
        if (apt && apt.professionalId !== st.professionalId) { st.appointmentId = ''; f('appointmentId').value = ''; PP.ui.toast(`The linked appointment belongs to another ${PP.tl('professional')}, so it was unlinked.`, 'info'); }
        drawBranch(); drawLines();
      });
      f('appointmentId').addEventListener('change', () => {
        st.appointmentId = f('appointmentId').value; const apt = PP.find.appointment(st.appointmentId);
        if (apt) {
          st.professionalId = apt.professionalId; f('professionalId').value = apt.professionalId;
          if (!st.lines.some((l) => l.serviceId === apt.serviceId)) {
            const svc = PP.find.service(apt.serviceId);
            const emptyIdx = st.lines.findIndex((l) => l.kind === 'service' && !l.serviceId);
            if (emptyIdx >= 0) st.lines[emptyIdx] = newServiceLine(svc); else st.lines.push(newServiceLine(svc));
            if (svc && svc.homeVisit && svc.travelCharge) st.lines.push(travelLine(svc));
          }
        }
        drawBranch(); drawLines();
      });
      ['discount', 'paidNow'].forEach((n) => f(n).addEventListener('input', recalc));
      if (canCom) f('manualPct').addEventListener('input', recalc);
      f('method').addEventListener('change', syncMethod);
      f('payStatus').addEventListener('change', recalc);

      // prefill
      if (pat0) { st.patientId = pat0.id; st.professionalId = (apt0 && apt0.professionalId) || pat0.assignedProfessionalId || ''; f('professionalId').value = st.professionalId; st.professionalId = f('professionalId').value; }
      drawPatient();
      if (apt0 && apt0.patientId === st.patientId) { f('appointmentId').value = apt0.id; f('appointmentId').dispatchEvent(new Event('change')); }
      if (lab0) {
        st.professionalId = lab0.professionalId; f('professionalId').value = lab0.professionalId; st.professionalId = f('professionalId').value;
        st.lines = lab0.tests.map((id) => { const t = (PP.db.labTests || []).find((x) => x.id === id) || { id, name: id, price: 0 }; return { kind: 'lab', serviceId: null, labTestId: t.id, labOrderId: lab0.id, description: `${t.name} (${lab0.id})`, qty: 1, unitPrice: t.price, defaultPrice: t.price, overrideReason: '' }; });
        if (lab0.discount) { f('discount').value = lab0.discount; f('discountReason').value = lab0.discountReason || 'Doctor’s discount'; }
        drawPatient();
      }
      if (!st.lines.length) st.lines.push(newServiceLine(null));
      drawLines(); syncMethod(); if (lab0) recalc();
      if (!activeServices().length) PP.ui.toast('There are no active services. Add one in Services & Pricing.', 'warning');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let ok = PP.form.validate(form); let first = null;
        const err = (key, msg) => { ok = false; PP.form.setError(form, key, msg); if (!first) first = $(`[data-field="${key}"] input, [data-field="${key}"] select`, form); };
        if (!st.patientId) err('patient', 'Choose a patient from the list.');
        if (!st.professionalId) err('professionalId', `Choose the ${PP.tl('professional')} for this invoice.`);
        const lines = st.lines.filter((l) => !(l.kind === 'service' && !l.serviceId && !l.description));
        if (!lines.length) { ok = false; PP.ui.toast('Add at least one service line.', 'error'); }
        st.lines.forEach((l, i) => {
          if (l.kind === 'service' && !l.serviceId && (l.description || st.lines.length === 1)) err(`svc-${i}`, 'Choose a service.');
          if (!(Number(l.qty) >= 1) || !Number.isInteger(Number(l.qty))) err(`qty-${i}`, 'Whole number, 1 or more.');
          if (!(Number(l.unitPrice) >= 0) || l.unitPrice === '') err(`price-${i}`, 'Enter zero or a positive price.');
          const svc = l.serviceId ? PP.find.service(l.serviceId) : null;
          if (l.kind === 'service' && svc && Number(l.unitPrice) !== Number(l.defaultPrice) && !String(l.overrideReason || '').trim()) err(`reason-${i}`, 'A price different from the default needs a reason.');
        });
        const t = PP.bill.totals({ ...tmpInv(), lines });
        if (t.discount > t.gross) err('discount', `The discount cannot be more than the gross amount (${money(t.gross)}).`);
        if (canCom && f('manualPct').value !== '' && Number(f('manualPct').value) > 100) err('manualPct', 'Enter a percentage from 0 to 100.');
        const adv = st.applyAdvance ? r2(Math.min(advAvail(), t.payable)) : 0;
        const paidNow = r2(f('paidNow').value);
        if (paidNow > r2(t.payable - adv)) err('paidNow', `Paid now cannot be more than ${money(r2(t.payable - adv))}${adv ? ' after the advance' : ''}.`);
        const branchId = proBranch();
        if (paidNow > 0 && f('method').value === 'Cash' && isClosed(branchId, today)) err('paidNow', `Today's cash day is closed for ${PP.branchName(branchId)}. Record the cash tomorrow or use another method.`);
        if (!ok) { if (first) first.focus(); return; }
        PP.ui.busy($('[data-save]', el), () => {
          const inv = {
            id: PP.nextId('INV'), patientId: st.patientId, professionalId: st.professionalId, branchId, appointmentId: st.appointmentId || null, visitId: null, date: today,
            lines: lines.map((l) => ({ serviceId: l.serviceId || null, description: l.description || PP.serviceName(l.serviceId), qty: Number(l.qty), unitPrice: r2(l.unitPrice), defaultPrice: r2(l.defaultPrice), overrideReason: Number(l.unitPrice) !== Number(l.defaultPrice) ? String(l.overrideReason || '').trim() : '', ...(l.feeType ? { feeType: l.feeType } : {}), ...(l.kind === 'lab' ? { kind: 'lab', labTestId: l.labTestId, labOrderId: l.labOrderId } : {}) })),
            discount: t.discount, discountReason: f('discountReason').value.trim(), notes: f('notes').value.trim(), status: 'Open',
            manualCommissionPercent: canCom && f('manualPct').value !== '' ? Number(f('manualPct').value) : null, createdBy: user().id, createdAt: PP.nowStamp(),
          };
          PP.db.invoices.push(inv);
          if (lab0) { lab0.invoiceId = inv.id; PP.audit('Lab order invoiced', lab0.id, inv.id); }
          PP.audit('Invoice created', inv.id, `${PP.patientName(inv.patientId)} · payable ${money(t.payable)}`);
          inv.lines.filter((l) => l.overrideReason).forEach((l) => PP.audit('Price override', inv.id, `${l.description}: ${PP.fmt.num(l.defaultPrice)} → ${PP.fmt.num(l.unitPrice)} · ${l.overrideReason}`));
          if (inv.manualCommissionPercent != null) PP.audit('Manual commission %', inv.id, `${inv.manualCommissionPercent}%`);
          if (t.discount) PP.audit('Discount given', inv.id, `${money(t.discount)}${inv.discountReason ? ` · ${inv.discountReason}` : ''}`);
          if (adv) applyAdvances(inv, adv);
          if (paidNow > 0) PP.bill.recordPayment({ invoiceId: inv.id, amount: paidNow, method: f('method').value, date: today, status: f('payStatus').value });
          PP.save();
          const tt = PP.bill.totals(inv);
          PP.ui.toast(`Invoice ${inv.id} saved · ${tt.due > 0 ? `due ${money(tt.due)}` : 'fully paid'}`);
          PP.go(`#/billing/${inv.id}`);
        });
      });
    },
  });

  /* --------------------------------------------------------- INVOICE DETAIL */
  PP.route('/billing/:id', {
    title: (p) => `Invoice ${p.id}`,
    perm: 'billing.view',
    render({ el, params }) {
      ensure();
      const inv = PP.find.invoice(params.id);
      if (!inv) { el.innerHTML = `<div class="card">${PP.ui.empty({ icon: 'receipt', title: 'Invoice not found', text: `There is no invoice ${esc(params.id)}.`, action: '<a class="btn" href="#/billing/invoices">Back to invoices</a>' })}</div>`; return; }
      const draw = () => {
        const t = PP.bill.totals(inv); const pat = PP.find.patient(inv.patientId) || {};
        const pays = PP.db.payments.filter((p) => p.invoiceId === inv.id).sort((a, b) => (a.at || a.date).localeCompare(b.at || b.date));
        const entries = PP.db.commissionEntries.filter((e) => e.invoiceId === inv.id);
        const adv = unappliedAdvances(inv.patientId); const advTotal = r2(PP.sum(adv, (a) => a.amount));
        const manage = PP.can('billing.manage'); const apt = inv.appointmentId ? PP.find.appointment(inv.appointmentId) : null;
        el.innerHTML = PP.ui.pageHead({
          title: `Invoice ${esc(inv.id)} ${PP.ui.badge(t.status)}`, crumbs: [['Dashboard', '#/dashboard'], ['Invoices & Dues', '#/billing/invoices'], [inv.id]],
          subtitle: `${esc(pat.name || '—')} · ${PP.fmt.date(inv.date)} · ${esc(PP.branchName(inv.branchId))}`,
          actions: `<button class="btn" data-print>${PP.icon('printer')} Print invoice</button>
            ${manage && advTotal > 0 && t.due > 0 ? `<button class="btn" data-apply-adv>${PP.icon('wallet')} Apply advance (${money(advTotal)})</button>` : ''}
            ${manage && t.due > 0 && t.status !== 'Void' ? `<button class="btn btn-primary" data-pay>${PP.icon('plus')} Record payment</button>` : ''}`,
        }) + `<div class="fin-detail">
          <div class="stack">
            <section class="card"><div class="card-head"><h2>Invoice details</h2></div><div class="card-body">
              <dl class="kv"><dt>Patient</dt><dd>${patLink(inv.patientId)} <span class="muted small">${esc(pat.id || '')} · ${esc(pat.mobile || '')}</span></dd>
              <dt>${esc(PP.t('professional'))}</dt><dd>${esc(PP.proName(inv.professionalId))}</dd>
              <dt>Appointment</dt><dd>${apt ? `${esc(apt.id)} · ${PP.fmt.date(apt.date)} ${PP.fmt.time(apt.start)} · ${esc(apt.status)}` : '—'}</dd>
              <dt>Created by</dt><dd>${esc(userName(inv.createdBy))}</dd>
              ${inv.manualCommissionPercent != null && canSeeCommission(inv) ? `<dt>Manual commission</dt><dd>${esc(inv.manualCommissionPercent)}%</dd>` : ''}
              ${inv.notes ? `<dt>Notes</dt><dd>${esc(inv.notes)}</dd>` : ''}</dl></div>
              <div class="card-body flush"><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Service</th><th scope="col" class="right">Qty</th><th scope="col" class="right">Unit price</th><th scope="col" class="right">Total</th></tr></thead>
              <tbody>${inv.lines.map((l) => `<tr><td>${esc(l.description || PP.serviceName(l.serviceId))}${l.overrideReason ? `<span class="sub">Default ${money(l.defaultPrice)} · ${esc(l.overrideReason)}</span>` : ''}</td><td class="right mono">${esc(l.qty)}</td><td class="right mono">${money(l.unitPrice)}</td><td class="right mono">${money(PP.bill.lineTotal(l))}</td></tr>`).join('')}</tbody>
              <tfoot><tr><td colspan="3">Gross</td><td class="right mono">${money(t.gross)}</td></tr>${t.discount ? `<tr><td colspan="3">Discount${inv.discountReason ? ` · ${esc(inv.discountReason)}` : ''}</td><td class="right mono">−${money(t.discount)}</td></tr>` : ''}<tr><td colspan="3">Payable</td><td class="right mono">${money(t.payable)}</td></tr></tfoot></table></div></div></section>

            ${refundReqHtml(inv)}
            <section class="card"><div class="card-head"><h2>Payment history</h2></div><div class="card-body flush" data-pays></div></section>
            <section class="card"><div class="card-head"><h2>Commission entries from this invoice</h2></div><div class="card-body" data-com></div></section>
          </div>
          <aside class="stack">
            <section class="card fin-summary-card"><div class="card-body">
              <dl class="fin-totals"><dt>Gross</dt><dd>${money(t.gross)}</dd><dt>Discount</dt><dd>${t.discount ? '−' + money(t.discount) : money(0)}</dd><dt class="fin-strong">Payable</dt><dd class="fin-strong">${money(t.payable)}</dd>
              <dt>Collected</dt><dd>${money(t.paid)}</dd><dt>Refunded</dt><dd>${t.refunded ? '−' + money(t.refunded) : money(0)}</dd><dt>Net received</dt><dd>${money(t.net)}</dd></dl>
              <div class="fin-due-box ${t.due > 0 ? 'is-due' : 'is-clear'}"><span>Outstanding</span><b class="mono">${money(t.due)}</b></div>
              ${pays.some((p) => p.status === 'Pending') ? `<div class="mt-3">${PP.ui.alert('warning', 'A payment is pending confirmation. It is not counted as collected until it is marked completed.')}</div>` : ''}
            </div></section>
            ${advTotal > 0 ? `<section class="card"><div class="card-body small">${PP.icon('wallet', 'class="fin-inline-icon"')} <b>${esc(pat.name)}</b> has ${money(advTotal)} in unapplied advance deposits.</div></section>` : ''}
          </aside></div>`;

        PP.ui.table($('[data-pays]', el), {
          rows: pays, pageSize: 10,
          columns: [
            { key: 'id', label: 'Payment', render: (p) => `<b>${esc(p.id)}</b>${p.refundOf ? `<span class="sub">Refund of ${esc(p.refundOf)}</span>` : ''}` },
            { key: 'date', label: 'Date', render: (p) => PP.fmt.date(p.date) },
            { key: 'type', label: 'Type', render: (p) => (p.type === 'refund' ? PP.ui.badge('Refund', 'neutral') : PP.ui.badge('Payment', 'info')) },
            { key: 'method', label: 'Method', render: (p) => esc(p.method) },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => (p.type === 'refund' ? `−${money(p.amount)}` : money(p.amount)) },
            { key: 'status', label: 'Status', render: (p) => PP.ui.badge(p.status) },
            { key: 'note', label: 'Note', render: (p) => `<span class="small">${esc(p.reverseReason ? `Reversed: ${p.reverseReason}` : p.note || '')}</span>` },
            { key: 'act', label: '', render: (p) => {
              const b = [];
              if (manage && p.status === 'Pending') b.push(`<button class="btn btn-sm" data-complete="${esc(p.id)}">${PP.icon('check')} Completed</button>`, `<button class="btn btn-sm btn-danger" data-fail="${esc(p.id)}">Failed</button>`);
              if (p.type === 'payment' && p.status === 'Completed') {
                const left = r2(p.amount - refundedOf(p.id));
                if (PP.can('billing.refund') && left > 0) b.push(`<button class="btn btn-sm" data-refund="${esc(p.id)}">${PP.icon('repeat')} Refund</button>`);
                if (manage && refundedOf(p.id) === 0 && p.method !== 'Advance') b.push(`<button class="btn btn-sm btn-ghost" data-reverse="${esc(p.id)}">Reverse</button>`);
              }
              return `<div class="row-actions">${b.join('')}</div>`;
            } },
          ],
          empty: { icon: 'banknote', title: 'No payments yet', text: 'Record a payment when the patient pays.', action: manage && t.due > 0 ? '<button class="btn btn-primary" data-pay-empty>Record payment</button>' : '' },
          afterDraw: (c) => {
            $$('[data-complete]', c).forEach((b) => b.addEventListener('click', () => { PP.bill.completePayment(b.dataset.complete); PP.save(); PP.ui.toast('Payment marked completed. Income and commission were recorded.'); draw(); }));
            $$('[data-fail]', c).forEach((b) => b.addEventListener('click', async () => { const ok = await PP.ui.confirm({ title: 'Mark payment as failed?', message: 'The payment will not count as collected and earns no commission (D-025).', confirmLabel: 'Mark failed', danger: true }); if (!ok) return; PP.bill.failPayment(b.dataset.fail); PP.save(); PP.ui.toast('Payment marked failed', 'warning'); draw(); }));
            $$('[data-refund]', c).forEach((b) => b.addEventListener('click', () => refundModal(PP.find.payment(b.dataset.refund), inv, draw)));
            bindRefundReqs(el, inv, draw);
            $$('[data-reverse]', c).forEach((b) => b.addEventListener('click', async () => {
              const p = PP.find.payment(b.dataset.reverse);
              const res = await PP.ui.confirm({ title: `Reverse ${esc(p.id)}?`, message: `The payment of ${money(p.amount)} (${esc(p.method)}) will be reversed. Its income entry and commission are reversed too (D-025 rule 5). This cannot be undone.`, confirmLabel: 'Reverse payment', danger: true, reasonLabel: 'Reason for the reversal', reasonRequired: true });
              if (!res) return;
              PP.bill.reversePayment(p.id, res.reason); PP.save(); PP.ui.toast(`${esc(p.id)} reversed`, 'warning'); draw();
            }));
            const pe = $('[data-pay-empty]', c); if (pe) pe.addEventListener('click', () => paymentModal(inv, draw));
          },
        });

        const com = $('[data-com]', el);
        if (!canSeeCommission(inv)) com.innerHTML = `<p class="muted small" style="margin:0">Commission details are visible to users with commission permissions. Commission comes only from collected money (D-025).</p>`;
        else {
          com.innerHTML = `${PP.ui.alert('info', `Commission comes only from collected money (D-025). Creating the invoice created nothing; each completed payment created an entry, and refunds or reversals adjusted it. All of it goes to ${esc(PP.proName(inv.professionalId))} (one ${esc(PP.tl('professional'))} per invoice, D-026).`)}
            ${entries.length ? `<div class="table-wrap mt-3"><table class="table"><thead><tr><th scope="col">Entry</th><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Payment</th><th scope="col" class="right">Base</th><th scope="col" class="right">Commission</th><th scope="col">Basis</th><th scope="col">Settlement</th></tr></thead>
            <tbody>${entries.map((e) => `<tr><td>${esc(e.id)}</td><td>${PP.fmt.date(e.date)}</td><td>${PP.ui.badge(typeLabel(e.type), entryTone(e.type))}</td><td>${esc(e.paymentId)}</td><td class="right mono">${signed(e.base)}</td><td class="right mono">${signed(e.value)}</td><td class="small">${esc(e.basis)}</td><td>${e.settlementId ? esc(e.settlementId) : '<span class="muted">Unsettled</span>'}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="5">Net commission</td><td class="right mono">${signed(r2(PP.sum(entries, (e) => e.value)))}</td><td colspan="2"></td></tr></tfoot></table></div>` : `<p class="muted mt-3" style="margin-bottom:0">No commission yet: no money has been collected on this invoice.</p>`}`;
        }

        $('[data-print]', el).addEventListener('click', () => printInvoice(inv));
        const pay = $('[data-pay]', el); if (pay) pay.addEventListener('click', () => paymentModal(inv, draw));
        const ap = $('[data-apply-adv]', el);
        if (ap) ap.addEventListener('click', async () => {
          const amt = r2(Math.min(advTotal, t.due));
          const ok = await PP.ui.confirm({ title: 'Apply advance deposit?', message: `${money(amt)} of ${esc(pat.name)}'s advance will be applied to ${esc(inv.id)}. This records a payment with method “Advance”; commission is earned now (D-026).`, confirmLabel: 'Apply advance' });
          if (!ok) return; applyAdvances(inv, amt); PP.save(); PP.ui.toast(`Advance of ${money(amt)} applied`); draw();
        });
      };
      draw();
    },
  });

  function paymentModal(inv, onDone) {
    const t = PP.bill.totals(inv);
    PP.ui.modal({
      title: `Record payment · ${esc(inv.id)}`,
      body: `<form class="form-grid" novalidate>
        <div class="full">${PP.ui.alert('info', `Outstanding ${money(t.due)} on payable ${money(t.payable)}.`)}</div>
        ${PP.form.field({ name: 'amount', label: 'Amount (BDT)', type: 'number', required: true, rule: 'positive', min: 0, step: 50, value: t.due })}
        ${PP.form.field({ name: 'date', label: 'Payment date', type: 'date', required: true, value: PP.today(), max: PP.today() })}
        ${PP.form.field({ name: 'method', label: 'Method', type: 'select', placeholder: false, options: PP.PAYMENT_METHODS, value: 'Cash' })}
        ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, options: ['Completed', 'Pending'], value: 'Completed', hint: 'Pending = mobile banking not yet confirmed.' })}
        ${PP.form.field({ name: 'note', label: 'Note', full: true, placeholder: 'e.g. bKash TrxID' })}</form>`,
      onOpen: (b) => { const m = $('[name=method]', b); const s = $('[name=status]', b); const sync = () => { const cash = m.value === 'Cash'; $('option[value="Pending"]', s).disabled = cash; if (cash) s.value = 'Completed'; }; m.addEventListener('change', sync); sync(); },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Record payment', kind: 'primary', onClick: async ({ body }) => {
        const form = $('form', body); if (!PP.form.validate(form)) return false;
        const d = PP.form.read(form); const amt = r2(d.amount);
        if (amt > t.due) { PP.form.setError(form, 'amount', `The amount cannot be more than the outstanding ${money(t.due)}.`); return false; }
        if (d.date > PP.today()) { PP.form.setError(form, 'date', 'A payment cannot be in the future.'); return false; }
        if (d.method === 'Cash' && isClosed(inv.branchId, d.date)) { PP.form.setError(form, 'date', `The cash day ${PP.fmt.date(d.date)} is closed for ${PP.branchName(inv.branchId)}. Use an open day.`); return false; }
        await PP.sleep(300);
        PP.bill.recordPayment({ invoiceId: inv.id, amount: amt, method: d.method, date: d.date, status: d.status, note: d.note });
        PP.save(); PP.ui.toast(d.status === 'Completed' ? `Payment of ${money(amt)} recorded` : `Pending payment of ${money(amt)} recorded. Mark it completed when confirmed.`, d.status === 'Completed' ? 'positive' : 'info');
        onDone();
      } }],
    });
  }

  /* Refund requests (maker-checker, D-036) */
  function refundReqHtml(inv) {
    const list = (PP.db.refundRequests || []).filter((r) => r.invoiceId === inv.id && r.status === 'Pending');
    if (!list.length) return '';
    const canApprove = PP.can('billing.approve');
    return `<section class="card"><div class="card-head"><h2>Refunds waiting for approval</h2><span class="badge warning">Maker-checker</span></div><div class="card-body flush"><div class="table-wrap"><table class="table"><thead><tr><th>Request</th><th>Payment</th><th class="right">Amount</th><th>Reason</th><th>Requested by</th><th></th></tr></thead><tbody>${list.map((r) => {
      const same = r.requestedBy === user().id;
      return `<tr><td class="mono">${esc(r.id)}</td><td class="mono">${esc(r.paymentId)}</td><td class="right">${money(r.amount)}</td><td>${esc(r.reason)}</td><td>${esc(userName(r.requestedBy))}<span class="sub">${PP.fmt.stamp(r.requestedAt)}</span></td><td><div class="row-actions">${canApprove && !same ? `<button class="btn btn-sm btn-primary" data-rq-ok="${esc(r.id)}">Approve</button><button class="btn btn-sm btn-ghost" data-rq-no="${esc(r.id)}">Reject</button>` : `<span class="small muted">${same ? 'You requested it — another person approves' : 'Waiting for an approver'}</span>`}</div></td></tr>`;
    }).join('')}</tbody></table></div></div></section>`;
  }
  function bindRefundReqs(el, inv, redraw) {
    $$('[data-rq-ok]', el).forEach((b) => { if (b.dataset.bound) return; b.dataset.bound = 1; b.addEventListener('click', async () => {
      const r = PP.db.refundRequests.find((x) => x.id === b.dataset.rqOk); const mc = PP.makerChecker(r.requestedBy, 'refund'); if (mc) { PP.ui.toast(mc, 'error'); return; }
      const ok = await PP.ui.confirm({ title: `Approve refund ${esc(r.id)}?`, message: `${money(r.amount)} by ${esc(r.method)} · ${esc(r.reason)}. The money goes back to the patient and commission is adjusted.`, confirmLabel: 'Approve refund' }); if (!ok) return;
      PP.bill.refund({ paymentId: r.paymentId, amount: r.amount, method: r.method, reason: `${r.reason} (approved ${r.id})` });
      r.status = 'Approved'; r.approvedBy = user().id; r.approvedAt = PP.nowStamp(); PP.audit('Refund approved', r.invoiceId, `${r.id} · ${money(r.amount)} · maker ${userName(r.requestedBy)}`); PP.save(); PP.ui.toast('Refund approved and recorded'); redraw();
    }); });
    $$('[data-rq-no]', el).forEach((b) => { if (b.dataset.bound) return; b.dataset.bound = 1; b.addEventListener('click', async () => {
      const r = PP.db.refundRequests.find((x) => x.id === b.dataset.rqNo); const res = await PP.ui.confirm({ title: `Reject refund ${esc(r.id)}?`, message: 'The request is closed. Nothing is refunded.', confirmLabel: 'Reject', danger: true, reasonLabel: 'Reason (optional)' }); if (!res) return;
      r.status = 'Rejected'; r.approvedBy = user().id; r.approvedAt = PP.nowStamp(); PP.audit('Refund rejected', r.invoiceId, `${r.id}${res.reason ? ' · ' + res.reason : ''}`); PP.save(); PP.ui.toast('Refund request rejected', 'info'); redraw();
    }); });
  }
  function refundModal(pay, inv, onDone) {
    const left = r2(Math.min(pay.amount - refundedOf(pay.id), PP.bill.totals(inv).net));
    PP.ui.modal({
      title: `Refund · ${esc(pay.id)}`,
      body: `<form class="form-grid" novalidate>
        <div class="full">${PP.ui.alert('warning', `Original payment ${money(pay.amount)} (${esc(pay.method)}, ${PP.fmt.date(pay.date)}). Up to ${money(left)} can be refunded. The refund creates a negative income entry and a commission adjustment (D-025 rule 6); after a payout the ${esc(PP.tl('professional'))}'s balance can go negative (D-026).`)}</div>
        ${PP.form.field({ name: 'amount', label: 'Refund amount (BDT)', type: 'number', required: true, rule: 'positive', min: 0, step: 50, value: left })}
        ${PP.form.field({ name: 'method', label: 'Refund method', type: 'select', placeholder: false, options: PP.PAYMENT_METHODS, value: PP.PAYMENT_METHODS.includes(pay.method) ? pay.method : 'Cash' })}
        ${PP.form.field({ name: 'reason', label: 'Reason', type: 'textarea', required: true, full: true, rows: 2 })}</form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Request refund', kind: 'danger solid', onClick: async ({ body }) => {
        const form = $('form', body); if (!PP.form.validate(form)) return false;
        const d = PP.form.read(form); const amt = r2(d.amount);
        if (amt > left) { PP.form.setError(form, 'amount', `The refund cannot be more than ${money(left)}.`); return false; }
        if (d.method === 'Cash' && isClosed(inv.branchId, PP.today())) { PP.form.setError(form, 'method', `Today's cash day is closed for ${PP.branchName(inv.branchId)}. Choose another method.`); return false; }
        await PP.sleep(300);
        // Maker-checker (D-036): the refund is a request until a different person with billing.approve approves it.
        const rq = { id: PP.nextId('RFQ'), paymentId: pay.id, invoiceId: inv.id, branchId: inv.branchId, amount: amt, method: d.method, reason: d.reason, requestedBy: user().id, requestedAt: PP.nowStamp(), status: 'Pending' };
        (PP.db.refundRequests = PP.db.refundRequests || []).push(rq);
        PP.audit('Refund requested', inv.id, `${rq.id} · ${money(amt)} · ${d.reason}`);
        PP.notify('Refund waiting for approval', `${money(amt)} on ${inv.id} · requested by ${user().name}`, `#/billing/${inv.id}`);
        PP.save(); PP.ui.toast(`Refund request ${rq.id} sent for approval (maker-checker).`, 'info', 4200); onDone();
      } }],
    });
  }

  function printInvoice(inv) {
    if (PP.rxPad && PP.rxPad.invoiceSheet) { printSheet(PP.rxPad.invoiceSheet(inv)); return; } // owner's invoice design (2026-11-26)
    const t = PP.bill.totals(inv); const pat = PP.find.patient(inv.patientId) || {};
    const pays = PP.db.payments.filter((p) => p.invoiceId === inv.id && p.status === 'Completed');
    printSheet(`<article class="fin-sheet">${sheetHead('INVOICE', `${esc(inv.id)} · ${PP.fmt.date(inv.date)}`)}
      <section class="fin-sheet-parties"><div><div class="fin-sheet-label">Billed to</div><b>${esc(pat.name || '—')}</b><br>${esc(pat.id || '')} · ${esc(pat.mobile || '')}<br>${esc(pat.address || '')}</div>
        <div><div class="fin-sheet-label">${esc(PP.t('professional'))}</div><b>${esc(PP.proName(inv.professionalId))}</b><br>${esc(PP.branchName(inv.branchId))}</div>
        <div><div class="fin-sheet-label">Status</div><b>${esc(t.status)}</b></div></section>
      ${sheetTable([{ label: 'Service' }, { label: 'Qty', right: true }, { label: 'Unit price', right: true }, { label: 'Total', right: true }], inv.lines.map((l) => [esc(l.description || PP.serviceName(l.serviceId)), esc(l.qty), money(l.unitPrice), money(PP.bill.lineTotal(l))]))}
      <div class="fin-sheet-totals"><dl class="fin-totals"><dt>Gross</dt><dd>${money(t.gross)}</dd><dt>Discount</dt><dd>${money(t.discount)}</dd><dt class="fin-strong">Payable</dt><dd class="fin-strong">${money(t.payable)}</dd><dt>Received</dt><dd>${money(t.paid)}</dd>${t.refunded ? `<dt>Refunded</dt><dd>−${money(t.refunded)}</dd>` : ''}<dt class="fin-strong">Balance due</dt><dd class="fin-strong">${money(t.due)}</dd></dl></div>
      ${pays.length ? `<h3 class="fin-sheet-h3">Payments</h3>${sheetTable(['Date', 'Reference', 'Method', { label: 'Amount', right: true }], pays.map((p) => [PP.fmt.date(p.date), esc(p.id), esc(p.method), (p.type === 'refund' ? '−' : '') + money(p.amount)]))}` : ''}
      ${sheetFoot(PP.db.settings.invoiceFooter)}</article>`);
  }

  /* ======================================================= INCOME & EXPENSES */
  PP.route('/finance', {
    title: 'Income & Expenses',
    perm: 'finance.manage',
    render({ el, query }) {
      ensure();
      const st = { month: /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : PP.monthKey(PP.today()), branch: PP.activeBranchId(), tab: tabFrom(query, ['income', 'expenses', 'categories'], 'income') };
      const range = () => [`${st.month}-01`, monthEnd(st.month)];
      el.innerHTML = PP.ui.pageHead({
        title: 'Income &amp; Expenses', crumbs: [['Dashboard', '#/dashboard'], ['Cash Flow'], ['Income & Expenses']],
        subtitle: 'Basic income and expense management (D-023). Entries are never edited or deleted; a correction is a reversing entry.',
        actions: `<button class="btn" data-add-inc>${PP.icon('plus')} Add income</button><button class="btn btn-primary" data-add-exp>${PP.icon('plus')} Add expense</button>`,
      }) + `<div class="card fin-toolbar no-print"><div class="fin-toolbar-row">
          <label class="fin-inline"><span>Month</span><input type="month" class="input" data-month value="${esc(st.month)}" max="${PP.monthKey(PP.today())}"></label>
          <label class="fin-inline"><span>Branch</span><select class="select" data-branch-local>${[['ALL', 'All branches'], ...userBranches().map((b) => [b.id, b.name])].map(([v, l]) => `<option value="${v}" ${st.branch === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <div class="fin-toolbar-spacer"></div>
          <button class="btn" data-csv>${PP.icon('download')} Excel (CSV)</button><button class="btn" data-pdf>${PP.icon('printer')} PDF</button></div></div>
        <div class="grid grid-4 mt-4" data-kpis></div>
        <div class="card mt-4 fin-card-tabs"><div data-tabs></div><div data-body></div></div>`;
      const body = $('[data-body]', el);
      const incomeRows = () => { const [a, b] = range(); return PP.db.incomes.filter((x) => x.date >= a && x.date <= b && matchBranch(x, st.branch)); };
      const expenseRows = () => { const [a, b] = range(); return PP.db.expenses.filter((x) => x.date >= a && x.date <= b && matchBranch(x, st.branch)); };
      const reversedIds = () => new Set([...PP.db.incomes, ...PP.db.expenses].map((x) => x.reversalOf).filter(Boolean));

      function drawKpis() {
        const [a, b] = range(); const f = calc.finance(a, b, st.branch);
        $('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Income', value: money(f.income), hint: `${f.incomeCount} entries · patient payments included automatically`, tone: 'positive', icon: 'arrowDown' })
          + PP.ui.kpi({ label: 'Expenses (paid)', value: money(f.expenses), hint: `${f.expenseCount} entries`, tone: 'warning', icon: 'arrowUp' })
          + PP.ui.kpi({ label: f.net >= 0 ? 'Net profit' : 'Net loss', value: signed(f.net), hint: 'Cash-based: income − paid expenses', tone: f.net >= 0 ? 'info' : 'error', icon: 'chart' })
          + PP.ui.kpi({ label: 'Unpaid expenses', value: money(f.unpaid), hint: 'Recorded, not yet paid', tone: 'lavender', icon: 'clock' });
      }
      function drawTabs() {
        PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'income', label: 'Income', count: incomeRows().length }, { id: 'expenses', label: 'Expenses', count: expenseRows().length }, { id: 'categories', label: 'Categories' }], active: st.tab, onChange: (t) => { st.tab = t; drawBody(); } });
      }
      function drawAll() { drawKpis(); drawTabs(); drawBody(); }
      function drawBody() { if (st.tab === 'income') drawIncome(); else if (st.tab === 'expenses') drawExpenses(); else drawCategories(); }

      function sourceCell(x) {
        if (!x.auto) return x.reversalOf ? `${PP.ui.badge('Reversal', 'error')}<span class="sub">of ${esc(x.reversalOf)}</span>` : PP.ui.badge('Manual', 'neutral');
        const pay = x.source && x.source.id ? PP.find.payment(x.source.id) : null;
        const label = x.source && x.source.type === 'refund' ? 'auto · refund' : x.source && x.source.type === 'reversal' ? 'auto · reversal' : 'auto';
        return `${PP.ui.badge(label, 'info')}${pay ? `<span class="sub">${esc(pay.id)} · ${invLink(pay.invoiceId)}</span>` : ''}`;
      }
      function drawIncome() {
        const rev = reversedIds();
        const cats = PP.db.financeCategories.filter((c) => c.type === 'income');
        PP.ui.table(body, {
          rows: incomeRows(), exportName: 'income', sortKey: 'date', sortDir: 'desc', pageSize: 10,
          search: { placeholder: 'Search note, invoice, category…', text: (x) => `${x.id} ${x.note || ''} ${catName(x.categoryId)} ${x.method}` },
          filters: [
            { id: 'cat', label: 'All categories', options: cats.map((c) => [c.id, c.name]), match: (x, v) => x.categoryId === v },
            { id: 'method', label: 'All methods', options: PP.PAYMENT_METHODS.map((m) => [m, m]), match: (x, v) => x.method === v },
            { id: 'src', label: 'All sources', options: [['auto', 'Automatic (billing)'], ['manual', 'Manual']], match: (x, v) => (v === 'auto' ? !!x.auto : !x.auto) },
          ],
          columns: [
            { key: 'date', label: 'Date', sort: (x) => x.date + x.id, render: (x) => `<span class="nowrap">${PP.fmt.date(x.date)}</span><span class="sub">${esc(x.id)}</span>`, exportValue: (x) => x.date },
            { key: 'cat', label: 'Category', sort: (x) => catName(x.categoryId), render: (x) => esc(catName(x.categoryId)) },
            { key: 'src', label: 'Source', render: sourceCell, exportValue: (x) => (x.auto ? 'auto' : 'manual') },
            { key: 'note', label: 'Note', render: (x) => `<span class="small">${esc(x.note || '')}</span>` },
            { key: 'method', label: 'Method', sort: (x) => x.method, render: (x) => esc(x.method) },
            { key: 'branch', label: 'Branch', render: (x) => esc(PP.branchName(x.branchId)) },
            { key: 'amount', label: 'Amount', align: 'right', sort: (x) => x.amount, render: (x) => signed(x.amount), exportValue: (x) => x.amount },
            { key: 'act', label: '', render: (x) => (rev.has(x.id) ? PP.ui.badge('Reversed') : !x.auto && !x.reversalOf ? `<button class="btn btn-ghost btn-sm" data-rev-inc="${esc(x.id)}">${PP.icon('repeat')} Reverse</button>` : x.auto ? '<span class="small muted">Correct on the invoice</span>' : '') },
          ],
          footer: (list) => `<tr><td colspan="6">Total</td><td class="right mono">${signed(r2(PP.sum(list, (x) => x.amount)))}</td><td></td></tr>`,
          empty: { icon: 'banknote', title: 'No income this month', text: 'Patient payments appear here automatically. Add other income manually.' },
          afterDraw: (c) => $$('[data-rev-inc]', c).forEach((b) => b.addEventListener('click', () => reverseEntry('income', b.dataset.revInc))),
        });
      }
      function drawExpenses() {
        const rev = reversedIds();
        const cats = PP.db.financeCategories.filter((c) => c.type === 'expense');
        PP.ui.table(body, {
          rows: expenseRows(), exportName: 'expenses', sortKey: 'date', sortDir: 'desc', pageSize: 10,
          search: { placeholder: 'Search note, category…', text: (x) => `${x.id} ${x.note || ''} ${catName(x.categoryId)} ${x.method}` },
          filters: [
            { id: 'cat', label: 'All categories', options: cats.map((c) => [c.id, c.name]), match: (x, v) => x.categoryId === v },
            { id: 'method', label: 'All methods', options: PP.PAYMENT_METHODS.map((m) => [m, m]), match: (x, v) => x.method === v },
            { id: 'ps', label: 'Paid and unpaid', options: [['Paid', 'Paid'], ['Unpaid', 'Unpaid']], match: (x, v) => x.paymentStatus === v },
          ],
          columns: [
            { key: 'date', label: 'Date', sort: (x) => x.date + x.id, render: (x) => `<span class="nowrap">${PP.fmt.date(x.date)}</span><span class="sub">${esc(x.id)}</span>`, exportValue: (x) => x.date },
            { key: 'cat', label: 'Category', sort: (x) => catName(x.categoryId), render: (x) => `${esc(catName(x.categoryId))}${x.source && x.source.type === 'payout' ? `<span class="sub">auto · ${esc(x.source.id)}</span>` : ''}` },
            { key: 'note', label: 'Note', render: (x) => `<span class="small">${esc(x.note || '')}</span>${x.reversalOf ? `<span class="sub">Reversal of ${esc(x.reversalOf)}</span>` : ''}` },
            { key: 'method', label: 'Method', sort: (x) => x.method, render: (x) => esc(x.method) },
            { key: 'ps', label: 'Payment', sort: (x) => x.paymentStatus, render: (x) => `${PP.ui.badge(x.paymentStatus || 'Paid')}${x.paidDate && x.paidDate !== x.date ? `<span class="sub">paid ${PP.fmt.dateShort(x.paidDate)}</span>` : ''}`, exportValue: (x) => x.paymentStatus },
            { key: 'branch', label: 'Branch', render: (x) => esc(PP.branchName(x.branchId)) },
            { key: 'amount', label: 'Amount', align: 'right', sort: (x) => x.amount, render: (x) => signed(x.amount), exportValue: (x) => x.amount },
            { key: 'act', label: '', render: (x) => `<div class="row-actions">${x.paymentStatus === 'Unpaid' && !rev.has(x.id) ? `<button class="btn btn-sm" data-markpaid="${esc(x.id)}">Mark paid</button>` : ''}${rev.has(x.id) ? PP.ui.badge('Reversed') : !x.reversalOf && !(x.source && x.source.type === 'payout') ? `<button class="btn btn-ghost btn-sm" data-rev-exp="${esc(x.id)}">${PP.icon('repeat')} Reverse</button>` : ''}</div>` },
          ],
          footer: (list) => `<tr><td colspan="6">Total</td><td class="right mono">${signed(r2(PP.sum(list, (x) => x.amount)))}</td><td></td></tr>`,
          empty: { icon: 'receipt', title: 'No expenses this month', text: 'Record rent, salaries, utilities and other costs.', action: '<button class="btn btn-primary" data-add-exp2>Add expense</button>' },
          afterDraw: (c) => {
            $$('[data-rev-exp]', c).forEach((b) => b.addEventListener('click', () => reverseEntry('expense', b.dataset.revExp)));
            $$('[data-markpaid]', c).forEach((b) => b.addEventListener('click', () => markPaid(b.dataset.markpaid)));
            const a2 = $('[data-add-exp2]', c); if (a2) a2.addEventListener('click', () => entryModal('expense'));
          },
        });
      }
      function drawCategories() {
        const [a, b] = range();
        const block = (type) => {
          const cats = PP.db.financeCategories.filter((c) => c.type === type); const coll = type === 'income' ? PP.db.incomes : PP.db.expenses;
          return `<section class="fin-cat-block"><div class="row between"><h3>${type === 'income' ? 'Income categories' : 'Expense categories'}</h3><button class="btn btn-sm" data-add-cat="${type}">${PP.icon('plus')} Add category</button></div>
            <div class="table-wrap mt-3"><table class="table"><thead><tr><th scope="col">Category</th><th scope="col" class="right">Entries (all time)</th><th scope="col" class="right">${esc(PP.fmt.month(st.month))}</th></tr></thead><tbody>
            ${cats.map((c) => { const all = coll.filter((x) => x.categoryId === c.id); const m = all.filter((x) => x.date >= a && x.date <= b && matchBranch(x, st.branch)); return `<tr><td>${esc(c.name)} ${c.system ? PP.ui.badge('System', 'neutral') : ''}<span class="sub">${esc(c.id)}</span></td><td class="right mono">${all.length}</td><td class="right mono">${signed(r2(PP.sum(m, (x) => x.amount)))}</td></tr>`; }).join('')}
            </tbody></table></div></section>`;
        };
        body.innerHTML = `<div class="card-body"><p class="muted small" style="margin-top:0">System categories are used by automatic entries (patient payments, refunds, reversals, commission payouts) and cannot be chosen for manual entries.</p><div class="grid grid-2 fin-cat-grid">${block('income')}${block('expense')}</div></div>`;
        $$('[data-add-cat]', body).forEach((btn) => btn.addEventListener('click', () => categoryModal(btn.dataset.addCat)));
      }

      function entryModal(type) {
        const isInc = type === 'income';
        const cats = PP.db.financeCategories.filter((c) => c.type === type && !c.system);
        const defBranch = st.branch !== 'ALL' ? st.branch : (userBranches()[0] || PP.db.branches[0]).id;
        PP.ui.modal({
          title: isInc ? 'Add income' : 'Add expense',
          body: `<form class="form-grid" novalidate>
            ${PP.form.field({ name: 'date', label: 'Date', type: 'date', required: true, value: PP.today(), max: PP.today() })}
            ${PP.form.field({ name: 'categoryId', label: 'Category', type: 'select', required: true, options: cats.map((c) => [c.id, c.name]) })}
            ${PP.form.field({ name: 'amount', label: 'Amount (BDT)', type: 'number', required: true, rule: 'positive', min: 0, step: 50 })}
            ${PP.form.field({ name: 'method', label: 'Payment method', type: 'select', placeholder: false, options: PP.PAYMENT_METHODS, value: 'Cash' })}
            ${isInc ? '' : PP.form.field({ name: 'paymentStatus', label: 'Payment status', type: 'select', placeholder: false, options: ['Paid', 'Unpaid'], value: 'Paid' })}
            ${PP.form.field({ name: 'branchId', label: 'Branch', type: 'select', required: true, placeholder: false, options: userBranches().map((b) => [b.id, b.name]), value: defBranch })}
            ${PP.form.field({ name: 'note', label: 'Note', type: 'textarea', rows: 2, full: true, required: !isInc, placeholder: isInc ? 'e.g. Lumbar support belt sale' : 'e.g. Electricity bill, November' })}
            ${isInc ? `<div class="full form-note">Patient payments are recorded automatically from billing. Use this form only for other income.</div>` : ''}</form>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: isInc ? 'Add income' : 'Add expense', kind: 'primary', onClick: async ({ body: b }) => {
            const form = $('form', b); if (!PP.form.validate(form)) return false;
            const d = PP.form.read(form);
            if (d.date > PP.today()) { PP.form.setError(form, 'date', 'The date cannot be in the future.'); return false; }
            if (isClosed(d.branchId, d.date)) { PP.form.setError(form, 'date', `${PP.fmt.date(d.date)} is closed for ${PP.branchName(d.branchId)}. Record the correction on an open day.`); return false; }
            await PP.sleep(300);
            if (isInc) {
              const rec = { id: PP.nextId('INC'), date: d.date, branchId: d.branchId, categoryId: d.categoryId, amount: r2(d.amount), method: d.method, source: { type: 'manual' }, note: d.note, auto: false, createdBy: user().id, at: PP.nowStamp() };
              PP.db.incomes.push(rec); PP.audit('Income recorded', rec.id, `${catName(rec.categoryId)} · ${money(rec.amount)}`);
            } else {
              const rec = { id: PP.nextId('EXP'), date: d.date, categoryId: d.categoryId, amount: r2(d.amount), branchId: d.branchId, method: d.method, paymentStatus: d.paymentStatus, paidDate: d.paymentStatus === 'Paid' ? d.date : null, note: d.note, createdBy: user().id, reversalOf: null, at: PP.nowStamp() };
              PP.db.expenses.push(rec); PP.audit('Expense recorded', rec.id, `${catName(rec.categoryId)} · ${money(rec.amount)} · ${rec.paymentStatus}`);
            }
            PP.save(); PP.ui.toast(`${isInc ? 'Income' : 'Expense'} of ${money(d.amount)} added`);
            if (PP.monthKey(d.date) !== st.month) { st.month = PP.monthKey(d.date); $('[data-month]', el).value = st.month; }
            st.tab = isInc ? 'income' : 'expenses'; drawAll();
          } }],
        });
      }
      async function reverseEntry(type, id) {
        const coll = type === 'income' ? PP.db.incomes : PP.db.expenses; const x = coll.find((e) => e.id === id); if (!x) return;
        if (isClosed(x.branchId, PP.today())) { PP.ui.toast(`Today is already closed for ${esc(PP.branchName(x.branchId))}. Reverse the entry on the next open day.`, 'error'); return; }
        const res = await PP.ui.confirm({ title: `Reverse ${esc(x.id)}?`, message: `A new entry of ${money(-x.amount)} dated today will cancel this ${type} (${esc(catName(x.categoryId))}, ${money(x.amount)}). The original stays in the record.`, confirmLabel: 'Create reversing entry', danger: true, reasonLabel: 'Reason', reasonRequired: true });
        if (!res) return;
        const base = { id: PP.nextId(type === 'income' ? 'INC' : 'EXP'), date: PP.today(), branchId: x.branchId, categoryId: x.categoryId, amount: -x.amount, method: x.method, note: `Reversal of ${x.id}: ${res.reason}`, reversalOf: x.id, createdBy: user().id, at: PP.nowStamp() };
        if (type === 'income') coll.push({ ...base, source: { type: 'manual-reversal', id: x.id }, auto: false });
        else coll.push({ ...base, paymentStatus: x.paymentStatus, paidDate: x.paymentStatus === 'Paid' ? PP.today() : null });
        PP.audit(type === 'income' ? 'Income reversed' : 'Expense reversed', x.id, `${money(x.amount)} · ${res.reason}`);
        PP.save(); PP.ui.toast(`${esc(x.id)} reversed with ${esc(base.id)}`, 'warning');
        if (PP.monthKey(PP.today()) !== st.month) PP.ui.toast('The reversing entry is dated today, so it appears in the current month.', 'info');
        drawAll();
      }
      async function markPaid(id) {
        const x = PP.db.expenses.find((e) => e.id === id); if (!x) return;
        if (x.method === 'Cash' && isClosed(x.branchId, PP.today())) { PP.ui.toast('Today is closed for this branch. Mark it paid on the next open day.', 'error'); return; }
        const ok = await PP.ui.confirm({ title: 'Mark expense as paid?', message: `${esc(catName(x.categoryId))} · ${money(x.amount)} will be marked paid today (${esc(x.method)}).`, confirmLabel: 'Mark paid' });
        if (!ok) return;
        x.paymentStatus = 'Paid'; x.paidDate = PP.today(); PP.audit('Expense paid', x.id, money(x.amount)); PP.save(); PP.ui.toast('Expense marked paid'); drawAll();
      }
      function categoryModal(type) {
        PP.ui.modal({
          title: `Add ${type} category`, size: 'sm',
          body: `<form class="stack" novalidate>${PP.form.field({ name: 'name', label: 'Category name', required: true })}</form>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Add category', kind: 'primary', onClick: async ({ body: b }) => {
            const form = $('form', b); if (!PP.form.validate(form)) return false;
            const name = PP.form.read(form).name;
            if (PP.db.financeCategories.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) { PP.form.setError(form, 'name', 'This category already exists.'); return false; }
            const n = PP.nextId('CAT', 3).split('-')[1];
            const rec = { id: `CAT-${type === 'income' ? 'I' : 'E'}-${n}`, type, name };
            PP.db.financeCategories.push(rec); PP.audit('Finance category added', rec.id, `${type} · ${name}`); PP.save(); PP.ui.toast(`Category “${esc(name)}” added`); drawCategories();
          } }],
        });
      }

      $('[data-add-inc]', el).addEventListener('click', () => entryModal('income'));
      $('[data-add-exp]', el).addEventListener('click', () => entryModal('expense'));
      $('[data-month]', el).addEventListener('change', (e) => { if (!e.target.value) return; st.month = e.target.value; drawAll(); });
      $('[data-branch-local]', el).addEventListener('change', (e) => { st.branch = e.target.value; drawAll(); });
      $('[data-csv]', el).addEventListener('click', () => {
        const rows = [['Type', 'ID', 'Date', 'Category', 'Source', 'Method', 'Payment status', 'Branch', 'Amount', 'Note']];
        incomeRows().forEach((x) => rows.push(['Income', x.id, x.date, catName(x.categoryId), x.auto ? 'auto' : 'manual', x.method, '', PP.branchName(x.branchId), x.amount, x.note || '']));
        expenseRows().forEach((x) => rows.push(['Expense', x.id, x.date, catName(x.categoryId), x.source && x.source.type === 'payout' ? 'auto' : 'manual', x.method, x.paymentStatus, PP.branchName(x.branchId), x.amount, x.note || '']));
        csv(`income-expenses-${st.month}`, rows);
      });
      $('[data-pdf]', el).addEventListener('click', () => {
        const [a, b] = range(); const f = calc.finance(a, b, st.branch);
        printSheet(`<article class="fin-sheet">${sheetHead('Income & Expenses', `${esc(PP.fmt.month(st.month))} · ${esc(branchLabel(st.branch))}`)}
          <div class="fin-sheet-kpis"><div><span>Income</span><b>${money(f.income)}</b></div><div><span>Expenses (paid)</span><b>${money(f.expenses)}</b></div><div><span>Net ${f.net >= 0 ? 'profit' : 'loss'}</span><b>${money(f.net)}</b></div><div><span>Unpaid expenses</span><b>${money(f.unpaid)}</b></div></div>
          <h3 class="fin-sheet-h3">Income</h3>${sheetTable(['Date', 'Category', 'Source', 'Method', 'Note', { label: 'Amount', right: true }], incomeRows().sort((x, y) => x.date.localeCompare(y.date)).map((x) => [PP.fmt.date(x.date), esc(catName(x.categoryId)), x.auto ? 'auto' : 'manual', esc(x.method), esc(x.note || ''), money(x.amount)]), ['', '', '', '', 'Total', money(f.income)])}
          <h3 class="fin-sheet-h3">Expenses</h3>${sheetTable(['Date', 'Category', 'Status', 'Method', 'Note', { label: 'Amount', right: true }], expenseRows().sort((x, y) => x.date.localeCompare(y.date)).map((x) => [PP.fmt.date(x.date), esc(catName(x.categoryId)), esc(x.paymentStatus), esc(x.method), esc(x.note || ''), money(x.amount)]))}
          ${sheetFoot('Cash-based summary, not a formal accounting statement (D-023).')}</article>`);
      });
      drawAll();
    },
  });

  /* ======================================================== DAILY CASH CLOSING */
  PP.route('/finance/closing', {
    title: 'Daily Cash Closing',
    perm: 'finance.close',
    render({ el, query }) {
      ensure();
      const ub = userBranches();
      const ab = PP.activeBranchId();
      const st = { branch: (ub.find((b) => b.id === (query.branch || ab)) || ub[0] || PP.db.branches[0]).id, date: /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : PP.today() };
      el.innerHTML = PP.ui.pageHead({
        title: 'Daily Cash Closing', crumbs: [['Dashboard', '#/dashboard'], ['Cash Flow'], ['Daily Cash Closing']],
        subtitle: 'Count the cash drawer at the end of the day, record the difference and lock the day. A closed day cannot be changed; corrections go into the next open day.',
      }) + `<div class="card fin-toolbar no-print"><div class="fin-toolbar-row">
          <label class="fin-inline"><span>Branch</span><select class="select" data-br>${ub.map((b) => `<option value="${b.id}" ${b.id === st.branch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          <label class="fin-inline"><span>Date</span><input type="date" class="input" data-date value="${esc(st.date)}" max="${PP.today()}"></label>
          <div class="fin-toolbar-spacer"></div><a class="btn btn-ghost" href="#/finance">${PP.icon('wallet')} Income &amp; Expenses</a></div></div>
        <div class="fin-closing mt-4"><div data-main></div><div data-tx></div></div>
        <section class="card mt-4"><div class="card-head"><h2>Past closings</h2></div><div data-past></div></section>`;

      function draw() {
        const main = $('[data-main]', el); const tx = $('[data-tx]', el);
        const existing = PP.db.cashClosings.find((c) => c.branchId === st.branch && c.date === st.date && c.status === 'Closed');
        const day = calc.cashDay(st.branch, st.date);
        tx.innerHTML = `<section class="card"><div class="card-head"><h2>Cash movements</h2><span class="muted small">${PP.fmt.dateLong(st.date)}</span></div><div class="card-body flush">
          <table class="table"><thead><tr><th scope="col">Entry</th><th scope="col">Detail</th><th scope="col" class="right">Amount</th></tr></thead><tbody>
          ${day.ins.length || day.outs.length ? [...day.ins.map((x) => `<tr><td>${PP.ui.badge('In', 'positive')} <span class="small">${esc(x.id)}</span></td><td class="small">${esc(catName(x.categoryId))}${x.note ? ` · ${esc(x.note)}` : ''}</td><td class="right mono">${signed(x.amount)}</td></tr>`), ...day.outs.map((x) => `<tr><td>${PP.ui.badge('Out', 'error')} <span class="small">${esc(x.id)}</span></td><td class="small">${esc(catName(x.categoryId))}${x.note ? ` · ${esc(x.note)}` : ''}</td><td class="right mono">${signed(-x.amount)}</td></tr>`)].join('') : `<tr><td colspan="3">${PP.ui.empty({ icon: 'banknote', title: 'No cash movements', text: 'No cash income or paid cash expenses on this day.' })}</td></tr>`}
          </tbody></table></div></section>`;
        if (st.date > PP.today()) { main.innerHTML = `<section class="card"><div class="card-body">${PP.ui.alert('error', 'A future day cannot be closed.')}</div></section>`; return; }
        if (existing) {
          main.innerHTML = `<section class="card fin-closed"><div class="card-head"><h2>${PP.icon('lock', 'class="fin-inline-icon"')} Day closed</h2>${PP.ui.badge('Closed day')}</div><div class="card-body">
            <dl class="fin-totals"><dt>Opening cash</dt><dd>${money(existing.opening)}</dd><dt>Cash in</dt><dd>${money(existing.cashIn)}</dd><dt>Cash out</dt><dd>${money(existing.cashOut)}</dd>
            <dt class="fin-strong">Expected</dt><dd class="fin-strong">${money(existing.expected)}</dd><dt>Counted</dt><dd>${money(existing.counted)}</dd><dt>Difference</dt><dd>${diffBadge(existing.difference)}</dd></dl>
            ${existing.note ? `<p class="small"><b>Note:</b> ${esc(existing.note)}</p>` : ''}
            <p class="small muted" style="margin-bottom:0">Closed by ${esc(userName(existing.closedBy))}${existing.closedAt ? ` · ${PP.fmt.stamp(existing.closedAt)}` : ''}. This day is locked and read-only.</p>
            ${Math.abs(r2(day.expected - existing.expected)) > 0.001 ? `<div class="mt-3">${PP.ui.alert('warning', `Entries changed after closing: today's records give ${money(day.expected)} expected. Later corrections belong in the next open day.`)}</div>` : ''}
          </div></section>`;
          return;
        }
        main.innerHTML = `<section class="card"><div class="card-head"><h2>Close ${esc(PP.branchName(st.branch))} · ${PP.fmt.date(st.date)}</h2>${PP.ui.badge('Open')}</div><div class="card-body">
          <form novalidate data-close class="stack">
            <div class="fin-closing-grid">
              ${PP.form.field({ name: 'opening', label: 'Opening cash (BDT)', type: 'number', rule: 'nonneg', required: true, min: 0, step: 50, value: day.opening, hint: day.openingFrom ? `Counted cash from the closing on ${PP.fmt.date(day.openingFrom)}` : 'No earlier closing for this branch' })}
              <div class="fin-stat"><span>Cash in</span><b class="mono">${money(day.cashIn)}</b><small>${day.ins.length} cash income entr${day.ins.length === 1 ? 'y' : 'ies'}</small></div>
              <div class="fin-stat"><span>Cash out</span><b class="mono">${money(day.cashOut)}</b><small>${day.outs.length} paid cash expense${day.outs.length === 1 ? '' : 's'}</small></div>
              <div class="fin-stat fin-stat-strong"><span>Expected in drawer</span><b class="mono" data-expected>${money(day.expected)}</b><small>Opening + in − out</small></div>
            </div>
            <div class="form-grid">
              ${PP.form.field({ name: 'counted', label: 'Counted cash (BDT)', type: 'number', rule: 'nonneg', required: true, min: 0, step: 1, placeholder: 'Count the drawer' })}
              <div class="field"><label>Difference</label><div class="fin-diff" data-diff>—</div></div>
              ${PP.form.field({ name: 'note', label: 'Note', type: 'textarea', rows: 2, full: true, placeholder: 'Required when the counted cash differs from the expected amount' })}
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">${PP.icon('lock')} Close day</button></div>
          </form></div></section>`;
        const form = $('[data-close]', main);
        const expected = () => r2(r2($('[name=opening]', form).value) + day.cashIn - day.cashOut);
        const upd = () => {
          $('[data-expected]', form).textContent = money(expected());
          const c = $('[name=counted]', form).value; const d = $('[data-diff]', form);
          if (c === '') { d.className = 'fin-diff'; d.textContent = '—'; return; }
          const diff = r2(Number(c) - expected());
          d.className = `fin-diff ${diff === 0 ? 'is-zero' : diff < 0 ? 'is-short' : 'is-over'}`;
          d.textContent = diff === 0 ? 'Balanced · BDT 0' : `${diff < 0 ? 'Short' : 'Over'} by ${money(Math.abs(diff))}`;
        };
        form.addEventListener('input', upd); upd();
        form.addEventListener('submit', async (e) => {
          e.preventDefault(); if (!PP.form.validate(form)) return;
          const d = PP.form.read(form); const exp = expected(); const diff = r2(Number(d.counted) - exp);
          if (diff !== 0 && !d.note) { PP.form.setError(form, 'note', 'Explain the difference before closing the day.'); $('[name=note]', form).focus(); return; }
          const ok = await PP.ui.confirm({ title: 'Close this day?', message: `${esc(PP.branchName(st.branch))}, ${PP.fmt.date(st.date)}: expected ${money(exp)}, counted ${money(d.counted)} (${diff === 0 ? 'balanced' : `${diff < 0 ? 'short' : 'over'} ${money(Math.abs(diff))}`}). The day will be locked.`, confirmLabel: 'Close day' });
          if (!ok) return;
          await PP.ui.busy($('button[type=submit]', form), () => {
            const rec = { id: PP.nextId('CLS'), branchId: st.branch, date: st.date, opening: r2(d.opening), cashIn: day.cashIn, cashOut: day.cashOut, expected: exp, counted: r2(d.counted), difference: diff, note: d.note, closedBy: user().id, approvedBy: user().id, closedAt: PP.nowStamp(), status: 'Closed' };
            PP.db.cashClosings.push(rec);
            PP.audit('Cash day closed', rec.id, `${PP.branchName(rec.branchId)} · ${rec.date} · difference ${money(diff)}`);
            PP.notify(`Cash day closed – ${PP.branchName(rec.branchId)}`, `Closed by ${user().name}. Difference ${money(diff)}.`, '#/finance/closing');
            PP.save(); PP.ui.toast(`Day closed for ${esc(PP.branchName(st.branch))}`); draw(); past.refresh();
          });
        });
      }
      const diffBadge = (v) => `<span class="fin-diff-inline ${v === 0 ? 'is-zero' : v < 0 ? 'is-short' : 'is-over'}">${v === 0 ? 'Balanced' : `${v < 0 ? 'Short' : 'Over'} ${money(Math.abs(v))}`}</span>`;
      const past = PP.ui.table($('[data-past]', el), {
        getRows: () => PP.db.cashClosings.filter((c) => ub.some((b) => b.id === c.branchId)), exportName: 'cash-closings', sortKey: 'date', sortDir: 'desc', pageSize: 5,
        filters: [{ id: 'br', label: 'All branches', options: ub.map((b) => [b.id, b.name]), match: (c, v) => c.branchId === v }],
        columns: [
          { key: 'date', label: 'Date', sort: (c) => c.date, render: (c) => `<span class="nowrap">${PP.fmt.date(c.date)}</span>`, exportValue: (c) => c.date },
          { key: 'br', label: 'Branch', render: (c) => esc(PP.branchName(c.branchId)) },
          { key: 'opening', label: 'Opening', align: 'right', render: (c) => money(c.opening), exportValue: (c) => c.opening },
          { key: 'in', label: 'Cash in', align: 'right', render: (c) => money(c.cashIn), exportValue: (c) => c.cashIn },
          { key: 'out', label: 'Cash out', align: 'right', render: (c) => money(c.cashOut), exportValue: (c) => c.cashOut },
          { key: 'exp', label: 'Expected', align: 'right', render: (c) => money(c.expected), exportValue: (c) => c.expected },
          { key: 'cnt', label: 'Counted', align: 'right', render: (c) => money(c.counted), exportValue: (c) => c.counted },
          { key: 'diff', label: 'Difference', sort: (c) => c.difference, render: (c) => diffBadge(c.difference), exportValue: (c) => c.difference },
          { key: 'by', label: 'Closed by', render: (c) => `${esc(userName(c.closedBy))}${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}`, exportValue: (c) => userName(c.closedBy) },
          { key: 'appr', label: 'Approved (checker)', render: (c) => (c.approvedBy ? `${esc(userName(c.approvedBy))}` : PP.can('finance.approve') && c.closedBy !== user().id ? `<button class="btn btn-sm" data-cls-ok="${esc(c.id)}">Approve</button>` : `<span class="badge warning">Waiting</span>`), exportValue: (c) => (c.approvedBy ? userName(c.approvedBy) : 'Waiting') },
        ],
        afterDraw: (tb) => $$('[data-cls-ok]', tb).forEach((b) => b.addEventListener('click', (ev) => {
          ev.stopPropagation(); const c = PP.db.cashClosings.find((x) => x.id === b.dataset.clsOk); const mc = PP.makerChecker(c.closedBy, 'cash closing'); if (mc) { PP.ui.toast(mc, 'error'); return; }
          c.approvedBy = user().id; c.approvedAt = PP.nowStamp(); PP.audit('Cash day approved', c.id, `${PP.branchName(c.branchId)} · ${c.date} · closed by ${userName(c.closedBy)}`); PP.save(); PP.ui.toast('Cash day approved'); past.refresh();
        })),
        onRowClick: (c) => { st.branch = c.branchId; st.date = c.date; $('[data-br]', el).value = c.branchId; $('[data-date]', el).value = c.date; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
        empty: { icon: 'lock', title: 'No closings yet', text: 'Closed days appear here.' },
      });
      $('[data-br]', el).addEventListener('change', (e) => { st.branch = e.target.value; draw(); });
      $('[data-date]', el).addEventListener('change', (e) => { if (!e.target.value) return; st.date = e.target.value; draw(); });
      draw();
    },
  });

  /* ============================================================== COMMISSIONS */
  PP.route('/commissions', {
    title: () => (PP.can('commissions.manage') ? 'Commissions' : 'My Commission'),
    render({ el, query }) {
      ensure();
      if (PP.can('commissions.manage')) return renderCommissionAdmin(el, query);
      if (PP.can('commissions.view_own')) return renderMyCommission(el);
      el.innerHTML = PP.ui.noAccess('commissions.view_own');
      return undefined;
    },
  });

  const D025_NOTE = 'Commission comes only from collected money (D-025): an invoice creates nothing; each completed payment creates an entry; pending, failed and reversed payments create none; refunds adjust it.';

  function entryColumns(showPro) {
    return [
      { key: 'date', label: 'Date', sort: (e) => e.date + e.id, render: (e) => `<span class="nowrap">${PP.fmt.date(e.date)}</span><span class="sub">${esc(e.id)}</span>`, exportValue: (e) => e.date },
      ...(showPro ? [{ key: 'pro', label: PP.t('professional'), sort: (e) => PP.proName(e.professionalId), render: (e) => esc(PP.proName(e.professionalId)) }] : []),
      { key: 'type', label: 'Type', sort: (e) => e.type, render: (e) => PP.ui.badge(typeLabel(e.type), entryTone(e.type)), exportValue: (e) => e.type },
      { key: 'pay', label: 'Payment', render: (e) => { const p = PP.find.payment(e.paymentId); return `${esc(e.paymentId || '—')}${p ? `<span class="sub">${esc(p.method)} · ${esc(p.status)}</span>` : ''}`; }, exportValue: (e) => e.paymentId },
      { key: 'inv', label: 'Invoice', render: (e) => (PP.can('billing.view') ? invLink(e.invoiceId) : esc(e.invoiceId)), exportValue: (e) => e.invoiceId },
      { key: 'base', label: 'Base', align: 'right', sort: (e) => e.base, render: (e) => signed(e.base), exportValue: (e) => e.base },
      { key: 'value', label: 'Commission', align: 'right', sort: (e) => e.value, render: (e) => signed(e.value), exportValue: (e) => e.value },
      { key: 'basis', label: 'Basis', render: (e) => `<span class="small">${esc(e.basis)}</span>` },
      { key: 'set', label: 'Settlement', render: (e) => (e.settlementId ? esc(e.settlementId) : '<span class="muted small">Unsettled</span>'), exportValue: (e) => e.settlementId || 'Unsettled' },
    ];
  }
  function settlementColumns(showPro, actions) {
    return [
      { key: 'id', label: 'Settlement', sort: (s) => s.id, render: (s) => `<b>${esc(s.id)}</b>`, exportValue: (s) => s.id },
      ...(showPro ? [{ key: 'pro', label: PP.t('professional'), sort: (s) => PP.proName(s.professionalId), render: (s) => esc(PP.proName(s.professionalId)) }] : []),
      { key: 'period', label: 'Period', sort: (s) => s.to || '', render: (s) => `<span class="small">${esc(s.period || `${PP.fmt.date(s.from)} – ${PP.fmt.date(s.to)}`)}</span>` },
      { key: 'n', label: 'Entries', align: 'right', render: (s) => String(PP.db.commissionEntries.filter((e) => e.settlementId === s.id).length) },
      { key: 'total', label: 'Total', align: 'right', sort: (s) => s.total, render: (s) => signed(s.total), exportValue: (s) => s.total },
      { key: 'status', label: 'Status', sort: (s) => s.status, render: (s) => PP.ui.badge(s.status, settlementTone(s.status)), exportValue: (s) => s.status },
      { key: 'flow', label: 'Prepared / approved / paid', render: (s) => `<span class="small">${esc(userName(s.preparedBy))}${s.approvedBy ? ` → ${esc(userName(s.approvedBy))}` : ''}${s.paidAt ? ` → paid ${PP.fmt.date(s.paidAt)} · ${esc(s.payoutMethod || '')}${s.payoutRef ? ` · ${esc(s.payoutRef)}` : ''}` : ''}</span>`, exportValue: (s) => `${userName(s.preparedBy)} / ${userName(s.approvedBy)} / ${s.paidAt || ''}` },
      ...(actions ? [{ key: 'act', label: '', render: actions }] : []),
    ];
  }
  function settlementDetail(s) {
    const entries = PP.db.commissionEntries.filter((e) => e.settlementId === s.id);
    PP.ui.modal({
      title: `Settlement ${esc(s.id)} · ${esc(PP.proName(s.professionalId))}`, size: 'lg',
      body: `<div class="row between"><div>${PP.ui.badge(s.status, settlementTone(s.status))} <span class="muted small">${esc(s.period || '')}</span></div><b class="mono">${signed(s.total)}</b></div>
        <div class="table-wrap mt-3"><table class="table"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Invoice</th><th scope="col" class="right">Base</th><th scope="col" class="right">Commission</th><th scope="col">Basis</th></tr></thead>
        <tbody>${entries.map((e) => `<tr><td>${PP.fmt.date(e.date)}</td><td>${PP.ui.badge(typeLabel(e.type), entryTone(e.type))}</td><td>${esc(e.invoiceId)}</td><td class="right mono">${signed(e.base)}</td><td class="right mono">${signed(e.value)}</td><td class="small">${esc(e.basis)}</td></tr>`).join('') || '<tr><td colspan="6">No entries</td></tr>'}</tbody></table></div>`,
      buttons: [{ label: 'Close', kind: 'ghost' }],
    });
  }

  function renderCommissionAdmin(el, query) {
    let tab = tabFrom(query, ['balances', 'entries', 'settlements', 'rules'], 'balances');
    el.innerHTML = PP.ui.pageHead({
      title: 'Commissions', crumbs: [['Dashboard', '#/dashboard'], ['Cash Flow'], ['Commissions']],
      subtitle: `${esc(PP.t('professional'))} commission from collected payments, settlements and payouts.`,
      actions: `<button class="btn btn-primary" data-prepare>${PP.icon('plus')} Prepare settlement</button>`,
    }) + `${PP.ui.alert('info', `${D025_NOTE} Settlement approval and payout are separate steps (D-025 rule 7).`)}
      <div class="card mt-4 fin-card-tabs"><div data-tabs></div><div data-body></div></div>`;
    const body = $('[data-body]', el);
    const pros = () => PP.db.professionals.filter((p) => p.status === 'Active' || PP.db.commissionEntries.some((e) => e.professionalId === p.id));
    const draw = () => {
      const sets = PP.db.settlements;
      PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'balances', label: 'Balances' }, { id: 'entries', label: 'Entries', count: PP.db.commissionEntries.length }, { id: 'settlements', label: 'Settlements', count: sets.filter((s) => s.status !== 'Paid out').length || null }, { id: 'rules', label: 'Rules' }], active: tab, onChange: (t) => { tab = t; drawBody(); } });
      drawBody();
    };
    const drawBody = () => ({ balances: drawBalances, entries: drawEntries, settlements: drawSettlements, rules: drawRules })[tab]();

    function drawBalances() {
      const rows = pros().map((p) => ({ p, s: calc.commissionSummary(p.id) }));
      PP.ui.table(body, {
        rows, exportName: 'commission-balances', sortKey: 'bal', sortDir: 'desc',
        columns: [
          { key: 'pro', label: PP.t('professional'), sort: (r) => r.p.name, render: (r) => `<b>${esc(PP.proName(r.p))}</b><span class="sub">${esc(r.p.designation || '')} · ${esc(PP.branchName(r.p.branchId))}${r.p.manualCommissionPercent != null ? ` · manual ${esc(r.p.manualCommissionPercent)}%` : ''}</span>`, exportValue: (r) => PP.proName(r.p) },
          { key: 'n', label: 'Unsettled entries', align: 'right', sort: (r) => r.s.unsettledCount, render: (r) => String(r.s.unsettledCount), exportValue: (r) => r.s.unsettledCount },
          { key: 'bal', label: 'Unsettled balance', align: 'right', sort: (r) => r.s.balance, render: (r) => `${signed(r.s.balance)}${r.s.balance < 0 ? '<span class="sub">Deducted from next settlement</span>' : ''}`, exportValue: (r) => r.s.balance },
          { key: 'month', label: 'Earned this month', align: 'right', sort: (r) => r.s.thisMonth, render: (r) => signed(r.s.thisMonth), exportValue: (r) => r.s.thisMonth },
          { key: 'open', label: 'In open settlements', align: 'right', sort: (r) => r.s.inOpen, render: (r) => money(r.s.inOpen), exportValue: (r) => r.s.inOpen },
          { key: 'paid', label: 'Paid out (all time)', align: 'right', sort: (r) => r.s.paidOut, render: (r) => `${money(r.s.paidOut)}${r.s.lastPaid ? `<span class="sub">last ${PP.fmt.date(r.s.lastPaid)}</span>` : ''}`, exportValue: (r) => r.s.paidOut },
          { key: 'act', label: '', render: (r) => `<button class="btn btn-sm" data-prep="${esc(r.p.id)}" ${r.s.unsettledCount ? '' : 'disabled'}>Prepare settlement</button>` },
        ],
        footer: (list) => `<tr><td colspan="2">Total</td><td class="right mono">${signed(r2(PP.sum(list, (r) => r.s.balance)))}</td><td class="right mono">${money(PP.sum(list, (r) => r.s.thisMonth))}</td><td class="right mono">${money(PP.sum(list, (r) => r.s.inOpen))}</td><td class="right mono">${money(PP.sum(list, (r) => r.s.paidOut))}</td><td></td></tr>`,
        afterDraw: (c) => $$('[data-prep]', c).forEach((b) => b.addEventListener('click', () => prepareModal(b.dataset.prep))),
        empty: { icon: 'coins', title: 'No commission yet', text: 'Commission appears when payments are collected.' },
      });
    }
    function drawEntries() {
      PP.ui.table(body, {
        rows: PP.db.commissionEntries, exportName: 'commission-entries', sortKey: 'date', sortDir: 'desc',
        search: { placeholder: 'Search invoice, payment, entry…', text: (e) => `${e.id} ${e.invoiceId} ${e.paymentId} ${e.basis} ${PP.proName(e.professionalId)}` },
        filters: [
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: proOptions(false), match: (e, v) => e.professionalId === v },
          { id: 'type', label: 'All types', options: [['accrual', 'Accrual'], ['reversal', 'Reversal'], ['adjustment', 'Adjustment (refund)']], match: (e, v) => e.type === v },
          { id: 'set', label: 'Settled and unsettled', options: [['open', 'Unsettled'], ['done', 'In a settlement']], match: (e, v) => (v === 'open' ? !e.settlementId : !!e.settlementId) },
          { id: 'month', label: 'All months', options: [...new Set(PP.db.commissionEntries.map((e) => PP.monthKey(e.date)))].sort().reverse().map((k) => [k, PP.fmt.month(k)]), match: (e, v) => PP.monthKey(e.date) === v },
        ],
        columns: entryColumns(true),
        footer: (list) => `<tr><td colspan="5">Total (${list.length} entries)</td><td class="right mono">${signed(r2(PP.sum(list, (e) => e.base)))}</td><td class="right mono">${signed(r2(PP.sum(list, (e) => e.value)))}</td><td colspan="2"></td></tr>`,
        empty: { icon: 'coins', title: 'No commission entries', text: 'Entries are created automatically from completed payments.' },
      });
    }
    function drawSettlements() {
      body.innerHTML = '<div class="card-body fin-flow">' + ['Draft', 'Approved', 'Paid out'].map((s, i) => `${i ? `<span class="fin-flow-arrow">${PP.icon('arrowR')}</span>` : ''}<div class="fin-flow-step">${PP.ui.badge(s, settlementTone(s))}<span class="small muted">${['Prepared from unsettled entries (commissions.manage)', 'Approved by the owner (commissions.approve)', 'Payout recorded, creates an expense (commissions.payout)'][i]}</span></div>`).join('') + '</div><div data-st></div>';
      PP.ui.table($('[data-st]', body), {
        rows: PP.db.settlements, exportName: 'settlements', sortKey: 'id', sortDir: 'desc',
        filters: [
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: proOptions(false), match: (s, v) => s.professionalId === v },
          { id: 'status', label: 'All statuses', options: [['Draft', 'Draft'], ['Approved', 'Approved'], ['Paid out', 'Paid out']], match: (s, v) => s.status === v },
        ],
        columns: settlementColumns(true, (s) => {
          const b = [`<button class="btn btn-ghost btn-sm" data-view="${esc(s.id)}">${PP.icon('eye')} View</button>`];
          if (s.status === 'Draft') {
            b.push(PP.can('commissions.approve') ? `<button class="btn btn-sm" data-approve="${esc(s.id)}">${PP.icon('check')} Approve</button>` : '<span class="small muted">Awaiting approval</span>');
            b.push(`<button class="btn btn-ghost btn-sm" data-discard="${esc(s.id)}">Discard</button>`);
          }
          if (s.status === 'Approved') b.push(PP.can('commissions.payout') ? `<button class="btn btn-sm btn-primary" data-payout="${esc(s.id)}">${PP.icon('banknote')} Record payout</button>` : '<span class="small muted">Awaiting payout</span>');
          return `<div class="row-actions">${b.join('')}</div>`;
        }),
        afterDraw: (c) => {
          $$('[data-view]', c).forEach((b) => b.addEventListener('click', () => settlementDetail(PP.db.settlements.find((s) => s.id === b.dataset.view))));
          $$('[data-approve]', c).forEach((b) => b.addEventListener('click', () => approve(b.dataset.approve)));
          $$('[data-discard]', c).forEach((b) => b.addEventListener('click', () => discard(b.dataset.discard)));
          $$('[data-payout]', c).forEach((b) => b.addEventListener('click', () => payoutModal(b.dataset.payout)));
        },
        empty: { icon: 'coins', title: 'No settlements yet', text: 'Prepare a settlement from a professional’s unsettled entries.', action: '<button class="btn btn-primary" data-prepare-empty>Prepare settlement</button>' },
      });
      const pe = $('[data-prepare-empty]', body); if (pe) pe.addEventListener('click', () => prepareModal());
    }

    function prepareModal(proId) {
      const t = PP.today(); const [mFrom] = quickRange('month');
      PP.ui.modal({
        title: 'Prepare settlement', size: 'lg',
        body: `<form class="form-grid" novalidate>
          ${PP.form.field({ name: 'professionalId', label: PP.t('professional'), type: 'select', required: true, options: pros().map((p) => [p.id, `${PP.proName(p)} · balance ${money(PP.commission.balance(p.id))}`]), value: proId || '' })}
          <div></div>
          ${PP.form.field({ name: 'from', label: 'Period from', type: 'date', required: true, value: mFrom, max: t })}
          ${PP.form.field({ name: 'to', label: 'Period to', type: 'date', required: true, value: t, max: t })}
          <div class="full" data-preview></div></form>`,
        onOpen: (b) => {
          const form = $('form', b);
          const prev = () => {
            const d = PP.form.read(form); const box = $('[data-preview]', form);
            if (!d.professionalId || !d.from || !d.to) { box.innerHTML = `<p class="muted small">Choose a ${esc(PP.tl('professional'))} and period to see the entries.</p>`; return; }
            const p = calc.settlementPreview(d.professionalId, d.from, d.to);
            const acc = p.entries.filter((e) => e.type === 'accrual'); const neg = p.entries.filter((e) => e.value < 0);
            box.innerHTML = `<div class="fin-preview"><div class="fin-preview-grid">
              <div class="fin-stat"><span>Entries</span><b class="mono">${p.entries.length}</b><small>${acc.length} accruals · ${neg.length} negative</small></div>
              <div class="fin-stat"><span>Carried over</span><b class="mono">${p.carried}</b><small>Unsettled entries before the period</small></div>
              <div class="fin-stat fin-stat-strong"><span>Settlement total</span><b class="mono">${signed(p.total)}</b><small>Negatives are deducted (D-026)</small></div></div>
              ${p.total <= 0 && p.entries.length ? PP.ui.alert('warning', 'The total is zero or negative, so there is nothing to pay. The balance carries into the next settlement.') : ''}
              ${!p.entries.length ? PP.ui.alert('info', 'No unsettled entries up to this date.') : ''}</div>`;
          };
          form.addEventListener('change', prev); prev();
        },
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create draft settlement', kind: 'primary', onClick: async ({ body: b }) => {
          const form = $('form', b); if (!PP.form.validate(form)) return false;
          const d = PP.form.read(form);
          if (d.from > d.to) { PP.form.setError(form, 'from', 'The start must be on or before the end.'); return false; }
          const p = calc.settlementPreview(d.professionalId, d.from, d.to);
          if (!p.entries.length) { PP.form.setError(form, 'professionalId', 'There are no unsettled entries for this period.'); return false; }
          if (p.total <= 0) { PP.form.setError(form, 'professionalId', 'The total is zero or negative; nothing to settle yet.'); return false; }
          await PP.sleep(300);
          const s = { id: PP.nextId('SET'), professionalId: d.professionalId, period: `${PP.fmt.date(d.from)} – ${PP.fmt.date(d.to)}`, from: d.from, to: d.to, total: p.total, status: 'Draft', preparedBy: user().id, preparedAt: PP.nowStamp(), approvedBy: null, approvedAt: null, paidAt: null, payoutMethod: null, payoutRef: null };
          p.entries.forEach((e) => { e.settlementId = s.id; });
          PP.db.settlements.push(s);
          PP.audit('Settlement prepared', s.id, `${PP.proName(s.professionalId)} · ${money(s.total)} · ${p.entries.length} entries`);
          PP.save(); PP.ui.toast(`Draft settlement ${s.id} created for ${money(s.total)}`); tab = 'settlements'; draw();
        } }],
      });
    }
    async function approve(id) {
      const s = PP.db.settlements.find((x) => x.id === id);
      if (!PP.can('commissions.approve')) { PP.ui.toast('Your role cannot approve settlements.', 'error'); return; }
      const mc = PP.makerChecker(s.preparedBy, 'settlement'); if (mc) { PP.ui.toast(mc, 'error', 4200); return; }
      const same = false;
      const ok = await PP.ui.confirm({ title: `Approve ${esc(s.id)}?`, message: `${esc(PP.proName(s.professionalId))} · ${money(s.total)}. Approving does not pay it; the payout is recorded separately (D-025 rule 7).${same ? '<br><br><b>Note:</b> you also prepared this settlement. Where the clinic has enough staff, a different person should approve it.' : ''}`, confirmLabel: 'Approve settlement' });
      if (!ok) return;
      s.status = 'Approved'; s.approvedBy = user().id; s.approvedAt = PP.nowStamp();
      PP.audit('Settlement approved', s.id, money(s.total)); PP.save(); PP.ui.toast(`${esc(s.id)} approved. Record the payout when it is paid.`); draw();
    }
    async function discard(id) {
      const s = PP.db.settlements.find((x) => x.id === id);
      const ok = await PP.ui.confirm({ title: `Discard draft ${esc(s.id)}?`, message: 'Its entries return to the unsettled balance. The discarded draft stays in the audit log.', confirmLabel: 'Discard draft', danger: true });
      if (!ok) return;
      PP.db.commissionEntries.filter((e) => e.settlementId === s.id).forEach((e) => { e.settlementId = null; });
      s.status = 'Discarded'; s.discardedBy = user().id; s.discardedAt = PP.nowStamp();
      PP.audit('Settlement discarded', s.id, money(s.total)); PP.save(); PP.ui.toast(`${esc(s.id)} discarded`, 'warning'); draw();
    }
    function payoutModal(id) {
      const s = PP.db.settlements.find((x) => x.id === id); const pro = PP.find.professional(s.professionalId) || {};
      PP.ui.modal({
        title: `Record payout · ${esc(s.id)}`,
        body: `<form class="form-grid" novalidate>
          <div class="full">${PP.ui.alert('info', `${esc(PP.proName(s.professionalId))} · approved total <b>${money(s.total)}</b>. The payout creates an expense in “${esc(catName('CAT-E-COM'))}”.`)}</div>
          ${PP.form.field({ name: 'method', label: 'Payout method', type: 'select', placeholder: false, options: PP.PAYMENT_METHODS, value: 'Bank transfer' })}
          ${PP.form.field({ name: 'ref', label: 'Reference', required: true, placeholder: 'e.g. bank TRX or bKash TrxID' })}
          ${PP.form.field({ name: 'date', label: 'Payout date', type: 'date', required: true, value: PP.today(), max: PP.today() })}
          ${PP.form.field({ name: 'branchId', label: 'Expense branch', type: 'select', placeholder: false, options: PP.db.branches.map((b) => [b.id, b.name]), value: pro.branchId || PP.db.branches[0].id })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Record payout', kind: 'primary', onClick: async ({ body: b }) => {
          const form = $('form', b); if (!PP.form.validate(form)) return false;
          const d = PP.form.read(form);
          if (d.method === 'Cash' && isClosed(d.branchId, d.date)) { PP.form.setError(form, 'date', `${PP.fmt.date(d.date)} is closed for ${PP.branchName(d.branchId)}.`); return false; }
          await PP.sleep(350);
          s.status = 'Paid out'; s.paidAt = d.date; s.payoutMethod = d.method; s.payoutRef = d.ref; s.paidBy = user().id;
          const exp = { id: PP.nextId('EXP'), date: d.date, categoryId: 'CAT-E-COM', amount: s.total, branchId: d.branchId, method: d.method, paymentStatus: 'Paid', paidDate: d.date, note: `Commission payout ${s.id} · ${PP.proName(s.professionalId)}`, createdBy: user().id, reversalOf: null, source: { type: 'payout', id: s.id }, at: PP.nowStamp() };
          PP.db.expenses.push(exp);
          PP.audit('Commission paid out', s.id, `${money(s.total)} · ${d.method} · ${d.ref} · expense ${exp.id}`);
          PP.save(); PP.ui.toast(`Payout recorded. Expense ${exp.id} created.`); draw();
        } }],
      });
    }

    function drawRules() {
      const cfg = PP.db.settings.commission;
      const services = PP.db.services.filter((s) => s.status === 'Active');
      const canEdit = PP.can('commissions.manage') || PP.can('settings.manage');
      const manualPros = PP.db.professionals.filter((p) => p.manualCommissionPercent != null && p.manualCommissionPercent !== '');
      body.innerHTML = `<div class="card-body"><div class="fin-rules">
        <form novalidate data-rules class="stack">
          <h3>Clinic commission model</h3>
          <p class="muted small" style="margin:0">One model for the whole clinic. There are no separate rules per branch, service or ${esc(PP.tl('professional'))}; where a different rate is wanted, a manual percentage can be entered on the invoice (D-026). Commission is calculated on money received, with no tax in the calculation.</p>
          <div class="form-grid">
            ${PP.form.field({ name: 'model', label: 'Model', type: 'select', placeholder: false, options: COMMISSION_MODELS, value: cfg.model })}
            ${PP.form.field({ name: 'cycle', label: 'Settlement cycle', type: 'select', placeholder: false, options: ['Monthly', 'Fortnightly', 'Weekly', 'On demand'], value: cfg.cycle || 'Monthly' })}
            <div data-for="percent mixed per_service">${PP.form.field({ name: 'percent', label: 'Percentage (%)', type: 'number', min: 0, max: 100, step: 0.5, rule: 'nonneg', required: true, value: cfg.percent, hint: 'Default rate; also used for services without their own rate.' })}</div>
            <div data-for="fixed mixed">${PP.form.field({ name: 'fixedPerVisit', label: 'Fixed amount per visit (BDT)', type: 'number', min: 0, step: 10, rule: 'nonneg', required: true, value: cfg.fixedPerVisit, hint: 'Earned in proportion to the share of the invoice collected.' })}</div>
          </div>
          <div data-for="per_service"><h4>Rate per service</h4><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Service</th><th scope="col" class="right">Rate %</th></tr></thead><tbody>
            ${services.map((s) => `<tr><td>${esc(s.name)}<span class="sub">${esc(s.category)}</span></td><td class="right"><div class="field fin-fee-cell"><input class="input fin-num" type="number" min="0" max="100" step="0.5" data-rule="nonneg" name="rate__${esc(s.id)}" value="${cfg.serviceRates[s.id] != null ? esc(cfg.serviceRates[s.id]) : ''}" placeholder="${esc(cfg.percent)} (default)" aria-label="${esc(s.name)} rate"><div class="error"></div></div></td></tr>`).join('')}
          </tbody></table></div></div>
          <div data-for="tiered"><h4>Tiers (monthly money collected by the ${esc(PP.tl('professional'))})</h4><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Up to (BDT)</th><th scope="col" class="right">Rate %</th><th scope="col"></th></tr></thead><tbody data-tiers></tbody></table></div>
            <button type="button" class="btn btn-sm mt-2" data-add-tier>${PP.icon('plus')} Add tier</button><div class="form-note mt-2">Marginal: each rate applies to the part of the month's collection inside its band. Leave the last “up to” blank for no limit.</div></div>
          ${canEdit ? `<div class="form-actions"><button type="submit" class="btn btn-primary">${PP.icon('check')} Save commission rules</button></div>` : ''}
          <p class="form-note" style="margin:0">Changes apply to payments collected from now on. Existing entries keep the basis they were calculated with.</p>
        </form>
        <aside class="stack">
          <section class="fin-example"><h3>Confirmed example (D-025)</h3>
            <table class="table fin-example-table"><tbody><tr><td>Invoice</td><td class="right mono">BDT 1,000</td></tr><tr><td>Commission rate</td><td class="right mono">20%</td></tr>
            <tr><td>Payment 1 · BDT 500</td><td class="right mono">BDT 100</td></tr><tr><td>Payment 2 · BDT 500</td><td class="right mono">BDT 100</td></tr></tbody>
            <tfoot><tr><td>Total commission</td><td class="right mono">BDT 200</td></tr></tfoot></table>
            <p class="small muted">Creating the invoice gives nothing. Each payment gives commission on the money collected.</p></section>
          <section class="fin-example"><h3>Try the current model</h3>
            <div class="form-grid fin-try">${PP.form.field({ name: 'tryInv', label: 'Invoice (BDT)', type: 'number', value: 1000, min: 0 })}${PP.form.field({ name: 'tryPays', label: 'Payments (comma separated)', value: '500, 500' })}</div>
            <div data-try class="mt-3"></div></section>
          <section class="fin-example"><h3>Manual percentages in use</h3>
            ${manualPros.length ? `<ul class="fin-plain">${manualPros.map((p) => `<li>${esc(PP.proName(p))} · <b>${esc(p.manualCommissionPercent)}%</b></li>`).join('')}</ul>` : '<p class="small muted">None.</p>'}
            <p class="small muted" style="margin-bottom:0">A manual % on an invoice overrides the clinic model for that invoice. Where the manual % is entered is still open (PD-036).</p></section>
        </aside></div></div>`;
      const form = $('[data-rules]', body);
      let tiers = PP.clone(cfg.tiers || []);
      const drawTiers = () => {
        $('[data-tiers]', form).innerHTML = tiers.map((t, i) => `<tr><td><div class="field fin-fee-cell"><input class="input fin-num" type="number" min="0" step="1000" data-rule="positive" name="tierUp__${i}" value="${t.upTo == null ? '' : esc(t.upTo)}" placeholder="No limit" aria-label="Tier ${i + 1} up to"><div class="error"></div></div></td><td class="right"><div class="field fin-fee-cell"><input class="input fin-num" type="number" min="0" max="100" step="0.5" data-rule="nonneg" required name="tierRate__${i}" value="${esc(t.rate)}" aria-label="Tier ${i + 1} rate"><div class="error"></div></div></td><td>${tiers.length > 1 ? `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm-tier="${i}" aria-label="Remove tier">${PP.icon('trash')}</button>` : ''}</td></tr>`).join('');
        $$('[data-rm-tier]', form).forEach((b) => b.addEventListener('click', () => { readTiers(); tiers.splice(Number(b.dataset.rmTier), 1); drawTiers(); }));
      };
      const readTiers = () => { tiers = tiers.map((t, i) => { const up = $(`[name="tierUp__${i}"]`, form).value; return { upTo: up === '' ? null : Number(up), rate: Number($(`[name="tierRate__${i}"]`, form).value) || 0 }; }); };
      const syncModel = () => {
        const m = $('[name=model]', form).value;
        $$('[data-for]', form).forEach((x) => { const on = x.dataset.for.split(' ').includes(m); x.classList.toggle('hidden', !on); $$('input', x).forEach((i) => { i.disabled = !on || !canEdit; }); });
        tryIt();
      };
      const tryIt = () => {
        const box = $('[data-try]', body); const amount = Number($('[name=tryInv]', body).value) || 0;
        const pays = String($('[name=tryPays]', body).value).split(',').map((x) => Number(x.trim())).filter((x) => x > 0);
        if (!amount || !pays.length) { box.innerHTML = '<p class="small muted">Enter an invoice amount and at least one payment.</p>'; return; }
        const live = PP.db.settings.commission;
        const draftCfg = readCfg(true);
        PP.db.settings.commission = draftCfg; // temporary, restored below
        try {
          const inv = { id: '__try__', professionalId: null, lines: [{ serviceId: null, qty: 1, unitPrice: amount }], discount: 0 };
          let tot = 0;
          const rowsHtml = pays.map((p, i) => { const c = PP.commission.calc(inv, p, PP.today()); tot += c.value; return `<tr><td>Payment ${i + 1} · ${money(p)}</td><td class="right mono">${money(c.value)}</td></tr>`; }).join('');
          box.innerHTML = `<table class="table fin-example-table"><tbody>${rowsHtml}</tbody><tfoot><tr><td>Total</td><td class="right mono">${money(r2(tot))}</td></tr></tfoot></table>${pays.reduce((a, b) => a + b, 0) > amount ? '<p class="small fin-due">Payments exceed the invoice; in the app this is blocked.</p>' : ''}`;
        } finally { PP.db.settings.commission = live; }
      };
      const readCfg = (lenient) => {
        if (!$('[data-tiers]', form).children.length) drawTiers();
        readTiers();
        const d = PP.form.read(form); const rates = {};
        Object.entries(d).forEach(([k, v]) => { if (k.startsWith('rate__') && v !== '') rates[k.slice(6)] = Number(v); });
        return { ...cfg, model: d.model, cycle: d.cycle, percent: d.percent === '' && lenient ? cfg.percent : Number(d.percent), fixedPerVisit: d.fixedPerVisit === '' && lenient ? cfg.fixedPerVisit : Number(d.fixedPerVisit), serviceRates: d.model === 'per_service' || !lenient ? rates : cfg.serviceRates, tiers: PP.clone(tiers) };
      };
      drawTiers();
      $('[data-add-tier]', form).addEventListener('click', () => { readTiers(); const last = tiers[tiers.length - 1]; tiers.splice(tiers.length - (last && last.upTo == null ? 1 : 0), 0, { upTo: null, rate: last ? last.rate : cfg.percent }); drawTiers(); });
      if (!canEdit) $$('input, select', form).forEach((i) => { i.disabled = true; });
      form.addEventListener('change', syncModel); form.addEventListener('input', tryIt);
      $$('[name=tryInv], [name=tryPays]', body).forEach((i) => i.addEventListener('input', tryIt));
      syncModel();
      form.addEventListener('submit', (e) => {
        e.preventDefault(); if (!PP.form.validate(form)) return;
        const next = readCfg(false);
        if (next.model === 'tiered') {
          const ups = next.tiers.map((t) => t.upTo);
          const bad = ups.some((u, i) => (u == null && i !== ups.length - 1) || (i > 0 && u != null && ups[i - 1] != null && u <= ups[i - 1]));
          if (bad) { PP.ui.toast('Tier limits must increase, and only the last tier may have no limit.', 'error'); return; }
          if (ups[ups.length - 1] != null) next.tiers.push({ upTo: null, rate: next.tiers[next.tiers.length - 1].rate });
        }
        if (next.percent > 100) { PP.form.setError(form, 'percent', 'Enter a percentage from 0 to 100.'); return; }
        PP.ui.busy($('button[type=submit]', form), () => {
          const before = `${cfg.model} ${cfg.percent}%`;
          PP.db.settings.commission = next;
          PP.audit('Commission rules changed', 'settings.commission', `${before} → ${next.model} ${next.percent}%`);
          PP.save(); PP.ui.toast('Commission rules saved. They apply to payments collected from now on.'); drawRules();
        });
      });
    }

    $('[data-prepare]', el).addEventListener('click', () => prepareModal());
    draw();
  }

  function renderMyCommission(el) {
    const pid = user().professionalId; const pro = pid ? PP.find.professional(pid) : null;
    el.innerHTML = PP.ui.pageHead({ title: 'My Commission', crumbs: [['Dashboard', '#/dashboard'], ['My Commission']], subtitle: pro ? `${esc(PP.proName(pro))} · ${esc(pro.designation || '')}` : '' });
    if (!pro) { el.innerHTML += `<div class="card">${PP.ui.empty({ icon: 'user', title: `Your account is not linked to a ${PP.tl('professional')}`, text: 'Ask the clinic administrator to link your user account to your professional profile.' })}</div>`; return; }
    const s = calc.commissionSummary(pid);
    el.innerHTML += `<div class="grid grid-4">
        ${PP.ui.kpi({ label: 'Unsettled balance', value: signed(s.balance), hint: s.balance < 0 ? 'Will be deducted from your next settlement (D-026)' : `${s.unsettledCount} entries not yet settled`, tone: s.balance < 0 ? 'error' : 'positive', icon: 'coins' })}
        ${PP.ui.kpi({ label: 'Earned this month', value: signed(s.thisMonth), hint: 'From payments collected', tone: 'info', icon: 'chart' })}
        ${PP.ui.kpi({ label: 'Approved, awaiting payout', value: money(s.awaitingPayout), tone: 'lavender', icon: 'clock' })}
        ${PP.ui.kpi({ label: 'Paid out (all time)', value: money(s.paidOut), hint: s.lastPaid ? `Last payout ${PP.fmt.date(s.lastPaid)}` : 'No payouts yet', tone: 'warning', icon: 'banknote' })}
      </div><div class="mt-4">${PP.ui.alert('info', D025_NOTE)}</div>
      <section class="card mt-4"><div class="card-head"><h2>My commission entries</h2></div><div data-e></div></section>
      <section class="card mt-4"><div class="card-head"><h2>My settlements</h2></div><div data-s></div></section>`;
    PP.ui.table($('[data-e]', el), {
      rows: PP.db.commissionEntries.filter((e) => e.professionalId === pid), exportName: 'my-commission', sortKey: 'date', sortDir: 'desc',
      filters: [
        { id: 'type', label: 'All types', options: [['accrual', 'Accrual'], ['reversal', 'Reversal'], ['adjustment', 'Adjustment']], match: (e, v) => e.type === v },
        { id: 'set', label: 'Settled and unsettled', options: [['open', 'Unsettled'], ['done', 'In a settlement']], match: (e, v) => (v === 'open' ? !e.settlementId : !!e.settlementId) },
      ],
      columns: entryColumns(false),
      footer: (list) => `<tr><td colspan="5">Total</td><td class="right mono">${signed(r2(PP.sum(list, (e) => e.value)))}</td><td colspan="2"></td></tr>`,
      empty: { icon: 'coins', title: 'No commission yet', text: 'Entries appear when payments on your invoices are collected.' },
    });
    PP.ui.table($('[data-s]', el), {
      rows: PP.db.settlements.filter((x) => x.professionalId === pid && x.status !== 'Discarded'), exportName: 'my-settlements', sortKey: 'id', sortDir: 'desc',
      columns: settlementColumns(false, (x) => `<button class="btn btn-ghost btn-sm" data-view="${esc(x.id)}">${PP.icon('eye')} View</button>`),
      afterDraw: (c) => $$('[data-view]', c).forEach((b) => b.addEventListener('click', () => settlementDetail(PP.db.settlements.find((x) => x.id === b.dataset.view)))),
      empty: { icon: 'coins', title: 'No settlements yet' },
    });
  }

  /* ================================================================== REPORTS */
  function reportState(query) {
    const quick = ['month', 'last', '30', '90'].includes(query.range) ? query.range : 'month';
    const [from, to] = quickRange(quick);
    return { quick, from, to, branch: PP.activeBranchId() };
  }

  PP.route('/reports/collections', {
    title: 'Collection Report',
    perm: 'reports.view',
    render({ el, query }) {
      ensure();
      const st = reportState(query); st.tab = tabFrom(query, ['daily', 'monthly', 'service', 'method'], 'daily');
      el.innerHTML = PP.ui.pageHead({ title: 'Collection Report', crumbs: [['Dashboard', '#/dashboard'], ['Reports'], ['Collection Report']], subtitle: 'Money actually collected: completed payments minus refunds. Pending and failed payments are not included.', actions: `<button class="btn" data-print>${PP.icon('printer')} PDF</button>` + (PP.can('finance.close') ? `<a class="btn btn-ghost" href="#/finance/closing">${PP.icon('lock')} Cash closing</a>` : '') })
        + '<div data-bar></div><div class="grid grid-4 mt-4" data-kpis></div><div class="card mt-4 fin-card-tabs"><div data-tabs></div><div class="card-body" data-chart></div><div data-table></div></div>';
      const C = colors();
      const drawAll = () => {
        $('[data-bar]', el).innerHTML = periodBar(st); bindPeriod(el, st, drawAll);
        const k = calc.collections(st.from, st.to, st.branch);
        $('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Total collected', value: money(k.total), hint: `${k.paymentCount} payments${k.refunds ? ` · refunds ${money(k.refunds)}` : ''}`, tone: 'positive', icon: 'banknote' })
          + PP.ui.kpi({ label: 'Cash', value: money(k.cash), tone: 'info', icon: 'wallet' })
          + PP.ui.kpi({ label: 'Online', value: money(k.online), hint: `bKash, Nagad, card, bank${k.advance ? ` · advance applied ${money(k.advance)}` : ''}`, tone: 'lavender', icon: 'globe' })
          + PP.ui.kpi({ label: 'Outstanding', value: money(k.outstanding), hint: `${k.withDues} of ${k.invoiceCount} invoices in the period`, tone: 'error', icon: 'alert' });
        PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'daily', label: 'Daily' }, { id: 'monthly', label: 'Monthly' }, { id: 'service', label: 'By service' }, { id: 'method', label: 'By payment method' }], active: st.tab, onChange: (t) => { st.tab = t; drawTab(); } });
        drawTab();
      };
      let current = { title: '', headers: [], rows: [] };
      function drawTab() {
        const chart = $('[data-chart]', el); const tbl = $('[data-table]', el);
        if (st.tab === 'daily') {
          const days = calc.daily(st.from, st.to, st.branch); const shown = days.slice(-31);
          PP.chart.bars(chart, { labels: shown.map((d) => PP.fmt.dateShort(d.date).slice(0, 2)), groups: [{ name: 'Cash', values: shown.map((d) => Math.max(0, d.cash)), color: C.action }, { name: 'Online', values: shown.map((d) => Math.max(0, d.online)), color: C.lav }, { name: 'Advance', values: shown.map((d) => Math.max(0, d.advance)), color: C.grey }], stacked: true, format: short });
          if (days.length > 31) chart.insertAdjacentHTML('beforeend', '<p class="small muted">The chart shows the last 31 days; the table lists every day.</p>');
          const rows = days.filter((d) => d.total || d.count).reverse();
          current = { title: 'Daily collections', headers: ['Date', 'Payments', 'Cash', 'Online', 'Advance', 'Total'], rows: rows.map((d) => [d.date, d.count, d.cash, d.online, d.advance, d.total]) };
          PP.ui.table(tbl, { rows, exportName: 'collections-daily', columns: [
            { key: 'date', label: 'Date', sort: (d) => d.date, render: (d) => PP.fmt.dateLong(d.date), exportValue: (d) => d.date },
            { key: 'count', label: 'Payments', align: 'right', sort: (d) => d.count, render: (d) => String(d.count) },
            { key: 'cash', label: 'Cash', align: 'right', sort: (d) => d.cash, render: (d) => signed(d.cash), exportValue: (d) => d.cash },
            { key: 'online', label: 'Online', align: 'right', sort: (d) => d.online, render: (d) => signed(d.online), exportValue: (d) => d.online },
            { key: 'adv', label: 'Advance', align: 'right', render: (d) => money(d.advance), exportValue: (d) => d.advance },
            { key: 'total', label: 'Total', align: 'right', sort: (d) => d.total, render: (d) => `<b>${signed(d.total)}</b>`, exportValue: (d) => d.total },
          ], footer: (l) => `<tr><td>Total</td><td class="right mono">${PP.sum(l, (d) => d.count)}</td><td class="right mono">${money(PP.sum(l, (d) => d.cash))}</td><td class="right mono">${money(PP.sum(l, (d) => d.online))}</td><td class="right mono">${money(PP.sum(l, (d) => d.advance))}</td><td class="right mono">${money(PP.sum(l, (d) => d.total))}</td></tr>`, empty: { icon: 'chart', title: 'No collections in this period' } });
        } else if (st.tab === 'monthly') {
          const months = calc.monthly(PP.monthKey(st.to), 6, st.branch);
          PP.chart.bars(chart, { labels: months.map((m) => m.label.slice(0, 3)), groups: [{ name: 'Collected', values: months.map((m) => Math.max(0, m.total)), color: C.action }, { name: 'Outstanding', values: months.map((m) => m.outstanding), color: C.error }], format: short });
          chart.insertAdjacentHTML('beforeend', `<p class="small muted">Six months ending ${esc(PP.fmt.month(PP.monthKey(st.to)))}. Outstanding = dues still open on invoices dated in that month.</p>`);
          current = { title: 'Monthly collections', headers: ['Month', 'Cash', 'Online', 'Advance', 'Refunds', 'Collected', 'Outstanding'], rows: months.map((m) => [m.label, m.cash, m.online, m.advance, m.refunds, m.total, m.outstanding]) };
          PP.ui.table(tbl, { rows: months.slice().reverse(), exportName: 'collections-monthly', columns: [
            { key: 'm', label: 'Month', render: (m) => esc(m.label), exportValue: (m) => m.key },
            { key: 'cash', label: 'Cash', align: 'right', render: (m) => money(m.cash), exportValue: (m) => m.cash },
            { key: 'online', label: 'Online', align: 'right', render: (m) => money(m.online), exportValue: (m) => m.online },
            { key: 'adv', label: 'Advance', align: 'right', render: (m) => money(m.advance), exportValue: (m) => m.advance },
            { key: 'ref', label: 'Refunds', align: 'right', render: (m) => money(m.refunds), exportValue: (m) => m.refunds },
            { key: 'total', label: 'Collected', align: 'right', render: (m) => `<b>${signed(m.total)}</b>`, exportValue: (m) => m.total },
            { key: 'out', label: 'Outstanding', align: 'right', render: (m) => `<span class="${m.outstanding ? 'fin-due' : ''}">${money(m.outstanding)}</span>`, exportValue: (m) => m.outstanding },
          ] });
        } else if (st.tab === 'service') {
          const list = calc.byService(st.from, st.to, st.branch); const top = list.slice(0, 8);
          PP.chart.bars(chart, { labels: top.map((s) => (s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name)), groups: [{ name: 'Collected', values: top.map((s) => Math.max(0, s.amount)), color: C.action }], format: short });
          chart.insertAdjacentHTML('beforeend', '<p class="small muted">Each payment is shared across the invoice lines in proportion to their totals.</p>');
          const total = PP.sum(list, (s) => s.amount);
          current = { title: 'Collections by service', headers: ['Service', 'Payments', 'Refunds', 'Collected', 'Share %'], rows: list.map((s) => [s.name, s.payments, s.refunds, s.amount, total ? r2((s.amount / total) * 100) : 0]) };
          PP.ui.table(tbl, { rows: list, exportName: 'collections-by-service', search: { placeholder: 'Search service…', text: (s) => s.name }, columns: [
            { key: 'name', label: 'Service', sort: (s) => s.name, render: (s) => esc(s.name) },
            { key: 'n', label: 'Payments', align: 'right', sort: (s) => s.payments, render: (s) => String(s.payments) },
            { key: 'ref', label: 'Refunds', align: 'right', render: (s) => money(s.refunds), exportValue: (s) => s.refunds },
            { key: 'amt', label: 'Collected', align: 'right', sort: (s) => s.amount, render: (s) => `<b>${signed(s.amount)}</b>`, exportValue: (s) => s.amount },
            { key: 'share', label: 'Share', align: 'right', sort: (s) => s.amount, render: (s) => `<span class="fin-share"><span style="width:${total ? Math.max(0, Math.min(100, (s.amount / total) * 100)).toFixed(1) : 0}%"></span></span> ${total ? PP.fmt.pct((s.amount / total) * 100) : '0%'}`, exportValue: (s) => (total ? r2((s.amount / total) * 100) : 0) },
          ], empty: { icon: 'tag', title: 'No collections in this period' } });
        } else {
          const list = calc.byMethod(st.from, st.to, st.branch);
          PP.chart.bars(chart, { labels: list.map((m) => m.method), groups: [{ name: 'Received', values: list.map((m) => m.received), color: C.action }, { name: 'Refunded', values: list.map((m) => m.refunds), color: C.error }], format: short });
          const total = PP.sum(list, (m) => m.net);
          current = { title: 'Collections by payment method', headers: ['Method', 'Payments', 'Received', 'Refunded', 'Net', 'Share %'], rows: list.map((m) => [m.method, m.count, m.received, m.refunds, m.net, total ? r2((m.net / total) * 100) : 0]) };
          PP.ui.table(tbl, { rows: list, exportName: 'collections-by-method', columns: [
            { key: 'm', label: 'Method', render: (m) => `${esc(m.method)}${m.method === 'Advance' ? '<span class="sub">Advance deposits applied to invoices</span>' : PP.isOnline(m.method) ? '<span class="sub">Online</span>' : ''}`, exportValue: (m) => m.method },
            { key: 'n', label: 'Payments', align: 'right', render: (m) => String(m.count) },
            { key: 'rec', label: 'Received', align: 'right', render: (m) => money(m.received), exportValue: (m) => m.received },
            { key: 'ref', label: 'Refunded', align: 'right', render: (m) => money(m.refunds), exportValue: (m) => m.refunds },
            { key: 'net', label: 'Net', align: 'right', render: (m) => `<b>${signed(m.net)}</b>`, exportValue: (m) => m.net },
            { key: 'share', label: 'Share', align: 'right', render: (m) => (total ? PP.fmt.pct((m.net / total) * 100) : '0%'), exportValue: (m) => (total ? r2((m.net / total) * 100) : 0) },
          ], footer: (l) => `<tr><td>Total</td><td class="right mono">${PP.sum(l, (m) => m.count)}</td><td class="right mono">${money(PP.sum(l, (m) => m.received))}</td><td class="right mono">${money(PP.sum(l, (m) => m.refunds))}</td><td class="right mono">${money(PP.sum(l, (m) => m.net))}</td><td></td></tr>` });
        }
      }
      $('[data-print]', el).addEventListener('click', () => {
        const k = calc.collections(st.from, st.to, st.branch);
        printSheet(`<article class="fin-sheet">${sheetHead('Collection Report', `${PP.fmt.date(st.from)} – ${PP.fmt.date(st.to)} · ${esc(branchLabel(st.branch))}`)}
          <div class="fin-sheet-kpis"><div><span>Total collected</span><b>${money(k.total)}</b></div><div><span>Cash</span><b>${money(k.cash)}</b></div><div><span>Online</span><b>${money(k.online)}</b></div><div><span>Outstanding</span><b>${money(k.outstanding)}</b></div></div>
          <h3 class="fin-sheet-h3">${esc(current.title)}</h3>${sheetTable(current.headers.map((h, i) => ({ label: h, right: i > 0 })), current.rows.map((r) => r.map((c, i) => (i > 0 && typeof c === 'number' && !/Payments|Share/.test(current.headers[i]) ? money(c) : esc(c)))))}
          ${sheetFoot('')}</article>`);
      });
      drawAll();
    },
  });

  PP.route('/reports/finance', {
    title: 'Financial Summary',
    perm: 'reports.view',
    render({ el }) {
      ensure();
      const nowKey = PP.monthKey(PP.today());
      const st = { fromKey: addMonths(nowKey, -5), toKey: nowKey, branch: PP.activeBranchId() };
      el.innerHTML = PP.ui.pageHead({ title: 'Financial Summary', crumbs: [['Dashboard', '#/dashboard'], ['Reports'], ['Financial Summary']], subtitle: 'Branch-wise income, expenses and net result. A cash-based summary, not a formal accounting statement (D-023).', actions: `<button class="btn" data-csv>${PP.icon('download')} Excel (CSV)</button><button class="btn" data-print>${PP.icon('printer')} PDF</button>` })
        + `<div class="card fin-toolbar no-print"><div class="fin-toolbar-row">
          <label class="fin-inline"><span>From month</span><input type="month" class="input" data-fm value="${st.fromKey}" max="${nowKey}"></label>
          <label class="fin-inline"><span>To month</span><input type="month" class="input" data-tm value="${st.toKey}" max="${nowKey}"></label>
          <label class="fin-inline"><span>Branch</span><select class="select" data-br>${[['ALL', 'All branches'], ...userBranches().map((b) => [b.id, b.name])].map(([v, l]) => `<option value="${v}" ${st.branch === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div></div>
        <div class="grid grid-4 mt-4" data-kpis></div>
        <div class="fin-report-grid mt-4"><section class="card"><div class="card-head"><h2>Monthly income vs expenses</h2></div><div class="card-body" data-chart></div></section>
          <section class="card"><div class="card-head"><h2>Profit / loss summary</h2></div><div class="card-body" data-pl></div></section></div>
        <section class="card mt-4"><div class="card-head"><h2>Branch-wise summary</h2></div><div data-branches></div></section>
        <section class="card mt-4"><div class="card-head"><h2>Monthly detail</h2></div><div data-months></div></section>`;
      const C = colors();
      const range = () => [`${st.fromKey}-01`, monthEnd(st.toKey)];
      const draw = () => {
        const [a, b] = range(); const f = calc.finance(a, b, st.branch); const months = calc.monthlyFinance(st.fromKey, st.toKey, st.branch);
        const branchIds = (st.branch === 'ALL' ? userBranches() : PP.db.branches.filter((x) => x.id === st.branch)).map((x) => x.id);
        const br = calc.branchSummary(a, b, branchIds);
        $('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Income', value: money(f.income), tone: 'positive', icon: 'arrowDown' }) + PP.ui.kpi({ label: 'Expenses (paid)', value: money(f.expenses), tone: 'warning', icon: 'arrowUp' })
          + PP.ui.kpi({ label: f.net >= 0 ? 'Net profit' : 'Net loss', value: signed(f.net), hint: f.income ? `Margin ${PP.fmt.pct((f.net / f.income) * 100)}` : '', tone: f.net >= 0 ? 'info' : 'error', icon: 'chart' })
          + PP.ui.kpi({ label: 'Unpaid expenses', value: money(f.unpaid), hint: 'Not in the net result', tone: 'lavender', icon: 'clock' });
        PP.chart.bars($('[data-chart]', el), { labels: months.map((m) => m.label.slice(0, 3)), groups: [{ name: 'Income', values: months.map((m) => Math.max(0, m.income)), color: C.action }, { name: 'Expenses', values: months.map((m) => Math.max(0, m.expenses)), color: C.warn }], format: short });
        $('[data-pl]', el).innerHTML = `<table class="table fin-pl"><tbody>
          <tr class="fin-pl-head"><td>Income</td><td></td></tr>${f.incomeByCat.map((c) => `<tr><td class="fin-pl-indent">${esc(c.name)}</td><td class="right mono">${signed(c.amount)}</td></tr>`).join('') || '<tr><td class="fin-pl-indent muted">None</td><td></td></tr>'}
          <tr class="fin-pl-sum"><td>Total income</td><td class="right mono">${money(f.income)}</td></tr>
          <tr class="fin-pl-head"><td>Expenses</td><td></td></tr>${f.expenseByCat.map((c) => `<tr><td class="fin-pl-indent">${esc(c.name)}</td><td class="right mono">${signed(c.amount)}</td></tr>`).join('') || '<tr><td class="fin-pl-indent muted">None</td><td></td></tr>'}
          <tr class="fin-pl-sum"><td>Total expenses</td><td class="right mono">${money(f.expenses)}</td></tr>
          <tr class="fin-pl-net ${f.net < 0 ? 'is-loss' : ''}"><td>Net ${f.net >= 0 ? 'profit' : 'loss'}</td><td class="right mono">${signed(f.net)}</td></tr></tbody></table>`;
        PP.ui.table($('[data-branches]', el), { rows: br, exportName: 'finance-by-branch', columns: [
          { key: 'name', label: 'Branch', render: (x) => `<b>${esc(x.name)}</b>` },
          { key: 'inc', label: 'Income', align: 'right', render: (x) => money(x.income), exportValue: (x) => x.income },
          { key: 'exp', label: 'Expenses (paid)', align: 'right', render: (x) => money(x.expenses), exportValue: (x) => x.expenses },
          { key: 'unp', label: 'Unpaid expenses', align: 'right', render: (x) => money(x.unpaid), exportValue: (x) => x.unpaid },
          { key: 'net', label: 'Net', align: 'right', render: (x) => `<b>${signed(x.net)}</b>`, exportValue: (x) => x.net },
        ], footer: (l) => `<tr><td>Total</td><td class="right mono">${money(PP.sum(l, (x) => x.income))}</td><td class="right mono">${money(PP.sum(l, (x) => x.expenses))}</td><td class="right mono">${money(PP.sum(l, (x) => x.unpaid))}</td><td class="right mono">${signed(r2(PP.sum(l, (x) => x.net)))}</td></tr>` });
        PP.ui.table($('[data-months]', el), { rows: months.slice().reverse(), exportName: 'finance-monthly', columns: [
          { key: 'm', label: 'Month', render: (m) => esc(m.label), exportValue: (m) => m.key },
          { key: 'inc', label: 'Income', align: 'right', render: (m) => money(m.income), exportValue: (m) => m.income },
          { key: 'exp', label: 'Expenses (paid)', align: 'right', render: (m) => money(m.expenses), exportValue: (m) => m.expenses },
          { key: 'net', label: 'Net', align: 'right', render: (m) => `<b>${signed(m.net)}</b>`, exportValue: (m) => m.net },
          { key: 'chg', label: 'Income vs previous month', align: 'right', render: (m) => { const i = months.indexOf(m); const p = months[i - 1]; if (!p || !p.income) return '—'; const d = ((m.income - p.income) / Math.abs(p.income)) * 100; return `<span class="${d < 0 ? 'fin-neg' : 'fin-pos'}">${d >= 0 ? '+' : ''}${PP.fmt.pct(d)}</span>`; } },
        ] });
        return { f, months, br };
      };
      let snap = draw();
      const redraw = () => { snap = draw(); };
      $('[data-fm]', el).addEventListener('change', (e) => { if (!e.target.value) return; if (e.target.value > st.toKey) { PP.ui.toast('The start month must be on or before the end month.', 'error'); e.target.value = st.fromKey; return; } st.fromKey = e.target.value; redraw(); });
      $('[data-tm]', el).addEventListener('change', (e) => { if (!e.target.value) return; if (e.target.value < st.fromKey) { PP.ui.toast('The end month must be on or after the start month.', 'error'); e.target.value = st.toKey; return; } st.toKey = e.target.value; redraw(); });
      $('[data-br]', el).addEventListener('change', (e) => { st.branch = e.target.value; redraw(); });
      $('[data-csv]', el).addEventListener('click', () => {
        const rows = [['Section', 'Name', 'Income', 'Expenses (paid)', 'Unpaid expenses', 'Net']];
        snap.br.forEach((x) => rows.push(['Branch', x.name, x.income, x.expenses, x.unpaid, x.net]));
        snap.months.forEach((m) => rows.push(['Month', m.label, m.income, m.expenses, m.unpaid, m.net]));
        snap.f.incomeByCat.forEach((c) => rows.push(['Income category', c.name, c.amount, '', '', '']));
        snap.f.expenseByCat.forEach((c) => rows.push(['Expense category', c.name, '', c.amount, '', '']));
        rows.push(['Total', branchLabel(st.branch), snap.f.income, snap.f.expenses, snap.f.unpaid, snap.f.net]);
        csv('financial-summary', rows);
      });
      $('[data-print]', el).addEventListener('click', () => {
        const { f, months, br } = snap;
        printSheet(`<article class="fin-sheet">${sheetHead('Financial Summary', `${esc(PP.fmt.month(st.fromKey))} – ${esc(PP.fmt.month(st.toKey))} · ${esc(branchLabel(st.branch))}`)}
          <div class="fin-sheet-kpis"><div><span>Income</span><b>${money(f.income)}</b></div><div><span>Expenses (paid)</span><b>${money(f.expenses)}</b></div><div><span>Net ${f.net >= 0 ? 'profit' : 'loss'}</span><b>${money(f.net)}</b></div><div><span>Unpaid expenses</span><b>${money(f.unpaid)}</b></div></div>
          <h3 class="fin-sheet-h3">Branch-wise</h3>${sheetTable(['Branch', { label: 'Income', right: true }, { label: 'Expenses', right: true }, { label: 'Net', right: true }], br.map((x) => [esc(x.name), money(x.income), money(x.expenses), money(x.net)]))}
          <h3 class="fin-sheet-h3">Monthly</h3>${sheetTable(['Month', { label: 'Income', right: true }, { label: 'Expenses', right: true }, { label: 'Net', right: true }], months.map((m) => [esc(m.label), money(m.income), money(m.expenses), money(m.net)]))}
          <h3 class="fin-sheet-h3">Profit / loss</h3>${sheetTable(['Line', { label: 'Amount', right: true }], [...f.incomeByCat.map((c) => [`Income · ${esc(c.name)}`, money(c.amount)]), ...f.expenseByCat.map((c) => [`Expense · ${esc(c.name)}`, money(-c.amount)])], [`Net ${f.net >= 0 ? 'profit' : 'loss'}`, money(f.net)])}
          ${sheetFoot('Cash-based summary, not a formal accounting statement (D-023).')}</article>`);
      });
    },
  });

  PP.route('/reports/appointments', {
    title: 'Appointment Report',
    perm: 'reports.view',
    render({ el, query }) {
      ensure();
      const st = reportState(query);
      el.innerHTML = PP.ui.pageHead({ title: 'Appointment Report', crumbs: [['Dashboard', '#/dashboard'], ['Reports'], ['Appointment Report']], subtitle: `Appointments by status and by ${esc(PP.tl('professional'))}. No-show rate = no-shows ÷ (completed + no-shows).` })
        + '<div data-bar></div><div class="grid grid-4 mt-4" data-kpis></div><div class="fin-report-grid mt-4"><section class="card"><div class="card-head"><h2>By status</h2></div><div class="card-body" data-c1></div></section><section class="card"><div class="card-head"><h2 data-c2t></h2></div><div class="card-body" data-c2></div></section></div><section class="card mt-4"><div class="card-head"><h2 data-tt></h2></div><div data-table></div></section>';
      const C = colors();
      const draw = () => {
        $('[data-bar]', el).innerHTML = periodBar(st); bindPeriod(el, st, draw);
        const r = calc.appointments(st.from, st.to, st.branch); const t = r.totals;
        $('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Appointments', value: String(t.total), hint: `${PP.fmt.date(st.from)} – ${PP.fmt.date(st.to)}`, tone: 'info', icon: 'calendar' })
          + PP.ui.kpi({ label: 'Completed', value: String(t.completed), hint: t.total ? `${PP.fmt.pct((t.completed / t.total) * 100)} of all` : '', tone: 'positive', icon: 'checkCircle' })
          + PP.ui.kpi({ label: 'Cancelled', value: String(t.cancelled), tone: 'warning', icon: 'x' })
          + PP.ui.kpi({ label: 'No-show rate', value: PP.fmt.pct(t.noShowRate), hint: `${t.noShow} no-shows`, tone: t.noShowRate > 10 ? 'error' : 'lavender', icon: 'alert' });
        const statuses = Object.keys(r.byStatus).sort((a, b) => r.byStatus[b] - r.byStatus[a]);
        if (statuses.length) PP.chart.bars($('[data-c1]', el), { labels: statuses, groups: [{ name: 'Appointments', values: statuses.map((s) => r.byStatus[s]), color: C.action }] });
        else $('[data-c1]', el).innerHTML = PP.ui.empty({ icon: 'calendar', title: 'No appointments in this period' });
        $('[data-c2t]', el).textContent = `By ${PP.tl('professional')}`; $('[data-tt]', el).textContent = `${PP.t('professional')} breakdown`;
        if (r.byPro.length) PP.chart.bars($('[data-c2]', el), { labels: r.byPro.map((p) => PP.proShort(p.proId).replace(/^Dr\.\s*/, '')), groups: [{ name: 'Completed', values: r.byPro.map((p) => p.completed), color: C.action }, { name: 'Cancelled', values: r.byPro.map((p) => p.cancelled), color: C.warn }, { name: 'No-show', values: r.byPro.map((p) => p.noShow), color: C.error }, { name: 'Upcoming', values: r.byPro.map((p) => p.upcoming + p.rescheduled), color: C.grey }], stacked: true });
        else $('[data-c2]', el).innerHTML = PP.ui.empty({ icon: 'stethoscope', title: 'No data' });
        PP.ui.table($('[data-table]', el), { rows: r.byPro, exportName: 'appointments-by-professional', sortKey: 'total', sortDir: 'desc', columns: [
          { key: 'name', label: PP.t('professional'), sort: (p) => p.name, render: (p) => `<b>${esc(p.name)}</b>` },
          { key: 'total', label: 'Total', align: 'right', sort: (p) => p.total, render: (p) => String(p.total) },
          { key: 'completed', label: 'Completed', align: 'right', sort: (p) => p.completed, render: (p) => String(p.completed) },
          { key: 'cancelled', label: 'Cancelled', align: 'right', sort: (p) => p.cancelled, render: (p) => String(p.cancelled) },
          { key: 'noShow', label: 'No-show', align: 'right', sort: (p) => p.noShow, render: (p) => String(p.noShow) },
          { key: 'upcoming', label: 'Upcoming / other', align: 'right', sort: (p) => p.upcoming, render: (p) => String(p.upcoming + p.rescheduled) },
          { key: 'rate', label: 'No-show rate', align: 'right', sort: (p) => p.noShowRate, render: (p) => `<span class="${p.noShowRate > 10 ? 'fin-neg' : ''}">${PP.fmt.pct(p.noShowRate)}</span>`, exportValue: (p) => p.noShowRate },
        ], footer: (l) => `<tr><td>Total</td><td class="right mono">${PP.sum(l, (p) => p.total)}</td><td class="right mono">${PP.sum(l, (p) => p.completed)}</td><td class="right mono">${PP.sum(l, (p) => p.cancelled)}</td><td class="right mono">${PP.sum(l, (p) => p.noShow)}</td><td class="right mono">${PP.sum(l, (p) => p.upcoming + p.rescheduled)}</td><td class="right mono">${PP.fmt.pct(t.noShowRate)}</td></tr>`, empty: { icon: 'calendar', title: 'No appointments in this period' } });
      };
      draw();
    },
  });
})();
