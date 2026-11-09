package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.util.Log
import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.InnerTubeLogLevel
import com.metrolist.innertubex.InnerTubeLogger
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.PoTokenResult
import com.metrolist.innertubex.extraction.TokenProvider
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.extraction.generateClientPlaybackNonce
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * videoId -> URL de audio de googlevideo que suena entera.
 *
 * Réplica de lo que hace BitChord (InnerTubeXResolver + StreamResolver.probe):
 * InnerTubeX elige el cliente de su catálogo probado (WEB_EMBEDDED, VISIONOS,
 * WEB_REMIX...) y descifra firma y `n`; luego se lee un trozo de la URL PASADO
 * el primer MB con las cabeceras reales, porque googlevideo sirve el primer MB
 * a casi cualquiera y da 403 después (el corte a ~64 s). Si falla, ese cliente
 * se excluye para ese video y se pide otro.
 */
object ResolutorYouTube {

    private const val TAG = "ResolutorYouTube"

    class Resultado(
        val url: String,
        val headers: Map<String, String>,
        val mime: String,
        val cliente: String,
        /** Sonoridad relativa a la referencia de YouTube (≈ −14 LUFS), en dB; null si no hay dato. */
        val loudnessDb: Double? = null,
    )

    private var prefs: android.content.SharedPreferences? = null
    private var dirPlayers: File? = null
    private var conectividad: android.net.ConnectivityManager? = null
    private var versionApp = "?"
    private val avisosRecientes = java.util.ArrayDeque<String>() // para el detalle del fallo: logcat no llega al usuario

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Modo reserva: inglés e IPv4. Los dos informes del S24 FE venían de redes con IPv6. */
    @Volatile
    private var enReserva = false
    private var localeNormal: com.metrolist.innertubex.models.YouTubeLocale? = null

    private val okhttp = OkHttpClient.Builder()
        .dns(object : Dns {
            override fun lookup(hostname: String) = Dns.SYSTEM.lookup(hostname).let { direcciones ->
                if (enReserva) direcciones.filterIsInstance<java.net.Inet4Address>().ifEmpty { direcciones } else direcciones
            }
        })
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val http = HttpClient(OkHttp) {
        engine { preconfigured = okhttp }
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true })
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 20_000
        }
        expectSuccess = false
    }

    private val logger = InnerTubeLogger { e ->
        if (e.level == InnerTubeLogLevel.DEBUG) return@InnerTubeLogger
        if (e.level != InnerTubeLogLevel.INFO) anotarAviso("${e.tag}: ${e.message}")
        val det = if (e.details.isEmpty()) "" else e.details.entries.joinToString(prefix = " [", postfix = "]") { "${it.key}=${it.value}" }
        Log.i(TAG, "ITX ${e.tag}: ${e.message}$det")
    }

    private val repositorio = object : PlayerConfigRepository {
        override val enabled: Boolean get() = prefs != null
        override val sourceUrl: String = URL_CONFIG_PLAYER
        override val defaultSourceUrl: String = URL_CONFIG_PLAYER
        override var cachedJson: String
            get() = prefs?.getString("json", null).orEmpty()
            set(v) { prefs?.edit()?.putString("json", v)?.apply() }
        override var cachedAtMs: Long
            get() = prefs?.getLong("cached_at_ms", 0L) ?: 0L
            set(v) { prefs?.edit()?.putLong("cached_at_ms", v)?.apply() }
        override var cachedSourceUrl: String
            get() = prefs?.getString("source_url", null).orEmpty()
            set(v) { prefs?.edit()?.putString("source_url", v)?.apply() }
        override var cachedEtag: String
            get() = prefs?.getString("etag", null).orEmpty()
            set(v) { prefs?.edit()?.putString("etag", v)?.apply() }
    }

    /**
     * Minter de PO token de BitChord (BotGuard en un WebView oculto): habilita
     * WEB_REMIX, que sirve también temas con restricción de edad y es el plan
     * B si YouTube cierra los clientes sin token. Se instala en init().
     */
    @Volatile
    private var poTokens: TokenProvider? = null

    private val sinPoToken = object : TokenProvider {
        override val capabilities: com.metrolist.innertubex.extraction.TokenProviderCapabilities
            get() = poTokens?.capabilities
                ?: com.metrolist.innertubex.extraction.TokenProviderCapabilities(providers = emptySet(), usesWebView = false)

        override suspend fun getPoToken(videoId: String, visitorData: String, cookie: String?): PoTokenResult? =
            poTokens?.getPoToken(videoId, visitorData, cookie)

        override suspend fun close() {
            poTokens?.close()
        }
    }

    private val innerTube = InnerTube(http, logger = logger)
    private val almacenRemoto = RemotePlayerConfigStore(http, repositorio, logger)
    private val cifrado = YouTubeCipherService(http, almacenRemoto, logger)
    private val extractor = InnerTubeExtractor(
        configParser = YtConfigParserImpl(http, innerTube, almacenRemoto, logger),
        cipherService = cifrado,
        innerTube = innerTube,
        tokenProvider = sinPoToken,
        logger = logger,
    )

    /** Clientes que dieron 403 tras el primer MB, por videoId. */
    private val excluidos = ConcurrentHashMap<String, MutableSet<String>>()

    fun init(context: Context) {
        if (prefs != null) return
        val app = context.applicationContext
        prefs = app.getSharedPreferences("innertubex_player_config", Context.MODE_PRIVATE)
        dirPlayers = File(app.filesDir, "innertubex_players").apply { mkdirs() }
        conectividad = app.getSystemService(android.net.ConnectivityManager::class.java)
        innerTube.locale = localeParaYouTube(java.util.Locale.getDefault())
        localeNormal = innerTube.locale
        versionApp = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull() ?: "?"
        val hayWebView by lazy { runCatching { android.webkit.CookieManager.getInstance() }.isSuccess }
        poTokens = com.terrikola.musicsippi.reproductor.potoken.PoTokenGenerator(
            createMinter = { com.terrikola.musicsippi.reproductor.potoken.PoTokenWebView.getNewPoTokenGenerator(app) },
            available = { hayWebView },
        ).asTokenProvider()
        scope.launch {
            runCatching {
                cifrado.setPreprocessedPlayerCache(::leerPlayer, ::escribirPlayer)
                asegurarVisitor()
                extractor.prewarm()
            }.onFailure { Log.w(TAG, "precalentado falló: ${it.message}") }
        }
    }

    private suspend fun asegurarVisitor() {
        if (innerTube.visitorData.isNullOrBlank()) {
            innerTube.visitorData = innerTube.fetchFreshVisitorData()
        }
    }

    suspend fun resolver(videoId: String): Resultado = withContext(Dispatchers.IO) {
        val fallos = mutableListOf<String>()
        var calidad = AudioQuality.AUTO
        var sinSondear: com.metrolist.innertubex.extraction.ExtractedStream? = null
        repeat(MAX_INTENTOS) {
            val excl = excluidos[videoId]?.toSet().orEmpty()
            val s = try {
                asegurarVisitor()
                extractor.extract(
                    videoId = videoId,
                    hints = ContentHints().withStreamCapabilities(allowHls = false, allowSabr = false, allowBoundedRange = true),
                    excludedClients = excl,
                    audioQuality = calidad,
                    clientPlaybackNonce = generateClientPlaybackNonce(),
                )
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                if (e is com.metrolist.innertubex.extraction.StreamResolveException) {
                    // Metrolist #4522: el cliente descartado puede ser el único que sirve; a calidad baja suele valer.
                    if (calidad == AudioQuality.AUTO) {
                        anotarAviso("sin clientes con audio: todos a calidad baja")
                        excluidos.remove(videoId)
                        calidad = AudioQuality.LOW
                        fallos += "calidad baja"
                        return@repeat
                    }
                    if (!enReserva) {
                        entrarEnReserva()
                        fallos += "reserva"
                        return@repeat
                    }
                }
                // Mejor probar una URL que no pasó el sondeo que no sonar: el sondeo también puede equivocarse.
                sinSondear?.let {
                    anotarAviso("se usa ${it.profileId} sin sondeo")
                    return@withContext resultadoDe(videoId, it)
                }
                salirDeReserva()
                // La librería guarda la causa real aparte: sin esto el usuario solo puede enviarnos el titular.
                val texto = "${e.message} | ${detalleFallo(e)}"
                Log.w(TAG, "$videoId: $texto")
                throw IllegalStateException(texto, e)
            } ?: run {
                // Suele ser un timeout puntual de YouTube: se reintenta en vez de rendirse.
                fallos += "sin cliente"
                return@repeat
            }
            if (sondear(s.audioUrl, s.headers)) {
                return@withContext resultadoDe(videoId, s)
            }
            sinSondear = sinSondear ?: s
            Log.w(TAG, "$videoId: ${s.profileId} rechazado pasado el primer MB; se prueba otro cliente")
            fallos += s.profileId
            excluidos.getOrPut(videoId) { ConcurrentHashMap.newKeySet() } += s.profileId
        }
        sinSondear?.let {
            anotarAviso("se usa ${it.profileId} sin sondeo")
            return@withContext resultadoDe(videoId, it)
        }
        salirDeReserva()
        throw IllegalStateException("no se pudo resolver $videoId (${fallos.joinToString()}) | ${detalleFallo(IllegalStateException())}")
    }

    private fun resultadoDe(videoId: String, s: com.metrolist.innertubex.extraction.ExtractedStream): Resultado {
        Log.i(TAG, "$videoId -> ${s.profileId} (${s.mimeType}, ${(s.bitrate ?: 0) / 1000} kbps)")
        excluidos.remove(videoId)
        val mime = s.mimeType.orEmpty().ifBlank { "audio/mp4" }
        // loudnessDb ya es relativo; perceptualLoudnessDb es absoluto (referencia −14).
        val sonoridad = s.loudnessDb ?: s.perceptualLoudnessDb?.plus(14.0)
        return Resultado(s.audioUrl, s.headers, mime, s.profileId, sonoridad)
    }

    private fun entrarEnReserva() {
        anotarAviso("reserva: hl en-US e IPv4")
        enReserva = true
        innerTube.locale = localeDeReserva(innerTube.locale)
        okhttp.connectionPool.evictAll()
    }

    /** Una canción que no existe falla igual en reserva: si tampoco sirvió, se vuelve a lo normal. */
    private fun salirDeReserva() {
        if (!enReserva) return
        enReserva = false
        localeNormal?.let { innerTube.locale = it }
        okhttp.connectionPool.evictAll()
    }

    private fun anotarAviso(texto: String) = synchronized(avisosRecientes) {
        val aviso = sinUrls(texto).take(140)
        avisosRecientes.remove(aviso) // sin repetidos: «no playable clients» echaría del informe la causa real
        avisosRecientes.addLast(aviso)
        while (avisosRecientes.size > MAX_AVISOS) avisosRecientes.removeFirst()
    }

    /** Las URLs firmadas no deben viajar en un informe que el usuario comparte: solo queda el dominio. */
    private fun sinUrls(texto: String) = texto.replace(Regex("https?://([^/\\s]+)\\S*"), "$1")

    private fun detalleFallo(e: Exception): String = buildList {
        val causas = generateSequence(e.cause) { it.cause }.take(3)
            .joinToString(" <- ") { "${it.javaClass.simpleName}: ${sinUrls(it.message.orEmpty()).take(140)}" }
        if (causas.isNotEmpty()) add("causa=$causas")
        val intentos = (e as? com.metrolist.innertubex.extraction.StreamResolveException)?.diagnostics?.attempts.orEmpty()
        if (intentos.isNotEmpty()) add("intentos=" + intentos.map { "${it.profileId ?: it.clientName}:${it.outcome.take(40)}" }.distinct().takeLast(16).joinToString(","))
        val avisos = synchronized(avisosRecientes) { avisosRecientes.joinToString(" / ").also { avisosRecientes.clear() } }
        if (avisos.isNotEmpty()) add("avisos=$avisos")
        add("app=$versionApp hl=${innerTube.locale.hl} gl=${innerTube.locale.gl} sistema=${java.util.Locale.getDefault().toLanguageTag()}")
        add("visitor=${!innerTube.visitorData.isNullOrBlank()}")
        add("red=${descripcionRed()}")
    }.joinToString(" | ")

    /** Tipo de red, sin direcciones: una VPN, un DNS privado o un IPv6 roto explican fallos que solo tiene un móvil. */
    private fun descripcionRed(): String = runCatching {
        val cm = conectividad ?: return "?"
        val red = cm.activeNetwork ?: return "sin_red"
        val cap = cm.getNetworkCapabilities(red)
        val enlace = cm.getLinkProperties(red)
        listOfNotNull(
            "wifi".takeIf { cap?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) == true },
            "movil".takeIf { cap?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) == true },
            "vpn".takeIf { cap?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN) == true },
            "dns_privado".takeIf { enlace?.isPrivateDnsActive == true },
            "ipv6".takeIf { enlace?.linkAddresses?.any { it.address is java.net.Inet6Address && it.address.isLinkLocalAddress.not() } == true },
            "validada".takeIf { cap?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true },
        ).joinToString("+")
    }.getOrDefault("?")

    /**
     * Lee un rango que empieza pasado el primer MB (donde googlevideo corta a
     * las URLs sin autorización completa) con las cabeceras que usará ExoPlayer.
     */
    private fun sondear(url: String, headers: Map<String, String>): Boolean {
        val largo = android.net.Uri.parse(url).getQueryParameter("clen")?.toLongOrNull()
        val inicio = if (largo != null && largo > FRONTERA + LECTURA) FRONTERA else 0L
        val fin = minOf(inicio + FuenteTroceada.trozoPara(url), largo ?: Long.MAX_VALUE) - 1
        val req = Request.Builder().url(url).header("Range", "bytes=$inicio-$fin")
        headers.forEach { (k, v) -> req.header(k, v) }
        return try {
            okhttp.newCall(req.build()).execute().use { r ->
                val valido = r.code in 200..299 &&
                    r.header("Content-Type")?.startsWith("audio/") == true &&
                    r.body.source().request(LECTURA)
                if (!valido) anotarAviso("sondeo: HTTP ${r.code} ${r.header("Content-Type")}")
                valido
            }
        } catch (e: Exception) {
            Log.w(TAG, "sondeo falló: ${e.message}")
            anotarAviso("sondeo: ${e.javaClass.simpleName} ${e.message}")
            false
        }
    }

    private fun leerPlayer(clave: String): String? =
        dirPlayers?.let { File(it, clave) }?.takeIf { it.isFile }?.readText()

    private fun escribirPlayer(clave: String, valor: String?) {
        val dir = dirPlayers ?: return
        val f = File(dir, clave)
        if (valor == null) { f.delete(); return }
        val tmp = File(dir, "$clave.tmp")
        tmp.writeText(valor)
        tmp.renameTo(f)
        dir.listFiles()?.filter { !it.name.endsWith(".tmp") }?.sortedByDescending { it.lastModified() }
            ?.drop(3)?.forEach { it.delete() }
    }

    private const val URL_CONFIG_PLAYER =
        "https://raw.githubusercontent.com/ZemerTeam/zemer-cipher/master/library/src/main/assets/player_configs.json"
    private const val FRONTERA = 1024L * 1024
    private const val LECTURA = 16L * 1024
    private const val MAX_INTENTOS = 12
    private const val MAX_AVISOS = 10
}
