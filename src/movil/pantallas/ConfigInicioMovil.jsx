// src/movil/pantallas/ConfigInicioMovil.jsx
// Ajustes > Inicio: cada sección en «Siempre», «A veces» (rotación diaria) o «Nunca», con el
// estado de hoy debajo para que se entienda por qué una sección sale o no.
import { useMemo, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { EXTERNAS, SECCIONES, esObligatoria, estadoSeccionHoy } from '../inicio/secciones.js';
import { modoValido } from '../inicio/mezclaModos.js';
import { conModo, guardarConfigInicio, leerConfigInicio, modoSeccion } from '../inicio/config.js';

const OPCIONES = [
  { id: 'siempre', texto: 'Siempre' },
  { id: 'aveces', texto: 'A veces' },
  { id: 'nunca', texto: 'Nunca' },
];

function FilaSeccion({ seccion, modo, estado, onModo }) {
  // Una fija no rota: «a veces» solo tiene sentido en las rotativas.
  const opciones = seccion.tipo === 'rotativa' ? OPCIONES : OPCIONES.filter((o) => o.id !== 'aveces');
  return (
    <div className="cfg-ini-fila">
      <b>{seccion.titulo}</b>
      <div className="m-segmentado cfg-ini-seg" role="group" aria-label={`${seccion.titulo}: cuándo sale`}>
        {opciones.map((o) => (
          <button key={o.id} aria-pressed={modo === o.id} className={modo === o.id ? 'on' : ''} onClick={() => onModo(o.id)}>
            {o.texto}
          </button>
        ))}
      </div>
      <small className={`cfg-ini-estado ${estado.estado}`} aria-live="polite">
        {estado.texto}
      </small>
    </div>
  );
}

export default function ConfigInicioMovil({ ctx, nav }) {
  const [config, setConfig] = useState(() => leerConfigInicio());
  const cambiar = (id, modo) => {
    const nueva = conModo(config, id, modo);
    guardarConfigInicio(nueva);
    setConfig(nueva);
  };
  // `ctx` es opcional: sin él no se puede saber qué secciones aún no tienen datos.
  const historial = ctx?.historial;
  const modosConCanciones = ctx?.ejes && ctx?.conteos ? ctx.ejes.filter((e) => modoValido(e, ctx.conteos)).length : undefined;
  const enLinea = typeof navigator === 'undefined' ? undefined : navigator.onLine;
  const datos = useMemo(() => ({ historial, modosConCanciones, enLinea }), [historial, modosConCanciones, enLinea]);
  const hoy = new Date();

  const fila = (s) => (
    <FilaSeccion
      key={s.id}
      seccion={s}
      modo={modoSeccion(config, s.id)}
      estado={estadoSeccionHoy(s.id, { config, fecha: hoy, datos })}
      onModo={(m) => cambiar(s.id, m)}
    />
  );
  const arriba = SECCIONES.filter((s) => esObligatoria(s.id));
  const libres = SECCIONES.filter((s) => !esObligatoria(s.id));
  const externas = libres.filter((s) => EXTERNAS.includes(s.id));
  const propias = libres.filter((s) => !EXTERNAS.includes(s.id));
  return (
    <SubpantallaMovil titulo="Inicio" nav={nav}>
      <p className="hoja-nota">Elige qué ves en Inicio. Las secciones en «A veces» van rotando cada día para que Inicio no sea siempre igual.</p>

      {arriba.length > 0 && (
        <>
          <div className="config-grupo">Siempre arriba</div>
          <div className="config-tarjeta">
            {arriba.map((s) => (
              <div key={s.id} className="cfg-ini-fila">
                <b>{s.titulo}</b>
                <small className="cfg-ini-estado hoy">Siempre en Inicio</small>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="config-grupo">¿Cómo te sientes?</div>
      <div className="config-tarjeta">
        <button type="button" className="cfg-ini-fila cfg-ini-enlace" onClick={() => nav.abrir({ tipo: 'config-estados' })}>
          <b>Editar estados de ánimo</b>
          <small className="cfg-ini-estado hoy">Elige cuáles salen, su orden, nombre, icono, color y palabras</small>
        </button>
      </div>

      <div className="config-grupo">Tus secciones</div>
      <div className="config-tarjeta">{propias.map(fila)}</div>

      <div className="config-grupo">Descubrir</div>
      <div className="config-tarjeta">{externas.map(fila)}</div>
    </SubpantallaMovil>
  );
}
