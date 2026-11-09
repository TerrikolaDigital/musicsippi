// src/escritorio/ResumenEstadisticas.jsx
// «Tu semana» y «Estadísticas» en escritorio. Toda la lógica es la del móvil (src/movil/resumen/ y
// src/movil/estadisticas.js, funciones puras); aquí solo se dibuja en formato de página. «Tu semana»
// sigue la regla del móvil: solo entra lo que tiene imagen real, nunca iniciales.
import { useMemo, useState } from 'react';
import { PortadaImg } from '../movil/PortadaGenerada.jsx';
import { calcularEstadisticas } from '../movil/estadisticas.js';
import { armarPantallas, armarResumen, rangoResumen, textoMinutos, ventanaResumenAnual } from '../movil/resumen/resumen.js';
import { armarDatosTarjeta, esPortadaReal } from '../movil/resumen/datosTarjetas.js';
import { colorTarjeta, duracionLarga } from '../movil/formato.js';
import { formatearTitulo } from '../ui/formato.js';
import { IconoC } from './iconosCorriente.jsx';

const tiempo = (segundos) => duracionLarga(segundos * 1000);
const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Segundos de cada canción de la biblioteca (por id y por id real), como en las pantallas del móvil. */
function useDuracionDe(ctx) {
  return useMemo(() => {
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
}

/** Portada real de la canción, o null (nunca la de otra canción). */
const urlPortada = (ctx, track) => {
  const u = track ? ctx.metadataDe(track.trackIdReal ?? track.id)?.coverUrl ?? track.coverUrl : null;
  return esPortadaReal(u) ? u : null;
};

function Selector({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div className="res-es-periodos" role="tablist" aria-label={etiqueta}>
      {opciones.map(([id, texto]) => (
        <button key={id} role="tab" aria-selected={valor === id} className={valor === id ? 'activo' : ''} onClick={() => onCambio(id)}>
          {texto}
        </button>
      ))}
    </div>
  );
}

function Vacio({ titulo, children, onBuscar }) {
  return (
    <div className="res-es-vacio">
      <b>{titulo}</b>
      <p>{children}</p>
      {onBuscar && (
        <button className="res-es-boton" onClick={onBuscar}>
          Buscar música
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Tu semana */

export function TuSemana({ ctx, onIrAEstadisticas, onIrABuscar }) {
  const [tipo, setTipo] = useState('semana');
  const duracionDe = useDuracionDe(ctx);

  const res = useMemo(() => {
    const { desde, hasta } = rangoResumen(tipo);
    return armarResumen(ctx.historial, ctx.tracks, { desde, hasta, ejes: ctx.ejes, duracionDe, metadataDe: ctx.metadataDe, portadaDe: (t) => urlPortada(ctx, t) });
  }, [ctx.historial, ctx.tracks, ctx.ejes, ctx.metadataDe, duracionDe, tipo]);
  const pantallas = useMemo(() => armarPantallas(res, tipo), [res, tipo]);
  const eje = res.modo ? ctx.ejes.find((e) => e.id === res.modo.ejeId) : null;
  const color = eje ? colorTarjeta(eje) : '#7c5cff';
  // Solo artistas con foto real (listas alineadas con sus direcciones).
  const imagenes = useMemo(
    () => armarDatosTarjeta(res, tipo, color, { portada: (t) => urlPortada(ctx, t), foto: (n) => ctx.fotoDeArtista(n) }),
    [res, tipo, color, ctx.metadataDe, ctx.fotoDeArtista],
  );

  const pant = (id) => pantallas.find((p) => p.id === id);
  const minutos = pant('minutos');
  const bucle = pant('bucle');
  const modo = pant('modo');
  const hora = pant('hora');
  const curioso = pant('curioso');
  const d = curioso?.descubrimiento;
  const artistas = imagenes.datos.artistas.map((a, i) => ({ ...a, url: imagenes.urls.artistas[i] }));
  const etiqueta = tipo === 'anio' ? (ventanaResumenAnual().completo ? 'Edición completa' : 'hasta hoy') : null;
  const titulo = tipo === 'anio' ? 'Tu año en Musicsippi' : 'Tu semana en Musicsippi';
  const hayDatos = res.reproducciones > 0;

  const poner = (track) => track && ctx.reproducirLista(track, [track], 'Tu resumen');

  return (
    <main className="res-es res-semana" style={{ '--res-c': color }}>
      <header className="res-es-cab">
        <div>
          <h1 className="titulo-pantalla">{titulo}</h1>
          <p>{etiqueta ? `${etiqueta} · ` : ''}{minutos?.rango ?? 'Lo que has escuchado, resumido.'}</p>
        </div>
        <Selector opciones={[['semana', 'Semana'], ['anio', 'Año']]} valor={tipo} onCambio={setTipo} etiqueta="Periodo del resumen" />
      </header>

      {!hayDatos ? (
        <Vacio titulo="Todavía no hay resumen" onBuscar={onIrABuscar}>
          Escucha un poco de música y vuelve: aquí te esperará tu historia.
        </Vacio>
      ) : (
        <>
          <section className="res-semana-portada" aria-label="Resumen de minutos">
            <div className="res-semana-minutos">
              <p className="res-es-pre">{minutos.pre}</p>
              <p className="res-es-gigante" aria-label={textoMinutos(minutos.minutos)}>
                {minutos.minutos.toLocaleString('es-ES')}
              </p>
              <p className="res-es-unidad">minutos de música</p>
              <p className="res-es-nota">
                {minutos.reproducciones} reproducciones de {minutos.distintas} {minutos.distintas === 1 ? 'canción distinta' : 'canciones distintas'}.
              </p>
              {res.cambioPct !== null && res.cambioPct !== undefined && (
                <p className="res-es-nota">
                  {res.cambioPct === 0 ? 'Igual que el periodo anterior.' : `${Math.abs(res.cambioPct)} % ${res.cambioPct > 0 ? 'más' : 'menos'} que el periodo anterior.`}
                </p>
              )}
              <button className="res-es-enlace" onClick={onIrAEstadisticas}>
                Ver todas mis estadísticas
              </button>
            </div>
            {bucle && imagenes.urls.bucle && (
              <button className="res-semana-bucle" onClick={() => poner(res.bucle.track)} aria-label={`Poner en bucle ${bucle.titulo}`}>
                <img src={imagenes.urls.bucle} alt="" />
                <span className="res-semana-bucle-txt">
                  <small>Tu canción en bucle</small>
                  <b>{formatearTitulo(bucle.titulo)}</b>
                  <span>{formatearTitulo(bucle.artista)}</span>
                  <em>{bucle.texto}</em>
                </span>
                <span className="res-semana-play" aria-hidden="true">
                  <IconoC nombre="play" tamano={22} relleno />
                </span>
              </button>
            )}
          </section>

          {artistas.length > 0 && (
            <section aria-labelledby="res-es-artistas">
              <h2 id="res-es-artistas">Tus artistas de cabecera</h2>
              <ol className="res-semana-artistas">
                {artistas.map((a) => (
                  <li key={a.nombre}>
                    <button onClick={() => ctx.abrirArtista(a.nombre)}>
                      <img src={a.url} alt="" loading="lazy" />
                      <b>{a.nombre}</b>
                      <small>{a.n}×</small>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="res-semana-datos" aria-label="Más sobre tu escucha">
            {modo && (
              <div className="res-semana-dato res-semana-modo">
                <small>{modo.texto}</small>
                <b>{formatearTitulo(modo.nombre)}</b>
                <span>Un {Math.round(modo.fraccion * 100)} % de tu tiempo vivió aquí dentro.</span>
              </div>
            )}
            {hora && (
              <div className="res-semana-dato">
                <small>Tu hora del día</small>
                <b>{hora.frase}</b>
                <span>{hora.nota}{hora.racha > 1 ? ` Tu mejor racha: ${hora.racha} días seguidos.` : ''}</span>
              </div>
            )}
            {(d || curioso?.comparativa) && (
              <div className="res-semana-dato">
                <small>{d ? 'Tu descubrimiento' : 'Una curiosidad'}</small>
                {d ? (
                  <>
                    <b>{formatearTitulo(d.titulo)}</b>
                    <span>
                      {formatearTitulo(d.artista)}. Nueva en tu vida y ya la pusiste {d.n} {d.n === 1 ? 'vez' : 'veces'}.
                    </span>
                  </>
                ) : (
                  <b>{curioso.comparativa}</b>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------- Estadísticas */

const PERIODOS = [
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['anio', 'Año'],
  ['siempre', 'Siempre'],
];
const TEXTO_PERIODO = { semana: 'esta semana', mes: 'este mes', anio: 'este año', siempre: 'en total' };

export function Estadisticas({ ctx, onIrASemana, onIrABuscar }) {
  const [periodo, setPeriodo] = useState('mes');
  const duracionDe = useDuracionDe(ctx);
  const r = useMemo(
    () => calcularEstadisticas({ historial: ctx.historial, tracks: ctx.tracks, ejes: ctx.ejes, periodo, duracionDe }),
    [ctx.historial, ctx.tracks, ctx.ejes, periodo, duracionDe],
  );
  const ejePorId = useMemo(() => new Map(ctx.ejes.map((e) => [e.id, e])), [ctx.ejes]);
  const vacio = r.reproducciones === 0;
  const topC = r.topCanciones;
  const maxC = topC[0]?.n ?? 1;

  return (
    <main className="res-es res-estad">
      <header className="res-es-cab">
        <div>
          <h1 className="titulo-pantalla">Estadísticas</h1>
          <p>Tiempo escuchado {TEXTO_PERIODO[periodo]}, lo más sonado y cómo se reparte por mood.</p>
        </div>
        <Selector opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} etiqueta="Periodo" />
      </header>

      <section className="res-estad-resumen" aria-label="Tiempo escuchado">
        <div className="res-estad-hero">
          <small>Tiempo escuchado {TEXTO_PERIODO[periodo]}</small>
          <b>{tiempo(r.segundos)}</b>
          <span>
            {r.reproducciones} {r.reproducciones === 1 ? 'reproducción' : 'reproducciones'} de {r.cancionesDistintas}{' '}
            {r.cancionesDistintas === 1 ? 'canción distinta' : 'canciones distintas'}
          </span>
          <button className="res-es-enlace" onClick={onIrASemana}>
            Ver mi resumen de la semana
          </button>
        </div>
        <div className="res-estad-cifras">
          <div><small>Esta semana</small><b>{tiempo(r.tiempos.semana)}</b></div>
          <div><small>Este mes</small><b>{tiempo(r.tiempos.mes)}</b></div>
          <div><small>Total</small><b>{tiempo(r.tiempos.total)}</b></div>
          <div><small>Racha actual</small><b>{dias(r.racha.actual)}</b><span>Mejor: {dias(r.racha.mejor)}</span></div>
        </div>
      </section>

      {vacio ? (
        <Vacio titulo={`Sin escuchas ${TEXTO_PERIODO[periodo]}`} onBuscar={onIrABuscar}>
          Cuando reproduzcas música aparecerán aquí tus canciones, artistas y moods.
        </Vacio>
      ) : (
        <div className="res-estad-cols">
          <section aria-labelledby="est-canciones">
            <h2 id="est-canciones">Canciones más escuchadas</h2>
            <ol className="res-estad-lista">
              {topC.map((c) => {
                const track = c.track;
                return (
                  <li key={c.trackId}>
                    <button
                      disabled={!track}
                      onClick={() => track && ctx.reproducirLista(track, topC.map((x) => x.track).filter(Boolean), 'Estadísticas')}
                    >
                      <PortadaImg className="res-estad-portada" src={urlPortada(ctx, track)} texto={c.titulo} loading="lazy" />
                      <span className="res-estad-txt">
                        <b>{formatearTitulo(c.titulo)}</b>
                        <small>{formatearTitulo(c.artista)}</small>
                      </span>
                      <span className="res-estad-barrita" aria-hidden="true"><i style={{ width: `${Math.max(6, (c.n / maxC) * 100)}%` }} /></span>
                      <span className="res-estad-n">{c.n}×</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          {r.topArtistas.length > 0 && (
            <section aria-labelledby="est-artistas">
              <h2 id="est-artistas">Artistas más escuchados</h2>
              <ol className="res-estad-artistas">
                {r.topArtistas.map((a) => (
                  <li key={a.nombre}>
                    <button onClick={() => ctx.abrirArtista(a.nombre)}>
                      <PortadaImg className="res-estad-foto" src={ctx.fotoDeArtista(a.nombre)} texto={a.nombre} loading="lazy" />
                      <b>{formatearTitulo(a.nombre)}</b>
                      <small>{a.n}×</small>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r.reparto.length > 0 && (
            <section className="res-estad-ancha" aria-labelledby="est-reparto">
              <h2 id="est-reparto">Reparto por mood</h2>
              <div className="res-estad-reparto">
                {r.reparto.slice(0, 8).map((x) => {
                  const eje = ejePorId.get(x.ejeId);
                  return (
                    <button key={x.ejeId} className="res-estad-fila" onClick={() => eje && ctx.entrarAModo(eje)}>
                      <span className="res-estad-nombre">{formatearTitulo(x.nombre)}</span>
                      <span className="res-estad-barra" aria-hidden="true">
                        <i style={{ width: `${Math.max(2, Math.round(x.fraccion * 100))}%`, background: eje ? colorTarjeta(eje) : 'var(--violeta)' }} />
                      </span>
                      <span className="res-estad-pct">{Math.round(x.fraccion * 100)} %</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
