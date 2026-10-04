import { describe, it, expect } from "vitest";
import { exactitudConteos, tonoExactitud } from "./conteo-varianza";

// Análisis mide la exactitud del inventario con esto. Lo que no debe pasar, y no se nota nunca si pasa: que un conteo
// que no verificó nada (o que se canceló) aparezca como «100 % exacto».

describe("exactitudConteos", () => {
  it("cuenta líneas correctas sobre líneas cerradas, ignorando el conteo abierto", () => {
    const r = exactitudConteos([
      { estado: "cerrado", lineas: 40, lineasConDiferencia: 2 },
      { estado: "cerrado", lineas: 10, lineasConDiferencia: 1 },
      { estado: "abierto", lineas: 5, lineasConDiferencia: 5 },
    ]);
    expect(r).toEqual({ porcentaje: 94, lineas: 50, correctas: 47, conteos: 2 });
  });

  it("sin líneas cerradas no inventa un 100 %", () => {
    expect(exactitudConteos([])).toBeNull();
    expect(exactitudConteos([{ estado: "abierto", lineas: 3, lineasConDiferencia: 0 }])).toBeNull();
    expect(exactitudConteos([{ estado: "cerrado", lineas: 0, lineasConDiferencia: 0 }])).toBeNull();
  });

  it("un conteo cancelado no cuenta, ni aunque conserve líneas verificadas", () => {
    expect(exactitudConteos([{ estado: "anulado", lineas: 12, lineasConDiferencia: 0 }])).toBeNull();
    const r = exactitudConteos([
      { estado: "cerrado", lineas: 10, lineasConDiferencia: 1 },
      { estado: "anulado", lineas: 50, lineasConDiferencia: 0 },
    ]);
    expect(r).toEqual({ porcentaje: 90, lineas: 10, correctas: 9, conteos: 1 });
  });

  it("un conteo cerrado parcial mide lo que verificó: las pendientes nunca entran en `lineas`", () => {
    // 18 verificadas (16 coincidieron); las 19 pendientes no están en `lineas`, así que no suben el porcentaje.
    expect(exactitudConteos([{ estado: "cerrado", lineas: 18, lineasConDiferencia: 2 }])?.porcentaje).toBe(88.9);
  });

  it("un decimal, sin más", () => {
    expect(exactitudConteos([{ estado: "cerrado", lineas: 3, lineasConDiferencia: 1 }])?.porcentaje).toBe(66.7);
  });

  // ADR-0328 (actividad 15): «Aplicar todos completos» y el conteo de arranque no son exactitud.
  it("lo aplicado sin contar NO sube la exactitud: 12 contadas (3 con diferencia) y 40 sin contar miden 75 %, no 94 %", () => {
    const r = exactitudConteos([{ estado: "cerrado", lineas: 52, lineasConDiferencia: 3, sinContar: 40 }]);
    expect(r).toEqual({ porcentaje: 75, lineas: 12, correctas: 9, conteos: 1 });
  });

  it("un conteo donde TODO se aplicó sin contar no dice nada: no es un 100 %", () => {
    expect(exactitudConteos([{ estado: "cerrado", lineas: 40, lineasConDiferencia: 0, sinContar: 40 }])).toBeNull();
  });

  it("el conteo de arranque no entra: sus diferencias son de la carga inicial, no del día a día", () => {
    const r = exactitudConteos([
      { estado: "cerrado", lineas: 300, lineasConDiferencia: 180, esArranque: true },
      { estado: "cerrado", lineas: 40, lineasConDiferencia: 2 },
    ]);
    expect(r).toEqual({ porcentaje: 95, lineas: 40, correctas: 38, conteos: 1 });
    expect(exactitudConteos([{ estado: "cerrado", lineas: 300, lineasConDiferencia: 180, esArranque: true }])).toBeNull();
  });

  it("sin los campos nuevos (la web antes que el SQL) la cuenta es la de siempre", () => {
    expect(exactitudConteos([{ estado: "cerrado", lineas: 40, lineasConDiferencia: 2 }])).toEqual({ porcentaje: 95, lineas: 40, correctas: 38, conteos: 1 });
  });
});

describe("tonoExactitud", () => {
  it("≥ 98 % sano, ≥ 95 % a vigilar, menos = hay que contar más seguido", () => {
    expect(tonoExactitud(100)).toBe("text-verde-profundo");
    expect(tonoExactitud(98)).toBe("text-verde-profundo");
    expect(tonoExactitud(97.9)).toBe("text-ambar-profundo");
    expect(tonoExactitud(95)).toBe("text-ambar-profundo");
    expect(tonoExactitud(94.9)).toBe("text-rojo-profundo");
  });
});
