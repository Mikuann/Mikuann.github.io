'use strict';
// Graphiques avancés (d3) : flux des artistes, course au n°1, compteur cumulé, horloge, mosaïque, époques, popularité.
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE = () => ['--violet', '--pink', '--lime', '--cyan', '--orange', '--red', '--yellow', '--muted'].map(css);
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const hFmt = h => h >= 100 ? Math.round(h).toLocaleString('fr-FR') + ' h' : h >= 1 ? h.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h' : Math.round(h * 60) + ' min';
const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tipOn = (sel, html) => sel.on('mousemove', (e, d) => showTip(html(d, e), e)).on('mouseleave', hideTip);
function frame(el, height, m) {
  el.innerHTML = '';
  const W = Math.max(280, el.clientWidth);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${height}`).attr('height', height);
  return { svg, W, H: height, iw: W - m.l - m.r, ih: height - m.t - m.b, g: svg.append('g').attr('transform', `translate(${m.l},${m.t})`) };
}
const clipCircle = (defs, id, r) => defs.append('clipPath').attr('id', id).append('circle').attr('r', r);
let clipN = 0;

// Flux des artistes : aire empilée centrée (streamgraph) des heures par mois du top 8
function streamgraph(el, artists, nMonths) {
  const colors = PALETTE(), keys = artists.map(a => a.name);
  const rows = d3.range(nMonths).map(i => Object.fromEntries([['i', i], ...artists.map(a => [a.name, a.months[i].hours])]));
  const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
  const narrow = el.clientWidth < 560, f = frame(el, 320, { t: 10, r: narrow ? 10 : 130, b: 26, l: 10 });
  const x = d3.scaleLinear([0, nMonths - 1], [0, f.iw]);
  const y = d3.scaleLinear([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))], [f.ih, 0]);
  const area = d3.area().x((d, i) => x(i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);
  const paths = f.g.selectAll('path').data(series).join('path').attr('d', area).attr('fill', (d, i) => colors[i % colors.length]).attr('opacity', .85).attr('stroke', css('--stage')).attr('stroke-width', 1);
  paths.on('mousemove', (e, s) => {
    const i = Math.max(0, Math.min(nMonths - 1, Math.round(x.invert(d3.pointer(e, f.g.node())[0]))));
    paths.attr('opacity', p => p === s ? 1 : .35);
    showTip(`${cover(pic.artist(s.key), '')}<b>${escH(s.key)}</b><br><span class="t-d">${MONTHS_SHORT[i]}</span> · ${hFmt(s[i][1] - s[i][0])}`, e);
  }).on('mouseleave', () => { paths.attr('opacity', .85); hideTip(); }).style('cursor', 'pointer').on('click', (e, s) => { location.hash = aArtist(s.key); });
  f.g.append('g').attr('transform', `translate(0,${f.ih})`).attr('class', 'axis').call(d3.axisBottom(x).ticks(nMonths).tickFormat(i => MONTHS_SHORT[i]).tickSize(0)).call(g => g.select('.domain').remove()).attr('font-size', null).attr('font-family', null).selectAll('text').attr('dy', '1.2em');
  if (!narrow) { // étiquettes à droite, alignées sur la fin de chaque couche, écartées pour ne pas se chevaucher
    const ends = series.map((s, i) => ({ name: s.key, i, y: y((s[nMonths - 1][0] + s[nMonths - 1][1]) / 2) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 16);
    const lg = f.g.append('g').attr('transform', `translate(${f.iw + 10},0)`);
    lg.selectAll('text').data(ends).join('text').attr('y', d => d.y + 4).attr('class', 'lbl').attr('fill', d => colors[d.i % colors.length]).style('fill', d => colors[d.i % colors.length]).text(d => d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name);
  }
}

// Course au n°1 : rang mensuel des artistes du top 8, avec leur photo au bout de la ligne
function bumpChart(el, artists, nMonths) {
  const colors = PALETTE(), maxRank = 12, r = 13;
  const f = frame(el, 340, { t: 16, r: 44, b: 26, l: 30 });
  const x = d3.scalePoint(d3.range(nMonths), [0, f.iw]);
  const y = d3.scaleLinear([1, maxRank], [0, f.ih]);
  const clampR = v => v == null ? null : Math.min(v, maxRank);
  f.g.append('g').selectAll('line').data(d3.range(1, maxRank + 1)).join('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y).attr('y2', y).attr('class', 'grid-l').attr('stroke', css('--line'));
  f.g.append('g').selectAll('text').data([1, 3, 5, 10]).join('text').attr('x', -10).attr('y', d => y(d) + 4).attr('text-anchor', 'end').text(d => '#' + d);
  const line = d3.line().defined(d => d != null).x((d, i) => x(i)).y(d => y(d)).curve(d3.curveBumpX);
  const defs = f.svg.append('defs');
  const groups = f.g.selectAll('g.art').data(artists).join('g').attr('class', 'art').style('cursor', 'pointer').on('click', (e, a) => { location.hash = aArtist(a.name); });
  groups.append('path').attr('d', a => line(a.months.map(m => clampR(m.rank)))).attr('fill', 'none').attr('stroke', (a, i) => colors[i % colors.length]).attr('stroke-width', 3).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('opacity', .9);
  groups.each(function (a, i) {
    const g = d3.select(this), col = colors[i % colors.length];
    a.months.forEach((m, k) => {
      if (m.rank == null) return;
      g.append('circle').attr('cx', x(k)).attr('cy', y(clampR(m.rank))).attr('r', 4).attr('fill', col)
        .on('mousemove', e => showTip(`<b>${escH(a.name)}</b><br><span class="t-d">${MONTHS_SHORT[k]}</span> · ${m.rank > maxRank ? 'hors top ' + maxRank : 'n°' + m.rank} · ${hFmt(m.hours)}`, e)).on('mouseleave', hideTip);
    });
    const lastK = d3.range(nMonths).reverse().find(k => a.months[k].rank != null);
    if (lastK == null || a.months[lastK].rank > maxRank) return; // photo seulement si l'artiste est dans le top à la fin
    const id = 'bc' + (++clipN), cx = x(lastK) + 22, cy = y(clampR(a.months[lastK].rank));
    clipCircle(defs, id, r);
    const pg = g.append('g').attr('transform', `translate(${cx},${cy})`);
    pg.append('circle').attr('r', r + 2).attr('fill', col);
    pg.append('image').attr('href', pic.artist(a.name)).attr('x', -r).attr('y', -r).attr('width', r * 2).attr('height', r * 2).attr('clip-path', `url(#${id})`).attr('preserveAspectRatio', 'xMidYMid slice');
  });
  groups.on('mouseenter', function () { groups.attr('opacity', .25); d3.select(this).attr('opacity', 1); }).on('mouseleave', () => groups.attr('opacity', 1));
  f.g.append('g').attr('transform', `translate(0,${f.ih + 8})`).selectAll('text').data(d3.range(nMonths)).join('text').attr('x', x).attr('y', 12).attr('text-anchor', 'middle').text(i => MONTHS_SHORT[i]);
}

// Compteur : heures cumulées depuis le 1er janvier, cette année contre l'année d'avant
function cumulChart(el, cur, prev) {
  const f = frame(el, 280, { t: 14, r: 64, b: 26, l: 46 });
  const n = prev ? Math.max(cur.length, prev.length) : cur.length;
  const x = d3.scaleLinear([1, Math.max(n, 2)], [0, f.iw]);
  const y = d3.scaleLinear([0, d3.max([...cur, ...(prev || [])])], [f.ih, 0]).nice();
  const c1 = css('--violet'), c0 = css('--muted');
  f.g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-f.iw).tickFormat(v => v ? Math.round(v).toLocaleString('fr-FR') + ' h' : '0')).call(g => g.select('.domain').remove()).call(g => g.selectAll('line').attr('stroke', css('--line'))).attr('font-size', null).attr('font-family', null);
  const monthStarts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  f.g.append('g').selectAll('text').data(monthStarts.map((d, i) => [d, i]).filter(([d]) => d <= n)).join('text').attr('x', ([d]) => x(d)).attr('y', f.ih + 18).text(([, i]) => MONTHS_SHORT[i]).attr('text-anchor', 'start');
  const grad = f.svg.append('defs').append('linearGradient').attr('id', 'cg').attr('x2', 0).attr('y2', 1);
  [[0, .32], [.5, .1], [1, 0]].forEach(([o, a]) => grad.append('stop').attr('offset', o).attr('stop-color', c1).attr('stop-opacity', a));
  const line = d3.line().x((d, i) => x(i + 1)).y(d => y(d));
  if (prev) f.g.append('path').attr('d', line(prev)).attr('fill', 'none').attr('stroke', c0).attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
  f.g.append('path').attr('d', d3.area().x((d, i) => x(i + 1)).y0(f.ih).y1(d => y(d))(cur)).attr('fill', 'url(#cg)');
  f.g.append('path').attr('d', line(cur)).attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 3).attr('stroke-linecap', 'round');
  const endY = y(cur[cur.length - 1]);
  f.g.append('circle').attr('cx', x(cur.length)).attr('cy', endY).attr('r', 5).attr('fill', c1);
  let labY = endY, prevY = prev ? y(prev[prev.length - 1]) : null;
  if (prevY != null && Math.abs(prevY - labY) < 16) prevY = labY + (prevY >= labY ? 16 : -16);
  f.g.append('text').attr('x', x(cur.length) + 8).attr('y', labY + 4).attr('class', 'lbl').text(hFmt(cur[cur.length - 1]));
  if (prev) f.g.append('text').attr('x', f.iw + 8).attr('y', prevY + 4).text(hFmt(prev[prev.length - 1]));
  const rule = f.g.append('line').attr('y1', 0).attr('y2', f.ih).attr('stroke', css('--muted')).attr('opacity', 0);
  f.g.append('rect').attr('width', f.iw).attr('height', f.ih).attr('fill', 'transparent')
    .on('mousemove', e => {
      const d = Math.max(1, Math.min(n, Math.round(x.invert(d3.pointer(e)[0]))));
      rule.attr('x1', x(d)).attr('x2', x(d)).attr('opacity', .5);
      const date = new Date(Date.UTC(2001, 0, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      showTip(`<span class="t-d">au ${date}</span><br>${cur[d - 1] != null ? `<b>${hFmt(cur[d - 1])}</b> cette année` : ''}${prev && prev[d - 1] != null ? `<br>${hFmt(prev[d - 1])} l'année d'avant` : ''}`, e);
    }).on('mouseleave', () => { rule.attr('opacity', 0); hideTip(); });
}

// Horloge : 24 pétales, la longueur = heures écoutées à cette heure
function radialClock(el, hours) {
  el.innerHTML = '';
  const size = Math.min(el.clientWidth, 360), R = size / 2 - 26, r0 = R * .28;
  const svg = d3.select(el).append('svg').attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`).attr('height', size).style('max-width', size + 'px').style('margin', '0 auto');
  const rad = d3.scaleRadial([0, d3.max(hours)], [r0, R]);
  const arc = d3.arc().innerRadius(r0).outerRadius(d => rad(d.v)).startAngle(d => d.h / 24 * 2 * Math.PI).endAngle(d => (d.h + 1) / 24 * 2 * Math.PI).padAngle(.02).cornerRadius(4);
  const data = hours.map((v, h) => ({ h, v })), col = d3.scaleLinear([0, d3.max(hours)], [css('--cyan'), css('--pink')]);
  svg.append('circle').attr('r', R).attr('fill', 'none').attr('stroke', css('--line'));
  tipOn(svg.selectAll('path').data(data).join('path').attr('d', arc).attr('fill', d => col(d.v)), d => `<span class="t-d">${d.h} h – ${d.h + 1} h</span><br><b>${hFmt(d.v)}</b>`);
  svg.selectAll('text.hh').data([0, 6, 12, 18]).join('text').attr('class', 'hh').attr('text-anchor', 'middle')
    .attr('x', h => Math.sin(h / 24 * 2 * Math.PI) * (R + 14)).attr('y', h => -Math.cos(h / 24 * 2 * Math.PI) * (R + 14) + 4).text(h => h + ' h');
  const best = data.reduce((a, b) => (b.v > a.v ? b : a));
  svg.append('text').attr('text-anchor', 'middle').attr('y', -2).attr('class', 'lbl').style('font-size', '20px').text(best.h + ' h');
  svg.append('text').attr('text-anchor', 'middle').attr('y', 16).text('heure de pointe');
}

// Mosaïque : treemap des artistes avec leur photo en fond
function treemap(el, artists) {
  const f = frame(el, Math.max(360, Math.min(520, el.clientWidth * .6)), { t: 0, r: 0, b: 0, l: 0 });
  const root = d3.hierarchy({ children: artists.map(a => ({ ...a })) }).sum(d => d.hours || 0);
  d3.treemap().size([f.iw, f.ih]).paddingInner(4).round(true)(root);
  const defs = f.svg.append('defs');
  const leaf = f.g.selectAll('g').data(root.leaves()).join('g').attr('transform', d => `translate(${d.x0},${d.y0})`).style('cursor', 'pointer').on('click', (e, d) => { location.hash = aArtist(d.data.name); });
  leaf.each(function (d) {
    const g = d3.select(this), w = d.x1 - d.x0, h = d.y1 - d.y0, id = 'tm' + (++clipN);
    defs.append('clipPath').attr('id', id).append('rect').attr('width', w).attr('height', h).attr('rx', 8);
    const cg = g.append('g').attr('clip-path', `url(#${id})`);
    cg.append('rect').attr('width', w).attr('height', h).attr('fill', css('--panel-2'));
    cg.append('image').attr('href', pic.artist(d.data.name)).attr('width', w).attr('height', h).attr('preserveAspectRatio', 'xMidYMid slice').attr('opacity', .85);
    cg.append('rect').attr('y', h * .45).attr('width', w).attr('height', h * .55).attr('fill', 'url(#tmfade)');
    if (w > 60 && h > 40) {
      cg.append('text').attr('x', 8).attr('y', h - 22).attr('class', 'lbl').style('font-size', Math.min(18, Math.max(11, w / 9)) + 'px').text(d.data.name.length > w / 8 ? d.data.name.slice(0, Math.max(3, Math.floor(w / 8) - 1)) + '…' : d.data.name);
      cg.append('text').attr('x', 8).attr('y', h - 8).text(hFmt(d.data.hours));
    }
  });
  const fade = defs.append('linearGradient').attr('id', 'tmfade').attr('x2', 0).attr('y2', 1);
  fade.append('stop').attr('offset', 0).attr('stop-color', '#000').attr('stop-opacity', 0);
  fade.append('stop').attr('offset', 1).attr('stop-color', '#000').attr('stop-opacity', .85);
  tipOn(leaf, d => `<b>${escH(d.data.name)}</b><br>${hFmt(d.data.hours)} · ${d.data.plays.toLocaleString('fr-FR')} écoutes`);
}

// Époques : heures par année de sortie, avec la médiane
function releaseChart(el, years, median) {
  const f = frame(el, 260, { t: 18, r: 8, b: 26, l: 46 });
  const x0 = Math.max(d3.min(years, d => d.year), 1960), x1 = d3.max(years, d => d.year);
  const data = years.filter(d => d.year >= x0);
  const x = d3.scaleBand(d3.range(x0, x1 + 1), [0, f.iw]).padding(.15), y = d3.scaleLinear([0, d3.max(data, d => d.hours)], [f.ih, 0]).nice();
  f.g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-f.iw).tickFormat(v => v ? Math.round(v).toLocaleString('fr-FR') + ' h' : '0')).call(g => g.select('.domain').remove()).call(g => g.selectAll('line').attr('stroke', css('--line'))).attr('font-size', null).attr('font-family', null);
  const col = d3.scaleLinear([x0, x1], [css('--cyan'), css('--pink')]);
  tipOn(f.g.selectAll('rect.b').data(data).join('rect').attr('class', 'b').attr('x', d => x(d.year)).attr('width', x.bandwidth()).attr('y', d => y(d.hours)).attr('height', d => f.ih - y(d.hours)).attr('rx', Math.min(3, x.bandwidth() / 2)).attr('fill', d => col(d.year)),
    d => `<span class="t-d">Sortis en ${d.year}</span><br><b>${hFmt(d.hours)}</b>`);
  const step = Math.ceil(36 / Math.max(1, x.bandwidth()));
  f.g.append('g').selectAll('text').data(x.domain().filter((d, i, all) => (i % step === 0 && all.length - 1 - i >= step) || d === x1)).join('text').attr('x', d => x(d) + x.bandwidth() / 2).attr('y', f.ih + 18).attr('text-anchor', 'middle').text(d => d);
  if (x(median) != null) {
    const mx = x(median) + x.bandwidth() / 2;
    f.g.append('line').attr('x1', mx).attr('x2', mx).attr('y1', -6).attr('y2', f.ih).attr('stroke', css('--fg')).attr('stroke-dasharray', '4 3');
    f.g.append('text').attr('x', mx - 6).attr('y', -6).attr('text-anchor', 'end').attr('class', 'lbl').text('médiane ' + median);
  }
}

// Donut des décennies
function donut(el, decades) {
  el.innerHTML = '';
  const size = Math.min(el.clientWidth, 300), R = size / 2 - 6, colors = PALETTE();
  const wrap = d3.select(el).append('div').style('display', 'flex').style('gap', '20px').style('align-items', 'center').style('flex-wrap', 'wrap').style('justify-content', 'center');
  const svg = wrap.append('svg').attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`).attr('width', size).attr('height', size).style('width', size + 'px');
  const pie = d3.pie().value(d => d.hours).sort(null), arc = d3.arc().innerRadius(R * .58).outerRadius(R).padAngle(.015).cornerRadius(5);
  tipOn(svg.selectAll('path').data(pie(decades)).join('path').attr('d', arc).attr('fill', (d, i) => colors[i % colors.length]),
    d => `<b>Années ${d.data.decade}</b><br>${hFmt(d.data.hours)} · ${(d.data.share * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
  const top = decades.reduce((a, b) => (b.hours > a.hours ? b : a));
  svg.append('text').attr('text-anchor', 'middle').attr('y', 2).attr('class', 'lbl').style('font-size', '24px').text(`${top.decade}s`);
  svg.append('text').attr('text-anchor', 'middle').attr('y', 22).text('décennie n°1');
  const lg = wrap.append('ul').style('list-style', 'none').style('margin', 0).style('padding', 0).style('display', 'grid').style('gap', '6px');
  decades.forEach((d, i) => lg.append('li').style('display', 'flex').style('gap', '8px').style('align-items', 'center').style('font-size', '14px').style('font-weight', 600)
    .html(`<i style="width:12px;height:12px;border-radius:3px;background:${colors[i % colors.length]}"></i>Années ${d.decade} <span style="color:var(--muted)">${(d.share * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</span>`));
}

// Nuage : chaque titre placé par année de sortie et popularité, taille = temps d'écoute
function scatter(el, tracks) {
  const f = frame(el, 360, { t: 14, r: 14, b: 34, l: 44 });
  const data = tracks.filter(t => t.year >= 1960 && t.rank > 0);
  const ref = d3.max(data, d => d.year) + 1, ago = d => Math.max(0.15, ref - d.year - (d.rel ? (+d.rel.slice(5, 7) - 1) / 12 : 0.5));
  const x = d3.scaleLog([d3.max(data, ago), 0.15], [0, f.iw]), y = d3.scaleLinear([0, 100], [f.ih, 0]);
  const yearTicks = [1, 2, 3, 5, 10, 20, 40].map(k => ref - k).filter(yr => ref - yr <= d3.max(data, ago));
  const r = d3.scaleSqrt([0, d3.max(data, d => d.hours)], [2, 18]);
  f.g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-f.iw)).call(g => g.select('.domain').remove()).call(g => g.selectAll('line').attr('stroke', css('--line'))).attr('font-size', null).attr('font-family', null);
  f.g.append('g').selectAll('text').data(yearTicks).join('text').attr('x', yr => x(ref - yr)).attr('y', f.ih + 20).attr('text-anchor', 'middle').text(yr => yr);
  f.g.append('text').attr('x', -36).attr('y', -4).text('popularité');
  const col = d3.scaleLinear([0, 50, 100], [css('--cyan'), css('--violet'), css('--pink')]);
  const dots = f.g.selectAll('circle').data(data.sort((a, b) => b.hours - a.hours)).join('circle').attr('cx', d => x(ago(d))).attr('cy', d => y(d.rank / 10000)).attr('r', d => r(d.hours))
    .attr('fill', d => col(d.rank / 10000)).attr('fill-opacity', .7).attr('stroke', css('--stage')).style('cursor', 'pointer').on('click', (e, d) => { location.hash = aTrack(d.uri); });
  tipOn(dots, d => `${cover(pic.track(d.uri), '')}<b>${escH(d.name)}</b><br>${escH(d.artist)}<br><span class="t-d">${d.year} · popularité ${Math.round(d.rank / 10000)}/100 · ${hFmt(d.hours)}</span>`);
}
