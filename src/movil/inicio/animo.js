// src/movil/inicio/animo.js
// «¿Cómo te sientes?»: cada ánimo es un estado (mood con `chipId` igual al id del ánimo). Si los datos
// aún no se han migrado y ningún mood lo declara, se asocia por palabras clave del nombre (Chill,
// Dance, Focus…). Si ningún mood encaja, se mezcla por similitud a partir de canciones cuyos géneros
// sí encajan. Todo puro.
import { barajarSeparandoArtistas } from '../barajar.js';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { conTopePorArtista, inicioDelDia, masParecidas, rngDeSemilla, sinTildes, ultimaVezPorTrack } from './comun.js';

export const ANIMOS = [
  {
    id: 'tranquilo',
    emoji: '😌',
    nombre: 'Zen',
    frase: 'Calma y paz interior',
    color: '#4cd9c6',
    palabras: ['chill', 'lounge', 'ambient', 'relax', 'calm', 'calma', 'sleep', 'acoustic', 'acustic', 'soft', 'zen', 'downtempo', 'tranquil', 'bossa', 'new age', 'focus', 'study', 'estudi', 'concentr', 'trabajo', 'deep work', 'lofi', 'lo-fi', 'piano', 'classical', 'clasica'],
  },
  {
    id: 'energia',
    emoji: '⚡',
    nombre: 'Power',
    frase: 'Energía para moverte',
    color: '#ff8a3d',
    palabras: ['dance', 'edm', 'workout', 'gym', 'energ', 'power', 'pump', 'hype', 'running', 'cardio', 'electro', 'house', 'techno', 'trance', 'hard', 'metal', 'punk', 'drum'],
  },
  {
    id: 'melancolico',
    emoji: '💔',
    nombre: 'Blue',
    frase: 'Melancolía e introspección',
    color: '#7c8cff',
    palabras: ['melanchol', 'melancol', 'sad', 'triste', 'blues', 'heartbreak', 'nostalg', 'emo', 'rain', 'lluvia', 'soledad', 'balada', 'ballad', 'dark', 'slowcore', 'indie folk'],
  },
  {
    id: 'fiesta',
    emoji: '🎉',
    nombre: 'Party',
    frase: 'Fiesta y baile',
    color: '#ff4d8d',
    palabras: ['party', 'fiesta', 'club', 'reggaeton', 'latin', 'perreo', 'baile', 'disco', 'salsa', 'bachata', 'dance', 'urbano', 'trap', 'hip hop', 'hip-hop', 'rap'],
  },
  {
    id: 'feliz',
    emoji: '☀️',
    nombre: 'Sunny',
    frase: 'Buen rollo y alegría',
    color: '#ffc857',
    palabras: ['happy', 'feliz', 'sun', 'summer', 'verano', 'good vibes', 'upbeat', 'feel good', 'positive', 'joy', 'funk', 'pop', 'reggae', 'surf', 'tropical'],
  },
  {
    id: 'inspirado',
    emoji: '✨',
    nombre: 'Dream',
    frase: 'Imaginación e inspiración',
    color: '#5fd0ff',
    palabras: ['inspir', 'creativ', 'sueno', 'idea', 'imagin'],
  },
];

export const animoPorId = (id) => ANIMOS.find((a) => a.id === id) ?? null;

/** ¿Cuántas palabras clave del ánimo aparecen en el texto? (sin tildes ni mayúsculas) */
export function coincidencias(animo, texto) {
  const t = sinTildes(texto);
  return animo.palabras.reduce((n, p) => (t.includes(sinTildes(p)) ? n + 1 : n), 0);
}

const esMoodActivo = (e) => e && !e.sistema && e.activo !== false;
const esModoReal = (e) => e && !e.sistema && e.activo !== false && e.tipo !== 'playlist';

/**
 * Modos del usuario que encajan con el ánimo, los más afines primero (a igualdad, los más
 * grandes). Solo modos con canciones.
 */
export function modosParaAnimo(animo, ejes, conteos) {
  const declarados = (ejes ?? [])
    .filter((e) => e?.chipId === animo.id && esMoodActivo(e) && (conteos?.get?.(e.id) ?? 0) > 0)
    .sort((a, b) => (conteos?.get?.(b.id) ?? 0) - (conteos?.get?.(a.id) ?? 0));
  if (declarados.length) return declarados;
  return (ejes ?? [])
    .filter(esModoReal)
    .map((e) => ({ e, n: coincidencias(animo, `${e.nombre ?? ''} ${e.id ?? ''}`), c: conteos?.get?.(e.id) ?? 0 }))
    .filter((x) => x.n > 0 && x.c > 0)
    .sort((a, b) => b.n - a.n || b.c - a.c)
    .map((x) => x.e);
}

/** Canciones cuyos modos (incluidos los automáticos de género) encajan por palabras clave. */
export function semillasPorGenero(animo, tracks, ejes) {
  const ids = new Set(
    (ejes ?? [])
      .filter((e) => e && !e.sistema && (e.chipId === animo.id || coincidencias(animo, `${e.nombre ?? ''} ${e.id ?? ''}`) > 0))
      .map((e) => e.id),
  );
  if (ids.size === 0) return [];
  return (tracks ?? []).filter((t) => (t.ejes ?? []).some((x) => ids.has(x.ejeId)));
}

const MAX_LISTA = 50;
const MIN_SEMILLAS = 3;

/**
 * Lista para el ánimo: { lista, origen: 'modos'|'similitud' } o null si no hay forma.
 * Barajada con memoria (lo que no suena hace tiempo, antes) y sin dos del mismo artista seguidas.
 */
export function resolverAnimo(animo, { tracks: todas, ejes, conteos, vectores = [], historial = [], ahora = Date.now(), rng = null, marcas = [] }) {
  const tracks = filtrarNoMeGusta(todas, marcas);
  const azar = rng ?? rngDeSemilla(`${animo.id}:${inicioDelDia(ahora)}:${Math.floor(ahora / 60000)}`);
  const ultima = ultimaVezPorTrack(historial, tracks);
  const baraja = (lista) => barajarSeparandoArtistas(lista, ultima, ahora, azar).slice(0, MAX_LISTA);

  const modos = modosParaAnimo(animo, ejes, conteos);
  if (modos.length) {
    const ids = new Set(modos.map((m) => m.id));
    const delModo = (tracks ?? []).filter((t) => (t.ejes ?? []).some((x) => ids.has(x.ejeId)));
    if (delModo.length) return { lista: baraja(delModo), origen: 'modos', modos };
  }
  const semillas = semillasPorGenero(animo, tracks, ejes);
  if (semillas.length < MIN_SEMILLAS) return null;
  const parecidas = masParecidas(semillas, tracks, vectores);
  const extra = conTopePorArtista(parecidas, 30, 2);
  return { lista: baraja([...semillas.slice(0, 20), ...extra]), origen: 'similitud', modos: [] };
}

/** ¿Tiene sentido enseñar este ánimo? (hay modos que encajan o canciones de esos géneros). */
export function animoDisponible(animo, { tracks, ejes, conteos }) {
  if (modosParaAnimo(animo, ejes, conteos).length) return true;
  return semillasPorGenero(animo, tracks, ejes).length >= MIN_SEMILLAS;
}

/** Nombre del origen mientras suena: «Ánimo: Zen». */
export const etiquetaAnimo = (animo) => `Ánimo: ${animo.nombre}`;
