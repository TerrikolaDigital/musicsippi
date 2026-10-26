import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importarArchivosLocales, parsearPlaylist, emparejarEntradas, nombreDeLista } from './importar-archivos-locales.js';
import { crearAlmacenMemoria } from '../../data/lib/almacen-memoria.js';
import { obtenerArchivoLocal } from '../../data/archivos-locales.js';
import { idTrackNavegador } from '../../data/lib/id-track-navegador.js';

const sistema = (id, nombre, tipo) => ({
  id, nombre, tipo, orden: id === 'favoritos' ? 0 : 999, activo: true, sistema: true, padre: null,
  anclas: { artistas: [], titulos: [] }, tagsLastfm: [],
});
const EJES = [sistema('sin-clasificar', 'Sin clasificar', 'sistema'), sistema('favoritos', 'Favoritas', 'gusto')];
const archivo = (n, extra = {}) => ({
  uri: `content://media/external/audio/media/${n}`, nombre: `Tema ${n}.mp3`, titulo: `Tema ${n}`, artista: 'Ella',
  tamano: 1000 + n, mime: 'audio/mpeg', ...extra,
});

test('importa un MP3 content y guarda su ubicación por trackId', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const r = await importarArchivosLocales({ archivos: [archivo(1, { album: 'Disco', duracionMs: 200000 })] }, almacen);
  assert.equal(r.tracksNuevos, 1);
  assert.equal(r.importados, 1);
  const id = await idTrackNavegador('Ella', 'Tema 1');
  assert.ok(r.tracks.some((t) => t.id === id && t.fuentes.includes('movil')));
  const loc = await obtenerArchivoLocal(id, 'movil', almacen);
  assert.equal(loc.uri, 'content://media/external/audio/media/1');
  assert.equal(loc.persistente, true);
  const meta = await almacen.obtenerPorClave('metadataLocal', id);
  assert.equal(meta.duracionMs, 200000);
  assert.equal(meta.album, 'Disco');
  const cambios = await almacen.obtenerValorConfig('cambiosPendientes', []);
  assert.equal(cambios[0].endpoint, 'importar-tunemymusic');
});

test('un M3U con una ruta perdida importa solo la encontrada y la informa', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const texto = '#EXTM3U\n#EXTINF:100,Ella - Tema 1\nC:\\Musica\\Tema 1.MP3\n#EXTINF:90,X - Perdida\n../otra/Perdida.mp3\n';
  const r = await importarArchivosLocales({ archivos: [archivo(1), archivo(2)], listas: [{ nombre: 'Mi_lista.m3u', texto }] }, almacen);
  assert.equal(r.listas.length, 1);
  assert.equal(r.listas[0].nombre, 'Mi lista');
  assert.equal(r.listas[0].anadidas, 1);
  assert.equal(r.listas[0].ausentes, 1);
  const lista = r.ejes.find((e) => e.nombre === 'Mi lista');
  assert.equal(lista.tipo, 'playlist');
  assert.equal(r.ejeLista, lista.id);
  const pertenecen = r.tracks.filter((t) => t.ejes.some((a) => a.ejeId === lista.id));
  assert.deepEqual(pertenecen.map((t) => t.titulo), ['Tema 1']);
  assert.equal(r.tracks.length, 2);
});

test('omite repetidos y entradas sin datos sin abortar el resto', async () => {
  const almacen = crearAlmacenMemoria({ ejes: EJES });
  const r = await importarArchivosLocales(
    {
      archivos: [
        archivo(1),
        archivo(1),
        archivo(3),
        { uri: '', nombre: 'roto.mp3' },
        archivo(3, { uri: 'content://copia/3', nombre: 'Tema 3 (copia).mp3' }),
      ],
    },
    almacen
  );
  assert.equal(r.importados, 2);
  assert.deepEqual(r.omitidos.map((o) => o.motivo).sort(), ['repetido', 'repetido', 'sin_datos']);
});

test('parsea PLS y M3U sin ejecutar nada', () => {
  assert.deepEqual(
    parsearPlaylist('[playlist]\nFile2=b/Dos.mp3\nTitle2=Dos\nFile1=a/Uno.mp3\nNumberOfEntries=2', 'x.pls'),
    [{ ruta: 'a/Uno.mp3' }, { ruta: 'b/Dos.mp3', titulo: 'Dos' }]
  );
  assert.deepEqual(parsearPlaylist('﻿#EXTM3U\n#EXTINF:1,A - B - C\nhttp://x/a.mp3\n', 'x.m3u8'), [
    { ruta: 'http://x/a.mp3', artista: 'A', titulo: 'B - C' },
  ]);
  const { encontradas, ausentes } = emparejarEntradas([{ ruta: 'http://x/Tema 1.mp3' }, { ruta: 'file:///s/Tema%201.mp3' }], [archivo(1)]);
  assert.equal(encontradas.length, 1);
  assert.equal(ausentes.length, 1);
  assert.equal(nombreDeLista('Rock_90.m3u8'), 'Rock 90');
});
