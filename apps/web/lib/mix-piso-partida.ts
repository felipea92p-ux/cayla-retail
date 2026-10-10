/**
 * El punto de partida del mix del piso por sede (ADR-0329, «Actualización 2026-10-04»; `docs/investigacion/2026-10-04-mix-inicial-del-piso.md`).
 *
 * Ninguna cadena publica cuánto piso le da a cada categoría, y las ventas propias son de unos pocos días: por eso el primer mix sale
 * de la industria y no de las ventas propias («investiga a los mejores de la industria, mi estadística es insuficiente por ahora»,
 * Felipe 2026-10-04). El punto de partida es el SURTIDO de mujer de Topitop, Estilos y Oechsle (contado el 2026-10-04) puesto según el
 * rol de cada grupo y el clima de cada sede: AQP (noches de 7–11 °C todo el año) lleva el doble de abrigo que TRU; Jeans va debajo
 * del rango de la industria (15–20 %) por decisión de Felipe, porque hoy casi no se vende en TRU ni en AQP.
 *
 * Son cifras del CRITERIO de la investigación, no datos de CAYLA: viven aquí, con su fuente, y no en la base, porque todavía no hay
 * quien las edite ni un mix guardado contra el que compararlas. Cuando el líder apruebe un mix (siguiente entrega), lo aprobado manda
 * y esto queda como el punto de partida que se le propuso.
 *
 * LÓGICA PURA: sin red ni base. Se importa desde el servidor y desde el cliente.
 */

/** Una sede de las tres de CAYLA, por su código corto (`codigoDeTienda` de `terminales-reglas.ts`). */
export type CodigoSede = "tru" | "aqp" | "lim";

/** El % del RIEL (prendas colgadas) de cada grupo en el que cuelga ropa, por sede. Suma 100 por sede. */
export const PARTIDA_DEL_RIEL: Readonly<Record<CodigoSede, Readonly<Record<string, number>>>> = {
  // TRU, 600 prendas: verano largo y caluroso (ENFEN N.° 17-2026): poco abrigo, más vestidos y conjuntos.
  tru: { polos_tops_blusas: 48, jeans: 9, pantalones_faldas_shorts: 20, vestidos_conjuntos: 12, bodys_corsets_lenceria: 6, abrigo_y_capas: 5 },
  // AQP, 1.800 prendas (provisional hasta contarla): noches frías todo el año, más abrigo.
  aqp: { polos_tops_blusas: 44, jeans: 10, pantalones_faldas_shorts: 18, vestidos_conjuntos: 10, bodys_corsets_lenceria: 6, abrigo_y_capas: 12 },
  // LIM, 180 prendas, un stand de 6 m²: solo destino y lo que llega al mínimo; el resto, por pedido o desde otra sede (ADR-0329, decisión 8).
  lim: { polos_tops_blusas: 55, jeans: 20, pantalones_faldas_shorts: 25, vestidos_conjuntos: 0, bodys_corsets_lenceria: 0, abrigo_y_capas: 0 },
};

/** La meta de los grupos que van FUERA del riel, como % de la VENTA (no del piso): accesorios junto a la caja, bolsos y calzado en
 *  repisa. `null` = la sede no los lleva (LIM no tiene mostrador ni repisa en el stand). */
export type MetaDeVenta = { desde: number; hasta: number } | null;
export const META_DE_VENTA_FUERA_DEL_RIEL: Readonly<Record<CodigoSede, Readonly<Record<string, MetaDeVenta>>>> = {
  tru: { accesorios_de_impulso: { desde: 9, hasta: 11 }, bolsos_y_calzado: { desde: 3, hasta: 5 } },
  aqp: { accesorios_de_impulso: { desde: 16, hasta: 18 }, bolsos_y_calzado: { desde: 6, hasta: 8 } },
  lim: { accesorios_de_impulso: { desde: 4, hasta: 6 }, bolsos_y_calzado: null },
};

const CODIGOS: readonly string[] = ["tru", "aqp", "lim"];

/** El código de una sede si es una de las tres con punto de partida; `null` si no (una tienda nueva no recibe una propuesta inventada). */
export function codigoDeSede(codigo: string | null | undefined): CodigoSede | null {
  const c = (codigo ?? "").toLowerCase();
  return CODIGOS.includes(c) ? (c as CodigoSede) : null;
}
