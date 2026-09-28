// Reglas puras de «Tejido», «Patrón» y «Tallas» en el paso 3 de «Nuevo producto» (spike producto-nuevo-v2-2026-09).
//
// El problema que resuelven: en producción hay 24 tejidos, 9 patrones y 27 tallas, y una categoría ofrece hasta 10
// tejidos, 8 patrones y 9 tallas. Mostrarlo todo de una vuelve la fila un muro; esconder «lo que no cabe» esconde a
// veces lo que la persona eligió. Aquí vive QUÉ se ve a la vista, cómo se busca en la hoja «Ver todos» y cómo se
// agrupan las tallas: sin React, para poder probarlo (muestras-alta-reglas.test.ts).
//
// CONTRATO
//   PROMETE: lo elegido nunca queda fuera de la vista; buscar ignora tildes y mayúsculas; toda talla cae en un grupo.
//   ASUME:   los ids son únicos dentro de cada lista; `deLaCategoria` ya viene en el orden en que se muestra.
//   NO HACE: no guarda nada ni sabe de la categoría en la base (ofrecer un valor es de `guardarEjesCategoria`).

import { compararTallas, tipoDeTalla } from "./tallas";

type ConId = { id: string };
type ConTexto = { id: string; texto: string };

/** Cuántas muestras de la categoría se ven sin abrir «Ver todos» (la sexta tarjeta es «Ver todos»). */
export const MUESTRAS_A_LA_VISTA = 5;

/** La forma de comparar al buscar: sin tildes, sin mayúsculas, espacios de más colapsados. */
export function claveBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿`texto` contiene lo buscado? Sin búsqueda, todo coincide. */
export function coincideBusqueda(texto: string, busqueda: string): boolean {
  const q = claveBusqueda(busqueda);
  return q === "" || claveBusqueda(texto).includes(q);
}

/**
 * Lo que se ve de una lista larga: las primeras `max` de la categoría, en su orden. Si lo elegido no está entre ellas
 * (vino de más abajo, o del catálogo por «Ver todos»), va PRIMERO y empuja a la última: lo elegido nunca se esconde.
 * `elegido` puede no estar en `lista` (un valor del catálogo recién ofrecido que el padre todavía no sumó).
 */
export function aLaVista<T extends ConId>(lista: T[], elegido: T | null, max = MUESTRAS_A_LA_VISTA): T[] {
  const primeras = lista.slice(0, max);
  if (!elegido || primeras.some((v) => v.id === elegido.id)) return primeras;
  return [elegido, ...lista.filter((v) => v.id !== elegido.id).slice(0, max - 1)];
}

/** Todos los valores sin repetir: los de la categoría primero y luego el resto del catálogo. Da el total de «Ver todos · N». */
export function unirSinRepetir<T extends ConId>(...listas: T[][]): T[] {
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const lista of listas) {
    for (const v of lista) {
      if (vistos.has(v.id)) continue;
      vistos.add(v.id);
      salida.push(v);
    }
  }
  return salida;
}

/**
 * Las dos secciones de la hoja «Ver todos» de tejidos y patrones, ya filtradas por lo buscado:
 * «Los de {categoría}» (en el orden de la categoría) y «Del catálogo» (lo que la categoría todavía no ofrece, de la A a la Z).
 */
export function seccionesMuestras<T extends ConTexto>(deLaCategoria: T[], universo: T[], busqueda: string): { propias: T[]; delCatalogo: T[] } {
  const ofrecidos = new Set(deLaCategoria.map((v) => v.id));
  return {
    propias: deLaCategoria.filter((v) => coincideBusqueda(v.texto, busqueda)),
    delCatalogo: universo
      .filter((v) => !ofrecidos.has(v.id) && coincideBusqueda(v.texto, busqueda))
      .sort((a, b) => a.texto.localeCompare(b.texto, "es")),
  };
}

// ---------------------------------------------------------------------------
// Tallas
// ---------------------------------------------------------------------------

export type GrupoTalla = "Letras" | "Números" | "Otras";

const ORDEN_GRUPOS: GrupoTalla[] = ["Letras", "Números", "Otras"];

/**
 * En qué grupo de la hoja «+ Otra talla» va una talla. Sale de `tipoDeTalla` (lib/tallas.ts), el mismo que ordena la
 * curva y agrupa Atributos ▸ Tallas: «qué grupo es» y «en qué orden va» no pueden contradecirse. Estándar, Única y
 * lo que no se reconoce (una talla nueva rara) van a «Otras»: nunca se pierden.
 */
export function grupoDeTalla(texto: string): GrupoTalla {
  const tipo = tipoDeTalla(texto);
  if (tipo === "letras") return "Letras";
  if (tipo === "numeracion") return "Números";
  return "Otras";
}

/** Las tallas agrupadas (Letras, Números, Otras) y ordenadas como una curva, ya filtradas por lo buscado. Sin grupos vacíos. */
export function agruparTallas<T extends ConTexto>(tallas: T[], busqueda = ""): { grupo: GrupoTalla; tallas: T[] }[] {
  return ORDEN_GRUPOS.map((grupo) => ({
    grupo,
    tallas: tallas
      .filter((t) => grupoDeTalla(t.texto) === grupo && coincideBusqueda(t.texto, busqueda))
      .sort((a, b) => compararTallas(a.texto, b.texto)),
  })).filter((g) => g.tallas.length > 0);
}

/** ¿Lo elegido se apartó de la curva habitual? Sin curva habitual no hay a qué volver. El orden no importa. */
export function curvaCambiada(elegidas: string[], habituales: string[]): boolean {
  if (habituales.length === 0) return false;
  const a = new Set(elegidas);
  const b = new Set(habituales);
  return a.size !== b.size || [...b].some((id) => !a.has(id));
}

/** El rótulo de la curva habitual en «Solo las de siempre (…)»: con más de 3 tallas, el rango primera–última; si no, todas. */
export function textoCurva(textos: string[]): string {
  const orden = [...textos].sort(compararTallas);
  return orden.length > 3 ? `${orden[0]}–${orden[orden.length - 1]}` : orden.join(" ");
}

/** Las de la categoría que todavía no están elegidas (si hay alguna, se ofrece «Todas las tallas»). */
export function faltanDeLaCategoria(elegidas: string[], deLaCategoria: ConId[]): string[] {
  const ya = new Set(elegidas);
  return deLaCategoria.map((t) => t.id).filter((id) => !ya.has(id));
}

/** Las elegidas que la categoría no ofrece: hay que ofrecerlas antes de crear el producto (la base las rechaza si no). */
export function porOfrecer(elegidas: string[], deLaCategoria: ConId[]): string[] {
  const ofrecidas = new Set(deLaCategoria.map((t) => t.id));
  return elegidas.filter((id) => !ofrecidas.has(id));
}

/** Marcar o desmarcar un id en una selección múltiple, sin repetirlo. */
export function alternar(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
