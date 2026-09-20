import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import {
  ADJUNTOS_BUCKET,
  comprobanteDeFilaOperativa,
  esFuncionAusente,
  type AdjuntoCompra,
  type CompraResumen,
  type Condicion,
  type EstadoPago,
  type EstadoRecepcion,
  type FilaOperativa,
  type LineaCompra,
  type PagoCompra,
  type RecepcionCompra,
  type RecepcionReciente,
  type LineaRecepcion,
  type ProveedorResumen,
  type TipoDocumentoCompra,
} from "@/lib/compras-reglas";
import { lineaEnMiTienda, otrasTiendasDeJson } from "@/lib/reparto-reglas";

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
  ubicaciones_destino?: string[] | null;
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
  // Opcionales solo hasta que se regeneren los tipos de `packages/database` (la vista ya
  // trae estas columnas; `select("*")` las devuelve).
  fecha_estimada_llegada?: string | null;
  recepcion_atrasada?: boolean | null;
  notas_credito?: number | null;
  cerrado_cantidad?: number | null;
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
    tipo: (f.tipo as TipoDocumentoCompra) ?? "factura",
    documento: f.documento ?? "",
    fechaEmision: f.fecha_emision ?? "",
    condicion: (f.condicion as Condicion) ?? "contado",
    fechaVencimiento: f.fecha_vencimiento,
    ubicacionesDestino: f.ubicaciones_destino ?? [],
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
    fechaEstimadaLlegada: f.fecha_estimada_llegada ?? null,
    recepcionAtrasada: f.recepcion_atrasada ?? false,
    notasCredito: Number(f.notas_credito ?? 0),
    cerradoCantidad: Number(f.cerrado_cantidad ?? 0),
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
  tipo?: TipoDocumentoCompra;
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
export type ParamsCompras = { q?: string; prov?: string; pago?: string; recep?: string; cond?: string; tipo?: string; desde?: string; hasta?: string; vencidas?: string; cursor?: string; pagar?: string; saldo?: string; porrecibir?: string; orden?: string };

const ESTADOS_PAGO: EstadoPago[] = ["pendiente", "parcial", "pagada", "anulada"];
const ESTADOS_RECEPCION: EstadoRecepcion[] = ["sin_recibir", "parcial", "recibida", "anulada"];
const TIPOS_DOCUMENTO: TipoDocumentoCompra[] = ["factura", "boleta", "nota_venta"];
const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Traduce la URL a filtros, descartando cualquier valor que no sea válido. */
export function filtrosDesdeParams(p: ParamsCompras): FiltrosCompras {
  return {
    busqueda: p.q?.trim() || undefined,
    proveedorId: p.prov && /^[0-9a-f-]{36}$/i.test(p.prov) ? p.prov : undefined,
    estadoPago: ESTADOS_PAGO.find((e) => e === p.pago),
    estadoRecepcion: ESTADOS_RECEPCION.find((e) => e === p.recep),
    condicion: p.cond === "contado" || p.cond === "credito" ? p.cond : undefined,
    tipo: TIPOS_DOCUMENTO.find((t) => t === p.tipo),
    soloVencidas: p.vencidas === "1" || undefined,
    // Vistas de Comprobantes (ADR-0111): «Por pagar» = con saldo, «Por recibir» = mercadería pendiente.
    conSaldo: p.saldo === "1" || undefined,
    porRecibir: p.porrecibir === "1" || undefined,
    desde: esFecha(p.desde) ? p.desde : undefined,
    hasta: esFecha(p.hasta) ? p.hasta : undefined,
  };
}

export async function listarCompras(
  filtros: FiltrosCompras = {},
  opciones: { orden?: OrdenCompras; cursor?: Cursor | null; limite?: number; sinMontos?: boolean; ubicacionId?: string } = {}
): Promise<PaginaCompras> {
  const supabase = await createClient();
  const orden = opciones.orden ?? "emision";
  const limite = opciones.limite ?? TAMANO_PAGINA;

  // ADR-0126: quien no es líder no lee `listar_compras` (trae montos, y las tablas de dinero quedan cerradas para
  // él): lee `listar_compras_operativo`, que devuelve solo lo que hace falta para recibir. Solo tiene el orden por
  // emisión y NINGÚN filtro de pago (filtrar por una columna de dinero es una forma de enterarse del dinero).
  //
  // ADR-0139: con una tienda de por medio (`ubicacionId`) la lista también sale de esa función: solo trae los
  // comprobantes con reparto para ESA tienda y las cifras de ella («lo que me toca»). Un líder no pierde el dinero:
  // los montos se le suman después, desde `compras_resumen`.
  let operativas: FilaOperativa[] | null = null;
  if (opciones.sinMontos || opciones.ubicacionId) {
    const pedir = (conTienda: boolean) =>
      supabase.rpc("listar_compras_operativo", {
        p_limite: limite,
        ...(conTienda && opciones.ubicacionId ? { p_ubicacion_id: opciones.ubicacionId } : {}),
        ...(opciones.cursor
          ? { p_cursor_fecha: opciones.cursor.fecha, p_cursor_creado_en: opciones.cursor.creadoEn, p_cursor_id: opciones.cursor.id }
          : {}),
        ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
        ...(filtros.proveedorId ? { p_proveedor_id: filtros.proveedorId } : {}),
        ...(filtros.estadoRecepcion ? { p_estado_recepcion: filtros.estadoRecepcion } : {}),
        ...(filtros.tipo ? { p_tipo: filtros.tipo } : {}),
        ...(filtros.porRecibir ? { p_por_recibir: true } : {}),
        ...(filtros.desde ? { p_desde: filtros.desde } : {}),
        ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
      });
    let res = await pedir(true);
    // Base SIN el reparto todavía (el despliegue llegó antes que la migración 20260919172000): la firma de antes no tiene
    // `p_ubicacion_id`. Se vuelve a pedir SIN la tienda —así Recibir sigue como hoy— antes de rendirse a `listar_compras`,
    // que un colaborador no puede leer (candado de dinero, ADR-0126): sin este reintento su lista quedaría vacía.
    if (opciones.ubicacionId && esFuncionAusente(res.error)) res = await pedir(false);
    // Si la función todavía no existe en esa base (el despliegue llegó antes que la migración), se sigue por el
    // camino de antes —la página ya tacha los montos— en vez de tumbar Recibir. Cualquier OTRO error sí se ve.
    if (!esFuncionAusente(res.error)) operativas = exigir(res, "las facturas de compra");
  }
  let todas: CompraResumen[] = operativas
    ? operativas.map(comprobanteDeFilaOperativa)
    : exigir(
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
          ...(filtros.tipo ? { p_tipo: filtros.tipo } : {}),
          ...(filtros.soloVigentes ? { p_solo_vigentes: true } : {}),
          ...(filtros.conSaldo ? { p_con_saldo: true } : {}),
          ...(filtros.soloVencidas ? { p_solo_vencidas: true } : {}),
          ...(filtros.porRecibir ? { p_por_recibir: true } : {}),
          ...(filtros.desde ? { p_desde: filtros.desde } : {}),
          ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
        }),
        "las facturas de compra"
      ).map(aResumen);
  if (operativas && !opciones.sinMontos) todas = await conMontos(todas);
  // La función devuelve limite+1 filas a propósito: la de más solo dice "hay otra página".
  const hayMas = todas.length > limite;
  const pagina = hayMas ? todas.slice(0, limite) : todas;
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

/**
 * Facturas vigentes con mercadería pendiente de recibir (índice parcial `compras_por_recibir_idx`). Con
 * `ubicacionId` (ADR-0139) solo las que aún le faltan a ESA tienda, con las cifras de ella.
 */
export function listarPorRecibir(
  filtros: FiltrosCompras = {},
  cursor: Cursor | null = null,
  opciones: { sinMontos?: boolean; ubicacionId?: string } = {}
): Promise<PaginaCompras> {
  return listarCompras({ ...filtros, porRecibir: true }, { cursor, sinMontos: opciones.sinMontos, ubicacionId: opciones.ubicacionId });
}

/**
 * Un líder que mira una lista por tienda no pierde el dinero: la lista operativa no trae montos, así que se le suman
 * los del comprobante entero (la deuda es de la empresa, no de una tienda: R-04/R-12) desde la vista de líder.
 */
async function conMontos(filas: CompraResumen[]): Promise<CompraResumen[]> {
  if (filas.length === 0) return filas;
  const supabase = await createClient();
  const montos = exigir(
    await supabase
      .from("compras_resumen")
      .select("id, condicion, fecha_vencimiento, estado_pago, vencida, subtotal, igv, total, pagado, saldo, notas_credito")
      .in("id", filas.map((f) => f.id)),
    "los montos de las facturas"
  );
  const porId = new Map(montos.map((m) => [m.id ?? "", m]));
  return filas.map((f) => {
    const m = porId.get(f.id);
    if (!m) return f;
    return {
      ...f,
      condicion: (m.condicion as Condicion) ?? f.condicion,
      fechaVencimiento: m.fecha_vencimiento,
      estadoPago: (m.estado_pago as EstadoPago) ?? f.estadoPago,
      vencida: m.vencida ?? false,
      subtotal: Number(m.subtotal ?? 0),
      igv: Number(m.igv ?? 0),
      total: Number(m.total ?? 0),
      pagado: Number(m.pagado ?? 0),
      saldo: Number(m.saldo ?? 0),
      notasCredito: Number(m.notas_credito ?? 0),
    };
  });
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
  /** Por recibir cuya fecha esperada ya pasó (migración compras_atraso_recepcion). */
  porRecibirAtrasadas: number;
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
    // Los tipos generados todavía no traen esta columna (la función ya la devuelve): se lee
    // por nombre. `?? 0` como las demás: si falta, la tarjeta dice 0, no tumba la página.
    porRecibirAtrasadas: Number((r as Record<string, unknown>).por_recibir_atrasadas ?? 0),
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

type FilaLinea = {
  id: string | null;
  compra_id: string | null;
  producto_id: string | null;
  variante_id: string | null;
  descripcion: string | null;
  cantidad: number | null;
  costo_unitario: number | null;
  subtotal: number | null;
  recibido: number | null;
  cerrado: number | null;
  pendiente: number | null;
  // Reparto por tienda (ADR-0139): solo vienen de `lineas_compra_operativo` cuando se pide con una tienda.
  asignado_aqui?: number | null;
  recibido_aqui?: number | null;
  cerrado_aqui?: number | null;
  otras_tiendas?: unknown;
};

/**
 * Líneas de una o varias facturas, con lo ya recibido por línea. `sinMontos` (quien no es líder, ADR-0126): las lee
 * de `lineas_compra_operativo`, que no trae costo ni subtotal; el resto del armado es el mismo, así que en la
 * pantalla esos dos campos quedan en 0. Si la función todavía no existe en esa base, sigue por la vista de antes.
 *
 * ADR-0139 — con una tienda de por medio (`ubicacionId`; un colaborador siempre mira la suya) las cifras de cada línea
 * (`cantidad`, `recibido`, `cerrado`, `pendiente`) pasan a ser las de ESA tienda: así los topes, «Todo llegó» y los
 * totales de la pantalla de recibir funcionan por tienda sin cambiar una línea. Un líder no pierde el costo.
 */
export async function getLineasCompra(compraIds: string[], opciones: { sinMontos?: boolean; ubicacionId?: string } = {}): Promise<LineaCompra[]> {
  if (compraIds.length === 0) return [];
  const supabase = await createClient();
  let filas: FilaLinea[] | null = null;
  if (opciones.sinMontos || opciones.ubicacionId) {
    const pedir = (conTienda: boolean) =>
      supabase.rpc("lineas_compra_operativo", {
        p_compra_ids: compraIds,
        ...(conTienda && opciones.ubicacionId ? { p_ubicacion_id: opciones.ubicacionId } : {}),
      });
    let res = await pedir(true);
    // Igual que en `listarCompras`: una base sin el reparto todavía no tiene `p_ubicacion_id`; se pide la firma de antes
    // (líneas de todo el comprobante, como hoy) antes de caer a la vista de líneas, que un colaborador no puede leer.
    if (opciones.ubicacionId && esFuncionAusente(res.error)) res = await pedir(false);
    if (!esFuncionAusente(res.error)) {
      filas = exigir(res, "las líneas de la factura").map((l) => ({ ...l, costo_unitario: null, subtotal: null }));
      // Un líder con una tienda de por medio recibe TODAS las líneas del comprobante: las que no traen nada para
      // esa tienda no son de quien cuenta acá (se ven en el detalle del comprobante, con «Reasignar»).
      if (opciones.ubicacionId) filas = filas.filter((l) => l.asignado_aqui == null || l.asignado_aqui > 0);
      // Y no pierde el costo: sale de la vista de líneas.
      if (!opciones.sinMontos) filas = await conCostos(filas, compraIds);
    }
  }
  if (!filas) {
    filas = exigir(
      await supabase
        .from("compra_items_resumen")
        .select("id, compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario, subtotal, recibido, cerrado, pendiente")
        .in("compra_id", compraIds),
      "las líneas de la factura"
    );
  }

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
    const base: LineaCompra = {
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
      cerrado: Number(f.cerrado ?? 0),
      pendiente: Number(f.pendiente ?? 0),
    };
    // Con números de tienda (ADR-0139) las cifras de la línea pasan a ser las de ESA tienda.
    return f.asignado_aqui == null
      ? base
      : lineaEnMiTienda(base, {
          asignado: Number(f.asignado_aqui),
          recibido: Number(f.recibido_aqui ?? 0),
          cerrado: Number(f.cerrado_aqui ?? 0),
          otrasTiendas: otrasTiendasDeJson(f.otras_tiendas),
        });
  });
}

/** El costo y el subtotal de cada línea para un líder que mira por tienda (la lista operativa no los trae). */
async function conCostos(filas: FilaLinea[], compraIds: string[]): Promise<FilaLinea[]> {
  if (filas.length === 0) return filas;
  const supabase = await createClient();
  const costos = exigir(
    await supabase.from("compra_items_resumen").select("id, costo_unitario, subtotal").in("compra_id", compraIds),
    "los costos de las líneas de la factura"
  );
  const porId = new Map(costos.map((c) => [c.id ?? "", c]));
  return filas.map((f) => {
    const c = porId.get(f.id ?? "");
    return c ? { ...f, costo_unitario: c.costo_unitario, subtotal: c.subtotal } : f;
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

/**
 * Los pagos de VARIOS comprobantes en una sola consulta (la vista rápida de Por pagar los muestra al abrir un comprobante, sin pedir uno
 * por clic). Del más reciente al más antiguo. Si la consulta falla la lista se dibuja igual y el cajón simplemente no muestra el historial:
 * se registra en el log del servidor en vez de tumbar la pantalla. Sin ids no pregunta nada.
 */
export async function getPagosDeCompras(compraIds: string[]): Promise<Record<string, PagoCompra[]>> {
  const ids = [...new Set(compraIds)];
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compra_pagos")
    .select("id, compra_id, fecha, monto, metodo, referencia")
    .in("compra_id", ids)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.error("Pagos de los comprobantes de Por pagar:", error?.message ?? "la consulta no devolvió datos");
    return {};
  }
  const porCompra: Record<string, PagoCompra[]> = {};
  for (const p of data) (porCompra[p.compra_id] ??= []).push({ id: p.id, fecha: p.fecha, monto: Number(p.monto), metodo: p.metodo, referencia: p.referencia });
  return porCompra;
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

/**
 * Últimos lotes recibidos, con o sin factura (`retail.lotes`, ver
 * `RecepcionReciente`). A diferencia de `getRecepcionesCompra` (una
 * factura ya elegida), esto es el feed cruzado que ni `/compras/recibir`
 * ni `/inventario/recibir` mostraban antes del 2026-09-17 — ninguna de las
 * dos pantallas dejaba ver qué se había recibido, solo qué faltaba o un
 * formulario en blanco.
 *
 * Se trae una ventana más grande que `limite` porque el filtro por
 * `conFactura` ocurre en memoria — con el volumen real de CAYLA
 * (3 tiendas + 1 taller) esto nunca compite con un índice; no vale una
 * vista SQL nueva para algo que dos consultas resuelven igual de bien
 * (principio 3, mismo criterio que `getLineasCompra`). `conFactura` es
 * "¿al menos uno de los movimientos del lote tiene compra_item_id?", no
 * "¿son todos así?" — desde ADR-0076 un lote de `recibir_compras` puede
 * traer ítems fuera de factura mezclados con ítems facturados.
 */
export async function getRecepcionesRecientes(opciones: { conFactura?: boolean; limite?: number } = {}): Promise<RecepcionReciente[]> {
  const limite = opciones.limite ?? 15;
  const supabase = await createClient();
  const lotes = exigir(
    await supabase
      .from("lotes")
      .select("id, fecha_recepcion, numero_guia, nota, recibido_por, ubicacion:ubicaciones ( nombre ), proveedor:proveedores ( nombre )")
      .order("fecha_recepcion", { ascending: false })
      .limit(Math.max(limite * 2, 30)),
    "las recepciones recientes"
  );
  if (lotes.length === 0) return [];
  const loteIds = lotes.map((l) => l.id);

  // `recibido_por` referencia public.personas (Dynamic) — PostgREST no
  // embebe entre schemas, así que se resuelve en lote con
  // `fn_nombres_personas` (0009_integracion_dynamic.sql), mismo patrón que
  // ya usan `caja.ts`/`conteos.ts`/`traslados.ts`/`devoluciones.ts`.
  const personaIds = [...new Set(lotes.map((l) => l.recibido_por).filter((id): id is string => !!id))];
  const [movimientosRes, nombresRes] = await Promise.all([
    supabase
      .from("movimientos")
      .select(
        "lote_id, cantidad, compra_item_id, compra_item:compra_items ( compra_id, compra:compras ( documento ) ), variante:variantes ( sku, talla:tallas ( valor ), producto:productos ( referencia ), color:colores ( nombre ) )"
      )
      .in("lote_id", loteIds),
    personaIds.length > 0 ? supabase.rpc("fn_nombres_personas", { p_ids: personaIds }) : Promise.resolve({ data: [], error: null }),
  ]);
  const movimientos = exigir(movimientosRes, "las líneas de las recepciones recientes");
  const personas = new Map(exigir(nombresRes, "quién recibió cada lote").map((p) => [p.id, p.nombre]));
  type Agg = {
    unidades: number;
    lineas: number;
    conFactura: boolean;
    compraId: string | null;
    documento: string | null;
    detalle: LineaRecepcion[];
  };
  const porLote = new Map<string, Agg>();
  for (const m of movimientos) {
    if (!m.lote_id) continue;
    const actual = porLote.get(m.lote_id) ?? { unidades: 0, lineas: 0, conFactura: false, compraId: null, documento: null, detalle: [] };
    actual.unidades += m.cantidad;
    actual.lineas += 1;
    if (m.compra_item_id) {
      actual.conFactura = true;
      actual.compraId = m.compra_item?.compra_id ?? actual.compraId;
      actual.documento = m.compra_item?.compra?.documento ?? actual.documento;
    }
    actual.detalle.push({
      referencia: m.variante?.producto?.referencia ?? "",
      sku: m.variante?.sku ?? null,
      talla: m.variante?.talla?.valor ?? null,
      color: m.variante?.color?.nombre ?? null,
      cantidad: m.cantidad,
    });
    porLote.set(m.lote_id, actual);
  }

  return lotes
    .map((l) => {
      const agg = porLote.get(l.id) ?? { unidades: 0, lineas: 0, conFactura: false, compraId: null, documento: null, detalle: [] };
      return {
        loteId: l.id,
        fecha: l.fecha_recepcion,
        ubicacion: l.ubicacion?.nombre ?? "",
        proveedorNombre: l.proveedor?.nombre ?? "",
        numeroGuia: l.numero_guia,
        nota: l.nota,
        recibidoPor: l.recibido_por ? personas.get(l.recibido_por) ?? null : null,
        ...agg,
      };
    })
    .filter((r) => opciones.conFactura === undefined || r.conFactura === opciones.conFactura)
    .slice(0, limite);
}

export async function getProveedoresActivos(): Promise<ProveedorResumen[]> {
  const supabase = await createClient();
  return exigir(
    await supabase.from("proveedores").select("id, nombre, ruc").eq("activo", true).order("nombre"),
    "el directorio de proveedores"
  );
}
