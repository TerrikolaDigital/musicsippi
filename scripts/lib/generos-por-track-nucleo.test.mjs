import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarEvidenciaNucleo } from './generos-por-track-nucleo.mjs';

const fuentes = {
  vocabulario: {
    sinonimos: { 'hip-hop': 'hip hop' },
    patronesTitulo: ['lofi'],
    nombresHumanos: { rock: 'Rock', pop: 'Pop', 'hip hop': 'Hip Hop', lofi: 'Lofi' },
  },
};

test('Deezer solo cuenta cuando MusicBrainz no dio nada, con su propia señal', () => {
  const tracks = [
    { id: 'a', titulo: 'Uno', ejes: [] },
    { id: 'b', titulo: 'Dos', ejes: [] },
  ];
  const ev = armarEvidenciaNucleo(tracks, fuentes, {
    generosArtistaDe: (id) => (id === 'a' ? ['alternative rock'] : []),
    generosDeezerDe: () => ['pop'],
  });
  assert.deepEqual(ev.get('a'), { generos: ['alternative rock'], senal: 'genero-musicbrainz' });
  assert.deepEqual(ev.get('b'), { generos: ['pop'], senal: 'genero-deezer' });
});

test('el patrón de título cuenta y el nombre de lista no, sin fs', () => {
  const ejes = [{ id: 'l1', nombre: 'Hip-Hop del bueno', tipo: 'playlist' }];
  const ev = armarEvidenciaNucleo([{ id: 'c', titulo: 'Lofi para estudiar', ejes: [{ ejeId: 'l1' }] }], fuentes, { ejes });
  assert.deepEqual(new Set(ev.get('c').generos), new Set(['lofi']));
  assert.equal(ev.get('c').senal, 'patron-titulo');
});
