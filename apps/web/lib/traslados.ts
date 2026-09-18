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
  /** Número corrido (20260916200000): «Traslado 12» — lo que se dice por
   *  WhatsApp, en vez del uuid. */
  numero: number;
  ubicacionOrigenId: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoId: string;
  ubicacionDestinoNombre: string;
  estado: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  confirmadoEn: string | null;
  cerradoEn: string | null;
  nota: string | null;
  unidadesEnviadas: number;
  /** Cuántas prendas distintas van, y las primeras por nombre — para leer
   *  «Blusa Emma, Vestido Sofía +2» sin abrir el detalle. */
  lineas: number;
  referencias: string[];
};

const SELECT_RESUMEN = `id, numero, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, confirmado_en, cerrado_en, nota,
  origen:ubicaciones!transferencias_ubicacion_origen_id_fkey ( nombre ),
  destino:ubicaciones!transferencias_ubicacion_destino_id_fkey ( nombre ),
  transferencia_items ( cantidad, variante:variantes ( producto:productos ( referencia ) ) )`;

type FilaResumen = {
  id: string;
  numero: number;
  ubicacion_origen_id: string;
  ubicacion_destino_id: string;
  estado: string;
  fecha_estimada_llegada: string | null;
  created_at: string;
  confirmado_en: string | null;
  cerrado_en: string | null;
  nota: string | null;
  origen: { nombre: string } | null;
  destino: { nombre: string } | null;
  transferencia_items: { cantidad: number; variante: { producto: { referencia: string } | null } | null }[] | null;
};

function aResumen(f: FilaResumen): TrasladoResumen {
  const items = f.transferencia_items ?? [];
  // Un producto con tres tallas en el mismo traslado se nombra una vez.
  const referencias = Array.from(new Set(items.map((i) => i.variante?.producto?.referencia).filter((r): r is string => !!r)));
  return {
    id: f.id,
    numero: f.numero,
    ubicacionOrigenId: f.ubicacion_origen_id,
    ubicacionOrigenNombre: f.origen?.nombre ?? "—",
    ubicacionDestinoId: f.ubicacion_destino_id,
    ubicacionDestinoNombre: f.destino?.nombre ?? "—",
    estado: f.estado,
    fechaEstimadaLlegada: f.fecha_estimada_llegada,
    creadoEn: f.created_at,
    confirmadoEn: f.confirmado_en,
    cerradoEn: f.cerrado_en,
    nota: f.nota,
    unidadesEnviadas: items.reduce((acc, i) => acc + i.cantidad, 0),
    lineas: items.length,
    referencias,
  };
}

/** Traslados que no han terminado: en tránsito o con diferencia pendiente de
 *  líder. Bilateral — sale tanto si la ubicación es origen como destino. */
export async function getTrasladosEnCurso(ubicacionId: string): Promise<TrasladoResumen[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(SELECT_RESUMEN)
      .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .in("estado", ["en_transito", "recibido_con_diferencia"])
      .order("fecha_estimada_llegada", { ascending: true }),
    "los traslados en curso"
  );
  return filas.map((f) => aResumen(f as FilaResumen));
}

/** Los últimos traslados que YA terminaron (cerrados, o «completada» del
 *  modelo atómico anterior), para el historial de la pantalla. Aparte de los
 *  en curso a propósito: los en curso se traen todos (son pocos y hay que
 *  verlos todos); el historial se acota. */
export async function getTrasladosCerrados(ubicacionId: string, limite = 30): Promise<TrasladoResumen[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("transferencias")
      .select(SELECT_RESUMEN)
      .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
      .in("estado", ["cerrada", "completada"])
      .order("created_at", { ascending: false })
      .limit(limite),
    "los traslados anteriores"
  );
  return filas.map((f) => aResumen(f as FilaResumen));
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
  numero: number;
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
      `id, numero, ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada, created_at, nota, nota_cierre, creado_por,
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
    numero: t.numero,
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
