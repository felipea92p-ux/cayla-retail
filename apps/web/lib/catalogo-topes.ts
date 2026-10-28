// Los topes de los nombres del catálogo (ADR-0405, /chaos 2026-10-14). La base los hace cumplir con `<tabla>_textos_con_tope`
// (20261014182000); la pantalla corta antes con `maxLength` para que nadie llegue a ese rechazo. Una sola definición: la prueba
// `catalogo-topes.test.ts` exige que coincidan con la migración. En producción, lo más largo guardado medía 38 (producto), 128
// (descripción), 43 (marca) y 22 (categoría) letras el 2026-10-14.

/** El nombre de un producto (el mismo tope del modelo nuevo de Producción, `MAX_NOMBRE_MODELO`). */
export const MAX_NOMBRE_PRODUCTO = 80;
export const MAX_DESCRIPCION_PRODUCTO = 500;
export const MAX_NOMBRE_MARCA = 80;
/** Categorías, colores y familias (80: una migración vieja, 20260927200000, escribe un nombre de categoría de 73 letras). */
export const MAX_NOMBRE_CATALOGO = 80;

// El precio y el costo de una prenda (ADR-0415, Felipe 2026-10-15: «aplica tus recomendaciones»). La base los hace cumplir con
// `<tabla>_precio_con_tope` (20261015152000). En producción la prenda más cara costaba S/ 169.90 el 2026-10-15: S/ 5 000 frena el punto
// que falta («5990» por «59.90») sin estorbar nada real.
export const MAX_PRECIO_PRENDA = 5000;
export const FRASE_PRECIO_CON_TOPE = "El precio pasa de S/\u00a05000: revisa que no falte el punto (59.90, no 5990).";
export const FRASE_COSTO_CON_TOPE = "El costo pasa de S/\u00a05000: revisa que no falte el punto (59.90, no 5990).";
