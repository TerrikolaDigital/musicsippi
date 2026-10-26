import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearOrganizador, CLAVE_PENDIENTE } from './coordinador.js';
import { crearAlmacenMemoria } from '../data/lib/almacen-memoria.js';

const fuentes = { vocabulario: { sinonimos: {}, patronesTitulo: [], nombresHumanos: {} }, umbrales: { masaMinima: 25, masaMinimaPorcentaje: 0.03 } };
const almacenBase = () =>
  crearAlmacenMemoria({
    biblioteca: ['t1', 't2'].map((id) => ({ id, artista: id, titulo: id, fuentes: ['movil'], ejes: [{ ejeId: 'sin-clasificar', origen: 'auto', senal: 'ninguna', score: 0 }] })),
    ejes: [{ id: 'sin-clasificar', nombre: 'Sin clasificar', tipo: 'sistema', orden: 999, activo: true, sistema: true }],
  });
// Cálculo simulado: todo lo «Sin clasificar» va a «Rock».
const calcularRock = async (entrada) => ({
  modosConfirmados: entrada.tracks.length ? [{ nombre: 'Rock', trackIds: entrada.tracks.map((t) => t.id) }] : [],
  senalPorTrack: {},
  vectoresNuevos: [],
});
const enriquecerNada = async () => ({ procesadas: 0, conGeneros: 0 });

function crear(almacen, extra = {}) {
  return crearOrganizador({ almacen, fuentes, enriquecerDeezer: enriquecerNada, enriquecerMusicbrainz: enriquecerNada, calcular: calcularRock, ...extra });
}

test('organiza: crea los modos, avisa del progreso y deja de estar pendiente', async () => {
  const almacen = almacenBase();
  const org = crear(almacen);
  const fases = [];
  org.suscribir((e) => fases.push(e.fase));
  const r = await org.organizar({ motivo: 'importacion' });
  assert.equal(r.fase, 'listo');
  assert.deepEqual(r.modosNuevos, [{ id: 'rock', nombre: 'Rock' }]);
  assert.equal(r.colocadas, 2);
  assert.deepEqual(fases, ['inactivo', 'generos', 'aplicado', 'listo']);
  assert.equal(await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null), null);
});

test('un fallo deja la organización pendiente y reanudar la completa', async () => {
  const almacen = almacenBase();
  let fallar = true;
  const calcular = async (entrada) => {
    if (fallar) throw new Error('el modelo no se pudo descargar');
    return calcularRock(entrada);
  };
  const org = crear(almacen, { calcular });
  const r1 = await org.organizar({ motivo: 'importacion' });
  assert.equal(r1.fase, 'error');
  assert.match(r1.mensaje, /Tus canciones ya están en la biblioteca|lo intentaré/);
  assert.ok(await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null));
  assert.equal((await almacen.obtenerTodos('ejes')).length, 1, 'sin modos a medias');

  fallar = false;
  const otraSesion = crear(almacen, { calcular });
  const r2 = await otraSesion.reanudar();
  assert.equal(r2.fase, 'listo');
  assert.equal(await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null), null);
  const cambios = await almacen.obtenerValorConfig('cambiosPendientes', []);
  assert.equal(cambios.filter((c) => c.endpoint === 'confirmar-modos').length, 1);
  assert.equal(await crear(almacen).reanudar(), null, 'sin nada pendiente no hace nada');
});

test('dos peticiones seguidas no calculan a la vez y la segunda también se hace', async () => {
  const almacen = almacenBase();
  let enCurso = 0;
  let maximo = 0;
  let ejecuciones = 0;
  const calcular = async (entrada) => {
    enCurso++;
    maximo = Math.max(maximo, enCurso);
    await new Promise((r) => setTimeout(r, 5));
    enCurso--;
    return calcularRock(entrada);
  };
  const enriquecerDeezer = async () => {
    ejecuciones++;
    return { procesadas: 0, conGeneros: 0 };
  };
  const org = crear(almacen, { calcular, enriquecerDeezer });
  await Promise.all([org.organizar(), org.organizar(), org.organizar()]);
  assert.equal(maximo, 1);
  assert.equal(ejecuciones, 2, 'las peticiones de más se juntan en una sola ejecución posterior');
});

test('con red medida y sin modelo espera WiFi; con permiso descarga y organiza', async () => {
  const almacen = almacenBase();
  let calculos = 0;
  const calcular = async (e) => {
    calculos++;
    return calcularRock(e);
  };
  const org = crear(almacen, { calcular, redMedida: () => true, modeloDisponible: async () => false });
  const r1 = await org.organizar({ motivo: 'importacion' });
  assert.equal(r1.fase, 'esperando-wifi');
  assert.equal(calculos, 0);
  assert.ok(await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null));
  const r2 = await org.organizar({ permitirDatos: true });
  assert.equal(r2.fase, 'listo');
  assert.equal(calculos, 1);
});

test('si MusicBrainz aporta géneros, hay una segunda pasada de cálculo', async () => {
  const almacen = almacenBase();
  let calculos = 0;
  const calcular = async () => {
    calculos++;
    return { modosConfirmados: [], senalPorTrack: {}, vectoresNuevos: [] };
  };
  await crear(almacen, { calcular, enriquecerMusicbrainz: async () => ({ procesadas: 2, conGeneros: 1 }) }).organizar();
  assert.equal(calculos, 2);
});

test('las peticiones juntadas conservan el permiso de datos de cualquiera de ellas', async () => {
  const almacen = almacenBase();
  const org = crear(almacen, { redMedida: () => true, modeloDisponible: async () => false });
  const [primera, juntada] = await Promise.all([org.organizar(), org.organizar({ permitirDatos: true }), org.organizar()]);
  assert.equal(primera.fase, 'esperando-wifi');
  assert.equal(juntada.fase, 'listo');
});

test('con 2 reanudaciones seguidas sin terminar no se reanuda sola y ofrece reintentar', async () => {
  const almacen = almacenBase();
  const falla = async () => { throw new Error('se cierra'); };
  await crear(almacen, { calcular: falla }).organizar({ motivo: 'importacion' });
  assert.equal((await crear(almacen, { calcular: falla }).reanudar()).fase, 'error');
  assert.equal((await crear(almacen, { calcular: falla }).reanudar()).fase, 'error');
  assert.equal(await almacen.obtenerValorConfig('intentosReanudar', 0), 2);
  let calculos = 0;
  const org = crear(almacen, { calcular: async (e) => { calculos++; return calcularRock(e); } });
  const bloqueo = await org.reanudar();
  assert.equal(bloqueo.reintentar, true);
  assert.equal(calculos, 0);
  // «Reintentar organizar» (manual) sí corre y al terminar bien reinicia el contador.
  assert.equal((await org.organizar({ motivo: 'manual' })).fase, 'listo');
  assert.equal(await almacen.obtenerValorConfig('intentosReanudar', 0), 0);
  assert.equal(await almacen.obtenerValorConfig(CLAVE_PENDIENTE, null), null);
});

test('el intento se cuenta antes de reanudar (un cierre a mitad ya consta)', async () => {
  const almacen = almacenBase();
  await almacen.guardarValorConfig(CLAVE_PENDIENTE, { motivo: 'x', desde: 1 });
  let visto = null;
  const org = crear(almacen, { enriquecerDeezer: async () => { visto = await almacen.obtenerValorConfig('intentosReanudar', 0); return { procesadas: 0, conGeneros: 0 }; } });
  assert.equal((await org.reanudar()).fase, 'listo');
  assert.equal(visto, 1);
  assert.equal(await almacen.obtenerValorConfig('intentosReanudar', 0), 0);
});

test('fases nuevas: MusicBrainz canción/álbum y ritmo antes del recálculo, y estados al final', async () => {
  const orden = [];
  const org = crear(almacenBase(), {
    enriquecerDeezer: async () => (orden.push('deezer'), { conGeneros: 0 }),
    enriquecerMusicbrainz: async () => (orden.push('mb'), { conGeneros: 0 }),
    enriquecerMusicbrainzDetalle: async () => (orden.push('mb-detalle'), { conGeneros: 3 }),
    enriquecerRitmo: async () => (orden.push('ritmo'), { conBpm: 5 }),
    calcular: async (entrada) => (orden.push(`calcular:${entrada.tracks.length}`), calcularRock(entrada)),
    alimentarEstados: async () => (orden.push('estados'), { agregadas: 7 }),
  });
  const r = await org.organizar({ motivo: 'manual' });
  assert.equal(r.fase, 'listo');
  assert.equal(r.estadosAlimentados, 7);
  // Segunda pasada de cálculo porque la canción/álbum aportaron géneros (la 2ª ya no tiene nada sin modo).
  assert.deepEqual(orden, ['deezer', 'calcular:2', 'mb', 'mb-detalle', 'ritmo', 'estados']);
});

test('si falla ritmo, MusicBrainz detalle o alimentar estados, la organización sigue y termina bien', async () => {
  const org = crear(almacenBase(), {
    enriquecerMusicbrainzDetalle: async () => { throw new Error('sin red'); },
    enriquecerRitmo: async () => { throw new Error('sin red'); },
    alimentarEstados: async () => { throw new Error('boom'); },
  });
  const r = await org.organizar({ motivo: 'manual' });
  assert.equal(r.fase, 'listo');
  assert.equal(r.colocadas, 2);
  assert.equal(r.estadosAlimentados, 0);
});
