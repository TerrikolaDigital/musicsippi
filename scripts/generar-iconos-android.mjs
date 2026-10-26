// scripts/generar-iconos-android.mjs
// Genera icono (adaptativo + clásico) y pantallas de arranque de la app Android
// a partir de public/musicsippi-app-icon-1024.png. Sobrescribe los PNG de la
// plantilla de Capacitor en android/app/src/main/res/ manteniendo sus tamaños.
//   node scripts/generar-iconos-android.mjs
import sharp from 'sharp';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const ORIGEN = join(RAIZ, 'public', 'musicsippi-app-icon-1024.png');
const RES = join(RAIZ, 'android', 'app', 'src', 'main', 'res');

// Color del fondo del propio icono (se toma del centro-arriba, dentro del cuadrado redondeado).
const { data } = await sharp(ORIGEN).extract({ left: 512, top: 40, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const fondo = { r: data[0], g: data[1], b: data[2], alpha: 1 };
const hex = '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
console.log('fondo', hex);

const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, f] of Object.entries(DENSIDADES)) {
  const dir = join(RES, `mipmap-${d}`);
  if (!existsSync(dir)) continue;
  // Clásico (Android < 8): el icono tal cual, con sus esquinas redondeadas.
  const clasico = Math.round(48 * f);
  await sharp(ORIGEN).resize(clasico, clasico).png().toFile(join(dir, 'ic_launcher.png'));
  const circulo = Buffer.from(`<svg width="${clasico}" height="${clasico}"><circle cx="${clasico / 2}" cy="${clasico / 2}" r="${clasico / 2}"/></svg>`);
  await sharp(ORIGEN)
    .resize(clasico, clasico)
    .composite([{ input: circulo, blend: 'dest-in' }])
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));
  // Adaptativo: lienzo de 108 dp; el sistema recorta hasta la zona segura
  // central de 66 dp, así que el dibujo va a ~70 % para que no se corten las notas.
  const lienzo = Math.round(108 * f);
  const dibujo = Math.round(lienzo * 0.7);
  const icono = await sharp(ORIGEN).resize(dibujo, dibujo).png().toBuffer();
  await sharp({ create: { width: lienzo, height: lienzo, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: icono, gravity: 'center' }])
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));
}

// Fondo del icono adaptativo.
writeFileSync(
  join(RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${hex}</color>\n</resources>\n`
);

// Pantallas de arranque: mismo tamaño que las de la plantilla, fondo del icono
// y el icono centrado a un 28 % del lado corto.
const carpetasSplash = readdirSync(RES).filter((c) => c.startsWith('drawable'));
for (const c of carpetasSplash) {
  const archivo = join(RES, c, 'splash.png');
  if (!existsSync(archivo)) continue;
  const { width, height } = await sharp(archivo).metadata();
  const lado = Math.round(Math.min(width, height) * 0.28);
  const icono = await sharp(ORIGEN).resize(lado, lado).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: fondo } })
    .composite([{ input: icono, gravity: 'center' }])
    .png()
    .toFile(archivo + '.tmp');
  const { renameSync } = await import('node:fs');
  renameSync(archivo + '.tmp', archivo);
  console.log('splash', c, `${width}x${height}`);
}
console.log('listo');
