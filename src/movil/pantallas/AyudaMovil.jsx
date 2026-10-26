// src/movil/pantallas/AyudaMovil.jsx
// Ayuda propia del móvil (Configuración → Ayuda): secciones plegables con lo
// que de verdad se hace en esta interfaz, un icono y una mini ilustración por
// sección y botones que llevan al sitio. La del escritorio describe otra.
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { IconoM } from '../iconos.jsx';

// Mini ilustraciones hechas con los mismos iconos de la app (sin imágenes).
function Pestanas() {
  return (
    <div className="m-ayuda-ilu m-ayuda-pestanas" aria-hidden="true">
      {[['inicio', 'Inicio'], ['modos', 'Moods'], ['buscar', 'Buscar'], ['biblioteca', 'Biblioteca']].map(([i, t]) => (
        <span key={i}>
          <IconoM nombre={i} />
          <small>{t}</small>
        </span>
      ))}
    </div>
  );
}

function TarjetasModo() {
  return (
    <div className="m-ayuda-ilu m-ayuda-modos" aria-hidden="true">
      {[['Entrenar', '#ff4d8d'], ['Concentrarte', '#7c5cff'], ['Cenar', '#4cd9c6']].map(([t, c]) => (
        <span key={t} style={{ '--c': c }}>
          {t}
        </span>
      ))}
      <span className="m-ayuda-mas">
        <IconoM nombre="mas" />
      </span>
    </div>
  );
}

function PieReproductor() {
  return (
    <div className="m-ayuda-ilu m-ayuda-pie" aria-hidden="true">
      {[
        ['letra', 'Letra'],
        ['aleatorio', 'Aleatorio'],
        ['repetir', 'Repetir'],
        ['radio', 'Radio'],
        ['dispositivos', 'Dispositivos'],
      ].map(([i, t]) => (
        <span key={i}>
          <IconoM nombre={i} />
          <small>{t}</small>
        </span>
      ))}
    </div>
  );
}

function MenuCancion() {
  return (
    <div className="m-ayuda-ilu m-ayuda-menu" aria-hidden="true">
      <span className="m-ayuda-fila">
        <b>Canción</b>
        <IconoM nombre="puntos" />
      </span>
      {[['modos', 'Añadir a un mood'], ['corazon', 'Favoritas'], ['persona', 'Ir al artista']].map(([i, t]) => (
        <span key={t} className="m-ayuda-opcion">
          <IconoM nombre={i} tamano={18} />
          {t}
        </span>
      ))}
    </div>
  );
}

function SincronizarCopia() {
  return (
    <div className="m-ayuda-ilu m-ayuda-sync" aria-hidden="true">
      <span>
        <IconoM nombre="sincronizar" />
        <small>PC y móvil por WiFi</small>
      </span>
      <span>
        <IconoM nombre="disco" />
        <small>Copia en un archivo</small>
      </span>
    </div>
  );
}

const SECCIONES = (nav, modoLocal) => [
  {
    titulo: 'Las cuatro pestañas',
    icono: 'inicio',
    color: '#7c5cff',
    abierta: true,
    ilustracion: <Pestanas />,
    contenido: [
      ['Inicio', 'tus moods, lo último que has escuchado y accesos rápidos para empezar a sonar.'],
      ['Moods', 'tus estados y géneros en una cuadrícula. Entra en uno para ver sus canciones y reproducirlo.'],
      ['Buscar', 'canciones, álbumes y artistas, tanto de tu biblioteca como de fuera.'],
      ['Biblioteca', 'tus canciones, artistas y álbumes, con las favoritas a mano.'],
    ],
    enlaces: [
      ['Abrir Moods', () => nav.irAPestana('modos')],
      ['Ir a Buscar', () => nav.irAPestana('buscar')],
      ['Abrir Biblioteca', () => nav.irAPestana('biblioteca')],
    ],
  },
  {
    titulo: 'Qué es un mood',
    icono: 'modos',
    color: '#ff4d8d',
    ilustracion: <TarjetasModo />,
    contenido: [
      [null, 'Un mood agrupa canciones de tu biblioteca. Hay dos familias: Estados (cómo te sientes o qué haces: entrenar, concentrarte…) y Géneros (cómo suena). Las listas son moods con «Se rellena sola» desactivado.'],
      ['Crear', 'en Moods, toca el botón + («Crear un mood») y ponle nombre.'],
      ['Editar', 'abre un mood y usa «Más opciones del mood» para cambiarlo. En Configuración → Administrar moods puedes crear, renombrar, ordenar y cambiar colores.'],
    ],
    enlaces: [
      ['Abrir Moods', () => nav.irAPestana('modos')],
      ['Administrar moods', () => nav.abrir({ tipo: 'config-modos' })],
    ],
  },
  {
    titulo: 'El reproductor',
    icono: 'play',
    color: '#4cd9c6',
    ilustracion: <PieReproductor />,
    contenido: [
      ['Abrir', 'toca el mini reproductor de abajo.'],
      ['Cerrar', 'con el botón ⌄ de arriba a la izquierda, deslizando hacia abajo o con el gesto «atrás».'],
      ['Letra', 'toca el icono de letra. Si la letra no va sincronizada, ajústala con −5, −0,5, +0,5 y +5 segundos hasta que cuadre.'],
      ['Cola', 'reordena arrastrando una canción, quítala de la cola o mira lo que suena «A continuación».'],
      ['Dispositivos', 'el icono de la pantalla con ondas abre el selector del móvil para elegir dónde suena: altavoz, auriculares Bluetooth u otro dispositivo.'],
      ['Radio', 'sigue sonando música parecida cuando se acaba la cola.'],
      ['Aleatorio y repetir', 'mezclan la cola o repiten una canción o toda la lista.'],
      ['Temporizador', 'apaga la música pasado un rato, ideal para dormir.'],
    ],
    enlaces: [['Temporizador para dormir', () => nav.abrirCapa({ tipo: 'hoja', config: 'sueno' })]],
  },
  {
    titulo: 'El menú ⋯ de una canción',
    icono: 'puntos',
    color: '#e8a838',
    ilustracion: <MenuCancion />,
    contenido: [
      [null, 'Los tres puntos de cualquier canción abren sus acciones:'],
      ['Añadir a un mood', 'la mete (o la saca) de los moods que quieras; el aviso trae Deshacer.'],
      ['Mover a otro mood…', 'la saca del mood actual y la pasa al que elijas.'],
      ['Favoritas', 'marca o quita el corazón.'],
      ['Ir al artista / álbum', 'salta directamente a su pantalla.'],
    ],
    enlaces: [['Abrir Biblioteca', () => nav.irAPestana('biblioteca')]],
  },
  {
    titulo: 'Sincronizar con el PC y copia de seguridad',
    icono: 'sincronizar',
    color: '#7c5cff',
    ilustracion: <SincronizarCopia />,
    contenido: [
      ['Sincronizar', 'en Configuración → Sincronizar con el PC, el móvil y el ordenador intercambian biblioteca y moods por WiFi. Los dos deben estar en la misma red.'],
      ['Copia de seguridad', 'en Configuración → Copia de seguridad guardas un archivo con tus datos y puedes restaurarlo más tarde o en otro móvil.'],
    ],
    enlaces: [
      ['Ir a Sincronizar con el PC', () => nav.abrir({ tipo: 'config-sincronizar' })],
      ['Copia de seguridad', () => nav.abrir({ tipo: 'config-copia' })],
    ],
  },
  {
    titulo: 'Importar música por enlace',
    icono: 'descargar',
    color: '#ff4d8d',
    contenido: [
      ['Pegar un enlace', 'en Biblioteca toca el + (o en Configuración → Añadir música) y pega el enlace de una playlist de Spotify, YouTube Music o Deezer. Verás su nombre y cuántas canciones tiene antes de importarla.'],
      ['Compartir desde otra app', 'también puedes compartir la playlist desde Spotify, YouTube Music o Deezer y elegir Musicsippi: el enlace se lee solo.'],
      ['Se ordena sola', 'al importar, Musicsippi busca los géneros y coloca las canciones en tus moods, creando moods nuevos si hace falta. La primera vez descarga unos 160 MB (mejor con WiFi) y funciona en segundo plano mientras escuchas. Al terminar te avisa y marca los moods nuevos.'],
    ],
    enlaces: [
      ['Añadir música', () => nav.abrirCapa({ tipo: 'hoja', config: 'anadir' })],
      ...(modoLocal ? [['Ver la bienvenida', () => nav.abrirCapa({ tipo: 'bienvenida', paso: 1 })]] : []),
    ],
  },
];

export default function AyudaMovil({ ctx, nav }) {
  return (
    <SubpantallaMovil titulo="Ayuda" nav={nav}>
      <div className="m-ayuda">
        {SECCIONES(nav, ctx.modoLocal).map((s) => (
          <details key={s.titulo} open={s.abierta} style={{ '--c': s.color }}>
            <summary>
              <span className="m-ayuda-icono" aria-hidden="true">
                <IconoM nombre={s.icono} tamano={26} />
              </span>
              <span className="m-ayuda-titulo">{s.titulo}</span>
            </summary>
            {s.ilustracion}
            <ul>
              {s.contenido.map(([cabeza, texto]) => (
                <li key={`${cabeza}-${texto}`}>
                  {cabeza && <b>{cabeza}: </b>}
                  {texto}
                </li>
              ))}
            </ul>
            {s.enlaces && (
              <div className="m-ayuda-enlaces">
                {s.enlaces.map(([texto, ir]) => (
                  <button key={texto} type="button" className="pulsable" onClick={ir}>
                    {texto}
                    <IconoM nombre="atras" tamano={16} />
                  </button>
                ))}
              </div>
            )}
          </details>
        ))}
      </div>
    </SubpantallaMovil>
  );
}
