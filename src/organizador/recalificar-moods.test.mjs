import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accionesDeJournal, formatearRecalificacion, generoDominanteMB, recalificarMoods } from './recalificar-moods.js';
import { crearIndiceVecinos } from './senales-estados.js';

const ej = (ejeId, origen = 'auto', senal = 'migracion-moods') => ({ ejeId, origen, senal, score: 1 });
const lista = (ejeId) => ej(ejeId, 'manual', 'usuario'); // como la dejó la migración
const pista = (id, artista, titulo, ejes) => ({ id, artista, titulo, ejes });
const EJES = [{ id: 'nilda-chiaraviglio', nombre: 'Nilda', familia: 'fijo' }];
const antes = (id, ...ids) => ({ id, ejes: ids.map((x) => ej(x, 'manual', 'usuario')) }); // pista de la copia previa
const copia = (...tracks) => ({ tracks, ejes: [{ id: 'chill', nombre: 'Chill' }, { id: 'gym', nombre: 'Gym' }, { id: 'melancholia', nombre: 'Melancholia' }, { id: 'rock', nombre: 'Rock' }] });
const ids = (t) => t.ejes.map((x) => x.ejeId);
const de = (res, id) => res.tracks.find((t) => t.id === id);
const mb = (artista, generos) => ({ tracks: { [`mb-${artista}`]: { artistaMbid: artista } }, artistas: { [artista]: { generos } } });

test('R1: lo heredado de una lista pasa a origen lista (peso 1,5) y lo que hizo el usuario se queda manual', () => {
  const tracks = [pista('a', 'Alguien', 'Suave', [ej('instrumental'), lista('tranquilo')]), pista('b', 'Otro', 'Nada', [ej('instrumental'), lista('tranquilo')])];
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'chill')) });
  const z = de(r, 'a').ejes.find((x) => x.ejeId === 'tranquilo');
  assert.deepEqual([z.origen, z.senal, z.score], ['lista', 'lista-importada', 1.5]);
  assert.equal(de(r, 'b').ejes.find((x) => x.ejeId === 'tranquilo').origen, 'manual', 'b no estaba en la lista: lo puso el usuario');
  assert.equal(r.plan.resumen.aLista, 1);
});

test('sin copia previa nada se considera heredado: todo lo manual se respeta y se avisa', () => {
  const tracks = [pista('a', 'Alguien', 'Suave', [ej('pop-bailable'), lista('tranquilo')])];
  const r = recalificarMoods({ tracks, ejes: EJES });
  assert.deepEqual(ids(de(r, 'a')), ['pop-bailable', 'tranquilo']);
  assert.equal(r.plan.avisos.length, 1);
});

test('R2 dura: Zen con Pop bailable sale aunque venga de una lista; lo del usuario se queda', () => {
  const tracks = [
    pista('a', 'Alguien', 'Algo', [ej('pop-bailable'), lista('tranquilo')]),
    pista('b', 'Otro', 'Algo', [ej('pop-bailable'), lista('tranquilo')]),
  ];
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'chill')), accionesUsuario: {} });
  assert.deepEqual(ids(de(r, 'a')), ['pop-bailable']);
  assert.deepEqual(ids(de(r, 'b')), ['pop-bailable', 'tranquilo']);
  assert.deepEqual(r.plan.cambios[0].sale, [{ ejeId: 'tranquilo', motivo: 'veto-duro' }]);
  const r2 = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'chill')), accionesUsuario: { a: ['tranquilo'] } });
  assert.ok(ids(de(r2, 'a')).includes('tranquilo'), 'una acción real posterior (journal) siempre se respeta');
});

test('R2 blanda: Zen con Pop de una lista sale salvo que el título lo apoye', () => {
  const tracks = [pista('a', 'X', 'Algo', [ej('pop'), lista('tranquilo')]), pista('b', 'Y', 'Piano nights', [ej('pop'), lista('tranquilo')]), pista('c', 'Z', 'Algo', [ej('pop'), ej('tranquilo', 'auto', 'patron-titulo')])];
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'chill'), antes('b', 'chill')) });
  assert.ok(!ids(de(r, 'a')).includes('tranquilo'));
  assert.ok(ids(de(r, 'b')).includes('tranquilo'));
  assert.ok(ids(de(r, 'c')).includes('tranquilo'), 'lo automático no se quita por un veto blando');
});

test('R3: la lista específica (Blue) manda y se corrige el género del artista; con Chill manda el género', () => {
  const tracks = [pista('a', 'Dua Lipa', 'These Walls', [ej('pop-bailable'), lista('melancolico')]), pista('b', 'Raro', 'Algo', [ej('electronica'), lista('melancolico')])];
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'melancholia'), antes('b', 'melancholia')) });
  assert.deepEqual(ids(de(r, 'a')).sort(), ['melancolico', 'pop']);
  assert.deepEqual(ids(de(r, 'b')).sort(), ['melancolico', 'pop'], 'sin otra fuente, el género baja a Pop');
  assert.deepEqual(r.plan.cambios[0].genero, { de: 'pop-bailable', a: 'pop' });
});

test('R4: Party sembrada por género sale si el género corregido ya no es de fiesta', () => {
  const tracks = [pista('a', 'Billie Eilish', 'lovely', [ej('pop-bailable'), ej('de-fiesta')]), pista('b', 'Kylie Minogue', 'Padam', [ej('pop-bailable'), ej('de-fiesta')])];
  const r = recalificarMoods({ tracks, ejes: EJES });
  assert.deepEqual(ids(de(r, 'a')).sort(), ['pop']);
  assert.deepEqual(ids(de(r, 'b')), ['pop-bailable', 'de-fiesta']);
  const estricta = recalificarMoods({ tracks: [pista('c', 'Desconocido', 'Algo', [ej('pop-bailable'), ej('de-fiesta')])], ejes: EJES, fiestaEstricta: true });
  assert.ok(!ids(de(estricta, 'c')).includes('de-fiesta'), 'en modo estricto una sola señal no basta');
});

test('R5: etiqueta dominante de MusicBrainz (>= 34 %), pop y rock antes que dance en empates', () => {
  assert.equal(generoDominanteMB({ pop: 1, 'pop-bailable': 1 }), 'pop');
  assert.equal(generoDominanteMB({ 'pop-bailable': 3, pop: 1, rock: 1, soul: 1 }), 'pop-bailable');
  assert.equal(generoDominanteMB({ a: 1, b: 1, c: 1, d: 1 }), null, '25 % no domina');
  const musicbrainz = { tracks: { a: { artistaMbid: 'm1' } }, artistas: { m1: { generos: ['dance-pop', 'pop', 'synth-pop'] } } };
  const r = recalificarMoods({ tracks: [pista('a', 'Desconocida', 'Algo', [ej('de-fiesta')])], ejes: EJES, musicbrainz });
  assert.ok(ids(de(r, 'a')).includes('pop-bailable'), '2 de 3 etiquetas son pop bailable');
  const empate = { tracks: { a: { artistaMbid: 'm1' } }, artistas: { m1: { generos: ['dance-pop', 'pop'] } } };
  const r2 = recalificarMoods({ tracks: [pista('a', 'Desconocida', 'Algo', [ej('de-fiesta')])], ejes: EJES, musicbrainz: empate });
  assert.ok(ids(de(r2, 'a')).includes('pop'));
});

test('R6: ancla/conocimiento corrige, un artista partido se unifica por mayoría y la herencia rellena huecos', () => {
  const tracks = [
    pista('k', 'Katy Perry', 'Part Of Me', [ej('rock-alternativo')]),
    pista('p1', 'Grupo Raro', 'Uno', [ej('rock')]),
    pista('p2', 'Grupo Raro', 'Dos', [ej('rock')]),
    pista('p3', 'Grupo Raro', 'Tres', [ej('rock-alternativo')]),
    pista('h1', 'Cantante X', 'Uno', [ej('soul-hip-hop')]),
    pista('h2', 'Cantante X', 'Dos', [ej('soul-hip-hop')]),
    pista('h3', 'Cantante X', 'Tres', [ej('de-fiesta')]),
  ];
  const r = recalificarMoods({ tracks, ejes: EJES });
  assert.ok(ids(de(r, 'k')).includes('pop'));
  assert.ok(ids(de(r, 'p3')).includes('rock'), '2 de 3 = 67 %');
  assert.ok(ids(de(r, 'h3')).includes('soul-hip-hop'));
});

test('R8: Bandas sonoras sale si entró por el nombre de una lista y no hay álbum, compositor ni lista fija', () => {
  const viejo = (id, senal, origen = 'auto') => ({ id, ejes: [{ ejeId: 'soundtracks', origen, senal, score: 1 }] });
  const tracks = [
    pista('a', 'Karol G', 'Papasito', [ej('reggaeton'), ej('bandas-sonoras')]),
    pista('b', 'Alguien', 'Tema', [ej('pop'), ej('bandas-sonoras')]),
    pista('c', 'Otro', 'Tema', [ej('pop'), ej('bandas-sonoras')]),
    pista('d', 'Alguien', 'Mi canción', [ej('pop'), lista('bandas-sonoras')]),
  ];
  const musicbrainz = { tracks: { b: { artistaMbid: 'x', album: 'The Show (Original Series Soundtrack)' } }, artistas: {} };
  const r = recalificarMoods({
    tracks,
    ejes: EJES,
    musicbrainz,
    copiaPrevia: copia(viejo('a', 'nombre-lista'), viejo('b', 'nombre-lista'), viejo('c', 'ia-embeddings'), { id: 'd', ejes: [{ ejeId: 'soundtracks', origen: 'manual', senal: 'usuario', score: 1 }] }),
  });
  assert.ok(!ids(de(r, 'a')).includes('bandas-sonoras'));
  assert.ok(ids(de(r, 'b')).includes('bandas-sonoras'), 'el álbum lo prueba');
  assert.ok(!ids(de(r, 'c')).includes('bandas-sonoras'));
  assert.ok(ids(de(r, 'd')).includes('bandas-sonoras'), 'la lista Soundtracks del usuario vale');
  assert.equal(r.plan.resumen.porMood['bandas-sonoras'].salen, 2);
});

test('sin género en una lista de entrenar: Electrónica solo si >= 3 de 5 vecinos (coseno >= 0,6) lo son', () => {
  const v = (x) => ({ vector: Float32Array.from(x) });
  const tracks = [
    pista('g', 'ELEX', 'Run', [lista('con-energia')]),
    pista('e1', 'A', 'a', [ej('electronica')]),
    pista('e2', 'B', 'b', [ej('electronica')]),
    pista('e3', 'C', 'c', [ej('electronica')]),
    pista('r1', 'D', 'd', [ej('rock')]),
    pista('lejos', 'F', 'f', [lista('con-energia')]),
  ];
  const vecinos = crearIndiceVecinos([
    { trackId: 'g', ...v([1, 0.1, 0]) }, { trackId: 'e1', ...v([1, 0.2, 0]) }, { trackId: 'e2', ...v([1, 0, 0.1]) }, { trackId: 'e3', ...v([0.9, 0.1, 0]) },
    { trackId: 'r1', ...v([0.8, 0, 0.1]) }, { trackId: 'lejos', ...v([0, 0, 1]) },
  ]);
  const r = recalificarMoods({ tracks, ejes: EJES, vecinos, copiaPrevia: copia(antes('g', 'gym'), antes('lejos', 'gym')) });
  assert.ok(ids(de(r, 'g')).includes('electronica'));
  assert.ok(!ids(de(r, 'lejos')).includes('electronica'), 'sin vecinos de Electrónica no se asigna por estar en la lista');
  assert.equal(recalificarMoods({ tracks, ejes: EJES }).tracks.find((t) => t.id === 'g').ejes.some((x) => x.ejeId === 'electronica'), false, 'sin vectores no hay proxy');
});

test('canción que se queda sin ningún mood vuelve a «sin clasificar»; el resto de ejes y favoritos no se tocan', () => {
  const tracks = [pista('a', 'Alguien', 'Algo', [ej('favoritos', 'manual', 'usuario'), ej('pop-bailable'), lista('tranquilo')])];
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('a', 'chill')) });
  assert.ok(ids(de(r, 'a')).includes('favoritos'));
  const solo = recalificarMoods({ tracks: [pista('s', 'Alguien', 'Algo', [lista('tranquilo'), ej('electronica')])], ejes: EJES, copiaPrevia: copia(antes('s', 'chill')) });
  assert.ok(ids(de(solo, 's')).includes('electronica'));
  const sinNada = recalificarMoods({ tracks: [pista('s', 'Alguien', 'Algo', [ej('de-fiesta'), ej('pop')])], ejes: EJES });
  assert.ok(!ids(de(sinNada, 's')).includes('sin-clasificar'));
});

test('es idempotente: aplicar el resultado otra vez no cambia nada', () => {
  const tracks = [
    pista('a', 'Billie Eilish', 'lovely', [ej('pop-bailable'), ej('de-fiesta'), lista('tranquilo')]),
    pista('b', 'Dua Lipa', 'These Walls', [ej('pop-bailable'), lista('melancolico')]),
    pista('c', 'Karol G', 'Papasito', [ej('reggaeton'), ej('bandas-sonoras')]),
  ];
  const cp = copia(antes('a', 'chill'), antes('b', 'melancholia'), { id: 'c', ejes: [{ ejeId: 'soundtracks', origen: 'auto', senal: 'nombre-lista', score: 1 }] });
  const r1 = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: cp });
  assert.ok(r1.plan.cambios.length > 0);
  const r2 = recalificarMoods({ tracks: r1.tracks, ejes: EJES, copiaPrevia: cp });
  assert.equal(r2.plan.cambios.length, 0);
  assert.equal(r2.plan.resumen.aLista, 0);
  assert.deepEqual(r2.tracks, r1.tracks);
});

test('no muta lo recibido y la tabla suma antes + entran - salen = después', () => {
  const tracks = [pista('a', 'Billie Eilish', 'lovely', [ej('pop-bailable'), ej('de-fiesta')]), pista('b', 'Sam', 'x', [ej('pop-bailable'), lista('tranquilo')])];
  const foto = JSON.stringify(tracks);
  const r = recalificarMoods({ tracks, ejes: EJES, copiaPrevia: copia(antes('b', 'chill')) });
  assert.equal(JSON.stringify(tracks), foto);
  for (const m of Object.values(r.plan.resumen.porMood)) assert.equal(m.antes + m.entran - m.salen, m.despues, m.nombre);
  assert.ok(formatearRecalificacion(r.plan).some((l) => l.includes('Zen')));
});

test('accionesDeJournal recoge solo asignar y quitar-modo', () => {
  const j = accionesDeJournal([
    { endpoint: 'asignar', cuerpo: { trackId: 't1', ejeId: 'tranquilo' } },
    { endpoint: 'quitar-modo', cuerpo: { trackId: 't1', ejeId: 'pop' } },
    { endpoint: 'favorito', cuerpo: { nombre: 'X' } },
  ]);
  assert.deepEqual(j, { t1: ['tranquilo', 'pop'] });
});
