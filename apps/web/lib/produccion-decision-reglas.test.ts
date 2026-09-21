import { describe, expect, it } from "vitest";
import type { FilaResumen } from "./resumen-reglas";
import {
  analizarInsumos,
  costoMaterialesPorPrenda,
  demandaDeLaRed,
  enProduccionPorVariante,
  rendimientoMedido,
  sugerirCurva,
  sugerirVariante,
  type ConsumoParaRendimiento,
  type DemandaVariante,
  type OrdenParaRendimiento,
} from "./produccion-decision-reglas";

// Una fila mínima: solo lo que usan `velocidadDeFila` y la demanda.
const fila = (varianteId: string, extra: Partial<FilaResumen> = {}): FilaResumen =>
  ({
    varianteId,
    productoId: "p1",
    utilizable: 0,
    enCamino: 0,
    ventas: 0,
    devoluciones: 0,
    diasConStock: 30,
    diasObservables: 30,
    ledgerConsistente: true,
    ...extra,
  }) as FilaResumen;

describe("demandaDeLaRed", () => {
  it("suma el stock y el ritmo de las tiendas; el Taller cuenta aparte", () => {
    const d = demandaDeLaRed([
      { tipo: "tienda", filas: [fila("v1", { utilizable: 6, ventas: 30, enCamino: 2 })] }, // 1/día
      { tipo: "tienda", filas: [fila("v1", { utilizable: 4, ventas: 15 })] }, // 0,5/día
      { tipo: "taller", filas: [fila("v1", { utilizable: 10 })] },
    ]).get("v1")!;
    expect(d.stockRed).toBe(10);
    expect(d.stockTaller).toBe(10);
    expect(d.enCamino).toBe(2);
    expect(d.ritmoDia).toBeCloseTo(1.5, 5);
    expect(d.sedesConRitmo).toBe(2);
    expect(d.cobertura).toEqual({ tipo: "medida", dias: expect.closeTo(10 / 1.5, 5) });
  });
  it("sin stock en la red está agotado; sin ventas medidas no hay cobertura", () => {
    const d = demandaDeLaRed([{ tipo: "tienda", filas: [fila("v1", { utilizable: 0, ventas: 20 }), fila("v2", { utilizable: 5, ventas: 0, diasConStock: 5, diasObservables: 5 })] }]);
    expect(d.get("v1")!.banda).toBe("agotado");
    expect(d.get("v2")!.cobertura.tipo).not.toBe("medida");
  });
});

const demanda = (extra: Partial<DemandaVariante> = {}): DemandaVariante => ({
  varianteId: "v1",
  productoId: "p1",
  stockRed: 0,
  stockTaller: 0,
  enCamino: 0,
  ritmoDia: 1,
  sedesConRitmo: 1,
  ventasNetas: 30,
  cobertura: { tipo: "agotado", dias: 0 },
  banda: "agotado",
  ...extra,
});

describe("sugerirVariante", () => {
  it("lo que se venderá en el horizonte menos lo que ya hay y viene", () => {
    const s = sugerirVariante(demanda({ ritmoDia: 1, stockRed: 8, stockTaller: 4, enCamino: 3 }), 5, 30)!;
    expect(s.disponible).toBe(20);
    expect(s.sugerido).toBe(10); // 30 − 20
    expect(s.diasConLoQueHay).toBe(20);
  });
  it("redondea hacia arriba y no sugiere si ya se cubre", () => {
    expect(sugerirVariante(demanda({ ritmoDia: 0.4 }), 0, 30)!.sugerido).toBe(12);
    expect(sugerirVariante(demanda({ ritmoDia: 1, stockRed: 40 }), 0, 30)!.sugerido).toBe(0);
  });
  it("sin ritmo medido no inventa una demanda y lo dice", () => {
    const s = sugerirVariante(demanda({ ritmoDia: null, ventasNetas: 0 }), 0, 30)!;
    expect(s.sugerido).toBe(0);
    expect(s.motivo).toContain("Sin ventas");
    expect(sugerirVariante(demanda({ ritmoDia: null, ventasNetas: 4 }), 0, 30)!.motivo).toContain("Poco historial");
  });
  it("una variante sin datos de la red no tiene sugerencia", () => {
    expect(sugerirVariante(undefined, 0, 30)).toBeNull();
  });
  it("un horizonte más largo sugiere más", () => {
    expect(sugerirVariante(demanda(), 0, 60)!.sugerido).toBeGreaterThan(sugerirVariante(demanda(), 0, 15)!.sugerido);
  });
});

describe("sugerirCurva y lo que ya se fabrica", () => {
  it("suma el total y cuenta lo que ya está en órdenes abiertas (no muestras)", () => {
    const enProd = enProduccionPorVariante([
      { estado: "en_proceso", esMuestra: false, lineas: [{ varianteId: "v1", cantidadPlan: 10 }] },
      { estado: "en_proceso", esMuestra: true, lineas: [{ varianteId: "v1", cantidadPlan: 99 }] },
      { estado: "terminada", esMuestra: false, lineas: [{ varianteId: "v1", cantidadPlan: 99 }] },
    ]);
    expect(enProd.get("v1")).toBe(10);
    const d = new Map([["v1", demanda({ ritmoDia: 1 })], ["v2", demanda({ varianteId: "v2", ritmoDia: 2 })]]);
    const c = sugerirCurva([{ varianteId: "v1" }, { varianteId: "v2" }, { varianteId: "v3" }], d, enProd, 30);
    expect(c.porVariante.get("v1")!.sugerido).toBe(20); // 30 − 10 en producción
    expect(c.porVariante.get("v2")!.sugerido).toBe(60);
    expect(c.porVariante.has("v3")).toBe(false);
    expect(c.total).toBe(80);
  });
});

const orden = (id: string, extra: Partial<OrdenParaRendimiento> = {}): OrdenParaRendimiento => ({ id, productoId: "p1", estado: "terminada", esMuestra: false, cantidadBuenas: 20, ...extra });
const cons = (insumoId: string, cantidad: number, extra: Partial<ConsumoParaRendimiento> = {}): ConsumoParaRendimiento => ({ insumoId, insumo: `Insumo ${insumoId}`, unidad: "metro", tipo: "tela", cantidad, ...extra });

describe("rendimientoMedido (D-D)", () => {
  it("consumo real ÷ prendas buenas, pesado por prendas, solo órdenes cerradas del modelo", () => {
    const r = rendimientoMedido(
      "p1",
      [orden("o1", { cantidadBuenas: 20 }), orden("o2", { cantidadBuenas: 30 }), orden("o3", { productoId: "otro" }), orden("o4", { estado: "en_proceso" }), orden("o5", { esMuestra: true })],
      { o1: [cons("lino", 50)], o2: [cons("lino", 75)], o3: [cons("lino", 999)], o4: [cons("lino", 999)], o5: [cons("lino", 999)] }
    );
    expect(r).toHaveLength(1);
    expect(r[0].porPrenda).toBeCloseTo(125 / 50, 5); // 2,5 m por prenda
    expect(r[0].ordenes).toBe(2);
    expect(r[0].prendas).toBe(50);
  });
  it("una devolución resta y un insumo devuelto por completo no cuenta; varios movimientos de una orden no la duplican", () => {
    const r = rendimientoMedido("p1", [orden("o1")], {
      o1: [cons("lino", 40), cons("lino", -10), cons("boton", 20, { tipo: "avio", unidad: "unidad" }), cons("boton", -20, { tipo: "avio", unidad: "unidad" })],
    });
    expect(r.map((x) => x.insumoId)).toEqual(["lino"]);
    expect(r[0].porPrenda).toBeCloseTo(30 / 20, 5);
    expect(r[0].ordenes).toBe(1);
  });
  it("sin órdenes cerradas con consumo no hay rendimiento", () => {
    expect(rendimientoMedido("p1", [orden("o1")], {})).toEqual([]);
  });
  it("telas primero, luego avíos", () => {
    const r = rendimientoMedido("p1", [orden("o1")], { o1: [cons("boton", 20, { tipo: "avio" }), cons("lino", 40)] });
    expect(r.map((x) => x.tipo)).toEqual(["tela", "avio"]);
  });
});

describe("analizarInsumos", () => {
  const rend = [{ insumoId: "lino", insumo: "Lino", unidad: "metro" as const, tipo: "tela" as const, porPrenda: 2.5, ordenes: 2, prendas: 50 }];
  it("alcanza, alcanza si llega lo pedido, o falta", () => {
    const con = (saldo: number, porLlegar: number) => analizarInsumos(rend, 40, new Map([["lino", { insumoId: "lino", saldo, porLlegar }]]))[0]; // necesita 100 m
    expect(con(120, 0)).toMatchObject({ estado: "alcanza", faltan: 0, necesita: 100 });
    expect(con(60, 50)).toMatchObject({ estado: "alcanza_si_llega", faltan: 0 });
    expect(con(60, 20)).toMatchObject({ estado: "falta", faltan: 20 });
  });
  it("dice cuántas prendas se cortan con el saldo de hoy; un insumo sin saldo registrado falta todo", () => {
    expect(analizarInsumos(rend, 40, new Map([["lino", { insumoId: "lino", saldo: 60, porLlegar: 0 }]]))[0].prendasConElSaldo).toBe(24);
    expect(analizarInsumos(rend, 10, new Map())[0]).toMatchObject({ estado: "falta", faltan: 25, saldo: 0 });
  });
});

describe("costoMaterialesPorPrenda", () => {
  const rend = [
    { insumoId: "lino", insumo: "Lino", unidad: "metro" as const, tipo: "tela" as const, porPrenda: 2.5, ordenes: 1, prendas: 20 },
    { insumoId: "boton", insumo: "Botón", unidad: "unidad" as const, tipo: "avio" as const, porPrenda: 6, ordenes: 1, prendas: 20 },
  ];
  it("suma rendimiento × costo unitario de cada insumo", () => {
    expect(costoMaterialesPorPrenda(rend, (id) => (id === "lino" ? 20 : 0.5))).toBe(53);
  });
  it("si algún costo no se conoce, no hay costo (no se calcula con datos que faltan)", () => {
    expect(costoMaterialesPorPrenda(rend, (id) => (id === "lino" ? 20 : null))).toBeNull();
  });
});
