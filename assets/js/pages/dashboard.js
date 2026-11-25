/* Dashboard — blueprint screen 04 + Reference A (KPI cards, appointment overview, today's schedule,
   pending online requests with inline confirm/reject, collection summary, quick actions). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;

  const pctChange = (now, before) => {
    if (!before) return now ? '<span class="trend up">new today</span>' : '<span class="muted">no change</span>';
    const d = Math.round(((now - before) / before) * 100);
    return `<span class="trend ${d >= 0 ? 'up' : 'down'}">${PP.icon(d >= 0 ? 'arrowUp' : 'arrowDown')} ${Math.abs(d)}%</span> vs yesterday`;
  };
  const collected = (from, to) => {
    const rows = PP.db.incomes.filter((i) => i.auto && PP.inBranch(i) && i.date >= from && i.date <= to);
    const total = PP.sum(rows, (i) => i.amount); const cash = PP.sum(rows.filter((i) => i.method === 'Cash'), (i) => i.amount);
    return { total, cash, online: total - cash };
  };
  const dueFor = (from, to) => PP.sum(PP.db.invoices.filter((i) => PP.inBranch(i) && i.date >= from && i.date <= to), (i) => PP.bill.totals(i).due);

  PP.route('/dashboard', {
    title: 'Dashboard', perm: 'dashboard.view',
    render({ el }) {
      const u = PP.currentUser(); const T = PP.today(); const Y = PP.addDays(T, -1);
      const own = u.role === 'professional' && u.professionalId;
      const mine = (a) => !own || a.professionalId === u.professionalId;
      const todays = PP.db.appointments.filter((a) => a.date === T && PP.inBranch(a) && mine(a) && !['Cancelled', 'Rescheduled'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start));
      const ydays = PP.db.appointments.filter((a) => a.date === Y && PP.inBranch(a) && mine(a) && !['Cancelled', 'Rescheduled'].includes(a.status));
      const pending = PP.db.requests.filter((r) => r.status === 'Pending' && PP.inBranch(r));
      const patients = PP.db.patients.filter((p) => !p.mergedInto && PP.inBranch(p) && (!own || p.assignedProfessionalId === u.professionalId));
      const newThisMonth = patients.filter((p) => p.registeredAt >= PP.monthStart(T)).length;
      const cT = collected(T, T); const cY = collected(Y, Y);
      const first = u.role === 'professional' ? PP.proShort(u.professionalId) : u.name;

      const kpis = own ? [
        PP.ui.kpi({ label: 'My appointments today', value: todays.length, hint: pctChange(todays.length, ydays.length), tone: 'positive', icon: 'calendar' }),
        PP.ui.kpi({ label: 'My patients', value: patients.length, hint: `${newThisMonth} new this month`, tone: 'info', icon: 'users' }),
        PP.ui.kpi({ label: 'Sessions completed today', value: todays.filter((a) => a.status === 'Completed').length, hint: `${todays.filter((a) => ['Confirmed', 'Scheduled', 'Checked in'].includes(a.status)).length} still to come`, tone: 'warning', icon: 'checkCircle' }),
        PP.ui.kpi({ label: 'My commission balance', value: PP.fmt.money(PP.commission.balance(u.professionalId)), hint: '<a href="#/commissions">View statement →</a>', tone: 'lavender', icon: 'coins' }),
      ] : [
        PP.ui.kpi({ label: "Today's Appointments", value: todays.length, hint: pctChange(todays.length, ydays.length), tone: 'positive', icon: 'calendar' }),
        PP.ui.kpi({ label: 'Total Patients', value: patients.length, hint: `${PP.icon('arrowUp', 'style="width:12px;height:12px"')} ${newThisMonth} new this month`, tone: 'info', icon: 'users' }),
        PP.can('billing.view') ? PP.ui.kpi({ label: "Today's Collection", value: PP.fmt.money(cT.total), hint: pctChange(cT.total, cY.total), tone: 'warning', icon: 'coins' }) : PP.ui.kpi({ label: 'Checked in now', value: todays.filter((a) => a.status === 'Checked in').length, hint: 'Waiting to be seen', tone: 'warning', icon: 'clock' }),
        PP.ui.kpi({ label: 'Pending Requests', value: pending.length, hint: PP.can('requests.review') ? '<a href="#/appointments/requests">View & Confirm →</a>' : 'Awaiting review', tone: 'lavender', icon: 'clock' }),
      ];

      el.innerHTML = `${PP.ui.pageHead({ title: `Welcome, ${esc(first)} 👋`, subtitle: `Here's what's happening at ${esc(PP.db.settings.clinicName)} today${PP.activeBranchId() !== 'ALL' ? ` · ${esc(PP.branchName(PP.activeBranchId()))}` : ''}.`,
        actions: `<span class="date-chip">${PP.icon('calendar')} Today, ${PP.fmt.date(T)}</span>${PP.can('appointments.manage') ? `<a class="btn btn-primary" href="#/appointments/new">${PP.icon('plus')} New appointment</a>` : ''}` })}
        <div class="grid grid-4">${kpis.join('')}</div>
        <div class="grid dash-row mt-4">
          ${PP.ui.card({ title: 'Appointment Overview', actions: '<span class="small muted">Last 7 days</span>', body: '<div data-chart></div>' })}
          ${PP.ui.card({ title: "Today's Schedule", actions: '<a class="small" href="#/appointments">View All →</a>', flush: true, body: '<ul class="list sched" data-sched></ul>' })}
        </div>
        <div class="grid dash-row-3 mt-4">
          ${PP.can('requests.review') ? PP.ui.card({ title: `Pending Online Requests (${pending.length})`, actions: '<a class="small" href="#/appointments/requests">View All →</a>', flush: true, body: '<ul class="list" data-reqs></ul>' }) : PP.ui.card({ title: 'Up next', flush: true, body: '<ul class="list" data-next></ul>' })}
          ${PP.can('billing.view') ? PP.ui.card({ title: 'Collection Summary', actions: PP.ui.segmented('period', [['daily', 'Daily'], ['monthly', 'Monthly']], 'daily'), body: '<div data-coll></div>' }) : PP.ui.card({ title: 'Patients to follow up', flush: true, body: '<ul class="list" data-follow></ul>' })}
          ${PP.ui.card({ title: `${PP.icon('zap', 'style="width:18px;height:18px;vertical-align:-3px;color:var(--pp-action)"')} Quick Actions`, body: '<div class="quick" data-quick></div>' })}
        </div>`;

      // Appointment overview chart (completed vs scheduled, last 7 days)
      const days = Array.from({ length: 7 }, (_, i) => PP.addDays(T, i - 6));
      const by = (d, sts) => PP.db.appointments.filter((a) => a.date === d && PP.inBranch(a) && mine(a) && sts.includes(a.status)).length;
      PP.chart.area(PP.$('[data-chart]', el), { labels: days.map((d) => PP.DAYS[PP.dow(d)].slice(0, 3)), series: [
        { name: 'Completed', values: days.map((d) => by(d, ['Completed'])), color: '#0a6b4f' },
        { name: 'Scheduled', values: days.map((d) => by(d, ['Completed', 'Confirmed', 'Scheduled', 'Checked in', 'In session', 'No-show'])), color: '#5cc8bd' },
      ] });

      // Today's schedule
      const sched = PP.$('[data-sched]', el);
      sched.innerHTML = todays.length ? todays.slice(0, 7).map((a) => `<li><span class="time-chip">${PP.fmt.time(a.start)}</span><a class="grow" href="#/appointments/${a.id}"><b>${esc(PP.patientName(a.patientId))}</b><span class="sub">${esc(PP.serviceName(a.serviceId))}</span></a><span class="small muted hide-sm">${PP.icon('user', 'style="width:14px;height:14px;vertical-align:-2px"')} ${esc(PP.proShort(a.professionalId))}</span>${PP.ui.badge(a.status)}</li>`).join('') + (todays.length > 7 ? `<li class="small"><a href="#/appointments">+ ${todays.length - 7} more today</a></li>` : '')
        : `<li style="display:block">${PP.ui.empty({ icon: 'calendar', title: 'No appointments today', text: 'Enjoy the quiet, or add a walk-in.', action: PP.can('appointments.manage') ? '<a class="btn btn-sm btn-primary" href="#/appointments/new">Add appointment</a>' : '' })}</li>`;

      // Pending online requests with inline confirm/reject
      const reqBox = PP.$('[data-reqs]', el);
      const drawReqs = () => {
        const list = PP.db.requests.filter((r) => r.status === 'Pending' && PP.inBranch(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        reqBox.innerHTML = list.length ? list.slice(0, 4).map((r) => `<li><span class="avatar">${esc(PP.initials(r.name))}</span><a class="grow" href="#/appointments/${r.id}"><b>${esc(r.name)}</b><span class="sub">${esc(PP.serviceName(r.serviceId))} · ${PP.fmt.dateShort(r.date)}, ${PP.fmt.time(r.time)}</span><span class="sub">Requested ${PP.fmt.stamp(r.createdAt)}</span></a><div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" data-ok="${r.id}">${PP.icon('check')} Confirm</button><button class="btn btn-danger btn-sm" data-no="${r.id}">Reject</button></div></li>`).join('')
          : `<li style="display:block">${PP.ui.empty({ icon: 'checkCircle', title: 'All caught up', text: 'No online requests are waiting.' })}</li>`;
        PP.$$('[data-ok]', reqBox).forEach((b) => b.addEventListener('click', () => PP.ui.busy(b, async () => {
          const r = PP.find.request(b.dataset.ok); const pro = PP.appt.suggestPro(r);
          const res = PP.appt.confirmRequest(r, { professionalId: pro.id, date: r.date, start: r.time, patientId: r.patientId });
          if (!res.ok) { PP.ui.toast(`Requested slot is not free (${esc(res.conflicts[0])}). Pick another slot on the review page.`, 'warning', 5000); PP.go(`#/appointments/${r.id}`); return; }
          PP.ui.toast(`${r.id} confirmed as ${res.appointment.id}. Confirmation SMS queued (simulated).`); PP.render();
        }, 500)));
        PP.$$('[data-no]', reqBox).forEach((b) => b.addEventListener('click', async () => {
          const r = PP.find.request(b.dataset.no);
          const res = await PP.ui.confirm({ title: `Reject ${r.id}?`, message: `${esc(r.name)} · ${PP.fmt.dateLong(r.date)} at ${PP.fmt.time(r.time)}`, confirmLabel: 'Reject', danger: true, reasonLabel: 'Reason', reasonRequired: true });
          if (!res) return; PP.appt.rejectRequest(r, res.reason); PP.ui.toast(`${r.id} rejected.`); PP.render();
        }));
      };
      if (reqBox) drawReqs();
      const nextBox = PP.$('[data-next]', el);
      if (nextBox) { const up = todays.filter((a) => ['Confirmed', 'Scheduled', 'Checked in'].includes(a.status)).slice(0, 5); nextBox.innerHTML = up.length ? up.map((a) => `<li><span class="time-chip">${PP.fmt.time(a.start)}</span><a class="grow" href="#/appointments/${a.id}"><b>${esc(PP.patientName(a.patientId))}</b><span class="sub">${esc(PP.serviceName(a.serviceId))}</span></a>${PP.ui.badge(a.status)}</li>`).join('') : `<li style="display:block">${PP.ui.empty({ icon: 'checkCircle', title: 'Nothing waiting' })}</li>`; }
      const follow = PP.$('[data-follow]', el);
      if (follow) { const v = PP.db.visits.filter((x) => mine(x) && x.nextVisit >= T && x.nextVisit <= PP.addDays(T, 3)).slice(0, 5); follow.innerHTML = v.length ? v.map((x) => `<li><span class="avatar">${esc(PP.initials(PP.patientName(x.patientId)))}</span><a class="grow" href="#/patients/${x.patientId}"><b>${esc(PP.patientName(x.patientId))}</b><span class="sub">Next visit suggested ${PP.fmt.dateShort(x.nextVisit)}</span></a></li>`).join('') : `<li style="display:block">${PP.ui.empty({ icon: 'checkCircle', title: 'No follow-ups due' })}</li>`; }

      // Collection summary
      const coll = PP.$('[data-coll]', el);
      const drawColl = (period) => {
        const from = period === 'daily' ? T : PP.monthStart(T);
        const c = collected(from, T); const due = dueFor(from, T);
        coll.innerHTML = `<dl class="coll">
          <dt>Total Collection</dt><dd class="big">${PP.fmt.money(c.total)}</dd>
          <dt>Cash Collection</dt><dd>${PP.fmt.money(c.cash)}</dd>
          <dt>Online Collection <span class="small muted">(bKash, Nagad, card, bank)</span></dt><dd>${PP.fmt.money(c.online)}</dd>
          <dt class="due">Due / Pending</dt><dd class="due">${PP.fmt.money(due)}</dd></dl>
          <div class="small muted mt-3">Collections count only completed payments. Dues = payable − net posted payments.</div>`;
      };
      if (coll) { drawColl('daily'); PP.ui.bindSegmented(el, 'period', drawColl); }

      // Quick actions
      const qa = [
        ['appointments.manage', '#/appointments/new', 'calendar', 'New Appointment'],
        ['patients.edit', '#/patients/new', 'userPlus', 'Add Patient'],
        ['prescriptions.issue', '#/prescriptions/new', 'rx', 'New Prescription'],
        ['billing.manage', '#/billing/new', 'coins', 'Collection Entry'],
        ['services.manage', '#/services', 'settings', 'Service Pricing'],
        ['reports.view', '#/reports/collections', 'chart', 'Reports'],
        ['clinical.write', '#/visits/new', 'clipboard', 'Clinical Visit'],
        ['requests.review', '#/appointments/requests', 'globe', 'Online Requests'],
      ].filter(([perm]) => PP.can(perm)).slice(0, 6);
      PP.$('[data-quick]', el).innerHTML = qa.map(([, href, ic, l]) => `<a class="quick-tile" href="${href}">${PP.icon(ic)}<span>${l}</span></a>`).join('');
    },
  });
})();
