import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/welcome.css';

// The chat is a separate page (/chat for visitors, /admin for the owner) and is loaded on demand,
// so the portfolio itself does not download the realtime client.
const ChatPage = lazy(() => import('./chat/ChatPage.jsx'));

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const mode = path === '/chat' ? 'visitor' : path === '/admin' ? 'admin' : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {mode ? (
      <Suspense fallback={<div className="chat-boot" role="status">Loading chat…</div>}>
        <ChatPage mode={mode} />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
