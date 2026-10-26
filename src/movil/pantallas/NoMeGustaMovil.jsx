// src/movil/pantallas/NoMeGustaMovil.jsx
// Ajustes › No me gusta: lo que has marcado para que no se te recomiende; cada fila se puede quitar.
import SubpantallaMovil from './SubpantallaMovil.jsx';
import EstadoVacio from '../EstadoVacio.jsx';
import { formatearTitulo } from '../../ui/formato.js';

function Grupo({ titulo, marcas, onQuitar }) {
  if (marcas.length === 0) return null;
  return (
    <>
      <div className="config-grupo">{titulo}</div>
      <div className="config-tarjeta nmg-lista">
        {marcas.map((m) => (
          <div key={`${m.tipo}:${m.clave}`} className="nmg-fila">
            <span className="nmg-fila-txt">
              <b>{formatearTitulo(m.etiqueta ?? m.clave)}</b>
            </span>
            <button aria-label={`Quitar ${formatearTitulo(m.etiqueta ?? m.clave)} de No me gusta`} onClick={() => onQuitar(m)}>
              Quitar
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default function NoMeGustaMovil({ ctx, nav }) {
  const marcas = ctx.noMeGusta ?? [];
  const porFecha = (a, b) => (b.fecha ?? 0) - (a.fecha ?? 0);
  const artistas = marcas.filter((m) => m.tipo === 'artista').sort(porFecha);
  const canciones = marcas.filter((m) => m.tipo === 'cancion').sort(porFecha);
  const quitar = (m) => ctx.quitarNoMeGusta(m.tipo, m.clave);
  return (
    <SubpantallaMovil titulo="No me gusta" nav={nav}>
      <p className="hoja-nota">Lo que marques aquí no se usará en las recomendaciones, las mezclas ni la reproducción automática. Seguirá en tu biblioteca si ya lo tenías.</p>
      {marcas.length === 0 && (
        <EstadoVacio titulo="Nada marcado">
          Pulsa «No me gusta» en el menú de una canción o en un artista recomendado.
        </EstadoVacio>
      )}
      <Grupo titulo="Artistas" marcas={artistas} onQuitar={quitar} />
      <Grupo titulo="Canciones" marcas={canciones} onQuitar={quitar} />
    </SubpantallaMovil>
  );
}
