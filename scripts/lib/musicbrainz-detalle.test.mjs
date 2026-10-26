import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirFicha, elegirReleaseGroup, generosMBEfectivos, URL_RECORDING, URL_RELEASE_GROUP } from './musicbrainz-detalle.mjs';

test('resumirFicha: 3 géneros con más votos (basta 1 voto) y todas las etiquetas únicas', () => {
  const r = resumirFicha({
    genres: [{ name: 'Pop', count: 1 }, { name: 'dance-pop', count: 3 }, { name: 'synth-pop', count: 1 }, { name: 'rock', count: 1 }],
    tags: [{ name: 'Happy', count: 1 }, { name: 'happy', count: 1 }, { name: 'pop', count: 2 }],
  });
  assert.deepEqual(r.generos, ['dance-pop', 'pop', 'rock']);
  assert.deepEqual(r.tags, ['pop', 'happy']);
  assert.deepEqual(resumirFicha(null), { generos: [], tags: [] });
});

test('elegirReleaseGroup: prefiere el álbum original con el título conocido, no el recopilatorio', () => {
  const rel = (id, titulo, primario, secundarios = [], date = '2000') => ({ date, title: titulo, 'release-group': { id, title: titulo, 'primary-type': primario, 'secondary-types': secundarios } });
  const releases = [rel('comp', 'Greatest Hits', 'Album', ['Compilation'], '2005'), rel('sen', 'Canción', 'Single', [], '1999'), rel('alb', 'El Álbum', 'Album', [], '2001')];
  assert.equal(elegirReleaseGroup(releases, 'el álbum'), 'alb');
  assert.equal(elegirReleaseGroup(releases), 'alb');
  assert.equal(elegirReleaseGroup([], 'x'), null);
  assert.equal(elegirReleaseGroup([{ title: 'sin rg' }]), null);
});

test('generosMBEfectivos: canción > álbum > artista', () => {
  assert.deepEqual(generosMBEfectivos({ mbCancion: { generos: ['a'] }, mbAlbum: { generos: ['b'] }, generosMB: ['c'] }), ['a']);
  assert.deepEqual(generosMBEfectivos({ mbCancion: { generos: [] }, mbAlbum: { generos: ['b'] }, generosMB: ['c'] }), ['b']);
  assert.deepEqual(generosMBEfectivos({ generosMB: ['c'] }), ['c']);
  assert.deepEqual(generosMBEfectivos(undefined), []);
});

test('URLs de recording y release-group', () => {
  assert.match(URL_RECORDING('x'), /\/recording\/x\?inc=genres\+tags\+releases\+release-groups&fmt=json/);
  assert.match(URL_RELEASE_GROUP('y'), /\/release-group\/y\?inc=genres\+tags&fmt=json/);
});
