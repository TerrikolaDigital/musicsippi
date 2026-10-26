package com.terrikola.musicsippi.reproductor

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Looper
import android.os.PowerManager
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Servicio del modo iframe: aloja el [ReproductorEspejo] en una MediaSession.
 * Con playWhenReady=true y estado READY, Media3 lo promueve a foreground
 * (mediaPlayback) y muestra la notificacion; eso mantiene vivo el proceso (y
 * el WebView con el iframe) con la pantalla bloqueada.
 *
 * Como no hay ExoPlayer que gestione el wake lock, aqui se toman un
 * PARTIAL_WAKE_LOCK y un WifiLock mientras se quiere sonar.
 */
@OptIn(UnstableApi::class)
class ServicioEspejo : MediaSessionService() {

    private var sesion: MediaSession? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onCreate() {
        super.onCreate()
        val espejo = ReproductorEspejo(Looper.getMainLooper())
        espejo.addListener(object : Player.Listener {
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = ajustarBloqueos()
            override fun onPlaybackStateChanged(playbackState: Int) = ajustarBloqueos()
        })
        reproductor = espejo

        val abrirApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
        sesion = MediaSession.Builder(this, espejo)
            .setId("musicsippi-espejo")
            .apply { if (abrirApp != null) setSessionActivity(abrirApp) }
            .build()
        setMediaNotificationProvider(DefaultMediaNotificationProvider(this))
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = sesion

    /** Quitar la app de recientes no corta la musica (igual que PlaybackService). */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = reproductor
        if (p == null || !p.playWhenReady || p.playbackState == Player.STATE_ENDED) stopSelf()
    }

    override fun onDestroy() {
        soltarBloqueos()
        sesion?.release()
        sesion = null
        reproductor?.release()
        reproductor = null
        super.onDestroy()
    }

    private fun ajustarBloqueos() {
        val p = reproductor ?: return
        val activo = p.playWhenReady &&
            (p.playbackState == Player.STATE_READY || p.playbackState == Player.STATE_BUFFERING)
        if (activo) tomarBloqueos() else soltarBloqueos()
    }

    private fun tomarBloqueos() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "musicsippi:espejo").apply {
                setReferenceCounted(false)
            }
        }
        if (wakeLock?.isHeld != true) wakeLock?.acquire(SEIS_HORAS_MS)
        if (wifiLock == null) {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "musicsippi:espejo").apply {
                setReferenceCounted(false)
            }
        }
        if (wifiLock?.isHeld != true) wifiLock?.acquire()
    }

    private fun soltarBloqueos() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
        if (wifiLock?.isHeld == true) wifiLock?.release()
    }

    companion object {
        private const val SEIS_HORAS_MS = 6L * 60 * 60 * 1000

        /** Player vivo mientras el servicio existe; el plugin lo alimenta (hilo principal). */
        @Volatile
        var reproductor: ReproductorEspejo? = null
            private set
    }
}
