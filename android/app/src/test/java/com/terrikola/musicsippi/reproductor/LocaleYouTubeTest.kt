package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class LocaleYouTubeTest {

    private fun probar(etiqueta: String) = localeParaYouTube(Locale.forLanguageTag(etiqueta))

    @Test
    fun `las preferencias regionales no llegan a YouTube`() {
        // Con «-u-…» en hl, YouTube da cualquier vídeo por inexistente (Samsung S24 FE).
        assertEquals("es-ES", probar("es-ES-u-mu-celsius").hl)
        assertEquals("es-ES", probar("es-ES-u-fw-mon-mu-celsius").hl)
        assertEquals("ES", probar("es-ES-u-fw-mon-mu-celsius").gl)
    }

    @Test
    fun `solo viajan idioma y pais`() {
        // Con escritura o variante YouTube responde igual que con las preferencias regionales.
        assertEquals("es-ES", probar("es-Latn-ES").hl)
        assertEquals("ca-ES", probar("ca-ES-valencia").hl)
        assertEquals("zh-CN", probar("zh-Hans-CN").hl)
    }

    @Test
    fun `la reserva cambia el idioma y conserva el pais`() {
        val reserva = localeDeReserva(probar("en-XA"))
        assertEquals("en-US", reserva.hl)
        assertEquals("XA", reserva.gl)
    }

    @Test
    fun `un idioma normal no cambia`() {
        val locale = probar("es-ES")
        assertEquals("es-ES", locale.hl)
        assertEquals("ES", locale.gl)
    }

    @Test
    fun `una region numerica no se manda como pais`() {
        val locale = probar("es-419")
        assertEquals("es-419", locale.hl)
        assertEquals("", locale.gl)
    }

    @Test
    fun `sin idioma se usa ingles`() {
        assertEquals("en", localeParaYouTube(Locale.ROOT).hl)
    }
}
