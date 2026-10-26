import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenMemoria } from './lib/almacen-memoria.js';
import { CLAVE_CAMBIOS } from './lib/journal.js';
import { deshacer, esquemaLocal, hayCopiaPrevia, reorganizar, vistaPrevia } from './migrar-moods-movil.js';

const eje = (id, nombre, tipo = 'gusto', extra = {}) => ({ id, nombre, tipo, orden: 1, activo: true, sistema: false, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [], ...extra });
const e = (ejeId, origen = 'auto', senal = 'patron-titulo') => ({ ejeId, origen, senal, score: 1 });
const inicial = () => ({
  ejes: [eje('favoritos', 'Favoritas', 'gusto', { sistema: true }), eje('sin-clasificar', 'Sin clasificar', 'sistema', { sistema: true }), eje('tango', 'Tango', 'gusto', { origen: 'descubierto' }), eje('chill', 'Chill', 'gusto', { origen: 'descubierto' }), eje('mi-lista', 'Mi lista', 'playlist')],
  biblioteca: [
    { id: 't1', artista: 'Madonna', titulo: 'Hung Up', ejes: [e('tango')] },
    { id: 't2', artista: 'Alguien', titulo: 'Suave', ejes: [e('chill', 'manual', 'usuario')] },
    { id: 't3', artista: 'Otro', titulo: 'Nada', ejes: [e('sin-clasificar', 'auto', 'ninguna')] },
  ],
  generos: [{ trackId: 't3', generosMB: [] }],
});
const conCambios = async (almacen) =>
  almacen.guardarValorConfig(CLAVE_CAMBIOS, [
    { endpoint: 'asignar', cuerpo: { trackId: 't1', ejeId: 'tango' }, ts: 1 },
    { endpoint: 'favorito', cuerpo: { tipo: 'artista', nombre: 'X', activo: true }, ts: 2 },
    { endpoint: 'ejes', cuerpo: { ejes: [] }, ts: 3 },
  ]);
const ord = (xs) => [...xs].sort((p, q) => p.id.localeCompare(q.id));

test('vista previa: no cambia nada y avisa de los cambios de moods pendientes', async () => {
  const a = crearAlmacenMemoria(inicial());
  await conCambios(a);
  const antes = JSON.stringify(await a.obtenerTodos('biblioteca'));
  const v = await vistaPrevia(a);
  assert.equal(v.migrado, false);
  assert.equal(v.resumen.total, 3);
  assert.equal(v.cambiosDeMoodsPendientes, 2);
  assert.equal(JSON.stringify(await a.obtenerTodos('biblioteca')), antes);
  assert.equal(await hayCopiaPrevia(a), null);
});

test('reorganizar migra, marca el esquema, guarda copia y filtra el registro de cambios', async () => {
  const a = crearAlmacenMemoria(inicial());
  await conCambios(a);
  await reorganizar(a, { ahora: () => new Date('2026-10-20T10:00:00Z') });
  assert.equal(await esquemaLocal(a), 1);
  const ejes = await a.obtenerTodos('ejes');
  assert.ok(ejes.some((x) => x.id === 'pop-bailable' && x.familia === 'genero' && x.autoRellenar === true));
  assert.ok(!ejes.some((x) => x.id === 'chill'), 'chill desaparece');
  assert.ok(ejes.some((x) => x.id === 'favoritos'));
  const t1 = (await a.obtenerTodos('biblioteca')).find((t) => t.id === 't1');
  assert.ok(t1.ejes.some((x) => x.ejeId === 'pop-bailable'));
  assert.deepEqual((await a.obtenerValorConfig(CLAVE_CAMBIOS, [])).map((c) => c.endpoint), ['favorito']);
  assert.deepEqual(await hayCopiaPrevia(a), { fecha: '2026-10-20T10:00:00.000Z', canciones: 3 });
  assert.equal((await vistaPrevia(a)).migrado, true);
  await assert.rejects(() => reorganizar(a), /ya están/);
});

test('deshacer restaura biblioteca, ejes, cambios y esquema exactamente', async () => {
  const a = crearAlmacenMemoria(inicial());
  await conCambios(a);
  const antes = { t: await a.obtenerTodos('biblioteca'), e: await a.obtenerTodos('ejes'), c: await a.obtenerValorConfig(CLAVE_CAMBIOS, []) };
  await reorganizar(a);
  await deshacer(a);
  assert.deepEqual(ord(await a.obtenerTodos('biblioteca')), ord(antes.t));
  assert.deepEqual(ord(await a.obtenerTodos('ejes')), ord(antes.e));
  assert.deepEqual(await a.obtenerValorConfig(CLAVE_CAMBIOS, []), antes.c);
  assert.equal(await esquemaLocal(a), 0);
  assert.equal(await hayCopiaPrevia(a), null);
  await assert.rejects(() => deshacer(a), /No hay copia/);
});

test('si falla a mitad, restaura la copia y relanza el error', async () => {
  const a = crearAlmacenMemoria(inicial());
  const original = a.guardarVarios;
  let llamadas = 0;
  a.guardarVarios = async (n, v) => {
    if (n === 'biblioteca' && ++llamadas === 1) throw new Error('disco lleno');
    return original(n, v);
  };
  const antes = JSON.stringify(ord(await a.obtenerTodos('ejes')));
  await assert.rejects(() => reorganizar(a), /disco lleno/);
  assert.equal(await esquemaLocal(a), 0);
  assert.equal(JSON.stringify(ord(await a.obtenerTodos('ejes'))), antes);
});

// --- Reparación de Power ---
import { CLAVE_REPARACION_POWER, repararPower } from './migrar-moods-movil.js';

const movilConGym = (n = 40) => {
  const ejes = [eje('favoritos', 'Favoritas', 'gusto', { sistema: true }), eje('sin-clasificar', 'Sin clasificar', 'sistema', { sistema: true }), eje('gym-9x', 'Gym', 'gusto')];
  const biblioteca = [];
  for (let i = 0; i < n; i++) biblioteca.push({ id: `g${i}`, artista: `A${i}`, titulo: `Tema ${i}`, ejes: [e('gym-9x', 'auto', 'nombre-lista')] });
  biblioteca.push({ id: 'otra', artista: 'B', titulo: 'Calma', ejes: [e('sin-clasificar', 'auto', 'ninguna')] });
  return { ejes, biblioteca };
};

test('reparar Power: tras una migración vieja con 0-1 en Power, la copia devuelve las de Gym; idempotente y con journal', async () => {
  const a = crearAlmacenMemoria(movilConGym());
  await reorganizar(a);
  // simula el fallo antiguo: Power queda vacío
  const roto = (await a.obtenerTodos('biblioteca')).map((t) => ({ ...t, ejes: t.ejes.filter((x) => x.ejeId !== 'con-energia') }));
  await a.guardarVarios('biblioteca', roto);
  const r = await repararPower(a, { ahora: () => new Date('2026-10-20T12:00:00Z') });
  assert.deepEqual([r.hecho, r.anadidas, r.origen], [true, 40, 'copia']);
  const tracks = await a.obtenerTodos('biblioteca');
  assert.equal(tracks.filter((t) => t.ejes.some((x) => x.ejeId === 'con-energia')).length, 40);
  assert.ok(!tracks.find((t) => t.id === 'otra').ejes.some((x) => x.ejeId === 'con-energia'));
  const asignar = (await a.obtenerValorConfig(CLAVE_CAMBIOS, [])).filter((c) => c.endpoint === 'asignar' && c.cuerpo.ejeId === 'con-energia');
  assert.equal(asignar.length, 40);
  assert.equal((await repararPower(a)).motivo, 'ya-hecha');
  assert.equal((await a.obtenerValorConfig(CLAVE_CAMBIOS, [])).length, asignar.length);
  assert.ok(await a.obtenerValorConfig(CLAVE_REPARACION_POWER, null));
});

test('reparar Power: sin migrar no hace nada; sin copia usa señales y exige al menos dos', async () => {
  const sin = crearAlmacenMemoria(movilConGym(3));
  assert.equal((await repararPower(sin)).motivo, 'sin-migrar');
  const a = crearAlmacenMemoria(movilConGym(0));
  await a.guardarVarios('ejes', [eje('con-energia', 'Power', 'gusto', { familia: 'estado' }), eje('rock', 'Rock', 'gusto', { familia: 'genero' })]);
  await a.guardarVarios('biblioteca', [
    { id: 's1', artista: 'R', titulo: 'Workout hero', ejes: [e('rock')] }, // género + título
    { id: 's2', artista: 'R', titulo: 'Balada', ejes: [e('rock')] }, // solo género
    { id: 's3', artista: 'R', titulo: 'Otro', ejes: [e('rock')] }, // género + bpm
  ]);
  const r = await repararPower(a, { bpm: { s3: 130 } });
  assert.deepEqual([r.hecho, r.anadidas, r.origen], [true, 2, 'senales']);
  const con = (await a.obtenerTodos('biblioteca')).filter((t) => t.ejes.some((x) => x.ejeId === 'con-energia')).map((t) => t.id).sort();
  assert.deepEqual(con, ['s1', 's3']);
});
