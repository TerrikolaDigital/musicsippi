// src/movil/OlaProgreso.jsx — la «ola» de progreso (identidad v4 «La corriente»).
// El tramo escuchado es una onda que fluye (translateX lineal de una longitud
// de onda, ver .ola-mueve en movil.css); el resto es una línea recta. En pausa
// la onda se aplana (scaleY .08). Variantes: grande (reproductor, el slider
// accesible lo pasa el llamador como children y va encima), barra (mini) e
// icono (fila «sonando»).
import { useId } from 'react';
import { trazoOnda, progresoValido, xEscuchado } from './ola.js';

const VARIANTES = {
  grande: { W: 349, H: 32, y: 16, lo: 24, amp: 7, trazo: 3.6, recta: 3, durRecta: '', degradado: true },
  barra: { W: 340, H: 8, y: 5, lo: 14, amp: 2, trazo: 2.2, recta: 2, degradado: true },
  icono: { W: 18, H: 12, y: 6, lo: 9, amp: 3.5, trazo: 2, recta: 0, dur: '0.9s', degradado: false },
};

export default function OlaProgreso({ variante = 'grande', progreso = 0, pausado = false, children, className = '' }) {
  const v = VARIANTES[variante] ?? VARIANTES.grande;
  const uid = useId().replace(/:/g, '');
  const p = progresoValido(progreso);
  const icono = variante === 'icono';
  const x = icono ? v.W : xEscuchado(p, v.W);
  const grad = `og${uid}`;
  const rec = `oc${uid}`;
  const svg = (
    <svg
      className={`ola ola-${variante}${pausado ? ' pausado' : ''}`}
      viewBox={`0 0 ${v.W} ${v.H}`}
      preserveAspectRatio={icono ? undefined : 'none'}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {v.degradado && (
          <linearGradient id={grad} x1="0" x2={Math.max(x, 1)} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff85b0" />
            <stop offset=".6" stopColor="#ff4d8d" />
            <stop offset="1" stopColor="#c64ff0" />
          </linearGradient>
        )}
        <clipPath id={rec}>
          <rect x="0" y="0" width={x} height={v.H} />
        </clipPath>
      </defs>
      {!icono && <line className="ola-recta" x1={x} y1={v.y} x2={v.W} y2={v.y} strokeWidth={v.recta} strokeLinecap="round" />}
      <g clipPath={`url(#${rec})`}>
        <g className="ola-amp">
          <g className="ola-mueve" style={{ '--lo': `${v.lo}px`, ...(v.dur ? { animationDuration: v.dur } : null) }}>
            <path
              d={trazoOnda(v.W + v.lo * 2, v.y, v.amp, v.lo)}
              fill="none"
              stroke={v.degradado ? `url(#${grad})` : 'currentColor'}
              strokeWidth={v.trazo}
              strokeLinecap="round"
            />
          </g>
        </g>
      </g>
    </svg>
  );
  if (variante !== 'grande') return <span className={`ola-caja ola-caja-${variante} ${className}`.trim()}>{svg}</span>;
  return (
    <div className={`ola-caja ola-caja-grande ${className}`.trim()}>
      {svg}
      <span className="ola-perilla" style={{ left: `${p * 100}%` }} aria-hidden="true" />
      {children}
    </div>
  );
}
