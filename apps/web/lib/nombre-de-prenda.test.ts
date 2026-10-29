import { describe, expect, it } from "vitest";
import { MAX_NOMBRE_PRODUCTO } from "./catalogo-topes";
import { claveTexto } from "./nombres-parecidos";
import {
  FAMILIAS_CON_NOMBRE_PROPIO,
  FLORES,
  LARGO_NOMBRE_PROPIO,
  TIPOS_POR_CATEGORIA,
  armarReferencia,
  avisosDeReferencia,
  avisosDelNombre,
  floresLibres,
  lineaDescriptiva,
  nombreDelProveedorComoNombre,
  otrosTipos,
  separarNombre,
  tiposDeCategoria,
} from "./nombre-de-prenda";
import { FICHAS_POR_CATEGORIA } from "./sugerencias-alta-producto";

const reglas = (propio: string, tipos: readonly string[] = ["Blusa", "Camisa"]) =>
  avisosDelNombre(propio, { tipos, otrosTipos: otrosTipos("CMS") }).map((a) => a.regla);

describe("la lista de flores", () => {
  it("cada flor es una sola palabra de 3 a 9 letras, sin repetirse", () => {
    const claves = FLORES.map(claveTexto);
    expect(new Set(claves).size).toBe(FLORES.length);
    for (const f of FLORES) {
      expect(f).toMatch(/^\p{Lu}\p{Ll}+$/u);
      expect(f.length).toBeGreaterThanOrEqual(LARGO_NOMBRE_PROPIO.min);
      expect(f.length).toBeLessThanOrEqual(LARGO_NOMBRE_PROPIO.max);
    }
  });

  it("ninguna flor de la lista dispara un aviso (no es color, talla, tipo ni palabra de temporada)", () => {
    for (const f of FLORES) expect(reglas(f), f).toEqual([]);
  });

  it("las flores que son colores quedaron fuera", () => {
    for (const color of ["Rosa", "Violeta", "Lila", "Lavanda", "Fucsia", "Malva"]) expect(FLORES).not.toContain(color);
  });

  it("el nombre completo más largo cabe en la base", () => {
    const tipoMasLargo = Object.values(TIPOS_POR_CATEGORIA).flat().sort((a, b) => b.length - a.length)[0];
    const florMasLarga = [...FLORES].sort((a, b) => b.length - a.length)[0];
    expect(armarReferencia(tipoMasLargo, `${florMasLarga} corto`).length).toBeLessThanOrEqual(MAX_NOMBRE_PRODUCTO);
  });
});

describe("el tipo sale de la categoría", () => {
  it("TOTALIDAD: cada categoría de moda que tiene ejemplo tiene su tipo, y el de fábrica es la prenda del ejemplo", () => {
    for (const [prefijo, tipos] of Object.entries(TIPOS_POR_CATEGORIA)) {
      expect(tipos.length, prefijo).toBeGreaterThan(0);
      expect(FICHAS_POR_CATEGORIA[prefijo]?.prenda, prefijo).toBe(tipos[0]);
    }
  });

  it("solo la moda lleva nombre propio: belleza, papelería y una familia nueva son libres", () => {
    expect(tiposDeCategoria({ prefijo: "CMS", familia: "indumentaria" })).toEqual(["Blusa", "Camisa"]);
    expect(tiposDeCategoria({ prefijo: "MAQ", familia: "belleza" })).toEqual([]);
    expect(tiposDeCategoria({ prefijo: "LIB", familia: "papeleria" })).toEqual([]);
    expect(tiposDeCategoria({ prefijo: "CMS", familia: "empaque" })).toEqual([]);
    expect(tiposDeCategoria({ prefijo: "NUE", familia: "indumentaria" })).toEqual([]);
    expect(tiposDeCategoria(null)).toEqual([]);
    expect(FAMILIAS_CON_NOMBRE_PROPIO).not.toContain("belleza");
  });

  it("ningún tipo se repite entre dos categorías (si no, no se sabría a cuál avisar)", () => {
    const todos = Object.values(TIPOS_POR_CATEGORIA).flat().map(claveTexto);
    expect(new Set(todos).size).toBe(todos.length);
  });
});

describe("armar y separar el nombre", () => {
  it("tipo + flor, en el formato que guarda la base", () => {
    expect(armarReferencia("Blusa", "  dalia ")).toBe("Blusa Dalia");
    expect(armarReferencia("Pantalón", "hortensia corto")).toBe("Pantalón Hortensia Corto");
    expect(armarReferencia("Blusa", "")).toBe("");
  });

  it("separa lo guardado, sin importar tildes, mayúsculas ni plural", () => {
    expect(separarNombre("Blusa Dalia", ["Blusa", "Camisa"])).toEqual({ tipo: "Blusa", propio: "Dalia" });
    expect(separarNombre("camisa  Lirio Corta", ["Blusa", "Camisa"])).toEqual({ tipo: "Camisa", propio: "Lirio Corta" });
    expect(separarNombre("Pantalon Ámbar", ["Pantalón"])).toEqual({ tipo: "Pantalón", propio: "Ámbar" });
    expect(separarNombre("Falda Plisada", ["Blusa"])).toEqual({ tipo: null, propio: "Falda Plisada" });
  });
});

describe("la flor que sigue", () => {
  it("sin prendas en la categoría, las primeras de la lista", () => {
    expect(floresLibres({ referencias: [], tipos: ["Blusa"] })).toEqual(["Dalia", "Magnolia", "Camelia"]);
  });

  it("salta las que ya usa la categoría, en cualquier tipo y versión", () => {
    const referencias = ["Blusa Dalia", "Camisa Magnolia Manga Corta", "Blusa Emma"];
    expect(floresLibres({ referencias, tipos: ["Blusa", "Camisa"], cuantas: 2 })).toEqual(["Camelia", "Gardenia"]);
  });

  it("salta una flor que el vocabulario tiene como color", () => {
    expect(floresLibres({ referencias: [], tipos: ["Blusa"], colores: ["Magnolia"], cuantas: 2 })).toEqual(["Dalia", "Camelia"]);
  });

  it("ESTABLE: el mismo catálogo da siempre la misma flor", () => {
    const o = { referencias: ["Blusa Dalia"], tipos: ["Blusa"] };
    expect(floresLibres(o)).toEqual(floresLibres(o));
  });

  it("si se acaban, vuelve a empezar en vez de no sugerir nada", () => {
    const referencias = FLORES.map((f) => `Blusa ${f}`);
    expect(floresLibres({ referencias, tipos: ["Blusa"], cuantas: 1 })).toEqual(["Dalia"]);
  });
});

describe("los avisos del nombre (nunca bloquean)", () => {
  it("una flor sola, o con la versión de un modelo que se repite, está bien", () => {
    expect(reglas("Dalia")).toEqual([]);
    expect(reglas("Hortensia corto")).toEqual([]);
  });

  it("el color va en el paso 3, también en femenino o con sinónimo del vocabulario", () => {
    expect(reglas("Negra Aurora")).toContain("color");
    expect(reglas("Dalia blanca")).toContain("color");
    expect(avisosDelNombre("Dalia Petróleo", { tipos: ["Blusa"], colores: ["Petróleo"] }).map((a) => a.regla)).toContain("color");
    expect(avisosDelNombre("Dalia negra", { tipos: ["Blusa"] })[0].texto).toBe("«Negra» es un color: va en los colores de la prenda, no en el nombre.");
  });

  it("la talla, los números y las palabras que cambian con el tiempo", () => {
    expect(reglas("Dalia M")).toContain("talla");
    expect(reglas("Dalia 2")).toContain("numero");
    expect(reglas("Oferta")).toContain("palabra");
    expect(reglas("Dalia verano")).toContain("palabra");
  });

  it("el tipo repetido y el tipo de otra categoría", () => {
    expect(reglas("Blusa Dalia")).toEqual(["tipo-repetido"]);
    expect(reglas("Blusas Dalia")).toEqual(["tipo-repetido"]);
    expect(reglas("Casaca Río")).toEqual(["otro-tipo"]);
  });

  it("el largo mira solo la primera palabra", () => {
    expect(reglas("Al")).toEqual(["largo"]);
    expect(reglas("Constantinopla")).toEqual(["largo"]);
    expect(reglas("Dalia de manga muy larga")).toEqual([]);
  });

  it("vacío no avisa nada: eso lo dice «falta el nombre»", () => {
    expect(reglas("   ")).toEqual([]);
  });

  it("un nombre guardado (Editar producto) se mira después de su tipo; una categoría libre no avisa", () => {
    expect(avisosDeReferencia("Blusa Negra Aurora", { tipos: ["Blusa", "Camisa"] }).map((a) => a.regla)).toEqual(["color"]);
    expect(avisosDeReferencia("Blusa Dalia", { tipos: ["Blusa", "Camisa"] })).toEqual([]);
    expect(avisosDeReferencia("Bolsa de papel mediana", { tipos: [] })).toEqual([]);
  });
});

describe("la línea que va bajo el nombre", () => {
  it("detalle, tejido y patrón, sin decir «Liso»", () => {
    expect(lineaDescriptiva({ detalle: "manga globo, botones forrados", tejido: "Lino", patron: "Rayas" })).toBe("Manga globo, botones forrados · Lino · Rayas");
    expect(lineaDescriptiva({ detalle: "", tejido: "Lino", patron: "Liso" })).toBe("Lino");
    expect(lineaDescriptiva({ detalle: "  ", tejido: null, patron: null })).toBe("");
  });
});

describe("el nombre del proveedor, primero si sirve (Felipe 2026-10-28)", () => {
  const o = { tipos: ["Polo"], otrosTipos: otrosTipos("POL") };

  it("un nombre propio del proveedor sirve, sin el tipo ni la marca", () => {
    expect(nombreDelProveedorComoNombre("Evaluna", o)).toBe("Evaluna");
    expect(nombreDelProveedorComoNombre("polo evaluna", o)).toBe("Evaluna");
    expect(nombreDelProveedorComoNombre("Krisstell Polo Evaluna", { ...o, marca: "Krisstell" })).toBe("Evaluna");
    expect(nombreDelProveedorComoNombre("Comfo Corto", o)).toBe("Comfo");
    expect(nombreDelProveedorComoNombre("Evaluna 311", o)).toBe("Evaluna");
  });

  it("un código, una descripción o algo vacío no sirven: se sugiere una flor", () => {
    expect(nombreDelProveedorComoNombre("SS25 311", o)).toBeNull();
    expect(nombreDelProveedorComoNombre("Mod. 115", o)).toBeNull();
    expect(nombreDelProveedorComoNombre("Blusa dama", { tipos: ["Blusa", "Camisa"], otrosTipos: otrosTipos("CMS") })).toBeNull();
    expect(nombreDelProveedorComoNombre("Wide leg", { tipos: ["Pantalón"], otrosTipos: otrosTipos("PAN") })).toBeNull();
    expect(nombreDelProveedorComoNombre("Polo básico", o)).toBeNull();
    expect(nombreDelProveedorComoNombre("   ", o)).toBeNull();
  });

  it("si lo que queda rompe la regla (un color, tres palabras) tampoco", () => {
    expect(nombreDelProveedorComoNombre("Evaluna negra", o)).toBeNull();
    expect(nombreDelProveedorComoNombre("Evaluna Sol Mar", o)).toBeNull();
  });
});
