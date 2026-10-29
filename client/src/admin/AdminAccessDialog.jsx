import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_TOKEN_KEY, tokenStore } from '../lib/api.js';
import AdminAccess from './AdminAccess.jsx';
import '../styles/chat.css';
import '../styles/admin.css';

// Pop-over sign-in opened from the owner-only lock button on the portfolio navbar.
// Loaded on demand, so ordinary visitors never download it. Signing in leads to /admin,
// where (as on every admin API call) the server decides whether access is allowed.
export default function AdminAccessDialog({ onClose, returnFocusRef }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const trigger = returnFocusRef?.current;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus?.();
    };
  }, [onClose, returnFocusRef]);

  // Portalled to <body>: the navbar uses backdrop-filter, which would otherwise trap this fixed overlay.
  return createPortal(
    <div className="admin-theme aaccess-pop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="aaccess-pop__box" role="dialog" aria-modal="true" aria-labelledby="aacc-title">
        <AdminAccess
          onClose={onClose}
          onSignedIn={(token) => {
            tokenStore.set(ADMIN_TOKEN_KEY, token);
            window.location.assign('/admin');
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
