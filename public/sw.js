// Service worker mínimo, solo para habilitar "Instalar app" en el navegador.
//
// A propósito NO intercepta fetch: la app depende de /api/* (biblioteca,
// resolución de YouTube, Deezer) siempre fresco desde el servidor local, y
// cachear esas rutas mostraría datos viejos. Cachear los assets estáticos
// tampoco vale la pena acá porque en dev Vite los sirve como módulos ES
// sueltos con HMR — interceptarlos rompería el hot-reload. Si el día de
// mañana se hace un build de producción real y se quiere soporte offline,
// esto es el lugar para sumar un cache con estrategia network-first.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
