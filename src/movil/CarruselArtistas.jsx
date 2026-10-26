// src/movil/CarruselArtistas.jsx
// Carrusel horizontal de artistas en círculos tocables (Inicio y «Artistas
// similares» de la ficha de artista). Sin foto, o si falla, salen las iniciales.
import { useState } from 'react';
import { formatearTitulo } from '../ui/formato.js';

const iniciales = (nombre) =>
  formatearTitulo(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function Circulo({ foto, nombre }) {
  const [fallo, setFallo] = useState(false);
  return (
    <span className="artista-circulo">
      {foto && !fallo ? (
        <img src={foto} alt="" loading="lazy" onError={() => setFallo(true)} />
      ) : (
        <span aria-hidden="true">{iniciales(nombre)}</span>
      )}
    </span>
  );
}

// artistas: [{ nombre, foto, sub }]
export default function CarruselArtistas({ artistas, onAbrir }) {
  return (
    <div className="inicio-carrusel">
      {artistas.map((a) => (
        <button key={a.nombre} className="artista-tarjeta" onClick={() => onAbrir(a.nombre)}>
          <Circulo foto={a.foto} nombre={a.nombre} />
          <b>{formatearTitulo(a.nombre)}</b>
          {a.sub && <small>{a.sub}</small>}
        </button>
      ))}
    </div>
  );
}
