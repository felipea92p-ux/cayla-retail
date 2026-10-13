// El documento de quien compra, tal como lo lleva un comprobante (boleta, factura, nota de venta y sus notas). ADR-0288,
// DECISIÓN 3 (tanda 1e): además del DNI y el RUC, el carné de extranjería y el pasaporte. Lógica pura: la usan la caja, el
// envío a Lucode, el papel (térmica y A4) y el registro de ventas de Impuestos, del lado del servidor y del navegador.
//
// UNA SOLA TABLA. Antes cada uno decía `tipo === "ruc" ? "6" : "1"` (o `"RUC" : "DNI"`) por su cuenta: un tipo nuevo habría
// salido como DNI en el envío, en el QR, en el papel y en el registro de ventas, sin que nada avisara. Ahora los cuatro leen
// de aquí, y un `Record` sobre el tipo hace que TypeScript no deje olvidar ninguno.
//
// Las reglas son las MISMAS que la base (migración 20260930250000): los candados `comprobantes_cliente_tipo_doc_check` y
// `comprobantes_carne_pasaporte_formato`, y `emitir_comprobante`, que valida con `fn_documento_clienta` (la regla de la
// ficha: `lib/documento-clienta-reglas.ts`). Si una cambia, cambian las dos.

import { problemaDocumento, type TipoDocumentoClienta } from "./documento-clienta-reglas";

/** Lo que acepta `comprobantes.cliente_tipo_doc`. */
export type TipoDocComprobante = "dni" | "ruc" | "carne_extranjeria" | "pasaporte" | "sin_documento";
/** Un documento de verdad (todos menos «sin documento»). */
export type TipoDocIdentificado = Exclude<TipoDocComprobante, "sin_documento">;

/**
 * Catálogo 06 de SUNAT («tipo de documento de identidad»): 1 DNI, 4 carné de extranjería, 6 RUC, 7 pasaporte. Es el código
 * del envío a Lucode (`cliente_tipo_de_documento`), el del QR de la representación impresa y el de la tabla 2 del registro de
 * ventas (la misma lista). «Sin documento» no está: cada uno lo escribe a su manera (Lucode, «1» con el comodín 99999999; el
 * QR, «-»; el registro de ventas, «0»).
 */
export const CODIGO_SUNAT_DOCUMENTO: Record<TipoDocIdentificado, string> = {
  dni: "1",
  carne_extranjeria: "4",
  ruc: "6",
  pasaporte: "7",
};

/** Cómo se lee en pantalla y en el papel, delante del número. */
export const ETIQUETA_DOCUMENTO_COMPROBANTE: Record<TipoDocIdentificado, string> = {
  dni: "DNI",
  carne_extranjeria: "CE",
  ruc: "RUC",
  pasaporte: "Pasaporte",
};

export function esTipoDocComprobante(valor: unknown): valor is TipoDocComprobante {
  return valor === "dni" || valor === "ruc" || valor === "carne_extranjeria" || valor === "pasaporte" || valor === "sin_documento";
}

/** Si el comprobante identifica a quien compra: un tipo de documento Y un número. */
export function llevaDocumento(tipo: TipoDocComprobante, numero: string | null | undefined): tipo is TipoDocIdentificado {
  return tipo !== "sin_documento" && !!numero;
}

/** El comodín que Lucode documenta para la boleta que no identifica a quien compra (va con el código «1»). */
export const SIN_DOCUMENTO_LUCODE = "99999999";

/**
 * Cómo viaja quien compra en el envío a Lucode, y por eso en el XML que firma: el código del catálogo 06 y el número. Sin
 * documento, «1» con el comodín. Lo leen el envío (`payloadDe`) y la comparación con lo que Lucode ya tiene
 * (`lib/ya-emitido-reglas.ts`): si fueran dos reglas, una boleta nuestra podría leerse como «de otro» o al revés.
 */
export function clienteParaLucode(tipo: TipoDocComprobante, numero: string | null | undefined): { codigo: string; numero: string } {
  return llevaDocumento(tipo, numero) ? { codigo: CODIGO_SUNAT_DOCUMENTO[tipo], numero: numero! } : { codigo: "1", numero: SIN_DOCUMENTO_LUCODE };
}

/** «DNI 71234482», «CE 001234567», «Pasaporte AB123456», «RUC 20…»; null si el comprobante no identifica a nadie. */
export function documentoLegibleComprobante(tipo: TipoDocComprobante, numero: string | null | undefined): string | null {
  return llevaDocumento(tipo, numero) ? `${ETIQUETA_DOCUMENTO_COMPROBANTE[tipo]} ${numero}` : null;
}

/**
 * Qué tipo lleva el comprobante, a partir de lo que hay en el ticket. No es una decisión aparte: una factura SIEMPRE va al
 * RUC; una boleta o una nota de venta, al documento de identidad que se eligió (DNI por defecto) si tiene número, y si no,
 * sin documento.
 */
export function tipoDocDelComprobante(
  tipoComprobante: string,
  numero: string,
  identidad: TipoDocumentoClienta = "dni"
): TipoDocComprobante {
  if (tipoComprobante === "factura") return "ruc";
  return numero ? identidad : "sin_documento";
}

/**
 * Qué está mal del documento del comprobante, en palabras de la tienda, o null. Frena el cobro (`motivoBloqueoCobro`), y la base
 * rechaza lo mismo (y con ello, la venta ENTERA):
 *   - carné o pasaporte fuera de formato;
 *   - una factura con un RUC que no es de 11 dígitos (o con letras: pasa si se cambió de boleta a factura con un carné o un
 *     pasaporte escrito). Saldría a SUNAT como un RUC que no existe;
 *   - una boleta con un DNI que no es de 8 dígitos (/chaos 2026-10-13, Felipe: «bloquear, en la pantalla y en la base»;
 *     `fn_problema_documento_comprobante`, 20261013210000). La nota de venta no va a SUNAT y no se mira.
 * La factura sin RUC la cuida `facturaSinRuc`.
 */
export function problemaDocumentoComprobante(tipoComprobante: string, identidad: TipoDocumentoClienta, numero: string): string | null {
  const n = numero.trim();
  if (!n) return null;
  if (tipoComprobante === "factura") {
    if (/\D/.test(n)) return "El RUC lleva solo dígitos: corrígelo, o vuelve a boleta para el carné o el pasaporte.";
    return digitosQueFaltan("RUC", n, 11);
  }
  if (identidad === "dni") {
    if (tipoComprobante !== "boleta") return null;
    if (/\D/.test(n)) return "El DNI lleva solo dígitos.";
    return digitosQueFaltan("DNI", n, 8);
  }
  return problemaDocumento(identidad, numero);
}

/** «Al DNI le falta 1 dígito: tiene 8.» / «El RUC tiene 11 dígitos: sobra 1.» / null si está justo. */
function digitosQueFaltan(nombre: "DNI" | "RUC", n: string, largo: number): string | null {
  const dif = largo - n.length;
  if (dif === 0) return null;
  const art = nombre === "DNI" ? "Al DNI" : "Al RUC";
  if (dif > 0) return `${art} le ${dif === 1 ? "falta 1 dígito" : `faltan ${dif} dígitos`}: tiene ${largo}.`;
  return `El ${nombre} tiene ${largo} dígitos: ${-dif === 1 ? "sobra 1" : `sobran ${-dif}`}.`;
}
