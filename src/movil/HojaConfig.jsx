// src/movil/HojaConfig.jsx
// Hojas de Configuración: temporizador para dormir, cómo añadir música y borrar datos.
import { useEffect, useRef, useState } from 'react';
import HojaInferior from './HojaInferior.jsx';
import { IconoM } from './iconos.jsx';
import { FAMILIAS_NUEVO, camposDeMoodNuevo } from './modos.js';
import { borrarDatosMovil } from '../data/copia-movil.js';
import ImportarEnlace from './importar/ImportarEnlace.jsx';
import ImportarArchivosLocales from './importar/ImportarArchivosLocales.jsx';

const MINUTOS = [15, 30, 45, 60];
const TITULOS = { sueno: 'Temporizador para dormir', anadir: 'Añadir música', borrar: 'Borrar los datos de este móvil', nuevo: 'Crear' };

function Opcion({ icono, onClick, children }) {
  return (
    <button className="hoja-op" onClick={onClick}>
      <IconoM nombre={icono} />
      <span>{children}</span>
    </button>
  );
}

function Sueno({ ctx, nav }) {
  const fijar = (v) => {
    ctx.fijarTemporizador(v);
    nav.atras();
  };
  return (
    <>
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
}

function Nuevo({ ctx, nav }) {
  // Sin window.prompt (en el WebView del móvil no es fiable): el nombre se escribe aquí mismo.
  const [tipoMood, setTipoMood] = useState('genero');
  const [familia, setFamilia] = useState(null); // null = aún sin elegir qué crear
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const limpio = nombre.trim();
  const repetido = ctx.ejes.some((e) => e.nombre.trim().toLowerCase() === limpio.toLowerCase());
  const elegir = (f) => {
    setFamilia(f);
    setNombre('');
  };
  async function crear(f) {
    if (!limpio || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const campos = camposDeMoodNuevo(f);
      const id = await ctx.crearEje(limpio, campos.tipo, campos);
      if (!id) return; // guardarEjes ya avisó del error
      nav.atras();
      ctx.avisar?.('Mood creado');
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setGuardando(false);
    }
  }
  if (!familia) {
    return (
      <>
        <Opcion icono="modos" onClick={() => elegir('mood')}>
          Un mood
        </Opcion>
        <Opcion icono="lista" onClick={() => elegir('fijo')}>
          Un mood fijo (no se rellena solo)
        </Opcion>
      </>
    );
  }
  const familiaReal = familia === 'mood' ? tipoMood : familia;
  return (
    <>
      <p className="hoja-nota">{familia === 'fijo' ? 'Aparecerá en Listas y solo tendrá las canciones que tú le pongas.' : 'El organizador le irá añadiendo canciones que encajen.'}</p>
      <input className="m-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del mood" aria-label="Nombre del mood" autoFocus maxLength={40} />
      {familia === 'mood' && (
        <div className="m-segmentado" role="group" aria-label="Familia del mood">
          {FAMILIAS_NUEVO.map(([id, etiqueta]) => (
            <button key={id} aria-pressed={familiaReal === id} className={familiaReal === id ? 'on' : ''} onClick={() => setTipoMood(id)}>
              {etiqueta}
            </button>
          ))}
        </div>
      )}
      {repetido && limpio && <p className="hoja-nota">Ya tienes un mood con ese nombre; se creará otro aparte.</p>}
      {error && <p className="m-aviso" role="alert">No se pudo crear: {error}</p>}
      <button className="m-boton-grad" disabled={!limpio || guardando} onClick={() => crear(familiaReal)}>
        {guardando ? 'Creando…' : 'Crear'}
      </button>
      <button className="config-sec" onClick={() => setFamilia(null)}>
        Atrás
      </button>
    </>
  );
}

// Cabecera de un camino de la hoja: icono, título y una línea de explicación.
function Camino({ icono, titulo, nota, children }) {
  return (
    <section className="anadir-camino">
      <header className="anadir-cab">
        <span className="importar-paso-ico">
          <IconoM nombre={icono} tamano={20} />
        </span>
        <div>
          <h3>{titulo}</h3>
          <p className="hoja-nota">{nota}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Anadir({ ctx, nav, texto, locales }) {
  const zonaLocales = useRef(null);
  // «Elegir mp3 del móvil» (bienvenida) abre la hoja con esa opción a la vista.
  useEffect(() => {
    if (!locales) return undefined;
    const t = setTimeout(() => zonaLocales.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
    return () => clearTimeout(t);
  }, [locales]);
  // «atrás» cierra la hoja (quita su entrada del historial); ya cerrada, va a Buscar.
  const irABuscar = () => {
    window.addEventListener(
      'popstate',
      () => {
        nav.irAPestana('buscar');
        setTimeout(() => document.querySelector('.shell-movil-contenido input[type="search"]')?.focus(), 150);
      },
      { once: true }
    );
    nav.atras();
  };
  // Igual que arriba: cierra la hoja y, ya cerrada, abre la pestaña Moods.
  const irAMoods = () => {
    window.addEventListener('popstate', () => nav.irAPestana('modos'), { once: true });
    nav.atras();
  };
  const sinRed = !!ctx.sinConexion && !ctx.sinConexion.hayRed;
  const buscar = (
    <button className="anadir-buscar" onClick={irABuscar} disabled={sinRed}>
      <span className="importar-paso-ico">
        <IconoM nombre="buscar" tamano={20} />
      </span>
      <span className="anadir-buscar-txt">
        <b>Buscar canciones, álbumes o artistas</b>
        <small>{sinRed ? 'Necesita conexión' : 'Encuéntralas y añádelas con +'}</small>
      </span>
    </button>
  );
  if (ctx.modoLocal && ctx.importacion) {
    return (
      <>
        {buscar}
        <Camino icono="enlace" titulo="Pegar enlace de una playlist" nota={sinRed ? 'Necesita conexión' : 'Spotify, YouTube Music, Deezer o Apple Music.'}>
          {!sinRed && <ImportarEnlace ctx={ctx} textoInicial={texto} onVerMoods={irAMoods} />}
        </Camino>
        <div ref={zonaLocales}>
          <ImportarArchivosLocales ctx={ctx} />
        </div>
        <p className="hoja-nota">Lo que importes llega al PC al sincronizar.</p>
      </>
    );
  }
  return (
    <>
      {buscar}
      <p className="hoja-nota">Las canciones se importan en la app del PC (TuneMyMusic o archivos). Luego sincroniza el móvil.</p>
      <button className="m-boton-grad" onClick={() => nav.abrir({ tipo: 'config-sincronizar' })}>
        Ir a Sincronizar
      </button>
    </>
  );
}

function Borrar({ nav }) {
  const [texto, setTexto] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState(null);
  const listo = texto.trim() === 'BORRAR';
  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await borrarDatosMovil();
      window.location.reload();
    } catch (e) {
      setError(String(e?.message ?? e));
      setBorrando(false);
    }
  }
  return (
    <>
      <p className="hoja-nota">
        Se borran la biblioteca, los moods, los me gusta y el historial de este móvil. No toca el PC. Escribe BORRAR para confirmar.
      </p>
      <input
        className="m-input"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe BORRAR"
        autoCapitalize="characters"
        aria-label="Escribe BORRAR"
      />
      {error && <p className="m-aviso" role="alert">No se pudieron borrar los datos: {error}</p>}
      <button className="config-borrar" disabled={!listo || borrando} onClick={borrar}>
        {borrando ? 'Borrando…' : 'Borrar los datos de este móvil'}
      </button>
      <button className="config-sec" onClick={nav.atras}>
        Cancelar
      </button>
    </>
  );
}

export default function HojaConfig({ ctx, nav, tipo, texto, locales }) {
  return (
    <HojaInferior abierta onCerrar={nav.atras} titulo={TITULOS[tipo]}>
      <div className="hoja-sub-cab">
        <h2>{TITULOS[tipo]}</h2>
      </div>
      {tipo === 'sueno' && <Sueno ctx={ctx} nav={nav} />}
      {tipo === 'nuevo' && <Nuevo ctx={ctx} nav={nav} />}
      {tipo === 'anadir' && <Anadir ctx={ctx} nav={nav} texto={texto} locales={locales} />}
      {tipo === 'borrar' && <Borrar nav={nav} />}
    </HojaInferior>
  );
}
