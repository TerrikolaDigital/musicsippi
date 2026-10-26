// src/movil/formato.js
// Formato propio de la interfaz móvil.
import { colorDeEje } from '../ui/formato.js';

function aRgb(css) {
  const hsl = /^hsl\((\d+(?:\.\d+)?),\s*(\d+)%,\s*(\d+)%\)$/.exec(css);
  if (hsl) {
    const h = Number(hsl[1]) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(css);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [124, 92, 255];
}

function luminancia([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contraste WCAG del blanco sobre `css`. */
export function contrasteConBlanco(css) {
  return 1.05 / (luminancia(aRgb(css)) + 0.05);
}

/** Color de la tarjeta de un modo: el suyo, oscurecido hasta que el texto blanco se lea (AA). */
export function colorTarjeta(eje) {
  let rgb = aRgb(colorDeEje(eje));
  for (let i = 0; i < 60 && 1.05 / (luminancia(rgb) + 0.05) < 4.5; i++) {
    rgb = rgb.map((v) => Math.round(v * 0.95));
  }
  return `rgb(${rgb.join(', ')})`;
}

export function saludo(fecha = new Date()) {
  const h = fecha.getHours();
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function duracionLarga(ms) {
  const min = Math.round((ms ?? 0) / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

/**
 * Duración total de un conjunto de canciones a partir de sus duraciones en ms
 * (las desconocidas llegan como 0/undefined y NO cuentan como 0 min).
 * Todas conocidas: exacta. Si faltan, se estiman con la media de las conocidas
 * (o 3,5 min si no hay ninguna) y se avisa: «~30 h (calculando)».
 */
export function duracionTotalTexto(duraciones) {
  const total = duraciones.length;
  if (total === 0) return '';
  const conocidas = duraciones.filter((d) => d > 0);
  const suma = conocidas.reduce((a, d) => a + d, 0);
  if (conocidas.length === total) return duracionLarga(suma);
  const media = conocidas.length ? suma / conocidas.length : 210000;
  return `~${duracionLarga(media * total)} (calculando)`;
}

/** «Hace 5 min», «Hace 2 h», «Hace 3 días»… para el estado de la última sincronización. */
export function haceCuanto(iso, ahora = new Date()) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t)) return 'Nunca';
  const min = Math.max(0, Math.floor((ahora.getTime() - t) / 60000));
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return `Hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/**
 * Cuenta atrás del temporizador para dormir: «23 min», «Al final de la canción» o null si no hay.
 * `corto` da «23′» / «fin» para el mini-reproductor.
 */
export function textoTemporizador(t, ahora = Date.now(), corto = false) {
  if (!t) return null;
  if (t.alFinal) return corto ? 'fin' : 'Al final de la canción';
  if (!t.finMs) return null;
  const min = Math.max(1, Math.ceil((t.finMs - ahora) / 60_000));
  return corto ? `${min}′` : `${min} min`;
}

/**
 * Texto del estado de resolución de YouTube (mismo texto que escritorio).
 * `null` si no hay nada que avisar. En el móvil la clave se pone en
 * Configuración (no hay .env.local en el dispositivo).
 */
export function textoEstadoResolucion(estado, modoLocal = true) {
  switch (estado) {
    case 'buscando':
      return 'Buscando en YouTube…';
    case 'sin_api_key':
      return modoLocal
        ? 'Falta configurar tu clave de YouTube en Configuración.'
        : 'Falta YOUTUBE_API_KEY en .env.local';
    case 'no_encontrado':
      return 'YouTube no encontró este track.';
    case 'disponible_al_sincronizar':
      return 'Disponible al sincronizar.';
    case 'no_reproducible':
      return 'Ninguna versión de este track se puede reproducir acá (el dueño lo tiene restringido).';
    case 'youtube_error':
      return 'Error al buscar en YouTube. El detalle quedó en la consola.';
    case 'cuota_agotada':
      return 'Se agotó la cuota diaria de YouTube. Las canciones ya resueltas siguen sonando; las nuevas, mañana.';
    case 'error_red':
      return 'Sin conexión para buscar en YouTube.';
    case 'error':
      return 'No se pudo conectar con el servidor para resolver este track.';
    default:
      return null;
  }
}
