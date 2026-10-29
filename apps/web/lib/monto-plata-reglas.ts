/**
 * El monto que una persona escribe en una hoja del fondo (ADR-0362 fase 6; /chaos 2026-10-14, decisión de Felipe 2026-10-14).
 *
 * EL PROBLEMA. `leerMonto` (el de Caja, `caja-cierre-reglas.ts`) borra las comas: en Entregar plata, «1299,50» se leía S/ 129,950.00 y,
 * en el gasto del viaje, «150,5» se leía S/ 1,505.00, con la casilla en ✓ y el pie en «Todo listo» (solo el botón lo delataba). También
 * leía «1e3» (S/ 1,000) y «0x10» (S/ 16). Felipe decidió: en las hojas del fondo la coma decimal se entiende; Caja sigue con su lector
 * hasta que él lo decida. Desde el 2026-10-15 (ADR-0419, Felipe: «arregla lo de la coma decimal») también la usa `CampoMonto`, el campo
 * de plata de 20 pantallas (el cobro de Vender, abonos y entregas de Apartados, Producción, Compras…): su `type="number"` borraba la coma
 * y «2,5» se guardaba como S/ 25 (/chaos de Apartados, 2026-10-15).
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
    // Los miles van de a 3 cifras y el primer grupo no empieza en 0: «0,045» no es 0 + «045» = S/ 45 (mil veces más), es un decimal que esta
    // hoja no admite (revisión de «una tela con sus colores», G13); el costo de un botón a S/ 0.045 se lee con `leerCostoUnitario`.
    if (!/^[1-9]\d{0,2}([.,]\d{3})+$/.test(entera)) return null;
    if (new Set(entera.replace(/\d/g, "")).size > 1) return null; // y con un solo signo
  }
  const n = Number(`${entera.replace(/[.,]/g, "") || "0"}${centimos ? `.${centimos}` : ""}`);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

/** Lo que `CampoMonto` le avisa al padre por cada tecla: el monto leído, o 0 si no se entiende (así ningún botón guarda un monto
 *  adivinado) y la marca `ilegible` para que el campo lo diga. Vacío es 0 y no es un error. */
export function lecturaCampoMonto(texto: string): { valor: number; ilegible: boolean } {
  if (texto.trim() === "") return { valor: 0, ilegible: false };
  const n = leerMontoPlata(texto);
  return n === null ? { valor: 0, ilegible: true } : { valor: n, ilegible: false };
}

/** El reemplazo de `Number(texto)` en un campo de plata que guarda lo escrito como texto: vacío es 0 (como `Number`), lo que no se
 *  entiende es `NaN` (así `> 0` es falso y `|| 0` da 0: ningún botón guarda un monto adivinado), y lo demás se lee con `leerMontoPlata`. */
export function numeroDeMonto(texto: string): number {
  if (texto.trim() === "") return 0;
  return leerMontoPlata(texto) ?? Number.NaN;
}

/** El campo dice que no entendió lo escrito: hay algo y no se lee. */
export function montoIlegible(texto: string): boolean {
  return lecturaCampoMonto(texto).ilegible;
}

/** Lo que dice la hoja cuando el costo por unidad escrito no se entiende. */
export const COSTO_UNITARIO_ILEGIBLE = "No se entiende el costo: escríbelo así, 0.045 o 2,50.";

/**
 * El costo POR UNIDAD de un insumo (un botón a S/ 0.045, un cono de hilo a S/ 0.0451): la plata de una hoja va a céntimos, pero la base
 * guarda `costo_unitario` con 4 decimales (numeric(12,4)) y un avío cuesta céntimos de sol. Con `leerMontoPlata`, «0.045» se rechazaba y
 * «0,045» se leía S/ 45 (revisión de «una tela con sus colores», G13).
 *   · Menor que 1, con 1 a 4 decimales: «0.045», «0,045», «.045», «0,5». Nunca miles: un grupo de miles no empieza en 0.
 *   · Con parte entera y exactamente 4 decimales: «1.2345». Cuatro cifras no pueden ser miles.
 *   · Lo demás se lee como plata (`leerMontoPlata`: céntimos, miles de a tres) y lo ambiguo («12.500») se pide de nuevo.
 * Lo que no cumple, `null`.
 */
export function leerCostoUnitario(texto: string): number | null {
  const t = texto.replace(/\s/g, "").replace(/^s\/\.?/i, "");
  const menorQueUno = /^0?[.,](\d{1,4})$/.exec(t);
  if (menorQueUno) return Number(`0.${menorQueUno[1]}`);
  const cuatroDecimales = /^(\d+)[.,](\d{4})$/.exec(t);
  if (cuatroDecimales) return Number(`${cuatroDecimales[1]}.${cuatroDecimales[2]}`);
  return leerMontoPlata(texto);
}

/** El reemplazo de `numeroDeMonto` para un costo por unidad: vacío es 0, lo que no se entiende es `NaN` (ningún botón guarda un costo adivinado). */
export function numeroDeCostoUnitario(texto: string): number {
  if (texto.trim() === "") return 0;
  return leerCostoUnitario(texto) ?? Number.NaN;
}

/** El campo dice que no entendió el costo por unidad: hay algo escrito y no se lee. */
export function costoUnitarioIlegible(texto: string): boolean {
  return texto.trim() !== "" && leerCostoUnitario(texto) === null;
}

/** Un costo por unidad para leer: a céntimos cuando alcanza («S/ 12.50») y con los decimales que hagan falta cuando no («S/ 0.0451»). */
export function costoUnitarioTexto(n: number): string {
  const aCentimos = Math.round(n * 100) / 100;
  const opciones = Math.abs(n - aCentimos) < 1e-9 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 3, maximumFractionDigits: 4 };
  return `S/\u00a0${n.toLocaleString("es-PE", opciones)}`;
}
