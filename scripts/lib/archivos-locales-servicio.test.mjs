import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LIMITE_ARCHIVO, crearServicioArchivos, firmarPeticion, pruebaDelPC } from './archivos-locales.mjs';

const SHA = 'a'.repeat(64);
const sha = (b) => createHash('sha256').update(b).digest('hex');

function servicio() {
  const dataDir = mkdtempSync(join(tmpdir(), 'ms-arch-'));
  return { dataDir, s: crearServicioArchivos({ dataDir, espacioLibre: () => 10 ** 12 }) };
}

/** Petición firmada como lo haría el móvil: pide un nonce y firma método|ruta|cuerpo|nonce|ts. */
function firmada(s, clave, host, metodo, ruta, cuerpo = '') {
  const nonce = s.emitirNonce(host);
  const ts = Date.now();
  const crudo = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  return { metodo, ruta, cuerpo: crudo, nonce, ts, firma: firmarPeticion(clave, { metodo, ruta, cuerpo: crudo, nonce, ts }) };
}

test('el servicio exige firma para el manifiesto y lo completa con hashes en segundo plano', async () => {
  const { dataDir, s } = servicio();
  const mp3 = join(dataDir, 'cancion.mp3');
  writeFileSync(mp3, 'contenido de audio');
  s.registrarArchivoPC('t1', mp3);
  const clave = s.claveEmparejamiento();
  const host = '192.168.1.5';
  const pedir = (c = clave, h = host) => s.manifiesto({ auth: firmada(s, c, h, 'GET', 'archivos-locales/manifiesto'), host: h });
  assert.equal(pedir('mala'.padEnd(48, 'x')).status, 401);
  assert.equal(pedir(clave, '8.8.8.8').status, 403);
  assert.deepEqual(pedir().cuerpo.archivos, []);
  await s.completarHashes();
  const [a] = pedir().cuerpo.archivos;
  assert.equal(a.sha256, sha('contenido de audio'));
  assert.ok(!JSON.stringify(a).includes(dataDir));
  assert.equal(s.claveEmparejamiento(), clave);
});

test('un nonce repetido, de otro equipo o con marca vieja se rechaza; la firma liga el cuerpo', () => {
  const { s } = servicio();
  const clave = s.claveEmparejamiento();
  const host = '192.168.1.5';
  const auth = firmada(s, clave, host, 'GET', 'archivos-locales/manifiesto');
  assert.equal(s.manifiesto({ auth, host }).status, 200);
  assert.equal(s.manifiesto({ auth, host }).status, 401, 'nonce repetido');
  const otro = firmada(s, clave, host, 'GET', 'archivos-locales/manifiesto');
  assert.equal(s.manifiesto({ auth: otro, host: '192.168.1.6' }).status, 401, 'nonce emitido a otro equipo');
  const vieja = firmada(s, clave, host, 'GET', 'archivos-locales/manifiesto');
  vieja.ts = Date.now() - 10 * 60 * 1000;
  vieja.firma = firmarPeticion(clave, vieja);
  assert.equal(s.manifiesto({ auth: vieja, host }).status, 401);
  const cuerpo = { trackId: 't', sha256: SHA, tamano: 10, mime: 'audio/mpeg', direccion: 'subida' };
  const manipulada = firmada(s, clave, host, 'POST', 'archivos-locales/iniciar', cuerpo);
  const otroCuerpo = { ...cuerpo, trackId: 'otro' };
  manipulada.cuerpo = JSON.stringify(otroCuerpo);
  assert.equal(s.iniciar({ auth: manipulada, host, cuerpo: otroCuerpo }).status, 401);
});

test('saludo: la prueba liga reto, nonce propio y dirección; un relay no obtiene nada reutilizable', () => {
  const { s } = servicio();
  const clave = s.claveEmparejamiento();
  const reto = 'ab'.repeat(16);
  const r1 = s.hola({ reto, host: '192.168.1.5', direccionPC: '192.168.1.10:5000' }).cuerpo;
  assert.equal(r1.prueba, pruebaDelPC(clave, { reto, nonce: r1.nonce, direccionPC: '192.168.1.10:5000' }));
  const r2 = s.hola({ reto, host: '192.168.1.5', direccionPC: '192.168.1.10:5000' }).cuerpo;
  assert.notEqual(r1.prueba, r2.prueba, 'el mismo reto reenviado da otra prueba (nonce propio nuevo)');
  assert.notEqual(r1.prueba, pruebaDelPC(clave, { reto, nonce: r1.nonce, direccionPC: '192.168.1.99:5000' }));
  // el nonce del saludo no sirve para firmar peticiones
  const ts = Date.now();
  const base = { metodo: 'GET', ruta: 'archivos-locales/manifiesto', cuerpo: '', nonce: r1.nonce, ts };
  assert.equal(s.manifiesto({ auth: { ...base, firma: firmarPeticion(clave, base) }, host: '192.168.1.5' }).status, 401);
  assert.equal(s.hola({ reto: 'corto', host: '192.168.1.5', direccionPC: 'x' }).status, 400);
});

test('subida: reanuda desde lo recibido, valida el checksum y promueve el archivo', async () => {
  const { s } = servicio();
  const clave = s.claveEmparejamiento();
  const host = '192.168.1.9';
  const f = (m, r, c) => firmada(s, clave, host, m, `archivos-locales/${r}`, c);
  const datos = Buffer.from('0123456789'.repeat(300));
  const cuerpo = { trackId: 't9', sha256: sha(datos), tamano: datos.length, mime: 'audio/mpeg', direccion: 'subida' };
  const bloque = (token, a, b) => s.recibirBloque({ auth: f('PUT', 'bloque', { token }), host, token, rango: { inicio: a, fin: b }, datos: datos.subarray(a, b) });
  let r = s.iniciar({ auth: f('POST', 'iniciar', cuerpo), host, cuerpo });
  assert.equal(r.status, 200);
  assert.equal(bloque(r.cuerpo.token, 0, 1024).status, 200);
  r = s.iniciar({ auth: f('POST', 'iniciar', cuerpo), host, cuerpo });
  assert.equal(r.cuerpo.reanudableDesde, 1024);
  const t = r.cuerpo.token;
  assert.equal(bloque(t, 0, 1024).status, 416);
  assert.equal(bloque(t, 1024, datos.length).status, 200);
  assert.equal((await s.finalizar({ auth: f('POST', 'finalizar', { token: t }), host, token: t })).status, 200);
  assert.equal(s.indice().t9.sha256, sha(datos));
  assert.ok(existsSync(s.indice().t9.ruta));
  assert.equal((await s.finalizar({ auth: f('POST', 'finalizar', { token: t }), host, token: t })).status, 401, 'token de un solo uso');
});

test('subida con checksum erróneo: borra el temporal y deja reintentar desde cero', async () => {
  const { s } = servicio();
  const clave = s.claveEmparejamiento();
  const host = '192.168.1.9';
  const f = (m, r, c) => firmada(s, clave, host, m, `archivos-locales/${r}`, c);
  const datos = Buffer.from('abcdef');
  const cuerpo = { trackId: 't', sha256: sha('otra cosa'), tamano: datos.length, mime: 'audio/mpeg', direccion: 'subida' };
  const token = s.iniciar({ auth: f('POST', 'iniciar', cuerpo), host, cuerpo }).cuerpo.token;
  s.recibirBloque({ auth: f('PUT', 'bloque', { token }), host, token, rango: { inicio: 0, fin: 6 }, datos });
  const fin = await s.finalizar({ auth: f('POST', 'finalizar', { token }), host, token });
  assert.equal(fin.status, 409);
  assert.equal(fin.cuerpo.error, 'checksum');
  assert.equal(s.iniciar({ auth: f('POST', 'iniciar', cuerpo), host, cuerpo }).cuerpo.reanudableDesde, 0);
});

test('descarga: solo el archivo indexado con ese hash, por rangos, y el token no sirve desde otro equipo', async () => {
  const { dataDir, s } = servicio();
  const clave = s.claveEmparejamiento();
  const mp3 = join(dataDir, 'x.mp3');
  writeFileSync(mp3, 'abcdefghij');
  s.registrarArchivoPC('t1', mp3);
  await s.completarHashes();
  const h = '192.168.1.9';
  const f = (host, m, r, c) => firmada(s, clave, host, m, `archivos-locales/${r}`, c);
  const cuerpo = { trackId: 't1', sha256: sha('abcdefghij'), tamano: 10, direccion: 'descarga' };
  const mala = { ...cuerpo, sha256: SHA };
  assert.equal(s.iniciar({ auth: f(h, 'POST', 'iniciar', mala), host: h, cuerpo: mala }).status, 404);
  const { token } = s.iniciar({ auth: f(h, 'POST', 'iniciar', cuerpo), host: h, cuerpo }).cuerpo;
  const leer = (host, a, b) => s.leerBloque({ auth: f(host, 'GET', `bloque?token=${token}`), host, token, inicio: a, fin: b });
  assert.equal(leer('192.168.1.77', 0, 4).status, 403);
  const b = leer(h, 3, 7);
  assert.equal(b.status, 206);
  assert.equal(Buffer.from(b.cuerpo.base64, 'base64').toString(), 'defg');
  const grande = { ...cuerpo, tamano: LIMITE_ARCHIVO + 1 };
  assert.equal(s.iniciar({ auth: f(h, 'POST', 'iniciar', grande), host: h, cuerpo: grande }).status, 413);
});
