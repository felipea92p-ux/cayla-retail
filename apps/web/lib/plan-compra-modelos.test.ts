import { describe, expect, it } from "vitest";
import {
  SIN_EDICIONES,
  calcularReparto,
  datoDelModelo,
  edicionesDeLoGuardado,
  editarColor,
  editarModelo,
  editarTalla,
  hayEdiciones,
  itemsDelReparto,
  leerModelos,
  leerPasos2,
  pctPorDefecto,
  volverALoQuePropone,
  type EntradaDelReparto,
  type LecturaModelos,
  type Reparto,
} from "./plan-compra-modelos";

const TALLAS = [
  { id: "s", valor: "S" },
  { id: "m", valor: "M" },
  { id: "l", valor: "L" },
];
const celdas = (s: number, m: number, l: number) => [
  { id: "s", vendidas: s, hay: 0 },
  { id: "m", vendidas: m, hay: 0 },
  { id: "l", vendidas: l, hay: 0 },
];
/**
 * Una categoría armada a mano. Ventas de la categoría: A 40 + B 12 + C 3 + 45 sin modelo = 100. Objetivo 100; el paso 1 decidió 60.
 *   A (marca X) vendió 40 y tiene 10: NEGRO 30/4 y BLANCO 10/6. B vendió 12 y no tiene nada: ROSA 12/0. C vendió 3 (pocas): AZUL 3/0.
 */
const lectura = (extra: Partial<LecturaModelos> = {}): LecturaModelos => ({
  categoria: { id: "cat", nombre: "Polos" },
  hoy: "2026-10-26",
  tallas: TALLAS,
  sinModelo: 45,
  modelosTotal: 3,
  modelos: [
    {
      id: "A",
      nombre: "Polo básico",
      codigo: "POL-0001",
      marca: "Pima Norte",
      vendidas: 40,
      hay: 10,
      colores: [
        { codigo: "NEG", nombre: "Negro", hex: "#000000", vendidas: 30, hay: 4, tallas: celdas(5, 20, 5) },
        { codigo: "BLA", nombre: "Blanco", hex: "#ffffff", vendidas: 10, hay: 6, tallas: [{ id: "m", vendidas: 10, hay: 6 }] },
      ],
    },
    { id: "B", nombre: "Polo cuello V", codigo: "POL-0002", marca: null, vendidas: 12, hay: 0, colores: [{ codigo: "ROS", nombre: "Rosa", hex: "#d89aa3", vendidas: 12, hay: 0, tallas: celdas(3, 6, 3) }] },
    { id: "C", nombre: "Polo rayado", codigo: "POL-0003", marca: null, vendidas: 3, hay: 0, colores: [{ codigo: "AZU", nombre: "Azul", hex: "#3f5f86", vendidas: 3, hay: 0, tallas: [{ id: "m", vendidas: 3, hay: 0 }] }] },
  ],
  coloresCategoria: [
    { codigo: "NEG", nombre: "Negro", hex: "#000000", vendidas: 30, hay: 4 },
    { codigo: "ROS", nombre: "Rosa", hex: "#d89aa3", vendidas: 12, hay: 0 },
    { codigo: "BLA", nombre: "Blanco", hex: "#ffffff", vendidas: 10, hay: 6 },
    { codigo: "AZU", nombre: "Azul", hex: "#3f5f86", vendidas: 3, hay: 0 },
  ],
  guardado: null,
  ...extra,
});
const entrada = (extra: Partial<EntradaDelReparto> = {}): EntradaDelReparto => ({ lectura: lectura(), total: 60, objetivo: 100, curva: { s: 25, m: 50, l: 25 }, dias: 26, ...extra });
const modelo = (r: Reparto, id: string) => r.modelos.find((m) => m.id === id)!;
const color = (r: Reparto, m: string, c: string) => modelo(r, m).colores.find((x) => x.codigo === c)!;
const tallasDe = (r: Reparto, m: string, c: string) => color(r, m, c).tallas.map((t) => `${t.valor}${t.unidades}`).join(" ");

describe("el reparto que propone el sistema", () => {
  it("el % de repetir sale de lo que falta de los modelos que vendieron lo suficiente contra todo lo que falta (redondeado a 5, entre 20 y 80)", () => {
    // Faltan 30 de A y 12 de B (elegibles), 3 de C (no) y 45 de lo vendido sin modelo: 42 / 90 = 46,7 % → 45.
    expect(pctPorDefecto(entrada())).toBe(45);
    // Sin lo vendido sin modelo, casi todo lo que falta es de modelos que se pueden repetir: sube al tope de 80.
    expect(pctPorDefecto(entrada({ lectura: lectura({ sinModelo: 0 }) }))).toBe(80);
    // Con casi todo sin modelo, no baja de 20.
    expect(pctPorDefecto(entrada({ lectura: lectura({ sinModelo: 5000 }) }))).toBe(20);
  });

  it("sin ningún modelo que falte no se propone repetir nada (todo va a modelos nuevos)", () => {
    // Todos tienen de sobra.
    const l = lectura();
    const sobra = { ...l, modelos: l.modelos.map((m) => ({ ...m, hay: 500 })) };
    const r = calcularReparto(entrada({ lectura: sobra }), null, SIN_EDICIONES);
    expect(r.pctPorDefecto).toBe(0);
    expect(r.hayParaRepetir).toBe(false);
    expect(r.repartido).toBe(0);
    expect(r.nuevos).toBe(60);
  });

  it("sin ventas con modelo, ningún modelo es elegible y todo va a modelos nuevos", () => {
    const r = calcularReparto(entrada({ lectura: lectura({ modelos: [], sinModelo: 80 }) }), null, SIN_EDICIONES);
    expect(r.modelos).toEqual([]);
    expect(r.nuevos).toBe(60);
    expect(r.hayParaRepetir).toBe(false);
  });

  it("reparte el % del total entre los modelos que vendieron lo suficiente, por lo que le falta a cada uno; el que vendió poco queda en 0", () => {
    const r = calcularReparto(entrada(), null, SIN_EDICIONES);
    expect(r.pct).toBe(45);
    // 60 × 45 % = 27 → A (le faltan 30) y B (le faltan 12) en proporción: 19 y 8.
    expect([modelo(r, "A").propone, modelo(r, "B").propone, modelo(r, "C").propone]).toEqual([19, 8, 0]);
    expect([modelo(r, "A").unidades, modelo(r, "B").unidades, modelo(r, "C").unidades]).toEqual([19, 8, 0]);
    expect(r.repartido).toBe(27);
    expect(r.nuevos).toBe(33);
    expect(r.sePasa).toBe(0);
  });

  it("dentro de un modelo, cada color pesa lo que vendió con cautela y se le resta lo que ya hay; las tallas suman el color", () => {
    const r = calcularReparto(entrada(), null, SIN_EDICIONES);
    expect([color(r, "A", "NEG").unidades, color(r, "A", "BLA").unidades]).toEqual([15, 4]);
    // Las tallas de A: vendió 5 · 30 · 5 y la curva del paso 1 es 25 · 50 · 25: se apoya 80 % en lo vendido.
    expect(tallasDe(r, "A", "NEG")).toBe("S2 M11 L2");
    expect(tallasDe(r, "A", "BLA")).toBe("S1 M3 L0");
    expect(tallasDe(r, "B", "ROS")).toBe("S2 M4 L2");
    for (const m of r.modelos) {
      expect(m.unidades).toBe(m.colores.reduce((s, c) => s + c.unidades, 0));
      for (const c of m.colores) expect(c.unidades).toBe(c.tallas.reduce((s, t) => s + t.unidades, 0));
    }
  });

  it("cada modelo dice cuánto dato tiene y para cuántos días le alcanza lo que hay", () => {
    expect([datoDelModelo(40), datoDelModelo(10), datoDelModelo(9), datoDelModelo(5), datoDelModelo(4)]).toEqual(["base", "base", "poco", "poco", "pocas"]);
    const r = calcularReparto(entrada(), null, SIN_EDICIONES);
    expect(modelo(r, "A").alcanza).toBe(Math.round((10 / 40) * 26)); // 7 días al ritmo de los 26 días que lleva el ERP
    expect(modelo(r, "B").alcanza).toBe(0);
    expect(modelo(r, "A").elegible).toBe(true);
    expect(modelo(r, "C").elegible).toBe(false);
    expect(modelo(r, "C").dato).toBe("pocas");
  });

  it("todo es entero y el total del paso 1 manda: lo repartido más lo que queda para modelos nuevos suma el total", () => {
    for (const total of [0, 1, 7, 60, 414, 1000]) {
      for (const pct of [null, 0, 25, 50, 100]) {
        const r = calcularReparto(entrada({ total }), pct, SIN_EDICIONES);
        expect(r.repartido + r.nuevos).toBe(total);
        for (const m of r.modelos) for (const c of m.colores) {
          expect(Number.isInteger(c.unidades)).toBe(true);
          expect(c.tallas.every((t) => Number.isInteger(t.unidades) && t.unidades >= 0)).toBe(true);
        }
      }
    }
  });

  it("con 100 % se reparte todo en modelos que vendieron (nada queda para nuevos); con 0 %, nada", () => {
    const todo = calcularReparto(entrada(), 100, SIN_EDICIONES);
    expect(todo.repartido).toBe(60);
    expect(todo.nuevos).toBe(0);
    expect(todo.guia).toBeNull();
    const nada = calcularReparto(entrada(), 0, SIN_EDICIONES);
    expect(nada.repartido).toBe(0);
    expect(nada.nuevos).toBe(60);
  });

  it("lo que queda para modelos nuevos trae una guía de colores (lo que más vende la categoría, restando lo que ya hay) y de tallas (la curva del paso 1)", () => {
    const r = calcularReparto(entrada(), null, SIN_EDICIONES);
    const g = r.guia!;
    expect(g.colores.reduce((s, c) => s + c.unidades, 0)).toBe(33);
    expect(g.tallas.reduce((s, t) => s + t.unidades, 0)).toBe(33);
    expect(g.colores[0].codigo).toBe("NEG"); // el que más vende y menos tiene de lo que le falta
    expect(g.tallas.map((t) => t.valor)).toEqual(["S", "M", "L"]);
    // 33 por la curva 25 · 50 · 25.
    expect(g.tallas.map((t) => t.unidades)).toEqual([8, 17, 8]);
  });

  it("una categoría sin tallas (accesorios) reparte hasta el color y guarda la talla vacía", () => {
    const l = lectura({ tallas: [] });
    const sinTallas = { ...l, modelos: l.modelos.map((m) => ({ ...m, colores: m.colores.map((c) => ({ ...c, tallas: [{ id: null, vendidas: c.vendidas, hay: c.hay }] })) })) };
    const r = calcularReparto(entrada({ lectura: sinTallas, curva: {} }), null, SIN_EDICIONES);
    expect(r.modelos[0].colores.every((c) => c.tallas.length === 0)).toBe(true);
    expect(r.modelos[0].unidades).toBe(19);
    const items = itemsDelReparto(r);
    expect(items.every((i) => i.t === null)).toBe(true);
    expect(items.reduce((s, i) => s + i.n, 0)).toBe(r.repartido);
  });
});

describe("lo que la persona cambia a mano", () => {
  const base = () => calcularReparto(entrada(), null, SIN_EDICIONES);

  it("cambiar las prendas de un modelo las reparte entre sus colores y sus tallas y suelta lo que había movido dentro de él", () => {
    const ed0 = editarTalla(SIN_EDICIONES, base(), "A", "NEG", "m", 3);
    expect(hayEdiciones(ed0)).toBe(true);
    const ed = editarModelo(ed0, "A", 10);
    expect(ed.tallas.size).toBe(0);
    const r = calcularReparto(entrada(), null, ed);
    expect(modelo(r, "A").unidades).toBe(10);
    expect(modelo(r, "A").editado).toBe(true);
    expect(r.repartido).toBe(10 + 8);
    expect(r.nuevos).toBe(60 - 18);
  });

  it("cambiar las prendas de un color cambia el modelo (lo suma) y el total de modelos nuevos se ajusta", () => {
    const ed = editarColor(SIN_EDICIONES, "A", "NEG", 20);
    const r = calcularReparto(entrada(), null, ed);
    expect(color(r, "A", "NEG").unidades).toBe(20);
    expect(color(r, "A", "NEG").editado).toBe(true);
    expect(color(r, "A", "BLA").unidades).toBe(4); // los demás colores no se mueven solos
    expect(modelo(r, "A").unidades).toBe(24);
    expect(r.nuevos).toBe(60 - (24 + 8));
    // Las tallas de ese color se reparten con lo mismo de siempre sobre las 20 nuevas.
    expect(color(r, "A", "NEG").tallas.reduce((s, t) => s + t.unidades, 0)).toBe(20);
  });

  it("cambiar UNA talla congela las otras como estaban y el color pasa a ser la suma: las tallas son el color", () => {
    const antes = base();
    expect(tallasDe(antes, "A", "NEG")).toBe("S2 M11 L2");
    const ed = editarTalla(SIN_EDICIONES, antes, "A", "NEG", "l", 5);
    const r = calcularReparto(entrada(), null, ed);
    expect(tallasDe(r, "A", "NEG")).toBe("S2 M11 L5");
    expect(color(r, "A", "NEG").unidades).toBe(18);
    expect(modelo(r, "A").unidades).toBe(18 + 4);
    // Un cambio a otro %, que reparte distinto el modelo, no mueve esa fila de tallas congelada.
    const otroPct = calcularReparto(entrada(), 100, ed);
    expect(tallasDe(otroPct, "A", "NEG")).toBe("S2 M11 L5");
  });

  it("«volver a lo que propone» suelta todo lo movido en un modelo y nada de los demás", () => {
    const ed1 = editarColor(editarModelo(SIN_EDICIONES, "B", 5), "A", "NEG", 20);
    const ed = volverALoQuePropone(ed1, "A");
    expect(ed.color.size).toBe(0);
    expect(ed.modelo.get("B")).toBe(5);
    const r = calcularReparto(entrada(), null, ed);
    expect(modelo(r, "A").unidades).toBe(19);
    expect(modelo(r, "A").editado).toBe(false);
    expect(modelo(r, "B").unidades).toBe(5);
  });

  it("pasarse del total del paso 1 se dice con cuánto y no deja nada para modelos nuevos", () => {
    const r = calcularReparto(entrada(), null, editarModelo(SIN_EDICIONES, "C", 60));
    expect(r.repartido).toBe(27 + 60);
    expect(r.sePasa).toBe(27);
    expect(r.nuevos).toBe(0);
    expect(r.guia).toBeNull();
  });

  it("no se puede poner un número negativo ni con decimales", () => {
    const r = calcularReparto(entrada(), null, editarModelo(SIN_EDICIONES, "A", -4));
    expect(modelo(r, "A").unidades).toBe(0);
    const r2 = calcularReparto(entrada(), null, editarColor(SIN_EDICIONES, "A", "NEG", 7.6));
    expect(color(r2, "A", "NEG").unidades).toBe(8);
  });
});

describe("guardar y volver a abrir", () => {
  it("las filas que se mandan a la base tienen modelo, color, talla y prendas, solo con prendas, y suman lo repartido", () => {
    const r = calcularReparto(entrada(), null, SIN_EDICIONES);
    const items = itemsDelReparto(r);
    expect(items.every((i) => i.n > 0)).toBe(true);
    expect(items.reduce((s, i) => s + i.n, 0)).toBe(r.repartido);
    expect(new Set(items.map((i) => `${i.p}|${i.c}|${i.t}`)).size).toBe(items.length); // ninguna celda dos veces
    expect(items.filter((i) => i.p === "A" && i.c === "NEG")).toEqual([
      { p: "A", c: "NEG", t: "s", n: 2 },
      { p: "A", c: "NEG", t: "m", n: 11 },
      { p: "A", c: "NEG", t: "l", n: 2 },
    ]);
  });

  it("lo guardado se restaura EXACTO, también lo que la persona movió y lo que dejó en 0", () => {
    const l0 = lectura();
    const ed0 = editarColor(editarModelo(SIN_EDICIONES, "B", 6), "A", "NEG", 12);
    const r0 = calcularReparto(entrada(), 50, ed0);
    const items = itemsDelReparto(r0);
    // Se guarda y se vuelve a abrir: la lectura ahora trae lo guardado.
    const l1 = lectura({ guardado: { version: 1, pct: 50, total: 60, unidades: r0.repartido, items, por: "Felipe", en: "2026-10-26T12:00:00Z" } });
    const ed1 = edicionesDeLoGuardado(l1, l1.guardado!);
    const r1 = calcularReparto(entrada({ lectura: l1 }), 50, ed1);
    expect(itemsDelReparto(r1)).toEqual(items);
    expect(r1.repartido).toBe(r0.repartido);
    // El modelo C no estaba en lo guardado: queda en 0 aunque el sistema lo proponga (o no).
    expect(modelo(r1, "C").unidades).toBe(0);
    expect(l0.guardado).toBeNull();
  });

  it("«editado» solo marca lo que se aparta de lo que propone el sistema: lo guardado que coincide con la propuesta no lleva marca", () => {
    const propuesto = calcularReparto(entrada(), null, SIN_EDICIONES);
    const items = itemsDelReparto(propuesto);
    const l1 = lectura({ guardado: { version: 1, pct: propuesto.pct, total: 60, unidades: propuesto.repartido, items, por: null, en: null } });
    const r = calcularReparto(entrada({ lectura: l1 }), propuesto.pct, edicionesDeLoGuardado(l1, l1.guardado!));
    expect(r.modelos.every((m) => !m.editado && m.colores.every((c) => !c.editado))).toBe(true);
    // Y apenas se mueve una talla, esa talla, su color y su modelo quedan marcados (y solo ellos).
    const movida = calcularReparto(entrada({ lectura: l1 }), propuesto.pct, editarTalla(edicionesDeLoGuardado(l1, l1.guardado!), r, "A", "NEG", "l", 9));
    expect(modelo(movida, "A").editado).toBe(true);
    expect(color(movida, "A", "NEG").editado).toBe(true);
    expect(color(movida, "A", "BLA").editado).toBe(false);
    expect(modelo(movida, "B").editado).toBe(false);
  });

  it("un modelo que se guardó con unos colores y no con otros restaura los otros en 0", () => {
    const items = [{ p: "A", c: "NEG", t: "m", n: 5 }];
    const l1 = lectura({ guardado: { version: 3, pct: 20, total: 60, unidades: 5, items, por: null, en: null } });
    const r = calcularReparto(entrada({ lectura: l1 }), 20, edicionesDeLoGuardado(l1, l1.guardado!));
    expect(color(r, "A", "NEG").unidades).toBe(5);
    expect(tallasDe(r, "A", "NEG")).toBe("S0 M5 L0");
    expect(color(r, "A", "BLA").unidades).toBe(0);
    expect(modelo(r, "B").unidades).toBe(0);
    expect(r.repartido).toBe(5);
    expect(r.nuevos).toBe(55);
  });
});

describe("leer lo que manda la base", () => {
  const crudo = (extra: Record<string, unknown> = {}) => ({
    soportado: true,
    entra: true,
    hoy: "2026-10-26",
    categoria: { id: "c1", nombre: "Polos" },
    tallas: [
      { id: "l", valor: "L" },
      { id: "s", valor: "S" },
      { id: "m", valor: "M" },
    ],
    sin_modelo: 4,
    modelos: [{ id: "A", nombre: "Polo", codigo: "POL-1", marca: "X", vendidas: 8, hay: 3, colores: [{ codigo: "NEG", nombre: "Negro", hex: "#000", vendidas: 8, hay: 3, tallas: [{ id: "m", vendidas: 8, hay: 3 }] }] }],
    modelos_total: 1,
    colores_categoria: [{ codigo: "NEG", nombre: "Negro", hex: "#000", vendidas: 8, hay: 3 }],
    guardado: null,
    ...extra,
  });

  it("ordena las tallas como se lee (S · M · L), toma lo que entiende y deja lo demás", () => {
    const r = leerModelos(crudo({ modelos: [...(crudo().modelos as unknown[]), { id: null, nombre: "sin id" }, 5] }));
    expect(r?.estado).toBe("lista");
    if (r?.estado !== "lista") return;
    expect(r.lectura.tallas.map((t) => t.valor)).toEqual(["S", "M", "L"]);
    expect(r.lectura.modelos).toHaveLength(1);
    expect(r.lectura.sinModelo).toBe(4);
    expect(r.lectura.guardado).toBeNull();
  });

  it("una base que todavía no sabe del paso 2 (sin la marca «soportado») o que manda algo raro no rompe nada: null", () => {
    expect(leerModelos(null)).toBeNull();
    expect(leerModelos({ entra: true })).toBeNull();
    expect(leerModelos(crudo({ hoy: null }))).toBeNull();
    expect(leerModelos("texto")).toBeNull();
  });

  it("una categoría fuera de los motores dice «fuera»", () => {
    expect(leerModelos({ soportado: true, entra: false })).toEqual({ estado: "fuera" });
  });

  it("trae lo guardado con sus filas, descartando las que no calzan", () => {
    const r = leerModelos(crudo({ guardado: { version: 2, pct: 60, total: 20, unidades: 5, items: [{ p: "A", c: "NEG", t: "m", n: 5 }, { p: "A", c: "NEG", t: "m", n: 0 }, { p: null, c: "X", t: null, n: 3 }], por: "Felipe", en: "2026-10-26T10:00:00Z" } }));
    if (r?.estado !== "lista") throw new Error("se esperaba una lectura");
    expect(r.lectura.guardado).toEqual({ version: 2, pct: 60, total: 20, unidades: 5, items: [{ p: "A", c: "NEG", t: "m", n: 5 }], por: "Felipe", en: "2026-10-26T10:00:00Z" });
  });

  it("la lista de categorías con paso 2: lo que entiende, y null si la base no lo sabe", () => {
    expect(leerPasos2({ soportado: true, repartos: [{ categoria_id: "c1", version: 2, pct: 60, total: 20, unidades: 5, por: "Felipe", en: "2026-10-26T10:00:00Z" }, { version: 1 }] })).toEqual([
      { categoriaId: "c1", version: 2, pct: 60, total: 20, unidades: 5, por: "Felipe", en: "2026-10-26T10:00:00Z" },
    ]);
    expect(leerPasos2({ repartos: [] })).toBeNull();
    expect(leerPasos2(undefined)).toBeNull();
  });
});
