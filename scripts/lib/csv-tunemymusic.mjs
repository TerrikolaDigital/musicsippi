/** Parser CSV propio: comillas dobles + "" como escape — es todo lo que usa TuneMyMusic. */
function parsearLineaCsv(linea) {
  const campos = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if (c === ',' && !enComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/**
 * `texto` = contenido crudo del CSV. Devuelve `{ filas, filasDescartadas, error }`.
 * `error` (string) si el archivo no tiene la forma esperada — el llamador decide
 * cómo mostrarlo (consola vs. respuesta HTTP).
 */
export function parsearCsvTuneMyMusic(texto) {
  const crudo = texto.replace(/^﻿/, '');
  const lineas = crudo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) {
    return { filas: [], filasDescartadas: [], error: 'El archivo no tiene filas de datos.' };
  }

  const encabezado = parsearLineaCsv(lineas[0]);
  const idxTitulo = encabezado.indexOf('Track name');
  const idxArtista = encabezado.indexOf('Artist name');
  const idxAlbum = encabezado.indexOf('Album');
  const idxPlaylist = encabezado.indexOf('Playlist name');
  const idxTipo = encabezado.indexOf('Type');

  if (idxTitulo === -1 || idxArtista === -1) {
    return {
      filas: [],
      filasDescartadas: [],
      error: `No parece un CSV de TuneMyMusic — faltan columnas "Track name"/"Artist name". Encabezado: ${encabezado.join(', ')}`,
    };
  }

  const todasLasFilas = lineas.slice(1).map((l) => {
    const c = parsearLineaCsv(l);
    let titulo = (c[idxTitulo] ?? '').trim();
    let artista = (c[idxArtista] ?? '').trim();
    const tipo = idxTipo >= 0 ? (c[idxTipo] ?? '').trim() : '';

    // YouTube es la única plataforma de origen donde TuneMyMusic deja
    // "Artist name" vacío (ver comentario más abajo) — pero el título del
    // video casi siempre sigue el patrón "Artista - Canción" (con "·" o ","
    // para créditos múltiples: "Zedd · Jon Bellion - Beautiful Now"). Antes
    // de resignarse a descartar la fila, probamos separar por ahí: mejor una
    // fila con buena chance de estar bien clasificada que perder la canción
    // entera. Si no hay " - " en el título (ej. "TOP 10 WESTWORLD
    // SOUNDTRACKS", el nombre de un stream de concierto), sigue sin
    // artista y cae en `filasDescartadas` como antes.
    if (!artista && tipo !== 'Artist' && tipo !== 'Album') {
      const separador = titulo.indexOf(' - ');
      if (separador > 0) {
        artista = titulo.slice(0, separador).trim();
        titulo = titulo.slice(separador + 3).trim();
      }
    }

    return {
      titulo,
      artista,
      album: idxAlbum >= 0 ? (c[idxAlbum] ?? '').trim() : '',
      playlist: idxPlaylist >= 0 ? (c[idxPlaylist] ?? '').trim() : '',
      tipo,
    };
  });

  // Type "Artist"/"Album" no son tracks reproducibles — son "seguís a este
  // artista" / "guardaste este álbum" (Track name ahí es el nombre del
  // ARTISTA o del ÁLBUM, Artist name viene vacío). Además, cualquier fila
  // sin título o sin artista tampoco es utilizable — el "Artista - Canción"
  // del título de YouTube ya se intentó recuperar más arriba; si de ahí no
  // salió nada (el título no tiene " - ", ej. "TOP 10 WESTWORLD
  // SOUNDTRACKS") sigue sin artista y cae acá. `filasDescartadas` es el
  // complemento exacto de `filas` dentro de `todasLasFilas`: toda fila de
  // datos termina en uno de los dos.
  const esFilaUtil = (f) => f.tipo !== 'Artist' && f.tipo !== 'Album' && f.titulo && f.artista;
  const filas = [];
  const filasDescartadas = [];
  for (const f of todasLasFilas) {
    (esFilaUtil(f) ? filas : filasDescartadas).push(f);
  }

  return { filas, filasDescartadas, error: null };
}

const ENCABEZADO = ['Track name', 'Artist name', 'Album', 'Playlist name', 'Type'];

function campoCsv(valor) {
  const limpio = String(valor ?? '').replace(/[\r\n]+/g, ' ').trim();
  return /[",]/.test(limpio) ? `"${limpio.replace(/"/g, '""')}"` : limpio;
}

/**
 * Lo contrario de parsearCsvTuneMyMusic: filas → CSV con las columnas de
 * TuneMyMusic. Lo usa el móvil para mandar al PC lo importado por enlace por
 * POST /api/importar-tunemymusic (endpoint que el PC ya tiene).
 */
export function filasACsvTuneMyMusic(filas) {
  const lineas = [ENCABEZADO.join(',')];
  for (const f of filas) {
    lineas.push([f.titulo, f.artista, f.album, f.playlist, f.tipo || 'Track'].map(campoCsv).join(','));
  }
  return lineas.join('\n');
}
