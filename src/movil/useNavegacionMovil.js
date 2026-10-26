// src/movil/useNavegacionMovil.js
// Une navegacion.js con el historial del navegador: cada paso hacia dentro
// (pantalla o capa) añade una entrada, así el botón/gesto «atrás» de Android
// llega como popstate y cierra lo más alto en vez de salir de la app.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { deltaHistorial, entradasSobrantes, estadoInicial, navegar, pantallaActual } from './navegacion.js';

export function useNavegacionMovil() {
  const [estado, despachar] = useReducer(navegar, undefined, estadoInicial);

  // El retroceso que hacemos nosotros (history.go) no es un «atrás» del usuario.
  const retrocesoPropio = useRef(false);

  useEffect(() => {
    const alVolver = () => {
      if (retrocesoPropio.current) {
        retrocesoPropio.current = false;
        return;
      }
      despachar({ tipo: 'atras' });
    };
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const empujar = useCallback((accion) => {
    window.history.pushState({ musicsippi: true }, '');
    despachar(accion);
  }, []);

  return {
    estado,
    pestana: estado.pestana,
    pantalla: pantallaActual(estado),
    capas: estado.capas,
    // Salir de Inicio a otra pestaña deja una entrada: así «atrás» vuelve a
    // Inicio en vez de cerrar la app. Entre pestañas que no son Inicio no se
    // apila (si no, «atrás» recorrería todas las pestañas visitadas).
    // Las pantallas de cada pestaña se recuerdan: al volver se reañaden sus entradas de historial;
    // las capas y lo que se deja de ver se retroceden.
    irAPestana: (pestana, { raiz = false } = {}) => {
      const accion = { tipo: 'pestana', pestana, raiz };
      const delta = deltaHistorial(estado, accion);
      if (delta > 0) {
        for (let i = 0; i < delta; i++) window.history.pushState({ musicsippi: true }, '');
      } else if (delta < 0) {
        retrocesoPropio.current = true;
        window.history.go(delta);
      }
      despachar(accion);
    },
    // Abrir una pantalla desde una capa (p. ej. «Ir al artista» en la hoja ⋯)
    // cierra las capas: una entrada del historial se reutiliza y las demás se
    // retroceden, para no dejar entradas muertas que obliguen a pulsar «atrás» de más.
    abrir: (pantalla) => {
      if (estado.capas.length) {
        const sobran = entradasSobrantes(estado);
        if (sobran > 0) {
          retrocesoPropio.current = true;
          window.history.go(-sobran);
        } else {
          window.history.replaceState({ musicsippi: true }, '');
        }
        despachar({ tipo: 'abrir', pantalla });
      } else {
        empujar({ tipo: 'abrir', pantalla });
      }
    },
    abrirCapa: (capa) => empujar({ tipo: 'capa', capa }),
    // Cambiar la vista de una capa ya abierta (portada → letra) o cambiar la capa
    // más alta por otra: no añade entrada al historial, así «atrás» no se desfasa.
    cambiarCapa: (capa) => despachar({ tipo: 'capa', capa }),
    sustituirCapa: (capa) => despachar({ tipo: 'sustituir', capa }),
    // Cierra una capa que acumuló `entradas` entradas de historial (la bienvenida
    // añade una por pantalla): se retroceden todas de una vez y no sobra ninguna.
    cerrarCapaTipo: (capaTipo, entradas = 1) => {
      if (entradas > 0) {
        retrocesoPropio.current = true;
        window.history.go(-entradas);
      }
      despachar({ tipo: 'quitar-capa', capaTipo });
    },
    // Botones «←» / cerrar: pasan por el historial para que quede coherente.
    atras: () => window.history.back(),
  };
}
