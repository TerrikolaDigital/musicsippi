// src/movil/EstadoVacio.jsx
// Estado vacío común de todas las pantallas: título corto, una frase y, si hay alternativa
// (buscar, añadir música, ver populares), un botón. Nunca una pantalla vacía sin salida.
export default function EstadoVacio({ titulo, children, accion }) {
  return (
    <div className="m-vacio">
      {titulo && <b>{titulo}</b>}
      {children}
      {accion && (
        <>
          <br />
          <button className="m-boton-grad" onClick={accion.onClick}>
            {accion.etiqueta}
          </button>
        </>
      )}
    </div>
  );
}
