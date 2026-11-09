package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanSaltosTest {
    private fun salto(pos: Long, enError: Boolean = false, enModoSenal: Boolean = false, sonando: Boolean = true) =
        PlanSaltos.esSaltoRapido(pos, enError, enModoSenal, sonando)

    @Test fun cinco_segundos_normal_cuenta() {
        assertTrue(salto(5_000L))
    }

    @Test fun limites_inferior_incluido_y_superior_excluido() {
        assertTrue(salto(1_000L))
        assertTrue(salto(9_999L))
    }

    @Test fun medio_segundo_no_cuenta() {
        assertFalse(salto(500L))
    }

    @Test fun diez_segundos_no_cuenta() {
        assertFalse(salto(10_000L))
    }

    @Test fun con_error_no_cuenta() {
        assertFalse(salto(5_000L, enError = true))
    }

    @Test fun en_modo_senal_no_cuenta() {
        assertFalse(salto(5_000L, enModoSenal = true))
    }

    @Test fun en_pausa_o_sin_sonar_de_verdad_no_cuenta() {
        assertFalse(salto(5_000L, sonando = false))
    }

    @Test fun sonando_solo_con_ready_y_playWhenReady() {
        assertTrue(PlanSaltos.estaSonando(estadoListo = true, playWhenReady = true))
        assertFalse(PlanSaltos.estaSonando(estadoListo = true, playWhenReady = false))
        assertFalse(PlanSaltos.estaSonando(estadoListo = false, playWhenReady = true))
    }

    private fun oida(pos: Long, dur: Long, enError: Boolean = false, enModoSenal: Boolean = false) =
        PlanSaltos.esOidaCompleta(pos, dur, enError, enModoSenal)

    @Test fun oida_pasado_el_setenta_por_ciento_cuenta() {
        assertTrue(oida(71_000L, 100_000L))
        assertTrue(oida(100_000L, 100_000L))
    }

    @Test fun oida_umbral_estricto() {
        assertFalse(oida(70_000L, 100_000L))
        assertFalse(oida(30_000L, 100_000L))
    }

    @Test fun oida_sin_duracion_conocida_no_cuenta() {
        assertFalse(oida(60_000L, 0L))
        assertFalse(oida(60_000L, -1L))
    }

    @Test fun oida_con_error_o_en_modo_senal_no_cuenta() {
        assertFalse(oida(90_000L, 100_000L, enError = true))
        assertFalse(oida(90_000L, 100_000L, enModoSenal = true))
    }
}
