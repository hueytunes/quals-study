/* utils.js — tiny helpers. */

export const getEl = (id) => document.getElementById(id);
export const querySelAll = (sel) => document.querySelectorAll(sel);

export function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const k in props) {
    if (k === 'class' || k === 'className') el.className = props[k];
    else if (k === 'text') el.textContent = props[k];
    else if (k === 'html') el.innerHTML = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), props[k]);
    } else if (k === 'style' && typeof props[k] === 'object') {
      Object.assign(el.style, props[k]);
    } else if (k === 'dataset' && typeof props[k] === 'object') {
      Object.assign(el.dataset, props[k]);
    } else el.setAttribute(k, props[k]);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function svgBack() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M10 12L6 8l4-4');
  svg.appendChild(p);
  return svg;
}

export function greetingEyebrow() {
  const h = new Date().getHours();
  if (h < 5 || h >= 22) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* Prettify the raw prose from the PDF extractor:
   - Paragraphs (blank-line split)
   - Italicize figure callouts
   - Bold "Key facts:" or inline bold-like labels (crude) */
export function formatProse(body) {
  if (!body) return '';
  // Split on blank lines
  const paras = body.split(/\n\s*\n+/);
  return paras.map(p => {
    let x = escapeHtml(p.trim()).replace(/\n/g, ' ');
    // Bold keywords that look like section labels "Key facts:", "Nuance for committee:", etc.
    x = x.replace(/\b(Key facts|Nuance for committee|Takeaway|Clinical relevance|Key residues[^:]*|Key points?)\s*:/gi,
                  '<strong>$1:</strong>');
    return `<p>${x}</p>`;
  }).join('');
}
