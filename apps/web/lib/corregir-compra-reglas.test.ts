import { describe, expect, it } from "vitest";
import {
  borradorDe,
  cambiosDePrenda,
  cambiosParaLaBase,
  cuentaDeLaCorreccion,
  leerCompraParaCorregir,
  prendaConProblema,
  problemasDePrenda,
  textoDeCambios,
  textoDeLaPlata,
  textoMotivo,
  type Borrador,
  type CompraParaCorregir,
  type PrendaParaCorregir,
} from "./corregir-compra-reglas";

const prenda = (id: string, o: Partial<PrendaParaCorregir> = {}): PrendaParaCorregir => ({
  id,
  nombre: "Polo Venus",
  categoria: "Polos",
  marca: "Moda Mia",
  destinoId: "t1",
  destino: "Tienda Trujillo",
  productoId: null,
  esCatalogo: false,
  cantidad: 6,
  costo: 50,
  precioVenta: 129.9,
  admitePrecioCero: false,
  enviadas: 0,
  ...o,
});

const compra = (o: Partial<CompraParaCorregir> = {}): CompraParaCorregir => ({
  id: "papel",
  proveedor: "Moda Mia",
  tipo: "boleta",
  monto: 480,
  pagado: 480,
  medioPago: "efectivo",
  fecha: "2026-10-28",
  sePuede: true,
  motivo: null,
  cuadra: true,
  totalPrendas: 480,
  prendas: [prenda("a"), prenda("b", { cantidad: 4, costo: 45, precioVenta: 149.9 })],
  ...o,
});

const borradores = (c: CompraParaCorregir, cambios: Record<string, Partial<Borrador>> = {}): Map<string, Borrador> =>
  new Map(c.prendas.map((p) => [p.id, { ...borradorDe(p), ...(cambios[p.id] ?? {}) }]));

describe("leerCompraParaCorregir", () => {
  const crudo = {
    papel: { id: "p", proveedor: "Moda Mia", tipo: "boleta", monto: "480.00", pagado: 480, medio_pago: "yape", fecha: "2026-10-28" },
    se_puede: true,
    motivo: null,
    cuadra: true,
    total_prendas: 480,
    lineas: [
      {
        id: "l1",
        descripcion: "Polo Venus",
        categoria: "Polos",
        marca: "Moda Mia",
        destino_id: "t1",
        destino: "Tienda Trujillo",
        producto_id: null,
        es_catalogo: false,
        cantidad: 6,
        costo: "50.00",
        precio_venta: 129.9,
        admite_precio_cero: false,
        enviadas: 2,
      },
    ],
  };

  it("lee la compra con sus prendas, los números que llegan como texto incluidos", () => {
    const c = leerCompraParaCorregir(crudo)!;
    expect(c.monto).toBe(480);
    expect(c.medioPago).toBe("yape");
    expect(c.prendas).toEqual([expect.objectContaining({ id: "l1", cantidad: 6, costo: 50, precioVenta: 129.9, enviadas: 2, esCatalogo: false })]);
  });

  it("una forma que no se entiende da null, nunca una compra a medias", () => {
    expect(leerCompraParaCorregir(null)).toBeNull();
    expect(leerCompraParaCorregir({ ...crudo, lineas: "x" })).toBeNull();
    expect(leerCompraParaCorregir({ ...crudo, papel: { ...crudo.papel, monto: "abc" } })).toBeNull();
    expect(leerCompraParaCorregir({ ...crudo, lineas: [{ id: "l1" }] })).toBeNull();
  });
});

describe("textoMotivo", () => {
  it("dice por qué en palabras de tienda, y cae a un texto neutro", () => {
    expect(textoMotivo("completada")).toContain("Compras ya completó");
    expect(textoMotivo("ronda_cerrada")).toContain("ronda que ya cerraste");
    expect(textoMotivo("algo_nuevo")).toBe("Esta compra ya no se puede corregir.");
  });
});

describe("problemasDePrenda (lo mismo que rechaza la base)", () => {
  const p = prenda("a", { enviadas: 3 });
  const sano = borradorDe(p);

  it("sin tocar nada, nada que arreglar", () => {
    expect(prendaConProblema(p, sano)).toBe(false);
  });

  it("la cantidad es un entero desde 1 y no baja de lo enviado", () => {
    expect(problemasDePrenda(p, { ...sano, cantidad: "" }).cantidad).toMatch(/número entero/);
    expect(problemasDePrenda(p, { ...sano, cantidad: "0" }).cantidad).toMatch(/número entero/);
    expect(problemasDePrenda(p, { ...sano, cantidad: "2.5" }).cantidad).toMatch(/número entero/);
    expect(problemasDePrenda(p, { ...sano, cantidad: "2" }).cantidad).toMatch(/Ya salieron 3/);
    expect(problemasDePrenda(p, { ...sano, cantidad: "3" }).cantidad).toBeNull();
  });

  it("el costo admite hasta dos decimales y el precio de venta llega a S/ 5 000", () => {
    expect(problemasDePrenda(p, { ...sano, costo: "12.345" }).costo).toMatch(/dos decimales/);
    expect(problemasDePrenda(p, { ...sano, costo: "-1" }).costo).toMatch(/precio/);
    expect(problemasDePrenda(p, { ...sano, venta: "6000" }).venta).toMatch(/5/);
    expect(problemasDePrenda(p, { ...sano, venta: "0" }).venta).toMatch(/bolsas, cajas y empaque/);
    expect(problemasDePrenda(prenda("a", { admitePrecioCero: true }), { ...sano, venta: "0" }).venta).toBeNull();
  });

  it("quitar un precio de venta que ya tenía no se deja; si no tenía, vacío está bien", () => {
    expect(problemasDePrenda(p, { ...sano, venta: "" }).venta).not.toBeNull();
    const sinPrecio = prenda("a", { precioVenta: null });
    expect(problemasDePrenda(sinPrecio, borradorDe(sinPrecio)).venta).toBeNull();
  });
});

describe("cambiosDePrenda y cambiosParaLaBase", () => {
  const c = compra();

  it("solo cuenta lo que cambió, con los números ya leídos", () => {
    expect(cambiosDePrenda(c.prendas[0]!, { cantidad: "6", costo: "40,00", venta: "129.90" })).toEqual({ costo: 40 });
    expect(cambiosDePrenda(c.prendas[0]!, { cantidad: "8", costo: "50.00", venta: "119.9" })).toEqual({ cantidad: 8, precioVenta: 119.9 });
  });

  it("un dato mal escrito no cuenta como cambio", () => {
    expect(cambiosDePrenda(c.prendas[0]!, { cantidad: "x", costo: "", venta: "129.90" })).toEqual({});
  });

  it("lo que se manda lleva solo las prendas con cambios y solo sus campos", () => {
    const lista = cambiosParaLaBase(c.prendas, borradores(c, { a: { costo: "40" }, b: { cantidad: "5" } }));
    expect(lista).toEqual([
      { item_id: "a", costo: 40 },
      { item_id: "b", cantidad: 5 },
    ]);
    expect(cambiosParaLaBase(c.prendas, borradores(c))).toEqual([]);
  });

  it("quitar el precio de venta se manda como null", () => {
    const sinVenta = compra({ prendas: [prenda("a", { precioVenta: null })] });
    expect(cambiosParaLaBase(sinVenta.prendas, borradores(sinVenta))).toEqual([]);
    const lista = cambiosParaLaBase(c.prendas, borradores(c, { a: { venta: "" } }));
    expect(lista).toEqual([{ item_id: "a", precio_venta: null }]);
  });
});

describe("cuentaDeLaCorreccion (la cuenta de la base)", () => {
  it("bajar un costo devuelve plata: el papel baja con las prendas y pagó todo", () => {
    const c = compra();
    const x = cuentaDeLaCorreccion(c, borradores(c, { a: { costo: "40" } }));
    expect(x).toMatchObject({ datos: 1, prendas: 1, monto: 420, pagado: 420, plata: 60, falta: 0, papelAcompana: true });
  });

  it("subir las unidades la descuenta", () => {
    const c = compra();
    const x = cuentaDeLaCorreccion(c, borradores(c, { b: { cantidad: "8" } }));
    expect(x).toMatchObject({ monto: 660, pagado: 660, plata: -180 });
  });

  it("con un adelanto, la plata no se mueve; lo que baja es lo que falta pagar", () => {
    const c = compra({ pagado: 100 });
    const x = cuentaDeLaCorreccion(c, borradores(c, { a: { costo: "40" } }));
    expect(x).toMatchObject({ monto: 420, pagado: 100, plata: 0, falta: 320 });
  });

  it("el adelanto no pasa del monto nuevo", () => {
    const c = compra({ pagado: 400 });
    const x = cuentaDeLaCorreccion(c, borradores(c, { a: { cantidad: "1" }, b: { cantidad: "1" } }));
    expect(x).toMatchObject({ monto: 95, pagado: 95, plata: 305, falta: 0 });
  });

  it("si el papel no cuadraba con las prendas, se queda y la plata no se mueve", () => {
    const c = compra({ monto: 500, pagado: 500, cuadra: false, totalPrendas: 480 });
    const x = cuentaDeLaCorreccion(c, borradores(c, { a: { costo: "40" } }));
    expect(x).toMatchObject({ monto: 500, pagado: 500, plata: 0, papelAcompana: false });
  });

  it("una prenda con un dato que no se entiende no suma a la cuenta", () => {
    const c = compra({ prendas: [prenda("a", { enviadas: 3 }), prenda("b", { cantidad: 4, costo: 45, precioVenta: 149.9 })] });
    const x = cuentaDeLaCorreccion(c, borradores(c, { a: { cantidad: "2" }, b: { costo: "40" } }));
    expect(x).toMatchObject({ datos: 1, prendas: 1 });
  });

  it("sin cambios, todo igual", () => {
    const c = compra();
    expect(cuentaDeLaCorreccion(c, borradores(c))).toMatchObject({ datos: 0, prendas: 0, monto: 480, plata: 0 });
  });
});

describe("textos del pie", () => {
  it("dice qué pasa con la plata y cuántos cambios van", () => {
    expect(textoDeLaPlata(0)).toBe("Tu plata para comprar no cambia");
    expect(textoDeLaPlata(66)).toMatch(/^Tu plata sube S\/ 66\.00$/);
    expect(textoDeLaPlata(-66)).toMatch(/^Tu plata baja S\/ 66\.00$/);
    expect(textoDeCambios(1)).toBe("1 cambio");
    expect(textoDeCambios(3)).toBe("3 cambios");
  });
});
