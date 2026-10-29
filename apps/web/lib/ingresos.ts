import { createClient } from "@/lib/supabase/server";
import { fotoPrincipal } from "@/lib/inventario-reglas";
import { leerResumenIngresos, type ResumenIngresos } from "@/lib/ingresos-reglas";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";

// Ingresos (pestaña de Movimientos): la lectura del servidor sobre `retail.fn_ingresos_por_modelo`.
//
// CONTRATO — PROMETE: `null` cuando la base no respondió o negó el permiso (la pantalla dice «no se pudo leer», nunca
// dibuja un 0 que parezca un dato); nunca escribe ni bloquea nada. Si la foto o la categoría no llegan, la lista sale igual
// con la prenda sin foto (principio 9). ASUME: quien llama ya pasó la puerta del módulo Movimientos (la base lo vuelve a
// comprobar con `fn_ve_modulo` y `fn_puede_operar_ubicacion`).

export type Apariencia = { fotoUrl: string | null } & CategoriaDePrenda;

export type IngresosDeLaSede = { resumen: ResumenIngresos; apariencia: Record<string, Apariencia> };

/** Cuántos modelos se piden a la vez: un `in (…)` con cientos de uuid pasa el largo de la URL que aguanta el servidor. */
const LOTE_DE_IDS = 80;

type ProductoCrudo = {
  id: string;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  producto_fotos: { url: string; orden: number; es_principal: boolean }[] | null;
};

export async function getIngresosPorModelo(ubicacionId: string, desde: string, hasta: string): Promise<IngresosDeLaSede | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ingresos_por_modelo" as never, { p_ubicacion_id: ubicacionId, p_desde: desde, p_hasta: hasta } as never);
  if (error) {
    console.error("Ingresos:", error.message);
    return null;
  }
  const resumen = leerResumenIngresos(data);
  if (!resumen) return null;
  return { resumen, apariencia: await aparienciaDeModelos(resumen.modelos.map((m) => m.productoId)) };
}

/** La foto y la categoría de cada modelo, en lotes. Un lote que falla deja a sus modelos sin foto, no sin lista. */
async function aparienciaDeModelos(ids: readonly string[]): Promise<Record<string, Apariencia>> {
  const resultado: Record<string, Apariencia> = {};
  if (ids.length === 0) return resultado;
  const supabase = await createClient();
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += LOTE_DE_IDS) lotes.push(ids.slice(i, i + LOTE_DE_IDS));
  const respuestas = await Promise.all(
    lotes.map((lote) =>
      supabase.from("productos").select("id, categoria:categorias ( nombre, prefijo, familia ), producto_fotos ( url, orden, es_principal )").in("id", lote)
    )
  );
  for (const { data, error } of respuestas) {
    if (error) {
      console.error("Fotos de Ingresos:", error.message);
      continue;
    }
    for (const p of (data ?? []) as unknown as ProductoCrudo[]) {
      resultado[p.id] = { fotoUrl: fotoPrincipal(p.producto_fotos), prefijo: p.categoria?.prefijo, familia: p.categoria?.familia, categoria: p.categoria?.nombre };
    }
  }
  return resultado;
}
