'use strict';
// Récap plein écran : diapos, musique de fond (extraits de 30 s de tes titres) et effets qui suivent le rythme.
const BLOBS = [[-12, -20, 52, 70, 60, 34], [62, -18, 40, -10, 70, 46], [-20, 55, 48, 60, -16, 38], [55, 50, 56, -14, -12, 40], [10, -28, 44, 72, 40, 30], [-18, 10, 36, 58, 58, 50]];
const SLIDE_COLORS = ['--violet', '--lime', '--pink', '--cyan', '--orange', '--yellow', '--red'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let storyEl = null;

// ---------- Son : deux lecteurs en fondu enchaîné, branchés sur un analyseur pour les effets ----------
const Sound = {
  ctx: null, analyser: null, master: null, data: null, players: [], cur: null, uri: null, muted: false, blocked: false, onState: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;
    this.master = this.ctx.createGain();
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.applyVolume();
    for (let i = 0; i < 2; i++) {
      const a = new Audio(), g = this.ctx.createGain();
      a.loop = true; a.preload = 'auto'; a.crossOrigin = 'anonymous'; g.gain.value = 0;
      this.ctx.createMediaElementSource(a).connect(g);
      g.connect(this.analyser);
      this.players.push({ a, g });
    }
  },
  ramp(p, to, sec = 1.2) {
    const t = this.ctx.currentTime;
    p.g.gain.cancelScheduledValues(t);
    p.g.gain.setValueAtTime(p.g.gain.value, t);
    p.g.gain.linearRampToValueAtTime(to, t + sec);
  },
  play(uri) {
    this.init();
    if (!this.ctx || !uri || uri === this.uri) return;
    this.uri = uri;
    const prev = this.cur, next = this.players.find(p => p !== prev);
    this.cur = next;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => { });
    previewSrc(uri).then(src => {
      if (this.uri !== uri) return Promise.reject(new Error('remplacé'));
      if (!src) return Promise.reject(new Error('pas d’extrait'));
      next.a.src = src;
      return next.a.play();
    }).then(() => {
      this.blocked = false; this.onState?.();
      if (this.cur === next) this.ramp(next, 0.9);
    }).catch(e => {
      if (e.name === 'NotAllowedError') { this.blocked = true; this.onState?.(); return; }
      if (this.cur === next && prev) { this.cur = prev; this.ramp(prev, 0.9, 0.3); } // pas d'extrait : on garde la musique d'avant
    });
    if (prev) {
      this.ramp(prev, 0);
      setTimeout(() => { if (this.cur !== prev) prev.a.pause(); }, 1300);
    }
  },
  kick() { // appelé sur un clic : débloque le son si le navigateur l'a bloqué
    if (!this.ctx) return;
    this.ctx.resume().catch(() => { });
    const p = this.cur;
    if (p && p.a.paused && p.a.src) p.a.play().then(() => { this.blocked = false; this.onState?.(); this.ramp(p, 0.9, 0.6); }).catch(() => { });
  },
  pause(on) { const p = this.cur; if (!p || !p.a.src) return; if (on) p.a.pause(); else p.a.play().catch(() => { }); },
  applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : Player.volume; },
  setMuted(m) { this.muted = m; this.applyVolume(); this.onState?.(); },
  level(from, to) {
    if (!this.analyser || !this.cur || this.cur.a.paused) return 0;
    this.analyser.getByteFrequencyData(this.data);
    let s = 0;
    for (let i = from; i < to; i++) s += this.data[i];
    return s / (to - from) / 255;
  },
  stop() {
    for (const p of this.players) { p.a.pause(); p.a.removeAttribute('src'); p.a.load(); p.g.gain.value = 0; }
    this.cur = null; this.uri = null; this.onState = null;
  },
};

// ---------- Effets : particules, égaliseur et confettis sur un canvas ----------
function startFx(canvas) {
  const c = canvas.getContext('2d'), css = getComputedStyle(document.documentElement);
  const COLORS = ['--lime', '--pink', '--violet', '--orange', '--cyan', '--yellow'].map(v => css.getPropertyValue(v).trim());
  const INK = css.getPropertyValue('--ink').trim() || '#0a0a0d';
  let w = 0, h = 0, raf = 0, t = 0, beatSmooth = 0;
  const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3.5, v: 0.3 + Math.random(), a: Math.random() * 6.28 }));
  let confetti = [];
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
  function frame() {
    t += 0.016;
    const bass = Sound.level(1, 7);
    beatSmooth += (bass - beatSmooth) * 0.35;
    storyEl?.style.setProperty('--beat', beatSmooth.toFixed(3));
    c.clearRect(0, 0, w, h);
    // particules qui montent plus vite sur les basses
    c.fillStyle = INK;
    for (const p of parts) {
      if (!REDUCED) { p.y -= (0.0006 + beatSmooth * 0.006) * p.v; p.x += Math.sin(p.a + t * p.v) * 0.0004; }
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      c.globalAlpha = 0.1 + beatSmooth * 0.3;
      c.beginPath(); c.arc(p.x * w, p.y * h, p.r * (1 + beatSmooth * 0.8), 0, 6.283); c.fill();
    }
    // égaliseur en bas de l'écran
    if (Sound.data && beatSmooth > 0.01) {
      const n = 48, bw = w / n;
      c.globalAlpha = 0.22;
      for (let i = 0; i < n; i++) {
        const v = Sound.data[i] / 255, bh = v * h * 0.2;
        c.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    }
    // confettis
    c.globalAlpha = 1;
    confetti = confetti.filter(k => k.y < h + 40 && k.life-- > 0);
    for (const k of confetti) {
      k.vy += 0.18; k.vx *= 0.99; k.x += k.vx; k.y += k.vy; k.rot += k.vr;
      c.save(); c.translate(k.x, k.y); c.rotate(k.rot); c.fillStyle = k.color;
      c.fillRect(-k.s / 2, -k.s / 4, k.s, k.s / 2); c.restore();
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    burst() {
      if (REDUCED) return;
      for (let i = 0; i < 160; i++) {
        const left = i % 2 === 0;
        confetti.push({ x: left ? 0 : w, y: h * 0.55, vx: (left ? 1 : -1) * (4 + Math.random() * 9), vy: -(6 + Math.random() * 9), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: 8 + Math.random() * 10, color: COLORS[i % COLORS.length], life: 260 });
      }
    },
    stop() { cancelAnimationFrame(raf); removeEventListener('resize', resize); },
  };
}

function countUp(root) {
  if (REDUCED) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count, t0 = performance.now(), dur = 1500;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - (1 - p) ** 3;
      el.textContent = nf.format(Math.round(end * e));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- Les diapos ----------
async function openStory() {
  if (storyEl) return;
  const [o, h, ms] = await Promise.all([api('overview'), api('habits'), isAll() ? null : api('months')]);
  const ta = o.topArtists[0], tt = o.topTracks[0];
  const art = ta ? await api('artist', { name: ta.name }) : null;
  if (storyEl || location.hash !== '#/recap') return;
  const c = o.compare, T = o.topTracks.map(t => t.key), song = i => T[i % T.length];
  const artistSong = art?.trackList?.[0]?.key || song(0);
  const bestHour = h.hoursOfDay.indexOf(Math.max(...h.hoursOfDay)), bestWd = h.weekdays.indexOf(Math.max(...h.weekdays));
  const topMonth = ms && ms.months.reduce((a, b) => (b.hours > a.hours ? b : a));
  const when = (isAll() ? 'Depuis le début' : `En ${YEAR}`) + `, ${esc(OWNER)} a écouté`;
  const minutes = Math.round(o.hours * 60);
  const num = v => `<span data-count="${v}">${nf.format(v)}</span>`;
  const li5 = (list, img, round, sub, val) => `<ol class="s-list with-pic">${list.slice(0, 5).map((x, i) => `<li><span>${i + 1}</span>${cover(img(x), 'sl' + (round ? ' round' : ''))}<span>${esc(x.name)}${sub ? `<br><small>${sub(x)}</small>` : ''}</span><b>${val(x)}</b></li>`).join('')}</ol>`;
  const r = c && c.cur.hours / c.prev.hours;
  const slides = [
    { song: song(0), html: `<div class="s-fan">${o.topTracks.slice(0, 5).map(t => cover(pic.track(t.key), 's-fan-i')).join('')}</div><p class="s-kicker">${isAll() ? 'Toutes les années' : `L'année ${YEAR}`} de ${esc(OWNER)} en musique</p><p class="s-mid">On rembobine ?</p><p class="s-sub">Du ${dateFr(o.first)} au ${dateFr(o.last)}. Monte le son et clique pour avancer.</p>` },
    { song: song(0), html: `<p class="s-kicker">${when}</p><p class="s-big">${num(minutes)}</p><p class="s-sub">minutes de musique. Ça fait <b>${n1.format(o.hours / 24)} jours</b> non-stop, ou ${n1.format(o.hours / o.span)} h par jour en moyenne.</p>` },
    c && { song: song(0), html: `<p class="s-kicker">C'est</p><p class="s-big">${r >= 1.995 ? '×' + n1.format(r) : (r >= 1 ? '+' : '−') + nf.format(Math.round(Math.abs(r - 1) * 100)) + ' %'}</p><p class="s-sub">${r >= 1 ? 'de plus' : 'de moins'} qu'en ${c.year}${c.cutoff === '12-31' ? '' : ' à la même date'} (${fmtH(c.prev.hours)} à l'époque).</p>` },
    { song: song(1), html: `<p class="s-kicker">${esc(OWNER)} a lancé de la musique</p><p class="s-big">${num(o.days)} jours</p><p class="s-sub">sur ${nf.format(o.span)}. Plus longue série : <b>${nf.format(o.streak.len)} jours d'affilée</b>, jusqu'au ${dateFr(o.streak.end)}.</p>` },
    ta && { song: artistSong, burst: true, html: `<div class="s-hero"><div class="s-art">${cover(pic.artist(ta.name), 's-cover round')}<span class="s-ring"></span></div><div class="s-txt"><p class="s-kicker">L'artiste n°1 de ${esc(OWNER)}</p><p class="s-mid">${esc(ta.name)}</p><p class="s-sub">${fmtH(ta.hours)} ensemble, ${nf.format(ta.plays)} écoutes. Ça représente ${pct(ta.hours / o.hours)} de tout son temps d'écoute.</p></div></div>` },
    { song: artistSong, html: `<p class="s-kicker">Ses artistes préférés</p>${li5(o.topArtists, x => pic.artist(x.name), true, null, x => fmtH(x.hours))}` },
    tt && { song: song(0), burst: true, html: `<div class="s-hero"><div class="s-rec vinyl"><span class="s-disc"></span>${cover(pic.track(tt.key), 's-cover')}</div><div class="s-txt"><p class="s-kicker">Le titre que ${esc(OWNER)} a le plus écouté</p><p class="s-mid">${esc(tt.name)}</p><p class="s-sub">de ${esc(tt.artist)}. <b>${nf.format(tt.plays)} écoutes</b>, soit ${fmtH(tt.hours)} en boucle.</p></div></div>` },
    { song: song(1), html: `<p class="s-kicker">Ses titres préférés</p>${li5(o.topTracks, x => pic.track(x.key), false, x => esc(x.artist), x => nf.format(x.plays) + '×')}` },
    { song: song(2), html: `<p class="s-kicker">${esc(OWNER)} a écouté</p><p class="s-big">${num(o.tracks)}</p><p class="s-sub">titres différents, de ${nf.format(o.artists)} artistes. Dont <b>${nf.format(o.newArtists)} artistes</b> jamais écoutés avant.</p>` },
    { song: song(3), html: `<p class="s-kicker">Sa plus grosse journée</p><p class="s-mid">${dateDay(o.bestDay.d)}</p><p class="s-sub"><b>${fmtH(o.bestDay.hours)}</b> de musique en une journée${o.bestDay.topArtist ? `, surtout ${esc(o.bestDay.topArtist)}` : ''}.</p>` },
    { song: song(4), html: `<p class="s-kicker">Son heure de pointe</p><p class="s-big">${bestHour} h</p><p class="s-sub">C'est l'heure où ça tourne le plus. Et le jour le plus musical, c'est le <b>${JOURS[bestWd]}</b>.</p>` },
    topMonth && { song: topMonth.topTrackUri, html: `<div class="s-hero"><div class="s-rec">${cover(pic.track(topMonth.topTrackUri), 's-cover')}</div><div class="s-txt"><p class="s-kicker">Son mois le plus musical</p><p class="s-mid">${MOIS[topMonth.m - 1]}</p><p class="s-sub">${fmtH(topMonth.hours)}, ${nf.format(topMonth.plays)} écoutes. Artiste du mois : <b>${esc(topMonth.topArtist)}</b>. Titre du mois : <b>${esc(topMonth.topTrack)}</b>.</p></div></div>` },
    o.ageGuess && { song: song(2), html: `<p class="s-kicker">L'âge musical de ${esc(OWNER)}</p><p class="s-big">${num(o.ageGuess)} ans</p><p class="s-sub">Estimé d'après l'année de sortie de toute sa musique. On écoute surtout la musique sortie vers nos 16 ans.</p>` },
    { song: song(0), burst: true, html: `<p class="s-kicker">${isAll() ? 'Tout l’historique' : `Le ${YEAR}`} de ${esc(OWNER)} en résumé</p><div class="s-sum">
      ${ta ? `<div class="s-sum-pic">${cover(pic.artist(ta.name), 's-cover')}</div>` : ''}
      <div><h3>Top artistes</h3><ol>${o.topArtists.map(x => `<li>${esc(x.name)}</li>`).join('')}</ol></div>
      <div><h3>Top titres</h3><ol>${o.topTracks.map(x => `<li>${esc(x.name)}</li>`).join('')}</ol></div>
      <div><h3>Minutes d'écoute</h3><span class="s-num">${nf.format(minutes)}</span></div>
      <div><h3>Nouveaux artistes</h3><span class="s-num">${nf.format(o.newArtists)}</span></div>
    </div>` },
    CFG.bestof && { song: song(0), burst: true, video: 'full', html: `${CFG.moments?.length ? `<div class="s-polas">${CFG.moments.map(m => `<img src="${esc(m)}" alt="">`).join('')}</div>` : CFG.avatar ? `<img class="s-thanks-av" src="${esc(CFG.avatar)}" alt="">` : ''}<p class="s-kicker">Le best of de ${esc(OWNER)}${isAll() ? '' : ' ' + YEAR}</p><p class="s-mid">Merci pour tous ces bons moments</p><p class="s-sub">${CFG.bestofGames ? esc(CFG.bestofGames) + '… ' : ''}et <b>${nf.format(Math.round(o.hours))} h</b> de musique pour les accompagner. À l’année prochaine 💜</p>` },
  ].filter(Boolean);
  // Les dernières diapos passent le best of en fond (la dernière en plein écran)
  if (CFG.bestof) slides.slice(-3).forEach(s => { s.video = s.video || 'bg'; });
  // Images chargées tout de suite (pas en différé) et préchargées pour toutes les diapos
  for (const s of slides) {
    s.html = s.html.replace(/ loading="lazy"/g, '');
    for (const m of s.html.matchAll(/src="(\/media\/[^"]+)"/g)) new Image().src = m[1].replace(/&amp;/g, '&');
  }

  storyEl = document.createElement('div');
  storyEl.className = 'story';
  storyEl.setAttribute('role', 'dialog');
  storyEl.setAttribute('aria-label', 'Récap de ton année');
  storyEl.innerHTML = `<div class="story-bars">${slides.map(() => '<span><i></i></span>').join('')}</div>
    <div class="story-top"><span>${esc(OWNER)} · ${isAll() ? 'tout l’historique' : YEAR}</span><span class="story-btns"><div class="vol"><input type="range" min="0" max="100" aria-label="Volume du récap"></div><button type="button" class="story-btn snd"></button><button type="button" class="story-x" aria-label="Fermer le récap">×</button></span></div>
    <div class="story-stage"><div class="s-backdrop"></div>${CFG.bestof ? `<video class="s-video" muted playsinline loop preload="none" poster="${esc(CFG.bestofPoster || '')}" src="${esc(CFG.bestof)}" aria-hidden="true"></video>` : ''}<div class="story-blob"></div><div class="story-blob"></div><canvas class="story-fx" aria-hidden="true"></canvas><div class="story-nav prev"></div><div class="story-nav next"></div><div class="story-slide" aria-live="polite"></div></div>
    <div class="story-hint">Clic ou flèches pour naviguer · Espace pour pause · M pour couper le son · Échap pour fermer</div>`;
  document.body.appendChild(storyEl);
  document.body.style.overflow = 'hidden';
  if (typeof stopListen === 'function') stopListen();
  const playerWasOn = Player.on;
  Player.pause(); Player.decorate();
  const slideEl = $('.story-slide', storyEl), barEls = [...storyEl.querySelectorAll('.story-bars span')], blobs = storyEl.querySelectorAll('.story-blob');
  const sndBtn = $('.snd', storyEl);
  Sound.onState = () => { sndBtn.textContent = Sound.blocked ? '♪ Activer le son' : Sound.muted ? '♪ Remettre le son' : '♪ Couper le son'; sndBtn.classList.toggle('hot', Sound.blocked); };
  Sound.onState();
  const fx = startFx($('.story-fx', storyEl));
  const video = $('.s-video', storyEl);
  let i = -1;
  function show(n) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === i) return;
    i = n;
    const s = slides[i], b = BLOBS[i % BLOBS.length];
    storyEl.style.setProperty('--bg', `var(${SLIDE_COLORS[i % SLIDE_COLORS.length]})`);
    blobs.forEach((el, k) => {
      const [x, y, size] = k ? [b[3], b[4], b[5]] : [b[0], b[1], b[2]];
      Object.assign(el.style, { left: x + '%', top: y + '%', width: size + 'vmax', height: size + 'vmax', background: `var(${SLIDE_COLORS[(i + 2 + k * 2) % SLIDE_COLORS.length]})` });
    });
    slideEl.innerHTML = s.html;
    const bgImg = slideEl.querySelector('img.cov')?.getAttribute('src') || CFG.banner;
    if (bgImg) $('.s-backdrop', storyEl).style.backgroundImage = `url('${bgImg}')`;
    countUp(slideEl);
    if (s.burst) setTimeout(() => fx.burst(), 350);
    Sound.play(s.song);
    if (video) {
      if (i >= slides.length - 5) video.preload = 'auto';
      storyEl.classList.toggle('with-video', !!s.video);
      storyEl.classList.toggle('video-full', s.video === 'full');
      if (s.video) video.play().catch(() => { }); else video.pause();
    }
    barEls.forEach((el, k) => { el.classList.toggle('done', k < i); el.classList.remove('on'); });
    void barEls[i].offsetWidth; // relance l'animation de la barre
    barEls[i].classList.add('on');
    storyEl.classList.remove('paused');
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    fx.stop(); Sound.stop();
    storyEl.remove(); storyEl = null;
    document.body.style.overflow = '';
    if (location.hash === '#/recap') history.replaceState(null, '', '#/');
    if (playerWasOn) Player.play();
  }
  function togglePause() {
    const p = storyEl.classList.toggle('paused');
    Sound.pause(p);
    if (video && storyEl.classList.contains('with-video')) p ? video.pause() : video.play().catch(() => { });
  }
  function onKey(e) {
    if (e.key === 'Escape') return close();
    Sound.kick();
    if (e.key === 'ArrowRight' || e.key === 'Enter') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'm' || e.key === 'M') Sound.setMuted(!Sound.muted);
  }
  barEls.forEach((el, k) => el.addEventListener('animationend', () => { if (k === i && i < slides.length - 1) show(i + 1); }));
  $('.story-nav.prev', storyEl).addEventListener('click', () => { Sound.kick(); show(i - 1); });
  $('.story-nav.next', storyEl).addEventListener('click', () => { Sound.kick(); show(i + 1); });
  $('.story-x', storyEl).addEventListener('click', close);
  sndBtn.addEventListener('click', () => { if (Sound.blocked) Sound.kick(); else Sound.setMuted(!Sound.muted); });
  document.addEventListener('keydown', onKey);
  storyEl.close = close;
  show(0);
  $('.story-x', storyEl).focus();
}
