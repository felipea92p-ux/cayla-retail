// «Pregúntale a CAYLA» (ADR-0529, actividad 6): el RELLENO. Sin React ni DOM: se prueba en `relleno.test.ts`.
//
// Felipe eligió «llena, la persona confirma»: el asistente puede escribir en un campo lo que la persona dijo («¿cómo anulo la boleta
// B001-482?» → «B001-482» en el buscador), y el botón que guarda lo aprieta ella. Es la parte delicada del ADR, por eso va con tres
// candados, y este archivo es el primero:
//   1. solo lo que la persona ESCRIBIÓ en su pregunta, tal cual (`rellenoValido`): la IA no adivina ni completa un dato;
//   2. solo en un paso cuya guía ya escribe ahí un ejemplo (`pasoSePuedeRellenar`) y, en la pantalla, solo en un campo marcado
//      `data-asistente="rellenable"` (lista blanca: hoy, el `<Buscador>`; lo vigila `lib/asistente-rellenable.test.ts`);
//   3. guardar sigue prohibido como siempre (`motivoParaNoTocar` no cambia).

import { normalizar } from "../guias/reglas";
import type { PasoGuia } from "../guias/tipos";

/** Un dato para escribir es corto: un número de boleta, un código, el nombre de una prenda. Más largo ya no es un dato, es un texto. */
const LARGO_MAXIMO = 60;

/** ¿El paso es uno donde la guía ya escribe un ejemplo? Ahí, y solo ahí, el asistente puede escribir lo que la persona dijo. */
export function pasoSePuedeRellenar(paso: PasoGuia): boolean {
  return !!paso.demostrar?.some((a) => a.tipo === "escribir");
}

/**
 * El dato que propone la IA, si se puede escribir: no vacío, corto, que aparezca TAL CUAL en la pregunta de la persona (sin tildes ni
 * mayúsculas) y que no sea uno de los huecos que deja `limpiarDatosPersonales` («[número]», «[correo]»: un DNI nunca se rellena).
 * Devuelve el dato limpio o `null`.
 */
export function rellenoValido(propuesto: string, pregunta: string): string | null {
  const dato = propuesto.trim().replace(/\s+/g, " ");
  if (dato.length < 2 || dato.length > LARGO_MAXIMO) return null;
  if (/\[(número|correo)\]/i.test(dato)) return null;
  if (!normalizar(pregunta).includes(normalizar(dato))) return null;
  return dato;
}
