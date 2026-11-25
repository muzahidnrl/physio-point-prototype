/* Prescription pad + medicine picker + branded invoice sheet (owner's pad and invoice designs, 2026-11-26).
   - Medicine picker: Bangladesh catalogue (assets/js/medicines-bd.js), recent and most-used medicines first,
     সকাল / দুপুর / রাত or ৬ ঘণ্টা পর পর, before/after food with minutes, duration, note.
   - Pad sheet: header, C/C · O/E · Advice column, Name/Age/Sex/Weight, ℞ list, pain scale footer.
   - Invoice sheet: owner's invoice layout.
   Prototype only: fictional patients; medicine list is a sample to be verified (PD-032). */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  const BN = '০১২৩৪৫৬৭৮৯';
  const bn = (s) => String(s == null ? '' : s).replace(/\d/g, (d) => BN[d]);

  /* ----------------------------------------------------------- pad settings */
  const PAD_DEFAULTS = {
    brandBold: 'Physio', brandLight: 'point', tagline: 'A physiotherapy center built on Science, Care, and Calm',
    phone: '01623-005005', invoicePhone: '01911 076457', website: 'physiopoint.com.bd',
    hoursLabel: 'শনি-বৃহস্পতি:', hours: 'সকাল ১০:০০ - রাত ৮:০০',
    address: '৩১/৫ ক, ডাক্তারপাড়া (ছোট বয়রা), খুলনা', addressNote: '(খুলনা মেডিকেল কলেজ গেটের অপরপাশে)',
  };
  const pad = () => Object.assign({}, PAD_DEFAULTS, (PP.db && PP.db.settings && PP.db.settings.pad) || {});

  const FAN = `<svg class="rxpad-fan" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(30 40)">${[-100, -76, -52, -28, -4, 20].map((a, i) => `<rect x="-3.2" y="-30" width="6.4" height="18" rx="3.2" fill="${['#0b6b3a', '#11804a', '#159a57', '#1fb064', '#3cc47a', '#63d394'][i]}" transform="rotate(${a})"/>`).join('')}</g><path d="M22 44 L38 44 L26 60 Z" fill="#9ad26a"/></svg>`;
  const brandHtml = (p) => `${PP.db.settings.logoImage ? `<img class="rxpad-logo-img" src="${esc(PP.db.settings.logoImage)}" alt="">` : FAN}<span class="rxpad-brand"><b>${esc(p.brandBold)}</b>${esc(p.brandLight)}</span>`;

  /* -------------------------------------------------------- medicine usage */
  PP.registerSeed('rxpad', (db) => {
    db.medicineUsage = db.medicineUsage || {};
    const T = PP.today();
    [['Napa', 38, 0], ['Etorix', 24, 1], ['Seclo', 30, 0], ['Flexi', 19, 2], ['Neuro-B', 22, 1], ['Calbo-D', 17, 3], ['Maxpro', 14, 2], ['Clofenac', 12, 5], ['Pregabalin', 9, 4], ['Tolperisone', 8, 6], ['Vitamin D3', 7, 7]]
      .forEach(([brand, count, ago]) => { const m = PP.MEDICINES.find((x) => x.brand === brand); if (m) db.medicineUsage[m.id] = { count, last: PP.addDays(T, -ago) + 'T10:00:00' }; });
    db.settings.pad = Object.assign({}, PAD_DEFAULTS, db.settings.pad || {});
  });
  const usage = () => (PP.db.medicineUsage = PP.db.medicineUsage || {});
  function bump(id) { const u = usage(); const r = u[id] || { count: 0, last: null }; r.count += 1; r.last = PP.nowStamp(); u[id] = r; }

  /* --------------------------------------------------------- dose wording */
  const TIMES = [['morning', 'সকাল'], ['noon', 'দুপুর'], ['night', 'রাত']];
  const QTY = ['১', '½', '১½', '২', '৩'];
  const UNITS = ['টি', 'চামচ', 'ফোঁটা', 'বার লাগাবেন', 'পাফ', 'ইনজেকশন'];
  const unitFor = (form) => (/syrup|suspension/i.test(form) ? 'চামচ' : /drop/i.test(form) ? 'ফোঁটা' : /gel|cream|ointment|patch/i.test(form) ? 'বার লাগাবেন' : /inhaler/i.test(form) ? 'পাফ' : /inj/i.test(form) ? 'ইনজেকশন' : 'টি');

  PP.rxPad = PP.rxPad || {};
  /** Bangla instruction line for one medicine, e.g. "১ + ০ + ১ · খাবারের ৩০ মিনিট পরে · ৭ দিন". */
  PP.rxPad.doseLine = function (m) {
    if (!m.medId && !m.morning && !m.noon && !m.night && !m.q6h && (m.frequency || m.dose)) {
      return [m.dose, m.frequency, m.duration].filter(Boolean).map(esc).join(' · '); // older free-text items
    }
    const q = m.qty || '১';
    const pattern = m.q6h ? `৬ ঘণ্টা পর পর (দিনে ৪ বার) · ${q} ${m.unit || 'টি'} করে` : `${TIMES.map(([k]) => (m[k] ? q : '০')).join(' + ')}${m.unit && m.unit !== 'টি' ? ` (${m.unit})` : ''}`;
    const food = m.food === 'before' ? `খাবারের ${m.foodMin ? bn(m.foodMin) + ' মিনিট ' : ''}আগে` : m.food === 'after' ? `খাবারের ${m.foodMin ? bn(m.foodMin) + ' মিনিট ' : ''}পরে` : '';
    const dur = m.durUnit === 'চলবে' ? 'চলবে' : m.durN ? `${bn(m.durN)} ${m.durUnit || 'দিন'}` : '';
    return [pattern, food, dur, m.note].filter(Boolean).map(esc).join(' · ');
  };
  const medTitle = (m) => `${esc(m.form ? m.form + '. ' : '')}<b>${esc(m.brand || m.name)}</b>${m.strength ? ` ${esc(m.strength)}` : ''}`;

  /* ------------------------------------------------------- medicine picker */
  /**
   * Renders the medicine picker into `host`, editing the `meds` array in place.
   * opts: { readOnly }
   */
  PP.rxPad.picker = function (host, meds, opts) {
    const ro = !!(opts && opts.readOnly);
    const st = { q: '', sel: null, editIndex: -1, draft: null };

    function sortByUse(list) {
      const u = usage();
      return list.slice().sort((a, b) => ((u[b.id] || {}).count || 0) - ((u[a.id] || {}).count || 0) || a.brand.localeCompare(b.brand));
    }
    function recent() { const u = usage(); return PP.MEDICINES.filter((m) => u[m.id] && u[m.id].last).sort((a, b) => u[b.id].last.localeCompare(u[a.id].last)).slice(0, 8); }
    function most() { const u = usage(); return PP.MEDICINES.filter((m) => u[m.id] && u[m.id].count).sort((a, b) => u[b.id].count - u[a.id].count).slice(0, 8); }
    function search(q) {
      const s = q.toLowerCase();
      return sortByUse(PP.MEDICINES.filter((m) => `${m.brand} ${m.generic} ${m.company} ${m.form}`.toLowerCase().includes(s))).slice(0, 14);
    }
    const chip = (m) => `<button type="button" class="rxp-chip" data-pick="${m.id}" title="${esc(m.generic)}${m.company ? ' · ' + esc(m.company) : ''}">${medTitle(m)}</button>`;

    function newDraft(m) {
      return { medId: m.id, brand: m.brand, generic: m.generic, strength: m.strength, form: m.form, company: m.company, name: PP.medLabel(m),
        morning: true, noon: false, night: true, q6h: false, qty: '১', unit: unitFor(m.form), food: 'after', foodMin: 0, durN: 7, durUnit: 'দিন', note: '' };
    }
    function draw() {
      host.innerHTML = `<div class="rxp">
        ${ro ? '' : `<div class="rxp-search"><div class="input-icon grow">${PP.icon('search')}<input class="input" data-q placeholder="ওষুধ খুঁজুন — brand বা generic নাম (যেমন Napa, Paracetamol)" value="${esc(st.q)}" aria-label="Search medicine" autocomplete="off"></div>
          <button type="button" class="btn" data-custom>${PP.icon('plus')} তালিকায় নেই? নিজে লিখুন</button></div>
        <div class="rxp-suggest" data-suggest></div>
        <div data-panel></div>`}
        <ol class="rxp-list">${meds.map((m, i) => `<li class="${st.editIndex === i ? 'editing' : ''}"><div class="grow"><div>${medTitle(m)} ${m.generic ? `<span class="muted small">(${esc(m.generic)})</span>` : ''}</div><div class="rxp-line">${PP.rxPad.doseLine(m)}</div></div>
          ${ro ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-edit="${i}">${PP.icon('edit')} বদলান</button><button type="button" class="btn btn-ghost btn-sm btn-icon" data-rm="${i}" aria-label="Remove">${PP.icon('trash')}</button>`}</li>`).join('')}</ol>
        ${meds.length ? '' : `<div class="rxp-empty muted small">${ro ? 'কোনো ওষুধ নেই।' : 'এখনো কোনো ওষুধ যোগ করা হয়নি। উপরে খুঁজে বা নিচের সাম্প্রতিক / বেশি ব্যবহৃত তালিকা থেকে বেছে নিন।'}</div>`}
        <div class="rxp-foot small muted">${PP.icon('info', 'style="width:14px;height:14px;vertical-align:-2px"')} প্রোটোটাইপের নমুনা তালিকা (${bn(PP.MEDICINES.length)}টি ওষুধ)। আসল সিস্টেমে DGDA-নিবন্ধিত সব ওষুধের তালিকা থাকবে (PD-032)।</div>
      </div>`;
      if (ro) return;
      drawSuggest(); drawPanel();
      const qi = PP.$('[data-q]', host);
      qi.addEventListener('input', () => { st.q = qi.value; drawSuggest(); });
      qi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = PP.$('[data-pick]', host); if (first) first.click(); } });
      PP.$('[data-custom]', host).addEventListener('click', () => {
        st.sel = null; st.editIndex = -1;
        st.draft = { medId: null, brand: st.q || '', generic: '', strength: '', form: 'Tab', company: '', name: st.q || '', morning: true, noon: false, night: true, q6h: false, qty: '১', unit: 'টি', food: 'after', foodMin: 0, durN: 7, durUnit: 'দিন', note: '', custom: true };
        drawPanel(); const n = PP.$('[data-d="brand"]', host); if (n) n.focus();
      });
      PP.$$('[data-edit]', host).forEach((b) => b.addEventListener('click', () => { st.editIndex = Number(b.dataset.edit); st.draft = PP.clone(meds[st.editIndex]); draw(); }));
      PP.$$('[data-rm]', host).forEach((b) => b.addEventListener('click', () => { meds.splice(Number(b.dataset.rm), 1); st.editIndex = -1; st.draft = null; draw(); }));
    }
    function drawSuggest() {
      const box = PP.$('[data-suggest]', host); if (!box) return;
      if (st.q.trim().length >= 1) {
        const hits = search(st.q.trim());
        box.innerHTML = hits.length ? `<div class="rxp-results">${hits.map((m) => { const u = usage()[m.id]; return `<button type="button" class="rxp-row" data-pick="${m.id}"><span>${medTitle(m)} <span class="muted small">${esc(m.generic)}</span></span><span class="small muted">${esc(m.company || '')}${u && u.count ? ` · ${bn(u.count)} বার` : ''}</span></button>`; }).join('')}</div>`
          : `<div class="rxp-empty small muted">“${esc(st.q)}” পাওয়া যায়নি। “তালিকায় নেই? নিজে লিখুন” চাপুন।</div>`;
      } else {
        const r = recent(); const mo = most();
        box.innerHTML = `${r.length ? `<div class="rxp-group"><div class="rxp-glabel">${PP.icon('clock', 'style="width:14px;height:14px;vertical-align:-2px"')} সাম্প্রতিক ব্যবহৃত</div><div class="rxp-chips">${r.map(chip).join('')}</div></div>` : ''}
          ${mo.length ? `<div class="rxp-group"><div class="rxp-glabel">${PP.icon('star', 'style="width:14px;height:14px;vertical-align:-2px"')} সবচেয়ে বেশি ব্যবহৃত</div><div class="rxp-chips">${mo.map(chip).join('')}</div></div>` : ''}`;
      }
      PP.$$('[data-pick]', box).forEach((b) => b.addEventListener('click', () => {
        const m = PP.MEDICINES.find((x) => x.id === b.dataset.pick); st.editIndex = -1; st.draft = newDraft(m); st.q = ''; draw();
        const add = PP.$('[data-add]', host); if (add) add.focus();
      }));
    }
    function drawPanel() {
      const box = PP.$('[data-panel]', host); if (!box) return;
      const d = st.draft; if (!d) { box.innerHTML = ''; return; }
      const any = d.q6h || d.morning || d.noon || d.night;
      box.innerHTML = `<div class="rxp-panel">
        <div class="row between"><div>${d.custom ? `<input class="input" data-d="brand" placeholder="ওষুধের নাম ও শক্তি (যেমন Tab. Xyz 50 mg)" value="${esc(d.brand)}" aria-label="Medicine name" style="min-width:280px">` : `<div class="rxp-ptitle">${medTitle(d)}</div><div class="small muted">${esc(d.generic)}${d.company ? ` · ${esc(d.company)}` : ''}</div>`}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-cancel>${PP.icon('x')} বাতিল</button></div>
        <div class="rxp-grid">
          <fieldset class="rxp-fs"><legend>কখন খাবেন</legend>
            <div class="rxp-ticks">${TIMES.map(([k, l]) => `<label class="rxp-tick ${d[k] && !d.q6h ? 'on' : ''}"><input type="checkbox" data-t="${k}" ${d[k] ? 'checked' : ''} ${d.q6h ? 'disabled' : ''}> ${l}</label>`).join('')}
              <label class="rxp-tick q6 ${d.q6h ? 'on' : ''}"><input type="checkbox" data-t="q6h" ${d.q6h ? 'checked' : ''}> ৬ ঘণ্টা পর পর <span class="small">(দিনে ৪ বার)</span></label></div>
            <div class="row mt-2"><label class="small">প্রতিবার</label><select class="select rxp-sm" data-d="qty">${QTY.map((x) => `<option ${x === d.qty ? 'selected' : ''}>${x}</option>`).join('')}</select>
              <select class="select rxp-sm" data-d="unit">${UNITS.map((x) => `<option ${x === d.unit ? 'selected' : ''}>${x}</option>`).join('')}</select></div></fieldset>
          <fieldset class="rxp-fs"><legend>খাবারের সাথে</legend>
            <div class="rxp-ticks">${[['before', 'খাবারের আগে'], ['after', 'খাবারের পরে'], ['', 'যেকোনো সময়']].map(([v, l]) => `<label class="rxp-tick ${d.food === v ? 'on' : ''}"><input type="radio" name="rxp-food" data-food="${v}" ${d.food === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
            <div class="row mt-2 ${d.food ? '' : 'hidden'}"><label class="small">কত মিনিট ${d.food === 'before' ? 'আগে' : 'পরে'}</label><select class="select rxp-sm" data-d="foodMin">${[0, 10, 15, 30, 45, 60, 120].map((x) => `<option value="${x}" ${Number(d.foodMin) === x ? 'selected' : ''}>${x ? bn(x) + ' মিনিট' : 'ঠিক ' + (d.food === 'before' ? 'আগে' : 'পরে')}</option>`).join('')}</select></div></fieldset>
          <fieldset class="rxp-fs"><legend>কত দিন</legend>
            <div class="row"><input class="input rxp-sm" type="number" min="1" data-d="durN" value="${esc(d.durN)}" ${d.durUnit === 'চলবে' ? 'disabled' : ''} aria-label="Duration">
              <select class="select rxp-sm" data-d="durUnit">${['দিন', 'সপ্তাহ', 'মাস', 'চলবে'].map((x) => `<option ${x === d.durUnit ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
            <input class="input mt-2" data-d="note" placeholder="বিশেষ নির্দেশনা (যেমন: ব্যথা হলে)" value="${esc(d.note)}" aria-label="Instruction"></fieldset>
        </div>
        <div class="row between mt-3"><div class="rxp-preview">${any ? PP.rxPad.doseLine(d) : '<span class="muted">কখন খাবেন তা টিক দিন</span>'}</div>
          <button type="button" class="btn btn-primary" data-add ${any && (d.brand || '').trim() ? '' : 'disabled'}>${PP.icon('check')} ${st.editIndex >= 0 ? 'পরিবর্তন রাখুন' : 'তালিকায় যোগ করুন'}</button></div>
      </div>`;
      const sync = () => { drawPanel(); };
      PP.$$('[data-t]', box).forEach((c) => c.addEventListener('change', () => { d[c.dataset.t] = c.checked; if (c.dataset.t === 'q6h' && c.checked) { d.morning = d.noon = d.night = false; } sync(); }));
      PP.$$('[data-food]', box).forEach((r) => r.addEventListener('change', () => { d.food = r.dataset.food; sync(); }));
      PP.$$('[data-d]', box).forEach((i) => i.addEventListener(i.tagName === 'INPUT' && i.type !== 'number' ? 'input' : 'change', () => {
        const k = i.dataset.d; d[k] = i.type === 'number' ? Number(i.value) : i.value;
        if (k === 'brand') { d.name = d.brand; const add = PP.$('[data-add]', box); add.disabled = !(d.brand.trim() && (d.q6h || d.morning || d.noon || d.night)); PP.$('.rxp-preview', box).innerHTML = PP.rxPad.doseLine(d); return; }
        if (k === 'note') { PP.$('.rxp-preview', box).innerHTML = PP.rxPad.doseLine(d); return; }
        sync();
      }));
      PP.$('[data-cancel]', box).addEventListener('click', () => { st.draft = null; st.editIndex = -1; draw(); });
      PP.$('[data-add]', box).addEventListener('click', () => {
        const m = PP.clone(d);
        m.dose = `${m.qty} ${m.unit}`; m.frequency = m.q6h ? '৬ ঘণ্টা পর পর' : TIMES.map(([k]) => (m[k] ? m.qty : '০')).join('+');
        m.duration = m.durUnit === 'চলবে' ? 'চলবে' : `${bn(m.durN)} ${m.durUnit}`;
        if (st.editIndex >= 0) meds[st.editIndex] = m; else { meds.push(m); if (m.medId) bump(m.medId); }
        st.draft = null; st.editIndex = -1; PP.save(); draw();
        PP.ui.toast(`${esc(m.brand || m.name)} তালিকায় যোগ হয়েছে`);
      });
    }
    draw();
  };

  /* ------------------------------------------------------------ pain scale */
  const FACES = [
    ['#5b9bd5', 'ব্যথা নেই', 'M22 38 Q32 48 42 38'], ['#3dbb98', 'মৃদু ব্যথা', 'M23 39 Q32 45 41 39'], ['#8cc63f', 'মাঝারি ব্যথা', 'M23 41 L41 41'],
    ['#f6c445', 'তীব্র ব্যথা', 'M23 43 Q32 38 41 43'], ['#f28c28', 'খুব তীব্র ব্যথা', 'M22 44 Q32 35 42 44'], ['#e5505b', 'সবচেয়ে খারাপ ব্যথা', 'M22 45 Q32 33 42 45'],
  ];
  const faceSvg = ([c, , mouth], i) => `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${c}"/>${i === 5 ? '<path d="M18 22 l8 5 l-8 5 M46 22 l-8 5 l8 5" stroke="#3a1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>' : `<circle cx="23" cy="26" r="3.4" fill="#21303a"/><circle cx="41" cy="26" r="3.4" fill="#21303a"/>`}<path d="${mouth}" stroke="#21303a" stroke-width="3.4" fill="${i === 0 ? '#fff' : 'none'}" stroke-linecap="round"/></svg>`;
  PP.rxPad.painScale = function (score) {
    const s = score === '' || score == null ? null : Number(score);
    const fi = s == null ? -1 : Math.min(5, Math.floor((s + 0.0001) / 2));
    return `<div class="rxpad-pain"><div class="rxpad-faces">${FACES.map((f, i) => `<div class="rxpad-face ${i === fi ? 'on' : ''}">${faceSvg(f, i)}<span>${f[1]}</span></div>`).join('')}</div>
      <div class="rxpad-scale"><div class="rxpad-nums">${Array.from({ length: 11 }, (_, i) => `<span class="${s === i ? 'on' : ''}">${i}</span>`).join('')}</div><div class="rxpad-bar">${s != null ? `<i style="left:${s * 10}%"></i>` : ''}</div></div></div>`;
  };

  /* -------------------------------------------------- editor: pad details */
  PP.rxPad.detailsCard = function (rx, canEdit) {
    const F = PP.form.field; const dis = !canEdit;
    return PP.ui.card({ title: 'প্যাডের তথ্য (C/C · O/E · Advice)', body: `<div class="form-grid">
      ${F({ name: 'cc', label: 'C/C — রোগীর প্রধান সমস্যা', type: 'textarea', rows: 3, value: rx.cc || '', disabled: dis, placeholder: 'যেমন: ডান হাঁটুতে ব্যথা ৩ সপ্তাহ' })}
      ${F({ name: 'oe', label: 'O/E — পরীক্ষায় যা পাওয়া গেছে', type: 'textarea', rows: 3, value: rx.oe || '', disabled: dis, placeholder: 'যেমন: ROM কম, tenderness +' })}
      ${F({ name: 'advice', label: 'Advice — পরামর্শ', type: 'textarea', rows: 3, value: rx.advice || '', disabled: dis, placeholder: 'যেমন: ভারী জিনিস তুলবেন না, গরম সেঁক দিন' })}
      ${F({ name: 'investigations', label: 'পরীক্ষা (Investigations)', type: 'textarea', rows: 3, value: rx.investigations || '', disabled: dis, placeholder: 'যেমন: X-ray Rt. knee AP/Lat, CBC' })}
      ${F({ name: 'patientNote', label: 'রোগীর জন্য নোট', type: 'textarea', rows: 2, value: rx.patientNote || '', disabled: dis, full: true, placeholder: 'প্যাডে রোগীর জন্য যা লেখা থাকবে' })}
      ${F({ name: 'weight', label: 'ওজন (কেজি)', type: 'number', min: 0, step: 0.1, value: rx.weight || '', disabled: dis })}
      <div class="field"><label for="rx-pain">ব্যথার মাত্রা (০–১০)</label><div class="row"><input id="rx-pain" class="range grow" type="range" min="0" max="10" name="painScore" value="${esc(rx.painScore == null ? 0 : rx.painScore)}" ${dis ? 'disabled' : ''}><b data-painval>${esc(rx.painScore == null ? 0 : rx.painScore)}</b></div></div>
      <div class="full" data-painpreview>${PP.rxPad.painScale(rx.painScore == null ? 0 : rx.painScore)}</div>
    </div>` });
  };
  PP.rxPad.bindDetails = function (root) {
    const r = PP.$('[name="painScore"]', root); if (!r) return;
    r.addEventListener('input', () => { PP.$('[data-painval]', root).textContent = r.value; PP.$('[data-painpreview]', root).innerHTML = PP.rxPad.painScale(r.value); });
  };

  /* ------------------------------------------------------- the pad sheet */
  PP.rxPad.sheet = function (rx) {
    const p = pad(); const pt = PP.find.patient(rx.patientId) || { name: '—' }; const pro = PP.find.professional(rx.professionalId);
    const box = (label, html) => `<section class="rxpad-box"><div class="rxpad-label">${label}</div><div class="rxpad-boxin">${html || ''}</div></section>`;
    const nl = (t) => esc(t || '').replace(/\n/g, '<br>');
    const ex = (rx.items || []).map((it) => { const e = PP.find.exercise(it.exerciseId) || {}; return `<li><b>${esc(e.name || it.exerciseId)}</b> — ${esc(it.sets)} সেট × ${esc(it.reps)} বার, ${esc(it.frequency || 'প্রতিদিন')}</li>`; }).join('');
    return `<article class="pp-rx-sheet rxpad-sheet ${rx.status !== 'Issued' ? 'is-draft' : ''}" aria-label="Prescription ${esc(rx.id || '')}">
      <header class="rxpad-head"><div class="rxpad-logo">${brandHtml(p)}</div>
        <div class="rxpad-contact"><div class="mono">${esc(p.phone)}</div><div class="mono">${esc(p.website)}</div>
          <div><b>${esc(p.hoursLabel)}</b><br>${esc(p.hours)}</div><div>${esc(p.address)}<br>${esc(p.addressNote)}</div></div></header>
      <div class="rxpad-body">
        <aside class="rxpad-left">${box('C/C:', nl(rx.cc || rx.condition))}${box('O/E:', nl(rx.oe || rx.assessment))}${box('Advice:', nl(rx.advice))}</aside>
        <main class="rxpad-right">
          <div class="rxpad-fields"><span class="w2"><i>Name:</i><b>${esc(pt.name)}</b></span><span><i>Date:</i><b>${esc(PP.fmt.date(rx.date))}</b></span>
            <span><i>Age:</i><b>${pt.dob ? esc(PP.fmt.age(pt.dob)) : ''}</b></span><span><i>Sex:</i><b>${esc(pt.gender || '')}</b></span><span><i>Weight:</i><b>${rx.weight ? esc(rx.weight) + ' kg' : ''}</b></span></div>
          <div class="rxpad-rx"><div class="rxpad-symbol">℞</div>
            ${(rx.medications || []).length ? `<ol class="rxpad-meds">${rx.medications.map((m) => `<li><div>${medTitle(m)}</div><div class="rxpad-dose">${PP.rxPad.doseLine(m)}</div></li>`).join('')}</ol>` : ''}
            ${ex ? `<div class="rxpad-sub">ব্যায়াম</div><ul class="rxpad-ex">${ex}</ul>` : ''}
            ${rx.plan ? `<div class="rxpad-sub">চিকিৎসা পরিকল্পনা</div><p>${nl(rx.plan)}${rx.frequency ? ` <span class="muted">(${esc(rx.frequency)})</span>` : ''}</p>` : ''}
            ${rx.investigations ? `<div class="rxpad-sub">পরীক্ষা</div><p>${nl(rx.investigations)}</p>` : ''}
            ${rx.patientNote ? `<div class="rxpad-sub">রোগীর জন্য নোট</div><p>${nl(rx.patientNote)}</p>` : ''}
            ${rx.followUp ? `<div class="rxpad-follow">পরবর্তী সাক্ষাৎ: <b>${esc(PP.fmt.date(rx.followUp))}</b></div>` : ''}
            <div class="rxpad-sign"><div class="rxpad-sigline"></div><b>${esc(PP.proName(pro))}</b>${pro ? `<div>${esc(pro.qualification || pro.designation || '')}</div><div>Reg. ${esc(pro.registrationNo || '')}</div>` : ''}</div>
          </div>
        </main>
      </div>
      <footer>${PP.rxPad.painScale(rx.painScore)}</footer>
      <div class="rxpad-ref mono">${esc(rx.id || '')}${rx.version ? ` · v${esc(rx.version)}` : ''}</div>
    </article>`;
  };

  /* ------------------------------------------------ pad settings (modal) */
  PP.rxPad.editSettings = function (after) {
    const p = pad(); const F = PP.form.field;
    PP.ui.modal({ title: 'প্যাড ও ইনভয়েসের তথ্য', size: 'lg', body: `<form class="form-grid" onsubmit="return false">
      ${F({ name: 'brandBold', label: 'নাম (মোটা অংশ)', value: p.brandBold })}${F({ name: 'brandLight', label: 'নাম (হালকা অংশ)', value: p.brandLight })}
      ${F({ name: 'phone', label: 'প্রেসক্রিপশনের ফোন', value: p.phone })}${F({ name: 'invoicePhone', label: 'ইনভয়েসের ফোন', value: p.invoicePhone })}
      ${F({ name: 'website', label: 'ওয়েবসাইট', value: p.website })}${F({ name: 'tagline', label: 'ইনভয়েসের ট্যাগলাইন', value: p.tagline })}
      ${F({ name: 'hoursLabel', label: 'খোলার দিন', value: p.hoursLabel })}${F({ name: 'hours', label: 'সময়', value: p.hours })}
      ${F({ name: 'address', label: 'ঠিকানা', value: p.address, full: true })}${F({ name: 'addressNote', label: 'ঠিকানার নিচের লাইন', value: p.addressNote, full: true })}
      </form><p class="small muted">লোগো বদলাতে Settings → Branding-এ লোগো আপলোড করুন।</p>`,
      buttons: [{ label: 'বাতিল', kind: 'ghost' }, { label: 'সংরক্ষণ', kind: 'primary', onClick: ({ body }) => { PP.db.settings.pad = Object.assign(pad(), PP.form.read(PP.$('form', body))); PP.audit('Prescription pad details changed', 'settings'); PP.save(); PP.ui.toast('প্যাডের তথ্য সংরক্ষিত'); if (after) after(); } }] });
  };

  /* ------------------------------------------------------- invoice sheet */
  PP.rxPad.invoiceSheet = function (inv) {
    const p = pad(); const t = PP.bill.totals(inv); const pat = PP.find.patient(inv.patientId) || {};
    const m = (n) => PP.fmt.money(n);
    return `<article class="invpad-sheet">
      <header class="invpad-head"><div><div class="rxpad-logo">${brandHtml(p)}</div><div class="invpad-tag">${esc(p.tagline)}</div></div>
        <div class="invpad-title"><h1>Invoice</h1><div><i>Date:</i><b>${esc(PP.fmt.date(inv.date))}</b></div><div class="small mono">${esc(inv.id)}</div></div></header>
      <section class="invpad-bill"><h3>Billed to:</h3>
        <div><i>Name:</i><b>${esc(pat.name || '—')} <span class="muted">(${esc(pat.id || '')})</span></b></div><div><i>Phone:</i><b>${esc(pat.mobile || '')}</b></div><div><i>Address:</i><b>${esc(pat.address || '')}</b></div></section>
      <table class="invpad-table"><thead><tr><th>Services</th><th>Sessions</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>
        ${inv.lines.map((l) => `<tr><td>${esc(l.description || PP.serviceName(l.serviceId))}</td><td>${esc(l.qty)}</td><td>${m(l.unitPrice)}</td><td>${m(PP.bill.lineTotal(l))}</td></tr>`).join('')}</tbody></table>
      <dl class="invpad-totals"><dt>SubTotal</dt><dd>${m(t.gross)}</dd><dt>Discount</dt><dd>${m(t.discount)}</dd><dt class="b">Total</dt><dd class="b">${m(t.payable)}</dd><dt>Paid</dt><dd>${m(t.net)}</dd><dt class="b">Due</dt><dd class="b">${m(t.due)}</dd></dl>
      <footer class="invpad-foot"><div class="invpad-mark">${FAN}</div><span class="mono">${esc(p.invoicePhone)}</span><span>${esc(p.address)}<br>${esc(p.addressNote)}</span><span><b>${esc(p.hoursLabel)}</b><br>${esc(p.hours)}</span><span class="mono">${esc(p.website)}</span></footer>
    </article>`;
  };
})();
