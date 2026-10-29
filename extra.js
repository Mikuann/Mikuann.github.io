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
    document.addEventListener('input', e => { if (e.target.matches('.vol input')) this.setVolume(e.target.value / 100); });
    document.addEventListener('click', e => { if (e.target.closest('.vol-ic')) this.toggleMute(); });
    $('#player-btn').addEventListener('click', () => (this.blocked ? this.resume() : this.on ? this.pause(true) : this.play(true)));
    let want = true;
    try { want = localStorage.getItem('music') !== 'off'; } catch { }
    if (want) this.play();
  },
  // Ajoute l'icône haut-parleur (clic = couper / remettre le son) devant chaque slider de volume
  decorate() {
    document.querySelectorAll('.vol').forEach(v => {
      if (!v.querySelector('.vol-ic')) v.insertAdjacentHTML('afterbegin', `<button type="button" class="vol-ic">${VOL_ICON}</button>`);
    });
    this.syncSliders();
  },
  syncSliders() {
    const p = Math.round(this.volume * 100), level = p === 0 ? 0 : p < 50 ? 1 : 2;
    document.querySelectorAll('.vol input').forEach(i => { i.value = p; i.style.setProperty('--p', p + '%'); });
    document.querySelectorAll('.vol').forEach(v => { v.dataset.level = level; });
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

// ---------- Badge « en ce moment » : dernier titre scrobblé sur Last.fm, rafraîchi toutes les 30 s ----------
const LFM_NOIMG = '2a96cbd8b46e442fc41c2b86b821562f';
const NowPlaying = {
  el: null, pop: null, cur: null,
  init() {
    if (!CFG.lastfmUser || !CFG.lastfmKey) return;
    this.el = document.createElement('button');
    this.el.type = 'button'; this.el.className = 'np idle';
    this.el.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.el);
    this.poll();
    setInterval(() => this.poll(), 30000);
  },
  lfm(method, params) {
    const q = new URLSearchParams({ method, api_key: CFG.lastfmKey, format: 'json', ...params });
    return fetch('https://ws.audioscrobbler.com/2.0/?' + q).then(r => r.json());
  },
  async poll() {
    const j = await this.lfm('user.getrecenttracks', { user: CFG.lastfmUser, limit: 1 }).catch(() => null);
    const t = j?.recenttracks?.track?.[0];
    if (!t) return;
    const img = (t.image || []).map(i => i['#text']).filter(Boolean).pop() || '';
    this.cur = { name: t.name, artist: t.artist?.['#text'] || t.artist?.name || '', img: img.includes(LFM_NOIMG) ? '' : img, now: t['@attr']?.nowplaying === 'true', uts: +t.date?.uts || 0 };
    const c = this.cur, ago = c.uts ? Math.round((Date.now() / 1000 - c.uts) / 60) : null;
    const when = c.now ? `${esc(OWNER)} écoute en ce moment` : ago == null ? 'Dernière écoute' : ago < 60 ? `Écouté il y a ${ago} min` : ago < 1440 ? `Écouté il y a ${Math.round(ago / 60)} h` : `Écouté il y a ${Math.round(ago / 1440)} j`;
    this.el.classList.toggle('idle', !c.now);
    this.el.innerHTML = `${cover(c.img || PLACEHOLDER, '')}<span class="np-t"><small>${when}</small><b>${esc(c.name)}</b><span>${esc(c.artist)}</span></span>`;
    if (this.pop) this.fill();
  },
  toggle() {
    if (this.pop) { this.pop.remove(); this.pop = null; return; }
    this.pop = document.createElement('div');
    this.pop.className = 'np-pop';
    document.body.appendChild(this.pop);
    this.fill();
  },
  async fill() {
    const c = this.cur, pop = this.pop;
    if (!c || !pop) return;
    pop.innerHTML = `${cover(c.img || PLACEHOLDER, '')}<h3>${esc(c.name)}</h3><p>${esc(c.artist)}</p><dl class="facts"></dl>`;
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^a-z0-9]/g, '');
    const [all, info] = await Promise.all([
      (STATIC ? fetchJson('data/all/tracks.json') : fetch('/api/tracks?year=all').then(r => r.json())).catch(() => []),
      this.lfm('track.getInfo', { artist: c.artist, track: c.name, username: CFG.lastfmUser, autocorrect: 1 }).catch(() => null),
    ]);
    if (this.pop !== pop) return;
    const hit = all.find(t => norm(t.name) === norm(c.name) && norm(t.artist) === norm(c.artist));
    const facts = [];
    if (hit) {
      facts.push(['Écoutes dans son historique', nf.format(hit.plays)], ['Classement tous temps', `n°${nf.format(hit.rank)}`], ['Découvert le', dateFr(hit.first)]);
      if (!c.img) pop.querySelector('.cov').src = pic.track(hit.uri);
    } else facts.push(['Dans son historique', 'pas encore, c’est peut-être une découverte']);
    const lp = +info?.track?.userplaycount;
    if (lp) facts.push(['Écoutes sur Last.fm', nf.format(lp)]);
    pop.querySelector('.facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') + (hit ? `<div><dt>&nbsp;</dt><dd><a class="more" href="${aTrack(hit.uri)}" style="--c:var(--violet)">Voir la fiche →</a></dd></div>` : '');
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
