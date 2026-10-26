// src/movil/navegacion.js
// Navegación de la interfaz móvil, sin React: una pila de pantallas por
// pestaña (cada pestaña recuerda dónde estabas) y una pila de capas encima
// (reproductor completo, hojas). «Atrás» cierra siempre lo más alto.
export const PESTANAS = ['inicio', 'modos', 'buscar', 'biblioteca'];

export function estadoInicial() {
  return { pestana: 'inicio', pilas: { inicio: [], modos: [], buscar: [], biblioteca: [] }, capas: [] };
}

export function pantallaActual(e) {
  const pila = e.pilas[e.pestana];
  return pila.length ? pila[pila.length - 1] : { tipo: 'raiz', pestana: e.pestana };
}

// Identifica la pantalla que se ve (pestaña, hondura y a qué modo/artista/álbum
// apunta); las capas (reproductor, hojas) no la cambian. Si cambia, la página
// debe empezar arriba.
export function clavePantalla(e) {
  const p = pantallaActual(e);
  const que = p.ejeId ?? p.nombre ?? (p.titulo ? `${p.artista ?? ''}||${p.titulo}` : '');
  return `${e.pestana}|${e.pilas[e.pestana].length}|${p.tipo}|${que}`;
}

export function profundidad(e) {
  return e.pilas[e.pestana].length + e.capas.length;
}

// Entradas de historial que sobran al abrir una pantalla desde las capas: la
// pantalla nueva reutiliza una; las demás hay que retroceder para que no quede
// un «atrás» sin efecto (p. ej. reproductor + hoja ⋯ → «Ir al artista»).
export function entradasSobrantes(e) {
  return Math.max(0, e.capas.length - 1);
}

// Invariante: cada pantalla apilada de la pestaña visible, cada capa y la «pestaña distinta de
// Inicio» tienen una entrada de historial del navegador. Cambio de entradas al aplicar una
// acción de pestaña: positivo = añadir (salir de Inicio, o volver a una pestaña que recordaba
// pantallas abiertas), negativo = retroceder las de lo que se deja de ver (si no, «atrás»
// consumiría entradas muertas y habría que pulsarlo de más). Las pilas de las otras pestañas se
// conservan pero no cuentan: sus entradas se vuelven a añadir al regresar a ellas.
export function deltaHistorial(e, accion) {
  if (accion.tipo !== 'pestana') return 0;
  const perdidas = e.capas.length + e.pilas[e.pestana].length;
  if (accion.pestana === e.pestana) return -perdidas;
  const marca = (p) => (p === 'inicio' ? 0 : 1);
  return marca(accion.pestana) + e.pilas[accion.pestana].length - marca(e.pestana) - perdidas;
}

export function navegar(e, accion) {
  switch (accion.tipo) {
    case 'pestana': {
      if (accion.pestana === e.pestana) {
        if (e.pilas[e.pestana].length === 0 && e.capas.length === 0) return e;
        return { ...e, pilas: { ...e.pilas, [e.pestana]: [] }, capas: [] };
      }
      // Al salir de una pestaña se conserva su pila: al volver, sigue en la misma pantalla. Las
      // capas (reproductor, hojas) sí se cierran. Tocar la pestaña activa (arriba) vuelve a la raíz.
      return { ...e, pestana: accion.pestana, capas: [] };
    }
    case 'abrir':
      return { ...e, capas: [], pilas: { ...e.pilas, [e.pestana]: [...e.pilas[e.pestana], accion.pantalla] } };
    case 'capa': {
      // Una sola capa de cada tipo: cambiar de vista del reproductor no apila.
      // Si ya existe, se reemplaza en su sitio (el orden de las capas no cambia).
      if (e.capas.some((c) => c.tipo === accion.capa.tipo)) {
        return { ...e, capas: e.capas.map((c) => (c.tipo === accion.capa.tipo ? accion.capa : c)) };
      }
      return { ...e, capas: [...e.capas, accion.capa] };
    }
    case 'sustituir': {
      // La capa más alta se cambia por otra (p. ej. la hoja ⋯ → reproductor con
      // la letra) reutilizando su entrada del historial.
      const debajo = e.capas.slice(0, -1).filter((c) => c.tipo !== accion.capa.tipo);
      return { ...e, capas: [...debajo, accion.capa] };
    }
    case 'quitar-capa':
      return { ...e, capas: e.capas.filter((c) => c.tipo !== accion.capaTipo) };
    case 'atras': {
      // La bienvenida es un recorrido: «atrás» retrocede una pantalla y solo
      // la cierra desde la primera (cada «Siguiente» añadió una entrada).
      const alta = e.capas[e.capas.length - 1];
      if (alta?.tipo === 'bienvenida' && alta.paso > 1) {
        return { ...e, capas: [...e.capas.slice(0, -1), { ...alta, paso: alta.paso - 1 }] };
      }
      if (e.capas.length) return { ...e, capas: e.capas.slice(0, -1) };
      const pila = e.pilas[e.pestana];
      if (pila.length) return { ...e, pilas: { ...e.pilas, [e.pestana]: pila.slice(0, -1) } };
      if (e.pestana !== 'inicio') return { ...e, pestana: 'inicio' };
      return e;
    }
    default:
      return e;
  }
}
