package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.os.BatteryManager
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheWriter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.InterruptedIOException

/**
 * Llena la caché cifrada con la selección de JS, de una en una, solo con wifi
 * libre, batería suficiente y la app visible o sonando. Selección y ajustes
 * viven en SharedPreferences para sobrevivir al reinicio del proceso.
 */
@OptIn(UnstableApi::class)
object DescargadorSinConexion {
    private const val TAG = "SinConexion"
    private const val PREFS = "sin_conexion"
    private const val PERIODO_VIGILANTE_MS = 5_000L

    @Volatile var appVisible: Boolean = false

    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var app: Context

    @Volatile private var ids: List<String> = emptyList()
    @Volatile private var limiteBytes: Long = 0L
    @Volatile private var activado: Boolean = false
    @Volatile private var cargado = false

    @Volatile private var tarea: Job? = null
    @Volatile private var escritor: CacheWriter? = null
    @Volatile private var descargando = false
    @Volatile private var indiceTope = -1
    private var otraPasada = false // despertar() llegó con la tarea en marcha: repetir la pasada
    @Volatile private var versionSeleccion = 0 // fijar() lo incrementa: la pasada en curso se abandona y arranca otra
    @Volatile private var temporizador: Job? = null // reintento programado tras cortar por fallos seguidos

    // Canciones que fallaron (id -> instante): se reintentan pasado un rato (PlanSinConexion.fallidaVigente).
    private val fallidas = java.util.concurrent.ConcurrentHashMap<String, Long>()

    // Tras cortar una pasada por fallos seguidos, no repetirla antes de este instante (salvo fijar/cambio de red).
    @Volatile private var noAntesDe = 0L
    private var wifiPrevia = false

    private val alCambiarRed: (Boolean, Boolean) -> Unit = { _, _ ->
        val libre = RedSinConexion.wifiLibre
        if (libre && !wifiPrevia) { // wifi nueva: lo que falló en la anterior (p. ej. portal cautivo) no cuenta
            fallidas.clear()
            noAntesDe = 0L
        }
        wifiPrevia = libre
        if (!libre) escritor?.cancel() // sin wifi libre se corta ya, sin esperar al vigilante
        despertar(app)
    }

    @Synchronized
    private fun cargar(ctx: Context) {
        if (cargado) return
        app = ctx.applicationContext
        val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        ids = p.getString("ids", "")!!.split('\n').filter { it.isNotBlank() }
        limiteBytes = p.getLong("limiteBytes", 0L)
        activado = p.getBoolean("activado", false)
        CacheSinConexion.init(app)
        RedSinConexion.init(app)
        wifiPrevia = RedSinConexion.wifiLibre
        RedSinConexion.agregarOyente(alCambiarRed)
        cargado = true
    }

    private fun guardarAjustes() {
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("ids", ids.joinToString("\n"))
            .putLong("limiteBytes", limiteBytes)
            .putBoolean("activado", activado)
            .apply()
    }

    fun fijar(ctx: Context, ids: List<String>, limiteBytes: Long, activado: Boolean) {
        cargar(ctx)
        this.ids = ids.distinct()
        this.limiteBytes = limiteBytes.coerceAtLeast(0L)
        this.activado = activado
        noAntesDe = 0L
        versionSeleccion++
        guardarAjustes()
        Log.i(TAG, "selección: ${this.ids.size} canciones, límite ${this.limiteBytes}, activado=$activado")
        despertar(ctx)
    }

    /** Lanza la descarga si no corre; si ya corre, pide una pasada más. */
    fun despertar(ctx: Context) {
        cargar(ctx)
        // El indicador se decide bajo el cerrojo (como en el finally de bucle) y el evento se emite fuera.
        val emitir = synchronized(this) {
            if (tarea?.isActive == true) {
                otraPasada = true
                return
            }
            otraPasada = false
            val cambia = !descargando
            descargando = true
            tarea = alcance.launch { bucle() }
            cambia
        }
        if (emitir) EventosReproductor.emitir("sinConexion", estado())
    }

    private fun puede(): Boolean {
        val bm = app.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return PlanSinConexion.puedeDescargar(
            activado, RedSinConexion.wifiLibre,
            bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY), bm.isCharging,
            appVisible, PlaybackService.estaSonando()
        )
    }

    private fun cancelarTemporizador() {
        temporizador?.cancel()
        temporizador = null
    }

    private fun programarReintento() {
        cancelarTemporizador()
        temporizador = alcance.launch {
            delay(PlanSinConexion.ESPERA_TRAS_CORTE_MS + 1_000L) // margen: noAntesDe usa otro reloj
            temporizador = null
            despertar(app)
        }
    }

    private suspend fun bucle() {
        val propia = currentCoroutineContext()[Job]
        try {
            while (true) {
                synchronized(this) { otraPasada = false }
                pasada()
                val seguir = synchronized(this) {
                    if (!otraPasada) tarea = null
                    otraPasada
                }
                if (!seguir) return
            }
        } finally {
            // Si otra tarea ya tomó el relevo, el indicador es suyo.
            val emitir = synchronized(this) {
                if (tarea == null || tarea === propia) {
                    val cambia = descargando
                    descargando = false
                    cambia
                } else false
            }
            if (emitir) EventosReproductor.emitir("sinConexion", estado())
        }
    }

    private enum class Resultado { PARAR, HECHA, FALLO }

    private suspend fun pasada() {
        indiceTope = -1
        if (!CacheSinConexion.disponible) return
        val version = versionSeleccion
        val limite = limiteBytes
        val seleccion = ids
        // El ajuste al límite va antes de las condiciones: bajar el límite libera espacio aunque «Guardar» esté apagado.
        // Límite 0 = aún sin fijar (nunca viene de JS): no se vacía la caché por eso.
        while (limite > 0 && CacheSinConexion.bytesUsados() > limite) {
            val v = PlanSinConexion.victima(CacheSinConexion.guardadas(), seleccion, -1, PlaybackService.idActual()) ?: break
            CacheSinConexion.quitar(v)
        }
        if (!puede() || SystemClock.elapsedRealtime() < noAntesDe) return
        cancelarTemporizador() // esta pasada ya trabaja; si vuelve a cortar, programará otro
        var seguidos = 0 // fallos seguidos de canciones (no de red)
        for ((i, id) in seleccion.withIndex()) {
            if (!puede() || versionSeleccion != version) return
            val desde = fallidas[id]
            if (desde != null) {
                if (PlanSinConexion.fallidaVigente(desde, SystemClock.elapsedRealtime())) continue
                fallidas.remove(id)
            }
            if (CacheSinConexion.completa(id)) continue
            val resultado = try {
                descargar(i, id, seleccion, limite)
            } catch (e: CancellationException) {
                throw e
            } catch (e: InterruptedIOException) {
                Log.i(TAG, "descarga en pausa ($id)") // el vigilante o borrar() la cortaron
                return
            } catch (e: Exception) {
                // Sin red o sin condiciones el fallo es de la conexión, no de la canción: pausa.
                if (!RedSinConexion.hayRed || !puede()) {
                    Log.i(TAG, "descarga en pausa por red/condiciones ($id): ${e.message}")
                    return
                }
                Log.w(TAG, "falló $id: ${e.message}")
                fallidas[id] = SystemClock.elapsedRealtime()
                Resultado.FALLO
            }
            when (resultado) {
                Resultado.PARAR -> return
                Resultado.HECHA -> seguidos = 0
                Resultado.FALLO -> {
                    seguidos += 1
                    if (seguidos >= PlanSinConexion.FALLOS_SEGUIDOS_MAX) {
                        // Wifi sin salida, bloqueo de YouTube...: no marcar el resto, parar y esperar.
                        Log.w(TAG, "$seguidos fallos seguidos: pasada cortada")
                        noAntesDe = SystemClock.elapsedRealtime() + PlanSinConexion.ESPERA_TRAS_CORTE_MS
                        programarReintento()
                        return
                    }
                }
            }
            // Pausa entre canciones (más larga tras fallos) para no pedir resoluciones en ráfaga.
            if (i < seleccion.lastIndex) {
                delay(PlanSinConexion.esperaMs(seguidos))
                if (versionSeleccion != version) return
            }
        }
    }

    /** PARAR = no cabe más (indiceTope fijado); HECHA = guardada; FALLO = esta canción no se pudo. */
    private suspend fun descargar(i: Int, id: String, seleccion: List<String>, limite: Long): Resultado {
        val r = ResolutorYouTube.resolver(id)
        val uri = r.url.toUri()
        val clen = uri.getQueryParameter("clen")?.toLongOrNull()
        if (clen == null) {
            Log.w(TAG, "sin clen: $id")
            fallidas[id] = SystemClock.elapsedRealtime() // si no, se re-resolvería en cada despertar
            return Resultado.FALLO
        }
        val clave = PlanSinConexion.clave(id, uri.getQueryParameter("itag") ?: "0")
        val cache = CacheSinConexion.cache
        // Una calidad distinta guardada antes ya no sirve.
        val otras = cache.keys.filter { PlanSinConexion.idDeClave(it) == id && it != clave }
        otras.forEach { cache.removeResource(it) }
        if (otras.isNotEmpty()) CacheSinConexion.avisarCambio()
        val cacheados = cache.getCachedBytes(clave, 0, clen)
        while (CacheSinConexion.bytesUsados() + clen - cacheados > limite) {
            val v = PlanSinConexion.victima(CacheSinConexion.guardadas(), seleccion, i, PlaybackService.idActual())
            if (v == null) {
                indiceTope = i
                Log.i(TAG, "límite alcanzado en $i")
                EventosReproductor.emitir("sinConexion", estado())
                return Resultado.PARAR
            }
            CacheSinConexion.quitar(v)
        }
        // Cabeceras propias de la fuente: el mapa global es de lo que suena y no debe tocarse desde aquí.
        val fuente = CacheSinConexion.fuenteDescarga(
            FuenteTroceada.Factory(
                DefaultDataSource.Factory(
                    app,
                    DefaultHttpDataSource.Factory()
                        .setDefaultRequestProperties(r.headers)
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(15_000)
                        .setReadTimeoutMs(20_000)
                )
            )
        )
        val w = CacheWriter(fuente, DataSpec.Builder().setUri(r.url).setKey(clave).build(), null, null)
        escritor = w
        val vigilante = alcance.launch {
            while (isActive) {
                delay(PERIODO_VIGILANTE_MS)
                if (!puede()) w.cancel()
            }
        }
        try {
            Log.i(TAG, "descargando $id ($cacheados/$clen)")
            withContext(Dispatchers.IO) { w.cache() }
        } finally {
            vigilante.cancel()
            escritor = null
        }
        r.loudnessDb?.let { CacheSinConexion.guardarSonoridad(clave, it) }
        CacheSinConexion.avisarCambio()
        Log.i(TAG, "guardada $id")
        return Resultado.HECHA
    }

    fun estado(): JSObject {
        val guardadas = CacheSinConexion.idsGuardados()
        val sonoridad = JSObject()
        guardadas.forEach { id -> CacheSinConexion.sonoridad(id)?.let { sonoridad.put(id, it) } }
        val arr = JSArray()
        guardadas.forEach { arr.put(it) }
        return JSObject()
            .put("idsGuardados", arr)
            .put("bytesUsados", CacheSinConexion.bytesUsados())
            .put("descargando", descargando)
            .put("indiceTope", indiceTope)
            .put("sonoridad", sonoridad)
    }

    /** Cancela la descarga en curso, vacía la caché y la selección; [alTerminar] se llama al acabar. */
    fun borrar(ctx: Context, alTerminar: () -> Unit) {
        cargar(ctx)
        ids = emptyList()
        guardarAjustes()
        escritor?.cancel()
        cancelarTemporizador()
        alcance.launch {
            try {
                tarea?.cancelAndJoin()
                fallidas.clear()
                CacheSinConexion.borrarTodo()
            } finally {
                alTerminar()
            }
        }
    }
}
