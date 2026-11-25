/* Appointments: list, calendar, online requests, request review, create/edit (stepper), appointment detail.
   Blueprint screens 05–08 + Reference B/C. Rule: an online request is Pending; only admin confirmation reserves a slot. */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;

  /* ------------------------------------------------------------ shared logic */
  PP.appt = {
    STATUSES: ['Pending', 'Scheduled', 'Confirmed', 'Checked in', 'In session', 'Completed', 'Cancelled', 'No-show'],
    bookable: () => PP.professionalsInBranch().filter((p) => { const t = PP.db.professionalTypes.find((x) => x.id === p.typeId); return !t || t.canBeBooked; }),
    history(a, status, note) { (a.history = a.history || []).push({ at: PP.nowStamp(), status, note: note || '', by: (PP.currentUser() || {}).name || 'System' }); },
    setStatus(a, status, note) { a.status = status; PP.appt.history(a, status, note); PP.audit(`Appointment ${status.toLowerCase()}`, a.id, note || ''); PP.save(); },
    /** Confirms an online request. Re-checks conflicts at the moment of saving (atomic in production). */
    confirmRequest(req, { professionalId, date, start, patientId }) {
      const svc = PP.find.service(req.serviceId); const end = PP.fromMin(PP.toMin(start) + svc.duration);
      const conflicts = PP.sched.conflicts(professionalId, date, start, end);
      if (conflicts.length) return { ok: false, conflicts };
      let pid = patientId;
      if (!pid) {
        const p = { id: PP.nextId('PAT'), name: req.name, gender: '', dob: '', mobile: req.mobile.replace(/\D/g, ''), email: '', address: '', emergencyContact: '', assignedProfessionalId: professionalId, branchId: PP.find.professional(professionalId).branchId, referralSource: 'Online booking', bloodGroup: '', medicalHistory: '', allergies: '', previousTreatments: '', notes: req.notes || '', registeredAt: PP.today(), familyGroup: null, customFields: {}, status: 'Active' };
        PP.db.patients.push(p); pid = p.id; PP.audit('Patient registered', p.id, 'From online request ' + req.id);
      }
      const pro = PP.find.professional(professionalId);
      const a = { id: PP.nextId('APT'), patientId: pid, professionalId, serviceId: req.serviceId, branchId: pro.branchId, roomId: PP.appt.defaultRoom(pro), date, start, end, status: 'Confirmed', source: 'Online request', notes: req.notes || '', createdAt: PP.nowStamp(), requestId: req.id, history: [] };
      PP.appt.history(a, 'Confirmed', `Confirmed from ${req.id}`);
      PP.db.appointments.push(a);
      req.status = 'Confirmed'; req.appointmentId = a.id; req.patientId = pid; req.reviewedAt = PP.nowStamp(); req.reviewedBy = (PP.currentUser() || {}).id;
      if (req.rescheduleOf) {
        const orig = PP.find.appointment(req.rescheduleOf);
        if (orig && !['Completed', 'Cancelled', 'No-show'].includes(orig.status)) {
          orig.status = 'Rescheduled'; orig.rescheduledTo = a.id; delete orig.changeRequest;
          PP.appt.history(orig, 'Rescheduled', `Moved to ${a.id} at the patient's request (${req.id})`);
        }
      }
      PP.audit('Online request confirmed', req.id, `${a.id} · ${PP.fmt.date(date)} ${PP.fmt.time(start)} · ${PP.proName(pro)}`);
      PP.save();
      return { ok: true, appointment: a };
    },
    rejectRequest(req, reason) { req.status = 'Rejected'; req.rejectReason = reason; req.reviewedAt = PP.nowStamp(); PP.audit('Online request rejected', req.id, reason); PP.save(); },
    defaultRoom(pro) { const r = PP.db.rooms.find((x) => x.branchId === pro.branchId); return r ? r.id : null; },
    /** Suggest the first professional with a free slot at the requested time (used when the patient chose "Any available"). */
    suggestPro(req) {
      const svc = PP.find.service(req.serviceId); const end = PP.fromMin(PP.toMin(req.time) + svc.duration);
      const list = req.preferredProfessionalId ? [PP.find.professional(req.preferredProfessionalId)] : PP.db.professionals.filter((p) => p.status === 'Active');
      const free = list.find((p) => p && !PP.sched.conflicts(p.id, req.date, req.time, end).length);
      return free || list[0];
    },
  };

  const statusActions = (a) => {
    const acts = [];
    if (['Pending', 'Scheduled'].includes(a.status)) acts.push(['Confirmed', 'Confirm', 'check']);
    if (['Scheduled', 'Confirmed'].includes(a.status)) acts.push(['Checked in', 'Check in', 'user']);
    if (['Checked in', 'Confirmed'].includes(a.status)) acts.push(['In session', 'Start session', 'activity']);
    if (['In session', 'Checked in'].includes(a.status)) acts.push(['Completed', 'Complete', 'checkCircle']);
    if (['Scheduled', 'Confirmed', 'Pending'].includes(a.status)) acts.push(['Rescheduled', 'Reschedule', 'repeat']);
    if (['Scheduled', 'Confirmed', 'Checked in'].includes(a.status)) acts.push(['No-show', 'Mark no-show', 'x']);
    if (!['Completed', 'Cancelled', 'No-show'].includes(a.status)) acts.push(['Cancelled', 'Cancel', 'trash']);
    return acts;
  };

  /** Runs a status action with the right dialog. Returns a promise that resolves when done. */
  async function runAction(a, status, after) {
    if (!PP.can('appointments.manage') && !(PP.can('clinical.write') && ['In session', 'Completed'].includes(status))) { PP.ui.toast('Your role cannot change appointments.', 'error'); return; }
    if (status === 'Rescheduled') return rescheduleModal(a, after);
    if (status === 'Cancelled' || status === 'No-show') {
      const r = await PP.ui.confirm({ title: status === 'Cancelled' ? `Cancel ${a.id}?` : `Mark ${a.id} as no-show?`, message: `${esc(PP.patientName(a.patientId))} · ${PP.fmt.dateLong(a.date)} at ${PP.fmt.time(a.start)}. The slot becomes free again.`, confirmLabel: status === 'Cancelled' ? 'Cancel appointment' : 'Mark no-show', danger: true, reasonLabel: 'Reason', reasonRequired: status === 'Cancelled' });
      if (!r) return; a.cancelReason = r.reason; PP.appt.setStatus(a, status, r.reason);
      PP.ui.toast(status === 'Cancelled' ? `${a.id} cancelled. Cancellation SMS queued (simulated).` : `${a.id} marked as no-show.`);
    } else {
      if (status === 'Confirmed') {
        const c = PP.sched.conflicts(a.professionalId, a.date, a.start, a.end, a.id);
        if (c.length) { PP.ui.toast(`Cannot confirm: ${esc(c[0])}`, 'error', 5000); return; }
      }
      PP.appt.setStatus(a, status);
      const msg = { Confirmed: 'confirmed. Confirmation SMS queued (simulated).', 'Checked in': 'checked in.', 'In session': 'session started.', Completed: 'completed.' }[status];
      PP.ui.toast(`${a.id} ${msg}`);
      if (status === 'Completed') completionPrompt(a);
    }
    if (after) after();
  }

  function completionPrompt(a) {
    const hasInv = PP.db.invoices.some((i) => i.appointmentId === a.id);
    PP.ui.modal({
      title: 'Session completed', size: 'sm',
      body: `<p style="margin-top:0">What would you like to do next for <b>${esc(PP.patientName(a.patientId))}</b>?</p>
        <div class="stack">
          ${PP.can('clinical.write') ? `<a class="btn" href="#/visits/new?patient=${a.patientId}&appointment=${a.id}">${PP.icon('clipboard')} Record clinical visit</a>` : ''}
          ${PP.can('billing.manage') && !hasInv ? `<a class="btn btn-primary" href="#/billing/new?patient=${a.patientId}&appointment=${a.id}">${PP.icon('receipt')} Create invoice & collect payment</a>` : ''}
        </div>`,
      buttons: [{ label: 'Later', kind: 'ghost' }],
      onOpen: (b, el) => PP.$$('a', b).forEach((x) => x.addEventListener('click', () => el.remove())),
    });
  }

  function rescheduleModal(a, after) {
    const svc = PP.find.service(a.serviceId);
    let sel = { date: a.date, start: null, pro: a.professionalId };
    const m = PP.ui.modal({
      title: `Reschedule ${a.id}`, size: 'lg',
      body: `<div class="form-grid">
          ${PP.form.field({ name: 'pro', label: PP.t('professional'), type: 'select', required: true, value: a.professionalId, placeholder: false, options: PP.appt.bookable().map((p) => [p.id, PP.proName(p)]) })}
          ${PP.form.field({ name: 'date', label: 'New date', type: 'date', required: true, value: a.date, min: PP.today() })}
        </div>
        <div class="mt-4"><div class="label">Available time slots (${svc.duration} minutes)</div><div class="slot-grid mt-2" data-slots></div><div class="legend mt-3"><span>Available</span><span class="l-booked">Booked / blocked</span><span class="l-selected">Selected</span></div></div>
        <div class="field mt-4"><label for="rs-reason">Reason</label><input id="rs-reason" class="input" name="reason" placeholder="e.g. Patient asked for a later time"></div>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Reschedule', kind: 'primary', onClick: ({ body }) => {
        if (!sel.start) { PP.ui.toast('Select a time slot first.', 'warning'); return false; }
        const end = PP.fromMin(PP.toMin(sel.start) + svc.duration);
        const c = PP.sched.conflicts(sel.pro, sel.date, sel.start, end, a.id);
        if (c.length) { PP.ui.toast(`Slot no longer free: ${esc(c[0])}`, 'error'); return false; }
        const old = `${PP.fmt.date(a.date)} ${PP.fmt.time(a.start)}`;
        Object.assign(a, { date: sel.date, start: sel.start, end, professionalId: sel.pro, branchId: PP.find.professional(sel.pro).branchId });
        a.status = a.status === 'Pending' ? 'Pending' : 'Confirmed';
        PP.appt.history(a, 'Rescheduled', `From ${old} · ${PP.$('[name=reason]', body).value}`);
        PP.audit('Appointment rescheduled', a.id, `From ${old} to ${PP.fmt.date(sel.date)} ${PP.fmt.time(sel.start)}`); PP.save();
        PP.ui.toast(`${a.id} moved to ${PP.fmt.dateLong(sel.date)} at ${PP.fmt.time(sel.start)}. Reschedule SMS queued (simulated).`);
        if (after) after();
      } }],
    });
    const draw = () => {
      const box = PP.$('[data-slots]', m.body); const w = PP.sched.window(sel.pro, sel.date);
      if (!w || w.closed) { box.innerHTML = `<div class="alert warning" style="grid-column:1/-1">${PP.icon('alert')}<div>${esc(w ? w.reason : 'Unavailable')}. Choose another date.</div></div>`; return; }
      box.innerHTML = PP.sched.slots(sel.pro, sel.date, svc.duration, a.id).map((s) => `<button type="button" class="slot ${s.free ? '' : 'booked'} ${sel.start === s.start ? 'selected' : ''}" data-s="${s.start}" ${s.free ? '' : `disabled title="${esc(s.reason)}"`}>${PP.fmt.time(s.start)}</button>`).join('') || '<div class="muted">No slots.</div>';
      PP.$$('[data-s]', box).forEach((b) => b.addEventListener('click', () => { sel.start = b.dataset.s; draw(); }));
    };
    PP.$('[name=pro]', m.body).addEventListener('change', (e) => { sel.pro = e.target.value; sel.start = null; draw(); });
    PP.$('[name=date]', m.body).addEventListener('change', (e) => { sel.date = e.target.value; sel.start = null; draw(); });
    draw();
  }

  /* ------------------------------------------------------------ shared header */
  function header(active, extra) {
    const pending = PP.db.requests.filter((r) => r.status === 'Pending' && PP.inBranch(r)).length;
    const tabs = [['all', 'All Appointments', '#/appointments'], ['calendar', 'Calendar View', '#/appointments/calendar'], ['requests', `Online Requests`, '#/appointments/requests'], ['new', 'Add Appointment', '#/appointments/new']]
      .filter(([id]) => (id === 'requests' ? PP.can('requests.review') : id === 'new' ? PP.can('appointments.manage') : true));
    return `${PP.ui.pageHead({
      title: extra && extra.title ? extra.title : 'Appointments', subtitle: extra && extra.subtitle ? extra.subtitle : 'Search, manage and track patient bookings',
      actions: `<button class="btn" data-public-link>${PP.icon('link')} Public Booking Link</button>${PP.can('appointments.manage') ? `<a class="btn btn-primary" href="#/appointments/new">${PP.icon('plus')} Add Appointment</a>` : ''}`,
    })}
    <div class="tabs mb-tabs" role="tablist">${tabs.map(([id, l, h]) => `<a class="tab ${id === active ? 'active' : ''}" href="${h}" role="tab" aria-selected="${id === active}">${l}${id === 'requests' && pending ? ` <span class="count-pill">${pending}</span>` : ''}</a>`).join('')}</div>`;
  }
  function bindHeader(el) {
    const b = PP.$('[data-public-link]', el); if (!b) return;
    b.addEventListener('click', () => {
      const url = new URL('booking.html', location.href).href;
      PP.ui.modal({ title: 'Public booking link', size: 'sm', body: `<p style="margin-top:0">Share this link on Facebook, Google Maps or WhatsApp. Patients can request a visit without logging in. Requests arrive here as <b>Pending</b>.</p><div class="row"><input class="input" readonly value="${esc(url)}" aria-label="Public booking link"><button class="btn" data-copy>${PP.icon('clipboard')} Copy</button></div>`, buttons: [{ label: 'Close', kind: 'ghost' }, { label: 'Open page', kind: 'primary', onClick: () => { window.open(url, '_blank'); } }], onOpen: (body) => PP.$('[data-copy]', body).addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => PP.ui.toast('Link copied')).catch(() => PP.ui.toast('Copy the link from the box', 'info')); }) });
    });
  }

  const apptRow = (a) => `<b>${esc(PP.patientName(a.patientId))}</b><span class="sub">${esc((PP.find.patient(a.patientId) || {}).mobile || '')}</span>`;

  /* ------------------------------------------------------------ All appointments (screen 06) */
  /** A signed-in professional sees only their own appointments (D-031). */
  const ownPro = () => PP.ownProId();
  PP.route('/appointments', {
    title: 'Appointments', perm: 'appointments.view',
    render({ el, query }) {
      el.innerHTML = `${header('all')}<div class="card mt-4" data-tbl></div>`;
      bindHeader(el);
      const me = PP.currentUser(); const own = !!PP.ownProId();
      const range = { v: query.range || 'today' };
      const inRange = (a) => {
        const t = PP.today();
        switch (range.v) {
          case 'today': return a.date === t;
          case 'tomorrow': return a.date === PP.addDays(t, 1);
          case 'week': return a.date >= t && a.date <= PP.addDays(t, 6);
          case 'upcoming': return a.date >= t;
          case 'past': return a.date < t && a.date >= PP.addDays(t, -7);
          case 'all': return true;
          default: return a.date === range.v;
        }
      };
      const tbl = PP.ui.table(PP.$('[data-tbl]', el), {
        exportName: 'appointments', pageSize: 10,
        getRows: () => PP.db.appointments.filter((a) => PP.inBranch(a) && inRange(a) && (!own || a.professionalId === me.professionalId)).sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start)),
        search: { placeholder: 'Search name, ID or mobile', text: (a) => `${a.id} ${PP.patientName(a.patientId)} ${(PP.find.patient(a.patientId) || {}).mobile} ${a.patientId}` },
        tools: `<select class="select" style="width:auto" data-range aria-label="Date range">${[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days'], ['upcoming', 'All upcoming'], ['past', 'Past 7 days'], ['all', 'All dates']].map(([v, l]) => `<option value="${v}" ${range.v === v ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="date" class="input" style="width:auto" data-day aria-label="Pick a date">`,
        filters: [
          ...(own ? [] : [{ id: 'pro', label: `All ${PP.tl('professionals')}`, options: PP.professionalsInBranch().map((p) => [p.id, PP.proName(p)]), match: (a, v) => a.professionalId === v }]),
          { id: 'st', label: 'All status', options: PP.appt.STATUSES.concat(['Rescheduled']).map((s) => [s, s]), match: (a, v) => a.status === v },
        ],
        columns: [
          { key: 'id', label: 'ID', render: (a) => `<span class="mono small">${a.id}</span>`, sort: (a) => a.id },
          { key: 'patient', label: 'Patient', render: apptRow, sort: (a) => PP.patientName(a.patientId) },
          { key: 'pro', label: PP.t('professional'), render: (a) => esc(PP.proShort(a.professionalId)), sort: (a) => PP.proName(a.professionalId) },
          { key: 'svc', label: 'Service', render: (a) => esc(PP.serviceName(a.serviceId)) + (a.visitType === 'Home visit' ? ' <span class="badge lavender">Home</span>' : '') },
          { key: 'when', label: 'Date / Time', render: (a) => `${PP.fmt.dateShort(a.date)}, ${PP.fmt.time(a.start)}${a.serialNo ? `<span class="sub">Serial #${a.serialNo}</span>` : ''}`, sort: (a) => a.date + a.start, exportValue: (a) => `${a.date} ${a.start}` },
          { key: 'status', label: 'Status', render: (a) => PP.ui.badge(a.status), sort: (a) => a.status },
          { key: 'src', label: 'Source', render: (a) => `<span class="small muted">${esc(a.source)}</span>` },
          { key: 'act', label: '', render: (a) => `<div class="row-actions"><a class="btn btn-ghost btn-icon btn-sm" href="#/appointments/${a.id}" aria-label="View ${a.id}" title="View">${PP.icon('eye')}</a>${PP.can('appointments.manage') && !['Completed', 'Cancelled', 'No-show'].includes(a.status) ? `<a class="btn btn-ghost btn-icon btn-sm" href="#/appointments/${a.id}/edit" aria-label="Edit ${a.id}" title="Edit">${PP.icon('edit')}</a>` : ''}<span class="rel"><button class="btn btn-ghost btn-icon btn-sm" data-more="${a.id}" aria-label="More actions for ${a.id}" title="More">${PP.icon('more')}</button></span></div>`, exportValue: () => '' },
        ],
        empty: { icon: 'calendar', title: 'No appointments in this period', text: 'Choose another date range or add an appointment.', action: PP.can('appointments.manage') ? '<a class="btn btn-primary" href="#/appointments/new">Add appointment</a>' : '' },
        onRowClick: (a) => PP.go(`#/appointments/${a.id}`),
        afterDraw: (root) => PP.$$('[data-more]', root).forEach((b) => b.addEventListener('click', (e) => {
          e.stopPropagation(); const a = PP.find.appointment(b.dataset.more);
          const acts = statusActions(a);
          PP.ui.dropdown(b, acts.length ? acts.map(([s, l, ic]) => `<button class="dd-item" data-act="${s}">${PP.icon(ic, 'style="width:16px"')} ${l}</button>`).join('') : '<div class="small muted" style="padding:10px">No actions for this status</div>', (dd) => PP.$$('[data-act]', dd).forEach((x) => x.addEventListener('click', () => { dd.remove(); runAction(a, x.dataset.act, () => tbl.refresh()); })));
        })),
      });
      PP.$('[data-range]', el).addEventListener('change', (e) => { range.v = e.target.value; PP.$('[data-day]', el).value = ''; tbl.state.page = 1; tbl.refresh(); });
      PP.$('[data-day]', el).addEventListener('change', (e) => { if (!e.target.value) return; range.v = e.target.value; PP.$('[data-range]', el).value = ''; tbl.state.page = 1; tbl.refresh(); });
    },
  });

  /* ------------------------------------------------------------ Calendar (screen 05 + Reference B) */
  PP.route('/appointments/calendar', {
    title: 'Appointment Calendar', perm: 'appointments.view',
    render({ el, query }) {
      const st = { view: query.view || 'day', date: query.date || PP.today(), pro: '' };
      el.innerHTML = `${header('calendar', { subtitle: `${PP.t('professional')}-wise schedule, day and week views` })}
        <div class="card mt-4"><div class="card-head cal-head">
          <div class="row">${PP.ui.segmented('view', [['day', 'Day'], ['week', 'Week']], st.view)}
            <div class="row" style="gap:6px"><button class="btn btn-icon btn-sm" data-nav="-1" aria-label="Previous">${PP.icon('chevL')}</button><button class="btn btn-sm" data-today>Today</button><button class="btn btn-icon btn-sm" data-nav="1" aria-label="Next">${PP.icon('chevR')}</button></div>
            <b data-label></b></div>
          <select class="select" style="width:auto${ownPro() ? ';display:none' : ''}" data-pro aria-label="Filter ${PP.tl('professionals')}"><option value="">All ${PP.tl('professionals')}</option>${PP.appt.bookable().map((p) => `<option value="${p.id}">${esc(PP.proName(p))}</option>`).join('')}</select>
        </div><div class="card-body flush" data-cal></div>
        <div class="card-foot row small muted" style="gap:16px"><span>${PP.ui.badge('Confirmed')}</span><span>${PP.ui.badge('Scheduled')}</span><span>${PP.ui.badge('Checked in')}</span><span>${PP.ui.badge('In session')}</span><span>${PP.ui.badge('Completed')}</span><span>Click an empty slot to book it.</span></div></div>`;
      bindHeader(el);
      const draw = () => {
        PP.$('[data-label]', el).textContent = st.view === 'day' ? PP.fmt.dateLong(st.date) : `Week of ${PP.fmt.date(weekStart(st.date))}`;
        const pros = ownPro() ? [PP.find.professional(ownPro())].filter(Boolean) : PP.appt.bookable().filter((p) => !st.pro || p.id === st.pro);
        const box = PP.$('[data-cal]', el);
        if (!pros.length) { box.innerHTML = PP.ui.empty({ icon: 'users', title: `No ${PP.tl('professionals')} in this branch` }); return; }
        if (st.view === 'day') drawDay(box, pros, st.date); else drawWeek(box, pros, st.date);
      };
      PP.ui.bindSegmented(el, 'view', (v) => { st.view = v; draw(); });
      PP.$$('[data-nav]', el).forEach((b) => b.addEventListener('click', () => { st.date = PP.addDays(st.date, Number(b.dataset.nav) * (st.view === 'day' ? 1 : 7)); draw(); }));
      PP.$('[data-today]', el).addEventListener('click', () => { st.date = PP.today(); draw(); });
      PP.$('[data-pro]', el).addEventListener('change', (e) => { st.pro = e.target.value; draw(); });
      draw();
    },
  });
  const weekStart = (iso) => { const d = PP.dow(iso); return PP.addDays(iso, -((d + 1) % 7)); }; // weeks start on Saturday in Bangladesh

  function drawDay(box, pros, date) {
    const wins = pros.map((p) => PP.sched.window(p.id, date));
    const open = wins.filter((w) => w && !w.closed);
    const startM = open.length ? Math.min(...open.map((w) => PP.toMin(w.start))) : 9 * 60;
    const endM = open.length ? Math.max(...open.map((w) => PP.toMin(w.end))) : 17 * 60;
    const step = 30; const rows = Math.max(1, (endM - startM) / step);
    const appts = PP.db.appointments.filter((a) => a.date === date && !['Cancelled', 'Rescheduled'].includes(a.status));
    let html = `<div class="cal-day" style="--cols:${pros.length};--rows:${rows}">
      <div class="cal-corner">Time</div>
      ${pros.map((p, i) => `<div class="cal-colhead" style="grid-column:${i + 2}"><span class="avatar" style="background:${p.color}1f;color:${p.color}">${esc(PP.initials(p.name))}</span><div><b>${esc(PP.proName(p))}</b><span class="sub">${esc(p.designation)}</span></div></div>`).join('')}
      ${Array.from({ length: rows }, (_, r) => `<div class="cal-time" style="grid-row:${r + 2}">${PP.fmt.time(PP.fromMin(startM + r * step))}</div>`).join('')}`;
    pros.forEach((p, i) => {
      const w = wins[i]; const col = i + 2;
      if (!w || w.closed) { html += `<div class="cal-closed" style="grid-column:${col};grid-row:2 / span ${rows}">${esc(w ? w.reason : 'Unavailable')}</div>`; return; }
      for (let r = 0; r < rows; r++) {
        const m = startM + r * step; const t = PP.fromMin(m);
        const inHours = m >= PP.toMin(w.start) && m < PP.toMin(w.end);
        const inBreak = w.breakStart && m >= PP.toMin(w.breakStart) && m < PP.toMin(w.breakEnd);
        if (!inHours) html += `<div class="cal-off" style="grid-column:${col};grid-row:${r + 2}"></div>`;
        else if (inBreak) { if (m === PP.toMin(w.breakStart)) html += `<div class="cal-break" style="grid-column:${col};grid-row:${r + 2} / span ${(PP.toMin(w.breakEnd) - PP.toMin(w.breakStart)) / step}">${PP.icon('clock')} Break</div>`; }
        else html += `<button class="cal-slot" style="grid-column:${col};grid-row:${r + 2}" data-book="${p.id}|${date}|${t}" aria-label="Book ${esc(PP.proName(p))} at ${PP.fmt.time(t)}" ${PP.can('appointments.manage') && date >= PP.today() ? '' : 'disabled'}></button>`;
      }
      appts.filter((a) => a.professionalId === p.id).forEach((a) => {
        const r0 = Math.floor((PP.toMin(a.start) - startM) / step); const span = Math.max(1, Math.ceil((PP.toMin(a.end) - PP.toMin(a.start)) / step));
        if (r0 < 0 || r0 >= rows) return;
        html += `<a class="cal-appt tone-${PP.ui.tone(a.status)}" href="#/appointments/${a.id}" style="grid-column:${col};grid-row:${r0 + 2} / span ${span};--c:${p.color}"><b>${esc(PP.patientName(a.patientId))}</b><span>${esc(PP.serviceName(a.serviceId))}</span><span class="cal-st">${PP.fmt.time(a.start)} · ${esc(a.status)}</span></a>`;
      });
    });
    box.innerHTML = `<div class="cal-scroll">${html}</div></div>`;
    PP.$$('[data-book]', box).forEach((b) => b.addEventListener('click', () => { const [pro, d, t] = b.dataset.book.split('|'); PP.go(`#/appointments/new?pro=${pro}&date=${d}&time=${t}`); }));
  }
  function drawWeek(box, pros, date) {
    const ws = weekStart(date); const days = Array.from({ length: 7 }, (_, i) => PP.addDays(ws, i));
    box.innerHTML = `<div class="table-wrap"><table class="table cal-week"><thead><tr><th>${esc(PP.t('professional'))}</th>${days.map((d) => `<th class="${d === PP.today() ? 'is-today' : ''}">${PP.DAYS[PP.dow(d)].slice(0, 3)}<span class="sub">${PP.fmt.dateShort(d)}</span></th>`).join('')}</tr></thead><tbody>
      ${pros.map((p) => `<tr><th scope="row" class="cal-week-pro"><span class="avatar" style="background:${p.color}1f;color:${p.color}">${esc(PP.initials(p.name))}</span> ${esc(PP.proShort(p))}</th>${days.map((d) => {
        const w = PP.sched.window(p.id, d);
        if (!w || w.closed) return `<td class="cal-week-off">${esc(w ? w.reason.split(':')[0] : '')}</td>`;
        const list = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date === d && !['Cancelled', 'Rescheduled'].includes(a.status)).sort((x, y) => x.start.localeCompare(y.start));
        return `<td>${list.slice(0, 4).map((a) => `<a class="chip tone-${PP.ui.tone(a.status)}" href="#/appointments/${a.id}">${PP.fmt.time(a.start).replace(' ', '')} ${esc(PP.patientName(a.patientId).split(' ')[0])}</a>`).join('')}${list.length > 4 ? `<a class="small" href="#/appointments/calendar?date=${d}">+${list.length - 4} more</a>` : ''}${!list.length ? '<span class="small muted">Free</span>' : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ------------------------------------------------------------ Online requests list */
  PP.route('/appointments/requests', {
    title: 'Online Requests', perm: 'requests.review',
    render({ el, query }) {
      const st = { tab: query.tab || 'Pending' };
      el.innerHTML = `${header('requests', { subtitle: 'Requests from the public booking page. They reserve no slot until you confirm them.' })}
        <div class="mt-4">${PP.ui.alert('info', '<b>Rule:</b> an online submission creates a <b>Pending</b> request. Only your confirmation reserves the appointment slot, after a conflict check.')}</div>
        <div class="card mt-4"><div data-tabs style="padding:0 12px"></div><div data-list></div></div>`;
      bindHeader(el);
      const counts = (s) => PP.db.requests.filter((r) => PP.inBranch(r) && (s === 'All' || r.status === s)).length;
      const draw = () => {
        PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'All'].map((s) => ({ id: s, label: s, count: counts(s) })), active: st.tab, onChange: (t) => { st.tab = t; draw(); } });
        PP.ui.table(PP.$('[data-list]', el), {
          exportName: 'online-requests',
          getRows: () => PP.db.requests.filter((r) => PP.inBranch(r) && (st.tab === 'All' || r.status === st.tab)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          search: { placeholder: 'Search name, mobile or reference', text: (r) => `${r.id} ${r.name} ${r.mobile}` },
          columns: [
            { key: 'id', label: 'Reference', render: (r) => `<span class="mono small">${r.id}</span>` },
            { key: 'name', label: 'Patient', render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.mobile)}${r.patientId ? ' · existing patient' : ' · new'}</span>`, sort: (r) => r.name },
            { key: 'svc', label: 'Service', render: (r) => esc(PP.serviceName(r.serviceId)) },
            { key: 'pro', label: `Preferred ${PP.tl('professional')}`, render: (r) => (r.preferredProfessionalId ? esc(PP.proShort(r.preferredProfessionalId)) : '<span class="muted">Any available</span>') },
            { key: 'when', label: 'Requested slot', render: (r) => `${PP.fmt.dateShort(r.date)}, ${PP.fmt.time(r.time)}`, sort: (r) => r.date + r.time },
            { key: 'rcv', label: 'Received', render: (r) => `<span class="small">${PP.fmt.stamp(r.createdAt)}</span>`, sort: (r) => r.createdAt },
            { key: 'st', label: 'Status', render: (r) => PP.ui.badge(r.status) },
            { key: 'act', label: '', render: (r) => (r.status === 'Pending' ? `<div class="row-actions"><button class="btn btn-primary btn-sm" data-quick="${r.id}">${PP.icon('check')} Confirm</button><button class="btn btn-danger btn-sm" data-rej="${r.id}">Reject</button></div>` : `<a class="btn btn-sm" href="#/appointments/${r.status === 'Confirmed' && r.appointmentId ? r.appointmentId : r.id}">View</a>`), exportValue: () => '' },
          ],
          empty: { icon: 'checkCircle', title: st.tab === 'Pending' ? 'All caught up' : 'No requests here', text: st.tab === 'Pending' ? 'There are no online requests waiting for review.' : '' },
          onRowClick: (r) => PP.go(`#/appointments/${r.id}`),
          afterDraw: (root) => {
            PP.$$('[data-quick]', root).forEach((b) => b.addEventListener('click', () => quickConfirm(PP.find.request(b.dataset.quick), b, draw)));
            PP.$$('[data-rej]', root).forEach((b) => b.addEventListener('click', () => rejectFlow(PP.find.request(b.dataset.rej), draw)));
          },
        });
      };
      draw();
    },
  });

  async function quickConfirm(req, btn, after) {
    const pro = PP.appt.suggestPro(req);
    const match = PP.duplicateCandidates(req.mobile, req.name)[0];
    await PP.ui.busy(btn, async () => {
      const res = PP.appt.confirmRequest(req, { professionalId: pro.id, date: req.date, start: req.time, patientId: req.patientId || (match && match.name.toLowerCase() === req.name.toLowerCase() ? match.id : null) });
      if (!res.ok) { PP.ui.toast(`Slot not free (${esc(res.conflicts[0])}). Opening the review page to pick another slot.`, 'warning', 4500); PP.go(`#/appointments/${req.id}`); return; }
      PP.ui.toast(`${req.id} confirmed as ${res.appointment.id} with ${esc(PP.proName(pro))}. Confirmation SMS queued (simulated).`);
      if (after) after();
    }, 500);
  }
  async function rejectFlow(req, after) {
    const r = await PP.ui.confirm({ title: `Reject ${req.id}?`, message: `${esc(req.name)} requested ${PP.fmt.dateLong(req.date)} at ${PP.fmt.time(req.time)}.`, confirmLabel: 'Reject request', danger: true, reasonLabel: 'Reason (shared with the patient by SMS)', reasonRequired: true });
    if (!r) return; PP.appt.rejectRequest(req, r.reason); PP.ui.toast(`${req.id} rejected.`); if (after) after();
  }

  /* ------------------------------------------------------------ Request review (screen 08) / appointment detail */
  PP.route('/appointments/:id', {
    title: (p) => (p.id.startsWith('REQ') ? 'Appointment Request' : 'Appointment Details'), perm: 'appointments.view',
    render({ el, params }) {
      if (params.id.startsWith('REQ')) return renderRequest(el, PP.find.request(params.id));
      const a = PP.find.appointment(params.id);
      if (a && ownPro() && a.professionalId !== ownPro()) { el.innerHTML = PP.ui.empty({ icon: 'lock', title: 'Not your appointment', text: `This appointment belongs to another ${PP.t('professional').toLowerCase()}.`, action: '<a class="btn" href="#/appointments">My appointments</a>' }); return; }
      return renderAppointment(el, a);
    },
  });

  function renderRequest(el, req) {
    if (!req) { el.innerHTML = PP.ui.notFound(location.hash); return; }
    const svc = PP.find.service(req.serviceId);
    const sug = PP.appt.suggestPro(req);
    const sel = { pro: sug.id, date: req.date, start: req.time };
    const dups = PP.duplicateCandidates(req.mobile, req.name);
    sel.patient = req.patientId || '';
    const reviewable = req.status === 'Pending' && PP.can('requests.review');
    el.innerHTML = `${PP.ui.pageHead({ title: `Request ${req.id}`, subtitle: 'Request review and approval controls', crumbs: [['Appointments', '#/appointments'], ['Online Requests', '#/appointments/requests'], [req.id]], actions: reviewable ? `<button class="btn btn-danger" data-reject>${PP.icon('x')} Reject</button><button class="btn btn-primary" data-confirm>${PP.icon('check')} Verify slot & Confirm</button>` : '' })}
      <div class="grid req-grid">
        <div class="stack">
          ${PP.ui.card({ title: 'Request', actions: PP.ui.badge(req.status), body: `<dl class="kv">
            <dt>Patient</dt><dd><b>${esc(req.name)}</b></dd><dt>Mobile</dt><dd>${esc(req.mobile)}</dd><dt>Service</dt><dd>${esc(svc.name)} · ${svc.duration} min · ${PP.fmt.money(svc.price)}</dd>
            <dt>Preferred ${esc(PP.tl('professional'))}</dt><dd>${req.preferredProfessionalId ? esc(PP.proName(req.preferredProfessionalId)) : 'Any available'}</dd>
            <dt>Requested date</dt><dd>${PP.fmt.dateLong(req.date)}</dd><dt>Requested slot</dt><dd>${PP.fmt.time(req.time)}</dd>
            <dt>Reason / notes</dt><dd>${esc(req.notes || '—')}</dd><dt>Received</dt><dd>${PP.fmt.stamp(req.createdAt)}</dd>
            ${req.status === 'Rejected' ? `<dt>Rejection reason</dt><dd>${esc(req.rejectReason)}</dd>` : ''}
            ${req.status === 'Confirmed' ? `<dt>Appointment</dt><dd><a href="#/appointments/${req.appointmentId}">${req.appointmentId}</a></dd>` : ''}
          </dl>` })}
          ${reviewable ? PP.ui.card({ title: 'Match patient record', body: `<p class="muted small" style="margin-top:0">A mobile number can belong to more than one person, so choose the right record or create a new one.</p>
            <div class="stack" data-match>
              ${dups.map((p) => `<label class="match-opt"><input type="radio" name="pm" value="${p.id}" ${sel.patient === p.id ? 'checked' : ''}><span><b>${esc(p.name)}</b> · ${p.id}<span class="sub">${esc(p.mobile)} · ${esc(p.gender || '')} · ${PP.fmt.age(p.dob)}${p.familyGroup ? ' · family group' : ''}</span></span></label>`).join('')}
              <label class="match-opt"><input type="radio" name="pm" value="" ${!sel.patient ? 'checked' : ''}><span><b>Create a new patient</b><span class="sub">A new PAT-ID is created from this request</span></span></label>
            </div>` }) : ''}
        </div>
        ${reviewable ? PP.ui.card({ title: 'Slot to verify', body: `<div class="form-grid">
            ${PP.form.field({ name: 'pro', label: PP.t('professional'), type: 'select', placeholder: false, value: sel.pro, options: PP.db.professionals.filter((p) => p.status === 'Active').map((p) => [p.id, PP.proName(p)]) })}
            ${PP.form.field({ name: 'date', label: 'Date', type: 'date', value: sel.date, min: PP.today() })}
          </div>
          <div class="mt-4" data-avail></div>
          <div class="label mt-4">Time slots (${svc.duration} minutes)</div><div class="slot-grid mt-2" data-slots></div>
          <div class="legend mt-3"><span>Available</span><span class="l-booked">Booked / blocked</span><span class="l-selected">Selected</span></div>` }) : PP.ui.card({ title: 'Status', body: req.status === 'Confirmed' ? PP.ui.alert('positive', `Confirmed as <a href="#/appointments/${req.appointmentId}">${req.appointmentId}</a>.`) : req.status === 'Rejected' ? PP.ui.alert('error', `Rejected: ${esc(req.rejectReason)}`) : PP.ui.alert('info', 'Your role can view this request but cannot confirm it.') })}
      </div>`;
    if (!reviewable) return;
    const drawSlots = () => {
      const w = PP.sched.window(sel.pro, sel.date); const box = PP.$('[data-slots]', el); const av = PP.$('[data-avail]', el);
      if (!w || w.closed) { box.innerHTML = ''; av.innerHTML = PP.ui.alert('warning', `${esc(w ? w.reason : 'Unavailable')}. Choose another date or ${esc(PP.tl('professional'))}.`); sel.start = null; return; }
      const slots = PP.sched.slots(sel.pro, sel.date, svc.duration);
      const cur = slots.find((s) => s.start === sel.start);
      av.innerHTML = cur ? (cur.free ? PP.ui.alert('positive', `<b>Slot available.</b> ${esc(PP.proName(sel.pro))} is free at ${PP.fmt.time(sel.start)} on ${PP.fmt.date(sel.date)}.`) : PP.ui.alert('error', `<b>Conflict:</b> ${esc(cur.reason)}. Choose another slot.`)) : PP.ui.alert('info', 'Select a time slot.');
      box.innerHTML = slots.map((s) => `<button type="button" class="slot ${s.free ? '' : 'booked'} ${sel.start === s.start ? 'selected' : ''}" data-s="${s.start}" ${s.free ? '' : `title="${esc(s.reason)}"`}>${PP.fmt.time(s.start)}</button>`).join('');
      PP.$$('[data-s]', box).forEach((b) => b.addEventListener('click', () => { sel.start = b.dataset.s; drawSlots(); }));
    };
    PP.$('[name=pro]', el).addEventListener('change', (e) => { sel.pro = e.target.value; drawSlots(); });
    PP.$('[name=date]', el).addEventListener('change', (e) => { sel.date = e.target.value; sel.start = null; drawSlots(); });
    PP.$$('[name=pm]', el).forEach((r) => r.addEventListener('change', () => { sel.patient = r.value; }));
    drawSlots();
    PP.$('[data-reject]', el).addEventListener('click', () => rejectFlow(req, () => PP.render()));
    PP.$('[data-confirm]', el).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, async () => {
      if (!sel.start) { PP.ui.toast('Select a time slot first.', 'warning'); return; }
      const res = PP.appt.confirmRequest(req, { professionalId: sel.pro, date: sel.date, start: sel.start, patientId: sel.patient || null });
      if (!res.ok) { PP.ui.toast(`Cannot confirm: ${esc(res.conflicts[0])}`, 'error', 5000); drawSlots(); return; }
      PP.ui.toast(`Confirmed. ${res.appointment.id} is booked and a confirmation SMS is queued (simulated).`);
      PP.go(`#/appointments/${res.appointment.id}`);
    }, 600));
  }

  function renderAppointment(el, a) {
    if (!a) { el.innerHTML = PP.ui.notFound(location.hash); return; }
    const p = PP.find.patient(a.patientId) || {}; const svc = PP.find.service(a.serviceId) || {};
    const inv = PP.db.invoices.find((i) => i.appointmentId === a.id); const visit = PP.db.visits.find((v) => v.appointmentId === a.id);
    const acts = PP.can('appointments.manage') || PP.can('clinical.write') ? statusActions(a) : [];
    el.innerHTML = `${PP.ui.pageHead({ title: `${a.id}`, subtitle: `${esc(svc.name || '')} · ${PP.fmt.dateLong(a.date)} · ${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)}`, crumbs: [['Appointments', '#/appointments'], [a.id]],
      actions: `${PP.can('appointments.manage') && !['Completed', 'Cancelled', 'No-show'].includes(a.status) ? `<a class="btn" href="#/appointments/${a.id}/edit">${PP.icon('edit')} Edit</a>` : ''}${acts.slice(0, 2).map(([s, l, ic], i) => `<button class="btn ${i === 0 ? 'btn-primary' : ''}" data-act="${s}">${PP.icon(ic)} ${l}</button>`).join('')}${acts.length > 2 ? `<span class="rel"><button class="btn" data-more>${PP.icon('more')} More</button></span>` : ''}` })}
      <div class="grid appt-grid">
        <div class="stack">
          ${a.changeRequest && (a.changeRequest.status || 'Pending') === 'Pending' ? `<div data-change>${PP.ui.alert('warning', `<b>Patient asked to ${esc(String(a.changeRequest.type).toLowerCase() === 'reschedule' ? 'reschedule' : 'cancel')} this appointment</b> (from the patient app, ${PP.fmt.stamp(a.changeRequest.at)}).${a.changeRequest.reason ? ` Reason: ${esc(a.changeRequest.reason)}.` : ''}${a.changeRequest.requestId ? ` New time requested in <a href="#/appointments/${a.changeRequest.requestId}">${a.changeRequest.requestId}</a>.` : ''}`)}${PP.can('appointments.manage') ? `<div class="row mt-2">${String(a.changeRequest.type).toLowerCase() !== 'reschedule' ? '<button class="btn btn-danger btn-sm" data-cr-approve>Approve cancellation</button>' : ''}<button class="btn btn-sm" data-cr-dismiss>Keep appointment</button></div>` : ''}</div>` : ''}
          ${PP.ui.card({ title: 'Appointment', actions: PP.ui.badge(a.status), body: `<dl class="kv">
            <dt>Patient</dt><dd><a href="#/patients/${p.id}"><b>${esc(p.name)}</b></a> · ${p.id}</dd><dt>Mobile</dt><dd>${esc(p.mobile || '—')}</dd>
            <dt>${esc(PP.t('professional'))}</dt><dd>${esc(PP.proName(a.professionalId))}</dd><dt>Service</dt><dd>${esc(svc.name)} · ${svc.duration} min · ${PP.fmt.money(svc.price)}</dd>
            <dt>Date</dt><dd>${PP.fmt.dateLong(a.date)}</dd><dt>Time</dt><dd>${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)}${a.serialNo ? ` · Serial #${a.serialNo}` : ''}</dd>
            <dt>Branch / room</dt><dd>${esc(PP.branchName(a.branchId))} · ${esc((PP.find.room(a.roomId) || {}).name || '—')}</dd>
            ${a.visitType === 'Home visit' ? `<dt>Home visit</dt><dd>${esc(a.homeAddress || '')} · travel ${PP.fmt.money(a.travelCharge || 0)}</dd>` : ''}
            <dt>Source</dt><dd>${esc(a.source)}${a.requestId ? ` (<a href="#/appointments/${a.requestId}">${a.requestId}</a>)` : ''}</dd>
            <dt>Notes</dt><dd>${esc(a.notes || '—')}</dd>${a.cancelReason ? `<dt>Reason</dt><dd>${esc(a.cancelReason)}</dd>` : ''}
          </dl>` })}
          ${PP.ui.card({ title: 'Status history', body: `<ul class="timeline">${(a.history && a.history.length ? a.history : [{ at: a.createdAt, status: a.status, note: 'Created', by: 'Front desk' }]).slice().reverse().map((h) => `<li><div class="tl-date">${PP.fmt.dateShort(PP.isoOf(new Date(h.at)))}</div><div class="tl-body">${PP.ui.badge(h.status)} <span class="small muted">${PP.fmt.stamp(h.at)} · ${esc(h.by || '')}</span>${h.note ? `<div class="small">${esc(h.note)}</div>` : ''}</div></li>`).join('')}</ul>` })}
        </div>
        <div class="stack">
          ${PP.ui.card({ title: 'Patient', body: `<div class="row"><span class="avatar lg">${esc(PP.initials(p.name))}</span><div><b>${esc(p.name)}</b><div class="small muted">${p.id} · ${esc(p.gender || '')} · ${PP.fmt.age(p.dob)}</div>${p.allergies && p.allergies !== 'None known' ? `<div class="mt-2"><span class="badge error">Allergy: ${esc(p.allergies)}</span></div>` : ''}</div></div><div class="mt-3 row"><a class="btn btn-sm" href="#/patients/${p.id}">Open profile</a></div>` })}
          ${PP.ui.card({ title: 'Next steps', body: `<div class="stack">
            ${visit ? `<a class="btn" href="#/visits/${visit.id}">${PP.icon('clipboard')} View clinical visit ${visit.id}</a>` : PP.can('clinical.write') ? `<a class="btn" href="#/visits/new?patient=${p.id}&appointment=${a.id}">${PP.icon('clipboard')} Record clinical visit</a>` : ''}
            ${inv ? `<a class="btn" href="#/billing/${inv.id}">${PP.icon('receipt')} Invoice ${inv.id} · ${PP.ui.badge(PP.bill.totals(inv).status)}</a>` : PP.can('billing.manage') ? `<a class="btn" href="#/billing/new?patient=${p.id}&appointment=${a.id}">${PP.icon('receipt')} Create invoice</a>` : ''}
            ${PP.can('appointments.manage') ? `<a class="btn" href="#/appointments/new?patient=${p.id}">${PP.icon('calendar')} Book follow-up</a>` : ''}
          </div>` })}
        </div>
      </div>`;
    PP.$$('[data-act]', el).forEach((b) => b.addEventListener('click', () => runAction(a, b.dataset.act, () => PP.render())));
    const crOk = PP.$('[data-cr-approve]', el);
    if (crOk) crOk.addEventListener('click', () => { a.cancelReason = (a.changeRequest && a.changeRequest.reason) || 'Patient request'; delete a.changeRequest; PP.appt.setStatus(a, 'Cancelled', 'Cancelled at the patient\'s request'); PP.ui.toast(`${a.id} cancelled. Cancellation SMS queued (simulated).`); PP.render(); });
    const crNo = PP.$('[data-cr-dismiss]', el);
    if (crNo) crNo.addEventListener('click', () => { PP.appt.history(a, a.status, 'Patient change request declined'); delete a.changeRequest; PP.audit('Patient change request declined', a.id); PP.save(); PP.ui.toast('Change request dismissed; the appointment stays as it is.'); PP.render(); });
    const more = PP.$('[data-more]', el);
    if (more) more.addEventListener('click', () => PP.ui.dropdown(more, acts.slice(2).map(([s, l, ic]) => `<button class="dd-item" data-act2="${s}">${PP.icon(ic, 'style="width:16px"')} ${l}</button>`).join(''), (dd) => PP.$$('[data-act2]', dd).forEach((x) => x.addEventListener('click', () => { dd.remove(); runAction(a, x.dataset.act2, () => PP.render()); }))));
  }

  /* ------------------------------------------------------------ Create / edit (screen 07 + Reference C stepper) */
  PP.route('/appointments/new', { title: 'Add Appointment', perm: 'appointments.manage', render: (ctx) => renderForm(ctx, null) });
  PP.route('/appointments/:id/edit', { title: 'Edit Appointment', perm: 'appointments.manage', render: (ctx) => renderForm(ctx, PP.find.appointment(ctx.params.id)) });

  function renderForm({ el, query }, existing) {
    const pros = PP.appt.bookable();
    const firstPro = PP.find.professional(query.pro) || pros[0];
    const s = existing ? {
      step: 2, patientId: existing.patientId, mode: 'existing', serviceId: existing.serviceId, pro: existing.professionalId, date: existing.date, start: existing.start, custom: false,
      status: existing.status, notes: existing.notes, visitType: existing.visitType || 'In clinic', homeAddress: existing.homeAddress || '', travel: existing.travelCharge || 0, booking: existing.serialNo ? 'serial' : 'slot', repeat: 1, roomId: existing.roomId,
    } : {
      step: query.patient ? 2 : 1, patientId: query.patient || '', mode: 'existing', serviceId: '', pro: firstPro ? firstPro.id : '', date: query.date || PP.today(), start: query.time || null, custom: false,
      status: 'Confirmed', notes: '', visitType: 'In clinic', homeAddress: '', travel: 0, booking: 'slot', repeat: 1, roomId: '', newPatient: {},
    };
    const svcList = () => PP.db.services.filter((x) => x.status === 'Active' && !x.isPackage);
    const svc = () => PP.find.service(s.serviceId);
    const end = () => (svc() && s.start ? PP.fromMin(PP.toMin(s.start) + svc().duration) : null);
    const conflicts = () => (svc() && s.start ? PP.sched.conflicts(s.pro, s.date, s.start, end(), existing && existing.id) : []);

    el.innerHTML = `${PP.ui.pageHead({ title: existing ? `Edit ${existing.id}` : 'Add Appointment (Manual Booking)', subtitle: 'Admin booking form with conflict validation', crumbs: [['Appointments', '#/appointments'], [existing ? existing.id : 'Add Appointment']] })}
      <div class="grid form-split"><div class="card"><div class="card-body"><div data-stepper></div><div class="mt-5" data-step></div></div></div>
      <aside class="stack"><div data-summary></div><div data-availability></div></aside></div>`;

    const drawStepper = () => {
      const steps = ['Patient Info', 'Appointment Details', 'Confirmation'];
      PP.$('[data-stepper]', el).innerHTML = `<div class="stepper">${steps.map((t, i) => `${i ? '<span class="line"></span>' : ''}<span class="step ${s.step === i + 1 ? 'active' : s.step > i + 1 ? 'done' : ''}"><span class="num">${s.step > i + 1 ? '✓' : i + 1}</span><span class="hide-sm">${t}</span></span>`).join('')}</div>`;
    };
    const drawSummary = () => {
      const p = PP.find.patient(s.patientId); const sv = svc(); const c = conflicts();
      PP.$('[data-summary]', el).innerHTML = PP.ui.card({ title: 'Appointment Summary', body: `<dl class="kv kv-tight">
        <dt>Patient</dt><dd>${p ? `${esc(p.name)} (${p.id})` : s.mode === 'new' && s.newPatient.name ? `${esc(s.newPatient.name)} (new)` : '<span class="muted">Not selected</span>'}</dd>
        <dt>Service</dt><dd>${sv ? esc(sv.name) : '<span class="muted">—</span>'}</dd>
        <dt>${esc(PP.t('professional'))}</dt><dd>${s.pro ? esc(PP.proName(s.pro)) : '—'}</dd>
        <dt>Date</dt><dd>${PP.fmt.dateLong(s.date)}</dd>
        <dt>Time</dt><dd>${s.start ? `${PP.fmt.time(s.start)} – ${PP.fmt.time(end())}${sv ? ` (${sv.duration} min)` : ''}` : '<span class="muted">—</span>'}</dd>
        ${s.visitType === 'Home visit' ? `<dt>Visit</dt><dd>Home visit · travel ${PP.fmt.money(s.travel)}</dd>` : ''}
        ${s.repeat > 1 ? `<dt>Repeats</dt><dd>Weekly × ${s.repeat}</dd>` : ''}
        <dt>Status</dt><dd>${PP.ui.badge(s.status)}</dd></dl>` });
      PP.$('[data-availability]', el).innerHTML = PP.ui.card({ title: 'Slot Availability', body: !s.start || !sv ? PP.ui.alert('info', 'Choose a service, date and time to check availability.') : c.length ? PP.ui.alert('error', `<b>Not available.</b> ${c.map(esc).join('<br>')}`) : PP.ui.alert('positive', `<b>Slot Available</b><br>${esc(PP.proName(s.pro))} has an available slot at ${PP.fmt.time(s.start)} – ${PP.fmt.time(end())} on ${PP.fmt.date(s.date)}.`) });
    };

    const drawStep = () => {
      drawStepper(); drawSummary();
      const box = PP.$('[data-step]', el);
      if (s.step === 1) {
        box.innerHTML = `<h3 class="sec-title">${PP.icon('user')} Patient Information</h3>
          <div class="row mt-3"><label class="check"><input type="radio" name="mode" value="existing" ${s.mode === 'existing' ? 'checked' : ''}> Existing Patient</label><label class="check"><input type="radio" name="mode" value="new" ${s.mode === 'new' ? 'checked' : ''}> New Patient</label></div>
          <div data-mode class="mt-4"></div>
          <div class="form-actions"><a class="btn" href="#/appointments">Cancel</a><button class="btn btn-primary" data-next>Next: Appointment Details ${PP.icon('arrowR')}</button></div>`;
        const drawMode = () => {
          const m = PP.$('[data-mode]', box);
          if (s.mode === 'existing') {
            const p = PP.find.patient(s.patientId);
            m.innerHTML = `<div class="field"><label for="psearch">Search Patient<span class="req">*</span></label><div class="input-icon">${PP.icon('search')}<input id="psearch" class="input" placeholder="Type a name, PAT-ID or mobile" autocomplete="off" value="${p ? esc(`${p.name} (${p.id})`) : ''}"></div><div class="error">Select a patient.</div></div><div class="psearch-results" data-res></div>
              ${p ? `<div class="pcard mt-3"><span class="avatar lg">${esc(PP.initials(p.name))}</span><div class="pcard-grid"><div><b>${esc(p.name)}</b><span class="sub">${p.id}</span></div><div><span class="sub">Mobile</span>${esc(p.mobile)}</div><div><span class="sub">Gender</span>${esc(p.gender || '—')}</div><div><span class="sub">Age</span>${PP.fmt.age(p.dob)}</div></div></div>` : ''}`;
            const inp = PP.$('#psearch', m); const res = PP.$('[data-res]', m);
            inp.addEventListener('input', () => {
              const q = inp.value.trim().toLowerCase(); if (q.length < 2) { res.innerHTML = ''; return; }
              const hits = PP.db.patients.filter((x) => !x.mergedInto && `${x.name} ${x.id} ${x.mobile}`.toLowerCase().includes(q)).slice(0, 6);
              res.innerHTML = hits.length ? hits.map((x) => `<button type="button" class="psr" data-pid="${x.id}"><b>${esc(x.name)}</b> <span class="muted small">${x.id} · ${esc(x.mobile)}</span></button>`).join('') : `<div class="small muted" style="padding:8px">No patient found. <a href="#" data-switch>Register a new patient</a>.</div>`;
              PP.$$('[data-pid]', res).forEach((b) => b.addEventListener('click', () => { s.patientId = b.dataset.pid; drawMode(); drawSummary(); }));
              const sw = PP.$('[data-switch]', res); if (sw) sw.addEventListener('click', (e) => { e.preventDefault(); s.mode = 'new'; s.newPatient.name = inp.value; PP.$('[value=new]', box).checked = true; drawMode(); });
            });
          } else {
            m.innerHTML = `<form class="form-grid" data-np onsubmit="return false">
              ${PP.form.field({ name: 'name', label: 'Full name', required: true, value: s.newPatient.name || '' })}
              ${PP.form.field({ name: 'mobile', label: 'Mobile number', required: true, rule: 'mobile', placeholder: '01XXXXXXXXX', value: s.newPatient.mobile || '' })}
              <div class="full np-row3">
              ${PP.form.field({ name: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other'], value: s.newPatient.gender || '' })}
              ${PP.form.field({ name: 'ageYears', label: 'বয়স — বছর (Age, years)', type: 'number', min: 0, max: 120, step: 1, value: s.newPatient.ageYears != null ? s.newPatient.ageYears : '', placeholder: 'e.g. 35' })}
              ${PP.form.field({ name: 'ageMonths', label: 'মাস (months)', type: 'select', placeholder: false, options: Array.from({ length: 12 }, (_, i) => [String(i), i + ' month' + (i === 1 ? '' : 's')]), value: String(s.newPatient.ageMonths || 0) })}
              </div>
              ${PP.form.field({ name: 'weightKg', label: 'ওজন — কেজি (Weight, kg)', type: 'number', min: 1, max: 300, step: 0.1, value: s.newPatient.weightKg || '', placeholder: 'e.g. 62' })}
              ${PP.form.field({ name: 'heightCm', label: 'উচ্চতা — সেমি (Height, cm)', type: 'number', min: 30, max: 250, step: 0.5, value: s.newPatient.heightCm || '', placeholder: 'e.g. 165', hint: '<span data-ftin>ফুট-ইঞ্চিতে দেখাবে</span>' })}
              <div class="full" data-dup></div></form>`;
            const f = PP.$('[data-np]', m);
            const check = () => {
              const v = PP.form.read(f); const d = PP.duplicateCandidates(v.mobile, v.name);
              PP.$('[data-dup]', f).innerHTML = d.length ? PP.ui.alert('warning', `<b>Possible existing patient.</b> ${d.map((x) => `<a href="#" data-use="${x.id}">${esc(x.name)} (${x.id})</a>`).join(', ')} share this ${d.some((x) => x.mobile.replace(/\D/g, '') === (v.mobile || '').replace(/\D/g, '')) ? 'mobile number' : 'name'}. Use the existing record, or continue to register a new patient (family members can share a number).`) : '';
              PP.$$('[data-use]', f).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); s.mode = 'existing'; s.patientId = a.dataset.use; PP.$('[value=existing]', box).checked = true; drawMode(); drawSummary(); }));
            };
            const ftin = () => { const cm = Number(PP.$('[name=heightCm]', f).value); const el = PP.$('[data-ftin]', f); if (el) el.textContent = cm > 0 ? `≈ ${Math.floor(cm / 30.48)} ফুট ${Math.round((cm / 2.54) % 12)} ইঞ্চি` : 'ফুট-ইঞ্চিতে দেখাবে'; };
            PP.$$('input, select', f).forEach((i) => i.addEventListener('change', () => { s.newPatient = PP.form.read(f); check(); drawSummary(); }));
            PP.$('[name=heightCm]', f).addEventListener('input', ftin); ftin();
            check();
          }
        };
        PP.$$('[name=mode]', box).forEach((r) => r.addEventListener('change', () => { s.mode = r.value; drawMode(); }));
        drawMode();
        PP.$('[data-next]', box).addEventListener('click', () => {
          if (s.mode === 'existing') { if (!s.patientId) { const f = PP.$('.field', box); f.classList.add('has-error'); PP.$('#psearch', box).focus(); return; } }
          else {
            const f = PP.$('[data-np]', box); if (!PP.form.validate(f)) return; const v = PP.form.read(f);
            if (v.ageYears !== '' && (Number(v.ageYears) < 0 || Number(v.ageYears) > 120)) { PP.form.setError(f, 'ageYears', 'Enter an age between 0 and 120 years.'); return; }
            if (v.weightKg !== '' && (Number(v.weightKg) <= 0 || Number(v.weightKg) > 300)) { PP.form.setError(f, 'weightKg', 'Enter a weight between 1 and 300 kg.'); return; }
            if (v.heightCm !== '' && (Number(v.heightCm) < 30 || Number(v.heightCm) > 250)) { PP.form.setError(f, 'heightCm', 'Enter a height between 30 and 250 cm.'); return; }
            s.newPatient = v;
          }
          s.step = 2; drawStep();
        });
      } else if (s.step === 2) {
        const pro = PP.find.professional(s.pro);
        box.innerHTML = `<h3 class="sec-title">${PP.icon('calendar')} Appointment Details</h3>
          <form class="form-grid mt-3" data-det onsubmit="return false">
            ${PP.form.field({ name: 'serviceId', label: 'Service', type: 'select', required: true, value: s.serviceId, options: svcList().map((x) => [x.id, `${x.name} · ${x.duration} min · ${PP.fmt.money(x.price)}`]) })}
            ${PP.form.field({ name: 'pro', label: PP.t('professional'), type: 'select', required: true, value: s.pro, placeholder: false, options: pros.map((p) => [p.id, `${PP.proName(p)} · ${p.designation}`]) })}
            ${PP.form.field({ name: 'date', label: 'Appointment Date', type: 'date', required: true, value: s.date, min: existing ? null : PP.today() })}
            ${PP.form.field({ name: 'booking', label: 'Booking mode', type: 'select', placeholder: false, value: s.booking, options: [['slot', 'Time slot'], ['serial', 'Serial number (next available)']], hint: 'Serial booking gives the next serial number and its estimated time.' })}
            ${PP.form.field({ name: 'visitType', label: 'Visit type', type: 'select', placeholder: false, value: s.visitType, options: ['In clinic', 'Home visit'] })}
            ${PP.form.field({ name: 'roomId', label: 'Room', type: 'select', value: s.roomId || '', placeholder: 'Auto (first free room)', options: PP.db.rooms.filter((r) => pro && r.branchId === pro.branchId).map((r) => [r.id, r.name]) })}
            <div class="full ${s.visitType === 'Home visit' ? '' : 'hidden'}" data-home><div class="form-grid">${PP.form.field({ name: 'homeAddress', label: 'Home address', required: s.visitType === 'Home visit', value: s.homeAddress })}${PP.form.field({ name: 'travel', label: 'Travel charge (BDT)', type: 'number', min: 0, value: s.travel, rule: 'nonneg' })}</div></div>
            <div class="full"><div class="row between"><div class="label">Time Slot<span class="req">*</span></div><label class="check small"><input type="checkbox" data-custom ${s.custom ? 'checked' : ''}> Enter a custom start time</label></div>
              <div class="mt-2" data-slotbox></div></div>
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', required: true, placeholder: false, value: s.status, options: ['Pending', 'Scheduled', 'Confirmed'] })}
            ${existing ? '' : PP.form.field({ name: 'repeat', label: 'Repeat weekly', type: 'select', placeholder: false, value: String(s.repeat), options: [['1', 'Does not repeat'], ['4', 'Weekly × 4'], ['6', 'Weekly × 6'], ['8', 'Weekly × 8']] })}
            ${PP.form.field({ name: 'notes', label: 'Reason / Notes', type: 'textarea', full: true, value: s.notes, placeholder: 'e.g. Follow-up session. Patient has mild knee pain.', attrs: 'maxlength="250"' })}
          </form>
          <div class="form-actions"><button class="btn" data-back>${PP.icon('chevL')} Back</button><button class="btn btn-primary" data-next>Next: Confirmation ${PP.icon('arrowR')}</button></div>`;
        const f = PP.$('[data-det]', box);
        const drawSlots = () => {
          const sb = PP.$('[data-slotbox]', box); const sv = svc();
          if (!sv) { sb.innerHTML = '<div class="small muted">Choose a service first.</div>'; return; }
          const w = PP.sched.window(s.pro, s.date);
          if (!w || w.closed) { sb.innerHTML = PP.ui.alert('warning', `${esc(w ? w.reason : 'Unavailable')}. Choose another date or ${esc(PP.tl('professional'))}.`); return; }
          const slots = PP.sched.slots(s.pro, s.date, sv.duration, existing && existing.id);
          if (s.booking === 'serial') {
            const taken = PP.db.appointments.filter((a) => a.professionalId === s.pro && a.date === s.date && a.serialNo).length;
            const next = slots.find((x) => x.free && (s.date !== PP.today() || PP.toMin(x.start) >= PP.toMin(PP.nowTime())));
            if (next) { s.start = next.start; s.serialNo = taken + 1; }
            sb.innerHTML = next ? PP.ui.alert('positive', `<b>Serial #${taken + 1}</b> for ${PP.fmt.date(s.date)} · estimated time ${PP.fmt.time(next.start)}.`) : PP.ui.alert('warning', 'No serial left on this date.');
            drawSummary(); return;
          }
          s.serialNo = null;
          if (s.custom) {
            sb.innerHTML = `<div class="form-grid">${PP.form.field({ name: 'start', label: 'Start time', type: 'time', value: s.start || '' })}<div class="field"><label>End time</label><input class="input" readonly value="${end() ? PP.fmt.time(end()) : ''}" aria-label="End time"></div></div>`;
            PP.$('[name=start]', sb).addEventListener('change', (e) => { s.start = e.target.value; drawSlots(); drawSummary(); });
            return;
          }
          sb.innerHTML = `<div class="slot-grid">${slots.map((x) => `<button type="button" class="slot ${x.free ? '' : 'booked'} ${s.start === x.start ? 'selected' : ''}" data-s="${x.start}" ${x.free ? '' : `disabled title="${esc(x.reason)}"`}>${PP.fmt.time(x.start)}</button>`).join('') || '<span class="muted">No slots</span>'}</div><div class="legend mt-3"><span>Available</span><span class="l-booked">Booked / blocked</span><span class="l-selected">Selected</span></div>`;
          PP.$$('[data-s]', sb).forEach((b) => b.addEventListener('click', () => { s.start = b.dataset.s; drawSlots(); drawSummary(); }));
        };
        f.addEventListener('change', (e) => {
          const v = PP.form.read(f);
          if (e.target.name === 'pro' || e.target.name === 'date' || e.target.name === 'serviceId') { if (!s.custom) s.start = null; }
          Object.assign(s, { serviceId: v.serviceId, pro: v.pro, date: v.date, status: v.status, notes: v.notes, visitType: v.visitType, homeAddress: v.homeAddress || '', travel: Number(v.travel || 0), booking: v.booking, repeat: Number(v.repeat || 1), roomId: v.roomId });
          if (e.target.name === 'pro') { drawStep(); return; }
          if (e.target.name === 'serviceId' && svc() && svc().homeVisit) { s.visitType = 'Home visit'; s.travel = svc().travelCharge || 0; drawStep(); return; }
          PP.$('[data-home]', f).classList.toggle('hidden', s.visitType !== 'Home visit');
          drawSlots(); drawSummary();
        });
        PP.$('[data-custom]', box).addEventListener('change', (e) => { s.custom = e.target.checked; drawSlots(); });
        drawSlots();
        PP.$('[data-back]', box).addEventListener('click', () => { if (existing) PP.go(`#/appointments/${existing.id}`); else { s.step = 1; drawStep(); } });
        PP.$('[data-next]', box).addEventListener('click', () => {
          if (!PP.form.validate(f)) return;
          if (!s.start) { PP.ui.toast('Select a time slot.', 'warning'); return; }
          const c = conflicts(); if (c.length) { PP.ui.toast(`Conflict: ${esc(c[0])}`, 'error', 5000); return; }
          s.step = 3; drawStep();
        });
      } else {
        const p = PP.find.patient(s.patientId); const sv = svc();
        const dates = Array.from({ length: s.repeat || 1 }, (_, i) => PP.addDays(s.date, i * 7));
        const repeatChecks = dates.map((d) => ({ d, c: PP.sched.conflicts(s.pro, d, s.start, end(), existing && existing.id) }));
        box.innerHTML = `<h3 class="sec-title">${PP.icon('checkCircle')} Confirmation</h3>
          <p class="muted">Review the booking. The conflict check runs again when you save, so two people cannot book the same slot.</p>
          <dl class="kv mt-3"><dt>Patient</dt><dd>${p ? `${esc(p.name)} · ${p.id}` : `${esc(s.newPatient.name)} · <span class="badge info">New patient</span>`}</dd>
            <dt>Service</dt><dd>${esc(sv.name)} · ${PP.fmt.money(sv.price)}</dd><dt>${esc(PP.t('professional'))}</dt><dd>${esc(PP.proName(s.pro))}</dd>
            <dt>When</dt><dd>${PP.fmt.dateLong(s.date)} · ${PP.fmt.time(s.start)} – ${PP.fmt.time(end())}${s.serialNo ? ` · Serial #${s.serialNo}` : ''}</dd>
            <dt>Status</dt><dd>${PP.ui.badge(s.status)}</dd>${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ''}</dl>
          ${dates.length > 1 ? `<div class="mt-4"><div class="label">Weekly repeats</div><ul class="list mt-2 card">${repeatChecks.map((x) => `<li>${PP.fmt.dateLong(x.d)} <span class="spacer"></span>${x.c.length ? `<span class="badge error">Skipped: ${esc(x.c[0])}</span>` : '<span class="badge positive">Free</span>'}</li>`).join('')}</ul></div>` : ''}
          <label class="check mt-4"><input type="checkbox" data-sms checked> Send ${s.status === 'Confirmed' ? 'confirmation' : 'booking'} SMS to the patient (simulated)</label>
          <div class="form-actions"><button class="btn" data-back>${PP.icon('chevL')} Back</button><button class="btn btn-primary" data-save>${PP.icon('check')} ${existing ? 'Save changes' : 'Save appointment'}</button></div>`;
        PP.$('[data-back]', box).addEventListener('click', () => { s.step = 2; drawStep(); });
        PP.$('[data-save]', box).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, async () => {
          const c = conflicts(); if (c.length) { PP.ui.toast(`Someone just booked this slot: ${esc(c[0])}`, 'error', 5000); s.step = 2; drawStep(); return; }
          let pid = s.patientId;
          if (!pid) {
            const np = { id: PP.nextId('PAT'), name: s.newPatient.name, gender: s.newPatient.gender || '', dob: PP.dobFromAge(s.newPatient.ageYears, s.newPatient.ageMonths), dobApprox: s.newPatient.ageYears !== '' && s.newPatient.ageYears != null, ageRecordedOn: PP.today(), weightKg: s.newPatient.weightKg ? Number(s.newPatient.weightKg) : null, heightCm: s.newPatient.heightCm ? Number(s.newPatient.heightCm) : null, mobile: s.newPatient.mobile.replace(/\D/g, ''), email: '', address: s.homeAddress || '', emergencyContact: '', assignedProfessionalId: s.pro, branchId: PP.find.professional(s.pro).branchId, referralSource: 'Walk-in', bloodGroup: '', medicalHistory: '', allergies: '', previousTreatments: '', notes: '', registeredAt: PP.today(), familyGroup: null, customFields: {}, status: 'Active' };
            PP.db.patients.push(np); pid = np.id; PP.audit('Patient registered', np.id, 'From manual booking');
          }
          const pro = PP.find.professional(s.pro);
          const room = s.roomId || PP.appt.defaultRoom(pro);
          const extra = { visitType: s.visitType, homeAddress: s.visitType === 'Home visit' ? s.homeAddress : '', travelCharge: s.visitType === 'Home visit' ? s.travel : 0, serialNo: s.serialNo || null };
          if (existing) {
            Object.assign(existing, { patientId: pid, serviceId: s.serviceId, professionalId: s.pro, branchId: pro.branchId, roomId: room, date: s.date, start: s.start, end: end(), status: s.status, notes: s.notes }, extra);
            PP.appt.history(existing, s.status, 'Edited'); PP.audit('Appointment edited', existing.id); PP.save();
            PP.ui.toast(`${existing.id} updated.`); PP.go(`#/appointments/${existing.id}`); return;
          }
          const made = [];
          repeatChecks.filter((x) => !x.c.length || x.d === s.date).forEach((x) => {
            const a = { id: PP.nextId('APT'), patientId: pid, professionalId: s.pro, serviceId: s.serviceId, branchId: pro.branchId, roomId: room, date: x.d, start: s.start, end: end(), status: s.status, source: 'Front desk', notes: s.notes, createdAt: PP.nowStamp(), history: [] };
            Object.assign(a, extra); PP.appt.history(a, s.status, made.length ? 'Weekly repeat' : 'Created'); PP.db.appointments.push(a); made.push(a);
          });
          PP.audit('Appointment created', made.map((a) => a.id).join(', '), `${PP.patientName(pid)} · ${PP.proName(pro)}`); PP.save();
          const sms = PP.$('[data-sms]', box).checked ? ' SMS queued (simulated).' : '';
          PP.ui.toast(made.length > 1 ? `${made.length} weekly appointments booked.${sms}` : `${made[0].id} booked for ${PP.fmt.dateLong(made[0].date)} at ${PP.fmt.time(made[0].start)}.${sms}`);
          PP.go(`#/appointments/${made[0].id}`);
        }, 600));
      }
    };
    drawStep();
  }
})();
