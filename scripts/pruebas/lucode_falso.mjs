#!/usr/bin/env node
/**
 * Un Lucode FALSO en esta máquina, para probar de punta a punta lo que pasa cuando Lucode ya tiene un número (ADR-0378):
 * el ERP local en el navegador, la base local y este servidor en lugar de app.apisunat.pe. Nunca toca SUNAT ni Lucode.
 *
 * QUÉ IMITA (las formas vistas en producción el 2026-10-12, y `docs.apisunat.pe/consultar-estado`):
 *   · POST /api/v3/documents  → si el número ya existe: 400 «ERROR: La boleta B001-4 fue emitido anteriormente.»;
 *                               si no, lo guarda y responde ACEPTADO con sus direcciones (xml, cdr, pdf).
 *   · POST /api/v3/status     → el estado y la dirección del XML; 400 «no está registrado» si no lo tiene.
 *   · GET  /xml/<doc>/<S-N>   → el XML UBL 2.1 con la forma del que firma Lucode (firma, emisor, cliente, totales, líneas).
 * Y dos puertas de la prueba:
 *   · POST /__sembrar  [{ documento, serie, numero, fecha_de_emision, total, cliente_tipo_de_documento,
 *                         cliente_numero_de_documento, lineas, estado }]  → documentos que «ya tenía» (el primer envío
 *                         que el ERP dio por perdido). `estado`: ACEPTADO | PENDIENTE | RECHAZADO.
 *   · GET  /__registro → cada llamada recibida, para contar envíos (un «ya emitido» no debe reenviarse).
 *
 * CÓMO SE USA (ver ADR-0378, «Cómo se verificó»):
 *   node scripts/pruebas/lucode_falso.mjs --puerto 4790
 *   y en `apps/web/.env.local` (solo mientras dura la prueba): LUCODE_TOKEN=falso y LUCODE_URL_LOCAL=http://127.0.0.1:4790.
 *   `lib/lucode.ts` solo acepta esa dirección con `next dev` y hacia localhost: un build de producción la ignora.
 */

import { createServer } from "node:http";

const puerto = Number(process.argv[process.argv.indexOf("--puerto") + 1]) || 4790;
const base = `http://127.0.0.1:${puerto}`;

/** clave `boleta:B001-4` → { datos como los manda el ERP, estado } */
const documentos = new Map();
const registro = [];
const clave = (documento, serie, numero) => `${documento}:${String(serie).toUpperCase()}-${Number(numero)}`;

function direcciones(documento, serie, numero) {
  const id = `${String(serie).toUpperCase()}-${Number(numero)}`;
  return { xml: `${base}/xml/${documento}/${id}`, cdr: `${base}/cdr/${documento}/${id}`, pdf: { a4: `${base}/pdf/${documento}/${id}` } };
}

function xmlDe(d) {
  const raiz = d.documento === "nota_credito" ? "CreditNote" : d.documento === "nota_debito" ? "DebitNote" : "Invoice";
  const linea = raiz === "Invoice" ? "InvoiceLine" : `${raiz}Line`;
  const moneda = d.moneda ?? "PEN";
  const total = Number(d.total).toFixed(2);
  const lineas = Array.from(
    { length: d.lineas ?? 1 },
    (_, i) => `<cac:${linea}><cbc:ID>${i + 1}</cbc:ID><cac:Item><cbc:Description><![CDATA[PRENDA ${i + 1}]]></cbc:Description></cac:Item></cac:${linea}>`,
  ).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="GreenterSign"><ds:SignatureValue>FALSA</ds:SignatureValue></ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:ID>${String(d.serie).toUpperCase()}-${Number(d.numero)}</cbc:ID><cbc:IssueDate>${d.fecha_de_emision}</cbc:IssueDate>${
    raiz === "Invoice" ? `<cbc:InvoiceTypeCode listID="0101">${d.documento === "factura" ? "01" : "03"}</cbc:InvoiceTypeCode>` : ""
  }<cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode><cac:Signature><cbc:ID>SIGN20000000001</cbc:ID></cac:Signature><cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">20000000001</cbc:ID></cac:PartyIdentification></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${d.cliente_tipo_de_documento}">${d.cliente_numero_de_documento}</cbc:ID></cac:PartyIdentification></cac:Party></cac:AccountingCustomerParty><cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="${moneda}">${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineas}</${raiz}>`;
}

const responder = (res, status, cuerpo, tipo = "application/json") => {
  res.writeHead(status, { "content-type": tipo });
  res.end(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo));
};

const servidor = createServer(async (req, res) => {
  let texto = "";
  for await (const trozo of req) texto += trozo;
  const cuerpo = texto ? JSON.parse(texto) : null;
  const ruta = new URL(req.url, base).pathname;
  registro.push({ en: new Date().toISOString(), metodo: req.method, ruta, cuerpo: cuerpo && { documento: cuerpo.documento, serie: cuerpo.serie, numero: cuerpo.numero } });
  console.log(`${req.method} ${ruta}${cuerpo?.serie ? ` ${cuerpo.serie}-${cuerpo.numero}` : ""}`);

  if (ruta === "/__sembrar" && req.method === "POST") {
    for (const d of cuerpo) documentos.set(clave(d.documento, d.serie, d.numero), { datos: d, estado: d.estado ?? "ACEPTADO" });
    return responder(res, 200, { sembrados: cuerpo.length });
  }
  if (ruta === "/__registro") return responder(res, 200, registro);

  if (ruta.startsWith("/api/") && !/^Bearer .+/.test(req.headers.authorization ?? "")) return responder(res, 401, { success: false, message: "Token inválido" });

  if (ruta === "/api/v3/documents" && req.method === "POST") {
    const k = clave(cuerpo.documento, cuerpo.serie, cuerpo.numero);
    if (documentos.has(k)) {
      return responder(res, 400, { success: false, message: `ERROR: La ${cuerpo.documento} ${String(cuerpo.serie).toUpperCase()}-${cuerpo.numero} fue emitido anteriormente.` });
    }
    const datos = { ...cuerpo, lineas: Array.isArray(cuerpo.items) ? cuerpo.items.length : 1 };
    documentos.set(k, { datos, estado: "ACEPTADO" });
    return responder(res, 200, {
      success: true,
      message: "El documento fue enviado correctamente y aceptado por SUNAT.",
      payload: { estado: "ACEPTADO", hash: "HASHFALSO", ...direcciones(cuerpo.documento, cuerpo.serie, cuerpo.numero) },
    });
  }
  if (ruta === "/api/v3/status" && req.method === "POST") {
    const d = documentos.get(clave(cuerpo.documento, cuerpo.serie, cuerpo.numero));
    if (!d) return responder(res, 400, { success: false, message: `La ${cuerpo.documento} ${cuerpo.serie}-${cuerpo.numero} no está registrada` });
    return responder(res, 200, {
      success: true,
      message: d.estado === "ACEPTADO" ? "El documento fue enviado correctamente y aceptado por SUNAT." : d.estado === "RECHAZADO" ? "SUNAT rechazó el documento (prueba)." : "Aún no ha sido aceptado por SUNAT.",
      payload: { estado: d.estado, hash: "HASHFALSO", ...direcciones(cuerpo.documento, cuerpo.serie, cuerpo.numero) },
    });
  }
  const xml = /^\/xml\/([a-z_]+)\/([A-Z0-9]{4})-(\d+)$/i.exec(ruta);
  if (xml && req.method === "GET") {
    const d = documentos.get(clave(xml[1], xml[2], xml[3]));
    return d ? responder(res, 200, xmlDe(d.datos), "application/xml; charset=utf-8") : responder(res, 404, "Not found", "text/plain");
  }
  return responder(res, 404, { success: false, message: "Ruta desconocida en el Lucode falso" });
});

servidor.listen(puerto, "127.0.0.1", () => console.log(`Lucode falso escuchando en ${base}`));
