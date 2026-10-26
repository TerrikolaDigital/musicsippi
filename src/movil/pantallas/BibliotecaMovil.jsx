// src/movil/pantallas/BibliotecaMovil.jsx
// Pestaña Biblioteca: Canciones (con filtro ♥ de favoritas) · Artistas · Álbumes.
import { useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { colorTarjeta } from '../formato.js';
import { useTramos } from '../useTramos.js';
import { formatearTitulo } from '../../ui/formato.js';
import { PESTANAS_BIBLIOTECA, cancionesDeBiblioteca, tomarPestanaBiblioteca } from '../biblioteca.js';
import { ORDENES_ARTISTAS, guardarOrdenArtistas, leerOrdenArtistas, ordenarArtistas } from '../ordenArtistas.js';
import { ORDENES_ALBUMES, guardarOrdenAlbumes, leerOrdenAlbumes, ordenarAlbumes } from '../ordenAlbumes.js';
import { irABuscarEnBiblioteca } from '../busquedaPedida.js';
import EstadoVacio from '../EstadoVacio.jsx';
import Pestanas from '../Pestanas.jsx';

const iniciales = (nombre) =>
  formatearTitulo(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

// Lupa de la fila de controles: abre Buscar con «En tu biblioteca» y el campo listo.
function BotonBuscar({ nav }) {
  return (
    <button className="bib-buscar" aria-label="Buscar en tu biblioteca" onClick={() => irABuscarEnBiblioteca(nav)}>
      <IconoM nombre="buscar" tamano={22} />
    </button>
  );
}

function Canciones({ ctx, nav, soloFavoritas, onAlternarFavoritas }) {
  const favoritas = useMemo(() => ctx.tracksDe('favoritos'), [ctx.tracksDe]);
  const lista = useMemo(
    () => cancionesDeBiblioteca(ctx.tracks, { soloFavoritas, favoritasIds: new Set(favoritas.map((t) => t.id)) }),
    [ctx.tracks, soloFavoritas, favoritas],
  );
  const { cuantas, centinela } = useTramos(lista.length, soloFavoritas ? 'favoritas' : 'todas');
  const eje = ctx.ejes.find((e) => e.id === 'favoritos');
  const reproducir = (t, aleatorio) => {
    if (soloFavoritas && eje) return ctx.reproducirModo(eje, lista, t, aleatorio);
    // En aleatorio la primera canción sale de la lista ya barajada (antes era siempre lista[0]).
    const cola = aleatorio ? ctx.barajar(lista) : lista;
    return ctx.reproducirLista(t ?? cola[0], cola, soloFavoritas ? 'Favoritas' : 'Tu biblioteca');
  };

  return (
    <>
      <div className="bib-filtros">
        <button
          className={`bib-filtro-fav${soloFavoritas ? ' on' : ''}`}
          aria-pressed={soloFavoritas}
          onClick={onAlternarFavoritas}
        >
          <IconoM nombre={soloFavoritas ? 'corazon-lleno' : 'corazon'} tamano={20} />
          Favoritas
        </button>
        <div className="bib-filtros-der">
          <BotonBuscar nav={nav} />
          {lista.length > 0 && (
            <div className="detalle-modo-acciones">
              <button className="m-sec" aria-label="Reproducir en aleatorio" onClick={() => reproducir(null, true)}>
                <IconoM nombre="aleatorio" />
              </button>
              <button className="m-play" aria-label="Reproducir" onClick={() => reproducir(null, false)}>
                <IconoM nombre="play" tamano={26} />
              </button>
            </div>
          )}
        </div>
      </div>
      {lista.length === 0 ? (
        soloFavoritas ? (
          <EstadoVacio titulo="Aún no tienes favoritas" accion={{ etiqueta: 'Ver toda la biblioteca', onClick: onAlternarFavoritas }}>
            Toca el corazón de una canción para guardarla aquí.
          </EstadoVacio>
        ) : (
          <EstadoVacio titulo="Tu biblioteca está vacía" accion={{ etiqueta: 'Explorar música', onClick: () => nav.irAPestana('buscar') }}>
            Explora música y añade lo que te guste con +.
          </EstadoVacio>
        )
      ) : (
        lista.slice(0, cuantas).map((t) => (
          <FilaCancion
            key={t.id}
            track={t}
            meta={ctx.metadataDe(t.id)}
            activa={ctx.trackActual?.id === t.id}
            pausada={!ctx.sonando}
            onTocar={() => reproducir(t, false)}
            onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
            onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
          />
        ))
      )}
      {cuantas < lista.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
    </>
  );
}

function Artistas({ ctx, nav }) {
  const [orden, setOrden] = useState(leerOrdenArtistas);
  const elegirOrden = (id) => {
    setOrden(id);
    guardarOrdenArtistas(id);
  };
  const artistas = useMemo(() => ordenarArtistas(ctx.artistasBiblioteca, orden), [ctx.artistasBiblioteca, orden]);
  const { cuantas, centinela } = useTramos(artistas.length, artistas.length);
  if (artistas.length === 0) {
    return (
      <EstadoVacio titulo="Aún no hay artistas" accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
        Los artistas de tu biblioteca aparecerán aquí.
      </EstadoVacio>
    );
  }
  return (
    <>
      <div className="bib-filtros">
        <div className="m-segmentado bib-orden" role="group" aria-label="Ordenar artistas">
          {ORDENES_ARTISTAS.map(([id, etiqueta]) => (
            <button key={id} aria-pressed={orden === id} className={orden === id ? 'on' : ''} onClick={() => elegirOrden(id)}>
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="bib-filtros-der">
          <BotonBuscar nav={nav} />
        </div>
      </div>
      <div className="bib-rejilla artistas">
        {artistas.slice(0, cuantas).map((a) => {
          const foto = ctx.fotoDeArtista(a.nombre);
          return (
            <button key={a.nombre} className="bib-artista" onClick={() => nav.abrir({ tipo: 'artista', nombre: a.nombre })}>
              {foto ? (
                <img src={foto} alt="" loading="lazy" />
              ) : (
                <span className="bib-artista-sin" style={{ background: colorTarjeta({ id: `artista-${a.nombre}` }) }}>
                  {iniciales(a.nombre)}
                </span>
              )}
              <b>{formatearTitulo(a.nombre)}</b>
              <small>
                {a.cantidad} {a.cantidad === 1 ? 'canción' : 'canciones'}
              </small>
            </button>
          );
        })}
      </div>
      {cuantas < artistas.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
    </>
  );
}

function Albumes({ ctx, nav }) {
  const [orden, setOrden] = useState(leerOrdenAlbumes);
  const albumes = useMemo(() => ordenarAlbumes(ctx.albumesBiblioteca, orden), [ctx.albumesBiblioteca, orden]);
  const { cuantas, centinela } = useTramos(albumes.length, albumes.length);
  const fila = (
    <div className="bib-filtros">
      <div className="m-segmentado bib-orden" role="group" aria-label="Ordenar álbumes">
        {ORDENES_ALBUMES.map(([id, etiqueta]) => (
          <button
            key={id}
            aria-pressed={orden === id}
            className={orden === id ? 'on' : ''}
            onClick={() => {
              setOrden(id);
              guardarOrdenAlbumes(id);
            }}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <div className="bib-filtros-der">
        <BotonBuscar nav={nav} />
      </div>
    </div>
  );
  if (albumes.length === 0)
    return (
      <>
        {fila}
        <EstadoVacio titulo="Aún no hay álbumes" accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
          Los álbumes de tu biblioteca aparecerán aquí.
        </EstadoVacio>
      </>
    );
  return (
    <>
      {fila}
      <div className="bib-rejilla albumes">
        {albumes.slice(0, cuantas).map((a, i) => (
          <button
            key={`${a.artista}||${a.titulo}||${i}`}
            className="bib-album"
            onClick={() => nav.abrir({ tipo: 'album', artista: a.artista, titulo: a.titulo })}
          >
            {a.coverUrl ? (
              <img src={a.coverUrl} alt="" loading="lazy" />
            ) : (
              <span className="bib-album-sin" style={{ background: colorTarjeta({ id: `album-${a.titulo}` }) }} />
            )}
            <b>{formatearTitulo(a.titulo)}</b>
            <small>{formatearTitulo(a.artista)}</small>
          </button>
        ))}
      </div>
      {cuantas < albumes.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
    </>
  );
}

export default function BibliotecaMovil({ ctx, nav }) {
  // Si otra pantalla pidió una pestaña (p. ej. «Ver todo» de Tus artistas), se abre esa.
  const [inicial] = useState(tomarPestanaBiblioteca);
  const [pestana, setPestana] = useState(inicial.pestana);
  const [soloFavoritas, setSoloFavoritas] = useState(inicial.favoritas);
  return (
    <div>
      <div className="m-cabecera">
        <h1 className="m-titulo">Biblioteca</h1>
        {ctx.modoLocal && (
          <button className="m-redondo" aria-label="Añadir música" onClick={() => nav.abrirCapa({ tipo: 'hoja', config: 'anadir' })}>
            <IconoM nombre="mas" />
          </button>
        )}
      </div>
      <Pestanas opciones={PESTANAS_BIBLIOTECA} valor={pestana} onCambio={setPestana} etiqueta="Qué ver de tu biblioteca" />
      <div className="bib-accesos">
        <button className="bib-acceso" onClick={() => nav.abrir({ tipo: 'estadisticas' })}>
          <IconoM nombre="estadisticas" tamano={20} />
          Estadísticas
        </button>
        <button className="bib-acceso" onClick={() => nav.abrir({ tipo: 'historial' })}>
          <IconoM nombre="historial" tamano={20} />
          Historial
        </button>
      </div>
      {pestana === 'canciones' && (
        <Canciones ctx={ctx} nav={nav} soloFavoritas={soloFavoritas} onAlternarFavoritas={() => setSoloFavoritas((v) => !v)} />
      )}
      {pestana === 'artistas' && <Artistas ctx={ctx} nav={nav} />}
      {pestana === 'albumes' && <Albumes ctx={ctx} nav={nav} />}
    </div>
  );
}
