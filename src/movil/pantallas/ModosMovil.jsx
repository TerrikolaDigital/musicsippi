// src/movil/pantallas/ModosMovil.jsx
// Pestaña Moods: tarjetas de color en secciones (Estados, Géneros y listas fijas).
import { useMemo, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import TarjetaModo from '../TarjetaModo.jsx';
import { hayModosSinMostrar, seccionesDeModos } from '../modos.js';
import { esEjeSonando } from '../origen.js';
import EstadoVacio from '../EstadoVacio.jsx';

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ModosMovil({ ctx, nav }) {
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');

  const secciones = useMemo(() => {
    const q = sinTildes(texto.trim());
    const todas = seccionesDeModos(ctx.ejes, ctx.conteos);
    if (!q) return todas;
    return todas
      .map((s) => ({ ...s, modos: s.modos.filter((e) => sinTildes(e.nombre).includes(q)) }))
      .filter((s) => s.modos.length > 0);
  }, [ctx.ejes, ctx.conteos, texto]);

  const biblioVacia = ctx.tracks.length === 0;
  // Hay moods, pero todos ocultos o sin canciones: no es «aún no tienes moods».
  const hayOcultos = hayModosSinMostrar(ctx.ejes);
  // Pregunta qué mood crear (hoja «Crear»).
  const crear = () => nav.abrirCapa({ tipo: 'hoja', config: 'nuevo' });
  // Recién creados por el organizador: se destacan hasta cerrar su aviso.
  const nuevos = new Set((ctx.importacion?.organizacion?.modosNuevos ?? []).map((m) => m.id));

  return (
    <>
      <div className="m-cabecera">
        <h1 className="m-titulo">Moods</h1>
        <div className="m-acciones-cab">
          <button
            className="m-redondo"
            aria-label="Filtrar moods por nombre"
            onClick={() => {
              setBuscando((b) => !b);
              setTexto('');
            }}
          >
            <IconoM nombre="buscar" />
          </button>
          <button className="m-redondo" aria-label="Crear un mood" onClick={crear}>
            <IconoM nombre="mas" />
          </button>
        </div>
      </div>
      {buscando && (
        <input
          className="m-input"
          type="search"
          autoFocus
          placeholder="Buscar un mood"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      )}
      {secciones.length === 0 ? (
        <EstadoVacio
          titulo={texto.trim() ? 'Ningún mood coincide' : hayOcultos ? 'No hay moods que mostrar' : 'Aún no tienes moods'}
          accion={
            texto.trim()
              ? null
              : hayOcultos
                ? { etiqueta: 'Administrar moods', onClick: () => nav.abrir({ tipo: 'config-modos' }) }
                : biblioVacia
                  ? { etiqueta: 'Explorar música', onClick: () => nav.irAPestana('buscar') }
                  : { etiqueta: 'Crear un mood', onClick: crear }
          }
        >
          {texto.trim()
            ? 'Prueba con otro nombre.'
            : hayOcultos
              ? 'Tus moods están ocultos o aún no tienen canciones. Puedes mostrarlos en Administrar moods.'
              : biblioVacia
                ? 'Añade música y se organizará sola en moods.'
                : 'Crea uno para empezar a organizar tu música.'}
        </EstadoVacio>
      ) : (
        secciones.map((sec) => (
          <section key={sec.id} aria-label={sec.titulo}>
            <div className="m-seccion">
              <h2>{sec.titulo}</h2>
            </div>
            <div className="m-rejilla-modos">
              {sec.modos.map((eje) => (
                <TarjetaModo
                  key={eje.id}
                  eje={eje}
                  conteo={ctx.conteos.get(eje.id) ?? 0}
                  nuevo={nuevos.has(eje.id)}
                  activa={esEjeSonando(ctx.ejeActivo, eje.id)}
                  pausada={!ctx.sonando}
                  portada={ctx.coversDeEje.get(eje.id)?.[0]}
                  onAbrir={() => nav.abrir({ tipo: 'modo', ejeId: eje.id })}
                  onReproducir={() => ctx.reproducirModo(eje, ctx.tracksDe(eje.id), null, true)}
                  onMas={() => nav.abrirCapa({ tipo: 'hoja', modoId: eje.id })}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
