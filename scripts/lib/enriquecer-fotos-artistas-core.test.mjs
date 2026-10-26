import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enriquecerFotosArtistas } from './enriquecer-fotos-artistas-core.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'enriquecer-fotos-artistas-core-test-'));
}

function escribirBiblioteca(dir, tracks) {
  writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks }));
}

// Respuesta binaria de tamaño arbitrario (no la silueta placeholder) para
// simular una foto real al descargarla para verificarla.
function respuestaFoto(bytes = 100) {
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(bytes) };
}

let fetchOriginal;
beforeEach(() => {
  fetchOriginal = global.fetch;
});
afterEach(() => {
  global.fetch = fetchOriginal;
});

test('un artista con match exacto guarda su foto verificada', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Nirvana' }]);
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/search/artist')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 42, name: 'Nirvana', nb_fan: 100 }] }) };
      }
      if (u.includes('/artist/42')) {
        return { ok: true, status: 200, json: async () => ({ picture_xl: 'https://foto.example/nirvana.jpg' }) };
      }
      return respuestaFoto();
    });

    const resultado = await enriquecerFotosArtistas(dir);
    assert.equal(resultado.encontrados, 1);
    assert.equal(resultado.sinResultado, 0);

    const cache = JSON.parse(readFileSync(join(dir, 'fotos-artistas.json'), 'utf8'));
    assert.equal(cache.fotos.nirvana, 'https://foto.example/nirvana.jpg');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin match exacto en Deezer (nombre casero) se cachea null y no se reintenta', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Chilled Pig' }]);
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    global.fetch = llamado;

    const resultado = await enriquecerFotosArtistas(dir);
    assert.equal(resultado.sinResultado, 1);

    const cache = JSON.parse(readFileSync(join(dir, 'fotos-artistas.json'), 'utf8'));
    assert.equal(cache.fotos['chilled pig'], null);

    // Segunda corrida: ya está cacheado (aunque sea null), no debe volver a pedir.
    await enriquecerFotosArtistas(dir);
    assert.equal(llamado.mock.calls.length, 1, 'solo un pedido de busqueda, la segunda corrida no reintenta');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('separa creditos multiples y no busca el string combinado', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Zedd · Troye Sivan' }]);
    const busquedas = [];
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/search/artist')) {
        busquedas.push(decodeURIComponent(new URL(u).searchParams.get('q')));
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });

    await enriquecerFotosArtistas(dir);
    assert.deepEqual(busquedas.sort(), ['Troye Sivan', 'Zedd']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un artista ya cacheado no se vuelve a pedir', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'A' }]);
    writeFileSync(join(dir, 'fotos-artistas.json'), JSON.stringify({ fotos: { a: 'ya-esta.jpg' } }));
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    global.fetch = llamado;

    const resultado = await enriquecerFotosArtistas(dir);
    assert.equal(resultado.total, 0, 'no habia pendientes');
    assert.equal(llamado.mock.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un fallo de red en un artista no corta el resto del lote ni se cachea', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Falla' }, { id: 't2', artista: 'Funciona' }]);
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('q=Falla')) throw new Error('red caida');
      if (u.includes('/search/artist')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });

    const resultado = await enriquecerFotosArtistas(dir);
    assert.equal(resultado.total, 2);

    const cache = JSON.parse(readFileSync(join(dir, 'fotos-artistas.json'), 'utf8'));
    assert.equal(Object.hasOwn(cache.fotos, 'falla'), false, 'fallo de red: queda pendiente');
    assert.equal(cache.fotos.funciona, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('onProgreso se llama con los numeros correctos', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'A' }, { id: 't2', artista: 'B' }]);
    global.fetch = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));

    const llamadas = [];
    await enriquecerFotosArtistas(dir, { onProgreso: (procesados, total) => llamadas.push([procesados, total]) });

    assert.deepEqual(llamadas, [[1, 2], [2, 2]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
