// src/movil/pantallas/RevisarMoods.jsx
// Ajustes › «Revisar moods» (R9): lo que la recalificación sacó de un mood o cambió de género, agrupado por mood, con
// un toque para devolver cada canción (ver src/data/recalificar-moods-movil.js). Lo devuelto cuenta como decisión tuya.
import { useCallback, useEffect, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import { haceCuanto } from '../formato.js';
import { formatearTitulo } from '../../ui/formato.js';
import * as db from '../../data/lib/db.js';
import { agruparRevision, deshacerRecalificacion, devolverCancion, hayCopiaRecalificacion, leerRevision } from '../../data/recalificar-moods-movil.js';
import { MOTIVOS_TEXTO } from '../../organizador/recalificar-moods.js';
import '../moods-ajustes.css';

export default function RevisarMoods({ ctx, nav }) {
  const [revision, setRevision] = useState(undefined); // undefined = cargando, null = nada que revisar
  const [copia, setCopia] = useState(null);
  const [ocupado, setOcupado] = useState(null); // clave del item o 'deshacer'
  const [estado, setEstado] = useState(null); // { tipo: 'ok' | 'error', texto }

  const cargar = useCallback(async () => {
    try {
      setRevision(await leerRevision(db));
      setCopia(await hayCopiaRecalificacion(db));
    } catch (e) {
      setRevision(null);
      setEstado({ tipo: 'error', texto: `No se pudo leer la lista: ${e?.message ?? e}` });
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function devolver(grupo, item) {
    const clave = `${item.trackId}|${grupo.ejeId}`;
    setOcupado(clave);
    setEstado(null);
    try {
      await devolverCancion(db, item.trackId, grupo.ejeId, item.tipo);
      await ctx.recargarDatosLocales?.();
      await cargar();
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo devolver: ${e?.message ?? e}` });
    } finally {
      setOcupado(null);
    }
  }

  async function deshacerTodo() {
    if (!window.confirm('Todas las canciones tocadas vuelven a como estaban antes. Lo que hayas devuelto o cambiado en ellas desde entonces se pierde. ¿Continuar?')) return;
    setOcupado('deshacer');
    setEstado(null);
    try {
      await deshacerRecalificacion(db);
      await ctx.recargarDatosLocales?.();
      setEstado({ tipo: 'ok', texto: 'Hecho: todo vuelve a como estaba.' });
      await cargar();
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo deshacer: ${e?.message ?? e}` });
    } finally {
      setOcupado(null);
    }
  }

  const grupos = revision ? agruparRevision(revision, ctx.ejes) : [];
  const nombreDe = (id) => ctx.ejes.find((e) => e.id === id)?.nombre ?? id;
  return (
    <SubpantallaMovil titulo="Revisar moods" nav={nav}>
      {revision === undefined && <p className="config-ok">Cargando…</p>}
      {revision === null && !estado && <EstadoVacio titulo="No hay nada que revisar" />}
      {revision && (
        <>
          <p className="config-nota">
            Se revisaron tus moods ({haceCuanto(revision.fecha).toLowerCase()}): estas canciones salieron de un mood o cambiaron de género porque no encajaban. Toca «Devolver» en las que prefieras como estaban.
          </p>
          {grupos.map((g) => (
            <div className="config-bloque" key={g.ejeId}>
              <b>
                {g.nombre} ({g.items.length})
              </b>
              <ul className="revisar-lista">
                {g.items.map((it) => {
                  const clave = `${it.trackId}|${g.ejeId}`;
                  return (
                    <li key={clave} className={it.devuelto ? 'devuelta' : ''}>
                      <span className="revisar-texto">
                        <span>{it.titulo}</span>
                        <small>
                          {formatearTitulo(it.artista)} · {MOTIVOS_TEXTO[it.motivo] ?? it.motivo}
                          {it.haciaEjeId ? ` · ahora ${nombreDe(it.haciaEjeId)}` : ''}
                        </small>
                      </span>
                      {it.devuelto ? (
                        <span className="revisar-hecho">Devuelta</span>
                      ) : (
                        <button className="config-sec" disabled={!!ocupado} onClick={() => devolver(g, it)}>
                          {ocupado === clave ? '…' : it.tipo === 'entro' ? 'Quitar' : 'Devolver'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}
      {copia && (
        <div className="config-bloque">
          <b>Deshacer todo</b>
          <p>
            Copia de {haceCuanto(copia.fecha).toLowerCase()} con {copia.canciones} canciones.
          </p>
          <button className="config-sec" disabled={!!ocupado} onClick={deshacerTodo}>
            {ocupado === 'deshacer' ? 'Deshaciendo…' : 'Deshacer la revisión'}
          </button>
        </div>
      )}
      {estado && <p className={estado.tipo === 'error' ? 'm-aviso' : 'config-ok'}>{estado.texto}</p>}
    </SubpantallaMovil>
  );
}
