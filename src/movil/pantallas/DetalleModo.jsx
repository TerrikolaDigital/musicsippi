// src/movil/pantallas/DetalleModo.jsx
// Detalle de un modo: cabecera con la portada fundida en el color del modo y
// la lista de canciones montada por tramos (las listas llegan a 800 filas).
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { colorTarjeta, duracionTotalTexto } from '../formato.js';
import { tramoVisible, TRAMO } from '../tramos.js';
import { formatearTitulo } from '../../ui/formato.js';
import { listarSeguidas, dejarDeSeguir } from '../../importar/seguidas.js';
import EstadoVacio from '../EstadoVacio.jsx';

const ORDENES = ['original', 'titulo', 'artista'];
const ETIQUETA_ORDEN = { original: 'Orden original', titulo: 'Por título', artista: 'Por artista' };

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const porTexto = (campo) => (a, b) => (a[campo] ?? '').localeCompare(b[campo] ?? '', 'es');

export default function DetalleModo({ ctx, nav, ejeId }) {
  const eje = ctx.ejes.find((e) => e.id === ejeId);
  const [orden, setOrden] = useState('original');
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');
  const [mostrados, setMostrados] = useState(TRAMO);
  const centinela = useRef(null);
  // Playlist seguida que dio origen a este modo (el id se conserva si la fusión la convierte en modo).
  const [seguida, setSeguida] = useState(null);
  useEffect(() => {
    if (!ejeId) return undefined;
    let vivo = true;
    listarSeguidas()
      .then((todas) => vivo && setSeguida(todas.find((s) => s.ejeId === ejeId) ?? null))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ejeId]);
  async function dejar() {
    try {
      await dejarDeSeguir(seguida.clave);
      setSeguida(null);
      ctx.avisar?.(`Has dejado de seguir «${seguida.nombre}»`);
    } catch (error) {
      ctx.avisar?.(`No se pudo dejar de seguir: ${error?.message ?? error}`);
    }
  }

  const todas = useMemo(() => (eje ? ctx.tracksDe(eje.id) : []), [eje, ctx.tracksDe]);
  const lista = useMemo(() => {
    const q = sinTildes(texto.trim());
    const filtradas = q
      ? todas.filter((t) => sinTildes(`${formatearTitulo(t.titulo)} ${formatearTitulo(t.artista)}`).includes(q))
      : todas;
    if (orden === 'original') return filtradas;
    return [...filtradas].sort(porTexto(orden));
  }, [todas, texto, orden]);

  const duracionMs = useMemo(
    () => duracionTotalTexto(todas.map((t) => ctx.metadataDe(t.id)?.duracionMs ?? 0)),
    [todas, ctx.metadataDe],
  );

  // Al cambiar la lista (otro modo, filtro u orden) se vuelve al primer tramo.
  useEffect(() => {
    setMostrados(TRAMO);
  }, [ejeId, texto, orden]);

  // Cuando el centinela del final entra en pantalla se monta el siguiente tramo.
  useEffect(() => {
    const el = centinela.current;
    if (!el || mostrados >= lista.length) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setMostrados((m) => tramoVisible(lista.length, m, true));
        }
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lista.length, mostrados]);

  if (!eje) {
    return (
      <EstadoVacio titulo="Este mood ya no existe" accion={{ etiqueta: 'Volver', onClick: nav.atras }} />
    );
  }

  const color = colorTarjeta(eje);
  const portada = ctx.coversDeEje.get(eje.id)?.[0];
  const visibles = lista.slice(0, tramoVisible(lista.length, mostrados, false));
  const ciclarOrden = () => setOrden((o) => ORDENES[(ORDENES.indexOf(o) + 1) % ORDENES.length]);
  return (
    <div className="detalle-modo" style={{ '--color-modo': color }}>
      <div className="detalle-modo-cab">
        {portada && <img src={portada} alt="" />}
        <div className="detalle-modo-fundido" />
        <button className="m-redondo detalle-modo-flota izq" aria-label="Volver" onClick={nav.atras}>
          <IconoM nombre="atras" />
        </button>
        <button
          className="m-redondo detalle-modo-flota der"
          aria-label={`Ordenar: ${ETIQUETA_ORDEN[orden]}`}
          onClick={ciclarOrden}
        >
          <IconoM nombre="ordenar" />
        </button>
      </div>

      <h1 className="detalle-modo-nombre">{formatearTitulo(eje.nombre)}</h1>
      <p className="detalle-modo-sub">
        {todas.length} {todas.length === 1 ? 'canción' : 'canciones'}
        {duracionMs && ` · ${duracionMs}`}
        {orden !== 'original' && ` · ${ETIQUETA_ORDEN[orden]}`}
      </p>

      <div className="detalle-modo-acciones">
        <button
          className="m-sec"
          aria-label="Reproducir en aleatorio"
          onClick={() => ctx.reproducirModo(eje, lista, null, true)}
        >
          <IconoM nombre="aleatorio" />
        </button>
        <button className="m-play" aria-label="Reproducir" onClick={() => ctx.reproducirModo(eje, lista, null, false)}>
          <IconoM nombre="play" tamano={26} />
        </button>
        <button
          className={`m-sec${ctx.radioModo === eje.id ? ' on' : ''}`}
          aria-label="Radio del mood"
          onClick={() => ctx.iniciarRadioModo(eje)}
        >
          <IconoM nombre="radio" />
        </button>
        <button
          className={`m-sec${buscando ? ' on' : ''}`}
          aria-label="Buscar en este mood"
          onClick={() => {
            setBuscando((b) => !b);
            setTexto('');
          }}
        >
          <IconoM nombre="buscar" />
        </button>
        <button className="m-sec" aria-label="Más opciones del mood" onClick={() => nav.abrirCapa({ tipo: 'hoja', modoId: eje.id })}>
          <IconoM nombre="puntos" />
        </button>
      </div>

      {seguida && (
        <button className="detalle-modo-dejar pulsable" onClick={dejar}>
          Dejar de seguir
        </button>
      )}

      {buscando && (
        <input
          className="m-input"
          type="search"
          autoFocus
          placeholder="Buscar en este mood"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      )}

      {lista.length === 0 ? (
        texto ? (
          <EstadoVacio titulo="Ninguna canción coincide">Prueba con otro título o artista.</EstadoVacio>
        ) : (
          <EstadoVacio titulo="Este mood aún no tiene canciones" accion={{ etiqueta: 'Buscar música', onClick: () => nav.irAPestana('buscar') }}>
            Añade canciones desde Buscar o desde el menú ⋯ de cualquier canción.
          </EstadoVacio>
        )
      ) : (
        <div className="detalle-modo-lista">
          {visibles.map((t) => (
            <FilaCancion
              key={t.id}
              track={t}
              meta={ctx.metadataDe(t.id)}
              activa={ctx.trackActual?.id === t.id}
              pausada={!ctx.sonando}
              onTocar={() => ctx.reproducirModo(eje, lista, t)}
              onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
              onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
            />
          ))}
          {visibles.length < lista.length && <div ref={centinela} className="detalle-modo-centinela" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
