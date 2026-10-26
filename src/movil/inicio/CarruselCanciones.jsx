// src/movil/inicio/CarruselCanciones.jsx
// Título de sección + carrusel de canciones de fuera (Descubrimiento y Tendencias).
import { useState } from 'react';
import HojaExterna from '../HojaExterna.jsx';
import { filtrarNoMeGusta } from '../noMeGusta.js';
import TarjetaExterna from './TarjetaExterna.jsx';
import { useAccionesExternas } from './externas.js';

export default function CarruselCanciones({ ctx, titulo, etiqueta, canciones }) {
  const { estados, escuchar, agregar } = useAccionesExternas(ctx, etiqueta);
  const [menu, setMenu] = useState(null);
  return (
    <>
      <div className="m-seccion">
        <h2>{titulo}</h2>
      </div>
      <div className="inicio-carrusel">
        {filtrarNoMeGusta(canciones, ctx.noMeGusta).map((c) => (
          <TarjetaExterna
            key={c.id}
            cancion={c}
            estadoPlay={estados[`${c.id}:play`]}
            estadoAdd={estados[c.id]}
            onPlay={() => escuchar(c)}
            onAdd={() => agregar(c)}
            onMenu={() => setMenu(c)}
          />
        ))}
      </div>
      {menu && <HojaExterna ctx={ctx} cancion={menu} onAgregar={() => agregar(menu)} onCerrar={() => setMenu(null)} />}
    </>
  );
}
