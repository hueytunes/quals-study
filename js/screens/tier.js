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

  // Group sections by their top-level letter (A, A.1, A.2 → group "A";
  // C, C1, C2, C3a → group "C"; S1.A, S1.B → group "§1"). This makes the
  // flat ~80-section lists readable.
  const groups = groupSections(tier.sections);
  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: `${tier.sections.length} sections` }),
    createEl('span', { class: 'see-all', text: `${groups.length} chapters` }),
  ]));

  for (const g of groups) {
    // Chapter header
    host.appendChild(createEl('div', { class: 'chapter-head' }, [
      createEl('div', { class: 'chapter-letter', text: g.key }),
      createEl('div', { class: 'chapter-title', text: g.label }),
    ]));
    for (const s of g.items) {
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
    }
  }
}

/* Determine the chapter bucket for a section id.
   A, A.1, A1, A.1.2, A1.2 → "A"
   C3a → "C"
   S1.A → "§1"    (supplement tier id scheme) */
function chapterKey(id) {
  if (!id) return '—';
  if (id.startsWith('S')) {
    const m = id.match(/^S(\d+)/);
    return m ? `§${m[1]}` : id;
  }
  const m = id.match(/^([A-Z])/);
  return m ? m[1] : id;
}

function groupSections(sections) {
  const groups = new Map();
  for (const s of sections) {
    const k = chapterKey(s.id);
    if (!groups.has(k)) groups.set(k, { key: k, label: '', items: [] });
    groups.get(k).items.push(s);
  }
  // For each group, use the first "overview-only" section's title as the
  // chapter label (e.g. section "A" titled "The Ubiquitin-Proteasome System"
  // becomes the chapter header, and A.1, A.2, etc become entries under it).
  // Then filter that overview-only parent from the items to avoid dup.
  for (const g of groups.values()) {
    const overview = g.items.find(s =>
      s.id === g.key || s.id === g.key.replace('§', 'S') ||
      s.subsections.length === 1 && s.subsections[0].title === 'Overview'
    );
    if (overview && overview.title && overview.title.length > 0) {
      g.label = overview.title;
      // Only hide a pure "Overview" parent if its body is short; otherwise keep
      // it so the user can still read the chapter intro.
      if (overview.id === g.key || (overview.subsections.length === 1 && overview.subsections[0].title === 'Overview' && (overview.subsections[0].body || '').length < 400)) {
        g.items = g.items.filter(s => s !== overview);
      }
    }
    if (!g.label) g.label = `Chapter ${g.key}`;
  }
  return Array.from(groups.values());
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
