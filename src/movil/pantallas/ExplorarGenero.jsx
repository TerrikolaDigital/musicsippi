// src/movil/pantallas/ExplorarGenero.jsx
// Buscar sin texto > «Explorar por género». Al elegir un género se recarga todo con él:
// artistas destacados (los parecidos a los tuyos primero), álbumes (3 columnas) y canciones en
// tendencia (2 columnas, con ▶ y ＋). Datos de Deezer, caché de 12 h por género.
import { useEffect, useMemo, useState } from 'react';
import CarruselArtistas from '../CarruselArtistas.jsx';
import HojaExterna from '../HojaExterna.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import TarjetaExterna from '../inicio/TarjetaExterna.jsx';
import { almacenPorDefecto, cargarConCache, HORA_MS } from '../inicio/cache.js';
import { deezerConIds, dzUnico, useAccionesExternas } from '../inicio/externas.js';
import { norm, semillaRecomendados } from '../busqueda.js';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import { GENEROS_EXPLORAR, MAX_ALBUMES, MAX_CANCIONES, cargarGenero, generoPorId, ordenarArtistas } from '../explorar.js';
import { formatearTitulo } from '../../ui/formato.js';

const SEMILLAS = 4;
const PARECIDOS_POR_SEMILLA = 20;

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

function Esqueleto() {
  return (
    <div aria-hidden="true" aria-label="Cargando">
      <div className="m-seccion">
        <h2 className="explorar-esq explorar-esq-titulo" />
      </div>
      <div className="explorar-esq-fila">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="explorar-esq explorar-esq-circulo" />
        ))}
      </div>
      <div className="m-seccion">
        <h2 className="explorar-esq explorar-esq-titulo" />
      </div>
      <div className="explorar-albumes">
        {[0, 1, 2].map((i) => (
          <span key={i} className="explorar-esq explorar-esq-cuadro" />
        ))}
      </div>
      <div className="m-seccion">
        <h2 className="explorar-esq explorar-esq-titulo" />
      </div>
      <div className="explorar-canciones">
        {[0, 1].map((i) => (
          <span key={i} className="explorar-esq explorar-esq-cuadro" />
        ))}
      </div>
    </div>
  );
}

/** Nombres (normalizados) de los artistas parecidos a los que más escuchas; vacío mientras carga o si falla. */
function useParecidos(tracks) {
  const semilla = useMemo(() => semillaRecomendados(tracks, SEMILLAS), [tracks]);
  const clave = semilla.join('|');
  const [parecidos, setParecidos] = useState(() => new Set());
  useEffect(() => {
    if (semilla.length === 0) {
      setParecidos(new Set());
      return undefined;
    }
    let vivo = true;
    cargarConCache(`explorar-parecidos:${clave}`, {
      ttlMs: 72 * HORA_MS,
      almacen: almacenPorDefecto(),
      cargar: async () => {
        const dz = deezerConIds();
        const nombres = [];
        for (const n of semilla) {
          const a = await dz.buscarArtista(n).catch(() => null);
          if (!a) continue;
          nombres.push(...(await dz.relacionados(a.id, PARECIDOS_POR_SEMILLA).catch(() => [])).map((r) => r.nombre));
        }
        return nombres;
      },
    })
      .then((r) => vivo && setParecidos(new Set(r.datos.map(norm))))
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return parecidos;
}

export default function ExplorarGenero({ ctx, nav }) {
  const [generoId, setGeneroId] = useState('todos');
  const [intento, setIntento] = useState(0);
  const [estado, setEstado] = useState({ fase: 'cargando' });
  const [menu, setMenu] = useState(null);
  const acciones = useAccionesExternas(ctx, 'Tendencias');
  const parecidos = useParecidos(ctx.tracks);

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'cargando' });
    cargarConCache(`explorar:${generoId}`, {
      ttlMs: 12 * HORA_MS,
      almacen: almacenPorDefecto(),
      cargar: () => cargarGenero(generoPorId(generoId), dzUnico().crudo),
    })
      .then((r) => vivo && setEstado({ fase: 'ok', datos: r.datos }))
      .catch(() => vivo && setEstado({ fase: 'error' }));
    return () => {
      vivo = false;
    };
  }, [generoId, intento]);

  const d = estado.datos;
  const artistas = useMemo(() => (d ? ordenarArtistas(filtrarNoMeGusta(d.artistas, ctx.noMeGusta), parecidos) : []), [d, parecidos, ctx.noMeGusta]);
  const albumes = useMemo(() => (d ? filtrarNoMeGusta(d.albumes, ctx.noMeGusta).slice(0, MAX_ALBUMES) : []), [d, ctx.noMeGusta]);
  const canciones = useMemo(() => (d ? filtrarNoMeGusta(d.canciones, ctx.noMeGusta).slice(0, MAX_CANCIONES) : []), [d, ctx.noMeGusta]);

  return (
    <>
      <Seccion titulo="Explorar por género">
        <div className="m-chips explorar-m-generos" role="tablist" aria-label="Géneros">
          {GENEROS_EXPLORAR.map((g) => (
            <button key={g.id} role="tab" aria-selected={generoId === g.id} className={generoId === g.id ? 'on' : ''} onClick={() => setGeneroId(g.id)}>
              {g.nombre}
            </button>
          ))}
        </div>
      </Seccion>

      {estado.fase === 'cargando' && <Esqueleto />}

      {estado.fase === 'error' && (
        <div className="explorar-error" role="status">
          <p>No se pudo cargar {generoPorId(generoId).nombre}. Comprueba la conexión.</p>
          <button onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
        </div>
      )}

      {estado.fase === 'ok' && (
        <div className="explorar-contenido" key={generoId}>
          {artistas.length > 0 && (
            <Seccion titulo="Artistas destacados">
              <CarruselArtistas
                artistas={artistas.map((a) => ({ nombre: a.nombre, foto: a.foto, sub: a.paraTi ? 'Para ti' : undefined }))}
                onAbrir={(n) => nav.abrir({ tipo: 'artista', nombre: n })}
              />
            </Seccion>
          )}
          {albumes.length > 0 && (
            <Seccion titulo="Álbumes destacados">
              <div className="explorar-albumes">
                {albumes.map((a) => (
                  <button
                    key={a.id}
                    className="explorar-album"
                    aria-label={`${formatearTitulo(a.titulo)}, ${formatearTitulo(a.artista)}`}
                    onClick={() => nav.abrir({ tipo: 'album', artista: a.artista, titulo: a.titulo })}
                  >
                    <span className="explorar-album-img">
                      <PortadaImg src={a.cover} texto={a.titulo} loading="lazy" />
                    </span>
                    <b>{formatearTitulo(a.titulo)}</b>
                    <small>{formatearTitulo(a.artista)}</small>
                  </button>
                ))}
              </div>
            </Seccion>
          )}
          {canciones.length > 0 && (
            <Seccion titulo="Canciones en tendencia">
              <div className="explorar-canciones">
                {canciones.map((c) => (
                  <TarjetaExterna
                    key={c.id}
                    cancion={c}
                    estadoPlay={acciones.estados[`${c.id}:play`]}
                    estadoAdd={acciones.estados[c.id]}
                    onPlay={() => acciones.escuchar(c)}
                    onAdd={() => acciones.agregar(c)}
                    onMenu={() => setMenu(c)}
                  />
                ))}
              </div>
            </Seccion>
          )}
        </div>
      )}
      {menu && <HojaExterna ctx={ctx} cancion={menu} onAgregar={() => acciones.agregar(menu)} onCerrar={() => setMenu(null)} />}
    </>
  );
}
