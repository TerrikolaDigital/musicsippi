// src/movil/resumen/ResumenMovil.jsx
// «Tu semana / Tu año en Musicsippi»: historias a pantalla completa. Tocar a la derecha
// avanza, a la izquierda retrocede y mantener pulsado pausa. Capa de navegación { tipo: 'resumen', periodo }.
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import PortadaGenerada from '../PortadaGenerada.jsx';
import { colorTarjeta } from '../formato.js';
import { formatearTitulo } from '../../ui/formato.js';
import { armarPantallas, armarResumen, rangoResumen, textoMinutos, ventanaResumenAnual } from './resumen.js';
import EditorTarjeta from './EditorTarjeta.jsx';
import { armarDatosTarjeta, listarTarjetas } from './datosTarjetas.js';
import { coloresBase, coloresHistorias } from './coloresHistorias.js';
import { cargarSinCors, crearFuentes, primeraVerificada, verificarUrls } from './imagenesResumen.js';
import { cargarImagen } from './tarjeta.js';

const sinMovimiento = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SEGUNDOS_PANTALLA = 7;

/** Número que sube hasta `valor` al aparecer (sin movimiento: ya puesto). */
function useContador(valor, ms = 1100) {
  const [v, setV] = useState(sinMovimiento() ? valor : 0);
  useEffect(() => {
    if (sinMovimiento()) return undefined;
    let marco;
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(valor * (1 - (1 - k) ** 4)));
      if (k < 1) marco = requestAnimationFrame(paso);
    };
    marco = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(marco);
  }, [valor, ms]);
  return v;
}

/** Imagen que prueba la siguiente fuente si una falla al cargar; solo si ninguna sirve cae a la portada generada. */
function ImgFuentes({ lista, texto }) {
  const [i, setI] = useState(0);
  const src = lista[i];
  if (!src) return <PortadaGenerada texto={texto} />;
  return <img src={src} alt="" onError={() => setI((x) => x + 1)} />;
}

function Minutos({ p, ctx, bucle, res, imgs }) {
  const min = useContador(p.minutos);
  const [sonando, setSonando] = useState(false);
  const musica = bucle?.track;
  return (
    <>
      <p className="res-pre">{p.pre}</p>
      <p className="res-gigante" aria-label={textoMinutos(p.minutos)}>
        {min.toLocaleString('es-ES')}
      </p>
      <p className="res-unidad">minutos de música</p>
      <p className="res-nota">{p.rango}</p>
      <p className="res-nota">
        {p.reproducciones} reproducciones de {p.distintas} {p.distintas === 1 ? 'canción distinta' : 'canciones distintas'}.
      </p>
      <Collage tracks={res.tracksMinutos} imgs={imgs} />
      {musica && (
        <button
          className="res-musica"
          data-no-avanzar
          onClick={() => {
            setSonando(true);
            ctx.reproducirLista(musica, [musica], 'Tu resumen');
          }}
        >
          <IconoM nombre={sonando ? 'pausa' : 'play'} tamano={20} />
          <span>{sonando ? 'Sonando tu canción en bucle' : 'Poner de fondo tu canción en bucle'}</span>
        </button>
      )}
    </>
  );
}

function Bucle({ p, imgs }) {
  return (
    <>
      <p className="res-pre">Tu canción en bucle</p>
      <div className="res-portada-grande">
        <ImgFuentes key={imgs.portadas(p.track).join()} lista={imgs.portadas(p.track)} texto={p.titulo} />
      </div>
      <p className="res-titulo">{formatearTitulo(p.titulo)}</p>
      <p className="res-sub">{formatearTitulo(p.artista)}</p>
      <p className="res-nota">{p.texto}</p>
    </>
  );
}

function Artistas({ p, imgs }) {
  return (
    <>
      <p className="res-pre">Tus artistas de cabecera</p>
      <ol className="res-artistas">
        {p.artistas.map((a, i) => (
          <li key={a.nombre} style={{ '--i': i }}>
            <span className="res-foto">
              <ImgFuentes key={imgs.fotos(a.nombre).join()} lista={imgs.fotos(a.nombre)} texto={a.nombre} />
            </span>
            <b>{formatearTitulo(a.nombre)}</b>
            <small>{a.n}×</small>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Tira de portadas solapadas (hasta 5, sin repetir imagen). */
/** Una portada de la tira: prueba las fuentes en orden y, si ninguna carga, no se dibuja (nunca imagen rota). */
function Teja({ lista, i }) {
  const [n, setN] = useState(0);
  const src = lista[n];
  if (!src) return null;
  return <img src={src} alt="" style={{ '--i': i }} onError={() => setN((x) => x + 1)} />;
}

function Collage({ tracks, imgs, max = 5, grande = false }) {
  const vistas = new Set();
  const listas = [];
  for (const t of tracks ?? []) {
    const lista = imgs.portadas(t);
    if (!lista.length || vistas.has(lista[0])) continue;
    vistas.add(lista[0]);
    listas.push(lista);
    if (listas.length >= max) break;
  }
  if (!listas.length) return null;
  return (
    <div className={`res-collage${grande ? ' res-collage-grande' : ''}`} aria-hidden="true">
      {listas.map((lista, i) => (
        <Teja key={lista[0]} lista={lista} i={i} />
      ))}
    </div>
  );
}

function Modo({ p, res, imgs }) {
  return (
    <>
      <p className="res-pre">{p.texto}</p>
      <p className="res-modo">{formatearTitulo(p.nombre)}</p>
      <p className="res-nota">Un {Math.round(p.fraccion * 100)} % de tu tiempo vivió aquí dentro.</p>
      <Collage tracks={res.tracksModo} imgs={imgs} />
    </>
  );
}

function Hora({ p, res, imgs }) {
  return (
    <>
      <p className="res-pre">Tu hora del día</p>
      <p className="res-hora">{p.frase}</p>
      <p className="res-nota">{p.nota}</p>
      <Collage tracks={res.tracksHora} imgs={imgs} max={3} grande />
      {p.racha > 1 && <p className="res-chip">Tu mejor racha: {p.racha} días seguidos</p>}
    </>
  );
}

function Curioso({ p, imgs, res }) {
  const d = p.descubrimiento;
  return (
    <>
      {d && (
        <>
          <p className="res-pre">Tu descubrimiento</p>
          <div className="res-descubre">
            <span className="res-portada-peque">
              <ImgFuentes key={imgs.portadas(d.track).join()} lista={imgs.portadas(d.track)} texto={d.titulo} />
            </span>
            <span>
              <b>{formatearTitulo(d.titulo)}</b>
              <small>{formatearTitulo(d.artista)}</small>
            </span>
          </div>
          <p className="res-nota">
            Nueva en tu vida y ya la pusiste {d.n} {d.n === 1 ? 'vez' : 'veces'}.
          </p>
        </>
      )}
      {d && <Collage tracks={res.tracksNuevas} imgs={imgs} max={4} />}
      {p.comparativa && <p className={d ? 'res-curioso' : 'res-titulo'}>{p.comparativa}</p>}
    </>
  );
}

function Final({ res, tipo, etiqueta, datos, onCerrar, imgs }) {
  const bucle = res.bucle;
  return (
    <>
      <div className="res-tarjeta">
        <small>{tipo === 'anio' ? 'Tu año en Musicsippi' : 'Tu semana en Musicsippi'}{etiqueta ? ` · ${etiqueta}` : ''}</small>
        <div className="res-tarjeta-cab">
          <span className="res-portada-peque">
            {bucle ? <ImgFuentes key={imgs.portadas(bucle.track).join()} lista={imgs.portadas(bucle.track)} texto={bucle.titulo} /> : <img src="/musicsippi-app-icon-256.png" alt="" />}
          </span>
          <span>
            <b>{datos.minutos}</b>
            <small>{datos.unidad}</small>
          </span>
        </div>
        {bucle && <p>En bucle: {formatearTitulo(bucle.titulo)} ({bucle.n}×)</p>}
        {datos.artistas.length > 0 && <p>{datos.artistas.slice(0, 3).map(formatearTitulo).join(' · ')}</p>}
        {datos.modo && <p>Mood: {formatearTitulo(datos.modo)}</p>}
      </div>
      <div className="res-acciones" data-no-avanzar>
        <button className="res-boton" onClick={onCerrar}>
          <span>Cerrar</span>
        </button>
      </div>
    </>
  );
}

export default function ResumenMovil({ ctx, nav, periodo = 'semana' }) {
  const tipo = periodo === 'anio' ? 'anio' : 'semana';
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

  // Imágenes: cada canción y artista tiene una lista de fuentes (su portada, la de la misma canción, la foto
  // de cada artista de un dúo, portadas de sus canciones). Se comprueba cuáles cargan de verdad ANTES de
  // dibujar la historia y se usa la primera que carga: nunca iniciales.
  // `ctx.fotoDeArtista` cambia en cada render de la app: se lee por ref para que las fuentes (y la comprobación) no se reinicien.
  const fotoRef = useRef(ctx.fotoDeArtista);
  fotoRef.current = ctx.fotoDeArtista;
  const fuentes = useMemo(
    () => crearFuentes({ tracks: ctx.tracks, metadataDe: ctx.metadataDe, fotoDeArtista: (n) => fotoRef.current(n), respaldoDe: (t) => ctx.metadataDe(t.trackIdReal ?? t.id)?.coverRespaldo ?? null }),
    [ctx.tracks, ctx.metadataDe],
  );
  const [verif, setVerif] = useState(null); // { visibles, exportables|null }: urls que cargan en pantalla / también como canvas (CORS); null = comprobando
  const verificadas = verif;
  const armar = (portadaDe, fotoDe, maxAlternativas) => {
    const { desde, hasta } = rangoResumen(tipo);
    return armarResumen(ctx.historial, ctx.tracks, { desde, hasta, ejes: ctx.ejes, duracionDe, metadataDe: ctx.metadataDe, portadaDe, fotoDe, maxAlternativas });
  };
  const previo = useMemo(
    () => armar((t) => fuentes.portada(t)[0], (n) => fuentes.foto(n)[0], 12),
    [ctx.historial, ctx.tracks, ctx.ejes, ctx.metadataDe, duracionDe, tipo, fuentes],
  );
  const porVerificar = useMemo(() => {
    const canciones = [...previo.candidatasBucle, ...previo.descubrimientos, ...previo.topCanciones.slice(0, 5), ...previo.topAlbumes];
    return [...canciones.flatMap((c) => fuentes.portada(c.track)), ...previo.topArtistas.slice(0, 5).flatMap((a) => fuentes.foto(a.nombre))];
  }, [previo, fuentes]);
  const claveUrls = porVerificar.join('|'); // solo se vuelve a comprobar si cambian de verdad las direcciones
  useEffect(() => {
    let vivo = true;
    (async () => {
      const visibles = await verificarUrls(porVerificar, cargarSinCors);
      if (!vivo) return;
      setVerif({ visibles, exportables: null }); // la historia ya se puede ver
      const exportables = await verificarUrls([...visibles], cargarImagen); // y luego, cuáles sirven también para compartir
      if (vivo) setVerif({ visibles, exportables });
    })();
    return () => {
      vivo = false;
    };
  }, [claveUrls]);
  const imgs = useMemo(
    () => ({
      portada: (t) => primeraVerificada(fuentes.portada(t), verif?.visibles ?? null),
      foto: (n) => primeraVerificada(fuentes.foto(n), verif?.visibles ?? null),
      portadas: (t) => fuentes.portada(t).filter((u) => verif?.visibles?.has(u)),
      fotos: (n) => fuentes.foto(n).filter((u) => verif?.visibles?.has(u)),
    }),
    [fuentes, verif],
  );
  // Para las tarjetas que se comparten (canvas): solo imágenes que también se pueden exportar.
  const imgsTarjeta = useMemo(
    () => ({ portada: (t) => primeraVerificada(fuentes.portada(t), verif?.exportables ?? null), foto: (n) => primeraVerificada(fuentes.foto(n), verif?.exportables ?? null) }),
    [fuentes, verif],
  );
  const res = useMemo(() => (verif ? armar(imgs.portada, imgs.foto) : previo), [verif, imgs, previo]);
  const pantallas = useMemo(() => armarPantallas(res, tipo), [res, tipo]);

  const etiqueta = tipo === 'anio' ? (ventanaResumenAnual().completo ? 'Edición completa' : 'hasta hoy') : null;
  const eje = res.modo ? ctx.ejes.find((e) => e.id === res.modo.ejeId) : null;
  const color = eje ? colorTarjeta(eje) : '#7c5cff';

  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [tarjetaInicial, setTarjetaInicial] = useState('final');
  const mantener = useRef(null);
  const larga = useRef(false);

  const ultima = pantallas.length - 1;
  const avanzar = () => setI((x) => Math.min(ultima, x + 1));
  const retroceder = () => setI((x) => Math.max(0, x - 1));
  const cerrar = () => nav.atras();

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'ArrowRight') avanzar();
      else if (e.key === 'ArrowLeft') retroceder();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ultima]);
  useEffect(() => () => clearTimeout(mantener.current), []);

  const alPulsar = (e) => {
    if (e.target.closest('button, [data-no-avanzar]')) return;
    larga.current = false;
    clearTimeout(mantener.current);
    mantener.current = setTimeout(() => {
      larga.current = true;
      setPausa(true);
    }, 220);
  };
  const alSoltar = (e) => {
    if (e.target.closest('button, [data-no-avanzar]') && !larga.current) return;
    clearTimeout(mantener.current);
    if (larga.current) {
      larga.current = false;
      setPausa(false);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.33) retroceder();
    else avanzar();
  };
  const alCancelar = () => {
    clearTimeout(mantener.current);
    larga.current = false;
    setPausa(false);
  };

  const datos = useMemo(
    () => ({
      titulo: tipo === 'anio' ? 'Tu año en Musicsippi' : 'Tu semana en Musicsippi',
      minutos: res.minutos.toLocaleString('es-ES'),
      unidad: 'minutos de música',
      artistas: res.topArtistas.map((a) => a.nombre),
      modo: res.modo?.nombre,
    }),
    [res, tipo],
  );

  // Datos y direcciones de imagen de las tarjetas para compartir (se calculan una vez por resumen).
  const tarjeta = useMemo(
    () => armarDatosTarjeta(res, tipo, color, { portada: imgsTarjeta.portada, foto: imgsTarjeta.foto }),
    [res, tipo, color, imgsTarjeta],
  );
  const [colores, setColores] = useState(() => coloresBase(color));
  useEffect(() => {
    let vivo = true;
    setColores(coloresBase(color));
    coloresHistorias(tarjeta.urls, color).then((c) => vivo && setColores(c));
    return () => {
      vivo = false;
    };
  }, [tarjeta.urls, color]);
  const datosTarjeta = useMemo(() => ({ ...tarjeta.datos, colores }), [tarjeta.datos, colores]);
  const tarjetas = useMemo(() => listarTarjetas(pantallas, tarjeta.datos), [pantallas, tarjeta.datos]);
  const capaEditor = nav.capas.find((c) => c.tipo === 'editor-tarjeta');
  const abrirEditor = (inicial) => {
    setTarjetaInicial(inicial);
    nav.abrirCapa({ tipo: 'editor-tarjeta' });
  };

  const p = pantallas[i];
  const hayDatos = res.reproducciones > 0;
  const estilo = { '--res-c': (p && colores[p.id]) || color };
  // Fondo difuminado con la imagen protagonista de cada pantalla (la canción en bucle por defecto).
  const fondoUrl = !p || !verif ? null : p.id === 'artistas' ? imgs.foto(p.artistas[0]?.nombre ?? '') : p.id === 'curioso' ? imgs.portada(p.descubrimiento?.track) : imgs.portada(res.bucle?.track);
  return (
    <div className={`resumen${pausa || capaEditor ? ' en-pausa' : ''}`} style={estilo} role="dialog" aria-label={datos.titulo}>
      {fondoUrl && <div className="res-fondo" key={fondoUrl} style={{ '--img': `url("${fondoUrl}")` }} aria-hidden="true" />}
      <div className="res-barras" aria-hidden="true">
        {pantallas.map((x, k) => (
          <span key={x.id} className="res-barra">
            <i
              className={k < i ? 'llena' : k === i && k !== ultima ? 'activa' : k === i ? 'llena' : ''}
              style={k === i ? { animationDuration: `${SEGUNDOS_PANTALLA}s` } : undefined}
              onAnimationEnd={k === i ? avanzar : undefined}
            />
          </span>
        ))}
      </div>
      <div className="res-cab">
        <span className="res-marca">
          <img className="res-logo" src="/musicsippi-app-icon-256.png" alt="" width="24" height="24" />
          <span className="res-marca-texto">{datos.titulo}</span>
          {etiqueta && <em className="res-etiqueta">{etiqueta}</em>}
        </span>
        {hayDatos && tarjetas.length > 0 && (
          <button className="res-compartir" data-no-avanzar onClick={() => abrirEditor(p.id)}>
            <IconoM nombre="compartir" tamano={18} />
            <span>Compartir</span>
          </button>
        )}
        <button className="res-cerrar" aria-label="Cerrar resumen" data-no-avanzar onClick={cerrar}>
          <IconoM nombre="cerrar" tamano={22} />
        </button>
      </div>
      <div className="res-escena" onPointerDown={alPulsar} onPointerUp={alSoltar} onPointerCancel={alCancelar} onPointerLeave={alCancelar}>
        {!hayDatos || !verificadas ? (
          <div className="res-pantalla" key="vacio">
            {hayDatos ? (
              <p className="res-nota">Preparando tu resumen…</p>
            ) : (
              <>
                <p className="res-titulo">Todavía no hay resumen</p>
                <p className="res-nota">Escucha un poco de música y vuelve: aquí te esperará tu historia.</p>
              </>
            )}
          </div>
        ) : (
          <div className="res-pantalla" key={p.id}>
            {p.id === 'minutos' && <Minutos p={p} ctx={ctx} bucle={res.bucle} res={res} imgs={imgs} />}
            {p.id === 'bucle' && <Bucle p={p} imgs={imgs} />}
            {p.id === 'artistas' && <Artistas p={p} imgs={imgs} />}
            {p.id === 'modo' && <Modo p={p} res={res} imgs={imgs} />}
            {p.id === 'hora' && <Hora p={p} res={res} imgs={imgs} />}
            {p.id === 'curioso' && <Curioso p={p} imgs={imgs} res={res} />}
            {p.id === 'final' && (
              <Final res={res} tipo={tipo} etiqueta={etiqueta} datos={datos} onCerrar={cerrar} imgs={imgs} />
            )}
          </div>
        )}
      </div>
      {capaEditor && hayDatos && <EditorTarjeta tarjetas={tarjetas} datos={datosTarjeta} urls={tarjeta.urls} inicial={tarjetaInicial} onCerrar={cerrar} />}
    </div>
  );
}
