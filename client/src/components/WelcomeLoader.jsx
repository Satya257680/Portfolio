import { useEffect, useRef, useState } from 'react';
import { profile } from '../data/portfolioData.js';
import { isLiteDevice, prefersReducedMotion } from '../lib/welcome.js';

// Timing (ms). The screen stays at least MIN_MS so it reads as intentional, and never longer than
// MAX_MS even if an optional request hangs. HARD_STOP_MS is a last-resort timer in case
// requestAnimationFrame is paused (e.g. a background tab).
const MIN_MS = 1800;
const MIN_MS_REDUCED = 700;
const MAX_MS = 6000;
const HARD_STOP_MS = 8000;
const HOLD_MS = 280; // pause on 100% before fading
const FADE_MS = 450;

const statusFor = (pct) =>
  pct >= 100 ? 'READY' : pct >= 70 ? 'PREPARING PORTFOLIO' : pct >= 35 ? 'LOADING PROFILE' : 'INITIALISING';

// Startup work the loader waits for. Each one resolves (never rejects), so a failure cannot block.
function startupTasks() {
  const pageLoaded = new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
  const photoReady = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = profile.photo;
    if (img.complete) resolve();
  });
  const fontsReady = document.fonts?.ready ? document.fonts.ready.then(() => {}, () => {}) : Promise.resolve();
  return [pageLoaded, photoReady, fontsReady];
}

// Decorative background shared with the static copy in index.html (keep the markup in sync).
export function WelcomeBackdrop() {
  return (
    <div className="welcome__bg" aria-hidden="true">
      <span className="welcome__orb welcome__orb--left" />
      <span className="welcome__orb welcome__orb--right" />
      <svg className="welcome__curves" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="welcome-curve-a" x1="0" x2="1">
            <stop offset="0" stopColor="#3b6bff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#5b7cff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="welcome-curve-b" x1="0" x2="1">
            <stop offset="0" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="0.55" stopColor="#c084fc" stopOpacity="0.85" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="none" strokeLinecap="round">
          <path className="welcome__glow" d="M820 120c180 110 300 150 450 110s150-60 170-60" stroke="url(#welcome-curve-a)" strokeWidth="10" />
          <path d="M820 120c180 110 300 150 450 110s150-60 170-60" stroke="url(#welcome-curve-a)" strokeWidth="1.6" />
          <path className="welcome__glow" d="M0 330c200 40 360 160 470 310s210 240 330 260" stroke="url(#welcome-curve-b)" strokeWidth="10" />
          <path d="M0 330c200 40 360 160 470 310s210 240 330 260" stroke="url(#welcome-curve-b)" strokeWidth="1.6" />
          <path className="welcome__glow" d="M980 900c120-170 260-240 460-260" stroke="url(#welcome-curve-b)" strokeWidth="10" />
          <path d="M980 900c120-170 260-240 460-260" stroke="url(#welcome-curve-b)" strokeWidth="1.6" />
          <path d="M60 760c240-40 420 10 560 140" stroke="url(#welcome-curve-a)" strokeWidth="1.2" opacity="0.6" />
          <path d="M1160 560c90-10 200 0 280 30" stroke="url(#welcome-curve-a)" strokeWidth="1.2" opacity="0.6" />
        </g>
      </svg>
    </div>
  );
}

// Centered avatar, title and progress. `percent === null` renders the pre-JavaScript state.
export function WelcomeContent({ percent, status }) {
  const known = typeof percent === 'number';
  return (
    <div className="welcome__content">
      <div className="welcome__avatar">
        <span className="welcome__ring" aria-hidden="true" />
        <span className="welcome__ring welcome__ring--outer" aria-hidden="true" />
        <span className="welcome__photo">
          <img src={profile.photo} alt="" width="640" height="800" decoding="async" />
        </span>
      </div>
      <p className="welcome__kicker">WELCOME TO</p>
      <p className="welcome__title">
        {profile.firstName.toUpperCase()}’S <span className="welcome__accent">PORTFOLIO</span>
      </p>
      <p className="welcome__role">{profile.headline}</p>
      <div
        className={`welcome__track ${known ? '' : 'welcome__track--pending'}`}
        role="progressbar"
        aria-label={`Loading ${profile.firstName}’s portfolio`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
      >
        <span className="welcome__bar" style={known ? { width: `${percent}%` } : undefined} />
      </div>
      <div className="welcome__meta" aria-hidden="true">
        <span className="welcome__status">{status}</span>
        <span className="welcome__pct">{known ? `${percent}%` : ''}</span>
      </div>
    </div>
  );
}

/**
 * Full-screen welcome / loading screen shown before the portfolio on the first visit of a session.
 * Progress follows real startup work (page load, profile photo, fonts) blended with a minimum
 * display time, always reaches 100 %, then fades out and calls onFinish().
 */
export default function WelcomeLoader({ onFinish }) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading | done | leaving
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const reduced = useRef(prefersReducedMotion()).current;
  const lite = useRef(isLiteDevice()).current;

  useEffect(() => {
    const start = performance.now();
    const minMs = reduced ? MIN_MS_REDUCED : MIN_MS;
    const tasks = startupTasks();
    let done = 0;
    let shown = 0;
    let frame = 0;
    let finished = false;
    const timers = [];
    tasks.forEach((t) => t.then(() => { done += 1; }));

    // Lock page scroll while the overlay covers it.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      setPercent(100);
      setPhase('done');
      timers.push(setTimeout(() => setPhase('leaving'), HOLD_MS));
      timers.push(setTimeout(() => finishRef.current?.(), HOLD_MS + (reduced ? 0 : FADE_MS)));
    };

    const tick = (now) => {
      const elapsed = now - start;
      const timeFrac = Math.min(1, elapsed / minMs);
      const workFrac = elapsed >= MAX_MS ? 1 : done / tasks.length;
      // Until all work is done, progress may only reach a cap that grows with completed work and
      // creeps slowly with time, so it never looks frozen.
      const cap = workFrac >= 1 ? 1 : Math.min(0.95, 0.3 + 0.55 * workFrac + 0.15 * (elapsed / MAX_MS));
      const eased = 1 - (1 - timeFrac) ** 2;
      const target = Math.min(eased, cap);
      shown = reduced ? target : shown + (target - shown) * 0.14;
      if (target >= 1 && shown > 0.995) return finish();
      setPercent((prev) => Math.max(prev, Math.min(99, Math.round(shown * 100))));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    timers.push(setTimeout(finish, HARD_STOP_MS));

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      root.style.overflow = prevOverflow;
    };
  }, [reduced]);

  return (
    <div
      className={`welcome welcome--${phase} ${reduced ? 'welcome--reduced' : ''} ${lite ? 'welcome--lite' : ''}`}
      style={{ '--welcome-fade': `${reduced ? 0 : FADE_MS}ms` }}
      aria-busy={phase === 'loading'}
    >
      <WelcomeBackdrop />
      <WelcomeContent percent={percent} status={statusFor(percent)} />
    </div>
  );
}
