import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { pctDelNudo, recorridoPlata, type Recorrido } from "./recorrido-plata-reglas";

// «El recorrido de la plata» (El telar, Resumen). Lo que se prueba primero es la regla que no se rompe: lo que entra al nudo es lo
// que sale, en toda sede y en todo mes (con pérdida, con sobrantes y faltantes de caja, con ajustes que la base no nombra).

const filasDe = (r: ResumenFinanzas): FilaER[] => (r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : []);
const sum = (xs: { monto: number }[]) => Math.round(xs.reduce((a, h) => a + h.monto, 0) * 100) / 100;
const cuadra = (rec: Recorrido) => {
  expect(sum(rec.entradas)).toBeCloseTo(rec.nudo.total, 2);
  expect(sum(rec.salidas)).toBeCloseTo(rec.nudo.total, 2);
  for (const h of [...rec.entradas, ...rec.salidas]) expect(h.monto).toBeGreaterThan(0);
};
const todasVer = { todas: true, soloEmpresa: false, ubicacionId: null, tipo: "todas", nombre: "CAYLA" };

/** Una fila del Estado de resultados con lo justo; `resultado` cuadra con lo demás salvo que se diga otra cosa. */
function fila(p: Partial<FilaER> & Pick<FilaER, "unidad" | "nombre">): FilaER {
  const base = { ubicacionId: null, orden: 1, ventas: 0, costo: 0, fletes: 0, mermas: 0, planilla: 0, depreciacion: 0, gastos: 0, igvVentas: 0, detalleGastos: [], detalleMermas: [], sinCosto: 0, mermasSinCosto: 0, descuadres: 0, planillaVisible: true, planillaNota: null };
  const f = { ...base, ...p } as FilaER;
  f.margen = p.margen ?? f.ventas - f.costo - f.fletes - f.mermas;
  f.resultado = p.resultado ?? f.margen - f.gastos;
  return f;
}

describe("recorridoPlata · lo que entra es lo que sale", () => {
  it("CAYLA entera (fixture del Resumen): las tiendas entran a «Vendiste» y sale hasta «Te deja»", () => {
    const r = leerResumen(fixture.todas);
    const rec = recorridoPlata(filasDe(r), r.ver)!;
    cuadra(rec);
    expect(rec.modo).toBe("vende");
    expect(rec.nudo.nombre).toBe("Vendiste");
    expect(rec.entradas.filter((h) => h.tipo === "tienda").every((h) => h.sedeId)).toBe(true);
    const consolidado = filasDe(r).find((f) => f.unidad === "consolidado")!;
    expect(rec.resultado).toBeCloseTo(consolidado.resultado, 2);
    expect(rec.salidas.map((h) => h.tipo)).toEqual(expect.arrayContaining(["prendas", "gastos", "taller", "empresa"]));
    expect(rec.nota).toMatch(/Taller y la Empresa no venden/);
  });

  it("una tienda: solo lo suyo, sin cargarle el Taller ni la Empresa", () => {
    const r = leerResumen(fixture.tru);
    const rec = recorridoPlata(filasDe(r), r.ver)!;
    cuadra(rec);
    expect(rec.entradas.filter((h) => h.tipo === "tienda")).toHaveLength(1);
    expect(rec.salidas.some((h) => h.tipo === "taller" || h.tipo === "empresa")).toBe(false);
    expect(rec.nota).toMatch(/no se le carga/);
  });

  it("el Taller y la Empresa: se sostienen con lo que dejan las tiendas; lo mirado va encendido", () => {
    for (const clave of ["taller", "empresa"] as const) {
      const r = leerResumen(fixture[clave]);
      const rec = recorridoPlata(filasDe(r), r.ver);
      if (!rec) continue; // el fixture de esa unidad puede no traer el mes entero
      cuadra(rec);
      expect(rec.modo).toBe("sostiene");
      expect(rec.nudo.nombre).toBe("Lo que dejan las tiendas");
      const mirado = rec.salidas.find((h) => h.tipo === clave);
      if (mirado) expect(mirado.tenue).toBe(false);
    }
    const lugares = [
      fila({ unidad: "tienda", nombre: "Tienda TRU", ubicacionId: "tru", ventas: 1000, costo: 400, gastos: 200 }),
      fila({ unidad: "tienda", nombre: "Tienda LIM", ubicacionId: "lim", ventas: 0, gastos: 150 }),
      fila({ unidad: "taller", nombre: "Taller", ubicacionId: "tal", gastos: 100 }),
      fila({ unidad: "empresa", nombre: "De la empresa", gastos: 50 }),
      fila({ unidad: "consolidado", nombre: "CAYLA", resultado: 100 }),
    ];
    const rec = recorridoPlata(lugares, { todas: false, soloEmpresa: false, ubicacionId: "tal", tipo: "taller", nombre: "Taller" })!;
    cuadra(rec);
    expect(rec.entradas.map((h) => [h.nombre, h.monto])).toEqual([["Deja TRU", 400]]);
    expect(rec.salidas.map((h) => [h.nombre, h.monto, h.tenue])).toEqual([
      ["Pierde LIM", 150, true],
      ["Taller", 100, false],
      ["Empresa", 50, true],
      ["Te queda", 100, true],
    ]);
  });

  it("un mes con pérdida: el hueco entra como «Te faltan» y la cuenta cierra", () => {
    const filas = [
      fila({ unidad: "tienda", nombre: "Tienda LIM", ubicacionId: "lim", ventas: 720, costo: 218, mermas: 132, gastos: 520 }),
      fila({ unidad: "taller", nombre: "Taller", ubicacionId: "tal", gastos: 26 }),
      fila({ unidad: "empresa", nombre: "De la empresa" }),
      fila({ unidad: "consolidado", nombre: "CAYLA", resultado: -176 }),
    ];
    const rec = recorridoPlata(filas, todasVer)!;
    cuadra(rec);
    expect(rec.entradas.at(-1)).toMatchObject({ tipo: "falta", nombre: "Te faltan", monto: 176 });
    expect(rec.salidas.some((h) => h.tipo === "deja")).toBe(false);
  });

  it("las diferencias de caja van en su propio hilo: el faltante sale, el sobrante entra", () => {
    // Lo que había en local el 2026-10-23: Trujillo sin gastos, solo un sobrante de S/ 139.90.
    const sobrante = fila({ unidad: "tienda", nombre: "Tienda Trujillo", ubicacionId: "tru", ventas: 127.03, costo: 64, gastos: -139.9, detalleGastos: [{ cuenta: "6599", nombre: "Diferencias de caja", monto: -139.9 }] });
    const rec = recorridoPlata([sobrante], { todas: false, soloEmpresa: false, ubicacionId: "tru", tipo: "tienda", nombre: "Tienda Trujillo" })!;
    cuadra(rec);
    expect(rec.entradas.map((h) => h.tipo)).toEqual(["tienda", "sobrante"]);
    expect(rec.salidas.find((h) => h.tipo === "gastos")).toBeUndefined(); // sin gastos reales, no hay hilo de gastos
    expect(rec.nudo.monto).toBe(127.03); // «Vendiste» dice lo vendido, no lo vendido + el sobrante

    const faltante = fila({ unidad: "tienda", nombre: "Tienda Lima", ubicacionId: "lim", ventas: 720, costo: 218, gastos: 780, detalleGastos: [{ cuenta: "63", nombre: "Servicios", monto: 100 }, { cuenta: "6599", nombre: "Diferencias de caja", monto: 680 }] });
    const rec2 = recorridoPlata([faltante], { todas: false, soloEmpresa: false, ubicacionId: "lim", tipo: "tienda", nombre: "Tienda Lima" })!;
    cuadra(rec2);
    expect(rec2.salidas.find((h) => h.tipo === "caja")).toMatchObject({ nombre: "Faltó en caja", monto: 680 });
    expect(rec2.salidas.find((h) => h.tipo === "gastos")).toMatchObject({ monto: 100 });
  });

  it("si lo nombrado no explica el resultado de la base, la diferencia sale como «Otros ajustes»", () => {
    const f = fila({ unidad: "tienda", nombre: "Tienda AQP", ubicacionId: "aqp", ventas: 1000, costo: 400, gastos: 300, resultado: 250 });
    const rec = recorridoPlata([f], { todas: false, soloEmpresa: false, ubicacionId: "aqp", tipo: "tienda", nombre: "Tienda AQP" })!;
    cuadra(rec);
    expect(rec.salidas.find((h) => h.tipo === "ajustes")).toMatchObject({ monto: 50 });
    expect(rec.resultado).toBe(250);
  });

  it("sin filas, no hay recorrido; el porcentaje es sobre lo que pasa por el nudo", () => {
    expect(recorridoPlata([], todasVer)).toBeNull();
    // Mirando el Taller con solo su fila (lo que trae la base al elegirlo): sin las tiendas no se dibuja a medias.
    expect(recorridoPlata([fila({ unidad: "taller", nombre: "Taller", ubicacionId: "tal", gastos: 26 })], { todas: false, soloEmpresa: false, ubicacionId: "tal", tipo: "taller", nombre: "Taller" })).toBeNull();
    const rec = recorridoPlata([fila({ unidad: "tienda", nombre: "Tienda TRU", ubicacionId: "tru", ventas: 1000, costo: 500, gastos: 250 })], todasVer)!;
    expect(rec.salidas.map((h) => pctDelNudo(h, rec))).toEqual([50, 25, 25]);
  });
});
