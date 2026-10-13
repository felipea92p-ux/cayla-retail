import { describe, expect, it } from "vitest";
import type { ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import type { DemandaVariante, Rendimiento } from "./produccion-decision-reglas";
import {
  cifrasResumen,
  decisionesDeProduccion,
  demandaDeInsumos,
  filasDeTela,
  filasPorModelo,
  baseDelRitmo,
  resumenDeDecisiones,
  textoDiasDeStock,
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
      [{ varianteId: "v1", productoId: "p1", stockRed: 6, stockTaller: 0, enCamino: 0, ritmoDia: 2, sedesConRitmo: 1, ventasNetas: 60, ventasBase: 60, cobertura: { tipo: "medida", dias: 3 }, banda: "critica" }],
      [{ productoId: "p1", referencia: "Short Kuntur", variantesIds: ["v1"] }],
      {}
    );
    const d = decisionesDeProduccion(contexto({ modelos }));
    expect(d[0]).toMatchObject({ tipo: "producir", severidad: 3 });
    expect(d[0].titulo).toContain("se agota en ~3 días");
    expect(d[0].accion.href).toBe("/produccion/ordenes?nueva=p1");
  });

  describe("el título de «producir» dice la verdad sobre el stock (/pantalla produccion, tarea #2)", () => {
    const tarjeta = (stockRed: number, ritmoDia: number, extra: Partial<DemandaVariante> = {}) =>
      decisionesDeProduccion(
        contexto({
          modelos: filasPorModelo(
            [{ varianteId: "v1", productoId: "p1", stockRed, stockTaller: 0, enCamino: 0, ritmoDia, sedesConRitmo: 1, ventasNetas: 30, ventasBase: 30, cobertura: { tipo: "medida", dias: 1 }, banda: "critica", ...extra }],
            [{ productoId: "p1", referencia: "Blusa Encaje", variantesIds: ["v1"] }],
            {}
          ),
        })
      )[0];

    it("con 0 en tiendas dice «ya se agotó», no «se agota en ~1 día» (que contradecía su propio detalle «quedan 0»)", () => {
      const d = tarjeta(0, 0.73);
      expect(d.titulo).toBe("«Blusa Encaje» ya se agotó en las tiendas y no hay orden abierta");
      expect(d.titulo).not.toContain("se agota en");
      expect(d.detalle).toContain("quedan 0 en tiendas");
    });
    it("con 3 en tiendas y 3 por día quedan ~1 día, en singular", () => {
      expect(tarjeta(3, 3).titulo).toBe("«Blusa Encaje» se agota en ~1 día y no hay orden abierta");
    });
    it("con 7 en tiendas y 1 por día quedan ~7 días (el límite de «Producir ya»); con 8 ya no hay tarjeta", () => {
      expect(tarjeta(7, 1).titulo).toBe("«Blusa Encaje» se agota en ~7 días y no hay orden abierta");
      expect(tarjeta(8, 1)).toBeUndefined();
    });
    it("con menos de medio día de stock (1 en tiendas, 3 por día) sigue siendo «~1 día»: queda algo", () => {
      expect(tarjeta(1, 3).titulo).toBe("«Blusa Encaje» se agota en ~1 día y no hay orden abierta");
    });
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

  describe("el tope no corta en silencio (/pantalla produccion, tarea #3)", () => {
    it("ordena por severidad, y ninguna clase pasa de 3 tarjetas: con 9 entregas vencidas se ven 3 y el pago por vencer también", () => {
      const ordenes = Array.from({ length: 9 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      const r = resumenDeDecisiones(contexto({ ordenes, comprobantes: [comp("1", { fechaVencimiento: "2026-09-25" })] }));
      expect(r.decisiones.map((x) => x.tipo)).toEqual(["entrega", "entrega", "entrega", "pago"]);
      expect(r.decisiones.every((x, i) => i === 0 || r.decisiones[i - 1].severidad >= x.severidad)).toBe(true);
    });
    it("lo que no cupo se cuenta por clase, con su destino, y el total dice cuántos asuntos hay en realidad", () => {
      const ordenes = Array.from({ length: 9 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      const r = resumenDeDecisiones(contexto({ ordenes, comprobantes: [comp("1", { fechaVencimiento: "2026-09-25" })] }));
      expect(r.ocultas).toEqual([{ tipo: "entrega", cantidad: 6, texto: "entregas", href: "/produccion/ordenes" }]);
      expect(r.total).toBe(10);
      expect(r.decisiones.length + r.ocultas.reduce((n, o) => n + o.cantidad, 0)).toBe(r.total);
    });
    it("una sola que no cupo se dice en singular", () => {
      const ordenes = Array.from({ length: 4 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      expect(resumenDeDecisiones(contexto({ ordenes })).ocultas).toEqual([{ tipo: "entrega", cantidad: 1, texto: "entrega", href: "/produccion/ordenes" }]);
    });
    it("el tope total de 7 también avisa: lo que queda fuera sale en «ocultas», no desaparece", () => {
      const insumos = [insumo("i1", { saldo: 10 }), insumo("i2", { saldo: 10 }), insumo("i3", { saldo: 10 }), insumo("bajo", { nombre: "Botón", tono: "bajo", saldo: 5 })];
      const demanda = new Map(["i1", "i2", "i3"].map((id) => [id, { insumoId: id, necesita: 100, ordenes: ["a"] }]));
      const ordenes = Array.from({ length: 3 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      const r = resumenDeDecisiones(contexto({ ordenes, insumos, demanda, comprobantes: [comp("1", { vencido: true, fechaVencimiento: "2026-09-10", saldo: 500 })] }));
      expect(r.decisiones).toHaveLength(7);
      expect(r.ocultas).toEqual([{ tipo: "minimo", cantidad: 1, texto: "insumo bajo el mínimo", href: "/produccion/insumos" }]);
      expect(r.total).toBe(8);
    });
    it("sin nada que no quepa no hay «ocultas»", () => {
      expect(resumenDeDecisiones(contexto({ ordenes: [orden("a", { fechaEntrega: "2026-09-10" })] })).ocultas).toEqual([]);
    });
    it("`decisionesDeProduccion` es lo que se dibuja, igual que `resumenDeDecisiones(...).decisiones`", () => {
      const c = contexto({ ordenes: Array.from({ length: 5 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" })) });
      expect(decisionesDeProduccion(c)).toEqual(resumenDeDecisiones(c).decisiones);
    });
  });

  describe("muchos modelos por producir se juntan en UNA tarjeta (/pantalla produccion, tarea #3)", () => {
    const agotado = (i: number, ritmoDia = 1) => ({ d: { varianteId: `v${i}`, productoId: `p${i}`, stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia, sedesConRitmo: 1, ventasNetas: 30, ventasBase: 30, cobertura: { tipo: "medida" as const, dias: 0 }, banda: "critica" as const }, m: { productoId: `p${i}`, referencia: `Modelo ${i}`, variantesIds: [`v${i}`] } });
    const conAgotados = (n: number) => {
      const xs = Array.from({ length: n }, (_, i) => agotado(i, 1 + i)); // el 0 se vende menos; el último, más
      return filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), {});
    };

    it("hasta 3 modelos: una tarjeta cada uno, con su «Abrir orden sugerida»", () => {
      const d = decisionesDeProduccion(contexto({ modelos: conAgotados(3) }));
      expect(d).toHaveLength(3);
      expect(d.every((x) => x.accion.texto === "Abrir orden sugerida")).toBe(true);
    });
    it("con 4 o más: UNA tarjeta que dice cuántos son, nombra a los 3 más urgentes (los que más se venden) y manda a la tabla", () => {
      const d = decisionesDeProduccion(contexto({ modelos: conAgotados(9) }));
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ id: "producir-grupo", tipo: "producir", severidad: 3, titulo: "9 modelos por producir y ninguno tiene orden abierta" });
      expect(d[0].detalle).toBe("Los más urgentes (ventas de los últimos 30 días): «Modelo 8» (ya se agotó, 63 por semana, 30 ventas), «Modelo 7» (ya se agotó, 56 por semana, 30 ventas), «Modelo 6» (ya se agotó, 49 por semana, 30 ventas); y 6 más.");
      expect(d[0].accion).toEqual({ texto: "Ver los 9 modelos", href: "#produce" });
    });
    it("9 modelos por producir y un pago por vencer en 5 días: el pago SÍ aparece, y no queda nada oculto", () => {
      const r = resumenDeDecisiones(contexto({ modelos: conAgotados(9), comprobantes: [comp("1", { fechaVencimiento: "2026-09-26" })] }));
      expect(r.decisiones.map((x) => x.tipo)).toEqual(["producir", "pago"]);
      expect(r.ocultas).toEqual([]);
      expect(r.total).toBe(2);
    });
    it("los modelos con algo de stock se nombran con lo que queda", () => {
      const xs = [agotado(0, 3), agotado(1, 2), agotado(2, 2), agotado(3, 1)];
      xs.forEach((x) => (x.d.stockRed = 1)); // 1 en tiendas cada uno: se agota antes el que más vende (1/3 de día)
      const d = decisionesDeProduccion(contexto({ modelos: filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), {}) }));
      expect(d[0].detalle).toContain("«Modelo 0» (quedan 1, 21 por semana,");
      expect(d[0].detalle).not.toContain("ya se agotó");
    });
  });
  it("todo en orden: sin tarjetas", () => {
    expect(decisionesDeProduccion(contexto())).toEqual([]);
  });
});

describe("filasPorModelo", () => {
  const dem = (id: string, extra: Partial<DemandaVariante>): DemandaVariante => ({ varianteId: id, productoId: "p", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 1, sedesConRitmo: 1, ventasNetas: 30, ventasBase: 30, cobertura: { tipo: "agotado", dias: 0 }, banda: "agotado", ...extra });
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
  it("entre varios agotados va primero el que más se vende, no el de nombre más temprano; si también empatan, el nombre", () => {
    const agotados = [
      { productoId: "z", referencia: "Zeta", variantesIds: ["z1"] },
      { productoId: "a", referencia: "Alfa", variantesIds: ["a1"] },
      { productoId: "m", referencia: "Mica", variantesIds: ["m1"] },
      { productoId: "b", referencia: "Beta", variantesIds: ["b1"] },
    ];
    const demandaAgotada = [
      dem("z1", { stockRed: 0, ritmoDia: 2 }), // 14 por semana: lo que más se pierde
      dem("a1", { stockRed: 0, ritmoDia: 0.5 }),
      dem("m1", { stockRed: 0, ritmoDia: 0.5 }), // empata con Alfa: manda el nombre
      dem("b1", { stockRed: 0, ritmoDia: 1 }),
    ];
    expect(filasPorModelo(demandaAgotada, agotados, {}).map((x) => x.referencia)).toEqual(["Zeta", "Beta", "Alfa", "Mica"]);
  });
  it("lo que se agota antes sigue yendo antes aunque venda menos: el ritmo solo desempata", () => {
    const f = filasPorModelo(
      [dem("a1", { stockRed: 1, ritmoDia: 1 }), dem("b1", { stockRed: 0, ritmoDia: 0.2 })],
      [modelos[0], modelos[1]].map((m, i) => ({ ...m, variantesIds: [i === 0 ? "a1" : "b1"] })),
      {}
    );
    expect(f.map((x) => x.referencia)).toEqual(["B", "A"]);
  });
});

describe("cada tarjeta dice de qué modelos habla, para dibujar su foto (/pantalla produccion, tarea #5)", () => {
  const ag = (i: number, ritmoDia: number) => ({
    d: { varianteId: `v${i}`, productoId: `p${i}`, stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia, sedesConRitmo: 1, ventasNetas: 30, ventasBase: 30, cobertura: { tipo: "medida" as const, dias: 0 }, banda: "critica" as const },
    m: { productoId: `p${i}`, referencia: `Modelo ${i}`, variantesIds: [`v${i}`] },
  });
  const modelosDe = (n: number) => {
    const xs = Array.from({ length: n }, (_, i) => ag(i, 1 + i));
    return filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), {});
  };

  it("la tarjeta de un modelo por producir trae su productoId", () => {
    expect(decisionesDeProduccion(contexto({ modelos: modelosDe(2) })).map((d) => d.productoIds)).toEqual([["p1"], ["p0"]]);
  });
  it("la tarjeta que junta varios trae los 3 que nombra, en el mismo orden", () => {
    const d = decisionesDeProduccion(contexto({ modelos: modelosDe(9) }));
    expect(d[0].productoIds).toEqual(["p8", "p7", "p6"]);
  });
  it("las tarjetas que no son de un modelo (una entrega, un pago) no traen ninguno", () => {
    const d = decisionesDeProduccion(contexto({ ordenes: [orden("a", { fechaEntrega: "2026-09-10" })], comprobantes: [comp("1", { fechaVencimiento: "2026-09-25" })] }));
    expect(d.map((x) => x.productoIds)).toEqual([undefined, undefined]);
  });
});

describe("cada cifra dice su base (/pantalla produccion, tarea #4)", () => {
  const fila1 = (ventasBase: number, stockRed = 0, extra: Partial<DemandaVariante> = {}) =>
    filasPorModelo(
      [{ varianteId: "v1", productoId: "p1", stockRed, stockTaller: 0, enCamino: 0, ritmoDia: ventasBase / 30, sedesConRitmo: 1, ventasNetas: ventasBase, ventasBase, cobertura: { tipo: "medida", dias: 0 }, banda: "critica", ...extra }],
      [{ productoId: "p1", referencia: "Blusa Encaje", variantesIds: ["v1"] }],
      {}
    );

  it("baseDelRitmo: con 2 ventas o menos dice «poca base»; con 3 o más, solo cuántas", () => {
    expect(baseDelRitmo(1)).toEqual({ pocaBase: true, largo: "solo 1 venta en 30 días: poca base", corto: "solo 1 venta: poca base" });
    expect(baseDelRitmo(2)).toEqual({ pocaBase: true, largo: "solo 2 ventas en 30 días: poca base", corto: "solo 2 ventas: poca base" });
    expect(baseDelRitmo(3)).toEqual({ pocaBase: false, largo: "3 ventas en 30 días", corto: "3 ventas" });
    expect(baseDelRitmo(36)).toEqual({ pocaBase: false, largo: "36 ventas en 30 días", corto: "36 ventas" });
  });
  it("el modelo suma la base de sus variantes", () => {
    const f = filasPorModelo(
      [
        { varianteId: "a", productoId: "p", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 0.1, sedesConRitmo: 1, ventasNetas: 9, ventasBase: 3, cobertura: { tipo: "agotado", dias: 0 }, banda: "agotado" },
        { varianteId: "b", productoId: "p", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 0.2, sedesConRitmo: 1, ventasNetas: 6, ventasBase: 6, cobertura: { tipo: "agotado", dias: 0 }, banda: "agotado" },
      ],
      [{ productoId: "p", referencia: "M", variantesIds: ["a", "b"] }],
      {}
    );
    expect(f[0].ventasBase).toBe(9);
  });
  it("la tarjeta de «producir» dice en cuántas ventas se apoya: «36 ventas en 30 días»", () => {
    const d = decisionesDeProduccion(contexto({ modelos: fila1(36) }));
    expect(d[0].detalle).toBe("Se vende 8,4 por semana (36 ventas en 30 días) y quedan 0 en tiendas.".replace("8,4", (Math.round((36 / 30) * 7 * 10) / 10).toLocaleString("es-PE")));
  });
  it("con poca base la tarjeta lo dice con todas las letras, y sigue apareciendo (solo avisa, no esconde)", () => {
    const d = decisionesDeProduccion(contexto({ modelos: fila1(2) }));
    expect(d).toHaveLength(1);
    expect(d[0].detalle).toContain("(solo 2 ventas en 30 días: poca base)");
  });
  it("la tarjeta de «sobrestock» también dice su base: un «no produzcas más» con 1 venta es casi ruido", () => {
    const d = decisionesDeProduccion(contexto({ modelos: fila1(1, 100, { ritmoDia: 1 / 30 }) }));
    expect(d[0].tipo).toBe("sobrestock");
    expect(d[0].detalle).toContain("(solo 1 venta en 30 días: poca base)");
  });
});

describe("textoDiasDeStock", () => {
  it("«agotado» con 0 en tiendas, nunca «0 días»", () => {
    expect(textoDiasDeStock(0, 0)).toBe("agotado");
  });
  it("«1 día» en singular; con algo de stock nunca baja de 1", () => {
    expect(textoDiasDeStock(3, 1)).toBe("1 día");
    expect(textoDiasDeStock(1, 0.3)).toBe("1 día");
    expect(textoDiasDeStock(5, 1.4)).toBe("1 día");
  });
  it("«N días» redondeado a lo cercano", () => {
    expect(textoDiasDeStock(7, 1.6)).toBe("2 días");
    expect(textoDiasDeStock(40, 40)).toBe("40 días");
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
