/**
 * «Apartar» desde el ticket del Punto de venta (spike 2026-09-26, hallazgo 5): las prendas ya elegidas viajan a
 * Apartados en la dirección (`/vender/apartados?prendas=<id>:<cant>,…`) en vez de buscarlas otra vez. Apartados sigue
 * siendo quien cobra el adelanto y separa el stock (ADR-0166): esto solo le dice con qué prendas arrancar.
 *
 * Nada del dinero viaja por aquí: ni precios ni descuentos. Apartados los vuelve a leer del catálogo de hoy.
 */
export type LineaApartar = { varianteId: string; cantidad: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un ticket de mostrador no pasa de esto; más es una dirección armada a mano. */
const TOPE_LINEAS = 30;

export function hrefApartarDesdeTicket(lineas: readonly LineaApartar[]): string {
  const juntas = new Map<string, number>();
  for (const l of lineas) juntas.set(l.varianteId, (juntas.get(l.varianteId) ?? 0) + l.cantidad);
  const valor = [...juntas].map(([id, c]) => `${id}:${c}`).join(",");
  return `/vender/apartados?prendas=${encodeURIComponent(valor)}`;
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
