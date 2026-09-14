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
