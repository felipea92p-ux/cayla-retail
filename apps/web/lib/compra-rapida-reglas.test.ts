import { describe, expect, it } from "vitest";
import {
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  faltaEnPaso,
  faltaNombreNuevo,
  filtrarCategoriasNuevo,
  filtrarMarcas,
  filtrarProveedores,
  habitualNuevo,
  habitualParecido,
  leerCantidad,
  leerHabituales,
  leerPrecio,
  leerProveedoresParaComprar,
  lineasParaBase,
  marcasDeHabituales,
  prendasDeLineas,
  textoAvance,
  gananciaDeCompra,
  cuadraElPapel,
  camposPrenda,
  gananciaPorPrenda,
  textoAgregarPrenda,
  lineaDeBorrador,
  resumenCarrito,
  proveedoresRecientes,
  detalleProveedor,
  inicialesProveedor,
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
  marca: "CAYLA",
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
    expect(textoAvance("proveedor")).toBe("Paso 1 de 3 · el proveedor");
    expect(textoAvance("habituales")).toBe("Paso 2 de 3 · las prendas");
    expect(textoAvance("papel")).toBe("Paso 3 de 3 · el papel");
  });
});

describe("algo nuevo de este proveedor", () => {
  const CATS = [
    { id: "blusas", nombre: "Camisas y Blusas", prefijo: "CMS", familia: "indumentaria" },
    { id: "sud", nombre: "Sudaderas", prefijo: "SUD", familia: "indumentaria" },
    { id: "jeans", nombre: "Jeans", prefijo: "JEA", familia: "indumentaria" },
    { id: "nueva", nombre: "Ponchos", prefijo: null, familia: null },
  ];
  it("«¿Qué es?»: primero lo que ya le compras; se busca sin tildes y por la prenda de la ficha", () => {
    const todo = filtrarCategoriasNuevo(CATS, "", new Set(["jeans"]));
    expect(todo.suyas.map((c) => c.id)).toEqual(["jeans"]);
    expect(todo.otras.map((c) => c.id)).toEqual(["blusas", "sud", "nueva"]);
    expect(filtrarCategoriasNuevo(CATS, "BLÚSA", new Set()).otras.map((c) => c.id)).toEqual(["blusas"]);
    expect(filtrarCategoriasNuevo(CATS, "polera", new Set()).otras.map((c) => c.id)).toEqual(["sud"]);
    expect(filtrarCategoriasNuevo(CATS, "zapatos", new Set(["jeans"]))).toEqual({ suyas: [], otras: [] });
  });
  it("el nombre: de 3 a 80 letras, sin contar los espacios de más", () => {
    expect(faltaNombreNuevo("")).toBe("Escribe el nombre de la prenda");
    expect(faltaNombreNuevo("  ab  ")).toBe("Escribe el nombre de la prenda");
    expect(faltaNombreNuevo("Casaca corta")).toBeNull();
    expect(faltaNombreNuevo("x".repeat(81))).toBe("El nombre va hasta 80 letras");
  });
  it("avisa si se llama igual o casi igual que uno de sus habituales, y deja de preguntar si dijo «No, es otra»", () => {
    expect(habitualParecido("blusa MANGA globo", HABITUALES, new Set())?.clave).toBe("a");
    expect(habitualParecido("Blusa manga globos", HABITUALES, new Set())?.clave).toBe("a");
    expect(habitualParecido("blusa manga globo", HABITUALES, new Set(["a"]))).toBeNull();
    expect(habitualParecido("Casaca corta acolchada", HABITUALES, new Set())).toBeNull();
    expect(habitualParecido("", HABITUALES, new Set())).toBeNull();
  });
  it("las marcas del proveedor, la que más prendas tiene primero; sin marca no cuenta", () => {
    const hs = leerHabituales([
      { clave: "1", nombre: "A", categoria_id: "c", marca_id: "m2", marca: "Mias" },
      { clave: "2", nombre: "B", categoria_id: "c", marca_id: "m1", marca: "CAYLA" },
      { clave: "3", nombre: "C", categoria_id: "c", marca_id: "m1", marca: "CAYLA" },
      { clave: "4", nombre: "D", categoria_id: "c" },
    ]);
    expect(marcasDeHabituales(hs)).toEqual([
      { id: "m1", nombre: "CAYLA" },
      { id: "m2", nombre: "Mias" },
    ]);
    expect(marcasDeHabituales([])).toEqual([]);
  });
  it("«Otra marca» busca entre todas sin tildes ni mayúsculas", () => {
    const marcas = [
      { id: "1", nombre: "Ángelys" },
      { id: "2", nombre: "CAYLA" },
    ];
    expect(filtrarMarcas(marcas, "angel").map((m) => m.id)).toEqual(["1"]);
    expect(filtrarMarcas(marcas, "")).toHaveLength(2);
  });
  it("la prenda nueva sigue como un habitual sin compras: sin producto del catálogo y sin precios de antes", () => {
    const h = habitualNuevo("nuevo:1", { nombre: "  Casaca   corta ", categoria: CATS[0], marca: { id: "m1", nombre: "CAYLA" } });
    expect(h).toMatchObject({ clave: "nuevo:1", productoId: null, nombre: "Casaca corta", categoriaId: "blusas", marcaId: "m1", veces: 0, costo: null, venta: null });
    expect(textoHabitual(h)).toBeNull();
    expect(textoAvance("nuevo-categoria")).toBe("Paso 2 de 3 · las prendas · qué es");
    expect(textoAvance("nuevo-marca")).toBe("Paso 2 de 3 · las prendas · marca");
  });
});

describe("el proveedor, como la maqueta (compras-formidable-2026-10)", () => {
  const P = (id: string, compras: number, ultima: string | null) => ({ id, nombre: id, ruc: null, categorias: [], compras, ultima });
  it("los recientes: solo a quienes ya se les compró, el más reciente primero, hasta el máximo", () => {
    const lista = [P("a", 3, "2026-10-01"), P("b", 0, null), P("c", 1, "2026-10-20"), P("d", 9, "2026-10-20"), P("e", 2, "2026-09-01")];
    expect(proveedoresRecientes(lista).map((p) => p.id)).toEqual(["d", "c", "a", "e"]);
    expect(proveedoresRecientes(lista, 2).map((p) => p.id)).toEqual(["d", "c"]);
  });
  it("cuándo y cuántas veces, en palabras de tienda", () => {
    const hoy = "2026-10-23";
    expect(detalleProveedor(P("a", 4, "2026-10-17"), hoy)).toBe("Le compraste hace 6 días · 4 compras");
    expect(detalleProveedor(P("a", 1, "2026-10-23"), hoy)).toBe("Le compraste hoy · 1 compra");
    expect(detalleProveedor(P("a", 2, "2026-10-22"), hoy)).toBe("Le compraste ayer · 2 compras");
    expect(detalleProveedor(P("a", 2, "2026-10-11"), hoy)).toBe("Le compraste hace una semana · 2 compras");
    expect(detalleProveedor(P("a", 2, "2026-09-30"), hoy)).toBe("Le compraste hace 3 semanas · 2 compras");
    expect(detalleProveedor(P("a", 1, "2026-09-10"), hoy)).toBe("Le compraste hace un mes · 1 compra");
    expect(detalleProveedor(P("a", 1, "2026-06-01"), hoy)).toBe("Le compraste hace 4 meses · 1 compra");
    expect(detalleProveedor(P("a", 0, null), hoy)).toBe("Todavía no le compras");
    expect(detalleProveedor(P("a", 3, null), hoy)).toBe("3 compras");
  });
  it("las iniciales del cuadro", () => {
    expect(inicialesProveedor("Textiles Rosa S.A.C.")).toBe("TR");
    expect(inicialesProveedor("Galería Gamarra 412")).toBe("GG");
    expect(inicialesProveedor("Lupe")).toBe("LU");
    expect(inicialesProveedor("  ")).toBe("?");
    expect(inicialesProveedor("Confecciones Andina EIRL")).toBe("CA");
  });
});

describe("la hoja de la prenda (rediseño)", () => {
  const H = { clave: "p1", productoId: "p1", categoriaId: "c", marcaId: null, nombre: "Blusa Emma", categoria: "Blusas", marca: null };
  const lleno = { cantidad: "12", costo: "17.50", venta: "39.90", destinoId: "lim" };
  it("falta lo mismo que antes frenaba cada paso, y la tienda", () => {
    const falta = (b: Parameters<typeof camposPrenda>[0]) => camposPrenda(b).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(falta({ cantidad: "", costo: "", venta: "", destinoId: null })).toEqual(["cantidad", "costo", "venta", "tienda"]);
    expect(falta({ ...lleno, cantidad: "0" })).toEqual(["cantidad"]);
    expect(falta({ ...lleno, costo: "17.555" })).toEqual(["costo"]);
    expect(falta({ ...lleno, destinoId: null })).toEqual(["tienda"]);
    expect(falta(lleno)).toEqual([]);
  });
  it("la guía coincide con la línea: sin faltas hay línea; con una falta, no", () => {
    expect(lineaDeBorrador(H, lleno)).toMatchObject({ cantidad: 12, costo: 17.5, venta: 39.9, destinoId: "lim", clave: "p1" });
    for (const roto of [{ cantidad: "" }, { costo: "x" }, { venta: "" }, { destinoId: null }]) {
      const b = { ...lleno, ...roto };
      expect(lineaDeBorrador(H, b) === null).toBe(camposPrenda(b).some((c) => c.requerido && !c.hecho));
    }
  });
  it("la ganancia por prenda y el botón que dice lo que hace", () => {
    expect(gananciaPorPrenda(lleno)).toBe(22.4);
    expect(gananciaPorPrenda({ costo: "20", venta: "" })).toBeNull();
    expect(plano(textoAgregarPrenda(lleno, false))).toBe("Agregar 12 · S/ 210.00");
    expect(plano(textoAgregarPrenda(lleno, true))).toBe("Guardar 12 · S/ 210.00");
    expect(textoAgregarPrenda({ cantidad: "", costo: "1" }, false)).toBe("Agregar");
  });
  it("la barra negra suma prendas, plata y modelos", () => {
    const r = resumenCarrito([{ cantidad: 12, costo: 17.5 }, { cantidad: 20, costo: 9 }]);
    expect([plano(r.titulo), r.detalle]).toEqual(["32 prendas · S/ 390.00", "2 modelos"]);
    expect(resumenCarrito([{ cantidad: 1, costo: 5 }]).detalle).toBe("1 modelo");
  });
});

describe("revisar y el papel (rediseño)", () => {
  it("si se vende todo: lo que se vende y lo que se gana, solo con las prendas que tienen precio de venta", () => {
    expect(gananciaDeCompra([{ cantidad: 12, costo: 17.5, venta: 39.9 }, { cantidad: 20, costo: 9, venta: 24.9 }])).toEqual({ vendes: 976.8, ganas: 586.8 });
    expect(gananciaDeCompra([{ cantidad: 2, costo: 10, venta: null }, { cantidad: 1, costo: 5, venta: 8 }])).toEqual({ vendes: 8, ganas: 3 });
    expect(gananciaDeCompra([{ cantidad: 2, costo: 10, venta: null }])).toBeNull();
  });
  it("el papel cuadra o no con lo anotado; si no, manda el papel", () => {
    expect(cuadraElPapel(525, 525)).toEqual({ cuadra: true, texto: "Cuadra con lo que anotaste" });
    expect(cuadraElPapel(530, 525)?.cuadra).toBe(false);
    expect(plano(cuadraElPapel(530, 525)?.texto ?? null)).toBe("Anotaste S/ 525.00. Si el papel dice otro total, deja el del papel: Compras lo revisa.");
    expect(cuadraElPapel(null, 525)).toBeNull();
    expect(cuadraElPapel(0, 525)).toBeNull();
  });
});
