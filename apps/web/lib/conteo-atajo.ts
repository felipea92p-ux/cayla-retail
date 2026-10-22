// «Completar todo» de una tarjeta de Conteo (ADR-0328; opción C de Felipe, 2026-10-05): cuenta, pero lo dice. Lógica pura de lo que la
// pantalla necesita saber; rutas relativas porque vitest no resuelve `@/`.

/**
 * La frase de Revisar y de Confirmar: cuántas de las variantes contadas se completaron con el atajo. `null` si ninguna (no se dice nada).
 * Cuentan para la exactitud y para el arranque, así que la frase solo informa: la decide quien cierra.
 *
 * Dice «con lo que CAYLA esperaba» y NO «nadie escribió su cantidad»: si alguien teclea encima el mismo número que dejó el atajo, la
 * pantalla no lo manda (es igual al anotado) y la marca sigue puesta; la frase tiene que ser cierta también en ese caso.
 */
export function textoAtajoEnRevision(conAtajo: number, contadas: number): string | null {
  if (conAtajo <= 0) return null;
  const n = contadas > 0 ? Math.min(conAtajo, contadas) : conAtajo; // nunca más completadas que contadas
  const de = contadas > 0 ? ` de ${contadas.toLocaleString("es-PE")}` : "";
  const sustantivo = (contadas > 0 ? contadas : n) === 1 ? "variante contada" : "variantes contadas"; // concuerda con lo que se nombra
  const verbo = n === 1 ? "se completó" : "se completaron";
  return `${n.toLocaleString("es-PE")}${de} ${sustantivo} ${verbo} con «Completar todo», con lo que CAYLA esperaba.`;
}
