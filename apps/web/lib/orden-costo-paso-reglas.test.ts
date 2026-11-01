import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cajasDelCosto, cambiaElCostoDelPaso, leerCostoDelPaso, lineaDelCostoDelPaso } from "./orden-costo-paso-reglas";
import { FIJO_MAXIMO, TARIFA_MAXIMA } from "./orden-fases-reglas";

describe("leerCostoDelPaso — lo que `poner_costo_a_fase` aceptaría", () => {
  it("tarifa por prenda y fijo: el total es tarifa × prendas + fijo, a céntimos", () => {
    expect(leerCostoDelPaso("0.40", "5", 50)).toMatchObject({ problema: null, tarifaPrenda: 0.4, fijoOrden: 5, total: 25, vacio: false });
    expect(leerCostoDelPaso("0.37", "", 69)).toMatchObject({ problema: null, tarifaPrenda: 0.37, fijoOrden: 0, total: 25.53 });
  });
  it("solo el fijo, sin tarifa por prenda («el corte fueron 60 soles»)", () => {
    expect(leerCostoDelPaso("", "60", 69)).toMatchObject({ problema: null, tarifaPrenda: null, fijoOrden: 60, total: 60 });
  });
  it("las dos cajas vacías: no hay nada que guardar (quitar el costo es otro botón)", () => {
    expect(leerCostoDelPaso("", "", 69)).toMatchObject({ problema: null, vacio: true, total: null });
    expect(leerCostoDelPaso("  ", " ", 69).vacio).toBe(true);
  });
  it("redondea como la base (la mitad sube) y rechaza lo que redondea a cero", () => {
    expect(leerCostoDelPaso("0.405", "", 10)).toMatchObject({ tarifaPrenda: 0.41, total: 4.1 });
    expect(leerCostoDelPaso("0.004", "", 10).problema).toMatch(/mayor que cero/);
  });
  it("dice en cuál de las dos cajas está lo que se rechazaría, para marcar solo esa", () => {
    expect(leerCostoDelPaso("0,40", "5", 10).donde).toBe("tarifa");
    expect(leerCostoDelPaso("0.40", "-5", 10).donde).toBe("fijo");
    expect(leerCostoDelPaso("0.40", "100000", 10).donde).toBe("fijo");
    expect(leerCostoDelPaso("10000", "5", 10).donde).toBe("tarifa");
    expect(leerCostoDelPaso("0.40", "5", 10).donde).toBeNull();
  });
  it("rechaza coma, negativos, letras y cero", () => {
    expect(leerCostoDelPaso("0,40", "", 10).problema).toMatch(/punto/);
    expect(leerCostoDelPaso("", "-5", 10).problema).toMatch(/negativo/);
    expect(leerCostoDelPaso("abc", "", 10).problema).toMatch(/números/);
    expect(leerCostoDelPaso("1e3", "", 10).problema).toMatch(/números/);
    expect(leerCostoDelPaso("0", "", 10).problema).toMatch(/mayor que cero/);
  });
  it("los topes son los de la base: tarifa hasta 9999.99, fijo hasta 99999.99; el tope exacto pasa", () => {
    expect(leerCostoDelPaso(String(TARIFA_MAXIMA), "", 1).problema).toBeNull();
    expect(leerCostoDelPaso("10000", "", 1).problema).toMatch(/no puede pasar/);
    expect(leerCostoDelPaso("", String(FIJO_MAXIMO), 1).problema).toBeNull();
    expect(leerCostoDelPaso("", "100000", 1).problema).toMatch(/no puede pasar/);
  });
  it("un fijo en cero con tarifa vale (el fijo es opcional); sin prendas el total es solo el fijo", () => {
    expect(leerCostoDelPaso("1", "0", 10)).toMatchObject({ problema: null, fijoOrden: 0, total: 10 });
    expect(leerCostoDelPaso("1", "5", 0).total).toBe(5);
  });
});

describe("lo demás de la hoja", () => {
  it("cambiaElCostoDelPaso: igual no es un cambio", () => {
    expect(cambiaElCostoDelPaso({ tarifaPrenda: 0.4, fijoOrden: 5 }, leerCostoDelPaso("0.40", "5", 50))).toBe(false);
    expect(cambiaElCostoDelPaso({ tarifaPrenda: 0.4, fijoOrden: 5 }, leerCostoDelPaso("0.45", "5", 50))).toBe(true);
    expect(cambiaElCostoDelPaso({ tarifaPrenda: null, fijoOrden: 0 }, leerCostoDelPaso("", "60", 50))).toBe(true);
  });
  it("cajasDelCosto: la hoja abre con lo que el paso ya lleva", () => {
    expect(cajasDelCosto({ tarifaPrenda: 0.4, fijoOrden: 5 })).toEqual({ tarifa: "0.40", fijo: "5.00" });
    expect(cajasDelCosto({ tarifaPrenda: null, fijoOrden: 0 })).toEqual({ tarifa: "", fijo: "" });
  });
  it("lineaDelCostoDelPaso: dice el total, el problema o lo que falta", () => {
    expect(lineaDelCostoDelPaso(leerCostoDelPaso("0.40", "5", 50), 50)).toBe("Con las 50 prendas de esta orden sale S/ 25.00.");
    // Lo que está mal o falta lo dice la guía y la caja marcada: esta línea no lo repite.
    expect(lineaDelCostoDelPaso(leerCostoDelPaso("0,4", "", 50), 50)).toBeNull();
    expect(lineaDelCostoDelPaso(leerCostoDelPaso("", "", 50), 50)).toBeNull();
    expect(lineaDelCostoDelPaso(leerCostoDelPaso("2", "", 1), 1)).toBe("Con la prenda de esta orden sale S/ 2.00.");
  });
});

describe("los topes de la web son los de la migración", () => {
  const sql = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261101033000_produccion_costo_de_un_paso_del_taller.sql"), "utf8");
  it("poner_costo_a_fase rechaza lo mismo: tarifa > 0 y ≤ 9999.99, fijo ≥ 0 y ≤ 99999.99", () => {
    expect(sql).toContain(`v_t > ${TARIFA_MAXIMA}`);
    expect(sql).toContain(`v_fj > ${FIJO_MAXIMO}`);
    expect(sql).toMatch(/v_t <= 0/);
    expect(sql).toMatch(/v_fj < 0/);
  });
});
