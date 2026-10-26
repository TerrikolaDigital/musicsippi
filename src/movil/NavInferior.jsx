// src/movil/NavInferior.jsx
import { IconoM } from './iconos.jsx';

const ITEMS = [
  ['inicio', 'Inicio'],
  ['modos', 'Moods'],
  ['buscar', 'Buscar'],
  ['biblioteca', 'Biblioteca'],
];

export default function NavInferior({ pestana, onCambiar }) {
  return (
    <nav className="nav-inferior" aria-label="Secciones">
      {ITEMS.map(([id, texto]) => (
        <button
          key={id}
          className={pestana === id ? 'on' : ''}
          aria-current={pestana === id ? 'page' : undefined}
          onClick={() => onCambiar(id)}
        >
          <IconoM nombre={id} />
          <span>{texto}</span>
        </button>
      ))}
    </nav>
  );
}
