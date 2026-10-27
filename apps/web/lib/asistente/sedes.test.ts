import { describe, expect, it } from "vitest";
import { fechaCorta } from "../gastos-reglas";
import { estadoDeSede, gastoDelMes, leerSedesAsistente } from "./sedes";

describe("leerSedesAsistente", () => {
  it("lee las filas de la base y salta lo que no entiende", () => {
    const filas = leerSedesAsistente([
      { id: "a", nombre: "Tienda Trujillo", tipo: "tienda", encendido: true, desde: "2026-10-27" },
      { id: "b", nombre: "Taller", tipo: "taller", encendido: false, desde: null },
      { id: "c", nombre: "Rara", tipo: "oficina", encendido: true },
      null,
      "x",
    ]);
    expect(filas).toEqual([
      { id: "a", nombre: "Tienda Trujillo", tipo: "tienda", encendido: true, desde: "2026-10-27" },
      { id: "b", nombre: "Taller", tipo: "taller", encendido: false, desde: null },
    ]);
  });

  it("sin datos (la base no tiene la función) es una lista vacía", () => {
    expect(leerSedesAsistente(null)).toEqual([]);
    expect(leerSedesAsistente({})).toEqual([]);
  });

  it("encendido solo con un true de verdad", () => {
    expect(leerSedesAsistente([{ id: "a", nombre: "A", tipo: "tienda", encendido: "true" }])[0]?.encendido).toBe(false);
  });
});

describe("estadoDeSede", () => {
  const hoy = "2026-10-27";
  it("dice desde cuándo corre", () => {
    expect(estadoDeSede({ encendido: true, desde: "2026-10-27" }, hoy, fechaCorta)).toBe("Encendido desde hoy");
    expect(estadoDeSede({ encendido: true, desde: "2026-10-20" }, hoy, fechaCorta)).toBe("Encendido desde el 20 oct");
  });
  it("apagada: si nunca corrió o desde cuándo corrió", () => {
    expect(estadoDeSede({ encendido: false, desde: null }, hoy, fechaCorta)).toBe("Nunca se encendió");
    expect(estadoDeSede({ encendido: false, desde: "2026-10-20" }, hoy, fechaCorta)).toBe("Apagado · corrió desde el 20 oct");
  });
});

describe("gastoDelMes", () => {
  it("sin dato de la base no dice nada", () => {
    expect(gastoDelMes(null, 30)).toBeNull();
    expect(gastoDelMes(Number.NaN, 30)).toBeNull();
  });
  it("verde, ámbar desde el 80 % y rojo al llegar al tope", () => {
    expect(gastoDelMes(0.0413, 30)).toEqual({ texto: "Este mes: US$ 0,04 de US$ 30,00", tono: "verde" });
    expect(gastoDelMes(24, 30)?.tono).toBe("ambar");
    expect(gastoDelMes(30, 30)).toEqual({ texto: "Mes gastado: US$ 30,00 de US$ 30,00. Sigue sin IA hasta el día 1.", tono: "rojo" });
  });
});
