/* ==========================================================================
   storage.js — localStorage wrappers for Quals Study progress.
   ========================================================================== */

const KEY_SETTINGS = 'quals.settings';
const KEY_PROGRESS = 'quals.progress';

function safeRead(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    if (v == null) return fallback;
    return JSON.parse(v);
  } catch (e) { return fallback; }
}
function safeWrite(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  defenseDate: null,       // ISO string, optional
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...safeRead(KEY_SETTINGS, {}) };
}
export function setSetting(key, value) {
  const s = getSettings(); s[key] = value; safeWrite(KEY_SETTINGS, s);
}

/* Progress shape:
   {
     streak: { days: 3, lastDay: 'YYYY-MM-DD' },
     sectionsViewed: { 'tier1:A': iso_timestamp, ... },
     cards: { 'tier1:A.1:0': { rating: 'easy'|'good'|'hard', ts, seen: n } },
     qSeen: { 'tier1:3': ts },
     lastLocation: { screen, tierId, sectionId },
   }
*/
export function getProgress() {
  return {
    streak: { days: 0, lastDay: null },
    sectionsViewed: {},
    cards: {},
    qSeen: {},
    lastLocation: null,
    ...safeRead(KEY_PROGRESS, {}),
  };
}
export function setProgress(updater) {
  const p = getProgress();
  const next = typeof updater === 'function' ? updater(p) : { ...p, ...updater };
  safeWrite(KEY_PROGRESS, next);
  return next;
}

/* Helpers */
export function markSectionViewed(tierId, sectionId) {
  setProgress(p => {
    p.sectionsViewed[`${tierId}:${sectionId}`] = new Date().toISOString();
    return p;
  });
  bumpStreak();
}
export function markCardRating(cardId, rating) {
  setProgress(p => {
    const cur = p.cards[cardId] || { seen: 0 };
    p.cards[cardId] = {
      rating, ts: new Date().toISOString(),
      seen: (cur.seen || 0) + 1,
    };
    return p;
  });
  bumpStreak();
}
export function markQSeen(qId) {
  setProgress(p => { p.qSeen[qId] = new Date().toISOString(); return p; });
  bumpStreak();
}
export function setLastLocation(loc) {
  setProgress(p => { p.lastLocation = loc; return p; });
}

/* Streak: days in a row the user has done anything. Bumps when any activity
   happens on a new day. */
export function bumpStreak() {
  const today = new Date().toISOString().slice(0, 10);
  setProgress(p => {
    if (!p.streak) p.streak = { days: 0, lastDay: null };
    if (p.streak.lastDay === today) return p;  // already counted today
    if (!p.streak.lastDay) {
      p.streak = { days: 1, lastDay: today };
      return p;
    }
    // Check if yesterday
    const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    if (p.streak.lastDay === yesterday) {
      p.streak.days += 1;
    } else {
      p.streak.days = 1;         // restart
    }
    p.streak.lastDay = today;
    return p;
  });
}

export function daysUntilDefense() {
  const s = getSettings();
  if (!s.defenseDate) return null;
  const target = new Date(s.defenseDate);
  const now = new Date();
  const ms = target - now;
  return Math.ceil(ms / 86400e3);
}
