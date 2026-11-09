import test from 'node:test';
import assert from 'node:assert/strict';
import { crearFuentes, partesDeArtista, primeraVerificada, verificarUrls } from './imagenesResumen.js';
import { armarResumen } from './resumen.js';

const f = (a, m, d, h = 12) => new Date(a, m, d, h).getTime();

test('partesDeArtista separa &, feat., x, coma, with y ·; un artista solo queda entero', () => {
  assert.deepEqual(partesDeArtista('Sia & Kylie Minogue'), ['Sia', 'Kylie Minogue']);
  assert.deepEqual(partesDeArtista('A feat. B'), ['A', 'B']);
  assert.deepEqual(partesDeArtista('A x B'), ['A', 'B']);
  assert.deepEqual(partesDeArtista('A, B with C'), ['A', 'B', 'C']);
  assert.deepEqual(partesDeArtista('Sean Paul · Dua Lipa'), ['Sean Paul', 'Dua Lipa']);
  assert.deepEqual(partesDeArtista('Dua Lipa'), ['Dua Lipa']);
});

const tracks = [
  { id: 'd1', titulo: 'Dance Alone', artista: 'Sia & Kylie Minogue' },
  { id: 'd2', titulo: 'Dance Alone', artista: 'Sia & Kylie Minogue' },
  { id: 's1', titulo: 'Chandelier', artista: 'Sia' },
];
const meta = { d1: { coverUrl: 'https://x/rota.jpg' }, d2: { coverUrl: 'https://x/otra-version.jpg' }, s1: { coverUrl: 'https://x/chandelier.jpg' } };
const fotos = { sia: 'https://x/sia.jpg' };
const fuentes = crearFuentes({ tracks, metadataDe: (id) => meta[id] ?? {}, fotoDeArtista: (n) => fotos[n.toLowerCase()] ?? null });

test('foto de un dúo sin imagen conjunta: usa la de uno de los dos artistas', () => {
  const lista = fuentes.foto('Sia & Kylie Minogue');
  assert.ok(lista.includes('https://x/sia.jpg'));
  assert.equal(primeraVerificada(lista, new Set(['https://x/sia.jpg'])), 'https://x/sia.jpg');
});

test('portada que falla al cargar: pasa a otra versión de la canción o a la foto del artista, nunca null si hay algo', () => {
  const lista = fuentes.portada(tracks[0]);
  assert.equal(lista[0], 'https://x/rota.jpg');
  assert.equal(primeraVerificada(lista, new Set(['https://x/otra-version.jpg', 'https://x/sia.jpg'])), 'https://x/otra-version.jpg');
  assert.equal(primeraVerificada(lista, new Set(['https://x/sia.jpg'])), 'https://x/sia.jpg');
});

test('verificarUrls solo conserva las que cargan', async () => {
  const ok = await verificarUrls(['https://x/a.jpg', 'https://x/b.jpg', 'sin-url'], async (u) => u.endsWith('a.jpg'));
  assert.deepEqual([...ok], ['https://x/a.jpg']);
});

test('armarResumen con portadas verificadas: si la portada de la más escuchada no carga, pasa a la siguiente; sin imagen no hay artista', () => {
  const hist = [
    ...[1, 2, 3].map((i) => ({ trackId: 'd1', ts: f(2026, 9, 12 + i), duracionS: 200 })),
    { trackId: 's1', ts: f(2026, 9, 16), duracionS: 200 },
  ];
  const verificadas = new Set(['https://x/chandelier.jpg']);
  const res = armarResumen(hist, tracks, {
    desde: f(2026, 9, 12, 0),
    hasta: f(2026, 9, 19, 0),
    portadaDe: (t) => primeraVerificada(t.id === 'd1' ? ['https://x/rota.jpg'] : fuentes.portada(t).filter((u) => u.includes('chandelier')), verificadas),
    fotoDe: (n) => (n === 'Sia' ? 'https://x/sia.jpg' : null),
  });
  assert.equal(res.bucle.trackId, 's1');
  assert.ok(res.candidatasBucle.every((c) => c.trackId !== 'd1'));
  assert.deepEqual(res.topArtistas.map((a) => a.nombre), ['Sia']);
});

test('tiras de portadas: canciones de la hora y del mood, sin repetir imagen y solo con imagen', async () => {
  const { armarDatosTarjeta, soloConImagen } = await import('./datosTarjetas.js');
  const bib = [
    { id: 'a', titulo: 'A', artista: 'X', ejes: [{ ejeId: 'rock' }] },
    { id: 'b', titulo: 'B', artista: 'Y', ejes: [{ ejeId: 'rock' }] },
    { id: 'c', titulo: 'C', artista: 'Z', ejes: [{ ejeId: 'rock' }] },
  ];
  const hist = ['a', 'a', 'b', 'c'].map((trackId, i) => ({ trackId, ts: f(2026, 9, 13 + i, 23), duracionS: 600 }));
  const res = armarResumen(hist, bib, { desde: f(2026, 9, 12, 0), hasta: f(2026, 9, 19, 0), ejes: [{ id: 'rock', nombre: 'Rock' }] });
  assert.equal(res.tracksHora[0].id, 'a');
  assert.equal(res.tracksModo.length, 3);
  const cov = { a: 'https://x/1.jpg', b: 'https://x/1.jpg', c: 'https://x/3.jpg' };
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', { portada: (t) => cov[t.id], foto: () => null });
  assert.deepEqual(urls.collage.hora, ['https://x/1.jpg', 'https://x/3.jpg']);
  const { imagenes } = soloConImagen(datos, { collage: { hora: [{}, null], modo: [] }, candidatas: {}, artistas: [], canciones: [], albumes: [] });
  assert.equal(imagenes.collage.hora.length, 1);
});
