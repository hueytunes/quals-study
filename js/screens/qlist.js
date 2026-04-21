/* Q&A list: scoped to a tier/section, with expandable answer reveal. */
import { createEl, svgBack, formatProse } from '../utils.js';
import { go, back } from '../router.js';
import { buildQAList, shuffle } from '../content.js';
import { markQSeen, setLastLocation } from '../storage.js';

export function openQList({ tierId = null, section = null, mixed = false } = {}) {
  go('qlist');
  const host = document.getElementById('screen-qlist');
  let list = buildQAList({ tierId, section });
  if (mixed) list = shuffle(list);
  renderQListInto(host, list, { tierId, section, mixed });
  const label = section ? section : tierId ? `All ${tierId} Q&A` : 'All committee Q&A';
  setLastLocation({ screen: 'qanda', tierId, label });
}

function renderQListInto(host, list, ctx) {
  host.innerHTML = '';
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: 'Committee Q&A' }),
      createEl('h1', { text: ctx.section || (ctx.tierId || 'Mixed drill'), style: { whiteSpace: 'normal', fontSize: '15px', lineHeight: '1.3' } }),
    ]),
    createEl('button', {
      title: 'Shuffle',
      style: {
        background: 'var(--card)', border: 'none',
        width: '38px', height: '38px', borderRadius: '50%',
        cursor: 'pointer', boxShadow: '0 4px 10px -4px rgba(42,31,20,0.15)',
      },
      onclick: () => {
        renderQListInto(host, shuffle(list), ctx);
      },
    }, ['🔀']),
  ]));

  if (list.length === 0) {
    host.appendChild(createEl('div', { class: 'empty-state' }, [
      createEl('div', { class: 'ico', text: '💬' }),
      createEl('div', { text: 'No questions in this scope yet.' }),
    ]));
    return;
  }

  host.appendChild(createEl('div', {
    class: 'eyebrow',
    style: { marginBottom: '12px' },
    text: `${list.length} question${list.length === 1 ? '' : 's'} · tap any to reveal`,
  }));

  list.forEach((q, i) => {
    const card = createEl('div', { class: 'qa-card' });
    const head = createEl('div', { class: 'qa-head' }, [
      createEl('div', { class: 'qa-num', text: String(q.qnum || i + 1) }),
      createEl('div', { class: 'qa-q', text: q.q }),
    ]);
    const body = createEl('div', { class: 'qa-body', html: formatProse(q.a) });
    head.addEventListener('click', () => {
      const wasOpen = card.classList.toggle('open');
      if (wasOpen) markQSeen(`${q.tierId}:${q.qnum}`);
    });
    card.appendChild(head);
    card.appendChild(body);
    host.appendChild(card);
  });
}

export function renderQList() {}
