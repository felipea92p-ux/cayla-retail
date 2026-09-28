import { describe, expect, it } from "vitest";
import { filtrarColores, filtrarPorNombre, GRUPOS_USO, ORDEN_USO, usoDe } from "./atributos-buscar";

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

describe("usoDe", () => {
  it("con al menos una prenda está en uso; sin fila en el conteo, sin prendas", () => {
    const prendas = { a: 3, b: 0 };
    expect(usoDe("a", prendas)).toBe("en-uso");
    expect(usoDe("b", prendas)).toBe("sin-prendas");
    expect(usoDe("c", prendas)).toBe("sin-prendas");
  });

  it("los grupos salen en el orden de las píldoras: primero lo que se usa", () => {
    expect(ORDEN_USO).toEqual(["en-uso", "sin-prendas"]);
    expect(ORDEN_USO.map((u) => GRUPOS_USO[u].grupo)).toEqual(["En uso", "Sin prendas"]);
  });
});
