// src/movil/inicio/SeccionResumen.jsx
// Abrir las historias del resumen. La banda que lo anuncia (solo cuando toca, y desaparece al abrirlo)
// está en InicioMovil (ver tarjetaSemana.js).
import { ventanaResumenAnual } from '../resumen/resumen.js';
import { claveResumen, marcarResumenVisto } from './tarjetaSemana.js';

/** Abre las historias del resumen ('semana' | 'anio') como capa de navegación y anota que ya se vio. */
export function abrirResumen(nav, periodo = 'semana') {
  marcarResumenVisto(claveResumen(periodo, { completo: periodo === 'anio' && ventanaResumenAnual().completo }));
  nav.abrirCapa({ tipo: 'resumen', periodo });
}
