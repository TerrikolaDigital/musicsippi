import { Capacitor } from '@capacitor/core';
import { useYouTube } from './useYouTube.js';
import { useReproductorNativo } from './useReproductorNativo.js';
import { useReproductorIframeAndroid } from './useReproductorIframeAndroid.js';

// Cómo suena la música en la app Android (Capacitor). ÚNICO sitio donde se elige:
//  - 'iframe': el iframe oficial de YouTube (igual que la web) + un player
//    "espejo" nativo que da notificación, foreground y controles de bloqueo.
//    No extrae audio ni toca googlevideo. (Ver docs/app-android.md)
//    Descartado: el iframe se pausa con la pantalla apagada.
//  - 'nativo': ExoPlayer con audio resuelto por InnerTubeX (como BitChord).
export const MODO_AUDIO_ANDROID = 'nativo';

const esAndroid = Capacitor.isNativePlatform();

// Se decide una vez al cargar el módulo (la plataforma no cambia en runtime),
// así App.jsx llama siempre al mismo hook en cada render, como exigen las
// reglas de los hooks. Web y Electron: iframe de YouTube directo.
//
// El reproductor nativo mantiene una cola propia (pista actual + siguientes
// ya resueltas) que App.jsx alimenta con precargarSiguientes; en el iframe
// esa función es un no-op y `hayColaNativa` evita incluso preparar la lista.
export const hayColaNativa = esAndroid && MODO_AUDIO_ANDROID === 'nativo';

export const useReproductor = !esAndroid
  ? useYouTube
  : MODO_AUDIO_ANDROID === 'nativo'
    ? useReproductorNativo
    : useReproductorIframeAndroid;
