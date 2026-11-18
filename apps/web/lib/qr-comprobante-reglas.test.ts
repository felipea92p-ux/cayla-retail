import { describe, expect, it } from "vitest";
import { validarRuc } from "@cayla-retail/shared";
import { avisosDelQr, leerQrComprobante, resumenDelQr, serieNumeroDelQr } from "./qr-comprobante-reglas";

// Un RUC de emisor que pasa el dígito verificador (el de Luz del Sur, público).
const EMISOR = "20331898008";
const CAYLA = "20601234567";
const FACTURA = `${EMISOR}|01|F001|00000288|72.00|472.00|2026-10-29|6|${CAYLA}|`;

describe("leerQrComprobante", () => {
  it("el RUC de prueba es válido", () => expect(validarRuc(EMISOR).valido).toBe(true));
  it("lee una factura", () => {
    expect(leerQrComprobante(FACTURA)).toEqual({
      rucEmisor: EMISOR,
      tipo: "factura",
      serie: "F001",
      numero: "288",
      igv: 72,
      total: 472,
      fecha: "2026-10-29",
      comprador: { tipo: "6", numero: CAYLA },
    });
  });
  it("lee una boleta sin documento del comprador", () => {
    const qr = leerQrComprobante(`${EMISOR}|03|B001|00000002|18.00|118.00|2026-09-18|-|-|`);
    expect(qr?.tipo).toBe("boleta");
    expect(qr?.comprador).toBeNull();
  });
  it("aguanta espacios, saltos de línea, la serie en minúsculas, la fecha peruana y lo que viene después (resumen, firma)", () => {
    const qr = leerQrComprobante(`  ${EMISOR} | 01 | f001 | 288 | 72.00 | 472.00 | 29/10/2026 | 6 | ${CAYLA} | abc123= | firma \n`);
    expect(qr && serieNumeroDelQr(qr)).toBe("F001-288");
    expect(qr?.fecha).toBe("2026-10-29");
  });
  it.each([
    ["una etiqueta de prenda", "CMS-0001-NEG-M"],
    ["un enlace", "https://cayla.pe/club/123"],
    ["un RUC que no existe", `20331898009|01|F001|288|72.00|472.00|2026-10-29|6|${CAYLA}|`],
    ["otro tipo de documento (nota de crédito)", `${EMISOR}|07|F001|288|72.00|472.00|2026-10-29|6|${CAYLA}|`],
    ["una serie rara", `${EMISOR}|01|F1|288|72.00|472.00|2026-10-29|6|${CAYLA}|`],
    ["un número con letras", `${EMISOR}|01|F001|28A|72.00|472.00|2026-10-29|6|${CAYLA}|`],
    ["un IGV mayor que el total", `${EMISOR}|01|F001|288|500.00|472.00|2026-10-29|6|${CAYLA}|`],
    ["un total en cero", `${EMISOR}|01|F001|288|0.00|0.00|2026-10-29|6|${CAYLA}|`],
    ["una fecha imposible", `${EMISOR}|01|F001|288|72.00|472.00|2026-02-30|6|${CAYLA}|`],
    ["le faltan partes", `${EMISOR}|01|F001|288|72.00`],
  ])("no lee %s", (_n, texto) => expect(leerQrComprobante(texto)).toBeNull());
});

describe("avisosDelQr (avisa, no frena)", () => {
  const qr = leerQrComprobante(FACTURA)!;
  it("a nombre de CAYLA y con el mismo monto, nada que avisar", () => expect(avisosDelQr(qr, { monto: 472, rucEmpresa: CAYLA })).toEqual([]));
  it("un monto distinto se avisa", () => {
    const a = avisosDelQr(qr, { monto: 4720, rucEmpresa: CAYLA });
    expect(a.map((x) => x.titulo)).toEqual(["El monto no coincide"]);
    expect(a[0]!.texto).toMatch(/S\/ 472\.00.*S\/ 4,720\.00/);
  });
  it("a nombre de otro RUC se avisa, y se dice que CLAURE en Lima está bien", () => {
    const a = avisosDelQr(leerQrComprobante(FACTURA.replace(CAYLA, "20999999999"))!, { monto: null, rucEmpresa: CAYLA });
    expect(a[0]!.titulo).toBe("No está a nombre de CAYLA");
    expect(a[0]!.texto).toMatch(/RUC 20999999999.*CLAURE en Lima, está bien/);
  });
  it("a nombre de una persona se avisa", () => {
    const a = avisosDelQr(leerQrComprobante(FACTURA.replace(`|6|${CAYLA}|`, "|1|45678912|"))!, { monto: null, rucEmpresa: CAYLA });
    expect(a[0]!.texto).toMatch(/una persona \(45678912\)/);
  });
  it("una boleta no se compara (no trae IGV), ni se compara sin el RUC de la empresa", () => {
    const boleta = leerQrComprobante(`${EMISOR}|03|B001|2|18.00|118.00|2026-09-18|1|45678912|`)!;
    expect(avisosDelQr(boleta, { monto: 118, rucEmpresa: CAYLA })).toEqual([]);
    expect(avisosDelQr(leerQrComprobante(FACTURA.replace(CAYLA, "20999999999"))!, { monto: 472, rucEmpresa: null })).toEqual([]);
  });
});

describe("resumenDelQr", () => {
  it("en una línea", () => {
    expect(resumenDelQr(leerQrComprobante(FACTURA)!, (iso) => iso.slice(8))).toBe("Factura F001-288 · S/ 472.00 · IGV S/ 72.00 · 29");
  });
});
