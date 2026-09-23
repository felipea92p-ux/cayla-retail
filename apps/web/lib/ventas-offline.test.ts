import { describe, expect, it } from "vitest";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import {
  carritoPasaElUmbral,
  conStockComprometidoDescontado,
  firmaDeVentaEncolada,
  pasaElUmbralDeSobra,
  stockComprometido,
  totalEfectivoEncolado,
  type VentaEncolada,
} from "./ventas-offline";

// La aritmética de la cola offline: cuánto compromete, si el overlay se aplica bien
// sobre el stock que llega del servidor, y el umbral de "al menos 1 de sobra" (ADR-0013
// §C) que decide si una venta se puede encolar sin red.

function venta(parcial: Partial<VentaEncolada> & { items: VentaEncolada["items"] }): VentaEncolada {
  return {
    token: crypto.randomUUID(),
    ubicacionId: "sede-1",
    creadoEn: new Date().toISOString(),
    rechazo: null,
    params: {
      p_ubicacion_id: "sede-1",
      p_items: [],
      p_pagos: [],
      p_token: "t",
      p_tipo_comprobante: "boleta",
      p_cliente_tipo_doc: "sin_documento",
    },
    ...parcial,
  };
}

describe("stockComprometido", () => {
  it("suma la cantidad de una sola venta encolada", () => {
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 2 }] })];
    expect(stockComprometido(cola)).toEqual(new Map([["v1", 2]]));
  });
  it("suma entre DOS ventas de la misma variante, no se pisan", () => {
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 2 }] }), venta({ items: [{ varianteId: "v1", cantidad: 1 }] })];
    expect(stockComprometido(cola).get("v1")).toBe(3);
  });
  it("el Monto manual (ID_CARGO_ESPECIAL) nunca compromete stock", () => {
    const cola = [venta({ items: [{ varianteId: ID_CARGO_ESPECIAL, cantidad: 1 }] })];
    expect(stockComprometido(cola).size).toBe(0);
  });
  it("cola vacía no compromete nada", () => {
    expect(stockComprometido([]).size).toBe(0);
  });
  it("una venta RECHAZADA no compromete stock — el servidor la revirtió entera, no existe", () => {
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 2 }], rechazo: "Esta caja ya está cerrada" })];
    expect(stockComprometido(cola).size).toBe(0);
  });
});

describe("conStockComprometidoDescontado", () => {
  const variantes = [
    { varianteId: "v1", stockAqui: 5 },
    { varianteId: "v2", stockAqui: 3 },
  ];
  it("descuenta lo comprometido de la variante que corresponde", () => {
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 2 }] })];
    const resultado = conStockComprometidoDescontado(variantes, cola);
    expect(resultado.find((v) => v.varianteId === "v1")?.stockAqui).toBe(3);
    expect(resultado.find((v) => v.varianteId === "v2")?.stockAqui).toBe(3);
  });
  it("nunca deja stockAqui negativo aunque la cola comprometa más de lo que hay", () => {
    const cola = [venta({ items: [{ varianteId: "v1", cantidad: 99 }] })];
    expect(conStockComprometidoDescontado(variantes, cola).find((v) => v.varianteId === "v1")?.stockAqui).toBe(0);
  });
  it("cola vacía devuelve las variantes tal cual (mismo array, sin copiar de más)", () => {
    expect(conStockComprometidoDescontado(variantes, [])).toBe(variantes);
  });
});

describe("pasaElUmbralDeSobra — ADR-0013 §C: al menos 1 de sobra", () => {
  it("pasa cuando sobra exactamente 1", () => {
    expect(pasaElUmbralDeSobra(5, 4)).toBe(true);
  });
  it("no pasa cuando se lleva la última unidad", () => {
    expect(pasaElUmbralDeSobra(5, 5)).toBe(false);
  });
  it("no pasa si ya no hay stock", () => {
    expect(pasaElUmbralDeSobra(0, 1)).toBe(false);
  });
});

describe("carritoPasaElUmbral", () => {
  it("todo el carrito pasa si cada variante deja de sobra", () => {
    const mapa = new Map([
      ["v1", 5],
      ["v2", 3],
    ]);
    expect(carritoPasaElUmbral([{ varianteId: "v1", cantidad: 2 }, { varianteId: "v2", cantidad: 1 }], mapa)).toBe(true);
  });
  it("todo o nada: una sola línea sin sobra bloquea el carrito entero", () => {
    const mapa = new Map([
      ["v1", 5],
      ["v2", 3],
    ]);
    expect(carritoPasaElUmbral([{ varianteId: "v1", cantidad: 2 }, { varianteId: "v2", cantidad: 3 }], mapa)).toBe(false);
  });
  it("agrupa dos líneas de la MISMA variante antes de juzgar el umbral", () => {
    const mapa = new Map([["v1", 5]]);
    // 2 + 2 = 4, sobra 1: pasa. Si no agrupara (juzgara cada línea contra el bruto), pasaría igual pero por la razón equivocada.
    expect(carritoPasaElUmbral([{ varianteId: "v1", cantidad: 2 }, { varianteId: "v1", cantidad: 2 }], mapa)).toBe(true);
    expect(carritoPasaElUmbral([{ varianteId: "v1", cantidad: 3 }, { varianteId: "v1", cantidad: 2 }], mapa)).toBe(false);
  });
  it("el Monto manual nunca bloquea, aunque no esté en el mapa de stock", () => {
    expect(carritoPasaElUmbral([{ varianteId: ID_CARGO_ESPECIAL, cantidad: 500 }], new Map())).toBe(true);
  });
  it("una variante ausente del mapa cuenta como 0 de stock", () => {
    expect(carritoPasaElUmbral([{ varianteId: "fantasma", cantidad: 1 }], new Map())).toBe(false);
  });
});

describe("totalEfectivoEncolado", () => {
  it("suma solo los pagos en efectivo, no otros medios", () => {
    const cola = [
      venta({
        items: [],
        params: {
          p_ubicacion_id: "sede-1",
          p_items: [],
          p_pagos: [
            { metodo: "efectivo", monto: 30 },
            { metodo: "yape", monto: 20 },
          ],
          p_token: "t",
          p_tipo_comprobante: "boleta",
          p_cliente_tipo_doc: "sin_documento",
        },
      }),
    ];
    expect(totalEfectivoEncolado(cola)).toBe(30);
  });
  it("una venta rechazada (no es plata en camino) no se cuenta", () => {
    const cola = [
      venta({
        items: [],
        rechazo: "Esta caja ya está cerrada",
        params: {
          p_ubicacion_id: "sede-1",
          p_items: [],
          p_pagos: [{ metodo: "efectivo", monto: 50 }],
          p_token: "t",
          p_tipo_comprobante: "boleta",
          p_cliente_tipo_doc: "sin_documento",
        },
      }),
    ];
    expect(totalEfectivoEncolado(cola)).toBe(0);
  });
  it("cola vacía suma 0", () => {
    expect(totalEfectivoEncolado([])).toBe(0);
  });
});

describe("firmaDeVentaEncolada — el responsable viaja con la venta sin conexión (ADR-0161/0162)", () => {
  it("sube con el responsable elegido, la tienda de la venta y la HORA DE LA VENTA (x-momento), no la de subida", () => {
    const v = venta({ items: [], creadoEn: "2026-09-22T15:30:00.000Z" });
    v.params.p_asesora_id = "p-ana";
    expect(firmaDeVentaEncolada(v)).toEqual({ responsableId: "p-ana", ubicacionId: "sede-1", momento: "2026-09-22T15:30:00.000Z" });
  });

  it("una venta encolada antes del combo (sin responsable) sube sin firma, como antes", () => {
    expect(firmaDeVentaEncolada(venta({ items: [] }))).toBeNull();
  });
});
