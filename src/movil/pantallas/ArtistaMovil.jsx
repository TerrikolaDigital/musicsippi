// src/movil/pantallas/ArtistaMovil.jsx
// Ficha de artista: cabecera con foto, acciones y pestañas En tu biblioteca ·
// Populares · Álbumes. Los datos de Deezer se cargan con ctx.cargarArtista.
import { useEffect, useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { colorTarjeta } from '../formato.js';
import { useTramos } from '../useTramos.js';
import { formatearTitulo } from '../../ui/formato.js';
import { compartirMusica } from '../compartirMusica.js';
import CarruselArtistas from '../CarruselArtistas.jsx';
import PopularesArtista from './PopularesArtista.jsx';
import { hacenFaltaPopulares, pestanaInicialArtista, pistasDePopulares } from '../populares.js';
import EstadoVacio from '../EstadoVacio.jsx';
import Pestanas from '../Pestanas.jsx';

const PESTANAS = [
  ['biblioteca', 'En tu biblioteca'],
  ['populares', 'Populares'],
  ['albumes', 'Álbumes'],
];

// Los dos modos (no de sistema) donde más suena este artista.
function modosDe(canciones, ejes) {
  const cuenta = new Map();
  for (const t of canciones) for (const a of t.ejes ?? []) cuenta.set(a.ejeId, (cuenta.get(a.ejeId) ?? 0) + 1);
  return ejes
    .filter((e) => !e.sistema && cuenta.has(e.id))
    .sort((a, b) => cuenta.get(b.id) - cuenta.get(a.id))
    .slice(0, 2)
    .map((e) => formatearTitulo(e.nombre));
}

export default function ArtistaMovil({ ctx, nav, nombre }) {
  const [iniciado, setIniciado] = useState(false);
  const propias = useMemo(() => ctx.tracksDeArtista(nombre), [ctx.tracksDeArtista, nombre]);
  // Sin canciones propias no hay nada que ver en «En tu biblioteca»: se abre en «Populares».
  const [pestana, setPestana] = useState(() => pestanaInicialArtista(propias.length));
  const [estados, setEstados] = useState({}); // trackId -> 'agregando' | 'ok' | 'error'

  // `ctx.artista` es compartido: hasta que el efecto lo pone a cargar podría
  // quedar el de la pantalla anterior, así que no se pinta antes de arrancar.
  useEffect(() => {
    ctx.cargarArtista(nombre);
    setIniciado(true);
    // cargarArtista es estable (useCallback sin dependencias).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  const { cuantas, centinela } = useTramos(propias.length, nombre);
  const a = iniciado ? ctx.artista : null;
  const cargando = !a || a.cargando;
  const encontrado = !!a?.encontrado;
  const enBiblioteca = useMemo(() => new Set(ctx.tracks.map((t) => t.id)), [ctx.tracks]);
  const modos = useMemo(() => modosDe(propias, ctx.ejes), [propias, ctx.ejes]);
  // Como en escritorio: primero los que aún no tienes, luego los de tu biblioteca; por fans.
  const similares = useMemo(() => {
    const suyos = new Set(ctx.artistasBiblioteca.map((x) => x.nombre.toLowerCase()));
    const porFans = (x, y) => (y.nbFans ?? 0) - (x.nbFans ?? 0);
    const lista = [...(a?.similares ?? [])];
    const nuevos = lista.filter((s) => !suyos.has(s.nombre.toLowerCase())).sort(porFans);
    const conocidos = lista.filter((s) => suyos.has(s.nombre.toLowerCase())).sort(porFans);
    return [...nuevos, ...conocidos].slice(0, 12).map((s) => ({
      nombre: s.nombre,
      foto: s.fotoUrl,
      sub: suyos.has(s.nombre.toLowerCase()) ? 'en tu biblioteca' : 'nuevo para ti',
    }));
  }, [a, ctx.artistasBiblioteca]);

  const nombreMostrado = formatearTitulo(encontrado ? a.nombre : nombre);
  const foto = (encontrado && a.fotoUrl) || ctx.fotoDeArtista(nombre);
  const esFavorito = ctx.favoritos.artistas.includes(nombre.trim().toLowerCase());
  // La radio parte de la canción que suena: solo tiene sentido si es de este artista.
  const suenaDeEl = !!ctx.trackActual && propias.some((t) => t.id === ctx.trackActual.id);

  // ▶ y aleatorio suenan lo tuyo y, si no hay nada tuyo, las populares del artista.
  const populares = useMemo(() => (encontrado ? pistasDePopulares(a.canciones, ctx.tracks) : []), [encontrado, a, ctx.tracks]);
  const reproducibles = propias.length > 0 ? propias : populares;
  const reproducir = (aleatorio) => {
    if (reproducibles.length === 0) return;
    const lista = aleatorio ? ctx.barajar(reproducibles) : reproducibles;
    ctx.reproducirSecuencia(lista, nombreMostrado, { aleatorio });
  };

  async function agregar(c) {
    if (estados[c.trackId] === 'agregando') return; // evita el doble toque
    setEstados((s) => ({ ...s, [c.trackId]: 'agregando' }));
    try {
      await ctx.agregarTrackSuelto(c, { favorito: false, albumTitulo: c.albumTitulo });
      setEstados((s) => ({ ...s, [c.trackId]: 'ok' }));
    } catch (error) {
      setEstados((s) => ({ ...s, [c.trackId]: 'error' }));
      ctx.avisar?.(`No se pudo añadir «${formatearTitulo(c.titulo)}». Toca «+» para reintentar. ${error?.message ?? ''}`.trim());
    }
  }

  return (
    <div className="detalle-modo heroe" style={{ '--color-modo': colorTarjeta({ id: `artista-${nombre}` }) }}>
      {foto && (
        <div className="heroe-fondo" aria-hidden="true">
          <div className="heroe-fondo-img" style={{ backgroundImage: `url("${foto}")` }} />
        </div>
      )}
      <div className="heroe-img">
        {foto && <img src={foto} alt="" />}
        <button className="m-redondo heroe-atras" aria-label="Volver" onClick={nav.atras}>
          <IconoM nombre="atras" />
        </button>
      </div>
      <div className="heroe-texto">
        <h1 className="heroe-nombre">{nombreMostrado}</h1>
        <p className="heroe-sub">
          {propias.length} en tu biblioteca
          {modos.length > 0 && ` · en ${modos.join(' y ')}`}
        </p>

      <div className="detalle-modo-acciones">
        <button
          className="m-sec"
          aria-label="Reproducir en aleatorio"
          disabled={reproducibles.length === 0}
          onClick={() => reproducir(true)}
        >
          <IconoM nombre="aleatorio" />
        </button>
        <button className="m-play" aria-label="Reproducir" disabled={reproducibles.length === 0} onClick={() => reproducir(false)}>
          <IconoM nombre="play" tamano={26} />
        </button>
        {suenaDeEl && (
          <button className="m-sec" aria-label="Radio desde la canción que suena" onClick={() => ctx.iniciarRadio()}>
            <IconoM nombre="radio" />
          </button>
        )}
        <button
          className={`m-sec${esFavorito ? ' on' : ''}`}
          aria-label={esFavorito ? 'Quitar artista de favoritos' : 'Añadir artista a favoritos'}
          aria-pressed={esFavorito}
          onClick={() => ctx.alternarFavoritoArtista(nombre, !esFavorito)}
        >
          <IconoM nombre={esFavorito ? 'corazon-lleno' : 'corazon'} />
        </button>
        <button
          className="m-sec"
          aria-label="Compartir artista"
          onClick={() =>
            compartirMusica(ctx, { tipo: 'artista', titulo: nombreMostrado, artista: nombreMostrado }).catch((e) =>
              ctx.avisar?.(`No se pudo compartir: ${String(e?.message ?? e)}`),
            )
          }
        >
          <IconoM nombre="compartir" />
        </button>
        <button className="m-sec" aria-label="Más opciones del artista" aria-haspopup="dialog" onClick={() => nav.abrirCapa({ tipo: 'hoja', artista: nombre })}>
          <IconoM nombre="puntos" />
        </button>
      </div>
      </div>

      <Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} etiqueta={`Qué ver de ${nombreMostrado}`} />

      {pestana === 'biblioteca' &&
        (propias.length === 0 ? (
          <EstadoVacio
            titulo={`No tienes canciones de ${nombreMostrado}`}
            accion={{ etiqueta: 'Ver populares', onClick: () => setPestana('populares') }}
          >
            Mira sus éxitos y añade los que quieras a tu biblioteca.
          </EstadoVacio>
        ) : (
          <>
            {propias.slice(0, cuantas).map((t) => (
              <FilaCancion
                key={t.id}
                track={t}
                meta={ctx.metadataDe(t.id)}
                activa={ctx.trackActual?.id === t.id}
                pausada={!ctx.sonando}
                onTocar={() => ctx.reproducirLista(t, propias, nombreMostrado)}
                onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
                onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
              />
            ))}
            {cuantas < propias.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
          </>
        ))}

      {pestana === 'biblioteca' && hacenFaltaPopulares(propias.length) && (
        <PopularesArtista ctx={ctx} nombre={nombre} propias={propias} />
      )}

      {pestana !== 'biblioteca' && cargando && (
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="m-silueta" />
          ))}
        </div>
      )}
      {pestana !== 'biblioteca' && !cargando && !encontrado &&
        (propias.length === 0 ? (
          <EstadoVacio titulo={`No hemos encontrado a ${nombreMostrado}`} accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
            {a?.error ?? 'Ahora mismo no hay datos de este artista en Deezer.'}
          </EstadoVacio>
        ) : (
          <p className="m-aviso">
            {a?.error ?? `No hemos encontrado a ${nombreMostrado} en Deezer. Solo se muestra tu biblioteca.`}
          </p>
        ))}

      {pestana === 'populares' && encontrado && a.canciones.length === 0 && (
        <EstadoVacio titulo="Sin populares">Deezer no tiene éxitos de {nombreMostrado}.</EstadoVacio>
      )}
      {pestana === 'populares' &&
        encontrado &&
        a.canciones.map((c, i) => {
          const yaEsta = estados[c.trackId] === 'ok' || c.yaEnBiblioteca || enBiblioteca.has(c.trackId);
          return (
            <FilaCancion
              key={`${c.trackId}-${i}`}
              track={c}
              meta={{ coverUrl: c.coverUrl, duracionMs: c.duracionMs }}
              activa={ctx.trackActual?.id === c.trackId || ctx.trackActual?.id === `album-${c.trackId}`}
              pausada={!ctx.sonando}
              onTocar={() => ctx.reproducirCancionesArtista(i)}
              iconoMas={yaEsta ? 'puntos-v' : 'mas'}
              etiquetaMas={yaEsta ? 'Más opciones' : estados[c.trackId] === 'error' ? 'Reintentar añadir a mi biblioteca' : 'Añadir a mi biblioteca'}
              onMas={() => (yaEsta ? nav.abrirCapa({ tipo: 'hoja', trackId: c.trackId }) : agregar(c))}
              onPulsacionLarga={yaEsta ? () => nav.abrirCapa({ tipo: 'hoja', trackId: c.trackId }) : undefined}
            />
          );
        })}

      {pestana === 'albumes' &&
        encontrado &&
        (a.albumes.length === 0 ? (
          <EstadoVacio titulo="Sin álbumes">Deezer no lista álbumes de {nombreMostrado}.</EstadoVacio>
        ) : (
          <div className="bib-rejilla albumes">
            {[...a.albumes]
              .sort((x, y) => (y.anio ?? -1) - (x.anio ?? -1))
              .map((al) => (
                <button
                  key={al.titulo}
                  className="bib-album"
                  onClick={() => nav.abrir({ tipo: 'album', artista: a.nombre, titulo: al.titulo })}
                >
                  {al.coverUrl ? (
                    <img src={al.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="bib-album-sin" style={{ background: colorTarjeta({ id: `album-${al.titulo}` }) }} />
                  )}
                  <b>{formatearTitulo(al.titulo)}</b>
                  <small>{al.anio ?? ''}</small>
                </button>
              ))}
          </div>
        ))}

      {similares.length > 0 && (
        <>
          <div className="m-seccion">
            <h2>Artistas similares</h2>
          </div>
          <CarruselArtistas artistas={similares} onAbrir={(n) => nav.abrir({ tipo: 'artista', nombre: n })} />
        </>
      )}
    </div>
  );
}
