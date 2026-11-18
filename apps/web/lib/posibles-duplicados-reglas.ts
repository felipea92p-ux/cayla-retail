// Fichas que parecen repetidas (ADR-0650): lo que la pantalla y el servidor comparten, sin la base. La lectura vive en
// `posibles-duplicados.ts` (servidor); un componente cliente importa solo este archivo.

/** Un par de fichas activas que parecen la misma prenda (ADR-0650, `fn_productos_posibles_duplicados`). */
export type ParDuplicado = {
  productoA: string;
  referenciaA: string;
  productoB: string;
  referenciaB: string;
  /** Por qué se parecen: el mismo nombre en otra marca, una letra de diferencia, o muy parecido en la misma marca y categoría. */
  motivo: "mismo_nombre" | "una_letra" | "parecido";
};

/** Lo que la persona lee en cada par: el porqué, en palabras de tienda. */
export const MOTIVO_DUPLICADO: Record<ParDuplicado["motivo"], string> = {
  mismo_nombre: "Mismo nombre, otra marca",
  una_letra: "Una letra de diferencia",
  parecido: "Nombre muy parecido",
};
