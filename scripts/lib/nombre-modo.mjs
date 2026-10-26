/**
 * Comparación de nombres de modo/lista: «Soundtracks» y «Soundtrack» son el
 * mismo modo. Lo usan aplicar-modos.mjs, fusionar-modos-duplicados.mjs e
 * importar-filas.mjs (también en el móvil, por eso sin node:*).
 */

/**
 * Clave de comparación: minúsculas, sin tildes ni signos, y a cada palabra de
 * 5 letras o más se le quita una `es`/`s` final. El mínimo de 5 evita fundir
 * nombres distintos cortos («Boss» y «Bossa» quedan aparte, «Rock»/«Rocks»
 * sí, porque «Rocks» tiene 5).
 */
export function claveNombreModo(nombre) {
  const palabras = String(nombre ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return palabras
    .map((p) => {
      if (p.length < 5) return p;
      const sinS = p.endsWith('es') ? p.slice(0, -2) : p.endsWith('s') ? p.slice(0, -1) : p;
      // «house»/«houses»: sin esto uno acaba en «hous» y el otro en «house».
      return sinS.endsWith('e') ? sinS.slice(0, -1) : sinS;
    })
    .join('-');
}

export function mismoNombreModo(a, b) {
  const clave = claveNombreModo(a);
  return clave !== '' && clave === claveNombreModo(b);
}
