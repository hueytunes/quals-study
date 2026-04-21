/* Q&A tab: pick tier, then browse Q&A inline. */
import { createEl } from '../utils.js';
import { getContent } from '../content.js';
import { go } from '../router.js';

export function renderQanda(host) {
  host.innerHTML = '';
  const content = getContent();
  if (!content) return;

  host.appendChild(createEl('div', { class: 'greeting fade-in' }, [
    createEl('div', { class: 'eyebrow', text: 'Committee Q&A' }),
    createEl('h1', { text: 'Drill the questions' }),
  ]));

  // Big all-Q button
  const totalQ = content.tiers.reduce((n, t) => n + (t.qanda || []).length, 0);
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
      import('./qlist.js').then(m => m.openQList({ mixed: true }));
    },
  }, [
    createEl('div', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: '0.85' }, text: 'Full drill' }),
    createEl('div', { style: { fontSize: '22px', fontWeight: '800', marginTop: '4px', letterSpacing: '-0.02em' }, text: `All ${totalQ} committee questions` }),
    createEl('div', { style: { fontSize: '13px', marginTop: '6px', opacity: '0.92' }, text: 'Shuffled across tiers. Cover the answers, rehearse aloud.' }),
  ]));

  // Per tier
  content.tiers.forEach(t => {
    const n = (t.qanda || []).length;
    if (n === 0) return;
    host.appendChild(createEl('div', { class: 'section-head' }, [
      createEl('h2', { text: t.title.replace(/^Tier \d+ — /, '') }),
      createEl('span', { class: 'see-all', text: `${n} Q&A` }),
    ]));
    host.appendChild(createEl('button', {
      class: 'sect-item',
      style: { marginBottom: '12px' },
      onclick: () => import('./qlist.js').then(m => m.openQList({ tierId: t.id })),
    }, [
      createEl('div', { class: 'sect-id', text: '💬' }),
      createEl('div', { class: 'sect-body' }, [
        createEl('div', { class: 'sect-title', text: `All Q&A for ${t.title.match(/^(Tier \d+)/)?.[1]}` }),
        createEl('div', { class: 'sect-meta', text: `${n} question${n === 1 ? '' : 's'}` }),
      ]),
      createEl('span', { class: 'sect-chev', html:
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
      }),
    ]));

    // By sub-section within the tier
    const sections = {};
    (t.qanda || []).forEach(q => {
      (sections[q.section || 'General'] ||= []).push(q);
    });
    Object.entries(sections).forEach(([sec, list]) => {
      host.appendChild(createEl('button', {
        class: 'sect-item',
        onclick: () => import('./qlist.js').then(m => m.openQList({ tierId: t.id, section: sec })),
      }, [
        createEl('div', { class: 'sect-id', text: list.length }),
        createEl('div', { class: 'sect-body' }, [
          createEl('div', { class: 'sect-title', text: sec }),
          createEl('div', { class: 'sect-meta', text: `${list.length} question${list.length === 1 ? '' : 's'}` }),
        ]),
        createEl('span', { class: 'sect-chev', html:
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
        }),
      ]));
    });
  });
}
