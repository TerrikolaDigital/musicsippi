import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../data/copia-auto.js';
import { copiarSinFallar, desactivarCopia, elegirDestinoYCopiar } from './copiaAutoUi.js';

const base = (o = {}) => ({ primerUso: 1, uri: 'viejo', ultimaCopia: 0, ultimaEscritura: null, hash: null, fallos: 0, error: null, posposiciones: 0, ultimaPosposicion: null, ...o });

function montar(estadoIni, { uriElegida = 'nueva' } = {}) {
  let estado = estadoIni;
  let liberar;
  const puerta = new Promise((r) => { liberar = r; });
  let avisarEscritura;
  const empezo = new Promise((r) => { avisarEscritura = r; });
  const log = { escrituras: [], liberadas: [] };
  let bloquear = true;
  const deps = {
    leerEstado: async () => estado,
    guardarEstado: async (e) => { estado = e; },
    exportar: async () => '{"a":1}',
    escribir: async (uri, t) => {
      log.escrituras.push(uri);
      if (bloquear) { bloquear = false; avisarEscritura(); await puerta; }
      return { bytes: new TextEncoder().encode(t).length, sha256: await sha256Hex(t) };
    },
  };
  const nativo = {
    elegirDestinoCopia: async () => uriElegida,
    liberarDestinoCopia: async (u) => { log.liberadas.push(u); },
  };
  return { opts: { deps, nativo }, log, empezo, liberar, get estado() { return estado; } };
}

test('copia en curso + activar: espera, el estado final tiene la uri nueva y se copia a ella', async () => {
  const m = montar(base());
  const enVuelo = copiarSinFallar(m.opts);
  await m.empezo;
  const activando = elegirDestinoYCopiar(m.opts);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.estado.uri, 'viejo'); // la activación espera a la copia en curso
  m.liberar();
  await enVuelo;
  const final = await activando;
  assert.equal(m.estado.uri, 'nueva');
  assert.equal(final.uri, 'nueva');
  assert.notEqual(final.ultimaCopia, null); // sin falso error: la copia nueva sí se hizo
  assert.equal(final.error, null);
  assert.deepEqual(m.log.escrituras, ['viejo', 'nueva']);
  assert.deepEqual(m.log.liberadas, ['viejo']);
});

test('copia en curso + desactivar: el estado final tiene uri null', async () => {
  const m = montar(base());
  const enVuelo = copiarSinFallar(m.opts);
  await m.empezo;
  const desactivando = desactivarCopia(m.opts);
  m.liberar();
  await enVuelo;
  const final = await desactivando;
  assert.equal(final.uri, null);
  assert.equal(m.estado.uri, null);
  assert.deepEqual(m.log.liberadas, ['viejo']);
});

test('elegir destino cancelado devuelve null y no toca el estado', async () => {
  const m = montar(base());
  m.opts.nativo.elegirDestinoCopia = async () => null;
  assert.equal(await elegirDestinoYCopiar(m.opts), null);
  assert.equal(m.estado.uri, 'viejo');
});
