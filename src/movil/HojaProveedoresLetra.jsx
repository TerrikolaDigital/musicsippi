// src/movil/HojaProveedoresLetra.jsx
// «Elegir proveedor de letras»: lista todos los proveedores. El de la letra actual lleva ✓
// («Proveedor actual»), los que ya no la tenían ✕ («No se encontró la letra») y el resto una
// lupa («Toca para obtener»). Al tocar uno se busca solo en él y, si responde, pasa a ser la
// letra de la canción (y se recuerda por canción en la caché de letras).
import HojaInferior from './HojaInferior.jsx';
import { PROVEEDORES } from '../data/letras.js';

// Geometría de Lucide (ISC): check, search, x
const TRAZOS = {
  actual: <path d="M20 6 9 17l-5-5" />,
  pendiente: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  fallado: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
};

function Marca({ tipo }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {TRAZOS[tipo]}
    </svg>
  );
}

/**
 * @param {{actual: string|null, sinLetra: string[], buscando: string|null, aviso: string|null,
 *   onElegir: (id: string) => void, onCerrar: () => void}} props
 */
export default function HojaProveedoresLetra({ actual, sinLetra, buscando, aviso, onElegir, onCerrar }) {
  return (
    <HojaInferior abierta onCerrar={onCerrar} titulo="Elegir proveedor de letras">
      <div className="hoja-sub-cab">
        <h2>Elegir proveedor de letras</h2>
      </div>
      {aviso && (
        <p className="m-aviso" role="status">
          {aviso}
        </p>
      )}
      <ul className="hoja-proveedores">
        {PROVEEDORES.map(({ id, nombre }) => {
          const esActual = id === actual;
          const fallo = !esActual && sinLetra.includes(id);
          const tipo = esActual ? 'actual' : fallo ? 'fallado' : 'pendiente';
          const texto = esActual ? 'Proveedor actual' : fallo ? 'No se encontró la letra' : buscando === id ? 'Buscando…' : 'Toca para obtener';
          return (
            <li key={id}>
              <button
                type="button"
                className={`hoja-op hoja-proveedor ${tipo}`}
                disabled={buscando !== null}
                aria-current={esActual ? 'true' : undefined}
                onClick={() => !esActual && onElegir(id)}
              >
                <Marca tipo={tipo} />
                <span>
                  <b>{nombre}</b>
                  <small>{texto}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </HojaInferior>
  );
}
