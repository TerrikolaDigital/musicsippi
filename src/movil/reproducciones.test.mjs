import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistroReproducciones, trackDeNota, unirAlHistorial, VENTANA_MISMA_MS } from './reproducciones.js';

const A = { id: 'a', titulo: 'Dance Alone', artista: 'Sia' };
const B = { id: 'b', titulo: 'Dos', artista: 'Beto' };
const C = { id: 'c', titulo: 'Tres', artista: 'Cris' };
const MIN = 60000;

function montar(opciones = {}) {
  const entradas = [];
  const registro = crearRegistroReproducciones({
    ...opciones,
    historial: () => entradas,
    entradaDe: (t, ts) => ({ trackId: t.trackIdReal ?? t.id, titulo: t.titulo, artista: t.artista, ts }),
    anotar: (e) => entradas.push(e),
  });
  return { entradas, registro, veces: (t) => entradas.filter((e) => e.titulo === t.titulo).length };
}

test('el efecto repetido sobre la misma canción no duplica (reintentos de resolución)', () => {
  const { registro, veces } = montar();
  for (let i = 0; i < 5; i += 1) registro.cambio(A, 1000 + i);
  assert.equal(veces(A), 1);
});

test('abrir la app con la sesión restaurada no cuenta: esa canción ya estaba anotada', () => {
  const { registro, veces } = montar({ ultimoId: A.id });
  registro.cambio(A, 1000);
  assert.equal(veces(A), 0);
  registro.cambio(B, 2000);
  registro.cambio(A, 3000);
  assert.equal(veces(A), 1);
  assert.equal(veces(B), 1);
});

test('cada vuelta de «repetir» cuenta: 10 vueltas son 10 reproducciones', () => {
  const { registro, veces } = montar();
  registro.cambio(A, 0);
  for (let i = 1; i < 10; i += 1) registro.nota(A, i * 3 * MIN);
  assert.equal(veces(A), 10);
});

test('con JS dormido cuentan todas las canciones por las que pasó la cola, con su hora real', () => {
  const { entradas, registro, veces } = montar();
  registro.cambio(A, 0);
  // Pantalla bloqueada: la cola nativa pasa por B, C y otra vez B. JS duerme.
  registro.nota(B, 3 * MIN);
  registro.nota(C, 6 * MIN);
  registro.nota(B, 9 * MIN);
  // Al despertar solo llega la última transición: JS adopta B y el efecto se dispara.
  registro.avanceNativo(B);
  registro.cambio(B, 60 * MIN);
  assert.equal(veces(B), 2, 'la adoptada al despertar no se cuenta otra vez');
  assert.equal(veces(C), 1);
  assert.deepEqual(entradas.filter((e) => e.titulo === 'Dos').map((e) => e.ts), [3 * MIN, 9 * MIN]);
});

test('con la app abierta, lo que anota el nativo y lo que anota JS es una sola reproducción', () => {
  const { registro, veces } = montar();
  registro.cambio(A, 1000); // ⏭ en la app: JS la anota primero
  registro.nota(A, 1300); // el servicio salta a ella y también la anota
  assert.equal(veces(A), 1);
});

test('volver a empezar la canción cuenta, salvo que acabe de empezar', () => {
  const { registro, veces } = montar();
  registro.cambio(A, 0);
  registro.reinicio(A, 5000);
  assert.equal(veces(A), 1, 'a los 5 s es la misma escucha');
  registro.reinicio(A, 4 * MIN);
  assert.equal(veces(A), 2);
});

test('otra canción dentro de la ventana no se confunde', () => {
  const { registro, veces } = montar();
  registro.cambio(A, 0);
  registro.nota(B, 1000);
  assert.equal(veces(B), 1);
});

test('la ventana se mide en los dos sentidos: el nativo puede llegar con hora anterior', () => {
  const { registro, veces } = montar();
  registro.cambio(A, 10000);
  registro.nota(A, 10000 - (VENTANA_MISMA_MS - 1));
  assert.equal(veces(A), 1);
  registro.nota(A, 10000 - VENTANA_MISMA_MS);
  assert.equal(veces(A), 2);
});

test('la misma canción con otro id (vista previa) también es la misma reproducción', () => {
  const { registro, veces } = montar();
  registro.cambio({ ...A, id: 'preview-xyz' }, 1000);
  registro.nota(A, 1300);
  assert.equal(veces(A), 1);
});

test('una anotación de algo que no está en la biblioteca ni en la cola se puede mostrar y volver a oír', () => {
  const t = trackDeNota({ id: 'vid123', titulo: 'Dance Alone', artista: 'Sia' });
  assert.equal(t.id, 'preview-vid123');
  assert.equal(t.youtubeVideoId, 'vid123');
  assert.equal(t.titulo, 'Dance Alone');
});

test('una anotación de un archivo local no inventa vídeo', () => {
  const t = trackDeNota({ id: 'local:t1', titulo: 'Uno', artista: 'Ana' });
  assert.equal(t.id, 't1');
  assert.equal(t.youtubeVideoId, undefined);
});

test('sin título no hay nada que mostrar', () => {
  assert.equal(trackDeNota({ id: 'vid' }), null);
});

test('lo anotado con retraso queda en su sitio: el historial sigue de nueva a vieja', () => {
  const r = unirAlHistorial([{ ts: 30 }, { ts: 10 }], [{ ts: 20 }, { ts: 40 }]);
  assert.deepEqual(r.map((e) => e.ts), [40, 30, 20, 10]);
});

test('el historial no crece sin límite', () => {
  assert.equal(unirAlHistorial([{ ts: 2 }, { ts: 1 }], [{ ts: 3 }], 2).length, 2);
});
