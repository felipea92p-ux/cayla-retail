import { describe, expect, it } from "vitest";
import { agruparPorMarca, pct, rankingDeProveedores, SIN_MARCA, tieneCostoReal, totalesDePrendas, veredictoDe, type PrendaDeProveedor, type RendimientoProveedor } from "./proveedor-prendas-reglas";

// Una prenda de la carga inicial por defecto (costo por confirmar); `real()` la vuelve de origen Compras.
const prenda = (o: Partial<PrendaDeProveedor>): PrendaDeProveedor => ({
  productoId: "p", referencia: "Blusa", codigo: null, marca: "CAYLA", categoria: null,
  unidadesCompradas: 10, unidadesCompras: 0, unidadesSinFactura: 0, unidadesCarga: 10, unidadesEstimadas: 10,
  gasto: 300, gastoCompras: 0, gastoCarga: 300, costoPromedio: 30,
  unidadesVendidas: 0, ingresoVendido: 0, costoVendido: 0, stockActual: 10, primeraEntrada: null, ultimaVenta: null, conFactura: false, ...o,
});
const real = (o: Partial<PrendaDeProveedor> = {}) => prenda({ unidadesCompras: 10, unidadesCarga: 0, unidadesEstimadas: 0, gastoCompras: 300, gastoCarga: 0, conFactura: true, ...o });

describe("totalesDePrendas", () => {
  it("suma lo comprado por origen, lo vendido, y calcula margen y porcentaje vendido con costo real", () => {
    const t = totalesDePrendas([
      real({ unidadesVendidas: 4, ingresoVendido: 200, costoVendido: 120, stockActual: 6 }),
      real({ gasto: 500, gastoCompras: 500, unidadesVendidas: 0, stockActual: 10 }),
    ]);
    expect(t.unidadesCompradas).toBe(20);
    expect(t.unidadesCompras).toBe(20);
    expect(t.gasto).toBe(800);
    expect(t.gananciaVendida).toBe(80);
    expect(t.margenPct).toBeCloseTo(40);
    expect(t.vendidoPct).toBeCloseTo(20);
    expect(t.costoPorConfirmar).toBe(false);
    expect(t.plataEnStock).toBe(6 * 30 + 10 * 50);
  });

  it("con la carga inicial no habla de margen ni de plata: dice costo por confirmar, pero cuenta las unidades", () => {
    const t = totalesDePrendas([prenda({ unidadesVendidas: 4, ingresoVendido: 200, costoVendido: 120, stockActual: 6 })]);
    expect(t.costoPorConfirmar).toBe(true);
    expect(t.margenPct).toBeNull();
    expect(t.plataEnStock).toBe(0);
    expect(t.vendidoPct).toBeCloseTo(40);
    expect(t.unidadesEnEstantes).toBe(6);
    expect(t.prendasSinVenta).toBe(0);
  });

  it("la plata sin vender cuenta solo lo de Compras; las prendas sin venta cuentan las dos", () => {
    const t = totalesDePrendas([real({ stockActual: 10 }), prenda({ stockActual: 10 })]);
    expect(t.prendasSinVenta).toBe(2);
    expect(t.plataSinVenta).toBe(300);
  });

  it("separa las unidades sin factura de las de factura", () => {
    const t = totalesDePrendas([real({ unidadesSinFactura: 4 }), real({ unidadesSinFactura: 0 })]);
    expect(t.unidadesSinFactura).toBe(4);
    expect(t.costoRealPct).toBe(100);
  });

  it("no inventa un margen si todavía no se vendió nada", () => {
    expect(totalesDePrendas([real()]).margenPct).toBeNull();
    expect(totalesDePrendas([]).vendidoPct).toBeNull();
  });
});

describe("tieneCostoReal", () => {
  it("pide que la mitad o más de lo comprado haya llegado por Compras", () => {
    expect(tieneCostoReal({ unidadesCompras: 5, unidadesCompradas: 10 })).toBe(true);
    expect(tieneCostoReal({ unidadesCompras: 4, unidadesCompradas: 10 })).toBe(false);
  });
});

describe("pct", () => {
  it("nunca pasa de 100 aunque se haya vendido más de lo comprado", () => {
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

const prov = (o: Partial<RendimientoProveedor>): RendimientoProveedor => ({
  proveedorId: "x", nombre: "Textil", esTaller: false, prendas: 5, unidadesCompradas: 100, unidadesCompras: 100, unidadesSinFactura: 0, unidadesCarga: 0,
  unidadesEstimadas: 0, gasto: 3000, gastoCompras: 3000, gastoCarga: 0, unidadesVendidas: 50, ingresoVendido: 3000, costoVendido: 1500,
  plataEnStock: 1500, prendasSinVenta: 0, plataSinVenta: 0, ...o,
});

describe("veredictoDe", () => {
  it("con pocas ventas no concluye nada", () => {
    expect(veredictoDe(prov({ unidadesVendidas: 4 })).texto).toBe("Pocas ventas");
  });
  it("con la carga inicial como mayoría dice «Costo por confirmar», no un veredicto de dinero", () => {
    expect(veredictoDe(prov({ unidadesCompras: 20, unidadesCarga: 80, plataSinVenta: 2000 })).texto).toBe("Costo por confirmar");
  });
  it("marca la plata parada cuando pasa del 40 % de lo gastado por Compras", () => {
    expect(veredictoDe(prov({ plataSinVenta: 1500 })).texto).toBe("Plata parada");
  });
  it("marca el margen bajo", () => {
    expect(veredictoDe(prov({ costoVendido: 2400 })).texto).toBe("Margen bajo");
  });
  it("si vende y deja margen con costo real, rinde", () => {
    expect(veredictoDe(prov({})).texto).toBe("Rinde");
  });
});

describe("rankingDeProveedores", () => {
  it("ordena por gasto, reparte el peso y deja el Taller aparte, fuera del ranking", () => {
    const r = rankingDeProveedores([prov({ proveedorId: "a", gasto: 1000 }), prov({ proveedorId: "b", gasto: 3000 }), prov({ proveedorId: "t", nombre: "CAYLA SAC", esTaller: true, gasto: 6000 })]);
    expect(r.ranking.map((x) => x.proveedorId)).toEqual(["b", "a"]);
    expect(r.ranking[0].pesoPct).toBeCloseTo(30);
    expect(r.taller?.proveedorId).toBe("t");
    expect(r.taller?.pesoPct).toBeCloseTo(60);
  });
  it("no muestra margen de un proveedor cuyo costo es de la carga", () => {
    const r = rankingDeProveedores([prov({ unidadesCompras: 0, unidadesCarga: 100 })]);
    expect(r.ranking[0].margenPct).toBeNull();
  });
});
