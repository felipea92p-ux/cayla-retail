import { describe, expect, it } from "vitest";
import { ORDENES, ordenar, ordenDe, ordenPorDefecto } from "./analisis-orden";

// Datos inventados.
const LISTA = [
  { nombre: "Casaca Ensayo", vendidas30: 4 },
  { nombre: "Blusa Ensayo", vendidas30: 9 },
  { nombre: "Abrigo Ensayo", vendidas30: 4 },
];

describe("orden de cada pestaña", () => {
  it("la primera opción es la de siempre; una pestaña sin lista no ofrece ordenar", () => {
    expect(ordenPorDefecto("acaba")).toBe("urgente");
    expect(ordenPorDefecto("hoy")).toBe("");
    expect(ORDENES.hoy).toBeUndefined();
  });

  it("un orden que la pestaña no ofrece vuelve al de siempre", () => {
    expect(ordenDe("acaba", { acaba: "vende" })).toBe("vende");
    expect(ordenDe("acaba", { acaba: "inventado" })).toBe("urgente");
    expect(ordenDe("acaba", {})).toBe("urgente");
  });

  it("ordena por venta o por nombre, estable, sin quitar nada", () => {
    expect(ordenar(LISTA, "vende").map((x) => x.nombre)).toEqual(["Blusa Ensayo", "Casaca Ensayo", "Abrigo Ensayo"]);
    expect(ordenar(LISTA, "nombre").map((x) => x.nombre)).toEqual(["Abrigo Ensayo", "Blusa Ensayo", "Casaca Ensayo"]);
    expect(ordenar(LISTA, "urgente")).toEqual(LISTA);
    expect(ordenar(LISTA, "urgente")).not.toBe(LISTA);
  });
});
