/**
 * Los blancos de una cifra escrita a mano, para TODO lector de números del ERP (/chaos de «Nuevo avío», 2026-10-31).
 *
 * EL PROBLEMA. `leerCantidad` y `leerMontoPlata` empezaban por `texto.replace(/\s/g, "")`. El borrado estaba puesto a
 * propósito, para que «1 200» se lea 1200 — pero borraba TODO blanco antes de validar, así que una columna de tres celdas
 * de Excel pegada en «¿Ya tienes?» («12», «8», «5») entraba como 1 285 unidades, con su lote de S/ 642.50, sin aviso y
 * sin borde rojo. El dato queda mal y coherente consigo mismo: ninguna invariante de la base lo puede ver.
 *
 * LO QUE SE MIDIÓ en el navegador antes de escribir la regla: pegar FILAS de una hoja de cálculo deja en el campo espacios
 * ORDINARIOS (el salto de línea nunca llega hasta el campo, así que rechazarlo no habría servido de nada), pegar COLUMNAS
 * deja la tabulación literal, y un copiado de la web deja el espacio no-rompible (U+00A0), que es un separador de miles
 * de verdad y tiene que seguir valiendo.
 *
 * LA REGLA, por eso, es de FORMA y no de carácter: un blanco adentro solo vale si separa grupos de TRES cifras.
 */

/** Los blancos que llegan de un pegado y que nadie escribe a mano en un campo de UNA línea (medido en el navegador). */
const DE_UN_PEGADO = /[\t\n\r]/;

/**
 * PROMETE: el mismo texto sin los blancos que separan miles («1 200» → «1200»), o `null` si algún blanco de adentro no
 * separa miles de a tres cifras («12 8 5», «1 20», una tabulación) — lo que delata un pegado de varias celdas.
 * ASUME: un campo de UNA línea, de los que escribe o pega una persona. Lo de los extremos no dice nada y se recorta.
 * NO decide si el resto es un número: eso lo sigue haciendo cada lector con su propia regla.
 */
export function sinBlancosDeMiles(texto: string): string | null {
  const t = texto.trim();
  if (DE_UN_PEGADO.test(t)) return null;
  if (!/\s/.test(t)) return t;
  // Se quita el blanco que está entre una cifra y un grupo de tres cifras: «1 200», «1 200 000», «1 299,50».
  const juntado = t.replace(/(\d)\s(?=\d{3}(\D|$))/g, "$1");
  // Si quedó alguno, lo escrito no era UNA cifra: «12 8 5» no se adivina.
  return /\s/.test(juntado) ? null : juntado;
}

/**
 * Lo que se deja escribir en un campo de CIFRA ENTERA (días, horas): solo cifras —y el signo, si el campo lo admite—,
 * **conservando los blancos**.
 *
 * Un entero no tiene separador de miles, así que un blanco aquí no significa nada… salvo una cosa: que se pegaron
 * varias celdas. Conservarlo es justamente lo que permite que el validador de abajo lo diga («Escribe cuántos días…»,
 * el campo en rojo) en vez de que el filtro junte las celdas en un número plausible: pegar «12», «8» y «5» dejaba
 * escrito «1285» —mil doscientos ochenta y cinco días— sin una palabra (/chaos 2026-10-31).
 */
export function soloCifrasEscritas(texto: string, { signo = false } = {}): string {
  return texto.replace(signo ? /[^\d\s-]/g : /[^\d\s]/g, "");
}
