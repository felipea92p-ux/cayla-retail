import { describe, expect, it } from "vitest";
import { busquedaDesdeLectura, hrefPedirTraslado, sedesDeOrigen, textoTicketCambio } from "./cambios-atajos-reglas";

describe("busquedaDesdeLectura", () => {
  it("la etiqueta de una prenda se busca tal cual", () => {
    expect(busquedaDesdeLectura("  CMS-0001-NEG-M \n")).toBe("CMS-0001-NEG-M");
  });

  it("el QR de SUNAT de una boleta se busca por serie y número", () => {
    expect(busquedaDesdeLectura("20612345678|03|B004|00000031|15.25|98.00|2026-09-26|1|33333333|")).toBe("B004-31");
  });

  it("el de una factura también", () => {
    expect(busquedaDesdeLectura("20612345678|01|F001|00000120|18.00|118.00|2026-09-26|6|20111111111|")).toBe("F001-120");
  });

  it("un texto con barras que no es de SUNAT no se toca", () => {
    expect(busquedaDesdeLectura("hola|mundo|B004|1")).toBe("hola|mundo|B004|1");
    expect(busquedaDesdeLectura("20612345678|03|B004|cero")).toBe("20612345678|03|B004|cero");
  });
});

describe("sedesDeOrigen", () => {
  const sedes = [
    { id: "aqp", nombre: "Tienda AQP" },
    { id: "lim", nombre: "Tienda LIM" },
    { id: "alm", nombre: "Almacén LIM" },
  ];

  it("cruza el nombre corto con el id y respeta el orden", () => {
    expect(
      sedesDeOrigen(
        [
          { sede: "AQP", cantidad: 2 },
          { sede: "Almacén LIM", cantidad: 1 },
        ],
        sedes,
      ),
    ).toEqual([
      { id: "aqp", sede: "AQP", cantidad: 2 },
      { id: "alm", sede: "Almacén LIM", cantidad: 1 },
    ]);
  });

  it("una sede que no se reconoce o sin unidades no se ofrece", () => {
    expect(
      sedesDeOrigen(
        [
          { sede: "Cusco", cantidad: 3 },
          { sede: "LIM", cantidad: 0 },
        ],
        sedes,
      ),
    ).toEqual([]);
  });
});

describe("hrefPedirTraslado", () => {
  it("prellena origen, destino, prenda y cantidad (mínimo 1)", () => {
    expect(hrefPedirTraslado("aqp", "tru", "v1", 0)).toBe("/inventario/mover?origen=aqp&destino=tru&variante=v1&cantidad=1");
    expect(hrefPedirTraslado("aqp", "tru", "v1", 2)).toBe("/inventario/mover?origen=aqp&destino=tru&variante=v1&cantidad=2");
  });
});

describe("textoTicketCambio", () => {
  const base = { operacion: "3F9A21C0", comprobante: "Boleta B004-000031", devolvio: "Blusa Valentina · S", sellevo: "Blusa Valentina · M", sede: "Tienda TRU" };

  it("sin diferencia lo dice y aclara que no es comprobante", () => {
    const t = textoTicketCambio({ ...base, diferencia: 0 });
    expect(t).toContain("Cambio N.º 3F9A21C0 · de la Boleta B004-000031");
    expect(t).toContain("Sin diferencia de precio");
    expect(t).toContain("no es un comprobante de pago");
  });

  it("lo cobrado y lo devuelto, en palabras de la clienta", () => {
    expect(textoTicketCambio({ ...base, diferencia: 20 })).toContain("Pagaste S/ 20.00 de diferencia");
    expect(textoTicketCambio({ ...base, comprobante: null, diferencia: -15.5 })).toContain("Te devolvimos S/ 15.50");
  });
});
