import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadosDe, sePuedeConfirmar, siguienteDe } from "./guia-campos";
import { RUTA_ANALISIS } from "./analisis-acciones";
import { VISTAS_ANALISIS } from "./analisis-tipos";
import { camposDeLaOrden, problemaDeLinea, TOPES, type ContextoValidacion } from "./orden-compra-alta";
import {
  armarOrdenDeAnalisis,
  DESDE_ANALISIS,
  HREF_VOLVER_A_ANALISIS,
  leerModelosParaOrden,
  leerPedidoDeLaUrl,
  lineaPorRevisar,
  RUTA_NUEVA_ORDEN,
  revisaLaLinea,
  urlOrdenNueva,
  volverDeNuevaOrden,
  type ModeloParaOrden,
} from "./orden-compra-desde-analisis";

// Datos inventados para la prueba (no son de producción). Los ids tienen forma de id, como los de la base.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PROV = uuid(1);
const PROV_B = uuid(2);
const TRU = uuid(10);
const AQP = uuid(11);
const CAT = uuid(20);
const CAT_VIEJA = uuid(21);
const MARCA = uuid(30);
const MARCA_B = uuid(31);
const MARCA_VIEJA = uuid(32);

const DATOS = {
  proveedores: [
    { id: PROV, nombre: "Textil Andino", ruc: null },
    { id: PROV_B, nombre: "Confecciones Sur", ruc: null },
  ],
  marcas: [
    { id: MARCA, nombre: "Marca Uno" },
    { id: MARCA_B, nombre: "Marca Dos" },
  ],
  vinculos: [
    { marcaId: MARCA, proveedorId: PROV },
    { marcaId: MARCA_B, proveedorId: PROV },
    { marcaId: MARCA_B, proveedorId: PROV_B },
  ],
  categorias: [{ id: CAT, nombre: "Blusas", prefijo: "BLU", familia: null }],
  destinos: [
    { id: TRU, nombre: "Tienda TRU" },
    { id: AQP, nombre: "Tienda AQP" },
  ],
};

const modelo = (n: number, parcial: Partial<ModeloParaOrden> = {}): ModeloParaOrden => ({ id: uuid(100 + n), referencia: `Blusa Ensayo ${n}`, categoriaId: CAT, marcaId: MARCA, ...parcial });
const ids = (...ns: number[]) => ns.map((n) => uuid(100 + n));

/** Lo que Next le entrega a la página: los parámetros de la URL que armó Análisis. */
function paramsDe(href: string): Record<string, string | string[] | undefined> {
  return Object.fromEntries(new URL(href, "http://x").searchParams.entries());
}

describe("urlOrdenNueva: el enlace de «Comprar» y «Pedir a X»", () => {
  it("lleva el proveedor, la tienda y los modelos, y de dónde vino; nunca cantidades", () => {
    const href = urlOrdenNueva({ proveedorId: PROV, destinoId: TRU, productoIds: ids(1, 2) })!;
    expect(href).toBe(`${RUTA_NUEVA_ORDEN}?prov=${PROV}&destino=${TRU}&modelos=${ids(1, 2).join(",")}&desde=${DESDE_ANALISIS}`);
    expect(href).not.toMatch(/cantidad|precio|unidades/);
  });
  it("sin proveedor o sin tienda, esa parte no va", () => {
    expect(urlOrdenNueva({ proveedorId: null, destinoId: TRU, productoIds: ids(1) })).not.toContain("prov=");
    expect(urlOrdenNueva({ destinoId: null, productoIds: ids(1) })).not.toContain("destino=");
  });
  it("un modelo repetido va una vez; sin modelos, o con más de los que caben en una orden, no hay enlace", () => {
    expect(urlOrdenNueva({ productoIds: [uuid(1), uuid(1), uuid(2)] })).toContain(`modelos=${uuid(1)},${uuid(2)}&`);
    expect(urlOrdenNueva({ productoIds: [] })).toBeNull();
    const cien = Array.from({ length: TOPES.lineas }, (_, i) => uuid(1000 + i));
    expect(urlOrdenNueva({ productoIds: cien })).not.toBeNull();
    expect(urlOrdenNueva({ productoIds: [...cien, uuid(9999)] })).toBeNull();
  });
  it("codifica lo que no es seguro en una URL", () => {
    expect(urlOrdenNueva({ proveedorId: "a&b=c", productoIds: ["x y"] })).toBe(`${RUTA_NUEVA_ORDEN}?prov=a%26b%3Dc&modelos=x%20y&desde=analisis`);
  });
  it("las pantallas a las que lleva y a las que vuelve existen (un enlace que cae en un 404 no ayuda a nadie)", () => {
    expect(existsSync(new URL("../app/(app)/compras/ordenes/nueva/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../app/(app)/gestion/analisis/page.tsx", import.meta.url))).toBe(true);
    // «Volver» regresa a la pestaña de donde salió «Comprar»; si Análisis renombrara sus pestañas, esto avisa.
    expect(HREF_VOLVER_A_ANALISIS).toBe(`${RUTA_ANALISIS}?vista=acaba`);
    expect(VISTAS_ANALISIS).toContain("acaba");
  });
});

describe("leerPedidoDeLaUrl: lo que viene de afuera se limpia, no se cree", () => {
  it("lee de vuelta lo que armó Análisis", () => {
    const href = urlOrdenNueva({ proveedorId: PROV, destinoId: TRU, productoIds: ids(1, 2, 3) })!;
    expect(leerPedidoDeLaUrl(paramsDe(href))).toEqual({ proveedorId: PROV, destinoId: TRU, productoIds: ids(1, 2, 3), deMas: 0, desdeAnalisis: true });
  });
  it("una URL sin nada no trae nada (la pantalla de siempre)", () => {
    expect(leerPedidoDeLaUrl({})).toEqual({ proveedorId: null, destinoId: null, productoIds: [], deMas: 0, desdeAnalisis: false });
  });
  it("un id que no tiene forma de id se ignora: texto suelto, SQL, rutas, vacíos", () => {
    const p = leerPedidoDeLaUrl({ prov: "'; drop table proveedores;--", destino: "../../etc/passwd", modelos: `x,${uuid(1)}, ,<script>,${uuid(2).slice(1)},,`, desde: "otra-cosa" });
    expect(p.proveedorId).toBeNull();
    expect(p.destinoId).toBeNull();
    expect(p.productoIds).toEqual([uuid(1)]);
    expect(p.desdeAnalisis).toBe(false);
  });
  it("los ids repetidos cuentan una vez, en el orden en que llegaron, y las mayúsculas se igualan", () => {
    const p = leerPedidoDeLaUrl({ modelos: [uuid(2).toUpperCase(), uuid(1), uuid(2), uuid(1)].join(",") });
    expect(p.productoIds).toEqual([uuid(2), uuid(1)]);
  });
  it("un parámetro repetido (?prov=a&prov=b) cuenta solo con el primero", () => {
    const p = leerPedidoDeLaUrl({ prov: [PROV, PROV_B], destino: [TRU, AQP], modelos: [uuid(1), uuid(2)], desde: ["analisis", "otra"] });
    expect(p).toMatchObject({ proveedorId: PROV, destinoId: TRU, productoIds: [uuid(1)], desdeAnalisis: true });
  });
  it("una lista enorme se recorta a lo que cabe en una orden y dice cuántas sobraron", () => {
    const muchos = Array.from({ length: 500 }, (_, i) => uuid(i + 1));
    const p = leerPedidoDeLaUrl({ modelos: muchos.join(",") });
    // Solo se lee lo que cabe en 100 ids (el resto del texto ni se recorre): ninguna orden pasa de su tope.
    expect(p.productoIds).toHaveLength(TOPES.lineas);
    expect(p.productoIds[0]).toBe(uuid(1));
    expect(p.deMas).toBeGreaterThan(0);
    // 101 ids exactos: uno de más, dicho.
    const justo = leerPedidoDeLaUrl({ modelos: Array.from({ length: TOPES.lineas + 1 }, (_, i) => uuid(i + 1)).join(",") });
    expect(justo.productoIds).toHaveLength(TOPES.lineas);
    expect(justo.deMas).toBe(1);
  });
  it("un texto de un millón de letras no se recorre entero ni rompe nada", () => {
    const p = leerPedidoDeLaUrl({ modelos: `${uuid(1)},${"a".repeat(1_000_000)}` });
    expect(p.productoIds).toEqual([uuid(1)]);
  });
  it("de una lista armada a mano solo se lee la porción que cabe: `deMas` es un mínimo, no la cuenta de todo lo que había", () => {
    // 3.000 ids distintos: si se recorrieran enteros, `deMas` sería 2.900. Solo se cuenta lo que cupo en la porción que se lee (unos 102 ids).
    const p = leerPedidoDeLaUrl({ modelos: Array.from({ length: 3000 }, (_, i) => uuid(i + 1)).join(",") });
    expect(p.productoIds).toHaveLength(TOPES.lineas);
    expect(p.deMas).toBeGreaterThan(0);
    expect(p.deMas).toBeLessThan(10);
  });
  it("las llaves raras de un objeto no cuentan", () => {
    const p = leerPedidoDeLaUrl(JSON.parse(`{"__proto__":"x","constructor":"y","modelos":"${uuid(1)}"}`));
    expect(p.productoIds).toEqual([uuid(1)]);
  });
});

describe("leerModelosParaOrden: lo que responde la base no se cree", () => {
  it("lee id, nombre, categoría y marca; una fila sin id o sin nombre se descarta; la categoría o la marca vacías quedan en null", () => {
    expect(
      leerModelosParaOrden([
        { id: "a", referencia: "  Blusa Aurora ", categoria_id: "c", marca_id: "m" },
        { id: "b", referencia: "Polo", categoria_id: null, marca_id: "" },
        { referencia: "sin id" },
        { id: "d", referencia: "   " },
        "texto",
        null,
      ]),
    ).toEqual([
      { id: "a", referencia: "Blusa Aurora", categoriaId: "c", marcaId: "m" },
      { id: "b", referencia: "Polo", categoriaId: null, marcaId: null },
    ]);
  });
  it("lo que no es una lista es null (no se pudo leer), no «no hay modelos»", () => {
    expect(leerModelosParaOrden(null)).toBeNull();
    expect(leerModelosParaOrden({ id: "a" })).toBeNull();
    expect(leerModelosParaOrden([])).toEqual([]);
  });
});

describe("armarOrdenDeAnalisis: el borrador que revisa quien compra", () => {
  const pedido = (parcial: Partial<Parameters<typeof armarOrdenDeAnalisis>[0]> = {}) => ({ proveedorId: PROV, destinoId: TRU, productoIds: ids(1, 2), deMas: 0, ...parcial });

  it("una línea por modelo, en el orden en que Análisis los mandó, con su categoría, su marca y su nombre; sin cantidad ni precio, y armadas", () => {
    const r = armarOrdenDeAnalisis(pedido(), DATOS, [modelo(2), modelo(1)], "");
    expect(r.orden.proveedorId).toBe(PROV);
    expect(r.orden.destino).toBe(TRU);
    expect(r.destinoDeAnalisis).toBe(true);
    expect(r.prellenadas).toBe(2);
    expect(r.sinTraer).toBeNull();
    expect(r.orden.lineas.map((l) => l.descripcion)).toEqual(["Blusa Ensayo 1", "Blusa Ensayo 2"]);
    expect(r.orden.lineas.map((l) => l.clave)).toEqual(["l1", "l2"]);
    for (const l of r.orden.lineas) {
      expect(l).toMatchObject({ categoriaId: CAT, marcaId: MARCA, cantidad: "", precio: "", descuento: "", prellenada: true });
    }
  });
  it("el proveedor o la tienda que no existen o ya no están activos se ignoran: quedan vacíos para elegirlos (la tienda cae a donde se trabaja)", () => {
    const r = armarOrdenDeAnalisis(pedido({ proveedorId: uuid(77), destinoId: uuid(78) }), DATOS, [modelo(1)], AQP);
    expect(r.orden.proveedorId).toBe("");
    expect(r.orden.destino).toBe(AQP);
    expect(r.destinoDeAnalisis).toBe(false);
    expect(armarOrdenDeAnalisis(pedido({ proveedorId: null, destinoId: null }), DATOS, [modelo(1)], "").orden).toMatchObject({ proveedorId: "", destino: "" });
  });
  it("el proveedor o la tienda que ya no están activos se DICEN, no se callan (el proveedor se pudo archivar entre que Análisis se pintó y el clic)", () => {
    const proveedor = armarOrdenDeAnalisis(pedido({ proveedorId: uuid(77), productoIds: ids(1) }), DATOS, [modelo(1)], "");
    expect(proveedor.sinTraer).toBe("El proveedor que traía Análisis ya no está activo: elige otro.");
    const tienda = armarOrdenDeAnalisis(pedido({ destinoId: uuid(78), productoIds: ids(1) }), DATOS, [modelo(1)], AQP);
    expect(tienda.sinTraer).toBe("La tienda que traía Análisis no recibe órdenes: elige a dónde llega.");
    // Y se suma a lo demás, en una sola nota: nada se pierde.
    const todo = armarOrdenDeAnalisis(pedido({ proveedorId: uuid(77), destinoId: uuid(78) }), DATOS, [modelo(1)], AQP);
    expect(todo.sinTraer).toBe(
      "El proveedor que traía Análisis ya no está activo: elige otro. La tienda que traía Análisis no recibe órdenes: elige a dónde llega. 1 prenda de Análisis ya no está en el catálogo. Agrega lo que falte con «+ Agregar otra prenda».",
    );
    // Sin proveedor ni tienda en el enlace no hay nada que decir de ellos.
    expect(armarOrdenDeAnalisis(pedido({ proveedorId: null, destinoId: null, productoIds: ids(1) }), DATOS, [modelo(1)], "").sinTraer).toBeNull();
  });
  it("una categoría o una marca que ya no están activas quedan vacías; la marca vacía toma la única del proveedor, si la tiene", () => {
    const r = armarOrdenDeAnalisis(pedido({ proveedorId: PROV_B, productoIds: ids(1, 2) }), DATOS, [modelo(1, { categoriaId: CAT_VIEJA, marcaId: MARCA_VIEJA }), modelo(2, { marcaId: null })], "");
    // PROV_B trae una sola marca (MARCA_B): las dos líneas sin marca activa la toman.
    expect(r.orden.lineas.map((l) => [l.categoriaId, l.marcaId])).toEqual([
      ["", MARCA_B],
      [CAT, MARCA_B],
    ]);
    // PROV trae dos marcas: no se adivina.
    const dos = armarOrdenDeAnalisis(pedido({ productoIds: ids(2) }), DATOS, [modelo(2, { marcaId: null })], "");
    expect(dos.orden.lineas[0]!.marcaId).toBe("");
    // Un modelo sin categoría (1 de 361 en producción) queda vacío, para elegirla.
    expect(armarOrdenDeAnalisis(pedido({ productoIds: ids(3) }), DATOS, [modelo(3, { categoriaId: null })], "").orden.lineas[0]!.categoriaId).toBe("");
  });
  it("el nombre largo cabe en la descripción de la línea", () => {
    const r = armarOrdenDeAnalisis(pedido({ productoIds: ids(1) }), DATOS, [modelo(1, { referencia: "x".repeat(500) })], "");
    expect(r.orden.lineas[0]!.descripcion).toHaveLength(TOPES.descripcion);
  });
  it("lo que no se pudo traer se dice: modelos que ya no están, modelos de más, y la lectura caída (nunca una orden a medias sin avisar)", () => {
    const faltan = armarOrdenDeAnalisis(pedido(), DATOS, [modelo(1)], "");
    expect(faltan.prellenadas).toBe(1);
    expect(faltan.sinTraer).toBe("1 prenda de Análisis ya no está en el catálogo. Agrega lo que falte con «+ Agregar otra prenda».");
    const masDeUna = armarOrdenDeAnalisis(pedido({ productoIds: ids(1, 2, 3) }), DATOS, [modelo(1)], "");
    expect(masDeUna.sinTraer).toContain("2 prendas de Análisis ya no están en el catálogo");
    const deMas = armarOrdenDeAnalisis(pedido({ productoIds: ids(1), deMas: 3 }), DATOS, [modelo(1)], "");
    expect(deMas.sinTraer).toContain("3 prendas de más: una orden lleva hasta 100 líneas");
    const caida = armarOrdenDeAnalisis(pedido(), DATOS, null, "");
    expect(caida.sinTraer).toBe("No se pudieron traer las prendas de Análisis. Agrégalas a mano con «+ Agregar otra prenda».");
    // Sin ninguna línea, la orden se abre con una vacía (como siempre) y sin marcar nada como armado.
    expect(caida.orden.lineas).toHaveLength(1);
    expect(caida.orden.lineas[0]).not.toHaveProperty("prellenada");
    expect(caida.prellenadas).toBe(0);
  });
  it("los ids de otro caso no se cuelan: un modelo que la base devolvió y no se pidió no entra", () => {
    const r = armarOrdenDeAnalisis(pedido({ productoIds: ids(1) }), DATOS, [modelo(1), modelo(9)], "");
    expect(r.orden.lineas.map((l) => l.descripcion)).toEqual(["Blusa Ensayo 1"]);
  });
  it("no guarda ni valida nada por su cuenta: lo armado sigue necesitando cantidad y precio para poder guardarse", () => {
    const r = armarOrdenDeAnalisis(pedido(), DATOS, [modelo(1)], "");
    const ctx: ContextoValidacion = {
      hoy: "2026-10-16",
      proveedoresActivos: new Set(DATOS.proveedores.map((p) => p.id)),
      categoriasActivas: new Set(DATOS.categorias.map((c) => c.id)),
      marcasActivas: new Set(DATOS.marcas.map((m) => m.id)),
      destinos: new Set(DATOS.destinos.map((d) => d.id)),
    };
    expect(problemaDeLinea(r.orden.lineas[0]!, ctx)).toBe("Escribe la cantidad.");
  });
});

describe("la guía de foco de una orden que llegó armada (ADR-0284, regla 4)", () => {
  const ctx: ContextoValidacion = {
    hoy: "2026-10-16",
    proveedoresActivos: new Set(DATOS.proveedores.map((p) => p.id)),
    categoriasActivas: new Set(DATOS.categorias.map((c) => c.id)),
    marcasActivas: new Set(DATOS.marcas.map((m) => m.id)),
    destinos: new Set(DATOS.destinos.map((d) => d.id)),
    destinoElegido: true,
    lineasPrimero: true,
  };
  const SIN_COMBO = { pide: false, listo: true, motivo: null };
  const armada = () => armarOrdenDeAnalisis({ proveedorId: PROV, destinoId: TRU, productoIds: ids(1, 2), deMas: 0 }, DATOS, [modelo(1), modelo(2)], "").orden;

  it("las líneas armadas NO llevan ✓: la luz va a la primera cantidad, con lo que hay que revisar, y la entrega estimada (solo sugerida) espera detrás", () => {
    const campos = camposDeLaOrden(armada(), ctx, SIN_COMBO);
    expect(campos.map((c) => c.id)).toEqual(["proveedor", "destino", "linea-l1", "linea-l2", "entrega", "nota"]);
    const ahora = siguienteDe(campos)!;
    expect(ahora.id).toBe("linea-l1");
    expect(ahora.pendiente).toBe("Vino de Análisis: revisa la categoría y la marca, y escribe la cantidad.");
    const estados = estadosDe(campos);
    expect(estados).toMatchObject({ proveedor: "hecho", destino: "hecho", "linea-l1": "ahora", "linea-l2": "falta" });
    expect(Object.values(estados).filter((e) => e === "hecho")).toHaveLength(2); // solo el proveedor y la tienda; ninguna línea
    // Y no se puede guardar así: faltan las cantidades y los precios.
    expect(sePuedeConfirmar(campos)).toBe(false);
  });
  it("sin Análisis (orden nueva de siempre), el orden de la guía no cambia: proveedor, tienda, entrega, líneas", () => {
    const o = armada();
    const sin = camposDeLaOrden({ ...o, lineas: o.lineas.map((l) => ({ ...l, prellenada: undefined })) }, { ...ctx, lineasPrimero: undefined }, SIN_COMBO);
    expect(sin.map((c) => c.id)).toEqual(["proveedor", "destino", "entrega", "linea-l1", "linea-l2", "nota"]);
    // Y la línea dice el pendiente de siempre.
    expect(sin.find((c) => c.id === "linea-l1")!.pendiente).toBe("Escribe la cantidad.");
  });
  it("tocar la línea la saca de «Por revisar»: vuelve a decir lo de siempre; si lo armado no sirve, manda el problema de siempre", () => {
    const o = armada();
    const tocada = camposDeLaOrden({ ...o, lineas: [{ ...o.lineas[0]!, prellenada: false }, o.lineas[1]!] }, ctx, SIN_COMBO);
    expect(tocada.find((c) => c.id === "linea-l1")!.pendiente).toBe("Escribe la cantidad.");
    expect(tocada.find((c) => c.id === "linea-l2")!.pendiente).toContain("Vino de Análisis");
    const sinCategoria = camposDeLaOrden({ ...o, lineas: [{ ...o.lineas[0]!, categoriaId: "" }] }, ctx, SIN_COMBO);
    expect(sinCategoria.find((c) => c.id === "linea-l1")!.pendiente).toBe("Elige la categoría.");
  });
  it("«Por revisar» se apaga al revisar lo armado (categoría, marca o descripción) o al completar la línea; escribir solo la cantidad o el precio NO la revisa", () => {
    // Qué cambios cuentan como revisar.
    expect(revisaLaLinea({ categoriaId: CAT })).toBe(true);
    expect(revisaLaLinea({ marcaId: MARCA })).toBe(true);
    expect(revisaLaLinea({ descripcion: "Otra" })).toBe(true);
    expect(revisaLaLinea({ cantidad: "12" })).toBe(false);
    expect(revisaLaLinea({ precio: "25.50" })).toBe(false);
    expect(revisaLaLinea({ descuento: "5", modoDescuento: "pct" })).toBe(false);
    // Cuándo se dibuja: llegó armada y aún no está completa. Una línea común nunca.
    expect(lineaPorRevisar({ prellenada: true }, false)).toBe(true);
    expect(lineaPorRevisar({ prellenada: true }, true)).toBe(false);
    expect(lineaPorRevisar({ prellenada: false }, false)).toBe(false);
    expect(lineaPorRevisar({}, false)).toBe(false);
  });
  it("completa (cantidad y precio escritos) la línea ya cuenta como hecha: lo armado no bloquea nada que la base no bloquee", () => {
    const o = armada();
    const llena = o.lineas.map((l) => ({ ...l, cantidad: "12", precio: "25.50", prellenada: false }));
    const campos = camposDeLaOrden({ ...o, lineas: llena }, ctx, SIN_COMBO);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(estadosDe(campos)["linea-l1"]).not.toBe("falta");
  });
});

describe("volverDeNuevaOrden: «Volver» regresa a Análisis solo si vino de ahí y quien mira lo ve", () => {
  it("de Análisis y con el módulo, a Análisis; en cualquier otro caso, a la lista de órdenes", () => {
    expect(volverDeNuevaOrden(true, true)).toEqual({ href: HREF_VOLVER_A_ANALISIS, a: "Análisis" });
    expect(volverDeNuevaOrden(true, false)).toEqual({ href: "/compras/ordenes", a: "Órdenes de compra" });
    expect(volverDeNuevaOrden(false, true)).toEqual({ href: "/compras/ordenes", a: "Órdenes de compra" });
  });
  it("la URL no decide un destino libre: un `desde` raro no es «desde Análisis»", () => {
    expect(leerPedidoDeLaUrl({ desde: "https://malo.example" }).desdeAnalisis).toBe(false);
    expect(volverDeNuevaOrden(leerPedidoDeLaUrl({ desde: "https://malo.example" }).desdeAnalisis, true).href).toBe("/compras/ordenes");
  });
});

// El cableado entre las dos pantallas. Las pruebas de arriba cubren la lógica pura; esto vigila que las piezas sigan conectadas (las props de la orden son
// opcionales: quitar una compila y deja todo en verde, y «Comprar» volvería a una orden vacía o «Volver» a la lista sin que nada avisara). Mismo estilo que
// `ordenes-compra-doble-clic.test.ts`: lee el código fuente. Un cambio legítimo de nombres se actualiza aquí, junto con ADR-0357 (A9).
describe("el cableado de Análisis a Nueva orden de compra", () => {
  const leer = (archivo: string) => readFileSync(join(__dirname, "..", archivo), "utf8");
  const sinEspacios = (t: string) => t.replace(/\s+/g, " ");

  it("la página lee la URL, trae los modelos de la base, arma el borrador y se lo pasa al formulario con su «Volver»", () => {
    const f = sinEspacios(leer("app/(app)/compras/ordenes/nueva/page.tsx"));
    expect(f).toContain("const params = await searchParams;");
    expect(f).toContain("const pedido = leerPedidoDeLaUrl(params);");
    expect(f).toContain("getModelosParaOrden(pedido.productoIds)");
    expect(f).toContain("armarOrdenDeAnalisis(pedido, datos, modelos, destinoInicial)");
    expect(f).toContain("deAnalisis={deAnalisis ?? undefined}");
    expect(f).toContain('volver={volverDeNuevaOrden(pedido.desdeAnalisis, veModulo(persona, "analisis"))}');
  });

  it("el formulario usa el borrador, la tienda de Análisis cuenta como elegida, la guía pone las líneas primero y «Volver» y «Cancelar» toman el destino", () => {
    const f = sinEspacios(leer("components/ordenes-compra/NuevaOrdenCompra.tsx"));
    expect(f).toContain("editar?.inicial ?? deAnalisis?.orden ??");
    expect(f).toContain("Boolean(deAnalisis?.destinoDeAnalisis)");
    expect(f).toContain("lineasPrimero: Boolean(deAnalisis)");
    expect(f).toContain("<Volver href={volver.href} a={volver.a} />");
    expect(f).toContain("<BotonEnlace href={volver.href}>Cancelar</BotonEnlace>");
    // La línea armada dice «Por revisar» (hasta que se revisa o se completa), y el cursor de la guía no cae en la descripción que ya viene escrita.
    expect(f).toContain("lineaPorRevisar(l,");
    expect(f).toContain("revisaLaLinea(cambios)");
    expect(f).toContain('data-sin-cursor={l.prellenada ? "" : undefined}');
    expect(f).toContain("Estas prendas las trajo Análisis");
  });

  it("Análisis decide el botón por el módulo Órdenes de compra, no por el dinero de Compras", () => {
    const f = sinEspacios(leer("app/(app)/gestion/analisis/page.tsx"));
    expect(f).toContain('ordenes: veModulo(persona, "ordenes_compra")');
  });

  it("Análisis arma los enlaces con la tienda que se analiza, y «Pedir a X» y «Comprar» salen del mismo contrato", () => {
    const acciones = sinEspacios(leer("lib/analisis-acciones.ts"));
    expect(acciones).toContain('import { urlOrdenNueva } from "./orden-compra-desde-analisis";');
    expect(acciones).toContain("destinoId: donde.destinoId");
    expect(sinEspacios(leer("components/analisis/PestanaAcaba.tsx"))).toContain("dondeComprarDe(datos)");
    expect(sinEspacios(leer("components/analisis/AQuienPedir.tsx"))).toContain("hrefPedirAProveedor(");
  });
});
