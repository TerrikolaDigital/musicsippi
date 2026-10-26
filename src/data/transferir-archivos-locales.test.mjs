import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pruebaPC } from './transferir-archivos-locales.js';

test('la prueba del PC cambia si cambia su dirección', async () => {
  globalThis.crypto ??= (await import('node:crypto')).webcrypto;
  const clave = 'k'.repeat(48);
  const a = await pruebaPC(clave, 'a'.repeat(32), 'b'.repeat(32), '192.168.1.2:5000');
  const b = await pruebaPC(clave, 'a'.repeat(32), 'b'.repeat(32), '192.168.1.3:5000');
  assert.notEqual(a, b);
});
