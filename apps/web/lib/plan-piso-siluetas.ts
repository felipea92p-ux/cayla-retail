/**
 * La silueta de cada grupo del plan del piso (ADR-0333: la prenda sin foto se dibuja como el ícono de su categoría, nunca el logo de CAYLA).
 *
 * Los grupos viven en la tabla `grupos_mix`: el líder puede agregar uno sin un deploy. Uno que no tenga silueta propia usa la genérica (una
 * percha con una camisa lisa), nunca se queda sin dibujo ni rompe el riel. El dibujo vive en `components/plan-piso/SiluetasDelPlan.tsx`.
 */

/** Los grupos que la migración `20261006100000` siembra y que tienen silueta propia (la prueba lo compara con el SQL real). */
export const SILUETAS_PROPIAS = [
  "polos_tops_blusas",
  "jeans",
  "pantalones_faldas_shorts",
  "vestidos_conjuntos",
  "bodys_corsets_lenceria",
  "abrigo_y_capas",
  "accesorios_de_impulso",
  "bolsos_y_calzado",
] as const;

export const SILUETA_GENERICA = "otro";

const PROPIAS: ReadonlySet<string> = new Set(SILUETAS_PROPIAS);

/** La silueta que se dibuja para un grupo: la suya si la tiene, la genérica si no. */
export const siluetaDe = (clave: string): string => (PROPIAS.has(clave) ? clave : SILUETA_GENERICA);
