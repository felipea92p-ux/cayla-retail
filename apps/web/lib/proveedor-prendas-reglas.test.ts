import { describe, expect, it } from "vitest";
import { agruparPorMarca, pct, SIN_MARCA, totalesDePrendas, type PrendaDeProveedor } from "./proveedor-prendas-reglas";

const prenda = (o: Partial<PrendaDeProveedor>): PrendaDeProveedor => ({
  productoId: "p", referencia: "Blusa", codigo: null, marca: "CAYLA", categoria: null,
  unidadesCompradas: 10, unidadesEstimadas: 0, gasto: 300, costoPromedio: 30, unidadesVendidas: 0, ingresoVendido: 0, costoVendido: 0,
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

  it("suma las unidades estimadas aparte de las compradas", () => {
    const t = totalesDePrendas([prenda({ unidadesCompradas: 100, unidadesEstimadas: 40 }), prenda({ unidadesCompradas: 20, unidadesEstimadas: 0 })]);
    expect(t.unidadesCompradas).toBe(120);
    expect(t.unidadesEstimadas).toBe(40);
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

import { rankingDeProveedores, veredictoDe, type RendimientoProveedor } from "./proveedor-prendas-reglas";

const prov = (o: Partial<RendimientoProveedor>): RendimientoProveedor => ({
  proveedorId: "x", nombre: "Textil", prendas: 5, unidadesCompradas: 100, unidadesEstimadas: 0, gasto: 3000, unidadesVendidas: 50, ingresoVendido: 3000,
  costoVendido: 1500, plataEnStock: 1500, prendasSinVenta: 0, plataSinVenta: 0, ...o,
});

describe("veredictoDe", () => {
  it("con pocas ventas no concluye nada", () => {
    expect(veredictoDe(prov({ unidadesVendidas: 4 })).texto).toBe("Pocas ventas");
  });
  it("marca la plata parada cuando pasa del 40 % de lo gastado", () => {
    expect(veredictoDe(prov({ plataSinVenta: 1500 })).texto).toBe("Plata parada");
  });
  it("marca el margen bajo", () => {
    expect(veredictoDe(prov({ costoVendido: 2400 })).texto).toBe("Margen bajo");
  });
  it("si vende y deja margen, rinde", () => {
    expect(veredictoDe(prov({})).texto).toBe("Rinde");
  });
});

describe("rankingDeProveedores", () => {
  it("ordena por gasto y reparte el peso sobre el total", () => {
    const r = rankingDeProveedores([prov({ proveedorId: "a", gasto: 1000 }), prov({ proveedorId: "b", gasto: 3000 })]);
    expect(r.map((x) => x.proveedorId)).toEqual(["b", "a"]);
    expect(r[0].pesoPct).toBeCloseTo(75);
  });
});
