package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertEquals
import org.junit.Test

class ColaNativaTest {
    @Test fun anterior_pasados_3s_reinicia() {
        assertEquals(ColaNativa.Anterior.REINICIAR, ColaNativa.accionAnterior(3_001, 2))
        assertEquals(ColaNativa.Anterior.REINICIAR, ColaNativa.accionAnterior(60_000, 0))
    }

    @Test fun anterior_al_principio_con_historial_va_a_la_anterior_nativa() {
        assertEquals(ColaNativa.Anterior.ANTERIOR_NATIVA, ColaNativa.accionAnterior(0, 1))
        assertEquals(ColaNativa.Anterior.ANTERIOR_NATIVA, ColaNativa.accionAnterior(3_000, 3))
    }

    @Test fun anterior_sin_historial_se_pide_a_js() {
        assertEquals(ColaNativa.Anterior.PEDIR_A_JS, ColaNativa.accionAnterior(500, 0))
    }

    @Test fun anteriores_iguales_no_se_tocan() {
        assertEquals(ColaNativa.PlanAnteriores(0, false), ColaNativa.planAnteriores(listOf("a"), listOf("a")))
    }

    @Test fun anteriores_con_historial_viejo_solo_recorta() {
        assertEquals(ColaNativa.PlanAnteriores(2, false), ColaNativa.planAnteriores(listOf("x", "y", "a"), listOf("a")))
    }

    @Test fun anteriores_distintas_se_reemplazan() {
        assertEquals(ColaNativa.PlanAnteriores(1, true), ColaNativa.planAnteriores(listOf("x"), listOf("a")))
        assertEquals(ColaNativa.PlanAnteriores(0, true), ColaNativa.planAnteriores(emptyList(), listOf("a")))
    }

    @Test fun sin_deseadas_se_vacia_el_historial() {
        assertEquals(ColaNativa.PlanAnteriores(2, false), ColaNativa.planAnteriores(listOf("x", "y"), emptyList()))
    }
}
