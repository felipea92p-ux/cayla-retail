import { describe, it, expect } from "vitest";
import {
  alertaDeStock,
  textoDeStock,
  ROTULO_STOCK_TOTAL,
} from "./productos-stock";

const activo = (stockTotal: number, stockMinimo: number | null = null) => ({
  estado: "activo",
  stockTotal,
  stockMinimo,
});
const descontinuado = (
  stockTotal: number,
  stockMinimo: number | null = null,
) => ({ estado: "descontinuado", stockTotal, stockMinimo });

describe("alertaDeStock — solo las prendas activas piden atención", () => {
  it("activa sin unidades en toda la red: agotado", () => {
    expect(alertaDeStock(activo(0))).toBe("agotado");
  });

  it("descontinuada sin unidades: NO es alerta (no hay nada que reponer de lo que ya no se vende)", () => {
    expect(alertaDeStock(descontinuado(0))).toBeNull();
  });

  it("descontinuada por debajo de su mínimo: tampoco es «stock bajo»", () => {
    expect(alertaDeStock(descontinuado(1, 5))).toBeNull();
  });

  it("activa con menos que su mínimo: bajo", () => {
    expect(alertaDeStock(activo(2, 5))).toBe("bajo");
  });

  it("activa justo en su mínimo: sin alerta (bajo es ESTRICTAMENTE menos que el mínimo)", () => {
    expect(alertaDeStock(activo(5, 5))).toBeNull();
  });

  it("activa en 0 con mínimo: agotado gana a bajo (no se dicen las dos cosas)", () => {
    expect(alertaDeStock(activo(0, 5))).toBe("agotado");
  });

  it("activa sin mínimo cargado y con stock: sin alerta (38 de 39 productos activos hoy)", () => {
    expect(alertaDeStock(activo(3, null))).toBeNull();
  });
});

describe("textoDeStock — el rótulo dice de qué stock se habla", () => {
  it("con unidades: «Stock total N», no «Stock N» (no es el de la sede activa)", () => {
    expect(textoDeStock(26)).toBe("Stock total 26");
    expect(textoDeStock(26)).toContain(ROTULO_STOCK_TOTAL);
  });

  it("en cero: «Agotado»", () => {
    expect(textoDeStock(0)).toBe("Agotado");
  });
});
