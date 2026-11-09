package com.terrikola.musicsippi.reproductor

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lo que sonaba, para reanudar si el sistema cierra la app. Tras 10 minutos en pausa el servicio deja
 * de ser de primer plano y HyperOS puede matar el proceso, pero su tarjeta de la pantalla de bloqueo
 * sigue ahí: sin esto, pulsar ▶ arranca un reproductor vacío y se queda en 00:00.
 */
object ColaReanudar {
    private const val PREFS = "cola_reanudar"
    private const val CLAVE = "cola"
    private const val MAX_SIGUIENTES = 100

    class Entrada(val id: String, val titulo: String?, val artista: String?, val album: String?, val portadaUrl: String?, val uriLocal: String?)
    class Guardada(val actual: Entrada, val posicionMs: Long, val siguientes: List<Entrada>)

    fun guardar(ctx: Context, actual: Entrada, posicionMs: Long, siguientes: List<Entrada>) {
        val json = JSONObject()
            .put("actual", aJson(actual))
            .put("posicionMs", posicionMs)
            .put("siguientes", JSONArray().apply { siguientes.take(MAX_SIGUIENTES).forEach { put(aJson(it)) } })
        prefs(ctx).edit().putString(CLAVE, json.toString()).apply()
    }

    fun leer(ctx: Context): Guardada? = try {
        prefs(ctx).getString(CLAVE, null)?.let { JSONObject(it) }?.let { json ->
            val lista = json.getJSONArray("siguientes")
            Guardada(
                deJson(json.getJSONObject("actual")),
                json.getLong("posicionMs"),
                (0 until lista.length()).map { deJson(lista.getJSONObject(it)) }
            )
        }
    } catch (_: Exception) {
        null
    }

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun aJson(e: Entrada) = JSONObject()
        .put("id", e.id)
        .putOpt("titulo", e.titulo)
        .putOpt("artista", e.artista)
        .putOpt("album", e.album)
        .putOpt("portadaUrl", e.portadaUrl)
        .putOpt("uriLocal", e.uriLocal)

    private fun deJson(j: JSONObject) = Entrada(
        j.getString("id"), texto(j, "titulo"), texto(j, "artista"), texto(j, "album"), texto(j, "portadaUrl"), texto(j, "uriLocal")
    )

    private fun texto(j: JSONObject, clave: String): String? = if (j.has(clave)) j.getString(clave) else null
}
