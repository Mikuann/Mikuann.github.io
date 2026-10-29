'use strict';
// ---------- Formats ----------
const $ = (s, el = document) => el.querySelector(s);
const nf = new Intl.NumberFormat('fr-FR');
const n1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const pct = x => n1.format(x * 100) + ' %';
const fmtH = h => h >= 100 ? nf.format(Math.round(h)) + ' h' : h >= 1 ? n1.format(h) + ' h' : Math.round(h * 60) + ' min';
const fmtSec = s => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_C = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const dParse = d => new Date(d + 'T12:00:00Z');
const dateFr = d => d ? dParse(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^1 /, '1er ') : '—';
const dateDay = d => dParse(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/ 1 /, ' 1er ');
const stamp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const ratio = (a, b) => b ? a / b : null;
const delta = (cur, prev, label) => {
  if (!prev) return '';
  const r = cur / prev;
  const txt = r >= 1.995 ? `×${n1.format(r)}` : `${r >= 1 ? '+' : '−'}${n1.format(Math.abs(r - 1) * 100)} %`;
  return `<span class="${r >= 1 ? 'up' : 'down'}">${txt}</span> vs ${label}`;
};
const REASON_END = { trackdone: "écouté jusqu'au bout", fwdbtn: 'passé (bouton suivant)', backbtn: 'retour au titre précédent', endplay: 'arrêté ou remplacé', clickrow: 'autre titre choisi', logout: 'déconnexion', remote: 'arrêté depuis un autre appareil', trackerror: 'erreur de lecture', 'unexpected-exit': "fermeture de l'appli", 'unexpected-exit-while-paused': "fermeture de l'appli en pause", playbtn: 'pause', unknown: 'inconnu' };
const REASON_START = { trackdone: 'enchaîné après le titre précédent', clickrow: 'choisi en cliquant dessus', fwdbtn: 'arrivé via « suivant »', backbtn: 'arrivé via « précédent »', playbtn: 'bouton lecture', appload: "reprise à l'ouverture de l'appli", remote: 'lancé depuis un autre appareil', trackerror: 'après une erreur', unknown: 'inconnu' };

// ---------- State & API ----------
let YEAR = null, META = null, MEDIA = { t: {}, a: {}, al: {}, dz: {} };
const CFG = window.SITE_CONFIG || {};
const OWNER = CFG.owner || 'moi';
// Version publique (GitHub Pages) : pas de serveur, les réponses de l'API sont des fichiers JSON pré-calculés
const STATIC = !!window.STATIC_SITE;
const fnv = s => { let h = 0x811c9dc5; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const files = new Map();
const fetchJson = url => { if (!files.has(url)) files.set(url, fetch(window.BUILD ? `${url}?v=${window.BUILD}` : url).then(r => r.ok ? r.json() : Promise.reject(new Error('Erreur ' + r.status)))); return files.get(url); };
function staticCall(name, params) {
  if (name === 'meta') return fetchJson('data/meta.json');
  const base = `data/${YEAR}/`;
  const keyOf = { month: p => p.m, artist: p => fnv(p.name), track: p => p.uri.split(':').pop(), album: p => fnv(p.artist + '\u0000' + p.name) }[name];
  if (keyOf) return fetchJson(base + name + '.json').then(all => all[keyOf(params)] ?? null);
  return fetchJson(base + name + '.json');
}
const cache = new Map();
async function api(name, params = {}) {
  const q = new URLSearchParams({ year: YEAR, ...params }).toString();
  const key = name + '?' + q;
  if (!cache.has(key)) cache.set(key, STATIC ? staticCall(name, params) : fetch('/api/' + name + '?' + q).then(r => r.ok ? r.json() : Promise.reject(new Error('Erreur ' + r.status))));
  const id = renderId;
  return cache.get(key).then(v => { if (id !== renderId) throw STALE; return v; }); // page quittée entre-temps
}
let renderId = 0;
const STALE = new Error('stale');
const yearLabel = () => YEAR === 'all' ? 'depuis le début' : `en ${YEAR}`;
const isAll = () => YEAR === 'all';

// ---------- Tooltip ----------
const tip = $('#tip');
function showTip(html, e) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
const hideTip = () => { tip.hidden = true; };

// ---------- Charts ----------
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent) => { const el = document.createElementNS(SVGNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };
const ctx = document.createElement('canvas').getContext('2d');
const textW = s => { ctx.font = '12px Figtree, Segoe UI, sans-serif'; return ctx.measureText(s).width; };
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
// items: [{label, value, prev?, href?, tip?}]
function bars(el, items, { height = 220, fmt = fmtH, tick = v => (v ? fmt(v) : '0') } = {}) {
  el.innerHTML = '';
  if (!items.length) { el.innerHTML = '<p class="empty">Rien à afficher.</p>'; return; }
  const W = Math.max(260, el.clientWidth), max = Math.max(...items.map(d => Math.max(d.value, d.prev || 0)));
  const ticks = niceTicks(max), top = ticks[ticks.length - 1];
  const ml = Math.ceil(Math.max(...ticks.map(t => textW(tick(t))))) + 10, mr = 4, mt = 8, mb = 24;
  const iw = W - ml - mr, ih = height - mt - mb, bw = iw / items.length;
  const y = v => mt + ih - (v / top) * ih;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${height}`, height, role: 'img' }, el);
  for (const t of ticks) {
    svgEl('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), class: 'grid-l' }, svg);
    svgEl('text', { x: ml - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg).textContent = tick(t);
  }
  const maxLabel = Math.max(...items.map(d => textW(d.label))) + 8, every = Math.max(1, Math.ceil(maxLabel / bw));
  const pad = Math.min(bw * 0.22, 10), barW = Math.max(1, Math.min(bw - pad * 2, 40));
  items.forEach((d, i) => {
    const cx = ml + bw * i + bw / 2;
    if (d.value > 0) svgEl('rect', { x: cx - barW / 2, y: y(d.value), width: barW, height: Math.max(1, y(0) - y(d.value)), rx: Math.min(3, barW / 2), class: 'bar' + (d.dim ? ' dim' : '') }, svg);
    if (d.prev) svgEl('line', { x1: cx - barW / 2 - 2, x2: cx + barW / 2 + 2, y1: y(d.prev), y2: y(d.prev), class: 'prev-mark' }, svg);
    if (i % every === 0) svgEl('text', { x: cx, y: height - 6, 'text-anchor': 'middle' }, svg).textContent = d.label;
    const hov = svgEl('rect', { x: ml + bw * i, y: mt, width: bw, height: ih, class: 'bar-hover' + (d.href ? ' link' : '') }, svg);
    hov.addEventListener('mousemove', e => showTip(d.tip || `<span class="t-d">${esc(d.label)}</span><br><b>${esc(fmt(d.value))}</b>`, e));
    hov.addEventListener('mouseleave', hideTip);
    if (d.href) hov.addEventListener('click', () => { hideTip(); location.hash = d.href; });
  });
}
function heatmap(el, matrix) {
  el.innerHTML = '';
  const W = Math.max(320, el.clientWidth), ml = 44, mt = 4, mb = 22, cw = (W - ml) / 24, ch = Math.min(28, Math.max(16, cw * 0.9)), H = mt + ch * 7 + mb;
  const max = Math.max(...matrix.flat());
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, height: H }, el);
  matrix.forEach((row, d) => {
    svgEl('text', { x: 0, y: mt + ch * d + ch / 2 + 4 }, svg).textContent = JOURS_C[d];
    row.forEach((v, h) => {
      const r = svgEl('rect', { x: ml + cw * h + 1, y: mt + ch * d + 1, width: cw - 2, height: ch - 2, rx: 3, class: 'cell', 'fill-opacity': max ? (0.06 + 0.94 * v / max).toFixed(3) : 0 }, svg);
      r.addEventListener('mousemove', e => showTip(`<span class="t-d">${JOURS[d]}, ${h} h – ${h + 1} h</span><br><b>${fmtH(v)}</b> au total`, e));
      r.addEventListener('mouseleave', hideTip);
    });
  });
  for (let h = 0; h < 24; h += 3) svgEl('text', { x: ml + cw * h + cw / 2, y: H - 6, 'text-anchor': 'middle' }, svg).textContent = h + ' h';
}
function calendar(el, daily, year) {
  el.innerHTML = '';
  const map = new Map(daily.map(d => [d.d, d])), max = Math.max(...daily.map(d => d.hours), 1);
  const jan1 = Date.UTC(year, 0, 1), off = (new Date(jan1).getUTCDay() + 6) % 7, days = (Date.UTC(year + 1, 0, 1) - jan1) / 864e5;
  const weeks = Math.ceil((days + off) / 7), ml = 34, mt = 18;
  const cs = Math.max(11, Math.min(20, Math.floor((el.clientWidth - ml) / weeks)));
  const W = ml + cs * weeks, H = mt + cs * 7 + 4;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cal' }, el);
  svg.style.width = W + 'px';
  [0, 2, 4, 6].forEach(d => { svgEl('text', { x: 0, y: mt + cs * d + cs - 3 }, svg).textContent = JOURS_C[d]; });
  for (let i = 0; i < days; i++) {
    const t = jan1 + i * 864e5, dt = new Date(t), d = dt.toISOString().slice(0, 10), w = Math.floor((i + off) / 7), wd = (i + off) % 7;
    if (dt.getUTCDate() === 1) svgEl('text', { x: ml + cs * w, y: 12 }, svg).textContent = MOIS_C[dt.getUTCMonth()];
    const g = map.get(d);
    const r = svgEl('rect', { x: ml + cs * w + 1, y: mt + cs * wd + 1, width: cs - 2, height: cs - 2, rx: 2, class: g ? 'cell' : 'cell-off', 'fill-opacity': g ? (0.12 + 0.88 * g.hours / max).toFixed(3) : 1 }, svg);
    r.addEventListener('mousemove', e => showTip(`<span class="t-d">${dateDay(d)}</span><br>${g ? `<b>${fmtH(g.hours)}</b> · ${nf.format(g.plays)} écoutes` : 'aucune écoute'}`, e));
    r.addEventListener('mouseleave', hideTip);
  }
}

// ---------- HTML helpers ----------
const kpi = (label, value, sub = '', href) => `<${href ? `a href="${href}"` : 'div'} class="kpi"><span class="kpi-l">${label}</span><span class="kpi-v">${value}</span>${sub ? `<span class="kpi-s">${sub}</span>` : ''}</${href ? 'a' : 'div'}>`;
// Cards holding a table are dark panels; the others are color blocks.
const card = (title, body, { note = '', more = '', wide = false } = {}) => `<section class="card${/id="t-/.test(body) ? ' plain' : ''}"${wide ? ' style="grid-column:1/-1"' : ''}><div class="card-h"><h2>${title}</h2>${more}</div>${note ? `<p class="note">${note}</p>` : ''}${body}</section>`;
const moreLink = (href, txt = 'Tout voir') => `<a class="more" href="${href}">${txt} →</a>`;
const aArtist = n => `#/artiste/${enc(n)}`, aTrack = u => `#/titre/${enc(u)}`, aAlbum = (a, n) => `#/album/${enc(a)}/${enc(n)}`;
// Images : pochettes et photos servies par le serveur local, ou liens directs listés dans media.json en version publique
const pic = STATIC ? {
  track: u => MEDIA.t[String(u).split(':').pop()] || PLACEHOLDER,
  artist: n => MEDIA.a[fnv(n)] || PLACEHOLDER,
  album: (a, n) => MEDIA.al[fnv(a + '\u0000' + n)] || PLACEHOLDER,
} : {
  track: u => `/media/track?v=2&uri=${enc(u)}`,
  artist: n => `/media/artist?v=2&name=${enc(n)}`,
  album: (a, n) => `/media/album?v=2&artist=${enc(a)}&name=${enc(n)}`,
};
// Extraits de 30 s : via le serveur local, ou directement chez Deezer (JSONP) en version publique
let jsonpN = 0;
function jsonp(url) {
  return new Promise((res, rej) => {
    const cb = '__dz' + (++jsonpN), s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = d => { done(); res(d); };
    s.onerror = () => { done(); rej(new Error('jsonp')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    document.head.appendChild(s);
    setTimeout(() => { if (window[cb]) { done(); rej(new Error('timeout')); } }, 8000);
  });
}
async function previewSrc(uri) {
  if (!STATIC) return '/media/preview?uri=' + enc(uri);
  const dz = MEDIA.dz[String(uri).split(':').pop()];
  if (!dz) return null;
  const d = await jsonp('https://api.deezer.com/track/' + dz).catch(() => null);
  return d && d.preview || null;
}
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.hasAttribute('data-optional')) e.target.remove(); }, true);
const cover = (src, cls = '') => `<img class="cov ${cls}" src="${src}" alt="" loading="lazy" decoding="async">`;
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#8a6bff"/><stop offset="1" stop-color="#ff5bb0"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><path d="M27 18v20.5a6 6 0 1 0 4 5.6V26l12-3v11.5a6 6 0 1 0 4 5.6V14z" fill="#0a0a0d" opacity=".55"/></svg>');
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.classList.contains('cov') && t.src !== PLACEHOLDER) t.src = PLACEHOLDER; }, true);
const dhead = (img, round, inner) => `<div class="dhead"><div class="dhead-bg" style="background-image:url('${esc(img)}')"></div>${cover(img, 'xl' + (round ? ' round' : ''))}<div class="head">${inner}</div></div>`;
function hlist(items, { val = d => fmtH(d.hours), metric = d => d.hours, href, sub, img, round } = {}) {
  const max = Math.max(...items.map(metric), 0) || 1;
  return `<ol class="hlist${img ? ' with-pic' : ''}">${items.map((d, i) => `<li><span class="hl-r">${i + 1}</span>${img ? cover(img(d), 'sm' + (round ? ' round' : '')) : ''}<span class="hl-n">${href ? `<a href="${href(d)}">${esc(d.name)}</a>` : esc(d.name)}${sub ? ` <small>${sub(d)}</small>` : ''}</span><span class="hl-v">${val(d)}</span><span class="hl-b"><span style="width:${(metric(d) / max * 100).toFixed(1)}%"></span></span></li>`).join('')}</ol>`;
}
function splitList(items, total, fmt) {
  return `<div class="split">${items.map(d => `<div class="split-row"><span>${esc(d.label)}</span><span class="hl-v">${fmt(d.value)} · ${pct(d.value / total)}</span><span class="hl-b"><span style="width:${(d.value / total * 100).toFixed(1)}%"></span></span></div>`).join('')}</div>`;
}
// Sortable, searchable table. cols: [{key, label, num, fmt(row)->html, hide}]
function mountTable(el, cols, rows, { sort, searchText, limit = 200, placeholder = 'Rechercher…' } = {}) {
  let key = sort?.key, dir = sort?.dir || -1, q = '', shown = limit;
  el.innerHTML = `<div class="tbl-tools">${searchText ? `<input type="search" placeholder="${placeholder}" aria-label="${placeholder}">` : ''}<span class="tbl-count"></span></div><div class="tbl-box"><table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num ' : ''}${c.hide ? 'hide-sm' : ''}" data-k="${c.key}"><button type="button">${c.label}</button></th>`).join('')}</tr></thead><tbody></tbody></table></div><button type="button" class="btn tbl-more" hidden>Afficher plus</button>`;
  const tbody = $('tbody', el), count = $('.tbl-count', el), moreBtn = $('.tbl-more', el);
  function draw() {
    let list = q ? rows.filter(r => searchText(r).toLowerCase().includes(q)) : rows.slice();
    if (key) list.sort((a, b) => { const x = a[key], y = b[key]; return (typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? ''), 'fr') : (x ?? -Infinity) - (y ?? -Infinity)) * dir; });
    count.textContent = `${nf.format(list.length)} ligne${list.length > 1 ? 's' : ''}`;
    tbody.innerHTML = list.slice(0, shown).map(r => `<tr>${cols.map(c => `<td class="${c.num ? 'num ' : ''}${c.hide ? 'hide-sm ' : ''}${c.wrap ? 'wrap-cell' : ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    moreBtn.hidden = list.length <= shown;
    el.querySelectorAll('th').forEach(th => th.setAttribute('aria-sort', th.dataset.k === key ? (dir < 0 ? 'descending' : 'ascending') : 'none'));
  }
  el.querySelectorAll('th button').forEach(b => b.addEventListener('click', () => {
    const k = b.parentElement.dataset.k, c = cols.find(c => c.key === k);
    if (key === k) dir = -dir; else { key = k; dir = c.num ? -1 : 1; }
    draw();
  }));
  const input = $('input', el);
  if (input) input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); shown = limit; draw(); });
  moreBtn.addEventListener('click', () => { shown += limit * 2; draw(); });
  draw();
}

// ---------- Pages ----------
const main = $('#main');
let redraws = [];
const chart = (id, fn) => redraws.push(() => { const el = document.getElementById(id); if (el) fn(el); });
const monthItems = (vals, prev, hrefFn) => vals.map((v, i) => ({
  label: MOIS_C[i], value: v || 0, prev: prev ? prev[i] : null, href: hrefFn ? hrefFn(i) : null,
  tip: `<span class="t-d">${MOIS[i]}</span><br><b>${fmtH(v || 0)}</b>${prev ? `<br>${YEAR - 1} : ${fmtH(prev[i])}` : ''}`,
})).filter((d, i) => !(YEAR === META.defaultYear && i + 1 > +META.last.slice(5, 7)));
const legendPrev = () => `<div class="legend"><span><i class="cur"></i>${YEAR}</span><span><i class="prev"></i>${YEAR - 1}</span></div>`;

const pages = {
  async ''() {
    const o = await api('overview');
    const c = o.compare;
    const vs = c ? (c.cutoff === '12-31' ? `${c.year}` : `${c.year} à la même date`) : '';
    main.innerHTML = `
      <div class="hero">
        <div class="hero-bg" style="background-image:url('${esc(CFG.banner || pic.artist(o.topArtists[0]?.name))}'), url('${esc(pic.artist(o.topArtists[0]?.name))}')"></div>
        ${CFG.portrait ? `<img class="hero-portrait" src="${esc(CFG.portrait)}" alt="" data-optional>` : `<div class="hero-covers" aria-hidden="true">${o.topTracks.slice(0, 5).map(t => cover(pic.track(t.key))).join('')}</div>`}
        <div class="owner">${CFG.avatar ? `<img src="${esc(CFG.avatar)}" alt="Avatar de ${esc(OWNER)}" data-optional>` : ''}<span>Les stats Spotify de ${esc(OWNER)}</span></div>
        <h1>${isAll() ? 'Depuis le début' : `En ${YEAR}`}, ${esc(OWNER)} a écouté <span class="accent">${fmtH(o.hours)}</span> de musique.</h1>
        <p class="lede">Du ${dateFr(o.first)} au ${dateFr(o.last)}, soit <b>${n1.format(o.hours / 24)} jours</b> complets, ou <b>${n1.format(o.hours / o.span)} h par jour</b> en moyenne.${c ? ` ${delta(c.cur.hours, c.prev.hours, vs)}.` : ''}${o.ageGuess ? ` Âge musical estimé : <b>${o.ageGuess} ans</b>.` : ''}</p>
        <a class="btn btn-play" href="#/recap">▶ Voir le récap ${isAll() ? '' : YEAR}</a>
        ${CFG.portrait ? `<div class="hero-strip" aria-hidden="true">${o.topTracks.slice(0, 5).map(t => cover(pic.track(t.key))).join('')}<small>son top 5 du moment</small></div>` : ''}
      </div>
      <div class="kpis">
        ${kpi('Écoutes', nf.format(o.plays), c ? delta(c.cur.plays, c.prev.plays, vs) : 'lectures de 30 s ou plus', '#/titres')}
        ${kpi('Titres différents', nf.format(o.tracks), c ? delta(c.cur.tracks, c.prev.tracks, vs) : '', '#/titres')}
        ${kpi('Artistes différents', nf.format(o.artists), c ? delta(c.cur.artists, c.prev.artists, vs) : '', '#/artistes')}
        ${kpi('Albums différents', nf.format(o.albums), '', '#/albums')}
        ${kpi("Jours d'écoute", nf.format(o.days), `sur ${nf.format(o.span)} jours`, '#/habitudes')}
        ${kpi('Série record', `${nf.format(o.streak.len)} j`, `jours d'affilée, jusqu'au ${dateFr(o.streak.end)}`, '#/habitudes')}
        ${kpi('Nouveaux artistes', nf.format(o.newArtists), `${nf.format(o.newTracks)} nouveaux titres`, '#/decouvertes')}
        ${kpi('Titres passés', pct(o.skipRate), `aléatoire : ${pct(o.shuffle)} des lectures`, '#/habitudes')}
      </div>
      <div class="grid">
        ${o.months ? card('Heures par mois', `${c ? legendPrev() : ''}<div class="chart" id="c-months"></div>`, { note: 'Clique sur un mois pour le détail.', more: moreLink('#/mois'), wide: true }) : ''}
        ${card('Top artistes', hlist(o.topArtists, { img: d => pic.artist(d.name), round: true, href: d => aArtist(d.name), sub: d => `${nf.format(d.plays)} écoutes` }), { note: "Classés par temps d'écoute.", more: moreLink('#/artistes') })}
        ${card('Top titres', hlist(o.topTracks, { img: d => pic.track(d.key), val: d => nf.format(d.plays), metric: d => d.plays, href: d => aTrack(d.key), sub: d => esc(d.artist) }), { note: "Classés par nombre d'écoutes.", more: moreLink('#/titres') })}
        ${card('Records', `<dl class="facts">
          <div><dt>Plus grosse journée</dt><dd>${fmtH(o.bestDay.hours)}</dd><dt>${dateDay(o.bestDay.d)}</dt></div>
          <div><dt>Plus longue session sans pause</dt><dd>${o.sessions.longest ? fmtH(o.sessions.longest.hours) : '—'}</dd><dt>${o.sessions.longest ? `${stamp(o.sessions.longest.start)} → ${stamp(o.sessions.longest.end)}` : ''}</dt></div>
          <div><dt>Album le plus écouté</dt><dd>${o.topAlbums[0] ? `<a href="${aAlbum(o.topAlbums[0].artist, o.topAlbums[0].name)}">${esc(o.topAlbums[0].name)}</a>` : '—'}</dd><dt>${o.topAlbums[0] ? `${esc(o.topAlbums[0].artist)} · ${fmtH(o.topAlbums[0].hours)}` : ''}</dt></div>
          <div><dt>Séances d'écoute</dt><dd>${nf.format(o.sessions.count)}</dd><dt>une séance s'arrête après 20 min de silence</dt></div>
        </dl>`, { more: moreLink('#/habitudes', 'Habitudes') })}
        ${card('Année par année', `<div class="chart" id="c-years"></div>`, { note: "Heures d'écoute sur l'année entière (l'année en cours s'arrête à la date de l'export)." })}
      </div>
      ${CFG.overviewBanner ? `<div class="vbanner"><video muted loop playsinline preload="metadata" poster="${esc(CFG.overviewBannerPoster || '')}" src="${esc(CFG.overviewBanner)}" aria-hidden="true"></video><div class="vbanner-txt"><span>${esc(OWNER)} · ${isAll() ? 'tout l’historique' : YEAR}</span><strong>${isAll() ? 'Plongée dans l’historique' : 'Plongée dans l’année'}</strong></div></div>` : ''}
      ${o.artistMonths ? `<h2 class="section-t">L'année en détail</h2>
      <div class="grid">
        ${card('Le flux des artistes', `<div class="chart" id="c-stream" style="min-height:320px"></div>`, { note: 'Le poids de chaque artiste du top 8, mois par mois. Survole une couleur pour le détail.', wide: true })}
        ${card('La course au n°1', `<div class="chart" id="c-bump" style="min-height:340px"></div>`, { note: 'Le rang de chaque artiste du top 8 chaque mois (1 = le plus écouté du mois).', wide: true })}
        ${o.cumul ? card('Le compteur', `<div class="chart" id="c-cumul" style="min-height:280px"></div>`, { note: `Heures cumulées depuis le 1er janvier${o.prevCumul ? `, comparées à ${YEAR - 1}` : ''}.` }) : ''}
        ${o.ageGuess ? card('Âge musical', `<div class="age-hero"><span class="age-num">${o.ageGuess}<small> ans</small></span><p class="note">Estimé d'après l'année de sortie de tout ce que ${esc(OWNER)} écoute. On écoute surtout la musique sortie vers nos 16 ans, alors on remonte le temps.</p></div>`, { more: moreLink('#/profil', 'Profil musical') }) : ''}
      </div>` : ''}
      ${CFG.photos?.length ? `<h2 class="section-t">Les moments de ${esc(OWNER)}</h2>
      <div class="gallery">${CFG.photos.map((p, i) => `<a href="${esc(p)}" data-i="${i}" aria-label="Agrandir la photo ${i + 1}"><img src="${esc(p)}" alt="" loading="lazy" data-optional></a>`).join('')}</div>` : ''}
      <h2 class="section-t">Le mur des pochettes</h2>
      <div class="wall">${o.wall.map(a => `<a href="${aAlbum(a.artist, a.name)}" title="${esc(a.name)} · ${esc(a.artist)}">${cover(pic.album(a.artist, a.name))}<span>${esc(a.name)}<br>${fmtH(a.hours)}</span></a>`).join('')}</div>`;
    if (o.artistMonths) {
      chart('c-stream', el => streamgraph(el, o.artistMonths, monthItems(o.months, null).length));
      chart('c-bump', el => bumpChart(el, o.artistMonths, monthItems(o.months, null).length));
    }
    if (o.cumul) chart('c-cumul', el => cumulChart(el, o.cumul, o.prevCumul));
    if (o.months) chart('c-months', el => bars(el, monthItems(o.months, o.prevMonths, i => `#/mois/${i + 1}`)));
    chart('c-years', el => bars(el, o.years.map(y => ({ label: String(y.year), value: y.hours, dim: !isAll() && y.year !== YEAR, href: null }))));
  },

  async mois(m) {
    if (m) return pages.moisDetail(+m);
    if (isAll()) { main.innerHTML = `<h1>Mois</h1><p class="lede">Choisis une année en haut pour voir le détail mois par mois.</p>`; return; }
    const d = await api('months');
    main.innerHTML = `
      <div class="head"><h1>Mois par mois ${yearLabel()}</h1><p class="lede">Clique sur un mois pour voir ses tops, ses journées et ses découvertes.</p></div>
      <div class="grid">
        ${card('Heures par mois', `${d.prevMonths ? legendPrev() : ''}<div class="chart" id="c-m"></div>`, { wide: true })}
      </div>
      <div class="mgrid">${d.months.map(x => `<a class="mcard" href="#/mois/${x.m}">${cover(pic.artist(x.topArtist))}<span class="mh">${fmtH(x.hours)}</span><b>${MOIS[x.m - 1]}</b><small>Artiste du mois : ${esc(x.topArtist)}<br>Titre du mois : ${esc(x.topTrack)}</small></a>`).join('')}</div>
      <div class="grid">
        ${card('Tous les mois', `<div id="t-m"></div>`, { wide: true })}
      </div>`;
    chart('c-m', el => { const v = Array(12).fill(0); d.months.forEach(x => { v[x.m - 1] = x.hours; }); bars(el, monthItems(v, d.prevMonths, i => `#/mois/${i + 1}`)); });
    mountTable($('#t-m'), [
      { key: 'm', label: 'Mois', fmt: r => `<a href="#/mois/${r.m}">${MOIS[r.m - 1]}</a>` },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
      { key: 'tracks', label: 'Titres', num: true, fmt: r => nf.format(r.tracks), hide: true },
      { key: 'artists', label: 'Artistes', num: true, fmt: r => nf.format(r.artists), hide: true },
      { key: 'topArtist', label: 'Artiste du mois', fmt: r => `<a href="${aArtist(r.topArtist)}">${esc(r.topArtist)}</a>` },
      { key: 'topTrack', label: 'Titre du mois', wrap: true, fmt: r => `<a href="${aTrack(r.topTrackUri)}">${esc(r.topTrack)}</a> <span class="sub">· ${esc(r.topTrackArtist)} · ${nf.format(r.topTrackPlays)}×</span>` },
    ], d.months, { sort: { key: 'm', dir: 1 }, limit: 12 });
  },

  async moisDetail(m) {
    const d = await api('month', { m });
    const nav = `<div class="pager">${m > 1 ? `<a class="btn" href="#/mois/${m - 1}">← ${MOIS[m - 2]}</a>` : ''}${m < 12 ? `<a class="btn" href="#/mois/${m + 1}">${MOIS[m]} →</a>` : ''}</div>`;
    if (!d.streams) { main.innerHTML = `<div class="crumb"><a href="#/mois">Mois</a></div><h1>${MOIS[m - 1]} ${isAll() ? '' : YEAR}</h1><p class="lede">Aucune écoute ce mois-là.</p>${nav}`; return; }
    main.innerHTML = `
      <div class="crumb"><a href="#/mois">Mois</a><span>/</span><span>${MOIS[m - 1]}</span></div>
      <div class="head"><h1>${MOIS[m - 1][0].toUpperCase() + MOIS[m - 1].slice(1)} ${isAll() ? '(toutes années)' : YEAR}</h1>${nav}</div>
      <div class="kpis">
        ${kpi("Temps d'écoute", fmtH(d.hours), `${n1.format(d.hours / (d.daily ? d.daily.length : 31))} h par jour`)}
        ${kpi('Écoutes', nf.format(d.plays))}
        ${kpi('Titres différents', nf.format(d.tracks))}
        ${kpi('Artistes différents', nf.format(d.artists))}
        ${kpi('Nouveaux artistes', nf.format(d.newArtistCount), 'jamais écoutés avant')}
        ${kpi('Titres passés', pct(d.skipRate))}
      </div>
      <div class="grid">
        ${d.daily ? card('Jour par jour', `<div class="chart" id="c-d"></div>`, { wide: true }) : ''}
        ${card('Top artistes', hlist(d.topArtists, { img: x => pic.artist(x.name), round: true, href: x => aArtist(x.name), sub: x => `${nf.format(x.plays)} écoutes` }))}
        ${card('Top albums', hlist(d.topAlbums, { img: x => pic.album(x.artist, x.name), href: x => aAlbum(x.artist, x.name), sub: x => esc(x.artist) }))}
        ${card('Top titres', `<div id="t-t"></div>`, { wide: true })}
        ${card('Plus grosses journées', hlist(d.topDays.map(x => ({ ...x, name: dateDay(x.d) })), { sub: x => x.topArtist ? `surtout ${esc(x.topArtist)}` : '' }))}
        ${card('Découvertes du mois', d.newArtists.length ? hlist(d.newArtists, { img: x => pic.artist(x.name), round: true, href: x => aArtist(x.name), sub: x => `1ʳᵉ écoute le ${dateFr(x.first)}` }) : '<p class="empty">Aucun nouvel artiste.</p>', { note: 'Artistes écoutés pour la première fois ce mois-ci.' })}
      </div>`;
    if (d.daily) chart('c-d', el => bars(el, d.daily.map(x => ({ label: String(+x.d.slice(8)), value: x.hours, tip: `<span class="t-d">${dateDay(x.d)}</span><br><b>${fmtH(x.hours)}</b> · ${nf.format(x.plays)} écoutes` }))));
    mountTable($('#t-t'), trackCols(false), d.topTracks.map((t, i) => ({ ...t, rank: i + 1, uri: t.key })), { sort: { key: 'plays' }, limit: 25 });
  },

  async artistes(name) {
    if (name) return pages.artiste(name);
    const list = await api('artists');
    main.innerHTML = `
      <div class="head"><h1>Artistes ${yearLabel()}</h1><p class="lede"><b>${nf.format(list.length)}</b> artistes écoutés. Clique sur un nom pour sa fiche. Les colonnes se trient d'un clic.</p></div>
      <div class="grid">
        ${card('La mosaïque des artistes', `<div class="chart" id="c-tree" style="min-height:420px"></div>`, { note: 'Chaque case est proportionnelle au temps passé sur l’artiste (top 30). Clique pour sa fiche.', wide: true })}
        ${card('Top 20', hlist(list.slice(0, 20), { img: d => pic.artist(d.name), round: true, href: d => aArtist(d.name), sub: d => `${nf.format(d.plays)} écoutes` }), { wide: true })}
        ${card('Tous les artistes', `<div id="t-a"></div>`, { wide: true })}
      </div>`;
    chart('c-tree', el => treemap(el, list.slice(0, 30)));
    mountTable($('#t-a'), [
      { key: 'rank', label: '#', num: true },
      { key: 'name', label: 'Artiste', fmt: r => `<a class="cell-pic" href="${aArtist(r.name)}">${cover(pic.artist(r.name), 'xs round')}${esc(r.name)}</a>` },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
      { key: 'tracks', label: 'Titres', num: true, fmt: r => nf.format(r.tracks), hide: true },
      { key: 'skipRate', label: 'Passés', num: true, fmt: r => pct(r.skipRate), hide: true },
      { key: 'first', label: 'Découvert le', fmt: r => r.first ? dateFr(r.first) : '—', hide: true },
    ], list, { sort: { key: 'hours' }, searchText: r => r.name, placeholder: 'Rechercher un artiste…' });
  },

  async artiste(name) {
    const a = await api('artist', { name });
    if (!a) { main.innerHTML = `<h1>Artiste introuvable</h1>`; return; }
    main.innerHTML = `
      <div class="crumb"><a href="#/artistes">Artistes</a><span>/</span><span>${esc(a.name)}</span></div>
      ${dhead(pic.artist(a.name), true, `<h1>${esc(a.name)}</h1><p class="lede">${a.rank ? `<b>N° ${a.rank}</b> de ses artistes ${yearLabel()}, ` : ''}<b>${pct(a.shareOfYear)}</b> de son temps d'écoute. Découvert le ${dateFr(a.first)}, dernière écoute le ${dateFr(a.last)}.</p>`)}
      <div class="kpis">
        ${kpi("Temps d'écoute", fmtH(a.hours))}
        ${kpi('Écoutes', nf.format(a.plays))}
        ${kpi('Titres différents', nf.format(a.tracks))}
        ${kpi('Albums', nf.format(a.albums))}
        ${kpi("Jours d'écoute", nf.format(a.days))}
        ${kpi('Titres passés', pct(a.skipRate))}
      </div>
      <div class="grid">
        ${a.months ? card(`Heures par mois en ${YEAR}`, `<div class="chart" id="c-am"></div>`) : ''}
        ${card('Année par année', `<div class="chart" id="c-ay"></div>`, { note: 'Toutes les années, pas seulement celle choisie.' })}
        ${card('Ses titres', `<div id="t-at"></div>`, { wide: true })}
        ${card('Ses albums', hlist(a.albumList.slice(0, 15), { img: x => pic.album(x.artist, x.name), href: x => aAlbum(x.artist, x.name), sub: x => `${nf.format(x.plays)} écoutes` }))}
        ${card('À quelle heure il passe', `<div class="chart" id="c-ah"></div>`)}
        ${card('Plus grosses journées', hlist(a.topDays.map(x => ({ ...x, name: dateDay(x.d) }))))}
      </div>`;
    if (a.months) chart('c-am', el => bars(el, monthItems(a.months, null)));
    chart('c-ay', el => bars(el, a.years.map(y => ({ label: String(y.year), value: y.hours, dim: !isAll() && y.year !== YEAR }))));
    chart('c-ah', el => bars(el, a.hoursOfDay.map((v, h) => ({ label: h + ' h', value: v, tip: `<span class="t-d">${h} h – ${h + 1} h</span><br><b>${fmtH(v)}</b>` }))));
    mountTable($('#t-at'), [
      { key: 'name', label: 'Titre', wrap: true, fmt: r => `<a class="cell-pic" href="${aTrack(r.key)}">${cover(pic.track(r.key), 'xs')}${esc(r.name)}</a>` },
      { key: 'album', label: 'Album', hide: true, wrap: true },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'first', label: 'Découvert le', fmt: r => dateFr(r.first), hide: true },
    ], a.trackList, { sort: { key: 'plays' }, searchText: r => r.name + ' ' + r.album, placeholder: 'Rechercher un titre…', limit: 50 });
  },

  async titres(uri) {
    if (uri) return pages.titre(uri);
    const list = await api('tracks');
    main.innerHTML = `
      <div class="head"><h1>Titres ${yearLabel()}</h1><p class="lede"><b>${nf.format(list.length)}</b> titres lancés. Une écoute compte à partir de 30 secondes, comme chez Spotify.</p></div>
      ${card('Tous les titres', `<div id="t-t"></div>`)}`;
    mountTable($('#t-t'), trackCols(true), list, { sort: { key: 'plays' }, searchText: r => `${r.name} ${r.artist} ${r.album}`, placeholder: 'Rechercher un titre, un artiste, un album…' });
  },

  async titre(uri) {
    const t = await api('track', { uri });
    if (!t) { main.innerHTML = `<h1>Titre introuvable</h1>`; return; }
    const total = arr => arr.reduce((s, x) => s + x[1], 0);
    main.innerHTML = `
      <div class="crumb"><a href="#/titres">Titres</a><span>/</span><span>${esc(t.name)}</span></div>
      ${dhead(pic.track(t.uri), false, `<h1>${esc(t.name)}</h1><p class="lede"><a href="${aArtist(t.artist)}"><b>${esc(t.artist)}</b></a> · <a href="${aAlbum(t.artist, t.album)}">${esc(t.album)}</a>${t.rank ? ` · <b>N° ${t.rank}</b> ${yearLabel()}` : ''}</p>${t.info && t.info.rel ? `<div class="tags"><span class="tag">Sorti le ${dateFr(t.info.rel)}</span>${t.info.bpm > 40 ? `<span class="tag">${Math.round(t.info.bpm)} BPM</span>` : ''}${t.info.rank ? `<span class="tag">Popularité ${Math.round(t.info.rank / 10000)}/100</span>` : ''}${t.info.exp ? '<span class="tag">Explicite</span>' : ''}</div>` : ''}<button type="button" class="btn btn-listen" data-uri="${esc(t.uri)}">▶ Écouter un extrait</button>`)}
      <div class="kpis">
        ${kpi('Écoutes', nf.format(t.plays), `${nf.format(t.streams)} lancements`)}
        ${kpi("Temps d'écoute", fmtH(t.hours))}
        ${kpi('Écoute moyenne', fmtSec(t.avgSec), `le titre dure ~${fmtSec(t.maxSec)}`)}
        ${kpi('Passé', pct(t.skipRate), 'des lancements')}
        ${kpi('Première écoute', dateFr(t.first))}
        ${kpi('Dernière écoute', dateFr(t.last))}
      </div>
      <div class="grid">
        ${t.months ? card(`Écoutes par mois en ${YEAR}`, `<div class="chart" id="c-tm"></div>`) : ''}
        ${card('Année par année', `<div class="chart" id="c-ty"></div>`)}
        ${card('À quelle heure', `<div class="chart" id="c-th"></div>`)}
        ${card('Les jours où il a le plus tourné', hlist(t.topDays.map(x => ({ ...x, name: dateDay(x.d) })), { val: x => `${nf.format(x.plays)}×`, metric: x => x.plays }))}
        ${card('Comment il démarrait', splitList(t.starts.slice(0, 6).map(([k, v]) => ({ label: REASON_START[k] || k, value: v })), total(t.starts), v => nf.format(v)))}
        ${card('Comment il s’arrêtait', splitList(t.ends.slice(0, 6).map(([k, v]) => ({ label: REASON_END[k] || k, value: v })), total(t.ends), v => nf.format(v)))}
      </div>`;
    const cnt = v => nf.format(v) + '×';
    if (t.months) chart('c-tm', el => bars(el, monthItems(t.months, null).map(d => ({ ...d, tip: `<span class="t-d">${d.label}</span><br><b>${cnt(d.value)}</b>` })), { fmt: cnt, tick: v => nf.format(v) }));
    chart('c-ty', el => bars(el, t.years.map(y => ({ label: String(y.year), value: y.plays, dim: !isAll() && y.year !== YEAR })), { fmt: cnt, tick: v => nf.format(v) }));
    chart('c-th', el => bars(el, t.hoursOfDay.map((v, h) => ({ label: h + ' h', value: v, tip: `<span class="t-d">${h} h – ${h + 1} h</span><br><b>${cnt(v)}</b>` })), { fmt: cnt, tick: v => nf.format(v) }));
  },

  async albums(artist, name) {
    if (artist && name) return pages.album(artist, name);
    const list = await api('albums');
    main.innerHTML = `
      <div class="head"><h1>Albums ${yearLabel()}</h1><p class="lede"><b>${nf.format(list.length)}</b> albums. Pour un single, l'album porte souvent le nom du titre.</p></div>
      ${card('Tous les albums', `<div id="t-al"></div>`)}`;
    mountTable($('#t-al'), [
      { key: 'rank', label: '#', num: true },
      { key: 'name', label: 'Album', wrap: true, fmt: r => `<a class="cell-pic" href="${aAlbum(r.artist, r.name)}">${cover(pic.album(r.artist, r.name), 'xs')}${esc(r.name)}</a>` },
      { key: 'artist', label: 'Artiste', fmt: r => `<a href="${aArtist(r.artist)}">${esc(r.artist)}</a>` },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
      { key: 'tracks', label: 'Titres', num: true, fmt: r => nf.format(r.tracks), hide: true },
    ], list, { sort: { key: 'hours' }, searchText: r => r.name + ' ' + r.artist, placeholder: 'Rechercher un album ou un artiste…' });
  },

  async album(artist, name) {
    const a = await api('album', { artist, name });
    if (!a) { main.innerHTML = `<h1>Album introuvable</h1>`; return; }
    main.innerHTML = `
      <div class="crumb"><a href="#/albums">Albums</a><span>/</span><span>${esc(a.name)}</span></div>
      ${dhead(pic.album(a.artist, a.name), false, `<h1>${esc(a.name)}</h1><p class="lede"><a href="${aArtist(a.artist)}"><b>${esc(a.artist)}</b></a>${a.rank ? ` · <b>N° ${a.rank}</b> de ses albums ${yearLabel()}` : ''} · première écoute le ${dateFr(a.first)}</p>`)}
      <div class="kpis">
        ${kpi("Temps d'écoute", fmtH(a.hours))}
        ${kpi('Écoutes', nf.format(a.plays))}
        ${kpi('Titres écoutés', nf.format(a.tracks))}
        ${kpi("Jours d'écoute", nf.format(a.days))}
      </div>
      <div class="grid">
        ${a.months ? card(`Heures par mois en ${YEAR}`, `<div class="chart" id="c-alm"></div>`) : ''}
        ${card('Année par année', `<div class="chart" id="c-aly"></div>`)}
        ${card('Ses titres', hlist(a.trackList, { img: x => pic.track(x.key), val: x => `${nf.format(x.plays)}×`, metric: x => x.plays, href: x => aTrack(x.key) }), { wide: true })}
      </div>`;
    if (a.months) chart('c-alm', el => bars(el, monthItems(a.months, null)));
    chart('c-aly', el => bars(el, a.years.map(y => ({ label: String(y.year), value: y.hours, dim: !isAll() && y.year !== YEAR }))));
  },

  async habitudes() {
    const h = await api('habits');
    const best = h.hoursOfDay.indexOf(Math.max(...h.hoursOfDay)), bestWd = h.weekdays.indexOf(Math.max(...h.weekdays));
    const mus = h.ends.reduce((s, x) => s + x.n, 0), plat = h.platforms.reduce((s, x) => s + x.hours, 0);
    main.innerHTML = `
      <div class="head"><h1>Les habitudes de ${esc(OWNER)} ${yearLabel()}</h1><p class="lede">La musique tourne surtout vers <b>${best} h</b>, et le <b>${JOURS[bestWd]}</b> est le jour le plus musical. Musique écoutée <b>${nf.format(h.days)} jours</b> sur ${nf.format(h.span)}.</p></div>
      <div class="kpis">
        ${kpi('Série record', `${nf.format(h.streak.len)} j`, `du ${dateFr(h.streak.start)} au ${dateFr(h.streak.end)}`)}
        ${kpi("Séances d'écoute", nf.format(h.sessions.count), `${fmtH(h.sessions.avgHours)} en moyenne`)}
        ${kpi('Titres passés', pct(h.skipRate))}
        ${kpi('Lecture aléatoire', pct(h.shuffle))}
        ${kpi('Hors ligne', pct(h.offline))}
        ${kpi('Jours sans musique', nf.format(h.span - h.days))}
      </div>
      <div class="grid">
        ${h.daily ? card(`Calendrier ${YEAR}`, `<div class="chart scroll-x" id="c-cal" style="min-height:0"></div>`, { note: 'Plus la case est foncée, plus il y a eu de musique ce jour-là. Survole une case pour le détail.', wide: true }) : ''}
        ${card('Heure × jour de la semaine', `<div class="chart" id="c-hm" style="min-height:0"></div>`, { note: 'Où se concentre l’écoute dans la semaine.', wide: true })}
        ${card('L’horloge d’écoute', `<div class="chart" id="c-clock" style="min-height:340px"></div>`, { note: 'Heures écoutées à chaque heure de la journée, sur 24 h.' })}
        ${card('Par heure de la journée', `<div class="chart" id="c-h"></div>`)}
        ${card('Par jour de la semaine', `<div class="chart" id="c-w"></div>`)}
        ${card('Plus grosses journées', `<div id="t-d"></div>`, { wide: true })}
        ${card('Plus longues séances', hlist(h.sessions.longest.map(s => ({ ...s, name: `${stamp(s.start)} → ${stamp(s.end)}` })), { sub: s => `${nf.format(s.n)} titres` }), { note: "Une séance s'arrête après 20 minutes sans rien écouter." })}
        ${card('Sur quel appareil', splitList(h.platforms.map(p => ({ label: p.name, value: p.hours })), plat, fmtH))}
        ${card('Comment les titres s’arrêtent', splitList(h.ends.slice(0, 7).map(x => ({ label: REASON_END[x.name] || x.name, value: x.n })), mus, v => nf.format(v)))}
        ${card('Comment les titres démarrent', splitList(h.starts.slice(0, 7).map(x => ({ label: REASON_START[x.name] || x.name, value: x.n })), mus, v => nf.format(v)))}
      </div>`;
    if (h.daily) chart('c-cal', el => calendar(el, h.daily, YEAR));
    chart('c-hm', el => heatmap(el, h.matrix));
    chart('c-clock', el => radialClock(el, h.hoursOfDay));
    chart('c-h', el => bars(el, h.hoursOfDay.map((v, i) => ({ label: i + ' h', value: v, tip: `<span class="t-d">${i} h – ${i + 1} h</span><br><b>${fmtH(v)}</b>` }))));
    chart('c-w', el => bars(el, h.weekdays.map((v, i) => ({ label: JOURS_C[i], value: v, tip: `<span class="t-d">${JOURS[i]}</span><br><b>${fmtH(v)}</b>` }))));
    mountTable($('#t-d'), [
      { key: 'd', label: 'Jour', fmt: r => dateDay(r.d) + (isAll() ? ' ' + r.d.slice(0, 4) : '') },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
      { key: 'topArtist', label: 'Artiste du jour', fmt: r => r.topArtist ? `<a href="${aArtist(r.topArtist)}">${esc(r.topArtist)}</a>` : '—', hide: true },
      { key: 'topTrack', label: 'Titre du jour', wrap: true, hide: true, fmt: r => r.topTrack ? `${esc(r.topTrack)} <span class="sub">· ${nf.format(r.topTrackPlays)}×</span>` : '—' },
    ], h.topDays, { sort: { key: 'hours' }, limit: 10 });
  },

  async decouvertes() {
    const d = await api('discoveries');
    main.innerHTML = `
      <div class="head"><h1>Découvertes ${yearLabel()}</h1><p class="lede">${isAll() ? 'Toutes les découvertes depuis le début.' : `<b>${nf.format(d.newArtistCount)}</b> artistes jamais écoutés avant ${YEAR}. Ils représentent <b>${pct(d.shareHours)}</b> de son temps d'écoute.`}</p></div>
      <div class="kpis">
        ${kpi('Nouveaux artistes', nf.format(d.newArtistCount))}
        ${kpi('Nouveaux titres', nf.format(d.newTrackCount))}
        ${isAll() ? '' : kpi('Temps sur les nouveautés', pct(d.shareHours), "part du temps passé sur des artistes découverts cette année")}
      </div>
      <div class="grid">
        ${d.perMonth ? card('Nouveaux artistes par mois', `<div class="chart" id="c-nm"></div>`) : ''}
        ${d.perMonth ? card('Nouveaux titres par mois', `<div class="chart" id="c-nt"></div>`) : ''}
        ${card('Ses découvertes', `<div id="t-na"></div>`, { note: 'Artistes écoutés pour la première fois, classés par temps passé dessus.', wide: true })}
        ${card('Nouveaux titres les plus écoutés', hlist(d.newTracks.slice(0, 25), { img: x => pic.track(x.uri), val: x => `${nf.format(x.plays)}×`, metric: x => x.plays, href: x => aTrack(x.uri), sub: x => esc(x.artist) }), { wide: true })}
      </div>`;
    const cnt = v => nf.format(v);
    if (d.perMonth) {
      chart('c-nm', el => bars(el, monthItems(d.perMonth.map(x => x.artists), null).map(x => ({ ...x, tip: `<span class="t-d">${x.label}</span><br><b>${cnt(x.value)}</b> artistes` })), { fmt: cnt }));
      chart('c-nt', el => bars(el, monthItems(d.perMonth.map(x => x.tracks), null).map(x => ({ ...x, tip: `<span class="t-d">${x.label}</span><br><b>${cnt(x.value)}</b> titres` })), { fmt: cnt }));
    }
    mountTable($('#t-na'), [
      { key: 'name', label: 'Artiste', fmt: r => `<a class="cell-pic" href="${aArtist(r.name)}">${cover(pic.artist(r.name), 'xs round')}${esc(r.name)}</a>` },
      { key: 'first', label: 'Découvert le', fmt: r => dateFr(r.first) },
      { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
      { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
    ], d.newArtists, { sort: { key: 'hours' }, searchText: r => r.name, placeholder: 'Rechercher un artiste…', limit: 100 });
  },
};
function trackCols(withRank) {
  return [
    ...(withRank ? [{ key: 'rank', label: '#', num: true }] : []),
    { key: 'name', label: 'Titre', wrap: true, fmt: r => `<a class="cell-pic" href="${aTrack(r.uri)}">${cover(pic.track(r.uri), 'xs')}${esc(r.name)}</a>` },
    { key: 'artist', label: 'Artiste', fmt: r => `<a href="${aArtist(r.artist)}">${esc(r.artist)}</a>` },
    { key: 'plays', label: 'Écoutes', num: true, fmt: r => nf.format(r.plays) },
    { key: 'hours', label: 'Heures', num: true, fmt: r => fmtH(r.hours) },
    { key: 'skipRate', label: 'Passé', num: true, fmt: r => pct(r.skipRate), hide: true },
    ...(withRank ? [{ key: 'first', label: 'Découvert le', fmt: r => r.first ? dateFr(r.first) : '—', hide: true }] : []),
  ];
}

// ---------- Extrait sur la fiche d'un titre ----------
let listenAudio = null;
function stopListen() {
  if (!listenAudio) return;
  listenAudio.pause(); listenAudio = null;
  document.querySelectorAll('.btn-listen.on').forEach(b => { b.classList.remove('on'); b.textContent = '▶ Écouter un extrait'; });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.btn-listen');
  if (!b) return;
  if (listenAudio && b.classList.contains('on')) return stopListen();
  stopListen();
  const a = listenAudio = new Audio();
  b.textContent = 'Chargement…';
  a.onended = stopListen;
  a.volume = Player.volume;
  Player.pause();
  previewSrc(b.dataset.uri).then(src => { if (!src) throw new Error('none'); a.src = src; return a.play(); }).then(() => { if (listenAudio === a) { b.classList.add('on'); b.textContent = '❚❚ Pause'; } })
    .catch(() => { b.textContent = 'Pas d’extrait disponible'; b.disabled = true; });
});

// Une photo de Mikuan en fond de l'en-tête de chaque page (index dans CFG.photos)
const PAGE_PHOTO = { mois: 4, artistes: 3, titres: 1, albums: 7, habitudes: 6, decouvertes: 0, tuto: 2 };
function headPhoto(route, args) {
  const h = main.querySelector('.head'), list = CFG.photos || [];
  if (!h || !list.length || h.classList.contains('with-art') || !(route in PAGE_PHOTO)) return;
  const i = route === 'mois' && args[0] ? (+args[0] + 2) % list.length : PAGE_PHOTO[route] % list.length;
  h.classList.add('with-photo');
  h.insertAdjacentHTML('afterbegin', `<div class="head-photo" style="background-image:url('${esc(list[i])}')"></div>`);
}

// Bannière vidéo : apparaît et se lance quand elle arrive à l'écran, se met en pause hors écran
function watchBanners() {
  const els = main.querySelectorAll('.vbanner');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) return els.forEach(el => { el.classList.add('in'); el.querySelector('video').play().catch(() => { }); });
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target.querySelector('video');
    if (e.isIntersecting) { e.target.classList.add('in'); v.play().catch(() => { }); } else v.pause();
  }), { threshold: 0.25 });
  els.forEach(el => io.observe(el));
}

// ---------- Router ----------
const ROUTES = { '': '', recap: '', mois: 'mois', artistes: 'artistes', artiste: 'artistes', titres: 'titres', titre: 'titres', albums: 'albums', album: 'albums', habitudes: 'habitudes', decouvertes: 'decouvertes', profil: 'profil', tuto: 'tuto' };
async function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [route = '', ...args] = parts;
  const tab = ROUTES[route] ?? '';
  if (storyEl && route !== 'recap') storyEl.close();
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  renderId++; redraws = []; hideTip(); stopListen();
  main.innerHTML = '<p class="loading">Chargement…</p>';
  try {
    if (route === 'artiste') await pages.artiste(args[0]);
    else if (route === 'titre') await pages.titre(args[0]);
    else if (route === 'album') await pages.album(args[0], args[1]);
    else await (pages[route] || EXTRA_PAGES[route] || pages[''])(...args);
    headPhoto(route, args);
    watchBanners();
    redraws.forEach(f => f());
    if (route === 'recap') openStory();
    document.title = (main.querySelector('h1')?.textContent || 'Stats') + ` · Les stats Spotify de ${OWNER}`;
  } catch (e) {
    if (e === STALE) return;
    console.error(e);
    main.innerHTML = `<h1>Oups</h1><p class="lede">Impossible de charger cette page (${esc(e.message)}). ${STATIC ? 'Cette fiche n’est peut-être pas publiée : seuls les plus écoutés en ont une.' : 'Vérifie que le serveur tourne toujours.'}</p>`;
  }
  scrollTo(0, 0);
}
let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => redraws.forEach(f => f()), 150); });
addEventListener('hashchange', render);

(async function init() {
  META = await (STATIC ? fetchJson('data/meta.json') : fetch('/api/meta').then(r => r.json()));
  if (STATIC) MEDIA = await fetchJson('data/media.json').catch(() => MEDIA);
  $('#brand-name').textContent = OWNER;
  if (CFG.avatar) $('#brand-av').src = CFG.avatar; else $('#brand-av').remove();
  Player.init();
  NowPlaying.init();
  Lightbox.init();
  let saved = null;
  try { saved = localStorage.getItem('year'); } catch { }
  YEAR = saved === 'all' ? 'all' : (META.years.some(y => String(y.year) === saved) ? +saved : META.defaultYear);
  const sel = $('#year');
  sel.innerHTML = [...META.years].reverse().map(y => `<option value="${y.year}">${y.year}</option>`).join('') + '<option value="all">Toutes</option>';
  sel.value = String(YEAR);
  sel.addEventListener('change', () => {
    YEAR = sel.value === 'all' ? 'all' : +sel.value;
    try { localStorage.setItem('year', String(YEAR)); } catch { }
    render();
  });
  $('#foot').innerHTML = `<div class="made-by">${CFG.avatar ? `<img src="${esc(CFG.avatar)}" alt="" data-optional>` : ''}<p>Ce sont les statistiques d'écoute Spotify de <b>${esc(OWNER)}</b>, tirées de son historique complet, du ${dateFr(META.first)} au ${dateFr(META.last)}.${CFG.portraitCredit ? ` Portrait : ${esc(CFG.portraitCredit)}.` : ''}${CFG.art2Credit ? ` Dessin du profil musical : ${esc(CFG.art2Credit)}.` : ''}${CFG.avatarCredit ? ` Avatar : ${esc(CFG.avatarCredit)}.` : ''}</p></div>
    <p>Le temps d'écoute compte tout ce que Spotify a vraiment joué, même en fond. Une « écoute » compte à partir de 30 secondes. Un titre est « passé » quand on a appuyé sur suivant. Heures de Paris.</p>
    <p>Pochettes : Spotify. Photos d'artistes, extraits de 30 s et années de sortie : Deezer. Tu veux les tiens ? <a href="#/tuto">Voici comment faire</a>.</p>`;
  render();
})();
