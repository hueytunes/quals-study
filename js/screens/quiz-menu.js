/* Quiz menu: scope picker (mix-all, per-tier, per-section, retry-wrong). */
import { createEl, svgBack, tierDisplay } from '../utils.js';
import { back, go } from '../router.js';
import { getContent, getAllQuizzes, buildQuizSet } from '../content.js';
import { getProgress } from '../storage.js';

export function openQuizMenu() {
  go('quizmenu');
  const host = document.getElementById('screen-quizmenu');
  renderMenu(host);
}

function renderMenu(host) {
  host.innerHTML = '';
  const content = getContent();
  const items = getAllQuizzes();
  const prog = getProgress();

  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: 'Multiple choice' }),
      createEl('h1', { text: 'Quiz' }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  if (items.length === 0) {
    host.appendChild(createEl('div', { class: 'sub-card', style: { textAlign: 'center', padding: '32px 20px' } }, [
      createEl('div', { style: { fontSize: '40px', marginBottom: '10px' }, text: '✍️' }),
      createEl('h4', { text: 'No quizzes generated yet', style: { fontSize: '16px', marginBottom: '8px' } }),
      createEl('p', { text: 'Run generate-quiz.py to create MCQs from the study content.',
        style: { fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.55' } }),
    ]));
    return;
  }

  // Stats on top
  const stats = summarize(items, prog);
  host.appendChild(createEl('div', { class: 'stat-row fade-in' }, [
    stat(String(stats.total), 'Total'),
    stat(`${stats.seen}/${stats.total}`, 'Answered'),
    stat(`${stats.accuracy}%`, 'Accuracy'),
  ]));

  // Big "Mix all" button
  host.appendChild(bigBtn(
    'QUICK DRILL',
    `Shuffle all ${items.length} items`,
    `Mixed MCQs across every tier. Good for broad recall.`,
    () => openQuizRunner({ scope: 'all', label: 'All quizzes' }),
  ));

  // Retry wrong
  if (stats.wrongCount > 0) {
    host.appendChild(bigBtn(
      'RETRY',
      `${stats.wrongCount} you missed last time`,
      'Just the items you answered incorrectly on your last attempt.',
      () => openQuizRunner({ scope: 'wrong', label: 'Review misses' }),
      'var(--sage)', 'var(--sage-deep)',
    ));
  }

  // Unseen
  if (stats.unseenCount > 0 && stats.unseenCount < items.length) {
    host.appendChild(bigBtn(
      'FRESH',
      `${stats.unseenCount} new questions`,
      'Items you have not attempted yet.',
      () => openQuizRunner({ scope: 'unseen', label: 'Fresh questions' }),
      '#b78a66', '#8f6848',
    ));
  }

  // Per-tier
  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: 'By tier' }),
  ]));

  for (const [ix, t] of content.tiers.entries()) {
    const n = items.filter(q => q.source?.tierId === t.id).length;
    if (n === 0) continue;
    const { eyebrow, short } = tierDisplay(t, ix);
    host.appendChild(createEl('button', {
      class: 'sect-item',
      onclick: () => openQuizRunner({ scope: 'tier', tierId: t.id, label: `${eyebrow} · ${short}` }),
    }, [
      createEl('div', { class: 'sect-id', text: eyebrow.replace('Tier ', 'T').replace('Supplement', 'S') }),
      createEl('div', { class: 'sect-body' }, [
        createEl('div', { class: 'sect-title', text: short }),
        createEl('div', { class: 'sect-meta', text: `${n} question${n === 1 ? '' : 's'}` }),
      ]),
      chev(),
    ]));
  }
}

function stat(n, label) {
  return createEl('div', { class: 'stat-card' }, [
    createEl('div', { class: 'n', text: n }),
    createEl('div', { class: 'l', text: label }),
  ]);
}

function bigBtn(eyebrow, title, sub, onclick, bg = 'var(--coral)', bgDeep = 'var(--coral-deep)') {
  return createEl('button', {
    style: {
      background: `linear-gradient(135deg, ${bg}, ${bgDeep})`,
      color: 'white', border: 'none', borderRadius: 'var(--radius-lg)',
      padding: '18px', width: '100%', textAlign: 'left',
      fontFamily: 'inherit', cursor: 'pointer',
      boxShadow: '0 18px 30px -14px rgba(91,99,214,0.5)',
      marginBottom: '14px',
    },
    onclick,
  }, [
    createEl('div', { style: { fontSize: '11px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: '0.85' }, text: eyebrow }),
    createEl('div', { style: { fontSize: '20px', fontWeight: '800', marginTop: '4px', letterSpacing: '-0.02em' }, text: title }),
    createEl('div', { style: { fontSize: '13px', marginTop: '6px', opacity: '0.92' }, text: sub }),
  ]);
}

function chev() {
  return createEl('span', { class: 'sect-chev', html:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
  });
}

function summarize(items, prog) {
  const q = prog.quiz || {};
  let seen = 0, correct = 0, wrongCount = 0, unseenCount = 0;
  for (const it of items) {
    const rec = q[it.id];
    if (!rec) { unseenCount++; continue; }
    seen++;
    if (rec.correct > 0) correct++;
    if (rec.last === 'wrong') wrongCount++;
  }
  const accuracy = seen ? Math.round((correct / seen) * 100) : 0;
  return { total: items.length, seen, correct, accuracy, wrongCount, unseenCount };
}

function openQuizRunner(opts) {
  import('./quiz.js').then(m => m.openQuiz(opts));
}

export function renderQuizMenu() { /* no-op; openQuizMenu handles render */ }
