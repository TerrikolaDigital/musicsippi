// src/movil/AvisoProgreso.jsx
// Aviso fijo encima del mini-reproductor mientras se organizan las canciones
// y aviso final con «Ver moods». No bloquea: la app y la música siguen.
import { IconoM } from './iconos.jsx';
import { textoProgreso, textoResumen } from './avisos.js';

export default function AvisoProgreso({ estado, onVerModos, onUsarDatos, onReintentar, onCerrar }) {
  if (!estado || estado.fase === 'inactivo') return null;
  const listo = estado.fase === 'listo';
  const textoFinal = listo ? textoResumen(estado) : null;
  if (listo && !textoFinal) return null;
  const info = listo ? { texto: textoFinal, detalle: null, porcentaje: null } : textoProgreso(estado);
  if (!info) return null;
  const discreto = !listo && estado.fase !== 'error' && estado.fase !== 'esperando-wifi';
  const cerrable = listo || estado.fase === 'error' || estado.fase === 'esperando-wifi';
  return (
    <div className={`m-aviso-progreso${estado.fase === 'error' ? ' error' : ''}${discreto ? ' discreto' : ''}`} role="status" aria-live="polite">
      <div className="m-aviso-progreso-txt">
        <b>{info.texto}</b>
        {info.detalle && <small>{info.detalle}</small>}
      </div>
      {info.porcentaje !== null && (
        <div className="m-aviso-progreso-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.porcentaje}>
          <span style={{ transform: `scaleX(${info.porcentaje / 100})` }} />
        </div>
      )}
      <div className="m-aviso-progreso-acciones">
        {listo && estado.modosNuevos?.length > 0 && <button onClick={onVerModos}>Ver moods</button>}
        {estado.fase === 'esperando-wifi' && <button onClick={onUsarDatos}>Usar datos</button>}
        {estado.fase === 'error' && estado.reintentar && <button onClick={onReintentar}>Reintentar organizar</button>}
        {cerrable && (
          <button className="m-aviso-progreso-cerrar" aria-label="Cerrar aviso" onClick={onCerrar}>
            <IconoM nombre="cerrar" tamano={18} />
          </button>
        )}
      </div>
    </div>
  );
}
