import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionarModosDuplicados } from './fusionar-modos-duplicados.mjs';

test('fusiona lista y modo descubierto del mismo nombre en un eje y limpia referencias', () => {
  const ejesData = {
    ejes: [
      { id: 'chill', nombre: 'Chill', tipo: 'playlist', orden: 5, activo: true },
      { id: 'chill-2', nombre: 'Chill', tipo: 'gusto', origen: 'descubierto', orden: 9, activo: true },
      { id: 'rock', nombre: 'Rock', tipo: 'playlist', orden: 6, activo: true },
    ],
  };
  const biblioteca = {
    tracks: [
      { id: 'a', ejes: [{ ejeId: 'chill', origen: 'auto', senal: 'nombre-lista' }, { ejeId: 'chill-2', origen: 'auto', senal: 'x' }] },
      { id: 'b', ejes: [{ ejeId: 'chill-2', origen: 'auto', senal: 'x' }] },
      { id: 'c', ejes: [{ ejeId: 'chill', origen: 'manual' }] },
    ],
  };
  const historial = [{ ejeId: 'chill-2', ejeNombre: 'Chill' }];
  const ultimos = ['chill-2', 'rock', 'chill'];

  const res = fusionarModosDuplicados(ejesData, biblioteca, historial, ultimos);

  assert.equal(res.length, 1);
  assert.deepEqual([res[0].movidas, res[0].yaEnLista], [1, 1]);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['chill', 'rock']);
  assert.equal(ejesData.ejes[0].tipo, 'gusto');
  assert.equal(ejesData.ejes[0].origen, 'descubierto');
  assert.equal(ejesData.ejes[0].orden, 5);
  for (const t of biblioteca.tracks) assert.equal(t.ejes.some((a) => a.ejeId === 'chill-2'), false);
  assert.equal(biblioteca.tracks[0].ejes.filter((a) => a.ejeId === 'chill').length, 1);
  assert.equal(biblioteca.tracks[0].ejes[0].origen, 'manual');
  assert.equal(biblioteca.tracks[1].ejes[0].ejeId, 'chill');
  assert.equal(historial[0].ejeId, 'chill');
  assert.deepEqual(ultimos, ['chill', 'rock']);
});

test('fusiona aunque uno de los nombres esté en plural y conserva el id de la lista', () => {
  const ejesData = {
    ejes: [
      { id: 'soundtracks', nombre: 'Soundtracks', tipo: 'playlist', orden: 5, activo: true },
      { id: 'soundtrack', nombre: 'Soundtrack', tipo: 'gusto', origen: 'descubierto', orden: 9, activo: true },
    ],
  };
  const biblioteca = { tracks: [{ id: 'a', ejes: [{ ejeId: 'soundtrack', origen: 'auto', senal: 'x' }] }] };
  const res = fusionarModosDuplicados(ejesData, biblioteca);
  assert.deepEqual(res.map((r) => [r.lista, r.duplicado, r.movidas]), [['soundtracks', 'soundtrack', 1]]);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['soundtracks']);
  assert.equal(biblioteca.tracks[0].ejes[0].ejeId, 'soundtracks');
});

test('fusiona dos modos descubiertos del mismo nombre conservando el que tiene más canciones', () => {
  const ejesData = {
    ejes: [
      { id: 'soundtrack', nombre: 'Soundtrack', tipo: 'gusto', origen: 'descubierto', orden: 9, activo: true },
      { id: 'soundtracks', nombre: 'Soundtracks', tipo: 'gusto', origen: 'descubierto', orden: 4, activo: true },
      { id: 'rock', nombre: 'Rock', tipo: 'gusto', origen: 'descubierto', orden: 6, activo: true },
    ],
  };
  const biblioteca = {
    tracks: [
      { id: 'a', ejes: [{ ejeId: 'soundtrack', origen: 'auto', senal: 'x' }, { ejeId: 'soundtracks', origen: 'auto', senal: 'x' }] },
      { id: 'b', ejes: [{ ejeId: 'soundtracks', origen: 'auto', senal: 'x' }] },
      { id: 'c', ejes: [{ ejeId: 'soundtrack', origen: 'manual', senal: 'usuario' }] },
    ],
  };
  const historial = [{ ejeId: 'soundtrack', ejeNombre: 'Soundtrack' }];
  const ultimos = ['soundtrack', 'rock'];

  const res = fusionarModosDuplicados(ejesData, biblioteca, historial, ultimos);

  assert.deepEqual(res.map((r) => [r.tipo, r.lista, r.duplicado, r.movidas, r.yaEnLista]), [['descubierto', 'soundtracks', 'soundtrack', 1, 1]]);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['soundtracks', 'rock']);
  for (const t of biblioteca.tracks) assert.equal(t.ejes.some((a) => a.ejeId === 'soundtrack'), false);
  assert.deepEqual(biblioteca.tracks[2].ejes.map((a) => [a.ejeId, a.origen]), [["soundtracks", "manual"]]);
  assert.equal(biblioteca.tracks[0].ejes.filter((a) => a.ejeId === 'soundtracks').length, 1);
  assert.equal(historial[0].ejeId, 'soundtracks');
  assert.equal(historial[0].ejeNombre, 'Soundtracks');
  assert.deepEqual(ultimos, ['soundtracks', 'rock']);
});

test('ante empate de canciones conserva el id sin sufijo numérico', () => {
  const ejesData = {
    ejes: [
      { id: 'chill-2', nombre: 'Chill', tipo: 'gusto', origen: 'descubierto', orden: 2, activo: true },
      { id: 'chill', nombre: 'Chill', tipo: 'gusto', origen: 'descubierto', orden: 9, activo: true },
    ],
  };
  const biblioteca = {
    tracks: [
      { id: 'a', ejes: [{ ejeId: 'chill-2', origen: 'auto', senal: 'x' }] },
      { id: 'b', ejes: [{ ejeId: 'chill', origen: 'auto', senal: 'x' }] },
    ],
  };
  const res = fusionarModosDuplicados(ejesData, biblioteca);
  assert.deepEqual(res.map((r) => [r.lista, r.duplicado]), [['chill', 'chill-2']]);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['chill']);
  assert.equal(biblioteca.tracks[0].ejes[0].ejeId, 'chill');
});

test('no fusiona modos descubiertos con nombres distintos', () => {
  const ejesData = {
    ejes: [
      { id: 'rock', nombre: 'Rock', tipo: 'gusto', origen: 'descubierto', orden: 1, activo: true },
      { id: 'jazz', nombre: 'Jazz', tipo: 'gusto', origen: 'descubierto', orden: 2, activo: true },
    ],
  };
  const res = fusionarModosDuplicados(ejesData, { tracks: [] });
  assert.deepEqual(res, []);
  assert.deepEqual(ejesData.ejes.map((e) => e.id), ['rock', 'jazz']);
});
