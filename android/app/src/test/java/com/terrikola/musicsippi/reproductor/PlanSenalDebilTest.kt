package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanSenalDebilTest {
    @Test fun conexion_fallida_y_timeout_son_red() {
        assertTrue(PlanSenalDebil.esErrorDeRed(2001, null))
        assertTrue(PlanSenalDebil.esErrorDeRed(2002, null))
    }

    @Test fun io_sin_especificar_solo_con_causa_de_red() {
        assertTrue(PlanSenalDebil.esErrorDeRed(2000, java.io.IOException(java.net.SocketException("reset"))))
        assertTrue(PlanSenalDebil.esErrorDeRed(2000, java.net.UnknownHostException("x")))
        assertTrue(PlanSenalDebil.esErrorDeRed(2000, java.net.ProtocolException("unexpected end of stream")))
        assertFalse(PlanSenalDebil.esErrorDeRed(2000, java.io.EOFException()))
        assertFalse(PlanSenalDebil.esErrorDeRed(2000, null))
    }

    @Test fun http_403_no_es_red() {
        // ERROR_CODE_IO_BAD_HTTP_STATUS: la URL caducó, eso lo arregla JS volviendo a resolver.
        assertFalse(PlanSenalDebil.esErrorDeRed(2004, java.net.SocketException("x")))
        assertFalse(PlanSenalDebil.esErrorDeRed(4001, null))
    }

    @Test fun io_sin_especificar_con_ioexception_cualquiera_es_red() {
        assertTrue(PlanSenalDebil.esErrorDeRed(2000, RuntimeException(java.io.IOException("read failed"))))
    }

    @Test fun cortada_al_final_retoma_la_siguiente_desde_cero() {
        assertEquals(3 to 0L, PlanSenalDebil.puntoDeVuelta(2, 247_000, 248_000, 5))
        assertEquals(2 to 120_000L, PlanSenalDebil.puntoDeVuelta(2, 120_000, 248_000, 5))
        // Última de la cola o sin duración conocida: se retoma donde estaba.
        assertEquals(4 to 247_000L, PlanSenalDebil.puntoDeVuelta(4, 247_000, 248_000, 5))
        assertEquals(2 to 247_000L, PlanSenalDebil.puntoDeVuelta(2, 247_000, 0, 5))
    }

    @Test fun gracia_no_vence_antes_de_8s() {
        assertFalse(PlanSenalDebil.graciaVencida(1_000, 8_999))
        assertTrue(PlanSenalDebil.graciaVencida(1_000, 9_000))
    }

    @Test fun tras_gracia_respaldo_o_espera() {
        assertEquals(PlanSenalDebil.Fase.RESPALDO, PlanSenalDebil.faseTrasGracia(true))
        assertEquals(PlanSenalDebil.Fase.ESPERANDO, PlanSenalDebil.faseTrasGracia(false))
    }

    @Test fun siguiente_salta_recientes_y_la_actual() {
        assertEquals("c", PlanSenalDebil.siguienteRespaldo(listOf("a", "b", "c"), listOf("a"), "b"))
    }

    @Test fun siguiente_con_todas_recientes_va_la_menos_reciente() {
        assertEquals("b", PlanSenalDebil.siguienteRespaldo(listOf("a", "b", "c"), listOf("b", "c", "a"), "a"))
    }

    @Test fun siguiente_con_una_sola_repite() {
        assertEquals("a", PlanSenalDebil.siguienteRespaldo(listOf("a"), listOf("a"), "a"))
        assertNull(PlanSenalDebil.siguienteRespaldo(emptyList(), emptyList(), null))
    }

    @Test fun recientes_al_final_y_con_tope() {
        val r = (1..12).fold(emptyList<String>()) { acc, i -> PlanSenalDebil.anotarReciente(acc, "$i") }
        assertEquals(PlanSenalDebil.MAX_RECIENTES, r.size)
        assertEquals("12", r.last())
        assertEquals(listOf("2", "1"), PlanSenalDebil.anotarReciente(listOf("1", "2"), "1"))
    }

    @Test fun respaldo_de_js_filtrado_y_si_no_cualquier_guardada() {
        val completa = { id: String -> id != "x" }
        assertEquals(listOf("a"), PlanSenalDebil.respaldoEfectivo(listOf("x", "a"), listOf("g"), completa))
        assertEquals(listOf("g"), PlanSenalDebil.respaldoEfectivo(listOf("x"), listOf("g", "x"), completa))
        assertEquals(emptyList<String>(), PlanSenalDebil.respaldoEfectivo(emptyList(), emptyList(), completa))
    }

    @Test fun al_pasar_de_guardada_vuelve_solo_con_senal_y_hacia_delante() {
        assertEquals(PlanSenalDebil.AlPasar.VOLVER, PlanSenalDebil.alPasarDeGuardada(true, true))
        assertEquals(PlanSenalDebil.AlPasar.SEGUIR, PlanSenalDebil.alPasarDeGuardada(true, false))
        assertEquals(PlanSenalDebil.AlPasar.SEGUIR, PlanSenalDebil.alPasarDeGuardada(false, true))
    }

    @Test fun anterior_en_modo_reinicia_la_primera_guardada() {
        assertTrue(PlanSenalDebil.anteriorEnModo(500, 0))
        assertTrue(PlanSenalDebil.anteriorEnModo(5_000, 1))
        assertFalse(PlanSenalDebil.anteriorEnModo(500, 1))
    }

    @Test fun sondeo_se_alarga_tras_2_fallos() {
        assertEquals(15_000L, PlanSenalDebil.intervaloSondeo(1))
        assertEquals(60_000L, PlanSenalDebil.intervaloSondeo(2))
    }

    @Test fun estancado_solo_en_red_y_pasados_10s() {
        assertFalse(PlanSenalDebil.estancado(null, 50_000, true))
        assertFalse(PlanSenalDebil.estancado(0, 9_999, true))
        assertTrue(PlanSenalDebil.estancado(0, 10_000, true))
        assertFalse(PlanSenalDebil.estancado(0, 60_000, false))
    }

    @Test fun artista_en_modo_lleva_el_aviso() {
        assertEquals("Sin señal: sonando música guardada", PlanSenalDebil.artistaEnModo(null))
        assertEquals("Sin señal · Soda Stereo", PlanSenalDebil.artistaEnModo("Soda Stereo"))
    }
}
