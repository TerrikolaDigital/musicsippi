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
  assert.deepEqual(urls.artistas, ['http://x/ana.jpg']); // Beto no tiene foto: no entra (sin iniciales)
  assert.deepEqual(datos.artistas.map((a) => a.nombre), ['Ana']);
  assert.equal(urls.albumes.length, 1); // «Disco B» no tiene portada: no entra
  const tarjetas = listarTarjetas(armarPantallas(res, 'semana'));
  assert.equal(tarjetas.at(-1).tipo, 'final');
  assert.ok(textoCompartir('final', datos).includes('minutos'));
  assert.ok(textoCompartir('hora', datos).startsWith('Mi semana en Musicsippi: Soy de escuchar'));
});

test('tiempo: minutos y horas', () => {
  assert.equal(tiempo(45 * 60), '45 min');
  assert.equal(tiempo(130 * 60), '2 h 10 min');
});

// ---- Tarjetas con portada real: nunca iniciales, y al elegir canción cambian también sus datos ----
import { conCancionElegida, esPortadaReal, opcionesCancion, soloConImagen } from './datosTarjetas.js';

const bib2 = [
  { id: 'a', titulo: 'Con portada A', artista: 'Ana', ejes: [{ ejeId: 'rock' }] },
  { id: 'b', titulo: 'Sin portada', artista: 'Beto', ejes: [{ ejeId: 'rock' }] },
  { id: 'c', titulo: 'Con portada C', artista: 'Cleo', ejes: [{ ejeId: 'rock' }] },
];
const portadas = { a: 'http://x/a.jpg', c: 'file:///local/c.jpg' };
const portadaDe = (t) => (t && portadas[t.id]) ?? null;
const rango = { desde: f(2026, 9, 12, 0), hasta: f(2026, 9, 19, 0), ejes };
// «b» es la más escuchada pero no tiene portada.
const hist2 = [e('b', f(2026, 9, 13)), e('b', f(2026, 9, 14)), e('b', f(2026, 9, 15)), e('a', f(2026, 9, 16)), e('a', f(2026, 9, 17)), e('c', f(2026, 9, 17, 14))];

test('esPortadaReal: web y carátula local sí; vacío o texto suelto no', () => {
  for (const u of ['https://x/y.jpg', 'http://x/y.jpg', 'file:///a.jpg', 'capacitor://localhost/_capacitor_file_/a.jpg', 'data:image/png;base64,AA', '/covers/a.jpg']) assert.ok(esPortadaReal(u), u);
  for (const u of ['', '  ', null, undefined, 'M', 'iniciales', 42]) assert.ok(!esPortadaReal(u), String(u));
});

test('sin portada no hay tarjeta: la canción en bucle es la más escuchada que tiene portada real', () => {
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe });
  assert.equal(res.bucle.trackId, 'a'); // «b» (3 veces) se salta porque no tiene portada
  assert.deepEqual(res.candidatasBucle.map((c) => c.trackId), ['a', 'c']);
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', { portada: portadaDe, foto: () => null });
  assert.equal(datos.bucle.titulo, 'Con portada A');
  assert.equal(urls.bucle, 'http://x/a.jpg');
  assert.deepEqual(datos.canciones.map((c) => c.titulo), ['Con portada A', 'Con portada C']);
  assert.equal(urls.canciones.length, datos.canciones.length);
  assert.ok(urls.canciones.every(esPortadaReal));
});

test('sin ninguna portada se omiten las tarjetas de canción y de artistas (menos tarjetas, nunca iniciales)', () => {
  const sin = () => null;
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe: sin });
  assert.equal(res.bucle, null);
  assert.equal(res.descubrimiento, null);
  const { datos } = armarDatosTarjeta(res, 'semana', '#123456', { portada: sin, foto: sin });
  assert.equal(datos.bucle, null);
  assert.deepEqual(datos.canciones, []);
  assert.deepEqual(datos.artistas, []);
  const ids = listarTarjetas(armarPantallas(res, 'semana'), datos).map((t) => t.tipo);
  assert.ok(!ids.includes('bucle') && !ids.includes('artistas'));
  assert.ok(ids.includes('minutos') && ids.at(-1) === 'final');
});

test('una canción sin portada propia no toma la de otra', () => {
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe });
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', { portada: portadaDe, foto: () => null });
  const titulos = datos.canciones.map((c) => c.titulo);
  assert.ok(!titulos.includes('Sin portada'));
  assert.equal(new Set(urls.canciones).size, urls.canciones.length); // ninguna portada repetida
});

test('elegir canción cambia a la vez título, artista, veces y portada', () => {
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe });
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', { portada: portadaDe, foto: () => null });
  const img = (u) => ({ src: u });
  const imagenes = { bucle: img(urls.bucle), candidatas: { bucle: urls.candidatas.bucle.map(img), curioso: [] } };
  assert.equal(opcionesCancion('bucle', datos).length, 2);
  assert.deepEqual(opcionesCancion('minutos', datos), []);
  const r = conCancionElegida('bucle', datos, imagenes, 1);
  assert.equal(r.datos.bucle.titulo, 'Con portada C');
  assert.equal(r.datos.bucle.artista, 'Cleo');
  assert.equal(r.datos.bucle.n, 1);
  assert.equal(r.imagenes.bucle.src, 'file:///local/c.jpg');
  assert.equal(datos.bucle.titulo, 'Con portada A'); // no muta el original
});

test('soloConImagen: si una portada no carga, esa canción sale y la siguiente ocupa su sitio', () => {
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe });
  const { datos, urls } = armarDatosTarjeta(res, 'semana', '#123456', { portada: portadaDe, foto: () => null });
  const img = (u) => ({ src: u });
  const imagenes = {
    bucle: null,
    candidatas: { bucle: [null, img(urls.candidatas.bucle[1])], curioso: urls.candidatas.curioso.map(img) },
    canciones: [null, img(urls.canciones[1])],
    artistas: [],
    albumes: [],
  };
  const r = soloConImagen(datos, imagenes);
  assert.equal(r.datos.bucle.titulo, 'Con portada C');
  assert.equal(r.imagenes.bucle.src, 'file:///local/c.jpg');
  assert.deepEqual(r.datos.canciones.map((c) => c.titulo), ['Con portada C']);
  assert.equal(r.imagenes.canciones.length, 1);
  // sin ninguna imagen cargada, no queda canción en bucle y la tarjeta desaparece
  const vacio = soloConImagen(datos, { candidatas: { bucle: [null, null], curioso: [] }, canciones: [], artistas: [], albumes: [] });
  assert.equal(vacio.datos.bucle, null);
  assert.ok(!listarTarjetas(armarPantallas(res, 'semana'), vacio.datos).some((t) => t.tipo === 'bucle'));
});

test('descubrimiento: solo canciones nuevas con portada real', () => {
  const res = armarResumen(hist2, bib2, { ...rango, portadaDe });
  assert.ok(res.descubrimientos.length > 0);
  assert.ok(res.descubrimientos.every((d) => portadaDe(d.track)));
  assert.notEqual(res.descubrimiento.trackId, 'b');
});
