// src/movil/inicio/SeccionMezclaModos.jsx
// «Mezcla de dos moods»: una cola que empieza en un modo, pasa por canciones puente y acaba en otro.
import { useMemo, useState } from 'react';
import HojaInferior from '../HojaInferior.jsx';
import { IconoM } from '../iconos.jsx';
import { formatearTitulo } from '../../ui/formato.js';
import { colorTarjeta } from '../formato.js';
import { generarMezclaModos, modoValido, sugerirPareja } from './mezclaModos.js';
import { useVectores } from './useVectores.js';

const nombre = (e) => formatearTitulo(e.nombre);

export default function SeccionMezclaModos({ ctx }) {
  const vectores = useVectores(ctx);
  const sugerida = useMemo(
    () => sugerirPareja({ ejes: ctx.ejes, tracks: ctx.tracks, historial: ctx.historial, vectores, conteos: ctx.conteos }),
    [ctx.ejes, ctx.tracks, ctx.historial, vectores, ctx.conteos],
  );
  const [elegida, setElegida] = useState(null); // [idA, idB] si el usuario cambió la pareja
  const [abierta, setAbierta] = useState(false);
  const [borrador, setBorrador] = useState(['', '']);

  const validos = useMemo(() => ctx.ejes.filter((e) => modoValido(e, ctx.conteos)), [ctx.ejes, ctx.conteos]);
  const porId = (id) => validos.find((e) => e.id === id);
  const par = elegida && porId(elegida[0]) && porId(elegida[1]) ? [porId(elegida[0]), porId(elegida[1])] : sugerida;
  if (!par || validos.length < 2) return null;
  const [A, B] = par;
  const etiqueta = `${nombre(A)} × ${nombre(B)}`;

  const reproducir = () => {
    const lista = generarMezclaModos({ ejeA: A.id, ejeB: B.id, tracks: ctx.tracks, historial: ctx.historial, vectores, marcas: ctx.noMeGusta });
    if (lista.length === 0) return ctx.avisar?.('Esos dos moods aún no tienen canciones para mezclar');
    ctx.reproducirSecuencia(lista, etiqueta);
  };
  const abrir = () => {
    setBorrador([A.id, B.id]);
    setAbierta(true);
  };
  const distintos = borrador[0] && borrador[1] && borrador[0] !== borrador[1];

  return (
    <>
      <div className="m-seccion">
        <h2>Mezcla de dos moods</h2>
      </div>
      <section className="mezcla-modos" aria-label={`Mezcla ${etiqueta}`}>
        <button className="mezcla-modos-play" onClick={reproducir} aria-label={`Reproducir la mezcla ${etiqueta}`}>
          <span className="mezcla-modos-fondo" aria-hidden="true" style={{ '--a': colorTarjeta(A), '--b': colorTarjeta(B) }} />
          <span className="mezcla-modos-txt">
            <small>Mezcla</small>
            <b>
              {nombre(A)} <i>×</i> {nombre(B)}
            </b>
            <small>
              Empieza en {nombre(A)}, pasa por lo que une a los dos y acaba en {nombre(B)}
            </small>
          </span>
          <span className="mezcla-modos-boton" aria-hidden="true">
            <IconoM nombre="play" tamano={22} />
          </span>
        </button>
        <button className="mezcla-modos-otros" onClick={abrir}>
          Elegir otros
        </button>
      </section>
      {abierta && (
        <HojaInferior abierta onCerrar={() => setAbierta(false)} titulo="Elegir dos moods">
          <div className="hoja-sub-cab">
            <h2>Elegir dos moods</h2>
          </div>
          {['Empieza en', 'Acaba en'].map((texto, i) => (
            <label key={texto} className="mezcla-selector">
              <span>{texto}</span>
              <select value={borrador[i]} onChange={(e) => setBorrador((b) => b.map((v, k) => (k === i ? e.target.value : v)))}>
                {validos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {nombre(e)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!distintos && <p className="hoja-nota">Elige dos moods distintos.</p>}
          <button
            className="m-boton-grad"
            disabled={!distintos}
            onClick={() => {
              setElegida([...borrador]);
              setAbierta(false);
            }}
          >
            Usar esta mezcla
          </button>
        </HojaInferior>
      )}
    </>
  );
}
