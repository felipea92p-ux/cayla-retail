import { diaMes, diasHastaLima, sumarDias } from "./fechas-lima";
import { parseMonto } from "./por-pagar-reglas";

// Reglas puras de Recibir mercadería (D1 y D2 de ADR-0106). Sin I/O: se prueban sin base ni
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

// ---------------------------------------------------------------------------
// D2 dentro de la guía — cerrar VARIOS faltantes juntos, al confirmar
// ---------------------------------------------------------------------------
//
// Cerrar un faltante ya no abre un modal que escribe al instante: en la guía cada línea que llegó
// corta lleva su decisión (sigue pendiente, o se cierra con un motivo) y todo se registra UNA vez, al
// confirmar la recepción. Estas dos funciones son el plan que ese botón ejecuta y la frase que lo describe.

export type FilaFaltante = { lineaId: string; compraId: string; faltan: number; costoUnitario: number };

/** Las líneas con faltante a las que se les eligió un motivo; las demás siguen pendientes. */
export function cierresElegidos<M extends string>(filas: FilaFaltante[], motivos: Record<string, M | undefined>): (FilaFaltante & { motivo: M })[] {
  return filas.flatMap((f) => {
    const motivo = motivos[f.lineaId];
    return motivo && f.faltan > 0 ? [{ ...f, motivo }] : [];
  });
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

/** Lo que se va escribiendo de la nota de crédito de UN comprobante mientras se arma la guía. */
export type NotaBorrador = { activa: boolean; serie: string; fecha: string; montoTxt: string | null /* null = sigue la sugerencia */ };

/**
 * La nota de crédito de un comprobante, con lo que se cierra en esta guía. Una sola nota por
 * comprobante, no una por línea: el proveedor emite UN documento que cubre todo lo que no llegó. El
 * monto sugerido es lo cerrado a su costo más IGV y se puede ajustar (el proveedor puede haber
 * redondeado o prorrateado distinto). Solo un líder registra dinero, y solo si hay algo que cerrar.
 */
export function notaDelBloque(p: {
  saldo: number;
  tasa: number;
  cierres: { faltan: number; costoUnitario: number }[];
  esLider: boolean;
  borrador: NotaBorrador;
}): { activa: boolean; sugerido: number; monto: number; problema: "serie" | "monto" | null } {
  const sugerido = montoDeCierres(p.cierres, p.tasa);
  const activa = p.esLider && p.borrador.activa && p.cierres.length > 0;
  const monto = parseMonto(p.borrador.montoTxt ?? sugerido.toFixed(2));
  const montoOk = !Number.isNaN(monto) && monto > 0 && monto <= p.saldo + 0.005;
  const problema = !activa ? null : !p.borrador.serie.trim() ? "serie" : !montoOk ? "monto" : null;
  return { activa, sugerido, monto, problema };
}
