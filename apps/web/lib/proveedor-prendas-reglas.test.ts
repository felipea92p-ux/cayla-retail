import { describe, expect, it } from "vitest";
import { agruparPorMarca, pct, SIN_MARCA, totalesDePrendas, type PrendaDeProveedor } from "./proveedor-prendas-reglas";

const prenda = (o: Partial<PrendaDeProveedor>): PrendaDeProveedor => ({
  productoId: "p", referencia: "Blusa", codigo: null, marca: "CAYLA", categoria: null,
  unidadesCompradas: 10, gasto: 300, costoPromedio: 30, unidadesVendidas: 0, ingresoVendido: 0, costoVendido: 0,
  stockActual: 10, primeraEntrada: null, ultimaVenta: null, conFactura: false, ...o,
});

describe("totalesDePrendas", () => {
  it("suma lo comprado, lo vendido y calcula margen y porcentaje vendido", () => {
    const t = totalesDePrendas([
      prenda({ unidadesCompradas: 10, gasto: 300, unidadesVendidas: 4, ingresoVendido: 200, costoVendido: 120, stockActual: 6 }),
      prenda({ unidadesCompradas: 10, gasto: 500, costoPromedio: 50, unidadesVendidas: 0, stockActual: 10 }),
    ]);
    expect(t.unidadesCompradas).toBe(20);
    expect(t.gasto).toBe(800);
    expect(t.gananciaVendida).toBe(80);
    expect(t.margenPct).toBeCloseTo(40);
    expect(t.vendidoPct).toBeCloseTo(20);
    expect(t.plataEnStock).toBe(6 * 30 + 10 * 50);
  });

  it("no inventa un margen si todavía no se vendió nada", () => {
    expect(totalesDePrendas([prenda({})]).margenPct).toBeNull();
    expect(totalesDePrendas([]).vendidoPct).toBeNull();
  });
});

describe("pct", () => {
  it("nunca pasa de 100 aunque se haya vendido más de lo comprado (stock que entró por otra vía)", () => {
    expect(pct(15, 10)).toBe(100);
    expect(pct(1, 0)).toBeNull();
  });
});

describe("agruparPorMarca", () => {
  it("agrupa por marca, ordena por gasto y junta las prendas sin marca aparte", () => {
    const g = agruparPorMarca([
      prenda({ productoId: "a", marca: "Bella", gasto: 100 }),
      prenda({ productoId: "b", marca: "CAYLA", gasto: 900 }),
      prenda({ productoId: "c", marca: null, gasto: 50 }),
      prenda({ productoId: "d", marca: "CAYLA", gasto: 400 }),
    ]);
    expect(g.map((x) => x.marca)).toEqual(["CAYLA", "Bella", SIN_MARCA]);
    expect(g[0].gasto).toBe(1300);
    expect(g[0].prendasLista.map((p) => p.productoId)).toEqual(["b", "d"]);
  });
});
