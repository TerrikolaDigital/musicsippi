// src/data/useDesfaseLetra.js — desfase manual de la letra de una canción, compartido.
import { useEffect, useState } from 'react';
import { alCambiarDesfase, claveDesfase, guardarDesfase, leerDesfase } from './desfase-letra.js';

export function useDesfaseLetra(track) {
  const clave = claveDesfase(track ?? {});
  const [s, setS] = useState(() => (track ? leerDesfase(track) : 0));
  useEffect(() => {
    if (!track) return undefined;
    setS(leerDesfase(track));
    return alCambiarDesfase((d) => d.clave === clave && setS(d.s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return [s, (v) => track && guardarDesfase(track, v)];
}
