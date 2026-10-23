import { describe, expect, it } from "vitest";
import {
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  faltaEnPaso,
  filtrarProveedores,
  leerCantidad,
  leerHabituales,
  leerPrecio,
  leerProveedoresParaComprar,
  lineasParaBase,
  prendasDeLineas,
  textoAvance,
  textoHabitual,
  textoPlataDespues,
  tiendaAnterior,
  tiendasDeLineas,
  totalDeLineas,
  type LineaCompra,
} from "./compra-rapida-reglas";

// `soles()` une «S/» y la cifra con un espacio que no se parte (ADR-0413): las frases se comparan con espacios comunes.
const plano = (s: string | null) => s?.replace(/ /g, " ") ?? null;

const PROVEEDORES = leerProveedoresParaComprar([
  { id: "rosa", nombre: "Textiles Rosa E.I.R.L.", ruc: "20123456789", categorias: ["blusas", "polos"], compras: 4, ultima: "2026-10-16" },
  { id: "lupe", nombre: "Confecciones Lupe", ruc: null, categorias: ["jeans"], compras: 1, ultima: "2026-10-01" },
  { id: "andinos", nombre: "Tejidos Andinos", categorias: [], compras: 0 },
  { id: "x" },
  null,
]);

describe("proveedores para comprar", () => {
  it("lee cada uno y descarta lo ilegible", () => {
    expect(PROVEEDORES.map((p) => [p.id, p.compras, p.categorias.length])).toEqual([
      ["rosa", 4, 2],
      ["lupe", 1, 1],
      ["andinos", 0, 0],
    ]);
    expect(leerProveedoresParaComprar({})).toEqual([]);
  });
  it("se busca por nombre sin tildes ni mayúsculas, y por lo que vende", () => {
    expect(filtrarProveedores(PROVEEDORES, "LUPE", null).map((p) => p.id)).toEqual(["lupe"]);
    expect(filtrarProveedores(PROVEEDORES, "textíles", null).map((p) => p.id)).toEqual(["rosa"]);
    expect(filtrarProveedores(PROVEEDORES, "", "jeans").map((p) => p.id)).toEqual(["lupe"]);
    expect(filtrarProveedores(PROVEEDORES, "rosa", "jeans")).toEqual([]);
    expect(filtrarProveedores(PROVEEDORES, "", null)).toHaveLength(3);
  });
  it("las píldoras son solo las categorías que alguien vende, en el orden del catálogo", () => {
    const cats = [
      { id: "faldas", nombre: "Faldas" },
      { id: "jeans", nombre: "Jeans" },
      { id: "blusas", nombre: "Blusas" },
    ];
    expect(categoriasConProveedor(PROVEEDORES, cats).map((c) => c.id)).toEqual(["jeans", "blusas"]);
  });
});

const HABITUALES = leerHabituales([
  { clave: "a", producto_id: "p1", nombre: "Blusa manga globo", categoria_id: "blusas", categoria: "Blusas", marca_id: "m", marca: "CAYLA", veces: 3, ultima_fecha: "2026-10-16", ultima_cantidad: 12, costo: 17.5, venta: 39.9 },
  { clave: "b", producto_id: "p2", nombre: "Polo básico", categoria_id: "polos", categoria: "Polos", veces: 0, costo: "12.00", venta: "29.90" },
  { clave: "c", nombre: "Sin categoría" },
]);

describe("habituales", () => {
  it("lee cada uno; sin categoría no se puede comprar y se descarta", () => {
    expect(HABITUALES.map((h) => [h.clave, h.veces, h.costo, h.venta, h.marcaId])).toEqual([
      ["a", 3, 17.5, 39.9, "m"],
      ["b", 0, 12, 29.9, null],
    ]);
  });
  it("la línea chica dice lo de la vez pasada, o el precio del catálogo si nunca se le compró aquí", () => {
    expect(plano(textoHabitual(HABITUALES[0]))).toBe("La vez pasada: 12 a S/ 17.50 · se vendió a S/ 39.90");
    expect(plano(textoHabitual(HABITUALES[1]))).toBe("En el catálogo: se vende a S/ 29.90");
    expect(textoHabitual({ ...HABITUALES[1], venta: null })).toBeNull();
  });
  it("las píldoras de sus habituales cuentan cuántos hay en cada categoría; con una sola categoría no hay píldoras", () => {
    expect(categoriasDeHabituales(HABITUALES)).toEqual([
      { id: "blusas", nombre: "Blusas", cuantos: 1 },
      { id: "polos", nombre: "Polos", cuantos: 1 },
    ]);
    expect(categoriasDeHabituales([HABITUALES[0]])).toEqual([]);
  });
});

describe("los números de cada paso (la regla de las líneas de una orden)", () => {
  it("cantidad: un entero de 1 a 99 999, sin decimales ni signos", () => {
    expect(leerCantidad("12")).toBe(12);
    expect(leerCantidad(" 3 ")).toBe(3);
    for (const malo of ["0", "-1", "1.5", "100000", "", "abc"]) expect(leerCantidad(malo), malo).toBeNull();
  });
  it("precio: de S/ 0 a S/ 99 999.99 con hasta dos decimales; 0.29 no se rechaza por el redondeo de la máquina", () => {
    expect(leerPrecio("17.50")).toBe(17.5);
    expect(leerPrecio("0.29")).toBe(0.29);
    expect(leerPrecio("1,250.50")).toBe(1250.5);
    expect(leerPrecio("0")).toBe(0);
    for (const malo of ["", "abc", "-1", "100000", "1.234"]) expect(leerPrecio(malo), malo).toBeNull();
  });
  it("bajo el botón gris, qué falta", () => {
    expect(faltaEnPaso("cantidad", "")).toBe("Escribe cuántas compraste");
    expect(faltaEnPaso("cantidad", "4")).toBeNull();
    expect(faltaEnPaso("costo", "")).toBe("Escribe el precio");
    expect(faltaEnPaso("venta", "39.90")).toBeNull();
  });
});

const L = (o: Partial<LineaCompra>): LineaCompra => ({
  clave: "a",
  productoId: "p1",
  categoriaId: "blusas",
  marcaId: "m",
  nombre: "Blusa manga globo",
  categoria: "Blusas",
  cantidad: 12,
  costo: 17.5,
  venta: 39.9,
  destinoId: "tru",
  ...o,
});

describe("la compra", () => {
  const lineas = [L({}), L({ clave: "b", productoId: "p2", cantidad: 4, costo: 12.25, destinoId: "lim" }), L({ cantidad: 1, destinoId: "tru" })];
  it("total y prendas", () => {
    expect(totalDeLineas(lineas)).toBe(12 * 17.5 + 4 * 12.25 + 17.5);
    expect(prendasDeLineas(lineas)).toBe(17);
    expect(totalDeLineas([])).toBe(0);
  });
  it("la tienda que llega marcada es la de la prenda anterior; las tiendas de la compra, sin repetir", () => {
    expect(tiendaAnterior(lineas)).toBe("tru");
    expect(tiendaAnterior([])).toBeNull();
    expect(tiendasDeLineas(lineas, new Map([["tru", "Tienda TRU"], ["lim", "Tienda LIM"]]))).toEqual(["Tienda TRU", "Tienda LIM"]);
  });
  it("lo que se manda a la base", () => {
    expect(lineasParaBase([lineas[1]])).toEqual([
      { producto_id: "p2", categoria_id: "blusas", marca_id: "m", descripcion: "Blusa manga globo", cantidad: 4, costo: 12.25, precio_venta: 39.9, destino_id: "lim" },
    ]);
  });
});

describe("el paso del papel: lo que falta es lo que rechaza registrar_compra_rapida", () => {
  const PERSONA = { esPersona: true, listo: true, motivo: null };
  const faltan = (v: Parameters<typeof camposPapel>[0], r = PERSONA) => camposPapel(v, r).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
  it("sin nada faltan el papel y el monto; con boleta, también la foto", () => {
    expect(faltan({ tipo: null, conFoto: false, monto: "" })).toEqual(["tipo", "monto"]);
    expect(faltan({ tipo: "boleta", conFoto: false, monto: "500" })).toEqual(["foto"]);
    expect(faltan({ tipo: "boleta", conFoto: true, monto: "500" })).toEqual([]);
  });
  it("sin papel no pide foto", () => {
    expect(faltan({ tipo: "sin_comprobante", conFoto: false, monto: "80" })).toEqual([]);
  });
  it("desde una terminal, falta quién compró", () => {
    expect(faltan({ tipo: "sin_comprobante", conFoto: false, monto: "80" }, { esPersona: false, listo: false, motivo: null })).toEqual(["responsable"]);
  });
});

describe("lo que queda después de guardar", () => {
  it("con plata, cuánto tiene; en negativo, que anote la plata que le dieron", () => {
    expect(plano(textoPlataDespues(274))).toBe("Ahora tienes S/ 274.00 para comprar.");
    expect(plano(textoPlataDespues(0))).toBe("Ahora tienes S/ 0.00 para comprar.");
    expect(plano(textoPlataDespues(-726))).toBe("Gastaste S/ 726.00 más de lo que anotaste: si te dieron más plata, anótala en «Me dieron plata».");
  });
});

describe("la barra de avance: siempre 3 pasos", () => {
  it("dice el paso, su nombre y el detalle dentro de las prendas", () => {
    expect(textoAvance("proveedor")).toBe("Paso 1 de 3 · Proveedor");
    expect(textoAvance("habituales")).toBe("Paso 2 de 3 · Prendas");
    expect(textoAvance("costo")).toBe("Paso 2 de 3 · Prendas · costo");
    expect(textoAvance("papel")).toBe("Paso 3 de 3 · Boleta o factura");
  });
});
