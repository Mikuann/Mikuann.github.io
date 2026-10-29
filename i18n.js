'use strict';
// Langue du site : français ou anglais. Choix mémorisé dans le navigateur, sinon langue du navigateur.
const LANG = (() => {
  let l = null;
  try { l = localStorage.getItem('lang'); } catch { }
  return l === 'fr' || l === 'en' ? l : (/^fr\b/i.test(navigator.language || 'fr') ? 'fr' : 'en');
})();
const EN = LANG === 'en';
const L = (fr, en) => (EN ? en : fr);
const LOC = EN ? 'en-GB' : 'fr-FR';
document.documentElement.lang = LANG;
// Pluriel simple : plural(3, 'titre', 'track') → « titres » / "tracks"
const plural = (n, fr, en) => (EN ? en : fr) + (Math.abs(n) >= 2 || (EN && n === 0) ? 's' : '');
// Textes fixes de index.html : data-en (texte), data-en-label (aria-label)
function applyStaticLang() {
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === LANG));
  if (!EN) return;
  document.querySelectorAll('[data-en]').forEach(el => { el.textContent = el.dataset.en; });
  document.querySelectorAll('[data-en-label]').forEach(el => el.setAttribute('aria-label', el.dataset.enLabel));
}
function setLang(l) {
  if (l === LANG) return;
  try { localStorage.setItem('lang', l); } catch { }
  location.reload();
}
