import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ContactInbox } from '../chat/AdminPanels.jsx';
import ChatApp from '../chat/ChatApp.jsx';
import { profile } from '../data/portfolioData.js';
import { ADMIN_TOKEN_KEY, api, tokenStore } from '../lib/api.js';
import AdminAccess from './AdminAccess.jsx';
import { AccessSection, AnalyticsSection, DashboardSection, PageHead, SettingsSection, UsersSection } from './AdminSections.jsx';
import '../styles/chat.css';
import '../styles/admin.css';

const SECTIONS = ['dashboard', 'users', 'access', 'chat', 'mychat', 'messages', 'analytics', 'settings'];
const TITLES = {
  dashboard: 'Dashboard',
  users: 'All Users',
  access: 'User Accounts',
  chat: 'Chat (All Users)',
  mychat: 'My Chat (Private)',
  messages: 'Messages',
  analytics: 'Analytics',
  settings: 'Settings',
};

// Reads ?section=…&tab=… plus the legacy email deep links (?c=<conversation> and ?view=contact).
function readLocation() {
  const p = new URLSearchParams(window.location.search);
  const c = Number(p.get('c')) || null;
  let section = SECTIONS.includes(p.get('section')) ? p.get('section') : 'dashboard';
  if (p.get('view') === 'contact') section = 'messages';
  if (c && !p.get('section')) section = 'chat';
  return { section, tab: p.get('tab') || '', conversationId: c };
}

/** /admin — owner-only area. The UI is just a view: every request is authorised by the server. */
export default function AdminPage() {
  const [token, setToken] = useState(() => tokenStore.get(ADMIN_TOKEN_KEY));
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState('checking'); // checking | signedOut | ready | offline
  const [gateNotice, setGateNotice] = useState('');

  useEffect(() => {
    document.body.classList.add('chat-body', 'admin-body');
    // The admin area must never be indexed.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.body.classList.remove('chat-body', 'admin-body');
      meta.remove();
    };
  }, []);

  const check = useCallback(async () => {
    if (!token) {
      setPhase('signedOut');
      return;
    }
    setPhase('checking');
    try {
      const data = await api('/api/chat/me', { token });
      if (!data.isAdmin) throw Object.assign(new Error('not admin'), { status: 401 });
      setMe(data);
      setPhase('ready');
    } catch (err) {
      if (err.status === 401) {
        tokenStore.clear(ADMIN_TOKEN_KEY);
        setToken('');
        setPhase('signedOut');
      } else {
        setPhase('offline');
      }
    }
  }, [token]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (phase !== 'ready') document.title = 'Admin Access · Satyajit Nayak';
  }, [phase]);

  const signedOut = useCallback((notice = '') => {
    tokenStore.clear(ADMIN_TOKEN_KEY);
    setToken('');
    setMe(null);
    setGateNotice(notice);
    setPhase('signedOut');
  }, []);

  const authLost = useCallback(() => signedOut('Your admin session ended. Please sign in again.'), [signedOut]);

  const signOut = async () => {
    const t = token;
    signedOut('You have been signed out.');
    try {
      await api('/api/admin/auth/logout', { method: 'POST', token: t });
    } catch {
      /* session already invalid */
    }
  };

  if (phase === 'ready' && me) {
    return <AdminConsole token={token} me={me} onSignOut={signOut} onAuthLost={authLost} onPasswordChanged={() => signedOut('Password updated. Please sign in with your new password.')} />;
  }

  return (
    <div className="chat-page admin-page admin-page--gate">
      <main className="agate">
        {phase === 'checking' ? (
          <p className="cgate__status" role="status">
            <span className="cspinner" aria-hidden="true" /> Checking your session…
          </p>
        ) : phase === 'offline' ? (
          <div className="aacc" role="alert">
            <h1 className="aacc__title">Can’t reach the server</h1>
            <p className="aacc__subtitle">Your connection or the server may be offline. Your session is kept.</p>
            <button type="button" className="aacc__submit" onClick={check}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {gateNotice ? (
              <p className="agate__notice" role="status">
                {gateNotice}
              </p>
            ) : null}
            <AdminAccess
              onSignedIn={(t) => {
                tokenStore.set(ADMIN_TOKEN_KEY, t);
                setGateNotice('');
                setToken(t);
              }}
            />
            <a className="agate__back" href="/">
              <Icon name="back" size={16} /> Back to portfolio
            </a>
          </>
        )}
      </main>
    </div>
  );
}

function AdminConsole({ token, me, onSignOut, onAuthLost, onPasswordChanged }) {
  const [loc, setLoc] = useState(readLocation);
  const [navOpen, setNavOpen] = useState(false);
  const [period, setPeriod] = useState(30);
  const [summary, setSummary] = useState(null);
  const [summaryState, setSummaryState] = useState({ loading: true, error: '' });
  const [chatUnread, setChatUnread] = useState(null);
  const [chatKey, setChatKey] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const mainRef = useRef(null);

  const call = useCallback(
    (path, opts = {}) =>
      api(path, { ...opts, token }).catch((err) => {
        if (err.status === 401) onAuthLost();
        throw err;
      }),
    [token, onAuthLost],
  );

  const notify = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4500);
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const d = await call(`/api/admin/dashboard?days=${period}`);
      setSummary(d);
      setSummaryState({ loading: false, error: '' });
    } catch (err) {
      setSummaryState({ loading: false, error: err.message });
    }
  }, [call, period]);

  useEffect(() => {
    loadSummary();
    const t = window.setInterval(() => !document.hidden && loadSummary(), 60000);
    return () => window.clearInterval(t);
  }, [loadSummary]);

  // Keep the URL in sync so refresh / back / forward work.
  const navigate = useCallback((section, tab = '', conversationId = null) => {
    const p = new URLSearchParams();
    if (section !== 'dashboard') p.set('section', section);
    if (tab) p.set('tab', tab);
    if (conversationId) p.set('c', String(conversationId));
    const url = `/admin${p.toString() ? `?${p}` : ''}`;
    window.history.pushState(null, '', url);
    setLoc({ section, tab, conversationId });
    setNavOpen(false);
    if (section === 'chat' || section === 'mychat') setChatKey((k) => k + 1);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!['chat', 'mychat'].includes(loc.section)) setChatUnread(null);
    if (loc.section === 'dashboard' || loc.section === 'users') loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.section]);

  const unread = chatUnread ?? summary?.chats.unreadMessages ?? 0;
  useEffect(() => {
    const base = `${TITLES[loc.section]} · Admin — Satyajit Nayak`;
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [loc.section, unread]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const openChat = useCallback((conversationId, type) => navigate(type === 'group' ? 'mychat' : 'chat', '', conversationId), [navigate]);

  const nav = [
    { id: 'dashboard', icon: 'grid', label: 'Dashboard' },
    { id: 'users', icon: 'team', label: 'All Users', badge: summary?.users.total },
    { id: 'access', icon: 'lock', label: 'User Accounts', badge: summary?.users.resetPending || null, badgeTone: 'warn' },
    { id: 'chat', icon: 'chat', label: 'Chat (All Users)', badge: unread || null },
    { id: 'mychat', icon: 'user', label: 'My Chat (Private)' },
    { id: 'messages', icon: 'inbox', label: 'Messages', badge: summary?.contact.unread || null },
    { id: 'analytics', icon: 'chart', label: 'Analytics' },
    { id: 'settings', icon: 'gear', label: 'Settings', badge: summary?.reports.open || null, badgeTone: 'warn' },
  ];

  const s = loc.section;
  return (
    <div className={`chat-page admin-page ${navOpen ? 'is-nav-open' : ''}`}>
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>
      <header className="amobile">
        <button type="button" className="cicon-btn" aria-label="Open admin menu" aria-expanded={navOpen} aria-controls="admin-nav" onClick={() => setNavOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <span className="amobile__title">{TITLES[s]}</span>
        <span className="apill apill--violet">Private</span>
      </header>

      <div className="ashell">
        {navOpen ? <button type="button" className="ashell__scrim" aria-label="Close admin menu" onClick={() => setNavOpen(false)} /> : null}
        <aside className="aside" id="admin-nav" aria-label="Admin navigation">
          <div className="aside__profile">
            <span className="aside__avatar">
              <img src={profile.avatar} alt="" width="48" height="48" />
              <span className="cavatar__online" aria-hidden="true" />
            </span>
            <span className="aside__who">
              <strong>{me.user.name}</strong>
              <span>Admin Panel (Private)</span>
            </span>
            <button type="button" className="cicon-btn aside__close" aria-label="Close admin menu" onClick={() => setNavOpen(false)}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <nav>
            <ul className="aside__nav">
              {nav.map((n) => (
                <li key={n.id}>
                  <a
                    href={`/admin${n.id === 'dashboard' ? '' : `?section=${n.id}`}`}
                    className={`aside__link ${s === n.id ? 'is-active' : ''}`}
                    aria-current={s === n.id ? 'page' : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      navigate(n.id);
                    }}
                  >
                    <Icon name={n.icon} size={20} />
                    <span>{n.label}</span>
                    {n.badge ? (
                      <span className={`aside__badge ${n.badgeTone === 'warn' ? 'aside__badge--warn' : ''}`}>{n.badge > 999 ? '999+' : n.badge}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="aside__foot">
            <a className="aside__link" href="/">
              <Icon name="globe" size={20} />
              <span>View portfolio</span>
            </a>
            <button type="button" className="aside__link aside__link--danger" onClick={onSignOut}>
              <Icon name="logout" size={20} />
              <span>Sign Out</span>
            </button>
            <p className="aside__signed">Signed in as {me.user.email}</p>
          </div>
        </aside>

        <main className="amain" id="admin-main" ref={mainRef} tabIndex={-1} aria-label={TITLES[s]}>
          {s === 'dashboard' ? (
            <DashboardSection
              call={call}
              summary={summary}
              summaryState={summaryState}
              period={period}
              onPeriod={setPeriod}
              onNavigate={navigate}
              onOpenChat={openChat}
            />
          ) : null}
          {s === 'users' ? <UsersSection call={call} token={token} notify={notify} onOpenChat={openChat} summary={summary} /> : null}
          {s === 'access' ? <AccessSection call={call} notify={notify} onOpenChat={openChat} /> : null}
          {s === 'chat' || s === 'mychat' ? (
            <div className="apage apage--chat">
              <PageHead
                title={TITLES[s]}
                subtitle={
                  s === 'chat'
                    ? 'Private one-to-one conversations with visitors. Each visitor only ever sees their own chat.'
                    : 'Your own group conversations — kept separate from visitor chats.'
                }
              />
              <div className="achat">
                <ChatApp
                  key={`${s}-${chatKey}`}
                  mode="admin"
                  embedded
                  scope={s === 'chat' ? 'direct' : 'group'}
                  initialConversationId={loc.conversationId}
                  token={token}
                  me={me}
                  onSignOut={onSignOut}
                  onAuthLost={onAuthLost}
                  onUnreadChange={s === 'chat' ? setChatUnread : null}
                />
              </div>
            </div>
          ) : null}
          {s === 'messages' ? (
            <div className="apage apage--panel">
              <PageHead title="Messages" subtitle="Contact form submissions from your portfolio" />
              <div className="acard acard--panel">
                <ContactInbox call={call} onBack={() => navigate('dashboard')} />
              </div>
            </div>
          ) : null}
          {s === 'analytics' ? <AnalyticsSection call={call} /> : null}
          {s === 'settings' ? (
            <SettingsSection
              call={call}
              notify={notify}
              tab={loc.tab}
              onTab={(t) => navigate('settings', t)}
              onOpenChat={openChat}
              onPasswordChanged={onPasswordChanged}
            />
          ) : null}
        </main>
      </div>

      <div className={`atoast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
