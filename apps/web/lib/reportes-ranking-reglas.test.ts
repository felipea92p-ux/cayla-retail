import { describe, expect, it } from "vitest";
import {
  cambioDeFila,
  cifrasDeRanking,
  diasQueAlcanza,
  filtrosDeUrl,
  hayFiltros,
  hrefRanking,
  largoDeBarra,
  leerRanking,
  ordenarTallas,
  parteDeFila,
  periodoDe,
  sePuedeComparar,
  situacionDeStock,
  textoDeDias,
  totalDePaginas,
  type FiltrosRanking,
  type Ranking,
} from "./reportes-ranking-reglas";

const HOY = "2026-11-03";
const ID = "22222222-2222-4222-8222-000000000001";
const F = (cambios: Partial<FiltrosRanking> = {}): FiltrosRanking => ({ ...filtrosDeUrl({}), ...cambios });

describe("filtrosDeUrl: la URL nunca pide algo que la base rechazaría", () => {
  it("sin nada en la URL: 30 días, por modelo, por unidades, primera página", () => {
    expect(filtrosDeUrl({})).toEqual({ rango: "30", mes: null, desde: null, hasta: null, tienda: null, categoria: null, marca: null, talla: null, color: null, q: "", nivel: "modelo", orden: "unidades", pagina: 0 });
  });

  it("lee lo que sí vale", () => {
    const f = filtrosDeUrl({ rango: "mes", m: "2026-10", tienda: ID.toUpperCase(), cat: ID, marca: ID, talla: ID, color: "AZUL-1", q: "  blusa  ", nivel: "variante", orden: "soles", pag: "2" });
    expect(f).toMatchObject({ rango: "mes", mes: "2026-10", tienda: ID, categoria: ID, marca: ID, talla: ID, color: "AZUL-1", q: "blusa", nivel: "variante", orden: "soles", pagina: 2 });
  });

  it.each([
    [{ rango: "365" }, "30"],
    [{ rango: ["90", "7"] }, "90"],
    [{ rango: "; drop table" }, "30"],
  ])("un rango que no es de la lista vuelve a 30 días: %j", (sp, esperado) => {
    expect(filtrosDeUrl(sp as Record<string, string | string[]>).rango).toBe(esperado);
  });

  it("un id que no es uuid, un color con basura, un nivel u orden raros y una página rota se descartan", () => {
    const f = filtrosDeUrl({ tienda: "todas", cat: "1; drop", marca: "x", talla: "", color: "a b; c", nivel: "margen", orden: "costo", pag: "-3" });
    expect(f).toMatchObject({ tienda: null, categoria: null, marca: null, talla: null, color: null, nivel: "modelo", orden: "unidades", pagina: 0 });
    expect(filtrosDeUrl({ pag: "1.5" }).pagina).toBe(0);
    expect(filtrosDeUrl({ pag: "abc" }).pagina).toBe(0);
    expect(filtrosDeUrl({ pag: "99999" }).pagina).toBe(0);
  });

  it("la búsqueda se recorta y no pasa de 80 letras; una fecha que no existe se descarta", () => {
    expect(filtrosDeUrl({ q: "x".repeat(200) }).q).toHaveLength(80);
    const f = filtrosDeUrl({ rango: "fechas", desde: "2026-02-30", hasta: "2026-13-01" });
    expect([f.desde, f.hasta]).toEqual([null, null]);
  });

  it("hay filtros si hay tienda, categoría, marca, talla, color o búsqueda (el período y la forma no lo son)", () => {
    expect(hayFiltros(F())).toBe(false);
    expect(hayFiltros(F({ nivel: "variante", orden: "soles", rango: "90" }))).toBe(false);
    for (const c of [{ tienda: ID }, { categoria: ID }, { marca: ID }, { talla: ID }, { color: "x" }, { q: "a" }]) expect(hayFiltros(F(c))).toBe(true);
  });
});

describe("periodoDe", () => {
  it("7, 30 y 90 días terminan hoy (hoy incluido)", () => {
    expect(periodoDe(F({ rango: "30" }), HOY)).toEqual({ rango: "30", desde: "2026-10-05", hasta: "2026-11-04", dias: 30, etiqueta: "Últimos 30 días" });
    expect(periodoDe(F({ rango: "7" }), HOY)).toMatchObject({ desde: "2026-10-28", hasta: "2026-11-04", dias: 7 });
    expect(periodoDe(F({ rango: "90" }), HOY)).toMatchObject({ desde: "2026-08-06", dias: 90 });
  });

  it("un mes cerrado es el mes entero; el de hoy, a la fecha; uno futuro vuelve al de hoy", () => {
    expect(periodoDe(F({ rango: "mes", mes: "2026-10" }), HOY)).toEqual({ rango: "mes", desde: "2026-10-01", hasta: "2026-11-01", dias: 31, etiqueta: "Octubre 2026" });
    expect(periodoDe(F({ rango: "mes", mes: "2026-11" }), HOY)).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-04", dias: 3, etiqueta: "Noviembre 2026" });
    expect(periodoDe(F({ rango: "mes", mes: "2027-02" }), HOY)).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-04", etiqueta: "Noviembre 2026" });
    expect(periodoDe(F({ rango: "mes", mes: null }), HOY)).toMatchObject({ desde: "2026-11-01" });
    expect(periodoDe(F({ rango: "mes", mes: "2026-12" }), "2026-12-31")).toMatchObject({ hasta: "2027-01-01", dias: 31 });
  });

  it("fechas propias: el último día se incluye; si no valen, se miden los últimos 30 días", () => {
    expect(periodoDe(F({ rango: "fechas", desde: "2026-10-03", hasta: "2026-10-18" }), HOY)).toEqual({ rango: "fechas", desde: "2026-10-03", hasta: "2026-10-19", dias: 16, etiqueta: "Del 3 de octubre al 18 de octubre" });
    expect(periodoDe(F({ rango: "fechas", desde: "2026-10-03", hasta: "2026-10-03" }), HOY)).toMatchObject({ dias: 1, etiqueta: "El 3 de octubre" });
    for (const malas of [
      { desde: null, hasta: null },
      { desde: "2026-10-18", hasta: "2026-10-03" }, // al revés
      { desde: "2026-10-03", hasta: "2026-11-10" }, // en el futuro
      { desde: "2024-01-01", hasta: "2026-11-03" }, // más de 400 días
    ])
      expect(periodoDe(F({ rango: "fechas", ...malas }), HOY)).toMatchObject({ rango: "30", dias: 30 });
  });
});

describe("hrefRanking", () => {
  it("sin nada es la ruta limpia; solo escribe lo que no vale lo de siempre", () => {
    expect(hrefRanking(F())).toBe("/vender/reportes/ranking");
    expect(hrefRanking(F({ rango: "90", nivel: "variante", orden: "soles", pagina: 2 }))).toBe("/vender/reportes/ranking?rango=90&nivel=variante&orden=soles&pag=2");
  });

  it("el mes y las fechas solo viajan con su rango", () => {
    expect(hrefRanking(F({ rango: "mes", mes: "2026-10" }))).toBe("/vender/reportes/ranking?rango=mes&m=2026-10");
    expect(hrefRanking(F({ rango: "30", mes: "2026-10", desde: "2026-01-01" }))).toBe("/vender/reportes/ranking");
    expect(hrefRanking(F({ rango: "fechas", desde: "2026-10-03", hasta: "2026-10-18" }))).toBe("/vender/reportes/ranking?rango=fechas&desde=2026-10-03&hasta=2026-10-18");
  });

  it("los cambios se aplican sobre los filtros y ida y vuelta no pierde nada", () => {
    const f = F({ tienda: ID, q: "blusa roja", color: "VINO" });
    const href = hrefRanking(f, { categoria: ID, pagina: 3 });
    const vuelta = filtrosDeUrl(Object.fromEntries(new URL(`http://x${href}`).searchParams));
    expect(vuelta).toMatchObject({ tienda: ID, categoria: ID, q: "blusa roja", color: "VINO", pagina: 3 });
  });
});

const BASE = {
  desde: "2026-10-01",
  hasta: "2026-11-01",
  anterior: { desde: "2026-09-01", hasta: "2026-10-01" },
  total: { unidades: 11, vendido: 730 },
  total_periodo: { unidades: 100, vendido: 7000 },
  sin_registrar: { unidades: 40, vendido: 3000 },
  primera_venta: "2026-08-20",
  cuantos: 3,
  primeros_diez: { unidades: 11, vendido: 730 },
  mayor: { unidades: 5, vendido: 250 },
  filas: [
    { pos: 1, producto_id: "p1", nombre: "Blusa Emma", codigo: "BLU-0001", categoria: "Camisas y Blusas", categoria_prefijo: "BLU", categoria_familia: "indumentaria", marca: "Aluna", color_nombre: null, color_hex: "#7a2e2a", talla: null, unidades: 5, vendido: "250.00", unidades_ant: 2, vendido_ant: 100, stock: 12 },
    { pos: 2, producto_id: "p2", nombre: "Falda Inti", unidades: 5, vendido: 180, unidades_ant: 0, vendido_ant: 0, stock: 0 },
  ],
  tallas: [{ talla: "M", unidades: 7 }, { talla: "S", unidades: 4 }],
  colores: [{ codigo: "VINO", nombre: "Vino", hex: "#7a2e2a", unidades: 8 }],
};
const ranking = (cambios: Partial<Ranking> = {}): Ranking => ({ ...leerRanking(BASE)!, ...cambios });

describe("leerRanking: no deja pasar un dato roto", () => {
  it("lee lo que manda la base", () => {
    const r = leerRanking(BASE)!;
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({ nombre: "Blusa Emma", vendido: 250, unidadesAnt: 2, stock: 12, colorHex: "#7a2e2a", categoriaPrefijo: "BLU" });
    expect(r.sinRegistrar).toEqual({ unidades: 40, vendido: 3000 });
    expect(r.primeraVenta).toBe("2026-08-20");
  });

  it("descarta una fila sin nombre o sin id, y un número que no es número vale 0", () => {
    const r = leerRanking({ ...BASE, filas: [{ producto_id: "x" }, { nombre: "sin id" }, null, { producto_id: "p", nombre: "Ok", unidades: "abc", stock: null }] })!;
    expect(r.filas).toEqual([expect.objectContaining({ nombre: "Ok", unidades: 0, stock: 0 })]);
  });

  it.each([null, undefined, 3, [], {}, { ...BASE, anterior: null }, { ...BASE, desde: "octubre" }])("una forma rota da null: %j", (roto) => {
    expect(leerRanking(roto)).toBeNull();
  });

  it("las listas que no son listas quedan vacías", () => {
    const r = leerRanking({ ...BASE, filas: "x", tallas: null, colores: 5 })!;
    expect([r.filas, r.tallas, r.colores]).toEqual([[], [], []]);
  });
});

describe("las cuentas de cada fila", () => {
  const r = ranking();

  it("se compara solo si el período anterior empieza después de la primera venta", () => {
    expect(sePuedeComparar(r)).toBe(true);
    expect(sePuedeComparar(ranking({ primeraVenta: "2026-09-30" }))).toBe(false); // el ERP empezó dentro del período anterior
    expect(sePuedeComparar(ranking({ primeraVenta: null }))).toBe(false);
    expect(sePuedeComparar(ranking({ primeraVenta: "2026-09-01" }))).toBe(true);
  });

  it("el cambio es de lo que se ordena (prendas o soles) y null donde no hay con qué comparar", () => {
    const [a, b] = r.filas as [Ranking["filas"][number], Ranking["filas"][number]];
    expect(cambioDeFila(a, "unidades", r)).toBeCloseTo(1.5);
    expect(cambioDeFila(a, "soles", r)).toBeCloseTo(1.5);
    expect(cambioDeFila(b, "unidades", r)).toBeNull(); // no vendió nada antes
    expect(cambioDeFila(a, "unidades", ranking({ primeraVenta: "2026-09-30" }))).toBeNull(); // mes a medias
  });

  it("la parte de cada fila es de todo lo registrado en el período, no solo de lo filtrado", () => {
    expect(parteDeFila(r.filas[0]!, "unidades", r)).toBeCloseTo(0.05);
    expect(parteDeFila(r.filas[0]!, "soles", r)).toBeCloseTo(250 / 7000);
    expect(parteDeFila(r.filas[0]!, "unidades", ranking({ totalPeriodo: { unidades: 0, vendido: 0 } }))).toBeNull();
  });

  it("las cifras: lo filtrado, qué parte del total es y cuánto pesan los diez primeros", () => {
    expect(cifrasDeRanking(r)).toEqual({ prendas: 11, vendido: 730, parteVendida: 0.11, cuantos: 3, partePrimerosDiez: 0.11 });
    expect(cifrasDeRanking(ranking({ totalPeriodo: { unidades: 0, vendido: 0 } }))).toMatchObject({ parteVendida: null, partePrimerosDiez: null });
  });
});

describe("«Quedan»: para cuántos días alcanza", () => {
  it("al ritmo del período: 5 prendas en 30 días y 12 en las tiendas alcanzan para 72 días", () => {
    expect(diasQueAlcanza({ unidades: 5, stock: 12 }, 30)).toBeCloseTo(72);
  });

  it("si no se vendió nada no hay ritmo (null, no infinito) y si no queda nada es 0", () => {
    expect(diasQueAlcanza({ unidades: 0, stock: 12 }, 30)).toBeNull();
    expect(diasQueAlcanza({ unidades: 5, stock: 0 }, 30)).toBe(0);
    expect(diasQueAlcanza({ unidades: 5, stock: 3 }, 0)).toBeNull();
  });

  it("sin stock, poco (menos de 14 días) o bien", () => {
    expect(situacionDeStock({ unidades: 30, stock: 0 }, 30).tipo).toBe("sin");
    expect(situacionDeStock({ unidades: 30, stock: 10 }, 30)).toMatchObject({ tipo: "poco", dias: 10 });
    expect(situacionDeStock({ unidades: 30, stock: 14 }, 30)).toMatchObject({ tipo: "bien" });
    expect(situacionDeStock({ unidades: 0, stock: 5 }, 30)).toEqual({ tipo: "bien", dias: null });
  });

  it("el texto: al menos 1 día y en singular cuando es uno", () => {
    expect(textoDeDias(6.6)).toBe("Para ~7 días");
    expect(textoDeDias(0.2)).toBe("Para ~1 día");
  });
});

describe("tallas y páginas", () => {
  it("las tallas en el orden de siempre: letras, números y «Única» al final", () => {
    const t = ordenarTallas(["L", "36", "Única", "S", "XL", "38", "M", "XS", "raro"].map((talla) => ({ talla })));
    expect(t.map((x) => x.talla)).toEqual(["XS", "S", "M", "L", "XL", "36", "38", "raro", "Única"]);
  });

  it("las páginas: al menos una", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(10)).toBe(1);
    expect(totalDePaginas(11)).toBe(2);
    expect(totalDePaginas(25, 5)).toBe(5);
  });
});

describe("la barra de cada fila", () => {
  const r = ranking();
  it("se mide contra la que más vendió (no contra la página), en lo que se ordena", () => {
    expect(largoDeBarra({ unidades: 5, vendido: 250 }, "unidades", r)).toBe(100);
    expect(largoDeBarra({ unidades: 1, vendido: 100 }, "unidades", r)).toBe(20);
    expect(largoDeBarra({ unidades: 1, vendido: 100 }, "soles", r)).toBe(40);
  });
  it("sin una fila mayor no hay barra, y nunca pasa de 100", () => {
    expect(largoDeBarra({ unidades: 3, vendido: 9 }, "unidades", ranking({ mayor: { unidades: 0, vendido: 0 } }))).toBe(0);
    expect(largoDeBarra({ unidades: 9, vendido: 999 }, "unidades", r)).toBe(100);
  });
});
