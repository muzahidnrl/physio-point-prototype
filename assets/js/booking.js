/* Public appointment request page — blueprint screens 01 (request) and 02 (confirmation) + Reference C.
   No patient login. A submission creates a PENDING request; it reserves no slot until the clinic confirms it. */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  PP.load(); PP.applyBranding();
  const s = PP.db.settings;
  const root = PP.$('#page');
  const state = { form: {}, time: null };
  const services = () => PP.db.services.filter((x) => x.status === 'Active' && !x.isPackage);
  const pros = () => PP.db.professionals.filter((p) => { const t = PP.db.professionalTypes.find((x) => x.id === p.typeId); return p.status === 'Active' && (!t || t.canBeBooked); });

  const brand = `<aside class="auth-brand">
      <div class="brand"><div class="logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : PP.logoSvg}</div><div><div class="name">${esc(s.clinicName)}</div><div class="tag">${esc(s.tagline)}</div></div></div>
      <div><h2>Book your visit in a minute</h2><p class="mt-2">No account needed. Our team reviews your request and confirms it by SMS.</p></div>
      <ul><li>${PP.icon('checkCircle')} Book an appointment</li><li>${PP.icon('checkCircle')} Choose your ${esc(PP.tl('professional'))}</li><li>${PP.icon('checkCircle')} Select a preferred time</li><li>${PP.icon('checkCircle')} Quick and easy request</li></ul>
      <div class="auth-art" aria-hidden="true"><svg viewBox="0 0 360 200" fill="none" stroke="#9fd8d3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M40 150h280M60 150v34M300 150v34M70 138h200"/><path d="M90 138c6-22 26-30 52-26l60 8"/><circle cx="96" cy="112" r="14"/><circle cx="250" cy="52" r="14"/><path d="M250 66v40l-40 22M250 106l30 30"/><path d="M262 82l34-12"/></svg></div>
      <div class="small" style="color:#8fbcc1">${esc(s.address)} · ${esc(s.phone)}</div>
    </aside>`;

  function renderForm() {
    const f = state.form;
    root.innerHTML = `<div class="auth-page">${brand}<main class="auth-main"><div class="auth-card">
      <h1>Request an Appointment</h1><p class="lead">Fill in the form below. Our team will review and confirm your booking.</p>
      ${s.booking && s.booking.publicEnabled === false ? PP.ui.alert('warning', 'Online booking is temporarily unavailable. Please call us.') : ''}
      <form class="form-grid" novalidate data-form>
        ${PP.form.field({ name: 'name', label: 'Full name', required: true, value: f.name, placeholder: 'e.g. Imran Ahmed', attrs: 'autocomplete="name"' })}
        ${PP.form.field({ name: 'mobile', label: 'Mobile number', required: true, rule: 'mobile', value: f.mobile, placeholder: '01XXXXXXXXX', attrs: 'inputmode="tel" autocomplete="tel"' })}
        ${PP.form.field({ name: 'serviceId', label: 'Service', type: 'select', required: true, value: f.serviceId, options: services().map((x) => [x.id, x.name]) })}
        ${PP.form.field({ name: 'pro', label: `Preferred ${PP.tl('professional')}`, type: 'select', value: f.pro || '', placeholder: 'Any available', options: pros().map((p) => [p.id, PP.proName(p)]) })}
        ${PP.form.field({ name: 'date', label: 'Preferred date', type: 'date', required: true, value: f.date || '', min: PP.today(), max: PP.addDays(PP.today(), (s.booking && s.booking.maxDaysAhead) || 30) })}
        <div class="field" data-field="time"><label for="pick">Preferred time<span class="req">*</span></label><button type="button" class="btn pick-time" id="pick">${PP.icon('clock')} <span data-timelabel>${state.time ? PP.fmt.time(state.time) : 'Select time'}</span></button><div class="error">Please choose a time.</div></div>
        ${PP.form.field({ name: 'notes', label: 'Reason for visit (optional)', type: 'textarea', full: true, value: f.notes, placeholder: 'Describe your concern', attrs: 'maxlength="300"' })}
        <div class="full">${PP.form.field({ name: 'consent', type: 'checkbox', label: 'Send me SMS about this appointment', value: f.consent !== false, hint: 'We only use your number for this booking and reminders.' })}</div>
        <div class="full" data-msg></div>
        <div class="full row between"><span class="form-note">* Required fields · Your request is reviewed before confirmation.</span><button class="btn btn-primary" type="submit" data-submit>${PP.icon('send')} Submit request</button></div>
      </form></div></main></div>`;
    const form = PP.$('[data-form]', root);
    form.addEventListener('change', () => { state.form = PP.form.read(form); });
    PP.$('[name=date]', form).addEventListener('change', () => { state.time = null; PP.$('[data-timelabel]', form).textContent = 'Select time'; checkDay(); });
    PP.$('[name=pro]', form).addEventListener('change', () => { state.time = null; PP.$('[data-timelabel]', form).textContent = 'Select time'; checkDay(); });
    PP.$('#pick', form).addEventListener('click', openSlots);
    form.addEventListener('submit', submit);
  }

  /** Union of free slots across the chosen professional (or all, for "Any available"). */
  function slotsFor(serviceId, proId, date) {
    const svc = PP.find.service(serviceId); const list = proId ? [proId] : pros().map((p) => p.id);
    const map = new Map();
    list.forEach((id) => PP.sched.slots(id, date, svc.duration).forEach((x) => { const cur = map.get(x.start); map.set(x.start, cur ? cur || x.free : x.free); }));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([start, free]) => ({ start, free: free && !(date === PP.today() && PP.toMin(start) <= PP.toMin(PP.nowTime())) }));
  }
  function checkDay() {
    const f = PP.form.read(PP.$('[data-form]', root)); const box = PP.$('[data-msg]', root);
    if (!f.date) { box.innerHTML = ''; return; }
    const closure = PP.db.closures.find((c) => c.date === f.date);
    box.innerHTML = closure ? PP.ui.alert('warning', `The clinic is closed on ${PP.fmt.date(f.date)} (${esc(closure.reason)}). Please choose another date.`) : PP.dow(f.date) === 5 ? PP.ui.alert('warning', 'The clinic is closed on Fridays. Please choose another date.') : '';
  }
  function openSlots() {
    const form = PP.$('[data-form]', root); const f = PP.form.read(form);
    if (!f.serviceId || !f.date) { PP.form.validate(form); PP.ui.toast('Choose a service and a date first.', 'warning'); return; }
    let pick = state.time;
    const pro = f.pro ? PP.find.professional(f.pro) : null;
    const m = PP.ui.modal({
      title: 'Select Time Slot',
      body: `<div class="row between"><div class="row">${pro ? `<span class="avatar" style="background:${pro.color}1f;color:${pro.color}">${esc(PP.initials(pro.name))}</span><div><b>${esc(PP.proName(pro))}</b><div class="small muted">${esc(pro.designation)}</div></div>` : `<div><b>Any available ${esc(PP.tl('professional'))}</b><div class="small muted">The clinic assigns one when confirming</div></div>`}</div><span class="date-chip">${PP.icon('calendar')} ${PP.fmt.dateLong(f.date)}</span></div>
        <div class="label mt-4">Available time slots (${PP.find.service(f.serviceId).duration} minutes)</div><div class="slot-grid mt-2" data-grid></div>
        <div class="legend mt-3"><span>Available</span><span class="l-booked">Booked</span><span class="l-selected">Selected</span></div>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Confirm Slot', kind: 'primary', onClick: () => {
        if (!pick) { PP.ui.toast('Select a time slot.', 'warning'); return false; }
        state.time = pick; PP.$('[data-timelabel]', root).textContent = PP.fmt.time(pick); PP.$('[data-field="time"]', root).classList.remove('has-error');
      } }],
    });
    const draw = () => {
      const g = PP.$('[data-grid]', m.body); const slots = slotsFor(f.serviceId, f.pro, f.date);
      g.innerHTML = slots.length ? slots.map((x) => `<button type="button" class="slot ${x.free ? '' : 'booked'} ${pick === x.start ? 'selected' : ''}" data-s="${x.start}" ${x.free ? '' : 'disabled'}>${PP.fmt.time(x.start)}</button>`).join('') : `<div style="grid-column:1/-1">${PP.ui.empty({ icon: 'calendar', title: 'No time slots on this date', text: 'The clinic is closed or fully booked. Please choose another date.' })}</div>`;
      PP.$$('[data-s]', g).forEach((b) => b.addEventListener('click', () => { pick = b.dataset.s; draw(); }));
    };
    draw();
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget; let ok = PP.form.validate(form);
    if (!state.time) { PP.form.setError(form, 'time', 'Please choose a time.'); ok = false; }
    const f = PP.form.read(form);
    if (f.date && (PP.dow(f.date) === 5 || PP.db.closures.some((c) => c.date === f.date))) { PP.form.setError(form, 'date', 'The clinic is closed on this date.'); ok = false; }
    if (!ok) return;
    await PP.ui.busy(PP.$('[data-submit]', form), async () => {
      PP.load(); // pick up the latest data from other tabs before writing
      const match = PP.db.patients.find((p) => p.mobile.replace(/\D/g, '') === f.mobile.replace(/\D/g, '') && p.name.toLowerCase() === f.name.toLowerCase());
      const branchId = f.pro ? PP.find.professional(f.pro).branchId : 'BR-1';
      const req = { id: PP.nextId('REQ'), name: f.name, mobile: f.mobile.replace(/\D/g, ''), serviceId: f.serviceId, preferredProfessionalId: f.pro || null, date: f.date, time: state.time, notes: f.notes, status: 'Pending', createdAt: PP.nowStamp(), patientId: match ? match.id : null, branchId, smsConsent: f.consent };
      PP.db.requests.push(req);
      PP.notify('New online appointment request', `${req.name} · ${PP.serviceName(req.serviceId)} · ${PP.fmt.date(req.date)} ${PP.fmt.time(req.time)}`, `#/appointments/${req.id}`);
      PP.save();
      renderDone(req);
    }, 700);
  }

  function renderDone(req) {
    root.innerHTML = `<div class="auth-page">${brand}<main class="auth-main"><div class="auth-card narrow" style="text-align:center">
      <div class="success-mark">${PP.icon('check')}</div>
      <h1>Appointment Request Submitted!</h1>
      <p class="lead">Thank you, ${esc(req.name)}. Your request is <b>pending clinic confirmation</b>. We will confirm it by SMS.</p>
      <div class="ref-cards"><div class="ref-card">${PP.icon('file')}<div><span class="sub">Request No.</span><b class="mono">${req.id}</b></div></div><div class="ref-card">${PP.icon('clock')}<div><span class="sub">Requested date</span><b>${PP.fmt.dateShort(req.date)}, ${PP.fmt.time(req.time)}</b></div></div></div>
      ${PP.ui.alert('info', 'This time is a preference, not a booking yet. The clinic may call you to agree on another time.')}
      <div class="row mt-4" style="justify-content:center"><button class="btn" data-again>${PP.icon('plus')} Make another request</button><a class="btn btn-primary" href="../index.html">${PP.icon('chevL')} Back to Home</a></div>
      <p class="small muted mt-4">Prototype tip: open the clinic workspace → Appointments → Online Requests to see this request arrive.</p>
    </div></main></div>`;
    PP.$('[data-again]', root).addEventListener('click', () => { state.form = {}; state.time = null; renderForm(); });
  }

  renderForm();
})();
