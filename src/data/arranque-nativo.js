// src/data/arranque-nativo.js
// Lo que pasa entre «el usuario pidió una canción» y «el reproductor nativo suena». Si ese tramo
// se queda a medias (servicio que no conecta, URL que nadie resuelve) nada avisa solo: la pantalla
// se quedaba en 0:00 con ▶ y sin mensaje, que es lo que vio un usuario nuevo en un Samsung S24 FE.
// Aquí vive la regla «o suena, o se dice», y el rastro para saber por qué no sonó.

// La primera resolución de una instalación nueva tarda ~10 s con buena red: esto no debe saltar antes.
export const ESPERA_ARRANQUE_MS = 30_000;

/** Códigos que señalan al reproductor del móvil, no a la canción: no se descarta ni se salta nada. */
export const esFalloDelReproductor = (codigo) => codigo === 'nativo' || codigo === 'nativo_rechazado';

/**
 * alCambiar recibe null (nada que contar), {fase:'cargando'} o {fase:'fallo', motivo}.
 * Avisar no cancela la carga en curso: si suena tarde, sono() retira el aviso.
 */
export function crearVigilanteArranque({ esperaMs = ESPERA_ARRANQUE_MS, alCambiar, programar = setTimeout, cancelar = clearTimeout }) {
  let temporizador = null;
  const parar = () => {
    if (temporizador !== null) cancelar(temporizador);
    temporizador = null;
  };
  const fallo = (motivo) => {
    parar();
    alCambiar({ fase: 'fallo', motivo });
  };
  return {
    iniciar() {
      parar();
      alCambiar({ fase: 'cargando' });
      temporizador = programar(() => {
        temporizador = null;
        fallo('tiempo_agotado');
      }, esperaMs);
    },
    sono() {
      parar();
      alCambiar(null);
    },
    limpiar() {
      parar();
      alCambiar(null);
    },
    fallo,
  };
}

/** Estado que enseña la interfaz: un error de búsqueda manda; si no, lo que diga el arranque. */
export function estadoVisible(estadoResolucion, arranque) {
  if (estadoResolucion) return estadoResolucion;
  if (arranque?.fase === 'cargando') return 'preparando';
  if (arranque?.fase === 'fallo') return 'no_arranca';
  return null;
}

// Las URLs de googlevideo van firmadas: nunca salen del móvil en un informe.
const sinUrls = (texto) => String(texto ?? '').replace(/https?:\/\/\S+/g, '[url]');

/** Rastro corto de los últimos pasos, para que quien sufre el fallo pueda enviarlo copiado. */
export function crearDiagnostico({ max = 40, ahora = () => new Date().toISOString(), entorno = () => '' } = {}) {
  const pasos = [];
  return {
    anotar(paso, detalle = '') {
      pasos.push(`${ahora()} ${paso} ${sinUrls(detalle)}`.trim());
      if (pasos.length > max) pasos.splice(0, pasos.length - max);
    },
    informe: () => [`Musicsippi · ${entorno()}`, ...pasos].join('\n'),
  };
}
