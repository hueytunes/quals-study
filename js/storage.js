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
  askProvider: 'gemini',   // 'gemini' (free tier) | 'anthropic'
  geminiKey: null,         // Google AI Studio API key
  anthropicKey: null,      // Anthropic API key
  apiKey: null,            // Legacy — migrated to anthropicKey on read
};

export function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...safeRead(KEY_SETTINGS, {}) };
  // Migrate legacy `apiKey` → anthropicKey
  if (s.apiKey && !s.anthropicKey) {
    s.anthropicKey = s.apiKey;
    s.apiKey = null;
  }
  return s;
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
    quiz: {},              // { [itemId]: { attempts, correct, last, ts } }
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

/* Quiz attempt tracking: which items have been answered, whether correct,
   how many tries. Used by the quiz menu (weakness-first re-study) and by
   the Home / Settings stats. */
export function markQuizAttempt(itemId, wasCorrect, pickedIndex) {
  setProgress(p => {
    if (!p.quiz) p.quiz = {};
    const cur = p.quiz[itemId] || { attempts: 0, correct: 0 };
    p.quiz[itemId] = {
      attempts: (cur.attempts || 0) + 1,
      correct: (cur.correct || 0) + (wasCorrect ? 1 : 0),
      last: wasCorrect ? 'right' : 'wrong',
      lastPick: pickedIndex,
      ts: new Date().toISOString(),
    };
    return p;
  });
  bumpStreak();
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
