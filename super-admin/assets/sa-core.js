/* Physio Point — vendor Super Admin prototype: shared catalogue, entitlement engine and helpers.
   Loaded after core.js and ui.js, before the seed (sa-data.js). Fictional data only (D-006).
   The control plane never stores patient or clinical data (control-plane.md §3). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  const SA = (window.SA = window.SA || {});

  /* ------------------------------------------------------------ feature catalogue (feature-catalog.md) */
  // core: true = applies to every customer, always on, not toggleable (gap-analysis "Must" core additions).
  SA.MODULES = [
    { code: 'org', name: 'Organisation and branches', features: ['profile', 'branches', 'branch_managers', 'rooms', 'working_hours', 'equipment'] },
    { code: 'users', name: 'Users and permissions', features: ['accounts', 'rbac', 'custom_roles', 'granular_permissions', 'branch_access', 'data_scope'] },
    { code: 'patients', name: 'Patient management', features: ['registration', 'profile', 'medical_history', 'allergies', 'previous_treatments', 'documents', 'timeline', 'duplicate_detection', 'referral_source', 'family_links', 'merge', 'consent_forms'] },
    { code: 'professionals', name: 'Professional management', features: ['profile', 'qualification', 'specialization', 'registration_number', 'schedule', 'availability', 'leave', 'attendance', 'branch_assignment'] },
    { code: 'appointments', name: 'Appointment management', features: ['booking', 'online_request', 'calendar', 'reschedule', 'cancel', 'recurring', 'walk_in', 'no_show', 'professional_availability', 'room_availability', 'double_booking_prevention', 'serial_booking', 'home_visit', 'equipment_availability'] },
    { code: 'queue', name: 'Queue management', features: ['check_in', 'waiting_list', 'queue_number', 'room_assignment', 'waiting_time', 'check_out', 'token_print', 'display_board'] },
    { code: 'clinical', name: 'Clinical management', features: ['medical_history', 'notes', 'soap', 'diagnosis', 'vitals', 'assessment', 'pain_mapping', 'range_of_motion', 'functional_assessment', 'attachments', 'configurable_forms', 'diagnosis_codes', 'lab_requests'] },
    { code: 'care_plans', name: 'Treatment and care plans', features: ['treatment_plans', 'goals', 'session_plans', 'follow_up', 'progress', 'plan_history'] },
    { code: 'prescriptions', name: 'Prescriptions and documents', features: ['templates', 'medication_catalog', 'dosage', 'professional_approval', 'certificates', 'referral_letters', 'pdf', 'print_designer', 'template_approval'] },
    { code: 'services', name: 'Services', features: ['catalog', 'pricing', 'categories', 'custom_pricing', 'professional_fees'] },
    { code: 'exercises', name: 'Exercise library', features: ['library', 'instructions', 'media', 'assignment'] },
    { code: 'billing', name: 'Billing and payments', features: ['invoices', 'payments', 'partial_payments', 'discounts', 'taxes', 'refunds', 'reversals', 'cash_closing', 'advance_balance', 'due_reminders'] },
    { code: 'finance', name: 'Income and expenses (D-023)', features: ['income_entry', 'expense_entry', 'categories', 'payment_tracking', 'branch_summary', 'monthly_reports', 'profit_loss_summary', 'export'] },
    { code: 'commissions', name: 'Commissions (D-025, D-026)', features: ['rules', 'manual_rate', 'accrual', 'adjustments', 'settlement', 'payout', 'audit'] },
    { code: 'packages', name: 'Packages', features: ['session_packages', 'memberships', 'validity', 'session_deduction', 'expiry', 'renewal', 'usage_history'] },
    { code: 'reports', name: 'Reports', features: ['collections', 'appointments', 'clinical', 'export', 'by_payment_method', 'owner_daily_summary'] },
    { code: 'analytics', name: 'Analytics', features: ['dashboards', 'trends'] },
    { code: 'notifications', name: 'Notifications', features: ['sms', 'whatsapp', 'email', 'push', 'templates', 'consent', 'logs', 'in_app'] },
    { code: 'patient_portal', name: 'Patient portal', features: ['access', 'appointments', 'documents', 'invoices'] },
    { code: 'patient_app', name: 'Patient mobile app', features: ['access'] },
    { code: 'professional_app', name: 'Professional mobile app', features: ['access'] },
    { code: 'inventory', name: 'Inventory', features: ['items', 'stock', 'suppliers'] },
    { code: 'referrals', name: 'Referral management', features: ['inbound', 'outbound'] },
    { code: 'feedback', name: 'Feedback', features: ['collection', 'reports'] },
    { code: 'payroll', name: 'Payroll', features: ['salaries', 'commissions'] },
    { code: 'lab', name: 'Lab and diagnostics', features: ['test_catalog', 'orders', 'samples', 'results', 'report_delivery'] },
    { code: 'dental', name: 'Dental', features: ['tooth_chart', 'procedures', 'tooth_treatment_plan'] },
    // Core additions: apply to every customer (always on).
    { code: 'auth', name: 'Sign-in and security (core)', core: true, features: ['login', 'mfa', 'patient_otp'], optional: ['patient_otp'] },
    { code: 'localization', name: 'Languages and formats (core)', core: true, features: ['languages', 'formats'] },
    { code: 'audit', name: 'Audit (core)', core: true, features: ['viewer'] },
    { code: 'data', name: 'Data protection (core)', core: true, features: ['backup', 'import', 'export'] },
    { code: 'system', name: 'System (core)', core: true, features: ['status', 'custom_fields'], optional: ['custom_fields'] },
  ];
  const NICE = { sms: 'SMS', mfa: 'Two-step login (MFA)', otp: 'OTP', pdf: 'PDF', rbac: 'Role-based access', soap: 'SOAP notes', in_app: 'In-app notification centre', patient_otp: 'Patient OTP sign-in' };
  SA.humanize = (s) => NICE[s] || (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');
  SA.FEATURES = [];
  SA.MODULES.forEach((m) => m.features.forEach((f) => {
    const code = `${m.code}.${f}`;
    SA.FEATURES.push({ code, module: m.code, name: SA.humanize(f), core: !!m.core && !(m.optional || []).includes(f) });
  }));
  SA.FEATURE_CODES = SA.FEATURES.map((f) => f.code);
  SA.feature = (code) => SA.FEATURES.find((f) => f.code === code) || null;
  SA.featureName = (code) => { const f = SA.feature(code); return f ? f.name : code; };
  SA.moduleName = (code) => { const m = SA.MODULES.find((x) => x.code === code); return m ? m.name : code; };
  SA.CORE_FEATURES = SA.FEATURES.filter((f) => f.core).map((f) => f.code);
  SA.OPTIONAL_FEATURES = SA.FEATURES.filter((f) => !f.core).map((f) => f.code);
  SA.PLATFORM_FEATURES = [
    ['platform.customers', 'Customer onboarding, activation, suspension'], ['platform.licensing', 'Licences, validation API'], ['platform.entitlements', 'Entitlement engine'],
    ['platform.plans', 'Plans and subscriptions'], ['platform.config', 'Business types, professional types, terminology'], ['platform.domains', 'Domains, DNS, SSL'],
    ['platform.branding', 'White label branding'], ['platform.releases', 'Signed releases'], ['platform.deployment', 'Installer and deployment tooling'], ['platform.fleet', 'Fleet monitoring'],
    ['platform.billing', 'Vendor billing'], ['platform.support', 'Support'], ['platform.demo', 'Demo and trial'], ['platform.staff', 'Vendor staff and audit'],
  ];

  /* Usage limits — business limits only. Never storage, disk, RAM, CPU or bandwidth (D-016). */
  SA.LIMITS = [
    { code: 'branches', label: 'Branches', counter: 'branches' },
    { code: 'users', label: 'User accounts', counter: 'users' },
    { code: 'professionals', label: 'Professionals', counter: 'professionals' },
    { code: 'patients', label: 'Patients', counter: 'patients' },
    { code: 'appointments_monthly', label: 'Appointments per month', counter: 'appointments_month' },
  ];
  SA.limitLabel = (code) => (SA.LIMITS.find((l) => l.code === code) || { label: code }).label;
  SA.fmtLimit = (v) => (v == null || v === '' ? 'Unlimited' : PP.fmt.num(v));

  /* Dependencies (feature-catalog.md "Feature dependencies"). Key: exact code or "module.*".
     A requirement "a|b|c" is met when any one of them is enabled. */
  const ANY_CHANNEL = 'notifications.sms|notifications.whatsapp|notifications.email';
  SA.DEPS = {
    'appointments.*': ['patients.registration', 'professionals.schedule', 'services.catalog'],
    'appointments.room_availability': ['org.rooms'], 'queue.room_assignment': ['org.rooms'],
    'appointments.online_request': ['appointments.booking'],
    'queue.*': ['appointments.booking'],
    'clinical.*': ['patients.profile', 'professionals.profile'],
    'care_plans.*': ['clinical.assessment'],
    'prescriptions.*': ['clinical.notes'],
    'exercises.assignment': ['exercises.library', 'care_plans.treatment_plans|prescriptions.templates'],
    'billing.*': ['patients.registration', 'services.catalog'],
    'packages.*': ['billing.invoices', 'services.catalog'],
    'packages.session_deduction': ['appointments.booking'],
    'finance.*': ['billing.payments'], 'finance.branch_summary': ['org.branches'],
    'payroll.*': ['billing.invoices'],
    'commissions.*': ['billing.payments', 'professionals.profile'],
    'commissions.payout': ['commissions.settlement', 'finance.expense_entry'],
    'reports.collections': ['billing.payments'],
    'patient_portal.*': ['patients.profile', 'auth.patient_otp'], 'patient_app.*': ['patients.profile', 'auth.patient_otp'],
    'professional_app.*': ['professionals.profile'],
    'users.branch_access': ['org.branches'],
    'appointments.serial_booking': ['appointments.booking', 'queue.queue_number'],
    'appointments.home_visit': ['appointments.booking', 'services.catalog'],
    'appointments.equipment_availability': ['org.equipment'],
    'services.professional_fees': ['services.pricing', 'professionals.profile'],
    'billing.due_reminders': [ANY_CHANNEL], 'reports.owner_daily_summary': [ANY_CHANNEL],
    'queue.display_board': ['queue.queue_number'], 'queue.token_print': ['queue.queue_number'],
    'auth.patient_otp': ['notifications.sms'],
    'lab.*': ['patients.registration', 'billing.invoices'],
    'clinical.lab_requests': ['lab.orders'],
    'dental.*': ['clinical.assessment', 'care_plans.treatment_plans'],
  };
  SA.DEP_NOTES = { 'prescriptions.medication_catalog': 'Also needs a professional type with the capability “can prescribe medication”.' };
  /** Requirements of a feature (strings; "a|b" = any of). Never lists the feature itself. */
  SA.requires = function (code) {
    const mod = code.split('.')[0]; const out = [];
    Object.keys(SA.DEPS).forEach((k) => {
      if (k === code || k === mod + '.*') SA.DEPS[k].forEach((r) => { if (r !== code && !r.split('|').includes(code) && !out.includes(r)) out.push(r); });
    });
    return out;
  };
  SA.reqMet = (req, set) => req.split('|').some((c) => set.has(c));
  SA.reqLabel = (req) => req.split('|').map((c) => `<code>${esc(c)}</code>`).join(' or ');
  SA.missing = (code, set) => SA.requires(code).filter((r) => !SA.reqMet(r, set));
  /** Enabled features that would lose a requirement if `code` were switched off (transitive). */
  SA.dependantsOf = function (code, enabled) {
    const set = new Set(enabled); set.delete(code); const lost = [];
    let changed = true;
    while (changed) {
      changed = false;
      Array.from(set).forEach((f) => { if (SA.CORE_FEATURES.includes(f)) return; if (SA.missing(f, set).length) { set.delete(f); lost.push(f); changed = true; } });
    }
    return lost;
  };
  /** Requirements that are switched off and would need enabling for `code` (transitive). */
  SA.prerequisitesFor = function (code, enabled) {
    const set = new Set(enabled); const add = [];
    const visit = (c) => SA.requires(c).forEach((r) => {
      if (SA.reqMet(r, set)) return;
      const pick = r.split('|')[0]; set.add(pick); add.push(pick); visit(pick);
    });
    visit(code); return add;
  };

  /* ----------------------------------------------------------- hashing / signing mock */
  SA.hash = function (str, len) {
    let h1 = 0x811c9dc5; let h2 = 0x01000193; const s = String(str);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
    let out = ''; let a = h1; let b = h2;
    while (out.length < (len || 32)) { a = Math.imul(a ^ (a >>> 13), 3266489917) >>> 0; b = Math.imul(b ^ (b >>> 16), 668265263) >>> 0; out += ((a ^ b) >>> 0).toString(16).padStart(8, '0'); }
    return out.slice(0, len || 32);
  };
  SA.sign = (obj) => `ed25519:${SA.hash(JSON.stringify(obj), 64)}`;
  SA.shortSig = (sig) => (sig ? `${String(sig).slice(0, 18)}…${String(sig).slice(-6)}` : '—');
  SA.genTenantId = (seed) => `tnt_${SA.hash(seed || (Math.random() + PP.nowStamp()), 12)}`;
  SA.genLicenceKey = (seed) => { const h = SA.hash(seed || (Math.random() + PP.nowStamp()), 16).toUpperCase(); return `PPL-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`; };
  SA.genTxt = (seed) => `pp-verify=${SA.hash(seed || Math.random(), 24)}`;

  /* -------------------------------------------------------------------- lookups */
  const db = (d) => d || PP.db;
  SA.customer = (id, d) => (db(d).customers || []).find((c) => c.id === id) || null;
  SA.customerName = (id) => { const c = SA.customer(id); return c ? c.name : '—'; };
  SA.plan = (id, d) => (db(d).plans || []).find((p) => p.id === id) || null;
  SA.planName = (id) => { const p = SA.plan(id); return p ? p.name : '—'; };
  SA.bt = (id, d) => (db(d).businessTypes || []).find((b) => b.id === id) || null;
  SA.btLabel = (id) => { const b = SA.bt(id); return b ? b.label : id || '—'; };
  SA.term = (c, key) => { const o = (c.terminology || {})[key]; if (o) return o; const b = SA.bt(c.businessType); return (b && b[key]) || key; };
  SA.staffName = (id) => { const u = PP.find.user(id); return u ? u.name : (id || '—'); };
  SA.deployment = (cId, d) => (db(d).deployments || []).find((x) => x.customerId === cId) || null;
  SA.domainsOf = (cId, d) => (db(d).domains || []).filter((x) => x.customerId === cId);
  SA.primaryDomain = (cId) => { const ds = SA.domainsOf(cId); return ds.find((x) => x.primary) || ds[0] || null; };
  SA.licencesOf = (cId, d) => (db(d).licences || []).filter((l) => l.customerId === cId).sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  SA.licenceOf = (cId, d) => SA.licencesOf(cId, d).find((l) => l.status !== 'Superseded') || null;
  SA.release = (version) => (PP.db.releases || []).find((r) => r.version === version) || null;

  /* ------------------------------------------------------- licence and customer state (D-017, PD-028) */
  SA.graceDays = () => (PP.db.settings && PP.db.settings.graceDays) || 14;
  /** Active → Grace (after expiry, for the grace period) → Expired (read-only). Revoked stays revoked. */
  SA.licenceState = function (lic) {
    if (!lic) return 'None';
    if (lic.status === 'Revoked') return 'Revoked';
    if (lic.status === 'Superseded') return 'Superseded';
    const t = PP.today();
    if (t < lic.start) return 'Scheduled';
    if (t <= lic.end) return 'Active';
    if (t <= PP.addDays(lic.end, SA.graceDays())) return 'Grace';
    return 'Expired';
  };
  /** Effective customer state shown everywhere: Onboarding, Active, Grace, Read-only, Suspended. */
  SA.state = function (c) {
    if (!c) return '—';
    if (c.status === 'Onboarding') return 'Onboarding';
    if (c.status === 'Suspended') return 'Suspended';
    const ls = SA.licenceState(SA.licenceOf(c.id));
    if (ls === 'Grace') return 'Grace';
    if (ls === 'Expired' || ls === 'Revoked' || ls === 'None') return 'Read-only';
    return 'Active';
  };
  SA.STATE_INFO = {
    Onboarding: 'Created in the control plane. The deployment is not activated yet.',
    Active: 'Entitled features are fully available.',
    Grace: 'Full use, with a warning banner to the customer admin. Renew before the grace period ends.',
    'Read-only': 'All records stay viewable, printable and exportable. No new clinical or financial entries. Admins can still manage users and export data. Nothing is deleted or encrypted (D-017).',
    Suspended: 'Suspended by the vendor. The deployment runs in read-only mode: records stay viewable and exportable. Login, reading and export are never blocked (D-017).',
  };
  SA.daysLeft = (iso) => (iso ? PP.diffDays(PP.today(), iso) : null);

  /* --------------------------------------------------------------------- badges */
  const TONE = {
    positive: ['Active', 'Verified', 'Issued', 'Signed', 'Valid', 'Healthy', 'Up to date', 'Paid', 'Published', 'Converted', 'Resolved', 'On', 'Granted', 'Completed', 'Success', 'Approved', 'Enabled', 'Sent'],
    info: ['Open', 'Updating', 'Contacted', 'Scheduled', 'Beta', 'In progress', 'Early', 'Trial', 'Requested', 'Answered'],
    lavender: ['Onboarding', 'Stable', 'Rollback'],
    warning: ['Grace', 'Pending', 'Update available', 'Warning', 'Partly paid', 'Expiring', 'Draft', 'Waiting on customer', 'New', 'Ending soon', 'Due soon', 'Not started'],
    error: ['Suspended', 'Read-only', 'Expired', 'Revoked', 'Failed', 'Down', 'Overdue', 'Unpaid', 'Unsigned', 'Rejected', 'Off', 'Urgent', 'High', 'Disabled', 'Unreachable'],
    neutral: ['Superseded', 'Ended', 'Deleted', 'Lost', 'Closed', 'Withdrawn', 'Rolled back', 'Not installed', 'None', 'Low', 'Normal', 'Archived', 'Inactive'],
  };
  SA.tone = (s) => Object.keys(TONE).find((k) => TONE[k].includes(s)) || 'neutral';
  SA.badge = (s, tone) => `<span class="badge ${tone || SA.tone(s)}">${esc(s)}</span>`;

  /* ------------------------------------------------------------ entitlement engine (§3 resolution order) */
  /** Active overrides for a customer (expired ones skipped). */
  SA.activeOverrides = (list) => (list || []).filter((o) => !o.removed && (!o.expires || o.expires >= PP.today()));
  SA.overridesOf = (cId, d) => (db(d).overrides || []).filter((o) => o.customerId === cId);
  /**
   * Resolves the entitlement set: plan → overrides (skip expired) → remove globally OFF → dependency check.
   * Returns { features[], limits{}, autoDisabled[{code, missing[]}], globallyOff[], fromPlan[], granted[], revoked[] }.
   */
  SA.resolve = function ({ planId, overrides }, d) {
    const data = db(d); const plan = SA.plan(planId, data) || { features: [], limits: {} };
    const set = new Set(plan.features.filter((c) => SA.FEATURE_CODES.includes(c)));
    SA.CORE_FEATURES.forEach((c) => set.add(c));
    const act = SA.activeOverrides(overrides); const granted = []; const revoked = [];
    const limits = Object.assign({}, plan.limits);
    act.forEach((o) => {
      if (o.type === 'limit') { limits[o.code] = o.value === '' || o.value == null ? null : Number(o.value); return; }
      if (SA.CORE_FEATURES.includes(o.code)) return;
      if (o.action === 'grant') { set.add(o.code); granted.push(o.code); } else if (o.action === 'revoke') { set.delete(o.code); revoked.push(o.code); }
    });
    const globallyOff = [];
    Object.entries(data.globalSwitches || {}).forEach(([code, g]) => { if (g.state === 'off' && set.has(code) && !SA.CORE_FEATURES.includes(code)) { set.delete(code); globallyOff.push(code); } });
    const autoDisabled = []; let changed = true;
    while (changed) {
      changed = false;
      Array.from(set).forEach((f) => { if (SA.CORE_FEATURES.includes(f)) return; const miss = SA.missing(f, set); if (miss.length) { set.delete(f); autoDisabled.push({ code: f, missing: miss }); changed = true; } });
    }
    return { features: SA.FEATURE_CODES.filter((c) => set.has(c)), limits, autoDisabled, globallyOff, granted, revoked, fromPlan: plan.features.slice() };
  };
  SA.setsOf = (cId, d) => (db(d).entitlementSets || []).filter((s) => s.customerId === cId).sort((a, b) => b.version - a.version);
  SA.latestSet = (cId, d) => SA.setsOf(cId, d)[0] || null;
  /** Publishes the current plan + overrides as entitlement set version N+1 (signed mock). */
  SA.publish = function (c, reason, opts, d) {
    const data = db(d); const o = opts || {};
    const prev = SA.latestSet(c.id, data);
    const overrides = SA.overridesOf(c.id, data).filter((x) => !x.removed).map((x) => PP.clone(x));
    const r = SA.resolve({ planId: c.planId, overrides }, data);
    const version = (prev ? prev.version : 0) + 1;
    const set = {
      id: `ENT-${c.id.slice(4)}-${String(version).padStart(3, '0')}`, customerId: c.id, tenantId: c.tenantId, version, planId: c.planId,
      features: r.features, limits: r.limits, overrides, autoDisabled: r.autoDisabled, globallyOff: r.globallyOff,
      issuedAt: o.at || PP.nowStamp(), by: o.by || (PP.currentUser() ? PP.currentUser().name : 'System'), reason: reason || '', kind: o.kind || 'publish', rollbackOf: o.rollbackOf || null,
    };
    set.signature = SA.sign({ t: c.tenantId, v: version, f: set.features, l: set.limits });
    data.entitlementSets.push(set);
    c.entitlementVersion = version;
    return set;
  };
  /** Rollback = re-publish an earlier version as a NEW version. History is never rewritten. */
  SA.rollback = function (c, version, reason) {
    const old = SA.setsOf(c.id).find((s) => s.version === version); if (!old) throw new Error('Version not found');
    // restore the plan and overrides that produced the old version, then publish them as N+1
    PP.db.overrides.filter((o) => o.customerId === c.id && !o.removed).forEach((o) => { o.removed = true; o.removedReason = `Rollback to v${version}`; });
    (old.overrides || []).forEach((o) => PP.db.overrides.push(Object.assign(PP.clone(o), { id: PP.nextId('OVR', 4), removed: false, restoredFrom: o.id })));
    c.planId = old.planId;
    const set = SA.publish(c, reason, { kind: 'rollback', rollbackOf: version });
    // the published content equals the old version exactly (global switches may have changed since)
    set.features = old.features.slice(); set.limits = Object.assign({}, old.limits);
    set.signature = SA.sign({ t: c.tenantId, v: set.version, f: set.features, l: set.limits });
    return set;
  };
  /** Difference between two sets: { added[], removed[], limits[{code, from, to}] } */
  SA.diffSets = function (a, b) {
    const A = new Set(a.features); const B = new Set(b.features);
    const limits = SA.LIMITS.map((l) => ({ code: l.code, from: a.limits[l.code], to: b.limits[l.code] })).filter((x) => String(x.from) !== String(x.to));
    return { added: b.features.filter((f) => !A.has(f)), removed: a.features.filter((f) => !B.has(f)), limits };
  };

  /* ------------------------------------------------------------------- vendor billing */
  SA.invoiceTotals = function (inv) {
    const amount = PP.round2(PP.sum(inv.lines || [], (l) => Number(l.amount) || 0));
    const paid = PP.round2(PP.sum(inv.payments || [], (p) => Number(p.amount) || 0));
    const due = PP.round2(Math.max(0, amount - paid));
    let status = 'Unpaid';
    if (inv.status === 'Void') status = 'Void';
    else if (due === 0) status = 'Paid';
    else if (inv.due < PP.today()) status = 'Overdue';
    else if (paid > 0) status = 'Partly paid';
    return { amount, paid, due, status };
  };

  /* -------------------------------------------------------------------------- misc */
  SA.PERMISSIONS = [
    ['dashboard.view', 'View dashboard'], ['customers.view', 'View customers'], ['customers.manage', 'Edit customer profile and configuration'],
    ['customers.lifecycle', 'Activate, suspend, reactivate'], ['onboarding.run', 'Onboard new customers'], ['entitlements.manage', 'Change entitlements and limits'],
    ['entitlements.global', 'Global feature switches'], ['plans.manage', 'Manage plans'], ['catalog.manage', 'Manage configuration catalogues'],
    ['domains.manage', 'Manage domains'], ['branding.manage', 'Manage branding'], ['licences.manage', 'Issue, renew and revoke licences'],
    ['releases.publish', 'Publish releases and roll out updates'], ['fleet.view', 'View fleet monitoring'], ['billing.manage', 'Vendor billing'],
    ['support.manage', 'Support tickets and announcements'], ['support.remote', 'Request remote support sessions'], ['demo.manage', 'Demo leads and sandboxes'],
    ['staff.manage', 'Manage vendor staff and roles'], ['audit.view', 'View vendor audit log'],
  ];
  /** Pending-decision note for a page. */
  SA.pending = (pd, html) => PP.ui.alert('info', `<b>${esc(pd)} pending.</b> ${html}`);
  SA.noPatientData = () => PP.ui.alert('info', '<b>No patient data here.</b> The control plane receives only versions, health flags and aggregated counters (numbers such as “patients: 1,240”). It never stores patient records, clinical notes, prescriptions or the customer’s patient invoices.');
  SA.customerOptions = (sel, filter) => (PP.db.customers || []).filter(filter || (() => true)).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  SA.customerLink = (id) => { const c = SA.customer(id); return c ? `<a href="#/customers/${c.id}">${esc(c.name)}</a>` : '—'; };
  /** Per-customer panels registered by page files and shown as tabs on the customer detail page. */
  SA.panels = SA.panels || {};
  /** Usage bar: counter vs limit. */
  SA.usageBar = function (used, limit) {
    if (limit == null || limit === '') return `<div class="sa-usage"><div class="sa-usage-bar"><span style="width:8%"></span></div><span class="small muted mono">${PP.fmt.num(used)} / Unlimited</span></div>`;
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100; const tone = used > limit ? 'error' : pct >= 85 ? 'warning' : 'positive';
    return `<div class="sa-usage"><div class="sa-usage-bar ${tone}"><span style="width:${Math.max(3, pct)}%"></span></div><span class="small mono ${used > limit ? 'sa-over' : 'muted'}">${PP.fmt.num(used)} / ${PP.fmt.num(limit)}${used > limit ? ' · over limit' : ''}</span></div>`;
  };
  SA.ago = function (stamp) {
    if (!stamp) return '—';
    const m = Math.round((Date.now() - new Date(stamp).getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 48) return `${h} h ago`; return `${Math.round(h / 24)} days ago`;
  };
  SA.stampDaysAgo = (days, hh, mm) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hh == null ? 10 : hh, mm || 0, 0, 0); return d.toISOString(); };
  SA.stampHoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
})();
