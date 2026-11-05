import { describe, expect, it } from "vitest";
import { marcaDeEmpresa, porcentajesEnteros, repartoDeEmpresas, vendidoDeLaBase, vendidoPorCaja, type VendidoEmpresa } from "./vendido-por-empresa-reglas";

const CAYLA = { id: "ca71a000-0000-4000-8000-000000000001", clave: "cayla", nombre: "CAYLA" };
const CLAURE = { id: "c1a07e00-0000-4000-8000-000000000002", clave: "claure", nombre: "CLAURE" };
const LIMA = [CAYLA, CLAURE];
const TRUJILLO = [CAYLA];

const vendido = (e: { id: string; clave: string; nombre: string }, total: number, orden = e.clave === "cayla" ? 1 : 2): VendidoEmpresa => ({
  empresaId: e.id,
  clave: e.clave,
  nombre: e.nombre,
  orden,
  ventas: 1,
  unidades: 1,
  total,
});

describe("porcentajesEnteros", () => {
  it("suman exactamente 100", () => {
    expect(porcentajesEnteros([2, 1])).toEqual([67, 33]);
    expect(porcentajesEnteros([1, 1, 1])).toEqual([34, 33, 33]);
    expect(porcentajesEnteros([950, 250]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("sin nada vendido, todo en 0", () => {
    expect(porcentajesEnteros([0, 0])).toEqual([0, 0]);
  });
});

describe("repartoDeEmpresas", () => {
  it("en Lima reparte lo vendido y la suma es el total", () => {
    const r = repartoDeEmpresas([vendido(CAYLA, 950.1), vendido(CLAURE, 250.2)], LIMA)!;
    expect(r.total).toBe(1200.3);
    expect(r.partes.map((p) => [p.nombre, p.total, p.pct])).toEqual([
      ["CAYLA", 950.1, 79],
      ["CLAURE", 250.2, 21],
    ]);
  });

  it("en Lima, CLAURE sale aunque hoy no haya vendido nada", () => {
    const r = repartoDeEmpresas([vendido(CAYLA, 300)], LIMA)!;
    expect(r.partes.map((p) => [p.nombre, p.total, p.pct])).toEqual([
      ["CAYLA", 300, 100],
      ["CLAURE", 0, 0],
    ]);
  });

  it("en Lima sin ventas todavía: las dos en cero", () => {
    const r = repartoDeEmpresas([], LIMA)!;
    expect(r.total).toBe(0);
    expect(r.partes).toHaveLength(2);
  });

  it("en Trujillo, todo CAYLA: no se dibuja", () => {
    expect(repartoDeEmpresas([vendido(CAYLA, 500)], TRUJILLO)).toBeNull();
  });

  it("sin lista de empresas, solo si hay algo que no es de la casa", () => {
    expect(repartoDeEmpresas([vendido(CAYLA, 500)], null)).toBeNull();
    expect(repartoDeEmpresas([vendido(CAYLA, 500), vendido(CLAURE, 100)], null)?.partes).toHaveLength(2);
  });

  it("sin lectura de la base, nada (la pantalla sale como antes)", () => {
    expect(repartoDeEmpresas(null, LIMA)).toBeNull();
  });

  it("CAYLA va primero aunque la base las entregue al revés", () => {
    const r = repartoDeEmpresas([vendido(CLAURE, 10), vendido(CAYLA, 20)], LIMA)!;
    expect(r.partes.map((p) => p.clave)).toEqual(["cayla", "claure"]);
  });

  it("suma en céntimos, sin restos de coma flotante", () => {
    expect(repartoDeEmpresas([vendido(CAYLA, 0.1), vendido(CLAURE, 0.2)], LIMA)!.total).toBe(0.3);
  });
});

describe("vendidoDeLaBase y vendidoPorCaja", () => {
  const fila = (caja: string, e: typeof CAYLA, total: string) => ({ caja_id: caja, empresa_id: e.id, clave: e.clave, nombre: e.nombre, orden: 1, ventas: 2, unidades: 3, total });
  it("el total llega como texto (numeric) y se vuelve número", () => {
    expect(vendidoDeLaBase(fila("a", CAYLA, "120.50")).total).toBe(120.5);
  });
  it("agrupa por caja", () => {
    const m = vendidoPorCaja([fila("a", CAYLA, "10"), fila("a", CLAURE, "5"), fila("b", CAYLA, "7")]);
    expect(m.get("a")).toHaveLength(2);
    expect(m.get("b")?.[0]?.total).toBe(7);
  });
});

describe("marcaDeEmpresa", () => {
  it("una venta toda de CLAURE se marca solo con su nombre", () => {
    expect(marcaDeEmpresa([{ empresaId: CLAURE.id, monto: 59 }], LIMA)).toEqual({ nombre: "CLAURE", monto: 59, toda: true });
  });
  it("una venta mixta dice cuánto es de CLAURE", () => {
    expect(marcaDeEmpresa([{ empresaId: CAYLA.id, monto: 45 }, { empresaId: CLAURE.id, monto: 59.9 }], LIMA)).toEqual({ nombre: "CLAURE", monto: 59.9, toda: false });
  });
  it("una venta toda de CAYLA no lleva marca", () => {
    expect(marcaDeEmpresa([{ empresaId: CAYLA.id, monto: 45 }], LIMA)).toBeNull();
  });
  it("sin lista de empresas o sin la empresa de la prenda, no se marca", () => {
    expect(marcaDeEmpresa([{ empresaId: CLAURE.id, monto: 59 }], null)).toBeNull();
    expect(marcaDeEmpresa([{ empresaId: null, monto: 59 }], LIMA)).toBeNull();
  });
});
