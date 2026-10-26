# Modelo de datos

Fecha: 2026-08-17

## 1. Principio rector: los ejes son datos, no código

Requisito del usuario: *"se deben poder quitar y poner nuevos ejes o géneros"*.

Eso descarta tener los ejes hardcodeados. Viven en `data/ejes.json` y el importador los lee en tiempo de ejecución — `scripts/importar.mjs` no menciona ningún eje por nombre. Agregar, quitar o renombrar un eje **no requiere tocar código**.

### 1.1 Los IDs son slugs estables, no números

La ficha original numeraba los ejes 1-9. Eso no sobrevive a la edición: si borrás el eje 3, o el 9 pasa a ser el 8 y todas las asignaciones existentes apuntan al eje equivocado, o quedás con un hueco permanente en la numeración.

Por eso el `id` es un slug (`pop-dance`, `phonk-gym`, `worship`) que:
- **nunca se renumera** — el orden de presentación vive en el campo `orden`, aparte;
- **nunca se reutiliza** — si borrás `eurodance` y después creás otro eje de dance, lleva un id nuevo;
- es la única clave a la que apuntan las asignaciones de tracks.

El número que ve el usuario en la UI es `orden`, y es puramente cosmético.

## 2. Esquema

### 2.1 Eje

```jsonc
{
  "id": "pop-dance",          // slug estable, clave de referencia
  "nombre": "Pop-dance / house festivalero",
  "tipo": "gusto",            // gusto | funcional | sistema
  "orden": 1,                 // solo presentación; reordenar no rompe nada
  "activo": true,             // false = oculto pero conserva asignaciones
  "sistema": false,           // true = no eliminable (sin-clasificar)
  "padre": null,              // id del eje padre, para sub-ejes
  "anclas": {
    "artistas": ["David Guetta", "..."],
    "titulos": ["extended mix", "..."]
  },
  "tagsLastfm": ["dance", "edm"]  // para enriquecimiento (sección 4)
}
```

`tipo` separa **gusto musical** de **modo funcional** (fondo para trabajar/dormir). La app los presenta en secciones distintas porque se activan por criterios distintos: gusto por ganas, funcional por actividad.

`padre` permite sub-ejes. Hoy solo `britpop` cuelga de `nostalgia-rock`: comparten el modo nostalgia pero querés poder filtrar, porque Portishead entre Guns N' Roses no funciona.

### 2.2 Track

```jsonc
{
  "id": "a1b2c3d4e5f6",       // sha1(artista_norm|titulo_norm), estable
  "artista": "Dua Lipa",
  "titulo": "Don't Start Now",
  "fuentes": ["spotify", "amazon"],   // en qué bibliotecas aparecía
  "youtubeQuery": "Dua Lipa Don't Start Now",
  "youtubeVideoId": null,     // se llena al resolver contra YouTube
  "ejes": [
    { "ejeId": "pop-dance", "origen": "auto", "senal": "artista", "score": 1 }
  ]
}
```

Los ejes **no son excluyentes**: un remix de Madonna cae en `disco-club` y `pop-dance` a la vez, tal como pedía la ficha.

### 2.3 El campo `origen` es lo que protege el trabajo manual

`origen: "auto" | "manual"`.

Cada vez que se reimporta o se reclasifica, las asignaciones `auto` se recalculan desde cero, pero **las `manual` nunca se tocan**. Sin esta distinción, cada reimportación borraría todas las correcciones que hiciste a mano — que es justamente el trabajo más caro y menos recuperable.

## 3. Operaciones de edición y qué pasa con los datos

| Operación | Efecto |
|---|---|
| **Crear eje** | Nuevo slug. Opcionalmente dispara reclasificación para poblarlo. |
| **Renombrar** | Solo cambia `nombre`. El `id` y las asignaciones no se tocan. |
| **Reordenar** | Solo cambia `orden`. |
| **Desactivar** (`activo: false`) | Desaparece de la UI, conserva todas las asignaciones. **Es el borrado recomendado**: reversible. |
| **Eliminar de verdad** | Las asignaciones a ese eje se eliminan; los tracks que quedan sin ningún eje caen a `sin-clasificar`. Debe pedir confirmación mostrando cuántos tracks quedarán huérfanos. |
| **Editar anclas** | Dispara reclasificación de las asignaciones `auto`. Las `manual` sobreviven. |

`sin-clasificar` tiene `sistema: true` y no se puede eliminar: es la bandeja de entrada y el destino de los huérfanos.

## 4. El problema de clasificación que las anclas no resuelven

En una biblioteca real típica:

- La mayoría de los artistas tienen un solo track.
- Los archivos de export son texto plano `Artista - Título`: **no traen ningún tag de género**.
- La señal de vocabulario en el título es casi nula.

Es decir: **para la cola larga no hay ninguna señal disponible en los archivos**. Ninguna cantidad de anclas escritas a mano va a clasificar cientos de artistas de un track cada uno.

La solución es un paso de **enriquecimiento por artista** contra una API externa que devuelva tags de género, cacheado en disco (un artista se consulta una vez, no una vez por track):

1. **Last.fm** `artist.getTopTags` — gratis, y su taxonomía comunitaria sí distingue "phonk", "britpop", "eurodance". Es la mejor opción para este caso.
2. **Spotify Web API** `artist.genres` — buena calidad, requiere registrar una app OAuth.
3. **MusicBrainz** — gratis y sin clave, pero los datos de género son más pobres.

El campo `tagsLastfm` de cada eje es el mapeo tag → eje. Está poblado y listo; falta el script que consuma la API.

**Orden de precedencia de señales** (implementado en `clasificar()`):

1. Coincidencia por **artista** (score 1) — señal fuerte.
2. Coincidencia por **título** (score 0.6) — solo si el artista no dijo nada.
3. Tags externos — pendiente, se insertará entre 1 y 2.
4. `sin-clasificar`.

> Esta precedencia no es cosmética: sin ella, anclas genéricas de título (`acoustic`, `piano version`) se comen tracks que ya tienen dueño claro por artista.

## 5. Aprendizaje incremental

Cuando el usuario asigna manualmente un track de `sin-clasificar` a un eje:

1. La asignación se guarda con `origen: "manual"` (inmune a reclasificaciones).
2. El artista se propone como ancla nueva del eje elegido.
3. Si se acepta, todos los demás tracks de ese artista se reclasifican en cascada.

El paso 3 es el que da el retorno: con muchos artistas de un solo track la cascada rinde poco, pero para artistas con 5-30 tracks una sola decisión manual clasifica el bloque entero.
