import { describe, expect, it } from "vitest";
import { conMarca, marcasDeLaSede, productosSinStockEnSede, type ProductoDeCatalogo } from "./existencias-catalogo-reglas";

// Los productos reales de producción al 2026-09-26.
const p = (id: string, referencia: string, marca: string | null, extra: Partial<ProductoDeCatalogo> = {}): ProductoDeCatalogo => ({
  id,
  referencia,
  marca,
  categoria: null,
  estado: "activo",
  estadoAlta: "aprobado",
  esPrueba: false,
  conVariantesActivas: true,
  ...extra,
});

const CATALOGO: ProductoDeCatalogo[] = [
  p("prueba", "Producto de Prueba", "CAYLA", { esPrueba: true }),
  p("aurora", "Top Aurora", "Cayla 2"),
  p("pantalon-cayla", "Pantalon Cayla", "CAYLA"),
  p("pantalon-sastre", "Pantalon Sastre", "CAYLA"),
  p("vestido", "Vestido Aurora", "Bella Aldama"),
  p("viejo", "Camisa Vieja", "y.j.j", { estado: "descontinuado" }),
  // El producto del cargo especial: en producción NO tiene variantes activas.
  p("sin-registrar", "Prenda sin Registrar", "CAYLA", { conVariantesActivas: false }),
  // Dada de alta al vuelo desde un Conteo y todavía sin revisar por un líder.
  p("alta-al-vuelo", "Blusa Nueva", "Marca Mal Escrita", { estadoAlta: "pendiente" }),
];

describe("conMarca", () => {
  it("pone a cada fila la marca de su producto", () => {
    const filas = [{ productoId: "aurora", id: "a" }, { productoId: "aurora", id: "b" }, { productoId: "pantalon-cayla", id: "c" }];
    expect(conMarca(filas, CATALOGO).map((f) => [f.id, f.marca])).toEqual([["a", "Cayla 2"], ["b", "Cayla 2"], ["c", "CAYLA"]]);
  });

  it("una fila «en camino» de un producto sin variantes activas igual recibe su marca (la lectura no lo excluye)", () => {
    const [f] = conMarca([{ productoId: "sin-registrar" }], CATALOGO);
    expect(f.marca).toBe("CAYLA");
  });

  it("una fila cuyo producto no llegó (la lectura falló, o es nuevo) queda sin marca, sin romper", () => {
    expect(conMarca([{ productoId: "desconocido" }], CATALOGO)).toEqual([{ productoId: "desconocido", marca: null }]);
    expect(conMarca([{ productoId: "aurora" }], [])).toEqual([{ productoId: "aurora", marca: null }]);
  });

  it("conserva el resto de la fila tal cual", () => {
    const [f] = conMarca([{ productoId: "aurora", talla: "M", total: 4 }], CATALOGO);
    expect(f).toEqual({ productoId: "aurora", talla: "M", total: 4, marca: "Cayla 2" });
  });
});

describe("productosSinStockEnSede", () => {
  it("son los activos del catálogo que la sede no tiene: los pantalones CAYLA y el vestido, no Top Aurora", () => {
    const enTru = [{ productoId: "aurora" }, { productoId: "aurora" }];
    expect(productosSinStockEnSede(CATALOGO, enTru).map((x) => x.referencia)).toEqual(["Pantalon Cayla", "Pantalon Sastre", "Vestido Aurora"]);
  });

  it("nunca ofrece un producto de prueba ni uno descontinuado, aunque la sede no los tenga", () => {
    const todos = productosSinStockEnSede(CATALOGO, []).map((x) => x.id);
    expect(todos).not.toContain("prueba");
    expect(todos).not.toContain("viejo");
  });

  it("nunca ofrece «Prenda sin Registrar» (el cargo especial no tiene variantes activas: no hay nada que pedir)", () => {
    expect(productosSinStockEnSede(CATALOGO, []).map((x) => x.id)).not.toContain("sin-registrar");
  });

  it("no ofrece una prenda dada de alta al vuelo mientras un líder no la apruebe: su nombre y su marca pueden estar mal escritos", () => {
    expect(productosSinStockEnSede(CATALOGO, []).map((x) => x.id)).not.toContain("alta-al-vuelo");
  });

  it("un producto con fila en la sede, aunque sea en cero, no es «sin stock»: está en la tabla", () => {
    expect(productosSinStockEnSede(CATALOGO, [{ productoId: "pantalon-cayla" }]).map((x) => x.id)).not.toContain("pantalon-cayla");
  });

  it("devuelve solo lo necesario (id, nombre, marca, categoría) y en orden por nombre", () => {
    const [primero] = productosSinStockEnSede(CATALOGO, []);
    expect(Object.keys(primero).sort()).toEqual(["categoria", "id", "marca", "referencia"]);
    const nombres = productosSinStockEnSede(CATALOGO, []).map((x) => x.referencia);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("sin catálogo (la lectura falló) no hay nada que ofrecer", () => {
    expect(productosSinStockEnSede([], [{ productoId: "aurora" }])).toEqual([]);
  });
});

describe("marcasDeLaSede", () => {
  it("las marcas de las filas, sin repetir, sin vacías y por nombre", () => {
    const filas = [{ marca: "Miramhe" }, { marca: "Cayla 2" }, { marca: "Miramhe" }, { marca: null }, {}, { marca: "Artemisa" }, { marca: "" }];
    expect(marcasDeLaSede(filas)).toEqual(["Artemisa", "Cayla 2", "Miramhe"]);
  });

  it("sin marcas leídas, ninguna", () => {
    expect(marcasDeLaSede([{}, { marca: null }])).toEqual([]);
  });
});
