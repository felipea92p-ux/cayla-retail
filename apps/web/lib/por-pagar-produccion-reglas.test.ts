import { describe, expect, it } from "vitest";
import type { ComprobanteProduccion } from "./comprobantes-produccion-reglas";
import { nombreDeMes, resumenDeuda, tramosPorPagar, type DeudaFila } from "./por-pagar-produccion-reglas";

const comp = (id: string, extra: Partial<ComprobanteProduccion> = {}): ComprobanteProduccion => ({
  id,
  proveedorId: "p1",
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

describe("tramosPorPagar", () => {
  const hoy = "2026-09-20";
  it("ordena por urgencia y dentro de cada tramo por quién vence primero; ignora lo pagado y lo anulado", () => {
    const lista = [
      comp("lejos", { fechaVencimiento: "2026-12-01" }),
      comp("semana", { fechaVencimiento: "2026-09-25", saldo: 500 }),
      comp("vencido2", { vencido: true, fechaVencimiento: "2026-09-15", saldo: 300 }),
      comp("vencido1", { vencido: true, fechaVencimiento: "2026-09-05", saldo: 200 }),
      comp("mes", { fechaVencimiento: "2026-10-10" }),
      comp("pagado", { saldo: 0, estadoPago: "pagada" }),
      comp("anulado", { estado: "anulada", saldo: 0, estadoPago: "anulada" }),
    ];
    const t = tramosPorPagar(lista, hoy);
    expect(t.map((x) => x.clave)).toEqual(["vencido", "semana", "mes", "despues"]);
    expect(t[0].comprobantes.map((c) => c.id)).toEqual(["vencido1", "vencido2"]);
    expect(t[0].monto).toBe(500);
    expect(t[1].monto).toBe(500);
  });
  it("un tramo sin comprobantes no aparece", () => {
    expect(tramosPorPagar([comp("a", { fechaVencimiento: "2026-09-22" })], "2026-09-20").map((x) => x.clave)).toEqual(["semana"]);
    expect(tramosPorPagar([], "2026-09-20")).toEqual([]);
  });
});

const fila = (origen: DeudaFila["origen"], saldo: number, vencido = 0): DeudaFila => ({ origen, proveedorId: `${origen}-${saldo}`, proveedor: "X", comprobantes: 1, saldo, vencido, proximoVencimiento: null });

describe("resumenDeuda (D-I)", () => {
  it("suma los dos libros, lo vencido y cuenta proveedores por origen", () => {
    const r = resumenDeuda([fila("compras", 1000, 400), fila("compras", 500), fila("produccion", 1500, 100)]);
    expect(r.total).toBe(3000);
    expect(r.vencido).toBe(500);
    expect(r.porOrigen.compras).toEqual({ saldo: 1500, vencido: 400, proveedores: 2 });
    expect(r.porOrigen.produccion).toEqual({ saldo: 1500, vencido: 100, proveedores: 1 });
    expect(r.parteProduccion).toBe(0.5);
  });
  it("sin deuda no hay parte que mostrar", () => {
    expect(resumenDeuda([]).parteProduccion).toBeNull();
  });
});

describe("nombreDeMes", () => {
  it("se lee en español", () => {
    expect(nombreDeMes("2026-09-01")).toBe("septiembre 2026");
    expect(nombreDeMes("2026-01-01")).toBe("enero 2026");
  });
});
