import { describe, expect, it } from "vitest";
import { avisoDelPrecio, enCaminoDe, fraseDelPedido, leerPedido, montoParaVolver, numeroDeOrden, type PedidoCategoria } from "./plan-compra-pedido";

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
    expect(p.porCategoria.get("vestidos")).toEqual({ unidades: 40, porLlegar: null, soles: 1400, ordenes: [12] });
    // La base de antes de 20261013213000 no manda `por_llegar`: no se sabe, y no se resta nada.
    expect(p.porLlegar).toBeNull();
  });
  it("lee lo que falta llegar por orden, por categoría y en total (nunca negativo)", () => {
    const p = leerPedido({
      ordenes: [
        { ...CRUDO.ordenes[0], por_llegar: 25 },
        { ...CRUDO.ordenes[1], por_llegar: "0" },
      ],
      categorias: [
        { ...CRUDO.categorias[0], por_llegar: 25 },
        { ...CRUDO.categorias[1], por_llegar: -3 },
      ],
    })!;
    expect(p.ordenes.map((o) => o.porLlegar)).toEqual([25, 0]);
    expect([p.porCategoria.get("vestidos")!.porLlegar, p.porCategoria.get("polos")!.porLlegar]).toEqual([25, 0]);
    expect(p.porLlegar).toBe(25);
  });
  it("si una orden no trae lo que falta llegar, el total no se inventa a medias", () => {
    const p = leerPedido({ ordenes: [{ ...CRUDO.ordenes[0], por_llegar: 25 }, CRUDO.ordenes[1]], categorias: CRUDO.categorias })!;
    expect(p.porLlegar).toBeNull();
  });
  it("lo que se resta de «Comprar»: lo que falta llegar; nada si no se pidió o la base no lo manda", () => {
    expect(enCaminoDe(undefined)).toBe(0);
    expect(enCaminoDe({ unidades: 20, porLlegar: null, soles: 700, ordenes: [12] })).toBe(0);
    expect(enCaminoDe({ unidades: 20, porLlegar: 7, soles: 700, ordenes: [12] })).toBe(7);
  });
  it("sin la base nueva, null: el Plan se ve como antes", () => {
    expect(leerPedido(null)).toBeNull();
    expect(leerPedido({ ordenes: [] })).toBeNull();
  });
  it("el número como lo dice Órdenes de compra", () => {
    expect(numeroDeOrden(12)).toBe("OC-000012");
  });
  const pedida = (unidades: number, porLlegar: number | null): PedidoCategoria => ({ unidades, porLlegar, soles: unidades * 35, ordenes: [12] });
  it("con la base de antes (sin lo que falta llegar), la frase de siempre: cuánto se pidió y si pasa lo que pide comprar", () => {
    expect(fraseDelPedido(pedida(20, null), { objetivo: 100, stock: 31, comprar: 69 })).toBe("20 ya pedidas");
    expect(fraseDelPedido(pedida(30, null), { objetivo: 100, stock: 79, comprar: 21 })).toBe("30 ya pedidas · 9 más de lo que pide el plan");
    expect(fraseDelPedido(pedida(1, null), null)).toBe("1 ya pedida");
    expect(fraseDelPedido(undefined, { objetivo: 10, stock: 0, comprar: 10 })).toBeNull();
  });
  it("dice cuánto falta llegar y que ya se descontó; si todo llegó, que llegó (ya está en «Hay hoy»)", () => {
    expect(fraseDelPedido(pedida(20, 15), { objetivo: 100, stock: 60, comprar: 40 })).toBe("20 ya pedidas · 15 por llegar, ya descontadas");
    expect(fraseDelPedido(pedida(20, 0), { objetivo: 100, stock: 60, comprar: 40 })).toBe("20 ya pedidas · ya llegaron");
    expect(fraseDelPedido(pedida(1, 1), null)).toBe("1 ya pedida · 1 por llegar, ya descontadas");
  });
  it("si con lo que viene te pasas de lo que conviene tener, dice cuánto pone de más el pedido (no lo que ya sobraba)", () => {
    // Hay 40 y vienen 30 (stock 70) para tener 50: el pedido pone 20 de más.
    expect(fraseDelPedido(pedida(30, 30), { objetivo: 50, stock: 70, comprar: 0 })).toBe("30 ya pedidas · 30 por llegar, ya descontadas · 20 más de lo que pide el plan");
    // Ya había 90 para tener 50: las 10 que vienen sobran enteras, pero no las 40 que ya sobraban.
    expect(fraseDelPedido(pedida(10, 10), { objetivo: 50, stock: 100, comprar: 0 })).toBe("10 ya pedidas · 10 por llegar, ya descontadas · 10 más de lo que pide el plan");
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
