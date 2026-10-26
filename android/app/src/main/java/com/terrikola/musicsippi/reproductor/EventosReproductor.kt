package com.terrikola.musicsippi.reproductor

import com.getcapacitor.JSObject

/**
 * Puente service -> plugin. El PlaybackService vive más que la actividad
 * (sigue sonando con la app cerrada), así que no puede tener una referencia
 * fuerte al plugin: emite aquí y, si hay un oyente conectado (la WebView
 * viva), el plugin lo reenvía a JS; si no, el evento se descarta.
 *
 * Los dos viven en el mismo proceso, por eso basta con un objeto estático.
 */
object EventosReproductor {
    @Volatile
    var oyente: ((nombre: String, datos: JSObject) -> Unit)? = null

    fun emitir(nombre: String, datos: JSObject) {
        oyente?.invoke(nombre, datos)
    }
}
