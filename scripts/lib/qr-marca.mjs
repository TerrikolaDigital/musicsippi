// QR con los colores de «La corriente»: módulos en degradado violeta→magenta muy oscuros sobre una placa lavanda
// clara. Los dos extremos del degradado tienen poca luminancia (contraste > 9:1 con el fondo), así que la cámara lo
// lee igual que uno negro. Se usa en el PC (servidor, /api/qr-movil) y en la página (descarga del APK).
export const QR_FONDO = '#f6f3ff';
export const QR_TINTA_INICIO = '#2a1670'; // violeta profundo
export const QR_TINTA_FIN = '#6b1240'; // magenta profundo

/** Opciones para el paquete `qrcode` (toString con type 'svg'). */
export const opcionesQrMarca = (width) => ({ type: 'svg', margin: 2, width, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: `${QR_FONDO}ff` } });

/** Cambia el negro del SVG de `qrcode` por el degradado de marca. Si el SVG no tiene la forma esperada, lo deja igual. */
export function colorearQr(svg) {
  const lado = svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1];
  if (!lado || !svg.includes('stroke="#000000"')) return svg;
  const defs =
    `<defs><linearGradient id="qr-tinta" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${lado}" y2="${lado}">` +
    `<stop offset="0" stop-color="${QR_TINTA_INICIO}"/><stop offset="1" stop-color="${QR_TINTA_FIN}"/></linearGradient></defs>`;
  return svg.replace(/(<svg[^>]*>)/, `$1${defs}`).replace('stroke="#000000"', 'stroke="url(#qr-tinta)"');
}
