// Open a URL in the device's real web browser.
//
// tinypos runs as an installed PWA on register tablets. When launched from the
// home screen in standalone mode, a bare `window.open(url, '_blank')` can be
// swallowed by the standalone WebView (notably iOS Safari), so the menu link
// opens inside the POS shell instead of a browser tab. Clicking a real
// <a target="_blank" rel="noopener"> synthesized from the user gesture is the
// most reliable way to hand the URL to the system browser across iOS/Android
// standalone PWAs and normal browser contexts alike.
//
// Whether it lands in a brand-new browser *app* vs. a Custom Tab is ultimately
// the OS's call — this is the furthest a web app can push it from its side.
export function openInBrowser(url) {
  if (!url || typeof window === 'undefined') return;
  try {
    const a = window.document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    // Must be in the DOM for the synthetic click to be treated as user-driven
    // navigation in some engines.
    window.document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Last resort — the classic popup. Still better than silently failing.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// True when the app is running as an installed/standalone PWA (home-screen
// launch), where in-app link handling is the problem the helper above solves.
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator?.standalone === true // iOS Safari
  );
}
