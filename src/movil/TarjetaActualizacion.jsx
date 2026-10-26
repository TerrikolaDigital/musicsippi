// src/movil/TarjetaActualizacion.jsx
// Aviso discreto de versión nueva (flotante en el shell) y bloque «Buscar actualizaciones» de Acerca de.
import { useEffect, useState } from 'react';
import {
  actualizacionesActivas,
  buscarActualizacion,
  comprobarAlAbrir,
  descargarActualizacion,
  omitirActualizacion,
  posponerActualizacion,
  versionInstalada,
} from '../data/actualizaciones-movil.js';

export function Notas({ notas }) {
  if (!notas?.length) return null;
  return (
    <ul className="m-actualizacion-notas">
      {notas.slice(0, 6).map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

/** Al abrir la app (máx. 1 vez/12 h): si hay versión nueva, tarjeta flotante. */
export function AvisoActualizacion({ oculto, onHay }) {
  const [m, setM] = useState(null);
  useEffect(() => {
    let vivo = true;
    comprobarAlAbrir().then((r) => vivo && setM(r));
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    onHay?.(!!m);
  }, [m, onHay]);
  if (!m || oculto) return null;
  return (
    <div className="m-actualizacion" role="status">
      <b>Nueva versión disponible · {m.versionName}</b>
      <Notas notas={m.notas} />
      <div className="m-actualizacion-acciones">
        <button onClick={() => { descargarActualizacion(m.url); setM(null); }}>Descargar</button>
        <button onClick={() => { posponerActualizacion(); setM(null); }}>Más tarde</button>
        <button onClick={() => { omitirActualizacion(m.versionCode); setM(null); }}>Omitir esta versión</button>
      </div>
    </div>
  );
}

/** Acerca de: versión instalada + comprobación manual. */
export function SeccionActualizaciones() {
  const [actual, setActual] = useState(null);
  const [res, setRes] = useState(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    let vivo = true;
    versionInstalada().then((v) => vivo && setActual(v));
    return () => {
      vivo = false;
    };
  }, []);
  if (!actual && !actualizacionesActivas()) return null; // fuera de Android no hay nada que mostrar
  const buscar = async () => {
    setBuscando(true);
    setRes(await buscarActualizacion());
    setBuscando(false);
  };
  const m = res?.manifiesto;
  return (
    <div className="m-actualizacion-seccion">
      {actual && <p className="ayuda">Versión instalada: {actual.versionName} ({actual.versionCode})</p>}
      <button className="m-actualizacion-buscar" onClick={buscar} disabled={buscando}>
        {buscando ? 'Buscando…' : 'Buscar actualizaciones'}
      </button>
      {res?.estado === 'desactivado' && <p className="ayuda">Las actualizaciones no están configuradas en esta versión.</p>}
      {res?.estado === 'error' && <p className="ayuda">No se pudo consultar la última versión publicada. Inténtalo más tarde.</p>}
      {res?.estado === 'al-dia' && <p className="ayuda">Estás al día.</p>}
      {res?.estado === 'nueva' && m && (
        <div className="m-actualizacion-resultado">
          <b>Nueva versión disponible · {m.versionName}</b>
          <Notas notas={m.notas} />
          <button onClick={() => descargarActualizacion(m.url)}>Descargar</button>
        </div>
      )}
    </div>
  );
}
