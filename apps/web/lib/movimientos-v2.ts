import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Historial de `retail.movimientos` — la fuente de verdad única del stock
// (append-only, ver ADR de V2). No existe pantalla equivalente en V1: ahí el
// stock se tocaba desde varias tablas (`stock`, `stock_almacen`) sin un
// ledger central navegable desde la UI.
export type MovimientoHistorial = {
  id: string;
  tipo: "entrada" | "salida" | "ajuste" | "traslado";
  cantidad: number;
  motivo: string | null;
  nota: string | null;
  creadoEn: string;
  sku: string;
  referencia: string;
  ubicacion: string;
  ubicacionDestino: string | null;
  usuario: string | null;
};

export async function getMovimientos(ubicacionId: string, limite = 50): Promise<MovimientoHistorial[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("movimientos")
      .select(
        `id, tipo, cantidad, motivo, nota, created_at, usuario_id,
         variante:variantes ( sku, producto:productos ( referencia ) ),
         ubicacion:ubicaciones!movimientos_ubicacion_id_fkey ( nombre ),
         ubicacion_destino:ubicaciones!movimientos_ubicacion_destino_id_fkey ( nombre )`
      )
      .or(`ubicacion_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .order("created_at", { ascending: false })
      .limit(limite),
    "los movimientos"
  );

  // `usuario_id` referencia public.personas (Dynamic) — PostgREST no
  // embebe entre schemas; se resuelve en un solo lote (ver
  // fn_nombres_personas en 0009_integracion_dynamic.sql), no una consulta
  // por fila.
  const usuarioIds = [...new Set(filas.map((m) => m.usuario_id).filter((id): id is string => id != null))];
  const nombresPorId = new Map<string, string>();
  if (usuarioIds.length > 0) {
    const nombres = exigir(await supabase.rpc("fn_nombres_personas", { p_ids: usuarioIds }), "quién hizo estos movimientos");
    nombres.forEach((n) => nombresPorId.set(n.id, n.nombre ?? ""));
  }

  return filas.map((m) => ({
    id: m.id,
    tipo: m.tipo as MovimientoHistorial["tipo"],
    cantidad: m.cantidad,
    motivo: m.motivo,
    nota: m.nota,
    creadoEn: m.created_at,
    sku: m.variante?.sku ?? "",
    referencia: m.variante?.producto?.referencia ?? "",
    ubicacion: m.ubicacion?.nombre ?? "",
    ubicacionDestino: m.ubicacion_destino?.nombre ?? null,
    usuario: m.usuario_id ? (nombresPorId.get(m.usuario_id) ?? null) : null,
  }));
}
