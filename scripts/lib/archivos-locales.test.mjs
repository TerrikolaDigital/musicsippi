import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  LIMITE_ARCHIVO, crearManifiestoArchivos, crearServicioArchivos, esHostPrivado, validarTransferencia,
} from './archivos-locales.mjs';

const SHA = 'a'.repeat(64);
const base = { clave: 'k'.repeat(48), claveEsperada: 'k'.repeat(48), host: '192.168.1.20', trackId: 't1', sha256: SHA, tamano: 1000, mime: 'audio/mpeg', direccion: 'subida' };
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('acepta 500 MiB y rechaza 500 MiB más un byte', () => {
  assert.equal(validarTransferencia({ ...base, tamano: LIMITE_ARCHIVO }).ok, true);
  const r = validarTransferencia({ ...base, tamano: LIMITE_ARCHIVO + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test('rechaza clave errónea, host público, hash o MIME inválidos', () => {
  assert.equal(validarTransferencia({ ...base, clave: 'otra' }).status, 401);
  assert.equal(validarTransferencia({ ...base, host: '8.8.8.8' }).status, 403);
  assert.equal(validarTransferencia({ ...base, sha256: 'xyz' }).status, 400);
  assert.equal(validarTransferencia({ ...base, mime: 'text/html' }).status, 415);
  assert.equal(esHostPrivado('::ffff:10.0.0.5'), true);
  assert.equal(esHostPrivado('172.32.0.1'), false);
});

test('el manifiesto no expone rutas y omite lo que aún no tiene hash', () => {
  const m = crearManifiestoArchivos({
    t1: { ruta: 'C:\\Musica\\a.mp3', tamano: 5, sha256: SHA, mime: 'audio/mpeg' },
    t2: { ruta: 'C:\\Musica\\b.mp3', tamano: 6, sha256: null, mime: 'audio/mpeg' },
  });
  assert.deepEqual(m, [{ trackId: 't1', sha256: SHA, tamano: 5, mime: 'audio/mpeg', dispositivo: 'pc' }]);
  assert.ok(!JSON.stringify(m).includes('Musica'));
});

