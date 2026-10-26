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
4. En la raíz: `npm run publicar-version -- --base-url https://github.com/<usuario>/<repo>/releases/latest/download --notas "Arreglo A|Mejora B"`
   Genera `dist-publicar/musicsippi-<versionName>.apk` y `dist-publicar/version.json` (carpeta ignorada por git). Sin `--notas` usa los asuntos de commit desde la última versión. No sube nada. No hagas commits entre el paso 3 y el 4 (el nombre sale del conteo actual).
5. Sube los dos archivos:
   - **GitHub Releases**: crea una release (tag p. ej. `v1.<n>`) y adjunta el APK y `version.json`. La URL `releases/latest/download/version.json` siempre apunta a la última.
   - **Web propia**: sube ambos a la misma carpeta y usa su URL en `--base-url` y `URL_MANIFIESTO`.
6. Un APK con versionCode mayor se instala encima del anterior conservando los datos.

Campo opcional `minimo` en `version.json`: si el versionCode instalado es menor, el aviso no se puede posponer ni omitir.

## Obtainium (opcional)

[Obtainium](https://github.com/ImranR98/Obtainium) vigila la release de GitHub y actualiza el APK por su cuenta: añade la URL del repositorio como fuente. Funciona sin tocar `URL_MANIFIESTO`.

## IMPORTANTE: copia de seguridad de la firma

Android solo instala una actualización si va firmada con la MISMA clave. La clave está fuera del repo: `~/.musicsippi/firma.properties` y el `.jks` que indica. Haz copia de ambos en un sitio seguro y privado (gestor de contraseñas, disco cifrado). Si se pierde, nadie podrá actualizar encima: habría que desinstalar (perdiendo datos locales sin copia) e instalar una app firmada con otra clave. Nunca los subas al repo ni a una release.
