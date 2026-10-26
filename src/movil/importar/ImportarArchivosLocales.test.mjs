import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararSeleccion, lineasResumen, textoResultado, formatearTamano } from './flujo-archivos-locales.js';

const archivo = (n, tamano = 3 * 1024 * 1024) => ({ uri: `content://x/${n}`, nombre: `${n}.mp3`, titulo: `T${n}`, artista: 'A', tamano, mime: 'audio/mpeg' });

test('elegir archivos con un adaptador falso da el resumen de un archivo preparado', async () => {
  const adaptador = { seleccionarArchivosLocales: async () => ({ archivos: [archivo(1)], errores: [], cancelado: false }) };
  const prep = await prepararSeleccion('archivos', adaptador);
  assert.equal(prep.estado, 'listo');
  assert.deepEqual(lineasResumen(prep), ['1 canción · 3 MB. Se quedan donde están: no se copian ni se duplican.']);
});

test('carpeta pide el árbol; cancelar o no dar permiso no es un error', async () => {
  let pedido = null;
  const adaptador = {
    seleccionarArchivosLocales: async (op) => {
      pedido = op;
      return { archivos: [], errores: [], cancelado: true };
    },
    escanearMediaStore: async () => ({ archivos: [], errores: [], permiso: false }),
  };
  assert.deepEqual(await prepararSeleccion('carpeta', adaptador), { estado: 'cancelado' });
  assert.deepEqual(pedido, { carpeta: true });
  assert.deepEqual(await prepararSeleccion('escanear', adaptador), { estado: 'sin_permiso' });
});

test('resumen con listas y archivos ilegibles; resultado con entradas ausentes', async () => {
  const prep = { estado: 'listo', archivos: [archivo(1), archivo(2)], errores: [{ nombre: 'x' }], bytes: 6 * 1024 * 1024 };
  const lineas = lineasResumen(prep, [{ nombre: 'Rock' }]);
  assert.equal(lineas.length, 3);
  assert.match(lineas[1], /1 lista para crear: Rock/);
  assert.match(lineas[2], /1 archivo no se puede leer/);
  const partes = textoResultado({ importados: 2, tracksNuevos: 2, omitidos: [], listas: [{ nombre: 'Rock', anadidas: 1, ausentes: 1 }, { nombre: 'Vacía', anadidas: 0, ausentes: 3 }] });
  assert.match(partes[0], /^2 canciones enlazadas/);
  assert.match(partes[1], /Rock.*1 canción; 1 entrada no estaba/);
  assert.match(partes[2], /Vacía.*no la he creado/);
  assert.equal(formatearTamano(1536 * 1024 * 1024), '1,5 GB');
});
