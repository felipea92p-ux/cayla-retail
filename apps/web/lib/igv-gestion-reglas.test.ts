import { describe, expect, it } from "vitest";
import { AVISO_SIN_IGV, avisoDelIgv, esEstimado, filasDeGestion, leerFilasIgv, mismaBaseDeIgv, pasarAGestion, textoDelIgv, type FilaIgvGestion } from "./igv-gestion-reglas";
import type { FilaER } from "./resultados-reglas";

const r = (n: number) => Math.round(n * 100) / 100;
const TRU = "11111111-1111-1111-1111-111111111111";
const LIM = "22222222-2222-2222-2222-222222222222";

const fila = (o: Partial<FilaER>): FilaER => ({ ubicacionId: null, unidad: "consolidado", nombre: "CAYLA", ventas: 0, margen: 0, resultado: 0, planillaEstimada: 0, ...o }) as FilaER;
const igv = (o: Partial<FilaIgvGestion>): FilaIgvGestion => ({ mes: "2026-10", ubicacionId: TRU, igvTramo: 0, igvMes: 0, montoDicho: null, igvParte: null, ...o });

const COLUMNAS = [
  fila({ ventas: 113421.05, margen: 40000, resultado: -26488.05, planillaEstimada: 0 }),
  fila({ ubicacionId: TRU, unidad: "tienda", nombre: "Trujillo", ventas: 70000, margen: 25000, resultado: 5000, planillaEstimada: 0 }),
  fila({ ubicacionId: LIM, unidad: "tienda", nombre: "Lima", ventas: 43421.05, margen: 15000, resultado: 1000, planillaEstimada: 0 }),
  fila({ ubicacionId: null, unidad: "empresa", nombre: "De la empresa", ventas: 0, margen: 0, resultado: -32488.05, planillaEstimada: 0 }),
];
const DE = (filas: FilaER[], unidad: string, id: string | null = null) => filas.find((f) => f.unidad === unidad && f.ubicacionId === id)!;

describe("leerFilasIgv", () => {
  it("lee los numeric como texto y distingue 0 de nulo", () => {
    const [a, b] = leerFilasIgv([
      { mes: "2026-10-01", ubicacion_id: TRU, igv_tramo: "12.50", igv_mes: "20.00", monto_dicho: "0", igv_parte: "0.00" },
      { mes: "2026-11-01", ubicacion_id: null, igv_tramo: "5", igv_mes: "5", monto_dicho: null, igv_parte: null },
    ]);
    expect(a).toEqual({ mes: "2026-10", ubicacionId: TRU, igvTramo: 12.5, igvMes: 20, montoDicho: 0, igvParte: 0 });
    expect(b).toEqual({ mes: "2026-11", ubicacionId: null, igvTramo: 5, igvMes: 5, montoDicho: null, igvParte: null });
  });
  it("lo que no es una lista no se lee", () => expect(leerFilasIgv(null)).toEqual([]));
});

describe("filasDeGestion: un mes con el IGV dicho", () => {
  const filas = filasDeGestion(COLUMNAS, [igv({ igvTramo: 12000, igvMes: 20501.26, montoDicho: 0, igvParte: 0 }), igv({ ubicacionId: LIM, igvTramo: 8501.26, igvMes: 20501.26, montoDicho: 0, igvParte: 0 })]);

  it("octubre con 0 dicho: entra todo el IGV a las ventas y no se resta nada", () => {
    const c = DE(filas, "consolidado");
    expect(c.ventas).toBe(133922.31);
    expect(c.igvGestion).toMatchObject({ incluido: 20501.26, monto: 0, origen: "dicho", mesesSinDecir: [], parcial: false });
    expect(c.resultado).toBe(-5986.79);
    expect(c.resultadoLibro).toBe(-26488.05);
  });
  it("el margen se mueve con las ventas: lo que cuesta tener abierta la sede no cambia", () => {
    const t = DE(filas, "tienda", TRU);
    expect(t.margen - t.resultado).toBe(COLUMNAS[1]!.margen - COLUMNAS[1]!.resultado);
  });
  it("cada tienda lleva su parte; la empresa, nada", () => {
    expect(DE(filas, "tienda", LIM).ventas).toBe(51922.31);
    expect(DE(filas, "empresa").igvGestion!.origen).toBe("sin_igv");
    expect(DE(filas, "empresa").resultado).toBe(-32488.05);
  });
  it("un monto dicho se resta por la parte que trae cada sede", () => {
    const f = filasDeGestion(COLUMNAS, [igv({ igvTramo: 150, igvMes: 200, montoDicho: 100, igvParte: 75 }), igv({ ubicacionId: LIM, igvTramo: 50, igvMes: 200, montoDicho: 100, igvParte: 25 })]);
    expect(DE(f, "consolidado").igvGestion!.monto).toBe(100);
    expect(DE(f, "tienda", TRU).resultado).toBe(5000 + 150 - 75);
    expect(DE(f, "tienda", LIM).resultado).toBe(1000 + 50 - 25);
  });
});

describe("filasDeGestion: un mes sin decir", () => {
  const f = filasDeGestion(COLUMNAS, [igv({ mes: "2026-11", igvTramo: 900, igvMes: 900 })]);
  it("resta todo el IGV incluido: el resultado queda como antes, con aviso", () => {
    const c = DE(f, "consolidado");
    expect(c.ventas).toBe(114321.05);
    expect(c.resultado).toBe(-26488.05);
    expect(c.igvGestion).toMatchObject({ monto: 900, origen: "estimado", mesesSinDecir: ["2026-11"] });
    expect(avisoDelIgv(c.igvGestion, true)).toBe("El líder todavía no dijo el IGV de noviembre: se resta todo el incluido en las ventas.");
    expect(esEstimado(c.igvGestion)).toBe(true);
  });
  it("una cuenta que no ve toda CAYLA no recibe el monto: no se le dice que falta", () => {
    expect(avisoDelIgv(DE(f, "tienda", TRU).igvGestion, false)).toBe("Esta cifra resta todo el IGV incluido: lo que dijo el líder se ve solo mirando toda CAYLA.");
  });
});

describe("filasDeGestion: 0 dicho no es sin dato", () => {
  it("con 0 no se resta; sin dato, se resta todo", () => {
    const dicho = filasDeGestion([fila({})], [igv({ igvTramo: 100, igvMes: 100, montoDicho: 0, igvParte: 0 })])[0]!;
    const sinDato = filasDeGestion([fila({})], [igv({ igvTramo: 100, igvMes: 100 })])[0]!;
    expect(dicho.resultado).toBe(100);
    expect(sinDato.resultado).toBe(0);
  });
});

describe("filasDeGestion: un mes a medias", () => {
  it("toma la parte que viene de la base y lo dice", () => {
    const f = filasDeGestion([fila({ resultado: 500 })], [igv({ igvTramo: 300, igvMes: 1000, montoDicho: 200, igvParte: 60 })])[0]!;
    expect(f.igvGestion).toMatchObject({ incluido: 300, monto: 60, origen: "dicho", parcial: true });
    expect(f.resultado).toBe(740);
    expect(textoDelIgv(f.igvGestion!)).toBe("Lo dijo el líder. Estas fechas llevan su parte del mes.");
  });
  it("una sede sola no confunde su parte con un mes a medias", () => {
    const f = filasDeGestion(COLUMNAS, [igv({ igvTramo: 150, igvMes: 200, montoDicho: 100, igvParte: 75 }), igv({ ubicacionId: LIM, igvTramo: 50, igvMes: 200, montoDicho: 100, igvParte: 25 })]);
    expect(DE(f, "tienda", TRU).igvGestion!.parcial).toBe(false);
  });
});

describe("filasDeGestion: varios meses", () => {
  const rango = [igv({ mes: "2026-09", igvTramo: 100, igvMes: 100, montoDicho: 40, igvParte: 40 }), igv({ mes: "2026-10", igvTramo: 200, igvMes: 200 }), igv({ mes: "2026-11", igvTramo: 300, igvMes: 300 })];
  const f = filasDeGestion([fila({})], rango)[0]!;
  it("suma mes a mes y lista lo que falta", () => {
    expect(f.igvGestion).toMatchObject({ incluido: 600, monto: 540, origen: "mixto", mesesSinDecir: ["2026-10", "2026-11"] });
    expect(f.resultado).toBe(60);
  });
  it("lo dice en palabras", () => {
    expect(textoDelIgv(f.igvGestion!)).toBe("En parte estimado: el líder todavía no dijo el IGV de octubre y noviembre, así que se resta todo el de ese período.");
    expect(avisoDelIgv(f.igvGestion, true)).toContain("octubre y noviembre");
  });
  it("un mes sin decir y sin IGV en estas fechas no falta", () => {
    const g = filasDeGestion([fila({})], [igv({ igvTramo: 0, igvMes: 500 })])[0]!;
    expect(g.igvGestion).toMatchObject({ origen: "sin_igv", mesesSinDecir: [] });
    expect(avisoDelIgv(g.igvGestion, true)).toBeNull();
  });
});

describe("filasDeGestion: una sede con IGV negativo", () => {
  it("devuelve más de lo que vendió: su parte también resta en negativo", () => {
    const f = filasDeGestion(COLUMNAS, [igv({ igvTramo: 18, igvMes: 9, montoDicho: 9, igvParte: 18 }), igv({ ubicacionId: LIM, igvTramo: -9, igvMes: 9, montoDicho: 9, igvParte: -9 })]);
    expect(DE(f, "tienda", LIM).igvGestion).toMatchObject({ incluido: -9, monto: -9 });
    expect(DE(f, "tienda", LIM).resultado).toBe(1000);
    expect(DE(f, "consolidado").igvGestion).toMatchObject({ incluido: 9, monto: 9 });
  });
  it("sin decir, se resta lo que trae, con su signo", () => {
    const f = filasDeGestion(COLUMNAS, [igv({ ubicacionId: LIM, igvTramo: -9, igvMes: -9 })]);
    expect(DE(f, "tienda", LIM).igvGestion!.monto).toBe(-9);
    expect(DE(f, "tienda", LIM).resultado).toBe(1000);
  });
  it("lo dicho de un mes sin IGV positivo cae en «De la empresa»", () => {
    const f = filasDeGestion(COLUMNAS, [igv({ ubicacionId: null, igvTramo: 0, igvMes: 0, montoDicho: 50, igvParte: 50 })]);
    expect(DE(f, "empresa").resultado).toBe(-32488.05 - 50);
    expect(DE(f, "consolidado").resultado).toBe(-26488.05 - 50);
  });
});

describe("el libro", () => {
  it("devuelve los sueldos estimados y quita lo de gestión", () => {
    const f = filasDeGestion([fila({ resultado: -1000, planillaEstimada: 300 })], [igv({ igvTramo: 400, igvMes: 400, montoDicho: 0, igvParte: 0 })])[0]!;
    expect(f.resultado).toBe(-600);
    expect(f.resultadoLibro).toBe(-700);
    expect(r(f.resultado - f.igvGestion!.incluido + f.igvGestion!.monto + f.planillaEstimada)).toBe(f.resultadoLibro);
  });
  it("una fila que no pasó por aquí sigue siendo la del libro", () => {
    const f = fila({ resultado: 5 });
    expect(f.igvGestion).toBeUndefined();
    expect(avisoDelIgv(f.igvGestion, true)).toBeNull();
  });
});

describe("mismaBaseDeIgv", () => {
  const de = (origen: "dicho" | "estimado") => ({ igvGestion: { incluido: 1, monto: 1, origen, mesesSinDecir: [], parcial: false } });
  it("compara solo lo que restó su IGV de la misma forma", () => {
    expect(mismaBaseDeIgv(de("dicho"), de("dicho"))).toBe(true);
    expect(mismaBaseDeIgv(de("dicho"), de("estimado"))).toBe(false);
    expect(mismaBaseDeIgv(de("dicho"), null)).toBe(false);
    expect(mismaBaseDeIgv({}, {})).toBe(true);
  });
});

describe("pasarAGestion: todas las columnas o ninguna", () => {
  const lectura = (ventas: number) => ({ datos: [fila({ ventas })], falla: null });
  const leido = { datos: [igv({ igvTramo: 18, igvMes: 18 })], falla: null };

  it("con todo leído, todas pasan", () => {
    const r = pasarAGestion([lectura(100), lectura(200)], [leido, leido]);
    expect(r.falla).toBeNull();
    expect(r.lecturas.map((l) => l.datos[0]!.ventas)).toEqual([118, 218]);
  });
  it("si falla una, ninguna pasa y se dice", () => {
    const r = pasarAGestion([lectura(100), lectura(200)], [leido, { datos: [], falla: "se cayó" }]);
    expect(r.falla).toBe(AVISO_SIN_IGV);
    expect(r.lecturas.map((l) => l.datos[0]!.ventas)).toEqual([100, 200]);
    expect(r.lecturas[0]!.datos[0]!.igvGestion).toBeUndefined();
  });
  it("una lectura que ya había fallado se queda como está", () => {
    const rota = { datos: [], falla: "sin leer" };
    expect(pasarAGestion([rota], [null]).lecturas[0]).toBe(rota);
  });
});
