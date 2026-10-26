package com.terrikola.musicsippi.reproductor

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener

/**
 * Pide el audio de googlevideo en rangos acotados.
 *
 * ExoPlayer abre las pistas progresivas con "Range: bytes=N-" (sin final) y
 * googlevideo responde 403 a esas peticiones abiertas para las URLs de los
 * clientes móviles; con un final explícito ("bytes=N-M") responde 206.
 * Comprobado el 2026-10-14 con la misma URL: abierta 403, acotada 206.
 *
 * Esta fuente parte la lectura en trozos de [TAMANO_TROZO] y va abriendo el
 * siguiente cuando se agota el anterior, de modo que para ExoPlayer es un
 * único flujo continuo (los seeks abren una fuente nueva en otra posición).
 * El largo total sale del parámetro `clen` de la URL; si no está, se delega
 * tal cual en la fuente original.
 */
@OptIn(UnstableApi::class)
class FuenteTroceada(private val origen: DataSource) : DataSource {

    private var especBase: DataSpec? = null
    private var posicion = 0L
    private var limite = 0L // byte siguiente al último que hay que leer
    private var finTrozo = 0L
    private var abierta = false
    private var troceando = false

    override fun addTransferListener(listener: TransferListener) = origen.addTransferListener(listener)

    override fun open(especOriginal: DataSpec): Long {
        val propias = PlaybackService.cabecerasDe(especOriginal.uri.toString())
        val dataSpec = if (propias.isEmpty()) especOriginal
        else especOriginal.withAdditionalHeaders(propias)
        val total = dataSpec.uri.getQueryParameter("clen")?.toLongOrNull()
        val conLargo = dataSpec.length != C.LENGTH_UNSET.toLong()
        troceando = total != null || conLargo
        if (!troceando) {
            abierta = true
            return origen.open(dataSpec)
        }
        especBase = dataSpec
        posicion = dataSpec.position
        limite = if (conLargo) dataSpec.position + dataSpec.length else total!!
        if (posicion >= limite) return 0
        abrirTrozo()
        return limite - dataSpec.position
    }

    private fun abrirTrozo() {
        val base = especBase ?: return
        finTrozo = minOf(posicion + trozoPara(base.uri.toString()), limite)
        origen.open(base.buildUpon().setPosition(posicion).setLength(finTrozo - posicion).build())
        abierta = true
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (!troceando) return origen.read(buffer, offset, length)
        if (posicion >= limite) return C.RESULT_END_OF_INPUT
        var leidos = origen.read(buffer, offset, length)
        if (leidos == C.RESULT_END_OF_INPUT) {
            origen.close()
            abierta = false
            // El servidor puede entregar menos de lo pedido: se sigue desde
            // donde quedó, no desde finTrozo.
            if (posicion >= limite) return C.RESULT_END_OF_INPUT
            abrirTrozo()
            leidos = origen.read(buffer, offset, length)
            if (leidos == C.RESULT_END_OF_INPUT) return C.RESULT_END_OF_INPUT
        }
        posicion += leidos
        return leidos
    }

    override fun getUri(): Uri? = origen.uri

    override fun getResponseHeaders(): Map<String, List<String>> = origen.responseHeaders

    override fun close() {
        if (abierta) origen.close()
        abierta = false
        especBase = null
    }

    class Factory(private val origen: DataSource.Factory) : DataSource.Factory {
        override fun createDataSource(): DataSource = FuenteTroceada(origen.createDataSource())
    }

    companion object {
        /**
         * Medido el 2026-10-14 con URLs del cliente IOS: rangos de 1 MB -> 206,
         * de 2 MB -> 403. Si YouTube baja el tope, este es el número a tocar.
         */
        const val TAMANO_TROZO = 1L * 1024 * 1024

        /** Como BitChord (PlayerClient.rangeBytesFor): ANDROID_VR y TVHTML5_SIMPLY solo aguantan 512 KB. */
        fun trozoPara(url: String): Long {
            val c = Uri.parse(url).getQueryParameter("c")?.uppercase()
            return if (c == "ANDROID_VR" || c?.startsWith("TVHTML5_SIMPLY") == true) TAMANO_TROZO / 2 else TAMANO_TROZO
        }
    }
}
