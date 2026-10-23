// El precio propio de cada prenda en una tienda (base: `fn_precios_en_sede(p_ubicacion_id)`), para la caja, Apartados, Cambios,
// Frescura, las etiquetas y el sondeo de precios en vivo. UNA sola forma de leerlo, por páginas.
//
// POR QUÉ POR PÁGINAS. La función da una fila por talla de cada prenda con precio propio en la tienda, y PostgREST corta cualquier
// respuesta en 1.000 filas SIN error (`FILAS_POR_PAGINA`). Hoy son 245 en Lima (17 prendas), pero el día que una tienda pase de 1.000 las
// tallas de más abajo se mostrarían al precio de la prenda: la caja lo ve al cobrar (`registrar_venta` rechaza con «el precio cambió»), y
// una etiqueta, una proforma o un apartado lo dirían mal SIN avisar. Mismo tope que dejó sin descuento a 1.518 prendas de TRU el
// 2026-10-23 (`campanas-vigentes.ts`).
//
// CONTRATO
//   PROMETE: todas las filas de la tienda, ordenadas por `variante_id`.
//   SE DEGRADA: devuelve `{ data, error }` como supabase-js; una página con error corta la lectura y quien llama decide, igual que antes.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { leerTodas } from "./resultado";

export async function leerPreciosPropiosDeSede(supabase: Pick<SupabaseClient<Database, "retail">, "rpc">, ubicacionId: string) {
  // `enParalelo: 1`: cada página recalcula la función (ADR-0192). Casi siempre cabe en una; la 2.ª solo se pide si la 1.ª vino llena.
  return leerTodas(
    (desde, hasta) => supabase.rpc("fn_precios_en_sede", { p_ubicacion_id: ubicacionId }).order("variante_id").range(desde, hasta),
    { enParalelo: 1 },
  );
}
