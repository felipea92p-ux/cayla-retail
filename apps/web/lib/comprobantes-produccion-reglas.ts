// Comprobantes de Producción (ADR-0133, F4b; D-H). Puro: sin Supabase ni React, para poder probarlo.
//
// Refleja las reglas de `registrar_comprobante_produccion` (20260921100000) para dar la vista previa ANTES de guardar: el subtotal es
// la suma de lo redondeado por línea, el IGV es 18 % solo en facturas y el total es subtotal + IGV. La base sigue siendo el candado;
// esto solo evita que alguien descubra el descuadre al apretar «Guardar».

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

export const IGV_PORCENTAJE = 18;

export function etiquetaTipo(tipo: string, corta = false): string {
  const t = TIPOS_COMPROBANTE.find((x) => x.valor === tipo);
  return t ? (corta ? t.corta : t.etiqueta) : tipo;
}

export function etiquetaMetodo(metodo: string): string {
  return METODOS_PAGO.find((m) => m.valor === metodo)?.etiqueta ?? metodo;
}

/** Redondeo a centavos como el de la base (`numeric`: mitad hacia arriba en positivos), sin errores de punto flotante. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type LineaForm = { insumoId: string | null; descripcion: string; cantidad: string; costo: string };

const numero = (s: string) => Number(s.replace(",", "."));

export type Totales = { subtotal: number; igv: number; total: number; lineasCompletas: number };

/** Lo que la base va a calcular. Una línea incompleta (sin cantidad o sin costo) no suma: se avisa aparte. */
export function calcularTotales(lineas: LineaForm[], tipo: TipoComprobante): Totales {
  let subtotal = 0;
  let lineasCompletas = 0;
  for (const l of lineas) {
    const q = numero(l.cantidad);
    const c = numero(l.costo);
    if (l.cantidad.trim() === "" || l.costo.trim() === "" || !(q > 0) || !(c >= 0)) continue;
    subtotal += redondear2(q * c);
    lineasCompletas++;
  }
  subtotal = redondear2(subtotal);
  const igv = tipo === "factura" ? redondear2((subtotal * IGV_PORCENTAJE) / 100) : 0;
  return { subtotal, igv, total: redondear2(subtotal + igv), lineasCompletas };
}

export type FormComprobante = {
  proveedorId: string;
  tipo: TipoComprobante;
  serie: string;
  numero: string;
  fechaEmision: string;
  condicion: CondicionComprobante;
  fechaVencimiento: string;
  lineas: LineaForm[];
  /** Total impreso en el papel; vacío = se toma el calculado. */
  totalPapel: string;
  metodoPago: MetodoPago;
  referenciaPago: string;
};

/** El primer problema que impide guardar, dicho como lo diría la base; `null` si está listo. */
export function primerErrorComprobante(f: FormComprobante, hoy: string): string | null {
  if (!f.proveedorId) return "Elige el proveedor.";
  if (!f.serie.trim() || !f.numero.trim()) return "Escribe la serie y el número del comprobante.";
  if (!f.fechaEmision) return "Indica la fecha de emisión.";
  if (f.fechaEmision > hoy) return "La fecha de emisión no puede ser futura.";
  if (f.condicion === "credito") {
    if (!f.fechaVencimiento) return "Un comprobante al crédito necesita fecha de vencimiento.";
    if (f.fechaVencimiento < f.fechaEmision) return "El vencimiento no puede ser anterior a la emisión.";
  }
  const llenas = f.lineas.filter((l) => l.insumoId || l.descripcion.trim() || l.cantidad.trim() || l.costo.trim());
  if (llenas.length === 0) return "Agrega al menos una línea.";
  for (const [i, l] of llenas.entries()) {
    if (!l.insumoId && !l.descripcion.trim()) return `Línea ${i + 1}: elige un insumo o escribe qué se compró.`;
    if (!(numero(l.cantidad) > 0)) return `Línea ${i + 1}: la cantidad tiene que ser mayor a cero.`;
    if (l.costo.trim() === "" || !(numero(l.costo) >= 0)) return `Línea ${i + 1}: falta el costo unitario (sin IGV).`;
  }
  if (f.totalPapel.trim() !== "") {
    const papel = numero(f.totalPapel);
    if (!(papel >= 0)) return "El total del papel no es un número válido.";
    const { total } = calcularTotales(llenas, f.tipo);
    const tolerancia = 0.01 * (llenas.length + 1);
    if (Math.abs(papel - total) > tolerancia + 1e-9) return `El total del papel (S/ ${papel.toFixed(2)}) no cuadra con las líneas (S/ ${total.toFixed(2)}): revisa cantidades y costos.`;
  }
  return null;
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
