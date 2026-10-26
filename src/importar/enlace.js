// Del texto que pega o comparte el usuario a {origen, id} de una playlist.
// Puro (sin red): los enlaces cortos se resuelven en leer.js.
const RE_URL = /https?:\/\/[^\s<>"']+/i;
const RE_URI_SPOTIFY = /spotify:playlist:[A-Za-z0-9]+/;
const PUNTUACION_FINAL = /[).,;:!?»”’]+$/;
const HOSTS_CORTOS = new Set(['spotify.link', 'spotify.app.link', 'deezer.page.link', 'dzr.page.link', 'link.deezer.com']);

export function extraerUrl(texto) {
  const s = String(texto ?? '');
  const url = RE_URL.exec(s);
  if (url) return url[0].replace(PUNTUACION_FINAL, '');
  const uri = RE_URI_SPOTIFY.exec(s);
  return uri ? uri[0] : null;
}

function analizar(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function esEnlaceCorto(url) {
  const u = analizar(url);
  return !!u && HOSTS_CORTOS.has(u.hostname.toLowerCase());
}

export function detectarOrigen(url) {
  if (!url) return null;
  const uri = /^spotify:playlist:([A-Za-z0-9]{10,})$/.exec(url);
  if (uri) return { origen: 'spotify', id: uri[1] };
  const u = analizar(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');

  if (host === 'open.spotify.com') {
    const m = /\/playlist\/([A-Za-z0-9]{10,})/.exec(u.pathname);
    return m ? { origen: 'spotify', id: m[1] } : null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const lista = u.searchParams.get('list');
    // RD… son mixes automáticos de YouTube, no playlists de nadie.
    if (!lista || lista.startsWith('RD')) return null;
    return { origen: 'youtube', id: lista };
  }
  if (host === 'deezer.com') {
    const m = /\/playlist\/(\d+)/.exec(u.pathname);
    return m ? { origen: 'deezer', id: m[1] } : null;
  }
  if (host === 'music.apple.com') {
    const m = /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album)\/[^/]+\/[^/]+/i.exec(u.pathname);
    return m ? { origen: 'apple', id: u.href } : null;
  }
  if (/^music\.amazon\./.test(host)) return { origen: 'amazon', id: u.href };
  return null;
}
