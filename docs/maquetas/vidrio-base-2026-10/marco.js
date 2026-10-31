/* ====================================================================
   BASE DE LAS MAQUETAS DEL VIDRIO (ADR-0596, 2026-10-31) · el marco ya elegido, que se mueve
   Copiado de docs/maquetas/marco-vidrio-2026-10/index.html: el menú real (lib/menu.ts) con sus 61 trazos (lib/menu-iconos.ts), la gota
   de la fila activa, el despliegue en cascada, plegar, el cajón del celular, la cabecera en dos islas y el combo de la sede.
   Uso: la maqueta pone el esqueleto del aparato (#disp con .lienzo, #lat, #plegar-flota, #cab, #cont, #flotante), pinta su pantalla en
   #cont y llama a Marco.iniciar({ estado, alPintar, alAccion }). Los botones de la barra (.seg-m[data-ctl]) cambian estado[ctl].
   ==================================================================== */
const EASE = 'cubic-bezier(.32,.72,.24,1)';
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Los trazos del menú, copiados de apps/web/lib/menu-iconos.ts (TRAZOS_MENU) para que se vea el lateral de verdad.
// Los trazos del menú, copiados tal cual de apps/web/lib/menu-iconos.ts (TRAZOS_MENU): los 61 que usa el árbol de hoy.
const T = {"inicio": "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5 M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244 M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05", "pulso": "M3 12h4l2.5-6 4 12 2.5-6H21", "produccion": "M6 9a3 3 0 100-6 3 3 0 000 6zm0 12a3 3 0 100-6 3 3 0 000 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12", "resumen": "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", "ordenes": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", "insumos": "M7 3h10a1 1 0 011 1v1.5a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z M7 17.5h10a1 1 0 011 1V20a1 1 0 01-1 1H7a1 1 0 01-1-1v-1.5a1 1 0 011-1z M8 6.5v11M16 6.5v11 M8 10l8 2M8 13l8 2", "compras": "M7 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M18 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12", "ordenesInsumos": "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01", "proveedores": "M12 16h.01 M16 16h.01 M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z M8 16h.01", "facturas": "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8", "recibirInsumos": "M12 22v-9M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36zM20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z", "porPagar": "M16 14v2.2l1.6 1 M16 2v4 M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5 M3 10h5 M8 2v4 M10 16a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "gestion": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z", "analisis": "M3 10.5a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0 M21 21l-5.2-5.2 M7 12.5l2.4-2.6 2.1 2 3-3.4", "frescura": "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13", "planPiso": "M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3M20 22V2M4 12h16M4 20h16M4 2v20M4 4h16", "rendimiento": "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3", "preguntas": "M7.9 20A9 9 0 1 0 4 16.1L2 22ZM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01", "venta": "M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z", "vender": "M7 3h10v5H7z M12 8v3 M3 11h18v8a2 2 0 01-2 2H5a2 2 0 01-2-2z M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01", "apartados": "M6 3h12v18l-6-4-6 4V3zm3.5 6.5L11 11l3.5-3.5", "caja": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8 M12 18V6", "historial": "M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2", "posventa": "M3.4 5.467a2 2 0 00-.4 1.2V20a2 2 0 002 2h14a2 2 0 002-2V6.667a2 2 0 00-.4-1.2l-2-2.667A2 2 0 0017 2H7a2 2 0 00-1.6.8z M3.1 6h17.8 M10.5 10.5l-2.2 2.2 2.2 2.2 M8.3 12.7h5.2a2.5 2.5 0 010 5H11", "cambios": "M7 3v14m0 0l-4-4m4 4l4-4M17 21V7m0 0l4 4m-4-4l-4 4", "devoluciones": "M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-4", "facturacion": "M13 16H8 M14 8H8 M16 12H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z", "tiendaWeb": "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20 M2 12h20", "resumenWeb": "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z", "pedidosWeb": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M12 18h.01 M9 10l2 2 4-4", "vitrina": "M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M8 21h8 M12 17v4 M10.8 6.8a1.2 1.2 0 1 1 1.2 1.2v.9l4 3H8l4-3", "paleta": "M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z M13 6.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M17 10.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M8 7.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0 M6 12.5a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0", "recomendaciones": "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4", "trafico": "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z M16 17h4 M4 13h4", "ajustesWeb": "M21 4h-7 M10 4H3 M21 12h-9 M8 12H3 M21 20h-5 M12 20H3 M14 2v4 M8 10v4 M16 18v4", "inventario": "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z M7 16.5l-4.74-2.85 M7 16.5l5-3 M7 16.5v5.17 M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z M17 16.5l-5-3 M17 16.5l4.74-2.85 M17 16.5v5.17 M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z M12 8 7.26 5.15 M12 8l4.74-2.85 M12 13.5V8", "existencias": "M11.3 3a1.3 1.3 0 102 1c0 .5-.3.9-.7 1.1v1.3L4 13.5a1.5 1.5 0 00-.7 1.3V16h17.4v-1.2a1.5 1.5 0 00-.7-1.3l-7.7-6.1V5.4", "movimientos": "M3 7h13m0 0l-4-4m4 4l-4 4M21 17H8m0 0l4 4m-4-4l4-4", "traslados": "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2 M15 18H9 M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14 M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "conteo": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", "recibir": "M12 22V12 M16 17l2 2 4-4 M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753 M3.29 7 12 12l8.71-5 M7.5 4.27l8.997 5.148", "catalogo": "M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z", "productos": "M20.38 3.46 16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z", "categorias": "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z", "marcas": "M3 6h18l-2.6 6L21 18H3l2.6-6z M12 9.3l.9 1.85 2.05.3-1.5 1.45.36 2.05L12 14l-1.8.95.36-2.05-1.5-1.45 2.05-.3z", "atributos": "M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7 M 7 17h.01 M11 8l2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8", "insignias": "M15.477 12.89l1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526 M6 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "liquidacion": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M15 9l-6 6 M9 9h.01 M15 15h.01", "campana": "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14M8 6v8", "fondos": "M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17M7 21l1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9M2 16l6 6M13.1 9a2.9 2.9 0 1 0 5.8 0a2.9 2.9 0 1 0-5.8 0M3 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0", "finanzas": "M13.744 17.736a6 6 0 1 1-7.48-7.48 M15 6h1v4 M6.134 14.768l.866-.5 2 3.464 M10 8a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "panorama": "M4 15a8 8 0 1116 0M12 15l3.5-5M4 15h1m14 0h1", "gastos": "M3 7a2 2 0 012-2h13a1 1 0 011 1v2 M3 7v11a2 2 0 002 2h14a1 1 0 001-1v-3 M3 7h16a1 1 0 011 1v3 M20 11h-4a2 2 0 000 4h4v-4z", "dinero": "M3 6h18v12H3z M7 12h.01 M17 12h.01 M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z", "reportes": "M4 20V10 M10 20V4 M16 20v-7 M3 20h18", "impuestos": "M7 3h7l5 5v13H7z M14 3v5h5 M10 17l5-6 M10.5 11.5h.01 M14.5 16.5h.01", "cierre": "M6 11h12v10H6z M9 11V7a3 3 0 016 0v4", "club": "M18 21a8 8 0 0 0-16 0 M5 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3", "clientas": "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 000-7.8z", "avisos": "M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z", "puntos": "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"};
const L = { chev: 'M9 6l6 6-6 6', menu: 'M4 7h16M4 12h16M4 17h16', plegar: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18 M16 15l-3-3 3-3', cerrar: 'M18 6 6 18M6 6l12 12', buscar: 'M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-4.8-4.8',
  actividad: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0', luna: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z', chispa: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9', abajo: 'M6 9l6 6 6-6',
  camisa: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z',
  pantalon: 'M7 2h10l1.2 20h-4.7L12 10l-1.5 12H5.8z M7 6h10' };
const sv = (d, c = 'ic') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// El menú completo de una líder, sacado de apps/web/lib/menu.ts (ARBOL, solo lo que está «viva»): módulos, submódulos y los
// subgrupos de tercer nivel (Abastecimiento, Posventa), cada uno con su ícono de hoy. Existencias abierta.
const MENU = [{"id": "inicio", "et": "Inicio", "ic": "inicio"}, {"id": "global", "et": "Salud del negocio", "ic": "pulso"}, {"id": "produccion", "et": "Producción", "ic": "produccion", "hijos": [{"id": "produccion.resumenProduccion", "et": "Resumen", "ic": "resumen"}, {"id": "produccion.ordenes", "et": "Órdenes", "ic": "ordenes"}, {"id": "produccion.insumos", "et": "Insumos", "ic": "insumos"}, {"id": "produccion.abastecimiento", "et": "Abastecimiento", "ic": "compras", "hijos": [{"id": "produccion.ordenesInsumos", "et": "Órdenes de insumos", "ic": "ordenesInsumos"}, {"id": "produccion.proveedoresProduccion", "et": "Proveedores", "ic": "proveedores"}, {"id": "produccion.comprobantesProduccion", "et": "Facturas de insumos", "ic": "facturas"}, {"id": "produccion.recibirProduccion", "et": "Recibir", "ic": "recibirInsumos"}, {"id": "produccion.porPagarProduccion", "et": "Por pagar", "ic": "porPagar"}]}]}, {"id": "gestion", "et": "Gestión", "ic": "gestion", "hijos": [{"id": "gestion.analisis", "et": "Análisis", "ic": "analisis"}, {"id": "gestion.frescura", "et": "Frescura del piso", "ic": "frescura"}, {"id": "gestion.plan_piso", "et": "Plan del piso", "ic": "planPiso"}, {"id": "gestion.rendimiento", "et": "Rendimiento", "ic": "rendimiento"}, {"id": "gestion.preguntas", "et": "Preguntas del equipo", "ic": "preguntas"}]}, {"id": "venta", "et": "Ventas", "ic": "venta", "hijos": [{"id": "venta.puntoDeVenta", "et": "Punto de Venta", "ic": "vender"}, {"id": "venta.apartados", "et": "Apartados", "ic": "apartados"}, {"id": "venta.caja", "et": "Caja", "ic": "caja"}, {"id": "venta.historial", "et": "Historial", "ic": "historial"}, {"id": "venta.posventa", "et": "Posventa", "ic": "posventa", "hijos": [{"id": "venta.cambios", "et": "Cambios", "ic": "cambios"}, {"id": "venta.devoluciones", "et": "Devoluciones", "ic": "devoluciones"}]}, {"id": "venta.facturacion", "et": "Comprobantes", "ic": "facturacion"}]}, {"id": "tiendaWeb", "et": "Tienda web", "ic": "tiendaWeb", "hijos": [{"id": "tiendaWeb.resumen", "et": "Resumen", "ic": "resumenWeb"}, {"id": "tiendaWeb.pedidos", "et": "Pedidos", "ic": "pedidosWeb"}, {"id": "tiendaWeb.vitrina", "et": "Vitrina", "ic": "vitrina"}, {"id": "tiendaWeb.campanas", "et": "Campañas", "ic": "paleta"}, {"id": "tiendaWeb.recomendaciones", "et": "Recomendaciones", "ic": "recomendaciones"}, {"id": "tiendaWeb.trafico", "et": "Tráfico", "ic": "trafico"}, {"id": "tiendaWeb.ajustes", "et": "Conf. Tienda", "ic": "ajustesWeb"}]}, {"id": "inventario", "et": "Inventario", "ic": "inventario", "hijos": [{"id": "inventario.existencias", "et": "Existencias", "ic": "existencias"}, {"id": "inventario.movimientos", "et": "Movimientos", "ic": "movimientos"}, {"id": "inventario.traslados", "et": "Traslados", "ic": "traslados"}, {"id": "inventario.conteo", "et": "Conteo", "ic": "conteo"}, {"id": "inventario.recibir", "et": "Recibir mercadería", "ic": "recibir"}]}, {"id": "catalogo", "et": "Catálogo", "ic": "catalogo", "hijos": [{"id": "catalogo.productos", "et": "Productos", "ic": "productos"}, {"id": "catalogo.categorias", "et": "Categorías", "ic": "categorias"}, {"id": "catalogo.marcas", "et": "Marcas", "ic": "marcas"}, {"id": "catalogo.atributos", "et": "Atributos", "ic": "atributos"}, {"id": "catalogo.insignias", "et": "Insignias", "ic": "insignias"}, {"id": "catalogo.liquidacion", "et": "Liquidación", "ic": "liquidacion"}]}, {"id": "compras", "et": "Compras", "ic": "compras", "hijos": [{"id": "compras.plan", "et": "Plan de campaña", "ic": "campana"}, {"id": "compras.miPlata", "et": "Mis compras", "ic": "fondos"}, {"id": "compras.proveedores", "et": "Proveedores", "ic": "proveedores"}, {"id": "compras.comprobantes", "et": "Historial de compras", "ic": "facturas"}]}, {"id": "finanzas", "et": "Finanzas", "ic": "finanzas", "hijos": [{"id": "finanzas.resumen", "et": "Resumen", "ic": "panorama"}, {"id": "finanzas.gastos", "et": "Gastos", "ic": "gastos"}, {"id": "finanzas.dinero", "et": "Cuentas y dinero", "ic": "dinero"}, {"id": "finanzas.reportes", "et": "Estados financieros", "ic": "reportes"}, {"id": "finanzas.impuestos", "et": "Impuestos", "ic": "impuestos"}, {"id": "finanzas.cierreDeMes", "et": "Cierre de mes", "ic": "cierre"}]}, {"id": "clientas", "et": "Clientes", "ic": "club", "hijos": [{"id": "clientas.fichas", "et": "Fichas", "ic": "clientas"}, {"id": "clientas.avisos", "et": "Avisos", "ic": "avisos"}, {"id": "clientas.beneficios", "et": "Beneficios", "ic": "puntos"}]}];
const CORTOS = { global: 'Salud', tiendaWeb: 'Web', clientas: 'Clientes', produccion: 'Producción', inventario: 'Inventario' };
const GLOBITOS = { 'inventario.traslados': 3, 'tiendaWeb.pedidos': 2, 'compras.comprobantes': 1 };
const abiertos = new Set(['inventario']);
let activa = 'inventario.existencias';
const contiene = (n, id) => n.id === id || (n.hijos || []).some((h) => contiene(h, id));
const suma = (n) => (n.hijos ? n.hijos.reduce((a, h) => a + suma(h), 0) : GLOBITOS[n.id] || 0);
function fila(n, prof, i, sinHijas) {
  const glob = (x) => (x ? `<span class="glob">${x}</span>` : '');
  const corto = prof === 0 ? `<span class="corto">${CORTOS[n.id] || n.et}</span>` : '';
  if (!n.hijos) return `<button class="fila-m${activa === n.id ? ' on' : ''}" data-ir="${n.id}" style="--i:${i}" title="${n.et}">${sv(T[n.ic])}<span class="et">${n.et}</span>${corto}${glob(GLOBITOS[n.id])}</button>`;
  const ab = abiertos.has(n.id) && !sinHijas, dentro = contiene(n, activa);
  return `<div class="sub" style="--i:${i}"><button class="fila-m${dentro && !ab ? ' on' : ''}" data-grupo="${n.id}" aria-expanded="${ab}" title="${n.et}">${sv(T[n.ic])}<span class="et">${n.et}</span>${corto}${ab ? '' : glob(suma(n))}${sv(L.chev, 'ic chev')}</button>
    <div class="hijos"${ab ? ' data-abierto' : ' inert'}><div>${n.hijos.map((h, j) => fila(h, prof + 1, j, sinHijas)).join('')}</div></div></div>`;
}
function pintarLateral() {
  const lat = $('#lat');
  lat.className = 'lat' + (document.documentElement.dataset.lateral ? ' vidrio' : '');
  // Plegado o en la isla las hijas no se ven: el módulo lleva la marca de la pantalla en la que estás.
  const sinHijas = document.documentElement.dataset.lateral === 'isla' || $('#disp').hasAttribute('data-plegado');
  const plegado = $('#disp').hasAttribute('data-plegado');
  const bp = $('#plegar-flota'); bp.setAttribute('aria-label', plegado ? 'Expandir el menú' : 'Plegar el menú'); bp.title = bp.getAttribute('aria-label');
  lat.innerHTML = `<div class="logo-fila"><div class="logo"><i></i><div><span>CAYLA</span><small>Retail</small></div></div>
      <button class="cerrar-cajon" data-acc="cajon" aria-label="Cerrar el menú">${sv(L.cerrar)}</button></div>
    <nav class="nav"><span class="marca-activa gota" aria-hidden="true"></span>${MENU.map((n, i) => fila(n, 0, i, sinHijas)).join('')}</nav>
    <p class="firma">Donde el estilo transforma.</p>
    <div class="yo"><span class="av">LR</span><span class="tx"><b>Lucía Ramos</b><span>Líder · Trujillo</span></span><button class="salir" aria-label="Salir">${sv(L.salir)}</button></div>`;
  requestAnimationFrame(() => moverMarca(false));
}
// Abrir o cerrar un módulo SIN volver a pintar el menú (si no, no hay transición). Como en el ERP, abrir uno cierra sus hermanos.
function alternarGrupo(btn) {
  const id = btn.dataset.grupo, sub = btn.parentElement, abre = !abiertos.has(id);
  const hermanos = [...sub.parentElement.children].filter((x) => x !== sub && x.classList.contains('sub'));
  const poner = (s, abierto) => {
    const b = s.firstElementChild, h = b.nextElementSibling, gid = b.dataset.grupo, n = buscar(MENU, gid);
    abierto ? abiertos.add(gid) : abiertos.delete(gid);
    b.setAttribute('aria-expanded', abierto); h.toggleAttribute('data-abierto', abierto); h.inert = !abierto;
    b.classList.toggle('on', !abierto && contiene(n, activa));
    const g = $(':scope > .glob', b); if (g) g.remove();
    if (!abierto && suma(n)) b.querySelector('.chev').insertAdjacentHTML('beforebegin', `<span class="glob">${suma(n)}</span>`);
  };
  if (abre) hermanos.forEach((s) => abiertos.has(s.firstElementChild.dataset.grupo) && poner(s, false));
  poner(sub, abre);
  seguirMarca(520);
}
function buscar(lista, id) { for (const n of lista) { if (n.id === id) return n; const x = n.hijos && buscar(n.hijos, id); if (x) return x; } return null; }
// La gota acompaña a su fila mientras las cajas crecen o se cierran.
function seguirMarca(ms) { const fin = performance.now() + ms; const paso = () => { moverMarca(false); if (performance.now() < fin) requestAnimationFrame(paso); }; requestAnimationFrame(paso); }

function moverMarca(animar = true) {
  const m = $('.marca-activa'), on = $('.lat .fila-m.on');
  if (!m) return;
  if (!on || !on.offsetParent) { m.style.opacity = 0; return; }
  m.style.opacity = 1;
  if (!animar || quieto()) m.style.transition = 'none'; else m.style.transition = '';
  const nav = $('.nav'), r = on.getBoundingClientRect(), rn = nav.getBoundingClientRect();
  m.style.top = r.top - rn.top + nav.scrollTop + 'px'; m.style.height = r.height + 'px';
  m.style.left = r.left - rn.left + 'px'; m.style.width = r.width + 'px'; m.style.right = 'auto';
  requestAnimationFrame(() => (m.style.transition = ''));
}

function pintarCabecera() {
  $('#cab').innerHTML = `<div class="izq${document.documentElement.dataset.cabecera === 'islas' ? ' vidrio' : ''}"><button class="ib hamb" data-acc="cajon" aria-label="Abrir menú">${sv(L.menu)}</button><span class="colibri" aria-hidden="true"></span>
      <span class="buscar">${sv(L.buscar)}<span class="txt">Buscar en el ERP</span><kbd>/</kbd></span></div>
    <div class="der${document.documentElement.dataset.cabecera === 'islas' ? ' vidrio' : ''}"><button class="ib ocultable" aria-label="Asistente">${sv(L.chispa)}</button>
      <button class="ib" aria-label="Actividad">${sv(L.actividad)}<span class="pt">3</span></button>
      <button class="ib" aria-label="Tema">${sv(L.luna)}</button>
      ${combo({ id: 'sede', forma: 'pastilla', opciones: SEDES, valor: estadoCombos.sede, alinea: 'derecha', tarjetas: true, etiqueta: 'Cambiar de sede' })}</div>`;
  $('#cab').className = 'cab' + (document.documentElement.dataset.cabecera === 'flotante' ? ' vidrio' : '');
}

// La pantalla de muestra: Existencias, con prendas de color para que el vidrio tenga qué desenfocar al bajar.
const PRENDAS = [['#7a2e2a', 'Blusa Emma', 'camisa', 34], ['#c9a27e', 'Casaca Lía', 'camisa', 12, 1], ['#2f4a3a', 'Vestido Ara', 'camisa', 8], ['#d8cbb3', 'Polo Nube', 'camisa', 41, 1],
  ['#1f2f4a', 'Jean Río', 'pantalon', 22], ['#b5643a', 'Falda Inti', 'camisa', 6], ['#e7d7c1', 'Top Brisa', 'camisa', 17, 1], ['#5b3a5e', 'Saco Malva', 'camisa', 4],
  ['#8c9a6b', 'Short Oliva', 'pantalon', 15, 1], ['#2b2b2b', 'Pantalón Noa', 'pantalon', 28], ['#c2876b', 'Blusa Coral', 'camisa', 9], ['#4f6f8f', 'Camisa Mar', 'camisa', 13],
  ['#7d5a3c', 'Chaleco Roble', 'camisa', 5], ['#a33b3b', 'Vestido Rubí', 'camisa', 11], ['#36474f', 'Jogger Pizarra', 'pantalon', 19], ['#d9b44a', 'Blusa Sol', 'camisa', 7, 1]]; // tema-fijo: colores de prenda, son dato
// ---------- el combo: una sola pieza para la sede, el filtro y el campo de una hoja ----------
const SEDES = [
  { v: 'global', t: 'Toda la empresa', d: 'Las tres tiendas, el taller y el almacén', c: 'var(--sede-emp)', ic: 'pulso', g: 'Toda la empresa' },
  { v: 'tru', t: 'Trujillo', d: 'Tienda', c: 'var(--sede-tru)', ic: 'inicio', g: 'Sedes' },
  { v: 'aqp', t: 'Arequipa', d: 'Tienda', c: 'var(--sede-aqp)', ic: 'inicio', g: 'Sedes' },
  { v: 'lim', t: 'Lima', d: 'Tienda', c: 'var(--sede-lim)', ic: 'inicio', g: 'Sedes' },
  { v: 'tal', t: 'Taller', d: 'Lima · producción', c: 'var(--sede-tal)', ic: 'produccion', g: 'Sedes' },
  { v: 'alm', t: 'Almacén', d: 'Lima · reserva', c: 'var(--taupe)', ic: 'inventario', g: 'Sedes' },
];
// Más de 8 opciones: aparece el buscador (ADR-0209, UMBRAL_BUSCAR_COMBO).
const CATEGORIAS = ['Blusas', 'Bodys', 'Camisas', 'Casacas', 'Chalecos', 'Faldas', 'Jeans', 'Leggings', 'Polos', 'Sacos', 'Shorts', 'Tops', 'Vestidos'].map((t) => ({ v: t, t }));
const estadoCombos = { sede: 'tru', filtro: '', campo: 'Blusas' };
const sinTilde = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ICK = { ok: 'M20 6 9 17l-5-5', lupa: L.buscar };
function combo({ id, forma, opciones, valor, alinea, ancho, tarjetas, etiqueta, marcador }) {
  const el = opciones.find((o) => o.v === valor);
  const conBuscar = opciones.length > 8;
  let grupo = null, k = 0;
  const ops = opciones.map((o) => {
    const cab = o.g && o.g !== grupo ? `<p class="cb-grupo">${(grupo = o.g)}</p>` : '';
    return `${cab}<button type="button" role="option" class="cb-op" style="--k:${k++}${o.c ? `;--c:${o.c}` : ''}" aria-selected="${o.v === valor}" data-v="${o.v}" data-t="${o.t}">${o.ic ? `<span class="lente">${sv(T[o.ic])}</span>` : ''}<span class="tx"><b>${o.t}</b>${o.d ? `<span>${o.d}</span>` : ''}</span>${sv(ICK.ok, 'ic ok')}</button>`;
  }).join('');
  // La lista se cuelga de la capa flotante del aparato (como useDestinoFlotante en el ERP); el disparador se queda en su lugar.
  $$(`.flotante [data-de="${id}"]`).forEach((x) => x.remove());
  $('#flotante').insertAdjacentHTML('beforeend', `<div class="cb-lista" role="listbox" data-de="${id}" ${alinea ? `data-alinea="${alinea}"` : ''} ${tarjetas ? 'data-tarjetas' : ''} ${ancho ? 'data-ancho' : ''}>${conBuscar ? `<label class="cb-buscar">${sv(ICK.lupa)}<input placeholder="Buscar" data-buscar></label>` : ''}<div class="cb-ops"><span class="cb-gota gota" aria-hidden="true"></span>${ops}<p class="cb-vacio" hidden>No hay nada con ese nombre.</p></div></div>`);
  const flecha = forma === 'campo' ? `<span class="flecha-caja">${sv(L.abajo, 'ic flecha')}</span>` : sv(L.abajo, 'ic flecha');
  return `<div class="cb${ancho ? ' ancho' : ''}" data-cb="${id}">
    <button type="button" class="cb-btn" data-forma="${forma}" role="combobox" aria-expanded="false" aria-label="${etiqueta || ''}" style="${el && el.c ? `--c:${el.c}` : ''}">${forma === 'pastilla' ? '<span class="pto"></span>' : ''}<span class="val">${el ? el.t : marcador}</span>${flecha}</button></div>`;
}
function pintarCombosDelContenido() {
  if (!$("#filtro-cat") || !$("#campo-cat")) return;
  $('#filtro-cat').outerHTML = `<span id="filtro-cat">${combo({ id: 'filtro', forma: 'pildora', opciones: CATEGORIAS, valor: estadoCombos.filtro, marcador: 'Categoría', etiqueta: 'Filtrar por categoría' })}</span>`;
  $('#campo-cat').innerHTML = combo({ id: 'campo', forma: 'campo', opciones: CATEGORIAS, valor: estadoCombos.campo, ancho: true, etiqueta: 'Qué se probó' });
}
const listaDe = (id) => $(`.flotante .cb-lista[data-de="${id}"]`);
const cbDe = (lista) => $(`.cb[data-cb="${lista.dataset.de}"]`);
// La gota de la lista (A, y las listas largas de C): se queda en la elegida y viaja a la que apuntas.
function gotaA(lista, op, animar = true) {
  const g = lista && $('.cb-gota', lista);
  if (!g) return;
  const destino = op || $('.cb-op[aria-selected="true"]:not([hidden])', lista);
  if (!destino) { g.style.opacity = 0; return; }
  if (!animar || quieto()) g.style.transition = 'none';
  g.style.top = destino.offsetTop + 'px'; g.style.height = destino.offsetHeight + 'px'; g.style.opacity = 1;
  if (!animar || quieto()) requestAnimationFrame(() => (g.style.transition = ''));
}
function cerrarCombos() {
  $$('.cb.abierto').forEach((c) => { c.classList.remove('abierto'); $('.cb-btn', c).setAttribute('aria-expanded', 'false'); });
  $$('.cb-lista.abierta').forEach((l) => l.classList.remove('abierta'));
}
function abrirCombo(cb) {
  const lista = listaDe(cb.dataset.cb), btn = $('.cb-btn', cb), d = $('#disp').getBoundingClientRect(), r = btn.getBoundingClientRect();
  cb.classList.add('abierto'); btn.setAttribute('aria-expanded', 'true');
  lista.style.width = lista.hasAttribute('data-ancho') ? r.width + 'px' : '';
  lista.style.minWidth = r.width + 'px';
  lista.classList.add('abierta');
  const w = lista.offsetWidth;
  lista.style.top = r.bottom - d.top + 8 + 'px';
  lista.style.left = Math.max(8, lista.dataset.alinea === 'derecha' ? r.right - d.left - w : r.left - d.left) + 'px';
  requestAnimationFrame(() => gotaA(lista, null, false));
  const b = $('[data-buscar]', lista); if (b) setTimeout(() => b.focus(), 30);
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.cb-btn');
  if (btn) { const cb = btn.parentElement, abre = !cb.classList.contains('abierto'); cerrarCombos(); if (abre) abrirCombo(cb); e.stopImmediatePropagation(); return; }
  const op = e.target.closest('.cb-op');
  if (op) {
    const lista = op.closest('.cb-lista'), cb = cbDe(lista);
    $$('.cb-op', lista).forEach((o) => o.setAttribute('aria-selected', o === op));
    estadoCombos[lista.dataset.de] = op.dataset.v;
    const b = $('.cb-btn', cb), val = $('.val', b);
    val.textContent = op.dataset.t; val.classList.remove('entra'); void val.offsetWidth; val.classList.add('entra');
    if (op.style.getPropertyValue('--c')) b.style.setProperty('--c', op.style.getPropertyValue('--c'));
    setTimeout(cerrarCombos, 160);
    e.stopImmediatePropagation(); return;
  }
  if (!e.target.closest('.cb-lista')) cerrarCombos();
}, true);
document.addEventListener('pointerover', (e) => {
  const op = e.target.closest('.cb-op');
  if (op) gotaA(op.closest('.cb-lista'), op);
});
document.addEventListener('pointerout', (e) => {
  const ops = e.target.closest('.cb-ops');
  if (ops && !ops.contains(e.relatedTarget)) gotaA(ops.closest('.cb-lista'));
});
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-buscar]')) return;
  const lista = e.target.closest('.cb-lista'), q = sinTilde(e.target.value.trim());
  let hay = 0;
  $$('.cb-op', lista).forEach((o) => { const ver = !q || sinTilde(o.dataset.t).includes(q); o.hidden = !ver; hay += ver; });
  $('.cb-vacio', lista).hidden = hay > 0;
  gotaA(lista, null, false);
});
document.addEventListener('keydown', (e) => {
  // Escape: primero cierra la lista abierta; recién el segundo cierra la hoja (useEscapeLibre).
  if (e.key !== 'Escape') return;
  if ($('.cb-lista.abierta')) { cerrarCombos(); return; }
  $('#disp').removeAttribute('data-hoja');
});

// ---------- estado ----------
// Lo elegido del marco, más lo que cada maqueta agrega (Marco.iniciar({ estado })): toda clave que no sea tema ni ancho va al <html> como data-*.
const estado = { fondo: 'aurora', lateral: 'riel', cabecera: 'islas', combo: 'gota', subs: 'bandeja', pmodo: 'nombre', tema: 'claro', ancho: 'escritorio' };
const Marco = { alPintar: null, alAccion: null };
function pintar() {
  const r = document.documentElement;
  r.dataset.tema = estado.tema;
  for (const k of Object.keys(estado).filter((x) => x !== 'tema' && x !== 'ancho')) { if (estado[k] === 'ahora') delete r.dataset[k]; else r.dataset[k] = estado[k]; }
  $$('.seg-m').forEach((s) => $$('button', s).forEach((b) => b.classList.toggle('on', b.dataset.v === estado[s.dataset.ctl])));
  $('#disp').dataset.ancho = estado.ancho;
  cerrarCombos(); pintarLateral(); pintarCabecera();
  if (Marco.alPintar) Marco.alPintar(estado);
}
document.addEventListener('click', (e) => {
  const ctl = e.target.closest('.seg-m button');
  if (ctl) { estado[ctl.parentElement.dataset.ctl] = ctl.dataset.v; pintar(); return; }
  const acc = e.target.closest('[data-acc]');
  const d = $('#disp');
  if (acc) {
    const a = acc.dataset.acc;
    if (a === 'hoja') { d.toggleAttribute('data-hoja'); $('.spk [data-acc="hoja"]')?.classList.toggle('on', d.hasAttribute('data-hoja')); }
    if (a === 'plegar') { d.toggleAttribute('data-plegado'); pintarLateral(); setTimeout(() => moverMarca(false), 360); }
    if (a === 'cajon') d.toggleAttribute('data-cajon');
    if (Marco.alAccion) Marco.alAccion(a, acc);
    return;
  }
  const g = e.target.closest('[data-grupo]');
  if (g) { if ($('#disp').hasAttribute('data-plegado') || document.documentElement.dataset.lateral === 'isla') return; alternarGrupo(g); return; }
  const ir = e.target.closest('[data-ir]');
  if (ir) { activa = ir.dataset.ir; $$('.lat .fila-m').forEach((f) => f.classList.toggle('on', f === ir || !!(f.dataset.grupo && f.getAttribute('aria-expanded') !== 'true' && contiene(buscar(MENU, f.dataset.grupo), activa)))); moverMarca(true); return; }
  if (d.hasAttribute('data-cajon') && !e.target.closest('.lat')) d.removeAttribute('data-cajon');
});
$('#lat').addEventListener('transitionend', () => moverMarca(false));
addEventListener('resize', () => moverMarca(false));
// Cada maqueta llama a Marco.iniciar después de definir su pantalla.
Marco.iniciar = ({ estado: propio = {}, alPintar, alAccion } = {}) => {
  Object.assign(estado, propio); Marco.alPintar = alPintar || null; Marco.alAccion = alAccion || null;
  pintar(); pintarCombosDelContenido();
};
$('#cont').addEventListener('scroll', () => { if ($('.cb-lista.abierta')) cerrarCombos(); }, { passive: true });
