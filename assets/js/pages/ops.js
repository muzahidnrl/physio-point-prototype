/* Physio Point HTML prototype — Operations (feature catalogue: queue, queue.token_print, queue.display_board,
   packages, exercises, referrals, feedback · FR-QUE-01, FR-GA-15, FR-PKG-01, FR-EXR-01, FR-ADD-01).
   Queue & check-in desk, waiting-room display, packages & memberships (D-026: package commission when the
   money is received), exercise library + assignments, referrals, patient feedback. Fictional data only (D-006). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;
  const money = (n) => PP.fmt.money(n);
  const pad2 = (n) => String(n).padStart(2, '0');
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  /* ================================================================ helpers */
  const COLLS = ['queue', 'packageUsage', 'membershipPlans', 'memberships', 'exerciseAssignments', 'referrals', 'feedback', 'feedbackRequests'];
  const ensure = () => { COLLS.forEach((k) => { if (!Array.isArray(PP.db[k])) PP.db[k] = []; }); };
  const me = () => PP.currentUser() || {};
  const myProId = () => me().professionalId || '';
  const uid = (prefix, coll, width) => { let id; do { id = PP.nextId(prefix, width); } while ((PP.db[coll] || []).some((x) => x.id === id)); return id; };
  const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="muted">—</span>' : v}</dd>`).join('')}</dl>`;
  const nl = (s) => esc(s || '').replace(/\n/g, '<br>');
  const firstName = (pid) => { const n = PP.patientName(pid); if (n === '—') return '—'; const parts = n.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Md\.?|Mst\.?|Mohammad|Muhammad)\s+/i, '').split(/\s+/); return parts[0] || n; };
  const dur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h ${pad2(m)}m` : `${m}:${pad2(s % 60)}`; };
  const clockOf = (iso) => { if (!iso) return '—'; const d = new Date(iso); return PP.fmt.time(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); };
  const at = (date, hhmm) => new Date(`${date}T${hhmm}:00`);
  const addMonths = (iso, n) => { const d = PP.parseISO(iso); d.setMonth(d.getMonth() + n); return PP.isoOf(d); };
  const notFound = (what, id, back) => `<div class="card">${PP.ui.empty({ icon: 'search', title: `${what} not found`, text: `Nothing with ID <code>${esc(id)}</code>.`, action: `<a class="btn" href="${back}">Go back</a>` })}</div>`;
  const proOptions = () => PP.professionalsInBranch().map((p) => [p.id, `${PP.proName(p)} · ${p.designation || ''}`]);
  const allProOptions = () => PP.db.professionals.filter((p) => p.status === 'Active').map((p) => [p.id, PP.proName(p)]);
  const stars = (n, lg) => `<span class="ops-stars ${lg ? 'lg' : ''}" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => PP.icon('star', i <= Math.round(n) ? 'class="on"' : '')).join('')}</span>`;
  const relDays = (iso) => { const d = PP.diffDays(PP.today(), iso); return d === 0 ? 'today' : d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `${-d} day${d === -1 ? '' : 's'} ago`; };
  const branchOfNew = (fallback) => (PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : fallback || (PP.db.branches[0] || {}).id);
  const tick = (el, sel, fn) => PP.$$(sel, el).forEach(fn);

  /* per-viewer conveniences (never shared state) */
  const pref = {
    get(k, d) { try { const v = localStorage.getItem('pp-ops-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pp-ops-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  /* timers die with the page */
  let timers = [];
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  PP.on('route:change', () => { timers.forEach(clearInterval); timers = []; document.body.classList.remove('ops-kiosk'); });

  /* print a fragment (token / letter) without the app around it */
  function printHtml(html) {
    PP.$$('.ops-print-host').forEach((x) => x.remove());
    const host = document.createElement('div'); host.className = 'ops-print-host'; host.innerHTML = html; document.body.appendChild(host);
    document.body.classList.add('ops-printing');
    const done = () => { document.body.classList.remove('ops-printing'); host.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } finally { setTimeout(done, 400); } }, 60);
  }

  /* searchable patient select (works with PP.form.validate) */
  function patientOptions(q, value) {
    const ql = (q || '').toLowerCase();
    const list = PP.db.patients.filter((p) => !p.mergedInto && (!ql || `${p.name} ${p.id} ${p.mobile}`.toLowerCase().includes(ql)));
    const cur = value && !list.some((p) => p.id === value) ? PP.find.patient(value) : null;
    const arr = (cur ? [cur] : []).concat(list).slice(0, 200);
    return `<option value="">${arr.length ? 'Select a patient…' : 'No matching patients'}</option>${arr.map((p) => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.name)} · ${esc(p.id)} · ${esc(p.mobile)}</option>`).join('')}`;
  }
  function patientField(name, value, label, disabled) {
    const id = `opp-${Math.random().toString(36).slice(2, 7)}`;
    return `<div class="field" data-field="${name}"><label for="${id}">${esc(label || 'Patient')}<span class="req" aria-hidden="true">*</span></label>
      ${disabled ? '' : `<div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-pq="${name}" placeholder="Search name, patient ID or mobile" aria-label="Search patients"></div>`}
      <select class="select" id="${id}" name="${name}" required ${disabled ? 'disabled' : ''} ${disabled ? '' : 'style="margin-top:6px"'}>${patientOptions('', value)}</select>
      <div class="error" role="alert">Select a patient.</div></div>`;
  }
  function bindPatientField(root, name, onChange) {
    const sel = PP.$(`select[name="${name}"]`, root); const q = PP.$(`[data-pq="${name}"]`, root);
    if (!sel) return;
    if (q) q.addEventListener('input', () => {
      const cur = sel.value; sel.innerHTML = patientOptions(q.value.trim(), cur);
      if (!cur && sel.options.length === 2) { sel.selectedIndex = 1; if (onChange) onChange(sel.value); }
    });
    sel.addEventListener('change', () => { if (onChange) onChange(sel.value); });
  }

  /* invoices made here use the same structure as the billing screens (D-026: one professional per invoice) */
  function makeInvoice({ patientId, professionalId, branchId, lines, discount, discountReason, notes }) {
    if (!Array.isArray(PP.db.invoices)) PP.db.invoices = [];
    const inv = { id: uid('INV', 'invoices'), patientId, professionalId: professionalId || null, branchId, appointmentId: null, visitId: null, date: PP.today(), lines, discount: Number(discount) || 0, discountReason: discountReason || '', notes: notes || '', status: 'Open', manualCommissionPercent: null, createdBy: me().id || null, createdAt: PP.nowStamp() };
    PP.db.invoices.push(inv);
    return inv;
  }

  /* ================================================================ seed */
  PP.registerSeed('ops', (db, R) => {
    COLLS.forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    const T = PP.today(); const nowMs = Date.now();
    const live = db.patients.filter((p) => !p.mergedInto && p.status !== 'Inactive');
    const pickPatients = (n, exclude) => { const pool = live.filter((p) => !(exclude || []).includes(p.id)); const out = []; while (pool.length && out.length < n) out.push(pool.splice(Math.floor(R.next() * pool.length), 1)[0]); return out; };
    const proBranch = (id) => (db.professionals.find((p) => p.id === id) || {}).branchId || 'BR-1';

    /* --- queue for today (from appointments already checked in / in session / done) --- */
    const todays = db.appointments.filter((a) => a.date === T && ['Checked in', 'In session', 'Completed'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start));
    const nums = {};
    todays.forEach((a) => {
      const n = (nums[a.branchId] = (nums[a.branchId] || 0) + 1);
      const st = at(T, a.start).getTime();
      let checkedIn; let startedAt = null; let doneAt = null; let status; let roomId = null; let calledAt = null;
      if (a.status === 'Completed') { checkedIn = st - R.int(5, 15) * 60000; startedAt = st; doneAt = Math.min(at(T, a.end).getTime(), nowMs); status = 'Done'; roomId = a.roomId; calledAt = st; }
      else if (a.status === 'In session') { checkedIn = st - R.int(5, 15) * 60000; startedAt = Math.min(st, nowMs); status = 'In session'; roomId = a.roomId; calledAt = startedAt; }
      else { checkedIn = nowMs - R.int(2, 22) * 60000; status = 'Waiting'; }
      checkedIn = Math.min(checkedIn, nowMs);
      db.queue.push({ id: uid('QUE', 'queue', 5), date: T, branchId: a.branchId, number: n, appointmentId: a.id, patientId: a.patientId, professionalId: a.professionalId, roomId, status, checkedInAt: new Date(checkedIn).toISOString(), calledAt: calledAt ? new Date(calledAt).toISOString() : null, startedAt: startedAt ? new Date(startedAt).toISOString() : null, doneAt: doneAt ? new Date(doneAt).toISOString() : null, walkIn: false });
    });

    /* --- packages: two more package services + sold packages (invoice + payment through billing) --- */
    [
      { id: 'SRV-PK2', name: 'Back care package (6 sessions)', category: 'Package', duration: 30, price: 4500, customPriceAllowed: false, isPackage: true, sessions: 6, validityDays: 45, status: 'Active' },
      { id: 'SRV-PK3', name: 'Post-surgery rehab package (12 sessions)', category: 'Package', duration: 45, price: 14400, customPriceAllowed: false, isPackage: true, sessions: 12, validityDays: 90, status: 'Active' },
    ].forEach((s) => { if (!db.services.some((x) => x.id === s.id)) db.services.push(s); });
    db.counters.PKG = Math.max(db.counters.PKG || 0, db.packages.length);
    const notes = ['Session completed', 'Session completed · exercises progressed', 'Session completed · mild soreness', 'Session completed · home programme reviewed'];
    db.packages.forEach((k) => { // usage history for packages that existed before this module (linking only)
      for (let i = 0; i < (k.sessionsUsed || 0); i++) db.packageUsage.push({ id: uid('PKU', 'packageUsage', 4), packageId: k.id, type: 'Deduction', date: PP.addDays(k.start, Math.min(PP.diffDays(k.start, T), 2 + i * 3)), note: R.pick(notes), appointmentId: null, by: 'Shirin Sultana', at: PP.nowStamp() });
    });
    const plans = [['SRV-11', -50, 8, 'full'], ['SRV-PK2', -40, 5, 'part'], ['SRV-PK2', -60, 4, 'full'], ['SRV-PK3', -20, 4, 'full'], ['SRV-11', -70, 10, 'full'], ['SRV-PK3', -3, 0, 'part'], ['SRV-PK2', -12, 2, 'full']];
    pickPatients(plans.length, ['PAT-000342']).forEach((pt, i) => {
      const [svcId, off, used, pay] = plans[i]; const svc = db.services.find((s) => s.id === svcId); if (!svc) return;
      const start = PP.addDays(T, off); const pro = pt.assignedProfessionalId || 'PRO-1'; const branchId = proBranch(pro);
      const inv = { id: uid('INV', 'invoices'), patientId: pt.id, professionalId: pro, branchId, appointmentId: null, visitId: null, date: start, lines: [{ serviceId: svc.id, description: svc.name, qty: 1, unitPrice: svc.price, defaultPrice: svc.price, overrideReason: '' }], discount: 0, discountReason: '', notes: 'Package', status: 'Open', manualCommissionPercent: null, createdBy: 'USR-2' };
      db.invoices.push(inv);
      PP.bill.recordPayment({ invoiceId: inv.id, amount: pay === 'full' ? svc.price : Math.round(svc.price / 2 / 100) * 100, method: R.pick(['Cash', 'bKash', 'Nagad', 'Card']), date: start, silent: true });
      const expires = PP.addDays(start, svc.validityDays || 60);
      const k = { id: uid('PKG', 'packages', 3), patientId: pt.id, serviceId: svc.id, invoiceId: inv.id, sessionsTotal: svc.sessions, sessionsUsed: used, start, expires, status: used >= svc.sessions ? 'Used up' : expires < T ? 'Expired' : 'Active', branchId };
      db.packages.push(k);
      const span = Math.max(1, Math.min(PP.diffDays(start, T), svc.validityDays || 60));
      for (let u = 0; u < used; u++) db.packageUsage.push({ id: uid('PKU', 'packageUsage', 4), packageId: k.id, type: 'Deduction', date: PP.addDays(start, Math.round(((u + 1) * span) / (used + 1))), note: R.pick(notes), appointmentId: null, by: R.pick(['Shirin Sultana', 'Clinic Administrator']), at: PP.nowStamp() });
    });

    /* --- memberships --- */
    db.membershipPlans.push(
      { id: 'MSP-1', name: 'Wellness Basic', months: 3, price: 2500, discountPercent: 10, benefits: '10% off every session · priority booking', status: 'Active' },
      { id: 'MSP-2', name: 'Rehab Plus', months: 6, price: 4500, discountPercent: 15, benefits: '15% off sessions · one free re-assessment', status: 'Active' },
      { id: 'MSP-3', name: 'Family Care', months: 12, price: 9000, discountPercent: 15, benefits: '15% off for up to 4 family members · free home-exercise review', status: 'Active' },
    );
    const mem = [['MSP-1', 5], ['MSP-2', 12], ['MSP-3', 140], ['MSP-1', -8], ['MSP-2', 61], ['MSP-3', 220], ['MSP-1', 33]];
    pickPatients(mem.length).forEach((pt, i) => {
      const [planId, renewOff] = mem[i]; const plan = db.membershipPlans.find((p) => p.id === planId);
      const renewsOn = PP.addDays(T, renewOff); const start = addMonths(renewsOn, -plan.months);
      db.memberships.push({ id: uid('MEM', 'memberships', 3), patientId: pt.id, planId, start, renewsOn, status: 'Active', branchId: pt.branchId, history: [{ date: start, action: 'Joined', amount: plan.price, invoiceId: null, by: 'Shirin Sultana' }] });
    });

    /* --- exercise assignments --- */
    const exIds = db.exercises.map((e) => e.id);
    const freqs = ['Daily', 'Twice daily', '3 times / week', 'Every other day'];
    pickPatients(7).forEach((pt, i) => {
      const exId = exIds[(i * 5) % exIds.length]; const start = PP.addDays(T, -R.int(1, 30)); const weeks = R.pick([2, 3, 4, 6]);
      db.exerciseAssignments.push({ id: uid('EXA', 'exerciseAssignments', 4), patientId: pt.id, exerciseId: exId, professionalId: pt.assignedProfessionalId || 'PRO-1', sets: R.pick([2, 3]), reps: R.pick([10, 12, 15]), frequency: R.pick(freqs), durationWeeks: weeks, startDate: start, notes: R.pick(['Stop if pain increases.', 'Use a pillow under the knee.', '', 'Hold each repetition for 5 seconds.']), status: PP.addDays(start, weeks * 7) < T ? 'Completed' : 'Active', assignedAt: start + 'T11:00:00', branchId: pt.branchId });
    });

    /* --- referrals (fictional doctors and organisations) --- */
    const refs = [
      ['Inbound', 'Dr. Arif Mahmud', 'Orthopaedic Surgeon · Rupsha General Hospital', 'Post-operative rehabilitation after ACL reconstruction (right knee).', 'Urgent', -2, 'Received'],
      ['Inbound', 'Dr. Nasrin Akhter', 'General Practitioner · Daulatpur Family Practice', 'Chronic low back pain, 6 months. Please assess and treat.', 'Routine', -6, 'Accepted'],
      ['Inbound', 'Dr. Sohel Rana', 'Neurologist · Moylapota Neuro Clinic', 'Stroke rehabilitation, left hemiparesis. Gait training.', 'Urgent', -14, 'Seen'],
      ['Inbound', 'Dr. Ayesha Siddika', 'Rheumatologist · Boyra Medical Centre', 'Frozen shoulder (left). Mobilisation programme.', 'Routine', -33, 'Closed'],
      ['Inbound', 'Dr. Kamrul Islam', 'Sports Medicine · Khulna Sports Clinic', 'Recurrent ankle sprain; balance and proprioception.', 'Routine', -1, 'Received'],
      ['Outbound', 'Dr. Kabir Chowdhury', 'Neurologist · Shibbari Neuro Centre', 'Progressive numbness in both hands; rule out cervical myelopathy.', 'Urgent', -4, 'Sent'],
      ['Outbound', 'Nirala Imaging Centre', 'MRI and X-ray · Nirala', 'MRI lumbar spine: suspected L4–L5 disc prolapse.', 'Routine', -9, 'Acknowledged'],
      ['Outbound', 'Dr. Lubna Yasmin', 'Orthopaedic Surgeon · Gollamari Orthopaedic Hospital', 'Knee pain not improving after 10 sessions; surgical opinion.', 'Routine', -21, 'Report received'],
    ];
    const FLOW_IN = ['Received', 'Accepted', 'Seen', 'Closed']; const FLOW_OUT = ['Sent', 'Acknowledged', 'Report received'];
    pickPatients(refs.length).forEach((pt, i) => {
      const [direction, name, org, reason, urgency, off, status] = refs[i];
      const flow = direction === 'Inbound' ? FLOW_IN : FLOW_OUT; const date = PP.addDays(T, off);
      const history = flow.slice(0, flow.indexOf(status) + 1).map((s, k) => ({ at: PP.addDays(date, Math.min(-off, k * 2)) + `T1${k}:15:00`, status: s, note: k === 0 ? (direction === 'Inbound' ? 'Referral letter received at reception' : 'Letter sent with the patient') : '', by: k === 0 ? 'Shirin Sultana' : 'Clinic Administrator' }));
      db.referrals.push({ id: uid('REF', 'referrals', 4), direction, patientId: pt.id, externalName: name, externalOrg: org, externalContact: `01${R.pick(['7', '8', '9'])}${R.int(10000000, 99999999)}`, professionalId: pt.assignedProfessionalId || 'PRO-1', reason, summary: direction === 'Outbound' ? 'Treated with physiotherapy (manual therapy, exercise). Partial improvement; symptoms persist.' : '', urgency, date, status, attachments: i % 2 === 0 ? [{ name: direction === 'Inbound' ? 'referral-letter.pdf' : 'treatment-summary.pdf', size: R.int(80, 900) * 1024 }] : [], history, branchId: pt.branchId, createdAt: date + 'T10:00:00' });
    });

    /* --- feedback (25) + requests --- */
    const comments = {
      5: ['Very caring and professional. My back pain has improved a lot.', 'Every exercise was explained clearly. Highly recommended.', 'Clean clinic, short waiting time, excellent treatment.', 'Friendly reception and on-time appointment.', ''],
      4: ['Good treatment, but the waiting time was a little long.', 'Helpful staff. Parking is difficult.', 'Sessions are helping; I would like evening slots.', ''],
      3: ['Treatment was fine but I waited 30 minutes past my time.', 'Average experience. Billing could be faster.'],
      2: ['Billing took too long and the receipt had a mistake.', 'The room was crowded and I felt rushed.'],
      1: ['My appointment was moved without a call.', 'No improvement yet and nobody followed up.'],
    };
    const done = db.appointments.filter((a) => a.status === 'Completed' && a.date >= PP.addDays(T, -42) && a.date < T);
    const usedApt = new Set();
    for (let i = 0; i < 25 && done.length; i++) {
      let a = R.pick(done); let guard = 0; while (usedApt.has(a.id) && guard++ < 20) a = R.pick(done); usedApt.add(a.id);
      const r = R.next(); const rating = i === 4 ? 2 : i === 13 ? 1 : i === 19 ? 2 : r < 0.46 ? 5 : r < 0.76 ? 4 : r < 0.88 ? 3 : r < 0.95 ? 2 : 1;
      const comment = R.pick(comments[rating]);
      const date = PP.addDays(a.date, R.int(0, 2)) > T ? T : PP.addDays(a.date, R.int(0, 2));
      const responded = rating <= 3 ? R.chance(0.6) : R.chance(0.15);
      db.feedback.push({ id: uid('FB', 'feedback', 4), patientId: a.patientId, professionalId: a.professionalId, appointmentId: a.id, branchId: a.branchId, date, rating, comment, channel: R.pick(['SMS link', 'SMS link', 'In clinic', 'WhatsApp link']), response: responded ? { note: rating <= 3 ? 'Called the patient, apologised and offered a priority slot for the next visit.' : 'Thanked the patient by phone.', by: 'Clinic Administrator', at: date + 'T16:30:00' } : null, createdAt: date + 'T12:00:00' });
    }
    db.feedback.sort((a, b) => b.date.localeCompare(a.date));
    db.feedback.filter((f) => f.channel !== 'In clinic').slice(0, 8).forEach((f) => db.feedbackRequests.push({ id: uid('FBR', 'feedbackRequests', 4), patientId: f.patientId, appointmentId: f.appointmentId, branchId: f.branchId, sentAt: f.date + 'T09:00:00', channel: 'SMS', status: 'Answered', feedbackId: f.id }));
    done.filter((a) => !usedApt.has(a.id) && a.date >= PP.addDays(T, -5)).slice(0, 4).forEach((a) => db.feedbackRequests.push({ id: uid('FBR', 'feedbackRequests', 4), patientId: a.patientId, appointmentId: a.id, branchId: a.branchId, sentAt: PP.addDays(a.date, 1) + 'T09:00:00', channel: 'SMS', status: 'Sent', feedbackId: null }));
  });

  /* =============================================================== QUEUE */
  const qPrefix = (branchId) => { const b = PP.find.branch(branchId); return b ? b.name.trim()[0].toUpperCase() : 'Q'; };
  const qLabel = (e) => `${qPrefix(e.branchId)}-${pad2(e.number)}`;
  const nextNumber = (branchId, date) => 1 + Math.max(0, ...PP.db.queue.filter((e) => e.branchId === branchId && e.date === date).map((e) => e.number));
  const entryFor = (aptId) => PP.db.queue.find((q) => q.appointmentId === aptId && q.status !== 'Left');
  const findEntry = (id) => PP.db.queue.find((q) => q.id === id);
  function setApt(a, status, note) {
    if (PP.appt && PP.appt.history) PP.appt.history(a, status, note);
    else (a.history = a.history || []).push({ at: PP.nowStamp(), status, note: note || '', by: me().name || 'System' });
    a.status = status; PP.audit(`Appointment ${status.toLowerCase()}`, a.id, note || '');
  }
  function newEntry(a, walkIn) {
    const e = { id: uid('QUE', 'queue', 5), date: a.date, branchId: a.branchId, number: nextNumber(a.branchId, a.date), appointmentId: a.id, patientId: a.patientId, professionalId: a.professionalId, roomId: null, status: 'Waiting', checkedInAt: PP.nowStamp(), calledAt: null, startedAt: null, doneAt: null, walkIn: !!walkIn };
    PP.db.queue.push(e); return e;
  }
  /** Keeps queue entries in step with appointment statuses changed on other screens. */
  function syncQueue() {
    ensure(); const T = PP.today(); let changed = false;
    PP.db.appointments.forEach((a) => {
      if (a.date !== T) return;
      let e = entryFor(a.id);
      if (!e && ['Checked in', 'In session'].includes(a.status)) {
        e = newEntry(a, a.source === 'Walk-in');
        if (a.status === 'In session') { e.status = 'In session'; e.startedAt = PP.nowStamp(); e.roomId = a.roomId || null; }
        changed = true;
      }
      if (!e) return;
      const want = a.status === 'Checked in' ? 'Waiting' : a.status === 'In session' ? 'In session' : a.status === 'Completed' ? 'Done' : 'Left';
      if (want !== e.status) {
        e.status = want;
        if (want === 'Done' && !e.doneAt) e.doneAt = PP.nowStamp();
        if (want === 'In session' && !e.startedAt) e.startedAt = PP.nowStamp();
        changed = true;
      }
    });
    if (changed) PP.save();
  }
  const usablePackage = (pid) => PP.db.packages.filter((k) => k.patientId === pid && k.sessionsUsed < k.sessionsTotal && k.expires >= PP.today() && k.status !== 'Used up').sort((a, b) => a.expires.localeCompare(b.expires))[0] || null;
  const invoiceForApt = (aptId) => PP.db.invoices.find((i) => i.appointmentId === aptId && i.status !== 'Void') || null;

  function tokenHtml(e) {
    const s = PP.db.settings; const room = e.roomId ? PP.find.room(e.roomId) : null;
    return `<div class="ops-token">
      <div class="ops-token-clinic">${esc(s.clinicName)}</div><div class="small">${esc(PP.branchName(e.branchId))}</div>
      <div class="ops-token-label">Your queue number</div>
      <div class="ops-token-no">${esc(qLabel(e))}</div>
      <div class="ops-token-name">${esc(firstName(e.patientId))}</div>
      <dl><dt>${esc(PP.t('professional'))}</dt><dd>${esc(PP.proShort(e.professionalId))}</dd>
        <dt>Room</dt><dd>${room ? esc(room.name) : 'Shown on the screen when called'}</dd>
        <dt>Checked in</dt><dd>${esc(clockOf(e.checkedInAt))} · ${esc(PP.fmt.date(e.date))}</dd></dl>
      <div class="ops-token-foot">Please wait in the waiting area. Your number will appear on the screen.</div>
    </div>`;
  }
  function tokenModal(e) {
    PP.ui.modal({ title: `Queue token ${esc(qLabel(e))}`, size: 'sm', body: tokenHtml(e) + '<p class="ops-note mt-3">Only the first name and queue number are printed (no other personal data).</p>',
      buttons: [{ label: 'Close', kind: 'ghost' }, { label: `${PP.icon('printer')} Print token`, kind: 'primary', onClick: () => { printHtml(tokenHtml(e)); PP.audit('Queue token printed', e.appointmentId, qLabel(e)); PP.save(); } }] });
  }

  function roomModal(e, opts, done) {
    const apt = PP.find.appointment(e.appointmentId) || {};
    const rooms = PP.db.rooms.filter((r) => r.branchId === e.branchId);
    const busy = (rid) => PP.db.queue.find((q) => q.date === e.date && q.roomId === rid && q.status === 'In session' && q.id !== e.id);
    const def = e.roomId || apt.roomId || '';
    PP.ui.modal({
      title: `${opts.start ? 'Start session' : 'Call patient'} · ${esc(qLabel(e))}`, size: 'sm',
      body: `<form novalidate class="stack">
        <div class="pcard"><span class="ops-qno">${esc(qLabel(e))}</span><div><b>${esc(PP.patientName(e.patientId))}</b><span class="sub small muted" style="display:block">${esc(PP.proName(e.professionalId))}</span></div></div>
        ${PP.form.field({ type: 'select', name: 'roomId', label: 'Room', required: true, value: def, options: rooms.map((r) => { const b = busy(r.id); return [r.id, `${r.name}${b ? ` · in use (${qLabel(b)})` : ''}`]; }), error: 'Choose a room.' })}
        <div class="ops-note">The waiting-room display shows the queue number and first name for this room.</div></form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' },
        ...(opts.start ? [] : [{ label: 'Call to room', onClick: ({ body }) => save(body, false) }]),
        { label: opts.start ? 'Start session' : 'Call and start session', kind: 'primary', onClick: ({ body }) => save(body, true) }],
    });
    function save(body, start) {
      const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
      const rid = PP.form.read(f).roomId; const b = busy(rid);
      if (b) { PP.form.setError(f, 'roomId', `${PP.find.room(rid).name} is in use by ${qLabel(b)}. Check that patient out first or choose another room.`); return false; }
      e.roomId = rid; e.calledAt = PP.nowStamp(); if (apt.id) apt.roomId = rid;
      if (start) startSession(e, true);
      else { PP.audit('Queue patient called', e.appointmentId, `${qLabel(e)} → ${PP.find.room(rid).name}`); PP.save(); PP.ui.toast(`${esc(qLabel(e))} called to ${esc(PP.find.room(rid).name)}. Shown on the display.`); }
      if (done) done();
    }
  }
  function startSession(e, quiet) {
    const apt = PP.find.appointment(e.appointmentId);
    e.status = 'In session'; e.startedAt = PP.nowStamp(); e.calledAt = e.calledAt || e.startedAt;
    if (apt) setApt(apt, 'In session', `Queue ${qLabel(e)} · ${(PP.find.room(e.roomId) || {}).name || ''}`);
    PP.save(); PP.ui.toast(`Session started for ${esc(qLabel(e))} in ${esc((PP.find.room(e.roomId) || {}).name || 'the room')}.`);
    return quiet;
  }
  function checkoutModal(e, done) {
    const apt = PP.find.appointment(e.appointmentId); const pkg = usablePackage(e.patientId);
    const canBill = PP.can('billing.manage');
    PP.ui.modal({
      title: `Check out · ${esc(qLabel(e))}`,
      body: `<form novalidate class="stack">
        ${kv([['Patient', `${esc(PP.patientName(e.patientId))} <span class="muted mono">${esc(e.patientId)}</span>`], [PP.t('professional'), esc(PP.proName(e.professionalId))], ['Service', esc(apt ? PP.serviceName(apt.serviceId) : '—')], ['Room', esc((PP.find.room(e.roomId) || {}).name || '—')], ['Session time', e.startedAt ? esc(dur(Date.now() - new Date(e.startedAt))) : '—']])}
        ${pkg ? `<label class="check"><input type="checkbox" name="deduct" checked> Deduct 1 session from ${esc(pkg.id)} · ${esc(PP.serviceName(pkg.serviceId))} (${pkg.sessionsUsed} of ${pkg.sessionsTotal} used)</label>` : '<div class="ops-note">No active package for this patient.</div>'}
        ${PP.form.field({ type: 'textarea', name: 'note', label: 'Note (optional)', rows: 2, placeholder: 'e.g. next visit in one week' })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Check out', kind: canBill ? '' : 'primary', onClick: ({ body }) => go(body, false) },
        ...(canBill ? [{ label: `${PP.icon('receipt')} Check out & create invoice`, kind: 'primary', onClick: ({ body }) => go(body, true) }] : [])],
    });
    function go(body, invoice) {
      const v = PP.form.read(PP.$('form', body));
      e.status = 'Done'; e.doneAt = PP.nowStamp();
      if (apt) setApt(apt, 'Completed', `Checked out from queue ${qLabel(e)}${v.note ? ' · ' + v.note : ''}`);
      let msg = `${esc(qLabel(e))} checked out.`;
      if (pkg && v.deduct) { deductSession(pkg, { note: `Session on ${PP.fmt.date(PP.today())}${apt ? ' · ' + apt.id : ''}`, appointmentId: apt ? apt.id : null }); e.packageId = pkg.id; msg += ` 1 session deducted from ${esc(pkg.id)}.`; }
      PP.save(); PP.ui.toast(msg);
      if (invoice) PP.go(`#/billing/new?patient=${encodeURIComponent(e.patientId)}&appointment=${encodeURIComponent(e.appointmentId)}`);
      else if (done) done();
    }
  }
  function walkInModal(done) {
    const st = { patientId: '', mode: 'existing', dupOk: false };
    const svcs = PP.db.services.filter((s) => s.status === 'Active' && !s.isPackage);
    const m = PP.ui.modal({
      title: 'Add walk-in patient', size: 'lg',
      body: `<form novalidate class="stack" data-walk>
        ${PP.ui.segmented('wmode', [['existing', 'Existing patient'], ['new', 'Quick register']], 'existing')}
        <div data-sec="existing">
          <div class="field" data-field="patientId"><label for="wk-q">Find patient<span class="req">*</span></label>
            <div class="input-icon">${PP.icon('search')}<input class="input" id="wk-q" type="search" placeholder="Type a name, patient ID or mobile" autocomplete="off"></div>
            <input type="hidden" name="patientId" required>
            <div class="psearch-results" data-res></div><div data-sel></div>
            <div class="error">Search and select a patient, or switch to quick register.</div></div>
        </div>
        <div data-sec="new" class="hidden"><div class="form-grid">
          ${PP.form.field({ name: 'name', label: 'Full name', required: true, disabled: true })}
          ${PP.form.field({ name: 'mobile', label: 'Mobile', type: 'tel', required: true, rule: 'mobile', placeholder: '01XXXXXXXXX', disabled: true })}
          ${PP.form.field({ type: 'select', name: 'gender', label: 'Gender', required: true, options: ['Female', 'Male', 'Other'], disabled: true })}
          ${PP.form.field({ type: 'number', name: 'age', label: 'Age (years)', min: 0, max: 120, rule: 'nonneg', disabled: true, hint: 'Optional. The full profile can be completed later.' })}
          <div class="full" data-dup></div></div></div>
        <div class="form-grid">
          ${PP.form.field({ type: 'select', name: 'professionalId', label: PP.t('professional'), required: true, options: proOptions(), value: myProId() })}
          ${PP.form.field({ type: 'select', name: 'serviceId', label: 'Service', required: true, options: svcs.map((s) => [s.id, `${s.name} · ${s.duration} min`]) })}
          ${PP.form.field({ name: 'notes', label: 'Reason / notes', full: true, placeholder: 'e.g. neck pain since this morning' })}
          <div class="full" data-conf></div>
        </div>
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: `${PP.icon('check')} Add and check in`, kind: 'primary', onClick: ({ body }) => save(body) }],
    });
    const body = m.body; const form = PP.$('form', body);
    const q = PP.$('#wk-q', body); const res = PP.$('[data-res]', body); const selBox = PP.$('[data-sel]', body); const hid = PP.$('[name=patientId]', body);
    const showSel = () => {
      const p = PP.find.patient(st.patientId); hid.value = st.patientId;
      selBox.innerHTML = p ? `<div class="ops-pick-sel mt-2"><span class="avatar">${esc(PP.initials(p.name))}</span><div class="grow"><b>${esc(p.name)}</b><span class="sub">${esc(p.id)} · ${esc(p.mobile)} · ${esc(PP.fmt.age(p.dob))}</span></div><button type="button" class="btn btn-ghost btn-sm" data-clear>Change</button></div>` : '';
      const c = PP.$('[data-clear]', selBox); if (c) c.addEventListener('click', () => { st.patientId = ''; showSel(); q.focus(); });
    };
    q.addEventListener('input', () => {
      const t = q.value.trim().toLowerCase(); if (t.length < 2) { res.innerHTML = ''; return; }
      const hits = PP.db.patients.filter((p) => !p.mergedInto && `${p.name} ${p.id} ${p.mobile}`.toLowerCase().includes(t)).slice(0, 6);
      res.innerHTML = hits.length ? hits.map((p) => `<button type="button" class="psr" data-pid="${esc(p.id)}"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.id)} · ${esc(p.mobile)}</span></button>`).join('') : `<div class="psr muted">No patient found. Use <b>Quick register</b>.</div>`;
      PP.$$('[data-pid]', res).forEach((b) => b.addEventListener('click', () => { st.patientId = b.dataset.pid; res.innerHTML = ''; q.value = ''; showSel(); }));
    });
    PP.ui.bindSegmented(body, 'wmode', (v) => {
      st.mode = v; PP.form.clearErrors(form);
      PP.$('[data-sec=existing]', body).classList.toggle('hidden', v !== 'existing'); PP.$('[data-sec=new]', body).classList.toggle('hidden', v !== 'new');
      hid.disabled = v !== 'existing'; PP.$$('[data-sec=new] [name]', body).forEach((x) => { x.disabled = v !== 'new'; });
    });
    const conf = () => {
      const pro = PP.$('[name=professionalId]', body).value; const svc = PP.find.service(PP.$('[name=serviceId]', body).value); const box = PP.$('[data-conf]', body);
      if (!pro || !svc) { box.innerHTML = ''; return; }
      const s = PP.nowTime(); const e = PP.fromMin(Math.min(PP.toMin(s) + svc.duration, 1439));
      const c = PP.sched.conflicts(pro, PP.today(), s, e);
      const waiting = PP.db.queue.filter((x) => x.date === PP.today() && x.professionalId === pro && x.status === 'Waiting').length;
      box.innerHTML = c.length ? PP.ui.alert('warning', `Walk-in starts now (${PP.fmt.time(s)}–${PP.fmt.time(e)}). Diary note: ${esc(c[0])}. ${waiting} already waiting for this ${esc(PP.tl('professional'))}. The patient still joins the queue.`) : PP.ui.alert('info', `Walk-in appointment ${PP.fmt.time(s)}–${PP.fmt.time(e)}. ${waiting} already waiting for this ${esc(PP.tl('professional'))}.`);
    };
    PP.$('[name=professionalId]', body).addEventListener('change', conf); PP.$('[name=serviceId]', body).addEventListener('change', conf); conf();
    PP.$$('[data-sec=new] [name=mobile], [data-sec=new] [name=name]', body).forEach((x) => x.addEventListener('input', () => { st.dupOk = false; PP.$('[data-dup]', body).innerHTML = ''; }));

    function save(b) {
      if (!PP.form.validate(form)) return false;
      const v = PP.form.read(form); const T = PP.today();
      let pid = st.patientId; const pro = PP.find.professional(v.professionalId); const svc = PP.find.service(v.serviceId);
      if (st.mode === 'new') {
        const dups = PP.duplicateCandidates(v.mobile, v.name);
        if (dups.length && !st.dupOk) {
          st.dupOk = true;
          PP.$('[data-dup]', b).innerHTML = PP.ui.alert('warning', `Possible existing patient${dups.length > 1 ? 's' : ''}: ${dups.slice(0, 3).map((p) => `<button type="button" class="btn btn-sm" data-use="${esc(p.id)}">Use ${esc(p.name)} · ${esc(p.id)}</button>`).join(' ')}<br>A mobile number can be shared by family members. Press <b>Add and check in</b> again to register a new patient anyway.`);
          PP.$$('[data-use]', b).forEach((x) => x.addEventListener('click', () => { st.patientId = x.dataset.use; PP.$('[data-v=existing]', b).click(); showSel(); }));
          return false;
        }
        const dob = v.age !== '' && v.age != null ? `${new Date().getFullYear() - Number(v.age)}-01-01` : '';
        const p = { id: uid('PAT', 'patients'), name: v.name, gender: v.gender, dob, mobile: v.mobile.replace(/[\s-]/g, ''), email: '', address: '', emergencyContact: '', assignedProfessionalId: pro.id, branchId: pro.branchId, referralSource: 'Walk-in', bloodGroup: '', medicalHistory: '', allergies: '', previousTreatments: '', notes: 'Quick-registered at the check-in desk. Complete the profile.', registeredAt: T, familyGroup: null, customFields: {}, status: 'Active' };
        PP.db.patients.push(p); pid = p.id; PP.audit('Patient registered (walk-in)', p.id, p.name);
      }
      const s = PP.nowTime(); const end = PP.fromMin(Math.min(PP.toMin(s) + svc.duration, 1439));
      const a = { id: uid('APT', 'appointments'), patientId: pid, professionalId: pro.id, serviceId: svc.id, branchId: pro.branchId, roomId: null, date: T, start: s, end, status: 'Scheduled', source: 'Walk-in', notes: v.notes || 'Walk-in', createdAt: PP.nowStamp(), cancelReason: '' };
      PP.db.appointments.push(a);
      const e = newEntry(a, true); setApt(a, 'Checked in', `Walk-in · queue ${qLabel(e)}`);
      PP.save(); PP.ui.toast(`Walk-in added. ${esc(PP.patientName(pid))} is <b>${esc(qLabel(e))}</b> in the queue.`);
      if (done) done();
      if (pref.get('autoToken', false)) setTimeout(() => tokenModal(e), 50);
    }
  }

  function renderQueue(el) {
    const T = PP.today();
    const st = { pro: '', q: '' };
    const br = PP.activeBranchId();
    el.innerHTML = PP.ui.pageHead({
      title: 'Queue &amp; Check-in', crumbs: [['Appointments', '#/appointments'], ['Queue & Check-in']],
      subtitle: `${esc(PP.fmt.dateLong(T))} · ${br === 'ALL' ? 'All branches (queue numbers are per branch)' : esc(PP.branchName(br))}`,
      actions: `<a class="btn" href="#/queue/display">${PP.icon('eye')} Waiting-room display</a><button class="btn" data-call-next>${PP.icon('bell')} Call next</button><button class="btn btn-primary" data-walkin>${PP.icon('userPlus')} Walk-in</button>`,
    }) + `<div class="grid grid-4 ops-kpis" data-kpis></div>
      <div class="card"><div class="card-body"><div class="ops-toolbar">
        <div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search patient name or ID" aria-label="Search the queue"></div>
        <select class="select" data-pro aria-label="Filter by ${esc(PP.tl('professional'))}"><option value="">All ${esc(PP.tl('professionals'))}</option>${proOptions().map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
        <label class="check small"><input type="checkbox" data-auto ${pref.get('autoToken', false) ? 'checked' : ''}> Show token after check-in</label>
      </div></div></div>
      <div class="ops-board" data-board></div>`;
    const board = PP.$('[data-board]', el);

    function ticketExpected(a) {
      const late = PP.toMin(PP.nowTime()) - PP.toMin(a.start);
      return `<article class="ops-ticket">
        <div class="ops-ticket-top"><span class="time-chip">${PP.fmt.time(a.start)}</span>${late > 5 ? `<span class="ops-late">Late ${late} min</span>` : PP.ui.badge(a.status)}</div>
        <div class="ops-ticket-name">${esc(PP.patientName(a.patientId))}<span class="sub mono">${esc(a.patientId)}</span></div>
        <div class="ops-ticket-meta">${esc(PP.proShort(a.professionalId))} · ${esc(PP.serviceName(a.serviceId))}</div>
        <div class="ops-ticket-actions"><button class="btn btn-primary btn-sm" data-act="checkin" data-id="${esc(a.id)}">${PP.icon('check')} Check in</button><a class="btn btn-ghost btn-sm" href="#/appointments/${esc(a.id)}">Details</a><button class="btn btn-ghost btn-sm" data-act="noshow" data-id="${esc(a.id)}">No-show</button></div>
      </article>`;
    }
    function ticketEntry(e) {
      const a = PP.find.appointment(e.appointmentId) || {}; const room = e.roomId ? PP.find.room(e.roomId) : null;
      const head = `<div class="ops-ticket-top"><span class="ops-qno">${esc(qLabel(e))}</span>${e.walkIn ? '<span class="ops-walkin-tag">Walk-in</span>' : a.start ? `<span class="small muted">Appt ${PP.fmt.time(a.start)}</span>` : ''}</div>
        <div class="ops-ticket-name">${esc(PP.patientName(e.patientId))}<span class="sub mono">${esc(e.patientId)}</span></div>`;
      const tokenBtn = `<button class="btn btn-ghost btn-sm btn-icon" data-act="token" data-id="${esc(e.id)}" aria-label="Print token ${esc(qLabel(e))}" title="Print token">${PP.icon('printer')}</button>`;
      if (e.status === 'Waiting') return `<article class="ops-ticket">${head}
        <div class="ops-ticket-meta">${esc(PP.proShort(e.professionalId))} · ${esc(PP.serviceName(a.serviceId))}</div>
        <div class="ops-ticket-meta">${PP.icon('clock')} Waiting <b class="mono" data-since="${esc(e.checkedInAt)}" data-warn="20">${dur(Date.now() - new Date(e.checkedInAt))}</b>${room ? ` · <span class="ops-called">Called to ${esc(room.name)}</span>` : ''}</div>
        <div class="ops-ticket-actions"><button class="btn btn-primary btn-sm" data-act="start" data-id="${esc(e.id)}">${PP.icon('activity')} Start</button><button class="btn btn-sm" data-act="call" data-id="${esc(e.id)}">${room ? 'Change room' : 'Call / room'}</button>${tokenBtn}</div></article>`;
      if (e.status === 'In session') return `<article class="ops-ticket">${head}
        <div class="ops-ticket-meta">${PP.icon('building')} <b>${esc(room ? room.name : 'No room')}</b> · ${esc(PP.proShort(e.professionalId))}</div>
        <div class="ops-ticket-meta">${PP.icon('activity')} In session <b class="mono" data-since="${esc(e.startedAt || e.checkedInAt)}">${dur(Date.now() - new Date(e.startedAt || e.checkedInAt))}</b></div>
        <div class="ops-ticket-actions"><button class="btn btn-primary btn-sm" data-act="checkout" data-id="${esc(e.id)}">${PP.icon('logout')} Check out</button>${tokenBtn}</div></article>`;
      const inv = invoiceForApt(e.appointmentId);
      const bill = inv ? `<a class="btn btn-ghost btn-sm" href="#/billing/${esc(inv.id)}">${esc(inv.id)}</a> ${PP.ui.badge(PP.bill.totals(inv).status)}` : e.packageId ? `<span class="ops-chip teal">Package session · ${esc(e.packageId)}</span>` : PP.can('billing.manage') ? `<button class="btn btn-sm" data-act="invoice" data-id="${esc(e.id)}">${PP.icon('receipt')} Create invoice</button>` : '<span class="small muted">Not invoiced</span>';
      return `<article class="ops-ticket">${head}
        <div class="ops-ticket-meta">${PP.icon('checkCircle')} Done ${esc(clockOf(e.doneAt))} · total ${esc(e.doneAt ? dur(new Date(e.doneAt) - new Date(e.checkedInAt)) : '—')}</div>
        <div class="ops-ticket-actions">${bill}</div></article>`;
    }
    function draw() {
      syncQueue();
      const match = (pid) => !st.q || `${PP.patientName(pid)} ${pid}`.toLowerCase().includes(st.q);
      const apts = PP.db.appointments.filter((a) => a.date === T && PP.inBranch(a) && (!st.pro || a.professionalId === st.pro));
      const expected = apts.filter((a) => ['Confirmed', 'Scheduled'].includes(a.status) && match(a.patientId)).sort((a, b) => a.start.localeCompare(b.start));
      const entries = PP.db.queue.filter((e) => e.date === T && PP.inBranch(e) && (!st.pro || e.professionalId === st.pro) && match(e.patientId));
      const waiting = entries.filter((e) => e.status === 'Waiting').sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
      const inSession = entries.filter((e) => e.status === 'In session').sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
      const done = entries.filter((e) => e.status === 'Done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
      const avgWait = waiting.length ? Math.round(PP.sum(waiting, (e) => Date.now() - new Date(e.checkedInAt)) / waiting.length / 60000) : 0;
      PP.$('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Expected today', value: expected.length, hint: 'Confirmed or scheduled, not yet arrived', tone: 'lavender', icon: 'calendar' })
        + PP.ui.kpi({ label: 'Waiting', value: waiting.length, hint: waiting.length ? `Average wait ${avgWait} min` : 'Nobody waiting', tone: avgWait > 20 ? 'error' : 'warning', icon: 'clock' })
        + PP.ui.kpi({ label: 'In session', value: inSession.length, hint: `${PP.db.rooms.filter((r) => PP.inBranch(r)).length} rooms in view`, tone: 'info', icon: 'activity' })
        + PP.ui.kpi({ label: 'Done', value: done.length, hint: `${done.filter((e) => !invoiceForApt(e.appointmentId) && !e.packageId).length} not invoiced yet`, tone: 'positive', icon: 'checkCircle' });
      const col = (title, c, list, fn, emptyText) => `<section class="ops-col" style="--c:${c}" aria-label="${esc(title)}"><div class="ops-col-head"><h2>${esc(title)}</h2><span class="n">${list.length}</span></div>
        <div class="ops-col-body">${list.length ? list.map(fn).join('') : `<div class="ops-col-empty">${emptyText}</div>`}</div></section>`;
      board.innerHTML = col('Expected', '#6d5bd0', expected, ticketExpected, st.q || st.pro ? 'No matches.' : 'No more appointments expected today.')
        + col('Checked in · waiting', '#e59a2f', waiting, ticketEntry, 'Nobody is waiting.')
        + col('In session', '#1c5f8f', inSession, ticketEntry, 'No sessions running.')
        + col('Done', '#0a6b4f', done, ticketEntry, 'No one checked out yet.');
      updateTimers();
    }
    function updateTimers() {
      tick(el, '[data-since]', (x) => { const ms = Date.now() - new Date(x.dataset.since); x.textContent = dur(ms); if (x.dataset.warn) x.classList.toggle('is-long', ms > Number(x.dataset.warn) * 60000); });
    }
    board.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      const id = b.dataset.id; const act = b.dataset.act;
      if (act === 'checkin') {
        const a = PP.find.appointment(id); if (!a) return;
        if (entryFor(a.id)) { PP.ui.toast('This patient is already in the queue.', 'warning'); draw(); return; }
        const e = newEntry(a, false); setApt(a, 'Checked in', `Queue ${qLabel(e)}`); PP.save();
        PP.ui.toast(`${esc(PP.patientName(a.patientId))} checked in · queue number <b>${esc(qLabel(e))}</b>.`); draw();
        if (pref.get('autoToken', false)) tokenModal(e);
      } else if (act === 'noshow') {
        const a = PP.find.appointment(id);
        const ok = await PP.ui.confirm({ title: 'Mark as no-show?', message: `${esc(PP.patientName(a.patientId))} · ${PP.fmt.time(a.start)} with ${esc(PP.proShort(a.professionalId))}.`, confirmLabel: 'Mark no-show', danger: true });
        if (!ok) return; setApt(a, 'No-show', 'Marked at the check-in desk'); PP.save(); PP.ui.toast('Marked as no-show.', 'info'); draw();
      } else {
        const e = findEntry(id); if (!e) return;
        if (act === 'token') tokenModal(e);
        else if (act === 'call') roomModal(e, {}, draw);
        else if (act === 'start') { if (!e.roomId) roomModal(e, { start: true }, draw); else { startSession(e); draw(); } }
        else if (act === 'checkout') checkoutModal(e, draw);
        else if (act === 'invoice') PP.go(`#/billing/new?patient=${encodeURIComponent(e.patientId)}&appointment=${encodeURIComponent(e.appointmentId)}`);
      }
    });
    PP.$('[data-q]', el).addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); });
    PP.$('[data-pro]', el).addEventListener('change', (e) => { st.pro = e.target.value; draw(); });
    PP.$('[data-auto]', el).addEventListener('change', (e) => pref.set('autoToken', e.target.checked));
    PP.$('[data-walkin]', el).addEventListener('click', () => walkInModal(draw));
    PP.$('[data-call-next]', el).addEventListener('click', () => {
      syncQueue();
      const next = PP.db.queue.filter((e) => e.date === T && PP.inBranch(e) && e.status === 'Waiting' && !e.calledAt && (!st.pro || e.professionalId === st.pro)).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))[0];
      if (!next) { PP.ui.toast('Nobody is waiting to be called.', 'info'); return; }
      roomModal(next, {}, draw);
    });
    draw();
    every(updateTimers, 1000);
    every(() => { if (!PP.$('.modal-backdrop')) draw(); }, 30000);
  }
  PP.route('/queue', { title: 'Queue & Check-in', perm: 'queue.manage', render({ el }) { ensure(); renderQueue(el); } });

  /* ======================================================= WAITING-ROOM DISPLAY */
  PP.route('/queue/display', {
    title: 'Waiting-room Display', perm: 'queue.manage',
    render({ el, query }) {
      ensure(); syncQueue();
      const kiosk = query.kiosk === '1';
      const branch = query.branch || PP.activeBranchId();
      if (kiosk) document.body.classList.add('ops-kiosk');
      const url = `app.html#/queue/display?kiosk=1&nodelay=1${branch !== 'ALL' ? `&branch=${encodeURIComponent(branch)}` : ''}`;
      el.innerHTML = (kiosk ? '' : PP.ui.pageHead({
        title: 'Waiting-room Display', crumbs: [['Queue & Check-in', '#/queue'], ['Display']],
        subtitle: 'For a TV in the waiting area. Shows queue numbers and first names only. Refreshes every few seconds.',
        actions: `<a class="btn btn-ghost" href="#/queue">${PP.icon('chevL')} Back to queue</a><button class="btn" data-fs>${PP.icon('arrowUp')} Full screen</button><button class="btn btn-primary" data-win>${PP.icon('link')} Open in new window</button>`,
      })) + '<div class="ops-display" data-disp></div>';
      const disp = PP.$('[data-disp]', el);
      const last = {};
      function draw() {
        const T = PP.today(); const inB = (r) => branch === 'ALL' || r.branchId === branch;
        const rooms = PP.db.rooms.filter(inB);
        const entries = PP.db.queue.filter((e) => e.date === T && inB(e));
        const waiting = entries.filter((e) => e.status === 'Waiting' && !e.calledAt).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
        const now = new Date();
        disp.innerHTML = `<div class="ops-display-head"><div><div class="clinic">${esc(PP.db.settings.clinicName)}</div><div class="branch">${branch === 'ALL' ? 'All branches' : esc(PP.branchName(branch))}</div></div>
          <div class="ops-clock"><div class="t" data-clock>${esc(PP.fmt.time(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`))}</div><div class="d">${esc(PP.fmt.dateLong(T))}</div></div></div>
          <div class="ops-display-main">
            <section><h2>Now serving</h2><div class="ops-rooms">${rooms.map((r) => {
              const cur = entries.filter((e) => e.roomId === r.id && e.status === 'In session').sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
              const called = entries.filter((e) => e.roomId === r.id && e.status === 'Waiting' && e.calledAt).sort((a, b) => b.calledAt.localeCompare(a.calledAt))[0];
              const show = called || cur; const key = show ? show.id + show.status : '';
              const isNew = last[r.id] !== undefined && last[r.id] !== key && show; last[r.id] = key;
              if (!show) return `<div class="ops-room free"><div class="rname">${esc(r.name)}</div><div class="rno">—</div><div class="rpro">Available</div></div>`;
              return `<div class="ops-room ${isNew ? 'is-new' : ''}"><div class="rname">${esc(r.name)}</div><div class="rno">${esc(qLabel(show))}</div><div class="rwho">${esc(firstName(show.patientId))}</div>
                <div class="rpro">${called ? 'Please go to this room' : 'In session'} · ${esc(PP.proShort(show.professionalId))}</div>${called && cur ? `<div class="rnext">Finishing: ${esc(qLabel(cur))}</div>` : ''}</div>`;
            }).join('') || '<div class="ops-room free"><div class="rname">No rooms set up</div></div>'}</div></section>
            <section><h2>Next in line</h2><ol class="ops-next">${waiting.slice(0, 5).map((e) => `<li><span class="no">${esc(qLabel(e))}</span><span class="who">${esc(firstName(e.patientId))}</span></li>`).join('') || '<li class="empty-line">No one waiting. Please take a seat; reception will call you.</li>'}</ol>
              ${waiting.length > 5 ? `<p style="color:#9fd3cf;margin-top:10px">+ ${waiting.length - 5} more waiting</p>` : ''}</section>
          </div>
          <div class="ops-display-foot"><span>Please keep your token ready. Numbers are called in order of arrival and room availability.</span><span>Updated ${esc(clockOf(PP.nowStamp()))}</span></div>`;
      }
      draw();
      every(() => { const c = PP.$('[data-clock]', disp); if (c) { const d = new Date(); c.textContent = PP.fmt.time(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); } }, 1000);
      every(() => {
        let raw = null; try { raw = localStorage.getItem(PP.STORE_KEY); } catch (e) { raw = null; }
        if (raw && raw !== PP._lastJson) { PP.load(); ensure(); }
        draw();
      }, 4000);
      if (!kiosk) {
        PP.$('[data-win]', el).addEventListener('click', () => { const w = window.open(url, 'ppQueueDisplay', 'width=1280,height=760'); if (!w) PP.ui.toast('The browser blocked the new window. Allow pop-ups for this page.', 'warning'); else PP.ui.toast('Display opened in a new window. Drag it to the waiting-room screen.', 'info'); });
        PP.$('[data-fs]', el).addEventListener('click', () => { if (disp.requestFullscreen) disp.requestFullscreen().catch(() => PP.ui.toast('Full screen is not available here.', 'warning')); });
      }
    },
  });

  /* ================================================================ PACKAGES */
  const pkgState = (k) => { const T = PP.today(); if (k.sessionsUsed >= k.sessionsTotal || k.status === 'Used up') return 'Used up'; if (k.expires < T) return 'Expired'; if (PP.diffDays(T, k.expires) <= 14) return 'Expiring'; return 'Active'; };
  const PKG_TONE = { Active: 'positive', Expiring: 'warning', Expired: 'error', 'Used up': 'neutral' };
  const pkgBranch = (k) => k.branchId || (PP.find.invoice(k.invoiceId) || {}).branchId || '';
  const pkgs = () => PP.db.packages.filter((k) => PP.inBranch({ branchId: pkgBranch(k) }));
  const memState = (m) => { const d = PP.diffDays(PP.today(), m.renewsOn); return m.status === 'Cancelled' ? 'Cancelled' : d < 0 ? 'Lapsed' : d <= 14 ? 'Due soon' : 'Active'; };
  const MEM_TONE = { Active: 'positive', 'Due soon': 'warning', Lapsed: 'error', Cancelled: 'neutral' };
  const planOf = (id) => PP.db.membershipPlans.find((p) => p.id === id) || null;

  function deductSession(k, { note, appointmentId, date }) {
    k.sessionsUsed = Math.min(k.sessionsTotal, k.sessionsUsed + 1);
    if (k.sessionsUsed >= k.sessionsTotal) k.status = 'Used up';
    PP.db.packageUsage.push({ id: uid('PKU', 'packageUsage', 4), packageId: k.id, type: 'Deduction', date: date || PP.today(), note: note || '', appointmentId: appointmentId || null, by: me().name || 'System', at: PP.nowStamp() });
    PP.audit('Package session deducted', k.id, `${k.sessionsUsed}/${k.sessionsTotal} · ${note || ''}`);
  }
  function payBadge(invId) { const inv = PP.find.invoice(invId); if (!inv) return '<span class="muted">—</span>'; const t = PP.bill.totals(inv); return `<a href="#/billing/${esc(inv.id)}" class="mono">${esc(inv.id)}</a> ${PP.ui.badge(t.status)}${t.due ? `<span class="sub">Due ${money(t.due)}</span>` : ''}`; }

  function deductModal(k, done) {
    const st0 = pkgState(k);
    const apts = PP.db.appointments.filter((a) => a.patientId === k.patientId && a.date <= PP.today() && a.date >= PP.addDays(PP.today(), -14) && ['Completed', 'In session', 'Checked in'].includes(a.status)).sort((a, b) => b.date.localeCompare(a.date));
    PP.ui.modal({
      title: `Deduct a session · ${esc(k.id)}`, size: 'sm',
      body: `<form novalidate class="stack">
        <div class="ops-muted-box">${esc(PP.patientName(k.patientId))} · ${esc(PP.serviceName(k.serviceId))}<br><b>${k.sessionsTotal - k.sessionsUsed}</b> of ${k.sessionsTotal} sessions left · expires ${esc(PP.fmt.date(k.expires))}</div>
        ${st0 === 'Expired' ? PP.ui.alert('error', `This package expired on ${esc(PP.fmt.date(k.expires))}. Extend the validity first (with a reason).`) : ''}
        ${PP.form.field({ type: 'date', name: 'date', label: 'Session date', required: true, value: PP.today(), max: PP.today() })}
        ${PP.form.field({ type: 'select', name: 'appointmentId', label: 'Linked appointment', options: apts.map((a) => [a.id, `${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)} · ${PP.serviceName(a.serviceId)}`]), placeholder: 'None (manual deduction)' })}
        ${PP.form.field({ type: 'textarea', name: 'note', label: 'Note', required: true, rows: 2, placeholder: 'Why is this session deducted manually?' })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Deduct 1 session', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        if (pkgState(k) === 'Expired') { PP.form.setError(f, 'date', 'The package has expired. Extend it first.'); return false; }
        if (k.sessionsUsed >= k.sessionsTotal) { PP.form.setError(f, 'note', 'No sessions left in this package.'); return false; }
        const v = PP.form.read(f);
        if (v.date < k.start) { PP.form.setError(f, 'date', `The package started on ${PP.fmt.date(k.start)}.`); return false; }
        deductSession(k, { note: v.note, appointmentId: v.appointmentId || null, date: v.date }); PP.save();
        PP.ui.toast(`Session deducted. ${k.sessionsTotal - k.sessionsUsed} left on ${esc(k.id)}.`); if (done) done();
      } }],
    });
  }
  function extendModal(k, done) {
    const base = k.expires > PP.today() ? k.expires : PP.today();
    PP.ui.modal({
      title: `Extend validity · ${esc(k.id)}`, size: 'sm',
      body: `<form novalidate class="stack">
        <div class="ops-muted-box">Current expiry <b>${esc(PP.fmt.date(k.expires))}</b> (${esc(relDays(k.expires))})</div>
        ${PP.form.field({ type: 'date', name: 'to', label: 'New expiry date', required: true, value: PP.addDays(base, 14), min: PP.addDays(k.expires, 1) })}
        ${PP.form.field({ type: 'textarea', name: 'reason', label: 'Reason', required: true, rows: 2, placeholder: 'e.g. patient was in hospital for 10 days' })}
        <div class="ops-note">Extensions are recorded in the usage history and the audit log.</div>
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Extend', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        if (v.to <= k.expires) { PP.form.setError(f, 'to', 'Choose a date after the current expiry.'); return false; }
        const from = k.expires; k.expires = v.to; if (k.status === 'Expired') k.status = 'Active';
        PP.db.packageUsage.push({ id: uid('PKU', 'packageUsage', 4), packageId: k.id, type: 'Extension', date: PP.today(), from, to: v.to, note: v.reason, by: me().name || 'System', at: PP.nowStamp() });
        PP.audit('Package validity extended', k.id, `${from} → ${v.to} · ${v.reason}`); PP.save();
        PP.ui.toast(`Validity extended to ${esc(PP.fmt.date(v.to))}.`); if (done) done();
      } }],
    });
  }
  function historyModal(k) {
    const inv = PP.find.invoice(k.invoiceId);
    const items = PP.db.packageUsage.filter((u) => u.packageId === k.id).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
    PP.ui.modal({
      title: `Usage history · ${esc(k.id)}`, size: 'lg',
      body: `${kv([['Patient', `<a href="#/patients/${esc(k.patientId)}">${esc(PP.patientName(k.patientId))}</a> <span class="muted mono">${esc(k.patientId)}</span>`], ['Package', esc(PP.serviceName(k.serviceId))], ['Sessions', `${k.sessionsUsed} of ${k.sessionsTotal} used`], ['Validity', `${esc(PP.fmt.date(k.start))} → ${esc(PP.fmt.date(k.expires))} ${PP.ui.badge(pkgState(k), PKG_TONE[pkgState(k)])}`], ['Invoice', payBadge(k.invoiceId)]])}
        <div class="divider"></div>
        <ul class="timeline">${items.map((u) => `<li><div class="tl-date">${esc(PP.fmt.dateShort(u.date))}</div><div class="tl-body"><b>${u.type === 'Extension' ? `Validity extended ${esc(PP.fmt.date(u.from))} → ${esc(PP.fmt.date(u.to))}` : 'Session deducted'}</b>${u.appointmentId ? ` · <a href="#/appointments/${esc(u.appointmentId)}">${esc(u.appointmentId)}</a>` : ''}<div class="small muted">${esc(u.note || '')} · ${esc(u.by || '')}</div></div></li>`).join('')}
          <li><div class="tl-date">${esc(PP.fmt.dateShort(k.start))}</div><div class="tl-body"><b>Package sold</b><div class="small muted">${inv ? `${esc(inv.id)} · ${money(PP.bill.totals(inv).payable)} · commission accrues only as payments are received (D-026)` : ''}</div></div></li></ul>`,
      buttons: [{ label: 'Close', kind: 'ghost' }],
    });
  }

  function tabPatientPackages(host) {
    const list = pkgs();
    const expiring = list.filter((k) => pkgState(k) === 'Expiring');
    host.innerHTML = `<div class="grid grid-4 ops-kpis">
        ${PP.ui.kpi({ label: 'Active packages', value: list.filter((k) => ['Active', 'Expiring'].includes(pkgState(k))).length, tone: 'positive', icon: 'layers' })}
        ${PP.ui.kpi({ label: 'Expiring within 14 days', value: expiring.length, tone: 'warning', icon: 'clock', hint: 'Remind the patient to book' })}
        ${PP.ui.kpi({ label: 'Sessions remaining', value: PP.sum(list.filter((k) => ['Active', 'Expiring'].includes(pkgState(k))), (k) => k.sessionsTotal - k.sessionsUsed), tone: 'info', icon: 'repeat' })}
        ${PP.ui.kpi({ label: 'Expired or used up', value: list.filter((k) => ['Expired', 'Used up'].includes(pkgState(k))).length, tone: 'lavender', icon: 'layers' })}
      </div>
      ${expiring.length ? `<div class="mt-2" style="margin-bottom:16px">${PP.ui.alert('warning', `<b>Expiring within 14 days:</b> ${expiring.map((k) => `${esc(PP.patientName(k.patientId))} (${esc(k.id)}, ${k.sessionsTotal - k.sessionsUsed} left, ${esc(relDays(k.expires))})`).join(' · ')}`)}</div>` : ''}
      <div class="card" data-tbl></div>`;
    const tbl = PP.$('[data-tbl]', host);
    PP.ui.table(tbl, {
      getRows: () => pkgs().slice().sort((a, b) => a.expires.localeCompare(b.expires)), exportName: 'patient-packages', pageSize: 10,
      search: { placeholder: 'Search patient, ID or package', text: (k) => `${PP.patientName(k.patientId)} ${k.patientId} ${k.id} ${PP.serviceName(k.serviceId)}` },
      filters: [{ id: 'st', label: 'All statuses', options: ['Active', 'Expiring', 'Expired', 'Used up'].map((s) => [s, s]), match: (k, v) => pkgState(k) === v }],
      rowClass: (k) => (pkgState(k) === 'Expiring' ? 'ops-row-warn' : ''),
      columns: [
        { key: 'id', label: 'Package', sort: (k) => k.id, render: (k) => `<b class="mono">${esc(k.id)}</b><span class="sub">${esc(PP.serviceName(k.serviceId))}</span>` },
        { key: 'p', label: 'Patient', sort: (k) => PP.patientName(k.patientId), render: (k) => `<a href="#/patients/${esc(k.patientId)}">${esc(PP.patientName(k.patientId))}</a><span class="sub mono">${esc(k.patientId)}</span>` },
        { key: 'u', label: 'Sessions used', sort: (k) => k.sessionsUsed / k.sessionsTotal, exportValue: (k) => `${k.sessionsUsed}/${k.sessionsTotal}`, render: (k) => { const s = pkgState(k); return `<div class="ops-progress ${s === 'Expiring' ? 'warn' : s === 'Used up' || s === 'Expired' ? 'done' : ''}"><span style="width:${Math.round((k.sessionsUsed / k.sessionsTotal) * 100)}%"></span></div><span class="sub">${k.sessionsUsed} / ${k.sessionsTotal} used</span>`; } },
        { key: 'e', label: 'Expiry', sort: (k) => k.expires, exportValue: (k) => k.expires, render: (k) => `${esc(PP.fmt.date(k.expires))}<span class="sub">${esc(relDays(k.expires))}</span>` },
        { key: 's', label: 'Status', sort: (k) => pkgState(k), exportValue: (k) => pkgState(k), render: (k) => PP.ui.badge(pkgState(k), PKG_TONE[pkgState(k)]) },
        { key: 'i', label: 'Payment', exportValue: (k) => k.invoiceId, render: (k) => payBadge(k.invoiceId) },
        { key: 'a', label: '', render: (k) => { const s = pkgState(k); return `<div class="row-actions"><button class="btn btn-sm" data-pa="deduct" data-id="${esc(k.id)}" ${s === 'Used up' || s === 'Expired' ? 'disabled' : ''}>Deduct</button><button class="btn btn-ghost btn-sm" data-pa="extend" data-id="${esc(k.id)}" ${s === 'Used up' ? 'disabled' : ''}>Extend</button><button class="btn btn-ghost btn-sm" data-pa="hist" data-id="${esc(k.id)}">History</button></div>`; } },
      ],
      empty: { icon: 'layers', title: 'No packages sold yet', text: 'Sell a package from the “Sell package” tab.' },
    });
    tbl.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pa]'); if (!b) return; const k = PP.db.packages.find((x) => x.id === b.dataset.id); if (!k) return;
      const redraw = () => tabPatientPackages(host);
      if (b.dataset.pa === 'deduct') deductModal(k, redraw); else if (b.dataset.pa === 'extend') extendModal(k, redraw); else historyModal(k);
    });
  }

  function tabSell(host, switchTo) {
    const svcs = PP.db.services.filter((s) => s.isPackage && s.status === 'Active');
    if (!svcs.length) { host.innerHTML = `<div class="card">${PP.ui.empty({ icon: 'layers', title: 'No package services', text: 'Create a service marked as a package in Services &amp; Pricing first.', action: PP.can('services.manage') ? '<a class="btn btn-primary" href="#/services">Open Services &amp; Pricing</a>' : '' })}</div>`; return; }
    host.innerHTML = `<form novalidate class="ops-split" data-sell>
      <section class="card"><div class="card-head"><h2>Sell a package</h2></div><div class="card-body"><div class="form-grid">
        <div class="full">${patientField('patientId', '')}</div>
        ${PP.form.field({ type: 'select', name: 'serviceId', label: 'Package', required: true, options: svcs.map((s) => [s.id, `${s.name} · ${money(s.price)}`]), value: svcs[0].id })}
        ${PP.form.field({ type: 'select', name: 'professionalId', label: `${PP.t('professional')} (commission)`, required: true, options: proOptions(), value: myProId(), hint: `Commission goes to this ${esc(PP.tl('professional'))} as the money is received (D-026).` })}
        ${PP.form.field({ type: 'date', name: 'start', label: 'Start date', required: true, value: PP.today() })}
        ${PP.form.field({ type: 'number', name: 'discount', label: 'Discount (BDT)', value: 0, min: 0, rule: 'nonneg' })}
        ${PP.form.field({ name: 'discountReason', label: 'Discount reason', full: true, placeholder: 'Required when a discount is given' })}
        <div class="full divider" style="margin:4px 0"></div>
        ${PP.form.field({ type: 'checkbox', name: 'pay', label: 'Record a payment now', value: true, full: true })}
        <div class="full form-grid" data-paybox style="padding:0">
          ${PP.form.field({ type: 'number', name: 'amount', label: 'Amount received (BDT)', required: true, rule: 'positive', min: 0 })}
          ${PP.form.field({ type: 'select', name: 'method', label: 'Payment method', required: true, options: PP.PAYMENT_METHODS, value: 'Cash' })}
        </div>
      </div>
      <div class="form-actions"><button type="reset" class="btn btn-ghost">Clear</button><button type="submit" class="btn btn-primary" data-submit>${PP.icon('check')} Create invoice and package</button></div></div></section>
      <aside class="card ops-sticky"><div class="card-head"><h2>Summary</h2></div><div class="card-body" data-sum></div></aside>
    </form>`;
    const f = PP.$('[data-sell]', host);
    bindPatientField(f, 'patientId', () => summary());
    const val = (n) => PP.$(`[name=${n}]`, f);
    function summary() {
      const s = PP.find.service(val('serviceId').value); if (!s) return;
      const disc = Math.max(0, Number(val('discount').value) || 0); const payable = Math.max(0, s.price - disc);
      if (!val('amount').dataset.touched) val('amount').value = payable;
      const pid = val('patientId').value; const existing = pid ? PP.db.packages.filter((k) => k.patientId === pid && ['Active', 'Expiring'].includes(pkgState(k))) : [];
      PP.$('[data-sum]', f).innerHTML = `<dl class="ops-sum"><dt>Package</dt><dd>${esc(s.name)}</dd><dt>Sessions</dt><dd>${esc(s.sessions)}</dd><dt>Validity</dt><dd>${esc(s.validityDays)} days</dd>
        <dt>Expires</dt><dd>${esc(PP.fmt.date(PP.addDays(val('start').value || PP.today(), s.validityDays || 60)))}</dd><dt>Price</dt><dd>${money(s.price)}</dd><dt>Discount</dt><dd>${disc ? '− ' + money(disc) : '—'}</dd>
        <dt>Payable</dt><dd class="big">${money(payable)}</dd><dt>Per session</dt><dd>${money(PP.round2(payable / (s.sessions || 1)))}</dd></dl>
        <div class="divider"></div>${PP.ui.alert('info', 'The invoice is created like any other invoice. Commission is earned only when the package money is received, in proportion to each payment (D-025, D-026).')}
        ${existing.length ? `<div class="mt-3">${PP.ui.alert('warning', `This patient already has ${existing.length} active package${existing.length > 1 ? 's' : ''}: ${existing.map((k) => `${esc(k.id)} (${k.sessionsTotal - k.sessionsUsed} left)`).join(', ')}.`)}</div>` : ''}`;
    }
    ['serviceId', 'discount', 'start'].forEach((n) => val(n).addEventListener('input', summary));
    val('serviceId').addEventListener('change', () => { delete val('amount').dataset.touched; summary(); });
    val('amount').addEventListener('input', () => { val('amount').dataset.touched = '1'; });
    val('pay').addEventListener('change', () => { const on = val('pay').checked; PP.$('[data-paybox]', f).classList.toggle('hidden', !on); val('amount').disabled = !on; val('method').disabled = !on; });
    f.addEventListener('reset', () => setTimeout(() => { delete val('amount').dataset.touched; PP.form.clearErrors(f); summary(); }, 0));
    summary();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!PP.form.validate(f)) return;
      const v = PP.form.read(f); const s = PP.find.service(v.serviceId); const disc = Number(v.discount) || 0; const payable = s.price - disc;
      if (disc >= s.price) { PP.form.setError(f, 'discount', 'The discount must be less than the package price.'); return; }
      if (disc > 0 && !v.discountReason) { PP.form.setError(f, 'discountReason', 'Give a reason for the discount.'); val('discountReason').focus(); return; }
      if (v.pay && Number(v.amount) > payable) { PP.form.setError(f, 'amount', `The amount cannot be more than the payable ${money(payable)}.`); return; }
      await PP.ui.busy(PP.$('[data-submit]', f), () => {
        const pro = PP.find.professional(v.professionalId);
        const inv = makeInvoice({ patientId: v.patientId, professionalId: pro.id, branchId: branchOfNew(pro.branchId), lines: [{ serviceId: s.id, description: s.name, qty: 1, unitPrice: s.price, defaultPrice: s.price, overrideReason: '' }], discount: disc, discountReason: v.discountReason, notes: 'Package' });
        let pay = null;
        if (v.pay) pay = PP.bill.recordPayment({ invoiceId: inv.id, amount: Number(v.amount), method: v.method, date: PP.today() });
        if (!PP.db.counters.PKG) PP.db.counters.PKG = PP.db.packages.length;
        const k = { id: uid('PKG', 'packages', 3), patientId: v.patientId, serviceId: s.id, invoiceId: inv.id, sessionsTotal: s.sessions, sessionsUsed: 0, start: v.start, expires: PP.addDays(v.start, s.validityDays || 60), status: 'Active', branchId: inv.branchId };
        PP.db.packages.push(k);
        PP.audit('Package sold', k.id, `${s.name} · ${PP.patientName(v.patientId)} · ${inv.id}`); PP.save();
        const t = PP.bill.totals(inv);
        PP.ui.toast(`Package ${esc(k.id)} sold. Invoice ${esc(inv.id)} · ${esc(t.status)}.`);
        host.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px 20px">
          <div class="success-mark">${PP.icon('checkCircle')}</div><h2>Package ${esc(k.id)} is active</h2>
          <p class="muted">${esc(PP.patientName(v.patientId))} · ${esc(s.name)} · valid until ${esc(PP.fmt.date(k.expires))}</p>
          <p>Invoice <b class="mono">${esc(inv.id)}</b> ${PP.ui.badge(t.status)} · paid ${money(t.net)}${t.due ? ` · due ${money(t.due)}` : ''}${pay && pay.status === 'Completed' ? ' · commission accrued on the received amount' : ''}</p>
          <div class="row" style="justify-content:center"><a class="btn" href="#/billing/${esc(inv.id)}">${PP.icon('receipt')} View invoice</a><button class="btn" data-go-list>See patient packages</button><button class="btn btn-primary" data-again>Sell another</button></div></div></div>`;
        PP.$('[data-again]', host).addEventListener('click', () => tabSell(host, switchTo));
        PP.$('[data-go-list]', host).addEventListener('click', () => switchTo('patient'));
      });
    });
  }

  function planModal(plan, done) {
    const p = plan || { name: '', months: 6, price: 0, discountPercent: 10, benefits: '', status: 'Active' };
    PP.ui.modal({
      title: plan ? `Edit plan · ${esc(plan.name)}` : 'New membership plan',
      body: `<form novalidate class="form-grid">
        ${PP.form.field({ name: 'name', label: 'Plan name', required: true, value: p.name, full: true })}
        ${PP.form.field({ type: 'number', name: 'months', label: 'Duration (months)', required: true, value: p.months, min: 1, rule: 'positive' })}
        ${PP.form.field({ type: 'number', name: 'price', label: 'Fee (BDT)', required: true, value: p.price || '', rule: 'positive' })}
        ${PP.form.field({ type: 'number', name: 'discountPercent', label: 'Session discount (%)', value: p.discountPercent, min: 0, max: 100, rule: 'nonneg' })}
        ${PP.form.field({ type: 'select', name: 'status', label: 'Status', required: true, value: p.status, options: ['Active', 'Inactive'], placeholder: false })}
        ${PP.form.field({ type: 'textarea', name: 'benefits', label: 'Benefits', value: p.benefits, rows: 2, full: true })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save plan', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        if (Number(v.discountPercent) > 100) { PP.form.setError(f, 'discountPercent', 'Enter 0–100.'); return false; }
        if (PP.db.membershipPlans.some((x) => x !== plan && x.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'A plan with this name already exists.'); return false; }
        const rec = plan || { id: uid('MSP', 'membershipPlans', 1) };
        Object.assign(rec, { name: v.name, months: Number(v.months), price: Number(v.price), discountPercent: Number(v.discountPercent) || 0, benefits: v.benefits, status: v.status });
        if (!plan) PP.db.membershipPlans.push(rec);
        PP.audit(plan ? 'Membership plan edited' : 'Membership plan created', rec.id, rec.name); PP.save(); PP.ui.toast(`Plan “${esc(rec.name)}” saved.`); if (done) done();
      } }],
    });
  }
  function memberModal(member, done) {
    const plans = PP.db.membershipPlans.filter((p) => p.status === 'Active' || (member && p.id === member.planId));
    if (!plans.length) { PP.ui.toast('Create an active membership plan first.', 'warning'); return; }
    const renew = !!member;
    PP.ui.modal({
      title: renew ? `Renew membership · ${esc(PP.patientName(member.patientId))}` : 'Add member',
      body: `<form novalidate class="stack">
        ${renew ? `<div class="ops-muted-box">${esc(member.id)} · current renewal date <b>${esc(PP.fmt.date(member.renewsOn))}</b> ${PP.ui.badge(memState(member), MEM_TONE[memState(member)])}</div>` : patientField('patientId', '')}
        <div class="form-grid">
          ${PP.form.field({ type: 'select', name: 'planId', label: 'Plan', required: true, value: renew ? member.planId : plans[0].id, options: plans.map((p) => [p.id, `${p.name} · ${p.months} months · ${money(p.price)}`]), placeholder: false })}
          ${renew ? '<div class="field"><label>New renewal date</label><input class="input" readonly data-newdate></div>' : PP.form.field({ type: 'date', name: 'start', label: 'Start date', required: true, value: PP.today() })}
          ${PP.form.field({ type: 'checkbox', name: 'pay', label: 'Fee received now (records the payment)', value: true, full: true })}
          ${PP.form.field({ type: 'select', name: 'method', label: 'Payment method', required: true, options: PP.PAYMENT_METHODS, value: 'Cash' })}
        </div>
        <div class="ops-note">An invoice is created for the fee. Membership invoices have no ${esc(PP.tl('professional'))}, so they carry no commission.</div>
      </form>`,
      onOpen: (body) => {
        if (!renew) bindPatientField(body, 'patientId');
        const upd = () => { const nd = PP.$('[data-newdate]', body); if (nd) { const p = planOf(PP.$('[name=planId]', body).value); nd.value = PP.fmt.date(addMonths(member.renewsOn > PP.today() ? member.renewsOn : PP.today(), p.months)); } };
        PP.$('[name=planId]', body).addEventListener('change', upd); upd();
        PP.$('[name=pay]', body).addEventListener('change', (e) => { PP.$('[name=method]', body).disabled = !e.target.checked; });
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: renew ? 'Renew' : 'Add member', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f); const plan = planOf(v.planId);
        const pid = renew ? member.patientId : v.patientId;
        if (!renew && PP.db.memberships.some((m) => m.patientId === pid && ['Active', 'Due soon'].includes(memState(m)))) { PP.form.setError(f, 'patientId', 'This patient already has an active membership. Renew it instead.'); return false; }
        const pt = PP.find.patient(pid);
        const inv = makeInvoice({ patientId: pid, professionalId: null, branchId: branchOfNew(pt && pt.branchId), lines: [{ serviceId: null, description: `Membership ${renew ? 'renewal' : 'fee'}: ${plan.name} (${plan.months} months)`, qty: 1, unitPrice: plan.price, defaultPrice: plan.price, overrideReason: '' }], notes: 'Membership' });
        if (v.pay) PP.bill.recordPayment({ invoiceId: inv.id, amount: plan.price, method: v.method, date: PP.today() });
        if (renew) {
          const from = member.renewsOn; member.planId = plan.id; member.renewsOn = addMonths(member.renewsOn > PP.today() ? member.renewsOn : PP.today(), plan.months); member.status = 'Active';
          member.history.push({ date: PP.today(), action: 'Renewed', amount: plan.price, invoiceId: inv.id, by: me().name || '', note: `${from} → ${member.renewsOn}` });
          PP.audit('Membership renewed', member.id, `${plan.name} · until ${member.renewsOn} · ${inv.id}`);
          PP.ui.toast(`Membership renewed until ${esc(PP.fmt.date(member.renewsOn))}. Invoice ${esc(inv.id)}.`);
        } else {
          const m = { id: uid('MEM', 'memberships', 3), patientId: pid, planId: plan.id, start: v.start, renewsOn: addMonths(v.start, plan.months), status: 'Active', branchId: inv.branchId, history: [{ date: PP.today(), action: 'Joined', amount: plan.price, invoiceId: inv.id, by: me().name || '' }] };
          PP.db.memberships.push(m); PP.audit('Membership created', m.id, `${plan.name} · ${PP.patientName(pid)} · ${inv.id}`);
          PP.ui.toast(`${esc(PP.patientName(pid))} joined ${esc(plan.name)}. Invoice ${esc(inv.id)}.`);
        }
        PP.save(); if (done) done();
      } }],
    });
  }
  function tabMemberships(host) {
    const mems = () => PP.db.memberships.filter((m) => PP.inBranch(m));
    const plans = PP.db.membershipPlans;
    host.innerHTML = `${PP.ui.card({ title: 'Membership plans', actions: `<button class="btn btn-sm" data-newplan>${PP.icon('plus')} New plan</button>`, body: plans.length ? `<div class="ops-plan-grid">${plans.map((p) => `<div class="ops-plan ${p.status !== 'Active' ? 'inactive' : ''}">
        <div class="row between"><b>${esc(p.name)}</b>${PP.ui.badge(p.status)}</div><div class="price">${money(p.price)} <small>/ ${esc(p.months)} months</small></div>
        <div class="small muted">${esc(p.benefits || '—')}</div><div class="small"><b>${mems().filter((m) => m.planId === p.id && memState(m) !== 'Lapsed').length}</b> active members · ${esc(p.discountPercent)}% session discount</div>
        <div><button class="btn btn-ghost btn-sm" data-editplan="${esc(p.id)}">${PP.icon('edit')} Edit</button></div></div>`).join('')}</div>` : PP.ui.empty({ icon: 'tag', title: 'No plans yet', text: 'Create a plan to start memberships.' }) })}
      <div class="card mt-4"><div class="card-head"><h2>Members</h2><div class="row"><button class="btn btn-primary btn-sm" data-newmem>${PP.icon('userPlus')} Add member</button></div></div><div data-tbl></div></div>`;
    const redraw = () => tabMemberships(host);
    PP.$('[data-newplan]', host).addEventListener('click', () => planModal(null, redraw));
    PP.$$('[data-editplan]', host).forEach((b) => b.addEventListener('click', () => planModal(planOf(b.dataset.editplan), redraw)));
    PP.$('[data-newmem]', host).addEventListener('click', () => memberModal(null, redraw));
    const tbl = PP.$('[data-tbl]', host);
    PP.ui.table(tbl, {
      getRows: () => mems().slice().sort((a, b) => a.renewsOn.localeCompare(b.renewsOn)), exportName: 'memberships', pageSize: 10,
      search: { placeholder: 'Search member', text: (m) => `${PP.patientName(m.patientId)} ${m.patientId} ${m.id}` },
      filters: [{ id: 'st', label: 'All statuses', options: ['Active', 'Due soon', 'Lapsed'].map((s) => [s, s]), match: (m, v) => memState(m) === v }, { id: 'pl', label: 'All plans', options: plans.map((p) => [p.id, p.name]), match: (m, v) => m.planId === v }],
      rowClass: (m) => (memState(m) === 'Due soon' ? 'ops-row-warn' : ''),
      columns: [
        { key: 'm', label: 'Member', sort: (m) => PP.patientName(m.patientId), render: (m) => `<a href="#/patients/${esc(m.patientId)}">${esc(PP.patientName(m.patientId))}</a><span class="sub mono">${esc(m.id)} · ${esc(m.patientId)}</span>` },
        { key: 'p', label: 'Plan', sort: (m) => (planOf(m.planId) || {}).name, render: (m) => esc((planOf(m.planId) || {}).name || '—') },
        { key: 's', label: 'Member since', sort: (m) => m.start, render: (m) => esc(PP.fmt.date(m.history && m.history[0] ? m.history[0].date : m.start)) },
        { key: 'r', label: 'Renews on', sort: (m) => m.renewsOn, exportValue: (m) => m.renewsOn, render: (m) => `${esc(PP.fmt.date(m.renewsOn))}<span class="sub">${esc(relDays(m.renewsOn))}</span>` },
        { key: 'st', label: 'Status', sort: (m) => memState(m), exportValue: (m) => memState(m), render: (m) => PP.ui.badge(memState(m), MEM_TONE[memState(m)]) },
        { key: 'a', label: '', render: (m) => `<button class="btn btn-sm ${memState(m) !== 'Active' ? 'btn-primary' : ''}" data-renew="${esc(m.id)}">${PP.icon('repeat')} Renew</button>` },
      ],
      empty: { icon: 'users', title: 'No members yet', text: 'Add a member to a plan.' },
    });
    tbl.addEventListener('click', (ev) => { const b = ev.target.closest('[data-renew]'); if (!b) return; memberModal(PP.db.memberships.find((m) => m.id === b.dataset.renew), redraw); });
  }
  function tabCatalogue(host) {
    const rows = PP.db.services.filter((s) => s.isPackage);
    host.innerHTML = `<div class="card" data-tbl></div><p class="ops-note mt-3">Package services are managed in Services &amp; Pricing (mark a service as a package and set sessions and validity).</p>`;
    PP.ui.table(PP.$('[data-tbl]', host), {
      rows, exportName: 'package-catalogue',
      tools: PP.can('services.manage') ? `<a class="btn" href="#/services">${PP.icon('tag')} Services &amp; Pricing</a>` : '',
      columns: [
        { key: 'name', label: 'Package', sort: (s) => s.name, render: (s) => `<b>${esc(s.name)}</b><span class="sub mono">${esc(s.id)}</span>` },
        { key: 'sessions', label: 'Sessions', align: 'right', sort: (s) => s.sessions },
        { key: 'validityDays', label: 'Validity', sort: (s) => s.validityDays, render: (s) => `${esc(s.validityDays)} days` },
        { key: 'price', label: 'Price', align: 'right', sort: (s) => s.price, render: (s) => money(s.price) },
        { key: 'per', label: 'Per session', align: 'right', render: (s) => money(PP.round2(s.price / (s.sessions || 1))) },
        { key: 'sold', label: 'Sold', align: 'right', render: (s) => String(PP.db.packages.filter((k) => k.serviceId === s.id).length) },
        { key: 'act', label: 'Active now', align: 'right', render: (s) => String(PP.db.packages.filter((k) => k.serviceId === s.id && ['Active', 'Expiring'].includes(pkgState(k))).length) },
        { key: 'status', label: 'Status', render: (s) => PP.ui.badge(s.status) },
      ],
      empty: { icon: 'layers', title: 'No package services' },
    });
  }
  PP.route('/packages', {
    title: 'Packages & Memberships', perm: 'packages.manage',
    render({ el, query }) {
      ensure();
      const tabs = [['patient', 'Patient packages'], ['sell', 'Sell package'], ['members', 'Memberships'], ['catalogue', 'Catalogue']];
      let active = tabs.some((t) => t[0] === query.tab) ? query.tab : 'patient';
      el.innerHTML = PP.ui.pageHead({ title: 'Packages &amp; Memberships', crumbs: [['Patients', '#/patients'], ['Packages & Memberships']], subtitle: 'Session packages with validity, deductions, extensions and usage history; membership plans and renewals.' })
        + '<div class="ops-tabs-host mb-tabs" data-tabs></div><div data-body></div>';
      const body = PP.$('[data-body]', el);
      const show = (id) => { active = id; if (id === 'patient') tabPatientPackages(body); else if (id === 'sell') tabSell(body, switchTo); else if (id === 'members') tabMemberships(body); else tabCatalogue(body); };
      const drawTabs = () => PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: tabs.map(([id, label]) => ({ id, label, count: id === 'patient' ? pkgs().filter((k) => pkgState(k) === 'Expiring').length || null : null })), active, onChange: show });
      function switchTo(id) { active = id; drawTabs(); show(id); }
      drawTabs(); show(active);
    },
  });

  /* =============================================================== EXERCISES */
  const AREA_TONE = { Knee: ['#e6f6f3', '#0a6b4f'], Spine: ['#efedfb', '#4f46a5'], Shoulder: ['#e7f3fb', '#1c5f8f'], Neck: ['#fff1de', '#8a5200'], Ankle: ['#fce8e7', '#b42318'], Balance: ['#eef2f5', '#4b5b66'] };
  const exStatus = (x) => x.status || 'Active';
  const exSets = (x) => (x.defaultSets != null ? x.defaultSets : 3);
  const exReps = (x) => (x.defaultReps != null ? x.defaultReps : 10);
  const EX_FREQ = ['Daily', 'Twice daily', '3 times daily', 'Every other day', '3 times / week', '2 times / week', 'Weekly'];
  const canEditEx = () => PP.can('exercises.manage');
  const canAssign = () => PP.can('exercises.manage') || PP.can('prescriptions.issue') || PP.can('clinical.write');
  const exThumb = (x) => {
    const [bg, fg] = AREA_TONE[x.area] || ['#e6f6f3', '#00706a'];
    return `<div class="ops-ex-media" style="--a-bg:${bg};--a-fg:${fg}">${x.imageData ? `<img src="${esc(x.imageData)}" alt="${esc(x.name)}">` : PP.icon(x.area === 'Balance' || x.area === 'Spine' ? 'body' : 'dumbbell')}
      ${x.media === 'video' ? `<span class="play" aria-label="Video">${PLAY}</span>` : ''}<span class="mtag">${exStatus(x) !== 'Active' ? PP.ui.badge(exStatus(x)) : ''}</span></div>`;
  };
  function assignModal(exId, done) {
    const exs = PP.db.exercises.filter((x) => exStatus(x) === 'Active' || x.id === exId);
    const ex0 = PP.find.exercise(exId);
    PP.ui.modal({
      title: ex0 ? `Assign “${esc(ex0.name)}”` : 'Assign an exercise',
      body: `<form novalidate class="stack">${patientField('patientId', '')}<div class="form-grid">
        ${PP.form.field({ type: 'select', name: 'exerciseId', label: 'Exercise', required: true, value: exId || '', options: exs.map((x) => [x.id, `${x.name} · ${x.area}`]) })}
        ${PP.form.field({ type: 'select', name: 'professionalId', label: `Assigned by (${PP.tl('professional')})`, required: true, value: myProId(), options: allProOptions() })}
        ${PP.form.field({ type: 'number', name: 'sets', label: 'Sets', required: true, rule: 'positive', min: 1, value: ex0 ? exSets(ex0) : 3 })}
        ${PP.form.field({ type: 'number', name: 'reps', label: 'Repetitions', required: true, rule: 'positive', min: 1, value: ex0 ? exReps(ex0) : 10 })}
        ${PP.form.field({ type: 'select', name: 'frequency', label: 'Frequency', required: true, value: 'Daily', options: EX_FREQ, placeholder: false })}
        ${PP.form.field({ type: 'number', name: 'durationWeeks', label: 'Duration (weeks)', required: true, rule: 'positive', min: 1, value: 4 })}
        ${PP.form.field({ type: 'date', name: 'startDate', label: 'Start date', required: true, value: PP.today() })}
        ${PP.form.field({ type: 'textarea', name: 'notes', label: 'Notes for the patient', rows: 2, full: true, placeholder: 'e.g. stop if pain increases' })}
      </div><div class="ops-note">The patient receives the exercise with its instructions and media in the patient app (later phase); for now it appears on this list.</div></form>`,
      onOpen: (body) => {
        bindPatientField(body, 'patientId');
        PP.$('[name=exerciseId]', body).addEventListener('change', (e) => { const x = PP.find.exercise(e.target.value); if (x) { PP.$('[name=sets]', body).value = exSets(x); PP.$('[name=reps]', body).value = exReps(x); } });
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Assign', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        const dup = PP.db.exerciseAssignments.find((a) => a.patientId === v.patientId && a.exerciseId === v.exerciseId && a.status === 'Active');
        if (dup) { PP.form.setError(f, 'exerciseId', `Already assigned to this patient (${dup.id}). Stop that assignment first.`); return false; }
        const pt = PP.find.patient(v.patientId);
        const a = { id: uid('EXA', 'exerciseAssignments', 4), patientId: v.patientId, exerciseId: v.exerciseId, professionalId: v.professionalId, sets: Number(v.sets), reps: Number(v.reps), frequency: v.frequency, durationWeeks: Number(v.durationWeeks), startDate: v.startDate, notes: v.notes, status: 'Active', assignedAt: PP.nowStamp(), assignedBy: me().id || null, branchId: (pt && pt.branchId) || null };
        PP.db.exerciseAssignments.push(a); PP.audit('Exercise assigned', a.patientId, `${PP.find.exercise(a.exerciseId).name} · ${a.id}`); PP.save();
        PP.ui.toast(`“${esc(PP.find.exercise(a.exerciseId).name)}” assigned to ${esc(PP.patientName(a.patientId))}.`); if (done) done();
      } }],
    });
  }
  function assignmentsTable(host, filterExId) {
    const rows = () => PP.db.exerciseAssignments.filter((a) => (!filterExId || a.exerciseId === filterExId) && PP.inBranch(a)).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const endOf = (a) => PP.addDays(a.startDate, a.durationWeeks * 7);
    PP.ui.table(host, {
      getRows: rows, exportName: filterExId ? '' : 'exercise-assignments', pageSize: filterExId ? 5 : 10,
      search: filterExId ? null : { placeholder: 'Search patient or exercise', text: (a) => `${PP.patientName(a.patientId)} ${a.patientId} ${(PP.find.exercise(a.exerciseId) || {}).name || ''}` },
      filters: filterExId ? null : [{ id: 'st', label: 'All statuses', options: [['Active', 'Active'], ['Completed', 'Completed'], ['Stopped', 'Stopped']], match: (a, v) => a.status === v }, { id: 'ar', label: 'All body areas', options: Array.from(new Set(PP.db.exercises.map((x) => x.area))).map((x) => [x, x]), match: (a, v) => (PP.find.exercise(a.exerciseId) || {}).area === v }],
      columns: [
        { key: 'p', label: 'Patient', sort: (a) => PP.patientName(a.patientId), render: (a) => `<a href="#/patients/${esc(a.patientId)}">${esc(PP.patientName(a.patientId))}</a><span class="sub mono">${esc(a.id)}</span>` },
        ...(filterExId ? [] : [{ key: 'x', label: 'Exercise', sort: (a) => (PP.find.exercise(a.exerciseId) || {}).name, render: (a) => { const x = PP.find.exercise(a.exerciseId); return x ? `<a href="#/exercises/${esc(x.id)}">${esc(x.name)}</a><span class="sub">${esc(x.area)}</span>` : '—'; } }]),
        { key: 'd', label: 'Dose', render: (a) => `${esc(a.sets)} × ${esc(a.reps)}<span class="sub">${esc(a.frequency)}</span>` },
        { key: 'w', label: 'Period', sort: (a) => a.startDate, render: (a) => `${esc(PP.fmt.dateShort(a.startDate))} → ${esc(PP.fmt.dateShort(endOf(a)))}<span class="sub">${esc(a.durationWeeks)} weeks</span>` },
        { key: 'by', label: PP.t('professional'), render: (a) => esc(PP.proShort(a.professionalId)) },
        { key: 's', label: 'Status', sort: (a) => a.status, render: (a) => PP.ui.badge(a.status, a.status === 'Stopped' ? 'neutral' : a.status === 'Completed' ? 'info' : 'positive') },
        { key: 'a', label: '', render: (a) => (a.status === 'Active' && canAssign() ? `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-xa="done" data-id="${esc(a.id)}">Complete</button><button class="btn btn-ghost btn-sm" data-xa="stop" data-id="${esc(a.id)}">Stop</button></div>` : '') },
      ],
      empty: { icon: 'dumbbell', title: 'No assignments yet', text: 'Use “Assign to patient” on an exercise.' },
    });
    if (!host.dataset.bound) {
      host.dataset.bound = '1';
      host.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-xa]'); if (!b) return; const a = PP.db.exerciseAssignments.find((x) => x.id === b.dataset.id); if (!a) return;
        if (b.dataset.xa === 'stop') { const r = await PP.ui.confirm({ title: 'Stop this assignment?', message: `${esc(PP.patientName(a.patientId))} · ${esc((PP.find.exercise(a.exerciseId) || {}).name)}`, confirmLabel: 'Stop', reasonLabel: 'Reason', reasonRequired: true }); if (!r) return; a.status = 'Stopped'; a.stopReason = r.reason; PP.audit('Exercise assignment stopped', a.id, r.reason); }
        else { a.status = 'Completed'; PP.audit('Exercise assignment completed', a.id); }
        PP.save(); PP.ui.toast(`Assignment ${esc(a.id)} ${a.status.toLowerCase()}.`); assignmentsTable(host, filterExId);
      });
    }
  }
  PP.route('/exercises', {
    title: 'Exercise Library', perm: 'patients.view',
    render({ el, query }) {
      ensure();
      const st = { area: '', q: '', status: 'live' };
      const areas = Array.from(new Set(PP.db.exercises.map((x) => x.area))).sort();
      el.innerHTML = PP.ui.pageHead({
        title: 'Exercise Library', crumbs: [['Prescriptions', '#/prescriptions'], ['Exercise Library']],
        subtitle: 'Exercises with instructions, images and videos. Assign them to patients as a home programme.',
        actions: `${canAssign() ? `<button class="btn" data-assign>${PP.icon('send')} Assign to patient</button>` : ''}${canEditEx() ? `<a class="btn btn-primary" href="#/exercises/new">${PP.icon('plus')} New exercise</a>` : ''}`,
      }) + '<div class="mb-tabs ops-tabs-host" data-tabs></div><div data-body></div>';
      const body = PP.$('[data-body]', el);
      const showLib = () => {
        body.innerHTML = `<div class="card"><div class="card-body stack">
          <div class="ops-toolbar"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search exercises or instructions" aria-label="Search exercises" value="${esc(st.q)}"></div>
            <select class="select" data-st aria-label="Status"><option value="live">Active and draft</option><option value="Active">Active only</option><option value="Draft">Draft</option><option value="Archived">Archived</option><option value="">All</option></select></div>
          <div class="ops-area-bar" role="group" aria-label="Body area">${[['', 'All areas'], ...areas.map((a) => [a, a])].map(([v, l]) => `<button type="button" data-area="${esc(v)}" class="${st.area === v ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
        </div></div><div class="mt-4" data-grid></div>`;
        PP.$('[data-st]', body).value = st.status;
        const grid = PP.$('[data-grid]', body);
        const draw = () => {
          const t = st.q.toLowerCase();
          const list = PP.db.exercises.filter((x) => (!st.area || x.area === st.area) && (st.status === '' || (st.status === 'live' ? exStatus(x) !== 'Archived' : exStatus(x) === st.status)) && (!t || `${x.name} ${x.area} ${x.instructions}`.toLowerCase().includes(t)));
          const counts = {}; PP.db.exerciseAssignments.forEach((a) => { if (a.status === 'Active') counts[a.exerciseId] = (counts[a.exerciseId] || 0) + 1; });
          grid.innerHTML = list.length ? `<div class="ops-ex-grid">${list.map((x) => `<article class="ops-ex-card ${exStatus(x) === 'Archived' ? 'is-archived' : ''}">
              <a href="#/exercises/${esc(x.id)}" aria-label="Open ${esc(x.name)}">${exThumb(x)}</a>
              <div class="ops-ex-body"><div class="row between"><span class="ops-chip teal">${esc(x.area)}</span><span class="small muted mono">${esc(exSets(x))} × ${esc(exReps(x))}</span></div>
                <h3><a href="#/exercises/${esc(x.id)}" style="color:inherit">${esc(x.name)}</a></h3><p>${esc(x.instructions)}</p></div>
              <div class="ops-ex-foot"><span class="small muted">${counts[x.id] ? `${counts[x.id]} active patient${counts[x.id] > 1 ? 's' : ''}` : 'Not assigned'}</span>
                <div class="row" style="gap:4px"><a class="btn btn-ghost btn-sm" href="#/exercises/${esc(x.id)}">${canEditEx() ? 'Edit' : 'View'}</a>${canAssign() && exStatus(x) === 'Active' ? `<button class="btn btn-sm" data-assign-ex="${esc(x.id)}">Assign</button>` : ''}</div></div>
            </article>`).join('')}</div>`
            : `<div class="card">${PP.ui.empty({ icon: 'dumbbell', title: PP.db.exercises.length ? 'No exercises match' : 'The library is empty', text: PP.db.exercises.length ? 'Try another search, body area or status.' : 'Add the first exercise.', action: PP.db.exercises.length ? '<button class="btn" data-reset>Clear filters</button>' : canEditEx() ? '<a class="btn btn-primary" href="#/exercises/new">New exercise</a>' : '' })}</div>`;
          PP.$$('[data-assign-ex]', grid).forEach((b) => b.addEventListener('click', () => assignModal(b.dataset.assignEx, draw)));
          const r = PP.$('[data-reset]', grid); if (r) r.addEventListener('click', () => { st.area = ''; st.q = ''; st.status = 'live'; showLib(); });
        };
        PP.$('[data-q]', body).addEventListener('input', (e) => { st.q = e.target.value.trim(); draw(); });
        PP.$('[data-st]', body).addEventListener('change', (e) => { st.status = e.target.value; draw(); });
        PP.$$('[data-area]', body).forEach((b) => b.addEventListener('click', () => { st.area = b.dataset.area; PP.$$('[data-area]', body).forEach((x) => x.classList.toggle('active', x === b)); draw(); }));
        draw();
      };
      const show = (id) => { if (id === 'assign') { body.innerHTML = '<div class="card" data-at></div>'; assignmentsTable(PP.$('[data-at]', body)); } else showLib(); };
      const active = query.tab === 'assignments' ? 'assign' : 'lib';
      PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: [{ id: 'lib', label: 'Library', count: PP.db.exercises.filter((x) => exStatus(x) !== 'Archived').length }, { id: 'assign', label: 'Patient assignments', count: PP.db.exerciseAssignments.filter((a) => a.status === 'Active' && PP.inBranch(a)).length }], active, onChange: show });
      show(active);
      const ab = PP.$('[data-assign]', el); if (ab) ab.addEventListener('click', () => assignModal('', () => show(PP.$('.tab.active', el).dataset.tab)));
    },
  });
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Could not read the file.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('This file is not a readable image.'));
        img.onload = () => { const max = 560; const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.82)); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  PP.route('/exercises/:id', {
    title: (p) => (p.id === 'new' ? 'New Exercise' : 'Exercise'), perm: 'patients.view',
    render({ el, params }) {
      ensure();
      const isNew = params.id === 'new';
      if (isNew && !canEditEx()) { el.innerHTML = PP.ui.noAccess('exercises.manage'); return; }
      const x = isNew ? null : PP.find.exercise(params.id);
      if (!isNew && !x) { el.innerHTML = notFound('Exercise', params.id, '#/exercises'); return; }
      const edit = canEditEx();
      const m = { media: x ? x.media || 'none' : 'none', imageData: x ? x.imageData || '' : '', videoName: x ? x.videoName || '' : '' };
      const areas = Array.from(new Set(PP.db.exercises.map((e) => e.area).concat(['Hip', 'Wrist', 'Elbow']))).sort();
      el.innerHTML = PP.ui.pageHead({
        title: isNew ? 'New exercise' : esc(x.name), crumbs: [['Exercise Library', '#/exercises'], [isNew ? 'New' : x.id]],
        subtitle: isNew ? 'Add an exercise with clear patient instructions and an image or video.' : `${esc(x.id)} · ${esc(x.area)} · ${PP.ui.badge(exStatus(x))}${x.updatedAt ? ` · updated ${esc(PP.fmt.stamp(x.updatedAt))}` : ''}`,
        actions: !isNew && canAssign() && exStatus(x) === 'Active' ? `<button class="btn" data-assign>${PP.icon('send')} Assign to patient</button>` : '',
      }) + `<form novalidate class="ops-split" data-exf>
        <div class="stack">
          <section class="card"><div class="card-head"><h2>Details</h2></div><div class="card-body"><div class="form-grid">
            ${PP.form.field({ name: 'name', label: 'Exercise name', required: true, value: x ? x.name : '', full: true, disabled: !edit })}
            <div class="field" data-field="area"><label for="ex-area">Body area<span class="req">*</span></label><input class="input" id="ex-area" name="area" list="ex-areas" required value="${esc(x ? x.area : '')}" ${edit ? '' : 'disabled'} placeholder="Choose or type"><datalist id="ex-areas">${areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist><div class="error">This field is required.</div></div>
            ${PP.form.field({ type: 'select', name: 'status', label: 'Status', required: true, value: x ? exStatus(x) : 'Draft', options: ['Draft', 'Active', 'Archived'], placeholder: false, disabled: !edit, hint: 'Only active exercises can be assigned.' })}
            ${PP.form.field({ type: 'number', name: 'defaultSets', label: 'Default sets', required: true, rule: 'positive', min: 1, value: x ? exSets(x) : 3, disabled: !edit })}
            ${PP.form.field({ type: 'number', name: 'defaultReps', label: 'Default repetitions', required: true, rule: 'positive', min: 1, value: x ? exReps(x) : 10, disabled: !edit })}
            ${PP.form.field({ type: 'number', name: 'holdSeconds', label: 'Hold (seconds)', rule: 'nonneg', min: 0, value: x && x.holdSeconds != null ? x.holdSeconds : '', disabled: !edit })}
            ${PP.form.field({ type: 'select', name: 'equipment', label: 'Equipment', value: x ? x.equipment || '' : '', options: ['None', 'Resistance band', 'Towel', 'Chair', 'Wall', 'Foam roller', 'Dumbbell'], placeholder: '—', disabled: !edit })}
            ${PP.form.field({ type: 'textarea', name: 'instructions', label: 'Patient instructions', required: true, rows: 5, value: x ? x.instructions : '', full: true, disabled: !edit, hint: 'Plain language. One step per line works best.' })}
            ${PP.form.field({ type: 'textarea', name: 'precautions', label: 'Precautions', rows: 2, value: x ? x.precautions || '' : '', full: true, disabled: !edit, placeholder: 'e.g. stop if pain increases' })}
          </div>
          ${edit ? `<div class="form-actions">${!isNew && exStatus(x) !== 'Archived' ? '<button type="button" class="btn btn-danger" data-archive>Archive</button><span class="spacer"></span>' : ''}<a class="btn btn-ghost" href="#/exercises">Cancel</a><button type="submit" class="btn btn-primary" data-save>${PP.icon('check')} Save exercise</button></div>` : '<p class="ops-note mt-3">Read only. Editing needs the “Manage the exercise library” permission.</p>'}</div></section>
          ${isNew ? '' : `<section class="card"><div class="card-head"><h2>Assigned patients</h2></div><div data-asg></div></section>`}
        </div>
        <aside class="card ops-sticky"><div class="card-head"><h2>Media</h2></div><div class="card-body stack">
          ${edit ? PP.ui.segmented('media', [['none', 'None'], ['image', 'Image'], ['video', 'Video']], m.media) : ''}
          <div class="ops-media-preview" data-prev></div>
          ${edit ? `<div class="row" data-up></div><div class="field" data-field="media"><div class="error" role="alert"></div></div>` : ''}
          <div class="ops-note">Prototype: images are resized and kept in this browser; video uploads are simulated (only the file name is kept).</div>
        </div></aside>
      </form>`;
      const f = PP.$('[data-exf]', el);
      const drawMedia = () => {
        const prev = PP.$('[data-prev]', f); const up = PP.$('[data-up]', f);
        if (m.media === 'image') prev.innerHTML = m.imageData ? `<img src="${esc(m.imageData)}" alt="Exercise image preview">` : `<div class="vid">${PP.icon('upload')}<span>No image yet</span></div>`;
        else if (m.media === 'video') prev.innerHTML = `<div class="vid"><span class="playbig">${PLAY}</span><b>${esc(m.videoName || 'No video yet')}</b><span class="small">Video player placeholder</span></div>`;
        else prev.innerHTML = `<div class="vid">${PP.icon('file')}<span>No media. Patients see the written instructions.</span></div>`;
        if (!up) return;
        up.innerHTML = m.media === 'none' ? '' : `<label class="btn ops-file">${PP.icon('upload')} ${m.media === 'image' ? (m.imageData ? 'Replace image' : 'Upload image') : (m.videoName ? 'Replace video' : 'Upload video')}<input type="file" data-file accept="${m.media === 'image' ? 'image/png,image/jpeg,image/webp,image/gif' : 'video/mp4,video/webm,video/quicktime'}" aria-label="Choose a file"></label>${(m.media === 'image' && m.imageData) || (m.media === 'video' && m.videoName) ? '<button type="button" class="btn btn-ghost" data-rm>Remove</button>' : ''}`;
        const fi = PP.$('[data-file]', up);
        if (fi) fi.addEventListener('change', async () => {
          const file = fi.files && fi.files[0]; if (!file) return; PP.form.clearErrors(PP.$('[data-field=media]', f).parentElement);
          const err = (msg) => PP.form.setError(f, 'media', msg);
          if (m.media === 'image') {
            if (!/^image\//.test(file.type)) { err('Choose a PNG, JPG, WebP or GIF image.'); return; }
            if (file.size > 8 * 1024 * 1024) { err('The image is larger than 8 MB.'); return; }
            try { m.imageData = await readImage(file); PP.ui.toast('Image added (resized for the prototype).'); } catch (e) { err(e.message); return; }
          } else {
            if (!/^video\//.test(file.type)) { err('Choose an MP4, WebM or MOV video.'); return; }
            if (file.size > 200 * 1024 * 1024) { err('The video is larger than 200 MB.'); return; }
            m.videoName = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`; PP.ui.toast('Video upload simulated.', 'info');
          }
          drawMedia();
        });
        const rm = PP.$('[data-rm]', up); if (rm) rm.addEventListener('click', () => { if (m.media === 'image') m.imageData = ''; else m.videoName = ''; drawMedia(); });
      };
      if (edit) PP.ui.bindSegmented(f, 'media', (v) => { m.media = v; drawMedia(); });
      drawMedia();
      if (!isNew) assignmentsTable(PP.$('[data-asg]', f), x.id);
      const ab = PP.$('[data-assign]', el); if (ab) ab.addEventListener('click', () => assignModal(x.id, () => assignmentsTable(PP.$('[data-asg]', f), x.id)));
      const ar = PP.$('[data-archive]', f);
      if (ar) ar.addEventListener('click', async () => {
        const active = PP.db.exerciseAssignments.filter((a) => a.exerciseId === x.id && a.status === 'Active').length;
        const ok = await PP.ui.confirm({ title: 'Archive this exercise?', message: `It will no longer be offered for new assignments or templates.${active ? ` ${active} active assignment${active > 1 ? 's stay' : ' stays'} as they are.` : ''}`, confirmLabel: 'Archive', danger: true });
        if (!ok) return; x.status = 'Archived'; x.updatedAt = PP.nowStamp(); PP.audit('Exercise archived', x.id, x.name); PP.save(); PP.ui.toast(`“${esc(x.name)}” archived.`); PP.render();
      });
      if (edit) f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!PP.form.validate(f)) return;
        const v = PP.form.read(f);
        if (PP.db.exercises.some((e) => e !== x && e.name.trim().toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'An exercise with this name already exists.'); PP.$('[name=name]', f).focus(); return; }
        if (m.media === 'image' && !m.imageData) { PP.form.setError(f, 'media', 'Upload an image, or choose “None”.'); return; }
        if (m.media === 'video' && !m.videoName) { PP.form.setError(f, 'media', 'Upload a video, or choose “None”.'); return; }
        await PP.ui.busy(PP.$('[data-save]', f), () => {
          let rec = x;
          if (!rec) { const max = Math.max(0, ...PP.db.exercises.map((e) => Number(String(e.id).replace(/\D/g, '')) || 0)); rec = { id: `EX-${pad2(max + 1)}`, createdAt: PP.nowStamp() }; PP.db.exercises.push(rec); }
          Object.assign(rec, { name: v.name, area: v.area, status: v.status, defaultSets: Number(v.defaultSets), defaultReps: Number(v.defaultReps), holdSeconds: v.holdSeconds === '' ? null : Number(v.holdSeconds), equipment: v.equipment, instructions: v.instructions, precautions: v.precautions, media: m.media, imageData: m.media === 'image' ? m.imageData : '', videoName: m.media === 'video' ? m.videoName : '', updatedAt: PP.nowStamp(), updatedBy: me().id || null });
          PP.audit(isNew ? 'Exercise created' : 'Exercise edited', rec.id, rec.name);
          try { PP.save(); } catch (e) { PP.ui.toast('Could not save. The browser storage may be full; try a smaller image.', 'error'); return; }
          PP.ui.toast(`“${esc(rec.name)}” saved.`);
          if (isNew) PP.go(`#/exercises/${rec.id}`); else PP.render();
        });
      });
    },
  });

  /* =============================================================== REFERRALS */
  const FLOW = { Inbound: ['Received', 'Accepted', 'Seen', 'Closed'], Outbound: ['Sent', 'Acknowledged', 'Report received'] };
  const REF_TONE = { Received: 'warning', Accepted: 'info', Seen: 'lavender', Closed: 'positive', Sent: 'info', Acknowledged: 'lavender', 'Report received': 'positive' };
  const URG_TONE = { Routine: 'neutral', Urgent: 'warning', Emergency: 'error' };
  const refOpen = (r) => FLOW[r.direction].indexOf(r.status) < FLOW[r.direction].length - 1;
  const dirTag = (r) => (r.direction === 'Inbound' ? `<span class="ops-dir in">${PP.icon('arrowDown')} Inbound</span>` : `<span class="ops-dir out">${PP.icon('arrowUp')} Outbound</span>`);
  const fromTo = (r) => (r.direction === 'Inbound'
    ? { from: `${esc(r.externalName)}<span class="sub">${esc(r.externalOrg || '')}</span>`, to: `${esc(PP.proName(r.professionalId))}<span class="sub">${esc(PP.db.settings.clinicName)}</span>` }
    : { from: `${esc(PP.proName(r.professionalId))}<span class="sub">${esc(PP.db.settings.clinicName)}</span>`, to: `${esc(r.externalName)}<span class="sub">${esc(r.externalOrg || '')}</span>` });
  function letterHtml(r) {
    const s = PP.db.settings; const pt = PP.find.patient(r.patientId) || { name: '—', id: r.patientId }; const pro = PP.find.professional(r.professionalId); const br = PP.find.branch(r.branchId);
    const seen = (r.history || []).find((h) => h.status === 'Seen');
    const body = r.direction === 'Outbound'
      ? `<p>Dear ${esc(r.externalName)},</p><p>I am referring the patient below for your ${r.urgency !== 'Routine' ? `<b>${esc(r.urgency.toLowerCase())}</b> ` : ''}opinion and management.</p>
         <h3>Reason for referral</h3><p>${nl(r.reason)}</p>${r.summary ? `<h3>Clinical summary</h3><p>${nl(r.summary)}</p>` : ''}
         <p>Please send your findings or report to the clinic at the address above. Thank you for seeing this patient.</p>`
      : `<p>Dear ${esc(r.externalName)},</p><p>Thank you for referring the patient below to ${esc(s.clinicName)} on ${esc(PP.fmt.date(r.date))}.</p>
         <h3>Your reason for referral</h3><p>${nl(r.reason)}</p>
         <p>${seen ? `The patient was seen on ${esc(PP.fmt.date(seen.at))} by ${esc(PP.proName(pro))}.` : `The referral has been ${esc(r.status.toLowerCase())}; the patient will be seen by ${esc(PP.proName(pro))}.`} We will keep you informed of progress.</p>`;
    return `<article class="ops-letter">
      <header><div><div class="lclinic">${esc(s.clinicName)}</div><div class="lsub">${esc((br && br.address) || s.address)} · ${esc((br && br.phone) || s.phone)}${s.email ? ` · ${esc(s.email)}` : ''}</div></div>
        <div class="lref"><div><b>${r.direction === 'Outbound' ? 'Referral letter' : 'Referral acknowledgement'}</b></div><div class="mono">${esc(r.id)}</div><div>${esc(PP.fmt.date(r.direction === 'Outbound' ? r.date : PP.today()))}</div>${r.urgency !== 'Routine' ? `<div class="lurgent">${esc(r.urgency)}</div>` : ''}</div></header>
      <p><b>To:</b> ${esc(r.externalName)}${r.externalOrg ? `, ${esc(r.externalOrg)}` : ''}</p>
      <p><b>Re:</b> ${esc(pt.name)} · ${esc(pt.id)}${pt.gender ? ` · ${esc(pt.gender)}` : ''}${pt.dob ? ` · ${esc(PP.fmt.age(pt.dob))}` : ''}</p>
      ${body}
      <div class="lsign"><b>${esc(PP.proName(pro))}</b><div>${esc(pro ? pro.designation : '')}</div><div>${pro ? `Reg. no. ${esc(pro.registrationNo)}` : ''}</div></div>
    </article>`;
  }
  function letterModal(r) {
    PP.ui.modal({ title: `${r.direction === 'Outbound' ? 'Referral letter' : 'Acknowledgement letter'} · ${esc(r.id)}`, size: 'lg', body: letterHtml(r),
      buttons: [{ label: 'Close', kind: 'ghost' }, { label: `${PP.icon('printer')} Print`, kind: 'primary', onClick: () => { printHtml(letterHtml(r)); PP.audit('Referral letter printed', r.id); PP.save(); } }] });
  }
  function refDetail(r, done) {
    const flow = FLOW[r.direction]; const idx = flow.indexOf(r.status); const next = flow[idx + 1];
    const ft = fromTo(r);
    PP.ui.modal({
      title: `Referral ${esc(r.id)}`, size: 'lg',
      body: `<div class="stepper ops-flow">${flow.map((s, i) => `${i ? '<span class="line"></span>' : ''}<span class="step ${i < idx ? 'done' : i === idx ? 'active' : ''}"><span class="num">${i < idx ? PP.icon('check', 'style="width:14px;height:14px"') : i + 1}</span>${esc(s)}</span>`).join('')}</div>
        <div class="grid grid-2">
          <div>${kv([['Direction', dirTag(r)], ['Patient', `<a href="#/patients/${esc(r.patientId)}">${esc(PP.patientName(r.patientId))}</a> <span class="muted mono">${esc(r.patientId)}</span>`], ['From', ft.from], ['To', ft.to], ['Contact', esc(r.externalContact || '')], ['Date', esc(PP.fmt.date(r.date))], ['Urgency', PP.ui.badge(r.urgency, URG_TONE[r.urgency])]])}</div>
          <div class="stack"><div><div class="label">Reason</div><p style="margin:4px 0 0">${nl(r.reason)}</p></div>${r.summary ? `<div><div class="label">Clinical summary</div><p style="margin:4px 0 0">${nl(r.summary)}</p></div>` : ''}
            <div><div class="label">Attachments</div>${r.attachments && r.attachments.length ? `<ul class="ops-attach mt-2">${r.attachments.map((a) => `<li>${PP.icon('file')}<span class="grow">${esc(a.name)}</span><span class="small muted">${esc(Math.max(1, Math.round(a.size / 1024)))} KB</span></li>`).join('')}</ul>` : '<p class="muted small" style="margin:4px 0 0">None</p>'}</div></div>
        </div>
        <div class="divider"></div><div class="label" style="margin-bottom:10px">History</div>
        <ul class="timeline">${(r.history || []).slice().reverse().map((h) => `<li><div class="tl-date">${esc(PP.fmt.dateShort(h.at))}</div><div class="tl-body"><b>${esc(h.status)}</b><div class="small muted">${esc(h.note || '')}${h.note ? ' · ' : ''}${esc(h.by || '')}</div></div></li>`).join('')}</ul>
        ${next ? `<form novalidate class="stack mt-3" data-adv>${PP.form.field({ name: 'note', label: `Note for “${next}” (optional)`, placeholder: r.direction === 'Outbound' && next === 'Report received' ? 'e.g. MRI report received; reviewed with patient' : 'Optional note' })}</form>` : ''}`,
      buttons: [{ label: 'Close', kind: 'ghost' }, { label: `${PP.icon('printer')} ${r.direction === 'Outbound' ? 'Referral letter' : 'Acknowledgement'}`, onClick: () => { setTimeout(() => letterModal(r), 30); } },
        ...(next ? [{ label: `Mark as ${esc(next)}`, kind: 'primary', onClick: ({ body }) => {
          const v = PP.form.read(PP.$('[data-adv]', body));
          r.status = next; (r.history = r.history || []).push({ at: PP.nowStamp(), status: next, note: v.note || '', by: me().name || '' });
          PP.audit(`Referral ${next.toLowerCase()}`, r.id, v.note || ''); PP.save(); PP.ui.toast(`${esc(r.id)} marked as ${esc(next)}.`); if (done) done();
        } }] : [])],
    });
  }
  function newReferralModal(done) {
    const files = [];
    PP.ui.modal({
      title: 'New referral', size: 'lg',
      body: `<form novalidate class="stack">
        ${PP.ui.segmented('rdir', [['Inbound', 'Inbound (referred to us)'], ['Outbound', 'Outbound (we refer out)']], 'Inbound')}
        ${patientField('patientId', '')}
        <div class="form-grid">
          ${PP.form.field({ name: 'externalName', label: 'Referred by (doctor / hospital)', required: true, placeholder: 'e.g. Dr. A. Rahman', id: 'rf-ext' })}
          ${PP.form.field({ name: 'externalOrg', label: 'Organisation / speciality', placeholder: 'e.g. Orthopaedic Surgeon · City Hospital' })}
          ${PP.form.field({ name: 'externalContact', label: 'Contact number', type: 'tel', rule: 'mobile', placeholder: '01XXXXXXXXX' })}
          ${PP.form.field({ type: 'select', name: 'professionalId', label: `Referred to (${PP.tl('professional')})`, required: true, value: myProId(), options: allProOptions(), id: 'rf-pro' })}
          ${PP.form.field({ type: 'select', name: 'urgency', label: 'Urgency', required: true, value: 'Routine', options: ['Routine', 'Urgent', 'Emergency'], placeholder: false })}
          ${PP.form.field({ type: 'date', name: 'date', label: 'Referral date', required: true, value: PP.today(), max: PP.today() })}
          ${PP.form.field({ type: 'textarea', name: 'reason', label: 'Reason for referral', required: true, rows: 3, full: true })}
          <div class="full hidden" data-sum>${PP.form.field({ type: 'textarea', name: 'summary', label: 'Clinical summary (for the letter)', rows: 3, full: true, disabled: true })}</div>
          <div class="field full"><label>Attachments</label><label class="btn ops-file" style="align-self:flex-start">${PP.icon('upload')} Add files<input type="file" multiple data-files aria-label="Add attachments"></label><ul class="ops-attach" data-flist></ul><div class="hint">Simulated: only file names and sizes are kept in the prototype.</div></div>
        </div></form>`,
      onOpen: (body) => {
        bindPatientField(body, 'patientId');
        PP.ui.bindSegmented(body, 'rdir', (v) => {
          body.dataset.dir = v;
          PP.$('label[for=rf-ext]', body).innerHTML = `${v === 'Inbound' ? 'Referred by (doctor / hospital)' : 'Refer to (specialist / centre)'}<span class="req">*</span>`;
          PP.$('label[for=rf-pro]', body).innerHTML = `${v === 'Inbound' ? `Referred to (${esc(PP.tl('professional'))})` : `Referring ${esc(PP.tl('professional'))}`}<span class="req">*</span>`;
          PP.$('[data-sum]', body).classList.toggle('hidden', v !== 'Outbound'); PP.$('[name=summary]', body).disabled = v !== 'Outbound';
        });
        body.dataset.dir = 'Inbound';
        const fl = PP.$('[data-flist]', body);
        const drawFiles = () => { fl.innerHTML = files.map((f, i) => `<li>${PP.icon('file')}<span class="grow">${esc(f.name)}</span><span class="small muted">${Math.max(1, Math.round(f.size / 1024))} KB</span><button type="button" class="btn btn-ghost btn-sm" data-rmf="${i}" aria-label="Remove ${esc(f.name)}">${PP.icon('x')}</button></li>`).join(''); PP.$$('[data-rmf]', fl).forEach((b) => b.addEventListener('click', () => { files.splice(Number(b.dataset.rmf), 1); drawFiles(); })); };
        PP.$('[data-files]', body).addEventListener('change', (e) => { Array.from(e.target.files || []).forEach((f) => files.push({ name: f.name, size: f.size })); e.target.value = ''; drawFiles(); });
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save referral', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f); const dir = body.dataset.dir || 'Inbound';
        const pt = PP.find.patient(v.patientId); const pro = PP.find.professional(v.professionalId);
        const r = { id: uid('REF', 'referrals', 4), direction: dir, patientId: v.patientId, externalName: v.externalName, externalOrg: v.externalOrg, externalContact: v.externalContact, professionalId: v.professionalId, reason: v.reason, summary: dir === 'Outbound' ? v.summary : '', urgency: v.urgency, date: v.date, status: FLOW[dir][0], attachments: files.slice(), history: [{ at: PP.nowStamp(), status: FLOW[dir][0], note: dir === 'Inbound' ? 'Referral recorded' : 'Referral letter prepared', by: me().name || '' }], branchId: branchOfNew((pt && pt.branchId) || (pro && pro.branchId)), createdAt: PP.nowStamp() };
        PP.db.referrals.unshift(r); PP.audit(`Referral ${dir.toLowerCase()} recorded`, r.id, `${PP.patientName(r.patientId)} · ${r.externalName}`); PP.save();
        PP.ui.toast(`Referral ${esc(r.id)} saved as ${esc(r.status)}.`); if (done) done();
        if (dir === 'Outbound') setTimeout(() => letterModal(r), 60);
      } }],
    });
  }
  PP.route('/referrals', {
    title: 'Referrals', perm: 'referrals.manage',
    render({ el }) {
      ensure();
      const st = { dir: '' };
      const all = () => PP.db.referrals.filter((r) => PP.inBranch(r) && (!st.dir || r.direction === st.dir));
      el.innerHTML = PP.ui.pageHead({ title: 'Referrals', crumbs: [['Patients', '#/patients'], ['Referrals']], subtitle: 'Inbound referrals from doctors and hospitals, and outbound referrals to specialists.', actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New referral</button>` })
        + '<div class="grid grid-4 ops-kpis" data-kpis></div><div class="card"><div class="card-body" style="padding-bottom:0">' + PP.ui.segmented('dir', [['', 'All'], ['Inbound', 'Inbound'], ['Outbound', 'Outbound']], '') + '</div><div data-tbl></div></div>';
      const kpis = () => {
        const list = PP.db.referrals.filter((r) => PP.inBranch(r)); const mk = PP.monthKey(PP.today());
        PP.$('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Open inbound', value: list.filter((r) => r.direction === 'Inbound' && refOpen(r)).length, tone: 'info', icon: 'arrowDown', hint: `${list.filter((r) => r.status === 'Received').length} waiting to be accepted` })
          + PP.ui.kpi({ label: 'Open outbound', value: list.filter((r) => r.direction === 'Outbound' && refOpen(r)).length, tone: 'lavender', icon: 'arrowUp', hint: 'Awaiting acknowledgement or report' })
          + PP.ui.kpi({ label: 'Urgent open', value: list.filter((r) => r.urgency !== 'Routine' && refOpen(r)).length, tone: 'error', icon: 'alert' })
          + PP.ui.kpi({ label: 'This month', value: list.filter((r) => PP.monthKey(r.date) === mk).length, tone: 'positive', icon: 'calendar', hint: 'New referrals' });
      };
      const tbl = PP.$('[data-tbl]', el);
      const t = PP.ui.table(tbl, {
        getRows: () => all().slice().sort((a, b) => b.date.localeCompare(a.date)), exportName: 'referrals',
        search: { placeholder: 'Search patient, doctor, organisation or reason', text: (r) => `${r.id} ${PP.patientName(r.patientId)} ${r.patientId} ${r.externalName} ${r.externalOrg} ${r.reason}` },
        filters: [
          { id: 'st', label: 'All statuses', options: [['open', 'Open'], ...Array.from(new Set(FLOW.Inbound.concat(FLOW.Outbound))).map((s) => [s, s])], match: (r, v) => (v === 'open' ? refOpen(r) : r.status === v) },
          { id: 'ur', label: 'All urgencies', options: ['Routine', 'Urgent', 'Emergency'].map((s) => [s, s]), match: (r, v) => r.urgency === v },
        ],
        onRowClick: (r) => refDetail(r, refresh),
        columns: [
          { key: 'id', label: 'Referral', sort: (r) => r.date, render: (r) => `<b class="mono">${esc(r.id)}</b><span class="sub">${esc(PP.fmt.date(r.date))}</span>` },
          { key: 'd', label: 'Direction', sort: (r) => r.direction, exportValue: (r) => r.direction, render: dirTag },
          { key: 'p', label: 'Patient', sort: (r) => PP.patientName(r.patientId), render: (r) => `${esc(PP.patientName(r.patientId))}<span class="sub mono">${esc(r.patientId)}</span>` },
          { key: 'f', label: 'From', render: (r) => fromTo(r).from },
          { key: 't', label: 'To', render: (r) => fromTo(r).to },
          { key: 'r', label: 'Reason', render: (r) => `<span class="small">${esc(r.reason.length > 70 ? r.reason.slice(0, 70) + '…' : r.reason)}</span>${r.attachments && r.attachments.length ? `<span class="sub">${PP.icon('file', 'style="width:12px;height:12px;vertical-align:-2px"')} ${r.attachments.length}</span>` : ''}` },
          { key: 'u', label: 'Urgency', sort: (r) => ['Emergency', 'Urgent', 'Routine'].indexOf(r.urgency), exportValue: (r) => r.urgency, render: (r) => PP.ui.badge(r.urgency, URG_TONE[r.urgency]) },
          { key: 's', label: 'Status', sort: (r) => r.status, exportValue: (r) => r.status, render: (r) => PP.ui.badge(r.status, REF_TONE[r.status]) },
          { key: 'a', label: '', render: (r) => `<button class="btn btn-ghost btn-sm btn-icon" data-letter="${esc(r.id)}" aria-label="Letter for ${esc(r.id)}" title="Letter">${PP.icon('printer')}</button>` },
        ],
        empty: { icon: 'link', title: 'No referrals yet', text: 'Record a referral you received or one you send out.' },
      });
      function refresh() { kpis(); t.refresh(); }
      tbl.addEventListener('click', (ev) => { const b = ev.target.closest('[data-letter]'); if (b) { ev.stopPropagation(); letterModal(PP.db.referrals.find((r) => r.id === b.dataset.letter)); } });
      PP.ui.bindSegmented(el, 'dir', (v) => { st.dir = v; t.refresh(); });
      PP.$('[data-new]', el).addEventListener('click', () => newReferralModal(refresh));
      kpis();
    },
  });

  /* ================================================================ FEEDBACK */
  const fbLink = () => `https://fb.example/r/${Math.random().toString(36).slice(2, 8)}`;
  function sendRequestModal(done) {
    const T = PP.today();
    const asked = new Set(PP.db.feedbackRequests.map((r) => r.appointmentId)); const answered = new Set(PP.db.feedback.map((f) => f.appointmentId));
    const cands = PP.db.appointments.filter((a) => a.status === 'Completed' && a.date >= PP.addDays(T, -14) && a.date <= T && PP.inBranch(a) && !asked.has(a.id) && !answered.has(a.id)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)).slice(0, 40);
    const tmpl = `Dear {first}, thank you for visiting ${PP.db.settings.clinicName}. How was your visit with {professional}? Rate us in 10 seconds: {link}`;
    PP.ui.modal({
      title: 'Send feedback request', size: 'lg',
      body: cands.length ? `<form novalidate class="stack">
        <div class="row between"><b>Completed visits in the last 14 days without a request (${cands.length})</b><label class="check small"><input type="checkbox" data-all checked> Select all</label></div>
        <div class="ops-req-list">${cands.map((a) => `<label><input type="checkbox" name="apt-${esc(a.id)}" value="${esc(a.id)}" checked data-apt><span class="grow"><b>${esc(PP.patientName(a.patientId))}</b><span class="sub">${esc(PP.fmt.date(a.date))} ${esc(PP.fmt.time(a.start))} · ${esc(PP.proShort(a.professionalId))} · ${esc(PP.serviceName(a.serviceId))}</span></span><span class="small muted mono">${esc((PP.find.patient(a.patientId) || {}).mobile || '')}</span></label>`).join('')}</div>
        <div class="grid grid-2"><div>${PP.form.field({ type: 'select', name: 'channel', label: 'Channel', required: true, value: 'SMS', options: ['SMS', 'WhatsApp'], placeholder: false })}</div>
          <div><div class="label" style="margin-bottom:6px">Message preview</div><div class="ops-sms" data-prev></div></div></div>
        <div class="field" data-field="apts"><div class="error" role="alert">Select at least one visit.</div></div>
        ${PP.ui.alert('info', 'Simulated in the prototype: nothing is sent. In production this goes through the notification engine, never a hard-coded provider.')}
      </form>` : PP.ui.empty({ icon: 'send', title: 'Nothing to send', text: 'Every completed visit in the last 14 days already has a request or feedback.' }),
      onOpen: (body) => {
        if (!cands.length) return;
        const a0 = cands[0];
        PP.$('[data-prev]', body).textContent = tmpl.replace('{first}', firstName(a0.patientId)).replace('{professional}', PP.proShort(a0.professionalId)).replace('{link}', 'https://fb.example/r/k3x9q2');
        PP.$('[data-all]', body).addEventListener('change', (e) => PP.$$('[data-apt]', body).forEach((c) => { c.checked = e.target.checked; }));
      },
      buttons: cands.length ? [{ label: 'Cancel', kind: 'ghost' }, { label: `${PP.icon('send')} Send requests`, kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); PP.form.clearErrors(f);
        const ids = PP.$$('[data-apt]:checked', body).map((c) => c.value);
        if (!ids.length) { PP.form.setError(f, 'apts'); return false; }
        const channel = PP.$('[name=channel]', body).value;
        await PP.sleep(400);
        ids.forEach((id) => { const a = PP.find.appointment(id); PP.db.feedbackRequests.unshift({ id: uid('FBR', 'feedbackRequests', 4), patientId: a.patientId, appointmentId: a.id, branchId: a.branchId, sentAt: PP.nowStamp(), channel, status: 'Sent', feedbackId: null, link: fbLink() }); });
        PP.audit('Feedback requests sent (simulated)', '', `${ids.length} · ${channel}`); PP.save();
        PP.ui.toast(`${ids.length} feedback request${ids.length > 1 ? 's' : ''} queued by ${esc(channel)} (simulated, nothing sent).`); if (done) done();
      } }] : [{ label: 'Close', kind: 'ghost' }],
    });
  }
  function respondModal(fb, done) {
    PP.ui.modal({
      title: `Respond to feedback · ${esc(fb.id)}`,
      body: `<div class="ops-muted-box">${stars(fb.rating)} <b>${esc(PP.patientName(fb.patientId))}</b> · ${esc(PP.fmt.date(fb.date))}<br>${fb.comment ? `<q>${esc(fb.comment)}</q>` : '<span class="muted">No comment</span>'}</div>
        <form novalidate class="stack mt-3">${PP.form.field({ type: 'textarea', name: 'note', label: 'Response / action taken', required: true, rows: 3, value: fb.response ? fb.response.note : '', placeholder: 'e.g. called the patient, apologised for the wait, offered a morning slot' })}
        ${PP.form.field({ type: 'checkbox', name: 'sms', label: 'Also send a thank-you SMS (simulated)', value: false })}</form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save response', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
        fb.response = { note: v.note, by: me().name || '', at: PP.nowStamp() };
        PP.audit('Feedback responded', fb.id, v.note); PP.save();
        PP.ui.toast(`Response saved${v.sms ? '. Thank-you SMS queued (simulated)' : ''}.`); if (done) done();
      } }],
    });
  }
  PP.route('/feedback', {
    title: 'Patient Feedback', perm: 'feedback.view',
    render({ el }) {
      ensure();
      const T = PP.today();
      const st = { rating: '', pro: '', from: PP.addDays(T, -60), to: T, limit: 10, unanswered: false };
      el.innerHTML = PP.ui.pageHead({ title: 'Patient Feedback', crumbs: [['Patients', '#/patients'], ['Feedback']], subtitle: 'Ratings and comments collected after visits.', actions: `<button class="btn btn-primary" data-send>${PP.icon('send')} Send feedback request</button>` })
        + `<div class="card"><div class="card-body"><form class="ops-filterbar" data-filters onsubmit="return false">
            ${PP.form.field({ type: 'select', name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => [String(n), `${n} star${n > 1 ? 's' : ''}`]).concat([['low', '1–3 stars']]), placeholder: 'All ratings' })}
            ${PP.form.field({ type: 'select', name: 'pro', label: PP.t('professional'), options: allProOptions(), placeholder: `All ${PP.tl('professionals')}` })}
            ${PP.form.field({ type: 'date', name: 'from', label: 'From', value: st.from })}
            ${PP.form.field({ type: 'date', name: 'to', label: 'To', value: st.to })}
            <label class="check small" style="height:36px"><input type="checkbox" name="unanswered"> Needs a response</label>
            <button type="button" class="btn btn-ghost" data-clear>Reset</button>
          </form></div></div>
          <div class="grid grid-4 ops-kpis mt-4" data-kpis></div>
          <div class="ops-fb-top"><div data-dist></div><div data-bypro></div></div>
          <div class="card mt-4"><div class="card-head"><h2>Comments</h2><span class="small muted" data-count></span></div><ul class="ops-fb-list" data-list></ul><div class="card-foot hidden" data-more-wrap style="text-align:center"><button class="btn" data-more>Show more</button></div></div>
          <div class="card mt-4" data-reqs></div>`;
      const filtered = () => PP.db.feedback.filter((f) => PP.inBranch(f) && (!st.pro || f.professionalId === st.pro) && (!st.from || f.date >= st.from) && (!st.to || f.date <= st.to)
        && (!st.rating || (st.rating === 'low' ? f.rating <= 3 : f.rating === Number(st.rating))) && (!st.unanswered || !f.response)).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
      function draw() {
        const list = filtered();
        const avg = list.length ? PP.round2(PP.sum(list, (f) => f.rating) / list.length) : 0;
        const reqs = PP.db.feedbackRequests.filter((r) => PP.inBranch(r) && r.sentAt.slice(0, 10) >= (st.from || '0') && r.sentAt.slice(0, 10) <= (st.to || '9'));
        const rate = reqs.length ? Math.round((reqs.filter((r) => r.status === 'Answered').length / reqs.length) * 100) : 0;
        PP.$('[data-kpis]', el).innerHTML = PP.ui.kpi({ label: 'Average rating', value: list.length ? avg.toFixed(1) : '—', hint: list.length ? stars(avg) : 'No ratings in this period', tone: 'warning', icon: 'star' })
          + PP.ui.kpi({ label: 'Responses', value: list.length, hint: `${list.filter((f) => f.comment).length} with comments`, tone: 'info', icon: 'mail' })
          + PP.ui.kpi({ label: 'Rated 4–5 stars', value: list.length ? `${Math.round((list.filter((f) => f.rating >= 4).length / list.length) * 100)}%` : '—', hint: `${list.filter((f) => f.rating <= 2).length} rated 1–2`, tone: 'positive', icon: 'heart' })
          + PP.ui.kpi({ label: 'Request response rate', value: reqs.length ? `${rate}%` : '—', hint: `${reqs.length} requests sent in period`, tone: 'lavender', icon: 'send' });
        const max = Math.max(1, ...[1, 2, 3, 4, 5].map((n) => list.filter((f) => f.rating === n).length));
        PP.$('[data-dist]', el).innerHTML = PP.ui.card({ title: 'Rating distribution', body: `<div class="ops-avg"><span class="big">${list.length ? avg.toFixed(1) : '—'}</span><div>${stars(avg, true)}<div class="small muted">${list.length} rating${list.length === 1 ? '' : 's'}</div></div></div>
          <div class="ops-dist">${[5, 4, 3, 2, 1].map((n) => { const c = list.filter((f) => f.rating === n).length; return `<div class="ops-dist-row r${n}"><button type="button" data-rate="${n}" title="Show ${n}-star feedback"><span>${n} ${PP.icon('star', 'style="width:12px;height:12px;vertical-align:-1px"')}</span><span class="ops-dist-bar"><span style="width:${Math.round((c / max) * 100)}%"></span></span><span class="right mono">${c} · ${list.length ? Math.round((c / list.length) * 100) : 0}%</span></button></div>`; }).join('')}</div>` });
        const pros = PP.db.professionals.filter((p) => list.some((f) => f.professionalId === p.id)).map((p) => { const l = list.filter((f) => f.professionalId === p.id); return { p, n: l.length, avg: PP.sum(l, (f) => f.rating) / l.length, low: l.filter((f) => f.rating <= 2).length }; }).sort((a, b) => b.avg - a.avg);
        PP.$('[data-bypro]', el).innerHTML = PP.ui.card({ title: `By ${esc(PP.tl('professional'))}`, flush: true, body: pros.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${esc(PP.t('professional'))}</th><th>Average</th><th class="right">Ratings</th><th class="right">1–2 stars</th></tr></thead><tbody>${pros.map((x) => `<tr class="clickable" data-pro-row="${esc(x.p.id)}"><td><b>${esc(PP.proName(x.p))}</b><span class="sub">${esc(x.p.designation || '')}</span></td><td>${stars(x.avg)} <b class="mono">${x.avg.toFixed(1)}</b></td><td class="right mono">${x.n}</td><td class="right mono">${x.low}</td></tr>`).join('')}</tbody></table></div>` : PP.ui.empty({ icon: 'star', title: 'No ratings', text: 'Nothing in this period.' }) });
        const shown = list.slice(0, st.limit);
        PP.$('[data-count]', el).textContent = list.length ? `Showing ${shown.length} of ${list.length}` : '';
        PP.$('[data-list]', el).innerHTML = shown.length ? shown.map((f) => `<li class="ops-fb-item ${f.rating <= 2 ? 'low' : ''}">
            <div class="row between"><div class="row" style="gap:10px">${stars(f.rating)}<span class="who">${esc(PP.patientName(f.patientId))}</span><span class="meta mono">${esc(f.patientId)}</span></div><span class="meta">${esc(PP.fmt.date(f.date))} · ${esc(f.channel)}</span></div>
            <div class="meta">${esc(PP.proName(f.professionalId))}${f.appointmentId ? ` · <a href="#/appointments/${esc(f.appointmentId)}">${esc(f.appointmentId)}</a>` : ''}</div>
            ${f.comment ? `<div><q>${esc(f.comment)}</q></div>` : '<div class="meta">No comment left.</div>'}
            ${f.response ? `<div class="ops-fb-response"><b>Response</b> · ${esc(f.response.by)} · ${esc(PP.fmt.stamp(f.response.at))}<br>${esc(f.response.note)}</div>` : ''}
            <div><button class="btn btn-sm ${!f.response && f.rating <= 3 ? 'btn-primary' : ''}" data-respond="${esc(f.id)}">${PP.icon('edit')} ${f.response ? 'Edit response' : 'Respond'}</button></div></li>`).join('')
          : `<li>${PP.ui.empty({ icon: 'filter', title: PP.db.feedback.length ? 'No feedback matches the filters' : 'No feedback yet', text: PP.db.feedback.length ? 'Change the filters or the date range.' : 'Send feedback requests after visits.' })}</li>`;
        PP.$('[data-more-wrap]', el).classList.toggle('hidden', list.length <= st.limit);
        const allReqs = PP.db.feedbackRequests.filter((r) => PP.inBranch(r)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 8);
        PP.$('[data-reqs]', el).innerHTML = `<div class="card-head"><h2>Recent feedback requests</h2><span class="small muted">Simulated sending</span></div>${allReqs.length ? `<ul class="list">${allReqs.map((r) => `<li><div class="grow"><b>${esc(PP.patientName(r.patientId))}</b><span class="sub">${esc(r.channel)} · sent ${esc(PP.fmt.stamp(r.sentAt))}${r.appointmentId ? ` · ${esc(r.appointmentId)}` : ''}</span></div>${PP.ui.badge(r.status, r.status === 'Answered' ? 'positive' : 'info')}${r.status === 'Sent' ? `<button class="btn btn-ghost btn-sm" data-sim="${esc(r.id)}" title="Prototype only: pretend the patient answered">Simulate reply</button>` : ''}</li>`).join('')}</ul>` : `<div class="card-body">${PP.ui.empty({ icon: 'send', title: 'No requests sent yet' })}</div>`}`;
      }
      const fl = PP.$('[data-filters]', el);
      fl.addEventListener('input', () => { const v = PP.form.read(fl); Object.assign(st, { rating: v.rating, pro: v.pro, from: v.from, to: v.to, unanswered: v.unanswered, limit: 10 });
        PP.form.clearErrors(fl); if (st.from && st.to && st.from > st.to) { PP.form.setError(fl, 'to', '“To” must be on or after “From”.'); return; } draw(); });
      fl.addEventListener('change', () => fl.dispatchEvent(new Event('input')));
      PP.$('[data-clear]', el).addEventListener('click', () => { PP.$('[name=rating]', fl).value = ''; PP.$('[name=pro]', fl).value = ''; PP.$('[name=from]', fl).value = PP.addDays(T, -60); PP.$('[name=to]', fl).value = T; PP.$('[name=unanswered]', fl).checked = false; fl.dispatchEvent(new Event('input')); });
      // #view survives re-renders: replace the previous handler and ignore clicks once the user has left this page.
      if (el.__opsFeedbackClick) el.removeEventListener('click', el.__opsFeedbackClick);
      el.__opsFeedbackClick = (ev) => {
        if (!PP.currentPath().startsWith('/feedback')) return;
        const r = ev.target.closest('[data-respond]'); if (r) { respondModal(PP.db.feedback.find((f) => f.id === r.dataset.respond), draw); return; }
        const rate = ev.target.closest('[data-rate]'); if (rate) { PP.$('[name=rating]', fl).value = rate.dataset.rate; fl.dispatchEvent(new Event('input')); return; }
        const pr = ev.target.closest('[data-pro-row]'); if (pr) { PP.$('[name=pro]', fl).value = pr.dataset.proRow; fl.dispatchEvent(new Event('input')); return; }
        if (ev.target.closest('[data-more]')) { st.limit += 10; draw(); return; }
        const sim = ev.target.closest('[data-sim]');
        if (sim) {
          const q = PP.db.feedbackRequests.find((x) => x.id === sim.dataset.sim); const a = PP.find.appointment(q.appointmentId) || {};
          const rating = [5, 5, 4, 4, 3, 2][Math.floor(Math.random() * 6)];
          const fb = { id: uid('FB', 'feedback', 4), patientId: q.patientId, professionalId: a.professionalId || null, appointmentId: q.appointmentId, branchId: q.branchId, date: T, rating, comment: rating >= 4 ? 'Thank you, the sessions are helping.' : 'Waiting time was long today.', channel: `${q.channel} link`, response: null, createdAt: PP.nowStamp() };
          PP.db.feedback.unshift(fb); q.status = 'Answered'; q.feedbackId = fb.id; PP.save(); PP.ui.toast(`Simulated reply: ${rating} star${rating > 1 ? 's' : ''} from ${esc(PP.patientName(q.patientId))}.`, 'info'); draw();
        }
      };
      el.addEventListener('click', el.__opsFeedbackClick);
      PP.$('[data-send]', el).addEventListener('click', () => sendRequestModal(draw));
      draw();
    },
  });
})();
