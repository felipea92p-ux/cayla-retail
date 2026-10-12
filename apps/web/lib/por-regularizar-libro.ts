// Lo que dice el libro de cada prenda candidata a la hora de cada venta sin registrar (ADR-0328 act. 5, rescatado de #788 el 2026-10-12):
// de ahí sale la respuesta que la mesa (ADR-0360) sugiere en «¿Cómo estaba?» (`lib/por-regularizar-deduccion.ts`).
//
// CONTRATO
//   PROMETE: `venta → (prenda → saldo a la venta, primera entrada y lo primero que llegó o se ajustó después)`, leído de
//            `retail.fn_candidatas_por_regularizar` (20261004203000, en producción desde el 2026-10-05): solo ventas PENDIENTES de las
//            tiendas que la cuenta opera, y hasta 20 prendas por venta (las de su categoría y talla, del mismo color o de su familia, con
//            unidades libres en esa tienda). Una prenda que no viene no tiene respuesta deducida: la mesa no dice nada de ella.
//   ASUME:   que quien llama ve Existencias (la base filtra por `fn_puede_operar_ubicacion`, la misma puerta que la lista).
//   SE DEGRADA: nunca lanza. Si la lectura falla devuelve `null` y la mesa sigue entera, sin sugerencia en «¿Cómo estaba?»: es lo
//            accesorio (se regulariza igual; la base es la que decide qué entra y qué sale).
//
// COSTO (números antes que opiniones). La base lee el libro UNA vez por tienda (≤ 4) desde su venta pendiente más antigua. Cada venta
// pendiente trae ≤ 20 filas: 50 pendientes caben en una página de 1.000; el peor caso visto, 236 (producción, 2026-10-03, antes de
// cerrar la cola de arranque), son 5 páginas en serie (la 2.ª solo se pide si la 1.ª vino llena, como `getPorRegularizar`). Solo se pide
// si hay alguna pendiente.
import { createClient } from "./supabase/server";
import { leerTodas } from "./resultado";
import { libroDesdeFilas, type LibroPorVenta } from "./por-regularizar-deduccion";

export async function getLibroPorVenta(ubicacionId: string | null): Promise<LibroPorVenta | null> {
  try {
    const supabase = await createClient();
    const args = ubicacionId ? { p_ubicacion_id: ubicacionId } : {};
    const r = await leerTodas((desde, hasta) => supabase.rpc("fn_candidatas_por_regularizar", args).range(desde, hasta), { enParalelo: 1 });
    if (r.error || !r.data) throw new Error(r.error?.message ?? "sin datos");
    return libroDesdeFilas(r.data);
  } catch (e) {
    console.error("Ventas sin registrar: no se pudo leer el libro para sugerir «¿Cómo estaba?»:", e);
    return null;
  }
}
