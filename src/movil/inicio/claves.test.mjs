import test from 'node:test';
import assert from 'node:assert/strict';
import { claveCancion, norm } from './claves.js';

test('dos artistas japoneses distintos dan claves distintas', () => {
  assert.notEqual(claveCancion('米津玄師', 'Lemon'), claveCancion('宇多田ヒカル', 'Lemon'));
  assert.notEqual(claveCancion('米津玄師', 'Lemon'), claveCancion('米津玄師', 'Loser'));
  assert.notEqual(claveCancion('米津玄師', '馬と鹿'), claveCancion('米津玄師', '感電'));
  assert.notEqual(norm('米津玄師'), '');
});

test('el cirílico y el kana con dakuten se conservan', () => {
  assert.notEqual(claveCancion('Кино', 'Группа крови'), claveCancion('ДДТ', 'Группа крови'));
  assert.notEqual(norm('が'), norm('か'));
});

test('con y sin tilde dan la misma clave', () => {
  assert.equal(norm('Beyoncé'), norm('Beyonce'));
  assert.equal(claveCancion('Beyoncé', 'Halo'), claveCancion('Beyonce', 'Halo'));
});

test('las claves latinas no cambian', () => {
  assert.equal(norm('Sigur Rós'), 'sigur ros');
  assert.equal(norm('Mø'), 'm');
  assert.equal(norm('Straße'), 'stra e');
  assert.equal(norm('Halo (Live) feat. Foo'), 'halo');
  assert.equal(norm('AC/DC'), 'ac dc');
  assert.equal(claveCancion('Ana, Beto', 'Canción [Remix]'), 'ana|cancion');
});
