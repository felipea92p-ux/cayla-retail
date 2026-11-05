// Las familias de color PARA QUIEN COMPRA en la tienda online (ADR-0512, actividad 2). El ERP ya tiene `colores.familia_color`, pero está
// pensada para ordenar la carta de colores (ADR-0312) y mete negro, blanco y gris en un solo «neutro», y beige y marrón en «tierra»: para
// quien compra eso es demasiado grueso. Con los datos reales de Trujillo (2026-10-25) hay 80 colores distintos con unidades: una lista
// de 80 muestras no se puede usar, y 13 familias sí. Una sola tabla, como la de las categorías (`categorias-de-la-tienda.ts`): vive en
// código y no en una columna nueva de `colores`, así no hay migración de tablas ni se toca la familia del ERP.
//
// Cada color va en UNA familia, siempre por su CÓDIGO (`colores.codigo`, nunca el nombre visible, que se renombra). Un código que no está
// aquí (un color que un Líder creó después) cae según la familia del ERP (`FAMILIA_DEL_ERP`) y, sin ella, en ninguna: se ve en sus
// prendas pero no se puede elegir como color hasta que se sume aquí. Los 101 colores activos al 2026-10-26 están todos.

export type FamiliaDeColorId =
  | "negro"
  | "blanco"
  | "gris"
  | "beige"
  | "marron"
  | "rosado"
  | "rojo"
  | "naranja"
  | "amarillo"
  | "verde"
  | "celeste"
  | "azul"
  | "morado";

/** `muestra`: el color con que se dibuja su círculo. Es un dato de la familia (como el de una prenda): no cambia con el modo oscuro. */
export type FamiliaDeColor = { id: FamiliaDeColorId; nombre: string; muestra: string };

/** Las familias en el orden de la paleta: de lo más neutro a lo más vivo. */
export const FAMILIAS_DE_COLOR: readonly FamiliaDeColor[] = [
  { id: "negro", nombre: "Negro", muestra: "#2D2C2F" },
  { id: "blanco", nombre: "Blanco y crudo", muestra: "#F4F0E6" },
  { id: "gris", nombre: "Gris", muestra: "#9C9C9A" },
  { id: "beige", nombre: "Beige y arena", muestra: "#D5BA98" },
  { id: "marron", nombre: "Marrón y café", muestra: "#6B4A38" },
  { id: "rosado", nombre: "Rosado", muestra: "#E3A3B0" },
  { id: "rojo", nombre: "Rojo y vino", muestra: "#9B2335" },
  { id: "naranja", nombre: "Naranja y terracota", muestra: "#D0683A" },
  { id: "amarillo", nombre: "Amarillo y dorado", muestra: "#EFD27A" },
  { id: "verde", nombre: "Verde", muestra: "#6A8F5C" },
  { id: "celeste", nombre: "Celeste", muestra: "#A9CADA" },
  { id: "azul", nombre: "Azul", muestra: "#3F5E8C" },
  { id: "morado", nombre: "Morado y lila", muestra: "#8B6FA8" },
];

/** Los códigos de cada familia (`colores.codigo`). */
const CODIGOS_DE_LA_FAMILIA: Readonly<Record<FamiliaDeColorId, readonly string[]>> = {
  negro: ["NEG"],
  blanco: ["BLA", "CRU", "PER", "FFF", "NEU"],
  gris: ["GRP", "GRM", "GRI", "GRA", "PLR", "PLA", "PLV"],
  beige: ["BEI", "ARN", "NUD", "GPI", "CAQ", "CHA", "VAI"],
  marron: ["CHO", "MOK", "MAR", "MAC", "TOS", "TOP", "CAF", "CAM", "BRO"],
  rosado: ["ROS", "PAL", "RPA", "RCH", "RSA", "FUC", "ORR"],
  rojo: ["ROJ", "RTO", "CER", "VIN", "FRA", "COR", "MSA"],
  naranja: ["NAR", "MAN", "NQU", "SAL", "DUR", "ALB", "AMB", "TER", "COE"],
  amarillo: ["AMM", "AML", "AMA", "MOS", "GIR", "ACH", "DOR", "ORV"],
  verde: ["PIS", "VEL", "SAV", "VOL", "VEM", "VEA", "ESM", "VER", "VEB", "MEN", "VHO", "VJA", "VEO", "VEP", "MIU"],
  celeste: ["CEL", "AZC", "HIB", "AZA"],
  azul: ["AZD", "AZM", "AZF", "AZE", "AZI", "AME", "AZN", "TUR", "AZP", "IND", "COB", "AZU"],
  morado: ["LAV", "LIL", "VIO", "MOR", "MAL", "ORQ", "MOA", "CIR", "BER", "GLI"],
};

const FAMILIA_DEL_CODIGO: ReadonlyMap<string, FamiliaDeColorId> = new Map(
  (Object.entries(CODIGOS_DE_LA_FAMILIA) as [FamiliaDeColorId, readonly string[]][]).flatMap(([familia, codigos]) =>
    codigos.map((codigo) => [codigo, familia] as const),
  ),
);

/**
 * Dónde cae un color que la tabla no conoce, según la familia del ERP (`colores.familia_color`): un amarillo nuevo con los amarillos, un
 * verde con los verdes. Lo «neutro» cae en gris (puede ser blanco o negro: se afina sumando su código arriba) y lo «metalico», con el
 * dorado. Una familia que no está aquí (o sin familia) deja al color sin familia de la tienda.
 */
const FAMILIA_DEL_ERP: Readonly<Record<string, FamiliaDeColorId>> = {
  amarillo: "amarillo",
  azul: "azul",
  metalico: "amarillo",
  morado: "morado",
  naranja: "naranja",
  neutro: "gris",
  rojo: "rojo",
  rosado: "rosado",
  tierra: "marron",
  verde: "verde",
};

/**
 * La familia de la tienda de un color: la de su código si la tabla lo conoce; si no, la que le toca por la familia del ERP; si tampoco,
 * `null` (una variante sin color, o un color que nadie ordenó todavía).
 */
export function familiaDeColorDeLaTienda(codigo: string | null | undefined, familiaDelErp?: string | null): FamiliaDeColorId | null {
  if (!codigo) return null;
  const conocida = FAMILIA_DEL_CODIGO.get(codigo);
  if (conocida) return conocida;
  return familiaDelErp ? (FAMILIA_DEL_ERP[familiaDelErp] ?? null) : null;
}

/** @internal Cada código conocido: existe para la prueba que cruza la tabla con los colores activos de la base (cada uno en una sola familia). */
export const CODIGOS_DE_COLOR_CONOCIDOS: readonly string[] = [...FAMILIA_DEL_CODIGO.keys()];
