package com.terrikola.musicsippi.reproductor

/** Decisiones puras de «escuchar sin conexión» (sin Android, se prueban en JVM). */
object PlanSinConexion {
    const val PREFIJO = "sc:"

    data class Guardada(val id: String, val bytes: Long)

    fun clave(id: String, itag: String): String = "$PREFIJO$id:$itag"

    /** Id de vídeo de una clave `sc:<id>:<itag>`, o null si no es nuestra. */
    fun idDeClave(clave: String): String? {
        if (!clave.startsWith(PREFIJO)) return null
        val resto = clave.removePrefix(PREFIJO)
        val corte = resto.lastIndexOf(':')
        return if (corte > 0) resto.substring(0, corte) else null
    }

    /**
     * Canción a borrar para hacer sitio: primero cualquiera fuera de la selección
     * (la de más bytes); si no, la de la selección con mayor índice posterior a la
     * actual. Null si no hay nada desalojable (nunca la actual ni las anteriores). La
     * [protegida] (la que suena ahora mismo) tampoco se toca: borrarla rompería la reproducción.
     */
    fun victima(guardadas: List<Guardada>, seleccion: List<String>, indiceActual: Int, protegida: String? = null): String? {
        val candidatas = guardadas.filter { it.id != protegida }
        candidatas.filter { it.id !in seleccion }.maxByOrNull { it.bytes }?.let { return it.id }
        return candidatas
            .map { it.id to seleccion.indexOf(it.id) }
            .filter { it.second > indiceActual }
            .maxByOrNull { it.second }?.first
    }

    /** Con red, todas las pendientes; sin red, solo las que ya están guardadas. */
    fun pendientesUsables(ids: List<String>, guardada: (String) -> Boolean, hayRed: Boolean): List<String> =
        if (hayRed) ids else ids.filter(guardada)

    const val BATERIA_MINIMA = 20

    /** Condiciones para descargar: activado, wifi libre, batería suficiente o cargando, y app visible o sonando. */
    fun puedeDescargar(
        activado: Boolean, wifiLibre: Boolean, bateriaPct: Int, cargando: Boolean,
        appVisible: Boolean, sonando: Boolean,
    ): Boolean = activado && wifiLibre && (bateriaPct >= BATERIA_MINIMA || cargando) && (appVisible || sonando)

    /** Pausa entre canciones descargadas: no pedir resoluciones a YouTube en ráfaga. */
    const val PAUSA_ENTRE_CANCIONES_MS = 20_000L
    const val FALLOS_SEGUIDOS_MAX = 3
    const val ESPERA_TRAS_CORTE_MS = 5 * 60_000L
    const val CADUCIDAD_FALLIDA_MS = 30 * 60_000L

    /** Espera antes de la siguiente canción: la pausa base, que se duplica por cada fallo seguido. */
    fun esperaMs(fallosSeguidos: Int): Long = PAUSA_ENTRE_CANCIONES_MS shl fallosSeguidos.coerceIn(0, 4)

    /** Una canción marcada como fallida deja de contar pasado un rato (la causa suele ser transitoria). */
    fun fallidaVigente(desdeMs: Long, ahoraMs: Long): Boolean = ahoraMs - desdeMs < CADUCIDAD_FALLIDA_MS

    /**
     * ¿JS puede volver a resolver la pista tras el error? De la caché solo con red (si no, no hay
     * alternativa); de la red, si la URL firmada caducó (403/410).
     */
    fun errorRecuperable(deCache: Boolean, hayRed: Boolean, http: Int): Boolean =
        if (deCache) hayRed else http == 403 || http == 410

    /** Vale sin red: guardada (clave `sc:`) o archivo local (`content://`). */
    fun reproducibleSinRed(claveCache: String?, esquema: String?): Boolean =
        claveCache?.startsWith(PREFIJO) == true || esquema == "content"

    /**
     * ¿Conservar la URI que ya suena en vez de adaptar el ítem a la caché? Sí si es la misma pista
     * con la misma URI (solo cambia la metadata) y la actual no viene de la caché: cambiar la URI
     * re-prepara el player (corte audible). Una URI distinta (p. ej. re-resuelta tras un 403) se respeta.
     */
    fun conservarUriActual(
        mediaIdNuevo: String, uriNueva: String?, mediaIdActual: String?, uriActual: String?, claveCacheActual: String?
    ): Boolean =
        mediaIdActual != null && mediaIdNuevo == mediaIdActual && uriNueva != null && uriNueva == uriActual &&
            claveCacheActual?.startsWith(PREFIJO) != true
}
