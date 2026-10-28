import { useEffect, useState } from 'react';
import { contact, profile, socials } from '../data/portfolioData.js';
import { API_BASE, CHAT_DRAFT_KEY } from '../lib/api.js';
import Icon from './Icon.jsx';
import { Glyph } from './SocialIcon.jsx';

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

const fieldIcons = { name: 'user', email: 'mail', subject: 'layout', message: 'chat' };

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
      <div className={`field__control ${props.textarea ? 'field__control--area' : ''}`}>
        <Icon name={fieldIcons[name]} size={18} className="field__icon" />
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
      </div>
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
        <Icon name="paperPlane" size={18} /> {state.status === 'sending' ? 'Sending…' : 'Send Message'} <Icon name="arrowRight" size={17} />
      </button>
      <p className={`form-status form-status--${state.status}`} role="status" aria-live="polite">
        {state.message}
      </p>
      <p className="contact-form__note">
        <Icon name="lock" size={13} /> Your information is safe and will only be used to respond to your message.
      </p>
    </form>
  );
}

// One row in "Contact Details": coloured icon tile, label/value, copy or open action.
function DetailRow({ tone, icon, glyph, label, value, href, copy, external }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the value is still visible and selectable */
    }
  };
  const valueEl = href ? (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="cdetail__value">
      {value}
    </a>
  ) : (
    <span className="cdetail__value">{value}</span>
  );
  return (
    <li className={`cdetail cdetail--${tone}`}>
      <span className="cdetail__icon" aria-hidden="true">
        {glyph ? <Glyph id={glyph} size={24} /> : <Icon name={icon} size={24} />}
      </span>
      <span className="cdetail__text">
        <span className="cdetail__label">{label}</span>
        {valueEl}
      </span>
      {copy ? (
        <button type="button" className="cdetail__action" onClick={doCopy} aria-label={copied ? `${label} copied` : `Copy ${label}`} title={copied ? 'Copied!' : 'Copy'}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
        </button>
      ) : (
        <a
          className="cdetail__action"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label} (opens in a new tab)`}
          title="Open"
        >
          <Icon name="external" size={18} />
        </a>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${label} copied to clipboard` : ''}
      </span>
    </li>
  );
}

// Right-hand preview card: a real composer that carries the draft into the private chat page.
function ChatPreview({ chat }) {
  const [draft, setDraft] = useState('');
  const go = (e) => {
    e.preventDefault();
    try {
      if (draft.trim()) sessionStorage.setItem(CHAT_DRAFT_KEY, draft.trim().slice(0, 2000));
    } catch {
      /* ignore */
    }
    window.location.assign(contact.chatPath);
  };
  return (
    <aside className="chat-preview glass" aria-labelledby="chat-preview-title">
      <header className="chat-preview__head">
        <span className="chat-preview__avatar">
          <img src={profile.avatar} alt="" width="52" height="52" />
          {chat.ownerOnline ? <span className="chat-preview__dot" aria-hidden="true" /> : null}
        </span>
        <span>
          <span id="chat-preview-title" className="chat-preview__name">
            {profile.name}
          </span>
          <span className="chat-preview__status">
            {chat.ownerOnline ? (
              <>
                <span className="chat-preview__live" aria-hidden="true" /> Online now
              </>
            ) : (
              'Usually replies within a few hours'
            )}
          </span>
        </span>
        <a href={contact.chatPath} className="chat-preview__open" aria-label="Open the full chat">
          <Icon name="external" size={18} />
        </a>
      </header>
      <div className="chat-preview__body">
        <p className="chat-preview__bubble">{contact.chatGreeting}</p>
        <p className="chat-preview__hint">
          Start a private conversation — verify your email once and keep chatting. I get an email the moment you write.
        </p>
      </div>
      <form className="chat-preview__composer" onSubmit={go}>
        <Icon name="smile" size={20} className="chat-preview__smile" />
        <label htmlFor="chat-preview-input" className="sr-only">
          Write a message
        </label>
        <input
          id="chat-preview-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message..."
          maxLength={2000}
          autoComplete="off"
        />
        <button type="submit" className="chat-preview__send" aria-label="Continue in chat">
          <Icon name="send" size={20} />
        </button>
      </form>
      <p className="chat-preview__note">
        <Icon name="shield" size={14} /> For a private reply, verify your email in the chat.
      </p>
    </aside>
  );
}

export default function Contact() {
  const [enabled, setEnabled] = useState(null);
  const [chat, setChat] = useState({ enabled: true, ownerOnline: false });

  useEffect(() => {
    let off = false;
    fetch(`${API_BASE}/api/contact/status`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => !off && setEnabled(Boolean(d.enabled)))
      .catch(() => !off && setEnabled(false));
    fetch(`${API_BASE}/api/chat/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !off && d && setChat({ enabled: Boolean(d.enabled), ownerOnline: Boolean(d.ownerOnline) }))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  const linkedin = socials.find((s) => s.id === 'linkedin');
  const github = socials.find((s) => s.id === 'github');

  return (
    <section id="contact" className="section contact" aria-labelledby="contact-title">
      <div className="container">
        <div className="contact__top">
          <div className="contact__heading">
            <span className="contact__plane" aria-hidden="true">
              <Icon name="paperPlane" size={56} />
            </span>
            <div>
              <p className="contact__eyebrow">{contact.eyebrow}</p>
              <h2 id="contact-title">
                Let’s <span className="grad-text">Connect</span>
              </h2>
              <p className="contact__intro">{contact.intro}</p>
            </div>
          </div>
          <ul className="contact__badges glass" aria-label="Highlights">
            {contact.badges.map((b) => (
              <li key={b.bottom}>
                <span className={`tone-icon tone-icon--${b.tone}`} aria-hidden="true">
                  <Icon name={b.icon} size={20} />
                </span>
                <span>
                  {b.top}
                  <strong>{b.bottom}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="contact__grid">
          <div className="contact-card glass">
            <div className="contact-card__head">
              <span className="contact-card__icon" aria-hidden="true">
                <Icon name="user" size={22} />
              </span>
              <h3>Contact Details</h3>
            </div>
            <p className="contact-card__note">{contact.detailsNote}</p>
            <ul className="cdetails">
              <DetailRow tone="violet" icon="mail" label="Email" value={contact.email} href={`mailto:${contact.email}`} copy={contact.email} />
              <DetailRow tone="cyan" icon="phone" label="Phone" value={contact.phone} href={contact.phoneHref} copy={contact.phone} />
              <DetailRow tone="blue" glyph="linkedin" label="LinkedIn" value={linkedin.handle} href={linkedin.url} external />
              <DetailRow tone="slate" glyph="github" label="GitHub" value={github.handle} href={github.url} external />
              <DetailRow tone="green" glyph="whatsapp" label="WhatsApp" value="Chat on WhatsApp" href={contact.whatsapp} external />
              <DetailRow tone="orange" icon="pin" label="Location" value={contact.location} copy={contact.location} />
            </ul>
          </div>

          <div className="contact-main">
            <nav className="contact-tabs" aria-label="Choose how to contact me">
              <span className="contact-tabs__item is-active" aria-current="true">
                <Icon name="mail" size={19} /> Send an Email
              </span>
              <a href={contact.chatPath} className="contact-tabs__item">
                <Icon name="chat" size={19} /> Start a Chat
              </a>
            </nav>
            <div className="contact__form glass">
              <div className="contact-card__head">
                <span className="contact-card__icon" aria-hidden="true">
                  <Icon name="mail" size={22} />
                </span>
                <div>
                  <h3>Send Me a Message</h3>
                  <p className="contact-card__note">Fill out the form below and I’ll get back to you soon.</p>
                </div>
              </div>
              <ContactForm enabled={enabled} />
            </div>
          </div>

          {chat.enabled ? (
            <ChatPreview chat={chat} />
          ) : (
            <aside className="chat-preview glass chat-preview--off">
              <p>The live chat is offline right now. Use the form, email or WhatsApp — I usually reply within 24 hours.</p>
            </aside>
          )}
        </div>

        <ul className="contact__features" aria-label="Ways I work">
          {contact.features.map((f) => (
            <li key={f.title}>
              <span className={`tone-text--${f.tone}`} aria-hidden="true">
                <Icon name={f.icon} size={30} />
              </span>
              <span>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
