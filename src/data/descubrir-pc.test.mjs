import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descubrirPC } from './descubrir-pc.js';

test('prueba la última dirección antes de recorrer la subred guardada', async () => {
  const probadas = [];
  const encontrada = await descubrirPC({
    direccion: '192.168.4.7:51234', clave: 'k'.repeat(48),
    probar: async (d) => { probadas.push(d); if (d === '192.168.4.2:51234') return d; throw new Error('caído'); },
  });
  assert.equal(encontrada, '192.168.4.2:51234');
  assert.deepEqual(probadas.slice(0, 3), ['192.168.4.7:51234', '192.168.4.1:51234', '192.168.4.2:51234']);
});
