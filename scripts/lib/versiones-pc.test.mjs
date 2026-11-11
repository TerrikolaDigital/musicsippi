import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearVersionesPc, leerRevisiones, elegirVideoDeBusqueda } from './versiones-pc.mjs';
import { REVISION_VERSIONES } from '../../src/data/revisar-versiones.js';

const cancion = (videoId, titulo, artistas, duracion = 200) => ({ videoId, titulo, artistas, duracion, tipo: 'cancion' });
const video = (videoId, titulo, canal, duracion = 200) => ({ videoId, titulo, artistas: [canal], duracion, tipo: 'video' });
const ref = { titulo: 'Highway to Hell', artista: 'AC/DC', duracionS: null };
const original = cancion('orig', 'Highway to Hell', ['AC/DC']);
const cover = video('cover', 'Highway to Hell (AC/DC Cover)', 'Dan Vasc');

function preparar(extra = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'versiones-pc-'));
  const llamadas = { canciones: 0, music: 0, youtube: 0, datos: 0 };
  const contar = (clave, fn) => async (...args) => {
    llamadas[clave] += 1;
    return fn(...args);
  };
  const versiones = crearVersionesPc({
    dataDir,
    buscarCanciones: contar('canciones', extra.buscarCanciones ?? (async () => [original])),
    buscarVideosMusic: contar('music', extra.buscarVideosMusic ?? (async () => [])),
    buscarVideosYoutube: contar('youtube', extra.buscarVideosYoutube ?? (async () => [])),
    datosDeVideo: contar('datos', extra.datosDeVideo ?? (async () => null)),
  });
  const leer = (nombre) => (existsSync(join(dataDir, nombre)) ? JSON.parse(readFileSync(join(dataDir, nombre), 'utf8')) : null);
  return { dataDir, llamadas, versiones, leer, limpiar: () => rmSync(dataDir, { recursive: true, force: true }) };
}

test('candidatos: con una pista fiel de YouTube Music no se busca nada más', async () => {
  const p = preparar();
  assert.deepEqual((await p.versiones.candidatos('q', ref)).map((c) => c.videoId), ['orig']);
  assert.deepEqual(p.llamadas, { canciones: 1, music: 0, youtube: 0, datos: 0 });
  p.limpiar();
});

test('candidatos: sin pista fiel suma los vídeos de Music y, si tampoco, los de YouTube, sin repetir', async () => {
  const p = preparar({
    buscarCanciones: async () => [cancion('otra', 'Back in Black', ['AC/DC'])],
    buscarVideosMusic: async () => [cover],
    buscarVideosYoutube: async () => [cover, video('yt', 'AC/DC - Highway to Hell (Official Video)', 'AC/DC')],
  });
  assert.deepEqual((await p.versiones.candidatos('q', ref)).map((c) => c.videoId), ['otra', 'cover', 'yt']);
  assert.deepEqual(await p.versiones.ordenados('q', ref, []), ['yt', 'cover', 'otra']);
  assert.deepEqual(await p.versiones.ordenados('q', ref, ['yt']), ['cover', 'otra']);
  p.limpiar();
});

test('candidatos: si YouTube Music falla se sigue con la búsqueda de vídeos; si falla todo, el error sale', async () => {
  const sinMusic = preparar({
    buscarCanciones: async () => { throw new Error('music caído'); },
    buscarVideosMusic: async () => { throw new Error('music caído'); },
    buscarVideosYoutube: async () => [video('yt', 'AC/DC - Highway to Hell', 'AC/DC')],
  });
  assert.deepEqual(await sinMusic.versiones.ordenados('q', ref, []), ['yt']);
  sinMusic.limpiar();
  const sinNada = preparar({
    buscarCanciones: async () => { throw new Error('music caído'); },
    buscarVideosYoutube: async () => { throw new Error('innertube caído'); },
  });
  await assert.rejects(() => sinNada.versiones.candidatos('q', ref), /innertube caído/);
  sinNada.limpiar();
});

test('candidatos: sin referencia (canción de fuera sin datos) se respeta el orden y solo se va a YouTube si Music no da nada', async () => {
  const conMusic = preparar({ buscarCanciones: async () => [cover, original] });
  assert.deepEqual(await conMusic.versiones.ordenados('q', null, []), ['cover', 'orig']);
  assert.equal(conMusic.llamadas.youtube, 0);
  conMusic.limpiar();
  const sinMusic = preparar({ buscarCanciones: async () => [], buscarVideosYoutube: async () => [cover] });
  assert.deepEqual(await sinMusic.versiones.ordenados('q', null, []), ['cover']);
  sinMusic.limpiar();
});

test('revisar: cambia el cover guardado por la pista fiel y lo anota en la caché y en las revisiones', async () => {
  const p = preparar();
  writeFileSync(join(p.dataDir, 'cache-youtube.json'), JSON.stringify({ t1: 'cover', t2: 'otro' }));
  const videoId = await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => ref });
  assert.equal(videoId, 'orig');
  assert.deepEqual(p.leer('cache-youtube.json'), { t1: 'orig', t2: 'otro' });
  assert.deepEqual(leerRevisiones(p.dataDir), { t1: { videoId: 'orig', revision: REVISION_VERSIONES } });
  p.limpiar();
});

test('revisar: lo ya revisado no vuelve a buscar ni a leer la referencia', async () => {
  const p = preparar();
  p.versiones.marcarRevisado('t1', 'cover');
  const videoId = await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => assert.fail('no debía pedir la referencia') });
  assert.equal(videoId, 'cover');
  assert.equal(p.llamadas.canciones, 0);
  p.limpiar();
});

test('revisar: una marca de otro vídeo (lo cambió un lote o un descarte) no cuenta como revisado', async () => {
  const p = preparar();
  p.versiones.marcarRevisado('t1', 'viejo');
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => ref }), 'orig');
  p.limpiar();
});

test('revisar: un vídeo ajeno que no sale en la búsqueda se cambia por la canción aunque sea de otro artista', async () => {
  const refPiano = { titulo: 'September - Piano Instrumental', artista: 'Chilled Teddy', duracionS: null };
  const p = preparar({
    buscarCanciones: async () => [cancion('sam', 'September (Piano Instrumental)', ['Sam Ellis'], 150)],
    datosDeVideo: async (id) => video(id, 'Fragrant Autumn Garden with a Little Squirrel | Gentle Celtic Music', 'Melody Tales', 7246),
  });
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'junk', q: 'q', refDe: () => refPiano }), 'sam');
  assert.equal(p.llamadas.datos, 1);
  assert.deepEqual(p.leer('cache-youtube.json'), { t1: 'sam' });
  p.limpiar();
});

test('revisar: si no se pueden pedir los datos del guardado, vale la regla del móvil (sin fiel no se toca)', async () => {
  const p = preparar({
    buscarCanciones: async () => [cancion('sam', 'September (Piano Instrumental)', ['Sam Ellis'], 150)],
    datosDeVideo: async () => { throw new Error('sin red'); },
  });
  const refPiano = { titulo: 'September - Piano Instrumental', artista: 'Chilled Teddy', duracionS: null };
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'junk', q: 'q', refDe: () => refPiano }), 'junk');
  assert.deepEqual(leerRevisiones(p.dataDir), { t1: { videoId: 'junk', revision: REVISION_VERSIONES } });
  p.limpiar();
});

test('revisar: lo añadido a mano y las canciones sin referencia no se tocan', async () => {
  const p = preparar();
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => ({ ...ref, manual: true }) }), 'cover');
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => null }), 'cover');
  assert.equal(p.llamadas.canciones, 0);
  assert.deepEqual(leerRevisiones(p.dataDir), {});
  p.limpiar();
});

test('revisar: los vídeos descartados en este equipo no se proponen', async () => {
  const p = preparar({ buscarCanciones: async () => [original, cancion('orig2', 'Highway to Hell', ['AC/DC'], 209)] });
  assert.equal(await p.versiones.revisarGuardado({ trackId: 't1', videoId: 'cover', q: 'q', refDe: () => ref, vetados: ['orig'] }), 'orig2');
  p.limpiar();
});

test('lote: de los resultados de una búsqueda se queda con el más fiel, no con el primero', () => {
  const resultados = [
    video('karaoke', 'Adele - Easy On Me Karaoke Acoustic Piano Instrumental Cover Lyrics', 'PopUp Karaoke Instrumentals'),
    video('bueno', 'Box of Music - Easy On Me (Piano Instrumental)', 'LINKED'),
  ];
  assert.equal(elegirVideoDeBusqueda(resultados, { titulo: 'Easy On Me (Piano Instrumental)', artista: 'Box of Music' }).videoId, 'bueno');
  assert.equal(elegirVideoDeBusqueda([], { titulo: 'x', artista: 'y' }), null);
});
