// src/movil/resumen/tarjeta.js
// Tarjetas compartibles del resumen, dibujadas a mano en canvas. `dibujarTarjeta` pinta en un
// espacio lógico de 1080 × (1920 | 1080) con el transform que traiga el contexto: la vista previa
// y la miniatura escalan con ctx.scale() y la imagen final se pinta a tamaño completo, así que lo
// que se ve es lo que se comparte. Si una imagen no carga (CORS, red) se pinta una de reserva.
import { compartir, compartirImagen, esAndroid, guardarImagenGaleria } from '../../data/nativo-movil.js';

export const ANCHO = 1080;
export const FORMATOS = { historia: { ancho: 1080, alto: 1920 }, cuadrado: { ancho: 1080, alto: 1080 } };
export const ESTILOS = ['color', 'portada', 'oscuro'];

const DISPLAY = "Fraunces, Georgia, serif";
const TEXTO = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const NOCHE = '#0a0b16';
const REALCE = '#ff6b9a'; // el nº 1 de cada lista, del rosa de la marca
const M = 80; // margen lateral

// ---------- utilidades ----------

/** Carga una imagen con CORS; null si falla o tarda demasiado (nunca rechaza). */
export function cargarImagen(url, ms = 6000) {
  if (!url || !/^(https?:|data:|blob:)/.test(url)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), ms);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = url;
  });
}

function aRgb(color) {
  const s = String(color ?? '').trim();
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((ch) => ch + ch).join('') : h[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  }
  const r = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(s);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : [124, 92, 255];
}
const rgb = (v) => `rgb(${v.map((x) => Math.round(x)).join(' ')})`;
/** Mezcla `color` con `otro` (k = parte de `otro`, 0–1). */
export function mezclar(color, otro, k) {
  const a = aRgb(color);
  const b = aRgb(otro);
  return rgb(a.map((v, i) => v + (b[i] - v) * k));
}

export function medidas(formato) {
  return FORMATOS[formato] ?? FORMATOS.historia;
}

/** «45 min» / «2 h 10 min» a partir de segundos. */
export function tiempo(seg) {
  const min = Math.max(1, Math.round((seg || 0) / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

function rectRedondo(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function escribir(c, s, x, y, fuente, { a = 1, al = 'left', col = '#fff' } = {}) {
  c.save();
  c.font = fuente;
  c.textAlign = al;
  c.textBaseline = 'alphabetic';
  c.globalAlpha = a;
  c.fillStyle = col;
  c.fillText(s, x, y);
  c.restore();
}

/** Rótulo en versalitas espaciadas y tenues (letra a letra, sin depender de ctx.letterSpacing). */
function rotulo(c, s, x, y, px, { a = 0.62, al = 'left', col = '#fff', sp = 0.16 } = {}) {
  const t = s.toUpperCase();
  c.save();
  c.font = `600 ${px}px ${TEXTO}`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.globalAlpha = a;
  c.fillStyle = col;
  const paso = px * sp;
  const total = [...t].reduce((w, ch) => w + c.measureText(ch).width + paso, -paso);
  let cx = al === 'center' ? x - total / 2 : al === 'right' ? x - total : x;
  for (const ch of t) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + paso;
  }
  c.restore();
}

/** Mayor tamaño ≤ max con el que `s` cabe en `ancho` (nunca baja de `min`). */
function ajustar(c, s, fam, peso, max, ancho, min = 18) {
  let px = max;
  c.font = `${peso} ${px}px ${fam}`;
  while (px > min && c.measureText(s).width > ancho) {
    px -= 2;
    c.font = `${peso} ${px}px ${fam}`;
  }
  return px;
}

function recortar(c, s, ancho) {
  let t = String(s);
  if (c.measureText(t).width <= ancho) return t;
  while (t.length > 1 && c.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
  return `${t}…`;
}

/** Parte `texto` en líneas de ancho ≤ `ancho` con la fuente ya puesta en `c` (sin límite de líneas). */
function partir(c, texto, ancho) {
  const lineas = [];
  let actual = '';
  for (const p of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (!actual || c.measureText(prueba).width <= ancho) actual = prueba;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Como envolver, pero acota a `maxLineas` y cierra con «…» si sobra. */
function envolver(c, texto, ancho, maxLineas) {
  const todas = partir(c, texto, ancho);
  if (todas.length <= maxLineas) return todas.map((l) => recortar(c, l, ancho));
  const lineas = todas.slice(0, maxLineas);
  lineas[maxLineas - 1] = `${lineas[maxLineas - 1]}…`;
  return lineas.map((l) => recortar(c, l, ancho));
}

/** Mayor tamaño con el que `s` cabe en ≤ maxLineas líneas sin cortar palabras. */
function ajustarLineas(c, s, fam, peso, max, ancho, maxLineas, min = 24) {
  for (let px = max; px > min; px -= 2) {
    c.font = `${peso} ${px}px ${fam}`;
    const l = partir(c, s, ancho);
    if (l.length <= maxLineas && l.every((x) => c.measureText(x).width <= ancho)) return px;
  }
  return min;
}

/** Escribe un párrafo; devuelve la y de la siguiente línea. */
function parrafo(c, s, x, y, fuente, ancho, maxLineas, lh, opts = {}) {
  c.save();
  c.font = fuente;
  const lineas = envolver(c, s, ancho, maxLineas);
  c.restore();
  lineas.forEach((l, i) => escribir(c, l, x, y + i * lh, fuente, opts));
  return y + lineas.length * lh;
}

function pildora(c, s, x, y, fuente, { px = 34, relleno = 'rgb(255 255 255 / 0.18)', col = '#fff', al = 'left' } = {}) {
  c.save();
  c.font = fuente;
  const w = c.measureText(s).width + px * 1.5;
  const h = px * 2;
  const x0 = al === 'right' ? x - w : x;
  rectRedondo(c, x0, y, w, h, h / 2);
  c.fillStyle = relleno;
  c.fill();
  c.restore();
  escribir(c, s, x0 + px * 0.75, y + h / 2 + px * 0.36, fuente, { col });
  return w;
}

// ---------- fondos ----------

function ondas(c, W, H, desdeY, alfa, color = '#fff') {
  c.save();
  c.strokeStyle = color;
  c.globalAlpha = alfa;
  c.lineWidth = 3;
  const n = Math.max(4, Math.round((H - desdeY) / 66));
  for (let k = 0; k < n; k++) {
    c.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = desdeY + k * 66 + Math.sin(x / 95 + k * 0.7) * 22;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.restore();
}

/** Versión muy suavizada de `img` a proporción W:H. Reducir mucho y reescalar difumina sin ctx.filter. */
function difuminada(img, W, H) {
  const s = Math.max(W / img.width, H / img.height);
  const sw = W / s;
  const sh = H / s;
  const paso = (ancho, origen, ox, oy, ow, oh) => {
    const o = document.createElement('canvas');
    o.width = ancho;
    o.height = Math.max(2, Math.round((ancho * H) / W));
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(origen, ox, oy, ow, oh, 0, 0, o.width, o.height);
    return o;
  };
  const a = paso(64, img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh);
  return paso(24, a, 0, 0, a.width, a.height);
}

function fondo(c, W, H, estilo, color, imgFondo) {
  if (estilo === 'portada' && imgFondo) {
    c.save();
    c.imageSmoothingQuality = 'high';
    c.drawImage(difuminada(imgFondo, W, H), 0, 0, W, H);
    c.restore();
    const v = c.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgb(10 11 22 / 0.34)');
    v.addColorStop(0.55, 'rgb(10 11 22 / 0.54)');
    v.addColorStop(1, 'rgb(10 11 22 / 0.84)');
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    ondas(c, W, H, H * 0.62, 0.1);
    return;
  }
  if (estilo === 'oscuro') {
    c.fillStyle = NOCHE;
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.9, H * 0.08, 0, W * 0.9, H * 0.08, W * 1.1);
    g.addColorStop(0, mezclar(color, NOCHE, 0.35));
    g.addColorStop(1, 'rgb(10 11 22 / 0)');
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();
    ondas(c, W, H, H * 0.6, 0.28, mezclar(color, '#fff', 0.35));
    return;
  }
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color);
  g.addColorStop(0.62, mezclar(color, NOCHE, 0.62));
  g.addColorStop(1, NOCHE);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const foco = c.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 900);
  foco.addColorStop(0, 'rgb(255 255 255 / 0.28)');
  foco.addColorStop(1, 'rgb(255 255 255 / 0)');
  c.fillStyle = foco;
  c.fillRect(0, 0, W, H);
  ondas(c, W, H, H * 0.58, 0.11);
}

// ---------- piezas ----------

function reserva(c, x, y, w, h, color, texto) {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, mezclar(color, '#fff', 0.3));
  g.addColorStop(1, mezclar(color, NOCHE, 0.45));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.fillStyle = 'rgb(255 255 255 / 0.9)';
  c.font = `700 ${Math.min(w, h) * 0.38}px ${DISPLAY}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText((String(texto || '♪').trim().slice(0, 2) || '♪').toUpperCase(), x + w / 2, y + h / 2);
}

function recorteCuadrado(c, img, x, y, w, h) {
  const s = Math.min(img.width, img.height);
  c.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, w, h);
}

/** Carátula con sombra y ligera rotación, como las tarjetas de modo de la app. */
function caratula(c, img, texto, cx, cy, lado, ang, color, { radio = 0.07, sombra = 1 } = {}) {
  c.save();
  c.translate(cx, cy);
  c.rotate(ang);
  const x = -lado / 2;
  const r = lado * radio;
  c.shadowColor = `rgb(0 0 0 / ${0.55 * sombra})`;
  c.shadowBlur = lado * 0.12;
  c.shadowOffsetY = lado * 0.05;
  rectRedondo(c, x, x, lado, lado, r);
  c.fillStyle = '#1b1c2e';
  c.fill();
  c.shadowColor = 'transparent';
  c.save();
  rectRedondo(c, x, x, lado, lado, r);
  c.clip();
  if (img) recorteCuadrado(c, img, x, x, lado, lado);
  else reserva(c, x, x, lado, lado, color, texto);
  c.restore();
  rectRedondo(c, x, x, lado, lado, r);
  c.strokeStyle = 'rgb(255 255 255 / 0.2)';
  c.lineWidth = Math.max(2, lado * 0.006);
  c.stroke();
  c.restore();
}

function foto(c, img, texto, cx, cy, r, color, aro = 'rgb(255 255 255 / 0.55)') {
  c.save();
  c.shadowColor = 'rgb(0 0 0 / 0.4)';
  c.shadowBlur = r * 0.3;
  c.shadowOffsetY = r * 0.1;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = '#1b1c2e';
  c.fill();
  c.shadowColor = 'transparent';
  c.clip();
  if (img) recorteCuadrado(c, img, cx - r, cy - r, r * 2, r * 2);
  else reserva(c, cx - r, cy - r, r * 2, r * 2, color, texto);
  c.restore();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.strokeStyle = aro;
  c.lineWidth = Math.max(3, r * 0.05);
  c.stroke();
}

function logoEn(c, logo, x, y, lado) {
  c.save();
  rectRedondo(c, x, y, lado, lado, lado * 0.24);
  c.clip();
  if (logo) c.drawImage(logo, x, y, lado, lado);
  else reserva(c, x, y, lado, lado, '#7c5cff', 'M');
  c.restore();
}

function marca(c, W, H, logo, periodo, cuad) {
  const lado = cuad ? 64 : 76;
  const y = cuad ? 64 : 92;
  logoEn(c, logo, M, y, lado);
  escribir(c, 'Musicsippi', M + lado + 22, y + lado / 2 + 16, `700 ${cuad ? 40 : 46}px ${DISPLAY}`);
  pildora(c, periodo, M, H - (cuad ? 118 : 150), `600 ${cuad ? 30 : 34}px ${TEXTO}`, { px: cuad ? 22 : 24 });
}

function areaDe(H, cuad) {
  const y0 = cuad ? 176 : 236;
  const y1 = H - (cuad ? 150 : 210);
  return { x: M, w: ANCHO - 2 * M, y0, y1, h: y1 - y0 };
}

const plural = (n, uno, varios) => (n === 1 ? uno : varios);

// ---------- tarjetas ----------

function tMinutos(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const k = cuad ? 0.72 : 1;
  const num = d.minutos.toLocaleString('es-ES');
  const pre = d.tipoPeriodo === 'anio' ? 'Este año he escuchado' : 'Esta semana he escuchado';
  const px = ajustar(c, num, DISPLAY, 700, 450 * k * t.g, a.w + 20);
  const alto = 70 * k + px * 0.95 + 120 * k + 100 * k;
  let y = a.y0 + Math.max(0, (a.h - alto) / 2 - (cuad ? 0 : 60));
  escribir(c, pre, M, y + 50 * k, `600 ${56 * k}px ${DISPLAY}`, { a: 0.92 });
  y += 70 * k + px * 0.84;
  escribir(c, num, M - 8, y, `700 ${px}px ${DISPLAY}`, { col: t.ac });
  y += 100 * k;
  escribir(c, 'minutos de música', M, y, `700 ${78 * k}px ${DISPLAY}`);
  y += 76 * k;
  parrafo(c, `${d.reproducciones} reproducciones de ${d.distintas} ${plural(d.distintas, 'canción distinta', 'canciones distintas')}`, M, y, `500 ${38 * k}px ${TEXTO}`, a.w, 2, 52 * k, { a: 0.88 });
  if (!cuad) {
    // ecualizador decorativo, determinista
    const n = 26;
    const bw = a.w / n;
    c.save();
    c.fillStyle = t.ac;
    c.globalAlpha = 0.26;
    for (let i = 0; i < n; i++) {
      const hh = 40 + (Math.sin(i * 0.9) * 0.5 + 0.5) * 150 + (Math.sin(i * 2.3 + 1) * 0.5 + 0.5) * 90;
      rectRedondo(c, M + i * bw + 5, a.y1 - hh, bw - 10, hh, (bw - 10) / 2);
      c.fill();
    }
    c.restore();
  }
}

function insignia(c, cx, cy, r, texto, t) {
  c.save();
  c.shadowColor = 'rgb(0 0 0 / 0.35)';
  c.shadowBlur = 30;
  c.shadowOffsetY = 10;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = '#fff';
  c.fill();
  c.restore();
  const px = ajustar(c, texto, DISPLAY, 700, r * 0.85, r * 1.5);
  escribir(c, texto, cx, cy + px * 0.3, `700 ${px}px ${DISPLAY}`, { al: 'center', col: t.tinta });
}

function tBucle(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const b = d.bucle;
  if (!b) return;
  const veces = `${b.n}×`;
  if (!cuad) {
    escribir(c, 'Mi canción en bucle', M, a.y0 + 40, `600 58px ${DISPLAY}`, { a: 0.92 });
    const lado = 640;
    const cy = a.y0 + 110 + lado / 2;
    caratula(c, im.bucle, b.titulo, M + lado / 2 + 20, cy, lado, -0.06, d.color);
    insignia(c, M + lado + 20, cy + lado / 2 - 50, 104, veces, t);
    const px = ajustarLineas(c, b.titulo, DISPLAY, 700, 92 * t.g, a.w, 2, 44);
    let y = parrafo(c, b.titulo, M, cy + lado / 2 + 175, `700 ${px}px ${DISPLAY}`, a.w, 2, px * 1.08, { col: t.ac });
    c.save();
    c.font = `500 50px ${TEXTO}`;
    escribir(c, recortar(c, b.artista, a.w), M, y + 20, `500 50px ${TEXTO}`, { a: 0.9 });
    c.restore();
    escribir(c, `La puse ${b.n} ${plural(b.n, 'vez', 'veces')}.`, M, y + 92, `500 38px ${TEXTO}`, { a: 0.75 });
  } else {
    const lado = 520;
    const cy = a.y0 + 24 + lado / 2;
    caratula(c, im.bucle, b.titulo, M + lado / 2 + 14, cy, lado, -0.06, d.color);
    insignia(c, M + lado + 4, cy + lado / 2 - 30, 86, veces, t);
    const x = M + lado + 70;
    const ancho = ANCHO - M - x;
    escribir(c, 'Mi canción en bucle', x, a.y0 + 70, `600 36px ${DISPLAY}`, { a: 0.9 });
    const px = ajustarLineas(c, b.titulo, DISPLAY, 700, 62 * t.g, ancho, 4, 30);
    let y = parrafo(c, b.titulo, x, a.y0 + 150, `700 ${px}px ${DISPLAY}`, ancho, 4, px * 1.1, { col: t.ac });
    y = parrafo(c, b.artista, x, y + 16, `500 34px ${TEXTO}`, ancho, 2, 42, { a: 0.9 });
    escribir(c, `La puse ${b.n} ${plural(b.n, 'vez', 'veces')}.`, x, y + 24, `500 30px ${TEXTO}`, { a: 0.75 });
  }
}

function tArtistas(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const lista = d.artistas.slice(0, 5);
  if (!lista.length) return;
  escribir(c, 'Mis artistas de cabecera', M, a.y0 + (cuad ? 30 : 40), `600 ${cuad ? 40 : 58}px ${DISPLAY}`, { a: 0.92 });
  const ini = a.y0 + (cuad ? 62 : 96);
  const alto = a.y1 - ini;
  const pesos = lista.map((_, i) => (i === 0 ? 1.28 : 1));
  const suma = pesos.reduce((s, v) => s + v, 0);
  let y = ini;
  lista.forEach((ar, i) => {
    const fila = (alto * pesos[i]) / suma;
    const cy = y + fila / 2;
    const r = Math.min(fila * 0.4, i === 0 ? 120 : 92);
    escribir(c, String(i + 1), ANCHO - M + 10, cy + fila * 0.34, `700 ${fila * 1.05}px ${DISPLAY}`, { al: 'right', a: 0.1, col: t.ac });
    foto(c, im.artistas[i] ?? null, ar.nombre, M + r, cy, r, d.color);
    const x = M + r * 2 + (cuad ? 28 : 40);
    const ancho = ANCHO - M - x - (cuad ? 60 : 100);
    const px = ajustar(c, ar.nombre, DISPLAY, 700, (i === 0 ? (cuad ? 62 : 88) : cuad ? 46 : 62) * t.g, ancho, 28);
    escribir(c, recortar(c, ar.nombre, ancho), x, cy + (cuad ? 2 : 4), `700 ${px}px ${DISPLAY}`, { col: i === 0 ? t.ac : '#fff' });
    escribir(c, `${ar.n} ${plural(ar.n, 'reproducción', 'reproducciones')}`, x, cy + (cuad ? 38 : 48) + (i === 0 ? 10 : 0), `500 ${cuad ? 26 : 32}px ${TEXTO}`, { a: 0.8 });
    y += fila;
  });
}

function tModo(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const m = d.modo;
  if (!m) return;
  const pre = d.tipoPeriodo === 'anio' ? 'El mood de mi año' : 'El mood de mi semana';
  const pct = `${Math.round(m.fraccion * 100)} %`;
  const tile = (cx, cy, w, h, ang, k) => {
    c.save();
    c.translate(cx, cy);
    c.rotate(ang);
    c.shadowColor = 'rgb(0 0 0 / 0.5)';
    c.shadowBlur = 60 * k;
    c.shadowOffsetY = 28 * k;
    rectRedondo(c, -w / 2, -h / 2, w, h, 44 * k);
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, mezclar(d.color, '#fff', 0.34));
    g.addColorStop(1, mezclar(d.color, NOCHE, 0.3));
    c.fillStyle = g;
    c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = 'rgb(255 255 255 / 0.3)';
    c.lineWidth = 3;
    c.stroke();
    c.save();
    rectRedondo(c, -w / 2, -h / 2, w, h, 44 * k);
    c.clip();
    c.translate(-w / 2, -h / 2);
    ondas(c, w, h, h * 0.45, 0.18);
    c.restore();
    const ancho = w - 90 * k;
    const px = ajustarLineas(c, m.nombre, DISPLAY, 700, 130 * k * t.g, ancho, 3, 30);
    c.font = `700 ${px}px ${DISPLAY}`;
    const lineas = partir(c, m.nombre, ancho);
    const lh = px * 1.04;
    lineas.forEach((l, i) => escribir(c, l, 0, -((lineas.length - 1) * lh) / 2 + i * lh + px * 0.32, `700 ${px}px ${DISPLAY}`, { al: 'center' }));
    c.restore();
  };
  if (!cuad) {
    escribir(c, pre, M, a.y0 + 40, `600 58px ${DISPLAY}`, { a: 0.92 });
    tile(W / 2, a.y0 + 90 + 290, 900, 520, -0.07, 1);
    const y = a.y0 + 90 + 520 + 195;
    const px = ajustar(c, pct, DISPLAY, 700, 340 * t.g, a.w);
    escribir(c, pct, M - 6, y + px * 0.5, `700 ${px}px ${DISPLAY}`, { col: t.ac });
    parrafo(c, 'de mi tiempo vivió aquí dentro.', M, y + px * 0.5 + 80, `600 56px ${DISPLAY}`, a.w, 2, 66);
  } else {
    escribir(c, pre, M, a.y0 + 30, `600 40px ${DISPLAY}`, { a: 0.92 });
    tile(M + 290, a.y0 + 120 + 190, 560, 360, -0.07, 0.62);
    const x = M + 620;
    const ancho = ANCHO - M - x;
    const px = ajustar(c, pct, DISPLAY, 700, 190 * t.g, ancho);
    escribir(c, pct, x, a.y0 + 300 + px * 0.2, `700 ${px}px ${DISPLAY}`, { col: t.ac });
    parrafo(c, 'de mi tiempo vivió aquí dentro.', x, a.y0 + 300 + px * 0.2 + 52, `600 36px ${DISPLAY}`, ancho, 3, 44);
  }
}

function reloj(c, cx, cy, r, h, t) {
  c.save();
  c.strokeStyle = '#fff';
  c.globalAlpha = 0.2;
  c.lineWidth = 5;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 0.4;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const l = i % 6 === 0 ? 34 : 18;
    c.lineWidth = i % 6 === 0 ? 6 : 4;
    c.beginPath();
    c.moveTo(cx + Math.cos(ang) * (r - 14), cy + Math.sin(ang) * (r - 14));
    c.lineTo(cx + Math.cos(ang) * (r - 14 - l), cy + Math.sin(ang) * (r - 14 - l));
    c.stroke();
  }
  c.restore();
  const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
  c.save();
  c.shadowColor = 'rgb(0 0 0 / 0.35)';
  c.shadowBlur = 24;
  c.beginPath();
  c.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, r * 0.085, 0, Math.PI * 2);
  c.fillStyle = t.ac;
  c.fill();
  c.restore();
}

function numeroConH(c, num, cx, cy, maxPx, ancho, hPx, t) {
  const px = ajustar(c, num, DISPLAY, 700, maxPx, ancho);
  c.font = `700 ${px}px ${DISPLAY}`;
  const wn = c.measureText(num).width;
  c.font = `700 ${hPx}px ${DISPLAY}`;
  const wh = c.measureText(' h').width;
  const x0 = cx - (wn + wh) / 2;
  escribir(c, num, x0, cy + px * 0.3, `700 ${px}px ${DISPLAY}`, { col: t.ac });
  escribir(c, ' h', x0 + wn, cy + px * 0.3, `700 ${hPx}px ${DISPLAY}`);
}

function tHora(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const o = d.hora;
  if (!o) return;
  const num = String(o.h);
  const frase = o.frase.replace('Eres', 'Soy');
  if (!cuad) {
    escribir(c, 'Mi hora del día', M, a.y0 + 40, `600 58px ${DISPLAY}`, { a: 0.92 });
    const r = 400;
    const cx = W / 2;
    const cy = a.y0 + 140 + r;
    reloj(c, cx, cy, r, o.h, t);
    numeroConH(c, num, cx, cy, 460 * t.g, r * 1.3, 130, t);
    const y = parrafo(c, frase, M, cy + r + 90, `700 62px ${DISPLAY}`, a.w, 2, 72);
    parrafo(c, o.nota, M, y + 18, `500 38px ${TEXTO}`, a.w, 2, 52, { a: 0.85 });
    if (o.racha > 1) pildora(c, `Mi mejor racha: ${o.racha} días seguidos`, M, a.y1 - 70, `600 36px ${TEXTO}`, { px: 26 });
  } else {
    const r = 290;
    const cx = M + r + 10;
    const cy = a.y0 + 20 + r;
    reloj(c, cx, cy, r, o.h, t);
    numeroConH(c, num, cx, cy, 330 * t.g, r * 1.3, 90, t);
    const x = M + 2 * r + 70;
    const ancho = ANCHO - M - x;
    escribir(c, 'Mi hora del día', x, a.y0 + 60, `600 34px ${DISPLAY}`, { a: 0.9 });
    const y = parrafo(c, frase, x, a.y0 + 150, `700 46px ${DISPLAY}`, ancho, 4, 54);
    parrafo(c, o.nota, x, y + 14, `500 28px ${TEXTO}`, ancho, 4, 38, { a: 0.85 });
    if (o.racha > 1) pildora(c, `Racha: ${o.racha} días`, x, a.y1 - 56, `600 28px ${TEXTO}`, { px: 20 });
  }
}

function textoCambio(d) {
  if (d.cambioPct === null || d.cambioPct === undefined) return null;
  const ant = d.tipoPeriodo === 'anio' ? 'el año pasado' : 'la semana pasada';
  const signo = d.cambioPct > 0 ? '+' : d.cambioPct < 0 ? '−' : '';
  return { grande: `${signo}${Math.abs(d.cambioPct)} %`, resto: d.cambioPct === 0 ? `Igual que ${ant}` : `de música que ${ant}` };
}

function tCurioso(c, W, H, cuad, d, im, t) {
  const a = areaDe(H, cuad);
  const s = d.descubrimiento;
  const cambio = textoCambio(d);
  if (!s && !cambio) return;
  if (!s) {
    const px = ajustar(c, cambio.grande, DISPLAY, 700, 420 * t.g, a.w);
    const y = a.y0 + a.h / 2 - 20;
    escribir(c, cambio.grande, M - 6, y, `700 ${px}px ${DISPLAY}`, { col: t.ac });
    escribir(c, cambio.resto, M, y + 84, `600 ${cuad ? 46 : 60}px ${DISPLAY}`);
    return;
  }
  if (!cuad) {
    escribir(c, 'Mi descubrimiento', M, a.y0 + 40, `600 58px ${DISPLAY}`, { a: 0.92 });
    const lado = 560;
    const cy = a.y0 + 110 + lado / 2;
    caratula(c, im.descubre, s.titulo, W / 2 + 60, cy, lado, 0.06, d.color);
    pildora(c, 'Nueva en mi vida', W - M, a.y0 + 2, `700 30px ${TEXTO}`, { px: 22, relleno: '#fff', col: t.tinta, al: 'right' });
    const px = ajustarLineas(c, s.titulo, DISPLAY, 700, 84 * t.g, a.w, 2, 40);
    const y = parrafo(c, s.titulo, M, cy + lado / 2 + 110, `700 ${px}px ${DISPLAY}`, a.w, 2, px * 1.08, { col: t.ac });
    c.save();
    c.font = `500 46px ${TEXTO}`;
    escribir(c, recortar(c, s.artista, a.w), M, y + 16, `500 46px ${TEXTO}`, { a: 0.9 });
    c.restore();
    escribir(c, `Y ya la puse ${s.n} ${plural(s.n, 'vez', 'veces')}.`, M, y + 82, `500 38px ${TEXTO}`, { a: 0.78 });
    if (cambio) {
      const px2 = ajustar(c, cambio.grande, DISPLAY, 700, 150, 420);
      escribir(c, cambio.grande, M - 4, a.y1 - 10, `700 ${px2}px ${DISPLAY}`, { col: t.ac });
      c.font = `700 ${px2}px ${DISPLAY}`;
      const wx = c.measureText(cambio.grande).width;
      parrafo(c, cambio.resto, M + wx + 30, a.y1 - 70, `600 38px ${DISPLAY}`, a.w - wx - 30, 2, 46);
    }
  } else {
    const lado = 470;
    const cy = a.y0 + 20 + lado / 2;
    caratula(c, im.descubre, s.titulo, M + lado / 2 + 14, cy, lado, 0.06, d.color);
    const x = M + lado + 70;
    const ancho = ANCHO - M - x;
    pildora(c, 'Nueva en mi vida', x, a.y0 + 6, `700 26px ${TEXTO}`, { px: 18, relleno: '#fff', col: t.tinta });
    escribir(c, 'Mi descubrimiento', x, a.y0 + 130, `600 34px ${DISPLAY}`, { a: 0.9 });
    const px = ajustarLineas(c, s.titulo, DISPLAY, 700, 58 * t.g, ancho, 3, 28);
    let y = parrafo(c, s.titulo, x, a.y0 + 200, `700 ${px}px ${DISPLAY}`, ancho, 3, px * 1.1, { col: t.ac });
    y = parrafo(c, s.artista, x, y + 12, `500 32px ${TEXTO}`, ancho, 2, 40, { a: 0.9 });
    escribir(c, `Ya la puse ${s.n} ${plural(s.n, 'vez', 'veces')}.`, x, y + 22, `500 28px ${TEXTO}`, { a: 0.78 });
    if (cambio) pildora(c, `${cambio.grande} ${cambio.resto}`, M, a.y1 - 60, `600 30px ${TEXTO}`, { px: 22 });
  }
}

// ---- «Todo en uno»: la tarjeta con toda la información, al estilo de los resúmenes anuales ----

/** Fila de ranking: número, imagen (cuadrada o redonda), nombre y dato secundario. */
function fila(c, { x, cy, w, lado, rank, img, redonda, titulo, sub, color, px }) {
  const primero = rank === 1;
  escribir(c, String(rank), x, cy + px * 0.42, `700 ${px * 1.15}px ${DISPLAY}`, { col: primero ? REALCE : '#fff', a: primero ? 1 : 0.55 });
  const ix = x + px * 1.25;
  if (redonda) foto(c, img, titulo, ix + lado / 2, cy, lado / 2, color, primero ? REALCE : 'rgb(255 255 255 / 0.5)');
  else caratula(c, img, titulo, ix + lado / 2, cy, lado, 0, color, { radio: 0.14, sombra: 0.7 });
  const tx = ix + lado + px * 0.5;
  const ancho = x + w - tx;
  c.save();
  c.font = `600 ${px}px ${TEXTO}`;
  const nombre = recortar(c, titulo, ancho);
  c.font = `500 ${px * 0.82}px ${TEXTO}`;
  const detalle = recortar(c, sub, ancho);
  c.restore();
  escribir(c, nombre, tx, cy - px * 0.1, `600 ${px}px ${TEXTO}`);
  escribir(c, detalle, tx, cy + px * 0.9, `500 ${px * 0.82}px ${TEXTO}`, { a: 0.62 });
}

function pieFinal(c, W, H, cuad) {
  escribir(c, 'Calculado en tu móvil con Musicsippi', W / 2, H - (cuad ? 36 : 56), `500 ${cuad ? 22 : 26}px ${TEXTO}`, { al: 'center', a: 0.45 });
}

function cabeceraFinal(c, logo, d, cuad) {
  const lado = cuad ? 64 : 76;
  const y = cuad ? 52 : 92;
  logoEn(c, logo, M, y, lado);
  escribir(c, 'Musicsippi', M + lado + 22, y + lado / 2 + 16, `700 ${cuad ? 40 : 46}px ${DISPLAY}`);
  rotulo(c, d.periodo, M, y + lado + (cuad ? 30 : 46), cuad ? 20 : 24, { a: 0.7 });
}

function tFinal(c, W, H, cuad, d, im, t) {
  cabeceraFinal(c, im.logo, d, cuad);
  pieFinal(c, W, H, cuad);
  const num = d.minutos.toLocaleString('es-ES');
  const resumenLinea = [
    `${d.reproducciones} ${plural(d.reproducciones, 'reproducción', 'reproducciones')}`,
    `${d.distintas} ${plural(d.distintas, 'canción', 'canciones')}`,
    d.nArtistas ? `${d.nArtistas} ${plural(d.nArtistas, 'artista', 'artistas')}` : null,
  ].filter(Boolean).join(' · ');
  const songs = d.canciones.slice(0, 5);
  const arts = d.artistas.slice(0, 5);
  const albs = d.albumes.slice(0, 3);
  const modosTxt = d.modos.slice(0, 5).map((m) => m.nombre);

  const chips = (x, y, ancho, px, maxFilas = 1) => {
    let cx = x;
    let cy = y;
    let fila1 = 1;
    for (const nombre of modosTxt) {
      c.save();
      c.font = `600 ${px}px ${TEXTO}`;
      const w = c.measureText(nombre).width + px * 1.5;
      c.restore();
      if (cx + w > x + ancho) {
        if (fila1 >= maxFilas) break;
        fila1 += 1;
        cx = x;
        cy += px * 2 + 12;
        if (w > ancho) continue;
      }
      pildora(c, nombre, cx, cy, `600 ${px}px ${TEXTO}`, { px });
      cx += w + 12;
    }
  };

  if (!cuad) {
    const px = ajustar(c, num, DISPLAY, 700, 270 * t.g, a_w());
    let y = 270 + px * 0.8;
    escribir(c, num, M - 6, y, `700 ${px}px ${DISPLAY}`, { col: t.ac });
    rotulo(c, 'Minutos escuchados', M, y + 62, 26);
    escribir(c, resumenLinea, M, y + 118, `500 32px ${TEXTO}`, { a: 0.78 });
    y += 195;
    const colW = 430;
    const x2 = M + colW + 60;
    rotulo(c, 'Canciones principales', M, y, 22);
    rotulo(c, 'Artistas principales', x2, y, 22);
    const filaH = 104;
    songs.forEach((s, i) => fila(c, { x: M, cy: y + 52 + i * filaH + 30, w: colW, lado: 76, rank: i + 1, img: im.canciones[i] ?? null, titulo: s.titulo, sub: `${s.artista}`, color: d.color, px: 28 }));
    arts.forEach((a, i) => fila(c, { x: x2, cy: y + 52 + i * filaH + 30, w: colW, lado: 76, rank: i + 1, img: im.artistas[i] ?? null, redonda: true, titulo: a.nombre, sub: tiempo(a.segundos), color: d.color, px: 28 }));
    y += 52 + 5 * filaH + 40;
    if (albs.length) {
      rotulo(c, 'Álbumes principales', M, y, 22);
      const lado = 270;
      const hueco = (a_w() - 3 * lado) / 2;
      albs.forEach((al, i) => {
        const ax = M + i * (lado + hueco);
        caratula(c, im.albumes[i] ?? null, al.album, ax + lado / 2, y + 32 + lado / 2, lado, 0, d.color, { radio: 0.1, sombra: 0.8 });
        c.save();
        c.font = `600 26px ${TEXTO}`;
        const nombre = recortar(c, al.album, lado);
        c.font = `500 22px ${TEXTO}`;
        const det = recortar(c, tiempo(al.segundos), lado);
        c.restore();
        escribir(c, nombre, ax, y + 32 + lado + 40, `600 26px ${TEXTO}`);
        escribir(c, det, ax, y + 32 + lado + 72, `500 22px ${TEXTO}`, { a: 0.62 });
      });
      y += 32 + lado + 138;
    }
    if (modosTxt.length) {
      rotulo(c, 'Moods principales', M, y, 22);
      chips(M, y + 22, a_w(), 26);
    }
  } else {
    const ancho = 420;
    const px = ajustar(c, num, DISPLAY, 700, 190 * t.g, ancho);
    let y = 190 + px * 0.74;
    escribir(c, num, M - 4, y, `700 ${px}px ${DISPLAY}`, { col: t.ac });
    rotulo(c, 'Minutos escuchados', M, y + 44, 20);
    escribir(c, resumenLinea.split(' · ')[0], M, y + 88, `500 24px ${TEXTO}`, { a: 0.78 });
    escribir(c, resumenLinea.split(' · ').slice(1).join(' · '), M, y + 120, `500 24px ${TEXTO}`, { a: 0.78 });
    if (modosTxt.length) {
      rotulo(c, 'Moods principales', M, y + 180, 18);
      chips(M, y + 198, ancho, 20, 1);
    }
    const x2 = M + 500;
    const cw = ANCHO - M - x2;
    rotulo(c, 'Canciones principales', x2, 200, 18);
    songs.forEach((s, i) => fila(c, { x: x2, cy: 252 + i * 64 + 14, w: cw, lado: 50, rank: i + 1, img: im.canciones[i] ?? null, titulo: s.titulo, sub: s.artista, color: d.color, px: 20 }));
    const yb = 640;
    rotulo(c, 'Artistas principales', M, yb, 18);
    const slot = (ANCHO - 2 * M) / 5;
    arts.forEach((a, i) => {
      const cx = M + slot * i + slot / 2;
      foto(c, im.artistas[i] ?? null, a.nombre, cx, yb + 52, 38, d.color, i === 0 ? REALCE : 'rgb(255 255 255 / 0.5)');
      c.save();
      c.font = `600 20px ${TEXTO}`;
      const n = recortar(c, a.nombre, slot - 14);
      c.restore();
      escribir(c, n, cx, yb + 120, `600 20px ${TEXTO}`, { al: 'center', col: i === 0 ? REALCE : '#fff' });
    });
    const ya = 806;
    if (albs.length) {
      rotulo(c, 'Álbumes principales', M, ya, 18);
      const aslot = (ANCHO - 2 * M) / 3;
      albs.forEach((al, i) => {
        const ax = M + aslot * i;
        caratula(c, im.albumes[i] ?? null, al.album, ax + 56, ya + 24 + 56, 112, 0, d.color, { radio: 0.14, sombra: 0.7 });
        c.save();
        c.font = `600 20px ${TEXTO}`;
        const n = envolver(c, al.album, aslot - 150, 2);
        c.restore();
        n.forEach((l, k) => escribir(c, l, ax + 130, ya + 24 + 50 + k * 26, `600 20px ${TEXTO}`));
        escribir(c, tiempo(al.segundos), ax + 130, ya + 24 + 50 + n.length * 26 + 4, `500 18px ${TEXTO}`, { a: 0.62 });
      });
    }
  }
}

const a_w = () => ANCHO - 2 * M;

const TARJETAS = { minutos: tMinutos, bucle: tBucle, artistas: tArtistas, modo: tModo, hora: tHora, curioso: tCurioso, final: tFinal };

/** Imagen de fondo para el estilo «portada»: la carátula más representativa de cada tarjeta. */
function imagenFondo(tipo, im) {
  const por = {
    curioso: [im.descubre, im.bucle],
    artistas: [im.artistas[0], im.bucle],
  };
  return (por[tipo] ?? [im.bucle, im.descubre, im.artistas[0]]).find(Boolean) ?? null;
}

/**
 * Pinta una tarjeta en un espacio de 1080 × alto del formato (el contexto puede traer un scale).
 * @param {CanvasRenderingContext2D} c
 * @param {{tipo:string, formato?:'historia'|'cuadrado', estilo?:'color'|'portada'|'oscuro', datos:object,
 *   imagenes?:{logo?:any, bucle?:any, descubre?:any, artistas?:any[], canciones?:any[], albumes?:any[]}}} o
 */
export function dibujarTarjeta(c, { tipo, formato = 'historia', estilo = 'color', datos: datosBase, imagenes = {} }) {
  const { ancho: W, alto: H } = medidas(formato);
  const cuad = formato === 'cuadrado';
  const color = datosBase.colores?.[tipo] || datosBase.color || '#7c5cff';
  const datos = { ...datosBase, color };
  const im = { ...imagenes, artistas: imagenes.artistas ?? [], canciones: imagenes.canciones ?? [], albumes: imagenes.albumes ?? [] };
  const fondoImg = estilo === 'portada' ? imagenFondo(tipo, im) : null;
  const t = {
    ac: estilo === 'oscuro' ? mezclar(color, '#fff', 0.5) : '#fff',
    tinta: estilo === 'oscuro' ? NOCHE : mezclar(color, NOCHE, 0.45),
    g: estilo === 'oscuro' ? 1.14 : 1,
  };
  c.save();
  fondo(c, W, H, estilo, color, fondoImg);
  if (tipo !== 'final') marca(c, W, H, im.logo ?? null, datos.periodo, cuad);
  (TARJETAS[tipo] ?? tMinutos)(c, W, H, cuad, datos, im, t);
  c.restore();
}

// ---------- carga y exportación ----------

/** Espera a las fuentes (Fraunces, Inter) para que el canvas no pinte con la de reserva. */
export async function esperarFuentes() {
  try {
    await Promise.all([
      document.fonts?.load('700 80px Fraunces'),
      document.fonts?.load('600 40px Fraunces'),
      document.fonts?.load('600 30px Inter'),
      document.fonts?.load('500 30px Inter'),
    ]);
    await document.fonts?.ready;
  } catch {
    // sin la fuente se usa la de reserva
  }
}

/** Carga logo, carátulas y fotos; lo que falle queda en null. */
export async function cargarImagenes(urls) {
  const base = typeof location !== 'undefined' ? location.origin : '';
  const todas = (lista) => Promise.all((lista ?? []).map((u) => cargarImagen(u)));
  const [logo, bucle, descubre, artistas, canciones, albumes] = await Promise.all([
    cargarImagen(`${base}/musicsippi-app-icon-256.png`),
    cargarImagen(urls.bucle),
    cargarImagen(urls.descubre),
    todas(urls.artistas),
    todas(urls.canciones),
    todas(urls.albumes),
  ]);
  return { logo, bucle, descubre, artistas, canciones, albumes };
}

/** PNG de la tarjeta a tamaño completo. */
export async function crearImagen(o) {
  await esperarFuentes();
  const { ancho, alto } = medidas(o.formato);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  dibujarTarjeta(canvas.getContext('2d'), o);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas vacío'))), 'image/png'));
}

/**
 * Comparte la imagen con la hoja nativa si el sistema admite archivos; si no, comparte el
 * texto con el mecanismo de siempre, o descarga el PNG en navegador de escritorio.
 * Devuelve 'imagen' | 'texto' | 'descargada' | 'cancelado' | 'copiado'.
 */
export async function compartirTarjeta(o, titulo, texto) {
  const blob = await crearImagen(o);
  const archivo = new File([blob], 'mi-resumen-musicsippi.png', { type: 'image/png' });
  if (esAndroid()) {
    try {
      await compartirImagen({ titulo, blob });
      return 'imagen';
    } catch (e) {
      console.warn('Resumen: no se pudo compartir la imagen, se comparte el texto', e);
    }
  }
  if (!esAndroid() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return 'imagen';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  if (!esAndroid() && !navigator.share) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = archivo.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'descargada';
  }
  const r = await compartir({ titulo, texto });
  return r === 'copiado' ? 'copiado' : r === 'cancelado' ? 'cancelado' : 'texto';
}

/**
 * Guarda la tarjeta: en Android en la galería (Pictures/Musicsippi); fuera de Android descarga el PNG.
 * Devuelve 'galeria' | 'descargada'; rechaza si falla.
 */
export async function guardarTarjeta(o) {
  const blob = await crearImagen(o);
  const nombre = `musicsippi-${o.datos?.tipoPeriodo ?? 'resumen'}-${o.tipo}-${Date.now()}.png`;
  if (esAndroid()) {
    await guardarImagenGaleria({ nombre, blob });
    return 'galeria';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'descargada';
}
