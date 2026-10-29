import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Icon from '../components/Icon.jsx';
import { contact } from '../data/portfolioData.js';
import { API_BASE, CHAT_DRAFT_KEY, api } from '../lib/api.js';
import { ContactInbox, EmailLog, ReportsPanel, PasswordManagement } from './AdminPanels.jsx';
import TopBar from './TopBar.jsx';
import ChatWindow from './ChatWindow.jsx';
import { GroupInfoDialog, NewGroupDialog, ReportDialog } from './Dialogs.jsx';
import Sidebar from './Sidebar.jsx';
import { ATTACHMENT_MESSAGES } from './attachments.js';
import { clientId, mergeMessages } from './chatUtils.js';

const MOBILE_QUERY = '(max-width: 760px)';
const isMobile = () => typeof window !== 'undefined' && window.matchMedia?.(MOBILE_QUERY).matches;

function readDraftFromContact() {
  try {
    const d = sessionStorage.getItem(CHAT_DRAFT_KEY) || '';
    sessionStorage.removeItem(CHAT_DRAFT_KEY);
    return d.slice(0, 2000);
  } catch {
    return '';
  }
}

// `embedded` renders the chat inside the admin panel (no top bar or hamburger menu; the panel's own
// sidebar provides navigation). `scope` limits the list to 'direct' (visitor chats) or 'group'
// (the owner's private groups); the server still only returns conversations the caller belongs to.
export default function ChatApp({ mode, token, me, onSignOut, onAuthLost, embedded = false, scope = null, initialConversationId = null, onUnreadChange = null }) {
  const isAdmin = mode === 'admin';
  const myId = me.user.id;

  const [view, setView] = useState('chats'); // chats | contact | emails | reports
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState([]);
  const [listState, setListState] = useState({ loading: true, error: '' });
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({}); // id -> { items, hasMore, loading, error, loaded }
  const [details, setDetails] = useState({});
  const [typing, setTyping] = useState({});
  const [ownerOnline, setOwnerOnline] = useState(Boolean(me.owner?.online));
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [dialog, setDialog] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [initialDraft] = useState(() => (mode === 'visitor' ? readDraftFromContact() : ''));

  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const socketRef = useRef(null);
  const readTimer = useRef(null);
  const firstLoad = useRef(true);
  const filterRef = useRef({ filter, query });
  filterRef.current = { filter, query };
  const convRef = useRef(conversations);
  convRef.current = conversations;
  const toastTimer = useRef(null);

  const call = useCallback(
    (path, opts = {}) =>
      api(path, { ...opts, token }).catch((err) => {
        if (err.status === 401) onAuthLost();
        throw err;
      }),
    [token, onAuthLost],
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3500);
  }, []);

  // ---------- data loading ----------
  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      const { filter: f, query: q } = filterRef.current;
      if (!silent) setListState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const params = new URLSearchParams({ filter: f });
        if (scope) params.set('type', scope);
        if (q.trim()) params.set('q', q.trim());
        const data = await call(`/api/chat/conversations?${params}`);
        setConversations(data.conversations);
        setListState({ loading: false, error: '' });
        return data.conversations;
      } catch (err) {
        setListState({ loading: false, error: err.message });
        return null;
      }
    },
    [call, scope],
  );

  const loadDetail = useCallback(
    async (id) => {
      try {
        const data = await call(`/api/chat/conversations/${id}`);
        setDetails((d) => ({ ...d, [id]: data.conversation }));
      } catch (err) {
        if (err.status === 404) {
          setConversations((list) => list.filter((c) => c.id !== id));
          if (activeRef.current === id) setActiveId(null);
        }
      }
    },
    [call],
  );

  const loadMessages = useCallback(
    async (id, { before = null, silent = false } = {}) => {
      if (!silent) {
        setMessages((m) => ({ ...m, [id]: { ...(m[id] || { items: [] }), loading: true, error: '' } }));
      }
      try {
        const params = new URLSearchParams({ limit: '40' });
        if (before) params.set('before', String(before));
        const data = await call(`/api/chat/conversations/${id}/messages?${params}`);
        setMessages((m) => {
          const prev = m[id] || { items: [] };
          return {
            ...m,
            [id]: {
              items: mergeMessages(prev.items, data.messages),
              hasMore: before ? data.hasMore : prev.loaded ? prev.hasMore : data.hasMore,
              loading: false,
              error: '',
              loaded: true,
            },
          };
        });
      } catch (err) {
        setMessages((m) => ({ ...m, [id]: { ...(m[id] || { items: [] }), loading: false, error: err.message } }));
      }
    },
    [call],
  );

  const markRead = useCallback(
    (id) => {
      window.clearTimeout(readTimer.current);
      readTimer.current = window.setTimeout(() => {
        if (document.hidden) return;
        setConversations((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
        call(`/api/chat/conversations/${id}/read`, { method: 'PATCH', body: {} }).catch(() => {});
      }, 400);
    },
    [call],
  );

  // Initial + filter/search changes (search is debounced).
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const list = await loadConversations();
      if (firstLoad.current && list) {
        firstLoad.current = false;
        const params = new URLSearchParams(embedded ? '' : window.location.search);
        const deepLink = embedded ? Number(initialConversationId) : Number(params.get('c'));
        if (isAdmin && params.get('view') === 'contact') setView('contact');
        if (deepLink && list.some((c) => c.id === deepLink)) setActiveId(deepLink);
        else if (!isMobile() && list.length && (mode === 'visitor' || list[0].unread)) setActiveId(list[0].id);
        else if (mode === 'visitor' && list.length === 1 && initialDraft) setActiveId(list[0].id);
      }
    }, query ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [filter, query, loadConversations, isAdmin, mode, initialDraft, embedded, initialConversationId]);

  // Opening a conversation loads its details and latest messages.
  useEffect(() => {
    if (!activeId) return;
    if (!messages[activeId]?.loaded) loadMessages(activeId);
    loadDetail(activeId);
    markRead(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // ---------- realtime ----------
  useEffect(() => {
    const socket = io(API_BASE || undefined, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Catch up on anything missed while disconnected.
      loadConversations({ silent: true });
      if (activeRef.current) loadMessages(activeRef.current, { silent: true });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setConnected(false);
      if (err?.message === 'unauthorized') {
        socket.disconnect();
        onAuthLost();
      }
    });

    socket.on('message:new', ({ conversationId, message }) => {
      setMessages((m) => (m[conversationId]?.loaded ? { ...m, [conversationId]: { ...m[conversationId], items: mergeMessages(m[conversationId].items, [message]) } } : m));
      const mine = message.senderId === myId;
      const viewing = activeRef.current === conversationId && !document.hidden;
      const known = convRef.current.some((c) => c.id === conversationId);
      setConversations((list) => {
        const idx = list.findIndex((c) => c.id === conversationId);
        if (idx === -1) return list;
        const c = list[idx];
        const updated = {
          ...c,
          lastMessage: { id: message.id, body: message.body.slice(0, 160), senderId: message.senderId, senderName: message.senderName, type: message.type, createdAt: message.createdAt },
          lastActivityAt: message.createdAt,
          unread: mine || viewing ? c.unread : c.unread + 1,
        };
        return [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
      });
      if (!known) loadConversations({ silent: true });
      setTyping((t) => (t[conversationId] ? { ...t, [conversationId]: null } : t));
      if (!mine && viewing) markRead(conversationId);
    });

    socket.on('read:updated', ({ conversationId, userId, lastReadMessageId }) => {
      setDetails((d) => {
        const det = d[conversationId];
        if (!det) return d;
        return {
          ...d,
          [conversationId]: {
            ...det,
            members: det.members.map((m) => (m.id === userId ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, lastReadMessageId) } : m)),
          },
        };
      });
      if (userId === myId) setConversations((list) => list.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)));
    });

    socket.on('typing', ({ conversationId, userId, name }) => {
      if (userId === myId) return;
      setTyping((t) => ({ ...t, [conversationId]: { name, until: Date.now() + 3500 } }));
    });

    socket.on('presence:owner', ({ online: on }) => setOwnerOnline(on));
    socket.on('presence:user', ({ userId, online: on }) => {
      setConversations((list) => list.map((c) => (c.other?.id === userId ? { ...c, other: { ...c.other, online: on } } : c)));
      setDetails((d) => {
        const next = { ...d };
        for (const k of Object.keys(next)) {
          next[k] = { ...next[k], members: next[k].members.map((m) => (m.id === userId ? { ...m, online: on } : m)) };
        }
        return next;
      });
    });

    socket.on('conversation:new', () => loadConversations({ silent: true }));
    socket.on('conversation:updated', ({ conversationId }) => {
      loadConversations({ silent: true });
      if (activeRef.current === conversationId) loadDetail(conversationId);
    });
    socket.on('conversation:removed', ({ conversationId }) => {
      setConversations((list) => list.filter((c) => c.id !== conversationId));
      if (activeRef.current === conversationId) {
        setActiveId(null);
        showToast('You are no longer a member of that group.');
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, myId, loadConversations, loadMessages, loadDetail, markRead, onAuthLost, showToast]);

  // Polling fallback while the realtime connection is down.
  useEffect(() => {
    if (connected) return undefined;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      loadConversations({ silent: true });
      if (activeRef.current) loadMessages(activeRef.current, { silent: true });
    }, 10000);
    return () => window.clearInterval(t);
  }, [connected, loadConversations, loadMessages]);

  // Typing indicators expire.
  useEffect(() => {
    const t = window.setInterval(() => {
      setTyping((cur) => {
        const now = Date.now();
        let changed = false;
        const next = { ...cur };
        for (const k of Object.keys(next)) {
          if (next[k] && next[k].until < now) {
            next[k] = null;
            changed = true;
          }
        }
        return changed ? next : cur;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Network status + mark read when the tab becomes visible again.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const vis = () => {
      if (!document.hidden && activeRef.current) markRead(activeRef.current);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [markRead]);

  // Unread count in the tab title.
  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + (c.unread || 0), 0), [conversations]);
  useEffect(() => {
    onUnreadChange?.(totalUnread);
    if (embedded) return; // the admin panel manages its own title
    const base = isAdmin ? 'Admin · Portfolio Chat — Satyajit Nayak' : 'Portfolio Chat — Satyajit Nayak';
    document.title = totalUnread ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread, isAdmin, embedded, onUnreadChange]);

  // ---------- actions ----------
  const postMessage = useCallback(
    async (conversationId, pending) => {
      try {
        const data = await call(`/api/chat/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: { body: pending.body, clientMessageId: pending.clientMessageId },
        });
        setMessages((m) => ({ ...m, [conversationId]: { ...m[conversationId], items: mergeMessages(m[conversationId]?.items, [data.message]) } }));
        setConversations((list) => {
          const idx = list.findIndex((c) => c.id === conversationId);
          if (idx === -1) return list;
          const c = { ...list[idx], lastMessage: { ...data.message, body: data.message.body.slice(0, 160) }, lastActivityAt: data.message.createdAt };
          return [c, ...list.slice(0, idx), ...list.slice(idx + 1)];
        });
        return true;
      } catch (err) {
        setMessages((m) => ({
          ...m,
          [conversationId]: {
            ...m[conversationId],
            items: (m[conversationId]?.items || []).map((x) =>
              x.clientMessageId === pending.clientMessageId && !x.id ? { ...x, status: 'failed', error: err.message } : x,
            ),
          },
        }));
        return false;
      }
    },
    [call],
  );

  const send = useCallback(
    (conversationId, body) => {
      const pending = {
        id: null,
        clientMessageId: clientId(),
        conversationId,
        senderId: myId,
        senderName: me.user.name,
        body,
        type: 'text',
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      setMessages((m) => ({ ...m, [conversationId]: { ...(m[conversationId] || { items: [], loaded: true }), items: [...(m[conversationId]?.items || []), pending] } }));
      return postMessage(conversationId, pending);
    },
    [myId, me.user.name, postMessage],
  );

  // Throws an Error carrying { status, code } so the window can tell the size limit
  // (code ATTACHMENT_TOO_LARGE → attachment dialog) apart from every other failure (toast).
  const uploadAttachment = useCallback(async (conversationId, file) => {
    const url = `${API_BASE}/api/chat/conversations/${conversationId}/attachments?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || 'application/octet-stream')}`;
    let response;
    try {
      response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: file });
    } catch {
      throw Object.assign(new Error(ATTACHMENT_MESSAGES.network), { status: 0, code: 'NETWORK' });
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) onAuthLost();
    if (!response.ok || data.ok === false) {
      throw Object.assign(new Error(data.message || `Upload failed (${response.status}).`), { status: response.status, code: data.code || null });
    }
    setMessages((m) => ({ ...m, [conversationId]: { ...(m[conversationId] || { items: [], loaded: true }), items: mergeMessages(m[conversationId]?.items || [], [data.message]) } }));
    setConversations((list) => {
      const idx = list.findIndex((c) => c.id === conversationId);
      if (idx < 0) return list;
      const c = { ...list[idx], lastMessage: { ...data.message, body: `📎 ${file.name}` }, lastActivityAt: data.message.createdAt };
      return [c, ...list.slice(0, idx), ...list.slice(idx + 1)];
    });
    showToast('Attachment sent.');
    return true;
  }, [token, showToast, onAuthLost]);

  const downloadAttachment = useCallback(async (attachment) => {
    try {
      const response = await fetch(`${API_BASE}/api/chat/attachments/${attachment.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || 'Could not download attachment.'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = attachment.name || 'attachment'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { showToast(err.message); }
  }, [token, showToast]);

  const retry = useCallback(
    (conversationId, pending) => {
      setMessages((m) => ({
        ...m,
        [conversationId]: {
          ...m[conversationId],
          items: m[conversationId].items.map((x) => (x.clientMessageId === pending.clientMessageId && !x.id ? { ...x, status: 'pending', error: '' } : x)),
        },
      }));
      // Same clientMessageId → the server stores it at most once.
      postMessage(conversationId, pending);
    },
    [postMessage],
  );

  const discard = useCallback((conversationId, pending) => {
    setMessages((m) => ({
      ...m,
      [conversationId]: { ...m[conversationId], items: m[conversationId].items.filter((x) => x.id || x.clientMessageId !== pending.clientMessageId) },
    }));
  }, []);

  const emitTyping = useCallback((conversationId) => {
    socketRef.current?.emit('typing', { conversationId });
  }, []);

  const runAction = useCallback(
    async (action, conv) => {
      try {
        switch (action) {
          case 'unread':
            await call(`/api/chat/conversations/${conv.id}/unread`, { method: 'PATCH' });
            setActiveId(null);
            loadConversations({ silent: true });
            break;
          case 'archive':
          case 'unarchive':
          case 'close':
          case 'reopen': {
            const status = action === 'archive' ? 'archived' : action === 'close' ? 'closed' : 'open';
            await call(`/api/admin/conversations/${conv.id}/status`, { method: 'PATCH', body: { status } });
            showToast(action === 'archive' ? 'Chat archived.' : action === 'close' ? 'Conversation closed.' : 'Conversation reopened.');
            if (action === 'archive' || action === 'unarchive') setActiveId(null);
            loadConversations({ silent: true });
            loadDetail(conv.id);
            break;
          }
          case 'block':
          case 'unblock': {
            const other = details[conv.id]?.members.find((m) => !m.isOwner);
            if (!other) return;
            if (action === 'block' && !window.confirm(`Block ${other.name}? They will be signed out and cannot start new chats.`)) return;
            await call(`/api/admin/users/${other.id}/block`, { method: 'POST', body: { blocked: action === 'block' } });
            showToast(action === 'block' ? `${other.name} was blocked.` : `${other.name} was unblocked.`);
            loadConversations({ silent: true });
            loadDetail(conv.id);
            break;
          }
          case 'mute8':
          case 'mute168':
          case 'unmute': {
            const hours = action === 'unmute' ? 0 : action === 'mute8' ? 8 : 168;
            await call(`/api/chat/conversations/${conv.id}/mute`, { method: 'PATCH', body: { hours } });
            showToast(hours ? `Email notifications muted for ${hours === 8 ? '8 hours' : '1 week'}.` : 'Notifications unmuted.');
            loadDetail(conv.id);
            break;
          }
          case 'groupInfo':
            setDialog({ type: 'groupInfo', id: conv.id });
            break;
          case 'report':
            setDialog({ type: 'report', id: conv.id });
            break;
          default:
        }
      } catch (err) {
        showToast(err.message);
      }
    },
    [call, details, loadConversations, loadDetail, showToast],
  );

  const openConversation = (id) => {
    setView('chats');
    setActiveId(id);
  };

  const active = conversations.find((c) => c.id === activeId) || null;
  const detail = activeId ? details[activeId] : null;
  const mainOpen = view !== 'chats' || Boolean(activeId);

  const menuItems = isAdmin
    ? [
        { key: 'chats', icon: 'chat', label: 'Chats', onClick: () => { setView('chats'); setFilter('all'); } },
        { key: 'archived', icon: 'archive', label: 'Archived chats', onClick: () => { setView('chats'); setFilter('archived'); setActiveId(null); } },
        { key: 'newGroup', icon: 'team', label: 'New group', onClick: () => setDialog({ type: 'newGroup' }) },
        { key: 'contact', icon: 'inbox', label: 'Contact form inbox', onClick: () => { setView('contact'); setActiveId(null); } },
        { key: 'emails', icon: 'mail', label: 'Email delivery log', onClick: () => { setView('emails'); setActiveId(null); } },
        { key: 'reports', icon: 'flag', label: 'Reports', onClick: () => { setView('reports'); setActiveId(null); } },
        { key: 'passwords', icon: 'lock', label: 'Password Management', onClick: () => { setView('passwords'); setActiveId(null); } },
        { key: 'site', icon: 'globe', label: 'View portfolio', href: '/' },
        { key: 'signout', icon: 'logout', label: 'Sign out', onClick: onSignOut },
      ]
    : [
        { key: 'site', icon: 'globe', label: 'Back to portfolio', href: '/#contact' },
        { key: 'email', icon: 'mail', label: 'Email instead', href: `mailto:${contact.email}` },
        { key: 'signout', icon: 'logout', label: 'Sign out of chat', onClick: onSignOut },
      ];

  const menu = (
    <div className="cmenu">
      <button
        type="button"
        className="cicon-btn"
        aria-label="Open menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <Icon name="menu" size={22} />
      </button>
      {menuOpen ? (
        <>
          <button type="button" className="cmenu__backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <ul className="cmenu__list" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
            <li className="cmenu__who" role="presentation">
              Signed in as <strong>{me.user.email}</strong>
            </li>
            {menuItems.map((item) => (
              <li key={item.key} role="none">
                {item.href ? (
                  <a role="menuitem" href={item.href} className="cmenu__item">
                    <Icon name={item.icon} size={18} /> {item.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="cmenu__item"
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                  >
                    <Icon name={item.icon} size={18} /> {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );

  return (
    <div className={`chat-shell ${embedded ? 'chat-shell--embedded' : ''} ${mainOpen ? 'chat-shell--main' : 'chat-shell--list'}`}>
      {embedded ? null : <TopBar mode={mode} menu={menu} ownerOnline={isAdmin ? connected : ownerOnline} />}
      {!online || (!connected && !listState.loading) ? (
        <p className="cbanner" role="status">
          {!online ? 'You are offline — messages will send when you reconnect.' : 'Reconnecting… updates every few seconds until the live connection is back.'}
        </p>
      ) : null}
      <div className="chat-body-grid">
        <Sidebar
          isAdmin={isAdmin}
          scope={scope}
          myId={myId}
          conversations={conversations}
          listState={listState}
          activeId={view === 'chats' ? activeId : null}
          filter={filter}
          query={query}
          typing={typing}
          onFilter={(f) => {
            setFilter(f);
            setView('chats');
          }}
          onQuery={setQuery}
          onOpen={openConversation}
          onRetry={() => loadConversations()}
          onNewGroup={isAdmin && scope !== 'direct' ? () => setDialog({ type: 'newGroup' }) : null}
        />
        <main className="cmain" aria-label="Conversation">
          {view === 'contact' ? (
            <ContactInbox call={call} onBack={() => setView('chats')} />
          ) : view === 'emails' ? (
            <EmailLog call={call} onBack={() => setView('chats')} />
          ) : view === 'reports' ? (
            <ReportsPanel call={call} onBack={() => setView('chats')} onOpen={openConversation} />
          ) : view === 'passwords' ? (
            <PasswordManagement call={call} onBack={() => setView('chats')} />
          ) : active ? (
            <ChatWindow
              key={active.id}
              isAdmin={isAdmin}
              myId={myId}
              conversation={active}
              detail={detail}
              thread={messages[active.id]}
              typing={typing[active.id]}
              ownerOnline={ownerOnline}
              initialDraft={mode === 'visitor' ? initialDraft : ''}
              onBack={() => setActiveId(null)}
              onSend={(body) => send(active.id, body)}
              onUpload={(file) => uploadAttachment(active.id, file)}
              onNotice={showToast}
              onDownload={downloadAttachment}
              onRetry={(p) => retry(active.id, p)}
              onDiscard={(p) => discard(active.id, p)}
              onLoadOlder={() => {
                const first = messages[active.id]?.items.find((m) => m.id);
                if (first) loadMessages(active.id, { before: first.id });
              }}
              onReload={() => loadMessages(active.id)}
              onTyping={() => emitTyping(active.id)}
              onAction={(a) => runAction(a, active)}
            />
          ) : (
            <div className="cempty">
              <span className="cempty__icon" aria-hidden="true">
                <Icon name="chat" size={40} />
              </span>
              <h2>{scope === 'group' ? 'My private conversations' : isAdmin ? 'Portfolio Chat inbox' : 'Your private chat'}</h2>
              <p>
                {scope === 'group'
                  ? conversations.length
                    ? 'Select a conversation to read and reply.'
                    : 'No private groups yet. Use + to create one with verified chat users.'
                  : isAdmin
                    ? conversations.length
                      ? 'Select a conversation to read and reply.'
                      : 'No conversations yet. New visitor chats appear here instantly.'
                    : 'Select the conversation to start messaging Satyajit.'}
              </p>
              <p className="cempty__lock">
                <Icon name="lock" size={14} /> Messages are private to the members of each conversation.
              </p>
            </div>
          )}
        </main>
      </div>

      {dialog?.type === 'newGroup' ? (
        <NewGroupDialog
          call={call}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            setFilter('all');
            loadConversations({ silent: true }).then(() => openConversation(id));
          }}
        />
      ) : null}
      {dialog?.type === 'groupInfo' && details[dialog.id] ? (
        <GroupInfoDialog
          call={call}
          isAdmin={isAdmin}
          myId={myId}
          detail={details[dialog.id]}
          onClose={() => setDialog(null)}
          onChanged={() => {
            loadDetail(dialog.id);
            loadConversations({ silent: true });
          }}
          onLeft={() => {
            setDialog(null);
            setActiveId(null);
            loadConversations({ silent: true });
          }}
        />
      ) : null}
      {dialog?.type === 'report' ? (
        <ReportDialog call={call} conversationId={dialog.id} onClose={() => setDialog(null)} onDone={(msg) => { setDialog(null); showToast(msg); }} />
      ) : null}

      <div className={`ctoast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
