import { describe, expect, it } from "vitest";
import { ID_CARGO_ESPECIAL } from "./cargo-especial";
import { filaDelTicket, motivoDeLaLinea, porcentajeVisible, STOCK_HOLGADO, tonoDelStock, type LineaParaFila } from "./ticket-linea-reglas";
import { conDescuentoDeCampana, porcentajeDeLinea, RAZON_CAMPANA, RAZONES_DESCUENTO } from "./vender-reglas";

// La fila compacta del ticket solo cambia el DIBUJO: estas pruebas fijan que diga lo mismo que decía la fila de antes
// (mismo importe, mismo %, mismo tope) y lo nuevo que muestra (color y talla, el punto del stock, la línea del motivo).

// Con los campos de una línea real del carrito (`ItemCarrito`), para poder pasarla por `conDescuentoDeCampana`.
const base: LineaParaFila & { claveLinea: string; argumentoDescuento: string } = {
  claveLinea: "v-1",
  varianteId: "v-1",
  referencia: "Blusa Aurora",
  sku: "",
  codigo: "BLS-0001-ROS-M",
  cantidad: 1,
  precioUnitario: 89.9,
  descuentoUnitario: 0,
  stockAqui: 5,
  razonDescuento: "",
  razonDescuentoOtro: "",
  argumentoDescuento: "",
  campana: null,
};

describe("filaDelTicket — nombre, color, talla y código", () => {
  it("dice color y talla cuando el catálogo los trae, y deja el código en el título", () => {
    const f = filaDelTicket(base, { color: "Rosa", talla: "M" });
    expect(f.detalle).toBe("Rosa · Talla M");
    expect(f.titulo).toBe("Blusa Aurora · BLS-0001-ROS-M");
  });

  it("con solo uno de los dos, muestra ese", () => {
    expect(filaDelTicket(base, { color: "Rosa", talla: null }).detalle).toBe("Rosa");
    expect(filaDelTicket(base, { color: null, talla: "S" }).detalle).toBe("Talla S");
    expect(filaDelTicket(base, { color: "  ", talla: " " }).detalle).toBe("BLS-0001-ROS-M");
  });

  it("sin detalle (ticket retomado, prenda que ya no está en el catálogo) cae al código, como la fila de antes", () => {
    expect(filaDelTicket(base).detalle).toBe("BLS-0001-ROS-M");
    expect(filaDelTicket({ ...base, codigo: null, sku: "" }).detalle).toBe("sin código");
  });
});

describe("filaDelTicket — stock y tope", () => {
  it("el punto es verde con holgura, ámbar con pocas y rojo si el stock en vivo bajó de lo que hay en el ticket", () => {
    expect(tonoDelStock(1, STOCK_HOLGADO)).toBe("verde");
    expect(tonoDelStock(1, STOCK_HOLGADO - 1)).toBe("ambar");
    expect(tonoDelStock(1, 1)).toBe("ambar");
    expect(tonoDelStock(2, 1)).toBe("excedido");
    expect(tonoDelStock(1, 0)).toBe("excedido");
  });

  it("el «+» se apaga en el mismo tope de antes (cantidad ≥ stock de la sede)", () => {
    expect(filaDelTicket({ ...base, cantidad: 2, stockAqui: 3 }).alTope).toBe(false);
    expect(filaDelTicket({ ...base, cantidad: 3, stockAqui: 3 }).alTope).toBe(true);
    expect(filaDelTicket({ ...base, cantidad: 4, stockAqui: 3 }).alTope).toBe(true);
  });

  it("el stock que se muestra es el de la sede, el mismo número del «Máximo disponible en sede»", () => {
    expect(filaDelTicket({ ...base, stockAqui: 2 }).stock).toEqual({ cantidad: 2, tono: "ambar" });
  });
});

describe("filaDelTicket — prenda sin registrar", () => {
  const libre: LineaParaFila = { ...base, varianteId: ID_CARGO_ESPECIAL, referencia: "Vestido lino", sku: "SIN-REGISTRAR", codigo: null, stockAqui: 1 };

  it("no muestra stock ni el «− 1 +» (va de a una), y dice que almacén la regulariza", () => {
    const f = filaDelTicket(libre);
    expect(f.sinRegistrar).toBe(true);
    expect(f.stock).toBeNull();
    expect(f.conPaso).toBe(false);
    expect(f.detalle).toBe("Prenda sin registrar · almacén la regulariza después");
    expect(f.titulo).toBe("Vestido lino");
  });

  it("aunque el catálogo trajera un detalle, manda que es sin registrar", () => {
    expect(filaDelTicket(libre, { color: "Negro", talla: "M" }).detalle).toMatch(/^Prenda sin registrar/);
  });
});

describe("filaDelTicket — importe y descuento (misma cuenta que antes)", () => {
  it("sin descuento: importe = cantidad × precio, sin tachado ni nota", () => {
    const f = filaDelTicket({ ...base, cantidad: 3 });
    expect(f.importe).toBeCloseTo(269.7, 10);
    expect(f.importeLista).toBeNull();
    expect(f.nota).toBeNull();
    expect(f.pct).toBe(0);
  });

  it("descuento a mano: importe neto, el de lista tachado y la nota con el % y el motivo de la lista cerrada", () => {
    const l = { ...base, cantidad: 2, precioUnitario: 100, descuentoUnitario: 20, razonDescuento: "prenda_con_desperfecto" };
    const f = filaDelTicket(l);
    expect(f.importe).toBe(160);
    expect(f.importeLista).toBe(200);
    expect(f.pct).toBe(porcentajeDeLinea(l));
    expect(f.nota).toBe("−20 % · Prenda con desperfecto");
  });

  it("de campaña: el % es el de su campaña, no la cuenta monto ÷ precio, y la nota lleva su nombre", () => {
    const l = conDescuentoDeCampana({ ...base, precioUnitario: 95.8, campana: { etiquetaId: "e", nombre: "Black Friday", pct: 25 } });
    expect(l.razonDescuento).toBe(RAZON_CAMPANA);
    const f = filaDelTicket(l);
    expect(f.pct).toBe(25);
    expect(f.nota).toBe("−25 % · Black Friday");
    expect(f.importe).toBeCloseTo(95.8 - l.descuentoUnitario, 10);
    expect(f.importeLista).toBeCloseTo(95.8, 10);
  });

  it("un descuento que redondea a 0 % se comporta como la fila de antes: sin tachado ni nota", () => {
    const f = filaDelTicket({ ...base, precioUnitario: 100, descuentoUnitario: 0.1, razonDescuento: "cerrar_venta" });
    expect(f.pct).toBe(0);
    expect(f.nota).toBeNull();
    expect(f.importeLista).toBeNull();
    expect(f.importe).toBeCloseTo(99.9, 10);
  });
});

describe("motivoDeLaLinea — el porqué en palabras de la tienda", () => {
  it("cada motivo de la lista cerrada se dice con su etiqueta", () => {
    for (const r of RAZONES_DESCUENTO.filter((r) => r.valor !== "otro")) {
      expect(motivoDeLaLinea({ ...base, descuentoUnitario: 5, razonDescuento: r.valor })).toBe(r.etiqueta);
    }
  });

  it("«Otro» dice lo que se escribió (una proforma deja su número) y, vacío, «Otro»", () => {
    expect(motivoDeLaLinea({ ...base, descuentoUnitario: 5, razonDescuento: "otro", razonDescuentoOtro: "Precio de la proforma P-0007" })).toBe(
      "Precio de la proforma P-0007",
    );
    expect(motivoDeLaLinea({ ...base, descuentoUnitario: 5, razonDescuento: "otro", razonDescuentoOtro: "  " })).toBe("Otro");
  });

  it("campaña sin su ficha (ticket viejo) dice «Campaña»; un motivo desconocido, «Descuento»", () => {
    expect(motivoDeLaLinea({ ...base, descuentoUnitario: 5, razonDescuento: RAZON_CAMPANA, campana: null })).toBe("Campaña");
    expect(motivoDeLaLinea({ ...base, descuentoUnitario: 5, razonDescuento: "algo_nuevo" })).toBe("Descuento");
  });

  it("porcentajeVisible sin ficha de campaña vuelve a la cuenta de siempre", () => {
    const l = { ...base, precioUnitario: 100, descuentoUnitario: 25, razonDescuento: RAZON_CAMPANA, campana: null };
    expect(porcentajeVisible(l)).toBe(25);
  });
});
