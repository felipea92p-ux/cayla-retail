import { createClient } from "@/lib/supabase/server";

export type TipoComprobante = "boleta" | "factura" | "nota_credito";
export type EstadoComprobante = "pendiente" | "enviado" | "aceptado" | "rechazado" | "anulado";

export type Comprobante = {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  cliente_tipo_doc: "dni" | "ruc" | "sin_documento";
  cliente_num_doc: string | null;
  cliente_nombre: string | null;
  total: number;
  estado: EstadoComprobante;
  motivo_rechazo: string | null;
  created_at: string;
  sede_id: string;
};

export type SerieComprobante = {
  id: string;
  sede_id: string;
  tipo: TipoComprobante;
  serie: string;
  siguiente_numero: number;
};

// Lectura pura (principio de arquitectura del repo: lib/ nunca escribe).
// La emisión pasa por la RPC `emitir_comprobante` desde el componente cliente.
export async function getComprobantesMes(desde: string, hasta: string): Promise<Comprobante[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comprobantes")
    .select(
      "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, total, estado, motivo_rechazo, created_at, sede_id"
    )
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  return (data as Comprobante[] | null) ?? [];
}

export async function getSeriesComprobantes(): Promise<SerieComprobante[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("series_comprobantes")
    .select("id, sede_id, tipo, serie, siguiente_numero")
    .order("tipo");
  return (data as SerieComprobante[] | null) ?? [];
}

// ==================== Comprobante impreso (PDF A4 / ticket térmico) ====================

/** Una línea del comprobante, ya con sus montos calculados para imprimir. */
export type ComprobanteItem = {
  descripcion: string;
  unidad_medida: string;
  cantidad: number;
  valor_unitario: number;
  subtotal: number;
  igv: number;
  total: number;
};

export type SedeFiscal = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  telefono: string | null;
};

export type ConfiguracionEmpresa = {
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  email: string | null;
  web: string | null;
  telefono: string | null;
  resolucion_autorizacion: string | null;
};

export type ComprobanteCompleto = Comprobante & {
  subtotal: number;
  igv: number;
  items: ComprobanteItem[];
  sede: SedeFiscal;
  empresa: ConfiguracionEmpresa;
};

const IGV_TASA = 0.18;

/** Las líneas viven en `comprobantes.items` (jsonb, ADR-0009) con la forma
 *  mínima que necesita Lucode: descripción, cantidad y precio unitario SIN
 *  IGV. Los montos por línea se derivan aquí, no se guardan duplicados — el
 *  total del comprobante sigue siendo el de la cabecera, que es el que se
 *  transmitió a SUNAT. Unidad de medida fija en NIU (unidad) porque el jsonb
 *  todavía no la modela; descuentos por línea tampoco existen aún. */
function itemsParaImprimir(items: unknown): ComprobanteItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const fila = it as { descripcion?: string; cantidad?: number; precio_unitario?: number };
    const cantidad = Number(fila.cantidad ?? 0);
    const valorUnitario = Number(fila.precio_unitario ?? 0);
    const subtotal = Math.round(cantidad * valorUnitario * 100) / 100;
    const igv = Math.round(subtotal * IGV_TASA * 100) / 100;
    return {
      descripcion: fila.descripcion ?? "",
      unidad_medida: "NIU",
      cantidad,
      valor_unitario: valorUnitario,
      subtotal,
      igv,
      total: Math.round((subtotal + igv) * 100) / 100,
    };
  });
}

/** Todo lo que necesita el PDF (A4 o ticket) en un solo viaje, para no dejar
 *  el encabezado y las líneas desincronizados en el momento de imprimir.
 *  No filtra por sede: hereda el RLS de la propia fila. */
export async function getComprobanteCompleto(id: string): Promise<ComprobanteCompleto | null> {
  const supabase = await createClient();
  const [{ data: comprobante }, { data: empresa }] = await Promise.all([
    supabase
      .from("comprobantes")
      .select(
        "id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre, subtotal, igv, total, estado, motivo_rechazo, created_at, sede_id, items"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("configuracion_empresa")
      .select("ruc, razon_social, nombre_comercial, email, web, telefono, resolucion_autorizacion")
      .maybeSingle(),
  ]);
  if (!comprobante || !empresa) return null;

  // La dirección fiscal vive en su propia tabla, no en `sedes`: en producción
  // `sedes` es una vista puente sobre cayla-dynamic y no admite columnas
  // nuevas (ver 0040). Se traen por separado y se juntan acá.
  const [{ data: sede }, { data: fiscales }] = await Promise.all([
    supabase.from("sedes").select("id, codigo, nombre").eq("id", comprobante.sede_id).maybeSingle(),
    supabase
      .from("sede_datos_fiscales")
      .select("direccion, ubigeo, departamento, provincia, distrito, telefono")
      .eq("sede_id", comprobante.sede_id)
      .maybeSingle(),
  ]);
  if (!sede) return null;

  return {
    ...(comprobante as unknown as Comprobante),
    subtotal: Number(comprobante.subtotal),
    igv: Number(comprobante.igv),
    items: itemsParaImprimir(comprobante.items),
    // Sin fila de datos fiscales el comprobante igual se imprime, con los
    // campos de dirección en blanco: mejor eso que frenar una venta.
    sede: {
      id: sede.id ?? comprobante.sede_id,
      codigo: sede.codigo ?? "",
      nombre: sede.nombre ?? "",
      direccion: fiscales?.direccion ?? null,
      ubigeo: fiscales?.ubigeo ?? null,
      departamento: fiscales?.departamento ?? null,
      provincia: fiscales?.provincia ?? null,
      distrito: fiscales?.distrito ?? null,
      telefono: fiscales?.telefono ?? null,
    },
    empresa: empresa as ConfiguracionEmpresa,
  };
}
