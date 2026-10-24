// Los íconos del MENÚ como DATOS: un solo mapa de trazos, y de ahí quién más los dibuja.
//
// PROMETE: (1) `TRAZOS_MENU`, el trazo de cada `ClaveIcono` del árbol de `lib/menu.ts` (24×24, solo línea, a 1,5 de grosor);
// (2) `iconoDeModulo`, qué ícono del menú le toca a cada módulo del rol, para que Roles y accesos dibuje «Punto de Venta» igual
// que el lateral; (3) `ICONO_DEL_ACCESO`, lo mismo para los accesos rápidos del Inicio. Una pantalla se dibuja IGUAL en el
// lateral, en Roles y accesos y en el Inicio (ADR-0358: una función, una pieza). Sin React: se prueba en `menu-iconos.test.ts`.
// ASUME: que un módulo NUEVO que sale en el menú hereda el ícono de su fila sin hacer nada más (el árbol ya lo declara); solo los
// módulos que no son una entrada del menú, o que reúnen varias, se declaran a mano en `APARTE`.

import type { AccesoDeAlmacen } from "./inicio-almacen-reglas";
import type { ClaveAccesoIcono } from "./inicio-avisos";
import { ARBOL, esGrupo, type ClaveIcono, type Nodo } from "./menu";
import type { ClaveModulo } from "./modulos";

// Criterio del dibujo (refresco retail, Felipe 2026-10-13): cada ícono dice lo que ES esa pantalla en una tienda de ropa —
// polera, percha, etiqueta, carrete, tijera, bolsa, caja registradora— donde el objeto existe y se lee a 18 px, y un dibujo
// sobrio donde no (un candado es un candado). Nada de adorno: una prenda por ícono, como mucho. Dos filas del mismo grupo
// no se parecen entre sí. Los trazos de lucide se pegan en UN `d`; ojo: un subtrazo que arranca con «m» minúscula es
// absoluto si va solo pero RELATIVO al punto anterior si se une a otros — se escribe «M» (y «l» para los pares que siguen).
// Tipado contra `ClaveIcono` (lib/menu.ts): un nodo del árbol que nombre un ícono sin trazo acá no compila.
export const TRAZOS_MENU: Record<ClaveIcono, string> = {
  // Tienda con toldo: Inicio es la puerta de la tienda (refresco retail, 2026-10-13; antes una casa).
  inicio: "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5 M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244 M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05", // lucide «store»
  // Caja registradora: el Punto de Venta es donde se cobra la prenda. Antes un carrito.
  vender: "M7 3h10v5H7z M12 8v3 M3 11h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2z M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01",
  apartados: "M6 3h12v18l-6-4-6 4V3zm3.5 6.5L11 11l3.5-3.5",
  // Moneda: el dinero que hay en la caja de la sede (abrir, cerrar, arquear). La registradora es del Punto de Venta;
  // esta es la plata.
  caja: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8 M12 18V6", // lucide «circle-dollar-sign»
  historial: "M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  // Polera: lo que ES una prenda en el catálogo (2026-09-27) — antes compartía
  // la caja de "inventario" y a simple vista eran el mismo ícono. Un producto
  // es la prenda; el inventario es la caja donde vive.
  productos: "M20.38 3.46 16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z",
  // Cajas apiladas: todo el stock físico de la sede (ADR-0071). Antes un solo cubo.
  inventario: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z M7 16.5l-4.74-2.85 M7 16.5l5-3 M7 16.5v5.17 M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z M17 16.5l-5-3 M17 16.5l4.74-2.85 M17 16.5v5.17 M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z M12 8 7.26 5.15 M12 8l4.74-2.85 M12 13.5V8", // lucide «boxes»
  // Percha: lo que hay AHORA colgado en la sede, contado (2026-09-27) — ya no
  // la caja de "inventario", que es el módulo entero, no una pantalla.
  existencias: "M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4",
  movimientos: "M3 7h13m0 0l-4-4m4 4l-4 4M21 17H8m0 0l4 4m-4-4l4-4",
  // Camión: la prenda que viaja de una sede a otra. Antes una flecha suelta; el camión era de «Proveedores», que ahora
  // tiene su fábrica.
  traslados: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2 M15 18H9 M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14 M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", // lucide «truck»
  colaboradores: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  conteo: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  // Cuatro recuadros: la foto completa de una sede de un vistazo — solo del
  // Resumen de Producción desde 2026-09-27; Análisis y el Resumen de Finanzas
  // tienen cada uno el suyo, para no leerse como la misma pantalla.
  resumen: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  // Boleta de mostrador: el comprobante que se le entrega al cliente (Ventas ▸ Comprobantes). Antes una hoja con
  // líneas, casi igual a la de «Facturas de proveedor».
  facturacion: "M13 16H8 M14 8H8 M16 12H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z", // lucide «receipt-text»
  // Carrito: reponer mercadería comprándole a un proveedor (2026-10-13; antes una bolsa con un «+», que se parecía a
  // la de «Ventas»). Mismo trazo para «Abastecimiento» (Producción): es el mismo concepto de comprarle a un proveedor,
  // aplicado al Taller en vez de a la tienda; nunca salen a la vez (D-84).
  compras: "M7 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M18 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12", // lucide «shopping-cart»
  // Carrete de hilo, de perfil: la materia prima del Taller (tela y avíos) — Insumos, hija de Producción. Antes dos
  // barras con rayas.
  insumos: "M7 3h10a1 1 0 011 1v1.5a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z M7 17.5h10a1 1 0 011 1V20a1 1 0 01-1 1H7a1 1 0 01-1-1v-1.5a1 1 0 011-1z M8 6.5v11M16 6.5v11 M8 10l8 2M8 13l8 2",
  produccion: "M6 9a3 3 0 100-6 3 3 0 000 6zm0 12a3 3 0 100-6 3 3 0 000 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12",
  // Lista con viñetas: la cola de órdenes de fabricación (2026-09-27) — antes
  // compartía el trazo de "Producción" (la cabecera) con su propia hija.
  ordenes: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  // Flechas verticales (no las horizontales de "movimientos", para no leerse
  // como el mismo ícono con otro nombre): cambiar una talla por otra.
  cambios: "M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l4 4m-4-4l-4 4",
  // La bolsa de «Ventas» con una flecha que vuelve: lo que pasa DESPUÉS de la venta en conjunto (cambio o devolución).
  // Antes tomaba el trazo de «Cambios», su propia hija.
  posventa: "M3.4 5.467a2 2 0 00-.4 1.2V20a2 2 0 002 2h14a2 2 0 002-2V6.667a2 2 0 00-.4-1.2l-2-2.667A2 2 0 0017 2H7a2 2 0 00-1.6.8z M3.1 6h17.8 M10.5 10.5l-2.2 2.2 2.2 2.2 M8.3 12.7h5.2a2.5 2.5 0 010 5H11",
  // Flecha en U: la prenda vuelve.
  devoluciones: "M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-4",
  // Bolsa de compras de boutique, con su asa: la cabecera «Ventas». El carrito ya no es de acá: una boutique no cobra
  // con carrito, y ahora es de «Compras» (2026-10-13).
  venta: "M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z", // lucide «shopping-bag»
  // Libro abierto: el catálogo, el «lookbook» donde vive qué ES cada prenda y el vocabulario del que cuelga. Antes
  // capas apiladas.
  catalogo: "M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z", // lucide «book-open»
  // Etiqueta colgante: el vocabulario que clasifica una prenda.
  categorias: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z",
  // Cinta con cola de golondrina y su estrella: la etiqueta de la marca, la que va cosida en el cuello de la prenda (dice
  // de quién es; no la colgante de «categorias», que clasifica). Antes un rectángulo con dos rayas.
  marcas: "M3 6h18l-2.6 6L21 18H3l2.6-6z M12 9.3l.9 1.85 2.05.3-1.5 1.45.36 2.05L12 14l-1.8.95.36-2.05-1.5-1.45 2.05-.3z",
  // Cuaderno de muestras: color, talla, tejido, patrón y etiqueta de una prenda viven acá como pestañas de una sola
  // pantalla (2026-09-17, consolidación de Catálogo). Antes tres recuadros, parecidos a «Resumen».
  atributos: "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7 M 7 17h.01 M11 8l2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8", // lucide «swatch-book»
  // Fábrica: de dónde viene la mercadería —o la tela y los avíos, en Producción—. Antes un camión; el camión ahora es
  // de «Traslados».
  proveedores: "M12 16h.01 M16 16h.01 M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z M8 16h.01", // lucide «factory»
  // Hoja con líneas: el documento de la factura.
  facturas: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  // Caja con su visto bueno: la mercadería que llegó y se verifica. Antes una bandeja de entrada.
  recibir: "M12 22V12 M16 17l2 2 4-4 M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753 M3.29 7 12 12l8.71-5 M7.5 4.27l8.997 5.148", // lucide «package-check»
  // Calendario con reloj: lo que todavía no se pagó, contra su fecha de vencimiento. Antes un reloj suelto, igual al
  // de «Historial».
  porPagar: "M16 14v2.2l1.6 1 M16 2v4 M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5 M3 10h5 M8 2v4 M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", // lucide «calendar-clock»
  // Hoja con la flecha que vuelve: el documento por el que el proveedor le devuelve dinero a CAYLA.
  // Billetera: la plata que sale para que el negocio funcione (Finanzas ▸ Gastos, ADR-0195 F2).
  gastos: "M3 7a2 2 0 012-2h13a1 1 0 011 1v2 M3 7v11a2 2 0 002 2h14a1 1 0 001-1v-3 M3 7h16a1 1 0 011 1v3 M20 11h-4a2 2 0 000 4h4v-4z",
  // Monedas: la cabecera «Finanzas» agrupa Resumen, Gastos, Cuentas y dinero, Reportes, Impuestos y Cierre. Antes un
  // tablero de recuadros, parecido a «Resumen» y «Atributos».
  finanzas: "M13.744 17.736a6 6 0 1 1-7.48-7.48 M15 6h1v4 M6.134 14.768l.866-.5 2 3.464 M10 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", // lucide «coins»
  dinero: "M3 6h18v12H3z M7 12h.01 M17 12h.01 M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  reportes: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18",
  impuestos: "M7 3h7l5 5v13H7z M14 3v5h5 M10 17l5-6 M10.5 11.5h.01 M14.5 16.5h.01",
  cierre: "M6 11h12v10H6z M9 11V7a3 3 0 016 0v4",
  // Lupa sobre una línea que sube: qué se vende, qué no y qué pedir (Gestión ▸ Análisis). Antes un microscopio.
  analisis: "M3 10.5a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0 M21 21l-5.2-5.2 M7 12.5l2.4-2.6 2.1 2 3-3.4",
  // Un brote: lo nuevo del piso (Frescura del piso, ADR-0208 paso 4). No la percha de «Existencias» (lo que hay
  // colgado) ni la línea de «Análisis» (cómo se vendió): cuánto lleva lo colgado y qué se está quedando.
  frescura: "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13", // lucide «leaf»
  // Aguja de velocímetro: el panorama que mezcla ventas de la red y dinero
  // (Finanzas ▸ Resumen), 2026-09-27 — antes compartía los cuadros de
  // "Resumen" de Producción, una pantalla de otro módulo.
  panorama: "M4 15a8 8 0 1116 0M12 15l3.5-5M4 15h1m14 0h1",
  // Pulso (ADR-0275): «Salud del negocio» de CAYLA Global. No el velocímetro: ese ya es Finanzas ▸ Resumen, en el mismo menú.
  pulso: "M3 12h4l2.5-6 4 12 2.5-6H21",
  // Brújula: Gestión es dirigir —mirar y decidir— (ADR-0392). Distinta de los trazos de sus cuatro hijas (analisis,
  // frescura, planPiso, rendimiento) para que la cabecera no repita una fila que vive justo debajo. Antes un maletín.
  gestion: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z", // lucide «compass»
  planPiso: "M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3M20 22V2M4 12h16M4 20h16M4 2v20M4 4h16", // lucide «shelving-unit»
  recibirInsumos: "M12 22v-9M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36zM20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z", // lucide «package-open»
  campana: "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14M8 6v8", // lucide «megaphone» // lucide «calendar-days»
  // Calendario con corazón: las fechas del año en que se vende distinto (el módulo Campañas, ADR-0473). Distinto del megáfono
  // de Plan de campaña, que es cuánto comprar para una. Desde el 2026-10-22 no tiene fila propia: es el ícono del módulo en Roles.
  calendarioCampana: "M12 22H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4H3M8 2v4M16 2v4M21.29 14.7a2.43 2.43 0 0 0-2.65-.52c-.3.12-.57.3-.8.53l-.34.34-.35-.34a2.43 2.43 0 0 0-2.65-.53c-.3.12-.56.3-.79.53-.95.94-1 2.53.2 3.74L17.5 22l3.6-3.55c1.2-1.21 1.14-2.8.19-3.74z", // lucide «calendar-heart»
  // Una medalla: Catálogo ▸ Insignias (Felipe 2026-10-22; se llamó «Sellos», con un sello de goma, hasta el 2026-10-23), lo que se le
  // marca a una prenda, con las campañas dentro. No la insignia dentada con «%» de Liquidación, que va justo debajo, ni la etiqueta
  // colgante de Categorías ni la cinta de Atributos.
  insignias: "M15.477 12.89l1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526 M6 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", // lucide «award»
  ordenesInsumos: "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01", // lucide «clipboard-list»
  // Mano con monedas: la plata que se le entrega en la mano a quien viaja a comprar (Fondos por rendir, ADR-0362 fase 6).
  fondos: "M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17M7 21l1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9M2 16l6 6M13.1 9a2.9 2.9 0 1 0 5.8 0a2.9 2.9 0 1 0-5.8 0M3 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0", // lucide «hand-coins»
  // Tablilla con su visto: la oficina que revisa lo que anotaron las compradoras (Revisar compras, ADR-0480). Distinta de la hoja de
  // «Facturas de proveedor» (el papel) y de la mano con monedas de «Mis compras» (la plata de quien compra).
  revisarCompras: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM9 14l2 2 4-4", // lucide «clipboard-check»
  rendimiento: "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3", // lucide «trophy»
  // Monitor con su percha: la tienda online, donde el cliente ve la prenda desde su pantalla (Vitrina web, ADR-0408). No la tienda
  // con toldo de «Inicio» (la puerta física) ni la polera de «Productos» (lo que ES la prenda): lo que se MUESTRA en la web.
  vitrina: "M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M8 21h8 M12 17v4 M10.8 6.8a1.2 1.2 0 1 1 1.2 1.2v.9l4 3H8l4-3",
  // Un celular con su visto: el pedido que el cliente separó desde su teléfono y la tienda confirma (Pedidos web, ADR-0408). No la
  // bolsa de «Ventas» ni el monitor con percha de la Vitrina: lo que llega de la web para atender.
  pedidosWeb: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01 M9 10l2 2 4-4",
  // Insignia con «%»: la prenda que se liquida con su etiqueta, sin pasar a Productos (ADR-0379). Antes una etiqueta
  // con una flecha que baja.
  liquidacion: "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M15 9l-6 6 M9 9h.01 M15 15h.01", // lucide «badge-percent»
  // Corazón: el club de CAYLA (Clientas, 2026-09-27) — nunca "colaboradores" (esa es la persona
  // dueña de un acceso), esta es la clienta que vuelve.
  clientas: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 000-7.8z",
  // Grupo de personas: la cabecera del grupo Clientes (ADR-0288 act. g, 2026-10-01). El corazón se queda en «Fichas»,
  // su hija, para que quien solo ve las fichas siga viendo la misma fila con el mismo ícono. Antes una escarapela.
  club: "M18 21a8 8 0 0 0-16 0 M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3", // lucide «users-round»
  // Globo de conversación: Clientas ▸ Avisos, los mensajes por WhatsApp que la tienda le manda a cada socia.
  avisos: "M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z",
  // Foco encendido: Tienda web ▸ Recomendaciones (ADR-0408), la idea que un cliente le deja a CAYLA desde la tienda online. No el globo de
  // «Avisos» (lo que la tienda le manda a él) ni el corazón de las fichas: lo que ÉL propone.
  recomendaciones: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4", // lucide «lightbulb»
  // Globo: la cabecera del grupo «Tienda web» (ADR-0430), la tienda que está en internet. No repite a ninguna de sus hijas (el
  // tablero del Resumen, el celular de Pedidos, el monitor de la Vitrina, el foco de Recomendaciones, los controles de Ajustes) ni a la
  // brújula de Gestión, que también es un círculo: este lleva sus meridianos.
  tiendaWeb: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20 M2 12h20", // lucide «globe»
  // Tablero: Tienda web ▸ Resumen (ADR-0430), lo que la tienda online pide hoy, de un vistazo. No el velocímetro de Finanzas ▸ Resumen
  // ni el pulso de CAYLA Global, que pueden estar en el mismo lateral.
  resumenWeb: "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z", // lucide «layout-dashboard»
  // Controles deslizantes: Tienda web ▸ Ajustes (ADR-0430), lo que la tienda online muestra de cada tienda y sus plazos.
  // Regalo: los beneficios del club (puntos y cupones, programa de puntos 2026-10-19). Distinto del corazón del club, que ya es del grupo.
  puntos: "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z", // lucide «gift»
  // Paleta: Tienda web ▸ Campañas (2026-10-21), cómo se ve la tienda durante cada campaña. Ninguna otra fila lleva colores.
  paleta: "M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z M13 6.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M17 10.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M8 7.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M6 12.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0", // lucide «palette»
  ajustesWeb: "M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4", // lucide «sliders-horizontal»
};

/* ------------------------------------------------------------------
   Módulo → ícono (Roles y accesos)
   ------------------------------------------------------------------ */

/** Los módulos cuyo ícono NO es el de una sola fila del menú: reúnen varias pantallas, son pestañas de otra o no tienen fila.
 *  `null` = no hay ícono del menú; quien lo dibuja usa uno propio (hoy: Roles y Configuración, que se abren desde los
 *  botones de la cabecera y no tienen trazo en el lateral). */
const APARTE: Partial<Record<ClaveModulo, ClaveIcono | null>> = {
  // Siete pantallas del Taller cuelgan de este módulo: se dibuja como su cabecera (la tijera), no como la primera hija.
  produccion: "produccion",
  // Categorías, Marcas y Atributos son tres filas de UN módulo (en Roles se llama «Categorías, marcas y atributos»): lleva el
  // cuaderno de muestras, el de la fila que le da el nombre.
  atributos: "atributos",
  // Resumen y Reportes de Finanzas son dos filas del mismo módulo; en Roles se dibuja como los reportes.
  reportes_financieros: "reportes",
  // Campañas (`campanas`) no tiene fila propia desde el 2026-10-22: abre la de Insignias (su `moduloAlterno`). En Roles lleva su
  // calendario con corazón, para no confundirse con la medalla del módulo Insignias (`etiquetas`).
  campanas: "calendarioCampana",
  colaboradores: "colaboradores",
  // Actividad no es una fila: es el botón de la cabecera (ADR-0207), que dibuja el reloj con flecha del Historial (`BotonActividad`).
  actividad: "historial",
  roles: null,
  configuracion: null,
};

function iconosPorModulo(nodos: readonly Nodo[], acumulado = new Map<ClaveModulo, ClaveIcono>()): Map<ClaveModulo, ClaveIcono> {
  for (const n of nodos) {
    if (n.estado !== "viva") continue;
    if (esGrupo(n)) iconosPorModulo(n.hijos, acumulado);
    else if (n.modulo && !acumulado.has(n.modulo)) acumulado.set(n.modulo, n.icono);
  }
  return acumulado;
}
const DEL_MENU = iconosPorModulo(ARBOL);

/** El ícono del menú de este módulo: el de su fila (la primera, si tiene varias con el mismo dibujo) o el que se declaró a mano.
 *  `null` si el módulo no tiene ninguno en el menú. */
export function iconoDeModulo(clave: ClaveModulo): ClaveIcono | null {
  if (clave in APARTE) return APARTE[clave] ?? null;
  return DEL_MENU.get(clave) ?? null;
}

/* ------------------------------------------------------------------
   Acceso rápido del Inicio → ícono
   ------------------------------------------------------------------ */

/** Los accesos del Inicio que llevan a una pantalla del menú dibujan el ícono de esa pantalla (y el botón «Vender», el del Punto
 *  de Venta). «Buscar» y «Nuevo producto» son acciones, no pantallas: se dibujan con su propio trazo en la página.
 *  `menu-iconos.test.ts` comprueba que cada uno sea el ícono del módulo al que lleva. */
export const ICONO_DEL_ACCESO = {
  vender: "vender",
  caja: "caja",
  apartados: "apartados",
  stock: "existencias",
  traslados: "traslados",
  cambios: "cambios",
  recibir: "recibir",
  conteo: "conteo",
  produccion: "produccion",
} as const satisfies Partial<Record<ClaveAccesoIcono | "vender", ClaveIcono>>;

/** Lo mismo para el Inicio de almacén: Stock, Traslados, Recibir y Conteo llevan a una pantalla del menú y dibujan su ícono.
 *  «Etiquetas», «Rótulos» y «Escanear» son acciones y conservan su trazo (`components/inicio-almacen/iconos.tsx`).
 *  `menu-iconos.test.ts` comprueba cada uno contra el módulo al que lleva y que ningún acceso nuevo quede fuera sin decirlo. */
export const ICONO_DEL_ACCESO_ALMACEN = {
  stock: "existencias",
  traslados: "traslados",
  recibir: "recibir",
  conteo: "conteo",
} as const satisfies Partial<Record<AccesoDeAlmacen["icono"], ClaveIcono>>;

