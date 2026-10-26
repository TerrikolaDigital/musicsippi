// Descubrimiento deliberadamente estrecho: última IP y, si cae, únicamente el
// /24 que el usuario ya emparejó. Nunca empareja ni muestra errores por sí solo.
import { crearClienteArchivos } from './transferir-archivos-locales.js';

export async function descubrirPC({ direccion, clave, probar } = {}) {
  if (!direccion || !clave) return null;
  const [ip, puerto] = direccion.split(':');
  const partes = ip?.split('.');
  if (partes?.length !== 4 || !/^\d+$/.test(puerto ?? '')) return null;
  const intentar = probar ?? (async (d) => {
    const api = crearClienteArchivos(`http://${d}`, clave);
    await api.saludar(d);
    return d;
  });
  try { return await intentar(direccion); } catch { /* se prueba la subred conocida */ }
  const prefijo = partes.slice(0, 3).join('.');
  const ultimo = Number(partes[3]);
  for (let n = 1; n < 255; n += 1) {
    if (n === ultimo) continue;
    const candidata = `${prefijo}.${n}:${puerto}`;
    try { return await intentar(candidata); } catch { /* PC no está en esa IP */ }
  }
  return null;
}
