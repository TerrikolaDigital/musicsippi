// src/movil/pantallas/EcualizadorMovil.jsx
// Ecualizador del reproductor nativo: interruptor, preajustes del dispositivo, bandas con
// deslizadores verticales y refuerzo de graves. Si el móvil no lo soporta, lo dice.
import { useEffect, useRef, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { esAndroid } from '../../data/nativo-movil.js';
import {
  ajustarEcualizador,
  etiquetaDb,
  etiquetaFrecuencia,
  fuerzaAPorcentaje,
  leerEfectos,
  opcionesPreset,
  porcentajeAFuerza,
} from '../../data/efectos-audio.js';
import Interruptor from './Interruptor.jsx';
import '../ecualizador.css';

export default function EcualizadorMovil({ nav }) {
  const [estado, setEstado] = useState(null); // null = cargando; false = sin datos
  const ultimo = useRef(0); // la respuesta más reciente es la que vale

  useEffect(() => {
    let vivo = true;
    leerEfectos().then((e) => vivo && setEstado(e ?? false));
    return () => {
      vivo = false;
    };
  }, []);

  const enviar = (cambios, local) => {
    const n = ++ultimo.current;
    if (local) setEstado((e) => ({ ...e, ...local(e) }));
    ajustarEcualizador(cambios)
      .then((nuevo) => {
        // Los deslizadores siguen al dedo: solo se adopta la respuesta si es la última y no era un arrastre.
        if (n === ultimo.current && !('banda' in cambios) && !('graves' in cambios)) setEstado(nuevo);
      })
      .catch(() => {});
  };

  let cuerpo;
  if (!esAndroid()) {
    cuerpo = <p className="ec-aviso">El ecualizador solo está disponible en la app de Android.</p>;
  } else if (estado === null) {
    cuerpo = <p className="ec-aviso">Cargando…</p>;
  } else if (!estado || !estado.ecualizadorSoportado) {
    cuerpo = <p className="ec-aviso">Este dispositivo no admite ecualizador. La música suena sin ajustes.</p>;
  } else {
    const opciones = opcionesPreset(estado.presets);
    cuerpo = (
      <>
        <div className="ec-bloque ec-cabecera">
          <div>
            <b>Ecualizador</b>
            <small>{estado.activo ? 'Activado' : 'Apagado'}</small>
          </div>
          <Interruptor
            activo={estado.activo}
            etiqueta="Ecualizador"
            onCambio={(activo) => enviar({ activo }, () => ({ activo }))}
          />
        </div>

        <div className={`ec-cuerpo${estado.activo ? '' : ' apagado'}`}>
          <div className="ec-presets" role="radiogroup" aria-label="Preajustes">
            {opciones.map((o) => (
              <button
                key={o.indice}
                type="button"
                role="radio"
                aria-checked={estado.preset === o.indice}
                className={`ec-preset${estado.preset === o.indice ? ' activo' : ''}`}
                // «Personalizado» es el estado que queda al mover una banda: tocarlo no cambia nada.
                onClick={() => o.indice !== -1 && enviar({ preset: o.indice, activo: true }, () => ({ preset: o.indice, activo: true }))}
              >
                {o.nombre}
              </button>
            ))}
          </div>

          <div className="ec-bandas">
            {estado.bandas.map((b, i) => (
              <label key={b.centroHz} className="ec-banda">
                <span className="ec-db">{etiquetaDb(b.nivelMb)}</span>
                <input
                  type="range"
                  className="ec-vertical"
                  min={b.minMb}
                  max={b.maxMb}
                  step={50}
                  value={b.nivelMb}
                  aria-label={`${etiquetaFrecuencia(b.centroHz)}, ${etiquetaDb(b.nivelMb)}`}
                  onChange={(ev) => {
                    const nivelMb = Number(ev.target.value);
                    enviar({ banda: i, nivelMb, activo: true }, (e) => ({
                      activo: true,
                      preset: -1,
                      bandas: e.bandas.map((x, j) => (j === i ? { ...x, nivelMb } : x)),
                    }));
                  }}
                />
                <span className="ec-hz">{etiquetaFrecuencia(b.centroHz)}</span>
              </label>
            ))}
          </div>

          <div className="ec-bloque">
            <div className="ec-fila-slider">
              <b>Refuerzo de graves</b>
              <em>{estado.gravesSoportado ? `${fuerzaAPorcentaje(estado.graves)} %` : 'No disponible'}</em>
            </div>
            <input
              type="range"
              className="ec-horizontal"
              min={0}
              max={100}
              step={5}
              disabled={!estado.gravesSoportado}
              value={fuerzaAPorcentaje(estado.graves)}
              aria-label="Refuerzo de graves"
              onChange={(ev) => {
                const graves = porcentajeAFuerza(ev.target.value);
                enviar({ graves, activo: true }, () => ({ graves, activo: true }));
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <SubpantallaMovil titulo="Ecualizador" nav={nav}>
      <div className="ec-pantalla">{cuerpo}</div>
    </SubpantallaMovil>
  );
}
