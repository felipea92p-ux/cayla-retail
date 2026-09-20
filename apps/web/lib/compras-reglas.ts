// Compras — lo que NO toca la base (ADR-0035): tipos, etiquetas y
// formateadores. Vive aparte de `compras.ts` por la misma razón que
// `comprobantes-reglas.ts` y `proformas-reglas.ts`: los componentes cliente
// lo importan, y si estuviera junto con las consultas arrastraría
// `next/headers` al navegador — Next lo rechaza en tiempo de compilación.

import { estadoDeMiTienda } from "./reparto-reglas";

export type EstadoPago = "pendiente" | "parcial" | "pagada" | "anulada";
export type EstadoRecepcion = "sin_recibir" | "parcial" | "recibida" | "anulada";
export type Condicion = "contado" | "credito";
export type TipoDocumentoCompra = "factura" | "boleta" | "nota_venta";

export type CompraResumen = {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc: string | null;
  tipo: TipoDocumentoCompra;
  documento: string;
  fechaEmision: string;
  condicion: Condicion;
  fechaVencimiento: string | null;
  /**
   * Tiendas a las que está repartido el comprobante (ADR-0139). Antes era UN destino (`ubicacionDestinoId`): una
   * factura puede traer mercadería para varias tiendas y cada una recibe lo suyo. Un colaborador solo ve la suya.
   */
  ubicacionesDestino: string[];
  subtotal: number;
  igv: number;
  total: number;
  pagado: number;
  saldo: number;
  estado: "vigente" | "anulada";
  estadoPago: EstadoPago;
  facturadoCantidad: number;
  recibidoCantidad: number;
  estadoRecepcion: EstadoRecepcion;
  vencida: boolean;
  /** Cuándo se espera el fardo (opcional al registrar). Sin ella, «atrasada» cuenta desde emisión + 7 días. */
  fechaEstimadaLlegada: string | null;
  /** La mercadería debía haber llegado y no llegó (lo calcula la vista, con fecha de Lima). */
  recepcionAtrasada: boolean;
  /** Suma de notas de crédito del proveedor registradas contra este comprobante (D2, ADR-0111). `saldo` ya la descuenta. */
  notasCredito: number;
  /** Unidades cerradas por faltante: no van a llegar. `estadoRecepcion` y lo pendiente ya las descuentan. */
  cerradoCantidad: number;
  nota: string | null;
  creadoEn: string;
  /** Solo se llena en `getCompra` (detalle); la vista no lo expone. */
  motivoAnulacion?: string | null;
  /**
   * Lo que le toca a la tienda DESDE LA QUE SE MIRA (ADR-0139): solo viene cuando la lista se pide con una tienda
   * (siempre para un colaborador). En ese caso `facturadoCantidad`, `recibidoCantidad` y `cerradoCantidad` ya son los
   * de esa tienda y `estadoRecepcion` se lee desde ella. Sin tienda de por medio, `undefined`.
   */
  asignadoAqui?: number;
  recibidoAqui?: number;
  cerradoAqui?: number;
  pendienteAqui?: number;
  /** Con una tienda de por medio: las unidades del comprobante ENTERO (todas las tiendas). `facturadoCantidad` es lo de ella. */
  facturadoTotal?: number;
};

export type LineaCompra = {
  id: string;
  compraId: string;
  productoId: string;
  referencia: string;
  varianteId: string | null;
  sku: string | null;
  talla: string | null;
  color: string | null;
  descripcion: string | null;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
  recibido: number;
  /** Unidades cerradas por faltante (D2): no van a llegar. `pendiente` ya las descuenta. */
  cerrado: number;
  pendiente: number;
  // ---- Reparto por tienda (ADR-0139). Con una tienda de por medio, `cantidad`, `recibido`, `cerrado` y `pendiente`
  // ya son los de ESA tienda (así los topes y «Todo llegó» funcionan por tienda) y lo demás queda acá. Todos son
  // opcionales: en una base sin reparto (o sin tienda de por medio) no vienen y la pantalla no muestra nada extra.
  /** Lo facturado en la línea entera, todas las tiendas juntas («de 24 en el comprobante»). */
  cantidadFacturada?: number;
  /** Lo que le toca a la tienda desde la que se mira. */
  asignadoAqui?: number;
  recibidoAqui?: number;
  cerradoAqui?: number;
  pendienteAqui?: number;
  /** Solo para un líder: cómo va el resto de las tiendas en esta línea. */
  otrasTiendas?: TiendaEnLinea[];
};

/** Cómo va UNA tienda en una línea (lo que un líder ve de «las otras tiendas»). */
export type TiendaEnLinea = {
  ubicacionId: string;
  nombre: string;
  asignado: number;
  recibido: number;
  cerrado: number;
  pendiente: number;
};

export type PagoCompra = {
  id: string;
  fecha: string;
  monto: number;
  metodo: string;
  referencia: string | null;
};

export type ProveedorResumen = { id: string; nombre: string; ruc: string | null };

export type AdjuntoCompra = {
  id: string;
  nombre: string;
  tipo: string;
  bytes: number;
  creadoEn: string;
  /** URL firmada (1 h) para abrirlo. `null` si Storage no respondió — se muestra sin enlace. */
  url: string | null;
};

// Adjuntos de factura (20260914180000_compras_adjuntos.sql): lo que la
// pantalla repite como cortesía. El candado real es el bucket y la RPC.
export const ADJUNTOS_BUCKET = "retail-compras-adjuntos";
export const ADJUNTOS_TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const ADJUNTOS_MAX_BYTES = 10 * 1024 * 1024;
export const ADJUNTOS_MAX_POR_FACTURA = 10;

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type RecepcionCompra = {
  loteId: string;
  numeroGuia: string | null;
  fecha: string;
  ubicacion: string;
  unidades: number;
};

// Un lote (`retail.lotes`) es la unidad real de "una recepción" — con
// factura (ADR-0035, `/compras/recibir`) o sin ella (`/inventario/recibir`).
// A diferencia de `RecepcionCompra` (acotado a la factura de un detalle ya
// conocido), este tipo es para el listado cruzado — "qué se recibió
// últimamente, venga de donde venga" — que hasta el 2026-09-17 ninguna
// pantalla mostraba.
/** Una línea dentro del detalle de una recepción: qué variante, cuánto llegó. */
export type LineaRecepcion = {
  referencia: string;
  sku: string | null;
  talla: string | null;
  color: string | null;
  cantidad: number;
};

export type RecepcionReciente = {
  loteId: string;
  fecha: string;
  ubicacion: string;
  proveedorNombre: string;
  numeroGuia: string | null;
  nota: string | null;
  recibidoPor: string | null;
  unidades: number;
  lineas: number;
  conFactura: boolean;
  /** Solo si `conFactura`: para enlazar al detalle de la factura. */
  compraId: string | null;
  documento: string | null;
  detalle: LineaRecepcion[];
};

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumentoCompra, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nota_venta: "Nota de venta",
};

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: "Por pagar",
  parcial: "Pago parcial",
  pagada: "Pagada",
  anulada: "Anulada",
};

export const ETIQUETA_ESTADO_RECEPCION: Record<EstadoRecepcion, string> = {
  sin_recibir: "Sin recibir",
  parcial: "Recibida parcial",
  recibida: "Recibida",
  anulada: "Anulada",
};

// Tono del chip por estado (ver components/ui/Chip.tsx). Ámbar = a medias,
// verde = cerrado, neutro = todavía nada, apagado = anulada. "Por pagar" es
// neutro y no rojo a propósito: deber una factura al crédito que aún no
// vence es lo normal, no una alarma — el rojo se reserva para "vencida".
export type TonoEstado = "neutro" | "ambar" | "verde" | "rojo" | "apagado";

export const TONO_ESTADO_PAGO: Record<EstadoPago, TonoEstado> = {
  pendiente: "neutro",
  parcial: "ambar",
  pagada: "verde",
  anulada: "apagado",
};

export const TONO_ESTADO_RECEPCION: Record<EstadoRecepcion, TonoEstado> = {
  sin_recibir: "neutro",
  parcial: "ambar",
  recibida: "verde",
  anulada: "apagado",
};

export const ETIQUETA_METODO: Record<string, string> = {
  transferencia: "Transferencia",
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  deposito: "Depósito",
  otro: "Otro",
};

/** Los medios con los que se puede PAGAR (`compra_pagos.metodo`): los de plata más el saldo a favor del proveedor (ADR-0111). */
export const METODO_SALDO_A_FAVOR = "saldo_a_favor";
export const ETIQUETA_METODO_PAGO: Record<string, string> = { ...ETIQUETA_METODO, [METODO_SALDO_A_FAVOR]: "Saldo a favor" };

/** Por qué no va a llegar lo que faltó (D2, ADR-0111): lo que acepta `cerrar_linea_compra`. */
export type MotivoCierre = "no_llego" | "danada" | "error_proveedor";

export const ETIQUETA_MOTIVO_CIERRE: Record<MotivoCierre, string> = {
  no_llego: "No llegaron",
  danada: "Llegaron dañadas",
  error_proveedor: "Error del proveedor",
};

/** Motivos de una nota de crédito del proveedor (D2, ADR-0111): lo que acepta `registrar_nota_credito_compra`. */
export const ETIQUETA_MOTIVO_NOTA: Record<string, string> = {
  faltante: "Faltante",
  devolucion: "Devolución",
  descuento: "Descuento",
  otro: "Otro",
};

export function soles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// Costo tipeado con o sin IGV (lo pidió Felipe, 2026-09-14).
//
// EL PROBLEMA: muchos proveedores listan el precio unitario ya con IGV, y el
// formulario solo aceptaba el costo sin IGV — Felipe tenía que dividir entre
// 1.18 a mano por cada línea. LA BASE NO CAMBIA: `compra_items.costo_unitario`
// sigue siendo sin IGV y `registrar_compra` sigue armando subtotal + igv =
// total desde ahí (principio 4). El switch es interpretación en pantalla: si
// el costo viene con IGV, acá se descuenta ANTES de mandarlo.
//
// El redondeo a 2 decimales imita `numeric(12, 2)`: lo que la pantalla suma
// es exactamente lo que la base va a guardar. El centavo que se pierde al
// redondear la base (10 / 1.18 = 8.4746 → 8.47) NO se traslada al total:
// con precios con IGV, `totalesCompra` toma el total del papel y el IGV es
// la diferencia — misma regla que `registrar_compra` con `p_total`.
// ---------------------------------------------------------------------------
function a2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Costo sin IGV que se guarda, a partir de lo tipeado y de cómo se tipeó. */
export function costoBase(costoTipeado: number, igvPorcentaje: number, conIgv: boolean): number {
  if (!Number.isFinite(costoTipeado) || costoTipeado < 0) return 0;
  if (!conIgv || !(igvPorcentaje > 0)) return a2(costoTipeado);
  return a2(costoTipeado / (1 + igvPorcentaje / 100));
}

/** Inverso: el último costo conocido (sin IGV) sugerido en el modo en que se está tipeando. */
export function costoParaTipear(costoSinIgv: number, igvPorcentaje: number, conIgv: boolean): number {
  if (!conIgv || !(igvPorcentaje > 0)) return a2(costoSinIgv);
  return a2(costoSinIgv * (1 + igvPorcentaje / 100));
}

/**
 * Totales de la factura tal como los va a guardar `registrar_compra`
 * (20260914190000_compras_total_del_papel.sql). Con precios sin IGV, el
 * IGV se calcula sobre la base; con precios con IGV, el total es la suma de
 * lo tipeado (lo que dice el papel) y el IGV es la diferencia con la base:
 * el redondeo lo absorbe el IGV, nunca el total. 1 × S/ 10.00 con IGV da
 * base 8.47, IGV 1.53, total 10.00 — no 9.99.
 */
export function totalesCompra(
  lineas: readonly { cantidad: number; costoTipeado: number }[],
  igvPorcentaje: number,
  conIgv: boolean,
): { subtotal: number; igv: number; total: number } {
  const subtotal = a2(lineas.reduce((acc, l) => acc + l.cantidad * costoBase(l.costoTipeado, igvPorcentaje, conIgv), 0));
  if (conIgv && igvPorcentaje > 0) {
    const total = a2(lineas.reduce((acc, l) => acc + a2(l.cantidad * (Number.isFinite(l.costoTipeado) && l.costoTipeado > 0 ? l.costoTipeado : 0)), 0));
    return { subtotal, igv: a2(total - subtotal), total };
  }
  const igv = a2((subtotal * igvPorcentaje) / 100);
  return { subtotal, igv, total: a2(subtotal + igv) };
}

// ---------- Lectura operativa: recibir SIN ver dinero (ADR-0126) ----------
// Quien no es líder no lee `listar_compras` ni `compra_items_resumen` (traen montos, y las tablas de dinero
// quedan cerradas para él): lee `listar_compras_operativo` y `lineas_compra_operativo`, que devuelven SOLO lo que
// hace falta para recibir. Estas funciones puras llevan esas filas a las MISMAS formas que ya usa la pantalla
// (`CompraResumen`) para que no haya dos pantallas: los montos van en 0 —igual que `comprobanteSinMontos`— y los
// datos de pago en un valor neutro que ninguna pantalla de recibir muestra.

/** Una fila de `listar_compras_operativo`: lo que un integrante necesita para recibir, sin un solo monto. */
export type FilaOperativa = {
  id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  proveedor_ruc: string | null;
  tipo: string;
  documento: string;
  fecha_emision: string;
  /** Las tiendas del reparto (ADR-0139); para un colaborador, solo la suya. */
  ubicaciones_destino?: string[] | null;
  estado: string;
  nota: string | null;
  created_at: string;
  facturado_cantidad: number;
  recibido_cantidad: number;
  estado_recepcion: string;
  fecha_estimada_llegada: string | null;
  recepcion_atrasada: boolean;
  cerrado_cantidad: number;
  /** Lo que le toca a la tienda desde la que se mira (null si la lista se pidió sin tienda). */
  asignado_aqui?: number | null;
  recibido_aqui?: number | null;
  cerrado_aqui?: number | null;
  pendiente_aqui?: number | null;
};

export function comprobanteDeFilaOperativa(f: FilaOperativa): CompraResumen {
  // Con una tienda de por medio, las cifras del comprobante pasan a ser las de ESA tienda (ADR-0139).
  const aqui =
    f.asignado_aqui == null
      ? null
      : { asignado: Number(f.asignado_aqui), recibido: Number(f.recibido_aqui ?? 0), cerrado: Number(f.cerrado_aqui ?? 0) };
  return {
    id: f.id,
    proveedorId: f.proveedor_id,
    proveedorNombre: f.proveedor_nombre,
    proveedorRuc: f.proveedor_ruc,
    tipo: f.tipo as TipoDocumentoCompra,
    documento: f.documento,
    fechaEmision: f.fecha_emision,
    ubicacionesDestino: f.ubicaciones_destino ?? [],
    estado: f.estado as "vigente" | "anulada",
    nota: f.nota,
    creadoEn: f.created_at,
    facturadoCantidad: aqui ? aqui.asignado : f.facturado_cantidad,
    recibidoCantidad: aqui ? aqui.recibido : f.recibido_cantidad,
    estadoRecepcion: aqui ? estadoDeMiTienda(aqui) : (f.estado_recepcion as EstadoRecepcion),
    fechaEstimadaLlegada: f.fecha_estimada_llegada,
    recepcionAtrasada: f.recepcion_atrasada,
    cerradoCantidad: aqui ? aqui.cerrado : f.cerrado_cantidad,
    ...(aqui
      ? {
          facturadoTotal: f.facturado_cantidad,
          asignadoAqui: aqui.asignado,
          recibidoAqui: aqui.recibido,
          cerradoAqui: aqui.cerrado,
          pendienteAqui: Number(f.pendiente_aqui ?? Math.max(0, aqui.asignado - aqui.recibido - aqui.cerrado)),
        }
      : {}),
    // Sin dato: la función no los devuelve. Ninguna pantalla de recibir los muestra.
    condicion: "contado",
    fechaVencimiento: null,
    estadoPago: "pendiente",
    vencida: false,
    subtotal: 0,
    igv: 0,
    total: 0,
    pagado: 0,
    saldo: 0,
    notasCredito: 0,
  };
}

/**
 * ¿El error dice que la FUNCIÓN no existe en esa base? PostgREST responde `PGRST202` («no la encuentro en el
 * schema cache») y Postgres `42883` (undefined_function). Sirve para que, si la app se despliega ANTES de pegar
 * la migración que crea `listar_compras_operativo`/`lineas_compra_operativo`, Recibir siga con el camino de
 * antes en vez de caerse (principio 9: todo puede fallar, el sistema se degrada con gracia).
 */
export function esFuncionAusente(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/** Lo mismo para una TABLA o VISTA que la base todavía no tiene (PostgREST `PGRST205`, Postgres `42P01`). */
export function esRelacionAusente(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}
