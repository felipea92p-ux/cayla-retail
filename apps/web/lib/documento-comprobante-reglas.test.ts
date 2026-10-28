import { describe, expect, it } from "vitest";
import { tipoDocumentoDeCliente } from "./comprobantes-reglas";
import {
  CODIGO_SUNAT_DOCUMENTO,
  documentoLegibleComprobante,
  esTipoDocComprobante,
  ETIQUETA_DOCUMENTO_COMPROBANTE,
  llevaDocumento,
  problemaDocumentoComprobante,
  tipoDocDelComprobante,
} from "./documento-comprobante-reglas";

// El documento de quien compra en un comprobante (ADR-0288 D-3, tanda 1e). Esta tabla la leen el envío a Lucode, el QR del
// papel, el papel y el registro de ventas: un código equivocado aquí es una boleta rechazada por SUNAT o un registro mal
// declarado, así que se fija valor por valor.

describe("catálogo 06 de SUNAT", () => {
  it("1 DNI, 4 carné de extranjería, 6 RUC, 7 pasaporte — y nada más", () => {
    expect(CODIGO_SUNAT_DOCUMENTO).toEqual({ dni: "1", carne_extranjeria: "4", ruc: "6", pasaporte: "7" });
  });
  it("cómo se lee delante del número: DNI, CE, RUC, Pasaporte", () => {
    expect(ETIQUETA_DOCUMENTO_COMPROBANTE).toEqual({ dni: "DNI", carne_extranjeria: "CE", ruc: "RUC", pasaporte: "Pasaporte" });
  });
});

describe("los tipos que acepta el comprobante (candado comprobantes_cliente_tipo_doc_check)", () => {
  it("los cinco de la base, y ningún otro", () => {
    for (const t of ["dni", "ruc", "carne_extranjeria", "pasaporte", "sin_documento"]) expect(esTipoDocComprobante(t)).toBe(true);
    for (const t of ["DNI", "carnet", "ce", "", null, undefined]) expect(esTipoDocComprobante(t)).toBe(false);
  });
});

describe("llevaDocumento y documentoLegibleComprobante", () => {
  it("con tipo y número, se lee con su etiqueta", () => {
    expect(documentoLegibleComprobante("carne_extranjeria", "001234567")).toBe("CE 001234567");
    expect(documentoLegibleComprobante("pasaporte", "AB123456")).toBe("Pasaporte AB123456");
    expect(documentoLegibleComprobante("dni", "71234482")).toBe("DNI 71234482");
    expect(documentoLegibleComprobante("ruc", "20100070970")).toBe("RUC 20100070970");
  });
  it("sin documento, o un tipo sin número, no identifica a nadie", () => {
    expect(llevaDocumento("sin_documento", "71234482")).toBe(false);
    expect(llevaDocumento("pasaporte", null)).toBe(false);
    expect(llevaDocumento("dni", "")).toBe(false);
    expect(documentoLegibleComprobante("sin_documento", null)).toBeNull();
  });
});

describe("qué tipo lleva el comprobante (tipoDocDelComprobante, y tipoDocumentoDeCliente que la usa)", () => {
  it("una factura SIEMPRE va al RUC, elija lo que elija la caja", () => {
    expect(tipoDocDelComprobante("factura", "20100070970", "pasaporte")).toBe("ruc");
    expect(tipoDocDelComprobante("factura", "", "carne_extranjeria")).toBe("ruc");
  });
  it("una boleta o nota de venta lleva el documento de identidad elegido si tiene número (DNI por defecto)", () => {
    expect(tipoDocDelComprobante("boleta", "001234567", "carne_extranjeria")).toBe("carne_extranjeria");
    expect(tipoDocDelComprobante("boleta", "AB123456", "pasaporte")).toBe("pasaporte");
    expect(tipoDocDelComprobante("nota_venta", "AB123456", "pasaporte")).toBe("pasaporte");
    expect(tipoDocDelComprobante("boleta", "71234482")).toBe("dni");
  });
  it("sin número, sin documento (con cualquier tipo elegido)", () => {
    expect(tipoDocDelComprobante("boleta", "", "pasaporte")).toBe("sin_documento");
    expect(tipoDocDelComprobante("nota_venta", "")).toBe("sin_documento");
  });
  it("tipoDocumentoDeCliente (lo que usa Cobrar) dice lo mismo, y sin tipo elegido sigue siendo DNI, como antes", () => {
    expect(tipoDocumentoDeCliente("boleta", "71234482")).toBe("dni");
    expect(tipoDocumentoDeCliente("boleta", "001234567", "carne_extranjeria")).toBe("carne_extranjeria");
    expect(tipoDocumentoDeCliente("factura", "20100070970", "pasaporte")).toBe("ruc");
    expect(tipoDocumentoDeCliente("boleta", "")).toBe("sin_documento");
  });
});

describe("problemaDocumentoComprobante — lo que frena el cobro (la base rechazaría la venta entera)", () => {
  it("un carné o un pasaporte fuera de formato lo dice con las palabras de la ficha", () => {
    expect(problemaDocumentoComprobante("boleta", "carne_extranjeria", "12345")).toBe("El carné de extranjería tiene de 6 a 12 letras o números, sin guiones.");
    expect(problemaDocumentoComprobante("nota_venta", "pasaporte", "AB-123")).toBe("El pasaporte tiene de 6 a 12 letras o números, sin guiones.");
  });
  it("bien escritos (también en minúsculas o con espacios, que la base limpia), no frena", () => {
    expect(problemaDocumentoComprobante("boleta", "carne_extranjeria", "001234567")).toBeNull();
    expect(problemaDocumentoComprobante("boleta", "pasaporte", "ab 123 456")).toBeNull();
  });
  it("vacío no frena (sale sin documento); un DNI de 8 y un RUC de 11 tampoco", () => {
    expect(problemaDocumentoComprobante("boleta", "pasaporte", "")).toBeNull();
    expect(problemaDocumentoComprobante("boleta", "dni", "71234482")).toBeNull();
    expect(problemaDocumentoComprobante("factura", "dni", "20100070970")).toBeNull();
  });
  // /chaos 2026-10-13: una factura con un RUC de 10 y una boleta con un DNI de 7 salían (la pantalla avisaba y dejaba emitir).
  it("una boleta con un DNI que no es de 8 dígitos no se cobra, y dice cuántos faltan o sobran", () => {
    expect(problemaDocumentoComprobante("boleta", "dni", "1234567")).toBe("Al DNI le falta 1 dígito: tiene 8.");
    expect(problemaDocumentoComprobante("boleta", "dni", "123")).toBe("Al DNI le faltan 5 dígitos: tiene 8.");
    expect(problemaDocumentoComprobante("boleta", "dni", "123456789")).toBe("El DNI tiene 8 dígitos: sobra 1.");
    expect(problemaDocumentoComprobante("boleta", "dni", "1234567A")).toBe("El DNI lleva solo dígitos.");
  });
  it("una factura con un RUC que no es de 11 dígitos no se cobra", () => {
    expect(problemaDocumentoComprobante("factura", "dni", "2012345678")).toBe("Al RUC le falta 1 dígito: tiene 11.");
    expect(problemaDocumentoComprobante("factura", "pasaporte", "12")).toBe("Al RUC le faltan 9 dígitos: tiene 11.");
    expect(problemaDocumentoComprobante("factura", "dni", "201234567890")).toBe("El RUC tiene 11 dígitos: sobra 1.");
  });
  it("la nota de venta no va a SUNAT: su DNI no frena el cobro", () => {
    expect(problemaDocumentoComprobante("nota_venta", "dni", "123")).toBeNull();
  });
  it("una factura con letras (un carné que quedó escrito al pasar de boleta a factura) no se cobra: saldría como un RUC que no existe", () => {
    expect(problemaDocumentoComprobante("factura", "carne_extranjeria", "CE12A3456")).toBe(
      "El RUC lleva solo dígitos: corrígelo, o vuelve a boleta para el carné o el pasaporte."
    );
  });
});
