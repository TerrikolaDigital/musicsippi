// src/escritorio/iconosCorriente.jsx — iconos de la v4 «La corriente» en escritorio.
// Geometría copiada de los <symbol> de docs/maquetas/escritorio-v4-corriente.html
// (24 × 24, trazo de 1.9 y currentColor). `relleno` pinta con fill en vez de trazo
// (play, pausa, saltos, corazón lleno, «más»).
const TRAZOS = {
  inicio: <path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.2v-5.2H9.2V20H5a1 1 0 0 1-1-1z" />,
  ondas: <path d="M3 7.5c3-2.6 6 2.6 9 0s6-2.6 9 0M3 12.5c3-2.6 6 2.6 9 0s6-2.6 9 0M3 17.5c3-2.6 6 2.6 9 0s6-2.6 9 0" />,
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.5.87l10.4-6.4a1 1 0 0 0 0-1.74L9.5 4.73A1 1 0 0 0 8 5.6z" />,
  pausa: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1.3" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.3" />
    </>
  ),
  siguiente: (
    <>
      <path d="M5.5 6.6v10.8a.9.9 0 0 0 1.4.75l8-5.4a.9.9 0 0 0 0-1.5l-8-5.4a.9.9 0 0 0-1.4.75z" />
      <rect x="16.5" y="5.5" width="2.6" height="13" rx="1.2" />
    </>
  ),
  anterior: (
    <>
      <path d="M18.5 6.6v10.8a.9.9 0 0 1-1.4.75l-8-5.4a.9.9 0 0 1 0-1.5l8-5.4a.9.9 0 0 1 1.4.75z" />
      <rect x="4.9" y="5.5" width="2.6" height="13" rx="1.2" />
    </>
  ),
  aleatorio: <path d="M3.5 7h3.2c2 0 3.2 1 4.3 2.8l1.6 2.6c1.1 1.8 2.4 3.6 4.4 3.6h3.5M3.5 17h3.2c1.2 0 2.1-.4 2.9-1.2M14.4 8.2C15.2 7.4 16.1 7 17.5 7H20.5M18.3 4.6 20.7 7l-2.4 2.4M18.3 14.6l2.4 2.4-2.4 2.4" />,
  repetir: <path d="M17 3.5 20 6.5 17 9.5M4 11V9.5a3 3 0 0 1 3-3h13M7 20.5 4 17.5 7 14.5M20 13v1.5a3 3 0 0 1-3 3H4" />,
  radio: (
    <>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M8.3 15.7a5.3 5.3 0 0 1 0-7.4M15.7 8.3a5.3 5.3 0 0 1 0 7.4M5.5 18.5a9.2 9.2 0 0 1 0-13M18.5 5.5a9.2 9.2 0 0 1 0 13" />
    </>
  ),
  corazon: <path d="M12 20s-7.5-4.6-7.5-10.2A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />,
  mas: (
    <>
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </>
  ),
  anadir: <path d="M12 5v14M5 12h14" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  letra: <path d="M5 18V8.5A3.5 3.5 0 0 1 8.5 5H10M14 18V8.5A3.5 3.5 0 0 1 17.5 5H19M5 12h4v6H5zM14 12h4v6h-4z" />,
  cola: <path d="M4 6h13M4 11h13M4 16h7M15 14.5v5.5l4.5-2.75z" />,
  infinito: <path d="M7.2 15.4c-1.9 0-3.4-1.5-3.4-3.4s1.5-3.4 3.4-3.4c3.4 0 6.2 6.8 9.6 6.8 1.9 0 3.4-1.5 3.4-3.4s-1.5-3.4-3.4-3.4c-3.4 0-6.2 6.8-9.6 6.8z" />,
  artista: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c1-3.6 3.8-5.2 7-5.2s6 1.6 7 5.2" />
    </>
  ),
  disco: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  lista: <path d="M4 6.5h16M4 12h16M4 17.5h9" />,
  explorar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  ayuda: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8v.2" />
    </>
  ),
  volumen: (
    <>
      <path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z" />
      <path d="M15 9a4 4 0 0 1 0 6M17.6 6.6a7.4 7.4 0 0 1 0 10.8" />
    </>
  ),
  'volumen-bajo': (
    <>
      <path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z" />
      <path d="M15 9a4 4 0 0 1 0 6" />
    </>
  ),
  silencio: (
    <>
      <path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z" />
      <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
    </>
  ),
  luna: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  cargar: <path d="M12 4.5V15M8 11l4 4 4-4M5 19.5h14" />,
  backup: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4 4 0 0 1-.5 8.5z" />,
  movil: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2.4" />
      <path d="M11 17.5h2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8v.1" />
    </>
  ),
  carta: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  llave: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20M17 12v3M20 12v2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  reiniciar: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />,
  semana: <path d="M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM4 10.5h16M8.5 4v4M15.5 4v4M8.5 14h3" />,
  barras: <path d="M5 20V12M10 20V6M15 20V10M20 20V15" />,
  moods: <path d="M12 4.2c3.8 4 6 6.7 6 9.6a6 6 0 0 1-12 0c0-2.9 2.2-5.6 6-9.6z" />,
};

export function IconoC({ nombre, tamano = 20, relleno = false, className = '' }) {
  const trazo = TRAZOS[nombre];
  if (!trazo) return null;
  return (
    <svg
      className={`ic${relleno ? ' ic-relleno' : ''}${className ? ` ${className}` : ''}`}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {trazo}
    </svg>
  );
}
