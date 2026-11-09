// src/movil/portadaPlaceholder.js
// Deezer devuelve, para álbumes sin carátula, la dirección de siempre pero con una imagen gris genérica (un disco):
// la dirección «parece» válida, carga bien y por eso no salta ningún respaldo. La CDN redirige esas direcciones a una
// ruta con el hash del texto vacío, y permite leer la dirección final (CORS abierto), así que con un HEAD se detecta.
// El resultado se recuerda por hash (memoria y localStorage) para no repetir la consulta.
const GENERICA = 'd41d8cd98f00b204e9800998ecf8427e';
const CLAVE = 'ms-portadas-deezer-v1';
const HASH = /\/cover\/([0-9a-f]{32})\//;

const memoria = new Map(); // hash → Promise<boolean>
let guardado = { grises: [], buenas: [] };
try {
  const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
  if (g && Array.isArray(g.grises) && Array.isArray(g.buenas)) guardado = g;
} catch {
  // sin almacenamiento: solo memoria
}
for (const h of guardado.grises) memoria.set(h, Promise.resolve(true));
for (const h of guardado.buenas) memoria.set(h, Promise.resolve(false));

// Como mucho 3 comprobaciones a la vez: en listas largas no se compite con la descarga de las propias portadas.
const MAX_A_LA_VEZ = 3;
const espera = [];
let activas = 0;
function enCola(tarea) {
  return new Promise((resolver) => {
    espera.push(() => {
      activas++;
      tarea()
        .then(resolver, () => resolver(false))
        .finally(() => {
          activas--;
          sacar();
        });
    });
    sacar();
  });
}
function sacar() {
  while (activas < MAX_A_LA_VEZ && espera.length) espera.shift()();
}

let guardando = null;
function recordar(hash, gris) {
  (gris ? guardado.grises : guardado.buenas).push(hash);
  // Se guarda de golpe cada par de segundos, no en cada comprobación (en listas largas serían miles de escrituras).
  if (guardando) return;
  guardando = setTimeout(() => {
    guardando = null;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(guardado));
    } catch {
      // lleno o bloqueado: no pasa nada
    }
  }, 2500);
}

/** ¿Es la carátula gris genérica de Deezer? false si no es de Deezer o no se puede comprobar (sin red). */
export function esPortadaGenerica(url, pedir = (u) => fetch(u, { method: 'HEAD' })) {
  if (typeof url !== 'string') return Promise.resolve(false);
  const hash = url.match(HASH)?.[1];
  if (!hash || !url.includes('dzcdn.net')) return Promise.resolve(false);
  if (hash === GENERICA) return Promise.resolve(true);
  if (memoria.has(hash)) return memoria.get(hash);
  const p = enCola(() =>
    Promise.resolve()
      .then(() => pedir(url))
      .then((r) => {
        const gris = String(r?.url ?? '').includes(GENERICA);
        recordar(hash, gris);
        return gris;
      })
      .catch(() => {
        memoria.delete(hash); // fallo de red: se reintentará la próxima vez
        return false;
      }),
  );
  memoria.set(hash, p);
  return p;
}
