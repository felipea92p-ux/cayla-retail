// XML UBL 2.1 de prueba con la MISMA forma que el que firma Lucode (copiada de una boleta real de producción del
// 2026-10-09, con todos los datos inventados: RUC, firma, cliente y prendas). Lleva lo que confunde a un lector ingenuo:
// la firma con su `cbc:ID` de firmante, el RUC del emisor antes que el cliente, CDATA y `cbc:ID` de tributos. Solo lo
// usan las pruebas (`ya-emitido-reglas.test.ts`, `resolver-ya-emitido.test.ts`) y el Lucode falso de
// `scripts/pruebas/lucode_falso.mjs`, que tiene su propia copia en JavaScript.

export type OpcionesXml = {
  raiz?: "Invoice" | "CreditNote" | "DebitNote";
  id?: string;
  fecha?: string;
  tipoCodigo?: string;
  moneda?: string;
  total?: string;
  clienteCodigo?: string;
  clienteNumero?: string;
  lineas?: number;
  /** El número del cliente envuelto en CDATA, como Lucode escribe los nombres. */
  clienteEnCdata?: boolean;
};

export function xmlDePrueba(o: OpcionesXml = {}): string {
  const raiz = o.raiz ?? "Invoice";
  const moneda = o.moneda ?? "PEN";
  const total = o.total ?? "15.00";
  const numeroCliente = o.clienteEnCdata ? `<![CDATA[${o.clienteNumero ?? "99999999"}]]>` : (o.clienteNumero ?? "99999999");
  const linea = raiz === "Invoice" ? "InvoiceLine" : raiz === "CreditNote" ? "CreditNoteLine" : "DebitNoteLine";
  const lineas = Array.from({ length: o.lineas ?? 1 }, (_, i) =>
    `<cac:${linea}><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${moneda}">12.71</cbc:LineExtensionAmount><cac:Item><cbc:Description><![CDATA[PRENDA DE PRUEBA ${i + 1}]]></cbc:Description></cac:Item></cac:${linea}>`,
  ).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="GreenterSign"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>AAAA</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>BBBB</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>CCCC</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>2.0</cbc:CustomizationID><cbc:ID>${o.id ?? "B005-262"}</cbc:ID><cbc:IssueDate>${o.fecha ?? "2026-10-09"}</cbc:IssueDate><cbc:IssueTime>00:00:00</cbc:IssueTime>${
    raiz === "Invoice" ? `<cbc:InvoiceTypeCode listID="0101">${o.tipoCodigo ?? "03"}</cbc:InvoiceTypeCode>` : ""
  }<cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode><cac:Signature><cbc:ID>SIGN20000000001</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID>20000000001</cbc:ID></cac:PartyIdentification></cac:SignatoryParty></cac:Signature><cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">20000000001</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name><![CDATA[EMPRESA DE PRUEBA S.A.C.]]></cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${o.clienteCodigo ?? "1"}">${numeroCliente}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[CLIENTE VARIOS]]></cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty><cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID></cac:PaymentTerms><cac:TaxTotal><cbc:TaxAmount currencyID="${moneda}">2.29</cbc:TaxAmount><cac:TaxSubtotal><cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${moneda}">12.71</cbc:LineExtensionAmount><cbc:TaxInclusiveAmount currencyID="${moneda}">${total}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="${moneda}">${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineas}</${raiz}>`;
}
