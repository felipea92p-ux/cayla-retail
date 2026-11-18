import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { filaDeVer, leerResumen } from "./resumen-finanzas-reglas";
import { campanasSinFilas, campanasDelMes, cascadaGanamos, desvio, filasConMeta, filasDeSedes, metaDeVentas, metaParaDecir, NOTA_IGV_VENTAS, porSede, pptoDeLaSede, recomendacionesGanamos, ventaQueCubre } from "./ganamos-reglas";
import { filasDeTramos } from "./cascada-estados-reglas";
import type { FilaPpto } from "./presupuesto-reglas";
import type { CampanaFila, FilaER } from "./resultados-reglas";

describe("campanasSinFilas: «no hubo» solo si se pudo leer", () => {
  it("leídas y sin ninguna: no hubo", () => expect(campanasSinFilas(null, "octubre")).toEqual({ falla: false, texto: "No hubo campañas en octubre." }));
  it("si falló la lectura, lo dice y no afirma que no hubo", () => {
    const r = campanasSinFilas("No se pudo leer las campañas: se cayó", "octubre");
    expect(r).toEqual({ falla: true, texto: "No se pudieron leer las campañas de octubre." });
    expect(r.texto).not.toMatch(/No hubo/);
  });
});

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

// ADR-0624: la cascada parte de lo vendido con IGV, resta el IGV de tus ventas (es de SUNAT) y llega a lo vendido como subtotal. La suma no cambia.
describe("cascadaGanamos con lo cobrado", () => {
  const suma = (f: FilaER) => cascadaGanamos(f, []).filter((x) => x.tipo !== "queda" && !x.subtotal).reduce((a, x) => a + (x.tipo === "entra" ? x.monto : -x.monto), 0);

  it("Vendiste con IGV → IGV de tus ventas → Vendiste, y lo vendido es un subtotal", () => {
    const t = cascadaGanamos(fila({ igvCobrado: 1800 }), []);
    expect(t.slice(0, 3).map((x) => [x.clave, x.nombre, x.tipo, x.monto, x.subtotal ?? false])).toEqual([
      ["con_igv", "Vendiste con IGV", "entra", fila({}).ventas + 1800, false],
      ["igv", "IGV de tus ventas", "sale", 1800, false],
      ["ventas", "Vendiste", "entra", fila({}).ventas, true],
    ]);
    expect(t[1]!.detalle).toBe(NOTA_IGV_VENTAS);
    expect(t.some((x) => x.clave === "claure")).toBe(false);
    const conClaure = cascadaGanamos(fila({ igvCobrado: 1800, claureSinIgv: 500 }), []);
    expect(conClaure.slice(0, 3).map((x) => [x.clave, x.tipo, x.monto])).toEqual([["con_igv", "entra", fila({}).ventas + 2300], ["igv", "sale", 1800], ["claure", "sale", 500]]);
    expect(filasDeTramos(t).slice(0, 3).map((x) => x.tipo)).toEqual(["total", "paso", "subtotal"]);
  });
  it("no cambia la suma ni agrega «Otros ajustes»", () => {
    const con = fila({ igvCobrado: 1800 });
    expect(cascadaGanamos(con, []).some((x) => x.clave === "ajustes")).toBe(cascadaGanamos(fila({}), []).some((x) => x.clave === "ajustes"));
    expect(suma(con)).toBeCloseTo(suma(fila({})), 2);
  });
  it("sin el IGV leído, la cascada empieza en lo vendido, como siempre", () => {
    const t = cascadaGanamos(fila({}), []);
    expect(t[0]).toMatchObject({ clave: "ventas", tipo: "entra", detalle: "Sin IGV." });
    expect(t.some((x) => x.clave === "igv" || x.clave === "con_igv")).toBe(false);
  });
});

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
  it("mes en curso: pide lo del mes entero, nunca los gastos de los días que van (ADR-0621)", () => {
    const con = recomendacionesGanamos({ fila: fila({}), sedes, tramos, meta: null, campanas: [], enCurso: true, ventaDelMes: () => 40100, href })[0]!;
    expect(con.texto.replace(/\s/g, " ")).toBe("Para cubrir el mes entero necesita vender S/ 40,100; lleva S/ 12,000, sin IGV.");
    const sin = recomendacionesGanamos({ fila: fila({}), sedes, tramos, meta: null, campanas: [], enCurso: true, ventaDelMes: () => null, href })[0]!;
    expect(sin.texto).not.toContain("al mes;");
    expect(sin.texto).not.toContain("necesita vender");
  });
  // Tarea 19, con cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609).
  const TRUJILLO = { unidad: "tienda" as const, ubicacionId: "u-tru", nombre: "Tienda Trujillo", ventas: 75_000, margen: 25_200, resultado: -4_800 };
  it("Trujillo: unos S/ 105,400 con IGV junto a lo vendido con IGV; el margen sigue siendo 33.6 %", () => {
    const f = fila({ ...TRUJILLO, igvCobrado: 13_500, claureSinIgv: 0 });
    expect(ventaQueCubre(f)).toBe(105_400);
    expect(((f.margen / f.ventas) * 100).toFixed(1)).toBe("33.6");
    const r = recomendacionesGanamos({ fila: f, sedes: porSede([f]), tramos: [], meta: null, campanas: [], enCurso: false, href })[0]!;
    expect(r.texto.replace(/\s/g, " ")).toBe("Para cubrir lo que cuesta tenerla abierta necesita vender S/ 105,400 al mes; este mes vendió S/ 88,500, con IGV.");
  });
  it("Tienda LIM: lo de CAYLA con IGV, nunca lo cobrado con CLAURE", () => {
    const f = fila({ unidad: "tienda", ubicacionId: "u-lim", nombre: "Tienda Lima", ventas: 1_000, margen: 500, resultado: -500, igvCobrado: 270, claureSinIgv: 500 });
    const r = recomendacionesGanamos({ fila: f, sedes: porSede([f]), tramos: [], meta: null, campanas: [], enCurso: false, href })[0]!;
    // 1,000 ÷ 50 % = 2,000 sin IGV → 2,360 con IGV → 2,400. Con la tasa inflada (27 %) serían 2,600.
    expect(r.texto.replace(/\s/g, " ")).toBe("Para cubrir lo que cuesta tenerla abierta necesita vender S/ 2,400 al mes; este mes vendió S/ 1,180, con IGV y sin lo de CLAURE.");
    expect(r.texto).not.toContain("1,770");
  });
  it("otras fechas: ninguna cifra mensual", () => {
    expect(recomendacionesGanamos({ fila: fila({}), sedes, tramos, meta: null, campanas: [], enCurso: false, unMes: false, href })[0]!.texto).toBe("En estas fechas, sus gastos pasan lo que deja la venta.");
  });
  it("con tres sedes en pérdida, nombra a las que más pierden", () => {
    const tres = porSede([
      fila({ unidad: "tienda", ubicacionId: "a", nombre: "A", ventas: 1000, margen: 500, resultado: -100 }),
      fila({ unidad: "tienda", ubicacionId: "b", nombre: "B", ventas: 1000, margen: 500, resultado: -9000 }),
      fila({ unidad: "tienda", ubicacionId: "c", nombre: "C", ventas: 1000, margen: 500, resultado: -300 }),
    ]);
    const r = recomendacionesGanamos({ fila: fila({}), sedes: tres, tramos: [], meta: null, campanas: [], enCurso: false, href });
    expect(r.slice(0, 2).map((x) => x.clave)).toEqual(["pierde-b", "pierde-c"]);
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

describe("la respuesta y lo de cada sede como en la maqueta (ADR-0585)", () => {
  it("cada sede, en el orden del telar, con su color y su enlace", () => {
    const f = filasDeSedes(
      [
        { clave: "u-lim", nombre: "Tienda Lima", color: "lim", resultado: -1400, ventas: 9000, margen: 4000 },
        { clave: "empresa", nombre: "De la empresa", color: "emp", resultado: -900, ventas: 0, margen: 0 },
        { clave: "u-tru", nombre: "Tienda Trujillo", color: "tru", resultado: 4200, ventas: 20000, margen: 9000 },
      ],
      (c) => `/finanzas/reportes?sede=${c}`,
    );
    expect(f.map((x) => [x.nombre, x.valor, x.color])).toEqual([
      ["Trujillo", 4200, "var(--color-sede-tru)"],
      ["Lima", -1400, "var(--color-sede-lim)"],
      ["Empresa", -900, "var(--color-sede-emp)"],
    ]);
    expect(f[0]).toMatchObject({ tipo: "total", href: "/finanzas/reportes?sede=u-tru" });
  });
});

describe("con la forma REAL de la base: `gastos` ya incluye los sueldos y el desgaste (ADR-0453, traída de la cascada del Pulso)", () => {
  it("la cascada de una tienda real no repite los sueldos ni inventa ajustes, y sus tramos suman lo que quedó", () => {
    const r = leerResumen(fixture.tru);
    if (r.resultadosMes.estado !== "ok") throw new Error("el fixture trae el estado de resultados");
    const f = filaDeVer(r.resultadosMes.datos, r.ver)!;
    const c = cascadaGanamos(f, []);
    expect(c.find((t) => t.clave === "planilla")!.monto).toBe(7800);
    expect(c.map((t) => t.clave)).not.toContain("ajustes");
    const suma = c.filter((t) => t.tipo !== "queda").reduce((a, t) => a + (t.tipo === "entra" ? t.monto : -t.monto), 0);
    expect(Math.round(suma * 100) / 100).toBe(Math.round(f.resultado * 100) / 100);
  });
});

describe("la meta de ventas, con IGV (tarea 53)", () => {
  const NOVIEMBRE = { meta: 120_000, real: 96_000, avance: 96_000 / 120_000, enCurso: true };
  const hrefMeta = (r: string) => r;
  const texto = (s: string) => s.replace(/\u00a0/g, " ");
  const detalles = (f: ReturnType<typeof fila>, enCurso = true) => {
    const filas = [
      { clave: "con_igv", nombre: "Vendiste con IGV", valor: 113_280, tipo: "total" as const, detalle: "nota" },
      { clave: "ventas", nombre: "Vendiste", valor: 96_000, tipo: "subtotal" as const, detalle: "Sin IGV." },
    ];
    const conMeta = filasConMeta(f.igvCobrado === undefined ? filas.slice(1) : filas, NOVIEMBRE, f, enCurso);
    return Object.fromEntries(conMeta.map((x) => [x.clave, texto(x.detalle ?? "")]));
  };

  it("la meta del mes dice 141,600 junto a «Vendiste con IGV», y el porcentaje no cambia de base", () => {
    const d = detalles(fila({ igvCobrado: 17_280, claureSinIgv: 0 }));
    expect(d.con_igv).toBe("Meta con IGV: S/ 141,600.00 · al ritmo de hoy, 80 %");
    expect(d.ventas).toBe("Sin IGV.");
  });

  it("Lima: la meta va junto a lo de CAYLA con IGV, no junto a todo lo cobrado en la tienda", () => {
    const f = fila({ ventas: 400, igvCobrado: 180, claureSinIgv: 600 });
    const lima = { meta: 5_000, real: 900, avance: 900 / 5_000, enCurso: true };
    const filas = [{ clave: "con_igv", nombre: "Vendiste con IGV", valor: 1_180, tipo: "total" as const }];
    expect(texto(filasConMeta(filas, lima, f, true)[0]!.detalle!)).toBe("Lo de CAYLA con IGV: S/ 472.00 · Meta: S/ 5,900.00 · al ritmo de hoy, 18 %");
  });

  it("con ventas de CLAURE avisa que la meta no las incluye: en Lima es de CAYLA", () => {
    const f = fila({ igvCobrado: 180, claureSinIgv: 600 });
    const lima = { meta: 5_000, real: 900, avance: 900 / 5_000, enCurso: true };
    expect(metaParaDecir(lima, f)).toMatchObject({ fila: "con_igv", meta: 5_900, rotulo: "con IGV y sin lo de CLAURE" });
    expect(detalles(f).con_igv).toContain("Meta: S/ 141,600.00");
    expect(detalles(f).con_igv).toContain("Lo de CAYLA con IGV:");
  });

  it("sin la fila «Vendiste con IGV», la meta queda en «Vendiste» y dice que va sin IGV", () => {
    expect(detalles(fila({})).ventas).toBe("Meta sin IGV: S/ 120,000.00 · al ritmo de hoy, 80 %");
    expect(metaParaDecir(NOVIEMBRE, fila({ igvCobrado: 0, claureSinIgv: 0 }))).toMatchObject({ fila: "ventas", meta: 120_000, rotulo: "sin IGV" });
    expect(metaParaDecir(NOVIEMBRE, null)).toMatchObject({ fila: "ventas", meta: 120_000, rotulo: "sin IGV" });
  });

  it("«faltarían» se convierte como la meta: (meta − proyección) × 1.18", () => {
    expect(metaParaDecir(NOVIEMBRE, fila({ igvCobrado: 17_280, claureSinIgv: 0 })).falta).toBe(28_320);
    const r = recomendacionesGanamos({ fila: fila({ igvCobrado: 17_280, claureSinIgv: 0 }), sedes: [], tramos: [], meta: NOVIEMBRE, campanas: [], enCurso: true, href: hrefMeta })[0]!;
    expect(r.titulo).toBe("Al ritmo de hoy, llegas al 80 % de la meta");
    expect(texto(r.texto)).toBe("La meta, con IGV, es S/ 141,600; faltarían S/ 28,320.");
  });

  it("sin leer el IGV, la recomendación dice su base", () => {
    const r = recomendacionesGanamos({ fila: fila({}), sedes: [], tramos: [], meta: NOVIEMBRE, campanas: [], enCurso: false, href: hrefMeta })[0]!;
    expect(texto(r.texto)).toBe("La meta, sin IGV, es S/ 120,000; faltaron S/ 24,000.");
  });
});
