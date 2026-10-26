/**
 * Migración de una sola vez: fusiona cada lista importada con el modo
 * descubierto del mismo nombre, y los modos descubiertos duplicados entre sí
 * (ver scripts/lib/fusionar-modos-duplicados.mjs).
 *
 * Por defecto SOLO SIMULA. Con --aplicar, primero copia los archivos a
 * <dataDir>/backup-fusion-modos-<fecha-hora>/ y luego escribe de forma atómica.
 * Cerrar la app de escritorio antes de aplicar.
 *
 *   node scripts/fusionar-modos-duplicados.mjs            # simulación
 *   node scripts/fusionar-modos-duplicados.mjs --aplicar
 */
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolverRaizYDataDir } from './lib/data-dir.mjs';
import { escribirAtomico } from './lib/escribir-atomico.mjs';
import { fusionarModosDuplicados } from './lib/fusionar-modos-duplicados.mjs';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const aplicar = process.argv.includes('--aplicar');
const { dataDir } = resolverRaizYDataDir(import.meta.url);
const rutas = {
  biblioteca: join(dataDir, 'biblioteca.json'),
  ejes: join(dataDir, 'ejes.json'),
  historial: join(dataDir, 'historial.json'),
  ultimos: join(dataDir, 'ultimos-modos.json'),
  overrides: join(dataDir, 'overrides.json'),
};
const biblioteca = leer(rutas.biblioteca);
const ejesData = leer(rutas.ejes);
const historial = existsSync(rutas.historial) ? leer(rutas.historial) : null;
const ultimosCrudo = existsSync(rutas.ultimos) ? leer(rutas.ultimos) : null;
const ultimos = Array.isArray(ultimosCrudo) ? ultimosCrudo : null;

const res = fusionarModosDuplicados(ejesData, biblioteca, historial ?? [], ultimos ?? []);
console.log(`Datos: ${dataDir}`);
console.log(aplicar ? 'Modo: APLICAR' : 'Modo: SIMULACIÓN (nada se escribe; usar --aplicar)');
if (res.length === 0) {
  console.log('No hay modos duplicados con el mismo nombre (lista <-> descubierto ni descubierto <-> descubierto). Nada que hacer.');
  process.exit(0);
}
for (const r of res) {
  const cabecera =
    r.tipo === 'lista'
      ? `eje "${r.duplicado}" -> "${r.lista}" (la lista pasa a modo gusto/descubierto)`
      : `se conserva "${r.lista}" y se elimina "${r.duplicado}" (ambos descubiertos)`;
  console.log(
    `- "${r.nombre}": ${cabecera}; ${r.movidas} canciones movidas, ${r.yaEnLista} ya estaban en el conservado; se elimina "${r.duplicado}".`
  );
}
// overrides.json guarda correcciones por canción (título/artista/...), no ids de eje: no se toca.
const aEscribir = [
  ['biblioteca.json', rutas.biblioteca, biblioteca],
  ['ejes.json', rutas.ejes, ejesData],
  ...(historial ? [['historial.json', rutas.historial, historial]] : []),
  ...(ultimos ? [['ultimos-modos.json', rutas.ultimos, ultimos]] : []),
];
console.log(`Archivos a escribir: ${aEscribir.map(([n]) => n).join(', ')}`);
if (!aplicar) process.exit(0);

const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const backup = join(dataDir, `backup-fusion-modos-${sello}`);
mkdirSync(backup, { recursive: true });
for (const ruta of Object.values(rutas)) if (existsSync(ruta)) copyFileSync(ruta, join(backup, basename(ruta)));
console.log(`Backup en ${backup}`);
for (const [, ruta, datos] of aEscribir) escribirAtomico(ruta, datos);
console.log('Hecho.');
