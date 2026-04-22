/* Cards tab: pick a scope, then study. */
import { createEl, tierDisplay } from '../utils.js';
import { getContent } from '../content.js';

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

  // By tier (only tiers with cards)
  content.tiers.forEach(t => {
    const n = t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0);
    if (n === 0) return;
    const { eyebrow, short } = tierDisplay(t);
    host.appendChild(createEl('div', { class: 'section-head' }, [
      createEl('h2', { text: short }),
      createEl('span', { class: 'see-all', text: `${n} cards` }),
    ]));
    host.appendChild(createEl('button', {
      class: 'sect-item',
      style: { marginBottom: '12px' },
      onclick: () => import('./deck.js').then(m => m.openDeck({ tierId: t.id })),
    }, [
      createEl('div', { class: 'sect-id', text: '🎴' }),
      createEl('div', { class: 'sect-body' }, [
        createEl('div', { class: 'sect-title', text: `All cards in ${eyebrow}` }),
        createEl('div', { class: 'sect-meta', text: `${n} key facts · shuffled` }),
      ]),
      createEl('span', { class: 'sect-chev', html:
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
      }),
    ]));
    // Sections within this tier that have cards
    t.sections.filter(s => s.totalKeyFacts > 0).forEach(s => {
      host.appendChild(createEl('button', {
        class: 'sect-item',
        onclick: () => import('./deck.js').then(m => m.openDeck({ tierId: t.id, sectionId: s.id })),
      }, [
        createEl('div', { class: 'sect-id', text: s.id }),
        createEl('div', { class: 'sect-body' }, [
          createEl('div', { class: 'sect-title', text: s.title }),
          createEl('div', { class: 'sect-meta', text: `${s.totalKeyFacts} card${s.totalKeyFacts === 1 ? '' : 's'}` }),
        ]),
        createEl('span', { class: 'sect-chev', html:
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
        }),
      ]));
    });
  });
}
