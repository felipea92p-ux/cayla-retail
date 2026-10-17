import "server-only";
import { cacheLife } from "next/cache";
import { hoyLima, type Dia } from "./cuentas";
import { anioLima } from "./portada";

// El año y el día de Lima para las páginas que se arman por adelantado (cache components, ADR-0432): Next no deja leer el reloj
// mientras arma una página (`new Date()` rompe el armado), pero sí dentro de una lectura guardada. Se guarda una hora: el pie y la
// tarjeta del Club cambian de año una vez al año, y la regla de los 18 años del registro la vuelve a revisar el servidor al crear
// la cuenta (`app/acciones/cuenta.ts`, con el reloj de verdad), así que una hora de atraso aquí no deja pasar a nadie.

/** El año en Lima, para el pie y la tarjeta del Club. */
export async function anioActual(): Promise<number> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return anioLima();
}

/** Hoy en Lima, para la regla de los 18 años en pantalla. */
export async function hoyDeLima(): Promise<Dia> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return hoyLima();
}
