import "server-only";
import { unstable_cache } from "next/cache";
import { base } from "./base";

// Lo que la tienda lee de la base y es IGUAL para todos los que miran (la campaña, las tiendas de la web, los plazos de ayuda, los
// looks): se guarda unos segundos en la caché de datos y se comparte entre visitas, como el catálogo (`catalogo-servidor.ts`). Cien
// clientes abriendo el Inicio a la vez son una consulta a la base, no cien: la conexión de la tienda tiene pocas, y la base es la misma
// del ERP y de Dynamic. Medido en producción el 2026-10-16 (`pg_stat_statements`): `tienda_looks` tardaba 1,6 s de media porque arma el
// catálogo entero por dentro, y se pedía en CADA Inicio y en CADA ficha (por «Combínalo con»). Lo que es de una persona (su cuenta, sus
// favoritos, su bolsa) nunca pasa por aquí.
//
// Se guarda el JSON crudo de la base y se interpreta afuera (una versión nueva de la tienda nunca recibe una copia armada por otra).
// Un fallo NO se guarda: se lanza adentro y quien llama responde su respaldo, para que la visita siguiente lo vuelva a intentar.

/** Una función `retail.tienda_*` sin datos de nadie, guardada `segundos` y compartida entre visitas. */
export function lecturaCompartida<A extends readonly (string | null)[]>(
  clave: string,
  segundos: number,
  consulta: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<unknown> {
  return unstable_cache(consulta, [clave], { revalidate: segundos });
}

/** La conexión de la tienda, para las consultas de `lecturaCompartida` (la misma puerta angosta de `base.ts`). */
export const db = () => base();
