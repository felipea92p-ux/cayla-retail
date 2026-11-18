import { describe, expect, it } from "vitest";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import { camposDeFichaDeLaTela, camposDeIngresoDeInsumo, ingresoListo } from "./insumos-guia";
import { CANTIDAD_ILEGIBLE } from "./insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE } from "./monto-plata-reglas";

// La guía de las hojas de Insumos dice lo mismo que la hoja: se puede guardar exactamente cuando la validación de esa hoja no encuentra nada y alguien firma.
// (El alta de una tela se prueba en `tela-nueva-reglas.test.ts` y la de un avío en `avio-nuevo-reglas.test.ts`; «Nuevo insumo» se retiró con ADR-0580.)

describe("la guía de la «Ficha de la tela»", () => {
  it("solo exige quién la anota; el tejido y el color se sugieren; un avío no pide tejido", () => {
    const tela = camposDeFichaDeLaTela({ tipo: "tela", tejidoId: "", colorCodigo: "", responsableListo: true });
    expect(sePuedeConfirmar(tela)).toBe(true);
    expect(faltanDe(tela).map((c) => c.id)).toEqual(["tejido", "color"]);
    expect(sePuedeConfirmar(camposDeFichaDeLaTela({ tipo: "tela", tejidoId: "t", colorCodigo: "c", responsableListo: false }))).toBe(false);
    expect(camposDeFichaDeLaTela({ tipo: "avio", tejidoId: "", colorCodigo: "", responsableListo: true }).map((c) => c.id)).toEqual(["color", "quien"]);
  });
});

describe("la guía de «Ingresar insumo»", () => {
  const entradas = [
    { tieneInsumo: true, cantidad: "100", costo: "12.5" },
    { tieneInsumo: true, cantidad: "100", costo: "0" },
    { tieneInsumo: true, cantidad: "100", costo: "" },
    { tieneInsumo: true, cantidad: "0", costo: "12" },
    { tieneInsumo: true, cantidad: "", costo: "12" },
    { tieneInsumo: true, cantidad: "abc", costo: "12" },
    { tieneInsumo: true, cantidad: "10", costo: "-3" },
    { tieneInsumo: false, cantidad: "10", costo: "12" },
  ];
  for (const e of entradas) {
    for (const firma of [true, false]) {
      it(`${JSON.stringify(e)}${firma ? "" : " · sin responsable"}: el botón se enciende justo cuando la hoja lo aceptaría`, () => {
        expect(sePuedeConfirmar(camposDeIngresoDeInsumo({ ...e, responsableListo: firma }))).toBe(ingresoListo(e) && firma);
      });
    }
  }
  it("un costo de cero escrito es válido (un regalo), un costo vacío no", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo: "0" })).toBe(true);
    expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo: " " })).toBe(false);
  });

  it("la coma decimal se entiende en la cantidad y en el costo", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "48,2", costo: "2,5" })).toBe(true);
    expect(ingresoListo({ tieneInsumo: true, cantidad: "48.2", costo: "2.5" })).toBe(true);
    // Un botón a S/ 0.045 (G13 de la revisión de «una tela con sus colores»): el costo por unidad admite hasta 4 decimales.
    for (const costo of ["0.045", "0,045", "0.0451"]) expect(ingresoListo({ tieneInsumo: true, cantidad: "288", costo }), costo).toBe(true);
  });

  it("un costo que no se entiende NO se lee como cero: la hoja no deja guardar (antes «2,5,5» abría el lote gratis)", () => {
    for (const costo of ["abc", "2,5,5", "1e3", "S/ x"]) expect(ingresoListo({ tieneInsumo: true, cantidad: "5", costo }), costo).toBe(false);
  });

  it("una cantidad ambigua no se adivina: «1,299» ¿mil doscientos noventa y nueve o uno con tres?", () => {
    expect(ingresoListo({ tieneInsumo: true, cantidad: "1,299", costo: "2" })).toBe(false);
  });

  it("la guía dice QUÉ no se entendió, no solo que falta", () => {
    const campos = camposDeIngresoDeInsumo({ tieneInsumo: true, cantidad: "1,299", costo: "abc", responsableListo: true });
    expect(campos.find((c) => c.id === "cantidad")?.pendiente).toBe(CANTIDAD_ILEGIBLE);
    expect(campos.find((c) => c.id === "costo")?.pendiente).toBe(COSTO_UNITARIO_ILEGIBLE);
    // Vacío no es «ilegible»: dice lo que falta.
    const vacios = camposDeIngresoDeInsumo({ tieneInsumo: true, cantidad: "", costo: "", responsableListo: true });
    expect(vacios.find((c) => c.id === "cantidad")?.pendiente).toBe("Escribe cuánto llegó (más de cero).");
    expect(vacios.find((c) => c.id === "costo")?.pendiente).toBe("Escribe el costo por unidad, sin IGV (0 si fue un regalo).");
  });
});
