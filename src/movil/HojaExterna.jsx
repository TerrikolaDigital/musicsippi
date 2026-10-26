// src/movil/HojaExterna.jsx
// Menú de una canción de fuera (resultado de Buscar, tendencias…): añadirla o marcarla con
// «No me gusta» para que no vuelva a recomendarse. Se abre con la pulsación larga de la fila.
import { useEffect, useRef } from 'react';
import HojaInferior from './HojaInferior.jsx';
import { IconoM } from './iconos.jsx';
import { entradaArtista, entradaCancion } from './noMeGusta.js';
import { formatearTitulo } from '../ui/formato.js';

function Opcion({ icono, children, onClick }) {
  return (
    <button className="hoja-op" onClick={onClick}>
      <IconoM nombre={icono} />
      <span>{children}</span>
    </button>
  );
}

export default function HojaExterna({ ctx, cancion, onAgregar, onCerrar }) {
  // Es una capa de navegación: «atrás» de Android la cierra en vez de salir de la pantalla.
  // Todo cierre pasa por nav.atras(); cuando la capa desaparece, el padre desmonta la hoja (onCerrar).
  const { nav } = ctx;
  const abierta = nav.capas.some((c) => c.tipo === 'hoja-externa');
  const pedida = useRef(false);
  const vista = useRef(false);
  useEffect(() => {
    if (pedida.current) return;
    pedida.current = true;
    nav.abrirCapa({ tipo: 'hoja-externa' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (abierta) vista.current = true;
    else if (vista.current) onCerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);
  const cerrar = () => nav.atras();
  const marcar = (entrada) => {
    ctx.marcarNoMeGusta(entrada);
    cerrar();
  };
  return (
    <HojaInferior abierta onCerrar={cerrar} titulo={formatearTitulo(cancion.titulo)}>
      {onAgregar && (
        <Opcion
          icono="mas"
          onClick={() => {
            onAgregar();
            cerrar();
          }}
        >
          Añadir a tu biblioteca
        </Opcion>
      )}
      <Opcion icono="no-me-gusta" onClick={() => marcar(entradaCancion(cancion))}>
        No me gusta esta canción
      </Opcion>
      {cancion.artista && (
        <Opcion icono="no-me-gusta" onClick={() => marcar(entradaArtista(cancion.artista))}>
          No quiero más de {formatearTitulo(cancion.artista)}
        </Opcion>
      )}
    </HojaInferior>
  );
}
