// src/movil/Pestanas.jsx
// Pestañas de una pantalla (mismo control en Biblioteca, Artista, Historial y Estadísticas):
// segmentado de ancho completo, toques de 48 px. Las filas de filtros que se desplazan en
// horizontal (Buscar, géneros) siguen siendo chips (.m-chips).
export default function Pestanas({ opciones, valor, onCambio, etiqueta, className = '' }) {
  return (
    <div className={`m-segmentado ${className}`.trim()} role="tablist" aria-label={etiqueta}>
      {opciones.map(([id, nombre]) => (
        <button key={id} role="tab" aria-selected={valor === id} className={valor === id ? 'on' : ''} onClick={() => onCambio(id)}>
          {nombre}
        </button>
      ))}
    </div>
  );
}
