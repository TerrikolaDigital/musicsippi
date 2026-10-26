// src/movil/pantallas/Interruptor.jsx
// Interruptor accesible (role=switch) con el estilo de Ajustes > Sonido.
import '../ecualizador.css';

export default function Interruptor({ activo, onCambio, etiqueta, desactivado }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={desactivado}
      className={`ec-interruptor${activo ? ' activo' : ''}`}
      onClick={() => onCambio(!activo)}
    >
      <span />
    </button>
  );
}
