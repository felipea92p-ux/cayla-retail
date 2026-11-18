import { describe, expect, it } from "vitest";
import {
  detalleMarca,
  filtrarMarcas,
  marcasConProveedores,
  marcasDelProveedorElegido,
  marcasParaComprar,
  marcasRecientes,
  nombreSinSociedad,
  pildorasDeMarca,
  proveedoresDeLaMarca,
  proveedoresSinMarca,
  type ProveedorParaComprar,
} from "./compra-rapida-reglas";

// ADR-0644: «la marca primero» en Mis compras. Datos inventados.
const prov = (id: string, nombre: string, o: Partial<ProveedorParaComprar> = {}): ProveedorParaComprar => ({
  id,
  nombre,
  ruc: null,
  categorias: [],
  compras: 0,
  ultima: null,
  marcas: [],
  ...o,
});
const textil = prov("p1", "Textil Ejemplo SAC", { compras: 4, ultima: "2026-11-04", categorias: ["blusas"] });
const andinas = prov("p2", "Confecciones Andinas EIRL", { compras: 2, ultima: "2026-10-21", categorias: ["casacas"] });
const norte = prov("p3", "Moda Norte SRL");
const servicios = prov("p4", "Limpieza Pacífico SAC");
const proveedores = [textil, andinas, norte, servicios];

const marcas = marcasConProveedores(
  [
    { id: "m1", nombre: "Kero" },
    { id: "m2", nombre: "Lolita" },
    { id: "m3", nombre: "Nativa" },
    { id: "m4", nombre: "Alma Sur" },
    { id: "m5", nombre: "Bambú" },
    { id: "m6", nombre: "Huérfana" },
  ],
  [
    { marca_id: "m1", proveedor_id: "p1" },
    { marca_id: "m2", proveedor_id: "p1" },
    { marca_id: "m3", proveedor_id: "p2" },
    { marca_id: "m4", proveedor_id: "p2" },
    { marca_id: "m4", proveedor_id: "p3" },
    { marca_id: "m5", proveedor_id: "p3" },
    { marca_id: "m5", proveedor_id: "p3" },
    { marca_id: "m6", proveedor_id: "p-inactivo" },
  ],
);

describe("las marcas con sus proveedores", () => {
  it("une los vínculos sin repetir y ordena por nombre", () => {
    expect(marcas.map((m) => m.nombre)).toEqual(["Alma Sur", "Bambú", "Huérfana", "Kero", "Lolita", "Nativa"]);
    expect(marcas.find((m) => m.id === "m5")?.proveedorIds).toEqual(["p3"]);
    expect(marcas.find((m) => m.id === "m4")?.proveedorIds).toEqual(["p2", "p3"]);
  });

  it("deja fuera la marca cuyo proveedor no se puede elegir y pone primero las de compras recientes", () => {
    const lista = marcasParaComprar(marcas, proveedores);
    expect(lista.map((m) => m.nombre)).toEqual(["Kero", "Lolita", "Alma Sur", "Nativa", "Bambú"]);
  });

  it("las recientes son solo las de proveedores a los que se les compró", () => {
    const lista = marcasParaComprar(marcas, proveedores);
    expect(marcasRecientes(lista).map((m) => m.nombre)).toEqual(["Kero", "Lolita", "Alma Sur", "Nativa"]);
    expect(marcasRecientes(lista, 2).map((m) => m.nombre)).toEqual(["Kero", "Lolita"]);
  });
});

describe("buscar por marca", () => {
  const lista = marcasParaComprar(marcas, proveedores);
  it("encuentra por el nombre de la marca, sin tildes ni mayúsculas", () => {
    expect(filtrarMarcas(lista, "bambu", null).map((m) => m.nombre)).toEqual(["Bambú"]);
  });
  it("encuentra por el nombre del proveedor: salen todas sus marcas", () => {
    expect(filtrarMarcas(lista, "textil", null).map((m) => m.nombre)).toEqual(["Kero", "Lolita"]);
  });
  it("con una categoría, solo las que trae un proveedor que la vende", () => {
    expect(filtrarMarcas(lista, "", "casacas").map((m) => m.nombre)).toEqual(["Alma Sur", "Nativa"]);
  });
  it("los proveedores sin marca se ofrecen aparte", () => {
    expect(proveedoresSinMarca(proveedores, marcas).map((p) => p.id)).toEqual(["p4"]);
  });
});

describe("lo que se lee bajo la marca", () => {
  const lista = marcasParaComprar(marcas, proveedores);
  const de = (n: string) => lista.find((m) => m.nombre === n)!;
  it("con un proveedor: su nombre y cuándo se le compró", () => {
    expect(detalleMarca(de("Kero"), "2026-11-11")).toEqual({ deQuien: "De Textil Ejemplo SAC", cuando: "Le compraste hace una semana · 4 compras", preguntaDeQuien: false });
    expect(detalleMarca(de("Bambú"), "2026-11-11").cuando).toBe("Todavía no le compras");
  });
  it("con dos: cuántos son y que se va a preguntar de quién", () => {
    expect(detalleMarca(de("Alma Sur"), "2026-11-11")).toEqual({ deQuien: "De 2 proveedores", cuando: "Le compraste a uno hace 3 semanas", preguntaDeQuien: true });
  });
  it("«¿Quién te la trajo?» pone primero al de la compra más reciente", () => {
    expect(proveedoresDeLaMarca(de("Alma Sur")).map((p) => p.id)).toEqual(["p2", "p3"]);
  });
  it("quita SAC, EIRL y SRL", () => {
    expect(nombreSinSociedad("Textil Ejemplo SAC")).toBe("Textil Ejemplo");
    expect(nombreSinSociedad("Confecciones Andinas E.I.R.L.")).toBe("Confecciones Andinas");
    expect(nombreSinSociedad("Kero")).toBe("Kero");
  });
});

describe("el paso 2: las otras marcas del proveedor", () => {
  const lista = marcasParaComprar(marcas, proveedores);
  it("las marcas del proveedor elegido", () => {
    expect(marcasDelProveedorElegido(lista, "p1")).toEqual([
      { id: "m1", nombre: "Kero" },
      { id: "m2", nombre: "Lolita" },
    ]);
  });
  it("con una sola marca no hay píldoras", () => {
    expect(pildorasDeMarca([{ id: "m3", nombre: "Nativa" }], [], null)).toEqual([]);
  });
  it("cuenta sus prendas y pone primero la marca por la que se entró", () => {
    const hab = [{ marcaId: "m1" }, { marcaId: "m1" }, { marcaId: "m2" }, { marcaId: null }];
    expect(pildorasDeMarca(marcasDelProveedorElegido(lista, "p1"), hab, "m2")).toEqual([
      { id: "m2", nombre: "Lolita", cuantos: 1 },
      { id: "m1", nombre: "Kero", cuantos: 2 },
    ]);
  });
});
