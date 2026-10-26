import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinoArrastre, desplazamientoFila } from './reordenar.js';

test('el destino sigue al dedo en filas enteras y se queda dentro de los límites', () => {
  assert.equal(destinoArrastre({ origen: 5, dy: 0, alto: 60, min: 3, max: 9 }), 5);
  assert.equal(destinoArrastre({ origen: 5, dy: 31, alto: 60, min: 3, max: 9 }), 6); // más de media fila
  assert.equal(destinoArrastre({ origen: 5, dy: 29, alto: 60, min: 3, max: 9 }), 5);
  assert.equal(destinoArrastre({ origen: 5, dy: -130, alto: 60, min: 3, max: 9 }), 3);
  assert.equal(destinoArrastre({ origen: 5, dy: 900, alto: 60, min: 3, max: 9 }), 9);
});

test('alto inválido no mueve nada', () => {
  assert.equal(destinoArrastre({ origen: 5, dy: 200, alto: 0, min: 3, max: 9 }), 5);
});

test('las filas intermedias se apartan una fila para dejar hueco', () => {
  // Arrastrando la 5 hacia abajo hasta la 7: la 6 y la 7 suben una fila.
  assert.equal(desplazamientoFila({ i: 6, origen: 5, destino: 7, alto: 60 }), -60);
  assert.equal(desplazamientoFila({ i: 7, origen: 5, destino: 7, alto: 60 }), -60);
  assert.equal(desplazamientoFila({ i: 8, origen: 5, destino: 7, alto: 60 }), 0);
  // Hacia arriba hasta la 3: la 3 y la 4 bajan.
  assert.equal(desplazamientoFila({ i: 3, origen: 5, destino: 3, alto: 60 }), 60);
  assert.equal(desplazamientoFila({ i: 4, origen: 5, destino: 3, alto: 60 }), 60);
  assert.equal(desplazamientoFila({ i: 2, origen: 5, destino: 3, alto: 60 }), 0);
  assert.equal(desplazamientoFila({ i: 5, origen: 5, destino: 3, alto: 60 }), 0);
});
