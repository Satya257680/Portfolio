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
  const [step, setStep] = useState('details'); // details | code
  const [values, setValues] = useState({ name: '', email: '', code: '', website: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, message: '', tone: '' });
  const [devCode, setDevCode] = useState('');
  const codeRef = useRef(null);
  const linkTried = useRef(false);

  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const verify = async (email, code) => {
    setState({ busy: true, message: 'Verifying…', tone: '' });
    try {
      const data = await api('/api/chat/auth/verify', { method: 'POST', body: { email, code } });
      onSignedIn(data.token);
    } catch (err) {
      setErrors(err.data?.errors || {});
      setState({ busy: false, message: err.message, tone: 'error' });
    }
  };

  useEffect(() => {
    if (linkTried.current) return;
    linkTried.current = true;
    const link = readVerifyLink();
    if (link) {
      setValues((v) => ({ ...v, email: link.email, code: link.code }));
      setStep('code');
      verify(link.email, link.code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const requestCode = async (e) => {
    e?.preventDefault();
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) found.email = 'Please enter a valid email.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setState({ busy: true, message: 'Sending code…', tone: '' });
    try {
      const data = await api('/api/chat/auth/request-verification', {
        method: 'POST',
        body: { name: values.name.trim(), email: values.email.trim(), website: values.website },
      });
      setDevCode(data.devCode || '');
      setStep('code');
      setState({
        busy: false,
        message: data.emailSent ? `We emailed a 6-digit code to ${values.email.trim()}. Check your inbox (and spam).` : data.message,
        tone: data.emailSent ? 'success' : 'warn',
      });
    } catch (err) {
      setErrors(err.data?.errors || {});
      setState({ busy: false, message: err.message, tone: 'error' });
    }
  };

  const submitCode = (e) => {
    e.preventDefault();
    const code = values.code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Enter the 6-digit code from the email.' });
      return;
    }
    setErrors({});
    verify(values.email.trim(), code);
  };

  if (status && status.enabled === false) {
    return (
      <div className="cgate__card" role="alert">
        <h1 className="cgate__title">Chat is unavailable right now</h1>
        <p className="cgate__text">You can still reach me directly — I usually reply within 24 hours.</p>
        <div className="cgate__actions">
          <a className="cbtn cbtn--primary" href={`mailto:${contact.email}`}>
            <Icon name="mail" size={18} /> Email me
          </a>
          <a className="cbtn cbtn--ghost" href="/#contact">
            Contact form
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="cgate__card">
      <span className="cgate__icon" aria-hidden="true">
        <Icon name="chat" size={26} />
      </span>
      <h1 className="cgate__title">{step === 'details' ? 'Start a private chat' : 'Check your email'}</h1>
      <p className="cgate__text">
        {step === 'details'
          ? 'Verify your email once to open a private conversation with Satyajit. No password needed — you can come back with the same email anytime.'
          : `Enter the 6-digit code sent to ${values.email.trim() || 'your email'}.`}
      </p>

      {step === 'details' ? (
        <form className="cform" onSubmit={requestCode} noValidate>
          <Field id="cv-name" label="Your name" error={errors.name}>
            <input
              id="cv-name"
              name="name"
              value={values.name}
              onChange={onChange}
              autoComplete="name"
              maxLength={100}
              placeholder="Your Name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'cv-name-err' : undefined}
            />
          </Field>
          <Field id="cv-email" label="Email" error={errors.email}>
            <input
              id="cv-email"
              name="email"
              type="email"
              value={values.email}
              onChange={onChange}
              autoComplete="email"
              maxLength={150}
              placeholder="your@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'cv-email-err' : undefined}
            />
          </Field>
          <div className="hp" aria-hidden="true">
            <label htmlFor="cv-website">Website</label>
            <input id="cv-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={onChange} />
          </div>
          <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>
            {state.busy ? 'Sending…' : 'Email me a code'} <Icon name="arrowRight" size={18} />
          </button>
        </form>
      ) : (
        <form className="cform" onSubmit={submitCode} noValidate>
          <Field id="cv-code" label="Verification code" error={errors.code}>
            <input
              ref={codeRef}
              id="cv-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              value={values.code}
              onChange={onChange}
              placeholder="6-digit code"
              className="cfield__code"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'cv-code-err' : undefined}
            />
          </Field>
          {devCode ? (
            <p className="cnote cnote--warn">
              Development mode (no email provider): your code is <strong>{devCode}</strong>
            </p>
          ) : null}
          <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>
            {state.busy ? 'Verifying…' : 'Verify & open chat'}
          </button>
          <div className="cgate__row">
            <button type="button" className="clink" onClick={() => setStep('details')} disabled={state.busy}>
              Change email
            </button>
            <button type="button" className="clink" onClick={requestCode} disabled={state.busy}>
              Resend code
            </button>
          </div>
        </form>
      )}

      <p className={`cstatus cstatus--${state.tone}`} role="status" aria-live="polite">
        {state.message}
      </p>
      <p className="cprivacy">
        <Icon name="lock" size={14} /> Your name, email and messages are stored only to reply to you. Please don’t share passwords, OTPs or other
        sensitive information in chat.
      </p>
    </div>
  );
}

export function AdminLogin({ onSignedIn }) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [state, setState] = useState({ busy: false, message: '' });
  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, message: '' });
    try {
      const data = await api('/api/admin/auth/login', { method: 'POST', body: values });
      onSignedIn(data.token);
    } catch (err) {
      setState({ busy: false, message: err.message });
    }
  };

  return (
    <div className="cgate__card">
      <span className="cgate__icon" aria-hidden="true">
        <Icon name="lock" size={24} />
      </span>
      <h1 className="cgate__title">Admin sign-in</h1>
      <p className="cgate__text">Sign in to read and reply to portfolio chats and contact messages.</p>
      <form className="cform" onSubmit={submit}>
        <Field id="ad-email" label="Email">
          <input id="ad-email" name="email" type="email" autoComplete="username" value={values.email} onChange={onChange} required />
        </Field>
        <Field id="ad-password" label="Password">
          <input
            id="ad-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={onChange}
            required
          />
        </Field>
        <button type="submit" className="cbtn cbtn--primary cbtn--block" disabled={state.busy}>
          {state.busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="cstatus cstatus--error" role="status" aria-live="polite">
        {state.message}
      </p>
    </div>
  );
}
