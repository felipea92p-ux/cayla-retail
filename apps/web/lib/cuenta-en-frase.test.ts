import { describe, expect, it } from "vitest";
import { cuentaEnFrase, fraseDeCuenta, type QueSeCuenta } from "./cuenta-en-frase";

// La cuenta de un grupo dicha como frase (ADR-0716, caso 3; Felipe eligió «frase» el 2026-11-27). Es la misma forma que
// `cuentaDeCasos` de Dynamic (lib/admin/incidencias.ts): estos casos son los suyos, para que las dos digan lo mismo.
const CASOS: QueSeCuenta = { singular: "caso", plural: "casos", genero: "m" };
const PRENDAS: QueSeCuenta = { singular: "prenda", plural: "prendas", genero: "f" };

describe("cuentaEnFrase", () => {
  it("dice la cuenta y aparta lo urgente, igual que Dynamic", () => {
    expect(cuentaEnFrase(7, 0, CASOS, "de prioridad alta")).toEqual({ cuenta: "7 casos", urgente: null });
    expect(cuentaEnFrase(7, 7, CASOS, "de prioridad alta")).toEqual({ cuenta: "7 casos", urgente: "todos de prioridad alta" });
    expect(cuentaEnFrase(7, 3, CASOS, "de prioridad alta")).toEqual({ cuenta: "7 casos", urgente: "3 de prioridad alta" });
    expect(cuentaEnFrase(2, 2, CASOS, "de prioridad alta")).toEqual({ cuenta: "2 casos", urgente: "los dos de prioridad alta" });
    expect(cuentaEnFrase(1, 1, CASOS, "de prioridad alta")).toEqual({ cuenta: "1 caso", urgente: "de prioridad alta" });
  });

  it("concuerda con lo que cuenta: «todas», «las dos»", () => {
    expect(cuentaEnFrase(5, 5, PRENDAS, "por explicar").urgente).toBe("todas por explicar");
    expect(cuentaEnFrase(2, 2, PRENDAS, "por explicar").urgente).toBe("las dos por explicar");
  });

  it("con cero no hay nada urgente, y los miles llevan su separador", () => {
    expect(cuentaEnFrase(0, 0, PRENDAS, "por explicar")).toEqual({ cuenta: "0 prendas", urgente: null });
    expect(cuentaEnFrase(1200, 0, PRENDAS, "")).toEqual({ cuenta: "1,200 prendas", urgente: null });
  });

  it("la frase entera, para un title o el lector", () => {
    expect(fraseDeCuenta(cuentaEnFrase(7, 7, CASOS, "de prioridad alta"))).toBe("7 casos, todos de prioridad alta");
    expect(fraseDeCuenta(cuentaEnFrase(3, 0, CASOS, "de prioridad alta"))).toBe("3 casos");
  });
});
