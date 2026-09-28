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
