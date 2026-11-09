package com.terrikola.musicsippi.reproductor

/**
 * Decisiones puras del «modo señal débil» (sin Android, se prueban en JVM). Ver
 * docs/superpowers/specs/2026-10-27-senal-intermitente-design.md.
 *
 * Si la pista que suena se queda sin datos: gracia de [GRACIA_MS] reintentando en la misma
 * posición; luego suenan guardadas del respaldo (mismo mood, luego cualquiera) y, cuando la
 * prueba de salida confirma que hay señal, al acabar la guardada se vuelve a la interrumpida
 * donde se cortó. Sin respaldo, se espera en pausa y se sigue sola al volver la red.
 */
object PlanSenalDebil {
    const val GRACIA_MS = 8_000L
    const val REINTENTO_GRACIA_MS = 2_500L
    /** Cargando sin sonar este rato en una pista de red cuenta como gracia vencida (el socket puede colgarse sin error). */
    const val ESTANCADO_MS = 10_000L
    const val SONDEO_MS = 15_000L
    const val SONDEO_LENTO_MS = 60_000L
    const val FALLOS_PARA_SONDEO_LENTO = 2
    /** Prueba de salida: el primer trozo de la interrumpida tiene que llegar entero. */
    const val BYTES_PRUEBA = 1L shl 20
    const val MAX_RECIENTES = 10
    /** Siguiente sin pista en la cola nativa: lo que tarda JS en contestar antes de que el servicio rellene solo. */
    const val ESPERA_JS_MS = 2_000L
    const val AVISO = "Sin señal: sonando música guardada"

    enum class Fase { NORMAL, GRACIA, RESPALDO, ESPERANDO }

    // Códigos de PlaybackException (literales para no depender de Media3 en los tests).
    private const val IO_UNSPECIFIED = 2000
    private const val IO_NETWORK_CONNECTION_FAILED = 2001
    private const val IO_NETWORK_CONNECTION_TIMEOUT = 2002

    /** ¿El error es de falta de datos (no de la pista ni de la URL)? Esos los recupera el servicio, no JS. */
    fun esErrorDeRed(codigo: Int, causa: Throwable?): Boolean = when (codigo) {
        IO_NETWORK_CONNECTION_FAILED, IO_NETWORK_CONNECTION_TIMEOUT -> true
        // Lectura que se corta a mitad de una pista de red: casi siempre es la señal. Un fin de archivo, no.
        IO_UNSPECIFIED -> generateSequence(causa) { it.cause }.take(8).let { cadena ->
            cadena.any { it is java.io.IOException } && cadena.none { it is java.io.EOFException }
        }
        else -> false
    }

    /** Cortada a menos de esto del final: lo que no cargó era la siguiente, no esta. */
    const val MARGEN_FINAL_MS = 5_000L

    /**
     * Dónde retomar al volver la señal: si se cortó en los últimos segundos (la actual ya estaba entera y
     * falló la carga de la siguiente), se sigue con la siguiente desde el principio.
     */
    fun puntoDeVuelta(indice: Int, posicionMs: Long, duracionMs: Long, total: Int): Pair<Int, Long> =
        if (duracionMs > 0 && duracionMs - posicionMs <= MARGEN_FINAL_MS && indice + 1 < total) (indice + 1) to 0L
        else indice to posicionMs

    fun graciaVencida(desdeMs: Long, ahoraMs: Long): Boolean = ahoraMs - desdeMs >= GRACIA_MS

    fun faseTrasGracia(hayRespaldo: Boolean): Fase = if (hayRespaldo) Fase.RESPALDO else Fase.ESPERANDO

    /**
     * Guardada que suena después: la primera del respaldo que no sonó hace poco ni es la actual; si todas
     * sonaron, la que sonó hace más tiempo. Con una sola se repite (mejor que el silencio).
     */
    fun siguienteRespaldo(respaldo: List<String>, recientes: List<String>, actual: String?): String? {
        if (respaldo.isEmpty()) return null
        respaldo.firstOrNull { it != actual && it !in recientes }?.let { return it }
        return respaldo.filter { it != actual }.minByOrNull { recientes.indexOf(it) } ?: respaldo.first()
    }

    /** Recientes de la más vieja a la más nueva, sin repetidas y con tope. */
    fun anotarReciente(recientes: List<String>, id: String): List<String> =
        (recientes.filter { it != id } + id).takeLast(MAX_RECIENTES)

    /** El respaldo de JS (por mood) si alguna sigue guardada; si no, cualquier guardada. */
    fun respaldoEfectivo(deJs: List<String>, guardadas: List<String>, completa: (String) -> Boolean): List<String> =
        deJs.filter(completa).ifEmpty { guardadas.filter(completa) }

    enum class AlPasar { VOLVER, SEGUIR }

    /** Al acabar (o saltar hacia delante) una guardada: con la señal confirmada se vuelve a la interrumpida. */
    fun alPasarDeGuardada(senalConfirmada: Boolean, haciaDelante: Boolean): AlPasar =
        if (senalConfirmada && haciaDelante) AlPasar.VOLVER else AlPasar.SEGUIR

    /** «Anterior» en el modo: ¿reiniciar la guardada actual? Sí pasados 3 s o si es la primera (la interrumpida no tiene datos). */
    fun anteriorEnModo(posicionMs: Long, indice: Int): Boolean =
        ColaNativa.accionAnterior(posicionMs, indice) != ColaNativa.Anterior.ANTERIOR_NATIVA

    fun intervaloSondeo(fallosSeguidos: Int): Long =
        if (fallosSeguidos >= FALLOS_PARA_SONDEO_LENTO) SONDEO_LENTO_MS else SONDEO_MS

    fun estancado(bufferingDesdeMs: Long?, ahoraMs: Long, deRed: Boolean): Boolean =
        deRed && bufferingDesdeMs != null && ahoraMs - bufferingDesdeMs >= ESTANCADO_MS

    /** Subtítulo de la notificación para una guardada del modo. */
    fun artistaEnModo(artista: String?): String =
        if (artista.isNullOrBlank()) AVISO else "Sin señal · $artista"
}
