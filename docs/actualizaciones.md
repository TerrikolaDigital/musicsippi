# Actualizaciones de la app Android

La app comprueba al abrir (como mucho cada 12 h y solo con red) un `version.json` y, si hay una versión mayor, muestra «Nueva versión disponible» con las notas y los botones Descargar / Más tarde (3 días) / Omitir esta versión. En Ajustes › Acerca de hay «Buscar actualizaciones» manual y la versión instalada. Sin nada configurado, todo esto queda desactivado.

## Versionado

`android/app/build.gradle`: `versionCode` = número de commits (`git rev-list --count HEAD`) y `versionName` = `1.<versionCode>`. Crece solo con cada commit. Se puede forzar con `-PversionCodeManual=N`. Sin git el código sería 1 (no actualizaría nada): compila siempre desde el repo.

## Activar el comprobador

Edita la constante `URL_MANIFIESTO` en `src/data/actualizaciones.js` (único sitio). Debe apuntar al `version.json` público, por ejemplo:
`https://github.com/<usuario>/<repo>/releases/latest/download/version.json`

## Publicar una versión

1. Haz commit de todo (el versionCode sale del número de commits).
2. En la raíz: `npm run build:android`.
3. En `android/`: `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease`.
4. En la raíz: `npm run publicar-version -- --notas "Arreglo A|Mejora B"`
   Genera en `dist-publicar/` (carpeta ignorada por git) **tres** archivos: `musicsippi-<versionName>.apk`, `Musicsippi.apk` (el mismo APK con nombre fijo, ver «Enlaces que no cambian») y `version.json`. Sin `--notas` usa los asuntos de commit desde la última versión. La dirección de descarga del `version.json` sale sola del número de versión (`…/releases/download/v1.<n>/…`); `--base-url` solo hace falta para publicar en otro sitio. No sube nada. No hagas commits entre el paso 3 y el 4 (el nombre sale del conteo actual).
5. Sube los tres archivos (es público y difícil de deshacer: solo con el sí del usuario):
   - **GitHub Releases**: copia la orden `gh release create v1.<n> …` que imprime el paso 4. Nombra los tres archivos uno a uno; si en la carpeta quedan APK de otra versión, el script avisa para no subirlos.
   - **Web propia**: sube los tres a la misma carpeta y usa su URL en `--base-url` y `URL_MANIFIESTO`.
6. Comprueba los enlaces: `npm run comprobar-descargas` (solo lee). Tiene que acabar en «Todos los enlaces de descarga responden»; si dice FALLA, a la release le falta un archivo.
7. Un APK con versionCode mayor se instala encima del anterior conservando los datos.

## Enlaces que no cambian (compartir, QR)

Lo que se comparte con otras personas no lleva número de versión, así que sirve para siempre:

- Android: `https://github.com/TerrikolaDigital/musicsippi-android/releases/latest/download/Musicsippi.apk`
- Windows: `https://github.com/TerrikolaDigital/musicsippi/releases/latest/download/Musicsippi-Setup.exe`

Son los de Ajustes › «Compartir Musicsippi» (`DESCARGA_ANDROID` y `DESCARGA_WINDOWS` en `src/movil/compartir-salida.js`). GitHub los resuelve buscando, en la última release, un archivo con **ese nombre exacto**: si la release no lo lleva, dan error 404. Pasó con la 1.800, que se subió sin `Musicsippi.apk` (la copia se hacía a mano). Desde entonces el paso 4 genera la copia y el paso 6 lo comprueba; un test ata el nombre del archivo al enlace.

No compartas direcciones con `/releases/tag/v1.<n>` o `/releases/download/v1.<n>/…` (las que salen al copiar desde la página de GitHub): esas sí son de una versión concreta y se quedan viejas.

**Ordenador (Windows):** la copia `Musicsippi-Setup.exe` todavía se hace a mano al publicar (copiar `Musicsippi Setup <versión>.exe` con ese nombre y subir los dos). `npm run comprobar-descargas` también vigila ese enlace.

Campo opcional `minimo` en `version.json`: si el versionCode instalado es menor, el aviso no se puede posponer ni omitir.

## Obtainium (opcional)

[Obtainium](https://github.com/ImranR98/Obtainium) vigila la release de GitHub y actualiza el APK por su cuenta: añade la URL del repositorio como fuente. Funciona sin tocar `URL_MANIFIESTO`.

## IMPORTANTE: copia de seguridad de la firma

Android solo instala una actualización si va firmada con la MISMA clave. La clave está fuera del repo: `~/.musicsippi/firma.properties` y el `.jks` que indica. Haz copia de ambos en un sitio seguro y privado (gestor de contraseñas, disco cifrado). Si se pierde, nadie podrá actualizar encima: habría que desinstalar (perdiendo datos locales sin copia) e instalar una app firmada con otra clave. Nunca los subas al repo ni a una release.
