import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enriquecerDeezer } from './enriquecer-deezer-core.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'enriquecer-deezer-core-test-'));
}

function escribirBiblioteca(dir, tracks) {
  writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks }));
}

let fetchOriginal;
beforeEach(() => {
  fetchOriginal = global.fetch;
});
afterEach(() => {
  global.fetch = fetchOriginal;
});

test('un track encontrado guarda coverUrl y fotoArtista', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Nirvana', titulo: 'Come as You Are' }]);
    global.fetch = mock.fn(async (url) => {
      if (String(url).includes('api.deezer.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ album: { cover_big: 'https://cover.example/1.jpg' }, artist: { picture_big: 'https://foto.example/1.jpg' } }],
          }),
        };
      }
      return { status: 200, headers: { get: () => null } };
    });

    const resultado = await enriquecerDeezer(dir);
    assert.equal(resultado.encontrados, 1);
    assert.equal(resultado.sinResultado, 0);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-deezer.json'), 'utf8'));
    assert.equal(meta.tracks.t1.coverUrl, 'https://cover.example/1.jpg');
    assert.equal(meta.tracks.t1.fotoArtista, 'https://foto.example/1.jpg');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track sin resultado queda con coverUrl null (marcado como ya consultado)', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Artista Oscurisimo', titulo: 'Cancion Rara' }]);
    global.fetch = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));

    const resultado = await enriquecerDeezer(dir);
    assert.equal(resultado.sinResultado, 1);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-deezer.json'), 'utf8'));
    assert.equal(meta.tracks.t1.coverUrl, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track ya consultado (con coverUrl en cache) no se vuelve a pedir', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'A', titulo: 'B' }]);
    writeFileSync(join(dir, 'metadata-deezer.json'), JSON.stringify({ version: 1, tracks: { t1: { coverUrl: 'ya-esta.jpg', fotoArtista: null } } }));
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    global.fetch = llamado;

    const resultado = await enriquecerDeezer(dir);
    assert.equal(resultado.total, 0, 'no habia pendientes');
    assert.equal(llamado.mock.calls.length, 0, 'no debio llamar a fetch');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un fallo de red en un track no corta el resto del lote', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [
      { id: 't1', artista: 'A', titulo: 'Falla' },
      { id: 't2', artista: 'B', titulo: 'Funciona' },
    ]);
    global.fetch = mock.fn(async (url) => {
      if (String(url).includes('search?q=A')) throw new Error('red caida');
      if (String(url).includes('api.deezer.com')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
      return { status: 200, headers: { get: () => null } };
    });

    const resultado = await enriquecerDeezer(dir);
    assert.equal(resultado.total, 2);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-deezer.json'), 'utf8'));
    assert.equal(Object.hasOwn(meta.tracks, 't1'), false, 't1 fallo de red: queda pendiente, no se cachea como sin resultado');
    assert.equal(meta.tracks.t2.coverUrl, null, 't2 si se resolvio (sin resultado real)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('onProgreso se llama con los numeros correctos', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [
      { id: 't1', artista: 'A', titulo: 'Uno' },
      { id: 't2', artista: 'B', titulo: 'Dos' },
    ]);
    global.fetch = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));

    const llamadas = [];
    await enriquecerDeezer(dir, { onProgreso: (procesados, total) => llamadas.push([procesados, total]) });

    assert.deepEqual(llamadas, [[1, 2], [2, 2]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
