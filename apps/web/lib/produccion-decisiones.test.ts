import { describe, expect, it } from "vitest";
import type { ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import type { DemandaVariante, Rendimiento } from "./produccion-decision-reglas";
import {
  cifrasResumen,
  decisionesDeProduccion,
  demandaDeInsumos,
  filasDeTela,
  filasPorModelo,
  type ContextoDecisiones,
  type InsumoParaDecidir,
  type OrdenParaDecidir,
} from "./produccion-decisiones";

const HOY = "2026-09-21";
const orden = (id: string, extra: Partial<OrdenParaDecidir> = {}): OrdenParaDecidir => ({
  id,
  referencia: `Blusa ${id}`,
  productoId: "p1",
  estado: "en_proceso",
  esMuestra: false,
  fechaEntrega: null,
  cantidadPlan: 40,
  etapas: {},
  ...extra,
});
const insumo = (id: string, extra: Partial<InsumoParaDecidir> = {}): InsumoParaDecidir => ({ id, nombre: `Insumo ${id}`, unidad: "metro", tipo: "tela", saldo: 100, minimo: 50, tono: "bien", ...extra });
const rend = (insumoId: string, porPrenda: number): Rendimiento => ({ insumoId, insumo: `Insumo ${insumoId}`, unidad: "metro", tipo: "tela", porPrenda, ordenes: 2, prendas: 50 });
const comp = (id: string, extra: Partial<ComprobanteProduccion> = {}): ComprobanteProduccion => ({
  id,
  proveedorId: "pv",
  proveedor: "Textiles Gamarra",
  tipo: "factura",
  serie: "F001",
  numero: id,
  fechaEmision: "2026-09-01",
  condicion: "credito",
  fechaVencimiento: "2026-10-30",
  subtotal: 1000,
  igv: 180,
  total: 1180,
  estado: "vigente",
  motivoAnulacion: null,
  nota: null,
  lineas: 1,
  pagado: 0,
  saldo: 1180,
  estadoPago: "pendiente",
  vencido: false,
  ...extra,
});
const contexto = (extra: Partial<ContextoDecisiones> = {}): ContextoDecisiones => ({ hoy: HOY, ordenes: [], insumos: [], llegadas: [], demanda: new Map(), comprobantes: [], modelos: [], ...extra });

describe("demandaDeInsumos", () => {
  it("rendimiento medido × prendas planeadas, menos lo ya descontado; muestras y órdenes cerradas no cuentan", () => {
    const d = demandaDeInsumos(
      [orden("a", { cantidadPlan: 40 }), orden("b", { cantidadPlan: 20 }), orden("m", { esMuestra: true }), orden("c", { estado: "terminada" })],
      { p1: [rend("lino", 2.5)] },
      { a: { lino: 30 } }
    );
    expect(d.get("lino")!.necesita).toBeCloseTo(100 - 30 + 50, 5);
    expect(d.get("lino")!.ordenes).toEqual(["Blusa a", "Blusa b"]);
  });
  it("una orden que ya descontó todo no aporta; un modelo sin rendimiento medido tampoco", () => {
    expect(demandaDeInsumos([orden("a")], { p1: [rend("lino", 2.5)] }, { a: { lino: 100 } }).size).toBe(0);
    expect(demandaDeInsumos([orden("a")], {}, {}).size).toBe(0);
  });
});

describe("decisionesDeProduccion", () => {
  it("entrega vencida y por vencer: solo hechos, con dónde está la orden", () => {
    const d = decisionesDeProduccion(contexto({ ordenes: [orden("a", { fechaEntrega: "2026-09-18", etapas: { corte: "hecho" } }), orden("b", { fechaEntrega: "2026-09-22" }), orden("c", { fechaEntrega: "2026-10-30" })] }));
    expect(d.map((x) => x.id)).toEqual(["entrega-a", "entrega-b"]);
    expect(d[0].titulo).toContain("hace 3 días");
    expect(d[0].detalle).toContain("en confección");
    expect(d[0].severidad).toBe(3);
    expect(d[1].titulo).toContain("en 1 día");
    expect(d[1].accion.href).toBe("/produccion/ordenes?orden=b");
  });

  it("falta tela pero YA está facturada: dice el comprobante y manda a Recibir; al recibirla la tarjeta desaparece", () => {
    const demanda = new Map([["lino", { insumoId: "lino", necesita: 200, ordenes: ["Blusa a"] }]]);
    const base = { insumos: [insumo("lino", { saldo: 120 })], demanda };
    const con = decisionesDeProduccion(contexto({ ...base, llegadas: [{ insumoId: "lino", documento: "F001-100", proveedor: "Textiles Gamarra", pendiente: 100 }] }));
    expect(con).toHaveLength(1);
    expect(con[0].tipo).toBe("recibir");
    expect(con[0].titulo).toContain("Faltan 80 m de Insumo lino");
    expect(con[0].detalle).toContain("F001-100");
    expect(con[0].accion.href).toBe("/produccion/recibir");
    // Recibida: el saldo sube y la llegada pendiente desaparece → ya no hay tarjeta.
    expect(decisionesDeProduccion(contexto({ insumos: [insumo("lino", { saldo: 220 })], demanda }))).toEqual([]);
  });

  it("falta tela y no alcanza ni con lo facturado: pide registrar el comprobante", () => {
    const d = decisionesDeProduccion(
      contexto({
        insumos: [insumo("lino", { saldo: 50 })],
        demanda: new Map([["lino", { insumoId: "lino", necesita: 200, ordenes: ["Blusa a"] }]]),
        llegadas: [{ insumoId: "lino", documento: "F001-100", proveedor: "X", pendiente: 40 }],
      })
    );
    expect(d[0].tipo).toBe("insumo");
    expect(d[0].titulo).toContain("Faltan 110 m");
    expect(d[0].accion.href).toBe("/produccion/comprobantes");
  });

  it("plata: vencido en severidad 3, por vencer en 2; sin deuda no hay tarjeta", () => {
    const venc = decisionesDeProduccion(contexto({ comprobantes: [comp("1", { vencido: true, fechaVencimiento: "2026-09-10", saldo: 500 })] }));
    expect(venc[0]).toMatchObject({ tipo: "pago", severidad: 3 });
    expect(venc[0].titulo).toContain("S/ 500.00 vencidos");
    const pronto = decisionesDeProduccion(contexto({ comprobantes: [comp("2", { fechaVencimiento: "2026-09-25" })] }));
    expect(pronto[0]).toMatchObject({ severidad: 2 });
    expect(decisionesDeProduccion(contexto({ comprobantes: [comp("3", { estadoPago: "pagada", saldo: 0 })] }))).toEqual([]);
  });

  it("qué producir: un modelo que se agota sin orden abierta sugiere abrir la orden, con el modelo ya elegido", () => {
    const modelos = filasPorModelo(
      [{ varianteId: "v1", productoId: "p1", stockRed: 6, stockTaller: 0, enCamino: 0, ritmoDia: 2, sedesConRitmo: 1, ventasNetas: 60, cobertura: { tipo: "medida", dias: 3 }, banda: "critica" }],
      [{ productoId: "p1", referencia: "Short Kuntur", variantesIds: ["v1"] }],
      {}
    );
    const d = decisionesDeProduccion(contexto({ modelos }));
    expect(d[0]).toMatchObject({ tipo: "producir", severidad: 3 });
    expect(d[0].titulo).toContain("se agota en ~3 días");
    expect(d[0].accion.href).toBe("/produccion/ordenes?nueva=p1");
  });

  it("insumos bajo el mínimo sin pedido: una tarjeta; no repite el que ya tiene tarjeta de falta ni el que ya viene facturado", () => {
    const d = decisionesDeProduccion(
      contexto({
        insumos: [insumo("boton", { nombre: "Botón", unidad: "unidad", tipo: "avio", saldo: 40, minimo: 60, tono: "bajo" }), insumo("cierre", { tono: "bajo", saldo: 5 }), insumo("hilo", { tono: "bajo", saldo: 3 })],
        llegadas: [{ insumoId: "cierre", documento: "F1", proveedor: "X", pendiente: 50 }],
        demanda: new Map([["hilo", { insumoId: "hilo", necesita: 100, ordenes: ["a"] }]]),
      })
    );
    expect(d.find((x) => x.tipo === "minimo")!.titulo).toContain("Botón está bajo el mínimo");
    expect(d.find((x) => x.tipo === "minimo")!.titulo).not.toContain("Insumo cierre");
    expect(d.find((x) => x.tipo === "minimo")!.titulo).not.toContain("Insumo hilo");
  });

  it("ordena por severidad y corta en 7 tarjetas", () => {
    const ordenes = Array.from({ length: 9 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
    const d = decisionesDeProduccion(contexto({ ordenes, comprobantes: [comp("1", { fechaVencimiento: "2026-09-25" })] }));
    expect(d).toHaveLength(7);
    expect(d.every((x, i) => i === 0 || d[i - 1].severidad >= x.severidad)).toBe(true);
  });
  it("todo en orden: sin tarjetas", () => {
    expect(decisionesDeProduccion(contexto())).toEqual([]);
  });
});

describe("filasPorModelo", () => {
  const dem = (id: string, extra: Partial<DemandaVariante>): DemandaVariante => ({ varianteId: id, productoId: "p", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 1, sedesConRitmo: 1, ventasNetas: 30, cobertura: { tipo: "agotado", dias: 0 }, banda: "agotado", ...extra });
  const modelos = [
    { productoId: "a", referencia: "A", variantesIds: ["a1", "a2"] },
    { productoId: "b", referencia: "B", variantesIds: ["b1"] },
    { productoId: "c", referencia: "C", variantesIds: ["c1"] },
    { productoId: "d", referencia: "D", variantesIds: ["d1"] },
    { productoId: "e", referencia: "E", variantesIds: ["e1"] },
  ];
  const demanda = [
    dem("a1", { stockRed: 5, ritmoDia: 1 }), // 5 d entre los dos
    dem("a2", { stockRed: 5, ritmoDia: 1 }),
    dem("b1", { stockRed: 20, ritmoDia: 1 }), // 20 d → vigilar
    dem("c1", { stockRed: 45, ritmoDia: 1 }), // alcanza
    dem("d1", { stockRed: 200, ritmoDia: 1 }), // sobrestock
    // e sin datos → sin ritmo
  ];
  it("clasifica con los umbrales de Inventario (7, 30 y 60 días) y ordena por urgencia", () => {
    const f = filasPorModelo(demanda, modelos, {});
    expect(f.map((x) => [x.referencia, x.estado])).toEqual([["A", "producir_ya"], ["B", "vigilar"], ["C", "alcanza"], ["D", "sobrestock"], ["E", "sin_ritmo"]]);
    expect(f[0].diasRed).toBe(5);
  });
  it("con una orden abierta el modelo urgente pasa a «ya hay orden»", () => {
    const f = filasPorModelo(demanda, modelos, { a1: 30 });
    expect(f[0]).toMatchObject({ referencia: "A", estado: "en_produccion", enProduccion: 30 });
  });
  it("sin stock y con ritmo, hay que producir ya", () => {
    expect(filasPorModelo([dem("a1", { stockRed: 0 })], [modelos[0]], {})[0].estado).toBe("producir_ya");
  });
});

describe("cifrasResumen", () => {
  it("valor en proceso, por pagar, vencido y entregas en riesgo (hechos)", () => {
    const c = cifrasResumen({
      hoy: HOY,
      ordenes: [
        { ...orden("a", { fechaEntrega: "2026-09-18" }), costoTela: 800, costoAvios: 100 },
        { ...orden("b", { fechaEntrega: "2026-09-22" }), costoTela: 200, costoAvios: 50 },
        { ...orden("m", { esMuestra: true }), costoTela: 999, costoAvios: 999 },
        { ...orden("c", { estado: "terminada" }), costoTela: 999, costoAvios: 999 },
      ],
      insumos: [insumo("x", { tono: "bajo" }), insumo("y")],
      capitalInsumos: 3000,
      comprobantes: [comp("1", { vencido: true, fechaVencimiento: "2026-09-10", saldo: 500 }), comp("2")],
    });
    expect(c).toMatchObject({ capitalInsumos: 3000, insumosBajoMinimo: 1, valorEnProceso: 1150, ordenesEnProceso: 3, porPagar: 1680, vencido: 500, entregasEnRiesgo: 2 });
  });
});

describe("filasDeTela", () => {
  it("sin demanda, alcanza, alcanza si llega o falta; solo telas", () => {
    const demanda = new Map([["a", { insumoId: "a", necesita: 100, ordenes: [] }], ["b", { insumoId: "b", necesita: 100, ordenes: [] }], ["c", { insumoId: "c", necesita: 100, ordenes: [] }]]);
    const f = filasDeTela(
      [insumo("a", { saldo: 150 }), insumo("b", { saldo: 60 }), insumo("c", { saldo: 20 }), insumo("d"), insumo("boton", { tipo: "avio" })],
      demanda,
      [{ insumoId: "b", documento: "F1", proveedor: "X", pendiente: 50 }, { insumoId: "c", documento: "F2", proveedor: "X", pendiente: 30 }]
    );
    expect(f.map((x) => [x.insumoId, x.estado, x.faltan])).toEqual([["a", "alcanza", 0], ["b", "alcanza_si_llega", 0], ["c", "falta", 50], ["d", "sin_demanda", 0]]);
  });
});
