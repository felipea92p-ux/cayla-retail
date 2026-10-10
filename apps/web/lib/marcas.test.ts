import { describe, expect, it } from "vitest";
import {
  borradorCambia,
  estadoDeMarca,
  FILTROS_MARCAS,
  marcasDelFiltro,
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

// ---------- estado, resumen y filtro (ADR-0372) ----------
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
