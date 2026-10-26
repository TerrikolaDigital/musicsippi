// src/movil/pantallas/AlbumMovil.jsx
// Álbum: portada centrada, acciones y canciones numeradas con ✓ (ya en tu
// biblioteca) o ＋ (añadir). Los datos se cargan con ctx.cargarAlbum.
import { useEffect, useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import { colorTarjeta, duracionLarga } from '../formato.js';
import { formatearTitulo, reloj } from '../../ui/formato.js';
import { compartirMusica } from '../compartirMusica.js';
import { estadoAlbumEnBiblioteca } from '../biblioteca.js';
import { norm } from '../busqueda.js';
import { crearPulsacionLarga } from '../pulsacionFila.js';
import { cancionesDeAlbumLocal, primerArtista } from '../albumLocal.js';
import FilaCancion from '../FilaCancion.jsx';
import HojaAlbum from '../HojaAlbum.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import SubpantallaMovil from './SubpantallaMovil.jsx';

export default function AlbumMovil({ ctx, nav, artista, titulo }) {
  const [iniciado, setIniciado] = useState(false);
  const [estados, setEstados] = useState({}); // trackId -> 'agregando' | 'ok' | 'error'
  const [agregandoTodo, setAgregandoTodo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  // La hoja ⋯ es una capa de navegación: el botón «atrás» de Android la cierra en vez de salir del álbum.
  const hojaAbierta = nav.capas.some((c) => c.tipo === 'hoja-album');

  // `ctx.album` es compartido: no se pinta hasta que el efecto lo pone a cargar.
  useEffect(() => {
    ctx.cargarAlbum(primerArtista(artista), titulo, titulo);
    setIniciado(true);
    // cargarAlbum es estable (useCallback sin dependencias).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artista, titulo]);

  const al = iniciado ? ctx.album : null;
  const enBiblioteca = useMemo(() => new Set(ctx.tracks.map((t) => t.id)), [ctx.tracks]);
  // Qué pistas del álbum están ya en la biblioteca (por id o por artista+título) y cuáles son sus ids.
  const estadoAlbum = useMemo(
    () => (al?.tracks ? estadoAlbumEnBiblioteca(al.tracks, ctx.tracks, norm) : { faltan: [], ids: [] }),
    [al, ctx.tracks],
  );

  // Si Deezer no lo encuentra: las canciones de ese álbum que ya hay en la biblioteca.
  const locales = useMemo(
    () => cancionesDeAlbumLocal(ctx.tracks, ctx.metadataDe, artista, titulo),
    [ctx.tracks, ctx.metadataDe, artista, titulo],
  );

  const pulsacion = useMemo(() => crearPulsacionLarga({ alDisparar: () => pulsacion.alLarga?.() }), []);

  if (!al || al.cargando) {
    return (
      <SubpantallaMovil titulo={formatearTitulo(titulo)} nav={nav}>
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="m-silueta" />
          ))}
        </div>
      </SubpantallaMovil>
    );
  }
  if (!al.encontrado) {
    const nombreArtista = primerArtista(artista);
    return (
      <SubpantallaMovil titulo={formatearTitulo(titulo)} nav={nav}>
        <EstadoVacio
          titulo={formatearTitulo(titulo)}
          accion={nombreArtista ? { etiqueta: 'Ver artista', onClick: () => nav.abrir({ tipo: 'artista', nombre: nombreArtista }) } : null}
        >
          {locales.length > 0
            ? `No hemos podido cargar el álbum completo. Estas son las canciones que tienes de ${formatearTitulo(nombreArtista)}.`
            : (al.error ?? 'No hemos encontrado este álbum.')}
        </EstadoVacio>
        {locales.map((t) => (
          <FilaCancion
            key={t.id}
            track={t}
            meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
            activa={ctx.trackActual?.id === t.id}
            pausada={!ctx.sonando}
            onTocar={() => ctx.reproducirLista(t, locales, titulo)}
            onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
            onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
          />
        ))}
      </SubpantallaMovil>
    );
  }

  const faltantes = new Set(estadoAlbum.faltan.map((t) => t.trackId));
  const estaEnBiblioteca = (t) => enBiblioteca.has(t.trackId) || !faltantes.has(t.trackId);
  const nuevos = estadoAlbum.faltan.length;
  const duracionMs = al.tracks.reduce((suma, t) => suma + (t.duracionMs || 0), 0);
  const claveAlbum = `${al.artista.trim().toLowerCase()}||${al.titulo.trim().toLowerCase()}`;
  const esFavorito = ctx.favoritos.albumes.includes(claveAlbum);

  // Pulsación larga en una canción que ya está en la biblioteca: menú ⋯ de la canción.
  const porClave = new Map(ctx.tracks.map((x) => [`${norm(x.artista)}|${norm(x.titulo)}`, x.id]));
  const idEnBiblioteca = (t) => (ctx.tracks.some((x) => x.id === t.trackId) ? t.trackId : porClave.get(`${norm(t.artista)}|${norm(t.titulo)}`));

  async function agregar(t) {
    if (estados[t.trackId] === 'agregando') return; // evita el doble toque
    setEstados((s) => ({ ...s, [t.trackId]: 'agregando' }));
    try {
      await ctx.agregarTrackSuelto(t, { favorito: false, albumTitulo: al.titulo, anio: al.anio });
      setEstados((s) => ({ ...s, [t.trackId]: 'ok' }));
    } catch (error) {
      setEstados((s) => ({ ...s, [t.trackId]: 'error' }));
      ctx.avisar?.(`No se pudo añadir «${formatearTitulo(t.titulo)}». Toca «+» para reintentar. ${error?.message ?? ''}`.trim());
    }
  }

  async function agregarTodo() {
    setAgregandoTodo(true);
    setAviso(null);
    try {
      const r = await ctx.agregarAlbum();
      setAviso(r.agregados > 0 ? `Se ${r.agregados === 1 ? 'ha añadido 1 canción' : `han añadido ${r.agregados} canciones`}.` : null);
    } catch (e) {
      setAviso(`No se pudo añadir el álbum: ${String(e?.message ?? e)}`);
    } finally {
      setAgregandoTodo(false);
    }
  }

  // Hoja ⋯: primero se añaden a la biblioteca las canciones que falten y se devuelven los ids de todo el álbum.
  async function asegurarIds() {
    const r = nuevos > 0 ? await ctx.agregarAlbum() : null;
    const tracks = r?.tracks ?? ctx.tracks;
    if (r) setEstados({});
    return { tracks, ids: estadoAlbumEnBiblioteca(al.tracks, tracks, norm).ids };
  }
  // Pistas para la cola: la copia de la biblioteca si existe; si no, una provisional como reproducirAlbum.
  function pistasCola() {
    const porId = new Map(ctx.tracks.map((x) => [x.id, x]));
    return al.tracks.map(
      (t) =>
        porId.get(t.trackId) ?? {
          id: `album-${t.trackId}`,
          trackIdReal: t.trackId,
          artista: t.artista,
          titulo: t.titulo,
          fuentes: ['album'],
          youtubeQuery: `${t.artista} ${t.titulo}`,
          youtubeVideoId: null,
          ejes: [],
          coverUrl: al.coverUrl ?? null,
          album: al.titulo,
        },
    );
  }

  return (
    <div className="album-movil heroe" style={{ '--color-modo': colorTarjeta({ id: `album-${al.titulo}` }) }}>
      {al.coverUrl && (
        <div className="heroe-fondo" aria-hidden="true">
          <div className="heroe-fondo-img" style={{ backgroundImage: `url("${al.coverUrl}")` }} />
        </div>
      )}
      <div className="heroe-img">
        {al.coverUrl && <img src={al.coverUrl} alt="" />}
        <button className="m-redondo heroe-atras" aria-label="Volver" onClick={nav.atras}>
          <IconoM nombre="atras" />
        </button>
      </div>
      <div className="heroe-texto">
        <h1 className="heroe-nombre">{formatearTitulo(al.titulo)}</h1>
        <p className="heroe-sub">
          <button className="album-movil-artista" onClick={() => nav.abrir({ tipo: 'artista', nombre: al.artista })}>
            {formatearTitulo(al.artista)}
          </button>
          {` · ${al.anio ? `${al.anio} · ` : ''}${al.tracks.length} canciones${duracionMs > 0 ? ` · ${duracionLarga(duracionMs)}` : ''}`}
        </p>

      <div className="detalle-modo-acciones">
        <button
          className="m-sec"
          aria-label="Reproducir en aleatorio"
          onClick={() => ctx.reproducirSecuencia(ctx.barajar(pistasCola()), al.titulo, { aleatorio: true })}
        >
          <IconoM nombre="aleatorio" />
        </button>
        <button className="m-play" aria-label="Reproducir" onClick={() => ctx.reproducirAlbum(0)}>
          <IconoM nombre="play" tamano={26} />
        </button>
        <button
          className={`m-sec${esFavorito ? ' on' : ''}`}
          aria-label={esFavorito ? 'Quitar álbum de favoritos' : 'Añadir álbum a favoritos'}
          aria-pressed={esFavorito}
          onClick={() => ctx.alternarFavoritoAlbum(al.artista, al.titulo, !esFavorito)}
        >
          <IconoM nombre={esFavorito ? 'corazon-lleno' : 'corazon'} />
        </button>
        <button
          className="m-sec"
          aria-label="Compartir álbum"
          onClick={() =>
            compartirMusica(ctx, {
              tipo: 'album',
              titulo: formatearTitulo(al.titulo),
              artista: formatearTitulo(al.artista),
              album: formatearTitulo(al.titulo),
            }).catch((e) => setAviso(`No se pudo compartir: ${String(e?.message ?? e)}`))
          }
        >
          <IconoM nombre="compartir" />
        </button>
        <button className="m-sec" aria-label="Más opciones del álbum" aria-haspopup="dialog" onClick={() => nav.abrirCapa({ tipo: 'hoja-album' })}>
          <IconoM nombre="puntos" />
        </button>
      </div>
      <button
        className={`album-anadir${nuevos === 0 ? ' en-biblioteca' : ''}`}
        aria-label={nuevos === 0 ? 'En tu biblioteca. Tocar para quitar el álbum' : `Añadir ${nuevos} ${nuevos === 1 ? 'canción' : 'canciones'} a tu biblioteca`}
        disabled={agregandoTodo}
        onClick={() => (nuevos === 0 ? setConfirmarQuitar(true) : agregarTodo())}
      >
        <IconoM nombre={nuevos === 0 ? 'check' : 'mas'} tamano={20} />
        <span>{nuevos === 0 ? 'En tu biblioteca' : `Añadir ${nuevos} ${nuevos === 1 ? 'canción' : 'canciones'}`}</span>
      </button>
      </div>

      {hojaAbierta && (
        <HojaAlbum ctx={ctx} titulo={al.titulo} onCerrar={() => nav.atras()} asegurarIds={asegurarIds} pistasCola={pistasCola} />
      )}

      {confirmarQuitar && (
        <div className="detalle-modo-confirmar" role="alertdialog" aria-label="Quitar el álbum de la biblioteca">
          <b>¿Quitar el álbum de la biblioteca?</b>
          <small>
            Se quitarán {estadoAlbum.ids.length} {estadoAlbum.ids.length === 1 ? 'canción' : 'canciones'} de «{formatearTitulo(al.titulo)}». Podrás deshacerlo unos segundos.
          </small>
          <button onClick={() => setConfirmarQuitar(false)}>Cancelar</button>
          <button
            className="peligro"
            onClick={() => {
              setConfirmarQuitar(false);
              setEstados({});
              ctx.quitarConDeshacer(estadoAlbum.ids, `Quitando «${formatearTitulo(al.titulo)}» de tu biblioteca`);
            }}
          >
            Quitar
          </button>
        </div>
      )}

      {aviso && <p className="m-aviso">{aviso}</p>}

      <ol className="album-movil-lista">
        {al.tracks.map((t, i) => {
          const yaEsta = estaEnBiblioteca(t);
          const sonando = ctx.trackActual?.id === t.trackId || ctx.trackActual?.id === `album-${t.trackId}`;
          return (
            <li key={`${t.trackId}-${i}`} className={sonando ? 'activa' : ''}>
              <button
                className="album-movil-fila"
                onClick={(e) => {
                  if (pulsacion.fueDisparada()) return e.preventDefault();
                  ctx.reproducirAlbum(i);
                }}
                onPointerDown={(e) => {
                  const id = idEnBiblioteca(t);
                  pulsacion.alLarga = id ? () => nav.abrirCapa({ tipo: 'hoja', trackId: id }) : null;
                  if (id) pulsacion.inicio(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => pulsacion.mover(e.clientX, e.clientY)}
                onPointerUp={pulsacion.fin}
                onPointerLeave={pulsacion.fin}
                onPointerCancel={pulsacion.fin}
                onContextMenu={(e) => idEnBiblioteca(t) && e.preventDefault()}
                aria-label={`Reproducir ${formatearTitulo(t.titulo)}`}>
                <span className="album-movil-num">{sonando ? '♪' : i + 1}</span>
                <span className="album-movil-txt">
                  <b>{formatearTitulo(t.titulo)}</b>
                  {t.artista !== al.artista && <small>{formatearTitulo(t.artista)}</small>}
                </span>
                {t.duracionMs > 0 && <span className="album-movil-dur">{reloj(t.duracionMs / 1000)}</span>}
              </button>
              <button
                className="album-movil-estado"
                disabled={yaEsta || estados[t.trackId] === 'agregando'}
                aria-label={yaEsta ? 'Ya está en tu biblioteca' : estados[t.trackId] === 'error' ? 'Reintentar añadir a mi biblioteca' : 'Añadir a mi biblioteca'}
                onClick={() => agregar(t)}
              >
                <IconoM nombre={yaEsta ? 'check' : 'mas'} />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
