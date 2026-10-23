import { describe, expect, it } from "vitest";
import { diasDeEspera, hrefPrendasSinLlegar, leerIgvEnEspera, textoPrendasSinLlegar } from "./igv-en-espera-reglas";

// El aviso del IGV (ADR-0362, fase 5b, actividad 4): la lectura de `fn_igv_en_espera` y sus frases.

const soles = (n: number) => `S/\u00a0${n.toFixed(2)}`;

describe("lo que dice fn_igv_en_espera", () => {
  it("lee las dos partes; la que viene nula no es para quien mira", () => {
    const r = leerIgvEnEspera({
      sin_nota: { documentos: 2, facturas: 1, igv: 18, desde: "2026-10-01" },
      faltantes: { prendas: 3, facturas: 2, igv: 10.8, proveedores: 1, proveedor_id: "p1", proveedor: "Hilandería Andina", desde: "2026-10-05T15:00:00Z" },
    })!;
    expect(r.sinNota).toEqual({ documentos: 2, facturas: 1, igv: 18, desde: "2026-10-01" });
    expect(r.faltantes).toMatchObject({ prendas: 3, facturas: 2, igv: 10.8, proveedores: 1, proveedorId: "p1", proveedor: "Hilandería Andina" });
    expect(leerIgvEnEspera({ sin_nota: null, faltantes: null })).toEqual({ sinNota: undefined, faltantes: undefined });
    expect(leerIgvEnEspera(null)).toBeNull();
    expect(leerIgvEnEspera("raro")).toBeNull();
  });
  it("los días de espera, en días de Lima", () => {
    expect(diasDeEspera("2026-10-01", "2026-10-15")).toBe(14);
    // Un instante de las 9 pm de Lima del 14 (2 am UTC del 15) es del 14.
    expect(diasDeEspera("2026-10-15T02:00:00Z", "2026-10-15")).toBe(1);
    expect(diasDeEspera(null, "2026-10-15")).toBeNull();
  });
});

describe("las frases del aviso", () => {
  it("las prendas que no llegaron o se devolvieron por daño: su IGV está en el crédito fiscal sin la mercadería", () => {
    expect(textoPrendasSinLlegar({ prendas: 3, facturas: 2, igv: 10.8 }, soles)).toEqual({
      detalle: "3 prendas de 2 facturas no llegaron o se devolvieron por daño: su IGV (S/\u00a010.80) está en tu crédito fiscal sin la mercadería. Anota que llegaron o pásalas a saldo a favor.",
      ahora: "Resuelve 3 prendas que te deben",
    });
    expect(textoPrendasSinLlegar({ prendas: 1, facturas: 1, igv: 3.6 }, soles).detalle).toBe(
      "1 prenda de 1 factura no llegó o se devolvió por daño: su IGV (S/\u00a03.60) está en tu crédito fiscal sin la mercadería. Anota que llegó o pásala a saldo a favor.",
    );
    expect(textoPrendasSinLlegar({ prendas: 0, facturas: 0, igv: 0 }, soles).ahora).toBe("");
  });
  it("lleva a la ficha si es un solo proveedor; si no, al directorio", () => {
    expect(hrefPrendasSinLlegar({ proveedores: 1, proveedorId: "p1" })).toBe("/compras/proveedores/p1");
    expect(hrefPrendasSinLlegar({ proveedores: 2, proveedorId: null })).toBe("/compras/proveedores");
  });
});
