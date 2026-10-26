/**
 * True si la biblioteca tiene canciones de siembra (fuentes incluye 'demo',
 * ver scripts/demo-generar-seed.mjs) y ninguna importada de verdad todavía
 * — ver docs/superpowers/specs/2026-09-09-aviso-importar-musica-propia-design.md.
 *
 * Con 0 tracks (recién instalado, antes de sembrar nada) da false: no hay
 * nada de lo que "seguir teniendo". Un track que ya se fusionó con un
 * import real (fuentes:['demo', 'tunemymusic'], por idTrack) cuenta como
 * "tiene una fuente que no es demo" — apenas aparece un track así, deja de
 * mostrarse el aviso.
 */
export function debeMostrarAvisoImportar(tracks) {
  const hayDemo = tracks.some((t) => t.fuentes.includes('demo'));
  const hayReal = tracks.some((t) => t.fuentes.some((f) => f !== 'demo'));
  return hayDemo && !hayReal;
}
