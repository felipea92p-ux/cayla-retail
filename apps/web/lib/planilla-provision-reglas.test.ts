import { describe, expect, it } from "vitest";
import { aplicarProvision, delMes, leerProvision, notaProvisionado, resumenDeProvision, type FilaProvision } from "./planilla-provision-reglas";
import type { FilaER } from "./resultados-reglas";

const fila = (p: Partial<FilaER>): FilaER => ({
  ubicacionId: null, unidad: "tienda", nombre: "Tienda", orden: 1,
  ventas: 0, costo: 0, fletes: 0, mermas: 0, margen: 0, planilla: 0, depreciacion: 0, gastos: 0, resultado: 0, igvVentas: 0,
  detalleGastos: [], detalleMermas: [], sinCosto: 0, mermasSinCosto: 0, descuadres: 0, planillaVisible: true, planillaNota: null,
  planillaEstimada: 0, planillaAlCierre: 0, planillaPersonas: 0,
  ...p,
});
const prov = (p: Partial<FilaProvision>): FilaProvision => ({
  ubicacionId: null, sedeCodigo: "X", unidad: "tienda", periodoId: "p1", fechaIni: "2026-09-28", fechaFin: "2026-10-28",
  personas: 3, diasPeriodo: 31, diasCorridos: 20, devengado: 0, deHoy: 0, alCierre: null,
  ...p,
});

// Octubre: TRU y AQP son tiendas, el Taller no vende, «De la empresa» junta la central y la oficina, y el consolidado suma todo.
const TRU = fila({ ubicacionId: "u-tru", nombre: "Tienda TRU", ventas: 1000, margen: 600, gastos: 100, resultado: 500, detalleGastos: [{ cuenta: "635", nombre: "Alquileres", monto: 100 }] });
const AQP = fila({ ubicacionId: "u-aqp", nombre: "Tienda AQP", ventas: 500, margen: 300, planilla: 40, gastos: 140, resultado: 160, detalleGastos: [{ cuenta: "62", nombre: "Gastos de personal", monto: 40 }, { cuenta: "635", nombre: "Alquileres", monto: 100 }] });
const TAL = fila({ ubicacionId: "u-tal", unidad: "taller", nombre: "Taller", gastos: 30, resultado: -30 });
const EMP = fila({ unidad: "empresa", nombre: "De la empresa", gastos: 50, resultado: -50 });
const CONS = fila({ unidad: "consolidado", nombre: "CAYLA", ventas: 1500, margen: 900, planilla: 40, gastos: 320, resultado: 580, detalleGastos: [{ cuenta: "62", nombre: "Gastos de personal", monto: 40 }, { cuenta: "635", nombre: "Alquileres", monto: 200 }] });

describe("leerProvision", () => {
  it("lee las filas de la base (los numeric viajan como texto) sin perder el «sin proyección»", () => {
    const f = leerProvision([
      { ubicacion_id: "u-tru", sede_codigo: "TRU", unidad: "tienda", periodo_id: "p1", fecha_ini: "2026-09-28", fecha_fin: "2026-10-28", personas: 12, dias_periodo: 31, dias_corridos: 20, devengado: "11799.74", al_cierre: "18291.1" },
      { ubicacion_id: null, sede_codigo: "CCO", unidad: "empresa", periodo_id: "p1", fecha_ini: "2026-09-28", fecha_fin: "2026-10-28", personas: 5, dias_periodo: 31, dias_corridos: 3, devengado: 400, al_cierre: null },
    ]);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ ubicacionId: "u-tru", unidad: "tienda", personas: 12, devengado: 11799.74, alCierre: 18291.1, diasCorridos: 20 });
    expect(f[1]).toMatchObject({ ubicacionId: null, unidad: "empresa", alCierre: null });
  });

  it("lo que no es una fila válida se descarta, y una unidad desconocida cae en «empresa» (nunca se reparte a una tienda)", () => {
    expect(leerProvision(null)).toEqual([]);
    expect(leerProvision({ filas: [] })).toEqual([]);
    expect(leerProvision([{ devengado: 10 }, "x", null])).toEqual([]);
    expect(leerProvision([{ periodo_id: "p", unidad: "rara", devengado: 5 }])[0]!.unidad).toBe("empresa");
  });
});

describe("delMes", () => {
  it("el período que TERMINA en el mes es la planilla de ese mes (D-35), aunque empiece en el anterior", () => {
    const a = prov({ fechaIni: "2026-09-28", fechaFin: "2026-10-28", devengado: 1 });
    const b = prov({ fechaIni: "2026-10-29", fechaFin: "2026-11-27", devengado: 2 });
    expect(delMes([a, b], "2026-10")).toEqual([a]);
    expect(delMes([a, b], "2026-11")).toEqual([b]);
    expect(delMes([a, b], "2026-09")).toEqual([]);
  });
});

describe("aplicarProvision", () => {
  const todas = [TRU, AQP, TAL, EMP, CONS];

  it("suma lo estimado a la planilla y a los gastos, y lo resta del resultado: como lo haría el diario si Dynamic ya hubiera pagado", () => {
    const [tru] = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200, alCierre: 310, personas: 12 })]);
    expect(tru).toMatchObject({ planilla: 200, gastos: 300, resultado: 300, planillaEstimada: 200, planillaAlCierre: 310, planillaPersonas: 12 });
    // El resultado sigue siendo margen − gastos: la estimación no rompe la cuenta.
    expect(tru!.margen - tru!.gastos).toBe(tru!.resultado);
  });

  it("el gasto de personal (62) entra al detalle: se suma al que ya hay, o se crea en su lugar", () => {
    const [tru, aqp] = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200 }), prov({ ubicacionId: "u-aqp", devengado: 60 })]);
    expect(tru!.detalleGastos).toEqual([{ cuenta: "62", nombre: "Gastos de personal", monto: 200 }, { cuenta: "635", nombre: "Alquileres", monto: 100 }]);
    expect(aqp!.detalleGastos.find((d) => d.cuenta === "62")!.monto).toBe(100);
    expect(aqp).toMatchObject({ planilla: 100, planillaEstimada: 60 });
  });

  it("«de la empresa» suma la central y la oficina de Trujillo, y el Taller se une por su ubicación", () => {
    const [, , tal, emp] = aplicarProvision(todas, [
      prov({ ubicacionId: null, unidad: "empresa", sedeCodigo: "CCO", devengado: 300, alCierre: 450, personas: 5 }),
      prov({ ubicacionId: null, unidad: "empresa", sedeCodigo: "OTRU", devengado: 100, alCierre: 150, personas: 4 }),
      prov({ ubicacionId: "u-tal", unidad: "taller", sedeCodigo: "LIM", devengado: 80, alCierre: 120, personas: 3 }),
    ]);
    expect(emp).toMatchObject({ planilla: 400, planillaEstimada: 400, planillaAlCierre: 600, planillaPersonas: 9, gastos: 450, resultado: -450 });
    expect(tal).toMatchObject({ planilla: 80, planillaEstimada: 80, planillaAlCierre: 120, planillaPersonas: 3, resultado: -110 });
  });

  it("el consolidado lleva la suma exacta de todas las estimaciones, y sigue siendo la suma de las filas", () => {
    const out = aplicarProvision(todas, [
      prov({ ubicacionId: "u-tru", devengado: 200, alCierre: 300 }),
      prov({ ubicacionId: "u-aqp", devengado: 60, alCierre: 90 }),
      prov({ ubicacionId: null, unidad: "empresa", devengado: 100, alCierre: 130 }),
    ]);
    const cons = out.find((f) => f.unidad === "consolidado")!;
    expect(cons).toMatchObject({ planillaEstimada: 360, planillaAlCierre: 520, planilla: 400, gastos: 680, resultado: 220 });
    const unidades = out.filter((f) => f.unidad !== "consolidado");
    expect(unidades.reduce((s, f) => s + f.planillaEstimada, 0)).toBe(cons.planillaEstimada);
    expect(cons.margen - cons.gastos).toBe(cons.resultado);
  });

  it("sin proyección todavía (pocos días corridos), el período entero no se adivina: vale lo devengado, nunca menos", () => {
    const [tru] = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200, alCierre: null })]);
    expect(tru!.planillaAlCierre).toBe(200);
    const [tru2] = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200, alCierre: 150 })]);
    expect(tru2!.planillaAlCierre).toBe(200);
  });

  it("dos períodos en el rango (un reporte de varios meses) se suman por unidad", () => {
    const [tru] = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", periodoId: "a", devengado: 100, alCierre: 100, personas: 10 }), prov({ ubicacionId: "u-tru", periodoId: "b", devengado: 50, alCierre: 80, personas: 11 })]);
    expect(tru).toMatchObject({ planillaEstimada: 150, planillaAlCierre: 180, planilla: 150 });
  });

  it("lo que ya estaba asentado queda y la estimación se suma encima (un período pagado, otro no): nunca se pisan", () => {
    const [, aqp] = aplicarProvision(todas, [prov({ ubicacionId: "u-aqp", devengado: 60 })]);
    expect(aqp).toMatchObject({ planilla: 100, planillaEstimada: 60 }); // 40 pagados + 60 estimados
    expect(aqp!.planilla - aqp!.planillaEstimada).toBe(40);
  });

  it("deja la nota de lo asentado y le suma la de lo estimado", () => {
    const [, aqp] = aplicarProvision([TRU, fila({ ...AQP, planillaNota: "Planilla del 29/08 al 28/09 · 3 personas (Dynamic)" })], [prov({ ubicacionId: "u-aqp", devengado: 60, personas: 3 })]);
    expect(aqp!.planillaNota).toBe("Planilla del 29/08 al 28/09 · 3 personas (Dynamic) · Provisionado hasta hoy con las boletas de Dynamic (3 personas); las horas de cada día entran cuando la persona cierra su jornada. Cuando Dynamic pague el período, entra lo pagado de verdad.");
  });

  it("una fila sin estimación, o con una que no suma nada, queda tal cual (la misma referencia)", () => {
    const out = aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200 }), prov({ ubicacionId: "u-aqp", devengado: 0 })]);
    expect(out[0]).not.toBe(TRU);
    expect(out[1]).toBe(AQP);
    expect(out[2]).toBe(TAL);
    expect(aplicarProvision(todas, [])).toEqual(todas);
  });

  it("una estimación de una ubicación que no se está mirando no se cuela en otra, y no muta lo que recibe", () => {
    const copia = JSON.parse(JSON.stringify(todas));
    const out = aplicarProvision([AQP], [prov({ ubicacionId: "u-tru", devengado: 200 })]);
    expect(out[0]).toBe(AQP);
    aplicarProvision(todas, [prov({ ubicacionId: "u-tru", devengado: 200 })]);
    expect(todas).toEqual(copia);
  });

  it("viendo solo una tienda no hay consolidado y la «empresa» no recibe nada", () => {
    const out = aplicarProvision([TRU], [prov({ ubicacionId: "u-tru", devengado: 200 }), prov({ ubicacionId: null, unidad: "empresa", devengado: 100 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.planillaEstimada).toBe(200);
  });
});

describe("resumenDeProvision", () => {
  it("cuántas sedes, personas y plata tiene la estimación de un mes; sin nada, null", () => {
    expect(resumenDeProvision([])).toBeNull();
    expect(resumenDeProvision([prov({ devengado: 0 })])).toBeNull();
    expect(resumenDeProvision([prov({ devengado: 200, alCierre: 300, personas: 12 }), prov({ devengado: 50, alCierre: null, personas: 3 })])).toEqual({ sedes: 2, personas: 15, devengado: 250, alCierre: 350, deHoy: 0 });
  });
});

describe("notaProvisionado", () => {
  it("dice cuántas personas, en singular o plural", () => {
    expect(notaProvisionado(1, 0, null)).toContain("(1 persona)");
    expect(notaProvisionado(12, 0, null)).toContain("(12 personas)");
  });

  it("sin nada de hoy explica por qué las horas llegan al cerrar la jornada; con lo de hoy, dice cuánto es y que se corrige", () => {
    expect(notaProvisionado(5, 0, null)).toContain("las horas de cada día entran cuando la persona cierra su jornada");
    expect(notaProvisionado(5, 640, null)).toContain("S/\u00a0640 son de hoy, calculados con las horas que lleva cada persona, y se corrigen cuando cierra su jornada");
  });
});

describe("lo de hoy (act. 2026-10-22)", () => {
  const base = { ubicacion_id: "u-tru", sede_codigo: "TRU", unidad: "tienda", periodo_id: "p1", fecha_ini: "2026-09-28", fecha_fin: "2026-10-28", personas: 12, dias_periodo: 31, dias_corridos: 24, devengado: "10000.50", al_cierre: "14000" };

  it("la base lo trae en su columna y la pantalla lo suma al devengado, sabiendo cuánto es de hoy", () => {
    const [f] = leerProvision([{ ...base, hoy_estimado: "640.25" }]);
    expect(f).toMatchObject({ devengado: 10640.75, deHoy: 640.25, alCierre: 14000 });
  });

  it("nulo (hoy es feriado, no hay jornadas, la base falló) o sin la columna (antes de pegar la migración): no suma nada", () => {
    expect(leerProvision([{ ...base, hoy_estimado: null }])[0]).toMatchObject({ devengado: 10000.5, deHoy: 0 });
    expect(leerProvision([base])[0]).toMatchObject({ devengado: 10000.5, deHoy: 0 });
  });

  it("un estimado de hoy negativo o ilegible jamás resta: vale 0", () => {
    expect(leerProvision([{ ...base, hoy_estimado: "-50" }])[0]).toMatchObject({ devengado: 10000.5, deHoy: 0 });
    expect(leerProvision([{ ...base, hoy_estimado: "abc" }])[0]).toMatchObject({ devengado: 10000.5, deHoy: 0 });
  });

  it("entra al Estado de resultados con el resto del devengado, y la nota de la fila dice cuánto es de hoy", () => {
    const [tru] = aplicarProvision([TRU], leerProvision([{ ...base, hoy_estimado: "640" }]));
    expect(tru).toMatchObject({ planillaEstimada: 10640.5, planilla: 10640.5 });
    expect(tru!.planillaNota).toContain("S/\u00a0640 son de hoy");
  });

  it("el resumen de la confianza suma lo de hoy de todas las sedes", () => {
    const r = resumenDeProvision([prov({ devengado: 1000, deHoy: 100 }), prov({ devengado: 500, deHoy: 40.5 })]);
    expect(r).toMatchObject({ devengado: 1500, deHoy: 140.5 });
  });
});
