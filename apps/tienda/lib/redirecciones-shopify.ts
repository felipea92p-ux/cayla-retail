// Las direcciones de la tienda vieja de Shopify, que vivía en cayla.pe (ADR-0595). Desde que cayla.pe es esta tienda, un enlace viejo
// (Google, Instagram, WhatsApp, un correo) cae aquí: sin esta tabla daría 404 y la persona se iría. Se miden en el mapa del sitio de
// Shopify del 2026-10-31: 51 prendas (/products), 42 colecciones, 25 páginas, 9 blogs y 18 artículos.
//
// DECIDÍ: no se mapea prenda por prenda. Una prenda de Shopify (`/products/chaleco-sastre`) y una del ERP (`/catalogo/<id>`) no
// comparten identificador, y la tienda de Shopify tenía fotos y precios propios que ya no valen: adivinar una prenda equivocada es
// peor que llevar al catálogo. Cada grupo cae en la pantalla de la tienda que cumple el mismo oficio.
//
// Son redirecciones PERMANENTES (308): le dicen a Google que la dirección se mudó y traspasa lo ganado.

export type RedireccionDeShopify = { source: string; destination: string; permanent: true };

const permanente = (source: string, destination: string): RedireccionDeShopify => ({ source, destination, permanent: true });

/** De más específica a más general: Next toma la primera que calza. */
export const REDIRECCIONES_DE_SHOPIFY: RedireccionDeShopify[] = [
  // Páginas con equivalente propio.
  permanente("/pages/ubicacion-cayla", "/tiendas"),
  permanente("/pages/store-locator", "/tiendas"),
  // Lo demás de /pages (guías de talla, preguntas, envíos, valores, contacto…) no existe aquí: a la portada.
  permanente("/pages/:resto*", "/"),
  permanente("/products/:resto*", "/catalogo"),
  permanente("/collections/:resto*", "/catalogo"),
  permanente("/collections", "/catalogo"),
  permanente("/blogs/:resto*", "/"),
  permanente("/search", "/catalogo"),
  // La cuenta y la bolsa.
  permanente("/cart", "/bolsa"),
  permanente("/account/login", "/entrar"),
  permanente("/account/register", "/crear-cuenta"),
  permanente("/account/:resto*", "/cuenta"),
  permanente("/account", "/cuenta"),
  // Las políticas.
  permanente("/policies/privacy-policy", "/privacidad"),
  permanente("/policies/refund-policy", "/cambios-y-devoluciones"),
  permanente("/policies/:resto*", "/"),
];
