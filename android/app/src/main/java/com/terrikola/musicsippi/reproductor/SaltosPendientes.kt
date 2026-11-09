package com.terrikola.musicsippi.reproductor

import android.content.Context
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject

/**
 * Saltos rápidos, canciones oídas (> 70 %) y reproducciones con el JS dormido (pantalla bloqueada,
 * notificación, auricular). Se guardan en SharedPreferences (máx. 400, unas horas de cola bloqueada)
 * y JS los recoge y vacía al despertar. Cada anotación lleva título y artista del MediaItem: JS busca
 * la canción por ellos aunque el proceso haya muerto. Sin `tipo` (anotaciones antiguas) es un salto;
 * `tipo: "oida"` lleva `fraccion`; `tipo: "reproduccion"` es una entrada del historial con su hora real.
 */
object SaltosPendientes {
    private const val PREFS = "saltos_pendientes"
    private const val CLAVE = "lista"
    private const val MAX = 400

    fun anotar(ctx: Context, id: String, posicionMs: Long, titulo: String?, artista: String?) =
        guardar(ctx, JSONObject().put("id", id).put("segundos", posicionMs / 1000.0), titulo, artista)

    fun anotarOida(ctx: Context, id: String, fraccion: Double, titulo: String?, artista: String?) =
        guardar(ctx, JSONObject().put("id", id).put("tipo", "oida").put("fraccion", fraccion), titulo, artista)

    fun anotarReproduccion(ctx: Context, id: String, titulo: String?, artista: String?) =
        guardar(ctx, JSONObject().put("id", id).put("tipo", "reproduccion"), titulo, artista)

    @Synchronized
    private fun guardar(ctx: Context, entrada: JSONObject, titulo: String?, artista: String?) {
        val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lista = try { JSONArray(p.getString(CLAVE, "[]")) } catch (_: Exception) { JSONArray() }
        entrada.put("ts", System.currentTimeMillis())
        if (!titulo.isNullOrBlank()) entrada.put("titulo", titulo)
        if (!artista.isNullOrBlank()) entrada.put("artista", artista)
        lista.put(entrada)
        val recortada = JSONArray()
        for (i in maxOf(0, lista.length() - MAX) until lista.length()) recortada.put(lista.get(i))
        p.edit().putString(CLAVE, recortada.toString()).apply()
    }

    /** Devuelve {saltos: [...]} y vacía la lista. */
    @Synchronized
    fun recoger(ctx: Context): JSObject {
        val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lista = try { JSONArray(p.getString(CLAVE, "[]")) } catch (_: Exception) { JSONArray() }
        p.edit().remove(CLAVE).apply()
        return JSObject().put("saltos", lista)
    }
}
