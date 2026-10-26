/**
 * Núcleo puro del importador (sin node:*): lo usan el PC (importar-tunemymusic.mjs,
 * con idTrack de node:crypto) y el móvil (alta-local.js, con ids ya calculados con
 * Web Crypto). Ver la documentación completa en importar-tunemymusic.mjs.
 *
 * `idDe(artista, tituloLimpio)` → id del track (síncrono).
 * `fuente`: etiqueta que se añade a `track.fuentes` ('tunemymusic' en el PC, 'movil' en el móvil).
 * `descripcionLista`: descripción de las listas nuevas.
 */
import { limpiarTitulo, clasificar } from './clasificar.mjs';
import { fusionarDuplicadosCruzados } from './fusionar-duplicados.mjs';
import { esNombreDeFavoritos } from './nombres-favoritos.mjs';
import { claveNombreModo } from './nombre-modo.mjs';

export function aplicarFilasImportadas(
  filas,
  { biblioteca, ejes, metaSpotify, cacheYoutube = {}, idDe, fuente = 'tunemymusic', descripcionLista = 'Importada desde TuneMyMusic.' }
) {
  const porId = new Map(biblioteca.tracks.map((t) => [t.id, t]));
  const ejePorNombre = new Map(ejes.filter((e) => e.tipo === 'playlist').map((e) => [e.nombre.toLowerCase(), e]));
  // Una lista que ya se convirtió en modo (aplicar-modos.mjs: tipo 'gusto', origen
  // 'descubierto') sigue siendo el destino de esa lista: sin esto se crearía «Chill-2».
  const descubiertos = ejes.filter((e) => e.origen === 'descubierto' && e.nombre);
  const descubiertoPorNombre = (nombre) => {
    const clave = claveNombreModo(nombre);
    return clave ? descubiertos.find((e) => claveNombreModo(e.nombre) === clave) : undefined;
  };
  let siguienteOrden = Math.max(0, ...ejes.map((e) => e.orden ?? 0)) + 1;
  const listasNuevas = [];

  function slug(nombre) {
    const base = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    let candidato = base || 'lista';
    let n = 2;
    while (ejes.some((e) => e.id === candidato) || listasNuevas.some((e) => e.id === candidato)) {
      candidato = `${base}-${n++}`;
    }
    return candidato;
  }

  function ejeDeLista(nombre) {
    const clave = nombre.toLowerCase();
    let eje = ejePorNombre.get(clave) ?? descubiertoPorNombre(nombre);
    if (eje) return eje;
    eje = {
      id: slug(nombre),
      nombre,
      tipo: 'playlist',
      orden: siguienteOrden++,
      activo: true,
      sistema: false,
      padre: null,
      descripcion: descripcionLista,
      anclas: { artistas: [], titulos: [] },
      tagsLastfm: [],
    };
    ejePorNombre.set(clave, eje);
    listasNuevas.push(eje);
    return eje;
  }

  function agregarPertenencia(track, ejeId) {
    if (!track.ejes.some((a) => a.ejeId === ejeId)) {
      track.ejes.push({ ejeId, origen: 'manual', senal: 'usuario', score: 1 });
    }
  }

  let tracksNuevos = 0;
  let favoritosMarcados = 0;
  let pertenenciasMarcadas = 0;
  let albumesNuevos = 0;

  for (const fila of filas) {
    const titulo = limpiarTitulo(fila.titulo);
    const id = idDe(fila.artista, titulo);

    let track = porId.get(id);
    if (!track) {
      track = {
        id,
        artista: fila.artista,
        titulo,
        fuentes: [fuente],
        youtubeQuery: `${fila.artista} ${titulo}`,
        youtubeVideoId: null,
        ejes: clasificar({ artista: fila.artista, titulo }, ejes),
      };
      porId.set(id, track);
      biblioteca.tracks.push(track);
      tracksNuevos++;
    } else if (!track.fuentes.includes(fuente)) {
      track.fuentes.push(fuente);
    }

    // Álbum: llena huecos en metadata-spotify.json, nunca pisa un dato mejor
    // que ya exista (MusicBrainz sigue ganando — ver el merge en /api/metadata).
    if (fila.album) {
      const existente = metaSpotify.tracks[id];
      if (!existente) {
        metaSpotify.tracks[id] = { album: fila.album, anio: null, coverUrl: null };
        albumesNuevos++;
      } else if (!existente.album) {
        existente.album = fila.album;
        albumesNuevos++;
      }
    }

    // "Favorite" es el Type que usa TuneMyMusic para "me gusta"/liked songs
    // en cualquier plataforma de origen — no depende del nombre de la lista.
    // Una playlist llamada "Mis favoritas"/"Liked Songs" ES la colección de
    // me gusta con otro cartel: TuneMyMusic la exporta dos veces cuando en la
    // plataforma de origen además tiene nombre propio. Sin esto queda una
    // lista clon al lado de Favoritas, con exactamente las mismas canciones
    // (ver esNombreDeFavoritos).
    if (fila.tipo.toLowerCase() === 'favorite' || (fila.playlist && esNombreDeFavoritos(fila.playlist))) {
      if (!track.ejes.some((a) => a.ejeId === 'favoritos')) favoritosMarcados++;
      agregarPertenencia(track, 'favoritos');
    } else if (fila.playlist) {
      const eje = ejeDeLista(fila.playlist);
      if (!track.ejes.some((a) => a.ejeId === eje.id)) pertenenciasMarcadas++;
      agregarPertenencia(track, eje.id);
    }
  }

  // Mismo tema acreditado distinto entre plataformas (ej. "Extreme Ways" ya
  // en la biblioteca por Spotify + "'Extreme Ways'" recién importado del CSV
  // de YouTube, con comillas propias del título del video) — idTrack() exige
  // coincidencia exacta a propósito, así que sin esto quedan como dos tracks
  // separados. Corre sobre TODA la biblioteca (no solo las filas de esta
  // importación), antes solo pasaba en el importador de terminal — pedido
  // explícito: que también funcione desde el import de la app, sin que nadie
  // tenga que pedirlo por fuera cada vez.
  const porIdFusion = new Map(biblioteca.tracks.map((t) => [t.id, t]));
  fusionarDuplicadosCruzados(porIdFusion, cacheYoutube);
  biblioteca.tracks = [...porIdFusion.values()];

  return {
    tracksNuevos,
    favoritosMarcados,
    pertenenciasMarcadas,
    albumesNuevos,
    listasNuevas,
    ejesFinal: [...ejes, ...listasNuevas],
  };
}
