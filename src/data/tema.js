// src/data/tema.js
// Tema de la app: «sistema» (por defecto), «claro» u «oscuro». Se guarda en localStorage y se
// aplica con data-tema (la elección) y data-tema-real (claro u oscuro ya resuelto) en <html>. index.html hace lo mismo con un script en línea antes de
// pintar (mantén ambos en sincronía: misma clave y mismos valores).
const CLAVE = 'musicsippi-tema';
export const EVENTO_TEMA = 'musicsippi-tema';
export const TEMAS = ['sistema', 'claro', 'oscuro'];
// Color de la barra de estado de Android / del navegador en cada tema (= --agua-fondo).
export const COLOR_BARRA = { claro: '#f7f2ea', oscuro: '#0a0b16' };

export function leerTema(almacen = globalThis.localStorage) {
  try {
    const v = almacen?.getItem(CLAVE);
    return TEMAS.includes(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** Tema real que se ve: «sistema» se resuelve con prefers-color-scheme. */
export function temaEfectivo(tema, sistemaOscuro) {
  if (tema === 'claro' || tema === 'oscuro') return tema;
  return sistemaOscuro ? 'oscuro' : 'claro';
}

function sistemaEsOscuro() {
  try {
    return !globalThis.matchMedia?.('(prefers-color-scheme: light)').matches;
  } catch {
    return true;
  }
}

/** Pone data-tema en <html>, el theme-color y (si existe) la barra de estado de Capacitor. */
export function aplicarTema(tema = leerTema()) {
  const doc = globalThis.document;
  if (!doc) return;
  const real = temaEfectivo(tema, sistemaEsOscuro());
  doc.documentElement.dataset.tema = tema;
  doc.documentElement.dataset.temaReal = real; // lo que ve el CSS: claro | oscuro
  doc.documentElement.style.colorScheme = real;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLOR_BARRA[real]);
  // StatusBar de Capacitor no está instalado; si algún día se añade, este puente lo usa.
  const barra = globalThis.Capacitor?.Plugins?.StatusBar;
  if (barra) {
    barra.setStyle?.({ style: real === 'claro' ? 'LIGHT' : 'DARK' })?.catch?.(() => {});
    barra.setBackgroundColor?.({ color: COLOR_BARRA[real] })?.catch?.(() => {});
  }
}

export function guardarTema(tema, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(CLAVE, tema);
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); el tema se aplica igualmente.
  }
  aplicarTema(tema);
  try {
    globalThis.dispatchEvent?.(new Event(EVENTO_TEMA));
  } catch {
    // sin eventos (Node)
  }
}

/** Con «sistema», sigue los cambios del móvil (modo oscuro automático). Devuelve la baja. */
export function seguirSistema() {
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: light)');
  if (!mq) return () => {};
  const alCambiar = () => {
    if (leerTema() === 'sistema') aplicarTema('sistema');
  };
  mq.addEventListener('change', alCambiar);
  return () => mq.removeEventListener('change', alCambiar);
}
