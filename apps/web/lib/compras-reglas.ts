// Compras — lo que NO toca la base (ADR-0035): tipos, etiquetas y
// formateadores. Vive aparte de `compras.ts` por la misma razón que
// `comprobantes-reglas.ts` y `proformas-reglas.ts`: los componentes cliente
// lo importan, y si estuviera junto con las consultas arrastraría
// `next/headers` al navegador — Next lo rechaza en tiempo de compilación.

export type EstadoPago = "pendiente" | "parcial" | "pagada" | "anulada";
export type EstadoRecepcion = "sin_recibir" | "parcial" | "recibida" | "anulada";
export type Condicion = "contado" | "credito";

export type CompraResumen = {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc: string | null;
  tipo: string;
  documento: string;
  fechaEmision: string;
  condicion: Condicion;
  fechaVencimiento: string | null;
  ubicacionDestinoId: string;
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
  nota: string | null;
  creadoEn: string;
  /** Solo se llena en `getCompra` (detalle); la vista no lo expone. */
  motivoAnulacion?: string | null;
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
// es exactamente lo que la base va a guardar, así el total del resumen nunca
// difiere del que la RPC calcula. Un precio con IGV de S/ 45.90 da una base
// de 38.898… → 38.90, y 10 unidades suman S/ 459.02 contra los S/ 459.00 del
// papel: esos centavos son inevitables con 2 decimales, y la pantalla lo
// advierte para que se tipee sin IGV cuando el papel lo trae.
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
