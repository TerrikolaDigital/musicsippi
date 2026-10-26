// src/movil/inicio/cargador.jsx
// Carga de las secciones de Inicio desde src/movil/inicio/Seccion*.jsx. Con import.meta.glob el
// build no falla si falta un archivo, y un límite de error evita que una sección rota
// se lleve por delante el resto de Inicio.
import { Component, Suspense, lazy } from 'react';

const modulos = import.meta.glob('./Seccion*.jsx');
const perezosas = new Map();

function componenteDe(archivo) {
  if (!archivo) return null;
  if (perezosas.has(archivo)) return perezosas.get(archivo);
  const carga = modulos[`./${archivo}.jsx`];
  const C = carga ? lazy(carga) : null;
  perezosas.set(archivo, C);
  return C;
}

class LimiteError extends Component {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.warn(`Inicio: la sección «${this.props.id}» falló y se omite`, error);
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}

/** Una sección de Inicio por su registro: nada si el archivo no existe o falla. */
export function SeccionCargada({ seccion, ctx, nav }) {
  const C = componenteDe(seccion.archivo);
  if (!C) return null;
  return (
    <LimiteError id={seccion.id}>
      <Suspense fallback={null}>
        <C ctx={ctx} nav={nav} />
      </Suspense>
    </LimiteError>
  );
}
