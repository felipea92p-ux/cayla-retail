/* ====================================================================
   Los atajos de filtro de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`)

   Una fila de botones justo bajo el buscador —Todo · Por colgar · Sin stock atrás · Apartadas · Dañadas y, aparte, los «Recomendados» Se acaban · Sin ventas— para lo que más se
   pregunta en el piso, sin abrir el panel «Filtros». NO es un filtro nuevo: cada botón escribe en la URL los mismos filtros que el
   panel («Hoy» y «Condición»), así que el panel, la píldora, el chip de lo puesto, el enlace copiado y el conteo dicen siempre lo
   mismo. Los nombres son los de esas píldoras (`TEXTO_HOY`), no unos propios: un botón que dice «Por reponer» junto a una píldora
   que dice «Por colgar» serían dos nombres para la misma cosa.

   Un atajo es una sola elección (como en la maqueta): elegir uno quita el «Hoy» y la «Condición» que hubiera, y la fila solo
   marca un botón cuando lo puesto es EXACTAMENTE uno de ellos. Con «Mantener» elegido en el panel, o con un «Hoy» y una «Condición»
   a la vez, ningún botón se enciende (ni «Todo»): no se afirma lo que no es.
   ==================================================================== */

import { TEXTO_HOY } from "./existencias-hoy";
import type { ClaveUrl, ConteosFiltros, FiltrosElegidos } from "./existencias-filtros";

export const CLAVES_RAPIDAS = ["todo", "por_colgar", "sin_stock_atras", "apartadas", "danadas", "se_acaban", "sin_ventas"] as const;
export type ClaveRapida = (typeof CLAVES_RAPIDAS)[number];

export type AtajoRapido = {
  clave: ClaveRapida;
  texto: string;
  /** Lo que dice al pasar el mouse sobre el icono (y su etiqueta para el lector de pantalla), con una frase del piso. */
  ayuda: string;
  /** Lo que escribe en la URL: siempre las dos claves, para que elegir uno quite lo del otro. */
  cambios: Partial<Record<ClaveUrl, string | null>>;
};

export const ATAJOS_RAPIDOS: readonly AtajoRapido[] = [
  { clave: "todo", texto: "Todo", ayuda: "Todas las prendas, sin atajo", cambios: { hoy: null, condicion: null } },
  { clave: "por_colgar", texto: TEXTO_HOY.por_colgar, ayuda: "Hay en el almacén y ninguna colgada", cambios: { hoy: "por_colgar", condicion: null } },
  { clave: "sin_stock_atras", texto: TEXTO_HOY.sin_stock_atras, ayuda: "Falta en el piso y el almacén está vacío", cambios: { hoy: "sin_stock_atras", condicion: null } },
  { clave: "apartadas", texto: "Apartadas", ayuda: "Separadas para un cliente", cambios: { hoy: null, condicion: "apartadas" } },
  { clave: "danadas", texto: "Dañadas", ayuda: "En cuarentena: no se pueden vender", cambios: { hoy: null, condicion: "danadas" } },
  // Los dos «Recomendados» de la maqueta: salen del Ritmo reciente (`existencias-ritmo.ts`), solo en tiendas con ritmo medido.
  { clave: "se_acaban", texto: "Se acaban", ayuda: "Lo que hay colgado dura una semana o menos al ritmo de ventas", cambios: { hoy: null, condicion: "se_acaban" } },
  { clave: "sin_ventas", texto: "Sin ventas", ayuda: "Colgadas y sin ninguna venta esta semana", cambios: { hoy: null, condicion: "sin_ventas" } },
];

/** Los que van aparte, bajo el rótulo «Recomendados» (la maqueta): salen del ritmo y no de lo que hay que hacer con la talla. */
export const CLAVES_RECOMENDADAS: readonly ClaveRapida[] = ["se_acaban", "sin_ventas"];

/** Qué botón está encendido, o `null` si lo puesto no es exactamente uno de ellos. */
export function atajoElegido(e: Pick<FiltrosElegidos, "hoy" | "condicion">): ClaveRapida | null {
  if (!e.hoy && !e.condicion) return "todo";
  if (e.hoy === "por_colgar" && !e.condicion) return "por_colgar";
  if (e.hoy === "sin_stock_atras" && !e.condicion) return "sin_stock_atras";
  if (!e.hoy && e.condicion === "apartadas") return "apartadas";
  if (!e.hoy && e.condicion === "danadas") return "danadas";
  if (!e.hoy && e.condicion === "se_acaban") return "se_acaban";
  if (!e.hoy && e.condicion === "sin_ventas") return "sin_ventas";
  return null;
}

/** Cuántas tarjetas trae cada botón (con los demás filtros puestos, la misma cuenta de la píldora). «Todo» no lleva cifra. */
export function cuentaDeAtajo(clave: ClaveRapida, conteos: Pick<ConteosFiltros, "hoy" | "condicion">): number | null {
  switch (clave) {
    case "todo":
      return null;
    case "por_colgar":
      return conteos.hoy.por_colgar ?? 0;
    case "sin_stock_atras":
      return conteos.hoy.sin_stock_atras ?? 0;
    case "apartadas":
      return conteos.condicion.apartadas ?? 0;
    case "danadas":
      return conteos.condicion.danadas ?? 0;
    case "se_acaban":
      return conteos.condicion.se_acaban ?? 0;
    case "sin_ventas":
      return conteos.condicion.sin_ventas ?? 0;
  }
}

/** El texto de un botón con su cifra, para el `title` y el lector de pantalla: «Por colgar · 13». */
export function rotuloDeAtajo(a: AtajoRapido, cuenta: number | null): string {
  return cuenta === null ? a.texto : `${a.texto} · ${cuenta.toLocaleString("es-PE")}`;
}
