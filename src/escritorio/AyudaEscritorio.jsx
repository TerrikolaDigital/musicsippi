// src/escritorio/AyudaEscritorio.jsx
// Ayuda de escritorio (Configuración → Ayuda) con el mismo diseño que la del móvil (AyudaMovil.jsx): secciones
// plegables con icono en tarjeta de color, mini ilustración hecha con los iconos de la app y botones-enlace.
// El contenido describe lo que se hace en ESTA interfaz.
import { IconoC } from './iconosCorriente.jsx';

const Ilu = ({ clase, children }) => (
  <div className={`ayuda-mv-ilu ${clase}`} aria-hidden="true">
    {children}
  </div>
);

const conIconos = (lista) =>
  lista.map(([i, t]) => (
    <span key={i}>
      <IconoC nombre={i} tamano={22} />
      <small>{t}</small>
    </span>
  ));

const ilustraciones = {
  barra: () => <Ilu clase="ayuda-mv-iconos">{conIconos([['inicio', 'Inicio'], ['explorar', 'Explorar'], ['reloj', 'Recientes'], ['semana', 'Tu semana'], ['barras', 'Estadísticas']])}</Ilu>,
  modos: () => (
    <Ilu clase="ayuda-mv-modos">
      {[['Entrenar', '#ff4d8d'], ['Concentrarte', '#7c5cff'], ['Cenar', '#4cd9c6']].map(([t, c]) => (
        <span key={t} style={{ '--c': c }}>{t}</span>
      ))}
      <span className="ayuda-mv-mas"><IconoC nombre="anadir" tamano={20} /></span>
    </Ilu>
  ),
  reproductor: () => <Ilu clase="ayuda-mv-iconos">{conIconos([['aleatorio', 'Aleatorio'], ['repetir', 'Repetir'], ['letra', 'Letra'], ['cola', 'Cola'], ['radio', 'Radio']])}</Ilu>,
  cancion: () => (
    <Ilu clase="ayuda-mv-menu">
      <span className="ayuda-mv-fila"><b>Canción</b><IconoC nombre="corazon" tamano={18} /></span>
      {[['moods', 'Añadir a un mood'], ['lista', 'Añadir a una lista'], ['artista', 'Ir al artista']].map(([i, t]) => (
        <span key={t} className="ayuda-mv-opcion"><IconoC nombre={i} tamano={18} />{t}</span>
      ))}
    </Ilu>
  ),
  sync: () => <Ilu clase="ayuda-mv-sync">{conIconos([['movil', 'PC y móvil por WiFi'], ['backup', 'Copia en un archivo']])}</Ilu>,
};

export default function AyudaEscritorio({ onVerOnboarding, onIrACargar, onIrAModos, onIrAExplorar, onIrAInicio, onIrAMovil, onIrABackup }) {
  const secciones = [
    {
      titulo: 'La barra lateral',
      icono: 'inicio',
      color: '#7c5cff',
      abierta: true,
      ilu: 'barra',
      contenido: [
        ['Inicio', 'tus moods, el modo del momento y accesos rápidos para empezar a sonar.'],
        ['Explorar y buscador', 'escribe arriba una canción, álbum o artista: salen resultados de tu biblioteca y de fuera, que puedes escuchar y añadir.'],
        ['Recientes', 'lo último que has escuchado y lo más sonado.'],
        ['Tu semana y Estadísticas', 'tu resumen de la semana o del año y tus cifras de escucha.'],
      ],
      enlaces: [['Ir a Inicio', onIrAInicio], ['Abrir Explorar', onIrAExplorar]],
    },
    {
      titulo: 'Traer tu música',
      icono: 'cargar',
      color: '#ff4d8d',
      contenido: [
        [null, 'Cargar tu biblioteca real es lo que más cambia la experiencia: sin ella la app arranca vacía.'],
        ['Cargar biblioteca', 'importa tus playlists desde Spotify, YouTube Music, Deezer u otros. Se hace una vez, o cada vez que quieras sumar una lista.'],
        ['Canciones sueltas', 'no hace falta reimportar para añadir un tema: búscalo, escúchalo y añádelo a tu biblioteca.'],
      ],
      enlaces: [['Cargar biblioteca', onIrACargar]],
    },
    {
      titulo: 'Qué es un mood',
      icono: 'moods',
      color: '#ff4d8d',
      ilu: 'modos',
      contenido: [
        [null, 'Un mood agrupa canciones de tu biblioteca. Hay estados (cómo te sientes o qué haces) y géneros (cómo suena); los eliges tú, no un algoritmo.'],
        ['Se organiza sola', 'cada canción se asigna a un mood por artista. Lo que no encaja queda en «Sin clasificar»: lo asignas una vez y la app aprende esa decisión.'],
        ['Infinito', 'si prefieres no elegir, el botón «Infinito» de Inicio mezcla toda tu biblioteca sin parar.'],
      ],
      enlaces: [['Administrar moods y listas', onIrAModos]],
    },
    {
      titulo: 'El reproductor',
      icono: 'play',
      color: '#4cd9c6',
      ilu: 'reproductor',
      contenido: [
        ['Barra inferior', 'play/pausa, anterior, siguiente, aleatorio, repetir y la ola de progreso: pulsa sobre ella para saltar a otro punto.'],
        ['Letra', 'el icono de letra la muestra sincronizada.'],
        ['Cola', 'mira lo que suena a continuación, reordénala arrastrando o quita canciones.'],
        ['Radio', 'sigue sonando música parecida cuando se acaba la cola.'],
        ['Temporizador y volumen', 'apaga la música pasado un rato y ajusta el volumen desde la misma barra.'],
      ],
    },
    {
      titulo: 'Acciones de una canción',
      icono: 'corazon',
      color: '#e8a838',
      ilu: 'cancion',
      contenido: [
        ['Corazón', 'la guarda en tus favoritas (si es de fuera de la biblioteca, también la añade).'],
        ['Menú de la fila', 'añádela o quítala de moods y listas, o salta a su artista o álbum.'],
      ],
    },
    {
      titulo: 'Sincronizar con el móvil y copia de seguridad',
      icono: 'movil',
      color: '#7c5cff',
      ilu: 'sync',
      contenido: [
        ['Sincronizar', 'en Configuración → Móvil, el ordenador y el móvil intercambian biblioteca y moods por WiFi, en la misma red.'],
        ['Copia de seguridad', 'en Configuración → Copia de seguridad guardas un archivo con tus datos y puedes restaurarlo más tarde.'],
      ],
      enlaces: [['Sincronizar con el móvil', onIrAMovil], ['Copia de seguridad', onIrABackup]],
    },
  ];
  return (
    <div className="ayuda-mv">
      {secciones.map((s) => (
        <details key={s.titulo} open={s.abierta} style={{ '--c': s.color }}>
          <summary>
            <span className="ayuda-mv-icono" aria-hidden="true"><IconoC nombre={s.icono} tamano={26} /></span>
            <span className="ayuda-mv-titulo">{s.titulo}</span>
          </summary>
          {s.ilu && ilustraciones[s.ilu]()}
          <ul>
            {s.contenido.map(([cabeza, texto]) => (
              <li key={`${cabeza}-${texto}`}>{cabeza && <b>{cabeza}: </b>}{texto}</li>
            ))}
          </ul>
          {s.enlaces && (
            <div className="ayuda-mv-enlaces">
              {s.enlaces.map(([texto, ir]) => (
                <button key={texto} type="button" onClick={ir}>{texto}<IconoC nombre="siguiente" tamano={16} /></button>
              ))}
            </div>
          )}
        </details>
      ))}
      <button type="button" className="ayuda-reboton" onClick={onVerOnboarding}>
        <IconoC nombre="ayuda" tamano={16} /> Volver a ver la bienvenida
      </button>
    </div>
  );
}
