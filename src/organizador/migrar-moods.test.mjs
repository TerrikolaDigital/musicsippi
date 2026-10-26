import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, GENEROS, aplicarPlan, formatearSimulacion, planificarMigracion } from './migrar-moods.js';

const e = (ejeId, origen = 'auto', senal = 'patron-titulo') => ({ ejeId, origen, senal, score: 1 });
const cancion = (id, artista, titulo, ejes) => ({ id, artista, titulo, ejes });
const eje = (id, nombre, tipo = 'gusto', extra = {}) => ({ id, nombre, tipo, orden: 1, activo: true, sistema: false, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [], ...extra });

const EJES = [
  eje('favoritos', 'Favoritas', 'gusto', { sistema: true }),
  eje('sin-clasificar', 'Sin clasificar', 'sistema', { sistema: true }),
  eje('tango', 'Tango', 'gusto', { origen: 'descubierto' }),
  eje('alternative-rock', 'Alternative Rock', 'gusto', { origen: 'descubierto' }),
  eje('chill', 'Chill', 'gusto', { origen: 'descubierto' }),
  eje('gym', 'Gym', 'playlist'),
  eje('gimnasio', 'Gimnasio', 'gusto', { origen: 'descubierto' }),
  eje('piano', 'Piano', 'gusto', { origen: 'descubierto' }),
  eje('instrumental', 'Instrumental', 'gusto', { origen: 'descubierto' }),
  eje('acustico', 'Acústico', 'gusto', { origen: 'descubierto' }),
  eje('nueva', 'Nueva', 'playlist'),
  eje('nilda-chiaraviglio', 'Nilda Chiaraviglio', 'playlist'),
];

const TRACKS = [
  cancion('t1', 'Madonna', 'Hung Up', [e('tango')]),
  cancion('t2', 'Kylie Minogue', 'Padam Padam', [e('tango')]),
  cancion('t3', 'Soda Stereo', 'De música ligera', [e('alternative-rock')]),
  cancion('t4', 'Shakira', 'Hips Don’t Lie', [e('alternative-rock')]),
  cancion('t5', 'Bajofondo', 'Pa’ bailar', [e('tango')]),
  cancion('t6', 'Chilled Pig', 'sunflower - piano instrumental', [e('piano'), e('instrumental'), e('chill', 'manual', 'usuario')]),
  cancion('t7', 'Edward Ong', 'Kill Bill - Acoustic Instrumental', [e('acustico'), e('instrumental')]),
  cancion('t8', 'Gym Hero', 'Run', [e('gym', 'auto', 'nombre-lista'), e('gimnasio', 'manual', 'usuario')]),
  cancion('t9', 'Nilda', 'Pista', [e('nilda-chiaraviglio', 'manual', 'usuario'), e('favoritos', 'manual', 'usuario')]),
  cancion('t10', 'Artista Suelto', 'Algo', [e('nueva', 'auto', 'nombre-lista')]),
];

const plan = () => planificarMigracion({ tracks: TRACKS, ejes: EJES });
const de = (p, id) => p.asignaciones.find((a) => a.id === id);

test('la taxonomía son 16 géneros (con Salsa y Reggaetón) y 6 estados, con Instrumental y Acústico separados', () => {
  assert.equal(GENEROS.length, 16);
  assert.equal(ESTADOS.length, 6);
  assert.ok(GENEROS.some((g) => g.nombre === 'Instrumental') && GENEROS.some((g) => g.nombre === 'Acústico'));
  assert.equal(new Set([...GENEROS, ...ESTADOS].map((m) => m.id)).size, 22);
});

test('corrige por artista: Madonna y Kylie salen de Tango, Soda Stereo a Rock en español, Shakira a Latino', () => {
  const p = plan();
  assert.equal(de(p, 't1').genero, 'pop-bailable');
  assert.equal(de(p, 't2').genero, 'pop-bailable');
  assert.equal(de(p, 't3').genero, 'rock-espanol');
  assert.equal(de(p, 't4').genero, 'latino');
  assert.equal(de(p, 't5').genero, 'tango');
  const c = p.correcciones.find((x) => x.artista === 'Madonna');
  assert.deepEqual([c.de, c.a, c.n], ['tango', 'pop-bailable', 1]);
  assert.ok(!p.correcciones.some((x) => x.artista === 'Bajofondo'), 'Bajofondo ya estaba bien en Tango');
});

test('«acoustic» en el título manda sobre Instrumental; piano e instrumental son Instrumental', () => {
  const p = plan();
  assert.equal(de(p, 't7').genero, 'acustico');
  assert.equal(de(p, 't6').genero, 'instrumental');
});

test('un estado sale de la evidencia del usuario y no hace falta género para tenerlo', () => {
  const p = plan();
  assert.deepEqual(de(p, 't6').estados, ['tranquilo']);
  assert.deepEqual(de(p, 't8').estados, ['con-energia']);
  assert.equal(de(p, 't8').genero, null);
});

test('las listas fijas se conservan y no cuentan como «sin mood»', () => {
  const p = plan();
  assert.deepEqual(de(p, 't9').fijos, ['nilda-chiaraviglio']);
  const fijo = p.moods.find((m) => m.id === 'nilda-chiaraviglio');
  assert.equal(fijo.autoRellenar, false);
  assert.equal(fijo.familia, 'fijo');
  assert.ok(p.ejesConservados.includes('nilda-chiaraviglio') && p.ejesConservados.includes('favoritos'));
  assert.equal(p.recuentos.porMood['nilda-chiaraviglio'].n, 1);
});

test('un solo nombre-lista no basta: la canción queda sin mood y los ejes viejos desaparecen', () => {
  const p = plan();
  assert.equal(de(p, 't10').genero, null);
  assert.equal(p.recuentos.sinMood, 1);
  assert.ok(p.ejesEliminados.includes('nueva') && p.ejesEliminados.includes('gym') && p.ejesEliminados.includes('chill'));
  assert.ok(!p.ejesEliminados.includes('tango'), 'tango sigue existiendo como género');
});

test('los estados llevan chipId y familia; los géneros no llevan chipId', () => {
  const p = plan();
  const estados = p.moods.filter((m) => m.familia === 'estado');
  const generos = p.moods.filter((m) => m.familia === 'genero');
  assert.equal(estados.length, 6);
  assert.equal(generos.length, 16);
  assert.ok(estados.every((m) => m.chipId && m.autoRellenar === true));
  assert.ok(generos.every((m) => !m.chipId && m.autoRellenar === true));
  assert.equal(estados.find((m) => m.id === 'de-fiesta').chipId, 'fiesta');
});

test('siembra: De fiesta y Feliz nacen con canciones aunque no haya evidencia previa', () => {
  const tracks = [
    cancion('a', 'Madonna', 'Hung Up', []),
    cancion('b', 'Katy Perry', 'Roar', [e('pop', 'manual', 'usuario')]),
    cancion('c', 'Ana', 'Sunshine day', [e('pop', 'manual', 'usuario')]),
    cancion('d', 'Piano Guy', 'Party piano', [e('piano', 'manual', 'usuario')]),
  ];
  const p = planificarMigracion({ tracks, ejes: [eje('pop', 'Pop'), eje('piano', 'Piano')] });
  assert.ok(de(p, 'a').estados.includes('de-fiesta'));
  assert.equal(de(p, 'a').siembra['de-fiesta'], 'genero');
  assert.ok(de(p, 'b').estados.includes('feliz'));
  assert.ok(de(p, 'c').estados.includes('feliz'), 'título con señal clara');
  assert.deepEqual(de(p, 'd').estados, [], 'la música instrumental no se siembra');
});

test('con tempo (bpm) disponible, De fiesta exige ritmo alto', () => {
  const tracks = [cancion('a', 'Madonna', 'Hung Up', []), cancion('b', 'Kylie Minogue', 'Slow', [])];
  const p = planificarMigracion({ tracks, ejes: [], bpm: { a: 128, b: 90 } });
  assert.ok(de(p, 'a').estados.includes('de-fiesta'));
  assert.ok(!de(p, 'b').estados.includes('de-fiesta'));
});

test('aplicarPlan no muta lo recibido y deja a cada canción con su género, sus estados y sus marcas', () => {
  const copia = JSON.stringify(TRACKS);
  const p = plan();
  const { ejesData, tracks } = aplicarPlan({ ejes: EJES }, TRACKS, p);
  assert.equal(JSON.stringify(TRACKS), copia);
  const ids = (id) => tracks.find((t) => t.id === id).ejes.map((x) => x.ejeId);
  assert.deepEqual(ids('t1'), ['pop-bailable', 'de-fiesta']);
  assert.deepEqual(ids('t6').sort(), ['instrumental', 'tranquilo']);
  assert.deepEqual(ids('t9').sort(), ['favoritos', 'nilda-chiaraviglio']);
  assert.deepEqual(ids('t10'), ['sin-clasificar']);
  // El «chill» manual del usuario sigue siendo manual en Zen.
  assert.equal(tracks.find((t) => t.id === 't6').ejes.find((x) => x.ejeId === 'tranquilo').origen, 'manual');
  const idsEjes = ejesData.ejes.map((x) => x.id);
  assert.equal(new Set(idsEjes).size, idsEjes.length);
  assert.ok(!idsEjes.includes('nueva') && !idsEjes.includes('chill'));
  assert.ok(idsEjes.includes('favoritos') && idsEjes.includes('sin-clasificar') && idsEjes.includes('nilda-chiaraviglio'));
});

test('es idempotente en recuentos: aplicar y volver a planificar no cambia el reparto', () => {
  const p1 = plan();
  const { ejesData, tracks } = aplicarPlan({ ejes: EJES }, TRACKS, p1);
  const p2 = planificarMigracion({ tracks, ejes: ejesData.ejes });
  const cuentas = (p) => Object.fromEntries(Object.entries(p.recuentos.porMood).map(([k, v]) => [k, v.n]));
  assert.equal(p2.recuentos.sinMood, p1.recuentos.sinMood);
  for (const k of ['tango', 'rock-espanol', 'latino']) assert.equal(cuentas(p2)[k], cuentas(p1)[k], k);
});

test('formatearSimulacion imprime los recuentos de Sunny, Party, Instrumental y Acústico', () => {
  const texto = formatearSimulacion(plan()).join('\n');
  for (const nombre of ['Sunny', 'Party', 'Instrumental', 'Acústico', 'Pop bailable']) assert.ok(texto.includes(nombre), nombre);
  assert.match(texto, /Madonna: Tango -> Pop bailable \(1\)/);
});

test('Zen absorbe Concentrado y lofi: ya no existe el estado concentrado', () => {
  assert.ok(!ESTADOS.some((x) => x.id === 'concentrado'));
  const ejes = [...EJES, eje('lofi', 'Lofi', 'gusto'), eje('concentrado', 'Concentrado', 'gusto')];
  const tracks = [
    cancion('l1', 'Lofi Girl', 'Snowman', [e('lofi')]),
    cancion('l2', 'Alguien', 'Algo', [e('concentrado', 'manual', 'usuario')]),
  ];
  const p = planificarMigracion({ tracks, ejes });
  assert.ok(de(p, 'l1').estados.includes('tranquilo'));
  assert.equal(de(p, 'l1').genero, 'instrumental');
  assert.deepEqual(de(p, 'l2').estados, ['tranquilo']);
  assert.ok(p.ejesEliminados.includes('concentrado'));
  assert.equal(de(p, 'l2').manual.includes('tranquilo'), true);
});

test('Bandas sonoras: álbum BSO, compositor de cine o lista Soundtracks del usuario; Einaudi no', () => {
  const tracks = [
    cancion('s1', 'Alguien', 'Tema', [e('soundtracks', 'auto', 'nombre-lista')]),
    cancion('s2', 'Lady Gaga', 'Fuera de la lista', []),
    cancion('s3', 'Ramin Djawadi', 'Light of the Seven', []),
    cancion('s4', 'Ludovico Einaudi', 'Nuvole Bianche', [e('piano')]),
    cancion('s5', 'Otro', 'Cosa', []),
  ];
  const ejes = [...EJES, eje('soundtracks', 'Soundtracks', 'gusto', { origen: 'descubierto' })];
  const musicbrainz = {
    tracks: {
      s2: { artistaMbid: 'x', album: 'The Devil Wears Prada 2: Music from the Motion Picture' },
      s5: { artistaMbid: 'x', album: 'Succession (Music from the HBO Series)' },
    },
    artistas: { x: { generos: [] } },
  };
  const p = planificarMigracion({ tracks, ejes, musicbrainz });
  assert.equal(de(p, 's3').genero, 'bandas-sonoras', 'compositor de cine: también género principal');
  assert.equal(de(p, 's2').genero, 'pop-bailable', 'conserva su género real (ancla)');
  assert.equal(de(p, 's1').genero, null, 'la lista no decide el género');
  assert.equal(de(p, 's5').genero, null);
  for (const id of ['s1', 's2', 's5']) assert.equal(de(p, id).bso, true, id);
  assert.equal(de(p, 's4').genero, 'instrumental');
  assert.equal(de(p, 's4').bso, false);
  assert.ok(p.ejesEliminados.includes('soundtracks'));
  assert.equal(p.recuentos.porMood['bandas-sonoras'].n, 4);
  assert.deepEqual(p.recuentos.bandasSonoras, { total: 4, soloBso: 3, conOtroGenero: 1 });
});

import { esquemaDeEjes, esquemasCompatibles, filtrarCambiosTrasMigracion, musicbrainzDeMovil, puedeFusionarSemilla } from './migrar-moods.js';

test('esquema: la marca o la presencia de `familia` cuentan como migrado', () => {
  assert.equal(esquemaDeEjes([eje('a', 'A')]), 0);
  assert.equal(esquemaDeEjes([eje('a', 'A', 'gusto', { familia: 'genero' })]), 1);
  assert.equal(esquemaDeEjes([eje('a', 'A')], 1), 1);
});

test('esquemas distintos no se sincronizan y el aviso dice qué lado falta', () => {
  assert.deepEqual(esquemasCompatibles(1, 1), { ok: true });
  assert.match(esquemasCompatibles(1, 0).motivo, /PC todavía no/);
  assert.match(esquemasCompatibles(0, 1).motivo, /móvil todavía no/);
  assert.equal(puedeFusionarSemilla(1, 0), false);
  assert.equal(puedeFusionarSemilla(0, 1), true);
});

test('filtrarCambiosTrasMigracion descarta lo que habla de moods y conserva lo demás', () => {
  const r = filtrarCambiosTrasMigracion([{ endpoint: 'ejes' }, { endpoint: 'override' }, { endpoint: 'quitar-track' }, { endpoint: 'asignar' }]);
  assert.deepEqual(r.quedan.map((c) => c.endpoint), ['override', 'quitar-track']);
  assert.equal(r.descartados.length, 2);
});

test('musicbrainzDeMovil junta géneros de MB y álbum por canción', () => {
  const mb = musicbrainzDeMovil({
    tracks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    generos: [{ trackId: 'a', generosMB: ['tango'] }, { trackId: 'b', evidenciaPC: { senal: 'genero-musicbrainz', generos: ['rock'] } }],
    metadata: { tracks: { c: { album: 'X (Original Score)' } } },
  });
  assert.deepEqual(mb.artistas[mb.tracks.a.artistaMbid].generos, ['tango']);
  assert.deepEqual(mb.artistas[mb.tracks.b.artistaMbid].generos, ['rock']);
  assert.equal(mb.tracks.c.album, 'X (Original Score)');
});

const mbDe = (...pares) => pares.reduce((acc, [id, g]) => ({ tracks: { ...acc.tracks, [id]: { artistaMbid: id } }, artistas: { ...acc.artistas, [id]: { generos: g } } }), { tracks: {}, artistas: {} });

test('la señal nombre-lista no cuenta como género: con MusicBrainz, su género real; sin nada, sin género', () => {
  const tracks = [
    cancion('n1', 'Dua Lipa', 'Levitating', [e('tango', 'auto', 'nombre-lista')]),
    cancion('n2', 'Sam Smith', 'Stay With Me', [e('tango', 'auto', 'nombre-lista'), e('pop', 'auto', 'genero-musicbrainz')]),
    cancion('n3', 'Artista X', 'Tema', [e('tango', 'auto', 'nombre-lista')]),
    cancion('n4', 'Artista Y', 'Tema', [e('tango', 'auto', 'nombre-lista')]),
  ];
  const p = planificarMigracion({ tracks, ejes: EJES, musicbrainz: mbDe(['n1', ['dance-pop']], ['n3', ['soul']]) });
  assert.equal(de(p, 'n1').genero, 'pop-bailable');
  assert.notEqual(de(p, 'n2').genero, 'tango');
  assert.equal(de(p, 'n3').genero, 'soul-hip-hop');
  assert.equal(de(p, 'n4').genero, null);
});

test('Tango: nombre-lista nunca basta, el usuario sí manda y los artistas ancla de tango entran solos', () => {
  const tracks = [
    cancion('a1', 'Lady Gaga', 'Poker Face', [e('tango', 'auto', 'nombre-lista')]),
    cancion('a2', 'Otra Persona', 'Cualquiera', [e('tango', 'manual', 'usuario')]),
    cancion('a3', 'Campo', 'Algo', []),
    cancion('a4', 'Astor Piazzolla', 'Libertango', []),
    cancion('a5', 'Gotan Project', 'Santa María', []),
  ];
  const p = planificarMigracion({ tracks, ejes: EJES });
  assert.equal(de(p, 'a1').genero, 'pop-bailable');
  assert.equal(de(p, 'a2').genero, 'tango');
  for (const id of ['a3', 'a4', 'a5']) assert.equal(de(p, id).genero, 'tango', id);
});

test('ia-embeddings solo se conserva en un género si el género real no lo contradice', () => {
  const ia = () => e('tango', 'auto', 'ia-embeddings');
  const tracks = [
    cancion('i1', 'Juanes', 'La camisa', [ia(), ia()]),
    cancion('i2', 'Sin Datos', 'Tema', [ia(), ia()]),
    cancion('i3', 'Otro', 'Tango real', [ia(), ia()]),
    cancion('i4', 'Madonna', 'Hung Up', [ia(), ia()]),
  ];
  const p = planificarMigracion({ tracks, ejes: EJES, musicbrainz: mbDe(['i1', ['latin pop']], ['i3', ['tango']]) });
  assert.notEqual(de(p, 'i1').genero, 'tango'); // MusicBrainz dice latino
  assert.equal(de(p, 'i3').genero, 'tango'); // coincide con el género real
  assert.equal(de(p, 'i2').genero, 'tango'); // sin dato real que lo contradiga
  assert.equal(de(p, 'i4').genero, 'pop-bailable'); // el artista ancla lo contradice
});

test('los ritmos latinos se parten en Salsa, Reggaetón y Latino (resto)', () => {
  const tracks = [
    cancion('l1', 'Celia Cruz', 'La vida es un carnaval', []),
    cancion('l2', 'Bad Bunny', 'Tití me preguntó', []),
    cancion('l3', 'Wisin & Yandel', 'Pam Pam', []),
    cancion('l4', 'Alguien', 'Tema', []),
    cancion('l5', 'Otro', 'Tema', []),
    cancion('l6', 'Shakira', 'Waka Waka', []),
  ];
  const p = planificarMigracion({ tracks, ejes: EJES, musicbrainz: mbDe(['l4', ['timba']], ['l5', ['bachata']]) });
  assert.equal(de(p, 'l1').genero, 'salsa');
  assert.equal(de(p, 'l2').genero, 'reggaeton');
  assert.equal(de(p, 'l3').genero, 'reggaeton');
  assert.equal(de(p, 'l4').genero, 'salsa');
  assert.equal(de(p, 'l5').genero, 'latino');
  assert.equal(de(p, 'l6').genero, 'latino');
});

// Bandas sonoras: mood temático que se suma al género (no exclusivo).
test('Bandas sonoras: Guetta en la playlist Soundtracks es Pop bailable y además Bandas sonoras', () => {
  const tracks = [cancion('g1', 'David Guetta', 'Titanium', [e('dance-pop', 'auto', 'patron-titulo'), e('soundtracks', 'auto', 'nombre-lista')])];
  const p = planificarMigracion({ tracks, ejes: [eje('dance-pop', 'Dance Pop'), eje('soundtracks', 'Soundtracks')] });
  assert.equal(de(p, 'g1').genero, 'pop-bailable');
  assert.equal(de(p, 'g1').bso, true);
  const r = aplicarPlan({ ejes: [] }, tracks, p).tracks[0];
  assert.ok(['bandas-sonoras', 'pop-bailable'].every((id) => r.ejes.some((x) => x.ejeId === id)));
  assert.deepEqual(p.recuentos.bandasSonoras, { total: 1, soloBso: 0, conOtroGenero: 1 });
});

test('Bandas sonoras: Eddie Vedder en el álbum Eat Pray Love OST conserva su género y suma Bandas sonoras', () => {
  const tracks = [cancion('v1', 'Eddie Vedder', 'Longing to Belong', [e('alternative-rock', 'auto', 'patron-titulo')])];
  const musicbrainz = { tracks: { v1: { artistaMbid: 'm', album: 'Eat Pray Love (Original Motion Picture Soundtrack)' } }, artistas: { m: { generos: [] } } };
  const p = planificarMigracion({ tracks, ejes: [eje('alternative-rock', 'Alternative Rock')], musicbrainz });
  assert.equal(de(p, 'v1').genero, 'rock-alternativo');
  assert.equal(de(p, 'v1').bso, true);
  // «OST» suelto cuenta, pero «ost» dentro de otra palabra no.
  const q = planificarMigracion({ tracks: [cancion('x', 'A', 'B', []), cancion('y', 'A', 'B', [])], ejes: [], musicbrainz: { tracks: { x: { artistaMbid: 'm', album: 'Sons OST' }, y: { artistaMbid: 'm', album: 'Greatest Hits' } }, artistas: { m: { generos: [] } } } });
  assert.equal(de(q, 'x').bso, true);
  assert.equal(de(q, 'y').bso, false);
});

test('Bandas sonoras: Ramin Djawadi tiene Bandas sonoras como género principal', () => {
  const tracks = [cancion('r1', 'Ramin Djawadi', 'Light of the Seven', [e('dance')])];
  const p = planificarMigracion({ tracks, ejes: [eje('dance', 'Dance')] });
  assert.equal(de(p, 'r1').genero, 'bandas-sonoras');
  assert.equal(de(p, 'r1').bso, false, 'ya es su género: no se duplica');
  assert.deepEqual(p.recuentos.bandasSonoras, { total: 1, soloBso: 1, conOtroGenero: 0 });
});

test('Power: una sola lista Gym (aunque su id sea otro y llegue con señal débil) basta para estar en Power', () => {
  const ejes = [eje('favoritos', 'Favoritas', 'gusto', { sistema: true }), eje('gym-7k2a', 'Gym', 'gusto'), eje('workout-music-2026-gym-workout-songs-power-music', 'WORKOUT MUSIC 2026', 'playlist')];
  const tracks = [
    cancion('a', 'X', 'Uno', [e('gym-7k2a', 'auto', 'nombre-lista')]),
    cancion('b', 'Y', 'Dos', [e('workout-music-2026-gym-workout-songs-power-music', 'auto', 'nombre-lista')]),
    cancion('c', 'Z', 'Tres', [e('favoritos', 'manual', 'usuario')]),
  ];
  const p = planificarMigracion({ tracks, ejes });
  assert.deepEqual(de(p, 'a').estados, ['con-energia']);
  assert.deepEqual(de(p, 'b').estados, ['con-energia']);
  assert.deepEqual(de(p, 'c').estados, []);
  assert.equal(p.recuentos.porMood['con-energia'].n, 2);
});
