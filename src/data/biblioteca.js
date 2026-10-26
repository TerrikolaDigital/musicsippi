// src/data/biblioteca.js
import { MODO_LOCAL } from '../config/modo.js';
import * as servidor from './biblioteca-servidor.js';
import * as local from './biblioteca-local.js';
import { envolverMutador } from './respuesta-local.js';

// En modo local los mutadores devuelven datos, no una Response: se adaptan para
// que App.jsx (que hace `r.ok` / `r.json()`) funcione igual que con fetch.
const impl = MODO_LOCAL
  ? {
      ...local,
      asignarEje: envolverMutador(local.asignarEje),
      quitarModo: envolverMutador(local.quitarModo),
      quitarTrack: envolverMutador(local.quitarTrack),
      unirModos: envolverMutador(local.unirModos),
      guardarColeccion: envolverMutador(local.guardarColeccion),
      guardarEjes: envolverMutador(local.guardarEjes),
      guardarOverride: envolverMutador(local.guardarOverride),
    }
  : servidor;

export const asignarEje = impl.asignarEje;
export const quitarModo = impl.quitarModo;
export const obtenerMetadata = impl.obtenerMetadata;
export const obtenerOverrides = impl.obtenerOverrides;
export const obtenerFavoritos = impl.obtenerFavoritos;
export const guardarFavoritoArtista = impl.guardarFavoritoArtista;
export const guardarFavoritoAlbum = impl.guardarFavoritoAlbum;
export const guardarOverride = impl.guardarOverride;
export const quitarTrack = impl.quitarTrack;
export const unirModos = impl.unirModos;
export const guardarColeccion = impl.guardarColeccion;
export const guardarEjes = impl.guardarEjes;
// Solo móvil: biblioteca y modos guardados en el dispositivo (null en escritorio,
// donde mandan los JSON del servidor).
export const cargarDatosLocales = MODO_LOCAL ? local.cargarDatosLocales : async () => null;
