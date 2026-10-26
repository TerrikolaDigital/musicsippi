// src/movil/TarjetaModo.jsx
// Tarjeta de color de un mood. Tocar abre; pulsación larga (500 ms) reproduce o, si se
// pasa `onMas`, abre el menú de acciones del mood.
// Un estado (cómo te sientes) lleva aura de círculos difuminados y el icono de su chip de
// «¿Cómo te sientes?» (`chipId`); un género (cómo suena) conserva las ondas y la carátula inclinada.
import { colorTarjeta } from './formato.js';
import { ICONOS_ANIMO } from './inicio/IconosAnimo.jsx';
import { estadoDeEje } from './inicio/estadosAnimo.js';
import { esEstado } from './modos.js';
import { formatearTitulo } from '../ui/formato.js';
import { PortadaImg } from './PortadaGenerada.jsx';
import OlaProgreso from './OlaProgreso.jsx';
import { usePulsacionLarga } from './pulsacionModo.js';

export default function TarjetaModo({ eje, conteo, portada, onAbrir, onReproducir, onMas, pequena, nuevo, activa, pausada }) {
  const larga = usePulsacionLarga(onMas ?? onReproducir);
  const animo = esEstado(eje) ? estadoDeEje(eje) : null;
  const Icono = animo ? ICONOS_ANIMO[animo.icono] : null;

  return (
    <button
      className={`tarjeta-modo${animo ? ' estado' : ''}${pequena ? ' pequena' : ''}${nuevo ? ' nueva' : ''}${activa ? ' activa' : ''}`}
      style={{ '--c': colorTarjeta(animo ? { ...eje, color: animo.color } : eje) }}
      {...larga.props}
      onClick={() => {
        if (larga.consumida()) return;
        onAbrir();
      }}
    >
      {activa && (
        <span className="tarjeta-modo-suena" role="img" aria-label="Sonando ahora">
          <OlaProgreso variante="icono" pausado={!!pausada} />
        </span>
      )}
      <b>{formatearTitulo(eje.nombre)}</b>
      <small>
        {conteo} {conteo === 1 ? 'canción' : 'canciones'}
      </small>
      {Icono ? (
        <span className="tarjeta-modo-icono" aria-hidden="true">
          <Icono />
        </span>
      ) : (
        <PortadaImg className="tarjeta-modo-portada" src={portada} texto={eje.nombre} loading="lazy" />
      )}
    </button>
  );
}
