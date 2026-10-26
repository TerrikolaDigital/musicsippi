import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCanalWorker } from './canal-worker.js';

function workerFalso(responder) {
  const w = {
    onmessage: null,
    onerror: null,
    terminado: false,
    postMessage(m) {
      queueMicrotask(() => responder(m, (data) => w.onmessage?.({ data }), w));
    },
    terminate() {
      this.terminado = true;
    },
  };
  return w;
}

test('resuelve con el resultado y pasa el progreso del mismo id', async () => {
  const progresos = [];
  const pedir = crearCanalWorker(() =>
    workerFalso((m, enviar) => {
      enviar({ tipo: 'progreso', id: m.id, progreso: { fase: 'modos', hechas: 1, total: 2 } });
      enviar({ tipo: 'resultado', id: m.id, resultado: { eco: m.valor } });
    })
  );
  assert.deepEqual(await pedir('calcular', { valor: 7 }, (p) => progresos.push(p)), { eco: 7 });
  assert.deepEqual(progresos, [{ fase: 'modos', hechas: 1, total: 2 }]);
});

test('un error del worker rechaza con su mensaje', async () => {
  const pedir = crearCanalWorker(() => workerFalso((m, enviar) => enviar({ tipo: 'error', id: m.id, mensaje: 'sin modelo' })));
  await assert.rejects(pedir('calcular', {}), /sin modelo/);
});

test('si el worker muere, rechaza lo pendiente y la siguiente petición crea otro', async () => {
  let creados = 0;
  const pedir = crearCanalWorker(() => {
    creados += 1;
    const n = creados;
    return workerFalso((m, enviar, w) => {
      if (n === 1) w.onerror?.({ message: 'sin memoria' });
      else enviar({ tipo: 'resultado', id: m.id, resultado: 'ok' });
    });
  });
  await assert.rejects(pedir('calcular', {}), /sin memoria/);
  assert.equal(await pedir('calcular', {}), 'ok');
  assert.equal(creados, 2);
});

test('si postMessage lanza, rechaza esa petición y no deja pendientes', async () => {
  let creados = 0;
  const pedir = crearCanalWorker(() => {
    creados += 1;
    const w = workerFalso((m, enviar) => enviar({ tipo: 'resultado', id: m.id, resultado: 'ok' }));
    if (creados === 1) {
      w.postMessage = () => {
        throw new Error('no clonable');
      };
    }
    return w;
  });
  await assert.rejects(pedir('calcular', {}), /no clonable/);
  assert.equal(creados, 1);
});

test('un messageerror rechaza lo pendiente y la siguiente petición crea otro worker', async () => {
  let creados = 0;
  const pedir = crearCanalWorker(() => {
    creados += 1;
    const n = creados;
    return workerFalso((m, enviar, w) => {
      if (n === 1) w.onmessageerror?.({});
      else enviar({ tipo: 'resultado', id: m.id, resultado: 'ok' });
    });
  });
  await assert.rejects(pedir('calcular', {}), /ilegible/);
  assert.equal(await pedir('calcular', {}), 'ok');
  assert.equal(creados, 2);
});

test('terminar cierra el worker y la siguiente petición crea otro', async () => {
  const workers = [];
  const pedir = crearCanalWorker(() => {
    const w = workerFalso((m, enviar) => enviar({ tipo: 'resultado', id: m.id, resultado: 'ok' }));
    workers.push(w);
    return w;
  });
  await pedir('x', {});
  pedir.terminar();
  assert.equal(workers[0].terminado, true);
  await pedir('x', {});
  assert.equal(workers.length, 2);
});
