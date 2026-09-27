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

export type PrendaResuelta = { referencia: string; talla: string | null; color: string | null; cantidad: number; condicion: string };

export type DevolucionResuelta = {
  id: string;
  ventaId: string;
  estado: "aprobada" | "rechazada";
  /** Cuándo se aprobó o rechazó (`aprobado_en` guarda las dos: ver `devoluciones_aprobacion_coherente`). */
  resueltaEn: string;
  resueltaPorNombre: string;
  comprobante: string | null;
  /** «Nota de crédito BC04-000012» si la aprobación la emitió (ADR-0100); null si no hubo. */
  notaCredito: string | null;
  reembolsoMonto: number | null;
  reembolsoMetodo: string | null;
  valorPagado: number;
  prendas: PrendaResuelta[];
};

/** Días que mira la pestaña «Resueltas»: los mismos 15 del plazo, para que la colaboradora vea qué pasó
 *  con lo que registró en ese tiempo. */
const DIAS_RESUELTAS = 15;

/** Las devoluciones aprobadas o rechazadas de los últimos 15 días en ESTA sede, la más nueva primero
 *  (spike 2026-09-26, pestaña «Resueltas»): con su nota de crédito, el reembolso y adónde fue cada prenda.
 *  Solo lectura, con la misma RLS que las pendientes. */
export async function getDevolucionesResueltas(ubicacionId: string, ahora = new Date()): Promise<DevolucionResuelta[]> {
  const supabase = await createClient();
  const desde = new Date(ahora.getTime() - DIAS_RESUELTAS * 86_400_000).toISOString();
  const devoluciones = exigir(
    await supabase
      .from("devoluciones")
      .select(
        `id, venta_id, estado, aprobado_en, aprobado_por, reembolso_monto, reembolso_metodo,
         nota_credito:comprobantes!devoluciones_nota_credito_id_fkey ( tipo, serie, numero ),
         items:devolucion_items ( cantidad, condicion,
           venta_item:venta_items ( precio_unitario, descuento_unitario,
             variante:variantes ( talla:tallas ( valor ), color:colores ( nombre ), producto:productos ( referencia ) ) ) )`
      )
      .eq("ubicacion_id", ubicacionId)
      .in("estado", ["aprobada", "rechazada"])
      .gte("aprobado_en", desde)
      .order("aprobado_en", { ascending: false }),
    "las devoluciones resueltas"
  );
  if (devoluciones.length === 0) return [];

  const ventaIds = [...new Set(devoluciones.map((d) => d.venta_id))];
  const [comprobantesRes, nombresRes] = await Promise.all([
    supabase
      .from("comprobantes")
      .select("venta_id, tipo, serie, numero, created_at")
      .in("venta_id", ventaIds)
      .in("tipo", ["boleta", "factura", "nota_venta"])
      .order("created_at"),
    supabase.rpc("fn_nombres_personas", {
      p_ids: [...new Set(devoluciones.map((d) => d.aprobado_por).filter((id): id is string => !!id))],
    }),
  ]);
  const nombrePorId = new Map(exigir(nombresRes, "los nombres de quienes resolvieron").map((n) => [n.id, n.nombre]));
  const comprobantePorVenta = new Map<string, string>();
  for (const c of exigir(comprobantesRes, "las boletas de esas ventas")) {
    if (c.venta_id) comprobantePorVenta.set(c.venta_id, textoComprobante(c));
  }

  return devoluciones.map((d) => {
    const nc = Array.isArray(d.nota_credito) ? d.nota_credito[0] : d.nota_credito;
    return {
      id: d.id,
      ventaId: d.venta_id,
      estado: d.estado as "aprobada" | "rechazada",
      resueltaEn: d.aprobado_en ?? "",
      resueltaPorNombre: (d.aprobado_por && nombrePorId.get(d.aprobado_por)) || "—",
      comprobante: comprobantePorVenta.get(d.venta_id) ?? null,
      notaCredito: nc ? textoComprobante(nc) : null,
      reembolsoMonto: d.reembolso_monto === null ? null : Number(d.reembolso_monto),
      reembolsoMetodo: d.reembolso_metodo,
      valorPagado:
        Math.round(
          d.items.reduce(
            (t, i) => t + valorPagado({ precioUnitario: Number(i.venta_item?.precio_unitario ?? 0), descuentoUnitario: Number(i.venta_item?.descuento_unitario ?? 0) }, i.cantidad),
            0
          ) * 100
        ) / 100,
      prendas: d.items.map((i) => ({
        referencia: i.venta_item?.variante?.producto?.referencia ?? "",
        talla: i.venta_item?.variante?.talla?.valor ?? null,
        color: i.venta_item?.variante?.color?.nombre ?? null,
        cantidad: i.cantidad,
        condicion: i.condicion,
      })),
    };
  });
}

function textoComprobante(c: { tipo: string; serie: string; numero: number }): string {
  return `${ETIQUETA_TIPO[c.tipo as TipoComprobante] ?? c.tipo} ${c.serie}-${String(c.numero).padStart(6, "0")}`;
}

/** Cuántas prendas esperan en cuarentena en ESTA sede (de devoluciones o de cambios): el aviso de
 *  Devoluciones que lleva a Inventario. Solo cuenta, no trae detalle. */
export async function contarPrendasEnCuarentena(ubicacionId: string): Promise<number> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.from("prendas_danadas").select("cantidad").eq("ubicacion_id", ubicacionId).eq("estado", "en_cuarentena"),
    "las prendas en cuarentena"
  );
  return filas.reduce((t, f) => t + f.cantidad, 0);
}
