import test from 'node:test';
import assert from 'node:assert/strict';
import { artistaTop, habitoDeModo, afinidadModo, nombreMezclaModo, mezclasDelDia } from './creadoParaTi.js';
import { portadasCollage } from './comun.js';
import { entradaArtista } from '../noMeGusta.js';

const ahora = new Date(2026, 9, 19, 21, 0).getTime(); // lunes 21:00
const hora = (d, h) => new Date(2026, 9, d, h).getTime();

const ejes = [
  { id: 'chill', nombre: 'Chill', tipo: 'gusto', activo: true },
  { id: 'edm', nombre: 'EDM', tipo: 'gusto', activo: true },
  { id: 'rock', nombre: 'Rock', tipo: 'gusto', activo: true },
  { id: 'favoritos', nombre: 'Favoritas', sistema: true },
];
const tracks = [];
for (let i = 0; i < 90; i += 1) {
  const modo = ['chill', 'edm', 'rock'][i % 3];
  tracks.push({ id: `t${i}`, titulo: `T${i}`, artista: `Art${i % 15}`, ejes: [{ ejeId: modo }] });
}
const conteos = new Map([['chill', 30], ['edm', 30], ['rock', 30]]);
const historial = [];
for (let k = 0; k < 12; k += 1) historial.push({ trackId: `t${(k * 3) % 90}`, ejeId: 'chill', ts: hora(5 + (k % 3), 21) });
for (let k = 0; k < 6; k += 1) historial.push({ trackId: `t${1 + ((k * 3) % 90)}`, ejeId: 'edm', ts: hora(1 + k, 8) });

test('artista top por escuchas, con respaldo por canciones', () => {
  assert.equal(artistaTop([{ trackId: 't0' }, { trackId: 't15' }, { trackId: 't1' }], tracks), 'Art0');
  assert.ok(artistaTop([], tracks));
  assert.equal(artistaTop([], []), null);
});

test('hábito: hora habitual y afinidad con hoy a esta hora', () => {
  const h = habitoDeModo(historial, 'chill');
  assert.equal(h.n, 12);
  assert.ok(Math.abs(h.hora - 21) < 0.01);
  const e = habitoDeModo(historial, 'edm');
  assert.ok(afinidadModo(h, new Date(ahora)) > afinidadModo(e, new Date(ahora)));
  assert.equal(habitoDeModo([], 'x').n, 0);
});

test('nombres según día y ánimo del modo', () => {
  const lun = new Date(2026, 9, 19);
  const vie = new Date(2026, 9, 23);
  assert.equal(nombreMezclaModo({ id: 'chill', nombre: 'Chill' }, lun), 'Lunes tranquilo');
  assert.equal(nombreMezclaModo({ id: 'edm', nombre: 'EDM' }, vie), 'Energía para el viernes');
  assert.equal(nombreMezclaModo({ id: 'rock', nombre: 'Rock' }, vie), 'Rock para el viernes');
});

test('mezclas del día: 3-4, de hasta 40 canciones, sin repetir y estables el mismo día', () => {
  const a = mezclasDelDia({ tracks, historial, ejes, conteos, ahora });
  const b = mezclasDelDia({ tracks, historial, ejes, conteos, ahora: ahora - 12 * 3600000 });
  assert.ok(a.length >= 3 && a.length <= 4, `hay ${a.length}`);
  for (const m of a) {
    assert.ok(m.tracks.length >= 8 && m.tracks.length <= 40, `${m.nombre}: ${m.tracks.length}`);
    assert.equal(new Set(m.tracks.map((t) => t.id)).size, m.tracks.length);
  }
  assert.deepEqual(a.map((m) => m.tracks.map((t) => t.id)), b.map((m) => m.tracks.map((t) => t.id)));
  assert.ok(a[0].nombre.startsWith('Tu mezcla de '));
});

test('cambia al día siguiente', () => {
  const a = mezclasDelDia({ tracks, historial, ejes, conteos, ahora });
  const b = mezclasDelDia({ tracks, historial, ejes, conteos, ahora: ahora + 86400000 });
  assert.notDeepEqual(a.map((m) => m.tracks.map((t) => t.id)), b.map((m) => m.tracks.map((t) => t.id)));
});

test('biblioteca vacía: sin mezclas', () => {
  assert.deepEqual(mezclasDelDia({ tracks: [], historial: [], ejes, conteos, ahora }), []);
});

test('collage de 4 carátulas distintas, con huecos si faltan', () => {
  const ts = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const url = (t) => (t.id === 3 ? null : `u${t.id % 2}`);
  const c = portadasCollage(ts, url, 4);
  assert.equal(c.length, 4);
  assert.deepEqual(c.map((x) => x.src), ['u1', 'u0', null, null]);
});

test('«No me gusta»: ninguna mezcla del día contiene artistas marcados', () => {
  const marcas = [entradaArtista('Art0'), entradaArtista('Art1'), entradaArtista('Art2')];
  const mezclas = mezclasDelDia({ tracks, historial, ejes, conteos, ahora, marcas });
  assert.ok(mezclas.length > 0);
  for (const m of mezclas) assert.ok(!m.tracks.some((t) => ['Art0', 'Art1', 'Art2'].includes(t.artista)), m.id);
});
