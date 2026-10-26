package com.terrikola.musicsippi.reproductor

import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.launch

/**
 * Plugin de Capacitor "ReproductorNativo": puente JS <-> PlaybackService.
 *
 * Las órdenes de transporte pasan por un MediaController (así Media3 arranca
 * y enlaza el servicio por la vía soportada y lo promueve a foreground). Los
 * eventos hacia JS NO salen del controlador sino del propio servicio
 * (EventosReproductor), porque el controlador solo ve un PlaybackException
 * serializado, sin la causa HTTP (403/410) que hace falta para decidir si el
 * error es recuperable.
 *
 * Eventos: "estado" {estado, codigo?, recuperable?, httpStatus?, posicionMs?},
 * "progreso" {posicionMs, duracionMs}, "comando" {accion: siguiente|anterior},
 * "transicion" {id, motivo: auto|boton} (ExoPlayer pasó a una pista de la cola
 * nativa sin esperar a JS). El error de "estado" lleva también el `id` de la
 * pista que falló.
 * "sinConexion" {idsGuardados, bytesUsados, descargando, indiceTope, sonoridad}
 * al cambiar lo guardado o el estado de la descarga; "red" {conectada, medida}.
 */
@CapacitorPlugin(
    name = "ReproductorNativo",
    permissions = [
        // Android 13+ separa el permiso por tipo de medio; antes era el de almacenamiento general.
        Permission(strings = [Manifest.permission.READ_MEDIA_AUDIO], alias = "audio"),
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "audioLegacy"),
        // Solo Android 9 o anterior: desde Android 10 MediaStore guarda imágenes propias sin permiso.
        Permission(strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE], alias = "galeriaLegacy")
    ]
)
class ReproductorNativoPlugin : Plugin() {

    private val principal = Handler(Looper.getMainLooper())
    private var futuroControlador: ListenableFuture<MediaController>? = null
    private var permisoNotificacionesPedido = false

    // URL por mediaId de lo cargado/encolado: hace falta para reconstruir el
    // MediaItem al actualizar solo la metadata sin reiniciar la reproducción.
    private val urlsPorId = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val portadasEnDescarga = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    private val alCambiarRed: (Boolean, Boolean) -> Unit = { hayRed, medida ->
        EventosReproductor.emitir("red", JSObject().put("conectada", hayRed).put("medida", medida))
    }

    override fun load() {
        EventosReproductor.oyente = { nombre, datos -> notifyListeners(nombre, datos) }
        // Precalienta InnerTubeX (config del player, visitor, descifrado) antes del primer play.
        ResolutorYouTube.init(context)
        CacheSinConexion.init(context)
        RedSinConexion.init(context)
        CacheSinConexion.oyente = { EventosReproductor.emitir("sinConexion", DescargadorSinConexion.estado()) }
        // Solo avisa a JS: el descargador tiene su propio oyente (limpia fallidas y despierta).
        RedSinConexion.agregarOyente(alCambiarRed)
        DescargadorSinConexion.despertar(context)
        // La app pudo abrirse desde el QR de "Sincronizar con el PC".
        activity?.intent?.let { avisarEnlace(it); avisarTextoCompartido(it) }
    }

    override fun handleOnNewIntent(intent: android.content.Intent) {
        super.handleOnNewIntent(intent)
        avisarEnlace(intent)
        avisarTextoCompartido(intent)
    }

    /**
     * Evento "enlace" {url} para musicsippi://… (QR de sincronización). Se
     * retiene hasta que JS se suscriba: al abrir en frío el WebView aún no cargó.
     */
    private fun avisarEnlace(intent: android.content.Intent) {
        val datos = intent.data ?: return
        if (datos.scheme != "musicsippi") return
        intent.data = null // que no se reprocese el mismo intent
        notifyListeners("enlace", JSObject().put("url", datos.toString()), true)
    }

    /**
     * Evento "textoCompartido" {texto} para «Compartir → Musicsippi»
     * (ACTION_SEND text/plain). Retenido hasta que JS se suscriba, como "enlace".
     */
    private fun avisarTextoCompartido(intent: android.content.Intent) {
        if (intent.action != android.content.Intent.ACTION_SEND) return
        if (intent.type?.startsWith("text/") != true) return
        val texto = intent.getStringExtra(android.content.Intent.EXTRA_TEXT) ?: return
        intent.action = null // que no se reprocese el mismo intent
        intent.removeExtra(android.content.Intent.EXTRA_TEXT)
        notifyListeners("textoCompartido", JSObject().put("texto", texto), true)
    }

    override fun handleOnResume() {
        super.handleOnResume()
        DescargadorSinConexion.appVisible = true
        DescargadorSinConexion.despertar(context)
    }

    override fun handleOnPause() {
        DescargadorSinConexion.appVisible = false
        super.handleOnPause()
    }

    override fun handleOnDestroy() {
        EventosReproductor.oyente = null
        RedSinConexion.quitarOyente(alCambiarRed)
        val f = futuroControlador
        futuroControlador = null
        if (f != null) principal.post { MediaController.releaseFuture(f) }
        // El espejo NO se libera aqui: el servicio (y la musica) sobreviven a la actividad.
        super.handleOnDestroy()
    }

    // ---- Métodos expuestos a JS ------------------------------------------

    /** Selección de canciones a tener sin conexión, tope de bytes y si la descarga está activada. */
    @PluginMethod
    fun fijarSeleccionSinConexion(call: PluginCall) {
        val lista = call.getArray("ids")
        val ids = (0 until (lista?.length() ?: 0)).mapNotNull { lista!!.optString(it, "").takeIf { s -> s.isNotBlank() } }
        val limite = (call.getDouble("limiteBytes") ?: 0.0).toLong()
        DescargadorSinConexion.fijar(context, ids, limite, call.getBoolean("activado", false) ?: false)
        call.resolve()
    }

    @PluginMethod
    fun estadoSinConexion(call: PluginCall) {
        call.resolve(DescargadorSinConexion.estado().put("hayRed", RedSinConexion.hayRed))
    }

    @PluginMethod
    fun borrarSinConexion(call: PluginCall) {
        DescargadorSinConexion.borrar(context) { call.resolve() }
    }

    @PluginMethod
    fun cargar(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("falta url")
            return
        }
        val cabeceras = mutableMapOf<String, String>()
        call.getObject("headers")?.let { h ->
            h.keys().forEach { k -> h.optString(k, null)?.let { v -> cabeceras[k] = v } }
        }
        val posicionMs = (call.getDouble("posicionMs") ?: 0.0).toLong().coerceAtLeast(0L)
        val reproducirAlCargar = call.getBoolean("reproducirAlCargar", true) ?: true
        val id = call.getString("id")?.takeIf { it.isNotBlank() } ?: ID_POR_DEFECTO
        val item = PlaybackService.construirItem(
            id,
            url,
            call.getString("titulo"),
            call.getString("artista"),
            call.getString("album"),
            call.getString("portadaUrl")
        )
        android.util.Log.d("Musicsippi", "metadata pista=$id portada=${call.getString("portadaUrl")?.isNotBlank() == true} subtitulo=${call.getString("album")}")
        urlsPorId.clear()
        PlaybackService.fijarPendientes(emptyList()) // las de la cola anterior ya no valen
        urlsPorId[id] = url
        PlaybackService.fijarGanancia(id, call.getDouble("gananciaDb") ?: 0.0)
        pedirPermisoNotificaciones()

        // Antes de que el controlador cruce la orden al servicio: ExoPlayer lee
        // las cabeceras cuando abre la conexión, que ocurre después.
        PlaybackService.registrarCabeceras(url, cabeceras)

        conControlador(call) { c ->
            c.setMediaItem(item, posicionMs)
            c.volume = PlaybackService.volumenEfectivo(id)
            c.prepare()
            if (reproducirAlCargar) c.play() else c.pause()
            descargarYAplicarPortada(id, url, call.getString("titulo"), call.getString("artista"), call.getString("album"), call.getString("portadaUrl"))
            call.resolve()
        }
    }

    /**
     * videoId -> {url, headers, mime, cliente} con InnerTubeX (como BitChord),
     * ya comprobada pasado el primer MB. Corre en IO, fuera del WebView.
     */
    @PluginMethod
    fun resolver(call: PluginCall) {
        val videoId = call.getString("videoId")
        if (videoId.isNullOrBlank()) {
            call.reject("falta videoId")
            return
        }
        ResolutorYouTube.init(context)
        alcanceResolucion.launch {
            try {
                val r = ResolutorYouTube.resolver(videoId)
                val h = JSObject()
                r.headers.forEach { (k, v) -> h.put(k, v) }
                val res = JSObject().put("url", r.url).put("headers", h)
                    .put("mime", r.mime).put("cliente", r.cliente)
                if (r.loudnessDb != null) res.put("loudnessDb", r.loudnessDb)
                call.resolve(res)
            } catch (e: Exception) {
                call.reject(e.message ?: "no se pudo resolver", "resolucion")
            }
        }
    }

    private val alcanceResolucion = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO
    )

    /**
     * Si la pista `id` ya está en la cola nativa (precargada), salta a ella sin
     * resolver ni reabrir nada: el cambio es inmediato. {aplicado: false} si no está.
     */
    @PluginMethod
    fun saltarA(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) {
            call.reject("falta id")
            return
        }
        conControlador(call) { c ->
            val idx = (0 until c.mediaItemCount).firstOrNull { c.getMediaItemAt(it).mediaId == id }
            if (idx == null) {
                call.resolve(JSObject().put("aplicado", false))
                return@conControlador
            }
            if (idx != c.currentMediaItemIndex) c.seekTo(idx, 0L) else c.seekTo(0L)
            c.play()
            call.resolve(JSObject().put("aplicado", true))
        }
    }

    /** Temporizador para dormir: {minutos} (0 = sin hora) y/o {alFinal}; sin nada lo apaga. */
    @PluginMethod
    fun temporizador(call: PluginCall) {
        PlaybackService.fijarTemporizador(
            call.getInt("minutos") ?: 0,
            call.getBoolean("alFinal", false) ?: false
        )
        call.resolve()
    }

    /** «Repetir» = repetir la canción actual (repeat-one del player, persistente entre pistas). */
    @PluginMethod
    fun repetir(call: PluginCall) {
        PlaybackService.fijarRepeticion(call.getBoolean("activo", false) ?: false)
        call.resolve()
    }

    /** Estado visual de los botones propios de la pantalla de bloqueo. */
    @PluginMethod
    fun configurarAcciones(call: PluginCall) {
        PlaybackService.fijarAcciones(call.getBoolean("favorito", false) ?: false, call.getBoolean("aleatorio", false) ?: false)
        call.resolve()
    }

    @PluginMethod
    fun reproducir(call: PluginCall) = conControlador(call) { c ->
        if (c.playbackState == Player.STATE_IDLE && c.mediaItemCount > 0) c.prepare()
        c.play()
        call.resolve()
    }

    @PluginMethod
    fun pausar(call: PluginCall) = conControlador(call) { c ->
        c.pause()
        call.resolve()
    }

    @PluginMethod
    fun buscar(call: PluginCall) {
        val ms = call.getDouble("ms")
        if (ms == null) {
            call.reject("falta ms")
            return
        }
        conControlador(call) { c ->
            c.seekTo(ms.toLong().coerceAtLeast(0L))
            call.resolve()
        }
    }

    @PluginMethod
    fun detener(call: PluginCall) = conControlador(call) { c ->
        c.stop()
        c.clearMediaItems()
        urlsPorId.clear()
        PlaybackService.fijarPendientes(emptyList()) // las de la cola anterior ya no valen
        call.resolve()
    }

    /** Volumen del reproductor, 0..100 (independiente del volumen del sistema). */
    @PluginMethod
    fun fijarVolumen(call: PluginCall) {
        val v = call.getDouble("valor") ?: 100.0
        PlaybackService.fijarVolumenUsuario((v / 100.0).toFloat())
        conControlador(call) { _ ->
            PlaybackService.reaplicarVolumen()
            call.resolve()
        }
    }

    /** «Nivelar volumen» activado o no: reaplica el volumen de la pista actual. */
    @PluginMethod
    fun fijarNivelacion(call: PluginCall) {
        PlaybackService.fijarNivelacion(call.getBoolean("activo", true) ?: true)
        conControlador(call) { _ ->
            PlaybackService.reaplicarVolumen()
            call.resolve()
        }
    }

    /**
     * Estado de los efectos de audio: {ecualizadorSoportado, activo, preset (-1 = personalizado),
     * presets: string[], bandas: [{centroHz, minMb, maxMb, nivelMb}], gravesSoportado, graves 0..1000,
     * envolventeSoportado, envolventeActivo, envolventeFuerza 0..1000, espacialSistemaDisponible/Activo}.
     */
    @PluginMethod
    fun efectosEstado(call: PluginCall) {
        principal.post { call.resolve(EfectosAudio.estado(context)) }
    }

    /** Ecualizador: {activo?, preset?, banda? + nivelMb? (pasa a «Personalizado»), graves? 0..1000}. Devuelve el estado. */
    @PluginMethod
    fun ecualizadorAjustar(call: PluginCall) {
        principal.post {
            call.resolve(
                EfectosAudio.ajustarEcualizador(
                    context,
                    if (call.hasOption("activo")) call.getBoolean("activo") else null,
                    if (call.hasOption("preset")) call.getInt("preset") else null,
                    if (call.hasOption("banda")) call.getInt("banda") else null,
                    if (call.hasOption("nivelMb")) call.getInt("nivelMb") else null,
                    if (call.hasOption("graves")) call.getInt("graves") else null
                )
            )
        }
    }

    /** Sonido envolvente (Virtualizer): {activo?, fuerza? 0..1000}. Devuelve el estado. */
    @PluginMethod
    fun envolventeAjustar(call: PluginCall) {
        principal.post {
            call.resolve(
                EfectosAudio.ajustarEnvolvente(
                    context,
                    if (call.hasOption("activo")) call.getBoolean("activo") else null,
                    if (call.hasOption("fuerza")) call.getInt("fuerza") else null
                )
            )
        }
    }

    /** «Fundido entre canciones»: {segundos: 0..12 (0 = apagado), sinAlbumes: no fundir dentro de un álbum}. */
    @PluginMethod
    fun fijarFundido(call: PluginCall) {
        PlaybackService.fijarFundido(call.getInt("segundos") ?: 0, call.getBoolean("sinAlbumes", true) ?: true)
        call.resolve()
    }

    /**
     * Cambia título/artista/carátula de la notificación sin reiniciar el audio:
     * el MediaItem conserva la misma URI, y ExoPlayer actualiza solo la
     * metadata cuando la fuente es la misma.
     */
    @PluginMethod
    fun actualizarMetadata(call: PluginCall) {
        val titulo = call.getString("titulo")
        val artista = call.getString("artista")
        val album = call.getString("album")
        val portadaUrl = call.getString("portadaUrl")
        android.util.Log.d("Musicsippi", "actualizar metadata portada=${!portadaUrl.isNullOrBlank()} subtitulo=$album")
        conControlador(call) { c ->
            // La pista actual puede no ser la primera de la lista (cola nativa).
            val actual = c.currentMediaItem
            val url = actual?.let { urlsPorId[it.mediaId] }
            if (actual != null && url != null) {
                c.replaceMediaItem(
                    c.currentMediaItemIndex,
                    PlaybackService.construirItem(actual.mediaId, url, titulo, artista, album, portadaUrl)
                )
                descargarYAplicarPortada(actual.mediaId, url, titulo, artista, album, portadaUrl)
            }
            call.resolve()
        }
    }

    /** [{id, url, headers, titulo, artista, portadaUrl, duracionMs, gananciaDb, encadenada}] -> MediaItems (registra cabeceras y ganancias). */
    private fun leerItems(entrada: org.json.JSONArray?): List<MediaItem> {
        val items = mutableListOf<MediaItem>()
        if (entrada == null) return items
        for (i in 0 until entrada.length()) {
            val o = entrada.optJSONObject(i) ?: continue
            val id = o.optString("id", "")
            val url = o.optString("url", "")
            if (id.isEmpty() || url.isEmpty()) continue
            val cabeceras = mutableMapOf<String, String>()
            o.optJSONObject("headers")?.let { h ->
                h.keys().forEach { k -> h.optString(k, null)?.let { v -> cabeceras[k] = v } }
            }
            // Cada URL con las cabeceras de SU cliente (la cola puede mezclar clientes).
            PlaybackService.registrarCabeceras(url, cabeceras)
            urlsPorId[id] = url
            PlaybackService.fijarGanancia(id, o.optDouble("gananciaDb", 0.0))
            PlaybackService.fijarEncadenada(id, o.optBoolean("encadenada", false))
            items += PlaybackService.construirItem(
                id, url,
                o.optString("titulo", null),
                o.optString("artista", null),
                null,
                o.optString("portadaUrl", null),
                o.optLong("duracionMs", 0L)
            )
        }
        return items
    }

    /**
     * Foto del player nativo {id, indice, total, posicionMs, duracionMs, estado}, o {} si no hay
     * pista. JS la lee al volver a primer plano o al reabrirse el WebView y la ADOPTA (no recarga):
     * con la pantalla bloqueada el nativo pudo avanzar o retroceder solo. No crea el servicio.
     */
    @PluginMethod
    fun estadoActual(call: PluginCall) {
        principal.post { call.resolve(PlaybackService.instantanea() ?: JSObject()) }
    }

    /**
     * Sustituye todo lo que hay DESPUÉS de la pista actual por `items`
     * ({id, url, headers, titulo, artista, portadaUrl, duracionMs}) sin tocar
     * ni interrumpir la actual. Se conserva el prefijo que ya coincide por id
     * para no reabrir conexiones. `actualId` (opcional) descarta la orden si
     * la pista actual ya no es esa (ExoPlayer avanzó mientras JS resolvía).
     */
    @PluginMethod
    fun encolarSiguientes(call: PluginCall) {
        val actualId = call.getString("actualId")
        val nuevos = leerItems(call.getArray("items"))
        // Opcional: las pistas de ANTES de la actual (la anterior de la cola de JS), para que ⏮ funcione con el WebView dormido.
        val previos = if (call.hasOption("anteriores")) leerItems(call.getArray("anteriores")) else null
        // Las que van después, solo con videoId: el servicio las resuelve él
        // mismo si JS no llega a tiempo (WebView dormido o app quitada de recientes).
        val pendientes = mutableListOf<PlaybackService.Companion.Pendiente>()
        call.getArray("pendientes")?.let { arr ->
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val id = o.optString("id", "")
                if (id.isEmpty()) continue
                pendientes += PlaybackService.Companion.Pendiente(
                    id, o.optString("titulo", null), o.optString("artista", null), o.optString("portadaUrl", null)
                )
            }
        }
        PlaybackService.fijarPendientes(pendientes)
        conControlador(call) { c ->
            if (c.mediaItemCount == 0 || (actualId != null && c.currentMediaItem?.mediaId != actualId)) {
                call.resolve(JSObject().put("aplicado", false))
                return@conControlador
            }
            if (previos != null) {
                val plan = ColaNativa.planAnteriores(
                    (0 until c.currentMediaItemIndex).map { c.getMediaItemAt(it).mediaId },
                    previos.map { it.mediaId }
                )
                if (plan.quitarInicio > 0) c.removeMediaItems(0, plan.quitarInicio)
                if (plan.anadir) c.addMediaItems(0, previos)
            }
            val idx = c.currentMediaItemIndex
            val existentes = (idx + 1 until c.mediaItemCount).map { c.getMediaItemAt(it).mediaId }
            var comun = 0
            while (comun < existentes.size && comun < nuevos.size &&
                existentes[comun] == nuevos[comun].mediaId
            ) comun++
            val desde = idx + 1 + comun
            if (desde < c.mediaItemCount) c.removeMediaItems(desde, c.mediaItemCount)
            if (comun < nuevos.size) c.addMediaItems(nuevos.subList(comun, nuevos.size))
            call.resolve(JSObject().put("aplicado", true).put("siguientes", nuevos.size))
        }
    }

    /**
     * Abre el selector de salida de audio (altavoz, auriculares Bluetooth, Cast...).
     * 1) El selector oficial del sistema (SystemOutputSwitcherDialogController, de
     * androidx.mediarouter), que funciona tambien en HyperOS/Xiaomi.
     * 2) Si el sistema no lo ofrece, el dialogo propio de MediaRouter filtrado por
     * audio en directo.
     * 3) Ultimo recurso: los ajustes de Bluetooth.
     * Devuelve {via: 'sistema'|'mediarouter'|'bluetooth'}.
     */
    @PluginMethod
    fun abrirSelectorSalida(call: PluginCall) {
        val act = activity ?: return call.reject("sin actividad")
        act.runOnUiThread {
            if (runCatching {
                    androidx.mediarouter.app.SystemOutputSwitcherDialogController.showDialog(act)
                }.getOrDefault(false)
            ) {
                call.resolve(JSObject().put("via", "sistema"))
                return@runOnUiThread
            }
            val abierto = runCatching {
                // MediaRouter exige un tema AppCompat; se envuelve el contexto por si acaso.
                val tema = android.view.ContextThemeWrapper(
                    act, androidx.appcompat.R.style.Theme_AppCompat
                )
                val selector = androidx.mediarouter.media.MediaRouteSelector.Builder()
                    .addControlCategory(
                        androidx.mediarouter.media.MediaControlIntent.CATEGORY_LIVE_AUDIO
                    )
                    .build()
                val dialogo = androidx.mediarouter.app.MediaRouteChooserDialog(tema)
                dialogo.routeSelector = selector
                dialogo.show()
                true
            }.getOrDefault(false)
            if (abierto) {
                call.resolve(JSObject().put("via", "mediarouter"))
                return@runOnUiThread
            }
            val ajustes = android.content.Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(ajustes)
                call.resolve(JSObject().put("via", "bluetooth"))
            } catch (e: Exception) {
                call.reject("no se pudo abrir el selector de salida: ${e.message}", e)
            }
        }
    }

    /**
     * Hoja de compartir de Android: un texto (ACTION_SEND text/plain) o, con `imagenBase64`, un PNG
     * que se guarda en la caché y se envía con FileProvider (content://, nunca file://).
     */
    @PluginMethod
    fun compartir(call: PluginCall) {
        val imagenBase64 = call.getString("imagenBase64")
        val texto = call.getString("texto") ?: if (imagenBase64 != null) "" else return call.reject("falta texto")
        val titulo = call.getString("titulo") ?: ""
        val envio = android.content.Intent(android.content.Intent.ACTION_SEND)
        if (imagenBase64 != null) {
            try {
                val carpeta = java.io.File(context.cacheDir, "compartir").apply { mkdirs() }
                val f = java.io.File(carpeta, "mi-resumen-musicsippi.png")
                f.writeBytes(android.util.Base64.decode(imagenBase64, android.util.Base64.DEFAULT))
                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
                envio.setType("image/png")
                    .putExtra(android.content.Intent.EXTRA_STREAM, uri)
                    .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                envio.clipData = android.content.ClipData.newRawUri(titulo, uri)
                if (texto.isNotEmpty()) envio.putExtra(android.content.Intent.EXTRA_TEXT, texto)
            } catch (e: Exception) {
                return call.reject("no se pudo preparar la imagen: ${e.message}", e)
            }
        } else {
            envio.setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, texto)
        }
        envio.putExtra(android.content.Intent.EXTRA_SUBJECT, titulo)
        // Musicsippi ya recibe texto compartido (entrante): no se ofrece a sí misma.
        val propia = android.content.ComponentName(context, "com.terrikola.musicsippi.MainActivity")
        val selector = android.content.Intent.createChooser(envio, titulo)
            .putExtra(android.content.Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(propia))
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(selector)
            call.resolve()
        } catch (e: Exception) {
            call.reject("no se pudo compartir: ${e.message}", e)
        }
    }

    /**
     * Guarda un PNG (base64) en la galería, carpeta Pictures/Musicsippi, con MediaStore. Android 10+ no pide
     * permisos; en Android 9 o anterior pide WRITE_EXTERNAL_STORAGE. Resuelve { uri }.
     */
    @PluginMethod
    fun guardarImagenGaleria(call: PluginCall) {
        if (call.getString("imagenBase64").isNullOrEmpty()) return call.reject("falta imagenBase64")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("galeriaLegacy") != PermissionState.GRANTED) {
            requestPermissionForAlias("galeriaLegacy", call, "alPermisoGaleria")
            return
        }
        escribirEnGaleria(call)
    }

    @PermissionCallback
    private fun alPermisoGaleria(call: PluginCall) {
        if (getPermissionState("galeriaLegacy") == PermissionState.GRANTED) escribirEnGaleria(call)
        else call.reject("sin permiso para guardar en la galería")
    }

    private fun escribirEnGaleria(call: PluginCall) {
        val bytes = try {
            android.util.Base64.decode(call.getString("imagenBase64"), android.util.Base64.DEFAULT)
        } catch (e: Exception) {
            return call.reject("imagen no válida: ${e.message}", e)
        }
        val nombre = (call.getString("nombre") ?: "musicsippi-resumen-${System.currentTimeMillis()}.png")
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
        val resolver = context.contentResolver
        var uri: Uri? = null
        try {
            val valores = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, nombre)
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Musicsippi")
                    put(android.provider.MediaStore.Images.Media.IS_PENDING, 1)
                } else {
                    @Suppress("DEPRECATION")
                    val dir = java.io.File(
                        android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES),
                        "Musicsippi"
                    ).apply { mkdirs() }
                    @Suppress("DEPRECATION")
                    put(android.provider.MediaStore.Images.Media.DATA, java.io.File(dir, nombre).absolutePath)
                }
            }
            val destino = resolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, valores)
                ?: return call.reject("no se pudo crear la imagen en la galería")
            uri = destino
            resolver.openOutputStream(destino)?.use { it.write(bytes) } ?: throw java.io.IOException("sin flujo de salida")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val listo = android.content.ContentValues().apply { put(android.provider.MediaStore.Images.Media.IS_PENDING, 0) }
                resolver.update(destino, listo, null, null)
            }
            call.resolve(JSObject().put("uri", destino.toString()))
        } catch (e: Exception) {
            uri?.let { runCatching { resolver.delete(it, null, null) } }
            call.reject("no se pudo guardar en la galería: ${e.message}", e)
        }
    }

    // ---- Modo iframe (ReproductorEspejo) ----------------------------------

    private var futuroEspejo: ListenableFuture<MediaController>? = null

    /**
     * Empuja el estado del iframe al player espejo. El MediaController solo
     * sirve para que Media3 arranque/enlace ServicioEspejo por la via
     * soportada; el estado se aplica directamente al player (mismo proceso).
     */
    @PluginMethod
    fun espejoActualizar(call: PluginCall) {
        val datos = ReproductorEspejo.Datos(
            sonando = call.getBoolean("sonando", false) ?: false,
            estado = call.getString("estado") ?: "listo",
            posicionMs = (call.getDouble("posicionMs") ?: 0.0).toLong(),
            duracionMs = (call.getDouble("duracionMs") ?: 0.0).toLong(),
            titulo = call.getString("titulo"),
            artista = call.getString("artista"),
            portadaUrl = call.getString("portadaUrl"),
            haySiguiente = call.getBoolean("haySiguiente", true) ?: true,
            hayAnterior = call.getBoolean("hayAnterior", true) ?: true,
            hayPista = true
        )
        if (datos.sonando) pedirPermisoNotificaciones()
        principal.post {
            val futuro = obtenerFuturoEspejo()
            futuro.addListener({
                try {
                    futuro.get()
                    ServicioEspejo.reproductor?.actualizar(datos)
                    call.resolve()
                } catch (e: Exception) {
                    call.reject("espejo no disponible: ${e.message}", e)
                }
            }, ContextCompat.getMainExecutor(context))
        }
    }

    @PluginMethod
    fun espejoDetener(call: PluginCall) {
        principal.post {
            ServicioEspejo.reproductor?.actualizar(ReproductorEspejo.Datos(hayPista = false))
            val f = futuroEspejo
            futuroEspejo = null
            if (f != null) MediaController.releaseFuture(f)
            call.resolve()
        }
    }

    private fun obtenerFuturoEspejo(): ListenableFuture<MediaController> {
        val actual = futuroEspejo
        if (actual != null) {
            val vigente = !actual.isDone || try {
                actual.get().isConnected
            } catch (e: Exception) {
                false
            }
            if (vigente) return actual
        }
        val token = SessionToken(context, ComponentName(context, ServicioEspejo::class.java))
        val nuevo = MediaController.Builder(context, token).buildAsync()
        futuroEspejo = nuevo
        return nuevo
    }

    // ---- Internos ---------------------------------------------------------


    /** Android 13+: sin este permiso la notificación (y sus controles) no se muestra. */
    /**
     * Xiaomi/MIUI (y otros) matan el servicio en segundo plano si la app está
     * "optimizada" para batería. Se pide la exención UNA vez, en la segunda
     * carga (en la primera ya sale el diálogo de notificaciones).
     */
    private fun pedirExencionBateria() {
        val actividad = activity ?: return
        val pm = actividad.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
        if (pm.isIgnoringBatteryOptimizations(actividad.packageName)) return
        val prefs = actividad.getSharedPreferences("musicsippi", android.content.Context.MODE_PRIVATE)
        if (prefs.getBoolean("bateriaPedida", false)) return
        prefs.edit().putBoolean("bateriaPedida", true).apply()
        actividad.runOnUiThread {
            runCatching {
                actividad.startActivity(
                    android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:${actividad.packageName}"))
                )
            }
        }
    }

    private fun pedirPermisoNotificaciones() {
        if (permisoNotificacionesPedido) {
            pedirExencionBateria()
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            permisoNotificacionesPedido = true
            return
        }
        permisoNotificacionesPedido = true
        val actividad = activity ?: return
        if (ContextCompat.checkSelfPermission(actividad, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            actividad.runOnUiThread {
                ActivityCompat.requestPermissions(
                    actividad,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    CODIGO_PERMISO_NOTIFICACIONES
                )
            }
        }
    }

    // --- Ajustes del móvil: batería y guardar copia de seguridad ---

    /** ¿La app está exenta de la optimización de batería? (para que el audio no se corte). */
    @PluginMethod
    fun estadoBateria(call: PluginCall) {
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
        call.resolve(JSObject().put("exenta", pm.isIgnoringBatteryOptimizations(context.packageName)))
    }

    /**
     * Estado de la red para decidir si bajar el modelo (~160 MB): {medida, conectada}.
     * `medida` es true con datos móviles o una WiFi marcada como «de uso medido».
     */
    @PluginMethod
    fun redMedida(call: PluginCall) {
        val cm = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val red = cm.activeNetwork
        val conectada = red != null &&
            cm.getNetworkCapabilities(red)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        call.resolve(JSObject().put("medida", cm.isActiveNetworkMetered).put("conectada", conectada))
    }

    /** Versión instalada: {versionCode, versionName}. Para comparar con el manifiesto de actualizaciones. */
    @PluginMethod
    fun infoVersion(call: PluginCall) {
        try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            val codigo = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            call.resolve(JSObject().put("versionCode", codigo).put("versionName", info.versionName ?: ""))
        } catch (e: Exception) {
            call.reject("sin version")
        }
    }

    /** Abre una URL http(s) en el navegador del sistema (descarga del APK nuevo). */
    @PluginMethod
    fun abrirUrl(call: PluginCall) {
        val url = call.getString("url")
        val uri = url?.let { Uri.parse(it) }
        if (uri == null || (uri.scheme != "https" && uri.scheme != "http")) {
            call.reject("url no valida")
            return
        }
        val act = activity ?: return call.reject("sin actividad")
        act.runOnUiThread {
            try {
                act.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                call.resolve()
            } catch (e: Exception) {
                call.reject("no se pudo abrir")
            }
        }
    }

    /** Abre el ajuste de Android para quitar la restricción de batería. */
    @PluginMethod
    fun abrirAjusteBateria(call: PluginCall) {
        val act = activity ?: return call.reject("sin actividad")
        act.runOnUiThread {
            try {
                act.startActivity(
                    android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:${act.packageName}"))
                )
            } catch (e: Exception) {
                act.startActivity(android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
        call.resolve()
    }

    private var temporalPendiente: java.io.File? = null

    /** Añade un trozo de texto al temporal de la copia (inicio=true lo trunca). Devuelve su ruta. */
    @PluginMethod
    fun escribirTemporal(call: PluginCall) {
        val trozo = call.getString("trozo") ?: return call.reject("falta trozo")
        val nombre = (call.getString("nombre") ?: "copia.json").replace(Regex("[^A-Za-z0-9._-]"), "_")
        try {
            val f = java.io.File(context.cacheDir, "tmp-$nombre")
            java.io.FileOutputStream(f, call.getBoolean("inicio") != true).use { it.write(trozo.toByteArray(Charsets.UTF_8)) }
            call.resolve(JSObject().put("ruta", f.absolutePath))
        } catch (e: Exception) {
            call.reject("no se pudo escribir el temporal: ${e.message}", e)
        }
    }

    /** «Guardar como» de Android (ACTION_CREATE_DOCUMENT): el usuario elige Drive o una carpeta. */
    @PluginMethod
    fun guardarArchivo(call: PluginCall) {
        val ruta = call.getString("rutaTemporal") ?: return call.reject("falta rutaTemporal")
        val f = java.io.File(ruta)
        if (f.parentFile?.canonicalPath != context.cacheDir.canonicalPath || !f.isFile) return call.reject("temporal no válido")
        temporalPendiente = f
        val intent = android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(android.content.Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(android.content.Intent.EXTRA_TITLE, call.getString("nombre") ?: "musicsippi-copia.json")
        startActivityForResult(call, intent, "alGuardarArchivo")
    }

    @com.getcapacitor.annotation.ActivityCallback
    private fun alGuardarArchivo(call: PluginCall, resultado: androidx.activity.result.ActivityResult) {
        val uri = resultado.data?.data
        val temporal = temporalPendiente
        temporalPendiente = null
        if (resultado.resultCode != android.app.Activity.RESULT_OK || uri == null || temporal == null) {
            temporal?.delete()
            call.resolve(JSObject().put("guardado", false))
            return
        }
        try {
            context.contentResolver.openOutputStream(uri)?.use { salida -> temporal.inputStream().use { it.copyTo(salida) } }
            call.resolve(JSObject().put("guardado", true))
        } catch (e: Exception) {
            call.reject("no se pudo guardar: ${e.message}", e)
        } finally {
            temporal.delete()
        }
    }

    // --- Copias LAN: MediaStore, nunca rutas file:// ---

    /** Crea (o recupera) un temporal invisible en Music/Musicsippi. */
    @PluginMethod
    fun prepararCopiaMusica(call: PluginCall) {
        val nombre = (call.getString("nombre") ?: "cancion.mp3").replace(Regex("[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ ._()-]"), "_")
        val mime = call.getString("mime") ?: "audio/mpeg"
        try {
            val existente = call.getString("uri")?.let { Uri.parse(it) }
            if (existente != null) {
                context.contentResolver.openAssetFileDescriptor(existente, "r")?.use { afd ->
                    call.resolve(JSObject().put("uri", existente.toString()).put("reanudableDesde", afd.length.coerceAtLeast(0)))
                    return
                }
            }
            val valores = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Audio.Media.DISPLAY_NAME, "$nombre.part")
                put(android.provider.MediaStore.Audio.Media.MIME_TYPE, mime)
                put(android.provider.MediaStore.Audio.Media.RELATIVE_PATH, "Music/Musicsippi/")
                put(android.provider.MediaStore.Audio.Media.IS_PENDING, 1)
            }
            val uri = context.contentResolver.insert(android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, valores)
                ?: return call.reject("no se pudo crear la copia en Música")
            call.resolve(JSObject().put("uri", uri.toString()).put("reanudableDesde", 0))
        } catch (e: Exception) { call.reject("no se pudo preparar la copia: ${e.message}", e) }
    }

    /** Escribe exactamente en el desplazamiento pedido; así una reanudación no duplica bytes. */
    @PluginMethod
    fun escribirBloqueMusica(call: PluginCall) {
        val uri = call.getString("uri")?.let { Uri.parse(it) } ?: return call.reject("falta uri")
        val inicio = call.getLong("inicio") ?: return call.reject("falta inicio")
        val base64 = call.getString("base64") ?: return call.reject("falta bloque")
        try {
            val datos = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            context.contentResolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                java.io.FileOutputStream(pfd.fileDescriptor).channel.use { canal ->
                    canal.position(inicio)
                    canal.write(java.nio.ByteBuffer.wrap(datos))
                    canal.truncate(inicio + datos.size)
                }
            } ?: return call.reject("no se pudo abrir el temporal")
            call.resolve(JSObject().put("reanudableDesde", inicio + datos.size))
        } catch (e: Exception) { call.reject("no se pudo escribir la copia: ${e.message}", e) }
    }

    /** Comprueba el SHA-256 antes de publicar el registro MediaStore como content://media. */
    @PluginMethod
    fun finalizarCopiaMusica(call: PluginCall) {
        val uri = call.getString("uri")?.let { Uri.parse(it) } ?: return call.reject("falta uri")
        val esperado = call.getString("sha256") ?: return call.reject("falta sha256")
        val nombre = call.getString("nombre") ?: "cancion.mp3"
        try {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            context.contentResolver.openInputStream(uri)?.use { entrada ->
                val buffer = ByteArray(64 * 1024)
                while (true) { val leidos = entrada.read(buffer); if (leidos < 0) break; digest.update(buffer, 0, leidos) }
            } ?: return call.reject("no se pudo leer el temporal")
            val obtenido = digest.digest().joinToString("") { "%02x".format(it) }
            if (!obtenido.equals(esperado, ignoreCase = true)) {
                context.contentResolver.delete(uri, null, null)
                return call.resolve(JSObject().put("valido", false))
            }
            val valores = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Audio.Media.DISPLAY_NAME, nombre)
                put(android.provider.MediaStore.Audio.Media.IS_PENDING, 0)
            }
            context.contentResolver.update(uri, valores, null, null)
            call.resolve(JSObject().put("valido", true).put("uri", uri.toString()))
        } catch (e: Exception) { call.reject("no se pudo finalizar la copia: ${e.message}", e) }
    }

    @PluginMethod
    fun descartarCopiaMusica(call: PluginCall) {
        try { call.getString("uri")?.let { context.contentResolver.delete(Uri.parse(it), null, null) }; call.resolve() }
        catch (e: Exception) { call.reject("no se pudo descartar la copia: ${e.message}", e) }
    }

    // --- Música local: SAF (archivos o carpeta), MediaStore y metadata ---

    private val extensionesAudio = setOf("mp3", "m4a", "aac", "flac", "ogg", "opus", "wav", "wma", "mka")
    private val maxArchivosPorCarpeta = 5000

    /** Selector de archivos de audio (ACTION_OPEN_DOCUMENT) con permiso de lectura persistible. */
    @PluginMethod
    fun seleccionarArchivos(call: PluginCall) {
        val intent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(android.content.Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(android.content.Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/ogg"))
            .putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
            .addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        startActivityForResult(call, intent, "alSeleccionarArchivos")
    }

    /** Selector de carpeta (ACTION_OPEN_DOCUMENT_TREE): recorre el árbol y devuelve su audio. */
    @PluginMethod
    fun seleccionarCarpeta(call: PluginCall) {
        val intent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        startActivityForResult(call, intent, "alSeleccionarCarpeta")
    }

    @com.getcapacitor.annotation.ActivityCallback
    private fun alSeleccionarArchivos(call: PluginCall, resultado: androidx.activity.result.ActivityResult) {
        val datos = resultado.data
        if (resultado.resultCode != android.app.Activity.RESULT_OK || datos == null) {
            return call.resolve(respuestaArchivos(emptyList(), emptyList()))
        }
        val uris = mutableListOf<Uri>()
        datos.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
        datos.data?.let { if (it !in uris) uris.add(it) }
        Thread {
            val archivos = mutableListOf<JSObject>()
            val errores = mutableListOf<JSObject>()
            for (uri in uris) {
                try {
                    persistirLectura(uri)
                    archivos.add(describirDocumento(uri, null, null, null))
                } catch (e: Exception) {
                    errores.add(errorEntrada(uri.lastPathSegment, e))
                }
            }
            call.resolve(respuestaArchivos(archivos, errores))
        }.start()
    }

    @com.getcapacitor.annotation.ActivityCallback
    private fun alSeleccionarCarpeta(call: PluginCall, resultado: androidx.activity.result.ActivityResult) {
        val arbol = resultado.data?.data
        if (resultado.resultCode != android.app.Activity.RESULT_OK || arbol == null) {
            return call.resolve(respuestaArchivos(emptyList(), emptyList()))
        }
        Thread {
            val archivos = mutableListOf<JSObject>()
            val errores = mutableListOf<JSObject>()
            try {
                persistirLectura(arbol)
                val raiz = android.provider.DocumentsContract.getTreeDocumentId(arbol)
                recorrerArbol(arbol, raiz, archivos, errores)
            } catch (e: Exception) {
                errores.add(errorEntrada(arbol.lastPathSegment, e))
            }
            call.resolve(respuestaArchivos(archivos, errores))
        }.start()
    }

    private fun persistirLectura(uri: Uri) {
        try {
            context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (e: Exception) {
            // Algunos proveedores no ofrecen permiso persistible: el archivo se lee ahora igualmente.
        }
    }

    private data class HijoDocumento(val id: String, val nombre: String, val mime: String?, val tamano: Long)

    private fun recorrerArbol(arbol: Uri, idDirectorio: String, archivos: MutableList<JSObject>, errores: MutableList<JSObject>) {
        val hijos = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(arbol, idDirectorio)
        val columnas = arrayOf(
            android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE,
            android.provider.DocumentsContract.Document.COLUMN_SIZE
        )
        val lista = mutableListOf<HijoDocumento>()
        context.contentResolver.query(hijos, columnas, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                lista.add(HijoDocumento(c.getString(0), c.getString(1) ?: "", c.getString(2), if (c.isNull(3)) 0L else c.getLong(3)))
            }
        }
        for (h in lista) {
            if (archivos.size >= maxArchivosPorCarpeta) return
            if (h.mime == android.provider.DocumentsContract.Document.MIME_TYPE_DIR) {
                recorrerArbol(arbol, h.id, archivos, errores)
            } else if (esAudio(h.nombre, h.mime)) {
                val uri = android.provider.DocumentsContract.buildDocumentUriUsingTree(arbol, h.id)
                try {
                    archivos.add(describirDocumento(uri, h.nombre, h.mime, h.tamano))
                } catch (e: Exception) {
                    errores.add(errorEntrada(h.nombre, e))
                }
            }
        }
    }

    private fun esAudio(nombre: String, mime: String?): Boolean =
        mime?.startsWith("audio/") == true || nombre.substringAfterLast('.', "").lowercase() in extensionesAudio

    /** Nombre, tamaño y MIME de un documento (los conocidos se reutilizan) más sus tags. */
    private fun describirDocumento(uri: Uri, nombreConocido: String?, mimeConocido: String?, tamanoConocido: Long?): JSObject {
        var nombre = nombreConocido
        var tamano = tamanoConocido
        if (nombre == null || tamano == null) {
            val cols = arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE)
            context.contentResolver.query(uri, cols, null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    if (nombre == null) nombre = c.getString(0)
                    if (tamano == null && !c.isNull(1)) tamano = c.getLong(1)
                }
            }
        }
        val salida = JSObject()
            .put("uri", uri.toString())
            .put("nombre", nombre ?: uri.lastPathSegment ?: "")
            .put("tamano", tamano ?: 0L)
            .put("mime", mimeConocido ?: context.contentResolver.getType(uri) ?: "audio/mpeg")
        leerMetadata(uri, salida)
        return salida
    }

    /** Tags, duración y carátula con MediaMetadataRetriever; siempre libera el manejador. */
    private fun leerMetadata(uri: Uri, salida: JSObject) {
        val r = android.media.MediaMetadataRetriever()
        try {
            r.setDataSource(context, uri)
            fun tag(clave: Int) = r.extractMetadata(clave)?.trim()?.takeIf { it.isNotEmpty() }
            tag(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE)?.let { salida.put("titulo", it) }
            (tag(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST)
                ?: tag(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST))?.let { salida.put("artista", it) }
            tag(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { salida.put("album", it) }
            tag(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { salida.put("duracionMs", it) }
            r.embeddedPicture?.let { bytes -> portadaReducida(bytes)?.let { salida.put("portada", it) } }
        } finally {
            r.release()
        }
    }

    /** Carátula embebida como data URL JPEG de a lo sumo 512 px (null si no se puede decodificar). */
    private fun portadaReducida(bytes: ByteArray): String? {
        val limite = 512
        val medidas = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, medidas)
        if (medidas.outWidth <= 0 || medidas.outHeight <= 0) return null
        var muestreo = 1
        while (medidas.outWidth / (muestreo * 2) >= limite && medidas.outHeight / (muestreo * 2) >= limite) muestreo *= 2
        val opciones = android.graphics.BitmapFactory.Options().apply { inSampleSize = muestreo }
        val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opciones) ?: return null
        try {
            val escala = minOf(1f, limite.toFloat() / maxOf(bmp.width, bmp.height))
            val reducido = if (escala < 1f) {
                android.graphics.Bitmap.createScaledBitmap(
                    bmp, (bmp.width * escala).toInt().coerceAtLeast(1), (bmp.height * escala).toInt().coerceAtLeast(1), true
                )
            } else bmp
            val flujo = java.io.ByteArrayOutputStream()
            reducido.compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, flujo)
            if (reducido !== bmp) reducido.recycle()
            return "data:image/jpeg;base64," + android.util.Base64.encodeToString(flujo.toByteArray(), android.util.Base64.NO_WRAP)
        } finally {
            bmp.recycle()
        }
    }

    private fun respuestaArchivos(archivos: List<JSObject>, errores: List<JSObject>): JSObject {
        val a = com.getcapacitor.JSArray()
        archivos.forEach { a.put(it) }
        val e = com.getcapacitor.JSArray()
        errores.forEach { e.put(it) }
        return JSObject().put("archivos", a).put("errores", e)
    }

    private fun errorEntrada(nombre: String?, e: Exception) =
        JSObject().put("nombre", nombre ?: "").put("error", e.message ?: e.javaClass.simpleName)

    private fun aliasAudio() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "audio" else "audioLegacy"

    /** Lista el audio de MediaStore; pide READ_MEDIA_AUDIO (o el de almacenamiento antes de Android 13). */
    @PluginMethod
    fun escanearMediaStore(call: PluginCall) {
        if (getPermissionState(aliasAudio()) == PermissionState.GRANTED) {
            consultarMediaStore(call)
        } else {
            requestPermissionForAlias(aliasAudio(), call, "alPermisoAudio")
        }
    }

    @PermissionCallback
    private fun alPermisoAudio(call: PluginCall) {
        if (getPermissionState(aliasAudio()) == PermissionState.GRANTED) {
            consultarMediaStore(call)
        } else {
            call.resolve(respuestaArchivos(emptyList(), emptyList()).put("permiso", false))
        }
    }

    private fun consultarMediaStore(call: PluginCall) {
        Thread {
            val archivos = mutableListOf<JSObject>()
            val errores = mutableListOf<JSObject>()
            val coleccion = android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val columnas = arrayOf(
                android.provider.MediaStore.Audio.Media._ID,
                android.provider.MediaStore.Audio.Media.DISPLAY_NAME,
                android.provider.MediaStore.Audio.Media.TITLE,
                android.provider.MediaStore.Audio.Media.ARTIST,
                android.provider.MediaStore.Audio.Media.ALBUM,
                android.provider.MediaStore.Audio.Media.DURATION,
                android.provider.MediaStore.Audio.Media.SIZE,
                android.provider.MediaStore.Audio.Media.MIME_TYPE
            )
            try {
                context.contentResolver.query(
                    coleccion, columnas, "${android.provider.MediaStore.Audio.Media.IS_MUSIC} != 0", null,
                    "${android.provider.MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC"
                )?.use { c ->
                    while (c.moveToNext()) {
                        try {
                            val uri = android.content.ContentUris.withAppendedId(coleccion, c.getLong(0))
                            val o = JSObject()
                                .put("uri", uri.toString())
                                .put("nombre", c.getString(1) ?: "")
                                .put("tamano", c.getLong(6))
                                .put("mime", c.getString(7) ?: "audio/mpeg")
                            c.getString(2)?.let { o.put("titulo", it) }
                            // MediaStore rellena «<unknown>» cuando no hay artista.
                            c.getString(3)?.takeIf { it != "<unknown>" }?.let { o.put("artista", it) }
                            c.getString(4)?.let { o.put("album", it) }
                            if (!c.isNull(5)) o.put("duracionMs", c.getLong(5))
                            archivos.add(o)
                        } catch (e: Exception) {
                            errores.add(errorEntrada(c.getString(1), e))
                        }
                    }
                }
                call.resolve(respuestaArchivos(archivos, errores).put("permiso", true))
            } catch (e: Exception) {
                call.reject("no se pudo leer MediaStore: ${e.message}", e)
            }
        }.start()
    }

    /**
     * Ejecuta `accion` con el MediaController conectado, siempre en el hilo
     * principal (Media3 lo exige; los @PluginMethod llegan en otro hilo).
     */
    private fun conControlador(call: PluginCall, accion: (MediaController) -> Unit) {
        principal.post {
            val futuro = obtenerFuturoControlador()
            futuro.addListener({
                try {
                    accion(futuro.get())
                } catch (e: Exception) {
                    call.reject("reproductor nativo no disponible: ${e.message}", e)
                }
            }, ContextCompat.getMainExecutor(context))
        }
    }

    /**
     * Algunas versiones de HyperOS no descargan artworkUri. Tras enseñar la URI
     * de inmediato, se reemplaza por JPEG local (como máximo 1024 px) sin
     * reiniciar el audio ni tocar la posición actual.
     */
    private fun descargarYAplicarPortada(
        id: String,
        urlAudio: String,
        titulo: String?,
        artista: String?,
        album: String?,
        portadaUrl: String?
    ) {
        if (portadaUrl.isNullOrBlank() || !portadasEnDescarga.add("$id|$portadaUrl")) return
        alcanceResolucion.launch {
            val portada = PlaybackService.descargarPortada(portadaUrl) ?: return@launch
            principal.post {
                val futuro = obtenerFuturoControlador()
                futuro.addListener({
                    runCatching {
                        val controlador = futuro.get()
                        if (controlador.currentMediaItem?.mediaId == id && urlsPorId[id] == urlAudio) {
                            controlador.replaceMediaItem(
                                controlador.currentMediaItemIndex,
                                PlaybackService.construirItem(id, urlAudio, titulo, artista, album, portadaUrl, portadaData = portada)
                            )
                        }
                    }
                }, ContextCompat.getMainExecutor(context))
            }
        }
    }

    private fun obtenerFuturoControlador(): ListenableFuture<MediaController> {
        val actual = futuroControlador
        if (actual != null) {
            val vigente = !actual.isDone || try {
                actual.get().isConnected
            } catch (e: Exception) {
                false
            }
            if (vigente) return actual
        }
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val nuevo = MediaController.Builder(context, token).buildAsync()
        futuroControlador = nuevo
        return nuevo
    }

    companion object {
        private const val ID_POR_DEFECTO = "musicsippi-actual"
        private const val CODIGO_PERMISO_NOTIFICACIONES = 7421
    }
}
