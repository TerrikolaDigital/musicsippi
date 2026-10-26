// src/movil/vaciarMood.js
// «Quitar todas las canciones» de un mood (y su Deshacer). Las canciones siguen en la
// biblioteca: solo se les quita la pertenencia. Listas y Favoritas se guardan como colección;
// el resto como mood. Usa allSettled: si una falla, las demás se quitan y se sabe cuántas.
const esColeccion = (eje) => eje.tipo === 'playlist' || eje.id === 'favoritos';

export async function vaciarMood(ctx, eje, ids) {
  const res = await Promise.allSettled(
    ids.map((id) => (esColeccion(eje) ? ctx.guardarColeccion(id, eje.id, false) : ctx.quitarModo(id, eje.id))),
  );
  const quitadas = ids.filter((_, i) => res[i].status === 'fulfilled');
  return { quitadas, falladas: ids.length - quitadas.length };
}

export async function restaurarMood(ctx, eje, ids) {
  const res = await Promise.allSettled(
    ids.map((id) => (esColeccion(eje) ? ctx.guardarColeccion(id, eje.id, true) : ctx.asignarEje(id, eje.id))),
  );
  return { restauradas: res.filter((r) => r.status === 'fulfilled').length, falladas: res.filter((r) => r.status === 'rejected').length };
}
