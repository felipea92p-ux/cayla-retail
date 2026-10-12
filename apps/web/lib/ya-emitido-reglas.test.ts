import { describe, expect, it } from "vitest";
import { decidirYaEmitido, diferenciasConLucode, esYaEmitido, leerXmlComprobante, type NuestroComprobante } from "./ya-emitido-reglas";
import { xmlDePrueba } from "./ya-emitido-fixture";

// ADR-0378. Lo que Lucode contesta cuando un número ya lo tiene, y cómo se confirma que es NUESTRA boleta antes de
// darla por declarada. Los textos de Lucode son los vistos en producción el 2026-10-10 y 2026-10-12.

describe("esYaEmitido", () => {
  it("reconoce el texto real de Lucode (boleta y factura)", () => {
    expect(esYaEmitido("ERROR: La boleta B004-148 fue emitido anteriormente.")).toBe(true);
    expect(esYaEmitido("ERROR: La factura F005-13 fue emitida anteriormente.")).toBe(true);
    expect(esYaEmitido("la boleta b005-262 FUE EMITIDO ANTERIORMENTE")).toBe(true);
  });

  it("un rechazo de verdad no es «ya emitido»", () => {
    expect(esYaEmitido("El número de documento del cliente no es válido")).toBe(false);
    expect(esYaEmitido("La fecha de emisión puede ser hoy o hasta 5 días previos")).toBe(false);
    expect(esYaEmitido("")).toBe(false);
    expect(esYaEmitido(null)).toBe(false);
    expect(esYaEmitido(undefined)).toBe(false);
  });

  it("si nombra un número, tiene que ser el nuestro (con o sin ceros a la izquierda)", () => {
    expect(esYaEmitido("ERROR: La boleta B005-262 fue emitido anteriormente.", "B005", 262)).toBe(true);
    expect(esYaEmitido("ERROR: La boleta B005-000262 fue emitido anteriormente.", "B005", 262)).toBe(true);
    expect(esYaEmitido("ERROR: La boleta B005-263 fue emitido anteriormente.", "B005", 262)).toBe(false);
    expect(esYaEmitido("ERROR: La boleta B004-262 fue emitido anteriormente.", "B005", 262)).toBe(false);
    // Sin número en el texto, basta la frase.
    expect(esYaEmitido("El documento fue emitido anteriormente", "B005", 262)).toBe(true);
  });
});

describe("leerXmlComprobante", () => {
  it("lee la boleta como la firma Lucode, sin confundirse con la firma ni con el RUC del emisor", () => {
    expect(leerXmlComprobante(xmlDePrueba())).toEqual({
      raiz: "Invoice",
      serie: "B005",
      numero: 262,
      fecha: "2026-10-09",
      tipoCodigo: "03",
      moneda: "PEN",
      total: 15,
      clienteCodigo: "1",
      clienteNumero: "99999999",
      lineas: 1,
    });
  });

  it("factura con RUC, varias líneas y el número del cliente en CDATA", () => {
    const x = leerXmlComprobante(
      xmlDePrueba({ id: "F005-13", tipoCodigo: "01", clienteCodigo: "6", clienteNumero: "20123456789", clienteEnCdata: true, lineas: 3, total: "350.40" }),
    );
    expect(x).toMatchObject({ serie: "F005", numero: 13, tipoCodigo: "01", clienteCodigo: "6", clienteNumero: "20123456789", lineas: 3, total: 350.4 });
  });

  it("nota de crédito: otra raíz y otras líneas", () => {
    expect(leerXmlComprobante(xmlDePrueba({ raiz: "CreditNote", id: "BC01-1", lineas: 2 }))).toMatchObject({ raiz: "CreditNote", tipoCodigo: null, lineas: 2 });
  });

  it("si falta lo que identifica al documento, no confirma nada (null)", () => {
    expect(leerXmlComprobante("")).toBeNull();
    expect(leerXmlComprobante("<html>Not found</html>")).toBeNull();
    expect(leerXmlComprobante(xmlDePrueba({ lineas: 0 }))).toBeNull();
    expect(leerXmlComprobante(xmlDePrueba({ total: "quince" }))).toBeNull();
    expect(leerXmlComprobante(xmlDePrueba({ fecha: "09/10/2026" }))).toBeNull();
    expect(leerXmlComprobante(xmlDePrueba({ id: "SIN-NUMERO" }))).toBeNull();
    expect(leerXmlComprobante(xmlDePrueba().replace(/<cac:AccountingCustomerParty>[\s\S]*<\/cac:AccountingCustomerParty>/, ""))).toBeNull();
  });
});

const NUESTRA: NuestroComprobante = {
  tipo: "boleta",
  serie: "B005",
  numero: 262,
  fecha: "2026-10-09",
  moneda: "PEN",
  total: 15,
  clienteTipoDoc: "sin_documento",
  clienteNumDoc: null,
  lineas: 1,
};
const leer = (o: Parameters<typeof xmlDePrueba>[0] = {}) => leerXmlComprobante(xmlDePrueba(o))!;

describe("diferenciasConLucode", () => {
  it("la misma boleta: sin diferencias", () => {
    expect(diferenciasConLucode(NUESTRA, leer())).toEqual([]);
  });

  it("con DNI: mismo número y código «1»", () => {
    const conDni = { ...NUESTRA, clienteTipoDoc: "dni" as const, clienteNumDoc: "71234482" };
    expect(diferenciasConLucode(conDni, leer({ clienteNumero: "71234482" }))).toEqual([]);
    expect(diferenciasConLucode(conDni, leer({ clienteNumero: "71234483" }))).toEqual(["otro cliente"]);
    // Un DNI en el ERP contra el comodín en Lucode: es otro documento.
    expect(diferenciasConLucode(conDni, leer())).toEqual(["otro cliente"]);
  });

  it("pasaporte: no importan las mayúsculas, sí el código del catálogo 06", () => {
    const pasaporte = { ...NUESTRA, clienteTipoDoc: "pasaporte" as const, clienteNumDoc: "ab123456" };
    expect(diferenciasConLucode(pasaporte, leer({ clienteCodigo: "7", clienteNumero: "AB123456" }))).toEqual([]);
    expect(diferenciasConLucode(pasaporte, leer({ clienteCodigo: "4", clienteNumero: "AB123456" }))).toEqual(["otro cliente"]);
  });

  it("cada dato distinto se nombra, sin el número del cliente", () => {
    const d = diferenciasConLucode(NUESTRA, leer({ total: "20.00", fecha: "2026-10-08", lineas: 2, clienteNumero: "44556677" }));
    expect(d).toEqual([
      "otra fecha (2026-10-08 en Lucode, 2026-10-09 aquí)",
      "otro total (S/ 20.00 en Lucode, S/ 15.00 aquí)",
      "otro cliente",
      "otras líneas (2 en Lucode, 1 aquí)",
    ]);
    expect(d.join(" ")).not.toContain("44556677");
  });

  it("un céntimo de diferencia ya es otro documento; el redondeo binario no", () => {
    expect(diferenciasConLucode({ ...NUESTRA, total: 0.1 + 0.2 }, leer({ total: "0.30" }))).toEqual([]);
    expect(diferenciasConLucode(NUESTRA, leer({ total: "15.01" }))).toEqual(["otro total (S/ 15.01 en Lucode, S/ 15.00 aquí)"]);
  });

  it("tipo, número y moneda", () => {
    expect(diferenciasConLucode(NUESTRA, leer({ tipoCodigo: "01" }))).toEqual(["otro tipo de documento"]);
    expect(diferenciasConLucode(NUESTRA, leer({ raiz: "CreditNote" }))).toEqual(["otro tipo de documento"]);
    expect(diferenciasConLucode(NUESTRA, leer({ id: "B005-263" }))).toEqual(["otro número (B005-263)"]);
    expect(diferenciasConLucode(NUESTRA, leer({ moneda: "USD" }))).toEqual(["otra moneda (USD en Lucode, PEN aquí)"]);
    expect(diferenciasConLucode({ ...NUESTRA, tipo: "nota_credito", serie: "BC01", numero: 1 }, leer({ raiz: "CreditNote", id: "BC01-1" }))).toEqual([]);
  });
});

describe("decidirYaEmitido", () => {
  it("primero se confirma que es la nuestra: sin XML legible no se escribe, aunque SUNAT diga ACEPTADO", () => {
    expect(decidirYaEmitido("B005-262", "ACEPTADO", null, null)).toMatchObject({ tipo: "sin_confirmar" });
  });

  it("otro documento con nuestro número: número ocupado, nunca «aceptado»", () => {
    const d = decidirYaEmitido("B005-262", "ACEPTADO", null, ["otro total (S/ 20.00 en Lucode, S/ 15.00 aquí)"]);
    expect(d).toEqual({
      tipo: "numero_ocupado",
      detalle: "B005-262 ya existe en Lucode con otro total (S/ 20.00 en Lucode, S/ 15.00 aquí).",
      enCola: "otro total (S/ 20.00 en Lucode, S/ 15.00 aquí)",
    });
  });

  it("la nuestra: el estado de SUNAT, tal cual", () => {
    expect(decidirYaEmitido("B005-262", "ACEPTADO", "ok", [])).toEqual({ tipo: "guardar", estado: "aceptado", motivoRechazo: null });
    expect(decidirYaEmitido("B005-262", "PENDIENTE", null, [])).toEqual({ tipo: "guardar", estado: "enviado", motivoRechazo: null });
    expect(decidirYaEmitido("B005-262", "RECHAZADO", "El DNI no existe", [])).toEqual({ tipo: "guardar", estado: "rechazado", motivoRechazo: "El DNI no existe" });
    expect(decidirYaEmitido("B005-262", "RECHAZADO", "  ", [])).toMatchObject({ estado: "rechazado", motivoRechazo: "SUNAT lo rechazó (visto al consultar su estado)." });
  });
});
