import test from 'node:test';
import assert from 'node:assert/strict';
import { separarInvitados } from './creditos.js';

test('separarInvitados: el «feat.» pasa del título a la línea del artista', () => {
  assert.deepEqual(separarInvitados({ titulo: 'Drunk in Love (feat. Beyoncé)', artista: 'Jay-Z' }), {
    titulo: 'Drunk in Love',
    artista: 'Jay-Z feat. Beyoncé',
  });
  assert.deepEqual(separarInvitados({ titulo: 'Song [ft. X & Y]', artista: 'A' }), { titulo: 'Song', artista: 'A feat. X & Y' });
  assert.deepEqual(separarInvitados({ titulo: 'Song (with Halsey)', artista: 'A' }), { titulo: 'Song', artista: 'A feat. Halsey' });
  assert.deepEqual(separarInvitados({ titulo: 'Song feat. Beyoncé', artista: 'A' }), { titulo: 'Song', artista: 'A feat. Beyoncé' });
});

test('separarInvitados: conserva lo que va detrás del paréntesis', () => {
  assert.deepEqual(separarInvitados({ titulo: 'Song (feat. X) - Remix', artista: 'A' }), { titulo: 'Song - Remix', artista: 'A feat. X' });
});

test('separarInvitados: no duplica un invitado que el artista ya nombra', () => {
  assert.deepEqual(separarInvitados({ titulo: 'Runnin (feat. Beyonce)', artista: 'A, Beyoncé' }), { titulo: 'Runnin', artista: 'A, Beyoncé' });
});

test('separarInvitados: sin invitados no toca nada («with» suelto es parte del título)', () => {
  assert.deepEqual(separarInvitados({ titulo: "Runnin'", artista: '21 Savage' }), { titulo: "Runnin'", artista: '21 Savage' });
  assert.deepEqual(separarInvitados({ titulo: 'Dancing with Myself', artista: 'Billy Idol' }), { titulo: 'Dancing with Myself', artista: 'Billy Idol' });
  assert.deepEqual(separarInvitados({ titulo: '(feat. X)', artista: 'A' }), { titulo: '(feat. X)', artista: 'A' }); // quedaría vacío
  assert.deepEqual(separarInvitados({}), { titulo: '', artista: '' });
});
