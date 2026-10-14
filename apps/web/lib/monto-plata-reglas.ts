/**
 * El monto que una persona escribe en una hoja del fondo (ADR-0362 fase 6; /chaos 2026-10-14, decisión de Felipe 2026-10-14).
 *
 * EL PROBLEMA. `leerMonto` (el de Caja, `caja-cierre-reglas.ts`) borra las comas: en Entregar plata, «1299,50» se leía S/ 129,950.00 y,
 * en el gasto del viaje, «150,5» se leía S/ 1,505.00, con la casilla en ✓ y el pie en «Todo listo» (solo el botón lo delataba). También
 * leía «1e3» (S/ 1,000) y «0x10» (S/ 16). Felipe decidió: en las hojas del fondo la coma decimal se entiende; Caja sigue con su lector
 * hasta que él lo decida.
 *
 * LA REGLA. Solo cifras, puntos y comas (más «S/» al inicio y espacios, que no cuentan, y un «-» adelante, que la hoja rechaza).
 *   · El ÚLTIMO separador es de céntimos si le siguen 1 o 2 cifras: «1299,50», «1299.5», «1.299,50», «1,299.50», «150,5».
 *   · Si le siguen 3 cifras y es una coma, es de miles: «1,299» (como se ve en pantalla, S/ 1,299.00).
 *   · Si le siguen 3 cifras y es el único punto, no se sabe: «12.500» ¿es doce mil quinientos o doce con cincuenta y un cero de más?
 *     No se adivina: se pide de nuevo (`MONTO_ILEGIBLE`).
 *   · Los separadores de la parte entera son de miles: de a 3 cifras, todos iguales y distintos del de los céntimos.
 *   · Un separador al final no cuenta («100.» mientras se escribe es 100).
 * Lo que no cumple, `null`: la hoja dice cómo escribirlo y no deja guardar.
 */

/** Lo que dice la hoja cuando el monto escrito no se entiende. */
export const MONTO_ILEGIBLE = "No se entiende el monto: escríbelo así, 1299.50 o 1299,50.";

export function leerMontoPlata(texto: string): number | null {
  // Un menos adelante se lee (la hoja dice «tiene que ser mayor que cero», que se entiende mejor que «no se entiende»).
  const crudo = texto.replace(/\s/g, "");
  const negativo = crudo.startsWith("-");
  const t = (negativo ? crudo.slice(1) : crudo).replace(/^s\/\.?/i, "");
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  // «100.» o «100,» mientras se escribe: el separador final no cuenta (uno solo).
  const sinFinal = t.replace(/[.,]$/, "");
  if (sinFinal === "" || /[.,]$/.test(sinFinal)) return null;

  const i = Math.max(sinFinal.lastIndexOf("."), sinFinal.lastIndexOf(","));
  let entera = sinFinal;
  let centimos = "";
  if (i >= 0) {
    const sep = sinFinal[i];
    const cola = sinFinal.slice(i + 1);
    if (cola.length <= 2) {
      entera = sinFinal.slice(0, i);
      centimos = cola;
      // El separador de los céntimos no se repite en la parte entera («1.299.50»).
      if (entera.includes(sep)) return null;
    } else if (cola.length === 3 && sep === "." && sinFinal.indexOf(".") === i && !sinFinal.includes(",")) {
      return null; // «12.500»: ¿miles o céntimos de más? Se pide de nuevo.
    }
  }
  if (/[.,]/.test(entera)) {
    if (!/^\d{1,3}([.,]\d{3})+$/.test(entera)) return null; // los miles van de a 3 cifras
    if (new Set(entera.replace(/\d/g, "")).size > 1) return null; // y con un solo signo
  }
  const n = Number(`${entera.replace(/[.,]/g, "") || "0"}${centimos ? `.${centimos}` : ""}`);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}
