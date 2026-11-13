import { describe, expect, it } from "vitest";
import { camposDelMotivo, loQuePasaAlQuitar, puedeQuitarComprobante } from "./anular-documento-reglas";

describe("deshacer un pago o el papel de un gasto (tarea 21)", () => {
  it("sin motivo no se puede: pide tres letras, como la base", () => {
    expect(camposDelMotivo("", "se anula")[0]!.hecho).toBe(false);
    expect(camposDelMotivo("  ab ", "se anula")[0]!.hecho).toBe(false);
    expect(camposDelMotivo("monto mal", "se anula")[0]!.hecho).toBe(true);
  });
  const g = { estado: "vigente", categoria: "suministros", compraId: "c", condicion: "contado" as const };
  it("se quita el papel de un gasto al contado o el que llegó con el mes cerrado", () => {
    expect(puedeQuitarComprobante(g)).toBe(true);
    expect(puedeQuitarComprobante({ ...g, compraId: null, condicion: null, papelTardio: true })).toBe(true);
  });
  it("a crédito, sin papel, anulado o del viaje, no", () => {
    expect(puedeQuitarComprobante({ ...g, condicion: "credito" })).toBe(false);
    expect(puedeQuitarComprobante({ ...g, compraId: null, condicion: null })).toBe(false);
    expect(puedeQuitarComprobante({ ...g, estado: "anulado" })).toBe(false);
    expect(puedeQuitarComprobante({ ...g, categoria: "viaje_compra" })).toBe(false);
  });
  it("dice qué pasa en cada caso", () => {
    expect(loQuePasaAlQuitar({ papelTardio: true })).toContain("El gasto no cambia");
    expect(loQuePasaAlQuitar({})).toContain("vuelve a «Sin comprobante»");
  });
});
