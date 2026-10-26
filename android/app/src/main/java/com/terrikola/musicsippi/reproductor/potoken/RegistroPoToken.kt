package com.terrikola.musicsippi.reproductor.potoken

import android.util.Log
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Sustituye a TrackLog y Http de BitChord en los archivos copiados del minter de PO token. */
internal object RegistroPoToken {
    // Equivale a BuildConfig.DEBUG de BitChord (este proyecto no genera BuildConfig).
    const val depuracion = false
    val http: OkHttpClient by lazy {
        OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
    }
    fun d(tag: String, msg: String) { Log.d(tag, msg) }
    fun w(tag: String, msg: String) { Log.w(tag, msg) }
    fun e(tag: String, msg: String) { Log.e(tag, msg) }
}
