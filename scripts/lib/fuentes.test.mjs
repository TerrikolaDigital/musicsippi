import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarFuentes, validarFuentes, guardarSiValido } from './fuentes.mjs';

const FUENTES_VALIDAS = {
  version: 2,
  youtube: { search: { titulo: 'a', canal: 'b', descripcion: 'c' }, getInfo: { keywords: 'd', canal: 'e', descripcion: 'f' } },
  deezer: { generoAlbum: 'genre_id', requiereNombreExacto: true },
  musicbrainz: { generos: 'genres' },
  vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: {} },
  transversales: [],
  umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 },
};

function dirTemporal() { return mkdtempSync(join(tmpdir(), 'fuentes-test-')); }

test('validarFuentes acepta un objeto con todas las claves esperadas', () => {
  const resultado = validarFuentes(FUENTES_VALIDAS);
  assert.equal(resultado.valido, true);
});

test('validarFuentes rechaza un objeto sin version', () => {
  const { version, ...sinVersion } = FUENTES_VALIDAS;
  const resultado = validarFuentes(sinVersion);
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.length > 0);
});

test('validarFuentes rechaza si falta una seccion requerida', () => {
  const { umbrales, ...sinUmbrales } = FUENTES_VALIDAS;
  const resultado = validarFuentes(sinUmbrales);
  assert.equal(resultado.valido, false);
});

test('cargarFuentes devuelve el archivo si es valido', () => {
  const dataDir = dirTemporal();
  writeFileSync(join(dataDir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
  const fuentes = cargarFuentes(dataDir);
  assert.equal(fuentes.version, 2);
  rmSync(dataDir, { recursive: true, force: true });
});

test('cargarFuentes no explota si el archivo no existe: devuelve null', () => {
  const dataDir = dirTemporal();
  assert.equal(cargarFuentes(dataDir), null);
  rmSync(dataDir, { recursive: true, force: true });
});

test('guardarSiValido no pisa el archivo si la version nueva no es mayor', () => {
  const dataDir = dirTemporal();
  writeFileSync(join(dataDir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
  const resultado = guardarSiValido(dataDir, { ...FUENTES_VALIDAS, version: 2 });
  assert.equal(resultado.aplicado, false);
  rmSync(dataDir, { recursive: true, force: true });
});

test('guardarSiValido aplica y deja backup cuando la version es mayor y valida', () => {
  const dataDir = dirTemporal();
  writeFileSync(join(dataDir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
  const nuevo = { ...FUENTES_VALIDAS, version: 3 };
  const resultado = guardarSiValido(dataDir, nuevo);
  assert.equal(resultado.aplicado, true);
  const guardado = JSON.parse(readFileSync(join(dataDir, 'fuentes.json'), 'utf8'));
  assert.equal(guardado.version, 3);
  const backup = JSON.parse(readFileSync(join(dataDir, 'fuentes.json.bak'), 'utf8'));
  assert.equal(backup.version, 2);
  rmSync(dataDir, { recursive: true, force: true });
});

test('guardarSiValido rechaza un objeto invalido sin tocar el archivo existente', () => {
  const dataDir = dirTemporal();
  writeFileSync(join(dataDir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
  const resultado = guardarSiValido(dataDir, { version: 99 });
  assert.equal(resultado.aplicado, false);
  assert.ok(resultado.errores.length > 0);
  rmSync(dataDir, { recursive: true, force: true });
});

test('cargarFuentes con JSON corrupto devuelve null en vez de lanzar', () => {
  const dir = dirTemporal();
  try {
    writeFileSync(join(dir, 'fuentes.json'), '{ "version": 2, ');
    const avisos = [];
    const original = console.warn;
    console.warn = (...a) => avisos.push(a.join(' '));
    try {
      assert.equal(cargarFuentes(dir), null);
    } finally {
      console.warn = original;
    }
    assert.equal(avisos.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
