import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corregirNombresModos } from './corregir-nombres-modos.mjs';

function eje(id, nombre, extra = {}) {
  return { id, nombre, tipo: 'gusto', orden: 1, activo: true, sistema: false, padre: null, ...extra };
}

test('title-casea un modo descubierto cuyo nombre quedo con solo la primera letra en mayuscula', () => {
  const ejesData = { ejes: [eje('festival-progressive-house', 'Festival progressive house', { origen: 'descubierto' })] };
  const { corregidos } = corregirNombresModos(ejesData, {});
  assert.equal(ejesData.ejes[0].nombre, 'Festival Progressive House');
  assert.equal(corregidos, 1);
});

test('no toca un nombre curado de fuentes.json, aunque tenga una palabra en minuscula a proposito', () => {
  // "Rock en Español": el "en" en minuscula es gramatica correcta, no un
  // descuido -- aplicarle Title Case a ciegas lo rompe ("Rock En Español").
  const ejesData = { ejes: [eje('rock-espanol', 'Rock en Español', { origen: 'descubierto' })] };
  const nombresHumanos = { 'rock espanol': 'Rock en Español' };
  const { corregidos } = corregirNombresModos(ejesData, nombresHumanos);
  assert.equal(ejesData.ejes[0].nombre, 'Rock en Español');
  assert.equal(corregidos, 0);
});

test('no toca playlists ni ejes del sistema, solo origen "descubierto"', () => {
  const ejesData = {
    ejes: [
      eje('mi-lista', 'una lista con minusculas', { tipo: 'playlist' }),
      eje('sin-clasificar', 'sin clasificar', { sistema: true }),
    ],
  };
  const { corregidos } = corregirNombresModos(ejesData, {});
  assert.equal(ejesData.ejes[0].nombre, 'una lista con minusculas');
  assert.equal(ejesData.ejes[1].nombre, 'sin clasificar');
  assert.equal(corregidos, 0);
});

test('un modo ya bien capitalizado no cuenta como corregido (es idempotente)', () => {
  const ejesData = { ejes: [eje('shoegaze', 'Shoegaze', { origen: 'descubierto' })] };
  const { corregidos } = corregirNombresModos(ejesData, {});
  assert.equal(ejesData.ejes[0].nombre, 'Shoegaze');
  assert.equal(corregidos, 0);
});

test('correr la migracion dos veces seguidas da lo mismo la segunda vez', () => {
  const ejesData = { ejes: [eje('trip-hop', 'Trip hop', { origen: 'descubierto' })] };
  corregirNombresModos(ejesData, {});
  assert.equal(ejesData.ejes[0].nombre, 'Trip Hop');
  const segunda = corregirNombresModos(ejesData, {});
  assert.equal(segunda.corregidos, 0);
});
