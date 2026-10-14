import { describe, expect, it } from "vitest";
import { CONCEPTOS_DE, TIPOS_GASTO_VIAJE, type PapelGastoViaje } from "./gastos-viaje-reglas";
import { ejemploNota, ejemploSerie } from "./sugerencias-gasto-viaje";

// Los ejemplos de la hoja «Gasto del viaje» siguen a lo que la persona eligió (ADR-0290): se recorren TODOS los valores de cada control.

const PAPELES: (PapelGastoViaje | "")[] = ["boleta", "factura", "ticket", "planilla_movilidad", ""];

describe("la serie sigue al papel", () => {
  it("una boleta empieza con B, una factura con F; sin papel, nada que prometer", () => {
    expect(ejemploSerie("boleta")).toMatch(/^Ej\. B/);
    expect(ejemploSerie("factura")).toMatch(/^Ej\. F/);
    expect(ejemploSerie("ticket")).not.toMatch(/[BF]\d{3}/);
    expect(ejemploSerie("")).toBe("Opcional");
  });
  it("todos los papeles tienen su texto, y sigue al control (A → B → A)", () => {
    for (const p of PAPELES) expect(ejemploSerie(p).length).toBeGreaterThan(0);
    expect(ejemploSerie("boleta")).toBe(ejemploSerie("boleta"));
    expect(ejemploSerie("factura")).not.toBe(ejemploSerie("boleta"));
  });
});

describe("la nota sigue al concepto", () => {
  it("cada concepto de cada tipo tiene su ejemplo, distinto entre conceptos", () => {
    for (const t of TIPOS_GASTO_VIAJE) {
      const vistos = new Set<string>();
      for (const c of CONCEPTOS_DE[t.valor]) {
        const e = ejemploNota(t.valor, c.valor);
        expect(e.length).toBeGreaterThan(0);
        expect(vistos.has(e)).toBe(false);
        vistos.add(e);
      }
    }
  });
  it("«Otro» pide escribir qué se pagó, según el tipo; sin concepto, nada que prometer", () => {
    expect(ejemploNota("mercaderia", "otro")).toMatch(/traer la compra/);
    expect(ejemploNota("viaje", "otro")).toMatch(/en el viaje/);
    expect(ejemploNota("", "")).toBe("Opcional");
    expect(ejemploNota("viaje", "")).toBe("Opcional");
  });
  it("el ejemplo de un concepto no habla de otro (un flete no dice hotel)", () => {
    expect(ejemploNota("mercaderia", "flete")).not.toMatch(/hotel|noche|almuerzo/i);
    expect(ejemploNota("viaje", "hotel")).toMatch(/noche/);
  });
});
