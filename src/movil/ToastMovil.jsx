// src/movil/ToastMovil.jsx — aviso no bloqueante (radio, canción saltada…).
// Siempre montado y con role="status": aparece y se va con transiciones (no
// keyframes) de opacidad/desplazamiento/desenfoque; el texto se conserva mientras
// sale para que no desaparezca de golpe.
import { useEffect, useState } from 'react';
import { IconoM } from './iconos.jsx';

export default function ToastMovil({ aviso }) {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (aviso) setTexto(aviso);
  }, [aviso]);
  return (
    <div className={`m-toast${aviso ? ' visible' : ''}`} role="status" aria-live="polite">
      {texto && (
        <>
          <span className="m-toast-ico" aria-hidden="true">
            <IconoM nombre="info" tamano={20} />
          </span>
          <span className="m-toast-txt">{texto}</span>
        </>
      )}
    </div>
  );
}
