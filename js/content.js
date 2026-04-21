/* ==========================================================================
   content.js — fetch + cache the parsed study content.
   ========================================================================== */

let _cache = null;
let _promise = null;

export function loadContent() {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch('data/content.json')
    .then(r => r.json())
    .then(data => { _cache = data; return data; });
  return _promise;
}

export function getContent() { return _cache; }

/* Helpers for navigation / selection */
export function getTier(id) {
  if (!_cache) return null;
  return _cache.tiers.find(t => t.id === id) || null;
}
export function getSection(tierId, sectionId) {
  const t = getTier(tierId);
  if (!t) return null;
  return t.sections.find(s => s.id === sectionId) || null;
}

/* Build a flat deck of flashcards from all tiers' key facts.
   Supports filtering by tier or section. */
export function buildCardDeck({ tierId = null, sectionId = null } = {}) {
  if (!_cache) return [];
  const deck = [];
  for (const t of _cache.tiers) {
    if (tierId && t.id !== tierId) continue;
    for (const s of t.sections) {
      if (sectionId && s.id !== sectionId) continue;
      for (let i = 0; i < s.subsections.length; i++) {
        const sub = s.subsections[i];
        (sub.keyFacts || []).forEach((fact, fi) => {
          deck.push({
            id: `${t.id}:${s.id}:${i}:${fi}`,
            tierId: t.id, tierTitle: t.title,
            sectionId: s.id, sectionTitle: s.title,
            subsectionId: sub.id, subsectionTitle: sub.title,
            front: `${s.title}${sub.title && sub.title !== 'Overview' ? ' · ' + sub.title : ''}`,
            back: fact,
          });
        });
      }
    }
  }
  return deck;
}

/* Build a flat list of Q&A, filterable by tier/section. */
export function buildQAList({ tierId = null, section = null } = {}) {
  if (!_cache) return [];
  const out = [];
  for (const t of _cache.tiers) {
    if (tierId && t.id !== tierId) continue;
    for (const q of (t.qanda || [])) {
      if (section && q.section !== section) continue;
      out.push({ ...q, tierId: t.id, tierTitle: t.title });
    }
  }
  return out;
}

/* Shuffle (Fisher-Yates) */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
