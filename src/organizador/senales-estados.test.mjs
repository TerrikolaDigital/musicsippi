import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadosPorRitmo,
  estadosPorEtiquetas,
  etiquetasEfectivas,
  pasoDeUso,
  sumarUso,
  crearIndiceVecinos,
  alimentarEstados,
  aplicarPropuestas,
  estadosAlimentables,
  estadosPorGenero,
} from './senales-estados.js';

const estado = (id, extra = {}) => ({ id, nombre: id, tipo: 'funcional', familia: 'estado', activo: true, autoRellenar: true, ...extra });
const genero = { id: 'pop', nombre: 'Pop', tipo: 'gusto', familia: 'genero', activo: true };
const neutro = { id: 'neutro', nombre: 'Neutro', tipo: 'gusto', familia: 'genero', activo: true };
const ejes = [estado('tranquilo'), estado('con-energia'), estado('de-fiesta'), estado('melancolico'), estado('feliz'), estado('inspirado'), genero, neutro];
const t = (id, ...ids) => ({ id, artista: 'A', titulo: id, ejes: ids.map((ejeId) => ({ ejeId, origen: 'auto', senal: 'x', score: 1 })) });

test('ritmo: bandas de bpm; 0 o ausente no cuenta', () => {
  assert.deepEqual(estadosPorRitmo(128).sort(), ['con-energia', 'de-fiesta']);
  assert.deepEqual(estadosPorRitmo(105), ['de-fiesta']);
  assert.deepEqual(estadosPorRitmo(150), ['con-energia']);
  assert.deepEqual(estadosPorRitmo(70).sort(), ['melancolico', 'tranquilo']);
  assert.deepEqual(estadosPorRitmo(95), []);
  assert.deepEqual(estadosPorRitmo(0), []);
  assert.deepEqual(estadosPorRitmo(undefined), []);
});

test('etiquetas de ánimo de MusicBrainz y prioridad canción > álbum', () => {
  assert.deepEqual(estadosPorEtiquetas(['Happy', 'rock']), ['feliz']);
  assert.deepEqual(estadosPorEtiquetas(['feel-good', 'Uplifting']).sort(), ['feliz', 'inspirado']);
  assert.deepEqual(estadosPorEtiquetas(['rock', 'pop']), []);
  assert.deepEqual(etiquetasEfectivas({ mbCancion: { tags: ['sad'] }, mbAlbum: { tags: ['party'] } }), ['sad']);
  assert.deepEqual(etiquetasEfectivas({ mbCancion: { tags: ['rock'] }, mbAlbum: { tags: ['party'] } }), ['party']);
  assert.deepEqual(etiquetasEfectivas({}), []);
});

test('uso: >70 % suma, <30 % resta, entre medias nada', () => {
  assert.equal(pasoDeUso(0.9), 1);
  assert.equal(pasoDeUso(0.1), -1);
  assert.equal(pasoDeUso(0.5), 0);
  let uso = sumarUso({}, 'a', 'feliz', 0.95);
  uso = sumarUso(uso, 'a', 'feliz', 0.8);
  uso = sumarUso(uso, 'a', 'feliz', 0.4);
  uso = sumarUso(uso, 'a', 'tranquilo', 0.05);
  assert.deepEqual(uso, { a: { feliz: 2, tranquilo: -1 } });
});

test('con una sola señal no entra; con dos distintas sí', () => {
  const tracks = [t('uno', 'pop'), t('dos', 'pop'), t('tres', 'pop')];
  const r = alimentarEstados({
    tracks,
    ejes,
    bpm: { uno: 128, dos: 128, tres: 70 },
    etiquetas: { uno: ['party'], tres: ['sad'] },
  });
  const claves = r.propuestas.map((p) => `${p.trackId}:${p.estadoId}:${p.senales.join('+')}`).sort();
  assert.deepEqual(claves, ['tres:melancolico:ritmo+etiquetas', 'uno:de-fiesta:ritmo+etiquetas']);
  assert.equal(r.porEstado['de-fiesta'].n, 1);
});

test('no cuenta dos veces la misma señal', () => {
  const r = alimentarEstados({ tracks: [t('a', 'pop')], ejes, bpm: { a: 128 } });
  assert.equal(r.propuestas.length, 0);
});

test('parecido + otra señal: 2 de 5 vecinos (o más) ya en el estado', () => {
  const v = (x, y) => ({ vector: [x, y] });
  const tracks = [
    t('n1', 'tango', 'feliz'), t('n2', 'tango', 'feliz'), t('n3', 'tango', 'feliz'), t('n4', 'tango'), t('n5', 'tango'),
    t('c', 'tango'), // candidata cerca del grupo
    t('lejos', 'tango'),
  ];
  const vectores = [
    { trackId: 'n1', ...v(1, 0.05) }, { trackId: 'n2', ...v(1, 0.1) }, { trackId: 'n3', ...v(1, 0.15) },
    { trackId: 'n4', ...v(1, 0.2) }, { trackId: 'n5', ...v(1, 0.25) }, { trackId: 'c', ...v(1, 0.12) },
    { trackId: 'lejos', ...v(0, 1) },
  ];
  // Solo parecido: no basta.
  assert.equal(alimentarEstados({ tracks, ejes, vectores }).propuestas.length, 0);
  // Parecido + etiqueta feliz: entra c, y lejos no.
  const r = alimentarEstados({ tracks, ejes, vectores, etiquetas: { c: ['happy'], lejos: ['happy'] } });
  assert.deepEqual(r.propuestas.map((p) => [p.trackId, p.estadoId, p.senales]), [['c', 'feliz', ['etiquetas', 'parecido']]]);
});

test('uso positivo cuenta como señal; uso negativo la deja fuera aunque coincidan otras', () => {
  const tracks = [t('a', 'neutro'), t('b', 'neutro')];
  const r = alimentarEstados({
    tracks,
    ejes,
    bpm: { a: 70, b: 70 },
    uso: { a: { tranquilo: 1 }, b: { tranquilo: -1 } },
    etiquetas: { b: ['calm'] },
  });
  assert.deepEqual(r.propuestas.map((p) => `${p.trackId}:${p.estadoId}`), ['a:tranquilo']);
  assert.deepEqual(r.propuestas[0].senales, ['ritmo', 'uso']);
});

test('lo quitado a mano no vuelve; lo que ya está no se toca; autoRellenar=false se salta', () => {
  const tracks = [t('a', 'neutro'), t('b', 'neutro', 'tranquilo')];
  const base = { tracks, bpm: { a: 70, b: 70 }, etiquetas: { a: ['calm'], b: ['calm'] } };
  assert.equal(alimentarEstados({ ...base, ejes, exclusiones: { a: ['tranquilo'] } }).propuestas.filter((p) => p.estadoId === 'tranquilo').length, 0);
  const normal = alimentarEstados({ ...base, ejes });
  assert.deepEqual(normal.propuestas.filter((p) => p.estadoId === 'tranquilo').map((p) => p.trackId), ['a']);
  const cerrado = ejes.map((e) => (e.id === 'tranquilo' ? { ...e, autoRellenar: false } : e));
  assert.equal(alimentarEstados({ ...base, ejes: cerrado }).propuestas.filter((p) => p.estadoId === 'tranquilo').length, 0);
  assert.deepEqual(estadosAlimentables(cerrado).map((e) => e.id).includes('tranquilo'), false);
});

test('una canción sin ningún mood se deja para el organizador de géneros', () => {
  const tracks = [{ id: 's', artista: 'A', titulo: 's', ejes: [{ ejeId: 'sin-clasificar' }] }];
  const r = alimentarEstados({ tracks, ejes, bpm: { s: 70 }, etiquetas: { s: ['calm'] } });
  assert.equal(r.propuestas.length, 0);
  assert.equal(r.candidatas, 0);
});

test('aplicarPropuestas añade el eje con la señal y no muta lo recibido', () => {
  const tracks = [t('a', 'pop')];
  const nuevas = aplicarPropuestas(tracks, [{ trackId: 'a', estadoId: 'feliz', senales: ['ritmo', 'uso'] }]);
  assert.deepEqual(nuevas[0].ejes.at(-1), { ejeId: 'feliz', origen: 'auto', senal: 'senales-estado', score: 1, senales: ['ritmo', 'uso'] });
  assert.equal(tracks[0].ejes.length, 1);
});

test('índice de vecinos: orden por coseno y sin la propia canción', () => {
  const idx = crearIndiceVecinos([
    { trackId: 'a', vector: [1, 0] },
    { trackId: 'b', vector: [1, 0.1] },
    { trackId: 'c', vector: [0, 1] },
  ]);
  assert.deepEqual(idx.vecinosDe('a', 2).map((v) => v.id), ['b', 'c']);
  assert.deepEqual(idx.vecinosDe('zzz', 2), []);
});

test('género: mapa documentado; solo no basta, ni junto a nada; con otra señal sí', () => {
  assert.deepEqual(estadosPorGenero(['latino']).sort(), ['de-fiesta', 'feliz']);
  assert.deepEqual(estadosPorGenero(['instrumental']).sort(), ['inspirado', 'tranquilo']);
  assert.deepEqual(estadosPorGenero(['neutro']), []);
  // Blue: tango, folk y acústico lo apoyan (antes ningún género lo apoyaba).
  assert.deepEqual(estadosPorGenero(['tango']), ['melancolico']);
  assert.deepEqual(estadosPorGenero(['acustico']).sort(), ['melancolico', 'tranquilo']);
  const ej = [...ejes, { id: 'latino', nombre: 'Latino', tipo: 'gusto', familia: 'genero', activo: true }, { id: 'rock', nombre: 'Rock', tipo: 'gusto', familia: 'genero', activo: true }];
  const tracks = [t('a', 'latino'), t('b', 'latino'), t('c', 'rock')];
  // Solo género: nada. Solo bpm: nada.
  assert.equal(alimentarEstados({ tracks, ejes: ej }).propuestas.length, 0);
  assert.equal(alimentarEstados({ tracks: [t('d', 'neutro')], ejes: ej, bpm: { d: 130 } }).propuestas.length, 0);
  // Tango lento (bpm <= 80) -> Blue por ritmo + género.
  const ejTango = [...ej, { id: 'tango', nombre: 'Tango', tipo: 'gusto', familia: 'genero', activo: true }];
  assert.deepEqual(alimentarEstados({ tracks: [t('e', 'tango')], ejes: ejTango, bpm: { e: 70 } }).propuestas.map((p) => `${p.estadoId}:${p.senales.join('+')}`), ['melancolico:ritmo+genero']);
  // Género Latino + etiqueta feliz -> Feliz; Latino + bpm 128 -> De fiesta; Rock + bpm 150 -> Con energía.
  const r = alimentarEstados({ tracks, ejes: ej, bpm: { b: 128, c: 150 }, etiquetas: { a: ['happy'] } });
  assert.deepEqual(r.propuestas.map((p) => `${p.trackId}:${p.estadoId}:${p.senales.join('+')}`).sort(), ['a:feliz:etiquetas+genero', 'b:de-fiesta:ritmo+genero', 'c:con-energia:ritmo+genero']);
});

test('uso: el saldo se acumula entre sesiones y cuenta como una señal', () => {
  let uso = {};
  for (const f of [0.9, 0.95, 0.2, 0.8]) uso = sumarUso(uso, 'a', 'feliz', f); // +1 +1 -1 +1
  assert.equal(uso.a.feliz, 2);
  const tracks = [t('a', 'pop')];
  const r = alimentarEstados({ tracks, ejes, etiquetas: { a: ['happy'] }, uso });
  assert.deepEqual(r.propuestas[0].senales, ['etiquetas', 'genero', 'uso']); // Pop apoya Feliz (débil)
});

// --- Palabras para afinar -------------------------------------------------------------------------------

import { palabrasDe, coincidePalabras } from './senales-estados.js';

const lover = estado('lover', { chipId: 'lover', palabras: ['Baladas', 'romántico', 'bachata'] });
const bachata = { id: 'bachata', nombre: 'Bachata', tipo: 'gusto', familia: 'genero', activo: true };
const vacio = (id) => ({ id, artista: 'Z', titulo: id, ejes: [{ ejeId: 'pop', origen: 'manual', senal: 'usuario', score: 1 }] });

test('palabras: sin tildes ni mayúsculas, empieza-palabra y vacías fuera', () => {
  assert.deepEqual(palabrasDe({ palabras: ['Romántico', 'romantico', 'a', ' '] }), ['romantico']);
  assert.ok(coincidePalabras(['romantic'], 'Noche Romántica'));
  assert.ok(coincidePalabras(['rock'], 'Hard Rock'));
  assert.ok(!coincidePalabras(['rock'], 'Crock'));
  assert.ok(!coincidePalabras([], 'algo'));
});

test('un estado con palabras es alimentable aunque no sea de los seis (chip o palabras)', () => {
  assert.deepEqual(estadosAlimentables([lover, estado('otro'), estado('suelto', { palabras: ['x1'] })]).map((e) => e.id), ['lover', 'suelto']);
});

test('palabras: género (MusicBrainz/Deezer) + título, artista o álbum son dos señales y entra', () => {
  const tracks = [
    { id: 'a', artista: 'Aventura', titulo: 'Amor eterno', ejes: [{ ejeId: 'pop', origen: 'manual', senal: 'usuario', score: 1 }] },
    vacio('b'),
    vacio('c'),
  ];
  const r = alimentarEstados({
    tracks,
    ejes: [lover, genero],
    generos: { a: ['Bachata'], b: ['Bachata'] },
    albumes: { c: 'Baladas de siempre' },
  });
  assert.deepEqual(r.propuestas, [], 'un solo tipo de coincidencia no basta');

  const r2 = alimentarEstados({
    tracks: [{ ...tracks[0], titulo: 'Romántico' }, tracks[1], tracks[2]],
    ejes: [lover, genero],
    generos: { a: ['Bachata'], b: ['Bachata'] },
    albumes: { c: 'Baladas de siempre' },
  });
  assert.deepEqual(r2.propuestas, [{ trackId: 'a', estadoId: 'lover', senales: ['palabras-genero', 'palabras-texto'] }]);
});

test('palabras + otra señal (uso) entra; el nombre de su mood de género también cuenta como género', () => {
  const tracks = [{ id: 'a', artista: 'X', titulo: 'Y', ejes: [{ ejeId: 'bachata', origen: 'auto', senal: 'x', score: 1 }] }, { id: 'b', artista: 'X', titulo: 'Baladas', ejes: [{ ejeId: 'pop', origen: 'manual', senal: 'usuario', score: 1 }] }];
  const r = alimentarEstados({ tracks, ejes: [lover, genero, bachata], uso: { b: { lover: 1 } } });
  assert.deepEqual(r.propuestas.map((p) => [p.trackId, p.senales]), [['b', ['uso', 'palabras-texto']]]);
});

test('palabras: respeta exclusiones y el saldo de uso negativo', () => {
  const tracks = [{ id: 'a', artista: 'X', titulo: 'Romántico', ejes: [{ ejeId: 'bachata', origen: 'auto', senal: 'x', score: 1 }] }];
  const base = { tracks, ejes: [lover, genero, bachata] };
  assert.equal(alimentarEstados(base).propuestas.length, 1);
  assert.equal(alimentarEstados({ ...base, exclusiones: { a: ['lover'] } }).propuestas.length, 0);
  assert.equal(alimentarEstados({ ...base, uso: { a: { lover: -1 } } }).propuestas.length, 0);
});

// --- R2: compatibilidad estado x género -----------------------------------------------------------------

test('R2: un veto duro del género impide el estado aunque coincidan todas las señales', () => {
  const dance = { id: 'pop-bailable', nombre: 'Pop bailable', tipo: 'gusto', familia: 'genero', activo: true };
  const tracks = [t('a', 'pop-bailable'), t('b', 'neutro')];
  const r = alimentarEstados({ tracks, ejes: [...ejes, dance], bpm: { a: 70, b: 70 }, etiquetas: { a: ['calm'], b: ['calm'] }, uso: { a: { tranquilo: 1 }, b: { tranquilo: 1 } } });
  assert.deepEqual(r.propuestas.filter((p) => p.estadoId === 'tranquilo').map((p) => p.trackId), ['b']);
});

test('R2: un veto blando (Zen con Pop) pide una señal más', () => {
  const tracks = [t('a', 'pop'), t('b', 'pop')];
  const base = { tracks, ejes, bpm: { a: 70, b: 70 }, etiquetas: { a: ['calm'], b: ['calm'] } };
  assert.equal(alimentarEstados(base).propuestas.filter((p) => p.estadoId === 'tranquilo').length, 0, 'ritmo + etiquetas no bastan con Pop');
  const con = alimentarEstados({ ...base, uso: { a: { tranquilo: 1 } } }).propuestas.filter((p) => p.estadoId === 'tranquilo');
  assert.deepEqual(con.map((p) => p.trackId), ['a']);
});
