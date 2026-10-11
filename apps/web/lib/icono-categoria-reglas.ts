/**
 * El ícono de cada categoría, por PREFIJO (spike `docs/maquetas/categorias-iconos-2026-09/`, Felipe 2026-09-29).
 *
 * CONTRATO. Promete: dado el prefijo de una categoría, las formas de su ícono (cuadrícula 24×24, para pintar con trazo,
 * sin relleno propio), o `null` si esa categoría no tiene ícono propio. Asume: el prefijo es `retail.categorias.prefijo`.
 * Nunca lanza, y no mira el nombre.
 *
 * POR QUÉ EL PREFIJO Y NO EL NOMBRE. Los nombres se renombran (`Poleras/Sudaderas` → `Poleras`, migración
 * 20260917110000) pero el prefijo (`SUD`) queda fijo apenas hay un producto: es la letra del código impreso en cada
 * etiqueta. Un mapa por nombre se rompe al primer renombre; por prefijo, no.
 *
 * UNA CATEGORÍA NUEVA no está aquí y cae al ícono de su familia (`IconoFamilia`): la pantalla no se rompe, solo no gana
 * dibujo propio. Elegirlo desde «Editar categoría» exigiría una columna en `categorias` (esquema), fuera de este mapa.
 *
 * DIBUJO. Mismo lenguaje que la percha de `IconoFamilia`: trazo de 1,5, esquinas redondas, sin color (el color lo pone
 * quien lo pinta). **La primera forma de cada ícono es su silueta**: el banner de la tarjeta la rellena al 14 %.
 * Se dibujaron a mano porque ningún set público trae blazer, body ni conjunto (18 sistemas medidos), y así no se mezclan
 * autores ni licencias ni se suma una dependencia.
 */

export type FormaIcono =
  | { t: "path"; d: string }
  | { t: "circle"; cx: number; cy: number; r: number }
  | { t: "rect"; x: number; y: number; width: number; height: number; rx?: number };

export const ICONOS_POR_PREFIJO: Readonly<Record<string, readonly FormaIcono[]>> = {
  // ---------- Indumentaria ----------
  // Polos
  POL: [
    { t: "path", d: "M8.6 3.5 3 6.6l2 4.4 2.5-1.2V20.5h9V9.8L19 11l2-4.4-5.6-3.1a3.6 3.6 0 0 1-6.8 0z" },
  ],
  // Poleras
  SUD: [
    { t: "path", d: "M9 4.2 4.4 6.4 3 17.6l3.4.6 1.1-6.4v8.7h9v-8.7l1.1 6.4 3.4-.6L19.6 6.4 15 4.2" },
    { t: "path", d: "M9 4.2C9 2.9 10.3 2 12 2s3 .9 3 2.2c0 2.2-1.4 3.7-3 3.7S9 6.4 9 4.2z" },
    { t: "path", d: "M11 8v3M13 8v3" },
    { t: "path", d: "M8.9 15.4h6.2" },
  ],
  // Chompas
  CMP: [
    { t: "path", d: "M9 3.7 4.4 6 3 17.6l3.4.6 1.1-6.4v8.7h9v-8.7l1.1 6.4 3.4-.6L19.6 6 15 3.7c-.4 1.8-1.6 2.8-3 2.8s-2.6-1-3-2.8z" },
    { t: "path", d: "M7.5 18h9" },
    { t: "path", d: "M10.4 9.6v5M12 9.6v5M13.6 9.6v5" },
  ],
  // Camisas y Blusas
  CMS: [
    { t: "path", d: "M9 3.5 3.5 6.7 5 11l2.5-1.2v10.7h9V9.8L19 11l1.5-4.3L15 3.5" },
    { t: "path", d: "m9 3.5 3 4.2 3-4.2" },
    { t: "path", d: "M12 7.7v12.8" },
    { t: "path", d: "M12 11h.01M12 14.5h.01M12 18h.01" },
  ],
  // Tops
  TOP: [
    { t: "path", d: "M8.6 3 8 8.2l-2.5 2.4V16h13v-5.4L16 8.2 15.4 3" },
    { t: "path", d: "M8.6 3c.2 3.2 1.6 5 3.4 5s3.2-1.8 3.4-5" },
  ],
  // Bodys
  BOD: [
    { t: "path", d: "M8.6 3 8 8.6c0 2.4-1.4 3.4-1.4 5.8 0 1.6 1 2.6 2.4 2.6l1.3 3.5h3.4l1.3-3.5c1.4 0 2.4-1 2.4-2.6 0-2.4-1.4-3.4-1.4-5.8L15.4 3" },
    { t: "path", d: "M8.6 3c.2 3 1.6 4.6 3.4 4.6s3.2-1.6 3.4-4.6" },
    { t: "path", d: "M10.7 18.6h2.6" },
  ],
  // Vestidos
  VES: [
    { t: "path", d: "M9 3 8.6 8.8l-1.4 2.8-2.6 8.9h14.8l-2.6-8.9-1.4-2.8L15 3" },
    { t: "path", d: "M9 3c.2 2.6 1.4 4 3 4s2.8-1.4 3-4" },
    { t: "path", d: "M7.2 11.6h9.6" },
  ],
  // Faldas
  FAL: [
    { t: "path", d: "M7.6 4h8.8l3.9 16H3.7z" },
    { t: "path", d: "M7.3 7.6h9.4" },
    { t: "path", d: "M10.5 7.6 9 20M13.5 7.6 15 20" },
  ],
  // Pantalones
  PAN: [
    { t: "path", d: "M7 3h10l3 18h-6.6L12 9.6 10.6 21H4z" },
    { t: "path", d: "M7.2 6.2h9.6" },
    { t: "path", d: "M12 6.2v3.4" },
  ],
  // Jeans
  JEA: [
    { t: "path", d: "M7 3h10l1.6 18h-5.2L12 9.6 10.6 21H5.4z" },
    { t: "path", d: "M7.2 6.2h9.6" },
    { t: "path", d: "M7.4 6.2c0 2.4 1.4 3.6 3 3.6M16.6 6.2c0 2.4-1.4 3.6-3 3.6" },
    { t: "path", d: "M12 6.2v3.4" },
  ],
  // Shorts
  SHO: [
    { t: "path", d: "M6.6 4.5h10.8L19 16h-5.6L12 10.4 10.6 16H5z" },
    { t: "path", d: "M6.8 7.6h10.4" },
  ],
  // Blazers
  BLZ: [
    { t: "path", d: "M9 3.6 4.6 6 3.4 18.6l3.2.6.9-8.4v9.7h9v-9.7l.9 8.4 3.2-.6L19.4 6 15 3.6" },
    { t: "path", d: "M9 3.6 12 13.6l3-10" },
    { t: "path", d: "M9 3.6 10.5 7.4 8.6 9M15 3.6l-1.5 3.8L15.4 9" },
    { t: "path", d: "M12.6 16.6h.01" },
  ],
  // Casacas
  CAS: [
    { t: "path", d: "M8.6 3.8 4.4 6 3 17.6l3.6.6L7.5 11v9.5h9V11l.9 7.2 3.6-.6L19.6 6l-4.2-2.2" },
    { t: "path", d: "M8.6 3.8v2.4L12 8l3.4-1.8V3.8" },
    { t: "path", d: "M8.6 3.8c1-.9 2.2-1.3 3.4-1.3s2.4.4 3.4 1.3" },
    { t: "path", d: "M12 8v12.5" },
    { t: "path", d: "M7.5 17.6h9" },
  ],
  // Abrigos
  ABR: [
    { t: "path", d: "M9 3 4.6 5.4 3.6 16.2l3.2.6.7-6.4-.3 11.1h9.6l-.3-11.1.7 6.4 3.2-.6-1-10.8L15 3" },
    { t: "path", d: "M9 3l3 6.4 3-6.4" },
    { t: "path", d: "M12 9.4v12.1" },
    { t: "path", d: "M7.4 13h9.2" },
  ],
  // Chalecos
  CHA: [
    { t: "path", d: "M8.6 3 6.6 8.4V18l5.4 3 5.4-3V8.4L15.4 3" },
    { t: "path", d: "M8.6 3 12 11l3.4-8" },
    { t: "path", d: "M12 14h.01M12 17h.01" },
  ],
  // Conjuntos
  CON: [
    { t: "path", d: "M8.8 2.5 8.4 6 6.6 7.8v3h10.8v-3L15.6 6l-.4-3.5" },
    { t: "path", d: "M8.8 2.5c.2 1.8 1.2 2.8 3.2 2.8s3-1 3.2-2.8" },
    { t: "path", d: "M8 13.5h8l2.8 8H5.2z" },
  ],
  // Enterizos
  ENT: [
    { t: "path", d: "M9 2.6 8.6 7.6l-1.2 3-1.6 10.9H11l1-6.9 1 6.9h5.2l-1.6-10.9-1.2-3L15 2.6" },
    { t: "path", d: "M9 2.6c.2 2.4 1.4 3.6 3 3.6s2.8-1.2 3-3.6" },
    { t: "path", d: "M7.4 10.6h9.2" },
  ],
  // Ropa interior/Lencería
  LEN: [
    { t: "path", d: "M7.6 4.6 7.2 8.6M16.4 4.6l.4 4" },
    { t: "path", d: "M4.4 9.2c0 4.6 2.8 6 5.2 5.2 1.3-.5 2.4-1.6 2.4-3.4 0 1.8 1.1 2.9 2.4 3.4 2.4.8 5.2-.6 5.2-5.2-2.2-1.6-5.2-1.2-7.6 2.4-2.4-3.6-5.4-4-7.6-2.4z" },
  ],

  // ---------- Calzado ----------
  // Zapatillas
  ZAP: [
    { t: "rect", x: 3, y: 15, width: 18, height: 3, rx: 1.5 },
    { t: "path", d: "M4 15V9.5c0-.6.5-1 1-.8l3.2 1 1.6-2.2 1.6 1 .9 1.8c.8 1.6 2 2.3 4 2.7 1.6.3 2.7 1.1 2.7 2.7V15" },
    { t: "path", d: "M10.2 9.6l1.3 1M12.2 10.6l1.3 1" },
  ],
  // Zapatos formales
  ZFO: [
    { t: "path", d: "M3.6 16V9.2c0-.4.4-.7.8-.6l4.6 1.4c.8 1.6 2 2.4 3.6 2.9l5.4 1.7c1.6.5 2.6 1.4 2.6 2.7V16z" },
    { t: "path", d: "M3.6 16v2.6h4V16" },
    { t: "path", d: "M10.1 10.6l-1 1.6M12 11.5l-1 1.6M13.9 12.3l-1 1.6" },
  ],
  // Botas
  BOT: [
    { t: "path", d: "M7 3h7v9.5c0 1 .6 1.5 1.5 1.9l4 1.6c1 .4 1.5 1 1.5 2V20H7z" },
    { t: "path", d: "M7 17h14" },
  ],
  // Botines
  BOI: [
    { t: "path", d: "M7 8h7v4.5c0 1 .6 1.5 1.5 1.9l4 1.6c1 .4 1.5 1 1.5 2V20H7z" },
    { t: "path", d: "M7 17h14" },
  ],
  // Mocasines
  MSN: [
    { t: "path", d: "M3.6 17v-4.6c0-.4.3-.7.7-.6l3.6.7c1 1.4 2.4 2 4.2 2h4.8c2.4 0 4.2 1 4.2 2.6V17z" },
    { t: "path", d: "M10 12.9l3.6.9" },
    { t: "path", d: "M10.6 15.1c.8.2 2 .2 3 0" },
  ],
  // Bailarinas
  BAI: [
    { t: "path", d: "M3.4 17.4v-3c0-.9.6-1.500 1.400-1.400 1 .1 1.600.7 2.300 1.500 1 1.100 2.300 1.500 3.700 1.400l3.200-.2c3 0 6.600.8 6.600 2.700v1c0 .3-.2.5-.5.5H3.900c-.3 0-.5-.2-.5-.5z" },
    { t: "path", d: "M14.800 15.200l-1.900-1v2zM14.800 15.200l1.900-1v2z" },
  ],
  // Sandalias
  SAN: [
    { t: "path", d: "M12 2.6c3.100 0 4.500 2.300 4.500 5.400 0 2.500-.7 3.700-.7 5.400 0 1.700.7 3 .7 4.600 0 2.400-1.700 3.400-4.500 3.400s-4.500-1-4.500-3.400c0-1.600.7-2.900.7-4.600 0-1.700-.7-2.900-.7-5.400 0-3.100 1.400-5.400 4.500-5.400z" },
    { t: "path", d: "M12 7.200 8.400 11.600M12 7.200l3.600 4.400" },
  ],

  // ---------- Accesorios y Complementos ----------
  // Bolsos y Carteras
  CAR: [
    { t: "path", d: "M4 10.5c0-.8.6-1.5 1.4-1.5h13.2c.8 0 1.4.7 1.4 1.5L19 19c-.1.6-.6 1-1.2 1H6.2c-.6 0-1.1-.4-1.2-1z" },
    { t: "path", d: "M8.5 9c0-4 7-4 7 0" },
    { t: "path", d: "M4.3 12.6h15.4" },
    { t: "path", d: "M12 12.6v2" },
  ],
  // Cinturones
  CIN: [
    { t: "path", d: "M2 10h20v4H2z" },
    { t: "path", d: "M7 8h5v8H7z" },
    { t: "path", d: "M9.5 12H14" },
    { t: "path", d: "M16 12h.01M18.2 12h.01M20.2 12h.01" },
  ],
  // Gorros y Sombreros
  GOR: [
    { t: "path", d: "M7 13c0-4.6 1.8-7.5 5-7.5s5 2.9 5 7.5" },
    { t: "path", d: "M2.5 14.2c0-1 3-1.2 9.5-1.2s9.5.2 9.5 1.2c0 2.2-4.6 3.4-9.5 3.4s-9.5-1.2-9.5-3.4z" },
    { t: "path", d: "M7.3 11.2c3 .8 6.4.8 9.4 0" },
  ],
  // Lentes de sol
  LSO: [
    { t: "path", d: "M3.5 9.5h7v3c0 2-1.5 3.5-3.5 3.5S3.5 14.5 3.5 12.5z" },
    { t: "path", d: "M13.5 9.5h7v3c0 2-1.5 3.5-3.5 3.5s-3.5-1.5-3.5-3.5z" },
    { t: "path", d: "M10.5 10.6c1-.7 2-.7 3 0" },
    { t: "path", d: "M3.5 9.5 2 8M20.5 9.5 22 8" },
  ],
  // Mochilas
  MOC: [
    { t: "path", d: "M9 6V5c0-1.2 1-2 3-2s3 .8 3 2v1" },
    { t: "path", d: "M6 8.6C6 7.2 7 6 8.6 6h6.8C17 6 18 7.2 18 8.6V19c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2z" },
    { t: "path", d: "M8.6 14.5h6.8V18H8.6z" },
    { t: "path", d: "M9 11.2h6" },
  ],
  // Pañuelos y Pañoletas
  BUF: [
    { t: "path", d: "M3 5.4c5 2 13 2 18 0L12 20z" },
    { t: "path", d: "M3 5.4 1.8 4M21 5.4 22.2 4" },
    { t: "path", d: "M12 10h.01M9.6 8.4h.01M14.4 8.4h.01M12 13.6h.01" },
  ],
  // Relojes
  REL: [
    { t: "circle", cx: 12, cy: 12, r: 5.2 },
    { t: "path", d: "M12 9.4V12l1.8 1.1" },
    { t: "path", d: "M9 6.8 9.7 3h4.6l.7 3.8M9 17.2 9.7 21h4.6l.7-3.8" },
  ],
  // Riñoneras
  RIN: [
    { t: "path", d: "M6 8.4c0-.8.6-1.4 1.4-1.4h9.2c.8 0 1.4.6 1.4 1.4V15c0 1.7-1.3 3-3 3H9c-1.7 0-3-1.3-3-3z" },
    { t: "path", d: "M6 11.4h12" },
    { t: "path", d: "M12 11.4v1.6" },
    { t: "path", d: "M6 9c-1.6-.1-3 .4-4 1.4M18 9c1.6-.1 3 .4 4 1.4" },
  ],

  // ---------- Bisutería ----------
  // Anillos
  ANL: [
    { t: "circle", cx: 12, cy: 15, r: 5.5 },
    { t: "path", d: "M9.4 6.4 10.4 3.6h3.2l1 2.8L12 9.4z" },
  ],
  // Aretes
  ARE: [
    { t: "circle", cx: 7, cy: 4.4, r: 1.2 },
    { t: "path", d: "M7 5.6V8" },
    { t: "path", d: "M7 8c-1.5 2.4-2 4-2 5.4 0 2.1.9 3.6 2 3.6s2-1.5 2-3.6c0-1.4-.5-3-2-5.4z" },
    { t: "circle", cx: 17, cy: 4.4, r: 1.2 },
    { t: "path", d: "M17 5.6V8" },
    { t: "path", d: "M17 8c-1.5 2.4-2 4-2 5.4 0 2.1.9 3.6 2 3.6s2-1.5 2-3.6c0-1.4-.5-3-2-5.4z" },
  ],
  // Collares
  COL: [
    { t: "path", d: "M4 3.5c0 7.4 3.4 11.5 8 11.5s8-4.100 8-11.500" },
    { t: "path", d: "M12 15v1.4" },
    { t: "path", d: "M12 16.4c-1.6 1.6-1.6 3.600 0 5 1.600-1.400 1.600-3.400 0-5z" },
  ],
  // Pulseras
  PUL: [
    { t: "circle", cx: 20, cy: 12, r: 1.5 },
    { t: "circle", cx: 18.13, cy: 15.54, r: 1.5 },
    { t: "circle", cx: 13.39, cy: 17.42, r: 1.5 },
    { t: "circle", cx: 8, cy: 16.76, r: 1.5 },
    { t: "circle", cx: 4.48, cy: 13.88, r: 1.5 },
    { t: "circle", cx: 4.48, cy: 10.12, r: 1.5 },
    { t: "circle", cx: 8, cy: 7.24, r: 1.5 },
    { t: "circle", cx: 13.39, cy: 6.58, r: 1.5 },
    { t: "circle", cx: 18.13, cy: 8.46, r: 1.5 },
  ],

  // ---------- Belleza ----------
  // Maquillaje
  MAQ: [
    { t: "path", d: "M8 21v-6h8v6z" },
    { t: "path", d: "M8 15v-2.400h8V15" },
    { t: "path", d: "M9.400 12.600V7.400L14.600 3.600v9" },
  ],

  // ---------- Papelería ----------
  // Lapiceros
  LAP: [
    { t: "path", d: "M4.500 19.500 5.400 16 16.400 5l3.600 3.600L9 19.600z" },
    { t: "path", d: "M14.400 7l3.600 3.600" },
    { t: "path", d: "M4.500 19.500 8 18.600" },
  ],
  // Colores
  UTC: [
    { t: "path", d: "M5 21V9l2-5 2 5v12z" },
    { t: "path", d: "M5 9h4" },
    { t: "path", d: "M10 21V7l2-4 2 4v14z" },
    { t: "path", d: "M10 7h4" },
    { t: "path", d: "M15 21V10l2-5 2 5v11z" },
    { t: "path", d: "M15 10h4" },
  ],
  // Libretas/Cuadernos
  LIB: [
    { t: "path", d: "M6 3.500h11.500c.8 0 1.500.7 1.500 1.500v14c0 .8-.7 1.500-1.500 1.500H6z" },
    { t: "path", d: "M3.500 6.500H8M3.500 10.500H8M3.500 14.500H8M3.500 18.500H8" },
    { t: "path", d: "M11 8h5M11 11.500h5" },
  ],
  // Útiles de oficina
  UOF: [
    { t: "path", d: "m21.440 11.050-9.190 9.190a6 6 0 0 1-8.490-8.490l8.570-8.570A4 4 0 1 1 18 8.840l-8.590 8.570a2 2 0 0 1-2.830-2.830l8.490-8.480" },
  ],

  // ---------- Empaque (familia creada desde la pantalla, no por migración) ----------
  // Bolsas: la bolsa de compra, con el asa que entra al cuerpo. No es la cartera (CAR: asa por encima y cierre) ni el bolso
  // de Accesorios (solapa en V): una asa que termina en el borde de arriba, a 16 px, se lee como un candado.
  BOL: [
    { t: "path", d: "M5 8.5h14l-1 12H6z" },
    { t: "path", d: "M9 11.5V7a3 3 0 0 1 6 0v4.5" },
  ],
};

/** Las formas del ícono de una categoría, o `null` si no tiene uno propio (entonces se usa el de su familia). */
export function formasDePrefijo(prefijo: string | null | undefined): readonly FormaIcono[] | null {
  if (!prefijo) return null;
  return ICONOS_POR_PREFIJO[prefijo.trim().toUpperCase()] ?? null;
}
