import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copiaSiNuevaRafaga } from './copia-rafaga.mjs';

const nuevo = () => {
  const d = mkdtempSync(join(tmpdir(), 'rafaga-'));
  writeFileSync(join(d, 'biblioteca.json'), '{"tracks":[1]}');
  writeFileSync(join(d, 'ejes.json'), '{"ejes":[]}');
  return d;
};
const copias = (d) => readdirSync(d).filter((n) => n.startsWith('backup-quitar-tracks-'));

test('la primera baja crea copia con biblioteca y ejes', () => {
  const d = nuevo();
  const c = copiaSiNuevaRafaga(d, { ahora: Date.UTC(2026, 9, 18, 10, 0, 0) });
  assert.ok(c);
  assert.ok(existsSync(join(c, 'biblioteca.json')));
  assert.ok(existsSync(join(c, 'ejes.json')));
});

test('dentro de la ventana no repite; pasada la ventana sí', () => {
  const d = nuevo();
  const t = Date.UTC(2026, 9, 18, 10, 0, 0);
  assert.ok(copiaSiNuevaRafaga(d, { ahora: t }));
  assert.equal(copiaSiNuevaRafaga(d, { ahora: t + 5 * 60000 }), null);
  assert.ok(copiaSiNuevaRafaga(d, { ahora: t + 11 * 60000 }));
  assert.equal(copias(d).length, 2);
});

test('conserva como máximo las 10 más recientes', () => {
  const d = nuevo();
  const t = Date.UTC(2026, 9, 18, 10, 0, 0);
  for (let i = 0; i < 13; i++) copiaSiNuevaRafaga(d, { ahora: t + i * 20 * 60000 });
  const c = copias(d).sort();
  assert.equal(c.length, 10);
  assert.ok(c[0].endsWith('10-00-00') === false); // las más viejas se borraron
});

test('no toca otras carpetas de backup', () => {
  const d = nuevo();
  copiaSiNuevaRafaga(d, { ahora: Date.now() });
  assert.equal(readdirSync(d).filter((n) => n.startsWith('backup-fusion')).length, 0);
});
