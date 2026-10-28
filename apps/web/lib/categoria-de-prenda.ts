/**
 * La categoría de una prenda, tal como la necesita su miniatura cuando no hay foto (`SinFoto`, ADR-0333).
 *
 * CONTRATO. Promete: dada una fila de prenda (la de Existencias, Conteo, el catálogo…) devuelve `{ prefijo, familia, categoria }`
 * —el prefijo decide el ícono (`categorias.prefijo`, nunca el nombre visible, que se renombra), la familia decide el tono
 * cuando la prenda no tiene color, y `categoria` es el nombre que se escribe debajo en cajas grandes—. Una fila que no trae
 * estos datos, o ninguna fila (`null`), devuelve todo `undefined`: la miniatura dibuja la percha, nunca se cae. Asume: nada.
 * No hace: leer la base ni decidir qué ícono toca (eso es `lib/icono-categoria-reglas.ts`).
 */
export type CategoriaDePrenda = { prefijo?: string | null; familia?: string | null; categoria?: string | null };

/** Los nombres de la categoría que usan las filas del ERP (`FilaStock`, `PrendaConteo`, `VarianteCatalogo`…). */
export type FilaConCategoria = { categoria?: string | null; categoriaPrefijo?: string | null; categoriaFamilia?: string | null };

export function categoriaDe(fila: FilaConCategoria | null | undefined): CategoriaDePrenda {
  return { prefijo: fila?.categoriaPrefijo, familia: fila?.categoriaFamilia, categoria: fila?.categoria };
}
