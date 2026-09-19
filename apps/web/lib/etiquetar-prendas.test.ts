import { describe, it, expect } from "vitest";
import {
  alternarProducto,
  alternarVariante,
  cambioEntre,
  estadoDe,
  filtrarProductos,
  marcarProductos,
  textoCambio,
  vistaPrevia,
  type ProductoEtiquetable,
} from "./etiquetar-prendas";

const v = (id: string) => ({ id, talla: "M", color: "Negro" });
const polo: ProductoEtiquetable = { id: "p1", referencia: "POL-001", descripcion: "Polo Básico Algodón Pima", categoriaId: "c-tops", categoria: "Tops", variantes: [v("a"), v("b"), v("c")] };
const falda: ProductoEtiquetable = { id: "p2", referencia: "FAL-002", descripcion: "Falda plisada", categoriaId: "c-faldas", categoria: "Faldas", variantes: [v("d"), v("e")] };
const sinTallas: ProductoEtiquetable = { id: "p3", referencia: "X", descripcion: null, categoriaId: null, categoria: "—", variantes: [] };

describe("estadoDe — la casilla del producto", () => {
  it("ninguna / algunas / todas según sus variantes marcadas", () => {
    expect(estadoDe(polo, new Set())).toBe("ninguna");
    expect(estadoDe(polo, new Set(["a"]))).toBe("algunas");
    expect(estadoDe(polo, new Set(["a", "b", "c"]))).toBe("todas");
  });
  it("las marcas de OTRO producto no cuentan", () => {
    expect(estadoDe(polo, new Set(["d", "e"]))).toBe("ninguna");
  });
  it("un producto sin variantes nunca aparece marcado", () => {
    expect(estadoDe(sinTallas, new Set(["a"]))).toBe("ninguna");
  });
});

describe("alternarProducto", () => {
  it("marca todas las tallas de un golpe", () => {
    expect([...alternarProducto(polo, new Set())].sort()).toEqual(["a", "b", "c"]);
  });
  it("estando a medias, completa (no suelta)", () => {
    expect([...alternarProducto(polo, new Set(["a"]))].sort()).toEqual(["a", "b", "c"]);
  });
  it("estando todas, las suelta y no toca otros productos", () => {
    expect([...alternarProducto(polo, new Set(["a", "b", "c", "d"]))]).toEqual(["d"]);
  });
  it("no muta el conjunto original", () => {
    const original = new Set(["a"]);
    alternarProducto(polo, original);
    expect([...original]).toEqual(["a"]);
  });
});

describe("alternarVariante — la excepción por talla", () => {
  it("marca y desmarca una sola", () => {
    const uno = alternarVariante("b", new Set());
    expect([...uno]).toEqual(["b"]);
    expect([...alternarVariante("b", uno)]).toEqual([]);
  });
});

describe("marcarProductos — visibles en un clic", () => {
  it("marca todas las variantes de los productos dados y no toca los demás", () => {
    expect([...marcarProductos([falda], new Set(["a"]), true)].sort()).toEqual(["a", "d", "e"]);
  });
  it("suelta solo las de los productos dados", () => {
    expect([...marcarProductos([polo], new Set(["a", "b", "c", "d"]), false)]).toEqual(["d"]);
  });
  it("sin productos no cambia nada", () => {
    expect([...marcarProductos([], new Set(["a"]), true)]).toEqual(["a"]);
  });
});

describe("cambioEntre — lo que viaja a la base", () => {
  it("solo el diff: lo nuevo se agrega, lo soltado se quita, lo que no cambió no viaja", () => {
    expect(cambioEntre(new Set(["a", "b"]), new Set(["b", "c", "d"]))).toEqual({ agregar: ["c", "d"], quitar: ["a"] });
  });
  it("sin tocar nada no hay cambio", () => {
    expect(cambioEntre(new Set(["a"]), new Set(["a"]))).toEqual({ agregar: [], quitar: [] });
  });
  it("es determinista: el orden de marcado no cambia el pedido", () => {
    expect(cambioEntre(new Set(), new Set(["z", "a", "m"]))).toEqual(cambioEntre(new Set(), new Set(["a", "m", "z"])));
  });
});

describe("filtrarProductos", () => {
  const todos = [polo, falda];
  it("busca sin tildes ni mayúsculas, en referencia, descripción y categoría", () => {
    expect(filtrarProductos(todos, { texto: "BASICO", categoriaId: null }).map((p) => p.id)).toEqual(["p1"]);
    expect(filtrarProductos(todos, { texto: "fal-002", categoriaId: null }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarProductos(todos, { texto: "tops", categoriaId: null }).map((p) => p.id)).toEqual(["p1"]);
  });
  it("filtra por categoría y combina con el texto", () => {
    expect(filtrarProductos(todos, { texto: "", categoriaId: "c-faldas" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarProductos(todos, { texto: "polo", categoriaId: "c-faldas" })).toEqual([]);
  });
  it("sin filtros devuelve todo", () => {
    expect(filtrarProductos(todos, { texto: "  ", categoriaId: null })).toHaveLength(2);
  });
});

describe("textoCambio", () => {
  const todos = [polo, falda];
  it("dice cuántas prendas y de cuántos productos, con singular y plural", () => {
    expect(textoCambio({ agregar: ["a", "b", "d"], quitar: [] }, todos)).toBe("Agregarás la etiqueta a 3 prendas (2 productos)");
    expect(textoCambio({ agregar: ["a"], quitar: [] }, todos)).toBe("Agregarás la etiqueta a 1 prenda (1 producto)");
  });
  it("agregar y quitar juntos", () => {
    expect(textoCambio({ agregar: ["a"], quitar: ["d", "e"] }, todos)).toBe(
      "Agregarás la etiqueta a 1 prenda (1 producto) · Quitarás la etiqueta de 2 prendas (1 producto)",
    );
  });
  it("sin cambios", () => {
    expect(textoCambio({ agregar: [], quitar: [] }, todos)).toBe("Sin cambios");
  });
});

describe("vistaPrevia — lo que se confirma antes de tocar precios", () => {
  const bf = { nombre: "Black Friday", descuentoPct: 30, vigenteDesde: "2026-11-09", vigenteHasta: "2026-11-30" };

  it("sin descuento no hay nada que confirmar", () => {
    expect(vistaPrevia({ ...bf, descuentoPct: null }, 5, "2026-11-10")).toBeNull();
  });
  it("sin prendas nuevas tampoco (solo se está quitando)", () => {
    expect(vistaPrevia(bf, 0, "2026-11-10")).toBeNull();
  });
  it("vigente hoy: dice el % y la fecha de fin, y que se aplica sola", () => {
    const p = vistaPrevia(bf, 12, "2026-11-10")!;
    expect(p.titulo).toBe("«Black Friday» baja el precio 30 % a 12 prendas");
    expect(p.detalle).toContain("Rige desde hoy, hasta el 30 nov. En Vender");
    expect(p.detalle).not.toContain("..");
    expect(p.detalle).toContain("sin pedir código");
    expect(p.sinEfectoHoy).toBe(false);
  });
  it("una campaña futura dice que hoy no cambia ningún precio", () => {
    const p = vistaPrevia(bf, 3, "2026-09-19")!;
    expect(p.sinEfectoHoy).toBe(true);
    expect(p.detalle).toMatch(/Empieza el 9 nov \(en 51 días\): hasta entonces no cambia ningún precio/);
  });
  it("una campaña terminada avisa que no cambiará nada", () => {
    const p = vistaPrevia(bf, 3, "2026-12-15")!;
    expect(p.sinEfectoHoy).toBe(true);
    expect(p.detalle).toContain("terminó el 30 nov");
  });
  it("sin fechas rige ya y sin fin", () => {
    const p = vistaPrevia({ nombre: "Para liquidar", descuentoPct: 40, vigenteDesde: null, vigenteHasta: null }, 1, "2026-09-19")!;
    expect(p.titulo).toBe("«Para liquidar» baja el precio 40 % a 1 prenda");
    expect(p.detalle).toContain("sin fecha de fin");
  });
  it("mañana se dice «mañana», no «en 1 días»", () => {
    expect(vistaPrevia(bf, 1, "2026-11-08")!.detalle).toContain("(mañana)");
  });
  it("un % se escribe entero si lo es, y con punto decimal (Perú) si no", () => {
    expect(vistaPrevia({ ...bf, descuentoPct: 12.5 }, 1, "2026-11-10")!.titulo).toContain("12.5 %");
    expect(vistaPrevia({ ...bf, descuentoPct: 30 }, 1, "2026-11-10")!.titulo).toContain("30 %");
  });
});
