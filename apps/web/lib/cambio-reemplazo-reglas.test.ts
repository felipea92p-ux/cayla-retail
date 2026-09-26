import { describe, expect, it } from "vitest";
import { agruparCatalogo, derivarReemplazo, type Seleccion, type VarianteCatalogo } from "./cambio-reemplazo-reglas";
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
const linea = { productoId: "polera", referencia: "Polera Sofía", precioUnitario: 100 } as LineaVentaReciente;

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
    expect(r.sinStockTexto("S", "Negro")).toBe("apartada para una clienta");
    expect(r.sinStockTexto("M", "Negro")).toBe("no queda aquí");
  });

  it("solo suma las variantes de ESA talla y color: una combinación que no existe no hereda lo de sus vecinas", () => {
    expect(r.sinStockTexto("S", "Rojo")).toBe("apartada para una clienta");
    // M/Rojo no existe: no hereda lo apartado de S/Rojo (filtro por talla)…
    expect(r.sinStockTexto("M", "Rojo")).toBe("no queda aquí");
    // …ni S/Verde lo de S/Negro y S/Rojo (filtro por color).
    expect(r.sinStockTexto("S", "Verde")).toBe("no queda aquí");
  });

  it("con talla o color sin fijar suma lo apartado de todas las que cubre", () => {
    // Rojo (cualquier talla): solo S/Rojo, apartada.
    expect(r.sinStockTexto(null, "Rojo")).toBe("apartada para una clienta");
    // Talla M (cualquier color): solo M/Negro, agotada.
    expect(r.sinStockTexto("M", null)).toBe("no queda aquí");
  });

  it("un apartado negativo (dato raro) no le resta a lo de las demás", () => {
    const raro = agruparCatalogo([
      variante("a", "polera", { talla: "S", color: "Negro", apartadoAqui: 1 }),
      variante("b", "polera", { talla: "S", color: "Rojo", apartadoAqui: -3 }),
    ]);
    expect(derivar({}, raro).sinStockTexto("S", null)).toBe("apartada para una clienta");
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
    expect(r.avisoSinStock).toBe("Negro · Talla S está apartada para una clienta: no se entrega desde aquí. Hay 2 en Trujillo.");
  });

  it("prenda apartada y sin otra sede: lo dice igual que la validación, «No hay en otra sede.»", () => {
    const r = derivar({ talla: "S", color: "Rojo" });
    expect(r.avisoSinStock).toBe("Rojo · Talla S está apartada para una clienta: no se entrega desde aquí. No hay en otra sede.");
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
    expect(r.avisoSinStock).toBe("Cinturón Cuero está apartada para una clienta: no se entrega desde aquí. No hay en otra sede.");

    // Lo que CambiosFlujo le pasa a validarCambio: el título arranca con el nombre, no con un espacio.
    const nueva = { descripcion: r.descripcionNueva, stockAqui: r.varianteNueva!.stockAqui, apartadoAqui: r.varianteNueva!.apartadoAqui, otrasSedes: r.otrasSedes };
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
    expect(stock?.titulo).toBe("Cinturón Cuero está apartada para una clienta en Tienda Lima");
  });

  it("es la referencia del producto ELEGIDO, no la de la prenda que compró", () => {
    // Compró una Polera Sofía y elige el cinturón: el aviso habla del cinturón.
    expect(derivar({ productoId: "cinturon" }).descripcionNueva).not.toContain("Polera");
  });

  it("con talla y color, el nombre sigue siendo «Color · Talla»", () => {
    expect(derivar({ talla: "L", color: "Negro" }).descripcionNueva).toBe("Negro · Talla L");
  });
});
