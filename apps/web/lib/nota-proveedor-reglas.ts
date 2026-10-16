import { soles } from "./compras-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { nombreMes } from "./impuestos-reglas";
import { faltaNotaDelProveedor, parseMontoNota, type FilaVista } from "./notas-credito-reglas";

// «Llegó su nota de crédito» (ADR-0362, fase 5b, actividad 3): la nota 07 que el proveedor manda por lo que no llegó de una FACTURA, y que se
// adjunta a los documentos internos (DI-…) con que esa plata ya volvió. No mueve plata: desde su fecha, su IGV baja el crédito fiscal (sale de
// la cuenta puente 4019). Lógica pura de la hoja: qué documentos puede respaldar, qué falta llenar y cómo se dice lo que pasó. Es el espejo de
// `adjuntar_nota_proveedor` (20261015150000), que vuelve a exigir todo: aquí solo se anticipa para decir POR QUÉ todavía no, y no se agrega
// ninguna regla.

export const RPC_ADJUNTAR_NOTA_PROVEEDOR = "adjuntar_nota_proveedor";

/** Hasta cuántas letras van la serie y el número (como la base). */
const TOPE_SERIE = 30;

const dosDecimales = (n: number) => Math.round(n * 100) / 100;

/**
 * Los documentos internos de ese mismo comprobante que todavía esperan la nota del proveedor: una nota puede respaldar varios (el proveedor
 * suele mandar una sola por todo lo que no llegó). El que se tocó va primero.
 */
export function documentosParaLaNota(filas: readonly FilaVista[], elegido: FilaVista): FilaVista[] {
  const otros = filas.filter((f) => f.id !== elegido.id && f.compraId === elegido.compraId && faltaNotaDelProveedor(f));
  return faltaNotaDelProveedor(elegido) ? [elegido, ...otros] : otros;
}

/** Las series que ya usa ese comprobante: sus notas de crédito y las notas del proveedor ya adjuntas. Una nota nueva no puede repetirlas. */
export function seriesDelComprobante(filas: readonly FilaVista[], compraId: string): string[] {
  const s = new Set<string>();
  for (const f of filas) {
    if (f.compraId !== compraId) continue;
    if (f.clase === "nota" && f.serieNumero) s.add(f.serieNumero.toUpperCase());
    if (f.notaProveedor?.serie) s.add(f.notaProveedor.serie.toUpperCase());
  }
  return [...s];
}

export type BorradorNotaProveedor = { elegidos: string[]; serie: string; fecha: string; monto: string };

/** Vienen elegidos todos los documentos que esperan su nota; la fecha, la de hoy (sugerida: hay que poner la que dice el papel). */
export const borradorNotaProveedor = (docs: readonly FilaVista[], hoy: string): BorradorNotaProveedor => ({
  elegidos: docs.map((d) => d.id),
  serie: "",
  fecha: hoy,
  monto: "",
});

/** Lo que la nota tiene que decir: lo que no llegó, con su IGV (la suma de los documentos elegidos). */
export function cifrasDeLaNota(docs: readonly FilaVista[], elegidos: readonly string[]): { monto: number; base: number; igv: number } {
  const usados = docs.filter((d) => elegidos.includes(d.id));
  const monto = dosDecimales(usados.reduce((a, d) => a + d.monto, 0));
  const igv = dosDecimales(usados.reduce((a, d) => a + d.igv, 0));
  return { monto, base: dosDecimales(monto - igv), igv };
}

export type ProblemasNotaProveedor = { documentos?: string; serie?: string; fecha?: string; monto?: string };

/** Lo que la base rechazaría, dicho antes de llamarla (`adjuntar_nota_proveedor`). */
export function problemasNotaProveedor(p: {
  borrador: BorradorNotaProveedor;
  docs: readonly FilaVista[];
  seriesUsadas: readonly string[];
  /** La fecha de emisión del comprobante (aaaa-mm-dd): la nota no puede ser anterior. */
  emision: string;
  hoy: string;
}): ProblemasNotaProveedor {
  const b = p.borrador;
  const r: ProblemasNotaProveedor = {};
  if (!p.docs.some((d) => b.elegidos.includes(d.id))) r.documentos = "Elige qué documento interno respalda la nota.";

  const serie = b.serie.trim().toUpperCase();
  if (!serie) r.serie = "Escribe la serie y el número, como dice la nota.";
  else if (serie.startsWith("DI-")) r.serie = "La serie DI- es de los documentos internos de CAYLA: escribe la de la nota del proveedor.";
  else if (serie.length > TOPE_SERIE) r.serie = `La serie y el número van hasta ${TOPE_SERIE} letras.`;
  else if (p.seriesUsadas.includes(serie)) r.serie = `La nota ${serie} ya está registrada en este comprobante.`;

  if (!b.fecha) r.fecha = "Elige la fecha de la nota.";
  else if (b.fecha > p.hoy) r.fecha = "La fecha de la nota no puede ser futura.";
  else if (p.emision && b.fecha < p.emision) r.fecha = `La nota no puede ser anterior al comprobante (emitido el ${p.emision.slice(8, 10)}/${p.emision.slice(5, 7)}).`;

  const monto = parseMontoNota(b.monto);
  const esperado = cifrasDeLaNota(p.docs, b.elegidos).monto;
  if (b.monto.trim() === "") r.monto = "Escribe el monto, como dice la nota.";
  else if (Number.isNaN(monto)) r.monto = "Escribe el monto en soles, con hasta 2 decimales.";
  else if (!r.documentos && monto !== esperado) r.monto = `La nota tiene que decir ${soles(esperado)}: si dice otra cifra, pídele al proveedor que la corrija.`;
  return r;
}

/**
 * Los campos de la guía de la hoja (ADR-0284): qué documentos (solo si hay más de uno), la serie, la fecha (viene la de hoy: «sugerida»
 * hasta que se toca, porque decide en qué mes baja el crédito fiscal), el monto y quién lo hace.
 */
export function camposNotaProveedor(
  problemas: ProblemasNotaProveedor,
  docs: readonly FilaVista[],
  responsable: { listo: boolean; motivo: string | null },
  tocados: { fecha?: boolean } = {},
): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (docs.length > 1) {
    campos.push({ id: "documentos", nombre: "Qué respalda", requerido: true, hecho: !problemas.documentos, pendiente: problemas.documentos ?? "" });
  }
  campos.push({ id: "serie", nombre: "Serie y número", requerido: true, hecho: !problemas.serie, pendiente: problemas.serie ?? "" });
  campos.push(
    !problemas.fecha && !tocados.fecha
      ? { id: "fecha", nombre: "Fecha", requerido: false, sugerido: true, hecho: false, pendiente: "Revisa la fecha: viene la de hoy, y va la que dice la nota." }
      : { id: "fecha", nombre: "Fecha", requerido: true, hecho: !problemas.fecha, pendiente: problemas.fecha ?? "" },
  );
  campos.push({ id: "monto", nombre: "Monto", requerido: true, hecho: !problemas.monto, pendiente: problemas.monto ?? "" });
  campos.push({ id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo hace." });
  return campos;
}

export type ArgsNotaProveedor = { p_documentos: string[]; p_serie_numero: string; p_fecha: string; p_monto: number; p_token: string };

/** Los argumentos de `adjuntar_nota_proveedor`. Solo se llama con la hoja lista. El token se genera al abrir la hoja: un reintento no hace otra. */
export function argsNotaProveedor(b: BorradorNotaProveedor, docs: readonly FilaVista[], token: string): ArgsNotaProveedor {
  return {
    p_documentos: docs.filter((d) => b.elegidos.includes(d.id)).map((d) => d.id),
    p_serie_numero: b.serie.trim().toUpperCase(),
    p_fecha: b.fecha,
    p_monto: parseMontoNota(b.monto),
    p_token: token,
  };
}

/** Lo que contesta la base al adjuntar. */
export type NotaProveedorAdjunta = { serie: string; fecha: string; monto: number; igv: number; comprobante: string | null; documentos: string[] };

export function leerNotaProveedor(data: unknown): NotaProveedorAdjunta | null {
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || typeof r.serie_numero !== "string") return null;
  const n = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
  return {
    serie: r.serie_numero,
    fecha: String(r.fecha ?? "").slice(0, 10),
    monto: n(r.monto),
    igv: n(r.igv),
    comprobante: typeof r.comprobante === "string" ? r.comprobante : null,
    documentos: Array.isArray(r.documentos) ? r.documentos.filter((x): x is string => typeof x === "string") : [],
  };
}

/** El aviso de éxito: «Respalda el DI-000045. Sus S/ 10.80 de IGV bajan el crédito fiscal de octubre.» */
export function detalleNotaProveedor(r: NotaProveedorAdjunta): string {
  const docs = r.documentos.length > 0 ? new Intl.ListFormat("es", { type: "conjunction" }).format(r.documentos) : null;
  const respalda = docs ? `Respalda ${r.documentos.length === 1 ? "el" : "los"} ${docs}. ` : "";
  return `${respalda}Sus ${soles(r.igv)} de IGV bajan el crédito fiscal${/^\d{4}-\d{2}/.test(r.fecha) ? ` de ${nombreMes(r.fecha.slice(0, 7))}` : ""}.`;
}

/** Los avisos de la base de esta hoja vienen en palabras de tienda (hint `nota_proveedor_*`); el de permisos va por el genérico. */
export function mensajeDeNotaProveedor(error: { message?: string | null; hint?: string | null } | null | undefined): string | null {
  if (!error?.message || !error.hint) return null;
  return /^nota_proveedor_[a-z_]+$/.test(error.hint) && error.hint !== "nota_proveedor_sin_modulo" ? error.message : null;
}

/** ¿Conviene recargar? Lo que la hoja muestra ya no es lo que hay: otra persona adjuntó, o el mismo pedido ya se guardó con otros datos. */
export function sugiereRecargarNotaProveedor(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === "nota_proveedor_ya_adjunta" || error?.hint === "nota_proveedor_otros_datos" || error?.hint === "nota_proveedor_documentos";
}

/** Qué decir cuando se corta la señal al adjuntar: pudo guardarse. Reintentar sin cambiar nada es seguro (el mismo token no hace otra). */
export const AVISO_DE_CORTE_NOTA_PROVEEDOR =
  "Se cortó la conexión y no sabemos si se adjuntó. Vuelve a pulsar el botón sin cambiar nada: si ya se adjuntó, no se repite.";
