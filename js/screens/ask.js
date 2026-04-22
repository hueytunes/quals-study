/* Ask Me — natural-language Q over the study corpus.
   Retrieval: keyword-score top-K sections + Q&As. Generation: direct call
   to api.anthropic.com using the user's stored API key. Answer renders as
   lightly-formatted markdown with "Jump to source" pills. */
import { createEl, svgBack, escapeHtml, tierDisplay } from '../utils.js';
import { go, back } from '../router.js';
import { getContent, getAllQuizzes } from '../content.js';
import { getSettings } from '../storage.js';

// Module state persists across navigation so Back returns to the same answer.
let _state = {
  question: '',
  answer: '',
  refs: [],            // [{tierId, sectionId, label}]
  loading: false,
  error: null,
  abortController: null,
};

export function openAsk() {
  go('ask');
  const host = document.getElementById('screen-ask');
  render(host);
}

function render(host) {
  host.innerHTML = '';

  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: 'Ask Me' }),
      createEl('h1', { text: 'Query your corpus' }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  const settings = getSettings();
  const hasKey = !!(settings.apiKey && settings.apiKey.length > 10);

  // Input row
  const input = createEl('textarea', {
    class: 'ask-input',
    placeholder: 'e.g. "IFN-α vs IFN-β — key differences" or "why does ruxolitinib not cure MPN?"',
    rows: '3',
    autocomplete: 'off', autocorrect: 'on', spellcheck: 'true',
    value: _state.question || '',
  });
  const submit = createEl('button', {
    class: 'ask-submit',
    text: _state.loading ? 'Thinking…' : 'Ask →',
    disabled: _state.loading,
    onclick: () => doAsk(host, input.value),
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      doAsk(host, input.value);
    }
  });

  const inputBox = createEl('div', { class: 'ask-input-wrap' }, [
    input,
    submit,
  ]);
  host.appendChild(inputBox);

  // Status / answer area
  const body = createEl('div', { class: 'ask-body', id: 'ask-body' });
  host.appendChild(body);

  if (!hasKey) {
    body.appendChild(createEl('div', { class: 'sub-card ask-nokey' }, [
      createEl('div', { style: { fontSize: '28px', marginBottom: '6px' }, text: '🔐' }),
      createEl('h4', { text: 'API key required' }),
      createEl('p', {
        style: { fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: '1.55', margin: '4px 0 12px' },
        html: 'Ask Me calls the Anthropic API directly from your browser. Paste a key in Settings to enable it. Your key never leaves this device.',
      }),
      createEl('button', {
        class: 'ask-cta',
        text: 'Open Settings →',
        onclick: () => go('settings'),
      }),
    ]));
    return;
  }

  // Example chips — tap to prefill
  if (!_state.question && !_state.answer) {
    const examples = [
      'IFN-α vs IFN-β — key differences',
      'Why is DCAF7 loss expected to stabilize IFIT3?',
      'How does JAK2V617F drive MPN clonally?',
      'Mx1-Cre vs Vav-iCre — when and why',
      'What is the K-εGG diGly workflow?',
    ];
    const chips = createEl('div', { class: 'ask-chips' });
    for (const e of examples) {
      chips.appendChild(createEl('button', {
        class: 'ask-chip',
        text: e,
        onclick: () => { input.value = e; input.focus(); },
      }));
    }
    body.appendChild(chips);
  }

  if (_state.loading) {
    body.appendChild(createEl('div', { class: 'ask-loading' }, [
      createEl('div', { class: 'spinner' }),
      createEl('div', { text: 'Searching your corpus and drafting an answer…' }),
    ]));
  }

  if (_state.error) {
    body.appendChild(createEl('div', { class: 'sub-card ask-error' }, [
      createEl('h4', { text: 'Something went wrong' }),
      createEl('p', {
        style: { fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.55' },
        text: _state.error,
      }),
    ]));
  }

  if (_state.answer) {
    const answerCard = createEl('div', { class: 'sub-card ask-answer' });
    answerCard.appendChild(createEl('h4', { text: 'Answer' }));
    answerCard.appendChild(createEl('div', {
      class: 'ask-answer-body',
      html: renderMarkdown(_state.answer),
    }));
    body.appendChild(answerCard);

    if (_state.refs.length > 0) {
      body.appendChild(createEl('div', {
        class: 'eyebrow',
        style: { margin: '14px 0 8px' },
        text: 'Sources',
      }));
      for (const r of _state.refs) {
        body.appendChild(createEl('button', {
          class: 'ask-ref',
          onclick: () => {
            import('./section.js').then(m => m.openSection(r.tierId, r.sectionId));
          },
        }, [
          createEl('span', { class: 'ask-ref-id', text: r.sectionId }),
          createEl('span', { class: 'ask-ref-title', text: r.label }),
          createEl('span', { class: 'ask-ref-chev', html:
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
          }),
        ]));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Submission flow
// ---------------------------------------------------------------------------
async function doAsk(host, question) {
  question = (question || '').trim();
  if (!question) return;
  const settings = getSettings();
  if (!settings.apiKey) { _state.error = 'No API key configured.'; render(host); return; }

  // Abort any in-flight request
  if (_state.abortController) _state.abortController.abort();
  const ctrl = new AbortController();

  _state = {
    question,
    answer: '',
    refs: [],
    loading: true,
    error: null,
    abortController: ctrl,
  };
  render(host);

  const content = getContent();
  const matches = retrieve(question, content, 7);
  _state.refs = matches.map(m => ({
    tierId: m.tierId,
    sectionId: m.sectionId,
    label: m.title,
  }));

  const systemPrompt = SYSTEM_PROMPT;
  const userMessage = buildUserMessage(question, matches);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      let msg = `HTTP ${res.status}`;
      try { const j = JSON.parse(txt); msg = j.error?.message || msg; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('\n').trim();
    _state.answer = text || '(empty response)';
    _state.loading = false;
  } catch (e) {
    if (e.name === 'AbortError') return;
    _state.error = e.message || String(e);
    _state.loading = false;
  }
  _state.abortController = null;
  render(host);
}

// ---------------------------------------------------------------------------
// Retrieval — token-overlap ranking over all section bodies + Q&A pairs
// ---------------------------------------------------------------------------
function tokenize(s) {
  return s.toLowerCase().split(/\W+/).filter(x => x.length >= 3);
}

function retrieve(question, content, k = 7) {
  if (!content) return [];
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];

  const candidates = [];
  for (const t of content.tiers) {
    for (const s of t.sections) {
      const bodies = s.subsections.map(sub => (sub.title || '') + ' ' + (sub.body || '')).join(' ');
      const hay = (s.title + ' ' + bodies).toLowerCase();
      let score = 0;
      for (const tk of qTokens) {
        // Weight per-occurrence but cap
        const occ = Math.min(hay.split(tk).length - 1, 6);
        if (occ > 0) score += occ + 1;    // small bonus for any hit
      }
      if (score > 0) {
        candidates.push({
          tierId: t.id, tierTitle: t.title,
          sectionId: s.id, title: s.title, score,
          body: bodies,
        });
      }
    }
    // Also consider Q&As as candidates
    for (const qa of (t.qanda || [])) {
      const hay = (qa.q + ' ' + (qa.a || '')).toLowerCase();
      let score = 0;
      for (const tk of qTokens) {
        const occ = Math.min(hay.split(tk).length - 1, 6);
        if (occ > 0) score += occ + 1;
      }
      if (score > 2) {
        candidates.push({
          tierId: t.id, tierTitle: t.title,
          sectionId: qa.section || '—',
          title: `Q&A · ${qa.q.slice(0, 60)}`,
          score: score + 0.5,
          body: `Q: ${qa.q}\nA: ${qa.a || ''}`,
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, k);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a study companion for Huey Mysliwiec, a PhD student in the Melo-Cardenas lab at Northwestern preparing for her qualifying exam. Her thesis is on DCAF7 → IFIT3 → IFN-α signaling in JAK2V617F myeloproliferative neoplasms.

You answer questions using ONLY the provided excerpts from Huey's Qualifying Exam Study Bible. Stay concise (under ~300 words unless the question demands more), mechanistic, and in the voice of a senior postdoc quickly briefing her — no hedging, no padding, no generic caveats.

Format rules:
  • Lead with one punchy sentence that states the answer outright.
  • Follow with 2–5 tight bullets that unpack the mechanism, evidence, or distinction.
  • Use **bold** sparingly for gene/protein names and key terms, and *italics* for citations (e.g. *Pichlmair 2011 Nat Immunol*).
  • If the excerpts don't actually cover the question, say so explicitly — don't fill in from general knowledge.
  • Don't repeat the question back. Don't introduce your answer with phrases like "Great question" or "Here's what you need to know".`;

function buildUserMessage(question, matches) {
  const excerpts = matches.map((m, i) => {
    // Truncate each excerpt to keep total context reasonable
    let body = m.body;
    if (body.length > 1500) body = body.slice(0, 1500) + '\n[…]';
    return `### Source ${i + 1} — ${m.tierTitle.split(' — ')[0]} · ${m.sectionId} · ${m.title}\n\n${body}`;
  }).join('\n\n---\n\n');

  return `Question: ${question}\n\n— Excerpts from Huey's Study Bible —\n\n${excerpts}`;
}

// ---------------------------------------------------------------------------
// Minimal markdown renderer (bold, italic, bullets, paragraphs, inline code)
// ---------------------------------------------------------------------------
function renderMarkdown(src) {
  const lines = src.split('\n');
  let html = '';
  let inList = false;
  for (let raw of lines) {
    let line = escapeHtml(raw).trim();
    if (/^\s*[-*•]\s+/.test(raw)) {
      if (!inList) { html += '<ul>'; inList = true; }
      let item = line.replace(/^[-*•]\s+/, '');
      item = applyInline(item);
      html += `<li>${item}</li>`;
      continue;
    }
    if (inList && line === '') { html += '</ul>'; inList = false; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (line === '') continue;
    html += `<p>${applyInline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

function applyInline(s) {
  // Bold, italic, inline code — order matters (bold first so ** isn't treated as italic)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\s)\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

export function renderAsk() { /* handled by openAsk */ }
