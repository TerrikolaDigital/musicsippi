// src/movil/pantallas/CopiaMovil.jsx
// Copia de seguridad: guardar un archivo JSON con los datos del móvil y restaurarlo.
import { useEffect, useRef, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { haceCuanto } from '../formato.js';
import { exportarCopia, restaurarCopia } from '../../data/copia-movil.js';
import { esAndroid, guardarArchivo } from '../../data/nativo-movil.js';
import { guardarValorConfig, obtenerValorConfig } from '../../data/lib/db.js';

const fechaArchivo = () => new Date().toISOString().slice(0, 10);

export default function CopiaMovil({ nav }) {
  const [ultima, setUltima] = useState(null);
  const [estado, setEstado] = useState(null); // { tipo: 'ok' | 'error', texto }
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef(null);

  useEffect(() => {
    obtenerValorConfig('ultimaCopia', null).then(setUltima).catch(() => {});
  }, []);

  async function guardar() {
    setOcupado(true);
    setEstado(null);
    try {
      const contenido = await exportarCopia();
      const nombre = `musicsippi-copia-${fechaArchivo()}.json`;
      let guardado = true;
      if (esAndroid()) {
        guardado = await guardarArchivo(nombre, contenido);
      } else {
        const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); // revocarlo ya cancela la descarga en algunos navegadores
      }
      if (guardado) {
        const ahora = new Date().toISOString();
        await guardarValorConfig('ultimaCopia', ahora);
        setUltima(ahora);
        setEstado({ tipo: 'ok', texto: 'Copia guardada.' });
      }
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo guardar la copia: ${e?.message ?? e}` });
    } finally {
      setOcupado(false);
    }
  }

  async function elegido(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!window.confirm('Esto reemplaza lo que hay en este móvil por lo de la copia. Antes se guarda una copia de lo actual. ¿Continuar?')) return;
    setOcupado(true);
    setEstado(null);
    try {
      const r = await restaurarCopia(await archivo.text());
      setEstado({ tipo: 'ok', texto: `Copia restaurada (${r.canciones} canciones). Recargando…` });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      // Si la copia no es válida no se ha tocado nada.
      setEstado({ tipo: 'error', texto: `${err?.message ?? err} No se ha cambiado nada.` });
      setOcupado(false);
    }
  }

  return (
    <SubpantallaMovil titulo="Copia de seguridad" nav={nav}>
      <div className="config-bloque">
        <b>Guardar una copia</b>
        <p>Tu biblioteca, moods, me gusta, correcciones e historial de este móvil, en un archivo. No incluye las canciones (se vuelven a buscar solas).</p>
        <button className="m-boton-grad" disabled={ocupado} onClick={guardar}>
          Guardar copia
        </button>
        <p>Última copia: {ultima ? haceCuanto(ultima).toLowerCase() : 'nunca'}</p>
      </div>
      <div className="config-bloque">
        <b>Restaurar desde un archivo</b>
        <p>Reemplaza lo que hay en este móvil por lo de la copia. Antes guarda una copia de lo actual, por si acaso.</p>
        <button className="config-sec" disabled={ocupado} onClick={() => entrada.current?.click()}>
          Elegir archivo…
        </button>
        <input ref={entrada} type="file" accept="application/json,.json" hidden onChange={elegido} />
      </div>
      {estado && <p className={estado.tipo === 'error' ? 'm-aviso' : 'config-ok'}>{estado.texto}</p>}
    </SubpantallaMovil>
  );
}
