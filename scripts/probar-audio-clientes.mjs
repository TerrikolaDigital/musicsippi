// Prueba resolverAudio() (src/data/audio-nativo.js) en Node con fetch normal:
// por cada videoId imprime el cliente de youtubei.js que funcionó, el mime y
// el HTTP status de un rango de 256 KB pedido con los mismos headers que
// usará el reproductor nativo (user-agent del cliente que firmó la URL).
//
//   node scripts/probar-audio-clientes.mjs dQw4w9WgXcQ kJQP7kiw5Fk fJ9rUzIMcZQ
//   node scripts/probar-audio-clientes.mjs --clientes=IOS,ANDROID_VR <ids...>
import { resolverAudio } from '../src/data/audio-nativo.js';

const args = process.argv.slice(2);
const opClientes = args.find((a) => a.startsWith('--clientes='));
const clientes = opClientes ? opClientes.slice('--clientes='.length).split(',') : undefined;
const ids = args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('Uso: node scripts/probar-audio-clientes.mjs [--clientes=IOS,...] <videoId> [...]');
  process.exit(1);
}

let fallos = 0;
for (const id of ids) {
  try {
    const t0 = Date.now();
    const r = await resolverAudio(id, { forzar: true, clientes });
    const msResolver = Date.now() - t0;
    const resp = await fetch(r.url, { headers: { ...r.headers, Range: 'bytes=0-262143' } });
    const bytes = (await resp.arrayBuffer()).byteLength;
    const ok = resp.status === 206 || resp.status === 200;
    if (!ok) fallos++;
    console.log(
      `${id}  cliente=${r.cliente}  mime=${r.mime}  dur=${r.duracion}s  resolver=${msResolver}ms  HTTP ${resp.status}  ${bytes} bytes  ${ok ? 'OK' : 'FALLO'}`
    );
  } catch (e) {
    fallos++;
    console.log(`${id}  ERROR [${e.codigo ?? '?'}] ${e.message}`);
  }
}
process.exit(fallos ? 1 : 0);
