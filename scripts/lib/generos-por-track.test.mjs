import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armarGenerosPorTrack, armarEvidenciaPorTrack } from './generos-por-track.mjs';

function dirTemporal() {
  return mkdtempSync(join(tmpdir(), 'generos-por-track-test-'));
}

const FUENTES = {
  vocabulario: {
    nombresHumanos: { phonk: 'Phonk', pop: 'Pop', rock: 'Rock', chill: 'Chill' },
    sinonimos: { 'hip-hop': 'hip hop' },
    patronesTitulo: ['instrumental', 'piano'],
  },
};

/** ejes.json mínimo, con un ejemplo de cada tipo que importa para la señal. */
function escribirEjes(dir) {
  writeFileSync(
    join(dir, 'ejes.json'),
    JSON.stringify({
      ejes: [
        { id: 'sin-clasificar', nombre: 'Sin clasificar', sistema: true },
        { id: 'chill', nombre: 'Chill', sistema: false },
        { id: 'instrumental-popular', nombre: 'Instrumental Popular Songs 2026', sistema: false },
        { id: 'mis-favoritas', nombre: 'Mis favoritas', sistema: false },
        { id: 'rock-descubierto', nombre: 'Rock', sistema: false, origen: 'descubierto' },
      ],
    })
  );
}

test('combina generos de MusicBrainz (via artistaMbid) con matches de descripcion de YouTube', () => {
  const dir = dirTemporal();
  try {
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({
        tracks: { t1: { artistaMbid: 'mbid-1' } },
        artistas: { 'mbid-1': { nombre: 'Artista', generos: ['phonk'] } },
      })
    );
    writeFileSync(join(dir, 'descripciones-youtube.json'), JSON.stringify({ t2: 'esto es hip hop puro' }));

    const tracks = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(resultado.get('t1'), ['phonk']);
    assert.deepEqual(resultado.get('t2'), ['hip hop']);
    assert.deepEqual(resultado.get('t3'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no explota si faltan los archivos de cache (biblioteca recien importada, sin enriquecer todavia)', () => {
  const dir = dirTemporal();
  try {
    const tracks = [{ id: 't1' }];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);
    assert.deepEqual(resultado.get('t1'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saca genero del titulo del track con los patronesTitulo del vocabulario', () => {
  const dir = dirTemporal();
  try {
    const tracks = [
      { id: 't1', titulo: 'You Are My Sunshine - Piano Instrumental' },
      { id: 't2', titulo: 'Una cancion cualquiera' },
    ];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(resultado.get('t1').sort(), ['instrumental', 'piano']);
    assert.deepEqual(resultado.get('t2'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el nombre de la lista de origen NO aporta género (una playlist «Chill» o «Tango» no prueba nada)', () => {
  const dir = dirTemporal();
  try {
    escribirEjes(dir);
    const tracks = [{ id: 't1', titulo: 'Algo', ejes: [{ ejeId: 'chill' }, { ejeId: 'sin-clasificar' }] }];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(resultado.get('t1'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el nombre de una lista con "Instrumental" tampoco aporta género (solo cuentan título, MusicBrainz y descripción)', () => {
  const dir = dirTemporal();
  try {
    escribirEjes(dir);
    const tracks = [{ id: 't1', titulo: 'Algo', ejes: [{ ejeId: 'instrumental-popular' }] }];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(resultado.get('t1'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registra con que senal se describio cada track, y null si no hubo ninguna', () => {
  const dir = dirTemporal();
  try {
    escribirEjes(dir);
    const tracks = [
      { id: 't1', titulo: 'Algo - Piano', ejes: [] },
      { id: 't2', titulo: 'Algo', ejes: [{ ejeId: 'chill' }] },
      { id: 't3', titulo: 'Algo', ejes: [{ ejeId: 'mis-favoritas' }] },
    ];
    const evidencia = armarEvidenciaPorTrack(dir, tracks, FUENTES);

    assert.equal(evidencia.get('t1').senal, 'patron-titulo');
    assert.equal(evidencia.get('t2').senal, null);
    assert.equal(evidencia.get('t3').senal, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('con MusicBrainz y una lista "Chill", solo cuenta MusicBrainz', () => {
  const dir = dirTemporal();
  try {
    escribirEjes(dir);
    writeFileSync(
      join(dir, 'metadata-musicbrainz.json'),
      JSON.stringify({
        tracks: { t1: { artistaMbid: 'mbid-1' } },
        artistas: { 'mbid-1': { nombre: 'Artista', generos: ['phonk'] } },
      })
    );
    const tracks = [{ id: 't1', titulo: 'Algo', ejes: [{ ejeId: 'chill' }] }];
    const evidencia = armarEvidenciaPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(evidencia.get('t1').generos, ['phonk']);
    assert.equal(evidencia.get('t1').senal, 'genero-musicbrainz');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ignora listas del sistema, listas sin termino conocido, y modos que creo el propio descubrimiento', () => {
  const dir = dirTemporal();
  try {
    escribirEjes(dir);
    const tracks = [
      // 'Sin clasificar' es del sistema y 'Mis favoritas' no tiene ningun
      // termino del vocabulario: ninguna de las dos debe aportar nada.
      { id: 't1', titulo: 'Algo', ejes: [{ ejeId: 'sin-clasificar' }, { ejeId: 'mis-favoritas' }] },
      // Un modo auto-generado llamado "Rock" no puede ser evidencia para
      // generar mas modos: seria un lazo que se retroalimenta solo.
      { id: 't2', titulo: 'Algo', ejes: [{ ejeId: 'rock-descubierto' }] },
    ];
    const resultado = armarGenerosPorTrack(dir, tracks, FUENTES);

    assert.deepEqual(resultado.get('t1'), []);
    assert.deepEqual(resultado.get('t2'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
