/* Customer-level RBAC (D-036). Loaded after core.js, before data.js.
   - Granular permissions: <module>.<action>, with Create / Read / Update / Delete / Approve / Export kept separate,
     plus a few special actions (refund, discount, close, calculate, pay, merge, grant_remote).
   - Data scope per role and module: own · assigned · branch · org.
   - A user can hold several roles (u.role = primary, u.roles = extra); permissions are the union, scope the widest.
   - Roles are NOT professional types (D-020): clinical create/update/issue also needs a professional type that allows it.
   - Old permission codes used across the prototype ("billing.manage", "patients.view"…) are mapped to the new ones.
   The vendor-level roles live in the Super Admin app (control plane), never in customer data. */
(function () {
  'use strict';
  const PP = window.PP;

  /* ---------------------------------------------------------------- catalog */
  const ACT = { r: 'read', c: 'create', u: 'update', d: 'delete', a: 'approve', e: 'export' };
  // [id, label, standard actions, special actions, has data scope]
  const MODULES = [
    ['dashboard', 'Dashboard', 'r', [], false],
    ['appointments', 'Appointments & online requests', 'rcudae', [], true],
    ['queue', 'Queue & check-in', 'ru', [], false],
    ['patients', 'Patients (registration & demographics)', 'rcude', ['merge'], true],
    ['clinical', 'Clinical visits & notes', 'rcue', [], true],
    ['prescriptions', 'Prescriptions (approve = issue)', 'rcuae', [], true],
    ['templates', 'Condition templates', 'rcuda', [], false],
    ['exercises', 'Exercise library', 'rcud', [], false],
    ['lab', 'Lab & diagnostics (approve = verify results)', 'rcuae', [], true],
    ['billing', 'Invoices, payments & dues', 'rcudae', ['refund', 'discount'], true],
    ['finance', 'Income, expenses & cash closing', 'rcuae', ['close'], true],
    ['commissions', 'Commissions', 're', ['calculate', 'approve', 'pay'], true],
    ['payroll', 'Payroll', 'rcuae', ['pay'], false],
    ['inventory', 'Inventory & suppliers', 'rcude', [], false],
    ['packages', 'Packages & memberships', 'rcu', [], false],
    ['referrals', 'Referrals', 'rcue', [], true],
    ['feedback', 'Patient feedback', 're', [], false],
    ['services', 'Services & pricing', 'rcud', [], false],
    ['professionals', 'Professionals & schedules', 'rcud', [], false],
    ['hr', 'Staff attendance & leave', 'rcua', [], false],
    ['reports', 'Reports', 're', [], false],
    ['users', 'Users & roles', 'rcud', [], false],
    ['settings', 'Clinic settings', 'ru', [], false],
    ['audit', 'Audit log', 're', [], false],
    ['support', 'Vendor support', 'rc', ['grant_remote'], false],
    ['portal', 'Patient portal (app)', '', ['own_records', 'guardian'], false],
  ];
  const ACTION_LABEL = { read: 'Read', create: 'Create', update: 'Update', delete: 'Delete', approve: 'Approve', export: 'Export', refund: 'Refund (request)', discount: 'Give discount',
    close: 'Close cash day', calculate: 'Calculate / prepare', pay: 'Record payment', merge: 'Merge duplicates', grant_remote: 'Grant vendor remote access', own_records: 'Own records', guardian: 'Dependants (when authorised)' };
  const SCOPES = [['own', 'Own records'], ['assigned', 'Assigned records'], ['branch', 'Branch records'], ['org', 'Organization-wide']];
  const RANK = { own: 1, assigned: 2, branch: 3, org: 4 };
  const ALL = [];
  MODULES.forEach(([m, , std, spec]) => { std.split('').forEach((k) => ALL.push(`${m}.${ACT[k]}`)); spec.forEach((s) => { if (!ALL.includes(`${m}.${s}`)) ALL.push(`${m}.${s}`); }); });

  /* ---------------------------------------------------------- built-in roles */
  const g = (spec) => { // 'appointments:rcua billing:ru+refund' → codes
    const out = [];
    spec.trim().split(/\s+/).forEach((part) => {
      const [m, rest] = part.split(':'); const [std, ...special] = (rest || '').split('+');
      std.split('').forEach((k) => { if (ACT[k]) out.push(`${m}.${ACT[k]}`); });
      special.forEach((s) => out.push(`${m}.${s}`));
    });
    return out;
  };
  const sc = (def, over) => { const o = {}; MODULES.filter((m) => m[4]).forEach(([m]) => { o[m] = (over && over[m]) || def; }); return o; };
  const NO_ALL = (except) => ALL.filter((c) => !except.some((x) => c === x || c.startsWith(x + '.')));
  const ROLE_DEFS = [
    // ---- organization level
    { id: 'admin', name: 'Organization Owner', group: 'Organization', org: true, permissions: ['*'], note: 'Everything. Cannot be removed from the last active owner.' },
    { id: 'org_admin', name: 'Organization Admin', group: 'Organization', org: true, permissions: NO_ALL(['clinical', 'prescriptions', 'portal', 'commissions.pay', 'payroll.pay']), scopes: sc('org'), note: 'Runs the organization. No clinical records unless also a professional.' },
    { id: 'org_manager', name: 'Organization Manager', group: 'Organization', org: true, permissions: g('dashboard:r appointments:rcuae queue:ru patients:rue billing:re finance:r referrals:re feedback:re services:r professionals:ru hr:ra reports:re inventory:r packages:r audit:r support:rc'), scopes: sc('org') },
    { id: 'finance_manager', name: 'Finance Manager', group: 'Organization', org: true, permissions: g('dashboard:r billing:rcudae+refund+discount finance:rcuae+close commissions:re+calculate+approve payroll:rae reports:re audit:re packages:r services:r'), scopes: sc('org'), note: 'Approves (checker). Does not record payouts.' },
    { id: 'hr_manager', name: 'HR Manager', group: 'Organization', org: true, permissions: g('dashboard:r hr:rcua payroll:rcue professionals:ru users:r reports:r'), scopes: sc('org'), note: 'Prepares payroll; a different person approves it.' },
    // ---- branch level
    { id: 'branch_manager', name: 'Branch Manager', group: 'Branch', permissions: g('dashboard:r appointments:rcudae queue:ru patients:rcue billing:rae+discount finance:rae+close referrals:re feedback:re professionals:r hr:ra reports:re inventory:r packages:ru services:r support:rc'), scopes: sc('branch') },
    { id: 'branch_admin', name: 'Branch Admin', group: 'Branch', permissions: g('dashboard:r appointments:rcuda queue:ru patients:rcu billing:rcu services:r professionals:r packages:ru settings:r users:r support:rc'), scopes: sc('branch') },
    { id: 'receptionist', name: 'Receptionist', group: 'Front office', permissions: g('dashboard:r appointments:rcua queue:ru patients:rcu billing:r professionals:r support:r'), scopes: sc('branch'), note: 'No clinical record access.' },
    { id: 'frontdesk', name: 'Front Desk Executive', group: 'Front office', permissions: g('dashboard:r appointments:rcua queue:ru patients:rcu billing:rcu+refund packages:rcu referrals:rcu feedback:r lab:rcu professionals:r support:rc'), scopes: sc('branch'), note: 'No clinical record access. Refunds are requests until approved.' },
    { id: 'appointment_manager', name: 'Appointment Manager', group: 'Front office', org: true, permissions: g('dashboard:r appointments:rcudae queue:ru patients:rc professionals:r hr:r'), scopes: sc('org') },
    { id: 'cashier', name: 'Cashier', group: 'Finance', permissions: g('dashboard:r billing:rc+refund finance:r+close patients:r'), scopes: sc('branch'), note: 'Takes payments and closes the cash day. Refunds need approval.' },
    { id: 'accountant', name: 'Accountant', group: 'Finance', org: true, permissions: g('dashboard:r billing:rue+refund finance:rcue+close commissions:re+calculate+pay payroll:re+pay inventory:r reports:re support:rc'), scopes: sc('org'), note: 'Maker: prepares settlements and records payouts. No clinical notes.' },
    { id: 'inventory_manager', name: 'Inventory Manager', group: 'Finance', org: true, permissions: g('dashboard:r inventory:rcude finance:r'), scopes: sc('org') },
    // ---- clinical (a professional TYPE still decides clinical rights)
    { id: 'professional', name: 'Professional', group: 'Clinical', permissions: g('dashboard:r appointments:r patients:r clinical:rcu prescriptions:rcua templates:rcu exercises:rcu commissions:r'), scopes: sc('assigned', { appointments: 'own', commissions: 'own' }) },
    { id: 'senior_professional', name: 'Senior Professional', group: 'Clinical', permissions: g('dashboard:r appointments:r patients:r clinical:rcue prescriptions:rcuae templates:rcuda exercises:rcud commissions:r'), scopes: sc('branch', { appointments: 'own', commissions: 'own' }), note: 'Supervises: reads branch clinical records, approves templates.' },
    { id: 'clinical_manager', name: 'Clinical Manager', group: 'Clinical', org: true, permissions: g('dashboard:r appointments:r patients:r clinical:re prescriptions:re templates:rcuda exercises:rcud lab:ra professionals:ru reports:re'), scopes: sc('org'), note: 'Reads all clinical records for quality; writes only if also a professional.' },
    { id: 'clinical_assistant', name: 'Clinical Assistant', group: 'Clinical', permissions: g('dashboard:r appointments:r queue:ru patients:r clinical:rc exercises:r'), scopes: sc('assigned', { appointments: 'own' }), note: 'Records vitals and session notes if the professional type allows it.' },
    { id: 'consultant', name: 'Consultant', group: 'Clinical', permissions: g('dashboard:r appointments:r patients:r clinical:rcu prescriptions:rcua templates:rcu exercises:r lab:rc commissions:r'), scopes: sc('assigned', { appointments: 'own', commissions: 'own' }) },
    { id: 'visiting_professional', name: 'Visiting Professional', group: 'Clinical', permissions: g('dashboard:r appointments:r patients:r clinical:rcu prescriptions:rcua exercises:r commissions:r'), scopes: sc('own'), note: 'Own appointments and own patients only.' },
    // ---- external / portal
    { id: 'patient', name: 'Patient', group: 'Portal', portal: true, permissions: g('portal:+own_records'), scopes: sc('own'), note: 'Patient app: only their own authorised records.' },
    { id: 'guardian', name: 'Guardian / Caregiver', group: 'Portal', portal: true, permissions: g('portal:+own_records+guardian'), scopes: sc('own'), note: 'Only for dependants the clinic has explicitly authorised (scope and end date).' },
    { id: 'external_referrer', name: 'External Referrer', group: 'Portal', portal: true, permissions: g('referrals:r'), scopes: sc('own'), note: 'Sees only the referrals they sent and their status.' },
  ];
  PP.RBAC = { MODULES, ACT, ACTION_LABEL, SCOPES, ALL, ROLE_DEFS };
  PP.RBAC.defaultRoles = () => ROLE_DEFS.map((r) => Object.assign({ system: true, scopes: sc('org') }, JSON.parse(JSON.stringify(r))));
  PP.PERMISSIONS = ALL.map((c) => { const [m, a] = c.split('.'); const mod = MODULES.find((x) => x[0] === m); return [c, `${mod ? mod[1] : m} — ${ACTION_LABEL[a] || a}`]; });

  /* ------------------------------------------------------- legacy code map */
  const LEGACY = {
    'dashboard.view': ['dashboard.read'], 'appointments.view': ['appointments.read'], 'appointments.manage': ['appointments.create', 'appointments.update'],
    'requests.review': ['appointments.approve'], 'patients.view': ['patients.read'], 'patients.edit': ['patients.create', 'patients.update'],
    'clinical.write': ['clinical.create', 'clinical.update'], 'clinical.view': ['clinical.read'], 'prescriptions.issue': ['prescriptions.approve'],
    'templates.manage': ['templates.create', 'templates.update'], 'billing.view': ['billing.read'], 'billing.manage': ['billing.create', 'billing.update'],
    'finance.manage': ['finance.create', 'finance.update'], 'commissions.view_own': ['commissions.read'], 'commissions.manage': ['commissions.calculate'],
    'commissions.payout': ['commissions.pay'], 'services.manage': ['services.create', 'services.update'], 'professionals.manage': ['professionals.create', 'professionals.update'],
    'professionals.view': ['professionals.read'], 'users.manage': ['users.create', 'users.update'], 'settings.manage': ['settings.update'], 'reports.view': ['reports.read'],
    'audit.view': ['audit.read'], 'queue.manage': ['queue.update'], 'packages.manage': ['packages.create', 'packages.update'], 'exercises.manage': ['exercises.create', 'exercises.update'],
    'referrals.manage': ['referrals.create', 'referrals.update'], 'feedback.view': ['feedback.read'], 'inventory.manage': ['inventory.create', 'inventory.update'],
    'payroll.manage': ['payroll.create', 'payroll.update'], 'lab.manage': ['lab.create', 'lab.update'], 'support.use': ['support.create'],
  };
  PP.RBAC.LEGACY = LEGACY;

  /* --------------------------------------------------------------- checks */
  const rolesOf = (u) => { if (!u) return []; const ids = [u.role].concat(u.roles || []).filter(Boolean); return ids.map((id) => (PP.db.roles || []).find((r) => r.id === id)).filter(Boolean); };
  PP.userRoles = rolesOf;
  PP.userRoleNames = (u) => rolesOf(u).map((r) => r.name).join(' + ');
  const isStar = (u) => rolesOf(u).some((r) => r.permissions.includes('*'));
  PP.isOwner = () => isStar(PP.currentUser());
  const typeOfUser = (u) => { const p = u && u.professionalId ? PP.find.professional(u.professionalId) : null; return p ? (PP.db.professionalTypes || []).find((t) => t.id === p.typeId) : null; };
  const CLINICAL_WRITE = { 'clinical.create': 'canRecordClinical', 'clinical.update': 'canRecordClinical', 'prescriptions.create': 'canRecordClinical', 'prescriptions.update': 'canRecordClinical', 'prescriptions.approve': 'prescribe' };
  const raw = (u, code) => rolesOf(u).some((r) => r.permissions.includes('*') || r.permissions.includes(code));
  PP.can = function (perm) {
    if (Array.isArray(perm)) return perm.every((p) => PP.can(p)); // a page may need several permissions
    const u = PP.currentUser(); if (!u) return false;
    if (perm === 'appointments.view_all') return ['branch', 'org'].includes(PP.scopeOf('appointments'));
    if (perm === 'patients.view_all') return ['branch', 'org'].includes(PP.scopeOf('patients'));
    const codes = LEGACY[perm] || [perm];
    return codes.some((code) => {
      if (!raw(u, code)) return false;
      // Rule 12: writing clinical records / issuing prescriptions needs professional authorisation (a professional type that allows it) — for every role, the owner included.
      const need = CLINICAL_WRITE[code];
      if (need) {
        const t = typeOfUser(u); if (!t) return false;
        if (need === 'prescribe') return !!(t.canPrescribeExercise || t.canPrescribeMedication);
        return !!t[need];
      }
      return true;
    });
  };
  /** Widest data scope the user has for a module (own < assigned < branch < org). */
  PP.scopeOf = function (module) {
    const u = PP.currentUser(); if (!u) return 'own';
    let best = null;
    rolesOf(u).forEach((r) => {
      if (r.permissions.includes('*')) { best = 'org'; return; }
      if (!r.permissions.some((c) => c.startsWith(module + '.'))) return;
      const s = (r.scopes && r.scopes[module]) || (r.org ? 'org' : 'branch');
      if (!best || RANK[s] > RANK[best]) best = s;
    });
    return best || 'own';
  };
  /** Organization-wide users see every branch; others only their assigned branches. */
  PP.isOrgWide = () => { const u = PP.currentUser(); return !!u && rolesOf(u).some((r) => r.permissions.includes('*') || r.org); };
  PP.allowedBranchIds = () => { const u = PP.currentUser(); return PP.isOrgWide() ? PP.db.branches.map((b) => b.id) : ((u && u.branchIds) || []); };
  PP.inBranch = (rec) => {
    const b = PP.activeBranchId(); if (!rec || !rec.branchId) return true;
    if (b !== 'ALL') return rec.branchId === b;
    return PP.isOrgWide() || PP.allowedBranchIds().includes(rec.branchId);
  };
  /** Record-level branch isolation for detail pages (invoices, appointments, lab orders…). */
  PP.canSeeBranchOf = (rec) => !rec || !rec.branchId || PP.isOrgWide() || PP.allowedBranchIds().includes(rec.branchId);
  PP.denyBranch = function (el, rec, what) {
    if (PP.canSeeBranchOf(rec)) return false;
    el.innerHTML = '<div class="card">' + PP.ui.empty({ icon: 'lock', title: 'Not in your branches', text: `This ${what || 'record'} belongs to ${PP.branchName(rec.branchId)}, which is not one of your branches.`, action: '<a class="btn" href="#/dashboard">Back</a>' }) + '</div>';
    return true;
  };
  PP.ownProId = (kind) => {
    const s = PP.scopeOf(kind === 'patients' ? 'patients' : 'appointments');
    if (s !== 'own' && s !== 'assigned') return null;
    const u = PP.currentUser(); return (u && u.professionalId) || '__none__';
  };
  PP.canSeePatient = function (pid) {
    const p = PP.find.patient(pid); if (!p) return false;
    const s = PP.scopeOf('patients');
    if (!PP.can('patients.read')) return false;
    if (s === 'org') return true;
    if (s === 'branch') return !p.branchId || PP.allowedBranchIds().includes(p.branchId);
    const own = PP.ownProId('patients');
    const mine = (x) => x.patientId === pid && x.professionalId === own;
    return p.assignedProfessionalId === own || PP.db.appointments.some(mine) || PP.db.visits.some(mine) || PP.db.prescriptions.some(mine) || (PP.db.sessionPlans || []).some(mine);
  };

  /* -------------------------------------------------------- maker-checker */
  /** Returns an error message when the checker is the same person as the maker (financial approvals, D-036). */
  PP.makerChecker = function (makerId, what) {
    const u = PP.currentUser();
    if (u && makerId && makerId === u.id) return `Maker-checker: you prepared this ${what || 'item'}, so a different person must approve it.`;
    return '';
  };

  /** Module of the current page, for export permission. */
  PP.canExportHere = function () {
    const r = PP.match && PP.match(PP.currentPath ? PP.currentPath() : '');
    const perm = r && r.route && r.route.perm; if (!perm) return true;
    const mod = (LEGACY[perm] || [perm])[0].split('.')[0];
    if (!MODULES.some((m) => m[0] === mod && m[2].includes('e'))) return true;
    return PP.can(`${mod}.export`);
  };

  // Demo: one explicit guardian/caregiver authorisation (patient Nusrat Jahan cares for her mother Hasina Begum).
  PP.registerSeed('guardian-demo', (db) => {
    const kid = (db.patients || []).find((p) => p.name === 'Hasina Begum'); const carer = (db.patients || []).find((p) => p.name === 'Nusrat Jahan');
    if (!kid || !carer || (kid.guardians || []).length) return;
    const until = new Date(); until.setMonth(until.getMonth() + 6);
    kid.guardians = [{ id: 'GRD-001', name: carer.name, mobile: carer.mobile, patientId: carer.id, relation: 'Daughter (caregiver)', scopes: ['appointments', 'billing', 'exercises'], until: until.toISOString().slice(0, 10),
      basis: 'Written consent of the patient', consentRef: 'Consent form CF-2291', authorizedBy: 'USR-2', authorizedAt: new Date().toISOString().slice(0, 19), status: 'Active' }];
  });
})();
