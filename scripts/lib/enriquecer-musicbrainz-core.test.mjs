import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enriquecerMusicbrainz, refiltrarGenerosArtistasExistentes } from './enriquecer-musicbrainz-core.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'enriquecer-mb-core-test-'));
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

test('sin contacto y con pendientes, no hace ninguna peticion y devuelve omitido', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'A', titulo: 'B' }]);
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = llamado;

    const resultado = await enriquecerMusicbrainz(dir, { contacto: undefined });
    assert.equal(resultado.omitido, true);
    assert.equal(llamado.mock.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track encontrado guarda mbid/album/anio y consulta el artista una vez', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Air', titulo: 'Sexy Boy' }]);
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/recording/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            recordings: [
              {
                id: 'rec-1',
                title: 'Sexy Boy',
                score: 100,
                length: 200000,
                releases: [{ title: 'Moon Safari', date: '1998-01-13', 'release-group': { 'secondary-types': [] } }],
                'artist-credit': [{ artist: { id: 'artist-1', name: 'Air' } }],
              },
            ],
          }),
        };
      }
      if (u.includes('/artist/')) {
        return { ok: true, status: 200, json: async () => ({ name: 'Air', genres: [{ name: 'electronic', count: 5 }] }) };
      }
      throw new Error(`URL inesperada en el test: ${u}`);
    });

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.encontrados, 1);
    assert.equal(resultado.artistasNuevos, 1);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.equal(meta.tracks.t1.album, 'Moon Safari');
    assert.equal(meta.tracks.t1.anio, 1998);
    assert.deepEqual(meta.artistas['artist-1'].generos, ['electronic']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track ya enriquecido no se vuelve a pedir', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'A', titulo: 'B' }]);
    writeFileSync(join(dir, 'metadata-musicbrainz.json'), JSON.stringify({ version: 1, tracks: { t1: { mbid: null, album: null, anio: null } }, artistas: {} }));
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = llamado;

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.total, 0);
    assert.equal(llamado.mock.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un error de red persistente en un track no corta el resto del lote (queda pendiente, no se cachea)', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [
      { id: 't1', artista: 'Falla', titulo: 'Uno' },
      { id: 't2', artista: 'Funciona', titulo: 'Dos' },
    ]);
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('artist%3A%22Falla%22') || u.includes('artist:"Falla"')) throw new Error('red caida');
      if (u.includes('/recording/')) return { ok: true, status: 200, json: async () => ({ recordings: [] }) };
      throw new Error(`URL inesperada: ${u}`);
    });

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.saltados, 1);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.equal(Object.hasOwn(meta.tracks, 't1'), false, 't1 fallo de red, queda pendiente');
    assert.equal(meta.tracks.t2.mbid, null, 't2 si se resolvio (sin resultado real, no fallo)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si el titulo con sufijo de edicion no aparece, reintenta sin el sufijo', async () => {
  const dir = dirTemporal();
  try {
    // Caso real: 17 tracks de Soda Stereo importados con "(SEP7IMO DIA)"
    // pegado al titulo (el album de la gira). Ese sufijo no es ninguna de las
    // PALABRAS_EDICION conocidas, asi que la busqueda exacta no encontraba
    // nada y los 17 quedaban sin clasificar para siempre.
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Soda Stereo', titulo: 'Prófugos (SEP7IMO DIA)' }]);
    const consultas = [];
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/recording/')) {
        const q = decodeURIComponent(u.split('query=')[1]);
        consultas.push(q);
        // MusicBrainz solo conoce el titulo sin el sufijo.
        if (q.includes('SEP7IMO')) return { ok: true, status: 200, json: async () => ({ recordings: [] }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            recordings: [
              {
                id: 'rec-1',
                title: 'Prófugos',
                score: 100,
                length: 250000,
                releases: [{ title: 'Signos', date: '1986-01-01', 'release-group': { 'secondary-types': [] } }],
                'artist-credit': [{ artist: { id: 'artist-1', name: 'Soda Stereo' } }],
              },
            ],
          }),
        };
      }
      if (u.includes('/artist/')) {
        return { ok: true, status: 200, json: async () => ({ name: 'Soda Stereo', genres: [{ name: 'rock', count: 5 }] }) };
      }
      throw new Error(`URL inesperada en el test: ${u}`);
    });

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.encontrados, 1);
    assert.equal(consultas.length, 2, 'primero prueba el titulo tal cual, despues sin sufijo');
    assert.equal(consultas[0].includes('SEP7IMO'), true);
    assert.equal(consultas[1].includes('SEP7IMO'), false);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.equal(meta.tracks.t1.album, 'Signos');
    assert.deepEqual(meta.artistas['artist-1'].generos, ['rock']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('si el titulo tal cual ya aparece, no gasta una segunda consulta', async () => {
  const dir = dirTemporal();
  try {
    // "This Girl (Kungs Vs. Cookin' On 3 Burners)" es el titulo de verdad, no
    // un sufijo pegado: el reintento solo existe para cuando el exacto falla.
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Kungs', titulo: "This Girl (Kungs Vs. Cookin' On 3 Burners)" }]);
    const consultas = [];
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/recording/')) {
        consultas.push(decodeURIComponent(u.split('query=')[1]));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            recordings: [
              {
                id: 'rec-1',
                title: "This Girl (Kungs Vs. Cookin' On 3 Burners)",
                score: 100,
                length: 195000,
                releases: [{ title: 'Layers', date: '2016-01-01', 'release-group': { 'secondary-types': [] } }],
                'artist-credit': [{ artist: { id: 'artist-1', name: 'Kungs' } }],
              },
            ],
          }),
        };
      }
      if (u.includes('/artist/')) return { ok: true, status: 200, json: async () => ({ name: 'Kungs', genres: [] }) };
      throw new Error(`URL inesperada en el test: ${u}`);
    });

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.encontrados, 1);
    assert.equal(consultas.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track que fallo antes del reintento se vuelve a encolar una sola vez', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Soda Stereo', titulo: 'Signos (SEP7IMO DIA)' }]);
    // Entrada vieja: fallo cuando solo se buscaba el titulo exacto. Sin
    // volver a encolarla, el arreglo del sufijo no le serviria a nadie que ya
    // haya corrido el enriquecimiento.
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({ version: 1, tracks: { t1: { mbid: null, album: null, anio: null } }, artistas: {} })
    );
    let consultas = 0;
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('/recording/')) {
        consultas++;
        return { ok: true, status: 200, json: async () => ({ recordings: [] }) };
      }
      throw new Error(`URL inesperada en el test: ${u}`);
    });

    await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(consultas > 0, true, 'se reintento');
    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.equal(meta.tracks.t1.reintentoSinSufijo, true, 'queda marcado como ya reintentado');

    // Segunda corrida: ya no lo toca.
    consultas = 0;
    await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(consultas, 0, 'no se reintenta para siempre');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un track sin sufijo que ya fallo no se vuelve a encolar', async () => {
  const dir = dirTemporal();
  try {
    escribirBiblioteca(dir, [{ id: 't1', artista: 'Alguien', titulo: 'Una Cancion' }]);
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({ version: 1, tracks: { t1: { mbid: null, album: null, anio: null } }, artistas: {} })
    );
    global.fetch = mock.fn(async () => {
      throw new Error('no deberia consultarse nada');
    });

    const resultado = await enriquecerMusicbrainz(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.encontrados, 0);
    assert.equal(resultado.sinResultado, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refiltrarGenerosArtistasExistentes reemplaza los generos de un artista ya cacheado por el top filtrado', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({
        version: 1,
        tracks: {},
        artistas: { 'artist-1': { nombre: 'Nirvana', generos: ['grunge', 'hip hop', 'psytrance', 'rock', 'pop'] } },
      })
    );
    global.fetch = mock.fn(async (url) => {
      if (String(url).includes('/artist/artist-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: 'Nirvana',
            genres: [
              { name: 'grunge', count: 66 },
              { name: 'alternative rock', count: 29 },
              { name: 'rock', count: 25 },
              { name: 'hip hop', count: 1 },
              { name: 'psytrance', count: 1 },
            ],
          }),
        };
      }
      throw new Error(`URL inesperada en el test: ${url}`);
    });

    const resultado = await refiltrarGenerosArtistasExistentes(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.procesados, 1);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.deepEqual(meta.artistas['artist-1'].generos, ['grunge', 'alternative rock', 'rock']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refiltrarGenerosArtistasExistentes sin contacto no hace ninguna peticion', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({ version: 1, tracks: {}, artistas: { 'artist-1': { nombre: 'X', generos: ['y'] } } })
    );
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = llamado;

    const resultado = await refiltrarGenerosArtistasExistentes(dir, { contacto: undefined });
    assert.equal(resultado.omitido, true);
    assert.equal(llamado.mock.calls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refiltrarGenerosArtistasExistentes sin artistas cacheados no hace nada', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(join(dir, 'metadata-musicbrainz.json'), JSON.stringify({ version: 1, tracks: {}, artistas: {} }));
    // Sin `contacto` a propósito: prueba que el chequeo de "sin artistas"
    // corre ANTES que el de "sin contacto", no solo que el resultado da 0.
    const resultado = await refiltrarGenerosArtistasExistentes(dir, { contacto: undefined });
    assert.equal(resultado.total, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refiltrarGenerosArtistasExistentes no corta el resto del lote si un artista falla', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({
        version: 1,
        tracks: {},
        artistas: {
          'falla': { nombre: 'Falla', generos: ['x'] },
          'funciona': { nombre: 'Funciona', generos: ['y'] },
        },
      })
    );
    global.fetch = mock.fn(async (url) => {
      if (String(url).includes('/artist/falla')) throw new Error('red caida');
      if (String(url).includes('/artist/funciona')) {
        return { ok: true, status: 200, json: async () => ({ name: 'Funciona', genres: [{ name: 'pop', count: 5 }] }) };
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const resultado = await refiltrarGenerosArtistasExistentes(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.saltados, 1);
    assert.equal(resultado.procesados, 1);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.deepEqual(meta.artistas.falla.generos, ['x'], 'el que fallo se queda con lo que tenia');
    assert.deepEqual(meta.artistas.funciona.generos, ['pop']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
