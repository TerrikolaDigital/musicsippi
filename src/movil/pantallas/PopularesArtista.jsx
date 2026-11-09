// src/movil/pantallas/PopularesArtista.jsx
// «Populares» bajo la lista de un artista con pocas canciones propias: sus éxitos de Deezer
// (sin las que ya tienes). Tocar la fila (▶ incluido) las escucha sin añadirlas, al momento y
// seguidas, como las de la pestaña Populares; + las añade. Si falla la red, no sale.
import { useEffect, useMemo, useState } from 'react';
import FilaCancion from '../FilaCancion.jsx';
import { IconoM } from '../iconos.jsx';
import { cargarConCache, HORA_MS } from '../inicio/cache.js';
import { deezerConIds, useAccionesExternas } from '../inicio/externas.js';
import { norm } from '../inicio/claves.js';
import { esLaQueSuena } from '../cancionSonando.js';
import { LIMITE_POPULARES, pistasDeDeezer, popularesSinLasPropias } from '../populares.js';

export default function PopularesArtista({ ctx, nombre, propias }) {
  const [lista, setLista] = useState(undefined); // undefined = cargando, null = falló
  const etiqueta = `Éxitos de ${nombre}`;
  const { estados, agregar } = useAccionesExternas(ctx, etiqueta);

  useEffect(() => {
    let vivo = true;
    setLista(undefined);
    cargarConCache(`top:${norm(nombre)}`, {
      ttlMs: 24 * HORA_MS,
      cargar: async () => {
        const dz = deezerConIds();
        const a = await dz.buscarArtista(nombre);
        if (!a) return [];
        return dz.top(a.id, LIMITE_POPULARES);
      },
    })
      .then((r) => vivo && setLista(r.datos))
      .catch(() => vivo && setLista(null));
    return () => {
      vivo = false;
    };
  }, [nombre]);

  const visibles = useMemo(() => (lista ? popularesSinLasPropias(lista, propias) : []), [lista, propias]);
  const pistas = useMemo(() => pistasDeDeezer(visibles), [visibles]);

  if (lista === null || (lista && visibles.length === 0)) return null;
  return (
    <>
      <div className="m-seccion">
        <h2>Populares</h2>
      </div>
      {lista === undefined ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="m-silueta" />
          ))}
        </div>
      ) : (
        visibles.map((c, i) => {
          const yaEsta = estados[c.id] === 'ok';
          return (
            <FilaCancion
              key={c.id}
              track={c}
              meta={{ coverUrl: c.cover }}
              activa={esLaQueSuena(ctx.trackActual, c)}
              pausada={!ctx.sonando}
              derecha={<IconoM nombre="play" tamano={18} />}
              onTocar={() => ctx.reproducirLista(pistas[i], pistas, etiqueta)}
              iconoMas={yaEsta ? 'check' : 'mas'}
              etiquetaMas={yaEsta ? 'Añadida a tu biblioteca' : 'Añadir a mi biblioteca'}
              onMas={() => !yaEsta && estados[c.id] !== 'cargando' && agregar(c)}
            />
          );
        })
      )}
    </>
  );
}
