// «Completar todo» de una tarjeta de Conteo (ADR-0328; opción C de Felipe, 2026-10-05): cuenta, pero lo dice. Lógica pura de lo que la
// pantalla necesita saber; rutas relativas porque vitest no resuelve `@/`.

/**
 * ¿La base dice que ESTA función no existe (todavía)? Pasa si la web nueva sale antes de que se pegue el SQL: PostgREST contesta
 * `PGRST202` («Could not find the function … in the schema cache»). Solo cuenta si nombra la función pedida: «no existe» de otra función
 * es otro problema y no se tapa. Con esto la pantalla cae al camino de siempre (talla por talla, sin la marca) en vez de dejar sin
 * «Completar todo» a quien está contando.
 */
export function funcionNoExiste(error: { message?: string | null; code?: string | null } | null | undefined, nombre: string): boolean {
  if (!error) return false;
  const mensaje = error.message ?? "";
  const dice = error.code === "PGRST202" || /could not find the function/i.test(mensaje);
  return dice && mensaje.includes(nombre);
}

/**
 * La frase de Revisar: cuántas de las variantes contadas se completaron con el atajo. `null` si ninguna (no se dice nada). Cuentan para la
 * exactitud y para el arranque, así que la frase solo informa: la decide quien cierra.
 */
export function textoAtajoEnRevision(conAtajo: number, contadas: number): string | null {
  if (conAtajo <= 0) return null;
  const n = contadas > 0 ? Math.min(conAtajo, contadas) : conAtajo; // nunca más completadas que contadas
  const de = contadas > 0 ? ` de ${contadas.toLocaleString("es-PE")}` : "";
  const verbo = n === 1 ? "se completó" : "se completaron";
  return `${n.toLocaleString("es-PE")}${de} ${contadas === 1 ? "variante contada" : "variantes contadas"} ${verbo} con «Completar todo»: nadie escribió su cantidad.`;
}
