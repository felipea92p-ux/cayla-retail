import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { cambiosDelMes, RUBROS_VISIBLES } from "./resumen-cambios-reglas";
import type { FilaER } from "./resultados-reglas";
import { leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";

// «Lo que más se movió desde el mes pasado» (Resumen, spike 2): rubro por rubro, y la suma de los efectos es lo que cambió lo que te deja el mes.

const texto = (s: string) => s.replace(/ /g, " ");
const base = leerResumen(fixture.todas);
const unaFila = (): FilaER => {
  if (base.resultadosMes.estado !== "ok") throw new Error("fixture");
  return base.resultadosMes.datos.find((f) => f.unidad === "consolidado")!;
};

/** Una columna del Estado de resultados armada a mano: ventas, costo de la ropa y gastos por cuenta; el resultado sale de la cuenta. */
function columna(c: { ventas: number; costo: number; gastos: Record<string, number>; resultadoExtra?: number }): FilaER {
  const detalleGastos = Object.entries(c.gastos).map(([cuenta, monto]) => ({ cuenta, nombre: `Cuenta ${cuenta}`, monto }));
  const gastos = detalleGastos.reduce((s, d) => s + d.monto, 0);
  const margen = c.ventas - c.costo;
  return { ...unaFila(), ventas: c.ventas, costo: c.costo, fletes: 0, mermas: 0, margen, gastos, detalleGastos, resultado: margen - gastos + (c.resultadoExtra ?? 0) };
}
const verTodas = (r: ResumenFinanzas = base): ResumenFinanzas => ({ ...r, ver: { ...r.ver, todas: true, tipo: "todas", soloEmpresa: false } });

// Octubre al 15 y septiembre al 15 (cifras de la maqueta): deja 3,850 contra 1,400.
const OCT = columna({ ventas: 46_900, costo: 22_500, gastos: { "62": 11_000, "635": 4_840, "636": 3_710, "639": 520, "681": 480 } });
const SEP = columna({ ventas: 41_300, costo: 19_800, gastos: { "62": 10_900, "635": 4_840, "636": 3_420, "639": 460, "681": 480 } });

function ok(c: ReturnType<typeof cambiosDelMes>) {
  if (c.tipo !== "ok") throw new Error(`se esperaba «ok» y salió ${c.tipo}`);
  return c;
}

describe("cambiosDelMes", () => {
  it("pone cada rubro con lo que movió lo que te deja el mes, de mayor a menor, y lo que no cambió no sale", () => {
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: true }));
    expect(c.dif).toBe(2_450);
    expect(c.filas.map((f) => [f.clave, f.efecto])).toEqual([
      ["ventas", 5_600],
      ["costo", -2_700],
      ["g636", -290],
      ["g62", -100],
      ["g639", -60],
    ]);
    // El alquiler y la depreciación no cambiaron: no ensucian la lista.
    expect(c.filas.some((f) => f.clave === "g635" || f.clave === "g681")).toBe(false);
  });

  it("la suma de los efectos es EXACTAMENTE lo que cambió lo que te deja el mes", () => {
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: true }));
    expect(c.filas.reduce((s, f) => s + f.efecto, 0)).toBeCloseTo(c.dif, 2);
  });

  it("dice cuánto cambió el rubro mismo, no solo su efecto", () => {
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: true }));
    const ventas = c.filas.find((f) => f.clave === "ventas")!;
    expect([ventas.antes, ventas.ahora, ventas.pct]).toEqual([41_300, 46_900, 14]);
    // La ropa costó más (un efecto negativo), pero el rubro SUBIÓ 14 %.
    expect(c.filas.find((f) => f.clave === "costo")!.pct).toBe(14);
  });

  it("el titular compara con el mismo tramo del mes pasado, o con el mes entero si ya cerró", () => {
    expect(texto(ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: true })).titular)).toBe("Te deja S/ 2,450 más que en agosto a esta fecha.");
    expect(texto(ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: false })).titular)).toBe("Te deja S/ 2,450 más que en agosto.");
  });

  it("si te deja menos lo dice, y si es lo mismo también", () => {
    expect(texto(ok(cambiosDelMes({ r: verTodas(), ahora: [SEP], antes: [OCT], enCurso: true })).titular)).toContain("S/ 2,450 menos");
    expect(texto(ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [OCT], enCurso: true })).titular)).toBe("Te deja lo mismo que en agosto a esta fecha.");
  });
});

describe("el veredicto, en lenguaje de tienda", () => {
  it("gana más porque vende más y el margen es el mismo: no por prenda", () => {
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [SEP], enCurso: true }));
    expect(c.veredicto).toBe("Ganas más porque vendes más (+14 %), no porque ganes más por prenda: el margen sigue en 52 %.");
  });

  it("si cambió lo que deja cada prenda, lo dice con el margen de antes y de ahora", () => {
    const barato = columna({ ventas: 46_900, costo: 25_000, gastos: { "62": 11_000 } });
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [barato], antes: [SEP], enCurso: true }));
    expect(texto(c.veredicto ?? "")).toBe("Cada prenda te deja menos: de cada S/ 100 vendidos, 47 son margen (antes, 52).");
  });

  it("si las ventas casi no se movieron, calla antes que inventar una explicación", () => {
    const casiIgual = columna({ ventas: 41_900, costo: 20_100, gastos: { "62": 11_000 } });
    expect(ok(cambiosDelMes({ r: verTodas(), ahora: [casiIgual], antes: [SEP], enCurso: true })).veredicto).toBeNull();
  });

  it("el Taller y la Empresa no venden: no hay veredicto de ventas, y se dice «cuesta»", () => {
    const taller = { ...verTodas(), ver: { ...base.ver, todas: false, tipo: "taller" as const, soloEmpresa: false, ubicacionId: "tal" } };
    const a = { ...OCT, unidad: "taller" as const, ubicacionId: "tal", resultado: -800 };
    const b = { ...SEP, unidad: "taller" as const, ubicacionId: "tal", resultado: -500 };
    const c = ok(cambiosDelMes({ r: taller, ahora: [a], antes: [b], enCurso: true }));
    expect(c.veredicto).toBeNull();
    expect(texto(c.titular)).toBe("Cuesta S/ 300 más que en agosto a esta fecha.");
  });
});

describe("cuando la lista no cabe o no cuadra", () => {
  it("lo más chico se junta en una sola fila, y la lista sigue sumando lo mismo", () => {
    const gastosA: Record<string, number> = {};
    const gastosB: Record<string, number> = {};
    for (const [i, cuenta] of ["62", "635", "636", "632", "637", "631", "656", "634"].entries()) {
      gastosA[cuenta] = 1_000 + (i + 1) * 10;
      gastosB[cuenta] = 1_000;
    }
    const a = columna({ ventas: 41_300, costo: 19_800, gastos: gastosA });
    const b = columna({ ventas: 41_300, costo: 19_800, gastos: gastosB });
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [a], antes: [b], enCurso: true }));
    expect(c.filas).toHaveLength(RUBROS_VISIBLES + 1);
    expect(c.filas.at(-1)!.nombre).toBe("Otros 3 rubros");
    expect(c.filas.reduce((s, f) => s + f.efecto, 0)).toBeCloseTo(c.dif, 2);
  });

  it("lo que los rubros no explican entra como «Otros ajustes»: la lista nunca queda corta", () => {
    // Mismo mes que septiembre en todo, pero el resultado de la base trae 400 menos que la suma de los rubros (una devolución, una nota de crédito).
    const a = columna({ ventas: 41_300, costo: 19_800, gastos: { "62": 10_900, "635": 4_840, "636": 3_420, "639": 460, "681": 480 }, resultadoExtra: -400 });
    const c = ok(cambiosDelMes({ r: verTodas(), ahora: [a], antes: [SEP], enCurso: true }));
    expect(c.filas.map((f) => [f.clave, f.efecto])).toEqual([["otros-ajustes", -400]]);
    expect(c.filas.reduce((s, f) => s + f.efecto, 0)).toBeCloseTo(c.dif, 2);
  });
});

describe("cuando no se puede comparar", () => {
  it("sin el mes pasado no se inventa nada", () => {
    const c = cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: null, enCurso: true });
    expect(c.tipo).toBe("sin_comparacion");
  });

  it("si lo que miras no tuvo fila el mes pasado, tampoco", () => {
    const c = cambiosDelMes({ r: verTodas(), ahora: [OCT], antes: [], enCurso: true });
    expect(c.tipo).toBe("sin_comparacion");
  });
});
