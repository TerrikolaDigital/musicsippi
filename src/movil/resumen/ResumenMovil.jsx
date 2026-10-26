// src/movil/resumen/ResumenMovil.jsx
// «Tu semana / Tu año en Musicsippi»: historias a pantalla completa. Tocar a la derecha
// avanza, a la izquierda retrocede y mantener pulsado pausa. Capa de navegación { tipo: 'resumen', periodo }.
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import { PortadaImg } from '../PortadaGenerada.jsx';
import { colorTarjeta } from '../formato.js';
import { formatearTitulo } from '../../ui/formato.js';
import { armarPantallas, armarResumen, rangoResumen, textoMinutos, ventanaResumenAnual } from './resumen.js';
import EditorTarjeta from './EditorTarjeta.jsx';
import { armarDatosTarjeta, listarTarjetas } from './datosTarjetas.js';
import { coloresBase, coloresHistorias } from './coloresHistorias.js';

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

const urlPortada = (ctx, track) => {
  const u = track ? ctx.metadataDe(track.trackIdReal ?? track.id)?.coverUrl : null;
  return typeof u === 'string' && u.startsWith('http') ? u : null;
};

function Minutos({ p, ctx, bucle }) {
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

function Bucle({ p, ctx }) {
  return (
    <>
      <p className="res-pre">Tu canción en bucle</p>
      <div className="res-portada-grande">
        <PortadaImg src={urlPortada(ctx, p.track)} texto={p.titulo} />
      </div>
      <p className="res-titulo">{formatearTitulo(p.titulo)}</p>
      <p className="res-sub">{formatearTitulo(p.artista)}</p>
      <p className="res-nota">{p.texto}</p>
    </>
  );
}

function Artistas({ p, ctx }) {
  return (
    <>
      <p className="res-pre">Tus artistas de cabecera</p>
      <ol className="res-artistas">
        {p.artistas.map((a, i) => (
          <li key={a.nombre} style={{ '--i': i }}>
            <span className="res-foto">
              <PortadaImg src={ctx.fotoDeArtista(a.nombre)} texto={a.nombre} />
            </span>
            <b>{formatearTitulo(a.nombre)}</b>
            <small>{a.n}×</small>
          </li>
        ))}
      </ol>
    </>
  );
}

function Modo({ p }) {
  return (
    <>
      <p className="res-pre">{p.texto}</p>
      <p className="res-modo">{formatearTitulo(p.nombre)}</p>
      <p className="res-nota">Un {Math.round(p.fraccion * 100)} % de tu tiempo vivió aquí dentro.</p>
    </>
  );
}

function Hora({ p }) {
  return (
    <>
      <p className="res-pre">Tu hora del día</p>
      <p className="res-hora">{p.frase}</p>
      <p className="res-nota">{p.nota}</p>
      {p.racha > 1 && <p className="res-chip">Tu mejor racha: {p.racha} días seguidos</p>}
    </>
  );
}

function Curioso({ p, ctx }) {
  const d = p.descubrimiento;
  return (
    <>
      {d && (
        <>
          <p className="res-pre">Tu descubrimiento</p>
          <div className="res-descubre">
            <span className="res-portada-peque">
              <PortadaImg src={urlPortada(ctx, d.track)} texto={d.titulo} />
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
      {p.comparativa && <p className={d ? 'res-curioso' : 'res-titulo'}>{p.comparativa}</p>}
    </>
  );
}

function Final({ res, tipo, etiqueta, datos, onCompartir, onCerrar, ctx }) {
  const bucle = res.bucle;
  return (
    <>
      <div className="res-tarjeta">
        <small>{tipo === 'anio' ? 'Tu año en Musicsippi' : 'Tu semana en Musicsippi'}{etiqueta ? ` · ${etiqueta}` : ''}</small>
        <div className="res-tarjeta-cab">
          <span className="res-portada-peque">
            <PortadaImg src={urlPortada(ctx, bucle?.track)} texto={bucle?.titulo ?? 'M'} />
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
        <button className="res-boton principal" onClick={onCompartir}>
          <IconoM nombre="compartir" tamano={20} />
          <span>Compartir</span>
        </button>
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

  const res = useMemo(() => {
    const { desde, hasta } = rangoResumen(tipo);
    return armarResumen(ctx.historial, ctx.tracks, { desde, hasta, ejes: ctx.ejes, duracionDe, metadataDe: ctx.metadataDe });
  }, [ctx.historial, ctx.tracks, ctx.ejes, ctx.metadataDe, duracionDe, tipo]);
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
    () => armarDatosTarjeta(res, tipo, color, { portada: (t) => urlPortada(ctx, t), foto: (n) => ctx.fotoDeArtista(n) }),
    [res, tipo, color, ctx.metadataDe, ctx.fotoDeArtista],
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
  const tarjetas = useMemo(() => listarTarjetas(pantallas), [pantallas]);
  const capaEditor = nav.capas.find((c) => c.tipo === 'editor-tarjeta');
  const abrirEditor = (inicial) => {
    setTarjetaInicial(inicial);
    nav.abrirCapa({ tipo: 'editor-tarjeta' });
  };

  const p = pantallas[i];
  const hayDatos = res.reproducciones > 0;
  const estilo = { '--res-c': (p && colores[p.id]) || color };
  return (
    <div className={`resumen${pausa || capaEditor ? ' en-pausa' : ''}`} style={estilo} role="dialog" aria-label={datos.titulo}>
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
          {datos.titulo}
          {etiqueta && <em className="res-etiqueta">{etiqueta}</em>}
        </span>
        {hayDatos && p.id !== 'final' && (
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
        {!hayDatos ? (
          <div className="res-pantalla" key="vacio">
            <p className="res-titulo">Todavía no hay resumen</p>
            <p className="res-nota">Escucha un poco de música y vuelve: aquí te esperará tu historia.</p>
          </div>
        ) : (
          <div className="res-pantalla" key={p.id}>
            {p.id === 'minutos' && <Minutos p={p} ctx={ctx} bucle={res.bucle} />}
            {p.id === 'bucle' && <Bucle p={p} ctx={ctx} />}
            {p.id === 'artistas' && <Artistas p={p} ctx={ctx} />}
            {p.id === 'modo' && <Modo p={p} />}
            {p.id === 'hora' && <Hora p={p} />}
            {p.id === 'curioso' && <Curioso p={p} ctx={ctx} />}
            {p.id === 'final' && (
              <Final res={res} tipo={tipo} etiqueta={etiqueta} datos={datos} onCompartir={() => abrirEditor('final')} onCerrar={cerrar} ctx={ctx} />
            )}
          </div>
        )}
      </div>
      {capaEditor && hayDatos && <EditorTarjeta tarjetas={tarjetas} datos={datosTarjeta} urls={tarjeta.urls} inicial={tarjetaInicial} onCerrar={cerrar} />}
    </div>
  );
}
