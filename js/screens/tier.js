/* Tier screen: header + collapsible chapter groups + in-tier search.
   Sections are grouped under parent letter ("A", "B", "§1") headers.
   Chapter state (expanded/collapsed) persists across this session so a
   back-nav returns to the same scroll+open state. */
import { createEl, svgBack, tierDisplay, escapeHtml } from '../utils.js';
import { go, back } from '../router.js';
import { getTier } from '../content.js';
import { getProgress } from '../storage.js';

// Session-scoped state: last viewed tier's expanded chapters and search query.
const _expanded = new Map();     // tierId → Set(chapterKey)
const _queries = new Map();      // tierId → query string
const _scroll = new Map();       // tierId → scrollTop
let _currentTierId = null;

export function openTier(tierId) {
  go('tier');
  _currentTierId = tierId;
  const host = document.getElementById('screen-tier');
  renderTierInto(host, tierId);
  // Restore scroll after render
  const y = _scroll.get(tierId);
  if (y) setTimeout(() => { host.scrollTop = y; }, 0);
  host.addEventListener('scroll', () => { _scroll.set(tierId, host.scrollTop); }, { passive: true });
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
  const qr = createEl('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' } });
  qr.appendChild(quickTile('Cards for this tier', '🎴', () => {
    import('./deck.js').then(m => m.openDeck({ tierId }));
  }));
  qr.appendChild(quickTile('Q&A for this tier', '💬', () => {
    import('./qlist.js').then(m => m.openQList({ tierId }));
  }));
  host.appendChild(qr);

  // Per-tier search box
  const searchQuery = _queries.get(tierId) || '';
  const input = createEl('input', {
    type: 'search',
    placeholder: `Search within ${eyebrow}…`,
    value: searchQuery,
    class: 'topics-search',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const clearBtn = createEl('button', {
    class: 'topics-search-clear',
    style: { display: searchQuery ? 'flex' : 'none' },
    html: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    onclick: () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); },
  });
  const searchBox = createEl('div', { class: 'topics-search-wrap' }, [
    createEl('div', { class: 'topics-search-ico', html:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    }),
    input, clearBtn,
  ]);
  host.appendChild(searchBox);

  // Body container — list of chapters or search results
  const body = createEl('div', {});
  host.appendChild(body);

  const groups = groupSections(tier.sections);

  // Default expanded-state initialization for this tier
  if (!_expanded.has(tierId)) {
    _expanded.set(tierId, new Set());   // all collapsed by default
  }

  function renderList() {
    body.innerHTML = '';
    const q = (_queries.get(tierId) || '').trim().toLowerCase();
    if (q) {
      renderSearchResults(body, groups, q, tierId, prog);
    } else {
      renderGroups(body, groups, tierId, prog);
    }
  }

  let timer = null;
  input.addEventListener('input', (e) => {
    const v = e.target.value;
    _queries.set(tierId, v);
    clearBtn.style.display = v ? 'flex' : 'none';
    clearTimeout(timer);
    timer = setTimeout(renderList, 100);
  });

  renderList();
}

// ---------------------------------------------------------------------------
// Collapsible chapter list
// ---------------------------------------------------------------------------
function renderGroups(host, groups, tierId, prog) {
  host.appendChild(createEl('div', { class: 'section-head' }, [
    createEl('h2', { text: `${groups.reduce((n, g) => n + g.items.length, 0)} sections` }),
    createEl('span', { class: 'see-all',
      style: { cursor: 'pointer' },
      text: (_expanded.get(tierId).size === groups.length) ? 'Collapse all' : 'Expand all',
      onclick: () => {
        const set = _expanded.get(tierId);
        if (set.size === groups.length) set.clear();
        else { set.clear(); groups.forEach(g => set.add(g.key)); }
        renderGroups(host.closest('.screen-body') || document.getElementById('screen-tier'), groups, tierId, prog);
      },
    }),
  ]));

  const openSet = _expanded.get(tierId);

  for (const g of groups) {
    const isOpen = openSet.has(g.key);
    const chapter = createEl('div', { class: `chapter ${isOpen ? 'open' : ''}` });

    const head = createEl('button', {
      class: 'chapter-head-btn',
      onclick: () => {
        if (openSet.has(g.key)) openSet.delete(g.key);
        else openSet.add(g.key);
        // Toggle only this chapter without full re-render
        chapter.classList.toggle('open');
        head.querySelector('.chapter-caret').innerHTML = chapter.classList.contains('open') ? CARET_DOWN : CARET_RIGHT;
      },
    }, [
      createEl('div', { class: 'chapter-letter', text: g.key }),
      createEl('div', { class: 'chapter-title-col' }, [
        createEl('div', { class: 'chapter-title', text: g.label }),
        createEl('div', { class: 'chapter-meta', text: `${g.items.length} section${g.items.length === 1 ? '' : 's'}` }),
      ]),
      createEl('div', { class: 'chapter-caret', html: isOpen ? CARET_DOWN : CARET_RIGHT }),
    ]);
    chapter.appendChild(head);

    const inner = createEl('div', { class: 'chapter-inner' });
    for (const s of g.items) {
      inner.appendChild(renderSectionItem(s, tierId, prog));
    }
    chapter.appendChild(inner);
    host.appendChild(chapter);
  }
}

function renderSectionItem(s, tierId, prog) {
  const viewed = !!prog.sectionsViewed[`${tierId}:${s.id}`];
  return createEl('button', {
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
  ]);
}

// ---------------------------------------------------------------------------
// Search within this tier
// ---------------------------------------------------------------------------
function renderSearchResults(host, groups, q, tierId, prog) {
  const tokens = q.split(/\W+/).filter(x => x.length >= 2);
  const hits = [];
  for (const g of groups) {
    for (const s of g.items) {
      const hay = (s.title + ' ' + s.id + ' ' + s.subsections.map(sub => (sub.title||'') + ' ' + (sub.body||'')).join(' ')).toLowerCase();
      const allMatch = tokens.every(t => hay.includes(t));
      if (!allMatch) continue;
      // Find a body snippet near the first match for display
      const bodyJoin = s.subsections.map(sub => sub.body || '').join(' ');
      const low = bodyJoin.toLowerCase();
      let pos = -1;
      for (const t of tokens) {
        const i = low.indexOf(t);
        if (i >= 0 && (pos < 0 || i < pos)) pos = i;
      }
      let snippet = '';
      if (pos >= 0) {
        const start = Math.max(0, pos - 70);
        const end = Math.min(bodyJoin.length, pos + 90);
        snippet = (start > 0 ? '… ' : '') + bodyJoin.slice(start, end).trim() + (end < bodyJoin.length ? ' …' : '');
      }
      hits.push({ section: s, group: g, snippet });
    }
  }
  host.appendChild(createEl('div', {
    class: 'eyebrow',
    style: { margin: '10px 0' },
    text: `${hits.length} result${hits.length === 1 ? '' : 's'}`,
  }));
  for (const h of hits.slice(0, 50)) {
    host.appendChild(createEl('button', {
      class: 'search-hit',
      onclick: () => import('./section.js').then(m => m.openSection(tierId, h.section.id)),
    }, [
      createEl('div', { class: 'search-hit-lead', text: `${h.group.key} · ${h.section.id}` }),
      createEl('div', { class: 'search-hit-title', html: highlight(h.section.title, tokens) }),
      h.snippet ? createEl('div', { class: 'search-hit-snippet', html: highlight(h.snippet, tokens) }) : null,
    ]));
  }
  if (hits.length === 0) {
    host.appendChild(createEl('div', { class: 'search-empty', text: 'No matches in this tier.' }));
  }
}

function highlight(text, tokens) {
  let out = escapeHtml(text);
  for (const tk of tokens) {
    out = out.replace(new RegExp('(' + tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------
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
  for (const g of groups.values()) {
    const overview = g.items.find(s => {
      const isKeyId = s.id === g.key || s.id === g.key.replace('§', 'S');
      const onlyOverview = s.subsections.length === 1 && s.subsections[0].title === 'Overview';
      return isKeyId || onlyOverview;
    });
    if (overview && overview.title) {
      g.label = overview.title.replace(/^§\d+\s*—\s*Scope & rationale$/, 'Scope & rationale');
      if (overview.id === g.key ||
          (overview.subsections.length === 1 && overview.subsections[0].title === 'Overview' && (overview.subsections[0].body || '').length < 400)) {
        g.items = g.items.filter(s => s !== overview);
      }
    }
    if (!g.label) g.label = `Chapter ${g.key}`;
  }
  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
const CARET_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
const CARET_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';

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
