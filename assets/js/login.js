/* Staff sign-in — blueprint screen 03 + gap-analysis auth features (password reset, two-step login).
   Prototype only: any non-empty password works; any 6-digit code works. No real authentication. */
(function () {
  'use strict';
  const PP = window.PP; const esc = PP.esc;
  PP.load(); PP.applyBranding();
  const s = PP.db.settings; const root = PP.$('#page');
  let pendingUser = null;

  const brand = `<aside class="auth-brand">
    <div class="brand"><div class="logo">${s.logoImage ? `<img src="${esc(s.logoImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : PP.logoSvg}</div><div><div class="name">${esc(s.clinicName)}</div><div class="tag">${esc(s.tagline)}</div></div></div>
    <div><h2>Your clinic workspace</h2><p class="mt-2">Appointments, patients, clinical records and collections in one place.</p></div>
    <ul><li>${PP.icon('shield')} Role-based access</li><li>${PP.icon('lock')} Two-step sign-in for admins</li><li>${PP.icon('activity')} Every sensitive change is audited</li></ul>
    <div class="auth-art" aria-hidden="true"><svg viewBox="0 0 360 200" fill="none" stroke="#9fd8d3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="70" y="40" width="220" height="130" rx="12"/><path d="M70 72h220M100 100h80M100 124h120M100 148h60"/><circle cx="250" cy="125" r="22"/><path d="M240 125l7 7 13-14"/></svg></div>
  </aside>`;
  const shell = (inner) => { root.innerHTML = `<div class="auth-page">${brand}<main class="auth-main"><div class="auth-card narrow">${inner}</div></main></div>`; };

  function renderLogin(prefill) {
    shell(`<h1>Welcome back</h1><p class="lead">Sign in to your clinic workspace</p>
      <form class="stack" novalidate data-form>
        ${PP.form.field({ name: 'email', label: 'Email', type: 'email', required: true, rule: 'email', value: prefill || '', placeholder: 'admin@clinic.example', attrs: 'autocomplete="username"' })}
        ${PP.form.field({ name: 'password', label: 'Password', type: 'password', required: true, placeholder: '••••••••••', attrs: 'autocomplete="current-password"' })}
        <div class="row between"><label class="check small"><input type="checkbox" name="remember" checked> Keep me signed in</label><a href="#" class="small" data-forgot>Forgot password?</a></div>
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>${PP.icon('lock')} Secure sign in</button>
        <p class="small muted" style="text-align:center;margin:0">Role-based access · Password reset is managed by your clinic admin</p>
      </form>
      <div class="demo-accounts"><div class="small muted"><b>Prototype:</b> pick a demo account (any password works).</div>
        ${PP.db.users.map((u) => `<button class="btn btn-sm" data-demo="${u.email}" type="button"><span>${esc(u.name)}</span><span class="small muted">${esc((PP.db.roles.find((r) => r.id === u.role) || {}).name || u.role)}${u.status !== 'Active' ? ' · disabled' : ''}${u.mfa ? ' · 2-step' : ''}</span></button>`).join('')}
      </div>`);
    const form = PP.$('[data-form]', root);
    PP.$$('[data-demo]', root).forEach((b) => b.addEventListener('click', () => { PP.$('[name=email]', form).value = b.dataset.demo; PP.$('[name=password]', form).value = 'demo-password'; PP.$('[name=password]', form).focus(); }));
    PP.$('[data-forgot]', root).addEventListener('click', (e) => { e.preventDefault(); renderForgot(PP.$('[name=email]', form).value); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(form)) return;
      const v = PP.form.read(form); const msg = PP.$('[data-msg]', form);
      await PP.ui.busy(PP.$('[data-submit]', form), async () => {
        const u = PP.db.users.find((x) => x.email.toLowerCase() === v.email.toLowerCase());
        if (!u) { msg.innerHTML = PP.ui.alert('error', 'Email or password is incorrect.'); return; }
        if (u.status !== 'Active') { msg.innerHTML = PP.ui.alert('error', 'This account is disabled. Contact your clinic admin.'); return; }
        pendingUser = u;
        if (u.mfa || (u.role === 'admin' && s.security && s.security.mfaForAdmins)) renderCode(u); else finish(u);
      }, 600);
    });
  }

  function renderCode(u) {
    shell(`<h1>Two-step verification</h1><p class="lead">Enter the 6-digit code sent to ${esc(u.mobile.replace(/\d(?=\d{3})/g, '•'))}.</p>
      <form class="stack" novalidate data-form>
        <div class="otp" role="group" aria-label="Verification code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="one-time-code" aria-label="Digit ${i + 1}" data-d="${i}">`).join('')}</div>
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>Verify and sign in</button>
        <div class="row between small"><a href="#" data-back>${PP.icon('chevL', 'style="width:14px;height:14px;vertical-align:-2px"')} Back</a><button type="button" class="btn btn-ghost btn-sm" data-resend disabled>Resend code in <span data-t>30</span>s</button></div>
        <p class="small muted" style="text-align:center;margin:0">Prototype: any 6 digits work, e.g. 123456.</p>
      </form>`);
    const form = PP.$('[data-form]', root); const digits = PP.$$('[data-d]', form);
    digits[0].focus();
    digits.forEach((d, i) => {
      d.addEventListener('input', () => {
        // Spread several digits (fast typing, SMS autofill, password managers) over the following boxes.
        const chars = d.value.replace(/\D/g, '').split(''); d.value = chars.shift() || '';
        let k = i + 1; while (chars.length && digits[k]) { digits[k].value = chars.shift(); k++; }
        if (d.value) digits[Math.min(5, k)].focus();
      });
      d.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !d.value && digits[i - 1]) digits[i - 1].focus(); });
      d.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((c, k) => { digits[k].value = c; }); digits[Math.min(5, t.length)].focus(); } });
    });
    let left = 30; const tEl = PP.$('[data-t]', form); const resend = PP.$('[data-resend]', form);
    const timer = setInterval(() => { left--; if (tEl) tEl.textContent = left; if (left <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend code'; } }, 1000);
    resend.addEventListener('click', () => { PP.ui.toast('A new code was sent (simulated).', 'info'); resend.disabled = true; });
    PP.$('[data-back]', form).addEventListener('click', (e) => { e.preventDefault(); clearInterval(timer); renderLogin(u.email); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const code = digits.map((d) => d.value).join('');
      if (code.length !== 6) { PP.$('[data-msg]', form).innerHTML = PP.ui.alert('error', 'Enter all 6 digits.'); return; }
      await PP.ui.busy(PP.$('[data-submit]', form), async () => { clearInterval(timer); finish(u); }, 600);
    });
  }

  function renderForgot(email) {
    shell(`<h1>Reset your password</h1><p class="lead">Enter your work email. If the account exists, we send a reset link. Your clinic admin can also reset it for you.</p>
      <form class="stack" novalidate data-form>
        ${PP.form.field({ name: 'email', label: 'Email', type: 'email', required: true, rule: 'email', value: email || '' })}
        <div data-msg></div>
        <button class="btn btn-primary" type="submit" style="width:100%;height:44px" data-submit>Send reset link</button>
        <a href="#" class="small" data-back style="text-align:center">Back to sign in</a>
      </form>`);
    const form = PP.$('[data-form]', root);
    PP.$('[data-back]', form).addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!PP.form.validate(form)) return;
      await PP.ui.busy(PP.$('[data-submit]', form), async () => {
        PP.$('[data-msg]', form).innerHTML = PP.ui.alert('positive', 'If an account exists for this email, a reset link has been sent (simulated). The same message is shown either way, so nobody can find out which emails are registered.');
      }, 700);
    });
  }

  function finish(u) {
    PP.db.session.userId = u.id; PP.db.session.branchId = 'ALL'; u.lastLogin = PP.nowStamp();
    PP.audit('Signed in', u.id, u.email); PP.save();
    location.href = 'app.html#/dashboard';
  }

  renderLogin();
})();
