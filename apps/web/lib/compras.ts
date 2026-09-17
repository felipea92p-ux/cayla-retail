import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import {
  ADJUNTOS_BUCKET,
  type AdjuntoCompra,
  type CompraResumen,
  type Condicion,
  type EstadoPago,
  type EstadoRecepcion,
  type LineaCompra,
  type PagoCompra,
  type RecepcionCompra,
  type ProveedorResumen,
} from "@/lib/compras-reglas";

// Las páginas (server) importan todo desde acá; los componentes cliente
// importan SOLO `compras-reglas.ts`.
export * from "@/lib/compras-reglas";

// Compras V2 (2026-09-12, ADR-0035): la factura del proveedor es el eje. Todo
// lo que se lee acá sale de las vistas `compras_resumen` y
// `compra_items_resumen`, que calculan saldo, pagado y recibido desde
// `compra_pagos` y `movimientos` — nunca hay una columna "pagado" guardada
// que se pueda desincronizar. Este archivo solo LEE; toda escritura pasa por
// las RPC `registrar_compra`, `registrar_pago_compra`, `anular_compra` y
// `recibir_compras` desde los componentes cliente.

type FilaResumen = {
  id: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc: string | null;
  tipo: string | null;
  documento: string | null;
  fecha_emision: string | null;
  condicion: string | null;
  fecha_vencimiento: string | null;
  ubicacion_destino_id: string | null;
  subtotal: number | null;
  igv: number | null;
  total: number | null;
  pagado: number | null;
  saldo: number | null;
  estado: string | null;
  estado_pago: string | null;
  facturado_cantidad: number | null;
  recibido_cantidad: number | null;
  estado_recepcion: string | null;
  vencida: boolean | null;
  nota: string | null;
  created_at: string | null;
};

// Las columnas de una vista llegan como `T | null` aunque nunca lo sean: el
// generador de tipos no puede saber que `c.id` viene de una PK. Se normaliza
// una sola vez acá para que las pantallas no repitan `?? ""` en cada campo.
function aResumen(f: FilaResumen): CompraResumen {
  return {
    id: f.id ?? "",
    proveedorId: f.proveedor_id ?? "",
    proveedorNombre: f.proveedor_nombre ?? "",
    proveedorRuc: f.proveedor_ruc,
    tipo: f.tipo ?? "factura",
    documento: f.documento ?? "",
    fechaEmision: f.fecha_emision ?? "",
    condicion: (f.condicion as Condicion) ?? "contado",
    fechaVencimiento: f.fecha_vencimiento,
    ubicacionDestinoId: f.ubicacion_destino_id ?? "",
    subtotal: Number(f.subtotal ?? 0),
    igv: Number(f.igv ?? 0),
    total: Number(f.total ?? 0),
    pagado: Number(f.pagado ?? 0),
    saldo: Number(f.saldo ?? 0),
    estado: (f.estado as "vigente" | "anulada") ?? "vigente",
    estadoPago: (f.estado_pago as EstadoPago) ?? "pendiente",
    facturadoCantidad: Number(f.facturado_cantidad ?? 0),
    recibidoCantidad: Number(f.recibido_cantidad ?? 0),
    estadoRecepcion: (f.estado_recepcion as EstadoRecepcion) ?? "sin_recibir",
    vencida: f.vencida ?? false,
    nota: f.nota,
    creadoEn: f.created_at ?? "",
  };
}

// ---------- listar con filtros y cursor (migración compras_snapshot_y_paginado) ----------
// Todo el filtrado y el paginado ocurren en Postgres, vía `listar_compras`,
// sobre índices: la app nunca trae más de una página. El cursor es la
// (fecha, creadoEn, id) de la última fila vista — "dame las siguientes a
// esta" — en vez de OFFSET, que a un millón de filas lee y descarta un millón.
// `creadoEn` desempata entre facturas del mismo día (la registrada más
// recientemente va primera); `id` solo garantiza que el cursor sea único.
export type OrdenCompras = "emision" | "vencimiento";

export type FiltrosCompras = {
  busqueda?: string;
  proveedorId?: string;
  estadoPago?: EstadoPago;
  estadoRecepcion?: EstadoRecepcion;
  condicion?: Condicion;
  soloVigentes?: boolean;
  conSaldo?: boolean;
  soloVencidas?: boolean;
  porRecibir?: boolean;
  desde?: string;
  hasta?: string;
};

export type Cursor = { fecha: string; creadoEn: string; id: string };

export type PaginaCompras = {
  filas: CompraResumen[];
  /** Cursor para pedir la página siguiente; null si esta es la última. */
  siguiente: Cursor | null;
};

export const TAMANO_PAGINA = 50;

/** Parámetros de URL de las pantallas de Compras (ver `FiltrosCompras.tsx`). */
/** `pagar`: id de la factura cuyo modal de pago se abre al llegar a Por pagar (viene del botón "Registrar pago" del detalle). */
export type ParamsCompras = { q?: string; prov?: string; pago?: string; recep?: string; cond?: string; desde?: string; hasta?: string; vencidas?: string; cursor?: string; pagar?: string };

const ESTADOS_PAGO: EstadoPago[] = ["pendiente", "parcial", "pagada", "anulada"];
const ESTADOS_RECEPCION: EstadoRecepcion[] = ["sin_recibir", "parcial", "recibida", "anulada"];
const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Traduce la URL a filtros, descartando cualquier valor que no sea válido. */
export function filtrosDesdeParams(p: ParamsCompras): FiltrosCompras {
  return {
    busqueda: p.q?.trim() || undefined,
    proveedorId: p.prov && /^[0-9a-f-]{36}$/i.test(p.prov) ? p.prov : undefined,
    estadoPago: ESTADOS_PAGO.find((e) => e === p.pago),
    estadoRecepcion: ESTADOS_RECEPCION.find((e) => e === p.recep),
    condicion: p.cond === "contado" || p.cond === "credito" ? p.cond : undefined,
    soloVencidas: p.vencidas === "1" || undefined,
    desde: esFecha(p.desde) ? p.desde : undefined,
    hasta: esFecha(p.hasta) ? p.hasta : undefined,
  };
}

export async function listarCompras(
  filtros: FiltrosCompras = {},
  opciones: { orden?: OrdenCompras; cursor?: Cursor | null; limite?: number } = {}
): Promise<PaginaCompras> {
  const supabase = await createClient();
  const orden = opciones.orden ?? "emision";
  const limite = opciones.limite ?? TAMANO_PAGINA;
  const filas = exigir(
    await supabase.rpc("listar_compras", {
      p_limite: limite,
      p_orden: orden,
      ...(opciones.cursor
        ? { p_cursor_fecha: opciones.cursor.fecha, p_cursor_creado_en: opciones.cursor.creadoEn, p_cursor_id: opciones.cursor.id }
        : {}),
      ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
      ...(filtros.proveedorId ? { p_proveedor_id: filtros.proveedorId } : {}),
      ...(filtros.estadoPago ? { p_estado_pago: filtros.estadoPago } : {}),
      ...(filtros.estadoRecepcion ? { p_estado_recepcion: filtros.estadoRecepcion } : {}),
      ...(filtros.condicion ? { p_condicion: filtros.condicion } : {}),
      ...(filtros.soloVigentes ? { p_solo_vigentes: true } : {}),
      ...(filtros.conSaldo ? { p_con_saldo: true } : {}),
      ...(filtros.soloVencidas ? { p_solo_vencidas: true } : {}),
      ...(filtros.porRecibir ? { p_por_recibir: true } : {}),
      ...(filtros.desde ? { p_desde: filtros.desde } : {}),
      ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
    }),
    "las facturas de compra"
  );
  // La función devuelve limite+1 filas a propósito: la de más solo dice "hay otra página".
  const hayMas = filas.length > limite;
  const pagina = (hayMas ? filas.slice(0, limite) : filas).map(aResumen);
  const ultima = pagina[pagina.length - 1];
  const siguiente =
    hayMas && ultima
      ? { fecha: orden === "vencimiento" ? (ultima.fechaVencimiento ?? "") : ultima.fechaEmision, creadoEn: ultima.creadoEn, id: ultima.id }
      : null;
  return { filas: pagina, siguiente };
}

/** Facturas vigentes con saldo — "Por pagar". Ordenadas por vencimiento (vencidas primero, naturalmente). */
export function listarPorPagar(filtros: FiltrosCompras = {}, cursor: Cursor | null = null): Promise<PaginaCompras> {
  return listarCompras({ ...filtros, conSaldo: true }, { orden: "vencimiento", cursor });
}

/** Facturas vigentes con mercadería pendiente de recibir (índice parcial `compras_por_recibir_idx`). */
export function listarPorRecibir(filtros: FiltrosCompras = {}, cursor: Cursor | null = null): Promise<PaginaCompras> {
  return listarCompras({ ...filtros, porRecibir: true }, { cursor });
}

/** Cifras de cabecera (conteos y sumas), calculadas en Postgres en una sola llamada. */
export type ResumenCompras = {
  registradas: number;
  vigentes: number;
  porRecibir: number;
  deuda: number;
  conSaldo: number;
  vencido: number;
  vencidas: number;
  /** Con vencimiento de hoy a 7 días (migración compras_resumen_por_vencer). */
  porVencer: number;
  porVencerMonto: number;
};

export async function getResumenCompras(): Promise<ResumenCompras> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("resumen_compras"), "el resumen de compras");
  const r = filas[0];
  if (!r) throw new Error("No se pudo leer el resumen de compras: la función no devolvió filas.");
  return {
    registradas: Number(r.registradas ?? 0),
    vigentes: Number(r.vigentes ?? 0),
    porRecibir: Number(r.por_recibir ?? 0),
    deuda: Number(r.deuda ?? 0),
    conSaldo: Number(r.con_saldo ?? 0),
    vencido: Number(r.vencido ?? 0),
    vencidas: Number(r.vencidas ?? 0),
    // `?? 0`: si producción todavía no tiene la migración, la tarjeta dice 0
    // en vez de tumbar la página.
    porVencer: Number(r.por_vencer ?? 0),
    porVencerMonto: Number(r.por_vencer_monto ?? 0),
  };
}

export async function getCompra(compraId: string): Promise<CompraResumen | null> {
  const supabase = await createClient();
  const [fila, base] = await Promise.all([
    supabase.from("compras_resumen").select("*").eq("id", compraId).maybeSingle(),
    supabase.from("compras").select("motivo_anulacion").eq("id", compraId).maybeSingle(),
  ]);
  const resumen = exigirOpcional(fila, "la factura de compra");
  if (!resumen) return null;
  return { ...aResumen(resumen), motivoAnulacion: exigirOpcional(base, "la factura de compra")?.motivo_anulacion ?? null };
}

/** Líneas de una o varias facturas, con lo ya recibido por línea. */
export async function getLineasCompra(compraIds: string[]): Promise<LineaCompra[]> {
  if (compraIds.length === 0) return [];
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("compra_items_resumen")
      .select("id, compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario, subtotal, recibido, pendiente")
      .in("compra_id", compraIds),
    "las líneas de la factura"
  );

  // Referencia del producto y datos de la variante se resuelven aparte: la
  // vista no expone FKs a PostgREST, así que no se puede embeber.
  const productoIds = [...new Set(filas.map((f) => f.producto_id ?? "").filter(Boolean))];
  const varianteIds = [...new Set(filas.map((f) => f.variante_id ?? "").filter(Boolean))];
  const [productosRes, variantesRes] = await Promise.all([
    productoIds.length ? supabase.from("productos").select("id, referencia").in("id", productoIds) : Promise.resolve({ data: [], error: null }),
    varianteIds.length
      ? supabase.from("variantes").select("id, sku, talla:tallas ( valor ), color:colores ( nombre )").in("id", varianteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const productos = new Map(exigir(productosRes, "los productos de la factura").map((p) => [p.id, p.referencia]));
  const variantes = new Map(
    exigir(variantesRes, "las variantes de la factura").map((v) => [v.id, { sku: v.sku, talla: v.talla?.valor ?? null, color: v.color?.nombre ?? null }])
  );

  return filas.map((f) => {
    const v = f.variante_id ? variantes.get(f.variante_id) : undefined;
    return {
      id: f.id ?? "",
      compraId: f.compra_id ?? "",
      productoId: f.producto_id ?? "",
      referencia: productos.get(f.producto_id ?? "") ?? "",
      varianteId: f.variante_id,
      sku: v?.sku ?? null,
      talla: v?.talla ?? null,
      color: v?.color ?? null,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad ?? 0),
      costoUnitario: Number(f.costo_unitario ?? 0),
      subtotal: Number(f.subtotal ?? 0),
      recibido: Number(f.recibido ?? 0),
      pendiente: Number(f.pendiente ?? 0),
    };
  });
}

// Adjuntos visibles de una factura, con su URL firmada de una hora. Si
// Storage no responde (en local está apagado; en producción, un mal día) la
// lista igual se muestra, solo que sin enlace — principio 9: se degrada, no
// se rompe la página entera por un PDF.
export async function getAdjuntosCompra(compraId: string): Promise<AdjuntoCompra[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("compra_adjuntos")
      .select("id, ruta, nombre, tipo, bytes, created_at")
      .eq("compra_id", compraId)
      .is("archivado_en", null)
      .order("created_at", { ascending: true }),
    "los adjuntos de la factura"
  );
  if (filas.length === 0) return [];
  let urls = new Map<string, string>();
  try {
    const { data } = await supabase.storage.from(ADJUNTOS_BUCKET).createSignedUrls(
      filas.map((f) => f.ruta),
      60 * 60
    );
    urls = new Map((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
  } catch {
    // Sin Storage no hay enlaces; la lista igual sale.
  }
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, bytes: f.bytes, creadoEn: f.created_at, url: urls.get(f.ruta) ?? null }));
}

export async function getPagosCompra(compraId: string): Promise<PagoCompra[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("compra_pagos")
      .select("id, fecha, monto, metodo, referencia")
      .eq("compra_id", compraId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    "los pagos de la factura"
  );
  return filas.map((p) => ({ id: p.id, fecha: p.fecha, monto: Number(p.monto), metodo: p.metodo, referencia: p.referencia }));
}

/** Recepciones (lotes) que ingresaron mercadería de esta factura, agrupadas por guía. */
export async function getRecepcionesCompra(compraId: string): Promise<RecepcionCompra[]> {
  const supabase = await createClient();
  const movimientos = exigir(
    await supabase
      .from("movimientos")
      .select("cantidad, lote_id, compra_item:compra_items!inner ( compra_id ), lote:lotes ( id, numero_guia, fecha_recepcion, ubicacion:ubicaciones ( nombre ) )")
      .eq("compra_item.compra_id", compraId),
    "las recepciones de la factura"
  );
  const porLote = new Map<string, RecepcionCompra>();
  for (const m of movimientos) {
    if (!m.lote) continue;
    const actual = porLote.get(m.lote.id);
    if (actual) {
      actual.unidades += m.cantidad;
    } else {
      porLote.set(m.lote.id, {
        loteId: m.lote.id,
        numeroGuia: m.lote.numero_guia,
        fecha: m.lote.fecha_recepcion,
        ubicacion: m.lote.ubicacion?.nombre ?? "",
        unidades: m.cantidad,
      });
    }
  }
  return [...porLote.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function getProveedoresActivos(): Promise<ProveedorResumen[]> {
  const supabase = await createClient();
  return exigir(
    await supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre"),
    "el directorio de proveedores"
  );
}
