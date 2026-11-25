/* Vendor sign-in for the Super Admin console. Two-step code is MANDATORY for every vendor account.
   Prototype only: any non-empty password works and any 6-digit code except 000000 works. No real authentication. */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  PP.load(); PP.applyBranding();
  const root = PP.$('#page');

  const brand = `<aside class="auth-brand">
    <div class="brand"><div class="logo">${PP.logoSvg}</div><div><div class="name">Physio Point</div><div class="tag">Super Admin · control plane</div><span class="sa-vendor-chip">Vendor console</span></div></div>
    <div><h2>Vendor console</h2><p class="mt-2">Onboarding, licences, entitlements, releases and support for every customer deployment.</p></div>
    <ul><li>${PP.icon('lock')} Two-step sign-in for every vendor account</li><li>${PP.icon('shield')} Every change is audited</li><li>${PP.icon('heart')} No patient data in the control plane</li></ul>
    <div class="auth-art" aria-hidden="true"><svg viewBox="0 0 360 200" fill="none" stroke="#b4b1ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="40" y="40" width="120" height="80" rx="10"/><rect x="200" y="40" width="120" height="80" rx="10"/><rect x="120" y="140" width="120" height="44" rx="10"/><path d="M100 120v20h40M260 120v20h-40"/><path d="M70 64h60M70 84h40M230 64h60M230 84h40"/></svg></div>
  </aside>`;
  const shell = (inner) => { root.innerHTML = `<div class="auth-page">${brand}<main class="auth-main"><div class="auth-card narrow">${inner}</div></main></div>`; };

  function renderLogin(prefill) {
    shell(`<h1>Vendor sign-in</h1><p class="lead">For Physio Point staff only. Customers sign in on their own domain.</p>
      <form class="stack" novalidate data-form>
        ${PP.form.field({ name: 'email', label: 'Work email', type: 'email', required: true, rule: 'email', value: prefill || '', placeholder: 'name@vendor.example', attrs: 'autocomplete="username"' })}
        ${PP.form.field({ name: 'password', label: 'Password', type: 'password', required: true, placeholder: '••••••••••', attrs: 'autocomplete="current-password"' })}
        <div class="row between"><span class="small muted">${PP.icon('lock', 'style="width:14px;vertical-align:-2px"')} A two-step code is always required</span><a href="#" class="small" data-forgot>Forgot password?</a></div>
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>${PP.icon('lock')} Continue</button>
      </form>
      <div class="demo-accounts"><div class="small muted"><b>Prototype:</b> pick a vendor staff account (any password works). Roles are a proposal (PD-033).</div>
        ${PP.db.users.map((u) => `<button class="btn btn-sm" data-demo="${esc(u.email)}" type="button"><span>${esc(u.name)}</span><span class="small muted">${esc((PP.db.roles.find((r) => r.id === u.role) || {}).name || u.role)}${u.status !== 'Active' ? ' · disabled' : ''}</span></button>`).join('')}
      </div>`);
    const form = PP.$('[data-form]', root);
    PP.$$('[data-demo]', root).forEach((b) => b.addEventListener('click', () => { PP.$('[name=email]', form).value = b.dataset.demo; PP.$('[name=password]', form).value = 'demo-password'; PP.$('[data-submit]', form).focus(); }));
    PP.$('[data-forgot]', root).addEventListener('click', (e) => { e.preventDefault(); renderForgot(PP.$('[name=email]', form).value); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(form)) return;
      const v = PP.form.read(form); const msg = PP.$('[data-msg]', form);
      await PP.ui.busy(PP.$('[data-submit]', form), async () => {
        const u = PP.db.users.find((x) => x.email.toLowerCase() === v.email.toLowerCase());
        if (!u) { msg.innerHTML = PP.ui.alert('error', 'Email or password is incorrect.'); return; }
        if (u.status !== 'Active') { msg.innerHTML = PP.ui.alert('error', 'This vendor account is disabled. Ask the owner to re-enable it.'); return; }
        renderCode(u);
      }, 600);
    });
  }

  function renderCode(u) {
    shell(`<h1>Two-step verification</h1><p class="lead">Enter the 6-digit code from your authenticator app, or the code sent to ${esc(u.mobile.replace(/\d(?=\d{3})/g, '•'))}.</p>
      <form class="stack" novalidate data-form>
        <div class="otp" role="group" aria-label="Verification code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Digit ${i + 1}" data-d="${i}">`).join('')}</div>
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>Verify and sign in</button>
        <div class="row between small"><a href="#" data-back>${PP.icon('chevL', 'style="width:14px;height:14px;vertical-align:-2px"')} Back</a><button type="button" class="btn btn-ghost btn-sm" data-resend disabled>Resend code in <span data-t>30</span>s</button></div>
        <p class="small muted" style="text-align:center;margin:0">Prototype: any 6 digits work (e.g. 123456); 000000 shows the error state. This step cannot be skipped for vendor accounts.</p>
      </form>`);
    const form = PP.$('[data-form]', root); const digits = PP.$$('[data-d]', form);
    digits[0].focus();
    digits.forEach((d, i) => {
      d.addEventListener('input', () => {
        const t = d.value.replace(/\D/g, '');
        if (t.length > 1) { t.slice(0, 6 - i).split('').forEach((c, k) => { digits[i + k].value = c; }); digits[Math.min(5, i + t.length)].focus(); return; } // typed fast or autofilled
        d.value = t; if (d.value && digits[i + 1]) digits[i + 1].focus();
      });
      d.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !d.value && digits[i - 1]) digits[i - 1].focus(); });
      d.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((c, k) => { digits[k].value = c; }); digits[Math.min(5, t.length)].focus(); } });
    });
    let left = 30; const tEl = PP.$('[data-t]', form); const resend = PP.$('[data-resend]', form);
    const timer = setInterval(() => { left--; if (tEl) tEl.textContent = left; if (left <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend code'; } }, 1000);
    resend.addEventListener('click', () => { PP.ui.toast('A new code was sent (simulated).', 'info'); resend.disabled = true; });
    PP.$('[data-back]', form).addEventListener('click', (e) => { e.preventDefault(); clearInterval(timer); renderLogin(u.email); });
    let attempts = 0;
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const code = digits.map((d) => d.value).join('');
      const msg = PP.$('[data-msg]', form);
      if (code.length !== 6) { msg.innerHTML = PP.ui.alert('error', 'Enter all 6 digits.'); return; }
      if (code === '000000') { attempts++; msg.innerHTML = PP.ui.alert('error', `That code is not valid. ${attempts >= 3 ? 'Too many attempts: wait 30 seconds (simulated lockout).' : 'Try again.'}`); digits.forEach((d) => { d.value = ''; }); digits[0].focus(); return; }
      await PP.ui.busy(PP.$('[data-submit]', form), async () => { clearInterval(timer); finish(u); }, 600);
    });
  }

  function renderForgot(email) {
    shell(`<h1>Reset your password</h1><p class="lead">Vendor passwords are reset by the account owner. If the account exists, a reset link is sent to the work email.</p>
      <form class="stack" novalidate data-form>
        ${PP.form.field({ name: 'email', label: 'Work email', type: 'email', required: true, rule: 'email', value: email || '' })}
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>Send reset link</button>
        <a href="#" class="small" data-back style="text-align:center">Back to sign in</a>
      </form>`);
    const form = PP.$('[data-form]', root);
    PP.$('[data-back]', form).addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(form)) return;
      await PP.ui.busy(PP.$('[data-submit]', form), async () => { PP.$('[data-msg]', form).innerHTML = PP.ui.alert('positive', 'If an account exists for this email, a reset link has been sent (simulated). Two-step verification stays on after the reset.'); }, 700);
    });
  }

  function finish(u) {
    PP.db.session.userId = u.id; PP.db.session.mfaAt = PP.nowStamp(); u.lastLogin = PP.nowStamp();
    PP.audit('Signed in', u.id, `${u.email} · two-step verified`); PP.save();
    location.href = 'app.html#/dashboard';
  }

  renderLogin();
})();
