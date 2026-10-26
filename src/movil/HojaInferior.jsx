// src/movil/HojaInferior.jsx
// Hoja que sube desde abajo: velo que cierra al tocar, tirador, arrastre hacia
// abajo para cerrar (mismo gesto que el reproductor) y foco al primer botón.
// Se muestra como capa 'hoja' (nav.capas), así que «atrás» la cierra.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useArrastreCerrar } from './useArrastreCerrar.js';

const DUR_CIERRE = 240; // ms; ver .hoja-saliendo en movil.css
// Tras abrirse (p. ej. por pulsación larga) el dedo aún está bajado: al soltarlo, el click
// caería en la opción que quede debajo. Se ignoran los clicks durante este margen.
export const MS_IGNORAR_CLICK = 350;

// Con una hoja abierta el fondo (Inicio, etc.) no debe desplazarse: se bloquea el scroll del
// documento (clase en <html>) mientras quede alguna hoja montada.
let hojasAbiertas = 0;
function bloquearFondo(bloquear) {
  hojasAbiertas = Math.max(0, hojasAbiertas + (bloquear ? 1 : -1));
  document.documentElement.classList.toggle('hoja-abierta', hojasAbiertas > 0);
}

export default function HojaInferior({ abierta, onCerrar: alCerrar, titulo, children }) {
  const hojaRef = useRef(null);
  const [saliendo, setSaliendo] = useState(false);
  const temporizador = useRef(null);
  const abiertaEn = useRef(Date.now());
  // Cierres del usuario (velo, Esc, arrastre): la hoja baja 240 ms y luego se cierra de verdad.
  // El temporizador hace de guarda (un segundo gesto no cierra dos veces) y se cancela si
  // la hoja se desmonta antes (p. ej. «atrás» durante la animación).
  const onCerrar = () => {
    if (temporizador.current) return;
    setSaliendo(true);
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    temporizador.current = setTimeout(alCerrar, quieto ? 0 : DUR_CIERRE);
  };
  useEffect(() => () => clearTimeout(temporizador.current), []);
  const { dy, arrastrando, asa } = useArrastreCerrar(onCerrar, { porAlto: true });

  useEffect(() => {
    if (!abierta) return undefined;
    bloquearFondo(true);
    return () => bloquearFondo(false);
  }, [abierta]);

  useEffect(() => {
    if (!abierta) return undefined;
    hojaRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
    // Solo al abrir: re-enfocar en cada render quitaría el foco de los campos de texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  if (!abierta) return null;
  // Siempre cuelga de la raíz del shell: una hoja abierta desde dentro de una pantalla quedaba
  // atrapada en su contexto de apilado y se pintaba bajo el mini reproductor y la barra.
  const destino = document.querySelector('.shell-movil') ?? document.body;
  return createPortal(
    <div
      className={`hoja-capa${saliendo ? ' saliendo' : ''}`}
      onClickCapture={(e) => {
        if (Date.now() - abiertaEn.current < MS_IGNORAR_CLICK) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="hoja-velo" onClick={onCerrar} aria-hidden="true" />
      <div
        ref={hojaRef}
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo ?? 'Opciones'}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: arrastrando ? 'none' : undefined }}
      >
        <div className="hoja-asa" {...asa}>
          <span className="hoja-tirador" aria-hidden="true" />
        </div>
        <div className="hoja-cuerpo">{children}</div>
      </div>
    </div>,
    destino
  );
}
