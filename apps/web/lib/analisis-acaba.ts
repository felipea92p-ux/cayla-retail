// Análisis v4 (ADR-0357): la pestaña «Se está acabando», sin React. Qué prendas muestra cada filtro (Todos · Comprar · Por
// llegar) y cuántas tiene cada uno, cómo se dibuja la pista de días (largo, color y texto) y qué dicen sus píldoras y el
// tooltip «Por llegar». Quién se acaba, cuántos días le quedan y qué viene en camino lo deciden las reglas de
// `analisis-reglas.ts`: aquí no nace ninguna regla de negocio, solo cómo se dice y se dibuja (la maqueta aprobada por Felipe,
// 2026-10-06).

import type { LlegadaPrenda, OrigenLlegada, OrigenPrenda, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { DIAS_SE_ACABA, GRUPOS_ACABA, ordenSeAcaba, plural, porLlegar, prendasDe } from "./analisis-reglas";
import { fechaCorta } from "./motor-demanda-reglas";

/** Una semana: hasta aquí los días van en rojo, y es la línea punteada del carril. */
export const UNA_SEMANA = 7;

/** Los filtros de la pestaña: todo lo que se acaba, lo que hay que comprar (nada viene en camino) y lo que ya viene. */
export type FiltroAcaba = "todos" | "comprar" | "llega";

export const FILTROS_ACABA: readonly { clave: FiltroAcaba; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "comprar", texto: "Comprar" },
  { clave: "llega", texto: "Por llegar" },
];

/** Si una prenda que se acaba pasa el filtro: «Comprar» = no viene nada en camino; «Por llegar» = algo ya viene. */
export function pasaFiltroAcaba(p: Pick<PrendaAnalisis, "llega">, filtro: FiltroAcaba): boolean {
  if (filtro === "todos") return true;
  const viene = porLlegar(p) > 0;
  return filtro === "llega" ? viene : !viene;
}

/** Lo que se acaba (grupo «Cómpralas»), de lo más urgente a lo menos: primero lo agotado, a igual plazo lo que más se vende. */
export function prendasQueSeAcaban<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): T[] {
  return [...prendasDe(prendas, GRUPOS_ACABA, liquidarDesde)].sort(ordenSeAcaba);
}

/** Cuántas caen en cada filtro (las tres píldoras): «Comprar» y «Por llegar» se reparten «Todos» sin repetir ninguna. */
export function cuentasFiltroAcaba(seAcaban: readonly Pick<PrendaAnalisis, "llega">[]): Record<FiltroAcaba, number> {
  const llega = seAcaban.filter((p) => porLlegar(p) > 0).length;
  return { todos: seAcaban.length, comprar: seAcaban.length - llega, llega };
}

const semanas = (dias: number): string => {
  const n = Math.round(dias / UNA_SEMANA);
  return `${n} ${plural(n, "semana", "semanas")}`;
};

/** Las marcas del eje sobre las pistas: 0 · 1 semana · 2 semanas (el tope es `DIAS_SE_ACABA`). */
export const EJE_ACABA: readonly { texto: string; left: string }[] = [
  { texto: "0", left: "0%" },
  { texto: semanas(UNA_SEMANA), left: `${(UNA_SEMANA / DIAS_SE_ACABA) * 100}%` },
  { texto: semanas(DIAS_SE_ACABA), left: "100%" },
];

/** Dónde va la línea punteada de una semana en cada pista. */
export const LINEA_SEMANA = `${(UNA_SEMANA / DIAS_SE_ACABA) * 100}%`;

/** El color de los días que quedan: rojo una semana o menos, ámbar hasta dos, taupe más allá (como en la maqueta). */
export function colorDias(dias: number): string {
  if (dias <= UNA_SEMANA) return "var(--color-rojo-profundo)";
  if (dias <= DIAS_SE_ACABA) return "var(--color-ambar)";
  return "var(--color-taupe)";
}

/** Cómo se dibuja la pista de una prenda: agotada (rayada y «Se agotó») o una barra de 0 a 2 semanas con sus días. */
export type PistaAcaba =
  | { agotada: true; texto: string }
  | {
      agotada: false;
      /** El largo de la barra, de 0 a 1 (`--n`). */
      n: number;
      /** El color de la barra (`--c`). */
      color: string;
      texto: string;
      /** Si la barra casi llena la pista, los días se escriben dentro de ella. */
      dentro: boolean;
    };

/** La pista con los días que quedan (`diasQueQuedan`); null si la prenda no tiene ritmo (no se vende: no se acaba). */
export function pistaAcaba(dias: number | null): PistaAcaba | null {
  if (dias === null) return null;
  if (dias <= 0) return { agotada: true, texto: "Se agotó" };
  const n = Math.min(dias / DIAS_SE_ACABA, 1);
  return { agotada: false, n, color: colorDias(dias), texto: `${dias} ${plural(dias, "día", "días")}`, dentro: n > 0.8 };
}

/** De dónde llega cada parte, como se dice en tienda. */
const NOMBRE_LLEGADA: Record<OrigenLlegada, string> = { compra: "Compra", almacen: "Almacén", taller: "Taller", tienda: "Otra tienda" };

/** Una línea del tooltip «Por llegar»: «Compra: 10 · llega el 15 oct.»; «llega hoy»; «debía llegar el …» si la fecha ya pasó. */
export function textoLlegada(x: LlegadaPrenda, hoy: string): string {
  const cuando =
    x.fecha === null ? "sin fecha" : x.fecha === hoy ? "llega hoy" : x.fecha < hoy ? `debía llegar el ${fechaCorta(x.fecha)}` : `llega el ${fechaCorta(x.fecha)}`;
  return `${NOMBRE_LLEGADA[x.de]}: ${x.cantidad} · ${cuando}`;
}

/** Las líneas del tooltip «Por llegar», de lo que llega antes a lo que llega después (lo que no tiene fecha, al final). */
export function lineasPorLlegar(p: Pick<PrendaAnalisis, "llega">, hoy: string): string[] {
  const orden = (f: string | null) => f ?? "9999-12-31";
  return [...p.llega].sort((a, b) => orden(a.fecha).localeCompare(orden(b.fecha))).map((x) => textoLlegada(x, hoy));
}

/** El título del tooltip: «Por llegar: 13». */
export const tituloPorLlegar = (p: Pick<PrendaAnalisis, "llega">): string => `Por llegar: ${porLlegar(p)}`;

/** Si ninguna otra tienda la tiene: a quién se compra («Proveedor taller» / «Proveedor terceros»); null si no se sabe. */
export function textoProveedor(origen: OrigenPrenda | null): string | null {
  if (origen === "taller") return "Proveedor taller";
  if (origen === "terceros") return "Proveedor terceros";
  return null;
}

/** El tooltip de «AQP tiene 3»: el dato y qué hacer con él (decide la persona, decisión 7). */
export const tipOtraTienda = (sede: Pick<SedeAnalisis, "ciudad">, stock: number): string =>
  `${sede.ciudad} tiene ${stock}. Toca la prenda para ver cuánto vende cada tienda y decide si pedirla.`;

/** El botón de texto bajo «Comprar»: «o pedir a Arequipa». */
export const textoPedirA = (sede: Pick<SedeAnalisis, "ciudad">): string => `o pedir a ${sede.ciudad}`;

/** Lo que se dice cuando la pestaña no tiene carril: nada se acaba, o no se pudieron leer las prendas. */
export type VacioAcaba = "nada" | "sin-datos";

/**
 * Sin nada que se acabe en la tienda (sin buscar ni filtrar): «Nada se está acabando». Si no llegó ni una prenda y algo falló al
 * leer, no se dice «va bien» por un error (principio 9): se dice que no se pudo ver. null = hay carril.
 */
export function vacioAcaba(c: { prendas: number; seAcaban: number; fallas: number }): VacioAcaba | null {
  if (c.seAcaban > 0) return null;
  return c.prendas === 0 && c.fallas > 0 ? "sin-datos" : "nada";
}

/** El título y la línea de cada vacío. */
export const TEXTO_VACIO_ACABA: Record<VacioAcaba, { titulo: string; linea: string }> = {
  nada: { titulo: "Nada se está acabando", linea: `Todo lo que se vende te dura más de ${semanas(DIAS_SE_ACABA)}.` },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};
