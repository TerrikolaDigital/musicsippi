// src/movil/importar/ImportarEnlace.jsx
// Pegar el enlace → vista previa (nombre, portada, origen, nº de canciones) →
// Importar. Se usa en la hoja «Añadir música» y en la bienvenida.
import { useEffect, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import { ErrorImportar } from '../../importar/errores.js';
import { resumenVistaPrevia, textoImportado } from './vista-previa.js';
import { seguir } from '../../importar/seguidas.js';
import { PASOS_COMPARTIR } from './pasos-compartir.js';

// Solo los ErrorImportar traen un mensaje pensado para el usuario.
const mensajeLectura = (e) => (e instanceof ErrorImportar ? e.message : 'No se pudo leer la playlist. Revisa la conexión e inténtalo de nuevo.');

export default function ImportarEnlace({ ctx, textoInicial = '', onImportado, onVerMoods }) {
  const [texto, setTexto] = useState(textoInicial);
  const [estado, setEstado] = useState({ tipo: 'inicial' });
  const leidoAlAbrir = useRef(false);

  async function leer(valor = texto) {
    if (!valor.trim()) return;
    setEstado({ tipo: 'leyendo' });
    try {
      setEstado({ tipo: 'vista', lectura: await ctx.importacion.leerEnlace(valor) });
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: mensajeLectura(e), codigo: e?.codigo });
    }
  }

  async function importar() {
    const { lectura } = estado;
    setEstado({ tipo: 'importando', lectura });
    try {
      const r = await ctx.importacion.importarLectura(lectura);
      // La playlist queda seguida; si no se pudo guardar, la importación sigue valiendo.
      await seguir({ origen: lectura.origen, id: lectura.id, nombre: lectura.nombre, ejeId: r.ejeLista }).catch(() => {});
      setEstado({ tipo: 'hecho', lectura, r });
      onImportado?.(r, lectura);
    } catch (e) {
      // Aquí la red ya no interviene: falló guardar en el móvil, no leer.
      setEstado({ tipo: 'error', mensaje: e instanceof ErrorImportar ? e.message : 'No se pudo guardar la música en el móvil.' });
    }
  }

  // Compartido desde otra app: se lee nada más abrir.
  useEffect(() => {
    if (textoInicial && !leidoAlAbrir.current) {
      leidoAlAbrir.current = true;
      leer(textoInicial);
    }
  }, [textoInicial]);

  const conVista = estado.tipo === 'vista' || estado.tipo === 'importando';
  return (
    <div className="importar">
      <label className="hoja-campo">
        Pega el enlace de una playlist
        <input
          className="m-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={texto}
          disabled={estado.tipo === 'importando'}
          placeholder="https://open.spotify.com/playlist/…"
          onChange={(e) => {
            setTexto(e.target.value);
            if (estado.tipo !== 'leyendo') setEstado({ tipo: 'inicial' });
          }}
          onKeyDown={(e) => e.key === 'Enter' && leer()}
        />
      </label>
      <p className="importar-origenes">
        <span>Spotify</span>
        <span>YouTube Music</span>
        <span>Deezer</span>
        <span>Apple Music</span>
      </p>
      {estado.tipo === 'error' && (
        <p className="m-aviso" role="alert">
          {estado.mensaje}
          {estado.codigo === 'amazon-login' && (
            <> <a href="https://www.tunemymusic.com/transfer/amazon-music-to-csv" target="_blank" rel="noreferrer">Abrir TuneMyMusic</a></>
          )}
        </p>
      )}
      {!conVista && estado.tipo !== 'hecho' && (
        <button className="m-boton-grad" disabled={!texto.trim() || estado.tipo === 'leyendo'} onClick={() => leer()}>
          {estado.tipo === 'leyendo' ? 'Leyendo la playlist…' : 'Ver la playlist'}
        </button>
      )}
      {conVista && (
        <div className="importar-vista">
          {estado.lectura.portada ? (
            <img className="importar-portada" src={estado.lectura.portada} alt="" />
          ) : (
            <span className="importar-portada vacia" aria-hidden="true">
              <IconoM nombre="lista" />
            </span>
          )}
          <div className="importar-datos">
            <b>{estado.lectura.nombre}</b>
            <small>{resumenVistaPrevia(estado.lectura)}</small>
          </div>
          {estado.lectura.aviso && <p className="hoja-nota">{estado.lectura.aviso}</p>}
          <button className="m-boton-grad" disabled={estado.tipo === 'importando'} onClick={importar}>
            {estado.tipo === 'importando' ? 'Importando…' : 'Importar'}
          </button>
        </div>
      )}
      {estado.tipo === 'hecho' && (
        <p className="hoja-nota" role="status">
          {textoImportado(estado.r, estado.lectura)}
        </p>
      )}
      {estado.tipo === 'hecho' && onVerMoods && (
        <button className="m-boton-grad" onClick={onVerMoods}>
          Ver mis moods
        </button>
      )}
      <div className="importar-pasos">
        <p className="hoja-nota">También puedes compartirla desde esas apps:</p>
        <ol>
          {PASOS_COMPARTIR.map((p) => (
            <li key={p.icono}>
              <span className="importar-paso-ico">
                <IconoM nombre={p.icono} tamano={20} />
              </span>
              {p.texto}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
