import { diaMes, diasHastaLima, sumarDias } from "./fechas-lima";

// Reglas puras de Recibir mercadería (D1 y D2 de ADR-0106). Sin I/O: se prueban sin base ni
// navegador. Las fechas son de Lima (`fechas-lima`), nunca el reloj del servidor.

// ---------------------------------------------------------------------------
// D1 — las líneas arrancan en 0: qué dice cada línea de lo que se contó
// ---------------------------------------------------------------------------

export type EstadoLinea = "sin_contar" | "completa" | "faltan" | "excede";

/**
 * Una línea que nadie tocó está «sin contar»: no suma al stock y sigue pendiente en el
 * comprobante. Antes de D1 el formulario arrancaba con todo lo pendiente ya lleno, y se podía
 * apretar «Recibir» sin contar — el stock subía por prendas que quizá no llegaron.
 */
export function estadoLinea(llego: number, pendiente: number): EstadoLinea {
  if (llego > pendiente) return "excede";
  if (llego <= 0) return "sin_contar";
  return llego === pendiente ? "completa" : "faltan";
}

export function resumenConteo(lineas: { llego: number; pendiente: number }[]) {
  const total = lineas.length;
  const contadas = lineas.filter((l) => l.llego > 0).length;
  return {
    total,
    contadas,
    sinContar: total - contadas,
    unidades: lineas.reduce((a, l) => a + l.llego, 0),
    excedidas: lineas.filter((l) => l.llego > l.pendiente).length,
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

/** Valor S/ de lo que falta llegar de un comprobante, proporcional a lo pendiente (el total incluye IGV). */
export function valorPorLlegar(c: { total: number; facturadoCantidad: number; recibidoCantidad: number; cerradoCantidad?: number }): number {
  if (c.facturadoCantidad <= 0) return 0;
  const pendiente = Math.max(0, c.facturadoCantidad - c.recibidoCantidad - (c.cerradoCantidad ?? 0));
  return Math.round(((c.total * pendiente) / c.facturadoCantidad) * 100) / 100;
}

// ---------------------------------------------------------------------------
// D2 — cerrar una línea con faltante y, si corresponde, registrar la nota de crédito
// ---------------------------------------------------------------------------

const centavos = (n: number) => Math.round(n * 100) / 100;

/** La tasa de IGV de un comprobante se deduce de sus montos (la tasa no se guarda): 18 % → 0.18. */
export function tasaIgv(c: { igv: number; subtotal: number }): number {
  return c.subtotal > 0 ? c.igv / c.subtotal : 0;
}

/** Monto sugerido de la nota: lo que faltó a su costo (`compra_items.costo_unitario` es SIN IGV) más IGV. */
export function montoNotaSugerido(cantidad: number, costoUnitario: number, tasa: number): number {
  return centavos(cantidad * costoUnitario * (1 + tasa));
}

/** La parte de IGV de un monto que ya lo incluye. */
export function igvDeMonto(monto: number, tasa: number): number {
  return centavos(monto - monto / (1 + tasa));
}

export type Efecto = { etiqueta: string; antes: string; despues: string };

/**
 * «Cómo quedan tus cuentas»: qué cambia antes de apretar el botón. Solo lista lo que de verdad
 * cambia; sin nota de crédito y sin cubrir el comprobante no hay nada que mostrar.
 */
export function efectoCierre(p: {
  documento: string;
  saldo: number;
  montoNota: number;
  igvNota: number;
  igvMes: number | null;
  recepcionAntes: string;
  cubreTodo: boolean;
  estabaAtrasada: boolean;
  atrasadasAntes: number | null;
  formato: (n: number) => string;
}): Efecto[] {
  const filas: Efecto[] = [];
  if (p.montoNota > 0) {
    filas.push({ etiqueta: `Lo que se debe de ${p.documento}`, antes: p.formato(p.saldo), despues: p.formato(Math.max(0, centavos(p.saldo - p.montoNota))) });
    if (p.igvMes != null) filas.push({ etiqueta: "Crédito fiscal (IGV) del mes", antes: p.formato(p.igvMes), despues: p.formato(centavos(p.igvMes - p.igvNota)) });
  }
  if (p.cubreTodo) {
    filas.push({ etiqueta: "Recepción del comprobante", antes: p.recepcionAntes, despues: "Recibida" });
    if (p.estabaAtrasada && p.atrasadasAntes != null && p.atrasadasAntes > 0) {
      filas.push({ etiqueta: "Entregas atrasadas", antes: String(p.atrasadasAntes), despues: String(p.atrasadasAntes - 1) });
    }
  }
  return filas;
}
