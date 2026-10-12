import { describe, expect, it } from "vitest";
import { avisoDelPrecio, fraseDelPedido, leerPedido, montoParaVolver, numeroDeOrden } from "./plan-compra-pedido";

const CRUDO = {
  ordenes: [
    { id: "o1", numero: 12, proveedor: "Textiles Lima", destino: "Tienda TRU", emision: "2026-11-10", entrega: "2026-12-02", unidades: 40, total: "1400.00" },
    { id: "o2", numero: 15, proveedor: "Hilos SAC", destino: "Por repartir", emision: "2026-12-01", entrega: null, unidades: 10, total: 160 },
  ],
  categorias: [
    { c: "vestidos", unidades: 40, soles: 1400, ordenes: [12] },
    { c: "polos", unidades: 10, soles: 160, ordenes: [15, 12, 15] },
  ],
};

describe("lo pedido en órdenes de compra", () => {
  it("lee las órdenes de la campaña, sus totales y lo pedido por categoría", () => {
    const p = leerPedido(CRUDO)!;
    expect(p.ordenes.map((o) => [o.numero, o.entrega, o.total])).toEqual([
      [12, "2026-12-02", 1400],
      [15, null, 160],
    ]);
    expect([p.total, p.unidades]).toEqual([1560, 50]);
    expect(p.porCategoria.get("vestidos")).toEqual({ unidades: 40, soles: 1400, ordenes: [12] });
  });
  it("sin la base nueva, null: el Plan se ve como antes", () => {
    expect(leerPedido(null)).toBeNull();
    expect(leerPedido({ ordenes: [] })).toBeNull();
  });
  it("el número como lo dice Órdenes de compra", () => {
    expect(numeroDeOrden(12)).toBe("OC-000012");
  });
  it("la frase de una categoría: cuánto se pidió y si pasa lo que pide el plan (no resta)", () => {
    expect(fraseDelPedido({ unidades: 20, soles: 700, ordenes: [12] }, 69)).toBe("20 ya pedidas");
    expect(fraseDelPedido({ unidades: 30, soles: 480, ordenes: [12] }, 21)).toBe("30 ya pedidas · 9 más de lo que pide el plan");
    expect(fraseDelPedido({ unidades: 1, soles: 35, ordenes: [12] }, null)).toBe("1 ya pedida");
    expect(fraseDelPedido(undefined, 10)).toBeNull();
  });
});

describe("volver al precio o al costo del catálogo", () => {
  it("se ofrece si la caja está vacía o dice otra cosa; no si ya dice el del catálogo", () => {
    expect(montoParaVolver("", 143.234)).toBe("143.23");
    expect(montoParaVolver("160", 143.23)).toBe("143.23");
    expect(montoParaVolver("143.23", 143.23)).toBeNull();
    expect(montoParaVolver("143,23", 143.23)).toBeNull();
  });
  it("sin catálogo no hay a qué volver", () => {
    expect(montoParaVolver("", null)).toBeNull();
    expect(montoParaVolver("", 0)).toBeNull();
  });
});

describe("el precio del plan es un supuesto, con aviso", () => {
  it("avisa si se aparta 1 % o más del promedio del catálogo, y en qué sentido", () => {
    const a = avisoDelPrecio(50, 45)!;
    expect(Math.round(a.pct * 100)).toBe(11);
    expect(a.texto).toContain("Supones +11 %");
    expect(a.texto).toContain("subir");
    expect(avisoDelPrecio(40, 45)!.texto).toContain("Supones −11 %");
  });
  it("igual o casi igual al catálogo, o sin con qué comparar: nada", () => {
    expect(avisoDelPrecio(45.2, 45)).toBeNull();
    expect(avisoDelPrecio(50, null)).toBeNull();
    expect(avisoDelPrecio(null, 45)).toBeNull();
  });
});
