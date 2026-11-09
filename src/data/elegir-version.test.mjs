import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nivelDeVersion, ordenarPorParecido, hayVersionFiel, mejorVersionParaRevisar } from './elegir-version.js';

const cancion = (videoId, titulo, artistas, duracion = 200) => ({ videoId, titulo, artistas, duracion, tipo: 'cancion' });
const video = (videoId, titulo, canal, duracion = 200) => ({ videoId, titulo, artistas: [canal], duracion, tipo: 'video' });
const primero = (lista, ref) => ordenarPorParecido(lista, ref)[0].videoId;

test('un cover con mismo título y duración no le gana al original aunque YouTube lo ponga antes', () => {
  const ref = { titulo: 'Madrugal', artista: 'Café Tacvba', duracionS: 69 };
  const lista = [cancion('cover', 'Madrugal', ['Blodtørst'], 70), cancion('orig', 'Madrugal', ['Café Tacvba'], 80)];
  assert.equal(primero(lista, ref), 'orig');
});

test('otra canción del mismo artista no vale como la pedida (caso real: Ray LaMontagne)', () => {
  const ref = { titulo: 'How Come', artista: 'Ray LaMontagne', duracionS: 225 };
  const lista = [
    cancion('otra', 'Strong Enough', ['Ray LaMontagne'], 215),
    video('fan', 'Ray LaMontagne - How Come', 'rythman74', 274),
  ];
  assert.equal(hayVersionFiel(lista.slice(0, 1), ref), false);
  assert.equal(primero(lista, ref), 'fan');
});

test('un vídeo vale por el canal del artista o por llevar artista y título', () => {
  const ref = { titulo: 'Otra Piel', artista: 'Gustavo Cerati' };
  assert.equal(nivelDeVersion(video('a', 'Otra Piel (Official Audio)', 'GustavoCeratiVEVO'), ref), 0);
  assert.equal(nivelDeVersion(video('b', 'Gustavo Cerati - Otra Piel (Official Audio)', 'Sony'), ref), 0);
  assert.equal(nivelDeVersion(video('c', 'Otra Piel', 'Gustavo Cerati - Topic'), ref), 0);
});

test('los vídeos de cover con el nombre del artista en el título no pasan por originales', () => {
  const ref = { titulo: 'Until I Found You', artista: 'Stephen Sanchez' };
  const cover = video('c', 'Stephen Sanchez - Until I Found You | Piano Cover by Pianella Piano', 'Pianella');
  const karaoke = video('k', 'Stephen Sanchez - Until I Found You (Piano Karaoke)', 'Sing2Piano');
  const canta = video('s', 'Justin Degryse sings Until I Found You by Stephen Sanchez', 'Justin Degryse');
  for (const v of [cover, karaoke, canta]) assert.ok(nivelDeVersion(v, ref) >= 2, v.titulo);
});

test('un artista de tributo o karaoke no coincide aunque contenga el nombre', () => {
  const ref = { titulo: 'De Música Ligera', artista: 'Soda Stereo' };
  assert.ok(nivelDeVersion(cancion('t', 'De Música Ligera', ['Soda Stereo Tribute Band']), ref) >= 2);
});

test('un directo del artista queda por debajo del estudio pero por encima del cover', () => {
  const ref = { titulo: 'Las flores', artista: 'Café Tacvba' };
  const lista = [
    cancion('cover', 'Las flores', ['Otro Grupo']),
    cancion('vivo', 'Las flores (En Vivo)', ['Café Tacvba']),
  ];
  assert.equal(primero(lista, ref), 'vivo');
  assert.equal(primero([...lista, cancion('est', 'Las flores', ['Café Tacvba'])], ref), 'est');
});

test('si la canción de la biblioteca ya es una versión, esa variante es la buena', () => {
  const ref = { titulo: 'I Feel Love - Afrojack Remix', artista: 'Donna Summer' };
  assert.equal(nivelDeVersion(video('r', 'Donna Summer - I Feel Love (Afrojack Remix)', 'Ретро ремиксы'), ref), 0);
  const piano = { titulo: 'Vampire - Piano Instrumental', artista: 'Box of Music' };
  assert.equal(primero([cancion('otra', 'Clair de Lune', ['Box of Music']), cancion('p', 'Vampire (Piano Instrumental)', ['Sam Ellis'])], piano), 'p');
});

test('no se queda en silencio: sin nada parecido devuelve lo que haya, cover incluido', () => {
  const ref = { titulo: 'Rara', artista: 'Nadie' };
  const lista = [cancion('x', 'Rara (Cover)', ['Alguien'])];
  assert.deepEqual(ordenarPorParecido(lista, ref).map((c) => c.videoId), ['x']);
  assert.equal(hayVersionFiel(lista, ref), false);
});

test('la coincidencia de artista no depende de acentos, espacios ni colaboraciones', () => {
  const titulo = 'Pa Bailar';
  assert.equal(nivelDeVersion(cancion('a', titulo, ['Bajofondo']), { titulo, artista: 'Bajo Fondo' }), 0);
  assert.equal(nivelDeVersion(cancion('b', titulo, ['Karol G']), { titulo, artista: 'Tiësto & Karol G' }), 0);
  assert.equal(nivelDeVersion(cancion('c', titulo, ['Beyoncé & Jay-Z']), { titulo, artista: 'Beyonce' }), 0);
});

test('un artista en alfabeto no latino no se puede comparar y no hunde al candidato', () => {
  const ref = { titulo: 'Stay', artista: '米津玄師' };
  assert.equal(nivelDeVersion(cancion('a', 'Stay', ['米津玄師']), ref), 0);
});

test('sin referencia se respeta el orden de YouTube', () => {
  const lista = [cancion('a', 'x', ['y']), cancion('b', 'z', ['w'])];
  assert.deepEqual(ordenarPorParecido(lista, null).map((c) => c.videoId), ['a', 'b']);
});

test('un vídeo de una hora o muy distinto en duración no pasa por fiel', () => {
  const ref = { titulo: 'Woman', artista: 'Lowfie', duracionS: 180 };
  assert.ok(nivelDeVersion(video('h', 'Lowfie - Woman', 'Lowfie', 3600), ref) > 0);
  assert.ok(nivelDeVersion(video('h', 'Lowfie - Woman', 'Lowfie', 3600), { titulo: 'Woman', artista: 'Lowfie' }) > 0);
});

test('revisar: cambia un vídeo guardado si hay una versión fiel y el guardado no lo es', () => {
  const ref = { titulo: 'Madrugal', artista: 'Café Tacvba' };
  const lista = [cancion('orig', 'Madrugal', ['Café Tacvba']), cancion('cover', 'Madrugal', ['Blodtørst'])];
  assert.equal(mejorVersionParaRevisar('cover', lista, ref), 'orig');
  assert.equal(mejorVersionParaRevisar('desconocido', lista, ref), 'orig');
});

test('revisar: no toca lo que ya es fiel ni cambia si no hay nada fiel', () => {
  const ref = { titulo: 'Madrugal', artista: 'Café Tacvba' };
  const fiel = [cancion('orig', 'Madrugal', ['Café Tacvba']), cancion('orig2', 'Madrugal', ['Cafe Tacvba'])];
  assert.equal(mejorVersionParaRevisar('orig2', fiel, ref), null);
  assert.equal(mejorVersionParaRevisar('guardado', [cancion('c', 'Madrugal', ['Blodtørst'])], ref), null);
  assert.equal(mejorVersionParaRevisar('guardado', [], ref), null);
});

test('«Cloud» de Sia no es «Thunderclouds»: un trozo de palabra no es el mismo título', () => {
  const ref = { artista: 'Sia', titulo: 'Thunderclouds (feat. Sia, Diplo, Labrinth)' };
  assert.equal(nivelDeVersion(cancion('c', 'Cloud', ['Sia'], 224), ref), 4);
});

test('Thunderclouds de LSD queda primero y el de otro artista sigue siendo nivel 2', () => {
  const ref = { artista: 'Sia', titulo: 'Thunderclouds (feat. Sia, Diplo, Labrinth)', duracionS: 188 };
  const lista = [
    cancion('cloud', 'Cloud', ['Sia'], 224),
    cancion('lowe', 'Thunderclouds', ['Low E'], 269),
    cancion('orig', 'Thunderclouds (feat. Sia, Diplo & Labrinth)', ['LSD'], 188),
  ];
  assert.equal(primero(lista, ref), 'orig');
  assert.equal(nivelDeVersion(lista[1], ref), 2);
});

test('el artista citado en feat. del candidato cuenta como artista, pero un cover no', () => {
  const ref = { artista: 'Sia', titulo: 'Thunderclouds' };
  assert.equal(nivelDeVersion(cancion('o', 'Thunderclouds (feat. Sia, Diplo & Labrinth)', ['LSD']), ref), 0);
  assert.ok(nivelDeVersion(cancion('c', 'Thunderclouds (Sia cover)', ['Alguien']), ref) >= 2);
});
