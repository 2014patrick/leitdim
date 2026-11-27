import * as opentype from './opentype/dist/opentype.mjs';
import fs from 'fs';
const font = (w) => opentype.parse(fs.readFileSync(`./manrope/files/manrope-latin-${w}-normal.woff`).buffer.slice(0));
const F800 = font(800), F600 = font(600), F500 = font(500);
const C = { navy: '#0B2545', navy2: '#16467A', blue: '#1A6FE0', gauge: '#3DA5FF', cu: '#C8743A', cuLight: '#F2A66B', sheath: '#EEF4FA', ins: '#C9D6E4', grey: '#5B6B7F' };

function textPath(f, txt, x, y, size, fill, ls = 0) {
  // returns {d, width}
  let cx = x, d = '';
  const glyphs = f.stringToGlyphs(txt);
  const scale = size / f.unitsPerEm;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    d += g.getPath(cx, y, size).toPathData(2);
    let adv = g.advanceWidth * scale;
    if (i < glyphs.length - 1) adv += f.getKerningValue(g, glyphs[i + 1]) * scale;
    cx += adv + ls;
  }
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: cx - x - ls };
}

const coreDefs = `<radialGradient id="cu" cx="0.36" cy="0.3" r="0.78"><stop offset="0" stop-color="#FFC795"/><stop offset="0.5" stop-color="#D9813F"/><stop offset="1" stop-color="#9E4D1B"/></radialGradient>`;
function cores(cx, cy, k = 1, insFill = '#FFFFFF', insStroke = C.ins) {
  const d = 32 * k, r = 26 * k, rc = 17 * k;
  const pts = [[-90], [30], [150]].map(([a]) => [cx + d * Math.cos(a * Math.PI / 180), cy + d * Math.sin(a * Math.PI / 180)]);
  return pts.map(([x, y], i) => `<g class="core core${i + 1}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${insFill}" stroke="${insStroke}" stroke-width="${5 * k}"/><circle class="cu" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rc}" fill="url(#cu)"/></g>`).join('');
}
const R = 92, CIRC = 2 * Math.PI * R;
function markInner(variant) {
  // variant: 'app' (on navy tile) | 'flat' (for light bg) | 'dark' (no tile, on dark bg)
  const arcCol = C.gauge;
  const sheathFill = variant === 'flat' ? C.navy : C.sheath;
  const insFill = variant === 'flat' ? '#FFFFFF' : '#FFFFFF';
  const insStroke = variant === 'flat' ? '#2B4E77' : C.ins;
  return `<circle class="arc" cx="128" cy="128" r="${R}" fill="none" stroke="${variant === 'flat' ? C.blue : arcCol}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(CIRC * 0.75).toFixed(1)} ${CIRC.toFixed(1)}" transform="rotate(135 128 128)"/>
  <circle class="sheath" cx="128" cy="128" r="70" fill="${sheathFill}"/>
  ${cores(128, 128, 1, insFill, insStroke)}`;
}
function markSVG(variant, size = 256) {
  const tile = variant === 'app' ? `<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navy2}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>${coreDefs}</defs>${tile}${markInner(variant)}</svg>`;
}
function wordmark(x, y, size, dark) {
  const a = textPath(F800, 'Leit', x, y, size, dark ? '#FFFFFF' : C.navy, -size * 0.01);
  const b = textPath(F800, 'Dim', x + a.width - size * 0.01, y, size, dark ? C.cuLight : C.cu, -size * 0.01);
  return { svg: a.svg + b.svg, width: a.width + b.width };
}
function horizontal(dark) {
  const H = 140, mark = 112;
  const wm = wordmark(150, 78, 64, dark);
  const tag = textPath(F600, 'LEITUNGSDIMENSIONIERUNG · NIN 2025', 153, 112, 15.5, dark ? '#9FB3CC' : C.grey, 1.6);
  const W = Math.ceil(Math.max(150 + wm.width, 153 + tag.width) + 24);
  const bg = dark ? `<rect width="${W}" height="${H}" rx="18" fill="${C.navy}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navy2}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>${coreDefs}</defs>${bg}<g transform="translate(18,14) scale(${mark / 256})"><rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>${markInner('app')}</g>${wm.svg}${tag.svg}</svg>`;
}
fs.writeFileSync('out/leitdim-icon.svg', markSVG('app'));
fs.writeFileSync('out/leitdim-zeichen.svg', markSVG('flat'));
fs.writeFileSync('out/leitdim-zeichen-dunkel.svg', markSVG('dark'));
fs.writeFileSync('out/leitdim-logo.svg', horizontal(false));
fs.writeFileSync('out/leitdim-logo-dunkel.svg', horizontal(true));
// Wortmarke einzeln (für App-Toolbar, weiss/kupfer auf navy)
for (const dark of [false, true]) {
  const wm = wordmark(0, 46, 48, dark);
  const W = Math.ceil(wm.width + 4);
  fs.writeFileSync(`out/leitdim-wortmarke${dark ? '-dunkel' : ''}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="60" viewBox="0 0 ${W} 60">${wm.svg}</svg>`);
}
// Mark-Bausteine für animierte Version (ohne Kachel, Klassen für CSS)
fs.writeFileSync('out/mark-anim-inner.svg', markInner('dark'));
// Bausteine für die App (brand.js)
const wmL = wordmark(0, 38, 40, false), wmD = wordmark(0, 38, 40, true);
const brandJs = `/* LeitDim Brand – generiert */
(function (g) {
  g.LD_BRAND = {
    colors: ${JSON.stringify(C)},
    markInnerDark: ${JSON.stringify(markInner('dark'))},
    markInnerFlat: ${JSON.stringify(markInner('flat'))},
    coreDefs: ${JSON.stringify(coreDefs)},
    wordmarkLight: { svg: ${JSON.stringify(wmL.svg)}, w: ${Math.ceil(wmL.width)} },
    wordmarkDark: { svg: ${JSON.stringify(wmD.svg)}, w: ${Math.ceil(wmD.width)} },
    arcLen: ${(CIRC * 0.75).toFixed(1)}, circ: ${CIRC.toFixed(1)},
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync('../app/renderer/brand.js', brandJs);
console.log('ok', (CIRC * 0.75).toFixed(1), CIRC.toFixed(1));
