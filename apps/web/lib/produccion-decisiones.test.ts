import { describe, expect, it } from "vitest";
import { GUIA_PROD_RESUMEN } from "./guias/pantallas/produccion";
import { UMBRAL_POCA_BASE_VENTAS } from "./inventario-reglas";
import type { ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import { cantidadesInicialesDeNuevaOrden, sugerirVariante, type DemandaVariante, type Rendimiento } from "./produccion-decision-reglas";
import { fraseDeLaFalta, hojaDelModelo } from "./produccion-hoja-modelo";
import {
  agotadasQueSeVendian,
  cifrasResumen,
  decisionesDeProduccion,
  demandaDeInsumos,
  filasDeTela,
  filasPorModelo,
  baseDelRitmo,
  estadoPideFabricar,
  hrefNuevaOrden,
  nombreDeVariante,
  sugerenciaDeOrden,
  textoAgotadas,
  textoSugerencia,
  resumenDeDecisiones,
  textoDiasDeStock,
  urlTrasladarModelo,
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
    expect(venc[0].titulo).toContain("S/\u00a0500.00 vencidos");
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
    expect(d[0].accion).toEqual({ texto: "Abrir orden sugerida", href: "/produccion/ordenes?nueva=p1&sugerida=1" });
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
    it("si la tarjeta que junta los modelos NO cabe en el tope, «y N más» cuenta MODELOS (9), no «1 aviso»", () => {
      const insumos = [insumo("i1", { saldo: 10 }), insumo("i2", { saldo: 10 }), insumo("i3", { saldo: 10 })];
      const demanda = new Map(["i1", "i2", "i3"].map((id) => [id, { insumoId: id, necesita: 100, ordenes: ["a"] }]));
      const ordenes = Array.from({ length: 3 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      const r = resumenDeDecisiones(contexto({ ordenes, insumos, demanda, comprobantes: [comp("1", { vencido: true, fechaVencimiento: "2026-09-10", saldo: 500 })], modelos: conAgotados(9) }));
      expect(r.decisiones).toHaveLength(7); // 3 entregas + 3 insumos + 1 pago llenan el tope
      expect(r.decisiones.some((d) => d.id === "producir-grupo")).toBe(false);
      expect(r.ocultas).toEqual([{ tipo: "producir", cantidad: 9, texto: "modelos por producir", href: "#produce" }]);
    });
    it("un solo modelo por producir que no cupo se dice en singular", () => {
      const insumos = [insumo("i1", { saldo: 10 }), insumo("i2", { saldo: 10 }), insumo("i3", { saldo: 10 })];
      const demanda = new Map(["i1", "i2", "i3"].map((id) => [id, { insumoId: id, necesita: 100, ordenes: ["a"] }]));
      const ordenes = Array.from({ length: 3 }, (_, i) => orden(`o${i}`, { fechaEntrega: "2026-09-10" }));
      const r = resumenDeDecisiones(contexto({ ordenes, insumos, demanda, comprobantes: [comp("1", { vencido: true, fechaVencimiento: "2026-09-10", saldo: 500 })], modelos: conAgotados(1) }));
      expect(r.ocultas).toEqual([{ tipo: "producir", cantidad: 1, texto: "modelo por producir", href: "#produce" }]);
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
  it("con una orden abierta que cubre lo que falta de cada talla, el modelo urgente pasa a «ya hay orden»", () => {
    const f = filasPorModelo(demanda, modelos, { a1: 30, a2: 30 });
    expect(f[0]).toMatchObject({ referencia: "A", estado: "en_produccion", enProduccion: 60, producir: 0 });
  });
  it("una orden que solo cubre una de las dos tallas NO apaga la falta de la otra: lo que sobra de una no cubre a la otra", () => {
    const f = filasPorModelo(demanda, modelos, { a1: 30 });
    expect(f[0]).toMatchObject({ referencia: "A", estado: "producir_ya", enProduccion: 30, producir: 25 });
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

describe("«Producir ya» compara lo que falta contra lo que hay y lo que ya se fabrica (/pantalla produccion, tarea #6)", () => {
  const dem = (id: string, extra: Partial<DemandaVariante> = {}): DemandaVariante => ({ varianteId: id, productoId: "p1", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 1, sedesConRitmo: 1, ventasNetas: 30, ventasBase: 30, cobertura: { tipo: "agotado", dias: 0 }, banda: "agotado", ...extra });
  const modelo = (ids: string[] = ["v1"], extra: Partial<{ referencia: string; productoId: string }> = {}) => ({ productoId: "p1", referencia: "Blusa Encaje", variantesIds: ids, ...extra });
  const fila = (d: DemandaVariante[], enProd: Record<string, number> = {}, ids?: string[]) => filasPorModelo(d, [modelo(ids ?? d.map((x) => x.varianteId))], enProd)[0];
  const tarjetas = (f: ReturnType<typeof filasPorModelo>, tallerId: string | null = "T1") => decisionesDeProduccion(contexto({ modelos: f, tallerId }));

  describe("una orden abierta ya no apaga la falta solo por existir", () => {
    it("una orden de 1 prenda contra una falta de 30: sigue en «Producir ya», faltan 29, y la tarjeta lo dice sin afirmar que no hay orden", () => {
      const f = fila([dem("v1")], { v1: 1 });
      expect(f).toMatchObject({ estado: "producir_ya", enProduccion: 1, producir: 29, trasladar: 0 });
      const t = tarjetas([f]);
      expect(t).toHaveLength(1);
      expect(t[0].titulo).toBe("«Blusa Encaje» ya se agotó en las tiendas y lo que ya se fabrica no alcanza (faltan 29)");
      expect(t[0].titulo).not.toContain("no hay orden abierta");
    });
    it("con stock todavía en tiendas dice «se agota en ~N días» y también cuánto falta", () => {
      const f = fila([dem("v1", { stockRed: 3 })], { v1: 10 });
      expect(f.estado).toBe("producir_ya");
      expect(tarjetas([f])[0].titulo).toBe("«Blusa Encaje» se agota en ~3 días y lo que ya se fabrica no alcanza (faltan 17)");
    });
    it("una orden que cubre lo que falta lo deja en «Ya hay orden abierta» y sin tarjeta de producir", () => {
      const f = fila([dem("v1")], { v1: 30 });
      expect(f).toMatchObject({ estado: "en_produccion", producir: 0 });
      expect(tarjetas([f])).toEqual([]);
    });
    it("sin ninguna orden la tarjeta sigue diciendo «no hay orden abierta»", () => {
      expect(tarjetas([fila([dem("v1")])])[0].titulo).toBe("«Blusa Encaje» ya se agotó en las tiendas y no hay orden abierta");
    });
    it("la tarjeta que junta varios modelos dice si alguna orden no alcanza, en vez de «ninguno tiene orden abierta»", () => {
      const xs = Array.from({ length: 4 }, (_, i) => ({ d: dem(`v${i}`, { productoId: `p${i}`, ritmoDia: 1 + i }), m: { productoId: `p${i}`, referencia: `M${i}`, variantesIds: [`v${i}`] } }));
      const f = filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), { v0: 1, v2: 2 });
      expect(f.every((x) => x.estado === "producir_ya")).toBe(true);
      expect(tarjetas(f)[0].titulo).toBe("4 modelos por producir y en 2 lo que ya se fabrica no alcanza");
      expect(tarjetas(filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), {}))[0].titulo).toBe("4 modelos por producir y ninguno tiene orden abierta");
    });
  });

  describe("lo que se dice de la orden: ni más ni menos de lo que se descontó (revisión independiente, 2026-10-13)", () => {
    it("la orden no se cita por su cantidad: una orden de 200 en OTRA talla no hace creer que 200 «no alcanzan» para una falta de 30", () => {
      const f = fila([dem("a"), dem("b", { ritmoDia: 0.1 })], { b: 200 });
      expect(f.variantes.find((v) => v.varianteId === "a")?.producir).toBe(30);
      const titulo = tarjetas([f])[0].titulo;
      expect(titulo).toContain("lo que ya se fabrica no alcanza (faltan 30)");
      expect(titulo).not.toContain("200");
    });
    it("una orden en una variante que no se vende no se cuenta: `enProduccionContada` queda en 0 y la hoja no dice que ya la contó", () => {
      const f = fila([dem("a", { ritmoDia: null, ventasNetas: 0, ventasBase: 0 }), dem("b")], { a: 50 });
      expect(f).toMatchObject({ enProduccion: 50, enProduccionContada: 0 });
      expect(fraseDeLaFalta(hojaDelModelo(f))).not.toContain("órdenes abiertas");
    });
    it("con poca base («2 ventas o menos») no se dice cuánto falta: ni «faltan N» en el título ni «hay que fabricarlas» en la hoja", () => {
      const f = fila([dem("v1", { ventasBase: 2, ventasNetas: 2 })], { v1: 1 });
      expect(f.estado).toBe("producir_ya");
      expect(tarjetas([f])[0].titulo).toBe("«Blusa Encaje» ya se agotó en las tiendas y lo que ya se fabrica no alcanza");
      expect(fraseDeLaFalta(hojaDelModelo(f))).toBeNull();
    });
    it("con poca base lo que está en el Taller SÍ se dice: es stock que ya existe, no una cantidad a fabricar", () => {
      const f = fila([dem("v1", { ventasBase: 2, ventasNetas: 2, stockTaller: 10 })]);
      expect(fraseDeLaFalta(hojaDelModelo(f))).toBe("Para cubrir 30 días de venta faltan 10: 10 ya están en el Taller y se trasladan.");
    });
    it("la tarjeta de trasladar cuenta lo que ya viene: «cubre 30 días» no es cierto con solo lo que se lleva", () => {
      const solo = tarjetas([fila([dem("v1", { stockTaller: 40 })])])[0];
      expect(solo.detalle).toContain("Llevar 30 al piso cubre 30 días de venta");
      const conOrden = tarjetas([fila([dem("v1", { stockTaller: 10 })], { v1: 20 })])[0];
      expect(conOrden.detalle).toContain("Llevar 10 al piso, junto con lo que ya viene, cubre 30 días de venta");
    });
  });

  describe("entre 8 y 30 días de stock una orden que no alcanza tampoco se anuncia como si resolviera", () => {
    it("falta algo y hay una orden de 1: «Vigilar» (no «Ya hay orden abierta»), y lo que falta sigue a la vista", () => {
      const f = fila([dem("v1", { stockRed: 10 })], { v1: 1 });
      expect(f).toMatchObject({ estado: "vigilar", producir: 19, enProduccion: 1 });
    });
    it("la misma orden, si CUBRE lo que falta, sí es «Ya hay orden abierta»", () => {
      expect(fila([dem("v1", { stockRed: 10 })], { v1: 20 })).toMatchObject({ estado: "en_produccion", producir: 0 });
    });
    it("el Taller cubre solo una parte: «Vigilar» con las dos cifras (la fila muestra el +5 del Taller y la hoja, el reparto)", () => {
      expect(fila([dem("v1", { stockRed: 20, stockTaller: 5 })])).toMatchObject({ estado: "vigilar", trasladar: 5, producir: 5 });
    });
    it("el Taller cubre todo lo que falta, con o sin una orden que ya cubre su parte: «Trasladar al piso»", () => {
      expect(fila([dem("v1", { stockRed: 20, stockTaller: 40 })]).estado).toBe("trasladar");
    });
  });

  describe("un modelo que el Resumen aconseja no producir no ofrece fabricar (solo avisa la talla agotada)", () => {
    // `a` con stock de sobra y `b` agotada con ventas: el modelo tiene ~100 días de stock («Sobrestock») pero a `b` le faltan 15.
    const sobrestock = () => fila([dem("a", { stockRed: 100, ritmoDia: 0.5 }), dem("b", { ritmoDia: 0.5, ventasNetas: 15, ventasBase: 15 })]);
    it("el estado sigue siendo «Sobrestock» y la cuenta de lo que falta existe", () => {
      expect(sobrestock()).toMatchObject({ estado: "sobrestock", producir: 15 });
    });
    it("pero no hay cantidad sugerida, ni frase de «hay que fabricar», ni «Abrir orden sugerida» en la hoja", () => {
      const f = sobrestock();
      expect(sugerenciaDeOrden(f)).toBeNull();
      expect(fraseDeLaFalta(hojaDelModelo(f))).toBeNull();
      expect(hojaDelModelo(f).sugerida).toBe(false);
    });
    it("la talla agotada que se vendía sí se avisa en la fila", () => {
      expect(textoAgotadas(agotadasQueSeVendian(sobrestock()))).toContain("Se vendían y ya no hay en tiendas");
    });
    it("`estadoPideFabricar`: solo los consejos que hablan de fabricar o de llevar del Taller", () => {
      expect((["producir_ya", "trasladar", "en_produccion", "vigilar"] as const).every(estadoPideFabricar)).toBe(true);
      expect((["alcanza", "sobrestock", "sin_ritmo"] as const).some(estadoPideFabricar)).toBe(false);
    });
  });

  describe("«Trasladar al piso»: lo que falta ya está hecho y guardado en el Taller", () => {
    it("agotado en tiendas y con el Taller cubriendo lo que falta: no hay que fabricar, hay que trasladar", () => {
      const f = fila([dem("v1", { stockTaller: 40 })]);
      expect(f).toMatchObject({ estado: "trasladar", trasladar: 30, producir: 0 });
    });
    it("su tarjeta lleva a Mover mercadería con el Taller de origen y la cantidad ya puestos", () => {
      const t = tarjetas([fila([dem("v1", { stockTaller: 40 })])]);
      expect(t).toHaveLength(1);
      expect(t[0]).toMatchObject({ tipo: "trasladar", severidad: 3, productoIds: ["p1"], accion: { texto: "Trasladar al piso", href: "/inventario/mover?origen=T1&lineas=v1:30" } });
      expect(t[0].titulo).toBe("«Blusa Encaje» ya se agotó en las tiendas, pero hay 40 en el Taller");
      expect(t[0].detalle).toContain("Llevar 30 al piso cubre 30 días de venta: no hace falta fabricar.");
    });
    it("el Taller cubre solo una parte: sigue siendo «Producir ya», con la parte que se traslada y la que se fabrica", () => {
      const f = fila([dem("v1", { stockTaller: 10 })]);
      expect(f).toMatchObject({ estado: "producir_ya", trasladar: 10, producir: 20 });
      const t = tarjetas([f]);
      expect(t.map((x) => x.tipo)).toEqual(["producir"]);
      expect(t[0].detalle).toContain("más 10 en el Taller por trasladar");
    });
    it("lo que hay de una talla en el Taller no cubre a otra: la que no tiene en el Taller se produce", () => {
      const f = fila([dem("a", { ritmoDia: 1 }), dem("b", { ritmoDia: null, stockTaller: 50 })]);
      expect(f).toMatchObject({ estado: "producir_ya", trasladar: 0, producir: 30 });
    });
    it("traslada cada talla lo suyo: la URL lleva solo las variantes con algo que trasladar", () => {
      const f = fila([dem("a", { stockTaller: 40 }), dem("b", { stockTaller: 5, ritmoDia: 0.5 }), dem("c", { ritmoDia: null, stockTaller: 9 })]);
      expect(f.variantes.map((v) => [v.varianteId, v.trasladar])).toEqual([["a", 30], ["b", 5], ["c", 0]]);
      expect(urlTrasladarModelo(f, "T1")).toBe("/inventario/mover?origen=T1&lineas=a:30,b:5");
    });
    it("sin Taller conocido o sin nada que llevar no hay URL; la fila igual dice su estado, solo falta la tarjeta", () => {
      const f = fila([dem("v1", { stockTaller: 40 })]);
      expect(urlTrasladarModelo(f, null)).toBeNull();
      expect(urlTrasladarModelo(fila([dem("v1")]), "T1")).toBeNull();
      expect(f.estado).toBe("trasladar");
      expect(tarjetas([f], null)).toEqual([]);
    });
    it("entre 8 y 30 días de stock también es «Trasladar al piso», pero sin tarjeta: solo lo urgente (hasta 7 días) la tiene", () => {
      const f = fila([dem("v1", { stockRed: 20, stockTaller: 40 })]);
      expect(f).toMatchObject({ estado: "trasladar", trasladar: 10, producir: 0 });
      expect(tarjetas([f])).toEqual([]);
    });
    it("va después de «Producir ya» y antes de «Ya hay orden abierta» en la tabla", () => {
      const xs = [
        { d: dem("o1", { productoId: "o", stockRed: 4 }), m: { productoId: "o", referencia: "Con orden", variantesIds: ["o1"] } },
        { d: dem("t1", { productoId: "t", stockRed: 4, stockTaller: 99 }), m: { productoId: "t", referencia: "Con Taller", variantesIds: ["t1"] } },
        { d: dem("p1", { productoId: "pp", stockRed: 4 }), m: { productoId: "pp", referencia: "Por producir", variantesIds: ["p1"] } },
      ];
      const f = filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), { o1: 99 });
      expect(f.map((x) => [x.referencia, x.estado])).toEqual([["Por producir", "producir_ya"], ["Con Taller", "trasladar"], ["Con orden", "en_produccion"]]);
    });
    it("más de 3 modelos para trasladar: 3 tarjetas y el resto se cuenta en «y N más», nunca se pierde", () => {
      const xs = Array.from({ length: 5 }, (_, i) => ({ d: dem(`v${i}`, { productoId: `p${i}`, stockTaller: 999, ritmoDia: 1 + i }), m: { productoId: `p${i}`, referencia: `M${i}`, variantesIds: [`v${i}`] } }));
      const r = resumenDeDecisiones(contexto({ modelos: filasPorModelo(xs.map((x) => x.d), xs.map((x) => x.m), {}), tallerId: "T1" }));
      expect(r.decisiones.map((d) => d.tipo)).toEqual(["trasladar", "trasladar", "trasladar"]);
      expect(r.ocultas).toEqual([{ tipo: "trasladar", cantidad: 2, texto: "modelos por trasladar", href: "#produce" }]);
    });
  });

  describe("lo que viene en camino y lo que no tiene datos", () => {
    it("con lo que falta ya cubierto por lo que viene en camino no se pide fabricar ni trasladar: queda en «Vigilar»", () => {
      const f = fila([dem("v1", { stockRed: 2, enCamino: 40 })]);
      expect(f).toMatchObject({ estado: "vigilar", trasladar: 0, producir: 0 });
    });
    it("una variante sin ritmo ni stock no suma nada pero sí está en el detalle del modelo", () => {
      const f = filasPorModelo([dem("a")], [{ productoId: "p1", referencia: "M", variantesIds: ["a", "sin-datos"] }], {})[0];
      expect(f.variantes.map((v) => v.varianteId)).toEqual(["a", "sin-datos"]);
      expect(f.variantes[1]).toMatchObject({ stockRed: 0, stockTaller: 0, enCamino: 0, enProduccion: 0, ritmoDia: null, ventasNetas: 0, trasladar: 0, producir: 0 });
    });
    it("la talla y el color salen de lo que se le pasa; sin ello quedan en null (no se inventan)", () => {
      const m = { productoId: "p1", referencia: "M", variantesIds: ["a", "b"], variantes: [{ varianteId: "a", talla: "S", color: "Negro", colorHex: "#000000" }] };
      const f = filasPorModelo([dem("a"), dem("b")], [m], {})[0];
      expect(f.variantes[0]).toMatchObject({ talla: "S", color: "Negro", colorHex: "#000000" });
      expect(f.variantes[1]).toMatchObject({ talla: null, color: null, colorHex: null });
    });
  });

  it("el modelo suma a sus variantes (trasladar y producir) y `producir` es la misma cifra que sugiere «Nueva orden», variante por variante", () => {
    const d = [dem("a", { stockRed: 3, stockTaller: 5, enCamino: 2, ritmoDia: 0.8 }), dem("b", { stockRed: 0, ritmoDia: 2.3, stockTaller: 100 }), dem("c", { stockRed: 50, ritmoDia: 0.3 }), dem("d", { ritmoDia: null, stockTaller: 7 })];
    const enProd = { a: 4, c: 1 };
    const f = fila(d, enProd);
    expect(f.trasladar).toBe(f.variantes.reduce((s, v) => s + v.trasladar, 0));
    expect(f.producir).toBe(f.variantes.reduce((s, v) => s + v.producir, 0));
    for (const v of f.variantes) expect(v.producir).toBe(sugerirVariante(d.find((x) => x.varianteId === v.varianteId), enProd[v.varianteId as "a" | "c"] ?? 0, 30)!.sugerido);
  });
});

describe("«se vendían y ya no hay»: la talla o el color que se agotó dentro de un modelo que sí tiene stock (/pantalla produccion, tarea #6d)", () => {
  const dem = (id: string, extra: Partial<DemandaVariante> = {}): DemandaVariante => ({ varianteId: id, productoId: "p1", stockRed: 10, stockTaller: 0, enCamino: 0, ritmoDia: 0.2, sedesConRitmo: 1, ventasNetas: 6, ventasBase: 6, cobertura: { tipo: "medida", dias: 50 }, banda: "saludable", ...extra });
  const rot = (id: string, talla: string, color: string) => ({ varianteId: id, talla, color, colorHex: null });
  const modelo = (d: DemandaVariante[], nombres: [string, string][] = d.map((_, i) => ["S", `Color ${i}`] as [string, string])) =>
    filasPorModelo(d, [{ productoId: "p1", referencia: "Pantalón Lino", variantesIds: d.map((x) => x.varianteId), variantes: d.map((x, i) => rot(x.varianteId, nombres[i][0], nombres[i][1])) }], {})[0];

  it("una talla en 0 que se vendía (3 ventas o más) en un modelo con stock en las demás: se avisa", () => {
    const f = modelo([dem("a", { stockRed: 90 }), dem("b", { stockRed: 0, ventasNetas: 3 })], [["M", "Negro"], ["S", "Negro"]]);
    expect(agotadasQueSeVendian(f).map((v) => v.varianteId)).toEqual(["b"]);
    expect(textoAgotadas(agotadasQueSeVendian(f))).toBe("Se vendían y ya no hay en tiendas: S · Negro");
  });
  it("con 2 ventas o menos es ruido (poca base, ADR-0346): no se avisa; con 3 sí", () => {
    expect(agotadasQueSeVendian(modelo([dem("a", { stockRed: 90 }), dem("b", { stockRed: 0, ventasNetas: 2 })]))).toEqual([]);
    expect(agotadasQueSeVendian(modelo([dem("a", { stockRed: 90 }), dem("b", { stockRed: 0, ventasNetas: 3 })]))).toHaveLength(1);
  });
  it("una variante con stock, aunque venda mucho, no se avisa; una agotada que nunca se vendió, tampoco", () => {
    expect(agotadasQueSeVendian(modelo([dem("a", { stockRed: 5, ventasNetas: 40 }), dem("b", { stockRed: 0, ventasNetas: 0 })]))).toEqual([]);
  });
  it("si TODO el modelo está agotado no hay aviso: su estado y su cobertura ya lo dicen", () => {
    expect(agotadasQueSeVendian(modelo([dem("a", { stockRed: 0, ventasNetas: 9 }), dem("b", { stockRed: 0, ventasNetas: 9 })]))).toEqual([]);
  });
  it("es solo un aviso: el estado del modelo, su orden y sus tarjetas son los mismos con o sin la talla agotada", () => {
    const con = modelo([dem("a", { stockRed: 90, ritmoDia: 1 }), dem("b", { stockRed: 0, ventasNetas: 12, ritmoDia: null })]);
    const sin = modelo([dem("a", { stockRed: 90, ritmoDia: 1 }), dem("b", { stockRed: 0, ventasNetas: 0, ritmoDia: null })]);
    expect(agotadasQueSeVendian(con)).toHaveLength(1);
    expect(agotadasQueSeVendian(sin)).toEqual([]);
    expect(con.estado).toBe(sin.estado);
    expect(con.estado).toBe("sobrestock");
    expect(decisionesDeProduccion(contexto({ modelos: [con] })).map((d) => d.tipo)).toEqual(decisionesDeProduccion(contexto({ modelos: [sin] })).map((d) => d.tipo));
  });
  it("nombra hasta 3, la que más se vendía primero, y cuenta el resto: «y 2 más»", () => {
    const d = [dem("ok", { stockRed: 50 }), ...["a", "b", "c", "d", "e"].map((id, i) => dem(id, { stockRed: 0, ventasNetas: 3 + i }))];
    const f = modelo(d, [["M", "Negro"], ["S", "Rojo"], ["S", "Azul"], ["S", "Verde"], ["S", "Crema"], ["S", "Beige"]]);
    expect(textoAgotadas(agotadasQueSeVendian(f))).toBe("Se vendían y ya no hay en tiendas: S · Beige, S · Crema, S · Verde y 2 más");
  });
  it("sin talla ni color no inventa un nombre: dice «una variante»; sin ninguna agotada el texto es vacío", () => {
    expect(nombreDeVariante({ talla: null, color: null })).toBe("una variante");
    expect(nombreDeVariante({ talla: "M", color: null })).toBe("M");
    expect(nombreDeVariante({ talla: null, color: "Negro" })).toBe("Negro");
    expect(textoAgotadas([])).toBe("");
  });
});

describe("«Abrir orden sugerida» dice la cantidad y la lleva (/pantalla produccion, tarea #9)", () => {
  // Un modelo de 3 tallas × 2 colores, todo agotado y con ventas parejas: lo que falta sale por talla y por color.
  const demandaDe = (extra: Partial<DemandaVariante> = {}, ids = ["m-n", "s-n", "l-n", "m-b", "s-b", "l-b"]): DemandaVariante[] =>
    ids.map((id) => ({ varianteId: id, productoId: "p1", stockRed: 0, stockTaller: 0, enCamino: 0, ritmoDia: 0.1, sedesConRitmo: 1, ventasNetas: 3, ventasBase: 3, cobertura: { tipo: "medida", dias: 0 }, banda: "critica", ...extra }));
  const rotulos = [
    { varianteId: "m-n", talla: "M", color: "Negro", colorHex: null },
    { varianteId: "s-n", talla: "S", color: "Negro", colorHex: null },
    { varianteId: "l-n", talla: "L", color: "Negro", colorHex: null },
    { varianteId: "m-b", talla: "M", color: "Beige", colorHex: null },
    { varianteId: "s-b", talla: "S", color: "Beige", colorHex: null },
    { varianteId: "l-b", talla: "L", color: "Beige", colorHex: null },
  ];
  const fila = (d: DemandaVariante[], enProd: Record<string, number> = {}) =>
    filasPorModelo(d, [{ productoId: "p1", referencia: "Blusa Encaje", variantesIds: d.map((x) => x.varianteId), variantes: rotulos.filter((r) => d.some((x) => x.varianteId === r.varianteId)) }], enProd)[0];

  it("con base, la tarjeta dice cuánto y por talla (en orden de curva, sumando los colores) y el botón lleva la sugerencia puesta", () => {
    const f = fila(demandaDe()); // 0,1/día × 30 = 3 por variante → 6 por talla (2 colores), 18 en total
    const t = decisionesDeProduccion(contexto({ modelos: [f] }));
    expect(t).toHaveLength(1);
    expect(t[0].detalle).toContain("Sugerido: 18 prendas (S 6 · M 6 · L 6).");
    expect(t[0].accion).toEqual({ texto: "Abrir orden sugerida", href: "/produccion/ordenes?nueva=p1&sugerida=1" });
  });
  it("lo que ya está en una orden abierta o en el Taller se descuenta: la tarjeta dice solo lo que falta fabricar", () => {
    const f = fila(demandaDe({ stockTaller: 1 }), { "m-n": 2, "m-b": 1 });
    // por variante: 3 − 1 del Taller = 2; la M negro tiene además 2 en orden → 0; la M beige 1 → 1
    expect(sugerenciaDeOrden(f)).toEqual({ total: 2 * 4 + 0 + 1, porTalla: [{ talla: "S", cantidad: 4 }, { talla: "M", cantidad: 1 }, { talla: "L", cantidad: 4 }] });
  });
  it("con poca base (2 ventas o menos) no hay cantidad: el botón dice «Abrir orden» y no promete una sugerencia", () => {
    const f = fila(demandaDe({ ventasBase: 0, ventasNetas: 0, ritmoDia: 0.1 }, ["m-n"]).map((d) => ({ ...d, ventasBase: 2 })));
    expect(f.ventasBase).toBe(2);
    expect(sugerenciaDeOrden(f)).toBeNull();
    const t = decisionesDeProduccion(contexto({ modelos: [f] }));
    expect(t[0].accion).toEqual({ texto: "Abrir orden", href: "/produccion/ordenes?nueva=p1" });
    expect(t[0].detalle).not.toContain("Sugerido");
    expect(t[0].detalle).toContain("poca base");
  });
  it("con 3 ventas ya hay base: es la frontera (el umbral es `UMBRAL_POCA_BASE_VENTAS`)", () => {
    expect(UMBRAL_POCA_BASE_VENTAS).toBe(2);
    const con = (v: number) => sugerenciaDeOrden(fila(demandaDe({ ventasBase: v, ventasNetas: v }, ["m-n"])));
    expect(con(2)).toBeNull();
    expect(con(3)).not.toBeNull();
  });
  it("con una sola talla no repite la cifra entre paréntesis", () => {
    const f = fila(demandaDe({}, ["m-n", "m-b"]));
    expect(textoSugerencia(sugerenciaDeOrden(f)!)).toBe("Sugerido: 6 prendas");
    expect(textoSugerencia({ total: 1, porTalla: [{ talla: "M", cantidad: 1 }] })).toBe("Sugerido: 1 prenda");
  });
  it("sin nada que fabricar (lo cubre una orden o el Taller) no hay sugerencia", () => {
    expect(sugerenciaDeOrden(fila(demandaDe(), Object.fromEntries(rotulos.map((r) => [r.varianteId, 99]))))).toBeNull();
  });
  it("una variante sin talla no inventa una: se dice «sin talla» y va al final", () => {
    const d = demandaDe({}, ["m-n", "x"]);
    const f = filasPorModelo(d, [{ productoId: "p1", referencia: "M", variantesIds: ["m-n", "x"], variantes: [rotulos[0], { varianteId: "x", talla: null, color: null, colorHex: null }] }], {})[0];
    expect(sugerenciaDeOrden(f)!.porTalla.map((t) => t.talla)).toEqual(["M", "sin talla"]);
  });
  it("hrefNuevaOrden: sin `sugerida` es el contrato de siempre (lo usan Análisis y Nuevo producto), con ella agrega el parámetro", () => {
    expect(hrefNuevaOrden("p1", false)).toBe("/produccion/ordenes?nueva=p1");
    expect(hrefNuevaOrden("p1", true)).toBe("/produccion/ordenes?nueva=p1&sugerida=1");
  });

  describe("LO QUE DICE LA TARJETA ES LO QUE ESCRIBE «NUEVA ORDEN» (se llama a la misma función que usa el formulario al abrirse)", () => {
    const d = demandaDe({ stockRed: 1 }).map((x, i) => ({ ...x, ritmoDia: 0.1 * (i + 2), stockTaller: i % 2, enCamino: i % 3 }));
    const enProd = { "m-n": 3, "l-b": 1 };
    const modelosDeLaPantalla = [{ productoId: "p1", variantes: rotulos.map((r) => ({ varianteId: r.varianteId })) }];
    const alAbrir = (extra: Partial<Parameters<typeof cantidadesInicialesDeNuevaOrden>[0]> = {}) =>
      cantidadesInicialesDeNuevaOrden({ sugerida: true, tipo: "produccion", productoInicialId: "p1", modelos: modelosDeLaPantalla, datos: { demanda: d, enProduccion: enProd }, ...extra });

    it("la cantidad de cada variante y el total son los de la tarjeta (`producir`, `sugerenciaDeOrden`)", () => {
      const f = fila(d, enProd);
      const escritas = alAbrir();
      expect(escritas).toEqual(Object.fromEntries(f.variantes.filter((v) => v.producir > 0).map((v) => [v.varianteId, String(v.producir)])));
      expect(Object.values(escritas).reduce((s, n) => s + Number(n), 0)).toBe(sugerenciaDeOrden(f)?.total ?? 0);
      expect(Object.keys(escritas).length).toBeGreaterThan(0);
    });
    it("sin `&sugerida=1` la matriz abre vacía (el contrato de siempre: Análisis y Nuevo producto)", () => {
      expect(alAbrir({ sugerida: false })).toEqual({});
    });
    it("para una muestra no se precarga: es otra cosa", () => {
      expect(alAbrir({ tipo: "muestra" })).toEqual({});
    });
    it("el modelo pedido tiene que existir: con otro id (o «auto») no se llena el primero de la lista", () => {
      expect(alAbrir({ productoInicialId: "auto" })).toEqual({});
      expect(alAbrir({ productoInicialId: null })).toEqual({});
      expect(alAbrir({ modelos: [{ productoId: "otro", variantes: [{ varianteId: "x" }] }, ...modelosDeLaPantalla], productoInicialId: "p1" })).toEqual(alAbrir());
    });
    it("si la red no respondió, la matriz abre vacía y el formulario sigue siendo el de siempre", () => {
      expect(alAbrir({ datos: null })).toEqual({});
    });
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
    expect(d[0].detalle).toBe("Se vende 8,4 por semana (36 ventas en 30 días) y quedan 0 en tiendas. Sugerido: 36 prendas.".replace("8,4", (Math.round((36 / 30) * 7 * 10) / 10).toLocaleString("es-PE")));
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

describe("la guía de Producción cuenta lo mismo que la pantalla", () => {
  it("el umbral de «poca base» que dice el paso «Cómo se lee un modelo» es el de la constante: si alguien la cambia, esta prueba pide actualizar la guía", () => {
    const paso = GUIA_PROD_RESUMEN.pasos.find((p) => p.id === "modelo");
    expect(paso?.texto).toContain(`«Poca base»: ${UMBRAL_POCA_BASE_VENTAS} o menos`);
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
