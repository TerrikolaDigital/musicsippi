import test from 'node:test';
import assert from 'node:assert/strict';
import { inicialesDe } from './iniciales.js';

test('iniciales: con «&» salen 3 letras, sin él 2, y nunca el símbolo', () => {
  assert.equal(inicialesDe('Sia & Kylie Minogue'), 'SKM');
  assert.equal(inicialesDe('Dua Lipa'), 'DL');
  assert.equal(inicialesDe('Hootie & The Blowfish'), 'HTB');
  assert.equal(inicialesDe('Madonna'), 'M');
  assert.equal(inicialesDe(''), '');
});

test('iniciales: nunca signos como «(» ni comillas (álbumes «Sing (Original…)», «Being Human (From "…")»)', () => {
  assert.equal(inicialesDe('Sing (Original Motion Picture Soundtrack Deluxe)'), 'SO');
  assert.equal(inicialesDe('(What\'s the Story) Morning Glory?'), 'WS');
  assert.equal(inicialesDe('"Heroes"'), 'H');
  assert.equal(inicialesDe('birds of a feather (Lofi Instrumental)'), 'BO');
  assert.equal(inicialesDe('¿Dónde están?'), 'DE');
});
