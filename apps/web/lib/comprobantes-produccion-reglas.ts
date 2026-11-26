// Comprobantes de Producción (ADR-0133, F4b; D-H). Puro: sin Supabase ni React, para poder probarlo.
//
// La lista de Facturas de insumos y sus etiquetas. La vista previa del formulario «Nueva factura» (calcularTotales) se fue con él el
// 2026-11-25: las facturas del Taller nacen en Insumos ▸ «Llegó una compra» y en Por pagar ▸ «Pagar servicio».

export type TipoComprobante = "factura" | "boleta" | "nota_venta";
export type CondicionComprobante = "contado" | "credito";
export type MetodoPago = "transferencia" | "yape" | "plin" | "efectivo" | "deposito" | "otro";

export const TIPOS_COMPROBANTE: { valor: TipoComprobante; etiqueta: string; corta: string }[] = [
  { valor: "factura", etiqueta: "Factura", corta: "Fact." },
  { valor: "boleta", etiqueta: "Boleta", corta: "Bol." },
  { valor: "nota_venta", etiqueta: "Nota de venta", corta: "N. venta" },
];

export const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "yape", etiqueta: "Yape" },
  { valor: "plin", etiqueta: "Plin" },
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "deposito", etiqueta: "Depósito" },
  { valor: "otro", etiqueta: "Otro" },
];

export function etiquetaTipo(tipo: string, corta = false): string {
  const t = TIPOS_COMPROBANTE.find((x) => x.valor === tipo);
  if (t) return corta ? t.corta : t.etiqueta;
  // El papel de una orden de insumos puede ser «sin comprobante» (ADR-0362, fase 7 parte 2): la lista del líder lo nombra, aunque su
  // formulario no lo ofrezca (`registrar_comprobante_produccion` sigue con los tres tipos de siempre).
  if (tipo === "sin_comprobante") return corta ? "Sin comp." : "Sin comprobante";
  return tipo;
}

export function etiquetaMetodo(metodo: string): string {
  return METODOS_PAGO.find((m) => m.valor === metodo)?.etiqueta ?? metodo;
}

/** Redondeo a centavos como el de la base (`numeric`: mitad hacia arriba en positivos), sin errores de punto flotante. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// La lista
// ---------------------------------------------------------------------------

export type ComprobanteProduccion = {
  id: string;
  proveedorId: string;
  proveedor: string;
  tipo: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  condicion: CondicionComprobante;
  fechaVencimiento: string | null;
  subtotal: number;
  igv: number;
  total: number;
  estado: "vigente" | "anulada";
  motivoAnulacion: string | null;
  nota: string | null;
  lineas: number;
  pagado: number;
  saldo: number;
  estadoPago: "pendiente" | "parcial" | "pagada" | "anulada";
  vencido: boolean;
};

export type FiltroEstado = "todos" | "por_pagar" | "vencidos" | "pagados" | "anulados";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarComprobantes(lista: ComprobanteProduccion[], f: { estado: FiltroEstado; proveedorId: string | null; busqueda: string }): ComprobanteProduccion[] {
  const q = sinTildes(f.busqueda.trim());
  return lista
    .filter((c) => (f.proveedorId ? c.proveedorId === f.proveedorId : true))
    .filter((c) => {
      switch (f.estado) {
        case "por_pagar":
          return c.estado === "vigente" && c.saldo > 0;
        case "vencidos":
          return c.vencido;
        case "pagados":
          return c.estado === "vigente" && c.estadoPago === "pagada";
        case "anulados":
          return c.estado === "anulada";
        default:
          return true;
      }
    })
    .filter((c) => q === "" || sinTildes(c.proveedor).includes(q) || sinTildes(`${c.serie}-${c.numero}`).includes(q));
}

export type ResumenComprobantes = { porPagar: number; conSaldo: number; vencido: number; nVencidos: number; delMes: number; nDelMes: number };

/** Lo que importa arriba de la lista: cuánto se debe, cuánto de eso ya venció y cuánto se compró este mes. Las anuladas no cuentan. */
export function resumenComprobantes(lista: ComprobanteProduccion[], hoy: string): ResumenComprobantes {
  const mes = hoy.slice(0, 7);
  const r: ResumenComprobantes = { porPagar: 0, conSaldo: 0, vencido: 0, nVencidos: 0, delMes: 0, nDelMes: 0 };
  for (const c of lista) {
    if (c.estado !== "vigente") continue;
    if (c.saldo > 0) {
      r.porPagar += c.saldo;
      r.conSaldo++;
    }
    if (c.vencido) {
      r.vencido += c.saldo;
      r.nVencidos++;
    }
    if (c.fechaEmision.startsWith(mes)) {
      r.delMes += c.total;
      r.nDelMes++;
    }
  }
  r.porPagar = redondear2(r.porPagar);
  r.vencido = redondear2(r.vencido);
  r.delMes = redondear2(r.delMes);
  return r;
}

/** Días de `hoy` a `fecha` (negativo = ya pasó). Ambas `YYYY-MM-DD`. */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((new Date(`${fecha}T00:00:00Z`).getTime() - new Date(`${hoy}T00:00:00Z`).getTime()) / 86_400_000);
}

export type EstadoVisible = { tono: "verde" | "ambar" | "neutro" | "apagado"; texto: string };

/** El estado que se lee de un vistazo. Lo vencido va en ámbar con sus días: el rojo de la pantalla (máximo 2) lo lleva la cifra de «Vencido», no cada fila. */
export function estadoVisible(c: Pick<ComprobanteProduccion, "estado" | "estadoPago" | "vencido" | "condicion" | "fechaVencimiento">, hoy: string): EstadoVisible {
  if (c.estado === "anulada") return { tono: "apagado", texto: "Anulada" };
  if (c.estadoPago === "pagada") return { tono: "verde", texto: "Pagada" };
  if (c.vencido && c.fechaVencimiento) return { tono: "ambar", texto: `Vencida hace ${Math.abs(diasHasta(c.fechaVencimiento, hoy))} d` };
  if (c.condicion === "credito" && c.fechaVencimiento) {
    const d = diasHasta(c.fechaVencimiento, hoy);
    const base = c.estadoPago === "parcial" ? "Parcial" : "Por pagar";
    return { tono: d <= 7 ? "ambar" : "neutro", texto: d === 0 ? `${base} · vence hoy` : `${base} · vence en ${d} d` };
  }
  return { tono: "neutro", texto: c.estadoPago === "parcial" ? "Parcial" : "Por pagar" };
}
