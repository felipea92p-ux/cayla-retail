import { describe, expect, it } from "vitest";
import { cuentaDeCompra, fraseDeRespuesta, graficoDelCosto, leerCostoPrenda, movidaDeCompra, respuestaCosto, textoDeMovida } from "./costo-prenda-reglas";

// El ejemplo de la maqueta (docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html), tal como lo devuelve la base.
const BASE = {
  compras: [
    { fecha: "2026-10-22T16:20:00+00:00", origen: "compra", llegaron: 24, costo_llegaron: 19.5, ya_habia: 35, costo_antes: 19.61, costo_despues: 19.57, documento: "F001-501", proveedor: "Textiles Rocío", persona: "Janis Revilla" },
    { fecha: "2026-10-05T15:12:00+00:00", origen: "compra", llegaron: 30, costo_llegaron: 18, ya_habia: 12, costo_antes: 18, costo_despues: 18, documento: "F001-455", proveedor: "Textiles Rocío", persona: "Janis Revilla" },
    { fecha: "2026-10-14T20:30:00+00:00", origen: "compra", llegaron: 40, costo_llegaron: "20.50", ya_habia: 22, costo_antes: 18, costo_despues: 19.61, documento: null, proveedor: null, persona: null },
  ],
  hoy: { stock: 47, costo: 19.57 },
  inicio: { fecha: "2026-09-12T15:00:00+00:00", costo: 18 },
};

describe("leerCostoPrenda", () => {
  it("sin respuesta (sin permiso de dinero o error) no hay pestaña", () => {
    expect(leerCostoPrenda(null)).toBeNull();
    expect(leerCostoPrenda("x")).toBeNull();
  });

  it("ordena las compras de la más vieja a la más nueva y acepta números que llegan como texto", () => {
    const c = leerCostoPrenda(BASE)!;
    expect(c.compras.map((x) => x.llegaron)).toEqual([30, 40, 24]);
    expect(c.compras[1]!.costoLlegaron).toBe(20.5);
    expect(c.hoy).toEqual({ stock: 47, costo: 19.57 });
  });

  it("descarta una fila sin cantidad o sin costo en vez de dibujarla rota", () => {
    const c = leerCostoPrenda({ compras: [{ fecha: "2026-10-01", llegaron: 0, costo_llegaron: 1, costo_despues: 1 }, { fecha: "2026-10-02", llegaron: 3 }] })!;
    expect(c.compras).toEqual([]);
    expect(c.hoy).toEqual({ stock: 0, costo: null });
  });
});

describe("movidaDeCompra", () => {
  const [primera, sube, baja] = leerCostoPrenda(BASE)!.compras;
  it("dice si el costo subió, bajó o quedó igual, a céntimos", () => {
    expect(movidaDeCompra(primera!)).toEqual({ tipo: "igual", monto: 0 });
    expect(movidaDeCompra(sube!)).toEqual({ tipo: "sube", monto: 1.61 });
    expect(movidaDeCompra(baja!)).toEqual({ tipo: "baja", monto: 0.04 });
  });
  it("la primera compra de una prenda sin stock no es un cambio: es donde empieza", () => {
    expect(movidaDeCompra({ ...primera!, yaHabia: 0, costoAntes: null, costoDespues: 25 })).toEqual({ tipo: "primera", monto: 0 });
  });
});

describe("respuestaCosto", () => {
  it("hoy, desde dónde y cuántas veces cambió", () => {
    const r = respuestaCosto(leerCostoPrenda(BASE)!);
    expect(r).toEqual({ hoy: 19.57, desde: 18, cambio: 1.57, veces: 2, stock: 47 });
    expect(fraseDeRespuesta(r)).toBe("Empezó en S/ 18.00 · cambió 2 veces, siempre al llegar mercadería");
  });

  it("si no había nada antes de la primera compra, se empieza en lo que costó esa compra (el costo declarado no cuenta)", () => {
    const c = leerCostoPrenda({ ...BASE, compras: [{ ...BASE.compras[1], ya_habia: 0, costo_antes: null, costo_llegaron: 22, costo_despues: 22 }], hoy: { stock: 30, costo: 22 } })!;
    const r = respuestaCosto(c);
    expect(r).toMatchObject({ hoy: 22, desde: 22, cambio: 0, veces: 0 });
    expect(fraseDeRespuesta(r)).toBe("Empezó en S/ 22.00 · no ha cambiado");
  });

  it("sin stock hoy, el costo de hoy es el que dejó la última compra", () => {
    expect(respuestaCosto(leerCostoPrenda({ ...BASE, hoy: { stock: 0, costo: null } })!).hoy).toBe(19.57);
  });
});

describe("cuentaDeCompra", () => {
  it("la cuenta del «?» en una línea, que cierra con lo que se muestra", () => {
    const [, sube] = leerCostoPrenda(BASE)!.compras;
    expect(cuentaDeCompra(sube!)).toBe("22 × S/ 18.00 + 40 × S/ 20.50 = S/ 1216.00 ÷ 62 = S/ 19.61");
  });
  it("sin nada antes, solo lo que llegó", () => {
    const [x] = leerCostoPrenda(BASE)!.compras;
    expect(cuentaDeCompra({ ...x!, yaHabia: 0, costoAntes: null })).toBe("30 × S/ 18.00 = S/ 540.00 ÷ 30 = S/ 18.00");
  });
});

describe("graficoDelCosto", () => {
  const AHORA = Date.parse("2026-10-24T17:00:00+00:00");
  it("escalones: el costo de antes, una marca por compra y hoy al final", () => {
    const g = graficoDelCosto(leerCostoPrenda(BASE)!, AHORA)!;
    expect(g.puntos.map((p) => p.y)).toEqual([18, 18, 19.61, 19.57, 19.57]);
    expect(g.puntos[0]!.x).toBe(Date.parse(BASE.inicio.fecha));
    expect(g.puntos.at(-1)!.x).toBe(AHORA);
    expect(g.marcas.map((m) => [m.n, m.y, m.movida.tipo])).toEqual([[1, 18, "igual"], [2, 19.61, "sube"], [3, 19.57, "baja"]]);
  });

  it("el eje deja aire para que un cambio de céntimos se vea, sin bajar de cero", () => {
    const g = graficoDelCosto(leerCostoPrenda(BASE)!, AHORA)!;
    expect(g.minY).toBeLessThan(18);
    expect(g.maxY).toBeGreaterThan(19.61);
    expect(g.minY).toBeGreaterThanOrEqual(0);
  });

  it("sin prendas antes de la primera compra, la línea empieza en esa compra", () => {
    const c = leerCostoPrenda({ ...BASE, compras: [{ ...BASE.compras[1], ya_habia: 0, costo_antes: null }] })!;
    const g = graficoDelCosto(c, AHORA)!;
    expect(g.puntos[0]).toEqual({ x: Date.parse(BASE.compras[1]!.fecha), y: 18 });
    expect(g.marcas[0]!.movida.tipo).toBe("primera");
  });

  it("las fechas no se pisan: «hoy» siempre está y las demás guardan distancia", () => {
    const g = graficoDelCosto(leerCostoPrenda(BASE)!, AHORA)!;
    expect(g.fechas.at(-1)).toEqual({ x: AHORA, texto: "hoy", fuerte: true });
    const xs = g.fechas.map((f) => f.x);
    for (let i = 1; i < xs.length; i++) expect((xs[i]! - xs[i - 1]!) / (g.hasta - g.desde)).toBeGreaterThanOrEqual(0.12);
    expect(g.fechas.map((f) => f.texto)).toContain("14 oct");
  });

  it("sin compras no hay gráfico", () => {
    expect(graficoDelCosto(leerCostoPrenda({ ...BASE, compras: [] })!, AHORA)).toBeNull();
  });

  it("el número dice lo que pasó en dos palabras", () => {
    expect(textoDeMovida({ tipo: "sube", monto: 1.61 })).toBe("↑ subió S/ 1.61");
    expect(textoDeMovida({ tipo: "baja", monto: 0.04 })).toBe("↓ bajó S/ 0.04");
    expect(textoDeMovida({ tipo: "igual", monto: 0 })).toBe("igual");
  });
});
