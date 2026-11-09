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
import androidx.media3.exoplayer.DefaultLoadControl
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
import com.google.common.util.concurrent.SettableFuture
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
    private val portadasEnDescarga = HashSet<String>()
    // Solo en el hilo principal. Unas pocas: al reescribir la metadata se reponen sin parpadeo ni otra descarga.
    private val portadasRecientes = object : LinkedHashMap<String, ByteArray>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?) = size > 6
    }
    private val principal = Handler(Looper.getMainLooper())

    private var ultimoEstado: String? = null
    private var huboError = false

    private val tickProgreso = object : Runnable {
        override fun run() {
            emitirProgreso()
            anticiparRelleno()
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
        esperaRelleno = getSystemService(android.os.PowerManager::class.java)
            .newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "musicsippi:relleno")
            .apply { setReferenceCounted(false) }
        RedSinConexion.init(this)
        RedSinConexion.agregarOyente(alCambiarRed)
        RedSinConexion.agregarOyenteValidada(alValidarRed)

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
            // Buffer largo: la canción entra entera y, tras ella, las siguientes de la cola (≈2) se cargan
            // en memoria. Un corte de señal de minutos no se nota. Tope de 32 MB. Sin caché en disco.
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(10 * 60_000, 12 * 60_000, 2_500, 5_000)
                    .setTargetBufferBytes(32 * 1024 * 1024)
                    .setPrioritizeTimeOverSizeThresholds(false)
                    .build()
            )
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

    // ---- Cierre automático tras pausa larga --------------------------------
    // El ▶ del bloqueo no responde tras una pausa larga (decisión 2026-11-08: no se toca el manifiesto).
    // En su lugar, tras PAUSA_CIERRE_MS en pausa se libera todo y el servicio se detiene; al volver a la
    // app, JS retoma la canción desde donde iba (ColaReanudar + evento "cerrado").
    private var cierreProgramado = false

    private val cerrarPorPausa = Runnable {
        cierreProgramado = false
        val p = exo ?: return@Runnable
        if (p.playWhenReady || p.mediaItemCount == 0) return@Runnable
        android.util.Log.i("PlaybackService", "pausa de más de ${PAUSA_CIERRE_MS / 1000} s: se cierra el servicio")
        guardarParaReanudar()
        EventosReproductor.emitir("cerrado", JSObject().put("posicionMs", p.currentPosition))
        sesion?.let { removeSession(it); it.release() }
        sesion = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf() // onDestroy suelta el reproductor y los efectos
    }

    /** En pausa con algo cargado: cuenta atrás (sin reiniciarla por cambios de estado). Suena o se vacía: se cancela. */
    private fun revisarCierrePorPausa() {
        val p = exo
        val debePausar = p != null && !p.playWhenReady && p.mediaItemCount > 0 && fase == PlanSenalDebil.Fase.NORMAL
        if (debePausar) {
            if (!cierreProgramado) {
                cierreProgramado = true
                principal.postDelayed(cerrarPorPausa, PAUSA_CIERRE_MS)
            }
        } else if (cierreProgramado) {
            cierreProgramado = false
            principal.removeCallbacks(cerrarPorPausa)
        }
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
     * Lo quitado vuelve a las pendientes: un corte de segundos no debe acortar la cola.
     */
    private val alCambiarRed: (Boolean, Boolean) -> Unit = { hayRed, _ ->
        principal.post { if (hayRed) rellenar() else quitarLoNoReproducibleSinRed() }
    }

    private fun quitarLoNoReproducibleSinRed() {
        val p = exo ?: return
        if (fase == PlanSenalDebil.Fase.RESPALDO) return // solo hay guardadas
        if (RedSinConexion.hayRed) return
        val actual = p.currentMediaItemIndex
        if (actual < 0) return
        android.util.Log.i("PlaybackService", "sin red: cola de ${p.mediaItemCount} en $actual, pendientes=${pendientes.size}")
        val quitadas = mutableListOf<Pendiente>()
        for (i in p.mediaItemCount - 1 downTo actual + 1) {
            val item = p.getMediaItemAt(i)
            if (esReproducibleSinRed(item)) continue
            if (CacheSinConexion.completa(item.mediaId)) p.replaceMediaItem(i, CacheSinConexion.adaptar(item))
            else {
                quitadas.add(0, pendienteDe(item))
                p.removeMediaItem(i)
            }
        }
        pendientes = ColaNativa.devolverAPendientes(quitadas, pendientes) { it.id }
        rellenar()
    }

    /**
     * HyperOS ignora artworkUri y con la pantalla bloqueada JS no contesta: el servicio descarga la portada
     * de la pista actual. Sin portada propia usa la miniatura del vídeo. Se conserva el MediaItem (URI y
     * clave de caché), así que ExoPlayer solo actualiza la metadata y el audio sigue donde iba.
     */
    private fun asegurarPortada() {
        val item = exo?.currentMediaItem ?: return
        if (item.mediaMetadata.artworkData != null) return
        val id = item.mediaId
        val propia = item.mediaMetadata.artworkUri?.toString()
        val url = propia ?: ColaNativa.portadaDeVideo(id) ?: return
        val clave = "$id|$url"
        portadasRecientes[clave]?.let { aplicarPortada(id, it); return }
        if (!portadasEnDescarga.add(clave)) return
        alcance.launch {
            val portada = descargarPortada(url, recortarMiniatura = propia == null)
            principal.post {
                portadasEnDescarga.remove(clave)
                if (portada == null) {
                    android.util.Log.w("PlaybackService", "portada: no se pudo descargar la de $id")
                    return@post
                }
                portadasRecientes[clave] = portada
                aplicarPortada(id, portada)
            }
        }
    }

    private fun aplicarPortada(id: String, portada: ByteArray) {
        val p = exo ?: return
        val actual = p.currentMediaItem?.takeIf { it.mediaId == id } ?: return
        if (actual.mediaMetadata.artworkData != null) return
        val meta = actual.mediaMetadata.buildUpon()
            .setArtworkData(portada, androidx.media3.common.MediaMetadata.PICTURE_TYPE_FRONT_COVER)
            .build()
        p.replaceMediaItem(p.currentMediaItemIndex, actual.buildUpon().setMediaMetadata(meta).build())
        android.util.Log.d("PlaybackService", "portada: aplicada a $id (${portada.size} bytes)")
    }

    private fun pendienteDe(item: MediaItem) = Pendiente(
        item.mediaId,
        item.mediaMetadata.title?.toString(),
        item.mediaMetadata.artist?.toString(),
        item.mediaMetadata.artworkUri?.toString(),
    )

    private fun esReproducibleSinRed(item: MediaItem): Boolean {
        val lc = item.localConfiguration
        return PlanSinConexion.reproducibleSinRed(lc?.customCacheKey, lc?.uri?.scheme)
    }

    /** Acercándose al final sin siguiente en cola: no se espera a ENDED, para que no haya silencio. */
    private fun anticiparRelleno() {
        val p = exo ?: return
        if (pendientes.isEmpty()) return
        val quedan = p.mediaItemCount - 1 - p.currentMediaItemIndex
        if (ColaNativa.adelantarRelleno(quedan, p.currentPosition, p.duration)) rellenar()
    }

    private fun rellenar() {
        val p = exo ?: return
        if (rellenando || p.mediaItemCount == 0 || fase == PlanSenalDebil.Fase.RESPALDO) return
        val quedan = p.mediaItemCount - 1 - p.currentMediaItemIndex
        android.util.Log.i("PlaybackService", "relleno: quedan=$quedan pendientes=${pendientes.size} red=${RedSinConexion.hayRed} estado=${p.playbackState}")
        if (quedan >= MIN_EN_COLA) return
        val enCola = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).mediaId }.toSet()
        // Sin red solo valen las ya guardadas; el resto espera en la lista a que vuelva (alCambiarRed).
        val usables = PlanSinConexion.pendientesUsables(pendientes.map { it.id }, CacheSinConexion::completa, RedSinConexion.hayRed).toSet()
        val siguiente = pendientes.firstOrNull { it.id in usables && it.id !in enCola } ?: return
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
                // Mientras se resolvía, la cola pudo cambiar (otra canción, o JS entregó ya esta pista): se descarta.
                val sigueVigente = pendientes.any { it.id == siguiente.id }
                if (item == null && sigueVigente && ColaNativa.reintentarRelleno(fallosRelleno)) {
                    fallosRelleno++
                    principal.postDelayed({ rellenar() }, ColaNativa.ESPERA_RELLENO_MS)
                    return@post
                }
                fallosRelleno = 0
                pendientes = pendientes.filter { it.id != siguiente.id }
                if (!sigueVigente) {
                    rellenar()
                    return@post
                }
                val q = exo ?: return@post
                val saltar = saltarAlRellenar
                saltarAlRellenar = false
                if (item != null && fase != PlanSenalDebil.Fase.RESPALDO) {
                    val estabaTerminado = q.playbackState == Player.STATE_ENDED
                    q.addMediaItem(item)
                    if (estabaTerminado || saltar) {
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

    private var rellenarAlReanudar = false

    /** Las guardadas del modo sin señal no se recuerdan: al reanudar vuelve la música que el usuario eligió. */
    private fun guardarParaReanudar() {
        val p = exo ?: return
        val item = p.currentMediaItem ?: return
        if (fase == PlanSenalDebil.Fase.RESPALDO) return
        val siguientes = (p.currentMediaItemIndex + 1 until p.mediaItemCount).map { entradaDe(p.getMediaItemAt(it)) }
        val faltan = pendientes.map { ColaReanudar.Entrada(it.id, it.titulo, it.artista, null, it.portadaUrl, null) }
        ColaReanudar.guardar(this, entradaDe(item), p.currentPosition, siguientes + faltan)
    }

    private fun entradaDe(item: MediaItem): ColaReanudar.Entrada {
        val meta = item.mediaMetadata
        val uri = item.localConfiguration?.uri
        return ColaReanudar.Entrada(
            item.mediaId, meta.title?.toString(), meta.artist?.toString(), meta.albumTitle?.toString(),
            meta.artworkUri?.toString(), uri?.toString()?.takeIf { uri.scheme == "content" }
        )
    }

    /** La canción guardada, lista para sonar: archivo local, copia sin conexión o resuelta de nuevo (su URL ya no vale). */
    private suspend fun itemParaReanudar(e: ColaReanudar.Entrada): MediaItem = when {
        e.uriLocal != null -> construirItem(e.id, e.uriLocal, e.titulo, e.artista, e.album, e.portadaUrl)
        CacheSinConexion.completa(e.id) -> {
            fijarGanancia(e.id, gananciaDesdeSonoridad(CacheSinConexion.sonoridad(e.id)))
            CacheSinConexion.adaptar(construirItem(e.id, CacheSinConexion.URL_SIN_CONEXION + e.id, e.titulo, e.artista, e.album, e.portadaUrl))
        }
        else -> {
            val r = ResolutorYouTube.resolver(e.id)
            registrarCabeceras(r.url, r.headers)
            fijarGanancia(e.id, gananciaDesdeSonoridad(r.loudnessDb))
            construirItem(e.id, r.url, e.titulo, e.artista, e.album, e.portadaUrl)
        }
    }

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
        guardarParaReanudar()
        if (instancia === this) instancia = null
        sonando = false
        esperaRelleno?.takeIf { it.isHeld }?.release()
        RedSinConexion.quitarOyente(alCambiarRed)
        RedSinConexion.quitarOyenteValidada(alValidarRed)
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
        // Reintentando o esperando señal: para JS es una carga, no una pausa ni un error.
        p.playbackState == Player.STATE_IDLE && fase != PlanSenalDebil.Fase.NORMAL -> "cargando"
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
        // En el modo sin señal la guardada que acaba no es el fin de la cola de JS.
        if (fase == PlanSenalDebil.Fase.RESPALDO && p.playbackState == Player.STATE_ENDED) return
        val estado = estadoDe(p)
        if (estado == ultimoEstado) return
        ultimoEstado = estado
        EventosReproductor.emitir("estado", JSObject().put("estado", estado))
        emitirProgreso()
    }

    /** Con JS dormido nadie mide cuánto se oyó: al cambiar de pista se anota aquí si pasó del 70 % (JS la recoge al despertar). */
    private fun anotarOidaSiCorresponde(item: MediaItem?, posicionMs: Long, duracionMs: Long, enError: Boolean) {
        val id = item?.mediaId ?: return
        val dur = if (duracionMs == C.TIME_UNSET) 0L else duracionMs
        if (!PlanSaltos.esOidaCompleta(posicionMs, dur, enError, fase != PlanSenalDebil.Fase.NORMAL)) return
        SaltosPendientes.anotarOida(
            applicationContext, id, minOf(1.0, posicionMs.toDouble() / dur),
            item.mediaMetadata.title?.toString(), item.mediaMetadata.artist?.toString()
        )
    }

    /**
     * Arrancó una canción sin que JS la pidiera (fin de pista, botones del sistema, vuelta de «repetir»).
     * JS puede estar dormido y solo adopta la última al despertar: el historial sale de estas anotaciones.
     */
    private fun anotarReproduccion(id: String, titulo: String?, artista: String?) {
        SaltosPendientes.anotarReproduccion(applicationContext, id, titulo, artista)
        EventosReproductor.emitir("anotacion", JSObject())
    }

    private fun anotarReproduccion(item: MediaItem) =
        anotarReproduccion(item.mediaId, item.mediaMetadata.title?.toString(), item.mediaMetadata.artist?.toString())

    /** En una guardada del modo sin señal el artista del MediaItem lleva el aviso: se anota el real. */
    private fun anotarReproduccionDeRespaldo(id: String) {
        val meta = respaldo.firstOrNull { it.id == id }
        anotarReproduccion(id, meta?.titulo, meta?.artista)
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
            vigilarEstancado(playbackState)
            emitirEstado()
            // Acabada la cola, ExoPlayer suelta su wake lock: sin este, el móvil dormiría antes de resolver la siguiente.
            if (playbackState == Player.STATE_ENDED && pendientes.isNotEmpty()) esperaRelleno?.acquire(ESPERA_RELLENO_MAX_MS)
            else esperaRelleno?.takeIf { it.isHeld }?.release()
            if (playbackState == Player.STATE_ENDED) {
                if (fase == PlanSenalDebil.Fase.RESPALDO) alAcabarRespaldo() else rellenar()
            }
        }

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            EfectosAudio.adjuntar(this@PlaybackService, audioSessionId)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (!playWhenReady) guardarParaReanudar()
            revisarCierrePorPausa()
            // "Al acabar esta canción" ya se cumplió: se apaga para no pausar en todas.
            if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM) {
                exo?.pauseAtEndOfMediaItems = false
                emitirTemporizador()
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            sonando = isPlaying
            // Volvió a sonar durante la gracia o la espera: el corte se arregló solo.
            if (isPlaying && (fase == PlanSenalDebil.Fase.GRACIA || fase == PlanSenalDebil.Fase.ESPERANDO)) {
                fallosSalida = 0
                terminarModo()
            }
            if (isPlaying) DescargadorSinConexion.despertar(this@PlaybackService)
            revisarCierrePorPausa()
            emitirEstado()
            principal.removeCallbacks(tickProgreso)
            if (isPlaying) principal.post(tickProgreso)
            reiniciarTickFundido()
        }

        // También cuando JS reescribe la metadata y borra la portada ya descargada.
        override fun onMediaMetadataChanged(mediaMetadata: androidx.media3.common.MediaMetadata) {
            principal.post { asegurarPortada() }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            idActual = mediaItem?.mediaId
            principal.post { asegurarPortada() }
            guardarParaReanudar()
            if (rellenarAlReanudar && mediaItem != null) {
                rellenarAlReanudar = false
                principal.post { rellenar() }
            }
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
                else -> {
                    // La vuelta de «repetir» no cambia de canción: JS no se entera, pero es otra reproducción.
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT && mediaItem != null) anotarReproduccion(mediaItem)
                    return
                }
            }
            if (fase == PlanSenalDebil.Fase.RESPALDO) {
                alTransicionEnRespaldo(mediaItem, motivo)
                return
            }
            val item = mediaItem ?: return
            anotarReproduccion(item)
            emitirTransicion(item.mediaId, motivo, false)
            rellenar()
        }

        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int
        ) {
            emitirProgreso()
            // Fin de canción: la que acaba de terminar se oyó entera (la duración sale de su ventana, no de la nueva pista).
            if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) {
                val p = exo
                val duracionVieja = p?.currentTimeline
                    ?.takeIf { oldPosition.mediaItemIndex in 0 until it.windowCount }
                    ?.getWindow(oldPosition.mediaItemIndex, androidx.media3.common.Timeline.Window())?.durationMs
                // Sin duración en la ventana, terminar solo ya implica que llegó al final.
                anotarOidaSiCorresponde(oldPosition.mediaItem, oldPosition.positionMs, duracionVieja?.takeIf { it != C.TIME_UNSET } ?: oldPosition.positionMs, false)
            }
            // Llega antes que onMediaItemTransition: sin esto la pista nueva sonaría un instante a volumen pleno.
            val idNueva = newPosition.mediaItem?.mediaId
            entradaFundida = CurvaFundido.entradaTrasSalto(
                reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION, oldPosition.mediaItem?.mediaId, idNueva,
                fundibleHacia(idNueva), entradaFundida
            )
            aplicarVolumen() // un salto manual dentro del fundido no debe dejar el volumen a medias
        }

        override fun onPlayerError(error: PlaybackException) {
            val p = exo
            val actual = p?.currentMediaItem
            val deCache = actual?.localConfiguration?.customCacheKey?.startsWith(PlanSinConexion.PREFIJO) == true
            if (p != null && fase == PlanSenalDebil.Fase.RESPALDO) {
                alFallarGuardada()
                return
            }
            // Falta de datos en una pista de red: la recupera el servicio (gracia, guardadas, espera), no JS,
            // que con la pantalla bloqueada duerme. Ver PlanSenalDebil.
            if (p != null && actual != null && !esReproducibleSinRed(actual) &&
                PlanSenalDebil.esErrorDeRed(error.errorCode, error.cause)
            ) {
                android.util.Log.i("PlaybackService", "error de red en ${actual.mediaId} (fase $fase): ${error.errorCodeName}")
                when (fase) {
                    PlanSenalDebil.Fase.NORMAL -> empezarGracia()
                    PlanSenalDebil.Fase.ESPERANDO -> fallosSalida++
                    else -> {} // en la gracia el reintento sigue su curso
                }
                emitirEstado()
                return
            }
            if (fase != PlanSenalDebil.Fase.NORMAL) terminarModo() // otro tipo de error: lo decide JS como siempre
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
            val avisarAJs = {
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
            // Con la app oculta JS puede tardar horas en contestar: lo resuelve el servicio.
            if (p != null && actual != null && !DescargadorSinConexion.appVisible) recuperarSinJs(p, actual, avisarAJs)
            else avisarAJs()
        }
    }

    /** Vuelve a resolver la pista que falló y sigue donde iba; si no se puede, pasa a la siguiente. */
    private fun recuperarSinJs(p: ExoPlayer, actual: MediaItem, avisarAJs: () -> Unit) {
        val id = actual.mediaId
        if (id != idRecuperando) {
            idRecuperando = id
            intentosRecuperar = 0
        }
        val local = actual.localConfiguration?.uri?.scheme == "content"
        val accion = ColaNativa.trasErrorSinJs(intentosRecuperar, RedSinConexion.hayRed, local)
        android.util.Log.i("PlaybackService", "error sin JS en $id (intento $intentosRecuperar): $accion")
        if (accion == ColaNativa.TrasError.SALTAR) {
            if (!saltarSinJs(p)) avisarAJs()
            return
        }
        intentosRecuperar++
        val posicion = p.currentPosition
        alcance.launch {
            val r = try {
                ResolutorYouTube.resolver(id)
            } catch (e: Exception) {
                android.util.Log.w("PlaybackService", "recuperar: $id no resolvió: ${e.message}")
                null
            }
            principal.post {
                val q = exo ?: return@post
                if (q.currentMediaItem?.mediaId != id) return@post // mientras tanto cambió de canción
                if (r == null) {
                    if (!saltarSinJs(q)) avisarAJs()
                    return@post
                }
                registrarCabeceras(r.url, r.headers)
                fijarGanancia(id, gananciaDesdeSonoridad(r.loudnessDb))
                val indice = q.currentMediaItemIndex
                q.replaceMediaItem(indice, actual.buildUpon().setUri(r.url).setCustomCacheKey(null).build())
                q.seekTo(indice, posicion)
                q.prepare() // sin play(): si estaba en pausa, sigue en pausa
            }
        }
    }

    /** Pasa a la siguiente de la cola, o a la primera pendiente. Devuelve false si no hay ninguna. */
    private fun saltarSinJs(p: ExoPlayer): Boolean {
        if (p.currentMediaItemIndex + 1 < p.mediaItemCount) {
            p.seekToNextMediaItem()
            p.prepare()
            return true
        }
        if (pendientes.isEmpty()) return false
        saltarAlRellenar = true
        rellenar()
        return true
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
        if (!repetirUna || reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT || fase == PlanSenalDebil.Fase.RESPALDO) return
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

    // ---- Modo señal débil (ver PlanSenalDebil) -----------------------------
    // Todo aquí, en el servicio: con la pantalla bloqueada el WebView duerme y no puede recuperar nada.
    private var fase = PlanSenalDebil.Fase.NORMAL
    private var inicioGraciaMs = 0L
    private var colaOriginal: List<MediaItem> = emptyList()
    private var indiceInterrumpida = 0
    private var posicionInterrumpidaMs = 0L
    private var idInterrumpida: String? = null
    private var repetirAntes = Player.REPEAT_MODE_OFF
    private var senalConfirmada = false
    private var probando = false
    private var fallosSalida = 0
    private var erroresRespaldo = 0
    private var recientesRespaldo: List<String> = emptyList()
    private val guardadasFallidas = mutableSetOf<String>()
    private var ultimoIndiceModo = 0
    private var bufferingDesdeMs: Long? = null
    private var saltarAlRellenar = false
    private var fallosRelleno = 0
    private var idRecuperando: String? = null
    private var intentosRecuperar = 0
    private var esperaRelleno: android.os.PowerManager.WakeLock? = null

    private val reintentoGracia = Runnable { reintentarEnGracia() }
    private val sondeo = Runnable { sondear() }
    private val vigiaEstancado = Runnable { comprobarEstancado() }
    private val alValidarRed: (Boolean) -> Unit = { valida -> if (valida) principal.post { alVolverRedValida() } }

    private fun ahora() = android.os.SystemClock.elapsedRealtime()

    private fun capturarInterrumpida() {
        val p = exo ?: return
        val duracion = p.duration.takeIf { it != C.TIME_UNSET } ?: 0L
        val (indice, posicion) = PlanSenalDebil.puntoDeVuelta(p.currentMediaItemIndex, p.currentPosition, duracion, p.mediaItemCount)
        indiceInterrumpida = indice
        posicionInterrumpidaMs = posicion
        idInterrumpida = if (indice < p.mediaItemCount) p.getMediaItemAt(indice).mediaId else p.currentMediaItem?.mediaId
        inicioGraciaMs = ahora()
    }

    private fun empezarGracia() {
        capturarInterrumpida()
        fase = PlanSenalDebil.Fase.GRACIA
        principal.removeCallbacks(reintentoGracia)
        principal.postDelayed(reintentoGracia, PlanSenalDebil.REINTENTO_GRACIA_MS)
    }

    /** Durante la gracia se reintenta en la misma posición; un bache corto no cambia de canción. */
    private fun reintentarEnGracia() {
        val p = exo ?: return
        if (fase != PlanSenalDebil.Fase.GRACIA) return
        if (PlanSenalDebil.graciaVencida(inicioGraciaMs, ahora())) {
            agotarGracia()
            return
        }
        if (p.playbackState == Player.STATE_IDLE) p.prepare()
        principal.postDelayed(reintentoGracia, PlanSenalDebil.REINTENTO_GRACIA_MS)
    }

    private fun respaldoDisponible(): List<String> =
        PlanSenalDebil.respaldoEfectivo(respaldo.map { it.id }, CacheSinConexion.idsGuardados()) {
            it != idInterrumpida && it !in guardadasFallidas && CacheSinConexion.completa(it)
        }

    private fun agotarGracia() {
        principal.removeCallbacks(reintentoGracia)
        val ids = respaldoDisponible()
        fase = PlanSenalDebil.faseTrasGracia(ids.isNotEmpty())
        android.util.Log.i("PlaybackService", "sin señal: $fase (respaldo ${ids.size}) interrumpida=$idInterrumpida en $posicionInterrumpidaMs ms")
        if (fase == PlanSenalDebil.Fase.RESPALDO) entrarEnRespaldo(ids)
        emitirSenal()
        emitirEstado()
        programarSondeo()
    }

    private fun itemRespaldo(id: String): MediaItem {
        val meta = respaldo.firstOrNull { it.id == id }
        fijarGanancia(id, gananciaDesdeSonoridad(CacheSinConexion.sonoridad(id)))
        return CacheSinConexion.adaptar(
            construirItem(
                id, CacheSinConexion.URL_SIN_CONEXION + id, meta?.titulo,
                PlanSenalDebil.artistaEnModo(meta?.artista), PlanSenalDebil.AVISO, meta?.portadaUrl
            )
        )
    }

    /** Se recuerda la cola tal cual y suenan guardadas (siempre con la siguiente ya en la lista). */
    private fun entrarEnRespaldo(ids: List<String>) {
        val p = exo ?: return
        colaOriginal = (0 until p.mediaItemCount).map { p.getMediaItemAt(it) }
        repetirAntes = p.repeatMode
        p.repeatMode = Player.REPEAT_MODE_OFF
        senalConfirmada = false
        fallosSalida = 0
        erroresRespaldo = 0
        val primera = PlanSenalDebil.siguienteRespaldo(ids, recientesRespaldo, null) ?: return
        recientesRespaldo = PlanSenalDebil.anotarReciente(recientesRespaldo, primera)
        val segunda = PlanSenalDebil.siguienteRespaldo(ids, recientesRespaldo, primera)
        p.setMediaItems(listOfNotNull(itemRespaldo(primera), segunda?.let { itemRespaldo(it) }), 0, 0L)
        p.prepare()
        p.play()
        ultimoIndiceModo = 0
        anotarReproduccionDeRespaldo(primera)
        emitirTransicion(primera, "auto", true)
    }

    /** Deja una guardada detrás de la actual y solo una delante (⏮). */
    private fun reponerRespaldo() {
        val p = exo ?: return
        if (p.currentMediaItemIndex + 1 >= p.mediaItemCount) {
            val sig = PlanSenalDebil.siguienteRespaldo(respaldoDisponible(), recientesRespaldo, p.currentMediaItem?.mediaId)
            if (sig != null) p.addMediaItem(itemRespaldo(sig))
        }
        if (p.currentMediaItemIndex > 1) p.removeMediaItems(0, p.currentMediaItemIndex - 1)
        ultimoIndiceModo = p.currentMediaItemIndex
    }

    private fun alTransicionEnRespaldo(mediaItem: MediaItem?, motivo: String) {
        val p = exo ?: return
        val haciaDelante = p.currentMediaItemIndex > ultimoIndiceModo
        ultimoIndiceModo = p.currentMediaItemIndex
        if (PlanSenalDebil.alPasarDeGuardada(senalConfirmada, haciaDelante) == PlanSenalDebil.AlPasar.VOLVER) {
            volverALaInterrumpida()
            return
        }
        val id = mediaItem?.mediaId ?: return
        recientesRespaldo = PlanSenalDebil.anotarReciente(recientesRespaldo, id)
        erroresRespaldo = 0
        anotarReproduccionDeRespaldo(id)
        emitirTransicion(id, motivo, true)
        reponerRespaldo()
    }

    private fun alAcabarRespaldo() {
        val p = exo ?: return
        if (senalConfirmada) {
            volverALaInterrumpida()
            return
        }
        reponerRespaldo()
        if (p.currentMediaItemIndex + 1 < p.mediaItemCount) {
            p.seekToNextMediaItem()
            p.prepare()
            p.play()
        }
    }

    /** Una guardada que no se puede leer (desalojada, corrupta): se pasa a otra; a la tercera seguida, se sale. */
    private fun alFallarGuardada() {
        val p = exo ?: return
        p.currentMediaItem?.mediaId?.let { guardadasFallidas += it }
        erroresRespaldo++
        if (erroresRespaldo >= 3 || respaldoDisponible().isEmpty()) {
            volverALaInterrumpida()
            return
        }
        reponerRespaldo()
        if (p.currentMediaItemIndex + 1 < p.mediaItemCount) p.seekToNextMediaItem()
        p.prepare()
        p.play()
    }

    /** Cola original intacta, en la canción interrumpida y en la posición donde se cortó. */
    private fun volverALaInterrumpida() {
        val p = exo ?: return
        val cola = colaOriginal
        val idx = indiceInterrumpida.coerceIn(0, maxOf(0, cola.size - 1))
        val pos = posicionInterrumpidaMs
        val id = idInterrumpida
        val repetir = repetirAntes
        terminarModo()
        if (cola.isEmpty()) return
        android.util.Log.i("PlaybackService", "vuelve la señal: retoma $id en $pos ms")
        p.setMediaItems(cola, idx, pos)
        p.repeatMode = repetir
        p.prepare()
        p.play()
        if (id != null) emitirTransicion(id, "auto", false)
    }

    private fun terminarModo() {
        val estaba = fase
        fase = PlanSenalDebil.Fase.NORMAL
        principal.removeCallbacks(reintentoGracia)
        principal.removeCallbacks(sondeo)
        senalConfirmada = false
        colaOriginal = emptyList()
        if (estaba == PlanSenalDebil.Fase.RESPALDO || estaba == PlanSenalDebil.Fase.ESPERANDO) emitirSenal()
    }

    /** El usuario eligió otra canción en la app: se sale del modo y se olvida la cola recordada. */
    private fun salirDelModoInterno() {
        if (fase == PlanSenalDebil.Fase.RESPALDO) exo?.repeatMode = repetirAntes
        if (fase != PlanSenalDebil.Fase.NORMAL) terminarModo()
    }

    private fun programarSondeo() {
        principal.removeCallbacks(sondeo)
        if (fase == PlanSenalDebil.Fase.RESPALDO || fase == PlanSenalDebil.Fase.ESPERANDO) {
            principal.postDelayed(sondeo, PlanSenalDebil.intervaloSondeo(fallosSalida))
        }
    }

    private fun sondear() {
        val p = exo ?: return
        when (fase) {
            PlanSenalDebil.Fase.ESPERANDO -> {
                if (p.playbackState == Player.STATE_IDLE) p.prepare()
                programarSondeo()
            }
            PlanSenalDebil.Fase.RESPALDO -> probarSalida()
            else -> {}
        }
    }

    private fun alVolverRedValida() {
        val p = exo ?: return
        when (fase) {
            PlanSenalDebil.Fase.ESPERANDO -> if (p.playbackState == Player.STATE_IDLE) p.prepare()
            PlanSenalDebil.Fase.RESPALDO -> probarSalida()
            else -> {}
        }
    }

    /**
     * Prueba de salida: «red válida» no basta en el metro, tiene que llegar el primer trozo de la
     * interrumpida. Si su URL caducó (403/410) se vuelve a resolver, lo que también prueba la red.
     */
    private fun probarSalida() {
        if (probando || fase != PlanSenalDebil.Fase.RESPALDO || senalConfirmada) return
        val item = colaOriginal.getOrNull(indiceInterrumpida)
        val url = item?.localConfiguration?.uri?.toString()
        if (item == null || url == null) {
            senalConfirmada = true
            return
        }
        probando = true
        alcance.launch {
            val resultado = runCatching {
                try {
                    leerPrueba(url)
                    null
                } catch (e: HttpDataSource.InvalidResponseCodeException) {
                    if (e.responseCode != 403 && e.responseCode != 410) throw e
                    val r = ResolutorYouTube.resolver(item.mediaId)
                    registrarCabeceras(r.url, r.headers)
                    r.url
                }
            }
            principal.post {
                probando = false
                if (fase != PlanSenalDebil.Fase.RESPALDO) return@post
                resultado.onSuccess { nueva ->
                    if (nueva != null) {
                        colaOriginal = colaOriginal.toMutableList().also {
                            it[indiceInterrumpida] = item.buildUpon().setUri(nueva).build()
                        }
                    }
                    senalConfirmada = true
                    fallosSalida = 0
                    android.util.Log.i("PlaybackService", "prueba de salida bien: al acabar la guardada vuelve ${item.mediaId}")
                }.onFailure {
                    fallosSalida++
                    android.util.Log.i("PlaybackService", "prueba de salida falló ($fallosSalida): ${it.message}")
                    programarSondeo()
                }
            }
        }
    }

    private fun leerPrueba(url: String) {
        val fuente = FuenteTroceada.Factory(DefaultDataSource.Factory(this, fuenteHttp)).createDataSource()
        val buffer = ByteArray(64 * 1024)
        try {
            fuente.open(DataSpec.Builder().setUri(url).setPosition(0).setLength(PlanSenalDebil.BYTES_PRUEBA).build())
            var leidos = 0L
            while (leidos < PlanSenalDebil.BYTES_PRUEBA) {
                val n = fuente.read(buffer, 0, buffer.size)
                if (n == C.RESULT_END_OF_INPUT) break
                leidos += n
            }
        } finally {
            fuente.close()
        }
    }

    /** Cargando sin sonar mucho rato (el socket puede colgarse sin dar error): cuenta como gracia vencida. */
    private fun vigilarEstancado(estado: Int) {
        principal.removeCallbacks(vigiaEstancado)
        if (estado == Player.STATE_BUFFERING) {
            if (bufferingDesdeMs == null) bufferingDesdeMs = ahora()
            principal.postDelayed(vigiaEstancado, PlanSenalDebil.ESTANCADO_MS)
        } else {
            bufferingDesdeMs = null
        }
    }

    private fun comprobarEstancado() {
        val p = exo ?: return
        if (fase != PlanSenalDebil.Fase.NORMAL || p.playbackState != Player.STATE_BUFFERING || !p.playWhenReady) return
        val actual = p.currentMediaItem
        if (!PlanSenalDebil.estancado(bufferingDesdeMs, ahora(), actual != null && !esReproducibleSinRed(actual))) return
        capturarInterrumpida()
        if (respaldoDisponible().isEmpty()) return // sin guardadas, ExoPlayer sigue intentándolo solo
        agotarGracia()
    }

    private fun datosSenal(): JSObject {
        val activo = fase == PlanSenalDebil.Fase.RESPALDO || fase == PlanSenalDebil.Fase.ESPERANDO
        return JSObject()
            .put("activo", activo)
            .put("esperando", fase == PlanSenalDebil.Fase.ESPERANDO)
            .put("idInterrumpida", if (activo) idInterrumpida else null)
    }

    private fun emitirSenal() = EventosReproductor.emitir("senalDebil", datosSenal())

    private fun emitirTransicion(id: String, motivo: String, deRespaldo: Boolean) {
        val datos = JSObject().put("id", id).put("motivo", motivo)
        if (deRespaldo) datos.put("respaldo", true)
        EventosReproductor.emitir("transicion", datos)
        emitirProgreso()
    }

    // ---- Sesión -----------------------------------------------------------

    /**
     * Declara disponibles siguiente/anterior aunque la lista tenga un solo
     * ítem (así Media3 dibuja los botones). Siguiente: si hay otra pista en la
     * cola nativa salta a ella sin pasar por JS; si no, se desvía a JS.
     * Anterior: pasados 3 s vuelve al inicio; si no, va a la anterior de la cola
     * nativa (JS deja la anterior ahí) y solo sin ella lo decide JS.
     */
    private inner class ReproductorConBotones(private val base: ExoPlayer) : ForwardingPlayer(base) {
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

        // Tras un error el player queda en IDLE: sin prepare() los botones no harían nada (pasó en el metro).
        override fun play() {
            prepararSiHaceFalta()
            super.play()
        }

        private fun prepararSiHaceFalta() {
            if (base.playbackState == Player.STATE_IDLE) base.prepare()
        }

        private fun siguiente() {
            anotarSaltoRapido()
            // Saltar durante la gracia o la espera: la interrumpida deja de importar.
            if (fase == PlanSenalDebil.Fase.GRACIA || fase == PlanSenalDebil.Fase.ESPERANDO) terminarModo()
            if (fase == PlanSenalDebil.Fase.RESPALDO && base.currentMediaItemIndex + 1 >= base.mediaItemCount) reponerRespaldo()
            // La transición (motivo "boton") la emite el listener del servicio.
            if (base.currentMediaItemIndex + 1 < base.mediaItemCount) base.seekToNextMediaItem()
            else {
                pedirCambio("siguiente")
                rellenarSiJsNoContesta()
            }
            prepararSiHaceFalta()
        }

        /** Con JS dormido las transiciones llegan agrupadas: el salto se anota aquí y JS lo recoge al despertar. */
        private fun anotarSaltoRapido() {
            val item = base.currentMediaItem ?: return
            val enError = base.playerError != null || base.playbackState == Player.STATE_IDLE
            val enModoSenal = fase != PlanSenalDebil.Fase.NORMAL
            val sonando = PlanSaltos.estaSonando(base.playbackState == Player.STATE_READY, base.playWhenReady)
            if (PlanSaltos.esSaltoRapido(base.currentPosition, enError, enModoSenal, sonando)) {
                SaltosPendientes.anotar(
                    applicationContext, item.mediaId, base.currentPosition,
                    item.mediaMetadata.title?.toString(), item.mediaMetadata.artist?.toString()
                )
            } else {
                // Pulsar «Siguiente» tras oírla casi entera también cuenta (JS dormido: no mide el tiempo).
                anotarOidaSiCorresponde(item, base.currentPosition, base.duration, enError)
            }
        }

        private fun anterior() {
            if (fase == PlanSenalDebil.Fase.GRACIA || fase == PlanSenalDebil.Fase.ESPERANDO) terminarModo()
            if (fase == PlanSenalDebil.Fase.RESPALDO) {
                if (PlanSenalDebil.anteriorEnModo(base.currentPosition, base.currentMediaItemIndex)) base.seekTo(0)
                else base.seekTo(base.currentMediaItemIndex - 1, 0L)
                prepararSiHaceFalta()
                return
            }
            when (ColaNativa.accionAnterior(base.currentPosition, base.currentMediaItemIndex)) {
                ColaNativa.Anterior.REINICIAR -> {
                    base.currentMediaItem?.let { anotarReproduccion(it) }
                    base.seekTo(0)
                }
                // La anterior ya está en la cola nativa (JS la deja ahí, o ya sonó): no hace falta el WebView.
                // La transición (motivo "boton") la emite el listener del servicio.
                ColaNativa.Anterior.ANTERIOR_NATIVA -> base.seekTo(base.currentMediaItemIndex - 1, 0L)
                ColaNativa.Anterior.PEDIR_A_JS -> pedirCambio("anterior")
            }
            prepararSiHaceFalta()
        }

        /** Sin siguiente en la cola nativa y JS dormido: pasados 2 s el servicio resuelve él mismo la próxima pendiente. */
        private fun rellenarSiJsNoContesta() {
            val antes = base.currentMediaItem?.mediaId
            principal.postDelayed({
                if (exo?.currentMediaItem?.mediaId == antes && pendientes.isNotEmpty()) {
                    saltarAlRellenar = true
                    rellenar()
                }
            }, PlanSenalDebil.ESPERA_JS_MS)
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

        /** ▶ con el reproductor vacío (pantalla de bloqueo, auricular) tras cerrar el sistema la app. */
        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val guardada = ColaReanudar.leer(servicio)
                ?: return Futures.immediateFailedFuture(UnsupportedOperationException("Nada que reanudar"))
            val futuro = SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
            servicio.alcance.launch {
                try {
                    val item = servicio.itemParaReanudar(guardada.actual)
                    pendientes = guardada.siguientes.map { Pendiente(it.id, it.titulo, it.artista, it.portadaUrl) }
                    servicio.rellenarAlReanudar = true
                    android.util.Log.i("PlaybackService", "reanudar: ${guardada.actual.id} en ${guardada.posicionMs} ms, ${pendientes.size} detrás")
                    futuro.set(MediaSession.MediaItemsWithStartPosition(listOf(item), 0, guardada.posicionMs))
                } catch (e: Exception) {
                    android.util.Log.w("PlaybackService", "reanudar: ${guardada.actual.id} no resolvió: ${e.message}")
                    futuro.setException(e)
                }
            }
            return futuro
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
                    // El controlador solo ve el futuro fallido en el log: sin este aviso JS esperaría para siempre.
                    EventosReproductor.emitir(
                        "estado",
                        JSObject().put("estado", "error").put("codigo", "rechazado")
                            .put("recuperable", false).put("mensaje", "URI no permitida: ${uri.scheme}")
                    )
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
        /** Tiempo en pausa tras el que el servicio se cierra solo (ajustable). */
        private const val PAUSA_CIERRE_MS = 10 * 60_000L
        private const val MIN_EN_COLA = 2
        private const val ESPERA_RELLENO_MAX_MS = 180_000L

        class Pendiente(val id: String, val titulo: String?, val artista: String?, val portadaUrl: String?)

        @Volatile
        private var pendientes: List<Pendiente> = emptyList()

        /** Guardadas de respaldo para el modo sin señal (las manda JS: mismo mood, luego cualquiera). */
        @Volatile
        private var respaldo: List<Pendiente> = emptyList()

        @JvmStatic
        fun fijarRespaldo(lista: List<Pendiente>) { respaldo = lista }

        /** Solo desde el hilo principal: ¿suenan guardadas porque falta la señal? (la cola nativa no es la de JS) */
        @JvmStatic
        fun enRespaldo(): Boolean = instancia?.fase == PlanSenalDebil.Fase.RESPALDO

        /** JS cargó otra canción (o paró): se sale del modo sin señal. */
        @JvmStatic
        fun salirDelModo() {
            Handler(Looper.getMainLooper()).post { instancia?.salirDelModoInterno() }
        }
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
                .put("respaldo", enRespaldo())
                .apply { instancia?.let { put("senalDebil", it.datosSenal()) } }
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

        /** Anota las pendientes sin resolver nada: el relleno llega al acercarse el final o al cambiar de pista. */
        @JvmStatic
        fun anotarPendientes(lista: List<Pendiente>) {
            pendientes = lista
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
            // Orden fijo en notificación y bloqueo: título, artista (con sus «feat.», ya fuera del
            // título) y después el álbum/«Sonando desde». Algunas capas (HyperOS, Bluetooth) leen
            // DISPLAY_TITLE/DISPLAY_SUBTITLE en vez de TITLE/ARTIST: se rellenan igual para que
            // ninguna ponga el álbum por delante del artista.
            val meta = androidx.media3.common.MediaMetadata.Builder()
                .setTitle(titulo)
                .setDisplayTitle(titulo)
                .setArtist(artista)
                .setSubtitle(artista)
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
        suspend fun descargarPortada(portadaUrl: String, recortarMiniatura: Boolean = false): ByteArray? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            runCatching {
                val conexion = java.net.URL(portadaUrl).openConnection().apply {
                    connectTimeout = 15_000
                    readTimeout = 20_000
                }
                val descargada = conexion.getInputStream().use(BitmapFactory::decodeStream) ?: return@runCatching null
                // La miniatura es 4:3 con bandas negras: el centro 1:1 es la imagen limpia.
                val original = if (recortarMiniatura) {
                    val cuadrado = minOf(descargada.width * 9 / 16, descargada.height)
                    Bitmap.createBitmap(descargada, (descargada.width - cuadrado) / 2, (descargada.height - cuadrado) / 2, cuadrado, cuadrado)
                } else descargada
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
