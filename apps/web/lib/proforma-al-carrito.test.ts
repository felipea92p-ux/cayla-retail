import { describe, expect, it } from "vitest";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { LineaProforma, Proforma } from "./proformas-reglas";
import { avisoFaltanDeProforma, lineasDelCarritoDesdeProforma } from "./proforma-al-carrito";

const variante = (extra: Partial<VarianteBusqueda> = {}): VarianteBusqueda => ({
  varianteId: "v1",
  sku: "S1",
  codigo: "CAS-0001-NEG-M",
  referencia: "Casaca Ximena",
  talla: "M",
  color: "Negro",
  categoria: null,
  precio: 199.9,
  campana: null,
  fotoUrl: null,
  stockAqui: 3,
  codigosBarras: [],
  ...extra,
});

const linea = (extra: Partial<LineaProforma> = {}): LineaProforma => ({
  variante_id: "v1",
  cantidad: 1,
  precio_unitario: 179.9,
  descuento_unitario: 0,
  motivo_descuento: null,
  motivo_descuento_detalle: null,
  descripcion: "Casaca Ximena · M · Negro",
  codigo: "CAS-0001-NEG-M",
  ...extra,
});

const proforma = (items: LineaProforma[]) => ({ id: "p", numero: 123, items }) as unknown as Proforma;

describe("lineasDelCarritoDesdeProforma", () => {
  it("si la prenda subió, entra al precio de hoy con la diferencia como descuento «otro»", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeProforma(proforma([linea()]), [variante()]);
    expect(faltan).toEqual([]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      claveLinea: "v1",
      varianteId: "v1",
      cantidad: 1,
      precioUnitario: 199.9,
      descuentoUnitario: 20,
      razonDescuento: "otro",
      razonDescuentoOtro: "Precio de la proforma PRO-000123",
    });
  });

  it("al mismo precio conserva el descuento y el motivo de la proforma", () => {
    const { lineas } = lineasDelCarritoDesdeProforma(proforma([linea({ descuento_unitario: 17.99, motivo_descuento: "cerrar_venta" })]), [variante({ precio: 179.9 })]);
    expect(lineas[0]).toMatchObject({ precioUnitario: 179.9, descuentoUnitario: 17.99, razonDescuento: "cerrar_venta" });
  });

  it("si la campaña del día deja la prenda más barata, gana la campaña", () => {
    const campana = { etiquetaId: "e", nombre: "Black Friday", pct: 30 };
    const { lineas } = lineasDelCarritoDesdeProforma(proforma([linea({ precio_unitario: 199.9 })]), [variante({ campana })]);
    // 199.90 con 30 % = 139.93 → se cobra 139.90 (ADR-0182: el precio de campaña baja al .90).
    expect(lineas[0]).toMatchObject({ razonDescuento: "campana", descuentoUnitario: 60 });
  });

  it("una prenda que no está en esta tienda (o sin stock) queda en «faltan»", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeProforma(
      proforma([linea({ variante_id: "vX", descripcion: "Blusa Emma · S · Negro" }), linea()]),
      [variante({ stockAqui: 0 })]
    );
    expect(lineas).toEqual([]);
    expect(faltan).toEqual(["Blusa Emma · S · Negro (no hay en esta tienda)", "Casaca Ximena · M · Negro (no hay en esta tienda)"]);
  });

  it("la cantidad no pasa del stock de la tienda, y avisa que faltan unidades", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeProforma(proforma([linea({ cantidad: 5, precio_unitario: 199.9 })]), [variante({ stockAqui: 2 })]);
    expect(lineas[0].cantidad).toBe(2);
    expect(faltan).toEqual(["Casaca Ximena · M · Negro (solo hay 2 de 5)"]);
  });

  it("una proforma de formato anterior no carga nada", () => {
    const vieja = { id: "p", numero: 1, items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 7000 }] } as unknown as Proforma;
    expect(lineasDelCarritoDesdeProforma(vieja, [variante()])).toEqual({ lineas: [], faltan: [], faltanEnAlmacen: false, prometidas: [] });
  });

  it("la prenda que no entró por estar en el almacén conserva el precio prometido para cuando la sumen (no el de etiqueta)", () => {
    // Cotizada a S/ 150; la etiqueta de hoy es S/ 199,90; 0 en el piso y 2 en el almacén.
    const { lineas, prometidas } = lineasDelCarritoDesdeProforma(proforma([linea({ precio_unitario: 150 })]), [variante({ stockAqui: 0, almacenAqui: 2 })]);
    expect(lineas).toEqual([]);
    expect(prometidas).toHaveLength(1);
    expect(prometidas[0]).toMatchObject({ varianteId: "v1", precioUnitario: 199.9, descuentoUnitario: 49.9, razonDescuento: "otro" });
  });

  it("prometidas trae también las que entraron (una línea quitada y vuelta a escanear sigue al precio de la proforma), no las que no existen", () => {
    const { prometidas } = lineasDelCarritoDesdeProforma(proforma([linea({ cantidad: 2 }), linea({ variante_id: "vX" })]), [variante()]);
    expect(prometidas.map((p) => [p.varianteId, p.cantidad])).toEqual([["v1", 2]]);
  });

  it("lo que está en el almacén de esta tienda no entra al ticket, pero se dice cuántas hay ahí (D-40)", () => {
    const soloAlmacen = lineasDelCarritoDesdeProforma(proforma([linea()]), [variante({ stockAqui: 0, almacenAqui: 2 })]);
    expect(soloAlmacen.lineas).toEqual([]);
    expect(soloAlmacen.faltan).toEqual(["Casaca Ximena · M · Negro (2 en el almacén)"]);
    expect(soloAlmacen.faltanEnAlmacen).toBe(true);

    const noAlcanza = lineasDelCarritoDesdeProforma(proforma([linea({ cantidad: 3, precio_unitario: 199.9 })]), [variante({ stockAqui: 1, almacenAqui: 4 })]);
    expect(noAlcanza.lineas[0].cantidad).toBe(1);
    expect(noAlcanza.faltan).toEqual(["Casaca Ximena · M · Negro (en el piso hay 1 de 3; 4 más en el almacén)"]);
    expect(noAlcanza.faltanEnAlmacen).toBe(true);
  });

  it("sin nada en el almacén, el aviso no manda a buscar ahí", () => {
    const { faltanEnAlmacen } = lineasDelCarritoDesdeProforma(proforma([linea()]), [variante({ stockAqui: 0, almacenAqui: 0 })]);
    expect(faltanEnAlmacen).toBe(false);
  });
});

describe("avisoFaltanDeProforma", () => {
  it("todo entró: no hay nada que avisar", () => {
    expect(avisoFaltanDeProforma({ numero: "PRO-000012", faltan: [] })).toBeNull();
  });

  it("sin almacén: cada prenda con su razón, sin mandar a nadie a buscar", () => {
    expect(avisoFaltanDeProforma({ numero: "PRO-000012", faltan: ["Blusa Emma · S (no hay en esta tienda)"], faltanEnAlmacen: false })).toEqual({
      titulo: "No todo lo de PRO-000012 entró al ticket",
      detalle: "Blusa Emma · S (no hay en esta tienda).",
    });
  });

  it("mezcla de almacén y «no hay»: cada una con su razón, y lo del almacén entra al precio de la proforma", () => {
    const { faltan, faltanEnAlmacen } = lineasDelCarritoDesdeProforma(
      proforma([linea(), linea({ variante_id: "v2", descripcion: "Blusa Emma · S · Negro" })]),
      [variante({ stockAqui: 0, almacenAqui: 2 }), variante({ varianteId: "v2", stockAqui: 0, almacenAqui: 0 })],
    );
    expect(avisoFaltanDeProforma({ numero: "PRO-000012", faltan, faltanEnAlmacen })).toEqual({
      titulo: "No todo lo de PRO-000012 entró al ticket",
      detalle:
        "Casaca Ximena · M · Negro (2 en el almacén); Blusa Emma · S · Negro (no hay en esta tienda). Lo del almacén se puede cobrar: que lo bajen en Inventario ▸ Existencias ▸ Reponer y súmalo al ticket; entra al precio de la proforma.",
    });
  });
});
