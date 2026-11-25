/* Physio Point HTML prototype — Clinical (blueprint screens 13–17).
   Clinical visit & assessment (pain map), visit detail, prescriptions list + editor (versioned),
   print / PDF, condition templates (Draft/Approved, versioned), session plans & progress.
   Professional-type capabilities (D-020) decide who may record, prescribe exercise or prescribe medication. */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;

  /* ------------------------------------------------------------ helpers */
  const typeOf = (proId) => { const p = PP.find.professional(proId); return p ? PP.db.professionalTypes.find((t) => t.id === p.typeId) || null : null; };
  // A capability comes from the professional type; the admin can also switch medicine off for one person (D-033).
  const cap = (proId, k) => { const t = typeOf(proId); if (!t || !t[k]) return false; const p = PP.find.professional(proId); return !(k === 'canPrescribeMedication' && p && p.canPrescribeMedication === false); };
  PP.canPrescribeMedicine = (proId) => cap(proId, 'canPrescribeMedication');
  /** Pros a user may pick: a signed-in professional can only act as themselves. */
  const pickablePros = (list) => { const me = PP.ownProId(); return me ? list.filter((p) => p.id === me) : list; };
  const clinicalPros = () => PP.db.professionals.filter((p) => p.status === 'Active' && cap(p.id, 'canRecordClinical'));
  const proOpt = (p) => [p.id, `${PP.proName(p)} · ${(typeOf(p.id) || {}).name || p.designation}`];
  const livePatients = () => PP.db.patients.filter((p) => !p.mergedInto && PP.inBranch(p) && PP.canSeePatient(p.id));
  const myProId = () => { const u = PP.currentUser(); return u && u.professionalId ? u.professionalId : ''; };
  const FREQ = ['Daily', 'Twice daily', '3 times daily', 'Every other day', '3 times / week', '2 times / week', 'Weekly'];
  const RX_FREQ = ['Daily', '2 sessions / week', '3 sessions / week', '5 sessions / week', 'Weekly', 'As advised'];
  const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="muted">—</span>' : v}</dd>`).join('')}</dl>`;
  const notFound = (what, id, back) => `<div class="card">${PP.ui.empty({ icon: 'search', title: `${what} not found`, text: `Nothing with ID <code>${esc(id)}</code>.`, action: `<a class="btn" href="${back}">Go back</a>` })}</div>`;
  const nl = (s) => esc(s || '').replace(/\n/g, '<br>');

  /* --------------------------------------------- searchable patient select */
  function patientOptionsHtml(q, value) {
    const ql = (q || '').toLowerCase();
    const list = livePatients().filter((p) => !ql || `${p.name} ${p.id} ${p.mobile}`.toLowerCase().includes(ql) || p.id === value);
    const cur = value && !list.some((p) => p.id === value) ? PP.find.patient(value) : null;
    return `<option value="">${list.length ? 'Select a patient…' : 'No matching patients'}</option>${(cur ? [cur] : []).concat(list).slice(0, 250).map((p) => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.name)} · ${esc(p.id)} · ${esc(p.mobile)}</option>`).join('')}`;
  }
  function patientCombo(name, value, disabled) {
    const id = `pc-${Math.random().toString(36).slice(2, 7)}`;
    return `<div class="field" data-field="${name}"><label for="${id}">Patient<span class="req" aria-hidden="true">*</span></label>
      <div class="pp-combo">${disabled ? '' : `<div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-combo-q placeholder="Search name, patient ID or mobile" aria-label="Search patients"></div>`}
      <select class="select" id="${id}" name="${name}" required ${disabled ? 'disabled' : ''}>${patientOptionsHtml('', value)}</select></div>
      <div class="error" role="alert">Select a patient.</div></div>`;
  }
  function bindCombo(root, name, onChange) {
    const sel = PP.$(`select[name="${name}"]`, root); const q = PP.$('[data-combo-q]', sel.closest('.pp-combo'));
    if (q) q.addEventListener('input', () => {
      const cur = sel.value; sel.innerHTML = patientOptionsHtml(q.value.trim(), cur);
      const opts = Array.from(sel.options).filter((o) => o.value);
      if (opts.length === 1 && sel.value !== opts[0].value) { sel.value = opts[0].value; if (onChange) onChange(sel.value); }
    });
    sel.addEventListener('change', () => { if (onChange) onChange(sel.value); });
    return sel;
  }

  /* ------------------------------------------------------------- pain map */
  const PARTS = [
    ['head', 'Head', 'e', 0, 28, 16, 19], ['neck', 'Neck', 'r', -7, 46, 14, 12],
    ['shoulder-r', 'Right shoulder', 'e', -30, 66, 14, 10], ['shoulder-l', 'Left shoulder', 'e', 30, 66, 14, 10],
    ['trunk-up', null, 'r', -22, 58, 44, 44], ['trunk-low', null, 'r', -20, 104, 40, 36],
    ['arm-r', 'Right upper arm', 'r', -47, 77, 13, 44], ['arm-l', 'Left upper arm', 'r', 34, 77, 13, 44],
    ['hand-r', 'Right forearm / hand', 'r', -51, 123, 12, 50], ['hand-l', 'Left forearm / hand', 'r', 39, 123, 12, 50],
    ['hip-r', null, 'e', -11, 150, 11, 10], ['hip-l', null, 'e', 11, 150, 11, 10],
    ['thigh-r', 'Right thigh', 'r', -22, 161, 18, 50], ['thigh-l', 'Left thigh', 'r', 4, 161, 18, 50],
    ['knee-r', 'Right knee', 'e', -13, 220, 9, 8], ['knee-l', 'Left knee', 'e', 13, 220, 9, 8],
    ['leg-r', null, 'r', -21, 229, 16, 40], ['leg-l', null, 'r', 5, 229, 16, 40],
    ['foot-r', 'Right ankle / foot', 'e', -13, 276, 10, 6], ['foot-l', 'Left ankle / foot', 'e', 13, 276, 10, 6],
  ];
  const VIEW_NAMES = {
    front: { 'trunk-up': 'Chest', 'trunk-low': 'Abdomen', 'hip-r': 'Right hip / groin', 'hip-l': 'Left hip / groin', 'leg-r': 'Right shin', 'leg-l': 'Left shin' },
    back: { 'trunk-up': 'Upper back', 'trunk-low': 'Lower back', 'hip-r': 'Left buttock', 'hip-l': 'Right buttock', 'leg-r': 'Left calf', 'leg-l': 'Right calf' },
  };
  function regionLabel(view, key, label) {
    let l = VIEW_NAMES[view][key] || label;
    // In the back view the figure's left is on the viewer's left.
    if (view === 'back' && !VIEW_NAMES.back[key]) l = l.replace(/^Right /, '§').replace(/^Left /, 'Right ').replace(/^§/, 'Left ');
    return `${l} (${view})`;
  }
  const REGIONS = {};
  ['front', 'back'].forEach((view) => PARTS.forEach(([key, label]) => { REGIONS[`${view}:${key}`] = regionLabel(view, key, label); }));
  function painMapSvg(selected, interactive) {
    const sel = new Set(selected || []);
    const fig = (view, cx) => PARTS.map(([key, , shape, dx, y, a, b]) => {
      const id = `${view}:${key}`; const on = sel.has(id);
      const geo = shape === 'e' ? `<ellipse cx="${cx + dx}" cy="${y}" rx="${a}" ry="${b}"/>` : `<rect x="${cx + dx}" y="${y}" width="${a}" height="${b}" rx="6"/>`;
      return `<g class="pp-pm-region ${on ? 'on' : ''}" data-region="${id}" ${interactive ? `tabindex="0" role="button" aria-pressed="${on}"` : ''} aria-label="${esc(REGIONS[id])}"><title>${esc(REGIONS[id])}</title>${geo}</g>`;
    }).join('');
    return `<svg class="pp-painmap-svg ${interactive ? 'is-interactive' : ''}" viewBox="0 0 360 300" role="${interactive ? 'group' : 'img'}" aria-label="Pain map, front and back body views">
      <text x="90" y="296" text-anchor="middle" class="pp-pm-cap">Front</text><text x="270" y="296" text-anchor="middle" class="pp-pm-cap">Back</text>
      <text x="22" y="14" class="pp-pm-side">R</text><text x="150" y="14" class="pp-pm-side">L</text><text x="202" y="14" class="pp-pm-side">L</text><text x="330" y="14" class="pp-pm-side">R</text>
      ${fig('front', 90)}${fig('back', 270)}</svg>`;
  }
  function chipsHtml(list) { return list && list.length ? list.map((r) => `<span class="pp-pm-chip">${esc(REGIONS[r] || r)}</span>`).join('') : '<span class="muted small">No regions marked</span>'; }
  function bindPainMap(host, state, onChange) {
    const toggle = (g) => {
      const id = g.dataset.region; const i = state.indexOf(id);
      if (i >= 0) state.splice(i, 1); else state.push(id);
      g.classList.toggle('on', i < 0); g.setAttribute('aria-pressed', String(i < 0));
      if (onChange) onChange();
    };
    PP.$$('[data-region]', host).forEach((g) => {
      g.addEventListener('click', () => toggle(g));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g); } });
    });
  }
  const painTone = (n) => (n <= 3 ? 'positive' : n <= 6 ? 'warning' : 'error');
  const painWord = (n) => (n === 0 ? 'No pain' : n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : n <= 9 ? 'Severe' : 'Worst possible');

  /* ====================================== screen 13: clinical visit & assessment */
  PP.route('/visits/new', {
    title: 'Clinical Visit & Assessment', perm: 'clinical.write',
    render({ el, query }) {
      const F = PP.form.field;
      const appt = query.appointment ? PP.find.appointment(query.appointment) : null;
      const pid = (appt && appt.patientId) || query.patient || '';
      const pros = pickablePros(clinicalPros());
      let proId = (appt && cap(appt.professionalId, 'canRecordClinical') && appt.professionalId) || (pros.some((p) => p.id === myProId()) ? myProId() : '');
      if (!proId && pid) { const pt = PP.find.patient(pid); if (pt && pros.some((p) => p.id === pt.assignedProfessionalId)) proId = pt.assignedProfessionalId; }
      const painMap = [];
      el.innerHTML = PP.ui.pageHead({
        title: 'Clinical Visit & Assessment',
        subtitle: `Recorded by a ${esc(PP.tl('professional'))} whose professional type may record clinical notes.`,
        crumbs: [['Patients', '#/patients'], ...(pid && PP.find.patient(pid) ? [[PP.patientName(pid), `#/patients/${pid}`]] : []), ['New clinical visit']],
      }) + `
      <form id="visit-form" class="pp-clinical" novalidate>
        <div class="pp-split">
          <div class="stack">
            ${PP.ui.card({ title: 'Patient & appointment', body: `<div class="form-grid">
              <div class="full">${patientCombo('patientId', pid)}</div>
              ${F({ name: 'professionalId', label: PP.t('professional'), type: 'select', required: true, value: proId, options: pros.map(proOpt), hint: 'Only professional types allowed to record clinical notes are listed.' })}
              ${F({ name: 'date', label: 'Visit date', type: 'date', required: true, value: PP.today(), max: PP.today() })}
              <div class="full" id="appt-field"></div>
              <div class="full" id="pt-alert"></div>
            </div>` })}
            ${PP.ui.card({ title: 'Assessment', body: `<div class="form-grid">
              ${F({ name: 'complaint', label: 'Chief complaint', value: appt ? PP.serviceName(appt.serviceId).replace(/ (therapy|rehabilitation|rehab)$/i, '') : '', placeholder: 'e.g. Lower back pain for 2 weeks', full: true })}
              <div class="field full pp-pain" data-field="painScale"><label for="pain-range">Pain scale (0–10)</label>
                <div class="pp-pain-row"><input class="range" id="pain-range" type="range" name="painScale" min="0" max="10" step="1" value="5" aria-describedby="pain-out">
                <output id="pain-out" class="pp-pain-val tone-warning" for="pain-range"><b>5</b><span>Moderate</span></output></div>
                <div class="pp-pain-scale" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => `<span>${i}</span>`).join('')}</div></div>
              ${F({ name: 'assessment', label: 'Clinical assessment', type: 'textarea', full: true, placeholder: 'Findings, special tests, functional limitation' })}
              ${F({ name: 'treatment', label: 'Treatment given', type: 'textarea', full: true, rows: 2, placeholder: 'e.g. Manual therapy, ultrasound, TENS, exercises' })}
              ${F({ name: 'advice', label: 'Follow-up advice', type: 'textarea', full: true, rows: 2, placeholder: 'Home exercise programme, ice/heat, activity advice' })}
              ${F({ name: 'nextVisit', label: 'Next suggested visit', type: 'date', value: PP.addDays(PP.today(), 7), min: PP.today() })}
            </div>` })}
            ${PP.ui.card({ title: 'Pain map', actions: '<button type="button" class="btn btn-ghost btn-sm" data-pm-clear>Clear</button>', body: `
              <p class="form-note" style="margin-top:0">Click or tap the body regions where the patient reports pain. Click again to remove.</p>
              <div class="pp-painmap" id="pain-map">${painMapSvg(painMap, true)}</div>
              <div class="pp-pm-chips" id="pm-chips">${chipsHtml(painMap)}</div>` })}
          </div>
          <div class="stack">
            ${PP.ui.card({ title: 'Vitals', body: `<div class="stack">
              ${F({ name: 'bp', label: 'Blood pressure (mmHg)', placeholder: '120/80', error: 'Use the format 120/80.' })}
              ${F({ name: 'pulse', label: 'Pulse (bpm)', type: 'number', min: 30, max: 220, rule: 'nonneg', placeholder: '72' })}
            </div>` })}
            ${PP.ui.card({ title: 'Range of motion', body: F({ name: 'rom', label: 'Range of motion', type: 'textarea', rows: 3, placeholder: 'e.g. Knee flexion 95°, extension −5°' }) })}
            ${PP.ui.alert('info', 'Saving marks the linked appointment as <b>Completed</b>. Clinical notes are recorded in the audit log.')}
          </div>
        </div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${pid ? `#/patients/${esc(pid)}` : '#/patients'}">Cancel</a>
          <button class="btn btn-primary" type="submit" data-save>${PP.icon('check')} Save clinical visit</button>
        </div>
      </form>`;
      const form = PP.$('#visit-form', el);

      function drawAppt(patientId, selected) {
        const list = PP.db.appointments.filter((a) => a.patientId === patientId && !['Cancelled', 'No-show'].includes(a.status)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)).slice(0, 25);
        const todays = list.find((a) => a.date === PP.today() && a.status !== 'Completed');
        const val = selected != null ? selected : (todays ? todays.id : '');
        PP.$('#appt-field', el).innerHTML = F({ name: 'appointmentId', label: 'Linked appointment', type: 'select', value: val, placeholder: patientId ? (list.length ? 'No linked appointment (walk-in)' : 'This patient has no appointments') : 'Select a patient first', options: list.map((a) => [a.id, `${PP.fmt.date(a.date)} · ${PP.fmt.time(a.start)} · ${PP.serviceName(a.serviceId)} · ${PP.proShort(a.professionalId)} · ${a.status}`]), hint: 'Optional. Choosing one links the visit and completes the appointment.' });
        const s = PP.$('[name="appointmentId"]', el);
        s.addEventListener('change', () => {
          const a = PP.find.appointment(s.value); if (!a) return;
          const ps = PP.$('[name="professionalId"]', form); if (cap(a.professionalId, 'canRecordClinical')) ps.value = a.professionalId;
          const c = PP.$('[name="complaint"]', form); if (!c.value) c.value = PP.serviceName(a.serviceId);
          const ex = PP.db.visits.find((v) => v.appointmentId === a.id);
          PP.$('#pt-alert', el).innerHTML = ex ? PP.ui.alert('warning', `A visit (<a href="#/visits/${esc(ex.id)}">${esc(ex.id)}</a>) is already linked to this appointment.`) : '';
        });
      }
      function drawPatientAlert(patientId) {
        const p = PP.find.patient(patientId); const box = PP.$('#pt-alert', el);
        if (!p) { box.innerHTML = ''; return; }
        const allergy = p.allergies && !/^(none|none known|nil|no)\b/i.test(p.allergies);
        box.innerHTML = `<div class="pp-pt-mini"><span class="avatar">${esc(PP.initials(p.name))}</span><div><b>${esc(p.name)}</b> <span class="mono muted small">${esc(p.id)}</span><div class="small muted">${esc(p.gender || '—')} · ${esc(p.dob ? PP.fmt.age(p.dob) : '—')} · ${esc(p.medicalHistory || '')}</div></div>${allergy ? `<span class="badge error">Allergy: ${esc(p.allergies)}</span>` : ''}</div>`;
      }
      bindCombo(form, 'patientId', (v) => { drawAppt(v, ''); drawPatientAlert(v); });
      drawAppt(pid, appt ? appt.id : null); drawPatientAlert(pid);

      const range = PP.$('#pain-range', form); const out = PP.$('#pain-out', form);
      const paint = () => { const n = Number(range.value); out.className = `pp-pain-val tone-${painTone(n)}`; out.innerHTML = `<b>${n}</b><span>${painWord(n)}</span>`; range.style.setProperty('--pp-pain-pct', `${n * 10}%`); };
      range.addEventListener('input', paint); paint();

      const pmHost = PP.$('#pain-map', form);
      const drawChips = () => { PP.$('#pm-chips', form).innerHTML = chipsHtml(painMap); };
      bindPainMap(pmHost, painMap, drawChips);
      PP.$('[data-pm-clear]', form).addEventListener('click', () => { painMap.length = 0; pmHost.innerHTML = painMapSvg(painMap, true); bindPainMap(pmHost, painMap, drawChips); drawChips(); });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let ok = PP.form.validate(form); const d = PP.form.read(form);
        if (d.bp && !/^\d{2,3}\/\d{2,3}$/.test(d.bp)) { PP.form.setError(form, 'bp', 'Use the format 120/80.'); ok = false; }
        if (d.pulse && (Number(d.pulse) < 30 || Number(d.pulse) > 220)) { PP.form.setError(form, 'pulse', 'Enter a pulse between 30 and 220.'); ok = false; }
        if (d.professionalId && !cap(d.professionalId, 'canRecordClinical')) { PP.form.setError(form, 'professionalId', 'This professional type cannot record clinical notes.'); ok = false; }
        if (!ok) return;
        await PP.ui.busy(PP.$('[data-save]', form), () => {
          const a = d.appointmentId ? PP.find.appointment(d.appointmentId) : null; const pt = PP.find.patient(d.patientId);
          const v = {
            id: PP.nextId('VIS'), appointmentId: a ? a.id : null, patientId: d.patientId, professionalId: d.professionalId,
            branchId: (a && a.branchId) || (pt && pt.branchId) || (PP.find.professional(d.professionalId) || {}).branchId || null, date: d.date,
            complaint: d.complaint, painScale: Number(d.painScale), assessment: d.assessment, treatment: d.treatment, advice: d.advice, nextVisit: d.nextVisit,
            vitals: { bp: d.bp, pulse: d.pulse ? Number(d.pulse) : '' }, rom: d.rom, painMap: painMap.slice(), form: PP.db.settings.businessType || 'physiotherapy',
            status: 'Completed', createdBy: (PP.currentUser() || {}).id || null, createdAt: PP.nowStamp(),
          };
          PP.db.visits.push(v);
          if (a && a.status !== 'Completed') { a.status = 'Completed'; PP.audit('Appointment completed', a.id, `Linked to ${v.id}`); }
          PP.audit('Clinical visit recorded', v.id, `${pt ? pt.name : v.patientId} · pain ${v.painScale}/10`);
          PP.save(); PP.ui.toast(`Clinical visit saved · ${esc(v.id)}`);
          PP.go(`#/visits/${v.id}`);
        });
      });
    },
  });

  /* ------------------------------------------------------------ visit detail */
  PP.route('/visits/:id', {
    title: (p) => `Visit ${p.id}`, perm: 'clinical.view',
    render({ el, params }) {
      const v = PP.find.visit(params.id); if (!v) { el.innerHTML = notFound('Visit', params.id, '#/patients'); return; }
      if (PP.denyPatient(el, v.patientId)) return;
      const pt = PP.find.patient(v.patientId) || { id: v.patientId, name: '—' }; const pro = PP.find.professional(v.professionalId);
      const rxs = PP.db.prescriptions.filter((r) => r.visitId === v.id);
      const a = v.appointmentId ? PP.find.appointment(v.appointmentId) : null;
      const n = Number(v.painScale) || 0;
      el.innerHTML = PP.ui.pageHead({
        title: `Clinical visit ${esc(v.id)}`, subtitle: `${esc(pt.name)} · ${esc(PP.fmt.dateLong(v.date))} · ${esc(PP.proName(pro))}`,
        crumbs: [['Patients', '#/patients'], [pt.name, `#/patients/${pt.id}`], ['Visit ' + v.id]],
        actions: `<span class="no-print row">${PP.can('clinical.write') ? `<a class="btn btn-primary" href="#/prescriptions/new?patient=${esc(pt.id)}&visit=${esc(v.id)}">${PP.icon('rx')} Create prescription</a>` : ''}
          <button class="btn" data-print>${PP.icon('printer')} Print</button><a class="btn btn-ghost" href="#/patients/${esc(pt.id)}?tab=visits">Patient timeline</a></span>`,
      }) + `
      <div class="pp-split pp-clinical">
        <div class="stack">
          ${PP.ui.card({ title: 'Assessment', actions: PP.ui.badge(v.status || 'Completed'), body: `
            <div class="pp-pain-summary"><span class="pp-pain-val tone-${painTone(n)}"><b>${esc(n)}</b><span>${painWord(n)}</span></span>
              <div class="grow"><div class="small muted">Pain scale</div><div class="pp-pain-bar"><span style="width:${n * 10}%" class="tone-${painTone(n)}"></span></div></div></div>
            <div class="divider"></div>
            ${kv([['Chief complaint', esc(v.complaint)], ['Clinical assessment', nl(v.assessment)], ['Treatment given', nl(v.treatment)], ['Follow-up advice', nl(v.advice)], ['Next suggested visit', esc(v.nextVisit ? PP.fmt.date(v.nextVisit) : '')]])}` })}
          ${PP.ui.card({ title: 'Pain map', body: `<div class="pp-painmap">${painMapSvg(v.painMap || [], false)}</div><div class="pp-pm-chips">${chipsHtml(v.painMap || [])}</div>` })}
        </div>
        <div class="stack">
          ${PP.ui.card({ title: 'Visit', body: kv([['Patient', `<a href="#/patients/${esc(pt.id)}">${esc(pt.name)}</a> <span class="mono muted small">${esc(pt.id)}</span>`], [PP.t('professional'), `${esc(PP.proName(pro))}${pro ? `<span class="sub small muted">${esc(pro.designation)} · Reg. ${esc(pro.registrationNo)}</span>` : ''}`], ['Date', esc(PP.fmt.date(v.date))], ['Appointment', a ? `<span class="mono">${esc(a.id)}</span> · ${esc(PP.serviceName(a.serviceId))} ${PP.ui.badge(a.status)}` : 'Walk-in / not linked'], ['Branch', esc(PP.branchName(v.branchId))]]) })}
          ${PP.ui.card({ title: 'Vitals & range of motion', body: kv([['Blood pressure', esc(v.vitals && v.vitals.bp ? `${v.vitals.bp} mmHg` : '')], ['Pulse', esc(v.vitals && v.vitals.pulse ? `${v.vitals.pulse} bpm` : '')], ['Range of motion', esc(v.rom)]]) })}
          ${PP.ui.card({ title: `Prescriptions (${rxs.length})`, flush: true, body: rxs.length ? `<ul class="list">${rxs.map((r) => `<li><div class="grow"><a href="#/prescriptions/${esc(r.id)}"><b>${esc(r.condition || r.id)}</b></a><div class="small muted mono">${esc(r.id)} · v${esc(r.version || 1)}</div></div>${PP.ui.badge(r.status)}</li>`).join('')}</ul>` : PP.ui.empty({ icon: 'rx', title: 'No prescription yet', text: 'Create one from this visit.' }) })}
        </div>
      </div>`;
      PP.$('[data-print]', el).addEventListener('click', () => window.print());
    },
  });

  /* ======================================================= prescriptions list */
  PP.route('/prescriptions', {
    title: 'Prescriptions', perm: 'clinical.view',
    render({ el }) {
      const rows = () => PP.db.prescriptions.filter((r) => PP.inBranch(r) && PP.canSeePatient(r.patientId));
      const all = rows(); const ms = PP.monthStart(PP.today());
      el.innerHTML = PP.ui.pageHead({
        title: 'Prescriptions', subtitle: 'Issued prescriptions are versioned: a revision never overwrites the earlier version.',
        crumbs: [['Dashboard', '#/dashboard'], ['Prescriptions']],
        actions: `<a class="btn" href="#/prescriptions/templates">${PP.icon('layers')} Condition templates</a>${PP.can('clinical.write') ? `<a class="btn btn-primary" href="#/prescriptions/new">${PP.icon('plus')} New prescription</a>` : ''}`,
      }) + `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Issued', value: all.filter((r) => r.status === 'Issued').length, icon: 'checkCircle', tone: 'positive' })}
          ${PP.ui.kpi({ label: 'Drafts', value: all.filter((r) => r.status === 'Draft').length, hint: 'Not yet issued', icon: 'edit', tone: 'warning' })}
          ${PP.ui.kpi({ label: 'This month', value: all.filter((r) => r.date >= ms).length, icon: 'calendar', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Revised', value: all.filter((r) => (r.version || 1) > 1).length, hint: 'With earlier versions kept', icon: 'repeat', tone: 'lavender' })}
        </div><section class="card mt-4" id="rx-table"></section>`;
      PP.ui.table(PP.$('#rx-table', el), {
        getRows: rows, exportName: 'prescriptions', sortKey: 'date', sortDir: 'desc',
        search: { placeholder: 'Search patient, prescription ID or condition', text: (r) => `${PP.patientName(r.patientId)} ${r.patientId} ${r.id} ${r.condition}` },
        filters: [
          { id: 'status', label: 'Any status', options: [['Draft', 'Draft'], ['Issued', 'Issued']], match: (r, v) => r.status === v },
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: PP.db.professionals.map((p) => [p.id, PP.proName(p)]), match: (r, v) => r.professionalId === v },
        ],
        columns: [
          { key: 'id', label: 'Prescription', sort: (r) => r.id, render: (r) => `<span class="mono">${esc(r.id)}</span>`, exportValue: (r) => r.id },
          { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => esc(PP.fmt.date(r.date)), exportValue: (r) => r.date },
          { key: 'patient', label: 'Patient', sort: (r) => PP.patientName(r.patientId), render: (r) => `<b>${esc(PP.patientName(r.patientId))}</b><span class="sub mono">${esc(r.patientId)}</span>`, exportValue: (r) => `${PP.patientName(r.patientId)} (${r.patientId})` },
          { key: 'condition', label: 'Condition', render: (r) => `${esc(r.condition || '—')}<span class="sub">${esc((r.items || []).length)} exercises${(r.medications || []).length ? ` · ${r.medications.length} medications` : ''}</span>`, exportValue: (r) => r.condition },
          { key: 'pro', label: PP.t('professional'), render: (r) => esc(PP.proName(r.professionalId)) },
          { key: 'version', label: 'Version', sort: (r) => r.version || 1, render: (r) => `v${esc(r.version || 1)}` },
          { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status), exportValue: (r) => r.status },
        ],
        empty: { icon: 'rx', title: 'No prescriptions yet', text: 'Prescriptions are created from a clinical visit.' },
        onRowClick: (r) => PP.go(`#/prescriptions/${r.id}`),
      });
    },
  });

  /* ------------------------------------------------- exercise items editor */
  function itemsEditor(container, items, readonly, onChange) {
    function draw() {
      if (!items.length) { container.innerHTML = PP.ui.empty({ icon: 'dumbbell', title: 'No exercises added', text: readonly ? '' : 'Apply a condition template or add exercises from the library.' }); return; }
      container.innerHTML = `<div class="table-wrap"><table class="table pp-items"><thead><tr><th>#</th><th>Exercise</th><th>Sets</th><th>Reps</th><th>Frequency</th>${readonly ? '' : '<th><span class="sr-only">Remove</span></th>'}</tr></thead><tbody>
        ${items.map((it, i) => {
          const ex = PP.find.exercise(it.exerciseId) || { name: it.exerciseId, area: '', instructions: '' };
          const ro = readonly ? 'disabled' : '';
          return `<tr><td class="mono">${i + 1}</td><td class="pp-ex-cell">${PP.exerciseAnim ? `<span class="pp-ex-thumb">${PP.exerciseMedia(ex)}</span>` : ''}<b>${esc(ex.name)}</b> <span class="badge neutral">${esc(ex.area)}</span><span class="sub">${esc(ex.instructions)}</span></td>
            <td><input class="input pp-num" type="number" min="1" max="50" data-i="${i}" data-k="sets" value="${esc(it.sets)}" aria-label="Sets for ${esc(ex.name)}" ${ro}></td>
            <td><input class="input pp-num" type="number" min="1" max="200" data-i="${i}" data-k="reps" value="${esc(it.reps)}" aria-label="Repetitions for ${esc(ex.name)}" ${ro}></td>
            <td><select class="select pp-freq" data-i="${i}" data-k="frequency" aria-label="Frequency for ${esc(ex.name)}" ${ro}>${FREQ.concat(FREQ.includes(it.frequency) || !it.frequency ? [] : [it.frequency]).map((f) => `<option ${f === it.frequency ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></td>
            ${readonly ? '' : `<td><button type="button" class="btn btn-ghost btn-sm btn-icon" data-rm="${i}" aria-label="Remove ${esc(ex.name)}">${PP.icon('trash')}</button></td>`}</tr>`;
        }).join('')}</tbody></table></div>`;
      PP.$$('[data-k]', container).forEach((inp) => inp.addEventListener('change', () => {
        const it = items[Number(inp.dataset.i)]; const k = inp.dataset.k;
        it[k] = k === 'frequency' ? inp.value : Math.max(1, Number(inp.value) || 1); if (k !== 'frequency') inp.value = it[k];
        if (onChange) onChange();
      }));
      PP.$$('[data-rm]', container).forEach((b) => b.addEventListener('click', () => { items.splice(Number(b.dataset.rm), 1); draw(); if (onChange) onChange(); }));
    }
    draw();
    return { draw };
  }
  function openLibrary(items, onDone) {
    const areas = Array.from(new Set(PP.db.exercises.map((e) => e.area)));
    let added = 0;
    const m = PP.ui.modal({
      title: 'Exercise library', size: 'lg',
      body: `<div class="row pp-lib-tools"><div class="input-icon grow">${PP.icon('search')}<input class="input" type="search" data-lq placeholder="Search exercises" aria-label="Search exercises"></div>
        <select class="select" data-la aria-label="Body area" style="width:auto;min-width:150px"><option value="">All areas</option>${areas.map((a) => `<option>${esc(a)}</option>`).join('')}</select></div>
        <ul class="list pp-lib mt-3" data-list></ul>`,
      buttons: [{ label: 'Done', kind: 'primary' }],
      onOpen(body) {
        const q = PP.$('[data-lq]', body); const ar = PP.$('[data-la]', body); const ul = PP.$('[data-list]', body);
        const draw = () => {
          const t = q.value.trim().toLowerCase(); const a = ar.value;
          const list = PP.db.exercises.filter((e) => (!a || e.area === a) && (!t || `${e.name} ${e.area} ${e.instructions}`.toLowerCase().includes(t)));
          ul.innerHTML = list.length ? list.map((e) => { const has = items.some((i) => i.exerciseId === e.id); return `<li><span class="pp-ex-ico pp-ex-thumb">${PP.exerciseMedia ? PP.exerciseMedia(e) : PP.icon('dumbbell')}</span><div class="grow"><b>${esc(e.name)}</b> <span class="badge neutral">${esc(e.area)}</span> <span class="small muted">${esc(e.media)}</span><div class="small muted">${esc(e.instructions)}</div></div>
            <button type="button" class="btn btn-sm ${has ? '' : 'btn-primary'}" data-add="${esc(e.id)}" ${has ? 'disabled' : ''}>${has ? `${PP.icon('check')} Added` : `${PP.icon('plus')} Add`}</button></li>`; }).join('')
            : `<li>${PP.ui.empty({ icon: 'search', title: 'No exercises match', text: 'Try another search or area.' })}</li>`;
          PP.$$('[data-add]', ul).forEach((b) => b.addEventListener('click', () => { items.push({ exerciseId: b.dataset.add, sets: 3, reps: 10, frequency: 'Daily' }); added++; draw(); if (onDone) onDone(); }));
        };
        q.addEventListener('input', draw); ar.addEventListener('change', draw); draw();
      },
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (added) PP.ui.toast(`${added} exercise${added > 1 ? 's' : ''} added`); } });
    obs.observe(document.body, { childList: true });
  }
  function staticItems(items, withInstructions) {
    if (!items || !items.length) return '<p class="muted">No exercises.</p>';
    return `<div class="table-wrap"><table class="table pp-items"><thead><tr><th>#</th><th>Exercise</th><th>Sets × reps</th><th>Frequency</th>${withInstructions ? '<th>Instructions</th>' : ''}</tr></thead><tbody>
      ${items.map((it, i) => { const ex = PP.find.exercise(it.exerciseId) || { name: it.exerciseId, area: '', instructions: '' }; return `<tr><td>${i + 1}</td><td>${PP.exerciseAnim ? `<span class="pp-ex-thumb">${PP.exerciseMedia(ex)}</span>` : ''}<b>${esc(ex.name)}</b>${ex.area ? `<span class="sub">${esc(ex.area)}</span>` : ''}</td><td class="nowrap">${esc(it.sets)} × ${esc(it.reps)}</td><td>${esc(it.frequency || '')}</td>${withInstructions ? `<td>${esc(ex.instructions)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
  }
  function staticMeds(meds) {
    if (!meds || !meds.length) return '';
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr></thead><tbody>${meds.map((m) => `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.dose)}</td><td>${esc(m.frequency)}</td><td>${esc(m.duration)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ======================================================== screen 14: editor */
  PP.route('/prescriptions/new', { title: 'New Prescription', perm: 'clinical.write', render({ el, query }) { renderRx(el, null, query); } });
  PP.route('/prescriptions/:id', {
    title: (p) => `Prescription ${p.id}`, perm: 'clinical.view',
    render({ el, params, query }) { const rx = PP.find.prescription(params.id); if (!rx) { el.innerHTML = notFound('Prescription', params.id, '#/prescriptions'); return; } if (PP.denyPatient(el, rx.patientId)) return; renderRx(el, rx, query); },
  });

  function renderRx(el, rx0, query) {
    const isNew = !rx0; const F = PP.form.field;
    const canEdit = PP.can('clinical.write');
    const rx = rx0 ? PP.clone(rx0) : {
      id: null, patientId: query.patient || '', visitId: query.visit || '', professionalId: '', branchId: null, date: PP.today(), templateId: '', condition: '', assessment: '', plan: '',
      items: [], medications: [], frequency: '3 sessions / week', followUp: PP.addDays(PP.today(), 7), status: 'Draft', version: 1, versions: [],
    };
    rx.items = rx.items || []; rx.medications = rx.medications || []; rx.versions = rx.versions || [];
    if (isNew) {
      const v = rx.visitId ? PP.find.visit(rx.visitId) : null;
      if (v) { rx.patientId = v.patientId; rx.professionalId = v.professionalId; rx.assessment = v.assessment || ''; rx.condition = v.complaint || ''; rx.cc = v.complaint || ''; rx.oe = [v.assessment, v.rom].filter(Boolean).join('\n'); rx.advice = v.advice || ''; rx.painScore = v.painScale; }
      const mine = myProId(); if (mine && cap(mine, 'canRecordClinical')) rx.professionalId = mine;
    }
    const pros = pickablePros(clinicalPros()); if (rx.professionalId && !pros.some((p) => p.id === rx.professionalId) && PP.find.professional(rx.professionalId)) pros.push(PP.find.professional(rx.professionalId));
    const tpls = PP.db.templates.filter((t) => t.status === 'Approved' || t.version > 1 || (t.history || []).length);
    const pt = PP.find.patient(rx.patientId);
    el.innerHTML = PP.ui.pageHead({
      title: isNew ? 'New Prescription' : `Prescription ${esc(rx.id)}`,
      subtitle: isNew ? 'Exercise and treatment plan for a clinical visit.' : `${esc(PP.patientName(rx.patientId))} · ${esc(rx.patientId)} · version ${esc(rx.version || 1)}`,
      crumbs: [['Prescriptions', '#/prescriptions'], [isNew ? 'New' : rx.id]],
      actions: isNew ? '' : `${pt ? `<a class="btn btn-ghost" href="#/patients/${esc(pt.id)}?tab=prescriptions">Patient profile</a>` : ''}<a class="btn" href="#/prescriptions/${esc(rx.id)}/print">${PP.icon('printer')} Print / PDF</a>`,
    }) + `
    <form id="rx-form" class="pp-clinical" novalidate>
      ${canEdit ? '' : PP.ui.alert('info', 'Read-only: your role cannot edit prescriptions.')}
      <div class="pp-split mt-3">
        <div class="stack">
          ${PP.ui.card({ title: 'Patient & visit', body: `<div class="form-grid">
            <div class="full">${patientCombo('patientId', rx.patientId, !canEdit)}</div>
            <div id="visit-field"></div>
            ${F({ name: 'professionalId', label: PP.t('professional'), type: 'select', required: true, value: rx.professionalId, placeholder: pros.length > 1 ? undefined : false, options: pros.map(proOpt), disabled: !canEdit })}
          </div>` })}
          ${PP.rxPad.detailsCard(rx, canEdit)}
          ${PP.ui.card({ title: 'Condition & assessment', body: `<div class="form-grid">
            <div class="field full"><label for="rx-tpl">Condition template</label><div class="row pp-tpl-row">
              <select class="select grow" id="rx-tpl" data-tpl ${canEdit ? '' : 'disabled'}><option value="">Choose an approved template…</option>${tpls.map((t) => `<option value="${esc(t.id)}" ${t.id === rx.templateId ? 'selected' : ''}>${esc(t.name)} · ${esc(t.condition)} · v${esc(t.version)}${t.status !== 'Approved' ? ' (revision in draft)' : ''}</option>`).join('')}</select>
              <button type="button" class="btn" data-apply ${canEdit ? '' : 'disabled'}>${PP.icon('layers')} Apply</button></div>
              <div class="hint">Applying a template fills the plan and the exercise items. <a href="#/prescriptions/templates">Manage templates</a></div></div>
            ${F({ name: 'condition', label: 'Condition', value: rx.condition, placeholder: 'e.g. Knee pain', disabled: !canEdit })}
            <div></div>
            ${F({ name: 'assessment', label: 'Clinical assessment', type: 'textarea', value: rx.assessment, full: true, disabled: !canEdit })}
            ${F({ name: 'plan', label: 'Exercise & treatment plan', type: 'textarea', rows: 4, value: rx.plan, full: true, disabled: !canEdit })}
          </div>` })}
          ${PP.ui.card({ title: 'Exercise items', flush: true, actions: canEdit ? `<button type="button" class="btn btn-sm btn-primary" data-lib>${PP.icon('plus')} Add from library</button>` : '', body: '<div id="rx-items"></div>' })}
          ${PP.ui.card({ title: 'ওষুধ (℞ Medicines)', flush: true, id: 'rx-meds-card', body: '<div id="rx-meds"></div>' })}
          ${PP.ui.card({ title: 'Frequency & follow-up', body: `<div class="form-grid">
            ${F({ name: 'frequency', label: 'Frequency', value: rx.frequency, attrs: 'list="rx-freq-list"', disabled: !canEdit, placeholder: 'e.g. 3 sessions / week' })}
            ${F({ name: 'followUp', label: 'Follow-up date', type: 'date', value: rx.followUp, disabled: !canEdit })}
          </div><datalist id="rx-freq-list">${RX_FREQ.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>` })}
        </div>
        <aside class="stack">
          <div id="rx-status"></div>
          ${PP.ui.card({ title: 'Version history', flush: true, body: '<div id="rx-history"></div>' })}
          ${canEdit ? `<div class="card pp-rx-actions"><div class="card-body stack">
            ${rx.status === 'Issued' ? '' : `<button type="button" class="btn" data-draft>${PP.icon('edit')} Save Draft</button>`}
            <button type="button" class="btn btn-primary" data-issue>${PP.icon('checkCircle')} ${rx.status === 'Issued' ? `Issue revision (v${(rx.version || 1) + 1})` : 'Issue Prescription'}</button>
            <div class="small muted" data-issue-note></div>
          </div></div>` : ''}
        </aside>
      </div>
    </form>`;
    const form = PP.$('#rx-form', el);

    function drawVisits(patientId, selected) {
      // Only today's visits (D-033); an existing prescription keeps showing its own visit.
      const list = PP.db.visits.filter((v) => v.patientId === patientId && (v.date === PP.today() || v.id === selected)).sort((a, b) => b.date.localeCompare(a.date));
      const opts = list.map((v) => [v.id, `${v.date === PP.today() ? 'আজ' : PP.fmt.date(v.date)} · ${v.complaint || 'Visit'} · ${v.id}`]);
      if (patientId && canEdit && !list.some((v) => v.date === PP.today())) opts.unshift(['__today', `আজকের নতুন ভিজিট (${PP.fmt.date(PP.today())}) — সেভ করলে তৈরি হবে`]);
      if (!selected && opts.length) selected = opts[0][0];
      PP.$('#visit-field', el).innerHTML = F({ name: 'visitId', label: 'Clinical visit', type: 'select', required: true, value: selected, disabled: !canEdit, error: 'Select the visit this prescription belongs to.',
        placeholder: patientId ? false : 'Select a patient first', options: opts,
        hint: patientId ? `আগের ভিজিট ও রিপোর্ট রোগীর প্রোফাইলে দেখুন: <a href="#/patients/${esc(patientId)}?tab=visits">Visit history</a>` : '' });
      const s = PP.$('[name="visitId"]', el);
      s.addEventListener('change', () => {
        const v = PP.find.visit(s.value); if (!v) return;
        const ps = PP.$('[name="professionalId"]', form); if (!ps.value && PP.$(`option[value="${v.professionalId}"]`, ps)) { ps.value = v.professionalId; drawCaps(); }
        const a = PP.$('[name="assessment"]', form); if (!a.value) a.value = v.assessment || '';
        const c = PP.$('[name="condition"]', form); if (!c.value) c.value = v.complaint || '';
      });
    }
    if (canEdit) bindCombo(form, 'patientId', (v) => drawVisits(v, ''));
    drawVisits(rx.patientId, rx.visitId);

    const itemsEd = itemsEditor(PP.$('#rx-items', el), rx.items, !canEdit);
    const libBtn = PP.$('[data-lib]', el); if (libBtn) libBtn.addEventListener('click', () => openLibrary(rx.items, () => itemsEd.draw()));

    function drawMeds() {
      const host = PP.$('#rx-meds', el); const proId = PP.$('[name="professionalId"]', form).value; const t = typeOf(proId);
      if (!proId) { host.innerHTML = `<div class="card-body">${PP.ui.alert('info', `Choose the ${esc(PP.tl('professional'))} to see whether medication items are allowed.`)}</div>`; return; }
      if (!cap(proId, 'canPrescribeMedication')) {
        host.innerHTML = `<div class="card-body">${PP.ui.alert('info', `<b>${esc(t ? t.name : 'This professional type')}</b> cannot prescribe medication. Medication items are only available when the professional type has “Can prescribe medication” enabled (D-020).${rx.medications.length ? ' Existing medication items will not be saved.' : ''}`)}</div>`;
        return;
      }
      if (PP.rxPad && PP.rxPad.picker) { PP.rxPad.picker(host, rx.medications, { readOnly: !canEdit }); return; }
      const ro = canEdit ? '' : 'disabled';
      host.innerHTML = `${rx.medications.length ? `<div class="table-wrap"><table class="table pp-meds"><thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Duration</th>${canEdit ? '<th><span class="sr-only">Remove</span></th>' : ''}</tr></thead><tbody>
        ${rx.medications.map((m, i) => `<tr>${['name', 'dose', 'frequency', 'duration'].map((k) => `<td><input class="input" data-mi="${i}" data-mk="${k}" value="${esc(m[k] || '')}" placeholder="${{ name: 'e.g. Paracetamol', dose: '500 mg', frequency: 'Twice daily', duration: '5 days' }[k]}" aria-label="${k}" ${ro}></td>`).join('')}
        ${canEdit ? `<td><button type="button" class="btn btn-ghost btn-sm btn-icon" data-mrm="${i}" aria-label="Remove medication">${PP.icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : `<div class="card-body"><p class="muted" style="margin:0">No medications. ${esc(t.name)} may prescribe medication.</p></div>`}
        ${canEdit ? `<div class="card-foot"><button type="button" class="btn btn-sm" data-madd>${PP.icon('plus')} Add medication</button></div>` : ''}`;
      PP.$$('[data-mk]', host).forEach((inp) => inp.addEventListener('input', () => { rx.medications[Number(inp.dataset.mi)][inp.dataset.mk] = inp.value; }));
      PP.$$('[data-mrm]', host).forEach((b) => b.addEventListener('click', () => { rx.medications.splice(Number(b.dataset.mrm), 1); drawMeds(); }));
      const add = PP.$('[data-madd]', host); if (add) add.addEventListener('click', () => { rx.medications.push({ name: '', dose: '', frequency: '', duration: '' }); drawMeds(); const ins = PP.$$('[data-mk="name"]', host); ins[ins.length - 1].focus(); });
    }

    function issueBlock() {
      const proId = PP.$('[name="professionalId"]', form).value;
      if (!PP.can('prescriptions.issue')) return 'Your role does not include “Issue prescriptions”. Save a draft for an authorised professional to issue.';
      if (proId && !cap(proId, 'canPrescribeExercise')) return `${esc((typeOf(proId) || {}).name || 'This professional type')} may record visits but cannot issue prescriptions. Save a draft for review.`;
      return '';
    }
    function drawCaps() {
      const proId = PP.$('[name="professionalId"]', form).value; const pro = PP.find.professional(proId); const t = typeOf(proId);
      const yes = (b) => (b ? `<span class="pp-cap yes">${PP.icon('check')} Yes</span>` : `<span class="pp-cap no">${PP.icon('x')} No</span>`);
      PP.$('#rx-status', el).innerHTML = PP.ui.card({ title: 'Status', actions: PP.ui.badge(rx.status), body: `
        ${kv([['Prescription', esc(rx.id || 'New (ID on save)')], ['Version', `v${esc(rx.version || 1)}`], ['Date', esc(PP.fmt.date(rx.date))], ...(rx.issuedAt ? [['Issued', esc(PP.fmt.stamp(rx.issuedAt))]] : [])])}
        <div class="divider"></div>
        <div class="small"><b>${esc(pro ? PP.proName(pro) : `No ${PP.tl('professional')} selected`)}</b>${pro ? `<div class="muted">${esc(t ? t.name : '')} · Reg. ${esc(pro.registrationNo)}</div>` : ''}</div>
        <dl class="pp-caps"><dt>Can prescribe exercise</dt><dd>${yes(cap(proId, 'canPrescribeExercise'))}</dd><dt>Can prescribe medication</dt><dd>${yes(cap(proId, 'canPrescribeMedication'))}</dd></dl>` });
      const btn = PP.$('[data-issue]', el); const note = PP.$('[data-issue-note]', el);
      if (btn) { const block = issueBlock(); btn.disabled = !!block; note.innerHTML = block || (rx.status === 'Issued' ? `Re-issuing keeps v${esc(rx.version || 1)} in the history and creates v${(rx.version || 1) + 1}.` : 'Issued prescriptions are locked; changes create a new version.'); }
      drawMeds();
    }
    PP.$('[name="professionalId"]', form).addEventListener('change', drawCaps);
    drawCaps();

    function drawHistory() {
      const host = PP.$('#rx-history', el);
      const cur = `<li><div class="grow"><b>v${esc(rx.version || 1)}</b> <span class="badge positive">Current</span><div class="small muted">${esc(PP.fmt.date(rx.date))} · ${esc(rx.status)}</div></div></li>`;
      const old = rx.versions.slice().reverse().map((v, i) => `<li><div class="grow"><b>v${esc(v.version)}</b><div class="small muted">${esc(PP.fmt.date(v.date))} · ${esc(PP.proShort(v.by))}${v.note ? ` · ${esc(v.note)}` : ''}</div></div><button type="button" class="btn btn-sm" data-ver="${rx.versions.length - 1 - i}">${PP.icon('eye')} View</button></li>`).join('');
      host.innerHTML = `<ul class="list">${cur}${old}</ul>${rx.versions.length ? '' : '<div class="card-foot small muted">No earlier versions. Revising an issued prescription keeps the previous version here.</div>'}`;
      PP.$$('[data-ver]', host).forEach((b) => b.addEventListener('click', () => {
        const v = rx.versions[Number(b.dataset.ver)];
        PP.ui.modal({ title: `${esc(rx.id)} · version ${esc(v.version)}`, size: 'lg', body: `${PP.ui.alert('info', 'Earlier version, kept read-only (blueprint rule: revisions preserve earlier versions).')}
          <div class="mt-3">${kv([['Date', esc(PP.fmt.date(v.date))], [PP.t('professional'), esc(PP.proName(v.by))], ['Condition', esc(v.condition || rx.condition)], ['Assessment', nl(v.assessment)], ['Plan', nl(v.plan)], ['Frequency', esc(v.frequency)], ['Follow-up', esc(v.followUp ? PP.fmt.date(v.followUp) : '')], ['Revision note', esc(v.note)]])}</div>
          <h3 class="mt-4 pp-h3">Exercises</h3>${staticItems(v.items, false)}${(v.medications || []).length ? `<h3 class="mt-4 pp-h3">Medications</h3>${staticMeds(v.medications)}` : ''}`, buttons: [{ label: 'Close', kind: 'ghost' }] });
      }));
    }
    drawHistory();

    const applyBtn = PP.$('[data-apply]', el);
    if (applyBtn) applyBtn.addEventListener('click', async () => {
      const t = PP.find.template(PP.$('[data-tpl]', el).value);
      if (!t) { PP.ui.toast('Choose a condition template first', 'warning'); return; }
      const planEl = PP.$('[name="plan"]', form);
      if (rx.items.length || planEl.value.trim()) {
        const ok = await PP.ui.confirm({ title: 'Replace plan and exercises?', message: `Applying <b>${esc(t.name)}</b> replaces the current treatment plan and ${rx.items.length} exercise item${rx.items.length === 1 ? '' : 's'}.`, confirmLabel: 'Apply template' });
        if (!ok) return;
      }
      const src = t.status === 'Approved' || !(t.history || []).length ? t : t.history[t.history.length - 1];
      planEl.value = src.plan || ''; rx.items.length = 0; PP.clone(src.items || []).forEach((x) => rx.items.push(x)); rx.templateId = t.id;
      const c = PP.$('[name="condition"]', form); if (!c.value) c.value = t.condition;
      itemsEd.draw(); PP.ui.toast(`Template applied: ${esc(t.name)} v${esc(src.version || t.version)}`);
    });

    function collect() {
      const d = PP.form.read(form);
      Object.assign(rx, { patientId: d.patientId, visitId: d.visitId, professionalId: d.professionalId, condition: d.condition, assessment: d.assessment, plan: d.plan, frequency: d.frequency, followUp: d.followUp,
        cc: d.cc, oe: d.oe, advice: d.advice, investigations: d.investigations, patientNote: d.patientNote, weight: d.weight, painScore: d.painScore === '' || d.painScore == null ? null : Number(d.painScore) });
      if (rx.visitId === '__today' && rx.patientId) {
        const pt0 = PP.find.patient(rx.patientId);
        const nv = { id: PP.nextId('VIS'), appointmentId: null, patientId: rx.patientId, professionalId: rx.professionalId, branchId: (pt0 && pt0.branchId) || (PP.find.professional(rx.professionalId) || {}).branchId || null, date: PP.today(),
          complaint: rx.cc || rx.condition || '', painScale: rx.painScore == null ? null : rx.painScore, assessment: rx.oe || rx.assessment || '', treatment: '', advice: rx.advice || '', nextVisit: rx.followUp || '', vitals: {}, rom: '', painMap: [],
          form: PP.db.settings.businessType || 'physiotherapy', status: 'Completed', createdBy: (PP.currentUser() || {}).id || null, createdAt: PP.nowStamp() };
        PP.db.visits.push(nv); PP.audit('Clinical visit recorded', nv.id, 'Created with prescription'); rx.visitId = nv.id;
        const sel = PP.$('[name="visitId"]', form); if (sel) { sel.insertAdjacentHTML('beforeend', `<option value="${nv.id}">আজ · ${esc(nv.complaint || 'Visit')} · ${nv.id}</option>`); sel.value = nv.id; const t = PP.$('option[value="__today"]', sel); if (t) t.remove(); }
      }
      const v = PP.find.visit(rx.visitId); const p = PP.find.patient(rx.patientId);
      rx.branchId = (v && v.branchId) || (p && p.branchId) || rx.branchId || null;
      rx.medications = cap(rx.professionalId, 'canPrescribeMedication') ? rx.medications.filter((m) => m.name && m.name.trim()) : [];
      return rx;
    }
    const CONTENT = ['patientId', 'visitId', 'professionalId', 'branchId', 'templateId', 'condition', 'assessment', 'plan', 'items', 'medications', 'frequency', 'followUp', 'cc', 'oe', 'advice', 'investigations', 'patientNote', 'weight', 'painScore'];
    PP.rxPad.bindDetails(form);

    const draftBtn = PP.$('[data-draft]', el);
    if (draftBtn) draftBtn.addEventListener('click', async () => {
      if (!PP.form.validate(form)) return;
      await PP.ui.busy(draftBtn, () => {
        collect();
        let target = rx0;
        if (isNew) { rx.id = PP.nextId('RX'); rx.date = PP.today(); rx.createdBy = (PP.currentUser() || {}).id || null; target = PP.clone(rx); PP.db.prescriptions.push(target); }
        else CONTENT.forEach((k) => { target[k] = PP.clone(rx[k]); });
        target.status = 'Draft';
        PP.audit('Prescription draft saved', target.id, `${PP.patientName(target.patientId)} · ${target.condition || ''}`);
        PP.save(); PP.ui.toast(`Draft saved · ${esc(target.id)}`);
        PP.go(`#/prescriptions/${target.id}`);
      });
    });

    const issueBtn = PP.$('[data-issue]', el);
    if (issueBtn) issueBtn.addEventListener('click', async () => {
      if (!PP.form.validate(form)) return;
      collect();
      const block = issueBlock(); if (block) { PP.ui.toast(block, 'error'); return; }
      if (!rx.items.length && !rx.plan && !rx.medications.length) { PP.ui.toast('Add at least one medicine, exercise or treatment plan before issuing.', 'error'); return; }
      const revising = !isNew && rx0.status === 'Issued';
      const res = await PP.ui.confirm(revising
        ? { title: `Issue version ${(rx0.version || 1) + 1}?`, message: `Version ${esc(rx0.version || 1)} stays in the history, unchanged. The patient's printout will show the new version.`, confirmLabel: 'Issue revision', reasonLabel: 'What changed in this revision?', reasonRequired: true }
        : { title: 'Issue prescription?', message: `Issue to <b>${esc(PP.patientName(rx.patientId))}</b> by ${esc(PP.proName(rx.professionalId))}. After issue, changes create a new version.`, confirmLabel: 'Issue prescription' });
      if (!res) return;
      await PP.ui.busy(issueBtn, () => {
        let target = rx0;
        if (isNew) { rx.id = PP.nextId('RX'); rx.createdBy = (PP.currentUser() || {}).id || null; target = PP.clone(rx); target.versions = []; target.version = 1; PP.db.prescriptions.push(target); }
        else {
          if (revising) {
            target.versions = target.versions || [];
            target.versions.push({ version: target.version || 1, date: target.date, condition: target.condition, assessment: target.assessment, plan: target.plan, items: PP.clone(target.items || []), medications: PP.clone(target.medications || []), frequency: target.frequency, followUp: target.followUp, by: target.professionalId, note: res.reason || '',
              cc: target.cc, oe: target.oe, advice: target.advice, investigations: target.investigations, patientNote: target.patientNote, weight: target.weight, painScore: target.painScore });
            target.version = (target.version || 1) + 1;
          }
          CONTENT.forEach((k) => { target[k] = PP.clone(rx[k]); });
        }
        target.status = 'Issued'; target.date = PP.today(); target.issuedAt = PP.nowStamp(); target.issuedBy = (PP.currentUser() || {}).id || null;
        PP.audit(revising ? 'Prescription revised' : 'Prescription issued', target.id, `Version ${target.version}${revising ? ` · ${res.reason}` : ''}`);
        PP.save(); PP.ui.toast(revising ? `Version ${target.version} issued · earlier version kept` : `Prescription issued · ${esc(target.id)}`);
        PP.go(`#/prescriptions/${target.id}`);
      });
    });
  }

  /* ===================================================== screen 15: print / PDF */
  PP.route('/prescriptions/:id/print', {
    title: (p) => `Print ${p.id}`, perm: 'clinical.view',
    render({ el, params }) {
      const rx = PP.find.prescription(params.id); if (!rx) { el.innerHTML = notFound('Prescription', params.id, '#/prescriptions'); return; }
      if (PP.denyPatient(el, rx.patientId)) return;
      const s = PP.db.settings; const pt = PP.find.patient(rx.patientId) || { id: rx.patientId, name: '—' }; const pro = PP.find.professional(rx.professionalId);
      const v = rx.visitId ? PP.find.visit(rx.visitId) : null; const br = PP.find.branch(rx.branchId);
      el.innerHTML = `<div class="no-print">${PP.ui.pageHead({
        title: 'Prescription Print / PDF', subtitle: 'A4 preview using the clinic’s own branding.',
        crumbs: [['Prescriptions', '#/prescriptions'], [rx.id, `#/prescriptions/${rx.id}`], ['Print']],
        actions: `<a class="btn btn-ghost" href="#/prescriptions/${esc(rx.id)}">${PP.icon('chevL')} Back</a><button class="btn" data-pdf>${PP.icon('download')} Download PDF</button><button class="btn btn-primary" data-print>${PP.icon('printer')} Print</button>`,
      })}${rx.status !== 'Issued' ? PP.ui.alert('warning', 'This prescription is a <b>Draft</b>. The printout is watermarked and is not valid until issued.') : ''}</div>
      <div class="pp-rx-stage">
        <article class="pp-rx-sheet ${rx.status !== 'Issued' ? 'is-draft' : ''}" aria-label="Prescription ${esc(rx.id)}">
          <header class="pp-rx-header">
            <div class="pp-rx-logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="">` : PP.logoSvg}</div>
            <div class="grow"><div class="pp-rx-clinic">${esc(s.clinicName)}</div><div class="pp-rx-sub">${esc(s.prescriptionHeader || '')}</div>
              <div class="pp-rx-contact">${esc((br && br.address) || s.address)} · ${esc((br && br.phone) || s.phone)}${s.email ? ` · ${esc(s.email)}` : ''}</div></div>
            <div class="pp-rx-ref"><div class="mono"><b>${esc(rx.id)}</b></div><div>Version ${esc(rx.version || 1)}</div><div>${esc(PP.fmt.date(rx.date))}</div></div>
          </header>
          <section class="pp-rx-parties">
            <div><div class="pp-rx-label">Patient</div><b>${esc(pt.name)}</b><div class="mono">${esc(pt.id)}</div><div>${esc(pt.gender || '')}${pt.dob ? ` · ${esc(PP.fmt.age(pt.dob))}` : ''}${pt.mobile ? ` · ${esc(pt.mobile)}` : ''}</div>${pt.allergies && !/^none/i.test(pt.allergies) ? `<div class="pp-rx-allergy">Allergy: ${esc(pt.allergies)}</div>` : ''}</div>
            <div><div class="pp-rx-label">${esc(PP.t('professional'))}</div><b>${esc(PP.proName(pro))}</b>${pro ? `<div>${esc(pro.designation)}</div><div>${esc(pro.qualification)}</div><div>Reg. no. ${esc(pro.registrationNo)}</div>` : ''}</div>
          </section>
          ${rx.condition ? `<section><div class="pp-rx-label">Condition</div><p>${esc(rx.condition)}${v ? ` <span class="pp-rx-muted">(visit ${esc(v.id)}, ${esc(PP.fmt.date(v.date))})</span>` : ''}</p></section>` : ''}
          <section><div class="pp-rx-label">Clinical assessment</div><p>${nl(rx.assessment) || '—'}</p></section>
          <section><div class="pp-rx-label">Treatment plan</div><p>${nl(rx.plan) || '—'}</p></section>
          <section><div class="pp-rx-label">Exercise programme</div>${staticItems(rx.items, true)}</section>
          ${(rx.medications || []).length ? `<section><div class="pp-rx-label">Medications</div>${staticMeds(rx.medications)}</section>` : ''}
          <section class="pp-rx-grid"><div><div class="pp-rx-label">Frequency</div><p>${esc(rx.frequency || '—')}</p></div><div><div class="pp-rx-label">Follow-up</div><p>${esc(rx.followUp ? PP.fmt.dateLong(rx.followUp) : '—')}</p></div></section>
          <footer class="pp-rx-foot"><div class="pp-rx-note">Do the exercises as shown. Stop and contact the clinic if pain increases.</div>
            <div class="pp-rx-sign"><div class="pp-rx-sigline"></div><b>${esc(PP.proName(pro))}</b><div>${pro ? `Reg. no. ${esc(pro.registrationNo)}` : ''}</div></div></footer>
        </article>
      </div>`;
      // Owner's prescription pad design (2026-11-26) replaces the earlier generic sheet.
      PP.$('.pp-rx-stage', el).innerHTML = PP.rxPad.sheet(rx);
      if (PP.can('settings.manage')) {
        const bar = PP.$('.page-head .actions', el);
        if (bar) { bar.insertAdjacentHTML('afterbegin', `<button class="btn btn-ghost" data-padset>${PP.icon('settings')} প্যাডের তথ্য</button>`); PP.$('[data-padset]', el).addEventListener('click', () => PP.rxPad.editSettings(() => PP.render())); }
      }
      PP.$('[data-print]', el).addEventListener('click', () => window.print());
      PP.$('[data-pdf]', el).addEventListener('click', () => { PP.ui.toast('In the print dialog, choose <b>Save as PDF</b> as the destination.', 'info', 5000); setTimeout(() => window.print(), 400); });
    },
  });

  /* ================================================ screen 16: condition templates */
  PP.route('/prescriptions/templates', {
    title: 'Condition Templates', perm: 'clinical.view',
    render({ el }) {
      const conds = Array.from(new Set(PP.db.templates.map((t) => t.condition)));
      el.innerHTML = PP.ui.pageHead({
        title: 'Condition Templates', subtitle: 'Reusable exercise plans. Only approved templates can be applied to prescriptions; re-approving creates a new version.',
        crumbs: [['Prescriptions', '#/prescriptions'], ['Condition templates']],
        actions: PP.can('clinical.write') || PP.can('templates.manage') ? `<a class="btn btn-primary" href="#/prescriptions/templates/new">${PP.icon('plus')} New template</a>` : '',
      }) + '<section class="card" id="tpl-table"></section>';
      PP.ui.table(PP.$('#tpl-table', el), {
        rows: PP.db.templates, exportName: 'condition-templates', sortKey: 'updated', sortDir: 'desc',
        search: { placeholder: 'Search templates or conditions', text: (t) => `${t.name} ${t.condition} ${t.id}` },
        filters: [
          { id: 'status', label: 'Any status', options: [['Approved', 'Approved'], ['Draft', 'Draft']], match: (t, v) => t.status === v },
          { id: 'cond', label: 'All conditions', options: conds.map((c) => [c, c]), match: (t, v) => t.condition === v },
        ],
        columns: [
          { key: 'name', label: 'Template', sort: (t) => t.name, render: (t) => `<b>${esc(t.name)}</b><span class="sub mono">${esc(t.id)} · ${esc((t.items || []).length)} exercises</span>`, exportValue: (t) => t.name },
          { key: 'condition', label: 'Condition', sort: (t) => t.condition, render: (t) => esc(t.condition) },
          { key: 'version', label: 'Version', sort: (t) => t.version, render: (t) => `v${esc(t.version)}${(t.history || []).length ? `<span class="sub">${t.history.length} earlier</span>` : ''}`, exportValue: (t) => t.version },
          { key: 'status', label: 'Approval status', render: (t) => PP.ui.badge(t.status), exportValue: (t) => t.status },
          { key: 'updated', label: 'Updated', sort: (t) => t.updatedAt || '', render: (t) => esc(PP.fmt.date(t.updatedAt)), exportValue: (t) => t.updatedAt },
        ],
        empty: { icon: 'layers', title: 'No templates yet' },
        onRowClick: (t) => PP.go(`#/prescriptions/templates/${t.id}`),
      });
    },
  });

  PP.route('/prescriptions/templates/:id', {
    title: (p) => (p.id === 'new' ? 'New Template' : `Template ${p.id}`), perm: 'clinical.view',
    render({ el, params }) {
      const isNew = params.id === 'new';
      const t0 = isNew ? null : PP.find.template(params.id);
      if (!isNew && !t0) { el.innerHTML = notFound('Template', params.id, '#/prescriptions/templates'); return; }
      const canEdit = PP.can('clinical.write') || PP.can('templates.manage'); const canApprove = PP.can('templates.manage');
      const t = t0 ? PP.clone(t0) : { id: null, name: '', condition: '', version: 1, status: 'Draft', items: [], plan: '', assessment: '', history: [], createdBy: myProId() || null };
      t.items = t.items || []; t.history = t.history || [];
      const F = PP.form.field;
      const nextVer = t0 && (t0.status === 'Approved' || t0.revising) ? t0.version + 1 : t.version;
      el.innerHTML = PP.ui.pageHead({
        title: isNew ? 'New Condition Template' : esc(t.name), subtitle: isNew ? 'Draft a reusable exercise plan for a condition.' : `${esc(t.id)} · ${esc(t.condition)} · v${esc(t.version)}`,
        crumbs: [['Prescriptions', '#/prescriptions'], ['Condition templates', '#/prescriptions/templates'], [isNew ? 'New' : t.name]],
      }) + `
      <form id="tpl-form" class="pp-clinical" novalidate>
        ${t0 && t0.revising ? PP.ui.alert('warning', `Draft revision of approved v${esc(t0.version)}. Prescriptions keep using v${esc(t0.version)} until the revision is approved as v${esc(t0.version + 1)}.`) : ''}
        <div class="pp-split mt-3">
          <div class="stack">
            ${PP.ui.card({ title: 'Template', body: `<div class="form-grid">
              ${F({ name: 'name', label: 'Template name', required: true, value: t.name, disabled: !canEdit, placeholder: 'e.g. Knee rehabilitation' })}
              ${F({ name: 'condition', label: 'Condition', required: true, value: t.condition, disabled: !canEdit, placeholder: 'e.g. Knee pain' })}
              ${F({ name: 'plan', label: 'Exercise & treatment plan', type: 'textarea', rows: 4, value: t.plan, full: true, disabled: !canEdit })}
            </div>` })}
            ${PP.ui.card({ title: 'Exercise items', flush: true, actions: canEdit ? `<button type="button" class="btn btn-sm btn-primary" data-lib>${PP.icon('plus')} Add from library</button>` : '', body: '<div id="tpl-items"></div>' })}
          </div>
          <aside class="stack">
            ${PP.ui.card({ title: 'Approval', actions: PP.ui.badge(t.status), body: `${kv([['Version', `v${esc(t.version)}`], ['Updated', esc(PP.fmt.date(t.updatedAt))], ['Approved by', esc(t.approvedBy ? (PP.find.user(t.approvedBy) || {}).name : '')], ['Created by', esc(t.createdBy ? PP.proName(t.createdBy) : '')]])}
              <p class="form-note">${canApprove ? `Approving ${t0 && (t0.status === 'Approved' || t0.revising) ? `creates <b>v${nextVer}</b> and keeps v${esc(t.version)} in the history` : 'makes this template available in the prescription editor'}.` : 'Approval needs the “Manage condition templates” permission.'}</p>` })}
            ${PP.ui.card({ title: 'Version history', flush: true, body: `<ul class="list"><li><div class="grow"><b>v${esc(t.version)}</b> ${PP.ui.badge(t.status)}<div class="small muted">Current</div></div></li>${t.history.slice().reverse().map((h, i) => `<li><div class="grow"><b>v${esc(h.version)}</b> <span class="badge neutral">Superseded</span><div class="small muted">${esc(PP.fmt.date(h.date))}</div></div><button type="button" class="btn btn-sm" data-hv="${t.history.length - 1 - i}">${PP.icon('eye')} View</button></li>`).join('')}</ul>` })}
            ${canEdit ? `<div class="card"><div class="card-body stack">
              <button type="button" class="btn" data-draft>${PP.icon('edit')} Save as draft</button>
              <button type="button" class="btn btn-primary" data-approve ${canApprove ? '' : 'disabled'}>${PP.icon('checkCircle')} Approve${t0 && (t0.status === 'Approved' || t0.revising) ? ` as v${nextVer}` : ''}</button>
            </div></div>` : ''}
          </aside>
        </div>
      </form>`;
      const form = PP.$('#tpl-form', el);
      const ed = itemsEditor(PP.$('#tpl-items', el), t.items, !canEdit);
      const lib = PP.$('[data-lib]', el); if (lib) lib.addEventListener('click', () => openLibrary(t.items, () => ed.draw()));
      PP.$$('[data-hv]', el).forEach((b) => b.addEventListener('click', () => {
        const h = t.history[Number(b.dataset.hv)];
        PP.ui.modal({ title: `${esc(t.name)} · v${esc(h.version)}`, size: 'lg', body: `${kv([['Name', esc(h.name)], ['Condition', esc(h.condition)], ['Approved', esc(PP.fmt.date(h.date))], ['Plan', nl(h.plan)]])}<h3 class="pp-h3 mt-4">Exercises</h3>${staticItems(h.items, false)}`, buttons: [{ label: 'Close', kind: 'ghost' }] });
      }));
      const snapshot = (x) => ({ version: x.version, status: x.status, name: x.name, condition: x.condition, plan: x.plan, items: PP.clone(x.items || []), date: x.approvedAt ? x.approvedAt.slice(0, 10) : x.updatedAt, by: x.approvedBy || null });
      function persist(approve) {
        const d = PP.form.read(form);
        let target = t0;
        if (isNew) { target = { id: PP.nextId('TPL', 3), version: 1, status: 'Draft', history: [], createdBy: myProId() || null, assessment: '' }; PP.db.templates.push(target); }
        const wasApproved = target.status === 'Approved';
        if (approve) {
          if (wasApproved || target.revising) {
            // Keep the previously approved content in history, then publish a new version.
            if (wasApproved) target.history.push(snapshot(target)); target.version += 1;
          }
          target.revising = false; target.status = 'Approved'; target.approvedBy = (PP.currentUser() || {}).id || null; target.approvedAt = PP.nowStamp();
        } else if (wasApproved) {
          target.history.push(snapshot(target)); target.revising = true; target.status = 'Draft';
        }
        Object.assign(target, { name: d.name, condition: d.condition, plan: d.plan, items: PP.clone(t.items), updatedAt: PP.today() });
        return target;
      }
      const draft = PP.$('[data-draft]', el);
      if (draft) draft.addEventListener('click', async () => {
        if (!PP.form.validate(form)) return;
        await PP.ui.busy(draft, () => { const x = persist(false); PP.audit('Template saved as draft', x.id, `${x.name} · v${x.version}`); PP.save(); PP.ui.toast(`Template saved as draft · ${esc(x.id)}`); PP.go(`#/prescriptions/templates/${x.id}`); });
      });
      const appr = PP.$('[data-approve]', el);
      if (appr) appr.addEventListener('click', async () => {
        if (!canApprove) return;
        if (!PP.form.validate(form)) return;
        if (!t.items.length) { PP.ui.toast('Add at least one exercise before approving.', 'error'); return; }
        if (t0 && t0.status === 'Approved') {
          const d = PP.form.read(form);
          if (d.name === t0.name && d.condition === t0.condition && d.plan === (t0.plan || '') && JSON.stringify(t.items) === JSON.stringify(t0.items)) { PP.ui.toast(`No changes: v${esc(t0.version)} is already approved.`, 'info'); return; }
        }
        const ok = await PP.ui.confirm({ title: 'Approve template?', message: `Approved templates can be applied to prescriptions.${t0 && (t0.status === 'Approved' || t0.revising) ? ` This publishes <b>v${nextVer}</b>; v${esc(t0.version)} stays in the history.` : ''}`, confirmLabel: 'Approve' });
        if (!ok) return;
        await PP.ui.busy(appr, () => {
          // If the approved template was edited directly, the snapshot happens inside persist().
          const x = persist(true); PP.audit('Template approved', x.id, `${x.name} · v${x.version}`); PP.save(); PP.ui.toast(`Template approved · v${x.version}`); PP.go(`#/prescriptions/templates/${x.id}`);
        });
      });
    },
  });

  /* ================================================= screen 17: session plans */
  const planStats = (s) => {
    const done = s.sessions.filter((x) => x.status === 'Completed').length;
    const next = s.sessions.filter((x) => x.status === 'Planned').sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    return { done, pct: s.planned ? Math.round((done / s.planned) * 100) : 0, next };
  };
  const progressBar = (pct) => `<div class="pp-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
  const packageFor = (patientId, s) => (s && s.packageId ? PP.db.packages.find((k) => k.id === s.packageId) : null) || PP.db.packages.find((k) => k.patientId === patientId && k.status === 'Active') || null;

  PP.route('/session-plans', {
    title: 'Session Plans', perm: 'clinical.view',
    render({ el }) {
      const rows = () => PP.db.sessionPlans.filter((s) => PP.inBranch(PP.find.patient(s.patientId) || {}) && PP.canSeePatient(s.patientId));
      el.innerHTML = PP.ui.pageHead({
        title: 'Session Plans', subtitle: 'Planned sessions, progress and the next session for each patient.',
        crumbs: [['Prescriptions', '#/prescriptions'], ['Session plans']],
        actions: PP.can('clinical.write') ? `<button class="btn btn-primary" data-new>${PP.icon('plus')} New session plan</button>` : '',
      }) + '<section class="card" id="sp-table"></section>';
      PP.ui.table(PP.$('#sp-table', el), {
        getRows: rows, exportName: 'session-plans',
        search: { placeholder: 'Search patient or plan', text: (s) => `${PP.patientName(s.patientId)} ${s.patientId} ${s.title} ${s.id}` },
        filters: [
          { id: 'status', label: 'Any status', options: [['Active', 'Active'], ['Completed', 'Completed']], match: (s, v) => s.status === v },
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: PP.db.professionals.map((p) => [p.id, PP.proName(p)]), match: (s, v) => s.professionalId === v },
        ],
        columns: [
          { key: 'title', label: 'Plan', sort: (s) => s.title, render: (s) => `<b>${esc(s.title)}</b><span class="sub mono">${esc(s.id)}</span>`, exportValue: (s) => s.title },
          { key: 'patient', label: 'Patient', sort: (s) => PP.patientName(s.patientId), render: (s) => `${esc(PP.patientName(s.patientId))}<span class="sub mono">${esc(s.patientId)}</span>`, exportValue: (s) => PP.patientName(s.patientId) },
          { key: 'pro', label: PP.t('professional'), render: (s) => esc(PP.proName(s.professionalId)) },
          { key: 'progress', label: 'Progress', sort: (s) => planStats(s).pct, render: (s) => { const st = planStats(s); return `<div class="pp-prog-cell"><span class="small">${st.done}/${esc(s.planned)}</span>${progressBar(st.pct)}</div>`; }, exportValue: (s) => `${planStats(s).done}/${s.planned}` },
          { key: 'next', label: 'Next session', sort: (s) => (planStats(s).next || {}).date || '9999', render: (s) => { const n = planStats(s).next; return n ? esc(PP.fmt.date(n.date)) : '<span class="muted">—</span>'; }, exportValue: (s) => (planStats(s).next || {}).date || '' },
          { key: 'freq', label: 'Frequency', render: (s) => esc(s.frequency) },
          { key: 'status', label: 'Status', render: (s) => PP.ui.badge(s.status), exportValue: (s) => s.status },
        ],
        empty: { icon: 'activity', title: 'No session plans yet' },
        onRowClick: (s) => PP.go(`#/session-plans/${s.id}`),
      });
      const nb = PP.$('[data-new]', el); if (nb) nb.addEventListener('click', () => openNewPlan());
    },
  });

  function openNewPlan(patientId) {
    const F = PP.form.field;
    PP.ui.modal({
      title: 'New session plan', size: 'lg',
      body: `<form class="form-grid" onsubmit="return false">
        <div class="full">${patientCombo('patientId', patientId || '')}</div>
        ${F({ name: 'professionalId', label: PP.t('professional'), type: 'select', required: true, value: myProId(), options: pickablePros(clinicalPros()).map(proOpt) })}
        ${F({ name: 'title', label: 'Plan title', required: true, placeholder: 'e.g. Knee rehabilitation' })}
        ${F({ name: 'planned', label: 'Planned sessions', type: 'number', required: true, min: 1, max: 60, value: 8, rule: 'positive' })}
        ${F({ name: 'frequency', label: 'Frequency', type: 'select', required: true, placeholder: false, value: '2 per week', options: ['1 per week', '2 per week', '3 per week', '5 per week', 'Daily'] })}
        ${F({ name: 'start', label: 'First session', type: 'date', required: true, value: PP.today() })}
        ${F({ name: 'goal', label: 'First goal', value: 'Assessment' })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create plan', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const d = PP.form.read(f); const n = Math.min(60, Math.round(Number(d.planned)));
        const step = { '1 per week': 7, '2 per week': 3, '3 per week': 2, '5 per week': 1, Daily: 1 }[d.frequency] || 3;
        const goals = [d.goal || 'Assessment', 'Pain control', 'Mobility', 'Strength', 'Balance', 'Function', 'Return to activity', 'Review'];
        const sessions = Array.from({ length: n }, (_, k) => ({ no: k + 1, date: PP.addDays(d.start, k * step), goal: goals[Math.min(k, goals.length - 1)], note: '', status: 'Planned' }));
        await PP.sleep(400);
        const pkg = packageFor(d.patientId);
        const s = { id: PP.nextId('SP', 3), patientId: d.patientId, professionalId: d.professionalId, title: d.title, planned: n, frequency: d.frequency, startDate: d.start, sessions, status: 'Active', packageId: pkg ? pkg.id : null };
        PP.db.sessionPlans.push(s); PP.audit('Session plan created', s.id, `${PP.patientName(s.patientId)} · ${s.title}`); PP.save();
        PP.ui.toast(`Session plan created · ${esc(s.id)}`); PP.go(`#/session-plans/${s.id}`);
      } }],
      onOpen(body) { bindCombo(body, 'patientId'); },
    });
  }

  PP.route('/session-plans/:id', {
    title: (p) => `Session Plan ${p.id}`, perm: 'clinical.view',
    render({ el, params }) {
      const s = PP.find.sessionPlan(params.id); if (!s) { el.innerHTML = notFound('Session plan', params.id, '#/session-plans'); return; }
      if (PP.denyPatient(el, s.patientId)) return;
      const draw = () => drawPlan(el, s);
      draw();
    },
  });

  function drawPlan(el, s) {
    const st = planStats(s); const pt = PP.find.patient(s.patientId) || { id: s.patientId, name: '—' };
    const pkg = packageFor(s.patientId, s); const canEdit = PP.can('clinical.write');
    s.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no);
    el.innerHTML = PP.ui.pageHead({
      title: esc(s.title), subtitle: `${esc(pt.name)} · <span class="mono">${esc(pt.id)}</span> · ${esc(PP.proName(s.professionalId))}`,
      crumbs: [['Session plans', '#/session-plans'], [s.title]],
      actions: `<a class="btn btn-ghost" href="#/patients/${esc(pt.id)}?tab=plans">Patient profile</a>${canEdit ? `<button class="btn btn-primary" data-add>${PP.icon('plus')} Add session</button>` : ''}`,
    }) + `
      <div class="pp-sp-kpis">
        ${PP.ui.kpi({ label: 'Planned', value: esc(s.planned), hint: `Since ${esc(PP.fmt.date(s.startDate))}`, icon: 'calendar', tone: 'info' })}
        ${PP.ui.kpi({ label: 'Completed', value: st.done, hint: `${s.planned - st.done} remaining`, icon: 'checkCircle', tone: 'positive' })}
        <div class="kpi tone-lavender pp-sp-progress"><div class="kpi-icon">${PP.icon('activity')}</div><div class="grow"><div class="kpi-label">Progress</div><div class="kpi-value mono">${st.pct}%</div>${progressBar(st.pct)}</div></div>
        ${PP.ui.kpi({ label: 'Next session', value: st.next ? esc(PP.fmt.dateShort(st.next.date)) : '—', hint: st.next ? esc(st.next.goal) : 'No planned sessions', icon: 'clock', tone: 'warning' })}
        ${PP.ui.kpi({ label: 'Frequency', value: esc(s.frequency), hint: PP.ui.badge(s.status), icon: 'repeat', tone: 'positive' })}
      </div>
      ${pkg ? `<section class="card mt-4 pp-sp-pkg"><div class="card-body row between">
        <div class="row"><span class="pp-ex-ico">${PP.icon('layers')}</span><div><b>${esc(PP.serviceName(pkg.serviceId))}</b> ${PP.ui.badge(pkg.status)}<div class="small muted">Package ${esc(pkg.id)} · expires ${esc(PP.fmt.date(pkg.expires))} (${Math.max(0, PP.diffDays(PP.today(), pkg.expires))} days left)</div></div></div>
        <div class="pp-sp-pkg-num"><div><b class="mono">${esc(pkg.sessionsUsed)}</b><span>used</span></div><div><b class="mono">${esc(pkg.sessionsTotal - pkg.sessionsUsed)}</b><span>remaining</span></div><div><b class="mono">${esc(pkg.sessionsTotal)}</b><span>total</span></div></div>
      </div></section>` : ''}
      ${PP.ui.card({ title: 'Sessions', cls: 'mt-4', flush: true, body: `<div class="table-wrap"><table class="table pp-sessions"><thead><tr><th>No.</th><th>Date</th><th>Goal</th><th>Clinical note</th><th>Status</th>${canEdit ? '<th class="right">Actions</th>' : ''}</tr></thead><tbody>
        ${s.sessions.map((x, i) => `<tr class="${x.status === 'Completed' ? 'is-done' : ''}"><td class="mono">${esc(x.no)}</td><td class="nowrap">${esc(PP.fmt.dateLong(x.date))}${x.status === 'Planned' && x.date < PP.today() ? ' <span class="badge error">Overdue</span>' : ''}</td><td>${esc(x.goal)}</td><td>${x.note ? esc(x.note) : '<span class="muted">—</span>'}</td><td>${PP.ui.badge(x.status)}</td>
          ${canEdit ? `<td class="right nowrap">${x.status === 'Completed' ? `<button class="btn btn-ghost btn-sm" data-note="${i}">${PP.icon('edit')} Note</button>` : `<button class="btn btn-sm btn-primary" data-done="${i}">${PP.icon('check')} Mark completed</button> <button class="btn btn-sm" data-resched="${i}">${PP.icon('calendar')} Reschedule</button>`}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>` })}`;

    const F = PP.form.field;
    const finish = (msg) => { s.status = s.sessions.length && s.sessions.every((x) => x.status === 'Completed') ? 'Completed' : 'Active'; PP.save(); PP.ui.toast(msg); drawPlan(el, s); };
    PP.$$('[data-done]', el).forEach((b) => b.addEventListener('click', () => {
      const x = s.sessions[Number(b.dataset.done)];
      PP.ui.modal({ title: `Complete session ${esc(x.no)}`, body: `<form class="stack" onsubmit="return false">
          <p class="muted" style="margin:0">${esc(PP.fmt.dateLong(x.date))} · goal: ${esc(x.goal)}</p>
          ${F({ name: 'note', label: 'Clinical note', type: 'textarea', required: true, placeholder: 'e.g. ROM improved; progressed resistance', error: 'Add a short clinical note.' })}
          ${pkg && pkg.status === 'Active' ? F({ type: 'checkbox', name: 'deduct', label: `Deduct one session from package ${pkg.id} (${pkg.sessionsTotal - pkg.sessionsUsed} remaining)`, value: pkg.sessionsUsed < pkg.sessionsTotal }) : ''}
        </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Mark completed', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const d = PP.form.read(f); await PP.sleep(300);
        x.status = 'Completed'; x.note = d.note; x.completedAt = PP.nowStamp();
        if (d.deduct && pkg && pkg.sessionsUsed < pkg.sessionsTotal) { pkg.sessionsUsed += 1; if (pkg.sessionsUsed >= pkg.sessionsTotal) pkg.status = 'Completed'; PP.audit('Package session used', pkg.id, `${s.id} · session ${x.no}`); }
        PP.audit('Session completed', s.id, `Session ${x.no} · ${d.note}`);
        finish(`Session ${x.no} marked completed`);
      } }] });
    }));
    PP.$$('[data-note]', el).forEach((b) => b.addEventListener('click', () => {
      const x = s.sessions[Number(b.dataset.note)];
      PP.ui.modal({ title: `Session ${esc(x.no)} note`, body: `<form onsubmit="return false">${F({ name: 'note', label: 'Clinical note', type: 'textarea', required: true, value: x.note })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save note', kind: 'primary', onClick: ({ body }) => { const f = PP.$('form', body); if (!PP.form.validate(f)) return false; x.note = PP.form.read(f).note; PP.audit('Session note edited', s.id, `Session ${x.no}`); finish('Note saved'); } }] });
    }));
    PP.$$('[data-resched]', el).forEach((b) => b.addEventListener('click', () => {
      const x = s.sessions[Number(b.dataset.resched)];
      PP.ui.modal({ title: `Reschedule session ${esc(x.no)}`, size: 'sm', body: `<form class="stack" onsubmit="return false">${F({ name: 'date', label: 'New date', type: 'date', required: true, value: x.date, min: PP.today() })}${F({ name: 'reason', label: 'Reason', placeholder: 'Optional' })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Reschedule', kind: 'primary', onClick: ({ body }) => {
          const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const d = PP.form.read(f);
          if (d.date < PP.today()) { PP.form.setError(f, 'date', 'Choose today or a later date.'); return false; }
          const old = x.date; x.date = d.date; PP.audit('Session rescheduled', s.id, `Session ${x.no}: ${old} → ${d.date}${d.reason ? ` · ${d.reason}` : ''}`);
          finish(`Session ${x.no} moved to ${esc(PP.fmt.date(d.date))}`);
        } }] });
    }));
    const add = PP.$('[data-add]', el);
    if (add) add.addEventListener('click', () => {
      const last = s.sessions[s.sessions.length - 1];
      PP.ui.modal({ title: 'Add session', size: 'sm', body: `<form class="stack" onsubmit="return false">${F({ name: 'date', label: 'Date', type: 'date', required: true, value: PP.addDays(last && last.date > PP.today() ? last.date : PP.today(), 3) })}${F({ name: 'goal', label: 'Goal', required: true, value: 'Review' })}</form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Add session', kind: 'primary', onClick: ({ body }) => {
          const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const d = PP.form.read(f);
          const no = Math.max(0, ...s.sessions.map((x) => x.no)) + 1;
          s.sessions.push({ no, date: d.date, goal: d.goal, note: '', status: 'Planned' }); s.planned = s.sessions.length;
          PP.audit('Session added', s.id, `Session ${no} · ${d.date}`); finish(`Session ${no} added`);
        } }] });
    });
  }
})();
