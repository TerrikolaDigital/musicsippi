// src/movil/pantallas/HistorialMovil.jsx
// Historial de reproducciones agrupado por día. Si la canción ya no está en la
// biblioteca (sonó desde una vista previa o un álbum) se usa la copia de
// título/artista guardada al sonar.
import { useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { agruparPorDia, rankingCanciones, rankingModos } from '../historial.js';
import { useTramos } from '../useTramos.js';
import { formatearTitulo } from '../../ui/formato.js';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import Pestanas from '../Pestanas.jsx';

const PESTANAS = [
  ['recientes', 'Recientes'],
  ['sonados', 'Más sonados'],
];

const hora = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default function HistorialMovil({ ctx, nav }) {
  const [pestana, setPestana] = useState('recientes');
  // Entradas con la canción resuelta, en orden de más nueva a más vieja.
  const entradas = useMemo(() => {
    const porId = new Map();
    for (const t of ctx.tracks) {
      porId.set(t.id, t);
      if (t.trackIdReal) porId.set(t.trackIdReal, t);
    }
    return ctx.historial
      .map((h, i) => {
        const real = porId.get(h.trackId);
        const track = real ?? (h.titulo ? { id: `hist-${h.trackId}-${i}`, trackIdReal: h.trackId, titulo: h.titulo, artista: h.artista ?? '', ejes: [] } : null);
        return track ? { ...h, ts: h.ts, track, enBiblioteca: !!real } : null;
      })
      .filter(Boolean);
  }, [ctx.historial, ctx.tracks]);

  const { cuantas, centinela } = useTramos(entradas.length, entradas.length);
  const visibles = useMemo(() => entradas.slice(0, cuantas), [entradas, cuantas]);
  const grupos = useMemo(() => agruparPorDia(visibles), [visibles]);
  // La cola que suena es el historial entero (solo las canciones de la biblioteca o con vista previa).
  const cola = useMemo(() => entradas.map((e) => e.track), [entradas]);

  const sonadas = useMemo(() => rankingCanciones(entradas), [entradas]);
  const colaSonadas = useMemo(() => sonadas.map((r) => r.track), [sonadas]);
  const modosSonados = useMemo(() => rankingModos(entradas, ctx.ejes), [entradas, ctx.ejes]);

  return (
    <SubpantallaMovil
      titulo="Historial"
      nav={nav}
      derecha={
        <button className="m-redondo" aria-label="Tus estadísticas" onClick={() => nav.abrir({ tipo: 'estadisticas' })}>
          <IconoM nombre="estadisticas" />
        </button>
      }
    >
      {entradas.length === 0 ? (
        <EstadoVacio titulo="Todavía no has escuchado nada" accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
          Lo que reproduzcas aparecerá aquí.
        </EstadoVacio>
      ) : (
        <>
          <Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} etiqueta="Qué ver del historial" />
          {pestana === 'sonados' && (
            <>
              {sonadas.map((r) => (
                <FilaCancion
                  key={r.track.id}
                  track={r.track}
                  meta={r.enBiblioteca ? ctx.metadataDe(r.track.id) : null}
                  activa={ctx.trackActual?.id === r.track.id}
                  pausada={!ctx.sonando}
                  subtitulo={formatearTitulo(r.track.artista)}
                  derecha={`${r.n} ${r.n === 1 ? 'vez' : 'veces'}`}
                  onTocar={() => ctx.reproducirLista(r.track, colaSonadas, 'Más sonadas')}
                  onMas={() => (r.enBiblioteca ? nav.abrirCapa({ tipo: 'hoja', trackId: r.track.id }) : ctx.reproducirLista(r.track, colaSonadas, 'Más sonadas'))}
                  onPulsacionLarga={r.enBiblioteca ? () => nav.abrirCapa({ tipo: 'hoja', trackId: r.track.id }) : undefined}
                />
              ))}
              {modosSonados.length > 0 && (
                <>
                  <div className="m-seccion">
                    <h2>Moods más sonados</h2>
                  </div>
                  {modosSonados.map((m) => (
                    <button key={m.ejeId} className="m-fila-modo" onClick={() => nav.abrir({ tipo: 'modo', ejeId: m.ejeId })}>
                      <b>{formatearTitulo(m.nombre)}</b>
                      <small>
                        {m.n} {m.n === 1 ? 'vez' : 'veces'}
                      </small>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
          {pestana === 'recientes' && grupos.map((g) => (
            <section key={g.etiqueta}>
              <div className="m-seccion">
                <h2>{g.etiqueta}</h2>
              </div>
              {g.entradas.map((e, i) => (
                <FilaCancion
                  key={`${e.ts}-${i}`}
                  track={e.track}
                  meta={e.enBiblioteca ? ctx.metadataDe(e.track.id) : null}
                  activa={ctx.trackActual?.id === e.track.id}
                  pausada={!ctx.sonando}
                  subtitulo={[formatearTitulo(e.track.artista), e.ejeNombre && formatearTitulo(e.ejeNombre)].filter(Boolean).join(' · ')}
                  derecha={hora(e.ts)}
                  onTocar={() => ctx.reproducirLista(e.track, cola, 'Historial')}
                  onMas={() => (e.enBiblioteca ? nav.abrirCapa({ tipo: 'hoja', trackId: e.track.id }) : ctx.reproducirLista(e.track, cola, 'Historial'))}
                  onPulsacionLarga={e.enBiblioteca ? () => nav.abrirCapa({ tipo: 'hoja', trackId: e.track.id }) : undefined}
                />
              ))}
            </section>
          ))}
          {pestana === 'recientes' && cuantas < entradas.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
        </>
      )}
    </SubpantallaMovil>
  );
}
