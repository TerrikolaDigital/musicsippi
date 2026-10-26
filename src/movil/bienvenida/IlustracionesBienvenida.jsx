// src/movil/bienvenida/IlustracionesBienvenida.jsx
// Una ilustración animada por pantalla de la bienvenida, solo con CSS/SVG.
// Todas son decorativas (aria-hidden). Las animaciones viven en movil.css y solo
// corren en la pantalla activa; con prefers-reduced-motion quedan quietas.
import Corriente from '../Corriente.jsx';
import { IconoM } from '../iconos.jsx';

const LOGO = '/musicsippi-app-icon-256.png';

export function Portada() {
  return (
    <div className="bi bi-portada" aria-hidden="true">
      <span className="bi-aro" style={{ '--i': 0 }} />
      <span className="bi-aro" style={{ '--i': 1 }} />
      <span className="bi-aro" style={{ '--i': 2 }} />
      <img className="bi-logo" src={LOGO} alt="" width="112" height="112" />
      <Corriente className="bi-ondas" />
    </div>
  );
}

const MODOS = [
  ['Chillout', '#7c5cff', '-70px', '-90px', '-14deg'],
  ['Rock en español', '#ff4d8d', '90px', '-70px', '12deg'],
  ['Zen', '#4cd9c6', '-90px', '60px', '10deg'],
  ['Pop bailable', '#ff8a3d', '80px', '80px', '-12deg'],
  ['Latino', '#c64ff0', '-40px', '110px', '8deg'],
  ['Power', '#ff6b6b', '60px', '-110px', '-8deg'],
];

export function Modos() {
  return (
    <div className="bi bi-modos" aria-hidden="true">
      {MODOS.map(([nombre, c, x, y, r], i) => (
        <span key={nombre} className="bi-modo" style={{ '--c': c, '--x': x, '--y': y, '--r': r, '--i': i }}>
          <i />
          {nombre}
        </span>
      ))}
    </div>
  );
}

const FUENTES = [
  ['Spotify', '#1ed760'],
  ['YouTube Music', '#ff5a4f'],
  ['Deezer', '#a238ff'],
  ['Apple Music', '#ff4d6d'],
  ['Archivos mp3', '#4cd9c6'],
];

export function Traer() {
  return (
    <div className="bi bi-traer" aria-hidden="true">
      <ul className="bi-fuentes">
        {FUENTES.map(([nombre, c], i) => (
          <li key={nombre} style={{ '--c': c, '--i': i }}>
            <i />
            {nombre}
          </li>
        ))}
      </ul>
      <svg className="bi-rio" viewBox="0 0 300 84" preserveAspectRatio="none" focusable="false">
        {[24, 87, 150, 213, 276].map((x, i) => (
          <path key={x} className="bi-hilo" style={{ '--i': i }} d={`M${x} 0 C${x} 40 150 36 150 84`} pathLength="100" />
        ))}
      </svg>
      <div className="bi-destino">
        <img src={LOGO} alt="" width="40" height="40" />
        <span>
          Music<em>sippi</em>
        </span>
      </div>
    </div>
  );
}

export function Sinfin() {
  return (
    <div className="bi bi-sinfin" aria-hidden="true">
      <svg viewBox="0 0 240 96" focusable="false">
        <defs>
          <linearGradient id="bi-grad-inf" x1="0" x2="1">
            <stop offset="0" stopColor="#ff4d8d" />
            <stop offset="0.55" stopColor="#c64ff0" />
            <stop offset="1" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        <path className="bi-inf-base" pathLength="100" d="M120 48C100 20 74 12 52 12a36 36 0 1 0 0 72c22 0 48-8 68-36Zm0 0c20 28 46 36 68 36a36 36 0 1 0 0-72c-22 0-48 8-68 36Z" />
        <path className="bi-inf-luz" pathLength="100" d="M120 48C100 20 74 12 52 12a36 36 0 1 0 0 72c22 0 48-8 68-36Zm0 0c20 28 46 36 68 36a36 36 0 1 0 0-72c-22 0-48 8-68 36Z" />
      </svg>
      <p className="bi-letra">
        <span style={{ '--i': 0 }}>Y sigue sonando</span>
        <span style={{ '--i': 1 }}>una canción tras otra</span>
        <span style={{ '--i': 2 }}>sin que toques nada</span>
      </p>
    </div>
  );
}

export function Contigo() {
  return (
    <div className="bi bi-contigo" aria-hidden="true">
      <div className="bi-movil">
        <b>9:41</b>
        <div className="bi-bloqueo">
          <span className="bi-caratula" />
          <span className="bi-lineas">
            <i />
            <i />
          </span>
          <span className="bi-me-gusta">
            <IconoM nombre="corazon" tamano={18} />
          </span>
        </div>
      </div>
      <div className="bi-datos">
        <div className="bi-dato">
          <strong>7 días</strong>
          <span className="bi-racha">
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ '--i': i }} />
            ))}
          </span>
        </div>
        <div className="bi-dato bi-pc">
          <span className="bi-giro">
            <IconoM nombre="sincronizar" tamano={22} />
          </span>
          <strong>Sincronizado con tu PC</strong>
        </div>
      </div>
    </div>
  );
}

export function Empieza() {
  return (
    <div className="bi bi-empieza" aria-hidden="true">
      <img className="bi-logo" src={LOGO} alt="" width="72" height="72" />
      <Corriente className="bi-ondas" />
    </div>
  );
}
