import { describe, expect, it } from "vitest";
import { campanasDelMes, cascadaGanamos, desvio, metaDeVentas, porSede, pptoDeLaSede, recomendacionesGanamos, ventaQueCubre } from "./ganamos-reglas";
import type { FilaPpto } from "./presupuesto-reglas";
import type { CampanaFila, FilaER } from "./resultados-reglas";

const fila = (p: Partial<FilaER>): FilaER =>
  ({
    ubicacionId: null,
    unidad: "consolidado",
    nombre: "CAYLA",
    orden: 0,
    ventas: 48600,
    costo: 24000,
    fletes: 200,
    mermas: 100,
    margen: 24300,
    planilla: 9800,
    depreciacion: 600,
    gastos: 20450,
    resultado: 3850,
    detalleGastos: [
      { cuenta: "62", nombre: "Planilla", monto: 9800 },
      { cuenta: "635", nombre: "Alquileres", monto: 7000 },
      { cuenta: "636", nombre: "Servicios básicos", monto: 1200 },
      { cuenta: "637", nombre: "Publicidad", monto: 500 },
      { cuenta: "656", nombre: "Suministros", monto: 1050 },
      { cuenta: "6599", nombre: "Faltantes de caja", monto: 300 },
      { cuenta: "681", nombre: "Depreciación", monto: 600 },
    ],
    planillaNota: null,
    ...p,
  }) as FilaER;

const ppto = (p: Partial<FilaPpto>): FilaPpto =>
  ({ ubicacionId: null, unidad: "consolidado", nombre: "CAYLA", tipo: "tope", presupuesto: null, aLaFecha: 0, proyeccion: null, momento: "cerrado", linea: "", ...p }) as FilaPpto;

describe("cascadaGanamos (ADR-0585)", () => {
  const t = cascadaGanamos(fila({}), [
    ppto({ linea: "62", presupuesto: 9500, aLaFecha: 9800 }),
    ppto({ linea: "656", presupuesto: 800, aLaFecha: 1050 }),
    ppto({ linea: "ventas", tipo: "meta", presupuesto: 52000, aLaFecha: 48600 }),
  ]);
  it("suma: lo que entra menos lo que sale es lo que queda", () => {
    const suma = t.filter((x) => x.tipo !== "queda").reduce((s, x) => s + (x.tipo === "entra" ? x.monto : -x.monto), 0);
    expect(Math.round(suma)).toBe(3850);
    expect(t.at(-1)).toMatchObject({ clave: "queda", nombre: "Ganaste", monto: 3850 });
  });
  it("agrupa en palabras de tienda, sin cuentas a la vista, y separa las diferencias de caja", () => {
    expect(t.map((x) => x.clave)).toEqual(["ventas", "costo", "planilla", "local", "publicidad", "administracion", "caja", "desgaste", "queda"]);
    expect(new Set(t.map((x) => x.clave)).size).toBe(t.length);
    expect(t.find((x) => x.clave === "local")).toMatchObject({ nombre: "Local y servicios", monto: 8200 });
    expect(t.find((x) => x.clave === "costo")?.monto).toBe(24300);
    expect(JSON.stringify(t)).not.toMatch(/"6\d\d"|"62"/);
  });
  it("cada gasto con tope lleva lo planeado y su desvío; sus cuentas, real y planeado", () => {
    expect(t.find((x) => x.clave === "planilla")).toMatchObject({ plan: 9500 });
    expect(t.find((x) => x.clave === "administracion")).toMatchObject({ plan: 800 });
    expect(t.find((x) => x.clave === "administracion")?.desvio).toBeCloseTo(0.3125);
    expect(t.find((x) => x.clave === "administracion")?.lineas).toEqual([{ nombre: "Suministros", real: 1050, plan: 800 }]);
    expect(t.find((x) => x.clave === "local")?.plan).toBeUndefined();
  });
  it("en el mes en curso compara la proyección, no lo que va", () => {
    const c = cascadaGanamos(fila({}), [ppto({ linea: "62", presupuesto: 9500, aLaFecha: 4000, proyeccion: 10450, momento: "en_curso" })]);
    expect(c.find((x) => x.clave === "planilla")?.desvio).toBeCloseTo(0.1);
  });
  it("una pérdida dice «Perdiste» y lo que no se nombra va a «Otros ajustes»", () => {
    const c = cascadaGanamos(fila({ resultado: -1500 }), []);
    expect(c.at(-1)).toMatchObject({ nombre: "Perdiste", monto: 1500, negativo: true });
    expect(c.find((x) => x.clave === "ajustes")).toMatchObject({ tipo: "sale", monto: 5350 });
  });
});

describe("las demás piezas", () => {
  it("desvío: sin tope no hay", () => {
    expect(desvio(110, 100)).toBeCloseTo(0.1);
    expect(desvio(110, null)).toBeNull();
    expect(desvio(110, 0)).toBeNull();
  });
  it("pptoDeLaSede: todas → CAYLA; una sede → su unidad", () => {
    const filas = [ppto({ unidad: "consolidado" }), ppto({ unidad: "tienda", ubicacionId: "u-lim" }), ppto({ unidad: "empresa" })];
    expect(pptoDeLaSede(filas, "todas")).toHaveLength(1);
    expect(pptoDeLaSede(filas, "u-lim")[0]?.ubicacionId).toBe("u-lim");
    expect(pptoDeLaSede(filas, "empresa")[0]?.unidad).toBe("empresa");
  });
  it("la meta de ventas", () => {
    expect(metaDeVentas([ppto({ linea: "ventas", tipo: "meta", presupuesto: 52000, aLaFecha: 48600 })])).toMatchObject({ meta: 52000, real: 48600 });
    expect(metaDeVentas([])).toBeNull();
  });
  it("porSede: sin CAYLA, de la que más deja a la que menos", () => {
    const s = porSede([fila({}), fila({ unidad: "tienda", ubicacionId: "u-lim", nombre: "Tienda Lima", resultado: -1450 }), fila({ unidad: "empresa", nombre: "Empresa", resultado: -2680 }), fila({ unidad: "tienda", ubicacionId: "u-tru", nombre: "Tienda Trujillo", resultado: 6120 })]);
    expect(s.map((x) => x.clave)).toEqual(["u-tru", "u-lim", "empresa"]);
    expect(s.at(-1)?.nombre).toBe("De la empresa");
  });
  it("ventaQueCubre: los gastos ÷ el margen por sol vendido", () => {
    expect(ventaQueCubre({ ventas: 12000, margen: 5700, resultado: -1450 })).toBe(15100);
    expect(ventaQueCubre({ ventas: 0, margen: 0, resultado: -100 })).toBeNull();
  });
  it("campanasDelMes: las que corrieron dentro del mes", () => {
    const c = (p: Partial<CampanaFila>) => ({ id: "x", nombre: "C", momento: "pasada", desde: "2026-10-24", hasta: "2026-10-31", ...p }) as CampanaFila;
    expect(campanasDelMes([c({}), c({ id: "y", desde: "2026-09-01", hasta: "2026-09-05" }), c({ id: "z", momento: "viene" })], "2026-10").map((x) => x.id)).toEqual(["x"]);
  });
});

describe("recomendacionesGanamos", () => {
  const href = (r: string, s?: string) => (s ? `${r}?sede=${s}` : r);
  const tramos = cascadaGanamos(fila({}), [ppto({ linea: "656", presupuesto: 800, aLaFecha: 1050 })]);
  const sedes = porSede([fila({ unidad: "tienda", ubicacionId: "u-lim", nombre: "Tienda Lima", ventas: 12000, margen: 5700, resultado: -1450 })]);
  const camp = { id: "h", nombre: "Halloween", momento: "pasada", desde: "2026-10-24", hasta: "2026-10-31", descuentoPct: 20, margenExtra: 2100 } as CampanaFila;
  it("ordena lo urgente arriba y corta en 3: la sede que pierde, el gasto que se pasa, la campaña", () => {
    const r = recomendacionesGanamos({ fila: fila({}), sedes, tramos, meta: { meta: 52000, real: 48600, avance: 0.93, enCurso: false }, campanas: [camp], enCurso: false, href });
    expect(r.map((x) => x.clave)).toEqual(["pierde-u-lim", "pasa-administracion", "campana-h"]);
    expect(r[0]).toMatchObject({ tono: "error", titulo: "Tienda Lima pierde S/ 1,450", accion: { href: "/finanzas/reportes?sede=u-lim" } });
    expect(r[0]!.texto).toContain("S/ 15,100");
    expect(r[1]).toMatchObject({ titulo: "Administración: 31 % sobre lo planeado", accion: { href: "/finanzas/gastos" } });
    expect(r[1]!.texto).toContain("Lo que más subió: suministros.");
    expect(r[2]).toMatchObject({ tono: "exito", accion: { href: "/finanzas/reportes/campanas" } });
  });
  it("sin nada que decir, lo dice", () => {
    const r = recomendacionesGanamos({ fila: fila({}), sedes: [], tramos: cascadaGanamos(fila({}), []), meta: null, campanas: [], enCurso: true, href });
    expect(r).toEqual([expect.objectContaining({ clave: "tranquilo", tono: "exito" })]);
  });
  it("la meta lejos, al ritmo de hoy", () => {
    const r = recomendacionesGanamos({ fila: fila({}), sedes: [], tramos: [], meta: { meta: 52000, real: 40000, avance: 0.77, enCurso: true }, campanas: [], enCurso: true, href });
    expect(r[0]!.titulo).toBe("Al ritmo de hoy, llegas al 77 % de la meta");
  });
});
