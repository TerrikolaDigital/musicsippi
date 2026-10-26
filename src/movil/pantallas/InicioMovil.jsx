// src/movil/pantallas/InicioMovil.jsx
// Inicio, de arriba abajo: Mood del momento, ¿Cómo te sientes?, Favoritas e Infinito, la banda del resumen
// (solo cuando toca), Creado para ti, Sigue escuchando (moods y canciones recientes), Tus géneros y las
// rotativas (máximo 2 al día). La sincronización es un indicador pequeño en la cabecera.
import { useEffect, useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { colorTarjeta, duracionTotalTexto } from '../formato.js';
import TarjetaModo from '../TarjetaModo.jsx';
import { irVerTodo } from '../verTodo.js';
import { esEjeSonando, esOrigenSintetico } from '../origen.js';
import Corriente from '../Corriente.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { familiaDe, sinVacios } from '../modos.js';
import OlaProgreso from '../OlaProgreso.jsx';
import { portadaDe } from '../MiniReproductor.jsx';
import { textoSincronizacion } from '../inicio.js';
import { resumenQueToca, ventanaResumenAnual } from '../resumen/resumen.js';
import { abrirResumen } from '../inicio/SeccionResumen.jsx';
import { claveResumen, estadoTarjetaSemana, resumenVisto } from '../inicio/tarjetaSemana.js';
import { EVENTO_INICIO, leerConfigInicio, seccionActivada } from '../inicio/config.js';
import { SECCIONES, rotativasDelDia } from '../inicio/secciones.js';
import { SeccionCargada } from '../inicio/cargador.jsx';
import Rotativas from '../inicio/Rotativas.jsx';
import { usePulsacionLarga } from '../pulsacionModo.js';
import { contarCambiosPendientes, obtenerUltimaSincronizacion } from '../../data/sincronizar-movil.js';
import EstadoVacio from '../EstadoVacio.jsx';

const MAX_RECIENTES = 3;

// Modo del hero tras darle a reproducir: se recuerda durante la sesión (aunque se
// cambie de pestaña) para que el hero no salte a otro modo al pasar a «seguidos».
let heroFijoId = null;

const seccionDe = (id) => SECCIONES.find((s) => s.id === id);

export default function InicioMovil({ ctx, nav }) {
  // Qué secciones se ven (Ajustes > Inicio). Se relee si cambia mientras Inicio está montado.
  const [config, setConfig] = useState(() => leerConfigInicio());
  useEffect(() => {
    const releer = () => setConfig(leerConfigInicio());
    window.addEventListener(EVENTO_INICIO, releer);
    return () => window.removeEventListener(EVENTO_INICIO, releer);
  }, []);
  const on = (id) => seccionActivada(config, id);
  const diaClave = new Date().toDateString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rotativas = useMemo(() => rotativasDelDia(new Date(), config), [config, diaClave]);
  const [fijoId, setFijoId] = useState(heroFijoId);
  const fijar = (id) => {
    heroFijoId = id;
    setFijoId(id);
  };
  // Si empieza a sonar otro modo, el hero vuelve a elegir por la hora.
  useEffect(() => {
    if (fijoId && ctx.ejeActivo?.id && ctx.ejeActivo.id !== fijoId) fijar(null);
  }, [ctx.ejeActivo?.id, fijoId]);
  // Los modos vacíos (p. ej. tras una fusión) no se enseñan en Inicio.
  const seguidos = useMemo(() => sinVacios(ctx.seguidos, ctx.conteos), [ctx.seguidos, ctx.conteos]);
  const candidato = (fijoId && ctx.ejes.find((e) => e.id === fijoId)) || ctx.modoDestacado;
  const destacado = candidato && sinVacios([candidato], ctx.conteos).length ? candidato : null;
  const suenaHero = !!destacado && ctx.ejeActivo?.id === destacado.id;
  const tracksDestacado = useMemo(() => (destacado ? ctx.tracksDe(destacado.id) : []), [destacado, ctx.tracksDe]);
  const duracionTexto = useMemo(
    () => duracionTotalTexto(tracksDestacado.map((t) => ctx.metadataDe(t.id)?.duracionMs ?? 0)),
    [tracksDestacado, ctx.metadataDe],
  );
  // «Tus géneros»: un solo carrusel con los moods de género que tienen canciones, de más a menos.
  const generos = useMemo(
    () =>
      sinVacios(
        ctx.ejes.filter((e) => !e.sistema && e.activo !== false && familiaDe(e) === 'genero'),
        ctx.conteos,
      ).sort((a, b) => (ctx.conteos.get(b.id) ?? 0) - (ctx.conteos.get(a.id) ?? 0)),
    [ctx.ejes, ctx.conteos],
  );

  // Las entradas del historial guardan el id real de la canción; se cruzan con
  // la biblioteca y se descartan las repetidas y las que ya no existen.
  const recientes = useMemo(() => {
    const porId = new Map();
    for (const t of ctx.tracks) {
      porId.set(t.id, t);
      if (t.trackIdReal) porId.set(t.trackIdReal, t);
    }
    const vistos = new Set();
    const salida = [];
    for (const h of ctx.historial) {
      const t = porId.get(h.trackId);
      if (!t || vistos.has(t.id)) continue;
      vistos.add(t.id);
      salida.push(t);
      if (salida.length >= MAX_RECIENTES) break;
    }
    return salida;
  }, [ctx.historial, ctx.tracks]);

  const favoritas = useMemo(() => ctx.tracksDe('favoritos'), [ctx.tracksDe]);
  const nFavoritas = favoritas.length;
  const portadasFav = useMemo(() => favoritas.slice(0, 3), [favoritas]);
  const suenaFav = esEjeSonando(ctx.ejeActivo, 'favoritos');
  const suenaInf = esOrigenSintetico(ctx.ejeActivo, 'Infinito');

  // Pulsación larga en el hero: menú de acciones del modo (los botones internos no la disparan).
  const largaHero = usePulsacionLarga(() => destacado && nav.abrirCapa({ tipo: 'hoja', modoId: destacado.id }), { ignorarBotones: true });

  // Banda del resumen: solo cuando toca (domingo o ventana anual) y hasta que se abre.
  const toca = useMemo(() => {
    const duraciones = new Map();
    for (const t of ctx.tracks) {
      const ms = ctx.metadataDe(t.trackIdReal ?? t.id)?.duracionMs;
      if (ms > 0) {
        duraciones.set(t.id, ms / 1000);
        if (t.trackIdReal) duraciones.set(t.trackIdReal, ms / 1000);
      }
    }
    const duracionDe = (id) => duraciones.get(id) ?? null;
    return resumenQueToca(ctx.historial, { duracionDe });
  }, [ctx.historial, ctx.tracks, ctx.metadataDe]);

  const anioCompleto = toca === 'anio' && ventanaResumenAnual().completo;
  // Se relee al volver a Inicio: abrir el resumen lo anota y la banda desaparece.
  const visto = toca ? resumenVisto(claveResumen(toca, { completo: anioCompleto })) : false;
  const tarjetaSemana = estadoTarjetaSemana({ toca, anioCompleto, visto });

  // Estado de la sincronización con el PC (solo si alguna vez se emparejó).
  const [sync, setSync] = useState({ ultima: null, pendientes: 0 });
  useEffect(() => {
    let vivo = true;
    Promise.all([obtenerUltimaSincronizacion(), contarCambiosPendientes()])
      .then(([ultima, pendientes]) => vivo && setSync({ ultima, pendientes }))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const textoSync = textoSincronizacion(sync.ultima, sync.pendientes);
  const organizando = !!ctx.importacion?.enSegundoPlano;
  const etiquetaSync = [textoSync, organizando && 'Organizando tu música en segundo plano'].filter(Boolean).join('. ');

  const sinNada = !destacado && seguidos.length === 0 && recientes.length === 0 && generos.length === 0;
  const portadaHero = destacado ? ctx.coversDeEje.get(destacado.id)?.[0] : null;
  const conteoHero = destacado ? (ctx.conteos.get(destacado.id) ?? tracksDestacado.length) : 0;

  return (
    <>
      <div className="m-cabecera">
        <div className="inicio-logo">
          Music<i>sippi</i>
        </div>
        <div className="m-acciones-cab">
          {(textoSync || organizando) && (
            <button
              className={`m-redondo inicio-sync-cab${organizando ? ' organizando' : ''}`}
              aria-label={etiquetaSync}
              title={etiquetaSync}
              onClick={() => nav.abrir({ tipo: 'config-sincronizar' })}
            >
              <IconoM nombre="sincronizar" tamano={20} />
              {organizando && <span className="inicio-organizando-punto" aria-hidden="true" />}
              {sync.pendientes > 0 && <span className="inicio-sync-punto" aria-hidden="true" />}
            </button>
          )}
          <button className="m-redondo" aria-label="Historial" onClick={() => nav.abrir({ tipo: 'historial' })}>
            <IconoM nombre="historial" />
          </button>
          <button className="m-redondo" aria-label="Configuración" onClick={() => nav.abrir({ tipo: 'configuracion' })}>
            <IconoM nombre="ajustes" />
          </button>
        </div>
      </div>
      {/* sin saludo visible (pedido del usuario); el título queda para lectores de pantalla */}
      <h1 className="m-oculto">Inicio</h1>

      {sinNada && ctx.tracks.length === 0 ? (
        <>
          <EstadoVacio titulo="Empieza explorando" accion={{ etiqueta: 'Explorar música', onClick: () => nav.irAPestana('buscar') }}>
            Escucha con ▶ y guarda lo que te guste con +.
          </EstadoVacio>
          {on('tendencias') && <SeccionCargada seccion={seccionDe('tendencias')} ctx={ctx} nav={nav} />}
        </>
      ) : (
        <>
          {/* Con canciones pero sin moods todavía (recién importado): se ve lo que no depende de moods. */}
          {sinNada && <p className="m-aviso" role="status">Organizando tu música…</p>}
          {destacado && on('modo-momento') && (
            <section
              className="inicio-hero"
              style={{ '--c': colorTarjeta(destacado) }}
              aria-label={`Mood del momento: ${formatearTitulo(destacado.nombre)}`}
              {...largaHero.props}
            >
              <Corriente />
              <PortadaImg className="inicio-hero-img" src={portadaHero} texto={destacado.nombre} />
              <div className="inicio-hero-txt">
                <small>
                  <span className="inicio-hero-punto" aria-hidden="true" />
                  Mood del momento
                </small>
                <h2>{formatearTitulo(destacado.nombre)}</h2>
                <small className="inicio-hero-datos">
                  {conteoHero} canciones{duracionTexto && ` · ${duracionTexto}`}
                </small>
                <div className="inicio-hero-acc">
                  <button
                    className="m-play"
                    aria-label={suenaHero && ctx.sonando ? 'Pausar' : 'Reproducir el mood'}
                    onClick={() => {
                      if (suenaHero) return ctx.alternarPausa();
                      fijar(destacado.id);
                      ctx.reproducirModo(destacado, tracksDestacado, null, false);
                    }}
                  >
                    <IconoM nombre={suenaHero && ctx.sonando ? 'pausa' : 'play'} tamano={26} />
                  </button>
                  <button
                    className="m-sec"
                    aria-label="Reproducir en aleatorio"
                    onClick={() => {
                      fijar(destacado.id);
                      ctx.reproducirModo(destacado, tracksDestacado, null, true);
                    }}
                  >
                    <IconoM nombre="aleatorio" />
                  </button>
                  <button
                    className={`m-sec${ctx.radioModo === destacado.id ? ' on' : ''}`}
                    aria-label="Radio del mood"
                    onClick={() => {
                      fijar(destacado.id);
                      ctx.iniciarRadioModo(destacado);
                    }}
                  >
                    <IconoM nombre="radio" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {on('animo') && <SeccionCargada seccion={seccionDe('animo')} ctx={ctx} nav={nav} />}

          {on('accesos') && (
            <div className="inicio-accesos">
              <button
                className={`acceso-fav${suenaFav ? ' activa' : ''}`}
                aria-label={`Favoritas, ${nFavoritas} ${nFavoritas === 1 ? 'canción' : 'canciones'}`}
                onClick={() => irVerTodo(nav, 'favoritas')}
              >
                {suenaFav && (
                  <span className="acceso-suena" role="img" aria-label="Sonando ahora">
                    <OlaProgreso variante="icono" pausado={!ctx.sonando} />
                  </span>
                )}
                <b>Favoritas</b>
                <small>
                  {nFavoritas} {nFavoritas === 1 ? 'canción' : 'canciones'}
                </small>
                <span className="acceso-abanico" aria-hidden="true">
                  {portadasFav.map((t, i) => (
                    <PortadaImg
                      key={t.id}
                      className={`acceso-portada p${i}`}
                      src={portadaDe(ctx, t)}
                      texto={t.titulo ?? t.title ?? ''}
                      loading="lazy"
                    />
                  ))}
                  {portadasFav.length === 0 && <IconoM nombre="corazon-lleno" tamano={44} />}
                </span>
              </button>
              <button
                className={`acceso-inf${suenaInf ? ' activa' : ''}`}
                aria-label="Infinito, mezcla sin fin"
                onClick={() => ctx.sorprenderMe()}
              >
                {suenaInf && (
                  <span className="acceso-suena" role="img" aria-label="Sonando ahora">
                    <OlaProgreso variante="icono" pausado={!ctx.sonando} />
                  </span>
                )}
                <b>Infinito</b>
                <small>Mezcla sin fin</small>
                <span className="acceso-simbolo" aria-hidden="true">
                  <IconoM nombre="infinito" tamano={84} />
                </span>
              </button>
            </div>
          )}

          {tarjetaSemana && on('estadisticas') && (
            <button className="res-aviso" onClick={() => abrirResumen(nav, tarjetaSemana.periodo)}>
              <span className="res-aviso-ico" aria-hidden="true">
                <IconoM nombre="estadisticas" />
              </span>
              <span className="res-aviso-txt">
                <b>{tarjetaSemana.titulo}</b>
                <small>{tarjetaSemana.sub}</small>
              </span>
              <IconoM nombre="atras" tamano={18} />
            </button>
          )}

          {on('creado-para-ti') && <SeccionCargada seccion={seccionDe('creado-para-ti')} ctx={ctx} nav={nav} />}

          {(seguidos.length > 0 || recientes.length > 0) && on('sigue-escuchando') && (
            <>
              <div className="m-seccion">
                <h2>Sigue escuchando</h2>
                <button onClick={() => irVerTodo(nav, 'seguidos')}>Ver todo</button>
              </div>
              {seguidos.length > 0 && (
                <div className="inicio-carrusel">
                  {seguidos.map((eje) => (
                    <TarjetaModo
                      key={eje.id}
                      pequena
                      activa={esEjeSonando(ctx.ejeActivo, eje.id)}
                      pausada={!ctx.sonando}
                      eje={eje}
                      conteo={ctx.conteos.get(eje.id) ?? 0}
                      portada={ctx.coversDeEje.get(eje.id)?.[0]}
                      onAbrir={() => nav.abrir({ tipo: 'modo', ejeId: eje.id })}
                      onReproducir={() => ctx.reproducirModo(eje, ctx.tracksDe(eje.id), null, true)}
                      onMas={() => nav.abrirCapa({ tipo: 'hoja', modoId: eje.id })}
                    />
                  ))}
                </div>
              )}
              {recientes.map((t) => (
                <FilaCancion
                  key={t.id}
                  track={t}
                  meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
                  activa={ctx.trackActual?.id === t.id}
                  pausada={!ctx.sonando}
                  onTocar={() => ctx.reproducirLista(t, recientes, 'Recientes')}
                  onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                  onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                />
              ))}
            </>
          )}

          {generos.length > 0 && on('generos') && (
            <>
              <div className="m-seccion">
                <h2>Tus géneros</h2>
                <button onClick={() => nav.irAPestana('modos')}>Ver todo</button>
              </div>
              <div className="inicio-carrusel">
                {generos.map((eje) => (
                  <TarjetaModo
                    key={eje.id}
                    pequena
                    activa={esEjeSonando(ctx.ejeActivo, eje.id)}
                    pausada={!ctx.sonando}
                    eje={eje}
                    conteo={ctx.conteos.get(eje.id) ?? 0}
                    portada={ctx.coversDeEje.get(eje.id)?.[0]}
                    onAbrir={() => nav.abrir({ tipo: 'modo', ejeId: eje.id })}
                    onReproducir={() => ctx.reproducirModo(eje, ctx.tracksDe(eje.id), null, true)}
                    onMas={() => nav.abrirCapa({ tipo: 'hoja', modoId: eje.id })}
                  />
                ))}
              </div>
            </>
          )}

          {rotativas.ids.length > 0 && <Rotativas ids={rotativas.ids} max={rotativas.max} ctx={ctx} nav={nav} />}
        </>
      )}
    </>
  );
}
