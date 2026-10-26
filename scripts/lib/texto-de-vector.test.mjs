import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearTextoDeVector } from './generos-por-track.mjs';

test('crearTextoDeVector: evidencia de MusicBrainz más el mood de género de la canción', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'texto-vector-'));
  writeFileSync(join(dataDir, 'metadata-musicbrainz.json'), JSON.stringify({ tracks: { a: { artistaMbid: 'm' } }, artistas: { m: { generos: ['funk'] } } }));
  writeFileSync(join(dataDir, 'ejes.json'), JSON.stringify({ ejes: [{ id: 'soul-hip-hop', nombre: 'Soul y hip hop', familia: 'genero' }] }));
  const tracks = [
    { id: 'a', artista: 'A', titulo: 'Uno', ejes: [{ ejeId: 'soul-hip-hop' }] },
    { id: 'b', artista: 'B', titulo: 'Dos', ejes: [] },
  ];
  const textoDe = crearTextoDeVector(dataDir, tracks, null);
  assert.equal(textoDe(tracks[0]), 'A — Uno. Géneros: funk, Soul y hip hop.');
  assert.equal(textoDe(tracks[1]), 'B — Dos.');
  rmSync(dataDir, { recursive: true, force: true });
});
