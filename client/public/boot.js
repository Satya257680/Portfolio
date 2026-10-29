/*
 * Runs before first paint (loaded synchronously from <head>; an external file because the CSP is
 * script-src 'self', which blocks inline scripts). It only decides whether the static welcome
 * screen in index.html may be shown:
 *   - only on the portfolio itself, never on /chat or /admin;
 *   - only once per browser tab session (same key as src/lib/welcome.js).
 * If this file fails to load, nothing is shown early and React still shows the welcome screen.
 */
(function () {
  try {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/chat' || path === '/admin') return;
    var seen = false;
    try {
      seen = window.sessionStorage.getItem('sn-welcome-seen') === '1';
    } catch (e) {
      /* storage blocked: show the welcome screen */
    }
    var forced = /[?&]welcome(?:[=&]|$)/.test(window.location.search);
    if (!seen || forced) document.documentElement.setAttribute('data-welcome', '1');
  } catch (e) {
    /* never block the page */
  }
})();
