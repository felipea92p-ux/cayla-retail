import { describe, expect, it } from "vitest";
import {
  agruparCatalogo,
  derivarExtra,
  derivarReemplazo,
  describirSalidas,
  opcionesDeOtraPrenda,
  opcionesDePrenda,
  pagadoPorUnidad,
  precioParaCambio,
  prendaExtraNueva,
  salidasParaBase,
  seleccionInicial,
  textoPagoConDescuento,
  seleccionDesdeLectura,
  totalesDelCambio,
  validarPrendasExtra,
  type PrendaExtra,
  type Seleccion,
  type VarianteCatalogo,
} from "./cambio-reemplazo-reglas";
import { impactoCambio, validarCambio } from "./cambios-reglas";
import type { LineaVentaReciente } from "./ventas-v2";

// Lo que la colaboradora lee en el paso «Reemplazo» de Cambios cuando lo que pide no se puede entregar: «apartada para
// una clienta» si lo que queda en el piso es de otra, «no queda aquí» si de verdad no hay. Antes vivía dentro del
// componente y ninguna prueba lo tocaba (la revisión lo borró dos veces sin que nada se pusiera en rojo).

const variante = (id: string, productoId: string, extra: Partial<VarianteCatalogo> = {}): VarianteCatalogo => ({
  varianteId: id,
  productoId,
  sku: id,
  codigo: null,
  referencia: productoId === "polera" ? "Polera Sofía" : "Cinturón Cuero",
  talla: null,
  color: null,
  colorHex: null,
  fotoUrl: null,
  precio: 100,
  stockAqui: 0,
  apartadoAqui: 0,
  stockOtrasSedes: [],
  codigosBarras: [],
  ...extra,
});

// Polera Sofía: S/Negro apartada (1, con 2 en Trujillo), M/Negro agotada, L/Negro con 2 libres, S/Rojo apartada (2) y
// L/Verde agotada (existe para que S/Verde y M/Rojo sean combinaciones que NO existen).
const trujillo = [{ sede: "Trujillo", cantidad: 2 }];
const catalogo: VarianteCatalogo[] = [
  variante("s-negro", "polera", { talla: "S", color: "Negro", colorHex: "#111", apartadoAqui: 1, stockOtrasSedes: trujillo }),
  variante("m-negro", "polera", { talla: "M", color: "Negro", colorHex: "#111" }),
  variante("l-negro", "polera", { talla: "L", color: "Negro", colorHex: "#111", stockAqui: 2 }),
  variante("s-rojo", "polera", { talla: "S", color: "Rojo", colorHex: "#c00", apartadoAqui: 2 }),
  variante("l-verde", "polera", { talla: "L", color: "Verde", colorHex: "#0a0" }),
  // Un accesorio: sin talla ni color, todo el piso apartado.
  variante("cinturon", "cinturon", { apartadoAqui: 1 }),
];
const porProducto = agruparCatalogo(catalogo);

// Solo lo que `derivarReemplazo` lee de la línea comprada.
const linea = { productoId: "polera", referencia: "Polera Sofía", precioUnitario: 100, descuentoUnitario: 0 } as LineaVentaReciente;

const sel = (extra: Partial<Seleccion> = {}): Seleccion => ({
  motivo: "talla_chica",
  productoId: "polera",
  talla: null,
  color: null,
  condicionElegida: "vendible",
  cantidad: 1,
  metodo: "efectivo",
  ...extra,
});
const derivar = (extra: Partial<Seleccion> = {}, cat = porProducto) => derivarReemplazo(linea, cat, sel(extra));

describe("sinStockTexto — lo que dice una talla o un color sin nada libre", () => {
  const r = derivar();

  it("apartada si lo que queda está apartado, no queda si de verdad no hay", () => {
    expect(r.sinStockTexto("S", "Negro")).toBe("apartada para un cliente");
    expect(r.sinStockTexto("M", "Negro")).toBe("no queda aquí");
  });

  it("solo suma las variantes de ESA talla y color: una combinación que no existe no hereda lo de sus vecinas", () => {
    expect(r.sinStockTexto("S", "Rojo")).toBe("apartada para un cliente");
    // M/Rojo no existe: no hereda lo apartado de S/Rojo (filtro por talla)…
    expect(r.sinStockTexto("M", "Rojo")).toBe("no queda aquí");
    // …ni S/Verde lo de S/Negro y S/Rojo (filtro por color).
    expect(r.sinStockTexto("S", "Verde")).toBe("no queda aquí");
  });

  it("con talla o color sin fijar suma lo apartado de todas las que cubre", () => {
    // Rojo (cualquier talla): solo S/Rojo, apartada.
    expect(r.sinStockTexto(null, "Rojo")).toBe("apartada para un cliente");
    // Talla M (cualquier color): solo M/Negro, agotada.
    expect(r.sinStockTexto("M", null)).toBe("no queda aquí");
  });

  it("un apartado negativo (dato raro) no le resta a lo de las demás", () => {
    const raro = agruparCatalogo([
      variante("a", "polera", { talla: "S", color: "Negro", apartadoAqui: 1 }),
      variante("b", "polera", { talla: "S", color: "Rojo", apartadoAqui: -3 }),
    ]);
    expect(derivar({}, raro).sinStockTexto("S", null)).toBe("apartada para un cliente");
  });
});

describe("hayAqui y sinStockAqui — la frontera entre «hay» y «no hay»", () => {
  it("una prenda con 1 en el piso ya se puede entregar; con 0 no (ni con apartadas)", () => {
    const r = derivar();
    expect(r.hayAqui("L", "Negro")).toBe(true); // l-negro tiene 2
    expect(r.hayAqui("M", "Negro")).toBe(false); // agotada: 0 libres
    expect(r.hayAqui("S", "Negro")).toBe(false); // solo apartada: 0 libres
    expect(derivar({ talla: "L", color: "Negro" }).sinStockAqui).toBe(false);
    expect(derivar({ talla: "M", color: "Negro" }).sinStockAqui).toBe(true);
    expect(derivar({ talla: "S", color: "Negro" }).sinStockAqui).toBe(true);
  });

  it("con exactamente 1 libre en el piso, está disponible (no es «sin stock»)", () => {
    const unaLibre = agruparCatalogo([variante("uno", "polera", { talla: "S", color: "Negro", stockAqui: 1 })]);
    expect(derivar({ talla: "S", color: "Negro" }, unaLibre).sinStockAqui).toBe(false);
    expect(derivar({ talla: "S", color: "Negro" }, unaLibre).hayAqui("S", "Negro")).toBe(true);
  });
});

describe("avisoSinStock — el aviso bajo la elección", () => {
  it("prenda apartada: dice que es de una clienta, que no se entrega desde aquí y dónde más hay", () => {
    const r = derivar({ talla: "S", color: "Negro" });
    expect(r.avisoSinStock).toBe("Negro · Talla S está apartada para un cliente: no se entrega desde aquí. Hay 2 en Trujillo.");
  });

  it("prenda apartada y sin otra sede: lo dice igual que la validación, «No hay en otra sede.»", () => {
    const r = derivar({ talla: "S", color: "Rojo" });
    expect(r.avisoSinStock).toBe("Rojo · Talla S está apartada para un cliente: no se entrega desde aquí. No hay en otra sede.");
  });

  it("prenda agotada: sigue diciendo «no queda», sin hablar de una clienta", () => {
    const r = derivar({ talla: "M", color: "Negro" });
    expect(r.avisoSinStock).toBe("No queda Negro · Talla M aquí, ni en otra sede.");
    const conOtras = derivarReemplazo(
      linea,
      agruparCatalogo([variante("m", "polera", { talla: "M", color: "Negro", stockOtrasSedes: trujillo })]),
      sel({ talla: "M", color: "Negro" }),
    );
    expect(conOtras.avisoSinStock).toBe("No queda Negro · Talla M aquí — hay 2 en Trujillo.");
  });

  it("sin aviso si hay algo que entregar o si todavía no eligió la prenda", () => {
    expect(derivar({ talla: "L", color: "Negro" }).avisoSinStock).toBeNull();
    expect(derivar({ talla: "S" }).avisoSinStock).toBeNull(); // falta el color: aún no hay prenda
  });
});

describe("descripcionNueva — una prenda sin talla ni color se nombra por su referencia", () => {
  it("el accesorio no queda «sin sujeto» en el aviso ni en la validación de Cambios", () => {
    const r = derivar({ productoId: "cinturon" });
    expect(r.descripcionNueva).toBe("Cinturón Cuero");
    expect(r.avisoSinStock).toBe("Cinturón Cuero está apartada para un cliente: no se entrega desde aquí. No hay en otra sede.");

    // Lo que CambiosFlujo le pasa a validarCambio: el título arranca con el nombre, no con un espacio.
    const nueva = { descripcion: r.descripcionNueva, stockAqui: r.varianteNueva!.stockAqui, apartadoAqui: r.varianteNueva!.apartadoAqui, otrasSedes: r.otrasSedes, precio: r.precioNueva! };
    const ahora = new Date("2026-09-18T17:00:00Z");
    const stock = validarCambio({
      venta: { comprobante: "Boleta B001-000010", creadoEn: ahora.toISOString(), anulada: false },
      ahora,
      cantidadComprada: 1,
      disponible: 1,
      motivo: "otro",
      eligioPrenda: r.eligioTodo,
      nueva,
      sede: "Tienda Lima",
      diferencia: 0,
      metodo: "efectivo",
      cajaAbierta: false,
    }).find((v) => v.clave === "stock");
    expect(stock?.titulo).toBe("Cinturón Cuero está apartada para un cliente en Tienda Lima");
  });

  it("es la referencia del producto ELEGIDO, no la de la prenda que compró", () => {
    // Compró una Polera Sofía y elige el cinturón: el aviso habla del cinturón.
    expect(derivar({ productoId: "cinturon" }).descripcionNueva).not.toContain("Polera");
  });

  it("con talla y color, el nombre sigue siendo «Color · Talla»", () => {
    expect(derivar({ talla: "L", color: "Negro" }).descripcionNueva).toBe("Negro · Talla L");
  });
});

describe("seleccionDesdeLectura — escanear la prenda que se lleva (Felipe 2026-10-09)", () => {
  const conCodigos: VarianteCatalogo[] = [
    variante("l-negro", "polera", { sku: "PLS-0001-NEG-L", talla: "L", color: "Negro", stockAqui: 2, codigosBarras: ["7750000000017"] }),
    variante("m-negro", "polera", { sku: "PLS-0001-NEG-M", talla: "M", color: "Negro" }),
    variante("cinturon", "cinturon", { sku: "CIN-0001-STD", stockAqui: 1 }),
  ];

  it("la etiqueta deja elegidas la prenda, la talla y el color", () => {
    const r = seleccionDesdeLectura("PLS-0001-NEG-L", conCodigos);
    expect(r).toMatchObject({ tipo: "elegida", cambio: { productoId: "polera", talla: "L", color: "Negro" } });
  });

  it("también lee el código de fábrica y el apóstrofo de la pistola en una Mac en español", () => {
    expect(seleccionDesdeLectura("7750000000017", conCodigos)).toMatchObject({ tipo: "elegida", variante: { varianteId: "l-negro" } });
    expect(seleccionDesdeLectura("pls'0001'neg'm", conCodigos)).toMatchObject({ tipo: "elegida", variante: { varianteId: "m-negro" } });
  });

  it("un código que no es de ninguna prenda no elige nada, ni por parecido", () => {
    expect(seleccionDesdeLectura("PLS-0001", conCodigos)).toEqual({ tipo: "no-encontrada", codigo: "PLS-0001" });
    expect(seleccionDesdeLectura("  ", conCodigos)).toMatchObject({ tipo: "no-encontrada" });
  });

  it("una prenda sin talla ni color queda elegida entera", () => {
    const r = seleccionDesdeLectura("CIN-0001-STD", conCodigos);
    expect(r).toMatchObject({ tipo: "elegida", cambio: { productoId: "cinturon", talla: null, color: null } });
    if (r.tipo !== "elegida") throw new Error("debía elegirse");
    const d = derivarReemplazo(linea, agruparCatalogo(conCodigos), sel(r.cambio));
    expect(d.varianteNueva?.varianteId).toBe("cinturon");
  });

  it("lo escaneado entra al combo aunque no quede en el piso: el paso dice dónde más hay", () => {
    const sinStock = [variante("x", "polera"), variante("c", "cinturon")];
    const pp = agruparCatalogo(sinStock);
    expect(opcionesDePrenda({ ...linea, productoId: "otra" } as LineaVentaReciente, pp).map((o) => o.valor)).toEqual(["otra"]);
    expect(opcionesDePrenda({ ...linea, productoId: "otra" } as LineaVentaReciente, pp, "cinturon").map((o) => o.valor)).toEqual(["otra", "cinturon"]);
  });
});

describe("precio de tienda en un cambio (Felipe 2026-10-10, «vale lo que pagó»)", () => {
  const nueva = (extra: Partial<Parameters<typeof precioParaCambio>[1]> = {}) =>
    ({ varianteId: "s", productoId: "falda", precio: 79.9, precioPrenda: 79.9, preciosPorTienda: { tru: 69.9 }, ...extra }) as Parameters<typeof precioParaCambio>[1];
  it("la misma prenda en otra talla, cambiada en Lima, vale lo de la tienda donde se compró (TRU)", () => {
    expect(precioParaCambio({ productoId: "falda", ubicacionVentaId: "tru" }, nueva())).toBe(69.9);
  });
  it("comprada en una tienda sin precio propio, vale el de la prenda aunque aquí tenga otro", () => {
    expect(precioParaCambio({ productoId: "falda", ubicacionVentaId: "lim" }, nueva({ precio: 69.9 }))).toBe(79.9);
  });
  it("otra prenda es una venta nueva aquí: el precio de esta tienda", () => {
    expect(precioParaCambio({ productoId: "blusa", ubicacionVentaId: "tru" }, nueva({ precio: 79.9 }))).toBe(79.9);
  });
  it("sin saber dónde se compró, el de esta tienda", () => {
    expect(precioParaCambio({ productoId: "falda", ubicacionVentaId: null }, nueva({ precio: 79.9 }))).toBe(79.9);
  });
});

describe("el precio que se muestra y la diferencia salen del mismo número (Cambios, pasos 3 y 4)", () => {
  // Comprada en TRU a 69.90 (precio propio de TRU), cambiada de talla en Lima, donde vale 79.90.
  const conTiendas = agruparCatalogo([
    variante("l-negro", "polera", { talla: "L", color: "Negro", stockAqui: 2, precio: 79.9, precioPrenda: 79.9, preciosPorTienda: { tru: 69.9 } }),
  ]);
  const deTru = { ...linea, precioUnitario: 69.9, ubicacionVentaId: "tru" } as LineaVentaReciente;
  it("la misma prenda: se muestra 69.90 y la diferencia es 0", () => {
    const r = derivarReemplazo(deTru, conTiendas, sel({ talla: "L", color: "Negro" }));
    expect(r.precioNueva).toBe(69.9);
    expect(r.diferencia).toBeCloseTo((r.precioNueva ?? NaN) - deTru.precioUnitario);
    expect(r.diferencia).toBeCloseTo(0);
  });
});

describe("la diferencia se mide contra lo que la clienta pagó, no contra el precio de lista (ADR-0380)", () => {
  // Polera de S/ 100 con campaña del 20 %: pagó S/ 80. `variante()` pone S/ 100 de precio por defecto.
  const conCampana = { ...linea, precioUnitario: 100, descuentoUnitario: 20 } as LineaVentaReciente;
  const otraPrenda = (precio: number) =>
    agruparCatalogo([variante("vestido-m", "vestido", { talla: "M", color: "Rojo", stockAqui: 2, precio, precioPrenda: precio })]);
  const aOtraPrenda = (precio: number, cantidad = 1) =>
    derivarReemplazo(conCampana, otraPrenda(precio), sel({ productoId: "vestido", talla: "M", color: "Rojo", cantidad }));

  it("lo que pagó es el precio menos el descuento", () => {
    expect(pagadoPorUnidad(conCampana)).toBe(80);
    expect(pagadoPorUnidad(linea)).toBe(100);
  });

  it("por otra de S/ 100: S/ 20 a cobrar (antes decía «diferencia 0» y regalaba el descuento)", () => {
    expect(aOtraPrenda(100).diferencia).toBe(20);
  });

  it("por una de S/ 40: se le devuelven S/ 40, no S/ 60 (antes devolvía más de lo que sobraba de lo pagado)", () => {
    expect(aOtraPrenda(40).diferencia).toBe(-40);
  });

  it("por una de S/ 80 —justo lo que pagó— no hay diferencia", () => {
    expect(aOtraPrenda(80).diferencia).toBe(0);
  });

  it("con varias unidades: por unidad × cantidad, y sin ruido de decimales", () => {
    expect(aOtraPrenda(100, 3).diferencia).toBe(60);
    const conCentimos = { ...linea, precioUnitario: 79.9, descuentoUnitario: 10.1 } as LineaVentaReciente;
    expect(derivarReemplazo(conCentimos, otraPrenda(149.9), sel({ productoId: "vestido", talla: "M", color: "Rojo", cantidad: 3 })).diferencia).toBe(240.3);
  });

  it("sin prenda nueva elegida no hay diferencia", () => {
    expect(derivarReemplazo(conCampana, porProducto, sel()).diferencia).toBe(0);
  });

  it("sin descuento nada cambia: la misma cuenta de siempre", () => {
    const r = derivarReemplazo(linea, otraPrenda(130), sel({ productoId: "vestido", talla: "M", color: "Rojo" }));
    expect(r.diferencia).toBe(30);
  });

  it("explica el precio de una línea con descuento, y calla si no lo tuvo", () => {
    expect(textoPagoConDescuento(conCampana)).toBe("Pagó con S/\u00a020.00 de descuento (lista S/\u00a0100.00)");
    expect(textoPagoConDescuento(linea)).toBeNull();
  });
});

// ============================================================================
// Una prenda por VARIAS (ADR-0470): el body de S/ 45.90 por dos Top Rib de S/ 35.90 (boleta B005-000670, 2026-10-21).
// ============================================================================

describe("cambio de una prenda por varias — la diferencia es la de TODO lo que se lleva (ADR-0470)", () => {
  const top = (id: string, talla: string, color: string, extra: Partial<VarianteCatalogo> = {}) =>
    variante(id, "top", { referencia: "Top Rib", talla, color, colorHex: "#111", precio: 35.9, stockAqui: 5, ...extra });
  const catalogoTops = agruparCatalogo([
    top("top-s-negro", "S", "Negro"),
    top("top-m-blanco", "M", "Blanco", { stockAqui: 1 }),
    top("top-l-rosa", "L", "Rosa", { stockAqui: 0 }),
    variante("body-m", "body", { referencia: "Body Miramhe Relieve", talla: "M", color: "Negro", precio: 45.9, stockAqui: 3 }),
  ]);
  const lineaBody = { productoId: "body", referencia: "Body Miramhe Relieve", precioUnitario: 45.9, descuentoUnitario: 0, cantidad: 1 } as LineaVentaReciente;
  const extra = (e: Partial<PrendaExtra> = {}): PrendaExtra => ({ id: "x1", productoId: "top", talla: "M", color: "Blanco", cantidad: 1, ...e });
  const armar = (s: Partial<Seleccion>, linea = lineaBody) => {
    const seleccion: Seleccion = { ...sel({ productoId: "top", talla: "S", color: "Negro" }), ...s };
    const r = derivarReemplazo(linea, catalogoTops, seleccion);
    const extrasR = (seleccion.extras ?? []).map((x) => derivarExtra(linea, catalogoTops, seleccion, x));
    return { seleccion, r, extrasR, totales: totalesDelCambio(linea, seleccion, r, extrasR) };
  };

  it("el caso real: body de S/ 45.90 por dos tops de S/ 35.90 son S/ 25.90 a cobrar (no −S/ 10 más una venta aparte)", () => {
    const { totales } = armar({ extras: [extra()] });
    expect(totales.salidas).toHaveLength(2);
    expect(totales.valorNuevo).toBe(71.8);
    expect(totales.diferencia).toBe(25.9);
    expect(totales.esVarias).toBe(true);
    expect(totales.faltan).toBe(0);
  });

  it("sin prendas extra es exactamente la diferencia de siempre: el cambio de una por una no cambia", () => {
    const { r, totales } = armar({ extras: [] });
    expect(totales.diferencia).toBe(r.diferencia);
    expect(totales.esVarias).toBe(false);
    expect(totales.diferencia).toBe(-10); // 35.90 − 45.90: el −10 que la colaboradora tuvo que interpretar
  });

  it("un cambio armado antes de existir las prendas extra (sin `extras`) se lee como sin extras", () => {
    const s: Seleccion = sel({ productoId: "top", talla: "S", color: "Negro" });
    expect("extras" in s).toBe(false);
    const r = derivarReemplazo(lineaBody, catalogoTops, s);
    expect(totalesDelCambio(lineaBody, s, r, []).diferencia).toBe(r.diferencia);
  });

  it("se mide contra lo que la clienta PAGÓ: con S/ 10 de descuento pagó 35.90, y dos tops de 35.90 son S/ 35.90 a cobrar", () => {
    const conDescuento = { ...lineaBody, descuentoUnitario: 10 } as LineaVentaReciente;
    const { totales } = armar({ extras: [extra()] }, conDescuento);
    expect(totales.diferencia).toBe(35.9);
  });

  it("las unidades cuentan: dos de la segunda prenda suman 35.90 × 2", () => {
    const { totales } = armar({ extras: [extra({ cantidad: 2 })] });
    expect(totales.valorNuevo).toBe(107.7);
    expect(totales.diferencia).toBe(61.8);
  });

  it("sin ruido de decimales: tres prendas de 35.90 dan 107.70, no 107.69999999999999", () => {
    const { totales } = armar({ extras: [extra(), extra({ id: "x2", talla: "S", color: "Negro" })] });
    expect(totales.valorNuevo).toBe(107.7);
    expect(totales.diferencia).toBe(61.8);
  });

  it("una prenda extra sin elegir no entra a la cuenta y se cuenta como pendiente", () => {
    const { totales } = armar({ extras: [prendaExtraNueva("x1")] });
    expect(totales.salidas).toHaveLength(1);
    expect(totales.faltan).toBe(1);
  });

  it("sin la primera prenda elegida no hay diferencia, aunque haya extras", () => {
    const { totales } = armar({ talla: null, color: null, extras: [extra()] });
    expect(totales.diferencia).toBe(0);
  });

  it("para la base, la misma prenda repetida se suma en una sola, igual que registrar_cambio_varias", () => {
    const { totales } = armar({ extras: [extra({ talla: "S", color: "Negro", cantidad: 2 })] });
    expect(salidasParaBase(totales.salidas)).toEqual([{ variante_id: "top-s-negro", cantidad: 3 }]);
  });

  it("el ticket dice cada prenda con su cantidad", () => {
    const { totales } = armar({ extras: [extra({ cantidad: 2 })] });
    expect(describirSalidas(totales.salidas)).toBe("Top Rib · Negro · Talla S + Top Rib · Blanco · Talla M (×2)");
  });
});

describe("validarPrendasExtra — lo que frena antes de guardar", () => {
  const top = (id: string, talla: string, color: string, extra: Partial<VarianteCatalogo> = {}) =>
    variante(id, "top", { referencia: "Top Rib", talla, color, colorHex: "#111", precio: 35.9, stockAqui: 5, ...extra });
  const catalogoTops = agruparCatalogo([
    top("top-s-negro", "S", "Negro"),
    top("top-m-blanco", "M", "Blanco", { stockAqui: 1 }),
    top("top-l-rosa", "L", "Rosa", { stockAqui: 0 }),
    top("top-xl-gratis", "XL", "Gris", { precio: 0 }),
  ]);
  const lineaBody = { productoId: "body", referencia: "Body", precioUnitario: 45.9, descuentoUnitario: 0, cantidad: 1 } as LineaVentaReciente;
  const validar = (extras: PrendaExtra[]) => {
    const s: Seleccion = { ...sel({ productoId: "top", talla: "S", color: "Negro" }), extras };
    const r = derivarReemplazo(lineaBody, catalogoTops, s);
    const extrasR = extras.map((x) => derivarExtra(lineaBody, catalogoTops, s, x));
    const t = totalesDelCambio(lineaBody, s, r, extrasR);
    return validarPrendasExtra({ extras, extrasR, salidas: t.salidas, sede: "Tienda Lima" });
  };
  const buena: PrendaExtra = { id: "x1", productoId: "top", talla: "M", color: "Blanco", cantidad: 1 };

  it("sin prendas extra no dice nada (el cambio de una por una no ve ninguna revisión nueva)", () => {
    expect(validar([])).toEqual([]);
  });

  it("todo bien: una sola revisión en verde", () => {
    const v = validar([buena]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ clave: "stock", estado: "ok" });
  });

  it("una prenda extra sin elegir frena y dice cuál (la 2.ª)", () => {
    expect(validar([prendaExtraNueva("x1")])[0]).toMatchObject({ estado: "pendiente", titulo: "Falta elegir la 2.ª prenda que se lleva" });
  });

  it("elegida la prenda pero no su talla y color: frena y lo dice", () => {
    expect(validar([{ ...buena, talla: null, color: null }])[0]).toMatchObject({ estado: "pendiente", titulo: "Falta elegir la talla y el color de la 2.ª prenda" });
  });

  it("la tercera prenda se llama 3.ª", () => {
    expect(validar([buena, prendaExtraNueva("x2")]).map((v) => v.titulo)).toEqual(["Falta elegir la 3.ª prenda que se lleva"]);
  });

  it("una talla y color que no existen en el catálogo frenan", () => {
    expect(validar([{ ...buena, talla: "L", color: "Blanco" }])[0]).toMatchObject({ estado: "alerta" });
  });

  it("sin stock en el piso frena con el aviso de siempre", () => {
    const v = validar([{ ...buena, talla: "L", color: "Rosa" }]);
    expect(v[0]).toMatchObject({ clave: "stock", estado: "alerta" });
    expect(v[0]!.titulo).toContain("No queda");
  });

  it("una prenda sin precio no se ofrece a cambio (ADR-0385: se la llevaría gratis)", () => {
    const v = validar([{ ...buena, talla: "XL", color: "Gris" }]);
    expect(v[0]).toMatchObject({ estado: "alerta", titulo: "Gris · Talla XL no tiene precio" });
  });

  it("pide más unidades de las que hay: con 1 en el piso, la 2.ª y la 3.ª de la misma no alcanzan", () => {
    const v = validar([buena, { ...buena, id: "x2" }]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ estado: "alerta" });
    expect(v[0]!.titulo).toBe("Pides 2 de Top Rib · Blanco · Talla M y en el piso de Tienda Lima hay 1");
  });

  it("la primera y una extra de la MISMA prenda suman: 5 en el piso, 3 + 3 no alcanzan", () => {
    const s: Seleccion = { ...sel({ productoId: "top", talla: "S", color: "Negro", cantidad: 3 }), extras: [{ id: "x1", productoId: "top", talla: "S", color: "Negro", cantidad: 3 }] };
    const r = derivarReemplazo(lineaBody, catalogoTops, s);
    const extrasR = [derivarExtra(lineaBody, catalogoTops, s, s.extras![0]!)];
    const t = totalesDelCambio(lineaBody, s, r, extrasR);
    const v = validarPrendasExtra({ extras: s.extras!, extrasR, salidas: t.salidas, sede: "Tienda Lima" });
    expect(v[0]!.titulo).toBe("Pides 6 de Top Rib · Negro · Talla S y en el piso de Tienda Lima hay 5");
  });
});

describe("opcionesDeOtraPrenda — qué se ofrece como otra prenda más", () => {
  const catalogoMixto = agruparCatalogo([
    variante("a", "polera", { talla: "S", color: "Negro", stockAqui: 2, precio: 80 }),
    variante("b", "polera", { talla: "M", color: "Negro", stockAqui: 0, precio: 70 }),
    variante("c", "cinturon", { stockAqui: 0 }),
  ]);

  it("solo lo que tiene algo en el piso, con su precio «desde»", () => {
    expect(opcionesDeOtraPrenda(catalogoMixto)).toEqual([{ valor: "polera", texto: "Polera Sofía", detalle: "desde S/\u00a070.00" }]);
  });

  it("la ya elegida se queda aunque no tenga stock: se ve en el campo con su aviso", () => {
    expect(opcionesDeOtraPrenda(catalogoMixto, "cinturon").map((o) => o.valor)).toEqual(["cinturon", "polera"]);
  });

  it("ninguna se llama «la que compró»: aquí todas valen igual", () => {
    expect(opcionesDeOtraPrenda(catalogoMixto).every((o) => o.detalle !== "la que compró")).toBe(true);
  });
});

describe("el cambio nuevo arranca sin prendas extra y sin nada elegido a ciegas", () => {
  it("seleccionInicial no trae extras y una prenda extra recién agregada viene vacía con una unidad", () => {
    expect(seleccionInicial(linea).extras).toEqual([]);
    expect(prendaExtraNueva("x")).toEqual({ id: "x", productoId: "", talla: null, color: null, cantidad: 1 });
  });
});

describe("impactoCambio — cada prenda que sale del piso se dice por separado (ADR-0470)", () => {
  const base = { devuelta: "Body · Negro · M", entregada: "Top Rib · Negro · S", cantidad: 1, condicion: "vendible" as const, diferencia: 25.9, metodo: "qr" as const, sede: "Tienda Lima" };

  it("con varias prendas: una entrada y una salida por prenda, con su cantidad", () => {
    const i = impactoCambio({ ...base, entregadas: [{ prenda: "Top Rib · Negro · S", cantidad: 1 }, { prenda: "Top Rib · Blanco · M", cantidad: 2 }] });
    expect(i.inventario.map((l) => `${l.signo}${l.cantidad} ${l.prenda}`)).toEqual(["+1 Body · Negro · M", "−1 Top Rib · Negro · S", "−2 Top Rib · Blanco · M"]);
    expect(i.caja.titulo).toBe("+ S/\u00a025.90 por cobrar");
  });

  it("sin `entregadas`, sale la de siempre: una sola prenda × la cantidad", () => {
    const i = impactoCambio({ ...base, cantidad: 2 });
    expect(i.inventario.map((l) => `${l.signo}${l.cantidad} ${l.prenda}`)).toEqual(["+2 Body · Negro · M", "−2 Top Rib · Negro · S"]);
  });
});
