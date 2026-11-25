/* Physio Point Super Admin — 14-step onboarding wizard (MP §7, control-plane.md §2) and demo & trial (D-024, D-027).
   Prototype only: no real tenant, licence or domain is created. Fictional data in the browser. */
(function () {
  'use strict';
  const PP = window.PP; const SA = window.SA; const esc = PP.esc;
  const ONB = (SA.onb = SA.onb || {});
  const DRAFT_KEY = 'sa-onboarding-draft';

  /* ------------------------------------------------------------------ helpers */
  const addMonths = (iso, m) => { const d = PP.parseISO(iso); d.setMonth(d.getMonth() + m); return PP.isoOf(d); };
  const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  const planDefaults = (planId) => { const p = SA.plan(planId); const set = new Set(SA.CORE_FEATURES); if (p) p.features.forEach((f) => { if (SA.FEATURE_CODES.includes(f)) set.add(f); }); return SA.FEATURE_CODES.filter((c) => set.has(c)); };
  const planLimits = (planId) => { const p = SA.plan(planId); const out = {}; SA.LIMITS.forEach((l) => { out[l.code] = p && p.limits[l.code] != null ? p.limits[l.code] : null; }); return out; };
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const sameLimits = (a, b) => SA.LIMITS.every((l) => String(a[l.code] == null ? '' : a[l.code]) === String(b[l.code] == null ? '' : b[l.code]));
  const activePlans = () => PP.db.plans.filter((p) => p.status === 'Active');
  const nextNumId = (prefix, coll, width) => {
    const max = Math.max(0, ...(PP.db[coll] || []).map((x) => Number(String(x.id).split('-').pop()) || 0));
    PP.db.counters[prefix] = Math.max(PP.db.counters[prefix] || 0, max);
    return PP.nextId(prefix, width);
  };
  ONB.licenceEnd = (d) => (d.licence.months === 'custom' ? d.licence.end : PP.addDays(addMonths(d.licence.start, Number(d.licence.months)), -1));

  ONB.newDraft = function () {
    const planId = (activePlans().find((p) => p.id === 'PLN-PRO') || activePlans()[0] || {}).id;
    return {
      leadId: null, step: 0, visited: [0], checkedAll: false,
      org: { name: '', legalName: '', city: '', address: '', contactName: '', contactEmail: '', contactMobile: '' },
      businessType: '', domain: { host: '', txt: '' },
      hosting: { model: 'Vendor-managed', provider: 'DigitalOcean', region: 'Singapore', server: '2 vCPU · 4 GB', os: 'Ubuntu 24.04 LTS' },
      branches: [{ name: '', address: '' }], professionalTypes: [], ptTouched: false,
      terminology: { professional: '', professionals: '' }, termTouched: false,
      planId, billingCycle: 'Yearly', features: planDefaults(planId), limits: planLimits(planId),
      licence: { start: PP.today(), months: '12', end: PP.addDays(PP.today(), 364) },
      branding: { brandName: '', tagline: '', primary: '#083E44', action: '#008B83', logo: '' },
      admin: { name: '', email: '', mobile: '' },
      init: { language: 'English + Bangla', currency: 'BDT', timezone: 'Asia/Dhaka', slotMinutes: '30', sampleServices: true, backup: 'Daily at 02:00', offsite: true },
    };
  };
  ONB.applyBusinessType = function (d, btId) {
    const bt = SA.bt(btId); if (!bt) return;
    const changed = d.businessType !== btId; d.businessType = btId;
    if (changed || !d.termTouched) d.terminology = { professional: bt.professional, professionals: bt.professionals };
    if (changed || !d.ptTouched) d.professionalTypes = bt.professionalTypes.slice();
    if (!d.branding.tagline || changed) d.branding.tagline = bt.label;
  };
  ONB.fromLead = function (lead) {
    const d = ONB.newDraft(); d.leadId = lead.id;
    d.org.name = lead.organisation; d.org.contactName = lead.name; d.org.contactMobile = lead.mobile; d.org.contactEmail = lead.email || '';
    d.admin.name = lead.name; d.admin.mobile = lead.mobile; d.admin.email = lead.email || '';
    if (lead.planInterest && SA.plan(lead.planInterest) && SA.plan(lead.planInterest).status === 'Active') { d.planId = lead.planInterest; d.features = planDefaults(d.planId); d.limits = planLimits(d.planId); }
    ONB.applyBusinessType(d, lead.businessType);
    d.branding.brandName = lead.organisation;
    return d;
  };
  const saveDraft = () => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(ONB.draft)); } catch (e) { /* draft too big or storage blocked: keep in memory only */ } };
  const loadDraft = () => { try { const raw = sessionStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
  const clearDraft = () => { ONB.draft = null; try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------ step definitions */
  const req = (v) => String(v == null ? '' : v).trim() !== '';
  const capPills = (p) => [['canBeBooked', 'Bookable'], ['canRecordClinical', 'Clinical notes'], ['canPrescribeExercise', 'Prescribes exercise'], ['canPrescribeMedication', 'Prescribes medication'], ['canIssueCertificate', 'Issues certificates']].filter(([k]) => p[k]).map(([, l]) => `<span class="sa-pill">${esc(l)}</span>`).join('') || '<span class="sa-mini">No clinical capabilities</span>';

  const STEPS = [
    { id: 'org', label: 'Organisation',
      body: (d) => `<div class="form-grid">
        ${PP.form.field({ name: 'name', label: 'Organisation name', required: true, value: d.org.name, placeholder: 'e.g. Care Plus Physiotherapy' })}
        ${PP.form.field({ name: 'legalName', label: 'Legal name (for invoices)', value: d.org.legalName, placeholder: 'Same as organisation name if blank' })}
        ${PP.form.field({ name: 'city', label: 'City', required: true, value: d.org.city, placeholder: 'e.g. Khulna' })}
        ${PP.form.field({ name: 'address', label: 'Head office address', value: d.org.address })}
        ${PP.form.field({ name: 'contactName', label: 'Main contact name', required: true, value: d.org.contactName })}
        ${PP.form.field({ name: 'contactEmail', label: 'Contact email', type: 'email', required: true, rule: 'email', value: d.org.contactEmail })}
        ${PP.form.field({ name: 'contactMobile', label: 'Contact mobile', type: 'tel', required: true, rule: 'mobile', value: d.org.contactMobile, placeholder: '01XXXXXXXXX' })}
      </div><p class="form-note small muted mt-3">The control plane stores organisation and contact data only — never patient data (control-plane.md §3).</p>`,
      read: (f, d) => { const v = PP.form.read(f); Object.assign(d.org, { name: v.name, legalName: v.legalName, city: v.city, address: v.address, contactName: v.contactName, contactEmail: v.contactEmail, contactMobile: v.contactMobile }); if (!d.branding.brandName) d.branding.brandName = v.name; },
      check: (d) => {
        const e = {}; if (!req(d.org.name)) e.name = 'Enter the organisation name.';
        else if (PP.db.customers.some((c) => c.name.toLowerCase() === d.org.name.trim().toLowerCase())) e.name = 'A customer with this name already exists.';
        if (!req(d.org.city)) e.city = 'Enter the city.'; if (!req(d.org.contactName)) e.contactName = 'Enter the main contact.';
        if (!req(d.org.contactEmail)) e.contactEmail = 'Enter an email.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.org.contactEmail)) e.contactEmail = 'Enter a valid email address.';
        if (!req(d.org.contactMobile)) e.contactMobile = 'Enter a mobile number.'; else if (!PP.isMobile(d.org.contactMobile)) e.contactMobile = 'Enter a valid Bangladesh mobile number (01XXXXXXXXX).';
        return e;
      } },
    { id: 'bt', label: 'Business type',
      body: (d) => `<p class="muted" style="margin-top:0">The business type supplies default terminology, modules, professional types and forms (D-020). Everything stays configurable.</p>
        <div class="sa-choices" data-field="businessType">${PP.db.businessTypes.filter((b) => b.status === 'Active').map((b) => `<label class="sa-choice"><input type="radio" name="businessType" value="${b.id}" ${d.businessType === b.id ? 'checked' : ''}><span><b>${esc(b.label)}</b><span class="sub">${esc(b.professionals)} · ${b.modules.length} default modules · ${b.forms.length} forms</span></span></label>`).join('')}</div>
        <div class="field" data-field="businessTypeErr"><div class="error" role="alert">Choose a business type.</div></div>`,
      read: (f, d) => { const r = PP.$('input[name=businessType]:checked', f); if (r) ONB.applyBusinessType(d, r.value); },
      check: (d) => (d.businessType && SA.bt(d.businessType) ? {} : { businessTypeErr: 'Choose a business type.' }) },
    { id: 'domain', label: 'Domain',
      body: (d) => `<div class="form-grid">${PP.form.field({ name: 'host', label: 'Customer domain (owned by the customer)', required: true, value: d.domain.host, placeholder: 'app.clinicname.com.bd', hint: 'The customer owns the domain (D-015). Use a sub-domain such as app.… for the workspace.' })}</div>
        <div class="mt-4" data-dns></div>
        <div class="mt-3">${SA.pending('PD-029', 'Whether the vendor registers domains as a reseller, and whether a temporary vendor sub-domain is allowed during onboarding, is not decided. The prototype only verifies a domain the customer already owns.')}</div>`,
      bind: (f, d) => { const inp = PP.$('[name=host]', f); const draw = () => { const h = inp.value.trim().toLowerCase(); PP.$('[data-dns]', f).innerHTML = HOST_RE.test(h) ? dnsHtml(h) : `<div class="sa-callout small muted">Enter a valid host name to see the DNS records the customer must add.</div>`; }; inp.addEventListener('input', draw); draw(); },
      read: (f, d) => { const h = PP.form.read(f).host.toLowerCase(); if (h !== d.domain.host) d.domain.txt = h ? SA.genTxt(h + PP.nowStamp()) : ''; d.domain.host = h; },
      check: (d) => { const h = d.domain.host; if (!req(h)) return { host: 'Enter the customer domain.' }; if (!HOST_RE.test(h)) return { host: 'Enter a valid host name, e.g. app.clinicname.com.bd.' }; if ((PP.db.domains || []).some((x) => x.host === h)) return { host: 'This domain is already mapped to another tenant.' }; return {}; } },
    { id: 'hosting', label: 'Hosting',
      body: (d) => `<div class="sa-choices" data-field="model">${[['Vendor-managed', 'Customer’s own account; vendor installs and updates with scoped, revocable, audited access (proposed default).'], ['Customer-managed', 'Customer’s IT installs and updates the signed packages with full root access.']].map(([v, s]) => `<label class="sa-choice"><input type="radio" name="model" value="${v}" ${d.hosting.model === v ? 'checked' : ''}><span><b>${v}</b><span class="sub">${esc(s)}</span></span></label>`).join('')}</div>
        <div class="form-grid mt-4">
          ${PP.form.field({ name: 'provider', label: 'Hosting provider', type: 'select', required: true, value: d.hosting.provider, options: ['DigitalOcean', 'AWS Lightsail', 'Hetzner', 'Bangladesh local VPS', 'Own server (on-premise)', 'Other'] })}
          ${PP.form.field({ name: 'region', label: 'Region / location', required: true, value: d.hosting.region })}
          ${PP.form.field({ name: 'server', label: 'Server profile (for support reference)', value: d.hosting.server, hint: 'Informational only.' })}
          ${PP.form.field({ name: 'os', label: 'Operating system', type: 'select', required: true, value: d.hosting.os, options: ['Ubuntu 24.04 LTS', 'Ubuntu 22.04 LTS', 'Debian 12', 'Other Linux with Docker'] })}
        </div>
        <div class="stack mt-4">${PP.ui.alert('info', '<b>No resource quotas (D-016).</b> The server size is the customer’s own capacity. The platform never limits storage, disk, RAM, CPU or bandwidth — only business usage limits (step 9).')}${SA.pending('PD-026', 'Who installs and operates the software (vendor-managed, customer-managed, or both) is not decided. The prototype records the intended model.')}</div>`,
      read: (f, d) => { const v = PP.form.read(f); Object.assign(d.hosting, { model: v.model || d.hosting.model, provider: v.provider, region: v.region, server: v.server, os: v.os }); },
      check: (d) => { const e = {}; if (!d.hosting.model) e.model = 'Choose a model.'; if (!req(d.hosting.provider)) e.provider = 'Choose a provider.'; if (!req(d.hosting.region)) e.region = 'Enter a region.'; if (!req(d.hosting.os)) e.os = 'Choose an OS.'; return e; } },
    { id: 'branches', label: 'Branches',
      body: (d) => `<p class="muted" style="margin-top:0">Every record in the customer deployment is isolated per tenant and per branch.</p>
        <div class="stack" data-branches>${d.branches.map((b, i) => `<div class="onb-branch-row" data-branch="${i}">
          <div class="field" data-field="bname${i}"><label for="bn${i}">Branch ${i + 1} name<span class="req">*</span></label><input class="input" id="bn${i}" name="bname${i}" value="${esc(b.name)}" required placeholder="e.g. Sonadanga Branch"><div class="error" role="alert">Enter a branch name.</div></div>
          <div class="field"><label for="ba${i}">Address</label><input class="input" id="ba${i}" name="baddr${i}" value="${esc(b.address)}"></div>
          <button type="button" class="btn btn-ghost btn-icon" data-rmbranch="${i}" aria-label="Remove branch ${i + 1}" ${d.branches.length < 2 ? 'disabled' : ''}>${PP.icon('trash')}</button></div>`).join('')}</div>
        <button type="button" class="btn mt-3" data-addbranch>${PP.icon('plus')} Add branch</button>
        <div class="mt-3" data-branchnote></div>`,
      bind: (f, d, redraw) => {
        PP.$('[data-addbranch]', f).addEventListener('click', () => { STEPS[4].read(f, d); d.branches.push({ name: '', address: '' }); redraw(); setTimeout(() => { const x = PP.$(`#bn${d.branches.length - 1}`); if (x) x.focus(); }, 0); });
        PP.$$('[data-rmbranch]', f).forEach((b) => b.addEventListener('click', () => { STEPS[4].read(f, d); d.branches.splice(Number(b.dataset.rmbranch), 1); redraw(); }));
        const lim = d.limits.branches; if (lim != null && d.branches.length > lim) PP.$('[data-branchnote]', f).innerHTML = PP.ui.alert('warning', `${d.branches.length} branches entered, but the branch limit is ${lim} (step 9). You can raise the limit or keep it; over-limit is flagged, nothing is blocked retroactively.`);
      },
      read: (f, d) => { d.branches = d.branches.map((b, i) => ({ name: (PP.$(`[name=bname${i}]`, f) || {}).value ? PP.$(`[name=bname${i}]`, f).value.trim() : '', address: (PP.$(`[name=baddr${i}]`, f) || {}).value ? PP.$(`[name=baddr${i}]`, f).value.trim() : '' })); },
      check: (d) => { const e = {}; if (!d.branches.length) e.bname0 = 'Add at least one branch.'; const seen = {}; d.branches.forEach((b, i) => { if (!req(b.name)) e['bname' + i] = 'Enter a branch name.'; else if (seen[b.name.toLowerCase()]) e['bname' + i] = 'Branch names must be unique.'; seen[b.name.toLowerCase()] = 1; }); return e; } },
    { id: 'pt', label: 'Professional types',
      body: (d) => { const bt = SA.bt(d.businessType); const all = PP.db.professionalTypes.filter((p) => p.status !== 'Inactive'); const mine = all.filter((p) => p.businessTypes.includes(d.businessType)); const other = all.filter((p) => !p.businessTypes.includes(d.businessType));
        const row = (p) => `<label class="sa-choice"><input type="checkbox" name="pt" value="${p.id}" ${d.professionalTypes.includes(p.id) ? 'checked' : ''}><span><b>${esc(p.name)}</b><span class="sa-pill-list mt-2">${capPills(p)}</span></span></label>`;
        return `<p class="muted" style="margin-top:0">A professional type is not a user role (D-020). Prescribing rights are a capability of the type, never an assumption.</p>
          <h3 class="small muted" style="text-transform:uppercase;letter-spacing:.04em">Suggested for ${esc(bt ? bt.label : 'this business type')}</h3>
          <div class="sa-choices mt-2" data-field="pt">${mine.map(row).join('') || '<span class="muted">No suggested types.</span>'}</div>
          <details class="mt-4"><summary class="small" style="cursor:pointer">Other professional types (${other.length})</summary><div class="sa-choices mt-3">${other.map(row).join('')}</div></details>
          <div class="field" data-field="ptErr"><div class="error" role="alert">Choose at least one professional type.</div></div>`; },
      read: (f, d) => { const sel = PP.$$('input[name=pt]:checked', f).map((x) => x.value); if (!sameSet(sel, d.professionalTypes)) d.ptTouched = true; d.professionalTypes = sel; },
      check: (d) => (d.professionalTypes.length ? {} : { ptErr: 'Choose at least one professional type.' }) },
    { id: 'term', label: 'Terminology',
      body: (d) => `<p class="muted" style="margin-top:0">“Therapist” and “Doctor” are configuration, never code (D-010). The customer admin can change these later.</p>
        <div class="form-grid">${PP.form.field({ name: 'professional', label: 'Professional (singular)', required: true, value: d.terminology.professional })}${PP.form.field({ name: 'professionals', label: 'Professionals (plural)', required: true, value: d.terminology.professionals })}</div>
        <div class="sa-callout mt-4" data-termpreview></div>
        <button type="button" class="btn btn-ghost btn-sm mt-3" data-termreset>${PP.icon('refresh')} Reset to business type default</button>`,
      bind: (f, d) => { const draw = () => { const v = PP.form.read(f); PP.$('[data-termpreview]', f).innerHTML = `<div class="small muted">Live preview</div><div class="mt-2">Menu: <b>${esc(v.professionals || '…')}</b> · Booking: “Choose a <b>${esc((v.professional || '…').toLowerCase())}</b>” · Report: “Collections by <b>${esc((v.professional || '…').toLowerCase())}</b>”</div>`; }; PP.$$('input', f).forEach((i) => i.addEventListener('input', draw)); draw();
        PP.$('[data-termreset]', f).addEventListener('click', () => { const bt = SA.bt(d.businessType); if (!bt) return; PP.$('[name=professional]', f).value = bt.professional; PP.$('[name=professionals]', f).value = bt.professionals; draw(); }); },
      read: (f, d) => { const v = PP.form.read(f); const bt = SA.bt(d.businessType); d.terminology = { professional: v.professional, professionals: v.professionals }; d.termTouched = !!bt && (v.professional !== bt.professional || v.professionals !== bt.professionals); },
      check: (d) => { const e = {}; if (!req(d.terminology.professional)) e.professional = 'Enter the singular term.'; if (!req(d.terminology.professionals)) e.professionals = 'Enter the plural term.'; return e; } },
    { id: 'features', label: 'Enabled features',
      body: (d) => `<div class="row between"><p class="muted" style="margin:0">Start from plan defaults, then switch features on or off. Changes are stored as customer overrides relative to the plan.</p>
          <div class="row"><select class="select" style="width:auto" data-fplan aria-label="Plan defaults">${activePlans().map((p) => `<option value="${p.id}" ${p.id === d.planId ? 'selected' : ''}>${esc(p.name)} defaults</option>`).join('')}</select><button type="button" class="btn btn-sm" data-applyplan>Apply plan defaults</button></div></div>
        <div class="row mt-3"><div class="grow input-icon">${PP.icon('search')}<input class="input" type="search" data-ffilter placeholder="Filter features or modules" aria-label="Filter features"></div><span class="small muted" data-fsummary></span></div>
        <div class="mt-3" data-fissues></div>
        <div class="sa-matrix mt-3" data-fmatrix></div>`,
      bind: (f, d) => {
        let filter = '';
        const draw = () => {
          const set = new Set(d.features); const pd = new Set(planDefaults(d.planId)); const gs = PP.db.globalSwitches || {};
          const grants = d.features.filter((c) => !pd.has(c)).length; const revokes = Array.from(pd).filter((c) => !set.has(c)).length;
          PP.$('[data-fsummary]', f).innerHTML = `${d.features.length} on · plan ${esc(SA.planName(d.planId))} <span class="sa-tag grant">+${grants}</span> <span class="sa-tag revoke">−${revokes}</span>`;
          PP.$('[data-fmatrix]', f).innerHTML = SA.MODULES.map((m) => {
            const feats = m.features.map((x) => SA.feature(`${m.code}.${x}`)).filter((x) => !filter || x.code.includes(filter) || x.name.toLowerCase().includes(filter) || m.name.toLowerCase().includes(filter));
            if (!feats.length) return '';
            const onCount = feats.filter((x) => set.has(x.code)).length;
            return `<div class="sa-module"><div class="sa-module-head"><b>${esc(m.name)}</b><span class="row" style="gap:6px"><span class="small muted">${onCount}/${feats.length}</span>${m.core && !m.optional ? '<span class="sa-tag core">Core</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-modall="${m.code}">${onCount === feats.length ? 'All off' : 'All on'}</button>`}</span></div>
              ${feats.map((x) => { const on = set.has(x.code); const g = gs[x.code]; const tags = [x.core ? '<span class="sa-tag core">Core</span>' : '', pd.has(x.code) && !x.core ? '<span class="sa-tag plan">Plan</span>' : '', on && !pd.has(x.code) ? '<span class="sa-tag grant">Grant</span>' : '', !on && pd.has(x.code) && !x.core ? '<span class="sa-tag revoke">Revoke</span>' : '', g && g.state === 'off' ? '<span class="sa-tag global" title="Removed at publish while the global switch is off">Global off</span>' : '', g && g.state === 'beta' ? '<span class="sa-tag beta">Beta</span>' : ''].join('');
                return `<div class="sa-feat ${on !== pd.has(x.code) && !x.core ? 'is-override' : ''} ${g && g.state === 'off' ? 'is-off-global' : ''}"><label class="sa-switch"><input type="checkbox" data-feat="${x.code}" ${on ? 'checked' : ''} ${x.core ? 'disabled' : ''} aria-label="${esc(x.name)}"><span></span></label><div class="nm">${esc(x.name)}<code>${esc(x.code)}</code></div>${tags}</div>`; }).join('')}</div>`;
          }).join('') || PP.ui.empty({ icon: 'filter', title: 'No feature matches the filter' });
          drawIssues();
          PP.$$('[data-feat]', f).forEach((cb) => cb.addEventListener('change', () => toggle(cb.dataset.feat, cb.checked)));
          PP.$$('[data-modall]', f).forEach((b) => b.addEventListener('click', () => { const m = SA.MODULES.find((x) => x.code === b.dataset.modall); const codes = m.features.map((x) => `${m.code}.${x}`).filter((c) => !SA.CORE_FEATURES.includes(c)); const allOn = codes.every((c) => d.features.includes(c)); const s = new Set(d.features); codes.forEach((c) => (allOn ? s.delete(c) : s.add(c))); d.features = SA.FEATURE_CODES.filter((c) => s.has(c)); draw(); }));
        };
        const issues = () => { const set = new Set(d.features); return d.features.filter((c) => !SA.CORE_FEATURES.includes(c)).map((c) => ({ code: c, missing: SA.missing(c, set) })).filter((x) => x.missing.length); };
        const drawIssues = () => {
          const list = issues(); const host = PP.$('[data-fissues]', f);
          host.innerHTML = list.length ? PP.ui.alert('warning', `<b>Dependency check: ${list.length} enabled feature(s) miss a prerequisite.</b> At publish they would be switched off automatically.<ul class="small" style="margin:6px 0 8px;padding-left:18px">${list.slice(0, 8).map((x) => `<li><code>${esc(x.code)}</code> needs ${x.missing.map(SA.reqLabel).join(', ')}</li>`).join('')}${list.length > 8 ? `<li>… and ${list.length - 8} more</li>` : ''}</ul><div class="row"><button type="button" class="btn btn-sm btn-primary" data-fixadd>Enable prerequisites</button><button type="button" class="btn btn-sm" data-fixrm>Switch off affected features</button></div>`) : PP.ui.alert('positive', 'All enabled features have their prerequisites.');
          const a = PP.$('[data-fixadd]', host); if (a) a.addEventListener('click', () => { const s = new Set(d.features); issues().forEach((x) => SA.prerequisitesFor(x.code, Array.from(s)).forEach((p) => s.add(p))); d.features = SA.FEATURE_CODES.filter((c) => s.has(c)); draw(); PP.ui.toast('Prerequisites enabled'); });
          const r = PP.$('[data-fixrm]', host); if (r) r.addEventListener('click', () => { const s = new Set(d.features); let again = true; while (again) { again = false; Array.from(s).forEach((c) => { if (!SA.CORE_FEATURES.includes(c) && SA.missing(c, s).length) { s.delete(c); again = true; } }); } d.features = SA.FEATURE_CODES.filter((c) => s.has(c)); draw(); PP.ui.toast('Affected features switched off', 'info'); });
        };
        const toggle = (code, on) => {
          const s = new Set(d.features);
          if (on) { s.add(code); const pre = SA.prerequisitesFor(code, d.features); if (pre.length) PP.ui.toast(`<code>${esc(code)}</code> needs ${pre.map((p) => `<code>${esc(p)}</code>`).join(', ')}. Use “Enable prerequisites”.`, 'warning', 4500); }
          else { const dep = SA.dependantsOf(code, d.features); s.delete(code); if (dep.length) PP.ui.toast(`Switching off <code>${esc(code)}</code> affects ${dep.length} dependent feature(s): ${dep.slice(0, 4).map((p) => `<code>${esc(p)}</code>`).join(', ')}${dep.length > 4 ? '…' : ''}`, 'warning', 5000); }
          d.features = SA.FEATURE_CODES.filter((c) => s.has(c)); draw();
        };
        PP.$('[data-ffilter]', f).addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); draw(); });
        PP.$('[data-applyplan]', f).addEventListener('click', () => { const p = PP.$('[data-fplan]', f).value; d.features = planDefaults(p); if (p !== d.planId) { d.planId = p; d.limits = planLimits(p); PP.ui.toast(`Plan set to ${esc(SA.planName(p))}; features and limits reset to its defaults`); } else PP.ui.toast('Features reset to plan defaults'); draw(); });
        draw();
      },
      read: () => {},
      check: (d) => { const s = new Set(d.features); const bad = d.features.filter((c) => !SA.CORE_FEATURES.includes(c) && SA.missing(c, s).length); return bad.length ? { _form: `${bad.length} enabled feature(s) miss a prerequisite (for example <code>${esc(bad[0])}</code>). Enable the prerequisites or switch them off.` } : {}; } },
    { id: 'limits', label: 'Usage limits',
      body: (d) => { const pl = planLimits(d.planId); return `<p class="muted" style="margin-top:0">Business usage limits only. Leave blank for unlimited. Reaching a limit blocks only <i>new</i> records of that kind.</p>
        <div class="form-grid">${SA.LIMITS.map((l) => PP.form.field({ name: 'lim_' + l.code, label: l.label, type: 'number', min: 0, step: 1, value: d.limits[l.code] == null ? '' : d.limits[l.code], placeholder: 'Unlimited', rule: 'nonneg', hint: `${esc(SA.planName(d.planId))} default: ${SA.fmtLimit(pl[l.code])}` })).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm mt-3" data-limreset>${PP.icon('refresh')} Reset to plan defaults</button>
        <div class="mt-4">${PP.ui.alert('info', '<b>Never storage, disk, RAM, CPU or bandwidth (D-016).</b> Capacity belongs to the customer’s own server.')}</div>`; },
      bind: (f, d, redraw) => { PP.$('[data-limreset]', f).addEventListener('click', () => { d.limits = planLimits(d.planId); redraw(); PP.ui.toast('Limits reset to plan defaults'); }); },
      read: (f, d) => { const v = PP.form.read(f); SA.LIMITS.forEach((l) => { const x = v['lim_' + l.code]; d.limits[l.code] = x === '' || x == null ? null : Number(x); }); },
      check: (d) => { const e = {}; SA.LIMITS.forEach((l) => { const v = d.limits[l.code]; if (v != null && (!(v >= 0) || Math.floor(v) !== v)) e['lim_' + l.code] = 'Enter a whole number of zero or more, or leave blank.'; }); return e; } },
    { id: 'plan', label: 'Subscription plan',
      body: (d) => `<div class="sa-choices onb-plans" data-field="planId">${activePlans().map((p) => `<label class="sa-choice"><input type="radio" name="planId" value="${p.id}" ${d.planId === p.id ? 'checked' : ''}><span><b>${esc(p.name)}</b><span class="sub">${esc(p.description)}</span><span class="sub mono">${PP.fmt.money(p.priceMonthly)} / month · ${PP.fmt.money(p.priceYearly)} / year</span><span class="sub">${p.features.length} features · ${SA.fmtLimit(p.limits.branches)} branches · ${SA.fmtLimit(p.limits.users)} users</span></span></label>`).join('')}</div>
        <div class="row mt-4"><span class="label">Billing cycle</span>${PP.ui.segmented('cycle', [['Monthly', 'Monthly'], ['Yearly', 'Yearly']], d.billingCycle)}</div>
        <div class="mt-4">${SA.pending('PD-008', 'Plan names, prices and contents are proposals. All prices are fictional.')}</div>`,
      bind: (f, d, redraw) => {
        PP.ui.bindSegmented(f, 'cycle', (v) => { d.billingCycle = v; saveDraft(); });
        PP.$$('input[name=planId]', f).forEach((r) => r.addEventListener('change', async () => {
          const old = d.planId; const nw = r.value; if (old === nw) return;
          const custom = !sameSet(d.features, planDefaults(old)) || !sameLimits(d.limits, planLimits(old));
          let reset = true;
          if (custom) reset = await PP.ui.confirm({ title: 'Reset features and limits?', message: `You customised features or limits for ${esc(SA.planName(old))}. Reset them to the ${esc(SA.planName(nw))} defaults? Choose Cancel to keep your choices; they become overrides against the new plan.`, confirmLabel: 'Reset to plan defaults' });
          d.planId = nw; if (reset) { d.features = planDefaults(nw); d.limits = planLimits(nw); PP.ui.toast(`Features and limits reset to ${esc(SA.planName(nw))} defaults`); } else PP.ui.toast('Kept your feature and limit choices as overrides', 'info');
          saveDraft(); redraw();
        }));
      },
      read: (f, d) => { const r = PP.$('input[name=planId]:checked', f); if (r) d.planId = r.value; },
      check: (d) => (SA.plan(d.planId) && SA.plan(d.planId).status === 'Active' ? {} : { _form: 'Choose an active plan.' }) },
    { id: 'licence', label: 'Licence duration',
      body: (d) => `<div class="form-grid">${PP.form.field({ name: 'start', label: 'Licence start', type: 'date', required: true, value: d.licence.start })}
          <div class="field" data-field="months"><label>Duration</label>${PP.ui.segmented('months', [['6', '6 months'], ['12', '12 months'], ['24', '24 months'], ['custom', 'Custom']], d.licence.months)}</div>
          <div class="field ${d.licence.months === 'custom' ? '' : 'hidden'}" data-field="end" data-endwrap><label for="lic-end">End date<span class="req">*</span></label><input class="input" type="date" id="lic-end" name="end" value="${esc(d.licence.end)}"><div class="error" role="alert">Choose an end date after the start date.</div></div></div>
        <div class="sa-callout mt-4" data-licsum></div>
        <div class="stack mt-4">${PP.ui.alert('info', `<b>Non-destructive enforcement (D-017).</b> After the end date the licence goes Active → Grace (${SA.graceDays()} days, full use with a warning) → Read-only (records viewable, printable and exportable; no new entries). Data is never deleted or encrypted.`)}${SA.pending('PD-028', 'Grace length, validation interval and offline tolerance are prototype assumptions.')}</div>`,
      bind: (f, d) => {
        const draw = () => { STEPS[10].read(f, d); PP.$('[data-endwrap]', f).classList.toggle('hidden', d.licence.months !== 'custom'); const end = ONB.licenceEnd(d); PP.$('[data-licsum]', f).innerHTML = `Licence period: <b>${PP.fmt.date(d.licence.start)}</b> → <b>${end ? PP.fmt.date(end) : '—'}</b>${end && d.licence.start ? ` · ${PP.diffDays(d.licence.start, end) + 1} days · grace until ${PP.fmt.date(PP.addDays(end, SA.graceDays()))}` : ''}`; };
        PP.ui.bindSegmented(f, 'months', (v) => { d.licence.months = v; if (v === 'custom' && !d.licence.end) d.licence.end = PP.addDays(d.licence.start, 364); draw(); });
        PP.$$('input', f).forEach((i) => i.addEventListener('change', draw)); draw();
      },
      read: (f, d) => { const s = PP.$('[name=start]', f); const e = PP.$('[name=end]', f); if (s) d.licence.start = s.value; if (e && d.licence.months === 'custom') d.licence.end = e.value; },
      check: (d) => { if (!d.licence.start) return { start: 'Choose a start date.' }; const end = ONB.licenceEnd(d); if (!end || end <= d.licence.start) return { end: 'Choose an end date after the start date.' }; return {}; } },
    { id: 'branding', label: 'Branding',
      body: (d) => `<div class="onb-brand-grid"><div class="form-grid">
          ${PP.form.field({ name: 'brandName', label: 'Brand name', required: true, value: d.branding.brandName || d.org.name })}
          ${PP.form.field({ name: 'tagline', label: 'Tagline', value: d.branding.tagline })}
          <div class="field"><label for="b-pri">Primary colour</label><div class="row"><input type="color" id="b-pri" name="primary" value="${esc(d.branding.primary)}" class="onb-color"><span class="mono small" data-hex="primary">${esc(d.branding.primary)}</span></div></div>
          <div class="field"><label for="b-act">Action colour</label><div class="row"><input type="color" id="b-act" name="action" value="${esc(d.branding.action)}" class="onb-color"><span class="mono small" data-hex="action">${esc(d.branding.action)}</span></div></div>
          <div class="field full" data-field="logo"><label for="b-logo">Logo (PNG, JPG or SVG, up to 300 KB)</label><input type="file" id="b-logo" accept="image/png,image/jpeg,image/svg+xml" data-logo><div class="row mt-2"><button type="button" class="btn btn-ghost btn-sm ${d.branding.logo ? '' : 'hidden'}" data-rmlogo>${PP.icon('trash')} Remove logo</button></div><div class="error" role="alert">Upload an image up to 300 KB.</div></div>
        </div><div data-bpreview></div></div>
        <p class="small muted mt-3">Login page, invoice and email branding can be refined later on the Branding page.</p>`,
      bind: (f, d) => {
        const draw = () => { const v = PP.form.read(f); const b = Object.assign({}, d.branding, { brandName: v.brandName, tagline: v.tagline, primary: v.primary, action: v.action }); PP.$$('[data-hex]', f).forEach((s) => { s.textContent = b[s.dataset.hex]; }); PP.$('[data-bpreview]', f).innerHTML = ONB.brandPreview(b); };
        PP.$$('input:not([type=file])', f).forEach((i) => i.addEventListener('input', draw));
        PP.$('[data-logo]', f).addEventListener('change', (e) => {
          const file = e.target.files[0]; PP.form.clearErrors(f); if (!file) return;
          if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type) || file.size > 300 * 1024) { PP.form.setError(f, 'logo', 'Upload a PNG, JPG or SVG image up to 300 KB.'); e.target.value = ''; return; }
          const r = new FileReader(); r.onload = () => { d.branding.logo = r.result; PP.$('[data-rmlogo]', f).classList.remove('hidden'); draw(); PP.ui.toast('Logo added'); }; r.readAsDataURL(file);
        });
        PP.$('[data-rmlogo]', f).addEventListener('click', (e) => { d.branding.logo = ''; e.currentTarget.classList.add('hidden'); PP.$('[data-logo]', f).value = ''; draw(); });
        draw();
      },
      read: (f, d) => { const v = PP.form.read(f); Object.assign(d.branding, { brandName: v.brandName, tagline: v.tagline, primary: v.primary || d.branding.primary, action: v.action || d.branding.action }); },
      check: (d) => (req(d.branding.brandName) ? {} : { brandName: 'Enter the brand name.' }) },
    { id: 'admin', label: 'Customer admin',
      body: (d) => `<div class="form-grid">
          ${PP.form.field({ name: 'aname', label: 'Admin full name', required: true, value: d.admin.name })}
          ${PP.form.field({ name: 'aemail', label: 'Admin email (sign-in)', type: 'email', required: true, rule: 'email', value: d.admin.email })}
          ${PP.form.field({ name: 'amobile', label: 'Admin mobile (two-step codes)', type: 'tel', required: true, rule: 'mobile', value: d.admin.mobile, placeholder: '01XXXXXXXXX' })}
        </div>
        <div class="row mt-3"><button type="button" class="btn btn-ghost btn-sm" data-copycontact>${PP.icon('user')} Use the main contact</button></div>
        <div class="stack mt-4">${PP.ui.alert('info', '<b>Two-step sign-in is forced on</b> for the customer admin (<code>auth.mfa</code> is a core feature). The vendor never sets or sees the password: the admin receives an invitation when the deployment activates.')}</div>`,
      bind: (f, d) => { PP.$('[data-copycontact]', f).addEventListener('click', () => { PP.$('[name=aname]', f).value = d.org.contactName; PP.$('[name=aemail]', f).value = d.org.contactEmail; PP.$('[name=amobile]', f).value = d.org.contactMobile; }); },
      read: (f, d) => { const v = PP.form.read(f); d.admin = { name: v.aname, email: v.aemail, mobile: v.amobile }; },
      check: (d) => { const e = {}; if (!req(d.admin.name)) e.aname = 'Enter the admin name.'; if (!req(d.admin.email)) e.aemail = 'Enter the admin email.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.admin.email)) e.aemail = 'Enter a valid email address.'; if (!req(d.admin.mobile)) e.amobile = 'Enter the admin mobile.'; else if (!PP.isMobile(d.admin.mobile)) e.amobile = 'Enter a valid Bangladesh mobile number (01XXXXXXXXX).'; return e; } },
    { id: 'init', label: 'Initial configuration',
      body: (d) => `<div class="form-grid">
          ${PP.form.field({ name: 'language', label: 'Interface languages', type: 'select', placeholder: false, value: d.init.language, options: ['English + Bangla', 'Bangla + English', 'English only'], hint: 'PD-015: Bangla and English.' })}
          ${PP.form.field({ name: 'currency', label: 'Currency', value: d.init.currency, readonly: true })}
          ${PP.form.field({ name: 'timezone', label: 'Time zone', value: d.init.timezone, readonly: true })}
          ${PP.form.field({ name: 'slotMinutes', label: 'Default appointment slot', type: 'select', placeholder: false, value: d.init.slotMinutes, options: [['10', '10 minutes'], ['15', '15 minutes'], ['20', '20 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '60 minutes']] })}
          ${PP.form.field({ name: 'backup', label: 'Backup schedule', type: 'select', placeholder: false, value: d.init.backup, options: ['Daily at 02:00', 'Daily at 23:00', 'Twice daily (02:00, 14:00)'] })}
          ${PP.form.field({ name: 'sampleServices', label: 'Load the sample service list for this business type', type: 'checkbox', value: d.init.sampleServices, hint: 'Services and prices only. No sample patients — the customer database starts empty.' })}
          ${PP.form.field({ name: 'offsite', label: 'Keep an off-server backup copy', type: 'checkbox', value: d.init.offsite, hint: 'Required before go-live; a test restore is done during activation.' })}
        </div>`,
      read: (f, d) => { const v = PP.form.read(f); Object.assign(d.init, { language: v.language, slotMinutes: v.slotMinutes, backup: v.backup, sampleServices: v.sampleServices, offsite: v.offsite }); },
      check: () => ({}) },
  ];
  const REVIEW = STEPS.length; // index of the review step
  ONB.STEPS = STEPS;

  function dnsHtml(host) {
    const txt = (ONB.draft && ONB.draft.domain.host === host && ONB.draft.domain.txt) || SA.genTxt(host);
    return `<div class="sa-callout"><b class="small">DNS records the customer adds at their DNS provider</b>
      <table class="table mt-2 onb-dns"><thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>
      <tr><td>TXT</td><td><code>_pp-verify.${esc(host)}</code></td><td><code>${esc(txt)}</code></td></tr>
      <tr><td>A</td><td><code>${esc(host)}</code></td><td>IP address of the customer’s server</td></tr></tbody></table>
      <div class="small muted mt-2">The TXT record proves ownership. SSL is issued automatically on the customer’s server after verification. The final TXT value is generated when the customer is created.</div></div>`;
  }
  ONB.brandPreview = (b) => `<div class="sa-preview-frame"><div class="sa-preview-bar"><i></i><i></i><i></i><span>Login page preview</span></div>
    <div class="onb-prev" style="--p:${esc(b.primary)};--a:${esc(b.action)}"><div class="onb-prev-side"><div class="sa-logo-box" style="background:${esc(b.action)}">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : esc(PP.initials(b.brandName || '?'))}</div><div><b>${esc(b.brandName || 'Brand name')}</b><div class="small">${esc(b.tagline || '')}</div></div></div>
    <div class="onb-prev-main"><div class="small muted">Welcome back</div><div class="onb-prev-input"></div><div class="onb-prev-input"></div><div class="onb-prev-btn">Secure sign in</div></div></div></div>`;

  /* ------------------------------------------------------------------ review */
  function allErrors(d) { const out = {}; STEPS.forEach((s, i) => { const e = s.check(d); if (Object.keys(e).length) out[i] = e; }); return out; }
  function warnings(d) {
    const w = []; const lim = d.limits;
    if (lim.branches != null && d.branches.length > lim.branches) w.push(`${d.branches.length} branches entered, but the branch limit is ${lim.branches}.`);
    const gs = PP.db.globalSwitches || {}; const off = d.features.filter((c) => gs[c] && gs[c].state === 'off');
    if (off.length) w.push(`${off.length} chosen feature(s) are switched off globally and will be removed at publish: ${off.map((c) => `<code>${esc(c)}</code>`).join(', ')}.`);
    if (!d.professionalTypes.some((id) => { const p = PP.db.professionalTypes.find((x) => x.id === id); return p && p.canBeBooked; })) w.push('None of the chosen professional types can be booked.');
    if (!d.init.offsite) w.push('No off-server backup copy is planned.');
    return w;
  }
  function reviewHtml(d) {
    const errs = allErrors(d); const pd = new Set(planDefaults(d.planId)); const set = new Set(d.features);
    const grants = d.features.filter((c) => !pd.has(c)); const revokes = Array.from(pd).filter((c) => !set.has(c));
    const p = SA.plan(d.planId); const bt = SA.bt(d.businessType); const end = ONB.licenceEnd(d);
    const sec = (i, title, body) => `<section class="onb-rev ${errs[i] ? 'has-error' : ''}"><div class="row between"><h3>${i + 1}. ${esc(title)}</h3><button type="button" class="btn btn-ghost btn-sm" data-jump="${i}">${PP.icon('edit')} Edit</button></div>${errs[i] ? `<div class="small" style="color:var(--pp-error-fg)">${Object.values(errs[i]).join(' ')}</div>` : ''}<div class="mt-2">${body}</div></section>`;
    const n = Object.keys(errs).length; const w = warnings(d);
    return `${n ? PP.ui.alert('error', `<b>${n} step(s) need attention</b> before the customer can be created. They are marked in the step list.`) : PP.ui.alert('positive', 'Everything is complete. Review and create the customer.')}
      ${w.length ? `<div class="mt-3">${PP.ui.alert('warning', `<b>Flags</b><ul style="margin:6px 0 0;padding-left:18px">${w.map((x) => `<li>${x}</li>`).join('')}</ul>`)}</div>` : ''}
      <div class="onb-review mt-4">
      ${sec(0, 'Organisation', `<dl class="kv kv-tight"><dt>Name</dt><dd>${esc(d.org.name || '—')}</dd><dt>Legal name</dt><dd>${esc(d.org.legalName || d.org.name || '—')}</dd><dt>City</dt><dd>${esc(d.org.city || '—')}</dd><dt>Contact</dt><dd>${esc(d.org.contactName || '—')} · ${esc(d.org.contactEmail)} · ${esc(d.org.contactMobile)}</dd></dl>`)}
      ${sec(1, 'Business type', esc(bt ? bt.label : '—'))}
      ${sec(2, 'Domain', d.domain.host ? `<code>${esc(d.domain.host)}</code> · verification by DNS TXT after creation` : '—')}
      ${sec(3, 'Hosting', `${esc(d.hosting.model)} · ${esc(d.hosting.provider)} · ${esc(d.hosting.region)} · ${esc(d.hosting.os)}`)}
      ${sec(4, 'Branches', `<div class="sa-pill-list">${d.branches.map((b) => `<span class="sa-pill">${esc(b.name || '(unnamed)')}</span>`).join('')}</div>`)}
      ${sec(5, 'Professional types', `<div class="sa-pill-list">${d.professionalTypes.map((id) => `<span class="sa-pill">${esc((PP.db.professionalTypes.find((x) => x.id === id) || {}).name || id)}</span>`).join('') || '—'}</div>`)}
      ${sec(6, 'Terminology', `${esc(d.terminology.professional || '—')} / ${esc(d.terminology.professionals || '—')}`)}
      ${sec(7, 'Enabled features', `${d.features.length} features (${SA.CORE_FEATURES.length} core) · plan ${esc(p ? p.name : '—')} <span class="sa-tag grant">+${grants.length} granted</span> <span class="sa-tag revoke">−${revokes.length} revoked</span>${grants.length || revokes.length ? `<div class="small muted mt-2">${grants.map((c) => `+<code>${esc(c)}</code>`).concat(revokes.map((c) => `−<code>${esc(c)}</code>`)).slice(0, 12).join(' ')}${grants.length + revokes.length > 12 ? ' …' : ''}</div>` : ''}`)}
      ${sec(8, 'Usage limits', `<div class="sa-pill-list">${SA.LIMITS.map((l) => `<span class="sa-pill">${esc(l.label)}: ${SA.fmtLimit(d.limits[l.code])}</span>`).join('')}</div>`)}
      ${sec(9, 'Subscription plan', p ? `${esc(p.name)} · ${esc(d.billingCycle)} · ${PP.fmt.money(d.billingCycle === 'Yearly' ? p.priceYearly : p.priceMonthly)} per ${d.billingCycle === 'Yearly' ? 'year' : 'month'}` : '—')}
      ${sec(10, 'Licence duration', `${PP.fmt.date(d.licence.start)} → ${end ? PP.fmt.date(end) : '—'}`)}
      ${sec(11, 'Branding', `<div class="row"><span class="sa-swatch" style="background:${esc(d.branding.primary)}"></span><span class="sa-swatch" style="background:${esc(d.branding.action)}"></span>${esc(d.branding.brandName || '—')}${d.branding.logo ? ' · logo uploaded' : ' · no logo'}</div>`)}
      ${sec(12, 'Customer admin', `${esc(d.admin.name || '—')} · ${esc(d.admin.email)} · ${esc(d.admin.mobile)} · two-step sign-in on`)}
      ${sec(13, 'Initial configuration', `${esc(d.init.language)} · BDT · Asia/Dhaka · ${esc(d.init.slotMinutes)}-minute slots · backup ${esc(d.init.backup)}${d.init.sampleServices ? ' · sample services' : ''}`)}
      </div>
      <div class="sa-callout mt-4 small">Creating the customer generates the tenant ID, a licence key bound to the tenant and domain, and the first signed entitlement and configuration snapshot (version 1). Nothing is installed yet: the customer’s deployment pulls these when it activates (D-021).</div>`;
  }

  /* ------------------------------------------------------------------ create */
  ONB.create = function (d) {
    const db = PP.db; const p = SA.plan(d.planId); const bt = SA.bt(d.businessType);
    const cid = nextNumId('CUS', 'customers', 4); const tenantId = SA.genTenantId(cid + d.org.name + PP.nowStamp());
    const end = ONB.licenceEnd(d);
    const c = {
      id: cid, tenantId, name: d.org.name, legalName: d.org.legalName || d.org.name, businessType: d.businessType,
      terminology: d.termTouched ? Object.assign({}, d.terminology) : {}, city: d.org.city, address: d.org.address || `${d.branches[0].name}, ${d.org.city}`,
      contact: { name: d.org.contactName, email: d.org.contactEmail, mobile: d.org.contactMobile },
      branches: d.branches.map((b, k) => ({ id: `BR-${k + 1}`, name: b.name, address: b.address || `${b.name}, ${d.org.city}` })),
      professionalTypes: d.professionalTypes.slice(), planId: d.planId, billingCycle: d.billingCycle, status: 'Onboarding', suspendReason: '',
      createdAt: PP.today(), activatedAt: null, hostingModel: d.hosting.model, hosting: { provider: d.hosting.provider, region: d.hosting.region, server: d.hosting.server, os: d.hosting.os, docker: 'Docker 27' },
      channel: 'stable', initialConfig: { language: d.init.language, currency: 'BDT', timezone: 'Asia/Dhaka', sampleServices: !!d.init.sampleServices, slotMinutes: Number(d.init.slotMinutes), backup: d.init.backup, offsite: !!d.init.offsite },
      branding: { brandName: d.branding.brandName, tagline: d.branding.tagline || (bt ? bt.label : ''), primary: d.branding.primary, action: d.branding.action, logo: d.branding.logo || '', favicon: '', loginHeadline: `Welcome to ${d.branding.brandName}`, invoiceFooter: 'Thank you for choosing us.', emailSignature: `${d.branding.brandName} · ${d.org.city}` },
      admin: { name: d.admin.name, email: d.admin.email, mobile: d.admin.mobile, mfa: true, invited: false },
      entitlementVersion: 0, notes: d.leadId ? `Converted from demo lead ${d.leadId}.` : '', leadId: d.leadId || null,
    };
    db.customers.push(c);
    const dom = { id: nextNumId('DOM', 'domains', 4), customerId: cid, host: d.domain.host, primary: true, txtName: `_pp-verify.${d.domain.host}`, txtValue: d.domain.txt || SA.genTxt(d.domain.host), target: `${d.domain.host}. A → customer server`, status: 'Pending', verifiedAt: null, lastCheck: null, ssl: 'Not started', sslExpires: null, sslIssuer: "Let's Encrypt (ACME, on the customer's server)" };
    db.domains.push(dom);
    const lic = { id: nextNumId('LIC', 'licences', 4), customerId: cid, key: SA.genLicenceKey(cid + tenantId), planId: d.planId, start: d.licence.start, end, status: 'Issued', domains: [d.domain.host], issuedAt: PP.nowStamp(), by: PP.currentUser().name, note: 'Issued at onboarding' };
    db.licences.push(lic);
    db.deployments.push({ id: nextNumId('DEP', 'deployments', 4), customerId: cid, version: null, channel: 'stable', server: d.hosting.server, provider: d.hosting.provider, updateStatus: 'Not installed', lastHeartbeat: null, lastBackup: null, backupStatus: 'None', lastRestoreTest: null, failedUpdates: 0, lastUpdateAt: null, lastError: '', health: 'Not installed', usage: { branches: 0, users: 0, professionals: 0, patients: 0, appointments_month: 0 }, updateHistory: [] });
    // overrides relative to the plan
    const pd = new Set(planDefaults(d.planId)); const set = new Set(d.features); const by = PP.currentUser().name; const at = PP.nowStamp();
    const mk = (o) => db.overrides.push(Object.assign({ id: PP.nextId('OVR', 4), customerId: cid, value: null, reason: 'Onboarding', expires: null, by, at, removed: false }, o));
    d.features.filter((f) => !pd.has(f) && !SA.CORE_FEATURES.includes(f)).forEach((f) => mk({ type: 'feature', code: f, action: 'grant' }));
    Array.from(pd).filter((f) => !set.has(f) && !SA.CORE_FEATURES.includes(f)).forEach((f) => mk({ type: 'feature', code: f, action: 'revoke' }));
    const pl = planLimits(d.planId);
    SA.LIMITS.forEach((l) => { if (String(pl[l.code] == null ? '' : pl[l.code]) !== String(d.limits[l.code] == null ? '' : d.limits[l.code])) mk({ type: 'limit', code: l.code, action: 'value', value: d.limits[l.code] }); });
    const es = SA.publish(c, 'Initial entitlement set from onboarding');
    // onboarding invoice
    const price = d.billingCycle === 'Yearly' ? p.priceYearly : p.priceMonthly;
    db.vendorInvoices.push({ id: nextNumId('VIN', 'vendorInvoices', 4), customerId: cid, date: PP.today(), due: PP.addDays(PP.today(), 14), period: `${PP.fmt.date(d.licence.start)} – ${PP.fmt.date(d.billingCycle === 'Yearly' ? end : PP.addDays(addMonths(d.licence.start, 1), -1))}`, lines: [{ description: 'Onboarding and installation (one-time)', amount: 15000 }, { description: `${p.name} plan · ${d.billingCycle.toLowerCase()}`, amount: price }], payments: [], status: 'Open', remindersSent: 0 });
    PP.audit('Customer created (onboarding wizard)', cid, `${c.name} · ${bt ? bt.label : c.businessType} · ${p.name} · tenant ${tenantId}`);
    PP.audit('Domain added', cid, `${dom.host} · verification pending (DNS TXT)`);
    PP.audit('Licence issued', cid, `${lic.id} · ${PP.fmt.date(lic.start)} → ${PP.fmt.date(lic.end)}`);
    PP.audit('Entitlement set published', cid, `v${es.version} · ${es.features.length} features · ${es.autoDisabled.length} auto-disabled`);
    if (d.leadId) {
      const lead = db.leads.find((l) => l.id === d.leadId);
      if (lead) {
        lead.status = 'Converted'; lead.customerId = cid;
        const sb = db.sandboxes.find((s) => s.id === lead.sandboxId);
        if (sb && sb.status !== 'Deleted') { sb.status = 'Deleted'; sb.deletedAt = PP.nowStamp(); sb.deleteReason = `Converted to customer ${cid} (demo data is never migrated)`; PP.audit('Demo sandbox deleted', sb.id, sb.deleteReason); }
        PP.audit('Demo lead converted', lead.id, `${lead.organisation} → ${cid}`);
      }
    }
    PP.notify('New customer onboarded', `${c.name} · awaiting deployment activation`, `#/customers/${cid}`);
    PP.save();
    return c;
  };
  ONB.snapshot = function (c) {
    const lic = SA.licenceOf(c.id); const set = SA.latestSet(c.id); const dom = SA.primaryDomain(c.id);
    const body = { tenantId: c.tenantId, customer: c.name, businessType: c.businessType, domain: dom ? dom.host : null, plan: SA.planName(c.planId), billingCycle: c.billingCycle,
      licence: lic ? { id: lic.id, start: lic.start, end: lic.end, graceDays: SA.graceDays() } : null,
      entitlementSet: set ? { version: set.version, features: set.features.length, limits: set.limits } : null,
      terminology: { professional: SA.term(c, 'professional'), professionals: SA.term(c, 'professionals') },
      branches: c.branches.length, issuedAt: set ? set.issuedAt : PP.nowStamp() };
    body.signature = SA.sign(body);
    return body;
  };

  function successHtml(c) {
    const lic = SA.licenceOf(c.id); const dom = SA.primaryDomain(c.id); const snap = ONB.snapshot(c);
    const steps = [
      ['Verify the domain', `The customer adds the TXT record <code>${esc(dom ? dom.txtName : '')}</code> and an A record to their server.`, dom ? '#/domains' : null],
      ['Install the data plane', `On the customer’s server, run the installer and enter the activation code <code>${esc(lic ? lic.key : '')}</code>.`],
      ['Deployment registers', 'It generates its identity key, registers with the control plane and pulls the signed licence and snapshots (pull model, D-021).'],
      ['TLS and branding', 'SSL is issued on the customer’s server; branding and terminology are applied.'],
      ['Invite the customer admin', `${esc((c.admin || {}).name || c.contact.name)} receives an invitation and sets up two-step sign-in.`],
      ['Backups', 'Configure the backup schedule and perform a test restore before go-live.'],
    ];
    return `${PP.ui.pageHead({ title: 'Customer created', subtitle: `${esc(c.name)} is in the Onboarding state until its deployment activates.`, crumbs: [['Customers', '#/customers'], ['Onboarding']], actions: `<a class="btn btn-primary" href="#/customers/${c.id}">${PP.icon('building')} Open customer</a><a class="btn" href="#/domains">${PP.icon('globe')} Domains</a><a class="btn btn-ghost" href="#/onboarding?new=1">${PP.icon('plus')} Onboard another</a>` })}
      <div class="sa-split">
        <div class="stack">
          ${PP.ui.card({ title: 'Generated identifiers', body: `<div class="onb-success-mark">${PP.icon('checkCircle')}</div>
            <dl class="kv"><dt>Customer</dt><dd><a href="#/customers/${c.id}">${esc(c.id)}</a> · ${SA.badge(SA.state(c))}</dd>
            <dt>Tenant ID</dt><dd><div class="sa-copy"><span class="sa-code">${esc(c.tenantId)}</span><button class="btn btn-sm" data-copy="${esc(c.tenantId)}">Copy</button></div></dd>
            <dt>Licence key</dt><dd><div class="sa-copy"><span class="sa-code">${esc(lic ? lic.key : '—')}</span><button class="btn btn-sm" data-copy="${esc(lic ? lic.key : '')}">Copy</button></div><div class="small muted mt-2">Bound to the tenant ID and ${esc(dom ? dom.host : 'the domain')} · ${lic ? `${PP.fmt.date(lic.start)} → ${PP.fmt.date(lic.end)}` : ''}</div></dd>
            <dt>Domain</dt><dd>${esc(dom ? dom.host : '—')} ${dom ? SA.badge(dom.status) : ''}</dd></dl>` })}
          ${PP.ui.card({ title: 'Next steps (deployment-architecture.md §3)', body: `<ol class="onb-next">${steps.map(([t, s, href]) => `<li><b>${t}</b><div class="small muted">${s}${href ? ` <a href="${href}">Open</a>` : ''}</div></li>`).join('')}</ol>` })}
        </div>
        ${PP.ui.card({ title: `Signed configuration and entitlement snapshot <span class="sa-signed">${PP.icon('shield')} signed (mock)</span>`, body: `<pre class="sa-code onb-json">${esc(JSON.stringify(snap, null, 2))}</pre><p class="small muted">Mock signature only — no real key is used. The snapshot contains no patient data and no secrets.</p>` })}
      </div>`;
  }

  /* ------------------------------------------------------------------ wizard route */
  PP.route('/onboarding', {
    title: 'Onboard a customer', perm: 'onboarding.run',
    render({ query, el }) {
      if (query.created) {
        const c = SA.customer(query.created);
        if (!c) { el.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'alert', title: 'Customer not found', action: '<a class="btn" href="#/onboarding">Back to onboarding</a>' }) }); return; }
        el.innerHTML = successHtml(c);
        PP.$$('[data-copy]', el).forEach((b) => b.addEventListener('click', () => { try { navigator.clipboard.writeText(b.dataset.copy); } catch (e) { /* ignore */ } PP.ui.toast('Copied (prototype value)', 'info'); }));
        return;
      }
      if (query.new) { clearDraft(); }
      let lead = null;
      if (query.lead) {
        lead = PP.db.leads.find((l) => l.id === query.lead);
        if (!lead) { el.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'alert', title: 'Demo lead not found', text: `No lead ${esc(query.lead)}.`, action: '<a class="btn" href="#/demo">Back to leads</a>' }) }); return; }
        if (lead.status === 'Converted' && lead.customerId) { el.innerHTML = PP.ui.card({ body: PP.ui.empty({ icon: 'checkCircle', title: 'This lead is already a customer', text: `${esc(lead.organisation)} was converted to ${esc(lead.customerId)}.`, action: `<a class="btn btn-primary" href="#/customers/${esc(lead.customerId)}">Open customer</a>` }) }); return; }
      }
      if (!ONB.draft) ONB.draft = loadDraft();
      if (lead && (!ONB.draft || ONB.draft.leadId !== lead.id)) { ONB.draft = ONB.fromLead(lead); PP.ui.toast(`Wizard pre-filled from demo lead ${esc(lead.id)}`, 'info'); }
      if (!ONB.draft) ONB.draft = ONB.newDraft();
      const d = ONB.draft; if (d.leadId) lead = PP.db.leads.find((l) => l.id === d.leadId) || null;
      el.innerHTML = `${PP.ui.pageHead({ title: 'Onboard a customer', subtitle: '14 steps (master prompt §7). The result is a signed configuration and entitlement snapshot plus a licence bound to the tenant ID and verified domain.', crumbs: [['Customers', '#/customers'], ['Onboarding']], actions: '<button class="btn btn-ghost" data-startover>' + PP.icon('refresh') + ' Start over</button>' })}
        ${lead ? `<div class="mb-4">${PP.ui.alert('info', `<b>Pre-filled from demo lead ${esc(lead.id)}</b> (${esc(lead.organisation)}): business type, terminology, plan choice and contact details (D-027). <b>Demo data is never migrated; the customer starts with an empty database.</b> On creation the sandbox is deleted.`)}</div>` : ''}
        <div class="sa-wizard"><ol class="sa-steps" data-steps aria-label="Onboarding steps"></ol><section class="card"><div class="card-body" data-body></div></section></div>`;
      PP.$('[data-startover]', el).addEventListener('click', async () => {
        const ok = await PP.ui.confirm({ title: 'Start over?', message: 'The current wizard draft is discarded.', confirmLabel: 'Discard draft', danger: true });
        if (!ok) return; const keepLead = d.leadId ? PP.db.leads.find((l) => l.id === d.leadId) : null; clearDraft(); ONB.draft = keepLead ? ONB.fromLead(keepLead) : ONB.newDraft(); PP.render();
      });
      const stepsEl = PP.$('[data-steps]', el); const body = PP.$('[data-body]', el);
      let errs = d.checkedAll ? allErrors(d) : {};
      const currentForm = () => PP.$('form[data-step]', body);
      const readCurrent = () => { const f = currentForm(); if (f && d.step < REVIEW) STEPS[d.step].read(f, d); };
      const drawSteps = () => {
        stepsEl.innerHTML = STEPS.concat([{ label: 'Review and create' }]).map((s, i) => {
          const visited = d.visited.includes(i); const bad = errs[i]; const cls = i === d.step ? 'active' : bad ? 'error' : visited && i < REVIEW && !Object.keys(STEPS[i].check(d)).length ? 'done' : '';
          return `<li class="${cls}"><button type="button" data-goto="${i}" ${i === d.step ? 'aria-current="step"' : ''}><span class="num">${bad ? '!' : cls === 'done' ? '✓' : i + 1}</span><span class="lbl">${esc(s.label)}</span></button></li>`;
        }).join('');
        PP.$$('[data-goto]', stepsEl).forEach((b) => b.addEventListener('click', () => { readCurrent(); go(Number(b.dataset.goto)); }));
      };
      const go = (i) => { d.step = i; if (!d.visited.includes(i)) d.visited.push(i); if (i === REVIEW) { d.checkedAll = true; errs = allErrors(d); } else if (d.checkedAll) errs = allErrors(d); saveDraft(); draw(); window.scrollTo({ top: 0 }); };
      const applyErrors = (f, e) => {
        let first = null; const box = PP.$('[data-msg]', body); box.innerHTML = '';
        Object.entries(e).forEach(([name, msg]) => {
          if (name === '_form') { box.innerHTML = PP.ui.alert('error', msg); return; }
          const fieldEl = PP.$(`[data-field="${name}"]`, f) || (PP.$(`[name="${name}"]`, f) || { closest: () => null }).closest('.field');
          if (fieldEl) { fieldEl.classList.add('has-error'); const er = PP.$('.error', fieldEl); if (er) er.innerHTML = msg; if (!first) first = PP.$('input, select, textarea', fieldEl) || fieldEl; } else box.innerHTML += PP.ui.alert('error', msg);
        });
        if (first && first.focus) first.focus();
      };
      function draw() {
        drawSteps();
        const i = d.step; const total = STEPS.length;
        if (i === REVIEW) {
          const n = Object.keys(errs).length;
          body.innerHTML = `<div class="row between"><div><div class="small muted">Final step</div><h2 class="sec-title">${PP.icon('checkCircle')} Review and create</h2></div></div>
            <div class="sa-progress mt-3"><span style="width:100%"></span></div><div class="mt-4" data-msg></div>${reviewHtml(d)}
            <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>${PP.icon('chevL')} Back</button><button type="button" class="btn btn-primary" data-create ${n ? 'disabled' : ''}>${PP.icon('check')} Create customer</button></div>`;
          PP.$$('[data-jump]', body).forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.jump))));
          PP.$('[data-back]', body).addEventListener('click', () => go(REVIEW - 1));
          PP.$('[data-create]', body).addEventListener('click', async (e) => {
            errs = allErrors(d); if (Object.keys(errs).length) { draw(); PP.ui.toast('Some steps need attention', 'error'); return; }
            await PP.ui.busy(e.currentTarget, () => {
              const c = ONB.create(d); clearDraft();
              PP.ui.toast(`${esc(c.name)} created · tenant ${esc(c.tenantId)} · licence issued · entitlement set v1 signed`);
              location.hash = `#/onboarding?created=${c.id}`;
            }, 900);
          });
          return;
        }
        const s = STEPS[i];
        body.innerHTML = `<div class="row between"><div><div class="small muted">Step ${i + 1} of ${total}</div><h2 class="sec-title">${esc(s.label)}</h2></div><span class="small muted">Draft kept while you move between steps</span></div>
          <div class="sa-progress mt-3"><span style="width:${Math.round(((i + 1) / (total + 1)) * 100)}%"></span></div>
          <div class="mt-4" data-msg></div>
          <form data-step="${s.id}" novalidate onsubmit="return false" class="mt-3">${s.body(d)}</form>
          <div class="form-actions"><button type="button" class="btn btn-ghost" data-back ${i === 0 ? 'disabled' : ''}>${PP.icon('chevL')} Back</button><button type="button" class="btn btn-primary" data-next>${i === total - 1 ? 'Review' : 'Next'} ${PP.icon('chevR')}</button></div>`;
        const f = currentForm();
        // redraw callback: callers update the draft themselves first, so it must not re-read the old DOM
        if (s.bind) s.bind(f, d, () => { saveDraft(); draw(); });
        if (errs[i]) applyErrors(f, errs[i]);
        PP.$('[data-back]', body).addEventListener('click', () => { readCurrent(); go(i - 1); });
        PP.$('[data-next]', body).addEventListener('click', () => {
          const domOk = PP.form.validate(f); s.read(f, d); const e = s.check(d); saveDraft();
          if (!domOk || Object.keys(e).length) { errs[i] = Object.keys(e).length ? e : errs[i]; if (Object.keys(e).length) applyErrors(f, e); drawSteps(); PP.ui.toast('Please fix the highlighted fields', 'error'); return; }
          delete errs[i]; go(i + 1);
        });
        f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'file') { ev.preventDefault(); PP.$('[data-next]', body).click(); } });
      }
      draw();
    },
  });

  /* ------------------------------------------------------------------ demo and trial */
  const deleteDays = () => (PP.db.settings && PP.db.settings.sandboxDeleteDays) || 7;
  const trialDays = () => (PP.db.settings && PP.db.settings.trialDays) || 14;
  const sbStatus = (s) => (s.status === 'Active' && s.trialEnd < PP.today() ? 'Ended' : s.status);
  const leadOf = (s) => PP.db.leads.find((l) => l.id === s.leadId) || null;
  const sandboxOf = (l) => PP.db.sandboxes.find((s) => s.id === l.sandboxId) || null;
  const daysLeftHtml = (s) => { const st = sbStatus(s); if (st !== 'Active') return ''; const n = SA.daysLeft(s.trialEnd); return `<span class="sub ${n <= 3 ? 'onb-warn' : ''}">${n === 0 ? 'ends today' : `${n} day${n === 1 ? '' : 's'} left`}</span>`; };
  ONB.subdomain = (org) => { const base = String(org).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'demo'; let s = `${base}.demo.physiopoint.example`; let k = 2; while (PP.db.sandboxes.some((x) => x.subdomain === s)) { s = `${base}-${k++}.demo.physiopoint.example`; } return s; };
  ONB.createSandbox = function (lead) {
    const start = PP.today(); const end = PP.addDays(start, trialDays());
    const bt = SA.bt(lead.businessType);
    const sb = { id: nextNumId('SBX', 'sandboxes', 4), leadId: lead.id, subdomain: ONB.subdomain(lead.organisation), businessType: lead.businessType, trialStart: start, trialEnd: end, extendedDays: 0, status: 'Active', resets: [], dataSet: `Sample data · ${bt ? bt.label : lead.businessType}`, createdAt: PP.nowStamp(), deleteOn: PP.addDays(end, deleteDays()) };
    PP.db.sandboxes.push(sb); lead.sandboxId = sb.id; return sb;
  };
  const rulesCard = () => PP.ui.card({ title: 'Demo and trial rules (D-024, D-027)', body: `<ul class="onb-rules">
      <li>${PP.icon('building')} Hosted on vendor infrastructure, completely separate from customer deployments (own servers, database, domain).</li>
      <li>${PP.icon('shield')} Fictional sample data only. Never real patient data; every page shows a permanent “Demo — sample data only” banner.</li>
      <li>${PP.icon('zap')} Instant access from a short sign-up form; each prospect gets a private sandbox for the chosen business type.</li>
      <li>${PP.icon('clock')} ${trialDays()}-day trial; super admin can extend it. The prospect can reset the sandbox at any time.</li>
      <li>${PP.icon('trash')} A sandbox is deleted ${deleteDays()} days after its trial ends, and right after conversion.</li>
      <li>${PP.icon('repeat')} Conversion pre-fills onboarding (business type, terminology, plan, contact). Demo data is never migrated.</li></ul>` });

  function leadModal(l, refresh) {
    const sb = sandboxOf(l); const can = PP.can('demo.manage');
    PP.ui.modal({
      title: `${esc(l.organisation)} <span class="small muted">${esc(l.id)}</span>`, size: 'lg',
      body: `<div class="sa-split"><div><dl class="kv kv-tight"><dt>Contact</dt><dd>${esc(l.name)}</dd><dt>Mobile</dt><dd>${esc(l.mobile)}</dd><dt>Business type</dt><dd>${esc(SA.btLabel(l.businessType))}</dd><dt>Plan interest</dt><dd>${esc(SA.planName(l.planInterest))}</dd><dt>Signed up</dt><dd>${PP.fmt.stamp(l.createdAt)} · ${esc(l.source)}</dd>${l.customerId ? `<dt>Customer</dt><dd>${SA.customerLink(l.customerId)}</dd>` : ''}</dl>
          <form class="stack mt-4" data-lf novalidate onsubmit="return false">
            ${PP.form.field({ name: 'status', label: 'Lead status', type: 'select', placeholder: false, value: l.status, options: ['New', 'Contacted', 'Lost'].concat(l.status === 'Converted' ? ['Converted'] : []), disabled: !can || l.status === 'Converted' })}
            ${PP.form.field({ name: 'notes', label: 'Notes', type: 'textarea', value: l.notes, disabled: !can })}</form></div>
        <div>${sb ? `<div class="sa-callout"><div class="row between"><b>Private sandbox</b>${SA.badge(sbStatus(sb))}</div><div class="mt-2"><span class="sa-code">${esc(sb.subdomain)}</span></div><div class="small muted mt-2">${esc(sb.dataSet)} · trial ${PP.fmt.date(sb.trialStart)} → ${PP.fmt.date(sb.trialEnd)}${sb.extendedDays ? ` (+${sb.extendedDays} days)` : ''} · ${sb.resets.length} reset(s)</div><a class="btn btn-sm mt-3" href="#/demo/sandboxes?sbx=${sb.id}" data-close>${PP.icon('eye')} Open in sandboxes</a></div>` : '<div class="sa-callout small muted">No sandbox.</div>'}</div></div>`,
      buttons: [
        { label: 'Close', kind: 'ghost' },
        ...(can && l.status !== 'Converted' ? [{ label: `${PP.icon('repeat')} Convert to customer`, onClick: () => { location.hash = `#/onboarding?lead=${l.id}`; } }] : []),
        ...(can && l.status !== 'Converted' ? [{ label: 'Save', kind: 'primary', onClick: async ({ body, btn }) => {
          const v = PP.form.read(PP.$('[data-lf]', body)); await PP.sleep(350);
          const changed = v.status !== l.status || v.notes !== l.notes; if (!changed) { PP.ui.toast('No changes', 'info'); return; }
          PP.audit('Demo lead updated', l.id, `${l.status} → ${v.status}`); l.status = v.status; l.notes = v.notes; PP.save(); refresh(); PP.ui.toast('Lead saved');
        } }] : []),
      ],
    });
  }

  PP.route('/demo', {
    title: 'Demo sign-up leads', perm: 'demo.manage',
    render({ el }) {
      const can = PP.can('demo.manage');
      const draw = () => {
        const L = PP.db.leads; const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const act = PP.db.sandboxes.filter((s) => sbStatus(s) === 'Active');
        PP.$('[data-kpis]', el).innerHTML = [
          PP.ui.kpi({ label: 'New leads (7 days)', value: L.filter((l) => l.createdAt >= weekAgo).length, icon: 'userPlus', tone: 'info', hint: `${L.filter((l) => l.status === 'New').length} not contacted yet` }),
          PP.ui.kpi({ label: 'Active sandboxes', value: act.length, icon: 'layers', tone: 'positive', hint: `${trialDays()}-day trials` }),
          PP.ui.kpi({ label: 'Trials ending in ≤ 3 days', value: act.filter((s) => SA.daysLeft(s.trialEnd) <= 3).length, icon: 'clock', tone: 'warning', hint: 'Follow up or extend' }),
          PP.ui.kpi({ label: 'Converted to customers', value: L.filter((l) => l.status === 'Converted').length, icon: 'checkCircle', tone: 'lavender', hint: `of ${L.length} leads` }),
        ].join('');
        if (tbl) tbl.refresh();
      };
      el.innerHTML = `${PP.ui.pageHead({ title: 'Demo & trial · sign-up leads', subtitle: 'Every demo sign-up becomes a lead with a private sandbox (D-027).', crumbs: [['Demo & trial'], ['Leads']], actions: `<a class="btn" href="#/demo/sandboxes">${PP.icon('layers')} Sandboxes</a>${can ? `<button class="btn btn-primary" data-signup>${PP.icon('userPlus')} Simulate a demo sign-up</button>` : ''}` })}
        <div class="grid grid-4" data-kpis></div>
        <div class="card mt-4"><div data-table></div></div>
        <div class="mt-4">${rulesCard()}</div>`;
      let tbl = null;
      tbl = PP.ui.table(PP.$('[data-table]', el), {
        getRows: () => PP.db.leads.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        search: { placeholder: 'Search name, organisation or mobile', text: (l) => `${l.name} ${l.organisation} ${l.mobile} ${l.id}` },
        filters: [
          { id: 'st', label: 'All statuses', options: ['New', 'Contacted', 'Converted', 'Lost'].map((s) => [s, s]), match: (l, v) => l.status === v },
          { id: 'bt', label: 'All business types', options: PP.db.businessTypes.map((b) => [b.id, b.label]), match: (l, v) => l.businessType === v },
        ],
        exportName: 'demo-leads',
        columns: [
          { key: 'organisation', label: 'Lead', sort: (l) => l.organisation, render: (l) => `<b>${esc(l.organisation)}</b><span class="sub">${esc(l.name)} · ${esc(l.id)}</span>`, exportValue: (l) => `${l.organisation} (${l.name})` },
          { key: 'mobile', label: 'Mobile', render: (l) => `<span class="mono">${esc(l.mobile)}</span>` },
          { key: 'businessType', label: 'Business type', sort: (l) => l.businessType, render: (l) => esc(SA.btLabel(l.businessType)) },
          { key: 'plan', label: 'Plan interest', render: (l) => esc(SA.planName(l.planInterest)) },
          { key: 'createdAt', label: 'Signed up', sort: (l) => l.createdAt, render: (l) => `${PP.fmt.date(l.createdAt)}<span class="sub">${SA.ago(l.createdAt)}</span>` },
          { key: 'sandbox', label: 'Sandbox', render: (l) => { const s = sandboxOf(l); return s ? `${SA.badge(sbStatus(s))}${daysLeftHtml(s)}` : '—'; }, exportValue: (l) => { const s = sandboxOf(l); return s ? sbStatus(s) : ''; } },
          { key: 'status', label: 'Status', sort: (l) => l.status, render: (l) => `${SA.badge(l.status)}${l.customerId ? `<span class="sub">${esc(l.customerId)}</span>` : ''}`, exportValue: (l) => l.status },
          { key: 'act', label: '', render: (l) => `<span class="row-actions"><button class="btn btn-sm btn-ghost" data-view="${l.id}">View</button>${can && l.status !== 'Converted' ? `<a class="btn btn-sm" href="#/onboarding?lead=${l.id}">Convert</a>` : ''}</span>` },
        ],
        onRowClick: (l) => leadModal(l, draw),
        empty: { icon: 'userPlus', title: 'No demo sign-ups yet', text: 'Leads appear here as soon as a prospect signs up for the demo.' },
        afterDraw: (c) => PP.$$('[data-view]', c).forEach((b) => b.addEventListener('click', () => leadModal(PP.db.leads.find((l) => l.id === b.dataset.view), draw))),
      });
      draw();
      const su = PP.$('[data-signup]', el);
      if (su) su.addEventListener('click', () => PP.ui.modal({
        title: 'Simulate a demo sign-up',
        body: `<p class="small muted" style="margin-top:0">The public demo form (D-027). Access is instant; no sales person is needed.</p>${PP.ui.alert('warning', 'Do not enter real patient information in the demo. Use fictional details only.')}
          <form class="form-grid mt-3" data-sf novalidate onsubmit="return false">
            ${PP.form.field({ name: 'name', label: 'Your name', required: true })}
            ${PP.form.field({ name: 'organisation', label: 'Organisation', required: true })}
            ${PP.form.field({ name: 'mobile', label: 'Mobile', type: 'tel', required: true, rule: 'mobile', placeholder: '01XXXXXXXXX' })}
            ${PP.form.field({ name: 'businessType', label: 'Business type', type: 'select', required: true, options: PP.db.businessTypes.filter((b) => b.status === 'Active').map((b) => [b.id, b.label]) })}
            ${PP.form.field({ name: 'planInterest', label: 'Plan of interest (optional)', type: 'select', placeholder: 'Not sure yet', options: activePlans().map((p) => [p.id, p.name]) })}
          </form>`,
        buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Sign up and create sandbox', kind: 'primary', onClick: async ({ body }) => {
          const f = PP.$('[data-sf]', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f);
          await PP.sleep(600);
          const lead = { id: nextNumId('LEAD', 'leads', 4), name: v.name, organisation: v.organisation, mobile: v.mobile, email: '', businessType: v.businessType, createdAt: PP.nowStamp(), source: 'Demo sign-up form', status: 'New', planInterest: v.planInterest || 'PLN-STARTER', notes: '', sandboxId: null, customerId: null };
          PP.db.leads.push(lead); const sb = ONB.createSandbox(lead);
          PP.audit('Demo sign-up', lead.id, `${lead.organisation} · ${SA.btLabel(lead.businessType)}`);
          PP.audit('Demo sandbox created', sb.id, `${lead.organisation} · ${trialDays()}-day trial · ${sb.subdomain}`);
          PP.notify('New demo sign-up', `${lead.organisation} (${SA.btLabel(lead.businessType)})`, '#/demo');
          PP.save(); draw(); PP.ui.toast(`Sandbox ready at ${esc(sb.subdomain)} · trial ends ${PP.fmt.date(sb.trialEnd)}`);
        } }],
      }));
    },
  });

  PP.route('/demo/sandboxes', {
    title: 'Demo sandboxes', perm: 'demo.manage',
    render({ el, query }) {
      const can = PP.can('demo.manage');
      el.innerHTML = `${PP.ui.pageHead({ title: 'Demo & trial · sandboxes', subtitle: `Private sandbox per prospect, on the vendor demo environment. Deleted ${deleteDays()} days after the trial ends.`, crumbs: [['Demo & trial', '#/demo'], ['Sandboxes']], actions: `<a class="btn" href="#/demo">${PP.icon('users')} Leads</a>${can ? `<button class="btn btn-primary" data-cleanup>${PP.icon('trash')} Run clean-up</button>` : ''}` })}
        ${can ? '' : `<div class="mb-4">${PP.ui.alert('info', 'Your role can view sandboxes but not change them (needs <code>demo.manage</code>).')}</div>`}
        <div class="card"><div data-table></div></div>
        <div class="grid grid-2 mt-4">${rulesCard()}${PP.ui.card({ title: 'Sample data sets', body: `<ul class="list sa-list-compact">${PP.db.businessTypes.filter((b) => b.status === 'Active').map((b) => `<li><span class="grow"><b>${esc(b.label)}</b><span class="sub small muted" style="display:block">Fictional patients, ${esc(b.professionals.toLowerCase())}, appointments, notes, invoices, payments and reports</span></span><span class="small muted">${PP.db.sandboxes.filter((s) => s.businessType === b.id && sbStatus(s) === 'Active').length} active</span></li>`).join('')}</ul>`, flush: true })}</div>`;
      const highlight = query.sbx || null;
      const tbl = PP.ui.table(PP.$('[data-table]', el), {
        getRows: () => PP.db.sandboxes.slice().sort((a, b) => (a.trialStart < b.trialStart ? 1 : -1)),
        search: { placeholder: 'Search prospect or sub-domain', text: (s) => { const l = leadOf(s); return `${s.id} ${s.subdomain} ${l ? l.organisation + ' ' + l.name : ''}`; } },
        filters: [
          { id: 'st', label: 'All statuses', options: ['Active', 'Ended', 'Deleted'].map((s) => [s, s]), match: (s, v) => sbStatus(s) === v, value: '' },
          { id: 'bt', label: 'All business types', options: PP.db.businessTypes.map((b) => [b.id, b.label]), match: (s, v) => s.businessType === v },
        ],
        exportName: 'demo-sandboxes',
        rowClass: (s) => (s.id === highlight ? 'sa-warn-row' : ''),
        columns: [
          { key: 'prospect', label: 'Prospect', sort: (s) => (leadOf(s) || {}).organisation || '', render: (s) => { const l = leadOf(s); return `<b>${esc(l ? l.organisation : '—')}</b><span class="sub">${esc(l ? l.name : '')} · ${esc(s.id)}</span>`; }, exportValue: (s) => (leadOf(s) || {}).organisation || '' },
          { key: 'subdomain', label: 'Sub-domain', render: (s) => `<code>${esc(s.subdomain)}</code>`, exportValue: (s) => s.subdomain },
          { key: 'bt', label: 'Business type', render: (s) => `${esc(SA.btLabel(s.businessType))}<span class="sub">${esc(s.dataSet)}</span>`, exportValue: (s) => SA.btLabel(s.businessType) },
          { key: 'trial', label: 'Trial', sort: (s) => s.trialEnd, render: (s) => `${PP.fmt.dateShort(s.trialStart)} → ${PP.fmt.date(s.trialEnd)}${s.extendedDays ? ` <span class="sa-tag beta">+${s.extendedDays}d</span>` : ''}${daysLeftHtml(s)}`, exportValue: (s) => `${s.trialStart} to ${s.trialEnd}` },
          { key: 'deleteOn', label: 'Delete on', sort: (s) => s.deleteOn, render: (s) => (s.status === 'Deleted' ? `<span class="sub">Deleted ${PP.fmt.stamp(s.deletedAt)}</span>${s.deleteReason ? `<span class="sub">${esc(s.deleteReason)}</span>` : ''}` : PP.fmt.date(s.deleteOn)), exportValue: (s) => s.deleteOn },
          { key: 'status', label: 'Status', sort: (s) => sbStatus(s), render: (s) => SA.badge(sbStatus(s)), exportValue: (s) => sbStatus(s) },
          { key: 'resets', label: 'Resets', align: 'right', sort: (s) => s.resets.length, render: (s) => `${s.resets.length}${s.resets.length ? `<span class="sub">last ${PP.fmt.dateShort(s.resets[s.resets.length - 1])}</span>` : ''}` },
          { key: 'act', label: '', render: (s) => { const st = sbStatus(s); if (!can || st === 'Deleted') return ''; const l = leadOf(s);
            return `<span class="row-actions">${`<button class="btn btn-sm btn-ghost" data-a="extend" data-id="${s.id}">Extend</button>`}${st === 'Active' ? `<button class="btn btn-sm btn-ghost" data-a="reset" data-id="${s.id}">Reset</button><button class="btn btn-sm btn-ghost" data-a="end" data-id="${s.id}">End</button>` : `<button class="btn btn-sm btn-ghost" data-a="delete" data-id="${s.id}" style="color:var(--pp-error-fg)">Delete</button>`}${l && l.status !== 'Converted' ? `<a class="btn btn-sm" href="#/onboarding?lead=${l.id}">Convert</a>` : ''}</span>`; } },
        ],
        empty: { icon: 'layers', title: 'No sandboxes', text: 'A sandbox is created for every demo sign-up.' },
        afterDraw: (c) => PP.$$('[data-a]', c).forEach((b) => b.addEventListener('click', () => action(b.dataset.a, PP.db.sandboxes.find((s) => s.id === b.dataset.id)))),
      });
      const done = (msg, kind) => { PP.save(); tbl.refresh(); PP.ui.toast(msg, kind); };
      async function action(a, s) {
        const l = leadOf(s); const who = esc(l ? l.organisation : s.id);
        if (a === 'extend') {
          PP.ui.modal({ title: `Extend trial · ${who}`, size: 'sm', body: `<form class="stack" data-ef novalidate onsubmit="return false">
              ${PP.form.field({ name: 'days', label: 'Extend by (days)', type: 'number', required: true, rule: 'positive', min: 1, max: 60, value: 7 })}
              ${PP.form.field({ name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'e.g. Owner travelling; wants to try billing with staff' })}
              <p class="small muted" style="margin:0">Current end: ${PP.fmt.date(s.trialEnd)}. The delete-on date moves with it (${deleteDays()} days after the new end).</p></form>`,
            buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Extend trial', kind: 'primary', onClick: async ({ body }) => {
              const f = PP.$('[data-ef]', body); if (!PP.form.validate(f)) return false; const v = PP.form.read(f); const n = Math.round(Number(v.days));
              if (n > 60) { PP.form.setError(f, 'days', 'Extend by at most 60 days at a time.'); return false; }
              await PP.sleep(400);
              const base = s.trialEnd < PP.today() ? PP.today() : s.trialEnd;
              s.trialEnd = PP.addDays(base, n); s.extendedDays = (s.extendedDays || 0) + n; s.deleteOn = PP.addDays(s.trialEnd, deleteDays()); s.status = 'Active';
              PP.audit('Trial extended', s.id, `+${n} days · ${l ? l.organisation : ''} · ${v.reason}`);
              done(`Trial extended to ${PP.fmt.date(s.trialEnd)}`);
            } }] });
        } else if (a === 'reset') {
          const ok = await PP.ui.confirm({ title: `Reset sandbox · ${who}?`, message: `Everything the prospect entered is replaced with the original sample data for ${esc(SA.btLabel(s.businessType))}. The trial dates do not change.`, confirmLabel: 'Reset sandbox' });
          if (!ok) return; s.resets.push(PP.nowStamp()); PP.audit('Demo sandbox reset', s.id, s.subdomain); done('Sample data restored');
        } else if (a === 'end') {
          const r = await PP.ui.confirm({ title: `End trial now · ${who}?`, message: `The prospect loses access today. The sandbox is deleted on ${PP.fmt.date(PP.addDays(PP.today(), deleteDays()))}, unless the trial is extended or the lead converts.`, confirmLabel: 'End trial', danger: true, reasonLabel: 'Reason', reasonRequired: true });
          if (!r) return; s.trialEnd = PP.addDays(PP.today(), -1); s.status = 'Ended'; s.deleteOn = PP.addDays(PP.today(), deleteDays()); PP.audit('Trial ended', s.id, r.reason); done('Trial ended', 'info');
        } else if (a === 'delete') {
          const r = await PP.ui.confirm({ title: `Delete sandbox · ${who}?`, message: 'The sandbox and its sample data are deleted permanently and cannot be restored. The lead record stays. No customer data is involved — sandboxes hold fictional data only.', confirmLabel: 'Delete permanently', danger: true, reasonLabel: 'Reason', reasonRequired: true });
          if (!r) return; s.status = 'Deleted'; s.deletedAt = PP.nowStamp(); s.deleteReason = `Deleted manually: ${r.reason}`; PP.audit('Demo sandbox deleted', s.id, s.deleteReason); done('Sandbox deleted', 'info');
        }
      }
      const cu = PP.$('[data-cleanup]', el);
      if (cu) cu.addEventListener('click', async () => {
        const t = PP.today();
        const ending = PP.db.sandboxes.filter((s) => s.status === 'Active' && s.trialEnd < t);
        const due = PP.db.sandboxes.filter((s) => s.status !== 'Deleted' && sbStatus(s) === 'Ended' && s.deleteOn <= t);
        const ok = await PP.ui.confirm({ title: 'Run sandbox clean-up?', message: `Simulates the nightly job: ${ending.length} expired trial(s) are marked Ended and ${due.length} sandbox(es) past their delete-on date are deleted permanently.`, confirmLabel: 'Run clean-up' });
        if (!ok) return;
        await PP.ui.busy(cu, () => {
          ending.forEach((s) => { s.status = 'Ended'; });
          due.forEach((s) => { s.status = 'Deleted'; s.deletedAt = PP.nowStamp(); s.deleteReason = `Clean-up: ${deleteDays()} days after trial end`; });
          PP.audit('Sandbox clean-up run', 'demo', `${ending.length} ended · ${due.length} deleted`);
          done(due.length || ending.length ? `Clean-up done: ${ending.length} ended, ${due.length} deleted` : 'Clean-up done: nothing to delete', due.length || ending.length ? 'positive' : 'info');
        }, 700);
      });
    },
  });
})();
