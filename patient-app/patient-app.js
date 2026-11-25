/* Physio Point HTML prototype — Patient app (patient-portal/screens.md, PROPOSED; scope pending PD-010).
   Mobile-first. Reads and writes the SAME clinic store as the clinic workspace:
   - a booking creates a Pending online request (only the clinic confirms, like the public page);
   - cancel / reschedule never change a confirmed appointment directly: they create a request + a clinic notification;
   - "Pay now" is a simulated gateway notice only (online payment pending PD-013): no payment is recorded.
   Sign-in by mobile number + OTP is a proposal (PD-012); any 6 digits work here. Fictional data only (D-006). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc; const M = PP.m;
  const S = M.local('pp-patient-app', { clinic: null, mobile: null, patientId: null, consents: {}, readNtf: [] });

  /* ------------------------------------------------------------------ helpers */
  const me = () => (S.patientId ? PP.find.patient(S.patientId) : null);
  PP.currentUser = () => { const p = me(); return p ? { id: p.id, name: `${p.name} (patient app)`, role: 'patient', branchIds: [] } : null; };
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const T = () => PP.today();
  const OPEN = ['Scheduled', 'Confirmed', 'Checked in', 'In session'];
  const isUpcoming = (a) => OPEN.includes(a.status) && (a.date > T() || (a.date === T() && (a.end > PP.nowTime() || ['Checked in', 'In session'].includes(a.status))));
  const myAppts = () => PP.db.appointments.filter((a) => a.patientId === S.patientId);
  const upcoming = () => myAppts().filter(isUpcoming).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const past = () => myAppts().filter((a) => !isUpcoming(a)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const myRequests = () => { const p = me(); if (!p) return []; return PP.db.requests.filter((r) => r.patientId === p.id || (!r.patientId && digits(r.mobile) === digits(p.mobile) && String(r.name).toLowerCase() === p.name.toLowerCase())).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); };
  const pendingRequests = () => myRequests().filter((r) => r.status === 'Pending');
  const myInvoices = () => PP.db.invoices.filter((i) => i.patientId === S.patientId).sort((a, b) => b.date.localeCompare(a.date));
  const myPayments = () => PP.db.payments.filter((p) => p.patientId === S.patientId).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date)));
  const totalDue = () => PP.round2(PP.sum(myInvoices().filter((i) => i.status !== 'Void'), (i) => PP.bill.totals(i).due));
  const myPackages = () => PP.db.packages.filter((p) => p.patientId === S.patientId);
  const myPlans = () => PP.db.sessionPlans.filter((p) => p.patientId === S.patientId);
  const myRx = () => PP.db.prescriptions.filter((r) => r.patientId === S.patientId && r.status === 'Issued').sort((a, b) => b.date.localeCompare(a.date));
  const feedbackList = () => (PP.db.feedback || []);
  const rated = (aptId) => feedbackList().some((f) => f.appointmentId === aptId);
  const family = () => { const p = me(); return p && p.familyGroup ? PP.db.patients.filter((x) => x.familyGroup === p.familyGroup && x.id !== p.id && !x.mergedInto) : []; };
  const sameMobile = (x) => digits(x.mobile) === digits(S.mobile);
  /** Exercises from the latest issued prescription(s), one entry per exercise. */
  const myExercises = () => {
    // Current programme = the latest issued prescription for each condition (older ones are superseded).
    const map = new Map(); const seen = new Set();
    myRx().filter((rx) => { const k = rx.condition || rx.id; if (seen.has(k)) return false; seen.add(k); return true; }).forEach((rx) => (rx.items || []).forEach((it) => { if (!map.has(it.exerciseId)) map.set(it.exerciseId, Object.assign({ rxId: rx.id }, it)); }));
    return Array.from(map.values()).map((it) => Object.assign({ ex: PP.find.exercise(it.exerciseId) }, it)).filter((x) => x.ex);
  };
  const doneOn = (d) => { const p = me(); return (p && p.exerciseLog && p.exerciseLog[d]) || []; };
  const bookablePros = () => PP.db.professionals.filter((p) => { const t = PP.db.professionalTypes.find((x) => x.id === p.typeId); return p.status === 'Active' && (!t || t.canBeBooked); });
  const services = () => PP.db.services.filter((x) => x.status === 'Active' && !x.isPackage);
  const closedDay = (d) => PP.dow(d) === 5 || PP.db.closures.some((c) => c.date === d);
  const apptLine = (a) => `${PP.fmt.dateLong(a.date)} · ${PP.fmt.time(a.start)}`;
  const proAvatar = (id) => { const p = PP.find.professional(id); return p ? `<span class="avatar" style="background:${esc(p.color)}1f;color:${esc(p.color)}">${esc(PP.initials(p.name))}</span>` : `<span class="avatar">${PP.icon('user', 'style="width:18px"')}</span>`; };
  const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  /** Union of free slots across the chosen professional (or all, for "Any"). Same rule as the public page. */
  function slotsFor(serviceId, proId, date, excludeId) {
    const svc = PP.find.service(serviceId); const list = proId ? [proId] : bookablePros().map((p) => p.id);
    const map = new Map();
    list.forEach((id) => PP.sched.slots(id, date, svc.duration, excludeId).forEach((x) => { const cur = map.get(x.start); map.set(x.start, cur || x.free); }));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([start, free]) => ({ start, free: free && !(date === T() && PP.toMin(start) <= PP.toMin(PP.nowTime())) }));
  }
  const slotGrid = (slots, pick) => (slots.length ? `<div class="slot-grid">${slots.map((x) => `<button type="button" class="slot ${x.free ? '' : 'booked'} ${pick === x.start ? 'selected' : ''}" data-slot="${x.start}" ${x.free ? '' : 'disabled aria-disabled="true"'}>${PP.fmt.time(x.start)}</button>`).join('')}</div><div class="legend mt-3"><span>Free</span><span class="l-booked">Taken</span><span class="l-selected">Selected</span></div>`
    : PP.ui.empty({ icon: 'calendar', title: 'No free times on this day', text: 'The clinic is closed, the ' + esc(PP.tl('professional')) + ' is not working, or every slot is taken. Try another day.' }));

  /** Notifications for this patient, derived from their records (production: push + SMS from the notification engine). */
  function inbox() {
    const out = []; const p = me(); if (!p) return out;
    myRequests().forEach((r) => {
      if (r.status === 'Confirmed') out.push({ id: 'n-' + r.id + '-c', at: r.reviewedAt || r.createdAt, icon: 'checkCircle', t: 'Appointment confirmed', s: `${r.id} · ${PP.serviceName(r.serviceId)} · ${PP.fmt.dateShort(r.date)}`, href: r.appointmentId ? `#/appointments/${r.appointmentId}` : '#/appointments?tab=requests' });
      else if (r.status === 'Rejected') out.push({ id: 'n-' + r.id + '-r', at: r.reviewedAt || r.createdAt, icon: 'alert', t: 'Request not accepted', s: `${r.id} · ${r.rejectReason || 'Please call the clinic.'}`, href: '#/appointments?tab=requests' });
      else if (r.status === 'Pending') out.push({ id: 'n-' + r.id + '-p', at: r.createdAt, icon: 'clock', t: 'Request sent to the clinic', s: `${r.id} · waiting for confirmation`, href: '#/appointments?tab=requests' });
    });
    upcoming().slice(0, 3).forEach((a) => { if (PP.diffDays(T(), a.date) <= 1) out.push({ id: 'n-rem-' + a.id, at: a.date + 'T08:00:00', icon: 'bell', t: a.date === T() ? 'Appointment today' : 'Reminder: appointment tomorrow', s: `${PP.fmt.time(a.start)} with ${PP.proName(a.professionalId)}`, href: `#/appointments/${a.id}` }); });
    myPayments().slice(0, 3).forEach((x) => { if (x.status === 'Completed' && x.type === 'payment') out.push({ id: 'n-' + x.id, at: x.at || x.date, icon: 'receipt', t: 'Payment received', s: `${PP.fmt.money(x.amount)} · ${x.method} · ${x.invoiceId}`, href: `#/billing/invoices/${x.invoiceId}` }); });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  const unread = () => inbox().filter((n) => !S.readNtf.includes(n.id)).length;

  /* ------------------------------------------------------------------ boot */
  const brand = () => { const s = PP.db.settings; return `<span class="logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : PP.logoSvg}</span><span style="min-width:0"><b>${esc(s.clinicName)}</b><span>Patient app</span></span>`; };
  const AUTH = ['/clinic', '/signin', '/otp', '/profiles'];
  function guard(path, r) {
    if (!S.clinic) return path === '/clinic' ? null : '#/clinic';
    if (!S.patientId || !me()) return AUTH.includes(path) ? null : '#/signin';
    if (!S.consents[S.patientId]) return path === '/consent' ? null : '#/consent';
    if (r && r.public) return '#/home';
    return null;
  }

  /* ================================================================== ACCESS */
  PP.route('/clinic', { sync: false, title: 'Find my clinic', public: true, chrome: 'none', render({ el }) {
    el.innerHTML = `<div class="m-auth"><div class="m-hero-ill">${M.clinicIll}</div>
      <h2>Find my clinic</h2><p class="lead">Enter the clinic code or the clinic’s web address. You find it on your appointment card, receipt or SMS.</p>
      <form class="m-form" novalidate data-f>
        ${PP.form.field({ name: 'code', label: 'Clinic code or domain', required: true, value: S.lastCode || '', placeholder: 'e.g. PHYSIOPOINT', attrs: 'autocapitalize="characters" autocomplete="off"' })}
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('search')} Find clinic</button>
        <button class="btn m-btn-block" type="button" data-qr disabled title="Proposed only">${PP.icon('eye')} Scan clinic QR code (proposed)</button>
      </form>
      <div data-out class="mt-4"></div>
      <div class="mt-4">${M.clinicExplainer()}</div></div>`;
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(f)) return;
      const code = PP.form.read(f).code; S.lastCode = code; S.save();
      const out = PP.$('[data-out]', el);
      await PP.ui.busy(PP.$('[data-go]', f), async () => {
        const c = M.lookupClinic(code);
        if (!c) { PP.form.setError(f, 'code', `No clinic found for “${code}”. Check the code on your receipt, or ask the clinic.`); out.innerHTML = ''; return; }
        out.innerHTML = `<div class="m-card teal"><div class="row" style="flex-wrap:nowrap"><span class="avatar lg" style="background:var(--pp-primary);color:#fff">${PP.logoSvg.replace('<svg', '<svg style="width:30px;height:30px"')}</span><div><b>${esc(c.name)}</b><div class="small muted">${esc(c.address)}</div><div class="small muted mono">Server: ${esc(c.domain)}</div></div></div>
          <div class="m-actions"><button class="btn btn-primary" data-use>${PP.icon('check')} This is my clinic</button></div></div>`;
        PP.$('[data-use]', out).addEventListener('click', () => { S.clinic = c; S.save(); M.toast(`Connected to ${esc(c.name)}`); location.hash = '#/signin'; });
      }, 650);
    });
  } });

  PP.route('/signin', { sync: false, title: 'Sign in', public: true, chrome: 'none', render({ el }) {
    const demo = [['PAT-000342', 'Nusrat Jahan'], ['PAT-000343', 'Arafat Hossain'], ['PAT-000347', 'Imran Ahmed']].map(([id]) => PP.find.patient(id)).filter(Boolean);
    el.innerHTML = `<div class="m-auth"><a class="btn btn-ghost btn-sm" href="#/clinic" data-change>${PP.icon('chevL')} ${esc(S.clinic.name)}</a>
      <div class="m-hero-ill"><span class="avatar lg" style="width:76px;height:76px">${PP.icon('phone', 'style="width:34px;height:34px"')}</span></div>
      <h2>Sign in with your mobile</h2><p class="lead">Use the mobile number the clinic has on file. We send a 6-digit code by SMS.</p>
      <form class="m-form" novalidate data-f>
        ${PP.form.field({ name: 'mobile', label: 'Mobile number', type: 'tel', required: true, rule: 'mobile', value: S.mobile || '', placeholder: '01XXXXXXXXX', attrs: 'inputmode="tel" autocomplete="tel"' })}
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('send')} Send code</button>
      </form>
      <div class="m-demo mt-4"><b>Demo patients</b> (fictional). Tap to fill:<div class="m-chips">${demo.map((p) => `<button type="button" class="m-chip" data-demo="${esc(p.mobile)}">${esc(p.name)} · ${esc(p.id)}</button>`).join('')}</div>
        <div class="mt-2">Nusrat Jahan shares her number with her mother (family), so you will be asked which profile to open.</div></div>
      <p class="m-note mt-4">Sign-in method is a proposal (mobile OTP, PD-012). No SMS is sent in this prototype.</p></div>`;
    const f = PP.$('[data-f]', el);
    PP.$$('[data-demo]', el).forEach((b) => b.addEventListener('click', () => { PP.$('[name=mobile]', f).value = b.dataset.demo; PP.form.clearErrors(f); }));
    PP.$('[data-change]', el).addEventListener('click', () => { S.clinic = null; S.save(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(f)) return;
      const m = digits(PP.form.read(f).mobile);
      await PP.ui.busy(PP.$('[data-go]', f), async () => {
        const hits = PP.db.patients.filter((p) => !p.mergedInto && p.status !== 'Inactive' && digits(p.mobile) === m);
        if (!hits.length) { PP.form.setError(f, 'mobile', 'No patient record at this clinic uses this number. Ask the front desk to add it, or request a visit from the clinic’s booking page.'); return; }
        S.mobile = m; S.otpSentAt = Date.now(); S.save(); location.hash = '#/otp';
      }, 600);
    });
  } });

  PP.route('/otp', { sync: false, title: 'Enter code', public: true, chrome: 'none', render({ el }) {
    if (!S.mobile) { location.replace('#/signin'); return; }
    el.innerHTML = `<div class="m-auth"><a class="btn btn-ghost btn-sm" href="#/signin">${PP.icon('chevL')} Change number</a>
      <div class="m-hero-ill"><span class="avatar lg" style="width:76px;height:76px">${PP.icon('lock', 'style="width:34px;height:34px"')}</span></div>
      <h2>Enter the 6-digit code</h2><p class="lead">Sent by SMS to <b class="mono">${esc(S.mobile.replace(/^(\d{5})(\d+)(\d{2})$/, (x, a, b, c) => a + '•'.repeat(b.length) + c))}</b>.</p>
      <form novalidate data-f>${M.otpHtml()}
        <div class="small mt-2" style="color:var(--pp-error-fg);font-weight:600;min-height:18px" data-err role="alert"></div>
        <button class="btn btn-primary m-btn-block mt-3" type="submit" data-go>${PP.icon('check')} Verify and sign in</button></form>
      <div class="row between mt-3"><span class="m-note">Prototype: any 6 digits work.</span><button class="btn btn-ghost btn-sm" data-resend disabled>Resend in <span data-t>30</span>s</button></div></div>`;
    const boxes = PP.$$('[data-otp] input', el);
    M.bindOtp(boxes);
    let left = 30; const rs = PP.$('[data-resend]', el);
    const timer = setInterval(() => { if (!document.body.contains(rs)) return clearInterval(timer); left--; if (left <= 0) { clearInterval(timer); rs.disabled = false; rs.textContent = 'Resend code'; } else PP.$('[data-t]', rs).textContent = left; }, 1000);
    rs.addEventListener('click', () => { M.toast('A new code was sent (simulated).', 'info'); rs.disabled = true; rs.textContent = 'Code sent'; });
    PP.$('[data-f]', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const code = boxes.map((b) => b.value).join('');
      const err = PP.$('[data-err]', el); const wrap = PP.$('[data-otp]', el);
      if (!/^\d{6}$/.test(code)) { wrap.classList.add('has-error'); err.textContent = 'Enter all 6 digits of the code.'; return; }
      wrap.classList.remove('has-error'); err.textContent = '';
      await PP.ui.busy(PP.$('[data-go]', el), async () => {
        const hits = PP.db.patients.filter((p) => !p.mergedInto && p.status !== 'Inactive' && digits(p.mobile) === S.mobile);
        if (hits.length === 1) { signIn(hits[0].id); } else { location.hash = '#/profiles'; }
      }, 600);
    });
  } });

  function signIn(id) {
    S.patientId = id; S.save();
    const p = me(); M.write(() => PP.audit('Patient app sign-in', id, `Mobile OTP · ${p ? p.name : id}`));
    location.hash = S.consents[id] ? '#/home' : '#/consent';
  }

  PP.route('/profiles', { sync: false, title: 'Choose profile', public: true, chrome: 'none', render({ el }) {
    const hits = PP.db.patients.filter((p) => !p.mergedInto && digits(p.mobile) === S.mobile);
    if (!S.mobile || !hits.length) { location.replace('#/signin'); return; }
    el.innerHTML = `<div class="m-auth"><h2>Who is using the app?</h2><p class="lead">This mobile number is shared by ${hits.length} patient records. Each person keeps their own patient ID and records.</p>
      <div>${hits.map((p) => `<button class="m-choice" data-pick="${esc(p.id)}"><span class="avatar">${esc(PP.initials(p.name))}</span><span class="grow"><b>${esc(p.name)}</b><span class="s">${esc(p.id)} · ${esc(p.gender || '—')} · ${esc(PP.fmt.age(p.dob))}</span></span>${PP.icon('chevR', 'style="width:18px;color:var(--pp-text-3)"')}</button>`).join('')}</div>
      <p class="m-note mt-4">A mobile number is not a unique patient identifier (blueprint rule). You can switch profile later under More → Family members.</p></div>`;
    PP.$$('[data-pick]', el).forEach((b) => b.addEventListener('click', () => signIn(b.dataset.pick)));
  } });

  PP.route('/consent', { sync: false, title: 'Privacy and consent', chrome: 'none', render({ el }) {
    const p = me(); const c = p.consent || {};
    el.innerHTML = `<div class="m-auth"><div class="m-hero-ill"><span class="avatar lg" style="width:76px;height:76px">${PP.icon('shield', 'style="width:34px;height:34px"')}</span></div>
      <h2>Your privacy</h2><p class="lead">Hello ${esc(p.name.split(' ')[0])}. Before you start, please review how ${esc(PP.db.settings.clinicName)} uses the app.</p>
      <form class="m-form" novalidate data-f>
        <div class="m-card"><ul class="small" style="margin:0;padding-left:18px">
          <li>Your records stay on the clinic’s own server. The app vendor cannot see them.</li>
          <li>You can see your appointments, prescriptions, exercises, packages and invoices.</li>
          <li>Requests you send (booking, cancel, reschedule) are reviewed by clinic staff.</li></ul></div>
        <div class="field" data-field="terms"><label class="check"><input type="checkbox" name="terms"> I agree to the app terms and the clinic’s privacy notice.<span class="req">*</span></label><div class="error">Please accept to continue.</div></div>
        <div class="field" data-field="data"><label class="check"><input type="checkbox" name="data"> I agree that the clinic stores and uses my health information for my care.<span class="req">*</span></label><div class="error">Please accept to continue.</div></div>
        <div class="m-list">
          ${M.item({ icon: 'phone', t: 'Appointment reminders by SMS', s: 'Optional. Change any time in More.', right: M.switchHtml('sms', c.sms !== false, 'SMS reminders') })}
          ${M.item({ icon: 'send', t: 'Messages on WhatsApp', s: 'Optional.', right: M.switchHtml('whatsapp', !!c.whatsapp, 'WhatsApp messages') })}
        </div>
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('check')} Agree and continue</button>
        <button class="btn btn-ghost m-btn-block" type="button" data-no>Not now (sign out)</button>
      </form></div>`;
    const f = PP.$('[data-f]', el);
    PP.$('[data-no]', el).addEventListener('click', () => { S.patientId = null; S.save(); location.hash = '#/signin'; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = PP.form.read(f); PP.form.clearErrors(f); let ok = true;
      if (!d.terms) { PP.form.setError(f, 'terms'); ok = false; }
      if (!d.data) { PP.form.setError(f, 'data'); ok = false; }
      if (!ok) return;
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        M.write(() => {
          const pt = me();
          pt.consent = Object.assign({ sms: false, whatsapp: false }, pt.consent, { sms: !!d.sms, whatsapp: !!d.whatsapp, updatedAt: PP.nowStamp(), updatedBy: 'Patient app' });
          pt.consents = pt.consents || [];
          pt.consents.unshift({ id: `CNS-${Date.now().toString(36)}`, at: PP.nowStamp(), date: T(), items: ['data'].concat(d.sms || d.whatsapp ? ['reminders'] : []), signer: pt.name, relation: 'Self', signature: null, by: 'Patient app (in-app consent)' });
          PP.audit('Patient app consent recorded', pt.id, `Terms + data use · SMS ${d.sms ? 'on' : 'off'} · WhatsApp ${d.whatsapp ? 'on' : 'off'}`);
        });
        S.consents[S.patientId] = PP.nowStamp(); S.save();
        M.toast('Welcome! Your choices were saved.'); location.hash = '#/home';
      });
    });
  } });

  /* ================================================================== HOME */
  PP.route('/home', { title: 'Home', tab: 'home', render({ el }) {
    const p = me(); const next = upcoming()[0]; const pend = pendingRequests(); const due = totalDue();
    const ex = myExercises(); const done = doneOn(T()).filter((id) => ex.some((x) => x.exerciseId === id)).length;
    const pkg = myPackages().find((x) => x.status === 'Active');
    const toRate = past().find((a) => a.status === 'Completed' && !rated(a.id) && PP.diffDays(a.date, T()) <= 14);
    const reminders = [];
    if (next && PP.diffDays(T(), next.date) <= 1) reminders.push(M.item({ href: `#/appointments/${next.id}`, icon: 'bell', t: next.date === T() ? `Appointment today at ${PP.fmt.time(next.start)}` : `Tomorrow at ${PP.fmt.time(next.start)}`, s: `Please arrive 10 minutes early · ${esc(PP.branchName(next.branchId))}` }));
    if (ex.length) reminders.push(M.item({ href: '#/care?tab=exercises', icon: 'dumbbell', t: done >= ex.length ? 'All exercises done today' : `Exercises today: ${done} of ${ex.length} done`, s: done >= ex.length ? 'Great work. Keep it up tomorrow.' : 'Tap to mark them done' }));
    if (pkg) { const left = pkg.sessionsTotal - pkg.sessionsUsed; const days = PP.diffDays(T(), pkg.expires); reminders.push(M.item({ href: '#/billing?tab=packages', icon: 'layers', t: `${left} package sessions left`, s: `${esc(PP.serviceName(pkg.serviceId))} · expires in ${days} days`, cls: days <= 14 ? 'unread' : '' })); }
    if (toRate) reminders.push(M.item({ href: `#/feedback/${toRate.id}`, icon: 'star', t: 'How was your visit?', s: `${PP.fmt.dateShort(toRate.date)} with ${esc(PP.proName(toRate.professionalId))}` }));
    if (pend.length) reminders.push(M.item({ href: '#/appointments?tab=requests', icon: 'clock', t: `${pend.length} request${pend.length > 1 ? 's' : ''} waiting for the clinic`, s: 'You will get an SMS when the clinic confirms' }));
    el.innerHTML = `<div class="m-hello"><h2>${greet()}, ${esc(p.name.split(' ')[0])}</h2><p>${esc(p.id)} · ${esc(PP.db.settings.clinicName)}</p></div>
      ${next ? `<div class="m-card hero"><div class="row between"><span class="small" style="font-weight:700;letter-spacing:.04em;text-transform:uppercase">Next appointment</span>${PP.ui.badge(next.status)}</div>
          <h3 style="font-size:19px;margin-top:8px">${esc(PP.serviceName(next.serviceId))}</h3>
          <div class="mt-2">${PP.icon('calendar', 'style="width:15px;vertical-align:-2px"')} ${PP.fmt.dateLong(next.date)} · ${PP.fmt.time(next.start)}</div>
          <div class="small mt-2">${esc(PP.proName(next.professionalId))} · ${esc(PP.branchName(next.branchId))}${next.roomId ? ' · ' + esc((PP.find.room(next.roomId) || {}).name || '') : ''}</div>
          ${next.changeRequest && next.changeRequest.status === 'Pending' ? `<div class="small mt-2"><span class="badge warning">${esc(next.changeRequest.type)} requested</span></div>` : ''}
          <div class="m-actions"><a class="btn" href="#/appointments/${esc(next.id)}">Details</a><a class="btn btn-primary" href="#/book">${PP.icon('plus')} Book another</a></div></div>`
        : `<div class="m-card teal"><b>No upcoming appointment</b><p class="small muted" style="margin:4px 0 0">Request a time and the clinic will confirm it.</p><div class="m-actions"><a class="btn btn-primary" href="#/book">${PP.icon('plus')} Book appointment</a></div></div>`}
      ${due > 0 ? `<a class="m-card warn" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;margin-top:12px" href="#/billing"><span class="m-ic" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#fff;color:var(--pp-warning-fg)">${PP.icon('wallet', 'style="width:20px"')}</span><span style="flex:1"><b>Outstanding dues</b><span class="small muted" style="display:block">Across ${myInvoices().filter((i) => PP.bill.totals(i).due > 0).length} invoice(s)</span></span><b class="m-dues mono">${PP.fmt.money(due)}</b></a>` : ''}
      ${M.sec('Quick actions')}
      <div class="m-quick">
        <a href="#/book"><span class="qi">${PP.icon('calendar')}</span>Book</a>
        <a href="#/care?tab=exercises"><span class="qi">${PP.icon('dumbbell')}</span>Exercises</a>
        <a href="#/care?tab=rx"><span class="qi">${PP.icon('rx')}</span>Prescriptions</a>
        <a href="#/billing"><span class="qi">${PP.icon('receipt')}</span>Invoices</a>
        <a href="#/care"><span class="qi">${PP.icon('activity')}</span>My plan</a>
        <a href="#/billing?tab=packages"><span class="qi">${PP.icon('layers')}</span>Packages</a>
        <a href="#/family"><span class="qi">${PP.icon('users')}</span>Family</a>
        <a href="tel:${esc(digits(PP.db.settings.phone))}"><span class="qi">${PP.icon('phone')}</span>Call clinic</a>
      </div>
      ${M.sec('Reminders')}
      ${reminders.length ? `<div class="m-list">${reminders.join('')}</div>` : M.emptyCard({ icon: 'checkCircle', title: 'You are all caught up', text: 'No reminders right now.' })}`;
  } });

  /* ================================================================== APPOINTMENTS */
  PP.route('/appointments', { title: 'Appointments', tab: 'appts', render({ el, query }) {
    let tab = query.tab || 'upcoming';
    el.innerHTML = `<a class="btn btn-primary m-btn-block" href="#/book">${PP.icon('plus')} Book an appointment</a><div class="mt-3"></div>
      ${M.seg('t', [['upcoming', 'Upcoming'], ['requests', `Requests${pendingRequests().length ? ' (' + pendingRequests().length + ')' : ''}`], ['past', 'Past']], tab)}<div data-list></div>`;
    const list = PP.$('[data-list]', el);
    const row = (a) => M.item({ href: `#/appointments/${a.id}`, avatar: proAvatar(a.professionalId), t: esc(PP.serviceName(a.serviceId)), s: `${apptLine(a)}<br>${esc(PP.proName(a.professionalId))}`, right: a.changeRequest && a.changeRequest.status === 'Pending' ? `<span class="badge warning">${esc(a.changeRequest.type)}?</span>` : PP.ui.badge(a.status) });
    const draw = () => {
      if (tab === 'upcoming') { const l = upcoming(); list.innerHTML = l.length ? `<div class="m-list">${l.map(row).join('')}</div>` : M.emptyCard({ icon: 'calendar', title: 'No upcoming appointments', text: 'Book one and the clinic will confirm it.', action: '<a class="btn btn-primary" href="#/book">Book appointment</a>' }); }
      else if (tab === 'past') { const l = past(); list.innerHTML = l.length ? `<div class="m-list">${l.slice(0, 30).map(row).join('')}</div>` : M.emptyCard({ icon: 'clock', title: 'No past appointments yet' }); }
      else {
        const l = myRequests();
        list.innerHTML = `${PP.ui.alert('info', 'A request is <b>not a booking yet</b>. The clinic checks the time and confirms it; until then no slot is reserved.')}
          ${l.length ? `<div class="m-list mt-3">${l.map((r) => M.item({ attrs: `data-req="${esc(r.id)}" role="button" tabindex="0" style="cursor:pointer"`, icon: r.rescheduleOf ? 'repeat' : 'clock', t: `${esc(PP.serviceName(r.serviceId))}${r.rescheduleOf ? ' · reschedule' : ''}`, s: `<span class="mono">${esc(r.id)}</span> · ${PP.fmt.dateShort(r.date)}, ${PP.fmt.time(r.time)}<br>${r.preferredProfessionalId ? esc(PP.proName(r.preferredProfessionalId)) : 'Any available ' + esc(PP.tl('professional'))}`, right: PP.ui.badge(r.status) })).join('')}</div>` : `<div class="mt-3">${M.emptyCard({ icon: 'send', title: 'No requests', text: 'Requests you send from the app appear here.' })}</div>`}`;
        PP.$$('[data-req]', list).forEach((b) => { const open = () => requestSheet(PP.find.request(b.dataset.req), draw); b.addEventListener('click', open); b.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); }); });
      }
    };
    M.bindSeg(el, 't', (v) => { tab = v; history.replaceState(null, '', '#/appointments?tab=' + v); draw(); });
    draw();
  } });

  function requestSheet(r, after) {
    const s = M.sheet({ title: `Request ${esc(r.id)}`,
      body: `<dl class="m-kv"><dt>Status</dt><dd>${PP.ui.badge(r.status)}</dd><dt>Service</dt><dd>${esc(PP.serviceName(r.serviceId))}</dd><dt>${esc(PP.t('professional'))}</dt><dd>${r.preferredProfessionalId ? esc(PP.proName(r.preferredProfessionalId)) : 'Any available'}</dd>
        <dt>Preferred time</dt><dd>${PP.fmt.dateLong(r.date)}, ${PP.fmt.time(r.time)}</dd><dt>Sent</dt><dd>${PP.fmt.stamp(r.createdAt)}</dd>${r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : ''}${r.rejectReason ? `<dt>Clinic reply</dt><dd>${esc(r.rejectReason)}</dd>` : ''}</dl>
        ${r.status === 'Pending' ? `<div class="mt-3">${PP.ui.alert('info', 'Waiting for the clinic. You can withdraw the request while it is pending.')}</div>` : ''}`,
      buttons: r.status === 'Pending' ? [{ label: 'Close', kind: 'ghost' }, { label: 'Withdraw request', kind: 'danger', onClick: async () => {
        await PP.ui.busy(null, () => M.write(() => {
          const x = PP.find.request(r.id); if (!x || x.status !== 'Pending') return;
          x.status = 'Cancelled'; x.cancelledBy = 'patient'; x.rejectReason = 'Withdrawn by the patient in the app'; x.reviewedAt = PP.nowStamp();
          if (x.rescheduleOf) { const a = PP.find.appointment(x.rescheduleOf); if (a && a.changeRequest && a.changeRequest.requestId === x.id) a.changeRequest.status = 'Withdrawn'; }
          PP.audit('Online request withdrawn by patient', x.id, 'Patient app');
          PP.notify('Patient withdrew a request', `${x.name} · ${x.id} · ${PP.fmt.date(x.date)} ${PP.fmt.time(x.time)}`, `#/appointments/${x.id}`);
        }), 400);
        M.toast(`${esc(r.id)} withdrawn.`); if (after) after();
      } }] : [{ label: 'Close', kind: 'ghost' }] });
    return s;
  }

  PP.route('/appointments/:id', { title: 'Appointment', tab: 'appts', back: '#/appointments', render({ el, params }) {
    const a = PP.find.appointment(params.id);
    if (!a || a.patientId !== S.patientId) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Appointment not found', text: 'It may belong to another profile.', action: '<a class="btn" href="#/appointments">Back</a>' }); return; }
    const pro = PP.find.professional(a.professionalId); const visit = PP.db.visits.find((v) => v.appointmentId === a.id);
    const rx = visit ? PP.db.prescriptions.find((r) => r.visitId === visit.id && r.status === 'Issued') : null;
    const inv = PP.db.invoices.find((i) => i.appointmentId === a.id);
    const cr = a.changeRequest && a.changeRequest.status === 'Pending' ? a.changeRequest : null;
    const canChange = isUpcoming(a) && !cr && !['Checked in', 'In session'].includes(a.status);
    el.innerHTML = `<div class="m-card"><div class="row between"><span class="mono small muted">${esc(a.id)}</span>${PP.ui.badge(a.status)}</div>
        <h3 style="font-size:18px;margin-top:6px">${esc(PP.serviceName(a.serviceId))}</h3>
        <div class="row mt-3" style="flex-wrap:nowrap">${proAvatar(a.professionalId)}<div><b>${esc(PP.proName(pro))}</b><div class="small muted">${esc(pro ? pro.designation : '')}</div></div></div>
        <div class="divider"></div>
        <dl class="m-kv"><dt>Date</dt><dd>${PP.fmt.dateLong(a.date)}</dd><dt>Time</dt><dd>${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)}</dd><dt>Branch</dt><dd>${esc(PP.branchName(a.branchId))}</dd>${a.roomId ? `<dt>Room</dt><dd>${esc((PP.find.room(a.roomId) || {}).name || '—')}</dd>` : ''}${a.cancelReason ? `<dt>Reason</dt><dd>${esc(a.cancelReason)}</dd>` : ''}</dl></div>
      ${cr ? `<div class="mt-3">${PP.ui.alert('warning', `<b>${esc(cr.type)} requested</b> on ${PP.fmt.stamp(cr.at)}. The clinic will contact you. Until then this appointment stays as it is.`)}</div>` : ''}
      ${canChange ? `${M.sec('Need a change?')}<div class="m-card"><p class="small muted" style="margin:0">Confirmed appointments are changed by the clinic. Your request goes to the front desk; they confirm by SMS.</p>
          <div class="m-actions"><button class="btn" data-resched>${PP.icon('repeat')} Request new time</button><button class="btn btn-danger" data-cancel>${PP.icon('x')} Ask to cancel</button></div></div>` : ''}
      ${a.status === 'Completed' ? `${M.sec('After your visit')}<div class="m-list">
          ${rated(a.id) ? M.item({ icon: 'star', t: 'Thanks for your feedback', s: 'You rated this visit.' }) : M.item({ href: `#/feedback/${a.id}`, icon: 'star', t: 'Rate this visit', s: 'Takes 20 seconds' })}
          ${rx ? M.item({ href: `#/care/prescriptions/${rx.id}`, icon: 'rx', t: 'Prescription from this visit', s: esc(rx.condition || '') }) : ''}
          ${visit && visit.advice ? M.item({ icon: 'info', t: 'Advice', s: esc(visit.advice) }) : ''}
          ${inv ? M.item({ href: `#/billing/invoices/${inv.id}`, icon: 'receipt', t: `Invoice ${esc(inv.id)}`, s: `${PP.bill.totals(inv).status} · due ${PP.fmt.money(PP.bill.totals(inv).due)}` }) : ''}</div>` : ''}`;
    const c = PP.$('[data-cancel]', el); if (c) c.addEventListener('click', () => cancelFlow(a));
    const r = PP.$('[data-resched]', el); if (r) r.addEventListener('click', () => rescheduleFlow(a));
  } });

  async function cancelFlow(a) {
    const res = await M.confirm({ title: 'Ask the clinic to cancel?', message: `${esc(PP.serviceName(a.serviceId))} · ${apptLine(a)}.<br><span class="small muted">The appointment is not cancelled until the clinic processes your request.</span>`, confirmLabel: 'Send cancel request', danger: true, reasonLabel: 'Reason', reasonRequired: true });
    if (!res) return;
    M.write(() => {
      const x = PP.find.appointment(a.id); const p = me();
      x.changeRequest = { type: 'Cancel', reason: res.reason, at: PP.nowStamp(), status: 'Pending', by: 'Patient app' };
      (x.history = x.history || []).push({ at: PP.nowStamp(), status: x.status, note: `Patient asked to cancel (app): ${res.reason}`, by: p.name });
      PP.audit('Cancellation requested by patient', x.id, `Patient app · ${res.reason}`);
      PP.notify('Patient asked to cancel', `${p.name} · ${x.id} · ${PP.fmt.date(x.date)} ${PP.fmt.time(x.start)} · ${res.reason}`, `#/appointments/${x.id}`);
    });
    M.toast('Cancel request sent. The clinic will confirm by SMS.'); PP.render();
  }

  function rescheduleFlow(a) {
    const svc = PP.find.service(a.serviceId); const max = (PP.db.settings.booking || {}).maxDaysAhead || 30;
    let day = PP.addDays(T(), 1); let pick = null;
    const sheet = M.sheet({ title: 'Request a new time',
      body: `<p class="small muted" style="margin-top:0">Same service and ${esc(PP.tl('professional'))}: ${esc(svc.name)} with ${esc(PP.proName(a.professionalId))}. Currently ${apptLine(a)}.</p>
        <div class="label">Day</div>${M.dayChips(T(), Math.min(max, 21), day, closedDay)}<div class="label mt-3">Free times (${svc.duration} min)</div><div class="mt-2" data-slots></div>
        <form class="m-form mt-3" onsubmit="return false">${PP.form.field({ name: 'reason', label: 'Reason (optional)', type: 'textarea', rows: 2, attrs: 'maxlength="200"' })}</form>`,
      buttons: [{ label: 'Back', kind: 'ghost' }, { label: `${PP.icon('send')} Send request`, kind: 'primary', onClick: async ({ body }) => {
        if (!pick) { M.toast('Choose a free time first.', 'warning'); return false; }
        const reason = PP.form.read(PP.$('form', body)).reason;
        await PP.sleep(450);
        const req = M.write(() => {
          const p = me(); const x = PP.find.appointment(a.id);
          const q = { id: PP.nextId('REQ'), name: p.name, mobile: digits(p.mobile), serviceId: x.serviceId, preferredProfessionalId: x.professionalId, date: day, time: pick, notes: `Reschedule of ${x.id} (now ${PP.fmt.date(x.date)} ${PP.fmt.time(x.start)}). Please cancel the original when confirming.${reason ? ' Reason: ' + reason : ''}`, status: 'Pending', createdAt: PP.nowStamp(), patientId: p.id, branchId: x.branchId, source: 'Patient app', rescheduleOf: x.id, smsConsent: !!(p.consent && p.consent.sms) };
          PP.db.requests.push(q);
          x.changeRequest = { type: 'Reschedule', requestId: q.id, reason: reason || '', at: PP.nowStamp(), status: 'Pending', by: 'Patient app' };
          (x.history = x.history || []).push({ at: PP.nowStamp(), status: x.status, note: `Patient asked to reschedule to ${PP.fmt.date(day)} ${PP.fmt.time(pick)} (${q.id})`, by: p.name });
          PP.audit('Reschedule requested by patient', x.id, `${q.id} · ${PP.fmt.date(day)} ${PP.fmt.time(pick)}`);
          PP.notify('Patient asked to reschedule', `${p.name} · ${x.id} → ${PP.fmt.date(day)} ${PP.fmt.time(pick)}`, `#/appointments/${q.id}`);
          return q;
        });
        M.toast(`Reschedule request ${esc(req.id)} sent. Your current appointment stays until the clinic confirms.`, 'positive', 4200); PP.render();
      } }],
    });
    const drawSlots = () => { const box = PP.$('[data-slots]', sheet.body); box.innerHTML = slotGrid(slotsFor(a.serviceId, a.professionalId, day, a.id), pick); PP.$$('[data-slot]', box).forEach((b) => b.addEventListener('click', () => { pick = b.dataset.slot; drawSlots(); })); };
    PP.$$('[data-day]', sheet.body).forEach((b) => b.addEventListener('click', () => { day = b.dataset.day; pick = null; PP.$$('[data-day]', sheet.body).forEach((x) => x.classList.toggle('active', x === b)); drawSlots(); }));
    drawSlots();
  }

  /* ---------------------------------------------------------------- booking */
  PP.route('/book', { sync: false, title: 'Book appointment', tab: 'appts', back: '#/appointments', render({ el }) {
    const st = { step: 1, serviceId: null, pro: undefined, date: null, time: null, notes: '' };
    const max = (PP.db.settings.booking || {}).maxDaysAhead || 30;
    const draw = () => {
      const svc = st.serviceId ? PP.find.service(st.serviceId) : null;
      const steps = `<div class="m-steps" aria-label="Step ${st.step} of 4">${[1, 2, 3, 4].map((n) => `<i class="${n <= st.step ? 'on' : ''}"></i>`).join('')}</div>`;
      const summary = [svc ? esc(svc.name) : '', st.pro !== undefined ? (st.pro ? esc(PP.proShort(st.pro)) : 'Any ' + esc(PP.tl('professional'))) : '', st.date ? PP.fmt.dateShort(st.date) + (st.time ? ', ' + PP.fmt.time(st.time) : '') : ''].filter(Boolean).join(' · ');
      let body = '';
      if (st.step === 1) body = `<h3>Which service?</h3><p class="small muted">Prices are a guide; the clinic confirms the final amount.</p><div class="mt-3">${services().map((x) => `<button class="m-choice ${st.serviceId === x.id ? 'active' : ''}" data-svc="${x.id}"><span class="m-ic" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--pp-action-050);color:var(--pp-action-700)">${PP.icon(x.homeVisit ? 'home' : 'activity', 'style="width:20px"')}</span><span class="grow"><b>${esc(x.name)}</b><span class="s">${x.duration} min · ${esc(x.category)}</span></span><b class="small mono">${PP.fmt.money(x.price)}</b></button>`).join('')}</div>`;
      else if (st.step === 2) body = `<h3>Choose your ${esc(PP.tl('professional'))}</h3><p class="small muted">Or let the clinic pick the first one available.</p><div class="mt-3">
          <button class="m-choice ${st.pro === null ? 'active' : ''}" data-pro=""><span class="avatar">${PP.icon('users', 'style="width:18px"')}</span><span class="grow"><b>Any available ${esc(PP.tl('professional'))}</b><span class="s">Most free times</span></span></button>
          ${bookablePros().map((p) => `<button class="m-choice ${st.pro === p.id ? 'active' : ''}" data-pro="${p.id}">${proAvatar(p.id)}<span class="grow"><b>${esc(PP.proName(p))}</b><span class="s">${esc(p.designation)} · ${esc(PP.branchName(p.branchId))}</span></span></button>`).join('')}</div>`;
      else if (st.step === 3) body = `<h3>Pick a day and time</h3>${M.dayChips(T(), Math.min(max + 1, 21), st.date, closedDay)}<div class="m-card mt-3" data-slots></div>`;
      else body = `<h3>Review your request</h3>
          <div class="m-card mt-3"><dl class="m-kv"><dt>Service</dt><dd>${esc(svc.name)} (${svc.duration} min)</dd><dt>${esc(PP.t('professional'))}</dt><dd>${st.pro ? esc(PP.proName(st.pro)) : 'Any available'}</dd><dt>Preferred time</dt><dd>${PP.fmt.dateLong(st.date)}, ${PP.fmt.time(st.time)}</dd><dt>Patient</dt><dd>${esc(me().name)} · ${esc(me().id)}</dd></dl></div>
          <form class="m-form mt-3" novalidate data-f>${PP.form.field({ name: 'notes', label: 'Reason for visit (optional)', type: 'textarea', value: st.notes, placeholder: 'Describe your concern', attrs: 'maxlength="300"' })}</form>
          <div class="mt-3">${PP.ui.alert('info', 'This sends a <b>request</b>. It reserves no slot until the clinic confirms it after checking the schedule.')}</div>`;
      el.innerHTML = `${steps}${summary ? `<div class="small muted" style="margin:-4px 2px 10px">${summary}</div>` : ''}${body}
        <div class="m-actions">${st.step > 1 ? `<button class="btn" data-prev>${PP.icon('chevL')} Back</button>` : ''}${st.step < 4 ? `<button class="btn btn-primary" data-next>Next ${PP.icon('chevR')}</button>` : `<button class="btn btn-primary" data-submit>${PP.icon('send')} Send request</button>`}</div>`;
      PP.$$('[data-svc]', el).forEach((b) => b.addEventListener('click', () => { st.serviceId = b.dataset.svc; st.time = null; st.step = 2; draw(); }));
      PP.$$('[data-pro]', el).forEach((b) => b.addEventListener('click', () => { st.pro = b.dataset.pro || null; st.time = null; st.step = 3; draw(); }));
      if (st.step === 3) {
        const box = PP.$('[data-slots]', el);
        const drawSlots = () => {
          if (!st.date) { box.innerHTML = `<p class="small muted" style="margin:0">Choose a day above to see free times.</p>`; return; }
          const closure = PP.db.closures.find((c) => c.date === st.date);
          if (closure) { box.innerHTML = PP.ui.alert('warning', `The clinic is closed on ${PP.fmt.date(st.date)} (${esc(closure.reason)}).`); return; }
          if (PP.dow(st.date) === 5) { box.innerHTML = PP.ui.alert('warning', 'The clinic is closed on Fridays.'); return; }
          box.innerHTML = `<div class="label">${PP.fmt.dateLong(st.date)} · ${svc.duration} min</div><div class="mt-2">${slotGrid(slotsFor(st.serviceId, st.pro, st.date), st.time)}</div>`;
          PP.$$('[data-slot]', box).forEach((b) => b.addEventListener('click', () => { st.time = b.dataset.slot; drawSlots(); }));
        };
        PP.$$('[data-day]', el).forEach((b) => b.addEventListener('click', () => { st.date = b.dataset.day; st.time = null; PP.$$('[data-day]', el).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); }); drawSlots(); }));
        drawSlots();
      }
      const prev = PP.$('[data-prev]', el); if (prev) prev.addEventListener('click', () => { if (st.step === 4) st.notes = PP.form.read(PP.$('[data-f]', el)).notes; st.step--; draw(); });
      const next = PP.$('[data-next]', el); if (next) next.addEventListener('click', () => {
        if (st.step === 1 && !st.serviceId) return M.toast('Choose a service.', 'warning');
        if (st.step === 2 && st.pro === undefined) return M.toast(`Choose a ${esc(PP.tl('professional'))} or “Any available”.`, 'warning');
        if (st.step === 3 && (!st.date || !st.time)) return M.toast('Choose a day and a free time.', 'warning');
        st.step++; draw();
      });
      const sub = PP.$('[data-submit]', el); if (sub) sub.addEventListener('click', async () => {
        st.notes = PP.form.read(PP.$('[data-f]', el)).notes;
        await PP.ui.busy(sub, () => {
          const req = M.write(() => {
            // Re-check the slot is still free at the moment of sending (it may have been booked meanwhile).
            const free = slotsFor(st.serviceId, st.pro, st.date).find((x) => x.start === st.time && x.free);
            if (!free) return null;
            const p = me();
            const branchId = st.pro ? PP.find.professional(st.pro).branchId : (p.branchId || 'BR-1');
            const q = { id: PP.nextId('REQ'), name: p.name, mobile: digits(p.mobile), serviceId: st.serviceId, preferredProfessionalId: st.pro || null, date: st.date, time: st.time, notes: st.notes, status: 'Pending', createdAt: PP.nowStamp(), patientId: p.id, branchId, source: 'Patient app', smsConsent: !!(p.consent && p.consent.sms) };
            PP.db.requests.push(q);
            PP.notify('New online appointment request', `${q.name} (patient app) · ${PP.serviceName(q.serviceId)} · ${PP.fmt.date(q.date)} ${PP.fmt.time(q.time)}`, `#/appointments/${q.id}`);
            PP.audit('Online request sent from patient app', q.id, `${p.id} · ${PP.fmt.date(q.date)} ${PP.fmt.time(q.time)}`);
            return q;
          });
          if (!req) { M.toast('That time was just taken. Please pick another.', 'error'); st.step = 3; st.time = null; draw(); return; }
          done(req);
        }, 700);
      });
    };
    const done = (req) => {
      el.innerHTML = `<div class="m-success"><div class="mark">${PP.icon('check')}</div><h2>Request sent</h2>
        <p class="muted">Your request is <b>pending clinic confirmation</b>. You will get an SMS when it is confirmed.</p>
        <div class="m-ref mt-4"><div><span>Request no.</span><b class="mono">${esc(req.id)}</b></div><div><span>Preferred time</span><b>${PP.fmt.dateShort(req.date)}, ${PP.fmt.time(req.time)}</b></div></div>
        <div class="mt-3">${PP.ui.alert('info', 'This time is a preference, not a booking yet. The clinic may call you to agree another time.')}</div>
        <div class="m-actions"><a class="btn" href="#/home">Home</a><a class="btn btn-primary" href="#/appointments?tab=requests">My requests</a></div>
        <p class="m-note mt-4">Prototype tip: open the clinic workspace → Appointments → Online Requests to see it arrive.</p></div>`;
    };
    draw();
  } });

  /* ================================================================== CARE */
  PP.route('/care', { title: 'My care', tab: 'care', render({ el, query }) {
    let tab = query.tab || 'plan';
    el.innerHTML = `${M.seg('c', [['plan', 'Treatment plan'], ['exercises', 'Exercises'], ['rx', 'Prescriptions']], tab)}<div data-body></div>`;
    const box = PP.$('[data-body]', el);
    const draw = () => {
      if (tab === 'plan') {
        const plans = myPlans();
        box.innerHTML = plans.length ? plans.map((sp) => {
          const done = sp.sessions.filter((x) => x.status === 'Completed').length; const pct = Math.round((done / (sp.planned || sp.sessions.length || 1)) * 100);
          return `<div class="m-card"><div class="row between"><b>${esc(sp.title)}</b>${PP.ui.badge(sp.status)}</div><div class="small muted mt-2">${esc(PP.proName(sp.professionalId))} · ${esc(sp.frequency || '')}</div>
            <div class="row between mt-3 small"><span><b>${done}</b> of ${sp.planned} sessions done</span><span class="mono">${pct}%</span></div><div class="m-progress mt-2"><i style="width:${pct}%"></i></div>
            <ul class="m-tl mt-4">${sp.sessions.map((x) => `<li class="${x.status === 'Completed' ? 'done' : ''}"><span class="tm">${PP.fmt.dateShort(x.date)}</span><a class="box" style="border-left-color:${x.status === 'Completed' ? 'var(--pp-positive-fg)' : 'var(--pp-border-strong)'}"><b class="small">Session ${x.no} · ${esc(x.goal)}</b><span class="small muted" style="display:block">${x.status === 'Completed' ? esc(x.note || 'Completed') : 'Planned'}</span></a></li>`).join('')}</ul></div>`;
        }).join('') : M.emptyCard({ icon: 'activity', title: 'No treatment plan yet', text: `Your ${esc(PP.tl('professional'))} adds one after your assessment.` });
      } else if (tab === 'exercises') {
        const ex = myExercises(); const today = doneOn(T());
        const week = []; for (let i = 6; i >= 0; i--) { const d = PP.addDays(T(), -i); const n = doneOn(d).length; week.push(`<span><i class="${n ? 'on' : ''} ${i === 0 ? 'today' : ''}" title="${PP.fmt.date(d)}: ${n} done"></i>${PP.DAYS[PP.dow(d)].slice(0, 2)}</span>`); }
        box.innerHTML = ex.length ? `<div class="m-card"><div class="row between"><b>This week</b><span class="small muted">${today.filter((id) => ex.some((x) => x.exerciseId === id)).length}/${ex.length} today</span></div><div class="m-week mt-3">${week.join('')}</div></div>
          ${M.sec('Today’s exercises')}<div class="m-list">${ex.map((x) => { const on = today.includes(x.exerciseId); return `<div class="m-item"><span class="m-ic m-ic-anim">${PP.exerciseMedia ? PP.exerciseMedia(x.ex) : PP.icon('body')}</span><a class="grow" href="#/care/exercises/${esc(x.exerciseId)}" style="color:inherit;text-decoration:none"><span class="t">${esc(x.ex.name)}</span><span class="s">${x.sets} × ${x.reps} · ${esc(x.frequency || 'Daily')} · ${esc(x.ex.area)}</span></a><button class="btn btn-sm ${on ? 'btn-primary' : ''}" data-done="${esc(x.exerciseId)}" aria-pressed="${on}">${PP.icon(on ? 'checkCircle' : 'check')} ${on ? 'Done' : 'Mark done'}</button></div>`; }).join('')}</div>
          <p class="m-note mt-3">Your ticks are shared with your ${esc(PP.tl('professional'))} so they can follow your progress.</p>`
          : M.emptyCard({ icon: 'dumbbell', title: 'No exercises assigned', text: `Your ${esc(PP.tl('professional'))} assigns exercises with a prescription.` });
        PP.$$('[data-done]', box).forEach((b) => b.addEventListener('click', () => { toggleDone(b.dataset.done); draw(); }));
      } else {
        const list = myRx();
        box.innerHTML = list.length ? `<div class="m-list">${list.map((r) => M.item({ href: `#/care/prescriptions/${r.id}`, icon: 'rx', t: esc(r.condition || 'Prescription'), s: `<span class="mono">${esc(r.id)}</span> · ${PP.fmt.date(r.date)} · ${esc(PP.proName(r.professionalId))}${r.version > 1 ? ` · v${r.version}` : ''}` })).join('')}</div>`
          : M.emptyCard({ icon: 'rx', title: 'No prescriptions yet', text: 'Issued prescriptions appear here. Drafts are not shown until your ' + esc(PP.tl('professional')) + ' issues them.' });
      }
    };
    M.bindSeg(el, 'c', (v) => { tab = v; history.replaceState(null, '', '#/care?tab=' + v); draw(); });
    draw();
  } });

  function toggleDone(exId) {
    let on = false;
    M.write(() => {
      const p = me(); p.exerciseLog = p.exerciseLog || {}; const arr = p.exerciseLog[T()] = p.exerciseLog[T()] || [];
      const i = arr.indexOf(exId); if (i >= 0) arr.splice(i, 1); else { arr.push(exId); on = true; }
    });
    const ex = PP.find.exercise(exId);
    M.toast(on ? `${esc(ex ? ex.name : exId)} marked done for today.` : 'Tick removed.', on ? 'positive' : 'info');
  }

  PP.route('/care/exercises/:id', { title: 'Exercise', tab: 'care', back: '#/care?tab=exercises', render({ el, params }) {
    const x = myExercises().find((e) => e.exerciseId === params.id);
    if (!x) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Exercise not assigned', action: '<a class="btn" href="#/care?tab=exercises">Back</a>' }); return; }
    const on = doneOn(T()).includes(x.exerciseId);
    el.innerHTML = `<div class="m-media m-media-anim">${PP.exerciseMedia ? PP.exerciseMedia(x.ex) : PP.icon('body')}</div>
      <div class="m-card mt-3"><div class="row between"><h3 style="font-size:18px">${esc(x.ex.name)}</h3><span class="badge neutral">${esc(x.ex.area)}</span></div>
        <div class="m-stats mt-3"><div class="m-stat"><b class="mono">${x.sets}</b><span>Sets</span></div><div class="m-stat"><b class="mono">${x.reps}</b><span>Reps</span></div><div class="m-stat"><b style="font-size:14px;margin-top:4px">${esc(x.frequency || 'Daily')}</b><span>How often</span></div></div>
        <h3 class="mt-4">How to do it</h3><p style="margin:6px 0 0">${esc(x.ex.instructions)}</p>
        <div class="mt-3">${PP.ui.alert('warning', 'Stop and contact the clinic if the pain becomes sharp or keeps getting worse.')}</div></div>
      <button class="btn ${on ? '' : 'btn-primary'} m-btn-block mt-4" data-done>${PP.icon('checkCircle')} ${on ? 'Done today · tap to undo' : 'Mark done today'}</button>
      <p class="m-note mt-3">From prescription <a href="#/care/prescriptions/${esc(x.rxId)}">${esc(x.rxId)}</a>.</p>`;
    PP.$('[data-done]', el).addEventListener('click', () => { toggleDone(x.exerciseId); PP.render(); });
  } });

  const rxDoc = (r) => {
    const s = PP.db.settings; const pro = PP.find.professional(r.professionalId); const p = PP.find.patient(r.patientId);
    return `<div class="m-doc"><div class="doc-head"><div><h3>${esc(s.clinicName)}</h3><div class="small muted">${esc(s.prescriptionHeader || '')}</div><div class="small muted">${esc(s.address)} · ${esc(s.phone)}</div></div><div class="small right"><b class="mono">${esc(r.id)}</b><br>${PP.fmt.date(r.date)}${r.version > 1 ? `<br>Version ${r.version}` : ''}</div></div>
      <dl class="m-kv"><dt>Patient</dt><dd>${esc(p.name)} · ${esc(p.id)}</dd><dt>Age / gender</dt><dd>${esc(PP.fmt.age(p.dob))} · ${esc(p.gender || '—')}</dd><dt>Condition</dt><dd>${esc(r.condition || '—')}</dd><dt>Assessment</dt><dd>${esc(r.assessment || '—')}</dd><dt>Plan</dt><dd>${esc(r.plan || '—')}</dd><dt>Frequency</dt><dd>${esc(r.frequency || '—')}</dd><dt>Follow-up</dt><dd>${r.followUp ? PP.fmt.date(r.followUp) : '—'}</dd></dl>
      <table><thead><tr><th>Exercise</th><th>Sets × reps</th><th>How often</th></tr></thead><tbody>${(r.items || []).map((it) => { const e = PP.find.exercise(it.exerciseId); return `<tr><td><b>${esc(e ? e.name : it.exerciseId)}</b>${e ? `<div class="small muted">${esc(e.instructions)}</div>` : ''}</td><td class="mono">${it.sets} × ${it.reps}</td><td>${esc(it.frequency || 'Daily')}</td></tr>`; }).join('')}</tbody></table>
      ${(r.medications || []).length ? `<h3 class="mt-3" style="font-size:14px">Medication</h3><ul class="small">${r.medications.map((m) => `<li>${esc(typeof m === 'string' ? m : [m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : ''}
      <div class="sig"><div>${esc(PP.proName(pro))}<br><span class="muted">${esc(pro ? pro.designation : '')}${pro && pro.registrationNo && pro.registrationNo !== '—' ? ' · Reg. ' + esc(pro.registrationNo) : ''}</span></div></div></div>`;
  };
  const ownRx = (id) => { const r = PP.find.prescription(id); return r && r.patientId === S.patientId && r.status === 'Issued' ? r : null; };
  PP.route('/care/prescriptions/:id', { title: 'Prescription', tab: 'care', back: '#/care?tab=rx', render({ el, params }) {
    const r = ownRx(params.id);
    if (!r) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Prescription not found', action: '<a class="btn" href="#/care?tab=rx">Back</a>' }); return; }
    el.innerHTML = `${rxDoc(r)}<div class="m-actions"><a class="btn btn-primary" href="#/care/prescriptions/${esc(r.id)}/print">${PP.icon('download')} PDF / print view</a></div>
      ${r.versions && r.versions.length ? `<p class="m-note mt-3">This prescription was revised. Earlier versions are kept by the clinic.</p>` : ''}`;
  } });
  PP.route('/care/prescriptions/:id/print', { title: 'Print prescription', tab: 'care', back: (p) => `#/care/prescriptions/${p.id}`, tabs: false, render({ el, params }) {
    const r = ownRx(params.id);
    if (!r) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Prescription not found' }); return; }
    el.innerHTML = `<div class="no-print">${PP.ui.alert('info', 'Use <b>Print</b> and choose “Save as PDF” to download. In the real app this is a generated PDF.')}<div class="m-actions"><button class="btn btn-primary" data-print>${PP.icon('printer')} Print / Save as PDF</button></div><div class="mt-3"></div></div>${rxDoc(r)}
      <p class="small muted mt-3">Generated ${PP.fmt.stamp(PP.nowStamp())} from the Physio Point patient app (prototype, fictional data).</p>`;
    PP.$('[data-print]', el).addEventListener('click', () => { M.write(() => PP.audit('Prescription printed by patient', r.id, 'Patient app')); window.print(); });
  } });

  /* ================================================================== BILLING */
  PP.route('/billing', { title: 'Billing', tab: 'billing', render({ el, query }) {
    let tab = query.tab || 'invoices'; const due = totalDue();
    el.innerHTML = `<div class="m-card ${due > 0 ? 'warn' : 'teal'}"><div class="small muted" style="font-weight:700">Outstanding dues</div><div class="m-money mono ${due > 0 ? 'm-dues' : ''}">${PP.fmt.money(due)}</div>
        ${due > 0 ? `<div class="m-actions"><button class="btn btn-primary" data-pay>${PP.icon('wallet')} Pay now</button></div>` : '<div class="small muted">Nothing to pay. Thank you!</div>'}</div><div class="mt-3"></div>
      ${M.seg('b', [['invoices', 'Invoices'], ['payments', 'Payments'], ['packages', 'Packages']], tab)}<div data-body></div>`;
    const box = PP.$('[data-body]', el);
    const draw = () => {
      if (tab === 'invoices') {
        const list = myInvoices();
        box.innerHTML = list.length ? `<div class="m-list">${list.map((i) => { const t = PP.bill.totals(i); return M.item({ href: `#/billing/invoices/${i.id}`, icon: 'receipt', t: `<span class="mono">${esc(i.id)}</span>`, s: `${PP.fmt.date(i.date)} · ${esc(i.lines.map((l) => l.description).join(', '))}<br>${PP.fmt.money(t.payable)}${t.due > 0 ? ` · <b class="m-dues">due ${PP.fmt.money(t.due)}</b>` : ''}`, right: PP.ui.badge(t.status) }); }).join('')}</div>` : M.emptyCard({ icon: 'receipt', title: 'No invoices yet' });
      } else if (tab === 'payments') {
        const list = myPayments();
        box.innerHTML = list.length ? `<div class="m-list">${list.map((x) => M.item({ href: `#/billing/invoices/${x.invoiceId}`, icon: x.type === 'refund' ? 'refresh' : 'banknote', t: `${x.type === 'refund' ? 'Refund' : 'Payment'} · ${PP.fmt.money(x.amount)}`, s: `${PP.fmt.date(x.date)} · ${esc(x.method)} · <span class="mono">${esc(x.invoiceId)}</span>`, right: PP.ui.badge(x.status) })).join('')}</div>
          <p class="m-note mt-3">Pending mobile payments count only after they are confirmed.</p>` : M.emptyCard({ icon: 'banknote', title: 'No payments yet' });
      } else {
        const list = myPackages();
        box.innerHTML = list.length ? list.map((k) => { const left = k.sessionsTotal - k.sessionsUsed; const pct = Math.round((k.sessionsUsed / k.sessionsTotal) * 100); const days = PP.diffDays(T(), k.expires); const st = days < 0 ? 'Expired' : k.status;
          return `<div class="m-card"><div class="row between"><b>${esc(PP.serviceName(k.serviceId))}</b>${PP.ui.badge(st)}</div>
            <div class="m-stats mt-3"><div class="m-stat tone-positive"><b class="mono">${left}</b><span>Sessions left</span></div><div class="m-stat"><b class="mono">${k.sessionsUsed}</b><span>Used</span></div><div class="m-stat ${days <= 14 ? 'tone-warning' : ''}"><b class="mono">${Math.max(0, days)}</b><span>Days left</span></div></div>
            <div class="m-progress mt-3"><i style="width:${pct}%"></i></div><div class="small muted mt-2">Started ${PP.fmt.date(k.start)} · expires ${PP.fmt.date(k.expires)}${k.invoiceId ? ` · <a href="#/billing/invoices/${esc(k.invoiceId)}">${esc(k.invoiceId)}</a>` : ''}</div></div>`; }).join('')
          : M.emptyCard({ icon: 'layers', title: 'No packages', text: 'Ask the clinic about session packages.' });
      }
    };
    M.bindSeg(el, 'b', (v) => { tab = v; history.replaceState(null, '', '#/billing?tab=' + v); draw(); });
    const pay = PP.$('[data-pay]', el); if (pay) pay.addEventListener('click', () => paySheet(due, null));
    draw();
  } });

  function paySheet(amount, invoiceId) {
    let method = 'bKash';
    const s = M.sheet({ title: 'Pay online',
      body: `<div class="m-card teal"><div class="small muted" style="font-weight:700">Amount</div><div class="m-money mono">${PP.fmt.money(amount)}</div><div class="small muted">${invoiceId ? 'Invoice ' + esc(invoiceId) : 'All outstanding dues'}</div></div>
        <div class="label mt-3">Pay with</div><div class="m-chips mt-2" data-m>${['bKash', 'Nagad', 'Card'].map((x) => `<button type="button" class="m-chip ${x === method ? 'active' : ''}" data-v="${x}">${x}</button>`).join('')}</div>
        <div data-out class="mt-3"></div>`,
      buttons: [{ label: 'Close', kind: 'ghost' }, { label: 'Continue to payment', kind: 'primary', onClick: async ({ body, btn }) => {
        await PP.sleep(800);
        PP.$('[data-out]', body).innerHTML = PP.ui.alert('warning', `<b>Simulated payment gateway.</b> Online payment is not connected yet: the payment method is a pending decision (<b>PD-013</b>). <b>No payment was recorded</b> and your dues are unchanged.<br>Please pay at the clinic front desk (cash, ${esc(method)}, card).`);
        btn.style.display = 'none';
        return false;
      } }],
    });
    PP.$$('[data-m] button', s.body).forEach((b) => b.addEventListener('click', () => { method = b.dataset.v; PP.$$('[data-m] button', s.body).forEach((x) => x.classList.toggle('active', x === b)); }));
  }

  PP.route('/billing/invoices/:id', { title: 'Invoice', tab: 'billing', back: '#/billing', render({ el, params }) {
    const inv = PP.find.invoice(params.id);
    if (!inv || inv.patientId !== S.patientId) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Invoice not found', action: '<a class="btn" href="#/billing">Back</a>' }); return; }
    const t = PP.bill.totals(inv); const pays = PP.db.payments.filter((x) => x.invoiceId === inv.id);
    el.innerHTML = `<div class="m-doc"><div class="doc-head"><div><h3>${esc(PP.db.settings.clinicName)}</h3><div class="small muted">${esc(PP.branchName(inv.branchId))}</div></div><div class="small right"><b class="mono">${esc(inv.id)}</b><br>${PP.fmt.date(inv.date)}<br>${PP.ui.badge(t.status)}</div></div>
        <div class="small muted">${esc(PP.t('professional'))}: ${esc(PP.proName(inv.professionalId))}</div>
        <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead><tbody>${inv.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="right mono">${l.qty}</td><td class="right mono">${PP.fmt.money(PP.bill.lineTotal(l))}</td></tr>`).join('')}</tbody></table>
        <dl class="m-kv mt-3"><dt>Total</dt><dd class="right mono">${PP.fmt.money(t.gross)}</dd>${t.discount ? `<dt>Discount</dt><dd class="right mono">−${PP.fmt.money(t.discount)}</dd>` : ''}<dt>Payable</dt><dd class="right mono"><b>${PP.fmt.money(t.payable)}</b></dd><dt>Paid</dt><dd class="right mono">${PP.fmt.money(t.paid)}</dd>${t.refunded ? `<dt>Refunded</dt><dd class="right mono">${PP.fmt.money(t.refunded)}</dd>` : ''}<dt>Due</dt><dd class="right mono ${t.due > 0 ? 'm-dues' : ''}"><b>${PP.fmt.money(t.due)}</b></dd></dl>
        ${PP.db.settings.invoiceFooter ? `<p class="small muted mt-3" style="text-align:center">${esc(PP.db.settings.invoiceFooter)}</p>` : ''}</div>
      ${t.due > 0 ? `<button class="btn btn-primary m-btn-block mt-3" data-pay>${PP.icon('wallet')} Pay ${PP.fmt.money(t.due)} now</button>` : ''}
      ${M.sec('Payment history')}${pays.length ? `<div class="m-list">${pays.map((x) => M.item({ icon: x.type === 'refund' ? 'refresh' : 'banknote', t: `${x.type === 'refund' ? 'Refund' : 'Payment'} · ${PP.fmt.money(x.amount)}`, s: `${PP.fmt.date(x.date)} · ${esc(x.method)}`, right: PP.ui.badge(x.status) })).join('')}</div>` : M.emptyCard({ icon: 'banknote', title: 'No payments on this invoice' })}`;
    const pay = PP.$('[data-pay]', el); if (pay) pay.addEventListener('click', () => paySheet(t.due, inv.id));
  } });

  /* ================================================================== FEEDBACK */
  PP.route('/feedback', { title: 'Rate a visit', tab: 'more', back: '#/more', render({ el }) {
    const done = past().filter((a) => a.status === 'Completed' && !rated(a.id)).slice(0, 5); // the five most recent unrated visits
    const mine = feedbackList().filter((f) => f.patientId === S.patientId);
    el.innerHTML = `${M.sec('Visits to rate')}${done.length ? `<div class="m-list">${done.map((a) => M.item({ href: `#/feedback/${a.id}`, avatar: proAvatar(a.professionalId), t: esc(PP.serviceName(a.serviceId)), s: `${PP.fmt.date(a.date)} · ${esc(PP.proName(a.professionalId))}` })).join('')}</div>` : M.emptyCard({ icon: 'star', title: 'Nothing to rate', text: 'Completed visits appear here.' })}
      ${M.sec('Your feedback')}${mine.length ? `<div class="m-list">${mine.map((f) => M.item({ icon: 'star', t: `${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}`, s: `${PP.fmt.date(f.date)} · ${esc(PP.proName(f.professionalId))}${f.comment ? '<br>' + esc(f.comment) : ''}` })).join('')}</div>` : M.emptyCard({ icon: 'heart', title: 'No feedback given yet' })}`;
  } });
  PP.route('/feedback/:id', { sync: false, title: 'Rate your visit', tab: 'more', back: '#/feedback', render({ el, params }) {
    const a = PP.find.appointment(params.id);
    if (!a || a.patientId !== S.patientId || a.status !== 'Completed') { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'This visit cannot be rated', text: 'Only your completed visits can be rated.', action: '<a class="btn" href="#/feedback">Back</a>' }); return; }
    if (rated(a.id)) { el.innerHTML = `<div class="m-success"><div class="mark">${PP.icon('heart')}</div><h2>Thanks!</h2><p class="muted">You already rated this visit.</p><a class="btn" href="#/home">Home</a></div>`; return; }
    let rating = 0;
    el.innerHTML = `<div class="m-card" style="text-align:center"><div class="row" style="justify-content:center">${proAvatar(a.professionalId)}</div><b class="mt-2" style="display:block">${esc(PP.proName(a.professionalId))}</b><div class="small muted">${esc(PP.serviceName(a.serviceId))} · ${PP.fmt.date(a.date)}</div>
        <div class="m-stars" data-stars role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}">${PP.icon('star')}</button>`).join('')}</div><div class="small muted" data-word>Tap a star</div></div>
      <form class="m-form mt-3" novalidate data-f>
        <div class="m-list">${M.item({ icon: 'clock', t: 'Started on time', right: M.switchHtml('onTime', true, 'Started on time') })}${M.item({ icon: 'heart', t: 'Would recommend the clinic', right: M.switchHtml('recommend', true, 'Would recommend') })}</div>
        ${PP.form.field({ name: 'comment', label: 'Anything to add? (optional)', type: 'textarea', attrs: 'maxlength="400"' })}
        <div class="small" style="color:var(--pp-error-fg);font-weight:600" data-err role="alert"></div>
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('send')} Send feedback</button></form>`;
    const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    const paint = () => { PP.$$('[data-n]', el).forEach((b) => { const on = Number(b.dataset.n) <= rating; b.classList.toggle('on', on); b.setAttribute('aria-checked', Number(b.dataset.n) === rating); }); PP.$('[data-word]', el).textContent = rating ? words[rating] : 'Tap a star'; };
    PP.$$('[data-n]', el).forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.n); PP.$('[data-err]', el).textContent = ''; paint(); }));
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!rating) { PP.$('[data-err]', el).textContent = 'Please choose a star rating.'; return; }
      const d = PP.form.read(f);
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        M.write(() => {
          PP.db.feedback = PP.db.feedback || [];
          PP.db.feedback.unshift({ id: PP.nextId('FB'), patientId: S.patientId, appointmentId: a.id, professionalId: a.professionalId, branchId: a.branchId, serviceId: a.serviceId, rating, onTime: !!d.onTime, recommend: !!d.recommend, comment: d.comment, date: T(), at: PP.nowStamp(), source: 'Patient app' });
          PP.notify('New patient feedback', `${me().name} rated ${PP.proName(a.professionalId)} ${rating}/5`, '#/feedback');
        });
        el.innerHTML = `<div class="m-success"><div class="mark">${PP.icon('heart')}</div><h2>Thank you!</h2><p class="muted">Your feedback helps ${esc(PP.db.settings.clinicName)} improve.</p><div class="m-actions"><a class="btn" href="#/feedback">Rate another visit</a><a class="btn btn-primary" href="#/home">Home</a></div></div>`;
      });
    });
  } });

  /* ================================================================== MORE */
  PP.route('/more', { title: 'More', tab: 'more', render({ el }) {
    const p = me(); const fam = family();
    el.innerHTML = `<div class="m-card"><div class="row" style="flex-wrap:nowrap"><span class="avatar lg">${esc(PP.initials(p.name))}</span><div style="min-width:0"><b style="font-size:16px">${esc(p.name)}</b><div class="small muted mono">${esc(p.id)} · ${esc(p.mobile)}</div></div></div></div>
      ${M.sec('My account')}<div class="m-list">
        ${M.item({ href: '#/profile', icon: 'user', t: 'My profile', s: 'Personal and contact details' })}
        ${M.item({ href: '#/family', icon: 'users', t: 'Family members', s: fam.length ? `${fam.length} linked` : 'None linked' })}
        ${M.item({ href: '#/preferences', icon: 'bell', t: 'Notification preferences', s: 'SMS and WhatsApp' })}
        ${M.item({ href: '#/notifications', icon: 'mail', t: 'Notifications', right: unread() ? `<span class="count-pill">${unread()}</span>` : '' })}
        ${M.item({ href: '#/feedback', icon: 'star', t: 'Rate a visit' })}</div>
      ${M.sec('Clinic')}<div class="m-list">
        ${M.item({ icon: 'building', t: esc(PP.db.settings.clinicName), s: `${esc(PP.db.settings.address)}<br>${esc(PP.db.settings.phone)} · server ${esc(S.clinic.domain)}` })}
        ${M.item({ icon: 'shield', t: 'Privacy and consent', s: `Accepted ${PP.fmt.stamp(S.consents[p.id])}` })}
        <button class="m-item" data-switch><span class="m-ic">${PP.icon('globe')}</span><span class="grow"><span class="t">Use another clinic</span><span class="s">Find a different clinic by code</span></span></button></div>
      <button class="btn btn-danger m-btn-block mt-4" data-out>${PP.icon('logout')} Sign out</button>
      <p class="m-note mt-3" style="text-align:center">Physio Point patient app · prototype · fictional data only</p>`;
    PP.$('[data-out]', el).addEventListener('click', async () => {
      if (!(await M.confirm({ title: 'Sign out?', message: 'You will need a new SMS code to sign in again.', confirmLabel: 'Sign out' }))) return;
      S.patientId = null; S.save(); M.toast('Signed out.', 'info'); location.hash = '#/signin';
    });
    PP.$('[data-switch]', el).addEventListener('click', async () => {
      if (!(await M.confirm({ title: 'Use another clinic?', message: 'You will be signed out of this clinic on this phone.', confirmLabel: 'Continue' }))) return;
      S.patientId = null; S.clinic = null; S.save(); location.hash = '#/clinic';
    });
  } });

  PP.route('/profile', { title: 'My profile', tab: 'more', back: '#/more', render({ el }) {
    const p = me();
    el.innerHTML = `<div class="m-card"><dl class="m-kv"><dt>Patient ID</dt><dd class="mono">${esc(p.id)}</dd><dt>Name</dt><dd>${esc(p.name)}</dd><dt>Gender</dt><dd>${esc(p.gender || '—')}</dd><dt>Date of birth</dt><dd>${p.dob ? PP.fmt.date(p.dob) + ' (' + PP.fmt.age(p.dob) + ')' : '—'}</dd><dt>Blood group</dt><dd>${esc(p.bloodGroup || '—')}</dd>
        <dt>Mobile</dt><dd>${esc(p.mobile)}</dd><dt>Email</dt><dd>${esc(p.email || '—')}</dd><dt>Address</dt><dd>${esc(p.address || '—')}</dd><dt>Emergency</dt><dd>${esc(p.emergencyContact || '—')}</dd>
        <dt>${esc(PP.t('professional'))}</dt><dd>${esc(PP.proName(p.assignedProfessionalId))}</dd><dt>Allergies</dt><dd>${esc(p.allergies || '—')}</dd></dl></div>
      <button class="btn btn-primary m-btn-block mt-3" data-edit>${PP.icon('edit')} Edit contact details</button>
      <p class="m-note mt-3">Name, date of birth, mobile number and medical details are changed by the clinic, to keep your record accurate. Ask the front desk.</p>`;
    PP.$('[data-edit]', el).addEventListener('click', () => {
      M.sheet({ title: 'Edit contact details',
        body: `<form class="m-form" novalidate>${PP.form.field({ name: 'email', label: 'Email', type: 'email', rule: 'email', value: p.email })}${PP.form.field({ name: 'address', label: 'Address', required: true, value: p.address })}${PP.form.field({ name: 'emergencyContact', label: 'Emergency contact (name · mobile)', value: p.emergencyContact })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: async ({ body }) => {
          const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const d = PP.form.read(f);
          await PP.sleep(400);
          M.write(() => { const x = me(); const changed = ['email', 'address', 'emergencyContact'].filter((k) => (x[k] || '') !== d[k]); Object.assign(x, d); PP.audit('Patient updated own contact details', x.id, `Patient app · ${changed.join(', ') || 'no change'}`); });
          M.toast('Contact details saved.'); PP.render();
        } }] });
    });
  } });

  PP.route('/family', { title: 'Family members', tab: 'more', back: '#/more', render({ el }) {
    const fam = family();
    el.innerHTML = `${PP.ui.alert('info', 'Family members are linked by the clinic. People who share your mobile number can be opened from this app.')}
      ${fam.length ? `<div class="m-list mt-3">${fam.map((x) => `<div class="m-item"><span class="avatar">${esc(PP.initials(x.name))}</span><span class="grow"><span class="t">${esc(x.name)}</span><span class="s">${esc(x.id)} · ${esc(PP.fmt.age(x.dob))}${sameMobile(x) ? ' · same mobile' : ''}</span></span>${sameMobile(x) ? `<button class="btn btn-sm btn-primary" data-sw="${esc(x.id)}">Switch</button>` : '<span class="small muted">Own login</span>'}</div>`).join('')}</div>`
        : `<div class="mt-3">${M.emptyCard({ icon: 'users', title: 'No family members linked', text: 'Ask the front desk to link family members to your record.' })}</div>`}`;
    PP.$$('[data-sw]', el).forEach((b) => b.addEventListener('click', () => {
      const x = PP.find.patient(b.dataset.sw); S.patientId = x.id; S.save();
      M.write(() => PP.audit('Patient app profile switched', x.id, 'Same mobile number (family)'));
      M.toast(`Now viewing ${esc(x.name)}’s records.`, 'info'); location.hash = S.consents[x.id] ? '#/home' : '#/consent';
    }));
  } });

  PP.route('/preferences', { title: 'Notification preferences', tab: 'more', back: '#/more', render({ el }) {
    const p = me(); const c = p.consent || {}; const ch = (id) => (PP.db.notificationChannels || []).find((x) => x.id === id) || {};
    el.innerHTML = `<form class="m-form" novalidate data-f><div class="m-list">
        ${M.item({ icon: 'phone', t: 'SMS', s: 'Appointment confirmations and reminders', right: M.switchHtml('sms', !!c.sms, 'SMS') })}
        ${M.item({ icon: 'send', t: 'WhatsApp', s: ch('whatsapp').enabled ? 'Reminders and messages' : 'The clinic has not switched WhatsApp on yet; your choice is kept for later.', right: M.switchHtml('whatsapp', !!c.whatsapp, 'WhatsApp') })}
        ${M.item({ icon: 'bell', t: 'In-app notifications', s: 'Always on while you use the app' })}</div>
        <p class="m-note">You can opt out at any time. Important messages about a change the clinic makes to your appointment may still be sent by SMS.${c.updatedAt ? ` Last changed ${PP.fmt.stamp(c.updatedAt)}.` : ''}</p>
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('check')} Save preferences</button></form>`;
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = PP.form.read(f);
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        M.write(() => { const x = me(); x.consent = Object.assign({ sms: false, whatsapp: false }, x.consent, { sms: !!d.sms, whatsapp: !!d.whatsapp, updatedAt: PP.nowStamp(), updatedBy: 'Patient app' }); PP.audit('Notification consent changed', x.id, `Patient app · SMS ${d.sms ? 'opt-in' : 'opt-out'} · WhatsApp ${d.whatsapp ? 'opt-in' : 'opt-out'}`); });
        M.toast('Preferences saved.'); PP.render();
      });
    });
  } });

  PP.route('/notifications', { title: 'Notifications', tab: 'more', back: '#/more', render({ el }) {
    const list = inbox();
    el.innerHTML = list.length ? `<div class="row between" style="margin:0 2px 8px"><span class="small muted">${unread()} unread</span><button class="btn btn-ghost btn-sm" data-all>Mark all read</button></div>
      <div class="m-list">${list.map((n) => M.item({ href: n.href, icon: n.icon, t: esc(n.t), s: `${esc(n.s)}<br>${PP.fmt.stamp(n.at)}`, cls: S.readNtf.includes(n.id) ? '' : 'unread', attrs: `data-n="${esc(n.id)}"` })).join('')}</div>` : M.emptyCard({ icon: 'bell', title: 'No notifications', text: 'Confirmations, reminders and receipts appear here.' });
    PP.$$('[data-n]', el).forEach((a) => a.addEventListener('click', () => { if (!S.readNtf.includes(a.dataset.n)) { S.readNtf.push(a.dataset.n); S.save(); } }));
    const all = PP.$('[data-all]', el); if (all) all.addEventListener('click', () => { S.readNtf = Array.from(new Set(S.readNtf.concat(list.map((n) => n.id)))); S.save(); PP.render(); M.refreshTabs(); });
  } });

  /* ------------------------------------------------------------------ start */
  const side = () => `<h2>Patient app</h2><p>Prototype of the patient mobile app (scope pending PD-010). It uses the same fictional clinic data as the clinic workspace in this browser.</p>
    <div class="card"><b>Try this</b><ul><li>Clinic code <b class="mono">PHYSIOPOINT</b></li><li>Mobile <b class="mono">01923456789</b>, any 6-digit code, pick Nusrat Jahan</li><li>Book an appointment, then open <a href="../customer-web/app.html#/appointments/requests" target="_blank" rel="noopener">Online Requests</a> in the clinic workspace</li><li>Mark exercises done, rate a visit, try “Pay now”</li></ul></div>
    <div class="card"><b>Rules shown</b><ul><li>Bookings are Pending requests; only the clinic confirms.</li><li>Cancel / reschedule create requests; confirmed appointments are not changed by the patient.</li><li>Online payment is pending PD-013: nothing is recorded.</li></ul></div>
    <div class="card"><a href="../index.html">Prototype hub</a> · <a href="../professional-app/index.html">${esc(PP.t('professional'))} app</a></div>`;
  M.boot({
    appName: 'Patient app', home: '#/home', guard, brand, side,
    topRight: (r) => (r && r.tab ? `<a class="m-iconbtn" href="#/notifications" aria-label="Notifications">${PP.icon('bell')}${unread() ? `<span class="dot">${unread()}</span>` : ''}</a>` : ''),
    tabs: [
      { id: 'home', label: 'Home', icon: 'home', href: '#/home' },
      { id: 'appts', label: 'Visits', icon: 'calendar', href: '#/appointments', badge: () => pendingRequests().length },
      { id: 'care', label: 'My care', icon: 'activity', href: '#/care' },
      { id: 'billing', label: 'Billing', icon: 'wallet', href: '#/billing', badge: () => (totalDue() > 0 ? '!' : 0) },
      { id: 'more', label: 'More', icon: 'menu', href: '#/more' },
    ],
  });
})();
