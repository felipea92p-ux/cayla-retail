import { describe, expect, it } from "vitest";
import { gruposDelBalance, medidores, recomendacionesVale } from "./vale-reglas";
import type { LineaBalance, UnidadBalance } from "./balance-reglas";

const L = (seccion: LineaBalance["seccion"], cuenta: string, monto: number): LineaBalance => ({ seccion, cuenta, nombre: `Cuenta ${cuenta}`, monto, orden: 0, detalle: {} });
const LINEAS = [
  L("activo", "101", 5350),
  L("activo", "104", 22100),
  L("activo", "105", 3650),
  L("activo", "201", 86400),
  L("activo", "336", 31400),
  L("activo", "391", -6600),
  L("pasivo", "421", 22500),
  L("pasivo", "4011", 4200),
  L("pasivo", "41", 5200),
  L("pasivo", "451", 6800),
  L("patrimonio", "50", 80000),
  L("patrimonio", "591", 19750),
  L("patrimonio", "resultado_mes", 3850),
];

describe("gruposDelBalance (ADR-0585)", () => {
  const g = gruposDelBalance(LINEAS);
  it("cada lado en grupos que una tienda reconoce, y los dos lados pesan lo mismo", () => {
    expect(g.map((x) => [x.clave, x.monto])).toEqual([
      ["plata", 27450],
      ["cobros", 3650],
      ["mercaderia", 86400],
      ["equipos", 24800],
      ["proveedores", 22500],
      ["impuestos", 4200],
      ["sueldos", 5200],
      ["prestamos", 6800],
      ["tuyo", 103600],
    ]);
    const tiene = g.filter((x) => x.lado === "tiene").reduce((a, x) => a + x.monto, 0);
    const debeYTuyo = g.filter((x) => x.lado !== "tiene").reduce((a, x) => a + x.monto, 0);
    expect(tiene).toBe(debeYTuyo);
  });
  it("las líneas van por su nombre, nunca por su cuenta", () => {
    expect(g.find((x) => x.clave === "plata")!.lineas.map((l) => l.nombre)).toEqual(["Caja (cajones, cajas fuertes y lo entregado al líder)", "Bancos y billeteras"]);
  });
  it("lo que no cae en un grupo va a «Otros» de su lado", () => {
    expect(gruposDelBalance([L("activo", "999", 10), L("pasivo", "4699", 5)]).map((x) => x.clave)).toEqual(["otros-tiene", "otros-debe"]);
  });
});

describe("medidores", () => {
  const m = medidores(gruposDelBalance(LINEAS), 24300);
  it("cobertura: plata y cobros contra lo que se debe; meses: mercadería contra un mes de costo", () => {
    expect(m.plataYCobros).toBe(31100);
    expect(m.deudas).toBe(38700);
    expect(m.cobertura).toBeCloseTo(0.8036, 3);
    expect(m.mesesDeMercaderia).toBeCloseTo(3.556, 2);
  });
  it("sin deudas o sin costo, no inventa", () => {
    expect(medidores([], null)).toMatchObject({ cobertura: null, mesesDeMercaderia: null });
  });
});

describe("recomendacionesVale", () => {
  const href = (r: string, s?: string) => (s ? `${r}?sede=${s}` : r);
  const u = (p: Partial<UnidadBalance>) => ({ ubicacionId: "x", nombre: "X", tipo: "tienda", invertido: 25950, rinde: 0.1, ...p }) as UnidadBalance;
  it("no cuadra arriba; mercadería quieta; cobertura; la sede que no rinde", () => {
    const m = medidores(gruposDelBalance(LINEAS), 20000);
    const r = recomendacionesVale({ cuadra: false, medidas: m, unidades: [u({ ubicacionId: "lim", nombre: "Tienda Lima", rinde: -0.056 }), u({ ubicacionId: "tru", nombre: "Tienda Trujillo", rinde: 0.204 })], sede: null, href });
    expect(r.map((x) => x.clave)).toEqual(["no-cuadra", "mercaderia", "cobertura"]);
    const r2 = recomendacionesVale({ cuadra: true, medidas: medidores(gruposDelBalance(LINEAS), 40000), unidades: [u({ ubicacionId: "lim", nombre: "Tienda Lima", rinde: -0.056 }), u({ ubicacionId: "tru", nombre: "Tienda Trujillo", rinde: 0.204 })], sede: null, href });
    expect(r2.map((x) => x.clave)).toEqual(["cobertura", "rinde-lim"]);
    expect(r2[1]).toMatchObject({ titulo: "Tienda Lima no devuelve lo invertido", accion: { href: "/finanzas/reportes/balance?sede=lim" } });
    expect(r2[1]!.texto).toContain("Tienda Trujillo rinde +20,4 %");
  });
  it("sin nada que decir, lo dice", () => {
    const r = recomendacionesVale({ cuadra: true, medidas: { cobertura: 1.5, plataYCobros: 1, deudas: 1, mesesDeMercaderia: 2, mercaderia: 1 }, unidades: [], sede: null, href });
    expect(r).toEqual([expect.objectContaining({ clave: "tranquilo", titulo: "El Balance cuadra" })]);
  });
});
