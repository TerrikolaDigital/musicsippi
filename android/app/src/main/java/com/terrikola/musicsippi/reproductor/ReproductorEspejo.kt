package com.terrikola.musicsippi.reproductor

import android.net.Uri
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.getcapacitor.JSObject
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Player "espejo": NO reproduce nada. El audio lo suena el iframe oficial de
 * YouTube dentro del WebView; este player solo refleja su estado (lo empuja JS
 * con [actualizar]) para que Media3 muestre la notificacion, promueva el
 * servicio a foreground y exponga los controles de pantalla de bloqueo /
 * Bluetooth. Cualquier orden del sistema (play, pausa, seek, siguiente...) se
 * reenvia a JS como evento "comando" y es JS quien actua sobre el iframe.
 */
@OptIn(UnstableApi::class)
class ReproductorEspejo(looper: Looper) : SimpleBasePlayer(looper) {

    data class Datos(
        val sonando: Boolean = false,
        val estado: String = "listo", // listo | cargando | terminado
        val posicionMs: Long = 0L,
        val duracionMs: Long = 0L,
        val titulo: String? = null,
        val artista: String? = null,
        val portadaUrl: String? = null,
        val haySiguiente: Boolean = true,
        val hayAnterior: Boolean = true,
        val hayPista: Boolean = false
    )

    private var datos = Datos()

    /** Hilo principal. */
    fun actualizar(nuevos: Datos) {
        datos = nuevos
        invalidateState()
    }

    private fun comando(accion: String, ms: Long? = null) {
        val o = JSObject().put("accion", accion)
        if (ms != null) o.put("ms", ms)
        EventosReproductor.emitir("comando", o)
    }

    override fun getState(): State {
        val d = datos
        val comandos = Player.Commands.Builder().addAll(
            Player.COMMAND_PLAY_PAUSE,
            Player.COMMAND_PREPARE,
            Player.COMMAND_STOP,
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_MEDIA_ITEM,
            Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
            Player.COMMAND_GET_TIMELINE,
            Player.COMMAND_GET_METADATA
        ).build()

        val b = State.Builder().setAvailableCommands(comandos)
        if (!d.hayPista) {
            return b.setPlaybackState(Player.STATE_IDLE).setPlayWhenReady(false, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST).build()
        }

        // Playlist de relleno [anterior?, actual, siguiente?]: sin vecinos
        // Media3 no dibuja los botones de anterior/siguiente ni deja saltar.
        val items = mutableListOf<MediaItemData>()
        if (d.hayAnterior) items += MediaItemData.Builder("anterior").setIsSeekable(false).build()
        val indiceActual = items.size
        val meta = MediaMetadata.Builder()
            .setTitle(d.titulo)
            .setArtist(d.artista)
            .apply {
                if (!d.portadaUrl.isNullOrBlank()) setArtworkUri(Uri.parse(d.portadaUrl))
                if (d.duracionMs > 0) setDurationMs(d.duracionMs)
            }
            .build()
        items += MediaItemData.Builder("actual")
            .setMediaItem(MediaItem.Builder().setMediaId("actual").setMediaMetadata(meta).build())
            .setMediaMetadata(meta)
            .setIsSeekable(d.duracionMs > 0)
            .apply { if (d.duracionMs > 0) setDurationUs(d.duracionMs * 1000L) }
            .build()
        if (d.haySiguiente) items += MediaItemData.Builder("siguiente").setIsSeekable(false).build()

        val estado = when (d.estado) {
            "terminado" -> Player.STATE_ENDED
            "cargando" -> Player.STATE_BUFFERING
            else -> Player.STATE_READY
        }
        val posicion = d.posicionMs.coerceAtLeast(0L)
        return b
            .setPlaylist(items)
            .setCurrentMediaItemIndex(indiceActual)
            .setPlayWhenReady(d.sonando, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(estado)
            // Extrapolada: la barra de progreso avanza sola entre empujones de JS.
            .setContentPositionMs(
                if (d.sonando && estado == Player.STATE_READY) PositionSupplier.getExtrapolating(posicion, 1f)
                else PositionSupplier.getConstant(posicion)
            )
            .build()
    }

    // ---- Ordenes del sistema -> JS -----------------------------------------

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        // Optimista: evita el parpadeo del boton hasta que JS confirme.
        datos = datos.copy(sonando = playWhenReady)
        comando(if (playWhenReady) "play" else "pause")
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        comando("pause")
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        val actual = if (datos.hayAnterior) 1 else 0
        when {
            seekCommand == Player.COMMAND_SEEK_TO_NEXT ||
                seekCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ||
                mediaItemIndex > actual -> comando("siguiente")
            seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ||
                mediaItemIndex < actual -> comando("anterior")
            else -> {
                val ms = if (positionMs == C.TIME_UNSET) 0L else positionMs
                datos = datos.copy(posicionMs = ms)
                comando("buscar", ms)
            }
        }
        return Futures.immediateVoidFuture()
    }

    override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()
}
