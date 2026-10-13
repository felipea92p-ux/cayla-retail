import { describe, expect, it } from "vitest";
import {
  FILAS_SIN_BUSCAR,
  listaDeModelos,
  ordenesParaLaLista,
  textoUrgencia,
  tipoAlElegir,
  urgentesDeLaRed,
  type ModeloParaLista,
} from "./orden-modelo-reglas";
import type { DemandaVariante } from "./produccion-decision-reglas";

// «El modelo primero» (ADR-0396, A1): el tipo se deduce del modelo, «Se están acabando» sale de la MISMA regla que las tarjetas «Abrir orden sugerida» del Resumen y la
// lista se busca sin tildes ni orden de palabras. Todo puro: sin red ni azar que no sea una semilla fija.

const modelo = (id: string, referencia: string, categoria: string | null = "Faldas"): ModeloParaLista => ({
  productoId: id,
  referencia,
  categoria,
  variantes: [{ varianteId: `${id}-v1` }, { varianteId: `${id}-v2` }],
});

const demanda = (m: ModeloParaLista, stockRed: number, ritmoDia: number | null): DemandaVariante[] =>
  m.variantes.map((v) => ({
    varianteId: v.varianteId,
    productoId: m.productoId,
    stockRed: stockRed / m.variantes.length,
    stockTaller: 0,
    enCamino: 0,
    ritmoDia: ritmoDia === null ? null : ritmoDia / m.variantes.length,
    sedesConRitmo: ritmoDia === null ? 0 : 1,
    ventasNetas: 0,
    cobertura: undefined as never,
    banda: undefined as never,
  }));

describe("tipoAlElegir", () => {
  it("un modelo que ya existe se fabrica como producción; uno nuevo arranca como muestra", () => {
    expect(tipoAlElegir({ eleccion: "existente", tipoActual: "muestra", aMano: false })).toBe("produccion");
    expect(tipoAlElegir({ eleccion: "nuevo", tipoActual: "produccion", aMano: false })).toBe("muestra");
  });
  it("lo que la persona tocó (o trajo en la URL) no se pisa", () => {
    expect(tipoAlElegir({ eleccion: "existente", tipoActual: "muestra", aMano: true })).toBe("muestra");
    expect(tipoAlElegir({ eleccion: "nuevo", tipoActual: "produccion", aMano: true })).toBe("produccion");
  });
});

describe("urgentesDeLaRed", () => {
  const falda = modelo("falda", "Falda Celeste");
  const blusa = modelo("blusa", "Blusa Lino", "Blusas");
  const casaca = modelo("casaca", "Casaca Bomber", "Casacas");
  const short = modelo("short", "Short Denim", "Shorts");

  it("marca los que se agotan en el plazo de riesgo y no tienen orden abierta, con los días redondeados", () => {
    // 6 en tiendas a 1 por día → 6 días (≤ 7): urgente
    const filas = [...demanda(falda, 6, 1), ...demanda(blusa, 40, 1), ...demanda(casaca, 6, null)];
    const r = urgentesDeLaRed({ modelos: [falda, blusa, casaca], demanda: filas, enProduccion: {} });
    expect([...r.keys()]).toEqual(["falda"]);
    expect(r.get("falda")).toEqual({ dias: 6 });
  });
  it("uno que ya tiene una orden abierta no es urgente (el Resumen no le sugiere otra)", () => {
    const r = urgentesDeLaRed({ modelos: [short], demanda: demanda(short, 3, 1), enProduccion: { "short-v1": 12 } });
    expect(r.size).toBe(0);
  });
  it("sin ritmo medido no se opina", () => {
    expect(urgentesDeLaRed({ modelos: [casaca], demanda: demanda(casaca, 0, null), enProduccion: {} }).size).toBe(0);
  });
  it("nunca dice «0 días»: lo que se acaba hoy dice 1", () => {
    const r = urgentesDeLaRed({ modelos: [falda], demanda: demanda(falda, 0.2, 1), enProduccion: {} });
    expect(r.get("falda")).toEqual({ dias: 1 });
    expect(textoUrgencia({ dias: 1 })).toBe("Se acaba en 1 día");
    expect(textoUrgencia({ dias: 9 })).toBe("Se acaba en 9 días");
  });
});

describe("listaDeModelos", () => {
  const catalogo: ModeloParaLista[] = [
    modelo("m1", "Blusa Lino", "Blusas"),
    modelo("m2", "Bolso Tote", "Bolsos"),
    modelo("m3", "Casaca Bomber", "Casacas"),
    modelo("m4", "Falda Celeste", "Faldas"),
    modelo("m5", "Falda Plisada Marina", "Faldas"),
    modelo("m6", "Short Denim", "Shorts"),
    modelo("m7", "Vestido Midi Floral", "Vestidos"),
    modelo("m8", "Vestido Camisero", "Vestidos"),
  ];
  const sinNada = { urgentes: new Map(), recientes: [] as string[] };

  it("sin buscar y sin ningún dato (el Taller de hoy: 0 órdenes), muestra el catálogo por orden, no una lista vacía", () => {
    const r = listaDeModelos({ modelos: catalogo, consulta: "", ...sinNada });
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].clave).toBe("catalogo");
    expect(r.grupos[0].modelos).toHaveLength(FILAS_SIN_BUSCAR);
    expect(r.grupos[0].modelos[0].referencia).toBe("Blusa Lino");
    expect(r.grupos[0].cuenta).toBe(`${FILAS_SIN_BUSCAR} de 8`);
  });

  it("arriba van los que se están acabando (los más urgentes primero), después los recientes sin repetir, y el catálogo rellena", () => {
    const r = listaDeModelos({
      modelos: catalogo,
      consulta: "",
      urgentes: new Map([
        ["m6", { dias: 5 }],
        ["m4", { dias: 2 }],
      ]),
      recientes: ["m4", "m3", "m3"],
    });
    expect(r.grupos.map((g) => g.clave)).toEqual(["acabando", "recientes", "catalogo"]);
    expect(r.grupos[0].modelos.map((m) => m.productoId)).toEqual(["m4", "m6"]);
    expect(r.grupos[1].modelos.map((m) => m.productoId)).toEqual(["m3"]);
    const ids = r.grupos.flatMap((g) => g.modelos.map((m) => m.productoId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(FILAS_SIN_BUSCAR);
  });

  it("si ya hay suficientes filas arriba no agrega el catálogo", () => {
    const urgentes = new Map(catalogo.slice(0, 6).map((m, i) => [m.productoId, { dias: i + 1 }] as const));
    const r = listaDeModelos({ modelos: catalogo, consulta: "", urgentes, recientes: [] });
    expect(r.grupos.map((g) => g.clave)).toEqual(["acabando"]);
  });

  it("un reciente que ya no está en el catálogo (se desactivó) se ignora, sin romper", () => {
    const r = listaDeModelos({ modelos: catalogo, consulta: "", urgentes: new Map(), recientes: ["fantasma", "m2"] });
    expect(r.grupos[0].clave).toBe("recientes");
    expect(r.grupos[0].modelos.map((m) => m.productoId)).toEqual(["m2"]);
  });

  it("busca sin tildes, sin mayúsculas, sin importar el orden de las palabras y también por categoría", () => {
    expect(listaDeModelos({ modelos: catalogo, consulta: "FALDA celeste", ...sinNada }).grupos[0].modelos.map((m) => m.productoId)).toEqual(["m4"]);
    expect(listaDeModelos({ modelos: catalogo, consulta: "celeste falda", ...sinNada }).grupos[0].modelos.map((m) => m.productoId)).toEqual(["m4"]);
    expect(listaDeModelos({ modelos: catalogo, consulta: "vestidos", ...sinNada }).grupos[0].modelos.map((m) => m.productoId)).toEqual(["m8", "m7"]);
    expect(listaDeModelos({ modelos: [modelo("x", "Camisón Algodón")], consulta: "camison algodon", ...sinNada }).coinciden).toBe(1);
  });

  it("al buscar, los que EMPIEZAN con lo escrito van antes que los que solo lo contienen", () => {
    const r = listaDeModelos({ modelos: catalogo, consulta: "ca", ...sinNada });
    // «Casaca Bomber» y «Vestido Camisero» contienen «ca»; la que empieza con «ca» va primero
    expect(r.grupos[0].modelos[0].productoId).toBe("m3");
    expect(r.coinciden).toBe(r.grupos[0].modelos.length);
  });

  it("sin coincidencias no hay grupos, y lo dice con la cuenta en 0", () => {
    const r = listaDeModelos({ modelos: catalogo, consulta: "zzz", ...sinNada });
    expect(r.grupos).toEqual([]);
    expect(r.coinciden).toBe(0);
  });

  it("al buscar no se corta a media lista: salen todos los que coinciden (la lista se desplaza)", () => {
    const muchos = Array.from({ length: 80 }, (_, i) => modelo(`p${i}`, `Falda ${String(i).padStart(2, "0")}`));
    const r = listaDeModelos({ modelos: muchos, consulta: "falda", ...sinNada });
    expect(r.grupos[0].modelos).toHaveLength(80);
    expect(r.coinciden).toBe(80);
  });

  it("(semilla fija) todo modelo se encuentra escribiendo su propio nombre, con o sin tildes y en mayúsculas", () => {
    let s = 20261013;
    const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const nombres = ["Camisón Algodón", "Falda Plisada Marina", "Vestido Midi Floral", "Blusa Manga Globo", "Bolso Tote Lona", "Cinturón Trenzado", "Pantalón Palazzo"];
    const lista = nombres.map((n, i) => modelo(`q${i}`, n));
    for (let i = 0; i < 400; i++) {
      const m = lista[Math.floor(azar() * lista.length)];
      const sinTilde = m.referencia.normalize("NFD").replace(/[̀-ͯ]/g, "");
      const consulta = azar() < 0.5 ? sinTilde.toUpperCase() : sinTilde.toLowerCase();
      const r = listaDeModelos({ modelos: lista, consulta, ...sinNada });
      expect(r.grupos[0]?.modelos.some((x) => x.productoId === m.productoId)).toBe(true);
    }
  });
});

describe("ordenesParaLaLista", () => {
  const o = (productoId: string, estado: string, creadoEn: string) => ({ productoId, estado, creadoEn });
  it("cuenta las órdenes en proceso de cada modelo y ordena los recientes, sin repetir y sin las anuladas", () => {
    const r = ordenesParaLaLista([
      o("a", "terminada", "2026-09-01T10:00:00Z"),
      o("b", "en_proceso", "2026-10-05T10:00:00Z"),
      o("a", "en_proceso", "2026-10-09T10:00:00Z"),
      o("b", "en_proceso", "2026-10-02T10:00:00Z"),
      o("c", "anulada", "2026-10-12T10:00:00Z"),
    ]);
    expect(r.abiertas.get("a")).toBe(1);
    expect(r.abiertas.get("b")).toBe(2);
    expect(r.abiertas.has("c")).toBe(false);
    expect(r.recientes).toEqual(["a", "b"]);
  });
  it("sin órdenes (el Taller de hoy) no hay nada, y no rompe", () => {
    const r = ordenesParaLaLista([]);
    expect(r.abiertas.size).toBe(0);
    expect(r.recientes).toEqual([]);
  });
});
