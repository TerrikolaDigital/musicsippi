// src/movil/importar/ImportarArchivosLocales.jsx
// «Desde el móvil»: elegir archivos o una carpeta (SAF), escanear la música del móvil y, si se
// quiere, sumar listas M3U/M3U8/PLS. Muestra un resumen y no importa nada hasta confirmar.
import { useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import { esAndroid } from '../../data/nativo-movil.js';
import { lineasResumen, prepararSeleccion, textoResultado } from './flujo-archivos-locales.js';

const MENSAJE_ERROR = 'No se pudo leer la música del móvil. Inténtalo de nuevo.';

export default function ImportarArchivosLocales({ ctx, onImportado }) {
  const [estado, setEstado] = useState({ tipo: 'inicial' });
  const [listas, setListas] = useState([]);
  const selectorListas = useRef(null);

  if (!esAndroid() || !ctx.importacion?.importarArchivosLocales) return null;

  async function elegir(modo) {
    setEstado({ tipo: 'buscando' });
    setListas([]);
    try {
      const adaptador = await import('../../data/archivos-locales-movil.js');
      const prep = await prepararSeleccion(modo, adaptador);
      if (prep.estado === 'cancelado') setEstado({ tipo: 'inicial' });
      else if (prep.estado === 'sin_permiso') setEstado({ tipo: 'error', mensaje: 'Sin permiso para ver la música del móvil. Puedes elegir los archivos a mano.' });
      else if (prep.estado === 'vacio') setEstado({ tipo: 'error', mensaje: 'No he encontrado audio en lo que has elegido.' });
      else setEstado({ tipo: 'vista', prep });
    } catch {
      setEstado({ tipo: 'error', mensaje: MENSAJE_ERROR });
    }
  }

  async function leerListas(e) {
    const ficheros = [...(e.target.files ?? [])];
    e.target.value = '';
    try {
      const leidas = await Promise.all(ficheros.map(async (f) => ({ nombre: f.name, texto: await f.text() })));
      setListas((previas) => [...previas, ...leidas]);
    } catch {
      setEstado({ tipo: 'error', mensaje: 'No se pudo leer esa lista.' });
    }
  }

  async function importar() {
    const { prep } = estado;
    setEstado({ tipo: 'importando', prep });
    try {
      const r = await ctx.importacion.importarArchivosLocales({ archivos: prep.archivos, listas });
      setEstado({ tipo: 'hecho', r });
      setListas([]);
      onImportado?.(r);
    } catch {
      setEstado({ tipo: 'error', mensaje: 'No se pudo guardar la música en el móvil.' });
    }
  }

  const conVista = estado.tipo === 'vista' || estado.tipo === 'importando';
  const ocupado = estado.tipo === 'buscando' || estado.tipo === 'importando';
  return (
    <section className="importar-locales anadir-camino" aria-label="Desde el móvil">
      <header className="anadir-cab">
        <span className="importar-paso-ico">
          <IconoM nombre="movil" tamano={20} />
        </span>
        <div>
          <h3>Desde el móvil</h3>
          <p className="hoja-nota">Archivos mp3 o una carpeta de este móvil.</p>
        </div>
      </header>
      {!conVista && (
        <>
          <button className="hoja-op" disabled={ocupado} onClick={() => elegir('archivos')}>
            <IconoM nombre="disco" />
            <span>Elegir archivos o carpeta</span>
          </button>
          <button className="hoja-op" disabled={ocupado} onClick={() => elegir('escanear')}>
            <IconoM nombre="buscar" />
            <span>{estado.tipo === 'buscando' ? 'Buscando música…' : 'Escanear música'}</span>
          </button>
          <button className="hoja-op" disabled={ocupado} onClick={() => elegir('carpeta')}>
            <IconoM nombre="biblioteca" />
            <span>Elegir una carpeta entera</span>
          </button>
        </>
      )}
      {estado.tipo === 'error' && (
        <p className="m-aviso" role="alert">
          {estado.mensaje}
        </p>
      )}
      {conVista && (
        <div className="importar-locales-vista">
          {lineasResumen(estado.prep, listas).map((l) => (
            <p key={l} className="hoja-nota">
              {l}
            </p>
          ))}
          <button className="hoja-op" disabled={estado.tipo === 'importando'} onClick={() => selectorListas.current?.click()}>
            <IconoM nombre="lista" />
            <span>Añadir una lista (M3U, PLS)</span>
          </button>
          <input ref={selectorListas} type="file" accept=".m3u,.m3u8,.pls" multiple hidden onChange={leerListas} />
          <button className="m-boton-grad" disabled={estado.tipo === 'importando'} onClick={importar}>
            {estado.tipo === 'importando' ? 'Importando…' : 'Importar'}
          </button>
          <button className="config-sec" disabled={estado.tipo === 'importando'} onClick={() => setEstado({ tipo: 'inicial' })}>
            Cancelar
          </button>
        </div>
      )}
      {estado.tipo === 'hecho' && (
        <div role="status">
          {textoResultado(estado.r).map((t) => (
            <p key={t} className="hoja-nota">
              {t}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
