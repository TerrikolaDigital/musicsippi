// src/movil/pantallas/SincronizarMovil.jsx
// Estado de la sincronización con el PC, cambios por enviar y cómo hacerla.
import { useEffect, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { haceCuanto } from '../formato.js';
import { esAndroid } from '../../data/nativo-movil.js';
import {
  contarCambiosPendientes,
  obtenerDireccionPC,
  obtenerUltimaSincronizacion,
  sincronizarConPC,
} from '../../data/sincronizar-movil.js';

export default function SincronizarMovil({ ctx, nav }) {
  const [ultima, setUltima] = useState(null);
  const [direccion, setDireccion] = useState('');
  const [pendientes, setPendientes] = useState(0);
  const [estado, setEstado] = useState({ fase: 'inicial' }); // inicial | sincronizando | listo | error
  // El aviso global (QR / enlace) y el botón de esta pantalla son dos vías: aquí se unifican en un solo estado.
  const aviso = ctx.avisoSincronizacion ?? null;
  const ocupado = estado.fase === 'sincronizando' || aviso?.fase === 'sincronizando';
  const modos = ctx.ejes.filter((e) => !e.sistema && e.activo !== false).length;

  // Al terminar un intento (de cualquier vía) se refresca la hora, los cambios por enviar y la dirección guardada.
  useEffect(() => {
    if (aviso?.fase === 'listo') {
      setEstado({ fase: 'inicial' });
      obtenerUltimaSincronizacion().then(setUltima).catch(() => {});
      obtenerDireccionPC().then((d) => setDireccion(d || '')).catch(() => {});
      contarCambiosPendientes().then(setPendientes).catch(() => {});
    } else if (aviso?.fase === 'sincronizando') {
      setEstado((e) => (e.fase === 'error' ? { fase: 'inicial' } : e)); // el error de antes ya no vale
    }
  }, [aviso?.fase]);

  useEffect(() => {
    obtenerUltimaSincronizacion().then(setUltima).catch(() => {});
    obtenerDireccionPC().then((d) => setDireccion(d || '')).catch(() => {});
    contarCambiosPendientes().then(setPendientes).catch(() => {});
  }, []);

  async function sincronizar() {
    if (ocupado) return;
    setEstado({ fase: 'sincronizando' });
    try {
      const r = await sincronizarConPC(direccion);
      setEstado({ fase: 'listo', ...r });
      obtenerUltimaSincronizacion().then(setUltima).catch(() => {});
      contarCambiosPendientes().then(setPendientes).catch(() => {});
      // Actualiza la biblioteca en caliente; no se toca la cola ni el reproductor.
      await ctx.recargarDatosLocales();
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e?.message ?? String(e), direccion });
    }
  }

  if (!esAndroid()) {
    return (
      <SubpantallaMovil titulo="Sincronizar" nav={nav}>
        <p className="m-aviso">La sincronización con el PC está en la app de Android.</p>
      </SubpantallaMovil>
    );
  }
  const Manual = ctx.componentes.SincronizacionMovil;
  return (
    <SubpantallaMovil titulo="Sincronizar" nav={nav}>
      <div className="config-bloque">
        <b>Última vez: {haceCuanto(ultima).toLowerCase()}</b>
        <p>
          {direccion ? `Con ${direccion} · ` : ''}
          {ctx.tracks.length} canciones · {modos} moods
        </p>
      </div>
      <div className="config-bloque">
        <b>{pendientes === 0 ? 'Nada por enviar al PC' : `${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} por enviar al PC`}</b>
        <p>Moods puestos a mano, me gusta y correcciones hechos en este móvil.</p>
      </div>
      <div className="config-bloque">
        <b>Cómo sincronizar</b>
        <ol>
          <li>En el PC abre Musicsippi → Configuración → Móvil.</li>
          <li>Escanea el código con la cámara del móvil.</li>
          <li>Acepta en el aviso. Primero se envía lo del móvil y luego llega lo del PC.</li>
        </ol>
        <button className="m-boton-grad" disabled={!direccion || ocupado} onClick={sincronizar}>
          {ocupado ? 'Sincronizando…' : 'Sincronizar con el último PC'}
        </button>
        {!direccion && <p>Aún no hay un PC guardado: escanea el código o escribe la dirección.</p>}
        {estado.fase === 'listo' && <p className="m-aviso">Listo: {estado.canciones} canciones y {estado.modos} moods{estado.copiados ? `; ${estado.copiados} archivo${estado.copiados === 1 ? '' : 's'} copiado${estado.copiados === 1 ? '' : 's'}` : ''}. {estado.aviso ?? 'Biblioteca actualizada.'}</p>}
        {estado.fase === 'error' && (
          <p className="m-aviso">
            {estado.mensaje} Si el PC cambió de red o de dirección, abre Musicsippi en el PC (Configuración → Móvil) y escanea el código.
          </p>
        )}
      </div>
      <div className="config-bloque">
        <b>Escribir la dirección a mano</b>
        <Manual />
      </div>
    </SubpantallaMovil>
  );
}
