import { describe, expect, it } from "vitest";
import type { SedeTelar } from "./finanzas-telar-reglas";
import { solesRedondo } from "./gastos-reglas";
import { chipDelMesAnterior, desgloseDe, etiquetaCambio, fraseDeLosHilos, hilosDeGastos, mesAEstaAltura, mesesDeAntes, mesPrevio, parteDeLoGastado, resumenDelDesglose, seCompara, type MesPrevio } from "./gastos-hilos-reglas";

const SEDES: SedeTelar[] = [
  { clave: "t", nombre: "Trujillo", color: "tru" },
  { clave: "l", nombre: "Lima", color: "lim" },
  { clave: "empresa", nombre: "Empresa", color: "emp" },
];

let siguiente = 0;
const g = (categoria: string, ubicacionId: string | null, montoTotal: number, extra: Partial<{ fecha: string; estado: "vigente" | "anulado"; descripcion: string }> = {}) => ({
  id: `g${++siguiente}`,
  categoria,
  categoriaNombre: categoria[0]!.toUpperCase() + categoria.slice(1),
  ubicacionId,
  montoTotal,
  estado: extra.estado ?? ("vigente" as const),
  fecha: extra.fecha ?? "2026-10-10",
  descripcion: extra.descripcion ?? `Gasto de ${categoria}`,
  proveedorNombre: null,
});
const mes = (m: string, porCategoria: Record<string, number>): MesPrevio => ({ mes: m, porCategoria: Object.entries(porCategoria).map(([categoria, monto]) => ({ categoria, monto })) });

const OCTUBRE = [
  g("luz", "l", 300),
  g("luz", "t", 100),
  g("luz", null, 50),
  g("software", "t", 900),
  g("software", "t", 100, { estado: "anulado" }),
  g("agua", "l", 50),
  g("agua", "l", 0),
];

describe("los meses de antes", () => {
  it("son los cinco anteriores al que se mira, del más viejo al anterior, cruzando el año", () => {
    expect(mesesDeAntes("2026-10")).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(mesesDeAntes("2026-02", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("un mes anterior al inicio de Finanzas no se compara (ni se pide); sin corte, todos", () => {
    expect([seCompara("2026-09", "2026-10-01"), seCompara("2026-10", "2026-10-01"), seCompara("2026-09", null)]).toEqual([false, true, true]);
  });

  it("un mes que no se pudo leer, o sin un solo gasto (no se registró), queda sin comparar", () => {
    expect(mesPrevio("2026-09", { porCategoria: [{ categoria: "luz", monto: 10 }] })).toEqual({ mes: "2026-09", porCategoria: [{ categoria: "luz", monto: 10 }] });
    expect(mesPrevio("2026-09", null)).toBeNull();
    expect(mesPrevio("2026-09", { porCategoria: [] })).toBeNull();
    expect(mesPrevio("2026-09", { porCategoria: [{ categoria: "luz", monto: 0 }] })).toBeNull();
  });
});

describe("las filas de «En qué se va»", () => {
  it("una por categoría, de la que más gastó a la que menos, sin anulados ni montos en cero", () => {
    const f = hilosDeGastos(OCTUBRE, SEDES, []);
    expect(f.map((x) => [x.categoria, x.total, x.n, x.pct])).toEqual([
      ["software", 900, 1, 64],
      ["luz", 450, 3, 32],
      ["agua", 50, 1, 4],
    ]);
  });

  it("el hilo va en el orden del telar, con lo que puso cada sede, cuántos gastos y su parte", () => {
    const luz = hilosDeGastos(OCTUBRE, SEDES, []).find((x) => x.categoria === "luz")!;
    expect(luz.tramos).toEqual([
      { clave: "t", nombre: "Trujillo", color: "tru", monto: 100, n: 1, pct: 22 },
      { clave: "l", nombre: "Lima", color: "lim", monto: 300, n: 1, pct: 67 },
      { clave: "empresa", nombre: "Empresa", color: "emp", monto: 50, n: 1, pct: 11 },
    ]);
  });

  it("una sede que no está en la barra no se pierde: va al final como «Otra sede» (y la empresa, con su color)", () => {
    const f = hilosDeGastos([g("luz", "x", 10), g("luz", null, 10), g("luz", "t", 10)], SEDES.slice(0, 2), []);
    expect(f[0]!.tramos.map((t) => [t.nombre, t.color])).toEqual([["Trujillo", "tru"], ["Empresa", "emp"], ["Otra sede", "otra"]]);
  });

  it("sin el mes anterior (no se leyó o es antes de Finanzas) no compara: ni «nuevo» ni «subió»", () => {
    for (const previos of [[], [null], [mes("2026-08", { luz: 400 }), null]]) {
      const luz = hilosDeGastos(OCTUBRE, SEDES, previos).find((x) => x.categoria === "luz")!;
      expect([luz.anterior, luz.cambio]).toEqual([null, null]);
    }
  });

  it("contra el mes anterior: sube, baja, igual (menos de 2 %) o nuevo (ese mes no tuvo nada)", () => {
    const f = hilosDeGastos(OCTUBRE, SEDES, [mes("2026-09", { software: 1000, luz: 445, otra: 99 })]);
    const de = (c: string) => f.find((x) => x.categoria === c)!;
    expect(de("software").cambio).toEqual({ tipo: "baja", pct: 10 });
    expect(de("luz").cambio).toEqual({ tipo: "igual", pct: 0 });
    expect(de("agua")).toMatchObject({ anterior: 0, cambio: { tipo: "nuevo", pct: 0 } });
    expect(hilosDeGastos([g("luz", "l", 150)], SEDES, [mes("2026-09", { luz: 100 })])[0]!.cambio).toEqual({ tipo: "sube", pct: 50 });
  });

  it("la línea usa solo los meses seguidos hasta este: un hueco la corta, y con menos de tres puntos no se dibuja", () => {
    const previos = [mes("2026-06", { luz: 1 }), null, mes("2026-08", { luz: 200 }), mes("2026-09", { luz: 300 })];
    expect(hilosDeGastos([g("luz", "l", 400)], SEDES, previos)[0]!.historia).toEqual([200, 300, 400]);
    expect(hilosDeGastos([g("luz", "l", 400)], SEDES, [null, mes("2026-09", { luz: 300 })])[0]!.historia).toBeNull();
    expect(hilosDeGastos([g("luz", "l", 400)], SEDES, [mes("2026-08", {}), mes("2026-09", { luz: 300 })])[0]!.historia).toEqual([0, 300, 400]);
  });
});

describe("cómo se dice el cambio", () => {
  it("la píldora: más gasto en ámbar, menos en verde, lo demás en pizarra", () => {
    expect(etiquetaCambio({ tipo: "sube", pct: 29 })).toEqual({ texto: "▲ 29 %", tono: "ambar" });
    expect(etiquetaCambio({ tipo: "baja", pct: 5 })).toEqual({ texto: "▼ 5 %", tono: "verde" });
    expect(etiquetaCambio({ tipo: "igual", pct: 0 })).toEqual({ texto: "igual", tono: "pizarra" });
    expect(etiquetaCambio({ tipo: "nuevo", pct: 0 })).toEqual({ texto: "nuevo", tono: "pizarra" });
  });

  it("la frase nombra lo que más subió y lo que más bajó, entre las categorías que pesan", () => {
    // Agua sube 400 % pero es el 1 % del mes: no es la noticia.
    const f = hilosDeGastos([g("software", "t", 800), g("luz", "l", 1300), g("agua", "l", 25)], SEDES, [mes("2026-09", { software: 1000, luz: 1000, agua: 5 })]);
    expect(fraseDeLosHilos(f, "septiembre")).toBe("Contra septiembre, entre lo que más pesa, lo que más subió fue luz (+30\u00a0%); lo que más bajó, software (−20\u00a0%).");
  });

  it("si solo hubo subidas dice solo eso; sin mes anterior o sin movimiento, nada", () => {
    const sube = hilosDeGastos([g("luz", "l", 120)], SEDES, [mes("2026-09", { luz: 100 })]);
    expect(fraseDeLosHilos(sube, "septiembre")).toBe("Contra septiembre, entre lo que más pesa, lo que más subió fue luz (+20\u00a0%).");
    expect(fraseDeLosHilos(hilosDeGastos([g("luz", "l", 120)], SEDES, []), "septiembre")).toBeNull();
    expect(fraseDeLosHilos(hilosDeGastos([g("luz", "l", 101)], SEDES, [mes("2026-09", { luz: 100 })]), "septiembre")).toBeNull();
  });

  it("el chip de la cifra grande compara el mes entero, y calla si no hay mes anterior que leer", () => {
    expect(chipDelMesAnterior(1070, mes("2026-09", { a: 600, b: 400 }), "septiembre")).toEqual({ texto: "▲ 7 % vs septiembre", tono: "ambar" });
    expect(chipDelMesAnterior(900, mes("2026-09", { a: 1000 }), "septiembre")).toEqual({ texto: "▼ 10 % vs septiembre", tono: "verde" });
    expect(chipDelMesAnterior(1001, mes("2026-09", { a: 1000 }), "septiembre")).toEqual({ texto: "Igual que septiembre", tono: "pizarra" });
    expect(chipDelMesAnterior(500, mes("2026-09", {}), "septiembre")).toBeNull();
    expect(chipDelMesAnterior(500, null, "septiembre")).toBeNull();
  });
});

describe("en el mes en curso, contra el anterior a la misma altura (/formidable 2026-10-30)", () => {
  // Septiembre: transporte poco al principio y mucho al final; el 10 de octubre, contra el mes entero, todo parecería «▼».
  const SEPTIEMBRE = [
    g("transporte", "t", 241, { fecha: "2026-09-08" }),
    g("transporte", "t", 613, { fecha: "2026-09-25" }),
    g("alquileres", "t", 5400, { fecha: "2026-09-03" }),
    g("suministros", "t", 1000, { fecha: "2026-09-28" }),
    g("luz", "t", 80, { fecha: "2026-09-12", estado: "anulado" }),
  ];
  const OCTUBRE_AL_10 = [g("transporte", "t", 421, { fecha: "2026-10-09" }), g("alquileres", "t", 5400, { fecha: "2026-10-03" })];

  it("suma lo del mes anterior hasta el mismo día, sin anulados; un mes más corto, hasta su último día", () => {
    expect(mesAEstaAltura(SEPTIEMBRE, 10)).toEqual({ mes: "2026-09", porCategoria: [{ categoria: "transporte", monto: 241 }, { categoria: "alquileres", monto: 5400 }] });
    expect(mesAEstaAltura([g("luz", "t", 30, { fecha: "2026-02-28" })], 31)!.porCategoria).toEqual([{ categoria: "luz", monto: 30 }]);
  });

  it("sin la lista del mes anterior, o si a esa altura no había gastado nada, no compara", () => {
    expect([mesAEstaAltura(null, 10), mesAEstaAltura([], 10), mesAEstaAltura([g("luz", "t", 30, { fecha: "2026-09-20" })], 10)]).toEqual([null, null, null]);
  });

  it("el chip, la píldora y la frase dicen lo mismo que «Cuándo»: transporte subió, y lo dicen «a esta altura»", () => {
    const contra = mesAEstaAltura(SEPTIEMBRE, 10);
    const filas = hilosDeGastos(OCTUBRE_AL_10, SEDES, [mesPrevio("2026-09", { porCategoria: [{ categoria: "transporte", monto: 854 }, { categoria: "alquileres", monto: 5400 }, { categoria: "suministros", monto: 1000 }] })], { contra, enCurso: true });
    expect(filas.find((f) => f.categoria === "transporte")).toMatchObject({ anterior: 241, cambio: { tipo: "sube", pct: 75 } });
    expect(chipDelMesAnterior(5821, contra, "septiembre", true)).toEqual({ texto: "▲ 3 % vs septiembre a esta altura", tono: "ambar" });
    expect(fraseDeLosHilos(filas, "septiembre", true)).toBe("Contra septiembre a esta altura, entre lo que más pesa, lo que más subió fue transporte (+75\u00a0%).");
  });

  it("en el mes en curso la línea de meses llega hasta el anterior (el mes a medias siempre bajaría); hacen falta tres meses", () => {
    const previos = [mes("2026-07", { luz: 100 }), mes("2026-08", { luz: 200 }), mes("2026-09", { luz: 300 })];
    expect(hilosDeGastos([g("luz", "l", 40)], SEDES, previos, { enCurso: true })[0]!.historia).toEqual([100, 200, 300]);
    expect(hilosDeGastos([g("luz", "l", 40)], SEDES, previos.slice(1), { enCurso: true })[0]!.historia).toBeNull();
    expect(hilosDeGastos([g("luz", "l", 400)], SEDES, previos)[0]!.historia).toEqual([100, 200, 300, 400]);
  });

  it("una categoría que redondea a cero dice «menos de 1 %»", () => {
    expect([parteDeLoGastado({ pct: 0, total: 53 }), parteDeLoGastado({ pct: 22, total: 2407 })]).toEqual(["menos de 1 % de lo gastado", "22 % de lo gastado"]);
  });
});

describe("el desglose de una categoría", () => {
  const LISTA = [
    g("luz", "l", 300, { fecha: "2026-10-03", descripcion: "Recibo de octubre" }),
    g("luz", "t", 300, { fecha: "2026-10-20", descripcion: "Recibo Trujillo" }),
    g("luz", null, 50, { descripcion: "Luz de la oficina" }),
    g("luz", "l", 80, { estado: "anulado" }),
    g("agua", "l", 40),
  ];

  it("todos los gastos de la categoría, del más grande al más chico; a igual monto, el más reciente primero", () => {
    expect(desgloseDe(LISTA, "luz", null).map((x) => [x.descripcion, x.clave, x.monto])).toEqual([
      ["Recibo Trujillo", "t", 300],
      ["Recibo de octubre", "l", 300],
      ["Luz de la oficina", "empresa", 50],
    ]);
  });

  it("con una sede elegida, solo los de esa sede (la empresa también se elige)", () => {
    expect(desgloseDe(LISTA, "luz", "l").map((x) => x.descripcion)).toEqual(["Recibo de octubre"]);
    expect(desgloseDe(LISTA, "luz", "empresa").map((x) => x.descripcion)).toEqual(["Luz de la oficina"]);
    expect(desgloseDe(LISTA, "luz", "x")).toEqual([]);
  });

  it("la línea de arriba: todas las sedes, una elegida o todo de una sola", () => {
    const luz = hilosDeGastos(LISTA, SEDES, []).find((x) => x.categoria === "luz")!;
    expect(resumenDelDesglose(luz, null)).toEqual({ fuerte: "3 gastos", resto: ` en 3 sedes · ${solesRedondo(650)}` });
    expect(resumenDelDesglose(luz, "l")).toEqual({ fuerte: "En Lima", resto: `: 1 gasto · ${solesRedondo(300)} · el 46 % de esta categoría` });
    const agua = hilosDeGastos(LISTA, SEDES, []).find((x) => x.categoria === "agua")!;
    expect(resumenDelDesglose(agua, null)).toEqual({ fuerte: "Todo en Lima", resto: `: 1 gasto · ${solesRedondo(40)}` });
    expect(resumenDelDesglose(agua, "l")).toEqual({ fuerte: "Todo en Lima", resto: `: 1 gasto · ${solesRedondo(40)}` });
  });
});
