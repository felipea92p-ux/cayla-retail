import { diaLima, diasEntreFechas } from "./fechas-lima";
import { DIAS_URGENCIA_RECLAMO } from "./notas-credito-reglas";

// El aviso del IGV (ADR-0362, fase 5b, actividad 4; Felipe 2026-10-15: «un aviso en Inicio, que no se puede ocultar, mientras haya facturas
// con prendas que no llegaron o sin su nota»). Lo que dice `fn_igv_en_espera`, ya leído, y las frases que comparten el Inicio y el
// Observatorio del Admin. Puro: se prueba en `igv-en-espera-reglas.test.ts`.
//
// Son dos cosas distintas, con dos acciones distintas:
//   - las notas por pedir: lo que no llegó de una factura ya volvió como plata con un documento interno, pero falta la nota de crédito del
//     proveedor; su IGV espera en la cuenta puente 4019 («Llegó su nota de crédito», en Notas de crédito);
//   - las prendas de una factura que no llegaron y nadie resolvió: su IGV sigue en el crédito fiscal sin la mercadería («Llegó la
//     reposición» o «Pasar a saldo a favor», en la ficha del proveedor).

export const RPC_IGV_EN_ESPERA = "fn_igv_en_espera";

/** Desde cuántos días esperando una nota del proveedor el aviso se vuelve urgente: el mismo plazo del reclamo en Notas de crédito. */
export const DIAS_URGENCIA_NOTA_PROVEEDOR = DIAS_URGENCIA_RECLAMO;

export type IgvSinNota = { documentos: number; facturas: number; igv: number; desde: string | null };
export type IgvFaltantes = { prendas: number; facturas: number; igv: number; proveedores: number; proveedorId: string | null; proveedor: string | null; desde: string | null };
/** Cada parte es `undefined` si no es para quien mira (la base la manda nula: no puede hacer nada con ella). */
export type IgvEnEspera = { sinNota: IgvSinNota | undefined; faltantes: IgvFaltantes | undefined };

const num = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
const txt = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Lee `fn_igv_en_espera`. `null` si no llegó un objeto que se entienda (el aviso dice «no se pudo leer», nunca «al día»). */
export function leerIgvEnEspera(data: unknown): IgvEnEspera | null {
  const r = obj(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  const s = obj(r.sin_nota);
  const f = obj(r.faltantes);
  return {
    sinNota: s ? { documentos: num(s.documentos), facturas: num(s.facturas), igv: num(s.igv), desde: txt(s.desde) } : undefined,
    faltantes: f
      ? { prendas: num(f.prendas), facturas: num(f.facturas), igv: num(f.igv), proveedores: num(f.proveedores), proveedorId: txt(f.proveedor_id), proveedor: txt(f.proveedor), desde: txt(f.desde) }
      : undefined,
  };
}

/** Cuántos días lleva esperando lo más antiguo (en días de Lima). `null` sin fecha. */
export function diasDeEspera(desde: string | null, hoy: string): number | null {
  const dia = diaLima(desde);
  return dia ? Math.max(0, diasEntreFechas(dia, hoy)) : null;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** El aviso de las notas por pedir, en palabras de tienda. `soles` lo pone quien lo dibuja: con sus céntimos, como en Notas de crédito. */
export function textoNotasPorPedir(s: Pick<IgvSinNota, "facturas" | "igv">, soles: (n: number) => string): { detalle: string; ahora: string } {
  if (s.facturas === 0) return { detalle: "Ninguna factura espera la nota de su proveedor.", ahora: "" };
  return {
    detalle: `La plata ya volvió en ${s.facturas} ${plural(s.facturas, "factura", "facturas")}, pero falta la nota del proveedor: sus ${soles(s.igv)} de IGV esperan.`,
    ahora: `Pide la nota de crédito de ${s.facturas} ${plural(s.facturas, "factura", "facturas")}`,
  };
}

/** El aviso de las prendas de factura que no llegaron (o que se devolvieron por llegar dañadas, actividad 6b), en palabras de tienda. */
export function textoPrendasSinLlegar(f: Pick<IgvFaltantes, "prendas" | "facturas" | "igv">, soles: (n: number) => string): { detalle: string; ahora: string } {
  if (f.prendas === 0) return { detalle: "Ninguna prenda de una factura espera reposición.", ahora: "" };
  return {
    detalle: `${f.prendas} ${plural(f.prendas, "prenda", "prendas")} de ${f.facturas} ${plural(f.facturas, "factura", "facturas")} no ${plural(f.prendas, "llegó o se devolvió", "llegaron o se devolvieron")} por daño: su IGV (${soles(f.igv)}) está en tu crédito fiscal sin la mercadería. ${plural(f.prendas, "Anota que llegó o pásala", "Anota que llegaron o pásalas")} a saldo a favor.`,
    ahora: `Resuelve ${f.prendas} ${plural(f.prendas, "prenda que te deben", "prendas que te deben")}`,
  };
}

/** A dónde lleva el aviso de las prendas: la ficha del proveedor si es uno solo; si no, el directorio. */
export const hrefPrendasSinLlegar = (f: Pick<IgvFaltantes, "proveedores" | "proveedorId">): string =>
  f.proveedores === 1 && f.proveedorId ? `/compras/proveedores/${f.proveedorId}` : "/compras/proveedores";
