/* Physio Point HTML prototype — Patients (blueprint screens 10, 11, 12).
   Directory, registration with duplicate detection, profile with tabs, family links, merge, documents, consent.
   Mock data only (D-006). Mobile numbers are never unique (blueprint rule). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;

  /* ------------------------------------------------------------ helpers */
  const live = () => PP.db.patients.filter((p) => !p.mergedInto);
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const ageOf = (dob) => (dob ? PP.fmt.age(dob) : 'Age not recorded');
  const hasAllergy = (p) => !!(p.allergies && !/^(none|none known|nil|no|n\/a|-)\b/i.test(String(p.allergies).trim()));
  const REFERRALS = ['Walk-in', 'Doctor referral', 'Facebook', 'Existing patient', 'Google', 'Online booking', 'Corporate', 'Other'];
  const LANGS = ['English', 'Bangla'];
  const proOptions = () => PP.db.professionals.filter((x) => x.status === 'Active').map((x) => [x.id, `${PP.proName(x)} · ${x.designation}`]);

  function lastVisit(pid) {
    const T = PP.today(); let d = '';
    PP.db.visits.forEach((v) => { if (v.patientId === pid && v.date <= T && v.date > d) d = v.date; });
    PP.db.appointments.forEach((a) => { if (a.patientId === pid && a.status === 'Completed' && a.date <= T && a.date > d) d = a.date; });
    return d;
  }
  function mobileGroups() {
    const m = {};
    live().forEach((p) => { const k = digits(p.mobile); if (k) (m[k] = m[k] || []).push(p); });
    return m;
  }
  function familyOf(p) { return p.familyGroup ? live().filter((x) => x.familyGroup === p.familyGroup && x.id !== p.id) : []; }
  function newFamilyId() {
    let max = 0;
    PP.db.patients.forEach((p) => { const m = /^FAM-(\d+)$/.exec(p.familyGroup || ''); if (m) max = Math.max(max, Number(m[1])); });
    return `FAM-${max + 1}`;
  }
  function docsOf(p) {
    if (!Array.isArray(p.documents)) {
      // Mock starting list (fictional files). Persisted the next time data is saved.
      p.documents = [{ id: 'DOC-1', name: 'Registration form (signed).pdf', type: 'Form', size: '182 KB', date: p.registeredAt || PP.today(), by: 'Front desk' }];
      if (PP.db.visits.some((v) => v.patientId === p.id)) p.documents.push({ id: 'DOC-2', name: 'Referral letter.jpg', type: 'Referral', size: '640 KB', date: p.registeredAt || PP.today(), by: 'Front desk' });
    }
    return p.documents;
  }
  const nextPatientIdPreview = () => `PAT-${String((PP.db.counters.PAT || 0) + 1).padStart(6, '0')}`;

  /* ================================================== screen 10: directory */
  PP.route('/patients', {
    title: 'Patients',
    perm: 'patients.view',
    render({ el }) {
      const groups = mobileGroups();
      const lv = {}; live().forEach((p) => { lv[p.id] = lastVisit(p.id); });
      const rows = () => live().filter((p) => PP.inBranch(p) && PP.canSeePatient(p.id));
      const list = rows();
      const shareCount = (p) => (groups[digits(p.mobile)] || []).length;
      const monthStart = PP.monthStart(PP.today());
      const branchTxt = PP.activeBranchId() === 'ALL' ? 'across all branches' : `in ${PP.branchName(PP.activeBranchId())}`;
      el.innerHTML = PP.ui.pageHead({
        title: 'Patients',
        subtitle: `${list.length} active records ${esc(branchTxt)}. Patients are identified by patient ID; a mobile number may be shared by a family.`,
        crumbs: [['Dashboard', '#/dashboard'], ['Patients']],
        actions: PP.can('patients.edit') ? `<a class="btn btn-primary" href="#/patients/new">${PP.icon('plus')} Add New</a>` : '',
      }) + `
        <div class="grid grid-4 pp-patient-kpis">
          ${PP.ui.kpi({ label: 'Patients', value: list.length, hint: esc(branchTxt), icon: 'users', tone: 'positive' })}
          ${PP.ui.kpi({ label: 'New this month', value: list.filter((p) => (p.registeredAt || '') >= monthStart).length, hint: `Since ${PP.fmt.date(monthStart)}`, icon: 'userPlus', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Shared mobile numbers', value: Object.values(groups).filter((g) => g.length > 1 && g.some(PP.inBranch)).length, hint: 'Families or possible duplicates', icon: 'phone', tone: 'warning' })}
          ${PP.ui.kpi({ label: 'Allergy alerts', value: list.filter(hasAllergy).length, hint: 'Shown on every profile', icon: 'alert', tone: 'error' })}
        </div>
        <section class="card mt-4" id="pt-table"></section>`;
      PP.ui.table(PP.$('#pt-table', el), {
        getRows: rows,
        exportName: 'patients',
        sortKey: 'id', sortDir: 'desc',
        search: { placeholder: 'Search by name, patient ID or mobile', text: (r) => `${r.name} ${r.id} ${r.mobile} ${digits(r.mobile)}` },
        filters: [
          { id: 'pro', label: `All ${PP.tl('professionals')}`, options: proOptions().map(([v]) => [v, PP.proName(v)]), match: (r, v) => r.assignedProfessionalId === v },
          { id: 'status', label: 'Any status', options: [['Active', 'Active'], ['Inactive', 'Inactive']], match: (r, v) => (r.status || 'Active') === v },
          { id: 'flag', label: 'All records', options: [['shared', 'Shared mobile'], ['family', 'Family linked'], ['allergy', 'Has allergy']], match: (r, v) => (v === 'shared' ? shareCount(r) > 1 : v === 'family' ? !!r.familyGroup : hasAllergy(r)) },
        ],
        columns: [
          { key: 'id', label: 'Patient ID', sort: (r) => r.id, render: (r) => `<span class="mono pp-pid">${esc(r.id)}</span>`, exportValue: (r) => r.id },
          { key: 'name', label: 'Name', sort: (r) => r.name.toLowerCase(), render: (r) => `<b>${esc(r.name)}</b>${hasAllergy(r) ? ` <span class="pp-allergy-dot" title="Allergy: ${esc(r.allergies)}">!</span>` : ''}<span class="sub">${esc(r.gender || '—')} · ${esc(ageOf(r.dob))}</span>`, exportValue: (r) => r.name },
          { key: 'mobile', label: 'Mobile', render: (r) => { const n = shareCount(r); return `<span class="nowrap">${esc(r.mobile)}</span>${n > 1 ? `<span class="sub"><span class="pp-dup-chip" title="${n} records share this mobile number">${PP.icon('users')} ${r.familyGroup ? 'Family' : 'Shared'} ×${n}</span></span>` : ''}`; }, exportValue: (r) => r.mobile },
          { key: 'pro', label: PP.t('professional'), sort: (r) => PP.proName(r.assignedProfessionalId), render: (r) => esc(PP.proName(r.assignedProfessionalId)) },
          { key: 'last', label: 'Last visit', sort: (r) => lv[r.id] || '', render: (r) => (lv[r.id] ? esc(PP.fmt.date(lv[r.id])) : '<span class="muted">No visits yet</span>'), exportValue: (r) => lv[r.id] || '' },
          { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status || 'Active'), exportValue: (r) => r.status || 'Active' },
        ],
        empty: { icon: 'users', title: 'No patients in this branch yet', text: 'Register the first patient to get started.', action: PP.can('patients.edit') ? '<a class="btn btn-primary" href="#/patients/new">Add New</a>' : '' },
        onRowClick: (r) => PP.go(`#/patients/${r.id}`),
      });
    },
  });

  /* =============================================== screen 11: registration */
  function renderForm(el, p) {
    const isNew = !p;
    const v = p || { gender: '', branchId: PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : 'BR-1', customFields: {}, status: 'Active', referralSource: 'Walk-in' };
    const cf = v.customFields || {};
    const age0 = PP.ageParts(v.dob);
    const F = PP.form.field;
    el.innerHTML = PP.ui.pageHead({
      title: isNew ? 'Patient Registration' : `Edit ${esc(v.name)}`,
      subtitle: isNew ? 'Register a new patient. Fields marked * are required.' : `${esc(v.id)} · changes are recorded in the audit log.`,
      crumbs: [['Patients', '#/patients'], ...(isNew ? [['New patient']] : [[v.name, `#/patients/${v.id}`], ['Edit']])],
    }) + `
      <form id="pt-form" class="pp-patient-form" novalidate>
        <div class="pp-split">
          <div class="stack">
            <div id="dup-box" aria-live="polite"></div>
            ${PP.ui.card({ title: 'Personal details', body: `<div class="form-grid">
              ${F({ name: 'name', label: 'Full name', required: true, value: v.name, placeholder: 'e.g. Nusrat Jahan', attrs: 'autocomplete="off"' })}
              ${F({ name: 'mobile', label: 'Mobile number', required: true, rule: 'mobile', value: v.mobile, placeholder: '01XXXXXXXXX', type: 'tel', hint: 'Not unique: family members may share one number.' })}
              <div class="full np-row3">
                ${F({ name: 'gender', label: 'Gender', type: 'select', value: v.gender, options: ['Female', 'Male', 'Other'] })}
                ${F({ name: 'ageYears', label: 'বয়স — বছর (Age, years)', type: 'number', min: 0, max: 120, step: 1, value: age0.y, placeholder: 'e.g. 35' })}
                ${F({ name: 'ageMonths', label: 'মাস (months)', type: 'select', placeholder: false, options: Array.from({ length: 12 }, (_, i) => [String(i), i + ' month' + (i === 1 ? '' : 's')]), value: String(age0.m) })}
              </div>
              ${F({ name: 'weightKg', label: 'ওজন — কেজি (Weight, kg)', type: 'number', min: 1, max: 300, step: 0.1, value: v.weightKg || '', placeholder: 'e.g. 62' })}
              ${F({ name: 'heightCm', label: 'উচ্চতা — সেমি (Height, cm)', type: 'number', min: 30, max: 250, step: 0.5, value: v.heightCm || '', placeholder: 'e.g. 165', hint: `<span data-ftin>${PP.ftIn(v.heightCm) || 'ফুট-ইঞ্চিতে দেখাবে'}</span>` })}
              ${F({ name: 'address', label: 'Address', value: v.address, placeholder: 'House, road, area, district', full: true })}
              ${F({ name: 'emergencyContact', label: 'Emergency contact', value: v.emergencyContact, placeholder: 'Name · relationship · mobile', full: true })}
            </div>` })}
            ${PP.ui.card({ title: 'Medical background', body: `<div class="form-grid">
              ${F({ name: 'medicalHistory', label: 'Medical history', type: 'textarea', value: v.medicalHistory, placeholder: 'Conditions, surgeries, ongoing medication', full: true })}
              ${F({ name: 'allergies', label: 'Allergies', value: v.allergies, placeholder: 'e.g. Penicillin, latex — or “None known”', hint: 'Allergies show as a red badge on the profile.' })}
              ${F({ name: 'previousTreatments', label: 'Previous treatments', value: v.previousTreatments, placeholder: 'e.g. Physiotherapy in 2023' })}
              ${F({ name: 'notes', label: 'Notes', type: 'textarea', value: v.notes, rows: 2, full: true })}
            </div>` })}
            ${PP.ui.card({ title: 'Custom fields', actions: '<span class="badge neutral">Configured per clinic</span>', body: `<div class="form-grid">
              ${F({ name: 'cf_occupation', label: 'Occupation', value: cf.occupation, placeholder: 'e.g. Teacher' })}
              ${F({ name: 'cf_language', label: 'Preferred language', type: 'select', value: cf.preferredLanguage, options: LANGS })}
            </div><p class="form-note mt-3">Example custom fields. In the product, the clinic defines these in Settings (FR-GA-14).</p>` })}
          </div>
          <div class="stack">
            ${PP.ui.card({ title: 'Assignment', body: `<div class="stack">
              ${F({ name: 'assignedProfessionalId', label: `Assigned ${PP.tl('professional')}`, type: 'select', value: v.assignedProfessionalId, options: proOptions() })}
              ${F({ name: 'branchId', label: 'Branch', type: 'select', required: true, value: v.branchId, options: PP.db.branches.map((b) => [b.id, b.name]) })}
              ${F({ name: 'referralSource', label: 'Referral source', type: 'select', value: v.referralSource, options: REFERRALS })}
              ${isNew ? '' : F({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: v.status || 'Active', options: ['Active', 'Inactive'] })}
            </div>` })}
            ${PP.ui.card({ title: 'Patient ID', body: `<div class="pp-pid-preview mono">${esc(isNew ? nextPatientIdPreview() : v.id)}</div><p class="form-note">${isNew ? 'Generated by the system when you save. The ID, not the mobile number, identifies the patient.' : 'Patient IDs never change.'}</p>` })}
          </div>
        </div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${isNew ? '#/patients' : `#/patients/${esc(v.id)}`}">Cancel</a>
          <button class="btn btn-primary" type="submit" data-save>${PP.icon('check')} ${isNew ? 'Register patient' : 'Save changes'}</button>
        </div>
      </form>`;

    const form = PP.$('#pt-form', el); const box = PP.$('#dup-box', el);
    let dupAck = false; let lastKey = ''; let linkFamily = false; let cands = [];

    function check() {
      const d = PP.form.read(form);
      cands = PP.duplicateCandidates(d.mobile, d.name, p && p.id);
      const key = cands.map((x) => x.id).join(',');
      if (key !== lastKey) { dupAck = false; lastKey = key; }
      if (!cands.length) { box.innerHTML = ''; return cands; }
      const m = digits(d.mobile);
      const items = cands.map((c) => {
        const why = [digits(c.mobile) === m && m ? 'Same mobile' : '', c.name.toLowerCase() === d.name.toLowerCase() ? 'Same name' : ''].filter(Boolean).join(' · ');
        return `<li><span class="avatar">${esc(PP.initials(c.name))}</span><div class="grow"><b>${esc(c.name)}</b> <span class="mono muted">${esc(c.id)}</span><div class="small muted">${esc(c.mobile)} · ${esc(c.gender || '—')} · ${esc(ageOf(c.dob))} · ${esc(PP.proName(c.assignedProfessionalId))}${c.familyGroup ? ' · family linked' : ''}</div></div><span class="badge warning">${esc(why)}</span><a class="btn btn-sm" href="#/patients/${esc(c.id)}">Open existing</a></li>`;
      }).join('');
      if (dupAck) {
        box.innerHTML = PP.ui.alert('info', `<b>Will be saved as a separate patient.</b> ${linkFamily ? `Linked as family with ${cands.map((c) => esc(c.name)).join(', ')}.` : 'Not linked as family.'} <button type="button" class="btn btn-ghost btn-sm" data-undo>Change</button>`);
        PP.$('[data-undo]', box).addEventListener('click', () => { dupAck = false; check(); });
        return cands;
      }
      box.innerHTML = `<div class="pp-dup card">
        <div class="pp-dup-head">${PP.icon('alert')}<div><b>Possible duplicate: ${cands.length} existing record${cands.length > 1 ? 's' : ''} match${cands.length > 1 ? '' : 'es'}</b>
          <div class="small">A shared mobile number is allowed (families). Check that this is not the same person before registering.</div></div></div>
        <ul class="list pp-dup-list">${items}</ul>
        <div class="pp-dup-foot row between">
          <label class="check"><input type="checkbox" data-family ${linkFamily ? 'checked' : ''}> Link as family (shared family group)</label>
          <button type="button" class="btn btn-dark btn-sm" data-asnew>${PP.icon('userPlus')} Register as new</button>
        </div></div>`;
      PP.$('[data-family]', box).addEventListener('change', (e) => { linkFamily = e.target.checked; });
      PP.$('[data-asnew]', box).addEventListener('click', () => { dupAck = true; check(); });
      return cands;
    }
    ['name', 'mobile'].forEach((n) => PP.$(`[name="${n}"]`, form).addEventListener('blur', check));
    PP.$('[name=heightCm]', form).addEventListener('input', (e) => { const h = PP.$('[data-ftin]', form); if (h) h.textContent = PP.ftIn(e.target.value) || 'ফুট-ইঞ্চিতে দেখাবে'; });
    if (!isNew) check();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!PP.form.validate(form)) return;
      const av = PP.form.read(form); let bad = false;
      if (av.ageYears !== '' && (Number(av.ageYears) < 0 || Number(av.ageYears) > 120)) { PP.form.setError(form, 'ageYears', 'Enter an age between 0 and 120 years.'); bad = true; }
      if (av.weightKg !== '' && (Number(av.weightKg) <= 0 || Number(av.weightKg) > 300)) { PP.form.setError(form, 'weightKg', 'Enter a weight between 1 and 300 kg.'); bad = true; }
      if (av.heightCm !== '' && (Number(av.heightCm) < 30 || Number(av.heightCm) > 250)) { PP.form.setError(form, 'heightCm', 'Enter a height between 30 and 250 cm.'); bad = true; }
      if (bad) return;
      check();
      if (cands.length && !dupAck) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); PP.ui.toast('Review the possible duplicates: open the existing record or choose “Register as new”.', 'warning', 4200); return; }
      await PP.ui.busy(PP.$('[data-save]', form), () => {
        const d = PP.form.read(form);
        const rec = isNew ? { id: PP.nextId('PAT'), registeredAt: PP.today(), email: '', bloodGroup: '', familyGroup: null, status: 'Active', documents: [], consents: [] } : p;
        Object.assign(rec, {
          name: d.name, mobile: d.mobile.replace(/[\s-]/g, ''), gender: d.gender,
          weightKg: d.weightKg !== '' ? Number(d.weightKg) : null, heightCm: d.heightCm !== '' ? Number(d.heightCm) : null, address: d.address, emergencyContact: d.emergencyContact,
          assignedProfessionalId: d.assignedProfessionalId || null, branchId: d.branchId || null, referralSource: d.referralSource,
          medicalHistory: d.medicalHistory, allergies: d.allergies || 'None known', previousTreatments: d.previousTreatments, notes: d.notes,
          customFields: Object.assign({}, rec.customFields || {}, { occupation: d.cf_occupation, preferredLanguage: d.cf_language }),
        });
        // Age → estimated date of birth; an unchanged age keeps the stored date (it may be exact).
        const ageSame = !isNew && p.dob && String(age0.y) === String(d.ageYears) && String(age0.m) === String(d.ageMonths);
        if (!ageSame) { rec.dob = PP.dobFromAge(d.ageYears, d.ageMonths); rec.dobApprox = d.ageYears !== ''; rec.ageRecordedOn = PP.today(); }
        if (!isNew && d.status) rec.status = d.status;
        if (cands.length && dupAck) {
          if (linkFamily) {
            const m = digits(rec.mobile); const same = cands.filter((c) => digits(c.mobile) === m); const kin = same.length ? same : cands;
            const fg = (kin.find((c) => c.familyGroup) || {}).familyGroup || rec.familyGroup || newFamilyId();
            rec.familyGroup = fg; kin.forEach((c) => { if (!c.familyGroup) c.familyGroup = fg; });
            PP.audit('Family link created', rec.id, `${fg} · ${kin.map((c) => c.id).join(', ')}`);
          }
          PP.audit('Duplicate warning acknowledged', rec.id, `Saved as separate record; matches ${cands.map((c) => c.id).join(', ')}`);
        }
        if (isNew) PP.db.patients.push(rec);
        PP.audit(isNew ? 'Patient registered' : 'Patient updated', rec.id, rec.name);
        PP.save();
        PP.ui.toast(isNew ? `Patient registered: <b>${esc(rec.name)}</b> · ${esc(rec.id)}` : 'Patient details saved');
        PP.go(`#/patients/${rec.id}`);
      });
    });
  }
  PP.route('/patients/new', { title: 'Patient Registration', perm: 'patients.edit', render({ el }) { renderForm(el, null); } });
  PP.route('/patients/:id/edit', {
    title: 'Edit Patient', perm: 'patients.edit',
    render({ el, params }) {
      const p = PP.find.patient(params.id);
      if (!p || p.mergedInto) { el.innerHTML = notFound(params.id, p); return; }
      renderForm(el, p);
    },
  });

  function notFound(id, p) {
    if (p && p.mergedInto) return `<div class="card">${PP.ui.empty({ icon: 'link', title: `${esc(p.id)} was merged`, text: `This record was merged into ${esc(p.mergedInto)} on ${esc(PP.fmt.date(p.mergedAt))}. It is kept for the audit trail only.`, action: `<a class="btn btn-primary" href="#/patients/${esc(p.mergedInto)}">Open ${esc(p.mergedInto)}</a>` })}</div>`;
    return `<div class="card">${PP.ui.empty({ icon: 'users', title: 'Patient not found', text: `No patient with ID <code>${esc(id)}</code>.`, action: '<a class="btn" href="#/patients">Back to patients</a>' })}</div>`;
  }

  /* ==================================================== screen 12: profile */
  PP.route('/patients/:id', {
    title: 'Patient Profile', perm: 'patients.view',
    render({ el, params, query }) {
      const p = PP.find.patient(params.id);
      if (!p || p.mergedInto) { el.innerHTML = notFound(params.id, p); return; }
      if (PP.denyPatient(el, p.id)) return;
      renderProfile(el, p, query.tab || 'overview');
    },
  });

  function renderProfile(el, p, activeTab) {
    const lv = lastVisit(p.id); const fam = familyOf(p);
    const actions = [
      PP.can('appointments.manage') ? `<a class="btn" href="#/appointments/new?patient=${esc(p.id)}">${PP.icon('calendar')} Book appointment</a>` : '',
      PP.can('clinical.write') ? `<a class="btn btn-primary" href="#/visits/new?patient=${esc(p.id)}">${PP.icon('stethoscope')} New clinical visit</a>` : '',
      PP.can('clinical.write') ? `<a class="btn" href="#/prescriptions/new?patient=${esc(p.id)}">${PP.icon('rx')} New prescription</a>` : '',
      PP.can('patients.edit') ? `<a class="btn" href="#/patients/${esc(p.id)}/edit">${PP.icon('edit')} Edit</a>` : '',
      PP.can('patients.edit') ? `<div class="rel"><button class="btn" data-more aria-haspopup="true">${PP.icon('more')} More</button></div>` : '',
    ].join('');
    const meta = [
      ['Phone', `<a href="tel:${esc(digits(p.mobile))}">${esc(p.mobile)}</a>`], ['Age', esc(p.dob ? PP.fmt.age(p.dob) : '—')], ['Gender', esc(p.gender || '—')],
      ...(p.weightKg || p.heightCm ? [['Weight / height', esc([p.weightKg ? p.weightKg + ' kg' : '', p.heightCm ? p.heightCm + ' cm' : ''].filter(Boolean).join(' · '))]] : []),
      [PP.t('professional'), esc(PP.proName(p.assignedProfessionalId))], ['Last visit', esc(lv ? PP.fmt.date(lv) : 'No visits yet')], ['Branch', esc(PP.branchName(p.branchId))],
    ];
    el.innerHTML = PP.ui.pageHead({ title: 'Patient Profile', crumbs: [['Patients', '#/patients'], [p.name]] }) + `
      <section class="card pp-patient-head">
        <div class="pp-ph-main">
          <span class="avatar lg">${esc(PP.initials(p.name))}</span>
          <div class="pp-ph-id">
            <div class="row"><h2>${esc(p.name)}</h2>${PP.ui.badge(p.status || 'Active')}
              ${hasAllergy(p) ? `<span class="badge error" title="Allergy alert">Allergy: ${esc(p.allergies)}</span>` : ''}
              ${fam.length ? `<span class="badge lavender">Family · ${fam.length + 1} members</span>` : ''}</div>
            <div class="mono muted">${esc(p.id)}${p.registeredAt ? ` · registered ${esc(PP.fmt.date(p.registeredAt))}` : ''}</div>
          </div>
          <div class="pp-ph-actions">${actions}</div>
        </div>
        <dl class="pp-ph-meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
      </section>
      <div id="pt-tabs" class="mt-4"></div>
      <div id="pt-panel" class="mt-4"></div>`;

    const more = PP.$('[data-more]', el);
    if (more) more.addEventListener('click', (e) => {
      PP.ui.dropdown(e.currentTarget, `<button class="dd-item" data-act="merge">${PP.icon('link', 'style="width:16px"')} Merge duplicate record</button>
        <button class="dd-item" data-act="consent">${PP.icon('shield', 'style="width:16px"')} Record consent</button>
        <button class="dd-item" data-act="family">${PP.icon('users', 'style="width:16px"')} Link family member</button>`, (dd) => {
        PP.$$('[data-act]', dd).forEach((b) => b.addEventListener('click', () => {
          dd.remove();
          if (b.dataset.act === 'merge') openMerge(p, el);
          else if (b.dataset.act === 'family') openFamilyLink(p, el);
          else switchTab('consent');
        }));
      });
    });

    const count = (coll) => PP.db[coll].filter((x) => x.patientId === p.id).length;
    const tabs = [
      { id: 'overview', label: 'Overview' },
      ...(PP.can('clinical.view') ? [
        { id: 'visits', label: 'Visit History', count: count('visits') },
        { id: 'prescriptions', label: 'Prescriptions', count: count('prescriptions') },
        { id: 'plans', label: 'Session Plans', count: count('sessionPlans') },
      ] : []),
      ...((PP.can('clinical.view') || PP.can('lab.manage')) && PP.db.labOrders ? [{ id: 'lab', label: 'Lab Reports', count: count('labOrders') || null }] : []),
      { id: 'appointments', label: 'Appointments', count: count('appointments') },
      ...(PP.can('billing.view') ? [{ id: 'billing', label: 'Billing' }] : []),
      { id: 'family', label: 'Family', count: fam.length || null },
      { id: 'documents', label: 'Documents', count: docsOf(p).length },
      { id: 'consent', label: 'Consent' },
    ];
    if (!tabs.some((t) => t.id === activeTab)) activeTab = 'overview';
    const panel = PP.$('#pt-panel', el);
    function switchTab(id) {
      activeTab = id;
      PP.ui.tabs(PP.$('#pt-tabs', el), { tabs, active: id, onChange: switchTab });
      try { history.replaceState(null, '', `#/patients/${p.id}?tab=${id}`); } catch (e) { /* file:// */ }
      const fn = TABS[id] || TABS.overview;
      fn(panel, p, el);
    }
    switchTab(activeTab);
  }

  /* ------------------------------------------------------------- tabs */
  const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="muted">—</span>' : v}</dd>`).join('')}</dl>`;

  const TABS = {
    lab(panel, p) {
      const READY = ['Result ready', 'Delivered'];
      const testName = (t) => ((PP.db.labTests || []).find((x) => x.id === t) || { name: t }).name;
      const list = (PP.db.labOrders || []).filter((o) => o.patientId === p.id).sort((a, b) => String(b.orderedAt).localeCompare(String(a.orderedAt)));
      panel.innerHTML = `<div class="card"><div class="card-head"><h3>Lab reports</h3><span class="small muted">Previous test reports of this patient</span></div>${list.length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Ordered</th><th>Tests</th><th>Ordered by</th><th>Status</th><th></th></tr></thead><tbody>${list.map((o) => `<tr><td class="mono">${esc(o.id)}</td><td>${esc(PP.fmt.date(String(o.orderedAt).slice(0, 10)))}</td><td>${esc(o.tests.map(testName).join(', '))}</td><td>${esc(PP.proName(o.professionalId))}</td><td>${PP.ui.badge(o.status)}</td><td>${READY.includes(o.status) ? `<button class="btn btn-sm" data-lab="${esc(o.id)}">${PP.icon('eye')} View report</button>` : '<span class="small muted">Not ready yet</span>'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body">${PP.ui.empty({ icon: 'activity', title: 'No lab reports', text: 'Tests ordered for this patient appear here once results are released.' })}</div>`}</div>`;
      PP.$$('[data-lab]', panel).forEach((b) => b.addEventListener('click', () => {
        const o = PP.db.labOrders.find((x) => x.id === b.dataset.lab);
        if (PP.labReport) PP.labReport.print(o);
      }));
    },
    overview(panel, p) {
      const cf = p.customFields || {};
      const upcoming = PP.db.appointments.filter((a) => a.patientId === p.id && a.date >= PP.today() && !['Completed', 'Cancelled', 'No-show'].includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
      const plan = PP.db.sessionPlans.find((s) => s.patientId === p.id && s.status === 'Active');
      panel.innerHTML = `<div class="grid grid-2">
        ${PP.ui.card({ title: 'Medical background', body: kv([
          ['Medical history', esc(p.medicalHistory)],
          ['Allergies', hasAllergy(p) ? `<span class="badge error">${esc(p.allergies)}</span>` : esc(p.allergies || 'None known')],
          ['Previous treatments', esc(p.previousTreatments)],
          ['Blood group', esc(p.bloodGroup)],
          ['Notes', esc(p.notes)],
        ]) })}
        ${PP.ui.card({ title: 'Contact & referral', body: kv([
          ['Mobile', esc(p.mobile)], ['Address', esc(p.address)], ['Emergency contact', esc(p.emergencyContact)],
          ['Referral source', esc(p.referralSource)], ['Branch', esc(PP.branchName(p.branchId))],
        ]) })}
        ${PP.ui.card({ title: 'Custom fields', actions: '<span class="badge neutral">Clinic-defined</span>', body: kv([['Occupation', esc(cf.occupation)], ['Preferred language', esc(cf.preferredLanguage)]]) })}
        ${PP.ui.card({ title: 'At a glance', body: kv([
          ['Next appointment', upcoming ? `<a href="#/appointments/${esc(upcoming.id)}">${esc(PP.fmt.dateLong(upcoming.date))} · ${esc(PP.fmt.time(upcoming.start))}</a> ${PP.ui.badge(upcoming.status)}` : 'None booked'],
          ['Active session plan', plan ? `<a href="#/session-plans/${esc(plan.id)}">${esc(plan.title)}</a> · ${plan.sessions.filter((s) => s.status === 'Completed').length}/${plan.planned}` : 'None'],
          ['Clinical visits', String(PP.db.visits.filter((v) => v.patientId === p.id).length)],
          ['Latest consent', (p.consents && p.consents[0]) ? esc(PP.fmt.stamp(p.consents[0].at)) : '<span class="badge warning">Not recorded</span>'],
        ]) })}
      </div>`;
    },

    visits(panel, p) {
      const T = PP.today(); const ev = [];
      PP.db.visits.filter((v) => v.patientId === p.id).forEach((v) => ev.push({ key: v.date + ' 99', date: v.date, html: `
        <div class="pp-tl-kind is-visit">${PP.icon('stethoscope')} Clinical visit</div>
        <a href="#/visits/${esc(v.id)}"><b>${esc(v.complaint || 'Clinical visit')}</b></a> <span class="mono muted small">${esc(v.id)}</span>
        <div class="small">Pain <b>${esc(v.painScale)}/10</b> · ${esc(v.assessment || '')}${v.treatment ? ` · ${esc(v.treatment)}` : ''}</div>
        <div class="small muted">${esc(PP.proName(v.professionalId))}${v.nextVisit ? ` · next visit ${esc(PP.fmt.date(v.nextVisit))}` : ''}</div>` }));
      PP.db.prescriptions.filter((r) => r.patientId === p.id).forEach((r) => ev.push({ key: r.date + ' 98', date: r.date, html: `
        <div class="pp-tl-kind is-rx">${PP.icon('rx')} Prescription</div>
        <a href="#/prescriptions/${esc(r.id)}"><b>${esc(r.condition || 'Prescription')}</b></a> <span class="mono muted small">${esc(r.id)} · v${esc(r.version || 1)}</span> ${PP.ui.badge(r.status)}
        <div class="small muted">${esc((r.items || []).length)} exercises · ${esc(r.frequency || '')} · ${esc(PP.proName(r.professionalId))}</div>` }));
      PP.db.appointments.filter((a) => a.patientId === p.id).forEach((a) => ev.push({ key: a.date + ' ' + a.start, date: a.date, html: `
        <div class="pp-tl-kind is-appt">${PP.icon('calendar')} ${a.date > T ? 'Upcoming appointment' : 'Appointment'}</div>
        <b>${esc(PP.serviceName(a.serviceId))}</b> <span class="small muted">${esc(PP.fmt.time(a.start))} – ${esc(PP.fmt.time(a.end))}</span> ${PP.ui.badge(a.status)}
        <div class="small muted">${esc(PP.proName(a.professionalId))} · <span class="mono">${esc(a.id)}</span></div>` }));
      ev.sort((a, b) => b.key.localeCompare(a.key));
      let limit = 25;
      const draw = () => {
        const body = ev.length ? `<ul class="timeline pp-timeline">${ev.slice(0, limit).map((x) => `<li><div class="tl-date">${esc(PP.fmt.dateShort(x.date))}<span class="pp-tl-year">${esc(x.date.slice(0, 4))}</span></div><div class="tl-body">${x.html}</div></li>`).join('')}</ul>
          ${ev.length > limit ? `<div class="row" style="justify-content:center"><button class="btn" data-moretl>Show all ${ev.length} entries</button></div>` : ''}`
          : PP.ui.empty({ icon: 'clipboard', title: 'No clinical history yet', text: 'Visits, prescriptions and appointments appear here, newest first.', action: PP.can('clinical.write') ? `<a class="btn btn-primary" href="#/visits/new?patient=${esc(p.id)}">New clinical visit</a>` : '' });
        panel.innerHTML = PP.ui.card({ title: 'Clinical timeline', actions: `<span class="small muted">${ev.length} entries · newest first</span>`, body });
        const b = PP.$('[data-moretl]', panel); if (b) b.addEventListener('click', () => { limit = ev.length; draw(); });
      };
      draw();
    },

    prescriptions(panel, p) {
      panel.innerHTML = `<section class="card" id="pt-rx"></section>`;
      PP.ui.table(PP.$('#pt-rx', panel), {
        rows: PP.db.prescriptions.filter((r) => r.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date)),
        exportName: `prescriptions-${p.id}`,
        tools: PP.can('clinical.write') ? `<a class="btn btn-primary" href="#/prescriptions/new?patient=${esc(p.id)}">${PP.icon('plus')} New prescription</a>` : '',
        columns: [
          { key: 'id', label: 'Prescription', render: (r) => `<a href="#/prescriptions/${esc(r.id)}" class="mono">${esc(r.id)}</a>` },
          { key: 'date', label: 'Date', sort: (r) => r.date, render: (r) => esc(PP.fmt.date(r.date)) },
          { key: 'condition', label: 'Condition', render: (r) => `${esc(r.condition || '—')}<span class="sub">${esc((r.items || []).length)} exercises</span>` },
          { key: 'pro', label: PP.t('professional'), render: (r) => esc(PP.proName(r.professionalId)) },
          { key: 'version', label: 'Version', render: (r) => `v${esc(r.version || 1)}` },
          { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status) },
        ],
        empty: { icon: 'rx', title: 'No prescriptions yet', text: 'Prescriptions are created from a clinical visit.' },
        onRowClick: (r) => PP.go(`#/prescriptions/${r.id}`),
      });
    },

    plans(panel, p) {
      const plans = PP.db.sessionPlans.filter((s) => s.patientId === p.id);
      panel.innerHTML = plans.length ? `<div class="grid grid-2">${plans.map((s) => {
        const done = s.sessions.filter((x) => x.status === 'Completed').length; const pct = s.planned ? Math.round((done / s.planned) * 100) : 0;
        const next = s.sessions.filter((x) => x.status === 'Planned').sort((a, b) => a.date.localeCompare(b.date))[0];
        return PP.ui.card({ title: `<a href="#/session-plans/${esc(s.id)}">${esc(s.title)}</a>`, actions: PP.ui.badge(s.status), body: `
          <div class="row between small"><span>${done} of ${esc(s.planned)} sessions completed</span><b>${pct}%</b></div>
          <div class="pp-progress mt-2" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          <div class="small muted mt-3">${esc(PP.proName(s.professionalId))} · ${esc(s.frequency)} · next: ${next ? esc(PP.fmt.date(next.date)) : '—'}</div>` });
      }).join('')}</div>` : `<div class="card">${PP.ui.empty({ icon: 'activity', title: 'No session plans', text: 'Create a session plan to track planned and completed sessions.', action: PP.can('clinical.write') ? '<a class="btn" href="#/session-plans">Go to session plans</a>' : '' })}</div>`;
    },

    appointments(panel, p) {
      const T = PP.today(); const all = PP.db.appointments.filter((a) => a.patientId === p.id);
      const isUpcoming = (a) => a.date > T || (a.date === T && !['Completed', 'Cancelled', 'No-show'].includes(a.status));
      const up = all.filter(isUpcoming).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      const past = all.filter((a) => !isUpcoming(a)).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
      const tbl = (list, emptyText) => (list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th>Service</th><th>${esc(PP.t('professional'))}</th><th>Status</th><th>ID</th></tr></thead><tbody>
        ${list.map((a) => `<tr><td class="nowrap">${esc(PP.fmt.dateLong(a.date))}</td><td class="nowrap">${esc(PP.fmt.time(a.start))}</td><td>${esc(PP.serviceName(a.serviceId))}</td><td>${esc(PP.proName(a.professionalId))}</td><td>${PP.ui.badge(a.status)}</td><td><a class="mono" href="#/appointments/${esc(a.id)}">${esc(a.id)}</a></td></tr>`).join('')}
        </tbody></table></div>` : PP.ui.empty({ icon: 'calendar', title: emptyText }));
      panel.innerHTML = `<div class="stack">
        ${PP.ui.card({ title: `Upcoming (${up.length})`, flush: true, actions: PP.can('appointments.manage') ? `<a class="btn btn-sm btn-primary" href="#/appointments/new?patient=${esc(p.id)}">${PP.icon('plus')} Book appointment</a>` : '', body: tbl(up, 'No upcoming appointments') })}
        ${PP.ui.card({ title: `Past (${past.length})`, flush: true, body: tbl(past, 'No past appointments') })}
      </div>`;
    },

    billing(panel, p) {
      if (!PP.can('billing.view')) { panel.innerHTML = PP.ui.noAccess('billing.view'); return; }
      const invs = PP.db.invoices.filter((i) => i.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
      const tot = invs.map((i) => ({ inv: i, t: PP.bill.totals(i) }));
      const valid = tot.filter((x) => x.t.status !== "Void");
      const payable = PP.sum(valid, (x) => x.t.payable); const collected = PP.sum(valid, (x) => x.t.net); const due = PP.sum(valid, (x) => x.t.due);
      const adv = PP.db.advances.filter((a) => a.patientId === p.id);
      const pkgs = PP.db.packages.filter((k) => k.patientId === p.id);
      panel.innerHTML = `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Payable', value: esc(PP.fmt.money(payable)), hint: `${invs.length} invoices`, icon: 'receipt', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Collected', value: esc(PP.fmt.money(collected)), hint: 'Net of refunds', icon: 'banknote', tone: 'positive' })}
          ${PP.ui.kpi({ label: 'Due', value: esc(PP.fmt.money(due)), hint: 'Payable − net posted payments', icon: 'alert', tone: due > 0 ? 'error' : 'positive' })}
          ${PP.ui.kpi({ label: 'Advance balance', value: esc(PP.fmt.money(PP.sum(adv.filter((a) => !a.appliedInvoiceId), (a) => a.amount))), hint: `${adv.length} deposits`, icon: 'wallet', tone: 'lavender' })}
        </div>
        <section class="card mt-4" id="pt-inv"></section>
        <div class="grid grid-2 mt-4">
          ${PP.ui.card({ title: 'Advance deposits', flush: true, body: adv.length ? `<ul class="list">${adv.map((a) => `<li><div class="grow"><b>${esc(PP.fmt.money(a.amount))}</b> <span class="mono muted small">${esc(a.id)}</span><div class="small muted">${esc(PP.fmt.date(a.date))} · ${esc(a.method)} · ${esc(a.note || '')}</div></div>${a.appliedInvoiceId ? `<span class="badge neutral">Applied to ${esc(a.appliedInvoiceId)}</span>` : '<span class="badge info">Unapplied</span>'}</li>`).join('')}</ul>` : PP.ui.empty({ icon: 'wallet', title: 'No advance deposits' }) })}
          ${PP.ui.card({ title: 'Packages', flush: true, body: pkgs.length ? `<ul class="list">${pkgs.map((k) => { const pct = k.sessionsTotal ? Math.round((k.sessionsUsed / k.sessionsTotal) * 100) : 0; return `<li><div class="grow"><b>${esc(PP.serviceName(k.serviceId))}</b> ${PP.ui.badge(k.status)}<div class="small muted">${esc(k.sessionsUsed)} used · ${esc(k.sessionsTotal - k.sessionsUsed)} remaining · expires ${esc(PP.fmt.date(k.expires))}</div><div class="pp-progress mt-2"><span style="width:${pct}%"></span></div></div>${k.invoiceId ? `<a class="btn btn-sm" href="#/billing/${esc(k.invoiceId)}">${esc(k.invoiceId)}</a>` : ''}</li>`; }).join('')}</ul>` : PP.ui.empty({ icon: 'layers', title: 'No packages' }) })}
        </div>`;
      PP.ui.table(PP.$('#pt-inv', panel), {
        rows: tot, exportName: `invoices-${p.id}`,
        tools: PP.can('billing.manage') ? `<a class="btn btn-primary" href="#/billing/new?patient=${esc(p.id)}">${PP.icon('plus')} New invoice</a>` : '',
        columns: [
          { key: 'id', label: 'Invoice', render: (x) => `<a class="mono" href="#/billing/${esc(x.inv.id)}">${esc(x.inv.id)}</a>`, exportValue: (x) => x.inv.id },
          { key: 'date', label: 'Date', sort: (x) => x.inv.date, render: (x) => esc(PP.fmt.date(x.inv.date)) },
          { key: 'desc', label: 'Items', render: (x) => esc(x.inv.lines.map((l) => l.description || PP.serviceName(l.serviceId)).join(', ')) },
          { key: 'pro', label: PP.t('professional'), render: (x) => esc(PP.proName(x.inv.professionalId)) },
          { key: 'payable', label: 'Payable', align: 'right', sort: (x) => x.t.payable, render: (x) => esc(PP.fmt.money(x.t.payable)) },
          { key: 'net', label: 'Collected', align: 'right', render: (x) => esc(PP.fmt.money(x.t.net)) },
          { key: 'due', label: 'Due', align: 'right', sort: (x) => x.t.due, render: (x) => (x.t.due > 0 ? `<b class="pp-due">${esc(PP.fmt.money(x.t.due))}</b>` : esc(PP.fmt.money(0))) },
          { key: 'status', label: 'Status', render: (x) => PP.ui.badge(x.t.status) },
        ],
        empty: { icon: 'receipt', title: 'No invoices yet' },
        onRowClick: (x) => PP.go(`#/billing/${x.inv.id}`),
      });
    },

    family(panel, p, el) {
      const fam = familyOf(p);
      panel.innerHTML = PP.ui.card({
        title: 'Family members', actions: PP.can('patients.edit') ? `<button class="btn btn-sm" data-link>${PP.icon('link')} Link family member</button>` : '', flush: true,
        body: fam.length ? `<ul class="list">${fam.map((f) => `<li><span class="avatar">${esc(PP.initials(f.name))}</span><div class="grow"><a href="#/patients/${esc(f.id)}"><b>${esc(f.name)}</b></a> <span class="mono muted small">${esc(f.id)}</span><div class="small muted">${esc(f.gender || '—')} · ${esc(ageOf(f.dob))} · ${esc(f.mobile)}${digits(f.mobile) === digits(p.mobile) ? ' · same mobile' : ''}</div></div>${PP.can('patients.edit') ? `<button class="btn btn-ghost btn-sm" data-unlink="${esc(f.id)}">Unlink</button>` : ''}</li>`).join('')}</ul>
          <div class="card-foot small muted">Family group <span class="mono">${esc(p.familyGroup)}</span>. Each member keeps their own patient ID and clinical record.</div>`
          : PP.ui.empty({ icon: 'users', title: 'No family links', text: 'Link relatives who share a mobile number or guardian, so the front desk can find them together.' }),
      });
      const b = PP.$('[data-link]', panel); if (b) b.addEventListener('click', () => openFamilyLink(p, el));
      PP.$$('[data-unlink]', panel).forEach((x) => x.addEventListener('click', async () => {
        const f = PP.find.patient(x.dataset.unlink);
        const ok = await PP.ui.confirm({ title: 'Remove family link?', message: `${esc(f.name)} will no longer be linked to this family. Clinical records are not affected.`, confirmLabel: 'Unlink' });
        if (!ok) return;
        f.familyGroup = null;
        if (!familyOf(p).length) p.familyGroup = null;
        PP.audit('Family link removed', p.id, f.id); PP.save(); PP.ui.toast('Family link removed');
        renderProfile(el, p, 'family');
      }));
    },

    documents(panel, p, el) {
      const docs = docsOf(p);
      panel.innerHTML = PP.ui.card({
        title: 'Documents', actions: PP.can('patients.edit') ? `<button class="btn btn-sm btn-primary" data-up>${PP.icon('upload')} Upload</button>` : '', flush: true,
        body: docs.length ? `<ul class="list">${docs.map((d) => `<li><span class="pp-doc-ico">${PP.icon('file')}</span><div class="grow"><b>${esc(d.name)}</b><div class="small muted">${esc(d.type)} · ${esc(d.size)} · ${esc(PP.fmt.date(d.date))} · ${esc(d.by)}</div></div>
          <button class="btn btn-ghost btn-sm" data-view="${esc(d.id)}">${PP.icon('eye')} View</button>${PP.can('patients.edit') ? `<button class="btn btn-ghost btn-sm btn-icon" data-rm="${esc(d.id)}" aria-label="Remove ${esc(d.name)}">${PP.icon('trash')}</button>` : ''}</li>`).join('')}</ul>
          <div class="card-foot small muted">Prototype: files are not really stored. In production documents stay on the customer's own storage.</div>`
          : PP.ui.empty({ icon: 'file', title: 'No documents yet', text: 'Upload reports, X-rays, referral letters or signed forms.' }),
      });
      const up = PP.$('[data-up]', panel);
      if (up) up.addEventListener('click', () => {
        PP.ui.modal({
          title: 'Upload document',
          body: `<form class="stack" onsubmit="return false">
            <div class="field" data-field="file"><label for="doc-file">File</label><input class="input pp-file" id="doc-file" type="file" name="file"><div class="hint">Simulated: only the file name is kept.</div><div class="error">Choose a file or type a name.</div></div>
            ${PP.form.field({ name: 'docName', label: 'Document name', placeholder: 'e.g. MRI report – lumbar spine.pdf' })}
            ${PP.form.field({ name: 'docType', label: 'Type', type: 'select', required: true, value: 'Report', options: ['Report', 'X-ray / imaging', 'Referral', 'Form', 'Other'] })}
          </form>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Upload', kind: 'primary', onClick: async ({ body }) => {
            const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
            const input = PP.$('#doc-file', body); const file = input.files && input.files[0];
            const name = PP.form.read(f).docName || (file ? file.name : '');
            if (!name) { PP.form.setError(f, 'file', 'Choose a file or type a name.'); return false; }
            await PP.sleep(500);
            const u = PP.currentUser();
            docs.unshift({ id: `DOC-${Date.now().toString(36)}`, name, type: PP.form.read(f).docType, size: file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '—', date: PP.today(), by: u ? u.name : 'Staff' });
            PP.audit('Document uploaded', p.id, name); PP.save(); PP.ui.toast(`Uploaded <b>${esc(name)}</b>`);
            renderProfile(el, p, 'documents');
          } }],
        });
      });
      PP.$$('[data-view]', panel).forEach((b) => b.addEventListener('click', () => {
        const d = docs.find((x) => x.id === b.dataset.view);
        PP.ui.modal({ title: esc(d.name), body: `<div class="pp-doc-preview">${PP.icon('file')}<p class="muted">Preview placeholder — prototype only.</p></div>${kv([['Type', esc(d.type)], ['Size', esc(d.size)], ['Uploaded', esc(PP.fmt.date(d.date))], ['By', esc(d.by)]])}`, buttons: [{ label: 'Close', kind: 'ghost' }] });
      }));
      PP.$$('[data-rm]', panel).forEach((b) => b.addEventListener('click', async () => {
        const d = docs.find((x) => x.id === b.dataset.rm);
        const ok = await PP.ui.confirm({ title: 'Remove document?', message: `Remove <b>${esc(d.name)}</b> from this patient's documents?`, confirmLabel: 'Remove', danger: true });
        if (!ok) return;
        docs.splice(docs.indexOf(d), 1); PP.audit('Document removed', p.id, d.name); PP.save(); PP.ui.toast('Document removed'); renderProfile(el, p, 'documents');
      }));
    },

    consent(panel, p, el) {
      const ITEMS = [
        ['treatment', 'I consent to assessment and treatment, including manual therapy and exercise.', true],
        ['data', 'I agree that my health information is stored and used by the clinic for my care.', true],
        ['reminders', 'I agree to receive appointment reminders by SMS or WhatsApp.', false],
        ['media', 'I allow clinical photos or videos to be taken for my record only.', false],
      ];
      const list = p.consents || [];
      const canSign = PP.can('patients.edit') || PP.can('clinical.write');
      panel.innerHTML = `<div class="pp-split">
        ${PP.ui.card({ title: 'Consent form', body: canSign ? `<form id="consent-form" class="stack" novalidate>
            <fieldset class="pp-consent-items"><legend class="label">Consent items</legend>
              ${ITEMS.map(([k, t, req]) => `<label class="check"><input type="checkbox" name="c_${k}"> <span>${esc(t)}${req ? ' <span class="req">*</span>' : ''}</span></label>`).join('')}
              <div class="error" data-items-error>Treatment and data consent are required.</div>
            </fieldset>
            <div class="form-grid">
              ${PP.form.field({ name: 'signer', label: 'Signed by', required: true, value: p.name })}
              ${PP.form.field({ name: 'relation', label: 'Relationship', type: 'select', placeholder: false, value: 'Self', options: ['Self', 'Parent', 'Guardian', 'Spouse', 'Other'] })}
            </div>
            <div class="field" data-field="signature"><label>Signature<span class="req">*</span></label>
              <div class="pp-sig"><canvas width="600" height="160" aria-label="Signature pad: draw with mouse, pen or finger"></canvas><span class="pp-sig-line">Sign above the line</span></div>
              <div class="row between"><span class="hint">Draw with a mouse, pen or finger.</span><button type="button" class="btn btn-ghost btn-sm" data-clear>${PP.icon('refresh')} Clear</button></div>
              <div class="error">Please sign the form.</div></div>
            <div class="form-actions" style="margin-top:0"><button class="btn btn-primary" type="submit" data-savec>${PP.icon('check')} Save consent</button></div>
          </form>` : PP.ui.alert('info', 'Your role can view consent records but cannot record new consent.') })}
        ${PP.ui.card({ title: `Consent history (${list.length})`, flush: true, body: list.length ? `<ul class="list">${list.map((c) => `<li class="pp-consent-row"><div class="grow"><b>${esc(PP.fmt.stamp(c.at))}</b> <span class="small muted">· ${esc(c.signer)} (${esc(c.relation)})</span>
            <div class="small">${c.items.map((k) => esc((ITEMS.find((x) => x[0] === k) || [k, k])[1])).map((t) => `<div>✓ ${t}</div>`).join('')}</div><div class="small muted">Recorded by ${esc(c.by)}</div></div>${c.signature ? `<img class="pp-sig-thumb" src="${esc(c.signature)}" alt="Signature of ${esc(c.signer)}">` : ''}</li>`).join('')}</ul>` : PP.ui.empty({ icon: 'shield', title: 'No consent recorded', text: 'Record the patient’s consent before the first treatment.' }) })}
      </div>`;
      const form = PP.$('#consent-form', panel); if (!form) return;
      const pad = sigPad(PP.$('canvas', form));
      PP.$('[data-clear]', form).addEventListener('click', () => pad.clear());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let ok = PP.form.validate(form);
        const d = PP.form.read(form);
        const fs = PP.$('.pp-consent-items', form); fs.classList.remove('has-error');
        if (!d.c_treatment || !d.c_data) { fs.classList.add('has-error'); ok = false; }
        if (pad.isEmpty()) { PP.form.setError(form, 'signature', 'Please sign the form.'); ok = false; }
        if (!ok) return;
        await PP.ui.busy(PP.$('[data-savec]', form), () => {
          const u = PP.currentUser();
          p.consents = p.consents || [];
          p.consents.unshift({ id: `CNS-${Date.now().toString(36)}`, at: PP.nowStamp(), date: PP.today(), items: ITEMS.map((x) => x[0]).filter((k) => d[`c_${k}`]), signer: d.signer, relation: d.relation, signature: pad.data(), by: u ? u.name : 'Staff' });
          PP.audit('Consent recorded', p.id, `${d.signer} (${d.relation})`); PP.save(); PP.ui.toast('Consent saved with today’s date');
          renderProfile(el, p, 'consent');
        });
      });
    },
  };

  /* ---------------------------------------------------------- signature pad */
  function sigPad(canvas) {
    const ctx = canvas.getContext('2d'); let drawing = false; let dirty = false;
    const r0 = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    if (r0.width) { canvas.width = Math.round(r0.width * dpr); canvas.height = Math.round(r0.height * dpr); ctx.scale(canvas.width / r0.width, canvas.height / r0.height); }
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#12232b';
    const pos = (e) => { const r = canvas.getBoundingClientRect(); const sx = r0.width ? 1 : canvas.width / r.width; const sy = r0.width ? 1 : canvas.height / r.height; return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy]; };
    canvas.addEventListener('pointerdown', (e) => { drawing = true; dirty = true; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); });
    canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, () => { drawing = false; }));
    return {
      clear() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); dirty = false; },
      isEmpty: () => !dirty,
      data: () => canvas.toDataURL('image/png'),
    };
  }

  /* ---------------------------------------------------------- family link */
  function openFamilyLink(p, el) {
    const sameMobile = live().filter((x) => x.id !== p.id && digits(x.mobile) === digits(p.mobile)).map((x) => x.id);
    const opts = live().filter((x) => x.id !== p.id && (!p.familyGroup || x.familyGroup !== p.familyGroup))
      .sort((a, b) => (sameMobile.includes(b.id) - sameMobile.includes(a.id)) || a.name.localeCompare(b.name));
    PP.ui.modal({
      title: 'Link family member',
      body: `<form class="stack" onsubmit="return false">
        <div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-fq placeholder="Filter by name, ID or mobile" aria-label="Filter patients"></div>
        ${PP.form.field({ name: 'other', label: 'Patient to link', type: 'select', required: true, options: opts.map((x) => [x.id, `${x.name} · ${x.id} · ${x.mobile}${sameMobile.includes(x.id) ? ' (same mobile)' : ''}`]) })}
        <p class="form-note">Both records keep their own patient ID and clinical history. Only a family group is shared (FR-GA-14).</p></form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Link', kind: 'primary', onClick: ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const o = PP.find.patient(PP.form.read(f).other);
        const fg = p.familyGroup || o.familyGroup || newFamilyId();
        const oldGroup = o.familyGroup;
        if (oldGroup && oldGroup !== fg) PP.db.patients.forEach((x) => { if (x.familyGroup === oldGroup) x.familyGroup = fg; });
        p.familyGroup = fg; o.familyGroup = fg;
        PP.audit('Family link created', p.id, `${fg} · ${o.id}`); PP.save(); PP.ui.toast(`${esc(o.name)} linked as family`);
        renderProfile(el, p, 'family');
      } }],
      onOpen(body) {
        const q = PP.$('[data-fq]', body); const sel = PP.$('select[name="other"]', body);
        q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); PP.$$('option', sel).forEach((o) => { if (o.value) o.hidden = !!t && !o.textContent.toLowerCase().includes(t); }); });
      },
    });
  }

  /* -------------------------------------------------------- merge duplicates */
  const MOVE = ['appointments', 'visits', 'prescriptions', 'invoices', 'payments', 'sessionPlans', 'packages', 'advances', 'requests'];
  function openMerge(p, el) {
    const dups = PP.duplicateCandidates(p.mobile, p.name, p.id).map((x) => x.id);
    const others = live().filter((x) => x.id !== p.id).sort((a, b) => (dups.includes(b.id) - dups.includes(a.id)) || a.name.localeCompare(b.name));
    const counts = (id) => MOVE.filter((c) => c !== 'payments' && c !== 'requests').map((c) => [c, PP.db[c].filter((x) => x.patientId === id).length]);
    PP.ui.modal({
      title: 'Merge duplicate record', size: 'lg',
      body: `<form class="stack" onsubmit="return false">
        ${PP.ui.alert('warning', `The record you pick is merged <b>into ${esc(p.id)} · ${esc(p.name)}</b> (kept). Its appointments, visits, prescriptions, invoices, payments, plans and packages move to the kept record. The merged record is hidden from the directory and kept for the audit trail.`)}
        <div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-mq placeholder="Filter by name, ID or mobile" aria-label="Filter patients"></div>
        ${PP.form.field({ name: 'other', label: 'Record to merge into this one', type: 'select', required: true, value: dups[0] || '', options: others.map((x) => [x.id, `${x.name} · ${x.id} · ${x.mobile}${dups.includes(x.id) ? ' — possible duplicate' : ''}`]) })}
        <div data-preview></div>
        ${PP.form.field({ name: 'reason', label: 'Reason for merge', type: 'textarea', required: true, rows: 2, placeholder: 'e.g. Same person registered twice at different branches', error: 'Please enter a reason.' })}
      </form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Merge records', kind: 'danger solid', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const d = PP.form.read(f); const o = PP.find.patient(d.other);
        await PP.sleep(500);
        let moved = 0;
        MOVE.forEach((c) => PP.db[c].forEach((x) => { if (x.patientId === o.id) { x.patientId = p.id; moved++; } }));
        ['medicalHistory', 'allergies', 'previousTreatments', 'emergencyContact', 'address', 'dob', 'gender', 'referralSource'].forEach((k) => { if (!p[k] && o[k]) p[k] = o[k]; });
        if (Array.isArray(o.documents)) p.documents = docsOf(p).concat(o.documents);
        if (Array.isArray(o.consents)) p.consents = (p.consents || []).concat(o.consents);
        if (!p.familyGroup && o.familyGroup) p.familyGroup = o.familyGroup;
        o.mergedInto = p.id; o.status = 'Merged'; o.mergedAt = PP.today(); o.mergeReason = d.reason;
        PP.audit('Patient records merged', p.id, `${o.id} merged into ${p.id} · ${moved} records moved · ${d.reason}`);
        PP.save(); PP.ui.toast(`${esc(o.id)} merged into ${esc(p.id)} · ${moved} records moved`);
        renderProfile(el, p, 'overview');
      } }],
      onOpen(body) {
        const sel = PP.$('select[name="other"]', body); const prev = PP.$('[data-preview]', body); const q = PP.$('[data-mq]', body);
        const draw = () => {
          const o = PP.find.patient(sel.value);
          if (!o) { prev.innerHTML = ''; return; }
          const row = (x) => `<td><b>${esc(x.name)}</b><span class="sub mono">${esc(x.id)}</span></td><td>${esc(x.mobile)}</td><td>${esc(x.dob ? PP.fmt.date(x.dob) : '—')}</td><td>${esc(PP.branchName(x.branchId))}</td>${counts(x.id).map(([, n]) => `<td class="right mono">${n}</td>`).join('')}`;
          prev.innerHTML = `<div class="table-wrap pp-merge-cmp"><table class="table"><thead><tr><th>Record</th><th>Mobile</th><th>Date of birth</th><th>Branch</th>${counts(o.id).map(([c]) => `<th class="right">${esc(c.replace('sessionPlans', 'plans'))}</th>`).join('')}</tr></thead>
            <tbody><tr class="pp-keep">${row(p)}</tr><tr class="pp-merge">${row(o)}</tr></tbody></table></div><p class="form-note">First row is kept; second row is merged into it.</p>`;
        };
        sel.addEventListener('change', draw); draw();
        q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); PP.$$('option', sel).forEach((op) => { if (op.value) op.hidden = !!t && !op.textContent.toLowerCase().includes(t); }); });
      },
    });
  }
})();
