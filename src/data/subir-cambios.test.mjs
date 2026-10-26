import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirCambiosAlPC } from './subir-cambios.js';

function montar(respuestas, cambios) {
  const enviados = [];
  let descartados = null;
  return {
    enviados,
    descartados: () => descartados,
    deps: {
      obtener: async () => cambios,
      descartar: async (n) => { descartados = n; },
      enviar: async (_b, _m, ruta) => { enviados.push(ruta); return { status: respuestas[ruta] ?? 200, datos: {} }; },
    },
  };
}
const c = (endpoint) => ({ endpoint, cuerpo: {}, ts: 1 });

test('si el PC rechaza un alta no se descarta ni se siguen enviando las demás', async () => {
  const m = montar({ 'agregar-track': 500 }, [c('override'), c('agregar-track'), c('asignar')]);
  const r = await subirCambiosAlPC('http://x', m.deps);
  assert.deepEqual(r, { aplicados: 1, altaRechazada: true });
  assert.equal(m.descartados(), 1);
  assert.deepEqual(m.enviados, ['override', 'agregar-track']);
});

test('un rechazo de algo que no es alta se salta y se descarta', async () => {
  const m = montar({ asignar: 404 }, [c('asignar'), c('override')]);
  const r = await subirCambiosAlPC('http://x', m.deps);
  assert.deepEqual(r, { aplicados: 1, altaRechazada: false });
  assert.equal(m.descartados(), 2);
});

test('al subir /ejes viajan familia, autoRellenar y chipId del móvil y se conservan los moods solo del PC', async () => {
  const enviado = [];
  const movil = { id: 'tranquilo', nombre: 'Tranquilo', familia: 'estado', autoRellenar: false, chipId: 'tranquilo' };
  const soloPC = { id: 'rock', nombre: 'Rock', familia: 'genero', autoRellenar: true };
  const r = await subirCambiosAlPC('http://x', {
    obtener: async () => [{ endpoint: 'ejes', cuerpo: { ejes: [movil] }, ts: 1 }],
    descartar: async () => {},
    enviar: async (_b, metodo, ruta, cuerpo) => {
      if (metodo === 'GET') return { status: 200, datos: { ejes: [soloPC] } };
      enviado.push({ ruta, cuerpo });
      return { status: 200, datos: {} };
    },
  });
  assert.equal(r.aplicados, 1);
  assert.deepEqual(enviado[0].cuerpo.ejes, [movil, soloPC]);
});

test('al subir los moods se conservan familia, autoRellenar y chipId del móvil y los del PC', async () => {
  const delMovil = { id: 'tranquilo', nombre: 'Zen', familia: 'estado', autoRellenar: true, chipId: 'tranquilo' };
  const soloPC = { id: 'rock', nombre: 'Rock', familia: 'genero', autoRellenar: false };
  const cuerpos = [];
  const r = await subirCambiosAlPC('http://x', {
    obtener: async () => [{ endpoint: 'ejes', cuerpo: { ejes: [delMovil] }, ts: 1 }],
    descartar: async () => {},
    enviar: async (_b, metodo, ruta, cuerpo) => {
      if (metodo === 'GET') return { status: 200, datos: { ejes: [{ ...delMovil, familia: 'genero' }, soloPC] } };
      cuerpos.push({ ruta, cuerpo });
      return { status: 200, datos: {} };
    },
  });
  assert.equal(r.aplicados, 1);
  assert.deepEqual(cuerpos, [{ ruta: 'ejes', cuerpo: { ejes: [delMovil, soloPC] } }]);
});
