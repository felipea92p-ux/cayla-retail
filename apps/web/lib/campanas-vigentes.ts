// La campaña que rige HOY en una tienda, por prenda (base: `campanas_vigentes(p_ubicacion_id)`), para la caja, Apartados y el sondeo
// de precios en vivo. UNA sola forma de leerla, por páginas.
//
// EL PROBLEMA QUE RESUELVE (2026-10-23, aniversario de CAYLA, urgente en Tienda TRU). PostgREST corta cualquier respuesta en 1.000 filas
// SIN error (`FILAS_POR_PAGINA`). Con «Elegir todas» las categorías (ADR-0486) el Aniversario alcanzó 2.518 prendas en TRU: la caja recibía
// 1.000 y las otras 1.518 salían sin descuento en el ticket. La base, que sí las veía, rechazaba el descuento a mano de la colaboradora
// («ya tiene una campaña con igual o más descuento», `venta_descuento_no_supera_campana`): ni el descuento de campaña ni uno propio entraban.
//
// CONTRATO
//   PROMETE: todas las filas de la campaña, ordenadas por `variante_id` (la función ya da una por prenda: la de mayor %).
//   SE DEGRADA: devuelve `{ data, error }` como supabase-js; una página con error corta la lectura (media lista nunca se entrega como
//            lista entera) y quien llama decide, igual que antes (`PGRST202` = la función no existe aún: sin campañas).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@cayla-retail/database";
import { leerTodas } from "./resultado";

export async function leerCampanasVigentes(supabase: Pick<SupabaseClient<Database, "retail">, "rpc">, ubicacionId: string) {
  // `enParalelo: 1`: cada página recalcula la función entera (ADR-0192, ~20 ms con 2.500 prendas); en serie, la 2.ª y la 3.ª solo se
  // piden si la anterior vino llena.
  return leerTodas(
    (desde, hasta) => supabase.rpc("campanas_vigentes", { p_ubicacion_id: ubicacionId }).order("variante_id").range(desde, hasta),
    { enParalelo: 1 },
  );
}
