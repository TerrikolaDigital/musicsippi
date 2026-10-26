// Piezas de escritorio que también usa el móvil (vía ctx.componentes) o el propio App():
// se cargan de inmediato. El resto del escritorio va en chunks perezosos (componentes.jsx, AppEscritorio.jsx).
import { useState, useEffect, useMemo } from 'react';
import { MODO_LOCAL } from '../config/modo.js';
import { Capacitor } from '@capacitor/core';
import { traducirError } from '../../scripts/lib/traducir-error.mjs';
import { migrarHistorial, migrarUltimosModos } from '../data/sesion.js';
import { enviarContacto } from '../data/contacto.js';
import { camposDeMoodNuevo, modoVisible, FAMILIAS_NUEVO, familiaDe } from '../movil/modos.js';
import { formatearTitulo, colorDeEje } from '../ui/formato.js';
import ejesIniciales from '../../data/ejes.json';
import biblioteca from '../../data/biblioteca.json';


// Separa un string de "artista" en los artistas individuales que lo
// componen. Separadores fuertes (" · ", ", ", " vs "): verificados contra los
// datos reales de la biblioteca, SIEMPRE significan colaboración entre
// artistas distintos — sin esto, "Calvin Harris · Sam Smith" no sumaba a los
// tracks de "Calvin Harris" al navegar por artista.
//
// "&" es un separador AMBIGUO: bandas reales lo llevan en el nombre
// ("Hootie & The Blowfish", "Years & Years", "Chase & Status"), pero también
// hay colaboraciones reales acreditadas así ("Justin Bieber & BloodPop®"),
// y separar mal en cualquiera de los dos sentidos rompe algo (banda partida
// en dos "artistas" falsos, o colaboración que no suma al artista principal).
// `artistasSolos` (Set de nombres en minúscula que YA aparecen como crédito
// completo, sin separador, en algún otro track) es la señal para
// desambiguar: si "Justin Bieber" ya existe suelto en la biblioteca, es
// mucho más probable que "Justin Bieber & BloodPop®" sea un feat. que una
// banda — un integrante de una banda real casi nunca aparece acreditado
// solo con su primer nombre. Sin `artistasSolos` (algún llamador que no lo
// tenga a mano) se mantiene el comportamiento previo, conservador: no separa
// por "&".
export function separarArtistas(nombre, artistasSolos) {
  const partes = nombre
    .split(/\s*·\s*|\s*,\s*|\s+vs\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!artistasSolos) return partes;

  const resultado = [];
  for (const parte of partes) {
    const segmentos = parte
      .split(/\s*&\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segmentos.length > 1 && artistasSolos.has(segmentos[0].toLowerCase())) {
      resultado.push(...segmentos);
    } else {
      resultado.push(parte);
    }
  }
  return resultado;
}

// Hasta acá, "últimos modos" e "historial" vivían solo en localStorage del
// navegador — por eso "Seguí escuchando" y "Recientes" aparecían distintos
// (o vacíos) entre el celular, la PC y la app de escritorio empaquetada: cada
// una es un perfil de navegador separado, sin storage en común. Ahora viven
// en el servidor (/api/historial, /api/ultimos-modos), el único lugar que
// los tres comparten. Las claves de localStorage se conservan solo para
// migrar los datos viejos una vez (ver migrarPersistenciaLocal más abajo).
export const CLAVE_ULTIMOS_MODOS = 'ultimosModos';
export const CLAVE_HISTORIAL = 'historialReproduccion';

// Sube el historial/últimos-modos viejo de localStorage al servidor, una
// sola vez. El servidor decide si aplica (solo si todavía no tiene nada
// propio — ver /historial/migrar en vite.config.js), así que no hay riesgo
// de pisar datos que ya llegaron de otro dispositivo. Se llama al montar,
// después de traer el estado real del servidor.
export function migrarPersistenciaLocal() {
  try {
    const historial = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) ?? '[]');
    if (Array.isArray(historial) && historial.length > 0) {
      migrarHistorial(historial).catch(() => {});
    }
  } catch {
    // localStorage/JSON corrupto: no hay nada que migrar, seguir sin más.
  }
  try {
    const ids = JSON.parse(localStorage.getItem(CLAVE_ULTIMOS_MODOS) ?? '[]');
    if (Array.isArray(ids) && ids.length > 0) {
      migrarUltimosModos(ids).catch(() => {});
    }
  } catch {
    // Idem.
  }
}

export const CLAVE_SESION = 'sesionReproduccion';

// Se guardan ids, no los tracks — se resuelven contra la biblioteca actual al
// restaurar, así una edición/fusión de duplicados entre sesiones no deja la
// cola apuntando a un track fantasma. `trackActualId` (no un índice numérico)
// es lo que decide qué track retomar: si algún id de en medio de la cola ya
// no existe, un índice guardado apuntaría a la posición equivocada después
// de filtrar — el id no tiene ese problema.
export function leerSesion() {
  try {
    const cruda = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null');
    if (!cruda || !Array.isArray(cruda.colaIds) || cruda.colaIds.length === 0) return null;
    return cruda;
  } catch {
    return null;
  }
}

export function guardarSesion(datos) {
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(datos));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena); no es crítico.
  }
}

// Resuelve la sesión guardada contra `biblioteca.tracks` (el import estático,
// no el estado `tracks` — a esta altura, antes del primer render, son lo
// mismo). Devuelve null si no hay nada útil que restaurar.
export function restaurarSesion() {
  const s = leerSesion();
  if (!s) return null;
  const porId = new Map(biblioteca.tracks.map((t) => [t.id, t]));
  const cola = s.colaIds.map((id) => porId.get(id)).filter(Boolean);
  if (cola.length === 0) return null;

  const indiceHallado = cola.findIndex((t) => t.id === s.trackActualId);
  const ejeActivo = s.ejeActivoId
    ? (ejesIniciales.ejes.find((e) => e.id === s.ejeActivoId) ?? { nombre: s.ejeActivoNombre ?? '' })
    : s.ejeActivoNombre
      ? { nombre: s.ejeActivoNombre }
      : null;
  const ejeVista = s.ejeVistaId ? (ejesIniciales.ejes.find((e) => e.id === s.ejeVistaId) ?? null) : null;

  return {
    cola,
    indice: indiceHallado >= 0 ? indiceHallado : 0,
    tiempo: typeof s.tiempo === 'number' && s.tiempo > 0 ? s.tiempo : 0,
    ejeActivo,
    ejeVista,
    aleatorio: typeof s.aleatorio === 'boolean' ? s.aleatorio : true,
    repetir: typeof s.repetir === 'boolean' ? s.repetir : false,
  };
}


/**
 * Tono determinístico por artista para el avatar-iniciales de "Por artistas":
 * mismo nombre, siempre mismo tono, sin tabla curada a mano. Devuelve un par
 * de hues (base + 26° más claro) para armar un degradado propio por tarjeta
 * en vez del único --gradiente-acento fijo que hacía que todos los avatares
 * sin foto se vieran iguales.
 */
export function colorDeArtista(nombre) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) {
    hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue}, 62%, 52%), hsl(${(hue + 26) % 360}, 68%, 38%))`;
}

// Deezer no devuelve null cuando un artista no tiene foto — devuelve una URL
// real y cargable de un silueta genérica gris, cuyo id es el hash MD5 del
// string vacío ("d41d8cd9..."), siempre el mismo sin importar el artista.
// Sin este filtro, `foto ? <img> : <iniciales>` toma la rama <img> igual
// (la URL SÍ carga) y las iniciales de color nunca se llegan a mostrar —
// exactamente el bug reportado ("siguen apareciendo muchas sin foto").
export function fotoEsValida(url) {
  return !!url && !url.includes('d41d8cd98f00b204e9800998ecf8427e');
}

/**
 * Set chico de iconos SVG monocromos (stroke currentColor), en vez de emoji
 * de color — en Windows, iconos como 🔀 se renderizan con su propio fondo de
 * color (ver el aleatorio de la barra: quedaba con una caja azul detrás) que
 * no se puede tema-ar ni combinar con el resto de botones de la app, que son
 * siempre monocromos. Con currentColor, hereda el color del botón (incluido
 * el estado .activo) igual que el resto del set de iconos.
 */
export function Icono({ nombre, tamano = 15 }) {
  const props = {
    width: tamano,
    height: tamano,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };
  switch (nombre) {
    case 'buscar':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'descargar':
      return (
        <svg {...props}>
          <path d="M12 3v12" />
          <polyline points="7 11 12 16 17 11" />
          <path d="M4 19h16" />
        </svg>
      );
    case 'subir':
      return (
        <svg {...props}>
          <path d="M12 21V9" />
          <polyline points="7 14 12 9 17 14" />
          <path d="M4 3h16" />
        </svg>
      );
    case 'ayuda':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7" />
          <line x1="12" y1="17" x2="12" y2="17.01" />
        </svg>
      );
    case 'ajustes':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'historial':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'silencio':
      return (
        <svg {...props}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      );
    case 'volumen-bajo':
      return (
        <svg {...props}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    case 'volumen-alto':
      return (
        <svg {...props}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      );
    case 'aleatorio':
      return (
        <svg {...props}>
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      );
    case 'infinito':
      // El path original mide 8 de alto contra 24 de ancho (todo el símbolo
      // vive entre y=8 e y=16) — al lado de íconos que sí llenan el
      // viewBox (el círculo de "historial" mide 20 de diámetro) se ve
      // notoriamente más chico. Se estira solo en Y, centrado, para igualar
      // el peso visual sin recortarse contra los bordes en X (ya usa casi
      // todo el ancho disponible).
      return (
        <svg {...props}>
          <g transform="translate(12 12) scale(1 2.25) translate(-12 -12)">
            <path d="M18.178 8c5.096 0 5.096 8 0 8c-5.095 0-7.133-8-12.35-8c-5.096 0-5.096 8 0 8c5.217 0 7.255-8 12.35-8z" />
          </g>
        </svg>
      );
    case 'repetir':
      return (
        <svg {...props}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case 'cronometro':
      return (
        <svg {...props}>
          <circle cx="12" cy="14" r="8" />
          <line x1="12" y1="14" x2="12" y2="10" />
          <line x1="9" y1="2" x2="15" y2="2" />
          <line x1="12" y1="2" x2="12" y2="6" />
        </svg>
      );
    case 'corazon':
      return (
        <svg {...props}>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      );
    case 'personas':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'lista':
      return (
        <svg {...props}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    case 'nota':
      return (
        <svg {...props}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case 'explorar':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case 'disco':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

// Guía de referencia permanente — a diferencia del recorrido de bienvenida
// (que se ve una vez y se pierde), esto queda siempre disponible acá para
// quien lo necesite releer. Contenido estático a propósito, igual que
// AcercaDe: es explicación de cómo funciona la app, no datos del usuario.
export function Ayuda({ onVerOnboarding, onIrACargar, onIrAModos, onIrABuscar, onIrAExplorar, onIrAInicio }) {
  return (
    <div className="ayuda-seccion">
      <section className="ayuda-bloque">
        <div className="ayuda-bloque-icono">
          <Icono nombre="subir" tamano={20} />
        </div>
        <div className="ayuda-bloque-texto">
          <h3>Lo más importante primero: traé tu música</h3>
          <p className="ayuda">
            El paso que más cambia la experiencia es cargar tu biblioteca real desde donde ya escuchás
            música: Spotify, Apple Music, YouTube Music, Amazon Music, etc. Sin esto, la app arranca
            vacía. Se hace una sola vez (o cada vez que quieras sumar una playlist nueva).
          </p>
          {/* Un solo botón, no botón + link a lo mismo: antes había un CTA
              visual acá Y "Ir a Cargar biblioteca →" abajo, dos caminos
              redundantes al mismo lugar (pedido explícito: "organizalo que
              quede bonito"). */}
          <button className="ayuda-cta-visual" onClick={onIrACargar}>
            <Icono nombre="subir" tamano={16} /> Cargar biblioteca
          </button>
        </div>
      </section>

      <section className="ayuda-bloque">
        <div className="ayuda-bloque-icono">
          <Icono nombre="buscar" tamano={20} />
        </div>
        <div className="ayuda-bloque-texto">
          <h3>Agregar canciones sueltas, cuando quieras</h3>
          <p className="ayuda">
            No hace falta re-exportar nada para sumar un tema nuevo. Escribí en el buscador de arriba
            (canción, álbum o artista): aparecen resultados reales de YouTube que podés escuchar al
            toque, asignar a un modo y agregar a tu biblioteca. Sirve tanto para música que ya conocés
            como para descubrir algo parecido a lo que ya tenés.
          </p>
          <button className="ayuda-explorar-preview" onClick={onIrAExplorar}>
            <Icono nombre="explorar" tamano={16} /> Explorar
          </button>
        </div>
      </section>

      <section className="ayuda-bloque">
        <div className="ayuda-bloque-icono">
          <Icono nombre="historial" tamano={20} />
        </div>
        <div className="ayuda-bloque-texto">
          <h3>Cómo se organiza sola</h3>
          <p className="ayuda">
            Cada canción se asigna a un modo automáticamente por artista, sin claves ni servicios pagos.
            Lo que no matchea con ningún artista conocido queda en "Sin clasificar" para que lo asignes
            vos una vez; desde ahí la app aprende esa decisión y la aplica sola al resto de canciones de
            ese artista.
          </p>
          {/* Réplica estática del aviso real (.aviso-sin-clasificar, ver arriba
              de <header>) con números de ejemplo — solo para mostrar de un
              vistazo qué pinta tiene "se está organizando sola". En el flujo
              normal del texto, no flotando aparte (mismo pedido de orden). */}
          <div className="ayuda-visual-mock" aria-hidden="true">
            <p className="ayuda-visual-mock-texto">Organizando tu biblioteca: 56/674 canciones</p>
            <div className="ayuda-visual-mock-barra">
              <div className="ayuda-visual-mock-barra-relleno" />
            </div>
          </div>
          <button className="ayuda-link" onClick={onIrAModos}>
            Ir a "Sin clasificar" →
          </button>
        </div>
      </section>

      <section className="ayuda-bloque">
        <div className="ayuda-bloque-icono">
          <Icono nombre="aleatorio" tamano={20} />
        </div>
        <div className="ayuda-bloque-texto">
          <h3>Modos de escucha e Infinito</h3>
          <p className="ayuda">
            Los "modos" son tuyos: pop-dance, rock latino, para trabajar, para el gimnasio, los que
            quieras, no un algoritmo adivinando. Si preferís no elegir nada, el botón "Infinito" en
            Inicio rápido mezcla toda tu biblioteca y no para nunca.
          </p>
          <div className="ayuda-modos-preview" aria-hidden="true">
            <span className="ayuda-modo-chip">
              <span className="ayuda-modo-chip-color" style={{ background: colorDeArtista('Rock latino') }} />
              Rock latino
            </span>
            <span className="ayuda-modo-chip">
              <span
                className="ayuda-modo-chip-color"
                style={{ background: colorDeArtista('Para el gimnasio') }}
              />
              Para el gimnasio
            </span>
          </div>
          <button className="ayuda-link" onClick={onIrAInicio}>
            Ir a Inicio →
          </button>
        </div>
      </section>

      <button className="ayuda-reboton" onClick={onVerOnboarding}>
        <Icono nombre="ayuda" tamano={14} /> Volver a ver la bienvenida
      </button>
    </div>
  );
}

// Estático a propósito: es información de la app en sí, no del usuario — no
// justifica una ruta de API ni leer package.json desde el navegador.
export function AcercaDe() {
  // __SELLO_VERSION__ lo inyecta vite.config.js en build-time (ver
  // sellarVersion() ahí). Se muestra para poder responder de un vistazo "¿qué
  // versión estoy corriendo?" — el 30/08 se instaló un .exe que parecía al día
  // pero venía de un commit anterior a los últimos arreglos, y detectarlo
  // requirió comparar el código empaquetado contra el repo a mano.
  const sello = typeof __SELLO_VERSION__ !== 'undefined' ? __SELLO_VERSION__ : null;
  const fecha = sello?.fecha ? new Date(sello.fecha).toLocaleDateString('es') : null;
  return (
    <div className="acerca-de">
      <div className="acerca-de-texto">
        <p className="acerca-nombre">Musicsippi</p>
        {/* En Android la versión real (1.N) la enseña «Versión instalada» debajo. */}
        {!globalThis.Capacitor?.isNativePlatform?.() && <p className="ayuda">Versión 0.1.0</p>}
        <p className="ayuda">Hecho por @terrikoladigital</p>
        <p className="ayuda">
          Contacto: <a href="mailto:terrikoladigital@gmail.com">terrikoladigital@gmail.com</a>
        </p>
        <p className="ayuda">
          Musicsippi no aloja música. Las canciones pertenecen a sus autores y se reproducen desde
          servicios de terceros. Uso personal, sin fines comerciales.
        </p>
        <p className="ayuda">Agosto de 2026</p>
        {sello && (
          <p className="ayuda acerca-sello">
            {sello.commit}
            {/* "sucio" = al empaquetar había cambios sin commitear, así que lo
                que corre no es exactamente ese commit. Sin esta marca el sello
                mentiría por omisión justo cuando más importa. */}
            {sello.sucio && ' +cambios locales'}
            {sello.dev && ' · desarrollo'}
            {fecha && ` · ${fecha}`}
          </p>
        )}
      </div>
      <div className="acerca-de-logo">
        <img src="/musicsippi-app-icon-512.png" alt="" aria-hidden="true" />
        {/* Mismo tratamiento de texto que .titulo de la cabecera (Music +
            "sippi" con el degradado) — pedido explícito: el ícono solo se ve
            mejor acompañado del nombre. */}
        <p className="acerca-de-logo-texto">
          Music<span className="titulo-acento">sippi</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Manda un mensaje directo a FormSubmit.co (ver
 * docs/superpowers/specs/2026-09-03-formulario-contacto-design.md) — no
 * pasa por nuestro servidor ni por ningún /api/*, es el único punto de la
 * app que le habla a un tercero fuera de YouTube/Deezer/MusicBrainz.
 */
export function Escribinos() {
  const [mensaje, setMensaje] = useState('');
  const [email, setEmail] = useState('');
  const [honey, setHoney] = useState('');
  const [estado, setEstado] = useState('inicial'); // inicial | enviando | listo | error
  const [errorMensaje, setErrorMensaje] = useState(null);

  const listoParaEnviar = mensaje.trim() !== '' && email.trim() !== '';

  async function manejarSubmit(e) {
    e.preventDefault();
    if (!listoParaEnviar || estado === 'enviando') return;
    if (honey.trim() !== '') return; // bot: se descarta en silencio, sin feedback ni request

    setEstado('enviando');
    setErrorMensaje(null);
    try {
      const r = await enviarContacto({ mensaje, email, honey });
      const data = await r.json();
      if (!r.ok || data.success !== 'true') {
        throw new Error(data.message || `HTTP ${r.status}`);
      }
      setEstado('listo');
      setMensaje('');
      setEmail('');
    } catch (err) {
      setErrorMensaje(traducirError(err));
      setEstado('error');
    }
  }

  return (
    <form className="escribinos" onSubmit={manejarSubmit}>
      <p className="ayuda">
        ¿Encontraste un bug, algo no anda, o tenés una idea para la app? Escríbele directo al equipo acá
        abajo.
      </p>

      <label className="escribinos-campo">
        Tu mensaje
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Contame qué pasó o qué te gustaría que tenga la app…"
          rows={5}
          required
        />
      </label>

      <label className="escribinos-campo">
        Tu email (para poder responderte)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vos@ejemplo.com"
          required
        />
      </label>

      {/* Honeypot: invisible para una persona, un bot que autocompleta todo
          lo llena. Nombre del campo fijo porque FormSubmit lo reconoce por
          ese nombre exacto ("_honey") para descartar el envío. */}
      <input
        type="text"
        name="_honey"
        value={honey}
        onChange={(e) => setHoney(e.target.value)}
        className="escribinos-honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <button
        type="submit"
        className="escribinos-enviar"
        disabled={!listoParaEnviar || estado === 'enviando'}
      >
        {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
      </button>

      {estado === 'listo' && <p className="ayuda">✓ Mensaje enviado, gracias.</p>}
      {estado === 'error' && <p className="aviso">No se pudo enviar: {errorMensaje}</p>}
    </form>
  );
}

/**
 * Exporta lo que es dato del usuario (biblioteca, ejes, favoritos,
 * correcciones manuales, descartados) a un JSON descargable — no incluye
 * cache de portadas/fotos/videoIds, que se puede volver a pedir a las APIs.
 * Local primero (decisión de diseño), nube queda para más adelante.
 */
// Pestaña "Móvil" de Configuración. En el escritorio muestra la dirección que
// hay que escribir en el móvil; en la app Android, el formulario para traer la
// biblioteca del PC por la WiFi (ver src/data/sincronizar-movil.js).
export function SincronizacionMovil({ recargarDatosLocales }) {
  const enAndroid = MODO_LOCAL && Capacitor.isNativePlatform();
  const [direcciones, setDirecciones] = useState(null);
  const [direccion, setDireccion] = useState('');
  const [estado, setEstado] = useState({ fase: 'inicial' }); // inicial | sincronizando | listo | error

  useEffect(() => {
    if (enAndroid) {
      import('../data/sincronizar-movil.js').then((m) => m.obtenerDireccionPC()).then((d) => d && setDireccion(d));
      return;
    }
    if (MODO_LOCAL) return;
    fetch('/api/direcciones-red')
      .then((r) => r.json())
      .then((j) => setDirecciones(j.direcciones ?? []))
      .catch(() => setDirecciones([]));
  }, [enAndroid]);

  async function sincronizar(e) {
    e.preventDefault();
    setEstado({ fase: 'sincronizando' });
    try {
      const { sincronizarConPC } = await import('../data/sincronizar-movil.js');
      const r = await sincronizarConPC(direccion);
      setEstado({ fase: 'listo', ...r });
      await recargarDatosLocales();
    } catch (err) {
      setEstado({ fase: 'error', mensaje: err?.message ?? String(err) });
    }
  }

  if (enAndroid) {
    return (
      <div className="sincronizacion-movil">
        <p className="ayuda">
          Envía al PC lo que cambiaste en el móvil y trae su biblioteca: canciones, modos, portadas y me gusta. Lo que hiciste en el
          móvil (modos puestos a mano, me gusta) se conserva. Abre la app de escritorio, mira la dirección en
          Configuración → Móvil y escríbela aquí. El PC y el móvil tienen que estar en la misma WiFi.
        </p>
        <form onSubmit={sincronizar} className="sincronizacion-movil-form">
          <input
            type="text"
            inputMode="url"
            placeholder="192.168.0.10:51234"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            aria-label="Dirección del PC"
          />
          <button type="submit" disabled={estado.fase === 'sincronizando' || !direccion.trim()}>
            {estado.fase === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar con el PC'}
          </button>
        </form>
        {estado.fase === 'listo' && (
          <p className="aviso">
            Listo: {estado.canciones} canciones y {estado.modos} modos{estado.subidos ? ` (${estado.subidos} cambios del móvil enviados al PC)` : ""}. Biblioteca actualizada.
          </p>
        )}
        {estado.fase === 'error' && <p className="aviso">{estado.mensaje}</p>}
      </div>
    );
  }

  if (MODO_LOCAL) {
    return <p className="ayuda">La sincronización con el PC está en la app de Android.</p>;
  }

  return (
    <div className="sincronizacion-movil">
      <p className="ayuda">
        Para llevar tu biblioteca a la app de Android: con esta ventana abierta y el móvil en la misma WiFi,
        escanea el código con la cámara del móvil. Se abre Musicsippi y se sincroniza sola. (También puedes
        escribir la dirección en el móvil, en Configuración → Móvil.)
      </p>
      {direcciones === null && <p className="ayuda">Buscando la dirección…</p>}
      {direcciones?.length === 0 && <p className="aviso">Este PC no parece estar conectado a ninguna red.</p>}
      {/* La WiFi de casa (192.168.x) primero: suele haber también adaptadores
          de VPN o de máquinas virtuales. El QR va solo para la primera. */}
      {direcciones &&
        [...direcciones]
          .sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')))
          .map((d, i) => (
            <div key={d} className="sincronizacion-movil-qr">
              {i === 0 && (
                <img
                  src={`/api/qr-movil?d=${encodeURIComponent(d)}`}
                  alt={`Código QR para sincronizar con ${d}`}
                  width={240}
                  height={240}
                />
              )}
              <p className="sincronizacion-movil-direccion">{d}</p>
            </div>
          ))}
    </div>
  );
}

// `soloId`: muestra únicamente ese modo (móvil: «Editar modo»). `ordenar`: ordena la lista cuando no
// hay orden elegido en la cabecera (móvil: selector A–Z / canciones); sin él, el orden manual de siempre.
export function EditorEjes({ ejes, conteos, onGuardar, onCrear, onEntrar, soloId = null, ordenar = null }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('genero'); // familia del mood nuevo: 'estado' | 'genero' | 'fijo'
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState('');
  // Orden manual (`orden`) es el default de siempre. Pedido explícito: poder
  // ordenar por nombre (alfabético) o por cantidad de canciones, haciendo
  // clic en el título de esa columna — un segundo clic sobre la misma
  // columna invierte la dirección, igual que en una tabla de planilla.
  const [ordenPor, setOrdenPor] = useState(null); // null = orden manual
  const [ordenDireccion, setOrdenDireccion] = useState('asc');

  function alternarOrden(columna) {
    if (ordenPor === columna) {
      setOrdenDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenPor(columna);
      setOrdenDireccion('asc');
    }
  }

  const ejesOrdenados = useMemo(() => {
    const visibles = soloId ? ejes.filter((e) => e.id === soloId) : ejes;
    if (ordenPor === null) return ordenar ? ordenar(visibles) : [...visibles].sort((a, b) => a.orden - b.orden);
    const copia = [...visibles];
    if (ordenPor === 'nombre') {
      copia.sort((a, b) => formatearTitulo(a.nombre).localeCompare(formatearTitulo(b.nombre), 'es'));
    } else if (ordenPor === 'canciones') {
      copia.sort((a, b) => (conteos.get(a.id) ?? 0) - (conteos.get(b.id) ?? 0));
    }
    if (ordenDireccion === 'desc') copia.reverse();
    return copia;
  }, [ejes, conteos, ordenPor, ordenDireccion, soloId, ordenar]);

  async function crear() {
    // Mismos campos que la hoja «Crear» del móvil: familia, autoRellenar y creadoPorUsuario
    // (sin él, un mood vacío recién creado quedaría oculto y parecería que no se creó).
    const campos = camposDeMoodNuevo(tipo);
    await onCrear(nombre, campos.tipo, campos);
    setNombre('');
  }

  function empezarEdicion(eje) {
    setEditandoId(eje.id);
    setBorrador(eje.nombre);
  }

  function guardarNombre(id) {
    const limpio = borrador.trim();
    setEditandoId(null);
    if (!limpio) return;
    onGuardar(ejes.map((e) => (e.id === id ? { ...e, nombre: limpio } : e)));
  }

  function alternarActivo(id) {
    onGuardar(ejes.map((e) => (e.id === id ? { ...e, activo: !modoVisible(e) } : e)));
  }

  function eliminar(eje) {
    const n = conteos.get(eje.id) ?? 0;
    const hijos = ejes.filter((e) => e.padre === eje.id);
    const avisoHijos =
      hijos.length > 0
        ? `\n\n${hijos.length} sub-mood(s) (${hijos.map((h) => formatearTitulo(h.nombre)).join(', ')}) ` +
          `pasan a ser moods de primer nivel.`
        : '';
    // Ojo con la promesa: /api/ejes solo reescribe ejes.json, nunca
    // biblioteca.json. Los tracks asignados quedan apuntando a un id que ya no
    // existe hasta la proxima "npm run importar" — no caen a "Sin clasificar"
    // al instante, aunque el texto viejo lo decia. Mientras tanto, esos tracks
    // no aparecen en ningun modo.
    const ok = window.confirm(
      `Eliminar "${formatearTitulo(eje.nombre)}" definitivamente.\n\n` +
        `${n} canciones tienen esta asignación. Van a quedar apuntando a un eje que ` +
        `ya no existe hasta la próxima importación (npm run importar); mientras ` +
        `tanto no van a aparecer en ningún modo.${avisoHijos}\n\n` +
        `Desactivarlo en vez de borrarlo conserva las asignaciones y es reversible. ` +
        `¿Eliminar igual?`
    );
    if (!ok) return;

    const sinEje = ejes.filter((e) => e.id !== eje.id);
    // Promover los hijos en la MISMA escritura: si se dejara padre apuntando a
    // un id que ya no esta en el array, el propio servidor lo rechaza (ver
    // validarEjes en vite.config.js) — y sin promoverlos, ademas, quedarian
    // inalcanzables en la UI (ver el filtro de "huerfanos" mas arriba).
    const promovidos = sinEje.map((e) => (e.padre === eje.id ? { ...e, padre: null } : e));
    onGuardar(promovidos);
  }

  return (
    <div className="editor">
      {!soloId && (
      <div className="crear">
        <input
          value={nombre}
          placeholder={tipo === 'fijo' ? 'Nombre de la lista nueva' : 'Nombre del mood nuevo'}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {FAMILIAS_NUEVO.map(([id, etiqueta]) => (
            <option key={id} value={id}>{etiqueta}</option>
          ))}
          {/* Una lista fija nunca se rellena sola: los tracks entran solo por
              «Agregar a lista» desde el menú de cada track. */}
          <option value="fijo">Lista</option>
        </select>
        <button onClick={crear}>Crear</button>
      </div>
      )}

      <table>
        <thead>
          <tr>
            <th>
              <button className="th-ordenable" onClick={() => alternarOrden('nombre')}>
                Mood{ordenPor === 'nombre' && (ordenDireccion === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </th>
            <th>Tipo</th>
            <th>
              <button className="th-ordenable" onClick={() => alternarOrden('canciones')}>
                Canciones{ordenPor === 'canciones' && (ordenDireccion === 'asc' ? ' ↑' : ' ↓')}
              </button>
            </th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ejesOrdenados.map((e) => (
              <tr key={e.id} className={modoVisible(e) ? '' : 'inactivo'}>
                <td className="nombre-eje">
                  {/* Solo se ve en el móvil (CSS bajo .m-subpantalla): el color de la tarjeta del modo. */}
                  <span className="punto-eje" style={{ background: colorDeEje(e) }} aria-hidden="true" />
                  {e.padre && <span className="sub">↳ </span>}
                  {editandoId === e.id ? (
                    <input
                      className="editar-nombre"
                      value={borrador}
                      autoFocus
                      onChange={(ev) => setBorrador(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') guardarNombre(e.id);
                        if (ev.key === 'Escape') setEditandoId(null);
                      }}
                      onBlur={() => guardarNombre(e.id)}
                    />
                  ) : (
                    <button className="link-editar" onClick={() => empezarEdicion(e)} title="Editar nombre">
                      {formatearTitulo(e.nombre)} ✎
                    </button>
                  )}
                  <code>{e.id}</code>
                </td>
                <td>
                  {e.tipo === 'sistema' ? 'Sistema' : { estado: 'Estado', genero: 'Género', fijo: 'Lista' }[familiaDe(e)]}
                </td>
                <td>{conteos.get(e.id) ?? 0}</td>
                <td>{modoVisible(e) ? 'activo' : 'oculto'}</td>
                <td className="acciones-celda">
                  <div className="acciones">
                    {(conteos.get(e.id) ?? 0) > 0 && (
                      <button onClick={() => onEntrar(e)} title="Ver las canciones de este mood">
                        Ver lista
                      </button>
                    )}
                    {!e.sistema && (
                      <>
                        <button onClick={() => alternarActivo(e.id)}>
                          {modoVisible(e) ? 'Ocultar' : 'Mostrar'}
                        </button>
                        <button className="peligro" onClick={() => eliminar(e)}>
                          Eliminar
                        </button>
                      </>
                    )}
                    {e.sistema && <span className="nota">no eliminable</span>}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
