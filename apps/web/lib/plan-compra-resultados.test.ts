import { describe, expect, it } from "vitest";
import {
  campanaParaResultados,
  cierre,
  contraLaCampanaPasada,
  contraLoEsperado,
  enlaceAnalisis,
  filtrarYOrdenarCategorias,
  parteQuePaso,
  coloresQueMasVendieron,
  comoVa,
  pesosDeLosDias,
  senales,
  diasMedidos,
  leerResultados,
  momentoDeResultados,
  multiplicadorReal,
  porCategoria,
  porFamilia,
  prendasQueMasVendieron,
  recuperoRealTotal,
  type LecturaResultados,
} from "./plan-compra-resultados";
import { fraseDeLoReal } from "./plan-compra-reglas";
import { leerPropuesta } from "./plan-compra-propuesta";

const CRUDO = {
  plan: { id: "p", nombre: "Navidad 2026", desde: "2026-12-11", hasta: "2026-12-25" },
  hoy: "2027-01-20",
  medido_hasta: "2026-12-25",
  tiendas: [
    { id: "tru", nombre: "Tienda TRU", unidades: 300, soles: "24000", base_unidades: 600 },
    { id: "aqp", nombre: "Tienda AQP", unidades: 60, soles: 4800, base_unidades: null },
  ],
  filas: [
    { u: "tru", c: "polos", p: "p1", color: "negro", unidades: 200, soles: 16000 },
    { u: "tru", c: "polos", p: "p1", color: "blanco", unidades: 50, soles: 4000 },
    { u: "tru", c: "jeans", p: "p2", color: "negro", unidades: 50, soles: 4000 },
    { u: "aqp", c: "polos", p: null, color: "rojo", unidades: 60, soles: 4800 },
  ],
  agotadas: [{ u: "tru", c: "polos" }],
  despues: { hasta: "2027-01-19", categorias: [{ c: "polos", unidades: 40, soles: 1600, a_precio_lista: 3200 }] },
  lineas: [
    { c: "polos", flojo: 150, normal: 250, bueno: 450, recupero_pct: 40 },
    { c: "casacas", flojo: 10, normal: 20, bueno: 30, recupero_pct: 60 },
  ],
  categorias: [
    { id: "polos", nombre: "Polos", familia: "ind" },
    { id: "jeans", nombre: "Jeans", familia: "ind" },
    { id: "casacas", nombre: "Casacas", familia: "abr" },
  ],
  familias: [{ codigo: "ind", nombre: "Indumentaria" }, { codigo: "abr", nombre: "Abrigos" }],
  productos: [{ id: "p1", nombre: "Polo Aurora" }, { id: "p2", nombre: "Jean Recto" }],
  colores: [{ codigo: "negro", nombre: "Negro", hex: "#1a1a18" }, { codigo: "blanco", nombre: "Blanco", hex: null }, { codigo: "rojo", nombre: "Rojo", hex: null }],
};
const r = leerResultados(CRUDO) as LecturaResultados;

describe("leer y el momento", () => {
  it("lee la forma de la base; null si no se entiende", () => {
    expect(r.tiendas.map((t) => [t.id, t.soles, t.baseUnidades])).toEqual([
      ["tru", 24000, 600],
      ["aqp", 4800, null],
    ]);
    expect(leerResultados({ plan: {} })).toBeNull();
  });
  it("por venir, en curso o terminada según hoy", () => {
    expect(momentoDeResultados(r)).toBe("terminada");
    expect(momentoDeResultados({ ...r, hoy: "2026-12-15" })).toBe("en-curso");
    expect(momentoDeResultados({ ...r, hoy: "2026-12-11" })).toBe("por-venir");
  });
});

describe("el multiplicador real de cada tienda", () => {
  it("unidades por día en la campaña ÷ unidades por día en los 60 de antes (300/15 ÷ 600/60 = 2)", () => {
    expect(diasMedidos(r)).toBe(15);
    expect(multiplicadorReal(r, r.tiendas[0])).toBe(2);
  });
  it("sin los 60 días de antes en el ERP, no se inventa", () => {
    expect(multiplicadorReal(r, r.tiendas[1])).toBeNull();
  });
});

describe("por categoría, familia, prenda y color", () => {
  it("una fila por categoría vendida o con plan, con su lectura contra el plan, dónde se agotó y lo que sobró", () => {
    const filas = porCategoria(r, null);
    expect(filas.map((f) => [f.nombre, f.unidades, f.lectura, f.agotadaEn, f.recuperoReal])).toEqual([
      ["Polos", 310, "Se vendieron 310: entre el normal y el bueno.", ["Tienda TRU"], 50],
      ["Jeans", 50, null, [], null],
      ["Casacas", 0, "Se vendieron 0: menos que el flojo.", [], null],
    ]);
  });
  it("filtrar por tienda cuenta solo lo suyo y no compara contra el plan (que es de toda CAYLA)", () => {
    const aqp = porCategoria(r, "aqp");
    expect(aqp.find((f) => f.id === "polos")).toMatchObject({ unidades: 60, lectura: null, agotadaEn: [] });
  });
  it("las familias, de la que más vendió a la que menos", () => {
    expect(porFamilia(r, null)).toEqual([{ familia: "Indumentaria", unidades: 360, soles: 28800 }]);
  });
  it("las prendas que más vendieron, con su color; lo anotado sin registrar dice su categoría", () => {
    expect(prendasQueMasVendieron(r, null).map((p) => [p.prenda, p.color, p.unidades])).toEqual([
      ["Polo Aurora", "Negro", 200],
      ["Sin registrar · Polos", "Rojo", 60],
      // Empate en unidades y soles: por nombre.
      ["Jean Recto", "Negro", 50],
      ["Polo Aurora", "Blanco", 50],
    ]);
  });
  it("el detalle de una categoría: solo sus prendas y sus colores", () => {
    expect(prendasQueMasVendieron(r, null, 10, "jeans").map((p) => [p.prenda, p.color, p.unidades])).toEqual([["Jean Recto", "Negro", 50]]);
    expect(coloresQueMasVendieron(r, null, 8, "polos").map((c) => [c.nombre, c.unidades])).toEqual([
      ["Negro", 200],
      ["Rojo", 60],
      ["Blanco", 50],
    ]);
  });
  it("los colores que más vendieron", () => {
    expect(coloresQueMasVendieron(r, null).map((c) => [c.nombre, c.unidades])).toEqual([
      ["Negro", 250],
      ["Rojo", 60],
      ["Blanco", 50],
    ]);
  });
  it("lo que sobró de toda la campaña: lo cobrado ÷ lo que valía", () => {
    expect(recuperoRealTotal(r)).toBe(50);
    expect(recuperoRealTotal({ ...r, despues: { hasta: null, categorias: [] } })).toBeNull();
  });
});

describe("durante la campaña: ¿cómo va? y pedir más o impulsar", () => {
  // Navidad 2026 (15 días) a la mitad: hoy es el 19 dic, se midió hasta el 18 (8 días).
  const enCurso = leerResultados({
    ...CRUDO,
    hoy: "2026-12-19",
    medido_hasta: "2026-12-18",
    por_dia: Array.from({ length: 8 }, (_, i) => ({ f: `2026-12-${String(11 + i).padStart(2, "0")}`, u: 20 })),
    stock: [
      { c: "polos", hoy: 30, cierre: 30 },
      { c: "jeans", hoy: 400, cierre: 400 },
    ],
  }) as LecturaResultados;
  const parejos = Array(15).fill(1);
  it("compara lo vendido con lo que el plan esperaba a hoy y proyecta el cierre", () => {
    const c = comoVa(enCurso, parejos);
    // Plan: polos 250 + casacas 20 = 270; a hoy (8/15) se esperaban 144; vendidas 160 → +11 %; si sigue así, 300.
    expect([c.planTotal, c.vendido, c.esperado, Math.round(c.diferencia! * 100), c.proyeccion]).toEqual([270, 160, 144, 11, 300]);
    expect(c.real).toHaveLength(8);
    expect(c.proyectado.at(-1)).toBeCloseTo(300);
  });
  it("con la forma del año pasado, el plan a hoy no es una línea recta", () => {
    const pesos = pesosDeLosDias("2026-12-11", "2026-12-25", new Map(Array.from({ length: 15 }, (_, i) => [`2025-12-${String(11 + i).padStart(2, "0")}`, i < 8 ? 1 : 3] as const)));
    expect(pesos[0]).toBe(1);
    expect(pesos[14]).toBe(3);
    expect(comoVa(enCurso, pesos).esperado).toBeLessThan(144);
  });
  it("sin historia suficiente, todos los días pesan igual", () => {
    expect(pesosDeLosDias("2026-12-11", "2026-12-25", new Map())).toEqual(parejos);
    expect(pesosDeLosDias("2026-12-11", "2026-12-25", null)).toEqual(parejos);
  });
  it("pide más lo que se acaba antes del fin; con lo que sobra y sin plan, va bien", () => {
    const s = senales(enCurso, parejos);
    // Polos: 310 en 8 días (38.75/día), quedan 30 → alcanza < 1 día, faltan 7 → pedir. Jeans: sin plan, alcanza 64 días → bien.
    expect(s.map((x) => [x.nombre, x.senal])).toEqual([
      ["Polos", "pedir"],
      ["Jeans", "bien"],
    ]);
  });
  it("sin el stock de la base no inventa señales", () => {
    expect(senales({ ...enCurso, stock: null }, parejos)).toEqual([]);
  });

  // Una tienda (Felipe 2026-10-12): Arequipa vende 6 por día; le toca el 20 % del plan; tiene 300 polos.
  const porTienda = leerResultados({
    ...CRUDO,
    hoy: "2026-12-19",
    medido_hasta: "2026-12-18",
    por_dia: Array.from({ length: 8 }, (_, i) => ({ f: `2026-12-${String(11 + i).padStart(2, "0")}`, u: 20 })),
    stock: [{ c: "polos", hoy: 330, cierre: 330 }],
    por_dia_tienda: Array.from({ length: 8 }, (_, i) => ({ f: `2026-12-${String(11 + i).padStart(2, "0")}`, t: "aqp", u: 6 })),
    stock_tienda: [
      { c: "polos", t: "aqp", hoy: 300, cierre: 300 },
      { c: "polos", t: "tru", hoy: 30, cierre: 30 },
    ],
  }) as LecturaResultados;
  const aqp = { tienda: "aqp", parte: () => 0.2 };
  it("de una tienda: SUS ventas contra SU parte del plan", () => {
    const c = comoVa(porTienda, parejos, aqp);
    // Su plan: 20 % de (250 + 20) = 54; a hoy (8/15) se esperaban 29; vendió 48 → +66 %.
    expect([c.planTotal, c.vendido, c.esperado, Math.round(c.diferencia! * 100)]).toEqual([54, 48, 29, 66]);
  });
  it("sin la propuesta no hay plan de la tienda con qué comparar, pero sí lo vendido", () => {
    const c = comoVa(porTienda, parejos, { tienda: "aqp", parte: null });
    expect([c.planTotal, c.esperado, c.vendido]).toEqual([null, null, 48]);
  });
  it("las señales de una tienda usan su stock y sus ventas: a Arequipa le alcanzan los polos, a Trujillo no", () => {
    // AQP: 60 polos en 8 días con 300 → le alcanza; va +78 % sobre su parte (50 × 8/15 = 26.7) → bien.
    expect(senales(porTienda, parejos, aqp).map((x) => [x.nombre, x.senal])).toEqual([["Polos", "bien"]]);
    // TRU: 250 polos en 8 días con 30 → pide más.
    expect(senales(porTienda, parejos, { tienda: "tru", parte: () => 0.8 }).find((x) => x.nombre === "Polos")?.senal).toBe("pedir");
  });
  it("la tabla de una tienda lee contra SU parte del plan; sin la parte, no se compara", () => {
    // AQP vendió 60 polos; su 20 % del plan es flojo 30 · normal 50 · bueno 90.
    expect(porCategoria(porTienda, "aqp", () => 0.2).find((f) => f.id === "polos")?.lectura).toBe(fraseDeLoReal(60, { flojo: 30, normal: 50, bueno: 90 }).replace(/diciembre /g, ""));
    expect(porCategoria(porTienda, "aqp").find((f) => f.id === "polos")?.lectura).toBeNull();
  });
  it("sin el stock por tienda de la base, las señales de una tienda no se inventan", () => {
    expect(senales({ ...porTienda, stockTienda: null }, parejos, aqp)).toEqual([]);
  });
});

describe("al terminar: el cierre con sell-through", () => {
  const terminada = leerResultados({
    ...CRUDO,
    filas: CRUDO.filas.map((f) => ({ ...f, rebajadas: f.c === "polos" && f.u === "tru" && f.color === "negro" ? 40 : 0 })),
    stock: [
      { c: "polos", hoy: 0, cierre: 0 },
      { c: "jeans", hoy: 50, cierre: 50 },
    ],
  }) as LecturaResultados;
  it("a precio lleno, con rebaja y lo que sobró; liquidar primero lo que más sobra", () => {
    const c = cierre(terminada)!;
    expect(c.categorias.map((x) => [x.nombre, x.lleno, x.rebajadas, x.sobra])).toEqual([
      ["Polos", 270, 40, 0],
      ["Jeans", 50, 0, 50],
    ]);
    // 320 a precio lleno de 410 que había.
    expect(Math.round(c.pctLleno * 100)).toBe(78);
    expect(c.liquidarPrimero?.nombre).toBe("Jeans");
  });
  it("sin el stock de la base, no hay cierre", () => {
    expect(cierre({ ...terminada, stock: null })).toBeNull();
  });
});

describe("qué campaña se muestra", () => {
  const c = (id: string, desde: string, hasta: string, archivado = false) => ({ id, desde, hasta, archivado });
  it("la que está en curso; si no, la última terminada; si no, la próxima; nunca una archivada", () => {
    const planes = [c("madre", "2026-04-26", "2026-05-10"), c("dic", "2026-12-01", "2026-12-31"), c("hall", "2026-10-17", "2026-10-31")];
    expect(campanaParaResultados(planes, "2026-10-20")?.id).toBe("hall");
    expect(campanaParaResultados(planes, "2026-11-10")?.id).toBe("hall");
    expect(campanaParaResultados([c("dic", "2026-12-01", "2026-12-31")], "2026-10-12")?.id).toBe("dic");
    expect(campanaParaResultados([c("x", "2026-01-01", "2026-01-10", true)], "2026-10-12")).toBeNull();
  });
});

describe("la tabla de categorías: buscar y ordenar", () => {
  const filas = porCategoria(r, null);
  it("por defecto, la que más vendió primero (el orden de siempre)", () => {
    expect(filtrarYOrdenarCategorias(filas, "", "mas").map((f) => f.id)).toEqual(filas.map((f) => f.id));
  });
  it("menos vendidas, A a Z y Z a A", () => {
    expect(filtrarYOrdenarCategorias(filas, "", "menos").map((f) => f.nombre)).toEqual(["Casacas", "Jeans", "Polos"]);
    expect(filtrarYOrdenarCategorias(filas, "", "az").map((f) => f.nombre)).toEqual(["Casacas", "Jeans", "Polos"]);
    expect(filtrarYOrdenarCategorias(filas, "", "za").map((f) => f.nombre)).toEqual(["Polos", "Jeans", "Casacas"]);
  });
  it("busca por nombre o familia, sin tildes ni mayúsculas", () => {
    expect(filtrarYOrdenarCategorias(filas, "POLO", "mas").map((f) => f.id)).toEqual(["polos"]);
    expect(filtrarYOrdenarCategorias(filas, "indumentária", "az").map((f) => f.id)).toEqual(["jeans", "polos"]);
    expect(filtrarYOrdenarCategorias(filas, "zzz", "mas")).toEqual([]);
  });
  it("no toca la lista que recibe", () => {
    const copia = filas.map((f) => f.id);
    filtrarYOrdenarCategorias(filas, "", "za");
    expect(filas.map((f) => f.id)).toEqual(copia);
  });
});

describe("el detalle de una categoría: contra lo esperado y contra la campaña pasada", () => {
  it("terminada: lo vendido en todas las tiendas contra el normal completo", () => {
    const c = contraLoEsperado(r, "polos", Array(15).fill(1));
    expect(c).toMatchObject({ vendidas: 310, esperado: 250, terminada: true, plan: { flojo: 150, normal: 250, bueno: 450 } });
    expect(c?.diferencia).toBeCloseTo(0.24);
  });
  it("en curso: lo que el normal esperaba a hoy, con el peso de los días", () => {
    const enCurso = { ...r, hoy: "2026-12-16", medidoHasta: "2026-12-15" };
    expect(parteQuePaso(enCurso, Array(15).fill(1))).toBeCloseTo(5 / 15);
    expect(contraLoEsperado(enCurso, "polos", Array(15).fill(1))).toMatchObject({ esperado: 83, terminada: false });
    // Con la forma de los días, los primeros pesan menos: se esperaba menos a esta altura.
    expect(contraLoEsperado(enCurso, "polos", [...Array(5).fill(1), ...Array(10).fill(3)])?.esperado).toBe(Math.round((250 * 5) / 35));
  });
  it("sin plan no hay contra qué comparar", () => {
    expect(contraLoEsperado(r, "jeans", Array(15).fill(1))).toBeNull();
  });

  const propuesta = leerPropuesta({
    plan_id: "p",
    hoy: "2026-12-20",
    dias_campana: 15,
    previa: { desde: "2025-12-11", hasta: "2025-12-25" },
    recupero_defecto: { pct: 40, heredado: false },
    tiendas: [
      { id: "tru", nombre: "Tienda TRU", erp_desde: "2024-01-01", dias_90: 90, ventanas: 6, previa_disponible: true, multiplicador: 2 },
      { id: "aqp", nombre: "Tienda AQP", erp_desde: "2026-09-01", dias_90: 90, ventanas: 3, previa_disponible: false, multiplicador: null },
    ],
    categorias: [
      { c: "polos", u: "tru", u90: 300, ventanas: [100, 100, 100, 0, 0, 0], previa: 280, agotada: false },
      { c: "polos", u: "aqp", u90: 60, ventanas: [20, 20, 20, 0, 0, 0], previa: 0, agotada: false },
    ],
  });
  it("suma solo las tiendas que ya vendían en el ERP en esa campaña, y dice cuáles no", () => {
    expect(contraLaCampanaPasada(propuesta, "polos", null)).toEqual({
      desde: "2025-12-11",
      hasta: "2025-12-25",
      unidades: 280,
      conDato: ["Tienda TRU"],
      sinDato: ["Tienda AQP"],
    });
  });
  it("una tienda sin esa campaña en el ERP no tiene con qué comparar", () => {
    expect(contraLaCampanaPasada(propuesta, "polos", "aqp")).toMatchObject({ unidades: 0, conDato: [], sinDato: ["Tienda AQP"] });
  });
  it("una categoría que no se vendió el año pasado da cero, no falta de dato", () => {
    expect(contraLaCampanaPasada(propuesta, "jeans", null)).toMatchObject({ unidades: 0, conDato: ["Tienda TRU"] });
  });
  it("sin la propuesta no se inventa nada", () => {
    expect(contraLaCampanaPasada(null, "polos", null)).toBeNull();
  });
});

describe("las señales llevan a Análisis ya buscando la categoría", () => {
  it("pide más → «Se está acabando»; impúlsala → «No se vende»; la categoría va codificada", () => {
    expect(enlaceAnalisis("pedir", "Aretes")).toBe("/inventario/resumen?vista=acaba&q=Aretes");
    expect(enlaceAnalisis("impulsar", "Ropa interior/Lencería")).toBe("/inventario/resumen?vista=nose&q=Ropa%20interior%2FLencer%C3%ADa");
  });
});
