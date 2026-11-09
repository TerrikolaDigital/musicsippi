// src/movil/HojaExcluirArtista.jsx
// Tras varias canciones de un artista descartadas por saltos rápidos, pregunta si se deja de poner.
// Cerrarla sin responder la pospone esta sesión; solo «No» guarda el rechazo (`ctx.saltos.preguntaArtista`).
import { useState } from 'react';
import HojaInferior from './HojaInferior.jsx';

// Artistas cuya pregunta se pospuso al cerrar la hoja sin responder: solo en memoria, vuelve a salir al reabrir la app.
const pospuestas = new Set();

export default function HojaExcluirArtista({ ctx }) {
  const { preguntaArtista, responderArtista } = ctx.saltos;
  const [, repintar] = useState(0);
  if (!preguntaArtista || pospuestas.has(preguntaArtista.nombre)) return null;
  const { nombre, n } = preguntaArtista;
  return (
    <HojaInferior abierta onCerrar={() => { pospuestas.add(nombre); repintar((n) => n + 1); }} titulo={`Descartadas de ${nombre}`}>
      <p className="m-aviso">Has descartado {n} canciones de {nombre}. ¿Dejamos de ponerlo?</p>
      <button type="button" className="hoja-op peligro" onClick={() => responderArtista(true)}>
        <span>Sí, dejar de ponerlo</span>
      </button>
      <button type="button" className="hoja-op" onClick={() => responderArtista(false)}>
        <span>No</span>
      </button>
    </HojaInferior>
  );
}
