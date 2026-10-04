import { describe, expect, it } from "vitest";
import { explicarCapacidadPiso, leerCapacidadPiso, notaCapacidadPiso, type CapacidadPiso } from "./capacidad-piso";

// Lo que devuelve `fn_capacidad_piso` por PostgREST: un arreglo de 0 o 1 filas, con los numeric como número.
const TRU = { m2_sala: 20, densidad: 30, capacidad: 600, provisional: false, contada_el: "2026-09-30", version: 1 };
const AQP = { m2_sala: 60, densidad: 30, capacidad: 1800, provisional: true, contada_el: null, version: 1 };

describe("leer la capacidad que manda la base", () => {
  it("una fila contada y una provisional", () => {
    expect(leerCapacidadPiso([TRU])).toEqual({ m2Sala: 20, densidad: 30, capacidad: 600, provisional: false });
    expect(leerCapacidadPiso([AQP])).toEqual({ m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true });
  });

  it("los numeric que llegan como texto también se leen (12,5 m²)", () => {
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: "12.50", densidad: "30.00", capacidad: 375 }])).toEqual({
      m2Sala: 12.5,
      densidad: 30,
      capacidad: 375,
      provisional: false,
    });
  });

  it("sin fila (Taller, tienda sin medir) o sin datos: sin capacidad, nunca un 0", () => {
    expect(leerCapacidadPiso([])).toBeNull();
    expect(leerCapacidadPiso(null)).toBeNull();
    expect(leerCapacidadPiso(undefined)).toBeNull();
    expect(leerCapacidadPiso("600")).toBeNull();
  });

  it("una fila rara no se convierte en un número inventado", () => {
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: 600.5 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, capacidad: null }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, m2_sala: 0 }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, densidad: "abc" }])).toBeNull();
    expect(leerCapacidadPiso([{ ...TRU, provisional: "false" }])).toBeNull();
  });
});

describe("la nota de «Colgadas en el piso»", () => {
  const contada: CapacidadPiso = { m2Sala: 20, densidad: 30, capacidad: 600, provisional: false };
  const provisional: CapacidadPiso = { m2Sala: 60, densidad: 30, capacidad: 1800, provisional: true };

  it("dice cuántas caben: «de 600» (lo que acordó la sesión de UI/UX, ADR-0331)", () => {
    expect(notaCapacidadPiso(contada)).toBe("de 600");
  });

  it("marca «(provisional)» si la sede no se ha contado, sin separador de miles como el número de al lado", () => {
    expect(notaCapacidadPiso(provisional)).toBe("de 1800 (provisional)");
    expect(notaCapacidadPiso({ ...contada, m2Sala: 6, capacidad: 180, provisional: true })).toBe("de 180 (provisional)");
  });

  it("sin capacidad no hay nota (ni «de 0» ni «de —»)", () => {
    expect(notaCapacidadPiso(null)).toBeUndefined();
  });

  it("la nota y la explicación salen de la misma lectura: si una existe, la otra también", () => {
    for (const c of [contada, provisional, null]) {
      expect(notaCapacidadPiso(c) === undefined).toBe(explicarCapacidadPiso(c) === undefined);
    }
  });

  it("la explicación dice de dónde sale el número y por qué es provisional", () => {
    expect(explicarCapacidadPiso(contada)).toBe("Caben unas 600 prendas colgadas: 20 m² de sala × 30 por m².");
    expect(explicarCapacidadPiso({ ...provisional, m2Sala: 12.5, capacidad: 375 })).toBe(
      "Caben unas 375 prendas colgadas: 12.5 m² de sala × 30 por m². Provisional: esta sede todavía no contó las prendas de su piso."
    );
  });
});
