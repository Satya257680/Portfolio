import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { EmailLog, ReportsPanel } from '../chat/AdminPanels.jsx';
import Avatar from '../chat/Avatar.jsx';
import { Modal } from '../chat/Dialogs.jsx';
import { listTime } from '../chat/chatUtils.js';
import { api } from '../lib/api.js';
import { downloadFile, fmtDate, fmtDateTime, fmtNum, relTime } from './adminUtils.js';

// ---------------------------------------------------------------- shared pieces

export function PageHead({ title, subtitle, children }) {
  return (
    <header className="apage__head">
      <div>
        <h1 className="apage__title">{title}</h1>
        {subtitle ? <p className="apage__subtitle">{subtitle}</p> : null}
      </div>
      {children ? <div className="apage__tools">{children}</div> : null}
    </header>
  );
}

function StatCard({ icon, tone, label, value, hint, loading }) {
  return (
    <div className="astat">
      <span className={`astat__icon astat__icon--${tone}`} aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <span className="astat__body">
        <span className="astat__label">{label}</span>
        <span className="astat__value">{loading ? <span className="askeleton" aria-label="Loading" /> : fmtNum(value)}</span>
        {hint ? <span className="astat__hint">{hint}</span> : null}
      </span>
    </div>
  );
}

function StateRow({ colSpan, children, role }) {
  return (
    <tr>
      <td colSpan={colSpan} className="atable__state" role={role}>
        {children}
      </td>
    </tr>
  );
}

function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="apager" aria-label="Pagination">
      <span className="apager__info">
        {total ? `Showing ${from}–${to} of ${fmtNum(total)}` : 'No results'}
      </span>
      <span className="apager__buttons">
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <Icon name="back" size={16} /> Previous
        </button>
        <span className="apager__page" aria-live="polite">
          Page {page} of {pages}
        </span>
        <button type="button" className="abtn abtn--ghost abtn--small" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next <Icon name="arrowRight" size={16} />
        </button>
      </span>
    </nav>
  );
}

function StatusPill({ user }) {
  if (user.status === 'blocked') return <span className="apill apill--danger"><Icon name="ban" size={13} /> Blocked</span>;
  return <span className="apill apill--ok"><Icon name="check" size={13} /> Active</span>;
}

// Account state only — the password itself is never available to the admin.
function PasswordPill({ user }) {
  if (user.passwordStatus === 'admin_managed') return <span className="apill apill--violet"><Icon name="shield" size={13} /> Admin login</span>;
  if (user.passwordStatus === 'set') return <span className="apill"><Icon name="lock" size={13} /> Set · hashed</span>;
  return <span className="apill apill--warn"><Icon name="clock" size={13} /> Reset pending</span>;
}

function RolePill({ user }) {
  return user.role === 'admin' ? <span className="apill apill--violet">Admin</span> : <span className="apill apill--muted">User</span>;
}

function SearchBox({ value, onChange, label, placeholder }) {
  return (
    <label className="asearch">
      <Icon name="search" size={18} />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={80} autoComplete="off" />
    </label>
  );
}

function Chips({ label, value, options, onChange }) {
  return (
    <div className="achips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={`cchip ${value === o.id ? 'is-active' : ''}`} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- account actions (+ confirmation)

const ACTIONS = {
  signOut: {
    title: 'Sign out everywhere?',
    confirm: 'Sign out',
    body: (u) => `${u.name} will be signed out of Portfolio Chat on all devices. They can sign in again with their own password.`,
    run: (call, u) => call(`/api/admin/users/${u.id}/sign-out`, { method: 'POST', body: { confirm: true } }),
  },
  requireReset: {
    title: 'Require a password reset?',
    confirm: 'Require reset',
    danger: true,
    body: (u) =>
      `${u.name}'s current password will stop working and they will be signed out everywhere. A single-use reset code is emailed to ${u.email} so only they can choose a new password. You will never see their password or the code.`,
    run: (call, u) => call(`/api/admin/users/${u.id}/require-password-reset`, { method: 'POST', body: { confirm: true } }),
  },
  block: {
    title: 'Block this account?',
    confirm: 'Block account',
    danger: true,
    body: (u) => `${u.name} (${u.email}) will be signed out immediately and cannot use the chat until you unblock them.`,
    run: (call, u) => call(`/api/admin/users/${u.id}/block`, { method: 'POST', body: { blocked: true } }),
    done: (u) => `${u.name} was blocked.`,
  },
  unblock: {
    title: 'Unblock this account?',
    confirm: 'Unblock',
    body: (u) => `${u.name} will be able to sign in and use the chat again.`,
    run: (call, u) => call(`/api/admin/users/${u.id}/block`, { method: 'POST', body: { blocked: false } }),
    done: (u) => `${u.name} was unblocked.`,
  },
};

function ConfirmDialog({ action, user, call, onClose, onDone }) {
  const spec = ACTIONS[action];
  const [state, setState] = useState({ busy: false, error: '' });
  const run = async () => {
    setState({ busy: true, error: '' });
    try {
      const data = await spec.run(call, user);
      onDone(data.message || spec.done?.(user) || 'Done.');
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };
  return (
    <Modal title={spec.title} onClose={state.busy ? () => {} : onClose}>
      <div className="cmodal__body">
        <p className="aconfirm__text">{spec.body(user)}</p>
        {state.error ? (
          <p className="cstatus cstatus--error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="cmodal__foot">
          <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={onClose} disabled={state.busy}>
            Cancel
          </button>
          <button type="button" className={`cbtn cbtn--small ${spec.danger ? 'cbtn--danger' : 'cbtn--primary'}`} onClick={run} disabled={state.busy}>
            {state.busy ? 'Working…' : spec.confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function useAccountActions(call, notify, reload) {
  const [pending, setPending] = useState(null); // { action, user }
  const ask = useCallback((action, user) => setPending({ action, user }), []);
  const dialog = pending ? (
    <ConfirmDialog
      action={pending.action}
      user={pending.user}
      call={call}
      onClose={() => setPending(null)}
      onDone={(msg) => {
        setPending(null);
        notify(msg);
        reload();
      }}
    />
  ) : null;
  return { ask, dialog };
}

function useUserList(call, params) {
  const [state, setState] = useState({ loading: true, error: '', users: [], total: 0 });
  const key = JSON.stringify(params);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== 'all' && v != null));
      const data = await call(`/api/admin/users?${qs}`);
      if (id === seq.current) setState({ loading: false, error: '', users: data.users, total: data.total });
    } catch (err) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: err.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, key]);
  useEffect(() => {
    const t = window.setTimeout(load, params.q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, params.q]);
  return [state, load];
}

// ---------------------------------------------------------------- user detail

function UserDetailDialog({ userId, call, onClose, onAction, onOpenChat }) {
  const [state, setState] = useState({ loading: true, error: '', user: null, conversations: [] });
  useEffect(() => {
    call(`/api/admin/users/${userId}`)
      .then((d) => setState({ loading: false, error: '', user: d.user, conversations: d.conversations }))
      .catch((e) => setState({ loading: false, error: e.message, user: null, conversations: [] }));
  }, [call, userId]);
  const u = state.user;
  return (
    <Modal title="Account details" onClose={onClose} wide>
      <div className="cmodal__body">
        {state.loading ? <p className="cpanel__state">Loading…</p> : null}
        {state.error ? <p className="cstatus cstatus--error" role="alert">{state.error}</p> : null}
        {u ? (
          <>
            <div className="auser__head">
              <Avatar name={u.name} id={u.id} isOwner={u.isOwner} online={u.online} size={56} />
              <div>
                <h3>{u.name}</h3>
                <p>{u.email}</p>
              </div>
            </div>
            <dl className="auser__grid">
              <div><dt>Status</dt><dd><StatusPill user={u} /></dd></div>
              <div><dt>Role</dt><dd><RolePill user={u} /></dd></div>
              <div><dt>Password</dt><dd><PasswordPill user={u} /></dd></div>
              <div><dt>Email verified</dt><dd>{fmtDateTime(u.verifiedAt)}</dd></div>
              <div><dt>Registered</dt><dd>{fmtDateTime(u.createdAt)}</dd></div>
              <div><dt>Last active</dt><dd>{u.online ? 'Online now' : relTime(u.lastActiveAt)}</dd></div>
              <div><dt>Messages sent</dt><dd>{fmtNum(u.messageCount)}</dd></div>
              <div><dt>Active sessions</dt><dd>{fmtNum(u.activeSessions)}</dd></div>
            </dl>
            <p className="cnote">
              <Icon name="lock" size={13} /> Passwords are stored only as salted hashes and are never shown — not even to you. Use “Require reset” to help someone regain access.
            </p>
            <h4 className="cginfo__label">Conversations</h4>
            {state.conversations.length ? (
              <ul className="auser__convs">
                {state.conversations.map((c) => (
                  <li key={c.id}>
                    <span>
                      <strong>{c.title}</strong>
                      <small>
                        {c.type === 'group' ? 'Group' : 'Direct'} · {c.sent} sent · {listTime(c.lastActivityAt)}
                        {c.status !== 'open' ? ` · ${c.status}` : ''}
                      </small>
                    </span>
                    <button type="button" className="clink" onClick={() => onOpenChat(c.id, c.type)}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cnote">No conversations.</p>
            )}
            {!u.isOwner ? (
              <div className="auser__actions">
                <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => onAction('signOut', u)}>
                  <Icon name="logout" size={16} /> Sign out everywhere
                </button>
                {u.status !== 'blocked' ? (
                  <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => onAction('requireReset', u)}>
                    <Icon name="refresh" size={16} /> Require password reset
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`cbtn cbtn--small ${u.status === 'blocked' ? 'cbtn--primary' : 'cbtn--danger'}`}
                  onClick={() => onAction(u.status === 'blocked' ? 'unblock' : 'block', u)}
                >
                  <Icon name="ban" size={16} /> {u.status === 'blocked' ? 'Unblock' : 'Block'}
                </button>
              </div>
            ) : (
              <p className="cnote">This is your own admin account. Manage it from Settings.</p>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Dashboard

export function DashboardSection({ call, summary, summaryState, period, onPeriod, onNavigate, onOpenChat }) {
  const [chats, setChats] = useState({ loading: true, error: '', items: [] });
  useEffect(() => {
    call('/api/chat/conversations?type=direct')
      .then((d) => setChats({ loading: false, error: '', items: d.conversations.slice(0, 8) }))
      .catch((e) => setChats({ loading: false, error: e.message, items: [] }));
  }, [call]);
  const loading = summaryState.loading && !summary;
  const s = summary || { users: {}, chats: {}, contact: {}, reports: {} };
  const periodLabel = period === 7 ? '7 days' : period === 90 ? '90 days' : '30 days';

  return (
    <div className="apage">
      <PageHead title="Dashboard" subtitle="Live overview of your portfolio users, chats and messages">
        <Chips
          label="Period"
          value={period}
          onChange={onPeriod}
          options={[
            { id: 7, label: '7 days' },
            { id: 30, label: '30 days' },
            { id: 90, label: '90 days' },
          ]}
        />
      </PageHead>
      {summaryState.error ? <p className="cstatus cstatus--error" role="alert">{summaryState.error}</p> : null}
      <div className="astats">
        <StatCard icon="team" tone="blue" label="Total Users" value={s.users.total} loading={loading} hint={`${fmtNum(s.users.onlineNow)} online now`} />
        <StatCard icon="chart" tone="green" label={`New (${periodLabel})`} value={s.users.new} loading={loading} hint="Verified sign-ups" />
        <StatCard icon="chat" tone="violet" label="Total Chats" value={s.chats.conversations} loading={loading} hint={`${fmtNum(s.chats.messages)} messages`} />
        <StatCard icon="bolt" tone="amber" label="Active (24 h)" value={s.users.active24h} loading={loading} hint="Signed-in activity" />
      </div>

      <div className="adash">
        <section className="acard" aria-labelledby="adash-attn">
          <h2 className="acard__title" id="adash-attn">Needs attention</h2>
          <ul className="aattn">
            <li>
              <button type="button" onClick={() => onNavigate('chat')}>
                <Icon name="chat" size={18} /> Unread chat messages <strong>{fmtNum(s.chats.unreadMessages)}</strong>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('messages')}>
                <Icon name="inbox" size={18} /> Unread contact messages <strong>{fmtNum(s.contact.unread)}</strong>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('settings', 'reports')}>
                <Icon name="flag" size={18} /> Open reports <strong>{fmtNum(s.reports.open)}</strong>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('access')}>
                <Icon name="lock" size={18} /> Password resets pending <strong>{fmtNum(s.users.resetPending)}</strong>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('access')}>
                <Icon name="ban" size={18} /> Blocked accounts <strong>{fmtNum(s.users.blocked)}</strong>
              </button>
            </li>
          </ul>

          <h2 className="acard__title">Recent sign-ups</h2>
          {s.recentUsers?.length ? (
            <ul className="arecent">
              {s.recentUsers.map((u) => (
                <li key={u.id}>
                  <Avatar name={u.name} id={u.id} size={36} />
                  <span className="arecent__who">
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </span>
                  <time dateTime={new Date(u.createdAt).toISOString()}>{fmtDate(u.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cnote">{loading ? 'Loading…' : 'No sign-ups yet.'}</p>
          )}
          <button type="button" className="clink" onClick={() => onNavigate('users')}>
            View all users →
          </button>
        </section>

        <aside className="acard arail" aria-labelledby="adash-chats">
          <h2 className="acard__title arail__title" id="adash-chats">
            <Icon name="chat" size={18} /> Chat (All Users)
          </h2>
          {chats.error ? <p className="cstatus cstatus--error">{chats.error}</p> : null}
          {chats.loading ? <p className="cnote">Loading…</p> : null}
          {!chats.loading && !chats.items.length ? <p className="cnote">No visitor chats yet.</p> : null}
          <ul className="arail__list">
            {chats.items.map((c) => (
              <li key={c.id}>
                <button type="button" className="arail__item" onClick={() => onOpenChat(c.id, 'direct')}>
                  <Avatar name={c.title} id={c.other?.id || c.id} online={c.other?.online} size={40} />
                  <span className="arail__body">
                    <span className="arail__row">
                      <strong>{c.title}</strong>
                      <small>{listTime(c.lastActivityAt)}</small>
                    </span>
                    <span className="arail__row">
                      <span className="arail__preview">{c.lastMessage ? c.lastMessage.body : 'No messages yet'}</span>
                      {c.unread ? <span className="clist__badge" aria-label={`${c.unread} unread`}>{c.unread}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="clink" onClick={() => onNavigate('chat')}>
            Open all chats →
          </button>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- All users

const PAGE_SIZE = 20;

export function UsersSection({ call, token, notify, onOpenChat, summary }) {
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const params = useMemo(() => ({ q: q.trim(), status, sort, page, pageSize: PAGE_SIZE, includeOwner: '1' }), [q, status, sort, page]);
  const [state, reload] = useUserList(call, params);
  const { ask, dialog } = useAccountActions(call, notify, reload);

  useEffect(() => setPage(1), [q, status, sort]);
  useEffect(() => setSelected(new Set()), [q, status, sort, page]);

  const selectable = state.users.filter((u) => !u.isOwner);
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((u) => u.id)));
  const toggle = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (selected.size) qs.set('ids', [...selected].join(','));
      else {
        if (q.trim()) qs.set('q', q.trim());
        if (status !== 'all') qs.set('status', status);
      }
      await downloadFile(`/api/admin/users/export?${qs}`, token, 'portfolio-users.csv');
      notify(selected.size ? `Exported ${selected.size} selected users.` : 'Export downloaded.');
    } catch (err) {
      notify(err.message);
    } finally {
      setExporting(false);
    }
  };

  const cols = 9;
  return (
    <div className="apage">
      <PageHead title="All Users" subtitle="Manage users who contacted you or signed up on your portfolio">
        <SearchBox value={q} onChange={setQ} label="Search users" placeholder="Search users by name, email…" />
        <button type="button" className={`abtn abtn--ghost ${showFilters ? 'is-active' : ''}`} aria-expanded={showFilters} aria-controls="ausers-filters" onClick={() => setShowFilters((v) => !v)}>
          <Icon name="layers" size={18} /> Filter
        </button>
        <button type="button" className="abtn abtn--ghost" onClick={exportCsv} disabled={exporting}>
          <Icon name="download" size={18} /> {exporting ? 'Exporting…' : selected.size ? `Export (${selected.size})` : 'Export'}
        </button>
      </PageHead>

      {summary ? (
        <div className="astats">
          <StatCard icon="team" tone="blue" label="Total Users" value={summary.users.total} />
          <StatCard icon="chart" tone="green" label={`New (${summary.periodDays} days)`} value={summary.users.new} />
          <StatCard icon="chat" tone="violet" label="Total Chats" value={summary.chats.conversations} />
          <StatCard icon="bolt" tone="amber" label="Active (24 h)" value={summary.users.active24h} />
        </div>
      ) : null}

      {showFilters ? (
        <div className="afilters" id="ausers-filters">
          <Chips
            label="Account status"
            value={status}
            onChange={setStatus}
            options={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'blocked', label: 'Blocked' },
            ]}
          />
          <label className="aselect">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="active">Last active</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="acard acard--flush">
        <div className="atable__wrap">
          <table className="atable">
            <caption className="sr-only">Registered users</caption>
            <thead>
              <tr>
                <th scope="col" className="atable__check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all users on this page" disabled={!selectable.length} />
                </th>
                <th scope="col">#</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col" className="atable__hide-md">First Contact</th>
                <th scope="col" className="atable__hide-sm">Last Active</th>
                <th scope="col" className="atable__actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && !state.users.length ? <StateRow colSpan={cols} role="status">Loading users…</StateRow> : null}
              {state.error ? (
                <StateRow colSpan={cols} role="alert">
                  {state.error}{' '}
                  <button type="button" className="clink" onClick={reload}>Retry</button>
                </StateRow>
              ) : null}
              {!state.loading && !state.error && !state.users.length ? (
                <StateRow colSpan={cols}>{q ? 'No users match your search.' : 'No registered users yet.'}</StateRow>
              ) : null}
              {state.users.map((u, i) => (
                <tr key={u.id} className={selected.has(u.id) ? 'is-selected' : ''}>
                  <td className="atable__check">
                    {u.isOwner ? null : <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Select ${u.name}`} />}
                  </td>
                  <td className="atable__num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td>
                    <span className="atable__user">
                      <Avatar name={u.name} id={u.id} isOwner={u.isOwner} online={u.online} size={32} />
                      <strong>{u.name}</strong>
                    </span>
                  </td>
                  <td className="atable__email">{u.email}</td>
                  <td>
                    <span className="atable__pills">
                      <StatusPill user={u} />
                      <PasswordPill user={u} />
                    </span>
                  </td>
                  <td><RolePill user={u} /></td>
                  <td className="atable__hide-md atable__date">{fmtDate(u.createdAt)}</td>
                  <td className="atable__hide-sm atable__date">{u.online ? <span className="aonline">Online</span> : relTime(u.lastActiveAt)}</td>
                  <td className="atable__actions">
                    <span className="aicons">
                      <button type="button" className="aicon aicon--blue" onClick={() => onOpenChat(u.conversationId, 'direct')} disabled={!u.conversationId} aria-label={`Open chat with ${u.name}`} title="Open chat">
                        <Icon name="chat" size={17} />
                        {u.unread ? <span className="aicon__dot" aria-hidden="true" /> : null}
                      </button>
                      <button type="button" className="aicon aicon--blue" onClick={() => setDetail(u.id)} aria-label={`Manage ${u.name}`} title="Manage account">
                        <Icon name="gear" size={17} />
                      </button>
                      {u.isOwner ? null : (
                        <button
                          type="button"
                          className={`aicon ${u.status === 'blocked' ? 'aicon--green' : 'aicon--red'}`}
                          onClick={() => ask(u.status === 'blocked' ? 'unblock' : 'block', u)}
                          aria-label={u.status === 'blocked' ? `Unblock ${u.name}` : `Block ${u.name}`}
                          title={u.status === 'blocked' ? 'Unblock' : 'Block'}
                        >
                          <Icon name={u.status === 'blocked' ? 'check' : 'ban'} size={17} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={state.total} onPage={setPage} />
      </div>
      <p className="cnote anote">
        <Icon name="lock" size={13} /> Passwords are never shown or exported — only whether one is set. They are stored as salted hashes.
      </p>

      {detail ? (
        <UserDetailDialog
          userId={detail}
          call={call}
          onClose={() => setDetail(null)}
          onAction={(a, u) => {
            setDetail(null);
            ask(a, u);
          }}
          onOpenChat={(id, type) => {
            setDetail(null);
            onOpenChat(id, type);
          }}
        />
      ) : null}
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------- Access management

export function AccessSection({ call, notify, onOpenChat }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState('all');
  const [page, setPage] = useState(1);
  const params = useMemo(
    () => ({
      q: q.trim(),
      status: view === 'blocked' ? 'blocked' : view === 'active' ? 'active' : '',
      access: view === 'reset' ? 'reset_required' : '',
      sort: 'active',
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, view, page],
  );
  const [state, reload] = useUserList(call, params);
  const { ask, dialog } = useAccountActions(call, notify, reload);
  const [detail, setDetail] = useState(null);
  useEffect(() => setPage(1), [q, view]);
  const cols = 6;

  return (
    <div className="apage">
      <PageHead title="User Accounts" subtitle="Access management — sessions, password resets and blocking">
        <SearchBox value={q} onChange={setQ} label="Search accounts" placeholder="Search by name or email…" />
      </PageHead>
      <div className="acallout" role="note">
        <Icon name="shield" size={20} />
        <p>
          Passwords are never visible here — not even yours. To help someone regain access, use <strong>Require reset</strong>: their old
          password stops working and only they receive a single-use code by email. Admin rights cannot be granted from this panel.
        </p>
      </div>
      <Chips
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'reset', label: 'Reset pending' },
          { id: 'blocked', label: 'Blocked' },
        ]}
      />
      <div className="acard acard--flush">
        <div className="atable__wrap">
          <table className="atable">
            <caption className="sr-only">Account access</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Status</th>
                <th scope="col">Password</th>
                <th scope="col" className="atable__hide-sm">Sessions</th>
                <th scope="col" className="atable__hide-md">Last active</th>
                <th scope="col" className="atable__actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && !state.users.length ? <StateRow colSpan={cols} role="status">Loading accounts…</StateRow> : null}
              {state.error ? <StateRow colSpan={cols} role="alert">{state.error}</StateRow> : null}
              {!state.loading && !state.error && !state.users.length ? <StateRow colSpan={cols}>No accounts found.</StateRow> : null}
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="atable__user">
                      <Avatar name={u.name} id={u.id} online={u.online} size={32} />
                      <span>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </span>
                    </span>
                  </td>
                  <td><StatusPill user={u} /></td>
                  <td><PasswordPill user={u} /></td>
                  <td className="atable__hide-sm">{fmtNum(u.activeSessions)}</td>
                  <td className="atable__hide-md">{u.online ? <span className="aonline">Online</span> : relTime(u.lastActiveAt)}</td>
                  <td className="atable__actions">
                    <span className="aactions">
                      <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => setDetail(u.id)}>
                        Details
                      </button>
                      <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => ask('signOut', u)} disabled={!u.activeSessions}>
                        Sign out
                      </button>
                      {u.status !== 'blocked' ? (
                        <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => ask('requireReset', u)}>
                          Require reset
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`cbtn cbtn--small ${u.status === 'blocked' ? 'cbtn--primary' : 'cbtn--danger'}`}
                        onClick={() => ask(u.status === 'blocked' ? 'unblock' : 'block', u)}
                      >
                        {u.status === 'blocked' ? 'Unblock' : 'Block'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={state.total} onPage={setPage} />
      </div>
      {detail ? (
        <UserDetailDialog
          userId={detail}
          call={call}
          onClose={() => setDetail(null)}
          onAction={(a, u) => {
            setDetail(null);
            ask(a, u);
          }}
          onOpenChat={(id, type) => {
            setDetail(null);
            onOpenChat(id, type);
          }}
        />
      ) : null}
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------- Analytics (real data only)

const SERIES = [
  { key: 'signups', label: 'New sign-ups' },
  { key: 'visitorMessages', label: 'Visitor messages' },
  { key: 'ownerMessages', label: 'Your replies' },
  { key: 'contactMessages', label: 'Contact form messages' },
];

const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

// One single-series bar chart per measure (small multiples: no shared scale between unlike measures).
function MiniBars({ data, field, label }) {
  const max = Math.max(1, ...data.map((d) => d[field]));
  const [hover, setHover] = useState(null);
  const W = 100;
  const gap = data.length > 45 ? 0.3 : 0.6;
  const bw = W / data.length - gap;
  const total = data.reduce((n, d) => n + d[field], 0);
  const peak = data.reduce((best, d) => (d[field] > (best?.[field] ?? -1) ? d : best), null);
  return (
    <figure className="achart">
      <figcaption className="achart__head">
        <span className="achart__label">{label}</span>
        <span className="achart__total">{fmtNum(total)}</span>
      </figcaption>
      <div className="achart__plot">
        <span className="achart__max" aria-hidden="true">{fmtNum(max)}</span>
        <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${fmtNum(total)} in the period${peak && peak[field] ? `, peak ${peak[field]} on ${shortDay(peak.date)}` : ''}`}>
          <line x1="0" y1="39.75" x2={W} y2="39.75" className="achart__base" />
          {data.map((d, i) => {
            const h = d[field] ? Math.max(1.2, (d[field] / max) * 37) : 0;
            const x = i * (bw + gap) + gap / 2;
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x - gap / 2} y="0" width={bw + gap} height="40" fill="transparent" />
                {h ? <rect x={x} y={39.5 - h} width={bw} height={h} rx="0.6" className={`achart__bar ${hover === i ? 'is-hover' : ''}`} /> : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <span className="achart__tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }} role="status">
            <strong>{fmtNum(data[hover][field])}</strong> {shortDay(data[hover].date)}
          </span>
        ) : null}
      </div>
      <div className="achart__axis" aria-hidden="true">
        <span>{shortDay(data[0].date)}</span>
        <span>{shortDay(data[data.length - 1].date)}</span>
      </div>
    </figure>
  );
}

export function AnalyticsSection({ call }) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [table, setTable] = useState(false);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    const tz = -new Date().getTimezoneOffset();
    call(`/api/admin/analytics?days=${days}&tzOffset=${tz}`)
      .then((data) => setState({ loading: false, error: '', data }))
      .catch((e) => setState({ loading: false, error: e.message, data: null }));
  }, [call, days]);
  const d = state.data;
  const replyRate = d && d.totals.visitorMessages ? Math.round((d.totals.ownerMessages / d.totals.visitorMessages) * 100) : null;

  return (
    <div className="apage">
      <PageHead title="Analytics" subtitle="Daily activity from your database, in your local time zone">
        <Chips
          label="Range"
          value={days}
          onChange={setDays}
          options={[
            { id: 7, label: '7 days' },
            { id: 30, label: '30 days' },
            { id: 90, label: '90 days' },
          ]}
        />
        <button type="button" className="abtn abtn--ghost" aria-pressed={table} onClick={() => setTable((v) => !v)}>
          <Icon name={table ? 'chart' : 'grid'} size={18} /> {table ? 'Charts' : 'Table'}
        </button>
      </PageHead>
      {state.error ? <p className="cstatus cstatus--error" role="alert">{state.error}</p> : null}
      {state.loading && !d ? <p className="cpanel__state" role="status">Loading analytics…</p> : null}
      {d ? (
        <>
          <div className="astats">
            <StatCard icon="team" tone="blue" label="Sign-ups" value={d.totals.signups} />
            <StatCard icon="chat" tone="violet" label="Visitor messages" value={d.totals.visitorMessages} />
            <StatCard icon="send" tone="green" label="Your replies" value={d.totals.ownerMessages} hint={replyRate !== null ? `${replyRate}% of visitor messages` : 'No visitor messages yet'} />
            <StatCard icon="inbox" tone="amber" label="Contact messages" value={d.totals.contactMessages} />
          </div>
          {table ? (
            <div className="acard acard--flush">
              <div className="atable__wrap">
                <table className="atable atable--compact">
                  <caption className="sr-only">Daily activity</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      {SERIES.map((s) => <th key={s.key} scope="col">{s.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.series].reverse().map((row) => (
                      <tr key={row.date}>
                        <td>{fmtDate(`${row.date}T00:00:00`)}</td>
                        {SERIES.map((s) => <td key={s.key}>{fmtNum(row[s.key])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="acharts">
              {SERIES.map((s) => <MiniBars key={s.key} data={d.series} field={s.key} label={s.label} />)}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Settings

const ACTION_LABELS = {
  'admin.login': 'Admin signed in',
  'admin.login.failed': 'Failed admin sign-in',
  'admin.login.denied': 'Sign-in refused (not the owner email)',
  'admin.logout': 'Admin signed out',
  'admin.password_reset': 'Admin password reset',
  'admin.sessions.revoke_others': 'Signed out other admin sessions',
  'user.block': 'Account blocked',
  'user.unblock': 'Account unblocked',
  'user.sessions.revoke': 'User signed out everywhere',
  'user.password.require_reset': 'Password reset required',
  'users.export': 'Users exported',
};

function AuditLog({ call }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', logs: [], total: 0 });
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    call(`/api/admin/audit-logs?page=${page}&pageSize=25`)
      .then((d) => setState({ loading: false, error: '', logs: d.logs, total: d.total }))
      .catch((e) => setState({ loading: false, error: e.message, logs: [], total: 0 }));
  }, [call, page]);
  return (
    <div className="acard acard--flush">
      <div className="atable__wrap">
        <table className="atable atable--compact">
          <caption className="sr-only">Audit log</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col" className="atable__hide-sm">Target</th>
              <th scope="col" className="atable__hide-md">Details</th>
            </tr>
          </thead>
          <tbody>
            {state.loading && !state.logs.length ? <StateRow colSpan={4} role="status">Loading…</StateRow> : null}
            {state.error ? <StateRow colSpan={4} role="alert">{state.error}</StateRow> : null}
            {!state.loading && !state.logs.length && !state.error ? <StateRow colSpan={4}>No audit entries yet.</StateRow> : null}
            {state.logs.map((l) => (
              <tr key={l.id}>
                <td>{fmtDateTime(l.createdAt)}</td>
                <td>{ACTION_LABELS[l.action] || l.action}</td>
                <td className="atable__hide-sm">{l.targetType ? `${l.targetType.replace('_', ' ')} #${l.targetId ?? '—'}` : '—'}</td>
                <td className="atable__hide-md">{l.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={25} total={state.total} onPage={setPage} />
    </div>
  );
}

function SecuritySettings({ call, notify, onPasswordChanged }) {
  const [state, setState] = useState({ loading: true, error: '', account: null });
  const [reset, setReset] = useState({ step: 'idle', code: '', password: '', confirm: '', busy: false, message: '', tone: '', devCode: '' });
  const load = useCallback(() => {
    call('/api/admin/account')
      .then((d) => setState({ loading: false, error: '', account: d.account }))
      .catch((e) => setState({ loading: false, error: e.message, account: null }));
  }, [call]);
  useEffect(load, [load]);
  const a = state.account;

  const signOutOthers = async () => {
    try {
      const d = await call('/api/admin/auth/logout-others', { method: 'POST' });
      notify(d.revoked ? `Signed out ${d.revoked} other session${d.revoked === 1 ? '' : 's'}.` : 'No other sessions were active.');
      load();
    } catch (err) {
      notify(err.message);
    }
  };

  const sendCode = async () => {
    setReset((r) => ({ ...r, busy: true, message: 'Sending a reset code to your email…', tone: '' }));
    try {
      const d = await api('/api/admin/auth/request-reset', { method: 'POST', body: { email: a.email } });
      setReset((r) => ({ ...r, step: 'code', busy: false, message: d.message, tone: 'success', devCode: d.devCode || '' }));
    } catch (err) {
      setReset((r) => ({ ...r, busy: false, message: err.message, tone: 'error' }));
    }
  };
  const submitReset = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(reset.code.trim())) return setReset((r) => ({ ...r, message: 'Enter the 6-digit code.', tone: 'error' }));
    if (reset.password.length < 12) return setReset((r) => ({ ...r, message: 'Use at least 12 characters.', tone: 'error' }));
    if (reset.password !== reset.confirm) return setReset((r) => ({ ...r, message: 'Passwords do not match.', tone: 'error' }));
    setReset((r) => ({ ...r, busy: true, message: 'Updating password…', tone: '' }));
    try {
      await api('/api/admin/auth/reset-password', { method: 'POST', body: { email: a.email, code: reset.code.trim(), password: reset.password } });
      onPasswordChanged();
    } catch (err) {
      setReset((r) => ({ ...r, busy: false, message: err.message, tone: 'error' }));
    }
  };

  return (
    <div className="asettings">
      <section className="acard">
        <h2 className="acard__title">Admin account</h2>
        {state.error ? <p className="cstatus cstatus--error">{state.error}</p> : null}
        {a ? (
          <dl className="auser__grid">
            <div><dt>Email</dt><dd>{a.email}</dd></div>
            <div><dt>Role</dt><dd><span className="apill apill--violet">Owner · Admin</span></dd></div>
            <div><dt>Last sign-in</dt><dd>{fmtDateTime(a.lastLoginAt)}</dd></div>
            <div><dt>Password</dt><dd><span className="apill"><Icon name="lock" size={13} /> Set · hashed</span></dd></div>
            <div><dt>Active admin sessions</dt><dd>{fmtNum(a.activeSessions)}</dd></div>
            <div><dt>Session length</dt><dd>{a.sessionHours} hours</dd></div>
          </dl>
        ) : (
          <p className="cnote">{state.loading ? 'Loading…' : ''}</p>
        )}
        <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={signOutOthers} disabled={!a}>
          <Icon name="logout" size={16} /> Sign out other devices
        </button>
      </section>

      <section className="acard">
        <h2 className="acard__title">Change password</h2>
        <p className="cnote">For your safety a code is emailed to the owner address first. Changing the password signs out every admin session.</p>
        {reset.step === 'idle' ? (
          <button type="button" className="cbtn cbtn--primary cbtn--small" onClick={sendCode} disabled={!a || reset.busy}>
            {reset.busy ? 'Sending…' : 'Email me a reset code'}
          </button>
        ) : (
          <form className="cform" onSubmit={submitReset} noValidate>
            <div className="cfield">
              <label htmlFor="as-code">6-digit code</label>
              <input id="as-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={reset.code} onChange={(e) => setReset((r) => ({ ...r, code: e.target.value }))} />
            </div>
            <div className="cfield">
              <label htmlFor="as-new">New password</label>
              <input id="as-new" type="password" autoComplete="new-password" maxLength={200} value={reset.password} onChange={(e) => setReset((r) => ({ ...r, password: e.target.value }))} />
            </div>
            <div className="cfield">
              <label htmlFor="as-confirm">Confirm new password</label>
              <input id="as-confirm" type="password" autoComplete="new-password" maxLength={200} value={reset.confirm} onChange={(e) => setReset((r) => ({ ...r, confirm: e.target.value }))} />
            </div>
            {reset.devCode ? <p className="cnote cnote--warn">Development mode code: <strong>{reset.devCode}</strong></p> : null}
            <div className="cmodal__foot">
              <button type="button" className="cbtn cbtn--ghost cbtn--small" onClick={() => setReset({ step: 'idle', code: '', password: '', confirm: '', busy: false, message: '', tone: '', devCode: '' })}>
                Cancel
              </button>
              <button type="submit" className="cbtn cbtn--primary cbtn--small" disabled={reset.busy}>
                {reset.busy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
        <p className={`cstatus cstatus--${reset.tone}`} role="status" aria-live="polite">{reset.message}</p>
      </section>
    </div>
  );
}

export function SettingsSection({ call, notify, tab, onTab, onOpenChat, onPasswordChanged }) {
  const tabs = [
    { id: 'security', label: 'Account & security' },
    { id: 'audit', label: 'Audit log' },
    { id: 'emails', label: 'Email delivery' },
    { id: 'reports', label: 'Reports' },
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : 'security';
  return (
    <div className="apage">
      <PageHead title="Settings" subtitle="Your admin account, security activity and notification health" />
      <Chips label="Settings sections" value={current} onChange={onTab} options={tabs} />
      {current === 'security' ? <SecuritySettings call={call} notify={notify} onPasswordChanged={onPasswordChanged} /> : null}
      {current === 'audit' ? <AuditLog call={call} /> : null}
      {current === 'emails' ? (
        <div className="acard acard--panel">
          <EmailLog call={call} onBack={() => onTab('security')} />
        </div>
      ) : null}
      {current === 'reports' ? (
        <div className="acard acard--panel">
          <ReportsPanel call={call} onBack={() => onTab('security')} onOpen={(id) => onOpenChat(id, null)} />
        </div>
      ) : null}
    </div>
  );
}
