import { useEffect, useState } from 'react';
import { contact, socials } from '../data/portfolioData.js';
import ConnectIllustration from './ConnectIllustration.jsx';
import ExternalLink from './ExternalLink.jsx';
import Icon from './Icon.jsx';
import { Glyph } from './SocialIcon.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const empty = { name: '', email: '', subject: '', message: '', website: '' };

function validate(v) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Please enter a valid email.';
  if (v.subject.trim().length > 150) e.subject = 'Max 150 characters.';
  if (v.message.trim().length < 10) e.message = 'Message should be at least 10 characters.';
  if (v.message.trim().length > 3000) e.message = 'Max 3000 characters.';
  return e;
}

function ContactForm({ enabled }) {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ status: 'idle', message: '' });
  const onChange = (e) => setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setState({ status: 'sending', message: '' });
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // Only shown after the server confirms the message was stored.
        setState({ status: 'success', message: 'Thank you! Your message was received — I’ll reply by email.' });
        setValues(empty);
      } else {
        if (data.errors) setErrors(data.errors);
        setState({ status: 'error', message: data.message || 'Message not sent. Please email me directly.' });
      }
    } catch {
      setState({ status: 'error', message: 'Network error — message not sent. Please email me directly.' });
    }
  };

  const input = (name, label, placeholder, props = {}) => (
    <div className={`field ${errors[name] ? 'field--error' : ''}`}>
      <label htmlFor={`cf-${name}`}>{label}</label>
      {props.textarea ? (
        <textarea
          id={`cf-${name}`}
          name={name}
          rows="4"
          placeholder={placeholder}
          value={values[name]}
          onChange={onChange}
          maxLength={3000}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `cf-${name}-err` : undefined}
        />
      ) : (
        <input
          id={`cf-${name}`}
          name={name}
          type={props.type || 'text'}
          placeholder={placeholder}
          value={values[name]}
          onChange={onChange}
          autoComplete={props.autoComplete}
          maxLength={props.maxLength}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `cf-${name}-err` : undefined}
        />
      )}
      {errors[name] ? (
        <span id={`cf-${name}-err`} className="field__error">
          {errors[name]}
        </span>
      ) : null}
    </div>
  );

  if (enabled === false) {
    return (
      <div className="contact-form contact-form--fallback">
        <h3>Send a message</h3>
        <p>The online form isn’t connected right now — email me and it goes straight to my inbox.</p>
        <a href={`mailto:${contact.email}?subject=Project%20Discussion`} className="btn btn--primary btn--block">
          Email {contact.email} <Icon name="paperPlane" size={17} />
        </a>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate aria-busy={enabled === null}>
      <div className="field-row">
        {input('name', 'Name', 'Your Name', { autoComplete: 'name', maxLength: 100 })}
        {input('email', 'Email', 'your@email.com', { type: 'email', autoComplete: 'email', maxLength: 150 })}
      </div>
      {input('subject', 'Subject', 'Project Discussion', { maxLength: 150 })}
      {input('message', 'Message', 'Write your message here...', { textarea: true })}
      <div className="hp" aria-hidden="true">
        <label htmlFor="cf-website">Website</label>
        <input id="cf-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={onChange} />
      </div>
      <button type="submit" className="btn btn--primary btn--block" disabled={state.status === 'sending' || enabled === null}>
        {state.status === 'sending' ? 'Sending…' : 'Send Message'} <Icon name="paperPlane" size={17} />
      </button>
      <p className={`form-status form-status--${state.status}`} role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}

export default function Contact() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let off = false;
    fetch(`${API_BASE}/api/contact/status`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !off && setEnabled(Boolean(d.enabled)))
      .catch(() => !off && setEnabled(false));
    return () => {
      off = true;
    };
  }, []);

  const linkedin = socials.find((s) => s.id === 'linkedin');
  const github = socials.find((s) => s.id === 'github');

  return (
    <section id="contact" className="section contact" aria-labelledby="contact-title">
      <div className="container contact__grid">
        <div className="contact__info">
          <div className="contact__heading">
            <span className="contact__plane" aria-hidden="true">
              <Icon name="paperPlane" size={44} />
            </span>
            <div>
              <h2 id="contact-title">Let’s Connect</h2>
              <p>I’m always open to discussing new opportunities, interesting projects or just having a chat about technology.</p>
            </div>
          </div>
          <ul className="contact__list">
            <li>
              <Icon name="phone" size={20} />
              <a href={contact.phoneHref}>{contact.phone}</a>
            </li>
            <li>
              <Icon name="mail" size={20} />
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
            <li>
              <Glyph id="linkedin" size={20} />
              <ExternalLink href={linkedin.url} className="contact__accent">
                {linkedin.handle}
              </ExternalLink>
            </li>
            <li>
              <Glyph id="github" size={20} />
              <ExternalLink href={github.url}>{github.handle}</ExternalLink>
            </li>
            <li>
              <Glyph id="whatsapp" size={20} />
              <ExternalLink href={contact.whatsapp}>Chat on WhatsApp</ExternalLink>
            </li>
            <li>
              <Icon name="pin" size={20} />
              <span>{contact.location}</span>
            </li>
          </ul>
        </div>

        <div className="contact__form glass">
          <ContactForm enabled={enabled} />
        </div>

        <ConnectIllustration />
      </div>
    </section>
  );
}
