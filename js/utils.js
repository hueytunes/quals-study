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
   - Bold "Key facts:" or inline bold-like labels (crude)
   - Render "PMID: … · DOI: … · Model: … · Approach: …" footer as a pill row */
export function formatProse(body) {
  if (!body) return '';
  const paras = body.split(/\n\s*\n+/);
  return paras.map(p => {
    const raw = p.trim();
    // Supplement paper-footer line: "PMID: … · DOI: [10.x](https://…) · Model: … · Approach: …"
    const footerM = raw.match(
      /^PMID:\s*(\d+)\s*[·|]\s*DOI:\s*(?:\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(\S+))(?:\s*[·|]\s*Model:\s*([^·|\n]+?))?(?:\s*[·|]\s*Approach:\s*(.+?))?\s*$/
    );
    if (footerM) {
      const pmid = footerM[1];
      const doiLabel = footerM[2] || footerM[4] || '';
      const doiUrl = footerM[3] || (doiLabel ? `https://doi.org/${doiLabel}` : '');
      const model = footerM[5] ? footerM[5].trim() : '';
      const approach = footerM[6] ? footerM[6].trim() : '';
      const pills = [];
      pills.push(`<a class="pf-pill" href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener">PMID ${pmid}</a>`);
      if (doiUrl) pills.push(`<a class="pf-pill" href="${escapeHtml(doiUrl)}" target="_blank" rel="noopener">DOI ${escapeHtml(doiLabel)}</a>`);
      let footer = `<div class="paper-footer">${pills.join('')}</div>`;
      if (model) footer += `<div class="paper-meta"><span class="pm-k">Model</span> ${escapeHtml(model)}</div>`;
      if (approach) footer += `<div class="paper-meta"><span class="pm-k">Approach</span> ${escapeHtml(approach)}</div>`;
      return footer;
    }
    let x = escapeHtml(raw).replace(/\n/g, ' ');
    x = x.replace(/\b(Key facts|Nuance for committee|Takeaway|Clinical relevance|Key residues[^:]*|Key points?)\s*:/gi,
                  '<strong>$1:</strong>');
    return `<p>${x}</p>`;
  }).join('');
}

/* Display info for a tier — handles Tiers 1-3 and the Supplement. */
export function tierDisplay(tier, index = 0) {
  if (!tier) return { eyebrow: '', short: '' };
  if (tier.id === 'supplement') {
    return { eyebrow: 'Supplement', short: tier.title.replace(/^Supplement\s*—\s*/, '') };
  }
  const m = tier.title.match(/^(Tier \d+)\s*—\s*(.+)$/);
  if (m) return { eyebrow: m[1], short: m[2] };
  return { eyebrow: `Tier ${index + 1}`, short: tier.title };
}
