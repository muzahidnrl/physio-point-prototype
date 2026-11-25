/* Physio Point HTML prototype — core.
   Mock data only, stored in the browser (localStorage). Never connect to real patient data (D-006).
   Classic script (no modules) so pages also open from file://. Everything hangs off window.PP. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  PP.version = 'prototype-0.2.0'; // bump when the seed data changes, so browsers re-seed
  const STORE_KEY = window.PP_STORE_KEY || 'pp-prototype-v1'; // the super admin app sets its own key
  PP.STORE_KEY = STORE_KEY;

  /* ------------------------------------------------------------------ utils */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  PP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  PP.$ = (sel, root) => (root || document).querySelector(sel);
  PP.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  PP.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  PP.clone = (o) => JSON.parse(JSON.stringify(o));
  PP.sum = (arr, fn) => arr.reduce((t, x) => t + (fn ? fn(x) : x), 0);
  PP.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  PP.initials = (name) => String(name || '?').replace(/^(Dr\.?\s+)/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  PP.stripHtml = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  /* ----------------------------------------------------------- dates/times */
  const pad = (n) => String(n).padStart(2, '0');
  PP.isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  PP.parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  PP.today = () => PP.isoOf(new Date());
  PP.addDays = (iso, n) => { const d = PP.parseISO(iso); d.setDate(d.getDate() + n); return PP.isoOf(d); };
  PP.diffDays = (a, b) => Math.round((PP.parseISO(b) - PP.parseISO(a)) / 86400000);
  PP.dow = (iso) => PP.parseISO(iso).getDay(); // 0 = Sunday … 5 = Friday
  PP.monthKey = (iso) => iso.slice(0, 7);
  PP.monthStart = (iso) => iso.slice(0, 8) + '01';
  PP.nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  PP.nowStamp = () => new Date().toISOString();
  PP.toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  PP.fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  PP.DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  PP.MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  PP.fmt = {
    date(iso) { if (!iso) return '—'; const d = PP.parseISO(iso.slice(0, 10)); return `${pad(d.getDate())} ${PP.MONTHS[d.getMonth()]} ${d.getFullYear()}`; },
    dateShort(iso) { if (!iso) return '—'; const d = PP.parseISO(iso.slice(0, 10)); return `${pad(d.getDate())} ${PP.MONTHS[d.getMonth()]}`; },
    dateLong(iso) { const d = PP.parseISO(iso); return `${PP.DAYS[d.getDay()].slice(0, 3)}, ${PP.fmt.date(iso)}`; },
    month(key) { const [y, m] = key.split('-').map(Number); return `${PP.MONTHS[m - 1]} ${y}`; },
    time(t) { if (!t) return '—'; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${pad(h)}:${pad(m)} ${ap}`; },
    stamp(s) { if (!s) return '—'; const d = new Date(s); return `${PP.fmt.date(PP.isoOf(d))}, ${PP.fmt.time(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`; },
    num(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); },
    money(n) {
      const v = Number(n || 0); const neg = v < 0; const abs = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const style = PP.db && PP.db.settings && PP.db.settings.currencyStyle === 'symbol' ? '৳ ' : 'BDT ';
      return `${neg ? '−' : ''}${style}${abs}`;
    },
    age(dob) {
      if (!dob) return '—'; const t = PP.parseISO(PP.today()); const b = PP.parseISO(dob);
      let m = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth()); if (t.getDate() < b.getDate()) m--;
      const y = Math.floor(m / 12); const mo = m % 12;
      return y < 1 ? `${mo} month${mo === 1 ? '' : 's'}` : mo ? `${y} years ${mo} month${mo === 1 ? '' : 's'}` : `${y} years`;
    },
    pct(n) { return `${PP.round2(n)}%`; },
  };

  /* -------------------------------------------------------------- events */
  const handlers = {};
  PP.on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); };
  PP.emit = (evt, data) => (handlers[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  /* ---------------------------------------------------------------- store */
  PP.load = function () {
    let data = null; let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); data = JSON.parse(raw || 'null'); } catch (e) { data = null; }
    if (!data || data.__version !== PP.version) {
      data = PP.seedData();             // defined in data.js
      data.__version = PP.version;
      PP.db = data;
      PP.save();
    }
    PP.db = data;
    if (raw && data.__version === PP.version) PP._lastJson = raw;
    PP.applySeedExtensions();
    return data;
  };
  /** Registers extra seed data for a module. Runs once per stored dataset (also on data seeded by another page). */
  PP.seedExtensions = PP.seedExtensions || [];
  PP.registerSeed = function (name, fn) { PP.seedExtensions.push({ name, fn }); };
  PP.applySeedExtensions = function () {
    const db = PP.db; db.__ext = db.__ext || {}; let changed = false;
    PP.seedExtensions.forEach((x) => { if (db.__ext[x.name]) return; try { x.fn(db, PP.rng(x.name.length * 7919 + 17)); db.__ext[x.name] = true; changed = true; } catch (e) { console.error('Seed extension failed: ' + x.name, e); } });
    if (changed) PP.save();
  };

  PP.save = function () {
    const json = JSON.stringify(PP.db);
    if (json !== PP._lastJson) { // skip identical writes, so open tabs do not wake each other up for nothing
      try { localStorage.setItem(STORE_KEY, json); PP._lastJson = json; } catch (e) { console.warn('Could not save prototype data', e); }
    }
    PP.emit('data:changed');
  };
  PP.resetData = function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    PP.load();
  };
  PP.nextId = function (prefix, width) {
    const c = PP.db.counters; c[prefix] = (c[prefix] || 0) + 1;
    return `${prefix}-${String(c[prefix]).padStart(width || 6, '0')}`;
  };
  PP.audit = function (action, target, detail) {
    const u = PP.currentUser();
    PP.db.audit.unshift({ id: PP.nextId('AUD'), at: PP.nowStamp(), userId: u ? u.id : null, userName: u ? u.name : 'System', action, target: target || '', detail: detail || '' });
    if (PP.db.audit.length > 400) PP.db.audit.length = 400;
  };
  PP.notify = function (title, text, link) {
    PP.db.notifications.unshift({ id: PP.nextId('NTF'), at: PP.nowStamp(), title, text: text || '', link: link || '', read: false });
  };

  /* -------------------------------------------------------------- lookups */
  const byId = (coll, id) => (PP.db[coll] || []).find((x) => x.id === id) || null;
  PP.find = {
    patient: (id) => byId('patients', id),
    professional: (id) => byId('professionals', id),
    service: (id) => byId('services', id),
    branch: (id) => byId('branches', id),
    room: (id) => byId('rooms', id),
    user: (id) => byId('users', id),
    appointment: (id) => byId('appointments', id),
    request: (id) => byId('requests', id),
    invoice: (id) => byId('invoices', id),
    payment: (id) => byId('payments', id),
    visit: (id) => byId('visits', id),
    prescription: (id) => byId('prescriptions', id),
    template: (id) => byId('templates', id),
    sessionPlan: (id) => byId('sessionPlans', id),
    exercise: (id) => byId('exercises', id),
  };
  PP.patientName = (id) => { const p = PP.find.patient(id); return p ? p.name : '—'; };
  PP.proName = (idOrObj) => {
    const p = typeof idOrObj === 'string' ? PP.find.professional(idOrObj) : idOrObj;
    if (!p) return '—';
    return (p.title ? p.title + ' ' : '') + p.name;
  };
  PP.proShort = (idOrObj) => {
    const p = typeof idOrObj === 'string' ? PP.find.professional(idOrObj) : idOrObj;
    if (!p) return '—';
    return (p.title ? p.title + ' ' : '') + p.name.split(' ')[0];
  };
  PP.serviceName = (id) => { const s = PP.find.service(id); return s ? s.name : '—'; };
  PP.branchName = (id) => { const b = PP.find.branch(id); return b ? b.name : '—'; };
  PP.activeBranchId = () => (PP.db.session && PP.db.session.branchId) || 'ALL';
  PP.inBranch = (rec) => { const b = PP.activeBranchId(); return b === 'ALL' || !rec.branchId || rec.branchId === b; };
  PP.professionalsInBranch = () => PP.db.professionals.filter((p) => p.status === 'Active' && PP.inBranch({ branchId: p.branchId }));

  /* --------------------------------------------------------- terminology */
  // Business type supplies default terminology (D-020). "Therapist" is configuration, never code.
  PP.businessTypes = {
    physiotherapy: { label: 'Physiotherapy clinic', professional: 'Therapist', professionals: 'Therapists', org: 'Clinic' },
    medical: { label: 'Medical clinic', professional: 'Doctor', professionals: 'Doctors', org: 'Clinic' },
    dental: { label: 'Dental clinic', professional: 'Dentist', professionals: 'Dentists', org: 'Clinic' },
    rehab: { label: 'Rehabilitation centre', professional: 'Rehab Specialist', professionals: 'Rehab Specialists', org: 'Centre' },
    wellness: { label: 'Wellness centre', professional: 'Practitioner', professionals: 'Practitioners', org: 'Centre' },
  };
  PP.t = function (key) {
    const s = PP.db.settings; const over = (s.terminology || {})[key];
    if (over) return over;
    const bt = PP.businessTypes[s.businessType] || PP.businessTypes.physiotherapy;
    return bt[key] || key;
  };
  PP.tl = (key) => PP.t(key).toLowerCase();

  /* ------------------------------------------------------- roles/permissions */
  // Default roles (customer-configurable later). A role is NOT a professional type (D-020).
  PP.PERMISSIONS = [
    ['dashboard.view', 'View dashboard'], ['appointments.view', 'View appointments'], ['appointments.manage', 'Create and edit appointments'],
    ['requests.review', 'Confirm or reject online requests'], ['patients.view', 'View patients'], ['patients.edit', 'Register and edit patients'],
    ['clinical.write', 'Record clinical visits'], ['prescriptions.issue', 'Issue prescriptions'], ['templates.manage', 'Manage condition templates'],
    ['billing.view', 'View invoices and dues'], ['billing.manage', 'Create invoices and record payments'], ['billing.refund', 'Refund payments'],
    ['finance.manage', 'Record income and expenses'], ['finance.close', 'Close the cash day'], ['commissions.view_own', 'View own commission'],
    ['commissions.manage', 'Prepare commission settlements'], ['commissions.approve', 'Approve settlements'], ['commissions.payout', 'Record payouts'],
    ['services.manage', 'Manage services and prices'], ['professionals.manage', 'Manage professionals and schedules'], ['users.manage', 'Manage users and roles'],
    ['settings.manage', 'Manage clinic settings'], ['reports.view', 'View reports'], ['audit.view', 'View audit log'],
    ['queue.manage', 'Run the queue and check-in desk'], ['packages.manage', 'Sell and manage packages'], ['exercises.manage', 'Manage the exercise library'],
    ['referrals.manage', 'Manage referrals'], ['feedback.view', 'View patient feedback'], ['inventory.manage', 'Manage inventory and suppliers'],
    ['payroll.manage', 'Manage payroll'], ['lab.manage', 'Manage lab orders and results'], ['support.use', 'Contact vendor support'],
    ['clinical.view', 'View clinical records, prescriptions and reports'], ['professionals.view', 'View the professional directory and availability'],
    ['appointments.view_all', 'See every professional’s appointments'], ['patients.view_all', 'See every patient (not only own patients)'],
  ];
  PP.can = function (perm) {
    const u = PP.currentUser(); if (!u) return false;
    const role = (PP.db.roles || []).find((r) => r.id === u.role);
    return !!role && (role.permissions.includes('*') || role.permissions.includes(perm));
  };
  PP.currentUser = () => (PP.db && PP.db.session ? PP.find.user(PP.db.session.userId) : null);
  /* Record scope (D-032): a user linked to a professional, without the "view all" permission, sees only their own work. */
  PP.ownProId = (kind) => { const u = PP.currentUser(); if (!u || !u.professionalId) return null; return PP.can(kind === 'patients' ? 'patients.view_all' : 'appointments.view_all') ? null : u.professionalId; };
  /** A professional may open a patient only when the patient is under their treatment (assigned, booked, seen or prescribed by them). */
  PP.canSeePatient = function (pid) {
    const own = PP.ownProId('patients'); if (!own) return true;
    const p = PP.find.patient(pid); if (!p) return false;
    const mine = (x) => x.patientId === pid && x.professionalId === own;
    return p.assignedProfessionalId === own || PP.db.appointments.some(mine) || PP.db.visits.some(mine) || PP.db.prescriptions.some(mine) || (PP.db.sessionPlans || []).some(mine);
  };
  /** Renders a "not your patient" notice and returns true when the current user may not see this patient's records. */
  PP.denyPatient = function (el, pid) {
    if (PP.canSeePatient(pid)) return false;
    el.innerHTML = '<div class="card">' + PP.ui.empty({ icon: 'lock', title: 'Not your patient', text: 'You can see a patient’s records only while the patient is under your treatment.', action: '<a class="btn" href="#/patients">My patients</a>' }) + '</div>';
    return true;
  };

  /* ----------------------------------------------------------- scheduling */
  // Blueprint rule: blocked times include leave, breaks, confirmed appointments and clinic closures.
  // Online requests (Pending) never block a slot; only confirmation reserves it.
  PP.BLOCKING = ['Confirmed', 'Scheduled', 'Checked in', 'In session', 'Completed'];
  PP.sched = {
    window(proId, iso) {
      const p = PP.find.professional(proId); if (!p) return null;
      const closure = PP.db.closures.find((c) => c.date === iso);
      if (closure) return { closed: true, reason: `Clinic closed: ${closure.reason}` };
      const leave = PP.db.leaves.find((l) => l.professionalId === proId && ['Approved', 'Pending'].includes(l.status) && iso >= l.from && iso <= l.to);
      if (leave) return { closed: true, reason: `On leave: ${leave.reason}` };
      const day = p.schedule[PP.dow(iso)];
      if (!day || !day.on) return { closed: true, reason: `${PP.DAYS[PP.dow(iso)]}: not working` };
      return { closed: false, start: day.start, end: day.end, breakStart: day.breakStart, breakEnd: day.breakEnd };
    },
    conflicts(proId, iso, start, end, excludeId) {
      const out = []; const w = PP.sched.window(proId, iso);
      if (!w) return ['Unknown professional'];
      if (w.closed) return [w.reason];
      const s = PP.toMin(start); const e = PP.toMin(end);
      if (e <= s) out.push('End time must be after start time');
      if (s < PP.toMin(w.start) || e > PP.toMin(w.end)) out.push(`Outside working hours (${PP.fmt.time(w.start)} – ${PP.fmt.time(w.end)})`);
      if (w.breakStart && s < PP.toMin(w.breakEnd) && e > PP.toMin(w.breakStart)) out.push(`Overlaps break (${PP.fmt.time(w.breakStart)} – ${PP.fmt.time(w.breakEnd)})`);
      PP.db.appointments.forEach((a) => {
        if (a.id === excludeId || a.professionalId !== proId || a.date !== iso || !PP.BLOCKING.includes(a.status)) return;
        if (s < PP.toMin(a.end) && e > PP.toMin(a.start)) out.push(`Overlaps ${a.id} · ${PP.patientName(a.patientId)} (${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)})`);
      });
      return out;
    },
    slots(proId, iso, duration, excludeId) {
      const w = PP.sched.window(proId, iso); if (!w || w.closed) return [];
      const step = PP.db.settings.slotMinutes || 30; const list = [];
      for (let m = PP.toMin(w.start); m + duration <= PP.toMin(w.end); m += step) {
        const st = PP.fromMin(m); const en = PP.fromMin(m + duration);
        const c = PP.sched.conflicts(proId, iso, st, en, excludeId);
        const isBreak = w.breakStart && m < PP.toMin(w.breakEnd) && m + duration > PP.toMin(w.breakStart);
        if (isBreak && m >= PP.toMin(w.breakStart) && m < PP.toMin(w.breakEnd)) continue; // hide slots inside the break
        list.push({ start: st, end: en, free: c.length === 0, reason: c[0] || '' });
      }
      return list;
    },
  };

  /* ---------------------------------------------------------------- billing */
  PP.PAYMENT_METHODS = ['Cash', 'bKash', 'Nagad', 'Bank transfer', 'Card'];
  PP.isOnline = (method) => method !== 'Cash' && method !== 'Advance';
  PP.bill = {
    lineTotal: (l) => PP.round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)),
    totals(inv) {
      const gross = PP.round2(PP.sum(inv.lines, PP.bill.lineTotal));
      const discount = PP.round2(Number(inv.discount) || 0);
      const payable = PP.round2(Math.max(0, gross - discount));
      const pays = PP.db.payments.filter((p) => p.invoiceId === inv.id && p.status === 'Completed');
      const paid = PP.round2(PP.sum(pays.filter((p) => p.type === 'payment'), (p) => p.amount));
      const refunded = PP.round2(PP.sum(pays.filter((p) => p.type === 'refund'), (p) => p.amount));
      const net = PP.round2(paid - refunded);
      // Blueprint rule: dues = payable − net posted payments
      const due = PP.round2(Math.max(0, payable - net));
      let status = 'Unpaid';
      if (inv.status === 'Void') status = 'Void';
      else if (payable === 0 || due === 0) status = refunded > 0 && net <= 0 ? 'Refunded' : 'Paid';
      else if (net > 0) status = 'Partly paid';
      return { gross, discount, payable, paid, refunded, net, due, status };
    },
    /** Records a payment. Creates the income entry (D-023) and the commission accrual (D-025/D-026). */
    recordPayment({ invoiceId, amount, method, date, status, note, silent }) {
      const inv = PP.find.invoice(invoiceId); if (!inv) throw new Error('Invoice not found');
      const pay = {
        id: PP.nextId('PAY'), invoiceId, patientId: inv.patientId, branchId: inv.branchId, type: 'payment',
        amount: PP.round2(Number(amount)), method, date: date || PP.today(), status: status || 'Completed', note: note || '', at: PP.nowStamp(),
      };
      PP.db.payments.push(pay);
      if (pay.status === 'Completed') PP.bill._postEffects(pay, inv);
      if (!silent) PP.audit('Payment recorded', invoiceId, `${PP.fmt.money(pay.amount)} · ${method} · ${pay.status}`);
      return pay;
    },
    /** Marks a pending payment as completed (e.g. a bKash confirmation arrives). */
    completePayment(paymentId) {
      const pay = PP.find.payment(paymentId); if (!pay || pay.status !== 'Pending') return;
      pay.status = 'Completed'; PP.bill._postEffects(pay, PP.find.invoice(pay.invoiceId));
      PP.audit('Payment completed', pay.invoiceId, `${PP.fmt.money(pay.amount)} · ${pay.method}`);
    },
    failPayment(paymentId) {
      const pay = PP.find.payment(paymentId); if (!pay || pay.status !== 'Pending') return;
      pay.status = 'Failed'; PP.audit('Payment failed', pay.invoiceId, `${PP.fmt.money(pay.amount)} · ${pay.method}`);
    },
    /** Reverses a completed payment: income reversed, commission reversed (D-025 rule 5). */
    reversePayment(paymentId, reason) {
      const pay = PP.find.payment(paymentId); if (!pay || pay.status !== 'Completed' || pay.type !== 'payment') return;
      pay.status = 'Reversed'; pay.reverseReason = reason || '';
      // An 'Advance' payment posted no income (the advance was income when received), so there is nothing to reverse.
      if (pay.method !== 'Advance') PP.db.incomes.push({ id: PP.nextId('INC'), date: PP.today(), branchId: pay.branchId, categoryId: 'CAT-I-REV', amount: -pay.amount, method: pay.method, source: { type: 'reversal', id: pay.id }, note: `Reversal of ${pay.id}`, auto: true });
      PP.commission.reverseFor(pay, 'reversal');
      PP.audit('Payment reversed', pay.invoiceId, `${pay.id} · ${reason || ''}`);
    },
    /** Refunds part or all of a completed payment (D-025 rule 6). */
    refund({ paymentId, amount, method, reason, date }) {
      const orig = PP.find.payment(paymentId); if (!orig) throw new Error('Payment not found');
      const inv = PP.find.invoice(orig.invoiceId);
      const ref = { id: PP.nextId('PAY'), invoiceId: orig.invoiceId, patientId: orig.patientId, branchId: orig.branchId, type: 'refund', refundOf: orig.id, amount: PP.round2(Number(amount)), method: method || orig.method, date: date || PP.today(), status: 'Completed', note: reason || '', at: PP.nowStamp() };
      PP.db.payments.push(ref);
      PP.db.incomes.push({ id: PP.nextId('INC'), date: ref.date, branchId: ref.branchId, categoryId: 'CAT-I-REF', amount: -ref.amount, method: ref.method, source: { type: 'refund', id: ref.id }, note: `Refund on ${inv.id}`, auto: true });
      PP.commission.adjustForRefund(orig, ref);
      PP.audit('Refund recorded', inv.id, `${PP.fmt.money(ref.amount)} · ${reason || ''}`);
      return ref;
    },
    /** Voids an invoice that has no net collected money. Records stay; nothing is deleted. */
    voidInvoice(invoiceId, reason) {
      const inv = PP.find.invoice(invoiceId); if (!inv) throw new Error('Invoice not found');
      if (PP.bill.totals(inv).net > 0) throw new Error('Refund the collected money before voiding this invoice.');
      inv.status = 'Void'; inv.voidReason = reason || ''; PP.audit('Invoice voided', inv.id, reason || '');
    },
    _postEffects(pay, inv) {
      if (pay.method !== 'Advance') {
        PP.db.incomes.push({ id: PP.nextId('INC'), date: pay.date, branchId: pay.branchId, categoryId: 'CAT-I-PAT', amount: pay.amount, method: pay.method, source: { type: 'payment', id: pay.id }, note: `Payment on ${inv.id}`, auto: true });
      }
      PP.commission.accrueFor(pay, inv);
    },
  };

  /* ----------------------------------------------------------- commission */
  // CONFIRMED rules: D-025 (only on collected money, proportional, refunds adjust, approval ≠ payout, audit trail)
  // and D-026 (all models; base = money received, no tax; one professional per invoice; package on receipt;
  // advance when finalised; negative balance after payout; manual % allowed, no per-branch/service/professional rules).
  PP.commission = {
    /**
     * Commission for `amount` collected on `inv` (D-025: only money actually received).
     * Lab-test lines use the rate set on each test in the Test Catalogue (D-034); other lines use the clinic model.
     * A discount lowers the money received, so it lowers the commission in the same proportion.
     */
    calc(inv, amount, onDate) {
      const lines = inv.lines || [];
      const labLines = lines.filter((l) => l.kind === 'lab' || l.labTestId);
      if (!labLines.length) return PP.commission.calcBase(inv, amount, onDate);
      const gross = PP.sum(lines, PP.bill.lineTotal) || 1;
      const labGross = PP.sum(labLines, PP.bill.lineTotal);
      let labVal = 0;
      labLines.forEach((l) => {
        const t = (PP.db.labTests || []).find((x) => x.id === l.labTestId); const v = t ? Number(t.commissionValue) || 0 : 0;
        if (!v) return;
        labVal += t.commissionType === 'fixed' ? v * (Number(l.qty) || 1) * amount / gross : amount * PP.bill.lineTotal(l) / gross * v / 100;
      });
      const restAmt = amount * (1 - labGross / gross);
      const rest = restAmt > 0.005 ? PP.commission.calcBase(Object.assign({}, inv, { lines: lines.filter((l) => !labLines.includes(l)) }), restAmt, onDate) : { value: 0, basis: '' };
      return { value: PP.round2(labVal + rest.value), basis: ['Lab: rate per test', rest.value ? rest.basis : ''].filter(Boolean).join(' + ') };
    },
    /** The clinic's commission model (or a manual %) for non-lab money. */
    calcBase(inv, amount, onDate) {
      const cfg = PP.db.settings.commission; const pro = PP.find.professional(inv.professionalId);
      const manual = inv.manualCommissionPercent != null && inv.manualCommissionPercent !== '' ? Number(inv.manualCommissionPercent)
        : pro && pro.manualCommissionPercent != null && pro.manualCommissionPercent !== '' ? Number(pro.manualCommissionPercent) : null;
      const payable = PP.bill.totals(inv).payable || 1;
      const share = amount / payable; // proportional part of the invoice that this money represents
      if (manual != null) return { value: PP.round2(amount * manual / 100), basis: `Manual ${manual}%` };
      const pct = () => PP.round2(amount * cfg.percent / 100);
      const fixed = () => PP.round2(cfg.fixedPerVisit * share);
      const perService = () => {
        const gross = PP.sum(inv.lines, PP.bill.lineTotal) || 1;
        return PP.round2(PP.sum(inv.lines, (l) => {
          const rate = cfg.serviceRates[l.serviceId] != null ? cfg.serviceRates[l.serviceId] : cfg.percent;
          return amount * (PP.bill.lineTotal(l) / gross) * rate / 100;
        }));
      };
      const tiered = () => {
        // Marginal tiers on money the professional collected in the same month before this payment.
        const month = PP.monthKey(onDate || PP.today());
        let before = PP.sum(PP.db.commissionEntries.filter((e) => e.professionalId === inv.professionalId && e.type === 'accrual' && PP.monthKey(e.date) === month), (e) => e.base);
        let left = amount; let total = 0; let lower = 0;
        for (const tier of cfg.tiers) {
          const upper = tier.upTo == null ? Infinity : tier.upTo;
          const room = Math.max(0, upper - Math.max(before, lower));
          const take = Math.min(left, room);
          if (take > 0) { total += take * tier.rate / 100; left -= take; before += take; }
          lower = upper; if (left <= 0) break;
        }
        return PP.round2(total);
      };
      switch (cfg.model) {
        case 'fixed': return { value: fixed(), basis: `Fixed ${PP.fmt.money(cfg.fixedPerVisit)} per visit, proportional` };
        case 'per_service': return { value: perService(), basis: 'Rate per service' };
        case 'tiered': return { value: tiered(), basis: 'Tiered (monthly collection)' };
        case 'mixed': return { value: PP.round2(pct() + fixed()), basis: `${cfg.percent}% + fixed ${PP.fmt.money(cfg.fixedPerVisit)}` };
        default: return { value: pct(), basis: `${cfg.percent}%` };
      }
    },
    accrueFor(pay, inv) {
      if (!inv.professionalId || pay.status !== 'Completed') return; // D-025 rule 5
      const c = PP.commission.calc(inv, pay.amount, pay.date);
      if (!c.value) return;
      PP.db.commissionEntries.push({ id: PP.nextId('COM'), professionalId: inv.professionalId, paymentId: pay.id, invoiceId: inv.id, branchId: inv.branchId, date: pay.date, type: 'accrual', base: pay.amount, value: c.value, basis: c.basis, settlementId: null, at: PP.nowStamp() });
    },
    reverseFor(pay, kind) {
      PP.db.commissionEntries.filter((e) => e.paymentId === pay.id && e.type === 'accrual').forEach((e) => {
        PP.db.commissionEntries.push({ id: PP.nextId('COM'), professionalId: e.professionalId, paymentId: pay.id, invoiceId: e.invoiceId, branchId: e.branchId, date: PP.today(), type: 'reversal', base: -e.base, value: -e.value, basis: `Reversal of ${e.id} (${kind})`, settlementId: null, at: PP.nowStamp() });
      });
    },
    adjustForRefund(orig, ref) {
      PP.db.commissionEntries.filter((e) => e.paymentId === orig.id && e.type === 'accrual').forEach((e) => {
        const ratio = ref.amount / orig.amount;
        PP.db.commissionEntries.push({ id: PP.nextId('COM'), professionalId: e.professionalId, paymentId: ref.id, invoiceId: e.invoiceId, branchId: e.branchId, date: ref.date, type: 'adjustment', base: -PP.round2(e.base * ratio), value: -PP.round2(e.value * ratio), basis: `Refund adjustment of ${e.id}`, settlementId: null, at: PP.nowStamp() });
      });
    },
    /** Unsettled balance (can be negative after a refund that follows a payout — D-026). */
    balance(proId) { return PP.round2(PP.sum(PP.db.commissionEntries.filter((e) => e.professionalId === proId && !e.settlementId), (e) => e.value)); },
  };

  /* ----------------------------------------------------- patients helpers */
  PP.duplicateCandidates = (mobile, name, excludeId) => {
    const m = String(mobile || '').replace(/\D/g, '');
    const n = String(name || '').trim().toLowerCase();
    return PP.db.patients.filter((p) => p.id !== excludeId && !p.mergedInto && ((m && p.mobile.replace(/\D/g, '') === m) || (n && p.name.toLowerCase() === n)));
  };
  /** Date of birth estimated from an age given in years and months (staff often know the age, not the date). */
  PP.dobFromAge = (years, months) => {
    if (years === '' || years == null) return '';
    const total = Number(years) * 12 + (Number(months) || 0); const t = PP.parseISO(PP.today());
    const d = new Date(t.getFullYear(), t.getMonth() - total, t.getDate());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /** Age in whole years and months from a date of birth (for prefilling age fields). */
  PP.ageParts = (dob) => {
    if (!dob) return { y: '', m: 0 };
    const t = PP.parseISO(PP.today()); const b = PP.parseISO(dob);
    let m = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth()); if (t.getDate() < b.getDate()) m--;
    m = Math.max(0, m); return { y: Math.floor(m / 12), m: m % 12 };
  };
  /** "≈ 5 ফুট 7 ইঞ্চি" from centimetres. */
  PP.ftIn = (cm) => { cm = Number(cm); if (!(cm > 0)) return ''; let ft = Math.floor(cm / 30.48); let inch = Math.round((cm - ft * 30.48) / 2.54); if (inch === 12) { ft += 1; inch = 0; } return `≈ ${ft} ফুট ${inch} ইঞ্চি`; };
  PP.isMobile = (v) => /^01[3-9]\d{8}$/.test(String(v || '').replace(/[\s-]/g, ''));

  /* ---------------------------------------------------------------- router */
  const routes = []; PP._routes = routes; // exposed for the access-isolation test
  PP.route = function (pattern, def) {
    const keys = []; const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push(Object.assign({ pattern, keys, re }, def));
  };
  PP.go = (hash) => { if (location.hash === hash) PP.render(); else location.hash = hash; };
  PP.currentPath = () => (location.hash.slice(1) || '/dashboard').split('?')[0];
  PP.match = function (path) {
    const found = routes.map((r) => ({ r, m: path.match(r.re) })).filter((x) => x.m).sort((a, b) => a.r.keys.length - b.r.keys.length)[0];
    if (!found) return null;
    const params = {}; found.r.keys.forEach((k, i) => { params[k] = decodeURIComponent(found.m[i + 1]); });
    return { route: found.r, params };
  };
  let renderToken = 0;
  PP.render = async function () {
    const view = PP.$('#view'); if (!view) return;
    const raw = location.hash.slice(1) || '/dashboard';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const hit = PP.match(path);
    const token = ++renderToken;
    PP.emit('route:change', { path, hit });
    if (!hit) { view.innerHTML = PP.ui.notFound(path); document.title = 'Not found · Physio Point prototype'; return; }
    const { route, params } = hit;
    const title = typeof route.title === 'function' ? route.title(params) : route.title;
    document.title = `${PP.stripHtml(title || 'Physio Point')} · ${PP.db.settings.clinicName}`;
    PP.emit('title', PP.stripHtml(title || ''));
    if (route.perm && !PP.can(route.perm)) { view.innerHTML = PP.ui.noAccess(route.perm); return; }
    view.innerHTML = PP.ui.skeletonPage();             // loading state on every navigation
    await PP.sleep(query.nodelay ? 0 : 220);
    if (token !== renderToken) return;
    view.innerHTML = '';
    try { await route.render({ params, query, path, el: view }); }
    catch (err) { console.error(err); view.innerHTML = PP.ui.errorState(err); }
    view.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  /* ------------------------------------------------------------- branding */
  PP.applyBranding = function () {
    const s = PP.db.settings; const root = document.documentElement.style;
    root.setProperty('--pp-primary', s.primary || '#083E44');
    root.setProperty('--pp-action', s.action || '#008B83');
    root.setProperty('--pp-primary-700', shade(s.primary || '#083E44', -18));
    root.setProperty('--pp-primary-600', shade(s.primary || '#083E44', 10));
    root.setProperty('--pp-action-700', shade(s.action || '#008B83', -14));
    root.setProperty('--pp-action-050', tint(s.action || '#008B83', 0.9));
  };
  function hexToRgb(h) { const x = h.replace('#', ''); const n = parseInt(x.length === 3 ? x.split('').map((c) => c + c).join('') : x, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function shade(hex, pct) { const [r, g, b] = hexToRgb(hex); const f = 1 + pct / 100; return rgbToHex(r * f, g * f, b * f); }
  function tint(hex, amt) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt); }

  /* ------------------------------------------------------------------ CSV */
  PP.downloadCsv = function (filename, rows) {
    const csv = rows.map((r) => r.map((v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* --------------------------------------------------------- seeded random */
  PP.rng = function (seed) {
    let a = seed >>> 0;
    const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
  };
})();
