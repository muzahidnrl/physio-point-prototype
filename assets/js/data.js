/* Physio Point HTML prototype — fictional seed data.
   Every name, number and record here is invented. Never put real patient data in the prototype (D-006).
   Dates are generated relative to "today" so the calendar always has data. Deterministic (seeded). */
(function () {
  'use strict';
  /* Default permissions of the built-in roles (D-032): each role gets only what its job needs. */
  const ROLE_PERMS = {
    frontdesk: ['dashboard.view', 'appointments.view', 'appointments.view_all', 'appointments.manage', 'requests.review', 'patients.view', 'patients.view_all', 'patients.edit', 'billing.view', 'billing.manage', 'queue.manage', 'packages.manage', 'referrals.manage', 'feedback.view', 'lab.manage', 'professionals.view', 'support.use'],
    professional: ['dashboard.view', 'appointments.view', 'patients.view', 'clinical.view', 'clinical.write', 'prescriptions.issue', 'templates.manage', 'exercises.manage', 'commissions.view_own'],
    accountant: ['dashboard.view', 'billing.view', 'billing.manage', 'billing.refund', 'finance.manage', 'finance.close', 'commissions.manage', 'commissions.payout', 'reports.view', 'inventory.manage', 'payroll.manage', 'support.use'],
  };
  const PP = window.PP;

  PP.seedData = function () {
    const R = PP.rng(20261125);
    const T = PP.today();
    const db = (PP.db = {
      counters: { PAT: 341, REQ: 150, APT: 0, VIS: 330, RX: 120, INV: 230, PAY: 0, INC: 0, EXP: 0, COM: 0, SET: 0, SP: 10, TPL: 0, AUD: 0, NTF: 0, ADV: 0, LEV: 0, CLS: 0, USR: 0, LEAD: 0 },
      session: { userId: 'USR-1', branchId: 'ALL' },
      settings: {
        clinicName: 'Physio Point Clinic', tagline: 'Physiotherapy Clinic Management System', businessType: 'physiotherapy', terminology: {},
        phone: '01711-000000', email: 'hello@physiopoint.example', address: 'House 12, Road 5, Sonadanga, Khulna', timezone: 'Asia/Dhaka',
        currency: 'BDT', currencyStyle: 'code', slotMinutes: 30, primary: '#083E44', action: '#008B83', logoText: 'PP',
        language: 'English', invoiceFooter: 'Thank you for choosing us. Get well soon.', prescriptionHeader: 'Physiotherapy Clinic · Prescription',
        licence: { state: 'Active', plan: 'Professional', expires: PP.addDays(T, 128) },
        backup: { schedule: 'Daily at 02:00', keepDays: 30, offsite: true, lastRun: PP.addDays(T, -1) + 'T02:00:00', lastStatus: 'Success', lastRestoreTest: PP.addDays(T, -12) },
        security: { mfaForAdmins: true, sessionMinutes: 30, passwordMinLength: 10 },
        commission: { model: 'percent', percent: 20, fixedPerVisit: 150, serviceRates: {}, tiers: [{ upTo: 50000, rate: 15 }, { upTo: 100000, rate: 20 }, { upTo: null, rate: 25 }], cycle: 'Monthly' },
        booking: { publicEnabled: true, showProfessionals: true, maxDaysAhead: 30 },
      },
      branches: [
        { id: 'BR-1', name: 'Sonadanga Branch', address: 'House 12, Road 5, Sonadanga, Khulna', phone: '01711-000000', manager: 'USR-2', status: 'Active' },
        { id: 'BR-2', name: 'Khalishpur Branch', address: 'Plot 7, KDA Avenue, Khalishpur, Khulna', phone: '01711-000001', manager: 'USR-1', status: 'Active' },
      ],
      rooms: [
        { id: 'RM-1', branchId: 'BR-1', name: 'Therapy Room 1', type: 'Treatment' },
        { id: 'RM-2', branchId: 'BR-1', name: 'Therapy Room 2', type: 'Treatment' },
        { id: 'RM-3', branchId: 'BR-1', name: 'Exercise Hall', type: 'Gym' },
        { id: 'RM-4', branchId: 'BR-2', name: 'Room A', type: 'Treatment' },
        { id: 'RM-5', branchId: 'BR-2', name: 'Room B', type: 'Treatment' },
      ],
      equipment: [
        { id: 'EQ-1', branchId: 'BR-1', name: 'Ultrasound therapy unit', status: 'Available' },
        { id: 'EQ-2', branchId: 'BR-1', name: 'TENS unit', status: 'Available' },
        { id: 'EQ-3', branchId: 'BR-2', name: 'Traction table', status: 'Maintenance' },
      ],
      professionalTypes: [
        { id: 'PT-PHYSIO', name: 'Physiotherapist', canBeBooked: true, canRecordClinical: true, canPrescribeExercise: true, canPrescribeMedication: true, canIssueCertificate: true, status: 'Active' },
        { id: 'PT-ASSIST', name: 'Physiotherapy Assistant', canBeBooked: true, canRecordClinical: true, canPrescribeExercise: false, canPrescribeMedication: true, canIssueCertificate: false, status: 'Active' },
        { id: 'PT-CONSULT', name: 'Consultant (Rehabilitation)', canBeBooked: true, canRecordClinical: true, canPrescribeExercise: true, canPrescribeMedication: true, canIssueCertificate: true, status: 'Active' },
      ],
      closures: [{ date: PP.addDays(T, 12), reason: 'Public holiday' }],
      leaves: [],
      patients: [], appointments: [], requests: [], visits: [], prescriptions: [], templates: [], exercises: [], sessionPlans: [],
      services: [], invoices: [], payments: [], incomes: [], expenses: [], cashClosings: [], advances: [], packages: [],
      commissionEntries: [], settlements: [], users: [], roles: [], notifications: [], audit: [], leads: [],
      financeCategories: [
        { id: 'CAT-I-PAT', type: 'income', name: 'Patient payments', system: true }, { id: 'CAT-I-REF', type: 'income', name: 'Refunds', system: true },
        { id: 'CAT-I-REV', type: 'income', name: 'Payment reversals', system: true }, { id: 'CAT-I-ADV', type: 'income', name: 'Patient advances', system: true }, { id: 'CAT-I-OTH', type: 'income', name: 'Other income' },
        { id: 'CAT-I-PRD', type: 'income', name: 'Product sales' },
        { id: 'CAT-E-RENT', type: 'expense', name: 'Rent' }, { id: 'CAT-E-SAL', type: 'expense', name: 'Salaries' }, { id: 'CAT-E-UTL', type: 'expense', name: 'Utilities' },
        { id: 'CAT-E-EQP', type: 'expense', name: 'Equipment maintenance' }, { id: 'CAT-E-CON', type: 'expense', name: 'Consumables' }, { id: 'CAT-E-MKT', type: 'expense', name: 'Marketing' },
        { id: 'CAT-E-COM', type: 'expense', name: 'Commission payout', system: true }, { id: 'CAT-E-OTH', type: 'expense', name: 'Other expenses' },
      ],
      notificationChannels: [
        { id: 'sms', name: 'SMS', enabled: true, primary: 'SSL Wireless (candidate)', fallback: 'BulkSMSBD (candidate)', status: 'Not connected' },
        { id: 'whatsapp', name: 'WhatsApp', enabled: false, primary: 'WhatsApp Cloud API', fallback: '—', status: 'Not connected' },
        { id: 'email', name: 'Email', enabled: true, primary: 'Not selected', fallback: '—', status: 'Not connected' },
        { id: 'inapp', name: 'In-app', enabled: true, primary: 'Built-in', fallback: '—', status: 'Active' },
      ],
      messageTemplates: [
        { id: 'MT-1', event: 'appointment.confirmed', channel: 'SMS', language: 'English', text: 'Dear {patient}, your appointment with {professional} is confirmed for {date} at {time}. Ref {ref}. - {clinic}', status: 'Active' },
        { id: 'MT-2', event: 'appointment.reminder', channel: 'SMS', language: 'English', text: 'Reminder: {patient}, you have an appointment tomorrow at {time} with {professional}. - {clinic}', status: 'Active' },
        { id: 'MT-3', event: 'appointment.cancelled', channel: 'SMS', language: 'English', text: 'Dear {patient}, your appointment on {date} has been cancelled. Please call {phone} to rebook.', status: 'Active' },
        { id: 'MT-4', event: 'payment.completed', channel: 'SMS', language: 'English', text: 'Payment of {amount} received for invoice {invoice}. Thank you. - {clinic}', status: 'Active' },
        { id: 'MT-5', event: 'owner.daily_summary', channel: 'WhatsApp', language: 'English', text: '{clinic} today: {appointments} appointments, collected {collected}, dues {dues}.', status: 'Draft' },
      ],
    });

    /* ---------------- roles and users ---------------- */
    db.roles = [
      { id: 'admin', name: 'Admin (Owner)', system: true, permissions: ['*'] },
      { id: 'frontdesk', name: 'Front Desk', system: true, permissions: ROLE_PERMS.frontdesk.slice() },
      { id: 'professional', name: 'Professional', system: true, permissions: ROLE_PERMS.professional.slice() },
      { id: 'accountant', name: 'Accountant', system: true, permissions: ROLE_PERMS.accountant.slice() },
    ];

    /* ---------------- professionals ---------------- */
    const week = (start, end, bs, be, thuEnd) => {
      const s = {};
      for (let d = 0; d < 7; d++) {
        if (d === 5) s[d] = { on: false }; // Friday closed
        else s[d] = { on: true, start, end: d === 4 && thuEnd ? thuEnd : end, breakStart: bs, breakEnd: be };
      }
      return s;
    };
    db.professionals = [
      { id: 'PRO-1', title: 'Dr.', name: 'Tanvir Ahmed', typeId: 'PT-PHYSIO', designation: 'Senior Physiotherapist', specialization: 'Musculoskeletal', qualification: 'BPT, MPT (Ortho)', registrationNo: 'BPA-1021', mobile: '01712-345601', email: 'tanvir@clinic.example', branchId: 'BR-1', color: '#008B83', status: 'Active', joined: '2021-03-01', schedule: week('09:00', '17:00', '13:00', '14:00', '16:00'), manualCommissionPercent: null, userId: 'USR-4' },
      { id: 'PRO-2', title: 'Dr.', name: 'Sadia Rahman', typeId: 'PT-PHYSIO', designation: 'Physiotherapist', specialization: 'Rehabilitation', qualification: 'BPT', registrationNo: 'BPA-1187', mobile: '01712-345602', email: 'sadia@clinic.example', branchId: 'BR-1', color: '#6d5bd0', status: 'Active', joined: '2022-07-15', schedule: week('09:00', '17:00', '12:00', '13:00'), manualCommissionPercent: null, userId: 'USR-5' },
      { id: 'PRO-3', title: 'Dr.', name: 'Mehedi Hasan', typeId: 'PT-PHYSIO', designation: 'Sports Physiotherapist', specialization: 'Sports injury', qualification: 'BPT, MSc Sports Physio', registrationNo: 'BPA-1243', mobile: '01712-345603', email: 'mehedi@clinic.example', branchId: 'BR-2', color: '#d97706', status: 'Active', joined: '2023-01-10', schedule: week('10:00', '18:00', '14:00', '15:00'), manualCommissionPercent: 25, userId: null },
      { id: 'PRO-4', title: 'Dr.', name: 'Farzana Akter', typeId: 'PT-CONSULT', designation: 'Consultant, Neuro Rehabilitation', specialization: 'Neuro rehabilitation', qualification: 'MBBS, FCPS (PM&R)', registrationNo: 'BMDC-A-48211', mobile: '01712-345604', email: 'farzana@clinic.example', branchId: 'BR-2', color: '#2563eb', status: 'Active', joined: '2022-02-01', schedule: week('15:00', '20:00', null, null), manualCommissionPercent: null, userId: null },
      { id: 'PRO-5', title: '', name: 'Rafiqul Islam', typeId: 'PT-ASSIST', designation: 'Physiotherapy Assistant', specialization: 'Exercise therapy', qualification: 'Diploma in Physiotherapy', registrationNo: '—', mobile: '01712-345605', email: 'rafiq@clinic.example', branchId: 'BR-1', color: '#64748b', status: 'Active', joined: '2024-05-20', schedule: week('09:00', '17:00', '13:00', '14:00', '16:00'), manualCommissionPercent: null, userId: null },
    ];
    db.leaves = [
      { id: 'LEV-001', professionalId: 'PRO-3', from: PP.addDays(T, 5), to: PP.addDays(T, 7), reason: 'Conference in Dhaka', status: 'Approved' },
      { id: 'LEV-002', professionalId: 'PRO-2', from: PP.addDays(T, -9), to: PP.addDays(T, -9), reason: 'Personal', status: 'Approved' },
    ];
    db.counters.LEV = 2;

    db.users = [
      { id: 'USR-1', name: 'Clinic Administrator', email: 'admin@clinic.example', mobile: '01711-000010', role: 'admin', branchIds: ['BR-1', 'BR-2'], status: 'Active', mfa: true, lastLogin: PP.addDays(T, 0) + 'T08:42:00', professionalId: null },
      { id: 'USR-2', name: 'Shirin Sultana', email: 'frontdesk@clinic.example', mobile: '01711-000011', role: 'frontdesk', branchIds: ['BR-1'], status: 'Active', mfa: false, lastLogin: PP.addDays(T, 0) + 'T08:55:00', professionalId: null },
      { id: 'USR-3', name: 'Kamal Hossain', email: 'accounts@clinic.example', mobile: '01711-000012', role: 'accountant', branchIds: ['BR-1', 'BR-2'], status: 'Active', mfa: true, lastLogin: PP.addDays(T, -1) + 'T17:20:00', professionalId: null },
      { id: 'USR-4', name: 'Tanvir Ahmed', email: 'tanvir@clinic.example', mobile: '01712-345601', role: 'professional', branchIds: ['BR-1'], status: 'Active', mfa: false, lastLogin: PP.addDays(T, 0) + 'T09:01:00', professionalId: 'PRO-1' },
      { id: 'USR-5', name: 'Sadia Rahman', email: 'sadia@clinic.example', mobile: '01712-345602', role: 'professional', branchIds: ['BR-1'], status: 'Active', mfa: false, lastLogin: PP.addDays(T, -1) + 'T09:12:00', professionalId: 'PRO-2' },
      { id: 'USR-6', name: 'Nadia Chowdhury', email: 'nadia@clinic.example', mobile: '01711-000015', role: 'frontdesk', branchIds: ['BR-2'], status: 'Disabled', mfa: false, lastLogin: PP.addDays(T, -40) + 'T10:00:00', professionalId: null },
    ];
    db.counters.USR = 6;

    /* ---------------- services ---------------- */
    db.services = [
      { id: 'SRV-01', name: 'Initial assessment', category: 'Assessment', duration: 45, price: 1200, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-02', name: 'Back pain therapy', category: 'Therapy', duration: 30, price: 800, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-03', name: 'Knee rehabilitation', category: 'Rehabilitation', duration: 30, price: 1000, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-04', name: 'Sports injury rehab', category: 'Rehabilitation', duration: 45, price: 1500, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-05', name: 'Shoulder therapy', category: 'Therapy', duration: 30, price: 900, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-06', name: 'Neck pain therapy', category: 'Therapy', duration: 30, price: 800, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-07', name: 'Post-surgery rehab', category: 'Rehabilitation', duration: 45, price: 1400, customPriceAllowed: true, status: 'Active' },
      { id: 'SRV-08', name: 'Postural correction', category: 'Therapy', duration: 30, price: 900, customPriceAllowed: false, status: 'Active' },
      { id: 'SRV-09', name: 'Neuro rehabilitation consultation', category: 'Consultation', duration: 30, price: 1500, customPriceAllowed: false, status: 'Active' },
      { id: 'SRV-10', name: 'Home visit session', category: 'Home visit', duration: 60, price: 2000, customPriceAllowed: true, homeVisit: true, travelCharge: 300, status: 'Active' },
      { id: 'SRV-11', name: 'Knee rehab package (10 sessions)', category: 'Package', duration: 30, price: 8500, customPriceAllowed: false, isPackage: true, sessions: 10, validityDays: 60, status: 'Active' },
      { id: 'SRV-12', name: 'Hydrotherapy session', category: 'Therapy', duration: 45, price: 1300, customPriceAllowed: true, status: 'Inactive' },
    ];

    /* ---------------- patients ---------------- */
    const named = [
      ['Nusrat Jahan', 'Female', '1994-03-12', 'PRO-1'], ['Arafat Hossain', 'Male', '1988-07-02', 'PRO-1'], ['Mahmud Karim', 'Male', '1979-11-21', 'PRO-1'],
      ['Rokeya Akter', 'Female', '1961-01-30', 'PRO-2'], ['Sabrina Islam', 'Female', '1990-09-18', 'PRO-2'], ['Imran Ahmed', 'Male', '1985-05-05', 'PRO-2'],
      ['Sabbir Rahman', 'Male', '1997-12-11', 'PRO-1'], ['Rafiq Hasan', 'Male', '1972-04-25', 'PRO-2'], ['Asif Reza', 'Male', '1983-08-14', 'PRO-1'],
    ];
    const first = { Male: ['Kamrul', 'Habib', 'Sohel', 'Anisur', 'Rakib', 'Shakil', 'Nayeem', 'Fahim', 'Jubayer', 'Rashed', 'Tareq', 'Mizanur', 'Shafiq', 'Hasan'], Female: ['Taslima', 'Nadia', 'Sumaiya', 'Jannatul', 'Mahmuda', 'Rumana', 'Afroza', 'Lamia', 'Tahmina', 'Shamima', 'Fatema', 'Moushumi', 'Sharmin'] };
    const last = ['Hossain', 'Karim', 'Akter', 'Islam', 'Rahman', 'Ahmed', 'Khan', 'Chowdhury', 'Sarkar', 'Uddin', 'Begum', 'Haque', 'Mia', 'Sultana', 'Talukder'];
    const areas = ['Sonadanga', 'Khalishpur', 'Boyra', 'Daulatpur', 'Gollamari', 'Nirala', 'Moylapota', 'Rupsha', 'Tutpara', 'Shibbari'];
    const sources = ['Walk-in', 'Doctor referral', 'Facebook', 'Existing patient', 'Google', 'Online booking'];
    const histories = ['Hypertension', 'Type 2 diabetes', 'No significant history', 'Previous knee arthroscopy (2021)', 'Lumbar disc prolapse', 'Asthma', 'Hypothyroidism'];
    const allergies = ['None known', 'None known', 'None known', 'Penicillin', 'Ibuprofen', 'Latex'];
    const mobile = () => `01${R.pick(['3', '7', '8', '9', '6', '5'])}${String(R.int(10000000, 99999999))}`;
    const pros = ['PRO-1', 'PRO-2', 'PRO-3', 'PRO-4', 'PRO-5'];
    const mkPatient = (name, gender, dob, pro, extra) => {
      const id = PP.nextId('PAT');
      const p = Object.assign({
        id, name, gender, dob, mobile: mobile(), email: '', address: `${R.pick(areas)}, Khulna`, emergencyContact: `${R.pick(first.Male)} ${R.pick(last)} · ${mobile()}`,
        assignedProfessionalId: pro, branchId: PP.find.professional(pro).branchId, referralSource: R.pick(sources), bloodGroup: R.pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
        medicalHistory: R.pick(histories), allergies: R.pick(allergies), previousTreatments: R.pick(['None', 'Physiotherapy in 2023', 'Orthopaedic surgery', 'Pain medication only']),
        notes: '', registeredAt: PP.addDays(T, -R.int(20, 400)), familyGroup: null, customFields: {}, status: 'Active',
      }, extra || {});
      db.patients.push(p); return p;
    };
    named.forEach(([n, g, d, p]) => mkPatient(n, g, d, p));
    for (let i = 0; i < 30; i++) {
      const g = R.chance(0.5) ? 'Male' : 'Female';
      mkPatient(`${R.pick(first[g])} ${R.pick(last)}`, g, `${R.int(1950, 2008)}-${String(R.int(1, 12)).padStart(2, '0')}-${String(R.int(1, 28)).padStart(2, '0')}`, R.pick(pros));
    }
    // Family sharing one mobile number (blueprint rule: mobile is not a unique identifier)
    const nusrat = db.patients[0]; nusrat.mobile = '01923456789'; nusrat.familyGroup = 'FAM-1';
    mkPatient('Hasina Begum', 'Female', '1965-06-08', 'PRO-2', { mobile: '01923456789', familyGroup: 'FAM-1', notes: 'Mother of Nusrat Jahan (PAT-000342). Shares the same mobile number.' });
    db.patients[1].mobile = '01712345678'; db.patients[5].mobile = '01555667788';

    /* ---------------- appointments ---------------- */
    const svcFor = { 'PRO-1': ['SRV-02', 'SRV-03', 'SRV-05', 'SRV-01', 'SRV-06'], 'PRO-2': ['SRV-07', 'SRV-03', 'SRV-02', 'SRV-08', 'SRV-01'], 'PRO-3': ['SRV-04', 'SRV-04', 'SRV-05', 'SRV-01'], 'PRO-4': ['SRV-09', 'SRV-07', 'SRV-01'], 'PRO-5': ['SRV-08', 'SRV-02', 'SRV-06'] };
    const roomFor = { 'PRO-1': 'RM-1', 'PRO-2': 'RM-2', 'PRO-3': 'RM-4', 'PRO-4': 'RM-5', 'PRO-5': 'RM-3' };
    const patientsOf = (pro) => { const own = db.patients.filter((p) => p.assignedProfessionalId === pro); return own.length ? own : db.patients; };
    const nowMin = PP.toMin(PP.nowTime());
    for (let off = -45; off <= 10; off++) {
      const day = PP.addDays(T, off);
      pros.forEach((pro) => {
        const w = PP.sched.window(pro, day); if (!w || w.closed) return;
        const n = off === 0 ? R.int(4, 6) : R.int(2, 5);
        const starts = [];
        for (let m = PP.toMin(w.start); m < PP.toMin(w.end); m += 30) starts.push(m);
        for (let k = 0; k < n; k++) {
          const svc = PP.find.service(R.pick(svcFor[pro])); const s = R.pick(starts); const st = PP.fromMin(s); const en = PP.fromMin(s + svc.duration);
          if (PP.sched.conflicts(pro, day, st, en).length) continue;
          const pt = R.pick(patientsOf(pro));
          let status;
          if (off < 0) status = R.chance(0.08) ? 'No-show' : R.chance(0.07) ? 'Cancelled' : 'Completed';
          else if (off === 0) status = s + svc.duration <= nowMin ? 'Completed' : s <= nowMin ? 'In session' : s - nowMin <= 30 ? 'Checked in' : R.chance(0.6) ? 'Confirmed' : 'Scheduled';
          else status = R.chance(0.65) ? 'Confirmed' : 'Scheduled';
          db.appointments.push({
            id: PP.nextId('APT'), patientId: pt.id, professionalId: pro, serviceId: svc.id, branchId: PP.find.professional(pro).branchId, roomId: roomFor[pro],
            date: day, start: st, end: en, status, source: R.pick(['Front desk', 'Front desk', 'Phone', 'Online request']), notes: R.chance(0.2) ? 'Follow-up session' : '',
            createdAt: PP.addDays(day, -R.int(1, 6)) + 'T10:00:00', cancelReason: status === 'Cancelled' ? 'Patient requested' : '',
          });
        }
      });
    }
    // Guarantee the blueprint example row exists today for Tanvir at a free slot.
    db.appointments.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    /* ---------------- online requests (Pending → admin confirms) ---------------- */
    db.counters.REQ = 155;
    const reqs = [
      ['Imran Ahmed', '01555667788', 'SRV-02', 'PRO-2', 1, '11:00', 'Lower back pain for the last 2 weeks.'],
      ['Sabrina Islam', '01733445566', 'SRV-06', 'PRO-2', 1, '14:00', 'Neck stiffness after long desk work.'],
      ['Rafiq Hasan', '01911778899', 'SRV-04', null, 2, '10:30', 'Football injury, right ankle.'],
      ['Moushumi Sarkar', '01822114455', 'SRV-03', 'PRO-1', 2, '09:30', 'Knee pain while climbing stairs.'],
      ['Tareq Mia', '01644990011', 'SRV-01', null, 3, '11:30', ''],
    ];
    reqs.forEach(([name, mob, svc, pro, off, time, notes]) => {
      const pt = db.patients.find((p) => p.name === name);
      db.requests.push({ id: PP.nextId('REQ'), name, mobile: mob, serviceId: svc, preferredProfessionalId: pro, date: PP.addDays(T, off), time, notes, status: 'Pending', createdAt: PP.addDays(T, 0) + `T0${R.int(7, 9)}:${R.int(10, 59)}:00`, patientId: pt ? pt.id : null, branchId: pro ? PP.find.professional(pro).branchId : 'BR-1' });
    });
    db.requests.push({ id: PP.nextId('REQ'), name: 'Lamia Haque', mobile: '01788112233', serviceId: 'SRV-02', preferredProfessionalId: 'PRO-1', date: PP.addDays(T, -3), time: '10:00', notes: '', status: 'Rejected', rejectReason: 'Requested slot unavailable; patient was offered another time by phone.', createdAt: PP.addDays(T, -5) + 'T09:00:00', patientId: null, branchId: 'BR-1' });

    /* ---------------- exercise library + templates ---------------- */
    const ex = [
      ['Quadriceps sets', 'Knee', 'Tighten the thigh muscle, press the back of the knee down, hold 5 seconds.'],
      ['Straight leg raise', 'Knee', 'Lie on your back, keep the knee straight and lift the leg to 30 cm.'],
      ['Heel slides', 'Knee', 'Slide the heel towards the buttock, then straighten slowly.'],
      ['Cat–camel', 'Spine', 'On hands and knees, arch and round the back slowly.'],
      ['Pelvic tilt', 'Spine', 'Lie on your back, flatten the lower back against the floor.'],
      ['Bird dog', 'Spine', 'On hands and knees, extend the opposite arm and leg, keep the back level.'],
      ['Pendulum swing', 'Shoulder', 'Lean forward, let the arm hang and swing gently in circles.'],
      ['Wall slide', 'Shoulder', 'Back to the wall, slide arms up keeping contact with the wall.'],
      ['External rotation with band', 'Shoulder', 'Elbow at 90°, rotate the forearm outwards against the band.'],
      ['Chin tuck', 'Neck', 'Draw the chin straight back, hold 5 seconds.'],
      ['Ankle pumps', 'Ankle', 'Move the foot up and down briskly.'],
      ['Single-leg balance', 'Balance', 'Stand on one leg near a support, hold 30 seconds.'],
    ];
    db.exercises = ex.map(([name, area, instructions], i) => ({ id: `EX-${String(i + 1).padStart(2, '0')}`, name, area, instructions, media: i % 3 === 0 ? 'video' : 'image' }));
    const tpl = (name, condition, version, status, items, plan) => ({ id: PP.nextId('TPL', 3), name, condition, version, status, items: items.map(([exId, sets, reps]) => ({ exerciseId: exId, sets, reps, frequency: 'Daily' })), assessment: '', plan, updatedAt: PP.addDays(T, -R.int(10, 90)), createdBy: 'PRO-1', history: [] });
    db.templates = [
      tpl('Knee rehabilitation', 'Knee pain', 2, 'Approved', [['EX-01', 3, 10], ['EX-02', 3, 10], ['EX-03', 2, 15]], 'Quadriceps strengthening; mobility exercises; ice after exercise.'),
      tpl('Lower back mobility', 'Lower back', 1, 'Approved', [['EX-04', 2, 10], ['EX-05', 3, 10], ['EX-06', 3, 8]], 'Core activation; avoid prolonged sitting; heat therapy.'),
      tpl('Shoulder strengthening', 'Shoulder', 3, 'Approved', [['EX-07', 2, 20], ['EX-08', 3, 10], ['EX-09', 3, 12]], 'Progressive resistance; posture correction.'),
      tpl('Post-surgery support', 'Recovery', 1, 'Draft', [['EX-11', 3, 20], ['EX-01', 3, 10]], 'Early mobilisation; swelling control.'),
      tpl('Neck pain relief', 'Neck', 1, 'Approved', [['EX-10', 3, 10], ['EX-08', 2, 10]], 'Ergonomic advice; chin tucks every hour.'),
    ];

    /* ---------------- clinical visits + prescriptions ---------------- */
    const complaints = { 'SRV-02': 'Lower back pain', 'SRV-03': 'Knee pain', 'SRV-04': 'Ankle sprain', 'SRV-05': 'Shoulder pain', 'SRV-06': 'Neck pain', 'SRV-07': 'Post-operative stiffness', 'SRV-08': 'Poor posture, upper back pain', 'SRV-01': 'General assessment', 'SRV-09': 'Weakness after stroke' };
    const tplFor = { 'SRV-02': 'TPL-002', 'SRV-03': 'TPL-001', 'SRV-05': 'TPL-003', 'SRV-06': 'TPL-005', 'SRV-07': 'TPL-004', 'SRV-08': 'TPL-002' };
    db.appointments.filter((a) => a.status === 'Completed').forEach((a, i) => {
      if (!R.chance(0.7)) return;
      const v = {
        id: PP.nextId('VIS'), appointmentId: a.id, patientId: a.patientId, professionalId: a.professionalId, branchId: a.branchId, date: a.date,
        complaint: complaints[a.serviceId] || 'Musculoskeletal pain', painScale: R.int(2, 8), assessment: R.pick(['Restricted range of motion', 'Muscle tightness and tenderness', 'Reduced strength, grade 4/5', 'Improved mobility since last visit']),
        treatment: R.pick(['Manual therapy', 'Ultrasound therapy + exercises', 'TENS + stretching', 'Mobilisation and strengthening']), advice: R.pick(['Home exercise programme', 'Ice 15 minutes twice daily', 'Avoid heavy lifting', 'Continue exercises; review in one week']),
        nextVisit: PP.addDays(a.date, 7), form: 'physiotherapy', vitals: { bp: `${R.int(110, 140)}/${R.int(70, 90)}`, pulse: R.int(62, 92) }, rom: R.chance(0.5) ? `Knee flexion ${R.int(80, 130)}°` : '', status: 'Completed',
      };
      db.visits.push(v);
      if (tplFor[a.serviceId] && R.chance(0.45)) {
        const t = db.templates.find((x) => x.id === tplFor[a.serviceId]);
        db.prescriptions.push({
          id: PP.nextId('RX'), patientId: a.patientId, visitId: v.id, professionalId: a.professionalId, branchId: a.branchId, date: a.date, templateId: t.id, condition: t.condition,
          assessment: v.assessment, plan: t.plan, items: PP.clone(t.items), medications: [], frequency: '3 sessions / week', followUp: PP.addDays(a.date, 7), status: 'Issued', version: 1, versions: [],
        });
      }
    });
    // A revised prescription to show version history (blueprint rule: revisions preserve earlier versions)
    const rx0 = db.prescriptions.find((r) => r.patientId === 'PAT-000342') || db.prescriptions[0];
    if (rx0) { rx0.versions.push({ version: 1, date: rx0.date, plan: rx0.plan, items: PP.clone(rx0.items), by: rx0.professionalId, note: 'Original issue' }); rx0.version = 2; rx0.plan += ' Add balance training from week 2.'; rx0.items.push({ exerciseId: 'EX-12', sets: 3, reps: 1, frequency: 'Daily' }); }
    // A draft prescription
    db.prescriptions.push({ id: PP.nextId('RX'), patientId: 'PAT-000344', visitId: null, professionalId: 'PRO-1', branchId: 'BR-1', date: T, templateId: 'TPL-003', condition: 'Shoulder', assessment: 'Painful arc 70–110°', plan: 'Progressive resistance; posture correction.', items: PP.clone(db.templates[2].items), medications: [], frequency: '2 sessions / week', followUp: PP.addDays(T, 10), status: 'Draft', version: 1, versions: [] });

    /* ---------------- session plans ---------------- */
    const mkPlan = (patientId, pro, title, planned, done, startOff, freq) => {
      const sessions = []; const goals = ['Assessment', 'Pain control', 'Mobility', 'Strength', 'Balance', 'Function', 'Return to activity', 'Review', 'Maintenance', 'Discharge'];
      for (let k = 0; k < planned; k++) {
        const date = PP.addDays(T, startOff + k * 3);
        sessions.push({ no: k + 1, date, goal: goals[k % goals.length], note: k < done ? R.pick(['Baseline evaluation', 'ROM improved', 'Tolerated exercises well', 'Mild soreness after session', 'Progressed resistance']) : '', status: k < done ? 'Completed' : 'Planned' });
      }
      db.sessionPlans.push({ id: PP.nextId('SP', 3), patientId, professionalId: pro, title, planned, frequency: freq, startDate: sessions[0].date, sessions, status: done >= planned ? 'Completed' : 'Active', packageId: null });
    };
    mkPlan('PAT-000342', 'PRO-1', 'Knee rehabilitation', 8, 3, -9, '3 per week');
    mkPlan('PAT-000343', 'PRO-1', 'Lower back mobility', 6, 4, -12, '2 per week');
    mkPlan('PAT-000345', 'PRO-2', 'Post-surgery rehabilitation', 12, 5, -15, '3 per week');
    mkPlan('PAT-000346', 'PRO-2', 'Neck pain relief', 5, 5, -18, '2 per week');
    mkPlan('PAT-000344', 'PRO-1', 'Shoulder strengthening', 8, 1, -2, '2 per week');

    /* ---------------- invoices + payments (through the real billing logic) ---------------- */
    db.appointments.filter((a) => a.status === 'Completed').forEach((a) => {
      if (!R.chance(0.9)) return;
      const svc = PP.find.service(a.serviceId);
      const custom = svc.customPriceAllowed && R.chance(0.08);
      const inv = {
        id: PP.nextId('INV'), patientId: a.patientId, professionalId: a.professionalId, branchId: a.branchId, appointmentId: a.id, visitId: null, date: a.date,
        lines: [{ serviceId: svc.id, description: svc.name, qty: 1, unitPrice: custom ? svc.price + 200 : svc.price, defaultPrice: svc.price, overrideReason: custom ? 'Extended session (60 minutes)' : '' }],
        discount: R.chance(0.12) ? 100 : 0, discountReason: '', notes: '', status: 'Open', manualCommissionPercent: null, createdBy: 'USR-2',
      };
      db.invoices.push(inv);
      const payable = PP.bill.totals(inv).payable;
      const roll = R.next();
      if (roll < 0.72) PP.bill.recordPayment({ invoiceId: inv.id, amount: payable, method: R.pick(['Cash', 'Cash', 'bKash', 'Nagad', 'Card', 'Bank transfer']), date: a.date, silent: true });
      else if (roll < 0.9) {
        const half = Math.round(payable / 2 / 50) * 50;
        PP.bill.recordPayment({ invoiceId: inv.id, amount: half, method: R.pick(['Cash', 'bKash']), date: a.date, silent: true });
        if (R.chance(0.4) && a.date < PP.addDays(T, -3)) PP.bill.recordPayment({ invoiceId: inv.id, amount: payable - half, method: 'Cash', date: PP.addDays(a.date, 3), silent: true });
      }
    });
    // Package sale (D-026: commission when the package money is received)
    const pkgInv = { id: PP.nextId('INV'), patientId: 'PAT-000342', professionalId: 'PRO-1', branchId: 'BR-1', appointmentId: null, visitId: null, date: PP.addDays(T, -9), lines: [{ serviceId: 'SRV-11', description: 'Knee rehab package (10 sessions)', qty: 1, unitPrice: 8500, defaultPrice: 8500, overrideReason: '' }], discount: 0, discountReason: '', notes: 'Package', status: 'Open', manualCommissionPercent: null, createdBy: 'USR-2' };
    db.invoices.push(pkgInv);
    PP.bill.recordPayment({ invoiceId: pkgInv.id, amount: 5000, method: 'bKash', date: PP.addDays(T, -9), silent: true });
    db.packages.push({ id: 'PKG-001', patientId: 'PAT-000342', serviceId: 'SRV-11', invoiceId: pkgInv.id, sessionsTotal: 10, sessionsUsed: 3, start: PP.addDays(T, -9), expires: PP.addDays(T, 51), status: 'Active' });
    // A pending and a failed mobile payment (D-025 rule 5: no commission)
    const openInv = db.invoices.find((i) => PP.bill.totals(i).status === 'Unpaid');
    if (openInv) {
      PP.bill.recordPayment({ invoiceId: openInv.id, amount: PP.bill.totals(openInv).payable, method: 'bKash', status: 'Pending', date: T, silent: true });
      PP.bill.recordPayment({ invoiceId: openInv.id, amount: 500, method: 'Nagad', status: 'Failed', date: PP.addDays(T, -1), silent: true });
    }
    // A refund example (D-025 rule 6)
    const paidInv = db.invoices.find((i) => PP.bill.totals(i).status === 'Paid' && i.date < PP.addDays(T, -5));
    if (paidInv) { const p = db.payments.find((x) => x.invoiceId === paidInv.id && x.type === 'payment'); PP.bill.refund({ paymentId: p.id, amount: 300, method: p.method, reason: 'Session shortened; partial refund agreed', date: PP.addDays(paidInv.date, 1) }); }
    // An advance deposit not yet applied (D-026: commission when finalised)
    const adv = { id: PP.nextId('ADV'), patientId: 'PAT-000345', amount: 3000, date: PP.addDays(T, -2), method: 'Cash', appliedInvoiceId: null, note: 'Advance for upcoming post-surgery sessions', branchId: 'BR-1' };
    db.advances.push(adv);
    // Cash basis: the advance is income when received. Applying it later posts no second income; commission waits until it is finalised (D-026).
    db.incomes.push({ id: PP.nextId('INC'), date: adv.date, branchId: adv.branchId, categoryId: 'CAT-I-ADV', amount: adv.amount, method: adv.method, source: { type: 'advance', id: adv.id }, note: `Advance deposit ${adv.id}`, auto: true });

    /* ---------------- expenses ---------------- */
    const exp = [['CAT-E-RENT', 'Monthly rent – Sonadanga', 45000, 'BR-1', 'Bank transfer'], ['CAT-E-RENT', 'Monthly rent – Khalishpur', 30000, 'BR-2', 'Bank transfer'], ['CAT-E-UTL', 'Electricity bill', 6200, 'BR-1', 'bKash'], ['CAT-E-UTL', 'Internet', 1500, 'BR-1', 'bKash'], ['CAT-E-CON', 'Ultrasound gel and towels', 2400, 'BR-1', 'Cash'], ['CAT-E-CON', 'Exercise bands', 1800, 'BR-2', 'Cash'], ['CAT-E-EQP', 'TENS unit servicing', 3500, 'BR-1', 'Cash'], ['CAT-E-MKT', 'Facebook promotion', 5000, 'BR-1', 'Card'], ['CAT-E-OTH', 'Tea and refreshments', 900, 'BR-1', 'Cash'], ['CAT-E-UTL', 'Water bill', 650, 'BR-2', 'Cash'], ['CAT-E-CON', 'Cleaning supplies', 1100, 'BR-1', 'Cash'], ['CAT-E-OTH', 'Printing (prescription pads)', 1600, 'BR-1', 'Cash']];
    exp.forEach(([cat, note, amount, br, method], i) => db.expenses.push({ id: PP.nextId('EXP'), date: PP.addDays(T, -i * 2), categoryId: cat, amount, branchId: br, method, paymentStatus: i === 3 ? 'Unpaid' : 'Paid', note, createdBy: 'USR-3', reversalOf: null }));
    db.incomes.push({ id: PP.nextId('INC'), date: PP.addDays(T, -4), branchId: 'BR-1', categoryId: 'CAT-I-PRD', amount: 1200, method: 'Cash', source: { type: 'manual' }, note: 'Lumbar support belt sale', auto: false });

    /* ---------------- commission settlement for previous periods (approved + paid) ---------------- */
    const monthStart = PP.monthStart(T);
    ['PRO-1', 'PRO-2'].forEach((pro) => {
      const old = db.commissionEntries.filter((e) => e.professionalId === pro && e.date < monthStart && !e.settlementId);
      if (!old.length) return;
      const set = { id: PP.nextId('SET'), professionalId: pro, period: `${PP.fmt.date(old[0].date)} – ${PP.fmt.date(PP.addDays(monthStart, -1))}`, from: old[0].date, to: PP.addDays(monthStart, -1), total: PP.round2(PP.sum(old, (e) => e.value)), status: 'Paid out', preparedBy: 'USR-3', approvedBy: 'USR-1', approvedAt: monthStart + 'T10:00:00', paidAt: monthStart + 'T15:00:00', payoutMethod: 'Bank transfer', payoutRef: `TRX-${R.int(100000, 999999)}` };
      old.forEach((e) => { e.settlementId = set.id; });
      db.settlements.push(set);
      db.expenses.push({ id: PP.nextId('EXP'), date: monthStart, categoryId: 'CAT-E-COM', amount: set.total, branchId: 'BR-1', method: 'Bank transfer', paymentStatus: 'Paid', note: `Commission payout ${set.id} · ${PP.proName(pro)}`, createdBy: 'USR-3', reversalOf: null, source: { type: 'payout', id: set.id } });
    });

    /* ---------------- cash closings (past days, BR-1) ---------------- */
    for (let off = -7; off <= -1; off++) {
      const d = PP.addDays(T, off); if (PP.dow(d) === 5) continue;
      const cashIn = PP.sum(db.incomes.filter((x) => x.date === d && x.branchId === 'BR-1' && x.method === 'Cash'), (x) => x.amount);
      const cashOut = PP.sum(db.expenses.filter((x) => x.date === d && x.branchId === 'BR-1' && x.method === 'Cash' && x.paymentStatus === 'Paid'), (x) => x.amount);
      const expected = 5000 + cashIn - cashOut; const counted = off === -3 ? expected - 200 : expected;
      db.cashClosings.push({ id: PP.nextId('CLS'), branchId: 'BR-1', date: d, opening: 5000, cashIn, cashOut, expected, counted, difference: counted - expected, note: off === -3 ? 'Short by 200; noted for review.' : '', closedBy: 'USR-3', approvedBy: 'USR-1', status: 'Closed' });
    }

    /* ---------------- notifications + audit ---------------- */
    const pending = db.requests.filter((r) => r.status === 'Pending').length;
    db.notifications = [
      { id: 'NTF-1', at: T + 'T08:10:00', title: `${pending} new online appointment requests`, text: 'Review and confirm them from Online Requests.', link: '#/appointments/requests', read: false },
      { id: 'NTF-2', at: T + 'T07:05:00', title: 'Backup completed', text: 'Nightly backup finished successfully.', link: '#/settings?tab=backups', read: false },
      { id: 'NTF-3', at: PP.addDays(T, -1) + 'T18:30:00', title: 'Cash day closed – Sonadanga', text: 'Closed by Kamal Hossain.', link: '#/finance/closing', read: true },
      { id: 'NTF-4', at: PP.addDays(T, -2) + 'T12:00:00', title: 'Leave approved', text: 'Dr. Mehedi Hasan · conference in Dhaka.', link: '#/professionals/availability', read: true },
    ];
    db.counters.NTF = 4;
    [['Signed in', 'USR-1', ''], ['Price changed', 'SRV-04', 'Sports injury rehab 1,400 → 1,500'], ['Prescription revised', rx0 ? rx0.id : 'RX', 'Version 2 issued'], ['Refund recorded', paidInv ? paidInv.id : 'INV', 'BDT 300'], ['User disabled', 'USR-6', 'Nadia Chowdhury']]
      .forEach(([action, target, detail], i) => db.audit.push({ id: PP.nextId('AUD'), at: PP.addDays(T, -i) + 'T11:00:00', userId: 'USR-1', userName: 'Clinic Administrator', action, target, detail }));

    return db;
  };
  // Demo sign-in accounts for every professional (so the doctor/consultant and others can log in too).
  // v2 also repairs accounts an earlier build created with a duplicate id.
  PP.registerSeed('pro-accounts-v2', (db) => {
    const num = (id) => Number(String(id).split('-')[1]) || 0;
    const seen = new Set();
    db.users.forEach((u) => { if (seen.has(u.id) && u.professionalId) { u.id = ''; } else seen.add(u.id); });
    const nextId = () => 'USR-' + (db.users.reduce((m, u) => Math.max(m, num(u.id)), 0) + 1);
    db.users.forEach((u) => { if (!u.id) { u.id = nextId(); const p = db.professionals.find((x) => x.id === u.professionalId); if (p) p.userId = u.id; } });
    db.professionals.forEach((p) => {
      if (p.status !== 'Active' || db.users.some((u) => u.professionalId === p.id)) return;
      const email = p.email || (p.name.split(' ')[0].toLowerCase() + '@clinic.example');
      const u = { id: nextId(), name: p.name, email, mobile: p.mobile || '', role: 'professional', branchIds: [p.branchId || 'BR-1'], status: 'Active', mfa: false, lastLogin: null, professionalId: p.id };
      db.users.push(u); p.userId = u.id; if (!p.email) p.email = email;
    });
  });
  // D-033: medicine is allowed for everyone by default; the admin can switch it off per type or per person.
  PP.registerSeed('rx-med-default', (db) => { (db.professionalTypes || []).forEach((t) => { t.canPrescribeMedication = true; }); });
  // D-032: bring existing browser data onto the tightened role matrix (built-in roles only; custom roles are left alone).
  PP.registerSeed('roles-v2', (db) => {
    db.roles.forEach((r) => { if (r.system && ROLE_PERMS[r.id]) r.permissions = ROLE_PERMS[r.id].slice(); });
  });
})();
