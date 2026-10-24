import { describe, expect, it } from "vitest";
import { cuentaDeCompra, fraseDeRespuesta, leerCostoPrenda, movidaDeCompra, respuestaCosto } from "./costo-prenda-reglas";

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
