import { describe, expect, it } from "vitest";
import { agruparPorComprobante, armarRecepcion, entradaInicial, estadoRecepcion, resumenRecepcion, type EntradaLinea, type LineaPorRecibir } from "./recibir-produccion-reglas";

const linea = (itemId: string, extra: Partial<LineaPorRecibir> = {}): LineaPorRecibir => ({
  comprobanteId: "c1",
  proveedor: "Textiles Gamarra",
  tipo: "factura",
  serie: "F001",
  numero: "100",
  fechaEmision: "2026-09-10",
  itemId,
  insumoId: `ins-${itemId}`,
  insumo: `Insumo ${itemId}`,
  unidad: "metro",
  facturado: 100,
  recibido: 0,
  cerrado: 0,
  pendiente: 100,
  ...extra,
});
const entrada = (itemId: string, extra: Partial<EntradaLinea> = {}): EntradaLinea => ({ ...entradaInicial({ itemId }), ...extra });

describe("estadoRecepcion", () => {
  it("nada llegó, algo llegó, o ya no falta nada", () => {
    expect(estadoRecepcion([linea("a")])).toBe("pendiente");
    expect(estadoRecepcion([linea("a", { recibido: 60, pendiente: 40 })])).toBe("parcial");
    expect(estadoRecepcion([linea("a", { cerrado: 20, pendiente: 80 })])).toBe("parcial");
    expect(estadoRecepcion([linea("a", { recibido: 100, pendiente: 0 }), linea("b", { cerrado: 100, pendiente: 0 })])).toBe("completa");
  });
});

describe("agruparPorComprobante", () => {
  it("agrupa por comprobante, lo más antiguo primero, y separa las líneas con pendiente", () => {
    const g = agruparPorComprobante([
      linea("a", { comprobanteId: "c2", numero: "200", fechaEmision: "2026-09-15" }),
      linea("b"),
      linea("c", { recibido: 100, pendiente: 0 }),
    ]);
    expect(g.map((c) => c.comprobanteId)).toEqual(["c1", "c2"]);
    expect(g[0].documento).toBe("F001-100");
    expect(g[0].lineas).toHaveLength(2);
    expect(g[0].pendientes.map((l) => l.itemId)).toEqual(["b"]);
    expect(g[0].estado).toBe("parcial");
  });
});

describe("armarRecepcion", () => {
  const ls = [linea("a"), linea("b", { unidad: "unidad", pendiente: 50, facturado: 50 })];
  it("sin escribir nada, llega todo lo pendiente: un lote por línea", () => {
    const r = armarRecepcion(ls, [entrada("a"), entrada("b")]);
    expect(r).toMatchObject({ lotes: 2, error: null });
    expect(r.lineas).toEqual([
      { item_id: "a", cantidad: 100 },
      { item_id: "b", cantidad: 50 },
    ]);
    expect(r.cierres).toEqual([]);
  });
  it("una recepción parcial abre lote por lo que llegó y no cierra nada", () => {
    const r = armarRecepcion([ls[0]], [entrada("a", { llego: "60" })]);
    expect(r.lineas).toEqual([{ item_id: "a", cantidad: 60 }]);
    expect(r.cierres).toEqual([]);
  });
  it("«no llegará» cierra lo que falta después de lo que llegó, con su motivo", () => {
    const r = armarRecepcion([ls[0]], [entrada("a", { llego: "60,5", noLlegara: true, motivo: "devolucion" })]);
    expect(r.lineas).toEqual([{ item_id: "a", cantidad: 60.5 }]);
    expect(r.cierres).toEqual([{ item_id: "a", cantidad: 39.5, motivo: "devolucion" }]);
  });
  it("si no llegó nada de una línea y no llegará, solo se cierra (sin lote)", () => {
    const r = armarRecepcion([ls[0]], [entrada("a", { llego: "0", noLlegara: true })]);
    expect(r.lineas).toEqual([]);
    expect(r.cierres).toEqual([{ item_id: "a", cantidad: 100, motivo: "faltante" }]);
    expect(r.lotes).toBe(0);
  });
  it("incluye el código de lote solo si se escribió", () => {
    expect(armarRecepcion([ls[0]], [entrada("a", { codigoLote: " L-7 " })]).lineas[0]).toEqual({ item_id: "a", cantidad: 100, codigo_lote: "L-7" });
  });
  it("no deja recibir más de lo pendiente y lo dice con las unidades", () => {
    expect(armarRecepcion([ls[0]], [entrada("a", { llego: "101" })]).error).toContain("solo faltan 100 m");
  });
  it("rechaza números inválidos y más de tres decimales", () => {
    expect(armarRecepcion([ls[0]], [entrada("a", { llego: "abc" })]).error).toContain("no es un número");
    expect(armarRecepcion([ls[0]], [entrada("a", { llego: "1,2345" })]).error).toContain("3 decimales");
  });
  it("una recepción sin nada llegado ni cerrado no se puede guardar", () => {
    expect(armarRecepcion([ls[0]], [entrada("a", { llego: "0" })]).error).toContain("Indica qué llegó");
  });
});

describe("resumenRecepcion", () => {
  it("cuenta los comprobantes con algo por recibir y las líneas pendientes; los completos no", () => {
    const g = agruparPorComprobante([
      linea("a"),
      linea("b", { recibido: 10, pendiente: 90 }),
      linea("c", { comprobanteId: "c2", recibido: 100, pendiente: 0 }),
    ]);
    expect(resumenRecepcion(g)).toEqual({ porRecibir: 1, lineasPendientes: 2, parciales: 1 });
  });
});
