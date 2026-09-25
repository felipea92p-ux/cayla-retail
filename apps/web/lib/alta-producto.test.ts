import { describe, expect, it } from "vitest";
import {
  claveCelda,
  claveReferencia,
  codigoBasePrevisto,
  codigoVariantePrevisto,
  construirCeldas,
  desbloqueos,
  faltaDelPaso,
  ordenarFotosAlta,
  pasoAlcanzable,
  pasoDeProblema,
  pasoHecho,
  leerErrorAlta,
  margenPorcentaje,
  nivelMargen,
  ordenarColores,
  problemasAlta,
  repartirFamilias,
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

describe("claveReferencia — espejo de fn_clave_referencia", () => {
  it("ignora tildes, mayúsculas, espacios y puntuación", () => {
    expect(claveReferencia("Blusa Aurora.")).toBe(claveReferencia("blúsa  AURORA"));
    expect(claveReferencia("Top Lily")).not.toBe(claveReferencia("Top Lili"));
  });
  it("renombrar solo el formato NO es un nombre nuevo", () => {
    expect(claveReferencia(tituloReferencia("polo   natalia"))).toBe(claveReferencia("Polo Natalia"));
  });
  it("solo símbolos queda vacío", () => {
    expect(claveReferencia("...")).toBe("");
  });
  it("pliega solo áéíóúüñ, igual que la base: ç, à y ö se descartan como puntuación", () => {
    // fn_clave_referencia: translate('áéíóúüñ' → 'aeiouun') y luego se borra todo lo que no sea a-z0-9.
    expect(claveReferencia("Ñandú Peña")).toBe("nandupena");
    expect(claveReferencia("Açaí")).toBe("aai");
    expect(claveReferencia("Blüsa Nöel")).toBe("blusanel");
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

describe("repartirFamilias — qué familias se ven de entrada y cuáles van tras «Ver más»", () => {
  // Las 6 reales, en el orden de `familias.orden` (Calzado está entre Indumentaria y Accesorios).
  const seis = ["indumentaria", "calzado", "accesorios", "bisuteria", "belleza", "papeleria"].map((codigo) => ({ codigo }));
  const codigos = (fs: { codigo: string }[]) => fs.map((f) => f.codigo);

  it("con las 6 de hoy: Indumentaria, Accesorios y Bisutería a la vista; Calzado, Belleza y Papelería tras «Ver más»", () => {
    const r = repartirFamilias(seis);
    expect(codigos(r.aLaVista)).toEqual(["indumentaria", "accesorios", "bisuteria"]);
    expect(codigos(r.masFamilias)).toEqual(["calzado", "belleza", "papeleria"]);
  });

  it("el orden lo manda la base, no este archivo: respeta el que trae la lista", () => {
    const r = repartirFamilias([{ codigo: "bisuteria" }, { codigo: "papeleria" }, { codigo: "indumentaria" }]);
    expect(codigos(r.aLaVista)).toEqual(["bisuteria", "indumentaria"]);
  });

  it("una familia nueva que este archivo no conoce cae tras «Ver más», no desaparece", () => {
    const r = repartirFamilias([...seis, { codigo: "hogar" }]);
    expect(codigos(r.masFamilias)).toContain("hogar");
    expect(codigos(r.aLaVista)).not.toContain("hogar");
  });

  it("si solo hay familias de las de siempre no hay nada tras «Ver más» (no se pinta el botón para nada)", () => {
    const r = repartirFamilias(seis.filter((f) => ["indumentaria", "accesorios", "bisuteria"].includes(f.codigo)));
    expect(r.masFamilias).toEqual([]);
  });

  it("si ninguna de las de siempre existe (renombradas o desactivadas) se ven todas: nunca un panel con solo «Ver más»", () => {
    const solo = [{ codigo: "calzado" }, { codigo: "belleza" }];
    const r = repartirFamilias(solo);
    expect(codigos(r.aLaVista)).toEqual(["calzado", "belleza"]);
    expect(r.masFamilias).toEqual([]);
  });

  it("sin familias no revienta", () => {
    expect(repartirFamilias([])).toEqual({ aLaVista: [], masFamilias: [] });
  });

  it("INVARIANTE: entre los dos grupos suman exactamente la entrada — ninguna familia se pierde ni se repite", () => {
    const casos = [seis, [...seis, { codigo: "hogar" }], seis.slice(1), seis.slice(0, 3), [{ codigo: "calzado" }], []];
    for (const entrada of casos) {
      const r = repartirFamilias(entrada);
      expect(codigos([...r.aLaVista, ...r.masFamilias]).sort()).toEqual(codigos(entrada).sort());
    }
  });
});

describe("pasos del alta — cada problema cae en su paso", () => {
  it("con todo resuelto, los 4 pasos están hechos y se llega al 4", () => {
    const p = problemasAlta(base);
    expect([1, 2, 3, 4].map((n) => pasoHecho(p, n as 1 | 2 | 3 | 4))).toEqual([true, true, true, true]);
    expect(pasoAlcanzable(p)).toBe(4);
  });
  it("sin categoría todo está pendiente y solo se entra al paso 1", () => {
    const p = problemasAlta({ ...base, categoriaId: "" });
    expect(pasoAlcanzable(p)).toBe(1);
    expect(pasoHecho(p, 3)).toBe(false);
  });
  it("nombre y marca son el paso 2; tallas, tejido y patrón el 3; tabla y precio el 4", () => {
    expect(pasoDeProblema(problemasAlta({ ...base, marcaId: "" })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, referencia: "" })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, tejidoId: "" })[0])).toBe(3);
    expect(pasoDeProblema(problemasAlta({ ...base, celdasIncluidas: 0 })[0])).toBe(4);
    expect(pasoDeProblema(problemasAlta({ ...base, precioBase: "" })[0])).toBe(4);
  });
  it("un paso con lo suyo resuelto no está hecho si falta uno anterior", () => {
    const p = problemasAlta({ ...base, marcaId: "" });
    expect(faltaDelPaso(p, 3)).toBeNull();
    expect(pasoHecho(p, 3)).toBe(false);
    expect(faltaDelPaso(p, 2)).toMatch(/marca/);
  });
});

describe("ordenarFotosAlta — la principal es la del primer color", () => {
  it("ordena por color elegido, las generales al final, y marca principal a la primera", () => {
    const r = ordenarFotosAlta(
      [
        { id: "g", colorCodigo: null },
        { id: "b2", colorCodigo: "BLA" },
        { id: "n", colorCodigo: "NEG" },
        { id: "b1", colorCodigo: "BLA" },
      ],
      ["NEG", "BLA"]
    );
    expect(r.map((f) => f.id)).toEqual(["n", "b2", "b1", "g"]);
    expect(r.map((f) => f.orden)).toEqual([0, 1, 2, 3]);
    expect(r.filter((f) => f.esPrincipal).map((f) => f.id)).toEqual(["n"]);
  });
  it("sin fotos devuelve una lista vacía", () => {
    expect(ordenarFotosAlta([], ["NEG"])).toEqual([]);
  });
});
