import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refrescarBibliotecaLocal } from './refrescar-biblioteca-local.js';

test('refresca biblioteca, metadata y favoritos sin necesitar tocar la reproducción', async () => {
  const cambios = [];
  await refrescarBibliotecaLocal({
    cargarDatos: async () => ({ tracks: [{ id: 'nueva' }], ejes: [{ id: 'modo' }] }),
    obtenerMetadata: async () => ({ tracks: { nueva: { album: 'Álbum' } }, artistas: {} }),
    obtenerFavoritos: async () => ({ artistas: ['artista'], albumes: [] }),
    setTracks: (v) => cambios.push(['tracks', v]),
    setEjes: (v) => cambios.push(['ejes', v]),
    setMetadata: (v) => cambios.push(['metadata', v]),
    setFavoritos: (v) => cambios.push(['favoritos', v]),
  });

  assert.deepEqual(cambios, [
    ['tracks', [{ id: 'nueva' }]],
    ['ejes', [{ id: 'modo' }]],
    ['metadata', { tracks: { nueva: { album: 'Álbum' } }, artistas: {} }],
    ['favoritos', { artistas: ['artista'], albumes: [] }],
  ]);
});
