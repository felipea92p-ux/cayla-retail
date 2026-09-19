import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { motivoDeReasignacion, type FilaReparto, type ReasignacionCompra } from "@/lib/reparto-reglas";

// Lectura del reparto de UN comprobante entre tiendas (ADR-0132) para el detalle: cuánto le tocó a cada tienda de cada
// línea, cuánto recibió y cuánto cerró como faltante, y la bitácora de reasignaciones. Las dos son de solo lectura
// (RLS) y las escrituras pasan por `reasignar_reparto_compra` y `cerrar_linea_compra` desde los componentes cliente.
//
// Es un dato SECUNDARIO del detalle (`tolerar`, no `exigir` — ver `lib/resultado.ts`): si falla, el detalle sigue con lo
// demás y la sección avisa en su lugar que no pudo cargarse, en vez de dibujarse vacía como si el comprobante no
// estuviera repartido. Lo que protege el dinero y el stock (el tope por tienda, la suma del reparto) lo hace la base.

export type RepartoDeCompra = {
  /** Una casilla por línea × tienda. Vacío si no se pudo leer (mira `fallo`). */
  filas: FilaReparto[];
  /** De la más reciente a la más antigua. */
  reasignaciones: ReasignacionCompra[];
  /** Mensaje ya redactado para mostrar en la sección si no se pudo leer el reparto. */
  fallo: string | null;
};

export async function getRepartoDeCompra(compraId: string): Promise<RepartoDeCompra> {
  const supabase = await createClient();
  const [reparto, historial] = await Promise.all([
    supabase.from("compra_item_reparto_resumen").select("compra_item_id, ubicacion_id, asignado, recibido, cerrado, pendiente").eq("compra_id", compraId),
    supabase
      .from("compra_reasignaciones")
      .select("id, compra_item_id, desde_ubicacion_id, hacia_ubicacion_id, cantidad, motivo, nota, usuario_id, created_at, compra_item:compra_items!inner ( compra_id )")
      .eq("compra_item.compra_id", compraId)
      .order("created_at", { ascending: false }),
  ]);

  const r = tolerar(reparto, "el reparto del comprobante por tienda");
  const h = tolerar(historial, "el historial de reasignaciones");

  const filas: FilaReparto[] = (r.datos ?? []).flatMap((f) =>
    f.compra_item_id && f.ubicacion_id
      ? [
          {
            compraItemId: f.compra_item_id,
            ubicacionId: f.ubicacion_id,
            asignado: Number(f.asignado ?? 0),
            recibido: Number(f.recibido ?? 0),
            cerrado: Number(f.cerrado ?? 0),
            pendiente: Number(f.pendiente ?? 0),
          },
        ]
      : []
  );

  // `usuario_id` es una persona de Dynamic (otro schema): no se puede embeber, se resuelve en lote (mismo patrón que
  // `caja.ts` y `compras.ts`). Si no responde, el historial sigue: solo dice «Alguien» en vez del nombre.
  const personaIds = [...new Set((h.datos ?? []).map((x) => x.usuario_id).filter((id): id is string => !!id))];
  const nombres = new Map<string, string>();
  if (personaIds.length > 0) {
    const res = tolerar(await supabase.rpc("fn_nombres_personas", { p_ids: personaIds }), "quién movió la mercadería");
    for (const p of res.datos ?? []) nombres.set(p.id, p.nombre);
  }

  const reasignaciones: ReasignacionCompra[] = (h.datos ?? []).map((x) => ({
    id: x.id,
    compraItemId: x.compra_item_id,
    desdeId: x.desde_ubicacion_id,
    haciaId: x.hacia_ubicacion_id,
    cantidad: x.cantidad,
    motivo: motivoDeReasignacion(x.motivo),
    nota: x.nota,
    personaNombre: x.usuario_id ? (nombres.get(x.usuario_id) ?? null) : null,
    creadoEn: x.created_at,
  }));

  return { filas, reasignaciones, fallo: r.fallo };
}
