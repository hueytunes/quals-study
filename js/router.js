/* ==========================================================================
   router.js — screen navigation + slide transitions
   ========================================================================== */

const screens = new Map();        // id → { el, render, onEnter }
let currentId = null;
let tabMap = new Map();           // top-level id → tab button element

/* Register a screen. `render` is called to populate DOM; `onEnter` fires
   every time this screen is shown (useful for refreshing live data). */
export function registerScreen(id, opts) {
  screens.set(id, {
    el: opts.el,
    render: opts.render || null,
    onEnter: opts.onEnter || null,
    rendered: false,
  });
}

export function registerTab(id, btn) { tabMap.set(id, btn); }

export function currentScreen() { return currentId; }

/* Navigate to a screen by id. Slides the current screen left, new in from right. */
export function go(id, opts = {}) {
  const target = screens.get(id);
  if (!target) { console.warn('Unknown screen:', id); return; }

  if (target.render && !target.rendered) {
    target.render();
    target.rendered = true;
  }

  const prev = currentId ? screens.get(currentId) : null;
  if (prev && prev.el) {
    prev.el.classList.remove('active');
    prev.el.classList.add('leaving-left');
  }

  // Force reflow for the leaving-left state so the new entry animates cleanly
  target.el.offsetWidth; // eslint-disable-line no-unused-expressions
  target.el.classList.remove('leaving-left');
  // Slight delay lets the transition-out complete frame before transition-in
  setTimeout(() => target.el.classList.add('active'), 10);

  currentId = id;

  // Sync tab bar if this screen id has a matching tab
  if (tabMap.size > 0) {
    for (const [tabId, btn] of tabMap) {
      btn.classList.toggle('active', tabId === id);
    }
  }

  if (target.onEnter) target.onEnter();

  // Scroll new screen to top
  target.el.scrollTop = 0;
}

/* Return to a previous top-level tab. Used by back-arrow from detail screens. */
export function back() {
  // Default to 'home'. Apps that want fancier back-stack can manage it here.
  go('home');
}

/* Re-render a screen next time it's shown (e.g., after settings changed). */
export function invalidate(id) {
  const s = screens.get(id);
  if (s) s.rendered = false;
}

/* Force immediate re-render if currently visible. */
export function refresh(id) {
  const s = screens.get(id);
  if (!s) return;
  if (s.render) s.render();
  s.rendered = true;
  if (s.onEnter && currentId === id) s.onEnter();
}
