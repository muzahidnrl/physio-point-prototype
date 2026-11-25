/* Physio Point Super Admin — entitlements (global switches, per-customer matrix, overrides, limits, history, rollback),
   plans & subscriptions, and configuration catalogues (business types, professional types, form templates).
   Rules: feature-entitlement-system.md (MP §6), D-016 (business limits only), D-020 (professional type ≠ role). */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;

  /* ------------------------------------------------------------------ helpers */
  const me = () => (PP.currentUser() ? PP.currentUser().name : 'System');
  const need = (perm, what) => { if (PP.can(perm)) return true; PP.ui.toast(`Your role cannot ${what}. (Permission <code>${esc(perm)}</code>; checked on the server in production.)`, 'error', 4200); return false; };
  const reasonField = (label) => PP.form.field({ name: 'reason', label: label || 'Reason for this change', type: 'textarea', required: true, rows: 2, placeholder: 'Who asked, why, ticket or contract reference', hint: 'Required. Stored in the configuration history with who, when, before and after.' });
  const expiryField = () => PP.form.field({ name: 'expires', label: 'Expires on (optional)', type: 'date', min: PP.today(), hint: 'Leave empty for no expiry. Expired overrides are skipped when the set is resolved.' });
  const checkExpiry = (form) => { const v = PP.form.read(form).expires; if (v && v < PP.today()) { PP.form.setError(form, 'expires', 'The expiry date cannot be in the past.'); return false; } return true; };
  const featList = (codes, max) => { const m = max || 14; const list = codes.slice(0, m).map((c) => `<li><code>${esc(c)}</code> ${esc(SA.featureName(c))}</li>`).join(''); return `<ul class="sae-warnlist">${list}${codes.length > m ? `<li>… and ${codes.length - m} more</li>` : ''}</ul>`; };
  const gState = (code) => ((PP.db.globalSwitches || {})[code] || { state: 'on' }).state;

  SA.draftOf = (c) => SA.resolve({ planId: c.planId, overrides: SA.overridesOf(c.id) });
  const ovKey = (o) => [o.type, o.code, o.action, o.value == null ? '' : o.value, o.expires || ''].join('|');
  /** Unpublished changes: draft (plan + current overrides) vs the latest published set. */
  SA.pendingInfo = function (c) {
    const latest = SA.latestSet(c.id); const d = SA.draftOf(c);
    if (!latest) return { latest: null, draft: d, diff: { added: d.features, removed: [], limits: [] }, any: true, overridesChanged: true };
    const diff = SA.diffSets(latest, d);
    const now = SA.activeOverrides(SA.overridesOf(c.id)).map(ovKey).sort().join(';');
    const then = SA.activeOverrides(latest.overrides || []).map(ovKey).sort().join(';');
    const overridesChanged = now !== then || latest.planId !== c.planId;
    return { latest, draft: d, diff, any: !!(diff.added.length || diff.removed.length || diff.limits.length || overridesChanged), overridesChanged };
  };
  const diffHtml = (diff, empty) => {
    const rows = [
      ...diff.added.map((f) => `<li class="add"><code>${esc(f)}</code> ${esc(SA.featureName(f))}</li>`),
      ...diff.removed.map((f) => `<li class="del"><code>${esc(f)}</code> ${esc(SA.featureName(f))}</li>`),
      ...diff.limits.map((l) => `<li class="chg">${esc(SA.limitLabel(l.code))}: ${esc(SA.fmtLimit(l.from))} → <b>${esc(SA.fmtLimit(l.to))}</b></li>`),
    ];
    return rows.length ? `<ul class="sa-diff">${rows.join('')}</ul>` : `<p class="muted small">${empty || 'No difference in features or limits.'}</p>`;
  };

  function removeOverride(o, reason) { o.removed = true; o.removedReason = reason; o.removedAt = PP.nowStamp(); o.removedBy = me(); }
  function addOverride(c, data) {
    const o = Object.assign({ id: PP.nextId('OVR', 4), customerId: c.id, value: null, expires: null, by: me(), at: PP.nowStamp(), removed: false }, data);
    PP.db.overrides.push(o); return o;
  }
  /** Sets the wanted state of a feature for a customer by adding/removing overrides (plan default when equal). */
  function setFeature(c, code, on, reason, expires) {
    const plan = SA.plan(c.planId) || { features: [] }; const inPlan = plan.features.includes(code);
    SA.overridesOf(c.id).filter((o) => !o.removed && o.type === 'feature' && o.code === code).forEach((o) => removeOverride(o, `Replaced: ${reason}`));
    if (on && !inPlan) return addOverride(c, { type: 'feature', code, action: 'grant', reason, expires: expires || null });
    if (!on && inPlan) return addOverride(c, { type: 'feature', code, action: 'revoke', reason, expires: expires || null });
    return null; // back to plan default
  }
  const wanted = (c, d, code) => d.fromPlan.includes(code) ? !d.revoked.includes(code) : d.granted.includes(code);

  /* ---------------------------------------------------------- publish dialog */
  function publishDialog(c, onDone) {
    if (!need('entitlements.manage', 'publish entitlements')) return;
    const p = SA.pendingInfo(c); const next = (p.latest ? p.latest.version : 0) + 1;
    PP.ui.modal({
      title: `Publish entitlement set v${next}`, size: 'lg',
      body: `<p style="margin-top:0">${esc(c.name)} · plan ${esc(SA.planName(c.planId))}. Changes against v${p.latest ? p.latest.version : 0}:</p>
        ${diffHtml(p.diff, p.overridesChanged ? 'No feature or limit difference; only override records (reason, expiry) changed.' : '')}
        ${p.draft.autoDisabled.length ? PP.ui.alert('warning', `<b>${p.draft.autoDisabled.length} feature(s) auto-disabled</b> because a prerequisite is off: ${p.draft.autoDisabled.slice(0, 6).map((a) => `<code>${esc(a.code)}</code>`).join(', ')}${p.draft.autoDisabled.length > 6 ? '…' : ''}`) : ''}
        <form class="stack mt-3" onsubmit="return false">${reasonField('Reason for publishing')}</form>
        <p class="small muted">The set is signed with the vendor licence-signing key (simulated) and bound to tenant <code>${esc(c.tenantId)}</code>. The customer's data plane pulls it on its next validation (interval PD-028) and keeps the previous version.</p>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: `Sign and publish v${next}`, kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const reason = PP.form.read(f).reason; await PP.sleep(500);
        const set = SA.publish(c, reason);
        PP.audit('Entitlements published', c.id, `v${set.version} · ${set.features.length} features · ${reason}`);
        PP.save(); PP.ui.toast(`Published v${set.version} for ${esc(c.name)} · signature ${esc(SA.shortSig(set.signature))}`);
        if (onDone) onDone(set);
      } }],
    });
  }
  function discardDraft(c, onDone) {
    const latest = SA.latestSet(c.id); if (!latest) return;
    PP.ui.confirm({ title: 'Discard unpublished changes?', message: `The overrides and plan return to what was published in v${latest.version}. Discarded overrides stay in the history as removed.`, confirmLabel: 'Discard changes', danger: true }).then((ok) => {
      if (!ok) return;
      SA.overridesOf(c.id).filter((o) => !o.removed).forEach((o) => removeOverride(o, 'Discarded unpublished change'));
      (latest.overrides || []).forEach((o) => PP.db.overrides.push(Object.assign(PP.clone(o), { id: PP.nextId('OVR', 4), removed: false, restoredFrom: o.id })));
      c.planId = latest.planId;
      PP.audit('Unpublished entitlement changes discarded', c.id, `Back to v${latest.version}`); PP.save();
      PP.ui.toast('Unpublished changes discarded'); if (onDone) onDone();
    });
  }

  /* ------------------------------------------------------- feature toggle dialog */
  function toggleDialog(c, code, turnOn, onDone) {
    if (!need('entitlements.manage', 'change entitlements')) return;
    const d = SA.draftOf(c); const plan = SA.plan(c.planId) || { features: [] }; const inPlan = plan.features.includes(code);
    const already = wanted(c, d, code);
    const prereq = turnOn ? SA.prerequisitesFor(code, d.features) : [];
    const prereqOff = prereq.filter((p) => gState(p) === 'off');
    const deps = turnOn ? [] : SA.dependantsOf(code, d.features);
    let action;
    if (turnOn) action = already ? 'Its prerequisites are off, so it is auto-disabled. Enable the prerequisites below.' : inPlan ? 'Return to the plan default (remove the revoke override).' : `<b>Grant</b> beyond the ${esc(plan.name || '')} plan (customer override).`;
    else action = inPlan ? `<b>Revoke</b> from the ${esc(plan.name || '')} plan (customer override).` : 'Return to the plan default (remove the grant override).';
    const note = SA.DEP_NOTES[code] ? PP.ui.alert('info', esc(SA.DEP_NOTES[code])) : '';
    PP.ui.modal({
      title: `${turnOn ? 'Enable' : 'Disable'} ${esc(SA.featureName(code))}`,
      body: `<p style="margin-top:0"><code>${esc(code)}</code> · ${esc(SA.moduleName(code.split('.')[0]))}<br><span class="small">${action}</span></p>
        ${note}
        ${prereq.length ? PP.ui.alert('warning', `<b>Missing prerequisites (${prereq.length}).</b> Without them the feature is switched off automatically when the set is resolved.${featList(prereq)}${prereqOff.length ? `<div class="mt-2"><b>Globally off:</b> ${prereqOff.map((p) => `<code>${esc(p)}</code>`).join(', ')} — it stays off until the global switch is turned on.</div>` : ''}<label class="check mt-2"><input type="checkbox" name="withPrereq" checked> Also enable the ${prereq.length} prerequisite(s)</label>`) : ''}
        ${deps.length ? PP.ui.alert('warning', `<b>${deps.length} enabled feature(s) depend on this</b> and will be auto-disabled when published:${featList(deps)}`) : ''}
        ${!turnOn ? PP.ui.alert('info', 'Disabling a feature <b>never deletes data</b>. Existing records stay and become read-only or hidden in the customer’s workspace; the API refuses new actions with <code>feature_not_entitled</code>.') : ''}
        <form class="form-grid mt-3" onsubmit="return false">${reasonField()}${(turnOn && already) || (turnOn ? inPlan : !inPlan) ? '' : expiryField()}</form>
        <p class="small muted">The change is saved as a draft. Publish a new version to send it to the customer.</p>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: turnOn ? 'Save as draft' : 'Disable (draft)', kind: turnOn ? 'primary' : 'danger solid', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f) || !checkExpiry(f)) return false;
        const v = PP.form.read(f); const withPre = PP.$('[name=withPrereq]', body) ? PP.$('[name=withPrereq]', body).checked : false;
        await PP.sleep(250);
        if (!(turnOn && already)) setFeature(c, code, turnOn, v.reason, v.expires);
        if (turnOn && withPre) prereq.forEach((p) => setFeature(c, p, true, `Prerequisite of ${code}: ${v.reason}`, v.expires));
        PP.audit(turnOn ? 'Feature enabled (draft)' : 'Feature disabled (draft)', c.id, `${code}${withPre && prereq.length ? ` + ${prereq.length} prerequisites` : ''} · ${v.reason}`);
        PP.save(); PP.ui.toast(`${esc(SA.featureName(code))} ${turnOn ? 'enabled' : 'disabled'} in the draft. Publish to apply.`);
        if (onDone) onDone();
      } }],
    });
  }

  /* ------------------------------------------------------------- limit dialog */
  function limitDialog(c, code, onDone) {
    if (!need('entitlements.manage', 'change usage limits')) return;
    const plan = SA.plan(c.planId) || { limits: {} }; const d = SA.draftOf(c);
    const lim = SA.LIMITS.find((l) => l.code === code); const dep = SA.deployment(c.id); const used = dep ? dep.usage[lim.counter] || 0 : 0;
    const cur = SA.activeOverrides(SA.overridesOf(c.id)).find((o) => o.type === 'limit' && o.code === code);
    PP.ui.modal({
      title: `Usage limit: ${esc(lim.label)}`,
      body: `<dl class="kv kv-tight"><dt>Plan default</dt><dd>${esc(SA.fmtLimit(plan.limits[code]))}</dd><dt>Effective now</dt><dd>${esc(SA.fmtLimit(d.limits[code]))}</dd><dt>Current usage</dt><dd>${PP.fmt.num(used)} <span class="small muted">(aggregated counter from the heartbeat)</span></dd></dl>
        <form class="form-grid mt-3" onsubmit="return false">
          ${PP.form.field({ name: 'value', label: 'New limit', type: 'number', min: 0, step: 1, value: cur ? (cur.value == null ? '' : cur.value) : d.limits[code] == null ? '' : d.limits[code], hint: 'Leave empty for unlimited.', rule: 'nonneg' })}
          ${expiryField()}
          ${reasonField()}
        </form>
        <div data-warn class="mt-2"></div>
        <p class="small muted">Reaching a limit blocks only <b>new</b> records of that kind (<code>limit_reached</code>). Existing data stays fully usable. Limits are business limits only — never storage, disk, RAM, CPU or bandwidth (D-016).</p>`,
      onOpen: (body) => {
        const inp = PP.$('[name=value]', body); const warn = PP.$('[data-warn]', body);
        const chk = () => { const v = inp.value.trim(); warn.innerHTML = v !== '' && Number(v) < used ? PP.ui.alert('warning', `<b>Below current usage</b> (${PP.fmt.num(used)}). Allowed, but flagged: nothing is deleted; the customer cannot add new ${esc(lim.label.toLowerCase())} until usage drops below the limit.`) : ''; };
        inp.addEventListener('input', chk); chk();
      },
      buttons: [
        { label: 'Cancel', kind: 'ghost' },
        ...(cur ? [{ label: 'Reset to plan default', kind: 'ghost', onClick: async ({ body }) => {
          const f = PP.$('form', body); PP.form.clearErrors(f); const r = PP.form.read(f).reason; if (!r) { PP.form.setError(f, 'reason', 'Please enter a reason.'); return false; }
          removeOverride(cur, r); PP.audit('Limit override removed (draft)', c.id, `${code} → plan default · ${r}`); PP.save(); PP.ui.toast('Limit reset to the plan default (draft)'); if (onDone) onDone();
        } }] : []),
        { label: 'Save as draft', kind: 'primary', onClick: async ({ body }) => {
          const f = PP.$('form', body); if (!PP.form.validate(f) || !checkExpiry(f)) return false;
          const v = PP.form.read(f); const val = v.value === '' ? null : Math.floor(Number(v.value));
          SA.overridesOf(c.id).filter((o) => !o.removed && o.type === 'limit' && o.code === code).forEach((o) => removeOverride(o, `Replaced: ${v.reason}`));
          addOverride(c, { type: 'limit', code, action: 'value', value: val, reason: v.reason, expires: v.expires || null, belowUsage: val != null && val < used });
          PP.audit('Limit changed (draft)', c.id, `${code}: ${SA.fmtLimit(d.limits[code])} → ${SA.fmtLimit(val)} · ${v.reason}`);
          PP.save(); PP.ui.toast(`${esc(lim.label)} limit set to ${esc(SA.fmtLimit(val))} in the draft. Publish to apply.`, val != null && val < used ? 'warning' : 'positive');
          if (onDone) onDone();
        } },
      ],
    });
  }

  /* ---------------------------------------------------------------- matrix */
  function tagsFor(code, d, latest, extra) {
    const t = [];
    const f = SA.feature(code);
    if (f && f.core) return '<span class="sa-tag core">core</span>';
    if (d.globallyOff.includes(code)) t.push('<span class="sa-tag global">global off</span>');
    const auto = d.autoDisabled.find((a) => a.code === code); if (auto) t.push('<span class="sa-tag auto">auto-off</span>');
    if (d.granted.includes(code)) t.push('<span class="sa-tag grant">grant</span>');
    else if (d.revoked.includes(code)) t.push('<span class="sa-tag revoke">revoke</span>');
    else if (d.fromPlan.includes(code)) t.push('<span class="sa-tag plan">plan</span>');
    if (gState(code) === 'beta') t.push('<span class="sa-tag beta">beta</span>');
    if (latest && latest.features.includes(code) !== d.features.includes(code)) t.push('<span class="sa-tag auto" title="Differs from the published version">unpublished</span>');
    return t.join(' ') + (extra || '');
  }
  function matrixHtml(c, d, latest, filt) {
    const q = (filt.q || '').toLowerCase(); const ovs = SA.activeOverrides(SA.overridesOf(c.id)).filter((o) => o.type === 'feature');
    const mods = SA.MODULES.filter((m) => !filt.mod || m.code === filt.mod).map((m) => {
      const feats = SA.FEATURES.filter((f) => f.module === m.code).filter((f) => {
        if (q && !(f.code + ' ' + f.name).toLowerCase().includes(q)) return false;
        const on = d.features.includes(f.code);
        if (filt.view === 'on' && !on) return false; if (filt.view === 'off' && on) return false;
        if (filt.view === 'overrides' && !ovs.some((o) => o.code === f.code)) return false;
        if (filt.view === 'changed' && !(latest && latest.features.includes(f.code) !== on)) return false;
        return true;
      });
      if (!feats.length) return '';
      const onCount = SA.FEATURES.filter((f) => f.module === m.code && d.features.includes(f.code)).length; const total = m.features.length;
      return `<div class="sa-module"><div class="sa-module-head"><b>${esc(m.name)}</b><span class="small muted mono">${onCount}/${total} on</span></div>
        ${feats.map((f) => {
          const on = d.features.includes(f.code); const auto = d.autoDisabled.find((a) => a.code === f.code); const gOff = d.globallyOff.includes(f.code);
          const ov = ovs.find((o) => o.code === f.code);
          const cls = gOff ? 'is-off-global' : ov ? 'is-override' : '';
          const disabled = f.core || gOff;
          const extra = (auto ? `<span class="sae-need">Needs ${auto.missing.map(SA.reqLabel).join(', ')}</span>` : '') + (ov && ov.expires ? `<span class="sae-need" style="color:var(--pp-text-3)">Override until ${PP.fmt.date(ov.expires)}</span>` : '');
          return `<div class="sa-feat ${cls}"><label class="sa-switch" title="${f.core ? 'Core feature: always on for every customer' : gOff ? 'Switched off globally by the vendor' : on ? 'Disable' : 'Enable'}"><input type="checkbox" data-toggle="${esc(f.code)}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${esc(f.name)}"><span></span></label>
            <div class="nm">${esc(f.name)}<code>${esc(f.code)}</code>${extra}</div><div class="row" style="gap:4px;justify-content:flex-end">${tagsFor(f.code, d, latest)}</div></div>`;
        }).join('')}</div>`;
    }).join('');
    return mods ? `<div class="sa-matrix">${mods}</div>` : PP.ui.empty({ icon: 'filter', title: 'No features match', text: 'Try another search term, module or view.' });
  }
  const moduleOptions = (sel) => SA.MODULES.map((m) => `<option value="${m.code}" ${sel === m.code ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const legend = () => `<div class="sae-legend"><span><span class="sa-tag plan">plan</span> from the plan</span><span><span class="sa-tag grant">grant</span> customer grant</span><span><span class="sa-tag revoke">revoke</span> customer revoke</span><span><span class="sa-tag global">global off</span> vendor kill switch</span><span><span class="sa-tag auto">auto-off</span> prerequisite missing</span><span><span class="sa-tag core">core</span> always on</span><span><span class="sa-tag beta">beta</span> staged rollout</span></div>`;

  /* ======================================================= /entitlements (global) */
  PP.route('/entitlements', {
    title: 'Entitlements', perm: 'customers.view',
    render({ el, query }) {
      let tab = query.tab || 'global'; const filt = { q: '', mod: '', view: '' };
      el.innerHTML = PP.ui.pageHead({ title: 'Entitlements', subtitle: 'Global feature switches and per-customer entitlement sets. Every feature is authorised at the customer’s API; hiding a menu is not enough.', crumbs: [['Dashboard', '#/dashboard'], ['Entitlements']] })
        + '<div class="card"><div data-tabs style="padding:0 12px"></div><div class="card-body" data-body></div></div>';
      const body = PP.$('[data-body]', el);
      const counts = () => { const m = {}; PP.db.customers.forEach((c) => { const s = SA.latestSet(c.id); if (s) s.features.forEach((f) => { m[f] = (m[f] || 0) + 1; }); }); return m; };
      function drawGlobal() {
        const off = Object.values(PP.db.globalSwitches || {}).filter((g) => g.state === 'off').length; const beta = Object.values(PP.db.globalSwitches || {}).filter((g) => g.state === 'beta').length;
        body.innerHTML = `${PP.ui.alert('info', '<b>Global switches apply to every customer.</b> <b>Off</b> is a kill switch: the feature is removed from every resolved entitlement set, even when a plan or override includes it. <b>Beta</b> marks a staged rollout (the feature stays available to entitled customers and is labelled beta). Core features are always on.')}
          <div class="row mt-3" style="gap:8px">${SA.badge(`${off} off`, off ? 'error' : 'neutral')} ${SA.badge(`${beta} beta`, beta ? 'info' : 'neutral')} <span class="small muted">${SA.OPTIONAL_FEATURES.length} switchable features · ${SA.CORE_FEATURES.length} core</span></div>
          <div class="sae-toolbar mt-3"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q placeholder="Search feature name or code" value="${esc(filt.q)}" aria-label="Search features"></div>
            <select class="select" data-mod aria-label="Module"><option value="">All modules</option>${moduleOptions(filt.mod)}</select>
            <select class="select" data-view aria-label="State"><option value="">All states</option><option value="off" ${filt.view === 'off' ? 'selected' : ''}>Off only</option><option value="beta" ${filt.view === 'beta' ? 'selected' : ''}>Beta only</option></select></div>
          <div data-grid></div>`;
        const grid = PP.$('[data-grid]', body);
        const drawGrid = () => {
          const cnt = counts(); const q = filt.q.toLowerCase();
          const html = SA.MODULES.filter((m) => !m.core && (!filt.mod || m.code === filt.mod)).map((m) => {
            const feats = SA.FEATURES.filter((f) => f.module === m.code && !f.core && (!q || (f.code + ' ' + f.name).toLowerCase().includes(q)) && (!filt.view || gState(f.code) === filt.view));
            if (!feats.length) return '';
            return `<div class="sa-module"><div class="sa-module-head"><b>${esc(m.name)}</b><code>${esc(m.code)}.*</code></div>${feats.map((f) => {
              const st = gState(f.code); const g = (PP.db.globalSwitches || {})[f.code];
              return `<div class="sa-feat ${st === 'off' ? 'is-off-global' : ''}"><div class="nm">${esc(f.name)}<code>${esc(f.code)}</code>${g && g.reason ? `<span class="sae-need" style="color:var(--pp-text-3)" title="${esc(g.reason)}">${esc(g.by)} · ${PP.fmt.date(g.at)}</span>` : ''}</div>
                <span class="sae-count">${cnt[f.code] || 0} cust.</span>
                <select class="sae-gsel ${st}" data-g="${esc(f.code)}" aria-label="Global state of ${esc(f.name)}"><option value="on" ${st === 'on' ? 'selected' : ''}>On</option><option value="beta" ${st === 'beta' ? 'selected' : ''}>Beta</option><option value="off" ${st === 'off' ? 'selected' : ''}>Off</option></select></div>`;
            }).join('')}</div>`;
          }).join('');
          grid.innerHTML = html ? `<div class="sa-matrix">${html}</div>` : PP.ui.empty({ icon: 'filter', title: 'No features match', text: 'Change the search or filters.' });
        };
        drawGrid();
        PP.$('[data-q]', body).addEventListener('input', (e) => { filt.q = e.target.value.trim(); drawGrid(); });
        PP.$('[data-mod]', body).addEventListener('change', (e) => { filt.mod = e.target.value; drawGrid(); });
        PP.$('[data-view]', body).addEventListener('change', (e) => { filt.view = e.target.value; drawGrid(); });
        grid.addEventListener('change', (e) => {
          const sel = e.target.closest('[data-g]'); if (!sel) return;
          const code = sel.dataset.g; const to = sel.value; const from = gState(code);
          sel.value = from; // only changes after confirmation
          if (!need('entitlements.global', 'change global feature switches')) return;
          globalDialog(code, from, to, () => { drawGlobal(); });
        });
      }
      function drawCustomers() {
        body.innerHTML = '<div data-t></div>';
        const t = PP.$('[data-t]', body); t.style.margin = '-20px';
        PP.ui.table(t, {
          getRows: () => PP.db.customers,
          search: { placeholder: 'Search customer, tenant ID', text: (c) => `${c.name} ${c.id} ${c.tenantId}` },
          filters: [{ id: 'plan', label: 'All plans', options: PP.db.plans.map((p) => [p.id, p.name]), match: (c, v) => c.planId === v }, { id: 'pend', label: 'Any publish state', options: [['yes', 'Unpublished changes'], ['no', 'Up to date']], match: (c, v) => (SA.pendingInfo(c).any ? 'yes' : 'no') === v }],
          exportName: 'entitlements-customers',
          columns: [
            { key: 'name', label: 'Customer', sort: (c) => c.name, render: (c) => `<b>${esc(c.name)}</b><span class="sub">${esc(c.id)} · ${esc(SA.btLabel(c.businessType))}</span>` },
            { key: 'plan', label: 'Plan', sort: (c) => SA.planName(c.planId), render: (c) => esc(SA.planName(c.planId)) },
            { key: 'state', label: 'State', render: (c) => SA.badge(SA.state(c)) },
            { key: 'ver', label: 'Version', sort: (c) => c.entitlementVersion, render: (c) => { const s = SA.latestSet(c.id); return s ? `<b class="mono">v${s.version}</b><span class="sub">${s.features.length} features</span>` : '—'; } },
            { key: 'ov', label: 'Overrides', sort: (c) => SA.activeOverrides(SA.overridesOf(c.id)).length, render: (c) => { const n = SA.activeOverrides(SA.overridesOf(c.id)).length; return n ? `<span class="sa-pill">${n} active</span>` : '<span class="muted">—</span>'; } },
            { key: 'pub', label: 'Last published', sort: (c) => (SA.latestSet(c.id) || {}).issuedAt || '', render: (c) => { const s = SA.latestSet(c.id); return s ? `${PP.fmt.stamp(s.issuedAt)}<span class="sub">${esc(s.by)}</span>` : '—'; } },
            { key: 'pend', label: 'Draft', render: (c) => (SA.pendingInfo(c).any ? SA.badge('Unpublished', 'warning') : SA.badge('Up to date', 'positive')) },
            { key: 'go', label: '', render: (c) => `<a class="btn btn-sm" href="#/entitlements/${c.id}">Open ${PP.icon('chevR')}</a>` },
          ],
          onRowClick: (c) => { location.hash = `#/entitlements/${c.id}`; },
        });
      }
      const drawTab = () => (tab === 'customers' ? drawCustomers() : drawGlobal());
      PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: [{ id: 'global', label: 'Global feature switches' }, { id: 'customers', label: 'Customers', count: PP.db.customers.filter((c) => SA.pendingInfo(c).any).length || null }], active: tab, onChange: (t) => { tab = t; drawTab(); } });
      drawTab();
    },
  });

  function globalDialog(code, from, to, onDone) {
    if (from === to) return;
    const holders = PP.db.customers.filter((c) => { const s = SA.latestSet(c.id); return s && s.features.includes(code); });
    const deps = SA.dependantsOf(code, SA.FEATURE_CODES);
    // predict which customers' sets change
    const prev = PP.db.globalSwitches[code];
    PP.db.globalSwitches[code] = { state: to };
    const affected = PP.db.customers.filter((c) => { const s = SA.latestSet(c.id); if (!s) return false; const d = SA.draftOf(c); return d.features.includes(code) !== s.features.includes(code) || SA.diffSets(s, d).removed.some((f) => deps.includes(f)); });
    if (prev) PP.db.globalSwitches[code] = prev; else delete PP.db.globalSwitches[code];
    const what = to === 'off' ? 'Switch off globally (kill switch)' : to === 'beta' ? 'Mark as beta (staged rollout)' : 'Switch on globally';
    PP.ui.modal({
      title: `${what}: ${esc(SA.featureName(code))}`, size: 'lg',
      body: `<p style="margin-top:0"><code>${esc(code)}</code> · currently <b>${esc(from)}</b> → <b>${esc(to)}</b></p>
        <dl class="kv kv-tight"><dt>Customers with it</dt><dd>${holders.length} in their published set${holders.length ? `<div class="small muted">${holders.slice(0, 8).map((c) => esc(c.name)).join(', ')}${holders.length > 8 ? '…' : ''}</div>` : ''}</dd>
        <dt>Sets that change</dt><dd>${affected.length}</dd></dl>
        ${to === 'off' && deps.length ? PP.ui.alert('warning', `<b>${deps.length} dependant feature(s)</b> lose a prerequisite and are auto-disabled for those customers:${featList(deps)}`) : ''}
        ${to === 'off' ? PP.ui.alert('info', 'Switching off never deletes data. Existing records stay readable; new actions are refused by the API guard.') : ''}
        <form class="stack mt-3" onsubmit="return false">${reasonField()}
          ${affected.length ? `<label class="check"><input type="checkbox" name="republish" checked> Re-publish the ${affected.length} affected customer set(s) now (new signed versions)</label>` : ''}</form>`,
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: to === 'off' ? 'Switch off' : 'Apply', kind: to === 'off' ? 'danger solid' : 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const v = PP.form.read(f); await PP.sleep(400);
        PP.db.globalSwitches[code] = { state: to, reason: v.reason, at: PP.nowStamp(), by: me(), previous: from };
        PP.audit(to === 'off' ? 'Global feature switched off' : to === 'beta' ? 'Global feature set to beta' : 'Global feature switched on', code, v.reason);
        let n = 0;
        if (v.republish) affected.forEach((c) => { const s = SA.publish(c, `Global switch ${code} → ${to}: ${v.reason}`); PP.audit('Entitlements published', c.id, `v${s.version} · global switch ${code} → ${to}`); n++; });
        PP.save(); PP.ui.toast(`${esc(code)} is now ${esc(to)}${n ? ` · ${n} customer set(s) re-published` : ''}`, to === 'off' ? 'warning' : 'positive');
        if (onDone) onDone();
      } }],
    });
  }

  /* ================================================= /entitlements/:id (customer) */
  PP.route('/entitlements/:id', {
    title: 'Customer entitlements', perm: 'customers.view',
    render({ el, params, query }) {
      const c = SA.customer(params.id);
      if (!c) { el.innerHTML = PP.ui.notFound(`/entitlements/${params.id}`); return; }
      let tab = query.tab || 'matrix'; const filt = { q: '', mod: '', view: '' }; const picks = [];
      function paint() {
        const latest = SA.latestSet(c.id); const p = SA.pendingInfo(c); const plan = SA.plan(c.planId);
        el.innerHTML = PP.ui.pageHead({
          title: `${esc(c.name)} · entitlements`, crumbs: [['Entitlements', '#/entitlements?tab=customers'], [c.name, `#/customers/${c.id}`], ['Entitlements']],
          subtitle: `<span class="row" style="gap:8px">${SA.badge(SA.state(c))} <span>Plan <b>${esc(plan ? plan.name : '—')}</b></span> <span>· Published <b class="mono">v${latest ? latest.version : 0}</b></span> ${latest ? `<span class="sa-signed" title="${esc(latest.signature)}">${PP.icon('shield')} ${esc(SA.shortSig(latest.signature))}</span>` : ''} <span class="small muted">Tenant <code>${esc(c.tenantId)}</code></span></span>`,
          actions: `<a class="btn" href="#/customers/${c.id}">${PP.icon('building')} Customer</a><button class="btn" data-plan>${PP.icon('layers')} Change plan</button><button class="btn btn-primary" data-publish ${p.any ? '' : 'disabled'}>${PP.icon('send')} Publish v${(latest ? latest.version : 0) + 1}</button>`,
        }) + (p.any ? `<div class="sae-unpub"><div><b>Unpublished changes</b> · ${p.diff.added.length} added, ${p.diff.removed.length} removed, ${p.diff.limits.length} limit change(s)${!p.diff.added.length && !p.diff.removed.length && !p.diff.limits.length ? ' (override records only)' : ''}. The customer still runs v${latest ? latest.version : 0}.</div><div class="row"><button class="btn btn-sm" data-diff>Review</button><button class="btn btn-sm btn-ghost" data-discard>Discard</button><button class="btn btn-sm btn-primary" data-publish2>Publish v${(latest ? latest.version : 0) + 1}</button></div></div>`
          : `<div class="sae-pub-ok">${PP.icon('checkCircle')} The draft matches the published version v${latest ? latest.version : 0}. ${latest ? `Last published ${PP.fmt.stamp(latest.issuedAt)} by ${esc(latest.by)}.` : ''}</div>`)
          + '<div class="card"><div data-tabs style="padding:0 12px"></div><div class="card-body" data-body></div></div>';
        PP.$$('[data-publish], [data-publish2]', el).forEach((b) => b.addEventListener('click', () => publishDialog(c, paint)));
        const dbtn = PP.$('[data-diff]', el); if (dbtn) dbtn.addEventListener('click', () => PP.ui.modal({ title: `Draft vs v${latest ? latest.version : 0}`, body: diffHtml(p.diff, 'Only override records (reason or expiry) changed.'), buttons: [{ label: 'Close', kind: 'ghost' }] }));
        const disc = PP.$('[data-discard]', el); if (disc) disc.addEventListener('click', () => discardDraft(c, paint));
        PP.$('[data-plan]', el).addEventListener('click', () => planDialog(c, paint));
        const ovN = SA.activeOverrides(SA.overridesOf(c.id)).length;
        PP.ui.tabs(PP.$('[data-tabs]', el), { tabs: [{ id: 'matrix', label: 'Feature matrix' }, { id: 'overrides', label: 'Overrides', count: ovN || null }, { id: 'limits', label: 'Usage limits' }, { id: 'history', label: 'History & rollback', count: SA.setsOf(c.id).length }], active: tab, onChange: (t) => { tab = t; drawTab(); } });
        drawTab();
      }
      const body = () => PP.$('[data-body]', el);
      function drawTab() { ({ matrix: drawMatrix, overrides: drawOverrides, limits: drawLimits, history: drawHistory })[tab](); }

      function drawMatrix() {
        const b = body(); const d = SA.draftOf(c); const latest = SA.latestSet(c.id);
        b.innerHTML = `<div class="sae-toolbar"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-q value="${esc(filt.q)}" placeholder="Search feature name or code" aria-label="Search features"></div>
          <select class="select" data-mod aria-label="Module"><option value="">All modules</option>${moduleOptions(filt.mod)}</select>
          <select class="select" data-view aria-label="Show"><option value="">All features</option>${[['on', 'Enabled'], ['off', 'Disabled'], ['overrides', 'With overrides'], ['changed', 'Unpublished changes']].map(([v, l]) => `<option value="${v}" ${filt.view === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="small muted">${d.features.length} of ${SA.FEATURES.length} on (draft)</span></div>${legend()}<div data-grid></div>`;
        const grid = PP.$('[data-grid]', b);
        const drawGrid = () => { grid.innerHTML = matrixHtml(c, SA.draftOf(c), latest, filt); };
        drawGrid();
        PP.$('[data-q]', b).addEventListener('input', (e) => { filt.q = e.target.value.trim(); drawGrid(); });
        PP.$('[data-mod]', b).addEventListener('change', (e) => { filt.mod = e.target.value; drawGrid(); });
        PP.$('[data-view]', b).addEventListener('change', (e) => { filt.view = e.target.value; drawGrid(); });
        grid.addEventListener('change', (e) => {
          const inp = e.target.closest('[data-toggle]'); if (!inp) return;
          const on = inp.checked; inp.checked = !on; // revert until confirmed
          toggleDialog(c, inp.dataset.toggle, on, paint);
        });
      }

      function drawOverrides() {
        const b = body(); b.innerHTML = '<div data-t style="margin:-20px"></div>';
        const t = PP.$('[data-t]', b);
        const status = (o) => (o.removed ? 'Removed' : o.expires && o.expires < PP.today() ? 'Expired' : 'Active');
        PP.ui.table(t, {
          getRows: () => SA.overridesOf(c.id).slice().sort((x, y) => (x.at < y.at ? 1 : -1)),
          search: { placeholder: 'Search code or reason', text: (o) => `${o.code} ${o.reason} ${o.by}` },
          filters: [{ id: 'st', label: 'Any status', value: 'Active', options: [['Active', 'Active'], ['Expired', 'Expired'], ['Removed', 'Removed']], match: (o, v) => status(o) === v }, { id: 'ty', label: 'Any type', options: [['feature', 'Feature'], ['limit', 'Limit']], match: (o, v) => o.type === v }],
          empty: { icon: 'layers', title: 'No overrides', text: 'This customer gets exactly its plan. Toggle a feature in the matrix or edit a limit to create an override.' },
          exportName: `overrides-${c.id}`,
          columns: [
            { key: 'code', label: 'Feature / limit', sort: (o) => o.code, render: (o) => `<b>${esc(o.type === 'limit' ? SA.limitLabel(o.code) : SA.featureName(o.code))}</b><span class="sub"><code>${esc(o.type === 'limit' ? 'limit.' + o.code : o.code)}</code></span>` },
            { key: 'act', label: 'Override', render: (o) => (o.type === 'limit' ? `<span class="sa-tag plan">value</span> <b class="mono">${esc(SA.fmtLimit(o.value))}</b>${o.belowUsage ? ' <span class="sa-tag auto">below usage</span>' : ''}` : `<span class="sa-tag ${o.action}">${esc(o.action)}</span>`) },
            { key: 'reason', label: 'Reason', render: (o) => `${esc(o.reason)}${o.removed ? `<span class="sub">Removed ${PP.fmt.stamp(o.removedAt)}${o.removedBy ? ' by ' + esc(o.removedBy) : ''}: ${esc(o.removedReason || '')}</span>` : ''}${o.restoredFrom ? `<span class="sub">Restored from ${esc(o.restoredFrom)}</span>` : ''}` },
            { key: 'by', label: 'Author', sort: (o) => o.at, render: (o) => `${esc(o.by)}<span class="sub">${PP.fmt.stamp(o.at)}</span>` },
            { key: 'exp', label: 'Expires', sort: (o) => o.expires || '9999', render: (o) => (o.expires ? `${PP.fmt.date(o.expires)}${status(o) === 'Expired' ? '<span class="sub" style="color:var(--pp-error-fg)">expired · skipped</span>' : `<span class="sub">${SA.daysLeft(o.expires)} days left</span>`}` : '<span class="muted">No expiry</span>') },
            { key: 'st', label: 'Status', render: (o) => SA.badge(status(o), status(o) === 'Active' ? 'positive' : status(o) === 'Expired' ? 'warning' : 'neutral') },
            { key: 'x', label: '', render: (o) => (o.removed ? '' : `<button class="btn btn-sm btn-ghost" data-rm="${o.id}">${PP.icon('x')} Remove</button>`) },
          ],
        });
        t.addEventListener('click', async (e) => {
          const bt = e.target.closest('[data-rm]'); if (!bt) return;
          if (!need('entitlements.manage', 'remove overrides')) return;
          const o = PP.db.overrides.find((x) => x.id === bt.dataset.rm);
          const r = await PP.ui.confirm({ title: 'Remove override?', message: `<code>${esc(o.type === 'limit' ? 'limit.' + o.code : o.code)}</code> returns to the plan default in the draft. The override stays in the history as removed.`, confirmLabel: 'Remove override', danger: true, reasonLabel: 'Reason', reasonRequired: true });
          if (!r) return;
          removeOverride(o, r.reason); PP.audit('Override removed (draft)', c.id, `${o.code} · ${r.reason}`); PP.save();
          PP.ui.toast('Override removed from the draft. Publish to apply.'); paint();
        });
      }

      function drawLimits() {
        const b = body(); const d = SA.draftOf(c); const plan = SA.plan(c.planId) || { limits: {} }; const dep = SA.deployment(c.id); const latest = SA.latestSet(c.id);
        const ovs = SA.activeOverrides(SA.overridesOf(c.id)).filter((o) => o.type === 'limit');
        b.innerHTML = `${PP.ui.alert('info', '<b>Business usage limits only.</b> Branches, users, professionals, patients and monthly appointments. There are <b>no storage, disk, RAM, CPU or bandwidth quotas</b> — capacity belongs to the customer’s own infrastructure (D-016). Reaching a limit blocks only new records; nothing is deleted.')}
          <div class="table-wrap mt-3"><table class="table"><thead><tr><th>Limit</th><th class="right">Plan default</th><th>Override</th><th class="right">Effective (draft)</th><th class="right">Published</th><th>Current usage</th><th></th></tr></thead><tbody>
          ${SA.LIMITS.map((l) => { const o = ovs.find((x) => x.code === l.code); const used = dep ? dep.usage[l.counter] || 0 : 0; const eff = d.limits[l.code];
            return `<tr class="${eff != null && used > eff ? 'sa-err-row' : ''}"><td><b>${esc(l.label)}</b><span class="sub"><code>limit.${esc(l.code)}</code></span></td><td class="right mono">${esc(SA.fmtLimit(plan.limits[l.code]))}</td>
            <td>${o ? `<b class="mono">${esc(SA.fmtLimit(o.value))}</b><span class="sub">${esc(o.reason)}${o.expires ? ` · until ${PP.fmt.date(o.expires)}` : ''}</span>` : '<span class="muted">—</span>'}</td>
            <td class="right mono"><b>${esc(SA.fmtLimit(eff))}</b></td><td class="right mono">${latest ? esc(SA.fmtLimit(latest.limits[l.code])) : '—'}</td>
            <td>${SA.usageBar(used, eff)}</td><td><button class="btn btn-sm" data-lim="${l.code}">${PP.icon('edit')} Edit</button></td></tr>`; }).join('')}
          </tbody></table></div>
          <p class="small muted mt-3">Usage comes from the deployment heartbeat as aggregated numbers only${dep && dep.lastHeartbeat ? ` (last heartbeat ${esc(SA.ago(dep.lastHeartbeat))})` : ' (no heartbeat yet)'}. No patient data is sent to the control plane.</p>`;
        PP.$$('[data-lim]', b).forEach((bt) => bt.addEventListener('click', () => limitDialog(c, bt.dataset.lim, paint)));
      }

      function drawHistory() {
        const b = body(); const sets = SA.setsOf(c.id); const latest = sets[0];
        b.innerHTML = `${PP.ui.alert('info', '<b>History is append-only.</b> Each published set has a version number and a signature. A rollback re-publishes an earlier version as a <b>new</b> version; nothing is rewritten or deleted.')}
          <div class="row mt-3"><button class="btn" data-compare disabled>${PP.icon('layers')} Compare selected</button><span class="small muted" data-pickhint>Select two versions to compare.</span></div>
          <div class="table-wrap mt-3"><table class="table"><thead><tr><th></th><th>Version</th><th>Kind</th><th>Published</th><th>Reason</th><th class="right">Features</th><th>Signature</th><th></th></tr></thead><tbody>
          ${sets.map((s) => `<tr><td><input type="checkbox" class="sae-hist-pick" data-pick="${s.version}" ${picks.includes(s.version) ? 'checked' : ''} aria-label="Select v${s.version}"></td>
            <td><b class="mono">v${s.version}</b>${s === latest ? ' ' + SA.badge('Current', 'positive') : ''}</td>
            <td>${s.kind === 'rollback' ? `${SA.badge('Rollback', 'lavender')}<span class="sub">copy of v${s.rollbackOf}</span>` : SA.badge('Publish', 'info')}</td>
            <td>${PP.fmt.stamp(s.issuedAt)}<span class="sub">${esc(s.by)}</span></td><td>${esc(s.reason || '—')}<span class="sub">Plan ${esc(SA.planName(s.planId))} · ${(s.overrides || []).filter((o) => !o.removed).length} override(s)</span></td>
            <td class="right mono">${s.features.length}</td><td><span class="sa-signed" title="${esc(s.signature)}">${PP.icon('shield')} ${esc(SA.shortSig(s.signature))}</span></td>
            <td class="nowrap">${s !== latest ? `<button class="btn btn-sm btn-ghost" data-vs="${s.version}">Diff vs current</button> <button class="btn btn-sm" data-rb="${s.version}">${PP.icon('refresh')} Roll back</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="8">${PP.ui.empty({ icon: 'layers', title: 'Nothing published yet', text: 'Publish the first entitlement set.' })}</td></tr>`}
          </tbody></table></div>`;
        const cmp = PP.$('[data-compare]', b); const hint = PP.$('[data-pickhint]', b);
        const sync = () => { cmp.disabled = picks.length !== 2; hint.textContent = picks.length === 2 ? `Comparing v${Math.min(...picks)} → v${Math.max(...picks)}` : 'Select two versions to compare.'; };
        sync();
        PP.$$('[data-pick]', b).forEach((x) => x.addEventListener('change', () => {
          const v = Number(x.dataset.pick); const i = picks.indexOf(v);
          if (x.checked && i < 0) { picks.push(v); if (picks.length > 2) { const drop = picks.shift(); const other = PP.$(`[data-pick="${drop}"]`, b); if (other) other.checked = false; } }
          if (!x.checked && i >= 0) picks.splice(i, 1);
          sync();
        }));
        const compare = (va, vb) => {
          const a = sets.find((s) => s.version === Math.min(va, vb)); const z = sets.find((s) => s.version === Math.max(va, vb));
          PP.ui.modal({ title: `Compare v${a.version} → v${z.version}`, size: 'lg', body: `<p class="small muted" style="margin-top:0">v${a.version}: ${esc(a.reason || '')} (${PP.fmt.stamp(a.issuedAt)})<br>v${z.version}: ${esc(z.reason || '')} (${PP.fmt.stamp(z.issuedAt)})</p>${diffHtml(SA.diffSets(a, z), 'These two versions have the same features and limits.')}`, buttons: [{ label: 'Close', kind: 'ghost' }] });
        };
        cmp.addEventListener('click', () => compare(picks[0], picks[1]));
        PP.$$('[data-vs]', b).forEach((x) => x.addEventListener('click', () => compare(Number(x.dataset.vs), latest.version)));
        PP.$$('[data-rb]', b).forEach((x) => x.addEventListener('click', async () => {
          if (!need('entitlements.manage', 'roll back entitlements')) return;
          const v = Number(x.dataset.rb); const old = sets.find((s) => s.version === v);
          const diff = SA.diffSets(latest, old);
          const r = await PP.ui.confirm({ title: `Roll back to v${v}?`, message: `v${v} will be re-published as <b>v${latest.version + 1}</b>. Its plan (${esc(SA.planName(old.planId))}) and overrides are restored; v${latest.version} and all earlier versions stay in the history.<br><br><b>Effect against the current v${latest.version}:</b> ${diff.added.length} feature(s) added, ${diff.removed.length} removed, ${diff.limits.length} limit change(s).${SA.pendingInfo(c).any ? '<br><br>Unpublished draft changes are replaced.' : ''}`, confirmLabel: `Publish v${latest.version + 1}`, reasonLabel: 'Reason for the rollback', reasonRequired: true });
          if (!r) return;
          await PP.sleep(350);
          const set = SA.rollback(c, v, r.reason);
          PP.audit('Entitlements rolled back', c.id, `v${set.version} published as a copy of v${v} · ${r.reason}`); PP.save();
          PP.ui.toast(`Published v${set.version} as a copy of v${v}`); picks.length = 0; paint();
        }));
      }
      paint();
    },
  });

  function planDialog(c, onDone) {
    if (!need('entitlements.manage', 'change the plan')) return;
    PP.ui.modal({
      title: `Change plan · ${esc(c.name)}`,
      body: `<form class="stack" onsubmit="return false">${PP.form.field({ name: 'planId', label: 'Plan', type: 'select', required: true, value: c.planId, placeholder: false, options: PP.db.plans.filter((p) => p.status !== 'Retired' || p.id === c.planId).map((p) => [p.id, `${p.name} · ${PP.fmt.money(p.priceYearly)}/year`]) })}<div data-prev></div>${reasonField()}</form>
        <p class="small muted">Existing overrides stay. The change is a draft until you publish. Billing changes are handled in Vendor billing.</p>`,
      onOpen: (body) => {
        const sel = PP.$('[name=planId]', body); const prev = PP.$('[data-prev]', body);
        const show = () => { const latest = SA.latestSet(c.id); const d = SA.resolve({ planId: sel.value, overrides: SA.overridesOf(c.id) }); prev.innerHTML = latest && sel.value !== c.planId ? `<div class="small"><b>Effect:</b></div>${diffHtml(SA.diffSets(latest, d))}` : ''; };
        sel.addEventListener('change', show); show();
      },
      buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save as draft', kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false;
        const v = PP.form.read(f); if (v.planId === c.planId) { PP.form.setError(f, 'planId', 'Choose a different plan.'); return false; }
        const from = c.planId; c.planId = v.planId; PP.audit('Plan changed (draft)', c.id, `${SA.planName(from)} → ${SA.planName(v.planId)} · ${v.reason}`); PP.save();
        PP.ui.toast(`Plan set to ${esc(SA.planName(v.planId))} in the draft. Publish to apply.`); if (onDone) onDone();
      } }],
    });
  }

  /* ============================================================ /plans */
  PP.route('/plans', {
    title: 'Plans & subscriptions', perm: 'customers.view',
    render({ el }) {
      const onPlan = (p) => PP.db.customers.filter((c) => c.planId === p.id).length;
      el.innerHTML = PP.ui.pageHead({ title: 'Plans & subscriptions', subtitle: 'A plan bundles features and default usage limits. Customer overrides are managed under Entitlements.', crumbs: [['Dashboard', '#/dashboard'], ['Plans & subscriptions']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New plan</button>` })
        + SA.pending('PD-008', 'Plan names, features per plan, limits, trial and prices are not decided. The plans below are fictional examples for the prototype.')
        + `<div class="sae-plans mt-4">${PP.db.plans.map((p) => `<div class="sae-plan ${p.status === 'Retired' ? 'retired' : ''}">
          <div class="row between"><h3>${esc(p.name)}</h3>${SA.badge(p.status, p.status === 'Active' ? 'positive' : p.status === 'Draft' ? 'warning' : 'neutral')}</div>
          <div class="small muted">${esc(p.description || '')} · <code>${esc(p.code)}</code></div>
          <div class="price">${PP.fmt.money(p.priceMonthly)} <small>/ month</small></div><div class="small muted">${PP.fmt.money(p.priceYearly)} / year</div>
          <dl><dt>Features</dt><dd>${p.features.length} + ${SA.CORE_FEATURES.length} core</dd>${SA.LIMITS.map((l) => `<dt>${esc(l.label)}</dt><dd>${esc(SA.fmtLimit(p.limits[l.code]))}</dd>`).join('')}<dt>Customers</dt><dd>${onPlan(p)}</dd></dl>
          <div class="foot"><a class="btn btn-sm" href="#/plans/${p.id}">${PP.icon('edit')} Edit</a><button class="btn btn-sm btn-ghost" data-dup="${p.id}">Duplicate</button></div></div>`).join('')}</div>`
        + PP.ui.card({ title: 'Subscriptions', cls: 'mt-5', flush: true, body: '<div data-subs></div>' });
      PP.$('[data-new]', el).addEventListener('click', () => { if (need('plans.manage', 'create plans')) location.hash = '#/plans/new'; });
      PP.$$('[data-dup]', el).forEach((b) => b.addEventListener('click', () => {
        if (!need('plans.manage', 'duplicate plans')) return;
        const src = SA.plan(b.dataset.dup); let n = 2; while (PP.db.plans.some((p) => p.code === `${src.code}_${n}`)) n++;
        const p = Object.assign(PP.clone(src), { id: `PLN-${(src.code + '_' + n).toUpperCase()}`, code: `${src.code}_${n}`, name: `${src.name} (copy)`, status: 'Draft', updatedAt: PP.today() });
        PP.db.plans.push(p); PP.audit('Plan duplicated', p.id, `From ${src.name}`); PP.save(); PP.ui.toast(`Created draft plan “${esc(p.name)}”`); location.hash = `#/plans/${p.id}`;
      }));
      PP.ui.table(PP.$('[data-subs]', el), {
        getRows: () => PP.db.customers,
        search: { placeholder: 'Search customer', text: (c) => `${c.name} ${c.id} ${c.city}` },
        filters: [
          { id: 'plan', label: 'All plans', options: PP.db.plans.map((p) => [p.id, p.name]), match: (c, v) => c.planId === v },
          { id: 'cycle', label: 'Any cycle', options: [['Yearly', 'Yearly'], ['Monthly', 'Monthly']], match: (c, v) => c.billingCycle === v },
          { id: 'state', label: 'Any state', options: ['Onboarding', 'Active', 'Grace', 'Read-only', 'Suspended'].map((s) => [s, s]), match: (c, v) => SA.state(c) === v },
        ],
        exportName: 'subscriptions',
        columns: [
          { key: 'name', label: 'Customer', sort: (c) => c.name, render: (c) => `<a href="#/customers/${c.id}"><b>${esc(c.name)}</b></a><span class="sub">${esc(c.id)} · ${esc(c.city)}</span>` },
          { key: 'plan', label: 'Plan', sort: (c) => SA.planName(c.planId), render: (c) => esc(SA.planName(c.planId)) },
          { key: 'cycle', label: 'Billing cycle', render: (c) => esc(c.billingCycle) },
          { key: 'price', label: 'Price', align: 'right', sort: (c) => { const p = SA.plan(c.planId); return p ? (c.billingCycle === 'Yearly' ? p.priceYearly : p.priceMonthly) : 0; }, render: (c) => { const p = SA.plan(c.planId); return p ? `${PP.fmt.money(c.billingCycle === 'Yearly' ? p.priceYearly : p.priceMonthly)}<span class="sub">${c.billingCycle === 'Yearly' ? 'per year' : 'per month'}</span>` : '—'; } },
          { key: 'period', label: 'Licence period', sort: (c) => (SA.licenceOf(c.id) || {}).end || '', render: (c) => { const l = SA.licenceOf(c.id); if (!l) return '—'; const left = SA.daysLeft(l.end); return `${PP.fmt.date(l.start)} – ${PP.fmt.date(l.end)}<span class="sub">${left >= 0 ? `${left} days left` : `ended ${-left} days ago`}</span>`; } },
          { key: 'state', label: 'State', render: (c) => SA.badge(SA.state(c)) },
        ],
        onRowClick: (c) => { location.hash = `#/customers/${c.id}`; },
      });
    },
  });

  /* ============================================================ /plans/:id */
  PP.route('/plans/:id', {
    title: (p) => (p.id === 'new' ? 'New plan' : 'Edit plan'), perm: 'customers.view',
    render({ el, params }) {
      const isNew = params.id === 'new';
      const src = isNew ? { id: '', code: '', name: '', description: '', priceMonthly: '', priceYearly: '', features: [], limits: { branches: 1, users: 5, professionals: 3, patients: 2000, appointments_monthly: 1000 }, status: 'Draft' } : SA.plan(params.id);
      if (!src) { el.innerHTML = PP.ui.notFound(`/plans/${params.id}`); return; }
      const sel = new Set(src.features); const canEdit = PP.can('plans.manage');
      const customers = isNew ? [] : PP.db.customers.filter((c) => c.planId === src.id);
      el.innerHTML = PP.ui.pageHead({ title: isNew ? 'New plan' : `Edit plan · ${esc(src.name)}`, crumbs: [['Plans & subscriptions', '#/plans'], [isNew ? 'New plan' : src.name]], subtitle: isNew ? 'Define the features and default limits.' : `${customers.length} customer(s) on this plan. Changing a plan affects customers only when their entitlements are re-published.` })
        + (canEdit ? '' : PP.ui.alert('warning', 'Your role can view plans but not change them (<code>plans.manage</code>).'))
        + `<form data-form novalidate><div class="sa-split mt-3"><div>
          ${PP.ui.card({ title: 'Plan details', body: `<div class="form-grid">
            ${PP.form.field({ name: 'name', label: 'Plan name', required: true, value: src.name })}
            ${PP.form.field({ name: 'code', label: 'Code', required: true, value: src.code, hint: 'Lower case letters, digits and _ . Stable identifier.', readonly: !isNew })}
            ${PP.form.field({ name: 'description', label: 'Description', value: src.description, full: true })}
            ${PP.form.field({ name: 'priceMonthly', label: 'Price per month (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, value: src.priceMonthly })}
            ${PP.form.field({ name: 'priceYearly', label: 'Price per year (BDT)', type: 'number', required: true, rule: 'nonneg', min: 0, value: src.priceYearly })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: src.status, options: ['Draft', 'Active', 'Retired'] })}
          </div>` })}
          ${PP.ui.card({ title: 'Features', cls: 'mt-4', actions: '<span class="small muted" data-fcount></span>', body: `<div class="sae-toolbar"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-fq placeholder="Filter features" aria-label="Filter features"></div></div><div data-feats></div>` })}
        </div><div>
          ${PP.ui.card({ title: 'Default usage limits', body: `<div class="stack">${SA.LIMITS.map((l) => PP.form.field({ name: `lim_${l.code}`, label: l.label, type: 'number', min: 0, step: 1, rule: 'nonneg', value: src.limits[l.code] == null ? '' : src.limits[l.code], hint: 'Empty = unlimited' })).join('')}</div><p class="small muted">Business limits only — never storage, disk, RAM, CPU or bandwidth (D-016).</p>` })}
          ${PP.ui.card({ title: 'Dependency check', cls: 'mt-4', body: '<div data-deps></div>' })}
          <div class="form-actions" style="border:0;margin-top:12px"><a class="btn btn-ghost" href="#/plans">Cancel</a><button class="btn btn-primary" type="submit" data-save ${canEdit ? '' : 'disabled'}>${PP.icon('check')} Save plan</button></div>
        </div></div></form>`;
      const form = PP.$('[data-form]', el); const featsEl = PP.$('[data-feats]', el); let fq = '';
      const drawFeats = () => {
        featsEl.innerHTML = SA.MODULES.map((m) => {
          const fs = SA.FEATURES.filter((f) => f.module === m.code && (!fq || (f.code + ' ' + f.name).toLowerCase().includes(fq)));
          if (!fs.length) return '';
          const opt = fs.filter((f) => !f.core); const all = opt.length && opt.every((f) => sel.has(f.code));
          return `<div class="sae-section"><div class="sae-mod-head"><b>${esc(m.name)}</b>${opt.length ? `<label class="check small"><input type="checkbox" data-all="${m.code}" ${all ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> Select all</label>` : '<span class="sa-tag core">core · always on</span>'}</div>
            <div class="sae-checks mt-2">${fs.map((f) => `<label class="check"><input type="checkbox" data-f="${esc(f.code)}" ${f.core || sel.has(f.code) ? 'checked' : ''} ${f.core || !canEdit ? 'disabled' : ''}> <span>${esc(f.name)} <code>${esc(f.code)}</code></span></label>`).join('')}</div></div>`;
        }).join('') || PP.ui.empty({ icon: 'filter', title: 'No features match' });
        drawDeps();
      };
      const drawDeps = () => {
        const set = new Set([...sel, ...SA.CORE_FEATURES]);
        const bad = Array.from(sel).map((f) => ({ f, miss: SA.missing(f, set) })).filter((x) => x.miss.length);
        PP.$('[data-fcount]', el).textContent = `${sel.size} selected + ${SA.CORE_FEATURES.length} core`;
        PP.$('[data-deps]', el).innerHTML = bad.length ? PP.ui.alert('warning', `<b>${bad.length} feature(s) miss a prerequisite</b> and would be auto-disabled for customers:<ul class="sae-warnlist">${bad.slice(0, 12).map((x) => `<li><code>${esc(x.f)}</code> needs ${x.miss.map(SA.reqLabel).join(', ')}</li>`).join('')}${bad.length > 12 ? `<li>… and ${bad.length - 12} more</li>` : ''}</ul><button type="button" class="btn btn-sm mt-2" data-fix>Add the missing prerequisites</button>`) : PP.ui.alert('positive', 'All dependencies are satisfied.');
        const fix = PP.$('[data-fix]', el); if (fix) fix.addEventListener('click', () => { Array.from(sel).forEach((f) => SA.prerequisitesFor(f, Array.from(new Set([...sel, ...SA.CORE_FEATURES]))).forEach((p) => sel.add(p))); drawFeats(); PP.ui.toast('Prerequisites added', 'info'); });
      };
      drawFeats();
      PP.$('[data-fq]', el).addEventListener('input', (e) => { fq = e.target.value.trim().toLowerCase(); drawFeats(); });
      featsEl.addEventListener('change', (e) => {
        const a = e.target.closest('[data-all]'); const f = e.target.closest('[data-f]');
        if (a) { SA.FEATURES.filter((x) => x.module === a.dataset.all && !x.core).forEach((x) => (a.checked ? sel.add(x.code) : sel.delete(x.code))); drawFeats(); }
        else if (f) { if (f.checked) sel.add(f.dataset.f); else sel.delete(f.dataset.f); drawFeats(); }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!canEdit) return; if (!PP.form.validate(form)) return;
        const v = PP.form.read(form);
        if (!/^[a-z0-9_]+$/.test(v.code)) { PP.form.setError(form, 'code', 'Use lower case letters, digits and _ only.'); return; }
        if (isNew && PP.db.plans.some((p) => p.code === v.code)) { PP.form.setError(form, 'code', 'This code is already used by another plan.'); return; }
        if (!sel.size) { PP.ui.toast('Select at least one feature.', 'error'); return; }
        const set = new Set([...sel, ...SA.CORE_FEATURES]);
        if (Array.from(sel).some((f) => SA.missing(f, set).length)) {
          const ok = await PP.ui.confirm({ title: 'Save with dependency warnings?', message: 'Some features miss a prerequisite. They will be auto-disabled when customer sets are resolved.', confirmLabel: 'Save anyway' });
          if (!ok) return;
        }
        await PP.ui.busy(PP.$('[data-save]', form), async () => {
          const limits = {}; SA.LIMITS.forEach((l) => { const x = v[`lim_${l.code}`]; limits[l.code] = x === '' ? null : Math.floor(Number(x)); });
          const data = { name: v.name, description: v.description, priceMonthly: Number(v.priceMonthly), priceYearly: Number(v.priceYearly), status: v.status, limits, features: SA.FEATURE_CODES.filter((c) => sel.has(c)), updatedAt: PP.today() };
          let plan;
          if (isNew) { plan = Object.assign({ id: `PLN-${v.code.toUpperCase()}`, code: v.code }, data); PP.db.plans.push(plan); PP.audit('Plan created', plan.id, `${plan.name} · ${plan.features.length} features`); }
          else { plan = src; const before = plan.features.length; Object.assign(plan, data); PP.audit('Plan updated', plan.id, `${plan.name} · features ${before} → ${plan.features.length}`); }
          PP.save(); PP.ui.toast(`Plan “${esc(plan.name)}” saved`);
          const on = PP.db.customers.filter((c) => c.planId === plan.id && SA.pendingInfo(c).any);
          if (on.length) republishDialog(plan, on); else if (isNew) location.hash = `#/plans/${plan.id}`;
        });
      });
    },
  });
  function republishDialog(plan, list) {
    if (!PP.can('entitlements.manage')) { PP.ui.toast(`${list.length} customer(s) on this plan now have unpublished changes. Someone with entitlement rights must publish them.`, 'info', 4500); return; }
    PP.ui.modal({
      title: 'Re-publish customers on this plan?',
      body: `<p style="margin-top:0">${list.length} customer(s) on <b>${esc(plan.name)}</b> now differ from their published set:</p><ul class="sae-warnlist">${list.map((c) => { const d = SA.pendingInfo(c).diff; return `<li><b>${esc(c.name)}</b> · +${d.added.length} / −${d.removed.length} features, ${d.limits.length} limit change(s)</li>`; }).join('')}</ul>
        <form class="stack mt-3" onsubmit="return false">${reasonField('Reason')}</form><p class="small muted">Until they are re-published, those customers keep their current signed set.</p>`,
      buttons: [{ label: 'Later', kind: 'ghost' }, { label: `Publish ${list.length} set(s)`, kind: 'primary', onClick: async ({ body }) => {
        const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const r = PP.form.read(f).reason; await PP.sleep(400);
        list.forEach((c) => { const s = SA.publish(c, `Plan ${plan.name} changed: ${r}`); PP.audit('Entitlements published', c.id, `v${s.version} · plan ${plan.name} changed`); });
        PP.save(); PP.ui.toast(`Re-published ${list.length} customer set(s)`);
      } }],
    });
  }

  /* ============================================================ catalogues */
  const checks = (name, items, selected, disabled) => `<div class="sae-checks">${items.map(([v, l]) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''} ${disabled ? 'disabled' : ''}> <span>${l}</span></label>`).join('')}</div>`;
  const readChecks = (root, name) => PP.$$(`input[name="${name}"]:checked`, root).map((x) => x.value);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const yes = (b) => `<span class="sae-cap ${b ? 'yes' : 'no'}" title="${b ? 'Yes' : 'No'}">${PP.icon(b ? 'checkCircle' : 'x')}<span class="sr-only">${b ? 'Yes' : 'No'}</span></span>`;

  PP.route('/catalog/business-types', {
    title: 'Business types', perm: 'customers.view',
    render({ el }) {
      el.innerHTML = PP.ui.pageHead({ title: 'Business types', subtitle: 'A business type supplies default terminology, modules, professional types and form templates (D-020). Customers can still override terminology.', crumbs: [['Configuration'], ['Business types']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New business type</button>` })
        + PP.ui.card({ flush: true, body: '<div data-t></div>' });
      const t = PP.ui.table(PP.$('[data-t]', el), {
        getRows: () => PP.db.businessTypes,
        search: { placeholder: 'Search business type or terminology', text: (b) => `${b.label} ${b.professional} ${b.professionals} ${b.id}` },
        filters: [{ id: 'st', label: 'Any status', options: [['Active', 'Active'], ['Draft', 'Draft'], ['Retired', 'Retired']], match: (b, v) => b.status === v }],
        exportName: 'business-types',
        columns: [
          { key: 'label', label: 'Business type', sort: (b) => b.label, render: (b) => `<b>${esc(b.label)}</b><span class="sub"><code>${esc(b.id)}</code></span>` },
          { key: 'term', label: 'Terminology', render: (b) => `${esc(b.professional)} / ${esc(b.professionals)}<span class="sub">Organisation: ${esc(b.org)}</span>` },
          { key: 'mods', label: 'Default modules', render: (b) => `<div class="sa-pill-list">${b.modules.map((m) => `<span class="sa-pill">${esc(m)}</span>`).join('')}</div>` },
          { key: 'pts', label: 'Professional types', render: (b) => esc(b.professionalTypes.map((id) => (PP.db.professionalTypes.find((p) => p.id === id) || { name: id }).name).join(', ')) },
          { key: 'forms', label: 'Forms', align: 'right', render: (b) => String(b.forms.length) },
          { key: 'cust', label: 'Customers', align: 'right', sort: (b) => PP.db.customers.filter((c) => c.businessType === b.id).length, render: (b) => String(PP.db.customers.filter((c) => c.businessType === b.id).length) },
          { key: 'st', label: 'Status', render: (b) => SA.badge(b.status, b.status === 'Draft' ? 'warning' : undefined) },
          { key: 'x', label: '', render: (b) => `<button class="btn btn-sm" data-edit="${esc(b.id)}">${PP.icon('edit')} Edit</button>` },
        ],
      });
      const edit = (b) => {
        if (!need('catalog.manage', 'edit configuration catalogues')) return;
        const isNew = !b; const x = b || { id: '', label: '', professional: '', professionals: '', org: 'Clinic', modules: [], professionalTypes: [], forms: [], status: 'Draft' };
        PP.ui.modal({
          title: isNew ? 'New business type' : `Edit ${esc(x.label)}`, size: 'lg',
          body: `<form class="form-grid" onsubmit="return false">
            ${PP.form.field({ name: 'label', label: 'Name', required: true, value: x.label, placeholder: 'e.g. Eye clinic' })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: x.status, options: ['Active', 'Draft', 'Retired'] })}
            ${PP.form.field({ name: 'professional', label: 'Professional (singular)', required: true, value: x.professional, placeholder: 'e.g. Optometrist' })}
            ${PP.form.field({ name: 'professionals', label: 'Professionals (plural)', required: true, value: x.professionals, placeholder: 'e.g. Optometrists' })}
            ${PP.form.field({ name: 'org', label: 'Organisation word', required: true, value: x.org, placeholder: 'Clinic, Centre, Chamber' })}
            <div class="field full"><label>Default modules</label>${checks('modules', SA.MODULES.filter((m) => !m.core).map((m) => [m.code, esc(m.name)]), x.modules)}</div>
            <div class="field full"><label>Default professional types</label>${checks('pts', PP.db.professionalTypes.map((p) => [p.id, esc(p.name)]), x.professionalTypes)}</div>
            <div class="field full"><label>Default clinical form templates</label>${checks('forms', PP.db.formTemplates.map((f) => [f.id, `${esc(f.name)} <span class="muted small">v${f.version}</span>`]), x.forms)}</div>
          </form><p class="small muted">Defaults apply to new customers in the onboarding wizard. Existing customers keep their configuration.</p>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: async ({ body }) => {
            const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
            const id = isNew ? slug(v.label) : x.id;
            if (isNew && (!id || PP.db.businessTypes.some((y) => y.id === id))) { PP.form.setError(f, 'label', 'A business type with this name already exists.'); return false; }
            const mods = readChecks(body, 'modules'); if (!mods.length) { PP.ui.toast('Choose at least one default module.', 'error'); return false; }
            await PP.sleep(300);
            const data = { label: v.label, professional: v.professional, professionals: v.professionals, org: v.org, status: v.status, modules: mods, professionalTypes: readChecks(body, 'pts'), forms: readChecks(body, 'forms') };
            if (isNew) PP.db.businessTypes.push(Object.assign({ id }, data)); else Object.assign(x, data);
            PP.audit(isNew ? 'Business type created' : 'Business type updated', id, `${v.label} · ${v.professional}/${v.professionals}`); PP.save();
            PP.ui.toast(`Business type “${esc(v.label)}” saved`); t.refresh();
          } }],
        });
      };
      PP.$('[data-new]', el).addEventListener('click', () => edit(null));
      PP.$('[data-t]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) edit(SA.bt(b.dataset.edit)); });
    },
  });

  const CAPS = [['canBeBooked', 'Can be booked'], ['canRecordClinical', 'Records clinical notes'], ['canPrescribeExercise', 'Prescribes exercise'], ['canPrescribeMedication', 'Prescribes medication'], ['canIssueCertificate', 'Issues certificates']];
  PP.route('/catalog/professional-types', {
    title: 'Professional types', perm: 'customers.view',
    render({ el }) {
      el.innerHTML = PP.ui.pageHead({ title: 'Professional types', subtitle: 'Capabilities per professional type. Customers can add their own types later.', crumbs: [['Configuration'], ['Professional types']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New professional type</button>` })
        + PP.ui.alert('info', '<b>D-020:</b> a professional type is <b>never</b> a user role. Prescribing rights are a capability of the type, not an assumption — not every professional may prescribe. <code>prescriptions.medication_catalog</code> needs a type with “prescribes medication”.')
        + PP.ui.card({ cls: 'mt-4', flush: true, body: '<div data-t></div>' });
      const t = PP.ui.table(PP.$('[data-t]', el), {
        getRows: () => PP.db.professionalTypes,
        search: { placeholder: 'Search professional type', text: (p) => `${p.name} ${p.id}` },
        filters: [{ id: 'bt', label: 'All business types', options: PP.db.businessTypes.map((b) => [b.id, b.label]), match: (p, v) => p.businessTypes.includes(v) }, { id: 'cap', label: 'Any capability', options: CAPS, match: (p, v) => !!p[v] }],
        exportName: 'professional-types',
        columns: [
          { key: 'name', label: 'Professional type', sort: (p) => p.name, render: (p) => `<b>${esc(p.name)}</b><span class="sub"><code>${esc(p.id)}</code></span>` },
          { key: 'bt', label: 'Business types', render: (p) => esc(p.businessTypes.map(SA.btLabel).join(', ')) },
          ...CAPS.map(([k, l]) => ({ key: k, label: l, render: (p) => yes(p[k]), exportValue: (p) => (p[k] ? 'Yes' : 'No') })),
          { key: 'st', label: 'Status', render: (p) => SA.badge(p.status || 'Active') },
          { key: 'x', label: '', render: (p) => `<button class="btn btn-sm" data-edit="${esc(p.id)}">${PP.icon('edit')} Edit</button>` },
        ],
      });
      const edit = (p) => {
        if (!need('catalog.manage', 'edit configuration catalogues')) return;
        const isNew = !p; const x = p || { id: '', name: '', businessTypes: [], canBeBooked: true, canRecordClinical: true, canPrescribeExercise: false, canPrescribeMedication: false, canIssueCertificate: false, status: 'Active' };
        PP.ui.modal({
          title: isNew ? 'New professional type' : `Edit ${esc(x.name)}`,
          body: `<form class="stack" onsubmit="return false">
            ${PP.form.field({ name: 'name', label: 'Name', required: true, value: x.name, placeholder: 'e.g. Optometrist' })}
            ${PP.form.field({ name: 'status', label: 'Status', type: 'select', placeholder: false, value: x.status || 'Active', options: ['Active', 'Inactive'] })}
            <div class="field"><label>Capabilities</label><div class="stack" style="gap:6px">${CAPS.map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${x[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
            <div class="field"><label>Business types</label>${checks('bts', PP.db.businessTypes.map((b) => [b.id, esc(b.label)]), x.businessTypes)}</div>
          </form>`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: async ({ body }) => {
            const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
            const bts = readChecks(body, 'bts'); if (!bts.length) { PP.ui.toast('Choose at least one business type.', 'error'); return false; }
            const id = isNew ? `PT-${slug(v.name).toUpperCase().replace(/_/g, '-').slice(0, 16)}` : x.id;
            if (isNew && PP.db.professionalTypes.some((y) => y.id === id || y.name.toLowerCase() === v.name.toLowerCase())) { PP.form.setError(f, 'name', 'This professional type already exists.'); return false; }
            await PP.sleep(300);
            const data = { name: v.name, status: v.status, businessTypes: bts }; CAPS.forEach(([k]) => { data[k] = !!v[k]; });
            if (isNew) PP.db.professionalTypes.push(Object.assign({ id }, data)); else Object.assign(x, data);
            PP.audit(isNew ? 'Professional type created' : 'Professional type updated', id, `${v.name} · ${CAPS.filter(([k]) => data[k]).map(([, l]) => l).join(', ') || 'no capabilities'}`); PP.save();
            PP.ui.toast(`Professional type “${esc(v.name)}” saved`); t.refresh();
          } }],
        });
      };
      PP.$('[data-new]', el).addEventListener('click', () => edit(null));
      PP.$('[data-t]', el).addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) edit(PP.db.professionalTypes.find((p) => p.id === b.dataset.edit)); });
    },
  });

  const KINDS = ['Assessment', 'Encounter', 'Prescription', 'Consent', 'Order', 'Report', 'Care plan', 'Intake'];
  PP.route('/catalog/forms', {
    title: 'Clinical form templates', perm: 'customers.view',
    render({ el }) {
      el.innerHTML = PP.ui.pageHead({ title: 'Clinical form templates', subtitle: 'Vendor-maintained form templates offered to customers by business type. Templates hold field definitions only — never patient answers.', crumbs: [['Configuration'], ['Clinical form templates']], actions: `<button class="btn btn-primary" data-new>${PP.icon('plus')} New template</button>` })
        + PP.ui.card({ flush: true, body: '<div data-t></div>' });
      const t = PP.ui.table(PP.$('[data-t]', el), {
        getRows: () => PP.db.formTemplates,
        search: { placeholder: 'Search template', text: (f) => `${f.name} ${f.id} ${f.kind}` },
        filters: [
          { id: 'bt', label: 'All business types', options: PP.db.businessTypes.map((b) => [b.id, b.label]), match: (f, v) => f.businessTypes.includes(v) },
          { id: 'kind', label: 'Any kind', options: KINDS.map((k) => [k, k]), match: (f, v) => f.kind === v },
          { id: 'st', label: 'Any status', options: [['Approved', 'Approved'], ['Draft', 'Draft']], match: (f, v) => f.status === v },
        ],
        exportName: 'form-templates', sortKey: 'name',
        columns: [
          { key: 'name', label: 'Template', sort: (f) => f.name, render: (f) => `<b>${esc(f.name)}</b><span class="sub"><code>${esc(f.id)}</code></span>` },
          { key: 'kind', label: 'Kind', sort: (f) => f.kind, render: (f) => esc(f.kind) },
          { key: 'bt', label: 'Business types', render: (f) => esc(f.businessTypes.map(SA.btLabel).join(', ')) },
          { key: 'fields', label: 'Fields', align: 'right', sort: (f) => f.fields, render: (f) => String(f.fields) },
          { key: 'ver', label: 'Version', sort: (f) => f.version, render: (f) => `<b class="mono">v${f.version}</b>` },
          { key: 'st', label: 'Status', render: (f) => SA.badge(f.status) },
          { key: 'upd', label: 'Updated', sort: (f) => f.updatedAt, render: (f) => `${PP.fmt.date(f.updatedAt)}${f.approvedBy ? `<span class="sub">Approved by ${esc(f.approvedBy)}</span>` : ''}` },
          { key: 'x', label: '', render: (f) => `<span class="row-actions"><button class="btn btn-sm btn-ghost" data-edit="${f.id}" title="Edit">${PP.icon('edit')}</button>${f.status === 'Draft' ? `<button class="btn btn-sm" data-approve="${f.id}">Approve</button>` : `<button class="btn btn-sm" data-ver="${f.id}">New version</button>`}</span>` },
        ],
      });
      const edit = (x0) => {
        if (!need('catalog.manage', 'edit form templates')) return;
        const isNew = !x0; const x = x0 || { name: '', kind: 'Assessment', businessTypes: [], fields: 10 };
        PP.ui.modal({
          title: isNew ? 'New form template' : `Edit ${esc(x.name)}`,
          body: `<form class="form-grid" onsubmit="return false">
            ${PP.form.field({ name: 'name', label: 'Name', required: true, value: x.name, full: true })}
            ${PP.form.field({ name: 'kind', label: 'Kind', type: 'select', required: true, value: x.kind, options: KINDS })}
            ${PP.form.field({ name: 'fields', label: 'Number of fields', type: 'number', required: true, rule: 'positive', min: 1, value: x.fields })}
            <div class="field full"><label>Business types</label>${checks('bts', PP.db.businessTypes.map((b) => [b.id, esc(b.label)]), x.businessTypes)}</div>
          </form>${isNew ? '' : '<p class="small muted">Editing an approved template sets it back to Draft. Customers keep the approved version until the new one is approved.</p>'}`,
          buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: isNew ? 'Create draft' : 'Save', kind: 'primary', onClick: async ({ body }) => {
            const f = PP.$('form', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f); const bts = readChecks(body, 'bts');
            if (!bts.length) { PP.ui.toast('Choose at least one business type.', 'error'); return false; }
            await PP.sleep(300);
            if (isNew) { const n = PP.db.formTemplates.length + 1; let id = `FT-${String(n).padStart(2, '0')}`; let k = n; while (PP.db.formTemplates.some((y) => y.id === id)) id = `FT-${String(++k).padStart(2, '0')}`; PP.db.formTemplates.push({ id, name: v.name, kind: v.kind, fields: Number(v.fields), businessTypes: bts, version: 1, status: 'Draft', updatedAt: PP.today() }); PP.audit('Form template created', id, v.name); }
            else { Object.assign(x, { name: v.name, kind: v.kind, fields: Number(v.fields), businessTypes: bts, status: 'Draft', updatedAt: PP.today(), approvedBy: null }); PP.audit('Form template edited', x.id, `${v.name} · back to Draft`); }
            PP.save(); PP.ui.toast(`Template “${esc(v.name)}” saved as Draft`); t.refresh();
          } }],
        });
      };
      PP.$('[data-new]', el).addEventListener('click', () => edit(null));
      PP.$('[data-t]', el).addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-edit]'); const ap = e.target.closest('[data-approve]'); const nv = e.target.closest('[data-ver]');
        if (ed) return edit(PP.db.formTemplates.find((f) => f.id === ed.dataset.edit));
        if (!ap && !nv) return; if (!need('catalog.manage', 'change form templates')) return;
        const f = PP.db.formTemplates.find((x) => x.id === (ap || nv).dataset[ap ? 'approve' : 'ver']);
        if (ap) {
          const ok = await PP.ui.confirm({ title: `Approve ${esc(f.name)} v${f.version}?`, message: 'Approved templates are offered to customers of the selected business types in the next configuration snapshot.', confirmLabel: 'Approve' });
          if (!ok) return; f.status = 'Approved'; f.approvedBy = me(); f.updatedAt = PP.today(); PP.audit('Form template approved', f.id, `${f.name} v${f.version}`); PP.save(); PP.ui.toast(`${esc(f.name)} v${f.version} approved`);
        } else {
          f.version += 1; f.status = 'Draft'; f.approvedBy = null; f.updatedAt = PP.today(); PP.audit('Form template new version', f.id, `${f.name} v${f.version} (Draft)`); PP.save(); PP.ui.toast(`${esc(f.name)} v${f.version} created as Draft; the previous version stays in use until approval`, 'info');
        }
        t.refresh();
      });
    },
  });

  /* ============================================== customer detail: Entitlements tab */
  SA.panels.entitlements = function (el, c) {
    const set = SA.latestSet(c.id); const dep = SA.deployment(c.id); const p = SA.pendingInfo(c);
    const ovs = SA.activeOverrides(SA.overridesOf(c.id)); const plan = SA.plan(c.planId);
    el.innerHTML = `<div class="row between"><div class="row" style="gap:10px"><span>Plan <b>${esc(plan ? plan.name : '—')}</b></span><span>· Published <b class="mono">v${set ? set.version : 0}</b></span>${set ? `<span class="sa-signed" title="${esc(set.signature)}">${PP.icon('shield')} ${esc(SA.shortSig(set.signature))}</span>` : ''}${p.any ? SA.badge('Unpublished changes', 'warning') : ''}</div>
      <a class="btn btn-primary btn-sm" href="#/entitlements/${c.id}">${PP.icon('layers')} Manage entitlements</a></div>
      <div class="grid grid-3 mt-4">
        ${PP.ui.kpi({ label: 'Features enabled', value: set ? set.features.length : 0, hint: `of ${SA.FEATURES.length} in the catalogue`, icon: 'checkCircle', tone: 'positive' })}
        ${PP.ui.kpi({ label: 'Active overrides', value: ovs.length, hint: `${ovs.filter((o) => o.type === 'feature').length} feature · ${ovs.filter((o) => o.type === 'limit').length} limit`, icon: 'edit', tone: ovs.length ? 'warning' : 'info' })}
        ${PP.ui.kpi({ label: 'Last published', value: set ? PP.fmt.dateShort(set.issuedAt) : '—', hint: set ? esc(set.by) : 'Never', icon: 'clock', tone: 'lavender' })}
      </div>
      <h3 class="mt-5" style="font-size:15px">Usage limits</h3>
      <div class="table-wrap mt-2"><table class="table"><thead><tr><th>Limit</th><th class="right">Effective</th><th>Usage</th></tr></thead><tbody>
        ${SA.LIMITS.map((l) => { const used = dep ? dep.usage[l.counter] || 0 : 0; const lim = set ? set.limits[l.code] : null; return `<tr><td>${esc(l.label)}</td><td class="right mono">${esc(SA.fmtLimit(lim))}</td><td>${SA.usageBar(used, lim)}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${ovs.length ? `<h3 class="mt-5" style="font-size:15px">Overrides</h3><ul class="list sa-list-compact">${ovs.map((o) => `<li><span class="sa-tag ${o.type === 'limit' ? 'plan' : o.action}">${esc(o.type === 'limit' ? 'limit' : o.action)}</span><span class="grow"><code>${esc(o.type === 'limit' ? 'limit.' + o.code : o.code)}</code>${o.type === 'limit' ? ` = ${esc(SA.fmtLimit(o.value))}` : ''}<span class="sub small muted" style="display:block">${esc(o.reason)}${o.expires ? ` · until ${PP.fmt.date(o.expires)}` : ''}</span></span></li>`).join('')}</ul>` : ''}
      <p class="small muted mt-3">Limits are business limits only (D-016). Usage is an aggregated heartbeat counter; no patient data reaches the control plane.</p>`;
  };
})();
