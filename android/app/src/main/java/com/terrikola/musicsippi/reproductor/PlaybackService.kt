package com.terrikola.musicsippi.reproductor

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.getcapacitor.JSObject
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Servicio de reproducción: ExoPlayer + MediaSession. Media3 lo promueve a
 * foreground (tipo mediaPlayback, ver el manifest) cuando el reproductor
 * empieza a sonar y muestra la notificación con los controles del sistema.
 *
 * La cola completa vive en JS, pero el plugin mantiene en ExoPlayer la pista
 * actual + hasta 3 siguientes ya resueltas (encolarSiguientes). Así, con la
 * pantalla bloqueada y el WebView congelado, ExoPlayer avanza solo al
 * terminar y el botón siguiente de notificación/bloqueo/Bluetooth cambia de
 * pista de forma nativa (evento "transicion"). Solo cuando no hay siguiente
 * nativa (o para anterior si llevamos menos de 3 s) se reenvía el evento
 * "comando" a JS, que decide qué canción va.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var sesion: MediaSession? = null
    private var exo: ExoPlayer? = null
    private val principal = Handler(Looper.getMainLooper())

    private var ultimoEstado: String? = null
    private var huboError = false

    private val tickProgreso = object : Runnable {
        override fun run() {
            emitirProgreso()
            if (exo?.isPlaying == true) principal.postDelayed(this, 500)
        }
    }

    // ---- Fundido entre canciones (ver CurvaFundido) -----------------------
    // Un solo ExoPlayer: la canción que acaba baja de volumen y la siguiente sube al entrar.
    // No es un cruce con solapamiento (haría falta un segundo player y cambiar el de la sesión,
    // demasiado riesgo para la cola nativa, «repetir» y la pantalla bloqueada).
    private var entradaFundida = false

    private val tickFundido = object : Runnable {
        override fun run() {
            aplicarVolumen()
            if (exo?.isPlaying == true && fundidoMs > 0L) principal.postDelayed(this, 100)
        }
    }

    /** ¿Se funde al pasar a la pista [id]? No si se pidió «sin fundido en álbumes» y va encadenada. */
    private fun fundibleHacia(id: String?): Boolean =
        fundidoMs > 0L && !(sinFundidoAlbumes && id != null && id in encadenadas)

    private fun hayFundidoDeSalida(p: ExoPlayer): Boolean {
        if (fundidoMs <= 0L || p.repeatMode == Player.REPEAT_MODE_ONE || p.pauseAtEndOfMediaItems) return false
        val sig = p.currentMediaItemIndex + 1
        return sig < p.mediaItemCount && fundibleHacia(p.getMediaItemAt(sig).mediaId)
    }

    /** Volumen del player = (usuario × nivelación de la pista) × factor del fundido. */
    private fun aplicarVolumen() {
        val p = exo ?: return
        val base = volumenEfectivo(p.currentMediaItem?.mediaId)
        val dur = p.duration
        val f = if (fundidoMs <= 0L) 1f else CurvaFundido.factor(
            p.currentPosition, if (dur == C.TIME_UNSET) 0L else dur, fundidoMs, hayFundidoDeSalida(p), entradaFundida
        )
        p.volume = (base * f).coerceIn(0f, 1f)
    }

    private fun reiniciarTickFundido() {
        principal.removeCallbacks(tickFundido)
        principal.post(tickFundido)
    }

    override fun onCreate() {
        super.onCreate()

        val atributos = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        CacheSinConexion.init(this)
        RedSinConexion.init(this)
        RedSinConexion.agregarOyente(alCambiarRed)

        val reproductor = ExoPlayer.Builder(this)
            // DefaultDataSource elige la fuente por esquema: http(s) va a fuenteHttp (YouTube) y
            // content:// (archivos locales de SAF/MediaStore) se lee con ContentDataSource.
            // Las canciones guardadas (clave «sc:») salen de la caché cifrada, sin red.
            .setMediaSourceFactory(DefaultMediaSourceFactory(DataSource.Factory {
                FuenteSinConexion(
                    FuenteTroceada.Factory(DefaultDataSource.Factory(this, fuenteHttp)).createDataSource(),
                    CacheSinConexion.fabricaLectura().createDataSource()
                )
            }))
            .setAudioAttributes(atributos, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        reproductor.addListener(OyenteInterno())
        // «Repetir» vive en el player (persiste entre pistas): si JS lo pidió antes de que el servicio existiera, se aplica ya.
        reproductor.repeatMode = if (repetirUna) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        exo = reproductor
        // Ecualizador, graves y envolvente: se enganchan a la sesión de audio del player y se reaplican al recrear el servicio.
        EfectosAudio.adjuntar(this, reproductor.audioSessionId)

        val abrirApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        sesion = MediaSession.Builder(this, ReproductorConBotones(reproductor))
            .setId("musicsippi-nativo") // único en el proceso: ServicioEspejo tiene otra sesión
            .setCallback(CallbackSesion(this))
            .apply { if (abrirApp != null) setSessionActivity(abrirApp) }
            .build()
        actualizarBotonesPropios()

        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this)
                .build()
                .apply { setSmallIcon(com.terrikola.musicsippi.R.drawable.ic_stat_musicsippi) }
        )
        ResolutorYouTube.init(this)
        instancia = this
    }

    // ---- Relleno nativo de la cola ----------------------------------------
    // JS manda (encolarSiguientes) las 3 siguientes resueltas + una lista de
    // "pendientes" (solo videoId y metadata). Si la app se quita de recientes o
    // el WebView duerme mucho rato, el servicio resuelve él mismo la siguiente
    // pendiente con InnerTubeX cuando quedan menos de 2 en cola: la música no
    // se acaba a las 3 canciones.

    // ---- Temporizador para dormir (ver fijarTemporizador) ------------------
    private var finTemporizadorMs = 0L

    private val pausaTemporizador = Runnable {
        exo?.pause()
        finTemporizadorMs = 0L
        emitirTemporizador()
    }

    private fun emitirTemporizador() {
        val datos = JSObject().put("alFinal", exo?.pauseAtEndOfMediaItems == true)
        if (finTemporizadorMs > 0) datos.put("finMs", finTemporizadorMs)
        EventosReproductor.emitir("temporizador", datos)
    }

    private val alcance = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO
    )
    private var rellenando = false

    /**
     * Sin red (p. ej. pantalla bloqueada): lo ya encolado detrás de la actual con URL de red dejaría de
     * sonar con un error en cuanto se agote lo descargado. Se quita, o se pasa a la caché si ya está completo.
     */
    private val alCambiarRed: (Boolean, Boolean) -> Unit = { hayRed, _ ->
        if (!hayRed) principal.post { quitarLoNoReproducibleSinRed() }
    }

    private fun quitarLoNoReproducibleSinRed() {
        val p = exo ?: return
        if (RedSinConexion.hayRed) return
        val actual = p.currentMediaItemIndex
        if (actual < 0) return
        for (i in p.mediaItemCount - 1 downTo actual + 1) {
            val item = p.getMediaItemAt(i)
            if (esReproducibleSinRed(item)) continue
            if (CacheSinConexion.completa(item.mediaId)) p.replaceMediaItem(i, CacheSinConexion.adaptar(item))
            else p.removeMediaItem(i)
        }
        rellenar()
    }

    private fun esReproducibleSinRed(item: MediaItem): Boolean {
        val lc = item.localConfiguration
        return PlanSinConexion.reproducibleSinRed(lc?.customCacheKey, lc?.uri?.scheme)
    }

    private fun rellenar() {
        val p = exo ?: return
        if (rellenando || p.mediaItemCount == 0) return
        val quedan = p.mediaItemCount - 1 - p.currentMediaItemIndex
        if (quedan >= MIN_EN_COLA) return
        val enCola = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).mediaId }.toSet()
        // Sin red solo valen las ya guardadas; el resto se descarta de la lista.
        val usables = PlanSinConexion.pendientesUsables(pendientes.map { it.id }, CacheSinConexion::completa, RedSinConexion.hayRed).toSet()
        pendientes = pendientes.filter { it.id in usables }
        val siguiente = pendientes.firstOrNull { it.id !in enCola } ?: return
        rellenando = true
        alcance.launch {
            val item = try {
                if (CacheSinConexion.completa(siguiente.id)) {
                    fijarGanancia(siguiente.id, gananciaDesdeSonoridad(CacheSinConexion.sonoridad(siguiente.id)))
                    CacheSinConexion.adaptar(
                        construirItem(siguiente.id, CacheSinConexion.URL_SIN_CONEXION + siguiente.id, siguiente.titulo, siguiente.artista, null, siguiente.portadaUrl)
                    )
                } else {
                    val r = ResolutorYouTube.resolver(siguiente.id)
                    registrarCabeceras(r.url, r.headers)
                    fijarGanancia(siguiente.id, gananciaDesdeSonoridad(r.loudnessDb))
                    construirItem(siguiente.id, r.url, siguiente.titulo, siguiente.artista, null, siguiente.portadaUrl)
                }
            } catch (e: Exception) {
                android.util.Log.w("PlaybackService", "relleno: ${siguiente.id} no resolvió: ${e.message}")
                null
            }
            principal.post {
                rellenando = false
                pendientes = pendientes.filter { it.id != siguiente.id }
                val q = exo ?: return@post
                if (item != null) {
                    val estabaTerminado = q.playbackState == Player.STATE_ENDED
                    q.addMediaItem(item)
                    if (estabaTerminado) {
                        q.seekTo(q.mediaItemCount - 1, 0L)
                        q.prepare()
                        q.play()
                    }
                }
                rellenar()
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = sesion

    /**
     * Al quitar la app de recientes la música sigue (pedido explícito). El
     * comportamiento por defecto de Media3 es pausar y parar el servicio; aquí
     * solo se para si no había nada sonando.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = exo
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0 || p.playbackState == Player.STATE_ENDED) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        if (instancia === this) instancia = null
        sonando = false
        RedSinConexion.quitarOyente(alCambiarRed)
        idActual = null
        alcance.cancel()
        principal.removeCallbacksAndMessages(null)
        EfectosAudio.soltar()
        exo?.release()
        sesion?.release()
        sesion = null
        exo = null
        super.onDestroy()
    }

    // ---- Eventos hacia JS -------------------------------------------------

    private fun estadoDe(p: Player): String = when {
        p.playbackState == Player.STATE_ENDED -> "terminado"
        p.playbackState == Player.STATE_BUFFERING -> "cargando"
        p.isPlaying -> "reproduciendo"
        else -> "pausado"
    }

    private fun emitirEstado() {
        val p = exo ?: return
        // Tras un error ExoPlayer pasa a IDLE: no hay que pisar el estado
        // "error" con un "pausado" falso.
        if (huboError && p.playbackState == Player.STATE_IDLE) return
        val estado = estadoDe(p)
        if (estado == ultimoEstado) return
        ultimoEstado = estado
        EventosReproductor.emitir("estado", JSObject().put("estado", estado))
        emitirProgreso()
    }

    private fun emitirProgreso() {
        val p = exo ?: return
        val duracion = p.duration
        EventosReproductor.emitir(
            "progreso",
            JSObject()
                .put("posicionMs", p.currentPosition)
                .put("duracionMs", if (duracion == C.TIME_UNSET) 0L else duracion)
        )
    }

    private inner class OyenteInterno : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_BUFFERING) huboError = false
            emitirEstado()
            if (playbackState == Player.STATE_ENDED) rellenar()
        }

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            EfectosAudio.adjuntar(this@PlaybackService, audioSessionId)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            // "Al acabar esta canción" ya se cumplió: se apaga para no pausar en todas.
            if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                exo?.pauseAtEndOfMediaItems = false
                emitirTemporizador()
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            sonando = isPlaying
            if (isPlaying) DescargadorSinConexion.despertar(this@PlaybackService)
            emitirEstado()
            principal.removeCallbacks(tickProgreso)
            if (isPlaying) principal.post(tickProgreso)
            reiniciarTickFundido()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            idActual = mediaItem?.mediaId
            soltarRepeticionSiOtraCancion(mediaItem, reason)
            // Nivelar volumen: cada pista entra con su ganancia (también al cargar/encolar).
            // Entra con fundido solo si llegó solo (fin de pista) y la transición es fundible.
            entradaFundida = reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && fundibleHacia(mediaItem?.mediaId)
            if (mediaItem != null) aplicarVolumen()
            // Solo avances reales (fin de pista o salto del usuario). Los
            // cambios de lista por cargar()/encolarSiguientes() no cuentan.
            val motivo = when (reason) {
                Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
                Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "boton"
                else -> return
            }
            val id = mediaItem?.mediaId ?: return
            EventosReproductor.emitir("transicion", JSObject().put("id", id).put("motivo", motivo))
            emitirProgreso()
            rellenar()
        }

        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int
        ) {
            emitirProgreso()
            aplicarVolumen() // un salto manual dentro del fundido no debe dejar el volumen a medias
        }

        override fun onPlayerError(error: PlaybackException) {
            val p = exo
            val actual = p?.currentMediaItem
            val deCache = actual?.localConfiguration?.customCacheKey?.startsWith(PlanSinConexion.PREFIJO) == true
            // Sin red, una pista que venía de la red no tiene arreglo: se salta a la siguiente que sí suene.
            if (p != null && !RedSinConexion.hayRed && !deCache) {
                val hayOtra = (p.currentMediaItemIndex + 1 until p.mediaItemCount).any { esReproducibleSinRed(p.getMediaItemAt(it)) }
                if (hayOtra) {
                    p.seekToNextMediaItem()
                    p.prepare()
                    p.play()
                    return
                }
            }
            huboError = true
            ultimoEstado = "error"
            var http = 0
            var causa: Throwable? = error.cause
            while (causa != null) {
                if (causa is HttpDataSource.InvalidResponseCodeException) {
                    http = causa.responseCode
                    break
                }
                causa = causa.cause
            }
            // 403/410: la URL firmada caducó o se firmó para otro cliente. JS
            // debe volver a resolverla y reanudar en la misma posición.
            // Si la copia guardada falla (desalojada, corrupta) y hay red, JS la resuelve de nuevo por red.
            val recuperable = PlanSinConexion.errorRecuperable(deCache, RedSinConexion.hayRed, http)
            EventosReproductor.emitir(
                "estado",
                JSObject()
                    .put("estado", "error")
                    .put("codigo", if (http != 0) "http_$http" else error.errorCodeName)
                    .put("codigoExo", error.errorCode)
                    .put("httpStatus", http)
                    .put("recuperable", recuperable)
                    .put("posicionMs", exo?.currentPosition ?: 0L)
                    // Pista que falló: puede ser una encolada que JS aún no
                    // sabe que ya es la actual.
                    .put("id", exo?.currentMediaItem?.mediaId)
                    .put("mensaje", error.message ?: "")
            )
        }
    }

    /**
     * «Repetir esta canción» solo vale para la que sonaba al activarlo. Si se pasa a otra
     * (siguiente/anterior del sistema, tocar otra en la app), se apaga aquí mismo, sin esperar
     * a JS (con la pantalla bloqueada el WebView puede estar congelado). JS apaga el suyo al
     * ver cambiar la canción (App.jsx, repeticionSeCancela).
     * El bucle de la propia canción (reason REPEAT) no cuenta.
     */
    private fun soltarRepeticionSiOtraCancion(mediaItem: MediaItem?, reason: Int) {
        val p = exo ?: return
        if (!repetirUna || reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) return
        val id = mediaItem?.mediaId
        val referencia = idRepetida
        if (referencia == null) { idRepetida = id; return } // aún no sonaba nada: se adopta la primera
        if (id == referencia) return // misma canción (p. ej. se recargó tras un error)
        repetirUna = false
        idRepetida = null
        p.repeatMode = Player.REPEAT_MODE_OFF
    }

    private fun actualizarBotonesPropios() {
        val favorita = SessionCommand(COMANDO_FAVORITO, android.os.Bundle.EMPTY)
        val aleatorio = SessionCommand(COMANDO_ALEATORIO, android.os.Bundle.EMPTY)
        sesion?.setCustomLayout(listOf(
            CommandButton.Builder(if (esFavorita) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
                .setDisplayName("Favorita").setSessionCommand(favorita).build(),
            CommandButton.Builder(if (esAleatorio) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF)
                .setDisplayName("Aleatorio").setSessionCommand(aleatorio).build()
        ))
    }

    // ---- Sesión -----------------------------------------------------------

    /**
     * Declara disponibles siguiente/anterior aunque la lista tenga un solo
     * ítem (así Media3 dibuja los botones). Siguiente: si hay otra pista en la
     * cola nativa salta a ella sin pasar por JS; si no, se desvía a JS.
     * Anterior: pasados 3 s vuelve al inicio; si no, va a la anterior de la cola
     * nativa (JS deja la anterior ahí) y solo sin ella lo decide JS.
     */
    private class ReproductorConBotones(private val base: ExoPlayer) : ForwardingPlayer(base) {
        private val comandosExtra = intArrayOf(
            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
        )

        override fun getAvailableCommands(): Player.Commands =
            super.getAvailableCommands().buildUpon().addAll(*comandosExtra).build()

        override fun isCommandAvailable(command: Int): Boolean =
            command in comandosExtra || super.isCommandAvailable(command)

        override fun hasNextMediaItem(): Boolean = true
        override fun hasPreviousMediaItem(): Boolean = true

        override fun seekToNext() = siguiente()
        override fun seekToNextMediaItem() = siguiente()
        override fun seekToPrevious() = anterior()
        override fun seekToPreviousMediaItem() = anterior()

        private fun siguiente() {
            // La transición (motivo "boton") la emite el listener del servicio.
            if (base.currentMediaItemIndex + 1 < base.mediaItemCount) base.seekToNextMediaItem()
            else pedirCambio("siguiente")
        }

        private fun anterior() {
            when (ColaNativa.accionAnterior(base.currentPosition, base.currentMediaItemIndex)) {
                ColaNativa.Anterior.REINICIAR -> base.seekTo(0)
                // La anterior ya está en la cola nativa (JS la deja ahí, o ya sonó): no hace falta el WebView.
                // La transición (motivo "boton") la emite el listener del servicio.
                ColaNativa.Anterior.ANTERIOR_NATIVA -> base.seekTo(base.currentMediaItemIndex - 1, 0L)
                ColaNativa.Anterior.PEDIR_A_JS -> pedirCambio("anterior")
            }
        }

        // `ts` permite a JS descartar un comando que llega con horas de retraso (WebView congelado
        // con la pantalla bloqueada): ejecutarlo al desbloquear cambiaría de canción sin que nadie lo pida.
        private fun pedirCambio(accion: String) {
            EventosReproductor.emitir("comando", JSObject().put("accion", accion).put("ts", System.currentTimeMillis()))
        }
    }

    /**
     * El servicio está exportado (pantalla de bloqueo, Bluetooth, Android Auto),
     * así que cualquier app puede conectarse. Solo el controlador propio puede
     * cambiar la cola; el resto controla el transporte. Y aun el propio solo
     * puede meter URIs que el reproductor puede leer sin abrir archivos
     * privados (DefaultDataSource lee content:// y file://).
     */
    private class CallbackSesion(private val servicio: PlaybackService) : MediaSession.Callback {
        private fun esPropio(c: MediaSession.ControllerInfo) =
            c.packageName == servicio.packageName && c.uid == android.os.Process.myUid()

        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            val comandosSesion = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(COMANDO_FAVORITO, android.os.Bundle.EMPTY))
                .add(SessionCommand(COMANDO_ALEATORIO, android.os.Bundle.EMPTY)).build()
            // La notificación (y con ella la pantalla de bloqueo) la dibuja un controlador de esta misma app:
            // si no tiene los comandos propios, Media3 descarta ♥ y aleatorio de las acciones del sistema.
            if (esPropio(controller)) return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(comandosSesion)
                .build()
            val comandos = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                .remove(Player.COMMAND_SET_MEDIA_ITEM)
                .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS)
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(comandos)
                .setAvailableSessionCommands(comandosSesion)
                .build()
        }

        override fun onCustomCommand(session: MediaSession, controller: MediaSession.ControllerInfo, customCommand: SessionCommand, args: android.os.Bundle): ListenableFuture<SessionResult> {
            when (customCommand.customAction) {
                COMANDO_FAVORITO -> { alternarEnSitio(true); EventosReproductor.emitir("comando", JSObject().put("accion", "favorito")) }
                COMANDO_ALEATORIO -> { alternarEnSitio(false); EventosReproductor.emitir("comando", JSObject().put("accion", "aleatorio")) }
                else -> return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE))
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }

        private fun uriPermitida(uri: android.net.Uri): Boolean = when (uri.scheme?.lowercase()) {
            "https", "http" -> true
            "content" -> {
                val auth = uri.authority
                auth == "media" || servicio.contentResolver.persistedUriPermissions.any {
                    it.isReadPermission && it.uri.authority == auth &&
                        uri.toString().startsWith(it.uri.toString())
                }
            }
            else -> false
        }

        /**
         * Los MediaItem que mandan los controladores pueden llegar sin
         * localConfiguration (Media3 la oculta en algunos caminos): se reconstruye
         * la URI desde requestMetadata.mediaUri si hace falta.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            if (!esPropio(controller)) {
                return Futures.immediateFailedFuture(SecurityException("Controlador no autorizado"))
            }
            val resueltos = mediaItems.map { item ->
                val uri = item.localConfiguration?.uri ?: item.requestMetadata.mediaUri
                if (uri != null && !uriPermitida(uri)) {
                    return Futures.immediateFailedFuture(SecurityException("URI no permitida"))
                }
                val nuevo = if (uri != null) item.buildUpon().setUri(uri).build() else item
                // La pista que suena por streaming conserva su URI al guardarse (si no, ExoPlayer se re-prepara y corta).
                val actual = servicio.exo?.currentMediaItem
                val conf = actual?.localConfiguration
                if (conf != null && PlanSinConexion.conservarUriActual(
                        item.mediaId, uri?.toString(), actual.mediaId, conf.uri.toString(), conf.customCacheKey
                    )
                ) {
                    nuevo
                } else {
                    CacheSinConexion.adaptar(nuevo)
                }
            }.toMutableList()
            return Futures.immediateFuture(resueltos)
        }
    }

    companion object {
        private const val MIN_EN_COLA = 2

        class Pendiente(val id: String, val titulo: String?, val artista: String?, val portadaUrl: String?)

        @Volatile
        private var pendientes: List<Pendiente> = emptyList()
        private var instancia: PlaybackService? = null
        @Volatile private var sonando = false

        /** mediaId de la pista actual del player (la descarga no debe desalojarla de la caché). */
        @Volatile private var idActual: String? = null

        @JvmStatic
        fun idActual(): String? = idActual

        /** ¿Está sonando algo ahora? (la descarga lo consulta para no competir con la reproducción) */
        @JvmStatic
        fun estaSonando(): Boolean = sonando
        private var esFavorita = false
        private var esAleatorio = false
        private const val COMANDO_FAVORITO = "com.terrikola.musicsippi.FAVORITO"
        private const val COMANDO_ALEATORIO = "com.terrikola.musicsippi.ALEATORIO"

        /**
         * Foto del player para que JS la adopte al volver a primer plano (o al reabrirse el
         * WebView): la fuente de verdad mientras la app está en segundo plano es el nativo.
         * Sin servicio o sin pistas, null. Solo desde el hilo principal.
         */
        @JvmStatic
        fun instantanea(): JSObject? {
            val p = instancia?.exo ?: return null
            val item = p.currentMediaItem ?: return null
            val duracion = p.duration
            return JSObject()
                .put("id", item.mediaId)
                .put("indice", p.currentMediaItemIndex)
                .put("total", p.mediaItemCount)
                .put("posicionMs", p.currentPosition)
                .put("duracionMs", if (duracion == C.TIME_UNSET) 0L else duracion)
                .put("estado", instancia?.estadoDe(p) ?: "pausado")
        }

        @JvmStatic
        fun fijarAcciones(favorito: Boolean, aleatorio: Boolean) {
            esFavorita = favorito
            esAleatorio = aleatorio
            Handler(Looper.getMainLooper()).post { instancia?.actualizarBotonesPropios() }
        }

        /** Con la pantalla bloqueada JS puede tardar en responder: el icono cambia al momento y JS lo confirma después. */
        private fun alternarEnSitio(favorito: Boolean) {
            if (favorito) esFavorita = !esFavorita else esAleatorio = !esAleatorio
            instancia?.actualizarBotonesPropios()
        }

        /**
         * Temporizador para dormir. Vive en el servicio porque con la pantalla
         * bloqueada los temporizadores de JS no corren. `minutos` > 0 pausa a
         * esa hora; `alFinal` pausa al terminar la canción actual; ninguno lo
         * apaga. Emite "temporizador" {finMs?, alFinal} (finMs = epoch ms).
         */
        @JvmStatic
        fun fijarTemporizador(minutos: Int, alFinal: Boolean) {
            Handler(Looper.getMainLooper()).post {
                val s = instancia ?: return@post
                s.principal.removeCallbacks(s.pausaTemporizador)
                s.exo?.pauseAtEndOfMediaItems = alFinal
                s.finTemporizadorMs = if (minutos > 0) System.currentTimeMillis() + minutos * 60_000L else 0L
                if (minutos > 0) s.principal.postDelayed(s.pausaTemporizador, minutos * 60_000L)
                s.emitirTemporizador()
            }
        }

        @Volatile
        private var repetirUna = false
        private var idRepetida: String? = null // solo se toca en el hilo principal

        /**
         * «Repetir» de la app = repetir la canción actual (REPEAT_MODE_ONE). En
         * ExoPlayer es persistente: no se pierde al cambiar de pista ni depende
         * de que JS esté despierto cuando acaba la canción.
         */
        @JvmStatic
        fun fijarRepeticion(activo: Boolean) {
            repetirUna = activo
            Handler(Looper.getMainLooper()).post {
                val p = instancia?.exo
                // Se recuerda a qué canción se aplicó; si aún no hay ninguna se adopta la primera que entre.
                idRepetida = if (activo) p?.currentMediaItem?.mediaId else null
                p?.repeatMode = if (activo) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            }
        }

        /** Sustituye las pendientes (las que van tras la cola ya resuelta) y rellena si hace falta. */
        @JvmStatic
        fun fijarPendientes(lista: List<Pendiente>) {
            pendientes = lista
            Handler(Looper.getMainLooper()).post { instancia?.rellenar() }
        }

        @JvmStatic
        fun construirItem(
            id: String,
            url: String,
            titulo: String?,
            artista: String?,
            album: String?,
            portadaUrl: String?,
            duracionMs: Long = 0L,
            portadaData: ByteArray? = null
        ): MediaItem {
            val meta = androidx.media3.common.MediaMetadata.Builder()
                .setTitle(titulo)
                .setArtist(artista)
                .setAlbumTitle(album)
                .apply {
                    if (!portadaUrl.isNullOrBlank()) setArtworkUri(android.net.Uri.parse(portadaUrl))
                    if (portadaData != null) setArtworkData(portadaData, androidx.media3.common.MediaMetadata.PICTURE_TYPE_FRONT_COVER)
                    if (duracionMs > 0) setDurationMs(duracionMs)
                }
                .build()
            return MediaItem.Builder()
                .setMediaId(id)
                .setUri(url)
                .setMediaMetadata(meta)
                .build()
        }

        /** Descarga y comprime la carátula para los sistemas que ignoran artworkUri remotas. */
        suspend fun descargarPortada(portadaUrl: String): ByteArray? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            runCatching {
                val conexion = java.net.URL(portadaUrl).openConnection().apply {
                    connectTimeout = 15_000
                    readTimeout = 20_000
                }
                val original = conexion.getInputStream().use(BitmapFactory::decodeStream) ?: return@runCatching null
                val lado = maxOf(original.width, original.height)
                val escala = if (lado > 1024) 1024f / lado else 1f
                val bitmap = if (escala < 1f) {
                    Bitmap.createScaledBitmap(original, (original.width * escala).toInt(), (original.height * escala).toInt(), true)
                } else original
                java.io.ByteArrayOutputStream().use { salida ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 90, salida)
                    if (bitmap !== original) bitmap.recycle()
                    original.recycle()
                    salida.toByteArray()
                }
            }.getOrNull()
        }

        /**
         * Una sola fábrica para todo el proceso: DefaultHttpDataSource lee sus
         * cabeceras en cada apertura de conexión (incluidas las que provoca un
         * seek), así que basta con actualizarla antes de cargar cada pista.
         */
        private val fuenteHttp: DefaultHttpDataSource.Factory =
            DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15_000)
                .setReadTimeoutMs(20_000)

        /** Cabeceras con las que el cliente de YouTube firmó cada URL (googlevideo las compara). */
        // LRU de 64: vaciarlo de golpe haría reabrir con 403 la canción que suena.
        private val cabecerasPorUrl: MutableMap<String, Map<String, String>> = java.util.Collections.synchronizedMap(
            object : LinkedHashMap<String, Map<String, String>>(16, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Map<String, String>>?) = size > 64
            }
        )

        /**
         * Registra las cabeceras de [url]; FuenteTroceada las pone en cada
         * petición de esa URL. El User-Agent de la fábrica queda en null para
         * que DefaultHttpDataSource no pise el de la petición.
         */
        @JvmStatic
        fun registrarCabeceras(url: String, cabeceras: Map<String, String>) {
            if (cabeceras.isNotEmpty()) cabecerasPorUrl[url] = cabeceras
        }

        @JvmStatic
        fun cabecerasDe(url: String): Map<String, String> = cabecerasPorUrl[url].orEmpty()

        // ---- Nivelar volumen ---------------------------------------------------
        // El volumen del reproductor es (volumen del usuario) × (ganancia de la pista).
        // La ganancia (dB, siempre <= 0: solo atenúa) llega con cada pista; así el
        // cambio de pista nativo (pantalla bloqueada) aplica su nivel sin esperar a JS.
        @Volatile private var volumenUsuario = 1f
        @Volatile private var nivelar = true

        // ---- Fundido entre canciones ----------------------------------------
        @Volatile private var fundidoMs = 0L
        @Volatile private var sinFundidoAlbumes = true
        private val encadenadas = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

        /** Ajustes de «Fundido entre canciones»: `segundos` 0 = apagado. */
        @JvmStatic
        fun fijarFundido(segundos: Int, sinAlbumes: Boolean) {
            fundidoMs = segundos.coerceIn(0, 12) * 1000L
            sinFundidoAlbumes = sinAlbumes
            Handler(Looper.getMainLooper()).post { instancia?.reiniciarTickFundido() }
        }

        /** [id] va encadenada con la pista anterior de su álbum (reproducción secuencial). */
        @JvmStatic
        fun fijarEncadenada(id: String, encadenada: Boolean) {
            if (encadenadas.size > 256) encadenadas.clear()
            if (encadenada) encadenadas.add(id) else encadenadas.remove(id)
        }

        /** Vuelve a calcular el volumen de la pista actual (usuario, nivelación y fundido). */
        @JvmStatic
        fun reaplicarVolumen() {
            Handler(Looper.getMainLooper()).post { instancia?.aplicarVolumen() }
        }
        private val gananciasDb = java.util.concurrent.ConcurrentHashMap<String, Double>()

        /** Ganancia en dB para una sonoridad relativa: −max(0, loudness) limitada a [−12, 0]; sin dato, 0. */
        @JvmStatic
        fun gananciaDesdeSonoridad(loudnessDb: Double?): Double =
            if (loudnessDb == null || loudnessDb.isNaN()) 0.0 else (-loudnessDb).coerceIn(-12.0, 0.0)

        @JvmStatic
        fun fijarGanancia(id: String, db: Double) {
            if (gananciasDb.size > 256) gananciasDb.clear()
            gananciasDb[id] = db.coerceIn(-12.0, 0.0)
        }

        @JvmStatic
        fun fijarVolumenUsuario(v: Float) { volumenUsuario = v.coerceIn(0f, 1f) }

        @JvmStatic
        fun fijarNivelacion(activo: Boolean) { nivelar = activo }

        /** Volumen (0..1) que le toca a la pista [id] ahora mismo. */
        @JvmStatic
        fun volumenEfectivo(id: String?): Float {
            val db = if (nivelar && id != null) gananciasDb[id] ?: 0.0 else 0.0
            return (volumenUsuario * Math.pow(10.0, db / 20.0).toFloat()).coerceIn(0f, 1f)
        }
    }
}

/**
 * Elige la fuente por la clave de caché del ítem (ProgressiveMediaSource la copia a
 * DataSpec.key): las guardadas («sc:») se leen de la caché cifrada; el resto sigue la
 * cadena de siempre. Los listeners van a las dos; lecturas y cabeceras, a la elegida en el último open.
 */
@OptIn(UnstableApi::class)
private class FuenteSinConexion(private val normal: DataSource, private val cache: DataSource) : DataSource {
    private var elegida: DataSource = normal

    override fun addTransferListener(listener: TransferListener) {
        normal.addTransferListener(listener)
        cache.addTransferListener(listener)
    }

    override fun open(dataSpec: DataSpec): Long {
        elegida = if (dataSpec.key?.startsWith(PlanSinConexion.PREFIJO) == true) cache else normal
        return elegida.open(dataSpec)
    }

    override fun getUri() = elegida.uri
    override fun getResponseHeaders() = elegida.responseHeaders
    override fun read(buffer: ByteArray, offset: Int, length: Int) = elegida.read(buffer, offset, length)
    override fun close() = elegida.close()
}
