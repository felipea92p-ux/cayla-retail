import "server-only";
import { base } from "./base";
import { crearSondeo } from "./salud";

// `GET /api/salud` de la tienda (ADR-0450): corre `select 1` por la MISMA conexión que usan las páginas (`base()`, el grupo de 3 conexiones
// del usuario `tienda_web_prod`). Si la base cae, o si la tienda ocupó todas sus conexiones y ninguna queda libre, no responde a tiempo y
// el vigía de GitHub avisa. No lee ninguna tabla ni función de la tienda: el usuario `tienda_web` no tiene permiso sobre ninguna tabla.
export const saludDeLaTienda = crearSondeo(() => base()`select 1 as ok`);
