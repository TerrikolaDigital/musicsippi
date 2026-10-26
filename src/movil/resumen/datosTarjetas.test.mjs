import test from 'node:test';
import assert from 'node:assert/strict';
import { textoPeriodo, listarTarjetas, armarDatosTarjeta, textoCompartir } from './datosTarjetas.js';
import { armarResumen, armarPantallas, topAlbumes } from './resumen.js';
import { tiempo } from './tarjeta.js';

const f = (a, m, d, h = 12) => new Date(a, m, d, h).getTime();
const e = (trackId, ts) => ({ trackId, ts, duracionS: 600 });
const biblioteca = [
  { id: 't1', titulo: 'Uno', artista: 'Ana', ejes: [{ ejeId: 'rock' }] },
  { id: 't2', titulo: 'Dos', artista: 'Beto', ejes: [{ ejeId: 'rock' }] },
  { id: 't3', titulo: 'Tres', artista: 'Ana', ejes: [{ ejeId: 'rock' }] },
];
const ejes = [{ id: 'rock', nombre: 'Rock' }];
const meta = { t1: { album: 'Disco A', coverUrl: 'http://x/a.jpg' }, t3: { album: 'Disco A' }, t2: { album: 'Disco B' } };
const metadataDe = (id) => meta[id] ?? {};

test('textoPeriodo: semana en el mismo mes, entre meses y año', () => {
  assert.equal(textoPeriodo(f(2026, 9, 12, 0), f(2026, 9, 19, 0), 'semana'), 'Mi semana · 12–18 oct');
  assert.equal(textoPeriodo(f(2026, 8, 28, 0), f(2026, 9, 5, 0), 'semana'), 'Mi semana · 28 sep–4 oct');
  assert.equal(textoPeriodo(f(2026, 0, 1, 0), f(2026, 11, 5, 0), 'anio'), 'Mi año 2026');
});

test('topAlbumes agrupa por álbum y artista, con la carátula de la canción que la tiene', () => {
  const hist = [e('t1', 1), e('t3', 2), e('t3', 3), e('t2', 4)];
  const r = topAlbumes(hist, biblioteca, { metadataDe });
  assert.equal(r[0].album, 'Disco A');
  assert.equal(r[0].n, 3);
  assert.equal(r[0].track.id, 't1');
  assert.equal(r[1].album, 'Disco B');
  assert.deepEqual(topAlbumes(hist, biblioteca, {}), []);
});

test('armarDatosTarjeta: datos planos, urls de imagen y tarjetas disponibles', () => {
  const hist = [e('t1', f(2026, 9, 13)), e('t1', f(2026, 9, 14)), e('t2', f(2026, 9, 15)), e('t3', f(2026, 9, 16, 23))];
  const res = armarResumen(hist, biblioteca, { desde: f(2026, 9, 12, 0), hasta: f(2026, 9, 19, 0), ejes, metadataDe });
  assert.equal(res.artistasDistintos, 2);
  assert.equal(res.topAlbumes.length, 2);
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', {
    portada: (t) => meta[t.id]?.coverUrl ?? null,
    foto: (n) => (n === 'Ana' ? 'http://x/ana.jpg' : null),
  });
  assert.equal(datos.nArtistas, 2);
  assert.equal(datos.canciones[0].titulo, 'Uno');
  assert.equal(datos.modos[0].nombre, 'Rock');
  assert.equal(datos.periodo, 'Mi semana · 12–18 oct');
  assert.equal(urls.bucle, 'http://x/a.jpg');
  assert.deepEqual(urls.artistas, ['http://x/ana.jpg', null]);
  assert.equal(urls.albumes.length, 2);
  const tarjetas = listarTarjetas(armarPantallas(res, 'semana'));
  assert.equal(tarjetas.at(-1).tipo, 'final');
  assert.ok(textoCompartir('final', datos).includes('minutos'));
  assert.ok(textoCompartir('hora', datos).startsWith('Mi semana en Musicsippi: Soy de escuchar'));
});

test('tiempo: minutos y horas', () => {
  assert.equal(tiempo(45 * 60), '45 min');
  assert.equal(tiempo(130 * 60), '2 h 10 min');
});
