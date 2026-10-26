// Cálculo del organizador (corre en el Worker, pero es puro para poder
// probarlo con un modelo falso): lo mismo que reDescubrirYAutoConfirmar del
// PC sobre las canciones «Sin clasificar», más colocar lo que siga sin modo
// en los modos descubiertos que ya existen (umbrales del PC).
import { descubrirModosNucleo } from '../../scripts/lib/descubrir-modos-nucleo.mjs';
import { crearEmbeberTermino, clasificarPorEmbeddings } from '../../scripts/lib/clasificar-embeddings-puro.mjs';
import { normalizar } from '../../scripts/lib/clasificar.mjs';
import { hashTexto } from './vectores.js';

export function textoDeModoExistente(eje, fuentes) {
  const clave = normalizar(eje.nombre);
  const terminos = Object.entries(fuentes?.vocabulario?.nombresHumanos ?? {})
    .filter(([, humano]) => normalizar(humano) === clave)
    .map(([termino]) => termino);
  if (terminos.length === 0) terminos.push(clave);
  return `${eje.nombre}. Géneros: ${terminos.join(', ')}.`;
}

export async function calcularOrganizacion(entrada, { embeber, onProgreso = () => {} }) {
  const { tracks, evidencia, ejes, fuentes, totalTracks, vectoresPrevios = [] } = entrada;
  const evidenciaPorId = new Map(evidencia);
  const generosPorTrack = new Map([...evidenciaPorId].map(([id, e]) => [id, e.generos ?? []]));
  const previos = new Map(vectoresPrevios.map((v) => [v.trackId, v]));
  const vectores = new Map();
  const vectoresNuevos = [];

  const deps = {
    ejes,
    embeber,
    embeberTermino: crearEmbeberTermino(embeber),
    async prepararVectores(ts, textoDe) {
      let hechas = 0;
      for (const t of ts) {
        const texto = textoDe(t);
        const hash = hashTexto(texto);
        const previo = previos.get(t.id);
        if (previo && previo.hash === hash) {
          vectores.set(t.id, previo.vector);
        } else {
          const vector = await embeber(texto);
          vectores.set(t.id, vector);
          vectoresNuevos.push({ trackId: t.id, hash, vector });
        }
        onProgreso({ fase: 'modos', hechas: ++hechas, total: ts.length });
      }
    },
    vectorDe: (id) => vectores.get(id) ?? null,
  };

  const { modosCandidatos } = await descubrirModosNucleo(tracks, generosPorTrack, fuentes, deps, totalTracks);
  const modosConfirmados = modosCandidatos
    .filter((m) => m.trackIds.length > 0)
    .map((m) => ({ nombre: m.nombre, trackIds: [...m.trackIds] }));

  // Lo que siga sin modo, a un modo descubierto que ya exista (se anota al PC
  // por nombre en confirmar-modos, que lo fusiona con el suyo).
  const colocadas = new Set(modosConfirmados.flatMap((m) => m.trackIds));
  // Solo géneros (o modos antiguos sin familia): un estado (Zen, Party…) no se rellena por parecido de nombre (R7/R2).
  const existentes = ejes.filter((e) => e.origen === 'descubierto' && e.activo !== false && !e.sistema && e.autoRellenar !== false && (e.familia === undefined || e.familia === 'genero'));
  if (existentes.length > 0) {
    const embEjes = [];
    for (const e of existentes) embEjes.push({ ejeId: e.nombre, emb: await embeber(textoDeModoExistente(e, fuentes)) });
    const porNombre = new Map();
    for (const t of tracks) {
      if (colocadas.has(t.id)) continue;
      const v = vectores.get(t.id);
      const s = v ? clasificarPorEmbeddings(v, embEjes) : null;
      if (!s) continue;
      if (!porNombre.has(s.ejeId)) porNombre.set(s.ejeId, []);
      porNombre.get(s.ejeId).push(t.id);
    }
    for (const [nombre, trackIds] of porNombre) modosConfirmados.push({ nombre, trackIds });
  }

  // Misma regla que el PC: sin evidencia propia, el track entró por embeddings.
  const senalPorTrack = {};
  for (const m of modosConfirmados) {
    for (const id of m.trackIds) senalPorTrack[id] = evidenciaPorId.get(id)?.senal ?? 'ia-embeddings';
  }
  // Las que siguen sin modo, con el motivo (para enseñarlas en Ajustes).
  const sinColocar = {};
  for (const t of tracks) {
    if (senalPorTrack[t.id] !== undefined) continue;
    sinColocar[t.id] = (evidenciaPorId.get(t.id)?.generos ?? []).length === 0 ? 'sin-generos' : 'sin-modo-afin';
  }
  return { modosConfirmados, senalPorTrack, vectoresNuevos, sinColocar };
}
