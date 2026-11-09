// src/movil/useSaltos.js
// Saltos rápidos: cuenta cuántas veces se salta cada canción tras oírla poco y, al llegar al
// umbral, la marca como «No me gusta» (origen `saltos`). Persiste el contador y los artistas
// rechazados en IndexedDB (solo móvil, como `useNoMeGusta`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { guardarValorConfig, obtenerValorConfig } from '../data/lib/db.js';
import { coincideEntrada, entradaArtista, entradaCancion } from './noMeGusta.js';
import { norm } from './inicio/claves.js';
import { CLAVE_SALTOS, SALTOS_MARCAN, artistasAPreguntar, esSaltoRapido, reiniciaPorEscucha, registrarSalto, reiniciarCancion } from './saltos.js';

export const CLAVE_RECHAZADOS = 'artistasRechazados';

const esFavorita = (t) => Array.isArray(t?.ejes) && t.ejes.some((e) => e.ejeId === 'favoritos');

export function useSaltos({ marcas = [], marcar, alternarFavorito, quitarDeColaFutura }) {
  // Siempre lo último recibido, sin obligar a quien llama a memoizar.
  const props = useRef({});
  props.current = { marcas, marcar, alternarFavorito, quitarDeColaFutura };

  const estado = useRef({ canciones: {} });
  const [rechazados, setRechazados] = useState({});
  const rechazadosRef = useRef({});
  const cargado = useRef(Promise.resolve());
  const escrituras = useRef(Promise.resolve());

  // Las escrituras van en cola, con lo último que haya en memoria: dos saltos seguidos no se pisan,
  // y ninguna escribe antes de terminar la lectura inicial.
  const persistir = useCallback(() => {
    escrituras.current = escrituras.current
      .then(() => cargado.current)
      .then(() => Promise.all([
        guardarValorConfig(CLAVE_SALTOS, estado.current),
        guardarValorConfig(CLAVE_RECHAZADOS, rechazadosRef.current),
      ]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    cargado.current = Promise.all([obtenerValorConfig(CLAVE_SALTOS, null), obtenerValorConfig(CLAVE_RECHAZADOS, null)])
      .then(([guardado, rech]) => {
        if (!vivo) return;
        // Lo anotado antes de terminar de leer manda sobre lo guardado.
        if (guardado && typeof guardado === 'object') {
          estado.current = { ...guardado, canciones: { ...(guardado.canciones ?? {}), ...estado.current.canciones } };
        }
        if (rech && typeof rech === 'object' && !Array.isArray(rech)) {
          rechazadosRef.current = { ...rech, ...rechazadosRef.current };
          setRechazados(rechazadosRef.current);
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const anotarSalto = useCallback((track, segundos, ahora = Date.now()) => {
    if (!SALTOS_MARCAN || !track || !esSaltoRapido(segundos)) return;
    const r = registrarSalto(estado.current, track, ahora);
    estado.current = r.estado;
    if (r.marcar) {
      const entrada = entradaCancion(track);
      const { marcas: actuales, marcar: marcarNMG, alternarFavorito: fav, quitarDeColaFutura: quitarCola } = props.current;
      const yaEstaba = (actuales ?? []).some((m) => m.tipo === 'cancion' && m.clave === entrada.clave);
      if (!yaEstaba) {
        const eraFavorita = esFavorita(track);
        const trackId = track.trackIdReal ?? track.id;
        marcarNMG({ ...entrada, origen: 'saltos', artista: track.artista, trackId, ...(eraFavorita ? { eraFavorita: true } : {}) });
        quitarCola?.(track);
        if (eraFavorita) Promise.resolve(fav?.(trackId, false)).catch(() => {});
      }
      estado.current = reiniciarCancion(estado.current, track);
    }
    persistir();
  }, [persistir]);

  const anotarOida = useCallback((track, fraccion) => {
    if (!track || !reiniciaPorEscucha(fraccion)) return;
    estado.current = reiniciarCancion(estado.current, track);
    persistir();
  }, [persistir]);

  const preguntaArtista = useMemo(() => (SALTOS_MARCAN ? artistasAPreguntar(marcas, rechazados)[0] : null) ?? null, [marcas, rechazados]);

  const responderArtista = useCallback((si) => {
    if (!preguntaArtista) return;
    if (si) {
      const entrada = entradaArtista(preguntaArtista.nombre);
      props.current.marcar(entrada);
      props.current.quitarDeColaFutura?.(entrada);
    } else {
      rechazadosRef.current = { ...rechazadosRef.current, [norm(preguntaArtista.nombre)]: preguntaArtista.n };
      setRechazados(rechazadosRef.current);
      persistir();
    }
  }, [preguntaArtista, persistir]);

  return { anotarSalto, anotarOida, preguntaArtista, responderArtista };
}
