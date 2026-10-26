package com.terrikola.musicsippi.reproductor

import kotlin.math.PI
import kotlin.math.sin

/**
 * Factor de volumen (0..1) del fundido entre canciones. Lógica pura, sin Android, con test.
 * El fundido total de N s se reparte: la canción que acaba baja durante N/2 y la siguiente
 * sube durante N/2 (curva de potencia constante, suena más natural que una recta).
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

    private fun curva(x: Float): Float = sin(x.coerceIn(0f, 1f) * (PI.toFloat() / 2f))
}
