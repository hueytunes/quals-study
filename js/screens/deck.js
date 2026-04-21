/* Deck: swipe through a set of flashcards. */
import { createEl, svgBack } from '../utils.js';
import { go, back } from '../router.js';
import { buildCardDeck, shuffle } from '../content.js';
import { markCardRating, setLastLocation } from '../storage.js';

export function openDeck({ tierId = null, sectionId = null, mixed = false } = {}) {
  go('deck');
  const host = document.getElementById('screen-deck');
  let deck = buildCardDeck({ tierId, sectionId });
  deck = shuffle(deck);
  if (deck.length === 0) {
    renderEmpty(host);
    return;
  }
  renderDeckInto(host, deck, 0, { tierId, sectionId, mixed });
  setLastLocation({
    screen: 'cards',
    tierId, sectionId,
    label: `${deck.length} flashcards${tierId ? ` · ${tierId}` : ''}${sectionId ? ' · ' + sectionId : ''}`,
  });
}

function renderEmpty(host) {
  host.innerHTML = '';
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('h1', { text: 'No cards' }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));
  host.appendChild(createEl('div', { class: 'empty-state' }, [
    createEl('div', { class: 'ico', text: '🎴' }),
    createEl('div', { text: 'No flashcards for this selection yet.' }),
  ]));
}

function renderDeckInto(host, deck, ix, ctx) {
  host.innerHTML = '';
  const card = deck[ix];

  // Header
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('div', { class: 'eyebrow', text: 'Flashcards' }),
      createEl('h1', { text: `${ix + 1} of ${deck.length}` }),
    ]),
    createEl('button', {
      style: {
        background: 'var(--card)', border: 'none',
        width: '38px', height: '38px', borderRadius: '50%',
        cursor: 'pointer', boxShadow: '0 4px 10px -4px rgba(42,31,20,0.15)',
      },
      title: 'Shuffle',
      onclick: () => {
        const reshuffled = shuffle(deck);
        renderDeckInto(host, reshuffled, 0, ctx);
      },
    }, ['🔀']),
  ]));

  // Progress bar
  host.appendChild(createEl('div', { class: 'fc-progress' }, [
    createEl('div', { class: 'bar', style: { width: `${((ix + 1) / deck.length) * 100}%` } }),
  ]));

  // The card
  const stage = createEl('div', { class: 'fc-stage' });
  const fc = createEl('div', { class: 'fc' });

  const front = createEl('div', { class: 'fc-face fc-front' }, [
    createEl('div', { class: 'fc-context', text:
      `${(card.tierTitle || '').match(/^(Tier \d+)/)?.[1]} · ${card.sectionId}`
    }),
    createEl('div', { class: 'fc-content sm' }, [card.front]),
  ]);
  const back = createEl('div', { class: 'fc-face fc-back' }, [
    createEl('div', { class: 'fc-context', text: card.sectionTitle || '' }),
    createEl('div', { class: 'fc-content', text: card.back }),
  ]);
  fc.appendChild(front);
  fc.appendChild(back);
  fc.addEventListener('click', () => fc.classList.toggle('flipped'));
  stage.appendChild(fc);
  host.appendChild(stage);

  // Action buttons — rate and advance
  const next = (rating) => {
    markCardRating(card.id, rating);
    if (ix + 1 < deck.length) {
      renderDeckInto(host, deck, ix + 1, ctx);
    } else {
      renderDone(host, deck.length, ctx);
    }
  };

  host.appendChild(createEl('div', { class: 'fc-actions' }, [
    createEl('button', { class: 'fc-btn hard', onclick: () => next('hard') }, ['😵‍💫 Hard']),
    createEl('button', { class: 'fc-btn good', onclick: () => next('good') }, ['👍 Good']),
    createEl('button', { class: 'fc-btn easy', onclick: () => next('easy') }, ['🤩 Easy']),
  ]));

  // Swipe left/right inside the card to advance without rating
  let sx = 0;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 80) {
      if (dx < 0 && ix + 1 < deck.length) renderDeckInto(host, deck, ix + 1, ctx);
      else if (dx > 0 && ix > 0) renderDeckInto(host, deck, ix - 1, ctx);
    }
  }, { passive: true });
}

function renderDone(host, count, ctx) {
  host.innerHTML = '';
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('h1', { text: 'Finished' }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));
  host.appendChild(createEl('div', { class: 'empty-state' }, [
    createEl('div', { class: 'ico', text: '🎉' }),
    createEl('div', { text: `You reviewed ${count} card${count === 1 ? '' : 's'}.` }),
    createEl('button', {
      style: {
        marginTop: '16px', padding: '12px 20px',
        background: 'var(--ink)', color: 'var(--cream)',
        border: 'none', borderRadius: '12px',
        fontFamily: 'inherit', fontWeight: '700', cursor: 'pointer',
      },
      text: 'Do another round',
      onclick: () => openDeck(ctx),
    }),
  ]));
}

export function renderDeck() {}
