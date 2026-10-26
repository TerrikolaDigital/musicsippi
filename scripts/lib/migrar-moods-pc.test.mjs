import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appEnMarcha, leerArgumentos, marcaDeTiempo, nombreCarpetaBackup, permisoParaEscribir, prepararMigracion } from './migrar-moods-pc.mjs';

const eje = (id, nombre, tipo = 'gusto', extra = {}) => ({ id, nombre, tipo, orden: 1, activo: true, sistema: false, padre: null, anclas: { artistas: [], titulos: [] }, tagsLastfm: [], ...extra });
const datos = () => ({
  biblioteca: { generado: 'x', tracks: [{ id: 't1', artista: 'Madonna', titulo: 'Hung Up', ejes: [{ ejeId: 'tango', origen: 'auto', senal: 'patron-titulo', score: 1 }] }] },
  ejesData: { version: 1, ejes: [eje('sin-clasificar', 'Sin clasificar', 'sistema', { sistema: true }), eje('tango', 'Tango', 'gusto', { origen: 'descubierto' })] },
});

test('argumentos: por defecto simula; --data, --aplicar y --app-cerrada; rechaza lo desconocido', () => {
  assert.deepEqual(leerArgumentos([]), { aplicar: false, dataDir: null, appCerrada: false, json: false, errores: [] });
  const a = leerArgumentos(['--data', 'C:/x', '--aplicar', '--app-cerrada']);
  assert.deepEqual([a.dataDir, a.aplicar, a.appCerrada], ['C:/x', true, true]);
  assert.equal(leerArgumentos(['--data']).errores.length, 1);
  assert.equal(leerArgumentos(['--raro']).errores.length, 1);
});

test('la marca de tiempo es válida como nombre de carpeta', () => {
  assert.equal(marcaDeTiempo(new Date('2026-10-20T10:05:09.123Z')), '20261020-100509');
  assert.equal(nombreCarpetaBackup(new Date('2026-10-20T10:05:09Z')), 'backup-migracion-moods-20261020-100509');
});

test('detecta la app de escritorio en la lista de procesos', () => {
  assert.equal(appEnMarcha('"Musicsippi.exe","1234","Console","1","90,000 K"\n"chrome.exe","9","Console","1","1 K"'), true);
  assert.equal(appEnMarcha('"chrome.exe","9","Console","1","1 K"\n"node.exe","7","Console","1","1 K"'), false);
  assert.equal(appEnMarcha('"MusicsippiHelper.exe","1"'), false);
  assert.equal(appEnMarcha(null), null);
  assert.equal(appEnMarcha('   '), null);
});

test('permiso: no escribe con la app abierta; si no se puede saber exige --app-cerrada', () => {
  assert.equal(permisoParaEscribir({ enMarcha: true, appCerrada: true }).permitido, false);
  assert.equal(permisoParaEscribir({ enMarcha: null, appCerrada: false }).permitido, false);
  assert.equal(permisoParaEscribir({ enMarcha: null, appCerrada: true }).permitido, true);
  assert.equal(permisoParaEscribir({ enMarcha: false, appCerrada: false }).permitido, true);
});

test('prepararMigracion no muta la entrada, marca esquemaMoods y conserva el resto de campos', () => {
  const d = datos();
  const copia = structuredClone(d);
  const r = prepararMigracion({ ...d, ahora: new Date('2026-10-20T10:00:00Z') });
  assert.deepEqual(d, copia);
  assert.equal(r.yaMigrado, false);
  assert.equal(r.ejesData.esquemaMoods, 1);
  assert.equal(r.ejesData.version, 1);
  assert.equal(r.biblioteca.generado, 'x');
  assert.ok(r.ejesData.ejes.some((e) => e.id === 'pop-bailable' && e.familia === 'genero' && e.autoRellenar === true));
  assert.ok(r.biblioteca.tracks[0].ejes.some((x) => x.ejeId === 'pop-bailable'));
});

test('prepararMigracion es idempotente: sobre datos ya migrados no hace nada', () => {
  const r = prepararMigracion(datos());
  const otra = prepararMigracion({ biblioteca: r.biblioteca, ejesData: r.ejesData });
  assert.deepEqual(otra, { yaMigrado: true });
});
