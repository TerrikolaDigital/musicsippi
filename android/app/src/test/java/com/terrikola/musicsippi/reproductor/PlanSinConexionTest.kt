package com.terrikola.musicsippi.reproductor

import com.terrikola.musicsippi.reproductor.PlanSinConexion.Guardada
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlanSinConexionTest {
    @Test fun clave_y_vuelta() {
        assertEquals("abc", PlanSinConexion.idDeClave(PlanSinConexion.clave("abc", "140")))
        assertNull(PlanSinConexion.idDeClave("otra"))
    }

    @Test fun victima_prefiere_fuera_de_seleccion() {
        val g = listOf(Guardada("a", 10), Guardada("x", 5), Guardada("y", 9))
        assertEquals("y", PlanSinConexion.victima(g, listOf("a"), 0))
    }

    @Test fun victima_luego_la_de_menor_prioridad() {
        val g = listOf(Guardada("a", 1), Guardada("b", 1), Guardada("c", 1))
        assertEquals("c", PlanSinConexion.victima(g, listOf("a", "b", "c"), 0))
    }

    @Test fun victima_nunca_la_actual_ni_anteriores() {
        val g = listOf(Guardada("a", 1), Guardada("b", 1), Guardada("c", 1))
        assertNull(PlanSinConexion.victima(g, listOf("a", "b", "c"), 2))
    }

    @Test fun sin_red_solo_guardadas() {
        val ids = listOf("a", "b", "c")
        assertEquals(ids, PlanSinConexion.pendientesUsables(ids, { false }, true))
        assertEquals(listOf("b"), PlanSinConexion.pendientesUsables(ids, { it == "b" }, false))
    }

    @Test fun puede_descargar_exige_todas_las_condiciones() {
        assertEquals(true, PlanSinConexion.puedeDescargar(true, true, 50, false, true, false))
        assertEquals(true, PlanSinConexion.puedeDescargar(true, true, 50, false, false, true))
        assertEquals(false, PlanSinConexion.puedeDescargar(false, true, 50, false, true, true))
        assertEquals(false, PlanSinConexion.puedeDescargar(true, false, 50, false, true, true))
        assertEquals(false, PlanSinConexion.puedeDescargar(true, true, 50, false, false, false))
    }

    @Test fun puede_descargar_bateria() {
        assertEquals(true, PlanSinConexion.puedeDescargar(true, true, 20, false, true, false))
        assertEquals(false, PlanSinConexion.puedeDescargar(true, true, 19, false, true, false))
        assertEquals(true, PlanSinConexion.puedeDescargar(true, true, 5, true, true, false))
    }

    @Test fun victima_nunca_la_protegida() {
        val g = listOf(Guardada("a", 1), Guardada("x", 50), Guardada("c", 1))
        // «x» está fuera de la selección y es la mayor, pero suena: se elige la de menor prioridad.
        assertEquals("c", PlanSinConexion.victima(g, listOf("a", "c"), 0, protegida = "x"))
        assertNull(PlanSinConexion.victima(listOf(Guardada("x", 50)), listOf("x"), -1, protegida = "x"))
        // Dentro de selección, la de mayor índice es la protegida: cae la siguiente.
        val h = listOf(Guardada("a", 1), Guardada("b", 1), Guardada("c", 1))
        assertEquals("b", PlanSinConexion.victima(h, listOf("a", "b", "c"), 0, protegida = "c"))
    }

    @Test fun espera_crece_con_los_fallos() {
        assertEquals(20_000L, PlanSinConexion.esperaMs(0))
        assertEquals(40_000L, PlanSinConexion.esperaMs(1))
        assertEquals(80_000L, PlanSinConexion.esperaMs(2))
    }

    @Test fun fallida_caduca_a_los_30_minutos() {
        assertEquals(true, PlanSinConexion.fallidaVigente(0, 29 * 60_000L))
        assertEquals(false, PlanSinConexion.fallidaVigente(0, 30 * 60_000L))
    }

    @Test fun error_recuperable() {
        // De la caché: solo si hay red (se reintenta por red).
        assertEquals(true, PlanSinConexion.errorRecuperable(true, true, 0))
        assertEquals(false, PlanSinConexion.errorRecuperable(true, false, 0))
        // De la red: solo 403/410.
        assertEquals(true, PlanSinConexion.errorRecuperable(false, true, 403))
        assertEquals(true, PlanSinConexion.errorRecuperable(false, false, 410))
        assertEquals(false, PlanSinConexion.errorRecuperable(false, true, 500))
        assertEquals(false, PlanSinConexion.errorRecuperable(false, true, 0))
    }

    @Test fun reproducible_sin_red() {
        assertEquals(true, PlanSinConexion.reproducibleSinRed("sc:abc:140", "https"))
        assertEquals(true, PlanSinConexion.reproducibleSinRed(null, "content"))
        assertEquals(false, PlanSinConexion.reproducibleSinRed(null, "https"))
        assertEquals(false, PlanSinConexion.reproducibleSinRed(null, null))
    }

    @Test fun conservar_uri_actual() {
        assertEquals(true, PlanSinConexion.conservarUriActual("a", "u", "a", "u", null))
        assertEquals(true, PlanSinConexion.conservarUriActual("a", "u", "a", "u", "otra"))
        assertEquals(false, PlanSinConexion.conservarUriActual("a", "u", "a", "u", "sc:a:140")) // ya viene de la caché
        assertEquals(false, PlanSinConexion.conservarUriActual("a", "u", "b", "u", null)) // otra pista
        assertEquals(false, PlanSinConexion.conservarUriActual("a", "u", null, null, null))
        assertEquals(false, PlanSinConexion.conservarUriActual("a", "u2", "a", "u", null)) // re-resuelta tras 403
    }
}
