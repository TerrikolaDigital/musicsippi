package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.AesCipherDataSink
import androidx.media3.datasource.AesCipherDataSource
import androidx.media3.datasource.DataSink
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.FileDataSource
import androidx.media3.datasource.PlaceholderDataSource
import androidx.media3.datasource.cache.CacheDataSink
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.ContentMetadataMutations
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * Caché cifrada de canciones guardadas para escuchar sin conexión.
 * Vive en filesDir (no cacheDir: el sistema no debe vaciarla), una sola instancia
 * por proceso. El límite de tamaño lo gestiona Musicsippi borrando canciones enteras.
 */
@OptIn(UnstableApi::class)
object CacheSinConexion {
    const val URL_SIN_CONEXION = "https://sin-conexion.musicsippi.invalid/"
    private const val META_SONORIDAD = "custom_sonoridad"

    /** Se llama cuando cambia el conjunto de canciones guardadas. */
    @Volatile var oyente: (() -> Unit)? = null

    private var instancia: SimpleCache? = null
    private var clave: ByteArray = ByteArray(0)

    /**
     * false si el Keystore o el disco fallaron al abrir la caché: «sin conexión» queda desactivada
     * (nada guardado, nada que descargar) pero la reproducción normal no se ve afectada.
     */
    @Volatile var disponible: Boolean = false
        private set

    /** Solo usar con [disponible] confirmado. */
    val cache: SimpleCache
        get() = instancia ?: error("CacheSinConexion no disponible")

    @Synchronized
    fun init(ctx: Context) {
        if (instancia != null || disponible) return
        try {
            val app = ctx.applicationContext
            val k = ClaveSinConexion.obtener(app)
            val carpeta = File(app.filesDir, "sin-conexion")
            val bd = StandaloneDatabaseProvider(app)
            // Clave nueva: lo que quede en disco está cifrado con otra y sonaría a ruido.
            if (k.nueva) SimpleCache.delete(carpeta, bd)
            clave = k.bytes
            instancia = SimpleCache(carpeta, NoOpCacheEvictor(), bd)
            disponible = true
        } catch (e: Exception) {
            Log.e("SinConexion", "caché sin conexión no disponible: ${e.message}", e)
        }
    }

    fun avisarCambio() {
        oyente?.invoke()
    }

    private fun clavesDe(id: String): List<String> =
        instancia?.keys?.filter { PlanSinConexion.idDeClave(it) == id }.orEmpty()

    private fun largo(clave: String): Long =
        instancia?.let { ContentMetadata.getContentLength(it.getContentMetadata(clave)) } ?: 0L

    private fun estaCompleta(clave: String): Boolean {
        val largo = largo(clave)
        return largo > 0 && instancia?.isCached(clave, 0, largo) == true
    }

    fun claveCompleta(id: String): String? = clavesDe(id).firstOrNull { estaCompleta(it) }

    fun completa(id: String): Boolean = claveCompleta(id) != null

    /** Ids con algún dato en caché, también a medio descargar (para el desalojo). */
    private fun idsConDatos(): List<String> = instancia?.keys.orEmpty().mapNotNull { PlanSinConexion.idDeClave(it) }.distinct()

    /** Solo canciones completas: es lo que JS considera «guardadas». */
    fun idsGuardados(): List<String> = idsConDatos().filter { completa(it) }

    fun bytesUsados(): Long = instancia?.cacheSpace ?: 0L

    fun guardadas(): List<PlanSinConexion.Guardada> =
        idsConDatos().map { id ->
            PlanSinConexion.Guardada(id, clavesDe(id).sumOf { k -> instancia?.getCachedSpans(k)?.sumOf { it.length } ?: 0L })
        }

    fun sonoridad(id: String): Double? {
        val c = instancia ?: return null
        for (k in clavesDe(id)) {
            val v = c.getContentMetadata(k).get(META_SONORIDAD, null as String?)
            v?.toDoubleOrNull()?.takeIf { !it.isNaN() }?.let { return it }
        }
        return null
    }

    /** Guarda la sonoridad de una canción en los metadatos de su clave de caché. */
    fun guardarSonoridad(clave: String, valor: Double) {
        instancia?.applyContentMetadataMutations(
            clave, ContentMetadataMutations().set(META_SONORIDAD, valor.toString())
        )
    }

    fun quitar(id: String) {
        clavesDe(id).forEach { instancia?.removeResource(it) }
        avisarCambio()
    }

    fun borrarTodo() {
        val c = instancia ?: return
        c.keys.toList().forEach { c.removeResource(it) }
        avisarCambio()
    }

    private fun lectura(): DataSource.Factory = DataSource.Factory { AesCipherDataSource(clave, FileDataSource()) }

    /** Reproduce canciones completas desde la caché; sin red ni escritura. */
    fun fabricaLectura(): DataSource.Factory {
        val c = instancia ?: return PlaceholderDataSource.FACTORY // nada se adapta a la caché si no está disponible
        return CacheDataSource.Factory()
            .setCache(c)
            .setCacheReadDataSourceFactory(lectura())
            .setCacheWriteDataSinkFactory(null)
            .setUpstreamDataSourceFactory(PlaceholderDataSource.FACTORY)
    }

    /** Fuente de lectura y escritura cifradas, para `CacheWriter`. */
    fun fuenteDescarga(upstream: DataSource.Factory): CacheDataSource =
        CacheDataSource.Factory()
            .setCache(cache)
            .setCacheReadDataSourceFactory(lectura())
            .setCacheWriteDataSinkFactory(DataSink.Factory {
                AesCipherDataSink(clave, CacheDataSink(cache, CacheDataSink.DEFAULT_FRAGMENT_SIZE), ByteArray(64 * 1024))
            })
            .setUpstreamDataSourceFactory(upstream)
            .createDataSource()

    /** Si la canción está completa en caché, la apunta a la clave guardada. */
    fun adaptar(item: MediaItem): MediaItem {
        val k = claveCompleta(item.mediaId) ?: return item
        return item.buildUpon().setUri(URL_SIN_CONEXION + item.mediaId).setCustomCacheKey(k).build()
    }
}
