import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { contact } from '../data/portfolioData.js';
import { api } from '../lib/api.js';

function Field({ id, label, error, children }) {
  return (
    <div className={`cfield ${error ? 'cfield--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-err`} className="cfield__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

// Reads "#verify=<base64url(email:code)>" from the email link, then removes it from the URL.
function readVerifyLink() {
  const m = window.location.hash.match(/verify=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const raw = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const i = raw.lastIndexOf(':');
    const email = raw.slice(0, i);
    const code = raw.slice(i + 1);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return /^\d{6}$/.test(code) ? { email, code } : null;
  } catch {
    return null;
  }
}

export function VisitorVerify({ status, onSignedIn }) {
  const [mode, setMode] = useState('login'); // login | signup | verify | setup | forgot | reset
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '', code: '', website: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, message: '', tone: '' });
  const [devCode, setDevCode] = useState('');
  const codeRef = useRef(null);
  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  const setModeClean = (next) => { setMode(next); setErrors({}); setState({ busy: false, message: '', tone: '' }); setDevCode(''); };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim());
  const passwordField = (id, name, label, value, show, toggle, autocomplete) => (
    <Field id={id} label={label} error={errors[name]}>
      <div className="cpassword-row">
        <input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autocomplete} value={value} onChange={onChange} minLength={10} maxLength={200} required />
        <button type="button" className="cpassword-toggle" onClick={toggle} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </Field>
  );

  const requestCode = async (e) => {
    e?.preventDefault();
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Please enter your name.';
    if (!validEmail) found.email = 'Please enter a valid email.';
    if (Object.keys(found).length) { setErrors(found); return; }
    setErrors({}); setState({ busy: true, message: 'Sending verification code…', tone: '' });
    try {
      const data = await api('/api/chat/auth/request-verification', { method: 'POST', body: { name: values.name.trim(), email: values.email.trim(), website: values.website } });
      setDevCode(data.devCode || ''); setMode('verify');
      setState({ busy: false, message: data.emailSent ? `We emailed a 6-digit code to ${values.email.trim()}. Check your inbox and spam folder.` : data.message, tone: data.emailSent ? 'success' : 'warn' });
    } catch (err) { setErrors(err.data?.errors || {}); setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    const code = values.code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) { setErrors({ code: 'Enter the 6-digit code from your email.' }); return; }
    setErrors({}); setState({ busy: true, message: 'Verifying code…', tone: '' });
    try {
      const data = await api('/api/chat/auth/verify', { method: 'POST', body: { email: values.email.trim(), code } });
      if (data.requiresPasswordSetup) { setMode('setup'); setState({ busy: false, message: 'Email verified. Create a password for future sign-ins.', tone: 'success' }); }
      else if (data.token) onSignedIn(data.token);
      else { setMode('setup'); setState({ busy: false, message: 'Create a password to finish setting up your account.', tone: 'success' }); }
    } catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  const setPassword = async (e) => {
    e.preventDefault();
    if (values.password.length < 10) return setErrors({ password: 'Use at least 10 characters.' });
    if (values.password !== values.confirmPassword) return setErrors({ confirmPassword: 'Passwords do not match.' });
    setErrors({}); setState({ busy: true, message: 'Creating your account…', tone: '' });
    try {
      const data = await api('/api/chat/auth/set-password', { method: 'POST', body: { email: values.email.trim(), code: values.code.trim(), password: values.password } });
      onSignedIn(data.token);
    } catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  const login = async (e) => {
    e.preventDefault();
    if (!validEmail || !values.password) { setErrors({ email: validEmail ? '' : 'Please enter a valid email.', password: values.password ? '' : 'Enter your password.' }); return; }
    setErrors({}); setState({ busy: true, message: 'Signing in…', tone: '' });
    try { const data = await api('/api/chat/auth/login', { method: 'POST', body: { email: values.email.trim(), password: values.password } }); onSignedIn(data.token); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  const requestReset = async (e) => {
    e.preventDefault();
    if (!validEmail) { setErrors({ email: 'Please enter a valid email.' }); return; }
    setErrors({}); setState({ busy: true, message: 'Requesting reset code…', tone: '' });
    try { const data = await api('/api/chat/auth/request-reset', { method: 'POST', body: { email: values.email.trim() } }); setDevCode(data.devCode || ''); setMode('reset'); setState({ busy: false, message: data.message || 'If the account exists, a reset code has been sent.', tone: 'success' }); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(values.code.trim())) return setErrors({ code: 'Enter the 6-digit code.' });
    if (values.password.length < 10) return setErrors({ password: 'Use at least 10 characters.' });
    if (values.password !== values.confirmPassword) return setErrors({ confirmPassword: 'Passwords do not match.' });
    setErrors({}); setState({ busy: true, message: 'Resetting password…', tone: '' });
    try { const data = await api('/api/chat/auth/reset-password', { method: 'POST', body: { email: values.email.trim(), code: values.code.trim(), password: values.password } }); setModeClean('login'); setState({ busy: false, message: data.message, tone: 'success' }); setValues((v) => ({ ...v, password: '', confirmPassword: '', code: '' })); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };

  useEffect(() => { if (['verify', 'reset'].includes(mode)) codeRef.current?.focus(); }, [mode]);

  if (status && status.enabled === false) return (
    <div className="cgate__card" role="alert"><h1 className="cgate__title">Chat is unavailable right now</h1><p className="cgate__text">You can still reach me directly — I usually reply within 24 hours.</p><div className="cgate__actions"><a className="cbtn cbtn--primary" href={`mailto:${contact.email}`}><Icon name="mail" size={18} /> Email me</a><a className="cbtn cbtn--ghost" href="/#contact">Contact form</a></div></div>
  );

  const titles = { login: 'Welcome back', signup: 'Create your chat account', verify: 'Check your email', setup: 'Create a password', forgot: 'Forgot password?', reset: 'Reset your password' };
  const descriptions = {
    login: 'Sign in with the email and password you created after email verification.',
    signup: 'Verify your email once, then create a password for future visits.',
    verify: `Enter the 6-digit code sent to ${values.email.trim() || 'your email'}.`,
    setup: 'Your email is verified. Create a strong password to finish creating your account.',
    forgot: 'Enter your registered email. If an account exists, we will send a reset code.',
    reset: `Enter the reset code sent to ${values.email.trim()} and choose a new password.`
  };
  return <div className="cgate__card">
    <span className="cgate__icon" aria-hidden="true"><Icon name={mode === 'login' ? 'lock' : 'chat'} size={26} /></span>
    <h1 className="cgate__title">{titles[mode]}</h1><p className="cgate__text">{descriptions[mode]}</p>
    {mode === 'login' && <form className="cform" onSubmit={login} noValidate>
      <Field id="cv-email" label="Email" error={errors.email}><input id="cv-email" name="email" type="email" autoComplete="username" value={values.email} onChange={onChange} maxLength={150} required /></Field>
      {passwordField('cv-password','password','Password',values.password,showPassword,()=>setShowPassword(v=>!v),'current-password')}
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Signing in…' : 'Sign in'}</button>
      <div className="cgate__row"><button type="button" className="clink" onClick={()=>setModeClean('forgot')}>Forgot password?</button><button type="button" className="clink" onClick={()=>setModeClean('signup')}>Create account</button></div>
    </form>}
    {mode === 'signup' && <form className="cform" onSubmit={requestCode} noValidate>
      <Field id="cv-name" label="Your name" error={errors.name}><input id="cv-name" name="name" value={values.name} onChange={onChange} autoComplete="name" maxLength={100} required /></Field>
      <Field id="cv-email" label="Email" error={errors.email}><input id="cv-email" name="email" type="email" value={values.email} onChange={onChange} autoComplete="email" maxLength={150} required /></Field>
      <div className="hp" aria-hidden="true"><label htmlFor="cv-website">Website</label><input id="cv-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={onChange} /></div>
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Sending…' : 'Email me a code'} <Icon name="arrowRight" size={18} /></button>
      <div className="cgate__row"><button type="button" className="clink" onClick={()=>setModeClean('login')}>Already registered? Sign in</button></div>
    </form>}
    {mode === 'verify' && <form className="cform" onSubmit={submitCode} noValidate>
      <Field id="cv-code" label="Verification code" error={errors.code}><input ref={codeRef} id="cv-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={values.code} onChange={onChange} placeholder="6-digit code" className="cfield__code" required /></Field>
      {devCode && <p className="cnote cnote--warn">Development mode code: <strong>{devCode}</strong></p>}
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Verifying…' : 'Verify email'}</button>
      <div className="cgate__row"><button type="button" className="clink" onClick={()=>setModeClean('signup')}>Change details</button><button type="button" className="clink" onClick={requestCode} disabled={state.busy}>Resend code</button></div>
    </form>}
    {mode === 'setup' && <form className="cform" onSubmit={setPassword} noValidate>
      {passwordField('cv-password','password','Create password',values.password,showPassword,()=>setShowPassword(v=>!v),'new-password')}
      {passwordField('cv-confirm','confirmPassword','Confirm password',values.confirmPassword,showConfirm,()=>setShowConfirm(v=>!v),'new-password')}
      <p className="cnote">Use at least 10 characters. Your password is stored as a secure hash and cannot be viewed by the admin.</p>
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Creating account…' : 'Create account & open chat'}</button>
    </form>}
    {mode === 'forgot' && <form className="cform" onSubmit={requestReset} noValidate>
      <Field id="cv-email" label="Registered email" error={errors.email}><input id="cv-email" name="email" type="email" value={values.email} onChange={onChange} autoComplete="email" maxLength={150} required /></Field>
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send reset code'}</button>
      <button type="button" className="clink" onClick={()=>setModeClean('login')}>Back to sign in</button>
    </form>}
    {mode === 'reset' && <form className="cform" onSubmit={resetPassword} noValidate>
      <Field id="cv-code" label="Reset code" error={errors.code}><input ref={codeRef} id="cv-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={values.code} onChange={onChange} placeholder="6-digit code" required /></Field>
      {passwordField('cv-password','password','New password',values.password,showPassword,()=>setShowPassword(v=>!v),'new-password')}
      {passwordField('cv-confirm','confirmPassword','Confirm new password',values.confirmPassword,showConfirm,()=>setShowConfirm(v=>!v),'new-password')}
      {devCode && <p className="cnote cnote--warn">Development mode code: <strong>{devCode}</strong></p>}
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Resetting…' : 'Reset password'}</button>
      <button type="button" className="clink" onClick={()=>setModeClean('login')}>Back to sign in</button>
    </form>}
    <p className={`cstatus cstatus--${state.tone}`} role="status" aria-live="polite">{state.message}</p>
    <p className="cprivacy"><Icon name="lock" size={14} /> Your password is never displayed or emailed. Use a unique password and never share OTPs in chat.</p>
  </div>;
}

export function AdminLogin({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '', code: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, setState] = useState({ busy: false, message: '', tone: '' });
  const [devCode, setDevCode] = useState('');
  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  const resetView = (next) => { setMode(next); setState({ busy: false, message: '', tone: '' }); setDevCode(''); };
  const submit = async (e) => {
    e.preventDefault(); setState({ busy: true, message: '', tone: '' });
    try { const data = await api('/api/admin/auth/login', { method: 'POST', body: { email: values.email, password: values.password } }); onSignedIn(data.token); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };
  const requestReset = async (e) => {
    e.preventDefault(); setState({ busy: true, message: 'Requesting reset code…', tone: '' });
    try { const data = await api('/api/admin/auth/request-reset', { method: 'POST', body: { email: values.email } }); setDevCode(data.devCode || ''); setMode('reset'); setState({ busy: false, message: data.message, tone: 'success' }); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };
  const resetPassword = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(values.code.trim())) return setState({ busy: false, message: 'Enter the 6-digit reset code.', tone: 'error' });
    if (values.password.length < 12) return setState({ busy: false, message: 'Admin passwords must contain at least 12 characters.', tone: 'error' });
    if (values.password !== values.confirmPassword) return setState({ busy: false, message: 'Passwords do not match.', tone: 'error' });
    setState({ busy: true, message: 'Resetting password…', tone: '' });
    try { const data = await api('/api/admin/auth/reset-password', { method: 'POST', body: { email: values.email, code: values.code.trim(), password: values.password } }); resetView('login'); setState({ busy: false, message: data.message, tone: 'success' }); setValues((v) => ({ ...v, password: '', confirmPassword: '', code: '' })); }
    catch (err) { setState({ busy: false, message: err.message, tone: 'error' }); }
  };
  const passwordField = (id, name, label, value, show, toggle, autocomplete) => <Field id={id} label={label}><div className="cpassword-row"><input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autocomplete} value={value} onChange={onChange} required maxLength={200} /><button type="button" className="cpassword-toggle" onClick={toggle}>{show ? 'Hide' : 'Show'}</button></div></Field>;
  return <div className="cgate__card">
    <span className="cgate__icon" aria-hidden="true"><Icon name="lock" size={24} /></span>
    <h1 className="cgate__title">{mode === 'login' ? 'Admin sign-in' : mode === 'forgot' ? 'Forgot admin password?' : 'Reset admin password'}</h1>
    <p className="cgate__text">{mode === 'login' ? 'Sign in to read and reply to portfolio chats and contact messages.' : 'Verify the registered admin email before setting a new password.'}</p>
    {mode === 'login' && <form className="cform" onSubmit={submit}>
      <Field id="ad-email" label="Email"><input id="ad-email" name="email" type="email" autoComplete="username" value={values.email} onChange={onChange} required /></Field>
      {passwordField('ad-password','password','Password',values.password,showPassword,()=>setShowPassword(v=>!v),'current-password')}
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="clink" onClick={()=>resetView('forgot')}>Forgot password?</button>
    </form>}
    {mode === 'forgot' && <form className="cform" onSubmit={requestReset}>
      <Field id="ad-email" label="Admin email"><input id="ad-email" name="email" type="email" autoComplete="email" value={values.email} onChange={onChange} required /></Field>
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send reset code'}</button>
      <button type="button" className="clink" onClick={()=>resetView('login')}>Back to sign in</button>
    </form>}
    {mode === 'reset' && <form className="cform" onSubmit={resetPassword}>
      <Field id="ad-code" label="6-digit reset code"><input id="ad-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={values.code} onChange={onChange} required /></Field>
      {passwordField('ad-password','password','New password',values.password,showPassword,()=>setShowPassword(v=>!v),'new-password')}
      {passwordField('ad-confirm','confirmPassword','Confirm new password',values.confirmPassword,showConfirm,()=>setShowConfirm(v=>!v),'new-password')}
      {devCode && <p className="cnote cnote--warn">Development mode code: <strong>{devCode}</strong></p>}
      <p className="cnote">Use at least 12 characters for the admin password.</p>
      <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>{state.busy ? 'Resetting…' : 'Reset password'}</button>
      <button type="button" className="clink" onClick={()=>resetView('login')}>Back to sign in</button>
    </form>}
    <p className={`cstatus cstatus--${state.tone}`} role="status" aria-live="polite">{state.message}</p>
  </div>;
}
