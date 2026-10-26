// src/movil/HojaAcciones.jsx
// Contenido de la hoja ⋯ / ⋮: acciones de una canción (HojaAcciones) y del modo
// que se está mirando (HojaModo). Las acciones son las de `ctx`; las
// sub-listas (modos, listas, temporizador, corregir datos) viven dentro de la
// misma hoja, con su flecha para volver al menú.
import { useState } from 'react';
import Interruptor from './pantallas/Interruptor.jsx';
import './moods-ajustes.css';
import HojaInferior from './HojaInferior.jsx';
import { IconoM } from './iconos.jsx';
import { portadaDe } from './MiniReproductor.jsx';
import { formatearTitulo } from '../ui/formato.js';
import { colorTarjeta } from './formato.js';
import { sinVacios, modosParaUnir, preguntaUnir, modoVisible, conVisibilidad, seRellenaSola, conAutoRellenar, familiaDe, TEXTO_AUTO_RELLENAR } from './modos.js';
import { compartirMusica } from './compartirMusica.js';
import { albumDe, primerArtista } from './albumLocal.js';
import { imagenADataUrl } from './portadaEje.js';
import { entradaArtista, entradaCancion } from './noMeGusta.js';
import HojaAlbum from './HojaAlbum.jsx';
import { pistasDePopulares } from './populares.js';
import { UMBRAL_BUSCADOR, buscarDestinos, deshacerMover, destinosDeMover, planMover } from './moverMood.js';

const MINUTOS = [15, 30, 45, 60];

function Opcion({ icono, children, onClick, peligro }) {
  return (
    <button className={`hoja-op${peligro ? ' peligro' : ''}`} onClick={onClick}>
      <IconoM nombre={icono} />
      <span>{children}</span>
    </button>
  );
}

function Casilla({ marcada, onCambiar, children }) {
  return (
    <button className="hoja-op" role="checkbox" aria-checked={marcada} onClick={onCambiar}>
      <span
        className={`hoja-casilla${marcada ? ' on' : ''}`}
        style={marcada ? { background: 'var(--acento)', borderColor: 'var(--acento)', color: '#fff' } : undefined}
      >{marcada && <IconoM nombre="check" tamano={16} />}</span>
      <span>{children}</span>
    </button>
  );
}

function CabeceraSub({ titulo, onVolver }) {
  return (
    <div className="hoja-sub-cab">
      <button type="button" className="m-redondo" aria-label="Volver" onClick={onVolver}>
        <IconoM nombre="atras" />
      </button>
      <h2>{titulo}</h2>
    </div>
  );
}

function FormularioDatos({ ctx, track, meta, onListo, onVolver }) {
  const [borrador, setBorrador] = useState({
    titulo: track.titulo,
    artista: track.artista,
    album: meta?.album ?? '',
    anio: meta?.anio ?? '',
  });
  const [error, setError] = useState(null);
  const campo = (clave, etiqueta, tipo = 'text') => (
    <label className="hoja-campo">
      {etiqueta}
      <input
        className="m-input"
        type={tipo}
        value={borrador[clave]}
        onChange={(e) => setBorrador({ ...borrador, [clave]: e.target.value })}
      />
    </label>
  );
  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await ctx.guardarOverride(track.id, borrador);
      onListo();
    } catch (err) {
      setError(String(err?.message ?? err));
    }
  };
  return (
    <form onSubmit={guardar}>
      <CabeceraSub titulo="Corregir datos" onVolver={onVolver} />
      {campo('titulo', 'Canción')}
      {campo('artista', 'Artista')}
      {campo('album', 'Álbum')}
      {campo('anio', 'Año', 'number')}
      {error && <p className="m-aviso">No se pudo guardar: {error}</p>}
      <p className="hoja-nota">Se guarda aparte de la importación original. Vaciar un campo vuelve al dato original.</p>
      <button type="submit" className="m-boton-grad hoja-guardar">
        Guardar
      </button>
    </form>
  );
}

export default function HojaAcciones({ ctx, nav, trackId }) {
  const [vista, setVista] = useState('menu');
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null); // {texto, deshacer} de los cambios de mood, con Deshacer dentro de la hoja
  const [busqueda, setBusqueda] = useState('');
  const [nombreLista, setNombreLista] = useState('');

  const guardado = ctx.tracks.find((t) => t.id === trackId);
  const track = guardado ?? (ctx.trackActual?.id === trackId ? ctx.trackActual : null);
  if (!track) return null;

  const meta = ctx.metadataDe(track.trackIdReal ?? track.id);
  const portada = portadaDe(ctx, track);
  const suena = ctx.trackActual?.id === trackId;
  // Los modos vacíos (p. ej. tras una fusión) no se ofrecen. Las listas sí aunque estén vacías:
  // si no, no habría forma de meter la primera canción en una lista recién creada.
  const modos = sinVacios(
    ctx.ejes.filter((e) => (e.tipo === 'gusto' || e.tipo === 'funcional') && !e.sistema && e.activo !== false),
    ctx.conteos,
  );
  const listas = ctx.ejes.filter((e) => e.tipo === 'playlist' && e.activo !== false && !e.seguida);
  const en = (ejeId) => !!guardado?.ejes?.some((x) => x.ejeId === ejeId);
  const cerrar = () => nav.atras();

  // Las sub-listas muestran el estado de ctx.tracks, que App actualiza tras cada acción.
  const alternar = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  };

  const nombreMood = (id) => formatearTitulo(ctx.ejes.find((e) => e.id === id)?.nombre ?? id);
  // Cambia los moods de la canción (primero se pone, luego se quita, para no pasar por «sin clasificar»)
  // y avisa con Deshacer. Cada paso va por ctx.asignarEje / ctx.quitarModo: se anotan en el journal al PC.
  const aplicar = async ({ poner, quitar }) => {
    for (const id of poner) await ctx.asignarEje(trackId, id);
    for (const id of quitar) await ctx.quitarModo(trackId, id);
  };
  const cambiarMoods = (cambio, texto) =>
    alternar(async () => {
      await aplicar(cambio);
      setAviso({ texto, deshacer: deshacerMover(cambio) });
    });
  const deshacer = () => {
    const d = aviso?.deshacer;
    setAviso(null);
    if (d) alternar(() => aplicar(d));
  };
  const tocarChip = (e) =>
    en(e.id)
      ? cambiarMoods({ poner: [], quitar: [e.id] }, `Quitada de «${nombreMood(e.id)}»`)
      : cambiarMoods({ poner: [e.id], quitar: [] }, `Añadida a «${nombreMood(e.id)}»`);
  const moverA = (destino) => {
    const { poner, quitar } = planMover(guardado?.ejes, destino, ctx.ejes);
    setVista('menu');
    setBusqueda('');
    return cambiarMoods({ poner: [poner], quitar }, `Movida a «${nombreMood(poner)}»`);
  };

  const verLetra = () => {
    const capa = { tipo: 'reproductor', vista: 'letra' };
    if (nav.capas.some((c) => c.tipo === 'reproductor')) {
      // Ya hay reproductor debajo: se pone en la letra y se cierra la hoja.
      nav.cambiarCapa(capa);
      nav.atras();
    } else {
      nav.sustituirCapa(capa);
    }
  };

  // La copia que entra en la cola es la de la biblioteca si existe (con sus modos al día).
  const aCola = (fn) => () => {
    cerrar();
    fn(track);
  };

  const volverAEmpezar = () => {
    cerrar();
    ctx.reiniciar();
  };

  const radio = () => {
    cerrar();
    ctx.iniciarRadio();
  };

  const compartir = () => {
    cerrar();
    compartirMusica(ctx, {
      tipo: 'cancion',
      titulo: formatearTitulo(track.titulo),
      artista: formatearTitulo(track.artista),
      trackId: track.id,
    }).catch((e) => ctx.avisar?.(`No se pudo compartir: ${String(e?.message ?? e)}`));
  };

  const quitar = async () => {
    if (!window.confirm(`¿Quitar «${formatearTitulo(track.titulo)}» de tu biblioteca?`)) return;
    await alternar(async () => {
      await ctx.quitarTrackSuelto(trackId);
      cerrar();
    });
  };

  // Lista nueva con esta canción dentro: crearEje devuelve el id de la lista recién guardada.
  const nuevaLista = async (nombre) => {
    if (!nombre || !nombre.trim()) return;
    await alternar(async () => {
      const id = await ctx.crearEje(nombre, 'playlist');
      if (!id) return;
      await ctx.guardarColeccion(trackId, id, true);
      setNombreLista('');
      setVista('listas');
    });
  };

  const fijar = (valor) => {
    ctx.fijarTemporizador(valor);
    cerrar();
  };

  let cuerpo;
  if (vista === 'listas') {
    cuerpo = (
      <>
        <CabeceraSub titulo="Añadir a una lista" onVolver={() => setVista('menu')} />
        {listas.map((e) => (
          <Casilla
            key={e.id}
            marcada={en(e.id)}
            onCambiar={() => alternar(() => ctx.guardarColeccion(trackId, e.id, !en(e.id)))}
          >
            {formatearTitulo(e.nombre)}
          </Casilla>
        ))}
        {listas.length === 0 && <p className="hoja-nota">Aún no tienes listas.</p>}
        <Opcion icono="mas" onClick={() => setVista('nueva-lista')}>
          Nueva lista
        </Opcion>
      </>
    );
  } else if (vista === 'nueva-lista') {
    // Sin window.prompt (en el WebView del móvil no es fiable): el nombre se escribe aquí mismo.
    cuerpo = (
      <>
        <CabeceraSub titulo="Nueva lista" onVolver={() => setVista('listas')} />
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            nuevaLista(nombreLista);
          }}
        >
          <input
            className="m-input"
            value={nombreLista}
            onChange={(ev) => setNombreLista(ev.target.value)}
            placeholder="Nombre de la lista"
            aria-label="Nombre de la lista"
            autoFocus
            maxLength={40}
          />
          <button className="m-boton-grad" type="submit" disabled={!nombreLista.trim()}>
            Crear y añadir
          </button>
        </form>
      </>
    );
  } else if (vista === 'mover') {
    const destinos = destinosDeMover(ctx.ejes);
    const visibles = buscarDestinos(destinos, busqueda);
    cuerpo = (
      <>
        <CabeceraSub titulo="Mover a otro mood" onVolver={() => { setVista('menu'); setBusqueda(''); }} />
        {destinos.length > UMBRAL_BUSCADOR && (
          <input
            className="m-input hoja-buscador"
            type="search"
            placeholder="Buscar mood"
            aria-label="Buscar mood"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
          />
        )}
        <div className="hoja-mover" role="list">
          {visibles.map((e) => (
            <button
              key={e.id}
              type="button"
              role="listitem"
              className={`hoja-op hoja-mover-fila${en(e.id) ? ' ya' : ''}`}
              style={{ '--c': colorTarjeta(e) }}
              disabled={en(e.id)}
              onClick={() => moverA(e)}
            >
              <i aria-hidden="true" />
              <span>{formatearTitulo(e.nombre)}</span>
              {en(e.id) && <small>Actual</small>}
            </button>
          ))}
          {visibles.length === 0 && <p className="hoja-nota">Ningún mood coincide.</p>}
        </div>
      </>
    );
  } else if (vista === 'sueno') {
    cuerpo = (
      <>
        <CabeceraSub titulo="Temporizador para dormir" onVolver={() => setVista('menu')} />
        {MINUTOS.map((m) => (
          <Opcion key={m} icono="luna" onClick={() => fijar({ minutos: m })}>
            {m} minutos
          </Opcion>
        ))}
        <Opcion icono="luna" onClick={() => fijar({ alFinal: true })}>
          Al terminar la canción
        </Opcion>
        {ctx.temporizador && (
          <Opcion icono="cerrar" onClick={() => fijar(null)}>
            Apagar el temporizador
          </Opcion>
        )}
      </>
    );
  } else if (vista === 'corregir') {
    cuerpo = <FormularioDatos ctx={ctx} track={track} meta={meta} onListo={cerrar} onVolver={() => setVista('menu')} />;
  } else {
    cuerpo = (
      <>
        <div className="hoja-cab">
          {portada ? <img src={portada} alt="" /> : <span className="hoja-cab-sin" />}
          <div>
            <b>{formatearTitulo(track.titulo)}</b>
            <small>
              {formatearTitulo(track.artista)}
              {meta?.album ? ` · ${formatearTitulo(meta.album)}` : ''}
            </small>
          </div>
        </div>
        {aviso && (
          <div className="hoja-aviso" role="status">
            <span>{aviso.texto}</span>
            {aviso.deshacer && (
              <button type="button" onClick={deshacer}>
                Deshacer
              </button>
            )}
          </div>
        )}
        {guardado && modos.length > 0 && (
          <div className="hoja-anadir">
            <p id="hoja-anadir-modo">Añadir a un mood</p>
            <div className="hoja-chips" role="group" aria-labelledby="hoja-anadir-modo">
              {modos.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`chip-modo${en(e.id) ? ' ya' : ''}`}
                  style={{ '--c': colorTarjeta(e) }}
                  aria-pressed={en(e.id)}
                  onClick={() => tocarChip(e)}
                >
                  {en(e.id) ? <IconoM nombre="check" tamano={14} /> : <i aria-hidden="true" />}
                  {formatearTitulo(e.nombre)}
                </button>
              ))}
            </div>
          </div>
        )}
        {guardado && destinosDeMover(ctx.ejes).length > 1 && (
          <Opcion icono="modos" onClick={() => setVista('mover')}>
            Mover a otro mood…
          </Opcion>
        )}
        {guardado && (
          <Opcion icono="lista" onClick={() => setVista('listas')}>
            Añadir a una lista
          </Opcion>
        )}
        <Opcion icono="siguiente" onClick={aCola(ctx.reproducirDespues)}>
          Reproducir a continuación
        </Opcion>
        <Opcion icono="cola" onClick={aCola(ctx.agregarACola)}>
          Añadir a la cola
        </Opcion>
        <Opcion icono="compartir" onClick={compartir}>
          Compartir
        </Opcion>
        {suena && (
          <>
            <Opcion icono="radio" onClick={radio}>
              Radio desde esta canción
            </Opcion>
            <Opcion icono="repetir" onClick={volverAEmpezar}>
              Volver a empezar
            </Opcion>
            <Opcion icono="letra" onClick={verLetra}>
              Ver letra
            </Opcion>
          </>
        )}
        <hr />
        <Opcion icono="luna" onClick={() => setVista('sueno')}>
          Temporizador para dormir
        </Opcion>
        <Opcion icono="persona" onClick={() => nav.abrir({ tipo: 'artista', nombre: track.artista })}>
          Ir al artista
        </Opcion>
        <Opcion
          icono="no-me-gusta"
          onClick={() => {
            ctx.marcarNoMeGusta(entradaCancion(track), track);
            cerrar();
          }}
        >
          No me gusta esta canción
        </Opcion>
        <Opcion
          icono="no-me-gusta"
          onClick={() => {
            ctx.marcarNoMeGusta(entradaArtista(track.artista), track);
            cerrar();
          }}
        >
          No quiero más de este artista
        </Opcion>
        {albumDe(track, meta) && (
          <Opcion
            icono="disco"
            onClick={() => nav.abrir({ tipo: 'album', artista: primerArtista(track.artista), titulo: albumDe(track, meta) })}
          >
            Ir al álbum
          </Opcion>
        )}
        {guardado && (
          <>
            <Opcion icono="lapiz" onClick={() => setVista('corregir')}>
              Corregir datos
            </Opcion>
            <hr />
            <Opcion icono="borrar" peligro onClick={quitar}>
              Quitar de la biblioteca
            </Opcion>
          </>
        )}
      </>
    );
  }

  return (
    <HojaInferior abierta onCerrar={cerrar} titulo={formatearTitulo(track.titulo)}>
      {cuerpo}
      {error && vista !== 'corregir' && <p className="m-aviso">No se pudo completar: {error}</p>}
    </HojaInferior>
  );
}

// Hoja del ⋯ de un modo (detalle de modo).
// Colores que se ofrecen en la hoja de un modo (`eje.color` pisa al calculado).
const COLORES_MODO = ['#e5484d', '#f76b15', '#f5b800', '#30a46c', '#3e63dd', '#8e4ec6'];

export function HojaModo({ ctx, nav, ejeId }) {
  // 'menu' | 'unir' (elegir con quién) | { destino } (confirmar unión) | 'eliminar' (confirmar)
  const [vista, setVista] = useState('menu');
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState(null);
  const eje = ctx.ejes.find((e) => e.id === ejeId);
  if (!eje) return null;
  const lista = ctx.tracksDe(eje.id);
  const hacer = (fn) => () => {
    nav.atras();
    fn();
  };
  const esSistema = !!eje.sistema || eje.tipo === 'sistema';
  const esLista = familiaDe(eje) === 'fijo';
  // Misma ruta de guardado (y journal) que el editor de escritorio: ctx.guardarEjes.
  const cambiar = async (nuevos) => {
    setError(null);
    try {
      return await ctx.guardarEjes(nuevos);
    } catch (e) {
      setError(String(e?.message ?? e));
      return false;
    }
  };
  const actualiza = (campos) => cambiar(ctx.ejes.map((e) => (e.id === eje.id ? { ...e, ...campos } : e)));
  const guardarNombre = async (ev) => {
    ev.preventDefault();
    const limpio = nombre.trim();
    if (limpio && limpio !== eje.nombre) await actualiza({ nombre: limpio });
    setEditando(false);
  };
  const eliminar = async () => {
    // Los sub-modos pasan a primer nivel en la misma escritura (el servidor rechaza padres que no existen).
    const resto = ctx.ejes.filter((e) => e.id !== eje.id).map((e) => (e.padre === eje.id ? { ...e, padre: null } : e));
    if (await cambiar(resto)) nav.atras();
  };
  if (vista === 'portada') {
    const candidatas = [...new Set(lista.map((t) => portadaDe(ctx, t)).filter(Boolean))].slice(0, 30);
    const elegir = async (portada) => {
      if ((await actualiza({ portada })) !== false) nav.atras();
    };
    const delMovil = async (ev) => {
      const archivo = ev.target.files?.[0];
      ev.target.value = '';
      if (!archivo) return;
      try {
        await elegir(await imagenADataUrl(archivo));
      } catch (e) {
        setError(String(e?.message ?? e));
      }
    };
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo="Cambiar portada">
        <CabeceraSub titulo="Cambiar portada" onVolver={() => setVista('menu')} />
        {error && <p className="m-aviso">No se pudo guardar: {error}</p>}
        <Opcion icono="modos" onClick={() => elegir(null)}>
          Automática
        </Opcion>
        <label className="hoja-op">
          <IconoM nombre="disco" />
          <span>Imagen del móvil…</span>
          <input type="file" accept="image/*" hidden onChange={delMovil} />
        </label>
        <div className="hoja-portadas">
          {candidatas.map((u) => (
            <button key={u} type="button" aria-label="Usar esta portada" aria-pressed={eje.portada === u} onClick={() => elegir(u)}>
              <img src={u} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </HojaInferior>
    );
  }
  if (vista === 'unir') {
    const conteos = new Map(ctx.ejes.map((e) => [e.id, ctx.tracksDe(e.id).length]));
    const candidatos = modosParaUnir(ctx.ejes, conteos, eje.id);
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo="Unir con…">
        <CabeceraSub titulo={`Unir «${formatearTitulo(eje.nombre)}» con…`} onVolver={() => setVista('menu')} />
        {candidatos.length === 0 && <p className="hoja-vacio">No hay otros moods.</p>}
        {candidatos.map(({ eje: otro, n }) => (
          <Opcion key={otro.id} icono="modos" onClick={() => setVista({ destino: otro })}>
            {formatearTitulo(otro.nombre)}
            {otro.tipo === 'playlist' && <em className="hoja-etiqueta">lista</em>} · {n}
          </Opcion>
        ))}
      </HojaInferior>
    );
  }
  if (vista?.destino) {
    const { destino } = vista;
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo="Unir moods">
        <CabeceraSub titulo="Unir moods" onVolver={() => setVista('unir')} />
        <p className="hoja-vacio">{preguntaUnir(lista.length, formatearTitulo(eje.nombre), formatearTitulo(destino.nombre))}</p>
        <Opcion
          icono="check"
          onClick={hacer(() =>
            ctx.unirConDeshacer?.(eje.id, destino.id, `«${formatearTitulo(eje.nombre)}» se une a «${formatearTitulo(destino.nombre)}»`),
          )}
        >
          Unir moods
        </Opcion>
        <Opcion icono="atras" onClick={() => setVista('unir')}>
          Cancelar
        </Opcion>
      </HojaInferior>
    );
  }
  if (vista === 'vaciar') {
    const n = lista.length;
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo="Quitar todas las canciones">
        <CabeceraSub titulo={`¿Quitar ${n} ${n === 1 ? 'canción' : 'canciones'} de «${formatearTitulo(eje.nombre)}»?`} onVolver={() => setVista('menu')} />
        <p className="hoja-vacio">Seguirán en tu biblioteca. Podrás deshacerlo unos segundos.</p>
        <Opcion icono="borrar" peligro onClick={hacer(() => ctx.vaciarModo(eje, lista.map((t) => t.id)))}>
          Sí, quitar
        </Opcion>
        <Opcion icono="atras" onClick={() => setVista('menu')}>
          Cancelar
        </Opcion>
      </HojaInferior>
    );
  }
  if (vista === 'eliminar') {
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo="Eliminar mood">
        <CabeceraSub titulo={`¿Eliminar «${formatearTitulo(eje.nombre)}»?`} onVolver={() => setVista('menu')} />
        <p className="hoja-vacio">
          Se borra {esLista ? 'la lista' : 'el mood'}, pero las {lista.length} canciones siguen en tu biblioteca.
        </p>
        {error && <p className="m-aviso">No se pudo guardar: {error}</p>}
        <Opcion icono="borrar" peligro onClick={eliminar}>
          Sí, eliminar
        </Opcion>
        <Opcion icono="atras" onClick={() => setVista('menu')}>
          Cancelar
        </Opcion>
      </HojaInferior>
    );
  }
  return (
    <HojaInferior abierta onCerrar={() => nav.atras()} titulo={formatearTitulo(eje.nombre)}>
      <div className="hoja-cab">
        <div>
          <b>{formatearTitulo(eje.nombre)}</b>
          <small>
            {lista.length} {lista.length === 1 ? 'canción' : 'canciones'}
          </small>
        </div>
      </div>
      {error && <p className="m-aviso">No se pudo guardar: {error}</p>}
      {lista.length > 0 && (
        <>
          {/* Mismas dos opciones que la hoja del álbum y del artista. */}
          <Opcion icono="siguiente" onClick={hacer(() => ctx.reproducirDespues(lista))}>
            Reproducir a continuación
          </Opcion>
          <Opcion icono="cola" onClick={hacer(() => ctx.agregarACola(lista))}>
            Añadir a la cola
          </Opcion>
        </>
      )}
      {!esSistema &&
        (editando ? (
          <form className="hoja-renombrar" onSubmit={guardarNombre}>
            <input
              className="m-input"
              aria-label="Nombre"
              value={nombre}
              autoFocus
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditando(false))}
            />
            <button type="submit" className="m-redondo" aria-label="Guardar nombre">
              <IconoM nombre="check" />
            </button>
          </form>
        ) : (
          <Opcion
            icono="lapiz"
            onClick={() => {
              setNombre(formatearTitulo(eje.nombre));
              setEditando(true);
            }}
          >
            Renombrar
          </Opcion>
        ))}
      <Opcion icono="disco" onClick={() => setVista('portada')}>
        Cambiar portada
      </Opcion>
      {!esSistema && (
        <div className="hoja-colores" role="group" aria-label="Color">
          {COLORES_MODO.map((c) => (
            <button
              key={c}
              type="button"
              className={eje.color === c ? 'on' : ''}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              aria-pressed={eje.color === c}
              onClick={() => actualiza({ color: c })}
            />
          ))}
          {eje.color && (
            <button type="button" className="auto" aria-label="Color automático" onClick={() => actualiza({ color: undefined })}>
              Auto
            </button>
          )}
        </div>
      )}
      {!esSistema && (
        <Casilla marcada={modoVisible(eje)} onCambiar={() => cambiar(conVisibilidad(ctx.ejes, eje.id, !modoVisible(eje)))}>
          Visible en Inicio y Moods
        </Casilla>
      )}
      {!esSistema && (
        <div className="hoja-auto">
          <div className="hoja-auto-fila">
            <b>Se rellena sola</b>
            <Interruptor
              activo={seRellenaSola(eje)}
              etiqueta="Se rellena sola"
              onCambio={(v) => cambiar(conAutoRellenar(ctx.ejes, eje.id, v))}
            />
          </div>
          <small>{TEXTO_AUTO_RELLENAR}</small>
        </div>
      )}
      {!esSistema && eje.chipId && (
        <Opcion icono="lapiz" onClick={() => nav.abrir({ tipo: 'config-estados', ejeId: eje.id })}>
          Editar estado de ánimo
        </Opcion>
      )}
      {!esSistema && (
        <Opcion icono="modos" onClick={() => setVista('unir')}>
          Unir con…
        </Opcion>
      )}
      {(lista.length > 0 || !esSistema) && <hr />}
      {lista.length > 0 && (
        <Opcion
          icono="borrar"
          peligro
          onClick={() => setVista('vaciar')}
        >
          Quitar todas las canciones
        </Opcion>
      )}
      {!esSistema && (
        <Opcion icono="borrar" peligro onClick={() => setVista('eliminar')}>
          Eliminar {esLista ? 'lista' : 'mood'}
        </Opcion>
      )}
    </HojaInferior>
  );
}

// Hoja del ⋯ de un artista: como la del álbum (a un mood, a continuación, a la cola) y, si tiene
// canciones propias, quitarlo de la biblioteca. Sin propias, la cola usa sus populares de Deezer.
export function HojaArtista({ ctx, nav, nombre }) {
  const [confirmando, setConfirmando] = useState(false);
  const propias = ctx.tracksDeArtista(nombre);
  const mostrado = formatearTitulo(nombre);
  const n = propias.length;
  const quitar = () => {
    nav.atras();
    ctx.quitarConDeshacer(propias.map((t) => t.id), `Quitando a ${mostrado} y ${n} ${n === 1 ? 'canción' : 'canciones'}`);
  };
  if (confirmando) {
    return (
      <HojaInferior abierta onCerrar={() => nav.atras()} titulo={mostrado}>
        <CabeceraSub titulo="¿Quitar de la biblioteca?" onVolver={() => setConfirmando(false)} />
        <p className="m-aviso">
          ¿Quitar a {mostrado} y {n === 1 ? 'su canción' : `sus ${n} canciones`} de tu biblioteca? Podrás deshacerlo unos segundos.
        </p>
        <Opcion icono="borrar" peligro onClick={quitar}>
          Sí, quitar
        </Opcion>
      </HojaInferior>
    );
  }
  const populares = ctx.artista && !ctx.artista.cargando ? ctx.artista.canciones : [];
  return (
    <HojaAlbum
      ctx={ctx}
      titulo={nombre}
      subtitulo="Artista"
      onCerrar={() => nav.atras()}
      asegurarIds={n > 0 ? async () => ({ tracks: ctx.tracks, ids: propias.map((t) => t.id) }) : null}
      pistasCola={() => (n > 0 ? propias : pistasDePopulares(populares, ctx.tracks))}
      extra={
        n > 0 && (
          <Opcion icono="borrar" peligro onClick={() => setConfirmando(true)}>
            Quitar de la biblioteca
          </Opcion>
        )
      }
    />
  );
}
