/* Physio Point HTML prototype — additional modules.
   Inventory & suppliers, payroll, lab & diagnostics, dental chart, help & support.
   Feature catalogue: inventory, payroll, lab, dental, clinical.lab_requests, clinical.diagnosis_codes (FR-ADD-01, FR-GA-19, FR-GA-20).
   Stock purchases and paid payroll create expenses (D-023). Commissions are paid separately from payroll (D-025, D-026).
   Mock data only, stored in this browser (D-006). */
(function () {
  'use strict';
  const PP = window.PP;
  const esc = PP.esc;
  const $ = PP.$;
  const $$ = PP.$$;
  const money = (n) => PP.fmt.money(n);
  const r2 = (n) => PP.round2(Number(n) || 0);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const F = (o) => PP.form.field(o);

  /* ================================================================ shared helpers */
  const COLLS = ['invItems', 'stockMoves', 'suppliers', 'salaryProfiles', 'payrollRuns', 'labTests', 'labOrders', 'dentalCharts', 'kbArticles', 'supportTickets', 'vendorAnnouncements', 'remoteSessions'];
  function ensure() {
    const db = PP.db;
    COLLS.forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    ['expenses', 'audit', 'notifications'].forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    db.counters = db.counters || {};
  }
  const user = () => PP.currentUser() || {};
  const userName = (id) => { const u = id ? PP.find.user(id) : null; return u ? u.name : '—'; };
  const byId = (coll, id) => (PP.db[coll] || []).find((x) => x.id === id) || null;
  const roleName = (id) => ((PP.db.roles || []).find((r) => r.id === id) || {}).name || id || '—';
  const userBranchIds = () => PP.allowedBranchIds();
  const branchOptions = () => PP.db.branches.filter((b) => userBranchIds().includes(b.id)).map((b) => [b.id, b.name]);
  const defaultBranch = () => { const b = PP.activeBranchId(); if (b !== 'ALL') return b; return userBranchIds()[0] || (PP.db.branches[0] || {}).id; };
  const branchShort = (id) => PP.branchName(id).split(' ')[0];
  const patLink = (id) => (id && PP.find.patient(id) ? `<a href="#/patients/${esc(id)}">${esc(PP.patientName(id))}</a>` : '—');
  const proOptions = () => PP.db.professionals.filter((p) => p.status === 'Active').map((p) => [p.id, PP.proName(p)]);
  const stampMs = (s) => (s ? new Date(s).getTime() : 0);
  const fromNow = (ms) => new Date(Date.now() + ms).toISOString();
  const tabFrom = (query, allowed, fallback) => (allowed.includes(query.tab) ? query.tab : fallback);
  const setQuery = (path, q) => { const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== '')).toString(); try { history.replaceState(null, '', `#${path}${qs ? '?' + qs : ''}`); } catch (e) { /* ignore */ } };
  const readOnlyLicence = () => { const st = (PP.db.settings.licence || {}).state; return st && st !== 'Active' && st !== 'Grace'; };

  /** Generic form modal: validates with PP.form.validate, then calls onSubmit(data, form). Return false to keep it open. */
  function formModal({ title, size, body, submitLabel, onOpen, onSubmit, danger }) {
    return PP.ui.modal({
      title, size,
      body: `<form class="form-grid" novalidate onsubmit="return false">${body}</form>`,
      onOpen: (bodyEl, back) => { if (onOpen) onOpen($('form', bodyEl), bodyEl, back); },
      buttons: [
        { label: 'Cancel', kind: 'ghost' },
        { label: submitLabel || 'Save', kind: danger ? 'danger solid' : 'primary', onClick: async ({ body: b }) => {
          const f = $('form', b);
          if (!PP.form.validate(f)) return false;
          await PP.sleep(320);
          return onSubmit(PP.form.read(f), f);
        } },
      ],
    });
  }

  /* -------- patient picker (search by name, ID or mobile) -------- */
  function pickedHtml(p) {
    return `<div class="mod-picked"><span class="avatar">${esc(PP.initials(p.name))}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.id)} · ${esc(p.mobile)} · ${esc(PP.fmt.age(p.dob))}</div></div><button type="button" class="btn btn-sm btn-ghost" data-pp-change>Change</button></div>`;
  }
  function patientPickerHtml(name, label, selectedId, required) {
    const p = selectedId ? PP.find.patient(selectedId) : null;
    return `<div class="field full mod-ppick" data-field="${name}"><label>${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>
      <div class="input-icon ${p ? 'hidden' : ''}" data-pp-search>${PP.icon('search')}<input class="input" type="search" data-pp-q placeholder="Search by name, patient ID or mobile" aria-label="Search patient" autocomplete="off"></div>
      <input type="hidden" name="${name}" value="${esc(p ? p.id : '')}" ${required ? 'required' : ''}>
      <div class="psearch-results" data-pp-res></div>
      <div data-pp-picked>${p ? pickedHtml(p) : ''}</div>
      <div class="error" role="alert">Select a patient.</div></div>`;
  }
  function bindPatientPicker(root, onPick) {
    const q = $('[data-pp-q]', root); const res = $('[data-pp-res]', root); const hid = $('.mod-ppick input[type=hidden]', root);
    const picked = $('[data-pp-picked]', root); const search = $('[data-pp-search]', root);
    if (!q) return;
    const bindChange = () => { const b = $('[data-pp-change]', picked); if (b) b.addEventListener('click', () => pick(null)); };
    const pick = (p) => {
      hid.value = p ? p.id : ''; picked.innerHTML = p ? pickedHtml(p) : ''; search.classList.toggle('hidden', !!p); res.innerHTML = '';
      hid.closest('.field').classList.remove('has-error'); bindChange(); if (onPick) onPick(p); if (!p) { q.value = ''; q.focus(); }
    };
    bindChange();
    q.addEventListener('input', () => {
      const s = q.value.trim().toLowerCase(); if (!s) { res.innerHTML = ''; return; }
      const digits = s.replace(/\D/g, '');
      const list = PP.db.patients.filter((p) => !p.mergedInto && (p.name.toLowerCase().includes(s) || p.id.toLowerCase().includes(s) || (digits.length >= 3 && String(p.mobile).replace(/\D/g, '').includes(digits)))).slice(0, 6);
      res.innerHTML = list.length ? list.map((p) => `<button type="button" class="psr" data-pid="${esc(p.id)}"><b>${esc(p.name)}</b> <span class="small muted">${esc(p.id)} · ${esc(p.mobile)}</span></button>`).join('') : '<div class="small muted mod-pad">No patient found. Register the patient first.</div>';
      $$('[data-pid]', res).forEach((b) => b.addEventListener('click', () => pick(PP.find.patient(b.dataset.pid))));
    });
  }

  /* -------- editable rows (allowances, deductions, lab parameters) -------- */
  function amountRowsHtml(prefix, rows, placeholder) {
    const list = rows && rows.length ? rows : [];
    return `<div class="mod-rows" data-rows="${prefix}">${list.map((r, i) => amountRow(prefix, i, r, placeholder)).join('')}</div>
      <button type="button" class="btn btn-sm btn-ghost mt-2" data-addrow="${prefix}">${PP.icon('plus')} Add line</button>`;
  }
  function amountRow(prefix, i, r, placeholder) {
    return `<div class="mod-row-line" data-line>
      <div class="field"><input class="input" name="${prefix}-label-${i}" value="${esc(r.label || '')}" placeholder="${esc(placeholder || 'Description')}" aria-label="Description"><div class="error"></div></div>
      <div class="field"><input class="input" name="${prefix}-amt-${i}" type="number" min="0" step="1" value="${r.amount != null ? esc(r.amount) : ''}" data-rule="nonneg" placeholder="0" aria-label="Amount"><div class="error"></div></div>
      <button type="button" class="btn btn-icon btn-ghost" data-delrow aria-label="Remove line">${PP.icon('x')}</button></div>`;
  }
  function bindAmountRows(form, prefix, placeholder, onChange) {
    const wrap = $(`[data-rows="${prefix}"]`, form); const add = $(`[data-addrow="${prefix}"]`, form);
    const bindDel = () => $$('[data-delrow]', wrap).forEach((b) => { b.onclick = () => { b.closest('[data-line]').remove(); if (onChange) onChange(); }; });
    add.addEventListener('click', () => { const i = Date.now() % 100000; wrap.insertAdjacentHTML('beforeend', amountRow(prefix, i, {}, placeholder)); bindDel(); const inp = $$('input', wrap); if (inp.length) inp[inp.length - 2].focus(); });
    wrap.addEventListener('input', () => { if (onChange) onChange(); });
    bindDel();
  }
  function readAmountRows(form, prefix) {
    return $$(`[data-rows="${prefix}"] [data-line]`, form).map((line) => {
      const [l, a] = $$('input', line); return { label: l.value.trim(), amount: r2(a.value) };
    }).filter((r) => r.label || r.amount);
  }

  /* -------- printing -------- */
  function printDoc(html) {
    let host = document.getElementById('mod-print');
    if (!host) { host = document.createElement('div'); host.id = 'mod-print'; document.body.appendChild(host); }
    host.innerHTML = html;
    document.body.classList.add('mod-printing');
    const done = () => { document.body.classList.remove('mod-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
  }
  function sheetHead(title, sub) {
    const s = PP.db.settings;
    return `<div class="mod-sheet-head"><div class="mod-sheet-logo" style="background:${esc(s.primary || '#083E44')}">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="">` : esc(s.logoText || 'PP')}</div>
      <div class="grow"><div class="mod-sheet-org">${esc(s.clinicName)}</div><div class="small muted">${esc(s.address || '')} · ${esc(s.phone || '')}</div></div>
      <div class="right"><div class="mod-sheet-title">${esc(title)}</div><div class="small muted">${sub || ''}</div></div></div>`;
  }
  const sheetFoot = () => '<div class="mod-sheet-foot">Generated by the Physio Point prototype · fictional data only · not a real document</div>';

  /* ================================================================ seed data (fictional) */
  PP.registerSeed('modules', (db, rng) => {
    const T = PP.today();
    COLLS.forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    const c = db.counters = db.counters || {};
    const ago = (days, hours) => new Date(Date.now() - ((days || 0) * 24 + (hours || 0)) * 3600e3).toISOString();

    /* ---- suppliers ---- */
    db.suppliers = [
      { id: 'SUP-01', name: 'Khulna Medical Supplies', contactPerson: 'Abdul Mannan', mobile: '01811223344', email: 'sales@kms.example', address: 'Lower Jessore Road, Khulna', items: 'Ultrasound gel, electrode pads, gloves, cotton, massage oil', openingDue: 0, status: 'Active' },
      { id: 'SUP-02', name: 'RehabCare Distributors', contactPerson: 'Shahana Parvin', mobile: '01922334455', email: 'orders@rehabcare.example', address: 'KDA Avenue, Khulna', items: 'Resistance bands, exercise balls, hot and cold packs', openingDue: 0, status: 'Active' },
      { id: 'SUP-03', name: 'Bengal Ortho Products', contactPerson: 'Mizanur Rahman', mobile: '01733445566', email: 'bengalortho@mail.example', address: 'Mirpur 10, Dhaka', items: 'Knee braces, lumbar belts, cervical collars, slings', openingDue: 4500, status: 'Active' },
      { id: 'SUP-04', name: 'CleanPlus Traders', contactPerson: 'Rubel Hossain', mobile: '01644556677', email: '', address: 'Boro Bazar, Khulna', items: 'Disinfectant, couch rolls, towels', openingDue: 0, status: 'Active' },
      { id: 'SUP-05', name: 'MediTape BD', contactPerson: 'Farhana Yasmin', mobile: '01555778899', email: 'hello@meditape.example', address: 'Agrabad, Chattogram', items: 'Kinesiology tape, rigid strapping tape', openingDue: 0, status: 'Active' },
      { id: 'SUP-06', name: 'Delta Surgical House', contactPerson: 'Anwar Hossain', mobile: '01911002233', email: '', address: 'Shibbari, Khulna', items: 'Surgical consumables (not used since 2025)', openingDue: 0, status: 'Inactive' },
    ];
    c.SUP = 6;

    /* ---- inventory items: [name, sku, category, unit, reorder, cost, sale, supplier, [stock BR-1, BR-2]] ---- */
    const items = [
      ['Ultrasound gel 5 L can', 'CON-GEL5', 'Consumables', 'can', 2, 1450, null, 'SUP-01', [5, 2]],
      ['Ultrasound gel 250 ml', 'CON-GEL250', 'Consumables', 'bottle', 10, 180, 250, 'SUP-01', [24, 8]],
      ['Kinesiology tape 5 cm', 'TAP-KIN5', 'Tapes & strapping', 'roll', 8, 650, 900, 'SUP-05', [14, 4]],
      ['Rigid strapping tape 3.8 cm', 'TAP-RIG38', 'Tapes & strapping', 'roll', 10, 220, null, 'SUP-05', [6, 11]],
      ['Resistance band yellow (light)', 'EXE-BNDY', 'Exercise equipment', 'piece', 6, 350, 500, 'SUP-02', [12, 7]],
      ['Resistance band red (medium)', 'EXE-BNDR', 'Exercise equipment', 'piece', 6, 380, 550, 'SUP-02', [3, 6]],
      ['Resistance band blue (heavy)', 'EXE-BNDB', 'Exercise equipment', 'piece', 4, 420, 600, 'SUP-02', [0, 5]],
      ['Hinged knee brace (M)', 'BRC-KNEEM', 'Braces & supports', 'piece', 2, 1800, 2600, 'SUP-03', [4, 3]],
      ['Lumbar support belt (L)', 'BRC-LUMBL', 'Braces & supports', 'piece', 3, 1500, 2200, 'SUP-03', [2, 4]],
      ['Soft cervical collar', 'BRC-CERV', 'Braces & supports', 'piece', 3, 450, 700, 'SUP-03', [7, 0]],
      ['Shoulder immobiliser sling', 'BRC-SLING', 'Braces & supports', 'piece', 2, 650, 950, 'SUP-03', [5, 3]],
      ['TENS electrode pads 5×5 cm (4)', 'ELC-PAD55', 'Electrotherapy', 'pack', 8, 320, null, 'SUP-01', [18, 9]],
      ['Disposable gloves (100)', 'HYG-GLOVE', 'Hygiene', 'box', 3, 650, null, 'SUP-01', [6, 4]],
      ['Massage oil 1 L', 'CON-OIL1', 'Consumables', 'bottle', 2, 850, null, 'SUP-01', [1, 3]],
      ['Reusable hot pack', 'EXE-HOTP', 'Electrotherapy', 'piece', 3, 900, null, 'SUP-02', [8, 4]],
      ['Gel cold pack', 'EXE-COLD', 'Electrotherapy', 'piece', 3, 600, 850, 'SUP-02', [2, 5]],
      ['Exercise ball 65 cm', 'EXE-BALL65', 'Exercise equipment', 'piece', 1, 1600, null, 'SUP-02', [3, 2]],
      ['Disinfectant 5 L', 'HYG-DIS5', 'Hygiene', 'can', 2, 1100, null, 'SUP-04', [4, 3]],
      ['Paper couch roll', 'HYG-COUCH', 'Hygiene', 'roll', 8, 280, null, 'SUP-04', [22, 12]],
      ['Hand towels (12)', 'HYG-TOWEL', 'Hygiene', 'pack', 2, 960, null, 'SUP-04', [5, 1]],
      ['Cotton roll 500 g', 'CON-COTTON', 'Consumables', 'roll', 3, 380, null, 'SUP-01', [0, 0]],
    ];
    const reasons = ['Used in session', 'Used in session', 'Used in session', 'Sold to patient', 'Damaged / expired'];
    c.ITM = 0; c.STK = c.STK || 0;
    items.forEach(([name, sku, category, unit, reorder, cost, sale, sup, stocks], idx) => {
      const it = { id: `ITM-${pad(idx + 1, 3)}`, name, sku, category, unit, reorderLevel: reorder, unitCost: cost, salePrice: sale, supplierId: sup, status: 'Active', stock: {}, createdAt: PP.addDays(T, -60) };
      c.ITM = idx + 1;
      db.invItems.push(it);
      ['BR-1', 'BR-2'].forEach((br, bi) => {
        const target = stocks[bi];
        const issues = []; const n = rng.int(1, 4); for (let k = 0; k < n; k++) issues.push(rng.int(1, 3));
        const recvQty = target + PP.sum(issues);
        let bal = 0; const d0 = PP.addDays(T, -rng.int(32, 45));
        bal += recvQty;
        db.stockMoves.push({ id: PP.nextId('STK'), itemId: it.id, branchId: br, type: 'receive', qty: recvQty, unitCost: cost, amount: r2(recvQty * cost), supplierId: sup, ref: `BILL-${rng.int(1000, 9999)}`, paymentStatus: (sup === 'SUP-02' && bi === 0 && idx % 2 === 0) ? 'Unpaid' : 'Paid', reason: 'Stock purchase', note: '', patientId: null, date: d0, by: 'USR-3', at: `${d0}T11:00:00`, balanceAfter: bal, expenseId: null });
        issues.forEach((q, k) => {
          bal -= q; const d = PP.addDays(d0, 3 + k * rng.int(4, 8));
          db.stockMoves.push({ id: PP.nextId('STK'), itemId: it.id, branchId: br, type: 'issue', qty: -q, unitCost: cost, amount: 0, supplierId: null, ref: '', paymentStatus: null, reason: rng.pick(reasons), note: '', patientId: null, date: d, by: bi === 0 ? 'USR-2' : 'USR-1', at: `${d}T15:30:00`, balanceAfter: bal, expenseId: null });
        });
        it.stock[br] = bal;
      });
    });

    /* ---- payroll: salary settings (fixed salaries only; commissions are separate, D-026) ---- */
    const sp = (staffId, basic, allowances, deductions, method, commissionOnly) => ({ id: staffId, staffId, basic, allowances, deductions, method: method || 'Bank transfer', commissionOnly: !!commissionOnly, effectiveFrom: '2026-01', updatedAt: ago(60) });
    db.salaryProfiles = [
      sp('USR-1', 45000, [{ label: 'House rent', amount: 15000 }, { label: 'Transport', amount: 3000 }], [{ label: 'Income tax (TDS)', amount: 2500 }]),
      sp('USR-2', 18000, [{ label: 'House rent', amount: 6000 }, { label: 'Transport', amount: 1500 }], [{ label: 'Provident fund', amount: 900 }], 'bKash'),
      sp('USR-3', 28000, [{ label: 'House rent', amount: 9000 }, { label: 'Transport', amount: 2000 }], [{ label: 'Provident fund', amount: 1400 }, { label: 'Income tax (TDS)', amount: 800 }]),
      sp('PRO-1', 30000, [{ label: 'House rent', amount: 8000 }], [{ label: 'Provident fund', amount: 1500 }, { label: 'Income tax (TDS)', amount: 1200 }]),
      sp('PRO-2', 25000, [{ label: 'House rent', amount: 7000 }], [{ label: 'Provident fund', amount: 1250 }]),
      sp('PRO-3', 0, [], [], 'Bank transfer', true),
      sp('PRO-4', 0, [], [], 'Bank transfer', true),
      sp('PRO-5', 16000, [{ label: 'House rent', amount: 5000 }, { label: 'Transport', amount: 1500 }], [{ label: 'Provident fund', amount: 800 }], 'Cash'),
    ];
    const staffInfo = (id) => {
      const u = (db.users || []).find((x) => x.id === id); if (u) return { name: u.name, role: ((db.roles || []).find((r) => r.id === u.role) || {}).name || u.role, kind: 'staff', branchId: (u.branchIds || [])[0] || 'BR-1' };
      const p = (db.professionals || []).find((x) => x.id === id); return p ? { name: (p.title ? p.title + ' ' : '') + p.name, role: p.designation, kind: 'professional', branchId: p.branchId } : null;
    };
    const curKey = PP.monthKey(T);
    const prevKey = (key, n) => { let [y, m] = key.split('-').map(Number); m -= n; while (m < 1) { m += 12; y -= 1; } return `${y}-${pad(m)}`; };
    [2, 1].forEach((back) => {
      const key = prevKey(curKey, back);
      const [y, m] = key.split('-').map(Number); const end = PP.isoOf(new Date(y, m, 0));
      const lines = db.salaryProfiles.filter((p) => !p.commissionOnly && p.basic > 0).map((p) => { const s = staffInfo(p.staffId); return s ? { staffId: p.staffId, name: s.name, role: s.role, kind: s.kind, branchId: s.branchId, basic: p.basic, allowances: PP.clone(p.allowances), deductions: PP.clone(p.deductions), note: '', method: p.method } : null; }).filter(Boolean);
      if (back === 1 && lines[1]) { lines[1].deductions.push({ label: 'Unpaid leave (1 day)', amount: 600 }); lines[1].note = 'One day unpaid leave'; }
      const run = { id: `PRL-${key}`, month: key, status: 'Paid', lines, createdBy: 'USR-3', createdAt: `${end}T10:00:00`, approvedBy: 'USR-1', approvedAt: `${end}T12:00:00`, paidAt: `${end}T16:00:00`, paidOn: end, paidBy: 'USR-3', expenseIds: [] };
      lines.forEach((l) => {
        const net = r2(l.basic + PP.sum(l.allowances, (a) => a.amount) - PP.sum(l.deductions, (a) => a.amount));
        const exp = { id: PP.nextId('EXP'), date: end, categoryId: 'CAT-E-SAL', amount: net, branchId: l.branchId, method: l.method || 'Bank transfer', paymentStatus: 'Paid', note: `Salary ${PP.fmt.month(key)} · ${l.name}`, createdBy: 'USR-3', reversalOf: null, source: { type: 'payroll', id: run.id, staffId: l.staffId } };
        db.expenses.push(exp); run.expenseIds.push(exp.id);
      });
      db.payrollRuns.push(run);
    });

    /* ---- lab test catalogue ---- */
    const P = (name, unit, low, high, normal) => ({ name, unit: unit || '', low: low == null ? null : low, high: high == null ? null : high, normal: normal || '' });
    db.labTests = [
      { id: 'LT-01', code: 'CBC', name: 'Complete blood count (CBC)', category: 'Haematology', sampleType: 'Blood (EDTA)', tatHours: 6, price: 600, status: 'Active', params: [P('Haemoglobin', 'g/dL', 12, 16), P('WBC count', '×10⁹/L', 4, 11), P('Platelet count', '×10⁹/L', 150, 400), P('ESR', 'mm/1st hr', 0, 20)] },
      { id: 'LT-02', code: 'FBS', name: 'Fasting blood sugar', category: 'Biochemistry', sampleType: 'Blood (fluoride)', tatHours: 4, price: 250, status: 'Active', params: [P('Glucose (fasting)', 'mmol/L', 3.9, 5.5)] },
      { id: 'LT-03', code: 'HBA1C', name: 'HbA1c', category: 'Biochemistry', sampleType: 'Blood (EDTA)', tatHours: 24, price: 1200, status: 'Active', params: [P('HbA1c', '%', 4, 5.6)] },
      { id: 'LT-04', code: 'CREAT', name: 'Serum creatinine', category: 'Biochemistry', sampleType: 'Blood (serum)', tatHours: 6, price: 400, status: 'Active', params: [P('Creatinine', 'mg/dL', 0.6, 1.2)] },
      { id: 'LT-05', code: 'LIPID', name: 'Lipid profile (fasting)', category: 'Biochemistry', sampleType: 'Blood (serum)', tatHours: 24, price: 1500, status: 'Active', params: [P('Total cholesterol', 'mg/dL', null, 200), P('LDL cholesterol', 'mg/dL', null, 130), P('HDL cholesterol', 'mg/dL', 40, null), P('Triglycerides', 'mg/dL', null, 150)] },
      { id: 'LT-06', code: 'URIC', name: 'Serum uric acid', category: 'Biochemistry', sampleType: 'Blood (serum)', tatHours: 6, price: 450, status: 'Active', params: [P('Uric acid', 'mg/dL', 3.5, 7.2)] },
      { id: 'LT-07', code: 'VITD', name: 'Vitamin D (25-OH)', category: 'Immunology', sampleType: 'Blood (serum)', tatHours: 48, price: 3500, status: 'Active', params: [P('25-OH vitamin D', 'ng/mL', 30, 100)] },
      { id: 'LT-08', code: 'CRP', name: 'C-reactive protein (CRP)', category: 'Immunology', sampleType: 'Blood (serum)', tatHours: 6, price: 700, status: 'Active', params: [P('CRP', 'mg/L', null, 5)] },
      { id: 'LT-09', code: 'RA', name: 'Rheumatoid factor (RA)', category: 'Immunology', sampleType: 'Blood (serum)', tatHours: 24, price: 600, status: 'Active', params: [P('RA factor', 'IU/mL', null, 14)] },
      { id: 'LT-10', code: 'TSH', name: 'Thyroid stimulating hormone (TSH)', category: 'Hormone', sampleType: 'Blood (serum)', tatHours: 24, price: 900, status: 'Active', params: [P('TSH', 'mIU/L', 0.4, 4)] },
      { id: 'LT-11', code: 'URE', name: 'Urine routine examination', category: 'Clinical pathology', sampleType: 'Urine', tatHours: 4, price: 300, status: 'Active', params: [P('Colour', '', null, null, ''), P('Protein', '', null, null, 'Nil'), P('Pus cells', '/HPF', 0, 5)] },
      { id: 'LT-12', code: 'XR-KNEE', name: 'X-ray knee AP/lateral', category: 'Imaging', sampleType: 'None (imaging)', tatHours: 24, price: 800, status: 'Active', params: [P('Impression', '', null, null, '')] },
      { id: 'LT-13', code: 'CA', name: 'Serum calcium', category: 'Biochemistry', sampleType: 'Blood (serum)', tatHours: 6, price: 500, status: 'Active', params: [P('Calcium', 'mg/dL', 8.5, 10.5)] },
      { id: 'LT-14', code: 'HBSAG', name: 'HBsAg (screening)', category: 'Serology', sampleType: 'Blood (serum)', tatHours: 6, price: 500, status: 'Inactive', params: [P('HBsAg', '', null, null, 'Negative')] },
    ];
    c.LT = 14;

    /* ---- lab orders ---- */
    c.LAB = Math.max(c.LAB || 0, 100); c.SMP = c.SMP || 40;
    const pts = db.patients || [];
    const testOf = (id) => db.labTests.find((t) => t.id === id);
    const genVal = (p, abnormal) => {
      if (p.low == null && p.high == null) return p.normal || (p.name === 'Colour' ? 'Pale yellow' : p.name === 'Impression' ? 'Mild joint space narrowing, medial compartment. No fracture.' : 'Normal');
      const lo = p.low == null ? 0 : p.low; const hi = p.high == null ? lo * 2 + 40 : p.high; const span = hi - lo;
      let v = abnormal ? (p.high != null ? hi + span * (0.08 + rng.next() * 0.35) : Math.max(0, lo - span * (0.1 + rng.next() * 0.3))) : lo + span * (0.15 + rng.next() * 0.7);
      return String(Math.round(v * 10) / 10);
    };
    const specs = [
      [0, 'PRO-1', ['LT-01', 'LT-08'], 'Ordered', 0, 'Routine', 'M54.5'],
      [1, 'PRO-4', ['LT-02', 'LT-03'], 'Ordered', 0, 'Urgent', 'E11.9'],
      [2, 'PRO-1', ['LT-09', 'LT-08', 'LT-01'], 'Sample collected', 0, 'Routine', 'M06.9'],
      [3, 'PRO-4', ['LT-07', 'LT-13'], 'Processing', 1, 'Routine', 'E55.9'],
      [4, 'PRO-2', ['LT-06'], 'Processing', 2, 'Urgent', 'M10.9'],
      [5, 'PRO-1', ['LT-12'], 'Result ready', 1, 'Routine', 'M17.1'],
      [6, 'PRO-4', ['LT-05', 'LT-04'], 'Result ready', 2, 'Routine', 'I10'],
      [7, 'PRO-2', ['LT-01'], 'Delivered', 4, 'Routine', 'Z01.7'],
      [8, 'PRO-4', ['LT-10'], 'Delivered', 6, 'Routine', ''],
      [9, 'PRO-3', ['LT-11', 'LT-02'], 'Delivered', 9, 'Routine', ''],
      [10, 'PRO-1', ['LT-07'], 'Delivered', 14, 'Routine', 'E55.9'],
      [11, 'PRO-4', ['LT-03'], 'Cancelled', 3, 'Routine', 'E11.9'],
    ];
    const FLOW = ['Ordered', 'Sample collected', 'Processing', 'Result ready', 'Delivered'];
    specs.forEach(([pi, pro, tests, status, d, priority, dx], k) => {
      const pt = pts[pi % Math.max(1, pts.length)]; if (!pt) return;
      const hrs = 1 + (k % 4);
      const orderedAt = ago(d, hrs + (d ? 2 : 0));
      const tat = Math.max(...tests.map((t) => testOf(t).tatHours));
      const due = new Date(stampMs(orderedAt) + Math.max(2, priority === 'Urgent' ? tat / 2 : tat) * 3600e3).toISOString();
      const o = { id: PP.nextId('LAB'), patientId: pt.id, professionalId: pro, branchId: pt.branchId || 'BR-1', tests, priority, diagnosisCode: dx, notes: k === 1 ? 'Patient is fasting since 10 PM.' : '', orderedAt, orderedBy: k % 2 ? 'USR-2' : 'USR-1', due, status, sampleId: '', sampleType: '', collectedAt: null, collectedBy: '', processingAt: null, results: {}, enteredBy: null, verifiedBy: null, verifiedAt: null, deliveredAt: null, deliveryMethod: '', invoiceId: null, history: [{ at: orderedAt, status: 'Ordered', by: k % 2 ? 'Shirin Sultana' : 'Clinic Administrator', note: `${tests.length} test(s) ordered` }] };
      const step = FLOW.indexOf(status);
      const t0 = stampMs(orderedAt);
      const at = (h) => new Date(Math.min(Date.now() - 60e3, t0 + h * 3600e3)).toISOString();
      if (status === 'Cancelled') { o.history.push({ at: at(1), status: 'Cancelled', by: 'Shirin Sultana', note: 'Patient chose an outside lab' }); o.cancelReason = 'Patient chose an outside lab'; }
      if (step >= 1) {
        c.SMP += 1; const dd = PP.isoOf(new Date(t0));
        o.sampleId = `S-${dd.slice(2).replace(/-/g, '')}-${pad(c.SMP, 4)}`; o.sampleType = [...new Set(tests.map((t) => testOf(t).sampleType))].join(', ');
        o.collectedAt = at(0.5); o.collectedBy = 'Shirin Sultana';
        o.history.push({ at: o.collectedAt, status: 'Sample collected', by: 'Shirin Sultana', note: `Sample ${o.sampleId}` });
      }
      if (step >= 2) {
        o.processingAt = at(1); o.history.push({ at: o.processingAt, status: 'Processing', by: 'Clinic Administrator', note: 'Received in lab' });
        tests.forEach((tid, ti) => {
          const t = testOf(tid); const values = {};
          t.params.forEach((p, pj) => { values[p.name] = (step === 2 && ti === tests.length - 1 && pj > 0) ? '' : genVal(p, rng.chance(0.28)); });
          o.results[tid] = { values, comment: '' };
        });
        o.enteredBy = 'USR-1';
      }
      if (step >= 3) {
        o.verifiedBy = pro; o.verifiedAt = at(Math.min(tat, 20));
        o.history.push({ at: o.verifiedAt, status: 'Result ready', by: (PP.find.professional(pro) ? PP.proName(pro) : pro), note: 'Results verified and released' });
      }
      if (step >= 4) {
        o.deliveredAt = at(Math.min(tat + 2, 30)); o.deliveryMethod = k % 2 ? 'SMS link' : 'Printed report';
        o.history.push({ at: o.deliveredAt, status: 'Delivered', by: 'Shirin Sultana', note: o.deliveryMethod });
      }
      db.labOrders.push(o);
    });

    labCommissionDefaults(db);
    /* ---- dental charts (3 patients) ---- */
    const dp = [pts[2], pts[4], pts[6]].filter(Boolean);
    const tooth = (condition, surfaces, note) => ({ condition, surfaces: surfaces || [], note: note || '', updatedAt: ago(20) });
    const plan = (id, toothNo, procedure, fee, status, days) => ({ id, tooth: toothNo, procedure, fee, status, addedAt: ago(days || 20), doneAt: status === 'Done' ? ago((days || 20) - 5) : null, by: 'Clinic Administrator' });
    c.DPL = 20;
    if (dp[0]) db.dentalCharts.push({ id: dp[0].id, patientId: dp[0].id, teeth: { 16: tooth('filled', ['O'], 'Amalgam, intact'), 26: tooth('caries', ['O', 'M'], 'Deep occlusal caries, sensitive to cold'), 36: tooth('root_canal', [], 'RCT completed 2025, needs crown'), 46: tooth('crown', [], 'PFM crown'), 38: tooth('missing', [], 'Extracted 2022'), 48: tooth('extraction', [], 'Partially erupted, recurrent pericoronitis') }, plan: [plan('DPL-001', '16', 'Composite filling', 2000, 'Done', 40), plan('DPL-002', '26', 'Composite filling', 2000, 'Planned', 12), plan('DPL-003', '36', 'Crown (PFM)', 10000, 'Planned', 12), plan('DPL-004', '48', 'Surgical extraction', 4000, 'Planned', 12)], history: [{ at: ago(40), by: 'Clinic Administrator', text: 'Chart created' }, { at: ago(12), by: 'Clinic Administrator', text: 'Tooth 26: Healthy → Caries (O, M)' }, { at: ago(12), by: 'Clinic Administrator', text: 'Tooth 48: Healthy → Extraction planned' }], updatedAt: ago(12) });
    if (dp[1]) db.dentalCharts.push({ id: dp[1].id, patientId: dp[1].id, teeth: { 11: tooth('caries', ['M'], 'Small mesial lesion'), 21: tooth('filled', ['M', 'B'], 'Composite'), 14: tooth('implant', [], 'Implant placed 2024'), 24: tooth('missing', [], '') }, plan: [plan('DPL-005', '24', 'Dental implant', 60000, 'Planned', 8), plan('DPL-006', '11', 'Composite filling', 2000, 'Planned', 8), plan('DPL-007', 'Full mouth', 'Scaling and polishing', 2500, 'Done', 30)], history: [{ at: ago(30), by: 'Clinic Administrator', text: 'Chart created' }, { at: ago(8), by: 'Clinic Administrator', text: 'Tooth 11: Healthy → Caries (M)' }], updatedAt: ago(8) });
    if (dp[2]) db.dentalCharts.push({ id: dp[2].id, patientId: dp[2].id, teeth: { 37: tooth('caries', ['O', 'D'], ''), 47: tooth('caries', ['O'], 'Early lesion') }, plan: [plan('DPL-008', 'Full mouth', 'Scaling and polishing', 2500, 'Done', 15), plan('DPL-009', '37', 'Composite filling', 2000, 'Planned', 3), plan('DPL-010', '47', 'Glass ionomer filling', 1500, 'Planned', 3)], history: [{ at: ago(15), by: 'Clinic Administrator', text: 'Chart created' }, { at: ago(3), by: 'Clinic Administrator', text: 'Tooth 37: Healthy → Caries (O, D)' }], updatedAt: ago(3) });

    /* ---- help & support (vendor = Physio Point) ---- */
    const A = (id, category, title, summary, body, days) => ({ id, category, title, summary, body, updated: PP.addDays(T, -days), views: 40 + (days * 7) % 300 });
    db.kbArticles = [
      A('KB-101', 'Getting started', 'Set up your clinic in 10 minutes', 'Clinic name, logo, branches, working hours and your first users.', ['Open Settings → Clinic Settings and enter your clinic name, address and phone. Upload a logo; it appears on invoices and prescriptions.', 'Add each branch, then set the working days and hours for every professional under Availability & Leave.', 'Invite your staff from Users & Roles. Give each person the smallest role that lets them do their job.'], 12),
      A('KB-102', 'Appointments', 'Confirm or reject online booking requests', 'Online requests never block a slot until you confirm them.', ['Requests from the public booking page arrive under Appointments → Online Requests.', 'Check the suggested slot, change it if needed, then confirm. The patient receives an SMS if SMS is connected.', 'A pending request does not reserve the time. Only a confirmed appointment blocks the calendar.'], 20),
      A('KB-103', 'Billing & finance', 'Record a partial payment and collect the due later', 'Dues update automatically; commission follows the money collected.', ['Open the invoice and choose Record payment. Enter the amount actually received.', 'The invoice shows Partly paid with the remaining due. Commission is calculated only on the money collected (D-025).'], 6),
      A('KB-104', 'Billing & finance', 'Close the cash day', 'Count the drawer, explain any difference, lock the day.', ['Go to Cash Flow → Daily Cash Closing, pick the branch and count the cash.', 'Enter the reason for any difference. After closing, entries for that day are locked.'], 33),
      A('KB-105', 'Patients', 'Merge duplicate patient records', 'Family members may share one mobile number; that is not a duplicate.', ['Open the patient you want to keep and choose Merge. Select the duplicate record.', 'Visits, invoices and documents move to the kept record. The merged record stays in the audit log.'], 45),
      A('KB-106', 'Notifications', 'Why are SMS reminders not being sent?', 'Check the SMS provider status and the message template.', ['Open Settings → Notifications and check that SMS is enabled and the provider shows Connected.', 'Make sure the reminder template is Active and the patient has not opted out of SMS.'], 3),
      A('KB-107', 'Account & security', 'Turn on two-step sign-in for admins', 'Protect owner and admin accounts with a one-time code.', ['In Settings → Security, enable two-step sign-in for admins. Each admin is asked for a code at their next sign-in.'], 60),
      A('KB-108', 'Backups', 'How backups and restore tests work', 'Daily backup, off-site copy and a monthly restore test.', ['Your data is backed up every night. An off-site copy is kept for the number of days in your plan.', 'Physio Point runs a restore test each month and shows the date in Settings.'], 25),
      A('KB-109', 'Inventory', 'Receive stock and record the purchase as an expense', 'One step updates stock and your expense book.', ['Go to Inventory → Items & Stock and choose Receive stock. Enter the quantity, unit cost and supplier.', 'Keep “Record as expense” ticked to add a Consumables expense. Mark it Unpaid if you will pay the supplier later; the supplier’s dues update.'], 4),
      A('KB-110', 'Payroll', 'Run monthly payroll', 'Draft → approve → mark paid. Commission is paid separately.', ['Open Cash Flow → Payroll, choose the month and create the draft from salary settings.', 'Adjust allowances or deductions for the month, approve, then mark as paid. Each salary becomes an expense.', 'Professional commissions are settled under Commissions, not in payroll (D-026).'], 2),
      A('KB-111', 'Lab & diagnostics', 'From lab order to delivered report', 'Order, collect sample, enter results, verify and deliver.', ['Create the order from Lab & Diagnostics → Lab Orders. Collect the sample to generate a sample ID label.', 'Enter results; values outside the reference range are flagged High or Low. A professional verifies before the report can be delivered.'], 9),
    ];
    const msg = (from, name, at, text, attachment) => ({ from, name, at, text, attachment: attachment || '' });
    db.supportTickets = [
      { id: 'TKT-1001', subject: 'SMS reminders not sending at Khalishpur branch', category: 'Technical problem', priority: 'High', status: 'Resolved', createdAt: ago(18), updatedAt: ago(16), createdBy: 'USR-1', screenshot: 'sms-settings.png', messages: [msg('clinic', 'Clinic Administrator', ago(18), 'Since yesterday, patients at Khalishpur do not receive reminder SMS. Sonadanga works.', 'sms-settings.png'), msg('vendor', 'Physio Point Support · Rahat', ago(17.8), 'Thanks for the report. We see the Khalishpur sender ID was not approved by the SMS gateway. We have asked the provider to re-approve it.'), msg('vendor', 'Physio Point Support · Rahat', ago(16), 'The sender ID is approved again and test messages are delivered. Please confirm on your side.'), msg('clinic', 'Clinic Administrator', ago(16), 'Confirmed, reminders are working. Thank you.')] },
      { id: 'TKT-1002', subject: 'How do we give the accountant access to payroll only?', category: 'How-to question', priority: 'Normal', status: 'Closed', createdAt: ago(30), updatedAt: ago(29), createdBy: 'USR-1', screenshot: '', messages: [msg('clinic', 'Clinic Administrator', ago(30), 'We want Kamal to run payroll but not change clinic settings.'), msg('vendor', 'Physio Point Support · Mitu', ago(29.5), 'Use Settings → Users & Roles. The Accountant role already includes payroll and no settings permission. See article KB-110.')] },
      { id: 'TKT-1003', subject: 'Invoice print shows the old logo', category: 'Technical problem', priority: 'Normal', status: 'In progress', createdAt: ago(2), updatedAt: ago(1), createdBy: 'USR-1', screenshot: 'invoice-print.png', messages: [msg('clinic', 'Clinic Administrator', ago(2), 'We uploaded a new logo last week but printed invoices still show the old one.', 'invoice-print.png'), msg('vendor', 'Physio Point Support · Rahat', ago(1.9), 'Auto-reply: we received your ticket. Our target first response for your plan is 4 business hours.'), msg('vendor', 'Physio Point Support · Rahat', ago(1), 'We could reproduce it. The print template caches the logo; a fix is planned for the next update. Meanwhile, clearing the browser cache shows the new logo.')] },
      { id: 'TKT-1004', subject: 'Request: Bangla labels on prescriptions', category: 'Feature request', priority: 'Low', status: 'Waiting on you', createdAt: ago(6), updatedAt: ago(4), createdBy: 'USR-1', screenshot: '', messages: [msg('clinic', 'Clinic Administrator', ago(6), 'Can the prescription print show headings in Bangla?'), msg('vendor', 'Physio Point Support · Mitu', ago(4), 'Bangla print is on the roadmap. Could you share which headings you need first (complaint, advice, exercises)?')] },
    ];
    c.TKT = 1004;
    db.vendorAnnouncements = [
      { id: 'ANN-1', type: 'Release', title: 'New: lab orders and dental chart', body: 'Lab & Diagnostics (test catalogue, orders, results, report delivery) and the Dental Chart are now available for clinics that enable them.', date: PP.addDays(T, -2), read: false },
      { id: 'ANN-2', type: 'Maintenance', title: 'Planned maintenance on Friday 02:00–03:00', body: 'Cloud workspaces may be unavailable for up to one hour. On-premise installations are not affected. Backups run before the window.', date: PP.addDays(T, -1), read: false },
      { id: 'ANN-3', type: 'Tip', title: 'Use inventory reorder levels', body: 'Set a reorder level on each item. Low stock is highlighted so you can order before you run out.', date: PP.addDays(T, -9), read: true },
      { id: 'ANN-4', type: 'Security', title: 'Turn on two-step sign-in for admins', body: 'We recommend two-step sign-in for every owner and admin account. See article KB-107.', date: PP.addDays(T, -21), read: true },
    ];
    db.remoteSessions = [
      { id: 'RS-001', ticketId: 'TKT-1001', minutes: 30, scope: 'View only', grantedAt: ago(17.5), expiresAt: new Date(stampMs(ago(17.5)) + 30 * 60e3).toISOString(), grantedBy: 'USR-1', endedAt: new Date(stampMs(ago(17.5)) + 22 * 60e3).toISOString(), endedBy: 'Clinic Administrator', agent: 'Rahat (Physio Point Support)', code: '482915' },
    ];
    c.RS = 1;
  });

  /* ================================================================ INVENTORY */
  const INV_CATS = ['Consumables', 'Tapes & strapping', 'Exercise equipment', 'Braces & supports', 'Electrotherapy', 'Hygiene', 'Products for sale'];
  const UNITS = ['piece', 'bottle', 'can', 'roll', 'box', 'pack', 'pair', 'kg', 'litre'];
  const ISSUE_REASONS = ['Used in session', 'Sold to patient', 'Damaged / expired', 'Transferred to another branch', 'Staff use', 'Other'];
  const ADJ_REASONS = ['Physical count correction', 'Damaged', 'Expired', 'Found stock', 'Data entry error', 'Other'];
  const MOVE_LABEL = { receive: 'Received', issue: 'Issued', adjust: 'Adjusted' };
  const MOVE_TONE = { receive: 'positive', issue: 'info', adjust: 'warning' };
  const STOCK_TONE = { OK: 'positive', Low: 'warning', Out: 'error' };
  const supName = (id) => { const s = byId('suppliers', id); return s ? s.name : '—'; };
  function itemStock(it, br) { const b = br || PP.activeBranchId(); const st = it.stock || {}; return b === 'ALL' ? PP.sum(Object.values(st), (v) => Number(v) || 0) : Number(st[b]) || 0; }
  function itemStatus(it, br) {
    const b = br || PP.activeBranchId();
    if (b === 'ALL') { const tot = itemStock(it, 'ALL'); if (tot <= 0) return 'Out'; return PP.db.branches.some((x) => (Number((it.stock || {})[x.id]) || 0) <= it.reorderLevel) ? 'Low' : 'OK'; }
    const s = itemStock(it, b); return s <= 0 ? 'Out' : s <= it.reorderLevel ? 'Low' : 'OK';
  }
  const qtyFmt = (q, unit) => `${PP.fmt.num(q)} ${esc(unit || '')}`;

  function applyMove(m) {
    const it = byId('invItems', m.itemId); it.stock = it.stock || {};
    const before = Number(it.stock[m.branchId]) || 0; const after = r2(before + m.qty); it.stock[m.branchId] = after;
    const mv = { id: PP.nextId('STK'), itemId: it.id, branchId: m.branchId, type: m.type, qty: m.qty, unitCost: m.unitCost != null ? r2(m.unitCost) : it.unitCost, amount: m.type === 'receive' ? r2(m.qty * (m.unitCost || 0)) : 0, supplierId: m.supplierId || null, ref: m.ref || '', paymentStatus: m.type === 'receive' ? (m.paymentStatus || 'Paid') : null, reason: m.reason || '', note: m.note || '', patientId: m.patientId || null, date: m.date || PP.today(), by: user().id, at: PP.nowStamp(), balanceAfter: after, expenseId: null };
    if (m.type === 'receive' && m.createExpense && mv.amount > 0) {
      const exp = { id: PP.nextId('EXP'), date: mv.date, categoryId: 'CAT-E-CON', amount: mv.amount, branchId: mv.branchId, method: m.method || 'Cash', paymentStatus: mv.paymentStatus, note: `Stock purchase · ${it.name} × ${m.qty}${mv.supplierId ? ' · ' + supName(mv.supplierId) : ''}${mv.ref ? ' · ' + mv.ref : ''}`, createdBy: user().id, reversalOf: null, source: { type: 'stock', id: mv.id } };
      PP.db.expenses.push(exp); mv.expenseId = exp.id;
    }
    if (m.type === 'receive' && m.unitCost) it.unitCost = r2(m.unitCost);
    PP.db.stockMoves.push(mv);
    if (m.type === 'adjust') PP.audit('Stock adjusted', it.id, `${it.name} · ${PP.branchName(m.branchId)}: ${before} → ${after} · ${m.reason}`);
    else PP.audit(m.type === 'receive' ? 'Stock received' : 'Stock issued', it.id, `${it.name} · ${m.qty > 0 ? '+' : ''}${m.qty} · ${PP.branchName(m.branchId)}`);
    PP.save();
    return mv;
  }

  function movementModal(type, itemId, done) {
    ensure();
    const items = PP.db.invItems.filter((i) => i.status === 'Active' || i.id === itemId).sort((a, b) => a.name.localeCompare(b.name));
    const it0 = itemId ? byId('invItems', itemId) : null;
    const title = type === 'receive' ? 'Receive stock' : type === 'issue' ? 'Issue / use stock' : 'Adjust stock count';
    const common = F({ name: 'itemId', label: 'Item', type: 'select', required: true, options: items.map((i) => [i.id, `${i.name} (${i.sku || i.unit})`]), value: itemId || '' })
      + F({ name: 'branchId', label: 'Branch', type: 'select', required: true, options: branchOptions(), value: defaultBranch(), placeholder: false })
      + '<div class="full mod-stock-now" data-now></div>';
    let body = common;
    if (type === 'receive') {
      body += F({ name: 'qty', label: 'Quantity received', type: 'number', required: true, rule: 'positive', min: 1, step: 1 })
        + F({ name: 'unitCost', label: 'Unit cost (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, step: '0.01', value: it0 ? it0.unitCost : '' })
        + F({ name: 'supplierId', label: 'Supplier', type: 'select', options: PP.db.suppliers.filter((s) => s.status === 'Active').map((s) => [s.id, s.name]), value: it0 ? it0.supplierId : '', placeholder: 'No supplier / opening stock' })
        + F({ name: 'ref', label: 'Supplier bill / reference', placeholder: 'e.g. BILL-4471' })
        + F({ name: 'date', label: 'Date received', type: 'date', required: true, value: PP.today(), max: PP.today() })
        + F({ name: 'paymentStatus', label: 'Payment to supplier', type: 'select', options: [['Paid', 'Paid now'], ['Unpaid', 'Unpaid (adds to supplier dues)']], value: 'Paid', placeholder: false })
        + F({ name: 'createExpense', label: 'Record as an expense (category: Consumables)', type: 'checkbox', value: true, hint: 'Adds the purchase to Income & Expenses (D-023). Untick for opening stock or free samples.' })
        + F({ name: 'method', label: 'Payment method', type: 'select', options: PP.PAYMENT_METHODS, value: 'Cash', placeholder: false })
        + '<div class="full mod-total" data-total></div>';
    } else if (type === 'issue') {
      body += F({ name: 'qty', label: 'Quantity issued', type: 'number', required: true, rule: 'positive', min: 1, step: 1 })
        + F({ name: 'reason', label: 'Reason', type: 'select', required: true, options: ISSUE_REASONS, value: 'Used in session' })
        + patientPickerHtml('patientId', 'Patient (optional)', '', false)
        + F({ name: 'note', label: 'Note', type: 'textarea', rows: 2, full: true, placeholder: 'e.g. Knee taping during session' });
    } else {
      body += F({ name: 'counted', label: 'Counted quantity (actual)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 1 })
        + F({ name: 'reason', label: 'Reason', type: 'select', required: true, options: ADJ_REASONS })
        + F({ name: 'note', label: 'Explanation', type: 'textarea', rows: 2, full: true, required: true, placeholder: 'What did you find? This is kept in the audit log.' })
        + '<div class="full" data-diff></div>';
    }
    formModal({
      title, size: 'lg', body, submitLabel: type === 'receive' ? 'Receive stock' : type === 'issue' ? 'Issue stock' : 'Save adjustment',
      onOpen: (form) => {
        const sel = (n) => $(`[name="${n}"]`, form);
        const refresh = () => {
          const it = byId('invItems', sel('itemId').value); const br = sel('branchId').value;
          const now = $('[data-now]', form);
          now.innerHTML = it ? `<div class="mod-chipline">${PP.db.branches.map((b) => `<span class="mod-chip ${b.id === br ? 'is-on' : ''}">${esc(b.name)}: <b>${qtyFmt(itemStock(it, b.id), it.unit)}</b></span>`).join('')}${PP.ui.badge(itemStatus(it, br), STOCK_TONE[itemStatus(it, br)])}<span class="small muted">Reorder level ${it.reorderLevel} ${esc(it.unit)}</span></div>` : '<span class="small muted">Choose an item to see its current stock.</span>';
          if (type === 'receive') {
            const tot = r2((Number(sel('qty').value) || 0) * (Number(sel('unitCost').value) || 0));
            const exp = sel('createExpense').checked; sel('method').closest('.field').classList.toggle('hidden', !exp);
            $('[data-total]', form).innerHTML = `<div class="mod-sum-row"><span>Purchase total</span><b class="mono">${money(tot)}</b></div><div class="small muted">${exp ? `An expense of ${money(tot)} will be recorded as <b>${esc(sel('paymentStatus').value)}</b>.` : 'No expense will be recorded.'}${sel('paymentStatus').value === 'Unpaid' && sel('supplierId').value ? ` The supplier’s dues increase by ${money(tot)}.` : ''}</div>`;
          }
          if (type === 'adjust') {
            const cur = it ? itemStock(it, br) : 0; const v = sel('counted').value;
            $('[data-diff]', form).innerHTML = it && v !== '' ? PP.ui.alert(Number(v) === cur ? 'info' : 'warning', `System stock ${cur} → counted ${Number(v)}: difference <b>${Number(v) - cur > 0 ? '+' : ''}${Number(v) - cur} ${esc(it.unit)}</b>.`) : '';
          }
        };
        form.addEventListener('input', refresh); form.addEventListener('change', (e) => {
          if (type === 'receive' && e.target.name === 'itemId') { const it = byId('invItems', e.target.value); if (it) { sel('unitCost').value = it.unitCost; if (it.supplierId) sel('supplierId').value = it.supplierId; } }
          refresh();
        });
        if (type === 'issue') bindPatientPicker(form);
        refresh();
      },
      onSubmit: (d, form) => {
        const it = byId('invItems', d.itemId); const cur = itemStock(it, d.branchId);
        if (type === 'issue' && Number(d.qty) > cur) { PP.form.setError(form, 'qty', `Only ${cur} ${it.unit} in stock at ${PP.branchName(d.branchId)}.`); return false; }
        if (type === 'adjust' && Number(d.counted) === cur) { PP.form.setError(form, 'counted', 'The counted quantity equals the system stock. Nothing to adjust.'); return false; }
        if (readOnlyLicence()) { PP.ui.toast('Licence is read-only: new entries are paused (D-017).', 'error'); return false; }
        let mv;
        if (type === 'receive') mv = applyMove({ type, itemId: d.itemId, branchId: d.branchId, qty: Number(d.qty), unitCost: Number(d.unitCost), supplierId: d.supplierId, ref: d.ref, date: d.date, paymentStatus: d.paymentStatus, createExpense: d.createExpense, method: d.method, reason: 'Stock purchase' });
        else if (type === 'issue') mv = applyMove({ type, itemId: d.itemId, branchId: d.branchId, qty: -Number(d.qty), reason: d.reason, note: d.note, patientId: d.patientId });
        else mv = applyMove({ type, itemId: d.itemId, branchId: d.branchId, qty: Number(d.counted) - cur, reason: d.reason, note: d.note });
        const st = itemStatus(it, d.branchId);
        PP.ui.toast(`${MOVE_LABEL[type]}: ${esc(it.name)} ${mv.qty > 0 ? '+' : ''}${mv.qty} ${esc(it.unit)}. New stock ${mv.balanceAfter}.${mv.expenseId ? ` Expense ${esc(mv.expenseId)} recorded.` : ''}`);
        if (st !== 'OK' && type !== 'receive') PP.ui.toast(`${esc(it.name)} is ${st === 'Out' ? 'out of stock' : 'below its reorder level'} at ${esc(PP.branchName(d.branchId))}.`, 'warning', 4200);
        if (done) done();
      },
    });
  }

  function itemModal(item, done) {
    const isNew = !item; const it = item || {};
    let body = F({ name: 'name', label: 'Item name', required: true, value: it.name, full: true, placeholder: 'e.g. Ultrasound gel 250 ml' })
      + F({ name: 'sku', label: 'SKU / code', value: it.sku, placeholder: 'e.g. CON-GEL250' })
      + F({ name: 'category', label: 'Category', type: 'select', required: true, options: INV_CATS, value: it.category })
      + F({ name: 'unit', label: 'Unit', type: 'select', required: true, options: UNITS, value: it.unit || 'piece', placeholder: false })
      + F({ name: 'reorderLevel', label: 'Reorder level (per branch)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 1, value: it.reorderLevel != null ? it.reorderLevel : 2, hint: 'Stock at or below this is shown as Low.' })
      + F({ name: 'unitCost', label: 'Unit cost (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, step: '0.01', value: it.unitCost })
      + F({ name: 'salePrice', label: 'Sale price to patients (optional)', type: 'number', rule: 'nonneg', min: 0, step: '0.01', value: it.salePrice })
      + F({ name: 'supplierId', label: 'Preferred supplier', type: 'select', options: PP.db.suppliers.filter((s) => s.status === 'Active' || s.id === it.supplierId).map((s) => [s.id, s.name]), value: it.supplierId, placeholder: 'None' })
      + F({ name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], value: it.status || 'Active', placeholder: false });
    if (isNew) body += `<div class="full sec-sub">Opening stock (optional)</div>` + F({ name: 'openQty', label: 'Opening quantity', type: 'number', rule: 'nonneg', min: 0, step: 1 }) + F({ name: 'openBranch', label: 'At branch', type: 'select', options: branchOptions(), value: defaultBranch(), placeholder: false });
    formModal({
      title: isNew ? 'Add inventory item' : `Edit item · ${esc(it.name)}`, size: 'lg', body, submitLabel: isNew ? 'Add item' : 'Save changes',
      onSubmit: (d, form) => {
        const dup = PP.db.invItems.find((x) => x.id !== it.id && x.name.trim().toLowerCase() === d.name.toLowerCase());
        if (dup) { PP.form.setError(form, 'name', `An item with this name already exists (${dup.id}).`); return false; }
        const vals = { name: d.name, sku: d.sku, category: d.category, unit: d.unit, reorderLevel: Number(d.reorderLevel), unitCost: r2(d.unitCost), salePrice: d.salePrice === '' ? null : r2(d.salePrice), supplierId: d.supplierId || null, status: d.status };
        if (isNew) {
          const rec = Object.assign({ id: PP.nextId('ITM', 3), stock: {}, createdAt: PP.today() }, vals); PP.db.invItems.push(rec);
          if (Number(d.openQty) > 0) applyMove({ type: 'receive', itemId: rec.id, branchId: d.openBranch, qty: Number(d.openQty), unitCost: rec.unitCost, reason: 'Opening stock', paymentStatus: 'Paid', createExpense: false });
          PP.audit('Inventory item added', rec.id, rec.name); PP.save(); PP.ui.toast(`Item “${esc(rec.name)}” added`);
        } else { Object.assign(it, vals); PP.audit('Inventory item updated', it.id, it.name); PP.save(); PP.ui.toast('Item saved'); }
        if (done) done();
      },
    });
  }

  function movesTableHtml(moves, showItem) {
    if (!moves.length) return PP.ui.empty({ icon: 'layers', title: 'No stock movements yet', text: 'Receipts, issues and adjustments appear here.' });
    return `<div class="table-wrap"><table class="table mod-compact"><thead><tr><th>Date</th>${showItem ? '<th>Item</th>' : ''}<th>Branch</th><th>Type</th><th class="right">Qty</th><th class="right">Balance</th><th>Details</th><th>By</th></tr></thead><tbody>
      ${moves.map((m) => { const it = byId('invItems', m.itemId) || {}; return `<tr><td class="nowrap">${PP.fmt.date(m.date)}</td>${showItem ? `<td>${esc(it.name || m.itemId)}</td>` : ''}<td>${esc(branchShort(m.branchId))}</td><td>${PP.ui.badge(MOVE_LABEL[m.type], MOVE_TONE[m.type])}</td><td class="right mono ${m.qty < 0 ? 'mod-neg' : 'mod-pos'}">${m.qty > 0 ? '+' : ''}${PP.fmt.num(m.qty)}</td><td class="right mono">${PP.fmt.num(m.balanceAfter)}</td>
        <td class="small">${esc(m.reason)}${m.type === 'receive' ? ` · ${money(m.amount)}${m.supplierId ? ' · ' + esc(supName(m.supplierId)) : ''}${m.ref ? ' · ' + esc(m.ref) : ''} · ${PP.ui.badge(m.paymentStatus || 'Paid')}` : ''}${m.patientId ? ` · ${patLink(m.patientId)}` : ''}${m.note ? `<span class="sub">${esc(m.note)}</span>` : ''}${m.expenseId ? `<span class="sub">Expense ${esc(m.expenseId)}</span>` : ''}</td><td class="small">${esc(userName(m.by))}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  function itemHistoryModal(itemId, done) {
    const it = byId('invItems', itemId); if (!it) return;
    const moves = PP.db.stockMoves.filter((m) => m.itemId === it.id && PP.inBranch(m)).sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date));
    const m = PP.ui.modal({
      title: `${esc(it.name)} · stock history`, size: 'lg',
      body: `<div class="mod-item-head"><div><div class="small muted">${esc(it.sku || '')} · ${esc(it.category)} · per ${esc(it.unit)} ${money(it.unitCost)}${it.salePrice ? ` · sells at ${money(it.salePrice)}` : ''}</div>
        <div class="mod-chipline mt-2">${PP.db.branches.map((b) => `<span class="mod-chip">${esc(b.name)}: <b>${qtyFmt(itemStock(it, b.id), it.unit)}</b> ${PP.ui.badge(itemStatus(it, b.id), STOCK_TONE[itemStatus(it, b.id)])}</span>`).join('')}</div></div>
        <div class="row"><button class="btn btn-sm" data-mv="receive">${PP.icon('arrowDown')} Receive</button><button class="btn btn-sm" data-mv="issue">${PP.icon('arrowUp')} Issue</button><button class="btn btn-sm" data-mv="adjust">${PP.icon('edit')} Adjust</button></div></div>
        <div class="mt-4">${movesTableHtml(moves, false)}</div>`,
      buttons: [{ label: 'Close', kind: 'ghost' }],
    });
    $$('[data-mv]', m.el).forEach((b) => b.addEventListener('click', () => { m.close(); movementModal(b.dataset.mv, it.id, done); }));
  }

  PP.route('/inventory', {
    title: 'Items & Stock', perm: 'inventory.manage',
    render({ el, query }) {
      ensure();
      const br = PP.activeBranchId();
      const items = () => PP.db.invItems.slice().sort((a, b) => a.name.localeCompare(b.name));
      const active = PP.db.invItems.filter((i) => i.status === 'Active');
      const low = active.filter((i) => itemStatus(i) === 'Low'); const out = active.filter((i) => itemStatus(i) === 'Out');
      const value = PP.sum(active, (i) => itemStock(i) * i.unitCost);
      const monthKey = PP.monthKey(PP.today());
      const recvMonth = PP.sum(PP.db.stockMoves.filter((m) => m.type === 'receive' && PP.monthKey(m.date) === monthKey && PP.inBranch(m)), (m) => m.amount);
      el.innerHTML = PP.ui.pageHead({
        title: 'Items & Stock', crumbs: [['Inventory'], ['Items & Stock']],
        subtitle: `Consumables and products per branch. Showing <b>${esc(br === 'ALL' ? 'all branches' : PP.branchName(br))}</b> (change it with the branch switcher in the top bar).`,
        actions: `<a class="btn" href="#/inventory/suppliers">${PP.icon('building')} Suppliers</a><button class="btn" data-act="adjust">${PP.icon('edit')} Adjust count</button><button class="btn" data-act="issue">${PP.icon('arrowUp')} Issue / use</button><button class="btn" data-act="add">${PP.icon('plus')} Add item</button><button class="btn btn-primary" data-act="receive">${PP.icon('arrowDown')} Receive stock</button>`,
      }) + `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Active items', value: active.length, hint: `${PP.db.invItems.length - active.length} inactive`, icon: 'layers', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Low stock', value: low.length, hint: 'At or below reorder level', icon: 'alert', tone: 'warning' })}
          ${PP.ui.kpi({ label: 'Out of stock', value: out.length, hint: br === 'ALL' ? 'No stock in any branch' : 'In this branch', icon: 'x', tone: 'error' })}
          ${PP.ui.kpi({ label: 'Stock value (at cost)', value: money(value), hint: `Purchases this month ${money(recvMonth)}`, icon: 'banknote', tone: 'positive' })}
        </div>
        ${low.length + out.length ? `<div class="mt-4">${PP.ui.alert('warning', `<b>${low.length + out.length} item(s) need reordering:</b> ${[...out, ...low].slice(0, 5).map((i) => esc(i.name)).join(', ')}${low.length + out.length > 5 ? ' …' : ''} <button class="btn btn-sm mod-inline-btn" data-showlow>Show only these</button>`)}</div>` : ''}
        <div class="card mt-4"><div class="card-head"><h2>Items</h2><span class="small muted">Click an item to see its movement history</span></div><div data-tbl></div></div>
        <div class="card mt-4"><div class="card-head"><h2>Recent stock movements</h2><span class="small muted">Last 12 in ${esc(br === 'ALL' ? 'all branches' : PP.branchName(br))}</span></div><div class="card-body flush" data-moves></div></div>`;
      const rerender = () => PP.render();
      let tbl;
      const drawTable = (statusFilter) => {
        tbl = PP.ui.table($('[data-tbl]', el), {
          getRows: items, exportName: 'inventory-items', pageSize: 10,
          search: { placeholder: 'Search item, SKU or category…', text: (r) => `${r.name} ${r.sku} ${r.category}` },
          filters: [
            { id: 'cat', label: 'All categories', options: [...new Set(PP.db.invItems.map((i) => i.category))].sort().map((c) => [c, c]), match: (r, v) => r.category === v },
            { id: 'st', label: 'Any stock status', value: statusFilter || '', options: [['attention', 'Low or out'], ['OK', 'OK'], ['Low', 'Low'], ['Out', 'Out']], match: (r, v) => (v === 'attention' ? itemStatus(r) !== 'OK' && r.status === 'Active' : itemStatus(r) === v) },
            { id: 'sup', label: 'Any supplier', options: PP.db.suppliers.map((s) => [s.id, s.name]), match: (r, v) => r.supplierId === v },
            { id: 'act', label: 'Active and inactive', value: '', options: [['Active', 'Active only'], ['Inactive', 'Inactive only']], match: (r, v) => r.status === v },
          ],
          rowClass: (r) => (r.status !== 'Active' ? 'mod-row-inactive' : itemStatus(r) === 'Out' ? 'mod-row-out' : itemStatus(r) === 'Low' ? 'mod-row-low' : ''),
          columns: [
            { key: 'name', label: 'Item', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.sku || '—')}${r.status !== 'Active' ? ' · Inactive' : ''}</span>`, exportValue: (r) => r.name },
            { key: 'category', label: 'Category', sort: (r) => r.category, render: (r) => esc(r.category) },
            { key: 'unit', label: 'Unit', render: (r) => esc(r.unit) },
            { key: 'stock', label: 'Stock', align: 'right', sort: (r) => itemStock(r), render: (r) => `<b>${PP.fmt.num(itemStock(r))}</b>${br === 'ALL' ? `<span class="sub">${PP.db.branches.map((b) => `${esc(branchShort(b.id).slice(0, 1))}: ${itemStock(r, b.id)}`).join(' · ')}</span>` : ''}`, exportValue: (r) => itemStock(r) },
            { key: 'reorder', label: 'Reorder level', align: 'right', sort: (r) => r.reorderLevel, render: (r) => PP.fmt.num(r.reorderLevel) },
            { key: 'value', label: 'Value', align: 'right', sort: (r) => itemStock(r) * r.unitCost, render: (r) => `<span class="nowrap">${money(itemStock(r) * r.unitCost)}</span>`, exportValue: (r) => r2(itemStock(r) * r.unitCost) },
            { key: 'status', label: 'Status', sort: (r) => ['Out', 'Low', 'OK'].indexOf(itemStatus(r)), render: (r) => PP.ui.badge(itemStatus(r), STOCK_TONE[itemStatus(r)]), exportValue: (r) => itemStatus(r) },
            { key: 'act', label: '', render: (r) => `<span class="row-actions"><button class="btn btn-sm btn-ghost" data-row="receive" data-id="${esc(r.id)}" title="Receive stock" aria-label="Receive ${esc(r.name)}">${PP.icon('arrowDown')}</button><button class="btn btn-sm btn-ghost" data-row="issue" data-id="${esc(r.id)}" title="Issue / use" aria-label="Issue ${esc(r.name)}">${PP.icon('arrowUp')}</button><button class="btn btn-sm btn-ghost" data-row="adjust" data-id="${esc(r.id)}" title="Adjust count" aria-label="Adjust ${esc(r.name)}">${PP.icon('refresh')}</button><button class="btn btn-sm btn-ghost" data-row="edit" data-id="${esc(r.id)}" title="Edit item" aria-label="Edit ${esc(r.name)}">${PP.icon('edit')}</button></span>`, exportValue: () => '' },
          ],
          onRowClick: (r) => itemHistoryModal(r.id, rerender),
          afterDraw: (c) => $$('[data-row]', c).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.id; if (b.dataset.row === 'edit') itemModal(byId('invItems', id), rerender); else movementModal(b.dataset.row, id, rerender); })),
          empty: { icon: 'layers', title: 'No inventory items yet', text: 'Add the consumables and products you keep in stock.', action: '<button class="btn btn-primary" data-act="add">Add item</button>' },
        });
      };
      drawTable(query.status === 'low' ? 'attention' : '');
      const moves = PP.db.stockMoves.filter((m) => PP.inBranch(m)).sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date)).slice(0, 12);
      $('[data-moves]', el).innerHTML = movesTableHtml(moves, true);
      // Bind on a wrapper owned by this render (#view itself persists across renders, so never add listeners to el).
      const root = document.createElement('div'); while (el.firstChild) root.appendChild(el.firstChild); el.appendChild(root);
      root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]'); if (a) { const k = a.dataset.act; if (k === 'add') itemModal(null, rerender); else movementModal(k, null, rerender); }
        if (e.target.closest('[data-showlow]')) { drawTable('attention'); $('[data-tbl]', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    },
  });

  /* ---------------------------------------------------------------- suppliers */
  const supReceipts = (sid) => PP.db.stockMoves.filter((m) => m.type === 'receive' && m.supplierId === sid);
  const supDues = (s) => r2((Number(s.openingDue) || 0) + PP.sum(supReceipts(s.id).filter((m) => m.paymentStatus === 'Unpaid'), (m) => m.amount));

  function markReceiptPaid(mv, method, date) {
    mv.paymentStatus = 'Paid'; mv.paidOn = date;
    const exp = mv.expenseId ? PP.db.expenses.find((x) => x.id === mv.expenseId) : null;
    if (exp) { exp.paymentStatus = 'Paid'; exp.method = method; exp.paidOn = date; return null; }
    return mv.amount;
  }

  function supplierModal(sup, done) {
    const isNew = !sup; const s = sup || {};
    formModal({
      title: isNew ? 'Add supplier' : `Edit supplier · ${esc(s.name)}`, size: 'lg', submitLabel: isNew ? 'Add supplier' : 'Save changes',
      body: F({ name: 'name', label: 'Supplier name', required: true, value: s.name, full: true })
        + F({ name: 'contactPerson', label: 'Contact person', value: s.contactPerson })
        + F({ name: 'mobile', label: 'Mobile', type: 'tel', required: true, rule: 'mobile', value: s.mobile, placeholder: '01XXXXXXXXX' })
        + F({ name: 'email', label: 'Email', type: 'email', rule: 'email', value: s.email })
        + F({ name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], value: s.status || 'Active', placeholder: false })
        + F({ name: 'address', label: 'Address', value: s.address, full: true })
        + F({ name: 'items', label: 'Items supplied', type: 'textarea', rows: 2, value: s.items, full: true, placeholder: 'e.g. Ultrasound gel, tapes, braces' })
        + F({ name: 'openingDue', label: 'Opening balance due (BDT)', type: 'number', rule: 'nonneg', min: 0, step: '0.01', value: s.openingDue != null ? s.openingDue : 0, hint: 'Money owed from before you started using inventory. Dues from unpaid receipts are added automatically.' }),
      onSubmit: (d, form) => {
        const mob = d.mobile.replace(/[\s-]/g, '');
        const dup = PP.db.suppliers.find((x) => x.id !== s.id && x.name.toLowerCase() === d.name.toLowerCase());
        if (dup) { PP.form.setError(form, 'name', 'A supplier with this name already exists.'); return false; }
        const vals = { name: d.name, contactPerson: d.contactPerson, mobile: mob, email: d.email, status: d.status, address: d.address, items: d.items, openingDue: r2(d.openingDue) };
        if (isNew) { const rec = Object.assign({ id: PP.nextId('SUP', 2) }, vals); PP.db.suppliers.push(rec); PP.audit('Supplier added', rec.id, rec.name); PP.ui.toast(`Supplier “${esc(rec.name)}” added`); }
        else { Object.assign(s, vals); PP.audit('Supplier updated', s.id, s.name); PP.ui.toast('Supplier saved'); }
        PP.save(); if (done) done();
      },
    });
  }

  function payDuesModal(sup, done, onlyMove) {
    const unpaid = onlyMove ? [onlyMove] : supReceipts(sup.id).filter((m) => m.paymentStatus === 'Unpaid');
    const opening = onlyMove ? 0 : Number(sup.openingDue) || 0;
    const total = r2(opening + PP.sum(unpaid, (m) => m.amount));
    if (total <= 0) { PP.ui.toast('This supplier has no dues.', 'info'); return; }
    formModal({
      title: `Pay ${esc(sup.name)}`, submitLabel: `Pay ${money(total)}`,
      body: `<div class="full">${PP.ui.alert('info', `Paying <b>${money(total)}</b>: ${unpaid.length} unpaid receipt(s)${opening ? ` and an opening balance of ${money(opening)}` : ''}. Linked Unpaid expenses are marked Paid; anything not yet in your expenses is recorded as a Consumables expense (D-023).`)}</div>`
        + F({ name: 'method', label: 'Payment method', type: 'select', options: PP.PAYMENT_METHODS, value: 'Bank transfer', placeholder: false })
        + F({ name: 'date', label: 'Payment date', type: 'date', required: true, value: PP.today(), max: PP.today() })
        + F({ name: 'branchId', label: 'Expense branch', type: 'select', options: branchOptions(), value: defaultBranch(), placeholder: false })
        + F({ name: 'note', label: 'Reference', placeholder: 'e.g. bank transaction ID' }),
      onSubmit: (d) => {
        let newExp = 0; unpaid.forEach((m) => { newExp += markReceiptPaid(m, d.method, d.date) || 0; });
        newExp += opening; if (!onlyMove) sup.openingDue = 0;
        let expId = '';
        if (newExp > 0) { const exp = { id: PP.nextId('EXP'), date: d.date, categoryId: 'CAT-E-CON', amount: r2(newExp), branchId: d.branchId, method: d.method, paymentStatus: 'Paid', note: `Supplier payment · ${sup.name}${d.note ? ' · ' + d.note : ''}`, createdBy: user().id, reversalOf: null, source: { type: 'supplier', id: sup.id } }; PP.db.expenses.push(exp); expId = exp.id; }
        PP.audit('Supplier paid', sup.id, `${money(total)} · ${d.method}`); PP.save();
        PP.ui.toast(`Paid ${money(total)} to ${esc(sup.name)}.${expId ? ` Expense ${esc(expId)} recorded.` : ' Linked expenses marked Paid.'}`);
        if (done) done();
      },
    });
  }

  function supplierHistoryModal(sup, done) {
    const draw = () => {
      const rec = supReceipts(sup.id).sort((a, b) => b.date.localeCompare(a.date));
      return `<div class="row between"><div><div><b>${esc(sup.contactPerson || '—')}</b> · ${esc(sup.mobile)}${sup.email ? ' · ' + esc(sup.email) : ''}</div><div class="small muted">${esc(sup.address || '')}</div><div class="small muted mt-2">Supplies: ${esc(sup.items || '—')}</div></div>
        <div class="mod-due-box"><div class="small muted">Dues</div><div class="mono mod-due">${money(supDues(sup))}</div>${sup.openingDue ? `<div class="small muted">incl. opening ${money(sup.openingDue)}</div>` : ''}${supDues(sup) > 0 ? '<button class="btn btn-primary btn-sm mt-2" data-payall>Pay dues</button>' : ''}</div></div>
        <div class="mt-4">${rec.length ? `<div class="table-wrap"><table class="table mod-compact"><thead><tr><th>Date</th><th>Item</th><th>Branch</th><th class="right">Qty</th><th class="right">Amount</th><th>Reference</th><th>Payment</th><th></th></tr></thead><tbody>${rec.map((m) => { const it = byId('invItems', m.itemId) || {}; return `<tr><td class="nowrap">${PP.fmt.date(m.date)}</td><td>${esc(it.name || m.itemId)}</td><td>${esc(branchShort(m.branchId))}</td><td class="right mono">${PP.fmt.num(m.qty)} ${esc(it.unit || '')}</td><td class="right mono">${money(m.amount)}</td><td class="small">${esc(m.ref || '—')}${m.expenseId ? `<span class="sub">${esc(m.expenseId)}</span>` : ''}</td><td>${PP.ui.badge(m.paymentStatus || 'Paid')}</td><td>${m.paymentStatus === 'Unpaid' ? `<button class="btn btn-sm" data-paymv="${esc(m.id)}">Mark paid</button>` : ''}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total purchases</td><td class="right mono">${money(PP.sum(rec, (m) => m.amount))}</td><td colspan="3"></td></tr></tfoot></table></div>` : PP.ui.empty({ icon: 'receipt', title: 'No purchases yet', text: 'Stock you receive from this supplier is listed here.' })}</div>`;
    };
    const m = PP.ui.modal({ title: `${esc(sup.name)} · purchase history`, size: 'lg', body: draw(), buttons: [{ label: 'Close', kind: 'ghost' }] });
    const bind = () => {
      const all = $('[data-payall]', m.body); if (all) all.addEventListener('click', () => { m.close(); payDuesModal(sup, done); });
      $$('[data-paymv]', m.body).forEach((b) => b.addEventListener('click', () => { m.close(); payDuesModal(sup, done, PP.db.stockMoves.find((x) => x.id === b.dataset.paymv)); }));
    };
    bind();
  }

  PP.route('/inventory/suppliers', {
    title: 'Suppliers', perm: 'inventory.manage',
    render({ el }) {
      ensure();
      const rerender = () => PP.render();
      const active = PP.db.suppliers.filter((s) => s.status === 'Active');
      const totalDues = PP.sum(PP.db.suppliers, supDues);
      const mk = PP.monthKey(PP.today());
      const month = PP.sum(PP.db.stockMoves.filter((m) => m.type === 'receive' && m.supplierId && PP.monthKey(m.date) === mk), (m) => m.amount);
      el.innerHTML = PP.ui.pageHead({
        title: 'Suppliers', crumbs: [['Inventory', '#/inventory'], ['Suppliers']], subtitle: 'Who you buy consumables and products from, what you owe them, and every purchase.',
        actions: `<a class="btn" href="#/inventory">${PP.icon('layers')} Items & stock</a><button class="btn btn-primary" data-add>${PP.icon('plus')} Add supplier</button>`,
      }) + `<div class="grid grid-3">
          ${PP.ui.kpi({ label: 'Active suppliers', value: active.length, hint: `${PP.db.suppliers.length - active.length} inactive`, icon: 'building', tone: 'info' })}
          ${PP.ui.kpi({ label: 'Total dues to suppliers', value: money(totalDues), hint: `${PP.db.suppliers.filter((s) => supDues(s) > 0).length} supplier(s) owed`, icon: 'wallet', tone: totalDues ? 'warning' : 'positive' })}
          ${PP.ui.kpi({ label: 'Purchases this month', value: money(month), hint: PP.fmt.month(mk), icon: 'receipt', tone: 'positive' })}
        </div><div class="card mt-4" data-tbl></div>`;
      PP.ui.table($('[data-tbl]', el), {
        getRows: () => PP.db.suppliers.slice().sort((a, b) => a.name.localeCompare(b.name)), exportName: 'suppliers',
        search: { placeholder: 'Search supplier, contact, mobile or item…', text: (r) => `${r.name} ${r.contactPerson} ${r.mobile} ${r.items}` },
        filters: [{ id: 'st', label: 'Any status', options: [['Active', 'Active'], ['Inactive', 'Inactive']], match: (r, v) => r.status === v }, { id: 'due', label: 'Dues: any', options: [['owed', 'Has dues'], ['clear', 'No dues']], match: (r, v) => (v === 'owed' ? supDues(r) > 0 : supDues(r) <= 0) }],
        columns: [
          { key: 'name', label: 'Supplier', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.contactPerson || '—')}</span>`, exportValue: (r) => r.name },
          { key: 'mobile', label: 'Mobile', render: (r) => `<span class="nowrap">${esc(r.mobile)}</span>` },
          { key: 'items', label: 'Items supplied', render: (r) => `<span class="small mod-clamp">${esc(r.items || '—')}</span>`, exportValue: (r) => r.items },
          { key: 'purch', label: 'Purchases', align: 'right', sort: (r) => PP.sum(supReceipts(r.id), (m) => m.amount), render: (r) => `${money(PP.sum(supReceipts(r.id), (m) => m.amount))}<span class="sub">${supReceipts(r.id).length} receipt(s)</span>`, exportValue: (r) => PP.sum(supReceipts(r.id), (m) => m.amount) },
          { key: 'dues', label: 'Dues', align: 'right', sort: (r) => supDues(r), render: (r) => (supDues(r) > 0 ? `<b class="mod-neg">${money(supDues(r))}</b>` : `<span class="muted">${money(0)}</span>`), exportValue: (r) => supDues(r) },
          { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status), exportValue: (r) => r.status },
          { key: 'act', label: '', render: (r) => `<span class="row-actions"><button class="btn btn-sm btn-ghost" data-hist="${esc(r.id)}">History</button>${supDues(r) > 0 ? `<button class="btn btn-sm btn-ghost" data-pay="${esc(r.id)}">Pay</button>` : ''}<button class="btn btn-sm btn-ghost" data-edit="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">${PP.icon('edit')}</button></span>`, exportValue: () => '' },
        ],
        onRowClick: (r) => supplierHistoryModal(r, rerender),
        afterDraw: (c) => {
          $$('[data-hist]', c).forEach((b) => b.addEventListener('click', () => supplierHistoryModal(byId('suppliers', b.dataset.hist), rerender)));
          $$('[data-pay]', c).forEach((b) => b.addEventListener('click', () => payDuesModal(byId('suppliers', b.dataset.pay), rerender)));
          $$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => supplierModal(byId('suppliers', b.dataset.edit), rerender)));
        },
        empty: { icon: 'building', title: 'No suppliers yet', text: 'Add the companies you buy stock from.' },
      });
      $('[data-add]', el).addEventListener('click', () => supplierModal(null, rerender));
    },
  });

  /* ================================================================ PAYROLL */
  const PAY_METHODS = ['Bank transfer', 'Cash', 'bKash', 'Nagad'];
  const RUN_TONE = { Draft: 'warning', Approved: 'lavender', Paid: 'positive' };
  function staffList() {
    const out = [];
    PP.db.users.filter((u) => u.status === 'Active' && !u.professionalId).forEach((u) => out.push({ id: u.id, name: u.name, kind: 'staff', role: roleName(u.role), branchId: (u.branchIds || [])[0] || (PP.db.branches[0] || {}).id }));
    PP.db.professionals.filter((p) => p.status === 'Active').forEach((p) => out.push({ id: p.id, name: PP.proName(p), kind: 'professional', role: p.designation || PP.t('professional'), branchId: p.branchId }));
    return out;
  }
  const profileOf = (staffId) => PP.db.salaryProfiles.find((p) => p.staffId === staffId) || null;
  const lineTotals = (l) => { const allow = r2(PP.sum(l.allowances || [], (a) => a.amount)); const ded = r2(PP.sum(l.deductions || [], (a) => a.amount)); return { allow, ded, gross: r2((Number(l.basic) || 0) + allow), net: r2((Number(l.basic) || 0) + allow - ded) }; };
  const runTotals = (run) => { const t = run.lines.map(lineTotals); return { basic: r2(PP.sum(run.lines, (l) => l.basic)), allow: r2(PP.sum(t, (x) => x.allow)), ded: r2(PP.sum(t, (x) => x.ded)), gross: r2(PP.sum(t, (x) => x.gross)), net: r2(PP.sum(t, (x) => x.net)) }; };
  const kindLabel = (k) => (k === 'professional' ? PP.t('professional') : 'Staff');
  const runLinesFromProfiles = () => staffList().map((s) => { const p = profileOf(s.id); if (!p || p.commissionOnly || !(p.basic > 0)) return null; return { staffId: s.id, name: s.name, role: s.role, kind: s.kind, branchId: s.branchId, basic: p.basic, allowances: PP.clone(p.allowances || []), deductions: PP.clone(p.deductions || []), note: '', method: p.method || 'Bank transfer' }; }).filter(Boolean);

  function payslipHtml(run, l) {
    const t = lineTotals(l);
    return `<div class="mod-sheet">${sheetHead('Payslip', `${esc(PP.fmt.month(run.month))} · ${esc(run.id)}`)}
      <div class="mod-sheet-grid"><div><div class="small muted">Employee</div><b>${esc(l.name)}</b><div class="small">${esc(l.role || '')} · ${esc(kindLabel(l.kind))}</div></div>
        <div><div class="small muted">Branch</div><b>${esc(PP.branchName(l.branchId))}</b><div class="small">Staff ID ${esc(l.staffId)}</div></div>
        <div><div class="small muted">Pay period</div><b>${esc(PP.fmt.month(run.month))}</b><div class="small">Status: ${esc(run.status)}${run.paidOn ? ` · paid ${PP.fmt.date(run.paidOn)}` : ''}</div></div></div>
      <div class="mod-sheet-cols">
        <table class="mod-sheet-table"><thead><tr><th>Earnings</th><th class="right">BDT</th></tr></thead><tbody><tr><td>Basic salary</td><td class="right">${PP.fmt.num(l.basic)}</td></tr>${(l.allowances || []).map((a) => `<tr><td>${esc(a.label || 'Allowance')}</td><td class="right">${PP.fmt.num(a.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Gross earnings</td><td class="right">${PP.fmt.num(t.gross)}</td></tr></tfoot></table>
        <table class="mod-sheet-table"><thead><tr><th>Deductions</th><th class="right">BDT</th></tr></thead><tbody>${(l.deductions || []).map((a) => `<tr><td>${esc(a.label || 'Deduction')}</td><td class="right">${PP.fmt.num(a.amount)}</td></tr>`).join('') || '<tr><td class="muted">None</td><td class="right">0</td></tr>'}</tbody><tfoot><tr><td>Total deductions</td><td class="right">${PP.fmt.num(t.ded)}</td></tr></tfoot></table>
      </div>
      <div class="mod-net"><span>Net pay</span><b>${money(t.net)}</b></div>
      ${l.note ? `<p class="small"><b>Note:</b> ${esc(l.note)}</p>` : ''}
      <p class="small muted">Payment method: ${esc(l.method || 'Bank transfer')}. ${l.kind === 'professional' ? `Commission for ${esc(PP.tl('professional'))}s is not part of this payslip; it is settled and paid separately through Commissions (D-025, D-026).` : ''}</p>
      <div class="mod-sign"><div>Prepared by</div><div>Approved by${run.approvedBy ? `: ${esc(userName(run.approvedBy))}` : ''}</div><div>Received by</div></div>
      ${sheetFoot()}</div>`;
  }
  function payslipModal(run, l) {
    PP.ui.modal({ title: `Payslip · ${esc(l.name)}`, size: 'lg', body: payslipHtml(run, l), buttons: [{ label: 'Close', kind: 'ghost' }, { label: `${PP.icon('printer')} Print payslip`, kind: 'primary', onClick: () => { printDoc(payslipHtml(run, l)); return false; } }] });
  }

  function salaryEditor(title, rec, opts, onSave) {
    formModal({
      title, size: 'lg', submitLabel: 'Save',
      body: (opts.profile ? F({ name: 'commissionOnly', label: `Commission only (no fixed salary; paid through Commissions)`, type: 'checkbox', value: rec.commissionOnly, full: true }) : '')
        + F({ name: 'basic', label: 'Basic salary (BDT / month)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 1, value: rec.basic || 0 })
        + F({ name: 'method', label: 'Payment method', type: 'select', options: PAY_METHODS, value: rec.method || 'Bank transfer', placeholder: false })
        + `<div class="full"><div class="label">Allowances</div>${amountRowsHtml('al', rec.allowances, 'e.g. House rent')}</div>`
        + `<div class="full"><div class="label">Deductions</div>${amountRowsHtml('de', rec.deductions, 'e.g. Provident fund, unpaid leave')}</div>`
        + (opts.note ? F({ name: 'note', label: 'Note for this month', value: rec.note, full: true, placeholder: 'e.g. One day unpaid leave' }) : '')
        + (opts.profile ? F({ name: 'effectiveFrom', label: 'Effective from (month)', type: 'month', value: rec.effectiveFrom || PP.monthKey(PP.today()), required: true }) : '')
        + '<div class="full mod-total" data-net></div>',
      onOpen: (form) => {
        const upd = () => { const t = lineTotals({ basic: Number($('[name=basic]', form).value) || 0, allowances: readAmountRows(form, 'al'), deductions: readAmountRows(form, 'de') }); $('[data-net]', form).innerHTML = `<div class="mod-sum-row"><span>Gross ${money(t.gross)} − deductions ${money(t.ded)}</span><b class="mono">Net ${money(t.net)}</b></div>`; };
        bindAmountRows(form, 'al', 'e.g. House rent', upd); bindAmountRows(form, 'de', 'e.g. Provident fund', upd);
        form.addEventListener('input', upd); upd();
      },
      onSubmit: (d, form) => {
        const al = readAmountRows(form, 'al'); const de = readAmountRows(form, 'de');
        const bad = [...al, ...de].find((r) => r.amount && !r.label); if (bad) { PP.ui.toast('Give every allowance and deduction a description.', 'error'); return false; }
        const t = lineTotals({ basic: Number(d.basic), allowances: al, deductions: de });
        if (t.net < 0) { PP.form.setError(form, 'basic', 'Deductions are larger than the gross salary.'); return false; }
        onSave(Object.assign({}, d, { basic: r2(d.basic), allowances: al, deductions: de }));
      },
    });
  }

  PP.route('/payroll', {
    title: 'Payroll', perm: 'payroll.manage',
    render({ el, query }) {
      ensure();
      const thisMonth = PP.monthKey(PP.today());
      const month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : thisMonth;
      const tab = tabFrom(query, ['run', 'settings', 'history'], 'run');
      el.innerHTML = PP.ui.pageHead({
        title: 'Payroll', crumbs: [['Cash Flow'], ['Payroll']],
        subtitle: 'Fixed monthly salaries for staff and salaried professionals. Draft → approve → mark paid; paid salaries become expenses (D-023).',
        actions: `<label class="small muted" for="mod-month">Month</label><input type="month" id="mod-month" class="input mod-month" value="${esc(month)}" max="${esc(thisMonth)}" data-month>`,
      }) + PP.ui.alert('info', `Professional commissions are <b>not</b> paid through payroll. They are calculated on collected payments and settled separately under <a href="#/commissions">Commissions</a> (D-025, D-026). A ${esc(PP.tl('professional'))} can have a salary here and a commission there.`)
        + '<div class="card mt-4"><div data-tabs></div><div data-pane></div></div>';
      $('[data-month]', el).addEventListener('change', (e) => { if (e.target.value) PP.go(`#/payroll?month=${e.target.value}&tab=run`); });
      const pane = $('[data-pane]', el);
      const draw = (t) => { setQuery('/payroll', { month, tab: t }); if (t === 'run') drawRun(); else if (t === 'settings') drawSettings(); else drawHistory(); };
      PP.ui.tabs($('[data-tabs]', el), { tabs: [{ id: 'run', label: `Monthly payroll · ${PP.fmt.month(month)}` }, { id: 'settings', label: 'Salary settings' }, { id: 'history', label: 'Payroll history', count: PP.db.payrollRuns.length }], active: tab, onChange: draw });

      function drawRun() {
        const run = PP.db.payrollRuns.find((r) => r.month === month);
        if (!run) {
          const lines = runLinesFromProfiles(); const future = month > thisMonth;
          const t = runTotals({ lines });
          const notSet = staffList().filter((s) => !profileOf(s.id));
          const commOnly = staffList().filter((s) => (profileOf(s.id) || {}).commissionOnly);
          pane.innerHTML = `<div class="card-body"><div class="row between"><div><h3 class="mod-h3">No payroll for ${esc(PP.fmt.month(month))} yet</h3><div class="small muted">Preview from salary settings: ${lines.length} staff · gross ${money(t.gross)} · net ${money(t.net)}.</div></div>
            <button class="btn btn-primary" data-create ${future || !lines.length ? 'disabled' : ''}>${PP.icon('plus')} Create draft payroll</button></div>
            ${future ? `<div class="mt-3">${PP.ui.alert('warning', 'You cannot run payroll for a future month.')}</div>` : ''}
            ${notSet.length ? `<div class="mt-3">${PP.ui.alert('warning', `No salary settings for: ${notSet.map((s) => esc(s.name)).join(', ')}. They are left out. <a href="#/payroll?month=${esc(month)}&tab=settings">Set salaries</a>.`)}</div>` : ''}
            ${commOnly.length ? `<div class="small muted mt-3">Commission only (not in payroll): ${commOnly.map((s) => esc(s.name)).join(', ')}.</div>` : ''}</div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Staff</th><th>Branch</th><th class="right">Basic</th><th class="right">Allowances</th><th class="right">Deductions</th><th class="right">Net</th></tr></thead><tbody>${lines.map((l) => { const x = lineTotals(l); return `<tr><td><b>${esc(l.name)}</b><span class="sub">${esc(l.role)} · ${esc(kindLabel(l.kind))}</span></td><td>${esc(branchShort(l.branchId))}</td><td class="right mono">${money(l.basic)}</td><td class="right mono">${money(x.allow)}</td><td class="right mono">${money(x.ded)}</td><td class="right mono"><b>${money(x.net)}</b></td></tr>`; }).join('') || `<tr><td colspan="6">${PP.ui.empty({ icon: 'users', title: 'No salaried staff', text: 'Set salaries under Salary settings.' })}</td></tr>`}</tbody></table></div>`;
          const b = $('[data-create]', pane);
          if (b) b.addEventListener('click', () => PP.ui.busy(b, () => {
            const r = { id: `PRL-${month}`, month, status: 'Draft', lines: runLinesFromProfiles(), createdBy: user().id, createdAt: PP.nowStamp(), approvedBy: null, approvedAt: null, paidAt: null, paidOn: null, expenseIds: [] };
            PP.db.payrollRuns.push(r); PP.audit('Payroll draft created', r.id, `${r.lines.length} staff · ${money(runTotals(r).net)}`); PP.save();
            PP.ui.toast(`Draft payroll for ${esc(PP.fmt.month(month))} created. Review it, then approve.`); drawRun();
          }));
          return;
        }
        const t = runTotals(run); const st = run.status; const idx = ['Draft', 'Approved', 'Paid'].indexOf(st);
        pane.innerHTML = `<div class="card-body">
            <div class="row between"><div class="stepper">${['Draft', 'Approved', 'Paid'].map((s, i) => `<div class="step ${i < idx || st === 'Paid' ? 'done' : ''} ${i === idx && st !== 'Paid' ? 'active' : ''}"><span class="num">${i < idx || st === 'Paid' ? '✓' : i + 1}</span>${s}</div>${i < 2 ? '<div class="line"></div>' : ''}`).join('')}</div>
              <div class="row">${st === 'Draft' ? '<button class="btn btn-ghost" data-recalc>Reload from settings</button><button class="btn btn-danger" data-del>Delete draft</button><button class="btn btn-primary" data-approve>Approve payroll</button>' : ''}${st === 'Approved' ? '<button class="btn" data-back>Return to draft</button><button class="btn btn-primary" data-pay>Mark as paid</button>' : ''}<button class="btn" data-csv>${PP.icon('download')} Export</button></div></div>
            <div class="grid grid-4 mt-4">${PP.ui.kpi({ label: 'Staff', value: run.lines.length, icon: 'users', tone: 'info' })}${PP.ui.kpi({ label: 'Gross', value: money(t.gross), hint: `Basic ${money(t.basic)} + allowances ${money(t.allow)}`, icon: 'banknote', tone: 'lavender' })}${PP.ui.kpi({ label: 'Deductions', value: money(t.ded), icon: 'arrowDown', tone: 'warning' })}${PP.ui.kpi({ label: 'Net payable', value: money(t.net), hint: RUN_TONE[st] ? st : '', icon: 'wallet', tone: 'positive' })}</div>
            <div class="small muted mt-3">${esc(run.id)} · created by ${esc(userName(run.createdBy))} ${PP.fmt.stamp(run.createdAt)}${run.approvedAt ? ` · approved by ${esc(userName(run.approvedBy))} ${PP.fmt.stamp(run.approvedAt)}` : ''}${run.paidAt ? ` · paid ${PP.fmt.date(run.paidOn)} by ${esc(userName(run.paidBy))}` : ''}</div>
            ${st === 'Paid' ? `<div class="mt-3">${PP.ui.alert('positive', `Paid. ${run.expenseIds.length} salary expense(s) recorded under <b>Salaries</b> in <a href="#/finance">Income & Expenses</a>. A paid payroll cannot be changed; correct mistakes with an expense reversal in Finance.`)}</div>` : ''}
          </div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Staff</th><th>Branch</th><th class="right">Basic</th><th class="right">Allowances</th><th class="right">Deductions</th><th class="right">Net</th><th></th></tr></thead><tbody>
            ${run.lines.map((l, i) => { const x = lineTotals(l); return `<tr><td><b>${esc(l.name)}</b><span class="sub">${esc(l.role)} · ${esc(kindLabel(l.kind))}${l.note ? ' · ' + esc(l.note) : ''}</span></td><td>${esc(branchShort(l.branchId))}</td><td class="right mono">${money(l.basic)}</td><td class="right mono">${money(x.allow)}</td><td class="right mono">${money(x.ded)}</td><td class="right mono"><b>${money(x.net)}</b></td><td><span class="row-actions">${st === 'Draft' ? `<button class="btn btn-sm btn-ghost" data-edit="${i}">Edit</button><button class="btn btn-sm btn-ghost" data-rm="${i}" aria-label="Remove ${esc(l.name)}">${PP.icon('x')}</button>` : ''}<button class="btn btn-sm btn-ghost" data-slip="${i}">${PP.icon('file')} Payslip</button></span></td></tr>`; }).join('') || `<tr><td colspan="7">${PP.ui.empty({ icon: 'users', title: 'No staff in this payroll' })}</td></tr>`}
          </tbody><tfoot><tr><td colspan="2">Total</td><td class="right mono">${money(t.basic)}</td><td class="right mono">${money(t.allow)}</td><td class="right mono">${money(t.ded)}</td><td class="right mono">${money(t.net)}</td><td></td></tr></tfoot></table></div>`;
        const on = (sel, fn) => { const b = $(sel, pane); if (b) b.addEventListener('click', () => fn(b)); };
        $$('[data-slip]', pane).forEach((b) => b.addEventListener('click', () => payslipModal(run, run.lines[Number(b.dataset.slip)])));
        $$('[data-edit]', pane).forEach((b) => b.addEventListener('click', () => { const l = run.lines[Number(b.dataset.edit)]; salaryEditor(`Edit ${esc(l.name)} · ${esc(PP.fmt.month(month))}`, l, { note: true }, (d) => { Object.assign(l, { basic: d.basic, allowances: d.allowances, deductions: d.deductions, note: d.note, method: d.method }); PP.save(); PP.ui.toast(`${esc(l.name)} updated for this month only`); drawRun(); }); }));
        $$('[data-rm]', pane).forEach((b) => b.addEventListener('click', async () => { const l = run.lines[Number(b.dataset.rm)]; if (!(await PP.ui.confirm({ title: 'Remove from this payroll?', message: `${esc(l.name)} will not be paid in ${esc(PP.fmt.month(month))}. Salary settings are not changed.`, confirmLabel: 'Remove', danger: true }))) return; run.lines.splice(Number(b.dataset.rm), 1); PP.save(); PP.ui.toast('Removed from payroll'); drawRun(); }));
        on('[data-recalc]', async () => { if (!(await PP.ui.confirm({ title: 'Reload from salary settings?', message: 'Monthly edits to this draft are replaced with the current salary settings.', confirmLabel: 'Reload' }))) return; run.lines = runLinesFromProfiles(); PP.save(); PP.ui.toast('Draft reloaded from salary settings'); drawRun(); });
        on('[data-del]', async () => { if (!(await PP.ui.confirm({ title: 'Delete this draft?', message: 'The draft payroll is removed. Nothing has been paid.', confirmLabel: 'Delete draft', danger: true }))) return; PP.db.payrollRuns = PP.db.payrollRuns.filter((r) => r !== run); PP.audit('Payroll draft deleted', run.id, ''); PP.save(); PP.ui.toast('Draft deleted'); drawRun(); });
        on('[data-approve]', async () => {
          if (!run.lines.length) { PP.ui.toast('Add at least one staff member before approving.', 'error'); return; }
          if (!PP.can('payroll.approve')) { PP.ui.toast('Your role cannot approve payroll.', 'error'); return; }
          { const mc = PP.makerChecker(run.createdBy, 'payroll'); if (mc) { PP.ui.toast(mc, 'error', 4200); return; } }
          if (!(await PP.ui.confirm({ title: `Approve payroll for ${esc(PP.fmt.month(month))}?`, message: `${run.lines.length} staff · net ${money(t.net)}. Approval locks the amounts. Paying is a separate step.`, confirmLabel: 'Approve' }))) return;
          run.status = 'Approved'; run.approvedBy = user().id; run.approvedAt = PP.nowStamp(); PP.audit('Payroll approved', run.id, `${run.lines.length} staff · ${money(t.net)}`); PP.save(); PP.ui.toast('Payroll approved. Mark it as paid once salaries are transferred.'); drawRun();
        });
        on('[data-back]', async () => { const r = await PP.ui.confirm({ title: 'Return to draft?', message: 'The approval is removed so the amounts can be changed.', confirmLabel: 'Return to draft', reasonLabel: 'Reason', reasonRequired: true }); if (!r) return; run.status = 'Draft'; run.approvedBy = null; run.approvedAt = null; PP.audit('Payroll returned to draft', run.id, r.reason); PP.save(); PP.ui.toast('Payroll returned to draft', 'info'); drawRun(); });
        on('[data-pay]', () => formModal({
          title: `Mark ${esc(PP.fmt.month(month))} payroll as paid`, submitLabel: `Mark paid · ${money(t.net)}`,
          body: `<div class="full">${PP.ui.alert('info', `This records <b>${run.lines.length}</b> salary expense(s) totalling <b>${money(t.net)}</b> under the category <b>Salaries</b> (D-023), one per person and branch. Commissions are not included (D-026).`)}</div>`
            + F({ name: 'date', label: 'Payment date', type: 'date', required: true, value: PP.today(), max: PP.today() })
            + F({ name: 'method', label: 'Default method', type: 'select', options: ['Per staff setting', ...PAY_METHODS], value: 'Per staff setting', placeholder: false }),
          onSubmit: (d) => {
            run.lines.forEach((l) => { const x = lineTotals(l); if (x.net <= 0) return; const exp = { id: PP.nextId('EXP'), date: d.date, categoryId: 'CAT-E-SAL', amount: x.net, branchId: l.branchId, method: d.method === 'Per staff setting' ? (l.method || 'Bank transfer') : d.method, paymentStatus: 'Paid', note: `Salary ${PP.fmt.month(month)} · ${l.name}`, createdBy: user().id, reversalOf: null, source: { type: 'payroll', id: run.id, staffId: l.staffId } }; PP.db.expenses.push(exp); run.expenseIds.push(exp.id); });
            run.status = 'Paid'; run.paidAt = PP.nowStamp(); run.paidOn = d.date; run.paidBy = user().id;
            PP.audit('Payroll paid', run.id, `${run.expenseIds.length} salary expenses · ${money(t.net)}`); PP.save();
            PP.ui.toast(`Payroll paid. ${run.expenseIds.length} salary expenses recorded in Income & Expenses.`); drawRun();
          },
        }));
        on('[data-csv]', () => { PP.downloadCsv(`payroll-${month}.csv`, [['Staff ID', 'Name', 'Role', 'Branch', 'Basic', 'Allowances', 'Deductions', 'Net', 'Note'], ...run.lines.map((l) => { const x = lineTotals(l); return [l.staffId, l.name, l.role, PP.branchName(l.branchId), l.basic, x.allow, x.ded, x.net, l.note]; })]); PP.ui.toast(`Exported ${run.lines.length} rows to CSV`); });
      }

      function drawSettings() {
        pane.innerHTML = '<div class="card-body"><div class="small muted">Salary settings are the default for each new monthly payroll. Changing them does not alter payrolls already created. Commission-only professionals are paid through Commissions.</div></div><div data-st></div>';
        PP.ui.table($('[data-st]', pane), {
          getRows: staffList, exportName: 'salary-settings',
          search: { placeholder: 'Search staff…', text: (r) => `${r.name} ${r.role}` },
          filters: [{ id: 'k', label: 'Staff and professionals', options: [['staff', 'Staff'], ['professional', PP.t('professionals')]], match: (r, v) => r.kind === v }, { id: 't', label: 'Any pay type', options: [['salary', 'Salaried'], ['commission', 'Commission only'], ['none', 'Not set']], match: (r, v) => { const p = profileOf(r.id); return v === 'none' ? !p : v === 'commission' ? !!(p && p.commissionOnly) : !!(p && !p.commissionOnly); } }],
          columns: [
            { key: 'name', label: 'Staff', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.role)} · ${esc(kindLabel(r.kind))}</span>`, exportValue: (r) => r.name },
            { key: 'br', label: 'Branch', render: (r) => esc(branchShort(r.branchId)) },
            { key: 'type', label: 'Pay type', render: (r) => { const p = profileOf(r.id); return !p ? PP.ui.badge('Not set', 'warning') : p.commissionOnly ? PP.ui.badge('Commission only', 'lavender') : PP.ui.badge('Salaried', 'positive'); }, exportValue: (r) => { const p = profileOf(r.id); return !p ? 'Not set' : p.commissionOnly ? 'Commission only' : 'Salaried'; } },
            { key: 'basic', label: 'Basic', align: 'right', sort: (r) => (profileOf(r.id) || {}).basic || 0, render: (r) => money((profileOf(r.id) || {}).basic || 0) },
            { key: 'al', label: 'Allowances', align: 'right', render: (r) => money(lineTotals(profileOf(r.id) || {}).allow) },
            { key: 'de', label: 'Deductions', align: 'right', render: (r) => money(lineTotals(profileOf(r.id) || {}).ded) },
            { key: 'net', label: 'Net / month', align: 'right', sort: (r) => lineTotals(profileOf(r.id) || {}).net, render: (r) => `<b>${money(lineTotals(profileOf(r.id) || {}).net)}</b>` },
            { key: 'act', label: '', render: (r) => `<button class="btn btn-sm btn-ghost" data-sal="${esc(r.id)}">${PP.icon('edit')} Edit</button>`, exportValue: () => '' },
          ],
          afterDraw: (c) => $$('[data-sal]', c).forEach((b) => b.addEventListener('click', () => {
            const s = staffList().find((x) => x.id === b.dataset.sal); const p = profileOf(s.id) || { staffId: s.id, basic: 0, allowances: [], deductions: [], method: 'Bank transfer', commissionOnly: false };
            salaryEditor(`Salary settings · ${esc(s.name)}`, p, { profile: true }, (d) => {
              const rec = profileOf(s.id) || (() => { const n = { id: s.id, staffId: s.id }; PP.db.salaryProfiles.push(n); return n; })();
              const before = lineTotals(rec).net;
              Object.assign(rec, { basic: d.commissionOnly ? 0 : d.basic, allowances: d.commissionOnly ? [] : d.allowances, deductions: d.commissionOnly ? [] : d.deductions, method: d.method, commissionOnly: !!d.commissionOnly, effectiveFrom: d.effectiveFrom, updatedAt: PP.nowStamp() });
              PP.audit('Salary settings changed', s.id, `${s.name}: net ${money(before)} → ${money(lineTotals(rec).net)}${rec.commissionOnly ? ' (commission only)' : ''}`); PP.save();
              PP.ui.toast(`Salary settings for ${esc(s.name)} saved`); drawSettings();
            });
          })),
        });
      }

      function drawHistory() {
        pane.innerHTML = '<div data-h></div>';
        PP.ui.table($('[data-h]', pane), {
          getRows: () => PP.db.payrollRuns.slice().sort((a, b) => b.month.localeCompare(a.month)), exportName: 'payroll-history',
          filters: [{ id: 's', label: 'Any status', options: [['Draft', 'Draft'], ['Approved', 'Approved'], ['Paid', 'Paid']], match: (r, v) => r.status === v }],
          columns: [
            { key: 'month', label: 'Month', sort: (r) => r.month, render: (r) => `<b>${esc(PP.fmt.month(r.month))}</b><span class="sub">${esc(r.id)}</span>` },
            { key: 'status', label: 'Status', render: (r) => PP.ui.badge(r.status, RUN_TONE[r.status]) },
            { key: 'staff', label: 'Staff', align: 'right', render: (r) => r.lines.length },
            { key: 'net', label: 'Net paid / payable', align: 'right', sort: (r) => runTotals(r).net, render: (r) => money(runTotals(r).net) },
            { key: 'appr', label: 'Approved', render: (r) => (r.approvedAt ? `${esc(userName(r.approvedBy))}<span class="sub">${PP.fmt.stamp(r.approvedAt)}</span>` : '—') },
            { key: 'paid', label: 'Paid', render: (r) => (r.paidOn ? `${PP.fmt.date(r.paidOn)}<span class="sub">${r.expenseIds.length} expense(s)</span>` : '—') },
          ],
          onRowClick: (r) => PP.go(`#/payroll?month=${r.month}&tab=run`),
          empty: { icon: 'banknote', title: 'No payroll runs yet', text: 'Create the first monthly payroll from the Monthly payroll tab.' },
        });
      }
      draw(tab);
    },
  });

  /* ================================================================ LAB & DIAGNOSTICS */
  const LAB_FLOW = ['Ordered', 'Sample collected', 'Processing', 'Result ready', 'Delivered'];
  const LAB_TONE = { Ordered: 'warning', 'Sample collected': 'info', Processing: 'lavender', 'Result ready': 'positive', Delivered: 'neutral', Cancelled: 'error' };
  const LAB_CATS = ['Haematology', 'Biochemistry', 'Immunology', 'Hormone', 'Clinical pathology', 'Serology', 'Microbiology', 'Imaging'];
  const SAMPLE_TYPES = ['Blood (EDTA)', 'Blood (serum)', 'Blood (fluoride)', 'Urine', 'Stool', 'Swab', 'None (imaging)'];
  // clinical.diagnosis_codes: a small, fictional pick list of ICD-10 codes for the prototype.
  const ICD10 = [['M54.5', 'Low back pain'], ['M17.1', 'Primary osteoarthritis of knee'], ['M75.0', 'Adhesive capsulitis of shoulder'], ['M06.9', 'Rheumatoid arthritis, unspecified'], ['M10.9', 'Gout, unspecified'], ['M79.7', 'Fibromyalgia'], ['E11.9', 'Type 2 diabetes without complications'], ['E55.9', 'Vitamin D deficiency, unspecified'], ['I10', 'Essential (primary) hypertension'], ['S83.5', 'Sprain of cruciate ligament of knee'], ['G56.0', 'Carpal tunnel syndrome'], ['Z01.7', 'Laboratory examination']];
  const icdLabel = (code) => { const x = ICD10.find((i) => i[0] === code); return x ? `${x[0]} · ${x[1]}` : code || '—'; };
  const labTest = (id) => byId('labTests', id);
  const labTestName = (id) => { const t = labTest(id); return t ? t.name : id; };
  const comText = (t) => (Number(t.commissionValue) ? (t.commissionType === 'fixed' ? `${money(t.commissionValue)} / test` : `${t.commissionValue}%`) : 'None');
  const isOverdue = (o) => ['Ordered', 'Sample collected', 'Processing'].includes(o.status) && Date.now() > stampMs(o.due);
  const orderTotal = (o) => PP.sum(o.tests, (t) => (labTest(t) || {}).price || 0);
  function refText(p) {
    if (p.low == null && p.high == null) return p.normal ? `Normal: ${esc(p.normal)}` : '—';
    if (p.low != null && p.high != null) return `${p.low} – ${p.high}`;
    return p.high != null ? `≤ ${p.high}` : `≥ ${p.low}`;
  }
  function flagOf(p, v) {
    if (v === '' || v == null) return '';
    if (p.low == null && p.high == null) return p.normal && String(v).trim().toLowerCase() !== p.normal.toLowerCase() ? 'Abnormal' : '';
    const n = Number(v); if (isNaN(n)) return '';
    if (p.low != null && n < p.low) return 'Low';
    if (p.high != null && n > p.high) return 'High';
    return 'Normal';
  }
  const flagHtml = (f) => (!f ? '' : f === 'Normal' ? '<span class="mod-flag ok">Normal</span>' : `<span class="mod-flag ${f === 'Low' ? 'low' : 'high'}">${f === 'Abnormal' ? 'Abnormal' : f === 'High' ? '▲ High' : '▼ Low'}</span>`);
  function barcodeSvg(text) {
    let x = 4; let bars = ''; const s = `*${text}*`;
    for (const ch of s) { const c = ch.charCodeAt(0); for (let i = 0; i < 7; i++) { const w = (c >> i) & 1 ? 2.6 : 1.2; if (i % 2 === 0) bars += `<rect x="${x.toFixed(1)}" y="0" width="${w}" height="40"/>`; x += w + 0.9; } x += 1.8; }
    return `<svg class="mod-barcode" viewBox="0 0 ${(x + 4).toFixed(1)} 40" preserveAspectRatio="none" role="img" aria-label="Sample barcode ${esc(text)}"><g fill="currentColor">${bars}</g></svg>`;
  }
  const addHistory = (o, status, note) => { o.history = o.history || []; o.history.push({ at: PP.nowStamp(), status, by: user().name || 'User', note: note || '' }); };

  function newOrderModal(prefillPatient) {
    ensure();
    const me = user(); const tests = PP.db.labTests.filter((t) => t.status === 'Active');
    const cats = [...new Set(tests.map((t) => t.category))];
    const p0 = prefillPatient ? PP.find.patient(prefillPatient) : null;
    const defaultPro = me.professionalId || (p0 && p0.assignedProfessionalId) || '';
    formModal({
      title: 'New lab order', size: 'lg', submitLabel: 'Create order',
      body: patientPickerHtml('patientId', 'Patient', p0 ? p0.id : '', true)
        + F({ name: 'professionalId', label: `Ordering ${PP.tl('professional')}`, type: 'select', required: true, options: proOptions(), value: defaultPro })
        + F({ name: 'priority', label: 'Priority', type: 'select', options: [['Routine', 'Routine'], ['Urgent', 'Urgent (half turnaround)']], value: 'Routine', placeholder: false })
        + `<div class="field full" data-field="tests"><label>Tests<span class="req" aria-hidden="true">*</span></label>
            <div class="input-icon">${PP.icon('search')}<input class="input" type="search" data-tq placeholder="Filter tests…" aria-label="Filter tests"></div>
            <div class="mod-testlist">${cats.map((c) => `<div class="mod-testcat" data-cat><div class="mod-testcat-h">${esc(c)}</div>${tests.filter((t) => t.category === c).map((t) => `<label class="mod-testopt" data-topt="${esc((t.name + ' ' + t.code).toLowerCase())}"><input type="checkbox" data-test="${esc(t.id)}"><span class="grow">${esc(t.name)}<span class="sub">${esc(t.sampleType)} · ${t.tatHours} h</span></span><span class="mono">${money(t.price)}</span></label>`).join('')}</div>`).join('')}</div>
            <div class="error" role="alert">Choose at least one test.</div></div>`
        + F({ name: 'diagnosisCode', label: 'Clinical indication (ICD-10, optional)', type: 'select', options: ICD10.map(([c, l]) => [c, `${c} · ${l}`]), placeholder: 'Not coded' })
        + F({ name: 'notes', label: 'Notes for the lab', type: 'textarea', rows: 2, placeholder: 'e.g. Patient fasting since 10 PM' })
        + F({ name: 'discount', label: 'ছাড় / Discount (BDT)', type: 'number', min: 0, step: 10, rule: 'nonneg', value: 0, hint: 'ডাক্তার যদি রোগীর জন্য ছাড় লিখে দেন। কমিশন আদায় হওয়া টাকার উপর, তাই ছাড় দিলে কমিশনও সেই অনুপাতে কমে।' })
        + F({ name: 'discountReason', label: 'ছাড়ের কারণ', placeholder: 'যেমন: অসচ্ছল রোগী — ডাক্তারের লেখা' })
        + (PP.can('billing.manage') ? F({ name: 'bill', label: 'Open the invoice for these tests after saving', type: 'checkbox', value: false, full: true, hint: 'The invoice gets one line per test, the discount and the ordering professional (commission per test, D-034).' }) : '')
        + '<div class="full mod-total" data-ltotal></div>',
      onOpen: (form) => {
        bindPatientPicker(form, (p) => { const sel = $('[name=professionalId]', form); if (p && !sel.value && p.assignedProfessionalId) sel.value = p.assignedProfessionalId; });
        const upd = () => {
          const ids = $$('[data-test]:checked', form).map((x) => x.dataset.test);
          const tot = PP.sum(ids, (id) => labTest(id).price); const tat = ids.length ? Math.max(...ids.map((id) => labTest(id).tatHours)) : 0;
          const urgent = $('[name=priority]', form).value === 'Urgent'; const hrs = ids.length ? Math.max(2, urgent ? tat / 2 : tat) : 0;
          $('[data-ltotal]', form).innerHTML = ids.length ? `<div class="mod-sum-row"><span>${ids.length} test(s) · results due in about ${hrs} h</span><b class="mono">${money(tot)}</b></div>` : '<span class="small muted">No tests selected.</span>';
          if (ids.length) $('[data-field="tests"]', form).classList.remove('has-error');
        };
        form.addEventListener('change', upd);
        $('[data-tq]', form).addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); $$('[data-topt]', form).forEach((o) => o.classList.toggle('hidden', !!q && !o.dataset.topt.includes(q))); $$('[data-cat]', form).forEach((c) => c.classList.toggle('hidden', !$$('[data-topt]:not(.hidden)', c).length)); });
        upd();
      },
      onSubmit: (d, form) => {
        const ids = $$('[data-test]:checked', form).map((x) => x.dataset.test);
        if (!ids.length) { PP.form.setError(form, 'tests', 'Choose at least one test.'); return false; }
        if (readOnlyLicence()) { PP.ui.toast('Licence is read-only: new entries are paused (D-017).', 'error'); return false; }
        const pt = PP.find.patient(d.patientId);
        const gross0 = PP.sum(ids, (id) => labTest(id).price);
        if (Number(d.discount) > gross0) { PP.form.setError(form, 'discount', `The discount cannot be more than the test total (${money(gross0)}).`); return false; }
        if (Number(d.discount) > 0 && !String(d.discountReason || '').trim()) { PP.form.setError(form, 'discountReason', 'Write why the discount is given.'); return false; }
        const tat = Math.max(...ids.map((id) => labTest(id).tatHours));
        const o = { id: PP.nextId('LAB'), patientId: pt.id, professionalId: d.professionalId, branchId: PP.activeBranchId() !== 'ALL' ? PP.activeBranchId() : pt.branchId || defaultBranch(), tests: ids, priority: d.priority, diagnosisCode: d.diagnosisCode, notes: d.notes, orderedAt: PP.nowStamp(), orderedBy: user().id, due: fromNow(Math.max(2, d.priority === 'Urgent' ? tat / 2 : tat) * 3600e3), status: 'Ordered', sampleId: '', sampleType: '', collectedAt: null, collectedBy: '', processingAt: null, results: {}, enteredBy: null, verifiedBy: null, verifiedAt: null, deliveredAt: null, deliveryMethod: '', invoiceId: null, history: [] };
        o.discount = r2(Number(d.discount) || 0); o.discountReason = String(d.discountReason || '').trim(); o.invoiceId = null;
        addHistory(o, 'Ordered', `${ids.length} test(s) ordered by ${PP.proName(d.professionalId)}${o.discount ? ` · discount ${money(o.discount)} (${o.discountReason})` : ''}`);
        PP.db.labOrders.push(o); PP.audit('Lab order created', o.id, `${pt.name} · ${ids.map(labTestName).join(', ')}`); PP.save();
        PP.ui.toast(`Lab order ${esc(o.id)} created for ${esc(pt.name)}.${d.bill ? ' Opening a new invoice…' : ''}`);
        PP.go(d.bill ? `#/billing/new?lab=${encodeURIComponent(o.id)}` : `#/lab/orders/${o.id}`);
      },
    });
  }

  PP.route('/lab', {
    title: 'Lab Orders', perm: 'lab.manage',
    render({ el, query }) {
      ensure();
      const orders = () => PP.db.labOrders.filter((o) => PP.inBranch(o)).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
      const all = orders();
      const cnt = (fn) => all.filter(fn).length;
      el.innerHTML = PP.ui.pageHead({
        title: 'Lab Orders', crumbs: [['Lab & Diagnostics'], ['Lab Orders']],
        subtitle: 'Order tests, collect samples, enter and verify results, then deliver the report.',
        actions: `<a class="btn" href="#/lab/tests">${PP.icon('clipboard')} Test catalogue</a><button class="btn btn-primary" data-new>${PP.icon('plus')} New lab order</button>`,
      }) + `<div class="grid grid-4">
          ${PP.ui.kpi({ label: 'Awaiting sample', value: cnt((o) => o.status === 'Ordered'), hint: 'Ordered, not yet collected', icon: 'clock', tone: 'warning' })}
          ${PP.ui.kpi({ label: 'In the lab', value: cnt((o) => o.status === 'Sample collected' || o.status === 'Processing'), hint: 'Collected or processing', icon: 'activity', tone: 'lavender' })}
          ${PP.ui.kpi({ label: 'Ready to deliver', value: cnt((o) => o.status === 'Result ready'), hint: 'Verified results', icon: 'checkCircle', tone: 'positive' })}
          ${PP.ui.kpi({ label: 'Overdue', value: cnt(isOverdue), hint: 'Past the due time', icon: 'alert', tone: cnt(isOverdue) ? 'error' : 'info' })}
        </div><div class="card mt-4" data-tbl></div>`;
      PP.ui.table($('[data-tbl]', el), {
        getRows: orders, exportName: 'lab-orders',
        search: { placeholder: 'Search order ID, patient, test or sample ID…', text: (r) => `${r.id} ${PP.patientName(r.patientId)} ${r.patientId} ${r.tests.map(labTestName).join(' ')} ${r.sampleId}` },
        filters: [
          { id: 's', label: 'Any status', options: [...LAB_FLOW, 'Cancelled'].map((s) => [s, s]).concat([['open', 'Open (not delivered)'], ['overdue', 'Overdue']]), match: (r, v) => (v === 'open' ? !['Delivered', 'Cancelled'].includes(r.status) : v === 'overdue' ? isOverdue(r) : r.status === v) },
          { id: 'p', label: 'Any priority', options: [['Routine', 'Routine'], ['Urgent', 'Urgent']], match: (r, v) => r.priority === v },
          { id: 'pro', label: `Any ${PP.tl('professional')}`, options: proOptions(), match: (r, v) => r.professionalId === v },
        ],
        rowClass: (r) => (isOverdue(r) ? 'mod-row-out' : ''),
        columns: [
          { key: 'id', label: 'Order', sort: (r) => r.orderedAt, render: (r) => `<a href="#/lab/orders/${esc(r.id)}"><b>${esc(r.id)}</b></a><span class="sub">${PP.fmt.stamp(r.orderedAt)}</span>`, exportValue: (r) => r.id },
          { key: 'pt', label: 'Patient', sort: (r) => PP.patientName(r.patientId), render: (r) => `${patLink(r.patientId)}<span class="sub">${esc(r.patientId)}</span>`, exportValue: (r) => PP.patientName(r.patientId) },
          { key: 'tests', label: 'Tests', render: (r) => `<span class="mod-clamp">${esc(r.tests.map(labTestName).join(', '))}</span><span class="sub">${r.tests.length} test(s) · ${money(orderTotal(r))}</span>`, exportValue: (r) => r.tests.map(labTestName).join('; ') },
          { key: 'pro', label: 'Ordered by', render: (r) => esc(PP.proName(r.professionalId)), exportValue: (r) => PP.proName(r.professionalId) },
          { key: 'pri', label: 'Priority', sort: (r) => r.priority, render: (r) => PP.ui.badge(r.priority, r.priority === 'Urgent' ? 'error' : 'neutral'), exportValue: (r) => r.priority },
          { key: 'st', label: 'Status', sort: (r) => LAB_FLOW.indexOf(r.status), render: (r) => PP.ui.badge(r.status, LAB_TONE[r.status]), exportValue: (r) => r.status },
          { key: 'due', label: 'Due', sort: (r) => r.due, render: (r) => (['Delivered', 'Cancelled', 'Result ready'].includes(r.status) ? `<span class="muted small">${PP.fmt.stamp(r.due)}</span>` : `<span class="${isOverdue(r) ? 'mod-neg' : ''}">${PP.fmt.stamp(r.due)}</span>${isOverdue(r) ? '<span class="sub mod-neg">Overdue</span>' : ''}`), exportValue: (r) => r.due },
        ],
        onRowClick: (r) => PP.go(`#/lab/orders/${r.id}`),
        empty: { icon: 'activity', title: 'No lab orders yet', text: 'Create an order from here or from a patient visit.', action: '<button class="btn btn-primary" data-new>New lab order</button>' },
      });
      const root = document.createElement('div'); while (el.firstChild) root.appendChild(el.firstChild); el.appendChild(root);
      root.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) newOrderModal(''); });
      if (query.patient || query.new) { setQuery('/lab', {}); newOrderModal(query.patient || ''); }
    },
  });

  function testModal(test, done) {
    const isNew = !test; const t = test || { params: [{ name: '', unit: '', low: null, high: null, normal: '' }] };
    const prow = (p, i) => `<div class="mod-param" data-param><div class="field"><input class="input" name="pn-${i}" value="${esc(p.name || '')}" placeholder="Parameter" aria-label="Parameter name"><div class="error"></div></div><div class="field"><input class="input" name="pu-${i}" value="${esc(p.unit || '')}" placeholder="Unit" aria-label="Unit"></div><div class="field"><input class="input" type="number" step="any" name="pl-${i}" value="${p.low != null ? esc(p.low) : ''}" placeholder="Low" aria-label="Reference low"></div><div class="field"><input class="input" type="number" step="any" name="ph-${i}" value="${p.high != null ? esc(p.high) : ''}" placeholder="High" aria-label="Reference high"><div class="error"></div></div><div class="field"><input class="input" name="pnorm-${i}" value="${esc(p.normal || '')}" placeholder="Normal text (e.g. Nil)" aria-label="Normal text result"></div><button type="button" class="btn btn-icon btn-ghost" data-delp aria-label="Remove parameter">${PP.icon('x')}</button></div>`;
    formModal({
      title: isNew ? 'Add lab test' : `Edit test · ${esc(t.name)}`, size: 'lg', submitLabel: isNew ? 'Add test' : 'Save changes',
      body: F({ name: 'name', label: 'Test name', required: true, value: t.name, full: true })
        + F({ name: 'code', label: 'Code', required: true, value: t.code, placeholder: 'e.g. CBC' })
        + F({ name: 'category', label: 'Category', type: 'select', required: true, options: LAB_CATS, value: t.category })
        + F({ name: 'sampleType', label: 'Sample type', type: 'select', required: true, options: SAMPLE_TYPES, value: t.sampleType })
        + F({ name: 'tatHours', label: 'Turnaround (hours)', type: 'number', required: true, rule: 'positive', min: 1, step: 1, value: t.tatHours })
        + F({ name: 'price', label: 'Price (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 1, value: t.price })
        + F({ name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], value: t.status || 'Active', placeholder: false })
        + (PP.can('commissions.manage') ? F({ name: 'commissionType', label: 'রেফারেল কমিশন (Referral commission)', type: 'select', placeholder: false, options: [['percent', '% of money received'], ['fixed', 'Fixed BDT per test']], value: t.commissionType || 'percent', hint: 'যে ডাক্তার/থেরাপিস্ট টেস্টটি অর্ডার করেন তিনি পাবেন; শুধু আদায় হওয়া টাকার উপর (D-025, D-034).' })
          + F({ name: 'commissionValue', label: 'Commission rate / amount', type: 'number', min: 0, step: 1, rule: 'nonneg', value: t.commissionValue || 0, hint: '0 দিলে এই টেস্টে কোনো কমিশন নেই।' }) : '')
        + `<div class="field full" data-field="params"><label>Parameters and reference ranges<span class="req">*</span></label><div class="hint">Leave Low and High empty for a text result. Values outside the range are flagged High or Low on the report.</div>
          <div class="mod-param mod-param-head" aria-hidden="true"><span>Parameter</span><span>Unit</span><span>Low</span><span>High</span><span>Normal text</span><span></span></div>
          <div data-params>${t.params.map(prow).join('')}</div><button type="button" class="btn btn-sm btn-ghost" data-addp>${PP.icon('plus')} Add parameter</button><div class="error" role="alert">Add at least one parameter.</div></div>`,
      onOpen: (form) => {
        const wrap = $('[data-params]', form);
        const bindDel = () => $$('[data-delp]', wrap).forEach((b) => { b.onclick = () => { if ($$('[data-param]', wrap).length > 1) b.closest('[data-param]').remove(); }; });
        $('[data-addp]', form).addEventListener('click', () => { wrap.insertAdjacentHTML('beforeend', prow({}, Date.now() % 100000)); bindDel(); });
        bindDel();
      },
      onSubmit: (d, form) => {
        const params = []; let ok = true;
        $$('[data-param]', form).forEach((row) => {
          if (row.classList.contains('mod-param-head')) return;
          const [n, u, l, h, nm] = $$('input', row).map((x) => x.value.trim());
          if (!n && !u && !l && !h && !nm) return;
          if (!n) { row.querySelector('.field').classList.add('has-error'); row.querySelector('.error').textContent = 'Name required.'; ok = false; return; }
          if (l !== '' && h !== '' && Number(l) >= Number(h)) { const f = row.querySelectorAll('.field')[3]; f.classList.add('has-error'); f.querySelector('.error').textContent = 'High must be above Low.'; ok = false; return; }
          params.push({ name: n, unit: u, low: num(l), high: num(h), normal: nm });
        });
        if (!ok) return false;
        if (!params.length) { PP.form.setError(form, 'params', 'Add at least one parameter.'); return false; }
        const dup = PP.db.labTests.find((x) => x.id !== t.id && x.code.toLowerCase() === d.code.toLowerCase());
        if (dup) { PP.form.setError(form, 'code', `Code already used by “${dup.name}”.`); return false; }
        const vals = { name: d.name, code: d.code.toUpperCase(), category: d.category, sampleType: d.sampleType, tatHours: Number(d.tatHours), price: r2(d.price), status: d.status, params };
        if (PP.can('commissions.manage')) {
          if (d.commissionType === 'percent' && Number(d.commissionValue) > 100) { PP.form.setError(form, 'commissionValue', 'A percentage cannot be more than 100.'); return false; }
          vals.commissionType = d.commissionType; vals.commissionValue = r2(Number(d.commissionValue) || 0);
          if (!isNew && (t.commissionType !== vals.commissionType || Number(t.commissionValue || 0) !== vals.commissionValue)) PP.audit('Lab commission changed', t.id, `${t.name}: ${comText(t)} → ${comText(vals)}`);
        }
        if (isNew) { const rec = Object.assign({ id: PP.nextId('LT', 2) }, vals); PP.db.labTests.push(rec); PP.audit('Lab test added', rec.id, rec.name); PP.ui.toast(`Test “${esc(rec.name)}” added to the catalogue`); }
        else { if (t.price !== vals.price) PP.audit('Lab test price changed', t.id, `${money(t.price)} → ${money(vals.price)}`); Object.assign(t, vals); PP.ui.toast('Test saved'); }
        PP.save(); if (done) done();
      },
    });
  }

  PP.route('/lab/tests', {
    title: 'Test Catalogue', perm: 'lab.manage',
    render({ el }) {
      ensure();
      const rerender = () => PP.render();
      el.innerHTML = PP.ui.pageHead({
        title: 'Test Catalogue', crumbs: [['Lab & Diagnostics', '#/lab'], ['Test Catalogue']], subtitle: 'Tests you offer, with sample type, turnaround time, price and reference ranges.',
        actions: `<a class="btn" href="#/lab">${PP.icon('activity')} Lab orders</a><button class="btn btn-primary" data-add>${PP.icon('plus')} Add test</button>`,
      }) + '<div class="card" data-tbl></div>';
      PP.ui.table($('[data-tbl]', el), {
        getRows: () => PP.db.labTests.slice().sort((a, b) => a.name.localeCompare(b.name)), exportName: 'lab-tests',
        search: { placeholder: 'Search test name or code…', text: (r) => `${r.name} ${r.code} ${r.category}` },
        filters: [{ id: 'c', label: 'All categories', options: [...new Set(PP.db.labTests.map((t) => t.category))].sort().map((c) => [c, c]), match: (r, v) => r.category === v }, { id: 's', label: 'Any status', options: [['Active', 'Active'], ['Inactive', 'Inactive']], match: (r, v) => r.status === v }],
        columns: [
          { key: 'name', label: 'Test', sort: (r) => r.name, render: (r) => `<b>${esc(r.name)}</b><span class="sub">${esc(r.code)}</span>`, exportValue: (r) => r.name },
          { key: 'cat', label: 'Category', sort: (r) => r.category, render: (r) => esc(r.category) },
          { key: 'sample', label: 'Sample type', render: (r) => esc(r.sampleType) },
          { key: 'tat', label: 'Turnaround', align: 'right', sort: (r) => r.tatHours, render: (r) => `${r.tatHours} h`, exportValue: (r) => r.tatHours },
          { key: 'price', label: 'Price', align: 'right', sort: (r) => r.price, render: (r) => money(r.price), exportValue: (r) => r.price },
          ...(PP.can('commissions.manage') ? [{ key: 'com', label: 'Commission', align: 'right', sort: (r) => Number(r.commissionValue) || 0, render: (r) => (Number(r.commissionValue) ? `<span class="badge lavender">${esc(comText(r))}</span>` : '<span class="muted small">None</span>'), exportValue: (r) => comText(r) }] : []),
          { key: 'ref', label: 'Reference range', render: (r) => (r.params.length === 1 ? `<span class="small">${refText(r.params[0])} ${esc(r.params[0].unit)}</span>` : `<span class="small">${r.params.length} parameters</span><span class="sub">${esc(r.params.map((p) => p.name).join(', '))}</span>`), exportValue: (r) => r.params.map((p) => `${p.name}: ${PP.stripHtml(refText(p))} ${p.unit}`).join('; ') },
          { key: 'st', label: 'Status', render: (r) => PP.ui.badge(r.status), exportValue: (r) => r.status },
          { key: 'act', label: '', render: (r) => `<button class="btn btn-sm btn-ghost" data-edit="${esc(r.id)}">${PP.icon('edit')} Edit</button>`, exportValue: () => '' },
        ],
        onRowClick: (r) => testModal(r, rerender),
        afterDraw: (c) => $$('[data-edit]', c).forEach((b) => b.addEventListener('click', () => testModal(byId('labTests', b.dataset.edit), rerender))),
        empty: { icon: 'clipboard', title: 'No tests in the catalogue', text: 'Add the tests your clinic or lab offers.' },
      });
      $('[data-add]', el).addEventListener('click', () => testModal(null, rerender));
    },
  });

  /** Demo referral-commission rates per test (D-034); the admin edits them in the Test Catalogue. */
  function labCommissionDefaults(db) {
    (db.labTests || []).forEach((t) => {
      if (t.commissionValue != null) return;
      if (t.category === 'Imaging') { t.commissionType = 'fixed'; t.commissionValue = 100; } else { t.commissionType = 'percent'; t.commissionValue = 10; }
    });
  }
  PP.registerSeed('lab-commission', (db) => labCommissionDefaults(db));
  PP.labReport = { html: (o) => labReportHtml(o), print: (o) => printDoc(labReportHtml(o)) };
  function labReportHtml(o) {
    const pt = PP.find.patient(o.patientId) || {};
    return `<div class="mod-sheet">${sheetHead('Laboratory report', `${esc(o.id)} · sample ${esc(o.sampleId || '—')}`)}
      <div class="mod-sheet-grid"><div><div class="small muted">Patient</div><b>${esc(pt.name || '—')}</b><div class="small">${esc(pt.id || '')} · ${esc(pt.gender || '')} · ${esc(PP.fmt.age(pt.dob))}</div></div>
      <div><div class="small muted">Referred by</div><b>${esc(PP.proName(o.professionalId))}</b><div class="small">${o.diagnosisCode ? esc(icdLabel(o.diagnosisCode)) : ''}</div></div>
      <div><div class="small muted">Collected / reported</div><b>${PP.fmt.stamp(o.collectedAt)}</b><div class="small">${o.verifiedAt ? 'Reported ' + PP.fmt.stamp(o.verifiedAt) : 'Not verified'}</div></div></div>
      ${o.tests.map((tid) => { const t = labTest(tid) || { name: tid, params: [] }; const r = (o.results || {})[tid] || { values: {} }; return `<h3 class="mod-sheet-h">${esc(t.name)}</h3><table class="mod-sheet-table"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead><tbody>${t.params.map((p) => { const v = (r.values || {})[p.name]; const f = flagOf(p, v); return `<tr><td>${esc(p.name)}</td><td><b>${esc(v || '—')}</b></td><td>${esc(p.unit)}</td><td>${refText(p)}</td><td>${f && f !== 'Normal' ? `<b>${esc(f)}</b>` : ''}</td></tr>`; }).join('')}</tbody></table>${r.comment ? `<p class="small"><b>Comment:</b> ${esc(r.comment)}</p>` : ''}`; }).join('')}
      <div class="mod-sign"><div>Verified by: ${o.verifiedBy ? esc(PP.proName(o.verifiedBy)) : '—'}</div><div>${o.verifiedAt ? PP.fmt.stamp(o.verifiedAt) : ''}</div><div></div></div>${sheetFoot()}</div>`;
  }

  function renderLabOrder({ params, el }) {
    ensure();
    const o = byId('labOrders', params.id);
    if (o && PP.denyBranch(el, o, 'lab order')) return;
    if (!o) { el.innerHTML = `<div class="card">${PP.ui.empty({ icon: 'alert', title: 'Lab order not found', text: `There is no lab order <code>${esc(params.id)}</code>.`, action: '<a class="btn btn-primary" href="#/lab">Back to lab orders</a>' })}</div>`; return; }
    const pt = PP.find.patient(o.patientId) || { name: '—', id: o.patientId };
    const step = LAB_FLOW.indexOf(o.status);
    const rerender = () => PP.render();
    const canBill = PP.can('billing.manage');
    el.innerHTML = PP.ui.pageHead({
      title: `Lab order ${esc(o.id)} ${PP.ui.badge(o.status, LAB_TONE[o.status])}${o.priority === 'Urgent' ? ' ' + PP.ui.badge('Urgent', 'error') : ''}`,
      crumbs: [['Lab & Diagnostics', '#/lab'], ['Lab Orders', '#/lab'], [o.id]],
      subtitle: `${patLink(pt.id)} · ${esc(pt.id)} · ordered by ${esc(PP.proName(o.professionalId))} · ${PP.fmt.stamp(o.orderedAt)}`,
      actions: `${['Result ready', 'Delivered'].includes(o.status) ? `<button class="btn" data-print>${PP.icon('printer')} Print report</button>` : ''}${o.invoiceId && PP.find.invoice(o.invoiceId) ? `<a class="btn" href="#/billing/${esc(o.invoiceId)}">${PP.icon('receipt')} Invoice ${esc(o.invoiceId)}</a>` : canBill && o.status !== 'Cancelled' ? `<a class="btn" href="#/billing/new?lab=${encodeURIComponent(o.id)}">${PP.icon('receipt')} Create invoice</a>` : ''}${['Ordered', 'Sample collected'].includes(o.status) ? '<button class="btn btn-danger" data-cancel>Cancel order</button>' : ''}`,
    }) + (o.status === 'Cancelled' ? PP.ui.alert('error', `This order was cancelled. ${esc(o.cancelReason || '')}`) : `<div class="card"><div class="card-body mod-scroll-x"><div class="stepper mod-stepper">${LAB_FLOW.map((s, i) => `<div class="step ${i < step || o.status === 'Delivered' ? 'done' : ''} ${i === step && o.status !== 'Delivered' ? 'active' : ''}"><span class="num">${i < step || o.status === 'Delivered' ? '✓' : i + 1}</span>${esc(s)}</div>${i < LAB_FLOW.length - 1 ? '<div class="line"></div>' : ''}`).join('')}</div></div></div>`)
      + `<div class="grid form-split mod-split mt-4"><div class="stack" data-left></div><div class="stack" data-right></div></div>`;
    const left = $('[data-left]', el); const right = $('[data-right]', el);

    /* ---- next step card ---- */
    const next = {
      Ordered: ['Collect the sample', 'Label the sample with its ID, then send it to the lab.', '<button class="btn btn-primary" data-collect>Collect sample</button>'],
      'Sample collected': ['Start processing', 'Mark the sample as received in the lab to begin entering results.', '<button class="btn btn-primary" data-process>Start processing</button>'],
      Processing: ['Enter and verify results', `Enter every value, save, then a ${esc(PP.tl('professional'))} verifies and releases the report.`, ''],
      'Result ready': ['Deliver the report', 'Print the report or send the patient a secure link by SMS (simulated).', '<button class="btn btn-primary" data-deliver>Deliver report</button>'],
      Delivered: ['Delivered', `Report delivered ${PP.fmt.stamp(o.deliveredAt)} · ${esc(o.deliveryMethod)}.`, '<button class="btn" data-resend>Re-send SMS link</button>'],
    }[o.status];
    if (next) right.insertAdjacentHTML('beforeend', `<section class="card mod-next"><div class="card-body"><div class="small muted">Next step</div><h3 class="mod-h3">${next[0]}</h3><p class="small muted">${next[1]}</p>${isOverdue(o) ? PP.ui.alert('error', `Overdue since ${PP.fmt.stamp(o.due)}.`) : ''}<div class="row mt-2">${next[2]}</div></div></section>`);
    right.insertAdjacentHTML('beforeend', PP.ui.card({ title: 'Order details', body: `<dl class="kv kv-tight"><dt>Patient</dt><dd>${patLink(pt.id)}<div class="small muted">${esc(pt.mobile || '')}</div></dd><dt>Ordered by</dt><dd>${esc(PP.proName(o.professionalId))}</dd><dt>Branch</dt><dd>${esc(PP.branchName(o.branchId))}</dd><dt>Priority</dt><dd>${esc(o.priority)}</dd><dt>Due</dt><dd>${PP.fmt.stamp(o.due)}</dd><dt>Indication</dt><dd>${o.diagnosisCode ? esc(icdLabel(o.diagnosisCode)) : '<span class="muted">Not coded</span>'}</dd><dt>Notes</dt><dd>${esc(o.notes || '—')}</dd><dt>Tests</dt><dd>${o.tests.map((t) => `<div>${esc(labTestName(t))} <span class="muted small">${money((labTest(t) || {}).price || 0)}</span></div>`).join('')}<div class="mt-2"><b>Total ${money(orderTotal(o))}</b></div></dd></dl>` }));
    right.insertAdjacentHTML('beforeend', PP.ui.card({ title: 'Sample', body: o.sampleId ? `<div class="mod-label"><div class="small"><b>${esc(pt.name)}</b> · ${esc(pt.id)}</div>${barcodeSvg(o.sampleId)}<div class="mono mod-label-id">${esc(o.sampleId)}</div><div class="small muted">${esc(o.sampleType)}</div></div><div class="small muted mt-2">Collected ${PP.fmt.stamp(o.collectedAt)} by ${esc(o.collectedBy)}</div><button class="btn btn-sm mt-2" data-label>${PP.icon('printer')} Print label</button>` : '<p class="muted small" style="margin:0">No sample collected yet. Collecting the sample generates a sample ID and barcode label.</p>' }));
    right.insertAdjacentHTML('beforeend', PP.ui.card({ title: 'History', body: `<ul class="mod-hist">${(o.history || []).slice().reverse().map((h) => `<li><div><b>${esc(h.status)}</b>${h.note ? ` · ${esc(h.note)}` : ''}</div><div class="small muted">${PP.fmt.stamp(h.at)} · ${esc(h.by)}</div></li>`).join('')}</ul>` }));

    /* ---- results ---- */
    const editable = o.status === 'Processing';
    const resHtml = o.tests.map((tid) => {
      const t = labTest(tid) || { name: tid, params: [], sampleType: '' }; const r = (o.results || {})[tid] || { values: {}, comment: '' };
      return `<div class="mod-result" data-res="${esc(tid)}"><div class="row between"><h3 class="mod-h3">${esc(t.name)}</h3><span class="small muted">${esc(t.sampleType)} · ${t.tatHours || '—'} h</span></div>
        <div class="table-wrap"><table class="table mod-compact"><thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead><tbody>
        ${t.params.map((p, i) => { const v = (r.values || {})[p.name]; const isNum = !(p.low == null && p.high == null); return `<tr><td>${esc(p.name)}</td><td>${editable ? `<div class="field"><input class="input mod-res-input" ${isNum ? 'type="number" step="any"' : ''} name="r-${esc(tid)}-${i}" data-p="${i}" value="${esc(v == null ? '' : v)}" aria-label="${esc(p.name)} result" placeholder="${isNum ? 'Value' : esc(p.normal || 'Text')}"><div class="error"></div></div>` : `<b>${esc(v || '—')}</b>`}</td><td>${esc(p.unit)}</td><td class="small">${refText(p)}</td><td data-flag="${i}">${flagHtml(flagOf(p, v))}</td></tr>`; }).join('')}
        </tbody></table></div>${editable ? `<div class="field mt-2"><input class="input" name="c-${esc(tid)}" value="${esc(r.comment || '')}" placeholder="Comment (optional)" aria-label="Comment for ${esc(t.name)}"></div>` : r.comment ? `<div class="small mt-2"><b>Comment:</b> ${esc(r.comment)}</div>` : ''}</div>`;
    }).join('');
    const verified = o.verifiedBy ? `<div class="mt-3">${PP.ui.alert('positive', `Verified by <b>${esc(PP.proName(o.verifiedBy))}</b> on ${PP.fmt.stamp(o.verifiedAt)}.`)}</div>` : '';
    left.innerHTML = `<section class="card"><div class="card-head"><h2>Results</h2>${editable ? '<div class="row"><button class="btn" data-save>Save draft</button><button class="btn btn-primary" data-verify>Verify & release</button></div>' : ''}</div><div class="card-body">
      ${step < 2 && o.status !== 'Cancelled' ? PP.ui.alert('info', 'Results can be entered once the sample is in processing. Reference ranges are shown below.') : ''}
      ${editable ? '<form data-resform onsubmit="return false" novalidate>' + resHtml + '</form>' : resHtml}${verified}</div></section>`;

    if (editable) {
      const form = $('[data-resform]', left);
      form.addEventListener('input', (e) => {
        const inp = e.target.closest('[data-p]'); if (!inp) return;
        const box = inp.closest('[data-res]'); const t = labTest(box.dataset.res); const p = t.params[Number(inp.dataset.p)];
        $(`[data-flag="${inp.dataset.p}"]`, box).innerHTML = flagHtml(flagOf(p, inp.value.trim()));
        inp.closest('.field').classList.remove('has-error');
      });
      const collect = () => { o.results = o.results || {}; o.tests.forEach((tid) => { const t = labTest(tid); if (!t) return; const vals = {}; t.params.forEach((p, i) => { const x = $(`[name="r-${tid}-${i}"]`, form); vals[p.name] = x ? x.value.trim() : ''; }); const c = $(`[name="c-${tid}"]`, form); o.results[tid] = { values: vals, comment: c ? c.value.trim() : '' }; }); o.enteredBy = user().id; };
      $('[data-save]', left).addEventListener('click', (e) => PP.ui.busy(e.currentTarget, () => { collect(); PP.save(); PP.ui.toast('Draft results saved. They are not visible to the patient until verified.'); }));
      $('[data-verify]', left).addEventListener('click', () => {
        collect(); let missing = 0;
        o.tests.forEach((tid) => { const t = labTest(tid); t.params.forEach((p, i) => { if (!o.results[tid].values[p.name]) { missing++; const x = $(`[name="r-${tid}-${i}"]`, form); if (x) { const f = x.closest('.field'); f.classList.add('has-error'); $('.error', f).textContent = 'Required'; } } }); });
        if (missing) { PP.save(); PP.ui.toast(`Enter all results before verifying (${missing} missing). Draft saved.`, 'error'); return; }
        const abn = PP.sum(o.tests, (tid) => labTest(tid).params.filter((p) => ['High', 'Low', 'Abnormal'].includes(flagOf(p, o.results[tid].values[p.name]))).length);
        const me = user();
        formModal({
          title: 'Verify and release results', submitLabel: 'Verify & release',
          body: `<div class="full">${PP.ui.alert(abn ? 'warning' : 'info', abn ? `<b>${abn} value(s) outside the reference range</b> will be flagged on the report.` : 'All values are within the reference ranges.')}</div>`
            + F({ name: 'verifiedBy', label: `Verifying ${PP.tl('professional')}`, type: 'select', required: true, options: proOptions(), value: me.professionalId || o.professionalId, full: true })
            + F({ name: 'confirm', label: 'I have reviewed every result against the sample and the reference ranges.', type: 'checkbox', full: true }),
          onSubmit: (d, f) => {
            if (!d.confirm) { PP.ui.toast('Tick the confirmation to verify.', 'error'); return false; }
            o.verifiedBy = d.verifiedBy; o.verifiedAt = PP.nowStamp(); o.status = 'Result ready';
            addHistory(o, 'Result ready', `Verified by ${PP.proName(d.verifiedBy)}${abn ? ` · ${abn} flagged` : ''}`);
            PP.audit('Lab results verified', o.id, `${PP.proName(d.verifiedBy)} · ${abn} abnormal`); PP.save();
            PP.notify('Lab result ready', `${o.id} · ${pt.name}`, `#/lab/orders/${o.id}`); PP.save();
            PP.ui.toast('Results verified and released. The report is ready to deliver.'); rerender();
          },
        });
      });
    }

    const on = (sel, fn) => { const b = $(sel, el); if (b) b.addEventListener('click', () => fn(b)); };
    on('[data-collect]', () => {
      const sampleTypes = [...new Set(o.tests.map((t) => (labTest(t) || {}).sampleType).filter(Boolean))].join(', ');
      const c = PP.db.counters; const nextNo = (c.SMP || 0) + 1; const sid = `S-${PP.today().slice(2).replace(/-/g, '')}-${pad(nextNo, 4)}`;
      formModal({
        title: 'Collect sample', submitLabel: 'Save collection',
        body: `<div class="full mod-label">${barcodeSvg(sid)}<div class="mono mod-label-id">${esc(sid)}</div><div class="small muted">Sample ID is generated automatically. Stick the printed label on every tube.</div></div>`
          + F({ name: 'sampleType', label: 'Sample type(s)', required: true, value: sampleTypes })
          + F({ name: 'time', label: 'Collection time', type: 'time', required: true, value: PP.nowTime() })
          + F({ name: 'collectedBy', label: 'Collected by', value: user().name, readonly: true })
          + F({ name: 'note', label: 'Note', placeholder: 'e.g. Right antecubital, no issues' }),
        onSubmit: (d) => {
          c.SMP = nextNo; o.sampleId = sid; o.sampleType = d.sampleType; o.collectedAt = new Date(`${PP.today()}T${d.time}:00`).toISOString(); o.collectedBy = user().name; o.status = 'Sample collected';
          addHistory(o, 'Sample collected', `Sample ${sid}${d.note ? ' · ' + d.note : ''}`); PP.save(); PP.ui.toast(`Sample ${esc(sid)} collected`); rerender();
        },
      });
    });
    on('[data-process]', (b) => PP.ui.busy(b, () => { o.status = 'Processing'; o.processingAt = PP.nowStamp(); addHistory(o, 'Processing', 'Received in lab'); PP.save(); PP.ui.toast('Sample received in the lab. Enter the results.'); rerender(); }));
    on('[data-cancel]', async () => { const r = await PP.ui.confirm({ title: `Cancel ${esc(o.id)}?`, message: 'The order stays in the list as Cancelled.', confirmLabel: 'Cancel order', danger: true, reasonLabel: 'Reason', reasonRequired: true }); if (!r) return; o.status = 'Cancelled'; o.cancelReason = r.reason; addHistory(o, 'Cancelled', r.reason); PP.audit('Lab order cancelled', o.id, r.reason); PP.save(); PP.ui.toast('Order cancelled', 'info'); rerender(); });
    on('[data-print]', () => printDoc(labReportHtml(o)));
    on('[data-label]', () => printDoc(`<div class="mod-label mod-label-print"><div class="small"><b>${esc(pt.name)}</b> · ${esc(pt.id)}</div>${barcodeSvg(o.sampleId)}<div class="mono mod-label-id">${esc(o.sampleId)}</div><div class="small">${esc(o.sampleType)} · ${PP.fmt.stamp(o.collectedAt)}</div></div>`));
    const deliverModal = (resend) => formModal({
      title: resend ? 'Re-send report link' : 'Deliver report', submitLabel: resend ? 'Send link' : 'Deliver',
      body: (resend ? '' : F({ name: 'method', label: 'Delivery', type: 'select', options: [['SMS link', 'SMS with secure link (simulated)'], ['Printed report', 'Printed report handed over'], ['Both', 'Both']], value: 'SMS link', placeholder: false, full: true }))
        + F({ name: 'mobile', label: 'Patient mobile', type: 'tel', rule: 'mobile', required: true, value: String(pt.mobile || '').replace(/[\s-]/g, ''), hint: 'The link opens the verified report and expires after 7 days. Prototype: nothing is sent.' })
        + `<div class="full small muted mod-sms-preview">SMS preview: “${esc(PP.db.settings.clinicName)}: your lab report ${esc(o.id)} is ready. View: https://r.physiopoint.example/${esc(o.id.toLowerCase())}”</div>`,
      onOpen: (form) => { const m = $('[name=method]', form); if (m) m.addEventListener('change', () => { const sms = m.value !== 'Printed report'; const f = $('[name=mobile]', form); f.required = sms; f.closest('.field').classList.toggle('hidden', !sms); }); },
      onSubmit: (d) => {
        const method = resend ? 'SMS link' : d.method; const sms = method !== 'Printed report';
        if (!resend) { o.status = 'Delivered'; o.deliveredAt = PP.nowStamp(); o.deliveryMethod = method; }
        addHistory(o, resend ? 'Link re-sent' : 'Delivered', `${method}${sms ? ' to ' + d.mobile : ''}`);
        PP.audit(resend ? 'Lab report link re-sent' : 'Lab report delivered', o.id, `${method}${sms ? ' · ' + d.mobile : ''}`); PP.save();
        PP.ui.toast(sms ? `SMS with the report link sent to ${esc(d.mobile)} (simulated).` : 'Report marked as delivered.');
        if (method !== 'SMS link') printDoc(labReportHtml(o));
        rerender();
      },
    });
    on('[data-deliver]', () => deliverModal(false));
    on('[data-resend]', () => deliverModal(true));
  }
  PP.route('/lab/orders/:id', { title: (p) => `Lab order ${p.id}`, perm: 'lab.manage', render: renderLabOrder });
  PP.route('/lab/:id', { title: (p) => (p.id === 'new' ? 'Lab Orders' : `Lab order ${p.id}`), perm: 'lab.manage', render: (ctx) => { if (ctx.params.id === 'new') { location.replace(`#/lab?new=1${ctx.query.patient ? '&patient=' + encodeURIComponent(ctx.query.patient) : ''}`); return; } renderLabOrder(ctx); } });

  /* ================================================================ DENTAL CHART */
  const COND = {
    healthy: { label: 'Healthy', color: '#ffffff' },
    caries: { label: 'Caries', color: '#f87171', surface: true },
    filled: { label: 'Filled', color: '#60a5fa', surface: true },
    crown: { label: 'Crown', color: '#fbbf24' },
    root_canal: { label: 'Root canal', color: '#a78bfa' },
    missing: { label: 'Missing', color: '#e5e7eb' },
    implant: { label: 'Implant', color: '#5eead4' },
    extraction: { label: 'Extraction planned', color: '#fecaca' },
  };
  const PROCEDURES = [['Oral examination', 500, null], ['Scaling and polishing', 2500, null], ['Composite filling', 2000, 'filled'], ['Glass ionomer filling', 1500, 'filled'], ['Root canal treatment', 8000, 'root_canal'], ['Crown (PFM)', 10000, 'crown'], ['Zirconia crown', 18000, 'crown'], ['Simple extraction', 1500, 'missing'], ['Surgical extraction', 4000, 'missing'], ['Dental implant', 60000, 'implant'], ['Periapical X-ray (IOPA)', 400, null], ['Fluoride application', 1200, null]];
  const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; const Q2 = [21, 22, 23, 24, 25, 26, 27, 28];
  const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; const Q3 = [31, 32, 33, 34, 35, 36, 37, 38];
  const TOOTH_NAMES = ['', 'central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'third molar'];
  function toothName(n) { const q = Math.floor(n / 10); const p = n % 10; return `${q <= 2 ? 'Upper' : 'Lower'} ${q === 1 || q === 4 ? 'right' : 'left'} ${TOOTH_NAMES[p]}`; }
  function surfaceLabels(n) { const q = Math.floor(n / 10); const p = n % 10; return { M: 'Mesial', O: p <= 3 ? 'Incisal' : 'Occlusal', D: 'Distal', B: p <= 3 ? 'Facial' : 'Buccal', L: q <= 2 ? 'Palatal' : 'Lingual' }; }
  const surfShort = (n, list) => (list || []).map((s) => (s === 'O' && n % 10 <= 3 ? 'I' : s)).join(', ');
  function toothSvg(n, t) {
    const q = Math.floor(n / 10); const upper = q <= 2; const midRight = q === 1 || q === 4;
    const pos = { top: upper ? 'B' : 'L', bottom: upper ? 'L' : 'B', left: midRight ? 'D' : 'M', right: midRight ? 'M' : 'D', center: 'O' };
    const c = (t && COND[t.condition]) || COND.healthy; const cond = t ? t.condition : 'healthy';
    const surfs = t && t.surfaces && t.surfaces.length ? t.surfaces : ['O'];
    const fill = (key) => (cond === 'healthy' ? '#fff' : c.surface ? (surfs.includes(pos[key]) ? c.color : '#fff') : c.color);
    const stroke = cond === 'crown' ? '#b45309' : '#64748b';
    const sw = cond === 'crown' ? 2.6 : 1.2;
    let extra = '';
    if (cond === 'missing') extra = '<path d="M8 8 32 32M32 8 8 32" stroke="#64748b" stroke-width="2.4"/>';
    if (cond === 'extraction') extra = '<path d="M8 8 32 32M32 8 8 32" stroke="#dc2626" stroke-width="2.6"/>';
    if (cond === 'root_canal') extra = '<circle cx="20" cy="20" r="4" fill="#6d28d9"/>';
    if (cond === 'implant') extra = '<path d="M15 16h10M15 20h10M15 24h10" stroke="#0f766e" stroke-width="2"/>';
    return `<svg viewBox="0 0 40 40" aria-hidden="true" class="${cond === 'missing' ? 'mod-faded' : ''}"><g stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">
      <polygon points="4,4 36,4 26,14 14,14" fill="${fill('top')}"/><polygon points="4,36 36,36 26,26 14,26" fill="${fill('bottom')}"/>
      <polygon points="4,4 14,14 14,26 4,36" fill="${fill('left')}"/><polygon points="36,4 26,14 26,26 36,36" fill="${fill('right')}"/>
      <rect x="14" y="14" width="12" height="12" fill="${fill('center')}"/></g>${extra}</svg>`;
  }
  const getChart = (pid) => PP.db.dentalCharts.find((c) => c.patientId === pid) || null;

  PP.route('/dental', {
    title: 'Dental Chart', perm: 'clinical.view',
    render({ el }) {
      ensure();
      const bt = PP.db.settings.businessType;
      el.innerHTML = PP.ui.pageHead({ title: 'Dental Chart', crumbs: [['Prescriptions'], ['Dental Chart']], subtitle: 'Tooth chart in FDI notation, surface findings and tooth-level treatment plans.' })
        + (bt !== 'dental' ? PP.ui.alert('info', `This clinic is set up as a <b>${esc((PP.businessTypes[bt] || {}).label || bt)}</b>. The Dental Chart menu item appears only for dental clinics; the chart itself works for any business type.`) + '<div class="mt-4"></div>' : '')
        + `<div class="grid mod-dental-home"><section class="card"><div class="card-head"><h2>Open a patient’s chart</h2></div><div class="card-body"><form class="form-grid" data-pick onsubmit="return false" novalidate>${patientPickerHtml('patientId', 'Patient', '', true)}<div class="full row"><button class="btn btn-primary" data-open>Open dental chart</button></div></form></div></section>
          <section class="card"><div class="card-head"><h2>Patients with a dental chart</h2><span class="small muted">${PP.db.dentalCharts.length} chart(s)</span></div><div data-tbl></div></section></div>`;
      const form = $('[data-pick]', el); bindPatientPicker(form, (p) => { if (p) PP.go(`#/dental/${p.id}`); });
      $('[data-open]', el).addEventListener('click', () => { if (!PP.form.validate(form)) return; PP.go(`#/dental/${PP.form.read(form).patientId}`); });
      PP.ui.table($('[data-tbl]', el), {
        getRows: () => PP.db.dentalCharts.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), pageSize: 5,
        search: { placeholder: 'Search patient…', text: (r) => `${PP.patientName(r.patientId)} ${r.patientId}` },
        columns: [
          { key: 'p', label: 'Patient', render: (r) => `<b>${esc(PP.patientName(r.patientId))}</b><span class="sub">${esc(r.patientId)}</span>` },
          { key: 'f', label: 'Findings', align: 'right', render: (r) => Object.values(r.teeth || {}).filter((t) => t.condition !== 'healthy').length },
          { key: 'pl', label: 'Planned', align: 'right', render: (r) => `${(r.plan || []).filter((x) => x.status === 'Planned').length}<span class="sub">${money(PP.sum((r.plan || []).filter((x) => x.status === 'Planned'), (x) => x.fee))}</span>` },
          { key: 'u', label: 'Updated', sort: (r) => r.updatedAt, render: (r) => PP.fmt.stamp(r.updatedAt) },
        ],
        onRowClick: (r) => PP.go(`#/dental/${r.patientId}`),
        empty: { icon: 'users', title: 'No dental charts yet', text: 'Open a patient to start their chart.' },
      });
    },
  });

  PP.route('/dental/:patientId', {
    title: () => 'Dental Chart', perm: 'clinical.view',
    render({ params, el }) {
      ensure();
      const pt = PP.find.patient(params.patientId);
      if (!pt) { el.innerHTML = `<div class="card">${PP.ui.empty({ icon: 'alert', title: 'Patient not found', text: `No patient <code>${esc(params.patientId)}</code>.`, action: '<a class="btn btn-primary" href="#/dental">Choose a patient</a>' })}</div>`; return; }
      const canEdit = PP.can('clinical.write');
      let chart = getChart(pt.id);
      const draft = chart || { id: pt.id, patientId: pt.id, teeth: {}, plan: [], history: [], updatedAt: null };
      let sel = null;
      const persist = (text) => {
        if (!chart) { chart = draft; PP.db.dentalCharts.push(chart); chart.history.push({ at: PP.nowStamp(), by: user().name, text: 'Chart created' }); }
        if (text) chart.history.push({ at: PP.nowStamp(), by: user().name, text });
        chart.updatedAt = PP.nowStamp(); PP.save();
      };
      el.innerHTML = PP.ui.pageHead({
        title: `Dental chart · ${esc(pt.name)}`, crumbs: [['Dental Chart', '#/dental'], [pt.name]],
        subtitle: `${esc(pt.id)} · ${esc(pt.gender)} · ${esc(PP.fmt.age(pt.dob))} · allergies: ${esc(pt.allergies || '—')}`,
        actions: `<a class="btn" href="#/patients/${esc(pt.id)}">${PP.icon('user')} Patient profile</a>${PP.can('billing.manage') ? `<a class="btn" href="#/billing/new?patient=${encodeURIComponent(pt.id)}">${PP.icon('receipt')} New invoice</a>` : ''}<button class="btn" data-print>${PP.icon('printer')} Print chart</button>`,
      }) + (canEdit ? '' : PP.ui.alert('info', 'View only. Your role cannot record clinical findings.') + '<div class="mt-4"></div>')
        + `<div class="grid mod-dental"><section class="card"><div class="card-head"><h2>Tooth chart (FDI)</h2><span class="small muted">Click a tooth to record its condition</span></div><div class="card-body"><div data-chart></div><div class="mod-legend mt-4" data-legend></div></div></section>
           <section class="card mod-tooth-panel" data-panel></section></div>
         <div class="grid grid-2 mt-4 mod-dental-low"><section class="card" data-plan></section><section class="card" data-hist></section></div>`;
      const chartEl = $('[data-chart]', el); const panel = $('[data-panel]', el);

      const toothBtn = (n, upper) => { const t = draft.teeth[n]; const c = t ? t.condition : 'healthy'; return `<button type="button" class="mod-tooth ${sel === n ? 'is-sel' : ''} ${c !== 'healthy' ? 'has-finding' : ''}" data-tooth="${n}" aria-pressed="${sel === n}" aria-label="Tooth ${n}, ${esc(toothName(n))}: ${esc((COND[c] || COND.healthy).label)}${t && t.surfaces && t.surfaces.length ? ' (' + esc(t.surfaces.join(', ')) + ')' : ''}">${upper ? `<span class="mod-tn">${n}</span>` : ''}${toothSvg(n, t)}${upper ? '' : `<span class="mod-tn">${n}</span>`}${(draft.plan || []).some((x) => x.tooth === String(n) && x.status === 'Planned') ? '<span class="mod-tplan" title="Treatment planned"></span>' : ''}</button>`; };
      function drawChart() {
        chartEl.innerHTML = `<div class="mod-chart-scroll"><div class="mod-chart">
          <div class="mod-chart-side"><span>Patient’s right</span><span class="small muted">Upper (maxillary)</span><span>Patient’s left</span></div>
          <div class="mod-arch"><div class="mod-quad" aria-label="Quadrant 1, upper right">${Q1.map((n) => toothBtn(n, true)).join('')}</div><div class="mod-midline"></div><div class="mod-quad" aria-label="Quadrant 2, upper left">${Q2.map((n) => toothBtn(n, true)).join('')}</div></div>
          <div class="mod-occlusal"></div>
          <div class="mod-arch"><div class="mod-quad" aria-label="Quadrant 4, lower right">${Q4.map((n) => toothBtn(n, false)).join('')}</div><div class="mod-midline"></div><div class="mod-quad" aria-label="Quadrant 3, lower left">${Q3.map((n) => toothBtn(n, false)).join('')}</div></div>
          <div class="mod-chart-side"><span></span><span class="small muted">Lower (mandibular)</span><span></span></div></div></div>`;
        $$('[data-tooth]', chartEl).forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.tooth); drawChart(); drawPanel(); if (window.innerWidth < 1200) panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
        const counts = {}; Object.values(draft.teeth).forEach((t) => { counts[t.condition] = (counts[t.condition] || 0) + 1; });
        $('[data-legend]', el).innerHTML = Object.entries(COND).map(([k, c]) => `<span class="mod-leg"><i style="background:${c.color}"></i>${esc(c.label)}${k !== 'healthy' && counts[k] ? ` <b>${counts[k]}</b>` : ''}</span>`).join('') + '<span class="mod-leg"><i class="mod-leg-plan"></i>Treatment planned</span>';
      }
      function drawPanel() {
        if (!sel) { panel.innerHTML = `<div class="card-body">${PP.ui.empty({ icon: 'info', title: 'Select a tooth', text: 'Click any tooth on the chart to see and record its condition, surfaces and notes, or to add it to the treatment plan.' })}</div>`; return; }
        const t = draft.teeth[sel] || { condition: 'healthy', surfaces: [], note: '' }; const sl = surfaceLabels(sel);
        const items = (draft.plan || []).filter((x) => x.tooth === String(sel));
        panel.innerHTML = `<div class="card-head"><h2>Tooth ${sel}</h2><span class="small muted">${esc(toothName(sel))}</span></div><div class="card-body">
          <form data-tform onsubmit="return false" novalidate class="stack">
            <div class="label">Condition</div>
            <div class="mod-conds" role="radiogroup" aria-label="Condition">${Object.entries(COND).map(([k, c]) => `<label class="mod-cond ${t.condition === k ? 'is-on' : ''}"><input type="radio" name="condition" value="${k}" ${t.condition === k ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><i style="background:${c.color}"></i>${esc(c.label)}</label>`).join('')}</div>
            <div data-surfs><div class="label">Surfaces affected</div><div class="mod-surfs">${Object.entries(sl).map(([k, l]) => `<label class="check"><input type="checkbox" data-surf="${k}" ${t.surfaces.includes(k) ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> ${esc(l)} (${k === 'O' && sel % 10 <= 3 ? 'I' : k})</label>`).join('')}</div></div>
            ${F({ name: 'note', label: 'Surface / tooth notes', type: 'textarea', rows: 2, value: t.note, placeholder: 'e.g. Deep distal caries, sensitive to cold', disabled: !canEdit })}
            ${canEdit ? '<div class="row"><button class="btn btn-primary" data-tsave>Save tooth</button>' + (draft.teeth[sel] && draft.teeth[sel].condition !== 'healthy' ? '<button class="btn btn-ghost" data-treset>Mark healthy</button>' : '') + '</div>' : ''}
            ${t.updatedAt ? `<div class="small muted">Last updated ${PP.fmt.stamp(t.updatedAt)}</div>` : ''}
          </form>
          <div class="divider"></div>
          <div class="label">Treatment for this tooth</div>
          ${items.length ? `<ul class="mod-hist mt-2">${items.map((x) => `<li><div class="row between"><span>${esc(x.procedure)} · ${money(x.fee)}</span>${PP.ui.badge(x.status, x.status === 'Done' ? 'positive' : 'lavender')}</div></li>`).join('')}</ul>` : '<div class="small muted mt-2">Nothing planned for this tooth.</div>'}
          ${canEdit ? `<form class="form-grid mt-3" data-pform onsubmit="return false" novalidate>
            ${F({ name: 'procedure', label: 'Procedure', type: 'select', required: true, options: PROCEDURES.map((p) => [p[0], `${p[0]} (${money(p[1])})`]), full: true })}
            ${F({ name: 'fee', label: 'Fee (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, step: 1 })}
            <div class="field"><label>&nbsp;</label><button class="btn" data-padd>${PP.icon('plus')} Add to plan</button></div></form>` : ''}</div>`;
        const tform = $('[data-tform]', panel);
        const syncSurf = () => { const c = ($('[name=condition]:checked', tform) || {}).value || 'healthy'; $('[data-surfs]', tform).classList.toggle('mod-dim', !COND[c].surface); $$('.mod-cond', tform).forEach((l) => l.classList.toggle('is-on', $('input', l).checked)); };
        tform.addEventListener('change', syncSurf); syncSurf();
        const save = $('[data-tsave]', panel);
        if (save) save.addEventListener('click', () => PP.ui.busy(save, () => {
          const cond = ($('[name=condition]:checked', tform) || {}).value || 'healthy';
          const surfaces = COND[cond].surface ? $$('[data-surf]:checked', tform).map((x) => x.dataset.surf) : [];
          if (COND[cond].surface && !surfaces.length) { PP.ui.toast('Tick at least one affected surface.', 'error'); return; }
          const note = $('[name=note]', tform).value.trim();
          const prev = draft.teeth[sel] || { condition: 'healthy', surfaces: [], note: '' };
          if (prev.condition === cond && prev.note === note && surfShort(sel, prev.surfaces) === surfShort(sel, surfaces)) { PP.ui.toast('No changes to save.', 'info'); return; }
          draft.teeth[sel] = { condition: cond, surfaces, note, updatedAt: PP.nowStamp() };
          persist(`Tooth ${sel}: ${COND[prev.condition].label}${prev.surfaces && prev.surfaces.length ? ' (' + surfShort(sel, prev.surfaces) + ')' : ''} → ${COND[cond].label}${surfaces.length ? ' (' + surfShort(sel, surfaces) + ')' : ''}${note && note !== prev.note ? ' · note updated' : ''}`);
          PP.ui.toast(`Tooth ${sel} saved: ${esc(COND[cond].label)}`); drawChart(); drawPanel(); drawHist();
        }, 250));
        const reset = $('[data-treset]', panel);
        if (reset) reset.addEventListener('click', () => { const prev = draft.teeth[sel]; delete draft.teeth[sel]; persist(`Tooth ${sel}: ${COND[prev.condition].label} → Healthy`); PP.ui.toast(`Tooth ${sel} marked healthy`); drawChart(); drawPanel(); drawHist(); });
        const pform = $('[data-pform]', panel);
        if (pform) {
          const ps = $('[name=procedure]', pform); const fee = $('[name=fee]', pform);
          ps.addEventListener('change', () => { const p = PROCEDURES.find((x) => x[0] === ps.value); if (p) fee.value = p[1]; });
          $('[data-padd]', pform).addEventListener('click', () => { if (!PP.form.validate(pform)) return; addPlan(String(sel), ps.value, Number(fee.value)); });
        }
      }
      function addPlan(tooth, procedure, fee) {
        draft.plan = draft.plan || [];
        draft.plan.push({ id: PP.nextId('DPL', 3), tooth, procedure, fee: r2(fee), status: 'Planned', addedAt: PP.nowStamp(), doneAt: null, by: user().name });
        persist(`Plan: ${procedure} on ${tooth === 'Full mouth' ? 'full mouth' : 'tooth ' + tooth} (${money(fee)}) added`);
        PP.ui.toast(`${esc(procedure)} added to the treatment plan`); drawChart(); drawPanel(); drawPlan(); drawHist();
      }
      function drawPlan() {
        const plan = draft.plan || []; const planned = plan.filter((x) => x.status === 'Planned'); const done = plan.filter((x) => x.status === 'Done');
        $('[data-plan]', el).innerHTML = `<div class="card-head"><h2>Treatment plan</h2><span class="small muted">Planned ${money(PP.sum(planned, (x) => x.fee))} · done ${money(PP.sum(done, (x) => x.fee))}</span></div>
          ${plan.length ? `<div class="table-wrap"><table class="table mod-compact"><thead><tr><th>Tooth</th><th>Procedure</th><th class="right">Fee</th><th>Status</th><th></th></tr></thead><tbody>${plan.map((x) => `<tr><td><b>${esc(x.tooth)}</b></td><td>${esc(x.procedure)}<span class="sub">Added ${PP.fmt.stamp(x.addedAt)}${x.doneAt ? ' · done ' + PP.fmt.stamp(x.doneAt) : ''}</span></td><td class="right mono">${money(x.fee)}</td><td>${PP.ui.badge(x.status, x.status === 'Done' ? 'positive' : 'lavender')}</td><td>${canEdit ? `<span class="row-actions">${x.status === 'Planned' ? `<button class="btn btn-sm btn-ghost" data-done="${esc(x.id)}">Mark done</button><button class="btn btn-sm btn-ghost" data-rm="${esc(x.id)}" aria-label="Remove">${PP.icon('trash')}</button>` : `<button class="btn btn-sm btn-ghost" data-undo="${esc(x.id)}">Reopen</button>`}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card-body">${PP.ui.empty({ icon: 'clipboard', title: 'No treatment planned', text: 'Select a tooth and add a procedure, or add a full-mouth procedure below.' })}</div>`}
          ${canEdit ? `<div class="card-foot"><form class="row" data-fm onsubmit="return false" novalidate><select class="select mod-w-auto" name="procedure" aria-label="Full-mouth procedure">${PROCEDURES.filter((p) => !p[2]).map((p) => `<option value="${esc(p[0])}" data-fee="${p[1]}">${esc(p[0])} (${money(p[1])})</option>`).join('')}</select><button class="btn btn-sm" data-fmadd>${PP.icon('plus')} Add full-mouth item</button>${PP.can('billing.manage') && planned.length ? `<a class="btn btn-sm btn-ghost" href="#/billing/new?patient=${encodeURIComponent(pt.id)}">Bill planned work</a>` : ''}</form></div>` : ''}`;
        const p = $('[data-plan]', el);
        $$('[data-done]', p).forEach((b) => b.addEventListener('click', () => {
          const x = draft.plan.find((i) => i.id === b.dataset.done); x.status = 'Done'; x.doneAt = PP.nowStamp();
          const pr = PROCEDURES.find((i) => i[0] === x.procedure); let txt = `Plan: ${x.procedure} on ${x.tooth === 'Full mouth' ? 'full mouth' : 'tooth ' + x.tooth} done`;
          if (pr && pr[2] && /^\d+$/.test(x.tooth)) { const prev = draft.teeth[x.tooth] || { condition: 'healthy' }; draft.teeth[x.tooth] = { condition: pr[2], surfaces: COND[pr[2]].surface ? (prev.surfaces && prev.surfaces.length ? prev.surfaces : ['O']) : [], note: prev.note || '', updatedAt: PP.nowStamp() }; txt += ` · tooth ${x.tooth}: ${COND[prev.condition].label} → ${COND[pr[2]].label}`; }
          persist(txt); PP.ui.toast(`${esc(x.procedure)} marked done${pr && pr[2] ? '; the chart was updated' : ''}`); drawChart(); drawPanel(); drawPlan(); drawHist();
        }));
        $$('[data-undo]', p).forEach((b) => b.addEventListener('click', () => { const x = draft.plan.find((i) => i.id === b.dataset.undo); x.status = 'Planned'; x.doneAt = null; persist(`Plan: ${x.procedure} on ${x.tooth} reopened`); PP.ui.toast('Item reopened', 'info'); drawChart(); drawPlan(); drawHist(); }));
        $$('[data-rm]', p).forEach((b) => b.addEventListener('click', async () => { const x = draft.plan.find((i) => i.id === b.dataset.rm); if (!(await PP.ui.confirm({ title: 'Remove planned item?', message: `${esc(x.procedure)} on ${esc(x.tooth)} will be removed from the plan. The change is kept in the history.`, confirmLabel: 'Remove', danger: true }))) return; draft.plan = draft.plan.filter((i) => i !== x); persist(`Plan: ${x.procedure} on ${x.tooth} removed`); PP.ui.toast('Item removed'); drawChart(); drawPanel(); drawPlan(); drawHist(); }));
        const fm = $('[data-fmadd]', p); if (fm) fm.addEventListener('click', () => { const s = $('[name=procedure]', p); addPlan('Full mouth', s.value, Number(s.selectedOptions[0].dataset.fee)); });
      }
      function drawHist() {
        const h = (draft.history || []).slice().reverse();
        $('[data-hist]', el).innerHTML = `<div class="card-head"><h2>History of changes</h2><span class="small muted">${h.length} entr${h.length === 1 ? 'y' : 'ies'}</span></div><div class="card-body">${h.length ? `<ul class="mod-hist">${h.slice(0, 30).map((x) => `<li><div>${esc(x.text)}</div><div class="small muted">${PP.fmt.stamp(x.at)} · ${esc(x.by)}</div></li>`).join('')}</ul>` : PP.ui.empty({ icon: 'clock', title: 'No changes yet', text: 'Every change to the chart and plan is recorded here.' })}</div>`;
      }
      drawChart(); drawPanel(); drawPlan(); drawHist();
      $('[data-print]', el).addEventListener('click', () => {
        const rows = Object.entries(draft.teeth).sort((a, b) => a[0] - b[0]);
        printDoc(`<div class="mod-sheet">${sheetHead('Dental chart', `${esc(pt.name)} · ${esc(pt.id)}`)}<div class="mod-print-chart">${chartEl.innerHTML}</div>
          <h3 class="mod-sheet-h">Findings</h3><table class="mod-sheet-table"><thead><tr><th>Tooth</th><th>Condition</th><th>Surfaces</th><th>Notes</th></tr></thead><tbody>${rows.map(([n, t]) => `<tr><td>${n} · ${esc(toothName(Number(n)))}</td><td>${esc(COND[t.condition].label)}</td><td>${esc(surfShort(Number(n), t.surfaces) || '—')}</td><td>${esc(t.note || '')}</td></tr>`).join('') || '<tr><td colspan="4">No findings</td></tr>'}</tbody></table>
          <h3 class="mod-sheet-h">Treatment plan</h3><table class="mod-sheet-table"><thead><tr><th>Tooth</th><th>Procedure</th><th>Status</th><th class="right">Fee</th></tr></thead><tbody>${(draft.plan || []).map((x) => `<tr><td>${esc(x.tooth)}</td><td>${esc(x.procedure)}</td><td>${esc(x.status)}</td><td class="right">${money(x.fee)}</td></tr>`).join('') || '<tr><td colspan="4">Nothing planned</td></tr>'}</tbody></table>${sheetFoot()}</div>`);
      });
    },
  });

  /* ================================================================ HELP & SUPPORT */
  const TICKET_TONE = { Open: 'info', 'In progress': 'lavender', 'Waiting on you': 'warning', Resolved: 'positive', Closed: 'neutral' };
  const PRIORITY_TONE = { Low: 'neutral', Normal: 'info', High: 'warning', Urgent: 'error' };
  const ANN_TONE = { Release: 'positive', Maintenance: 'warning', Tip: 'info', Security: 'lavender' };
  const TICKET_CATS = ['Technical problem', 'How-to question', 'Billing & licence', 'Data correction', 'Feature request', 'Other'];
  const rsStatus = (s) => (s.endedAt ? 'Ended' : Date.now() > stampMs(s.expiresAt) ? 'Expired' : 'Active');

  function articleModal(a, goNew) {
    a.views = (a.views || 0) + 1; PP.save();
    const m = PP.ui.modal({
      title: esc(a.title), size: 'lg',
      body: `<div class="small muted">${esc(a.category)} · ${esc(a.id)} · updated ${PP.fmt.date(a.updated)}</div><p class="mod-lead">${esc(a.summary)}</p>${(a.body || []).map((p, i) => `<div class="mod-kb-step"><span>${i + 1}</span><p>${esc(p)}</p></div>`).join('')}
        <div class="divider"></div><div class="row between"><div class="row"><span class="small muted">Was this helpful?</span><button class="btn btn-sm" data-yes>Yes</button><button class="btn btn-sm" data-no>No</button></div><button class="btn btn-sm btn-primary" data-ask>Still need help? Contact support</button></div>`,
      buttons: [{ label: 'Close', kind: 'ghost' }],
    });
    $('[data-yes]', m.el).addEventListener('click', () => PP.ui.toast('Thanks for your feedback.'));
    $('[data-no]', m.el).addEventListener('click', () => PP.ui.toast('Thanks. Physio Point uses this to improve the article.', 'info'));
    $('[data-ask]', m.el).addEventListener('click', () => { m.close(); goNew(`Question about: ${a.title}`); });
  }

  function ticketModal(tk, onChange) {
    const draw = () => `<div class="row between"><div class="row">${PP.ui.badge(tk.status, TICKET_TONE[tk.status])}${PP.ui.badge(tk.priority, PRIORITY_TONE[tk.priority])}<span class="small muted">${esc(tk.category)} · opened ${PP.fmt.stamp(tk.createdAt)} by ${esc(userName(tk.createdBy))}</span></div>
        <div class="row">${['Resolved', 'Closed'].includes(tk.status) ? '<button class="btn btn-sm" data-reopen>Reopen</button>' : '<button class="btn btn-sm" data-resolve>Mark as resolved</button>'}<a class="btn btn-sm btn-ghost" href="#/support?tab=remote&ticket=${esc(tk.id)}" data-remote>Allow remote support</a></div></div>
      <div class="mod-chat mt-4">${tk.messages.map((m) => `<div class="mod-msg ${m.from === 'clinic' ? 'mine' : ''}"><div class="mod-msg-meta"><b>${esc(m.name)}</b> · ${PP.fmt.stamp(m.at)}${m.from === 'vendor' ? ' · Physio Point' : ''}</div><div class="mod-bubble">${esc(m.text)}${m.attachment ? `<div class="mod-attach">${PP.icon('file')} ${esc(m.attachment)}</div>` : ''}</div></div>`).join('')}</div>
      ${tk.status === 'Closed' ? '<div class="small muted mt-3">This ticket is closed. Reopen it to reply.</div>' : `<form class="stack mt-4" data-reply onsubmit="return false" novalidate>${F({ name: 'text', label: 'Reply to Physio Point support', type: 'textarea', rows: 3, required: true, placeholder: 'Write your reply… Do not include patient names or mobile numbers.' })}<div class="row between"><span class="small muted">Replies go to the vendor’s support team, not to your staff.</span><button class="btn btn-primary" data-send>${PP.icon('send')} Send reply</button></div></form>`}`;
    const m = PP.ui.modal({ title: `${esc(tk.id)} · ${esc(tk.subject)}`, size: 'lg', body: draw(), buttons: [{ label: 'Close', kind: 'ghost' }] });
    const bind = () => {
      const body = m.body; const chat = $('.mod-chat', body); if (chat) chat.scrollTop = chat.scrollHeight;
      const send = $('[data-send]', body);
      if (send) send.addEventListener('click', () => { const f = $('[data-reply]', body); if (!PP.form.validate(f)) return; PP.ui.busy(send, () => { tk.messages.push({ from: 'clinic', name: user().name, at: PP.nowStamp(), text: PP.form.read(f).text, attachment: '' }); if (tk.status === 'Waiting on you' || tk.status === 'Resolved') tk.status = 'In progress'; tk.updatedAt = PP.nowStamp(); PP.save(); PP.ui.toast('Reply sent to Physio Point support'); m.body.innerHTML = draw(); bind(); onChange(); }); });
      const res = $('[data-resolve]', body); if (res) res.addEventListener('click', () => { tk.status = 'Resolved'; tk.updatedAt = PP.nowStamp(); tk.messages.push({ from: 'clinic', name: user().name, at: PP.nowStamp(), text: 'Marked as resolved by the clinic.', attachment: '' }); PP.save(); PP.ui.toast('Ticket marked as resolved'); m.body.innerHTML = draw(); bind(); onChange(); });
      const ro = $('[data-reopen]', body); if (ro) ro.addEventListener('click', () => { tk.status = 'Open'; tk.updatedAt = PP.nowStamp(); PP.save(); PP.ui.toast('Ticket reopened', 'info'); m.body.innerHTML = draw(); bind(); onChange(); });
      const rm = $('[data-remote]', body); if (rm) rm.addEventListener('click', () => m.close());
    };
    bind();
  }

  PP.route('/support', {
    title: 'Help & Support', perm: 'support.use',
    render({ el, query }) {
      ensure();
      const tab = tabFrom(query, ['kb', 'tickets', 'new', 'announcements', 'remote'], 'kb');
      const lic = PP.db.settings.licence || {};
      const openCount = () => PP.db.supportTickets.filter((t) => !['Resolved', 'Closed'].includes(t.status)).length;
      const unreadAnn = () => PP.db.vendorAnnouncements.filter((a) => !a.read).length;
      el.innerHTML = PP.ui.pageHead({
        title: 'Help & Support', crumbs: [['Help & Support']],
        subtitle: 'Help from <b>Physio Point</b>, the company that provides this software. Tickets and replies go to the Physio Point support team, not to your clinic staff.',
        actions: '<button class="btn btn-primary" data-gonew>Contact vendor support</button>',
      }) + `<div class="mod-vendor card"><div class="card-body row between"><div class="row"><span class="mod-vendor-logo">${PP.logoSvg}</span><div><b>Physio Point Support</b><div class="small muted">support@physiopoint.example · 09612-000000 (fictional) · Sat–Thu, 9 AM – 8 PM</div></div></div>
          <div class="small"><div>Plan: <b>${esc(lic.plan || '—')}</b> · first response target: <b>4 business hours</b></div><div class="muted">Urgent (system down): call the hotline any time.</div></div></div></div>
        <div class="card mt-4"><div data-tabs></div><div data-pane></div></div>`;
      const pane = $('[data-pane]', el);
      let ticketQuery = query.ticket || '';
      const tabs = () => [{ id: 'kb', label: 'Knowledge base' }, { id: 'tickets', label: 'My tickets', count: openCount() }, { id: 'new', label: 'New ticket' }, { id: 'announcements', label: 'Announcements', count: unreadAnn() || null }, { id: 'remote', label: 'Remote support' }];
      const go = (t, extra) => { PP.ui.tabs($('[data-tabs]', el), { tabs: tabs(), active: t, onChange: (x) => go(x) }); setQuery('/support', Object.assign({ tab: t }, extra || {})); ({ kb: drawKb, tickets: drawTickets, new: drawNew, announcements: drawAnn, remote: drawRemote })[t](extra || {}); };
      $('[data-gonew]', el).addEventListener('click', () => go('new'));

      function drawKb() {
        const cats = [...new Set(PP.db.kbArticles.map((a) => a.category))];
        let cat = ''; let q = '';
        pane.innerHTML = `<div class="card-body"><div class="row"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-kq placeholder="Search help articles, e.g. SMS, payroll, merge…" aria-label="Search help articles"></div></div>
          <div class="mod-cats mt-3">${['', ...cats].map((c) => `<button type="button" class="mod-catbtn ${c === '' ? 'is-on' : ''}" data-kc="${esc(c)}">${esc(c || 'All topics')}</button>`).join('')}</div><div class="mod-kb mt-4" data-klist></div></div>`;
        const list = $('[data-klist]', pane);
        const drawList = () => {
          const ql = q.toLowerCase();
          const rows = PP.db.kbArticles.filter((a) => (!cat || a.category === cat) && (!ql || `${a.title} ${a.summary} ${(a.body || []).join(' ')} ${a.category}`.toLowerCase().includes(ql)));
          list.innerHTML = rows.length ? rows.map((a) => `<button type="button" class="mod-kb-item" data-art="${esc(a.id)}"><span class="mod-kb-cat">${esc(a.category)}</span><b>${esc(a.title)}</b><span class="small muted">${esc(a.summary)}</span><span class="small muted">Updated ${PP.fmt.date(a.updated)}</span></button>`).join('') : PP.ui.empty({ icon: 'search', title: 'No articles match', text: 'Try another word, or ask Physio Point support directly.', action: '<button class="btn btn-primary" data-kask>Contact vendor support</button>' });
          $$('[data-art]', list).forEach((b) => b.addEventListener('click', () => articleModal(PP.db.kbArticles.find((a) => a.id === b.dataset.art), (subject) => go('new', { subject }))));
          const ask = $('[data-kask]', list); if (ask) ask.addEventListener('click', () => go('new', { subject: q ? `Question: ${q}` : '' }));
        };
        $('[data-kq]', pane).addEventListener('input', (e) => { q = e.target.value.trim(); drawList(); });
        $$('[data-kc]', pane).forEach((b) => b.addEventListener('click', () => { cat = b.dataset.kc; $$('[data-kc]', pane).forEach((x) => x.classList.toggle('is-on', x === b)); drawList(); }));
        drawList();
      }

      function drawTickets() {
        pane.innerHTML = '<div data-tt></div>';
        const refresh = () => go('tickets');
        PP.ui.table($('[data-tt]', pane), {
          getRows: () => PP.db.supportTickets.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), exportName: 'support-tickets',
          search: { placeholder: 'Search tickets…', text: (r) => `${r.id} ${r.subject} ${r.category}` },
          filters: [{ id: 's', label: 'Any status', options: Object.keys(TICKET_TONE).map((s) => [s, s]).concat([['open', 'Not resolved']]), match: (r, v) => (v === 'open' ? !['Resolved', 'Closed'].includes(r.status) : r.status === v) }],
          columns: [
            { key: 'id', label: 'Ticket', sort: (r) => r.id, render: (r) => `<b>${esc(r.id)}</b><span class="sub">${PP.fmt.stamp(r.createdAt)}</span>` },
            { key: 'sub', label: 'Subject', render: (r) => `${esc(r.subject)}<span class="sub">${esc(r.category)}</span>` },
            { key: 'pri', label: 'Priority', render: (r) => PP.ui.badge(r.priority, PRIORITY_TONE[r.priority]), exportValue: (r) => r.priority },
            { key: 'st', label: 'Status', sort: (r) => r.status, render: (r) => PP.ui.badge(r.status, TICKET_TONE[r.status]), exportValue: (r) => r.status },
            { key: 'last', label: 'Last update', sort: (r) => r.updatedAt, render: (r) => { const lm = r.messages[r.messages.length - 1] || {}; return `${PP.fmt.stamp(r.updatedAt)}<span class="sub">${lm.from === 'vendor' ? 'Physio Point replied' : 'You replied'} · ${r.messages.length} message(s)</span>`; } },
          ],
          onRowClick: (r) => ticketModal(r, refresh),
          empty: { icon: 'mail', title: 'No tickets yet', text: 'When you contact Physio Point support, your tickets appear here.' },
        });
        if (ticketQuery) { const tk = PP.db.supportTickets.find((t) => t.id === ticketQuery); ticketQuery = ''; if (tk) ticketModal(tk, refresh); }
      }

      function drawNew(extra) {
        const u = user();
        pane.innerHTML = `<div class="card-body"><div class="grid form-split mod-split"><form class="form-grid" data-tform onsubmit="return false" novalidate>
            ${F({ name: 'subject', label: 'Subject', required: true, full: true, value: extra.subject || '', placeholder: 'A short summary of the problem or question' })}
            ${F({ name: 'category', label: 'Category', type: 'select', required: true, options: TICKET_CATS })}
            ${F({ name: 'priority', label: 'Priority', type: 'select', options: [['Low', 'Low – question or idea'], ['Normal', 'Normal'], ['High', 'High – a feature is not working'], ['Urgent', 'Urgent – the system is down']], value: 'Normal', placeholder: false })}
            ${F({ name: 'description', label: 'Description', type: 'textarea', rows: 5, required: true, full: true, placeholder: 'What happened, what you expected, and the steps to reproduce it.', hint: 'At least 20 characters.' })}
            <div class="field full" data-field="shot"><label for="mod-shot">Screenshot (optional, mock upload)</label><input type="file" id="mod-shot" class="input mod-file" accept="image/*" data-shot><div class="hint">Nothing leaves your browser in this prototype; only the file name is kept.</div>
              <label class="check mt-2"><input type="checkbox" data-autoshot> Attach a screenshot of the current page (simulated)</label><div data-shotprev></div></div>
            <div class="full">${PP.ui.alert('warning', '<b>Do not include patient data.</b> Do not paste patient names, mobile numbers or clinical notes. Support can help with record IDs (for example PAT-000342) instead (D-006).')}</div>
            <div class="full form-actions"><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" data-submit>${PP.icon('send')} Send to Physio Point support</button></div>
          </form>
          <aside class="stack"><div class="mod-aside"><h3 class="mod-h3">Sent automatically with your ticket</h3><dl class="kv kv-tight small mt-2"><dt>Clinic</dt><dd>${esc(PP.db.settings.clinicName)}</dd><dt>Plan</dt><dd>${esc(lic.plan || '—')}</dd><dt>App version</dt><dd>${esc(PP.version)}</dd><dt>Reported by</dt><dd>${esc(u.name || '—')}</dd><dt>Browser</dt><dd>${esc((navigator.userAgent || '').split(') ')[0].slice(0, 60))}…</dd></dl></div>
            <div class="mod-aside"><h3 class="mod-h3">What happens next</h3><ol class="small mod-ol"><li>You get an automatic reply with your ticket number.</li><li>A Physio Point support agent replies here, usually within 4 business hours.</li><li>If they need to see your screen, they ask first. Remote access only works if you allow it, for a limited time, and is logged.</li></ol></div></aside></div></div>`;
        const form = $('[data-tform]', pane);
        const prev = () => { const f = $('[data-shot]', form).files[0]; const auto = $('[data-autoshot]', form).checked; const names = [f ? f.name : '', auto ? `screen-${PP.today()}.png` : ''].filter(Boolean); $('[data-shotprev]', form).innerHTML = names.map((n) => `<div class="mod-attach mt-2">${PP.icon('file')} ${esc(n)}</div>`).join(''); return names.join(', '); };
        form.addEventListener('change', prev);
        $('[data-cancel]', form).addEventListener('click', () => go('kb'));
        $('[data-submit]', form).addEventListener('click', (e) => {
          if (!PP.form.validate(form)) return; const d = PP.form.read(form);
          if (d.description.length < 20) { PP.form.setError(form, 'description', 'Please describe the problem in at least 20 characters.'); return; }
          if (/01[3-9]\d{8}/.test(d.description.replace(/[\s-]/g, ''))) { PP.form.setError(form, 'description', 'This looks like a mobile number. Remove patient contact details before sending.'); return; }
          const shot = prev();
          PP.ui.busy(e.currentTarget, () => {
            const newId = PP.nextId('TKT', 4);
            const tk = { id: newId, subject: d.subject, category: d.category, priority: d.priority, status: 'Open', createdAt: PP.nowStamp(), updatedAt: PP.nowStamp(), createdBy: u.id, screenshot: shot, messages: [{ from: 'clinic', name: u.name, at: PP.nowStamp(), text: d.description, attachment: shot }, { from: 'vendor', name: 'Physio Point Support', at: new Date(Date.now() + 1000).toISOString(), text: `Auto-reply: we received ticket ${newId}. Our first response target for the ${lic.plan || ''} plan is 4 business hours${d.priority === 'Urgent' ? '. For a system-down problem, please also call the hotline' : ''}.`, attachment: '' }] };
            PP.db.supportTickets.push(tk); PP.audit('Support ticket created', tk.id, `${d.category} · ${d.priority}`); PP.save();
            PP.ui.toast(`Ticket ${esc(tk.id)} sent to Physio Point support.`);
            ticketQuery = tk.id; go('tickets');
          }, 500);
        });
      }

      function drawAnn() {
        const list = PP.db.vendorAnnouncements.slice().sort((a, b) => b.date.localeCompare(a.date));
        pane.innerHTML = `<div class="card-body"><div class="row between"><span class="small muted">News from Physio Point: releases, maintenance windows and tips.</span>${unreadAnn() ? '<button class="btn btn-sm" data-readall>Mark all as read</button>' : ''}</div>
          <div class="stack mt-4">${list.map((a) => `<article class="mod-ann ${a.read ? '' : 'unread'}"><div class="row between"><div class="row">${PP.ui.badge(a.type, ANN_TONE[a.type])}<span class="small muted">${PP.fmt.date(a.date)}</span>${a.read ? '' : '<span class="mod-new">New</span>'}</div>${a.read ? '' : `<button class="btn btn-sm btn-ghost" data-read="${esc(a.id)}">Mark as read</button>`}</div><h3 class="mod-h3 mt-2">${esc(a.title)}</h3><p class="small" style="margin:6px 0 0">${esc(a.body)}</p></article>`).join('') || PP.ui.empty({ icon: 'bell', title: 'No announcements' })}</div></div>`;
        $$('[data-read]', pane).forEach((b) => b.addEventListener('click', () => { PP.db.vendorAnnouncements.find((a) => a.id === b.dataset.read).read = true; PP.save(); go('announcements'); }));
        const ra = $('[data-readall]', pane); if (ra) ra.addEventListener('click', () => { PP.db.vendorAnnouncements.forEach((a) => { a.read = true; }); PP.save(); PP.ui.toast('All announcements marked as read'); go('announcements'); });
      }

      function drawRemote(extra) {
        const sessions = PP.db.remoteSessions.slice().sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
        const active = sessions.filter((s) => rsStatus(s) === 'Active');
        const openTickets = PP.db.supportTickets.filter((t) => t.status !== 'Closed');
        pane.innerHTML = `<div class="card-body"><div class="grid form-split mod-split"><div class="stack">
            ${PP.ui.alert('info', '<b>Remote support only with your consent.</b> Physio Point staff can see your workspace only after you allow it here. Access is time-limited, ends automatically, can be ended at any time, and every session is recorded in your audit log.')}
            ${active.map((s) => `<div class="mod-remote-live"><div><b>Remote session active</b> · ${esc(s.scope)} · ticket ${esc(s.ticketId)}<div class="small">Ends ${PP.fmt.stamp(s.expiresAt)} (${Math.max(0, Math.ceil((stampMs(s.expiresAt) - Date.now()) / 60000))} min left) · session code <b class="mono">${esc(s.code.slice(0, 3))} ${esc(s.code.slice(3))}</b></div></div><button class="btn btn-danger solid btn-sm" data-end="${esc(s.id)}">End now</button></div>`).join('')}
            <form class="form-grid" data-rform onsubmit="return false" novalidate>
              ${F({ name: 'ticketId', label: 'For ticket', type: 'select', required: true, options: openTickets.map((t) => [t.id, `${t.id} · ${t.subject}`]), value: extra.ticket || '', full: true })}
              ${F({ name: 'minutes', label: 'Duration', type: 'select', options: [['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour']], value: '30', placeholder: false })}
              ${F({ name: 'scope', label: 'Access', type: 'select', options: [['View only', 'View only (agent can see, not click)'], ['View and control', 'View and control']], value: 'View only', placeholder: false })}
              <div class="field full" data-field="consent"><label class="check"><input type="checkbox" name="consent"> I allow Physio Point support to access this workspace for the selected time. I can end it at any time.</label><div class="error" role="alert">Your consent is required.</div></div>
              <div class="full row"><button class="btn btn-primary" data-grant ${active.length ? 'disabled' : ''}>${PP.icon('shield')} Allow remote support</button>${active.length ? '<span class="small muted">End the active session before starting another.</span>' : ''}</div>
            </form></div>
            <aside class="mod-aside"><h3 class="mod-h3">During a session</h3><ul class="small mod-ol"><li>A banner shows that support is connected.</li><li>Patient data on screen is visible to the agent, so open only the screens you need.</li><li>The agent cannot export data or change users and roles.</li><li>The session ends at the time shown, or when you click End now.</li></ul></aside></div></div>
          <div class="card-head mod-flat-head"><h2>Session log</h2></div><div data-rt></div>`;
        PP.ui.table($('[data-rt]', pane), {
          rows: sessions, pageSize: 5,
          columns: [
            { key: 'id', label: 'Session', render: (r) => `<b>${esc(r.id)}</b><span class="sub">ticket ${esc(r.ticketId)}</span>` },
            { key: 'g', label: 'Allowed', render: (r) => `${PP.fmt.stamp(r.grantedAt)}<span class="sub">by ${esc(userName(r.grantedBy))}</span>` },
            { key: 'm', label: 'Duration', render: (r) => `${r.minutes} min · ${esc(r.scope)}` },
            { key: 'agent', label: 'Agent', render: (r) => esc(r.agent || 'Physio Point Support') },
            { key: 's', label: 'Status', render: (r) => { const st = rsStatus(r); return `${PP.ui.badge(st, st === 'Active' ? 'positive' : 'neutral')}${r.endedAt ? `<span class="sub">ended ${PP.fmt.stamp(r.endedAt)}</span>` : st === 'Expired' ? `<span class="sub">expired ${PP.fmt.stamp(r.expiresAt)}</span>` : ''}`; } },
          ],
          empty: { icon: 'shield', title: 'No remote sessions yet', text: 'Remote support has never been allowed for this workspace.' },
        });
        const form = $('[data-rform]', pane);
        const grant = $('[data-grant]', form);
        if (grant && !openTickets.length) { grant.disabled = true; }
        grant.addEventListener('click', () => {
          if (!PP.form.validate(form)) return; const d = PP.form.read(form);
          if (!d.consent) { PP.form.setError(form, 'consent'); return; }
          PP.ui.busy(grant, () => {
            const code = String(100000 + Math.floor(Math.random() * 899999));
            const s = { id: PP.nextId('RS', 3), ticketId: d.ticketId, minutes: Number(d.minutes), scope: d.scope, grantedAt: PP.nowStamp(), expiresAt: fromNow(Number(d.minutes) * 60e3), grantedBy: user().id, endedAt: null, endedBy: '', agent: 'Physio Point Support', code };
            PP.db.remoteSessions.push(s);
            const tk = PP.db.supportTickets.find((t) => t.id === d.ticketId); if (tk) { tk.messages.push({ from: 'clinic', name: user().name, at: PP.nowStamp(), text: `Remote support allowed for ${d.minutes} minutes (${d.scope}). Session ${s.id}.`, attachment: '' }); tk.updatedAt = PP.nowStamp(); }
            PP.audit('Remote support access granted', s.id, `${d.ticketId} · ${d.minutes} min · ${d.scope}`); PP.save();
            PP.ui.toast(`Remote support allowed for ${d.minutes} minutes. Share code ${code.slice(0, 3)} ${code.slice(3)} with the agent (simulated).`, 'positive', 5000); go('remote');
          });
        });
        $$('[data-end]', pane).forEach((b) => b.addEventListener('click', async () => {
          if (!(await PP.ui.confirm({ title: 'End remote session now?', message: 'The support agent is disconnected immediately.', confirmLabel: 'End session', danger: true }))) return;
          const s = PP.db.remoteSessions.find((x) => x.id === b.dataset.end); s.endedAt = PP.nowStamp(); s.endedBy = user().name;
          PP.audit('Remote support access ended', s.id, `Ended by ${user().name}`); PP.save(); PP.ui.toast('Remote session ended'); go('remote');
        }));
      }
      go(tab, { subject: query.subject || '', ticket: query.ticket || '' });
    },
  });
})();
