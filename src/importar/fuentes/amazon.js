// Amazon Music no expone las pistas de sus listas públicas sin una sesión.
// Mantener este lector separado permite dar una salida útil, en lugar de
// confundir ese bloqueo con un fallo de red o un enlace inválido.
import { ErrorImportar } from '../errores.js';

export async function leerPlaylist(_url, _http) {
  throw new ErrorImportar('amazon-login');
}
