// src/PanelLetras.jsx
import { useEffect, useRef, useState } from 'react';
import { obtenerLetras, lineaActual, etiquetaFuente, elegirProveedor, proveedoresSinLetra, claveDe, almacenPorDefecto } from './data/letras.js';
import { obtenerTraduccion, leerPreferenciaTraduccion, guardarPreferenciaTraduccion } from './data/traduccion-letra.js';
import HojaProveedoresLetra from './movil/HojaProveedoresLetra.jsx';
import './movil/letra.css';
import { useDesfaseLetra } from './data/useDesfaseLetra.js';
import { ajustarDesfase, textoDesfase } from './data/desfase-letra.js';
import { formatearTitulo } from './ui/formato.js';

// Geometría de Lucide «languages» y «search» (ISC), como el resto de iconos del móvil.
const IconoTraducir = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
);
const IconoFuente = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const IconoSinc = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/** Palabras de la línea que suena: cantadas en blanco, la actual con un barrido y el resto apagadas. */
function Palabras({ palabras, t }) {
  return palabras.map((w, k) => {
    const estado = t >= w.fin ? 'cantada' : t >= w.t ? 'sonando' : 'futura';
    const barrido = estado === 'sonando' ? { animationDuration: `${Math.max(0.08, w.fin - w.t)}s`, animationDelay: `${-(t - w.t)}s` } : undefined;
    return (
      <span key={`${k}-${estado}`} className={'pl-palabra ' + estado} style={barrido}>
        {k > 0 ? ' ' : ''}
        {w.texto}
      </span>
    );
  });
}

// Letra de la canción que suena (LRCLIB, ver src/data/letras.js), a pantalla
// completa encima de todo. Sincronizada: resalta y centra la línea que suena;
// tocar una línea salta a ese momento. Si solo hay letra plana, se muestra tal cual.
export default function PanelLetras({ track, album, duracion, tiempo, buscar, onCerrar, incrustado = false }) {
  const [estado, setEstado] = useState({ cargando: true });
  // Solo el panel del móvil (incrustado) trae proveedor a elegir y traducción.
  const [hoja, setHoja] = useState(false);
  const [buscando, setBuscando] = useState(null);
  const [avisoHoja, setAvisoHoja] = useState(null);
  const [ajusteAbierto, setAjusteAbierto] = useState(false);
  const [traducir, setTraducir] = useState(() => incrustado && leerPreferenciaTraduccion());
  const [trad, setTrad] = useState(null);
  const [avisoTrad, setAvisoTrad] = useState(false);
  const activaRef = useRef(null);
  const artista = formatearTitulo(track.artista);
  const titulo = formatearTitulo(track.titulo);

  useEffect(() => {
    let cancelado = false;
    setEstado({ cargando: true });
    obtenerLetras({ artista: track.artista, titulo: track.titulo, album, duracionS: duracion })
      .then((r) => !cancelado && setEstado({ letra: r }))
      .catch((e) => !cancelado && setEstado({ error: String(e?.message ?? e) }));
    return () => {
      cancelado = true;
    };
    // La duración llega un poco después de empezar: se usa solo si ya está.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  // Deja a la vista la barra de reproducción (fija abajo, alto variable según ancho).
  const [altoBarra, setAltoBarra] = useState(0);
  useEffect(() => {
    const barra = incrustado ? null : document.querySelector('.barra');
    if (!barra) return undefined;
    const medir = () => setAltoBarra(barra.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(barra);
    return () => ro.disconnect();
  }, []);

  const lineas = estado.letra?.sincronizada ?? null;
  const plana = !lineas ? estado.letra?.plana : null;
  const lineasPlanas = plana ? plana.split('\n') : null;

  // Traducción al español bajo cada línea (se pide solo con el botón activado; si falla, avisa).
  useEffect(() => {
    setTrad(null);
    setAvisoTrad(false);
    const letra = estado.letra;
    if (!incrustado || !traducir || !letra) return undefined;
    const textos = letra.sincronizada ? letra.sincronizada.map((l) => l.texto) : letra.plana ? letra.plana.split('\n') : null;
    if (!textos) return undefined;
    let cancelado = false;
    obtenerTraduccion(`${claveDe(track)}|${letra.fuente}`, textos, { almacen: almacenPorDefecto() })
      .then((r) => {
        if (cancelado) return;
        if (r === false) setAvisoTrad(true);
        else setTrad(r);
      })
      .catch(() => !cancelado && setAvisoTrad(true));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.letra, traducir, track.id]);

  const alternarTraduccion = () => {
    guardarPreferenciaTraduccion(!traducir);
    setTraducir(!traducir);
  };

  const elegir = async (id) => {
    setBuscando(id);
    setAvisoHoja(null);
    try {
      const letra = await elegirProveedor({ artista: track.artista, titulo: track.titulo, album, duracionS: duracion }, id);
      if (letra) {
        setEstado({ letra });
        setHoja(false);
      } else setAvisoHoja('Ese proveedor no tiene la letra de esta canción.');
    } catch {
      setAvisoHoja('No se pudo consultar ese proveedor. Inténtalo de nuevo.');
    } finally {
      setBuscando(null);
    }
  };
  // desfase: segundos que se suman a los tiempos de la letra (otra versión de la canción)
  const [desfase, setDesfase] = useDesfaseLetra(track);
  const idx = lineas ? lineaActual(lineas, tiempo + 0.3 - desfase) : -1;
  const tPalabra = tiempo - desfase;

  useEffect(() => {
    activaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [idx]);

  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <div
      className={'panel-letras' + (incrustado ? ' panel-letras--incrustado' : '')}
      style={incrustado ? undefined : { bottom: altoBarra }}
      role={incrustado ? undefined : 'dialog'} aria-label={'Letra de ' + titulo}>
      {!incrustado && (
        <header className="panel-letras-cabecera">
          <div>
            <p className="panel-letras-titulo">{titulo}</p>
            <p className="panel-letras-artista">{artista}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar letra">
            ✕
          </button>
        </header>
      )}
      <div className="panel-letras-cuerpo">
        {estado.cargando && <p className="panel-letras-aviso">Buscando la letra…</p>}
        {estado.error && <p className="panel-letras-aviso">No se pudo cargar la letra ({estado.error}).</p>}
        {!estado.cargando && !estado.error && !estado.letra && (
          <p className="panel-letras-aviso">No hay letra para esta canción.</p>
        )}
        {estado.letra?.instrumental && !lineas && !estado.letra.plana && (
          <p className="panel-letras-aviso">Instrumental ♪</p>
        )}
        {lineas &&
          lineas.map((l, i) => (
            <button
              key={i}
              ref={i === idx ? activaRef : null}
              className={'panel-letras-linea' + (i === idx ? ' activa' : i < idx ? ' pasada' : '')}
              style={idx >= 0 ? { '--d': Math.min(Math.abs(i - idx), 4) } : undefined}
              onClick={() => buscar(Math.max(0, l.t + desfase))}
            >
              {i === idx && l.palabras ? <Palabras palabras={l.palabras} t={tPalabra} /> : l.texto || '♪'}
              {trad?.[i] && <span className="panel-letras-trad">{trad[i]}</span>}
            </button>
          ))}
        {plana && !trad && <p className="panel-letras-plana">{plana}</p>}
        {plana && trad && (
          <div className="panel-letras-plana panel-letras-plana--trad">
            {lineasPlanas.map((t, i) => (
              <p key={i}>
                {t || '\u00a0'}
                {trad[i] && <span className="panel-letras-trad">{trad[i]}</span>}
              </p>
            ))}
          </div>
        )}
        {incrustado && traducir && avisoTrad && (
          <p className="panel-letras-aviso" role="status">No se pudo traducir</p>
        )}
      </div>
      {lineas && (!incrustado || ajusteAbierto) && (
        <div className="panel-letras-ajuste" role="group" aria-label="Ajustar la sincronización de la letra">
          <button onClick={() => setDesfase(ajustarDesfase(desfase, -5))} aria-label="Adelantar la letra 5 segundos">−5</button>
          <button onClick={() => setDesfase(ajustarDesfase(desfase, -0.5))} aria-label="Adelantar la letra medio segundo">−0,5</button>
          <button className="panel-letras-ajuste-valor" onClick={() => setDesfase(0)} aria-label="Quitar el ajuste">
            {incrustado && desfase === 0 ? 'Sinc.' : textoDesfase(desfase)}
          </button>
          <button onClick={() => setDesfase(ajustarDesfase(desfase, 0.5))} aria-label="Retrasar la letra medio segundo">+0,5</button>
          <button onClick={() => setDesfase(ajustarDesfase(desfase, 5))} aria-label="Retrasar la letra 5 segundos">+5</button>
        </div>
      )}
      <div className="panel-letras-pie">
        <p className="panel-letras-fuente">{estado.letra ? etiquetaFuente(estado.letra) + (incrustado && traducir && trad ? ' · Traducida al español' : '') : ''}</p>
        {incrustado && (
          <div className="panel-letras-herramientas">
            <button
              type="button"
              className={traducir ? 'activo' : undefined}
              aria-pressed={traducir}
              aria-label={traducir ? 'Ocultar la traducción al español' : 'Traducir la letra al español'}
              onClick={alternarTraduccion}
            >
              <IconoTraducir />
            </button>
            {lineas && (
              <button
                type="button"
                className={ajusteAbierto || desfase !== 0 ? 'activo' : undefined}
                aria-pressed={ajusteAbierto}
                aria-label="Ajustar la sincronización de la letra"
                onClick={() => setAjusteAbierto(!ajusteAbierto)}
              >
                <IconoSinc />
              </button>
            )}
            <button
              type="button"
              aria-label="Elegir proveedor de letras"
              disabled={estado.cargando}
              onClick={() => {
                setAvisoHoja(null);
                setHoja(true);
              }}
            >
              <IconoFuente />
            </button>
          </div>
        )}
      </div>
      {hoja && (
        <HojaProveedoresLetra
          actual={estado.letra?.fuente ?? null}
          sinLetra={proveedoresSinLetra({ artista: track.artista, titulo: track.titulo })}
          buscando={buscando}
          aviso={avisoHoja}
          onElegir={elegir}
          onCerrar={() => setHoja(false)}
        />
      )}
    </div>
  );
}
