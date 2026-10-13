/**
 * La silueta de cada grupo del plan del piso (ADR-0333: la prenda sin foto se dibuja como el ícono de su categoría, nunca el logo de CAYLA).
 *
 * Los grupos viven en la tabla `grupos_mix` y un grupo nuevo entra por migración (no hay pantalla ni RPC que los cree). Uno que no tenga silueta propia usa la
 * genérica (una percha con una camisa lisa), nunca se queda sin dibujo ni rompe el riel. OJO: un séptimo grupo EN EL RIEL repetiría el color del primero (los
 * colores son seis, `--grupo-0..5`); quien lo agregue suma en el mismo cambio su silueta, su color y su lugar en `lib/plan-piso-siluetas.test.ts`. El dibujo
 * vive en `components/plan-piso/SiluetasDelPlan.tsx`.
 *
 * UN GRUPO CON VARIAS PRENDAS (Felipe, 2026-10-13): «Polos, tops y blusas» no es solo polos. Su riel y su ícono reparten tres siluetas (polo, top de tirantes y
 * blusa de manga acampanada) para que el grupo se lea como lo que es. Es dibujo, no dato: la percha de un color no dice «aquí cuelga un top»; solo muestra que el
 * grupo mezcla estas prendas. Un grupo sin variantes dibuja siempre la suya.
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


/**
 * Los grupos que mezclan varias prendas y las siluetas que reparten, en el orden en que se reparten. La primera es SIEMPRE la propia del grupo (la que dibuja un ícono
 * sin colores y la que usaba el grupo antes de tener variantes). Cada id es un `<symbol id="pp-s-…">` de `SiluetasDelPlan.tsx`: la prueba lo comprueba.
 */
export const VARIANTES_DE_SILUETA: Readonly<Record<string, readonly string[]>> = {
  polos_tops_blusas: ["polos_tops_blusas", "polos_tops_blusas_top", "polos_tops_blusas_blusa"],
};

/** Las siluetas de un grupo, en orden: las suyas si mezcla varias prendas; si no, solo la de `siluetaDe` (nunca vacío). */
export const variantesDeSilueta = (clave: string): readonly string[] =>
  Object.prototype.hasOwnProperty.call(VARIANTES_DE_SILUETA, clave) ? VARIANTES_DE_SILUETA[clave]! : [siluetaDe(clave)];

/**
 * La silueta de la percha número `k` de un tramo (0 es la primera de la izquierda): reparte las variantes de a una, en rueda, así que un tramo de 8 perchas de
 * «Polos, tops y blusas» cuelga polo, top, blusa, polo, top, blusa, polo, top. Depende solo de la posición: sin azar, igual en servidor y en cliente.
 */
export function siluetaDePrenda(clave: string, k: number): string {
  const variantes = variantesDeSilueta(clave);
  const i = Number.isFinite(k) ? Math.trunc(k) : 0;
  return variantes[((i % variantes.length) + variantes.length) % variantes.length]!;
}

/**
 * En el ícono de un grupo las prendas se superponen y la de al frente tapa a las de atrás. Con el orden del riel (polo, top, blusa) el top, que es la más angosta, quedaba
 * en medio y asomaba apenas como una raya, sobre todo con un solo color; con el top al frente, el polo en medio y la blusa, la más ancha, atrás, se ven las tres
 * (medido a 24 × 19 px y ampliado, 2026-10-13). Un grupo que no aparece aquí usa el orden de `VARIANTES_DE_SILUETA`. Cada lista es una permutación de sus lugares.
 */
export const ORDEN_DEL_ICONO: Readonly<Record<string, readonly number[]>> = {
  polos_tops_blusas: [1, 0, 2],
};

/** La silueta de la prenda número `i` del ícono (0 es la de más al frente): `variantesDeSilueta` en el orden de `ORDEN_DEL_ICONO`. */
export function siluetaDeIcono(clave: string, i: number): string {
  const variantes = variantesDeSilueta(clave);
  const orden = Object.prototype.hasOwnProperty.call(ORDEN_DEL_ICONO, clave) ? ORDEN_DEL_ICONO[clave]! : variantes.map((_, k) => k);
  const lugar = Number.isFinite(i) ? Math.trunc(i) : 0;
  return variantes[orden[((lugar % orden.length) + orden.length) % orden.length]!]!;
}

/**
 * Cuántas prendas dibuja el ícono con colores: una por color, y un grupo que mezcla prendas (varias variantes) dibuja SIEMPRE todas las suyas aunque tenga menos
 * colores (los colores se reparten en rueda: con uno solo, polo, top y blusa de ese color). Sin colores el ícono dibuja una sola silueta y no pasa por aquí.
 */
export function prendasDelIcono(clave: string, colores: number): number {
  const variantes = variantesDeSilueta(clave).length;
  const n = Number.isFinite(colores) && colores > 0 ? Math.floor(colores) : 0;
  return Math.max(n, variantes > 1 ? variantes : 0);
}
