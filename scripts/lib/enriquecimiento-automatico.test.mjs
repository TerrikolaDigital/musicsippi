import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dispararEnriquecimiento,
  estadoEnriquecimiento,
  reDescubrirYAutoConfirmar,
  refiltrarGenerosMusicbrainzSiHaceFalta,
} from './enriquecimiento-automatico.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'enriquecimiento-automatico-test-'));
}

function ejeSinClasificar() {
  return { id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999, activo: true, sistema: true, padre: null, descripcion: '', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] };
}

const FUENTES_VALIDAS = {
  version: 2,
  youtube: { search: { titulo: 'a', canal: 'b', descripcion: 'c' }, getInfo: { keywords: 'd', canal: 'e', descripcion: 'f' } },
  deezer: { generoAlbum: 'genre_id', requiereNombreExacto: true },
  musicbrainz: { generos: 'genres' },
  vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: { phonk: 'Phonk' } },
  transversales: [],
  umbrales: { masaMinima: 2, masaMinimaPorcentaje: 0.03 },
};

let fetchOriginal;
beforeEach(() => {
  fetchOriginal = global.fetch;
});
afterEach(() => {
  global.fetch = fetchOriginal;
});

test('con biblioteca vacia, dispararEnriquecimiento no hace nada y deja el estado inactivo', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks: [] }));
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar()] }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));

    await dispararEnriquecimiento(dir, {});
    assert.equal(estadoEnriquecimiento().activo, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un segundo disparo mientras el primero corre se encola, no corre en paralelo', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks: [] }));
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar()] }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));

    const cambiosDeEtapa = [];
    const onCambioEstado = (estado) => {
      if (estado.activo) cambiosDeEtapa.push(estado.etapa);
    };

    const p1 = dispararEnriquecimiento(dir, { onCambioEstado });
    const p2 = dispararEnriquecimiento(dir, { onCambioEstado });
    await Promise.all([p1, p2]);

    const vecesDeezer = cambiosDeEtapa.filter((e) => e === 'deezer').length;
    assert.equal(vecesDeezer, 2, 'el segundo disparo debio encolarse y correr un segundo ciclo completo');
    assert.equal(estadoEnriquecimiento().activo, false, 'al terminar todo, queda inactivo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el ciclo automatico corre Genius como ultima etapa y guarda el resultado si hay token', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'biblioteca.json'),
      JSON.stringify({
        tracks: [
          {
            id: 't1',
            artista: 'Nirvana',
            titulo: 'Smells Like Teen Spirit',
            ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }],
          },
        ],
      })
    );
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar()] }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));

    // Sin `contacto`, MusicBrainz se auto-omite sin llamar a fetch (ver
    // enriquecer-musicbrainz-core.mjs) — así que un fetch a esa API acá
    // significaría que el guard se rompió.
    global.fetch = mock.fn(async (url) => {
      const u = String(url);
      if (u.includes('api.deezer.com')) {
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (u.includes('api.genius.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              hits: [{ result: { id: 999, url: 'https://genius.com/x', primary_artist: { name: 'Nirvana' } } }],
            },
          }),
        };
      }
      throw new Error(`fetch inesperado a ${u}`);
    });

    const cambiosDeEtapa = [];
    const onCambioEstado = (estado) => {
      if (estado.activo) cambiosDeEtapa.push(estado.etapa);
    };

    await dispararEnriquecimiento(dir, { tokenGenius: 'token-de-prueba', onCambioEstado });

    assert.ok(cambiosDeEtapa.includes('genius'), 'Genius debio correr como etapa del ciclo');

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-genius.json'), 'utf8'));
    assert.deepEqual(meta.tracks.t1, { geniusId: 999, url: 'https://genius.com/x' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reDescubrirYAutoConfirmar solo mira tracks sin-clasificar y aplica el modo encontrado sin pantalla de revision', async () => {
  const dir = dirTemporal();
  try {
    const tracksSinClasificar = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      artista: 'A',
      titulo: `Cancion ${i}`,
      ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }],
    }));
    const tracksYaClasificados = Array.from({ length: 30 }, (_, i) => ({
      id: `ya${i}`,
      artista: 'B',
      titulo: `Otra ${i}`,
      ejes: [{ ejeId: 'pop', origen: 'manual', senal: 'ancla', score: 1 }],
    }));
    writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks: [...tracksSinClasificar, ...tracksYaClasificados] }));
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar(), { id: 'pop', nombre: 'Pop', tipo: 'gusto', orden: 1, activo: true, sistema: false, padre: null, descripcion: '', anclas: { artistas: [], titulos: [] }, tagsLastfm: [] }] }));
    writeFileSync(join(dir, 'descripciones-youtube.json'), JSON.stringify({ t0: 'esto es phonk', t1: 'esto es phonk', t2: 'esto es phonk' }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));

    await reDescubrirYAutoConfirmar(dir);

    const ejesFinal = JSON.parse(readFileSync(join(dir, 'ejes.json'), 'utf8'));
    const nuevoEje = ejesFinal.ejes.find((e) => e.origen === 'descubierto');
    assert.ok(nuevoEje, 'debio crear un modo nuevo (origen "descubierto") a partir de los 3 tracks de phonk');
    assert.equal(nuevoEje.nombre, 'Phonk');

    const bibFinal = JSON.parse(readFileSync(join(dir, 'biblioteca.json'), 'utf8'));
    const t0 = bibFinal.tracks.find((t) => t.id === 't0');
    assert.equal(t0.ejes.some((a) => a.ejeId === 'sin-clasificar'), false, 't0 gano un modo real, pierde sin-clasificar');
    assert.equal(t0.ejes.some((a) => a.ejeId === nuevoEje.id), true);

    const yaClasificado = bibFinal.tracks.find((t) => t.id === 'ya0');
    assert.equal(yaClasificado.ejes.some((a) => a.ejeId === 'pop'), true, 'los que ya estaban clasificados no se tocan');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refiltrarGenerosMusicbrainzSiHaceFalta reconsulta, reconstruye modos, y no se repite', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'biblioteca.json'),
      JSON.stringify({
        tracks: [
          {
            id: 't1',
            artista: 'Nirvana',
            titulo: 'X',
            ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }],
          },
        ],
      })
    );
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar()] }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({
        version: 1,
        tracks: { t1: { artistaMbid: 'mbid-1' } },
        artistas: { 'mbid-1': { nombre: 'Nirvana', generos: ['hip hop', 'psytrance'] } },
      })
    );
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Nirvana',
        genres: [
          { name: 'grunge', count: 66 },
          { name: 'hip hop', count: 1 },
        ],
      }),
    }));

    const resultado = await refiltrarGenerosMusicbrainzSiHaceFalta(dir, { contacto: 'test@example.com' });
    assert.ok(resultado);

    const meta = JSON.parse(readFileSync(join(dir, 'metadata-musicbrainz.json'), 'utf8'));
    assert.deepEqual(meta.artistas['mbid-1'].generos, ['grunge']);

    const marca = JSON.parse(readFileSync(join(dir, 'filtro-generos-musicbrainz.json'), 'utf8'));
    assert.equal(marca.version, 1);

    // Segunda corrida: ya no vuelve a consultar la red.
    global.fetch = mock.fn(async () => {
      throw new Error('no deberia llamarse de nuevo');
    });
    const resultado2 = await refiltrarGenerosMusicbrainzSiHaceFalta(dir, { contacto: 'test@example.com' });
    assert.equal(resultado2, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Bug real encontrado en la revisión de calidad de la Tarea 4: sin artistas
// cacheados (biblioteca nueva, o ninguno enriquecido todavía por
// MusicBrainz), refiltrarGenerosArtistasExistentes no cambia nada
// (`total: 0`) pero no es `omitido` — sin el corte explícito, esto disparaba
// una segunda pasada completa de embeddings (reconstruirTodosLosModos) en
// CADA instalación nueva, duplicando exactamente lo que
// rehacerModosSiCambioElAlgoritmo ya acaba de hacer un momento antes en el
// mismo ciclo. Se prueba que no llama a fetch en absoluto (no hay artistas
// que reconsultar) y que igual escribe la marca (no vuelve a intentarlo).
test('refiltrarGenerosMusicbrainzSiHaceFalta sin artistas cacheados no reconstruye modos de mas', async () => {
  const dir = dirTemporal();
  try {
    writeFileSync(join(dir, 'biblioteca.json'), JSON.stringify({ tracks: [] }));
    writeFileSync(join(dir, 'ejes.json'), JSON.stringify({ ejes: [ejeSinClasificar()] }));
    writeFileSync(join(dir, 'fuentes.json'), JSON.stringify(FUENTES_VALIDAS));
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({ version: 1, tracks: {}, artistas: {} })
    );
    const llamado = mock.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = llamado;

    const resultado = await refiltrarGenerosMusicbrainzSiHaceFalta(dir, { contacto: 'test@example.com' });
    assert.equal(resultado.total, 0);
    assert.equal(llamado.mock.calls.length, 0, 'sin artistas cacheados no hay nada que consultar');

    const marca = JSON.parse(readFileSync(join(dir, 'filtro-generos-musicbrainz.json'), 'utf8'));
    assert.equal(marca.version, 1, 'la marca se escribe igual, no hay nada que reintentar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
