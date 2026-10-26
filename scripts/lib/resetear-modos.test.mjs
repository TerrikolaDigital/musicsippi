import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetearModosDescubiertos, restaurarManuales } from './resetear-modos.mjs';

function eje(id, nombre, extra = {}) {
  return { id, nombre, tipo: 'gusto', orden: 1, activo: true, sistema: false, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [], ...extra };
}
function asignacion(ejeId, origen = 'auto') {
  return { ejeId, origen, senal: 'x', score: 1 };
}

function estado() {
  return {
    ejesData: {
      ejes: [
        eje('sin-clasificar', 'Sin clasificar', { tipo: 'sistema', sistema: true }),
        eje('favoritos', 'Favoritas', { sistema: true }),
        eje('rock', 'Rock', { tipo: 'playlist' }),
        eje('instrumental-2', 'Instrumental', { origen: 'descubierto' }),
        eje('pop', 'Pop', { origen: 'descubierto' }),
        eje('entrenar', 'Entrenar', { tipo: 'funcional', origen: 'transversal' }),
      ],
    },
    biblioteca: {
      tracks: [
        // Solo lo clasifico el descubrimiento: al deshacerlo vuelve a "sin clasificar".
        { id: 't1', ejes: [asignacion('instrumental-2')] },
        // Ademas esta en una playlist del usuario: la playlist no se toca, pero
        // pertenecer a una lista NO es estar clasificado.
        { id: 't2', ejes: [asignacion('rock', 'manual'), asignacion('pop')] },
        // Alguien lo puso a mano en un modo descubierto: eso es intencion del usuario.
        { id: 't3', ejes: [asignacion('instrumental-2', 'manual')] },
        // Un transversal no es un modo descubierto: se queda.
        { id: 't4', ejes: [asignacion('entrenar'), asignacion('pop')] },
      ],
    },
  };
}

test('saca los modos descubiertos y sus asignaciones, sin tocar playlists ni transversales', () => {
  const { ejesData, biblioteca } = estado();
  resetearModosDescubiertos(ejesData, biblioteca);

  assert.deepEqual(
    ejesData.ejes.map((e) => e.id),
    ['sin-clasificar', 'favoritos', 'rock', 'entrenar'],
    'se van los dos descubiertos y nada mas'
  );
  const de = (id) => biblioteca.tracks.find((t) => t.id === id).ejes.map((a) => a.ejeId);
  assert.equal(de('t2').includes('rock'), true, 'la playlist del usuario queda intacta');
  assert.equal(de('t4').includes('entrenar'), true, 'el transversal queda intacto');
  assert.equal(de('t2').includes('pop'), false);
});

test('el track que solo estaba clasificado por descubrimiento vuelve a "Sin clasificar"', () => {
  const { ejesData, biblioteca } = estado();
  resetearModosDescubiertos(ejesData, biblioteca);

  const de = (id) => biblioteca.tracks.find((t) => t.id === id).ejes.map((a) => a.ejeId);
  assert.equal(de('t1').includes('sin-clasificar'), true);
  // Estar en una playlist no cuenta como clasificacion (mismo criterio que
  // /api/coleccion, que nunca saca sin-clasificar).
  assert.equal(de('t2').includes('sin-clasificar'), true, 'pertenecer a "Rock" no es estar clasificado');
  // Un transversal tampoco cuenta (mismo criterio que aplicarModosConfirmados).
  assert.equal(de('t4').includes('sin-clasificar'), true);
});

test('no deja "Sin clasificar" duplicado si el track ya lo tenia', () => {
  const { ejesData, biblioteca } = estado();
  biblioteca.tracks.push({ id: 't5', ejes: [asignacion('sin-clasificar'), asignacion('pop')] });
  resetearModosDescubiertos(ejesData, biblioteca);

  const t5 = biblioteca.tracks.find((t) => t.id === 't5');
  assert.equal(t5.ejes.filter((a) => a.ejeId === 'sin-clasificar').length, 1);
});

test('recuerda las asignaciones manuales y las restaura sobre el modo con el mismo nombre', () => {
  const { ejesData, biblioteca } = estado();
  const { manuales } = resetearModosDescubiertos(ejesData, biblioteca);
  assert.deepEqual(manuales, [{ trackId: 't3', nombre: 'Instrumental' }]);

  // El descubrimiento nuevo vuelve a crear un modo "Instrumental", con otro id.
  ejesData.ejes.push(eje('instrumental-3', 'Instrumental', { origen: 'descubierto' }));
  const restaurados = restaurarManuales(ejesData, biblioteca, manuales);

  assert.equal(restaurados, 1);
  const t3 = biblioteca.tracks.find((t) => t.id === 't3');
  const a = t3.ejes.find((x) => x.ejeId === 'instrumental-3');
  assert.equal(a.origen, 'manual', 'sigue siendo una eleccion del usuario, no del algoritmo');
  assert.equal(t3.ejes.some((x) => x.ejeId === 'sin-clasificar'), false, 'y vuelve a contar como clasificado');
});

test('una manual cuyo modo ya no existe no rompe nada ni inventa un eje', () => {
  const { ejesData, biblioteca } = estado();
  const { manuales } = resetearModosDescubiertos(ejesData, biblioteca);
  const antes = ejesData.ejes.length;
  assert.equal(restaurarManuales(ejesData, biblioteca, manuales), 0);
  assert.equal(ejesData.ejes.length, antes);
});

test('sin modos descubiertos no cambia nada', () => {
  const ejesData = { ejes: [eje('sin-clasificar', 'Sin clasificar', { tipo: 'sistema', sistema: true })] };
  const biblioteca = { tracks: [{ id: 't1', ejes: [asignacion('sin-clasificar')] }] };
  const antes = JSON.stringify({ ejesData, biblioteca });
  const r = resetearModosDescubiertos(ejesData, biblioteca);
  assert.equal(r.ejesQuitados, 0);
  assert.equal(JSON.stringify({ ejesData, biblioteca }), antes);
});
