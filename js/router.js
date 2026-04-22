/* ==========================================================================
   router.js — screen navigation + slide transitions + back stack
   ========================================================================== */

const screens = new Map();        // id → { el, render, onEnter }
let currentId = null;
let tabMap = new Map();           // top-level id → tab button element

// History stack: every non-back navigation pushes the previous screen id here
// so back() can pop. Top-level tab switches clear the stack so each tab is a
// fresh "root" — you don't walk back across tab changes.
const history = [];
const TOP_LEVEL = new Set(['home', 'topics', 'cards', 'qanda']);

// Map every detail screen to the top-level tab it belongs to so the tab bar
// stays highlighted when you drill in. e.g. tier → topics, qlist → qanda.
const SCREEN_TO_TAB = {
  home: 'home',
  topics: 'topics',
  tier: 'topics',
  section: 'topics',
  settings: 'home',
  cards: 'cards',
  deck: 'cards',
  quizmenu: 'cards',
  quiz: 'cards',
  qanda: 'qanda',
  qlist: 'qanda',
};

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

/* Navigate to a screen by id. Slides the current screen left, new in from right.
   opts.replace — don't push the current screen on the history stack (used by back()). */
export function go(id, opts = {}) {
  const target = screens.get(id);
  if (!target) { console.warn('Unknown screen:', id); return; }

  if (target.render && !target.rendered) {
    target.render();
    target.rendered = true;
  }

  const prev = currentId ? screens.get(currentId) : null;

  // Manage history stack: top-level tab switches RESET the stack (so each tab
  // is its own root). Anything else PUSHES the previous screen onto history.
  if (!opts.replace && currentId && currentId !== id) {
    if (TOP_LEVEL.has(id)) {
      history.length = 0;
    } else {
      history.push(currentId);
    }
  }

  if (prev && prev.el) {
    prev.el.classList.remove('active');
    prev.el.classList.add('leaving-left');
  }

  target.el.offsetWidth; // eslint-disable-line no-unused-expressions
  target.el.classList.remove('leaving-left');
  setTimeout(() => target.el.classList.add('active'), 10);

  currentId = id;

  // Sync tab bar: pick the parent tab this screen belongs to
  const parentTab = SCREEN_TO_TAB[id] || id;
  if (tabMap.size > 0) {
    for (const [tabId, btn] of tabMap) {
      btn.classList.toggle('active', tabId === parentTab);
    }
  }

  if (target.onEnter) target.onEnter();

  target.el.scrollTop = 0;
}

/* Pop history. If empty, fall back to the parent tab for the current screen. */
export function back() {
  if (history.length > 0) {
    const prevId = history.pop();
    go(prevId, { replace: true });
    return;
  }
  const parentTab = SCREEN_TO_TAB[currentId] || 'home';
  if (parentTab !== currentId) go(parentTab, { replace: true });
  else go('home', { replace: true });
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
