// src/movil/pantallas/EditarEstadosMovil.jsx
// Editar «¿Cómo te sientes?»: qué estados salen (hasta 10), en qué orden, y crear, cambiar o borrar los propios.
// Cada cambio se guarda al momento por ctx.guardarEjes (mismo camino y journal hacia el PC que el resto de moods).
// Se abre desde el carrusel de Inicio, Ajustes › Inicio y el ⋯ de un mood-estado (`ejeId` abre ese estado).
import { useEffect, useRef, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import Interruptor from './Interruptor.jsx';
import { IconoM } from '../iconos.jsx';
import { CATALOGO_ICONOS } from '../inicio/IconosAnimo.jsx';
import {
  MAX_ANIMOS,
  MAX_PALABRAS,
  conVisible,
  ejesConEstados,
  estadosAnimo,
  idLibre,
  moverVisible,
  palabrasATexto,
  parsearPalabras,
  sinEstadoPropio,
} from '../inicio/estadosAnimo.js';
import '../estadosAnimo.css';

export const COLORES_ESTADO = ['#4cd9c6', '#5fd0ff', '#7c8cff', '#b07cff', '#ff4d8d', '#ff5d8f', '#ff8a3d', '#ffb454', '#ffc857', '#9be564', '#5fd8a4', '#ff6b6b'];
const ICONOS = Object.fromEntries(CATALOGO_ICONOS.map((i) => [i.id, i.Icono]));
const MAX_NOMBRE = 24;

const ordenada = (ejes) => {
  const todos = estadosAnimo(ejes);
  return [...todos.filter((e) => e.visible), ...todos.filter((e) => !e.visible)];
};

function detalle(e, conteos) {
  const n = e.eje ? (conteos?.get?.(e.eje.id) ?? 0) : null;
  const partes = [e.propio ? 'Tuyo' : e.sugerido && !e.eje ? 'Sugerencia' : null, n ? `${n} ${n === 1 ? 'canción' : 'canciones'}` : null];
  return partes.filter(Boolean).join(' · ');
}

function Flecha({ abajo }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={abajo ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'} />
    </svg>
  );
}

function Ficha({ estado, grande }) {
  const Icono = ICONOS[estado.icono];
  return (
    <span className={`est-ficha${grande ? ' grande' : ''}`} style={{ '--c': estado.color }} aria-hidden="true">
      {Icono ? <Icono /> : estado.emoji}
    </span>
  );
}

function Formulario({ inicial, nuevo, ctx, ocupado, puedeBorrar, onGuardar, onBorrar, onCancelar }) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [icono, setIcono] = useState(inicial.icono);
  const [color, setColor] = useState(inicial.color);
  const [texto, setTexto] = useState(palabrasATexto(inicial.palabrasUsuario));
  const [confirmando, setConfirmando] = useState(false);
  const limpio = nombre.trim();
  const palabras = parsearPalabras(texto);
  const IconoVista = ICONOS[icono];

  if (confirmando) {
    const n = inicial.ejeId ? (ctx.conteos?.get?.(inicial.ejeId) ?? 0) : 0;
    return (
      <div className="est-confirmar" role="alertdialog" aria-label={`Borrar ${inicial.nombre}`}>
        <p>
          ¿Borrar el estado «{inicial.nombre}»? {n > 0 ? `Las ${n} canciones que tiene siguen en tu biblioteca.` : 'No toca ninguna canción.'}
        </p>
        <button type="button" className="est-boton peligro" disabled={ocupado} onClick={onBorrar}>
          Sí, borrar
        </button>
        <button type="button" className="est-boton" onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <form
      className="est-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (limpio) onGuardar({ ...inicial, nombre: limpio, icono, color, palabrasUsuario: palabras });
      }}
    >
      <div className="est-vista" aria-hidden="true">
        <span className="animo-chip" style={{ '--c': color }}>
          <span className="animo-emoji">{IconoVista && <IconoVista />}</span>
          <b>{limpio || 'Nombre'}</b>
        </span>
      </div>

      <label className="est-campo">
        <span>Nombre</span>
        {inicial.frase && <small>{inicial.frase}</small>}
        <input className="m-input" value={nombre} maxLength={MAX_NOMBRE} autoFocus={nuevo} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo, Road trip" />
      </label>

      <div className="est-campo" role="radiogroup" aria-label="Icono">
        <span>Icono</span>
        <div className="est-iconos">
          {CATALOGO_ICONOS.map((i) => (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={icono === i.id}
              aria-label={i.nombre}
              title={i.nombre}
              className={icono === i.id ? 'on' : ''}
              style={{ '--c': color }}
              onClick={() => setIcono(i.id)}
            >
              <i.Icono />
            </button>
          ))}
        </div>
      </div>

      <div className="est-campo" role="radiogroup" aria-label="Color">
        <span>Color</span>
        <div className="est-colores">
          {COLORES_ESTADO.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
          <label className="est-color-libre">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#7c8cff'} aria-label="Elegir otro color" onChange={(e) => setColor(e.target.value)} />
            <span aria-hidden="true">Otro</span>
          </label>
        </div>
      </div>

      <label className="est-campo">
        <span>Palabras para afinar</span>
        <textarea className="m-input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="baladas, romántico, bachata" />
        <small>
          Separadas por comas (hasta {MAX_PALABRAS}). El organizador las busca en el género, el título, el artista y el álbum para añadir canciones a este estado.
        </small>
      </label>

      <button type="submit" className="m-boton-grad" disabled={!limpio || ocupado}>
        {nuevo ? 'Crear estado' : 'Guardar cambios'}
      </button>
      <button type="button" className="est-boton" onClick={onCancelar}>
        Cancelar
      </button>
      {puedeBorrar && (
        <button type="button" className="est-boton peligro" onClick={() => setConfirmando(true)}>
          Borrar este estado
        </button>
      )}
    </form>
  );
}

export default function EditarEstadosMovil({ ctx, nav, ejeId = null }) {
  const lista = ordenada(ctx.ejes);
  // null = lista; { id } = editando uno; { nuevo: true } = creando.
  const [vista, setVista] = useState(() => {
    const dirigido = ejeId ? lista.find((e) => e.ejeId === ejeId) : null;
    return dirigido ? { id: dirigido.id } : null;
  });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Abrir una ficha es una capa de navegación: «atrás» de Android vuelve a la lista en vez de salir.
  const conCapa = useRef(false);
  const enCapa = nav.capas.some((c) => c.tipo === 'editar-estado');
  const abrirVista = (v) => {
    conCapa.current = true;
    nav.abrirCapa({ tipo: 'editar-estado' });
    setVista(v);
  };
  const cerrarVista = () => (conCapa.current ? nav.atras() : setVista(null));
  useEffect(() => {
    if (!enCapa && conCapa.current) {
      conCapa.current = false;
      setVista(null);
    }
  }, [enCapa]);
  const visibles = lista.filter((e) => e.visible).length;

  const guardar = async (nuevaLista, extra) => {
    setOcupado(true);
    try {
      const ok = await ctx.guardarEjes(extra ?? ejesConEstados(ctx.ejes, nuevaLista));
      return ok !== false;
    } catch (error) {
      setAviso(`No se pudo guardar: ${error?.message ?? error}`);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const alternar = async (e, visible) => {
    const nueva = conVisible(lista, e.id, visible);
    if (!nueva) {
      setAviso(`Ya hay ${MAX_ANIMOS} en Inicio. Quita uno para poner ${e.nombre}.`);
      return;
    }
    setAviso(null);
    await guardar(nueva);
  };

  const mover = async (e, delta) => {
    setAviso(null);
    const nueva = moverVisible(lista, e.id, delta);
    if (nueva !== lista) await guardar(nueva);
  };

  const guardarFicha = async (cambiado) => {
    setAviso(null);
    const existe = lista.some((e) => e.id === cambiado.id);
    let nueva;
    if (existe) nueva = lista.map((e) => (e.id === cambiado.id ? { ...e, ...cambiado } : e));
    else {
      const base = [...lista, { ...cambiado, visible: false }];
      nueva = visibles < MAX_ANIMOS ? conVisible(base, cambiado.id, true) : base;
    }
    if (await guardar(nueva)) {
      if (!existe && visibles >= MAX_ANIMOS) setAviso(`«${cambiado.nombre}» está creado, pero ya hay ${MAX_ANIMOS} en Inicio: actívalo cuando quites otro.`);
      cerrarVista();
    }
  };

  const borrar = async (e) => {
    if (await guardar(null, sinEstadoPropio(ctx.ejes, e.ejeId))) cerrarVista();
  };

  if (vista) {
    const editado = vista.nuevo ? null : lista.find((e) => e.id === vista.id);
    const inicial = editado ?? {
      id: idLibre('nuevo', ctx.ejes),
      ejeId: null,
      propio: true,
      sugerido: false,
      nombre: '',
      color: COLORES_ESTADO[0],
      icono: 'corazon',
      emoji: '🎵',
      palabrasUsuario: [],
      palabras: [],
      visible: true,
    };
    return (
      <SubpantallaMovil titulo={vista.nuevo ? 'Estado nuevo' : editado?.nombre || 'Estado'} nav={nav}>
        {aviso && <p className="m-aviso" role="alert">{aviso}</p>}
        <Formulario
          key={vista.nuevo ? 'nuevo' : vista.id}
          inicial={inicial}
          nuevo={!!vista.nuevo}
          ctx={ctx}
          ocupado={ocupado}
          puedeBorrar={!!editado?.propio}
          onGuardar={(c) => guardarFicha(vista.nuevo ? { ...c, id: idLibre(c.nombre, ctx.ejes) } : c)}
          onBorrar={() => borrar(editado)}
          onCancelar={cerrarVista}
        />
      </SubpantallaMovil>
    );
  }

  return (
    <SubpantallaMovil titulo="Tus estados" nav={nav}>
      <p className="hoja-nota">
        Elige los estados que salen en Inicio (hasta {MAX_ANIMOS}), ordénalos con las flechas y cambia su nombre, icono, color y palabras. Ahora salen {visibles} de {MAX_ANIMOS}.
      </p>
      {aviso && (
        <p className="m-aviso" role="status">
          {aviso}
        </p>
      )}
      <ul className="est-lista">
        {lista.map((e, i) => {
          const pos = e.visible ? lista.slice(0, i).filter((x) => x.visible).length : -1;
          return (
            <li key={e.id} className={e.visible ? '' : 'oculto'}>
              <button type="button" className="est-fila-editar" aria-label={`Editar ${e.nombre}${e.frase ? `, ${e.frase}` : ''}`} onClick={() => abrirVista({ id: e.id })}>
                <Ficha estado={e} />
                <span className="est-nombre">
                  <b>{e.nombre}</b>
                  {e.frase && <small>{e.frase}</small>}
                  {detalle(e, ctx.conteos) && <small>{detalle(e, ctx.conteos)}</small>}
                </span>
              </button>
              {e.visible && (
                <span className="est-orden">
                  <button type="button" aria-label={`Subir ${e.nombre}`} disabled={ocupado || pos === 0} onClick={() => mover(e, -1)}>
                    <Flecha />
                  </button>
                  <button type="button" aria-label={`Bajar ${e.nombre}`} disabled={ocupado || pos === visibles - 1} onClick={() => mover(e, 1)}>
                    <Flecha abajo />
                  </button>
                </span>
              )}
              <Interruptor activo={e.visible} desactivado={ocupado} etiqueta={`Mostrar ${e.nombre} en Inicio`} onCambio={(v) => alternar(e, v)} />
            </li>
          );
        })}
      </ul>
      <button type="button" className="m-boton-grad est-crear" onClick={() => abrirVista({ nuevo: true })}>
        <IconoM nombre="lapiz" /> Crear un estado
      </button>
    </SubpantallaMovil>
  );
}
