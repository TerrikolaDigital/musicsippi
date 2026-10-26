// src/movil/useImportarOrganizar.js
// Une la interfaz móvil con la importación por enlace y el organizador
// (src/organizador, cargado bajo demanda). Al terminar una pasada recarga la
// biblioteca y los modos desde IndexedDB.
import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerTodos, obtenerValorConfig, guardarValorConfig } from '../data/lib/db.js';
import { contarSinModo } from './inicio.js';
import { estadosAlimentables } from '../organizador/senales-estados.js';
import { RETRASO_ORGANIZAR_AUTO_MS, tocaOrganizarSolo } from './organizarAuto.js';
import { esSegundoPlano } from './avisos.js';
import { CLAVE_INTENTOS_REANUDAR, MAX_INTENTOS_REANUDAR } from '../organizador/sin-modo.js';

const CLAVE_ULTIMA_AUTO = 'ultimaOrganizacionAuto';
const CLAVE_RESTANTES = 'sinModoTrasUltimaPasada';
const FASES_LIBRES = new Set(['inactivo', 'listo', 'error', 'esperando-wifi']);

const RETRASO_REANUDAR_MS = 5000;

export function useImportarOrganizar({ activo, setTracks, setEjes, refrescarMetadata }) {
  const [organizacion, setOrganizacion] = useState({ fase: 'inactivo' });
  const organizador = useRef(null);
  // Petición hecha antes de que el módulo del organizador termine de cargar.
  const pendiente = useRef(null);
  const refrescar = useRef(refrescarMetadata);
  refrescar.current = refrescarMetadata;

  // La última pasada la pidió el usuario (importar, «Usar datos», reintentar): solo esas pintan la barra.
  const manual = useRef(false);

  const lanzar = useCallback((opciones) => {
    manual.current = opciones?.motivo !== 'auto';
    if (!organizador.current) {
      pendiente.current = opciones;
      return;
    }
    Promise.resolve(organizador.current.organizar(opciones)).catch(() =>
      setOrganizacion({ fase: 'error', mensaje: 'No se pudo organizar tu música ahora. Se reintentará la próxima vez que abras la app.' })
    );
  }, []);

  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    let quitar = null;
    let temporizador = null;
    let temporizadorAuto = null;
    import('../organizador/organizador-movil.js').then(({ organizador: org }) => {
      if (!vivo) return;
      organizador.current = org;
      quitar = org.suscribir(async (e) => {
        setOrganizacion(e);
        if (e.fase === 'aplicado' || e.fase === 'listo') {
          const [tracks, ejes] = await Promise.all([obtenerTodos('biblioteca'), obtenerTodos('ejes')]);
          setTracks(tracks);
          setEjes(ejes);
          refrescar.current?.();
          if (e.fase === 'listo') guardarValorConfig(CLAVE_RESTANTES, contarSinModo(tracks)).catch(() => {});
        }
      });
      // No se reanuda en el arranque mismo: la app primero se asienta (si la
      // pasada pendiente cerraba la app, así hay margen para usarla).
      temporizador = setTimeout(() => org.reanudar(), RETRASO_REANUDAR_MS);
      // Organizar solo: poco después de abrir, como mucho cada 6 h, nunca con otra pasada en marcha.
      temporizadorAuto = setTimeout(async () => {
        try {
          const [tracks, ejes, ultimaAuto, restantesTrasUltima, intentos, red] = await Promise.all([
            obtenerTodos('biblioteca'),
            obtenerTodos('ejes'),
            obtenerValorConfig(CLAVE_ULTIMA_AUTO, null),
            obtenerValorConfig(CLAVE_RESTANTES, null),
            obtenerValorConfig(CLAVE_INTENTOS_REANUDAR, 0),
            import('../organizador/organizador-movil.js').then((m) => m.situacionRed()),
          ]);
          const decision = tocaOrganizarSolo({
            sinModo: contarSinModo(tracks),
            estadosAlimentables: estadosAlimentables(ejes).length > 0,
            restantesTrasUltima,
            ahora: Date.now(),
            ultimaAuto,
            organizando: !FASES_LIBRES.has(org.estado().fase),
            bloqueadoPorBucle: intentos >= MAX_INTENTOS_REANUDAR,
            ...red,
          });
          if (!vivo || !decision.organizar) return;
          await guardarValorConfig(CLAVE_ULTIMA_AUTO, Date.now());
          lanzar({ motivo: 'auto' });
        } catch {
          /* organizar solo es un extra: si algo falla, se reintenta en la próxima apertura */
        }
      }, RETRASO_ORGANIZAR_AUTO_MS);
      if (pendiente.current) {
        const opciones = pendiente.current;
        pendiente.current = null;
        lanzar(opciones);
      }
    });
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      clearTimeout(temporizadorAuto);
      quitar?.();
    };
  }, [activo, setTracks, setEjes, lanzar]);

  const leerEnlace = useCallback(async (texto) => {
    const [{ leerEnlace: leer }, { crearHttp }] = await Promise.all([import('../importar/leer.js'), import('../importar/http-nativo.js')]);
    return leer(texto, crearHttp());
  }, []);

  const importarLectura = useCallback(
    async (lectura, { organizar = true, ejeId = null } = {}) => {
      const { importarFilasLocal } = await import('../data/alta-local.js');
      const r = await importarFilasLocal(lectura.filas, { nombrePlaylist: lectura.nombre, origen: lectura.origen, ejeId });
      setTracks(r.tracks);
      setEjes(r.ejes);
      if (organizar) lanzar({ motivo: 'importacion' });
      return r;
    },
    [setTracks, setEjes, lanzar]
  );

  // Música del propio móvil (archivos o carpeta ya leídos por el plugin) y listas M3U/PLS.
  const importarArchivosLocales = useCallback(
    async (entrada) => {
      const { importarArchivosLocales: importar } = await import('./importar/importar-archivos-locales.js');
      const r = await importar(entrada);
      setTracks(r.tracks);
      setEjes(r.ejes);
      if (r.importados > 0) lanzar({ motivo: 'importacion' });
      return r;
    },
    [setTracks, setEjes, lanzar]
  );

  // Al abrir la app: relee las playlists seguidas que toquen (máx. 1 vez/24 h
  // cada una), con cualquier conexión: leer una playlist son pocos KB y la
  // descarga del modelo la frena el organizador (espera WiFi o pide permiso).
  const revisarSeguidas = useCallback(
    async (avisar) => {
      const { comprobarSeguidas, hayConexion } = await import('../importar/seguidas.js');
      return comprobarSeguidas({
        leer: leerEnlace,
        importar: (lectura, seguida) => importarLectura(lectura, { organizar: false, ejeId: seguida?.ejeId ?? null }),
        organizar: lanzar,
        avisar,
        hayRed: async () => hayConexion(),
      });
    },
    [leerEnlace, importarLectura, lanzar]
  );

  const organizarConDatos = useCallback(() => lanzar({ motivo: 'datos', permitirDatos: true }), [lanzar]);
  const reintentarOrganizar = useCallback(() => lanzar({ motivo: 'manual' }), [lanzar]);
  const cerrarAviso = useCallback(() => setOrganizacion({ fase: 'inactivo' }), []);

  const enSegundoPlano = esSegundoPlano(organizacion, manual.current);
  return { organizacion, enSegundoPlano, leerEnlace, importarLectura, importarArchivosLocales, revisarSeguidas, organizarConDatos, reintentarOrganizar, cerrarAviso };
}
