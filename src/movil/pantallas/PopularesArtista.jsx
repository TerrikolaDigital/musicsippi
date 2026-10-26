// src/movil/pantallas/PopularesArtista.jsx
// «Populares» bajo la lista de un artista con pocas canciones propias: sus éxitos de Deezer
// (sin las que ya tienes). ▶ las escucha sin añadirlas; + las añade. Si falla la red, no sale.
import { useEffect, useMemo, useState } from 'react';
import FilaCancion from '../FilaCancion.jsx';
import { IconoM } from '../iconos.jsx';
import { cargarConCache, HORA_MS } from '../inicio/cache.js';
import { deezerConIds, useAccionesExternas } from '../inicio/externas.js';
import { norm } from '../inicio/claves.js';
import { LIMITE_POPULARES, popularesSinLasPropias } from '../populares.js';

export default function PopularesArtista({ ctx, nombre, propias }) {
  const [lista, setLista] = useState(undefined); // undefined = cargando, null = falló
  const { estados, escuchar, agregar } = useAccionesExternas(ctx, `Éxitos de ${nombre}`);

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
        visibles.map((c) => {
          const yaEsta = estados[c.id] === 'ok';
          return (
            <FilaCancion
              key={c.id}
              track={c}
              meta={{ coverUrl: c.cover }}
              activa={false}
              derecha={<IconoM nombre="play" tamano={18} />}
              onTocar={() => escuchar(c)}
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
