import { Innertube } from 'youtubei.js';

/** Navega un objeto por una ruta de claves separadas por punto.
 *  Devuelve undefined si algún eslabón intermedio falta. */
export function obtenerCampo(objeto, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objeto);
}

/** Ejecuta un contrato (una consulta fija y conocida contra una fuente
 *  externa) y verifica que los campos requeridos sigan presentes en la
 *  respuesta. Nunca lanza: cualquier excepción de la propia consulta se
 *  captura y se reporta como contrato incumplido. */
export async function verificarContrato(contrato) {
  try {
    const respuesta = await contrato.ejecutar();
    const camposFaltantes = contrato.requiere.filter((ruta) => obtenerCampo(respuesta, ruta) === undefined);
    return {
      fuente: contrato.fuente,
      ok: camposFaltantes.length === 0,
      camposFaltantes,
      muestra: JSON.stringify(respuesta).slice(0, 500),
    };
  } catch (e) {
    return { fuente: contrato.fuente, ok: false, camposFaltantes: contrato.requiere, error: e.message };
  }
}

/** Consultas fijas, públicas y conocidas — sin ningún dato del usuario.
 *
 *  `fuentes` es un objeto con la forma que produce `scripts/lib/fuentes.mjs`
 *  (Tarea 10): las rutas de `requiere` salen de ahí para poder corregirlas
 *  sin tocar código si una fuente cambia de forma. Forma esperada:
 *
 *  {
 *    youtube: {
 *      search: { titulo: 'title.text', canal: 'author.name', descripcion: 'snippets.0.text.text' },
 *      getInfo: { keywords: 'basic_info.keywords', canal: 'basic_info.channel.name', descripcion: 'basic_info.short_description' },
 *    },
 *    musicbrainz: { generos: 'genres' },
 *  }
 */
export function construirContratos(fuentes) {
  return [
    {
      fuente: 'youtube-search',
      ejecutar: async () => {
        const yt = await Innertube.create({ generate_session_locally: true });
        const r = await yt.search('Rick Astley Never Gonna Give You Up', { type: 'video' });
        return r.videos?.[0] ?? {};
      },
      requiere: Object.values(fuentes.youtube.search),
    },
    {
      fuente: 'youtube-getinfo',
      ejecutar: async () => {
        const yt = await Innertube.create({ generate_session_locally: true });
        return (await yt.getInfo('dQw4w9WgXcQ')) ?? {};
      },
      requiere: Object.values(fuentes.youtube.getInfo),
    },
    {
      fuente: 'musicbrainz',
      ejecutar: async () => {
        const r = await fetch('https://musicbrainz.org/ws/2/artist/83d91898-7763-47d7-b03b-b92132375c47?inc=genres&fmt=json', {
          headers: { 'User-Agent': 'Musicsippi/1.0 (diagnostico)' },
        });
        return r.json();
      },
      requiere: [fuentes.musicbrainz.generos],
    },
    {
      fuente: 'deezer',
      ejecutar: async () => {
        const r = await fetch('https://api.deezer.com/search/artist?q=artist:"Daft Punk"');
        const datos = await r.json();
        return datos.data?.[0] ?? {};
      },
      requiere: ['id'],
    },
  ];
}

export async function verificarTodos(fuentes) {
  const contratos = construirContratos(fuentes);
  const resultados = [];
  for (const contrato of contratos) {
    resultados.push(await verificarContrato(contrato));
  }
  return resultados;
}
