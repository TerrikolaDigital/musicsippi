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

    enum class Anterior { REINICIAR, ANTERIOR_NATIVA, PEDIR_A_JS }

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
}
