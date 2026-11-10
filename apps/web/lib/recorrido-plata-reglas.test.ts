import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { leerResumen, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { FilaER } from "./resultados-reglas";
import { soles } from "./flujo-caja-reglas";
import { loQueSalio, pctDelNudo, recorridoPlata, textoPctDelNudo, vendisteYSalio, type Recorrido } from "./recorrido-plata-reglas";

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
    expect(rec.nudo.nombre).toBe("Vendiste sin IGV");
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

// Felipe 2026-11-09: lo vendido es todo lo de la tienda, con IGV y con lo de CLAURE. Cifras inventadas con las proporciones de producción (las reales no entran al repo, que es público: ADR-0609).
describe("recorridoPlata · lo vendido con IGV", () => {
  const verTienda = (id: string, nombre: string) => ({ todas: false, soloEmpresa: false, ubicacionId: id, tipo: "tienda", nombre });
  const tru = (extra: Partial<FilaER> = {}) => fila({ unidad: "tienda", nombre: "Tienda TRU", ubicacionId: "tru", ventas: 75_000, costo: 49_800, gastos: 30_000, ...extra });
  const lim = (extra: Partial<FilaER> = {}) => fila({ unidad: "tienda", nombre: "Tienda LIM", ubicacionId: "lim", ventas: 1_000, costo: 500, gastos: 300, ...extra });
  const conIgv = { igvCobrado: 13_500, claureSinIgv: 0 };
  const conClaure = { igvCobrado: 270, claureSinIgv: 500 };
  const hilo = (r: Recorrido, tipo: string) => r.salidas.find((h) => h.tipo === tipo);

  it("Trujillo: el nudo dice lo vendido con IGV y el IGV sale con su nombre; lo que te deja no cambia y no aparece «Otros ajustes»", () => {
    const rec = recorridoPlata([tru(conIgv)], verTienda("tru", "Tienda TRU"))!;
    cuadra(rec);
    expect(rec.nudo).toMatchObject({ nombre: "Vendiste con IGV", monto: 88_500 });
    expect(hilo(rec, "igv")).toMatchObject({ nombre: "IGV de tus ventas", monto: 13_500 });
    expect(hilo(rec, "claure")).toBeUndefined();
    expect(rec.resultado).toBeCloseTo(-4_800, 2);
    expect(rec.salidas.concat(rec.entradas).some((h) => h.tipo === "ajustes")).toBe(false);
  });

  it("Lima: entra todo lo de la tienda (S/ 1,770.00) y lo de CLAURE sale sin IGV, con su nombre", () => {
    const rec = recorridoPlata([lim(conClaure)], verTienda("lim", "Tienda LIM"))!;
    cuadra(rec);
    expect(rec.nudo.monto).toBe(1_770);
    expect(hilo(rec, "igv")!.monto).toBe(270);
    expect(hilo(rec, "claure")).toMatchObject({ nombre: "Prendas de CLAURE", monto: 500 });
    expect(rec.salidas.map((h) => h.tipo).slice(0, 2)).toEqual(["igv", "claure"]);
  });

  it("CAYLA entera con el IGV leído: «Otros ajustes» es el mismo con IGV que sin él", () => {
    const sedes = (a: Partial<FilaER>, b: Partial<FilaER>) => [tru(a), lim(b), fila({ unidad: "consolidado", nombre: "CAYLA", resultado: -5_000 })];
    const sin = recorridoPlata(sedes({}, {}), todasVer)!;
    const con = recorridoPlata(sedes(conIgv, conClaure), todasVer)!;
    cuadra(con);
    const ajuste = (r: Recorrido) => r.salidas.concat(r.entradas).find((h) => h.tipo === "ajustes");
    expect(ajuste(sin)).toBeDefined();
    expect(ajuste(con)).toEqual(ajuste(sin));
    expect(con.resultado).toBe(sin.resultado);
  });

  it("cada porcentaje se mide sin IGV: dice lo mismo con la lectura que sin ella, y el IGV y lo de CLAURE no llevan", () => {
    const sin = recorridoPlata([lim()], verTienda("lim", "Tienda LIM"))!;
    const con = recorridoPlata([lim(conClaure)], verTienda("lim", "Tienda LIM"))!;
    for (const tipo of ["prendas", "gastos", "deja"]) expect(pctDelNudo(hilo(con, tipo)!, con)).toBe(pctDelNudo(hilo(sin, tipo)!, sin));
    expect(pctDelNudo(hilo(con, "igv")!, con)).toBeNull();
    expect(pctDelNudo(hilo(con, "claure")!, con)).toBeNull();
  });

  it("vendiste menos lo que salió sigue dando lo que te deja, y la frase dice qué lleva adentro", () => {
    expect(vendisteYSalio(recorridoPlata([tru(conIgv)], verTienda("tru", "Tienda TRU"))!)).toBe(`Vendiste ${soles(88_500)} con IGV y salió ${soles(88_500 + 4_800)}, contando ese IGV.`);
    expect(vendisteYSalio(recorridoPlata([lim(conClaure)], verTienda("lim", "Tienda LIM"))!)).toBe(`Vendiste ${soles(1_770)} con IGV y salió ${soles(1_770 - 200)}, contando ese IGV y lo de CLAURE.`);
  });

  it("lo que entró sin ser venta no cuenta como salido: vendiste menos lo que salió sigue dando lo que te deja", () => {
    const sobra = { detalleGastos: [{ cuenta: "6599", nombre: "Diferencias de caja", monto: -20 }] } as Partial<FilaER>;
    const rec = recorridoPlata([fila({ unidad: "tienda", nombre: "Tienda LIM", ubicacionId: "lim", ventas: 1_000, costo: 400, gastos: -20, igvCobrado: 180, claureSinIgv: 0, ...sobra })], verTienda("lim", "Tienda LIM"))!;
    expect(hilo(rec, "deja")!.monto).toBe(620);
    expect(rec.nudo.monto - loQueSalio(rec)).toBe(620);
    expect(vendisteYSalio(rec)).toBe(`Vendiste ${soles(1_180)} con IGV y salió ${soles(560)}, contando ese IGV.`);
  });

  it("con pérdida, «Te faltan» no se descuenta: lo que salió pasa lo vendido justo en lo que se perdió", () => {
    const rec = recorridoPlata([tru(conIgv)], verTienda("tru", "Tienda TRU"))!;
    expect(rec.entradas.some((h) => h.tipo === "falta")).toBe(true);
    expect(rec.nudo.monto - loQueSalio(rec)).toBeCloseTo(rec.resultado, 2);
  });

  it("el centro del anillo dice sobre qué se midió el porcentaje", () => {
    expect(textoPctDelNudo(63, recorridoPlata([tru(conIgv)], verTienda("tru", "Tienda TRU"))!)).toBe("63 % de lo que salió, sin IGV");
    expect(textoPctDelNudo(40, recorridoPlata([lim(conClaure)], verTienda("lim", "Tienda LIM"))!)).toBe("40 % de lo que salió, sin IGV ni CLAURE");
    expect(textoPctDelNudo(40, recorridoPlata([lim()], verTienda("lim", "Tienda LIM"))!)).toBe("40 % de lo que salió");
  });

  it("lo de CLAURE es suyo, pero no se afirma que se le deba: el efectivo ya lo tiene Claudia", () => {
    expect(hilo(recorridoPlata([lim(conClaure)], verTienda("lim", "Tienda LIM"))!, "claure")!.detalle).not.toMatch(/se le deb/i);
  });

  it("sin la lectura del IGV todo queda sin IGV y lo dice; el Taller y la Empresa no llevan frase", () => {
    const rec = recorridoPlata([lim()], verTienda("lim", "Tienda LIM"))!;
    expect(rec.nudo).toMatchObject({ nombre: "Vendiste sin IGV", monto: 1_000 });
    expect(hilo(rec, "igv")).toBeUndefined();
    expect(vendisteYSalio(rec)).toBe(`Vendiste ${soles(1_000)} sin IGV y salió ${soles(800)}.`);
    const lugares = [tru(), fila({ unidad: "taller", nombre: "Taller", ubicacionId: "tal", gastos: 100 }), fila({ unidad: "consolidado", nombre: "CAYLA", resultado: 100 })];
    expect(vendisteYSalio(recorridoPlata(lugares, { todas: false, soloEmpresa: false, ubicacionId: "tal", tipo: "taller", nombre: "Taller" })!)).toBeNull();
  });

  it("un mes con más CLAURE devuelto que vendido no rompe la cuenta: no hay hilo negativo y el nudo lo descuenta", () => {
    const rec = recorridoPlata([lim({ igvCobrado: 100, claureSinIgv: -50 })], verTienda("lim", "Tienda LIM"))!;
    cuadra(rec);
    expect(hilo(rec, "claure")).toBeUndefined();
    expect(rec.nudo.monto).toBe(1_050);
  });
});
