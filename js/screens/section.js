/* Section (reader view): full prose content for one section. */
import { createEl, svgBack, formatProse } from '../utils.js';
import { go, back } from '../router.js';
import { getSection, getTier } from '../content.js';
import { markSectionViewed, setLastLocation } from '../storage.js';

export function openSection(tierId, sectionId) {
  go('section');
  const host = document.getElementById('screen-section');
  renderSectionInto(host, tierId, sectionId);
  markSectionViewed(tierId, sectionId);
  const sec = getSection(tierId, sectionId);
  if (sec) {
    setLastLocation({
      screen: 'section',
      tierId, sectionId,
      label: `${sec.id} · ${sec.title}`,
    });
  }
}

function renderSectionInto(host, tierId, sectionId) {
  host.innerHTML = '';
  const sec = getSection(tierId, sectionId);
  const tier = getTier(tierId);
  if (!sec || !tier) return;

  // Header
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: `${tier.title.match(/^(Tier \d+)/)?.[1]} · ${sec.id}` }),
      createEl('h1', { text: sec.title, style: { whiteSpace: 'normal', fontSize: '15px', lineHeight: '1.3' } }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  // Quick actions (cards for this section)
  const hasCards = sec.totalKeyFacts > 0;
  if (hasCards) {
    host.appendChild(createEl('button', {
      style: {
        background: 'var(--coral-soft)',
        color: 'var(--coral-deep)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        fontFamily: 'inherit',
        fontSize: '13px', fontWeight: '700',
        cursor: 'pointer', width: '100%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        marginBottom: '14px',
      },
      onclick: () => {
        import('./deck.js').then(m => m.openDeck({ tierId, sectionId }));
      },
    }, [`🎴  Study ${sec.totalKeyFacts} flashcard${sec.totalKeyFacts === 1 ? '' : 's'} for this section →`]));
  }

  // Subsections
  sec.subsections.forEach(sub => {
    const card = createEl('div', { class: 'sub-card' });
    if (sub.id || sub.title) {
      card.appendChild(createEl('h4', {}, [
        sub.id ? createEl('span', { class: 'subsection-id', text: sub.id }) : null,
        sub.title || '',
      ]));
    }
    const body = createEl('div', { class: 'reader-body', html: formatProse(sub.body) });
    card.appendChild(body);
    host.appendChild(card);
  });

  // Bottom: related Q&A count + nav between sections
  const otherSections = tier.sections.filter(s => s.id !== sectionId);
  const curIx = tier.sections.findIndex(s => s.id === sectionId);
  const prev = curIx > 0 ? tier.sections[curIx - 1] : null;
  const next = curIx < tier.sections.length - 1 ? tier.sections[curIx + 1] : null;

  const nav = createEl('div', {
    style: {
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px',
    },
  }, [
    navBtn(prev ? `← ${prev.id}` : '', prev ? prev.title : '', prev, tierId, 'left'),
    navBtn(next ? `${next.id} →` : '', next ? next.title : '', next, tierId, 'right'),
  ]);
  host.appendChild(nav);
}

function navBtn(lead, title, sec, tierId, dir) {
  if (!sec) return createEl('div', {});
  return createEl('button', {
    style: {
      background: 'var(--card)',
      borderRadius: 'var(--radius-md)',
      border: 'none', padding: '14px',
      fontFamily: 'inherit', cursor: 'pointer',
      textAlign: dir === 'right' ? 'right' : 'left',
      boxShadow: '0 4px 12px -8px rgba(42,31,20,0.12)',
    },
    onclick: () => openSection(tierId, sec.id),
  }, [
    createEl('div', { style: { fontSize: '10.5px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--coral-deep)' }, text: lead }),
    createEl('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--ink)', marginTop: '3px', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: title }),
  ]);
}

export function renderSection() {}
