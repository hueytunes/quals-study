/* Topics: search box + list of tiers → tap a tier for sections, tap a result
   to open a section. The search query persists in module state so back()
   returns to the same results. */
import { createEl, tierDisplay, escapeHtml } from '../utils.js';
import { getContent } from '../content.js';

// Persisted across navigations (not across full reloads).
let _lastQuery = '';
let _lastScroll = 0;

export function renderTopics(host) {
  const content = getContent();
  if (!content) return;
  host.innerHTML = '';

  // --- Header --------------------------------------------------------------
  host.appendChild(createEl('div', { class: 'greeting fade-in' }, [
    createEl('div', { class: 'eyebrow', text: 'Study guide' }),
    createEl('h1', { text: 'Topics' }),
  ]));

  // --- Search input --------------------------------------------------------
  const input = createEl('input', {
    type: 'search',
    placeholder: 'Search sections, Q&A, flashcards…',
    value: _lastQuery || '',
    class: 'topics-search',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
  });

  const searchBox = createEl('div', { class: 'topics-search-wrap' }, [
    createEl('div', { class: 'topics-search-ico', html:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    }),
    input,
    createEl('button', {
      class: 'topics-search-clear',
      style: { display: _lastQuery ? 'flex' : 'none' },
      html: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
      onclick: () => { input.value = ''; _lastQuery = ''; input.dispatchEvent(new Event('input')); input.focus(); },
    }),
  ]);
  host.appendChild(searchBox);

  const results = createEl('div', { class: 'topics-results' });
  const tierList = createEl('div', { class: 'topics-tiers' });
  host.appendChild(results);
  host.appendChild(tierList);

  // --- Tier cards ----------------------------------------------------------
  content.tiers.forEach((t, ix) => {
    const nSections = t.sections.length;
    const nFacts = t.sections.reduce((a, s) => a + (s.totalKeyFacts || 0), 0);
    const nQ = (t.qanda || []).length;
    const { eyebrow, short } = tierDisplay(t, ix);
    tierList.appendChild(createEl('button', {
      class: `tier-card t${ix + 1}`,
      onclick: () => {
        _lastScroll = host.scrollTop;
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

  // --- Search wiring -------------------------------------------------------
  let searchTimer = null;
  const rerender = (q) => {
    const query = q.trim();
    _lastQuery = query;
    searchBox.querySelector('.topics-search-clear').style.display = query ? 'flex' : 'none';
    if (!query) {
      results.innerHTML = '';
      tierList.style.display = '';
      return;
    }
    tierList.style.display = 'none';
    renderResults(results, query, content);
  };
  input.addEventListener('input', (e) => {
    const v = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => rerender(v), 120);
  });

  // Restore previous state if we're returning to Topics
  if (_lastQuery) rerender(_lastQuery);
  if (_lastScroll) {
    setTimeout(() => { host.scrollTop = _lastScroll; }, 0);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const MAX_RESULTS_PER_GROUP = 25;

function tokenize(s) {
  return s.toLowerCase().split(/\W+/).filter(x => x.length >= 2);
}

function renderResults(host, query, content) {
  host.innerHTML = '';
  const tokens = tokenize(query);
  if (tokens.length === 0) return;

  const sectionHits = [];
  const qaHits = [];
  const quizHits = [];

  for (const t of content.tiers) {
    for (const s of t.sections) {
      // Search section title + each subsection title + body
      const secHaystack = (s.title + ' ' + (s.id || '')).toLowerCase();
      let bestSub = null;
      let bestScore = 0;
      let secScore = tokens.every(tk => secHaystack.includes(tk)) ? 3 : 0;
      for (const sub of s.subsections) {
        const hay = ((sub.title || '') + ' ' + (sub.body || '')).toLowerCase();
        const matches = tokens.filter(tk => hay.includes(tk)).length;
        const score = (matches === tokens.length ? 2 : 0) + matches;
        if (score > bestScore) { bestScore = score; bestSub = sub; }
      }
      const totalScore = secScore + bestScore;
      if (totalScore > 0 && (secScore > 0 || bestScore >= tokens.length)) {
        sectionHits.push({ tier: t, section: s, bestSub, score: totalScore });
      }
    }
    for (const qa of (t.qanda || [])) {
      const hay = (qa.q + ' ' + (qa.a || '')).toLowerCase();
      if (tokens.every(tk => hay.includes(tk))) {
        qaHits.push({ tier: t, qa });
      }
    }
  }

  // Quizzes (only if loaded)
  import('../content.js').then(mod => {
    const all = mod.getAllQuizzes();
    for (const q of all) {
      const hay = (q.stem + ' ' + q.choices.join(' ') + ' ' + (q.explanation || '')).toLowerCase();
      if (tokens.every(tk => hay.includes(tk))) quizHits.push(q);
    }
    renderQuizHits(host, quizHits, query);
  });

  sectionHits.sort((a, b) => b.score - a.score);

  const total = sectionHits.length + qaHits.length;
  host.appendChild(createEl('div', {
    class: 'eyebrow',
    style: { marginBottom: '10px' },
    text: `${total} result${total === 1 ? '' : 's'}`,
  }));

  if (sectionHits.length > 0) {
    host.appendChild(createEl('div', { class: 'search-group-head', text: 'Sections' }));
    sectionHits.slice(0, MAX_RESULTS_PER_GROUP).forEach(h => {
      host.appendChild(renderSectionHit(h, query));
    });
  }
  if (qaHits.length > 0) {
    host.appendChild(createEl('div', { class: 'search-group-head', text: 'Q&A' }));
    qaHits.slice(0, MAX_RESULTS_PER_GROUP).forEach(h => {
      host.appendChild(renderQAHit(h, query));
    });
  }
  if (total === 0) {
    host.appendChild(createEl('div', { class: 'search-empty', text: 'No matches. Try fewer or broader terms.' }));
  }
}

function renderSectionHit({ tier, section, bestSub }, query) {
  const tDisplay = tierDisplay(tier);
  const snippet = snippetFor(bestSub?.body || section.title, query);
  return createEl('button', {
    class: 'search-hit',
    onclick: () => {
      import('./section.js').then(m => m.openSection(tier.id, section.id));
    },
  }, [
    createEl('div', { class: 'search-hit-lead', text: `${tDisplay.eyebrow} · ${section.id}` }),
    createEl('div', { class: 'search-hit-title', html: highlight(section.title, query) }),
    snippet ? createEl('div', { class: 'search-hit-snippet', html: snippet }) : null,
  ]);
}

function renderQAHit({ tier, qa }, query) {
  const tDisplay = tierDisplay(tier);
  return createEl('button', {
    class: 'search-hit',
    onclick: () => {
      import('./qlist.js').then(m => m.openQList({
        tierId: tier.id,
        section: qa.section || null,
      }));
    },
  }, [
    createEl('div', { class: 'search-hit-lead', text: `${tDisplay.eyebrow} · Q&A${qa.section ? ' · ' + qa.section : ''}` }),
    createEl('div', { class: 'search-hit-title', html: highlight(qa.q, query) }),
    createEl('div', { class: 'search-hit-snippet', html: snippetFor(qa.a || '', query) }),
  ]);
}

function renderQuizHits(host, hits, query) {
  if (hits.length === 0) return;
  host.appendChild(createEl('div', { class: 'search-group-head', text: 'Quiz' }));
  hits.slice(0, MAX_RESULTS_PER_GROUP).forEach(q => {
    host.appendChild(createEl('button', {
      class: 'search-hit',
      onclick: () => {
        // Open the single item by scoping: run the full bank, then the user
        // can find this exact stem. Simpler: jump to the source section.
        if (q.source?.tierId && q.source?.sectionId) {
          import('./section.js').then(m => m.openSection(q.source.tierId, q.source.sectionId));
        }
      },
    }, [
      createEl('div', { class: 'search-hit-lead', text: q.sourceLabel || 'Quiz item' }),
      createEl('div', { class: 'search-hit-title', html: highlight(q.stem, query) }),
    ]));
  });
}

function highlight(text, query) {
  if (!text) return '';
  const safe = escapeHtml(text);
  const tokens = tokenize(query);
  let out = safe;
  for (const tk of tokens) {
    const re = new RegExp('(' + tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

function snippetFor(text, query, radius = 80) {
  if (!text) return '';
  const tokens = tokenize(query);
  const low = text.toLowerCase();
  let pos = -1;
  for (const tk of tokens) {
    const i = low.indexOf(tk);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return highlight(text.slice(0, radius * 2), query);
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  const slice = (start > 0 ? '… ' : '') + text.slice(start, end).trim() + (end < text.length ? ' …' : '');
  return highlight(slice, query);
}
