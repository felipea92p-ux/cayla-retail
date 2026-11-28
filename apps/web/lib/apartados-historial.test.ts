import { describe, expect, it } from "vitest";
import { comoSeHistorial, enHistorial, ordenHistorial, queComprobante, salidaDeBusqueda } from "./apartados-historial";
import { enPendientes } from "./apartados-pestanas";

const base = { total: 199.7, adelanto: 60, comprobanteFinal: null, comprobanteAnticipo: null, notaCredito: null };

describe("el Historial de Apartados (ADR-0720)", () => {
  it("lleva solo lo terminado, y cada apartado va en una sola de las dos listas", () => {
    for (const estado of ["abierta", "liberada", "entregada", "devuelta"] as const) {
      expect(enHistorial({ estado }) !== enPendientes({ estado }), estado).toBe(true);
    }
    expect(enHistorial({ estado: "entregada" })).toBe(true);
    expect(enHistorial({ estado: "devuelta" })).toBe(true);
  });

  it("lo entregado dice con qué comprobante salió y el total que pagó", () => {
    expect(comoSeHistorial({ ...base, estado: "entregada", comprobanteFinal: "B001-00001251" })).toEqual({ insignia: "Entregado", debajo: { que: "boleta", numero: "B001-00001251" }, monto: 199.7, montoDice: "pagado" });
    expect(comoSeHistorial({ ...base, estado: "entregada", comprobanteFinal: "F001-00000042" }).debajo).toEqual({ que: "factura", numero: "F001-00000042" });
    // Los de antes de la constancia (ADR-0399): su boleta de anticipo.
    expect(comoSeHistorial({ ...base, estado: "entregada", comprobanteAnticipo: "B004-00000007" }).debajo).toEqual({ que: "boleta", numero: "B004-00000007" });
    expect(comoSeHistorial({ ...base, estado: "entregada" }).debajo).toBeNull();
  });

  it("lo devuelto dice el adelanto que se le devolvió y, si hubo, su nota de crédito", () => {
    expect(comoSeHistorial({ ...base, estado: "devuelta" })).toEqual({ insignia: "Devuelto", debajo: null, monto: 60, montoDice: "devuelto" });
    expect(comoSeHistorial({ ...base, estado: "devuelta", notaCredito: "BC01-00000003" }).debajo).toEqual({ que: "nota de crédito", numero: "BC01-00000003" });
  });

  it("qué comprobante es, por su serie, y sin «·»", () => {
    expect(queComprobante("b001-1")).toBe("boleta");
    expect(queComprobante(" F002-9 ")).toBe("factura");
    expect(queComprobante("T001-3")).toBe("comprobante");
    expect(JSON.stringify(comoSeHistorial({ ...base, estado: "entregada", comprobanteFinal: "B001-1" }))).not.toContain("·");
  });

  it("lo más reciente arriba", () => {
    const lista = [
      { id: "viejo", creadaEn: "2026-11-02T15:00:00Z", codigo: "APT-TRU-0030" },
      { id: "nuevo", creadaEn: "2026-11-20T15:00:00Z", codigo: "APT-TRU-0036" },
      { id: "medio", creadaEn: "2026-11-10T15:00:00Z", codigo: "APT-TRU-0033" },
    ];
    expect(ordenHistorial(lista).map((a) => a.id)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("si lo buscado no está, el puente solo lleva adonde está: a Pendientes, a todo el historial o a ningún lado", () => {
    expect(salidaDeBusqueda({ q: "Rosa", hayEnPendientes: true, todoElHistorial: false })).toEqual({ texto: "Nadie con «Rosa» en Historial.", accion: { texto: "Búscalo en Pendientes", a: "pendientes" } });
    expect(salidaDeBusqueda({ q: "Rosa", hayEnPendientes: false, todoElHistorial: false })).toEqual({ texto: "Nadie con «Rosa» en los últimos 30 días.", accion: { texto: "Buscar en todo el historial", a: "todo" } });
    expect(salidaDeBusqueda({ q: "Rosa", hayEnPendientes: false, todoElHistorial: true })).toEqual({ texto: "Nadie con «Rosa» en Historial.", accion: null });
  });
});
