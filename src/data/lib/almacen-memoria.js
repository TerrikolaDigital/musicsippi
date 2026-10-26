// Doble de pruebas de db.js (misma interfaz) para los tests con node --test:
// guarda copias, como IndexedDB, para que mutar lo leído no cambie lo guardado.
const CLAVES = {
  biblioteca: 'id',
  ejes: 'id',
  overrides: 'trackId',
  cacheYoutube: 'trackId',
  metadataLocal: 'trackId',
  generos: 'trackId',
  vectores: 'trackId',
  configuracion: 'clave',
  seguidas: 'clave',
  archivosLocales: 'id',
};

export function crearAlmacenMemoria(inicial = {}) {
  const stores = new Map(Object.keys(CLAVES).map((n) => [n, new Map()]));
  const copia = (v) => structuredClone(v);
  const poner = (n, v) => stores.get(n).set(v[CLAVES[n]], copia(v));
  for (const [n, registros] of Object.entries(inicial)) for (const r of registros) poner(n, r);
  return {
    async obtenerTodos(n) {
      return [...stores.get(n).values()].map(copia);
    },
    async obtenerPorClave(n, clave) {
      const v = stores.get(n).get(clave);
      return v === undefined ? undefined : copia(v);
    },
    async guardarRegistro(n, v) {
      poner(n, v);
    },
    async guardarVarios(n, valores) {
      for (const v of valores) poner(n, v);
    },
    async borrarRegistro(n, clave) {
      stores.get(n).delete(clave);
    },
    async borrarVarios(n, claves) {
      for (const c of claves) stores.get(n).delete(c);
    },
    async obtenerValorConfig(clave, porDefecto) {
      const r = stores.get('configuracion').get(clave);
      return r ? copia(r.valor) : porDefecto;
    },
    async guardarValorConfig(clave, valor) {
      poner('configuracion', { clave, valor });
    },
  };
}
