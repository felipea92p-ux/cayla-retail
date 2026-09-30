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
 * Qué está mal del documento de una boleta o nota de venta, en palabras de la tienda, o null. Solo carné y pasaporte: la
 * base los rechaza fuera de formato (y con ellos, la venta ENTERA), así que la caja no deja cobrar hasta corregirlos. El DNI
 * sigue como siempre (la base no le pone candado en el comprobante, y el campo ya avisa si le faltan dígitos), y el RUC de la
 * factura lo cuida `facturaSinRuc`.
 */
export function problemaDocumentoComprobante(tipoComprobante: string, identidad: TipoDocumentoClienta, numero: string): string | null {
  if (tipoComprobante === "factura" || identidad === "dni" || !numero.trim()) return null;
  return problemaDocumento(identidad, numero);
}
