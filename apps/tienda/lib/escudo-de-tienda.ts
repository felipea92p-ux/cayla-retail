// El escudo de cada tienda en la cabecera (Felipe 2026-10-26: «en lugar de poner en letras Trujillo, su escudo; igual con AQP y Lima, y al pasar
// el mouse aparece en letras»). Cada ciudad tiene el suyo: el archivo vive en `public/escudos/` y se reconoce por la clave de la tienda
// (`claveDeSede`: «Arequipa» → «arequipa»), la misma de `?sede=`. Una tienda sin escudo (la que un Líder crea sin deploy) sigue diciéndose con
// su nombre en letras: nada se rompe. Lógica pura, con su prueba al lado, que además exige que cada escudo anotado aquí tenga su archivo y
// que no sobre ninguno en la carpeta. De dónde salen y bajo qué licencia: `lib/escudos-creditos.ts` (se muestra en el pie de la tienda).

import { claveDeSede } from "./sede-elegida";

/** Clave de la tienda → dirección de su escudo. Se suma una línea por ciudad cuando su archivo entra a `public/escudos/`. */
export const ESCUDOS_DE_TIENDA: Readonly<Record<string, string>> = {
  arequipa: "/escudos/arequipa.png",
  lima: "/escudos/lima.png",
  trujillo: "/escudos/trujillo.png",
};

/** La dirección del escudo de una tienda, o `null` si todavía no tiene (entonces se dice con su nombre). */
export function escudoDe(nombre: string): string | null {
  return ESCUDOS_DE_TIENDA[claveDeSede(nombre)] ?? null;
}
