// src/movil/HojaAlbum.jsx
// Hoja ⋯ de un álbum o un artista: «Añadir a un mood…», «Añadir a la cola» y «Reproducir a continuación».
// Al elegir mood, `asegurarIds()` mete en la biblioteca las canciones que falten y devuelve los
// ids de todo el álbum; luego cada una se asigna con ctx.asignarEje (que anota en el journal al PC).
import { useState } from 'react';
import HojaInferior from './HojaInferior.jsx';
import { IconoM } from './iconos.jsx';
import { formatearTitulo } from '../ui/formato.js';
import { colorTarjeta } from './formato.js';
import { UMBRAL_BUSCADOR, buscarDestinos, destinosDeMover } from './moverMood.js';
import { planAnadirAlbumAMood, textoAvisoAlbumMood } from './albumMood.js';

// `asegurarIds` ausente = no hay canciones propias que asignar (sin «Añadir a un mood…»); `extra`: opciones propias de quien la abre.
export default function HojaAlbum({ ctx, titulo, subtitulo = 'Álbum', onCerrar, asegurarIds, pistasCola, extra }) {
  const [vista, setVista] = useState('menu');
  const [busqueda, setBusqueda] = useState('');
  const [aviso, setAviso] = useState(null); // {texto, deshacer: {ejeId, ids} | null}
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const destinos = asegurarIds ? destinosDeMover(ctx.ejes) : [];
  const hayPistas = pistasCola().length > 0;
  const visibles = buscarDestinos(destinos, busqueda);

  const elegir = async (eje) => {
    setOcupado(true);
    setError(null);
    try {
      const { ids, tracks } = await asegurarIds();
      const { poner, yaEstaban } = planAnadirAlbumAMood(ids, tracks, eje.id);
      for (const id of poner) await ctx.asignarEje(id, eje.id);
      setAviso({
        texto: textoAvisoAlbumMood(poner.length, yaEstaban, formatearTitulo(eje.nombre)),
        deshacer: poner.length > 0 ? { ejeId: eje.id, ids: poner } : null,
      });
      setVista('menu');
      setBusqueda('');
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async () => {
    const d = aviso?.deshacer;
    setAviso(null);
    if (!d) return;
    try {
      for (const id of d.ids) await ctx.quitarModo(id, d.ejeId);
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  };

  // Toda la lista de una vez (ctx la inserta/añade en orden y, sin cola, empieza a sonar).
  const aCola = (fn) => () => {
    onCerrar();
    fn(pistasCola());
  };

  let cuerpo;
  if (vista === 'moods') {
    cuerpo = (
      <>
        <div className="hoja-sub-cab">
          <button type="button" className="m-redondo" aria-label="Volver" onClick={() => { setVista('menu'); setBusqueda(''); }}>
            <IconoM nombre="atras" />
          </button>
          <h2>Añadir a un mood</h2>
        </div>
        {destinos.length > UMBRAL_BUSCADOR && (
          <input
            className="m-input hoja-buscador"
            type="search"
            placeholder="Buscar mood"
            aria-label="Buscar mood"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
          />
        )}
        <div className="hoja-mover" role="list">
          {visibles.map((e) => (
            <button
              key={e.id}
              type="button"
              role="listitem"
              className="hoja-op hoja-mover-fila"
              style={{ '--c': colorTarjeta(e) }}
              disabled={ocupado}
              onClick={() => elegir(e)}
            >
              <i aria-hidden="true" />
              <span>{formatearTitulo(e.nombre)}</span>
            </button>
          ))}
          {visibles.length === 0 && <p className="hoja-nota">Ningún mood coincide.</p>}
        </div>
        {ocupado && <p className="hoja-nota" role="status">Añadiendo…</p>}
      </>
    );
  } else {
    cuerpo = (
      <>
        <div className="hoja-cab">
          <div>
            <b>{formatearTitulo(titulo)}</b>
            <small>{subtitulo}</small>
          </div>
        </div>
        {aviso && (
          <div className="hoja-aviso" role="status">
            <span>{aviso.texto}</span>
            {aviso.deshacer && (
              <button type="button" onClick={deshacer}>
                Deshacer
              </button>
            )}
          </div>
        )}
        {destinos.length > 0 && (
          <button type="button" className="hoja-op" onClick={() => setVista('moods')}>
            <IconoM nombre="modos" />
            <span>Añadir a un mood…</span>
          </button>
        )}
        {hayPistas && (
          <>
            <button type="button" className="hoja-op" onClick={aCola(ctx.reproducirDespues)}>
              <IconoM nombre="siguiente" />
              <span>Reproducir a continuación</span>
            </button>
            <button type="button" className="hoja-op" onClick={aCola(ctx.agregarACola)}>
              <IconoM nombre="cola" />
              <span>Añadir a la cola</span>
            </button>
          </>
        )}
        {extra}
      </>
    );
  }

  return (
    <HojaInferior abierta onCerrar={onCerrar} titulo={formatearTitulo(titulo)}>
      {cuerpo}
      {error && <p className="m-aviso">No se pudo completar: {error}</p>}
    </HojaInferior>
  );
}
