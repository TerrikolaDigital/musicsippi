// src/movil/pantallas/SinConexionMovil.jsx
// Ajustes › Sin conexión (solo Android): guardar canciones cifradas para escucharlas sin red,
// límite de espacio y borrado de lo guardado.
import { useEffect, useRef, useState } from 'react';
import {
  LIMITES_MB,
  etiquetaLimite,
  favoritasNoCaben,
  guardarAjustesSinConexion,
  leerAjustesSinConexion,
  textoEspacioUsado,
} from '../../data/sin-conexion.js';
import { borrarGuardadas, obtenerNFavoritas } from '../../data/sin-conexion-nativo.js';
import { IconoM } from '../iconos.jsx';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import Interruptor from './Interruptor.jsx';
import '../ecualizador.css';

const CONFIRMAR_MS = 4000;

export default function SinConexionMovil({ ctx, nav }) {
  const { bytesUsados, descargando, indiceTope, nGuardadas } = ctx.sinConexion;
  const [ajustes, setAjustes] = useState(() => leerAjustesSinConexion());
  const [confirmando, setConfirmando] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const cambiar = (parcial) => setAjustes(guardarAjustesSinConexion(parcial));

  // Primer toque pide confirmar; sin segundo toque en 4 s se anula.
  const borrar = () => {
    if (!confirmando) {
      setConfirmando(true);
      temporizador.current = setTimeout(() => setConfirmando(false), CONFIRMAR_MS);
      return;
    }
    clearTimeout(temporizador.current);
    setConfirmando(false);
    // Borrar también apaga el guardado: si no, se volverían a guardar con wifi.
    borrarGuardadas().catch(() => {});
    cambiar({ activado: false });
  };

  return (
    <SubpantallaMovil titulo="Sin conexión" nav={nav}>
      <div className="config-tarjeta">
        <div className="ec-fila-ajuste ec-fila-interruptor">
          <div>
            <b>Guardar para escuchar sin conexión</b>
            <small className="ec-ayuda">Guarda solas tus favoritas y lo que más escuchas, cifrado y solo dentro de la app.</small>
          </div>
          <Interruptor activo={ajustes.activado} etiqueta="Guardar para escuchar sin conexión" onCambio={(activado) => cambiar({ activado })} />
        </div>
        <div className="cfg-ini-fila">
          <b>Límite de espacio</b>
          <div className="m-segmentado cfg-ini-seg" role="group" aria-label="Límite de espacio para canciones guardadas">
            {LIMITES_MB.map((mb) => (
              <button key={mb} aria-pressed={ajustes.limiteMb === mb} className={ajustes.limiteMb === mb ? 'on' : ''} onClick={() => cambiar({ limiteMb: mb })}>
                {etiquetaLimite(mb)}
              </button>
            ))}
          </div>
          <small className="cfg-ini-estado">{textoEspacioUsado({ bytes: bytesUsados, limiteMb: ajustes.limiteMb, n: nGuardadas })}</small>
          {descargando && <small className="cfg-ini-estado" role="status">Descargando…</small>}
          {favoritasNoCaben(indiceTope, obtenerNFavoritas()) && (
            <small className="cfg-ini-estado">Tus favoritas no caben enteras; sube el límite</small>
          )}
        </div>
        <div className="ec-fila-ajuste">
          <b>Solo con wifi</b>
          <small className="ec-ayuda">Descarga solo con wifi y con la app abierta o sonando música.</small>
        </div>
        <button className="config-fila peligro" onClick={borrar}>
          <span className="config-ic" style={{ background: '#e1705526' }}>
            <IconoM nombre="borrar" />
          </span>
          <span className="config-tx">
            <b>{confirmando ? '¿Seguro? Toca otra vez para borrar' : 'Borrar canciones guardadas'}</b>
            <small>También apaga «Guardar para escuchar sin conexión».</small>
          </span>
        </button>
      </div>
    </SubpantallaMovil>
  );
}
