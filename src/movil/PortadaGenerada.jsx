// src/movil/PortadaGenerada.jsx
// Portada de reserva (color estable por hash + iniciales) y <PortadaImg>, que usa la
// carátula y cae a la generada si no hay URL o la imagen no carga.
import { useEffect, useRef, useState } from 'react';
import { respaldoDeUrl } from './respaldoPortadas.js';
import { esPortadaGenerica } from './portadaPlaceholder.js';
import { conTamano } from './tamanoPortada.js';
import { portadaGenerada } from './portadaGenerada.js';

export default function PortadaGenerada({ texto, className = '' }) {
  const { color, color2, iniciales } = portadaGenerada(texto);
  return (
    <span className={`portada-gen ${className}`} style={{ '--pg-1': color, '--pg-2': color2 }} aria-hidden="true">
      <i>{iniciales}</i>
    </span>
  );
}

// Una carátula que falla se reintenta una vez; si sigue fallando se prueba el respaldo (el pasado o el registrado
// para esa dirección en respaldoPortadas.js); solo sin ninguna se enseña la portada generada.
export function PortadaImg({ src, respaldo, texto, className = '', claseSin, loading, tam }) {
  const [fallos, setFallos] = useState([]); // urls que no cargaron del todo
  const [version, setVersion] = useState(0); // cambia para forzar el reintento
  const [esperando, setEsperando] = useState(false);
  const reintentadas = useRef(new Set());
  const temporizador = useRef(null);
  useEffect(() => () => clearTimeout(temporizador.current), []);
  const auto = respaldo ?? respaldoDeUrl(src);
  const url = [src, auto].find((u) => u && !fallos.includes(u));
  // La carátula gris genérica de Deezer carga «bien»: se detecta aparte y cuenta como fallo (pasa al respaldo).
  useEffect(() => {
    let vigente = true;
    if (url) esPortadaGenerica(url).then((gris) => vigente && gris && setFallos((f) => (f.includes(url) ? f : [...f, url])));
    return () => {
      vigente = false;
    };
  }, [url]);
  if (!url) return <PortadaGenerada texto={texto} className={claseSin ?? className} />;
  const alFallar = () => {
    if (!reintentadas.current.has(url)) {
      reintentadas.current.add(url);
      setEsperando(true);
      temporizador.current = setTimeout(() => {
        setEsperando(false);
        setVersion((v) => v + 1);
      }, 900);
      return;
    }
    setFallos((f) => [...f, url]);
  };
  return <img key={version} className={className || undefined} style={esperando ? { visibility: 'hidden' } : undefined} src={conTamano(url, tam)} alt="" loading={loading} decoding="async" onError={alFallar} />;
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
