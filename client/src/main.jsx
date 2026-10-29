import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/welcome.css';

// The chat (/chat, visitors) and the owner-only admin panel (/admin) are separate pages loaded on
// demand, so the portfolio itself downloads neither the realtime client nor any admin code.
const ChatPage = lazy(() => import('./chat/ChatPage.jsx'));
const AdminPage = lazy(() => import('./admin/AdminPage.jsx'));

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const page = path === '/chat' ? 'chat' : path === '/admin' ? 'admin' : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {page ? (
      <Suspense fallback={<div className="chat-boot" role="status">{page === 'admin' ? 'Loading…' : 'Loading chat…'}</div>}>
        {page === 'admin' ? <AdminPage /> : <ChatPage mode="visitor" />}
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
