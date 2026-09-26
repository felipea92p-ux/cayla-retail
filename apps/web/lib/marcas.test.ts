import { describe, expect, it } from "vitest";
import {
  buscarMarcaProveedor,
  claveMarca,
  contarParejasPorCategoria,
  contarProductosPorProveedor,
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
  it("no sugiere una pareja cuya marca o proveedor ya no está disponible", () => {
    const s = sugerenciasDeCategoria([{ marcaId: "m-desactivada", proveedorId: "p-a", usos: 9 }], marcas, proveedores);
    expect(s).toEqual([]);
  });
});

describe("A quién pedirle: productos por reponer, por proveedor", () => {
  const f = (producto_id: string, proveedor_id: string, proveedor_nombre: string) => ({ producto_id, proveedor_id, proveedor_nombre });
  it("cuenta productos y no variantes: un producto con 3 tallas llega 3 veces y cuenta una", () => {
    const r = contarProductosPorProveedor([f("p1", "a", "Ámbar"), f("p1", "a", "Ámbar"), f("p1", "a", "Ámbar"), f("p2", "a", "Ámbar"), f("p3", "b", "Beta")]);
    expect(r).toEqual([
      { proveedorId: "a", proveedor: "Ámbar", productos: 2 },
      { proveedorId: "b", proveedor: "Beta", productos: 1 },
    ]);
  });
  it("ordena de más a menos y, a igual cantidad, por nombre", () => {
    const r = contarProductosPorProveedor([f("p1", "b", "Beta"), f("p2", "a", "Ámbar"), f("p3", "c", "Cima"), f("p4", "c", "Cima")]);
    expect(r.map((x) => x.proveedor)).toEqual(["Cima", "Ámbar", "Beta"]);
  });
  it("sin nada por reponer, nada que mostrar", () => {
    expect(contarProductosPorProveedor([])).toEqual([]);
  });
  it("una fila sin proveedor (la base aún sin el SQL de proveedores) no tiene a quién pedirle: se salta, no rompe", () => {
    const sinProveedor = { producto_id: "p9" } as unknown as Parameters<typeof contarProductosPorProveedor>[0][number];
    expect(contarProductosPorProveedor([sinProveedor, f("p1", "a", "Ámbar")])).toEqual([{ proveedorId: "a", proveedor: "Ámbar", productos: 1 }]);
  });
});

describe("¿No será la misma marca? (el caso «Cayla 2», 2026-09-25)", () => {
  // Nombres reales de producción, para que la regla se pruebe contra lo que el censo va a encontrar.
  const existentes: MarcaOpcion[] = ["CAYLA", "Divas", "Divas Now", "Krisstell", "La Femme 21", "Maiah Moda", "Matic Moda", "Moda Mia", "Susan Moda", "Mias", "Sassari"].map(
    (nombre, i) => ({ id: `m${i}`, nombre })
  );
  const parecidasA = (nombre: string) => marcasParecidas(nombre, existentes).parecidas.map((p) => `${p.marca.nombre}:${p.por}`);

  it("la clave es la de la base: mayúsculas, tildes, ñ y espacios repetidos no hacen otra marca", () => {
    expect(claveMarca("  Cáyla   Ñusta ")).toBe("cayla nusta");
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
