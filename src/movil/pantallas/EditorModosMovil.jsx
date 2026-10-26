// src/movil/pantallas/EditorModosMovil.jsx
// Administrar modos y listas (todos, con selector de orden) o «Editar modo»
// de uno concreto (`ejeId`). Reutiliza el EditorEjes de escritorio.
import { useCallback, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { ORDENES_EDITOR, ordenarModos } from '../modos.js';
import { formatearTitulo } from '../../ui/formato.js';

export default function EditorModosMovil({ ctx, nav, ejeId }) {
  const { EditorEjes } = ctx.componentes;
  const [orden, setOrden] = useState('alfabetico');
  const ordenar = useCallback((lista) => ordenarModos(lista, orden, ctx.conteos), [orden, ctx.conteos]);
  const eje = ejeId ? ctx.ejes.find((e) => e.id === ejeId) : null;
  return (
    <SubpantallaMovil titulo={eje ? `Editar ${formatearTitulo(eje.nombre)}` : 'Moods'} nav={nav}>
      {!ejeId && (
        <div className="m-segmentado" role="group" aria-label="Ordenar moods">
          {ORDENES_EDITOR.map(([id, etiqueta]) => (
            <button key={id} aria-pressed={orden === id} className={orden === id ? 'on' : ''} onClick={() => setOrden(id)}>
              {etiqueta}
            </button>
          ))}
        </div>
      )}
      <EditorEjes
        ejes={ctx.ejes}
        conteos={ctx.conteos}
        onGuardar={ctx.guardarEjes}
        onCrear={ctx.crearEje}
        onEntrar={(e) => nav.abrir({ tipo: 'modo', ejeId: e.id })}
        soloId={ejeId ?? null}
        ordenar={ordenar}
      />
    </SubpantallaMovil>
  );
}
