import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Avatar from './Avatar.jsx';

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el?.querySelector('input, textarea, button:not(.cmodal__close)')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        // Keep keyboard focus inside the dialog.
        const f = [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="cmodal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`cmodal__box ${wide ? 'cmodal__box--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cmodal-title">
        <header className="cmodal__head">
          <h2 id="cmodal-title">{title}</h2>
          <button type="button" className="cicon-btn cmodal__close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// Verified-visitor picker used for creating groups and adding members (admin only).
function UserPicker({ call, selected, onToggle, exclude = [] }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: true, users: [], error: '' });
  useEffect(() => {
    const t = window.setTimeout(() => {
      call(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((d) => setState({ loading: false, users: d.users, error: '' }))
        .catch((e) => setState({ loading: false, users: [], error: e.message }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, call]);
  const users = state.users.filter((u) => !exclude.includes(u.id) && u.status === 'active');
  return (
    <div className="cpicker">
      <label htmlFor="cpicker-q" className="cfield__label">
        Members (verified chat visitors)
      </label>
      <input id="cpicker-q" type="search" className="cinput" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="cpicker__list">
        {state.loading ? <li className="cpicker__state">Loading…</li> : null}
        {state.error ? <li className="cpicker__state">{state.error}</li> : null}
        {!state.loading && !users.length ? <li className="cpicker__state">No verified visitors found.</li> : null}
        {users.map((u) => (
          <li key={u.id}>
            <label className="cpicker__row">
              <input type="checkbox" checked={selected.includes(u.email)} onChange={() => onToggle(u.email)} />
              <Avatar name={u.name} id={u.id} size={32} online={u.online} />
              <span>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewGroupDialog({ call, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emails, setEmails] = useState([]);
  const [state, setState] = useState({ busy: false, error: '' });
  const toggle = (e) => setEmails((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  const submit = async (ev) => {
    ev.preventDefault();
    if (title.trim().length < 2) {
      setState({ busy: false, error: 'Group name must be at least 2 characters.' });
      return;
    }
    setState({ busy: true, error: '' });
    try {
      const d = await call('/api/chat/conversations/group', { method: 'POST', body: { title, description, memberEmails: emails } });
      onCreated(d.conversationId);
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };
  return (
    <Modal title="New group" onClose={onClose} wide>
      <form className="cform cmodal__body" onSubmit={submit}>
        <div className="cfield">
          <label htmlFor="ng-title">Group name</label>
          <input id="ng-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Developers Community" />
        </div>
        <div className="cfield">
          <label htmlFor="ng-desc">Description (optional)</label>
          <input id="ng-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What is this group about?" />
        </div>
        <UserPicker call={call} selected={emails} onToggle={toggle} />
        <p className="cnote">Only visitors who have verified their email in the chat can be added. Members see the group’s messages only while they are members.</p>
        {state.error ? (
          <p className="cstatus cstatus--error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="cmodal__foot">
          <button type="button" className="cbtn cbtn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cbtn cbtn--primary" disabled={state.busy}>
            {state.busy ? 'Creating…' : `Create group${emails.length ? ` (${emails.length + 1})` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GroupInfoDialog({ call, isAdmin, myId, detail, onClose, onChanged, onLeft }) {
  const canManage = detail.role === 'admin' || isAdmin;
  const [title, setTitle] = useState(detail.title || '');
  const [description, setDescription] = useState(detail.description || '');
  const [adding, setAdding] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [state, setState] = useState({ busy: false, error: '', ok: '' });

  const run = async (fn, ok) => {
    setState({ busy: true, error: '', ok: '' });
    try {
      await fn();
      setState({ busy: false, error: '', ok });
      onChanged();
    } catch (err) {
      setState({ busy: false, error: err.message, ok: '' });
    }
  };

  const save = (e) => {
    e.preventDefault();
    run(() => call(`/api/chat/conversations/${detail.id}`, { method: 'PATCH', body: { title, description } }), 'Group details saved.');
  };
  const add = () =>
    run(async () => {
      await call(`/api/chat/conversations/${detail.id}/members`, { method: 'PATCH', body: { addEmails: adding } });
      setAdding([]);
      setShowAdd(false);
    }, 'Members added.');
  const remove = (m) => {
    if (!window.confirm(`Remove ${m.name} from the group? They will lose access to its messages.`)) return;
    run(() => call(`/api/chat/conversations/${detail.id}/members/${m.id}`, { method: 'DELETE' }), `${m.name} was removed.`);
  };
  const leave = async () => {
    if (!window.confirm('Leave this group? You will no longer see its messages.')) return;
    try {
      await call(`/api/chat/conversations/${detail.id}/members/${myId}`, { method: 'DELETE' });
      onLeft();
    } catch (err) {
      setState({ busy: false, error: err.message, ok: '' });
    }
  };

  return (
    <Modal title="Group info" onClose={onClose} wide>
      <div className="cmodal__body">
        <div className="cginfo__head">
          <Avatar group name={detail.title} id={detail.id} size={56} />
          <div>
            <h3>{detail.title}</h3>
            <p>{detail.members.length} members</p>
          </div>
        </div>

        {canManage ? (
          <form className="cform" onSubmit={save}>
            <div className="cfield">
              <label htmlFor="gi-title">Group name</label>
              <input id="gi-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>
            <div className="cfield">
              <label htmlFor="gi-desc">Description</label>
              <input id="gi-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
            </div>
            <button type="submit" className="cbtn cbtn--ghost cbtn--small" disabled={state.busy}>
              Save details
            </button>
          </form>
        ) : detail.description ? (
          <p className="cginfo__desc">{detail.description}</p>
        ) : null}

        <h4 className="cginfo__label">Members</h4>
        <ul className="cginfo__members">
          {detail.members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} id={m.id} isOwner={m.isOwner} size={36} online={m.online} />
              <span className="cginfo__who">
                <strong>{m.id === myId ? `${m.name} (You)` : m.name}</strong>
                <small>{m.isOwner ? 'Portfolio owner · admin' : m.role === 'admin' ? 'Group admin' : m.email || 'Member'}</small>
              </span>
              {canManage && !m.isOwner && m.id !== myId ? (
                <button type="button" className="clink clink--danger" onClick={() => remove(m)} disabled={state.busy}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {canManage && isAdmin ? (
          showAdd ? (
            <div className="cginfo__add">
              <UserPicker
                call={call}
                selected={adding}
                exclude={detail.members.map((m) => m.id)}
                onToggle={(e) => setAdding((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))}
              />
              <button type="button" className="cbtn cbtn--primary cbtn--small" onClick={add} disabled={!adding.length || state.busy}>
                Add {adding.length || ''} member{adding.length === 1 ? '' : 's'}
              </button>
            </div>
          ) : (
            <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => setShowAdd(true)}>
              <Icon name="plus" size={16} /> Add members
            </button>
          )
        ) : null}

        <p className={`cstatus ${state.error ? 'cstatus--error' : 'cstatus--success'}`} role="status" aria-live="polite">
          {state.error || state.ok}
        </p>

        {!detail.members.find((m) => m.id === myId)?.isOwner ? (
          <button type="button" className="cbtn cbtn--danger cbtn--small" onClick={leave}>
            <Icon name="logout" size={16} /> Leave group
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

export function ReportDialog({ call, conversationId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      const d = await call(`/api/chat/conversations/${conversationId}/report`, { method: 'POST', body: { reason } });
      onDone(d.message);
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };
  return (
    <Modal title="Report a problem" onClose={onClose}>
      <form className="cform cmodal__body" onSubmit={submit}>
        <div className="cfield">
          <label htmlFor="rp-reason">What happened?</label>
          <textarea id="rp-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        {state.error ? (
          <p className="cstatus cstatus--error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="cmodal__foot">
          <button type="button" className="cbtn cbtn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cbtn cbtn--primary" disabled={state.busy || reason.trim().length < 3}>
            Send report
          </button>
        </div>
      </form>
    </Modal>
  );
}
