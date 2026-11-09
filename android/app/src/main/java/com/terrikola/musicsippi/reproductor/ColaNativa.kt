package com.terrikola.musicsippi.reproductor

/**
 * Decisiones puras sobre la cola nativa (sin Android): se prueban en JVM.
 * La cola completa vive en JS, pero el player conserva la pista actual, las
 * siguientes ya resueltas y (desde que JS las manda) la anterior, para que
 * ⏮ / ⏭ funcionen con el WebView dormido.
 */
object ColaNativa {
    /** Pasados estos ms, «anterior» vuelve al inicio de la pista (comportamiento estándar de los reproductores). */
    const val UMBRAL_REINICIO_MS = 3_000L

    /** A esta distancia del final, sin siguiente en cola, el servicio la busca él mismo (JS puede estar dormido). */
    const val ANTICIPO_RELLENO_MS = 30_000L

    /** Reintentos de una pendiente que no se pudo resolver, y espera entre ellos, antes de pasar a la siguiente. */
    const val REINTENTOS_RELLENO = 2
    const val ESPERA_RELLENO_MS = 15_000L

    /** Veces que el servicio vuelve a resolver una pista que falló con la app oculta, antes de saltarla. */
    const val REINTENTOS_SIN_JS = 2

    enum class Anterior { REINICIAR, ANTERIOR_NATIVA, PEDIR_A_JS }

    enum class TrasError { RESOLVER_DE_NUEVO, SALTAR }

    /** Lo que se quitó de la cola al perder la red vuelve delante de las pendientes, sin duplicar. */
    fun <T> devolverAPendientes(quitadas: List<T>, pendientes: List<T>, id: (T) -> String): List<T> {
        val ids = quitadas.map(id).toSet()
        return quitadas + pendientes.filter { id(it) !in ids }
    }

    /** ¿Se conserva una pendiente que no se resolvió? Sí hasta agotar los reintentos: un fallo puntual no acorta la cola. */
    fun reintentarRelleno(fallos: Int): Boolean = fallos < REINTENTOS_RELLENO

    /** Error con la app oculta (JS no puede recuperarlo): resolver otra vez si tiene sentido; si no, pasar a la siguiente. */
    fun trasErrorSinJs(intentos: Int, hayRed: Boolean, archivoLocal: Boolean): TrasError =
        if (hayRed && !archivoLocal && intentos < REINTENTOS_SIN_JS) TrasError.RESOLVER_DE_NUEVO else TrasError.SALTAR

    private val ID_DE_VIDEO = Regex("[A-Za-z0-9_-]{11}")

    /** Miniatura del vídeo para las canciones sin portada; null si [id] no es de YouTube (archivo local, id por defecto). */
    fun portadaDeVideo(id: String?): String? =
        id?.takeIf(ID_DE_VIDEO::matches)?.let { "https://i.ytimg.com/vi/$it/hqdefault.jpg" }

    /** ¿Toca resolver ya la siguiente pendiente? Solo si no queda nada detrás y la duración es conocida. */
    fun adelantarRelleno(quedan: Int, posicionMs: Long, duracionMs: Long): Boolean =
        quedan == 0 && duracionMs > 0 && duracionMs - posicionMs <= ANTICIPO_RELLENO_MS

    /** Qué hace «anterior»: reiniciar si ya pasaron >3 s; si no, ir a la anterior de la cola nativa; si no hay, preguntar a JS. */
    fun accionAnterior(posicionMs: Long, indiceActual: Int): Anterior = when {
        posicionMs > UMBRAL_REINICIO_MS -> Anterior.REINICIAR
        indiceActual > 0 -> Anterior.ANTERIOR_NATIVA
        else -> Anterior.PEDIR_A_JS
    }

    /** [quitarInicio] pistas a borrar desde el índice 0; si [anadir], luego se insertan las deseadas en el 0. */
    data class PlanAnteriores(val quitarInicio: Int, val anadir: Boolean)

    /**
     * Deja delante de la pista actual exactamente [deseadas] (ids, de la más lejana a la más cercana).
     * Si las últimas existentes ya coinciden se conservan (sin reabrir nada) y solo se recorta el historial viejo.
     */
    fun planAnteriores(existentes: List<String>, deseadas: List<String>): PlanAnteriores =
        if (existentes.takeLast(deseadas.size) == deseadas) PlanAnteriores(existentes.size - deseadas.size, false)
        else PlanAnteriores(existentes.size, deseadas.isNotEmpty())

    /**
     * Posiciones de la cola a las que va la metadata que manda JS para la pista [id]: todas las que
     * suenan con ese id (puede repetirse) y ninguna otra. Si JS describe una pista que el nativo aún
     * no tiene (está resolviéndola), no se toca nada: la metadata llegará con su carga. Sin [id]
     * (versión vieja de JS) va a la actual, como antes.
     */
    fun indicesParaMetadata(ids: List<String>, indiceActual: Int, id: String?): List<Int> = when {
        id == null -> if (indiceActual in ids.indices) listOf(indiceActual) else emptyList()
        else -> ids.indices.filter { ids[it] == id }
    }
}
