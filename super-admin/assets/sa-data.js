/* Physio Point — vendor control plane seed data (fictional, deterministic). Stored under PP_STORE_KEY 'pp-control-plane-v1'.
   Contains customer organisations, plans, licences, domains, deployments, vendor invoices, tickets and demo leads.
   It never contains patient or clinical data (control-plane.md §3). */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA;
  PP.version = 'control-plane-0.1.0'; // separate store; bump when this seed changes (a bump re-seeds: prefer a PP.registerSeed migration)

  /* Vendor staff: one or more per role (lastLogin = [days ago, hour, minute]). VS-6 stays disabled. */
  SA.SEED_STAFF = [
    { id: 'VS-1', name: 'Arif Hossain', email: 'arif@vendor.example', mobile: '01811-200001', role: 'super_admin', status: 'Active', mfa: true, lastLogin: [0, 9, 5] },
    { id: 'VS-2', name: 'Nusrat Jahan', email: 'nusrat@vendor.example', mobile: '01811-200002', role: 'sales_manager', status: 'Active', mfa: true, lastLogin: [0, 10, 12] },
    { id: 'VS-3', name: 'Kamrul Hasan', email: 'kamrul@vendor.example', mobile: '01811-200003', role: 'support_manager', status: 'Active', mfa: true, lastLogin: [0, 8, 40] },
    { id: 'VS-4', name: 'Tahmina Akter', email: 'tahmina@vendor.example', mobile: '01811-200004', role: 'finance_admin', status: 'Active', mfa: true, lastLogin: [1, 17, 2] },
    { id: 'VS-5', name: 'Imran Chowdhury', email: 'imran@vendor.example', mobile: '01811-200005', role: 'technical_admin', status: 'Active', mfa: true, lastLogin: [0, 11, 30] },
    { id: 'VS-6', name: 'Sharmin Sultana', email: 'sharmin@vendor.example', mobile: '01811-200006', role: 'support_agent', status: 'Disabled', mfa: true, lastLogin: [42, 15, 0] },
    { id: 'VS-7', name: 'Farhana Islam', email: 'farhana@vendor.example', mobile: '01811-200007', role: 'saas_admin', status: 'Active', mfa: true, lastLogin: [0, 9, 50] },
    { id: 'VS-8', name: 'Rakib Uddin', email: 'rakib@vendor.example', mobile: '01811-200008', role: 'license_manager', status: 'Active', mfa: true, lastLogin: [1, 14, 20] },
    { id: 'VS-9', name: 'Sadia Afrin', email: 'sadia@vendor.example', mobile: '01811-200009', role: 'support_agent', status: 'Active', mfa: true, lastLogin: [0, 9, 15] },
  ];
  /* Old role ids (6-role proposal) → the 8 roles. 'auditor' has no safe equivalent: mapping a read-only role to a manager
     role would widen access, so a legacy read-only "Auditor" role is kept only while some non-seed account still uses it. */
  SA.LEGACY_ROLE_MAP = { owner: 'super_admin', sales: 'sales_manager', support: 'support_manager', billing: 'finance_admin', engineering: 'technical_admin' };
  const LEGACY_IDS = ['owner', 'sales', 'support', 'billing', 'engineering', 'auditor'];

  /* One-time migration of a store seeded before the 8 roles existed. Runs once per stored dataset (PP.registerSeed);
     on a fresh seed it finds nothing to do. Only roles, staff and remote-session records change; nothing is wiped. */
  PP.registerSeed('sa-vendor-roles-v2', (db) => {
    db.roles = db.roles || []; db.users = db.users || [];
    const hasLegacy = db.roles.some((r) => LEGACY_IDS.includes(r.id)) || db.users.some((u) => LEGACY_IDS.includes(u.role));
    const seedById = Object.fromEntries(SA.SEED_STAFF.map((s) => [s.id, s]));
    const OLD_SEED_ROLE = { 'VS-1': 'owner', 'VS-2': 'sales', 'VS-3': 'support', 'VS-4': 'billing', 'VS-5': 'engineering', 'VS-6': 'auditor' };
    const notes = [];
    if (hasLegacy) {
      const custom = db.roles.filter((r) => !LEGACY_IDS.includes(r.id) && !SA.VENDOR_ROLES.some((v) => v.id === r.id)); // roles added in the UI stay
      let keepAuditor = false;
      db.users.forEach((u) => {
        const before = u.role;
        if (seedById[u.id] && OLD_SEED_ROLE[u.id] === u.role) u.role = seedById[u.id].role; // the seeded account, untouched since: use its new seed role
        else if (SA.LEGACY_ROLE_MAP[u.role]) u.role = SA.LEGACY_ROLE_MAP[u.role];
        else if (u.role === 'auditor') keepAuditor = true;
        if (before !== u.role) notes.push(`${u.id} ${before}→${u.role}`);
      });
      const legacyAuditor = db.roles.find((r) => r.id === 'auditor');
      db.roles = SA.VENDOR_ROLES.map((r) => Object.assign({}, r, { permissions: r.permissions.slice() })).concat(custom);
      if (keepAuditor) db.roles.push({ id: 'auditor', name: 'Auditor (legacy, read-only)', description: 'Kept from the earlier role proposal. Read-only; reassign these accounts to one of the 8 roles.', permissions: (legacyAuditor ? legacyAuditor.permissions : ['dashboard.view', 'customers.view', 'audit.view']).filter((p) => /\.view$/.test(p)) });
    } else if (!db.roles.some((r) => r.id === 'super_admin')) {
      db.roles = SA.VENDOR_ROLES.map((r) => Object.assign({}, r, { permissions: r.permissions.slice() })).concat(db.roles);
    }
    // add the new seeded accounts when missing (matched by email; ids never collide with accounts added in the UI)
    SA.SEED_STAFF.forEach((s) => {
      if (db.users.some((u) => u.email.toLowerCase() === s.email)) return;
      let nid = s.id; if (db.users.some((u) => u.id === nid)) nid = `VS-${Math.max(0, ...db.users.map((u) => Number(String(u.id).replace(/\D/g, '')) || 0)) + 1}`;
      db.users.push(Object.assign({}, s, { id: nid, lastLogin: SA.stampDaysAgo(s.lastLogin[0], s.lastLogin[1], s.lastLogin[2]) })); notes.push(`added ${nid} ${s.role}`);
    });
    // remote-support records: add the vendor approval step and a request expiry
    (db.remoteSessions || []).forEach((s) => {
      if (s.status === 'Requested' && !s.consentBy) s.status = 'Pending approval';
      if (!s.expiresAt) s.expiresAt = new Date(new Date(s.requestedAt).getTime() + SA.REMOTE_REQUEST_HOURS * 3600000).toISOString();
      if (s.approvedBy === undefined) s.approvedBy = s.status === 'Pending approval' ? null : 'Not recorded (before the approval step)';
      if (!s.requestedById) { const u = db.users.find((x) => x.name === s.requestedBy); s.requestedById = u ? u.id : null; }
      if (!s.assigneeId) s.assigneeId = s.requestedById;
    });
    if (notes.length) {
      db.counters.AUD = (db.counters.AUD || 0) + 1;
      db.audit.unshift({ id: `AUD-${String(db.counters.AUD).padStart(6, '0')}`, at: new Date().toISOString(), userId: null, userName: 'System', action: 'Vendor roles migrated', target: 'role:*', detail: `8-role model · ${notes.join(', ')}` });
    }
  });

  PP.seedData = function () {
    const T = PP.today(); const D = (n) => PP.addDays(T, n);
    const S = (days, h, m) => SA.stampDaysAgo(days, h, m);
    const rng = PP.rng(20261125);

    /* ---------------------------------------------------------------- staff and roles (D-036: 8 vendor roles, see SA.VENDOR_ROLES) */
    const roles = SA.VENDOR_ROLES.map((r) => Object.assign({}, r, { permissions: r.permissions.slice() }));
    const users = SA.SEED_STAFF.map((u) => Object.assign({}, u, { lastLogin: u.lastLogin ? S(u.lastLogin[0], u.lastLogin[1], u.lastLogin[2]) : null }));

    /* ---------------------------------------------------------------- configuration catalogues (D-020) */
    const businessTypes = [
      { id: 'physiotherapy', label: 'Physiotherapy clinic', professional: 'Therapist', professionals: 'Therapists', org: 'Clinic', professionalTypes: ['PT-PHYSIO', 'PT-ASSIST', 'PT-CONSULT'], modules: ['appointments', 'clinical', 'care_plans', 'prescriptions', 'exercises', 'billing', 'packages', 'queue'], forms: ['FT-01', 'FT-02', 'FT-03'], status: 'Active' },
      { id: 'medical', label: 'Medical clinic', professional: 'Doctor', professionals: 'Doctors', org: 'Clinic', professionalTypes: ['PT-DOCTOR', 'PT-NURSE'], modules: ['appointments', 'queue', 'clinical', 'prescriptions', 'billing', 'lab'], forms: ['FT-04', 'FT-05'], status: 'Active' },
      { id: 'dental', label: 'Dental clinic', professional: 'Dentist', professionals: 'Dentists', org: 'Clinic', professionalTypes: ['PT-DENTIST', 'PT-DENT-ASSIST'], modules: ['appointments', 'clinical', 'dental', 'care_plans', 'prescriptions', 'billing'], forms: ['FT-06', 'FT-07'], status: 'Active' },
      { id: 'diagnostic', label: 'Diagnostic centre', professional: 'Consultant', professionals: 'Consultants', org: 'Centre', professionalTypes: ['PT-PATHO', 'PT-RADIO', 'PT-TECH'], modules: ['lab', 'billing', 'queue', 'reports'], forms: ['FT-08', 'FT-09'], status: 'Active' },
      { id: 'rehab', label: 'Rehabilitation centre', professional: 'Rehab Specialist', professionals: 'Rehab Specialists', org: 'Centre', professionalTypes: ['PT-PHYSIO', 'PT-OT', 'PT-SPEECH', 'PT-CONSULT'], modules: ['appointments', 'clinical', 'care_plans', 'exercises', 'packages', 'billing'], forms: ['FT-01', 'FT-10'], status: 'Active' },
      { id: 'wellness', label: 'Wellness centre', professional: 'Practitioner', professionals: 'Practitioners', org: 'Centre', professionalTypes: ['PT-WELL', 'PT-NUTRI'], modules: ['appointments', 'packages', 'billing', 'feedback'], forms: ['FT-11'], status: 'Active' },
      { id: 'specialist', label: 'Specialist chamber', professional: 'Consultant', professionals: 'Consultants', org: 'Chamber', professionalTypes: ['PT-DOCTOR'], modules: ['appointments', 'queue', 'clinical', 'prescriptions', 'billing'], forms: ['FT-04'], status: 'Draft' },
    ];
    const pt = (id, name, bts, c) => ({ id, name, businessTypes: bts, canBeBooked: c[0], canRecordClinical: c[1], canPrescribeExercise: c[2], canPrescribeMedication: c[3], canIssueCertificate: c[4], status: 'Active' });
    const professionalTypes = [
      pt('PT-PHYSIO', 'Physiotherapist', ['physiotherapy', 'rehab'], [1, 1, 1, 0, 1]),
      pt('PT-ASSIST', 'Physiotherapy Assistant', ['physiotherapy'], [1, 1, 0, 0, 0]),
      pt('PT-CONSULT', 'Consultant Physician (PM&R)', ['physiotherapy', 'rehab'], [1, 1, 1, 1, 1]),
      pt('PT-DOCTOR', 'Medical Doctor', ['medical', 'specialist'], [1, 1, 0, 1, 1]),
      pt('PT-NURSE', 'Nurse', ['medical'], [0, 1, 0, 0, 0]),
      pt('PT-DENTIST', 'Dental Surgeon', ['dental'], [1, 1, 0, 1, 1]),
      pt('PT-DENT-ASSIST', 'Dental Assistant', ['dental'], [0, 0, 0, 0, 0]),
      pt('PT-PATHO', 'Pathologist', ['diagnostic'], [0, 1, 0, 0, 1]),
      pt('PT-RADIO', 'Radiologist', ['diagnostic'], [1, 1, 0, 0, 1]),
      pt('PT-TECH', 'Lab Technologist', ['diagnostic'], [0, 0, 0, 0, 0]),
      pt('PT-OT', 'Occupational Therapist', ['rehab'], [1, 1, 1, 0, 0]),
      pt('PT-SPEECH', 'Speech and Language Therapist', ['rehab'], [1, 1, 1, 0, 0]),
      pt('PT-WELL', 'Wellness Practitioner', ['wellness'], [1, 0, 1, 0, 0]),
      pt('PT-NUTRI', 'Nutritionist', ['wellness'], [1, 1, 0, 0, 0]),
    ].map((p) => Object.assign(p, { canBeBooked: !!p.canBeBooked, canRecordClinical: !!p.canRecordClinical, canPrescribeExercise: !!p.canPrescribeExercise, canPrescribeMedication: !!p.canPrescribeMedication, canIssueCertificate: !!p.canIssueCertificate }));
    const ft = (id, name, bts, kind, fields, version, status, days) => ({ id, name, businessTypes: bts, kind, fields, version, status, updatedAt: D(-days) });
    const formTemplates = [
      ft('FT-01', 'Musculoskeletal assessment', ['physiotherapy', 'rehab'], 'Assessment', 24, 3, 'Approved', 40),
      ft('FT-02', 'Pain map and range of motion', ['physiotherapy'], 'Assessment', 18, 2, 'Approved', 65),
      ft('FT-03', 'Exercise prescription', ['physiotherapy'], 'Prescription', 12, 4, 'Approved', 21),
      ft('FT-04', 'General consultation (SOAP)', ['medical', 'specialist'], 'Encounter', 16, 2, 'Approved', 90),
      ft('FT-05', 'Medication prescription', ['medical'], 'Prescription', 10, 3, 'Approved', 33),
      ft('FT-06', 'Dental examination and tooth chart', ['dental'], 'Assessment', 32, 2, 'Approved', 52),
      ft('FT-07', 'Dental treatment consent', ['dental'], 'Consent', 8, 1, 'Approved', 120),
      ft('FT-08', 'Lab test requisition', ['diagnostic'], 'Order', 14, 2, 'Approved', 70),
      ft('FT-09', 'Imaging report', ['diagnostic'], 'Report', 11, 1, 'Draft', 6),
      ft('FT-10', 'Neuro rehabilitation goals', ['rehab'], 'Care plan', 20, 1, 'Approved', 44),
      ft('FT-11', 'Wellness intake questionnaire', ['wellness'], 'Intake', 15, 2, 'Approved', 28),
    ];

    /* ------------------------------------------------------------------------------ plans (PD-008) */
    const starter = [
      'org.profile', 'org.branches', 'org.working_hours', 'users.accounts', 'users.rbac',
      'patients.registration', 'patients.profile', 'patients.medical_history', 'patients.allergies', 'patients.previous_treatments', 'patients.timeline', 'patients.duplicate_detection', 'patients.referral_source', 'patients.family_links',
      'professionals.profile', 'professionals.qualification', 'professionals.specialization', 'professionals.registration_number', 'professionals.schedule', 'professionals.availability', 'professionals.leave',
      'appointments.booking', 'appointments.online_request', 'appointments.calendar', 'appointments.reschedule', 'appointments.cancel', 'appointments.walk_in', 'appointments.no_show', 'appointments.professional_availability', 'appointments.double_booking_prevention',
      'clinical.medical_history', 'clinical.notes', 'clinical.soap', 'clinical.vitals', 'clinical.assessment',
      'care_plans.treatment_plans', 'care_plans.session_plans', 'care_plans.follow_up', 'care_plans.progress',
      'prescriptions.templates', 'prescriptions.dosage', 'prescriptions.pdf', 'prescriptions.template_approval',
      'services.catalog', 'services.pricing', 'services.categories', 'services.custom_pricing',
      'exercises.library', 'exercises.instructions', 'exercises.assignment',
      'billing.invoices', 'billing.payments', 'billing.partial_payments', 'billing.discounts', 'billing.refunds', 'billing.reversals', 'billing.cash_closing',
      'finance.income_entry', 'finance.expense_entry', 'finance.categories',
      'reports.collections', 'reports.appointments', 'reports.export', 'analytics.dashboards',
      'notifications.sms', 'notifications.templates', 'notifications.consent', 'notifications.logs', 'notifications.in_app',
    ];
    const professional = starter.concat([
      'org.branch_managers', 'org.rooms', 'org.equipment', 'users.custom_roles', 'users.branch_access', 'patients.documents', 'patients.merge', 'patients.consent_forms', 'professionals.attendance', 'professionals.branch_assignment',
      'appointments.recurring', 'appointments.room_availability', 'appointments.home_visit', 'appointments.equipment_availability',
      'queue.check_in', 'queue.waiting_list', 'queue.queue_number', 'queue.waiting_time', 'queue.check_out', 'queue.token_print',
      'clinical.diagnosis', 'clinical.pain_mapping', 'clinical.range_of_motion', 'clinical.functional_assessment', 'clinical.attachments', 'clinical.configurable_forms',
      'care_plans.goals', 'care_plans.plan_history', 'prescriptions.medication_catalog', 'prescriptions.professional_approval', 'prescriptions.certificates', 'prescriptions.referral_letters', 'prescriptions.print_designer',
      'services.professional_fees', 'exercises.media', 'billing.advance_balance', 'billing.due_reminders', 'billing.taxes',
      'finance.payment_tracking', 'finance.branch_summary', 'finance.monthly_reports', 'finance.profit_loss_summary', 'finance.export',
      'commissions.rules', 'commissions.manual_rate', 'commissions.accrual', 'commissions.adjustments', 'commissions.settlement', 'commissions.payout', 'commissions.audit',
      'packages.session_packages', 'packages.memberships', 'packages.validity', 'packages.session_deduction', 'packages.expiry', 'packages.renewal', 'packages.usage_history',
      'reports.clinical', 'reports.by_payment_method', 'reports.owner_daily_summary', 'analytics.trends', 'notifications.whatsapp', 'notifications.email',
      'referrals.inbound', 'referrals.outbound', 'feedback.collection', 'feedback.reports', 'system.custom_fields',
    ]);
    const enterprise = SA.OPTIONAL_FEATURES.slice();
    const plans = [
      { id: 'PLN-STARTER', code: 'starter', name: 'Starter', description: 'Single-branch clinics getting started', priceMonthly: 2500, priceYearly: 25000, features: starter, limits: { branches: 1, users: 8, professionals: 5, patients: 3000, appointments_monthly: 1500 }, status: 'Active', updatedAt: D(-60) },
      { id: 'PLN-PRO', code: 'professional', name: 'Professional', description: 'Growing clinics with several branches', priceMonthly: 6000, priceYearly: 60000, features: professional, limits: { branches: 3, users: 25, professionals: 20, patients: 20000, appointments_monthly: 6000 }, status: 'Active', updatedAt: D(-30) },
      { id: 'PLN-ENT', code: 'enterprise', name: 'Enterprise', description: 'Hospitals, groups and diagnostic chains', priceMonthly: 15000, priceYearly: 150000, features: enterprise, limits: { branches: 10, users: 120, professionals: 80, patients: null, appointments_monthly: null }, status: 'Active', updatedAt: D(-30) },
      { id: 'PLN-LEGACY', code: 'legacy_basic', name: 'Basic (legacy)', description: 'Retired 2026; existing customers keep it until renewal', priceMonthly: 1800, priceYearly: 18000, features: starter.filter((f) => !f.startsWith('finance.') && !f.startsWith('care_plans.')), limits: { branches: 1, users: 5, professionals: 3, patients: 2000, appointments_monthly: 1000 }, status: 'Retired', updatedAt: D(-200) },
    ];

    /* ------------------------------------------------------------------------------ customers */
    // [id, name, bt, city, plan, status, licEnd (days from today), branches, hosting, channel, version, contact, mobile, usage, notes]
    const C = [
      ['CUS-0001', 'Physio Point Clinic', 'physiotherapy', 'Khulna', 'PLN-PRO', 'Active', 128, ['Sonadanga Branch', 'Khalishpur Branch'], 'Vendor-managed', 'stable', '1.4.2', 'Clinic Administrator', '01711-000010', [2, 9, 5, 1284, 612], 'app.physiopointclinic.com.bd'],
      ['CUS-0002', 'Shanti Medical Centre', 'medical', 'Dhaka', 'PLN-ENT', 'Active', 240, ['Mirpur 10', 'Pallabi', 'Kazipara'], 'Customer-managed', 'stable', '1.4.2', 'Dr. Mahmudul Karim', '01712-410022', [3, 46, 31, 18420, 5210], 'portal.shantimedical.com.bd'],
      ['CUS-0003', 'Smile Care Dental', 'dental', 'Chattogram', 'PLN-PRO', 'Active', -5, ['GEC Circle'], 'Vendor-managed', 'stable', '1.4.1', 'Dr. Farhana Chowdhury', '01813-552301', [1, 11, 6, 4210, 980], 'app.smilecaredental.com.bd'],
      ['CUS-0004', 'Lifeline Diagnostic & Imaging', 'diagnostic', 'Sylhet', 'PLN-ENT', 'Active', 20, ['Zindabazar', 'Ambarkhana'], 'Vendor-managed', 'stable', '1.4.1', 'Abdul Mukit', '01714-660134', [2, 38, 14, 26800, 7400], 'lims.lifelinesylhet.com'],
      ['CUS-0005', 'Rise Rehabilitation Centre', 'rehab', 'Rajshahi', 'PLN-PRO', 'Active', -40, ['Uposhohor'], 'Customer-managed', 'stable', '1.3.4', 'Shahidul Islam', '01715-118845', [1, 14, 9, 2310, 0], 'care.riserehab.org'],
      ['CUS-0006', 'Shobuj Wellness Studio', 'wellness', 'Dhaka', 'PLN-STARTER', 'Suspended', 70, ['Gulshan 2'], 'Vendor-managed', 'stable', '1.4.2', 'Rumana Haque', '01716-903311', [1, 6, 4, 880, 0], 'book.shobujwellness.com'],
      ['CUS-0007', 'Motion Physio & Sports Clinic', 'physiotherapy', 'Dhaka', 'PLN-STARTER', 'Active', 9, ['Dhanmondi 27'], 'Vendor-managed', 'stable', '1.4.2', 'Dr. Tasnim Ara', '01717-224580', [1, 8, 5, 2890, 1420], 'app.motionphysio.com.bd'],
      ['CUS-0008', 'Arogya Family Clinic', 'medical', 'Barishal', 'PLN-STARTER', 'Active', 190, ['Sadar Road'], 'Customer-managed', 'stable', '1.4.0', 'Dr. Anisur Rahman', '01718-447120', [1, 7, 4, 2460, 1180], 'clinic.arogyabd.com'],
      ['CUS-0009', 'Dentique Dental Studio', 'dental', 'Dhaka', 'PLN-STARTER', 'Onboarding', 365, ['Uttara Sector 7'], 'Vendor-managed', 'stable', null, 'Dr. Nabila Siddique', '01719-338206', [0, 0, 0, 0, 0], 'app.dentique.com.bd'],
      ['CUS-0010', 'Padma Diagnostic Lab', 'diagnostic', 'Rajshahi', 'PLN-PRO', 'Active', 150, ['Shaheb Bazar'], 'Vendor-managed', 'early', '1.5.0-rc.1', 'Masud Rana', '01720-551876', [1, 19, 7, 9750, 3010], 'reports.padmadiagnostic.com'],
      ['CUS-0011', 'Nirvana Neuro Rehab', 'rehab', 'Khulna', 'PLN-ENT', 'Active', 27, ['Boyra', 'Gollamari'], 'Vendor-managed', 'early', '1.5.0-rc.1', 'Dr. Sabrina Yasmin', '01721-770942', [2, 22, 16, 3920, 1870], 'app.nirvananeuro.com.bd'],
      ['CUS-0012', 'Prokriti Wellness & Physio', 'wellness', 'Cumilla', 'PLN-STARTER', 'Active', 75, ['Kandirpar'], 'Customer-managed', 'stable', '1.4.2', 'Jannatul Ferdous', '01722-109354', [1, 5, 3, 1105, 540], 'app.prokritiwellness.com'],
    ];
    const termOverrides = { 'CUS-0005': { professional: 'Therapist', professionals: 'Therapists' }, 'CUS-0012': { professional: 'Therapist', professionals: 'Therapists' } };
    const created = [420, 380, 300, 260, 410, 210, 150, 120, 4, 95, 70, 60];
    const palette = [['#083E44', '#008B83'], ['#1d3557', '#2a9d8f'], ['#0b3954', '#00a6a6'], ['#3a0ca3', '#4895ef'], ['#264653', '#e76f51'], ['#2d6a4f', '#52b788'], ['#14213d', '#fca311'], ['#003049', '#d62828'], ['#22223b', '#4a4e69'], ['#5f0f40', '#0f4c5c'], ['#1b263b', '#415a77'], ['#344e41', '#a3b18a']];
    const customers = []; const domains = []; const deployments = []; const licences = []; const audit = [];
    const counters = { AUD: 0, OVR: 0, LIC: 0, DOM: 0, DEP: 0, VIN: 0, PAY: 0, TCK: 0, MSG: 0, ANN: 0, RSS: 0, LEAD: 0, SBX: 0, VAL: 0, REL: 0, NTF: 0, REM: 0 };
    const id = (p, w) => { counters[p] = (counters[p] || 0) + 1; return `${p}-${String(counters[p]).padStart(w || 4, '0')}`; };
    const log = (days, userId, action, target, detail) => { const u = users.find((x) => x.id === userId); audit.push({ id: '', at: S(days, 9 + (days % 8), (days * 7) % 60), userId, userName: u ? u.name : 'System', action, target, detail }); };

    C.forEach((r, i) => {
      const [cid, name, bt, city, planId, status, licEnd, branches, hosting, channel, version, contact, mobile, usage, host] = r;
      const btDef = businessTypes.find((b) => b.id === bt);
      const c = {
        id: cid, tenantId: SA.genTenantId(cid + name), name, legalName: name + (i % 3 === 0 ? ' Ltd.' : ''), businessType: bt,
        terminology: termOverrides[cid] || {}, city, address: `${branches[0]}, ${city}`,
        contact: { name: contact, email: `admin@${host.split('.').slice(1).join('.')}`, mobile },
        branches: branches.map((b, k) => ({ id: `BR-${k + 1}`, name: b, address: `${b}, ${city}` })),
        professionalTypes: btDef.professionalTypes.slice(), planId, billingCycle: i % 4 === 2 ? 'Monthly' : 'Yearly', status,
        suspendReason: status === 'Suspended' ? 'Three invoices unpaid for more than 60 days (VIN-0016). Customer informed by phone and email.' : '',
        createdAt: D(-created[i]), activatedAt: status === 'Onboarding' ? null : D(-created[i] + 6),
        hostingModel: hosting, hosting: { provider: ['DigitalOcean', 'AWS Lightsail', 'Own server (on-premise)', 'Hetzner', 'Bangladesh local VPS'][i % 5], region: ['Singapore', 'Mumbai', 'On-premise', 'Frankfurt', 'Dhaka'][i % 5], server: ['4 vCPU · 8 GB', '2 vCPU · 4 GB', 'Dell T140', '4 vCPU · 16 GB', '2 vCPU · 8 GB'][i % 5], os: 'Ubuntu 24.04 LTS', docker: 'Docker 27' },
        channel, initialConfig: { language: i % 2 ? 'Bangla + English' : 'English + Bangla', currency: 'BDT', timezone: 'Asia/Dhaka', sampleServices: true, slotMinutes: 30 },
        branding: { brandName: name, tagline: btDef.label, primary: palette[i][0], action: palette[i][1], logo: '', favicon: '', loginHeadline: `Welcome to ${name}`, invoiceFooter: 'Thank you for choosing us. Get well soon.', emailSignature: `${name} · ${city}` },
        entitlementVersion: 0, notes: i === 0 ? 'Reference customer for the clinic workspace prototype.' : '',
      };
      customers.push(c);
      log(created[i], 'VS-2', 'Customer created (onboarding wizard)', cid, `${name} · ${btDef.label} · ${planId}`);
      // domain
      const verified = status !== 'Onboarding';
      domains.push({ id: id('DOM'), customerId: cid, host, primary: true, txtName: `_pp-verify.${host}`, txtValue: SA.genTxt(host), target: `${host}. A → customer server`, status: verified ? 'Verified' : 'Pending', verifiedAt: verified ? D(-created[i] + 3) : null, lastCheck: S(verified ? 1 : 0, 7, 0), ssl: verified ? (cid === 'CUS-0008' ? 'Expiring' : 'Issued') : 'Not started', sslExpires: verified ? D(cid === 'CUS-0008' ? 6 : 40 + (i * 7) % 50) : null, sslIssuer: "Let's Encrypt (ACME, on the customer's server)" });
      if (cid === 'CUS-0002') domains.push({ id: id('DOM'), customerId: cid, host: 'booking.shantimedical.com.bd', primary: false, txtName: '_pp-verify.booking.shantimedical.com.bd', txtValue: SA.genTxt('b2'), target: 'CNAME → portal.shantimedical.com.bd', status: 'Failed', verifiedAt: null, lastCheck: S(0, 6, 0), ssl: 'Not started', sslExpires: null, sslIssuer: "Let's Encrypt (ACME, on the customer's server)", failReason: 'TXT record not found. The record was added to the wrong DNS zone.' });
      // licence (history: an older superseded licence for long-standing customers)
      const start = D(licEnd - 365);
      if (created[i] > 300) licences.push({ id: id('LIC'), customerId: cid, key: SA.genLicenceKey(cid + 'old'), planId, start: D(licEnd - 730), end: D(licEnd - 366), status: 'Superseded', domains: [host], issuedAt: S(created[i], 11), by: 'Tahmina Akter', note: 'Replaced at renewal' });
      licences.push({ id: id('LIC'), customerId: cid, key: SA.genLicenceKey(cid), planId, start: status === 'Onboarding' ? T : start, end: D(licEnd), status: 'Issued', domains: [host], issuedAt: S(Math.max(1, Math.min(created[i], -licEnd + 365)), 11), by: 'Tahmina Akter', note: '' });
      // deployment (aggregated counters only)
      const failed = cid === 'CUS-0004' ? 2 : cid === 'CUS-0005' ? 1 : 0;
      const backupDays = { 'CUS-0008': 9, 'CUS-0005': 41, 'CUS-0003': 3 }[cid] || 0;
      deployments.push({
        id: id('DEP'), customerId: cid, version, channel, server: c.hosting.server, provider: c.hosting.provider,
        updateStatus: status === 'Onboarding' ? 'Not installed' : cid === 'CUS-0004' ? 'Failed' : cid === 'CUS-0005' ? 'Rolled back' : version === '1.4.2' || version === '1.5.0-rc.1' ? 'Up to date' : 'Update available',
        lastHeartbeat: status === 'Onboarding' ? null : cid === 'CUS-0005' ? S(3, 4, 10) : SA.stampHoursAgo(cid === 'CUS-0008' ? 7 : rng.int(1, 40) / 60),
        lastBackup: status === 'Onboarding' ? null : S(backupDays, 2, 0), backupStatus: status === 'Onboarding' ? 'None' : backupDays > 7 ? 'Warning' : 'Success', lastRestoreTest: status === 'Onboarding' ? null : D(-(30 + i * 5)),
        failedUpdates: failed, lastUpdateAt: status === 'Onboarding' ? null : D(-(4 + i)), lastError: cid === 'CUS-0004' ? 'Migration 0142_lab_results_index timed out. Rolled back automatically to 1.4.1 with the pre-update backup.' : cid === 'CUS-0005' ? 'Health check failed after update to 1.4.0; rolled back to 1.3.4.' : '',
        health: status === 'Onboarding' ? 'Not installed' : cid === 'CUS-0005' ? 'Down' : cid === 'CUS-0004' || cid === 'CUS-0008' ? 'Warning' : 'Healthy',
        usage: { branches: usage[0], users: usage[1], professionals: usage[2], patients: usage[3], appointments_month: usage[4] },
        updateHistory: version ? [{ at: D(-(4 + i)), from: '1.4.0', to: version, result: failed ? 'Failed' : 'Success' }] : [],
      });
    });

    const data = {
      settings: { clinicName: 'Physio Point Control Plane', vendorName: 'Physio Point', currencyStyle: 'code', primary: '#1E1B4B', action: '#008B83', graceDays: 14, trialDays: 14, sandboxDeleteDays: 7, validationHours: 24 },
      session: { userId: null, mfaAt: null }, counters, users, roles, notifications: [], audit,
      businessTypes, professionalTypes, formTemplates, plans, customers, domains, deployments, licences,
      globalSwitches: {
        'notifications.whatsapp': { state: 'on', reason: '', at: S(20), by: 'Imran Chowdhury' },
        'patient_app.access': { state: 'beta', reason: 'Staged rollout: early channel only', at: S(12), by: 'Imran Chowdhury' },
        'reports.owner_daily_summary': { state: 'off', reason: 'Kill switch: duplicate WhatsApp summaries reported in TCK-0004. Fix ships in 1.5.0.', at: S(2, 14, 20), by: 'Imran Chowdhury' },
      },
      overrides: [], entitlementSets: [], licenceChecks: [], releases: [], vendorInvoices: [], reminders: [], tickets: [], announcements: [], remoteSessions: [], leads: [], sandboxes: [],
      channels: { stable: '1.4.2', early: '1.5.0-rc.1' },
    };

    /* --------------------------------------------------------------- entitlement history per customer */
    const ov = (cid, type, code, action, value, reason, expires, days, by) => { const o = { id: id('OVR'), customerId: cid, type, code, action, value: value == null ? null : value, reason, expires: expires || null, by: by || 'Nusrat Jahan', at: S(days), removed: false }; data.overrides.push(o); return o; };
    const pub = (c, reason, days, by, kind) => SA.publish(c, reason, { at: S(days, 12), by: by || 'Nusrat Jahan', kind }, data);
    customers.forEach((c, i) => { if (c.status !== 'Onboarding' || true) pub(c, 'Initial entitlement set from onboarding', created[i], 'Nusrat Jahan'); });
    const c1 = customers[0];
    ov('CUS-0001', 'feature', 'inventory.items', 'grant', null, 'Trial of inventory for the clinic gym equipment; agreed with owner', D(45), 90); ov('CUS-0001', 'feature', 'inventory.stock', 'grant', null, 'Goes with inventory.items', D(45), 90);
    pub(c1, 'Inventory trial granted (45 days)', 90);
    ov('CUS-0001', 'limit', 'branches', 'value', 3, 'Third branch planned in Boyra for 2027', null, 40, 'Arif Hossain');
    pub(c1, 'Branch limit raised to 3', 40, 'Arif Hossain');
    ov('CUS-0001', 'feature', 'lab.test_catalog', 'grant', null, 'Pilot: in-house X-ray referrals', null, 12, 'Arif Hossain'); ov('CUS-0001', 'feature', 'lab.orders', 'grant', null, 'Pilot: in-house X-ray referrals', null, 12, 'Arif Hossain');
    pub(c1, 'Lab pilot (test catalogue, orders)', 12, 'Arif Hossain');
    const c2 = customers[1];
    ov('CUS-0002', 'limit', 'users', 'value', 150, 'Hospital wing added; contract addendum #3', null, 60, 'Arif Hossain'); pub(c2, 'User limit raised for the new wing', 60, 'Arif Hossain');
    const c3 = customers[2]; ov('CUS-0003', 'feature', 'patient_portal.access', 'grant', null, 'Promotional: 3 months free portal', D(-10), 100); pub(c3, 'Portal promo granted (expires)', 100);
    const c4 = customers[3]; ov('CUS-0004', 'feature', 'dental.tooth_chart', 'revoke', null, 'Not a dental customer; removed to simplify menus', null, 200, 'Kamrul Hasan'); pub(c4, 'Dental module revoked on request', 200, 'Kamrul Hasan');
    const c7 = customers[6]; ov('CUS-0007', 'feature', 'appointments.home_visit', 'grant', null, 'Home-visit physiotherapy add-on purchased', null, 50); pub(c7, 'Home visit add-on', 50);
    ov('CUS-0007', 'limit', 'professionals', 'value', 7, 'Add-on: two extra professionals', D(120), 30); pub(c7, 'Two extra professionals (add-on)', 30);
    const c11 = customers[10]; ov('CUS-0011', 'feature', 'patient_app.access', 'grant', null, 'Early channel beta of the patient app', D(60), 20, 'Imran Chowdhury'); pub(c11, 'Patient app beta', 20, 'Imran Chowdhury');
    const c12 = customers[11]; ov('CUS-0012', 'feature', 'packages.session_packages', 'grant', null, 'Wellness packages are core to this business', null, 55); ov('CUS-0012', 'feature', 'packages.memberships', 'grant', null, 'Wellness packages are core to this business', null, 55); pub(c12, 'Packages add-on', 55);

    /* ------------------------------------------------------------------------------ releases */
    const rel = (version, days, channel, status, signature, notes, minPrev, migr) => ({ id: id('REL'), version, date: D(-days), channel, status, signature, digest: `sha256:${SA.hash('img' + version, 64)}`, manifestSig: signature === 'Signed' ? SA.sign({ v: version }) : null, minPrevious: minPrev, migrations: migr, notes, by: 'Imran Chowdhury', rolledOutTo: [] });
    data.releases = [
      rel('1.5.0-rc.1', 6, 'early', 'Published', 'Signed', 'Patient mobile app beta, serial booking mode, faster calendar. Fixes duplicate owner summaries.', '1.4.0', true),
      rel('1.4.2', 21, 'stable', 'Published', 'Signed', 'Security fix for session timeout; commission statement PDF layout; Bangla date formats.', '1.3.0', false),
      rel('1.4.1', 48, 'stable', 'Published', 'Signed', 'Lab results index; queue display board improvements.', '1.3.0', true),
      rel('1.4.0', 75, 'stable', 'Published', 'Signed', 'Finance module (income, expenses, cash closing — D-023); commission engine (D-025, D-026).', '1.3.0', true),
      rel('1.3.4', 120, 'stable', 'Superseded', 'Signed', 'Maintenance release.', '1.2.0', false),
      rel('1.5.0-rc.2', 0, 'early', 'Draft', 'Unsigned', 'Release candidate 2: dental chart print, owner summary fix verified.', '1.4.0', true),
    ];

    /* --------------------------------------------------------------- licence validation log (heartbeats) */
    customers.forEach((c, i) => {
      if (c.status === 'Onboarding') return;
      const dep = deployments[i]; const lic = licences.filter((l) => l.customerId === c.id).pop();
      for (let k = 0; k < 6; k++) {
        const at = SA.stampHoursAgo(k * 24 + (i % 5) + (c.id === 'CUS-0005' ? 72 : 0.3));
        let result = 'Valid';
        if (PP.today() > lic.end) result = PP.today() > PP.addDays(lic.end, 14) ? 'Expired' : 'Grace';
        if (c.status === 'Suspended') result = 'Suspended';
        if (c.id === 'CUS-0008' && k === 1) result = 'Unreachable';
        if (c.id === 'CUS-0004' && k === 3) result = 'Rejected';
        data.licenceChecks.push({ id: id('VAL', 6), customerId: c.id, licenceId: lic.id, at, result, version: dep.version, entitlementVersion: c.entitlementVersion, nonce: SA.hash(c.id + k, 12), detail: result === 'Rejected' ? 'Replay detected: nonce reused. Request refused and audited.' : result === 'Unreachable' ? 'Deployment did not call in; last valid set stays in force (grace).' : '' });
      }
    });
    data.licenceChecks.sort((a, b) => (a.at < b.at ? 1 : -1));

    /* ------------------------------------------------------------------------------ vendor billing */
    customers.forEach((c, i) => {
      if (c.status === 'Onboarding') { data.vendorInvoices.push({ id: id('VIN'), customerId: c.id, date: D(-2), due: D(12), period: `${PP.fmt.date(T)} – ${PP.fmt.date(D(365))}`, lines: [{ description: 'Onboarding and installation (one-time)', amount: 15000 }, { description: 'Starter plan · yearly', amount: 25000 }], payments: [], status: 'Open', remindersSent: 0 }); return; }
      const plan = plans.find((p) => p.id === c.planId);
      const yearly = c.billingCycle === 'Yearly';
      const n = yearly ? 2 : 4;
      for (let k = n - 1; k >= 0; k--) {
        const date = yearly ? D(-(k * 365) - (365 - 128 + i * 11) % 300) : D(-k * 30 - 3);
        const amount = yearly ? plan.priceYearly : plan.priceMonthly;
        const inv = { id: id('VIN'), customerId: c.id, date, due: PP.addDays(date, 14), period: yearly ? `${PP.fmt.date(date)} – ${PP.fmt.date(PP.addDays(date, 364))}` : PP.fmt.month(PP.monthKey(date)), lines: [{ description: `${plan.name} plan · ${yearly ? 'yearly' : 'monthly'}`, amount }], payments: [], status: 'Open', remindersSent: 0 };
        if (c.id === 'CUS-0002' && k === 0) inv.lines.push({ description: 'User limit add-on (contract addendum #3)', amount: 18000 });
        const unpaid = (c.id === 'CUS-0006') || (c.id === 'CUS-0003' && k === 0) || (c.id === 'CUS-0005' && k === 0) || (c.id === 'CUS-0012' && k === 0);
        if (!unpaid) inv.payments.push({ id: id('PAY'), date: PP.addDays(date, 6), amount: PP.sum(inv.lines, (l) => l.amount), method: ['Bank transfer', 'bKash', 'Cheque'][i % 3], ref: `TRX${SA.hash(inv.id, 8).toUpperCase()}`, by: 'Tahmina Akter' });
        else if (c.id === 'CUS-0012') inv.payments.push({ id: id('PAY'), date: PP.addDays(date, 2), amount: 1000, method: 'bKash', ref: 'TRX9A1C33', by: 'Tahmina Akter' });
        if (unpaid) inv.remindersSent = c.id === 'CUS-0006' ? 3 : 1;
        data.vendorInvoices.push(inv);
      }
    });
    data.vendorInvoices.filter((v) => v.remindersSent).forEach((v) => { for (let k = 0; k < v.remindersSent; k++) data.reminders.push({ id: id('REM'), customerId: v.customerId, invoiceId: v.id, at: S(3 + k * 12), channel: k % 2 ? 'SMS' : 'Email', kind: 'Overdue invoice', by: 'Tahmina Akter' }); });
    data.reminders.push({ id: id('REM'), customerId: 'CUS-0007', invoiceId: null, at: S(1), channel: 'Email', kind: 'Licence renewal (9 days left)', by: 'System' });

    /* ------------------------------------------------------------------------------ support */
    const msg = (from, author, days, h, text) => ({ id: id('MSG', 5), from, author, at: S(days, h, 15), text });
    data.tickets = [
      { id: id('TCK'), customerId: 'CUS-0004', subject: 'Update to 1.4.2 failed twice', category: 'Update', priority: 'Urgent', status: 'Open', assigneeId: 'VS-5', createdAt: S(1, 9), messages: [msg('customer', 'Abdul Mukit', 1, 9, 'The update notification came again and failed. The system rolled back and works, but we see a red banner.'), msg('vendor', 'Imran Chowdhury', 1, 11, 'Thanks. The migration on the lab results table timed out. Your data is safe; the updater rolled back with the pre-update backup. We are preparing a fix.')] },
      { id: id('TCK'), customerId: 'CUS-0003', subject: 'Licence renewal invoice', category: 'Billing', priority: 'Normal', status: 'Waiting on customer', assigneeId: 'VS-4', createdAt: S(6, 14), messages: [msg('customer', 'Dr. Farhana Chowdhury', 6, 14, 'We got a banner saying the licence is in grace. Can you resend the invoice?'), msg('vendor', 'Tahmina Akter', 5, 10, 'Resent to your email. Everything keeps working during the grace period.')] },
      { id: id('TCK'), customerId: 'CUS-0001', subject: 'How to add a third branch?', category: 'How-to', priority: 'Low', status: 'Resolved', assigneeId: 'VS-3', createdAt: S(41, 12), messages: [msg('customer', 'Clinic Administrator', 41, 12, 'We plan to open a branch in Boyra. Does our plan allow it?'), msg('vendor', 'Kamrul Hasan', 40, 9, 'Your branch limit has been raised to 3. You can add it under Settings → Branches.')] },
      { id: id('TCK'), customerId: 'CUS-0011', subject: 'Owner daily summary sent twice on WhatsApp', category: 'Bug', priority: 'High', status: 'Open', assigneeId: 'VS-5', createdAt: S(3, 8), messages: [msg('customer', 'Dr. Sabrina Yasmin', 3, 8, 'I received the daily summary twice yesterday and today.'), msg('vendor', 'Imran Chowdhury', 2, 14, 'Confirmed. We switched the feature off globally until 1.5.0 ships the fix.')] },
      { id: id('TCK'), customerId: 'CUS-0005', subject: 'System shows read-only mode', category: 'Licence', priority: 'High', status: 'Open', assigneeId: 'VS-4', createdAt: S(2, 16), messages: [msg('customer', 'Shahidul Islam', 2, 16, 'We cannot create new appointments. Are our records lost?'), msg('vendor', 'Tahmina Akter', 2, 17, 'No — all records are safe and viewable, and you can export them. New entries are paused until the licence is renewed (read-only mode).')] },
      { id: id('TCK'), customerId: 'CUS-0008', subject: 'Backup warning on status page', category: 'Infrastructure', priority: 'Normal', status: 'Open', assigneeId: 'VS-3', createdAt: S(0, 10), messages: [msg('customer', 'Dr. Anisur Rahman', 0, 10, 'The status page says the last backup is 9 days old.')] },
      { id: id('TCK'), customerId: 'CUS-0002', subject: 'Second domain will not verify', category: 'Domain', priority: 'Normal', status: 'Open', assigneeId: 'VS-3', createdAt: S(1, 15), messages: [msg('customer', 'Dr. Mahmudul Karim', 1, 15, 'We added booking.shantimedical.com.bd but it still says failed.')] },
    ];
    data.announcements = [
      { id: id('ANN'), title: 'Release 1.4.2 available on the stable channel', body: 'Security fix for session timeout and improved Bangla dates. Updates install automatically with a pre-update backup.', audience: 'all', severity: 'Info', status: 'Published', publishedAt: S(20), by: 'Imran Chowdhury', reads: 9 },
      { id: id('ANN'), title: 'Owner daily summary paused', body: 'We have temporarily paused the WhatsApp owner summary while we fix duplicate messages. No data is affected.', audience: 'all', severity: 'Warning', status: 'Published', publishedAt: S(2), by: 'Kamrul Hasan', reads: 6 },
      { id: id('ANN'), title: 'Scheduled maintenance of the licence service', body: 'Licence validation will be unavailable for 30 minutes on Friday at 02:00. Your system keeps working; the last valid licence stays in force.', audience: 'all', severity: 'Info', status: 'Draft', publishedAt: null, by: 'Kamrul Hasan', reads: 0 },
    ];
    /* Remote support: requested by vendor staff → approved by a different Support Manager / Super Admin → granted by the customer admin
       → started → ended or expired automatically. Every session has a scope and an end time. */
    const rx = (o) => Object.assign({ ticketId: null, consentBy: null, approvedBy: null, approvedById: null, approvedAt: null, start: null, end: null, startedAt: null, actions: [] }, o, { expiresAt: new Date(new Date(o.requestedAt).getTime() + 24 * 3600000).toISOString() });
    data.remoteSessions = [
      rx({ id: id('RSS'), customerId: 'CUS-0004', ticketId: 'TCK-0001', requestedBy: 'Imran Chowdhury', requestedById: 'VS-5', assigneeId: 'VS-5', approvedBy: 'Kamrul Hasan', approvedById: 'VS-3', approvedAt: S(1, 11, 20), consentBy: 'Abdul Mukit (customer admin)', scopeKind: 'Updater and logs', scope: 'Updater logs and migration status only (no patient records)', hours: 2, requestedAt: S(1, 11), start: S(1, 12), startedAt: S(1, 12, 5), end: S(1, 14), status: 'Expired', actions: ['Requested by Imran Chowdhury', 'Approved by Kamrul Hasan (Support Manager)', 'Consent granted by Abdul Mukit for 2 h', 'Started by Imran Chowdhury', 'Read updater log', 'Ran migration dry-run', 'Session ended automatically after 2 hours'] }),
      rx({ id: id('RSS'), customerId: 'CUS-0008', ticketId: 'TCK-0006', requestedBy: 'Kamrul Hasan', requestedById: 'VS-3', assigneeId: 'VS-3', scopeKind: 'Configuration screens', scope: 'Backup job configuration', hours: 2, requestedAt: SA.stampHoursAgo(2), status: 'Pending approval', actions: ['Requested by Kamrul Hasan · needs approval by another Support Manager or a Super Admin'] }),
      rx({ id: id('RSS'), customerId: 'CUS-0001', ticketId: 'TCK-0003', requestedBy: 'Kamrul Hasan', requestedById: 'VS-3', assigneeId: 'VS-3', approvedBy: 'Arif Hossain', approvedById: 'VS-1', approvedAt: S(40, 9, 30), consentBy: 'Clinic Administrator (customer admin)', scopeKind: 'Screen share', scope: 'Branch settings screen (screen share)', hours: 1, requestedAt: S(40, 9), start: S(40, 10), startedAt: S(40, 10), end: S(40, 10, 30), status: 'Ended', actions: ['Requested by Kamrul Hasan', 'Approved by Arif Hossain (Super Admin)', 'Consent granted for 1 h', 'Viewed branch settings', 'Session ended by customer'] }),
      rx({ id: id('RSS'), customerId: 'CUS-0002', ticketId: 'TCK-0007', requestedBy: 'Sadia Afrin', requestedById: 'VS-9', assigneeId: 'VS-9', scopeKind: 'Configuration screens', scope: 'Domain settings screen only, to check the second domain', hours: 1, requestedAt: SA.stampHoursAgo(1), status: 'Pending approval', actions: ['Requested by Sadia Afrin · needs approval by a Support Manager or a Super Admin'] }),
    ];

    /* ------------------------------------------------------------------------------ demo and trial (D-024, D-027) */
    const lead = (name, org, mobile, bt, days, status, plan, extra) => Object.assign({ id: id('LEAD'), name, organisation: org, mobile, email: '', businessType: bt, createdAt: S(days, 10 + (days % 6)), source: 'Demo sign-up form', status, planInterest: plan, notes: '', sandboxId: null, customerId: null }, extra || {});
    data.leads = [
      lead('Dr. Rezaul Karim', 'Care Plus Physiotherapy', '01731-220145', 'physiotherapy', 0, 'New', 'PLN-STARTER'),
      lead('Sumaiya Rahman', 'Bright Smile Dental Care', '01732-118876', 'dental', 1, 'New', 'PLN-PRO'),
      lead('Md. Habibur Rahman', 'Jamuna Diagnostic Centre', '01733-554210', 'diagnostic', 3, 'Contacted', 'PLN-ENT', { notes: 'Wants 4 branches; call back after Eid.' }),
      lead('Dr. Afsana Mimi', 'Healing Hands Rehab', '01734-339900', 'rehab', 9, 'Contacted', 'PLN-PRO'),
      lead('Tanjila Akter', 'Glow Wellness Lounge', '01735-781234', 'wellness', 13, 'New', 'PLN-STARTER'),
      lead('Dr. Shafiqul Alam', 'City Medical Point', '01736-446721', 'medical', 18, 'Lost', 'PLN-STARTER', { notes: 'Chose a cheaper local tool.' }),
      lead('Ruhul Amin', 'Motion Physio & Sports Clinic', '01717-224580', 'physiotherapy', 160, 'Converted', 'PLN-STARTER', { customerId: 'CUS-0007' }),
      lead('Dr. Nabila Siddique', 'Dentique Dental Studio', '01719-338206', 'dental', 22, 'Converted', 'PLN-STARTER', { customerId: 'CUS-0009' }),
    ];
    const sbx = (l, days, status, ext) => { const start = D(-days); const s = { id: id('SBX'), leadId: l.id, subdomain: `${l.organisation.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '').slice(0, 18)}.demo.physiopoint.example`, businessType: l.businessType, trialStart: start, trialEnd: PP.addDays(start, 14 + (ext || 0)), extendedDays: ext || 0, status, resets: [], dataSet: `Sample data · ${businessTypes.find((b) => b.id === l.businessType).label}`, createdAt: S(days) }; s.deleteOn = PP.addDays(s.trialEnd, 7); l.sandboxId = s.id; return s; };
    data.sandboxes = [
      sbx(data.leads[0], 0, 'Active'), sbx(data.leads[1], 1, 'Active'), sbx(data.leads[2], 3, 'Active', 7), sbx(data.leads[3], 9, 'Active'),
      sbx(data.leads[4], 13, 'Active'), sbx(data.leads[5], 18, 'Ended'), sbx(data.leads[7], 22, 'Deleted'),
    ];
    data.sandboxes[2].resets.push(S(1, 15)); data.sandboxes[3].resets.push(S(4, 11), S(2, 9));
    data.sandboxes[6].deletedAt = S(4); data.sandboxes[6].deleteReason = 'Converted to customer CUS-0009 (demo data is never migrated)';

    // vendor audit (newest first) and counters
    log(5, 'VS-4', 'Reminder sent', 'CUS-0006', 'Overdue invoice reminder #3 (Email)');
    log(4, 'VS-1', 'Customer suspended', 'CUS-0006', 'Three invoices unpaid for more than 60 days');
    log(2, 'VS-5', 'Global feature switched off', 'reports.owner_daily_summary', 'Kill switch: duplicate WhatsApp summaries');
    log(6, 'VS-5', 'Release published', '1.5.0-rc.1', 'Early channel · signed');
    log(1, 'VS-5', 'Remote support requested', 'CUS-0004', 'RSS-0001 · 2 h · Updater and logs: updater logs and migration status only');
    log(1, 'VS-3', 'Remote support approved', 'CUS-0004', 'RSS-0001 · approved by Kamrul Hasan (Support Manager) · assigned to Imran Chowdhury');
    log(1, 'VS-5', 'Remote support session started', 'CUS-0004', 'RSS-0001 · consented by customer admin · 2 h window');
    log(0, 'VS-3', 'Remote support requested', 'CUS-0008', 'RSS-0002 · 2 h · Configuration screens: backup job configuration');
    log(0, 'VS-9', 'Remote support requested', 'CUS-0002', 'RSS-0004 · 1 h · Configuration screens: domain settings screen only');
    log(0, 'VS-2', 'Demo sandbox created', 'SBX-0001', 'Care Plus Physiotherapy · 14-day trial');
    log(3, 'VS-2', 'Trial extended', 'SBX-0003', '+7 days · Jamuna Diagnostic Centre');
    audit.sort((a, b) => (a.at < b.at ? 1 : -1));
    audit.forEach((a, k) => { a.id = `AUD-${String(audit.length - k).padStart(6, '0')}`; });
    counters.AUD = audit.length;
    data.notifications = [
      { id: 'NTF-000001', at: S(0, 9), title: 'Update failed: Lifeline Diagnostic & Imaging', text: 'Migration timed out; rolled back to 1.4.1', link: '#/fleet', read: false },
      { id: 'NTF-000002', at: S(0, 8), title: 'New demo sign-up', text: 'Care Plus Physiotherapy (physiotherapy)', link: '#/demo', read: false },
      { id: 'NTF-000003', at: S(1, 12), title: 'Licence expires in 9 days', text: 'Motion Physio & Sports Clinic', link: '#/licences', read: false },
      { id: 'NTF-000004', at: S(3, 16), title: 'Heartbeat missing for 3 days', text: 'Rise Rehabilitation Centre', link: '#/fleet', read: true },
    ];
    counters.NTF = 4;
    return data;
  };
})();
