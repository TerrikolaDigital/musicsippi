package com.terrikola.musicsippi.reproductor

import android.content.Context
import android.content.SharedPreferences
import android.media.AudioManager
import android.media.audiofx.AudioEffect
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * Efectos de audio sobre el audioSessionId del ExoPlayer: ecualizador, refuerzo de graves
 * (BassBoost) y sonido envolvente (Virtualizer). La configuración se guarda en
 * SharedPreferences y se vuelve a aplicar cada vez que el servicio (re)crea el player o
 * ExoPlayer cambia de sesión de audio. Todo va en try/catch: muchos móviles no soportan
 * alguno de estos efectos y no debe romper la reproducción.
 *
 * Se usa siempre desde el hilo principal (servicio y métodos del plugin).
 */
object EfectosAudio {
    private const val PREFS = "musicsippi_efectos"
    private const val INTENSIDAD_ENVOLVENTE_POR_DEFECTO = 700

    private var prefs: SharedPreferences? = null
    private var eq: Equalizer? = null
    private var graves: BassBoost? = null
    private var envolvente: Virtualizer? = null

    // Configuración (persistida).
    private var ecActivo = false
    private var preset = -1 // -1 = Personalizado
    private var bandasMb: IntArray? = null // niveles propios (mB) cuando preset = -1
    private var fuerzaGraves = 0 // 0..1000
    private var envActivo = false
    private var fuerzaEnvolvente = INTENSIDAD_ENVOLVENTE_POR_DEFECTO

    private fun cargar(contexto: Context) {
        if (prefs != null) return
        val p = contexto.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = p
        ecActivo = p.getBoolean("ecActivo", false)
        preset = p.getInt("preset", -1)
        bandasMb = p.getString("bandas", null)?.split(',')?.mapNotNull { it.trim().toIntOrNull() }?.toIntArray()
            ?.takeIf { it.isNotEmpty() }
        fuerzaGraves = p.getInt("graves", 0).coerceIn(0, 1000)
        envActivo = p.getBoolean("envActivo", false)
        fuerzaEnvolvente = p.getInt("envFuerza", INTENSIDAD_ENVOLVENTE_POR_DEFECTO).coerceIn(0, 1000)
    }

    private fun guardar() {
        prefs?.edit()
            ?.putBoolean("ecActivo", ecActivo)
            ?.putInt("preset", preset)
            ?.putString("bandas", bandasMb?.joinToString(","))
            ?.putInt("graves", fuerzaGraves)
            ?.putBoolean("envActivo", envActivo)
            ?.putInt("envFuerza", fuerzaEnvolvente)
            ?.apply()
    }

    // ---- Ciclo de vida (lo llama PlaybackService) ----------------------------

    /** Engancha los efectos a la sesión de audio [sesion] (la del ExoPlayer) y aplica lo guardado. */
    @JvmStatic
    fun adjuntar(contexto: Context, sesion: Int) {
        cargar(contexto)
        soltar()
        if (sesion <= 0) return // C.AUDIO_SESSION_ID_UNSET: aún no hay sesión
        eq = crear { Equalizer(0, sesion) }
        graves = crear { BassBoost(0, sesion) }
        envolvente = crear { Virtualizer(0, sesion) }
        aplicarA(eq, graves, envolvente)
    }

    @JvmStatic
    fun soltar() {
        runCatching { eq?.release() }
        runCatching { graves?.release() }
        runCatching { envolvente?.release() }
        eq = null
        graves = null
        envolvente = null
    }

    private fun <T : AudioEffect> crear(f: () -> T): T? =
        try { f() } catch (e: Exception) {
            android.util.Log.w("EfectosAudio", "efecto no disponible: ${e.message}")
            null
        }

    private fun aplicarA(e: Equalizer?, g: BassBoost?, v: Virtualizer?) {
        runCatching {
            if (e != null) {
                if (ecActivo) {
                    if (preset in 0 until e.numberOfPresets.toInt()) {
                        e.usePreset(preset.toShort())
                    } else {
                        val rango = e.bandLevelRange
                        bandasMb?.forEachIndexed { i, mb ->
                            if (i < e.numberOfBands) e.setBandLevel(i.toShort(), mb.coerceIn(rango[0].toInt(), rango[1].toInt()).toShort())
                        }
                    }
                }
                e.enabled = ecActivo
            }
        }
        runCatching {
            if (g != null && g.strengthSupported) {
                g.setStrength(fuerzaGraves.toShort())
                g.enabled = ecActivo && fuerzaGraves > 0
            }
        }
        runCatching {
            if (v != null && v.strengthSupported) {
                v.setStrength(fuerzaEnvolvente.toShort())
                v.enabled = envActivo
            }
        }
    }

    private fun reaplicar() = aplicarA(eq, graves, envolvente)

    // ---- Órdenes del plugin -------------------------------------------------------

    @JvmStatic
    fun ajustarEcualizador(contexto: Context, activo: Boolean?, indicePreset: Int?, banda: Int?, nivelMb: Int?, fuerzaGravesNueva: Int?): JSObject {
        cargar(contexto)
        if (activo != null) ecActivo = activo
        if (indicePreset != null) preset = indicePreset
        if (banda != null && nivelMb != null) {
            // Mover una banda a mano pasa a «Personalizado» partiendo de lo que suena ahora.
            val base = nivelesActuales(contexto)
            if (banda in base.indices) base[banda] = nivelMb
            bandasMb = base
            preset = -1
        }
        if (fuerzaGravesNueva != null) fuerzaGraves = fuerzaGravesNueva.coerceIn(0, 1000)
        guardar()
        reaplicar()
        return estado(contexto)
    }

    @JvmStatic
    fun ajustarEnvolvente(contexto: Context, activo: Boolean?, fuerza: Int?): JSObject {
        cargar(contexto)
        if (activo != null) envActivo = activo
        if (fuerza != null) fuerzaEnvolvente = fuerza.coerceIn(0, 1000)
        guardar()
        reaplicar()
        return estado(contexto)
    }

    /** Niveles (mB) que tienen ahora las bandas, según el efecto vivo o, si no, una sonda. */
    private fun nivelesActuales(contexto: Context): IntArray {
        fun leer(e: Equalizer) = runCatching { IntArray(e.numberOfBands.toInt()) { e.getBandLevel(it.toShort()).toInt() } }
            .getOrDefault(IntArray(0))
        eq?.let { return leer(it) }
        val sesion = (contexto.getSystemService(Context.AUDIO_SERVICE) as AudioManager).generateAudioSessionId()
        val sonda = crear { Equalizer(0, sesion) } ?: return bandasMb ?: IntArray(0)
        try {
            aplicarA(sonda, null, null)
            return leer(sonda)
        } finally {
            runCatching { sonda.release() }
        }
    }

    /**
     * Estado para la pantalla. Si el servicio aún no ha enganchado efectos (no ha sonado nada)
     * se sondea el dispositivo con una sesión de audio descartable.
     */
    @JvmStatic
    fun estado(contexto: Context): JSObject {
        cargar(contexto)
        var sonda: Triple<Equalizer?, BassBoost?, Virtualizer?>? = null
        val e: Equalizer?
        val g: BassBoost?
        val v: Virtualizer?
        if (eq != null || graves != null || envolvente != null) {
            e = eq; g = graves; v = envolvente
        } else {
            val sesion = (contexto.getSystemService(Context.AUDIO_SERVICE) as AudioManager).generateAudioSessionId()
            val se = crear { Equalizer(0, sesion) }
            val sg = crear { BassBoost(0, sesion) }
            val sv = crear { Virtualizer(0, sesion) }
            aplicarA(se, sg, sv)
            sonda = Triple(se, sg, sv)
            e = se; g = sg; v = sv
        }
        try {
            val r = JSObject()
            r.put("ecualizadorSoportado", e != null)
            r.put("activo", ecActivo)
            r.put("preset", preset)
            val nombres = JSArray()
            val bandas = JSArray()
            if (e != null) {
                runCatching {
                    for (i in 0 until e.numberOfPresets.toInt()) nombres.put(e.getPresetName(i.toShort()))
                    val rango = e.bandLevelRange
                    for (i in 0 until e.numberOfBands.toInt()) {
                        bandas.put(
                            JSObject()
                                .put("centroHz", e.getCenterFreq(i.toShort()) / 1000)
                                .put("minMb", rango[0].toInt())
                                .put("maxMb", rango[1].toInt())
                                .put("nivelMb", e.getBandLevel(i.toShort()).toInt())
                        )
                    }
                }
            }
            r.put("presets", nombres)
            r.put("bandas", bandas)
            r.put("gravesSoportado", g?.strengthSupported == true)
            r.put("graves", fuerzaGraves)
            r.put("envolventeSoportado", v?.strengthSupported == true)
            r.put("envolventeActivo", envActivo)
            r.put("envolventeFuerza", fuerzaEnvolvente)
            // Android 13+: el sistema tiene su propio audio espacial (ajustes de sonido); no lo
            // podemos activar desde la app, solo informar de si está disponible y encendido.
            var espacialDisponible = false
            var espacialActivo = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                runCatching {
                    val s = (contexto.getSystemService(Context.AUDIO_SERVICE) as AudioManager).spatializer
                    espacialDisponible = s.isAvailable
                    espacialActivo = s.isAvailable && s.isEnabled
                }
            }
            r.put("espacialSistemaDisponible", espacialDisponible)
            r.put("espacialSistemaActivo", espacialActivo)
            return r
        } finally {
            sonda?.let { (a, b, c) ->
                runCatching { a?.release() }
                runCatching { b?.release() }
                runCatching { c?.release() }
            }
        }
    }
}
