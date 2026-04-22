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
  const hasKey = providerHasKey(settings);
  const providerLabel = settings.askProvider === 'gemini' ? 'Google Gemini' : 'Anthropic';

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
    const freeHint = settings.askProvider === 'gemini'
      ? 'Google Gemini has a free tier (1500 requests/day, no credit card) — paste a key from aistudio.google.com.'
      : 'Anthropic requires a paid key. You can switch to the Google Gemini free tier in Settings.';
    body.appendChild(createEl('div', { class: 'sub-card ask-nokey' }, [
      createEl('div', { style: { fontSize: '28px', marginBottom: '6px' }, text: '🔐' }),
      createEl('h4', { text: `${providerLabel} API key required` }),
      createEl('p', {
        style: { fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: '1.55', margin: '4px 0 12px' },
        text: freeHint,
      }),
      createEl('button', {
        class: 'ask-cta',
        text: 'Open Settings →',
        onclick: () => go('settings'),
      }),
    ]));
    return;
  }

  // Provider badge
  body.appendChild(createEl('div', {
    class: 'eyebrow',
    style: { marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' },
    html: `Using <strong style="font-weight:800">${providerLabel}</strong>${settings.askProvider === 'gemini' ? ' · <span style="color:var(--sage-deep)">free tier</span>' : ''}`,
  }));

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
function providerHasKey(s) {
  const key = s.askProvider === 'gemini' ? s.geminiKey : s.anthropicKey;
  return !!(key && key.length > 10);
}

async function doAsk(host, question) {
  question = (question || '').trim();
  if (!question) return;
  const settings = getSettings();
  if (!providerHasKey(settings)) {
    _state.error = 'No API key configured for this provider.';
    render(host); return;
  }

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
    let text;
    if (settings.askProvider === 'gemini') {
      text = await callGemini(systemPrompt, userMessage, settings.geminiKey, ctrl.signal);
    } else {
      text = await callAnthropic(systemPrompt, userMessage, settings.anthropicKey, ctrl.signal);
    }
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

async function callAnthropic(systemPrompt, userMessage, apiKey, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(txt); msg = j.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('\n').trim();
}

// Ordered list of Gemini free-tier models to try in succession. If the
// first one is overloaded (503) we transparently fall back to the next.
// 1.5-flash was deprecated April 2025; use only 2.x here.
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

async function callGemini(systemPrompt, userMessage, apiKey, signal) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      maxOutputTokens: 1400,
      temperature: 0.3,
    },
  };
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        return parts.map(p => p.text || '').join('\n').trim();
      }
      // 503 / 429 / "overloaded" / "model is experiencing high demand"
      // → try the next model in the list. 400 / 401 / 403 are the user's
      // problem (bad key, wrong quota) — surface immediately.
      const txt = await res.text();
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(txt).error?.message || msg; } catch {}
      const retriable = res.status === 429 || res.status === 500 ||
                        res.status === 502 || res.status === 503 ||
                        /overload|high demand|unavailable/i.test(msg);
      if (!retriable) throw new Error(msg);
      lastErr = new Error(msg);
      // fall through to next model
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      // retry with next model
    }
  }
  throw lastErr || new Error('All Gemini models failed.');
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
