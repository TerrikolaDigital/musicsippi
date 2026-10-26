// src/movil/Corriente.jsx — la «corriente» del hero de Inicio (identidad v4).
// Tres bandas de agua que fluyen a distinto ritmo (8–16 s por vuelta): es la
// única animación ambiental de la app. Con prefers-reduced-motion queda quieta
// (ver .corriente .banda en movil.css).
import { useId } from 'react';
import { trazoOnda } from './ola.js';

const W = 361;
const H = 120;
const CAPAS = [
  { y: H * 0.42, amp: 9, lo: 180, op: 0.22, dur: 16, color: '#ff85b0' },
  { y: H * 0.58, amp: 7, lo: 140, op: 0.2, dur: 11, color: '#a58bff' },
  { y: H * 0.74, amp: 6, lo: 110, op: 0.28, dur: 8, color: '#0a0b16' },
];

export default function Corriente({ className = '' }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg className={`corriente ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {CAPAS.map((c, i) => {
        const onda = trazoOnda(W * 2, c.y, c.amp, c.lo);
        return (
          <g key={i}>
            <defs>
              <linearGradient id={`gc${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={c.color} stopOpacity={c.op} />
                <stop offset="1" stopColor={c.color} stopOpacity={c.op * 0.2} />
              </linearGradient>
            </defs>
            <g className="banda" style={{ '--lo': `${c.lo}px`, animationDuration: `${c.dur}s` }}>
              <path d={`${onda} L${W * 2 + c.lo} ${H} L0 ${H} Z`} fill={`url(#gc${uid}${i})`} />
              <path d={onda} fill="none" stroke="#fff" strokeOpacity={c.op * 0.9} strokeWidth="1" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
