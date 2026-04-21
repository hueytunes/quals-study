/* Settings: theme + defense date + reset progress. */
import { createEl, svgBack } from '../utils.js';
import { back } from '../router.js';
import { getSettings, setSetting, getProgress, setProgress } from '../storage.js';

export function renderSettings(host) {
  host.innerHTML = '';
  host.appendChild(createEl('div', { class: 'screen-header' }, [
    createEl('button', { class: 'back', onclick: () => back() }, [svgBack()]),
    createEl('div', { class: 'title-block' }, [
      createEl('h1', { text: 'Settings' }),
    ]),
    createEl('div', { style: { width: '38px' } }),
  ]));

  const s = getSettings();

  // Theme
  const themeCard = createEl('div', { class: 'sub-card', style: { marginBottom: '14px' } }, [
    createEl('h4', { text: 'Appearance' }),
    renderThemeRow(s.theme),
  ]);
  host.appendChild(themeCard);

  // Defense date
  const defenseCard = createEl('div', { class: 'sub-card', style: { marginBottom: '14px' } }, [
    createEl('h4', { text: 'Defense date' }),
    createEl('input', {
      type: 'date',
      value: s.defenseDate || '',
      class: 'input',
      style: {
        padding: '12px 14px', borderRadius: '12px',
        border: '2px solid transparent', background: 'var(--cream-deep)',
        fontSize: '14px', width: '100%', outline: 'none',
        fontFamily: 'inherit', color: 'var(--ink)',
      },
      onchange: (e) => setSetting('defenseDate', e.target.value || null),
    }),
    createEl('p', {
      style: { fontSize: '12px', color: 'var(--ink-soft)', margin: '8px 0 0' },
      text: 'Shows a countdown on Home.',
    }),
  ]);
  host.appendChild(defenseCard);

  // Progress
  const progCard = createEl('div', { class: 'sub-card', style: { marginBottom: '14px' } }, [
    createEl('h4', { text: 'Progress' }),
  ]);
  const p = getProgress();
  const rows = [
    ['Streak', `${p.streak?.days || 0} day${(p.streak?.days || 0) === 1 ? '' : 's'}`],
    ['Cards reviewed', Object.keys(p.cards || {}).length],
    ['Q&As seen', Object.keys(p.qSeen || {}).length],
    ['Sections viewed', Object.keys(p.sectionsViewed || {}).length],
  ];
  rows.forEach(([k, v]) => {
    progCard.appendChild(createEl('div', {
      style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', borderBottom: '1px dashed var(--cream-deep)' },
    }, [
      createEl('span', { style: { color: 'var(--ink-soft)' }, text: k }),
      createEl('span', { style: { fontWeight: '700' }, text: String(v) }),
    ]));
  });
  progCard.appendChild(createEl('button', {
    style: {
      marginTop: '12px', width: '100%',
      padding: '10px', border: '1px solid var(--red-danger)',
      color: 'var(--red-danger)', background: 'transparent',
      borderRadius: '10px', fontFamily: 'inherit',
      fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    },
    text: 'Reset progress',
    onclick: () => {
      if (confirm('Reset streak, card ratings, Q&A seen, and viewed sections? This cannot be undone.')) {
        setProgress(() => ({
          streak: { days: 0, lastDay: null },
          sectionsViewed: {}, cards: {}, qSeen: {}, lastLocation: null,
        }));
        renderSettings(host);
      }
    },
  }));
  host.appendChild(progCard);

  // About
  const about = createEl('div', { class: 'sub-card' }, [
    createEl('h4', { text: 'About' }),
    createEl('p', {
      style: { fontSize: '13px', color: 'var(--ink-soft)', margin: '4px 0 0', lineHeight: '1.55' },
      html: 'Quals Study Bible · v1.0<br/>Interactive companion to your Tier 1/2/3 study guide.<br/>© 2026 · Built by Huey',
    }),
  ]);
  host.appendChild(about);
}

function renderThemeRow(current) {
  const row = createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });
  row.appendChild(createEl('span', { style: { fontSize: '14.5px', fontWeight: '600', color: 'var(--ink)' }, text: 'Theme' }));
  const seg = createEl('div', { style: { display: 'flex', gap: '2px', background: 'var(--cream-deep)', padding: '3px', borderRadius: '999px' } });
  const opts = [
    { value: 'light', label: 'Light' },
    { value: 'dark',  label: 'Dark' },
    { value: 'auto',  label: 'Auto' },
  ];
  const btns = [];
  for (const o of opts) {
    const active = o.value === current;
    const b = createEl('button', {
      style: {
        padding: '6px 12px', border: 'none', cursor: 'pointer',
        borderRadius: '999px', fontSize: '12px', fontWeight: '600',
        color: active ? 'var(--cream)' : 'var(--ink-soft)',
        background: active ? 'var(--ink)' : 'transparent',
        fontFamily: 'inherit',
      },
      text: o.label,
      onclick: () => {
        setSetting('theme', o.value);
        btns.forEach((x, i) => {
          const a = opts[i].value === o.value;
          x.style.color = a ? 'var(--cream)' : 'var(--ink-soft)';
          x.style.background = a ? 'var(--ink)' : 'transparent';
        });
        const wantsDark = o.value === 'dark' ||
          (o.value === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.classList.toggle('dark', wantsDark);
        document.getElementById('icon-sun').style.display  = wantsDark ? 'none'  : 'block';
        document.getElementById('icon-moon').style.display = wantsDark ? 'block' : 'none';
      },
    });
    btns.push(b);
    seg.appendChild(b);
  }
  row.appendChild(seg);
  return row;
}
