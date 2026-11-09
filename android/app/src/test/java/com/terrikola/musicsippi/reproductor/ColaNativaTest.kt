package com.terrikola.musicsippi.reproductor

import org.junit.Assert.assertEquals
import org.junit.Test

class ColaNativaTest {
    @Test fun la_portada_de_reserva_solo_vale_para_videos_de_youtube() {
        assertEquals("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", ColaNativa.portadaDeVideo("dQw4w9WgXcQ"))
        assertEquals(null, ColaNativa.portadaDeVideo("842eb9ee47b9"))
        assertEquals(null, ColaNativa.portadaDeVideo("default"))
        assertEquals(null, ColaNativa.portadaDeVideo(null))
    }

    @Test fun lo_quitado_sin_red_vuelve_delante_y_sin_duplicar() {
        assertEquals(listOf("a", "b", "c"), ColaNativa.devolverAPendientes(listOf("a", "b"), listOf("b", "c")) { it })
    }

    @Test fun una_pendiente_que_falla_se_reintenta_antes_de_descartarla() {
        assertEquals(true, ColaNativa.reintentarRelleno(0))
        assertEquals(true, ColaNativa.reintentarRelleno(1))
        assertEquals(false, ColaNativa.reintentarRelleno(2))
    }

    @Test fun con_la_app_oculta_se_resuelve_de_nuevo_dos_veces_y_luego_se_salta() {
        assertEquals(ColaNativa.TrasError.RESOLVER_DE_NUEVO, ColaNativa.trasErrorSinJs(0, hayRed = true, archivoLocal = false))
        assertEquals(ColaNativa.TrasError.RESOLVER_DE_NUEVO, ColaNativa.trasErrorSinJs(1, hayRed = true, archivoLocal = false))
        assertEquals(ColaNativa.TrasError.SALTAR, ColaNativa.trasErrorSinJs(2, hayRed = true, archivoLocal = false))
    }

    @Test fun sin_red_o_con_archivo_local_no_se_resuelve_de_nuevo() {
        assertEquals(ColaNativa.TrasError.SALTAR, ColaNativa.trasErrorSinJs(0, hayRed = false, archivoLocal = false))
        assertEquals(ColaNativa.TrasError.SALTAR, ColaNativa.trasErrorSinJs(0, hayRed = true, archivoLocal = true))
    }

    @Test fun adelanta_el_relleno_a_30s_del_final_sin_siguiente() {
        assertEquals(true, ColaNativa.adelantarRelleno(0, 170_000, 200_000))
        assertEquals(false, ColaNativa.adelantarRelleno(0, 169_999, 200_000))
    }

    @Test fun no_adelanta_con_siguiente_en_cola_ni_sin_duracion() {
        assertEquals(false, ColaNativa.adelantarRelleno(1, 199_000, 200_000))
        assertEquals(false, ColaNativa.adelantarRelleno(0, 0, Long.MIN_VALUE + 1)) // C.TIME_UNSET
    }

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

    // Regresión: «Runnin'» sonando con «Without Me – Halsey» en el bloqueo. JS publica la canción
    // nueva antes de que el nativo cambie: la metadata no puede pegarse a la que suena ahora.
    @Test fun metadata_va_solo_a_la_pista_que_describe() {
        val cola = listOf("runnin", "withoutMe", "otra")
        assertEquals(listOf(1), ColaNativa.indicesParaMetadata(cola, 0, "withoutMe"))
        assertEquals(listOf(0), ColaNativa.indicesParaMetadata(cola, 1, "runnin"))
    }

    @Test fun metadata_de_una_pista_que_el_nativo_aun_no_tiene_no_toca_nada() {
        assertEquals(emptyList<Int>(), ColaNativa.indicesParaMetadata(listOf("runnin"), 0, "withoutMe"))
    }

    @Test fun metadata_va_a_todas_las_copias_de_la_pista() {
        assertEquals(listOf(0, 2), ColaNativa.indicesParaMetadata(listOf("a", "b", "a"), 1, "a"))
    }

    @Test fun metadata_sin_id_va_a_la_actual_como_antes() {
        assertEquals(listOf(1), ColaNativa.indicesParaMetadata(listOf("a", "b"), 1, null))
        assertEquals(emptyList<Int>(), ColaNativa.indicesParaMetadata(emptyList(), 0, null))
    }
}
