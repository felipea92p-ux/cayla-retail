// El precio con referencia de «Prenda sin registrar» (auditoría del ERP, bloque 1, A3; Felipe 2026-10-14). El precio de esa hoja era
// libre: solo tenía que ser mayor que 0, y el 69 % de las líneas vendidas entraba por ahí. Ahora la hoja dice cuánto cuestan las prendas
// de esa categoría en el catálogo y, si lo tecleado se sale de ese rango, pide confirmarlo antes de agregar: la misma forma que el
// costo atípico de Compras (`AvisoCostoAtipico`), que corrige o confirma, nunca un candado. Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: el rango de precios de una categoría a partir del catálogo que Vender ya tiene cargado (los precios de SUS variantes
//            activas, con el precio de esta tienda si lo tiene), y un veredicto para un precio tecleado: dentro, bajo, alto, sin
//            referencia (la categoría no tiene prendas con precio) o sin precio.
//   ASUME:   con menos de 8 precios el rango es de mínimo a máximo (con tres prendas, los extremos son la referencia); desde 8, del
//            percentil 10 al 90 (rango por posición: los extremos de un catálogo grande suelen ser una liquidación o un error).
//            El rango es inclusivo: un precio igual al borde está dentro.
//   NO HACE: no bloquea nada por su cuenta y no toca la base. El candado en `registrar_venta` (muy fuera de rango → líder) es de la
//            Fase 1, con el contador. La confirmación vale para ESE precio: si cambia, se vuelve a pedir.

export type RangoDePrecios = { desde: number; hasta: number; n: number };

/** Desde cuántos precios el rango deja de ser mínimo–máximo y pasa al percentil 10–90. */
export const MINIMO_PARA_PERCENTILES = 8;

const centimos = (n: number) => Math.round(n * 100) / 100;

/** Los precios (> 0) de las variantes activas de la categoría, y su rango; `null` si no hay ninguno. */
export function rangoDePreciosDeCategoria(
  variantes: readonly { categoriaId?: string | null; precio: number; activo?: boolean }[],
  categoriaId: string | null | undefined,
): RangoDePrecios | null {
  if (!categoriaId) return null;
  const precios = variantes
    .filter((v) => v.categoriaId === categoriaId && v.activo !== false && Number.isFinite(v.precio) && v.precio > 0)
    .map((v) => v.precio)
    .sort((a, b) => a - b);
  const n = precios.length;
  if (n === 0) return null;
  if (n < MINIMO_PARA_PERCENTILES) return { desde: centimos(precios[0]!), hasta: centimos(precios[n - 1]!), n };
  const p10 = precios[Math.floor(0.1 * (n - 1))]!;
  const p90 = precios[Math.ceil(0.9 * (n - 1))]!;
  return { desde: centimos(p10), hasta: centimos(p90), n };
}

export type VeredictoPrecio = "sin_precio" | "sin_referencia" | "dentro" | "bajo" | "alto";

export function veredictoDePrecio(precio: number, rango: RangoDePrecios | null): VeredictoPrecio {
  if (!Number.isFinite(precio) || precio <= 0) return "sin_precio";
  if (!rango) return "sin_referencia";
  if (precio < rango.desde - 0.005) return "bajo";
  if (precio > rango.hasta + 0.005) return "alto";
  return "dentro";
}

/** Un precio fuera de rango solo se agrega si la persona lo confirmó, y la confirmación es de ESE precio. */
export function precioNecesitaConfirmacion(veredicto: VeredictoPrecio, precio: number, precioConfirmado: number | null): boolean {
  if (veredicto !== "bajo" && veredicto !== "alto") return false;
  return precioConfirmado === null || Math.abs(precioConfirmado - precio) >= 0.005;
}

const soles = (n: number) => `S/\u00a0${n.toFixed(2)}`;

/** La referencia que se lee bajo el precio, antes de teclear: «Camisas y Blusas en tu catálogo: de S/ 59.00 a S/ 129.00». */
export function fraseDeReferencia(categoria: string, rango: RangoDePrecios): string {
  if (rango.desde === rango.hasta) return `${categoria} en tu catálogo: ${soles(rango.desde)}${rango.n === 1 ? " (una prenda)" : ""}.`;
  return `${categoria} en tu catálogo: de ${soles(rango.desde)} a ${soles(rango.hasta)}.`;
}

/** El aviso cuando lo tecleado se sale del rango: qué pasó, con las cifras, y qué hacer. */
export function fraseFueraDeRango(precio: number, categoria: string, rango: RangoDePrecios, veredicto: "bajo" | "alto"): { titulo: string; detalle: string } {
  const titulo = veredicto === "bajo" ? `${soles(precio)} está por debajo de lo usual en ${categoria}` : `${soles(precio)} está por encima de lo usual en ${categoria}`;
  const detalle = `${fraseDeReferencia(categoria, rango)} Si es lo que cobraste, confírmalo; si te equivocaste, corrige el precio.`;
  return { titulo, detalle };
}
