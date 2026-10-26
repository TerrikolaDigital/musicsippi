// src/movil/TarjetaNovedades.jsx
// «Novedades de la versión X»: aviso único tras actualizar la app (mismo estilo que la tarjeta de actualización).
import { useEffect, useState } from 'react';
import { cerrarNovedades, prepararNovedades } from '../data/novedades-movil.js';
import { Notas } from './TarjetaActualizacion.jsx';

export function AvisoNovedades({ oculto }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    let vivo = true;
    prepararNovedades().then((r) => vivo && setN(r));
    return () => {
      vivo = false;
    };
  }, []);
  if (!n || oculto) return null;
  return (
    <div className="m-novedades" role="status">
      <b>Novedades de la versión {n.versionName}</b>
      <Notas notas={n.notas} />
      <div className="m-actualizacion-acciones">
        <button onClick={() => { cerrarNovedades(n.versionCode); setN(null); }}>Entendido</button>
      </div>
    </div>
  );
}
