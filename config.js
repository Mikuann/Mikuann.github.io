// Réglages du site (identité, images, Last.fm). Modifiable à la main.
window.SITE_CONFIG = {
  owner: 'Mikuan',
  avatar: 'img/avatar.webp',
  portrait: 'img/portrait.webp',
  portraitCredit: '@orphelyxia',
  avatarCredit: '',
  banner: 'img/banniere.webp',
  art2: 'img/jss.webp', // dessin affiché sur la page Profil musical
  art2Credit: 'JSS',
  bestof: 'video/bestof.mp4', // best of en fond des dernières diapos du récap (sans son)
  bestofPoster: 'video/bestof.jpg',
  overviewBanner: 'video/banniere.mp4', // bannière vidéo de la vue d'ensemble, quand on descend
  overviewBannerPoster: 'video/banniere.jpg',
  bestofGames: 'VRChat, Minecraft, ARC Raiders',
  // Photos : en-têtes des pages (une par page) et galerie de l'accueil
  photos: ['img/photos/m1.jpg', 'img/photos/m2.jpg', 'img/photos/m3.jpg', 'img/photos/m4.jpg', 'img/photos/m5.jpg', 'img/photos/m6.jpg', 'img/photos/m7.jpg', 'img/photos/m8.jpg', 'img/photos/m9.jpg',
    'img/photos/m10.jpg', 'img/photos/m11.jpg', 'img/photos/m12.jpg', 'img/photos/m13.jpg', 'img/photos/m14.jpg', 'img/photos/m15.jpg', 'img/photos/m16.jpg', 'img/photos/m17.jpg', 'img/photos/m18.jpg',
    'img/photos/m19.jpg', 'img/photos/m20.jpg', 'img/photos/m21.jpg', 'img/photos/m22.jpg', 'img/photos/m23.jpg', 'img/photos/m24.jpg', 'img/photos/m25.jpg', 'img/photos/m26.jpg'],
  lastfmUser: 'Mikuan',
  lastfmKey: '4ab8f7182d098627a4bc8be4e7693567', // clé API publique (lecture seule), sans le shared secret
  // Livre d'or (Firebase Firestore) : identifiants publics du projet, sans rien de secret. Vide = panneau masqué.
  comments: { projectId: 'mikuan-spotify' },
};
