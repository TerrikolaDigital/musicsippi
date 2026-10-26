// src/movil/resumen/EditorTarjeta.jsx
// Editor de la tarjeta para compartir: elegir dato (carrusel de miniaturas), formato y fondo.
// La vista previa y las miniaturas usan el mismo dibujarTarjeta que genera la imagen final.
import { useEffect, useRef, useState } from 'react';
import { IconoM } from '../iconos.jsx';
import { cargarImagenes, compartirTarjeta, dibujarTarjeta, esperarFuentes, guardarTarjeta, medidas } from './tarjeta.js';
import { textoCompartir } from './datosTarjetas.js';

const FORMATOS = [
  { id: 'historia', nombre: 'Historia', nota: '9:16' },
  { id: 'cuadrado', nombre: 'Cuadrado', nota: '1:1' },
];
const ESTILOS = [
  { id: 'color', nombre: 'Color' },
  { id: 'portada', nombre: 'Portada' },
  { id: 'oscuro', nombre: 'Oscuro' },
];

/** Pinta una tarjeta en un canvas de `ancho` píxeles de ancho (escala el espacio lógico de 1080). */
function pintar(canvas, ancho, opciones) {
  const { ancho: W, alto: H } = medidas(opciones.formato);
  const k = ancho / W;
  canvas.width = Math.round(ancho);
  canvas.height = Math.round(H * k);
  const c = canvas.getContext('2d');
  c.setTransform(k, 0, 0, k, 0, 0);
  dibujarTarjeta(c, opciones);
}

function Lienzo({ ancho, opciones, listo, ...resto }) {
  const ref = useRef(null);
  useEffect(() => {
    if (listo && ref.current) pintar(ref.current, ancho, opciones);
  }, [listo, ancho, opciones.tipo, opciones.formato, opciones.estilo, opciones.datos, opciones.imagenes]);
  return <canvas ref={ref} {...resto} />;
}

export default function EditorTarjeta({ tarjetas, datos, urls, inicial, onCerrar }) {
  const [tipo, setTipo] = useState(tarjetas.some((t) => t.tipo === inicial) ? inicial : tarjetas[0]?.tipo);
  const [formato, setFormato] = useState('historia');
  const [estilo, setEstilo] = useState('color');
  const [imagenes, setImagenes] = useState({});
  const [listo, setListo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');
  const activa = useRef(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([esperarFuentes(), cargarImagenes(urls)]).then(([, im]) => {
      if (!vivo) return;
      setImagenes(im);
      setListo(true);
    });
    return () => {
      vivo = false;
    };
  }, [urls]);

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  useEffect(() => {
    activa.current?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tipo]);

  const compartir = async () => {
    setTrabajando(true);
    setAviso('');
    try {
      const titulo = datos.tipoPeriodo === 'anio' ? 'Mi año en Musicsippi' : 'Mi semana en Musicsippi';
      const r = await compartirTarjeta({ tipo, formato, estilo, datos, imagenes }, titulo, textoCompartir(tipo, datos));
      if (r === 'copiado') setAviso('Resumen copiado');
      else if (r === 'descargada') setAviso('Imagen descargada');
    } catch {
      setAviso('No se pudo preparar la imagen. Inténtalo otra vez.');
    } finally {
      setTrabajando(false);
    }
  };

  const guardar = async () => {
    setTrabajando(true);
    setAviso('');
    try {
      const r = await guardarTarjeta({ tipo, formato, estilo, datos, imagenes });
      setAviso(r === 'galeria' ? 'Guardada en la galería' : 'Imagen descargada');
    } catch (e) {
      console.warn('Resumen: no se pudo guardar la tarjeta', e);
      setAviso('No se pudo guardar en la galería. Revisa el permiso de almacenamiento e inténtalo otra vez.');
    } finally {
      setTrabajando(false);
    }
  };

  const base = { formato, estilo, datos, imagenes };
  return (
    <div className="edtar" role="dialog" aria-label="Compartir tarjeta">
      <div className="edtar-cab">
        <b>Compartir</b>
        <button className="edtar-cerrar" aria-label="Cerrar editor" onClick={onCerrar}>
          <IconoM nombre="cerrar" tamano={22} />
        </button>
      </div>
      <div className="edtar-vista">
        <Lienzo className={`edtar-lienzo${listo ? ' lista' : ''}`} style={{ '--r': formato === 'cuadrado' ? 1 : 9 / 16 }} ancho={720} listo={listo} opciones={{ ...base, tipo }} />
      </div>
      <div className="edtar-tira" role="listbox" aria-label="Dato que compartir">
        {tarjetas.map((t) => (
          <button
            key={t.tipo}
            ref={t.tipo === tipo ? activa : null}
            role="option"
            aria-selected={t.tipo === tipo}
            className={`edtar-mini${t.tipo === tipo ? ' activa' : ''}`}
            onClick={() => setTipo(t.tipo)}
          >
            <Lienzo ancho={156} listo={listo} opciones={{ ...base, tipo: t.tipo }} aria-hidden="true" />
            <span>{t.nombre}</span>
          </button>
        ))}
      </div>
      <div className="edtar-ajustes">
        <div className="edtar-grupo" role="group" aria-label="Formato">
          {FORMATOS.map((f) => (
            <button key={f.id} aria-pressed={formato === f.id} onClick={() => setFormato(f.id)}>
              {f.nombre} <small>{f.nota}</small>
            </button>
          ))}
        </div>
        <div className="edtar-grupo" role="group" aria-label="Fondo">
          {ESTILOS.map((s) => (
            <button key={s.id} aria-pressed={estilo === s.id} onClick={() => setEstilo(s.id)}>
              <i className={`edtar-muestra m-${s.id}`} style={{ '--c': datos.color }} />
              {s.nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="edtar-pie">
        <p className="edtar-aviso" role="status">{aviso}</p>
        <button className="res-boton" onClick={guardar} disabled={trabajando || !listo}>
          <IconoM nombre="descargar" tamano={20} />
          <span>Guardar en la galería</span>
        </button>
        <button className="res-boton principal" onClick={compartir} disabled={trabajando || !listo}>
          <IconoM nombre="compartir" tamano={20} />
          <span>{trabajando ? 'Preparando imagen…' : 'Compartir'}</span>
        </button>
      </div>
    </div>
  );
}
