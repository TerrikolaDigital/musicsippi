import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOrganizacion, textoDeModoExistente } from './calculo.js';

function modeloFalso() {
  const textos = [];
  const embeber = async (texto) => {
    textos.push(texto);
    const t = texto.toLowerCase();
    if (t.includes('rock')) return Float32Array.from([1, 0, 0, 0]);
    if (t.includes('pop')) return Float32Array.from([0, 1, 0, 0]);
    return Float32Array.from([0, 0, 0.1, 0.1]);
  };
  return { embeber, textos };
}
const fuentes = { vocabulario: { sinonimos: {}, nombresHumanos: { rock: 'Rock', pop: 'Pop' } }, umbrales: { masaMinima: 2, masaMinimaPorcentaje: 1 } };
const pop = { id: 'pop', nombre: 'Pop', tipo: 'gusto', origen: 'descubierto', activo: true, sistema: false, anclas: { artistas: [], titulos: [] }, tagsLastfm: [] };
const sin = [{ ejeId: 'sin-clasificar' }];
const entradaBase = () => ({
  tracks: [
    { id: 't1', artista: 'A', titulo: 'Uno', ejes: sin },
    { id: 't2', artista: 'B', titulo: 'Dos', ejes: sin },
    { id: 't3', artista: 'C', titulo: 'Tres', ejes: sin },
    { id: 't4', artista: 'D', titulo: 'Rockola', ejes: sin },
  ],
  evidencia: [
    ['t1', { generos: ['rock'], senal: 'genero-musicbrainz' }],
    ['t2', { generos: ['rock'], senal: 'genero-deezer' }],
    ['t3', { generos: ['pop'], senal: 'genero-deezer' }],
  ],
  ejes: [pop],
  fuentes,
  totalTracks: 4,
  vectoresPrevios: [],
});

test('modos nuevos + colocación en modos descubiertos ya existentes, con su señal', async () => {
  const { embeber } = modeloFalso();
  const progreso = [];
  const r = await calcularOrganizacion(entradaBase(), { embeber, onProgreso: (p) => progreso.push(p) });
  const porNombre = Object.fromEntries(r.modosConfirmados.map((m) => [m.nombre, new Set(m.trackIds)]));
  assert.deepEqual(porNombre, { Rock: new Set(['t1', 't2', 't4']), Pop: new Set(['t3']) });
  assert.equal(r.senalPorTrack.t1, 'genero-musicbrainz');
  assert.equal(r.senalPorTrack.t4, 'ia-embeddings');
  assert.equal(r.vectoresNuevos.length, 4);
  assert.deepEqual(progreso.at(-1), { fase: 'modos', hechas: 4, total: 4 });
});

test('no vuelve a embeber canciones cuyo texto no cambió', async () => {
  const primero = modeloFalso();
  const { vectoresNuevos } = await calcularOrganizacion(entradaBase(), { embeber: primero.embeber });
  const segundo = modeloFalso();
  const r = await calcularOrganizacion({ ...entradaBase(), vectoresPrevios: vectoresNuevos }, { embeber: segundo.embeber });
  assert.equal(r.vectoresNuevos.length, 0);
  assert.ok(!segundo.textos.some((t) => /^(A|B|C|D) — /.test(t)));
});

test('el texto de un modo existente usa sus términos del vocabulario', () => {
  assert.equal(textoDeModoExistente(pop, fuentes), 'Pop. Géneros: pop.');
  assert.equal(textoDeModoExistente({ nombre: 'Shoegaze' }, fuentes), 'Shoegaze. Géneros: shoegaze.');
});

test('la masa mínima se mide contra la biblioteca completa, no contra las canciones recibidas', async () => {
  const f = { ...fuentes, umbrales: { masaMinima: 3, masaMinimaPorcentaje: 0.5 } };
  const { embeber } = modeloFalso();
  const chica = await calcularOrganizacion({ ...entradaBase(), fuentes: f, totalTracks: 4 }, { embeber });
  assert.ok(chica.modosConfirmados.some((m) => m.nombre === 'Rock'));
  const grande = await calcularOrganizacion({ ...entradaBase(), fuentes: f, totalTracks: 100 }, { embeber });
  assert.ok(!grande.modosConfirmados.some((m) => m.nombre === 'Rock'));
});

test('las que no se colocan salen con su motivo', async () => {
  const { embeber } = modeloFalso();
  const entrada = entradaBase();
  entrada.tracks.push({ id: 't5', artista: 'E', titulo: 'Rara', ejes: [] });
  entrada.evidencia.push(['t5', { generos: [], senal: null }]);
  const r = await calcularOrganizacion(entrada, { embeber });
  for (const id of Object.keys(r.senalPorTrack)) assert.equal(r.sinColocar[id], undefined);
  for (const [id, motivo] of Object.entries(r.sinColocar)) assert.ok(['sin-generos', 'sin-modo-afin'].includes(motivo), `${id}: ${motivo}`);
  assert.ok(r.sinColocar.t5 === 'sin-generos' || r.senalPorTrack.t5 !== undefined);
});

test('no coloca canciones en un mood con autoRellenar:false', async () => {
  const { embeber } = modeloFalso();
  const entrada = entradaBase();
  entrada.ejes = [{ ...pop, autoRellenar: false }];
  const r = await calcularOrganizacion(entrada, { embeber });
  assert.ok(!r.modosConfirmados.some((m) => m.nombre === 'Pop' && m.trackIds.includes('t4')));
});
