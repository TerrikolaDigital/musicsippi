// src/movil/ChipTemporizador.jsx
// Indicador del temporizador para dormir (cuenta atrás o «al final»). Tocarlo
// abre la hoja del temporizador. No pinta nada si no hay temporizador.
import { useEffect, useState } from 'react';
import { IconoM } from './iconos.jsx';
import { textoTemporizador } from './formato.js';

export default function ChipTemporizador({ temporizador, corto = false, onTocar }) {
  const [, setTic] = useState(0);
  // La cuenta atrás va por minutos: basta refrescar cada 15 s.
  useEffect(() => {
    if (!temporizador?.finMs) return undefined;
    const id = setInterval(() => setTic((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [temporizador?.finMs]);
  const texto = textoTemporizador(temporizador, Date.now(), corto);
  if (!texto) return null;
  return (
    <button
      type="button"
      className={`chip-temporizador${corto ? ' corto' : ''}`}
      aria-label={`Temporizador para dormir: ${textoTemporizador(temporizador)}`}
      onClick={(e) => {
        e.stopPropagation();
        onTocar();
      }}
    >
      <IconoM nombre="luna" tamano={corto ? 16 : 18} />
      <span>{texto}</span>
    </button>
  );
}
