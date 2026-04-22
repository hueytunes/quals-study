/* Quiz runner: one item at a time, tap a choice to reveal + log, next to advance.
   Supports MCQ (radio choices) and cloze (free-text input). */
import { createEl, svgBack, escapeHtml } from '../utils.js';
import { back, go } from '../router.js';
import { buildQuizSet, shuffle } from '../content.js';
import { getProgress, markQuizAttempt } from '../storage.js';

let _state = null;

export function openQuiz({ scope = 'all', tierId = null, sectionId = null, label = 'Quiz' } = {}) {
  const prog = getProgress();
  const base = buildQuizSet({
    tierId: scope === 'tier' ? tierId : null,
    sectionId: scope === 'section' ? sectionId : null,
    mode: scope === 'wrong' ? 'wrong' : scope === 'unseen' ? 'unseen' : 'all',
    progress: prog,
  });
  const items = shuffle(base);
  if (items.length === 0) {
    // No items in this scope — bounce back with a notice
    alert('No quiz items match that scope yet.');
    return;
  }
  _state = { items, ix: 0, label, answered: new Set(), correctCount: 0 };
  go('quiz');
  render();
}

function render() {
  const host = document.getElementById('screen-quiz');
  if (!_state) return;
  host.innerHTML = '';

  const { items, ix, label } = _state;

  // Header (progress bar)
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: label }),
      createEl('h1', { text: `${ix + 1} of ${items.length}`, style: { fontSize: '17px' } }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  host.appendChild(createEl('div', { class: 'fc-progress', style: { marginBottom: '14px' } }, [
    createEl('div', { class: 'bar', style: { width: `${((ix + 1) / items.length) * 100}%` } }),
  ]));

  const q = items[ix];

  // Source chip
  const src = q.sourceLabel || [q.source?.tierId, q.source?.sectionId].filter(Boolean).join(' · ');
  if (src) {
    host.appendChild(createEl('div', {
      style: {
        fontSize: '11px', fontWeight: '800',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--coral-deep)', marginBottom: '8px',
      },
      text: src,
    }));
  }

  // Stem
  host.appendChild(createEl('div', { class: 'sub-card quiz-stem' }, [
    createEl('div', { class: 'quiz-stem-text', text: q.stem }),
  ]));

  // Choices
  if (q.type === 'mcq') {
    renderMCQ(host, q);
  } else if (q.type === 'cloze') {
    renderCloze(host, q);
  } else {
    host.appendChild(createEl('p', { text: `Unknown quiz type: ${q.type}` }));
  }
}

function renderMCQ(host, q) {
  const wrap = createEl('div', { class: 'quiz-choices' });
  const state = { picked: null, revealed: false };

  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  q.choices.forEach((choice, i) => {
    const btn = createEl('button', {
      class: 'quiz-choice',
      onclick: () => {
        if (state.revealed) return;
        state.picked = i;
        state.revealed = true;
        const wasCorrect = i === q.correctIndex;
        if (wasCorrect) _state.correctCount++;
        _state.answered.add(q.id);
        markQuizAttempt(q.id, wasCorrect, i);
        // Re-render choices + reveal explanation
        paintChoices();
        showReveal();
      },
    }, [
      createEl('span', { class: 'qc-badge', text: labels[i] }),
      createEl('span', { class: 'qc-text', text: choice }),
    ]);
    wrap.appendChild(btn);
  });

  host.appendChild(wrap);
  const explanationHost = createEl('div', { id: 'quiz-reveal' });
  host.appendChild(explanationHost);

  function paintChoices() {
    Array.from(wrap.children).forEach((btn, i) => {
      btn.classList.remove('picked', 'correct', 'incorrect', 'also-correct');
      if (!state.revealed) return;
      if (i === q.correctIndex) {
        btn.classList.add(i === state.picked ? 'correct' : 'also-correct');
      } else if (i === state.picked) {
        btn.classList.add('incorrect');
      }
    });
  }

  function showReveal() {
    explanationHost.innerHTML = '';
    const wasCorrect = state.picked === q.correctIndex;
    explanationHost.appendChild(createEl('div', {
      class: `quiz-verdict ${wasCorrect ? 'good' : 'bad'}`,
      text: wasCorrect ? '✓ Correct' : '✗ Incorrect',
    }));
    if (q.explanation) {
      explanationHost.appendChild(createEl('div', {
        class: 'quiz-explain',
        html: `<strong>Why:</strong> ${escapeHtml(q.explanation)}`,
      }));
    }
    if (q.citation) {
      explanationHost.appendChild(createEl('div', {
        class: 'quiz-cite',
        text: q.citation,
      }));
    }
    explanationHost.appendChild(renderFooterNav(q));
  }
}

function renderCloze(host, q) {
  const state = { revealed: false };
  const input = createEl('input', {
    type: 'text', class: 'input',
    placeholder: 'Type your answer…', autocapitalize: 'off', autocorrect: 'off',
    style: {
      padding: '14px 16px', borderRadius: '12px',
      border: '2px solid transparent', background: 'var(--cream-deep)',
      fontSize: '15px', width: '100%', outline: 'none',
      fontFamily: 'inherit', color: 'var(--ink)', marginBottom: '10px',
    },
  });
  host.appendChild(input);

  const submit = createEl('button', {
    class: 'btn-primary',
    style: {
      width: '100%', padding: '14px', border: 'none',
      background: 'var(--coral)', color: 'white',
      borderRadius: '12px', fontFamily: 'inherit',
      fontWeight: '800', fontSize: '15px', cursor: 'pointer',
      letterSpacing: '-0.01em',
    },
    text: 'Check answer',
    onclick: () => {
      if (state.revealed) return;
      const picked = input.value.trim();
      const accept = (q.acceptableAnswers || [q.answer]).map(s => s.toLowerCase().trim());
      const wasCorrect = accept.includes(picked.toLowerCase());
      state.revealed = true;
      _state.answered.add(q.id);
      if (wasCorrect) _state.correctCount++;
      markQuizAttempt(q.id, wasCorrect, null);
      revealBox.innerHTML = '';
      revealBox.appendChild(createEl('div', {
        class: `quiz-verdict ${wasCorrect ? 'good' : 'bad'}`,
        text: wasCorrect ? '✓ Correct' : `✗ Answer: ${q.answer}`,
      }));
      if (q.explanation) {
        revealBox.appendChild(createEl('div', { class: 'quiz-explain',
          html: `<strong>Why:</strong> ${escapeHtml(q.explanation)}` }));
      }
      if (q.citation) revealBox.appendChild(createEl('div', { class: 'quiz-cite', text: q.citation }));
      revealBox.appendChild(renderFooterNav(q));
      input.disabled = true;
      submit.disabled = true;
      submit.style.opacity = '0.5';
    },
  });
  host.appendChild(submit);
  const revealBox = createEl('div', {});
  host.appendChild(revealBox);
}

function renderFooterNav(q) {
  const row = createEl('div', { class: 'quiz-footer-row' });

  // Jump to source
  if (q.source?.tierId && q.source?.sectionId) {
    row.appendChild(createEl('button', {
      class: 'quiz-footer-btn',
      onclick: () => {
        import('./section.js').then(m => m.openSection(q.source.tierId, q.source.sectionId));
      },
      text: `Read source →`,
    }));
  }

  // Next
  const isLast = _state.ix >= _state.items.length - 1;
  row.appendChild(createEl('button', {
    class: 'quiz-footer-btn primary',
    onclick: () => {
      if (isLast) {
        renderFinished();
      } else {
        _state.ix += 1;
        render();
      }
    },
    text: isLast ? 'Finish →' : 'Next →',
  }));

  return row;
}

function renderFinished() {
  const host = document.getElementById('screen-quiz');
  host.innerHTML = '';
  const { items, correctCount, label } = _state;
  const pct = Math.round((correctCount / items.length) * 100);

  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: 'Done' }),
      createEl('h1', { text: label, style: { fontSize: '16px' } }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  host.appendChild(createEl('div', {
    class: 'sub-card',
    style: { textAlign: 'center', padding: '28px 22px' },
  }, [
    createEl('div', { style: { fontSize: '44px', marginBottom: '6px' }, text: pct >= 80 ? '🎯' : pct >= 60 ? '👍' : '📚' }),
    createEl('div', { style: { fontSize: '13px', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }, text: 'Score' }),
    createEl('div', { style: { fontSize: '44px', fontWeight: '800', letterSpacing: '-0.03em', margin: '4px 0' }, text: `${correctCount}/${items.length}` }),
    createEl('div', { style: { fontSize: '15px', color: 'var(--ink-soft)' }, text: `${pct}% correct` }),
  ]));

  host.appendChild(createEl('button', {
    class: 'btn-primary',
    style: {
      width: '100%', padding: '14px', border: 'none',
      background: 'var(--coral)', color: 'white',
      borderRadius: '12px', fontFamily: 'inherit',
      fontWeight: '800', fontSize: '15px', cursor: 'pointer',
      marginBottom: '10px',
    },
    text: 'Back to quiz menu',
    onclick: () => back(),
  }));
}

export function renderQuiz() { /* no-op; openQuiz handles render */ }
