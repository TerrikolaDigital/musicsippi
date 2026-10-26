import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escribirAtomico } from './escribir-atomico.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'escribir-atomico-test-'));
}

test('escribirAtomico deja el archivo final con el JSON pasado', () => {
  const dir = dirTemporal();
  try {
    const ruta = join(dir, 'datos.json');
    escribirAtomico(ruta, { hola: 'mundo' });
    assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), { hola: 'mundo' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escribirAtomico no deja el archivo .tmp atrás', () => {
  const dir = dirTemporal();
  try {
    const ruta = join(dir, 'datos.json');
    escribirAtomico(ruta, { a: 1 });
    assert.equal(existsSync(`${ruta}.tmp`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escribirAtomico sobreescribe un archivo existente', () => {
  const dir = dirTemporal();
  try {
    const ruta = join(dir, 'datos.json');
    escribirAtomico(ruta, { version: 1 });
    escribirAtomico(ruta, { version: 2 });
    assert.deepEqual(JSON.parse(readFileSync(ruta, 'utf8')), { version: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
