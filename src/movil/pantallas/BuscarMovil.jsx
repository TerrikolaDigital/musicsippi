// src/movil/pantallas/BuscarMovil.jsx
// Pestaña Buscar. Sin texto: últimas búsquedas y Explorar por género (ExplorarGenero). Con texto: biblioteca, canciones de fuera (con ＋
// para añadir), artistas y álbumes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import TarjetaModo from '../TarjetaModo.jsx';
import { esEjeSonando } from '../origen.js';
import HojaExterna from '../HojaExterna.jsx';
import { entradaArtista, filtrarNoMeGusta } from '../noMeGusta.js';
import { tomarBusquedaPedida } from '../busquedaPedida.js';
import {
  buscarEnBiblioteca,
  borrarRecientes,
  buscarModos,
  guardarReciente,
  leerRecientes,
  norm,
  palabras,
  puntuar,
  agruparExternos,
  mensajeBusqueda,
  quitarReciente,
  previewDe,
  semillaRecomendados,
} from '../busqueda.js';
import { obtenerRecomendaciones } from '../../data/catalogo.js';
import ExplorarGenero from './ExplorarGenero.jsx';
import '../explorar.css';
import { formatearTitulo } from '../../ui/formato.js';
import EstadoVacio from '../EstadoVacio.jsx';

const CHIPS = [
  ['todo', 'Todo'],
  ['biblioteca', 'En tu biblioteca'],
  ['canciones', 'Canciones'],
  ['artistas', 'Artistas'],
  ['albumes', 'Álbumes'],
];

// localStorage puede lanzar al leerlo (modo privado, datos bloqueados): se
// pasa tal cual y busqueda.js ya tolera un almacén que falla.
function almacen() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const MAX_VISIBLES = 5; // últimas búsquedas que se enseñan

const subAlbum = (a) =>
  a.cantidad > 0 ? `${formatearTitulo(a.artista)} · ${a.cantidad} ${a.cantidad === 1 ? 'canción' : 'canciones'}` : `${formatearTitulo(a.artista)} · Álbum`;

const mensajeError = (e) => String(e?.message ?? e);

function Siluetas() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="m-silueta" />
      ))}
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <>
      <div className="m-seccion">
        <h2>{titulo}</h2>
      </div>
      {children}
    </>
  );
}

// Fila de artista o álbum (foto redonda o cuadrada, título y subtítulo).
function FilaSimple({ foto, redonda, titulo, sub, onAbrir, accion }) {
  const fila = (
    <button className="buscar-fila" onClick={onAbrir}>
      {foto ? <img className={redonda ? 'redonda' : ''} src={foto} alt="" loading="lazy" /> : <span className={`buscar-fila-sin${redonda ? ' redonda' : ''}`} />}
      <span className="buscar-fila-txt">
        <b>{formatearTitulo(titulo)}</b>
        {sub && <small>{sub}</small>}
      </span>
    </button>
  );
  if (!accion) return fila;
  // Acción secundaria (p. ej. «No me gusta»): botón aparte, no anidado dentro del botón de la fila.
  return (
    <div className="buscar-fila-envuelta">
      {fila}
      <button className="buscar-fila-accion" aria-label={accion.etiqueta} onClick={accion.onClick}>
        <IconoM nombre={accion.icono} tamano={20} />
      </button>
    </div>
  );
}

// Aviso de fallo con salida: nunca una lista vacía sin explicación.
function ErrorBusqueda({ mensaje, onReintentar }) {
  return (
    <EstadoVacio titulo="No se pudo buscar fuera de tu biblioteca" accion={{ etiqueta: 'Reintentar', onClick: onReintentar }}>
      {mensaje}
    </EstadoVacio>
  );
}

// Tus modos como tarjetas pequeñas (las de «Sigue escuchando» de Inicio).
function CarruselModos({ ctx, nav, modos }) {
  return (
    <div className="inicio-carrusel">
      {modos.map((eje) => (
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
        />
      ))}
    </div>
  );
}

// Escuchar una vista previa o añadir a la biblioteca un resultado de fuera
// (compartido por la búsqueda y por Explorar).
function useResultadoExterno(ctx) {
  const [agregados, setAgregados] = useState({}); // videoId -> 'agregando' | 'ok' | 'yaExistia' | 'error'
  // La misma pista en `track` y en la cola: cargarCola la busca con indexOf.
  const escuchar = (r) => {
    const p = previewDe(r);
    ctx.reproducirLista(p, [p], 'Vista previa');
  };
  const agregar = async (r) => {
    if (agregados[r.videoId] === 'agregando' || agregados[r.videoId] === 'ok') return false;
    setAgregados((s) => ({ ...s, [r.videoId]: 'agregando' }));
    try {
      const json = await ctx.agregarExterno({ titulo: r.tituloSugerido, artista: r.artistaSugerido, videoId: r.videoId });
      setAgregados((s) => ({ ...s, [r.videoId]: json.yaExistia ? 'yaExistia' : 'ok' }));
      return true;
    } catch {
      setAgregados((s) => ({ ...s, [r.videoId]: 'error' }));
      return false;
    }
  };
  return { agregados, escuchar, agregar };
}

function FilaExterna({ r, ctx, estado, onEscuchar, onAgregar }) {
  const [menu, setMenu] = useState(false);
  const listo = estado === 'ok' || estado === 'yaExistia';
  const track = { id: `preview-${r.videoId}`, titulo: r.tituloSugerido, artista: r.artistaSugerido || r.canal || '' };
  return (
    <>
      <FilaCancion
        track={track}
        meta={{ coverUrl: r.thumbnail }}
        activa={ctx.trackActual?.id === track.id}
        pausada={!ctx.sonando}
        onTocar={() => onEscuchar(r)}
        onPlay={() => onEscuchar(r)}
        onPulsacionLarga={() => setMenu(true)}
        onMas={() => onAgregar(r)}
        iconoMas={listo ? 'check' : 'mas'}
        etiquetaMas={listo ? 'Ya está en tu biblioteca' : estado === 'error' ? 'No se pudo añadir, reintentar' : 'Añadir a tu biblioteca'}
      />
      {menu && <HojaExterna ctx={ctx} cancion={track} onAgregar={listo ? null : () => onAgregar(r)} onCerrar={() => setMenu(false)} />}
    </>
  );
}

// «Recomendados por tus artistas» (con «No me gusta» por artista), tal cual estaba en Explorar.
function Recomendados({ ctx, nav }) {
  const [recomendados, setRecomendados] = useState({ fase: 'cargando' });
  // Se recalcula solo si cambia el conjunto de artistas semilla.
  const semilla = useMemo(() => semillaRecomendados(ctx.tracks), [ctx.tracks]);
  const claveSemilla = semilla.join('|');
  useEffect(() => {
    if (semilla.length === 0) {
      setRecomendados({ fase: 'ok', artistas: [] });
      return undefined;
    }
    let cancelado = false;
    setRecomendados({ fase: 'cargando' });
    obtenerRecomendaciones(semilla)
      .then((json) => {
        if (cancelado) return;
        if (json.error) throw new Error(json.mensaje ?? json.error);
        setRecomendados({ fase: 'ok', artistas: json.artistas ?? [] });
      })
      .catch((e) => !cancelado && setRecomendados({ fase: 'error', mensaje: mensajeError(e) }));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSemilla]);
  return (
    <Seccion titulo="Recomendados por tus artistas">
      {recomendados.fase === 'cargando' && <Siluetas />}
      {recomendados.fase === 'error' && <p className="m-aviso">No se pudieron cargar las recomendaciones: {recomendados.mensaje}</p>}
      {recomendados.fase === 'ok' && recomendados.artistas.length === 0 && (
        <EstadoVacio titulo="Todavía no hay recomendaciones">Añade música a tu biblioteca y vuelve.</EstadoVacio>
      )}
      {recomendados.fase === 'ok' &&
        filtrarNoMeGusta(recomendados.artistas, ctx.noMeGusta).map((a) => (
          <FilaSimple
            key={a.nombre}
            redonda
            foto={a.fotoUrl}
            titulo={a.nombre}
            sub="Nuevo para ti"
            onAbrir={() => nav.abrir({ tipo: 'artista', nombre: a.nombre })}
            accion={{ icono: 'no-me-gusta', etiqueta: `No me gusta ${formatearTitulo(a.nombre)}`, onClick: () => ctx.marcarNoMeGusta(entradaArtista(a.nombre)) }}
          />
        ))}
    </Seccion>
  );
}

export default function BuscarMovil({ ctx, nav }) {
  // Petición desde otra pantalla (la lupa de Biblioteca): filtro inicial y campo con foco.
  const [pedida] = useState(tomarBusquedaPedida);
  const campo = useRef(null);
  useEffect(() => {
    if (pedida) campo.current?.focus();
  }, [pedida]);
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(pedida?.filtro ?? 'todo');
  const [recientes, setRecientes] = useState(() => leerRecientes(almacen()));
  const [externo, setExterno] = useState({ fase: 'inactivo' });
  const [intento, setIntento] = useState(0); // sube al pulsar «Reintentar»
  const { agregados, escuchar: escucharExterno, agregar: agregarExterno } = useResultadoExterno(ctx);

  // Debounce de 300 ms: cada búsqueda externa es una consulta real.
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  // Sin red no se lanza la búsqueda externa: solo se avisa (lo de la biblioteca sigue funcionando).
  const sinRed = !!ctx.sinConexion && !ctx.sinConexion.hayRed;
  useEffect(() => {
    if (q.length < 2) {
      setExterno({ fase: 'inactivo' });
      return undefined;
    }
    if (sinRed) {
      setExterno({ fase: 'sin-red' });
      return undefined;
    }
    let cancelado = false;
    setExterno({ fase: 'cargando' });
    ctx
      .buscarExterno(q)
      .then((json) => {
        if (cancelado) return;
        if (json.error) throw new Error(json.detalle ?? json.mensaje ?? json.error);
        setExterno({
          fase: 'ok',
          resultados: (json.resultados ?? []).map((r) => ({
            ...r,
            tituloSugerido: formatearTitulo(r.tituloSugerido),
            artistaSugerido: formatearTitulo(r.artistaSugerido),
          })),
        });
      })
      .catch((e) => !cancelado && setExterno({ fase: 'error', mensaje: mensajeBusqueda(mensajeError(e)) }));
    return () => {
      cancelado = true;
    };
    // ctx.buscarExterno es estable (import de data/reproduccion.js).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, intento, sinRed]);

  const hayQ = q.length >= 2; // la búsqueda ya está lista (tras el debounce)
  const hayTexto = texto.trim().length >= 2;
  const enBiblioteca = useMemo(
    () => (hayQ ? buscarEnBiblioteca(ctx.tracks, q, 60, (t) => ctx.metadataDe(t.trackIdReal ?? t.id)?.album ?? null) : []),
    [ctx.tracks, ctx.metadataDe, q, hayQ],
  );
  const fuera = useMemo(() => agruparExternos(externo.resultados, q), [externo.resultados, q]);
  const modosCoinciden = useMemo(() => (hayQ ? buscarModos(ctx.ejes, ctx.conteos, q) : []), [ctx.ejes, ctx.conteos, q, hayQ]);

  const artistas = useMemo(() => {
    if (!hayQ || (chip !== 'artistas' && chip !== 'todo')) return [];
    const qs = palabras(q);
    const mapa = new Map();
    for (const t of ctx.tracks) {
      if (puntuar(t.artista, qs) < 0) continue;
      const m = mapa.get(t.artista) ?? { nombre: t.artista, cantidad: 0, foto: null };
      m.cantidad += 1;
      m.foto ??= ctx.metadataDe(t.trackIdReal ?? t.id)?.fotoArtista ?? null;
      mapa.set(t.artista, m);
    }
    const vistos = new Set([...mapa.keys()].map(norm));
    const lista = [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 20);
    // Artistas de fuera que aún no están en la biblioteca (salen de las canciones encontradas).
    for (const a of fuera.artistas) {
      if (vistos.has(norm(a.nombre))) continue;
      vistos.add(norm(a.nombre));
      lista.push({ nombre: a.nombre, cantidad: 0, foto: a.foto });
    }
    return lista;
  }, [ctx.tracks, ctx.metadataDe, q, hayQ, chip, fuera]);

  const albumes = useMemo(() => {
    if (!hayQ || (chip !== 'albumes' && chip !== 'todo')) return [];
    const qs = palabras(q);
    const mapa = new Map();
    for (const t of ctx.tracks) {
      const meta = ctx.metadataDe(t.trackIdReal ?? t.id);
      if (!meta?.album || puntuar(meta.album, qs) < 0) continue;
      const clave = `${norm(t.artista)}|${norm(meta.album)}`;
      const a = mapa.get(clave) ?? { artista: t.artista, titulo: meta.album, cantidad: 0, portada: null, propio: true };
      a.cantidad += 1;
      a.portada ??= typeof meta.coverUrl === 'string' && meta.coverUrl.startsWith('http') ? meta.coverUrl : null;
      mapa.set(clave, a);
    }
    const lista = [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 20);
    // Álbumes de fuera (de las canciones encontradas) que no están ya en la lista.
    for (const a of fuera.albumes) {
      const clave = `${norm(a.artista)}|${norm(a.titulo)}`;
      if (mapa.has(clave)) continue;
      lista.push({ ...a, cantidad: 0, propio: false });
    }
    return lista;
  }, [ctx.tracks, ctx.metadataDe, q, hayQ, chip, fuera]);

  const recordar = (t = q) => setRecientes(guardarReciente(almacen(), t));
  const buscarTexto = (t) => {
    setTexto(t);
    setQ(t.trim());
    setChip('todo');
  };

  const escuchar = (r) => {
    recordar();
    escucharExterno(r);
  };

  const agregar = async (r) => {
    if (await agregarExterno(r)) recordar();
  };

  const tocarBiblioteca = (t) => {
    recordar();
    ctx.reproducirLista(t, enBiblioteca, 'Búsqueda');
  };

  return (
    <>
      <div className="m-cabecera">
        <h1 className="m-titulo">Buscar</h1>
      </div>
      <form
        role="search"
        className="buscar-campo"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(texto.trim());
          recordar(texto);
          e.currentTarget.querySelector('input')?.blur();
        }}
      >
        <IconoM nombre="buscar" />
        <input
          ref={campo}
          className="m-input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Canciones, artistas, álbumes"
          aria-label="Buscar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {texto && (
          <button
            type="button"
            className="buscar-borrar"
            aria-label="Borrar búsqueda"
            onClick={(e) => {
              setTexto('');
              setQ('');
              e.currentTarget.form?.querySelector('input')?.focus();
            }}
          >
            <IconoM nombre="cerrar" tamano={20} />
          </button>
        )}
      </form>

      {!hayTexto && (
        <>
          {recientes.length > 0 && (
            <>
              <div className="m-seccion buscar-recientes-cab">
                <h2>Últimas búsquedas</h2>
                <button onClick={() => setRecientes(borrarRecientes(almacen()))}>Borrar todo</button>
              </div>
              <div className="buscar-recientes">
                {recientes.slice(0, MAX_VISIBLES).map((r) => (
                  <span key={r} className="buscar-reciente">
                    <button className="buscar-reciente-txt" onClick={() => buscarTexto(r)}>
                      {r}
                    </button>
                    <button className="buscar-reciente-x" aria-label={`Quitar ${r} de las últimas búsquedas`} onClick={() => setRecientes(quitarReciente(almacen(), r))}>
                      <IconoM nombre="cerrar" tamano={16} />
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
          <ExplorarGenero ctx={ctx} nav={nav} />
          <Recomendados ctx={ctx} nav={nav} />
        </>
      )}

      {hayTexto && (
        <>
          <div className="m-chips" role="tablist">
            {CHIPS.map(([id, nombre]) => (
              <button key={id} role="tab" aria-selected={chip === id} className={chip === id ? 'on' : ''} onClick={() => setChip(id)}>
                {nombre}
              </button>
            ))}
          </div>

          {!hayQ && <Siluetas />}
          {hayQ && sinRed && <p className="m-aviso" role="status">Buscar fuera de tu biblioteca necesita conexión</p>}

          {hayQ && chip === 'todo' && (
            <>
              {modosCoinciden.length > 0 && (
                <Seccion titulo="Moods">
                  <CarruselModos ctx={ctx} nav={nav} modos={modosCoinciden} />
                </Seccion>
              )}
              {enBiblioteca.length > 0 && (
                <Seccion titulo="Tu biblioteca">
                  {enBiblioteca.slice(0, 5).map((t) => (
                    <FilaCancion
                      key={t.id}
                      track={t}
                      meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
                      activa={ctx.trackActual?.id === t.id}
                      pausada={!ctx.sonando}
                      onTocar={() => tocarBiblioteca(t)}
                      onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                      onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                    />
                  ))}
                  {enBiblioteca.length > 5 && (
                    <button className="buscar-ver-mas" onClick={() => setChip('biblioteca')}>
                      Ver las {enBiblioteca.length} canciones
                    </button>
                  )}
                </Seccion>
              )}
              {(externo.fase === 'cargando' || externo.fase === 'inactivo') && (
                <Seccion titulo="Canciones">
                  <Siluetas />
                </Seccion>
              )}
              {externo.fase === 'error' && <ErrorBusqueda mensaje={externo.mensaje} onReintentar={() => setIntento((n) => n + 1)} />}
              {externo.fase === 'ok' && externo.resultados.length > 0 && (
                <Seccion titulo="Canciones">
                  {externo.resultados.slice(0, 5).map((r) => (
                    <FilaExterna key={r.videoId} r={r} ctx={ctx} estado={agregados[r.videoId]} onEscuchar={escuchar} onAgregar={agregar} />
                  ))}
                  {externo.resultados.length > 5 && (
                    <button className="buscar-ver-mas" onClick={() => setChip('canciones')}>
                      Ver las {externo.resultados.length} canciones
                    </button>
                  )}
                </Seccion>
              )}
              {artistas.length > 0 && (
                <Seccion titulo="Artistas">
                  {artistas.slice(0, 4).map((a) => (
                    <FilaSimple
                      key={a.nombre}
                      redonda
                      foto={a.foto}
                      titulo={a.nombre}
                      sub={`Artista · ${a.cantidad} ${a.cantidad === 1 ? 'canción' : 'canciones'}`}
                      onAbrir={() => {
                        recordar();
                        nav.abrir({ tipo: 'artista', nombre: a.nombre });
                      }}
                    />
                  ))}
                </Seccion>
              )}
              {albumes.length > 0 && (
                <Seccion titulo="Álbumes">
                  {albumes.slice(0, 4).map((a) => (
                    <FilaSimple
                      key={`${a.artista}|${a.titulo}`}
                      foto={a.portada}
                      titulo={a.titulo}
                      sub={subAlbum(a)}
                      onAbrir={() => {
                        recordar();
                        nav.abrir({ tipo: 'album', artista: a.artista, titulo: a.titulo });
                      }}
                    />
                  ))}
                </Seccion>
              )}
              {enBiblioteca.length === 0 && artistas.length === 0 && albumes.length === 0 && modosCoinciden.length === 0 && externo.fase === 'ok' && externo.resultados.length === 0 && (
                <EstadoVacio titulo={`Sin resultados para «${q}»`}>Prueba con otras palabras o con el nombre del artista.</EstadoVacio>
              )}
            </>
          )}

          {hayQ && chip === 'biblioteca' &&
            (enBiblioteca.length === 0 ? (
              <EstadoVacio titulo={`Nada en tu biblioteca coincide con «${q}»`} accion={{ etiqueta: 'Buscar fuera de tu biblioteca', onClick: () => setChip('canciones') }} />
            ) : (
              enBiblioteca.map((t) => (
                <FilaCancion
                  key={t.id}
                  track={t}
                  meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
                  activa={ctx.trackActual?.id === t.id}
                  pausada={!ctx.sonando}
                  onTocar={() => tocarBiblioteca(t)}
                  onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                  onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                />
              ))
            ))}

          {hayQ && (chip === 'canciones' || chip === 'artistas' || chip === 'albumes') && externo.fase === 'cargando' && <Siluetas />}
          {hayQ && chip !== 'todo' && chip !== 'biblioteca' && externo.fase === 'error' && (
            <ErrorBusqueda mensaje={externo.mensaje} onReintentar={() => setIntento((n) => n + 1)} />
          )}

          {hayQ &&
            chip === 'canciones' &&
            externo.fase === 'ok' &&
            (externo.resultados.length === 0 ? (
              <EstadoVacio titulo={`Sin resultados para «${q}»`}>Prueba con otras palabras o con el nombre del artista.</EstadoVacio>
            ) : (
              externo.resultados.map((r) => (
                <FilaExterna key={r.videoId} r={r} ctx={ctx} estado={agregados[r.videoId]} onEscuchar={escuchar} onAgregar={agregar} />
              ))
            ))}

          {hayQ &&
            chip === 'artistas' &&
            (artistas.length === 0 && externo.fase !== 'cargando' && externo.fase !== 'error' ? (
              <EstadoVacio titulo={`Ningún artista coincide con «${q}»`}>Prueba con otro nombre.</EstadoVacio>
            ) : (
              artistas.map((a) => (
                <FilaSimple
                  key={a.nombre}
                  redonda
                  foto={a.foto}
                  titulo={a.nombre}
                  sub={a.cantidad > 0 ? `Artista · ${a.cantidad} ${a.cantidad === 1 ? 'canción' : 'canciones'}` : 'Artista'}
                  onAbrir={() => {
                    recordar();
                    nav.abrir({ tipo: 'artista', nombre: a.nombre });
                  }}
                />
              ))
            ))}

          {hayQ &&
            chip === 'albumes' &&
            (albumes.length === 0 && externo.fase !== 'cargando' && externo.fase !== 'error' ? (
              <EstadoVacio titulo={`Ningún álbum coincide con «${q}»`}>Prueba con otro nombre.</EstadoVacio>
            ) : (
              albumes.map((a) => (
                <FilaSimple
                  key={`${a.artista}|${a.titulo}`}
                  foto={a.portada}
                  titulo={a.titulo}
                  sub={subAlbum(a)}
                  onAbrir={() => {
                    recordar();
                    nav.abrir({ tipo: 'album', artista: a.artista, titulo: a.titulo });
                  }}
                />
              ))
            ))}
        </>
      )}
    </>
  );
}
