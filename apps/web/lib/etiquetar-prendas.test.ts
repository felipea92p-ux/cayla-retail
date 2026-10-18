import { describe, it, expect } from "vitest";
import {
  alternarProducto,
  alternarVariante,
  cambioEntre,
  cuentaPorMarca,
  estadoDe,
  filtrarProductos,
  idsPorMarca,
  llevaEtiqueta,
  marcarProductos,
  precioConCampana,
  textoCambio,
  textoTallas,
  vistaPrevia,
  vistaPreviaQuitar,
  avisoFueraDeVenta,
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
  it("también por el código del modelo (BLU-0042)", () => {
    expect(filtrarProductos([{ ...polo, referencia: "Polo Aurora", codigo: "POL-0042" }, falda], { texto: "pol-0042", categoriaId: null }).map((p) => p.id)).toEqual(["p1"]);
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
  it("las que ya no se venden se suman a lo que se quita, sin contarlas como productos de la lista", () => {
    expect(textoCambio({ agregar: [], quitar: ["d"] }, todos, 22)).toBe("Quitarás la etiqueta de 1 prenda (1 producto) y de 22 que ya no se venden");
    expect(textoCambio({ agregar: [], quitar: ["d"] }, todos, 1)).toBe("Quitarás la etiqueta de 1 prenda (1 producto) y de 1 que ya no se vende");
    expect(textoCambio({ agregar: [], quitar: [] }, todos, 22)).toBe("Quitarás la etiqueta de 22 prendas que ya no se venden");
    expect(textoCambio({ agregar: ["a"], quitar: [] }, todos, 1)).toBe("Agregarás la etiqueta a 1 prenda (1 producto) · Quitarás la etiqueta de 1 prenda que ya no se vende");
  });
});

describe("vistaPreviaQuitar — quitar una etiqueta con descuento también sube un precio", () => {
  const liq = { nombre: "Para liquidar", descuentoPct: 40, vigenteDesde: "2026-09-01", vigenteHasta: "2026-12-31" };

  it("sin descuento, o sin prendas a la venta quitadas, no hay nada que confirmar", () => {
    expect(vistaPreviaQuitar({ ...liq, descuentoPct: null }, 5, "2026-10-17")).toBeNull();
    expect(vistaPreviaQuitar(liq, 0, "2026-10-17")).toBeNull();
  });
  it("vigente: deja de rebajar desde hoy, sin prometer «su precio normal» (puede seguir en otra campaña)", () => {
    const p = vistaPreviaQuitar(liq, 3, "2026-10-17")!;
    expect(p.titulo).toBe("«Para liquidar» deja de rebajar 3 prendas");
    expect(p.detalle).toBe("Desde hoy, en Vender se cobran sin este 40 %.");
    expect(p.detalle).not.toContain("normal");
    expect(p.sinEfectoHoy).toBe(false);
  });
  it("sin fechas rige siempre: también deja de rebajar hoy", () => {
    expect(vistaPreviaQuitar({ ...liq, vigenteDesde: null, vigenteHasta: null }, 1, "2026-10-17")!.titulo).toBe("«Para liquidar» deja de rebajar 1 prenda");
  });
  it("una campaña futura avisa que hoy no cambia ningún precio", () => {
    const p = vistaPreviaQuitar({ ...liq, nombre: "Black Friday", vigenteDesde: "2026-11-09", vigenteHasta: "2026-11-30" }, 2, "2026-10-17")!;
    expect(p.titulo).toBe("«Black Friday» ya no rebajará 2 prendas");
    expect(p.detalle).toBe("La campaña empieza el 9 nov: hoy su precio no cambia.");
    expect(p.sinEfectoHoy).toBe(true);
  });
  it("una campaña terminada tampoco cambia nada", () => {
    const p = vistaPreviaQuitar(liq, 2, "2027-01-05")!;
    expect(p.titulo).toBe("«Para liquidar» se quita de 2 prendas");
    expect(p.detalle).toContain("terminó el 31 dic");
    expect(p.sinEfectoHoy).toBe(true);
  });
});

describe("avisoFueraDeVenta — marcas en prendas que ya no se venden", () => {
  it("dice qué son y qué pasa si vuelven, con el descuento si lo hay", () => {
    expect(avisoFueraDeVenta(22, true, false)).toEqual({
      titulo: "22 prendas que ya no se venden siguen marcadas",
      detalle: "Son tallas desactivadas o productos descontinuados. Si vuelven a la venta, vuelven con este descuento.",
    });
    expect(avisoFueraDeVenta(1, false, false)).toEqual({
      titulo: "1 prenda que ya no se vende sigue marcada",
      detalle: "Es una talla desactivada o un producto descontinuado. Si vuelve a la venta, vuelve con la etiqueta.",
    });
  });
  it("tras «Quitárselas», dice lo que pasará al aplicar", () => {
    expect(avisoFueraDeVenta(22, true, true)).toEqual({
      titulo: "Al aplicar, se la quitarás a 22 prendas que ya no se venden",
      detalle: "Hoy no cambia ningún precio: no están a la venta.",
    });
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

describe("lo que la hoja dice de cada producto", () => {
  const porCategoria = new Set(["c-faldas"]);

  it("lleva la etiqueta por su categoría o con al menos una talla marcada a mano", () => {
    expect(llevaEtiqueta(falda, new Set(), porCategoria)).toBe(true);
    expect(llevaEtiqueta(polo, new Set(["b"]), porCategoria)).toBe(true);
    expect(llevaEtiqueta(polo, new Set(["d"]), porCategoria)).toBe(false);
  });

  it("las píldoras cuentan los productos con y sin la etiqueta, y suman el total", () => {
    expect(cuentaPorMarca([polo, falda, sinTallas], new Set(["a"]), porCategoria)).toEqual({ todas: 3, con: 2, sin: 1 });
    expect(cuentaPorMarca([polo, falda], new Set(), new Set())).toEqual({ todas: 2, con: 0, sin: 2 });
  });

  it("una píldora da los productos que entran en ella; «Todas» no filtra", () => {
    expect(idsPorMarca([polo, falda], "todas", new Set(), porCategoria)).toBeNull();
    expect([...idsPorMarca([polo, falda], "con", new Set(), porCategoria)!]).toEqual(["p2"]);
    expect([...idsPorMarca([polo, falda], "sin", new Set(), porCategoria)!]).toEqual(["p1"]);
  });

  it("«2 de 3 tallas y colores» solo si la marca es parcial; si entra por categoría, las lleva todas", () => {
    expect(textoTallas(polo, new Set(), false)).toBe("3 tallas y colores");
    expect(textoTallas(polo, new Set(["a", "b"]), false)).toBe("2 de 3 tallas y colores");
    expect(textoTallas(polo, new Set(["a", "b", "c"]), false)).toBe("3 tallas y colores");
    expect(textoTallas(polo, new Set(), true)).toBe("3 tallas y colores");
    expect(textoTallas({ ...polo, variantes: [v("a")] }, new Set(), false)).toBe("1 talla y color");
  });
});

describe("precioConCampana — el precio antes y después, con la cuenta de la caja", () => {
  const conPrecios = (...precios: (number | null)[]): ProductoEtiquetable => ({ ...polo, variantes: precios.map((precio, i) => ({ ...v(`x${i}`), precio })) });

  it("sin descuento no hay precio que mostrar", () => {
    expect(precioConCampana(conPrecios(79.9), null)).toBeNull();
  });
  it("79.90 con 20 % se cobra 63.90 (la cuenta exacta da 63.92, ADR-0403)", () => {
    expect(precioConCampana(conPrecios(79.9, 79.9), 20)).toEqual({ antes: 79.9, despues: 63.9, desde: false });
  });
  it("con precios distintos por talla, el más bajo y «desde»", () => {
    expect(precioConCampana(conPrecios(99.9, 89.9), 10)).toEqual({ antes: 89.9, despues: 80.9, desde: true });
  });
  it("sin un precio mayor que 0 (la bolsa de obsequio), nada", () => {
    expect(precioConCampana(conPrecios(0, null), 20)).toBeNull();
  });
});
