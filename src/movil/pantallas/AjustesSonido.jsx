// src/movil/pantallas/AjustesSonido.jsx
// Grupo «Sonido» de Configuración (solo Android, donde vive el reproductor nativo): fundido entre
// canciones y, más abajo, ecualizador y sonido envolvente.
import { useEffect, useRef, useState } from 'react';
import {
  FUNDIDO_MAX_S,
  guardarFundido,
  guardarSinFundidoAlbumes,
  leerFundido,
  leerSinFundidoAlbumes,
} from '../../data/fundido.js';
import { ajustarEnvolvente, fuerzaAPorcentaje, leerEfectos, porcentajeAFuerza } from '../../data/efectos-audio.js';
import { IconoM } from '../iconos.jsx';
import Interruptor from './Interruptor.jsx';
import '../ecualizador.css';

export default function AjustesSonido({ nav }) {
  const [segundos, setSegundos] = useState(() => leerFundido());
  const [sinAlbumes, setSinAlbumes] = useState(() => leerSinFundidoAlbumes());
  const [env, setEnv] = useState(null); // estado del sonido envolvente; null mientras carga
  const pedido = useRef(0);

  useEffect(() => {
    let vivo = true;
    leerEfectos().then((e) => vivo && setEnv(e));
    return () => {
      vivo = false;
    };
  }, []);

  // Los deslizadores siguen al dedo: la respuesta nativa solo se adopta si es la última.
  const cambiarEnvolvente = (cambios, local) => {
    const n = ++pedido.current;
    setEnv((e) => ({ ...e, ...local }));
    ajustarEnvolvente(cambios)
      .then((nuevo) => n === pedido.current && setEnv(nuevo))
      .catch(() => {});
  };

  return (
    <>
      <div className="config-grupo">Sonido</div>
      <div className="config-tarjeta">
        <div className="ec-fila-ajuste">
          <div className="ec-fila-slider">
            <b>Fundido entre canciones</b>
            <em>{segundos === 0 ? 'Apagado' : `${segundos} s`}</em>
          </div>
          <input
            type="range"
            className="ec-horizontal"
            min={0}
            max={FUNDIDO_MAX_S}
            step={1}
            value={segundos}
            aria-label="Fundido entre canciones, en segundos"
            onChange={(ev) => {
              const v = Number(ev.target.value);
              setSegundos(v);
              guardarFundido(v);
            }}
          />
          <small className="ec-ayuda">
            Una canción baja de volumen al acabar y la siguiente sube al empezar, a partes iguales. No se
            aplica al saltar de canción a mano.
          </small>
        </div>
        <div className="ec-fila-ajuste ec-fila-interruptor">
          <div>
            <b>Sin fundido en álbumes</b>
            <small className="ec-ayuda">
              Las canciones seguidas de un mismo álbum, en orden, suenan sin fundido (álbumes en directo).
            </small>
          </div>
          <Interruptor
            activo={sinAlbumes}
            etiqueta="Sin fundido en álbumes"
            onCambio={(v) => {
              setSinAlbumes(v);
              guardarSinFundidoAlbumes(v);
            }}
          />
        </div>
        <div className="ec-fila-ajuste ec-fila-interruptor">
          <div>
            <b>Sonido envolvente</b>
            <small className="ec-ayuda">
              {env && !env.envolventeSoportado
                ? 'Este dispositivo no admite sonido envolvente.'
                : 'Mejor con auriculares. Es un efecto de la app que ensancha el sonido. En Android 13 o superior el sistema tiene además su propio audio espacial (Ajustes del sistema > Sonido), que depende de los auriculares y no se puede activar desde aquí.'}
              {env?.espacialSistemaDisponible && (env.espacialSistemaActivo ? ' Ahora está activado en el sistema.' : ' Está disponible en tu móvil, pero ahora está apagado.')}
            </small>
          </div>
          <Interruptor
            activo={!!env?.envolventeActivo}
            desactivado={!env?.envolventeSoportado}
            etiqueta="Sonido envolvente"
            onCambio={(activo) => cambiarEnvolvente({ activo }, { envolventeActivo: activo })}
          />
        </div>
        {env?.envolventeSoportado && env.envolventeActivo && (
          <div className="ec-fila-ajuste">
            <div className="ec-fila-slider">
              <b>Intensidad</b>
              <em>{fuerzaAPorcentaje(env.envolventeFuerza)} %</em>
            </div>
            <input
              type="range"
              className="ec-horizontal"
              min={0}
              max={100}
              step={5}
              value={fuerzaAPorcentaje(env.envolventeFuerza)}
              aria-label="Intensidad del sonido envolvente"
              onChange={(ev) => {
                const fuerza = porcentajeAFuerza(ev.target.value);
                cambiarEnvolvente({ fuerza }, { envolventeFuerza: fuerza });
              }}
            />
          </div>
        )}
        <button className="config-fila" onClick={() => nav.abrir({ tipo: 'config-ecualizador' })}>
          <span className="config-ic" style={{ background: '#7c5cff33' }}>
            <IconoM nombre="ajustes" />
          </span>
          <span className="config-tx">
            <b>Ecualizador</b>
            <small>Preajustes, bandas y refuerzo de graves</small>
          </span>
          <em>›</em>
        </button>
      </div>
    </>
  );
}
