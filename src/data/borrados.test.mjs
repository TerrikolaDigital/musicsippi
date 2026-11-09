import { test } from 'node:test';
import assert from 'node:assert/strict';
import { borradosPendientes } from './borrados.js';
import { subirCambiosAlPC } from './subir-cambios.js';

const e = (id) => ({ id, nombre: id });

test('una lista quitada en el móvil no se reañade desde el PC al subir /ejes', async () => {
  const enviado = [];
  await subirCambiosAlPC('http://x', {
    obtener: async () => [{ endpoint: 'ejes', cuerpo: { ejes: [e('a')], eliminados: ['b'] }, ts: 1 }],
    descartar: async () => {},
    enviar: async (_b, metodo, ruta, cuerpo) => {
      if (metodo === 'GET') return { status: 200, datos: { ejes: [e('a'), e('b'), e('nuevo-en-pc')] } };
      enviado.push({ ruta, cuerpo });
      return { status: 200, datos: {} };
    },
  });
  assert.deepEqual(enviado[0].cuerpo.ejes.map((x) => x.id), ['a', 'nuevo-en-pc']);
  assert.equal('eliminados' in enviado[0].cuerpo, false, 'el campo interno no viaja al PC');
});

test('borradosPendientes junta canciones quitadas, listas quitadas y modos unidos', () => {
  const r = borradosPendientes([
    { endpoint: 'quitar-track', cuerpo: { trackId: 't1' } },
    { endpoint: 'ejes', cuerpo: { ejes: [], eliminados: ['l1'] } },
    { endpoint: 'unir-modos', cuerpo: { origenId: 'o', destinoId: 'd' } },
    { endpoint: 'asignar', cuerpo: { trackId: 't2', ejeId: 'x' } },
  ]);
  assert.deepEqual([...r.tracks], ['t1']);
  assert.deepEqual([...r.ejes].sort(), ['l1', 'o']);
});

test('sin cambios pendientes no hay borrados', () => {
  const r = borradosPendientes(undefined);
  assert.equal(r.tracks.size + r.ejes.size, 0);
});
