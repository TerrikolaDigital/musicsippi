package com.terrikola.musicsippi.reproductor

import com.metrolist.innertubex.models.YouTubeLocale
import java.util.Locale

/**
 * Idioma y país para InnerTube a partir del sistema. YouTube da cualquier vídeo por inexistente si
 * `hl` trae algo más que idioma y país: preferencias regionales («es-ES-u-mu-celsius»), escritura
 * («es-Latn-ES») o variante («ca-ES-valencia»). Lo que no sea un país de dos letras (es-419) va vacío
 * en `gl`: no admite regiones numéricas.
 */
internal fun localeParaYouTube(sistema: Locale): YouTubeLocale {
    val hl = Locale(sistema.language, sistema.country).toLanguageTag().takeUnless { it == "und" } ?: "en"
    val gl = sistema.country.takeIf { it.length == 2 }?.uppercase(Locale.ROOT).orEmpty()
    return YouTubeLocale(gl = gl, hl = hl)
}

/** Si YouTube rechaza el idioma del móvil (como el falso en-XA): inglés, sin tocar el país, que decide el catálogo. */
internal fun localeDeReserva(actual: YouTubeLocale) = actual.copy(hl = "en-US")
