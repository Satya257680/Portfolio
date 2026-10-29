// Welcome-screen session state and deep-link restore. The storage key is shared with public/boot.js.
export const WELCOME_KEY = 'sn-welcome-seen';

// Shown once per browser tab session: on the first visit, not again on in-page navigation or when
// coming back from /chat. Append ?welcome to the URL to see it again on purpose.
export function shouldShowWelcome() {
  try {
    if (new URLSearchParams(window.location.search).has('welcome')) return true;
    return window.sessionStorage.getItem(WELCOME_KEY) !== '1';
  } catch {
    return true; // storage blocked (private mode): show it, it finishes on its own
  }
}

export function markWelcomeSeen() {
  try {
    window.sessionStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* ignore */
  }
  document.documentElement.removeAttribute('data-welcome');
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Low-powered device / data saver: drop decorative animation and glow layers.
export function isLiteDevice() {
  try {
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    return Boolean(navigator.connection?.saveData) || cores <= 2 || memory <= 2;
  } catch {
    return false;
  }
}

// Section ids are rendered by React after the HTML loads, so the browser's own jump to
// "/#projects" happens too early. Scroll there once the page is visible — unless the browser has
// already restored a scroll position (refresh), which takes priority.
export function restoreDeepLink() {
  let id = '';
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  if (!id || id.includes('=') || window.scrollY > 0) return;
  const target = document.getElementById(id);
  if (!target) return;
  window.requestAnimationFrame(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
    root.style.scrollBehavior = previous;
  });
}
