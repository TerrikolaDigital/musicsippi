import test from 'node:test';
import assert from 'node:assert/strict';
import { armarAlbumes, esMiniaturaVideo } from './portadaAlbum.js';

const YT = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const DZ = (h) => `https://cdn-images.dzcdn.net/images/cover/${h}/500x500-000000-80-0-0.jpg`;

// metadataDe de mentira: igual que el real, coverUrl ya cae a la miniatura del vídeo si no hay carátula.
function crear(meta) {
  return (id) => {
    const m = meta[id] ?? {};
    return { album: m.album ?? null, anio: m.anio ?? null, coverUrl: m.coverUrl ?? m.video ?? null, coverRespaldo: m.video ?? null, fotoArtista: m.foto ?? null };
  };
}

test('esMiniaturaVideo distingue la miniatura de YouTube de una carátula', () => {
  assert.equal(esMiniaturaVideo(YT('abcdefghijk')), true);
  assert.equal(esMiniaturaVideo(DZ('a'.repeat(32))), false);
  assert.equal(esMiniaturaVideo(null), false);
});

test('una pista sin carátula hereda la de otra pista del mismo álbum', () => {
  const tracks = [{ id: '1', artista: 'Soda Stereo' }, { id: '2', artista: 'Soda Stereo' }];
  const md = crear({ 1: { album: 'Doble Vida', video: YT('aaaaaaaaaaa') }, 2: { album: 'Doble Vida', coverUrl: DZ('b'.repeat(32)) } });
  const [a] = armarAlbumes(tracks, md);
  assert.equal(a.coverUrl, DZ('b'.repeat(32)));
  assert.deepEqual(a.portadas, [DZ('b'.repeat(32)), YT('aaaaaaaaaaa')]);
  assert.equal(a.cantidad, 2);
});

test('mismo álbum y año de otro artista (banda sonora): usa su carátula antes que la miniatura', () => {
  const tracks = [{ id: 'n', artista: 'Nick Kroll' }, { id: 't', artista: 'Taron Egerton' }];
  const titulo = 'Sing (Original Motion Picture Soundtrack Deluxe)';
  const md = crear({ n: { album: titulo, anio: 2016, video: YT('nnnnnnnnnnn') }, t: { album: titulo, anio: 2016, coverUrl: DZ('c'.repeat(32)) } });
  const nick = armarAlbumes(tracks, md).find((a) => a.artista === 'Nick Kroll');
  assert.deepEqual(nick.portadas, [DZ('c'.repeat(32)), YT('nnnnnnnnnnn')]);
});

test('mismo título pero otro año (p. ej. «Greatest Hits»): no se presta la carátula', () => {
  const tracks = [{ id: 'a', artista: 'A' }, { id: 'b', artista: 'B' }];
  const md = crear({ a: { album: 'Greatest Hits', anio: 1990 }, b: { album: 'Greatest Hits', anio: 2004, coverUrl: DZ('d'.repeat(32)) } });
  const a = armarAlbumes(tracks, md).find((x) => x.artista === 'A');
  assert.deepEqual(a.portadas, []);
  assert.equal(a.coverUrl, null);
});

test('sin carátula ni vídeo: la foto del artista (de cualquier canción suya)', () => {
  const tracks = [{ id: '1', artista: 'Dua Lipa' }, { id: '2', artista: 'Dua Lipa' }];
  const md = crear({ 1: { album: 'Spotify Session' }, 2: { album: 'Future Nostalgia', coverUrl: DZ('e'.repeat(32)), foto: 'https://x/dua.jpg' } });
  const s = armarAlbumes(tracks, md).find((a) => a.titulo === 'Spotify Session');
  assert.deepEqual(s.portadas, ['https://x/dua.jpg']);
});

test('la miniatura del vídeo de la propia pista entra si no hay carátula', () => {
  const md = crear({ 1: { album: 'Being Human', video: YT('yncKZqdiaLI') } });
  const [a] = armarAlbumes([{ id: '1', artista: 'Box of Music' }], md);
  assert.equal(a.coverUrl, YT('yncKZqdiaLI'));
});

test('la portada gris genérica de Deezer (hash del vacío) nunca es candidata', () => {
  const gris = 'https://cdn-images.dzcdn.net/images/cover/d41d8cd98f00b204e9800998ecf8427e/500x500.jpg';
  const md = crear({ 1: { album: 'X', coverUrl: gris, video: YT('vvvvvvvvvvv') } });
  const [a] = armarAlbumes([{ id: '1', artista: 'Y' }], md);
  assert.deepEqual(a.portadas, [YT('vvvvvvvvvvv')]);
});

test('ordena por título, guarda año, cantidad e índice más reciente; ignora pistas sin álbum', () => {
  const tracks = [{ id: '1', artista: 'Z' }, { id: '2', artista: 'Z' }, { id: '3', artista: 'Z' }, { id: '4', artista: 'Z' }];
  const md = crear({ 1: { album: 'beta' }, 2: { album: 'Alfa' }, 3: { album: 'beta', anio: 2001 }, 4: {} });
  const r = armarAlbumes(tracks, md);
  assert.deepEqual(r.map((a) => a.titulo), ['Alfa', 'beta']);
  assert.equal(r[1].anio, 2001);
  assert.equal(r[1].cantidad, 2);
  assert.equal(r[1].indice, 2);
});
