import { describe, expect, it } from "vitest";
import {
  borradorCambia,
  distanciaDeEdicion,
  ordenarPorPrediccion,
  prediccionDe,
  ALFABETO,
  estadoDeMarca,
  letraDeMarca,
  letrasDeMarcas,
  MARCAS_POR_PAGINA,
  paginaDeLaPosicion,
  posicionDeLaLetra,
  rangoDeNombres,
  FILTROS_MARCAS,
  marcasDelFiltro,
  monogramaDeMarca,
  resumenDeMarcas,
  textoEstadoMarca,
  buscarMarcaProveedor,
  contarParejasPorCategoria,
  filtrarMarcas,
  problemaEdicionMarca,
  sePuedeEliminarMarca,
  textoProductosMarca,
  type BorradorMarca,
  type ParejaDeMarca,
  SIN_ID,
  filtroDeMarcaOProveedor,
  marcaAutomatica,
  marcasParecidas,
  proveedorAutomatico,
  proveedoresDeMarca,
  sugerenciasDeCategoria,
  type MarcaOpcion,
  type ProveedorOpcion,
  type Vinculo,
} from "./marcas";

const marcas: MarcaOpcion[] = [
  { id: "m-cayla", nombre: "CAYLA" },
  { id: "m-adidas", nombre: "Adidas" },
  { id: "m-nike", nombre: "Nike" },
];
const proveedores: ProveedorOpcion[] = [
  { id: "p-csac", nombre: "CAYLA SAC" },
  { id: "p-a", nombre: "Distribuidora Ámbar" },
  { id: "p-b", nombre: "Importaciones Beta" },
];
const vinculos: Vinculo[] = [
  { marcaId: "m-cayla", proveedorId: "p-csac" },
  { marcaId: "m-adidas", proveedorId: "p-a" },
  { marcaId: "m-adidas", proveedorId: "p-b" }, // la misma marca por dos proveedores: el caso raro real
  { marcaId: "m-nike", proveedorId: "p-b" },
];

describe("elección automática: cero clics cuando no hay duda", () => {
  it("marca con un solo proveedor → se elige sola", () => {
    expect(proveedorAutomatico(vinculos, "m-cayla")).toBe("p-csac");
    expect(proveedorAutomatico(vinculos, "m-nike")).toBe("p-b");
  });
  it("marca con varios proveedores → hay que elegir (null)", () => {
    expect(proveedorAutomatico(vinculos, "m-adidas")).toBeNull();
    expect(proveedoresDeMarca(vinculos, "m-adidas")).toEqual(["p-a", "p-b"]);
  });
  it("marca sin proveedor registrado → null, no inventa uno", () => {
    expect(proveedorAutomatico(vinculos, "m-fantasma")).toBeNull();
  });
  it("proveedor con una sola marca → se elige sola; con varias, no", () => {
    expect(marcaAutomatica(vinculos, "p-csac")).toBe("m-cayla");
    expect(marcaAutomatica(vinculos, "p-b")).toBeNull();
  });
});

describe("buscarMarcaProveedor", () => {
  it("una caja busca marcas y proveedores, sin tildes ni mayúsculas", () => {
    const r = buscarMarcaProveedor("ambar", marcas, proveedores, vinculos);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe("proveedor");
  });
  it("una marca trae sus proveedores; un proveedor trae sus marcas", () => {
    const [m] = buscarMarcaProveedor("adi", marcas, proveedores, vinculos);
    expect(m.tipo === "marca" && m.proveedores.map((p) => p.nombre)).toEqual(["Distribuidora Ámbar", "Importaciones Beta"]);
    const [p] = buscarMarcaProveedor("importaciones", marcas, proveedores, vinculos);
    expect(p.tipo === "proveedor" && p.marcas.map((x) => x.nombre)).toEqual(["Adidas", "Nike"]);
  });
  it("lo que empieza con la consulta va antes que lo que solo la contiene", () => {
    const r = buscarMarcaProveedor("a", marcas, proveedores, vinculos);
    const nombres = r.map((x) => (x.tipo === "marca" ? x.marca.nombre : x.proveedor.nombre));
    expect(nombres.indexOf("Adidas")).toBeLessThan(nombres.indexOf("CAYLA"));
  });
  it("a igual puntaje, la marca va antes que el proveedor", () => {
    const r = buscarMarcaProveedor("cayla", marcas, proveedores, vinculos);
    expect(r[0].tipo).toBe("marca");
    expect(r[1].tipo).toBe("proveedor");
  });
  it("consulta vacía o sin coincidencias → nada", () => {
    expect(buscarMarcaProveedor("  ", marcas, proveedores, vinculos)).toEqual([]);
    expect(buscarMarcaProveedor("zzzz", marcas, proveedores, vinculos)).toEqual([]);
  });
  it("respeta el tope", () => {
    expect(buscarMarcaProveedor("a", marcas, proveedores, vinculos, 2)).toHaveLength(2);
  });
});

describe("sugerencias por categoría (predecir el registro)", () => {
  const productos = [
    { categoria_id: "c1", marca_id: "m-adidas", proveedor_id: "p-a" },
    { categoria_id: "c1", marca_id: "m-adidas", proveedor_id: "p-a" },
    { categoria_id: "c1", marca_id: "m-cayla", proveedor_id: "p-csac" },
    { categoria_id: "c1", marca_id: "m-adidas", proveedor_id: "p-b" },
    { categoria_id: "c2", marca_id: "m-nike", proveedor_id: "p-b" },
    { categoria_id: null, marca_id: "m-nike", proveedor_id: "p-b" },
  ];
  it("cuenta parejas por categoría e ignora productos sin categoría", () => {
    const c = contarParejasPorCategoria(productos);
    expect(Object.keys(c).sort()).toEqual(["c1", "c2"]);
    expect(c.c1.find((u) => u.marcaId === "m-adidas" && u.proveedorId === "p-a")?.usos).toBe(2);
  });
  it("ordena de más a menos usada y respeta el tope", () => {
    const s = sugerenciasDeCategoria(contarParejasPorCategoria(productos).c1, marcas, proveedores, 2);
    expect(`${s[0].marca.nombre} · ${s[0].proveedor.nombre}`).toBe("Adidas · Distribuidora Ámbar");
    expect(s[0].usos).toBe(2);
    expect(s).toHaveLength(2);
  });
  it("un producto sin marca o sin proveedor no forma pareja: no cuenta (ADR-0283)", () => {
    const c = contarParejasPorCategoria([
      { categoria_id: "c9", marca_id: null, proveedor_id: null },
      { categoria_id: "c9", marca_id: "m-adidas", proveedor_id: null },
      { categoria_id: "c9", marca_id: null, proveedor_id: "p-a" },
    ]);
    expect(c).toEqual({});
  });
  it("no sugiere una pareja cuya marca o proveedor ya no está disponible", () => {
    const s = sugerenciasDeCategoria([{ marcaId: "m-desactivada", proveedorId: "p-a", usos: 9 }], marcas, proveedores);
    expect(s).toEqual([]);
  });
});

describe("Catálogo ▸ Marcas: buscar", () => {
  const filas = [
    { nombre: "Amuza", proveedores: [{ nombre: "Amuza Peru EIRL" }] },
    { nombre: "3.20 Store", proveedores: [{ nombre: "M & J Saavedra Inversiones SAC" }] },
    { nombre: "Ángelys", proveedores: [{ nombre: "Creaciones Angelys" }, { nombre: "Distribuidora Ámbar" }] },
  ];
  it("sin texto, todas", () => {
    expect(filtrarMarcas(filas, "  ")).toHaveLength(3);
  });
  it("por la marca, sin tildes ni mayúsculas", () => {
    expect(filtrarMarcas(filas, "ANGEL").map((f) => f.nombre)).toEqual(["Ángelys"]);
  });
  it("por quien la trae: «saavedra» encuentra 3.20 Store", () => {
    expect(filtrarMarcas(filas, "saavedra").map((f) => f.nombre)).toEqual(["3.20 Store"]);
  });
  it("por cualquiera de sus proveedores, no solo el primero", () => {
    expect(filtrarMarcas(filas, "ambar").map((f) => f.nombre)).toEqual(["Ángelys"]);
  });
  it("nada coincide, nada", () => {
    expect(filtrarMarcas(filas, "zara")).toEqual([]);
  });
});

describe("Catálogo ▸ Marcas: editar", () => {
  const actuales: ParejaDeMarca[] = [
    { id: "p-a", nombre: "Textiles Andina", productosTotal: 0 },
    { id: "p-b", nombre: "Confecciones Beta", productosTotal: 3 },
  ];
  const b = (x: Partial<BorradorMarca>): BorradorMarca => ({ nombre: "Lirio", quitar: [], sumar: [], nuevos: [], ...x });

  it("sin nombre no se guarda", () => {
    expect(problemaEdicionMarca(actuales, b({ nombre: "   " }))).toBe("Escribe el nombre de la marca.");
  });
  it("un proveedor con productos no se quita, y lo nombra", () => {
    expect(problemaEdicionMarca(actuales, b({ quitar: ["p-b"] }))).toMatch(/^«Confecciones Beta» tiene productos/);
  });
  it("uno sin productos sí", () => {
    expect(problemaEdicionMarca(actuales, b({ quitar: ["p-a"] }))).toBeNull();
  });
  it("la marca no se queda sin proveedor, pero cambiarlo en el mismo guardado vale", () => {
    const una: ParejaDeMarca[] = [actuales[0]];
    expect(problemaEdicionMarca(una, b({ quitar: ["p-a"] }))).toMatch(/al menos un proveedor/);
    expect(problemaEdicionMarca(una, b({ quitar: ["p-a"], sumar: ["p-c"] }))).toBeNull();
    expect(problemaEdicionMarca(una, b({ quitar: ["p-a"], nuevos: [{ nombre: "Tejidos Norte", ruc: "" }] }))).toBeNull();
  });
  it("un proveedor nuevo necesita nombre", () => {
    expect(problemaEdicionMarca(actuales, b({ nuevos: [{ nombre: " ", ruc: "" }] }))).toBe("Escribe el nombre del proveedor nuevo.");
  });
  it("el RUC de un proveedor nuevo: vacío u 11 dígitos", () => {
    expect(problemaEdicionMarca(actuales, b({ nuevos: [{ nombre: "Tejidos Norte", ruc: "123" }] }))).toMatch(/^El RUC de «Tejidos Norte»/);
    expect(problemaEdicionMarca(actuales, b({ nuevos: [{ nombre: "Tejidos Norte", ruc: "20123456789" }] }))).toBeNull();
  });
  it("sin cambios no hay nada que guardar; los espacios de más no son un cambio", () => {
    expect(borradorCambia("Lirio Blanco", b({ nombre: " Lirio   Blanco " }))).toBe(false);
    expect(borradorCambia("Lirio Blanco", b({ nombre: "Lirio Blanco", sumar: ["p-c"] }))).toBe(true);
    expect(borradorCambia("Lirio Blanco", b({ nombre: "Lirio Rosa" }))).toBe(true);
  });
});

describe("Catálogo ▸ Marcas: eliminar (el caso «Cayla 2», 2026-09-26)", () => {
  it("una marca sin ningún producto se puede eliminar", () => {
    expect(sePuedeEliminarMarca([{ productosTotal: 0 }])).toBe(true);
    expect(sePuedeEliminarMarca([{ productosTotal: 0 }, { productosTotal: 0 }])).toBe(true);
  });
  it("una marca sin proveedores tampoco tiene productos: se puede eliminar", () => {
    expect(sePuedeEliminarMarca([])).toBe(true);
  });
  it("la tarjeta dice por qué no se puede: descontinuados también cuentan", () => {
    expect(textoProductosMarca(4, 4)).toBe("4 productos activos");
    expect(textoProductosMarca(1, 1)).toBe("1 producto activo");
    expect(textoProductosMarca(0, 2)).toBe("Sin productos activos · 2 descontinuados");
    expect(textoProductosMarca(0, 1)).toBe("Sin productos activos · 1 descontinuado");
    expect(textoProductosMarca(0, 0)).toBe("Sin productos todavía");
  });
  it("con un solo producto por CUALQUIERA de sus proveedores ya no", () => {
    expect(sePuedeEliminarMarca([{ productosTotal: 1 }])).toBe(false);
    expect(sePuedeEliminarMarca([{ productosTotal: 0 }, { productosTotal: 2 }])).toBe(false);
  });
});

describe("¿No será la misma marca? (el caso «Cayla 2», 2026-09-25)", () => {
  // Nombres reales de producción, para que la regla se pruebe contra lo que el censo va a encontrar.
  const existentes: MarcaOpcion[] = ["CAYLA", "Divas", "Divas Now", "Krisstell", "La Femme 21", "Maiah Moda", "Matic Moda", "Moda Mia", "Susan Moda", "Mias", "Sassari"].map(
    (nombre, i) => ({ id: `m${i}`, nombre })
  );
  const parecidasA = (nombre: string) => marcasParecidas(nombre, existentes).parecidas.map((p) => `${p.marca.nombre}:${p.por}`);

  it("la clave es la de la base: mayúsculas, tildes, ñ y espacios repetidos no hacen otra marca", () => {
    expect(marcasParecidas("cayla", existentes).igual?.nombre).toBe("CAYLA");
    expect(marcasParecidas("Cáyla", existentes).igual?.nombre).toBe("CAYLA");
  });

  it("«Cayla 2» no es igual a CAYLA para la base (crearía otra), pero se pregunta: mismo nombre salvo el número", () => {
    const r = marcasParecidas("Cayla 2", existentes);
    expect(r.igual).toBeNull();
    expect(r.parecidas.map((p) => `${p.marca.nombre}:${p.por}`)).toEqual(["CAYLA:raiz"]);
    expect(parecidasA("CAYLA.")).toEqual(["CAYLA:raiz"]);
    expect(parecidasA("La Femme")).toEqual(["La Femme 21:raiz"]);
  });

  it("una letra de más o de menos es un error de tipeo, desde 5 letras", () => {
    expect(parecidasA("Kristell")).toEqual(["Krisstell:letras"]);
    expect(parecidasA("Sassary")).toEqual(["Sassari:letras"]);
    // Con 4 letras o menos, una letra ya es otra marca: «Mía» no es «Mias».
    expect(parecidasA("Mía")).toEqual([]);
  });

  it("un nombre que cabe entero en otro, palabra por palabra, también se pregunta", () => {
    expect(parecidasA("Divas")).toEqual(["Divas Now:contenida"]);
    expect(parecidasA("Cayla Kids")).toEqual(["CAYLA:contenida"]);
  });

  it("muestra a lo más 3, de más a menos parecida", () => {
    expect(parecidasA("Moda")).toEqual(["Maiah Moda:contenida", "Matic Moda:contenida", "Moda Mia:contenida"]);
    expect(marcasParecidas("Divs Now", existentes).parecidas[0]).toMatchObject({ marca: { nombre: "Divas Now" }, por: "letras" });
  });

  it("una marca igual no se repite como parecida, y un nombre nuevo de verdad no dispara nada", () => {
    expect(marcasParecidas("Divas", existentes)).toMatchObject({ igual: { nombre: "Divas" }, parecidas: [{ marca: { nombre: "Divas Now" } }] });
    expect(marcasParecidas("Kero", existentes)).toEqual({ igual: null, parecidas: [] });
    expect(marcasParecidas("   ", existentes)).toEqual({ igual: null, parecidas: [] });
  });
});

describe("/productos?marca=sin y ?proveedor=sin (ADR-0283)", () => {
  const UUID = "3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c";
  it("«sin» viaja a la base como el uuid nulo, que fn_productos entiende como «los que no tienen»", () => {
    expect(filtroDeMarcaOProveedor("sin")).toBe(SIN_ID);
  });
  it("una marca o un proveedor de verdad sigue siendo su uuid", () => {
    expect(filtroDeMarcaOProveedor(UUID)).toBe(UUID);
  });
  it("cualquier otra cosa se descarta, como antes", () => {
    expect(filtroDeMarcaOProveedor("cayla")).toBeUndefined();
    expect(filtroDeMarcaOProveedor("")).toBeUndefined();
    expect(filtroDeMarcaOProveedor(undefined)).toBeUndefined();
  });
});

// ---------- estado, resumen y filtro (ADR-0373) ----------
const par = (productosTotal: number) => ({ id: `p${productosTotal}`, nombre: "Prov", productos: productosTotal, productosTotal });
const fila = (activo: boolean, productos: number, proveedores: ReturnType<typeof par>[]) => ({ id: "m", nombre: "M", activo, productos, proveedores });

describe("estado de una marca", () => {
  it("los cuatro estados, sin solaparse", () => {
    expect(estadoDeMarca(fila(true, 3, [par(3)]))).toBe("con");
    expect(estadoDeMarca(fila(true, 0, [par(0)]))).toBe("sin");
    expect(estadoDeMarca(fila(true, 0, []))).toBe("sin-proveedor");
    expect(estadoDeMarca(fila(false, 5, [par(5)]))).toBe("desactivada");
  });

  it("sin proveedor gana sobre «sin productos»: es el que pide una acción", () => {
    expect(estadoDeMarca(fila(true, 0, []))).not.toBe("sin");
  });

  it("la frase dice el estado y, si solo quedan descontinuados, lo avisa (explica por qué no se elimina)", () => {
    expect(textoEstadoMarca(fila(true, 2, [par(2)]))).toBe("Ya la usamos");
    expect(textoEstadoMarca(fila(true, 0, [par(0)]))).toBe("Nadie la ha usado todavía");
    expect(textoEstadoMarca(fila(true, 0, [par(1)]))).toBe("Sin productos activos · 1 descontinuado");
    expect(textoEstadoMarca(fila(true, 0, []))).toMatch(/^Sin proveedor/);
    expect(textoEstadoMarca(fila(false, 0, []))).toBe("Desactivada");
  });
});

describe("resumen y filtro de marcas", () => {
  const marcas = [fila(true, 3, [par(3)]), fila(true, 1, [par(1)]), fila(true, 0, [par(0)]), fila(true, 0, []), fila(false, 0, [par(0)])];

  it("cuenta solo las activas, y cada activa cae en exactamente un estado", () => {
    const r = resumenDeMarcas(marcas);
    expect(r).toEqual({ activas: 4, con: 2, sin: 1, "sin-proveedor": 1 });
    expect(r.con + r.sin + r["sin-proveedor"]).toBe(r.activas);
  });

  it("el filtro devuelve lo mismo que el resumen cuenta, para cada filtro", () => {
    const r = resumenDeMarcas(marcas);
    for (const f of FILTROS_MARCAS) expect(marcasDelFiltro(marcas, f)).toHaveLength(r[f]);
  });

  it("una desactivada no aparece en ningún filtro", () => {
    for (const f of FILTROS_MARCAS) expect(marcasDelFiltro(marcas, f).every((m) => m.activo)).toBe(true);
  });

  it("sin marcas: todo en cero", () => {
    expect(resumenDeMarcas([])).toEqual({ activas: 0, con: 0, sin: 0, "sin-proveedor": 0 });
  });
});

describe("monograma de una marca", () => {
  it("dos palabras: sus iniciales en mayúscula", () => {
    expect(monogramaDeMarca("Alma Costa")).toBe("AC");
    expect(monogramaDeMarca("3.20 Store")).toBe("3S");
    expect(monogramaDeMarca("Sol Andino Perú")).toBe("SA");
  });

  it("una palabra: sus dos primeras letras, para que Amat y Amuza no sean las dos «A»", () => {
    expect(monogramaDeMarca("Amuza")).toBe("Am");
    expect(monogramaDeMarca("ZENIT")).toBe("Ze");
    expect(monogramaDeMarca("y.j.j")).toBe("Yj");
  });

  it("nunca queda vacío ni revienta con un nombre raro", () => {
    expect(monogramaDeMarca("   ")).toBe("·");
    expect(monogramaDeMarca("...")).toBe("·");
    expect(monogramaDeMarca("Ñusta")).toBe("Ñu");
  });
});

describe("páginas, letras y rango", () => {
  it("24 por página llena 2, 3 y 4 columnas sin dejar una fila coja", () => {
    for (const columnas of [2, 3, 4]) expect(MARCAS_POR_PAGINA % columnas).toBe(0);
  });

  it("la letra de una marca: sin tildes, los números juntos bajo «#»", () => {
    expect(letraDeMarca("Alma Costa")).toBe("A");
    expect(letraDeMarca("Ñusta")).toBe("N");
    expect(letraDeMarca("Álamo")).toBe("A");
    expect(letraDeMarca("y.j.j")).toBe("Y");
    expect(letraDeMarca("3.20 Store")).toBe("#");
    expect(letraDeMarca("...")).toBe("#");
    expect(letraDeMarca("  zenit")).toBe("Z");
  });

  it("toda marca cae bajo una letra que existe en el índice", () => {
    for (const n of ["Alma", "Ñusta", "3.20", "y.j.j", "ZENIT", "", "  ", "¿Qué?"]) expect(ALFABETO).toContain(letraDeMarca(n));
  });

  it("las letras presentes y dónde empieza cada una en una lista ordenada", () => {
    const lista = [{ nombre: "3.20 Store" }, { nombre: "Amat" }, { nombre: "Amuza" }, { nombre: "Bambú" }, { nombre: "Zoe" }];
    expect([...letrasDeMarcas(lista)].sort()).toEqual(["#", "A", "B", "Z"]);
    expect(posicionDeLaLetra(lista, "A")).toBe(1);
    expect(posicionDeLaLetra(lista, "Z")).toBe(4);
    expect(posicionDeLaLetra(lista, "W")).toBe(-1);
  });

  it("la página de un lugar: el 24.º (posición 23) sigue en la 1; el 25.º (24) pasa a la 2", () => {
    expect(paginaDeLaPosicion(0)).toBe(1);
    expect(paginaDeLaPosicion(23)).toBe(1);
    expect(paginaDeLaPosicion(24)).toBe(2);
    expect(paginaDeLaPosicion(71)).toBe(3);
    expect(paginaDeLaPosicion(72)).toBe(4);
    expect(paginaDeLaPosicion(-5)).toBe(1);
  });

  it("el rango dice de qué marca a cuál; vacío si no hay página", () => {
    expect(rangoDeNombres([{ nombre: "Cala" }, { nombre: "Dalia" }, { nombre: "Gala" }])).toBe("de Cala a Gala");
    expect(rangoDeNombres([{ nombre: "Sola" }])).toBe("de Sola a Sola");
    expect(rangoDeNombres([])).toBeNull();
  });
});

// ---------- predicción del buscador ----------
const m = (nombre: string, productos: number, ...proveedores: string[]) => ({ nombre, productos, proveedores: proveedores.map((p) => ({ nombre: p })) });
const CATALOGO = [
  m("3.20 Store", 0, "Hilandería Norte SA"),
  m("Alma Costa", 0, "Grupo Tejedoras SAC"),
  m("Amat", 1, "Textiles Pacífico SAC"),
  m("Amaru", 9, "Confecciones Mirador EIRL"),
  m("Amuza", 2, "Confecciones Mirador EIRL", "Hilandería Norte SA"),
  m("Camila Rey", 9, "Moda Andina Mayorista"),
  m("Sol Andino", 5, "Importaciones Sol Naciente SAC"),
  m("Girasol", 0, "Taller Hilván SRL"),
  m("Valeria Mia", 3, "Valeria Mia Peru Moda EIRL"),
  m("Wayi", 4, "Corporaciones Wayi SAC"),
  m("Ñusta", 0, "Taller Hilván SRL"),
  m("ZENIT", 4, "ZENIT"),
];
const nombres = (xs: readonly { nombre: string }[]) => xs.map((x) => x.nombre);

describe("ordenarPorPrediccion", () => {
  it("sin texto devuelve todas, por nombre, y sin tocar lo que recibe", () => {
    const entrada = [...CATALOGO];
    const r = ordenarPorPrediccion(entrada, "  ");
    expect(r.parecidas).toBe(false);
    expect(nombres(r.lista)).toEqual([...nombres(CATALOGO)].sort((a, b) => a.localeCompare(b, "es")));
    expect(entrada).toEqual(CATALOGO);
  });

  it("empieza con lo escrito antes que una palabra suya, y esa antes que «lo contiene»", () => {
    // «sol»: Sol Andino (empieza) · Girasol (contiene) · y Sol Naciente es de un proveedor (0,5): al final
    expect(nombres(ordenarPorPrediccion(CATALOGO, "sol").lista)).toEqual(["Sol Andino", "Girasol"]);
    // «mia»: «Valeria Mia» tiene una palabra que empieza así
    expect(nombres(ordenarPorPrediccion(CATALOGO, "mia").lista)[0]).toBe("Valeria Mia");
  });

  it("a igual coincidencia manda la más usada, y después el nombre", () => {
    expect(nombres(ordenarPorPrediccion(CATALOGO, "am").lista).slice(0, 3)).toEqual(["Amaru", "Amuza", "Amat"]);
    const empate = [m("Beta", 2), m("Alfa", 2), m("Bola", 7)];
    expect(nombres(ordenarPorPrediccion(empate, "b").lista)).toEqual(["Bola", "Beta"]);
    expect(nombres(ordenarPorPrediccion([m("Beta", 2), m("Bata", 2)], "b").lista)).toEqual(["Bata", "Beta"]);
  });

  it("no distingue tildes ni mayúsculas", () => {
    expect(nombres(ordenarPorPrediccion(CATALOGO, "ÑUS").lista)).toEqual(["Ñusta"]);
    expect(nombres(ordenarPorPrediccion(CATALOGO, "nusta").lista)).toEqual(["Ñusta"]);
    expect(nombres(ordenarPorPrediccion(CATALOGO, "zénit").lista)[0]).toBe("ZENIT");
  });

  it("también encuentra por el proveedor, pero después de las marcas que se llaman así", () => {
    const r = nombres(ordenarPorPrediccion(CATALOGO, "mirador").lista);
    expect(r).toEqual(["Amaru", "Amuza"]);
    expect(ordenarPorPrediccion(CATALOGO, "mirador").parecidas).toBe(false);
  });

  it("escribir una marca COMPLETA la pone primera, para TODAS las marcas", () => {
    for (const marca of CATALOGO) {
      const r = ordenarPorPrediccion(CATALOGO, marca.nombre);
      expect(r.lista[0].nombre, `escribiendo «${marca.nombre}»`).toBe(marca.nombre);
      expect(r.parecidas).toBe(false);
    }
    // aunque otra marca más usada empiece igual
    expect(nombres(ordenarPorPrediccion([m("Amat Moda", 50), m("Amat", 1)], "Amat").lista)[0]).toBe("Amat");
  });

  it("una errata de una letra encuentra la marca, y avisa que son parecidas", () => {
    for (const marca of CATALOGO.filter((x) => x.nombre.replace(/[^\p{L}]/gu, "").length >= 4)) {
      const mal = marca.nombre.slice(0, 2) + "#" + marca.nombre.slice(3);
      const r = ordenarPorPrediccion(CATALOGO, mal);
      expect(nombres(r.lista), `escribiendo «${mal}»`).toContain(marca.nombre);
      expect(r.parecidas).toBe(true);
    }
    expect(nombres(ordenarPorPrediccion(CATALOGO, "wayy").lista)).toEqual(["Wayi"]);
    // una marca de varias palabras con la errata en la segunda
    expect(nombres(ordenarPorPrediccion(CATALOGO, "alma cosa").lista)).toEqual(["Alma Costa"]);
  });

  it("no adivina con menos de 3 letras ni con algo que no se parece a nada", () => {
    expect(ordenarPorPrediccion(CATALOGO, "qz")).toEqual({ lista: [], parecidas: true });
    expect(ordenarPorPrediccion(CATALOGO, "zzzzzzzz")).toEqual({ lista: [], parecidas: true });
  });

  it("es determinista: la misma entrada da la misma salida, también al revés", () => {
    for (const q of ["a", "am", "sol", "wayy", "mirador", ""]) {
      const a = nombres(ordenarPorPrediccion(CATALOGO, q).lista);
      expect(nombres(ordenarPorPrediccion([...CATALOGO].reverse(), q).lista)).toEqual(a);
    }
  });
});

describe("prediccionDe (la sombra)", () => {
  it("completa con lo que falta de la marca más usada que empieza así", () => {
    expect(prediccionDe(CATALOGO, "am")).toMatchObject({ cola: "aru" });
    expect(prediccionDe(CATALOGO, "am")?.marca.nombre).toBe("Amaru");
    expect(prediccionDe(CATALOGO, "wa")).toMatchObject({ cola: "yi" });
  });

  it("conserva lo que la persona escribió: solo agrega la cola", () => {
    const p = prediccionDe(CATALOGO, "AMU");
    expect(p?.marca.nombre).toBe("Amuza");
    expect(p?.cola).toBe("za");
  });

  it("sin tildes: «nus» completa «Ñusta»", () => {
    expect(prediccionDe(CATALOGO, "ñus")?.marca.nombre).toBe("Ñusta");
  });

  it("nada que completar: nombre entero, nada que empiece así, vacío o con espacio delante", () => {
    expect(prediccionDe(CATALOGO, "Amaru")).toBeNull();
    expect(prediccionDe(CATALOGO, "xyz")).toBeNull();
    expect(prediccionDe(CATALOGO, "")).toBeNull();
    expect(prediccionDe(CATALOGO, "  am")).toBeNull();
    // «ola» está dentro de Girasol pero no la empieza: no se predice por el medio
    expect(prediccionDe(CATALOGO, "ras")).toBeNull();
  });

  it("nunca ofrece completar con algo que NO empieza con lo escrito (para toda marca y todo prefijo)", () => {
    for (const marca of CATALOGO) {
      for (let i = 1; i < marca.nombre.length; i++) {
        const escrito = marca.nombre.slice(0, i);
        const p = prediccionDe(CATALOGO, escrito);
        if (!p) continue;
        expect(escrito.toLowerCase() === p.marca.nombre.slice(0, i).toLowerCase() || p.marca.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().startsWith(escrito.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())).toBe(true);
        expect(escrito + p.cola).toBe(p.marca.nombre.slice(0, i) + p.marca.nombre.slice(i));
      }
    }
  });

  it("a igual coincidencia, la más usada; y no muta lo que recibe", () => {
    const entrada = [m("Cala", 1), m("Calma", 8)];
    expect(prediccionDe(entrada, "cal")?.marca.nombre).toBe("Calma");
    expect(entrada.map((x) => x.nombre)).toEqual(["Cala", "Calma"]);
  });
});

describe("distanciaDeEdicion", () => {
  it("cuenta letras cambiadas, puestas o quitadas", () => {
    expect(distanciaDeEdicion("wayy", "wayi")).toBe(1);
    expect(distanciaDeEdicion("amaru", "amru")).toBe(1);
    expect(distanciaDeEdicion("", "abc")).toBe(3);
    expect(distanciaDeEdicion("igual", "igual")).toBe(0);
  });
});
