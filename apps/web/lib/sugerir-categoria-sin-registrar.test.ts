import { describe, expect, it } from "vitest";
import {
  SINONIMOS_POR_CATEGORIA,
  formas,
  singular,
  sinonimosDeCategoria,
  sugerenciaParaMostrar,
  sugerirCategoria,
  type CategoriaParaSugerir,
} from "./sugerir-categoria-sin-registrar";

// Las categorías REALES, leídas de la base local con todas las migraciones y el seed aplicados (2026-10-04):
//   select prefijo, nombre, activo from retail.categorias order by familia, nombre;
// Las 42 activas son las que Vender le ofrece a la asesora (`vender/page.tsx` filtra `activo`). «Blusas» (BLU) y «Trajes de baño» (TBA)
// existen pero están apagadas: se prueban aparte, porque un Líder puede reactivarlas.
const ACTIVAS: ReadonlyArray<readonly [prefijo: string, nombre: string]> = [
  ["CAR", "Bolsos y Carteras"], ["CIN", "Cinturones"], ["GOR", "Gorros y Sombreros"], ["LSO", "Lentes de sol"], ["MOC", "Mochilas"],
  ["BUF", "Pañuelos y Pañoletas"], ["REL", "Relojes"], ["RIN", "Riñoneras"],
  ["MAQ", "Maquillaje"],
  ["ANL", "Anillos"], ["ARE", "Aretes"], ["COL", "Collares"], ["PUL", "Pulseras"],
  ["BAI", "Bailarinas"], ["BOT", "Botas"], ["BOI", "Botines"], ["MSN", "Mocasines"], ["SAN", "Sandalias"], ["ZAP", "Zapatillas"],
  ["ZFO", "Zapatos formales"],
  ["ABR", "Abrigos"], ["BLZ", "Blazers"], ["BOD", "Bodys"], ["CMS", "Camisas y Blusas"], ["CAS", "Casacas"], ["CHA", "Chalecos"],
  ["CMP", "Chompas"], ["CON", "Conjuntos"], ["ENT", "Enterizos"], ["FAL", "Faldas"], ["JEA", "Jeans"], ["PAN", "Pantalones"],
  ["SUD", "Poleras"], ["POL", "Polos"], ["LEN", "Ropa interior/Lencería"], ["SHO", "Shorts"], ["TOP", "Tops"], ["VES", "Vestidos"],
  ["UTC", "Colores"], ["LAP", "Lapiceros"], ["LIB", "Libretas/Cuadernos"], ["UOF", "Útiles de oficina"],
];
const APAGADAS: ReadonlyArray<readonly [string, string]> = [["BLU", "Blusas"], ["TBA", "Trajes de baño"]];

const cat = ([prefijo, nombre]: readonly [string, string]): CategoriaParaSugerir => ({ id: `id-${prefijo}`, nombre, prefijo });
const CATEGORIAS = ACTIVAS.map(cat);
const TODAS = [...ACTIVAS, ...APAGADAS].map(cat);
const nombreSugerido = (descripcion: string, categorias = CATEGORIAS) => sugerirCategoria(descripcion, categorias)?.nombre ?? null;

describe("sugerir la categoría desde la descripción — la lista de la prueba es la real", () => {
  it("son las 42 activas de la base (la prueba no mira una lista vacía) y cada una tiene sus palabras en la tabla", () => {
    expect(ACTIVAS).toHaveLength(42);
    for (const [prefijo, nombre] of [...ACTIVAS, ...APAGADAS]) {
      expect(SINONIMOS_POR_CATEGORIA[prefijo], `${nombre} (${prefijo}) sin palabras`).toBeDefined();
    }
  });

  it("no queda una entrada de la tabla para una categoría que ya no existe", () => {
    expect(Object.keys(SINONIMOS_POR_CATEGORIA).sort()).toEqual([...ACTIVAS, ...APAGADAS].map(([p]) => p).sort());
  });
});

describe("TOTALIDAD: cada categoría se sugiere por su nombre y por cada palabra de su tabla", () => {
  it("escribir el nombre de una categoría activa sugiere esa misma categoría", () => {
    for (const [prefijo, nombre] of ACTIVAS) {
      // Única excepción, a propósito: «Colores» (papelería) solo es la palabra «color», que describe cualquier prenda.
      if (prefijo === "UTC") continue;
      expect(sugerirCategoria(nombre, CATEGORIAS)?.categoriaId, `«${nombre}»`).toBe(`id-${prefijo}`);
    }
  });

  it("«Colores» (papelería) se reconoce por sus frases, nunca por la palabra «color» sola", () => {
    expect(nombreSugerido("Colores")).toBeNull();
    expect(nombreSugerido("Colores escolares x 24")).toBe("Colores");
    expect(nombreSugerido("Crayolas")).toBe("Colores");
    expect(nombreSugerido("Blusa color rosa")).toBe("Camisas y Blusas");
  });

  it("SIN CONTRADICCIÓN: cada palabra de la tabla lleva a SU categoría y a ninguna otra (con las 42 activas)", () => {
    for (const [prefijo, nombre] of ACTIVAS) {
      for (const palabra of SINONIMOS_POR_CATEGORIA[prefijo]!) {
        expect(sugerirCategoria(palabra, CATEGORIAS)?.categoriaId, `«${palabra}» debería ser ${nombre}`).toBe(`id-${prefijo}`);
        // Y en plural, como lo escribe la gente («chompas», «correas»).
        expect(sugerirCategoria(`${palabra}s`, CATEGORIAS)?.categoriaId ?? `id-${prefijo}`, `«${palabra}s»`).toBe(`id-${prefijo}`);
      }
    }
  });

  it("con las apagadas encendidas tampoco hay contradicción: «blusa» es de Blusas y «bikini» de Trajes de baño", () => {
    for (const [prefijo, nombre] of [...ACTIVAS, ...APAGADAS]) {
      for (const palabra of SINONIMOS_POR_CATEGORIA[prefijo]!) {
        expect(sugerirCategoria(palabra, TODAS)?.categoriaId, `«${palabra}» debería ser ${nombre}`).toBe(`id-${prefijo}`);
      }
    }
    expect(nombreSugerido("Blusa de lino", TODAS)).toBe("Blusas");
    expect(nombreSugerido("Blusa de lino")).toBe("Camisas y Blusas");
  });
});

describe("la prenda va primero: lo que la describe después no cambia la categoría", () => {
  it.each([
    // [descripción, categoría que debe sugerir]
    ["Jean azul tiro alto", "Jeans"],
    ["jean mom celeste", "Jeans"],
    ["JEANS rotos", "Jeans"],
    ["Mom jean", "Jeans"],
    ["chaqueta jean", "Casacas"],
    ["Casaca de jean oversize", "Casacas"],
    ["short jean desflecado", "Shorts"],
    ["Falda jean con botones", "Faldas"],
    ["vestido jean", "Vestidos"],
    ["Chaleco denim", "Chalecos"],
    ["Pantalón jean", "Jeans"],
    ["pantalon de jean clasico", "Jeans"],
    ["Pantalón tipo vaquero", "Jeans"],
    ["Pantalón palazzo negro", "Pantalones"],
    ["Pantalón de vestir", "Pantalones"],
    ["Vestido camisero", "Vestidos"],
    ["Blusa tipo camisa", "Camisas y Blusas"],
    ["Polera canguro con capucha", "Poleras"],
    ["Canguro negro", "Riñoneras"],
    ["Correa de cuero", "Cinturones"],
    ["Collar de perlas", "Collares"],
    ["Linda chompa tejida", "Chompas"],
    ["Polo manga larga", "Polos"],
    ["T-shirt básico", "Polos"],
    ["Conjunto de blusa y falda", "Conjuntos"],
    ["Top crop negro", "Tops"],
    ["Lentes de sol carey", "Lentes de sol"],
    ["Sandalia de taco", "Sandalias"],
    ["Zapatillas blancas urbanas", "Zapatillas"],
    ["Bolso de mano", "Bolsos y Carteras"],
    ["Pañoleta de seda", "Pañuelos y Pañoletas"],
    ["Lápices de colores x12", "Colores"],
    ["Blusa colores pastel", "Camisas y Blusas"],
  ])("«%s» → %s", (descripcion, esperada) => {
    expect(nombreSugerido(descripcion)).toBe(esperada);
  });

  it("en el mismo lugar gana la frase más larga: «enterizo de baño» es traje de baño si Trajes de baño está activa", () => {
    expect(nombreSugerido("Enterizo de baño floral", TODAS)).toBe("Trajes de baño");
    // Con Trajes de baño apagada (como hoy), lo más parecido que la asesora puede elegir es Enterizos.
    expect(nombreSugerido("Enterizo de baño floral")).toBe("Enterizos");
  });

  it("«pantalón jean» sin la categoría Jeans activa sigue siendo pantalón (no sugiere algo que no se puede elegir)", () => {
    const sinJeans = CATEGORIAS.filter((c) => c.prefijo !== "JEA");
    expect(nombreSugerido("Pantalón jean", sinJeans)).toBe("Pantalones");
    expect(nombreSugerido("Jean azul", sinJeans)).toBeNull();
  });
});

describe("dice qué palabra la delató, tal como la escribió la asesora", () => {
  it("la palabra original, con sus mayúsculas y tildes", () => {
    expect(sugerirCategoria("Jean azul", CATEGORIAS)?.palabra).toBe("Jean");
    expect(sugerirCategoria("Pantalón JEAN clásico", CATEGORIAS)?.palabra).toBe("JEAN");
    expect(sugerirCategoria("Lentes de sol carey", CATEGORIAS)?.palabra).toBe("Lentes de sol");
    expect(sugerirCategoria("Correa", CATEGORIAS)?.palabra).toBe("Correa");
  });
});

describe("NEUTRO: sin una prenda nombrada no sugiere nada (mejor callar que adivinar)", () => {
  it.each(["", "   ", "azul talla M", "Talla 28", "color rojo", "rojo 28", "linda", "Prenda nueva", "Producto sin etiqueta"])("«%s» → nada", (d) => {
    expect(sugerirCategoria(d, CATEGORIAS)).toBeNull();
  });

  it("sin categorías no sugiere nada", () => {
    expect(sugerirCategoria("Jean azul", [])).toBeNull();
  });

  it("dos categorías con la misma palabra y el mismo peso: no elige ninguna", () => {
    const dos = [
      { id: "a", nombre: "Vinchas", prefijo: null },
      { id: "b", nombre: "Vinchas", prefijo: null },
    ];
    expect(sugerirCategoria("vincha dorada", dos)).toBeNull();
  });
});

describe("una categoría creada o renombrada sin deploy se sigue sugiriendo", () => {
  it("una categoría nueva sin entrada en la tabla se encuentra por su nombre", () => {
    const conKimonos = [...CATEGORIAS, { id: "id-KIM", nombre: "Kimonos", prefijo: "KIM" }];
    expect(nombreSugerido("Kimono floral", conKimonos)).toBe("Kimonos");
  });

  it("si Casacas vuelve a llamarse «Casacas/Chaquetas», «chaqueta» sigue llevando a ella (va por prefijo, no por nombre)", () => {
    const renombrada = CATEGORIAS.map((c) => (c.prefijo === "CAS" ? { ...c, nombre: "Casacas/Chaquetas" } : c));
    expect(nombreSugerido("chaqueta acolchada", renombrada)).toBe("Casacas/Chaquetas");
  });
});

describe("cuándo se le muestra a la asesora (sugerenciaParaMostrar)", () => {
  const PANTALONES = "id-PAN";
  it("casos reales de AQP: ventas «Jean…» guardadas como Pantalones → sugiere Jeans", () => {
    for (const d of ["Jean azul", "Jean negro tiro alto", "Jean celeste skinny"]) {
      expect(sugerenciaParaMostrar(d, PANTALONES, CATEGORIAS)?.nombre, d).toBe("Jeans");
    }
  });

  it("la descripción que el sistema armó solo no cuenta como evidencia", () => {
    expect(sugerenciaParaMostrar(null, PANTALONES, CATEGORIAS)).toBeNull();
  });

  it("si la descripción nombra la categoría ya elegida, no hay nada que decir", () => {
    expect(sugerenciaParaMostrar("Pantalones · Negro · Talla 28", PANTALONES, CATEGORIAS)).toBeNull();
    expect(sugerenciaParaMostrar("pantalón palazzo", PANTALONES, CATEGORIAS)).toBeNull();
  });

  it("sin categoría elegida todavía, sugiere la que nombra la descripción", () => {
    expect(sugerenciaParaMostrar("correa de cuero", "", CATEGORIAS)?.nombre).toBe("Cinturones");
  });

  it("SIGUE AL CONTROL: cambia con lo escrito y vuelve (A → B → A)", () => {
    const a = sugerenciaParaMostrar("jean azul", PANTALONES, CATEGORIAS)?.nombre;
    const b = sugerenciaParaMostrar("chaqueta azul", PANTALONES, CATEGORIAS)?.nombre;
    const a2 = sugerenciaParaMostrar("jean azul", PANTALONES, CATEGORIAS)?.nombre;
    expect([a, b, a2]).toEqual(["Jeans", "Casacas", "Jeans"]);
    // Y si la asesora cambia la categoría a la sugerida, la sugerencia desaparece.
    expect(sugerenciaParaMostrar("jean azul", "id-JEA", CATEGORIAS)).toBeNull();
  });

  it("ESTABLE: lo mismo da siempre lo mismo (sin azar, sin red)", () => {
    const una = sugerirCategoria("Chaqueta jean oversize", CATEGORIAS);
    for (let i = 0; i < 5; i++) expect(sugerirCategoria("Chaqueta jean oversize", CATEGORIAS)).toEqual(una);
  });
});

describe("singular y palabras", () => {
  it.each([
    ["pantalones", "pantalon"], ["collares", "collar"], ["colores", "color"], ["lapices", "lapiz"], ["jeans", "jean"], ["aretes", "arete"],
    ["trajes", "traje"], ["bodys", "body"], ["tops", "top"], ["shorts", "short"], ["botines", "botin"], ["sueteres", "sueter"], ["top", "top"],
  ])("%s → %s", (palabra, esperado) => {
    expect(singular(palabra)).toBe(esperado);
  });

  it("sin tildes, sin mayúsculas, sin signos", () => {
    expect(formas("Pantalón · JEAN-azul")).toEqual(["pantalon", "jean", "azul"]);
  });

  it("el combo de categorías recibe las palabras de la tabla («correa» encuentra Cinturones)", () => {
    expect(sinonimosDeCategoria("CIN")).toContain("correa");
    expect(sinonimosDeCategoria(null)).toEqual([]);
    expect(sinonimosDeCategoria("NO-EXISTE")).toEqual([]);
  });
});
