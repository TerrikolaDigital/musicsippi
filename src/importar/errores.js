// Errores de la importación por enlace: un código estable (para decidir qué
// hacer) y el mensaje que ve el usuario (en `message`).
const MENSAJES = {
  'no-reconocido':
    'No reconozco ese enlace. Pega el enlace de una playlist pública de Spotify, YouTube Music o Deezer.',
  privada: 'No se puede leer esa playlist: puede que sea privada o que ya no exista. Hazla pública o prueba con otra.',
  vacia: 'Esa playlist no tiene canciones que se puedan importar.',
  'sin-red': 'No hay conexión. Comprueba el WiFi o los datos e inténtalo de nuevo.',
  'formato-cambiado':
    'El servicio ha cambiado su formato y no se pudo leer la playlist. Prueba más tarde o comparte la playlist desde otra app.',
  'amazon-login': 'Amazon Music no permite leer la lista sin iniciar sesión; expórtala con TuneMyMusic.',
};

export function mensajeError(codigo) {
  return MENSAJES[codigo] ?? 'No se pudo importar la playlist.';
}

export class ErrorImportar extends Error {
  constructor(codigo, detalle) {
    super(mensajeError(codigo));
    this.name = 'ErrorImportar';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export function jsonDe(respuesta) {
  try {
    return JSON.parse(respuesta?.texto ?? '');
  } catch {
    throw new ErrorImportar('formato-cambiado', 'la respuesta no es JSON');
  }
}
