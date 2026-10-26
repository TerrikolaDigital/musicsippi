// src/movil/compartir-salida.js
// Texto que se comparte al pulsar «Compartir» en canciones, álbumes y artistas.
// Frases cercanas y variadas (no «artista, canción y enlace» a secas); si se sabe
// desde qué modo suena, se cuenta. Sin videoId se comparte una búsqueda en YouTube Music.

const BASE = 'https://music.youtube.com';
const FIRMA = '— vía Musicsippi 🌊';

function busqueda(consulta) {
  return `${BASE}/search?${new URLSearchParams({ q: consulta }).toString()}`;
}

const FRASES = {
  cancion: [
    (t, a) => `Llevo un rato con “${t}” de ${a} en bucle y tenía que pasártela 🎧`,
    (t, a) => `Escucha esto: “${t}” de ${a}. Dale volumen 🔊`,
    (t, a) => `“${t}” de ${a} me acaba de alegrar el día. A ver qué te parece ✨`,
    (t, a) => `Te dejo una joya: “${t}”, de ${a} 💎`,
  ],
  album: [
    (t, a) => `Disco recomendado: “${t}” de ${a}. Para escucharlo de principio a fin 💿`,
    (t, a) => `Si tienes un rato, ponte “${t}” de ${a}. No tiene desperdicio 🎶`,
  ],
  artista: [
    (_t, a) => `Tienes que escuchar a ${a}. Últimamente no paro 🎧`,
    (_t, a) => `Descubrimiento que te paso: ${a}. Empieza por sus éxitos y luego me cuentas ✨`,
  ],
};

/**
 * @param {{tipo:'cancion'|'album'|'artista', titulo?:string, artista:string, album?:string, videoId?:string, modo?:string}} datos
 * @param {() => number} [rnd] aleatorio inyectable (tests)
 */
export function textoCompartir({ tipo, titulo, artista, album, videoId, modo }, rnd = Math.random) {
  const frases = FRASES[tipo];
  if (!frases) throw new Error(`tipo desconocido para compartir: ${tipo}`);
  const elegir = frases[Math.floor(rnd() * frases.length) % frases.length];
  let enlace;
  let frase;
  if (tipo === 'cancion') {
    enlace = videoId ? `${BASE}/watch?v=${videoId}` : busqueda(`${artista} ${titulo}`);
    frase = elegir(titulo, artista);
  } else if (tipo === 'album') {
    enlace = busqueda(`${artista} ${album ?? titulo}`);
    frase = elegir(album ?? titulo, artista);
  } else {
    enlace = busqueda(artista);
    frase = elegir(null, artista);
  }
  const contexto = modo && tipo === 'cancion' ? `\nSonaba en mi mood «${modo}».` : '';
  return `${frase}${contexto}\n${enlace}\n${FIRMA}`;
}
