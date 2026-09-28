import { describe, expect, it } from "vitest";
import { filtrarColores, filtrarPorNombre } from "./atributos-buscar";

describe("filtrarColores", () => {
  const colores = [
    { nombre: "Gris piedra", codigo: "GRP", sinonimos: ["plomo"] },
    { nombre: "Rojo", codigo: "ROJ", sinonimos: [] },
    { nombre: "Azul marino", codigo: "AZM", sinonimos: ["marino"] },
  ];

  it("sin texto devuelve todos", () => {
    expect(filtrarColores(colores, "")).toHaveLength(3);
    expect(filtrarColores(colores, "   ")).toHaveLength(3);
  });

  it("encuentra por nombre, sin tildes ni mayúsculas", () => {
    expect(filtrarColores(colores, "AZUL").map((c) => c.codigo)).toEqual(["AZM"]);
    expect(filtrarColores(colores, "gris").map((c) => c.codigo)).toEqual(["GRP"]);
  });

  it("encuentra por código", () => {
    expect(filtrarColores(colores, "roj").map((c) => c.codigo)).toEqual(["ROJ"]);
  });

  it("encuentra por sinónimo — «plomo» encuentra Gris piedra", () => {
    expect(filtrarColores(colores, "plomo").map((c) => c.codigo)).toEqual(["GRP"]);
  });

  it("sin coincidencias, lista vacía", () => {
    expect(filtrarColores(colores, "verde")).toEqual([]);
  });
});

describe("filtrarPorNombre", () => {
  const tejidos = [{ nombre: "Algodón" }, { nombre: "Denim" }, { nombre: "Seda"}];

  it("sin texto devuelve todos", () => {
    expect(filtrarPorNombre(tejidos, "")).toHaveLength(3);
  });

  it("sin tildes: «algodon» encuentra «Algodón»", () => {
    expect(filtrarPorNombre(tejidos, "algodon").map((t) => t.nombre)).toEqual(["Algodón"]);
  });

  it("por contenido, no solo prefijo", () => {
    expect(filtrarPorNombre(tejidos, "nim").map((t) => t.nombre)).toEqual(["Denim"]);
  });
});
