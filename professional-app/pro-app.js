/* Physio Point HTML prototype — Professional app (professional-mobile-app/screens.md, PROPOSED; scope pending PD-011).
   Mobile-first. Reads and writes the SAME clinic store as the clinic workspace:
   - start / complete session updates the appointment status;
   - a quick clinical note creates a visit (PP.db.visits), completes the appointment and can add session progress;
   - prescriptions are issued only from Approved templates and only if the professional TYPE allows it (D-020);
   - a leave request is Pending and notifies the admin; commission is shown on collected money only (D-025).
   All labels use the tenant terminology PP.t('professional') (D-010). Fictional data only (D-006). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc; const M = PP.m;
  const S = M.local('pp-pro-app', { clinic: null, userId: null, pending: null, readNtf: [] });

  /* ------------------------------------------------------------------ helpers */
  // The app keeps its own signed-in user; it never changes the clinic workspace session.
  PP.currentUser = () => (S.userId && !S.pending ? PP.find.user(S.userId) : null);
  const user = () => PP.currentUser();
  const pro = () => { const u = user(); return u ? PP.find.professional(u.professionalId) : null; };
  const ptype = () => { const p = pro(); return p ? PP.db.professionalTypes.find((t) => t.id === p.typeId) || {} : {}; };
  const T = () => PP.today();
  const P = () => PP.t('professional'); const p_ = () => PP.tl('professional');
  const dayAppts = (d) => PP.db.appointments.filter((a) => a.professionalId === pro().id && a.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const ACTIVE = ['Scheduled', 'Confirmed', 'Checked in', 'In session'];
  const myRoomId = () => { const c = {}; PP.db.appointments.filter((a) => a.professionalId === pro().id && a.roomId).forEach((a) => { c[a.roomId] = (c[a.roomId] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; };
  const queue = () => PP.db.appointments.filter((a) => a.date === T() && a.status === 'Checked in' && (a.professionalId === pro().id || (myRoomId() && a.roomId === myRoomId()))).sort((a, b) => a.start.localeCompare(b.start));
  const myPatients = () => {
    const ids = new Set(PP.db.patients.filter((p) => p.assignedProfessionalId === pro().id).map((p) => p.id));
    PP.db.appointments.forEach((a) => { if (a.professionalId === pro().id) ids.add(a.patientId); });
    return Array.from(ids).map((id) => PP.find.patient(id)).filter((p) => p && !p.mergedInto);
  };
  const hasAllergy = (p) => p.allergies && !/^none/i.test(p.allergies.trim());
  const allergyBadge = (p) => (hasAllergy(p) ? `<span class="m-allergy" title="Allergy">${PP.icon('alert')} Allergy: ${esc(p.allergies)}</span>` : '<span class="badge neutral">No known allergies</span>');
  const lastVisit = (pid) => PP.db.visits.filter((v) => v.patientId === pid).sort((a, b) => b.date.localeCompare(a.date))[0];
  const activePlan = (pid) => PP.db.sessionPlans.find((s) => s.patientId === pid && s.status === 'Active');
  const ptAvatar = (p) => `<span class="avatar">${esc(PP.initials(p ? p.name : '?'))}</span>`;
  const timeRange = (a) => `${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)}`;
  const history = (a, status, note) => { (a.history = a.history || []).push({ at: PP.nowStamp(), status, note: note || '', by: user().name }); };

  function setStatus(id, status, note) {
    M.write(() => {
      const a = PP.find.appointment(id); if (!a) return;
      a.status = status; history(a, status, note || `${P()} app`);
      PP.audit(`Appointment ${status.toLowerCase()}`, a.id, `${P()} app${note ? ' · ' + note : ''}`);
    });
  }
  async function startSession(a) {
    setStatus(a.id, 'In session');
    M.toast(`Session started · ${esc(PP.patientName(a.patientId))}`); PP.render(); M.refreshTabs();
  }
  function completeSheet(a) {
    M.sheet({ title: 'Complete session',
      body: `<p style="margin-top:0">${esc(PP.patientName(a.patientId))} · ${esc(PP.serviceName(a.serviceId))} · ${timeRange(a)}</p><p class="small muted">Write the clinical note now (recommended). It completes the appointment when you save it.</p>`,
      buttons: [{ label: 'Complete only', kind: 'ghost', onClick: async () => { await PP.sleep(350); setStatus(a.id, 'Completed', 'Completed without a note'); M.toast('Appointment completed. Remember to add the clinical note.', 'warning'); PP.render(); } },
        { label: `${PP.icon('edit')} Write note`, kind: 'primary', onClick: () => { location.hash = `#/note?apt=${a.id}`; } }] });
  }
  const actionButtons = (a) => {
    const b = [];
    if (['Scheduled', 'Confirmed', 'Checked in'].includes(a.status) && a.date === T()) b.push(`<button class="btn btn-primary" data-start="${esc(a.id)}">${PP.icon('activity')} Start session</button>`);
    if (a.status === 'In session' || (a.status === 'Checked in' && a.date === T())) b.push(`<button class="btn ${a.status === 'In session' ? 'btn-primary' : ''}" data-complete="${esc(a.id)}">${PP.icon('checkCircle')} Complete</button>`);
    if (a.status === 'Completed' && !PP.db.visits.some((v) => v.appointmentId === a.id)) b.push(`<a class="btn btn-primary" href="#/note?apt=${esc(a.id)}">${PP.icon('edit')} Add clinical note</a>`);
    return b.join('');
  };
  const bindActions = (root) => {
    PP.$$('[data-start]', root).forEach((x) => x.addEventListener('click', (e) => { e.preventDefault(); startSession(PP.find.appointment(x.dataset.start)); }));
    PP.$$('[data-complete]', root).forEach((x) => x.addEventListener('click', (e) => { e.preventDefault(); completeSheet(PP.find.appointment(x.dataset.complete)); }));
  };

  /** Notifications for this professional, derived from records (production: push from the notification engine). */
  function inbox() {
    const out = []; const p = pro(); if (!p) return out; const name = PP.proName(p);
    PP.db.leaves.filter((l) => l.professionalId === p.id && (l.createdAt || l.decidedAt)).forEach((l) => out.push({ id: `lv-${l.id}-${l.status}`, at: l.decidedAt || l.createdAt, icon: 'calendar', t: `Leave ${l.status === 'Pending' ? 'request sent' : l.status.toLowerCase()}`, s: `${PP.fmt.dateShort(l.from)} – ${PP.fmt.dateShort(l.to)} · ${l.reason}`, href: '#/availability' }));
    PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= T()).forEach((a) => {
      if (a.changeRequest && a.changeRequest.status === 'Pending') out.push({ id: `cr-${a.id}-${a.changeRequest.at}`, at: a.changeRequest.at, icon: 'repeat', t: `Patient asked to ${a.changeRequest.type.toLowerCase()}`, s: `${PP.patientName(a.patientId)} · ${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)}`, href: `#/appt/${a.id}` });
      if (a.status === 'Cancelled') out.push({ id: `cx-${a.id}`, at: (a.history && a.history.length ? a.history[a.history.length - 1].at : a.date + 'T08:00:00'), icon: 'x', t: 'Appointment cancelled', s: `${PP.patientName(a.patientId)} · ${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)}`, href: `#/appt/${a.id}` });
      else if (a.createdAt && String(a.createdAt).slice(0, 10) <= T() && PP.diffDays(String(a.createdAt).slice(0, 10), T()) <= 1 && ACTIVE.includes(a.status)) out.push({ id: `na-${a.id}`, at: a.createdAt, icon: 'plus', t: 'New appointment', s: `${PP.patientName(a.patientId)} · ${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)} · ${PP.serviceName(a.serviceId)}`, href: `#/appt/${a.id}` });
    });
    (PP.db.notifications || []).filter((n) => n.title !== 'Leave request' && (String(n.text).includes(name) || String(n.title).includes(name))).slice(0, 10).forEach((n) => out.push({ id: n.id, at: n.at, icon: 'bell', t: n.title, s: n.text, href: '#/notifications' }));
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  }
  const unread = () => inbox().filter((n) => !S.readNtf.includes(n.id)).length;

  /* ------------------------------------------------------------------ guard */
  const AUTH = ['/clinic', '/signin', '/2fa'];
  function guard(path, r) {
    if (!S.clinic) return path === '/clinic' ? null : '#/clinic';
    if (!user() || !pro()) return AUTH.includes(path) ? null : '#/signin';
    if (r && r.public) return '#/today';
    return null;
  }
  const brand = () => { const s = PP.db.settings; return `<span class="logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : PP.logoSvg}</span><span style="min-width:0"><b>${esc(s.clinicName)}</b><span>${esc(P())} app · ${esc(PP.proShort(pro()))}</span></span>`; };

  /* ================================================================== ACCESS */
  PP.route('/clinic', { sync: false, title: 'Find my clinic', public: true, chrome: 'none', render({ el }) {
    el.innerHTML = `<div class="m-auth"><div class="m-hero-ill">${M.clinicIll}</div>
      <h2>Find my clinic</h2><p class="lead">Enter your clinic’s code or web address to connect this app to your clinic’s own server.</p>
      <form class="m-form" novalidate data-f>${PP.form.field({ name: 'code', label: 'Clinic code or domain', required: true, value: S.lastCode || '', placeholder: 'e.g. PHYSIOPOINT', attrs: 'autocapitalize="characters" autocomplete="off"' })}
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('search')} Find clinic</button></form>
      <div data-out class="mt-4"></div><div class="mt-4">${M.clinicExplainer()}</div></div>`;
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(f)) return; const code = PP.form.read(f).code; S.lastCode = code; S.save();
      const out = PP.$('[data-out]', el);
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        const c = M.lookupClinic(code);
        if (!c) { PP.form.setError(f, 'code', `No clinic found for “${code}”. Ask your clinic admin for the code.`); out.innerHTML = ''; return; }
        out.innerHTML = `<div class="m-card teal"><b>${esc(c.name)}</b><div class="small muted">${esc(c.address)}</div><div class="small muted mono">Server: ${esc(c.domain)}</div><div class="m-actions"><button class="btn btn-primary" data-use>${PP.icon('check')} Connect</button></div></div>`;
        PP.$('[data-use]', out).addEventListener('click', () => { S.clinic = c; S.save(); location.hash = '#/signin'; });
      }, 650);
    });
  } });

  PP.route('/signin', { sync: false, title: 'Sign in', public: true, chrome: 'none', render({ el }) {
    const accounts = PP.db.users.filter((u) => u.status === 'Active' && u.professionalId && PP.find.professional(u.professionalId));
    let pick = S.lastUser && accounts.some((u) => u.id === S.lastUser) ? S.lastUser : (accounts[0] || {}).id;
    el.innerHTML = `<div class="m-auth"><a class="btn btn-ghost btn-sm" href="#/clinic" data-change>${PP.icon('chevL')} ${esc(S.clinic.name)}</a>
      <h2 class="mt-3">Sign in</h2><p class="lead">For ${esc(PP.tl('professionals'))} of ${esc(S.clinic.name)}.</p>
      <form class="m-form" novalidate data-f>
        <div class="field" data-field="account"><span class="label">Demo account (fictional)</span><div data-acc>${accounts.map((u) => { const p = PP.find.professional(u.professionalId); return `<button type="button" class="m-choice ${u.id === pick ? 'active' : ''}" data-u="${esc(u.id)}" aria-pressed="${u.id === pick}"><span class="avatar" style="background:${esc(p.color)}1f;color:${esc(p.color)}">${esc(PP.initials(p.name))}</span><span class="grow"><b>${esc(PP.proName(p))}</b><span class="s">${esc(u.email)} · ${esc(u.id)}</span></span></button>`; }).join('')}</div></div>
        ${PP.form.field({ name: 'password', label: 'Password', type: 'password', required: true, placeholder: 'Any password works in the prototype', attrs: 'autocomplete="current-password"' })}
        ${PP.form.field({ name: 'twostep', type: 'checkbox', label: 'Use a two-step code (recommended)', value: false, hint: 'Required when the clinic turns it on for your account.' })}
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('lock')} Sign in</button>
        <a class="small" href="#/signin" data-forgot style="text-align:center">Forgot password?</a></form></div>`;
    PP.$$('[data-u]', el).forEach((b) => b.addEventListener('click', () => { pick = b.dataset.u; PP.$$('[data-u]', el).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); }); }));
    PP.$('[data-change]', el).addEventListener('click', () => { S.clinic = null; S.save(); });
    PP.$('[data-forgot]', el).addEventListener('click', (e) => { e.preventDefault(); M.toast('Ask your clinic admin to send a reset link (prototype).', 'info'); });
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(f)) return; const d = PP.form.read(f); const u = PP.find.user(pick);
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        S.userId = u.id; S.lastUser = u.id;
        if (d.twostep || u.mfa) { S.pending = '2fa'; S.save(); location.hash = '#/2fa'; return; }
        finishSignIn('password');
      }, 600);
    });
  } });

  function finishSignIn(method) {
    S.pending = null; S.save();
    M.write(() => { const u = PP.find.user(S.userId); if (u) u.lastLogin = PP.nowStamp(); PP.audit('Signed in', S.userId, `${P()} app · ${method}`); });
    M.toast(`Welcome, ${esc(PP.proShort(pro()))}.`); location.hash = '#/today';
  }

  PP.route('/2fa', { sync: false, title: 'Two-step code', public: true, chrome: 'none', render({ el }) {
    if (!S.userId || S.pending !== '2fa') { location.replace('#/signin'); return; }
    el.innerHTML = `<div class="m-auth"><a class="btn btn-ghost btn-sm" href="#/signin" data-back>${PP.icon('chevL')} Back</a>
      <div class="m-hero-ill"><span class="avatar lg" style="width:76px;height:76px">${PP.icon('shield', 'style="width:34px;height:34px"')}</span></div>
      <h2>Two-step verification</h2><p class="lead">Enter the 6-digit code from your authenticator app.</p>
      <form novalidate data-f>${M.otpHtml()}
      <div class="small mt-2" style="color:var(--pp-error-fg);font-weight:600;min-height:18px" data-err role="alert"></div>
      <button class="btn btn-primary m-btn-block mt-3" type="submit" data-go>${PP.icon('check')} Verify</button></form><p class="m-note mt-3">Prototype: any 6 digits work.</p></div>`;
    const boxes = PP.$$('[data-otp] input', el);
    M.bindOtp(boxes);
    PP.$('[data-back]', el).addEventListener('click', () => { S.userId = null; S.pending = null; S.save(); });
    PP.$('[data-f]', el).addEventListener('submit', async (e) => {
      e.preventDefault(); const code = boxes.map((b) => b.value).join('');
      if (!/^\d{6}$/.test(code)) { PP.$('[data-otp]', el).classList.add('has-error'); PP.$('[data-err]', el).textContent = 'Enter all 6 digits.'; return; }
      await PP.ui.busy(PP.$('[data-go]', el), () => finishSignIn('password + two-step code'), 500);
    });
  } });

  /* ================================================================== TODAY */
  PP.route('/today', { title: 'Today', tab: 'today', render({ el, query }) {
    const d = query.d || T(); const list = dayAppts(d); const isToday = d === T();
    const done = list.filter((a) => a.status === 'Completed').length; const q = isToday ? queue() : [];
    const live = list.filter((a) => ACTIVE.includes(a.status));
    const next = list.find((a) => a.status === 'In session') || list.find((a) => a.status === 'Checked in') || live.find((a) => a.end > PP.nowTime() || !isToday);
    const room = PP.find.room(myRoomId());
    const w = PP.sched.window(pro().id, d);
    el.innerHTML = `<div class="m-hello"><h2>${isToday ? 'Today' : PP.fmt.dateLong(d)}</h2><p>${isToday ? PP.fmt.dateLong(d) + ' · ' : ''}${w && !w.closed ? `${PP.fmt.time(w.start)} – ${PP.fmt.time(w.end)}${w.breakStart ? ` · break ${PP.fmt.time(w.breakStart)}` : ''}` : esc((w && w.reason) || '')}</p></div>
      ${M.dayChips(PP.addDays(T(), -1), 8, d)}
      <div class="m-stats mt-2"><div class="m-stat"><b class="mono">${list.filter((a) => a.status !== 'Cancelled').length}</b><span>Appointments</span></div><div class="m-stat tone-positive"><b class="mono">${done}</b><span>Completed</span></div><div class="m-stat tone-info"><b class="mono">${q.length}</b><span>Waiting</span></div></div>
      ${next ? `${M.sec(next.status === 'In session' ? 'In session now' : 'Next patient')}<div class="m-card ${next.status === 'In session' ? 'hero' : ''}">
          <div class="row between"><span class="small" style="font-weight:700">${timeRange(next)}</span>${PP.ui.badge(next.status)}</div>
          <div class="row mt-2" style="flex-wrap:nowrap">${ptAvatar(PP.find.patient(next.patientId))}<div style="min-width:0"><b style="font-size:16px">${esc(PP.patientName(next.patientId))}</b><div class="small ${next.status === 'In session' ? '' : 'muted'}">${esc(PP.serviceName(next.serviceId))} · <span class="mono">${esc(next.patientId)}</span></div></div></div>
          ${(() => { const p = PP.find.patient(next.patientId); const lv = lastVisit(next.patientId); return `<div class="m-badges mt-2">${p && hasAllergy(p) ? allergyBadge(p) : ''}${lv ? `<span class="badge neutral">Last pain ${lv.painScale}/10 · ${PP.fmt.dateShort(lv.date)}</span>` : '<span class="badge lavender">First visit</span>'}</div>`; })()}
          <div class="m-actions">${actionButtons(next)}<a class="btn" href="#/patient/${esc(next.patientId)}">${PP.icon('user')} Patient</a></div></div>` : ''}
      ${isToday ? `${M.sec(`Queue · ${esc(room ? room.name : 'my room')}`)}${q.length ? `<div class="m-list">${q.map((a, i) => M.item({ href: `#/appt/${a.id}`, avatar: `<span class="avatar" style="background:var(--pp-info-bg);color:var(--pp-info-fg)">${i + 1}</span>`, t: esc(PP.patientName(a.patientId)), s: `${PP.fmt.time(a.start)} · ${esc(PP.serviceName(a.serviceId))}${a.professionalId !== pro().id ? ' · ' + esc(PP.proShort(a.professionalId)) : ''}`, right: PP.ui.badge(a.status) })).join('')}</div>` : M.emptyCard({ icon: 'users', title: 'Nobody waiting', text: 'Checked-in patients for your room appear here.' })}` : ''}
      ${M.sec('Schedule')}
      ${list.length ? `<ul class="m-tl">${list.map((a) => `<li class="${a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'No-show' ? 'done' : ''} ${a.status === 'In session' ? 'now' : ''}"><span class="tm">${PP.fmt.time(a.start).replace(' ', '<br>')}</span><a class="box" href="#/appt/${esc(a.id)}" style="border-left-color:${a.status === 'Cancelled' ? 'var(--pp-error-fg)' : esc(pro().color)}"><div class="row between" style="flex-wrap:nowrap"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(PP.patientName(a.patientId))}</b>${PP.ui.badge(a.status)}</div><span class="small muted">${esc(PP.serviceName(a.serviceId))} · ${timeRange(a)}</span></a></li>`).join('')}</ul>`
        : M.emptyCard({ icon: 'calendar', title: 'No appointments', text: w && w.closed ? esc(w.reason) : 'Your schedule is free on this day.' })}`;
    PP.$$('[data-day]', el).forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.day === T() ? '#/today' : `#/today?d=${b.dataset.day}`; }));
    bindActions(el);
  } });

  PP.route('/appt/:id', { title: 'Appointment', tab: 'today', back: '#/today', render({ el, params }) {
    const a = PP.find.appointment(params.id);
    if (!a || a.professionalId !== pro().id) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Appointment not found', text: `Only your own appointments open here.`, action: '<a class="btn" href="#/today">Back</a>' }); return; }
    const p = PP.find.patient(a.patientId); const v = PP.db.visits.find((x) => x.appointmentId === a.id);
    el.innerHTML = `<div class="m-card"><div class="row between"><span class="mono small muted">${esc(a.id)}</span>${PP.ui.badge(a.status)}</div>
        <a class="row mt-2" href="#/patient/${esc(p.id)}" style="flex-wrap:nowrap;color:inherit;text-decoration:none">${ptAvatar(p)}<div><b style="font-size:16px">${esc(p.name)}</b><div class="small muted">${esc(p.id)} · ${esc(PP.fmt.age(p.dob))} · ${esc(p.gender || '—')}</div></div></a>
        <div class="m-badges mt-2">${allergyBadge(p)}</div><div class="divider"></div>
        <dl class="m-kv"><dt>Service</dt><dd>${esc(PP.serviceName(a.serviceId))}</dd><dt>When</dt><dd>${PP.fmt.dateLong(a.date)}<br>${timeRange(a)}</dd><dt>Room</dt><dd>${esc((PP.find.room(a.roomId) || {}).name || '—')}</dd><dt>Source</dt><dd>${esc(a.source || '—')}</dd>${a.notes ? `<dt>Notes</dt><dd>${esc(a.notes)}</dd>` : ''}</dl>
        <div class="m-actions">${actionButtons(a)}</div></div>
      ${a.changeRequest && a.changeRequest.status === 'Pending' ? `<div class="mt-3">${PP.ui.alert('warning', `<b>Patient asked to ${esc(a.changeRequest.type.toLowerCase())}.</b> ${esc(a.changeRequest.reason || '')} The front desk handles it.`)}</div>` : ''}
      ${v ? `${M.sec('Clinical note')}<div class="m-list">${M.item({ href: `#/visit/${v.id}`, icon: 'clipboard', t: esc(v.complaint), s: `Pain ${v.painScale}/10 · ${esc(v.treatment || '')}` })}</div>` : ''}
      ${(a.history || []).length ? `${M.sec('History')}<div class="m-list">${a.history.slice().reverse().map((h) => M.item({ icon: 'clock', t: esc(h.status), s: `${PP.fmt.stamp(h.at)} · ${esc(h.by || '')}${h.note ? '<br>' + esc(h.note) : ''}` })).join('')}</div>` : ''}`;
    bindActions(el);
  } });

  /* ================================================================== PATIENTS */
  PP.route('/patients', { title: 'My patients', tab: 'patients', render({ el }) {
    const all = myPatients().map((p) => ({ p, lv: lastVisit(p.id) })).sort((a, b) => String((b.lv || {}).date || '').localeCompare(String((a.lv || {}).date || '')));
    el.innerHTML = `<div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search name, ID or mobile" aria-label="Search patients" style="height:44px;border-radius:12px"></div><div class="mt-3" data-list></div>`;
    const draw = (q) => {
      const rows = all.filter(({ p }) => !q || `${p.name} ${p.id} ${p.mobile}`.toLowerCase().includes(q));
      PP.$('[data-list]', el).innerHTML = rows.length ? `<div class="small muted" style="margin:0 2px 6px">${rows.length} patient${rows.length > 1 ? 's' : ''}</div><div class="m-list">${rows.slice(0, 60).map(({ p, lv }) => M.item({ href: `#/patient/${p.id}`, avatar: ptAvatar(p), t: esc(p.name), s: `<span class="mono">${esc(p.id)}</span> · ${lv ? 'last visit ' + PP.fmt.dateShort(lv.date) : 'no visits yet'}`, right: hasAllergy(p) ? `<span class="m-allergy" title="Allergy: ${esc(p.allergies)}">${PP.icon('alert')}</span>` : '' })).join('')}</div>`
        : M.emptyCard({ icon: q ? 'filter' : 'users', title: q ? 'No patient matches your search' : 'No patients yet', text: q ? 'Try a name, patient ID or mobile number.' : '' });
    };
    PP.$('[data-q]', el).addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
    draw('');
  } });

  PP.route('/patient/:id', { title: 'Patient summary', tab: 'patients', back: '#/patients', render({ el, params }) {
    const p = PP.find.patient(params.id);
    if (!p) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Patient not found', action: '<a class="btn" href="#/patients">Back</a>' }); return; }
    M.write(() => PP.audit('Patient record viewed', p.id, `${P()} app`));
    const visits = PP.db.visits.filter((v) => v.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
    const rx = PP.db.prescriptions.filter((r) => r.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
    const plan = activePlan(p.id);
    const upcoming = PP.db.appointments.filter((a) => a.patientId === p.id && a.date >= T() && ACTIVE.includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const todayAppt = PP.db.appointments.find((a) => a.patientId === p.id && a.professionalId === pro().id && a.date === T() && ['Checked in', 'In session', 'Confirmed', 'Scheduled'].includes(a.status));
    const log = p.exerciseLog || {}; let days = 0; for (let i = 0; i < 7; i++) if ((log[PP.addDays(T(), -i)] || []).length) days++;
    const pain = visits.slice(0, 6).reverse();
    el.innerHTML = `<div class="m-card"><div class="row" style="flex-wrap:nowrap"><span class="avatar lg">${esc(PP.initials(p.name))}</span><div style="min-width:0"><b style="font-size:17px">${esc(p.name)}</b><div class="small muted"><span class="mono">${esc(p.id)}</span> · ${esc(PP.fmt.age(p.dob))} · ${esc(p.gender || '—')}</div><div class="small muted">${esc(p.mobile)}${p.bloodGroup ? ' · ' + esc(p.bloodGroup) : ''}</div></div></div>
        <div class="m-badges mt-3">${allergyBadge(p)}</div>
        <dl class="m-kv mt-3"><dt>History</dt><dd>${esc(p.medicalHistory || '—')}</dd><dt>Previous care</dt><dd>${esc(p.previousTreatments || '—')}</dd><dt>Assigned to</dt><dd>${esc(PP.proName(p.assignedProfessionalId))}</dd></dl>
        <div class="m-actions"><a class="btn btn-primary" href="#/note?patient=${esc(p.id)}${todayAppt ? '&apt=' + esc(todayAppt.id) : ''}">${PP.icon('edit')} Quick note</a><a class="btn" href="#/rx/new?patient=${esc(p.id)}">${PP.icon('rx')} Prescribe</a></div></div>
      ${M.sec('Active treatment plan')}${plan ? (() => { const done = plan.sessions.filter((x) => x.status === 'Completed').length; const pct = Math.round(done / (plan.planned || 1) * 100); const nx = plan.sessions.find((x) => x.status !== 'Completed');
        return `<div class="m-card"><div class="row between"><b>${esc(plan.title)}</b><span class="small mono">${done}/${plan.planned}</span></div><div class="small muted">${esc(PP.proName(plan.professionalId))} · ${esc(plan.frequency || '')}</div><div class="m-progress mt-2"><i style="width:${pct}%"></i></div>
          ${nx ? `<div class="small mt-2">Next: session ${nx.no} · ${esc(nx.goal)} · ${PP.fmt.dateShort(nx.date)}</div>` : ''}<div class="small muted mt-2">Home exercises ticked on ${days} of the last 7 days (patient app)</div>
          ${nx ? `<div class="m-actions"><button class="btn" data-progress="${esc(plan.id)}">${PP.icon('plus')} Session progress</button></div>` : ''}</div>`; })() : M.emptyCard({ icon: 'activity', title: 'No active plan' })}
      ${pain.length > 1 ? `${M.sec('Pain trend')}<div class="m-card"><div class="row" style="align-items:flex-end;gap:6px;height:80px;flex-wrap:nowrap">${pain.map((v) => `<div style="flex:1;text-align:center"><div style="height:${v.painScale * 6 + 4}px;border-radius:6px 6px 0 0;background:${v.painScale >= 7 ? 'var(--pp-error-fg)' : v.painScale >= 4 ? '#d99a2b' : 'var(--pp-action)'}" title="${PP.fmt.date(v.date)}: ${v.painScale}/10"></div><div class="small muted mono">${v.painScale}</div></div>`).join('')}</div><div class="small muted mt-2">Last ${pain.length} visits, oldest first (0–10)</div></div>` : ''}
      ${M.sec('Last visits')}${visits.length ? `<div class="m-list">${visits.slice(0, 5).map((v) => M.item({ href: `#/visit/${v.id}`, icon: 'clipboard', t: esc(v.complaint), s: `${PP.fmt.date(v.date)} · pain ${v.painScale}/10 · ${esc(PP.proShort(v.professionalId))}` })).join('')}</div>` : M.emptyCard({ icon: 'clipboard', title: 'No visits recorded yet' })}
      ${M.sec('Prescriptions')}${rx.length ? `<div class="m-list">${rx.slice(0, 5).map((r) => M.item({ href: `#/rx/${r.id}`, icon: 'rx', t: esc(r.condition || 'Prescription'), s: `<span class="mono">${esc(r.id)}</span> · ${PP.fmt.date(r.date)} · v${r.version}`, right: PP.ui.badge(r.status) })).join('')}</div>` : M.emptyCard({ icon: 'rx', title: 'No prescriptions' })}
      ${M.sec('Upcoming')}${upcoming.length ? `<div class="m-list">${upcoming.slice(0, 4).map((a) => M.item({ href: a.professionalId === pro().id ? `#/appt/${a.id}` : null, icon: 'calendar', t: `${PP.fmt.dateShort(a.date)} · ${PP.fmt.time(a.start)}`, s: `${esc(PP.serviceName(a.serviceId))} · ${esc(PP.proShort(a.professionalId))}`, right: PP.ui.badge(a.status) })).join('')}</div>` : M.emptyCard({ icon: 'calendar', title: 'No upcoming appointments' })}`;
    const pb = PP.$('[data-progress]', el); if (pb) pb.addEventListener('click', () => progressSheet(pb.dataset.progress));
  } });

  function progressSheet(planId) {
    const plan = PP.find.sessionPlan(planId); const nx = plan.sessions.find((x) => x.status !== 'Completed');
    M.sheet({ title: `Session ${nx.no} progress`,
      body: `<p class="small muted" style="margin-top:0">${esc(plan.title)} · goal: ${esc(nx.goal)}</p><form class="m-form" novalidate>${PP.form.field({ name: 'note', label: 'Progress note', type: 'textarea', required: true, placeholder: 'e.g. ROM improved, tolerated exercises well' })}</form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save progress', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const note = PP.form.read(f).note; await PP.sleep(350);
        M.write(() => { const sp = PP.find.sessionPlan(planId); const x = sp.sessions.find((s) => s.no === nx.no); x.status = 'Completed'; x.note = note; x.completedAt = PP.nowStamp(); x.date = x.date > T() ? T() : x.date; sp.status = sp.sessions.every((s) => s.status === 'Completed') ? 'Completed' : 'Active'; PP.audit('Session progress recorded', sp.id, `Session ${x.no} · ${P()} app`); });
        M.toast(`Session ${nx.no} marked completed.`); PP.render();
      } }] });
  }

  PP.route('/visit/:id', { title: 'Clinical note', tab: 'patients', back: (p) => { const v = PP.find.visit(p.id); return v ? `#/patient/${v.patientId}` : '#/patients'; }, render({ el, params, query }) {
    const v = PP.find.visit(params.id);
    if (!v) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Note not found' }); return; }
    el.innerHTML = `${query.saved ? `<div class="m-success" style="padding:6px 0 12px"><div class="mark">${PP.icon('check')}</div><h2>Note saved</h2><p class="muted small">Visible on the patient profile in the clinic workspace.</p></div>` : ''}
      <div class="m-card"><div class="row between"><span class="mono small muted">${esc(v.id)}</span>${PP.ui.badge(v.status || 'Completed')}</div><b class="mt-2" style="display:block;font-size:16px">${esc(PP.patientName(v.patientId))}</b><div class="small muted">${PP.fmt.dateLong(v.date)} · ${esc(PP.proName(v.professionalId))}</div>
        <div class="m-pain mt-3"><output class="${M.painClass(v.painScale)}">${v.painScale}</output><span><b>${M.painWord(v.painScale)}</b><span class="small muted" style="display:block">Pain scale 0–10</span></span></div>
        <dl class="m-kv mt-3"><dt>Complaint</dt><dd>${esc(v.complaint)}</dd><dt>Assessment</dt><dd>${esc(v.assessment || '—')}</dd><dt>Treatment</dt><dd>${esc(v.treatment || '—')}</dd><dt>Advice</dt><dd>${esc(v.advice || '—')}</dd><dt>Next visit</dt><dd>${v.nextVisit ? PP.fmt.date(v.nextVisit) : '—'}</dd>${v.appointmentId ? `<dt>Appointment</dt><dd class="mono">${esc(v.appointmentId)}</dd>` : ''}</dl></div>
      <div class="m-actions"><a class="btn" href="#/patient/${esc(v.patientId)}">${PP.icon('user')} Patient</a><a class="btn btn-primary" href="#/rx/new?patient=${esc(v.patientId)}&visit=${esc(v.id)}">${PP.icon('rx')} Prescribe</a></div>`;
  } });

  /* ================================================================== QUICK NOTE */
  PP.route('/note', { sync: false, title: 'Quick clinical note', tab: 'today', back: '#/today', render({ el, query }) {
    const a = query.apt ? PP.find.appointment(query.apt) : null;
    const pid = (a && a.patientId) || query.patient; const p = PP.find.patient(pid);
    if (!p) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Choose a patient first', text: 'Open a patient or an appointment, then tap Quick note.', action: '<a class="btn" href="#/patients">My patients</a>' }); return; }
    if (!ptype().canRecordClinical || !PP.can('clinical.write')) { el.innerHTML = M.emptyCard({ icon: 'lock', title: 'You cannot record clinical notes', text: `Your ${esc(p_())} type (${esc(ptype().name || '—')}) or your role does not allow clinical notes. A role is not a ${esc(p_())} type (D-020); ask the clinic admin.` }); return; }
    const plan = activePlan(p.id); const nx = plan ? plan.sessions.find((x) => x.status !== 'Completed') : null; const lv = lastVisit(p.id);
    el.innerHTML = `<div class="m-card"><div class="row" style="flex-wrap:nowrap">${ptAvatar(p)}<div style="min-width:0"><b>${esc(p.name)}</b><div class="small muted"><span class="mono">${esc(p.id)}</span>${a ? ` · ${esc(PP.serviceName(a.serviceId))} · ${PP.fmt.time(a.start)}` : ' · no appointment linked'}</div></div></div>${hasAllergy(p) ? `<div class="mt-2">${allergyBadge(p)}</div>` : ''}</div>
      <form class="m-form mt-3" novalidate data-f>
        ${PP.form.field({ name: 'complaint', label: 'Chief complaint', required: true, value: lv ? lv.complaint : '', placeholder: 'e.g. Knee pain on stairs' })}
        <div class="field"><label for="pain">Pain scale</label><div class="m-pain"><output id="pain-out">${lv ? lv.painScale : 5}</output><input class="range" type="range" id="pain" name="painScale" min="0" max="10" step="1" value="${lv ? lv.painScale : 5}" aria-describedby="pain-word"></div><div class="m-scale"><span>0 none</span><span id="pain-word"></span><span>10 worst</span></div></div>
        ${PP.form.field({ name: 'assessment', label: 'Assessment', type: 'textarea', rows: 2, placeholder: 'Findings, ROM, strength' })}
        ${PP.form.field({ name: 'treatment', label: 'Treatment given', type: 'textarea', rows: 2, required: true, placeholder: 'e.g. Manual therapy + exercises' })}
        ${PP.form.field({ name: 'advice', label: 'Advice', type: 'textarea', rows: 2, placeholder: 'Home advice for the patient' })}
        ${PP.form.field({ name: 'nextVisit', label: 'Next visit', type: 'date', value: PP.addDays(T(), 7), min: T() })}
        ${nx ? `<div class="m-card teal"><label class="check"><input type="checkbox" name="progress" checked> Record progress on “${esc(plan.title)}” · session ${nx.no} (${esc(nx.goal)})</label><div class="mt-2">${PP.form.field({ name: 'progressNote', label: 'Session progress note', type: 'textarea', rows: 2, placeholder: 'Short progress note (optional; uses the treatment text if empty)' })}</div></div>` : ''}
        ${a ? `<p class="m-note" style="margin:0">Saving marks appointment <b class="mono">${esc(a.id)}</b> as Completed.</p>` : ''}
        <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('check')} Save note</button></form>`;
    const range = PP.$('#pain', el); const out = PP.$('#pain-out', el);
    const paint = () => { const n = Number(range.value); out.textContent = n; out.className = M.painClass(n); PP.$('#pain-word', el).textContent = M.painWord(n); };
    range.addEventListener('input', paint); paint();
    const f = PP.$('[data-f]', el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); let ok = PP.form.validate(f); const d = PP.form.read(f);
      if (d.nextVisit && d.nextVisit < T()) { PP.form.setError(f, 'nextVisit', 'Next visit cannot be in the past.'); ok = false; }
      if (!ok) return;
      await PP.ui.busy(PP.$('[data-go]', f), () => {
        const v = M.write(() => {
          const ap = a ? PP.find.appointment(a.id) : null;
          const visit = { id: PP.nextId('VIS'), appointmentId: ap ? ap.id : null, patientId: p.id, professionalId: pro().id, branchId: (ap && ap.branchId) || p.branchId || pro().branchId, date: T(),
            complaint: d.complaint, painScale: Number(d.painScale), assessment: d.assessment, treatment: d.treatment, advice: d.advice, nextVisit: d.nextVisit, vitals: { bp: '', pulse: '' }, rom: '', painMap: [], form: PP.db.settings.businessType || 'physiotherapy',
            status: 'Completed', createdBy: user().id, createdAt: PP.nowStamp(), source: `${P()} app` };
          PP.db.visits.push(visit);
          if (ap && ap.status !== 'Completed') { ap.status = 'Completed'; history(ap, 'Completed', `Linked to ${visit.id} (${P()} app)`); PP.audit('Appointment completed', ap.id, `Linked to ${visit.id}`); }
          if (d.progress && plan) {
            const sp = PP.find.sessionPlan(plan.id); const x = sp.sessions.find((s) => s.no === nx.no);
            x.status = 'Completed'; x.note = d.progressNote || d.treatment; x.completedAt = PP.nowStamp(); x.visitId = visit.id; if (x.date > T()) x.date = T();
            sp.status = sp.sessions.every((s) => s.status === 'Completed') ? 'Completed' : 'Active';
            PP.audit('Session progress recorded', sp.id, `Session ${x.no} · ${visit.id}`);
          }
          PP.audit('Clinical visit recorded', visit.id, `${p.name} · pain ${visit.painScale}/10 · ${P()} app`);
          return visit;
        });
        M.toast(`Clinical note saved · ${esc(v.id)}`);
        location.hash = `#/visit/${v.id}?saved=1`;
      }, 600);
    });
  } });

  /* ================================================================== PRESCRIPTIONS */
  const rxDoc = (r) => { const p = PP.find.patient(r.patientId); const pr = PP.find.professional(r.professionalId);
    return `<div class="m-doc"><div class="doc-head"><div><h3>${esc(PP.db.settings.clinicName)}</h3><div class="small muted">${esc(PP.db.settings.prescriptionHeader || '')}</div></div><div class="small right"><b class="mono">${esc(r.id)}</b><br>${PP.fmt.date(r.date)}<br>${PP.ui.badge(r.status)}</div></div>
      <dl class="m-kv"><dt>Patient</dt><dd>${esc(p ? p.name : r.patientId)} · <span class="mono">${esc(r.patientId)}</span></dd><dt>Condition</dt><dd>${esc(r.condition || '—')}</dd><dt>Assessment</dt><dd>${esc(r.assessment || '—')}</dd><dt>Plan</dt><dd>${esc(r.plan || '—')}</dd><dt>Frequency</dt><dd>${esc(r.frequency || '—')}</dd><dt>Follow-up</dt><dd>${r.followUp ? PP.fmt.date(r.followUp) : '—'}</dd><dt>Version</dt><dd>v${r.version}${r.versions && r.versions.length ? ` (${r.versions.length} earlier kept)` : ''}</dd></dl>
      <table><thead><tr><th>Exercise</th><th>Sets × reps</th><th>How often</th></tr></thead><tbody>${(r.items || []).map((it) => { const e = PP.find.exercise(it.exerciseId); return `<tr><td>${esc(e ? e.name : it.exerciseId)}</td><td class="mono">${it.sets} × ${it.reps}</td><td>${esc(it.frequency || 'Daily')}</td></tr>`; }).join('')}</tbody></table>
      <div class="sig"><div>${esc(PP.proName(pr))}<br><span class="muted">${esc(pr ? pr.designation : '')}</span></div></div></div>`; };

  PP.route('/rx', { title: 'Prescriptions', tab: 'rx', render({ el, query }) {
    let tab = query.tab || 'Issued';
    const mine = PP.db.prescriptions.filter((r) => r.professionalId === pro().id).sort((a, b) => (b.issuedAt || b.date).localeCompare(a.issuedAt || a.date));
    el.innerHTML = `${ptype().canPrescribeExercise ? `<a class="btn btn-primary m-btn-block" href="#/rx/new">${PP.icon('plus')} Issue from a template</a>` : PP.ui.alert('info', `Your ${esc(p_())} type (${esc(ptype().name || '—')}) cannot issue prescriptions. You can still view them.`)}<div class="mt-3"></div>
      ${M.seg('r', [['Issued', `Issued (${mine.filter((r) => r.status === 'Issued').length})`], ['Draft', `Drafts (${mine.filter((r) => r.status === 'Draft').length})`]], tab)}<div data-list></div>`;
    const draw = () => { const list = mine.filter((r) => r.status === tab);
      PP.$('[data-list]', el).innerHTML = list.length ? `<div class="m-list">${list.slice(0, 40).map((r) => M.item({ href: `#/rx/${r.id}`, icon: 'rx', t: `${esc(PP.patientName(r.patientId))}`, s: `<span class="mono">${esc(r.id)}</span> · ${esc(r.condition || '')} · ${PP.fmt.date(r.date)}${r.version > 1 ? ' · v' + r.version : ''}`, right: PP.ui.badge(r.status) })).join('')}</div>` : M.emptyCard({ icon: 'rx', title: tab === 'Draft' ? 'No drafts' : 'No prescriptions issued yet' }); };
    M.bindSeg(el, 'r', (v) => { tab = v; draw(); }); draw();
  } });

  PP.route('/rx/new', { sync: false, title: 'Issue prescription', tab: 'rx', back: '#/rx', render({ el, query }) {
    const t = ptype();
    if (!t.canPrescribeExercise || !PP.can('prescriptions.issue')) {
      el.innerHTML = `<div class="m-card">${PP.ui.empty({ icon: 'lock', title: 'You cannot issue prescriptions', text: `Prescribing is allowed by the ${esc(p_())} <b>type</b>, not by the job title or user role (D-020). Your type is <b>${esc(t.name || '—')}</b>, which ${t.canPrescribeExercise ? 'allows exercise prescriptions, but your user role lacks the permission' : 'does not allow exercise prescriptions'}. Ask an authorised ${esc(p_())} or the clinic admin.` })}</div>`;
      return;
    }
    const tpls = PP.db.templates.filter((x) => x.status === 'Approved');
    const pts = myPatients().sort((a, b) => a.name.localeCompare(b.name));
    const st = { patientId: query.patient || '', templateId: null };
    const visit = query.visit ? PP.find.visit(query.visit) : null;
    const draw = () => {
      const tp = st.templateId ? PP.find.template(st.templateId) : null;
      el.innerHTML = `${PP.ui.alert('info', `Only <b>Approved</b> condition templates can be used. Drafts are managed in the clinic workspace.`)}
        <form class="m-form mt-3" novalidate data-f>
          ${PP.form.field({ name: 'patientId', label: 'Patient', type: 'select', required: true, value: st.patientId, options: pts.map((p) => [p.id, `${p.name} · ${p.id}`]) })}
          <div class="field" data-field="tpl"><span class="label">Template<span class="req">*</span></span>${tpls.map((x) => `<button type="button" class="m-choice ${st.templateId === x.id ? 'active' : ''}" data-tpl="${esc(x.id)}"><span class="m-ic" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--pp-action-050);color:var(--pp-action-700)">${PP.icon('clipboard', 'style="width:20px"')}</span><span class="grow"><b>${esc(x.name)}</b><span class="s">${esc(x.condition)} · v${x.version} · ${x.items.length} exercises</span></span>${PP.ui.badge('Approved')}</button>`).join('')}<div class="error">Choose a template.</div></div>
          ${tp ? `<div class="m-card teal"><b>${esc(tp.name)}</b><div class="small muted mt-2">${esc(tp.plan)}</div><ul class="small" style="margin:8px 0 0;padding-left:18px">${tp.items.map((it) => { const e = PP.find.exercise(it.exerciseId); return `<li>${esc(e ? e.name : it.exerciseId)} · ${it.sets} × ${it.reps} · ${esc(it.frequency)}</li>`; }).join('')}</ul></div>
            ${PP.form.field({ name: 'assessment', label: 'Assessment', value: visit ? visit.assessment : '', placeholder: 'Short assessment' })}
            ${PP.form.field({ name: 'frequency', label: 'Session frequency', type: 'select', placeholder: false, value: '3 sessions / week', options: ['1 session / week', '2 sessions / week', '3 sessions / week', 'Daily'] })}
            ${PP.form.field({ name: 'followUp', label: 'Follow-up date', type: 'date', required: true, value: PP.addDays(T(), 7), min: T() })}` : ''}
          <button class="btn btn-primary m-btn-block" type="submit" data-go>${PP.icon('check')} Issue prescription</button></form>`;
      const f = PP.$('[data-f]', el);
      PP.$('[name=patientId]', f).addEventListener('change', (e) => { st.patientId = e.target.value; });
      PP.$$('[data-tpl]', f).forEach((b) => b.addEventListener('click', () => { st.patientId = PP.$('[name=patientId]', f).value; st.templateId = b.dataset.tpl; draw(); }));
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); let ok = PP.form.validate(f); const d = PP.form.read(f);
        if (!st.templateId) { PP.form.setError(f, 'tpl'); ok = false; }
        if (!ok) return;
        const tpl = PP.find.template(st.templateId);
        if (!tpl || tpl.status !== 'Approved') { M.toast('This template is no longer approved.', 'error'); return; }
        await PP.ui.busy(PP.$('[data-go]', f), () => {
          const rx = M.write(() => {
            const pt = PP.find.patient(d.patientId); const lv = visit || PP.db.visits.filter((v) => v.patientId === pt.id && v.professionalId === pro().id && v.date === T()).pop();
            const r = { id: PP.nextId('RX'), patientId: pt.id, visitId: lv ? lv.id : null, professionalId: pro().id, branchId: pt.branchId || pro().branchId, date: T(), templateId: tpl.id, templateVersion: tpl.version, condition: tpl.condition, assessment: d.assessment, plan: tpl.plan, items: PP.clone(tpl.items), medications: [], frequency: d.frequency, followUp: d.followUp, status: 'Issued', version: 1, versions: [], issuedAt: PP.nowStamp(), issuedBy: user().id, source: `${P()} app` };
            PP.db.prescriptions.push(r);
            PP.audit('Prescription issued', r.id, `${pt.name} · ${tpl.name} v${tpl.version} · ${P()} app`);
            return r;
          });
          M.toast(`Prescription ${esc(rx.id)} issued. The patient sees it in the patient app.`); location.hash = `#/rx/${rx.id}`;
        });
      });
    };
    draw();
  } });

  PP.route('/rx/:id', { title: 'Prescription', tab: 'rx', back: '#/rx', render({ el, params }) {
    const r = PP.find.prescription(params.id);
    if (!r) { el.innerHTML = M.emptyCard({ icon: 'alert', title: 'Prescription not found' }); return; }
    el.innerHTML = `${rxDoc(r)}<div class="m-actions"><a class="btn" href="#/patient/${esc(r.patientId)}">${PP.icon('user')} Patient</a></div>
      ${r.status === 'Draft' ? `<p class="m-note mt-3">Drafts are finished and issued in the clinic workspace.</p>` : ''}<p class="m-note mt-3">Revisions are made in the clinic workspace; earlier versions are kept.</p>`;
  } });

  /* ================================================================== AVAILABILITY */
  PP.route('/availability', { title: 'My availability', tab: 'avail', render({ el }) {
    const p = pro(); const order = [6, 0, 1, 2, 3, 4, 5];
    const leaves = PP.db.leaves.filter((l) => l.professionalId === p.id).sort((a, b) => b.from.localeCompare(a.from));
    const closures = PP.db.closures.filter((c) => c.date >= T()).sort((a, b) => a.date.localeCompare(b.date));
    el.innerHTML = `${M.sec('Weekly schedule')}<div class="m-list">${order.map((d) => { const x = p.schedule[d] || {}; return M.item({ icon: x.on ? 'clock' : 'x', t: PP.DAYS[d], s: x.on ? `${PP.fmt.time(x.start)} – ${PP.fmt.time(x.end)}${x.breakStart ? ` · break ${PP.fmt.time(x.breakStart)}–${PP.fmt.time(x.breakEnd)}` : ''}` : 'Not working', cls: PP.dow(T()) === d ? 'unread' : '' }); }).join('')}</div>
      <p class="m-note mt-2">Read-only. The clinic admin changes working hours.</p>
      <button class="btn btn-primary m-btn-block mt-3" data-leave>${PP.icon('plus')} Request leave</button>
      ${M.sec('My leave')}${leaves.length ? `<div class="m-list">${leaves.map((l) => M.item({ icon: 'calendar', t: `${PP.fmt.dateShort(l.from)}${l.to !== l.from ? ' – ' + PP.fmt.dateShort(l.to) : ''}`, s: esc(l.reason), right: PP.ui.badge(l.status) })).join('')}</div>` : M.emptyCard({ icon: 'calendar', title: 'No leave recorded' })}
      ${M.sec('Clinic closures')}${closures.length ? `<div class="m-list">${closures.map((c) => M.item({ icon: 'building', t: PP.fmt.dateLong(c.date), s: esc(c.reason) })).join('')}</div>` : M.emptyCard({ icon: 'building', title: 'No upcoming closures' })}`;
    PP.$('[data-leave]', el).addEventListener('click', leaveSheet);
  } });

  function leaveSheet() {
    const p = pro();
    const s = M.sheet({ title: 'Request leave',
      body: `<form class="m-form" novalidate>${PP.form.field({ name: 'from', label: 'From', type: 'date', required: true, min: T(), value: PP.addDays(T(), 7) })}${PP.form.field({ name: 'to', label: 'To', type: 'date', required: true, min: T(), value: PP.addDays(T(), 7) })}${PP.form.field({ name: 'reason', label: 'Reason', required: true, placeholder: 'e.g. Family event', attrs: 'maxlength="120"' })}</form>
        <div data-impact class="mt-3"></div><p class="m-note">The clinic admin approves or rejects it. Pending leave already blocks new bookings in that period (clinic rule).</p>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: `${PP.icon('send')} Send request`, kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); let ok = PP.form.validate(f); const d = PP.form.read(f);
        if (ok && d.from < T()) { PP.form.setError(f, 'from', 'Leave cannot start in the past.'); ok = false; }
        if (ok && d.to < d.from) { PP.form.setError(f, 'to', 'The end date must be on or after the start date.'); ok = false; }
        const overlap = ok && PP.db.leaves.find((l) => l.professionalId === p.id && !['Cancelled', 'Rejected'].includes(l.status) && d.from <= l.to && d.to >= l.from);
        if (overlap) { PP.form.setError(f, 'from', `Overlaps your leave ${PP.fmt.dateShort(overlap.from)} – ${PP.fmt.dateShort(overlap.to)} (${overlap.status}).`); ok = false; }
        if (!ok) return false;
        await PP.sleep(450);
        const rec = M.write(() => {
          const hit = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= d.from && a.date <= d.to && ACTIVE.includes(a.status)).length;
          const l = { id: PP.nextId('LEV', 3), professionalId: p.id, from: d.from, to: d.to, reason: d.reason, status: 'Pending', createdAt: PP.nowStamp(), requestedBy: user().id, source: `${P()} app`, affectedAppointments: hit };
          PP.db.leaves.push(l);
          PP.notify('Leave request', `${PP.proName(p)} · ${PP.fmt.date(d.from)} – ${PP.fmt.date(d.to)} · ${d.reason}${hit ? ` · ${hit} appointment(s) affected` : ''}`, `#/professionals/availability?pro=${p.id}`);
          PP.audit('Leave requested', p.id, `${PP.fmt.date(d.from)} – ${PP.fmt.date(d.to)} · ${d.reason}`);
          return l;
        });
        M.toast(`Leave request sent to the clinic admin${rec.affectedAppointments ? `. ${rec.affectedAppointments} appointment(s) need rescheduling` : ''}.`, rec.affectedAppointments ? 'warning' : 'positive', 4200);
        PP.render();
      } }] });
    const impact = () => { const d = PP.form.read(PP.$('form', s.body)); if (!d.from || !d.to || d.to < d.from) return; const n = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= d.from && a.date <= d.to && ACTIVE.includes(a.status)).length; PP.$('[data-impact]', s.body).innerHTML = n ? PP.ui.alert('warning', `${n} booked appointment(s) fall in this period. The front desk will reschedule them.`) : ''; };
    PP.$$('input[type=date]', s.body).forEach((i) => i.addEventListener('change', impact)); impact();
  }

  /* ================================================================== COMMISSION */
  PP.route('/commission', { title: 'My commission', tab: 'more', back: '#/more', render({ el }) {
    if (!PP.can('commissions.view_own')) { el.innerHTML = M.emptyCard({ icon: 'lock', title: 'Not available for your role' }); return; }
    const p = pro(); const bal = PP.commission.balance(p.id); const month = PP.monthKey(T());
    const entries = PP.db.commissionEntries.filter((e) => e.professionalId === p.id).sort((a, b) => String(b.at || b.date).localeCompare(String(a.at || a.date)));
    const thisMonth = PP.round2(PP.sum(entries.filter((e) => PP.monthKey(e.date) === month), (e) => e.value));
    const collected = PP.round2(PP.sum(entries.filter((e) => PP.monthKey(e.date) === month), (e) => e.base));
    const sets = PP.db.settlements.filter((x) => x.professionalId === p.id).sort((a, b) => String(b.to).localeCompare(String(a.to)));
    el.innerHTML = `<div class="m-card hero"><div class="small" style="font-weight:700">Unsettled balance</div><div class="m-money mono">${PP.fmt.money(bal)}</div><div class="small">${bal < 0 ? 'Negative after a refund that followed a payout (D-026).' : 'Waiting for the next settlement.'}</div></div>
      <div class="m-stats mt-3"><div class="m-stat"><b class="mono" style="font-size:15px">${PP.fmt.money(collected)}</b><span>Collected this month</span></div><div class="m-stat tone-positive"><b class="mono" style="font-size:15px">${PP.fmt.money(thisMonth)}</b><span>Earned this month</span></div><div class="m-stat"><b class="mono" style="font-size:15px">${sets[0] ? PP.fmt.money(sets[0].total) : '—'}</b><span>Last settlement</span></div></div>
      <div class="mt-3">${PP.ui.alert('info', '<b>Commission is earned only on money actually collected</b> (D-025). Unpaid or pending invoices earn nothing yet; refunds and reversals reduce it.')}</div>
      ${M.sec('Recent entries')}${entries.length ? `<div class="m-list">${entries.slice(0, 20).map((e) => M.item({ icon: e.type === 'accrual' ? 'coins' : 'refresh', t: `${e.value < 0 ? '' : '+'}${PP.fmt.money(e.value)} <span class="small muted">on ${PP.fmt.money(e.base)}</span>`, s: `${PP.fmt.date(e.date)} · ${esc(e.basis)} · <span class="mono">${esc(e.invoiceId)}</span>`, right: e.settlementId ? '<span class="badge positive">Settled</span>' : `<span class="badge ${e.type === 'accrual' ? 'warning' : 'neutral'}">${e.type === 'accrual' ? 'Unsettled' : esc(e.type)}</span>` })).join('')}</div>` : M.emptyCard({ icon: 'coins', title: 'No commission yet' })}
      ${sets.length ? `${M.sec('Settlements')}<div class="m-list">${sets.map((x) => M.item({ icon: 'banknote', t: PP.fmt.money(x.total), s: `${esc(x.period)}${x.payoutMethod ? ' · ' + esc(x.payoutMethod) : ''}`, right: PP.ui.badge(x.status) })).join('')}</div>` : ''}`;
  } });

  /* ================================================================== NOTIFICATIONS + MORE */
  PP.route('/notifications', { title: 'Notifications', tab: 'more', back: '#/today', render({ el }) {
    const list = inbox();
    el.innerHTML = list.length ? `<div class="row between" style="margin:0 2px 8px"><span class="small muted">${unread()} unread</span><button class="btn btn-ghost btn-sm" data-all>Mark all read</button></div>
      <div class="m-list">${list.map((n) => M.item({ href: n.href, icon: n.icon, t: esc(n.t), s: `${esc(n.s)}<br>${PP.fmt.stamp(n.at)}`, cls: S.readNtf.includes(n.id) ? '' : 'unread', attrs: `data-n="${esc(n.id)}"` })).join('')}</div>` : M.emptyCard({ icon: 'bell', title: 'No notifications', text: 'Appointment changes and messages appear here.' });
    PP.$$('[data-n]', el).forEach((a) => a.addEventListener('click', () => { if (!S.readNtf.includes(a.dataset.n)) { S.readNtf.push(a.dataset.n); S.save(); } }));
    const all = PP.$('[data-all]', el); if (all) all.addEventListener('click', () => { S.readNtf = Array.from(new Set(S.readNtf.concat(list.map((n) => n.id)))); S.save(); PP.render(); M.chrome(PP.match(PP.currentPath())); });
  } });

  PP.route('/more', { title: 'More', tab: 'more', render({ el }) {
    const p = pro(); const u = user(); const t = ptype();
    const cap = (k, l) => `<li>${t[k] ? '✓' : '✗'} ${l}</li>`;
    el.innerHTML = `<div class="m-card"><div class="row" style="flex-wrap:nowrap"><span class="avatar lg" style="background:${esc(p.color)}1f;color:${esc(p.color)}">${esc(PP.initials(p.name))}</span><div style="min-width:0"><b style="font-size:16px">${esc(PP.proName(p))}</b><div class="small muted">${esc(p.designation)}</div><div class="small muted">${esc(p.qualification)} · Reg. ${esc(p.registrationNo)}</div></div></div>
        <div class="divider"></div><dl class="m-kv"><dt>${esc(P())} type</dt><dd>${esc(t.name || '—')}</dd><dt>User role</dt><dd>${esc((PP.db.roles.find((r) => r.id === u.role) || {}).name || u.role)}</dd><dt>Branch</dt><dd>${esc(PP.branchName(p.branchId))}</dd><dt>Account</dt><dd>${esc(u.email)}</dd></dl>
        <div class="small muted mt-3">What your type allows (D-020: type ≠ role):</div><ul class="small" style="margin:4px 0 0;padding-left:18px;list-style:none">${cap('canRecordClinical', 'Record clinical notes')}${cap('canPrescribeExercise', 'Prescribe exercises')}${cap('canPrescribeMedication', 'Prescribe medication (clinic workspace only)')}${cap('canIssueCertificate', 'Issue certificates')}</ul></div>
      ${M.sec('Work')}<div class="m-list">
        ${M.item({ href: '#/commission', icon: 'coins', t: 'My commission statement', s: `Balance ${PP.fmt.money(PP.commission.balance(p.id))}` })}
        ${M.item({ href: '#/availability', icon: 'calendar', t: 'Availability and leave' })}
        ${M.item({ href: '#/notifications', icon: 'bell', t: 'Notifications', right: unread() ? `<span class="count-pill">${unread()}</span>` : '' })}
        ${M.item({ href: '#/rx', icon: 'rx', t: 'Prescriptions' })}</div>
      ${M.sec('Clinic')}<div class="m-list">
        ${M.item({ icon: 'building', t: esc(PP.db.settings.clinicName), s: `Server ${esc(S.clinic.domain)}` })}
        ${u.branchIds.length > 1 ? `<div class="m-item"><span class="m-ic">${PP.icon('layers')}</span><span class="grow"><span class="t">Branch</span></span><select class="select" style="width:auto" data-branch>${u.branchIds.map((b) => `<option value="${b}" ${S.branchId === b ? 'selected' : ''}>${esc(PP.branchName(b))}</option>`).join('')}</select></div>` : M.item({ icon: 'layers', t: 'Branch', s: `${esc(PP.branchName(u.branchIds[0]))} (only branch for your account)` })}
        <button class="m-item" data-switch><span class="m-ic">${PP.icon('globe')}</span><span class="grow"><span class="t">Connect to another clinic</span></span></button></div>
      <button class="btn btn-danger m-btn-block mt-4" data-out>${PP.icon('logout')} Sign out</button>
      <p class="m-note mt-3" style="text-align:center">Physio Point ${esc(P().toLowerCase())} app · prototype · fictional data only</p>`;
    const br = PP.$('[data-branch]', el); if (br) br.addEventListener('change', () => { S.branchId = br.value; S.save(); M.toast(`Branch: ${esc(PP.branchName(br.value))}`, 'info'); });
    PP.$('[data-out]', el).addEventListener('click', async () => {
      if (!(await M.confirm({ title: 'Sign out?', message: 'Unsaved notes on this phone are discarded.', confirmLabel: 'Sign out' }))) return;
      M.write(() => PP.audit('Signed out', S.userId, `${P()} app`)); S.userId = null; S.pending = null; S.save(); location.hash = '#/signin';
    });
    PP.$('[data-switch]', el).addEventListener('click', async () => {
      if (!(await M.confirm({ title: 'Connect to another clinic?', message: 'You will be signed out of this clinic.', confirmLabel: 'Continue' }))) return;
      S.userId = null; S.clinic = null; S.save(); location.hash = '#/clinic';
    });
  } });

  /* ------------------------------------------------------------------ start */
  const side = () => `<h2>${esc(PP.t('professional'))} app</h2><p>Prototype of the ${esc(PP.tl('professional'))} mobile app (scope pending PD-011). Same fictional clinic data as the clinic workspace in this browser.</p>
    <div class="card"><b>Try this</b><ul><li>Clinic code <b class="mono">PHYSIOPOINT</b></li><li>Sign in as any professional (e.g. Dr. Farzana Akter, Consultant, can prescribe medicine), any password</li><li>Start a session, then complete it with a quick note</li><li>Open the patient in the <a href="../customer-web/app.html#/patients" target="_blank" rel="noopener">clinic workspace</a> to see the visit</li><li>Request leave; check the admin’s notifications</li></ul></div>
    <div class="card"><b>Rules shown</b><ul><li>Prescribing depends on the ${esc(PP.tl('professional'))} type (D-020).</li><li>Only Approved templates can be issued.</li><li>Commission only on collected money (D-025).</li></ul></div>
    <div class="card"><a href="../index.html">Prototype hub</a> · <a href="../patient-app/index.html">Patient app</a></div>`;
  PP.load(); // terminology (PP.t) needs the store before boot
  M.boot({
    appName: `${PP.t('professional')} app`, home: '#/today', guard, brand, side,
    topRight: (r) => (r && r.tab ? `<a class="m-iconbtn" href="#/notifications" aria-label="Notifications">${PP.icon('bell')}${unread() ? `<span class="dot">${unread()}</span>` : ''}</a>` : ''),
    tabs: [
      { id: 'today', label: 'Today', icon: 'home', href: '#/today', badge: () => (pro() ? queue().length : 0) },
      { id: 'patients', label: 'Patients', icon: 'users', href: '#/patients' },
      { id: 'rx', label: 'Rx', icon: 'rx', href: '#/rx' },
      { id: 'avail', label: 'Schedule', icon: 'calendar', href: '#/availability' },
      { id: 'more', label: 'More', icon: 'menu', href: '#/more' },
    ],
  });
})();
