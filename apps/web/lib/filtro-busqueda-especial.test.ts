import { describe, expect, it } from "vitest";
import casos from "./filtro-busqueda-especial.casos.json";
import { crearIndiceBusquedaEspecial, filtrarConBusquedaEspecial, interpretarBusquedaEspecial, type CamposBuscables, type FiltrosVisuales } from "./filtro-busqueda-especial";

// Las prendas y las respuestas viven en `filtro-busqueda-especial.casos.json`: el mismo archivo las lee la prueba de
// Postgres (scripts/pruebas/fn_movimientos_busqueda_especial.mjs), así que TypeScript y SQL no pueden separarse sin
// que una de las dos pruebas falle. Aquí quedan además las reglas que solo tienen sentido en pantalla (qué filtro
// visual pisa el texto) y las que se prueban sobre cómo se INTERPRETA lo escrito.
type FilaCaso = { id: string; producto: string; color: string | null; talla: string | null; sku: string | null; codigos: string[]; codigo?: string; productoCodigo?: string };

const leer = (f: FilaCaso): CamposBuscables => ({
  nombre: f.producto,
  sku: f.sku,
  codigosBarras: f.codigos,
  otrosCodigos: [f.codigo, f.productoCodigo].filter((x): x is string => !!x),
  color: f.color,
  talla: f.talla,
});

describe.each(casos.escenarios)("casos compartidos con Postgres — $nombre", (escenario) => {
  const filas = escenario.filas as FilaCaso[];
  const indice = crearIndiceBusquedaEspecial(filas, leer);

  it.each(escenario.casos)("«$consulta»", (caso) => {
    const esperado = caso.esperado === "todas" ? filas.map((f) => f.id) : caso.esperado;
    expect(filtrarConBusquedaEspecial(indice, caso.consulta).filas.map((f) => f.id)).toEqual(esperado);
  });
});

// ---------------------------------------------------------------------------
// Sobre el catálogo de Existencias
// ---------------------------------------------------------------------------

const FILAS = casos.escenarios[0].filas as FilaCaso[];
const INDICE = crearIndiceBusquedaEspecial(FILAS, leer);
const buscar = (consulta: string, visuales?: FiltrosVisuales<FilaCaso>) => filtrarConBusquedaEspecial(INDICE, consulta, visuales).filas.map((f) => f.id);
const de = (producto: string, color: string, tallas: string[]) => tallas.map((t) => `${producto} ${color} ${t}`);
const interpretar = (consulta: string, indice = INDICE) => interpretarBusquedaEspecial(consulta, indice.vocabulario);

describe("cómo se interpreta lo escrito", () => {
  it("un término suelto que es una talla de los datos se lee como talla, no como texto", () => {
    expect(interpretar("blusa m").terminos.map((t) => t.tipo)).toEqual(["texto", "talla"]);
    expect(interpretar("30").terminos[0].tipo).toBe("talla");
  });

  it("un término que parece talla pero no existe en los datos es texto (y no rompe nada)", () => {
    expect(interpretar("xl").terminos.map((t) => t.tipo)).toEqual(["texto"]);
    expect(interpretar("xl").dimensiones).toEqual({ talla: false, color: false });
    expect(interpretar("3").terminos[0].tipo).toBe("texto");
  });

  it("el vocabulario sale de los datos: sin talla L en las filas, «l» es texto", () => {
    const soloSyM = crearIndiceBusquedaEspecial(FILAS.filter((f) => f.talla === "S" || f.talla === "M"), leer);
    expect(interpretar("l", soloSyM).terminos[0].tipo).toBe("texto");
    expect(interpretar("m", soloSyM).terminos[0].tipo).toBe("talla");
    expect([...soloSyM.vocabulario.tallas].sort()).toEqual(["m", "s"]);
  });

  it("un color completo se lee como color, en cualquier género, número o alias", () => {
    for (const consulta of ["blanco", "blanca", "blancas", "rosada", "rosa", "cafe", "anaranjada", "azul", "marino", "palo", "azules", "marrones"]) {
      expect(interpretar(consulta).terminos[0].tipo, consulta).toBe("color");
    }
  });

  it("un color a medias («ros», «blan») es texto: no cuenta como color dicho", () => {
    expect(interpretar("ros").dimensiones).toEqual({ talla: false, color: false });
    expect(interpretar("blan").dimensiones).toEqual({ talla: false, color: false });
  });

  it("las palabras que solo acompañan («talla», «color», «de») no son términos", () => {
    expect(interpretar("blusa talla m").terminos.map((t) => t.texto)).toEqual(["blusa", "m"]);
    expect(interpretar("blusa de color rosado").terminos.map((t) => t.texto)).toEqual(["blusa", "rosado"]);
  });

  it("…pero si son lo único escrito se buscan como texto: al teclear «denim» no se ve todo con «de»", () => {
    expect(interpretar("de").terminos.map((t) => t.texto)).toEqual(["de"]);
    expect(interpretar("talla color").terminos.map((t) => t.texto)).toEqual(["talla", "color"]);
  });

  it("el plural suma el singular, pero no toca números ni palabras cortas", () => {
    const singulares = (consulta: string) => {
      const t = interpretar(consulta).terminos[0];
      return t.tipo === "texto" ? t.singulares : [];
    };
    expect(singulares("blusas")).toEqual(["blusa"]);
    expect(singulares("pantalones")).toEqual(["pantalon", "pantalone"]);
    expect(singulares("mas")).toEqual([]);
    expect(singulares("77591s")).toEqual([]);
  });

  it("un nombre que termina en «s» no amplía la búsqueda: «inés» no trae lo que solo tenga «ine» dentro de un código", () => {
    expect(buscar("ines")).toEqual(de("Pantalón Inés", "Azul marino", ["28", "30", "32"]));
    expect(buscar("ine")).toEqual(buscar("ines")); // a medias, lo mismo
  });

  it("el color solo suma equivalentes que existen en los datos: «blancas» busca «blanco», no un trozo suelto «blanca»", () => {
    const t = interpretar("blancas").terminos[0];
    expect(t.tipo === "color" && t.formas).toEqual(["blancas", "blanco"]);
  });
});

describe("qué dimensiones dice el texto", () => {
  const dimensiones = (consulta: string) => interpretar(consulta).dimensiones;

  it("talla y color se reconocen cuando son términos independientes", () => {
    expect(dimensiones("blusa m rosado")).toEqual({ talla: true, color: true });
    expect(dimensiones("blusa l")).toEqual({ talla: true, color: false });
    expect(dimensiones("blusa blanca")).toEqual({ talla: false, color: true });
    expect(dimensiones("azul")).toEqual({ talla: false, color: true }); // «Azul marino»
    expect(dimensiones("palo")).toEqual({ talla: false, color: true }); // «Palo rosa»
  });

  it("un nombre, un SKU o un código no dicen ninguna dimensión", () => {
    for (const consulta of ["blusa", "blu", "BLU-MARI-ROS-M", "7759100000004", "elena", ""]) expect(dimensiones(consulta), consulta).toEqual({ talla: false, color: false });
  });
});

describe("el texto manda sobre el filtro visual de su misma dimensión", () => {
  it("«blusa m rosado» ignora Talla=L y Color=Beige: dijo M y rosado", () => {
    expect(buscar("blusa m rosado", { talla: "L", color: "Beige" })).toEqual(["Blusa Mariela Rosado M"]);
  });

  it("solo se ignora la dimensión que el texto dice: «blusa rosado» suelta Color pero Talla=L sigue aplicando", () => {
    expect(buscar("blusa rosado", { talla: "L", color: "Beige" })).toEqual(["Blusa Mariela Rosado L"]);
    expect(buscar("blusa m", { talla: "S", color: "Negro" })).toEqual(["Blusa Elena Negro M"]);
  });

  it("si el texto no dice talla ni color, los dos filtros visuales aplican: «blusa» + L + Beige", () => {
    expect(buscar("blusa", { talla: "L", color: "Beige" })).toEqual(["Blusa Elena Beige L"]);
    expect(buscar("elena", { color: "Negro" })).toEqual(de("Blusa Elena", "Negro", ["S", "M", "L"]));
  });

  it("sin texto, mandan los filtros visuales", () => {
    expect(buscar("", { talla: "L", color: "Beige" })).toEqual(["Blusa Elena Beige L", "Casaca Paula Beige L"]);
    expect(buscar("   ", { talla: "L", color: "Beige" })).toEqual(["Blusa Elena Beige L", "Casaca Paula Beige L"]);
  });

  it("los demás filtros (categoría, estado…) nunca los ignora el texto", () => {
    const soloVestidos = (f: FilaCaso) => f.producto.startsWith("Vestido");
    expect(buscar("rosado l", { talla: "S", otros: soloVestidos })).toEqual(["Vestido Lorena Rosado L"]);
    expect(buscar("blusa m rosado", { otros: soloVestidos })).toEqual([]);
    expect(buscar("", { otros: soloVestidos })).toHaveLength(3);
  });

  it("devuelve qué dimensiones dijo el texto, para que la pantalla avise cuál filtro visual no se está usando", () => {
    expect(filtrarConBusquedaEspecial(INDICE, "rosado", { talla: "L" }).dimensiones).toEqual({ talla: false, color: true });
    expect(filtrarConBusquedaEspecial(INDICE, "blusa m rosado").dimensiones).toEqual({ talla: true, color: true });
  });
});

describe("filas incompletas", () => {
  it("una prenda sin color, talla, SKU ni códigos no rompe la búsqueda ni aparece por accidente", () => {
    expect(buscar("blusa", { color: "Negro" }).every((id) => id.includes("Negro"))).toBe(true);
    expect(buscar("cinturon", { color: "Negro" })).toEqual([]); // sin color no cumple un filtro de color
  });

  it("sin filas, todo da vacío", () => {
    const vacio = crearIndiceBusquedaEspecial<FilaCaso>([], leer);
    expect(filtrarConBusquedaEspecial(vacio, "blusa m").filas).toEqual([]);
  });
});
