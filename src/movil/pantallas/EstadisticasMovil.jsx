// src/movil/pantallas/EstadisticasMovil.jsx
// «Tus estadísticas»: tiempo escuchado, lo más escuchado y reparto por modo, a partir del
// historial de reproducciones. Los cálculos viven en ../estadisticas.js (puro, con tests).
import { useMemo, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import Pestanas from '../Pestanas.jsx';
import FilaCancion from '../FilaCancion.jsx';
import CarruselArtistas from '../CarruselArtistas.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { calcularEstadisticas } from '../estadisticas.js';
import { colorTarjeta, duracionLarga } from '../formato.js';
import { formatearTitulo } from '../../ui/formato.js';
import { abrirResumen } from '../inicio/SeccionResumen.jsx';

const PERIODOS = [
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['anio', 'Año'],
  ['siempre', 'Siempre'],
];
const TEXTO_PERIODO = { semana: 'esta semana', mes: 'este mes', anio: 'este año', siempre: 'en total' };

const tiempo = (segundos) => duracionLarga(segundos * 1000);
const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

export default function EstadisticasMovil({ ctx, nav }) {
  const [periodo, setPeriodo] = useState('mes');
  const duracionDe = useMemo(() => {
    const m = new Map();
    for (const t of ctx.tracks) {
      const ms = ctx.metadataDe(t.trackIdReal ?? t.id)?.duracionMs;
      if (ms > 0) {
        m.set(t.id, ms / 1000);
        if (t.trackIdReal) m.set(t.trackIdReal, ms / 1000);
      }
    }
    return (id) => m.get(id) ?? null;
  }, [ctx.tracks, ctx.metadataDe]);

  const r = useMemo(
    () => calcularEstadisticas({ historial: ctx.historial, tracks: ctx.tracks, ejes: ctx.ejes, periodo, duracionDe }),
    [ctx.historial, ctx.tracks, ctx.ejes, periodo, duracionDe],
  );
  const ejePorId = useMemo(() => new Map(ctx.ejes.map((e) => [e.id, e])), [ctx.ejes]);
  const vacio = r.reproducciones === 0;

  return (
    <SubpantallaMovil titulo="Tus estadísticas" nav={nav}>
      <Pestanas opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} etiqueta="Periodo" />

      <section className="est-hero">
        <small>Tiempo escuchado {TEXTO_PERIODO[periodo]}</small>
        <b>{tiempo(r.segundos)}</b>
        <small>
          {r.reproducciones} {r.reproducciones === 1 ? 'reproducción' : 'reproducciones'} · {r.cancionesDistintas}{' '}
          {r.cancionesDistintas === 1 ? 'canción distinta' : 'canciones distintas'}
        </small>
      </section>

      <div className="est-tiempos">
        <div><small>Esta semana</small><b>{tiempo(r.tiempos.semana)}</b></div>
        <div><small>Este mes</small><b>{tiempo(r.tiempos.mes)}</b></div>
        <div><small>Total</small><b>{tiempo(r.tiempos.total)}</b></div>
      </div>

      <button className="res-ver" onClick={() => abrirResumen(nav, periodo === 'anio' ? 'anio' : 'semana')}>
        Ver mi resumen {periodo === 'anio' ? 'del año' : 'de la semana'}
      </button>

      <div className="est-racha">
        <b>Racha: {dias(r.racha.actual)}</b>
        <small>Tu mejor racha: {dias(r.racha.mejor)}</small>
      </div>

      {vacio ? (
        <EstadoVacio titulo={`Sin escuchas ${TEXTO_PERIODO[periodo]}`} accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
          Cuando reproduzcas música aparecerán aquí tus canciones, artistas y moods.
        </EstadoVacio>
      ) : (
        <>
          <div className="m-seccion"><h2>Canciones más escuchadas</h2></div>
          <div className="est-lista">
            {r.topCanciones.map((c) => {
              const track = c.track ?? { id: `est-${c.trackId}`, titulo: c.titulo, artista: c.artista, ejes: [] };
              return (
                <FilaCancion
                  key={c.trackId}
                  track={track}
                  meta={c.track ? ctx.metadataDe(c.track.trackIdReal ?? c.track.id) : null}
                  derecha={`${c.n}×`}
                  activa={!!c.track && ctx.trackActual?.id === c.track.id}
                  pausada={!ctx.sonando}
                  onTocar={() => c.track && ctx.reproducirLista(c.track, r.topCanciones.map((x) => x.track).filter(Boolean), 'Tus estadísticas')}
                  onMas={() => c.track && nav.abrirCapa({ tipo: 'hoja', trackId: c.track.id })}
                  onPulsacionLarga={() => c.track && nav.abrirCapa({ tipo: 'hoja', trackId: c.track.id })}
                />
              );
            })}
          </div>

          {r.topArtistas.length > 0 && (
            <>
              <div className="m-seccion"><h2>Artistas más escuchados</h2></div>
              <CarruselArtistas
                artistas={r.topArtistas.map((a) => ({ nombre: a.nombre, foto: ctx.fotoDeArtista(a.nombre), sub: `${a.n}×` }))}
                onAbrir={(nombre) => nav.abrir({ tipo: 'artista', nombre })}
              />
            </>
          )}

          {r.topModos.length > 0 && (
            <>
              <div className="m-seccion"><h2>Moods más escuchados</h2></div>
              <div className="est-lista">
                {r.topModos.map((m) => {
                  const eje = ejePorId.get(m.ejeId);
                  return (
                    <button key={m.ejeId} className="est-modo pulsable" onClick={() => nav.abrir({ tipo: 'modo', ejeId: m.ejeId })}>
                      <PortadaImg
                        className="est-modo-portada"
                        src={ctx.coversDeEje.get(m.ejeId)?.[0]}
                        texto={m.nombre}
                        loading="lazy"
                      />
                      <span className="est-modo-txt">
                        <b>{formatearTitulo(m.nombre)}</b>
                        <small>{tiempo(m.segundos)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="m-seccion"><h2>Reparto por mood</h2></div>
              <div className="est-reparto">
                {r.reparto.slice(0, 8).map((x) => (
                  <div key={x.ejeId} className="est-barra-fila">
                    <span className="est-barra-nombre">{formatearTitulo(x.nombre)}</span>
                    <span className="est-barra" aria-hidden="true">
                      <span style={{ width: `${Math.max(2, Math.round(x.fraccion * 100))}%`, background: ejePorId.get(x.ejeId) ? colorTarjeta(ejePorId.get(x.ejeId)) : 'var(--sippi)' }} />
                    </span>
                    <span className="est-barra-pct">{Math.round(x.fraccion * 100)} %</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </SubpantallaMovil>
  );
}
