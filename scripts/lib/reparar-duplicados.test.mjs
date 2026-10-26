import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repararDuplicados } from './reparar-duplicados.mjs';

function eje(id, nombre, extra = {}) {
  return {
    id,
    nombre,
    tipo: 'gusto',
    orden: 1,
    activo: true,
    sistema: false,
    padre: null,
    descripcion: '',
    anclas: { artistas: [], titulos: [] },
    tagsLastfm: [],
    ...extra,
  };
}

function track(id, ejeIds) {
  return { id, artista: 'A', titulo: id, ejes: ejeIds.map((ejeId) => ({ ejeId, origen: 'auto', senal: 'x', score: 1 })) };
}

/** El estado real medido en una biblioteca dañada, en miniatura. */
function estadoDaniado() {
  return {
    ejesData: {
      ejes: [
        eje('sin-clasificar', 'Sin clasificar', { tipo: 'sistema', sistema: true, orden: 999 }),
        eje('favoritos', 'Favoritas', { sistema: true, orden: 0 }),
        eje('mis-favoritas', 'Mis favoritas', { tipo: 'playlist', orden: 2 }),
        eje('rock', 'Rock', { tipo: 'playlist', orden: 3 }),
        eje('electronic', 'Electronic', { origen: 'descubierto', orden: 10 }),
        eje('electronic-2', 'Electronic', { origen: 'descubierto', orden: 20 }),
        eje('rock-2', 'Rock', { origen: 'descubierto', orden: 21 }),
      ],
    },
    biblioteca: {
      tracks: [
        track('t1', ['favoritos', 'mis-favoritas', 'electronic']),
        track('t2', ['electronic-2']),
        track('t3', ['rock']),
        track('t4', ['rock-2']),
      ],
    },
    historial: [{ trackId: 't2', ejeId: 'electronic-2', ejeNombre: 'Electronic', ts: 1 }],
    ultimosModos: ['electronic-2', 'electronic', 'rock'],
  };
}

test('fusiona dos modos descubiertos con el mismo nombre en el mas viejo', () => {
  const estado = estadoDaniado();
  const resumen = repararDuplicados(estado);

  const electronicos = estado.ejesData.ejes.filter((e) => e.nombre === 'Electronic');
  assert.equal(electronicos.length, 1);
  assert.equal(electronicos[0].id, 'electronic', 'gana el de orden mas bajo, el original');

  const t2 = estado.biblioteca.tracks.find((t) => t.id === 't2');
  assert.deepEqual(t2.ejes.map((a) => a.ejeId), ['electronic'], 'sus canciones se mudan, no se pierden');
  assert.equal(resumen.modosFusionados.length, 1);
  assert.equal(resumen.modosFusionados[0].nombre, 'Electronic');
});

test('no fusiona una lista del usuario con un modo descubierto del mismo nombre', () => {
  const estado = estadoDaniado();
  repararDuplicados(estado);

  // "Rock" playlist (armada por el usuario) y "Rock" modo (automatico) son
  // cosas distintas: medido en una biblioteca real se solapan 33 de 263.
  assert.equal(estado.ejesData.ejes.some((e) => e.id === 'rock' && e.tipo === 'playlist'), true);
  assert.equal(estado.ejesData.ejes.some((e) => e.id === 'rock-2'), true);
  const t3 = estado.biblioteca.tracks.find((t) => t.id === 't3');
  assert.deepEqual(t3.ejes.map((a) => a.ejeId), ['rock']);
});

test('absorbe la lista clon de favoritas y no deja el track dos veces en Favoritas', () => {
  const estado = estadoDaniado();
  const resumen = repararDuplicados(estado);

  assert.equal(estado.ejesData.ejes.some((e) => e.id === 'mis-favoritas'), false);
  const t1 = estado.biblioteca.tracks.find((t) => t.id === 't1');
  assert.deepEqual(t1.ejes.map((a) => a.ejeId), ['favoritos', 'electronic'], 'sin pertenencia repetida');
  assert.deepEqual(resumen.listasAbsorbidas.map((l) => l.nombre), ['Mis favoritas']);
});

test('reapunta historial y ultimos modos, para no perder lo escuchado ni repetir tarjetas', () => {
  const estado = estadoDaniado();
  repararDuplicados(estado);

  assert.equal(estado.historial[0].ejeId, 'electronic');
  assert.equal(estado.historial[0].ejeNombre, 'Electronic');
  // 'electronic-2' y 'electronic' eran la misma tarjeta duplicada en el Home.
  assert.deepEqual(estado.ultimosModos, ['electronic', 'rock']);
});

test('no toca nada si no hay nada roto, y correrlo dos veces da lo mismo', () => {
  const sano = {
    ejesData: { ejes: [eje('favoritos', 'Favoritas', { sistema: true }), eje('pop', 'Pop', { origen: 'descubierto' })] },
    biblioteca: { tracks: [track('t1', ['pop'])] },
    historial: [],
    ultimosModos: ['pop'],
  };
  assert.equal(repararDuplicados(sano).huboCambios, false);

  const estado = estadoDaniado();
  repararDuplicados(estado);
  const despuesDeUna = JSON.stringify(estado);
  assert.equal(repararDuplicados(estado).huboCambios, false, 'la segunda pasada no encuentra nada');
  assert.equal(JSON.stringify(estado), despuesDeUna);
});

test('una lista de favoritas con canciones que NO estan en Favoritas no pierde ninguna', () => {
  const estado = {
    ejesData: {
      ejes: [eje('favoritos', 'Favoritas', { sistema: true }), eje('liked-songs', 'Liked Songs', { tipo: 'playlist' })],
    },
    biblioteca: { tracks: [track('t1', ['liked-songs'])] },
    historial: [],
    ultimosModos: [],
  };
  repararDuplicados(estado);

  assert.equal(estado.ejesData.ejes.some((e) => e.id === 'liked-songs'), false);
  assert.deepEqual(estado.biblioteca.tracks[0].ejes.map((a) => a.ejeId), ['favoritos']);
});
