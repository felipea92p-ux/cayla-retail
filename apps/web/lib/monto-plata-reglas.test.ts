import { describe, expect, it } from "vitest";
import { costoUnitarioIlegible, costoUnitarioTexto, lecturaCampoMonto, leerCostoUnitario, leerMontoPlata, montoIlegible, numeroDeCostoUnitario, numeroDeMonto } from "./monto-plata-reglas";

describe("leerMontoPlata (el monto de una hoja del fondo, /chaos 2026-10-14)", () => {
  it("la coma decimal se entiende: «1299,50» es S/ 1,299.50 y «150,5» es S/ 150.50 (antes, 129 950 y 1 505)", () => {
    expect(leerMontoPlata("1299,50")).toBe(1299.5);
    expect(leerMontoPlata("150,5")).toBe(150.5);
    expect(leerMontoPlata("0,50")).toBe(0.5);
    expect(leerMontoPlata(",5")).toBe(0.5);
  });
  it("el punto decimal, como siempre", () => {
    expect(leerMontoPlata("1299.50")).toBe(1299.5);
    expect(leerMontoPlata("40")).toBe(40);
    expect(leerMontoPlata("0.01")).toBe(0.01);
  });
  it("los miles: con coma de a 3 cifras (como se ve en pantalla) y con el otro signo cuando hay céntimos", () => {
    expect(leerMontoPlata("1,299")).toBe(1299);
    expect(leerMontoPlata("1,299.50")).toBe(1299.5);
    expect(leerMontoPlata("1.299,50")).toBe(1299.5);
    expect(leerMontoPlata("1,299,000")).toBe(1299000);
    expect(leerMontoPlata("1.299.000")).toBe(1299000);
  });
  it("«12.500» no se adivina (¿miles o un cero de más?): se pide de nuevo", () => {
    expect(leerMontoPlata("12.500")).toBeNull();
    expect(leerMontoPlata("10.005")).toBeNull();
  });

  it("un grupo de miles nunca empieza en 0: «0,045» no es S/ 45 (es un decimal que esta hoja no admite) y se pide de nuevo", () => {
    // Revisión de «una tela con sus colores» (G13): «0,045» se leía como 0 + «045» = S/ 45, mil veces más.
    for (const t of ["0,045", "0,125", "0.045", "0.125", "00,125", "012,345", "00,5,000"]) {
      expect(leerMontoPlata(t), t).toBeNull();
    }
    expect(leerMontoPlata("1,045")).toBe(1045);
    expect(leerMontoPlata("999,999")).toBe(999999);
    expect(leerMontoPlata("0,50")).toBe(0.5);
  });
  it("un menos adelante se lee (la hoja lo rechaza diciendo «mayor que cero»)", () => {
    expect(leerMontoPlata("-20")).toBe(-20);
    expect(leerMontoPlata("-1299,50")).toBe(-1299.5);
  });
  it("«S/», espacios y un separador al final no cuentan", () => {
    expect(leerMontoPlata("S/ 100")).toBe(100);
    expect(leerMontoPlata("S/.100")).toBe(100);
    expect(leerMontoPlata(" 1 299,50 ")).toBe(1299.5);
    expect(leerMontoPlata("100.")).toBe(100);
    expect(leerMontoPlata("100,")).toBe(100);
  });
  it("lo que no es un monto: vacío, letras, notación de máquina, signos, más de 2 decimales, miles mal agrupados", () => {
    for (const t of ["", "  ", "abc", "12abc", "1e3", "0x10", "--20", "+5", "100 soles", "1,2345", "1.5.5", "1.299.50", "12.34.56", "1.299,000", "1,23,456", "100.,", ".", ","]) {
      expect(leerMontoPlata(t), t).toBeNull();
    }
  });
});

describe("lecturaCampoMonto: lo que `CampoMonto` le avisa al padre (ADR-0419, /chaos 2026-10-15)", () => {
  it("la coma decimal se entiende: «2,5» es S/ 2.50, no S/ 25 (el `type=number` del navegador borraba la coma)", () => {
    expect(lecturaCampoMonto("2,5")).toEqual({ valor: 2.5, ilegible: false });
    expect(lecturaCampoMonto("12,50")).toEqual({ valor: 12.5, ilegible: false });
    expect(lecturaCampoMonto("1.299,50")).toEqual({ valor: 1299.5, ilegible: false });
    expect(lecturaCampoMonto("1,299.50")).toEqual({ valor: 1299.5, ilegible: false });
    expect(lecturaCampoMonto("1,299")).toEqual({ valor: 1299, ilegible: false });
  });
  it("vacío es 0 sin queja; mientras se escribe «100.» ya es 100", () => {
    expect(lecturaCampoMonto("")).toEqual({ valor: 0, ilegible: false });
    expect(lecturaCampoMonto("100.")).toEqual({ valor: 100, ilegible: false });
  });
  it("lo que no se entiende avisa 0 al padre (no se guarda nada) y se marca ilegible: nunca se adivina", () => {
    for (const t of ["12.500", "12.345", "abc", "1e3", "1,2,3", "1.299.50"]) expect(lecturaCampoMonto(t), t).toEqual({ valor: 0, ilegible: true });
  });
  it("un negativo pasa tal cual: la hoja dice «tiene que ser mayor que cero»", () => {
    expect(lecturaCampoMonto("-5")).toEqual({ valor: -5, ilegible: false });
  });
});

describe("numeroDeMonto: el reemplazo de `Number(texto)` en los campos de plata que guardan texto (ADR-0419)", () => {
  it("lee la coma decimal donde `Number` daba NaN, y vacío sigue siendo 0 como con `Number`", () => {
    expect(numeroDeMonto("2,5")).toBe(2.5);
    expect(numeroDeMonto("1.299,50")).toBe(1299.5);
    expect(numeroDeMonto("12.40")).toBe(12.4);
    expect(numeroDeMonto("")).toBe(0);
    expect(numeroDeMonto("  ")).toBe(0);
  });
  it("lo que no se entiende es NaN: `> 0` es falso y `|| 0` da 0, así que ningún botón guarda un monto adivinado", () => {
    for (const t of ["12.500", "abc", "1e3", "0x10"]) expect(numeroDeMonto(t), t).toBeNaN();
  });
  it("montoIlegible marca el campo solo si hay algo escrito que no se entiende", () => {
    expect(montoIlegible("")).toBe(false);
    expect(montoIlegible("2,5")).toBe(false);
    expect(montoIlegible("12.500")).toBe(true);
  });
});

describe("leerCostoUnitario: el costo por unidad de un insumo, con hasta 4 decimales (G13 de la revisión de «una tela con sus colores»)", () => {
  it("un botón a S/ 0.045: con punto o con coma, con o sin el cero de adelante", () => {
    for (const t of ["0.045", "0,045", ".045", ",045", "S/ 0.045", " 0,045 "]) expect(leerCostoUnitario(t), t).toBe(0.045);
    expect(leerCostoUnitario("0.0451")).toBe(0.0451);
    expect(leerCostoUnitario("0,5")).toBe(0.5);
    expect(leerCostoUnitario("0,05")).toBe(0.05);
  });
  it("cuatro decimales con parte entera no pueden ser miles: son decimales", () => {
    expect(leerCostoUnitario("1.2345")).toBe(1.2345);
    expect(leerCostoUnitario("12,3456")).toBe(12.3456);
  });
  it("lo demás se lee como plata (céntimos, miles de a tres) y lo ambiguo se pide de nuevo", () => {
    expect(leerCostoUnitario("2.50")).toBe(2.5);
    expect(leerCostoUnitario("1299,50")).toBe(1299.5);
    expect(leerCostoUnitario("1,299")).toBe(1299);
    expect(leerCostoUnitario("12.500")).toBeNull();
    for (const t of ["", "abc", "0,00123", "1e3", "-", "0..5"]) expect(leerCostoUnitario(t), t).toBeNull();
  });
  it("numeroDeCostoUnitario: vacío es 0 y lo que no se entiende es NaN (ningún botón guarda un costo adivinado)", () => {
    expect(numeroDeCostoUnitario("")).toBe(0);
    expect(numeroDeCostoUnitario("0,045")).toBe(0.045);
    expect(numeroDeCostoUnitario("abc")).toBeNaN();
    expect(costoUnitarioIlegible("abc")).toBe(true);
    expect(costoUnitarioIlegible("0,045")).toBe(false);
    expect(costoUnitarioIlegible("  ")).toBe(false);
  });
  it("costoUnitarioTexto: a céntimos cuando alcanza, con más decimales cuando hacen falta", () => {
    expect(costoUnitarioTexto(0.045)).toBe("S/\u00a00.045");
    expect(costoUnitarioTexto(0.0451)).toBe("S/\u00a00.0451");
    expect(costoUnitarioTexto(12.5)).toBe("S/\u00a012.50");
    expect(costoUnitarioTexto(0.05)).toBe("S/\u00a00.05");
  });
});
