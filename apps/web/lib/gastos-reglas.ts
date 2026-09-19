// Reglas de los gastos (ADR-0117), sin acceso a datos: se pueden probar sin base.
//
// Qué NO son estas reglas: la autoridad. La autoridad es la base (checks, índice único, triggers
// de `20260918193000_gastos.sql`). Esto solo le avisa a quien llena el formulario ANTES de
// enviarlo — el error que se atrapa en la pantalla no cuesta un viaje al servidor ni un mensaje
// de Postgres. Si estas reglas y la base discrepan, gana la base y el mensaje que ella devuelva.

export type MedioPago = "efectivo" | "tarjeta" | "yape" | "plin" | "transferencia";
export type TipoComprobante = "factura" | "boleta" | "recibo_por_honorarios" | "sin_comprobante";

export const MEDIOS_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "yape", etiqueta: "Yape" },
  { valor: "plin", etiqueta: "Plin" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
];

export const TIPOS_COMPROBANTE: { valor: TipoComprobante; etiqueta: string }[] = [
  { valor: "factura", etiqueta: "Factura" },
  { valor: "boleta", etiqueta: "Boleta" },
  { valor: "recibo_por_honorarios", etiqueta: "Recibo por honorarios" },
  { valor: "sin_comprobante", etiqueta: "Sin comprobante" },
];

export function etiquetaMedioPago(valor: string): string {
  return MEDIOS_PAGO.find((m) => m.valor === valor)?.etiqueta ?? valor;
}
export function etiquetaComprobante(valor: string): string {
  return TIPOS_COMPROBANTE.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

/** El IGV (crédito fiscal) solo existe con factura; con cualquier otro comprobante se guarda 0. */
export const permiteIgv = (tipo: TipoComprobante): boolean => tipo === "factura";
/** Una factura sin número no se puede ubicar después: el número es obligatorio. */
export const exigeNumero = (tipo: TipoComprobante): boolean => tipo === "factura";

/** Convierte lo que se tipeó ("1,250.50", "  ", "abc") a número, o `null` si no es un monto. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/\s/g, "").replace(/,/g, "");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export type BorradorGasto = {
  categoria: string;
  descripcion: string;
  fecha: string; // aaaa-mm-dd
  monto: string; // como lo tipeó quien llena el formulario
  igv: string;
  comprobanteTipo: TipoComprobante;
  comprobanteNumero: string;
  medioPago: MedioPago;
  /** Solo con efectivo desde caja (camino B): la caja abierta que paga. */
  cajaId: string | null;
  /** Solo al clasificar un egreso existente (camino C). */
  cajaMovimientoId: string | null;
};

/**
 * Primer error que impediría guardar, en castellano de CAYLA, o `null` si el borrador está bien.
 * Devuelve el CAMPO además del mensaje para que la pantalla pueda llevar el cursor ahí.
 */
export function validarBorrador(b: BorradorGasto, hoy: string): { campo: string; mensaje: string } | null {
  if (!b.categoria) return { campo: "gasto-categoria", mensaje: "Elige la categoría del gasto." };
  if (!b.descripcion.trim()) return { campo: "gasto-descripcion", mensaje: "Describe en qué se gastó." };
  const monto = leerMonto(b.monto);
  if (monto === null || monto <= 0) return { campo: "gasto-monto", mensaje: "El monto debe ser mayor que cero." };
  if (!b.fecha) return { campo: "gasto-fecha", mensaje: "Falta la fecha del gasto." };
  if (b.fecha > hoy) return { campo: "gasto-fecha", mensaje: "La fecha no puede ser futura: el gasto se registra cuando se paga." };
  if (exigeNumero(b.comprobanteTipo) && !b.comprobanteNumero.trim())
    return { campo: "gasto-numero", mensaje: "Escribe el número de la factura (ej. F001-123)." };
  const igv = permiteIgv(b.comprobanteTipo) ? (leerMonto(b.igv) ?? 0) : 0;
  if (igv < 0) return { campo: "gasto-igv", mensaje: "El IGV no puede ser negativo." };
  if (igv > monto) return { campo: "gasto-igv", mensaje: "El IGV no puede ser mayor que el total." };
  if (b.medioPago === "efectivo" && !b.cajaId && !b.cajaMovimientoId)
    return { campo: "gasto-caja", mensaje: "Un gasto en efectivo sale de una caja abierta: elige cuál." };
  return null;
}

// ---------------------------------------------------------------- meses

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type MesGastos = { anio: number; mes: number };

/** Lee `?mes=aaaa-mm`; si falta o es inválido, devuelve `actual`. */
export function leerMes(param: string | undefined, actual: MesGastos): MesGastos {
  const m = param && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param);
  return m ? { anio: Number(m[1]), mes: Number(m[2]) } : actual;
}

export const claveMes = ({ anio, mes }: MesGastos): string => `${anio}-${String(mes).padStart(2, "0")}`;

export function desplazarMes({ anio, mes }: MesGastos, delta: number): MesGastos {
  const i = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(i / 12), mes: (i % 12) + 1 };
}

/** Primer y último día del mes como `aaaa-mm-dd` (el último día no depende de la zona horaria). */
export function rangoDelMes({ anio, mes }: MesGastos): { desde: string; hasta: string } {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export const tituloMes = ({ anio, mes }: MesGastos): string => `${MESES[mes - 1]} ${anio}`;

// ---------------------------------------------------------------- egresos sin clasificar

/**
 * Qué botón destacar para un egreso de caja. Es una SUGERENCIA de pantalla, nunca un filtro:
 * el motivo es texto libre («deposito», «Depósito bancario»…), así que decidir por él qué es un
 * gasto sería frágil. Aquí solo ordena los botones; quien decide es el líder.
 */
export function sugerenciaEgreso(motivo: string, esAjuste: boolean): "no_gasto" | "gasto" | null {
  if (esAjuste) return "no_gasto";
  const m = motivo.toLowerCase();
  if (/dep[oó]sito|retiro/.test(m)) return "no_gasto";
  if (/compra|insumo|movilidad|taxi|pasaje|servicio/.test(m)) return "gasto";
  return null;
}

export const MOTIVOS_NO_GASTO = ["Depósito al banco", "Retiro del dueño", "Ajuste de conteo de caja"];

// ---------------------------------------------------------------- tarjetas

export type TarjetaSede = {
  ubicacionId: string | null;
  nombre: string;
  total: number;
  nGastos: number;
  igv: number;
  porCategoria: { categoria: string; nombre: string; monto: number }[];
};

/** Una línea de contexto para la tarjeta: cuántos gastos y cuál pesa más. */
export function lineaTarjeta(t: TarjetaSede): string {
  if (t.nGastos === 0) return "Sin gastos registrados";
  const cuantos = t.nGastos === 1 ? "1 gasto" : `${t.nGastos} gastos`;
  const top = t.porCategoria[0];
  if (!top) return cuantos;
  const pct = t.total > 0 ? Math.round((top.monto / t.total) * 100) : 0;
  return t.porCategoria.length === 1 ? `${cuantos} · todo en ${top.nombre.toLowerCase()}` : `${cuantos} · lo que más pesa: ${top.nombre.toLowerCase()} (${pct} %)`;
}
