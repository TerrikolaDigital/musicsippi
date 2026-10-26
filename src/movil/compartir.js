// src/movil/compartir.js
// «Compartir → Musicsippi» desde Spotify, YouTube Music o Deezer: el texto
// (que suele llevar una frase + el enlace) abre la hoja de añadir música, que
// lo lee sola. Si no es una playlist, la hoja muestra el error de siempre.
const MAX = 2000;

export function capaParaTextoCompartido(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return null;
  return { tipo: 'hoja', config: 'anadir', texto: limpio.slice(0, MAX) };
}

// Si ya hay una hoja abierta se sustituye (cambiarCapa): apilar otra dejaría un
// «atrás» que no hace nada. Devuelve true si abrió algo.
export function abrirTextoCompartido(nav, texto) {
  const capa = capaParaTextoCompartido(texto);
  if (!capa) return false;
  if (nav.capas.some((c) => c.tipo === 'hoja')) nav.cambiarCapa(capa);
  else nav.abrirCapa(capa);
  return true;
}
