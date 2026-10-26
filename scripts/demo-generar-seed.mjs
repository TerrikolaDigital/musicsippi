/**
 * Genera el seed de datos para el build de DEMO (instalador aparte, sin la
 * biblioteca real) — 6 canciones muy conocidas, una por genero, elegidas
 * porque sus terminos de genero quedaron verificados como mutuamente
 * distintos en el espacio de embeddings (ver docs/estado-demo-sin-tracks.md
 * para el porque: con vocabularios chicos, terminos de genero sueltos sin
 * contexto pueden salir con similitud alta pese a no tener relacion real,
 * p.ej. "grunge" y "vallenato" dieron 0.732 de similitud coseno).
 *
 * Reproduce a mano la MISMA forma de datos que producirian /api/reiniciar
 * (ejes de sistema) + /api/descubrir-modos + /api/confirmar-modos (modos
 * descubiertos ya confirmados) — no corre la app ni el servidor, solo
 * escribe directo los 4 archivos de data/ con esa forma exacta, para no
 * depender de una corrida interactiva del navegador para armar la demo.
 *
 * Uso: node scripts/demo-generar-seed.mjs (desde la raiz del proyecto).
 * Pisa data/ejes.json, data/biblioteca.json, data/favoritos.json y
 * data/historial.json — pensado para correr UNA vez sobre un checkout ya
 * vaciado (biblioteca en 0 tracks), no como parte del pipeline normal.
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { idTrack } from './lib/id-track.mjs';
import { normalizar } from './lib/clasificar.mjs';

// "David Guetta · Sia", NO "David Guetta ft. Sia": la app separa creditos
// multiples por " · " (separarArtistas en App.jsx / separarArtistasCredito en
// clasificar.mjs / separarArtistasParaFusion en importar.mjs) — "ft." no es un
// separador reconocido en NINGUNA de esas tres funciones a proposito (cada una
// lo descarta con un comentario propio, verificado contra la biblioteca real de
// En la biblioteca de prueba, 0 tracks reales usan "ft." en el campo artista, asi que no vale la
// pena tocar ese codigo de produccion ya probado por un caso que solo aparecia
// acá, en datos escritos a mano). Sin " · ", "David Guetta ft. Sia" no
// matcheaba como artista real en la pagina de Explorar/Deezer (ni foto, ni
// "parecidos") — encontrado en vivo probando esta misma demo.
const crudos = [
  { artista: 'Nirvana', titulo: 'Smells Like Teen Spirit' },
  { artista: 'David Guetta · Sia', titulo: 'Titanium' },
  { artista: 'Eminem', titulo: 'Lose Yourself' },
  { artista: 'Ludwig van Beethoven', titulo: 'Fur Elise' },
  { artista: 'Bob Dylan', titulo: 'Blowin in the Wind' },
  { artista: 'B.B. King', titulo: 'The Thrill Is Gone' },
];
const tracks = crudos.map(t => ({ ...t, id: idTrack(t.artista, t.titulo) }));
const porArtista = Object.fromEntries(tracks.map(t => [t.artista, t.id]));

// Resultado real de descubrirModos() sobre estos 6 tracks (verificado con
// demo-discover-test.mjs): Rock absorbio tambien hip-hop y blues (el modelo
// de embeddings los ve mas cercanos de lo esperado con vocabulario chico),
// Electronic/Classical/Folk quedaron limpios cada uno solo.
const modosConfirmados = [
  { nombre: 'Rock', trackIds: [porArtista['Nirvana'], porArtista['Eminem'], porArtista['B.B. King']] },
  { nombre: 'Electronic', trackIds: [porArtista['David Guetta · Sia']] },
  { nombre: 'Classical', trackIds: [porArtista['Ludwig van Beethoven']] },
  { nombre: 'Folk', trackIds: [porArtista['Bob Dylan']] },
];

// ---- ejes.json: 2 ejes de sistema (misma forma que /api/reiniciar) + los 4
// modos descubiertos (misma forma que produce /api/confirmar-modos: origen
// 'descubierto', slug como id, orden siguiendo a los de sistema). ----
function slugificar(nombre) {
  return normalizar(nombre)
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ejesSistema = [
  {
    id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999,
    activo: true, sistema: true, padre: null,
    descripcion: 'Bandeja de entrada. No se puede eliminar. Los tracks que caen aqui esperan asignacion manual, y cada asignacion manual refuerza las anclas del eje elegido.',
    anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
  },
  {
    id: 'favoritos', nombre: 'Favoritas', tipo: 'gusto', orden: 0,
    activo: true, sistema: true, padre: null,
    descripcion: 'Tracks marcados con me gusta desde el reproductor (boton de corazon en la barra). No se clasifica automaticamente y no aparece como opcion en Para clasificar: es un tag independiente del modo, no un modo mas.',
    anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
  },
];

let siguienteOrden = 1;
const idsExistentes = new Set(ejesSistema.map(e => e.id));
const ejesDescubiertos = modosConfirmados.map((modo) => {
  const base = slugificar(modo.nombre) || 'modo';
  let id = base, sufijo = 2;
  while (idsExistentes.has(id)) id = `${base}-${sufijo++}`;
  idsExistentes.add(id);
  return {
    id, nombre: modo.nombre, tipo: 'gusto', orden: siguienteOrden++,
    activo: true, sistema: false, padre: null, descripcion: '',
    origen: 'descubierto', anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
  };
});

const ejes = { ejes: [...ejesSistema, ...ejesDescubiertos] };

// ---- biblioteca.json: cada track asignado a su modo descubierto (misma
// forma que asignarTrack() en /api/confirmar-modos). ----
const ejeIdPorTrackId = new Map();
for (const modo of modosConfirmados) {
  const ejeId = ejesDescubiertos.find(e => e.nombre === modo.nombre).id;
  for (const trackId of modo.trackIds) ejeIdPorTrackId.set(trackId, ejeId);
}

const bibliotecaTracks = tracks.map(t => ({
  id: t.id,
  artista: t.artista,
  titulo: t.titulo,
  fuentes: ['demo'],
  youtubeQuery: `${t.artista} ${t.titulo}`,
  youtubeVideoId: null,
  ejes: [{ ejeId: ejeIdPorTrackId.get(t.id), origen: 'auto', senal: 'descubrimiento', score: 1 }],
}));

// Nirvana como track "favorito" de muestra (ademas de su modo Rock).
const idNirvana = porArtista['Nirvana'];
const trackNirvana = bibliotecaTracks.find(t => t.id === idNirvana);
trackNirvana.ejes.push({ ejeId: 'favoritos', origen: 'manual', senal: 'usuario', score: 1 });

const biblioteca = {
  version: 1,
  generado: new Date().toISOString(),
  totalTracks: bibliotecaTracks.length,
  tracks: bibliotecaTracks,
};

// ---- favoritos.json: Nirvana tambien como artista favorito (heart en su
// pagina de artista), mismo criterio normalizado que favoritos.artistas.includes()
// en src/App.jsx (trim + lowercase). ----
const favoritos = { artistas: ['nirvana'], albumes: [] };

// ---- historial.json: 2 reproducciones recientes de muestra (misma forma
// que agrega POST /api/historial), mas nueva primero. ----
const idGuetta = porArtista['David Guetta · Sia'];
const ahora = Date.now();
const historial = [
  { trackId: idGuetta, ejeId: 'electronic', ejeNombre: 'Electronic', titulo: 'Titanium', artista: 'David Guetta · Sia', ts: ahora - 2 * 60 * 60 * 1000 },
  { trackId: idNirvana, ejeId: 'rock', ejeNombre: 'Rock', titulo: 'Smells Like Teen Spirit', artista: 'Nirvana', ts: ahora - 26 * 60 * 60 * 1000 },
];

writeFileSync('data/ejes.json', JSON.stringify(ejes, null, 2), 'utf8');
writeFileSync('data/biblioteca.json', JSON.stringify(biblioteca, null, 2), 'utf8');
writeFileSync('data/favoritos.json', JSON.stringify(favoritos, null, 2), 'utf8');
writeFileSync('data/historial.json', JSON.stringify(historial, null, 2), 'utf8');
// Marcador leido por GET /api/es-demo (vite.config.js): agrega el paso de
// onboarding avisando que estas canciones son de ejemplo. Solo tiene que
// EXISTIR, el contenido no importa.
writeFileSync('data/es-demo.json', JSON.stringify(true), 'utf8');

console.log('Escrito: ejes.json (', ejes.ejes.length, 'ejes ), biblioteca.json (', biblioteca.tracks.length, 'tracks ), favoritos.json, historial.json, es-demo.json');
console.log('Ejes:', ejes.ejes.map(e => `${e.id} (${e.nombre})`).join(', '));

// ---- Enriquecimiento real (Deezer + MusicBrainz) ----
// Sin esto, "Álbumes" (src/App.jsx) queda vacío: esa vista solo agrupa tracks
// que ya tienen `album` resuelto en metadata-deezer.json/metadata-musicbrainz.json
// (ver albumesBiblioteca en App.jsx) — encontrado en vivo probando esta demo.
// Los 6 tracks son pocos (segundos, no minutos, aun con el limite de 1 req/s
// de MusicBrainz) así que correrlo acá, siempre, es barato. Requiere
// MUSICBRAINZ_CONTACT en .env.local (política de MusicBrainz — no hace falta
// para Deezer, que no exige contacto).
console.log('\nEnriqueciendo con Deezer y MusicBrainz (real, pocos segundos)...');
execFileSync('node', ['scripts/enriquecer-deezer.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/enriquecer-musicbrainz.mjs'], { stdio: 'inherit' });
