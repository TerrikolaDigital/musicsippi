import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveNombreModo, mismoNombreModo } from './nombre-modo.mjs';

test('singular y plural simples (es/en) son el mismo nombre', () => {
  assert.ok(mismoNombreModo('Soundtracks', 'Soundtrack'));
  assert.ok(mismoNombreModo('Clásicos', 'Clásico'));
  assert.ok(mismoNombreModo('Rock', 'Rocks'));
  assert.ok(mismoNombreModo('Gimnasio', 'Gimnasios'));
  assert.ok(mismoNombreModo('Canciones tristes', 'cancion triste'));
});

test('nombres distintos no se funden', () => {
  assert.ok(!mismoNombreModo('Bossa', 'Boss'));
  assert.ok(!mismoNombreModo('Rock', 'Rack'));
  assert.ok(!mismoNombreModo('Pop', 'Pops dance'));
});

test('normaliza mayúsculas, tildes y signos', () => {
  assert.equal(claveNombreModo("  Pop-dance / House's "), claveNombreModo('pop dance house'));
  assert.equal(claveNombreModo(''), '');
  assert.equal(claveNombreModo(null), '');
});
