/* main.js — entry: theme, router, tabs, swipes, boot. */
import { getEl, querySelAll } from './utils.js';
import { getSettings, setSetting } from './storage.js';
import { registerScreen, registerTab, go } from './router.js';
import { loadContent } from './content.js';

import { renderHome } from './screens/home.js';
import { renderTopics } from './screens/topics.js';
import { renderTier } from './screens/tier.js';
import { renderSection } from './screens/section.js';
import { renderCards } from './screens/cards.js';
import { renderDeck } from './screens/deck.js';
import { renderQanda } from './screens/qanda.js';
import { renderQList } from './screens/qlist.js';
import { renderSettings } from './screens/settings.js';

function applyTheme(theme) {
  const wantsDark = theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', wantsDark);
  getEl('icon-sun').style.display  = wantsDark ? 'none'  : 'block';
  getEl('icon-moon').style.display = wantsDark ? 'block' : 'none';
}

function initTheme() {
  const { theme } = getSettings();
  applyTheme(theme);
  getEl('theme-toggle').addEventListener('click', () => {
    const cur = getSettings().theme;
    const next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
    setSetting('theme', next);
    applyTheme(next);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSettings().theme === 'auto') applyTheme('auto');
  });
}

function registerAllScreens() {
  registerScreen('home',     { el: getEl('screen-home'),     render: () => renderHome(getEl('screen-home')),       onEnter: () => renderHome(getEl('screen-home')) });
  registerScreen('topics',   { el: getEl('screen-topics'),   render: () => renderTopics(getEl('screen-topics')),   onEnter: () => renderTopics(getEl('screen-topics')) });
  registerScreen('cards',    { el: getEl('screen-cards'),    render: () => renderCards(getEl('screen-cards')),     onEnter: () => renderCards(getEl('screen-cards')) });
  registerScreen('qanda',    { el: getEl('screen-qanda'),    render: () => renderQanda(getEl('screen-qanda')),     onEnter: () => renderQanda(getEl('screen-qanda')) });

  registerScreen('tier',     { el: getEl('screen-tier'),     render: () => {} });
  registerScreen('section',  { el: getEl('screen-section'),  render: () => {} });
  registerScreen('deck',     { el: getEl('screen-deck'),     render: () => {} });
  registerScreen('qlist',    { el: getEl('screen-qlist'),    render: () => {} });
  registerScreen('settings', { el: getEl('screen-settings'), render: () => renderSettings(getEl('screen-settings')) });
}

function wireTabs() {
  querySelAll('.tab').forEach(btn => {
    registerTab(btn.dataset.target, btn);
    btn.addEventListener('click', () => go(btn.dataset.target));
  });
}

const TAB_ORDER = ['home', 'topics', 'cards', 'qanda'];

function wireSwipes() {
  const el = getEl('screens');
  let startX = 0, startY = 0, startT = 0, tracking = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; startT = Date.now(); tracking = true;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startT;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || dt > 600) return;
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const id = active.dataset.screen;
    const ix = TAB_ORDER.indexOf(id);
    if (ix < 0) return;
    const nextIx = dx < 0 ? ix + 1 : ix - 1;
    if (nextIx < 0 || nextIx >= TAB_ORDER.length) return;
    go(TAB_ORDER[nextIx]);
  }, { passive: true });
}

/* Loading screen during content fetch */
function showLoading() {
  const host = getEl('screen-home');
  host.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading your study bible…</div>
    </div>
  `;
  host.classList.add('active');
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  registerAllScreens();
  wireTabs();
  wireSwipes();

  showLoading();
  try {
    await loadContent();
  } catch (e) {
    const host = getEl('screen-home');
    host.innerHTML = `
      <div class="loading">
        <div style="font-size:40px">⚠️</div>
        <div>Could not load content.</div>
        <div style="font-size:12px;opacity:0.7">${e.message || e}</div>
      </div>
    `;
    return;
  }
  go('home');
});

/* Re-export for screens that trigger cross-screen navigation */
export { go } from './router.js';
