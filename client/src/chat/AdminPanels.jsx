import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { listTime } from './chatUtils.js';

function PanelHead({ title, subtitle, onBack, children }) {
  return (
    <header className="cwin__head cpanel__head">
      <button type="button" className="cicon-btn cwin__back" onClick={onBack} aria-label="Back to conversations">
        <Icon name="back" size={22} />
      </button>
      <div className="cwin__who">
        <h2 className="cwin__name">{title}</h2>
        {subtitle ? <p className="cwin__status">{subtitle}</p> : null}
      </div>
      <div className="cwin__actions">{children}</div>
    </header>
  );
}

const fullTime = (v) => new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// Contact-form submissions (existing contact_messages table).
export function ContactInbox({ call, onBack }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: true, error: '', messages: [], unread: 0 });
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('filter', 'unread');
      if (q.trim()) params.set('q', q.trim());
      const d = await call(`/api/admin/contact-messages?${params}`);
      setState({ loading: false, error: '', messages: d.messages, unread: d.unread });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [call, filter, q]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const setRead = async (m, read) => {
    try {
      await call(`/api/admin/contact-messages/${m.id}/read`, { method: 'PATCH', body: { read } });
      setState((s) => ({
        ...s,
        unread: Math.max(0, s.unread + (read ? -1 : 1) * (m.read === read ? 0 : 1)),
        messages: s.messages.map((x) => (x.id === m.id ? { ...x, read } : x)),
      }));
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    }
  };

  const toggle = (m) => {
    setOpen((cur) => (cur === m.id ? null : m.id));
    if (!m.read) setRead(m, true);
  };

  return (
    <section className="cpanel" aria-label="Contact form inbox">
      <PanelHead title="Contact form inbox" subtitle={`${state.unread} unread`} onBack={onBack}>
        <button type="button" className="cicon-btn" onClick={load} aria-label="Refresh" title="Refresh">
          <Icon name="refresh" size={20} />
        </button>
      </PanelHead>
      <div className="cpanel__tools">
        <input type="search" className="cinput" placeholder="Search name, email, subject…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contact messages" />
        <div className="cside__filters" role="group" aria-label="Filter">
          {['all', 'unread'].map((f) => (
            <button key={f} type="button" className={`cchip ${filter === f ? 'is-active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
      </div>
      <div className="cpanel__scroll">
        {state.error ? (
          <p className="cstatus cstatus--error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.loading && !state.messages.length ? <p className="cpanel__state">Loading…</p> : null}
        {!state.loading && !state.messages.length ? <p className="cpanel__state">No contact messages.</p> : null}
        <ul className="cinbox">
          {state.messages.map((m) => (
            <li key={m.id} className={`cinbox__item ${m.read ? '' : 'is-unread'}`}>
              <button type="button" className="cinbox__summary" onClick={() => toggle(m)} aria-expanded={open === m.id}>
                <span className="cinbox__from">
                  {m.read ? null : <span className="cdot cdot--blue" aria-label="Unread" />}
                  <strong>{m.name}</strong> <small>{m.email}</small>
                </span>
                <span className="cinbox__subject">{m.subject || '(no subject)'}</span>
                <span className="cinbox__time">{listTime(m.createdAt)}</span>
              </button>
              {open === m.id ? (
                <div className="cinbox__body">
                  <p className="cinbox__meta">{fullTime(m.createdAt)}</p>
                  <p className="cinbox__text">{m.message}</p>
                  <div className="cinbox__actions">
                    <a className="cbtn cbtn--primary cbtn--small" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || 'Your message'}`)}`}>
                      <Icon name="mail" size={16} /> Reply via email
                    </a>
                    <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => setRead(m, !m.read)}>
                      Mark as {m.read ? 'unread' : 'read'}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const statusLabel = { sent: 'Sent', failed: 'Failed', skipped: 'Not sent (no provider)' };
const kindLabel = {
  chat_owner_notification: 'New chat → you',
  chat_reply_notification: 'Reply → visitor',
  chat_verification: 'Verification code',
  contact_owner_notification: 'Contact form → you',
  contact_visitor_receipt: 'Receipt → visitor',
};

export function EmailLog({ call, onBack }) {
  const [state, setState] = useState({ loading: true, error: '', deliveries: [] });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    call('/api/admin/email-deliveries')
      .then((d) => setState({ loading: false, error: '', deliveries: d.deliveries }))
      .catch((e) => setState({ loading: false, error: e.message, deliveries: [] }));
  }, [call]);
  useEffect(load, [load]);
  const failed = state.deliveries.filter((d) => d.status !== 'sent').length;
  return (
    <section className="cpanel" aria-label="Email delivery log">
      <PanelHead title="Email delivery log" subtitle={failed ? `${failed} not delivered in the last ${state.deliveries.length}` : 'Last 100 notifications'} onBack={onBack}>
        <button type="button" className="cicon-btn" onClick={load} aria-label="Refresh" title="Refresh">
          <Icon name="refresh" size={20} />
        </button>
      </PanelHead>
      <div className="cpanel__scroll">
        {state.error ? (
          <p className="cstatus cstatus--error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.loading && !state.deliveries.length ? <p className="cpanel__state">Loading…</p> : null}
        {!state.loading && !state.deliveries.length ? <p className="cpanel__state">No emails yet.</p> : null}
        <ul className="clog">
          {state.deliveries.map((d) => (
            <li key={d.id} className={`clog__item clog__item--${d.status}`}>
              <span className={`ctag ctag--${d.status}`}>{statusLabel[d.status] || d.status}</span>
              <span className="clog__main">
                <strong>{kindLabel[d.kind] || d.kind}</strong>
                <small>
                  to {d.recipient} · via {d.provider}
                  {d.attempts > 1 ? ` · ${d.attempts} attempts` : ''}
                </small>
                {d.error ? <small className="clog__error">{d.error}</small> : null}
              </span>
              <span className="clog__time">{listTime(d.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ReportsPanel({ call, onBack, onOpen }) {
  const [state, setState] = useState({ loading: true, error: '', reports: [] });
  useEffect(() => {
    call('/api/admin/reports')
      .then((d) => setState({ loading: false, error: '', reports: d.reports }))
      .catch((e) => setState({ loading: false, error: e.message, reports: [] }));
  }, [call]);
  return (
    <section className="cpanel" aria-label="Reports">
      <PanelHead title="Reports" subtitle="Problems reported by visitors" onBack={onBack} />
      <div className="cpanel__scroll">
        {state.error ? <p className="cstatus cstatus--error">{state.error}</p> : null}
        {!state.loading && !state.reports.length ? <p className="cpanel__state">No reports. 🎉</p> : null}
        <ul className="clog">
          {state.reports.map((r) => (
            <li key={r.id} className="clog__item">
              <span className="clog__main">
                <strong>
                  {r.reporter.name} <small>{r.reporter.email}</small>
                </strong>
                <span className="cinbox__text">{r.reason}</span>
                <button type="button" className="clink" onClick={() => onOpen(r.conversationId)}>
                  Open conversation
                </button>
              </span>
              <span className="clog__time">{listTime(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
