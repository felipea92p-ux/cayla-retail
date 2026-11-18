import { describe, expect, it } from "vitest";
import { camposDelAjuste, problemaDelAjuste, problemasDelPapel, topeDeFactura } from "./regularizar-insumos-reglas";

const papel = { tipo: "factura" as const, serie: "F1", numero: "9", fecha: "2026-11-05", hoy: "2026-11-05", total: 118, subtotal: 100, pagado: 0 };

describe("ajustar lo que queda", () => {
  it("solo se puede bajar", () => {
    expect(problemaDelAjuste("2.5", 6)).toBeNull();
    expect(problemaDelAjuste("0", 6)).toBeNull();
    expect(problemaDelAjuste("6", 6)).toContain("lo mismo");
    expect(problemaDelAjuste("7", 6)).toContain("Saldo inicial");
    expect(problemaDelAjuste("", 6)).toContain("Escribe");
    expect(problemaDelAjuste("abc", 6)).toContain("No se entiende");
  });
  it("la guía pide cuánto, por qué y quién", () => {
    const c = camposDelAjuste({ problema: null, motivo: "", responsableListo: true });
    expect(c.map((x) => [x.id, x.hecho])).toEqual([["queda", true], ["porque", false], ["quien", true]]);
  });
});

describe("el papel que llegó después", () => {
  it("el tope de una factura es el subtotal más 18 %", () => {
    expect(topeDeFactura(100)).toBe(118);
  });
  it("una factura correcta no tiene problemas", () => {
    expect(problemasDelPapel(papel)).toEqual([]);
  });
  it("pide serie y número, y una fecha que no sea futura", () => {
    expect(problemasDelPapel({ ...papel, serie: " " })).toHaveLength(1);
    expect(problemasDelPapel({ ...papel, fecha: "2026-11-06" })).toHaveLength(1);
  });
  it("una factura fuera de rango se rechaza; una boleta usa las líneas", () => {
    expect(problemasDelPapel({ ...papel, total: 99 })).toHaveLength(1);
    expect(problemasDelPapel({ ...papel, total: 120 })).toHaveLength(1);
    expect(problemasDelPapel({ ...papel, tipo: "boleta", total: Number.NaN })).toEqual([]);
  });
  it("no deja un total menor que lo ya pagado", () => {
    expect(problemasDelPapel({ ...papel, tipo: "boleta", pagado: 110 })).toEqual(["Ya se pagó más que este total."]);
  });
});
