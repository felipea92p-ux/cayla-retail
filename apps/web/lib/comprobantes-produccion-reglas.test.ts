import { describe, expect, it } from "vitest";
import {
  diasHasta,
  estadoVisible,
  etiquetaTipo,
  filtrarComprobantes,
  redondear2,
  resumenComprobantes,
  type ComprobanteProduccion,
} from "./comprobantes-produccion-reglas";

const comp = (id: string, extra: Partial<ComprobanteProduccion> = {}): ComprobanteProduccion => ({
  id,
  proveedorId: "p1",
  proveedor: "Textiles Gamarra",
  tipo: "factura",
  serie: "F001",
  numero: id,
  fechaEmision: "2026-09-05",
  condicion: "credito",
  fechaVencimiento: "2026-10-05",
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

describe("lista y resumen", () => {
  const hoy = "2026-09-20";
  const lista = [
    comp("1"),
    comp("2", { pagado: 1180, saldo: 0, estadoPago: "pagada", condicion: "contado", fechaVencimiento: null }),
    comp("3", { proveedorId: "p2", proveedor: "Botones Ñandú", fechaVencimiento: "2026-09-10", vencido: true, fechaEmision: "2026-08-10", saldo: 500, total: 500 }),
    comp("4", { estado: "anulada", saldo: 0, estadoPago: "anulada" }),
  ];
  it("el resumen suma lo que se debe y lo vencido; las anuladas no cuentan", () => {
    const r = resumenComprobantes(lista, hoy);
    expect(r.porPagar).toBe(1680);
    expect(r.conSaldo).toBe(2);
    expect(r.vencido).toBe(500);
    expect(r.nVencidos).toBe(1);
    expect(r.delMes).toBe(2360); // #1 y #2 emitidos en septiembre; #3 fue en agosto
  });
  it("filtra por estado, proveedor y texto (sin tildes)", () => {
    const base = { proveedorId: null, busqueda: "" };
    expect(filtrarComprobantes(lista, { ...base, estado: "por_pagar" }).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "vencidos" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "pagados" }).map((c) => c.id)).toEqual(["2"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "anulados" }).map((c) => c.id)).toEqual(["4"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: "p2", busqueda: "" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: null, busqueda: "nandu" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: null, busqueda: "f001-2" }).map((c) => c.id)).toEqual(["2"]);
  });
});

describe("estadoVisible", () => {
  const hoy = "2026-09-20";
  it("lo vencido y lo que vence en una semana van en ámbar, cada uno con sus días", () => {
    expect(estadoVisible(comp("v", { vencido: true, fechaVencimiento: "2026-09-10" }), hoy)).toEqual({ tono: "ambar", texto: "Vencida hace 10 d" });
    expect(estadoVisible(comp("a", { fechaVencimiento: "2026-09-25" }), hoy)).toEqual({ tono: "ambar", texto: "Por pagar · vence en 5 d" });
    expect(estadoVisible(comp("n", { fechaVencimiento: "2026-10-30" }), hoy).tono).toBe("neutro");
  });
  it("pagada es verde y anulada se apaga", () => {
    expect(estadoVisible(comp("p", { estadoPago: "pagada", saldo: 0 }), hoy).tono).toBe("verde");
    expect(estadoVisible(comp("x", { estado: "anulada" }), hoy).tono).toBe("apagado");
  });
  it("los días se cuentan desde hoy", () => {
    expect(diasHasta("2026-09-25", "2026-09-20")).toBe(5);
    expect(diasHasta("2026-09-10", "2026-09-20")).toBe(-10);
  });
});

describe("etiquetaTipo", () => {
  it("nombra los tres tipos del líder y «sin comprobante», que llega del papel de una orden de insumos (ADR-0362, fase 7 parte 2)", () => {
    expect([etiquetaTipo("factura"), etiquetaTipo("nota_venta", true)]).toEqual(["Factura", "N. venta"]);
    expect([etiquetaTipo("sin_comprobante"), etiquetaTipo("sin_comprobante", true)]).toEqual(["Sin comprobante", "Sin comp."]);
    expect(etiquetaTipo("otro")).toBe("otro");
  });
});
