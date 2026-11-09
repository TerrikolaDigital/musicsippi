// src/movil/SeccionSugeridas.jsx
// «Canciones sugeridas» al final de la lista de un mood: 10 canciones de fuera (Deezer) parecidas a lo que
// ya hay en él. ▶ la escucha sin añadirla; + la añade a la biblioteca y a este mood. «Otras sugerencias» cambia las 10.
// Solo se monta con la lista entera a la vista, con red y sin filtro; solo llama a YouTube al pulsar ▶ o +.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilaCancion from './FilaCancion.jsx';
import { cargarConCache, HORA_MS } from './inicio/cache.js';
import { deezerConIds, resolverVideo, useAccionesExternas } from './inicio/externas.js';
import {
  calcularSugeridas, firmaSemillas, haceFaltaOtras, paginaDe, semillasDe, sinLasPropias, viaDeAsignacion,
} from './sugeridas.js';
import { formatearTitulo } from '../ui/formato.js';
import { esLaQueSuena } from './cancionSonando.js';
import './sugeridas.css';

export default function SeccionSugeridas({ ctx, eje, canciones }) {
  const nombre = formatearTitulo(eje.nombre);
  const semillas = useMemo(() => semillasDe(canciones), [canciones]);
  const firma = firmaSemillas(semillas);
  const semillasRef = useRef(semillas);
  semillasRef.current = semillas;

  const raiz = useRef(null);
  const [cerca, setCerca] = useState(typeof IntersectionObserver === 'undefined');
  const [pool, setPool] = useState(null); // null = sin datos todavía
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [pagina, setPagina] = useState(0);
  const { estados, escuchar, poner } = useAccionesExternas(ctx, `Sugeridas para ${nombre}`);

  // Carga perezosa: solo cuando la sección está a punto de verse.
  useEffect(() => {
    const el = raiz.current;
    if (cerca || !el) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => entradas.some((e) => e.isIntersecting) && setCerca(true),
      { rootMargin: '400px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cerca]);

  useEffect(() => {
    if (!cerca || semillasRef.current.length === 0) return undefined;
    let vivo = true;
    setError(false);
    cargarConCache(`sugeridas:${eje.id}:${firma}`, {
      ttlMs: 24 * HORA_MS,
      // Una respuesta vacía de Deezer no se da por buena: se vuelve a pedir.
      valida: (e) => Array.isArray(e.datos) && e.datos.length > 0,
      cargar: () => calcularSugeridas({ semillas: semillasRef.current, dz: deezerConIds() }),
    })
      .then((r) => vivo && (setPool(r.datos), setPagina(0)))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [cerca, eje.id, firma, intento]);

  // Lo que ya está en la biblioteca (también lo recién añadido) deja de sugerirse.
  const candidatas = useMemo(() => (pool ? sinLasPropias(pool, ctx.tracks) : []), [pool, ctx.tracks]);
  const filas = useMemo(() => paginaDe(candidatas, pagina), [candidatas, pagina]);

  const anadir = useCallback(
    async (c) => {
      if (estados[c.id] === 'cargando') return;
      poner(c.id, 'cargando');
      let json;
      try {
        const videoId = await resolverVideo(ctx.buscarExterno, c);
        json = await ctx.agregarExterno({ titulo: c.titulo, artista: c.artista, videoId, coverUrl: c.cover });
      } catch {
        poner(c.id, 'error');
        ctx.avisar?.('No se pudo añadir esa canción');
        return;
      }
      const id = json?.track?.id;
      try {
        if (!id) throw new Error('sin id');
        if (viaDeAsignacion(eje) === 'coleccion') await ctx.guardarColeccion(id, eje.id, true);
        else await ctx.asignarEje(id, eje.id);
        ctx.avisar?.(`Añadida a ${nombre}`);
      } catch {
        ctx.avisar?.(`Añadida a tu biblioteca, pero no a ${nombre}`);
      }
      poner(c.id, 'ok');
    },
    [ctx, eje, nombre, estados, poner],
  );

  if (semillas.length === 0) return null;
  const sinDatos = pool !== null && candidatas.length === 0;
  if (sinDatos) return <div ref={raiz} />;
  return (
    <section ref={raiz} className="sugeridas" aria-label="Canciones sugeridas">
      <h2 className="sugeridas-titulo">Canciones sugeridas</h2>
      <p className="sugeridas-sub">Para añadir a {nombre}</p>
      {error && pool === null ? (
        <div className="sugeridas-error" role="status">
          <span>No se pudieron cargar sugerencias</span>
          <button className="pulsable" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      ) : pool === null ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="m-silueta" />
          ))}
        </div>
      ) : (
        <>
          {filas.map((c) => {
            const hecha = estados[c.id] === 'ok';
            return (
              <FilaCancion
                key={c.id}
                track={c}
                meta={{ coverUrl: c.cover }}
                activa={esLaQueSuena(ctx.trackActual, c)}
                pausada={!ctx.sonando}
                onTocar={() => escuchar(c)}
                onPlay={() => escuchar(c)}
                cargandoPlay={estados[`${c.id}:play`] === 'cargando'}
                iconoMas={hecha ? 'check' : 'mas'}
                etiquetaMas={hecha ? `Añadida a ${nombre}` : `Añadir a ${nombre}`}
                onMas={() => !hecha && anadir(c)}
              />
            );
          })}
          {haceFaltaOtras(candidatas.length) && (
            <button className="sugeridas-otras pulsable" onClick={() => setPagina((p) => p + 1)}>
              Otras sugerencias
            </button>
          )}
        </>
      )}
    </section>
  );
}
