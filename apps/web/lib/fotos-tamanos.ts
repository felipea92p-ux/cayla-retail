// El tamaño en que se DIBUJA la foto de una prenda en cada pantalla. Viven juntos porque cada uno se usa en dos lugares: donde se pinta
// (`<ImagenDePrenda sizes=…>`) y donde se adelanta (`precargarMiniaturas`/`precargarFotoFija`, al pasar el mouse por la tarjeta que abre esa
// pantalla). Si los dos no dicen EXACTAMENTE lo mismo, el navegador pide dos versiones distintas y la precarga no sirve de nada.

/** La foto de la tarjeta de Vender (grilla de prendas). */
export const SIZES_TARJETA_VENDER = "(min-width: 1280px) 20vw, 45vw";
/** La foto de la hoja «Opciones de la prenda» de Vender. */
export const SIZES_OPCIONES_VENDER = "(min-width: 640px) 240px, 96px";
/** La foto de la tarjeta de Catálogo ▸ Productos. */
export const SIZES_TARJETA_PRODUCTOS = "(min-width: 1024px) 25vw, 50vw";
/** La foto de la vista rápida de producto y de la hoja del modelo de Producción (260 px, 520 en retina). */
export const SIZES_VISTA_RAPIDA = "260px";
/** La miniatura de la tarjeta de Existencias. */
export const SIZES_MINIATURA_EXISTENCIAS = "40px";
/** La foto del panel de talla de Existencias (ancho y alto fijos, no `fill`): su caja es de 17 rem (272 px) en 3:4, y con esas medidas
 *  reales, tanto la pantalla normal como la retina piden el ancho de 640 (antes, con 408 × 544, la retina pedía el de 1080). */
export const FOTO_PANEL_TALLA = { width: 272, height: 363 } as const;
