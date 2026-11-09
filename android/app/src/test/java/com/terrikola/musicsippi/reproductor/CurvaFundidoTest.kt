package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CurvaFundidoTest {
    private val total = 6_000L // mitad = 3 s

    @Test fun apagado_no_toca_el_volumen() {
        assertEquals(1f, CurvaFundido.factor(100, 200_000, 0, salida = true, entrada = true), 0f)
    }

    @Test fun en_mitad_de_la_pista_es_pleno() {
        assertEquals(1f, CurvaFundido.factor(100_000, 200_000, total, salida = true, entrada = true), 0f)
    }

    @Test fun la_salida_baja_hasta_la_mitad_al_final() {
        val a = CurvaFundido.factor(198_500, 200_000, total, salida = true, entrada = false)
        assertTrue(a > 0f && a < 1f)
        assertEquals(0.5f, CurvaFundido.factor(200_000, 200_000, total, salida = true, entrada = false), 1e-6f)
    }

    @Test fun sin_salida_no_baja() {
        assertEquals(1f, CurvaFundido.factor(199_999, 200_000, total, salida = false, entrada = false), 0f)
    }

    @Test fun la_entrada_sube_desde_la_mitad() {
        assertEquals(0.5f, CurvaFundido.factor(0, 200_000, total, salida = false, entrada = true), 1e-6f)
        assertEquals(1f, CurvaFundido.factor(3_000, 200_000, total, salida = false, entrada = true), 1e-6f)
        assertEquals(0.8536f, CurvaFundido.factor(1_500, 200_000, total, salida = false, entrada = true), 1e-3f)
    }

    @Test fun nunca_baja_de_la_mitad() {
        for (pos in 0L..200_000L step 250L) {
            assertTrue(CurvaFundido.factor(pos, 200_000, total, salida = true, entrada = true) >= 0.5f)
        }
    }

    @Test fun sin_entrada_empieza_a_pleno() {
        assertEquals(1f, CurvaFundido.factor(0, 200_000, total, salida = false, entrada = false), 0f)
    }

    @Test fun pista_corta_limita_cada_mitad() {
        // 2 s de pista: mitad = 1 s, no 3 s; en el centro justo es pleno.
        assertEquals(1f, CurvaFundido.factor(1_000, 2_000, total, salida = true, entrada = true), 1e-6f)
    }

    @Test fun duracion_desconocida_no_baja() {
        assertEquals(1f, CurvaFundido.factor(50_000, -9_223_372_036_854_775_807L, total, salida = true, entrada = false), 0f)
    }

    // ExoPlayer avisa del salto de posición ANTES que de la transición: la entrada debe valer ya en ese aviso.
    @Test fun al_pasar_sola_a_otra_pista_la_entrada_ya_vale() {
        assertTrue(CurvaFundido.entradaTrasSalto(true, "a", "b", fundible = true, entradaActual = false))
    }

    @Test fun al_pasar_a_una_pista_no_fundible_no_hay_entrada() {
        assertFalse(CurvaFundido.entradaTrasSalto(true, "a", "b", fundible = false, entradaActual = true))
    }

    @Test fun un_salto_manual_a_otra_pista_no_funde() {
        assertFalse(CurvaFundido.entradaTrasSalto(false, "a", "b", fundible = true, entradaActual = true))
    }

    @Test fun repetir_o_saltar_dentro_de_la_pista_conserva_la_entrada() {
        assertTrue(CurvaFundido.entradaTrasSalto(false, "a", "a", fundible = true, entradaActual = true))
        assertFalse(CurvaFundido.entradaTrasSalto(true, "a", "a", fundible = true, entradaActual = false))
    }
}
