// src/movil/PortadaGenerada.jsx
// Portada de reserva (color estable por hash + iniciales) y <PortadaImg>, que usa la
// carátula y cae a la generada si no hay URL o la imagen no carga.
import { useState } from 'react';
import { portadaGenerada } from './portadaGenerada.js';

export default function PortadaGenerada({ texto, className = '' }) {
  const { color, color2, iniciales } = portadaGenerada(texto);
  return (
    <span className={`portada-gen ${className}`} style={{ '--pg-1': color, '--pg-2': color2 }} aria-hidden="true">
      <i>{iniciales}</i>
    </span>
  );
}

export function PortadaImg({ src, texto, className = '', claseSin, loading }) {
  const [fallo, setFallo] = useState(null); // url que no cargó
  if (!src || src === fallo) return <PortadaGenerada texto={texto} className={claseSin ?? className} />;
  return <img className={className || undefined} src={src} alt="" loading={loading} onError={() => setFallo(src)} />;
}

// Portada con fundido cruzado: `capas` sale de useCruce (la nueva aparece sobre la anterior).
// Sin capas (sin carátula o imagen caída) se ve la portada generada.
export function PortadaCruce({ capas, texto, className = '', claseSin }) {
  return (
    <div className={className}>
      {capas.length === 0 && <PortadaGenerada texto={texto} className={claseSin} />}
      {capas.map((c) => (
        <img key={c.k} className="cruce-capa" src={c.url} alt="" />
      ))}
    </div>
  );
}
