import { describe, expect, it } from "vitest";
import { agruparCatalogo, derivarReemplazo, opcionesDePrenda, pagadoPorUnidad, precioParaCambio, textoPagoConDescuento, seleccionDesdeLectura, type Seleccion, type VarianteCatalogo } from "./cambio-reemplazo-reglas";
import { validarCambio } from "./cambios-reglas";
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
    expect(textoPagoConDescuento(conCampana)).toBe("Pagó con S/ 20.00 de descuento (lista S/ 100.00)");
    expect(textoPagoConDescuento(linea)).toBeNull();
  });
});
