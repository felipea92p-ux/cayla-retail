import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sugerirDescripcion } from "./prenda-sin-registrar-reglas";
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
/** Los dos recorridos exhaustivos de colores (al final) no caben en los 5 s de vitest en un runner cargado; 30 s les sobra. */
const LIMITE_TOTALIDAD = 30_000;

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
    // Con cualquier categoría elegida, o sin ninguna todavía: sin texto escrito por la persona no hay nada que sugerir (rescate de
    // #788, 2026-10-12: un mutante que tomaba la descripción armada como escrita sobrevivía porque solo se probaba con Pantalones).
    for (const elegida of ["", "id-JEA", "id-VES", "id-CIN"]) expect(sugerenciaParaMostrar(null, elegida, CATEGORIAS), elegida).toBeNull();
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

// Revisión adversarial de #975: con «Pantalones», talla 28 y el color «Azul denim», la descripción se arma sola («Pantalones · Azul denim ·
// Talla 28»); apenas la asesora le agregaba « tiro alto» (lo que el pie la invita a hacer), el nombre del COLOR entraba a la búsqueda y
// salía «Escribiste «denim»: ¿no será Jeans?», citando una palabra que puso el sistema. Solo cuenta lo que ella escribió.
describe("solo cuenta lo que escribió la persona: ni la descripción armada ni el nombre del color", () => {
  const PANTALONES = "id-PAN";
  const AZD = "Azul denim";
  const armada = (categoria: string, color: string, talla = "28") => sugerirDescripcion(categoria, color, talla)!;

  it("los casos de la revisión: «denim» lo puso el sistema, no ella → nada", () => {
    for (const extra of [" tiro alto", " palazzo"]) {
      const d = armada("Pantalones", AZD) + extra;
      expect(sugerenciaParaMostrar(d, PANTALONES, CATEGORIAS, { armada: armada("Pantalones", AZD), color: AZD }), d).toBeNull();
    }
    // Una camisa «Azul denim» no es un jean.
    const camisa = armada("Camisas y Blusas", AZD, "M");
    expect(sugerenciaParaMostrar(`${camisa} manga larga`, "id-CMS", CATEGORIAS, { armada: camisa, color: AZD })).toBeNull();
    // Y si editó en medio (la armada ya no es el comienzo), el color sigue sin contar.
    expect(sugerenciaParaMostrar("Pantalones tiro alto · Azul denim · Talla 28", PANTALONES, CATEGORIAS, { armada: armada("Pantalones", AZD), color: AZD })).toBeNull();
  });

  it("la descripción armada tampoco delata nada: una categoría creada sin deploy cuyo nombre empieza con otra prenda («Tops y Polos»)", () => {
    const nueva: CategoriaParaSugerir = { id: "id-NUEVA", nombre: "Tops y Polos", prefijo: null };
    const conNueva = [...CATEGORIAS, nueva];
    const a = armada(nueva.nombre, "Negro", "M");
    // Leída entera, «Tops» iría primero y sugeriría Tops: lo escribió el sistema, no ella.
    expect(sugerirCategoria(`${a} tiro alto`, conNueva, ["Negro"])?.nombre).toBe("Tops");
    expect(sugerenciaParaMostrar(`${a} tiro alto`, nueva.id, conNueva, { armada: a, color: "Negro" })).toBeNull();
    // Lo que ella agrega sí cuenta.
    expect(sugerenciaParaMostrar(`${a} jean`, nueva.id, conNueva, { armada: a, color: "Negro" })?.nombre).toBe("Jeans");
  });

  it("lo que ELLA agregó sí cuenta, y la palabra que se cita es la suya", () => {
    const base = armada("Pantalones", AZD);
    expect(sugerenciaParaMostrar(`${base} jean`, PANTALONES, CATEGORIAS, { armada: base, color: AZD })).toEqual({ categoriaId: "id-JEA", nombre: "Jeans", palabra: "jean" });
    // Editando en medio, un pantalón que ella llamó «jean» sigue siendo un jean (la regla de refinar no mira el color).
    expect(sugerenciaParaMostrar("Pantalones tiro alto · Azul denim · Talla 28 jean", PANTALONES, CATEGORIAS, { armada: base, color: AZD })?.palabra).toBe("jean");
    // Con otro color, «denim» escrito por ella sí delata un jean.
    const negro = armada("Pantalones", "Negro");
    expect(sugerenciaParaMostrar("Pantalón denim · Negro · Talla 28", PANTALONES, CATEGORIAS, { armada: negro, color: "Negro" })?.nombre).toBe("Jeans");
    // Y lo escrito de cero, sin la armada, se lee entero (los casos de AQP).
    expect(sugerenciaParaMostrar("Jean mom azul denim", PANTALONES, CATEGORIAS, { armada: base, color: AZD })?.palabra).toBe("Jean");
  });

  it("TOTALIDAD sobre el control de color: TODOS los colores de las migraciones, con cada categoría activa, no sugieren nada por sí solos", () => {
    const colores = coloresDeLasMigraciones();
    // El lector no mira una lista vacía: la paleta tiene más de 80 colores, y «Azul denim» está.
    expect(colores.length).toBeGreaterThan(80);
    expect(colores).toContain(AZD);
    for (const c of CATEGORIAS) {
      for (const color of colores) {
        const a = armada(c.nombre, color, "M");
        expect(sugerenciaParaMostrar(`${a} tiro alto`, c.id, CATEGORIAS, { armada: a, color }), `${a} tiro alto`).toBeNull();
        // Editada en medio: el nombre de la categoría elegida va primero; el color, ciego.
        const enMedio = `${c.nombre} tiro alto · ${color} · Talla M`;
        expect(sugerenciaParaMostrar(enMedio, c.id, CATEGORIAS, { armada: a, color }), enMedio).toBeNull();
      }
    }
    // Recorre categorías × colores (miles de llamadas, ~0,16 ms cada una): 1,2 s en un Mac, pero más de 5 s (el límite de
    // vitest) en un runner del CI cargado con todos los archivos a la vez (PR #1004, 2026-10-14). Crece con la paleta.
  }, LIMITE_TOTALIDAD);

  it("y aunque un color futuro se llame como una prenda («Tono jean», «Rosa top»…), su nombre nunca delata una categoría", () => {
    const palabras = Object.values(SINONIMOS_POR_CATEGORIA).flat();
    for (const c of CATEGORIAS) {
      for (const p of palabras) {
        const color = `Tono ${p}`;
        const enMedio = `${c.nombre} tiro alto · ${color} · Talla M`;
        expect(sugerenciaParaMostrar(enMedio, c.id, CATEGORIAS, { armada: armada(c.nombre, color, "M"), color }), enMedio).toBeNull();
      }
    }
  }, LIMITE_TOTALIDAD);
});

/** Los nombres de color que las migraciones dejan en `retail.colores` (sus `insert … values` y sus renombres). */
function coloresDeLasMigraciones(): string[] {
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const nombres = new Set<string>();
  for (const archivo of readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f))) {
    const sql = readFileSync(new URL(archivo, dir), "utf8");
    for (const m of sql.matchAll(/insert into (?:retail\.)?colores\s*\([^)]*\)\s*values([\s\S]*?);/gi)) {
      for (const t of m[1]!.matchAll(/\(\s*'([A-Z0-9]{2,4})'\s*,\s*'([^']+)'/g)) nombres.add(t[2]!);
    }
    for (const m of sql.matchAll(/update (?:retail\.)?colores\s+set\s+nombre\s*=\s*'([^']+)'/gi)) nombres.add(m[1]!);
  }
  return [...nombres];
}

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
