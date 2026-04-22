/* Cards tab: big-mix button on top, then one collapsible chapter per tier
   with the per-section decks inside. Matches the collapsible UX of Topics
   → tier. */
import { createEl, tierDisplay } from '../utils.js';
import { getContent } from '../content.js';

// Session-scoped expanded state: Set of tier IDs that should start open.
const _expanded = new Set();

export function renderCards(host) {
  host.innerHTML = '';
  const content = getContent();
  if (!content) return;

  host.appendChild(createEl('div', { class: 'greeting fade-in' }, [
    createEl('div', { class: 'eyebrow', text: 'Flashcards' }),
    createEl('h1', { text: 'Study by section' }),
  ]));

  // Quick action: mix all
  const totalFacts = content.tiers.reduce((sum, t) =>
    sum + t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0), 0);

  host.appendChild(createEl('button', {
    style: {
      background: 'linear-gradient(135deg, var(--coral), var(--coral-deep))',
      color: 'white', border: 'none', borderRadius: 'var(--radius-lg)',
      padding: '18px', width: '100%', textAlign: 'left',
      fontFamily: 'inherit', cursor: 'pointer',
      boxShadow: '0 18px 30px -14px rgba(91,99,214,0.5)',
      marginBottom: '16px',
    },
    onclick: () => {
      import('./deck.js').then(m => m.openDeck({ tierId: null, sectionId: null, mixed: true }));
    },
  }, [
    createEl('div', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: '0.85' }, text: 'Big mix' }),
    createEl('div', { style: { fontSize: '22px', fontWeight: '800', marginTop: '4px', letterSpacing: '-0.02em' }, text: `Shuffle all ${totalFacts} cards` }),
    createEl('div', { style: { fontSize: '13px', marginTop: '6px', opacity: '0.92' }, text: 'All tiers, random order. Good for final review.' }),
  ]));

  // Quiz tile
  host.appendChild(createEl('button', {
    style: {
      background: 'var(--card)', border: 'none',
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px', width: '100%', textAlign: 'left',
      fontFamily: 'inherit', cursor: 'pointer',
      boxShadow: '0 4px 12px -8px rgba(42,31,20,0.12)',
      marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '12px',
    },
    onclick: () => {
      import('./quiz-menu.js').then(m => m.openQuizMenu());
    },
  }, [
    createEl('div', { style: { fontSize: '22px' }, text: '✍️' }),
    createEl('div', { style: { flex: '1' } }, [
      createEl('div', { style: { fontSize: '14px', fontWeight: '800', color: 'var(--ink)' }, text: 'Quiz me' }),
      createEl('div', { style: { fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }, text: 'Multiple-choice drill with explanations' }),
    ]),
    createEl('div', { style: { color: 'var(--ink-faint)' }, html:
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
    }),
  ]));

  // By tier (only tiers with cards) — each tier is collapsible
  const tiersWithCards = content.tiers
    .map((t, ix) => ({ t, ix, n: t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0) }))
    .filter(x => x.n > 0);

  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: 'Decks by tier' }),
    createEl('span', {
      class: 'see-all', style: { cursor: 'pointer' },
      text: _expanded.size === tiersWithCards.length ? 'Collapse all' : 'Expand all',
      onclick: () => {
        if (_expanded.size === tiersWithCards.length) _expanded.clear();
        else tiersWithCards.forEach(x => _expanded.add(x.t.id));
        renderCards(host);
      },
    }),
  ]));

  for (const { t, ix, n } of tiersWithCards) {
    const isOpen = _expanded.has(t.id);
    const { eyebrow, short } = tierDisplay(t, ix);
    const chapter = createEl('div', { class: `chapter ${isOpen ? 'open' : ''}` });

    const head = createEl('button', {
      class: 'chapter-head-btn',
      onclick: () => {
        if (_expanded.has(t.id)) _expanded.delete(t.id);
        else _expanded.add(t.id);
        chapter.classList.toggle('open');
        head.querySelector('.chapter-caret').innerHTML =
          chapter.classList.contains('open') ? CARET_DOWN : CARET_RIGHT;
      },
    }, [
      createEl('div', { class: `chapter-letter t-ix-${ix + 1}`, text: eyebrow.replace('Tier ', 'T').replace('Supplement', 'S') }),
      createEl('div', { class: 'chapter-title-col' }, [
        createEl('div', { class: 'chapter-title', text: short }),
        createEl('div', { class: 'chapter-meta', text: `${n} card${n === 1 ? '' : 's'} · ${t.sections.filter(s => s.totalKeyFacts > 0).length} section${t.sections.filter(s => s.totalKeyFacts > 0).length === 1 ? '' : 's'}` }),
      ]),
      createEl('div', { class: 'chapter-caret', html: isOpen ? CARET_DOWN : CARET_RIGHT }),
    ]);
    chapter.appendChild(head);

    const inner = createEl('div', { class: 'chapter-inner' });

    // "All cards in tier" button
    inner.appendChild(createEl('button', {
      class: 'sect-item',
      style: { marginBottom: '6px' },
      onclick: () => import('./deck.js').then(m => m.openDeck({ tierId: t.id })),
    }, [
      createEl('div', { class: 'sect-id', text: '🎴' }),
      createEl('div', { class: 'sect-body' }, [
        createEl('div', { class: 'sect-title', text: `All cards in ${eyebrow}` }),
        createEl('div', { class: 'sect-meta', text: `${n} key facts · shuffled` }),
      ]),
      chev(),
    ]));

    // Per-section decks
    t.sections.filter(s => s.totalKeyFacts > 0).forEach(s => {
      inner.appendChild(createEl('button', {
        class: 'sect-item',
        onclick: () => import('./deck.js').then(m => m.openDeck({ tierId: t.id, sectionId: s.id })),
      }, [
        createEl('div', { class: 'sect-id', text: s.id }),
        createEl('div', { class: 'sect-body' }, [
          createEl('div', { class: 'sect-title', text: s.title }),
          createEl('div', { class: 'sect-meta', text: `${s.totalKeyFacts} card${s.totalKeyFacts === 1 ? '' : 's'}` }),
        ]),
        chev(),
      ]));
    });

    chapter.appendChild(inner);
    host.appendChild(chapter);
  }
}

function chev() {
  return createEl('span', { class: 'sect-chev', html:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
  });
}

const CARET_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
const CARET_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
