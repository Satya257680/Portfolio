import { useCallback, useEffect, useState } from 'react';
import { ADMIN_TOKEN_KEY, VISITOR_TOKEN_KEY, api, tokenStore } from '../lib/api.js';
import { AdminLogin, VisitorVerify } from './AuthViews.jsx';
import ChatApp from './ChatApp.jsx';
import TopBar from './TopBar.jsx';
import '../styles/chat.css';

export default function ChatPage({ mode }) {
  const tokenKey = mode === 'admin' ? ADMIN_TOKEN_KEY : VISITOR_TOKEN_KEY;
  const [token, setToken] = useState(() => tokenStore.get(tokenKey));
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState('checking'); // checking | signedOut | ready | offline
  const [status, setStatus] = useState(null);

  useEffect(() => {
    document.title = mode === 'admin' ? 'Admin · Portfolio Chat — Satyajit Nayak' : 'Portfolio Chat — Satyajit Nayak';
    document.body.classList.add('chat-body');
    return () => document.body.classList.remove('chat-body');
  }, [mode]);

  const loadStatus = useCallback(() => {
    api('/api/chat/status')
      .then(setStatus)
      .catch(() => setStatus({ enabled: false }));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const check = useCallback(async () => {
    if (!token) {
      setPhase('signedOut');
      return;
    }
    setPhase('checking');
    try {
      const data = await api('/api/chat/me', { token });
      if (mode === 'admin' && !data.isAdmin) throw Object.assign(new Error('not admin'), { status: 401 });
      if (mode === 'visitor' && data.isAdmin) throw Object.assign(new Error('admin session'), { status: 401 });
      setMe(data);
      setPhase('ready');
    } catch (err) {
      if (err.status === 401) {
        tokenStore.clear(tokenKey);
        setToken('');
        setPhase('signedOut');
      } else {
        setPhase('offline');
      }
    }
  }, [token, mode, tokenKey]);

  useEffect(() => {
    check();
  }, [check]);

  const onSignedIn = (newToken) => {
    tokenStore.set(tokenKey, newToken);
    setToken(newToken);
  };

  const signOut = async () => {
    const t = token;
    tokenStore.clear(tokenKey);
    setToken('');
    setMe(null);
    setPhase('signedOut');
    try {
      await api(mode === 'admin' ? '/api/admin/auth/logout' : '/api/chat/auth/logout', { method: 'POST', token: t });
    } catch {
      /* session already invalid */
    }
  };

  const authLost = useCallback(() => {
    tokenStore.clear(tokenKey);
    setToken('');
    setMe(null);
    setPhase('signedOut');
  }, [tokenKey]);

  if (phase === 'ready' && me) {
    return (
      <div className="chat-page">
        <ChatApp mode={mode} token={token} me={me} onSignOut={signOut} onAuthLost={authLost} />
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-shell chat-shell--gate">
        <TopBar mode={mode} ownerOnline={Boolean(status?.ownerOnline)} />
        <div className="cgate">
          {phase === 'checking' ? (
            <p className="cgate__status" role="status">
              <span className="cspinner" aria-hidden="true" /> Connecting…
            </p>
          ) : phase === 'offline' ? (
            <div className="cgate__card" role="alert">
              <h1 className="cgate__title">Can’t reach the chat server</h1>
              <p className="cgate__text">Your connection or the server may be offline. Your session is kept — try again in a moment.</p>
              <button type="button" className="cbtn cbtn--primary" onClick={check}>
                Try again
              </button>
            </div>
          ) : mode === 'admin' ? (
            <AdminLogin onSignedIn={onSignedIn} />
          ) : (
            <VisitorVerify status={status} onSignedIn={onSignedIn} />
          )}
        </div>
      </div>
    </div>
  );
}
