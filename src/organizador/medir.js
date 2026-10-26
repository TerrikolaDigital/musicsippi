// Diagnóstico: en el móvil, desde chrome://inspect → consola:
//   await __medirOrganizador({ dtype: 'q8' })
import { crearCanalWorker } from './canal-worker.js';

const TEXTOS = [
  'Soda Stereo — Persiana americana. Géneros: rock, new wave.',
  'Rosalía — Malamente. Géneros: flamenco, pop.',
  'Bad Bunny — Tití me preguntó. Géneros: reggaeton, latin.',
  'Daft Punk — One More Time. Géneros: house, electronic.',
  'Miles Davis — So What. Géneros: jazz.',
  'Nirvana — Come as You Are. Géneros: grunge, alternative rock.',
  'Lofi Girl — Snowman. Géneros: lofi, chill.',
  'Hans Zimmer — Time. Géneros: soundtrack, orchestral.',
  'Bob Marley — Is This Love. Géneros: reggae.',
  'Metallica — Enter Sandman. Géneros: heavy metal.',
  'Shakira — Dai Dai.',
  'Karol G — BbY WOW.',
  'C. Tangana — Tú me dejaste de querer. Géneros: flamenco pop.',
  'Arctic Monkeys — Do I Wanna Know?. Géneros: indie rock.',
  'Aitana — Mon Amour. Géneros: pop.',
  'Ludovico Einaudi — Nuvole Bianche. Géneros: piano, classical.',
  'Eminem — Lose Yourself. Géneros: hip hop, rap.',
  'Juan Luis Guerra — Ojalá que llueva café. Géneros: merengue, bachata.',
  'Bizarrap — Quevedo: Bzrp Music Sessions, Vol. 52.',
  'Norah Jones — Don’t Know Why. Géneros: jazz, soul.',
];

export async function medirOrganizador({ dtype = 'q8', repeticiones = 3 } = {}) {
  const pedir = crearCanalWorker(() => new Worker(new URL('./organizador.worker.js', import.meta.url), { type: 'module' }));
  const textos = Array.from({ length: repeticiones }, () => TEXTOS).flat();
  try {
    const resultado = await pedir('medir', { dtype, textos }, (p) => console.log('[medir]', p));
    console.table(resultado);
    return resultado;
  } finally {
    // Sin esto, cada medición dejaría un worker con su modelo cargado en memoria.
    pedir.terminar();
  }
}
