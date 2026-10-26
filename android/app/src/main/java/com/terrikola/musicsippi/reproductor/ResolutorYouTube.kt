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

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val okhttp = OkHttpClient.Builder()
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
        asegurarVisitor()
        val fallos = mutableListOf<String>()
        repeat(MAX_INTENTOS) {
            val excl = excluidos[videoId]?.toSet().orEmpty()
            val s = extractor.extract(
                videoId = videoId,
                hints = ContentHints().withStreamCapabilities(allowHls = false, allowSabr = false, allowBoundedRange = true),
                excludedClients = excl,
                audioQuality = AudioQuality.AUTO,
                clientPlaybackNonce = generateClientPlaybackNonce(),
            ) ?: run {
                // Suele ser un timeout puntual de YouTube: se reintenta en vez de rendirse.
                fallos += "sin cliente"
                return@repeat
            }
            if (sondear(s.audioUrl, s.headers)) {
                Log.i(TAG, "$videoId -> ${s.profileId} (${s.mimeType}, ${(s.bitrate ?: 0) / 1000} kbps)")
                excluidos.remove(videoId)
                val mime = s.mimeType.orEmpty().ifBlank { "audio/mp4" }
                // loudnessDb ya es relativo; perceptualLoudnessDb es absoluto (referencia −14).
                val sonoridad = s.loudnessDb ?: s.perceptualLoudnessDb?.plus(14.0)
                return@withContext Resultado(s.audioUrl, s.headers, mime, s.profileId, sonoridad)
            }
            Log.w(TAG, "$videoId: ${s.profileId} rechazado pasado el primer MB; se prueba otro cliente")
            fallos += s.profileId
            excluidos.getOrPut(videoId) { ConcurrentHashMap.newKeySet() } += s.profileId
        }
        throw IllegalStateException("no se pudo resolver $videoId (${fallos.joinToString()})")
    }

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
                r.code in 200..299 &&
                    r.header("Content-Type")?.startsWith("audio/") == true &&
                    r.body.source().request(LECTURA)
            }
        } catch (e: Exception) {
            Log.w(TAG, "sondeo falló: ${e.message}")
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
    private const val MAX_INTENTOS = 4
}
