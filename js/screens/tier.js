/* Tier screen: header + list of sections, tap to open one. */
import { createEl, svgBack, tierDisplay } from '../utils.js';
import { go, back } from '../router.js';
import { getTier } from '../content.js';
import { getProgress } from '../storage.js';

export function openTier(tierId) {
  go('tier');
  const host = document.getElementById('screen-tier');
  renderTierInto(host, tierId);
}

function renderTierInto(host, tierId) {
  host.innerHTML = '';
  const tier = getTier(tierId);
  if (!tier) return;
  const prog = getProgress();

  // Header
  const { eyebrow, short } = tierDisplay(tier);
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: eyebrow }),
      createEl('h1', { text: short }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  // Tier-level quick actions
  const qr = createEl('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' } });
  qr.appendChild(quickTile('Cards for this tier', '🎴', () => {
    import('./deck.js').then(m => m.openDeck({ tierId }));
  }));
  qr.appendChild(quickTile('Q&A for this tier', '💬', () => {
    import('./qlist.js').then(m => m.openQList({ tierId }));
  }));
  host.appendChild(qr);

  // Sections
  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: `${tier.sections.length} sections` }),
  ]));

  tier.sections.forEach(s => {
    const viewed = !!prog.sectionsViewed[`${tierId}:${s.id}`];
    host.appendChild(createEl('button', {
      class: 'sect-item',
      onclick: () => {
        import('./section.js').then(m => m.openSection(tierId, s.id));
      },
    }, [
      createEl('div', { class: 'sect-id', text: s.id }),
      createEl('div', { class: 'sect-body' }, [
        createEl('div', { class: 'sect-title', text: s.title }),
        createEl('div', { class: 'sect-meta', text:
          `${s.subsections.length} sub${s.subsections.length === 1 ? 'section' : 'sections'}${
            s.totalKeyFacts ? ` · ${s.totalKeyFacts} key facts` : ''
          }${viewed ? ' · ✓ viewed' : ''}`
        }),
      ]),
      createEl('span', { class: 'sect-chev', html:
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
      }),
    ]));
  });
}

function quickTile(title, icon, onclick) {
  return createEl('button', {
    style: {
      background: 'var(--card)',
      borderRadius: 'var(--radius-md)',
      padding: '14px',
      border: 'none',
      fontFamily: 'inherit',
      cursor: 'pointer',
      textAlign: 'center',
      boxShadow: '0 4px 12px -8px rgba(42,31,20,0.12)',
    },
    onclick,
  }, [
    createEl('div', { style: { fontSize: '22px', marginBottom: '4px' }, text: icon }),
    createEl('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--ink)' }, text: title }),
  ]);
}

/* Required by main.js registration (no-op — openTier handles render) */
export function renderTier() {}
