import { describe, it, expect } from "vitest";
import { alertaDeStock, textoDeStock, mensajeSinResultados, ROTULO_STOCK_TOTAL, MENSAJE_SIN_RESULTADOS } from "./productos-stock";

const activo = (stockTotal: number, stockMinimo: number | null = null) => ({ estado: "activo", stockTotal, stockMinimo });
const descontinuado = (stockTotal: number, stockMinimo: number | null = null) => ({ estado: "descontinuado", stockTotal, stockMinimo });

describe("alertaDeStock — solo las prendas activas piden atención", () => {
  it("activa sin unidades en toda la red: sin stock", () => {
    expect(alertaDeStock(activo(0))).toBe("sin_stock");
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

  it("activa en 0 con mínimo: sin stock gana a bajo (excluyentes, igual que en la base)", () => {
    expect(alertaDeStock(activo(0, 5))).toBe("sin_stock");
  });

  it("activa sin mínimo cargado y con stock: sin alerta (38 de 39 productos activos hoy)", () => {
    expect(alertaDeStock(activo(3, null))).toBeNull();
  });

  it("mínimo 0: nada queda «por debajo» de 0, así que solo el 0 de stock avisa (como sin stock)", () => {
    expect(alertaDeStock(activo(3, 0))).toBeNull();
    expect(alertaDeStock(activo(0, 0))).toBe("sin_stock");
  });

  it("estado que no es exactamente «activo»: sin alerta (la base solo admite activo o descontinuado)", () => {
    expect(alertaDeStock({ estado: "Activo", stockTotal: 0, stockMinimo: null })).toBeNull();
    expect(alertaDeStock({ estado: "", stockTotal: 0, stockMinimo: 5 })).toBeNull();
  });

  it("stock negativo (la base lo impide con un CHECK): con mínimo se lee como «bajo», sin él no avisa", () => {
    expect(alertaDeStock(activo(-1, 5))).toBe("bajo");
    expect(alertaDeStock(activo(-1, null))).toBeNull();
  });
});

describe("textoDeStock — el rótulo dice de qué stock se habla", () => {
  it("con unidades: «Stock total N», no «Stock N» (no es el de la sede activa)", () => {
    expect(textoDeStock(26)).toBe("Stock total 26");
    expect(textoDeStock(26)).toContain(ROTULO_STOCK_TOTAL);
  });

  it("en cero: «Stock total 0» — la alerta «Sin stock» es del chip, no de este texto", () => {
    expect(textoDeStock(0)).toBe("Stock total 0");
  });
});

describe("mensajeSinResultados — un vacío que se explica cuando la combinación no puede devolver nada", () => {
  it("descontinuadas + cualquier alerta de stock: dice por qué está vacío", () => {
    for (const stock of ["sin_stock", "bajo", "reponer"]) {
      expect(mensajeSinResultados({ estado: "descontinuado", stock })).toContain("descontinuadas no cuentan");
    }
  });

  it("descontinuadas sin filtro de stock, o activas con alerta: el vacío de siempre", () => {
    expect(mensajeSinResultados({ estado: "descontinuado" })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({ estado: "activo", stock: "sin_stock" })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({})).toBe(MENSAJE_SIN_RESULTADOS);
  });
});
