'use strict';
// Lecteur de musique du site (avec volume), badge « en ce moment » (Last.fm), pages Profil musical et Avoir tes stats.

// ---------- Lecteur : enchaîne les extraits du top titres, volume partagé avec le récap et les extraits ----------
// La musique démarre toute seule ; si le navigateur bloque la lecture automatique, elle part au premier clic ou à la première touche.
const VOL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path class="w1" d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path class="w2" d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="m16 10 5 5m0-5-5 5"/></svg>';
const Player = {
  volume: 0.5, lastVol: 0.5, audio: null, list: [], i: 0, on: false, blocked: false, misses: 0, cur: null, offGesture: null,
  init() {
    try { const v = localStorage.getItem('vol'); if (v != null && !isNaN(+v)) this.volume = +v; } catch { }
    if (this.volume > 0) this.lastVol = this.volume;
    this.decorate();
    document.addEventListener('input', e => { if (e.target.matches('.vol:not(.cvol) input')) this.setVolume(e.target.value / 100); });
    document.addEventListener('click', e => { if (e.target.closest('.vol-ic')) this.toggleMute(); });
    $('#player-btn').addEventListener('click', () => (this.blocked ? this.resume() : this.on ? this.pause(true) : this.play(true)));
    let want = true;
    try { want = localStorage.getItem('music') !== 'off'; } catch { }
    if (want) this.play();
  },
  // Ajoute l'icône haut-parleur (clic = couper / remettre le son) devant chaque slider de volume
  decorate() {
    document.querySelectorAll('.vol:not(.cvol)').forEach(v => {
      if (!v.querySelector('.vol-ic')) v.insertAdjacentHTML('afterbegin', `<button type="button" class="vol-ic">${VOL_ICON}</button>`);
    });
    this.syncSliders();
  },
  syncSliders() {
    const p = Math.round(this.volume * 100), level = p === 0 ? 0 : p < 50 ? 1 : 2;
    document.querySelectorAll('.vol:not(.cvol) input').forEach(i => { i.value = p; i.style.setProperty('--p', p + '%'); });
    document.querySelectorAll('.vol:not(.cvol)').forEach(v => { v.dataset.level = level; });
    document.querySelectorAll('.vol-ic').forEach(b => b.setAttribute('aria-label', p ? 'Couper le son' : 'Remettre le son'));
  },
  toggleMute() { this.setVolume(this.volume > 0 ? 0 : this.lastVol || 0.5); },
  setVolume(v) {
    this.volume = v;
    if (v > 0) this.lastVol = v;
    try { localStorage.setItem('vol', String(v)); } catch { }
    if (this.audio) this.audio.volume = v;
    if (typeof listenAudio !== 'undefined' && listenAudio) listenAudio.volume = v;
    Sound.applyVolume();
    this.syncSliders();
  },
  async play(byUser) {
    if (byUser) try { localStorage.setItem('music', 'on'); } catch { }
    if (!this.audio) { this.audio = new Audio(); this.audio.addEventListener('ended', () => this.next()); }
    stopListen();
    this.on = true; this.misses = 0;
    if (!this.list.length) {
      const o = await (STATIC ? fetchJson(`data/${META.defaultYear}/overview.json`) : fetch(`/api/overview?year=${META.defaultYear}`).then(r => r.json()));
      this.list = o.topTracks.map(t => ({ uri: t.key, name: t.name, artist: t.artist }));
    }
    if (this.on) this.load();
  },
  async load() {
    const t = this.cur = this.list[this.i % this.list.length];
    this.ui();
    const src = await previewSrc(t.uri);
    if (!this.on) return;
    if (!src) return ++this.misses < this.list.length ? this.next() : this.pause();
    this.audio.src = src; this.audio.volume = this.volume;
    this.audio.play().then(() => this.ui(), e => (e.name === 'NotAllowedError' ? this.waitGesture() : this.pause()));
  },
  // Lecture automatique refusée par le navigateur : on attend la première interaction avec la page
  waitGesture() {
    this.blocked = true; this.ui();
    const evs = ['click', 'keydown', 'touchend'];
    const go = e => { if (e.target.closest?.('#player')) return; this.offGesture?.(); if (this.on && this.blocked) this.resume(); };
    this.offGesture = () => { evs.forEach(n => document.removeEventListener(n, go)); this.offGesture = null; };
    evs.forEach(n => document.addEventListener(n, go));
  },
  resume() {
    this.offGesture?.();
    this.blocked = false; this.on = true;
    this.audio.play().then(() => this.ui(), () => this.pause());
  },
  next() { this.i++; if (this.on) this.load(); },
  pause(byUser) {
    if (byUser) try { localStorage.setItem('music', 'off'); } catch { }
    this.offGesture?.();
    this.on = false; this.blocked = false;
    if (this.audio) this.audio.pause();
    this.ui();
  },
  ui() {
    const b = $('#player-btn'), t = this.cur, playing = this.on && !this.blocked;
    b.textContent = playing ? '❚❚' : '▶';
    b.setAttribute('aria-label', playing ? 'Mettre la musique en pause' : 'Lancer la musique du site');
    $('#player').classList.toggle('playing', playing);
    $('#player').classList.toggle('waiting', this.blocked);
    $('#player-now').textContent = this.blocked ? 'Clique n’importe où pour la musique ♪' : playing && t ? `${t.name} · ${t.artist}` : 'Musique du site';
  },
};

// ---------- Visionneuse des photos de la galerie (clic, flèches, Échap) ----------
const Lightbox = {
  el: null, i: 0,
  init() {
    document.addEventListener('click', e => {
      const a = e.target.closest('.gallery a');
      if (!a) return;
      e.preventDefault();
      this.open(+a.dataset.i);
    });
  },
  open(i) {
    this.close();
    this.el = document.createElement('div');
    this.el.className = 'lightbox';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Photo');
    this.el.innerHTML = '<img alt=""><button type="button" class="lb-btn lb-prev" aria-label="Photo précédente">‹</button><button type="button" class="lb-btn lb-next" aria-label="Photo suivante">›</button><button type="button" class="lb-btn lb-x" aria-label="Fermer">×</button>';
    this.el.addEventListener('click', e => {
      if (e.target.closest('.lb-prev')) return this.show(this.i - 1);
      if (e.target.closest('.lb-next')) return this.show(this.i + 1);
      if (e.target === this.el || e.target.closest('.lb-x')) this.close();
    });
    this.onKey = e => { if (e.key === 'Escape') this.close(); else if (e.key === 'ArrowLeft') this.show(this.i - 1); else if (e.key === 'ArrowRight') this.show(this.i + 1); };
    document.addEventListener('keydown', this.onKey);
    document.body.appendChild(this.el);
    this.show(i);
  },
  show(i) {
    const list = CFG.photos || [];
    this.i = (i + list.length) % list.length;
    $('img', this.el).src = list[this.i];
  },
  close() {
    if (!this.el) return;
    document.removeEventListener('keydown', this.onKey);
    this.el.remove(); this.el = null;
  },
};

// ---------- « En ce moment » (Last.fm) : badge + pop-up en direct, temps restant, session et historique ----------
// Last.fm reçoit en temps réel ce que Spotify joue ; on interroge ses 200 derniers titres toutes les 30 s.
const LFM_NOIMG = '2a96cbd8b46e442fc41c2b86b821562f';
const SESSION_GAP = 25 * 60; // plus de 25 min entre deux débuts de titre = nouvelle session
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const npNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^a-z0-9]/g, '');
const NowPlaying = {
  el: null, toast: null, cur: null, recent: [], session: null, timing: null, lastKey: '', dismissed: '',
  all: null, byKey: null, durations: new Map(), firstSeen: new Map(), pinned: false, expanded: false, toastTimer: 0,
  init() {
    if (!CFG.lastfmUser || !CFG.lastfmKey) return;
    this.el = document.createElement('button');
    this.el.type = 'button'; this.el.className = 'np idle';
    this.el.setAttribute('aria-label', `Ce que ${OWNER} écoute`);
    this.el.addEventListener('click', () => (this.toast && this.pinned ? this.hideToast() : this.showToast(true)));
    document.body.appendChild(this.el);
    this.poll();
    setInterval(() => this.poll(), 30000);
    setInterval(() => this.tick(), 1000); // barre de progression et durées en direct
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
  },
  lfm(method, params) {
    const q = new URLSearchParams({ method, api_key: CFG.lastfmKey, format: 'json', ...params });
    return fetch('https://ws.audioscrobbler.com/2.0/?' + q).then(r => r.json());
  },
  parse(t) {
    const img = (t.image || []).map(i => i['#text']).filter(Boolean).pop() || '';
    return { name: t.name, artist: t.artist?.['#text'] || t.artist?.name || '', img: img.includes(LFM_NOIMG) ? '' : img, now: t['@attr']?.nowplaying === 'true', uts: +t.date?.uts || 0 };
  },
  keyOf: t => t.artist + '\u0000' + t.name,
  // Session = titres enchaînés sans pause de plus de SESSION_GAP, en remontant depuis le plus récent
  sessionOf(list, live) {
    const starts = list.filter(t => t.uts).map(t => t.uts);
    if (!starts.length && !live) return null;
    const nowS = Date.now() / 1000;
    let prev = live ? nowS : starts[0], start = prev, count = live ? 1 : 0, broke = false;
    for (const u of starts) {
      if (prev - u > SESSION_GAP) { broke = true; break; }
      start = u; prev = u; count++;
    }
    return { start, count, live, end: live ? null : starts[0] + 180, capped: !broke && starts.length >= 199 };
  },
  async poll() {
    const j = await this.lfm('user.getrecenttracks', { user: CFG.lastfmUser, limit: 200 }).catch(() => null);
    const raw = j?.recenttracks?.track;
    if (!raw?.length) return;
    const list = raw.map(t => this.parse(t));
    const c = this.cur = list[0];
    this.recent = list.slice(1);
    this.session = this.sessionOf(list, c.now);
    const key = this.keyOf(c);
    if (key !== this.lastKey) { this.firstSeen.set(key, Date.now()); this.timing = null; }
    await this.loadHistory();
    if (c.now) await this.computeTiming(list);
    this.render();
    if (c.now && key !== this.lastKey && key !== this.dismissed) this.showToast(this.pinned);
    else if (this.toast) this.fillToast();
    this.lastKey = key;
  },
  // Historique complet (export Spotify) : pochettes et petites stats pour les titres reconnus
  async loadHistory() {
    if (this.all) return;
    this.all = await (STATIC ? fetchJson('data/all/tracks.json') : fetch('/api/tracks?year=all').then(r => r.json())).catch(() => []);
    this.byKey = new Map(this.all.map(t => [npNorm(t.artist) + '|' + npNorm(t.name), t]));
  },
  find(t) { return this.byKey?.get(npNorm(t.artist) + '|' + npNorm(t.name)) || null; },
  imgOf(t) { if (t.img) return t.img; const h = this.find(t); return h ? pic.track(h.uri) : PLACEHOLDER; },
  // Durée d'un titre : Last.fm, sinon Deezer
  async durationOf(t) {
    const key = this.keyOf(t);
    if (this.durations.has(key)) return this.durations.get(key);
    let ms = +(await this.lfm('track.getInfo', { artist: t.artist, track: t.name, autocorrect: 1 }).catch(() => null))?.track?.duration || 0;
    if (!ms) {
      const q = encodeURIComponent(`artist:"${t.artist}" track:"${t.name}"`);
      ms = ((await jsonp(`https://api.deezer.com/search?q=${q}&limit=1`).catch(() => null))?.data?.[0]?.duration || 0) * 1000;
    }
    this.durations.set(key, ms || null);
    return ms || null;
  },
  // Début du titre en cours : fin du titre précédent si c'est plausible, sinon le moment où on l'a vu passer
  async computeTiming(list) {
    const c = list[0], prev = list.find(t => t.uts);
    const [dur, prevDur] = await Promise.all([this.durationOf(c), prev ? this.durationOf(prev) : null]);
    const now = Date.now(), seen = this.firstSeen.get(this.keyOf(c)) || now;
    let start = seen;
    if (prev) {
      const prevEnd = Math.min(now, prev.uts * 1000 + (prevDur || 180000));
      if (now - prevEnd < (dur || 240000) + 20000) start = Math.min(prevEnd, seen);
    }
    this.timing = { start, dur };
  },
  progress() {
    const t = this.timing;
    if (!this.cur?.now || !t?.dur) return null;
    const el = Math.min(Date.now() - t.start, t.dur);
    return { el, dur: t.dur, frac: el / t.dur, rem: t.dur - el };
  },
  tick() {
    if (!this.cur) return;
    const p = this.progress();
    document.querySelectorAll('.np-bar i, .np-mini i').forEach(i => { i.style.width = p ? (p.frac * 100).toFixed(1) + '%' : '0'; });
    if (p && this.toast) {
      const el = this.toast.querySelector('.np-el'), rem = this.toast.querySelector('.np-rem');
      if (el) el.textContent = mmss(p.el);
      if (rem) rem.textContent = p.rem > 1000 ? `−${mmss(p.rem)}` : 'bientôt fini';
    }
    if (Date.now() % 15000 < 1000) { // toutes les 15 s : durée de session
      this.render();
      const s = this.toast?.querySelector('.np-toast-s');
      if (s) s.innerHTML = this.sessionLine();
    }
  },
  sessionLen() {
    const s = this.session;
    if (!s) return '';
    const m = Math.max(1, Math.round(((s.live ? Date.now() / 1000 : s.end) - s.start) / 60));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  },
  sessionLine() {
    const s = this.session;
    if (!s) return '';
    const n = `${s.capped ? '+ de ' : ''}${nf.format(s.count)} titre${s.count > 1 ? 's' : ''}`;
    return s.live ? `En session depuis <b>${this.sessionLen()}</b> · ${n}` : `Dernière session : <b>${this.sessionLen()}</b> · ${n}`;
  },
  ago(uts) {
    const m = Math.round((Date.now() / 1000 - uts) / 60);
    if (m < 1) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    const d = new Date(uts * 1000), hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${hm}`;
  },
  when() {
    const c = this.cur;
    return c.now ? `${esc(OWNER)} écoute en ce moment` : c.uts ? `Écouté ${this.ago(c.uts)}` : 'Dernière écoute';
  },
  render() {
    const c = this.cur;
    this.el.classList.toggle('idle', !c.now);
    this.el.innerHTML = `${cover(this.imgOf(c), '')}<span class="np-t"><small>${this.when()}</small><b>${esc(c.name)}</b><span>${esc(c.artist)}${c.now && this.session ? ` · ${this.sessionLen()}` : ''}</span></span>${c.now ? '<span class="np-mini" aria-hidden="true"><i></i></span>' : ''}`;
    this.tickBars();
  },
  tickBars() { const p = this.progress(); document.querySelectorAll('.np-bar i, .np-mini i').forEach(i => { i.style.width = p ? (p.frac * 100).toFixed(1) + '%' : '0'; }); },
  // Pop-up : s'affiche à chaque nouveau titre (se range tout seul) ou reste ouvert quand on clique sur le badge
  showToast(pin) {
    this.pinned = !!pin;
    if (!this.toast) {
      this.toast = document.createElement('div');
      this.toast.className = 'np-toast';
      this.toast.setAttribute('role', 'dialog');
      this.toast.setAttribute('aria-label', `Ce que ${OWNER} écoute`);
      this.toast.addEventListener('click', e => {
        if (e.target.closest('.np-toast-x')) {
          if (!this.pinned) this.dismissed = this.keyOf(this.cur);
          return this.hideToast();
        }
        if (e.target.closest('.np-more')) {
          this.expanded = !this.expanded;
          this.toast.classList.toggle('open', this.expanded);
          e.target.closest('.np-more').setAttribute('aria-expanded', this.expanded);
        }
        if (e.target.closest('a')) return this.hideToast();
        this.pin();
      });
      this.toast.addEventListener('mouseenter', () => clearTimeout(this.toastTimer));
      this.toast.addEventListener('mouseleave', () => { if (!this.pinned) this.armToast(); });
      document.body.appendChild(this.toast);
    }
    this.fillToast();
    void this.toast.offsetWidth; // applique l'état de départ avant l'animation d'entrée
    this.toast.classList.add('in');
    if (this.pinned) clearTimeout(this.toastTimer); else this.armToast();
  },
  pin() { this.pinned = true; clearTimeout(this.toastTimer); },
  armToast() { clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.hideToast(), 9000); },
  hideToast() {
    clearTimeout(this.toastTimer);
    const t = this.toast;
    if (!t) return;
    this.toast = null; this.pinned = false;
    t.classList.remove('in');
    setTimeout(() => t.remove(), 500);
  },
  histHtml() {
    const s = this.session, items = this.recent.slice(0, 30);
    if (!items.length) return '<li class="np-h-empty">Rien pour l’instant.</li>';
    let divided = false;
    return items.map(t => {
      let sep = '';
      if (s && !divided && t.uts && t.uts < s.start) { divided = true; sep = '<li class="np-h-sep">Avant</li>'; }
      return `${sep}<li>${cover(this.imgOf(t), '')}<span class="np-h-t"><b>${esc(t.name)}</b><span>${esc(t.artist)}</span></span><time>${t.uts ? this.ago(t.uts) : ''}</time></li>`;
    }).join('');
  },
  fillToast() {
    const c = this.cur, t = this.toast;
    if (!c || !t) return;
    const scroll = t.querySelector('.np-hist')?.scrollTop || 0;
    const hit = this.find(c), p = this.progress();
    const stat = hit ? `${nf.format(hit.plays)} écoutes dans son historique · n°${nf.format(hit.rank)}` : (c.now ? 'Pas encore dans son historique : une découverte ?' : '');
    t.classList.toggle('open', this.expanded);
    t.classList.toggle('live', !!c.now);
    t.innerHTML = `<button type="button" class="np-toast-x" aria-label="Fermer">×</button>
      <div class="np-toast-main"><div class="np-toast-art">${cover(this.imgOf(c), '')}</div>
      <div class="np-toast-t"><small>${c.now ? '<span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${this.when()}</small><b>${esc(c.name)}</b><span>${esc(c.artist)}</span>
      <p class="np-toast-s">${this.sessionLine()}</p>${stat ? `<p class="np-toast-h">${stat}</p>` : ''}</div></div>
      ${p ? `<div class="np-prog"><div class="np-bar"><i style="width:${(p.frac * 100).toFixed(1)}%"></i></div><div class="np-times"><span class="np-el">${mmss(p.el)}</span><span class="np-rem">${p.rem > 1000 ? `−${mmss(p.rem)}` : 'bientôt fini'}</span><span class="np-dur">${mmss(p.dur)}</span></div></div>` : ''}
      <div class="np-actions"><button type="button" class="np-more" aria-expanded="${this.expanded}">Historique <span>(${nf.format(Math.min(this.recent.length, 30))})</span><i aria-hidden="true">▾</i></button>${hit ? `<a class="np-link" href="${aTrack(hit.uri)}">Voir la fiche →</a>` : ''}</div>
      <ol class="np-hist">${this.histHtml()}</ol>`;
    t.querySelector('.np-hist').scrollTop = scroll;
  },
};

// ---------- Pages en plus ----------
const mainstreamWord = v => v >= 70 ? 'très grand public' : v >= 55 ? 'plutôt grand public' : v >= 40 ? 'entre les deux' : 'plutôt pointu';
const EXTRA_PAGES = {
  async profil() {
    const p = await api('profile');
    if (!p || !p.coverage) { main.innerHTML = `<h1>Profil musical</h1><p class="lede">Pas encore assez d'infos sur les titres pour cette période.</p>`; return; }
    const age = p.age, pos = Math.max(0, Math.min(1, (age - 12) / 48)) * 100, topDec = p.decades.reduce((a, b) => (b.hours > a.hours ? b : a));
    const trackList = (list, val, metric) => hlist(list.map(t => ({ ...t })), { img: t => pic.track(t.uri), href: t => aTrack(t.uri), sub: t => esc(t.artist), val, metric });
    main.innerHTML = `
      <div class="head${CFG.art2 ? ' with-art' : ''}"><div><h1>Le profil musical de ${esc(OWNER)} ${yearLabel()}</h1><p class="lede">Calculé à partir de l'année de sortie, de la popularité et du tempo des titres identifiés, soit <b>${pct(p.coverage)}</b> du temps d'écoute.</p></div>${CFG.art2 ? `<figure class="head-art"><img src="${esc(CFG.art2)}" alt="" data-optional>${CFG.art2Credit ? `<figcaption>Art : ${esc(CFG.art2Credit)}</figcaption>` : ''}</figure>` : ''}</div>
      <div class="grid">
        ${card('Âge musical estimé', `<div class="age-hero"><span class="age-num">${age}<small> ans</small></span><div><p class="note" style="font-size:15px">La musique écoutée est sortie en moyenne en <b>${Math.round(p.meanYear)}</b> (médiane : ${p.medianYear}). On écoute surtout la musique sortie autour de nos 16 ans, alors ce profil correspond à quelqu'un d'environ <b>${age} ans</b> en ${p.refYear}.</p><div class="meter"><i style="left:${pos.toFixed(1)}%"></i></div><div class="meter-l"><span>12 ans</span><span>24</span><span>36</span><span>48</span><span>60 ans</span></div></div></div>`, { note: 'Une estimation pour le fun : elle ne connaît pas le vrai âge, seulement les goûts.', wide: true })}
      </div>
      <div class="kpis">
        ${kpi('Grand public', `${Math.round(p.mainstream)}/100`, mainstreamWord(p.mainstream))}
        ${kpi('Nouveautés', pct(p.freshShare), 'du temps sur des titres sortis depuis moins d’un an')}
        ${kpi('Décennie n°1', `${topDec.decade}s`, `${pct(topDec.share)} du temps`)}
        ${kpi('Paroles explicites', pct(p.explicitShare), 'du temps d’écoute')}
        ${p.bpm ? kpi('Tempo moyen', `${Math.round(p.bpm)} BPM`, `mesuré sur ${pct(p.bpmShare)} du temps`) : ''}
        ${kpi('Année médiane', String(p.medianYear), 'la moitié du temps va à plus ancien')}
      </div>
      <div class="grid">
        ${card('Les époques', `<div class="chart" id="c-rel" style="min-height:260px"></div>`, { note: "Heures d'écoute selon l'année de sortie des titres. Une réédition compte à sa date de sortie.", wide: true })}
        ${card('Par décennie', `<div class="chart" id="c-dec" style="min-height:300px"></div>`)}
        ${p.bpmHist.length ? card('Le tempo', `<div class="chart" id="c-bpm"></div>`, { note: 'Heures écoutées par tranche de BPM (battements par minute).' }) : ''}
        ${card('Popularité et année de sortie', `<div class="chart" id="c-sc" style="min-height:360px"></div>`, { note: 'Chaque bulle est un titre (les 300 plus écoutés), plus elle est grosse, plus il a tourné. En haut : les tubes, en bas : les pépites. Clique pour la fiche.', wide: true })}
        ${card('Les plus anciens', trackList(p.oldest, t => t.rel.slice(0, 4), t => t.plays))}
        ${card('Les plus récents', trackList(p.newest, t => dateFr(t.rel), t => t.plays))}
        ${card('Les plus grand public', trackList(p.popular, t => `${Math.round(t.rank / 10000)}/100`, t => t.rank))}
        ${card('Les pépites les plus pointues', trackList(p.niche, t => `${Math.round(t.rank / 10000)}/100`, t => t.rank))}
      </div>`;
    chart('c-rel', el => releaseChart(el, p.relYears, p.medianYear));
    chart('c-dec', el => donut(el, p.decades));
    chart('c-sc', el => scatter(el, p.scatter));
    if (p.bpmHist.length) chart('c-bpm', el => bars(el, p.bpmHist.map(b => ({ label: String(b.bpm), value: b.hours, tip: `<span class="t-d">${b.bpm}–${b.bpm + 9} BPM</span><br><b>${fmtH(b.hours)}</b>` }))));
  },

  async tuto() {
    main.innerHTML = `
      <div class="head"><h1>Avoir tes propres stats Spotify</h1><p class="lede">Spotify garde tout ce que tu écoutes depuis la création de ton compte, même sans appli de suivi. Grâce au RGPD, tu peux récupérer cet historique gratuitement. Voici comment.</p></div>
      <ol class="steps">
        <li><h3>Ouvre la page Confidentialité de ton compte</h3><p>Depuis un navigateur (pas l'appli), va sur <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noopener">spotify.com/account/privacy</a> et connecte-toi.</p></li>
        <li><h3>Coche « Historique de streaming étendu »</h3><p>Descends jusqu'à « Télécharger vos données ». C'est la seule case utile pour des stats complètes : elle contient chaque écoute depuis le début.</p>
          <div class="mock"><span class="box"></span>Données du compte</div>
          <div class="mock"><span class="box on"></span><b>Historique de streaming étendu</b></div></li>
        <li><h3>Clique sur « Demander les données » et confirme le mail</h3><p>Spotify t'envoie un mail de confirmation. Clique sur le lien dedans, sinon la demande ne part pas.</p></li>
        <li><h3>Patiente</h3><p>Spotify annonce jusqu'à 30 jours, mais c'est souvent quelques jours. Tu recevras un mail avec un fichier <code>my_spotify_data.zip</code> à télécharger.</p></li>
        <li><h3>Regarde tes stats</h3><p>Le zip contient des fichiers <code>Streaming_History_Audio_….json</code> : une ligne par écoute, avec la date, le titre, l'artiste et la durée. Tu peux les importer sur <a href="https://stats.fm" target="_blank" rel="noopener">stats.fm</a> (gratuit), ou demander à une IA de te faire un site comme celui-ci.</p></li>
        <li><h3>Ne partage pas le fichier tel quel</h3><p>L'export contient aussi tes adresses IP et tes appareils. Ce site ne publie que des stats calculées, jamais le fichier brut.</p></li>
        <li><h3>Bonus : ce que tu écoutes en direct</h3><p>Crée un compte <a href="https://www.last.fm" target="_blank" rel="noopener">Last.fm</a> et relie-le à Spotify dans ses réglages (Applications). Chaque titre est alors enregistré en temps réel, c'est ce qui fait marcher le badge « en ce moment » de ce site.</p></li>
      </ol>`;
  },
};
