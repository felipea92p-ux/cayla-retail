import "server-only";
import { unstable_cache } from "next/cache";
import { base } from "./base";
import { PAUSA_TRAS_FALLO_MS, unaALaVez } from "./una-a-la-vez";

// Lo que la tienda lee de la base y es IGUAL para todos los que miran (la campaña, las tiendas de la web, los plazos de ayuda, los
// looks): se guarda unos segundos en la caché de datos y se comparte entre visitas, como el catálogo (`catalogo-servidor.ts`). Cien
// clientes abriendo el Inicio a la vez son una consulta a la base, no cien: la conexión de la tienda tiene pocas, y la base es la misma
// del ERP y de Dynamic. Medido en producción el 2026-10-16 (`pg_stat_statements`): `tienda_looks` tardaba 1,6 s de media porque arma el
// catálogo entero por dentro, y se pedía en CADA Inicio y en CADA ficha (por «Combínalo con»). Lo que es de una persona (su cuenta, sus
// favoritos, su bolsa) nunca pasa por aquí.
//
// Se guarda el JSON crudo de la base y se interpreta afuera (una versión nueva de la tienda nunca recibe una copia armada por otra).
// Un fallo NO se guarda: se lanza adentro y quien llama responde su respaldo (o la caché sigue sirviendo la copia vieja).
//
// Pero «la visita siguiente lo vuelve a intentar» no puede ser CADA visita (2026-11-07, la avalancha del probador: 139 cortes en 25
// minutos): al vencer la copia, cada visita lanzaba su propia relectura; con una lectura cara y la base de 2 núcleos, ~5 a la vez pasaban
// de 5 s, ninguna llenaba la caché y cada visita sumaba otra. Por eso toda lectura compartida pasa por `unaALaVez`: una sola en vuelo por
// proceso y argumentos, y tras un fallo, `PAUSA_TRAS_FALLO_MS` sin volver a pedirla desde ese proceso.

/** Una función `retail.tienda_*` sin datos de nadie, guardada `segundos` y compartida entre visitas. */
export function lecturaCompartida<A extends readonly (string | null)[]>(
  clave: string,
  segundos: number,
  consulta: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<unknown> {
  return unstable_cache(unaALaVez(clave, consulta, { pausaMs: PAUSA_TRAS_FALLO_MS }), [clave], { revalidate: segundos });
}

/** La conexión de la tienda, para las consultas de `lecturaCompartida` (la misma puerta angosta de `base.ts`). */
export const db = () => base();

// ---------------------------------------------------------------- La lectura por huella (cambiar-de-modulo#11, 2026-11-13)
//
// El catálogo, los filtros y el probador son lo más caro que la tienda le pide a la base que comparte con el ERP (medido en producción el
// 2026-11-13: ~470, ~317 y ~728 ms por llamada), y `lecturaCompartida` los volvía a pedir cada medio minuto aunque nada hubiera cambiado,
// también de noche. Ahora, cada medio minuto (lo mismo que antes: nada se ve más tarde) la tienda pregunta primero la HUELLA
// (`retail.tienda_catalogo_version()`, 20261113202000: ~1 ms), que cambia con todo lo que esas lecturas muestran; y solo si cambió vuelve a
// pedir la lectura cara. Dos copias:
//   · por argumentos y huella, la lectura armada (`armada`): la base la arma JUNTO con su huella, en la misma consulta (la misma foto de la
//     base), y se guarda bajo esa huella solo si es la que se pidió. Nunca queda guardado algo bajo una huella que no es la suya.
//   · por argumentos, cada `segundos`, la pregunta «¿cuál es la huella ahora?» y la copia de esa huella.
// Si la huella no cambia, la lectura armada igual se rehace cada `SEGUNDOS_SIN_CAMBIOS`: es el tope para lo que la huella no ve a propósito
// (la venta que cumple 30 días y sale de «Más vendidos») o por un descuido. Sin huella (la función todavía no está en la base, o falla), se
// arma como antes: cada `segundos`.

/** El tope de una lectura armada aunque la huella no cambie (ver arriba). */
export const SEGUNDOS_SIN_CAMBIOS = 600;

/** Lo que devuelve la consulta de una lectura por huella: el dato y la huella con que la base lo armó (`null` si se pidió sin ella). */
export type ArmadaConHuella = { dato: unknown; huella: string | null };

/** La base armó la lectura con otra huella que la pedida (algo cambió entre la pregunta y la lectura): se usa, pero no se guarda. */
class HuellaCorrida extends Error {
  readonly dato: unknown;
  constructor(dato: unknown) {
    super("la huella cambió mientras se armaba la lectura");
    this.name = "HuellaCorrida";
    this.dato = dato;
  }
}

/** La huella de ahora, o `null` si la base no la da (la función no existe, falla o responde algo raro). Una sola pregunta en vuelo. */
const huellaDeLaBase = unaALaVez(
  "tienda-huella-v1",
  async (): Promise<string | null> => {
    const [fila] = await base()`select retail.tienda_catalogo_version() as huella`;
    return typeof fila?.huella === "string" && fila.huella !== "" ? fila.huella : null;
  },
  { pausaMs: PAUSA_TRAS_FALLO_MS },
);

// Sin huella la tienda funciona como antes, así que el fallo se anota UNA vez cada 10 minutos por proceso: mientras la función no esté en
// producción, una línea cada medio minuto taparía el resto del registro. Solo el evento y lo que dijo la base.
const AVISO_SIN_HUELLA_CADA_MS = 600_000;
let ultimoAvisoSinHuella = -Infinity;
async function huellaAhora(): Promise<string | null> {
  try {
    return await huellaDeLaBase();
  } catch (error) {
    const ahora = Date.now();
    if (ahora - ultimoAvisoSinHuella >= AVISO_SIN_HUELLA_CADA_MS) {
      ultimoAvisoSinHuella = ahora;
      console.error(JSON.stringify({ evento: "tienda_huella_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    }
    return null;
  }
}

/** Una lectura cara `retail.tienda_*` sin datos de nadie, compartida entre visitas, que se vuelve a pedir a la base solo si cambió la huella
 *  (revisada cada `segundos`). `consulta(conHuella, ...args)` pide el dato y, con `conHuella`, también la huella EN LA MISMA CONSULTA:
 *  `select retail.tienda_x($1) as dato, retail.tienda_catalogo_version() as huella`. */
export function lecturaPorHuella<A extends readonly (string | null)[]>(
  clave: string,
  segundos: number,
  consulta: (conHuella: boolean, ...args: A) => Promise<ArmadaConHuella>,
): (...args: A) => Promise<unknown> {
  // Una sola lectura cara en vuelo por proceso y argumentos (la pidan con la huella vieja o con la nueva), y la pausa tras un fallo.
  const armar = unaALaVez(`${clave}:armar`, (conHuella: boolean, ...args: A) => consulta(conHuella, ...args), { pausaMs: PAUSA_TRAS_FALLO_MS });
  const armada = unstable_cache(
    async (huella: string, ...args: A): Promise<unknown> => {
      const lectura = await armar(true, ...args);
      if (lectura.huella !== huella) throw new HuellaCorrida(lectura.dato);
      return lectura.dato;
    },
    [`${clave}:armada`],
    { revalidate: SEGUNDOS_SIN_CAMBIOS },
  );
  return unstable_cache(
    async (...args: A): Promise<unknown> => {
      const huella = await huellaAhora();
      if (huella === null) return (await armar(false, ...args)).dato;
      try {
        return await armada(huella, ...args);
      } catch (error) {
        // Algo cambió entre la pregunta y la lectura: la lectura es MÁS nueva que la huella pedida. Sirve ahora (y queda en esta copia los
        // `segundos` de siempre), pero no se guarda con una huella que no es la suya. La próxima vuelta pregunta la huella de nuevo.
        if (error instanceof HuellaCorrida) return error.dato;
        throw error;
      }
    },
    [clave],
    { revalidate: segundos },
  );
}
