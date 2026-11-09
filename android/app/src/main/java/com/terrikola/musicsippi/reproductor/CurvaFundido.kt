package com.terrikola.musicsippi.reproductor

import kotlin.math.PI
import kotlin.math.sin

/**
 * Factor de volumen (0..1) del fundido entre canciones. Lógica pura, sin Android, con test.
 * El fundido total de N s se reparte: la canción que acaba baja durante N/2 y la siguiente
 * sube durante N/2 (curva suave). En el corte el volumen vale [PISO] (la mitad), no cero.
 */
object CurvaFundido {
    /**
     * @param salida hay fundido de salida (la pista tiene siguiente fundible)
     * @param entrada la pista entró con fundido (viene de una transición fundible)
     * @param totalMs duración total configurada del fundido; 0 = apagado
     */
    @JvmStatic
    fun factor(posicionMs: Long, duracionMs: Long, totalMs: Long, salida: Boolean, entrada: Boolean): Float {
        if (totalMs <= 0L) return 1f
        // En pistas cortas cada mitad no puede pasar de la mitad de la pista.
        var mitad = totalMs / 2
        if (duracionMs > 0) mitad = minOf(mitad, duracionMs / 2)
        if (mitad <= 0L) return 1f
        var f = 1f
        if (entrada && posicionMs < mitad) f = minOf(f, curva(posicionMs.toFloat() / mitad))
        if (salida && duracionMs > 0) {
            val resto = duracionMs - posicionMs
            if (resto < mitad) f = minOf(f, curva(resto.toFloat() / mitad))
        }
        return f
    }

    /**
     * ¿La pista que entra tras un salto de posición sube con fundido? ExoPlayer avisa del salto antes que
     * de la transición: decidirlo solo en la transición deja un instante a volumen pleno en mitad del fundido.
     * Dentro de la misma pista (repetir, saltar) no cambia nada.
     */
    @JvmStatic
    fun entradaTrasSalto(automatico: Boolean, idAntes: String?, idDespues: String?, fundible: Boolean, entradaActual: Boolean): Boolean =
        if (idAntes == idDespues) entradaActual else automatico && fundible

    /** Volumen mínimo en el corte entre canciones: a la mitad, nunca a cero (con cero se oía un hueco, sobre todo con cascos). */
    const val PISO = 0.5f

    private fun curva(x: Float): Float = PISO + (1f - PISO) * sin(x.coerceIn(0f, 1f) * (PI.toFloat() / 2f))
}
