import { describe, expect, it } from "vitest";
import {
  claveCelda,
  codigoBasePrevisto,
  codigoVariantePrevisto,
  construirCeldas,
  desbloqueos,
  leerErrorAlta,
  margenPorcentaje,
  nivelMargen,
  ordenarColores,
  problemasAlta,
  tituloReferencia,
  tokenTalla,
  type EstadoAlta,
} from "./alta-producto";
import { FAMILIAS_COLOR } from "./colores-familias";

const base: EstadoAlta = {
  categoriaId: "cat",
  marcaId: "m",
  proveedorId: "p",
  referencia: "Blusa Camila",
  comprobandoNombre: false,
  nombreBloqueado: false,
  nombreSinConfirmar: false,
  categoriaSinTallas: false,
  tallasElegidas: 3,
  exigeTejidoPatron: true,
  hayTejidosEnCategoria: true,
  hayPatronesEnCategoria: true,
  tejidoId: "tj",
  patronId: "pt",
  celdasIncluidas: 3,
  precioBase: "89.90",
  costoBase: "32",
};

describe("tituloReferencia — espejo del trigger de la base", () => {
  it("una sola forma de escribir, sin importar cómo se tipee", () => {
    expect(tituloReferencia("  blusa   CAMILA ")).toBe("Blusa Camila");
    expect(tituloReferencia("chompa CON rayas")).toBe("Chompa con Rayas");
  });
  it("el conector al inicio sí lleva mayúscula", () => {
    expect(tituloReferencia("con botones")).toBe("Con Botones");
  });
  it("respeta tildes al inicio de palabra", () => {
    expect(tituloReferencia("ÁRBOL de vida")).toBe("Árbol de Vida");
  });
  it("vacío queda vacío", () => {
    expect(tituloReferencia("   ")).toBe("");
  });
});

describe("tokenTalla — espejo de fn_token_talla", () => {
  it("Único → U, Estándar → STD, el resto en mayúscula sin símbolos", () => {
    expect(tokenTalla("Único")).toBe("U");
    expect(tokenTalla("Estándar")).toBe("STD");
    expect(tokenTalla("XL")).toBe("XL");
    expect(tokenTalla("35")).toBe("35");
    expect(tokenTalla(null)).toBe("U");
  });
});

describe("construirCeldas", () => {
  it("multiplica tallas por colores", () => {
    expect(construirCeldas(["s", "m"], ["NEG", "ROJ"])).toHaveLength(4);
  });
  it("sin nada elegido hay una sola variante", () => {
    expect(construirCeldas([], [])).toEqual([{ tallaId: null, color: null, clave: claveCelda(null, null) }]);
  });
  it("solo colores o solo tallas", () => {
    expect(construirCeldas([], ["NEG", "ROJ"])).toHaveLength(2);
    expect(construirCeldas(["s", "m", "l"], [])).toHaveLength(3);
  });
});

describe("margen", () => {
  it("se calcula sobre el precio de venta", () => {
    expect(margenPorcentaje(100, 40)).toBe(60);
  });
  it("sin precio no hay margen", () => {
    expect(margenPorcentaje(0, 10)).toBeNull();
    expect(margenPorcentaje(NaN, 10)).toBeNull();
  });
  it("clasifica negativo, bajo y normal", () => {
    expect(nivelMargen(-5)).toBe("negativo");
    expect(nivelMargen(12)).toBe("bajo");
    expect(nivelMargen(45)).toBe("normal");
    expect(nivelMargen(null)).toBeNull();
  });
});

describe("código previsto", () => {
  it("prefijo + correlativo siguiente", () => {
    expect(codigoBasePrevisto("TOP", 30)).toBe("TOP-0031");
    expect(codigoBasePrevisto("TOP", null)).toBe("TOP-0001");
    expect(codigoBasePrevisto(null, 4)).toBe("GEN-0005");
  });
  it("la variante suma color y talla; sin color no deja un guion suelto", () => {
    expect(codigoVariantePrevisto("TOP-0031", "NEG", "M")).toBe("TOP-0031-NEG-M");
    expect(codigoVariantePrevisto("GOR-0002", null, "Único")).toBe("GOR-0002-U");
  });
});

describe("ordenarColores", () => {
  const colores = [
    { codigo: "NEG", nombre: "Negro", hex: "#000", familiaColor: "neutro" },
    { codigo: "BLA", nombre: "Blanco", hex: "#fff", familiaColor: "neutro" },
    { codigo: "AZM", nombre: "Azul marino", hex: "#123", familiaColor: "azul" },
    { codigo: "VIN", nombre: "Vino", hex: "#411", familiaColor: "rojo" },
    { codigo: "XXX", nombre: "Raro", hex: null, familiaColor: "inexistente" },
  ];
  it("los más usados van al frente, ordenados por uso, y solo si tienen uso", () => {
    const r = ordenarColores(colores, { NEG: 9, AZM: 3, BLA: 0 }, FAMILIAS_COLOR);
    expect(r.frecuentes.map((c) => c.codigo)).toEqual(["NEG", "AZM"]);
  });
  it("respeta el tope de frecuentes", () => {
    const r = ordenarColores(colores, { NEG: 5, AZM: 4, VIN: 3 }, FAMILIAS_COLOR, 2);
    expect(r.frecuentes).toHaveLength(2);
  });
  it("agrupa por familia en el orden de la lista y no pierde un color sin familia", () => {
    const r = ordenarColores(colores, {}, FAMILIAS_COLOR);
    expect(r.grupos.map((g) => g.familia)).toEqual(["neutro", "azul", "rojo", "sin-familia"]);
    expect(r.grupos.flatMap((g) => g.colores)).toHaveLength(colores.length);
  });
});

describe("problemasAlta — qué falta, en frases de la persona", () => {
  it("un estado completo no tiene problemas", () => {
    expect(problemasAlta(base)).toEqual([]);
  });
  it("sin categoría, lo único que se pide es la categoría", () => {
    const p = problemasAlta({ ...base, categoriaId: "" });
    expect(p).toHaveLength(1);
    expect(p[0].bloque).toBe("categoria");
  });
  it("nombre idéntico a uno existente bloquea; casi igual pide confirmar", () => {
    expect(problemasAlta({ ...base, nombreBloqueado: true })[0].texto).toMatch(/Ya existe/);
    expect(problemasAlta({ ...base, nombreSinConfirmar: true })[0].texto).toMatch(/Confirma/);
  });
  it("Indumentaria exige tejido y patrón; sin exigencia no se piden", () => {
    const sin = problemasAlta({ ...base, tejidoId: "", patronId: "" });
    expect(sin.map((x) => x.texto)).toEqual(["Elige el tejido.", "Elige el patrón (si no tiene diseño, elige Liso)."]);
    expect(problemasAlta({ ...base, exigeTejidoPatron: false, tejidoId: "", patronId: "" })).toEqual([]);
  });
  it("familia que exige, con categoría sin tejidos habilitados: manda a configurar, no pide elegir lo imposible", () => {
    const p = problemasAlta({ ...base, hayTejidosEnCategoria: false, tejidoId: "" });
    expect(p).toHaveLength(1);
    expect(p[0].texto).toMatch(/configúralos/);
  });
  it("categoría sin tallas manda a configurarlas", () => {
    expect(problemasAlta({ ...base, categoriaSinTallas: true, tallasElegidas: 0 })[0].texto).toMatch(/no tiene tallas/);
  });
  it("precio 0, vacío o inválido no deja guardar; costo vacío sí", () => {
    for (const precioBase of ["", "0", "abc", "-3"]) {
      expect(problemasAlta({ ...base, precioBase }).some((x) => x.bloque === "precio")).toBe(true);
    }
    expect(problemasAlta({ ...base, costoBase: "" })).toEqual([]);
    expect(problemasAlta({ ...base, costoBase: "-1" })[0].texto).toMatch(/costo/);
  });
});

describe("desbloqueos — cada bloque se abre al resolver el anterior", () => {
  it("sin categoría no hay nada abierto", () => {
    expect(desbloqueos({ ...base, categoriaId: "" })).toEqual({ marca: false, nombre: false, atributos: false, colores: false, precio: false });
  });
  it("con categoría se abre la marca; sin marca y proveedor el nombre sigue cerrado", () => {
    expect(desbloqueos({ ...base, marcaId: "" })).toEqual({ marca: true, nombre: false, atributos: false, colores: false, precio: false });
    expect(desbloqueos({ ...base, proveedorId: "" }).nombre).toBe(false);
    expect(problemasAlta({ ...base, marcaId: "" })[0]).toEqual({ bloque: "marca", texto: "Elige la marca y el proveedor." });
  });
  it("con marca se abre el nombre; sin nombre no se abren los atributos", () => {
    expect(desbloqueos({ ...base, referencia: "" })).toEqual({ marca: true, nombre: true, atributos: false, colores: false, precio: false });
  });
  it("mientras se comprueba el nombre, los atributos siguen cerrados y el resumen lo dice", () => {
    expect(desbloqueos({ ...base, comprobandoNombre: true }).atributos).toBe(false);
    expect(problemasAlta({ ...base, comprobandoNombre: true })[0].texto).toMatch(/Comprobando/);
  });
  it("un nombre bloqueado o sin confirmar deja cerrados los atributos", () => {
    expect(desbloqueos({ ...base, nombreBloqueado: true }).atributos).toBe(false);
    expect(desbloqueos({ ...base, nombreSinConfirmar: true }).atributos).toBe(false);
  });
  it("colores y precio se abren cuando tallas y (si se exige) tejido/patrón están resueltos", () => {
    expect(desbloqueos(base)).toEqual({ marca: true, nombre: true, atributos: true, colores: true, precio: true });
    expect(desbloqueos({ ...base, tejidoId: "" })).toEqual({ marca: true, nombre: true, atributos: true, colores: false, precio: false });
    expect(desbloqueos({ ...base, tallasElegidas: 0 }).colores).toBe(false);
  });
});

describe("leerErrorAlta", () => {
  it("reconoce los dos hints de nombre y trae el id del existente", () => {
    expect(leerErrorAlta({ message: "Ya existe X", hint: "nombre_duplicado", details: "abc" })).toEqual({
      tipo: "nombre_duplicado",
      existenteId: "abc",
      mensaje: "Ya existe X",
    });
    expect(leerErrorAlta({ message: "casi", hint: "nombre_casi_igual" }).tipo).toBe("nombre_casi_igual");
  });
  it("todo lo demás cae a 'otro' para que lo traduzca traducirError", () => {
    expect(leerErrorAlta({ message: "x", hint: "tejido_obligatorio" })).toEqual({ tipo: "otro" });
    expect(leerErrorAlta(null)).toEqual({ tipo: "otro" });
  });
});
