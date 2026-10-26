// src/movil/inicio/IconosAnimo.jsx
// Iconos propios de «¿Cómo te sientes?»: trazo redondeado, ondas de «La corriente» y un
// degradado por ánimo. Cada uno es un SVG en línea (viewBox 64) legible desde 40 px.
import { useId } from 'react';
import { ICONOS_DISPONIBLES } from './catalogoIconos.js';

function Base({ colores, children }) {
  const uid = useId().replace(/:/g, '');
  const g = `ia${uid}`;
  return (
    <svg className="animo-icono" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={colores[0]} />
          <stop offset="1" stopColor={colores[1]} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${g})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

// Onda de longitud 12 que se desborda del marco: al animarla fluye una longitud de onda.
const onda = (y) => `M-12 ${y} q3 -5 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0`;

export function IconoTranquilo() {
  return (
    <Base colores={['#7fd8ff', '#3fe0b8']}>
      <path className="ic-flota" d="M38 9a17 17 0 1 0 15 25 14 14 0 0 1-15-25z" />
      <g className="ic-onda">
        <path d={onda(46)} />
      </g>
      <g className="ic-onda ic-onda-b">
        <path d={onda(55)} strokeWidth="2.8" opacity=".6" />
      </g>
    </Base>
  );
}

export function IconoEnergia() {
  return (
    <Base colores={['#ffe14d', '#ff7a2e']}>
      <path className="ic-rayo" d="M37 6 19 35h12l-4 23 19-30H34z" />
      <path className="ic-chispa" d="M9 24q3 -4 0 -8t0 -8" strokeWidth="3" />
      <path className="ic-chispa ic-chispa-b" d="M55 56q-3 -4 0 -8t0 -8" strokeWidth="3" />
    </Base>
  );
}

export function IconoMelancolico() {
  return (
    <Base colores={['#b79bff', '#5b8dff']}>
      <path d="M19 37a9 9 0 0 1 1-17.9A13 13 0 0 1 45 21a8.5 8.5 0 0 1-1 16z" />
      <path className="ic-gota" d="M21 44q-2.5 3 0 6t0 6" />
      <path className="ic-gota ic-gota-b" d="M32 44q-2.5 3 0 6t0 6" />
      <path className="ic-gota ic-gota-c" d="M43 44q-2.5 3 0 6t0 6" />
    </Base>
  );
}

const estrella = (x, y, r) =>
  `M${x} ${y - r}Q${x + 1} ${y - 1} ${x + r} ${y}Q${x + 1} ${y + 1} ${x} ${y + r}Q${x - 1} ${y + 1} ${x - r} ${y}Q${x - 1} ${y - 1} ${x} ${y - r}z`;

export function IconoFiesta() {
  return (
    <Base colores={['#ff8ac0', '#d63bff']}>
      <path className="ic-brillo" d={estrella(27, 24, 15)} />
      <path className="ic-brillo ic-brillo-b" d={estrella(50, 14, 7)} />
      <path className="ic-brillo ic-brillo-c" d={estrella(51, 38, 6)} />
      <g className="ic-onda">
        <path d={onda(55)} />
      </g>
    </Base>
  );
}

const RAYOS = [0, 45, 90, 135, 180, 225, 270, 315];

export function IconoFeliz() {
  return (
    <Base colores={['#ff7a6b', '#ffd23f']}>
      <circle cx="32" cy="32" r="10.5" />
      <g className="ic-rayos">
        {RAYOS.map((g) => (
          <path key={g} d="M32 6q-2.6 3 0 6t0 5" strokeWidth="3.2" transform={`rotate(${g} 32 32)`} />
        ))}
      </g>
    </Base>
  );
}

export function IconoInspirado() {
  return (
    <Base colores={['#7be0ff', '#6a7dff']}>
      <path className="ic-flota" d="M32 8a15 15 0 0 0-8 27.5V42h16v-6.5A15 15 0 0 0 32 8z" />
      <path d="M26 50h12M28.5 56h7" strokeWidth="3.2" />
      <path className="ic-brillo" d={estrella(51, 14, 6)} />
      <path className="ic-brillo ic-brillo-b" d={estrella(12, 20, 5)} />
    </Base>
  );
}

// Carril de rayas que fluye (la carretera): rayas de 6 con huecos de 6, periodo 12 como `onda`.
const carril = (y) => `M-12 ${y}${'h6m6 0'.repeat(8)}h6`;

export function IconoCorazon() {
  return (
    <Base colores={['#ff9ab8', '#ff4d7d']}>
      <path className="ic-latir" d="M32 55C15 43 8 33 8 23a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 10-7 20-24 32z" />
      <path className="ic-brillo" d={estrella(57, 7, 4)} strokeWidth="3" />
    </Base>
  );
}

export function IconoCasete() {
  return (
    <Base colores={['#ffc27a', '#ff7a59']}>
      <rect x="6" y="13" width="52" height="38" rx="7" />
      <g className="ic-rueda">
        <circle cx="21" cy="30" r="5.5" />
        <path d="M21 24.5v3" strokeWidth="2.6" />
      </g>
      <g className="ic-rueda">
        <circle cx="43" cy="30" r="5.5" />
        <path d="M43 24.5v3" strokeWidth="2.6" />
      </g>
      <path d="M17 51l4-8h22l4 8" strokeWidth="3" />
    </Base>
  );
}

export function IconoAlas() {
  return (
    <Base colores={['#8fe3ff', '#5b8dff']}>
      <path className="ic-flota" d="M5 32q13 -17 27 3q14 -20 27 -3" />
      <path className="ic-flota ic-flota-b" d="M32 50q6 -9 13 0q5 -7 10 0" strokeWidth="3" opacity=".65" />
    </Base>
  );
}

export function IconoTaza() {
  return (
    <Base colores={['#ffd08a', '#ff8f5e']}>
      <path d="M11 28h34v9a15 15 0 0 1-15 15h-4a15 15 0 0 1-15-15z" />
      <path d="M45 31h3a7 7 0 0 1 0 14h-5" />
      <path className="ic-vapor" d="M21 22q-3 -4 0 -8t0 -6" strokeWidth="3" />
      <path className="ic-vapor ic-vapor-b" d="M33 22q-3 -4 0 -8t0 -6" strokeWidth="3" />
    </Base>
  );
}

export function IconoSueno() {
  return (
    <Base colores={['#c9a6ff', '#6f8cff']}>
      <path className="ic-flota" d="M17 52a9 9 0 0 1 1-17.9A13 13 0 0 1 43 36a8 8 0 0 1-1 16z" />
      <path className="ic-brillo" d={estrella(44, 15, 10)} />
      <path className="ic-brillo ic-brillo-b" d={estrella(15, 20, 5)} strokeWidth="3" />
    </Base>
  );
}

export function IconoMontana() {
  return (
    <Base colores={['#8ef0c8', '#4aa8ff']}>
      <path d="M4 53l19-31 10 15 7-9 20 25z" />
      <path d="M17 33l6-3 5 5" strokeWidth="3" />
      <path className="ic-brillo" d={estrella(48, 13, 7)} />
    </Base>
  );
}

export function IconoAuriculares() {
  return (
    <Base colores={['#b79bff', '#ff6fd8']}>
      <path d="M12 40V33a20 20 0 0 1 40 0v7" />
      <rect className="ic-pulso" x="8" y="37" width="12" height="19" rx="5" />
      <rect className="ic-pulso ic-pulso-b" x="44" y="37" width="12" height="19" rx="5" />
    </Base>
  );
}

export function IconoCoche() {
  return (
    <Base colores={['#ffd45e', '#ff7a45']}>
      <path d="M7 44v-8l8-13h25l10 13h7v8z" />
      <path d="M19 36h24" strokeWidth="3" />
      <circle cx="19" cy="45" r="5.5" />
      <circle cx="46" cy="45" r="5.5" />
      <g className="ic-onda">
        <path d={carril(58)} strokeWidth="3" opacity=".6" />
      </g>
    </Base>
  );
}

export function IconoMancuerna() {
  return (
    <Base colores={['#ff9a6b', '#ff3d6e']}>
      <path className="ic-flota" d="M17 32h30M4 26v12M60 26v12" />
      <rect x="10" y="19" width="8" height="26" rx="3" />
      <rect x="46" y="19" width="8" height="26" rx="3" />
    </Base>
  );
}

export function IconoLibro() {
  return (
    <Base colores={['#7fe0ff', '#5b7bff']}>
      <path d="M32 18C26 12 14 11 7 13v35c7-2 19-1 25 5 6-6 18-7 25-5V13c-7-2-19-1-25 5z" />
      <path d="M32 18v35" />
      <path className="ic-brillo" d={estrella(51, 7, 4)} strokeWidth="2.6" />
    </Base>
  );
}

export function IconoCopa() {
  return (
    <Base colores={['#ff8aa8', '#c05cff']}>
      <path d="M19 8h26c0 15-3 25-13 27C22 33 19 23 19 8z" />
      <path d="M20 18h24" strokeWidth="3" opacity=".7" />
      <path d="M32 35v18M21 55h22" />
      <path className="ic-brillo" d={estrella(53, 14, 5)} strokeWidth="3" />
    </Base>
  );
}

export function IconoFuego() {
  return (
    <Base colores={['#ffd23f', '#ff4d2e']}>
      <path className="ic-latir" d="M33 6c1 11 14 17 14 32a15 15 0 0 1-30 0c0-8 4-12 8-16 0 6 3 8 6 8 0-8-2-14 2-24z" />
      <path d="M32 57a6 6 0 0 1-6-6c0-4 3-6 6-10 3 4 6 6 6 10a6 6 0 0 1-6 6z" strokeWidth="3" opacity=".7" />
    </Base>
  );
}

export function IconoHoja() {
  return (
    <Base colores={['#9cf08a', '#2fc8a0']}>
      <path className="ic-flota" d="M9 54C7 28 23 9 55 9c2 29-14 47-46 45z" />
      <path d="M9 54L41 23M30 40h12M23 47h7" strokeWidth="3" />
    </Base>
  );
}

export function IconoCiudad() {
  return (
    <Base colores={['#9aa8ff', '#e07bff']}>
      <path d="M6 56V34h10v22M16 56V22h12v34M28 56V30h10v26M38 56V17h12v39M50 56V35h8v21M3 56h58" />
      <path d="M21 29h2M21 37h2M43 25h2M43 33h2" strokeWidth="2.6" opacity=".7" />
      <path className="ic-brillo" d={estrella(54, 11, 5)} strokeWidth="3" />
      <path className="ic-brillo ic-brillo-b" d={estrella(10, 16, 4)} strokeWidth="3" />
    </Base>
  );
}

const COMPONENTES = {
  tranquilo: IconoTranquilo,
  energia: IconoEnergia,
  melancolico: IconoMelancolico,
  fiesta: IconoFiesta,
  feliz: IconoFeliz,
  inspirado: IconoInspirado,
  corazon: IconoCorazon,
  casete: IconoCasete,
  alas: IconoAlas,
  taza: IconoTaza,
  sueno: IconoSueno,
  montana: IconoMontana,
  auriculares: IconoAuriculares,
  coche: IconoCoche,
  mancuerna: IconoMancuerna,
  libro: IconoLibro,
  copa: IconoCopa,
  fuego: IconoFuego,
  hoja: IconoHoja,
  ciudad: IconoCiudad,
};

/** Catálogo del selector (ver catalogoIconos.js): { id, nombre, Icono }. */
export const CATALOGO_ICONOS = ICONOS_DISPONIBLES.map((i) => ({ ...i, Icono: COMPONENTES[i.id] }));

export const ICONOS_ANIMO = COMPONENTES;
