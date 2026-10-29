import { describe, expect, it } from "vitest";
import {
  camposPapel,
  categoriasConProveedor,
  categoriasDeHabituales,
  faltaEnPaso,
  faltaNombreNuevo,
  conMarcas,
  filtrarProveedores,
  camposPrendaNueva,
  habitualDeNuevo,
  nuevoVacio,
  opcionesCategoriaNueva,
  opcionesMarcaNueva,
  chipsDeLoHabitual,
  prendasDeLaCompra,
  totalesPorTienda,
  TOPE_CHIPS_NUEVA,
  PROVEEDORES_POR_TANDA,
  tandaDeLista,
  habitualParecido,
  leerCantidad,
  leerHabituales,
  leerPrecio,
  leerPrecioVenta,
  leerProveedoresParaComprar,
  lineasParaBase,
  marcasDeHabituales,
  categoriasDeLasLineas,
  marcasDeLasLineas,
  marcasParaNueva,
  marcasConProvisionales,
  prendasDeLineas,
  textoAvance,
  lineaDeAvance,
  PASOS_DE_LA_COMPRA,
  problemaPagado,
  pagoParaBase,
  textoLoQueFalta,
  PAGO_DE_FABRICA,
  gananciaDeCompra,
  cuadraElPapel,
  camposPrenda,
  gananciaPorPrenda,
  textoAgregarPrenda,
  lineasDeBorrador,
  repartoParejo,
  alternarDestino,
  MARCA_NUEVA_MAX,
  MARCA_NUEVA_PREFIJO,
  marcaEscrita,
  marcasPorCrear,
  conMarcasCreadas,
  conCantidad,
  problemaReparto,
  borradorDeLineas,
  textoPrendaEnCompra,
  nombreCortoTienda,
  resumenCarrito,
  proveedoresRecientes,
  detalleProveedor,
  inicialesProveedor,
  piezasDeFila,
  cantidadDeAtajo,
  borradorDeAtajo,
  conPrendaAgregada,
  candadoDeEnvio,
  textoPlataDespues,
  tiendaAnterior,
  tiendasDeLineas,
  totalDeLineas,
  type LineaCompra,
} from "./compra-rapida-reglas";

// `soles()` une «S/» y la cifra con un espacio que no se parte (ADR-0413): las frases se comparan con espacios comunes.
const plano = (s: string | null) => s?.replace(/ /g, " ") ?? null;

const PROVEEDORES = conMarcas(leerProveedoresParaComprar([
  { id: "rosa", nombre: "Textiles Rosa E.I.R.L.", ruc: "20123456789", categorias: ["blusas", "polos"], compras: 4, ultima: "2026-10-16" },
  { id: "lupe", nombre: "Confecciones Lupe", ruc: null, categorias: ["jeans"], compras: 1, ultima: "2026-10-01" },
  { id: "andinos", nombre: "Tejidos Andinos", categorias: [], compras: 0 },
  { id: "x" },
  null,
]), { rosa: ["Kero", "Ámbar"] });

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
  it("también se busca por la marca con que se conoce al proveedor, sin tildes", () => {
    expect(PROVEEDORES.find((p) => p.id === "rosa")?.marcas).toEqual(["Kero", "Ámbar"]);
    expect(filtrarProveedores(PROVEEDORES, "kero", null).map((p) => p.id)).toEqual(["rosa"]);
    expect(filtrarProveedores(PROVEEDORES, "ambar", null).map((p) => p.id)).toEqual(["rosa"]);
    expect(filtrarProveedores(PROVEEDORES, "kero", "jeans")).toEqual([]);
    expect(conMarcas(PROVEEDORES, null).every((p) => p.marcas.length === 0)).toBe(true);
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
  it("la fila dice lo que te costó, a cuánto vendes y cuántas fueron la vez pasada", () => {
    const f = (pz: { etiqueta: string; valor: string }[]) => pz.map((x) => plano(`${x.etiqueta} ${x.valor}`));
    expect(f(piezasDeFila(HABITUALES[0], []))).toEqual(["Te costó S/ 17.50", "vendes S/ 39.90", "antes: 12"]);
    // Nunca se le compró aquí: solo el precio del catálogo.
    expect(f(piezasDeFila(HABITUALES[1], []))).toEqual(["Se vende a S/ 29.90"]);
    expect(piezasDeFila({ ...HABITUALES[1], venta: null }, [])).toEqual([]);
    expect(piezasDeFila(null, [])).toEqual([]);
  });
  it("una prenda que ya va en la compra dice lo que se anotó, sin «antes»", () => {
    const l = { clave: "a", productoId: "p1", categoriaId: "blusas", marcaId: null, nombre: "Blusa", categoria: "Blusas", marca: null, costo: 38, venta: 69.9, cantidad: 2, destinoId: "tru" };
    expect(piezasDeFila(HABITUALES[0], [l]).map((x) => plano(`${x.etiqueta} ${x.valor}`))).toEqual(["Te costó S/ 38.00", "vendes S/ 69.90"]);
    expect(piezasDeFila(HABITUALES[0], [{ ...l, venta: null }]).map((x) => x.etiqueta)).toEqual(["Te costó"]);
  });
  it("el botón «+ 9» existe solo si ya se le compró y se sabe cuántas", () => {
    expect(cantidadDeAtajo(HABITUALES[0])).toBe(12);
    expect(cantidadDeAtajo(HABITUALES[1])).toBeNull();
    expect(cantidadDeAtajo({ veces: 2, ultimaCantidad: 0 })).toBeNull();
    expect(cantidadDeAtajo({ veces: 2, ultimaCantidad: null })).toBeNull();
  });
  it("el atajo arma el borrador con lo de la vez pasada, a la tienda de la prenda anterior", () => {
    const b = borradorDeAtajo(HABITUALES[0], "tru");
    expect(b).toEqual({ cantidad: "12", costo: "17.50", venta: "39.90", destinos: ["tru"], reparto: {} });
    expect(lineasDeBorrador(HABITUALES[0], b!)).toHaveLength(1);
    // Sin tienda anterior queda incompleto: no se agrega solo, se abre la hoja para elegirla.
    const sinTienda = borradorDeAtajo(HABITUALES[0], null)!;
    expect(sinTienda.destinos).toEqual([]);
    expect(lineasDeBorrador(HABITUALES[0], sinTienda)).toEqual([]);
    // Sin vez pasada no hay atajo.
    expect(borradorDeAtajo(HABITUALES[1], "tru")).toBeNull();
  });
  // /chaos 2026-10-28, hallazgo 1: cinco toques en el mismo instante agregaban la prenda cinco veces (45 unidades en vez de 9), porque cada
  // uno veía la compra de antes del primero. Agregar a la compra nunca repite una prenda que ya va.
  // /chaos 2026-10-29: cinco clics en «Guardar» en el mismo instante mandaban cinco pedidos iguales (la guardia leía el estado de antes del
  // primero). La base respondía lo mismo y quedaba una sola compra, pero salían cinco pedidos: el candado deja pasar solo el primero.
  it("el candado del envío deja pasar solo el primer clic hasta que el envío termina", () => {
    const c = candadoDeEnvio();
    const pasaron = [c.tomar(), c.tomar(), c.tomar(), c.tomar(), c.tomar()].filter(Boolean).length;
    expect(pasaron).toBe(1);
    c.soltar();
    expect(c.tomar()).toBe(true); // tras un corte o un rechazo se puede volver a tocar «Guardar»
    expect(c.tomar()).toBe(false);
    c.soltar();
    c.soltar(); // soltar de más no rompe nada
    expect(c.tomar()).toBe(true);
  });
  it("agregar la misma prenda varias veces seguidas la deja una sola vez", () => {
    const nuevas = lineasDeBorrador(HABITUALES[0], borradorDeAtajo(HABITUALES[0], "tru")!);
    const agregar = (ls: readonly LineaCompra[]) => conPrendaAgregada(ls, nuevas);
    const despues = [agregar, agregar, agregar, agregar, agregar].reduce<readonly LineaCompra[]>((ls, f) => f(ls), []);
    expect(despues).toHaveLength(1);
    expect(prendasDeLineas(despues)).toBe(12);
    // Otra prenda sí entra, y una lista vacía de líneas no cambia nada.
    const otra = lineasDeBorrador(HABITUALES[1], { cantidad: "3", costo: "12.00", venta: "29.90", destinos: ["tru"], reparto: {} });
    expect(conPrendaAgregada(despues, otra)).toHaveLength(2);
    expect(conPrendaAgregada(despues, [])).toEqual(despues);
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
  it("precio de VENTA: como lo acota la base (de S/ 0 a S/ 5 000; el 0 solo en bolsas, cajas y empaque)", () => {
    expect(leerPrecioVenta("39.90")).toBe(39.9);
    expect(leerPrecioVenta("5000")).toBe(5000);
    expect(leerPrecioVenta("5000.01")).toBeNull();
    expect(leerPrecioVenta("99999.99")).toBeNull();
    // El costo, en cambio, llega hasta S/ 99 999.99 (la regla de las líneas de una orden).
    expect(leerPrecio("5000.01")).toBe(5000.01);
    // El 0: sin decir la categoría se acepta como siempre; con una que no lo admite, no.
    expect(leerPrecioVenta("0")).toBe(0);
    expect(leerPrecioVenta("0", true)).toBe(0);
    expect(leerPrecioVenta("0", false)).toBeNull();
    expect(leerPrecioVenta("0.01", false)).toBe(0.01);
    for (const malo of ["", "abc", "-1", "1.234"]) expect(leerPrecioVenta(malo), malo).toBeNull();
  });
  it("la venta fuera de rango se dice bajo el botón, no al guardar los tres pasos", () => {
    expect(faltaEnPaso("venta", "6000")).toBe("El precio de venta llega hasta S/\u00a05,000.00");
    expect(faltaEnPaso("venta", "0", false)).toBe("Escribe un precio mayor que 0: solo las bolsas, cajas y empaque se regalan");
    expect(faltaEnPaso("venta", "0", true)).toBeNull();
    expect(faltaEnPaso("venta", "")).toBe("Escribe el precio");
    // El costo no pasa por ese tope.
    expect(faltaEnPaso("costo", "6000")).toBeNull();
  });
  it("el papel de una compra llega hasta S/ 1 000 000 (la base): más, se dice en el campo", () => {
    const monto = (m: string) => camposPapel({ tipo: "boleta", conFoto: false, monto: m }, { esPersona: true, listo: true, motivo: null }).find((c) => c.id === "monto");
    expect(monto("1000000")?.hecho).toBe(true);
    expect(monto("1000000.01")?.hecho).toBe(false);
  });
  it("bajo el botón gris, qué falta", () => {
    expect(faltaEnPaso("cantidad", "")).toBe("Escribe cuántas unidades compraste");
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
  it("sin nada faltan el papel y el monto; la foto es opcional (20261023180000): con boleta se sugiere, nunca frena", () => {
    expect(faltan({ tipo: null, conFoto: false, monto: "" })).toEqual(["tipo", "monto"]);
    expect(faltan({ tipo: "boleta", conFoto: false, monto: "500" })).toEqual([]);
    expect(camposPapel({ tipo: "boleta", conFoto: false, monto: "500" }, PERSONA).find((c) => c.id === "foto")).toMatchObject({ requerido: false, sugerido: true, hecho: false });
  });
  it("sin papel ni se ofrece la foto", () => {
    expect(faltan({ tipo: "sin_comprobante", conFoto: false, monto: "80" })).toEqual([]);
    expect(camposPapel({ tipo: "sin_comprobante", conFoto: false, monto: "80" }, PERSONA).some((c) => c.id === "foto")).toBe(false);
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

  it("los tres tramos tienen nombre y la línea de arriba dice a quién le compra cuando ya lo eligió", () => {
    expect(PASOS_DE_LA_COMPRA).toEqual(["El proveedor", "Las prendas", "Papel y pago"]);
    expect(lineaDeAvance("proveedor", null)).toBe("Paso 1 de 3");
    expect(lineaDeAvance("habituales", "Textiles Rosa")).toBe("Textiles Rosa · paso 2 de 3");
    expect(lineaDeAvance("revisar", "Textiles Rosa")).toBe("Textiles Rosa · paso 2 de 3");
    expect(lineaDeAvance("papel", "Textiles Rosa")).toBe("Textiles Rosa · paso 3 de 3");
  });
});

describe("algo nuevo de este proveedor", () => {
  const CATS = [
    { id: "blusas", nombre: "Camisas y Blusas", prefijo: "CMS", familia: "indumentaria" },
    { id: "sud", nombre: "Sudaderas", prefijo: "SUD", familia: "indumentaria" },
    { id: "jeans", nombre: "Jeans", prefijo: "JEA", familia: "indumentaria" },
    { id: "nueva", nombre: "Ponchos", prefijo: null, familia: null },
  ];
  it("«¿Qué es?»: primero lo que ya le compras, en su grupo; sin nada suyo, una sola lista", () => {
    expect(opcionesCategoriaNueva(CATS, new Set(["jeans"]))).toEqual([
      { valor: "jeans", texto: "Jeans", grupo: "Ya le compras" },
      { valor: "blusas", texto: "Camisas y Blusas", grupo: "Otras" },
      { valor: "sud", texto: "Sudaderas", grupo: "Otras" },
      { valor: "nueva", texto: "Ponchos", grupo: "Otras" },
    ]);
    expect(opcionesCategoriaNueva(CATS, new Set()).map((o) => [o.valor, o.grupo])).toEqual([
      ["blusas", undefined],
      ["sud", undefined],
      ["jeans", undefined],
      ["nueva", undefined],
    ]);
  });
  it("los chips son solo lo habitual del proveedor, hasta 4; lo elegido en «Otra…» queda aparte", () => {
    const todas = [..."abcdefgh"].map((id) => ({ id, nombre: id.toUpperCase() }));
    expect(TOPE_CHIPS_NUEVA).toBe(4);
    // Con pocas habituales, todas; nada elegido, nada «fuera».
    expect(chipsDeLoHabitual(todas, ["b", "d"], null)).toEqual({ chips: [todas[1], todas[3]], fuera: "" });
    // Elegida una de los chips: sigue siendo chip, «Otra…» no la toma.
    expect(chipsDeLoHabitual(todas, ["b", "d"], "d").fuera).toBe("");
    // Elegida una de la lista completa: «Otra…» la muestra.
    expect(chipsDeLoHabitual(todas, ["b", "d"], "g").fuera).toBe("g");
    // Con más de 4 habituales, solo 4 chips; la quinta, si se elige, también es «fuera» (se ve en «Otra…», no se pierde).
    const seis = chipsDeLoHabitual(todas, ["a", "b", "c", "d", "e", "f"], "e");
    expect(seis.chips.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(seis.fuera).toBe("e");
    // Un habitual que ya no está en la lista (una categoría borrada) no rompe nada.
    expect(chipsDeLoHabitual(todas, ["zz", "a"], null).chips).toEqual([todas[0]]);
    // Proveedor nuevo, sin historial: ningún chip.
    expect(chipsDeLoHabitual(todas, [], "c")).toEqual({ chips: [], fuera: "c" });
  });
  it("«¿Está bien así?»: una prenda repartida entre dos tiendas es UNA fila, con cuántas va a cada una", () => {
    const base = { productoId: null, categoriaId: "c", marcaId: null, categoria: "Blusas", marca: null, venta: 60 };
    const lineas = [
      { ...base, clave: "a", nombre: "Blusa Aurora", cantidad: 2, costo: 14, destinoId: "tru" },
      { ...base, clave: "b", nombre: "Polo Tito", cantidad: 1, costo: 10, destinoId: "lim" },
      { ...base, clave: "a", nombre: "Blusa Aurora", cantidad: 1, costo: 14, destinoId: "lim" },
    ];
    const prendas = prendasDeLaCompra(lineas);
    expect(prendas.map((p) => [p.clave, p.indice, p.cantidad, p.total, p.tiendas])).toEqual([
      ["a", 0, 3, 42, [{ destinoId: "tru", cantidad: 2 }, { destinoId: "lim", cantidad: 1 }]],
      ["b", 1, 1, 10, [{ destinoId: "lim", cantidad: 1 }]],
    ]);
    expect(prendasDeLaCompra([])).toEqual([]);
    // Lo mismo, por tienda y en el orden en que se anotaron.
    expect(totalesPorTienda(lineas)).toEqual([
      { destinoId: "tru", prendas: 2, total: 28 },
      { destinoId: "lim", prendas: 2, total: 24 },
    ]);
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
  it("«Algo nuevo» ofrece lo que ya anotaste en esta compra: categorías y marcas, la última anotada primero, sin repetir", () => {
    const anotadas = [
      L({ categoriaId: "polos", marcaId: "m1", marca: "CAYLA" }),
      L({ categoriaId: "casacas", marcaId: "nueva:moda sol", marca: "Moda Sol" }),
      L({ categoriaId: "polos", marcaId: "m1", marca: "CAYLA" }),
      L({ categoriaId: "faldas", marcaId: null, marca: null }),
    ];
    expect(categoriasDeLasLineas(anotadas)).toEqual(["faldas", "polos", "casacas"]);
    expect(marcasDeLasLineas(anotadas)).toEqual([
      { id: "m1", nombre: "CAYLA" },
      { id: "nueva:moda sol", nombre: "Moda Sol" },
    ]);
    expect(categoriasDeLasLineas([])).toEqual([]);
    expect(marcasDeLasLineas([])).toEqual([]);
  });

  it("las marcas habituales de «Algo nuevo»: primero las de esta compra, después las del proveedor, sin repetir", () => {
    const compra = [{ id: "m1", nombre: "CAYLA" }, { id: "nueva:moda sol", nombre: "Moda Sol" }];
    const proveedor = [{ id: "m2", nombre: "Mias" }, { id: "m1", nombre: "CAYLA" }];
    expect(marcasParaNueva(compra, proveedor)).toEqual([
      { id: "m1", nombre: "CAYLA" },
      { id: "nueva:moda sol", nombre: "Moda Sol" },
      { id: "m2", nombre: "Mias" },
    ]);
    expect(marcasParaNueva([], proveedor)).toEqual(proveedor);
    expect(marcasParaNueva(compra, [])).toEqual(compra);
    // Un proveedor recién creado con UNA sola marca anotada: llega ya puesta, como la que trae un proveedor de una sola marca.
    expect(nuevoVacio(marcasParaNueva([{ id: "nueva:moda sol", nombre: "Moda Sol" }], [])).marcaId).toBe("nueva:moda sol");
  });

  it("la marca escrita con «+» en una prenda anterior se puede volver a elegir, y no se duplica si ya está en la lista", () => {
    const base = [{ id: "m1", nombre: "CAYLA" }];
    const compra = [{ id: "m1", nombre: "CAYLA" }, { id: "nueva:moda sol", nombre: "Moda Sol" }];
    expect(marcasConProvisionales(base, compra)).toEqual([...base, { id: "nueva:moda sol", nombre: "Moda Sol" }]);
    expect(marcasConProvisionales(base, [])).toEqual(base);
    // Al armar la prenda con esa marca provisional se encuentra (antes, «Moda Sol» elegida otra vez no armaba la prenda).
    const categorias = [{ id: "polos", nombre: "Polos", prefijo: "POL", familia: null }];
    const n = { categoriaId: "polos", marcaId: "nueva:moda sol", marcaNueva: null, nombre: "Polo Venus", descartadas: new Set<string>() };
    expect(habitualDeNuevo("nuevo:1", n, categorias, marcasConProvisionales(base, compra))?.marcaId).toBe("nueva:moda sol");
    expect(habitualDeNuevo("nuevo:1", n, categorias, base)).toBeNull();
  });
  it("la marca: primero las que trae el proveedor; si trae una sola, la hoja llega con ella puesta", () => {
    const marcas = [
      { id: "1", nombre: "Ángelys" },
      { id: "2", nombre: "CAYLA" },
      { id: "3", nombre: "Mias" },
    ];
    expect(opcionesMarcaNueva(marcas, [{ id: "3" }]).map((o) => `${o.grupo}:${o.texto}`)).toEqual([
      "Las que trae:Mias",
      "Otras marcas:Ángelys",
      "Otras marcas:CAYLA",
    ]);
    expect(opcionesMarcaNueva(marcas, []).map((o) => o.grupo)).toEqual([undefined, undefined, undefined]);
    expect(nuevoVacio([{ id: "3" }]).marcaId).toBe("3");
    expect(nuevoVacio([{ id: "1" }, { id: "3" }]).marcaId).toBeNull();
  });
  it("la hoja de una prenda nueva pide qué es, la marca y el nombre antes que lo de siempre; un parecido sin contestar frena el nombre", () => {
    const b = { cantidad: "", costo: "", venta: "", destinos: [], reparto: {} };
    const vacio = camposPrendaNueva(nuevoVacio([]), false, b);
    expect(vacio.map((c) => c.id)).toEqual(["categoria", "marca", "nombre", "cantidad", "costo", "venta", "tienda"]);
    expect(vacio.slice(0, 3).every((c) => !c.hecho && c.requerido)).toBe(true);
    const n = { categoriaId: "jeans", marcaId: "m1", marcaNueva: null, nombre: "Jean mom", descartadas: new Set<string>() };
    expect(camposPrendaNueva(n, false, b).slice(0, 3).every((c) => c.hecho)).toBe(true);
    const conParecido = camposPrendaNueva(n, true, b)[2];
    expect(conParecido).toMatchObject({ hecho: false, pendiente: "Dinos si es la misma prenda." });
  });
  it("la prenda nueva es solo una referencia: un habitual sin producto del catálogo y sin precios de antes", () => {
    const marcas = [{ id: "m1", nombre: "CAYLA" }];
    const n = { categoriaId: "blusas", marcaId: "m1", marcaNueva: null, nombre: "  Casaca   corta ", descartadas: new Set<string>() };
    const h = habitualDeNuevo("nuevo:1", n, CATS, marcas);
    expect(h).toMatchObject({ clave: "nuevo:1", productoId: null, nombre: "Casaca corta", categoriaId: "blusas", marcaId: "m1", veces: 0, costo: null, venta: null });
    expect(piezasDeFila(h!, [])).toEqual([]);
    // Sin qué es, sin marca o sin nombre no se arma.
    expect(habitualDeNuevo("x", { ...n, categoriaId: null }, CATS, marcas)).toBeNull();
    expect(habitualDeNuevo("x", { ...n, marcaId: "otra" }, CATS, marcas)).toBeNull();
    expect(habitualDeNuevo("x", { ...n, nombre: "ab" }, CATS, marcas)).toBeNull();
  });
});

describe("la marca nueva de «Algo nuevo»", () => {
  const marcas = [{ id: "m1", nombre: "Pionier" }];
  it("lo escrito que ya está en la lista usa esa marca; lo que no, una provisional que se crea al guardar", () => {
    expect(marcaEscrita("  píonier ", marcas)).toEqual({ id: "m1", nombre: "Pionier" });
    expect(marcaEscrita("Andina  Jeans", marcas)).toEqual({ id: `${MARCA_NUEVA_PREFIJO}andina jeans`, nombre: "Andina Jeans" });
    expect(marcaEscrita("a", marcas)).toBeUndefined();
    expect(marcaEscrita("x".repeat(MARCA_NUEVA_MAX + 1), marcas)).toBeUndefined();
  });
  it("la guía pide escribirla mientras la caja está abierta, y la prenda se arma con ella", () => {
    const b = { cantidad: "", costo: "", venta: "", destinos: [], reparto: {} };
    const n = { categoriaId: "blusas", marcaId: null, marcaNueva: "", nombre: "Casaca corta", descartadas: new Set<string>() };
    expect(camposPrendaNueva(n, false, b)[1]).toMatchObject({ hecho: false, pendiente: "Escribe la marca, como dice su etiqueta." });
    const lista = { ...n, marcaNueva: "Andina" };
    expect(camposPrendaNueva(lista, false, b)[1].hecho).toBe(true);
    expect(habitualDeNuevo("nuevo:1", lista, [{ id: "blusas", nombre: "Camisas y Blusas", prefijo: "CMS", familia: "indumentaria" }], marcas)).toMatchObject({ marcaId: `${MARCA_NUEVA_PREFIJO}andina`, marca: "Andina" });
  });
  it("antes de guardar: una marca por nombre aunque vaya en varias líneas, y después cada línea con su id de verdad", () => {
    const l = (marcaId: string | null, marca: string | null) => ({ marcaId, marca });
    const lineas = [l("nueva:andina", "Andina"), l("nueva:andina", "Andina"), l("m1", "Pionier"), l("nueva:zeta", "Zeta")];
    expect(marcasPorCrear(lineas)).toEqual([
      { id: "nueva:andina", nombre: "Andina" },
      { id: "nueva:zeta", nombre: "Zeta" },
    ]);
    const creadas = new Map([["nueva:andina", "u1"], ["nueva:zeta", "u2"]]);
    expect(conMarcasCreadas(lineas, creadas).map((x) => x.marcaId)).toEqual(["u1", "u1", "m1", "u2"]);
  });
});

describe("los proveedores, de 10 en 10", () => {
  it("dibuja la tanda pedida sin pasarse y dice cuántos quedan", () => {
    const lista = Array.from({ length: 23 }, (_, i) => i);
    expect(PROVEEDORES_POR_TANDA).toBe(10);
    expect(tandaDeLista(lista, 10)).toEqual({ visibles: lista.slice(0, 10), quedan: 13 });
    expect(tandaDeLista(lista, 30)).toEqual({ visibles: lista, quedan: 0 });
    expect(tandaDeLista([], 10)).toEqual({ visibles: [], quedan: 0 });
    expect(tandaDeLista(lista, -1).visibles).toEqual([]);
  });
});

describe("el proveedor, como la maqueta (compras-formidable-2026-10)", () => {
  const P = (id: string, compras: number, ultima: string | null) => ({ id, nombre: id, ruc: null, categorias: [], compras, ultima, marcas: [] });
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
  const lleno = { cantidad: "12", costo: "17.50", venta: "39.90", destinos: ["lim"], reparto: {} as Record<string, string> };
  it("falta lo mismo que antes frenaba cada paso, y la tienda", () => {
    const falta = (b: Parameters<typeof camposPrenda>[0]) => camposPrenda(b).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(falta({ cantidad: "", costo: "", venta: "", destinos: [], reparto: {} })).toEqual(["cantidad", "costo", "venta", "tienda"]);
    expect(falta({ ...lleno, cantidad: "0" })).toEqual(["cantidad"]);
    expect(falta({ ...lleno, costo: "17.555" })).toEqual(["costo"]);
    expect(falta({ ...lleno, destinos: [] })).toEqual(["tienda"]);
    expect(falta(lleno)).toEqual([]);
  });
  it("la guía coincide con la línea: sin faltas hay línea; con una falta, no", () => {
    expect(lineasDeBorrador(H, lleno)).toEqual([expect.objectContaining({ cantidad: 12, costo: 17.5, venta: 39.9, destinoId: "lim", clave: "p1" })]);
    const repartido = { ...lleno, destinos: ["lim", "aqp"], reparto: { lim: "7", aqp: "5" } };
    for (const roto of [{ cantidad: "" }, { costo: "x" }, { venta: "" }, { destinos: [] }, { reparto: { lim: "7", aqp: "4" } }]) {
      const b = { ...repartido, ...roto };
      expect(lineasDeBorrador(H, b).length === 0).toBe(camposPrenda(b).some((c) => c.requerido && !c.hecho));
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
    const r = resumenCarrito([{ clave: "a", cantidad: 12, costo: 17.5 }, { clave: "b", cantidad: 20, costo: 9 }]);
    expect([plano(r.titulo), r.detalle]).toEqual(["32 prendas · S/ 390.00", "2 modelos"]);
    expect(resumenCarrito([{ clave: "a", cantidad: 1, costo: 5 }]).detalle).toBe("1 modelo");
    // Un mismo modelo repartido entre dos tiendas (dos líneas, una clave) sigue siendo 1 modelo.
    expect(resumenCarrito([{ clave: "a", cantidad: 2, costo: 14 }, { clave: "a", cantidad: 1, costo: 14 }]).detalle).toBe("1 modelo");
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

describe("pagar ahora o después (20261023181000)", () => {
  const PERSONA = { esPersona: true, listo: true, motivo: null };
  const faltan = (pago: Parameters<typeof camposPapel>[0]["pago"], monto = "300") =>
    camposPapel({ tipo: "sin_comprobante", conFoto: false, monto, pago }, PERSONA).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
  it("de fábrica se paga ahora y por Yape; falta cuánto hasta que la pantalla lo llena con el papel", () => {
    expect(PAGO_DE_FABRICA).toEqual({ forma: "ahora", pagado: "", medio: "yape" });
    expect(faltan(PAGO_DE_FABRICA)).toEqual(["pagado"]);
    expect(faltan({ forma: "ahora", pagado: "300", medio: "yape" })).toEqual([]);
  });
  it("lo pagado va de más de cero a lo del papel; y hace falta el método", () => {
    expect(problemaPagado("0", "300")).toBe("Escribe cuánto pagas ahora.");
    expect(problemaPagado("301", "300")).toBe("No puede ser más que lo que dice el papel.");
    expect(problemaPagado("10.555", "300")).toBe("Escribe cuánto pagas ahora.");
    expect(problemaPagado("100", "300")).toBeNull();
    expect(faltan({ forma: "ahora", pagado: "100", medio: null })).toEqual(["medio"]);
  });
  it("pagando después no se pregunta cuánto ni con qué, y a la base va cero sin método", () => {
    expect(faltan({ forma: "despues", pagado: "", medio: null })).toEqual([]);
    expect(pagoParaBase({ forma: "despues", pagado: "300", medio: "yape" })).toEqual({ p_pagado: 0, p_medio: null });
    expect(pagoParaBase({ forma: "ahora", pagado: "100.50", medio: "efectivo" })).toEqual({ p_pagado: 100.5, p_medio: "efectivo" });
  });
  it("lo que falta lo paga Compras", () => {
    expect(textoLoQueFalta(300, 300)).toBeNull();
    expect(plano(textoLoQueFalta(300, 100))).toBe("Compras le paga al proveedor lo que falta: S/ 200.00.");
    expect(plano(textoLoQueFalta(300, 0))).toBe("Compras le paga al proveedor los S/ 300.00.");
  });
});

describe("repartir una prenda entre varias tiendas (Felipe 2026-10-23)", () => {
  const H = { clave: "p1", productoId: "p1", categoriaId: "c", marcaId: null, nombre: "Blusa Emma", categoria: "Blusas", marca: null };
  const base = { cantidad: "10", costo: "20", venta: "59.90", destinos: ["lim"], reparto: {} as Record<string, string> };
  it("el reparto llega parejo: lo que sobra va a las primeras", () => {
    expect(repartoParejo(10, ["a", "b", "c"])).toEqual({ a: "4", b: "3", c: "3" });
    expect(repartoParejo(2, ["a", "b", "c"])).toEqual({ a: "1", b: "1", c: "0" });
    expect(repartoParejo(null, ["a", "b"])).toEqual({});
  });
  it("prender una segunda tienda reparte parejo; apagarla vuelve a una", () => {
    const dos = { ...base, ...alternarDestino(base, "aqp") };
    expect(dos).toMatchObject({ destinos: ["lim", "aqp"], reparto: { lim: "5", aqp: "5" } });
    expect(alternarDestino(dos, "aqp").destinos).toEqual(["lim"]);
  });
  it("cambiar cuántas rehace el reparto, salvo que se haya tocado a mano", () => {
    const dos = { ...base, destinos: ["lim", "aqp"], reparto: { lim: "5", aqp: "5" } };
    expect(conCantidad(dos, "12").reparto).toEqual({ lim: "6", aqp: "6" });
    expect(conCantidad({ ...dos, repartoPropio: true, reparto: { lim: "8", aqp: "2" } }, "12").reparto).toEqual({ lim: "8", aqp: "2" });
  });
  it("el reparto tiene que sumar lo comprado, y cada tienda llevar al menos 1", () => {
    const dos = { ...base, destinos: ["lim", "aqp"] };
    expect(problemaReparto({ ...dos, reparto: { lim: "6", aqp: "4" } })).toBeNull();
    expect(problemaReparto({ ...dos, reparto: { lim: "6", aqp: "2" } })).toBe("Reparte las 10: faltan 2.");
    expect(problemaReparto({ ...dos, reparto: { lim: "9", aqp: "3" } })).toBe("Reparte las 10: sobran 2.");
    expect(problemaReparto({ ...dos, reparto: { lim: "10", aqp: "0" } })).toBe("Cada tienda lleva al menos 1: si no va a una, apágala.");
    expect(problemaReparto(base)).toBeNull();
  });
  it("una línea por tienda, y se vuelven a juntar para corregir", () => {
    const lineas = lineasDeBorrador(H, { ...base, destinos: ["lim", "aqp"], reparto: { lim: "6", aqp: "4" } });
    expect(lineas.map((l) => [l.destinoId, l.cantidad, l.costo])).toEqual([
      ["lim", 6, 20],
      ["aqp", 4, 20],
    ]);
    expect(borradorDeLineas(lineas)).toMatchObject({ cantidad: "10", costo: "20.00", destinos: ["lim", "aqp"], reparto: { lim: "6", aqp: "4" }, repartoPropio: true });
    const nombres = new Map([["lim", "Tienda Lima"], ["aqp", "Tienda AQP"]]);
    expect(plano(textoPrendaEnCompra(lineas, nombres))).toBe("10 × S/ 20.00 · Lima 6, AQP 4");
    expect(plano(textoPrendaEnCompra(lineas.slice(0, 1), nombres))).toBe("6 × S/ 20.00 · Lima");
    expect(nombreCortoTienda("Tienda Arequipa")).toBe("Arequipa");
    expect(nombreCortoTienda("Taller")).toBe("Taller");
  });
});
