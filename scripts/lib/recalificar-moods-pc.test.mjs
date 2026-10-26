import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buscarCopiaPrevia, copiaPreviaMasReciente, leerArgumentos, leerVectores, nombreCarpetaBackup, prepararRecalificacion } from './recalificar-moods-pc.mjs';

const e = (ejeId, origen = 'auto', senal = 'migracion-moods') => ({ ejeId, origen, senal, score: 1 });

test('argumentos: simula por defecto; --aplicar, --data, --copia, --muestra y errores', () => {
  assert.deepEqual(leerArgumentos([]), { aplicar: false, dataDir: null, appCerrada: false, copia: null, fiestaEstricta: false, muestra: 12, errores: [] });
  const a = leerArgumentos(['--aplicar', '--data', 'D', '--app-cerrada', '--copia', 'C', '--muestra', '3', '--fiesta-estricta']);
  assert.deepEqual([a.aplicar, a.dataDir, a.appCerrada, a.copia, a.muestra, a.fiestaEstricta, a.errores], [true, 'D', true, 'C', 3, true, []]);
  assert.equal(leerArgumentos(['--data']).errores.length, 1);
  assert.equal(leerArgumentos(['--raro']).errores.length, 1);
});

test('la copia previa es la backup-migracion-moods más reciente; el backup lleva marca de tiempo', () => {
  assert.equal(copiaPreviaMasReciente(['x', 'backup-migracion-moods-20261001-100000', 'backup-migracion-moods-20261021-003402', 'backup-fusion-modos-1']), 'backup-migracion-moods-20261021-003402');
  assert.equal(copiaPreviaMasReciente(['x']), null);
  assert.equal(nombreCarpetaBackup(new Date('2026-10-26T10:05:09Z')), 'backup-recalificar-moods-20261026-100509');
});

test('lee la copia previa y los vectores del disco (carpeta temporal)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recal-'));
  try {
    const copia = join(dir, 'backup-migracion-moods-20261021-003402');
    mkdirSync(copia);
    writeFileSync(join(copia, 'biblioteca.json'), JSON.stringify({ tracks: [{ id: 'a', ejes: [] }] }));
    writeFileSync(join(copia, 'ejes.json'), JSON.stringify({ ejes: [{ id: 'chill' }] }));
    assert.deepEqual(buscarCopiaPrevia(dir), { tracks: [{ id: 'a', ejes: [] }], ejes: [{ id: 'chill' }] });
    assert.equal(buscarCopiaPrevia(join(dir, 'nada')), null);
    writeFileSync(join(dir, 'vectores-indice.json'), JSON.stringify({ dims: 2, tracks: { a: { offset: 0 }, b: { offset: 1 }, c: { offset: 9 } } }));
    writeFileSync(join(dir, 'vectores.bin'), Buffer.from(new Float32Array([1, 2, 3, 4]).buffer));
    const v = leerVectores(dir);
    assert.deepEqual(v.map((x) => [x.trackId, [...x.vector]]), [['a', [1, 2]], ['b', [3, 4]]], 'el que se sale del archivo se ignora');
    assert.deepEqual(leerVectores(join(dir, 'nada')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepararRecalificacion devuelve la biblioteca nueva y el archivo de cambios sin mutar la original', () => {
  const biblioteca = { version: 1, tracks: [{ id: 'a', artista: 'Billie Eilish', titulo: 'lovely', ejes: [e('pop-bailable'), e('de-fiesta')] }] };
  const foto = JSON.stringify(biblioteca);
  const r = prepararRecalificacion({ biblioteca, ejesData: { ejes: [] }, ahora: new Date('2026-10-26T10:00:00Z') });
  assert.equal(JSON.stringify(biblioteca), foto);
  assert.deepEqual(r.biblioteca.tracks[0].ejes.map((x) => x.ejeId), ['pop']);
  assert.equal(r.biblioteca.version, 1);
  assert.deepEqual([r.archivoCambios.version, r.archivoCambios.fecha, r.archivoCambios.cambios.length, r.archivoCambios.devueltos], [1, '2026-10-26T10:00:00.000Z', 1, {}]);
});
