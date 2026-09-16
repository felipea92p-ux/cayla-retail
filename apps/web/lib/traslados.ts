import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";

// Traslados en dos fases (20260916150000): envío → en tránsito →
// confirmación en destino. Las RPC de escritura (iniciar_traslado,
// registrar_recepcion_traslado, confirmar_traslado,
// cerrar_traslado_con_diferencia) se llaman directo desde los componentes
// cliente (mismo patrón que `abrir_conteo`/`conteo_contar` en ConteoPanel.tsx)
// — este archivo solo trae lecturas server-side.

export type TrasladoResumen = {
  id: string;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  nota: string | null;
  unidadesEnviadas: number;
};

/** Traslados que no han terminado: en tránsito o con diferencia pendiente de
 *  líder. Bilateral — sale tanto si la ubicación es origen como destino. */
export async function getTrasladosEnCurso(ubicacionId: string): Promise<TrasladoResumen[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(
        `id, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, nota,
         origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre ),
         destino:ubicaciones!transferencias_ubicacion_destino_id_fkey ( nombre ),
         transferencia_items ( cantidad )`
      )
      .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .in("estado", ["en_transito", "recibido_con_diferencia"])
      .order("fecha_estimada_llegada", { ascending: true }),
    "los traslados en curso"
  );

  return filas.map((f) => ({
    id: f.id,
    ubicacionOrigenId: f.ubicacion_origen_id,
    ubicacionOrigenNombre: f.origen?.nombre ?? "—",
    ubicacionDestinoId: f.ubicacion_destino_id,
    ubicacionDestinoNombre: f.destino?.nombre ?? "—",
    estado: f.estado,
    fechaEstimadaLlegada: f.fecha_estimada_llegada,
    creadoEn: f.created_at,
    nota: f.nota,
    unidadesEnviadas: (f.transferencia_items ?? []).reduce((acc, i) => acc + i.cantidad, 0),
  }));
}

export type LineaTraslado = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidadEnviada: number | null;
  cantidadRecibida: number | null;
  diferencia: number | null;
};

export type TrasladoDetalle = {
  id: string;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  nota: string | null;
  notaCierre: string | null;
  creadoPorNombre: string;
  lineas: LineaTraslado[];
};

export async function getTrasladoDetalle(id: string): Promise<TrasladoDetalle | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("transferencias")
    .select(
      `id, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, nota, nota_cierre, creado_por,
       origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre ),
       destino:ubicaciones!transferencias_ubicacion_destino_id_fkey ( nombre )`
    )
    .eq("id", id)
    .maybeSingle();
  const t = exigirOpcional(res, "el traslado");
  if (!t) return null;

  const [lineasRes, nombreRes] = await Promise.all([
    supabase.rpc("fn_traslado_lineas", { p_transferencia_id: id }),
    t.creado_por ? supabase.rpc("fn_nombres_personas", { p_ids: [t.creado_por] }) : Promise.resolve({ data: [], error: null }),
  ]);
  const lineas = exigir(lineasRes, "las líneas del traslado");
  const nombres = exigir(nombreRes, "el nombre de quien envió");

  return {
    id: t.id,
    ubicacionOrigenId: t.ubicacion_origen_id,
    ubicacionOrigenNombre: t.origen?.nombre ?? "—",
    ubicacionDestinoId: t.ubicacion_destino_id,
    ubicacionDestinoNombre: t.destino?.nombre ?? "—",
    estado: t.estado,
    fechaEstimadaLlegada: t.fecha_estimada_llegada,
    creadoEn: t.created_at,
    nota: t.nota,
    notaCierre: t.nota_cierre,
    creadoPorNombre: nombres[0]?.nombre ?? "—",
    lineas: lineas.map((l) => ({
      varianteId: l.variante_id,
      sku: l.sku,
      referencia: l.referencia,
      talla: l.talla,
      color: l.color,
      cantidadEnviada: l.cantidad_enviada,
      cantidadRecibida: l.cantidad_recibida,
      diferencia: l.diferencia,
    })),
  };
}
