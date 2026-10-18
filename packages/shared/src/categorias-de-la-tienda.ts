// Los grupos de categorías de la tienda online (ADR-0408, act. 2026-10-15 (f)) y la zona de cada una en el probador de «Arma el tuyo»
// (ADR-0434). Una sola tabla para las dos apps: la tienda arma con ella sus menús, sus filtros y su probador, y el ERP (Tienda web ▸
// Vitrina ▸ Probador) cuenta solo las prendas que el probador usa. Vivía en `apps/tienda/lib/grupos.ts`, y el ERP pedía el largo y el
// recorte de aretes, cinturones y maquillaje que la tienda nunca muestra: 36 de las 48 prendas «sin largo» del 2026-10-17 (/formidable).
//
// Cada categoría va en un grupo y cada grupo en un menú de la cabecera («Ropa» o «Accesorios»), siempre por su PREFIJO
// (`categorias.prefijo`, nunca el nombre visible, que se renombra). Un prefijo que no está en ninguna lista (una categoría que un Líder
// creó después) cae en «Encima y más»: se ve, aunque no en su mejor lugar, hasta que se sume aquí.

export type MenuDeLaTienda = "ropa" | "accesorios";
export type GrupoDeLaTienda = { clave: string; nombre: string; menu: MenuDeLaTienda; prefijos: readonly string[] };

export const GRUPOS_DE_LA_TIENDA: readonly GrupoDeLaTienda[] = [
  { clave: "arriba", nombre: "Arriba", menu: "ropa", prefijos: ["CMS", "BLU", "TOP", "POL", "BOD", "COR", "SUD", "CMP", "LEN"] },
  { clave: "vestidos", nombre: "Vestidos y conjuntos", menu: "ropa", prefijos: ["VES", "CON", "ENT", "TBA"] },
  { clave: "abajo", nombre: "Abajo", menu: "ropa", prefijos: ["PAN", "JEA", "FAL", "SHO"] },
  { clave: "encima", nombre: "Encima y más", menu: "ropa", prefijos: ["CAS", "BLZ", "CHA", "CAP", "ABR"] },
  { clave: "accesorios", nombre: "Bolsos y accesorios", menu: "accesorios", prefijos: ["CAR", "MOC", "RIN", "ACC", "CIN", "BUF", "PAS", "GOR", "LSO", "REL"] },
  { clave: "bisuteria", nombre: "Bisutería y belleza", menu: "accesorios", prefijos: ["ARE", "COL", "ANL", "PUL", "MAQ"] },
  { clave: "calzado", nombre: "Calzado", menu: "accesorios", prefijos: ["ZAP", "ZFO", "BAI", "BOI", "BOT", "MSN", "SAN"] },
  { clave: "mas", nombre: "Más", menu: "accesorios", prefijos: ["LAP", "LIB", "UOF", "UTC", "BOL"] },
];

/** A donde va lo que nadie ordenó. */
const RESTO = "encima";

/** El grupo de una categoría, por su clave (el prefijo; sin prefijo, su nombre). Lo desconocido, a «Encima y más». */
export function grupoDeLaTienda(claveDeCategoria: string): GrupoDeLaTienda {
  return GRUPOS_DE_LA_TIENDA.find((g) => g.prefijos.includes(claveDeCategoria)) ?? GRUPOS_DE_LA_TIENDA.find((g) => g.clave === RESTO)!;
}

/* ---------------- El probador de «Arma el tuyo» ---------------- */

/** Dónde va una prenda en la figura del probador: arriba desde los hombros, abajo desde la cintura, el bolso a un costado. `vestido` y `encima`
 *  siguen en el tipo porque el código del probador de la tienda las conoce, pero desde el ADR-0444 `zonaDelProbador` ya no devuelve ninguna: sin
 *  prendas en esas zonas, sus filas y sus botones no se dibujan. */
export type ZonaDelProbador = "vestido" | "arriba" | "abajo" | "encima" | "bolso";

/**
 * El armador acepta MÁXIMO 3 prendas, una por zona (Felipe, 2026-10-17, ADR-0444): UNA de arriba —top, blusa, polo, camisa, chaleco, casaca,
 * blazer, abrigo—, una de abajo y un bolso. Una casaca o un chaleco ES la prenda de arriba: no se pone encima de otra. No entran vestidos,
 * enterizos ni conjuntos (el grupo «Vestidos y conjuntos»), ni las capas (largas como un vestido: `PREFIJOS_FUERA`).
 */
const ZONA_DEL_GRUPO: Readonly<Record<string, ZonaDelProbador>> = { arriba: "arriba", abajo: "abajo", encima: "arriba" };
/** Las capas son tan largas como un vestido y se llevan sobre algo: no entran al armador. */
const PREFIJOS_FUERA: readonly string[] = ["CAP"];
/** El bolso es Bolsos y Carteras (ADR-0434): los demás accesorios, la bisutería y el calzado no entran en esta versión. */
const PREFIJOS_DEL_BOLSO: readonly string[] = ["CAR"];

/** La zona de una categoría en el probador, por su clave (el prefijo; sin prefijo, su nombre). `null`: esa categoría no entra. */
export function zonaDelProbador(claveDeCategoria: string | null | undefined): ZonaDelProbador | null {
  if (!claveDeCategoria) return null;
  if (PREFIJOS_DEL_BOLSO.includes(claveDeCategoria)) return "bolso";
  if (PREFIJOS_FUERA.includes(claveDeCategoria)) return null;
  return ZONA_DEL_GRUPO[grupoDeLaTienda(claveDeCategoria).clave] ?? null;
}
