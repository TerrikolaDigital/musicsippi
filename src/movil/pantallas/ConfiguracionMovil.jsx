// src/movil/pantallas/ConfiguracionMovil.jsx
// Configuración agrupada, con el estado de cada fila a la derecha. Las filas
// propias de Android (batería, sincronizar) no salen en la PWA.
import { useEffect, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import SubpantallaMovil from './SubpantallaMovil.jsx';
import AjustesSonido from './AjustesSonido.jsx';
import Interruptor from './Interruptor.jsx';
import { haceCuanto } from '../formato.js';
import { abrirAjusteBateria, esAndroid, estadoBateria } from '../../data/nativo-movil.js';
import { contarCambiosPendientes, obtenerUltimaSincronizacion } from '../../data/sincronizar-movil.js';
import { leerNivelar, guardarNivelar } from '../../data/nivelar-volumen.js';
import { leerContinuar, guardarContinuar } from '../../data/continuar-al-acabar.js';
import { contarSinModo } from '../inicio.js';
import { versionInstalada } from '../../data/actualizaciones-movil.js';
import { leerTema, guardarTema } from '../../data/tema.js';
import * as db from '../../data/lib/db.js';
import { esquemaLocal, hayCopiaPrevia } from '../../data/migrar-moods-movil.js';
import { textoResumenSinConexion } from '../../data/sin-conexion.js';
import { leerRevision } from '../../data/recalificar-moods-movil.js';

const TEMAS = [
  { id: 'sistema', texto: 'Sistema' },
  { id: 'claro', texto: 'Claro' },
  { id: 'oscuro', texto: 'Oscuro' },
];

function Fila({ icono, color, titulo, sub, estado, onClick, peligro, positivo }) {
  return (
    <button className={`config-fila${peligro ? ' peligro' : ''}`} onClick={onClick}>
      <span className="config-ic" style={{ background: color }}>
        <IconoM nombre={icono} />
      </span>
      <span className="config-tx">
        <b>{titulo}</b>
        {sub && <small>{sub}</small>}
      </span>
      <em className={positivo ? 'si' : ''}>{estado ?? '›'}</em>
    </button>
  );
}

// Fila con interruptor (role=switch): el lector de pantalla la anuncia como activado/desactivado.
function FilaInterruptor({ icono, color, titulo, sub, activo, onCambio }) {
  return (
    <div className="config-fila">
      <span className="config-ic" style={{ background: color }}>
        <IconoM nombre={icono} />
      </span>
      <span className="config-tx">
        <b>{titulo}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Interruptor activo={activo} etiqueta={titulo} onCambio={onCambio} />
    </div>
  );
}

function Grupo({ titulo, children }) {
  return (
    <>
      <div className="config-grupo">{titulo}</div>
      <div className="config-tarjeta">{children}</div>
    </>
  );
}

function estadoTemporizador(t) {
  if (!t) return 'Apagado';
  if (t.alFinal) return 'Al terminar la canción';
  if (t.finMs) return `${Math.max(1, Math.ceil((t.finMs - Date.now()) / 60_000))} min`;
  return 'Activado';
}

export default function ConfiguracionMovil({ ctx, nav }) {
  const android = esAndroid();
  const [bateria, setBateria] = useState(null); // true | false | null (desconocido)
  const [pendientes, setPendientes] = useState(0);
  const [ultima, setUltima] = useState(null);
  const [nivelar, setNivelar] = useState(() => leerNivelar());
  const [continuar, setContinuar] = useState(() => leerContinuar());
  const [tema, setTema] = useState(() => leerTema());
  const [reorg, setReorg] = useState({ migrado: true, copia: false }); // la fila solo sale si falta migrar o hay copia
  const [porRevisar, setPorRevisar] = useState(0); // canciones de «Revisar moods»

  useEffect(() => {
    let vivo = true;
    const leer = () => {
      estadoBateria().then((v) => vivo && setBateria(v)).catch(() => {});
      contarCambiosPendientes().then((n) => vivo && setPendientes(n)).catch(() => {});
      obtenerUltimaSincronizacion().then((v) => vivo && setUltima(v)).catch(() => {});
      if (ctx.modoLocal) {
        Promise.all([esquemaLocal(db), hayCopiaPrevia(db)]).then(([e, c]) => vivo && setReorg({ migrado: e >= 1, copia: !!c })).catch(() => {});
        leerRevision(db).then((r) => vivo && setPorRevisar(r?.cambios?.length ?? 0)).catch(() => {});
      }
    };
    leer();
    // Al volver del ajuste de batería de Android se relee el estado.
    document.addEventListener('visibilitychange', leer);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', leer);
    };
  }, []);

  const sinModo = contarSinModo(ctx.tracks);
  const modos = ctx.ejes.filter((e) => !e.sistema && e.activo !== false).length;
  const version = typeof __SELLO_VERSION__ !== 'undefined' ? __SELLO_VERSION__ : null;
  const [nativa, setNativa] = useState(null);
  useEffect(() => {
    versionInstalada().then(setNativa).catch(() => {});
  }, []);

  return (
    <SubpantallaMovil titulo="Configuración" nav={nav}>
      <div className="config-perfil">
        <span className="config-logo">♫</span>
        <div>
          <b>Tu Musicsippi</b>
          <small>
            {ctx.tracks.length} canciones · {modos} moods · {ctx.favoritos.artistas.length} {ctx.favoritos.artistas.length === 1 ? 'artista favorito' : 'artistas favoritos'}
          </small>
        </div>
      </div>

      <Grupo titulo="Apariencia">
        <div className="cfg-ini-fila">
          <b>Tema</b>
          <div className="m-segmentado cfg-ini-seg" role="group" aria-label="Tema de la app">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                aria-pressed={tema === t.id}
                className={tema === t.id ? 'on' : ''}
                onClick={() => {
                  guardarTema(t.id);
                  setTema(t.id);
                }}
              >
                {t.texto}
              </button>
            ))}
          </div>
        </div>
      </Grupo>

      <Grupo titulo="Música">
        <Fila icono="modos" color="#7c5cff33" titulo="Administrar moods" sub="Crear, renombrar, ordenar, colores" onClick={() => nav.abrir({ tipo: 'config-modos' })} />
        <FilaInterruptor
          icono="info"
          color="#ffc85733"
          titulo="Nivelar volumen"
          sub="Que todas las canciones suenen a un volumen parecido"
          activo={nivelar}
          onCambio={(v) => {
            guardarNivelar(v);
            setNivelar(v);
          }}
        />
        <FilaInterruptor
          icono="infinito"
          color="#4cd9c633"
          titulo="Continuar al acabar"
          sub="Al terminar la cola, seguir con canciones parecidas"
          activo={continuar}
          onCambio={(v) => {
            guardarContinuar(v);
            setContinuar(v);
          }}
        />
        {android && ctx.sinConexion && (
          <Fila icono="disco" color="#4cd9c633" titulo="Sin conexión" sub={textoResumenSinConexion({ n: ctx.sinConexion.nGuardadas, bytes: ctx.sinConexion.bytesUsados })} onClick={() => nav.abrir({ tipo: 'config-sin-conexion' })} />
        )}
        <Fila icono="inicio" color="#ff4d8d33" titulo="Inicio" sub="Qué secciones salen y si cambian cada día" onClick={() => nav.abrir({ tipo: 'config-inicio' })} />
        <Fila icono="no-me-gusta" color="#e1705526" titulo="No me gusta" sub="Canciones y artistas que no quieres que te recomendemos" estado={`${(ctx.noMeGusta ?? []).length} ›`} onClick={() => nav.abrir({ tipo: 'config-no-me-gusta' })} />
        {ctx.modoLocal && (!reorg.migrado || reorg.copia) && (
          <Fila
            icono="modos"
            color="#7c5cff33"
            titulo={reorg.migrado ? 'Deshacer reorganización' : 'Reorganizar en moods'}
            sub={reorg.migrado ? 'Volver a como estaba antes' : 'Estados, géneros y tus listas aparte'}
            onClick={() => nav.abrir({ tipo: 'config-reorganizar' })}
          />
        )}
        {porRevisar > 0 && (
          <Fila icono="modos" color="#4cd9c633" titulo="Revisar moods" sub="Canciones que salieron de un mood o cambiaron de género" estado={`${porRevisar} ›`} onClick={() => nav.abrir({ tipo: 'config-revisar-moods' })} />
        )}
        {sinModo > 0 && (
          <Fila icono="lista" color="#ffb44c33" titulo={`Canciones sin mood (${sinModo})`} sub="Las que no se han podido colocar solas" onClick={() => nav.abrir({ tipo: 'config-sin-modo' })} />
        )}
        <Fila icono="estadisticas" color="#7c5cff33" titulo="Tus estadísticas" sub="Tiempo escuchado, lo más sonado y tu racha" estado="›" onClick={() => nav.abrir({ tipo: 'estadisticas' })} />
        <Fila icono="luna" color="#4cd9c633" titulo="Temporizador para dormir" estado={`${estadoTemporizador(ctx.temporizador)} ›`} onClick={() => nav.abrirCapa({ tipo: 'hoja', config: 'sueno' })} />
      </Grupo>

      {android && <AjustesSonido nav={nav} />}

      {android && (
        <Grupo titulo="Este móvil">
          <Fila
            icono="sincronizar"
            color="#ff4d8d33"
            titulo="Sincronizar con el PC"
            sub={pendientes > 0 ? `${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} por enviar` : undefined}
            estado={`${haceCuanto(ultima)} ›`}
            onClick={() => nav.abrir({ tipo: 'config-sincronizar' })}
          />
          <Fila
            icono="bateria"
            color="#ffc85733"
            titulo="Batería sin restricciones"
            sub="Para que no se corte con la pantalla apagada"
            estado={bateria === null ? '›' : bateria ? 'Activado' : 'Desactivado ›'}
            positivo={bateria === true}
            onClick={() => abrirAjusteBateria().catch(() => {})}
          />
        </Grupo>
      )}

      <Grupo titulo="Biblioteca y datos">
        <Fila icono="mas" color="#4cd9c633" titulo="Añadir música" sub={ctx.modoLocal ? (android ? 'Un enlace o la música de este móvil' : 'Pega el enlace de una playlist') : 'TuneMyMusic, archivos: desde el PC'} onClick={() => nav.abrirCapa({ tipo: 'hoja', config: 'anadir' })} />
        <Fila icono="disco" color="#7c5cff33" titulo="Copia de seguridad" onClick={() => nav.abrir({ tipo: 'config-copia' })} />
      </Grupo>

      <Grupo titulo="Ayuda">
        <Fila icono="ayuda" color="#ffffff14" titulo="Ayuda" onClick={() => nav.abrir({ tipo: 'config-ayuda' })} />
        {ctx.modoLocal && (
          <Fila icono="info" color="#ffffff14" titulo="Ver la bienvenida" onClick={() => nav.abrirCapa({ tipo: 'bienvenida', paso: 1 })} />
        )}
        <Fila icono="correo" color="#ffffff14" titulo="Escríbenos" onClick={() => nav.abrir({ tipo: 'config-escribinos' })} />
      </Grupo>

      <Grupo titulo="Musicsippi">
        <Fila icono="info" color="#ffffff14" titulo="Acerca de" sub="@terrikoladigital · 2026" estado={`${nativa?.versionName || '0.1.0'}${version?.commit ? ` · ${version.commit}` : ''} ›`} onClick={() => nav.abrir({ tipo: 'config-acerca' })} />
      </Grupo>

      <Grupo titulo="Avanzado">
        <Fila icono="borrar" color="#e1705526" peligro titulo="Borrar los datos de este móvil" sub="Deja la app como recién instalada" onClick={() => nav.abrirCapa({ tipo: 'hoja', config: 'borrar' })} />
      </Grupo>
    </SubpantallaMovil>
  );
}
