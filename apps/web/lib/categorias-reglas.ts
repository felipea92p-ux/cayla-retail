import { sinTildes } from "./marcas";

/** Lo mínimo de una categoría que el buscador de /productos/categorias necesita. */
export type CategoriaBuscable = { id: string; nombre: string; prefijo: string | null; categoriaPadreId: string | null };

/**
 * Qué categorías responden a lo que se escribió en el buscador de Categorías, por nombre o prefijo (BLU), sin tildes
 * ni mayúsculas. Devuelve `null` si no se busca nada (se ve todo).
 *
 * Las subcategorías no tienen tarjeta propia: viven dentro de la de su padre. Por eso, si «largos» encuentra
 * «Vestidos largos», la que aparece es la tarjeta de Vestidos, y el mapa guarda bajo el id del padre el nombre de la
 * hija que respondió, para que la tarjeta diga por qué salió. Una categoría que responde por sí misma queda con `[]`.
 */
export function buscarCategorias<T extends CategoriaBuscable>(filas: readonly T[], consulta: string): Map<string, string[]> | null {
  const q = sinTildes(consulta);
  if (!q) return null;
  const coinciden = new Map<string, string[]>();
  const responde = (c: T) => sinTildes(c.nombre).includes(q) || (c.prefijo !== null && sinTildes(c.prefijo).includes(q));
  for (const c of filas) {
    if (!responde(c)) continue;
    if (!coinciden.has(c.id)) coinciden.set(c.id, []);
    if (c.categoriaPadreId) {
      const hijas = coinciden.get(c.categoriaPadreId) ?? [];
      coinciden.set(c.categoriaPadreId, [...hijas, c.nombre]);
    }
  }
  return coinciden;
}
