import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearVigilanteArranque, crearDiagnostico, esFalloDelReproductor, estadoVisible } from './arranque-nativo.js';
import { textoEstadoResolucion } from '../movil/formato.js';

function relojFalso() {
  const pendientes = new Map();
  let n = 0;
  return {
    programar: (fn, ms) => (pendientes.set(++n, { fn, ms }), n),
    cancelar: (id) => pendientes.delete(id),
    vencer() {
      const lista = [...pendientes.values()];
      pendientes.clear();
      lista.forEach((p) => p.fn());
    },
    get activos() {
      return pendientes.size;
    },
  };
}

function vigilante() {
  const reloj = relojFalso();
  const cambios = [];
  const v = crearVigilanteArranque({ esperaMs: 100, alCambiar: (e) => cambios.push(e), ...reloj });
  return { v, reloj, cambios };
}

test('una canción pedida que nunca arranca acaba en fallo visible', () => {
  const { v, reloj, cambios } = vigilante();
  v.iniciar();
  assert.equal(cambios.at(-1)?.fase, 'cargando');
  reloj.vencer();
  assert.deepEqual(cambios.at(-1), { fase: 'fallo', motivo: 'tiempo_agotado' });
});

test('si llega a sonar se limpia el aviso y el temporizador', () => {
  const { v, reloj, cambios } = vigilante();
  v.iniciar();
  v.sono();
  assert.equal(cambios.at(-1), null);
  assert.equal(reloj.activos, 0);
});

test('sonar tarde, tras el aviso, también lo limpia', () => {
  const { v, reloj, cambios } = vigilante();
  v.iniciar();
  reloj.vencer();
  v.sono();
  assert.equal(cambios.at(-1), null);
});

test('un fallo explícito se muestra con su motivo y para el temporizador', () => {
  const { v, reloj, cambios } = vigilante();
  v.iniciar();
  v.fallo('nativo');
  assert.deepEqual(cambios.at(-1), { fase: 'fallo', motivo: 'nativo' });
  assert.equal(reloj.activos, 0);
});

test('pedir otra canción reinicia la espera sin acumular temporizadores', () => {
  const { v, reloj } = vigilante();
  v.iniciar();
  v.iniciar();
  assert.equal(reloj.activos, 1);
});

test('el fallo del propio reproductor no acusa a la canción', () => {
  assert.equal(esFalloDelReproductor('nativo'), true);
  assert.equal(esFalloDelReproductor('nativo_rechazado'), true);
  assert.equal(esFalloDelReproductor('resolucion'), false);
  assert.equal(esFalloDelReproductor('no_disponible'), false);
  assert.equal(esFalloDelReproductor('nativo_http_403'), false);
});

test('estadoVisible: el error de búsqueda manda y el arranque rellena el hueco', () => {
  assert.equal(estadoVisible('error_red', { fase: 'fallo' }), 'error_red');
  assert.equal(estadoVisible(null, { fase: 'cargando' }), 'preparando');
  assert.equal(estadoVisible(null, { fase: 'fallo' }), 'no_arranca');
  assert.equal(estadoVisible(null, null), null);
  assert.equal(estadoVisible(null, undefined), null);
});

test('cada estado del arranque tiene texto: nunca se queda mudo', () => {
  assert.ok(textoEstadoResolucion('preparando'));
  assert.match(textoEstadoResolucion('no_arranca'), /reintentar/);
});

test('el diagnóstico guarda lo último y no filtra URLs firmadas', () => {
  const d = crearDiagnostico({ max: 2, ahora: () => 0, entorno: () => 'SM-S721B' });
  d.anotar('uno');
  d.anotar('dos');
  d.anotar('fallo', 'https://rr1.googlevideo.com/videoplayback?sig=SECRETO id=abc');
  const texto = d.informe();
  assert.match(texto, /SM-S721B/);
  assert.doesNotMatch(texto, /uno/);
  assert.doesNotMatch(texto, /SECRETO/);
  assert.match(texto, /fallo/);
  assert.match(texto, /id=abc/);
});
