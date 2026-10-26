// src/movil/albumMood.js
// «Añadir a un mood» del ⋯ de un álbum. Puro: de las canciones del álbum que ya están en la
// biblioteca, cuáles hay que poner en el mood (las que aún no lo tienen) y el texto del aviso.

/** {poner, yaEstaban}: `poner` son los ids que aún no tienen el mood; deshacer = quitar solo esos. */
export function planAnadirAlbumAMood(ids, tracks, ejeId) {
  const porId = new Map((tracks ?? []).map((t) => [t.id, t]));
  const poner = [];
  let yaEstaban = 0;
  for (const id of ids ?? []) {
    if (porId.get(id)?.ejes?.some((x) => x.ejeId === ejeId)) yaEstaban += 1;
    else poner.push(id);
  }
  return { poner, yaEstaban };
}

/** «3 canciones añadidas a «Soundtracks»» (o «Todas ya estaban en…» si no había nada que poner). */
export function textoAvisoAlbumMood(n, yaEstaban, nombreMood) {
  if (n === 0) return `Todas las canciones ya estaban en «${nombreMood}»`;
  const base = `${n} ${n === 1 ? 'canción añadida' : 'canciones añadidas'} a «${nombreMood}»`;
  return yaEstaban > 0 ? `${base} (${yaEstaban} ya estaban)` : base;
}
