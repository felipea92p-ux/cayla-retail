import { describe, expect, it } from "vitest";
import {
  aplicarAlApartado,
  descuentoParaGuardar,
  descuentosVigentes,
  lineaDescontada,
  lineasSiSeAplica,
  pideArgumento,
  quitarDelApartado,
  totalDescontado,
  type PrendaDescontable,
} from "./apartar-descuento-reglas";
import { totalDeLineas } from "./vender-reglas";

// El descuento a mano al apartar hace las MISMAS cuentas que el ticket de Vender (ADR-0584): estas pruebas fijan que Apartar no
// tenga su propia versión del %, del monto repartido ni de «gana la campaña».

const blusa: PrendaDescontable = { varianteId: "blusa", precio: 89.9 };
const vestido: PrendaDescontable = { varianteId: "vestido", precio: 159.9, campana: { etiquetaId: "e1", nombre: "Aniversario", pct: 20 } };
const prendas = new Map([blusa, vestido].map((p) => [p.varianteId, p]));
const detalle = { razon: "cerrar_venta", razonOtro: "", argumento: "" };

describe("lineaDescontada", () => {
  it("sin descuento a mano lleva su campaña, o nada", () => {
    expect(lineaDescontada(blusa, 1).descuentoUnitario).toBe(0);
    const v = lineaDescontada(vestido, 1);
    expect(v.razonDescuento).toBe("campana");
    expect(v.descuentoUnitario).toBe(32); // 159.90 × 80 % = 127.92 → 127.90
  });

  it("el descuento a mano gana solo si supera a la campaña", () => {
    expect(lineaDescontada(vestido, 1, { unitario: 20, razon: "cerrar_venta", razonOtro: "", argumento: "" }).razonDescuento).toBe("campana");
    const mayor = lineaDescontada(vestido, 1, { unitario: 50, razon: "cerrar_venta", razonOtro: "", argumento: "x" });
    expect(mayor.descuentoUnitario).toBe(50);
    expect(mayor.razonDescuento).toBe("cerrar_venta");
  });

  it("nunca descuenta más que el precio", () => {
    expect(lineaDescontada(blusa, 1, { unitario: 500, razon: "otro", razonOtro: "x", argumento: "y" }).descuentoUnitario).toBe(89.9);
  });
});

describe("aplicarAlApartado", () => {
  const lineas = [lineaDescontada(blusa, 2), lineaDescontada(vestido, 1)];

  it("en % usa la cuenta de Vender: precio final sin céntimos sueltos", () => {
    const d = aplicarAlApartado(lineas, "porcentaje", 20, ["blusa"], detalle);
    expect(d.blusa).toEqual({ unitario: 18, razon: "cerrar_venta", razonOtro: "", argumento: "" }); // 89.90 → 71.90
    expect(d.vestido).toBeUndefined();
  });

  it("donde la campaña da igual o más, gana la campaña y no queda descuento a mano", () => {
    const d = aplicarAlApartado(lineas, "porcentaje", 10, ["blusa", "vestido"], detalle);
    expect(d.blusa?.unitario).toBe(9); // 89.90 → 80.90
    expect(d.vestido).toBeUndefined();
  });

  it("en S/ el monto es del total de lo elegido, repartido según el precio", () => {
    const d = aplicarAlApartado(lineas, "monto", 30, ["blusa"], detalle);
    // Dos unidades de la blusa: S/ 15 cada una.
    expect(d.blusa?.unitario).toBe(15);
  });

  it("lo que no se eligió conserva su descuento a mano", () => {
    const conBlusa = [lineaDescontada(blusa, 1, { unitario: 10, razon: "liquidacion_temporada", razonOtro: "", argumento: "" }), lineaDescontada(vestido, 1)];
    const d = aplicarAlApartado(conBlusa, "porcentaje", 40, ["vestido"], { ...detalle, argumento: "Clienta de siempre" });
    expect(d.blusa?.razon).toBe("liquidacion_temporada");
    expect(d.vestido?.razon).toBe("cerrar_venta");
  });

  it("el «Otro» guarda su detalle", () => {
    const d = aplicarAlApartado(lineas, "porcentaje", 5, ["blusa"], { razon: "otro", razonOtro: "Botón flojo", argumento: "" });
    expect(d.blusa?.razonOtro).toBe("Botón flojo");
  });
});

describe("quitar y vigentes", () => {
  const d = { blusa: { unitario: 9, razon: "cerrar_venta", razonOtro: "", argumento: "" } };
  it("quitar deja la prenda con su campaña o su precio", () => {
    expect(quitarDelApartado(d, ["blusa"])).toEqual({});
  });
  it("una prenda que sale del apartado se lleva su descuento", () => {
    expect(descuentosVigentes(d, ["vestido"])).toEqual({});
    expect(descuentosVigentes(d, ["blusa"])).toEqual(d);
  });
});

describe("pideArgumento", () => {
  const lineas = [lineaDescontada(blusa, 1), lineaDescontada(vestido, 1)];
  it("el 15 % justo no lo pide; más, sí", () => {
    expect(pideArgumento(lineas, "porcentaje", 15, ["blusa"])).toBe(false);
    expect(pideArgumento(lineas, "porcentaje", 16, ["blusa"])).toBe(true);
  });
  it("donde gana la campaña no cuenta", () => {
    expect(pideArgumento(lineas, "porcentaje", 18, ["vestido"])).toBe(false);
  });
});

describe("lo que se guarda y se muestra", () => {
  it("la campaña viaja sin motivo; el descuento a mano, con motivo y argumento", () => {
    expect(descuentoParaGuardar(lineaDescontada(vestido, 1))).toEqual({ descuento_unitario: 32 });
    const manual = lineaDescontada(blusa, 1, { unitario: 30, razon: "otro", razonOtro: "Mancha", argumento: "Se lava" });
    expect(descuentoParaGuardar(manual)).toEqual({
      descuento_unitario: 30,
      motivo_descuento: "otro",
      motivo_descuento_detalle: "Mancha",
      argumento_descuento: "Se lava",
    });
  });

  it("el total descontado y el total cuadran al céntimo", () => {
    const lineas = lineasSiSeAplica([lineaDescontada(blusa, 3), lineaDescontada(vestido, 1)], prendas, "porcentaje", 20, ["blusa"], detalle);
    expect(totalDescontado(lineas)).toBe(86); // 3 × 18.00 + 32.00
    expect(totalDeLineas(lineas)).toBe(343.6); // 3 × 71.90 + 127.90
  });
});
