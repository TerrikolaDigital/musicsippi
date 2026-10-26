import { useEffect, useRef, useCallback } from 'react';
import { registerPlugin } from '@capacitor/core';
import { useYouTube } from './useYouTube.js';

/**
 * Reproductor de la app Android en "modo iframe" (opción A): el audio lo sigue
 * sonando el iframe oficial de YouTube (useYouTube, exactamente igual que en la
 * web) y, además, se publica su estado a un player "espejo" nativo
 * (ReproductorEspejo/ServicioEspejo, ver android/.../reproductor/). El espejo
 * no reproduce nada: sirve para que Android mantenga un servicio foreground con
 * notificación (el proceso y el WebView no se congelan con la pantalla
 * bloqueada) y para exponer los controles de pantalla de bloqueo / Bluetooth,
 * cuyas órdenes vuelven aquí como evento 'comando'.
 *
 * No se pide nada a googlevideo ni se extrae audio: solo el reproductor
 * embebido oficial.
 */

const ReproductorNativo = registerPlugin('ReproductorNativo');

// Tras pausar/cambiar de pista, cuánto se espera antes de dar por terminada la
// "intención de sonar" (mantiene la notificación y los bloqueos en el hueco
// entre una canción y la siguiente).
const GRACIA_INTENCION_MS = 8000;
const PERIODO_POSICION_MS = 1500;

// ---- Puente con App.jsx (misma superficie que expone Electron) -------------
const metaActual = { titulo: '', artista: '', portadaUrl: null, hayTrack: false };
const oyentesComando = new Set();
const oyentesMeta = new Set();
let puenteInstalado = false;

function instalarPuente() {
  if (puenteInstalado || typeof window === 'undefined' || window.musicsippi) return;
  puenteInstalado = true;
  window.musicsippi = {
    publicarEstado(estado) {
      const portadaUrl = typeof estado?.cover === 'string' && estado.cover.startsWith('http') ? estado.cover : null;
      const nueva = {
        titulo: estado?.titulo ?? '',
        artista: estado?.artista ?? '',
        portadaUrl,
        hayTrack: Boolean(estado?.hayTrack),
      };
      const cambio = Object.keys(nueva).some((k) => nueva[k] !== metaActual[k]);
      if (!cambio) return; // `sonando` también dispara esto
      Object.assign(metaActual, nueva);
      oyentesMeta.forEach((cb) => cb());
    },
    alRecibirComando(callback) {
      oyentesComando.add(callback);
      return () => oyentesComando.delete(callback);
    },
  };
}

export function useReproductorIframeAndroid(alTerminar, alFallarVideo, alAvanzarNativo) {
  const yt = useYouTube(alTerminar, alFallarVideo, alAvanzarNativo);
  const { sonando, tiempo, duracion, alternarPausa, pausar, buscar } = yt;

  // Último estado visto, para que los callbacks y el temporizador no dependan
  // del render.
  const sonandoRef = useRef(sonando);
  const tiempoRef = useRef(tiempo);
  const duracionRef = useRef(duracion);
  const intencionRef = useRef(false); // "se quiere sonar" (con gracia entre pistas)
  const temporizadorGraciaRef = useRef(null);
  const ytRef = useRef({ alternarPausa, pausar, buscar });
  sonandoRef.current = sonando;
  tiempoRef.current = tiempo;
  duracionRef.current = duracion;
  ytRef.current = { alternarPausa, pausar, buscar };

  const empujar = useCallback(() => {
    if (!metaActual.hayTrack) return;
    const intencion = intencionRef.current;
    ReproductorNativo.espejoActualizar({
      sonando: intencion,
      // Quiere sonar pero el iframe aún no suena: "cargando" (no se baja el
      // foreground en el hueco entre canciones).
      estado: intencion && !sonandoRef.current ? 'cargando' : 'listo',
      posicionMs: Math.round(tiempoRef.current * 1000),
      duracionMs: Math.round(duracionRef.current * 1000),
      titulo: metaActual.titulo,
      artista: metaActual.artista,
      portadaUrl: metaActual.portadaUrl,
      haySiguiente: true, // la cola de App.jsx es circular
      hayAnterior: true,
    }).catch(() => {});
  }, []);

  // Intención de sonar: sube al instante, baja tras un periodo de gracia.
  useEffect(() => {
    if (sonando) {
      clearTimeout(temporizadorGraciaRef.current);
      intencionRef.current = true;
      empujar();
    } else if (intencionRef.current) {
      empujar(); // pasa a "cargando" sin soltar el foreground
      clearTimeout(temporizadorGraciaRef.current);
      temporizadorGraciaRef.current = setTimeout(() => {
        intencionRef.current = false;
        empujar();
      }, GRACIA_INTENCION_MS);
    }
  }, [sonando, empujar]);

  // Duración conocida (cambia al cargar cada pista).
  useEffect(() => {
    empujar();
  }, [duracion > 0, empujar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Metadatos publicados por App.jsx.
  useEffect(() => {
    instalarPuente();
    const alCambiarMeta = () => empujar();
    oyentesMeta.add(alCambiarMeta);
    return () => oyentesMeta.delete(alCambiarMeta);
  }, [empujar]);

  // Posición cada ~1,5 s mientras se quiere sonar.
  useEffect(() => {
    const t = setInterval(() => {
      if (intencionRef.current) empujar();
    }, PERIODO_POSICION_MS);
    return () => clearInterval(t);
  }, [empujar]);

  // Órdenes de la notificación / pantalla de bloqueo / Bluetooth.
  useEffect(() => {
    let alta = null;
    let cancelado = false;
    ReproductorNativo.addListener('comando', ({ accion, ms }) => {
      const yt = ytRef.current;
      switch (accion) {
        case 'play':
          intencionRef.current = true;
          if (!sonandoRef.current) yt.alternarPausa();
          break;
        case 'pause':
          intencionRef.current = false;
          clearTimeout(temporizadorGraciaRef.current);
          if (sonandoRef.current) yt.pausar();
          empujar();
          break;
        case 'buscar':
          yt.buscar((ms ?? 0) / 1000);
          break;
        case 'siguiente':
        case 'anterior':
          intencionRef.current = true; // la pista nueva debe seguir sonando
          oyentesComando.forEach((cb) => cb(accion));
          break;
        default:
      }
    }).then((h) => {
      if (cancelado) h.remove();
      else alta = h;
    });
    return () => {
      cancelado = true;
      alta?.remove();
    };
  }, [empujar]);

  // Limpieza al desmontar: no dejar notificación huérfana.
  useEffect(
    () => () => {
      clearTimeout(temporizadorGraciaRef.current);
      ReproductorNativo.espejoDetener().catch(() => {});
    },
    []
  );

  return yt;
}
