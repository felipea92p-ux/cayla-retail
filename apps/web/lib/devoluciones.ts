import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { ETIQUETA_TIPO, type TipoComprobante } from "@/lib/comprobantes-reglas";
import { diaLima, inicioDeDiaLima, inicioDeMesLima } from "@/lib/panel-serie";
import { valorPagado } from "@/lib/devoluciones-reglas";

// Devoluciones: el backend (crear_devolucion, aprobar_devolucion, rechazar_devolucion) ya
// existía y sigue probado intacto — este archivo solo trae lecturas.
//
// La lista de compras y prendas para iniciar una devolución la trae `getVentasRecientes`
// (ventas-v2.ts), el mismo lector que usa Cambios (2026-09-18): tenía acá su propia copia,
// con el mismo defecto de pedir todas las líneas de la sede sin orden. Acá queda lo que es
// solo de Devoluciones: las pendientes de aprobar y las cifras.

export type ItemDevolucionPendiente = {
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  fotoUrl: string | null;
  sku: string;
  /** Código de etiqueta (`variantes.codigo`); se muestra con `codigoPrenda` — las prendas
   *  del censo nacen sin sku y `sku` llega "". */
  codigo: string | null;
  cantidad: number;
  condicion: string;
  /** Lo que la clienta pagó por esas unidades (precio menos descuento). */
  valorPagado: number;
};

export type DevolucionPendiente = {
  id: string;
  ventaId: string;
  motivo: string;
  creadoEn: string;
  solicitadoPorNombre: string;
  /** Cuándo se vendió lo que se devuelve — de ahí sale si está dentro del plazo. */
  vendidoEn: string;
  /** "Boleta B001-000010", o null si la venta no tiene boleta ni factura (R-15). */
  comprobante: string | null;
  /** SUNAT ya aceptó un comprobante de la venta: al aprobar se emite sola la nota de crédito. */
  comprobanteAceptado: boolean;
  valorPagado: number;
  items: ItemDevolucionPendiente[];
};

export async function getDevolucionesPendientes(ubicacionId: string): Promise<DevolucionPendiente[]> {
  const supabase = await createClient();
  const devoluciones = exigir(
    await supabase
      .from("devoluciones")
      .select("id, venta_id, motivo, created_at, solicitado_por, venta:ventas ( created_at )")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false }),
    "las devoluciones pendientes"
  );
  if (devoluciones.length === 0) return [];

  const ids = devoluciones.map((d) => d.id);
  const ventaIds = [...new Set(devoluciones.map((d) => d.venta_id))];
  const [itemsRes, comprobantesRes, nombresRes] = await Promise.all([
    supabase
      .from("devolucion_items")
      .select(
        `devolucion_id, cantidad, condicion,
         venta_item:venta_items ( precio_unitario, descuento_unitario,
           variante:variantes ( sku, codigo, color_codigo, talla:tallas ( valor ), color:colores ( nombre, hex ),
             producto:productos ( referencia, producto_fotos ( url, color_codigo ) ) ) )`
      )
      .in("devolucion_id", ids),
    supabase
      .from("comprobantes")
      .select("venta_id, tipo, serie, numero, estado, created_at")
      .in("venta_id", ventaIds)
      .in("tipo", ["boleta", "factura", "nota_venta"])
      .order("created_at"),
    supabase.rpc("fn_nombres_personas", {
      p_ids: [...new Set(devoluciones.map((d) => d.solicitado_por).filter((id): id is string => !!id))],
    }),
  ]);
  const items = exigir(itemsRes, "los ítems de las devoluciones pendientes");
  const nombres = exigir(nombresRes, "los nombres de quienes solicitaron");
  const nombrePorId = new Map(nombres.map((n) => [n.id, n.nombre]));

  // Como en la lista de ventas: si hay más de un comprobante, queda el último; y basta con
  // que UNO esté aceptado para que la aprobación emita la nota de crédito.
  const comprobantePorVenta = new Map<string, string>();
  const ventasConComprobanteAceptado = new Set<string>();
  for (const c of exigir(comprobantesRes, "las boletas de esas ventas")) {
    if (!c.venta_id) continue;
    if (c.estado === "aceptado") ventasConComprobanteAceptado.add(c.venta_id);
    comprobantePorVenta.set(c.venta_id, `${ETIQUETA_TIPO[c.tipo as TipoComprobante] ?? c.tipo} ${c.serie}-${String(c.numero).padStart(6, "0")}`);
  }

  return devoluciones.map((d) => {
    const itemsDeEsta: ItemDevolucionPendiente[] = items
      .filter((i) => i.devolucion_id === d.id)
      .map((i) => {
        const v = i.venta_item?.variante;
        return {
          referencia: v?.producto?.referencia ?? "",
          talla: v?.talla?.valor ?? null,
          color: v?.color?.nombre ?? null,
          colorHex: v?.color?.hex ?? null,
          fotoUrl: v?.producto?.producto_fotos.find((p) => p.color_codigo === v.color_codigo)?.url ?? null,
          sku: v?.sku ?? "",
          codigo: v?.codigo ?? null,
          cantidad: i.cantidad,
          condicion: i.condicion,
          valorPagado: valorPagado(
            { precioUnitario: Number(i.venta_item?.precio_unitario ?? 0), descuentoUnitario: Number(i.venta_item?.descuento_unitario ?? 0) },
            i.cantidad
          ),
        };
      });
    return {
      id: d.id,
      ventaId: d.venta_id,
      motivo: d.motivo,
      creadoEn: d.created_at,
      solicitadoPorNombre: (d.solicitado_por && nombrePorId.get(d.solicitado_por)) || "—",
      vendidoEn: d.venta?.created_at ?? d.created_at,
      comprobante: comprobantePorVenta.get(d.venta_id) ?? null,
      comprobanteAceptado: ventasConComprobanteAceptado.has(d.venta_id),
      valorPagado: Math.round(itemsDeEsta.reduce((suma, i) => suma + i.valorPagado, 0) * 100) / 100,
      items: itemsDeEsta,
    };
  });
}

export type EstadisticasDevoluciones = {
  devolucionesHoy: number;
  devolucionesMes: number;
  /** Lo que valían, a lo que pagó la clienta, las prendas de las devoluciones aprobadas
   *  este mes. No es plata que salió: el reembolso lo decide cada aprobación. */
  valorMes: number;
};

/** Los tres indicadores de la cabecera de Devoluciones — de las devoluciones APROBADAS, las
 *  que de verdad movieron algo (las pendientes se ven en «Por aprobar»; las rechazadas no
 *  cuentan). Se cuentan por el día en que se aprobaron. De ESTA sede. */
export async function getEstadisticasDevoluciones(ubicacionId: string, ahora = new Date()): Promise<EstadisticasDevoluciones> {
  const supabase = await createClient();
  const inicioDia = inicioDeDiaLima(diaLima(ahora.getTime()));
  const aprobadas = exigir(
    await supabase
      .from("devoluciones")
      .select("aprobado_en, items:devolucion_items ( cantidad, venta_item:venta_items ( precio_unitario, descuento_unitario ) )")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "aprobada")
      .gte("aprobado_en", inicioDeMesLima(ahora.getTime()).toISOString()),
    "las devoluciones aprobadas del mes"
  );
  const suma = aprobadas.reduce(
    (total, d) =>
      total +
      d.items.reduce(
        (t, i) =>
          t + valorPagado({ precioUnitario: Number(i.venta_item?.precio_unitario ?? 0), descuentoUnitario: Number(i.venta_item?.descuento_unitario ?? 0) }, i.cantidad),
        0
      ),
    0
  );
  return {
    devolucionesHoy: aprobadas.filter((d) => d.aprobado_en && new Date(d.aprobado_en) >= inicioDia).length,
    devolucionesMes: aprobadas.length,
    valorMes: Math.round(suma * 100) / 100,
  };
}
