// Los topes de los nombres del catálogo (ADR-0405, /chaos 2026-10-14). La base los hace cumplir con `<tabla>_textos_con_tope`
// (20261014182000); la pantalla corta antes con `maxLength` para que nadie llegue a ese rechazo. Una sola definición: la prueba
// `catalogo-topes.test.ts` exige que coincidan con la migración. En producción, lo más largo guardado medía 38 (producto), 128
// (descripción), 43 (marca) y 22 (categoría) letras el 2026-10-14.

/** El nombre de un producto (el mismo tope del modelo nuevo de Producción, `MAX_NOMBRE_MODELO`). */
export const MAX_NOMBRE_PRODUCTO = 80;
export const MAX_DESCRIPCION_PRODUCTO = 500;
export const MAX_NOMBRE_MARCA = 80;
/** Categorías, colores y familias. */
export const MAX_NOMBRE_CATALOGO = 60;
