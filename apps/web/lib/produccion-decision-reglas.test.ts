import { describe, expect, it } from "vitest";
import type { FilaResumen } from "./resumen-reglas";
import { demandaDeInsumos } from "./produccion-decisiones";
import {
  analizarInsumos,
  costoMaterialesPorPrenda,
  demandaDeLaRed,
  enProduccionPorVariante,
  cantidadesDeLaCurva,
  productosParaRendimiento,
  rendimientoMedido,
  repartirFalta,
  sugerirCurva,
  sugerirVariante,
  type ConsumoParaRendimiento,
  type DemandaVariante,
  type OrdenParaRendimiento,
  type Rendimiento,
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
  it("ventasBase cuenta solo las ventas de las sedes con las que SE MIDIÓ el ritmo; ventasNetas, las de toda la red", () => {
    const d = demandaDeLaRed([
      { tipo: "tienda", filas: [fila("v1", { utilizable: 6, ventas: 30 })] }, // 30 días de venta: mide ritmo
      { tipo: "tienda", filas: [fila("v1", { utilizable: 1, ventas: 5, diasConStock: 2, diasObservables: 2 })] }, // 2 días: poco historial, sin ritmo
    ]).get("v1")!;
    expect(d.sedesConRitmo).toBe(1);
    expect(d.ventasNetas).toBe(35);
    expect(d.ventasBase).toBe(30);
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
  ventasBase: 30,
  cobertura: { tipo: "agotado", dias: 0 },
  banda: "agotado",
  ...extra,
});

describe("productosParaRendimiento (una orden abierta de un modelo que ya no se ofrece igual necesita su tela)", () => {
  const ordenes = [
    { id: "c1", productoId: "viejo", estado: "terminada", esMuestra: false, cantidadBuenas: 50 },
    { id: "a1", productoId: "viejo", estado: "en_proceso", esMuestra: false, cantidadBuenas: null },
    { id: "c2", productoId: "vigente", estado: "terminada", esMuestra: false, cantidadBuenas: 20 },
  ];
  const consumos = {
    c1: [{ insumoId: "lino", insumo: "Lino", unidad: "metro" as const, tipo: "tela" as const, cantidad: 125 }], // 2,5 m por prenda
    c2: [{ insumoId: "lino", insumo: "Lino", unidad: "metro" as const, tipo: "tela" as const, cantidad: 40 }],
  };

  it("incluye a los modelos que se ofrecen y a todo producto con una orden, sin repetir", () => {
    expect(productosParaRendimiento([{ productoId: "vigente" }, { productoId: "nuevo" }], ordenes).sort()).toEqual(["nuevo", "viejo", "vigente"]);
  });
  it("sin modelos que ofrecer, los productos de las órdenes siguen teniendo rendimiento", () => {
    expect(productosParaRendimiento([], ordenes).sort()).toEqual(["viejo", "vigente"]);
  });
  it("regresión: si el modelo con la orden abierta ya no se ofrece, su rendimiento se mide igual y la orden abierta sigue pidiendo tela", () => {
    // `modelos` ya no trae a «viejo» (descontinuado): antes el rendimiento solo se medía para `modelos` y «viejo» quedaba sin demanda.
    const ids = productosParaRendimiento([{ productoId: "vigente" }], ordenes);
    const rendimientoPorModelo = Object.fromEntries(ids.map((id) => [id, rendimientoMedido(id, ordenes, consumos)]).filter(([, r]) => (r as unknown[]).length > 0));
    expect(rendimientoPorModelo.viejo?.[0].porPrenda).toBeCloseTo(2.5, 5);
    const pide = demandaDeInsumos(
      [{ id: "a1", referencia: "Blusa vieja", productoId: "viejo", estado: "en_proceso", esMuestra: false, fechaEntrega: null, cantidadPlan: 40, etapas: {} }],
      rendimientoPorModelo as Record<string, Rendimiento[]>,
      {}
    );
    expect(pide.get("lino")?.necesita).toBeCloseTo(100, 5); // 40 prendas × 2,5 m
  });
});

describe("cantidadesDeLaCurva (lo que «Usar la sugerencia» escribe en la matriz)", () => {
  const sug = (varianteId: string, sugerido: number) => ({ varianteId, sugerido, motivo: "", diasConLoQueHay: null, disponible: 0 });
  it("escribe solo las variantes que hay que fabricar, como texto de campo", () => {
    const curva = { porVariante: new Map([["a", sug("a", 4)], ["b", sug("b", 0)], ["c", sug("c", 12)]]), total: 16 };
    expect(cantidadesDeLaCurva(curva)).toEqual({ a: "4", c: "12" });
  });
  it("sin nada que fabricar, la matriz queda vacía", () => {
    expect(cantidadesDeLaCurva({ porVariante: new Map([["a", sug("a", 0)]]), total: 0 })).toEqual({});
    expect(cantidadesDeLaCurva({ porVariante: new Map(), total: 0 })).toEqual({});
  });
});

describe("repartirFalta (lo que falta: qué se traslada del Taller y qué hay que fabricar)", () => {
  it("lo que falta ya está en el Taller: se traslada y no hace falta fabricar nada", () => {
    // 1 por día × 30 = 30; hay 0 en tiendas y 40 en el Taller.
    expect(repartirFalta(demanda({ ritmoDia: 1, stockRed: 0, stockTaller: 40 }), 0, 30)).toEqual({ trasladar: 30, producir: 0 });
  });
  it("el Taller no alcanza: se traslada todo lo que hay y se fabrica el resto", () => {
    expect(repartirFalta(demanda({ ritmoDia: 1, stockRed: 0, stockTaller: 10 }), 0, 30)).toEqual({ trasladar: 10, producir: 20 });
  });
  it("una orden abierta de 1 prenda no apaga una falta de 30: faltan 29", () => {
    expect(repartirFalta(demanda({ ritmoDia: 1, stockRed: 0, stockTaller: 0 }), 1, 30)).toEqual({ trasladar: 0, producir: 29 });
  });
  it("una orden que cubre lo que falta lo deja en cero", () => {
    expect(repartirFalta(demanda({ ritmoDia: 1, stockRed: 0, stockTaller: 0 }), 30, 30)).toEqual({ trasladar: 0, producir: 0 });
  });
  it("lo que viene en camino y lo que hay en tiendas también se descuentan", () => {
    expect(repartirFalta(demanda({ ritmoDia: 1, stockRed: 10, stockTaller: 0, enCamino: 5 }), 0, 30)).toEqual({ trasladar: 0, producir: 15 });
  });
  it("sin ritmo medido no hay base: ni se traslada ni se fabrica", () => {
    expect(repartirFalta(demanda({ ritmoDia: null, stockRed: 0, stockTaller: 40 }), 0, 30)).toEqual({ trasladar: 0, producir: 0 });
    expect(repartirFalta(undefined, 0, 30)).toEqual({ trasladar: 0, producir: 0 });
  });
  it("`producir` es EXACTAMENTE el `sugerido` de sugerirVariante en cualquier combinación (una sola cifra para Nueva orden y el Resumen)", () => {
    for (const ritmoDia of [0.1, 0.5, 1, 2.3, 7]) for (const stockRed of [0, 1, 3, 12, 40]) for (const stockTaller of [0, 2, 9, 50]) for (const enCamino of [0, 4]) for (const enProd of [0, 5, 30]) {
      const d = demanda({ ritmoDia, stockRed, stockTaller, enCamino });
      expect(repartirFalta(d, enProd, 30).producir).toBe(sugerirVariante(d, enProd, 30)!.sugerido);
    }
  });
  it("nunca traslada más de lo que hay en el Taller ni más de lo que falta", () => {
    for (const stockTaller of [0, 3, 100]) {
      const r = repartirFalta(demanda({ ritmoDia: 1, stockRed: 0, stockTaller }), 0, 30);
      expect(r.trasladar).toBeLessThanOrEqual(stockTaller);
      expect(r.trasladar + r.producir).toBe(30);
    }
  });
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
