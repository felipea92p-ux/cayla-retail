import { diaMes, diasHastaLima, sumarDias } from "./fechas-lima";
import type { CompraResumen } from "./compras-reglas";
import type { NotaCreditoCompra } from "./compras-faltantes";

// Reglas puras de Recibir mercadería (D1 y D2 de ADR-0111). Sin I/O: se prueban sin base ni
// navegador. Las fechas son de Lima (`fechas-lima`), nunca el reloj del servidor.

// ---------------------------------------------------------------------------
// D1 — las líneas arrancan en 0: qué dice cada línea de lo que se contó
// ---------------------------------------------------------------------------

export type EstadoLinea = "sin_contar" | "completa" | "faltan" | "excede";

/**
 * `llego` es lo que alguien anotó en la línea, y ahí hay DOS «cero» que no son lo mismo:
 *  · `null` — nadie la tocó: «sin contar». No suma al stock y sigue pendiente; no se sabe qué pasó.
 *  · `0`    — alguien la contó y no llegó nada: «faltan todas». Es un dato, y es el único camino para
 *             poder decir «no llegó y no va a llegar» (cerrar el faltante).
 * Antes de D1 el formulario arrancaba con todo lo pendiente ya lleno y se podía apretar «Recibir» sin
 * contar; la primera versión de D1 arrancó en 0 y confundió las dos cosas: una línea con 0 nunca
 * ofrecía el faltante. Por eso el «sin contar» es la ausencia de valor, no el número 0.
 */
export function estadoLinea(llego: number | null, pendiente: number): EstadoLinea {
  if (llego === null) return "sin_contar";
  if (llego > pendiente) return "excede";
  return llego === pendiente ? "completa" : "faltan";
}

/** Cuántas unidades de la línea no llegaron: solo tiene sentido si la línea se contó. */
export function faltanteDeLinea(llego: number | null, pendiente: number): number {
  return llego === null ? 0 : Math.max(0, pendiente - llego);
}

export function resumenConteo(lineas: { llego: number | null; pendiente: number }[]) {
  const total = lineas.length;
  const contadas = lineas.filter((l) => l.llego !== null).length;
  return {
    total,
    contadas,
    sinContar: total - contadas,
    unidades: lineas.reduce((a, l) => a + (l.llego ?? 0), 0),
    excedidas: lineas.filter((l) => l.llego !== null && l.llego > l.pendiente).length,
  };
}

// ---------------------------------------------------------------------------
// Urgencia: qué comprobante ya debió llegar
// ---------------------------------------------------------------------------

type Esperable = { fechaEstimadaLlegada: string | null; fechaEmision: string };

/** La fecha en que se espera el fardo: la estimada al registrar, o emisión + 7 días (misma regla que la base). */
export function fechaEsperada(c: Esperable): string {
  return c.fechaEstimadaLlegada ?? sumarDias(c.fechaEmision, 7);
}

/** Días de atraso: positivo = ya debió llegar; 0 = llega hoy; negativo = faltan esos días. */
export function diasDeAtraso(c: Esperable, ahora: Date = new Date()): number {
  // `0 - x` y no `-x`: negar un 0 da -0 en JavaScript.
  return 0 - diasHastaLima(fechaEsperada(c), ahora);
}

export function chipLlegada(c: Esperable, ahora: Date = new Date()): { texto: string; tono: "ambar" | "neutro" } {
  const atraso = diasDeAtraso(c, ahora);
  if (atraso > 0) return { texto: `Atrasada ${atraso} d`, tono: "ambar" };
  if (atraso === 0) return { texto: "Llega hoy", tono: "neutro" };
  return { texto: `En ${-atraso} días`, tono: "neutro" };
}

/** «Esperada el 09/09» si ya debió llegar; «Llega el 22/09» si todavía no. */
export function textoEsperada(c: Esperable, ahora: Date = new Date()): string {
  return `${diasDeAtraso(c, ahora) > 0 ? "Esperada" : "Llega"} el ${diaMes(fechaEsperada(c))}`;
}

/** Lo atrasado primero (el más atrasado arriba), después por fecha esperada ascendente. */
export function ordenarPorUrgencia<T extends Esperable>(compras: T[], ahora: Date = new Date()): T[] {
  return [...compras].sort((a, b) => diasDeAtraso(b, ahora) - diasDeAtraso(a, ahora));
}

/**
 * Valor S/ de lo que falta llegar de un comprobante, proporcional a lo pendiente (el total incluye IGV).
 *
 * ADR-0139 — vista desde una tienda, `facturadoCantidad` es lo que le TOCA a ella pero `total` es el de TODO el
 * comprobante: el prorrateo se hace contra las unidades del comprobante entero (`facturadoTotal`), si no, a una tienda
 * con 18 de 36 unidades le saldría el total completo como «por llegar».
 */
export function valorPorLlegar(c: { total: number; facturadoCantidad: number; recibidoCantidad: number; cerradoCantidad?: number; facturadoTotal?: number }): number {
  const base = c.facturadoTotal ?? c.facturadoCantidad;
  if (base <= 0) return 0;
  const pendiente = Math.max(0, c.facturadoCantidad - c.recibidoCantidad - (c.cerradoCantidad ?? 0));
  return Math.round(((c.total * pendiente) / base) * 100) / 100;
}

// ---------------------------------------------------------------------------
// D2 — cerrar una línea con faltante y, si corresponde, registrar la nota de crédito
// ---------------------------------------------------------------------------

const centavos = (n: number) => Math.round(n * 100) / 100;

/** La tasa de IGV de un comprobante se deduce de sus montos (la tasa no se guarda): 18 % → 0.18. */
export function tasaIgv(c: { igv: number; subtotal: number }): number {
  return c.subtotal > 0 ? c.igv / c.subtotal : 0;
}

// ---------------------------------------------------------------------------
// D2 dentro de la guía — cerrar VARIOS faltantes juntos, al confirmar
// ---------------------------------------------------------------------------
//
// Cerrar un faltante ya no abre un modal que escribe al instante: en la guía cada línea que llegó
// corta lleva su decisión (sigue pendiente, o se cierra con un motivo) y todo se registra UNA vez, al
// confirmar la recepción. Estas dos funciones son el plan que ese botón ejecuta y la frase que lo describe.

export type FilaFaltante = { lineaId: string; compraId: string; faltan: number; costoUnitario: number };

/** Qué se hace con lo que faltó de una línea: esperarlo (sigue pendiente) o cerrarlo con un motivo. */
export type DecisionFaltante<M extends string = string> = "espero" | M;

/** Las líneas con faltante a las que se les eligió un MOTIVO (cerrar); las que se esperan siguen pendientes. */
export function cierresElegidos<M extends string>(filas: FilaFaltante[], decisiones: Record<string, DecisionFaltante<M> | undefined>): (FilaFaltante & { motivo: M })[] {
  return filas.flatMap((f) => {
    const d = decisiones[f.lineaId];
    return d && d !== "espero" && f.faltan > 0 ? [{ ...f, motivo: d as M }] : [];
  });
}

/** Líneas cortas a las que todavía no se les dijo qué pasó con lo que faltó: bloquean el confirmar. */
export function sinDecidir(filas: FilaFaltante[], decisiones: Record<string, string | undefined>): FilaFaltante[] {
  return filas.filter((f) => f.faltan > 0 && !decisiones[f.lineaId]);
}

/** Lo que vale lo cerrado, con IGV: la suma de `cantidad × costo` de cada línea (el costo del ítem es sin IGV). */
export function montoDeCierres(cierres: { faltan: number; costoUnitario: number }[], tasa: number): number {
  return centavos(cierres.reduce((a, c) => a + c.faltan * c.costoUnitario, 0) * (1 + tasa));
}

/** El texto del botón de confirmar: dice qué se va a registrar, sin sorpresas al apretarlo. */
export function etiquetaConfirmar(p: { unidades: number; cierres: number; ubicacion: string }): string {
  const u = `${p.unidades.toLocaleString("es-PE")} ${p.unidades === 1 ? "unidad" : "unidades"}`;
  const c = `${p.cierres} ${p.cierres === 1 ? "faltante" : "faltantes"}`;
  if (p.unidades > 0 && p.cierres > 0) return `Recibir ${u} y cerrar ${c}`;
  if (p.unidades > 0) return `Recibir ${u} en ${p.ubicacion}`;
  if (p.cierres > 0) return `Cerrar ${c}`;
  return `Recibir en ${p.ubicacion}`;
}

// ---------------------------------------------------------------------------
// Lo que hay que RECLAMARLE al proveedor (Recepción ya no registra la nota)
// ---------------------------------------------------------------------------

/** Un comprobante del envío que va a quedar esperando su nota de crédito por faltante. */
export type ReclamoNota = {
  compraId: string;
  documento: string;
  proveedorNombre: string;
  /** Unidades cerradas por faltante: las de esta guía más las que ya estaban cerradas. */
  unidades: number;
  /** Las que se cierran en ESTA guía (0 = el faltante ya estaba cerrado de antes). */
  cerrandoAhora: number;
  /** Lo cerrado a su costo + IGV: lo que la nota debería acreditar. */
  monto: number;
};

/**
 * Qué notas de crédito va a dejar pendientes este envío. Desde 2026-09-19 Recepción NO registra la
 * nota (eso vive en `/compras/notas-credito`): acá solo se avisa, con nombre y monto, que el
 * proveedor queda debiendo el documento. Un comprobante que YA tiene su nota por faltante no
 * aparece — es una sola por comprobante.
 */
export function notasPorReclamar(
  bloques: {
    compra: { id: string; documento: string; proveedorNombre: string; igv: number; subtotal: number };
    cierresAhora: { faltan: number; costoUnitario: number }[];
    cerradoAntes: { faltan: number; costoUnitario: number }[];
    yaTieneNotaFaltante: boolean;
  }[],
): ReclamoNota[] {
  const salida: ReclamoNota[] = [];
  for (const b of bloques) {
    if (b.yaTieneNotaFaltante) continue;
    const todos = [...b.cerradoAntes, ...b.cierresAhora];
    const unidades = todos.reduce((a, c) => a + c.faltan, 0);
    if (unidades <= 0) continue;
    salida.push({
      compraId: b.compra.id,
      documento: b.compra.documento,
      proveedorNombre: b.compra.proveedorNombre,
      unidades,
      cerrandoAhora: b.cierresAhora.reduce((a, c) => a + c.faltan, 0),
      monto: montoDeCierres(todos, tasaIgv(b.compra)),
    });
  }
  return salida;
}

/**
 * Una sola nota por faltante por comprobante, que cubre todo lo que se cerró sin llegar: lo cerrado a su costo
 * más IGV, con hasta S/ 1 de margen para redondeos y prorrateos (el mismo que exige la base). Lo usa el módulo de
 * notas de crédito (`notas-credito-reglas.ts`).
 */
export const MARGEN_NOTA = 1;

// ---------------------------------------------------------------------------
// ¿Se puede registrar la nota por faltante YA? (espejo de las reglas de la base)
// ---------------------------------------------------------------------------

export type DisponibilidadNota =
  | { estado: "ya_registrada" }
  | { estado: "sin_cierres" }
  | { estado: "bloqueada"; quedan: number }
  | { estado: "disponible" };

/**
 * La base rechaza una nota por faltante si el comprobante no está resuelto al 100 % (recibido +
 * cerrado = facturado), si no hay ningún cierre, o si ya tiene una. Acá se anticipa para que la pantalla
 * diga POR QUÉ todavía no, en lugar de dejar que el error llegue después de llenar el formulario.
 * `quedan` = unidades que después de esta guía todavía no se recibieron ni se cerraron.
 */
export function disponibilidadNota(p: { pendiente: number; llegando: number; cerrandoAhora: number; cerradoAntes: number; yaTieneNotaFaltante: boolean }): DisponibilidadNota {
  if (p.yaTieneNotaFaltante) return { estado: "ya_registrada" };
  if (p.cerradoAntes + p.cerrandoAhora <= 0) return { estado: "sin_cierres" };
  const quedan = p.pendiente - p.llegando - p.cerrandoAhora;
  return quedan > 0 ? { estado: "bloqueada", quedan } : { estado: "disponible" };
}

/**
 * Lo que dice la base sobre una nota por faltante de este comprobante, para decidir qué ofrecer.
 *
 * Vive acá (módulo puro) y NO en `AccionesFaltantes.tsx`: ese archivo es `"use client"` y el detalle del
 * comprobante (`NotasCreditoCompra`, componente de servidor) la llama en el servidor — Next lo prohíbe
 * («Attempted to call estadoNotaFaltante() from the server but … is on the client») y la pantalla se caía
 * al abrir cualquier factura.
 */
export function estadoNotaFaltante(compra: CompraResumen, notas: NotaCreditoCompra[]): DisponibilidadNota {
  return disponibilidadNota({
    pendiente: compra.facturadoCantidad - compra.recibidoCantidad - compra.cerradoCantidad,
    llegando: 0,
    cerrandoAhora: 0,
    cerradoAntes: compra.cerradoCantidad,
    yaTieneNotaFaltante: notas.some((n) => n.motivo === "faltante"),
  });
}

// ---------------------------------------------------------------------------
// Qué le hace la nota a las cuentas: baja la deuda y/o deja saldo a favor
// ---------------------------------------------------------------------------

export type ReparteNota = { baja: number; aFavor: number; deudaDespues: number };

/** La nota primero baja lo que se debe de SU comprobante; lo que sobre queda a favor del proveedor. */
export function reparteNota(monto: number, saldo: number): ReparteNota {
  const baja = centavos(Math.min(monto, Math.max(saldo, 0)));
  return { baja, aFavor: centavos(monto - baja), deudaDespues: centavos(Math.max(saldo, 0) - baja) };
}
