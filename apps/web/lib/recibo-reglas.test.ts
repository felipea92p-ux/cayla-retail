import { describe, it, expect } from "vitest";
import { armarRecibo, fechaHoraLima, montoEnLetras, textoNumeroRecibo, textoQrSunat } from "./recibo-reglas";

// El comprobante impreso es lo que la clienta se lleva y lo que SUNAT puede cotejar: si un
// número acá se descuadra por un centavo, el papel y la base dicen cosas distintas.

const comprobante = { tipo: "boleta", serie: "B001", numero: 2, created_at: "2026-09-18T19:32:00Z" } as const;

describe("armarRecibo — lo que se imprime sale de la venta que se cobró", () => {
  const recibo = armarRecibo({
    comprobante,
    sede: "Tienda Lima",
    cliente: { tipoDoc: "dni", numDoc: "12345678", nombre: "Ana Pérez" },
    lineas: [
      { cantidad: 1, referencia: "Vestido Sofía", codigo: "VES-0001-NEG-M", precioUnitario: 149.9, descuentoUnitario: 0 },
      { cantidad: 1, referencia: "Pantalón Carla", codigo: "PAN-0001-NEG-30", precioUnitario: 99.9, descuentoUnitario: 9.99 },
    ],
    pagos: [
      { metodo: "efectivo", monto: 100, recibido: 150 },
      { metodo: "yape", monto: 139.81 },
      { metodo: "tarjeta", monto: 0 },
    ],
    tasaIgv: 0.18,
  });

  it("el total es la suma de los importes (con el descuento por unidad ya aplicado)", () => {
    expect(recibo.lineas.map((l) => l.importe)).toEqual([149.9, 89.91]);
    expect(recibo.total).toBe(239.81);
  });

  it("subtotal + IGV = total al centavo, igual que el comprobante", () => {
    expect(recibo.subtotal).toBe(203.23);
    expect(recibo.igv).toBe(36.58);
    expect(Math.round((recibo.subtotal + recibo.igv) * 100)).toBe(Math.round(recibo.total * 100));
  });

  it("solo salen los medios que cubrieron algo, y el vuelto es solo del efectivo", () => {
    expect(recibo.pagos.map((p) => p.metodo)).toEqual(["efectivo", "yape"]);
    expect(recibo.pagos[0]).toMatchObject({ recibido: 150, vuelto: 50 });
    expect(recibo.pagos[1]).toMatchObject({ recibido: null, vuelto: 0 });
    expect(recibo.vueltoTotal).toBe(50);
  });
});

describe("textoNumeroRecibo", () => {
  it("serie y número de 6 dígitos", () => {
    expect(textoNumeroRecibo({ serie: "B001", numero: 2 })).toBe("B001-000002");
    expect(textoNumeroRecibo({ serie: "F001", numero: 123456 })).toBe("F001-123456");
  });
});

describe("fechaHoraLima — siempre hora de Lima", () => {
  it("19:32 UTC son las 14:32 en Lima, mismo día", () => {
    expect(fechaHoraLima("2026-09-18T19:32:00Z")).toEqual({ fecha: "18/09/2026", hora: "14:32", fechaIso: "2026-09-18" });
  });
  it("02:30 UTC del 19 todavía es el 18 en Lima (UTC−5)", () => {
    const r = fechaHoraLima("2026-09-19T02:30:00Z");
    expect(r.fechaIso).toBe("2026-09-18");
    expect(r.hora).toBe("21:30");
  });
});

describe("textoQrSunat — el orden que pide SUNAT", () => {
  const base = armarRecibo({
    comprobante,
    sede: "Tienda Lima",
    cliente: { tipoDoc: "dni", numDoc: "12345678", nombre: null },
    lineas: [{ cantidad: 1, referencia: "Blusa", codigo: null, precioUnitario: 118, descuentoUnitario: 0 }],
    pagos: [{ metodo: "efectivo", monto: 118 }],
    tasaIgv: 0.18,
  });

  it("boleta con DNI", () => {
    expect(textoQrSunat(base, "20123456789")).toBe("20123456789|03|B001|00000002|18.00|118.00|2026-09-18|1|12345678|");
  });
  it("factura con RUC", () => {
    const f = { ...base, tipo: "factura" as const, serie: "F001", cliente: { tipoDoc: "ruc" as const, numDoc: "20555555551", nombre: "ACME SAC" } };
    expect(textoQrSunat(f, "20123456789")).toBe("20123456789|01|F001|00000002|18.00|118.00|2026-09-18|6|20555555551|");
  });
  it("boleta sin documento usa «-»", () => {
    const s = { ...base, cliente: { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null } };
    expect(textoQrSunat(s, "20123456789")).toBe("20123456789|03|B001|00000002|18.00|118.00|2026-09-18|-|-|");
  });
});

describe("montoEnLetras — «SON: …»", () => {
  it.each([
    [0, "CERO CON 00/100 SOLES"],
    [1, "UNO CON 00/100 SOLES"],
    [15.5, "QUINCE CON 50/100 SOLES"],
    [21, "VEINTIUNO CON 00/100 SOLES"],
    [30, "TREINTA CON 00/100 SOLES"],
    [99.9, "NOVENTA Y NUEVE CON 90/100 SOLES"],
    [100, "CIEN CON 00/100 SOLES"],
    [101, "CIENTO UNO CON 00/100 SOLES"],
    [239.81, "DOSCIENTOS TREINTA Y NUEVE CON 81/100 SOLES"],
    [374.7, "TRESCIENTOS SETENTA Y CUATRO CON 70/100 SOLES"],
    [1000, "MIL CON 00/100 SOLES"],
    [1234.56, "MIL DOSCIENTOS TREINTA Y CUATRO CON 56/100 SOLES"],
    [2000, "DOS MIL CON 00/100 SOLES"],
    [21000, "VEINTIUN MIL CON 00/100 SOLES"],
    [101000, "CIENTO UN MIL CON 00/100 SOLES"],
  ])("%s", (monto, esperado) => {
    expect(montoEnLetras(monto)).toBe(esperado);
  });

  it("redondea el flotante a centavos, no lo arrastra (0.1 + 0.2)", () => {
    expect(montoEnLetras(0.1 + 0.2)).toBe("CERO CON 30/100 SOLES");
  });
});

describe("armarRecibo — detalle opcional por línea (talla · color)", () => {
  const base = {
    comprobante,
    sede: "Tienda Lima",
    cliente: { tipoDoc: "sin_documento" as const, numDoc: null, nombre: null },
    pagos: [{ metodo: "efectivo" as const, monto: 50 }],
    tasaIgv: 0.18,
  };

  it("lo lleva a la línea cuando viene", () => {
    const r = armarRecibo({ ...base, lineas: [{ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario: 50, descuentoUnitario: 0, detalle: "M · Negro" }] });
    expect(r.lineas[0]?.detalle).toBe("M · Negro");
  });

  it("no agrega la clave cuando no viene (el ticket y sus pruebas no cambian)", () => {
    const r = armarRecibo({ ...base, lineas: [{ cantidad: 1, referencia: "Polo Zoe", codigo: "POL-1", precioUnitario: 50, descuentoUnitario: 0 }] });
    expect(r.lineas[0]).not.toHaveProperty("detalle");
  });
});
