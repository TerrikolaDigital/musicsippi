import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contarEvidencia, agruparTerminos, calcularMasaMinima, filtrarPorMasa, nombrarModo, extraerPatronTitulo, coincideNombreExacto, descubrirModos } from './descubrir-modos.mjs';

test('contarEvidencia cuenta cada termino y normaliza sinonimos', () => {
  const tracks = [
    { id: 't1', generos: ['phonk'] },
    { id: 't2', generos: ['drift phonk'] },
    { id: 't3', generos: ['hip-hop'] },
  ];
  const sinonimos = { 'hip-hop': 'hip hop' };
  const evidencia = contarEvidencia(tracks, sinonimos);
  assert.equal(evidencia.get('phonk').tracks.size, 1);
  assert.equal(evidencia.get('hip hop').tracks.size, 1);
  assert.equal(evidencia.has('hip-hop'), false, 'el sinonimo original no debe quedar suelto');
});

function embeberFalsoPorPalabra(vocab) {
  return async (texto) => {
    const v = new Float32Array(vocab.length);
    const i = vocab.indexOf(texto);
    if (i >= 0) v[i] = 1;
    else v[v.length - 1] = 0.5;
    return v;
  };
}

test('agruparTerminos deja terminos identicos en el mismo grupo', async () => {
  const vocab = ['phonk', 'drift phonk', 'balada'];
  const embeber = embeberFalsoPorPalabra(vocab);
  const terminos = [{ termino: 'phonk', frecuencia: 10 }, { termino: 'phonk', frecuencia: 5 }];
  const grupos = await agruparTerminos(terminos, embeber, 0.9);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].masaEnTerminos, 15);
});

test('agruparTerminos separa terminos distintos cuando el umbral es alto', async () => {
  const vocab = ['phonk', 'balada'];
  const embeber = embeberFalsoPorPalabra(vocab);
  const terminos = [{ termino: 'phonk', frecuencia: 10 }, { termino: 'balada', frecuencia: 8 }];
  const grupos = await agruparTerminos(terminos, embeber, 0.9);
  assert.equal(grupos.length, 2);
});

test('agruparTerminos nunca fusiona un termino de instrumentacion (guitar) con otros, aunque el embedding los de por muy parecidos', async () => {
  const embeber = async () => new Float32Array([1, 0]); // todos los vectores son identicos: maxima similitud posible
  const terminos = [
    { termino: 'guitar', frecuencia: 50 },
    { termino: 'hard rock', frecuencia: 10 },
    { termino: 'heavy metal', frecuencia: 8 },
  ];
  const grupos = await agruparTerminos(terminos, embeber, 0.5);
  assert.equal(grupos.length, 2, 'guitar queda solo, hard rock y heavy metal se fusionan entre si');
  const grupoGuitar = grupos.find((g) => g.terminos.some((t) => t.termino === 'guitar'));
  assert.equal(grupoGuitar.terminos.length, 1);
});

test('calcularMasaMinima usa el menor entre el umbral fijo y el porcentual', () => {
  assert.equal(calcularMasaMinima(2292, { masaMinima: 25, masaMinimaPorcentaje: 0.03 }), 25);
  assert.equal(calcularMasaMinima(400, { masaMinima: 25, masaMinimaPorcentaje: 0.03 }), 12);
});

test('filtrarPorMasa separa candidatos que llegan a la masa minima de los que no', () => {
  const grupos = [
    { terminos: [{ termino: 'phonk', frecuencia: 30 }], tracksCubiertos: new Set(Array.from({ length: 30 }, (_, i) => `t${i}`)) },
    { terminos: [{ termino: 'raro', frecuencia: 2 }], tracksCubiertos: new Set(['t100', 't101']) },
  ];
  const { modos, residuo } = filtrarPorMasa(grupos, 25);
  assert.equal(modos.length, 1);
  assert.equal(residuo.length, 1);
  assert.equal(residuo[0].terminos[0].termino, 'raro');
});

test('nombrarModo usa el nombre humano de fuentes.json si existe', () => {
  const grupo = { terminos: [{ termino: 'phonk', frecuencia: 30 }, { termino: 'drift phonk', frecuencia: 10 }] };
  const nombresHumanos = { phonk: 'Phonk' };
  assert.equal(nombrarModo(grupo, nombresHumanos), 'Phonk');
});

test('nombrarModo capitaliza el termino dominante si no hay nombre humano', () => {
  const grupo = { terminos: [{ termino: 'shoegaze', frecuencia: 5 }] };
  assert.equal(nombrarModo(grupo, {}), 'Shoegaze');
});

test('nombrarModo capitaliza CADA palabra de un termino compuesto sin nombre humano', () => {
  // Bug real: antes solo se ponia en mayuscula la primera letra de TODA la
  // frase ("Festival progressive house"), y se notaba porque las entradas
  // curadas de nombresHumanos SI usan Title Case ("Deep House", "Bossa
  // Nova") -- un termino sin curar se veia descuidado al lado, no solo
  // menos conocido.
  const grupo = { terminos: [{ termino: 'festival progressive house', frecuencia: 5 }] };
  assert.equal(nombrarModo(grupo, {}), 'Festival Progressive House');
});

test('nombrarModo respeta un guion dentro de una palabra al capitalizar cada lado', () => {
  const grupo = { terminos: [{ termino: 'singer-songwriter', frecuencia: 5 }] };
  assert.equal(nombrarModo(grupo, {}), 'Singer-Songwriter');
});

test('extraerPatronTitulo detecta patrones conocidos en el titulo', () => {
  assert.equal(extraerPatronTitulo('Shape of My Heart - Piano Version', ['instrumental', 'piano', 'cover']), 'piano');
  assert.equal(extraerPatronTitulo('Algo cualquiera', ['instrumental', 'piano', 'cover']), null);
});

test('coincideNombreExacto exige coincidencia exacta, no aproximada', () => {
  assert.equal(coincideNombreExacto('Lowfie', 'Lowfie'), true);
  assert.equal(coincideNombreExacto('Lowfie', 'Lowfield'), false);
  assert.equal(coincideNombreExacto('lowfie', 'Lowfie'), true, 'insensible a mayusculas');
});

// Tarea 18 (detección incremental): descubrirModos() puede recibir un
// subconjunto chico de tracks (solo los nuevos sin modo) para clusterizar,
// pero la masa mínima tiene que seguir midiéndose contra el tamaño real de
// la biblioteca completa — si no, un grupo de 3 tracks compartiendo género
// jamás calificaría como modo contra una biblioteca de 2292 tracks
// (masaMinima=25), pero SÍ calificaría si el cálculo usara por error
// tracks.length=3 (masaMinima se desploma a min(25, ceil(3*0.03))=1).
test('descubrirModos mide la masa minima contra totalTracksReal, no contra tracks.length', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'descubrir-modos-test-'));
  try {
    const tracks = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    const generosPorTrack = new Map([
      ['t1', ['phonk']],
      ['t2', ['phonk']],
      ['t3', ['phonk']],
    ]);
    const fuentes = {
      vocabulario: { sinonimos: {}, nombresHumanos: {} },
      umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 },
    };

    // Sin totalTracksReal: default = tracks.length (3) -> masaMinima = 1 ->
    // el grupo de 3 tracks compartiendo 'phonk' califica como modo.
    const sinTotalReal = await descubrirModos(tracks, generosPorTrack, fuentes, dataDir);
    assert.equal(sinTotalReal.modosCandidatos.length, 1);
    assert.equal(sinTotalReal.gruposSinMasa.length, 0);

    // Con totalTracksReal = biblioteca completa (2292): masaMinima = 25 -> el
    // mismo grupo de 3 tracks NO llega y queda en el residuo.
    const conTotalReal = await descubrirModos(tracks, generosPorTrack, fuentes, dataDir, 2292);
    assert.equal(conTotalReal.modosCandidatos.length, 0);
    assert.equal(conTotalReal.gruposSinMasa.length, 1);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

// Bug real (medido contra una biblioteca real: "Sin clasificar" subió de 94
// a 115 al pasar a agrupación por enlace completo — grupos más finos, mas
// grupos chicos que no llegan a la masa mínima). Un track cuya evidencia
// formó un grupo DEMASIADO CHICO para calificar como modo propio
// ("sludge metal", 3 canciones) antes se descartaba sin más: no entraba a
// ningún modo, ni pasaba por la propagación de embeddings que sí se le
// ofrece a un track SIN evidencia. Un género real y específico con pocas
// canciones propias merece la misma oportunidad de encajar en un modo más
// amplio que ya existe (acá, "Rock") antes de darlo por perdido.
test('un grupo que no llega a la masa minima se propaga por embeddings a un modo mas amplio', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'descubrir-modos-residuo-test-'));
  try {
    const tracks = [];
    const generosPorTrack = new Map();
    for (let i = 0; i < 30; i++) {
      tracks.push({ id: `rock${i}` });
      generosPorTrack.set(`rock${i}`, ['rock']);
    }
    for (let i = 0; i < 3; i++) {
      tracks.push({ id: `sludge${i}` });
      generosPorTrack.set(`sludge${i}`, ['sludge metal']);
    }
    const fuentes = {
      vocabulario: { sinonimos: {}, nombresHumanos: {} },
      umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 },
    };

    // totalTracksReal grande a propósito: así masaMinima=25 de verdad, y el
    // grupo de 3 "sludge metal" no califica por sí solo (queda en
    // gruposSinMasa) — es la condición que dispara el caso que se prueba.
    const resultado = await descubrirModos(tracks, generosPorTrack, fuentes, dataDir, 2210);

    assert.equal(resultado.modosCandidatos.length, 1, 'sludge metal no llega a formar su propio modo');
    assert.equal(resultado.gruposSinMasa.length, 1);
    assert.equal(resultado.gruposSinMasa[0].terminos[0].termino, 'sludge metal');

    const rock = resultado.modosCandidatos.find((m) => m.nombre === 'Rock');
    assert.ok(rock, 'existe el modo Rock');
    for (let i = 0; i < 3; i++) {
      assert.ok(rock.trackIds.includes(`sludge${i}`), `sludge${i} se propago a Rock en vez de quedar sin modo`);
    }
    assert.equal(resultado.residuoSinModo.length, 0, 'nadie quedo sin intentar propagarse');
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
