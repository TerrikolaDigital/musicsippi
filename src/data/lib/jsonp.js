// src/data/lib/jsonp.js
// Deezer no manda Access-Control-Allow-Origin (verificado con curl) — un
// fetch() normal es bloqueado por CORS. Deezer sí soporta salida JSONP
// (?output=jsonp&callback=X), que carga vía <script> y no está sujeta a
// CORS (verificado en un navegador real, no solo curl). Un <script> que
// falla no dispara el ciclo de error normal de fetch, por eso el timeout
// manual acá.
let contador = 0;

// Deezer rate-limita por IP: sin este control, una vista que dispara varios
// pedidos en paralelo (ej. "parecidos" resolviendo N artistas con
// Promise.all, o entrar a un artista con álbumes+top+related a la vez) hace
// que empiece a devolver 403 en pedidos sueltos — se ve como "muchos
// artistas generan error en las imágenes" o álbumes que no cargan, aunque la
// URL de la imagen en sí sea válida (confirmado cargándolas directo). Dos
// mitigaciones: cachear por URL (mismo artista/álbum consultado dos veces en
// la sesión no vuelve a pedirlo) y limitar cuántos pedidos van en vuelo a la
// vez, con un pequeño espaciado entre el arranque de cada uno.
const MAX_CONCURRENTES = 3;
const ESPACIADO_MS = 120;
const cache = new Map(); // url -> Promise<data>
const cola = [];
let enVuelo = 0;

function siguiente() {
  if (enVuelo >= MAX_CONCURRENTES || cola.length === 0) return;
  enVuelo++;
  const { url, timeoutMs, resolve, reject } = cola.shift();
  setTimeout(() => {
    ejecutarJsonp(url, timeoutMs).then(resolve, reject).finally(() => {
      enVuelo--;
      siguiente();
    });
  }, ESPACIADO_MS);
}

function ejecutarJsonp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const nombreCallback = `jsonp_callback_${Date.now()}_${contador++}`;
    const script = document.createElement('script');
    let resuelto = false;

    const limpiar = () => {
      delete window[nombreCallback];
      script.remove();
      clearTimeout(temporizador);
    };

    window[nombreCallback] = (data) => {
      resuelto = true;
      limpiar();
      resolve(data);
    };

    const temporizador = setTimeout(() => {
      if (resuelto) return;
      limpiar();
      reject(new Error(`JSONP timeout: ${url}`));
    }, timeoutMs);

    script.onerror = () => {
      if (resuelto) return;
      limpiar();
      reject(new Error(`JSONP error de carga: ${url}`));
    };

    const separador = url.includes('?') ? '&' : '?';
    script.src = `${url}${separador}output=jsonp&callback=${nombreCallback}`;
    document.head.appendChild(script);
  });
}

export function pedidoJsonp(url, timeoutMs = 8000) {
  const cacheado = cache.get(url);
  if (cacheado) return cacheado;

  const promesa = new Promise((resolve, reject) => {
    cola.push({ url, timeoutMs, resolve, reject });
    siguiente();
  });
  // No se cachea el rechazo: si este pedido falló (403, timeout), la próxima
  // vez que se necesite el mismo dato tiene que poder reintentarlo, no
  // quedar pegado a un error viejo para siempre.
  promesa.catch(() => cache.delete(url));
  cache.set(url, promesa);
  return promesa;
}
