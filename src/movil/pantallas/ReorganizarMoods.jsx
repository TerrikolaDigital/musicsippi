// src/movil/pantallas/ReorganizarMoods.jsx
// Ajustes › «Reorganizar en moods»: vista previa con recuentos, confirmación y «Deshacer reorganización».
// Antes de aplicar se guarda una copia local (ver src/data/migrar-moods-movil.js).
import { useCallback, useEffect, useState } from 'react';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import { haceCuanto } from '../formato.js';
import * as db from '../../data/lib/db.js';
import { obtenerMetadata } from '../../data/biblioteca.js';
import { deshacer, hayCopiaPrevia, reorganizar, vistaPrevia } from '../../data/migrar-moods-movil.js';
import '../moods-ajustes.css';

function Recuentos({ titulo, filas }) {
  if (!filas.length) return null;
  return (
    <>
      <div className="reorg-grupo">{titulo}</div>
      <ul className="reorg-lista">
        {filas.map((f) => (
          <li key={f.nombre}>
            <span>{f.nombre}</span>
            <span>{f.n}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ReorganizarMoods({ ctx, nav }) {
  const [previa, setPrevia] = useState(null); // { migrado, resumen?, cambiosDeMoodsPendientes? }
  const [copia, setCopia] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState(null); // { tipo: 'ok' | 'error', texto }

  const cargar = useCallback(async () => {
    try {
      setCopia(await hayCopiaPrevia(db));
      setPrevia(await vistaPrevia(db, { metadata: await obtenerMetadata().catch(() => null) }));
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo preparar la vista previa: ${e?.message ?? e}` });
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function aplicar() {
    const extra = previa.cambiosDeMoodsPendientes > 0 ? ` Hay ${previa.cambiosDeMoodsPendientes} cambios de moods sin enviar al PC que se descartarán.` : '';
    if (!window.confirm(`Se reorganizan tus canciones en estados y géneros. Antes se guarda una copia para poder deshacerlo.${extra} ¿Continuar?`)) return;
    setOcupado(true);
    setEstado(null);
    try {
      await reorganizar(db, { metadata: await obtenerMetadata().catch(() => null) });
      await ctx.recargarDatosLocales?.();
      setEstado({ tipo: 'ok', texto: 'Listo: tus canciones están reorganizadas en moods. Si usas el PC, reorganízalo también antes de sincronizar.' });
      await cargar();
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo reorganizar (no se ha cambiado nada): ${e?.message ?? e}` });
    } finally {
      setOcupado(false);
    }
  }

  async function revertir() {
    if (!window.confirm('Se vuelve a como estaba antes de reorganizar. Lo que hayas cambiado en moods desde entonces se pierde. ¿Continuar?')) return;
    setOcupado(true);
    setEstado(null);
    try {
      await deshacer(db);
      await ctx.recargarDatosLocales?.();
      setEstado({ tipo: 'ok', texto: 'Reorganización deshecha.' });
      await cargar();
    } catch (e) {
      setEstado({ tipo: 'error', texto: `No se pudo deshacer: ${e?.message ?? e}` });
    } finally {
      setOcupado(false);
    }
  }

  const r = previa?.resumen;
  return (
    <SubpantallaMovil titulo="Reorganizar en moods" nav={nav}>
      {!previa && !estado && <p className="config-ok">Calculando la vista previa…</p>}
      {previa && !previa.migrado && r && (
        <div className="config-bloque">
          <b>Así quedaría tu música</b>
          <p>
            {r.conMood} de {r.total} canciones tendrían mood ({r.sinMood} sin ninguno). Seis estados, géneros y tus listas aparte. Nada cambia hasta que pulses Reorganizar.
          </p>
          <Recuentos titulo="Estados" filas={r.estados} />
          <Recuentos titulo="Géneros" filas={r.generos} />
          <Recuentos titulo="Listas" filas={r.listas} />
          {r.total > 0 && (
            <>
              <button className="m-boton-grad" disabled={ocupado} onClick={aplicar}>
                {ocupado ? 'Reorganizando…' : 'Reorganizar'}
              </button>
              <p>Se guarda una copia antes. Si usas el PC, reorganízalo también desde la app del PC: no se podrá sincronizar hasta que los dos estén igual.</p>
            </>
          )}
        </div>
      )}
      {previa && !previa.migrado && !r && !estado && (
        <p className="config-ok">No hay nada que reorganizar todavía: importa música primero.</p>
      )}
      {previa?.migrado && (
        <div className="config-bloque">
          <b>Tus moods ya están reorganizados</b>
        </div>
      )}
      {copia && (
        <div className="config-bloque">
          <b>Deshacer reorganización</b>
          <p>
            Copia de {haceCuanto(copia.fecha).toLowerCase()} con {copia.canciones} canciones.
          </p>
          <button className="config-sec" disabled={ocupado} onClick={revertir}>
            Deshacer reorganización
          </button>
        </div>
      )}
      {estado && <p className={estado.tipo === 'error' ? 'm-aviso' : 'config-ok'}>{estado.texto}</p>}
    </SubpantallaMovil>
  );
}
