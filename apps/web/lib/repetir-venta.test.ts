import { describe, it, expect } from "vitest";
import type { VarianteBusqueda } from "@/components/PuntoDeVenta";
import { avisoFaltanDeRepeticion, lineasDelCarritoDesdeVenta } from "./repetir-venta";

const variante = (parcial: Partial<VarianteBusqueda>): VarianteBusqueda =>
  ({
    varianteId: "va",
    referencia: "Blusa Carlita",
    sku: null,
    codigo: "BCA-L-BLA",
    precio: 71.9,
    stockAqui: 3,
    almacenAqui: 0,
    apartadoAqui: 0,
    campana: null,
    ...parcial,
  }) as VarianteBusqueda;

describe("volver a vender (ADR-0230)", () => {
  it("las prendas entran al precio de HOY y juntas si eran la misma variante", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeVenta(
      [
        { varianteId: "va", cantidad: 1, descripcion: "Blusa Carlita · L · Blanco" },
        { varianteId: "va", cantidad: 1, descripcion: "Blusa Carlita · L · Blanco" },
      ],
      [variante({ precio: 79.9 })]
    );
    expect(faltan).toEqual([]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ varianteId: "va", cantidad: 2, precioUnitario: 79.9, descuentoUnitario: 0 });
  });

  it("la cantidad se recorta al piso; lo que no hay se avisa con su razón", () => {
    const { lineas, faltan } = lineasDelCarritoDesdeVenta(
      [
        { varianteId: "va", cantidad: 3, descripcion: "Blusa Carlita · L · Blanco" },
        { varianteId: "vb", cantidad: 1, descripcion: "Polo Básico · Arena" },
        { varianteId: "vc", cantidad: 1, descripcion: "Falda Midi · M" },
        { varianteId: "vx", cantidad: 1, descripcion: "Vestido viejo" },
      ],
      [variante({ stockAqui: 1 }), variante({ varianteId: "vb", stockAqui: 0, almacenAqui: 2 }), variante({ varianteId: "vc", stockAqui: 0 })]
    );
    expect(lineas.map((l) => [l.varianteId, l.cantidad])).toEqual([["va", 1]]);
    expect(faltan).toEqual([
      "Blusa Carlita · L · Blanco (en el piso hay 1 de 3)",
      "Polo Básico · Arena (2 en el almacén)",
      "Falda Midi · M (no hay en esta tienda)",
      "Vestido viejo (ya no está en el catálogo)",
    ]);
  });

  it("el aviso nombra el comprobante de origen; sin faltantes no hay aviso", () => {
    expect(avisoFaltanDeRepeticion({ origen: "B004-000031", faltan: [] })).toBeNull();
    expect(avisoFaltanDeRepeticion({ origen: "B004-000031", faltan: ["X (no hay en esta tienda)"] })).toEqual({
      titulo: "No todo lo de B004-000031 entró al ticket",
      detalle: "X (no hay en esta tienda).",
    });
  });
});
