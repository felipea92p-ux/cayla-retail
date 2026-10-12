// Reglas puras de «Lucode ya tiene ese número» (ADR-0378): sin Supabase ni Lucode, para probarlas sin red. Las usa
// `lib/resolver-ya-emitido.ts` (servidor) y la cola de «Por enviar» (`transmision-reglas.ts`, también en el navegador):
// por eso este archivo solo importa reglas puras, nunca `lib/lucode.ts`.
//
// EL PROBLEMA (producción, 9 al 12-oct-2026). Al cobrar, el ERP manda la boleta a Lucode y espera 15 s. Esos días SUNAT
// estuvo lenta: el ERP dejó de esperar y anotó «no respondió», pero Lucode SÍ la emitió. El reintento la volvía a mandar,
// Lucode contestaba «La boleta B005-262 fue emitido anteriormente», y el ERP lo leía como un rechazo común y la dejaba en
// la cola para siempre (hasta 21 intentos). Llegó a haber 41 así: el aviso rojo de Comprobantes decía «50 comprobantes
// llevan más de 1 hora sin llegar a SUNAT» cuando casi todos ya estaban en SUNAT. Y como el barrido toma los 3 más
// viejos, esas boletas atascadas tapaban a las que de verdad faltaban (B005-273 llegó a su último día sin un intento).
//
// LA REGLA. «Ya fue emitido» no es un rechazo: es Lucode diciendo que ese número ya lo tiene. Se le pregunta su estado
// y, ANTES de anotarlo, se compara el XML que Lucode firmó con nuestra boleta (número, tipo, fecha, moneda, total,
// cliente y cuántas líneas). Si es la nuestra, se guarda lo que diga SUNAT (aceptado, rechazado o en trámite). Si es
// otro documento con nuestro número —alguien emitió desde el panel de Lucode, otra base con la misma serie—, NO se
// marca nada como declarado: queda a la vista como «número ocupado» para que lo resuelva una persona. Ante la duda
// (Lucode no respondió, el XML no se pudo leer) tampoco se escribe: queda en la cola y se vuelve a confirmar.
// Equivocarse hacia «todavía no» cuesta una consulta más; hacia «ya está», una venta sin comprobante marcada como declarada.

import { clienteParaLucode, type TipoDocComprobante } from "./documento-comprobante-reglas";

/** Prefijos que escribe la cola (`ultimo_error_transmision` = `<prefijo>: <detalle>`), junto a los de `lib/lucode.ts`. */
export const YA_EMITIDO = "ya_emitido";
export const NUMERO_OCUPADO = "numero_ocupado";

/** «1.234» → 1234; acepta «B005-000262» y «B005-262». */
function partirNumero(texto: string): { serie: string; numero: number } | null {
  const m = /^\s*([A-Z0-9]{4})-0*(\d{1,8})\s*$/i.exec(texto);
  return m ? { serie: m[1].toUpperCase(), numero: Number(m[2]) } : null;
}

/**
 * Si un rechazo de Lucode dice que ese número YA se emitió («ERROR: La boleta B004-148 fue emitido anteriormente.», visto en
 * producción el 2026-10-10). Si el mensaje nombra un número, tiene que ser el nuestro: uno que habla de otro documento no
 * se toma como «ya lo tiene».
 */
export function esYaEmitido(detalle: string | null | undefined, serie?: string, numero?: number): boolean {
  if (!detalle || !/fue\s+emitid[oa]\s+anteriormente/i.test(detalle)) return false;
  if (serie === undefined || numero === undefined) return true;
  const nombrado = /\b([A-Z0-9]{4}-\d{1,8})\b/i.exec(detalle);
  if (!nombrado) return true;
  const n = partirNumero(nombrado[1]);
  return !!n && n.serie === serie.toUpperCase() && n.numero === numero;
}

export type RaizUbl = "Invoice" | "CreditNote" | "DebitNote";

/** Lo que se compara de un XML UBL 2.1 firmado (el formato de SUNAT que devuelve Lucode). */
export type DocumentoXml = {
  raiz: RaizUbl;
  serie: string;
  numero: number;
  fecha: string;
  /** «03» boleta, «01» factura; solo en `Invoice`. */
  tipoCodigo: string | null;
  moneda: string | null;
  total: number;
  clienteCodigo: string | null;
  clienteNumero: string;
  lineas: number;
};

const sinCdata = (v: string) => v.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();

/** El texto de la primera etiqueta `nombre` (con o sin prefijo de espacio de nombres) y sus atributos. */
function etiqueta(xml: string, nombre: string): { valor: string; atributos: string } | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${nombre}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`).exec(xml);
  return m ? { valor: sinCdata(m[2]), atributos: m[1] ?? "" } : null;
}

function atributo(atributos: string, nombre: string): string | null {
  const m = new RegExp(`\\b${nombre}\\s*=\\s*"([^"]*)"`).exec(atributos);
  return m ? m[1] : null;
}

/**
 * Lee del XML lo que identifica al documento, o `null` si falta algo de eso: un XML que no se puede leer entero no
 * confirma nada. Se salta la firma (`UBLExtensions`) y el bloque `cac:Signature`, que también llevan etiquetas `ID`.
 */
export function leerXmlComprobante(xml: string): DocumentoXml | null {
  if (typeof xml !== "string" || xml.length === 0) return null;
  const raizM = /<(?:[\w.-]+:)?(Invoice|CreditNote|DebitNote)[\s>]/.exec(xml);
  if (!raizM) return null;
  const raiz = raizM[1] as RaizUbl;
  const cuerpo = xml
    .replace(/<(?:[\w.-]+:)?UBLExtensions[\s>][\s\S]*?<\/(?:[\w.-]+:)?UBLExtensions>/g, "")
    .replace(/<(?:[\w.-]+:)?Signature[\s>][\s\S]*?<\/(?:[\w.-]+:)?Signature>/g, "");

  const id = etiqueta(cuerpo, "ID");
  const numero = id ? partirNumero(id.valor) : null;
  const fecha = etiqueta(cuerpo, "IssueDate")?.valor ?? "";
  const pagable = etiqueta(cuerpo, "PayableAmount");
  const total = pagable && /^-?\d+(\.\d+)?$/.test(pagable.valor) ? Number(pagable.valor) : NaN;
  const clienteBloque = etiqueta(cuerpo, "AccountingCustomerParty");
  const clienteId = clienteBloque ? etiqueta(clienteBloque.valor, "ID") : null;
  const lineas = (cuerpo.match(/<(?:[\w.-]+:)?(?:InvoiceLine|CreditNoteLine|DebitNoteLine)[\s>]/g) ?? []).length;
  if (!numero || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(total) || !clienteId?.valor || lineas === 0) return null;

  return {
    raiz,
    serie: numero.serie,
    numero: numero.numero,
    fecha,
    tipoCodigo: raiz === "Invoice" ? (etiqueta(cuerpo, "InvoiceTypeCode")?.valor ?? null) : null,
    moneda: etiqueta(cuerpo, "DocumentCurrencyCode")?.valor || atributo(pagable!.atributos, "currencyID"),
    total,
    clienteCodigo: atributo(clienteId.atributos, "schemeID"),
    clienteNumero: clienteId.valor,
    lineas,
  };
}

/** Nuestra boleta tal como se mandó a Lucode (los mismos datos que arma `transmitirComprobante`). */
export type NuestroComprobante = {
  tipo: "boleta" | "factura" | "nota_credito" | "nota_debito";
  serie: string;
  numero: number;
  /** `AAAA-MM-DD`, el día de la venta en Lima: el que viaja como `fecha_de_emision`. */
  fecha: string;
  moneda: "PEN" | "USD";
  total: number;
  clienteTipoDoc: TipoDocComprobante;
  clienteNumDoc: string | null;
  /** Las líneas que se declaran (sin las de precio 0: `itemsParaLucode`). */
  lineas: number;
};

const RAIZ: Record<NuestroComprobante["tipo"], RaizUbl> = { boleta: "Invoice", factura: "Invoice", nota_credito: "CreditNote", nota_debito: "DebitNote" };
const CODIGO_TIPO: Partial<Record<NuestroComprobante["tipo"], string>> = { boleta: "03", factura: "01" };
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * En qué se distingue el documento que tiene Lucode del nuestro, en palabras de la tienda; vacío = es el mismo. El cliente
 * se nombra sin su número (estas líneas terminan en la base y en los logs, ver `lib/errores.ts`).
 */
export function diferenciasConLucode(nuestro: NuestroComprobante, xml: DocumentoXml): string[] {
  const d: string[] = [];
  const codigoTipo = CODIGO_TIPO[nuestro.tipo];
  if (xml.raiz !== RAIZ[nuestro.tipo] || (codigoTipo && xml.tipoCodigo !== codigoTipo)) d.push("otro tipo de documento");
  if (xml.serie !== nuestro.serie.toUpperCase() || xml.numero !== nuestro.numero) d.push(`otro número (${xml.serie}-${xml.numero})`);
  if (xml.fecha !== nuestro.fecha) d.push(`otra fecha (${xml.fecha} en Lucode, ${nuestro.fecha} aquí)`);
  if (xml.moneda && xml.moneda !== nuestro.moneda) d.push(`otra moneda (${xml.moneda} en Lucode, ${nuestro.moneda} aquí)`);
  if (Math.round(xml.total * 100) !== Math.round(nuestro.total * 100)) d.push(`otro total (${soles(xml.total)} en Lucode, ${soles(nuestro.total)} aquí)`);
  const cliente = clienteParaLucode(nuestro.clienteTipoDoc, nuestro.clienteNumDoc);
  const mismoNumero = xml.clienteNumero.toUpperCase() === cliente.numero.trim().toUpperCase();
  if (!mismoNumero || (xml.clienteCodigo !== null && xml.clienteCodigo !== cliente.codigo)) d.push("otro cliente");
  if (xml.lineas !== nuestro.lineas) d.push(`otras líneas (${xml.lineas} en Lucode, ${nuestro.lineas} aquí)`);
  return d;
}

export type DecisionYaEmitido =
  /** Es la nuestra: se guarda lo que dice SUNAT. `enviado` = SUNAT todavía no responde; lo sigue la consulta del barrido. */
  | { tipo: "guardar"; estado: "aceptado" | "enviado" | "rechazado"; motivoRechazo: string | null }
  /** No se pudo confirmar todavía: queda en la cola y se vuelve a intentar sola. */
  | { tipo: "sin_confirmar"; detalle: string }
  /** Lucode tiene OTRO documento con nuestro número: reintentar no lo arregla, lo decide una persona. `detalle` es la
   *  frase entera (respuesta y log); `enCola`, solo lo distinto (la cola ya dice «ese número ya lo usa otro documento»). */
  | { tipo: "numero_ocupado"; detalle: string; enCola: string };

/**
 * Qué hacer con un comprobante que Lucode ya tenía, según su estado ante SUNAT y la comparación del XML (`null` = el XML no
 * se pudo leer). El orden importa: primero se confirma que es el nuestro, y recién después se mira el estado.
 */
export function decidirYaEmitido(
  numero: string,
  estadoSunat: "ACEPTADO" | "PENDIENTE" | "RECHAZADO",
  mensajeSunat: string | null,
  diferencias: string[] | null,
): DecisionYaEmitido {
  if (diferencias === null) return { tipo: "sin_confirmar", detalle: `Lucode ya tiene ${numero}, pero no se pudo leer su XML para confirmar que es esta venta.` };
  if (diferencias.length > 0) {
    return { tipo: "numero_ocupado", detalle: `${numero} ya existe en Lucode con ${diferencias.join(", ")}.`, enCola: diferencias.join(", ") };
  }
  if (estadoSunat === "ACEPTADO") return { tipo: "guardar", estado: "aceptado", motivoRechazo: null };
  if (estadoSunat === "RECHAZADO") {
    return { tipo: "guardar", estado: "rechazado", motivoRechazo: mensajeSunat?.trim() || "SUNAT lo rechazó (visto al consultar su estado)." };
  }
  return { tipo: "guardar", estado: "enviado", motivoRechazo: null };
}
