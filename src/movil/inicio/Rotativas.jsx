// src/movil/inicio/Rotativas.jsx
// Las secciones rotativas del día. Se montan en el orden elegido por fecha y se enseñan las
// de «a veces» las primeras `max` que tengan contenido (las de «siempre» salen todas y no gastan
// cupo): cada sección devuelve null si no tiene datos, así que se mira en el DOM (y se vuelve a
// mirar cuando llegan datos o carga un archivo perezoso).
// Mientras cargan se reserva la altura típica de un carrusel (esqueleto) para las que cabrían,
// y si el contenedor cambia de alto estando por encima de lo que el usuario ve, se corrige el
// scroll en la misma medida: así Inicio no salta al bajar mientras llegan las secciones.
import { useEffect, useRef } from 'react';
import { SECCIONES, rotativasSiempre } from './secciones.js';
import { leerConfigInicio } from './config.js';
import { SeccionCargada } from './cargador.jsx';

export const ESPERA_RESERVA_MS = 4000;

export default function Rotativas({ ids, max, ctx, nav }) {
  const raiz = useRef(null);
  const siempre = rotativasSiempre(leerConfigInicio());

  useEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    let esperando = true;
    const ajustar = () => {
      let ocupadas = 0;
      for (const hijo of el.children) {
        if (siempre.includes(hijo.dataset.seccion)) {
          hijo.hidden = false;
          hijo.classList.remove('reserva');
          continue;
        }
        const lleno = hijo.childElementCount > 0;
        hijo.hidden = lleno && ocupadas >= max;
        const reserva = !lleno && esperando && ocupadas < max;
        hijo.classList.toggle('reserva', reserva);
        if (lleno ? !hijo.hidden : reserva) ocupadas += 1;
      }
    };
    ajustar();
    const obs = new MutationObserver(ajustar);
    obs.observe(el, { childList: true, subtree: true });
    const fin = setTimeout(() => {
      esperando = false;
      ajustar();
    }, ESPERA_RESERVA_MS);
    // Si el contenedor entero queda por encima de la pantalla, su cambio de alto empujaría lo de debajo.
    let alto = el.getBoundingClientRect().height;
    const medir = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const delta = r.height - alto;
      if (delta !== 0 && r.bottom - delta <= 0) window.scrollBy(0, delta);
      alto = r.height;
    });
    medir.observe(el);
    return () => {
      clearTimeout(fin);
      obs.disconnect();
      medir.disconnect();
    };
  }, [ids.join(), max, siempre.join()]);

  return (
    <div ref={raiz} className="inicio-rotativas">
      {ids.map((id) => {
        const seccion = SECCIONES.find((s) => s.id === id);
        return seccion ? (
          <div key={id} data-seccion={id}>
            <SeccionCargada seccion={seccion} ctx={ctx} nav={nav} />
          </div>
        ) : null;
      })}
    </div>
  );
}
