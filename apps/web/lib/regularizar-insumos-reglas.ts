import type { CampoDeGuia } from "./guia-campos";
import { leerCantidad } from "./insumos-reglas";
import { problemaDeMotivoIngreso } from "./ingreso-insumo-reglas";

// Regularizar lo que ya entró (ADR-0614, actividades 6 y 7). Puro: sin React ni red. La base vuelve a exigirlo todo.

export const RPC_ASIGNAR_PROVEEDOR_LOTE = "asignar_proveedor_a_lote";
export const RPC_AJUSTAR_LOTE_USADO = "ajustar_lote_usado";
export const RPC_REEMPLAZAR_PAPEL = "reemplazar_papel_provisional";

/** Qué le falta al ajuste de lo que queda. `null` si se puede guardar. */
export function problemaDelAjuste(escrito: string, saldo: number): string | null {
  if (escrito.trim() === "") return "Escribe cuánto queda de verdad.";
  const q = leerCantidad(escrito);
  if (q === null || q < 0) return "No se entiende cuánto queda.";
  if (q > saldo) return "Es más de lo que dice el sistema: lo que sobra se anota como «Saldo inicial», con su costo.";
  if (q === saldo) return "Es lo mismo que ya dice el sistema.";
  return null;
}

export function camposDelAjuste(e: { problema: string | null; motivo: string; responsableListo: boolean }): CampoDeGuia[] {
  const problemaMotivo = problemaDeMotivoIngreso(e.motivo);
  return [
    { id: "queda", nombre: "Cuánto queda", requerido: true, hecho: e.problema === null, pendiente: e.problema ?? "" },
    { id: "porque", nombre: "Por qué", requerido: true, hecho: problemaMotivo === null, pendiente: problemaMotivo ?? "" },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién lo anota." },
  ];
}

export type PapelReal = "factura" | "boleta" | "nota_venta" | "recibo_por_honorarios";

export const PAPELES_REALES: readonly { valor: PapelReal; texto: string }[] = [
  { valor: "factura", texto: "Factura" },
  { valor: "boleta", texto: "Boleta" },
  { valor: "nota_venta", texto: "Nota de venta" },
  { valor: "recibo_por_honorarios", texto: "Recibo por honorarios" },
];

/** El mayor total posible de una factura con estas líneas: subtotal + 18 %. */
export function topeDeFactura(subtotal: number): number {
  return Math.round(subtotal * 118) / 100;
}

/** Qué le falta al papel que llegó. Vacío si se puede guardar. */
export function problemasDelPapel(e: { tipo: PapelReal; serie: string; numero: string; fecha: string; hoy: string; total: number; subtotal: number; pagado: number }): string[] {
  const p: string[] = [];
  if (e.serie.trim() === "" || e.numero.trim() === "") p.push("Escribe la serie y el número del papel.");
  if (e.fecha === "" || e.fecha > e.hoy) p.push("La fecha del papel no puede ser futura.");
  if (e.tipo === "factura" && (!Number.isFinite(e.total) || e.total < e.subtotal || e.total > topeDeFactura(e.subtotal) + 0.01)) p.push("Revisa el total: no puede ser menor que las líneas ni pasar el 18 % de IGV.");
  const total = e.tipo === "factura" ? e.total : e.subtotal;
  if (Number.isFinite(total) && total < e.pagado) p.push("Ya se pagó más que este total.");
  return p;
}
