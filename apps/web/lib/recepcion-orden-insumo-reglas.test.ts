import { describe, expect, it } from "vitest";
import {
  argsRecibirOrdenInsumo,
  camposDeRecepcionOI,
  detalleDeRecepcionOI,
  entradaInicialOI,
  esMiOrden,
  leerOrdenesPorRecibir,
  leerResultadoRecepcionOI,
  llegoAlgo,
  lotesQueSeAbren,
  milesimasQueLlegan,
  problemaDeLineaRecepcion,
  type EntradaRecepcionOI,
  type LineaOIPorRecibir,
  type OrdenInsumoPorRecibir,
} from "./recepcion-orden-insumo-reglas";

// Los casos espejan `scripts/pruebas/recepcion_orden_insumo.mjs`: lo que la base rechaza, la hoja lo dice antes de pulsar. La orden de
// siempre: 12.5 m de lino a S/ 10 y 4 conos de hilo a S/ 3.125 (neto del descuento); su papel trajo 10 botones fuera de la orden.

const CRUDO = [
  {
    id: "o1",
    numero: 12,
    documento: "OI-000012",
    proveedor: "Telas Peña SAC",
    creada_en: "2026-10-14T15:00:00Z",
    creada_por_id: "p-micaela",
    creada_por: "Micaela",
    fecha_entrega_estimada: null,
    lineas: [
      { tipo: "orden", item_id: "i1", posicion: 1, insumo_id: "lino", insumo: "Lino crudo", codigo: "LIN-01", unidad: "metro", documento: null, pedido: 12.5, facturado: 0, recibido: 10, queda: 2.5, costo: 10 },
      { tipo: "orden", item_id: "i2", posicion: 2, insumo_id: "hilo", insumo: "Hilo", codigo: null, unidad: "cono", documento: null, pedido: 4, facturado: 0, recibido: 0, queda: 4, costo: 3.125 },
      { tipo: "papel", item_id: "x1", posicion: null, insumo_id: "boton", insumo: "Botón", codigo: "BOT-01", unidad: "unidad", documento: "F001-901", pedido: null, facturado: 10, recibido: 0, queda: 10, costo: 0.2 },
      { tipo: "orden", item_id: "i3", insumo: "Ya llegó", insumo_id: "z", unidad: "metro", facturado: 0, recibido: 5, queda: 0, costo: 1 },
      { tipo: "raro" },
    ],
  },
  { id: "o2", numero: 13, documento: "OI-000013", proveedor: "Otro", lineas: [] },
  { numero: 14 },
];

const orden = (): OrdenInsumoPorRecibir => leerOrdenesPorRecibir(CRUDO)[0]!;
const linea = (id: string): LineaOIPorRecibir => orden().lineas.find((l) => l.itemId === id)!;
const entrada = (l: LineaOIPorRecibir, o: Partial<EntradaRecepcionOI> = {}): EntradaRecepcionOI => ({ ...entradaInicialOI(l), ...o });

describe("recibir contra la orden de insumos: lo que queda", () => {
  it("se leen las órdenes con algo por recibir; una línea sin nada que recibir, rara o una orden vacía, se descartan", () => {
    const os = leerOrdenesPorRecibir(CRUDO);
    expect(os.map((o) => o.documento)).toEqual(["OI-000012"]);
    expect(os[0]!.lineas.map((l) => [l.tipo, l.itemId, l.queda, l.costo])).toEqual([
      ["orden", "i1", 2.5, 10],
      ["orden", "i2", 4, 3.125],
      ["papel", "x1", 10, 0.2],
    ]);
    expect(leerOrdenesPorRecibir(null)).toEqual([]);
    expect([llegoAlgo(os[0]!), esMiOrden(os[0]!, "p-micaela"), esMiOrden(os[0]!, "p-felipe"), esMiOrden(os[0]!, null)]).toEqual([true, true, false, false]);
  });

  it("el costo viene puesto con el sugerido, como se lee en su caja", () => {
    expect([entradaInicialOI(linea("i1")).costo, entradaInicialOI(linea("i2")).costo, entradaInicialOI(linea("x1")).costo]).toEqual(["10.00", "3.125", "0.20"]);
  });

  it("«Llegó» en blanco es todo lo que queda; «0», nada esta vez", () => {
    expect(milesimasQueLlegan(linea("i1"), { llego: "" })).toBe(2500);
    expect(milesimasQueLlegan(linea("i1"), { llego: "1,5" })).toBe(1500);
    expect(milesimasQueLlegan(linea("i1"), { llego: "0" })).toBe(0);
    expect(milesimasQueLlegan(linea("i1"), { llego: "abc" })).toBeNull();
  });
});

describe("recibir contra la orden de insumos: lo que falta (las reglas de la base)", () => {
  it("R2: no más de lo que queda; Q1: cuatro decimales y lo que no es número; R3: un costo negativo o con cinco decimales", () => {
    expect(problemaDeLineaRecepcion(linea("i1"), entrada(linea("i1"), { llego: "3" }))).toBe("De Lino crudo solo quedan 2.5 metros por recibir.");
    expect(problemaDeLineaRecepcion(linea("i1"), entrada(linea("i1"), { llego: "1.2345" }))).toBe("Lo que llegó va en metros, con hasta tres decimales.");
    expect(problemaDeLineaRecepcion(linea("i1"), entrada(linea("i1"), { llego: "abc" }))).toBe("Lo que llegó va en metros, con hasta tres decimales.");
    expect(problemaDeLineaRecepcion(linea("i2"), entrada(linea("i2"), { costo: "-1" }))).toMatch(/hasta cuatro decimales/);
    expect(problemaDeLineaRecepcion(linea("i2"), entrada(linea("i2"), { costo: "3.12345" }))).toMatch(/hasta cuatro decimales/);
    expect(problemaDeLineaRecepcion(linea("i2"), entrada(linea("i2"), { costo: "" }))).toBe("Escribe el costo por cono (0 si no tuvo costo).");
    // Lo que la base acepta: todo lo que queda, una parte, nada (0, sin mirar el costo) y un costo corregido o en cero.
    expect(problemaDeLineaRecepcion(linea("i1"), entrada(linea("i1")))).toBeNull();
    expect(problemaDeLineaRecepcion(linea("i1"), entrada(linea("i1"), { llego: "2.5" }))).toBeNull();
    expect(problemaDeLineaRecepcion(linea("i2"), entrada(linea("i2"), { llego: "0", costo: "" }))).toBeNull();
    expect(problemaDeLineaRecepcion(linea("i2"), entrada(linea("i2"), { costo: "3.20" }))).toBeNull();
    expect(problemaDeLineaRecepcion(linea("x1"), entrada(linea("x1"), { costo: "0" }))).toBeNull();
  });

  it("Q1: si no llega nada de ninguna línea, falta «lo que llegó»; la nota solo bloquea si se pasa; quien recibe, siempre", () => {
    const o = orden();
    const nada = o.lineas.map((l) => entrada(l, { llego: "0" }));
    const ids = (es: EntradaRecepcionOI[], nota = "", listo = true) =>
      camposDeRecepcionOI(o, es, nota, { listo, motivo: null }).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(ids(nada)).toEqual(["llega"]);
    expect(ids(o.lineas.map((l) => entrada(l)))).toEqual([]);
    expect(ids(o.lineas.map((l) => entrada(l)), "x".repeat(501))).toEqual(["nota"]);
    expect(ids(o.lineas.map((l) => entrada(l)), "", false)).toEqual(["responsable"]);
    expect(lotesQueSeAbren(o, nada)).toBe(0);
    expect(lotesQueSeAbren(o, o.lineas.map((l) => entrada(l)))).toBe(3);
  });
});

describe("recibir contra la orden de insumos: lo que viaja y lo que vuelve", () => {
  it("solo las líneas de las que llega algo, cada una por su id (de la orden o del papel), con el costo que se ve, como texto", () => {
    const o = orden();
    const es = [entrada(linea("i1")), entrada(linea("i2"), { llego: "0" }), entrada(linea("x1"), { llego: "4", costo: "0.2500", codigoLote: " BOT-14 " })];
    expect(argsRecibirOrdenInsumo(o, es, { tallerId: "t1", nota: "  llegó en un saco ", token: "tok" })).toEqual({
      p_orden_id: "o1",
      p_ubicacion_id: "t1",
      p_lineas: [
        { orden_insumo_item_id: "i1", cantidad: "2.5", costo_unitario: "10" },
        { comprobante_item_id: "x1", cantidad: "4", costo_unitario: "0.25", codigo_lote: "BOT-14" },
      ],
      p_nota: "llegó en un saco",
      p_token: "tok",
    });
    expect("p_nota" in argsRecibirOrdenInsumo(o, es, { tallerId: "t1", nota: " ", token: "tok" })).toBe(false);
  });

  it("lo que contesta la base y el aviso de la esquina", () => {
    const r = leerResultadoRecepcionOI({ recepcion_id: "r1", orden_id: "o1", documento: "OI-000012", lotes: 2, queda: true, repetido: false });
    expect(r).toEqual({ recepcionId: "r1", documento: "OI-000012", lotes: 2, queda: true, repetido: false });
    expect(leerResultadoRecepcionOI({ documento: "OI-000012" })).toBeNull();
    expect(detalleDeRecepcionOI({ lotes: 2, queda: true })).toBe("Se abrieron 2 lotes. Todavía queda algo por recibir de esta orden.");
    expect(detalleDeRecepcionOI({ lotes: 1, queda: false })).toBe("Se abrió 1 lote. Llegó todo lo de esta orden.");
  });
});
