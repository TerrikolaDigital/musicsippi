// src/movil/iniciales.js
// Iniciales de un nombre para las portadas/fotos de reserva. Con un «&» de por medio («Sia & Kylie Minogue»)
// salen hasta 3 letras («SKM») en vez de «S&»; sin él, 2 («Dua Lipa» → «DL»). Pura, sin DOM.
export function inicialesDe(nombre) {
  const palabras = String(nombre ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const max = /&/.test(String(nombre ?? '')) ? 3 : 2;
  return palabras
    .slice(0, max)
    .map((p) => p[0].toLocaleUpperCase())
    .join('');
}
