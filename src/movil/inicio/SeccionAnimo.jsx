// src/movil/inicio/SeccionAnimo.jsx
// «¿Cómo te sientes?»: carrusel de una fila con los estados que el usuario eligió (hasta 10, con iconos propios);
// el último usado va primero y, al final, una tarjeta «Editar». Tocar un estado pone música de ese ánimo.
import { useMemo, useRef, useState } from 'react';
import OlaProgreso from '../OlaProgreso.jsx';
import { IconoM } from '../iconos.jsx';
import { ICONOS_ANIMO } from './IconosAnimo.jsx';
import { etiquetaAnimo, resolverAnimo } from './animo.js';
import { CLAVE_RECIENTES, animoDeEstado, carruselAnimo, marcarReciente } from './estadosAnimo.js';
import { useVectores } from './useVectores.js';
import { familiaDe } from '../modos.js';

function leerRecientes() {
  try {
    const l = JSON.parse(globalThis.localStorage?.getItem(CLAVE_RECIENTES) ?? '[]');
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function guardarRecientes(lista) {
  try {
    globalThis.localStorage?.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    // Solo orden de cortesía: si no se puede guardar, no pasa nada.
  }
}

export default function SeccionAnimo({ ctx, nav }) {
  // El orden de «recientes» se fija al montar: reordenar el carrusel bajo el dedo al tocar sería desconcertante.
  const [recientes, setRecientes] = useState(leerRecientes);
  const [inicial] = useState(recientes);
  const disponibles = useMemo(
    () => carruselAnimo(ctx.ejes, { tracks: ctx.tracks, conteos: ctx.conteos }, inicial),
    [ctx.tracks, ctx.ejes, ctx.conteos, inicial],
  );
  // Los vectores solo hacen falta si algún ánimo se resuelve por similitud; se leen al montar.
  const vectores = useVectores(ctx);
  const [pulsado, setPulsado] = useState(null);
  const temporizador = useRef(null);

  const tocar = (estado) => {
    const animo = animoDeEstado(estado);
    const nuevos = marcarReciente(recientes, estado.id);
    setRecientes(nuevos);
    guardarRecientes(nuevos);
    clearTimeout(temporizador.current);
    setPulsado(null);
    // Un frame después, para poder repetir la animación al tocar el mismo otra vez.
    requestAnimationFrame(() => {
      setPulsado(animo.id);
      temporizador.current = setTimeout(() => setPulsado(null), 900);
    });
    const r = resolverAnimo(animo, {
      tracks: ctx.tracks,
      ejes: ctx.ejes,
      conteos: ctx.conteos,
      vectores,
      historial: ctx.historial,
      marcas: ctx.noMeGusta,
    });
    if (!r || r.lista.length === 0) {
      ctx.avisar?.(`Aún no tengo música para sentirte ${animo.nombre.toLowerCase()}`);
      return;
    }
    // El estado (mood con este chip) del que viene lo que suena: con él se mide cuánto se oye de cada canción
    // (escuchada suma, saltada resta) para alimentar el estado solo. Sin mood que lo declare, no se mide.
    const mood = (ctx.ejes ?? []).find((e) => e.chipId === animo.id && familiaDe(e) === 'estado');
    ctx.reproducirSecuencia(r.lista, etiquetaAnimo(animo), { aleatorio: true, estadoId: mood?.id ?? null });
  };

  return (
    <>
      <div className="m-seccion">
        <h2>¿Cómo te sientes?</h2>
      </div>
      <div className="animo-carrusel" role="group" aria-label="Elige un ánimo">
        {disponibles.map((a) => {
          const suena = ctx.ejeActivo?.nombre === etiquetaAnimo(a);
          const Icono = ICONOS_ANIMO[a.icono];
          return (
            <button
              key={a.id}
              className={`animo-chip${pulsado === a.id ? ' pulsado' : ''}${suena ? ' suena' : ''}`}
              style={{ '--c': a.color }}
              aria-label={`${a.nombre}${a.frase ? `, ${a.frase}` : ''}${suena ? ', sonando' : ''}`}
              onClick={() => tocar(a)}
            >
              <span className="animo-aura" aria-hidden="true" />
              <span className="animo-emoji" aria-hidden="true">
                {Icono ? <Icono /> : a.emoji}
              </span>
              <b>{a.nombre}</b>
              {suena && (
                <span className="animo-suena" aria-hidden="true">
                  <OlaProgreso variante="icono" pausado={!ctx.sonando} />
                </span>
              )}
            </button>
          );
        })}
        <button className="animo-chip animo-editar" aria-label="Editar estados de ánimo" onClick={() => nav?.abrir({ tipo: 'config-estados' })}>
          <span className="animo-editar-icono" aria-hidden="true">
            <IconoM nombre="lapiz" tamano={26} />
          </span>
          <b>Editar</b>
        </button>
      </div>
    </>
  );
}
