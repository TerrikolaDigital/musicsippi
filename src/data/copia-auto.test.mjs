import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeOfrecer, debeCopiar, LATIDO_MS, ejecutarCopiaAuto, sha256Hex, iniciarEstado, posponer, activar, desactivar, mutarEstado, destinoEnMovil } from './copia-auto.js';

const DIA = 24 * 3600 * 1000;
const AHORA = 100 * DIA;
const base = (o = {}) => ({ primerUso: AHORA, uri: null, ultimaCopia: null, ultimaEscritura: null, hash: null, fallos: 0, error: null, posposiciones: 0, ultimaPosposicion: null, ...o });

test('debeOfrecer: umbrales de canciones y días', () => {
  assert.equal(debeOfrecer(base({ primerUso: AHORA - 29 * DIA }), { ahora: AHORA, canciones: 299 }), false);
  assert.equal(debeOfrecer(base({ primerUso: AHORA - 29 * DIA }), { ahora: AHORA, canciones: 300 }), true);
  assert.equal(debeOfrecer(base({ primerUso: AHORA - 30 * DIA }), { ahora: AHORA, canciones: 0 }), true);
});
test('debeOfrecer: con uri o demasiadas posposiciones, no', () => {
  assert.equal(debeOfrecer(base({ uri: 'content://x' }), { ahora: AHORA, canciones: 999 }), false);
  assert.equal(debeOfrecer(base({ posposiciones: 3 }), { ahora: AHORA, canciones: 999 }), false);
});
test('debeOfrecer: pospuesto hace 13 días no, hace 14 sí', () => {
  assert.equal(debeOfrecer(base({ posposiciones: 1, ultimaPosposicion: AHORA - 13 * DIA }), { ahora: AHORA, canciones: 999 }), false);
  assert.equal(debeOfrecer(base({ posposiciones: 1, ultimaPosposicion: AHORA - 14 * DIA }), { ahora: AHORA, canciones: 999 }), true);
});
test('debeCopiar: 23 h no, 24 h sí, con error no, sin uri no', () => {
  const H = 3600 * 1000;
  assert.equal(debeCopiar(base({ uri: 'u', ultimaCopia: AHORA - 23 * H }), { ahora: AHORA }), false);
  assert.equal(debeCopiar(base({ uri: 'u', ultimaCopia: AHORA - 24 * H }), { ahora: AHORA }), true);
  assert.equal(debeCopiar(base({ uri: 'u', ultimaCopia: null }), { ahora: AHORA }), true);
  assert.equal(debeCopiar(base({ uri: 'u', error: 'escritura' }), { ahora: AHORA }), false);
  assert.equal(debeCopiar(base(), { ahora: AHORA }), false);
});

function montar(estadoIni, { texto = '{"a":"é"}', escribir } = {}) {
  let estado = estadoIni;
  const llamadas = { escribir: 0 };
  const deps = {
    leerEstado: async () => estado,
    guardarEstado: async (e) => { estado = e; },
    exportar: async () => texto,
    escribir: async (uri, t) => {
      llamadas.escribir++;
      return escribir ? escribir(uri, t) : { bytes: new TextEncoder().encode(t).length, sha256: await sha256Hex(t) };
    },
  };
  return { deps, llamadas, get estado() { return estado; } };
}
const viejo = (o = {}) => base({ uri: 'u', ultimaCopia: 0, ...o });

test('sha256Hex conocido', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('ejecutarCopiaAuto: omitida si no toca', async () => {
  const m = montar(base());
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'omitida');
  assert.equal(m.llamadas.escribir, 0);
});
test('ejecutarCopiaAuto: hash igual -> sin-cambios, no escribe', async () => {
  const h = await sha256Hex('{"a":"é"}');
  const m = montar(viejo({ hash: h, ultimaEscritura: AHORA - 6 * DIA }));
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'sin-cambios');
  assert.equal(m.llamadas.escribir, 0);
  assert.equal(m.estado.ultimaCopia, AHORA);
});
test('ejecutarCopiaAuto: hash igual pero latido vencido (o sin ultimaEscritura) -> escribe', async () => {
  assert.equal(LATIDO_MS, 7 * DIA);
  const h = await sha256Hex('{"a":"é"}');
  for (const ue of [AHORA - 7 * DIA, null]) {
    const m = montar(viejo({ hash: h, ultimaEscritura: ue }));
    assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'copiada');
    assert.equal(m.llamadas.escribir, 1);
    assert.equal(m.estado.ultimaEscritura, AHORA);
  }
});
test('ejecutarCopiaAuto: exportar que rechaza cuenta como fallo', async () => {
  const m = montar(viejo());
  m.deps.exportar = async () => { throw new Error('db'); };
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
  assert.equal(m.estado.fallos, 1);
  assert.equal(m.estado.error, null);
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
  assert.equal(m.estado.error, 'escritura');
  assert.equal(m.llamadas.escribir, 0);
});
test('ejecutarCopiaAuto: éxito guarda hash y limpia fallos', async () => {
  const m = montar(viejo({ fallos: 1 }));
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'copiada');
  assert.equal(m.estado.fallos, 0);
  assert.equal(m.estado.error, null);
  assert.equal(m.estado.hash, await sha256Hex('{"a":"é"}'));
  assert.equal(m.estado.ultimaCopia, AHORA);
});
test('ejecutarCopiaAuto: sha distinto -> fallo sin error; segundo fallo -> escritura', async () => {
  const m = montar(viejo(), { escribir: async (u, t) => ({ bytes: new TextEncoder().encode(t).length, sha256: 'x' }) });
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
  assert.equal(m.estado.fallos, 1);
  assert.equal(m.estado.error, null);
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
  assert.equal(m.estado.fallos, 2);
  assert.equal(m.estado.error, 'escritura');
});
test('ejecutarCopiaAuto: bytes distintos (UTF-8) -> fallo', async () => {
  const m = montar(viejo(), { escribir: async (u, t) => ({ bytes: t.length, sha256: await sha256Hex(t) }) });
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
  assert.equal(m.estado.fallos, 1);
});
test('ejecutarCopiaAuto: sin-permiso y no-encontrado fijan error al primer fallo', async () => {
  for (const msg of ['sin-permiso', 'no-encontrado']) {
    const m = montar(viejo(), { escribir: async () => { throw new Error(msg); } });
    assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'fallo');
    assert.equal(m.estado.error, msg);
    assert.equal(m.estado.fallos, 1);
  }
});
test('ejecutarCopiaAuto: otro error cuenta como fallo de escritura al segundo', async () => {
  const m = montar(viejo(), { escribir: async () => { throw new Error('boom'); } });
  await ejecutarCopiaAuto(m.deps, AHORA);
  assert.equal(m.estado.error, null);
  await ejecutarCopiaAuto(m.deps, AHORA);
  assert.equal(m.estado.error, 'escritura');
});
test('ejecutarCopiaAuto: serializada, la segunda llamada espera y no vuelve a escribir', async () => {
  let liberar;
  const puerta = new Promise((r) => { liberar = r; });
  const m = montar(viejo(), { escribir: async (u, t) => { await puerta; return { bytes: new TextEncoder().encode(t).length, sha256: await sha256Hex(t) }; } });
  const p1 = ejecutarCopiaAuto(m.deps, AHORA);
  const p2 = ejecutarCopiaAuto(m.deps, AHORA);
  liberar();
  assert.equal(await p1, 'copiada');
  assert.equal(await p2, 'omitida'); // releyó el estado: ya no toca
  assert.equal(m.llamadas.escribir, 1);
  const m2 = montar(viejo({ ultimaCopia: 0 }));
  assert.equal(await ejecutarCopiaAuto(m2.deps, AHORA), 'copiada');
});
test('I1: con huella, el hash es de la huella y la verificación sigue siendo del texto escrito', async () => {
  let n = 0;
  const m = montar(viejo(), { texto: '{"fecha":1,"stores":"S"}' });
  m.deps.exportar = async () => `{"fecha":${++n},"stores":"S"}`;
  m.deps.huella = async (t) => JSON.parse(t).stores;
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA), 'copiada');
  assert.equal(m.estado.hash, await sha256Hex('S'));
  // segundo día, fecha distinta pero mismos datos: sin escribir
  const antes = m.llamadas.escribir;
  assert.equal(await ejecutarCopiaAuto(m.deps, AHORA + 2 * DIA), 'sin-cambios');
  assert.equal(m.llamadas.escribir, antes);
});
test('mutarEstado: lee y guarda dentro de la cola, tras la copia en curso', async () => {
  let liberar;
  const puerta = new Promise((r) => { liberar = r; });
  const m = montar(viejo(), { escribir: async (u, t) => { await puerta; return { bytes: new TextEncoder().encode(t).length, sha256: await sha256Hex(t) }; } });
  const p1 = ejecutarCopiaAuto(m.deps, AHORA);
  const p2 = mutarEstado(m.deps, (e) => posponer(e, 9));
  liberar();
  await Promise.all([p1, p2]);
  assert.equal(m.estado.posposiciones, 1);
  assert.equal(m.estado.ultimaCopia, AHORA); // la copia no se perdió
});
test('iniciarEstado, posponer, activar, desactivar', () => {
  assert.equal(iniciarEstado({}, 5).primerUso, 5);
  assert.equal(iniciarEstado({ primerUso: 3 }, 5).primerUso, 3);
  const p = posponer(base(), 7);
  assert.equal(p.posposiciones, 1);
  assert.equal(p.ultimaPosposicion, 7);
  const a = activar(base({ error: 'sin-permiso', fallos: 2, hash: 'h' }), 'content://y');
  assert.equal(a.uri, 'content://y');
  assert.equal(a.error, null);
  assert.equal(a.fallos, 0);
  assert.equal(a.hash, null);
  assert.equal(a.ultimaCopia, null);
  assert.equal(a.ultimaEscritura, null);
  const d = desactivar(base({ uri: 'u', error: 'escritura', fallos: 2, hash: 'h', ultimaCopia: 5, ultimaEscritura: 5 }));
  assert.deepEqual([d.uri, d.error, d.fallos, d.hash, d.ultimaCopia, d.ultimaEscritura], [null, null, 0, null, null, null]);
});

test('destinoEnMovil: true para almacenamiento del móvil, false para nube o inválido', () => {
  assert.equal(destinoEnMovil('content://com.android.externalstorage.documents/document/primary%3AMusic'), true);
  assert.equal(destinoEnMovil('content://com.android.providers.downloads.documents/document/12'), true);
  assert.equal(destinoEnMovil('content://com.android.providers.media.documents/document/audio%3A5'), true);
  assert.equal(destinoEnMovil('content://com.android.providers.otros/document/1'), true);
  assert.equal(destinoEnMovil('content://com.android.externalstorage.otro/document/1'), true);
  assert.equal(destinoEnMovil('content://com.google.android.apps.docs.storage/document/acc%3A1'), false);
  assert.equal(destinoEnMovil('content://com.microsoft.skydrive.content.StorageAccessProvider/document/1'), false);
  assert.equal(destinoEnMovil('content://com.dropbox.product.android.dbapp.document_provider.documents/document/1'), false);
  assert.equal(destinoEnMovil(null), false);
  assert.equal(destinoEnMovil(''), false);
  assert.equal(destinoEnMovil('no es uri'), false);
  assert.equal(destinoEnMovil(42), false);
});
