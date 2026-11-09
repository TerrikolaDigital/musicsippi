import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { colorearQr, opcionesQrMarca, QR_FONDO, QR_TINTA_INICIO, QR_TINTA_FIN } from './qr-marca.mjs';

// Contraste WCAG entre dos colores hex: la cámara necesita mucha diferencia de luz entre módulo y fondo.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test('el degradado del QR es oscuro de sobra sobre la placa clara (≥ 7:1 en los dos extremos)', () => {
  assert.ok(contraste(QR_TINTA_INICIO, QR_FONDO) >= 7);
  assert.ok(contraste(QR_TINTA_FIN, QR_FONDO) >= 7);
});

test('colorearQr pone el degradado y la placa clara, y conserva los módulos y el margen', async () => {
  const original = await QRCode.toString('musicsippi://sincronizar?d=192.168.0.10:5173', opcionesQrMarca(240));
  const svg = colorearQr(original);
  assert.match(svg, /<linearGradient id="qr-tinta"/);
  assert.match(svg, /stroke="url\(#qr-tinta\)"/);
  assert.ok(svg.includes(`fill="${QR_FONDO}"`));
  assert.ok(!svg.includes('#000000'));
  const modulos = (s) => s.match(/ d="M[^"]*"/g).at(-1);
  assert.equal(modulos(svg), modulos(original)); // mismo dibujo: solo cambia el color
});

test('colorearQr deja igual un SVG que no reconoce', () => {
  assert.equal(colorearQr('<svg></svg>'), '<svg></svg>');
});
