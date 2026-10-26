// src/movil/pantallas/SinModoMovil.jsx
// Ajustes > Canciones sin modo: las que el organizador no supo colocar, con su motivo,
// para asignarlas a mano desde el menú ⋯ de cada canción.
import { useEffect, useMemo, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import FilaCancion from '../FilaCancion.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { obtenerValorConfig } from '../../data/lib/db.js';
import { CLAVE_SIN_COLOCAR, MOTIVOS_SIN_COLOCAR, esSinModo } from '../../organizador/sin-modo.js';

export default function SinModoMovil({ ctx, nav }) {
  const [motivos, setMotivos] = useState({});
  useEffect(() => {
    let vivo = true;
    obtenerValorConfig(CLAVE_SIN_COLOCAR, {}).then((m) => vivo && setMotivos(m ?? {})).catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const lista = useMemo(() => ctx.tracks.filter(esSinModo), [ctx.tracks]);

  return (
    <SubpantallaMovil titulo="Canciones sin mood" nav={nav}>
      {lista.length === 0 ? (
        <EstadoVacio titulo="Todas tus canciones tienen mood" accion={{ etiqueta: 'Ver mis moods', onClick: () => nav.irAPestana('modos') }} />
      ) : (
        <>
          <p className="config-nota">Musicsippi no ha sabido colocar estas canciones. Toca ⋯ para asignarlas a un mood.</p>
          {lista.map((t) => (
            <FilaCancion
              key={t.id}
              track={t}
              meta={ctx.metadataDe(t.trackIdReal ?? t.id)}
              activa={ctx.trackActual?.id === t.id}
              pausada={!ctx.sonando}
              subtitulo={`${formatearTitulo(t.artista)} · ${(MOTIVOS_SIN_COLOCAR[motivos[t.id]] ?? MOTIVOS_SIN_COLOCAR['sin-datos'])}`}
              onTocar={() => ctx.reproducirLista(t, lista, 'Sin mood')}
              onMas={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
              onPulsacionLarga={() => nav.abrirCapa({ tipo: 'hoja', trackId: t.id })}
            />
          ))}
        </>
      )}
    </SubpantallaMovil>
  );
}
