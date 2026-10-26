// Una organización a la vez (las peticiones de más se encolan en una), con el
// estado «pendiente» guardado en IndexedDB para retomarla si se cierra la app.
// Fases como el enriquecimiento automático del PC: Deezer → cálculo →
// MusicBrainz (artista, y luego canción/álbum + ritmo) → cálculo (solo si aportaron géneros) →
// alimentar estados (señales: ritmo, etiquetas, parecido, uso).
import { prepararEntrada } from './entrada.js';
import { aplicarResultado } from './aplicar.js';
import { CLAVE_SIN_COLOCAR, CLAVE_INTENTOS_REANUDAR, MAX_INTENTOS_REANUDAR } from './sin-modo.js';

export const CLAVE_PENDIENTE = 'organizacionPendiente';
// Cuántas reanudaciones automáticas seguidas han empezado sin llegar a terminar bien.
// Si la app se cierra siempre en la misma pasada, no se reanuda sola en bucle.
export { CLAVE_INTENTOS_REANUDAR, MAX_INTENTOS_REANUDAR };

function mensajeDeError(e) {
  const detalle = e?.message ?? String(e);
  return `No se pudo terminar de organizar (${detalle}). Tus canciones ya están en la biblioteca; lo intentaré de nuevo la próxima vez.`;
}

async function enSegundoPlano(tarea) {
  try {
    return await tarea();
  } catch {
    return null;
  }
}

export function crearOrganizador({
  almacen,
  fuentes,
  enriquecerDeezer,
  enriquecerMusicbrainz,
  enriquecerRitmo = async () => null,
  enriquecerMusicbrainzDetalle = async () => null,
  completarVectores = async () => null,
  alimentarEstados = async () => null,
  calcular,
  modeloDisponible = async () => true,
  redMedida = () => false,
  puedeCalcular = async () => true,
  ahora = () => Date.now(),
}) {
  const oyentes = new Set();
  let estado = { fase: 'inactivo' };
  let enCurso = null;
  let encolada = null;
  let encoladaOpciones = null;

  function emitir(e) {
    estado = e;
    for (const f of oyentes) f(e);
  }

  async function pasadaDeCalculo(acumulado) {
    const entrada = await prepararEntrada(almacen, fuentes);
    if (entrada.tracks.length === 0) {
      await almacen.guardarValorConfig(CLAVE_SIN_COLOCAR, {});
      return;
    }
    const resultado = await calcular(entrada, { onProgreso: (p) => emitir(p) });
    await almacen.guardarValorConfig(CLAVE_SIN_COLOCAR, resultado.sinColocar ?? {});
    const r = await aplicarResultado(resultado, almacen);
    acumulado.modosNuevos.push(...r.modosNuevos);
    acumulado.colocadas += r.colocadas;
    if (r.modosNuevos.length || r.colocadas) emitir({ fase: 'aplicado', ...r });
  }

  async function ejecutar({ motivo, permitirDatos }) {
    await almacen.guardarValorConfig(CLAVE_PENDIENTE, { motivo, desde: ahora() });
    const acumulado = { modosNuevos: [], colocadas: 0 };
    const progresoGeneros = (hechas, total) => emitir({ fase: 'generos', hechas, total });
    try {
      emitir({ fase: 'generos', hechas: 0, total: 0 });
      await enriquecerDeezer({ onProgreso: progresoGeneros });
      // La primera vez hay que descargar ~160 MB: con datos móviles, solo con permiso.
      if (!permitirDatos && (await redMedida()) && !(await modeloDisponible())) {
        const e = { fase: 'esperando-wifi' };
        emitir(e);
        return e;
      }
      if (!(await puedeCalcular())) {
        const e = { fase: 'inactivo' };
        emitir(e);
        return e;
      }
      await pasadaDeCalculo(acumulado);
      const mb = await enriquecerMusicbrainz({ onProgreso: progresoGeneros });
      // Lo que sigue es opcional: si falla (red caída), no tumba la organización.
      const detalle = await enSegundoPlano(() => enriquecerMusicbrainzDetalle({ onProgreso: progresoGeneros }));
      await enSegundoPlano(() => enriquecerRitmo({ onProgreso: progresoGeneros }));
      if (mb?.conGeneros > 0 || detalle?.conGeneros > 0) await pasadaDeCalculo(acumulado);
      // Vectores de toda la biblioteca (para «parecido»): una vez, por lotes y reanudable; luego solo las nuevas.
      if (await puedeCalcular()) await enSegundoPlano(() => completarVectores({ onProgreso: progresoGeneros }));
      const estados = await enSegundoPlano(() => alimentarEstados());
      acumulado.estadosAlimentados = estados?.agregadas ?? 0;
      await almacen.guardarValorConfig(CLAVE_PENDIENTE, null);
      await almacen.guardarValorConfig(CLAVE_INTENTOS_REANUDAR, 0);
      const fin = { fase: 'listo', modosNuevos: acumulado.modosNuevos, colocadas: acumulado.colocadas, estadosAlimentados: acumulado.estadosAlimentados ?? 0 };
      emitir(fin);
      return fin;
    } catch (e) {
      const error = { fase: 'error', mensaje: mensajeDeError(e) };
      emitir(error);
      return error;
    }
  }

  function organizar(opciones = {}) {
    const o = { motivo: 'manual', permitirDatos: false, ...opciones };
    if (enCurso) {
      // Las peticiones de más se juntan; si alguna trae permiso de datos, se conserva.
      encoladaOpciones = { ...o, permitirDatos: o.permitirDatos || !!encoladaOpciones?.permitirDatos };
      encolada ??= enCurso.then(() => {
        const opciones = encoladaOpciones;
        encolada = null;
        encoladaOpciones = null;
        return organizar(opciones);
      });
      return encolada;
    }
    enCurso = ejecutar(o).finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  async function reanudar() {
    const pendiente = await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null);
    if (!pendiente) return null;
    const intentos = await almacen.obtenerValorConfig(CLAVE_INTENTOS_REANUDAR, 0);
    if (intentos >= MAX_INTENTOS_REANUDAR) {
      const e = {
        fase: 'error',
        reintentar: true,
        mensaje: 'La organización se interrumpió varias veces seguidas, así que no la reanudo sola. Tus canciones ya están en la biblioteca.',
      };
      emitir(e);
      return e;
    }
    // Se cuenta ANTES de empezar: si la app se cierra a mitad, el intento ya consta.
    await almacen.guardarValorConfig(CLAVE_INTENTOS_REANUDAR, intentos + 1);
    return organizar({ motivo: 'reanudar' });
  }

  return {
    organizar,
    reanudar,
    suscribir(fn) {
      oyentes.add(fn);
      fn(estado);
      return () => oyentes.delete(fn);
    },
    estado: () => estado,
  };
}
