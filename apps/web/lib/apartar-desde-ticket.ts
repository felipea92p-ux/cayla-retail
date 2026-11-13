/**
 * «Apartar» desde el ticket del Punto de venta (spike 2026-09-26, hallazgo 5): las prendas ya elegidas viajan a
 * Apartados en la dirección (`/vender/apartados?prendas=<id>:<cant>,…`) en vez de buscarlas otra vez. Apartados sigue
 * siendo quien cobra el adelanto y separa el stock (ADR-0166): esto solo le dice con qué prendas arrancar.
 *
 * Por la dirección no viaja dinero: los precios Apartados los vuelve a leer del catálogo de hoy. El descuento puesto a mano en el
 * ticket (ADR-0584) sí viaja, pero por el almacenamiento de la PESTAÑA (`sessionStorage`), atado a las mismas prendas: lleva
 * un motivo y un argumento escritos, y eso no va en una dirección. La base lo vuelve a exigir al apartar.
 */
import type { DescuentoManual } from "./apartar-descuento-reglas";

export type LineaApartar = { varianteId: string; cantidad: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un ticket de mostrador no pasa de esto; más es una dirección armada a mano. */
const TOPE_LINEAS = 30;

/** `id:cant,id:cant` con las unidades de una misma prenda juntas: el valor de `?prendas=` y la marca del descuento que viaja. */
function valorDePrendas(lineas: readonly LineaApartar[]): string {
  const juntas = new Map<string, number>();
  for (const l of lineas) juntas.set(l.varianteId, (juntas.get(l.varianteId) ?? 0) + l.cantidad);
  return [...juntas].map(([id, c]) => `${id}:${c}`).join(",");
}

export function hrefApartarDesdeTicket(lineas: readonly LineaApartar[]): string {
  return `/vender/apartados?prendas=${encodeURIComponent(valorDePrendas(lineas))}`;
}

/** Lo que se lee de una línea del ticket para saber su descuento a mano (la forma de `ItemCarrito`). */
type LineaDelTicket = {
  varianteId: string;
  descuentoUnitario: number;
  razonDescuento: string;
  razonDescuentoOtro: string;
  argumentoDescuento: string;
};

/**
 * El descuento a mano de cada prenda del ticket, para que llegue a Apartar (ADR-0584). Apartar junta las unidades de una prenda
 * en una sola línea, así que una prenda lleva su descuento solo si TODAS sus líneas del ticket llevan el mismo (monto, motivo y
 * argumento). Si tiene dos distintos, o uno a medias, no se adivina cuál: no viaja y se cuenta en `sinLlevar`, para decirlo. El de
 * campaña no viaja (Apartar lo pone solo con la campaña de hoy), ni la parte del Club.
 */
export function descuentosDelTicket(carrito: readonly LineaDelTicket[]): { descuentos: Record<string, DescuentoManual>; sinLlevar: number } {
  const porPrenda = new Map<string, LineaDelTicket[]>();
  for (const l of carrito) porPrenda.set(l.varianteId, [...(porPrenda.get(l.varianteId) ?? []), l]);
  const descuentos: Record<string, DescuentoManual> = {};
  let sinLlevar = 0;
  const aMano = (l: LineaDelTicket) => l.descuentoUnitario > 0 && l.razonDescuento !== "campana";
  const firma = (l: LineaDelTicket) => JSON.stringify([l.descuentoUnitario, l.razonDescuento, l.razonDescuentoOtro, l.argumentoDescuento]);
  for (const [id, lineas] of porPrenda) {
    const manuales = lineas.filter(aMano);
    if (manuales.length === 0) continue;
    if (manuales.length !== lineas.length || new Set(manuales.map(firma)).size > 1) {
      sinLlevar++;
      continue;
    }
    const l = manuales[0]!;
    descuentos[id] = { unitario: l.descuentoUnitario, razon: l.razonDescuento, razonOtro: l.razonDescuentoOtro, argumento: l.argumentoDescuento };
  }
  return { descuentos, sinLlevar };
}

const CLAVE_DESCUENTOS = "cayla-apartar-desde-ticket-descuentos";

/** Deja el descuento del ticket para Apartar, atado a estas prendas. Sin almacenamiento (ventana privada), no viaja y nada se rompe. */
export function dejarDescuentosParaApartar(lineas: readonly LineaApartar[], descuentos: Record<string, DescuentoManual>): void {
  try {
    if (Object.keys(descuentos).length === 0) window.sessionStorage.removeItem(CLAVE_DESCUENTOS);
    else window.sessionStorage.setItem(CLAVE_DESCUENTOS, JSON.stringify({ prendas: valorDePrendas(lineas), descuentos }));
  } catch {
    // Sin almacenamiento: las prendas llegan igual, sin el descuento.
  }
}

/** Toma (y borra) el descuento que dejó el ticket, solo si es de estas mismas prendas: uno viejo nunca se cuela en otro apartado. */
export function tomarDescuentosParaApartar(lineas: readonly LineaApartar[]): Record<string, DescuentoManual> {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_DESCUENTOS);
    window.sessionStorage.removeItem(CLAVE_DESCUENTOS);
    return crudo ? descuentosGuardados(JSON.parse(crudo), lineas) : {};
  } catch {
    return {};
  }
}

/** Lo guardado, sin confiar en ello: de estas prendas, con monto positivo y textos. La base igual vuelve a exigir todo al apartar. */
function descuentosGuardados(guardado: unknown, lineas: readonly LineaApartar[]): Record<string, DescuentoManual> {
  if (!guardado || typeof guardado !== "object") return {};
  const { prendas, descuentos } = guardado as { prendas?: unknown; descuentos?: unknown };
  if (prendas !== valorDePrendas(lineas) || !descuentos || typeof descuentos !== "object") return {};
  const ids = new Set(lineas.map((l) => l.varianteId));
  const out: Record<string, DescuentoManual> = {};
  for (const [id, d] of Object.entries(descuentos as Record<string, unknown>)) {
    if (!ids.has(id) || !d || typeof d !== "object") continue;
    const { unitario, razon, razonOtro, argumento } = d as Record<string, unknown>;
    if (typeof unitario !== "number" || !(unitario > 0) || typeof razon !== "string") continue;
    out[id] = { unitario, razon, razonOtro: typeof razonOtro === "string" ? razonOtro : "", argumento: typeof argumento === "string" ? argumento : "" };
  }
  return out;
}

/** Lee `?prendas=` sin confiar en ella: ids con forma de uuid, cantidades enteras de 1 a 99, sin repetir. Lo que no
 *  cumple se descarta en silencio — Apartados igual revisa que cada prenda exista y tenga stock. */
export function leerPrendasDeUrl(valor: string | null | undefined): LineaApartar[] {
  if (!valor) return [];
  const vistas = new Set<string>();
  const lineas: LineaApartar[] = [];
  for (const parte of valor.split(",")) {
    const [id, cant] = parte.split(":");
    const cantidad = Number(cant);
    if (!id || !UUID.test(id) || vistas.has(id) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) continue;
    vistas.add(id);
    lineas.push({ varianteId: id, cantidad });
    if (lineas.length >= TOPE_LINEAS) break;
  }
  return lineas;
}

/** Las líneas con las que arranca Apartados: solo prendas que existen, topadas por lo que queda disponible en el piso
 *  (lo ya apartado no cuenta, ADR-0141). Devuelve también cuáles no entraron, para decirlo en vez de perderlas. */
export function lineasApartables(
  pedidas: readonly LineaApartar[],
  disponible: ReadonlyMap<string, { stockAqui: number; nombre: string }>,
): { lineas: LineaApartar[]; noEntraron: string[] } {
  const lineas: LineaApartar[] = [];
  const noEntraron: string[] = [];
  for (const l of pedidas) {
    const p = disponible.get(l.varianteId);
    if (!p) continue;
    const cantidad = Math.min(l.cantidad, p.stockAqui);
    if (cantidad > 0) lineas.push({ varianteId: l.varianteId, cantidad });
    if (cantidad < l.cantidad) noEntraron.push(p.nombre);
  }
  return { lineas, noEntraron };
}
