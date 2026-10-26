# Musicsippi

App de música por **moods** (estados y géneros), para Windows y Android. Proyecto
personal, sin fines comerciales; la música es de sus autores y suena desde YouTube.

## Descargar

- **Windows:** el instalador está en la sección
  [Releases](https://github.com/TerrikolaDigital/musicsippi/releases) de este repositorio.
- **Android:** el APK está en
  [TerrikolaDigital/musicsippi-android](https://github.com/TerrikolaDigital/musicsippi-android/releases/latest).
  La app avisa sola cuando hay una versión nueva.

## Sobre este código

Esto es una instantánea pública del código fuente, en un solo commit y sin el historial
de desarrollo. **No incluye `data/`** (la biblioteca personal, el historial de escucha y
las cachés), así que para compilar o arrancar en modo desarrollo hay que crear antes una
carpeta `data/` con al menos `ejes.json` y `biblioteca.json` (ver `docs/modelo-datos.md`).

## Cómo funciona

Reproductor por **modos de escucha**: ejes editables sobre una biblioteca
importada de Spotify, Amazon Music, YouTube Music, Deezer o un CSV. La reproducción va contra YouTube.

**Es solo audio.** El video nunca se muestra; para verlo hay un enlace (↗) en la barra que
lo abre en YouTube.

> Detalle de implementación que parece un bug pero no lo es: el iframe de YouTube se
> mantiene con tamaño real (320px) y se saca del viewport con `left: -10000px`, en vez de
> ocultarlo con `display: none` o achicarlo a 0×0. Con esas dos alternativas el navegador
> deja de componer el iframe y YouTube pausa la reproducción. Ver `.video` en
> `src/styles.css` — no lo "simplifiques" a `display: none`.

## Arrancar

```bash
npm run dev
```

Abre http://localhost:5173

## Para que suene: API key de YouTube

Sin la clave la interfaz funciona completa (modos, colas, editor de ejes), pero los tracks
no se resuelven a un video y no hay audio.

1. Seguir los pasos de `.env.local.ejemplo` para sacar la clave en Google Cloud
2. Pegarla en `.env.local`, después del `=` y sin comillas
3. Listo: Vite detecta el cambio y se reinicia solo

### Por qué la resolución es perezosa

La YouTube Data API da **10.000 unidades/día** y cada búsqueda cuesta **100** → unas
**100 búsquedas diarias**. Resolver una biblioteca de miles de tracks de una vez tardaría ~22 días, así que
la app resuelve **solo el track que va a sonar** y cachea el resultado para siempre en
`data/cache-youtube.json`. En uso normal se escuchan unos cientos de tracks y la cola larga
nunca se resuelve, que es exactamente lo que se quiere.

## Estructura

```
data/
  ejes.json           Los 13 ejes + bandeja de sistema. Editable desde la app.
  biblioteca.json     Tracks con sus asignaciones. Generado.
  descartados.json    Podcasts y canales filtrados en la importación.
  cache-youtube.json  videoId por track. Generado, no versionado.
scripts/
  importar.mjs        Bibliotecas .txt -> biblioteca.json
src/
  App.jsx             Modos, reproductor, sin clasificar, editor de ejes
  useYouTube.js       IFrame Player API
docs/
  modelo-datos.md     Esquema, reglas de edición y precedencia de clasificación
```

## Reimportar

```bash
npm run importar
```

Regenera `biblioteca.json` desde los `.txt` de `data/`. Preserva las asignaciones
`origen: "manual"` (`leerAsignacionesManuales()` + `combinar()`): se reimporta sin
pisar el trabajo de clasificación hecho a mano.

## Pendiente

- PWA instalable: manifest + service worker ya están (`public/site.webmanifest`,
  `public/sw.js`); falta validar el prompt de instalación en un navegador real
  (no funciona sobre HTTPS/LAN sin certificado, solo en `localhost`).

Descartado: descubrimiento vía SoundCloud — desde 2026 exige tener SoundCloud
Artist Pro (pago) para conseguir la API key, no vale la pena el costo para lo
que aporta.

Ya resuelto, sin pendiente:

- Enriquecimiento del clasificador (Last.fm + embeddings + búsqueda web): casi
  todo lo que quedaba sin clasificar ahora tiene modo.
- "Modo radio": el botón **Infinito** del Home (antes "Sorpréndeme") ya cumple esa
  función — mezcla toda la biblioteca y la cola avanza en loop, sin depender de
  streams externos.

## Genius (guardado para uso futuro, sin UI todavía)

```bash
node scripts/enriquecer-genius.mjs
```

Guarda el id/URL de la página de cada track en Genius en
`data/metadata-genius.json` (no trae letra — la API de Genius no la da, solo
metadata y anotaciones). Requiere `GENIUS_ACCESS_TOKEN` en `.env.local`, ver
`.env.local.ejemplo`. Corre solo, como última etapa del enriquecimiento
automático en background (después de Deezer y MusicBrainz) — sin el token
configurado se omite en silencio, con un aviso en la consola del servidor.
Este script (`node scripts/enriquecer-genius.mjs`) sigue disponible aparte,
para correrlo a mano o ver el informe con `--informe`.
