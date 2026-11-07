import { diaCorto, type CostoPrenda } from "./costo-prenda-reglas";
import { soles } from "./historial-prenda-reglas";
import { numeroDeMonto } from "./monto-plata-reglas";
import { costoEfectivo, type FilaFicha } from "./variantes-ficha-reglas";

// Catálogo ▸ Editar producto ▸ Costos (ADR-0631, Felipe 2026-11-07). El costo se lleva por TALLA (cada variante tiene su promedio
// ponderado), y eso confundía: el 7-nov llegó 1 Short Sohanna de cada color a S/ 48 y la tabla mostró 48, 46.50 y 48, con las demás
// tallas en 45. Esta lógica dice, en palabras de tienda, tres cosas: cuánto cuesta hoy cada prenda (la misma cifra del Historial ▸
// Costo), por qué una talla gris tiene el costo que tiene (su última compra) y qué tallas todavía no llegan por compra. Pura: la
// usan la página y la tabla de la ficha.

export type OrigenEntrada = "compra" | "produccion";

/** La última compra (o cierre del Taller) que movió el costo de una talla, como la devuelve `fn_costo_de_las_tallas`. */
export type CuentaTalla = {
  fecha: string;
  origen: OrigenEntrada;
  /** Cuántas había de esa talla justo antes. */
  habia: number;
  /** A cuánto estaban las que había. `null` si no se sabe. */
  costoHabia: number | null;
  llegaron: number;
  /** El costo promedio de lo que llegó (dos facturas de la misma compra se juntan). */
  costoLlegaron: number;
  /** En cuánto quedó el costo de la talla. */
  quedo: number;
};

/** El costo de la prenda entera, para la línea sobre la tabla. Sale de `fn_costo_de_la_prenda`: es lo mismo que dice el Historial. */
export type ResumenCostoPrenda = {
  /** Cuánto cuesta hoy cada prenda: el promedio de lo que hay en stock, en todas las sedes. `null` si no queda ninguna. */
  hoy: number | null;
  stock: number;
  /** La última compra o cierre del Taller: el costo promedio de lo que llegó. */
  ultima: { costo: number; fecha: string; origen: OrigenEntrada };
};

/** Lo que la ficha sabe del costo, más allá de la celda. Cada parte es `null` si no se pudo leer o la cuenta no ve el dinero. */
export type CostoEnLaFicha = {
  prenda: ResumenCostoPrenda | null;
  /** Por id de variante; una variante sin compras no está. */
  tallas: Record<string, CuentaTalla> | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Lo que devolvió `fn_costo_de_las_tallas`, ya con forma. `null` si no vino nada (sin permiso de dinero, o la base sin la función). */
export function leerCostoDeLasTallas(json: unknown): Record<string, CuentaTalla> | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const salida: Record<string, CuentaTalla> = {};
  for (const [id, x] of Object.entries(json as Record<string, unknown>)) {
    const c = (x ?? {}) as Record<string, unknown>;
    const habia = num(c.habia), llegaron = num(c.llegaron), costoLlegaron = num(c.costo_llegaron), quedo = num(c.quedo);
    const fecha = typeof c.fecha === "string" ? c.fecha : null;
    if (habia === null || llegaron === null || llegaron <= 0 || costoLlegaron === null || quedo === null || !fecha) continue;
    salida[id] = {
      fecha,
      origen: c.origen === "produccion" ? "produccion" : "compra",
      habia,
      costoHabia: num(c.costo_habia),
      llegaron,
      costoLlegaron,
      quedo,
    };
  }
  return salida;
}

/** La línea sobre la tabla necesita al menos una compra: una prenda que nunca entró por Compras ni por el Taller no la lleva. */
export function resumenCostoPrenda(c: CostoPrenda | null): ResumenCostoPrenda | null {
  const ultima = c?.compras.at(-1);
  if (!c || !ultima) return null;
  return {
    hoy: c.hoy.stock > 0 ? c.hoy.costo : null,
    stock: c.hoy.stock,
    ultima: { costo: ultima.costoLlegaron, fecha: ultima.fecha, origen: ultima.origen },
  };
}

/** «última compra S/ 48.00 el 7 nov» o «último cierre del Taller S/ 35.00 el 3 nov». */
function textoUltima(u: ResumenCostoPrenda["ultima"]): string {
  return `${u.origen === "produccion" ? "último cierre del Taller" : "última compra"} ${soles(u.costo)} el ${diaCorto(u.fecha)}`;
}

/** La línea sobre la tabla: la cifra (`null` si no queda ninguna en stock) y lo que la explica. */
export function fraseCostoPrenda(r: ResumenCostoPrenda): { cifra: string | null; detalle: string } {
  const ultima = textoUltima(r.ultima);
  if (r.hoy === null || r.stock <= 0) return { cifra: null, detalle: `No te queda ninguna en stock · ${ultima}` };
  const cuantas = r.stock === 1 ? "es la única que tienes" : `promedio de las ${r.stock} que tienes`;
  return { cifra: soles(r.hoy), detalle: `${cuantas} · ${ultima}` };
}

function verbo(origen: OrigenEntrada, n: number): string {
  if (origen === "produccion") return n === 1 ? "salió 1 del Taller" : `salieron ${n} del Taller`;
  return n === 1 ? "llegó 1" : `llegaron ${n}`;
}

/**
 * El «?» de una talla gris: «Había 1 a S/ 45.00 y llegó 1 el 7 nov a S/ 48.00: el promedio de las 2 es S/ 46.50.». `null` si no hay
 * cuenta, o si la cuenta no termina en el costo que muestra la celda (algo lo movió después): entonces no se afirma una cuenta que
 * no da, y la celda dice el porqué en palabras.
 */
export function cuentaDeLaTalla(c: CuentaTalla | undefined, costoHoy: number): string | null {
  if (!c || !Number.isFinite(costoHoy) || Math.abs(c.quedo - costoHoy) >= 0.005) return null;
  const llego = `${verbo(c.origen, c.llegaron)} el ${diaCorto(c.fecha)} a ${soles(c.costoLlegaron)}`;
  if (c.habia <= 0 || c.costoHabia === null) {
    return `${llego.charAt(0).toUpperCase()}${llego.slice(1)} y no quedaba ninguna de antes: ese es su costo.`;
  }
  return `Había ${c.habia} a ${soles(c.costoHabia)} y ${llego}: el promedio de las ${c.habia + c.llegaron} es ${soles(c.quedo)}.`;
}

/**
 * «Usar S/ 48.00, el de la última compra»: las tallas activas que todavía no llegan por compra (su costo se escribió a mano) y tienen
 * otro costo. Lo que hace el botón es «Cambiar el costo de Todas a S/ 48.00»: las tallas grises no se tocan. `null` si no hay ninguna,
 * o si la última compra fue sin costo (un obsequio de S/ 0 no es el costo de la prenda).
 */
export function sugerenciaDeCosto(
  filas: readonly FilaFicha[],
  ultima: ResumenCostoPrenda["ultima"] | null | undefined,
): { monto: string; cuantas: number; texto: string; boton: string } | null {
  if (!ultima || !(ultima.costo > 0)) return null;
  const centimos = Math.round(ultima.costo * 100);
  const cuantas = filas.filter((f) => f.activo && !f.costoFijo && Math.round(numeroDeMonto(costoEfectivo(f)) * 100) !== centimos).length;
  if (cuantas === 0) return null;
  return {
    monto: ultima.costo.toFixed(2),
    cuantas,
    texto:
      cuantas === 1
        ? "1 talla aún no llega por compra: su costo es el que se escribió a mano."
        : `${cuantas} tallas aún no llegan por compra: su costo es el que se escribió a mano.`,
    boton: `Usar ${soles(ultima.costo)}, el ${ultima.origen === "produccion" ? "del último cierre del Taller" : "de la última compra"}`,
  };
}
