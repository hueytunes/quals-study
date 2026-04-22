/* Home: greeting, streak, continue, tier quick-access. */
import { createEl, greetingEyebrow, tierDisplay } from '../utils.js';
import { go } from '../router.js';
import { getContent } from '../content.js';
import { getProgress, daysUntilDefense } from '../storage.js';

export function renderHome(host) {
  host.innerHTML = '';
  const content = getContent();
  if (!content) return;
  const prog = getProgress();

  // Greeting
  const greet = createEl('div', { class: 'greeting fade-in' }, [
    createEl('div', { class: 'eyebrow', text: greetingEyebrow() }),
    createEl('h1', { text: 'Time to defend the thesis.' }),
  ]);
  host.appendChild(greet);

  // Countdown (if defense date set)
  const days = daysUntilDefense();
  if (days != null) {
    const tone = days < 7 ? 'var(--red-danger)' : days < 30 ? 'var(--coral-deep)' : 'var(--sage-deep)';
    host.appendChild(createEl('div', {
      class: 'sub-card',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: 'var(--coral-soft)' },
    }, [
      createEl('div', {}, [
        createEl('div', { class: 'eyebrow', text: 'Defense', style: { color: tone } }),
        createEl('div', { style: { fontSize: '22px', fontWeight: '800', color: 'var(--ink)', marginTop: '2px', letterSpacing: '-0.02em' } },
          [days > 0 ? `${days} day${days === 1 ? '' : 's'} to go` : days === 0 ? 'Today — you got this' : `${Math.abs(days)} day${Math.abs(days)===1?'':'s'} past`]),
      ]),
    ]));
  }

  // Stats row
  const totalFacts = content.tiers.reduce((sum, t) => sum + t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0), 0);
  const totalQ = content.tiers.reduce((sum, t) => sum + (t.qanda || []).length, 0);
  const cardsReviewed = Object.keys(prog.cards || {}).length;
  const qSeen = Object.keys(prog.qSeen || {}).length;
  const streak = (prog.streak && prog.streak.days) || 0;

  host.appendChild(createEl('div', { class: 'stat-row fade-in' }, [
    statCard(`${streak}`, streak === 1 ? '1 day 🔥' : 'Day streak 🔥'),
    statCard(`${cardsReviewed}`, 'Cards reviewed'),
    statCard(`${qSeen}/${totalQ}`, 'Q&A seen'),
  ]));

  // Continue card
  if (prog.lastLocation) {
    const loc = prog.lastLocation;
    host.appendChild(createEl('button', {
      class: 'continue-card fade-in',
      style: {
        marginBottom: '18px',
        background: 'linear-gradient(135deg, var(--coral), var(--coral-deep))',
        color: 'white',
        borderRadius: 'var(--radius-lg)',
        padding: '18px',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: 'pointer',
        boxShadow: '0 18px 30px -14px rgba(91,99,214,0.5)',
      },
      onclick: () => {
        if (loc.screen === 'section') {
          import('./section.js').then(m => m.openSection(loc.tierId, loc.sectionId));
        } else {
          go(loc.screen);
        }
      },
    }, [
      createEl('div', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: '0.85' }, text: 'Continue where you left off' }),
      createEl('div', { style: { fontSize: '20px', fontWeight: '800', marginTop: '4px', letterSpacing: '-0.02em' }, text: loc.label || 'Study' }),
      createEl('div', { style: { fontSize: '13px', fontWeight: '700', marginTop: '10px' }, text: 'Resume →' }),
    ]));
  }

  // Section head: Tiers
  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: 'Your study tiers' }),
    createEl('span', { class: 'see-all', text: 'Browse all →', onclick: () => go('topics'), style: { cursor: 'pointer' } }),
  ]));

  // Tier quick-access
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

  // Quick actions
  host.appendChild(createEl('div', { class: 'section-head', style: { marginTop: '24px' } }, [
    createEl('h2', { text: 'Quick actions' }),
  ]));

  const quickRow = createEl('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } });
  quickRow.appendChild(quickTile('Mix all cards', '🎴', 'Shuffle flashcards across every tier', () => {
    import('./deck.js').then(m => m.openDeck({ tierId: null, sectionId: null, mixed: true }));
  }));
  quickRow.appendChild(quickTile('All Q&A', '💬', 'Browse every committee question', () => {
    go('qanda');
  }));
  host.appendChild(quickRow);
}

function statCard(n, label) {
  return createEl('div', { class: 'stat-card' }, [
    createEl('div', { class: 'n', text: n }),
    createEl('div', { class: 'l', text: label }),
  ]);
}

function quickTile(title, icon, sub, onclick) {
  return createEl('button', {
    style: {
      background: 'var(--card)', borderRadius: 'var(--radius-md)',
      padding: '16px', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
      textAlign: 'left',
      boxShadow: '0 4px 12px -8px rgba(42,31,20,0.12)',
    },
    onclick,
  }, [
    createEl('div', { style: { fontSize: '22px', marginBottom: '6px' }, text: icon }),
    createEl('div', { style: { fontSize: '14px', fontWeight: '700', color: 'var(--ink)' }, text: title }),
    createEl('div', { style: { fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px', lineHeight: '1.4' }, text: sub }),
  ]);
}
