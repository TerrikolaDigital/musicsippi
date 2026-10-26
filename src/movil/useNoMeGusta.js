// src/movil/useNoMeGusta.js
// Lista de «No me gusta» persistida en IndexedDB (clave `noMeGusta` de configuración).
// Solo en el móvil: el PC no tiene endpoint para recibirla, así que no entra en el journal.
import { useCallback, useEffect, useRef, useState } from 'react';
import { guardarValorConfig, obtenerValorConfig } from '../data/lib/db.js';
import { CLAVE_CONFIG, agregarMarca, quitarMarca } from './noMeGusta.js';

export function useNoMeGusta() {
  const [marcas, setMarcas] = useState([]);
  const ref = useRef([]);

  const fijar = useCallback((siguiente) => {
    ref.current = siguiente;
    setMarcas(siguiente);
    guardarValorConfig(CLAVE_CONFIG, siguiente).catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    obtenerValorConfig(CLAVE_CONFIG, [])
      .then((guardadas) => {
        if (!vivo || !Array.isArray(guardadas)) return;
        // Lo marcado antes de terminar de leer se conserva.
        const unidas = ref.current.reduce((acc, m) => agregarMarca(acc, m, m.fecha), guardadas);
        ref.current = unidas;
        setMarcas(unidas);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  /** Marca y devuelve la marca guardada (con su fecha). */
  const marcar = useCallback(
    (entrada) => {
      fijar(agregarMarca(ref.current, entrada));
      return ref.current.find((m) => m.tipo === entrada.tipo && m.clave === entrada.clave);
    },
    [fijar],
  );
  const quitar = useCallback((tipo, clave) => fijar(quitarMarca(ref.current, tipo, clave)), [fijar]);

  return { marcas, marcar, quitar };
}
