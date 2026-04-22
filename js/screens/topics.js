/* Topics: list of 3 tiers → tap to see all sections for that tier. */
import { createEl, tierDisplay } from '../utils.js';
import { getContent } from '../content.js';

export function renderTopics(host) {
  host.innerHTML = '';
  const content = getContent();
  if (!content) return;

  host.appendChild(createEl('div', { class: 'greeting fade-in' }, [
    createEl('div', { class: 'eyebrow', text: 'Study guide' }),
    createEl('h1', { text: 'Topics' }),
  ]));

  content.tiers.forEach((t, ix) => {
    const nSections = t.sections.length;
    const nFacts = t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0);
    const nQ = (t.qanda || []).length;
    const { eyebrow, short } = tierDisplay(t, ix);
    host.appendChild(createEl('button', {
      class: `tier-card t${ix + 1}`,
      onclick: () => {
        import('./tier.js').then(m => m.openTier(t.id));
      },
    }, [
      createEl('div', { class: 't-eyebrow', text: eyebrow }),
      createEl('h3', { text: short }),
      createEl('div', { class: 't-stats' }, [
        createEl('span', { text: `${nSections} sections` }),
        createEl('span', { text: `${nFacts} facts` }),
        createEl('span', { text: `${nQ} Q&A` }),
      ]),
      createEl('div', { class: 't-cta', text: t.id === 'supplement' ? 'Open supplement →' : 'Open tier →' }),
    ]));
  });
}
