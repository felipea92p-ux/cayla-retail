// Guardar metas y fondo sin pisar lo de otra pestaña (/chaos, gravedad 2, 2026-11-04). `guardar_metas_tienda` y `guardar_metas_mes` reemplazan la semana entera, así que
// una página vieja que mandaba lo que tenía en memoria borraba, sin avisar, lo recién cambiado en otra. Lo que se manda ahora sale de lo último que hay en la base, con solo
// el dato que la persona tocó. Lógica pura: la lectura vive en `lib/metas-frescas.ts`. Queda un margen de milisegundos entre leer y guardar; cerrarlo del todo pediría
// una función de la base que cambie un solo dato.

import type { BorradorTienda } from "./configuracion-reglas";

const texto = (n: number | null) => (n === null ? "" : String(n));

type Fresca = { metas: readonly (number | null)[]; fondo: number | null };

/** Lo que se manda al cambiar el fondo: las metas tal como están en la base. */
export function semanaConFondo(fresca: Fresca, fondo: string): BorradorTienda {
  return { metas: fresca.metas.map(texto), fondo };
}

/** Lo que se manda al cambiar la meta de un día: los otros días y el fondo, tal como están en la base. */
export function semanaConCambio(fresca: Fresca, indice: number, nuevo: string): BorradorTienda {
  return { metas: fresca.metas.map((m, i) => (i === indice ? nuevo : texto(m))), fondo: texto(fresca.fondo) };
}

/** Lo mismo para la semana de un mes. */
export function semanaDelMesConCambio(fresca: readonly (number | null)[], indice: number, nuevo: string): string[] {
  return fresca.map((m, i) => (i === indice ? nuevo : texto(m)));
}
