// Reparto de un comprobante entre tiendas (ADR-0132) — lo que NO toca la base: armar, validar y explicar un
// reparto. La base es la que lo hace cumplir (candado diferido en `compra_item_destinos`, tope por tienda en
// `recibir_compras`); acá solo se evita mandarle algo que ya se sabe que va a rechazar y se le pone palabras a
// cada cifra para quien opera. Vive aparte de `compras.ts` por la misma razón que `compras-reglas.ts`: los
// componentes cliente lo importan y no pueden arrastrar `next/headers`.
//
// Principio de UX que manda en todas las frases de este archivo: el sistema dice LO QUE FALTA, no solo que hay un
// error («Faltan 4 por repartir», no «suma inválida»), y cada número se explica solo («Te toca 12 · Recibidas aquí 4
// · Faltan 8»).

import type { LineaCompra, TiendaEnLinea } from "@/lib/compras-reglas";

/** Lo que una tienda tiene en una línea: cuánto le tocó, cuánto recibió y cuánto cerró como faltante. */
export type CifrasDeTienda = { asignado: number; recibido: number; cerrado: number };

/** El reparto de UNA línea, tal como se arma en pantalla: tienda → unidades. Una tienda en 0 no cuenta. */
export type RepartoLinea = Record<string, number>;

/** Un entero >= 0: lo que se teclea en pantalla puede venir vacío, con decimales o negativo. */
const entero = (n: unknown): number => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
};

/** Cuánto va repartido, cuánto falta y cuánto sobra para que el reparto de una línea sume lo facturado. */
export function estadoDelReparto(cantidad: number, reparto: RepartoLinea) {
  const total = entero(cantidad);
  const asignado = Object.values(reparto).reduce((suma, n) => suma + entero(n), 0);
  return {
    asignado,
    faltan: Math.max(0, total - asignado),
    sobran: Math.max(0, asignado - total),
    cuadra: total > 0 && asignado === total,
  };
}

/** La frase que ve quien reparte, con su tono (verde ✓ cuando cuadra, ámbar si falta, rojo si se pasó). */
export function textoDelReparto(cantidad: number, reparto: RepartoLinea): { tono: "ok" | "falta" | "sobra"; texto: string } {
  const e = estadoDelReparto(cantidad, reparto);
  if (e.cuadra) return { tono: "ok", texto: `Repartidas ${e.asignado} de ${entero(cantidad)}` };
  if (e.sobran > 0) return { tono: "sobra", texto: `Sobran ${e.sobran}` };
  return { tono: "falta", texto: `Faltan ${e.faltan} por repartir` };
}

/**
 * Reparto en partes iguales entre las tiendas dadas. Si no divide exacto, el resto va de a una unidad a las
 * primeras (25 entre 3 → 9 · 8 · 8): así la suma siempre cuadra y el atajo nunca deja algo por repartir.
 */
export function repartirEnPartesIguales(cantidad: number, ubicacionIds: string[]): RepartoLinea {
  const ids = [...new Set(ubicacionIds)];
  const total = entero(cantidad);
  if (ids.length === 0 || total === 0) return {};
  const base = Math.floor(total / ids.length);
  const resto = total % ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < resto ? 1 : 0)]));
}

/** Lo que se manda a `registrar_compra` en `destinos` de cada línea: solo tiendas con unidades, sin decimales. */
export function destinosParaRpc(reparto: RepartoLinea): { ubicacion_id: string; cantidad: number }[] {
  return Object.entries(reparto)
    .map(([ubicacion_id, cantidad]) => ({ ubicacion_id, cantidad: entero(cantidad) }))
    .filter((d) => d.cantidad > 0);
}

// ---------- Lo que ve una tienda ----------

/** Lo que aún le falta a una tienda en una línea: lo que le tocó menos lo que recibió y lo que cerró. */
export function pendienteDeMiTienda(c: CifrasDeTienda): number {
  return Math.max(0, entero(c.asignado) - entero(c.recibido) - entero(c.cerrado));
}

/** El estado de recepción visto desde una tienda (el del comprobante entero mezcla a todas las tiendas). */
export function estadoDeMiTienda(c: CifrasDeTienda): "sin_recibir" | "parcial" | "recibida" {
  if (pendienteDeMiTienda(c) === 0) return "recibida";
  return entero(c.recibido) + entero(c.cerrado) === 0 ? "sin_recibir" : "parcial";
}

/** «Te toca 12 · Recibidas aquí 4 · Faltan 8» (y «· Cerradas 2» si hubo faltante cerrado). */
export function textoTeToca(c: CifrasDeTienda): string {
  const partes = [`Te toca ${entero(c.asignado)}`, `Recibidas aquí ${entero(c.recibido)}`, `Faltan ${pendienteDeMiTienda(c)}`];
  if (entero(c.cerrado) > 0) partes.push(`Cerradas ${entero(c.cerrado)}`);
  return partes.join(" · ");
}

/**
 * Para un líder: cómo va el resto de las tiendas en una línea. Solo cuentan las que aún tienen algo pendiente;
 * si ninguna, se dice que las demás ya recibieron lo suyo.
 */
export function textoOtrasTiendas(otras: TiendaEnLinea[] | undefined): string | null {
  if (!otras || otras.length === 0) return null;
  const faltan = otras.filter((t) => t.pendiente > 0);
  if (faltan.length === 0) return "Las demás tiendas ya recibieron lo suyo";
  return `También falta en ${faltan.map((t) => `${t.nombre}: ${t.pendiente}`).join(" · ")}`;
}

/** «Tienda Trujillo · Taller» — los destinos de un comprobante, con nombre (los ids sin nombre se descartan). */
export function nombresDeDestinos(ubicacionesDestino: string[], nombrePorId: Record<string, string>): string {
  return ubicacionesDestino
    .map((id) => nombrePorId[id])
    .filter(Boolean)
    .join(" · ");
}

/**
 * Lleva a una línea (con los números de TODO el comprobante) los de la tienda desde la que se mira: `cantidad` pasa a
 * ser lo que le toca a ella y `recibido`/`cerrado`/`pendiente` los suyos, así los topes, «Todo llegó» y los totales
 * de la pantalla de recibir funcionan por tienda sin cambiar una línea. Lo facturado en total queda en
 * `cantidadFacturada`. Sin números de tienda (base sin reparto), la línea queda como está.
 */
export function lineaEnMiTienda(linea: LineaCompra, aqui: (CifrasDeTienda & { otrasTiendas?: TiendaEnLinea[] }) | null): LineaCompra {
  if (!aqui) return linea;
  const asignado = entero(aqui.asignado);
  const pendiente = pendienteDeMiTienda(aqui);
  return {
    ...linea,
    cantidadFacturada: linea.cantidad,
    cantidad: asignado,
    recibido: entero(aqui.recibido),
    cerrado: entero(aqui.cerrado),
    pendiente,
    // El subtotal de la línea entera no es el de esta tienda: se recalcula con lo que le toca (0 si no hay costo).
    subtotal: linea.costoUnitario > 0 ? Math.round(linea.costoUnitario * asignado * 100) / 100 : 0,
    asignadoAqui: asignado,
    recibidoAqui: entero(aqui.recibido),
    cerradoAqui: entero(aqui.cerrado),
    pendienteAqui: pendiente,
    otrasTiendas: aqui.otrasTiendas,
  };
}

/** `otras_tiendas` llega como json desde la RPC (solo para un líder): [{ubicacion_id, nombre, asignado, …}]. */
export function otrasTiendasDeJson(json: unknown): TiendaEnLinea[] | undefined {
  if (!Array.isArray(json)) return undefined;
  return json.flatMap((x): TiendaEnLinea[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.ubicacion_id !== "string") return [];
    return [
      {
        ubicacionId: o.ubicacion_id,
        nombre: String(o.nombre ?? ""),
        asignado: entero(o.asignado),
        recibido: entero(o.recibido),
        cerrado: entero(o.cerrado),
        pendiente: entero(o.pendiente),
      },
    ];
  });
}

/**
 * «S/ por llegar» de UNA tienda, para un líder: lo que le falta a ELLA, a su costo y con el IGV del comprobante
 * (mismo criterio que `resumen_compras_extra`: pendiente × costo × total / subtotal). Los indicadores de Recibir son
 * de la tienda desde la que se mira; los de toda la empresa siguen en Compras.
 */
export function valorPorRecibirDeMiTienda(
  compras: { id: string; subtotal: number; total: number }[],
  lineas: { compraId: string; pendiente: number; costoUnitario: number }[]
): number {
  const factor = new Map(compras.map((c) => [c.id, c.subtotal > 0 ? c.total / c.subtotal : 1]));
  const suma = lineas.reduce((s, l) => s + Math.max(0, l.pendiente) * l.costoUnitario * (factor.get(l.compraId) ?? 1), 0);
  return Math.round(suma * 100) / 100;
}

/**
 * Para una línea REPARTIDA entre tiendas: «Te toca 12 de 24 del comprobante» y, para un líder, dónde más falta. `null`
 * si la línea no está repartida (toda es de esta tienda): ahí la pantalla no muestra nada extra y todo se ve como siempre.
 */
export function textoDeLaParte(l: Pick<LineaCompra, "asignadoAqui" | "cantidadFacturada" | "otrasTiendas">): string | null {
  if (l.asignadoAqui == null || l.cantidadFacturada == null || l.cantidadFacturada === l.asignadoAqui) return null;
  const otras = textoOtrasTiendas(l.otrasTiendas);
  return `Te toca ${l.asignadoAqui} de ${l.cantidadFacturada} del comprobante${otras ? ` · ${otras}` : ""}`;
}
