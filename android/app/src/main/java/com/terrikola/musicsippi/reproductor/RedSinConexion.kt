package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities

/**
 * Estado de la red para decidir qué se puede reproducir o descargar.
 * hayRed = hay salida a Internet; wifiLibre = además la red no es de pago por uso y el
 * sistema ha comprobado que llega a Internet (un portal cautivo no cuenta).
 */
object RedSinConexion {
    @Volatile var hayRed: Boolean = false
        private set
    @Volatile var wifiLibre: Boolean = false
        private set

    private val oyentes = java.util.concurrent.CopyOnWriteArrayList<(hayRed: Boolean, medida: Boolean) -> Unit>()

    // Último par avisado: las capacidades cambian con cada variación de señal y no deben ser eventos.
    private var avisado: Pair<Boolean, Boolean>? = null

    private var iniciado = false

    /** Se invoca desde el hilo del callback de red: no hacer trabajo pesado dentro. */
    fun agregarOyente(oyente: (hayRed: Boolean, medida: Boolean) -> Unit) {
        oyentes.addIfAbsent(oyente)
    }

    fun quitarOyente(oyente: (hayRed: Boolean, medida: Boolean) -> Unit) {
        oyentes.remove(oyente)
    }

    private fun capacidades(c: NetworkCapabilities?) {
        hayRed = c?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        wifiLibre = hayRed &&
            c?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true &&
            c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    @Synchronized
    private fun avisar() {
        val par = hayRed to wifiLibre
        if (par == avisado) return
        avisado = par
        oyentes.forEach { it(hayRed, !wifiLibre) }
    }

    @Synchronized
    fun init(ctx: Context) {
        if (iniciado) return
        val cm = ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        capacidades(cm.activeNetwork?.let { cm.getNetworkCapabilities(it) })
        avisado = hayRed to wifiLibre
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, c: NetworkCapabilities) {
                capacidades(c)
                avisar()
            }

            override fun onLost(network: Network) {
                // Al pasar de wifi a datos el sistema puede avisar de la red vieja con otra ya activa.
                capacidades(cm.activeNetwork?.let { cm.getNetworkCapabilities(it) })
                avisar()
            }
        })
        iniciado = true
    }
}
