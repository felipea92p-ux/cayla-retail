import { describe, it, expect } from "vitest";
import { calcularEstado, UMBRAL_REPOSICION_PISO, UMBRAL_STOCK_BAJO_ALMACEN } from "./inventario-reglas";

// Umbrales de Felipe (corregidos 2026-09-16 probando la pantalla): «Reponer
// piso» con 7 o menos en el piso; «Stock bajo» con 20 o menos en el ALMACÉN
// (no el total — mira solo la reserva). Los ifs de `calcularEstado` están en
// orden de severidad: stock_bajo (la reserva ya está baja) gana sobre
// reponer_piso (hay reserva sana, solo hace falta bajarla) — así que
// reponer_piso solo aparece cuando el almacén TODAVÍA tiene más de 20.

describe("calcularEstado", () => {
  it("los umbrales son 7 en el piso y 20 en el almacén", () => {
    expect(UMBRAL_REPOSICION_PISO).toBe(7);
    expect(UMBRAL_STOCK_BAJO_ALMACEN).toBe(20);
  });

  it("piso en el umbral o por debajo, con el almacén por encima de 20: reponer", () => {
    expect(calcularEstado(7, 21)).toBe("reponer_piso");
    expect(calcularEstado(1, 50)).toBe("reponer_piso");
    expect(calcularEstado(0, 100)).toBe("reponer_piso");
  });

  it("piso por encima del umbral y almacén sano: normal", () => {
    expect(calcularEstado(8, 21)).toBe("normal");
    expect(calcularEstado(50, 100)).toBe("normal");
  });

  it("almacén en 20 o menos: stock bajo, tenga el piso lo que tenga", () => {
    expect(calcularEstado(50, 20)).toBe("stock_bajo"); // piso lleno, reserva al límite
    expect(calcularEstado(3, 20)).toBe("stock_bajo");
    expect(calcularEstado(0, 5)).toBe("stock_bajo"); // piso vacío, algo de reserva
    expect(calcularEstado(2, 0)).toBe("stock_bajo"); // sin reserva, algo en piso
  });

  it("stock_bajo gana sobre reponer_piso cuando los dos calzarían", () => {
    // Piso bajo (2 <= 7) Y almacén bajo (10 <= 20): la reserva manda.
    expect(calcularEstado(2, 10)).toBe("stock_bajo");
  });

  it("nada en ningún lado: sin stock", () => {
    expect(calcularEstado(0, 0)).toBe("sin_stock");
  });
});
