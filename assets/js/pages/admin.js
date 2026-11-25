/* Physio Point HTML prototype — Professionals, Availability, Settings, Users & Roles, Notifications, Audit.
   Mock data only (D-006). Terminology always comes from PP.t (D-010); a role is not a professional type (D-020). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;
  const $ = PP.$;
  const $$ = PP.$$;

  /* =================================================================== helpers */
  const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first (Bangladesh working week)
  const OPEN_STATUSES = ['Confirmed', 'Scheduled'];
  const UPCOMING = ['Confirmed', 'Scheduled', 'Checked in', 'In session'];
  const CAPS = [
    ['canBeBooked', 'Can be booked'], ['canRecordClinical', 'Record clinical notes'], ['canPrescribeExercise', 'Prescribe exercise'],
    ['canPrescribeMedication', 'Prescribe medication'], ['canIssueCertificate', 'Issue certificate'],
  ];
  const DEFAULT_PRIMARY = '#083E44';
  const DEFAULT_ACTION = '#008B83';

  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#64748b');
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const typeOf = (p) => PP.db.professionalTypes.find((t) => t.id === p.typeId) || null;
  const typeName = (id) => { const t = PP.db.professionalTypes.find((x) => x.id === id); return t ? t.name : '—'; };
  const roleName = (id) => { const r = PP.db.roles.find((x) => x.id === id); return r ? r.name : id || '—'; };
  const userName = (id) => { const u = PP.find.user(id); return u ? u.name : '—'; };
  const proAvatar = (p, cls) => `<span class="avatar ${cls || ''} adm-pro-av" style="background:${safeColor(p.color)}">${esc(PP.initials(p.name))}</span>`;
  const notCounted = ['Cancelled', 'No-show', 'Rescheduled'];
  const todayCount = (proId) => PP.db.appointments.filter((a) => a.professionalId === proId && a.date === PP.today() && !notCounted.includes(a.status)).length;
  const leaveOn = (proId, iso) => PP.db.leaves.find((l) => l.professionalId === proId && l.status !== 'Cancelled' && iso >= l.from && iso <= l.to) || null;
  const fmtRange = (a, b) => (a === b ? PP.fmt.date(a) : `${PP.fmt.date(a)} – ${PP.fmt.date(b)}`);
  const minutesOf = (s) => {
    if (!s || !s.on) return 0;
    let m = PP.toMin(s.end) - PP.toMin(s.start);
    if (s.breakStart && s.breakEnd) m -= PP.toMin(s.breakEnd) - PP.toMin(s.breakStart);
    return Math.max(0, m);
  };
  const hrs = (m) => `${PP.round2(m / 60)} h`;
  const setQuery = (path, q) => { const qs = q ? new URLSearchParams(q).toString() : ''; history.replaceState(null, '', `#${path}${qs ? '?' + qs : ''}`); };
  /** refreshShell rebuilds #view too, so the current page must render again afterwards. */
  const rebuild = () => { PP.refreshShell(); PP.render(); };
  const nextSeq = (list, prefix) => {
    const n = list.reduce((m, x) => { const k = Number(String(x.id || '').split('-').pop()); return Number.isFinite(k) ? Math.max(m, k) : m; }, 0);
    return `${prefix}-${n + 1}`;
  };
  const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
  const maskMobile = (m) => { const d = String(m || '').replace(/\D/g, ''); return d.length >= 8 ? `${d.slice(0, 3)}•••••${d.slice(-3)}` : '—'; };
  const isoOfStamp = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : PP.isoOf(d); };

  /** Toggle switch. The input keeps a name so PP.form.read returns a boolean. */
  const sw = (name, checked, label, attrs) => `<label class="adm-switch"><input type="checkbox" ${name ? `name="${name}"` : ''} ${checked ? 'checked' : ''} ${attrs || ''}><span class="adm-track" aria-hidden="true"></span>${label ? `<span class="adm-switch-label">${label}</span>` : ''}</label>`;

  /** Modal containing a form. onSave(values, form, ctx) may return false to keep the modal open. */
  function formModal({ title, body, size, saveLabel, onSave, onOpen, danger }) {
    return PP.ui.modal({
      title, size,
      body: `<form class="form-grid adm-modal-form" novalidate onsubmit="return false">${body}</form>`,
      onOpen,
      buttons: [
        { label: 'Cancel', kind: 'ghost' },
        { label: saveLabel || 'Save', kind: danger ? 'danger solid' : 'primary', onClick: async (ctx) => {
          const f = $('form', ctx.body);
          if (!PP.form.validate(f)) return false;
          await PP.sleep(300);
          return onSave(PP.form.read(f), f, ctx);
        } },
      ],
    });
  }
  const notFoundCard = (what, back) => `<div class="card">${PP.ui.empty({ icon: 'alert', title: `${what} not found`, text: 'It may have been removed or the link is wrong.', action: `<a class="btn" href="${back}">Go back</a>` })}</div>`;
  const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const defaultCommissionLabel = () => {
    const c = PP.db.settings.commission || {};
    const names = { percent: `${c.percent}% of money collected`, fixed: `fixed ${PP.fmt.money(c.fixedPerVisit)} per visit`, per_service: 'rate per service', tiered: 'tiered monthly rates', mixed: `${c.percent}% + fixed ${PP.fmt.money(c.fixedPerVisit)}` };
    return names[c.model] || c.model || '—';
  };
  const defaultWeek = () => {
    const s = {};
    for (let d = 0; d < 7; d++) s[d] = d === 5 ? { on: false } : { on: true, start: '09:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00' };
    return s;
  };

  /* =========================================================== professionals */
  PP.route('/professionals', {
    title: () => `${PP.t('professional')} Directory`,
    perm: 'professionals.view',
    render({ el, query }) {
      const manage = PP.can('professionals.manage');
      const T = PP.today();
      const scoped = () => PP.db.professionals.filter((p) => PP.inBranch(p));
      const all = scoped();
      const active = all.filter((p) => p.status === 'Active');
      const onLeaveToday = active.filter((p) => leaveOn(p.id, T));
      const apptsToday = PP.sum(active, (p) => todayCount(p.id));
      const st = { q: '', type: query.type || '', branch: '', status: '', view: query.view === 'table' ? 'table' : 'cards' };

      el.innerHTML = PP.ui.pageHead({
        title: esc(PP.t('professionals')),
        subtitle: `Everyone who can be booked or record clinical work. What each person may do comes from their ${esc(PP.tl('professional'))} type, not their user role (D-020).`,
        crumbs: [['Dashboard', '#/dashboard'], [PP.t('professionals')]],
        actions: `<a class="btn" href="#/professionals/availability">${PP.icon('clock')} Availability &amp; leave</a>${manage ? `<a class="btn btn-primary" href="#/professionals/new">${PP.icon('plus')} Add ${esc(PP.t('professional'))}</a>` : ''}`,
      }) + `
        <div class="grid grid-4">
          ${PP.ui.kpi({ label: `Active ${PP.tl('professionals')}`, value: active.length, hint: `${all.length - active.length} inactive`, icon: 'stethoscope' })}
          ${PP.ui.kpi({ label: 'Appointments today', value: apptsToday, hint: PP.fmt.dateLong(T), icon: 'calendar', tone: 'info' })}
          ${PP.ui.kpi({ label: 'On leave today', value: onLeaveToday.length, hint: onLeaveToday.map((p) => esc(PP.proShort(p))).join(', ') || 'Everyone is in', icon: 'clock', tone: 'warning' })}
          ${PP.ui.kpi({ label: `${PP.t('professional')} types`, value: PP.db.professionalTypes.filter((t) => t.status !== 'Inactive').length, hint: '<a href="#/settings?tab=types">Manage types</a>', icon: 'layers', tone: 'lavender' })}
        </div>
        <section class="card mt-4 adm-dir">
          <div class="table-tools">
            <div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search name, designation, specialisation, mobile…" aria-label="Search ${esc(PP.tl('professionals'))}"></div>
            <select class="select adm-filter" data-f="type" aria-label="Type"><option value="">All types</option>${PP.db.professionalTypes.map((t) => `<option value="${esc(t.id)}" ${st.type === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
            <select class="select adm-filter" data-f="branch" aria-label="Branch" ${PP.activeBranchId() !== 'ALL' ? 'disabled title="Limited by the branch switcher in the top bar"' : ''}><option value="">All branches</option>${PP.db.branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
            <select class="select adm-filter" data-f="status" aria-label="Status"><option value="">Any status</option><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="leave">On leave today</option></select>
            ${PP.ui.segmented('view', [['cards', 'Cards'], ['table', 'Table']], st.view)}
          </div>
          <div data-results></div>
        </section>`;

      const filtered = () => scoped().filter((p) => {
        if (st.type && p.typeId !== st.type) return false;
        if (st.branch && p.branchId !== st.branch) return false;
        if (st.status === 'leave' ? !leaveOn(p.id, T) : st.status && p.status !== st.status) return false;
        if (st.q) {
          const hay = [PP.proName(p), p.designation, p.specialization, p.mobile, p.email, typeName(p.typeId), p.registrationNo].join(' ').toLowerCase();
          if (!hay.includes(st.q.toLowerCase())) return false;
        }
        return true;
      });
      const statusCell = (p) => `${PP.ui.badge(p.status)}${leaveOn(p.id, T) ? ` ${PP.ui.badge('Leave')}` : ''}`;
      const results = $('[data-results]', el);

      function draw() {
        if (st.view === 'table') {
          PP.ui.table(results, {
            getRows: filtered, exportName: 'professionals', sortKey: 'name',
            columns: [
              { key: 'name', label: 'Name', sort: (p) => p.name, render: (p) => `<div class="row adm-nowrap">${proAvatar(p)}<div><b>${esc(PP.proName(p))}</b><span class="sub">${esc(p.id)}</span></div></div>`, exportValue: (p) => PP.proName(p) },
              { key: 'type', label: 'Type', sort: (p) => typeName(p.typeId), render: (p) => esc(typeName(p.typeId)) },
              { key: 'designation', label: 'Designation', render: (p) => `${esc(p.designation || '—')}<span class="sub">${esc(p.specialization || '')}</span>`, exportValue: (p) => `${p.designation} / ${p.specialization}` },
              { key: 'branch', label: 'Branch', sort: (p) => PP.branchName(p.branchId), render: (p) => esc(PP.branchName(p.branchId)) },
              { key: 'today', label: 'Today', align: 'right', sort: (p) => todayCount(p.id), render: (p) => String(todayCount(p.id)) },
              { key: 'status', label: 'Status', sort: (p) => p.status, render: statusCell, exportValue: (p) => p.status },
            ],
            onRowClick: (p) => PP.go(`#/professionals/${p.id}`),
            empty: { icon: 'stethoscope', title: `No ${PP.tl('professionals')} yet`, action: manage ? `<a class="btn btn-primary" href="#/professionals/new">Add ${esc(PP.t('professional'))}</a>` : '' },
          });
          return;
        }
        const rows = filtered();
        if (!rows.length) {
          const any = scoped().length > 0;
          results.innerHTML = PP.ui.empty({ icon: any ? 'filter' : 'stethoscope', title: any ? 'No results match your search or filters' : `No ${PP.tl('professionals')} yet`, text: any ? 'Try a different search term or clear the filters.' : '', action: any ? '<button class="btn" data-clear>Clear search and filters</button>' : manage ? `<a class="btn btn-primary" href="#/professionals/new">Add ${esc(PP.t('professional'))}</a>` : '' });
          const c = $('[data-clear]', results);
          if (c) c.addEventListener('click', () => { st.q = ''; st.type = ''; st.branch = ''; st.status = ''; $('[data-q]', el).value = ''; $$('[data-f]', el).forEach((s) => { s.value = ''; }); draw(); });
          return;
        }
        results.innerHTML = `<div class="adm-pro-grid">${rows.map((p) => `
          <a class="adm-pro-card" href="#/professionals/${esc(p.id)}" style="--adm-pro:${safeColor(p.color)}">
            <div class="row adm-nowrap">${proAvatar(p, 'lg')}<div class="adm-minw0"><div class="adm-pro-name">${esc(PP.proName(p))}</div><div class="small muted">${esc(p.designation || '—')}</div></div></div>
            <dl class="adm-pro-meta">
              <dt>Type</dt><dd>${esc(typeName(p.typeId))}</dd>
              <dt>Specialisation</dt><dd>${esc(p.specialization || '—')}</dd>
              <dt>Branch</dt><dd>${esc(PP.branchName(p.branchId))}</dd>
            </dl>
            <div class="row between adm-pro-foot"><span>${statusCell(p)}</span><span class="small"><b class="mono">${todayCount(p.id)}</b> today</span></div>
          </a>`).join('')}</div>`;
      }
      const qi = $('[data-q]', el);
      qi.addEventListener('input', () => { st.q = qi.value.trim(); draw(); });
      $$('[data-f]', el).forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; draw(); }));
      PP.ui.bindSegmented(el, 'view', (v) => { st.view = v; setQuery('/professionals', v === 'table' ? { view: 'table' } : null); draw(); });
      draw();
    },
  });

  /* ---------------------------------------------------------- add / edit form */
  function renderProForm({ el, params }) {
    const editing = params.id ? PP.find.professional(params.id) : null;
    if (params.id && !editing) { el.innerHTML = notFoundCard(PP.t('professional'), '#/professionals'); return; }
    const defBranch = PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : (PP.db.branches[0] || {}).id;
    const p = editing || { title: '', name: '', typeId: '', designation: '', specialization: '', qualification: '', registrationNo: '', mobile: '', email: '', branchId: defBranch, color: '#008B83', status: 'Active', manualCommissionPercent: null, userId: null };
    const users = PP.db.users.filter((u) => u.status !== 'Disabled' && (!u.professionalId || (editing && u.professionalId === editing.id)));
    const term = PP.t('professional');
    const pageTitle = editing ? `Edit ${esc(PP.proName(editing))}` : `Add ${esc(term)}`;
    el.innerHTML = PP.ui.pageHead({
      title: pageTitle,
      crumbs: [[PP.t('professionals'), '#/professionals'], ...(editing ? [[PP.proName(editing), `#/professionals/${editing.id}`]] : []), [editing ? 'Edit' : 'Add']],
    }) + `
      <form class="adm-pro-form" novalidate>
        <div class="grid adm-form-layout">
          ${PP.ui.card({ title: 'Identity and role', body: `<div class="form-grid">
            ${PP.form.field({ name: 'title', label: 'Title', type: 'select', placeholder: false, value: p.title, options: [['', 'No title'], 'Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.'] })}
            ${PP.form.field({ name: 'name', label: 'Full name', required: true, value: p.name, placeholder: 'e.g. Tanvir Ahmed' })}
            ${PP.form.field({ name: 'typeId', label: `${term} type`, type: 'select', required: true, value: p.typeId, options: PP.db.professionalTypes.filter((t) => t.status !== 'Inactive' || t.id === p.typeId).map((t) => [t.id, t.name]), hint: 'Sets what this person may do: be booked, record notes, prescribe. <a href="#/settings?tab=types">Manage types</a>' })}
            ${PP.form.field({ name: 'designation', label: 'Designation', value: p.designation, placeholder: 'e.g. Senior Physiotherapist' })}
            ${PP.form.field({ name: 'specialization', label: 'Specialisation', value: p.specialization, placeholder: 'e.g. Musculoskeletal' })}
            ${PP.form.field({ name: 'qualification', label: 'Qualification', value: p.qualification, placeholder: 'e.g. BPT, MPT (Ortho)' })}
            ${PP.form.field({ name: 'registrationNo', label: 'Registration number', value: p.registrationNo, placeholder: 'e.g. BPA-1021', hint: 'Professional council registration, printed on prescriptions.' })}
            <div class="field" data-field="cap-preview"><span class="label">Type capabilities</span><div class="adm-cap-chips" data-caps></div></div>
          </div>` })}
          ${PP.ui.card({ title: 'Contact and workplace', body: `<div class="form-grid">
            ${PP.form.field({ name: 'mobile', label: 'Mobile', type: 'tel', rule: 'mobile', value: p.mobile, placeholder: '01XXXXXXXXX' })}
            ${PP.form.field({ name: 'email', label: 'Email', type: 'email', rule: 'email', value: p.email, placeholder: 'name@clinic.example' })}
            ${PP.form.field({ name: 'branchId', label: 'Branch', type: 'select', required: true, value: p.branchId, options: PP.db.branches.map((b) => [b.id, b.name]) })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: p.status, options: ['Active', 'Inactive'], hint: 'Inactive people cannot be booked. Their records stay.' })}
            ${PP.form.field({ name: 'color', label: 'Calendar colour', type: 'color', value: safeColor(p.color), hint: 'Used on the appointment calendar.' })}
            ${PP.form.field({ name: 'userId', label: 'Linked user account', type: 'select', placeholder: 'No login (not linked)', value: p.userId || '', options: users.map((u) => [u.id, `${u.name} · ${u.email}`]), hint: 'Optional. Lets this person sign in and see their own schedule and commission. <a href="#/settings/users">Users &amp; roles</a>' })}
          </div>` })}
          ${PP.ui.card({ title: 'Commission', body: `<div class="form-grid">
            ${PP.form.field({ name: 'manualCommissionPercent', label: 'Manual commission %', type: 'number', min: 0, max: 100, step: 0.5, rule: 'nonneg', value: p.manualCommissionPercent == null ? '' : p.manualCommissionPercent, placeholder: 'Clinic default', error: 'Enter a percentage from 0 to 100.' })}
            <div class="field">${PP.ui.alert('info', `Leave blank to use the clinic default (<b>${esc(defaultCommissionLabel())}</b>). A manual % <b>overrides</b> the clinic default for this ${esc(PP.tl('professional'))} (D-026). Commission is earned only on money actually collected (D-025).`)}</div>
          </div>` })}
        </div>
        <div class="form-actions adm-sticky-actions">
          <a class="btn btn-ghost" href="${editing ? `#/professionals/${esc(editing.id)}` : '#/professionals'}">Cancel</a>
          <button class="btn btn-primary" type="submit">${PP.icon('check')} ${editing ? 'Save changes' : `Add ${esc(term)}`}</button>
        </div>
      </form>`;
    const form = $('form', el);
    const capsEl = $('[data-caps]', el);
    const drawCaps = () => {
      const t = PP.db.professionalTypes.find((x) => x.id === form.typeId.value);
      capsEl.innerHTML = t ? CAPS.map(([k, l]) => `<span class="adm-cap ${t[k] ? 'on' : 'off'}">${PP.icon(t[k] ? 'check' : 'x')} ${esc(l)}</span>`).join('') : '<span class="small muted">Choose a type to see what it allows.</span>';
    };
    form.typeId.addEventListener('change', drawCaps);
    drawCaps();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!PP.form.validate(form)) return;
      const v = PP.form.read(form);
      const pct = v.manualCommissionPercent === '' ? null : Number(v.manualCommissionPercent);
      if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) { PP.form.setError(form, 'manualCommissionPercent', 'Enter a percentage from 0 to 100.'); form.manualCommissionPercent.focus(); return; }
      const dupReg = v.registrationNo && v.registrationNo !== '—' && PP.db.professionals.find((x) => x.registrationNo === v.registrationNo && (!editing || x.id !== editing.id));
      if (dupReg) { PP.form.setError(form, 'registrationNo', `Already used by ${PP.proName(dupReg)}.`); form.registrationNo.focus(); return; }
      PP.ui.busy($('button[type=submit]', form), () => {
        const rec = editing || { id: nextSeq(PP.db.professionals, 'PRO'), schedule: defaultWeek(), joined: PP.today() };
        const prevUser = editing ? editing.userId : null;
        const prevPct = editing ? editing.manualCommissionPercent : null;
        Object.assign(rec, {
          title: v.title, name: v.name, typeId: v.typeId, designation: v.designation, specialization: v.specialization, qualification: v.qualification,
          registrationNo: v.registrationNo, mobile: v.mobile, email: v.email, branchId: v.branchId, color: v.color, status: v.status,
          manualCommissionPercent: pct, userId: v.userId || null,
        });
        if (!editing) PP.db.professionals.push(rec);
        if (prevUser && prevUser !== rec.userId) { const u = PP.find.user(prevUser); if (u && u.professionalId === rec.id) u.professionalId = null; }
        if (rec.userId) { const u = PP.find.user(rec.userId); if (u) u.professionalId = rec.id; }
        PP.audit(editing ? 'Professional updated' : 'Professional added', rec.id, `${PP.proName(rec)} · ${typeName(rec.typeId)}`);
        if ((prevPct == null ? null : Number(prevPct)) !== pct && (editing || pct != null)) PP.audit('Manual commission changed', rec.id, `${prevPct == null ? 'Clinic default' : prevPct + '%'} → ${pct == null ? 'Clinic default' : pct + '%'}`);
        PP.save();
        PP.ui.toast(editing ? `${esc(PP.proName(rec))} updated` : `${esc(PP.proName(rec))} added. Set the weekly hours next.`);
        PP.go(editing ? `#/professionals/${rec.id}` : `#/professionals/availability?pro=${rec.id}`);
      });
    });
  }
  PP.route('/professionals/new', { title: () => `Add ${PP.t('professional')}`, perm: 'professionals.manage', render: renderProForm });
  PP.route('/professionals/:id/edit', { title: () => `Edit ${PP.t('professional')}`, perm: 'professionals.manage', render: renderProForm });

  /* ----------------------------------------------------------- weekly table */
  function weekTable(p, editable) {
    return `<div class="table-wrap"><table class="table adm-week"><thead><tr><th scope="col">Day</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Break</th><th scope="col" class="right">Hours</th><th scope="col">Status</th>${editable ? '<th scope="col"><span class="sr-only">Actions</span></th>' : ''}</tr></thead>
      <tbody>${ORDER.map((d) => {
        const s = (p.schedule || {})[d] || { on: false };
        return `<tr class="${s.on ? '' : 'adm-off'}"><td><b>${PP.DAYS[d]}</b></td><td>${s.on ? PP.fmt.time(s.start) : '—'}</td><td>${s.on ? PP.fmt.time(s.end) : '—'}</td>
          <td>${s.on && s.breakStart && s.breakEnd ? `${PP.fmt.time(s.breakStart)} – ${PP.fmt.time(s.breakEnd)}` : '—'}</td><td class="right mono">${s.on ? hrs(minutesOf(s)) : '—'}</td>
          <td>${PP.ui.badge(s.on ? 'Available' : 'Closed')}</td>${editable ? `<td class="right"><button class="btn btn-sm" type="button" data-edit-day="${d}">${PP.icon('edit')} Edit</button></td>` : ''}</tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="4">Weekly total</td><td class="right mono">${hrs(PP.sum(ORDER, (d) => minutesOf((p.schedule || {})[d])))}</td><td colspan="${editable ? 2 : 1}"></td></tr></tfoot></table></div>`;
  }

  /* --------------------------------------------------------------- profile */
  PP.route('/professionals/:id', {
    title: (params) => { const p = PP.find.professional(params.id); return p ? PP.proName(p) : PP.t('professional'); },
    perm: 'professionals.view',
    render({ el, params }) {
      const p = PP.find.professional(params.id);
      if (!p) { el.innerHTML = notFoundCard(PP.t('professional'), '#/professionals'); return; }
      const T = PP.today();
      const manage = PP.can('professionals.manage');
      const type = typeOf(p);
      const me = PP.currentUser();
      const canSeeCommission = PP.can('commissions.manage') || (PP.can('commissions.view_own') && me && me.professionalId === p.id);
      const assigned = PP.db.patients.filter((x) => x.assignedProfessionalId === p.id && !x.mergedInto).length;
      const upcoming = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= T && UPCOMING.includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      const leaves = PP.db.leaves.filter((l) => l.professionalId === p.id && l.status !== 'Cancelled' && l.to >= T).sort((a, b) => a.from.localeCompare(b.from));
      const closures = PP.db.closures.filter((c) => c.date >= T).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
      const leaveNow = leaveOn(p.id, T);
      const linked = p.userId ? PP.find.user(p.userId) : null;

      el.innerHTML = PP.ui.pageHead({
        title: esc(PP.proName(p)),
        subtitle: `${esc(p.designation || typeName(p.typeId))} · ${esc(PP.branchName(p.branchId))}`,
        crumbs: [[PP.t('professionals'), '#/professionals'], [PP.proName(p)]],
        actions: `<a class="btn" href="#/professionals/availability?pro=${esc(p.id)}">${PP.icon('clock')} Schedule &amp; leave</a>
          ${PP.can('appointments.manage') && p.status === 'Active' ? `<a class="btn" href="#/appointments/new?professional=${esc(p.id)}">${PP.icon('calendar')} Book appointment</a>` : ''}
          ${manage ? `<a class="btn btn-primary" href="#/professionals/${esc(p.id)}/edit">${PP.icon('edit')} Edit</a>` : ''}`,
      }) + `
        <section class="card adm-hero" style="--adm-pro:${safeColor(p.color)}">
          <div class="card-body row adm-hero-body">
            ${proAvatar(p, 'lg')}
            <div class="adm-minw0 grow"><div class="adm-hero-name">${esc(PP.proName(p))}</div>
              <div class="muted">${esc(typeName(p.typeId))}${p.specialization ? ` · ${esc(p.specialization)}` : ''}</div>
              <div class="row mt-2">${PP.ui.badge(p.status)}${leaveNow ? PP.ui.badge('Leave') + `<span class="small muted">On leave until ${PP.fmt.date(leaveNow.to)}</span>` : ''}</div></div>
            <div class="adm-hero-stats">
              <div><span class="mono">${todayCount(p.id)}</span><small>Today</small></div>
              <div><span class="mono">${upcoming.length}</span><small>Upcoming</small></div>
              <div><span class="mono">${assigned}</span><small>Assigned patients</small></div>
              ${canSeeCommission ? `<div><span class="mono">${PP.fmt.money(PP.commission.balance(p.id))}</span><small><a href="#/commissions?professional=${esc(p.id)}">Unsettled commission</a></small></div>` : ''}
            </div>
          </div>
        </section>
        <div class="grid grid-2 mt-4 adm-profile">
          ${PP.ui.card({ title: 'Details', body: kv([
            ['ID', `<span class="mono">${esc(p.id)}</span>`], ['Type', esc(typeName(p.typeId))], ['Designation', esc(p.designation || '—')],
            ['Specialisation', esc(p.specialization || '—')], ['Qualification', esc(p.qualification || '—')], ['Registration no.', esc(p.registrationNo || '—')],
            ['Mobile', p.mobile ? `<a href="tel:${esc(p.mobile)}">${esc(p.mobile)}</a>` : '—'], ['Email', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '—'],
            ['Branch', esc(PP.branchName(p.branchId))], ['Calendar colour', `<span class="adm-swatch" style="background:${safeColor(p.color)}"></span> <span class="mono">${esc(p.color || '')}</span>`],
            ['Joined', PP.fmt.date(p.joined)], ['User account', linked ? `${esc(linked.name)} · ${esc(roleName(linked.role))}` : '<span class="muted">No login</span>'],
            ['Commission', p.manualCommissionPercent != null && p.manualCommissionPercent !== '' ? `<b>Manual ${esc(p.manualCommissionPercent)}%</b> <span class="small muted">(overrides clinic default, D-026)</span>` : `Clinic default · ${esc(defaultCommissionLabel())}`],
          ]) })}
          ${PP.ui.card({ title: `What this ${esc(PP.tl('professional'))} type allows`, actions: PP.can('settings.manage') ? '<a class="btn btn-sm btn-ghost" href="#/settings?tab=types">Manage types</a>' : '', body: type ? `
            <ul class="adm-cap-list">${CAPS.map(([k, l]) => `<li class="${type[k] ? 'on' : 'off'}">${PP.icon(type[k] ? 'checkCircle' : 'x')}<span>${esc(l)}</span><b>${type[k] ? 'Yes' : 'No'}</b></li>`).join('')}</ul>
            <p class="small muted mt-3">Capabilities come from the type <b>${esc(type.name)}</b>, not from the user role. Not every ${esc(PP.tl('professional'))} may prescribe.</p>` : PP.ui.alert('warning', 'This person has no valid type. Edit the record and choose one.') })}
          ${PP.ui.card({ title: 'Weekly schedule', actions: manage ? `<a class="btn btn-sm" href="#/professionals/availability?pro=${esc(p.id)}">${PP.icon('edit')} Edit hours</a>` : '', body: weekTable(p, false), flush: true })}
          ${PP.ui.card({ title: 'Upcoming leave and closures', body: leaves.length || closures.length ? `<ul class="list adm-flushlist">
              ${leaves.map((l) => `<li>${PP.icon('clock', 'class="adm-li-ic"')}<div class="grow"><b>${fmtRange(l.from, l.to)}</b><div class="small muted">${esc(l.reason)}</div></div>${PP.ui.badge(l.status)}</li>`).join('')}
              ${closures.map((c) => `<li>${PP.icon('building', 'class="adm-li-ic"')}<div class="grow"><b>${PP.fmt.date(c.date)}</b><div class="small muted">Clinic closed · ${esc(c.reason)}</div></div>${PP.ui.badge('Closed')}</li>`).join('')}
            </ul>` : PP.ui.empty({ icon: 'calendar', title: 'No leave planned', text: 'Leave and clinic closures block booking automatically.' }), flush: true })}
        </div>
        ${PP.ui.card({ title: 'Upcoming appointments', cls: 'mt-4', flush: true, body: '<div data-upcoming></div>' })}`;
      PP.ui.table($('[data-upcoming]', el), {
        rows: upcoming, pageSize: 5, exportName: `appointments-${p.id}`,
        columns: [
          { key: 'date', label: 'Date', sort: (a) => a.date + a.start, render: (a) => `<b>${PP.fmt.dateLong(a.date)}</b><span class="sub">${PP.fmt.time(a.start)} – ${PP.fmt.time(a.end)}</span>`, exportValue: (a) => `${a.date} ${a.start}` },
          { key: 'patient', label: 'Patient', render: (a) => `<a href="#/patients/${esc(a.patientId)}">${esc(PP.patientName(a.patientId))}</a><span class="sub">${esc(a.patientId)}</span>`, exportValue: (a) => PP.patientName(a.patientId) },
          { key: 'service', label: 'Service', render: (a) => esc(PP.serviceName(a.serviceId)) },
          { key: 'room', label: 'Room', render: (a) => esc((PP.find.room(a.roomId) || {}).name || '—') },
          { key: 'status', label: 'Status', render: (a) => PP.ui.badge(a.status), exportValue: (a) => a.status },
        ],
        empty: { icon: 'calendar', title: 'No upcoming appointments' },
      });
    },
  });

  /* ========================================================== availability */
  function editDayModal(p, d, done) {
    const s = Object.assign({ on: false, start: '09:00', end: '17:00', breakStart: '', breakEnd: '' }, (p.schedule || {})[d]);
    let acknowledged = false;
    formModal({
      title: `${esc(PP.DAYS[d])} · ${esc(PP.proShort(p))}`,
      saveLabel: 'Save hours',
      body: `
        <div class="field full">${sw('on', s.on, '<b>Available on this day</b>', 'data-on')}</div>
        <div class="adm-dayfields full form-grid ${s.on ? '' : 'adm-disabled'}" data-dayfields>
          ${PP.form.field({ name: 'start', label: 'Start', type: 'time', value: s.start || '09:00' })}
          ${PP.form.field({ name: 'end', label: 'End', type: 'time', value: s.end || '17:00' })}
          ${PP.form.field({ name: 'breakStart', label: 'Break from', type: 'time', value: s.breakStart || '', hint: 'Optional' })}
          ${PP.form.field({ name: 'breakEnd', label: 'Break until', type: 'time', value: s.breakEnd || '' })}
        </div>
        ${PP.form.field({ name: 'applyAll', label: 'Apply these hours to every working day of this week template', type: 'checkbox', value: false, full: true })}
        <div class="full" data-impact></div>`,
      onOpen: (body) => {
        const on = $('[data-on]', body);
        const toggle = () => { $('[data-dayfields]', body).classList.toggle('adm-disabled', !on.checked); $$('[data-dayfields] input', body).forEach((i) => { i.disabled = !on.checked; }); };
        on.addEventListener('change', () => { acknowledged = false; toggle(); });
        toggle();
      },
      onSave: (v, f, { body, btn }) => {
        const next = v.on ? { on: true, start: v.start, end: v.end, breakStart: v.breakStart || null, breakEnd: v.breakEnd || null } : { on: false };
        if (v.on) {
          let bad = false;
          if (!v.start) { PP.form.setError(f, 'start', 'Enter a start time.'); bad = true; }
          if (!v.end) { PP.form.setError(f, 'end', 'Enter an end time.'); bad = true; } else if (v.start && PP.toMin(v.end) <= PP.toMin(v.start)) { PP.form.setError(f, 'end', 'End must be after start.'); bad = true; }
          if (!!v.breakStart !== !!v.breakEnd) { PP.form.setError(f, v.breakStart ? 'breakEnd' : 'breakStart', 'Enter both break times or neither.'); bad = true; } else if (v.breakStart) {
            if (PP.toMin(v.breakEnd) <= PP.toMin(v.breakStart)) { PP.form.setError(f, 'breakEnd', 'Break must end after it starts.'); bad = true; } else if (PP.toMin(v.breakStart) < PP.toMin(v.start) || PP.toMin(v.breakEnd) > PP.toMin(v.end)) { PP.form.setError(f, 'breakStart', 'The break must fall inside working hours.'); bad = true; }
          }
          if (bad) return false;
        }
        const days = v.applyAll ? ORDER.filter((x) => x === d || (p.schedule[x] && p.schedule[x].on)) : [d];
        const fits = (a) => {
          if (!next.on) return false;
          const st = PP.toMin(a.start); const en = PP.toMin(a.end);
          if (st < PP.toMin(next.start) || en > PP.toMin(next.end)) return false;
          if (next.breakStart && st < PP.toMin(next.breakEnd) && en > PP.toMin(next.breakStart)) return false;
          return true;
        };
        const hit = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= PP.today() && OPEN_STATUSES.includes(a.status) && days.includes(PP.dow(a.date)) && !fits(a)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        if (hit.length && !acknowledged) {
          acknowledged = true;
          $('[data-impact]', body).innerHTML = PP.ui.alert('warning', `<b>${hit.length} booked appointment${hit.length > 1 ? 's fall' : ' falls'} outside the new hours.</b> They are kept, but you should reschedule them.<ul class="adm-hitlist">${hit.slice(0, 8).map((a) => `<li>${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)} · ${esc(PP.patientName(a.patientId))} · ${esc(a.status)}</li>`).join('')}${hit.length > 8 ? `<li>… and ${hit.length - 8} more</li>` : ''}</ul>`);
          btn.textContent = 'Save anyway';
          return false;
        }
        days.forEach((x) => { p.schedule[x] = PP.clone(next); });
        PP.audit('Schedule changed', p.id, `${PP.proName(p)} · ${days.map((x) => PP.DAYS[x].slice(0, 3)).join(', ')} → ${next.on ? `${next.start}–${next.end}${next.breakStart ? ` (break ${next.breakStart}–${next.breakEnd})` : ''}` : 'Closed'}`);
        PP.save();
        PP.ui.toast(`Hours saved for ${days.length > 1 ? `${days.length} days` : PP.DAYS[d]}. Booking slots updated.${hit.length ? ` ${hit.length} appointment(s) need rescheduling.` : ''}`, hit.length ? 'warning' : 'positive', 4200);
        done();
      },
    });
  }

  function addLeaveModal(p, done) {
    let acknowledged = false;
    formModal({
      title: `Add leave · ${esc(PP.proName(p))}`,
      saveLabel: 'Save leave',
      body: `
        ${PP.form.field({ name: 'from', label: 'From', type: 'date', required: true, value: PP.today() })}
        ${PP.form.field({ name: 'to', label: 'To', type: 'date', required: true, value: PP.today() })}
        ${PP.form.field({ name: 'reason', label: 'Reason', required: true, full: true, placeholder: 'e.g. Annual leave, conference, sick leave' })}
        ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, options: ['Approved', 'Pending'], value: 'Approved', hint: 'Approved and pending leave both block new bookings.' })}
        <div class="full" data-impact></div>`,
      onOpen: (body) => { $$('input[type=date]', body).forEach((i) => i.addEventListener('change', () => { acknowledged = false; $('[data-impact]', body).innerHTML = ''; })); },
      onSave: (v, f, { body, btn }) => {
        if (v.to < v.from) { PP.form.setError(f, 'to', 'The end date must be on or after the start date.'); return false; }
        const overlap = PP.db.leaves.find((l) => l.professionalId === p.id && l.status !== 'Cancelled' && v.from <= l.to && v.to >= l.from);
        if (overlap) { PP.form.setError(f, 'from', `Overlaps existing leave ${fmtRange(overlap.from, overlap.to)}.`); return false; }
        const hit = PP.db.appointments.filter((a) => a.professionalId === p.id && a.date >= v.from && a.date <= v.to && OPEN_STATUSES.includes(a.status)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        if (hit.length && !acknowledged) {
          acknowledged = true;
          $('[data-impact]', body).innerHTML = PP.ui.alert('warning', `<b>${hit.length} confirmed or scheduled appointment${hit.length > 1 ? 's' : ''} in this period.</b> Saving keeps them; reschedule or cancel them afterwards.<ul class="adm-hitlist">${hit.slice(0, 10).map((a) => `<li>${PP.fmt.dateShort(a.date)} ${PP.fmt.time(a.start)} · ${esc(PP.patientName(a.patientId))} · ${esc(PP.serviceName(a.serviceId))} · ${esc(a.status)}</li>`).join('')}${hit.length > 10 ? `<li>… and ${hit.length - 10} more</li>` : ''}</ul>`);
          btn.textContent = 'Save leave anyway';
          return false;
        }
        const rec = { id: PP.nextId('LEV', 3), professionalId: p.id, from: v.from, to: v.to, reason: v.reason, status: v.status, createdAt: PP.nowStamp() };
        PP.db.leaves.push(rec);
        PP.audit('Leave added', p.id, `${PP.proName(p)} · ${fmtRange(v.from, v.to)} · ${v.reason}${hit.length ? ` · ${hit.length} appointment(s) affected` : ''}`);
        PP.notify('Leave recorded', `${PP.proName(p)} · ${fmtRange(v.from, v.to)}`, `#/professionals/availability?pro=${p.id}`);
        PP.save();
        PP.ui.toast(`Leave saved. ${esc(PP.proShort(p))} cannot be booked ${fmtRange(v.from, v.to)}.`, hit.length ? 'warning' : 'positive', 4200);
        done();
      },
    });
  }

  function addClosureModal(done) {
    let acknowledged = false;
    formModal({
      title: 'Add clinic closure', saveLabel: 'Save closure',
      body: `
        ${PP.form.field({ name: 'date', label: 'Date', type: 'date', required: true, value: PP.addDays(PP.today(), 1), min: PP.today() })}
        ${PP.form.field({ name: 'reason', label: 'Reason', required: true, placeholder: 'e.g. Public holiday, renovation' })}
        <div class="full small muted">A closure applies to the whole clinic: nobody can be booked that day.</div>
        <div class="full" data-impact></div>`,
      onOpen: (body) => { $('input[type=date]', body).addEventListener('change', () => { acknowledged = false; $('[data-impact]', body).innerHTML = ''; }); },
      onSave: (v, f, { body, btn }) => {
        if (PP.db.closures.some((c) => c.date === v.date)) { PP.form.setError(f, 'date', 'This date is already a closure.'); return false; }
        const hit = PP.db.appointments.filter((a) => a.date === v.date && OPEN_STATUSES.includes(a.status));
        if (hit.length && !acknowledged) {
          acknowledged = true;
          $('[data-impact]', body).innerHTML = PP.ui.alert('warning', `<b>${hit.length} appointment${hit.length > 1 ? 's are' : ' is'} booked on ${PP.fmt.date(v.date)}.</b> They are kept; contact the patients and reschedule.<ul class="adm-hitlist">${hit.slice(0, 10).map((a) => `<li>${PP.fmt.time(a.start)} · ${esc(PP.patientName(a.patientId))} · ${esc(PP.proShort(a.professionalId))}</li>`).join('')}${hit.length > 10 ? `<li>… and ${hit.length - 10} more</li>` : ''}</ul>`);
          btn.textContent = 'Save closure anyway';
          return false;
        }
        PP.db.closures.push({ date: v.date, reason: v.reason });
        PP.db.closures.sort((a, b) => a.date.localeCompare(b.date));
        PP.audit('Clinic closure added', v.date, `${v.reason}${hit.length ? ` · ${hit.length} appointment(s) affected` : ''}`);
        PP.save();
        PP.ui.toast(`Clinic closed on ${PP.fmt.date(v.date)}. Booking is blocked for that day.`, hit.length ? 'warning' : 'positive');
        done();
      },
    });
  }

  PP.route('/professionals/availability', {
    title: 'Availability & Leave',
    perm: 'professionals.view',
    render({ el, query }) {
      const manage = PP.can('professionals.manage');
      const pros = PP.db.professionals.filter((p) => PP.inBranch(p) && p.status === 'Active');
      let cur = query.pro && pros.some((p) => p.id === query.pro) ? query.pro : (pros[0] || {}).id;
      el.innerHTML = PP.ui.pageHead({
        title: 'Availability &amp; Leave',
        subtitle: 'Weekly slots, breaks and exceptions. Leave, breaks and clinic closures block booking automatically; pending online requests never block a slot.',
        crumbs: [[PP.t('professionals'), '#/professionals'], ['Availability & leave']],
        actions: manage ? `<button class="btn" data-add-closure>${PP.icon('building')} Add clinic closure</button>` : '',
      }) + (manage ? '' : PP.ui.alert('info', 'You can view schedules. Changing them needs the permission “Manage professionals and schedules”.')) + `
        <section class="card ${manage ? '' : 'mt-4'} adm-avail"><div data-tabs class="adm-tabs-pad"></div><div data-pane></div></section>
        <div data-closures class="mt-4"></div>`;
      const pane = $('[data-pane]', el);
      if (!pros.length) {
        $('[data-tabs]', el).innerHTML = '';
        pane.innerHTML = PP.ui.empty({ icon: 'stethoscope', title: `No active ${PP.tl('professionals')} in this branch`, text: 'Change the branch in the top bar or add someone.', action: PP.can('professionals.manage') ? `<a class="btn btn-primary" href="#/professionals/new">Add ${esc(PP.t('professional'))}</a>` : '' });
      } else {
        PP.ui.tabs($('[data-tabs]', el), { tabs: pros.map((p) => ({ id: p.id, label: PP.proShort(p) })), active: cur, onChange: (id) => { cur = id; setQuery('/professionals/availability', { pro: id }); drawPane(); } });
        drawPane();
      }
      drawClosures();
      const addBtn = $('[data-add-closure]', el);
      if (addBtn) addBtn.addEventListener('click', () => addClosureModal(() => { drawClosures(); if (pros.length) drawPane(); }));

      function drawPane() {
        const p = PP.find.professional(cur); if (!p) return;
        const T = PP.today();
        const step = PP.db.settings.slotMinutes || 30;
        const leaves = PP.db.leaves.filter((l) => l.professionalId === p.id).sort((a, b) => b.from.localeCompare(a.from));
        const days = Array.from({ length: 14 }, (_, i) => PP.addDays(T, i));
        pane.innerHTML = `
          <div class="card-body adm-avail-head row">
            ${proAvatar(p)}<div class="grow adm-minw0"><b>${esc(PP.proName(p))}</b><div class="small muted">${esc(typeName(p.typeId))} · ${esc(PP.branchName(p.branchId))} · ${hrs(PP.sum(ORDER, (d) => minutesOf(p.schedule[d])))} per week</div></div>
            <a class="btn btn-sm btn-ghost" href="#/professionals/${esc(p.id)}">View profile ${PP.icon('arrowR')}</a>
          </div>
          <div class="adm-avail-grid">
            <div class="adm-avail-main">
              <h3 class="adm-sub">Weekly hours</h3>
              ${weekTable(p, manage)}
              <h3 class="adm-sub mt-4">Next 14 days <span class="small muted">· free ${step}-minute slots, as the booking screen sees them</span></h3>
              <div class="adm-days">${days.map((iso) => {
                const w = PP.sched.window(p.id, iso);
                const free = w && !w.closed ? PP.sched.slots(p.id, iso, step).filter((s) => s.free).length : 0;
                return `<div class="adm-day ${w && w.closed ? 'closed' : ''} ${iso === T ? 'today' : ''}" title="${esc(w && w.closed ? w.reason : `${PP.fmt.time(w.start)} – ${PP.fmt.time(w.end)}`)}">
                  <div class="adm-day-d">${PP.DAYS[PP.dow(iso)].slice(0, 3)}</div><div class="adm-day-n">${PP.fmt.dateShort(iso)}</div>
                  <div class="adm-day-s">${w && w.closed ? esc(/not working/.test(w.reason) ? 'Day off' : w.reason.split(':')[0]) :`<b class="mono">${free}</b> free`}</div></div>`;
              }).join('')}</div>
            </div>
            <div class="adm-avail-side">
              <div class="row between"><h3 class="adm-sub">Leave</h3>${manage ? `<button class="btn btn-sm btn-primary" data-add-leave>${PP.icon('plus')} Add leave</button>` : ''}</div>
              ${leaves.length ? `<ul class="list adm-leave-list">${leaves.map((l) => {
                const past = l.to < T;
                const n = PP.diffDays(l.from, l.to) + 1;
                return `<li class="${past || l.status === 'Cancelled' ? 'adm-muted' : ''}"><div class="grow adm-minw0"><b>${fmtRange(l.from, l.to)}</b> <span class="small muted">· ${n} day${n > 1 ? 's' : ''}</span><div class="small muted">${esc(l.reason)}</div></div>
                  ${PP.ui.badge(past && l.status !== 'Cancelled' ? 'Completed' : l.status)}
                  ${manage && !past && l.status !== 'Cancelled' ? `<button class="btn btn-sm btn-ghost" data-cancel-leave="${esc(l.id)}" aria-label="Cancel leave">${PP.icon('x')}</button>` : ''}</li>`;
              }).join('')}</ul>` : PP.ui.empty({ icon: 'calendar', title: 'No leave recorded', text: 'Leave blocks booking for the days it covers.' })}
            </div>
          </div>`;
        $$('[data-edit-day]', pane).forEach((b) => b.addEventListener('click', () => editDayModal(p, Number(b.dataset.editDay), drawPane)));
        const al = $('[data-add-leave]', pane);
        if (al) al.addEventListener('click', () => addLeaveModal(p, drawPane));
        $$('[data-cancel-leave]', pane).forEach((b) => b.addEventListener('click', async () => {
          const l = PP.db.leaves.find((x) => x.id === b.dataset.cancelLeave); if (!l) return;
          const ok = await PP.ui.confirm({ title: 'Cancel this leave?', message: `${esc(PP.proName(p))} will be bookable again ${fmtRange(l.from, l.to)}.`, confirmLabel: 'Cancel leave', danger: true });
          if (!ok) return;
          l.status = 'Cancelled';
          PP.audit('Leave cancelled', p.id, `${PP.proName(p)} · ${fmtRange(l.from, l.to)}`);
          PP.save(); PP.ui.toast('Leave cancelled. The days are bookable again.'); drawPane();
        }));
      }

      function drawClosures() {
        const host = $('[data-closures]', el);
        const T = PP.today();
        const list = PP.db.closures.slice().sort((a, b) => a.date.localeCompare(b.date));
        host.innerHTML = PP.ui.card({
          title: 'Clinic closures',
          actions: manage ? `<button class="btn btn-sm btn-primary" data-add-closure2>${PP.icon('plus')} Add closure</button>` : '',
          flush: true,
          body: list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Reason</th><th class="right">Booked appointments</th><th>Status</th>${manage ? '<th><span class="sr-only">Actions</span></th>' : ''}</tr></thead><tbody>
            ${list.map((c) => {
              const n = PP.db.appointments.filter((a) => a.date === c.date && OPEN_STATUSES.includes(a.status)).length;
              return `<tr class="${c.date < T ? 'adm-muted' : ''}"><td><b>${PP.fmt.dateLong(c.date)}</b></td><td>${esc(c.reason)}</td><td class="right mono">${n ? `<span class="adm-warn-num">${n}</span>` : '0'}</td><td>${PP.ui.badge(c.date < T ? 'Completed' : 'Closed')}</td>
                ${manage ? `<td class="right">${c.date >= T ? `<button class="btn btn-sm btn-ghost" data-del-closure="${esc(c.date)}">${PP.icon('trash')} Remove</button>` : ''}</td>` : ''}</tr>`;
            }).join('')}</tbody></table></div>` : PP.ui.empty({ icon: 'building', title: 'No closures planned', text: 'Add public holidays and other days the clinic is closed.' }),
        });
        const b2 = $('[data-add-closure2]', host);
        if (b2) b2.addEventListener('click', () => addClosureModal(() => { drawClosures(); if (pros.length) drawPane(); }));
        $$('[data-del-closure]', host).forEach((b) => b.addEventListener('click', async () => {
          const c = PP.db.closures.find((x) => x.date === b.dataset.delClosure); if (!c) return;
          const ok = await PP.ui.confirm({ title: 'Remove this closure?', message: `The clinic will be bookable again on ${PP.fmt.date(c.date)}.`, confirmLabel: 'Remove closure', danger: true });
          if (!ok) return;
          PP.db.closures = PP.db.closures.filter((x) => x !== c);
          PP.audit('Clinic closure removed', c.date, c.reason);
          PP.save(); PP.ui.toast('Closure removed'); drawClosures(); if (pros.length) drawPane();
        }));
      }
    },
  });

  /* ============================================================== settings */
  const SET_TABS = [
    ['profile', 'Clinic profile'], ['branches', 'Branches & rooms'], ['branding', 'Branding'], ['terminology', 'Terminology'],
    ['types', 'Professional types'], ['documents', 'Prescription & invoice'], ['security', 'Security'], ['backups', 'Backups'],
    ['licence', 'Licence & system status'], ['data', 'Data import / export'],
  ];

  /** Card with a form and a Save button; fn(values, form) runs after validation and a simulated delay. */
  const formCard = (title, inner, note, extraButtons) => PP.ui.card({
    title,
    body: `<form class="adm-form" novalidate>${inner}<div class="form-actions">${note ? `<span class="form-note adm-grow">${note}</span>` : ''}${extraButtons || ''}<button class="btn btn-primary" type="submit">${PP.icon('check')} Save changes</button></div></form>`,
  });
  function bindSave(root, fn) {
    const f = $('form.adm-form', root);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!PP.form.validate(f)) return;
      PP.ui.busy($('button[type=submit]', f), () => fn(PP.form.read(f), f));
    });
    return f;
  }

  const SETTINGS = {};

  SETTINGS.profile = (panel) => {
    const s = PP.db.settings;
    panel.innerHTML = formCard('Clinic profile', `<div class="form-grid">
      ${PP.form.field({ name: 'clinicName', label: 'Clinic name', required: true, value: s.clinicName })}
      ${PP.form.field({ name: 'tagline', label: 'Tagline', value: s.tagline })}
      ${PP.form.field({ name: 'phone', label: 'Phone', type: 'tel', rule: 'mobile', value: s.phone })}
      ${PP.form.field({ name: 'email', label: 'Email', type: 'email', rule: 'email', value: s.email })}
      ${PP.form.field({ name: 'address', label: 'Address', type: 'textarea', rows: 2, value: s.address, full: true })}
      ${PP.form.field({ name: 'timezone', label: 'Time zone', type: 'select', placeholder: false, value: s.timezone, options: [['Asia/Dhaka', 'Asia/Dhaka (UTC+6)'], ['Asia/Kolkata', 'Asia/Kolkata (UTC+5:30)'], ['Asia/Dubai', 'Asia/Dubai (UTC+4)'], ['UTC', 'UTC']] })}
      ${PP.form.field({ name: 'currencyStyle', label: 'Currency display', type: 'select', placeholder: false, value: s.currencyStyle, options: [['code', 'Code · BDT 1,200'], ['symbol', 'Symbol · ৳ 1,200']], hint: 'Amounts are always Bangladeshi Taka (BDT).' })}
      ${PP.form.field({ name: 'slotMinutes', label: 'Default slot length', type: 'select', placeholder: false, value: s.slotMinutes, options: [10, 15, 20, 30, 45, 60].map((n) => [n, `${n} minutes`]), hint: 'Step used for booking slots.' })}
      ${PP.form.field({ name: 'language', label: 'Default language', type: 'select', placeholder: false, value: s.language || 'English', options: ['English', 'Bangla'], hint: 'UI translations are a later milestone.' })}
    </div>`, 'Shown on the sidebar, printed documents and the public booking page.');
    bindSave(panel, (v) => {
      const changed = v.clinicName !== s.clinicName;
      Object.assign(s, { clinicName: v.clinicName, tagline: v.tagline, phone: v.phone, email: v.email, address: v.address, timezone: v.timezone, currencyStyle: v.currencyStyle, slotMinutes: Number(v.slotMinutes), language: v.language });
      PP.audit('Clinic profile changed', 'settings', `${v.clinicName} · slot ${v.slotMinutes} min · currency ${v.currencyStyle}`);
      PP.save();
      PP.ui.toast(`Clinic profile saved. Example amount: ${PP.fmt.money(1200)}`);
      if (changed) rebuild();
    });
  };

  SETTINGS.branches = (panel) => {
    panel.innerHTML = `
      ${PP.ui.card({ title: 'Branches', actions: `<button class="btn btn-sm btn-primary" data-add="branch">${PP.icon('plus')} Add branch</button>`, flush: true, body: '<div data-t="branches"></div>' })}
      <div class="grid grid-2 mt-4 adm-br-grid">
        ${PP.ui.card({ title: 'Rooms', actions: `<button class="btn btn-sm btn-primary" data-add="room">${PP.icon('plus')} Add room</button>`, flush: true, body: '<div data-t="rooms"></div>' })}
        ${PP.ui.card({ title: 'Equipment', actions: `<button class="btn btn-sm btn-primary" data-add="equipment">${PP.icon('plus')} Add equipment</button>`, flush: true, body: '<div data-t="equipment"></div>' })}
      </div>`;
    const branchOpts = () => PP.db.branches.map((b) => [b.id, b.name]);
    const editBtn = (kind, id) => `<button class="btn btn-sm btn-ghost" data-edit="${kind}" data-id="${esc(id)}">${PP.icon('edit')} Edit</button>`;
    const tables = {};
    tables.branches = PP.ui.table($('[data-t="branches"]', panel), {
      getRows: () => PP.db.branches, exportName: 'branches', pageSize: 5,
      columns: [
        { key: 'name', label: 'Branch', sort: (b) => b.name, render: (b) => `<b>${esc(b.name)}</b><span class="sub">${esc(b.id)}</span>` },
        { key: 'address', label: 'Address', render: (b) => esc(b.address || '—') },
        { key: 'phone', label: 'Phone', render: (b) => esc(b.phone || '—') },
        { key: 'manager', label: 'Manager', render: (b) => esc(userName(b.manager)) },
        { key: 'rooms', label: 'Rooms', align: 'right', render: (b) => String(PP.db.rooms.filter((r) => r.branchId === b.id).length) },
        { key: 'pros', label: PP.t('professionals'), align: 'right', render: (b) => String(PP.db.professionals.filter((p) => p.branchId === b.id && p.status === 'Active').length) },
        { key: 'status', label: 'Status', render: (b) => PP.ui.badge(b.status || 'Active'), exportValue: (b) => b.status },
        { key: 'x', label: '', render: (b) => editBtn('branch', b.id), exportValue: () => '' },
      ],
      empty: { icon: 'building', title: 'No branches yet' },
    });
    tables.rooms = PP.ui.table($('[data-t="rooms"]', panel), {
      getRows: () => PP.db.rooms, exportName: 'rooms', pageSize: 5,
      filters: [{ id: 'br', label: 'All branches', options: branchOpts(), match: (r, v) => r.branchId === v }],
      columns: [
        { key: 'name', label: 'Room', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.type || '')}</span>` },
        { key: 'branch', label: 'Branch', render: (r) => esc(PP.branchName(r.branchId)) },
        { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status || 'Active'), exportValue: (r) => r.status || 'Active' },
        { key: 'x', label: '', render: (r) => editBtn('room', r.id), exportValue: () => '' },
      ],
      empty: { icon: 'building', title: 'No rooms yet' },
    });
    tables.equipment = PP.ui.table($('[data-t="equipment"]', panel), {
      getRows: () => PP.db.equipment, exportName: 'equipment', pageSize: 5,
      filters: [{ id: 'br', label: 'All branches', options: branchOpts(), match: (r, v) => r.branchId === v }],
      columns: [
        { key: 'name', label: 'Equipment', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b>` },
        { key: 'branch', label: 'Branch', render: (r) => esc(PP.branchName(r.branchId)) },
        { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status, r.status === 'Maintenance' ? 'warning' : undefined), exportValue: (r) => r.status },
        { key: 'x', label: '', render: (r) => editBtn('equipment', r.id), exportValue: () => '' },
      ],
      empty: { icon: 'activity', title: 'No equipment listed' },
    });
    const refreshAll = () => Object.values(tables).forEach((t) => t.refresh());

    const editors = {
      branch(rec) {
        const b = rec || { name: '', address: '', phone: '', manager: '', status: 'Active' };
        formModal({
          title: rec ? `Edit ${esc(b.name)}` : 'Add branch',
          body: `${PP.form.field({ name: 'name', label: 'Branch name', required: true, value: b.name, full: true })}
            ${PP.form.field({ name: 'address', label: 'Address', value: b.address, full: true })}
            ${PP.form.field({ name: 'phone', label: 'Phone', type: 'tel', rule: 'mobile', value: b.phone })}
            ${PP.form.field({ name: 'manager', label: 'Branch manager', type: 'select', placeholder: 'Not set', value: b.manager || '', options: PP.db.users.filter((u) => u.status === 'Active').map((u) => [u.id, u.name]) })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: b.status || 'Active', options: ['Active', 'Inactive'], hint: 'Inactive branches keep their records.' })}`,
          onSave: (v, f) => {
            if (PP.db.branches.some((x) => x !== rec && x.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'A branch with this name exists.'); return false; }
            const target = rec || { id: nextSeq(PP.db.branches, 'BR') };
            Object.assign(target, { name: v.name, address: v.address, phone: v.phone, manager: v.manager || null, status: v.status });
            if (!rec) PP.db.branches.push(target);
            PP.audit(rec ? 'Branch updated' : 'Branch added', target.id, target.name);
            PP.save(); PP.ui.toast(rec ? 'Branch updated' : 'Branch added. It now appears in the branch switcher.');
            rebuild();
          },
        });
      },
      room(rec) {
        const r = rec || { branchId: PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : '', name: '', type: 'Treatment', status: 'Active' };
        formModal({
          title: rec ? `Edit ${esc(r.name)}` : 'Add room',
          body: `${PP.form.field({ name: 'name', label: 'Room name', required: true, value: r.name })}
            ${PP.form.field({ name: 'branchId', label: 'Branch', type: 'select', required: true, value: r.branchId, options: branchOpts() })}
            ${PP.form.field({ name: 'type', label: 'Room type', type: 'select', placeholder: false, value: r.type, options: ['Treatment', 'Gym', 'Consultation', 'Hydrotherapy', 'Other'] })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: r.status || 'Active', options: ['Active', 'Inactive'] })}`,
          onSave: (v, f) => {
            if (PP.db.rooms.some((x) => x !== rec && x.branchId === v.branchId && x.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'This branch already has a room with this name.'); return false; }
            const target = rec || { id: nextSeq(PP.db.rooms, 'RM') };
            Object.assign(target, v);
            if (!rec) PP.db.rooms.push(target);
            PP.audit(rec ? 'Room updated' : 'Room added', target.id, `${target.name} · ${PP.branchName(target.branchId)}`);
            PP.save(); PP.ui.toast(rec ? 'Room updated' : 'Room added'); refreshAll();
          },
        });
      },
      equipment(rec) {
        const r = rec || { branchId: PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : '', name: '', status: 'Available' };
        formModal({
          title: rec ? `Edit ${esc(r.name)}` : 'Add equipment',
          body: `${PP.form.field({ name: 'name', label: 'Name', required: true, value: r.name, full: true })}
            ${PP.form.field({ name: 'branchId', label: 'Branch', type: 'select', required: true, value: r.branchId, options: branchOpts() })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: r.status, options: ['Available', 'In use', 'Maintenance', 'Retired'] })}`,
          onSave: (v) => {
            const target = rec || { id: nextSeq(PP.db.equipment, 'EQ') };
            Object.assign(target, v);
            if (!rec) PP.db.equipment.push(target);
            PP.save(); PP.ui.toast(rec ? 'Equipment updated' : 'Equipment added'); refreshAll();
          },
        });
      },
    };
    const coll = { branch: 'branches', room: 'rooms', equipment: 'equipment' };
    panel.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { editors[add.dataset.add](null); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { const rec = PP.db[coll[ed.dataset.edit]].find((x) => x.id === ed.dataset.id); if (rec) editors[ed.dataset.edit](rec); }
    });
  };

  /* -- branding (white label, FR-PLT-05) */
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((t, c, i) => t + c * [0.2126, 0.7152, 0.0722][i], 0); };
  const contrastWhite = (hex) => PP.round2(1.05 / (lum(hex) + 0.05));

  SETTINGS.branding = (panel) => {
    const s = PP.db.settings;
    let logo = s.logoImage || '';
    const colorField = (name, label, value, hint) => `<div class="field" data-field="${name}"><label for="adm-${name}">${esc(label)}</label>
      <div class="adm-color"><input type="color" value="${esc(value)}" data-pick="${name}" aria-label="${esc(label)} picker"><input class="input mono" id="adm-${name}" name="${name}" value="${esc(value)}" maxlength="7" required></div>
      <div class="hint">${hint}</div><div class="error" role="alert">Enter a colour as #RRGGBB.</div></div>`;
    panel.innerHTML = `<div class="grid grid-2 adm-brand">
      ${formCard('Branding', `<div class="form-grid">
        ${PP.form.field({ name: 'clinicName', label: 'Clinic name', required: true, value: s.clinicName })}
        ${PP.form.field({ name: 'tagline', label: 'Tagline', value: s.tagline })}
        ${colorField('primary', 'Primary colour', s.primary || DEFAULT_PRIMARY, 'Sidebar, headings. Original: #083E44 navy.')}
        ${colorField('action', 'Action colour', s.action || DEFAULT_ACTION, 'Buttons, links, active states. Original: #008B83 teal.')}
        <div class="field full" data-field="logo"><span class="label">Logo</span>
          <div class="row"><label class="btn btn-sm">${PP.icon('upload')} Upload image<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-logo class="sr-only"></label><button type="button" class="btn btn-sm btn-ghost" data-logo-remove>${PP.icon('trash')} Remove logo</button></div>
          <div class="hint">Square PNG, JPG, SVG or WebP, up to 300 KB. Stored in this browser only.</div><div class="error" role="alert"></div></div>
        <div class="full" data-contrast></div>
      </div>`, 'White label: only the primary and action colours are overridable; status colours stay fixed for accessibility.', `<button type="button" class="btn btn-ghost" data-reset>${PP.icon('refresh')} Reset to original palette</button>`)}
      ${PP.ui.card({ title: 'Live preview', body: `<div class="adm-preview" data-preview>
        <div class="adm-pv-side"><div class="adm-pv-brand"><span class="adm-pv-logo" data-pv-logo></span><div><b data-pv-name></b><small data-pv-tag></small></div></div>
          <div class="adm-pv-nav"><span class="on">${PP.icon('home')} Dashboard</span><span>${PP.icon('calendar')} Appointments</span><span>${PP.icon('users')} Patients</span><span>${PP.icon('stethoscope')} ${esc(PP.t('professionals'))}</span></div></div>
        <div class="adm-pv-main"><div class="adm-pv-title">Today’s appointments</div><p class="small muted">Example card with your colours.</p>
          <div class="row"><span class="adm-pv-btn">${PP.icon('plus')} Add appointment</span><span class="adm-pv-ghost">Export</span></div>
          <div class="row mt-3">${PP.ui.badge('Confirmed')}${PP.ui.badge('Pending')}<span class="adm-pv-link">View all →</span></div>
          <div class="adm-pv-tabs"><span class="on">Upcoming</span><span>Completed</span></div></div>
      </div>` })}
    </div>`;
    const f = $('form.adm-form', panel);
    const pv = $('[data-preview]', panel);
    const fe = (n) => $(`[name="${n}"]`, f);
    const update = () => {
      const p = isHex(fe('primary').value) ? fe('primary').value : DEFAULT_PRIMARY;
      const a = isHex(fe('action').value) ? fe('action').value : DEFAULT_ACTION;
      pv.style.setProperty('--adm-p', p); pv.style.setProperty('--adm-a', a);
      $('[data-pv-name]', pv).textContent = fe('clinicName').value || 'Clinic name';
      $('[data-pv-tag]', pv).textContent = fe('tagline').value;
      $('[data-pv-logo]', pv).innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : PP.logoSvg;
      const ca = contrastWhite(a); const cp = contrastWhite(p);
      const warn = [];
      if (ca < 4.5) warn.push(`White text on the action colour has contrast <b>${ca}:1</b>; WCAG AA needs 4.5:1 for button text.`);
      if (cp < 4.5) warn.push(`White text on the primary colour has contrast <b>${cp}:1</b>; menu text may be hard to read.`);
      $('[data-contrast]', panel).innerHTML = warn.length ? PP.ui.alert('warning', warn.join('<br>')) : PP.ui.alert('positive', `Contrast check passed (action ${ca}:1, primary ${cp}:1).`);
    };
    ['primary', 'action'].forEach((n) => {
      const pick = $(`[data-pick="${n}"]`, f); const txt = fe(n);
      pick.addEventListener('input', () => { txt.value = pick.value.toUpperCase(); update(); });
      txt.addEventListener('input', () => { if (isHex(txt.value)) pick.value = txt.value; update(); });
    });
    fe('clinicName').addEventListener('input', update); fe('tagline').addEventListener('input', update);
    $('[data-logo]', f).addEventListener('change', (e) => {
      const file = e.target.files[0]; PP.form.clearErrors(f); if (!file) return;
      if (!/^image\//.test(file.type)) { PP.form.setError(f, 'logo', 'Choose an image file.'); return; }
      if (file.size > 300 * 1024) { PP.form.setError(f, 'logo', `The file is ${Math.round(file.size / 1024)} KB. Use an image up to 300 KB.`); return; }
      const r = new FileReader();
      r.onload = () => { logo = String(r.result); update(); PP.ui.toast('Logo loaded into the preview. Save to apply.', 'info'); };
      r.readAsDataURL(file);
    });
    $('[data-logo-remove]', f).addEventListener('click', () => { logo = ''; update(); });
    $('[data-reset]', f).addEventListener('click', async () => {
      const ok = await PP.ui.confirm({ title: 'Reset to the original palette?', message: 'Primary returns to navy #083E44 and action to teal #008B83. The logo and clinic name stay.', confirmLabel: 'Reset colours' });
      if (!ok) return;
      s.primary = DEFAULT_PRIMARY; s.action = DEFAULT_ACTION;
      PP.audit('Branding reset', 'settings', 'Original palette restored (#083E44 / #008B83)');
      PP.save(); PP.applyBranding(); rebuild(); PP.ui.toast('Original palette restored');
    });
    bindSave(panel, (v, form) => {
      let bad = false;
      ['primary', 'action'].forEach((n) => { if (!isHex(v[n])) { PP.form.setError(form, n, 'Enter a colour as #RRGGBB.'); bad = true; } });
      if (bad) return;
      const before = `${s.primary}/${s.action}`;
      Object.assign(s, { clinicName: v.clinicName, tagline: v.tagline, primary: v.primary.toUpperCase(), action: v.action.toUpperCase() });
      if (logo) s.logoImage = logo; else delete s.logoImage;
      PP.audit('Branding changed', 'settings', `Colours ${before} → ${s.primary}/${s.action}${logo ? ' · logo set' : ' · no logo'}`);
      PP.save(); PP.applyBranding(); rebuild();
      PP.ui.toast('Branding saved and applied across the workspace');
    });
    update();
  };

  SETTINGS.terminology = (panel) => {
    const s = PP.db.settings; const over = s.terminology || {};
    panel.innerHTML = `<div class="grid grid-2 adm-term">
      ${formCard('Terminology', `<div class="form-grid">
        ${PP.form.field({ name: 'businessType', label: 'Business type', type: 'select', placeholder: false, full: true, value: s.businessType, options: Object.entries(PP.businessTypes).map(([k, b]) => [k, b.label]), hint: 'Supplies the default words for the people who treat patients (D-010).' })}
        ${PP.form.field({ name: 'professional', label: 'Override: singular', value: over.professional || '', placeholder: 'Default', hint: 'e.g. Consultant' })}
        ${PP.form.field({ name: 'professionals', label: 'Override: plural', value: over.professionals || '', placeholder: 'Default', hint: 'e.g. Consultants' })}
        <div class="full">${PP.ui.alert('info', 'Words are configuration, never code. A role (what a user may do in the software) is separate from a professional type (D-020).')}</div>
      </div>`, 'Leave the overrides blank to use the business type default.')}
      ${PP.ui.card({ title: 'Live preview', body: `<div class="adm-term-pv" data-tpv></div>` })}
    </div>`;
    const f = $('form.adm-form', panel);
    const words = () => {
      const bt = PP.businessTypes[f.businessType.value] || PP.businessTypes.physiotherapy;
      return { one: f.professional.value.trim() || bt.professional, many: f.professionals.value.trim() || bt.professionals, org: bt.org };
    };
    const draw = () => {
      const w = words(); const cur = { one: PP.t('professional'), many: PP.t('professionals') };
      $('[data-tpv]', panel).innerHTML = `
        <div class="adm-term-menu"><div class="adm-term-mi">${PP.icon('stethoscope')} <b>${esc(w.many)}</b></div><div class="adm-term-sub">${esc(w.one)} Directory</div><div class="adm-term-sub">Availability &amp; Leave</div></div>
        <div class="row mt-3"><span class="btn btn-primary">${PP.icon('plus')} Add ${esc(w.one)}</span><span class="btn">Select a ${esc(w.one.toLowerCase())}</span></div>
        <table class="table mt-3 adm-term-table"><thead><tr><th>Where</th><th>Now</th><th>After saving</th></tr></thead><tbody>
          <tr><td>Menu label</td><td>${esc(cur.many)}</td><td><b>${esc(w.many)}</b></td></tr>
          <tr><td>Add button</td><td>Add ${esc(cur.one)}</td><td><b>Add ${esc(w.one)}</b></td></tr>
          <tr><td>Booking page</td><td>Choose your ${esc(cur.one.toLowerCase())}</td><td><b>Choose your ${esc(w.one.toLowerCase())}</b></td></tr>
        </tbody></table>`;
    };
    $$('input, select', f).forEach((i) => { i.addEventListener('input', draw); i.addEventListener('change', draw); });
    bindSave(panel, (v, form) => {
      if (!!v.professional !== !!v.professionals) { PP.form.setError(form, v.professional ? 'professionals' : 'professional', 'Enter both the singular and the plural, or neither.'); return; }
      s.businessType = v.businessType;
      s.terminology = v.professional ? { professional: v.professional, professionals: v.professionals } : {};
      PP.audit('Terminology changed', 'settings', `${PP.businessTypes[v.businessType].label} · ${PP.t('professional')} / ${PP.t('professionals')}`);
      PP.save(); rebuild();
      PP.ui.toast(`Saved. Menus now say “${esc(PP.t('professionals'))}”.`);
    });
    draw();
  };

  SETTINGS.types = (panel) => {
    const types = PP.db.professionalTypes;
    const used = (id) => PP.db.professionals.filter((p) => p.typeId === id).length;
    panel.innerHTML = PP.ui.card({
      title: `${esc(PP.t('professional'))} types`,
      actions: `<button class="btn btn-sm btn-primary" data-add-type>${PP.icon('plus')} Add custom type</button>`,
      flush: true,
      body: `<div class="card-body adm-stack-sm">${PP.ui.alert('info', 'A type decides what a person may do clinically: be booked, record notes, prescribe. It is <b>not</b> a user role (D-020). Not every type may prescribe medication.')}
        ${PP.ui.alert('warning', '<b>Pending decision PD-007:</b> the default capability matrix, whether one person may hold several types, and whether a clinic may create custom types (or only the vendor super admin) are not decided yet. This prototype lets the clinic admin do it for discussion.')}</div>
        <div class="table-wrap"><table class="table adm-types"><thead><tr><th>Type</th>${CAPS.map(([, l]) => `<th class="center">${esc(l)}</th>`).join('')}<th class="right">In use</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
        ${types.map((t) => `<tr><td><b>${esc(t.name)}</b><span class="sub">${esc(t.id)}${t.custom ? ' · custom' : ''}</span></td>
          ${CAPS.map(([k, l]) => `<td class="center">${sw('', !!t[k], '', `data-cap="${k}" data-type="${esc(t.id)}" aria-label="${esc(t.name)}: ${esc(l)}"`)}</td>`).join('')}
          <td class="right mono">${used(t.id)}</td><td>${PP.ui.badge(t.status || 'Active')}</td>
          <td class="right adm-nowrap"><button class="btn btn-sm btn-ghost" data-edit-type="${esc(t.id)}">${PP.icon('edit')} Edit</button></td></tr>`).join('')}
        </tbody></table></div>`,
    });
    $$('[data-cap]', panel).forEach((cb) => cb.addEventListener('change', () => {
      const t = types.find((x) => x.id === cb.dataset.type); const k = cb.dataset.cap; const label = CAPS.find((c) => c[0] === k)[1];
      t[k] = cb.checked;
      PP.audit('Professional type changed', t.id, `${t.name} · ${label}: ${cb.checked ? 'allowed' : 'not allowed'}`);
      PP.save();
      PP.ui.toast(`${esc(t.name)}: ${esc(label.toLowerCase())} ${cb.checked ? 'allowed' : 'turned off'}.${k === 'canPrescribeMedication' && cb.checked ? ' Check the legal rules for this profession before allowing it.' : ''}`, k === 'canPrescribeMedication' && cb.checked ? 'warning' : 'positive', 4000);
    }));
    const editor = (t) => formModal({
      title: t ? `Edit ${esc(t.name)}` : 'Add custom type',
      body: `${PP.form.field({ name: 'name', label: 'Type name', required: true, value: t ? t.name : '', placeholder: 'e.g. Occupational Therapist', full: true })}
        <div class="field full"><span class="label">Capabilities</span><div class="adm-cap-edit">${CAPS.map(([k, l]) => sw(k, t ? !!t[k] : k === 'canBeBooked' || k === 'canRecordClinical', esc(l))).join('')}</div></div>
        ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: t ? t.status || 'Active' : 'Active', options: ['Active', 'Inactive'], hint: 'Inactive types cannot be chosen for new people.' })}`,
      onSave: (v, f) => {
        if (types.some((x) => x !== t && x.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'A type with this name exists.'); return false; }
        if (t && v.status === 'Inactive' && used(t.id)) { /* allowed: existing people keep the type */ }
        const rec = t || { id: (() => { let id = `PT-${slug(v.name).toUpperCase().slice(0, 12)}`; let n = 2; const base = id; while (types.some((x) => x.id === id)) id = `${base}-${n++}`; return id; })(), custom: true };
        Object.assign(rec, { name: v.name, status: v.status });
        CAPS.forEach(([k]) => { rec[k] = !!v[k]; });
        if (!t) types.push(rec);
        PP.audit(t ? 'Professional type changed' : 'Professional type added', rec.id, `${rec.name} · ${CAPS.filter(([k]) => rec[k]).map(([, l]) => l).join(', ') || 'no capabilities'}`);
        PP.save(); PP.ui.toast(t ? 'Type updated' : `Type “${esc(rec.name)}” added`); SETTINGS.types(panel);
      },
    });
    $('[data-add-type]', panel).addEventListener('click', () => editor(null));
    $$('[data-edit-type]', panel).forEach((b) => b.addEventListener('click', () => editor(types.find((x) => x.id === b.dataset.editType))));
  };

  SETTINGS.documents = (panel) => {
    const s = PP.db.settings;
    panel.innerHTML = `<div class="grid grid-2">
      ${formCard('Prescription & invoice text', `<div class="form-grid">
        ${PP.form.field({ name: 'prescriptionHeader', label: 'Prescription header', type: 'textarea', rows: 2, full: true, value: s.prescriptionHeader, hint: 'Printed under the clinic name on every prescription.' })}
        ${PP.form.field({ name: 'invoiceFooter', label: 'Invoice footer', type: 'textarea', rows: 3, full: true, value: s.invoiceFooter, hint: 'Printed at the bottom of invoices and receipts.' })}
      </div>`)}
      ${PP.ui.card({ title: 'Print preview', body: `<div class="adm-doc">
        <div class="adm-doc-head"><span class="adm-doc-logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="">` : PP.logoSvg}</span><div><b>${esc(s.clinicName)}</b><div class="small" data-pv-rx></div></div></div>
        <div class="adm-doc-lines"><span></span><span></span><span style="width:60%"></span></div>
        <div class="adm-doc-foot small" data-pv-inv></div></div>` })}
    </div>`;
    const f = $('form.adm-form', panel);
    const draw = () => { $('[data-pv-rx]', panel).textContent = f.prescriptionHeader.value; $('[data-pv-inv]', panel).textContent = f.invoiceFooter.value; };
    $$('textarea', f).forEach((t) => t.addEventListener('input', draw)); draw();
    bindSave(panel, (v) => {
      s.prescriptionHeader = v.prescriptionHeader; s.invoiceFooter = v.invoiceFooter;
      PP.audit('Document text changed', 'settings', 'Prescription header / invoice footer');
      PP.save(); PP.ui.toast('Document text saved');
    });
  };

  SETTINGS.security = (panel) => {
    const sec = PP.db.settings.security || (PP.db.settings.security = {});
    const admins = PP.db.users.filter((u) => u.role === 'admin' && u.status === 'Active');
    const noMfa = admins.filter((u) => !u.mfa);
    panel.innerHTML = formCard('Security', `<div class="form-grid">
      <div class="field full">${sw('mfaForAdmins', !!sec.mfaForAdmins, '<b>Require two-step sign-in for admins</b>')}<div class="hint">Admins enter a one-time code after their password (FR-GA-05).</div></div>
      ${PP.form.field({ name: 'sessionMinutes', label: 'Sign out after inactivity', type: 'select', placeholder: false, value: sec.sessionMinutes, options: [15, 30, 60, 120, 240].map((n) => [n, n < 60 ? `${n} minutes` : `${n / 60} hour${n > 60 ? 's' : ''}`]) })}
      ${PP.form.field({ name: 'passwordMinLength', label: 'Minimum password length', type: 'number', min: 8, max: 64, required: true, value: sec.passwordMinLength, rule: 'positive', error: 'Enter a number from 8 to 64.', hint: 'At least 8. We recommend 10 or more.' })}
      <div class="full">${noMfa.length ? PP.ui.alert('warning', `${noMfa.length} active admin${noMfa.length > 1 ? 's have' : ' has'} not set up two-step sign-in: ${noMfa.map((u) => esc(u.name)).join(', ')}.`) : PP.ui.alert('positive', `All ${admins.length} active admin account(s) use two-step sign-in.`)}</div>
    </div>`, 'Security changes are recorded in the audit log.');
    bindSave(panel, (v, f) => {
      const n = Number(v.passwordMinLength);
      if (!Number.isInteger(n) || n < 8 || n > 64) { PP.form.setError(f, 'passwordMinLength', 'Enter a whole number from 8 to 64.'); return; }
      const before = JSON.stringify(sec);
      Object.assign(sec, { mfaForAdmins: !!v.mfaForAdmins, sessionMinutes: Number(v.sessionMinutes), passwordMinLength: n });
      PP.audit('Security settings changed', 'settings', `MFA for admins ${sec.mfaForAdmins ? 'on' : 'off'} · timeout ${sec.sessionMinutes} min · min password ${n}${before === JSON.stringify(sec) ? ' (no change)' : ''}`);
      PP.save(); PP.ui.toast('Security settings saved');
    });
  };

  /** Animated, simulated job with a progress bar. */
  async function simulate(host, steps, ms) {
    host.innerHTML = `<div class="adm-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="adm-bar"><span></span></div><div class="small muted" data-step></div></div>`;
    const bar = $('.adm-bar span', host); const lbl = $('[data-step]', host); const pr = $('.adm-progress', host);
    for (let i = 0; i < steps.length; i++) {
      lbl.textContent = `${steps[i]}…`;
      const pct = Math.round(((i + 1) / steps.length) * 100);
      bar.style.width = `${pct}%`; pr.setAttribute('aria-valuenow', pct);
      await PP.sleep(ms || 420);
    }
    host.innerHTML = '';
  }

  SETTINGS.backups = (panel, ctx) => {
    const b = PP.db.settings.backup || (PP.db.settings.backup = {});
    const T = PP.today();
    const history = (b.history || []).slice();
    // Synthetic nightly history behind the recorded runs (mock rows).
    for (let i = 1; i <= 7; i++) { const d = PP.addDays(T, -i); history.push({ at: `${d}T02:00:00`, type: 'Scheduled', size: `${(412 - i * 1.7).toFixed(1)} MB`, status: i === 4 ? 'Failed' : 'Success', note: i === 4 ? 'Off-site upload timed out; local copy kept. Retried next night.' : '' }); }
    const restoreAge = b.lastRestoreTest ? PP.diffDays(b.lastRestoreTest, T) : null;
    panel.innerHTML = `<div class="grid grid-2 adm-backup">
      ${formCard('Backup schedule', `<div class="form-grid">
        ${PP.form.field({ name: 'schedule', label: 'Schedule', type: 'select', placeholder: false, value: b.schedule, options: ['Daily at 02:00', 'Daily at 23:00', 'Every 12 hours', 'Weekly (Friday 02:00)'] })}
        ${PP.form.field({ name: 'keepDays', label: 'Keep backups for', type: 'select', placeholder: false, value: b.keepDays, options: [7, 14, 30, 60, 90, 365].map((n) => [n, `${n} days`]) })}
        <div class="field full">${sw('offsite', !!b.offsite, '<b>Keep an off-site copy</b>')}<div class="hint">A second encrypted copy on storage you own, away from the main server (FR-GA-08).</div></div>
      </div>`, 'Backups stay on the clinic’s own infrastructure. No patient data goes to the vendor.')}
      ${PP.ui.card({ title: 'Status', body: `${kv([
        ['Last backup', `${PP.fmt.stamp(b.lastRun)} ${PP.ui.badge(b.lastStatus || '—')}`],
        ['Off-site copy', b.offsite ? 'On' : '<span class="adm-warn-num">Off</span>'],
        ['Last restore test', b.lastRestoreTest ? `${PP.fmt.date(b.lastRestoreTest)} <span class="small muted">(${restoreAge} day${restoreAge === 1 ? '' : 's'} ago)</span>` : 'Never'],
        ['Retention', `${esc(b.keepDays)} days`],
      ])}
        ${restoreAge == null || restoreAge > 30 ? `<div class="mt-3">${PP.ui.alert('warning', 'Test a restore at least once a month. A backup that was never restored is not proven.')}</div>` : ''}
        <div class="row mt-4"><button class="btn btn-primary" data-run>${PP.icon('refresh')} Run backup now</button><button class="btn" data-restore>${PP.icon('shield')} Test restore</button><button class="btn" data-dl>${PP.icon('download')} Download backup</button></div>
        <div class="mt-3" data-job></div>` })}
    </div>
    ${PP.ui.card({ title: 'Recent backups', cls: 'mt-4', flush: true, body: '<div data-hist></div>' })}`;
    PP.ui.table($('[data-hist]', panel), {
      rows: history, pageSize: 5, exportName: 'backup-history',
      columns: [
        { key: 'at', label: 'Time', render: (h) => PP.fmt.stamp(h.at) },
        { key: 'type', label: 'Type', render: (h) => esc(h.type) },
        { key: 'size', label: 'Size', align: 'right', render: (h) => esc(h.size) },
        { key: 'status', label: 'Status', render: (h) => PP.ui.badge(h.status), exportValue: (h) => h.status },
        { key: 'note', label: 'Note', render: (h) => `<span class="small">${esc(h.note || '')}</span>` },
      ],
    });
    bindSave(panel, (v) => {
      Object.assign(b, { schedule: v.schedule, keepDays: Number(v.keepDays), offsite: !!v.offsite });
      PP.audit('Backup settings changed', 'settings', `${v.schedule} · keep ${v.keepDays} days · off-site ${v.offsite ? 'on' : 'off'}`);
      PP.save(); PP.ui.toast('Backup schedule saved'); ctx.redraw();
    });
    const job = $('[data-job]', panel);
    const btns = () => $$('[data-run], [data-restore], [data-dl]', panel);
    const lock = (on) => btns().forEach((x) => { x.disabled = on; });
    $('[data-run]', panel).addEventListener('click', async (e) => {
      lock(true); e.currentTarget.classList.add('is-loading');
      await simulate(job, ['Taking a consistent database snapshot', 'Copying uploaded files', 'Compressing and encrypting', b.offsite ? 'Uploading the off-site copy' : 'Writing the local copy', 'Verifying the checksum'], 450);
      b.lastRun = PP.nowStamp(); b.lastStatus = 'Success';
      b.history = [{ at: b.lastRun, type: 'Manual', size: `${(413 + Math.random() * 2).toFixed(1)} MB`, status: 'Success', note: `Run by ${(PP.currentUser() || {}).name || 'admin'}` }, ...(b.history || [])].slice(0, 20);
      PP.audit('Backup run', 'backup', 'Manual backup completed');
      PP.notify('Backup completed', 'Manual backup finished successfully.', '#/settings?tab=backups');
      PP.save(); PP.ui.toast('Backup completed and verified (simulated)'); ctx.redraw();
    });
    $('[data-restore]', panel).addEventListener('click', async (e) => {
      lock(true); e.currentTarget.classList.add('is-loading');
      await simulate(job, ['Fetching the latest backup', 'Restoring into an isolated test copy', 'Checking record counts', 'Removing the test copy'], 500);
      b.lastRestoreTest = PP.today();
      PP.audit('Restore tested', 'backup', `${PP.db.patients.length} patients, ${PP.db.appointments.length} appointments verified`);
      PP.save();
      PP.ui.toast(`Restore test passed: ${PP.db.patients.length} patients and ${PP.db.appointments.length} appointments matched (simulated). Live data was not touched.`, 'positive', 5000);
      ctx.redraw();
    });
    $('[data-dl]', panel).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, () => {
      PP.audit('Backup downloaded', 'backup', 'Simulated download');
      PP.save();
      PP.ui.toast('Backup download prepared (simulated). In production the encrypted file comes from your own server.', 'info', 4500);
    }, 700));
  };

  SETTINGS.licence = (panel) => {
    const s = PP.db.settings; const lic = s.licence || (s.licence = { state: 'Active' });
    const T = PP.today();
    const days = lic.expires ? PP.diffDays(T, lic.expires) : null;
    const usedGb = 38.6; const diskGb = 240; const pct = Math.round((usedGb / diskGb) * 100);
    const explain = {
      Active: 'Everything works normally.',
      Grace: 'Everything still works. Admins see a warning banner and should renew. The grace length is set in the contract.',
      Expired: 'Read-only mode. All records, including medical records, stay viewable, printable and exportable. New clinical and financial entries are paused. Admins can still manage users and export data. Nothing is ever deleted (D-017).',
    };
    panel.innerHTML = `<div class="grid grid-2 adm-lic">
      ${PP.ui.card({ title: 'System status', body: kv([
        ['Licence', PP.ui.badge(lic.state)],
        ['Plan', esc(lic.plan || '—')],
        ['Expires', `${PP.fmt.date(lic.expires)}${days != null ? ` <span class="small muted">(${days >= 0 ? `${days} days left` : `${-days} days ago`})</span>` : ''}`],
        ['App version', `<span class="mono">${esc(PP.version)}</span>`],
        ['Updates', `${PP.ui.badge('Success')} <span class="small">Up to date · signed release verified</span>`],
        ['Last backup', `${PP.fmt.stamp((s.backup || {}).lastRun)} ${PP.ui.badge((s.backup || {}).lastStatus || '—')} <a class="small" href="#/settings?tab=backups" data-goto="backups">Backups</a>`],
        ['Server disk', `<div class="adm-disk"><div class="adm-bar"><span style="width:${pct}%"></span></div><span class="small">${usedGb} GB of ${diskGb} GB used (${pct}%)</span></div>`],
      ]) + `<p class="small muted mt-3">Disk is your own server’s capacity. The platform sets no storage, RAM, CPU or bandwidth quotas; plans limit business usage only.</p>` })}
      ${PP.ui.card({ title: 'Prototype control: simulate licence state', cls: 'adm-proto', body: `
        <p class="small muted" style="margin-top:0">For demonstration only. In production the state comes from the signed licence; no one can switch it here.</p>
        ${PP.ui.segmented('lic', [['Active', 'Active'], ['Grace', 'Grace'], ['Expired', 'Expired']], lic.state)}
        <div class="mt-3">${PP.ui.alert(lic.state === 'Active' ? 'positive' : lic.state === 'Grace' ? 'warning' : 'error', `<b>${esc(lic.state)}:</b> ${esc(explain[lic.state] || '')}`)}</div>
        <ul class="adm-states small mt-3">
          <li><b>Active</b> → expiry or licence server unreachable → <b>Grace</b> → grace ends → <b>Read-only</b> → renewal → <b>Active</b></li>
          <li>Never a destructive lockout. Medical records always stay accessible.</li>
        </ul>` })}
    </div>`;
    PP.ui.bindSegmented(panel, 'lic', (v) => {
      if (v === lic.state) return;
      const before = lic.state; lic.state = v;
      PP.audit('Licence state simulated', 'licence', `${before} → ${v} (prototype control)`);
      PP.save(); rebuild();
      PP.ui.toast(`Licence simulated as ${esc(v)}. ${v === 'Expired' ? 'Records stay viewable and exportable; nothing is deleted.' : v === 'Grace' ? 'A warning banner now shows.' : 'Banner removed.'}`, v === 'Active' ? 'positive' : 'warning', 4500);
    });
  };

  /* -- data import / export (FR-GA-08) */
  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let q = false;
    const t = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  const HEADER_MAP = { name: 'name', 'full name': 'name', 'patient name': 'name', mobile: 'mobile', phone: 'mobile', 'mobile number': 'mobile', gender: 'gender', sex: 'gender', dob: 'dob', 'date of birth': 'dob', birthdate: 'dob', address: 'address', email: 'email' };
  const SAMPLE_CSV = 'name,mobile,gender,dob,address,email\nAnika Tabassum,01711223344,Female,1992-04-18,"Boyra, Khulna",\nRezaul Karim,0181-555-6677,Male,1975-10-02,"Daulatpur, Khulna",rezaul@example.com\nShahana Parvin,01923456789,F,1968-01-25,"Sonadanga, Khulna",\n,01700000000,Male,,Khalishpur,\nMasud Rana,12345,Male,1990-13-40,Rupsha,\nFarhana Yasmin,01612345678,Female,1999-07-07,"Nirala, Khulna",farhana@\n';

  function validateRows(rows) {
    const header = rows[0].map((h) => HEADER_MAP[String(h).trim().toLowerCase()] || null);
    if (!header.includes('name') || !header.includes('mobile')) return { error: 'The first row must be a header with at least “name” and “mobile” columns.' };
    const seen = {};
    const out = rows.slice(1).map((r, i) => {
      const o = { line: i + 2, errors: [], warnings: [] };
      header.forEach((k, j) => { if (k) o[k] = String(r[j] == null ? '' : r[j]).trim(); });
      o.mobile = (o.mobile || '').replace(/[\s-]/g, '');
      const g = (o.gender || '').toLowerCase();
      o.gender = g === 'm' || g === 'male' ? 'Male' : g === 'f' || g === 'female' ? 'Female' : g ? 'Other' : '';
      if (!o.name) o.errors.push('Name is missing');
      if (!o.mobile) o.errors.push('Mobile is missing'); else if (!PP.isMobile(o.mobile)) o.errors.push('Mobile is not a valid Bangladesh number (01XXXXXXXXX)');
      if (o.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(o.dob) || Number.isNaN(PP.parseISO(o.dob).getTime()) || PP.isoOf(PP.parseISO(o.dob)) !== o.dob)) o.errors.push('Date of birth must be YYYY-MM-DD');
      else if (o.dob && o.dob > PP.today()) o.errors.push('Date of birth is in the future');
      if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) o.errors.push('Email is not valid');
      if (o.mobile && PP.isMobile(o.mobile)) {
        const dup = PP.duplicateCandidates(o.mobile, o.name);
        if (dup.length) o.warnings.push(`Possible duplicate of ${dup.slice(0, 2).map((d) => d.id).join(', ')} (mobile numbers are not unique, so the row is still imported)`);
        const key = `${o.name.toLowerCase()}|${o.mobile}`;
        if (seen[key]) o.errors.push(`Same name and mobile as line ${seen[key]}`); else seen[key] = o.line;
      }
      o.valid = !o.errors.length;
      return o;
    });
    return { rows: out };
  }

  SETTINGS.data = (panel) => {
    const counts = [['patients', 'Patients'], ['appointments', 'Appointments'], ['visits', 'Clinical visits'], ['prescriptions', 'Prescriptions'], ['invoices', 'Invoices'], ['payments', 'Payments'], ['audit', 'Audit entries']];
    panel.innerHTML = `<div class="grid grid-2 adm-data">
      ${PP.ui.card({ title: 'Import patients from CSV', body: `
        <p class="small muted" style="margin-top:0">Columns: <code>name</code>, <code>mobile</code> (required), <code>gender</code>, <code>dob</code> (YYYY-MM-DD), <code>address</code>, <code>email</code>. Excel users: “Save as CSV UTF-8”.</p>
        <div class="row"><label class="btn btn-primary">${PP.icon('upload')} Choose CSV file<input type="file" accept=".csv,text/csv" class="sr-only" data-file></label>
          <button class="btn" data-sample>${PP.icon('file')} Load sample rows</button><button class="btn btn-ghost" data-template>${PP.icon('download')} Download template</button></div>
        <div class="small muted mt-2" data-fname>No file chosen.</div>` })}
      ${PP.ui.card({ title: 'Export all data', body: `
        <p class="small muted" style="margin-top:0">Your data belongs to you. Export everything in open formats at any time, including in read-only licence mode (D-017).</p>
        <ul class="adm-counts">${counts.map(([k, l]) => `<li><span>${esc(l)}</span><b class="mono">${PP.fmt.num((PP.db[k] || []).length)}</b></li>`).join('')}</ul>
        <div class="row mt-3"><button class="btn btn-primary" data-export-json>${PP.icon('download')} Export all data (JSON)</button><button class="btn" data-export-patients>${PP.icon('download')} Patients (CSV)</button></div>` })}
    </div>
    <div data-preview class="mt-4"></div>`;
    const pv = $('[data-preview]', panel);
    let parsed = null;
    const show = (text, name) => {
      $('[data-fname]', panel).textContent = name;
      const rows = parseCsv(text);
      if (rows.length < 2) { parsed = null; pv.innerHTML = PP.ui.alert('error', 'The file has no data rows.'); return; }
      const res = validateRows(rows);
      if (res.error) { parsed = null; pv.innerHTML = PP.ui.alert('error', esc(res.error)); return; }
      parsed = res.rows; drawPreview();
    };
    function drawPreview() {
      const ok = parsed.filter((r) => r.valid).length; const bad = parsed.length - ok;
      pv.innerHTML = PP.ui.card({
        title: 'Preview and validation',
        actions: `<span class="small muted">${ok} ready · ${bad} with errors</span><button class="btn btn-sm btn-ghost" data-clear-import>Clear</button><button class="btn btn-sm btn-primary" data-do-import ${ok ? '' : 'disabled'}>${PP.icon('check')} Import ${ok} valid row${ok === 1 ? '' : 's'}</button>`,
        flush: true, body: '<div data-ptable></div>',
      });
      PP.ui.table($('[data-ptable]', pv), {
        rows: parsed, pageSize: 10, exportName: 'import-check',
        filters: [{ id: 'v', label: 'All rows', options: [['ok', 'Valid'], ['bad', 'With errors']], match: (r, v) => (v === 'ok' ? r.valid : !r.valid) }],
        rowAttrs: (r) => (r.valid ? '' : 'data-bad="1"'),
        columns: [
          { key: 'line', label: 'Line', align: 'right', render: (r) => String(r.line) },
          { key: 'name', label: 'Name', render: (r) => esc(r.name || '—') },
          { key: 'mobile', label: 'Mobile', render: (r) => `<span class="mono">${esc(r.mobile || '—')}</span>` },
          { key: 'gender', label: 'Gender', render: (r) => esc(r.gender || '—') },
          { key: 'dob', label: 'Date of birth', render: (r) => esc(r.dob || '—') },
          { key: 'result', label: 'Result', render: (r) => `${PP.ui.badge(r.valid ? 'Verified' : 'Failed', r.valid ? 'positive' : 'error')}${r.errors.map((e) => `<span class="sub adm-err">${esc(e)}</span>`).join('')}${r.warnings.map((w) => `<span class="sub adm-warn">${esc(w)}</span>`).join('')}`, exportValue: (r) => (r.valid ? 'Valid' : r.errors.join('; ')) },
        ],
      });
      $('[data-clear-import]', pv).addEventListener('click', () => { parsed = null; pv.innerHTML = ''; $('[data-fname]', panel).textContent = 'No file chosen.'; });
      $('[data-do-import]', pv).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, () => {
        const branchId = PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : (PP.db.branches[0] || {}).id;
        const ids = parsed.filter((r) => r.valid).map((r) => {
          const p = { id: PP.nextId('PAT'), name: r.name, gender: r.gender || 'Other', dob: r.dob || '', mobile: r.mobile, email: r.email || '', address: r.address || '', emergencyContact: '', assignedProfessionalId: null, branchId, referralSource: 'Import', bloodGroup: '', medicalHistory: '', allergies: '', previousTreatments: '', notes: 'Imported from CSV', registeredAt: PP.today(), familyGroup: null, customFields: {}, status: 'Active' };
          PP.db.patients.push(p); return p.id;
        });
        PP.audit('Patients imported', ids.length ? `${ids[0]}…${ids[ids.length - 1]}` : '', `${ids.length} imported, ${parsed.length - ids.length} skipped`);
        PP.save();
        parsed = null;
        pv.innerHTML = PP.ui.card({ title: 'Import complete', body: `${PP.ui.alert('positive', `<b>${ids.length} patient${ids.length === 1 ? '' : 's'} imported</b> into ${esc(PP.branchName(branchId))}. Rows with errors were skipped.`)}<div class="adm-idlist mt-3">${ids.map((id) => `<a class="badge neutral" href="#/patients/${esc(id)}">${esc(id)}</a>`).join('')}</div>` });
        PP.ui.toast(`${ids.length} patients imported`);
      }, 600));
    }
    $('[data-file]', panel).addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { pv.innerHTML = PP.ui.alert('error', 'Choose a .csv file.'); return; }
      const r = new FileReader(); r.onload = () => show(String(r.result), `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`); r.readAsText(file);
      e.target.value = '';
    });
    $('[data-sample]', panel).addEventListener('click', () => show(SAMPLE_CSV, 'Sample rows (fictional) · includes deliberate errors'));
    $('[data-template]', panel).addEventListener('click', () => { PP.downloadCsv('patient-import-template.csv', [['name', 'mobile', 'gender', 'dob', 'address', 'email'], ['Example Patient', '01700000000', 'Female', '1990-01-31', 'Sonadanga, Khulna', '']]); PP.ui.toast('Template downloaded'); });
    $('[data-export-json]', panel).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, () => {
      PP.audit('Full data export', 'all', 'JSON export of all records');
      PP.save();
      const blob = new Blob([JSON.stringify(PP.db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `physio-point-export-${PP.today()}.json`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      PP.ui.toast('Export downloaded (mock data only)');
    }, 600));
    $('[data-export-patients]', panel).addEventListener('click', () => {
      const ps = PP.db.patients.filter((p) => !p.mergedInto);
      PP.downloadCsv(`patients-${PP.today()}.csv`, [['id', 'name', 'gender', 'dob', 'mobile', 'email', 'address', 'branch', 'status'], ...ps.map((p) => [p.id, p.name, p.gender, p.dob, p.mobile, p.email, p.address, PP.branchName(p.branchId), p.status])]);
      PP.audit('Patients exported', 'patients', `${ps.length} rows CSV`); PP.save();
      PP.ui.toast(`Exported ${ps.length} patients`);
    });
  };

  PP.route('/settings', {
    title: 'Clinic Settings',
    perm: 'settings.manage',
    render({ el, query }) {
      let tab = SET_TABS.some((t) => t[0] === query.tab) ? query.tab : 'profile';
      el.innerHTML = PP.ui.pageHead({
        title: 'Clinic &amp; System Settings',
        subtitle: 'Profile, branches, white-label branding, terminology, documents, security, backups and licence status.',
        crumbs: [['Settings'], ['Clinic settings']],
        actions: `${PP.can('users.manage') ? `<a class="btn" href="#/settings/users">${PP.icon('users')} Users &amp; roles</a>` : ''}<a class="btn" href="#/settings/notifications">${PP.icon('bell')} Notifications</a>`,
      }) + '<div class="card adm-tabcard"><div data-tabs class="adm-tabs-pad"></div></div><div data-panel class="mt-4 adm-panel"></div>';
      const panel = $('[data-panel]', el);
      const draw = () => { panel.innerHTML = ''; SETTINGS[tab](panel, { redraw: draw }); };
      PP.ui.tabs($('[data-tabs]', el), { tabs: SET_TABS.map(([id, label]) => ({ id, label: id === 'types' ? `${PP.t('professional')} types` : label })), active: tab, onChange: (id) => { tab = id; setQuery('/settings', { tab: id }); draw(); } });
      panel.addEventListener('click', (e) => {
        const g = e.target.closest('[data-goto]');
        if (g) { e.preventDefault(); tab = g.dataset.goto; setQuery('/settings', { tab }); PP.render(); }
      });
      draw();
    },
  });

  /* ========================================================= users & roles */
  const PERM_GROUPS = { dashboard: 'Dashboard', appointments: 'Appointments', requests: 'Online requests', patients: 'Patients', clinical: 'Clinical', prescriptions: 'Prescriptions', templates: 'Templates', billing: 'Billing', finance: 'Finance', commissions: 'Commission', services: 'Services', professionals: null, users: 'Users', settings: 'Settings', reports: 'Reports', audit: 'Audit' };
  const isAdminRole = (r) => r && r.permissions.includes('*');
  const activeAdmins = () => PP.db.users.filter((u) => u.status === 'Active' && isAdminRole(PP.db.roles.find((r) => r.id === u.role)));

  function userModal(u, done) {
    const me = PP.currentUser();
    const self = u && me && u.id === me.id;
    const rec = u || { name: '', email: '', mobile: '', role: '', branchIds: PP.activeBranchId() !== 'ALL' ? [PP.activeBranchId()] : [], mfa: false, professionalId: null };
    const pros = PP.db.professionals.filter((p) => !p.userId || (u && p.userId === u.id));
    formModal({
      title: u ? `Edit ${esc(u.name)}` : 'Invite user', size: 'lg', saveLabel: u ? 'Save user' : `${PP.icon('send')} Send invitation`,
      body: `
        ${PP.form.field({ name: 'name', label: 'Full name', required: true, value: rec.name })}
        ${PP.form.field({ name: 'email', label: 'Email (sign-in)', type: 'email', rule: 'email', required: true, value: rec.email })}
        ${PP.form.field({ name: 'mobile', label: 'Mobile', type: 'tel', rule: 'mobile', value: rec.mobile, hint: 'Used for sign-in codes.' })}
        ${PP.form.field({ name: 'role', label: 'Role', type: 'select', required: true, value: rec.role, options: PP.db.roles.map((r) => [r.id, r.name]), disabled: self, hint: self ? 'You cannot change your own role.' : 'What this person may do in the software.' })}
        <div class="field full" data-field="branches"><span class="label">Branch access<span class="req">*</span></span>
          <div class="row">${PP.db.branches.map((b) => `<label class="check"><input type="checkbox" name="br_${esc(b.id)}" ${rec.branchIds.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}</div>
          <div class="hint">Users see only data from these branches. Admins see all.</div><div class="error" role="alert">Select at least one branch.</div></div>
        ${PP.form.field({ name: 'professionalId', label: `Linked ${PP.tl('professional')} record`, type: 'select', placeholder: 'None', value: rec.professionalId || '', options: pros.map((p) => [p.id, `${PP.proName(p)} · ${typeName(p.typeId)}`]), hint: `Links this login to a ${PP.tl('professional')} for “my schedule” and own commission.` })}
        <div class="field">${sw('mfa', !!rec.mfa, '<b>Two-step sign-in</b>')}<div class="hint">${PP.db.settings.security && PP.db.settings.security.mfaForAdmins ? 'Required for admins by the security policy.' : 'Optional.'}</div></div>
        <div class="full">${PP.ui.alert('info', `A role is not a ${esc(PP.tl('professional'))} type (D-020). The role controls screens and actions; the ${esc(PP.tl('professional'))} type controls clinical rights such as prescribing.`)}</div>`,
      onSave: (v, f) => {
        const branchIds = PP.db.branches.filter((b) => v[`br_${b.id}`]).map((b) => b.id);
        const role = self ? rec.role : v.role;
        const roleObj = PP.db.roles.find((r) => r.id === role);
        let bad = false;
        if (!branchIds.length && !isAdminRole(roleObj)) { PP.form.setError(f, 'branches', 'Select at least one branch.'); bad = true; }
        if (PP.db.users.some((x) => x !== u && x.email.toLowerCase() === v.email.toLowerCase())) { PP.form.setError(f, 'email', 'Another user already uses this email.'); bad = true; }
        if (u && isAdminRole(PP.db.roles.find((r) => r.id === u.role)) && !isAdminRole(roleObj) && u.status === 'Active' && activeAdmins().length <= 1) { PP.form.setError(f, 'role', 'This is the last active admin. Make someone else admin first.'); bad = true; }
        const mfaRequired = PP.db.settings.security && PP.db.settings.security.mfaForAdmins && isAdminRole(roleObj);
        if (bad) return false;
        const target = u || { id: PP.nextId('USR', 1), status: 'Invited', lastLogin: null, invitedAt: PP.nowStamp() };
        const prevRole = u ? u.role : null; const prevPro = u ? u.professionalId : null;
        Object.assign(target, { name: v.name, email: v.email, mobile: v.mobile, role, branchIds: isAdminRole(roleObj) && !branchIds.length ? PP.db.branches.map((b) => b.id) : branchIds, mfa: !!v.mfa || !!mfaRequired, professionalId: v.professionalId || null });
        if (!u) PP.db.users.push(target);
        if (prevPro && prevPro !== target.professionalId) { const p = PP.find.professional(prevPro); if (p && p.userId === target.id) p.userId = null; }
        if (target.professionalId) { const p = PP.find.professional(target.professionalId); if (p) p.userId = target.id; }
        if (!u) PP.audit('User invited', target.id, `${target.name} · ${roleName(role)}`);
        else {
          PP.audit('User updated', target.id, `${target.name}`);
          if (prevRole !== role) PP.audit('Role changed', target.id, `${target.name}: ${roleName(prevRole)} → ${roleName(role)}`);
        }
        PP.save();
        PP.ui.toast(u ? 'User saved' : `Invitation sent to ${esc(target.email)} (simulated; no email is sent).${mfaRequired && !v.mfa ? ' Two-step sign-in is required for admins.' : ''}`);
        done();
      },
    });
  }

  PP.route('/settings/users', {
    title: 'Users & Roles',
    perm: 'users.manage',
    render({ el, query }) {
      let tab = query.tab === 'roles' ? 'roles' : 'users';
      el.innerHTML = PP.ui.pageHead({
        title: 'Users &amp; Roles',
        subtitle: 'Who can sign in, what they may do and which branches they see.',
        crumbs: [['Settings', '#/settings'], ['Users & roles']],
        actions: `<button class="btn" data-add-role>${PP.icon('shield')} Add custom role</button><button class="btn btn-primary" data-invite>${PP.icon('userPlus')} Invite user</button>`,
      }) + `${PP.ui.alert('info', `<b>A role is not a ${esc(PP.tl('professional'))} type (D-020).</b> Roles control screens and actions in the software. ${esc(PP.t('professional'))} types (<a href="#/settings?tab=types">manage</a>) control clinical rights such as who may prescribe. Permissions are enforced on the server in production, not only by hiding menus.`)}
        <section class="card mt-4"><div data-tabs class="adm-tabs-pad"></div><div data-pane></div></section>`;
      const pane = $('[data-pane]', el);
      const drawTabs = () => PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'users', label: 'Users', count: PP.db.users.length }, { id: 'roles', label: 'Roles & permissions', count: PP.db.roles.length }], active: tab, onChange: (id) => { tab = id; setQuery('/settings/users', id === 'roles' ? { tab: 'roles' } : null); draw(); } });
      const draw = () => { drawTabs(); if (tab === 'users') drawUsers(); else drawRoles(); };
      $('[data-invite]', el).addEventListener('click', () => userModal(null, () => { tab = 'users'; draw(); }));
      $('[data-add-role]', el).addEventListener('click', () => addRoleModal());

      function drawUsers() {
        const me = PP.currentUser();
        PP.ui.table(pane, {
          getRows: () => PP.db.users, exportName: 'users', sortKey: 'name',
          search: { placeholder: 'Search name, email or mobile…', text: (u) => `${u.name} ${u.email} ${u.mobile}` },
          filters: [
            { id: 'role', label: 'All roles', options: PP.db.roles.map((r) => [r.id, r.name]), match: (u, v) => u.role === v },
            { id: 'status', label: 'Any status', options: [['Active', 'Active'], ['Invited', 'Invited'], ['Disabled', 'Disabled']], match: (u, v) => u.status === v },
          ],
          columns: [
            { key: 'name', label: 'Name', sort: (u) => u.name, render: (u) => `<div class="row adm-nowrap"><span class="avatar">${esc(PP.initials(u.name))}</span><div><b>${esc(u.name)}</b>${me && u.id === me.id ? ' <span class="badge info">You</span>' : ''}<span class="sub">${esc(u.mobile || '')}${u.professionalId ? ` · ${esc(PP.proShort(u.professionalId))}` : ''}</span></div></div>`, exportValue: (u) => u.name },
            { key: 'email', label: 'Email', sort: (u) => u.email, render: (u) => esc(u.email) },
            { key: 'role', label: 'Role', sort: (u) => roleName(u.role), render: (u) => esc(roleName(u.role)) },
            { key: 'branches', label: 'Branches', render: (u) => (u.branchIds || []).map((b) => esc(PP.branchName(b))).join(', ') || '—' },
            { key: 'mfa', label: 'Two-step', render: (u) => (u.mfa ? PP.ui.badge('Enabled') : '<span class="muted small">Off</span>'), exportValue: (u) => (u.mfa ? 'Yes' : 'No') },
            { key: 'status', label: 'Status', sort: (u) => u.status, render: (u) => PP.ui.badge(u.status, u.status === 'Invited' ? 'info' : undefined), exportValue: (u) => u.status },
            { key: 'last', label: 'Last sign-in', sort: (u) => u.lastLogin || '', render: (u) => (u.lastLogin ? PP.fmt.stamp(u.lastLogin) : '<span class="muted small">Never</span>'), exportValue: (u) => u.lastLogin || '' },
            { key: 'x', label: '', render: (u) => {
              const self = me && u.id === me.id;
              return `<div class="row-actions">
                <button class="btn btn-sm btn-ghost" data-uedit="${esc(u.id)}" title="Edit">${PP.icon('edit')}<span class="sr-only">Edit</span></button>
                ${u.status === 'Invited' ? `<button class="btn btn-sm btn-ghost" data-uaccept="${esc(u.id)}" title="Simulate: invitation accepted">${PP.icon('check')}<span class="sr-only">Mark accepted</span></button>` : `<button class="btn btn-sm btn-ghost" data-ureset="${esc(u.id)}" title="Send password reset" ${u.status === 'Disabled' ? 'disabled' : ''}>${PP.icon('lock')}<span class="sr-only">Reset password</span></button>`}
                ${u.status === 'Disabled' ? `<button class="btn btn-sm" data-uenable="${esc(u.id)}">Enable</button>` : `<button class="btn btn-sm btn-danger" data-udisable="${esc(u.id)}" ${self ? 'disabled title="You cannot disable your own account"' : ''}>Disable</button>`}
              </div>`;
            }, exportValue: () => '' },
          ],
          afterDraw: (c) => {
            const find = (id) => PP.find.user(id);
            $$('[data-uedit]', c).forEach((b) => b.addEventListener('click', () => userModal(find(b.dataset.uedit), () => { if (me && b.dataset.uedit === me.id) rebuild(); else draw(); })));
            $$('[data-ureset]', c).forEach((b) => b.addEventListener('click', () => PP.ui.busy(b, () => { const u = find(b.dataset.ureset); PP.audit('Password reset sent', u.id, u.email); PP.save(); PP.ui.toast(`Password reset link sent to ${esc(u.email)} (simulated)`); })));
            $$('[data-uaccept]', c).forEach((b) => b.addEventListener('click', () => { const u = find(b.dataset.uaccept); u.status = 'Active'; PP.audit('Invitation accepted', u.id, `${u.name} (simulated)`); PP.save(); PP.ui.toast(`${esc(u.name)} accepted the invitation (simulated)`); draw(); }));
            $$('[data-uenable]', c).forEach((b) => b.addEventListener('click', async () => {
              const u = find(b.dataset.uenable);
              const ok = await PP.ui.confirm({ title: `Enable ${esc(u.name)}?`, message: 'They will be able to sign in again with their existing role and branches.', confirmLabel: 'Enable' });
              if (!ok) return;
              u.status = 'Active'; PP.audit('User enabled', u.id, u.name); PP.save(); PP.ui.toast(`${esc(u.name)} enabled`); rebuild();
            }));
            $$('[data-udisable]', c).forEach((b) => b.addEventListener('click', async () => {
              const u = find(b.dataset.udisable);
              if (me && u.id === me.id) { PP.ui.toast('You cannot disable your own account.', 'error'); return; }
              if (isAdminRole(PP.db.roles.find((r) => r.id === u.role)) && u.status === 'Active' && activeAdmins().length <= 1) { PP.ui.toast('This is the last active admin. Make someone else admin first.', 'error'); return; }
              const res = await PP.ui.confirm({ title: `Disable ${esc(u.name)}?`, message: 'They are signed out and cannot sign in. Their records and audit history stay.', confirmLabel: 'Disable user', danger: true, reasonLabel: 'Reason (recorded in the audit log)' });
              if (!res) return;
              u.status = 'Disabled';
              PP.audit('User disabled', u.id, `${u.name}${res.reason ? ` · ${res.reason}` : ''}`);
              PP.save(); PP.ui.toast(`${esc(u.name)} disabled`); rebuild();
            }));
          },
          empty: { icon: 'users', title: 'No users yet' },
        });
      }

      function drawRoles() {
        const roles = PP.db.roles;
        const me = PP.currentUser();
        const groups = {};
        PP.PERMISSIONS.forEach(([code, label]) => { const g = code.split('.')[0]; (groups[g] = groups[g] || []).push([code, label]); });
        const count = (r) => PP.db.users.filter((u) => u.role === r.id).length;
        pane.innerHTML = `<div class="card-body small muted adm-roles-note">Tick a box to grant a permission. Changes save immediately and are audited. The admin role always has every permission and is locked.</div>
          <div class="table-wrap adm-matrix-wrap"><table class="table adm-matrix"><thead><tr><th scope="col" class="adm-mx-first">Permission</th>
          ${roles.map((r) => `<th scope="col" class="center adm-rolecol"><div>${esc(r.name)}</div><span class="adm-rc-sub">${count(r)} user${count(r) === 1 ? '' : 's'}</span>
            ${isAdminRole(r) ? `<span class="adm-lock" title="Locked">${PP.icon('lock')} Locked</span>` : r.system ? '<span class="adm-rc-sub">Built-in</span>' : `<button class="btn btn-sm btn-ghost" data-del-role="${esc(r.id)}" title="Delete role">${PP.icon('trash')}<span class="sr-only">Delete ${esc(r.name)}</span></button>`}</th>`).join('')}
          </tr></thead><tbody>
          ${Object.entries(groups).map(([g, perms]) => `<tr class="adm-mx-group"><td class="adm-mx-first" colspan="${roles.length + 1}">${esc(PERM_GROUPS[g] || (g === 'professionals' ? PP.t('professionals') : g))}</td></tr>
            ${perms.map(([code, label]) => `<tr><td class="adm-mx-first"><b>${esc(label)}</b><span class="sub mono">${esc(code)}</span></td>
              ${roles.map((r) => { const locked = isAdminRole(r); const on = locked || r.permissions.includes(code); return `<td class="center"><input type="checkbox" class="adm-cb" data-role="${esc(r.id)}" data-perm="${esc(code)}" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="${esc(r.name)}: ${esc(label)}"></td>`; }).join('')}</tr>`).join('')}`).join('')}
          </tbody></table></div>`;
        $$('[data-perm]', pane).forEach((cb) => cb.addEventListener('change', () => {
          const r = roles.find((x) => x.id === cb.dataset.role); const code = cb.dataset.perm;
          const label = (PP.PERMISSIONS.find((p) => p[0] === code) || [code, code])[1];
          if (isAdminRole(r)) { cb.checked = true; return; }
          if (!cb.checked && me && me.role === r.id && code === 'users.manage') { cb.checked = true; PP.ui.toast('You cannot remove your own access to Users & roles.', 'error'); return; }
          if (cb.checked) { if (!r.permissions.includes(code)) r.permissions.push(code); } else r.permissions = r.permissions.filter((p) => p !== code);
          PP.audit(cb.checked ? 'Permission granted' : 'Permission revoked', r.id, `${r.name} · ${label} (${code})`);
          PP.save();
          PP.ui.toast(`${esc(r.name)}: ${cb.checked ? 'can now' : 'can no longer'} ${esc(label.toLowerCase())}`, cb.checked ? 'positive' : 'info');
          if (me && me.role === r.id) rebuild();
        }));
        $$('[data-del-role]', pane).forEach((b) => b.addEventListener('click', async () => {
          const r = roles.find((x) => x.id === b.dataset.delRole);
          if (count(r)) { PP.ui.toast(`${esc(r.name)} is assigned to ${count(r)} user(s). Move them to another role first.`, 'error'); return; }
          const ok = await PP.ui.confirm({ title: `Delete role ${esc(r.name)}?`, message: 'The role and its permission set are removed. No user has this role.', confirmLabel: 'Delete role', danger: true });
          if (!ok) return;
          PP.db.roles = PP.db.roles.filter((x) => x !== r);
          PP.audit('Role deleted', r.id, r.name); PP.save(); PP.ui.toast('Role deleted'); draw();
        }));
      }

      function addRoleModal() {
        formModal({
          title: 'Add custom role', saveLabel: 'Create role',
          body: `${PP.form.field({ name: 'name', label: 'Role name', required: true, placeholder: 'e.g. Branch Manager', full: true })}
            ${PP.form.field({ name: 'copyFrom', label: 'Start with permissions from', type: 'select', placeholder: 'No permissions', options: PP.db.roles.filter((r) => !isAdminRole(r)).map((r) => [r.id, r.name]), full: true, hint: 'You can adjust every permission afterwards in the matrix.' })}`,
          onSave: (v, f) => {
            if (PP.db.roles.some((r) => r.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'A role with this name exists.'); return false; }
            let id = `role-${slug(v.name)}`; let n = 2; const base = id;
            while (PP.db.roles.some((r) => r.id === id)) id = `${base}-${n++}`;
            const src = PP.db.roles.find((r) => r.id === v.copyFrom);
            PP.db.roles.push({ id, name: v.name, system: false, permissions: src ? src.permissions.slice() : [] });
            PP.audit('Role created', id, `${v.name}${src ? ` · copied from ${src.name}` : ''}`);
            PP.save(); PP.ui.toast(`Role “${esc(v.name)}” created. Set its permissions in the matrix.`);
            tab = 'roles'; setQuery('/settings/users', { tab: 'roles' }); draw();
          },
        });
      }
      draw();
    },
  });

  /* ========================================================= notifications */
  const PROVIDERS = {
    sms: ['SSL Wireless (candidate)', 'BulkSMSBD (candidate)', 'Reve Systems (candidate)', 'Alpha Net (candidate)', 'Custom HTTP'],
    whatsapp: ['WhatsApp Cloud API', 'Custom HTTP'],
    email: ['Not selected', 'SMTP (customer mail server)', 'Custom HTTP'],
    inapp: ['Built-in'],
  };
  const CH_ICON = { sms: 'phone', whatsapp: 'send', email: 'mail', inapp: 'bell' };
  const EVENTS = ['appointment.confirmed', 'appointment.reminder', 'appointment.cancelled', 'appointment.rescheduled', 'request.received', 'payment.completed', 'payment.due', 'prescription.issued', 'owner.daily_summary'];
  const VARS = ['patient', 'professional', 'date', 'time', 'ref', 'clinic', 'branch', 'phone', 'amount', 'invoice', 'appointments', 'collected', 'dues'];
  const sessionLog = []; // test sends made in this page session (mock)
  const sampleVals = () => {
    const pro = PP.db.professionals[0];
    return { patient: 'Nusrat Jahan', professional: pro ? PP.proName(pro) : 'Your clinician', date: PP.fmt.date(PP.addDays(PP.today(), 1)), time: '10:30 AM', ref: 'APT-000123', clinic: PP.db.settings.clinicName, branch: (PP.db.branches[0] || {}).name || '', phone: PP.db.settings.phone, amount: PP.fmt.money(1200), invoice: 'INV-000231', appointments: '24', collected: PP.fmt.money(28400), dues: PP.fmt.money(3200) };
  };
  const fill = (text, vals) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null ? vals[k] : m));
  const smsInfo = (text) => {
    const uni = /[^\x00-\x7F]/.test(text); const len = text.length;
    const single = uni ? 70 : 160; const multi = uni ? 67 : 153;
    const parts = len <= single ? 1 : Math.ceil(len / multi);
    return `${len} characters · ${parts} SMS part${parts > 1 ? 's' : ''}${uni ? ' (Unicode, e.g. Bangla)' : ''}`;
  };

  function mockDeliveryLog() {
    const R = PP.rng(4242); const T = PP.today();
    const appts = PP.db.appointments.filter((a) => a.date >= PP.addDays(T, -3) && a.date <= PP.addDays(T, 1) && ['Confirmed', 'Completed', 'Scheduled'].includes(a.status)).slice(0, 36);
    const rows = appts.map((a, i) => {
      const p = PP.find.patient(a.patientId) || {};
      const ev = a.status === 'Completed' ? 'payment.completed' : i % 3 ? 'appointment.confirmed' : 'appointment.reminder';
      const ch = i % 7 === 0 ? 'In-app' : 'SMS';
      const roll = R.next();
      return { id: `DLV-${String(900 + i)}`, at: `${PP.addDays(a.date, ev === 'appointment.reminder' ? -1 : 0)}T${String(8 + (i % 10)).padStart(2, '0')}:${String(R.int(0, 59)).padStart(2, '0')}:00`, channel: ch, to: ch === 'In-app' ? 'Front desk' : maskMobile(p.mobile), patientId: a.patientId, event: ev, provider: ch === 'In-app' ? 'Built-in' : roll < 0.1 ? 'BulkSMSBD (fallback)' : 'SSL Wireless', status: ch === 'In-app' ? 'Delivered' : roll < 0.06 ? 'Failed' : roll < 0.15 ? 'Sent' : 'Delivered', note: roll < 0.06 ? 'Number unreachable; fallback also failed' : roll < 0.1 ? 'Primary timeout; sent via fallback' : '' };
    });
    return sessionLog.concat(rows.sort((a, b) => b.at.localeCompare(a.at)));
  }

  PP.route('/settings/notifications', {
    title: 'Notifications',
    perm: 'settings.manage',
    render({ el, query }) {
      const TABS = [['channels', 'Channels'], ['templates', 'Message templates'], ['consent', 'Consent'], ['log', 'Delivery log']];
      let tab = TABS.some((t) => t[0] === query.tab) ? query.tab : 'channels';
      el.innerHTML = PP.ui.pageHead({
        title: 'Notification Settings',
        subtitle: 'Channels, providers, message templates, patient consent and delivery history.',
        crumbs: [['Settings', '#/settings'], ['Notifications']],
      }) + `${PP.ui.alert('warning', '<b>Prototype: no real messages are sent.</b> Providers are candidates only and are not connected. Business modules talk only to the notification engine; no SMS, WhatsApp or email provider is hard-coded.')}
        <section class="card mt-4"><div data-tabs class="adm-tabs-pad"></div><div data-pane></div></section>`;
      const pane = $('[data-pane]', el);
      PP.ui.tabs($('[data-tabs]', el), { tabs: TABS.map(([id, label]) => ({ id, label })), active: tab, onChange: (id) => { tab = id; setQuery('/settings/notifications', { tab: id }); draw(); } });
      const draw = () => ({ channels: drawChannels, templates: drawTemplates, consent: drawConsent, log: drawLog })[tab]();

      function drawChannels() {
        const chans = PP.db.notificationChannels;
        const opts = (c, cur, withNone) => { const list = (PROVIDERS[c.id] || []).slice(); if (cur && cur !== '—' && !list.includes(cur)) list.unshift(cur); return (withNone ? ['—'] : []).concat(list).map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join(''); };
        pane.innerHTML = `<div class="card-body"><div class="adm-chan-grid">${chans.map((c) => {
          const connected = c.id === 'inapp';
          return `<div class="adm-chan ${c.enabled ? '' : 'off'}" data-ch="${esc(c.id)}">
            <div class="row between"><div class="row adm-nowrap"><span class="adm-chan-ic">${PP.icon(CH_ICON[c.id] || 'bell')}</span><b>${esc(c.name)}</b></div>${sw('', c.enabled, '', `data-ch-enable aria-label="Enable ${esc(c.name)}"`)}</div>
            <div class="field mt-3"><label>Primary provider</label><select class="select" data-ch-primary ${connected ? 'disabled' : ''}>${opts(c, c.primary, false)}</select></div>
            <div class="field mt-3"><label>Fallback provider</label><select class="select" data-ch-fallback ${connected ? 'disabled' : ''}>${opts(c, c.fallback, true)}</select></div>
            <div class="row between mt-3">${connected ? PP.ui.badge('Active') : PP.ui.badge('Not connected — prototype', 'warning')}<button class="btn btn-sm" data-ch-test ${c.enabled ? '' : 'disabled'}>${PP.icon('send')} Send test</button></div>
          </div>`;
        }).join('')}</div>
        <p class="small muted mt-4">Bangladesh SMS gateways listed are candidates under evaluation. Credentials are entered on the server, never in the browser, and never appear in logs.</p></div>`;
        $$('[data-ch]', pane).forEach((card) => {
          const c = chans.find((x) => x.id === card.dataset.ch);
          $('[data-ch-enable]', card).addEventListener('change', (e) => { c.enabled = e.target.checked; PP.audit('Notification channel changed', c.id, `${c.name} ${c.enabled ? 'enabled' : 'disabled'}`); PP.save(); PP.ui.toast(`${esc(c.name)} ${c.enabled ? 'enabled' : 'disabled'}`); drawChannels(); });
          const pr = $('[data-ch-primary]', card); const fb = $('[data-ch-fallback]', card);
          const onProv = (which, sel) => {
            const val = sel.value;
            if (val !== '—' && val === (which === 'primary' ? c.fallback : c.primary)) { PP.ui.toast('Primary and fallback must be different providers.', 'error'); sel.value = c[which]; return; }
            c[which] = val; PP.audit('Notification channel changed', c.id, `${c.name} ${which}: ${val}`); PP.save(); PP.ui.toast(`${esc(c.name)} ${which} provider set to ${esc(val)}`);
          };
          pr.addEventListener('change', () => onProv('primary', pr)); fb.addEventListener('change', () => onProv('fallback', fb));
          $('[data-ch-test]', card).addEventListener('click', () => {
            const isMail = c.id === 'email'; const isApp = c.id === 'inapp';
            formModal({
              title: `Send test · ${esc(c.name)}`, saveLabel: `${PP.icon('send')} Send test`,
              body: `${isApp ? '<div class="full small muted">A test notification appears in your bell menu.</div>' : PP.form.field({ name: 'to', label: isMail ? 'Email address' : 'Mobile number', type: isMail ? 'email' : 'tel', rule: isMail ? 'email' : 'mobile', required: true, full: true, placeholder: isMail ? 'you@clinic.example' : '01XXXXXXXXX' })}
                ${PP.form.field({ name: 'text', label: 'Message', type: 'textarea', rows: 3, full: true, value: `Test message from ${PP.db.settings.clinicName}. Prototype: nothing is really sent.` })}`,
              onSave: (v) => {
                const row = { id: `DLV-T${sessionLog.length + 1}`, at: PP.nowStamp(), channel: c.name, to: isApp ? 'You' : isMail ? v.to : maskMobile(v.to), patientId: null, event: 'test', provider: c.primary, status: isApp ? 'Delivered' : 'Simulated', note: 'Test send · not delivered (prototype)' };
                sessionLog.unshift(row);
                if (isApp) PP.notify('Test notification', v.text, '#/settings/notifications');
                PP.audit('Test notification', c.id, `${c.name} → ${row.to}`); PP.save();
                PP.ui.toast(`Test ${isApp ? 'notification added to your bell' : `queued via ${esc(c.primary)}`}. Simulated: no message left this browser.`, 'info', 4200);
              },
            });
          });
        });
      }

      function drawTemplates() {
        PP.ui.table(pane, {
          getRows: () => PP.db.messageTemplates, exportName: 'message-templates',
          search: { placeholder: 'Search event or text…', text: (t) => `${t.event} ${t.text}` },
          filters: [{ id: 'ch', label: 'All channels', options: [['SMS', 'SMS'], ['WhatsApp', 'WhatsApp'], ['Email', 'Email'], ['In-app', 'In-app']], match: (t, v) => t.channel === v }],
          tools: `<button class="btn btn-primary" data-add-tpl>${PP.icon('plus')} New template</button>`,
          columns: [
            { key: 'event', label: 'Event', sort: (t) => t.event, render: (t) => `<b class="mono">${esc(t.event)}</b><span class="sub">${esc(t.id)}</span>` },
            { key: 'channel', label: 'Channel', render: (t) => esc(t.channel) },
            { key: 'language', label: 'Language', render: (t) => esc(t.language) },
            { key: 'text', label: 'Message', render: (t) => `<span class="adm-clamp">${esc(t.text)}</span>`, exportValue: (t) => t.text },
            { key: 'status', label: 'Status', render: (t) => PP.ui.badge(t.status), exportValue: (t) => t.status },
            { key: 'x', label: '', render: (t) => `<button class="btn btn-sm" data-edit-tpl="${esc(t.id)}">${PP.icon('edit')} Edit</button>`, exportValue: () => '' },
          ],
          afterDraw: (c) => $$('[data-edit-tpl]', c).forEach((b) => b.addEventListener('click', () => tplModal(PP.db.messageTemplates.find((x) => x.id === b.dataset.editTpl)))),
          empty: { icon: 'mail', title: 'No templates yet' },
        });
        $('[data-add-tpl]', pane).addEventListener('click', () => tplModal(null));
      }

      function tplModal(t) {
        const rec = t || { event: '', channel: 'SMS', language: 'English', text: '', status: 'Draft' };
        formModal({
          title: t ? `Edit template · ${esc(t.event)}` : 'New message template', size: 'lg', saveLabel: 'Save template',
          body: `
            ${PP.form.field({ name: 'event', label: 'Event', type: 'select', required: true, value: rec.event, options: EVENTS, disabled: !!t, hint: t ? 'The event cannot change; create a new template instead.' : 'When the notification engine sends this message.' })}
            ${PP.form.field({ name: 'channel', label: 'Channel', type: 'select', placeholder: false, value: rec.channel, options: ['SMS', 'WhatsApp', 'Email', 'In-app'] })}
            ${PP.form.field({ name: 'language', label: 'Language', type: 'select', placeholder: false, value: rec.language, options: ['English', 'Bangla'] })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: rec.status, options: ['Active', 'Draft'] })}
            <div class="field full"><span class="label">Insert a variable</span><div class="adm-chips">${VARS.map((v) => `<button type="button" class="adm-chip" data-var="${v}">{${v}}</button>`).join('')}</div></div>
            ${PP.form.field({ name: 'text', label: 'Message text', type: 'textarea', rows: 4, required: true, full: true, value: rec.text })}
            <div class="full adm-tpl-pv"><div class="label">Preview with sample values</div><div class="adm-bubble" data-tpv></div><div class="small muted mt-2" data-tinfo></div></div>`,
          onOpen: (body) => {
            const ta = $('textarea[name=text]', body);
            const upd = () => {
              const txt = ta.value; const unknown = (txt.match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).filter((k) => !VARS.includes(k));
              $('[data-tpv]', body).textContent = fill(txt, sampleVals()) || '…';
              $('[data-tinfo]', body).innerHTML = `${esc(smsInfo(fill(txt, sampleVals())))}${unknown.length ? ` · <span class="adm-err">Unknown variable: ${unknown.map((u) => `{${esc(u)}}`).join(', ')}</span>` : ''}`;
            };
            $$('[data-var]', body).forEach((b) => b.addEventListener('click', () => {
              const tok = `{${b.dataset.var}}`; const s = ta.selectionStart; const e = ta.selectionEnd;
              ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length; upd();
            }));
            ta.addEventListener('input', upd); upd();
          },
          onSave: (v, f) => {
            const unknown = (v.text.match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).filter((k) => !VARS.includes(k));
            if (unknown.length) { PP.form.setError(f, 'text', `Unknown variable: ${unknown.map((u) => `{${u}}`).join(', ')}`); return false; }
            const target = t || { id: nextSeq(PP.db.messageTemplates, 'MT'), event: v.event };
            Object.assign(target, { channel: v.channel, language: v.language, status: v.status, text: v.text });
            if (!t) PP.db.messageTemplates.push(target);
            PP.audit(t ? 'Message template changed' : 'Message template added', target.id, `${target.event} · ${target.channel}`);
            PP.save(); PP.ui.toast('Template saved'); drawTemplates();
          },
        });
      }

      function drawConsent() {
        const stamp = (p) => (p.consent && p.consent.updatedAt ? PP.fmt.stamp(p.consent.updatedAt) : '<span class="muted small">Not recorded</span>');
        const opt = (p, ch) => !!(p.consent && p.consent[ch]);
        PP.ui.table(pane, {
          getRows: () => PP.db.patients.filter((p) => !p.mergedInto && PP.inBranch(p)), exportName: 'consent', sortKey: 'name',
          search: { placeholder: 'Search patient name, ID or mobile…', text: (p) => `${p.name} ${p.id} ${p.mobile}` },
          filters: [
            { id: 'sms', label: 'SMS: any', options: [['yes', 'SMS opted in'], ['no', 'SMS not opted in']], match: (p, v) => (v === 'yes' ? opt(p, 'sms') : !opt(p, 'sms')) },
            { id: 'wa', label: 'WhatsApp: any', options: [['yes', 'WhatsApp opted in'], ['no', 'WhatsApp not opted in']], match: (p, v) => (v === 'yes' ? opt(p, 'whatsapp') : !opt(p, 'whatsapp')) },
          ],
          columns: [
            { key: 'name', label: 'Patient', sort: (p) => p.name, render: (p) => `<a href="#/patients/${esc(p.id)}"><b>${esc(p.name)}</b></a><span class="sub">${esc(p.id)}</span>`, exportValue: (p) => `${p.name} (${p.id})` },
            { key: 'mobile', label: 'Mobile', render: (p) => `<span class="mono">${esc(p.mobile)}</span>` },
            { key: 'sms', label: 'SMS', render: (p) => sw('', opt(p, 'sms'), '', `data-consent="sms" data-pid="${esc(p.id)}" aria-label="SMS consent for ${esc(p.name)}"`), exportValue: (p) => (opt(p, 'sms') ? 'Yes' : 'No') },
            { key: 'wa', label: 'WhatsApp', render: (p) => sw('', opt(p, 'whatsapp'), '', `data-consent="whatsapp" data-pid="${esc(p.id)}" aria-label="WhatsApp consent for ${esc(p.name)}"`), exportValue: (p) => (opt(p, 'whatsapp') ? 'Yes' : 'No') },
            { key: 'upd', label: 'Last changed', render: stamp, exportValue: (p) => (p.consent && p.consent.updatedAt) || '' },
          ],
          afterDraw: (c) => $$('[data-consent]', c).forEach((cb) => cb.addEventListener('change', () => {
            const p = PP.find.patient(cb.dataset.pid); const ch = cb.dataset.consent;
            p.consent = Object.assign({ sms: false, whatsapp: false }, p.consent, { [ch]: cb.checked, updatedAt: PP.nowStamp(), updatedBy: (PP.currentUser() || {}).id });
            PP.audit('Consent changed', p.id, `${p.name} · ${ch === 'sms' ? 'SMS' : 'WhatsApp'} ${cb.checked ? 'opted in' : 'opted out'}`);
            PP.save();
            const cell = cb.closest('tr').lastElementChild; if (cell) cell.innerHTML = stamp(p);
            PP.ui.toast(`${esc(p.name)}: ${ch === 'sms' ? 'SMS' : 'WhatsApp'} ${cb.checked ? 'opted in' : 'opted out'}`);
          })),
          empty: { icon: 'users', title: 'No patients in this branch' },
        });
        pane.insertAdjacentHTML('afterbegin', `<div class="card-body adm-roles-note small muted">Marketing and reminder messages go only to patients who opted in for that channel. Without a recorded opt-in, only essential messages (for example, a cancellation by the clinic) are sent.</div>`);
      }

      function drawLog() {
        const rows = mockDeliveryLog();
        PP.ui.table(pane, {
          rows, exportName: 'delivery-log', pageSize: 10,
          search: { placeholder: 'Search recipient, patient or event…', text: (r) => `${r.to} ${r.event} ${r.patientId ? PP.patientName(r.patientId) : ''} ${r.provider}` },
          filters: [
            { id: 'ch', label: 'All channels', options: [['SMS', 'SMS'], ['WhatsApp', 'WhatsApp'], ['Email', 'Email'], ['In-app', 'In-app']], match: (r, v) => r.channel === v },
            { id: 'st', label: 'Any status', options: [['Delivered', 'Delivered'], ['Sent', 'Sent'], ['Failed', 'Failed'], ['Simulated', 'Simulated']], match: (r, v) => r.status === v },
          ],
          columns: [
            { key: 'at', label: 'Time', sort: (r) => r.at, render: (r) => PP.fmt.stamp(r.at), exportValue: (r) => r.at },
            { key: 'channel', label: 'Channel', render: (r) => esc(r.channel) },
            { key: 'to', label: 'Recipient', render: (r) => `<span class="mono">${esc(r.to)}</span>${r.patientId ? `<span class="sub">${esc(PP.patientName(r.patientId))}</span>` : ''}` },
            { key: 'event', label: 'Event', render: (r) => `<span class="mono small">${esc(r.event)}</span>` },
            { key: 'provider', label: 'Provider', render: (r) => esc(r.provider) },
            { key: 'status', label: 'Status', sort: (r) => r.status, render: (r) => `${PP.ui.badge(r.status, r.status === 'Simulated' ? 'neutral' : undefined)}${r.note ? `<span class="sub">${esc(r.note)}</span>` : ''}`, exportValue: (r) => r.status },
          ],
          empty: { icon: 'send', title: 'No messages yet' },
        });
        pane.insertAdjacentHTML('afterbegin', `<div class="card-body adm-roles-note small muted">Mock history. Mobile numbers are masked in the log. Message bodies are not stored in the log.</div>`);
      }
      draw();
    },
  });

  /* ================================================================= audit */
  PP.route('/settings/audit', {
    title: 'Audit Log',
    perm: 'audit.view',
    render({ el }) {
      const rows = PP.db.audit;
      const users = Array.from(new Set(rows.map((r) => r.userName || 'System'))).sort();
      const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
      const T = PP.today();
      el.innerHTML = PP.ui.pageHead({
        title: 'Audit Log',
        subtitle: 'Every sensitive action: who, what, when. Entries cannot be edited or deleted.',
        crumbs: [['Settings', '#/settings'], ['Audit log']],
      }) + `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Entries', value: PP.fmt.num(rows.length), hint: 'Most recent first', icon: 'clipboard' })}
          ${PP.ui.kpi({ label: 'Today', value: rows.filter((r) => isoOfStamp(r.at) === T).length, icon: 'clock', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Users', value: users.length, icon: 'users', tone: 'lavender' })}
          ${PP.ui.kpi({ label: 'Permission and user changes', value: rows.filter((r) => /Permission|Role|User/.test(r.action)).length, icon: 'shield', tone: 'warning' })}
        </div>
        <section class="card mt-4" data-audit></section>`;
      PP.ui.table($('[data-audit]', el), {
        rows, exportName: 'audit-log', pageSize: 25,
        search: { placeholder: 'Search action, target or detail…', text: (r) => `${r.action} ${r.target} ${r.detail} ${r.userName}` },
        filters: [
          { id: 'user', label: 'All users', options: users.map((u) => [u, u]), match: (r, v) => (r.userName || 'System') === v },
          { id: 'action', label: 'All actions', options: actions.map((a) => [a, a]), match: (r, v) => r.action === v },
          { id: 'period', label: 'Any time', options: [['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']], match: (r, v) => isoOfStamp(r.at) >= PP.addDays(T, -(Number(v) - 1)) },
        ],
        columns: [
          { key: 'at', label: 'Time', sort: (r) => new Date(r.at).getTime() || 0, render: (r) => `<span class="nowrap">${PP.fmt.stamp(r.at)}</span>`, exportValue: (r) => r.at },
          { key: 'user', label: 'User', sort: (r) => r.userName || '', render: (r) => `${esc(r.userName || 'System')}${r.userId ? `<span class="sub">${esc(r.userId)}</span>` : ''}`, exportValue: (r) => r.userName || 'System' },
          { key: 'action', label: 'Action', sort: (r) => r.action, render: (r) => `<b>${esc(r.action)}</b>` },
          { key: 'target', label: 'Target', render: (r) => `<span class="mono small">${esc(r.target || '—')}</span>`, exportValue: (r) => r.target },
          { key: 'detail', label: 'Detail', render: (r) => `<span class="small">${esc(r.detail || '')}</span>`, exportValue: (r) => r.detail },
        ],
        empty: { icon: 'clipboard', title: 'No audit entries yet' },
      });
    },
  });
})();
