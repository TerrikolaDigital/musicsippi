// src/movil/pantallas/SubpantallaMovil.jsx
// Marco común de toda subpantalla: ← arriba a la izquierda (48 px), título centrado y, a la
// derecha, una acción opcional (`derecha`) o un hueco de 48 px que mantiene el título centrado.
import { IconoM } from '../iconos.jsx';

export default function SubpantallaMovil({ titulo, nav, derecha, children }) {
  return (
    <div className="m-subpantalla">
      <div className="m-cabecera">
        <button className="m-redondo" aria-label="Volver" onClick={nav.atras}>
          <IconoM nombre="atras" />
        </button>
        <h1 className="m-titulo">{titulo}</h1>
        {derecha ?? <span className="m-cabecera-hueco" aria-hidden="true" />}
      </div>
      {children}
    </div>
  );
}
