import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../lib/api.js';
import PasswordToggle from '../chat/PasswordToggle.jsx';
import { markAdminDevice } from './adminDevice.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// One input row: leading icon, input, optional trailing control, inline error.
function InputRow({ id, label, icon, error, children, trailing = null }) {
  return (
    <div className={`aacc__field ${error ? 'is-invalid' : ''}`}>
      <label htmlFor={id} className="aacc__label">
        {label}
      </label>
      <div className="aacc__input">
        <Icon name={icon} size={19} />
        {children}
        {trailing}
      </div>
      {error ? (
        <span id={`${id}-err`} className="aacc__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * "Admin Access" sign-in card for the portfolio owner (login + verified password reset).
 * Only the configured owner email can sign in — the server enforces that; this form only collects
 * credentials. Passwords are sent once over HTTPS and never stored, logged or displayed.
 */
export default function AdminAccess({ onSignedIn, onClose = null, autoFocus = true }) {
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '', code: '' });
  const [show, setShow] = useState({ password: false, confirm: false });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, message: '', tone: '' });
  const [devCode, setDevCode] = useState('');
  const emailRef = useRef(null);
  const codeRef = useRef(null);

  useEffect(() => {
    if (!autoFocus) return;
    if (mode === 'reset') codeRef.current?.focus();
    else emailRef.current?.focus();
  }, [mode, autoFocus]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((x) => ({ ...x, [name]: '' }));
  };
  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setDevCode('');
    setState({ busy: false, message: '', tone: '' });
  };
  const email = values.email.trim();

  const login = async (e) => {
    e.preventDefault();
    const found = {};
    if (!EMAIL_RE.test(email)) found.email = 'Enter a valid email address.';
    if (!values.password) found.password = 'Enter your password.';
    if (Object.keys(found).length) return setErrors(found);
    setErrors({});
    setState({ busy: true, message: 'Signing in…', tone: '' });
    try {
      const data = await api('/api/admin/auth/login', { method: 'POST', body: { email, password: values.password } });
      setValues((v) => ({ ...v, password: '' }));
      markAdminDevice();
      onSignedIn(data.token);
    } catch (err) {
      setValues((v) => ({ ...v, password: '' }));
      setState({ busy: false, message: err.message, tone: 'error' });
    }
  };

  const requestReset = async (e) => {
    e?.preventDefault();
    if (!EMAIL_RE.test(email)) {
      if (mode !== 'forgot') setMode('forgot');
      return setErrors({ email: 'Enter the owner admin email.' });
    }
    setErrors({});
    setState({ busy: true, message: 'Requesting reset code…', tone: '' });
    try {
      const data = await api('/api/admin/auth/request-reset', { method: 'POST', body: { email } });
      setDevCode(data.devCode || '');
      setMode('reset');
      setValues((v) => ({ ...v, code: '', password: '', confirmPassword: '' }));
      setState({ busy: false, message: data.message, tone: 'success' });
    } catch (err) {
      setState({ busy: false, message: err.message, tone: 'error' });
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    const found = {};
    if (!/^\d{6}$/.test(values.code.trim())) found.code = 'Enter the 6-digit code from the email.';
    if (values.password.length < 12) found.password = 'Use at least 12 characters.';
    else if (values.password !== values.confirmPassword) found.confirmPassword = 'Passwords do not match.';
    if (Object.keys(found).length) return setErrors(found);
    setErrors({});
    setState({ busy: true, message: 'Resetting password…', tone: '' });
    try {
      const data = await api('/api/admin/auth/reset-password', {
        method: 'POST',
        body: { email, code: values.code.trim(), password: values.password },
      });
      switchMode('login');
      setValues((v) => ({ ...v, password: '', confirmPassword: '', code: '' }));
      setState({ busy: false, message: data.message, tone: 'success' });
    } catch (err) {
      setState({ busy: false, message: err.message, tone: 'error' });
    }
  };

  const describedBy = (name) => (errors[name] ? `aacc-${name}-err` : undefined);
  const passwordInput = (name, label, autoComplete, key) => (
    <InputRow
      id={`aacc-${name}`}
      label={label}
      icon="lock"
      error={errors[name]}
      trailing={<PasswordToggle shown={show[key]} onToggle={() => setShow((s) => ({ ...s, [key]: !s[key] }))} controls={`aacc-${name}`} />}
    >
      <input
        id={`aacc-${name}`}
        name={name}
        type={show[key] ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={values[name]}
        onChange={onChange}
        maxLength={200}
        placeholder={label}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={describedBy(name)}
        required
      />
    </InputRow>
  );
  const emailInput = (label) => (
    <InputRow id="aacc-email" label={label} icon="mail" error={errors.email}>
      <input
        ref={emailRef}
        id="aacc-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        value={values.email}
        onChange={onChange}
        maxLength={150}
        placeholder="Owner email address"
        aria-invalid={Boolean(errors.email)}
        aria-describedby={describedBy('email')}
        required
      />
    </InputRow>
  );

  const title = mode === 'login' ? 'Admin Access' : mode === 'forgot' ? 'Reset admin password' : 'Choose a new password';
  const subtitle =
    mode === 'login'
      ? 'Sign in to your private dashboard'
      : mode === 'forgot'
        ? 'We’ll email a single-use code to the owner address.'
        : `Enter the code sent to ${email} and choose a new password.`;

  return (
    <div className="aacc">
      {onClose ? (
        <button type="button" className="aacc__close" onClick={onClose} aria-label="Close admin sign-in">
          <Icon name="close" size={22} />
        </button>
      ) : null}
      <span className="aacc__badge" aria-hidden="true">
        <Icon name="lock" size={30} />
      </span>
      <h1 className="aacc__title" id="aacc-title">
        {title}
      </h1>
      <p className="aacc__subtitle">{subtitle}</p>

      {mode === 'login' ? (
        <form className="aacc__form" onSubmit={login} noValidate>
          {emailInput('Email')}
          {passwordInput('password', 'Password', 'current-password', 'password')}
          <button type="submit" className="aacc__submit" disabled={state.busy}>
            {state.busy ? (
              <>
                <span className="cspinner" aria-hidden="true" /> Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
          <button type="button" className="aacc__link" onClick={() => switchMode('forgot')}>
            Forgot password?
          </button>
        </form>
      ) : mode === 'forgot' ? (
        <form className="aacc__form" onSubmit={requestReset} noValidate>
          {emailInput('Admin email')}
          <button type="submit" className="aacc__submit" disabled={state.busy}>
            {state.busy ? 'Sending…' : 'Send reset code'}
          </button>
          <button type="button" className="aacc__link" onClick={() => switchMode('login')}>
            Back to sign in
          </button>
        </form>
      ) : (
        <form className="aacc__form" onSubmit={resetPassword} noValidate>
          <InputRow id="aacc-code" label="6-digit reset code" icon="shield" error={errors.code}>
            <input
              ref={codeRef}
              id="aacc-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={values.code}
              onChange={onChange}
              placeholder="6-digit code"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={describedBy('code')}
              required
            />
          </InputRow>
          {passwordInput('password', 'New password', 'new-password', 'password')}
          {passwordInput('confirmPassword', 'Confirm new password', 'new-password', 'confirm')}
          {devCode ? <p className="cnote cnote--warn">Development mode code: <strong>{devCode}</strong></p> : null}
          <p className="aacc__hint">Use at least 12 characters. Only a salted hash is stored — nobody can view it.</p>
          <button type="submit" className="aacc__submit" disabled={state.busy}>
            {state.busy ? 'Resetting…' : 'Reset password'}
          </button>
          <div className="aacc__row">
            <button type="button" className="aacc__link" onClick={() => switchMode('login')}>
              Back to sign in
            </button>
            <button type="button" className="aacc__link" onClick={requestReset} disabled={state.busy}>
              Resend code
            </button>
          </div>
        </form>
      )}

      <p className={`aacc__status aacc__status--${state.tone || 'info'}`} role="status" aria-live="polite">
        {state.message}
      </p>
      <div className="aacc__or" aria-hidden="true">
        <span>or</span>
      </div>
      <p className="aacc__private">
        <Icon name="shield" size={16} /> This area is private and only accessible to the portfolio owner.
      </p>
    </div>
  );
}
