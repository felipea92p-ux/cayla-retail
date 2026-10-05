import { describe, expect, it } from "vitest";
import {
  TITULO_RESTO,
  etiquetaBuscarEnCatalogo,
  loAnotado,
  opcionesDeLaSede,
  opcionesDelCatalogo,
  textoSinCandidatas,
  tituloTramo,
} from "./por-regularizar-buscador";
import {
  hechosConExactas,
  sugerenciaDeVenta,
  type HechoCandidata,
  type PrendaParaRegularizar,
  type VentaPorRegularizar,
} from "./por-regularizar-candidatas";

// D2 (2026-10-05): el buscador de Regularizar prenda mira, por defecto, SOLO la tienda de la venta y lo que calza con lo anotado. Lo
// que Felipe vio: una venta de TRU «Pantalones · Chocolate · Talla 28» y el buscador con todo el catálogo, de todas las sedes.

const VENTA: VentaPorRegularizar = {
  descripcion: "Pantalón chocolate",
  precioCobrado: 89,
  vendidoEn: "2026-10-02T16:40:00.000Z",
  sede: "Tienda TRU",
  categoria: "Pantalones",
  talla: "28",
  color: "Chocolate",
};
const prenda = (id: string, extra: Partial<PrendaParaRegularizar> = {}): PrendaParaRegularizar => ({
  id,
  productoId: `prod-${id}`,
  nombre: `Pantalón ${id}`,
  codigo: `PAN-${id}`,
  categoria: "Pantalones",
  talla: "28",
  color: "Chocolate",
  precio: 89,
  ...extra,
});
const hecho = (varianteId: string, extra: Partial<HechoCandidata> = {}): HechoCandidata => ({
  prendaId: "venta-1",
  varianteId,
  colorExacto: true,
  colorHex: null,
  colorHexAnotado: null,
  pisoLibre: 1,
  almacenLibre: 0,
  disponible: 1,
  primeraEntrada: null,
  primeraEntradaMotivo: null,
  saldoALaVenta: 1,
  cambioPosterior: null,
  cambioPosteriorMotivo: null,
  ...extra,
});

// El catálogo entero de la pantalla: lo de TRU que calza, un color parecido, y prendas que nada tienen que ver (otra talla, otra
// categoría, una que solo tiene stock en otra sede: la base no la trae como candidata).
const CATALOGO = [
  prenda("exacta-1"),
  prenda("exacta-2", { precio: 120 }),
  prenda("cafe", { color: "Café", nombre: "Pantalón Lisboa" }),
  prenda("talla-30", { talla: "30" }),
  prenda("blusa", { categoria: "Camisas y Blusas", nombre: "Blusa Emma", codigo: "CMS-1" }),
  prenda("en-lima"),
];
const CAT = new Map(CATALOGO.map((p) => [p.id, p]));
const EXACTAS = [
  { prendaId: "venta-1", varianteId: "exacta-1", disponible: 2 },
  { prendaId: "venta-1", varianteId: "exacta-2", disponible: 1 },
];
const HECHOS = [hecho("exacta-1"), hecho("cafe", { colorExacto: false })];
const SUGERENCIA = sugerenciaDeVenta(VENTA, hechosConExactas(EXACTAS, HECHOS), [], CAT, null);

describe("opcionesDeLaSede — por defecto, solo lo de la tienda de la venta que calza", () => {
  it("no trae el catálogo: ni otra talla, ni otra categoría, ni la que solo tiene stock en otra sede", () => {
    expect(opcionesDeLaSede(SUGERENCIA).map((o) => o.valor)).toEqual(["exacta-1", "exacta-2", "cafe"]);
  });

  it("en tramos rotulados y separados: primero «igual a lo que anotó caja», después «color parecido»", () => {
    const o = opcionesDeLaSede(SUGERENCIA);
    expect(o.map((x) => x.seccion)).toEqual(["Igual a lo que anotó caja", "Igual a lo que anotó caja", "Color parecido"]);
  });

  it("la sugerida «Más probable» siempre está en la lista, y solo ella lo dice", () => {
    const o = opcionesDeLaSede(SUGERENCIA);
    expect(SUGERENCIA.probable?.prenda.id).toBe("exacta-1");
    expect(o.filter((x) => x.detalle.startsWith("Más probable")).map((x) => x.valor)).toEqual(["exacta-1"]);
  });

  it("una parecida con el nombre escrito puede ser la más probable, pero se queda en SU tramo (no se mezcla con las iguales)", () => {
    const venta = { ...VENTA, descripcion: "Pantalón Lisboa tiro alto" };
    const s = sugerenciaDeVenta(venta, hechosConExactas(EXACTAS, HECHOS), [], CAT, null);
    const o = opcionesDeLaSede(s);
    // «cafe» (Pantalón Lisboa, parecida) gana por el nombre, pero va tercera, en «Color parecido».
    expect(s.probable?.prenda.id).toBe("cafe");
    expect(o.map((x) => [x.valor, x.seccion])).toEqual([
      ["exacta-1", "Igual a lo que anotó caja"],
      ["exacta-2", "Igual a lo que anotó caja"],
      ["cafe", "Color parecido"],
    ]);
    expect(o.find((x) => x.valor === "cafe")?.detalle.startsWith("Más probable")).toBe(true);
  });

  it("con lo escrito distinto de lo anotado, el tramo de la categoría escrita va primero y lo dice", () => {
    const jean = prenda("jean", { categoria: "Jeans", nombre: "Jean Mom", codigo: "JEA-1" });
    const cat = new Map([...CAT, ["jean", jean]]);
    const escrita = { categoriaId: "jeans", nombre: "Jeans", palabra: "Jean" };
    const s = sugerenciaDeVenta(VENTA, hechosConExactas(EXACTAS, HECHOS), [hecho("jean")], cat, escrita);
    const o = opcionesDeLaSede(s);
    expect(o.map((x) => x.valor)).toEqual(["jean", "exacta-1", "exacta-2", "cafe"]);
    expect(o[0]?.seccion).toBe("La categoría que escribió caja: Jeans");
    expect(tituloTramo("escrita", s)).toBe("La categoría que escribió caja: Jeans");
  });

  it("…porque la primera fila es la que elige Enter al abrir: con lo escrito distinto, es la «Más probable», nunca un pantalón", () => {
    // Revisión 2026-10-05 (D2): «primero las exactas» vale dentro de lo ANOTADO. Cuando la caja escribió otra categoría, lo anotado
    // es lo dudoso (`sugerenciaDeVenta`: un pantalón nunca es la «Más probable» de una venta escrita «Jean…»); con las iguales
    // arriba, abrir y apretar Enter elegía un pantalón para una venta de un jean. ADR-0328, «Actualización 2026-10-05», D2.
    const jean = prenda("jean", { categoria: "Jeans", nombre: "Jean Mom", codigo: "JEA-1" });
    const cat = new Map([...CAT, ["jean", jean]]);
    const escrita = { categoriaId: "jeans", nombre: "Jeans", palabra: "Jean" };
    const s = sugerenciaDeVenta(VENTA, hechosConExactas(EXACTAS, HECHOS), [hecho("jean")], cat, escrita);
    const [primera] = opcionesDeLaSede(s);
    expect(primera?.valor).toBe(s.probable?.prenda.id);
    expect(primera?.detalle.startsWith("Más probable")).toBe(true);
  });

  it("solo colores parecidos en la tienda (ninguna igual): la lista no queda vacía y la parecida es la «Más probable», en su tramo", () => {
    // Revisión 2026-10-05: sin exactas, las parecidas siguen siendo candidatas (una venta «Chocolate» y un «Café» en la tienda).
    const s = sugerenciaDeVenta(VENTA, hechosConExactas([], [hecho("cafe", { colorExacto: false })]), [], CAT, null);
    const o = opcionesDeLaSede(s);
    expect(o.map((x) => [x.valor, x.seccion])).toEqual([["cafe", "Color parecido"]]);
    expect(s.probable?.prenda.id).toBe("cafe");
    expect(o[0]?.detalle.startsWith("Más probable")).toBe(true);
  });

  it("sin nada que calce en la tienda, la lista está vacía (el modal lo explica y ofrece el catálogo)", () => {
    expect(opcionesDeLaSede(sugerenciaDeVenta(VENTA, hechosConExactas([], []), [], CAT, null))).toEqual([]);
  });
});

describe("etiquetaBuscarEnCatalogo — la salida al catálogo, dentro de la lista de la tienda", () => {
  it("sin escribir, la pregunta y la salida; con lo escrito, lo lleva al catálogo", () => {
    expect(etiquetaBuscarEnCatalogo("")).toBe("¿No está? Buscar en todo el catálogo");
    expect(etiquetaBuscarEnCatalogo("  ")).toBe("¿No está? Buscar en todo el catálogo");
    expect(etiquetaBuscarEnCatalogo(" largo ")).toBe("Buscar «largo» en todo el catálogo");
  });
});

describe("opcionesDelCatalogo — «Buscar en todo el catálogo», la salida para la prenda que la tienda nunca cargó", () => {
  it("las de la tienda arriba (con sus tramos) y después TODO el resto, lo más parecido a lo anotado primero", () => {
    const o = opcionesDelCatalogo(CATALOGO, SUGERENCIA, VENTA);
    expect(o.map((x) => x.valor)).toEqual(["exacta-1", "exacta-2", "cafe", "en-lima", "talla-30", "blusa"]);
    expect(o.slice(3).every((x) => x.seccion === TITULO_RESTO)).toBe(true);
    expect(new Set(o.map((x) => x.valor))).toEqual(new Set(CATALOGO.map((p) => p.id)));
  });

  it("en el resto, a igual categoría y talla, el color anotado va antes que otro (aunque el catálogo lo traiga después)", () => {
    const negro = prenda("negro", { color: "Negro" });
    const chocolate = prenda("chocolate-en-otra-sede");
    const o = opcionesDelCatalogo([negro, chocolate], SUGERENCIA, VENTA).map((x) => x.valor);
    expect(o.slice(3)).toEqual(["chocolate-en-otra-sede", "negro"]);
  });

  it("si la caja escribió otra categoría, el resto se ordena por ESA (la escrita)", () => {
    const escrita = { categoriaId: "cms", nombre: "Camisas y Blusas", palabra: "Blusa" };
    const s = sugerenciaDeVenta(VENTA, [], [], CAT, escrita);
    expect(opcionesDelCatalogo(CATALOGO, s, VENTA)[0]?.valor).toBe("blusa");
  });
});

describe("textoSinCandidatas — la lista vacía, en palabras de tienda", () => {
  it("nombra lo anotado y la tienda DE LA VENTA, y dice la salida", () => {
    expect(textoSinCandidatas(VENTA, { escrita: null })).toBe(
      "En Tienda TRU no hay stock libre de Pantalones en talla 28 y color Chocolate, ni de un color parecido. Si la prenda nunca se cargó aquí, búscala en todo el catálogo.",
    );
  });

  it("con lo escrito distinto, nombra las dos categorías (se buscó en las dos)", () => {
    expect(textoSinCandidatas(VENTA, { escrita: { categoriaId: "j", nombre: "Jeans", palabra: "Jean" } })).toContain("de Jeans ni de Pantalones en talla 28");
  });

  it("sin talla (un accesorio) no deja huecos; sin nada anotado, no inventa", () => {
    expect(loAnotado({ talla: "", color: "Dorado" }, ["Collares"])).toBe("de Collares color Dorado");
    expect(textoSinCandidatas({ categoria: "", talla: "", color: "", sede: "" }, { escrita: null })).toBe(
      "En esta tienda no hay stock libre de lo que anotó caja, ni de un color parecido. Si la prenda nunca se cargó aquí, búscala en todo el catálogo.",
    );
  });
});
