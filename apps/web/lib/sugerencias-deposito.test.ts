import { describe, expect, it } from "vitest";
import { METODOS_DEPOSITO } from "./nos-debe-reglas";
import { ejemploReferencia } from "./sugerencias-deposito";

// ADR-0290: el ejemplo de la referencia sigue al medio elegido, recorriendo TODOS los valores del control.

describe("la referencia de «Depositó» sigue al medio", () => {
  it("cada medio tiene su ejemplo, y sin medio no promete nada", () => {
    for (const m of METODOS_DEPOSITO) expect(ejemploReferencia(m).length).toBeGreaterThan(0);
    expect(ejemploReferencia("")).toBe("Opcional");
    expect(ejemploReferencia("otro")).toBe("Opcional");
  });

  it("no se contradice: el efectivo no pide un número de operación, Yape no pide un recibo", () => {
    expect(ejemploReferencia("efectivo")).not.toMatch(/operaci/);
    expect(ejemploReferencia("yape")).not.toMatch(/recibo/);
    expect(ejemploReferencia("transferencia")).toBe(ejemploReferencia("deposito"));
    expect(ejemploReferencia("yape")).toBe(ejemploReferencia("plin"));
  });

  it("sigue al control (A → B → A) y es estable", () => {
    const a = ejemploReferencia("transferencia");
    expect(ejemploReferencia("efectivo")).not.toBe(a);
    expect(ejemploReferencia("transferencia")).toBe(a);
  });

  it("cabe a 375 px: hasta 32 letras", () => {
    for (const m of [...METODOS_DEPOSITO, ""]) expect(ejemploReferencia(m).length).toBeLessThanOrEqual(32);
  });
});
