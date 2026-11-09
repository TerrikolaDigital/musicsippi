// src/ui/creditos.js
// Créditos de presentación de la pista que suena: lo comparten la app (mini y reproductor
// completo) y lo que se publica a la notificación / pantalla de bloqueo, para que las tres
// muestren exactamente lo mismo.
//
// Regla: los invitados («feat. Beyoncé», «(with X)», «[ft. Y]») son créditos de ARTISTA, no parte
// del título. En el título quedarían cortados por la elipsis en cuanto el nombre es largo; en la
// línea del artista, que va antes que el álbum, se leen siempre.

const MARCA = String.raw`(?:feat\.?|ft\.?|featuring|with|con)`;
// «Runnin' (feat. Beyoncé)», «Runnin' [ft. Beyoncé]», también en medio: «Song (feat. X) - Remix».
const ENTRE_PARENTESIS = new RegExp(String.raw`\s*[([]\s*${MARCA}\s+([^)\]]+?)\s*[)\]]`, 'i');
// Sin paréntesis solo se aceptan marcas inequívocas: «with»/«con» sueltos son parte de títulos reales
// («Dancing with Myself»).
const SUELTO = /\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;

const normal = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * {titulo, artista} -> {titulo sin invitados, artista con «feat. …»}. Si el artista ya nombra al
 * invitado no se repite. Sin invitados devuelve lo mismo que recibe.
 */
export function separarInvitados({ titulo, artista } = {}) {
  let t = String(titulo ?? '');
  const invitados = [];
  const m = t.match(ENTRE_PARENTESIS) ?? t.match(SUELTO);
  if (m) {
    invitados.push(m[1].trim());
    t = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  }
  const a = String(artista ?? '').trim();
  if (!invitados.length || !t) return { titulo: titulo ?? '', artista: artista ?? '' };
  const nuevos = invitados.filter((inv) => !normal(a).includes(normal(inv)));
  return { titulo: t, artista: nuevos.length ? (a ? `${a} feat. ${nuevos.join(', ')}` : nuevos.join(', ')) : a };
}
