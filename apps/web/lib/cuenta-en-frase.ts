// La cuenta de un grupo dicha como frase: «7 casos, todos de prioridad alta». Caso 3 de la regla «Separar sin punto» (ADR-0716,
// Felipe 2026-11-27: eligió «frase», no un contador en pastilla).
//
// El nombre de un grupo y su cuenta son datos de distinta clase: el nombre va a la izquierda como título y la cuenta a la derecha,
// dicha como se habla, con lo urgente aparte para que la pantalla lo pinte en su color. Así no quedan «AQP 7 casos 7 altas» pegados
// ni «Tienda Arequipa · 7 casos». La pieza que la dibuja es `<CuentaEnFrase>` / `<CabeceraConCuenta>`
// (`components/ui/CabeceraConCuenta.tsx`); esto es solo el texto, puro, para poder probarlo y para que viaje a CAYLA Dynamic, donde
// su hermana es `cuentaDeCasos` (lib/admin/incidencias.ts).

/** Qué se cuenta, en singular y plural, y su género («todos los casos», «todas las prendas»). */
export interface QueSeCuenta {
  singular: string;
  plural: string;
  genero: "m" | "f";
}

export interface CuentaDicha {
  /** «7 casos». */
  cuenta: string;
  /** Lo urgente, para pintarlo en su color: «todos de prioridad alta», «3 de prioridad alta». Null si no hay nada urgente. */
  urgente: string | null;
}

/**
 * `cuentaEnFrase(7, 7, { singular: "caso", plural: "casos", genero: "m" }, "de prioridad alta")`
 *   → `{ cuenta: "7 casos", urgente: "todos de prioridad alta" }`.
 * Si son todos, se dice «todos» (o «los dos», o nada si es uno solo: «1 caso, de prioridad alta»); si son algunos, cuántos.
 */
export function cuentaEnFrase(total: number, urgentes: number, que: QueSeCuenta, comoEsUrgente: string): CuentaDicha {
  const cuenta = `${total.toLocaleString("es-PE")} ${total === 1 ? que.singular : que.plural}`;
  if (urgentes <= 0 || total <= 0) return { cuenta, urgente: null };
  if (urgentes >= total) {
    if (total === 1) return { cuenta, urgente: comoEsUrgente };
    if (total === 2) return { cuenta, urgente: `${que.genero === "f" ? "las dos" : "los dos"} ${comoEsUrgente}` };
    return { cuenta, urgente: `${que.genero === "f" ? "todas" : "todos"} ${comoEsUrgente}` };
  }
  return { cuenta, urgente: `${urgentes.toLocaleString("es-PE")} ${comoEsUrgente}` };
}

/** La frase entera, para un `title` o un lector de pantalla: «7 casos, todos de prioridad alta». */
export function fraseDeCuenta({ cuenta, urgente }: CuentaDicha): string {
  return urgente ? `${cuenta}, ${urgente}` : cuenta;
}
