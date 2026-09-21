import { describe, it, expect } from "vitest";
import {
  aFila,
  agruparPorDia,
  elegirComprobante,
  filtrosDesdeParams,
  limitesUTC,
  resumir,
  subtotalDeItem,
  textoMetodos,
  textoPrendas,
  totalDeVenta,
  unidadesDeVenta,
  type ItemCrudo,
  type VentaCruda,
} from "./ventas-historial-reglas";

const HOY = "2026-09-21";
const SEDE_LIMA = "11111111-1111-1111-1111-111111111111";
const SEDE_TRUJILLO = "22222222-2222-2222-2222-222222222222";
const VENDEDORA = "33333333-3333-3333-3333-333333333333";

const item = (parcial: Partial<ItemCrudo> = {}): ItemCrudo => ({
  cantidad: 1,
  precio_unitario: 100,
  descuento_unitario: 0,
  subtotal: 100,
  variante: { talla: { valor: "M" }, color: { nombre: "Negro" }, producto: { referencia: "Blusa Emma" } },
  ...parcial,
});

const venta = (parcial: Partial<VentaCruda> = {}): VentaCruda => ({
  id: "v1",
  created_at: "2026-09-19T17:05:00+00:00",
  estado: "completada",
  nota: null,
  usuario_id: VENDEDORA,
  ubicacion: { id: SEDE_LIMA, nombre: "Tienda Lima" },
  cliente: null,
  venta_items: [item()],
  venta_pagos: [{ metodo: "efectivo", monto: 100 }],
  comprobantes: [],
  ...parcial,
});

describe("limitesUTC — los días son de Lima, la base pide UTC", () => {
  it("un mes completo: desde 00:00 de Lima del primero hasta 00:00 de Lima del día siguiente al último", () => {
    expect(limitesUTC("2026-09-01", "2026-09-30")).toEqual({
      desdeISO: "2026-09-01T05:00:00.000Z",
      hastaISO: "2026-10-01T05:00:00.000Z",
    });
  });

  it("una venta de las 11:59 p. m. de Lima (04:59 UTC del día siguiente) sigue dentro de su día", () => {
    const { hastaISO } = limitesUTC(undefined, "2026-09-19");
    expect("2026-09-20T04:59:59.000Z" < hastaISO!).toBe(true);
    expect("2026-09-20T05:00:00.000Z" < hastaISO!).toBe(false);
  });

  it("sin fechas no pone límite; con una sola, solo ese lado", () => {
    expect(limitesUTC()).toEqual({ desdeISO: undefined, hastaISO: undefined });
    expect(limitesUTC("2026-09-01")).toEqual({ desdeISO: "2026-09-01T05:00:00.000Z", hastaISO: undefined });
  });
});

describe("filtrosDesdeParams", () => {
  const ctxLider = { esLider: true, sedesIds: [SEDE_LIMA, SEDE_TRUJILLO], hoy: HOY };
  const ctxIntegrante = { esLider: false, sedesIds: [SEDE_LIMA, SEDE_TRUJILLO], hoy: HOY };

  it("sin nada en la URL: últimos 30 días, todas las ventas, sin filtros", () => {
    expect(filtrosDesdeParams({}, ctxLider)).toEqual({
      periodo: "30",
      desde: "2026-08-23",
      hasta: undefined,
      sedeId: undefined,
      vendedorId: undefined,
      estado: "todas",
      pago: undefined,
      comprobante: "todos",
    });
  });

  it("un rango rápido y unas fechas propias se resuelven como en Movimientos", () => {
    expect(filtrosDesdeParams({ rango: "7" }, ctxLider)).toMatchObject({ periodo: "7", desde: "2026-09-15" });
    expect(filtrosDesdeParams({ desde: "2026-09-01", hasta: "2026-09-10" }, ctxLider)).toMatchObject({
      periodo: "personalizado",
      desde: "2026-09-01",
      hasta: "2026-09-10",
    });
  });

  it("solo un líder mira otra tienda u otra persona; una integrante los ignora", () => {
    const params = { sede: SEDE_TRUJILLO, vendedor: VENDEDORA };
    expect(filtrosDesdeParams(params, ctxLider)).toMatchObject({ sedeId: SEDE_TRUJILLO, vendedorId: VENDEDORA });
    expect(filtrosDesdeParams(params, ctxIntegrante)).toMatchObject({ sedeId: undefined, vendedorId: undefined });
  });

  it("una tienda que no existe o un vendedor mal escrito se descartan", () => {
    expect(filtrosDesdeParams({ sede: "otra-cosa", vendedor: "x'; drop" }, ctxLider)).toMatchObject({
      sedeId: undefined,
      vendedorId: undefined,
    });
  });

  it("estado, pago y comprobante: solo valores conocidos", () => {
    expect(filtrosDesdeParams({ estado: "anulada", pago: "yape", comp: "sin" }, ctxLider)).toMatchObject({
      estado: "anulada",
      pago: "yape",
      comprobante: "sin",
    });
    expect(filtrosDesdeParams({ estado: "borrada", pago: "bitcoin", comp: "quizas" }, ctxLider)).toMatchObject({
      estado: "todas",
      pago: undefined,
      comprobante: "todos",
    });
  });
});

describe("importes de una venta", () => {
  it("usa el subtotal que guarda la base", () => {
    expect(subtotalDeItem(item({ cantidad: 2, subtotal: "180.00" }))).toBe(180);
  });

  it("si el subtotal falta, lo calcula: (precio − descuento) × cantidad", () => {
    expect(subtotalDeItem(item({ cantidad: 3, precio_unitario: "50.00", descuento_unitario: "5.00", subtotal: null }))).toBe(135);
  });

  it("suma sin arrastrar ruido de decimales (0.1 + 0.2)", () => {
    expect(totalDeVenta([item({ subtotal: 0.1 }), item({ subtotal: 0.2 })])).toBe(0.3);
  });

  it("cuenta las prendas, no las líneas", () => {
    expect(unidadesDeVenta([item({ cantidad: 2 }), item({ cantidad: 1 })])).toBe(3);
  });
});

describe("textos de la fila", () => {
  it("prendas: nombre, talla, color y cantidad; más de dos se resumen", () => {
    expect(textoPrendas([item({ cantidad: 2 })])).toBe("Blusa Emma · M · Negro ×2");
    const tres = [item(), item({ variante: { talla: null, color: null, producto: { referencia: "Falda" } } }), item()];
    expect(textoPrendas(tres)).toBe("Blusa Emma · M · Negro, Falda y 1 más");
  });

  it("una línea sin variante se llama «Prenda», no rompe", () => {
    expect(textoPrendas([item({ variante: null })])).toBe("Prenda");
  });

  it("métodos: cada uno una vez, en el orden en que se cobró", () => {
    expect(textoMetodos([{ metodo: "efectivo" }, { metodo: "yape" }, { metodo: "efectivo" }])).toBe("Efectivo + Yape");
    expect(textoMetodos([{ metodo: "cripto" }])).toBe("cripto");
    expect(textoMetodos([])).toBe("");
  });
});

describe("elegirComprobante", () => {
  const c = (parcial: Partial<VentaCruda["comprobantes"][number]>) => ({
    tipo: "boleta",
    serie: "B001",
    numero: 10,
    estado: "aceptado",
    created_at: "2026-09-19T17:06:00+00:00",
    ...parcial,
  });

  it("da el número con el formato de siempre", () => {
    expect(elegirComprobante([c({})])).toEqual({ tipo: "boleta", numero: "B001-000010", estado: "aceptado" });
  });

  it("una nota de crédito no ampara la venta: no cuenta como comprobante", () => {
    expect(elegirComprobante([c({ tipo: "nota_credito", serie: "BC01" })])).toBeNull();
    expect(elegirComprobante([])).toBeNull();
  });

  it("si hubo dos, gana el más reciente que siga vivo", () => {
    const rechazada = c({ numero: 11, estado: "rechazado", created_at: "2026-09-19T17:10:00+00:00" });
    const vigente = c({ numero: 12, estado: "pendiente", created_at: "2026-09-19T17:05:00+00:00" });
    expect(elegirComprobante([rechazada, vigente])?.numero).toBe("B001-000012");
  });

  it("si todos murieron, muestra el último para que se vea por qué", () => {
    const vieja = c({ numero: 11, estado: "anulado", created_at: "2026-09-19T17:05:00+00:00" });
    const nueva = c({ numero: 12, estado: "rechazado", created_at: "2026-09-19T17:10:00+00:00" });
    expect(elegirComprobante([vieja, nueva])).toMatchObject({ numero: "B001-000012", estado: "rechazado" });
  });
});

describe("resumir — lo anulado nunca suma", () => {
  it("no cuenta las anuladas en lo vendido ni en el ticket promedio, pero las cuenta aparte", () => {
    const r = resumir([
      { anulada: false, total: 100, unidades: 1 },
      { anulada: false, total: 51, unidades: 2 },
      { anulada: true, total: 999, unidades: 9 },
    ]);
    expect(r).toEqual({ ventas: 2, anuladas: 1, unidades: 3, total: 151, ticket: 75.5 });
  });

  it("un rango vacío da ceros, sin dividir por cero", () => {
    expect(resumir([])).toEqual({ ventas: 0, anuladas: 0, unidades: 0, total: 0, ticket: 0 });
    expect(resumir([{ anulada: true, total: 50, unidades: 1 }])).toMatchObject({ ventas: 0, anuladas: 1, total: 0, ticket: 0 });
  });
});

describe("aFila", () => {
  it("el día y la hora son de Lima: las 9:30 p. m. del 19 no son «el 20»", () => {
    const f = aFila(venta({ created_at: "2026-09-20T02:30:00+00:00" }), new Map());
    expect(f.fecha).toBe("2026-09-19");
    expect(f.hora).toBe("21:30");
  });

  it("arma la fila con vendedor, clienta, importe, pago y comprobante", () => {
    const f = aFila(
      venta({
        cliente: { nombre: "Ana Pérez" },
        venta_items: [item({ cantidad: 2, subtotal: 180 })],
        venta_pagos: [{ metodo: "yape", monto: 180 }],
        comprobantes: [{ tipo: "boleta", serie: "B001", numero: 7, estado: "aceptado", created_at: "2026-09-19T17:06:00+00:00" }],
      }),
      new Map([[VENDEDORA, "Micaela Ríos"]])
    );
    expect(f).toMatchObject({
      vendedor: "Micaela Ríos",
      clienta: "Ana Pérez",
      unidades: 2,
      total: 180,
      pagos: "Yape",
      anulada: false,
      comprobante: { numero: "B001-000007", estado: "aceptado" },
    });
  });

  it("una venta anulada se marca; sin nombre de vendedor conocido queda en null (no se inventa)", () => {
    const f = aFila(venta({ estado: "anulada" }), new Map());
    expect(f.anulada).toBe(true);
    expect(f.vendedor).toBeNull();
    expect(f.comprobante).toBeNull();
  });
});

describe("agruparPorDia", () => {
  it("agrupa tramos continuos por día de Lima, conservando el orden", () => {
    const filas = [
      aFila(venta({ id: "a", created_at: "2026-09-20T15:00:00+00:00" }), new Map()),
      aFila(venta({ id: "b", created_at: "2026-09-20T14:00:00+00:00" }), new Map()),
      aFila(venta({ id: "c", created_at: "2026-09-19T15:00:00+00:00" }), new Map()),
    ];
    const dias = agruparPorDia(filas);
    expect(dias.map((d) => [d.fecha, d.filas.map((f) => f.id)])).toEqual([
      ["2026-09-20", ["a", "b"]],
      ["2026-09-19", ["c"]],
    ]);
    expect(agruparPorDia([])).toEqual([]);
  });
});
