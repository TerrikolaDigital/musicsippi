package com.terrikola.musicsippi.reproductor

/** Decide qué salto de «siguiente» cuenta como rechazo rápido de la canción, y cuándo se dio una por oída. Puro, sin Android. */
object PlanSaltos {
    const val MIN_MS = 1_000L
    const val MAX_MS = 10_000L

    /** Igual que `FRACCION_REINICIA` de `src/movil/saltos.js`: oír MÁS de esto pone a cero el contador. */
    const val FRACCION_OIDA = 0.7

    /** Como en JS, en pausa no cuenta: solo si estaba listo para sonar y con la reproducción en marcha. */
    fun estaSonando(estadoListo: Boolean, playWhenReady: Boolean): Boolean = estadoListo && playWhenReady

    fun esSaltoRapido(posicionMs: Long, enError: Boolean, enModoSenal: Boolean, sonando: Boolean): Boolean =
        !enError && !enModoSenal && sonando && posicionMs >= MIN_MS && posicionMs < MAX_MS

    /** Umbral estricto (> 0,7), sin duración conocida no hay fracción. */
    fun esOidaCompleta(posicionMs: Long, duracionMs: Long, enError: Boolean, enModoSenal: Boolean): Boolean =
        !enError && !enModoSenal && duracionMs > 0 && posicionMs.toDouble() / duracionMs > FRACCION_OIDA
}
