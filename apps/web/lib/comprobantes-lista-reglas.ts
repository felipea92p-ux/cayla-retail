import type { CompraResumen } from "./compras-reglas";
import { diaMes, diasHastaLima } from "./fechas-lima";
import { diasDeAtraso, textoEsperada } from "./recepciones-reglas";

// Cómo se rotula cada fila de la lista de Comprobantes (maqueta 01, ADR-0111): un estado (chip)
// y, debajo, la cifra que lo explica — «Parcial» solo decía que faltaba algo, no cuánto. Puro,
// sin I/O; las fechas son de Lima.

export type TonoEstado = "neutro" | "ambar" | "verde" | "rojo" | "apagado";
export type CeldaEstado = { tono: TonoEstado; texto: string; sub: string };

const unidades = (n: number) => `${n.toLocaleString("es-PE")} u.`;
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Estado de la mercadería del comprobante, con su apoyo («Atrasada 9 días» + «Esperada el 09/09»). */
export function celdaRecepcion(c: CompraResumen, ahora: Date = new Date()): CeldaEstado {
  if (c.estado === "anulada") return { tono: "apagado", texto: "Anulada", sub: "—" };
  const cubierto = c.recibidoCantidad + c.cerradoCantidad;
  if (c.estadoRecepcion === "recibida") {
    return { tono: "verde", texto: "Recibida", sub: c.cerradoCantidad > 0 ? `${unidades(c.recibidoCantidad)} · ${unidades(c.cerradoCantidad)} cerradas` : `${unidades(c.recibidoCantidad)} recibidas` };
  }
  const atraso = diasDeAtraso(c, ahora);
  const parcial = c.estadoRecepcion === "parcial";
  const avance = `${c.recibidoCantidad} de ${c.facturadoCantidad} u. recibidas`;
  if (atraso > 0 || c.recepcionAtrasada) {
    return { tono: "ambar", texto: `Atrasada ${Math.max(atraso, 1)} ${Math.max(atraso, 1) === 1 ? "día" : "días"}`, sub: parcial ? avance : textoEsperada(c, ahora) };
  }
  if (parcial) return { tono: "ambar", texto: "Parcial", sub: cubierto > c.recibidoCantidad ? `${avance} · ${c.cerradoCantidad} cerradas` : avance };
  return { tono: "neutro", texto: "Sin recibir", sub: textoEsperada(c, ahora) };
}

/** Estado del pago con lo que falta: vencida > vence pronto > parcial > pendiente. */
export function celdaPago(c: CompraResumen, ahora: Date = new Date()): CeldaEstado {
  if (c.estado === "anulada") return { tono: "apagado", texto: "Anulada", sub: "—" };
  if (c.estadoPago === "pagada") return { tono: "verde", texto: "Pagada", sub: c.condicion === "contado" ? "Al contado" : "Saldada" };
  const falta = `Faltan ${soles(c.saldo)}`;
  if (c.vencida) return { tono: "rojo", texto: "Vencida", sub: falta };
  if (c.fechaVencimiento) {
    const d = diasHastaLima(c.fechaVencimiento, ahora);
    if (d >= 0 && d <= 7) return { tono: "ambar", texto: d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : `Vence en ${d} días`, sub: falta };
  }
  return c.estadoPago === "parcial" ? { tono: "ambar", texto: "Parcial", sub: falta } : { tono: "neutro", texto: "Pendiente", sub: falta };
}

/** Bajo la fecha de emisión: «Contado», «Vence 25/09» o «Venció 12/09». */
export function subEmision(c: CompraResumen): string {
  if (c.condicion === "credito" && c.fechaVencimiento) return `${c.vencida && c.estadoPago !== "pagada" ? "Venció" : "Vence"} ${diaMes(c.fechaVencimiento)}`;
  return "Contado";
}

export type VistaComprobantes = "todos" | "por-pagar" | "por-recibir" | "vencidos" | "pagados";

/** Qué pestaña está activa según la URL (la primera que coincida, en el orden en que se muestran). */
export function vistaActiva(p: { saldo?: string; porrecibir?: string; vencidas?: string; pago?: string }): VistaComprobantes {
  if (p.saldo === "1") return "por-pagar";
  if (p.porrecibir === "1") return "por-recibir";
  if (p.vencidas === "1") return "vencidos";
  if (p.pago === "pagada") return "pagados";
  return "todos";
}

/** Primer y último día (aaaa-mm-dd) del mes `aaaa-mm`; `null` si el texto no es un mes válido. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!m) return null;
  const desde = `${m[1]}-${m[2]}-01`;
  const siguiente = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  const hasta = new Date(siguiente.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { desde, hasta };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «septiembre» de un `aaaa-mm-dd` o `aaaa-mm`. */
export function nombreDelMes(iso: string): string {
  return MESES[Number(iso.slice(5, 7)) - 1] ?? "";
}

/** Una celda de CSV según RFC 4180: comillas si trae coma, comilla o salto de línea. */
export function celdaCsv(v: string | number | null | undefined): string {
  const t = v == null ? "" : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
