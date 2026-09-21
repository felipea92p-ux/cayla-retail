import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { ComprobanteProduccion, CondicionComprobante } from "@/lib/comprobantes-produccion-reglas";
import type { UnidadInsumo } from "@/lib/insumos-reglas";

// Comprobantes de Producción (ADR-0133, F4b; D-H). Solo lectura: toda escritura pasa por `registrar_comprobante_produccion` y
// `anular_comprobante_produccion`. Lo pagado y el saldo NO son columnas: los DERIVA `fn_comprobantes_produccion`. Solo el líder
// lee estas tablas (RLS) y la función responde cero filas a quien no lo es; la página además lo redirige antes de llegar acá.

export async function getComprobantesProduccion(): Promise<ComprobanteProduccion[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_comprobantes_produccion", { p_limite: 500 }), "los comprobantes de Producción");
  return filas.map((f) => ({
    id: f.id,
    proveedorId: f.proveedor_id,
    proveedor: f.proveedor,
    tipo: f.tipo,
    serie: f.serie,
    numero: f.numero,
    fechaEmision: f.fecha_emision,
    condicion: f.condicion as CondicionComprobante,
    fechaVencimiento: f.fecha_vencimiento,
    subtotal: Number(f.subtotal),
    igv: Number(f.igv),
    total: Number(f.total),
    estado: f.estado as "vigente" | "anulada",
    motivoAnulacion: f.motivo_anulacion,
    nota: f.nota,
    lineas: Number(f.lineas),
    pagado: Number(f.pagado),
    saldo: Number(f.saldo),
    estadoPago: f.estado_pago as ComprobanteProduccion["estadoPago"],
    vencido: f.vencido,
  }));
}

export type InsumoParaComprobante = { id: string; codigo: string; nombre: string; unidad: UnidadInsumo };

/** El catálogo de insumos que se puede facturar (sin archivados), para elegir en cada línea. */
export async function getInsumosParaComprobante(): Promise<InsumoParaComprobante[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.from("insumos").select("id, codigo, nombre, unidad_medida").is("archivado_at", null).order("nombre"), "los insumos");
  return filas.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, unidad: i.unidad_medida as UnidadInsumo }));
}
