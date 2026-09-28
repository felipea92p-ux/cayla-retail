// Buscador de Catálogo ▸ Atributos ▸ Colores/Tejidos/Patrones — sin tildes ni mayúsculas, mismo criterio que
// `filtrarMarcas` (lib/marcas.ts) y `buscarCategorias` (lib/categorias-reglas.ts). Faltaba: con 30+ colores y un
// vocabulario de tejidos y patrones que crece con cada censo, las tres pestañas mostraban toda la grilla sin
// forma de filtrar (Felipe, 2026-09-28 — el pie de «Sinónimos» en ColoresLista ya decía «el buscador los
// entiende» sin que existiera ninguno).

import { sinTildes } from "./marcas";

type ColorBuscable = { nombre: string; codigo: string; sinonimos: readonly string[] };

/** Por nombre, código de 3 letras o sinónimo («plomo» encuentra Gris). Sin texto, todos. */
export function filtrarColores<T extends ColorBuscable>(filas: readonly T[], consulta: string): T[] {
  const q = sinTildes(consulta);
  if (!q) return filas as T[];
  return filas.filter((c) => sinTildes(c.nombre).includes(q) || sinTildes(c.codigo).includes(q) || c.sinonimos.some((s) => sinTildes(s).includes(q)));
}

type NombreBuscable = { nombre: string };

/** Tejidos y patrones: vocabulario de un solo campo, se busca por nombre. Sin texto, todos. */
export function filtrarPorNombre<T extends NombreBuscable>(filas: readonly T[], consulta: string): T[] {
  const q = sinTildes(consulta);
  if (!q) return filas as T[];
  return filas.filter((f) => sinTildes(f.nombre).includes(q));
}

// ---- «En uso · Sin prendas»: las píldoras de Tejidos y Patrones (ADR-0261) ---------------------------------------------

/**
 * Tejidos y Patrones no tienen familias como Colores ni tipos como Tallas; lo que sí sirve partir es si alguna prenda los
 * usa: «Sin prendas» es la lista de los que se pueden desactivar sin tocar nada, y la que dice qué se creó y nunca se
 * usó. Cuenta productos activos y descontinuados (lo mismo que dice cada tarjeta): uno descontinuado sigue siendo
 * historia de ese tejido.
 */
export type UsoAtributo = "en-uso" | "sin-prendas";
export const ORDEN_USO: readonly UsoAtributo[] = ["en-uso", "sin-prendas"];
export const GRUPOS_USO: Record<UsoAtributo, { grupo: string; punto: string }> = {
  "en-uso": { grupo: "En uso", punto: "bg-verde" },
  "sin-prendas": { grupo: "Sin prendas", punto: "bg-tinta/25" },
};

export function usoDe(id: string, prendasPorId: Readonly<Record<string, number>>): UsoAtributo {
  return (prendasPorId[id] ?? 0) > 0 ? "en-uso" : "sin-prendas";
}
