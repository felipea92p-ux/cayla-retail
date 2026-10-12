import { describe, expect, it } from "vitest";
import {
  claveCelda,
  claveReferencia,
  codigoBasePrevisto,
  codigoVariantePrevisto,
  codigosRepetidos,
  construirCeldas,
  desbloqueos,
  estadoSubidaSinConexion,
  faltaDelPaso,
  fraseStockCreado,
  leerCantidad,
  limpiarCantidad,
  ordenarFotosAlta,
  PASOS_ALTA,
  pasoAbrible,
  piePaso,
  resumenStock,
  siguienteDelAlta,
  textoTallas,
  textoDestinoStock,
  TEXTO_FALTA_LUGAR,
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
import { sumarAlEje, type EjeIds } from "./alta-producto-ejes";
import { FAMILIAS_COLOR } from "./colores-familias";

const base: EstadoAlta = {
  categoriaId: "cat",
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
  stockTotal: 6,
  stockInvalidas: 0,
  sinStock: false,
  separaPiso: true,
  lugarCarga: "almacen",
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
  it("agrupa por familia en el orden de la lista (el del espectro: rojo antes que azul) y no pierde un color sin familia", () => {
    const r = ordenarColores(colores, {}, FAMILIAS_COLOR);
    // «inexistente» es una familia que el código no conoce: sale con su propio nombre, no escondida.
    expect(r.grupos.map((g) => g.familia)).toEqual(["neutro", "rojo", "azul", "inexistente"]);
    expect(r.grupos[3].texto).toBe("Inexistente");
    expect(r.grupos.flatMap((g) => g.colores)).toHaveLength(colores.length);
  });
});

describe("ordenarColores · cada familia va del más claro al más oscuro", () => {
  const azul = (codigo: string, nombre: string, hex: string | null) => ({ codigo, nombre, hex, familiaColor: "azul" });
  // Todos de la MISMA gama azul (matiz 259–265°, lejos del corte de 236°): el orden que se prueba es solo el de claridad. Con azules de 236°
  // —justo en el corte— el resultado dependía del corte y no de la claridad.
  it("ordena por claridad sin importar cómo llegaron, y los sin tono van al final", () => {
    const llegada = [azul("MAR", "Marino", "#0b1d3a"), azul("SIN", "Sin tono", null), azul("CEL", "Celeste", "#b9cdf3"), azul("ELE", "Eléctrico", "#1e5fd8"), azul("HIE", "Hielo", "#f0f4fc")];
    const g = ordenarColores(llegada, {}, FAMILIAS_COLOR).grupos.find((x) => x.familia === "azul")!;
    expect(g.colores.map((c) => c.codigo)).toEqual(["HIE", "CEL", "ELE", "MAR", "SIN"]);
  });
  it("es estable: el mismo resultado con la lista al revés", () => {
    const llegada = [azul("A", "Uno", "#336699"), azul("B", "Dos", "#336699"), azul("C", "Tres", "#99ccff")];
    const a = ordenarColores(llegada, {}, FAMILIAS_COLOR).grupos[0].colores.map((c) => c.codigo);
    const b = ordenarColores([...llegada].reverse(), {}, FAMILIAS_COLOR).grupos[0].colores.map((c) => c.codigo);
    expect(a).toEqual(b);
    expect(a[0]).toBe("C");
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
  it("el stock hay que decidirlo: sin unidades y sin marcar «todavía no tengo», no se crea", () => {
    expect(problemasAlta({ ...base, stockTotal: 0 })).toEqual([
      { bloque: "stock", texto: "Escribe cuántas tienes hoy, o marca que todavía no tienes." },
    ]);
    expect(problemasAlta({ ...base, stockTotal: 0, sinStock: true })).toEqual([]);
    // Con unidades escritas, la marca «todavía no» no importa: manda lo escrito.
    expect(problemasAlta({ ...base, stockTotal: 4, sinStock: true })).toEqual([]);
  });
  it("dónde están no viene marcado: con unidades, en una tienda que separa piso y almacén, hay que decirlo (ADR-0328)", () => {
    expect(problemasAlta({ ...base, lugarCarga: null })).toEqual([{ bloque: "stock", texto: TEXTO_FALTA_LUGAR }]);
    expect(problemasAlta({ ...base, lugarCarga: "piso" })).toEqual([]);
    expect(problemasAlta({ ...base, lugarCarga: "almacen" })).toEqual([]);
    // Sin unidades no hay nada que ubicar; en una tienda sin piso y almacén (el Taller) la pregunta no sale.
    expect(problemasAlta({ ...base, lugarCarga: null, stockTotal: 0, sinStock: true })).toEqual([]);
    expect(problemasAlta({ ...base, lugarCarga: null, separaPiso: false })).toEqual([]);
    // Una cantidad mal escrita se arregla primero: el aviso de dónde están espera a que las cantidades sean válidas.
    expect(problemasAlta({ ...base, lugarCarga: null, stockInvalidas: 1 })).toEqual([{ bloque: "stock", texto: "Las cantidades son números enteros, de 0 a 9999." }]);
  });
  it("una celda mal escrita frena aunque haya otras bien", () => {
    expect(problemasAlta({ ...base, stockInvalidas: 1 })[0]).toEqual({ bloque: "stock", texto: "Las cantidades son números enteros, de 0 a 9999." });
    expect(problemasAlta({ ...base, stockInvalidas: 1, sinStock: true })).toHaveLength(1);
  });
});

describe("paso 4 — cuántas hay hoy (carga inicial, ADR-0212)", () => {
  it("leerCantidad: vacío es 0; enteros de 0 a 9999; lo demás no es una cantidad (espejo de la RPC)", () => {
    expect(leerCantidad("")).toBe(0);
    expect(leerCantidad("  ")).toBe(0);
    expect(leerCantidad("0")).toBe(0);
    expect(leerCantidad("7")).toBe(7);
    expect(leerCantidad(" 12 ")).toBe(12);
    expect(leerCantidad("9999")).toBe(9999);
    for (const malo of ["10000", "2.5", "-1", "dos", "1e3", "3,0"]) expect(leerCantidad(malo)).toBeNull();
  });
  it("limpiarCantidad: al tipear solo quedan dígitos, hasta 4 (una cantidad imposible ni se escribe)", () => {
    expect(limpiarCantidad("12")).toBe("12");
    expect(limpiarCantidad("-3")).toBe("3");
    expect(limpiarCantidad("2.5")).toBe("25");
    expect(limpiarCantidad("abc")).toBe("");
    expect(limpiarCantidad("123456")).toBe("1234");
  });
  it("resumenStock suma solo las celdas que siguen en la tabla", () => {
    const cantidades = { a: "3", b: "", c: "2", quitada: "50" };
    expect(resumenStock(cantidades, ["a", "b", "c"])).toEqual({ total: 5, invalidas: 0, celdasConStock: 2 });
    expect(resumenStock(cantidades, ["a", "b", "c", "quitada"]).total).toBe(55);
    expect(resumenStock({}, ["a", "b"])).toEqual({ total: 0, invalidas: 0, celdasConStock: 0 });
    expect(resumenStock({ a: "x", b: "4" }, ["a", "b"])).toEqual({ total: 4, invalidas: 1, celdasConStock: 1 });
  });
  it("textoDestinoStock dice dónde quedan, como lo diría la persona", () => {
    expect(textoDestinoStock("Tienda TRU", "piso", true)).toBe("piso de venta de Tienda TRU");
    expect(textoDestinoStock("Tienda TRU", "almacen", true)).toBe("almacén de Tienda TRU");
    expect(textoDestinoStock("Tienda TRU", null, true)).toBe("Tienda TRU · falta decir si están colgadas o guardadas");
    expect(textoDestinoStock("Taller", "almacen", false)).toBe("Taller");
    expect(textoDestinoStock("Taller", null, false)).toBe("Taller");
  });
});

describe("desbloqueos — cada bloque se abre al resolver el anterior", () => {
  it("sin categoría no hay nada abierto", () => {
    expect(desbloqueos({ ...base, categoriaId: "" })).toEqual({ marca: false, nombre: false, atributos: false, colores: false, precio: false });
  });
  it("con categoría se abre lo siguiente: marca y proveedor son opcionales (ADR-0283), no traban el nombre ni piden nada", () => {
    expect(desbloqueos({ ...base, referencia: "" })).toEqual({ marca: true, nombre: true, atributos: false, colores: false, precio: false });
    expect(problemasAlta(base).map((p) => p.bloque)).not.toContain("marca");
  });
  it("con la categoría se abre el nombre; sin nombre no se abren los atributos", () => {
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

describe("sumarAlEje — ofrecer un valor más sin quitarle nada a la categoría", () => {
  const hoy: EjeIds = { tallaIds: ["s", "m"], tejidoIds: ["denim"], patronIds: ["liso"] };

  it("suma el tejido y devuelve los otros dos ejes intactos (la RPC reemplaza: lo que no se manda, se borra)", () => {
    expect(sumarAlEje(hoy, "tejidos", "lino")).toEqual({ tallaIds: ["s", "m"], tejidoIds: ["denim", "lino"], patronIds: ["liso"] });
  });

  it("cada tipo cae en su eje", () => {
    expect(sumarAlEje(hoy, "tallas", "l").tallaIds).toEqual(["s", "m", "l"]);
    expect(sumarAlEje(hoy, "patrones", "rayas").patronIds).toEqual(["liso", "rayas"]);
  });

  it("ofrecer uno que ya estaba no lo repite: reintentar tras un fallo es seguro", () => {
    expect(sumarAlEje(hoy, "tejidos", "denim")).toEqual(hoy);
  });
});

describe("pasos del alta — cada problema cae en su paso (4 preguntas, spike v2 2026-09-28)", () => {
  it("con todo resuelto, las 4 preguntas están contestadas y se llega a la 4", () => {
    const p = problemasAlta(base);
    expect(PASOS_ALTA).toEqual([1, 2, 3, 4]);
    expect(PASOS_ALTA.map((n) => pasoHecho(p, n))).toEqual([true, true, true, true]);
    expect(pasoAlcanzable(p)).toBe(4);
  });
  it("el stock cae en el paso 4, junto al precio: con el 3 completo se entra al 4", () => {
    const p = problemasAlta({ ...base, stockTotal: 0 });
    expect(p.map(pasoDeProblema)).toEqual([4]);
    expect(pasoHecho(p, 3)).toBe(true);
    expect(pasoHecho(p, 4)).toBe(false);
    expect(pasoAlcanzable(p)).toBe(4);
  });
  it("sin categoría todo está pendiente y solo se entra al paso 1", () => {
    const p = problemasAlta({ ...base, categoriaId: "" });
    expect(pasoAlcanzable(p)).toBe(1);
    expect(pasoHecho(p, 3)).toBe(false);
  });
  it("nombre, tejido y patrón son el paso 2; tallas y tabla el 3; precio y stock el 4", () => {
    expect(pasoDeProblema(problemasAlta({ ...base, referencia: "" })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, tejidoId: "" })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, patronId: "" })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, hayPatronesEnCategoria: false })[0])).toBe(2);
    expect(pasoDeProblema(problemasAlta({ ...base, tallasElegidas: 0 })[0])).toBe(3);
    expect(pasoDeProblema(problemasAlta({ ...base, categoriaSinTallas: true })[0])).toBe(3);
    expect(pasoDeProblema(problemasAlta({ ...base, celdasIncluidas: 0 })[0])).toBe(3);
    expect(pasoDeProblema(problemasAlta({ ...base, precioBase: "" })[0])).toBe(4);
    expect(pasoDeProblema(problemasAlta({ ...base, stockInvalidas: 2 })[0])).toBe(4);
  });
  it("lo que falta sale en el orden de la pantalla: primero el nombre, después el tejido", () => {
    const p = problemasAlta({ ...base, referencia: "", tejidoId: "", tallasElegidas: 0 });
    expect(p.map((x) => x.bloque)).toEqual(["nombre", "tela", "tallas"]);
  });
  it("un paso con lo suyo resuelto no está hecho si falta uno anterior", () => {
    const p = problemasAlta({ ...base, referencia: "" });
    expect(faltaDelPaso(p, 3)).toBeNull();
    expect(pasoHecho(p, 3)).toBe(false);
    expect(faltaDelPaso(p, 2)).toMatch(/nombre/);
  });
  it("desde la lista «Avance» se abre un paso solo si los anteriores están contestados", () => {
    const p = problemasAlta({ ...base, tejidoId: "" });
    expect([1, 2, 3, 4].map((n) => pasoAbrible(p, n as 1 | 2 | 3 | 4))).toEqual([true, true, false, false]);
    expect(PASOS_ALTA.every((n) => pasoAbrible([], n))).toBe(true);
    expect(PASOS_ALTA.map((n) => pasoAbrible(problemasAlta({ ...base, categoriaId: "" }), n))).toEqual([true, false, false, false]);
  });
});

describe("piePaso y siguienteDelAlta — el pie de cada paso y la línea de la ficha", () => {
  const listo = { listo: true, faltaElegir: false, motivo: null };
  const sinElegir = { listo: false, faltaElegir: true, motivo: "Elige quién hace esta operación." };
  const nadie = { listo: false, faltaElegir: false, motivo: "Nadie de turno en TRU: marca tu entrada en el kiosco para poder guardar." };

  it("un paso con algo pendiente dice qué le falta", () => {
    const p = problemasAlta({ ...base, tejidoId: "" });
    expect(piePaso(p, 2, listo)).toEqual({ texto: "Elige el tejido.", listo: false });
  });
  it("los pasos 2 y 3 completos invitan a seguir", () => {
    expect(piePaso([], 2, sinElegir)).toEqual({ texto: "Listo. Sigue cuando quieras.", listo: true });
    expect(piePaso([], 3, sinElegir).listo).toBe(true);
  });
  it("en el paso 4, si lo único que falta es el responsable, lo dice así", () => {
    expect(piePaso([], 4, sinElegir)).toEqual({ texto: "Solo falta elegir quién lo registra.", listo: false });
    expect(piePaso([], 4, nadie)).toEqual({ texto: nadie.motivo, listo: false });
    expect(piePaso([], 4, listo)).toEqual({ texto: "Todo listo. Revisa la ficha y crea el producto.", listo: true });
  });
  it("el paso 4 completo no dice «Todo listo» si falta algo de un paso anterior", () => {
    const p = problemasAlta({ ...base, referencia: "" });
    expect(piePaso(p, 4, listo)).toEqual({ texto: "Escribe el nombre del producto.", listo: false });
  });
  it("la ficha dice lo siguiente que falta; el responsable va al final, cuando todo lo demás está", () => {
    expect(siguienteDelAlta(problemasAlta({ ...base, precioBase: "" }), sinElegir)).toBe("Pon el precio de venta.");
    expect(siguienteDelAlta([], sinElegir)).toBe("Elige quién lo registra.");
    expect(siguienteDelAlta([], nadie)).toBe(nadie.motivo);
    expect(siguienteDelAlta([], listo)).toBeNull();
  });
});

describe("textoTallas — las tallas en el resumen del paso 3", () => {
  it("hasta 5 se leen todas", () => {
    expect(textoTallas(["S", "M", "L"])).toBe("S M L");
    expect(textoTallas([])).toBe("");
  });
  it("con más de 5, primera–última y cuántas", () => {
    expect(textoTallas(["26", "28", "30", "32", "34", "36", "38", "40", "42"])).toBe("26–42 (9)");
  });
});

describe("ordenarFotosAlta — la foto de «Todos los colores» es la principal", () => {
  it("la foto sin color va primero y es la principal; después las de cada color, en su orden", () => {
    const r = ordenarFotosAlta(
      [
        { id: "g", colorCodigo: null },
        { id: "b2", colorCodigo: "BLA" },
        { id: "n", colorCodigo: "NEG" },
        { id: "b1", colorCodigo: "BLA" },
      ],
      ["NEG", "BLA"]
    );
    expect(r.map((f) => f.id)).toEqual(["g", "n", "b2", "b1"]);
    expect(r.map((f) => f.orden)).toEqual([0, 1, 2, 3]);
    expect(r.filter((f) => f.esPrincipal).map((f) => f.id)).toEqual(["g"]);
  });
  it("solo con fotos por color, la principal sigue siendo la del primer color", () => {
    const r = ordenarFotosAlta([{ id: "b", colorCodigo: "BLA" }, { id: "n", colorCodigo: "NEG" }], ["NEG", "BLA"]);
    expect(r.filter((f) => f.esPrincipal).map((f) => f.id)).toEqual(["n"]);
  });
  it("sin fotos devuelve una lista vacía", () => {
    expect(ordenarFotosAlta([], ["NEG"])).toEqual([]);
  });
});

describe("alta sin conexión: qué pasó y qué decir del stock (ADR-0210 + ADR-0212)", () => {
  it("«subió» solo si salió de la cola sin que la descartaran", () => {
    expect(estadoSubidaSinConexion({})).toBeUndefined();
    expect(estadoSubidaSinConexion({ token: "t", enCola: { rechazo: null } })).toBe("esperando");
    expect(estadoSubidaSinConexion({ token: "t", enCola: { rechazo: "responsable_no_presente" } })).toBe("rechazada");
    expect(estadoSubidaSinConexion({ token: "t" })).toBe("subio");
    // Descartarla también la saca de la cola: no es «subió» (revisión adversarial del 2026-09-26).
    expect(estadoSubidaSinConexion({ token: "t", descartado: true })).toBe("descartada");
  });
  it("la frase del stock nunca dice «ya aparecen en Existencias» de algo que no entró", () => {
    const s = { unidades: 12, donde: "almacén de Tienda TRU" };
    expect(fraseStockCreado(s, false, undefined)).toBe("12 unidades cargadas al inventario (almacén de Tienda TRU): ya aparecen en Existencias.");
    expect(fraseStockCreado(s, true, "subio")).toMatch(/ya aparecen en Existencias/);
    for (const subida of ["esperando", "rechazada", "descartada"] as const) {
      expect(fraseStockCreado(s, true, subida)).not.toMatch(/Existencias/);
    }
    expect(fraseStockCreado(s, true, "descartada")).toMatch(/no se cargaron/);
    expect(fraseStockCreado(s, true, "rechazada")).toMatch(/todavía no entraron/);
    expect(fraseStockCreado({ unidades: 1, donde: "Taller" }, false, undefined)).toBe("1 unidad cargada al inventario (Taller): ya aparecen en Existencias.");
  });
});

describe("codigosRepetidos — la fila nueva que choca con una que ya existe", () => {
  it("marca solo la segunda aparición", () => {
    expect(codigosRepetidos(["CMS-0001-BLA-L", "CMS-0001-NEG-L", "CMS-0001-BLA-L"])).toEqual([2]);
  });
  it("un código desconocido no se compara", () => {
    expect(codigosRepetidos([null, null, "CMS-0001-U"])).toEqual([]);
  });
});
