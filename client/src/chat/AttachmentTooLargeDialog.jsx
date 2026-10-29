import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { MAX_ATTACHMENT_LABEL } from './attachments.js';

const EXIT_MS = 180;

// Document with a warning badge (matches the reference artwork; decorative only).
function FileWarningArt() {
  return (
    <svg className="cattach-dialog__art" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cattach-doc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f8ff" />
          <stop offset="1" stopColor="#c9dcff" />
        </linearGradient>
        <linearGradient id="cattach-badge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc247" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M14 6h22l12 12v34a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5Z" fill="url(#cattach-doc)" stroke="#2f7bff" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M36 6v8a4 4 0 0 0 4 4h8" fill="#dbe8ff" stroke="#2f7bff" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 27h18M17 34h22M17 41h12" stroke="#2f7bff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="47" cy="47" r="12" fill="url(#cattach-badge)" stroke="#0b1d4d" strokeWidth="2.5" />
      <path d="M47 40.5v8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="47" cy="53.2" r="1.9" fill="#fff" />
    </svg>
  );
}

/**
 * In-app replacement for the browser alert "Attachments must be 10 MB or smaller."
 * Accessible alert dialog: focus moves in (to "Got it"), Tab stays inside, Escape / backdrop /
 * close button dismiss it, and focus returns to `returnFocusRef` (the attach button) afterwards.
 * Presentation only — the size limit itself is enforced by checkAttachment() and by the server.
 */
export default function AttachmentTooLargeDialog({ open, onClose, returnFocusRef }) {
  const [phase, setPhase] = useState(open ? 'open' : 'closed'); // open | closing | closed
  const boxRef = useRef(null);
  const okRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (open) {
      window.clearTimeout(timer.current);
      setPhase('open');
    } else {
      setPhase((p) => (p === 'open' ? 'closing' : p));
    }
  }, [open]);

  useEffect(() => {
    if (phase !== 'closing') return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = window.setTimeout(() => setPhase('closed'), reduce ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer.current);
  }, [phase]);

  // Return focus to the control that opened the dialog once it has fully closed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (phase === 'open') {
      wasOpen.current = true;
      okRef.current?.focus();
    } else if (phase === 'closed' && wasOpen.current) {
      wasOpen.current = false;
      returnFocusRef?.current?.focus?.();
    }
  }, [phase, returnFocusRef]);

  const close = useCallback(() => {
    if (phase === 'open') onClose();
  }, [phase, onClose]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !boxRef.current) return;
    const focusable = [...boxRef.current.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!boxRef.current.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };

  if (phase === 'closed') return null;

  return (
    <div
      className={`cattach-dialog ${phase === 'closing' ? 'is-closing' : ''}`}
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={onKeyDown}
    >
      <div
        ref={boxRef}
        className="cattach-dialog__box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cattach-dialog-title"
        aria-describedby="cattach-dialog-desc cattach-dialog-limit"
      >
        <button type="button" className="cattach-dialog__close" onClick={close} aria-label="Close">
          <Icon name="close" size={22} />
        </button>
        <span className="cattach-dialog__dots" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="cattach-dialog__icon">
          <FileWarningArt />
        </span>
        <h2 id="cattach-dialog-title" className="cattach-dialog__title">
          Attachment too large
        </h2>
        <p id="cattach-dialog-desc" className="cattach-dialog__text">
          Please choose a file under {MAX_ATTACHMENT_LABEL} to continue.
        </p>
        <p id="cattach-dialog-limit" className="cattach-dialog__limit">
          <Icon name="info" size={17} /> Maximum file size: {MAX_ATTACHMENT_LABEL}
        </p>
        <button ref={okRef} type="button" className="cattach-dialog__ok" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
