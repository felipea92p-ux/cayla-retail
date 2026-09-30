import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  aCambio,
  aClienta,
  aDevolucion,
  aSeparacion,
  agruparCompras,
  type Clienta,
  type FichaClienta,
  type FilaCambio,
  type FilaClienta,
  type FilaCompra,
  type FilaDevolucion,
  type FilaSeparacion,
} from "@/lib/clientas-reglas";

// Ficha de clienta — lista y ficha completa (D-76/D-77 y el paso 2 del acta,
// docs/datos/DECISIONES-2026-09-26-clientas.md sección H). Página (server) importa este archivo;
// el panel cliente SOLO `clientas-reglas.ts` y `clientas-acciones.ts` (un Server Component nunca
// llama código de un archivo "use client", y viceversa nunca debería hacer falta).
export type { Clienta };

/** Las últimas `limite` clientas ACTIVAS (sin archivar), para la lista antes de buscar. Con
 *  `incluirArchivadas` trae también las archivadas/anonimizadas/fusionadas — para reactivar una,
 *  o para revisar el historial de una fusión. */
export async function getClientas(limite = 50, incluirArchivadas = false): Promise<Clienta[]> {
  const supabase = await createClient();
  let query = supabase
    .from("clientas")
    .select(
      "id, documento_tipo, documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, tallas, created_at, version, archivada_en, motivo_archivo, anonimizada, fusionada_en_id"
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (!incluirArchivadas) query = query.is("archivada_en", null);
  const filas = exigir(await query, "las clientas");
  return filas.map(aClienta);
}

/** La ficha completa: la clienta más su actividad, LEÍDA de ventas/cambios/devoluciones/
 *  separaciones (nunca una tabla copia) — `fn_clienta_*` cruzan las tres sedes a propósito, ver
 *  esas funciones (20260928180000_clienta_actividad_y_exportar.sql): la ficha es de la marca, no
 *  de la sede donde compró. */
export async function getFichaClienta(id: string): Promise<FichaClienta | null> {
  const supabase = await createClient();
  const [clienta, compras, cambios, devoluciones, separaciones] = await Promise.all([
    supabase
      .from("clientas")
      .select(
        "id, documento_tipo, documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, tallas, created_at, version, archivada_en, motivo_archivo, anonimizada, fusionada_en_id"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("fn_clienta_compras", { p_id: id }),
    supabase.rpc("fn_clienta_cambios", { p_id: id }),
    supabase.rpc("fn_clienta_devoluciones", { p_id: id }),
    supabase.rpc("fn_clienta_separaciones", { p_id: id }),
  ]);

  const filaClienta = exigir(clienta, "la ficha de la clienta") as FilaClienta | null;
  if (!filaClienta) return null;

  return {
    clienta: aClienta(filaClienta),
    compras: agruparCompras(exigir(compras, "sus compras") as FilaCompra[]),
    cambios: (exigir(cambios, "sus cambios") as FilaCambio[]).map(aCambio),
    devoluciones: (exigir(devoluciones, "sus devoluciones") as FilaDevolucion[]).map(aDevolucion),
    separaciones: (exigir(separaciones, "sus apartados") as FilaSeparacion[]).map(aSeparacion),
  };
}
