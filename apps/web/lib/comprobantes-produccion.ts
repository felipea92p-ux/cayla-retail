import { createClient } from "@/lib/supabase/server";
import { exigir, leerTodas } from "@/lib/resultado";
import type { ComprobanteProduccion, CondicionComprobante } from "@/lib/comprobantes-produccion-reglas";
import type { FaltanteDePedido } from "@/lib/faltante-por-pagar-reglas";
import type { UnidadInsumo } from "@/lib/insumos-reglas";

// Comprobantes de Producción (ADR-0133, F4b; D-H). Solo lectura: toda escritura pasa por `registrar_comprobante_produccion` y
// `anular_comprobante_produccion`. Lo pagado y el saldo NO son columnas: los DERIVA `fn_comprobantes_produccion`. Solo el líder
// lee estas tablas (RLS) y la función responde cero filas a quien no lo es; la página además lo redirige antes de llegar acá.

/** Tope que se le pasa a `fn_comprobantes_produccion` (la función exige uno): más de lo que el Taller emitirá nunca. */
const SIN_TOPE = 1_000_000;

export async function getComprobantesProduccion(): Promise<ComprobanteProduccion[]> {
  const supabase = await createClient();
  // Antes: `p_limite: 500` fijo, y Por pagar sumaba el saldo SOLO de los 500 más recientes — un comprobante viejo sin
  // pagar desaparecía de la deuda en silencio. La función no tiene «sin tope», así que se le da uno que no se alcanza y
  // se lee por páginas, en serie (ADR-0192): con menos de 1.000 comprobantes es la misma única llamada de antes.
  const filas = exigir(
    await leerTodas(
      (desde, hasta) =>
        supabase
          .rpc("fn_comprobantes_produccion", { p_limite: SIN_TOPE })
          .order("fecha_emision", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(desde, hasta),
      { enParalelo: 1 },
    ),
    "los comprobantes de Producción",
  );
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

/**
 * Lo que cerró como «no va a llegar» el PEDIDO de cada factura, por id de factura (P02 del «Análisis del Taller», opción B). Es un dato de apoyo para avisar en Por pagar: si algo no responde
 * (la columna que une factura y pedido, el módulo «Órdenes de insumos» en el rol, la función) devuelve `{}` y la pantalla se ve como siempre. El cierre cuelga del pedido, no de la factura.
 */
export async function getFaltantesPorComprobante(): Promise<Record<string, FaltanteDePedido>> {
  const supabase = await createClient();
  // `orden_insumo_id` es nueva y los tipos generados todavía no la traen: la consulta se tipa a mano.
  type Fila = { id: string; orden_insumo_id: string | null };
  const { data, error } = await (supabase.from("comprobantes_produccion") as unknown as {
    select: (c: string) => { not: (col: string, op: string, v: null) => PromiseLike<{ data: Fila[] | null; error: { message: string } | null }> };
  })
    // Sin traer el número del pedido: `authenticated` no lee `ordenes_insumo` (solo por sus funciones); el aviso dice «el pedido al que pertenece esta factura».
    .select("id, orden_insumo_id")
    .not("orden_insumo_id", "is", null);
  if (error) console.error(`lo que faltó llegar (facturas y pedidos): ${error.message}`);
  if (error || !data || data.length === 0) return {};
  const ordenes = [...new Set(data.map((f) => f.orden_insumo_id).filter((x): x is string => !!x))];
  const debe = new Map<string, { neto: number; cierres: number }>();
  // La función acepta hasta 200 pedidos por pregunta.
  for (let i = 0; i < ordenes.length; i += 200) {
    const r = await (supabase as unknown as { rpc: (f: string, a: { p_ids: string[] }) => PromiseLike<{ data: { orden_id: string; cierres: number; nos_debe: number | string }[] | null; error: { message: string } | null }> }).rpc("fn_ordenes_insumo_nos_debe", { p_ids: ordenes.slice(i, i + 200) });
    if (r.error) {
      console.error(`lo que faltó llegar (fn_ordenes_insumo_nos_debe): ${r.error.message}`);
      return {};
    }
    for (const f of r.data ?? []) debe.set(f.orden_id, { neto: Number(f.nos_debe), cierres: Number(f.cierres) });
  }
  const salida: Record<string, FaltanteDePedido> = {};
  for (const f of data) {
    const d = f.orden_insumo_id ? debe.get(f.orden_insumo_id) : undefined;
    if (d && d.neto > 0) salida[f.id] = { orden: null, netoSinIgv: d.neto, cierres: d.cierres };
  }
  return salida;
}

export type InsumoParaComprobante = { id: string; codigo: string; nombre: string; unidad: UnidadInsumo };

/** El catálogo de insumos que se puede facturar (sin archivados), para elegir en cada línea. */
export async function getInsumosParaComprobante(): Promise<InsumoParaComprobante[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.from("insumos").select("id, codigo, nombre, unidad_medida").is("archivado_at", null).order("nombre"), "los insumos");
  return filas.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, unidad: i.unidad_medida as UnidadInsumo }));
}
