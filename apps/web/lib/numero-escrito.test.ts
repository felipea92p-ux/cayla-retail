import { describe, expect, it } from "vitest";
import { sinBlancosDeMiles } from "./numero-escrito";
import { leerCantidad } from "./insumos-reglas";
import { leerCostoUnitario, leerMontoPlata, numeroDeMonto } from "./monto-plata-reglas";

// /chaos de «Nuevo avío» (2026-10-31, semilla 1496), hallazgo 1 de gravedad 2. Felipe pidió arreglarlo primero.
//
// LO QUE PASÓ. Se copió una columna de tres celdas de Excel («12», «8», «5») y se pegó en «¿Ya tienes?» de la hoja de un avío.
// Quedó un lote de 1 285 unidades y S/ 642.50 de valor de inventario, sin aviso y sin borde rojo. Lo mismo en el costo.
//
// POR QUÉ. `leerCantidad` y `leerMontoPlata` empezaban por `texto.replace(/\s/g, "")`: borraban TODO blanco antes de validar,
// así que «12 8 5» se volvía «1285», un número perfectamente legible. El borrado estaba puesto a propósito, para que «1 200»
// se lea 1200.
//
// LO QUE SE MIDIÓ EN EL NAVEGADOR (2026-10-31, Chrome del navegador integrado, con el pegado real de macOS):
//   · pegar FILAS de una hoja de cálculo («12\n8\n5») deja en el campo «12 8 5», con espacios ORDINARIOS: el salto de línea
//     nunca llega, así que rechazarlo no habría servido de nada;
//   · pegar COLUMNAS («12\t8\t5») deja la tabulación literal;
//   · un copiado de la web deja el espacio no-rompible (U+00A0), que es un separador de miles de verdad y tiene que seguir valiendo.
// Por eso la regla es de FORMA, no de carácter: un espacio adentro solo vale si separa grupos de TRES cifras.
describe("sinBlancosDeMiles: un espacio adentro solo separa miles", () => {
  it("el pegado de varias celdas no se adivina: ni filas (espacios) ni columnas (tabulaciones)", () => {
    expect(sinBlancosDeMiles("12 8 5")).toBeNull();
    expect(sinBlancosDeMiles("12\t8\t5")).toBeNull();
    expect(sinBlancosDeMiles("12\n8\n5")).toBeNull();
    expect(sinBlancosDeMiles("12\r\n8\r\n5")).toBeNull();
    expect(sinBlancosDeMiles("1 20")).toBeNull();
    expect(sinBlancosDeMiles("1 2345")).toBeNull();
  });
  it("el separador de miles sigue valiendo, también el no-rompible que deja un copiado de la web", () => {
    expect(sinBlancosDeMiles("1 200")).toBe("1200");
    expect(sinBlancosDeMiles("1 200")).toBe("1200");
    expect(sinBlancosDeMiles("1 200 000")).toBe("1200000");
    expect(sinBlancosDeMiles("1 299,50")).toBe("1299,50");
  });
  it("los blancos de los extremos no dicen nada, y lo que no trae blancos pasa tal cual", () => {
    expect(sinBlancosDeMiles("  48,25  ")).toBe("48,25");
    expect(sinBlancosDeMiles("\t 1200 \n")).toBe("1200");
    expect(sinBlancosDeMiles("48.2")).toBe("48.2");
    expect(sinBlancosDeMiles("")).toBe("");
  });
});

describe("el pegado de tres celdas no entra como un número (los tres lectores de cifras del ERP)", () => {
  it("una cantidad: «12 8 5» ya no son 1 285 unidades", () => {
    expect(leerCantidad("12 8 5")).toBeNull();
    expect(leerCantidad("12\t8\t5")).toBeNull();
    expect(leerCantidad("1 200")).toBe(1200); // y el separador de miles no se perdió
  });
  it("un monto: «12 8 5» ya no son S/ 1,285.00", () => {
    expect(leerMontoPlata("12 8 5")).toBeNull();
    expect(leerMontoPlata("S/ 12 8 5")).toBeNull();
    expect(numeroDeMonto("12 8 5")).toBeNaN();
    expect(leerMontoPlata(" 1 299,50 ")).toBe(1299.5);
    expect(leerMontoPlata("S/ 100")).toBe(100);
  });
  it("un costo por unidad: «0 045 5» ya no son S/ 45.50", () => {
    expect(leerCostoUnitario("0 045 5")).toBeNull();
    expect(leerCostoUnitario("2 5 3")).toBeNull();
    expect(leerCostoUnitario("S/ 0.045")).toBe(0.045);
  });
});
