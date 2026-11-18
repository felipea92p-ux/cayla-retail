import { z } from "zod";

// Cuánto hay en cada tienda, como lo ve el cliente (ADR-0408, DECIDÍ 6; maqueta v4, `nivel`, `notaStock` y `tablaStock`). La base
// manda un NIVEL, nunca la cifra: "hay" (más que el umbral de Configuración ▸ Tienda web, 3 por defecto) o un número de 0 al umbral
// (1 = «Última», 0 = no hay). Aquí se convierte en palabras. Un número mayor que 3 no se acepta ni aunque llegara: la cifra de 4 o más
// no se muestra nunca. Lógica pura, con su prueba al lado.

export const esquemaNivel = z.union([z.literal("hay"), z.number().int().min(0).max(3)]);
export type Nivel = z.infer<typeof esquemaNivel>;

/** El nivel de un modelo (todas sus tallas y colores) en cada tienda de la web (por id) y en todas juntas. */
export const esquemaStockModelo = z.object({ total: esquemaNivel, sedes: z.record(z.string(), esquemaNivel) });
export type StockModelo = z.infer<typeof esquemaStockModelo>;

/** ¿Hay al menos una? */
export const hayAlgo = (n: Nivel | undefined): boolean => n === "hay" || (typeof n === "number" && n > 0);

/** Lo que dice la celda: «Hay», «3», «2», «Última» o «—». */
/** Lo que hay, dicho como frase para una sola tienda («Última en Arequipa»). */
export function fraseDeNivel(n: Nivel): string {
  if (n === "hay") return "Hay";
  if (n === 0) return "Agotada";
  return n === 1 ? "Última" : `Quedan ${n}`;
}

export function textoNivel(n: Nivel): string {
  if (n === "hay") return "Hay";
  if (n <= 0) return "—";
  return n === 1 ? "Última" : String(n);
}

/** El color de la celda: verde si hay, rojo profundo si quedan pocas, tenue si no hay. */
export const tonoNivel = (n: Nivel): "hay" | "poco" | "cero" => (n === "hay" ? "hay" : n > 0 ? "poco" : "cero");

export type Tienda = { id: string; nombre: string };
export type NotaStock = { texto: string; tono: "ok" | "poco" | "no" };

/** «Lima», «Lima y Trujillo», «Arequipa, Lima y Trujillo». */
const listaDeTiendas = (tiendas: readonly Tienda[]): string => {
  const nombres = tiendas.map((t) => t.nombre);
  return nombres.length < 2 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
};

/**
 * La nota de la tarjeta: siempre dice si hay, y no repite la tienda que el cliente ya eligió (Felipe 2026-11-05, ADR-0612).
 * Con una tienda elegida: «Disponible», «Quedan 2» o «Última»; si ahí no hay, dónde sí («Hay en Trujillo»), o «No hay por ahora».
 * Con «Todas»: «Solo en Trujillo» si una sola tienda tiene, «Quedan pocas» si entre todas no pasan del umbral, «No hay por ahora» si
 * ninguna tiene; si hay de sobra, en cuáles («Hay en Lima y Trujillo», «En todas las tiendas»). Sin tiendas en la web (o sin dato),
 * nada: no se afirma lo que no se sabe.
 */
export function notaDeStock(stock: StockModelo | null, elegida: Tienda | null, tiendas: readonly Tienda[]): NotaStock | null {
  if (!stock || tiendas.length === 0) return null;
  if (elegida) {
    const n = stock.sedes[elegida.id] ?? 0;
    if (n === "hay") return { texto: "Disponible", tono: "ok" };
    if (n > 0) return { texto: n === 1 ? "Última" : `Quedan ${n}`, tono: "poco" };
    const otras = tiendas.filter((t) => t.id !== elegida.id && hayAlgo(stock.sedes[t.id]));
    return { texto: otras.length ? `Hay en ${listaDeTiendas(otras)}` : "No hay por ahora", tono: "no" };
  }
  const con = tiendas.filter((t) => hayAlgo(stock.sedes[t.id]));
  if (con.length === 0) return { texto: "No hay por ahora", tono: "no" };
  if (con.length === 1 && tiendas.length > 1) return { texto: `Solo en ${con[0].nombre}`, tono: "poco" };
  if (stock.total !== "hay") return { texto: "Quedan pocas", tono: "poco" };
  if (tiendas.length === 1) return { texto: "Disponible", tono: "ok" };
  return { texto: con.length === tiendas.length ? "En todas las tiendas" : `Hay en ${listaDeTiendas(con)}`, tono: "ok" };
}

/** ¿El modelo tiene algo en la tienda elegida? Con «Todas», o sin dato del stock, sí: no se esconde lo que no se sabe. */
export const hayEnTienda = (stock: StockModelo | null, tiendaId: string | null): boolean =>
  !tiendaId || !stock || hayAlgo(stock.sedes[tiendaId]);
