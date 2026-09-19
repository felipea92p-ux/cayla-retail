import type { createClient } from "@/lib/supabase/client";
import { armarDetalleVenta, type FilasVenta, type VentaDetalle } from "@/lib/venta-detalle-reglas";

type Cliente = ReturnType<typeof createClient>;

/** Lee una venta con sus prendas, sus pagos y su comprobante. La RLS (`fn_puede_operar_ubicacion`)
 *  decide quién la ve: una integrante solo las de su tienda. Va con el cliente del navegador
 *  —igual que `PuntoDeVenta` lee su comprobante— porque el detalle se abre al hacer clic. */
export async function leerVentaDetalle(supabase: Cliente, ventaId: string, ctx: { sede: string; vendedor: string | null }): Promise<VentaDetalle> {
  const [venta, comprobante] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, created_at,
         venta_items ( cantidad, precio_unitario, descuento_unitario,
           variante:variantes ( sku, codigo, talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) ) ),
         venta_pagos ( metodo, monto, recibido )`
      )
      .eq("id", ventaId)
      .maybeSingle(),
    supabase
      .from("comprobantes")
      .select("tipo, serie, numero, estado, created_at, cliente_tipo_doc, cliente_num_doc, cliente_nombre, motivo_rechazo, respuesta_sunat")
      .eq("venta_id", ventaId)
      .maybeSingle(),
  ]);
  if (venta.error) throw new Error(venta.error.message);
  if (comprobante.error) throw new Error(comprobante.error.message);
  if (!venta.data) throw new Error("La venta no existe o no tienes permiso para verla.");

  // El tipado de las relaciones embebidas de PostgREST es ancho (objeto o arreglo); la forma
  // real está fijada por el `select` de arriba, así que se afirma aquí, en un solo lugar.
  const filas: FilasVenta = {
    id: venta.data.id,
    created_at: venta.data.created_at,
    items: venta.data.venta_items as unknown as FilasVenta["items"],
    pagos: venta.data.venta_pagos as unknown as FilasVenta["pagos"],
    comprobante: (comprobante.data as unknown as FilasVenta["comprobante"]) ?? null,
  };
  return armarDetalleVenta(filas, ctx);
}
