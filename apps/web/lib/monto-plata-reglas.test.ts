import { describe, expect, it } from "vitest";
import { lecturaCampoMonto, leerMontoPlata } from "./monto-plata-reglas";

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
