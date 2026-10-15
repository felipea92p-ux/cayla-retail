// El documento de una clienta (ADR-0288, D-2; CL-2): DNI por defecto, carné de extranjería o pasaporte. Lógica pura: la
// importan la ficha (/clientas), Cobrar y Apartados, del lado del servidor y del navegador.
//
// Las reglas son las MISMAS que la base (`retail.fn_documento_clienta` y el candado `clientas_documento_formato`,
// migración 20260930160000): la pantalla avisa antes de guardar, y la base es la que manda. Si una cambia, cambian las
// dos.

import { enmascararCelular } from "./proveedores-reglas";

// Las reglas de formato (los tipos, cómo se normaliza y valida el número, su largo) viven en `packages/shared/src/documento-clienta.ts`
// desde el 2026-10-15: la tienda online las usa igual («Crear cuenta» con carné o pasaporte). Aquí se re-exportan y siguen las que
// son solo del ERP (cómo se lee en pantalla y en el comprobante).
import { TIPOS_DOCUMENTO_CLIENTA, esTipoDocumentoClienta, normalizarNumeroDocumento, problemaDocumento, type TipoDocumentoClienta } from "@cayla-retail/shared";

export {
  TIPOS_DOCUMENTO_CLIENTA,
  ajustarNumeroAlTipo,
  esTipoDocumentoClienta,
  largoMaximoDocumento,
  normalizarNumeroDocumento,
  problemaDocumento,
  type TipoDocumentoClienta,
} from "@cayla-retail/shared";

/** El tipo que llega de la base (texto libre para TypeScript). Uno desconocido se lee como DNI, el valor por defecto de la
 *  columna: la base no deja guardar otro (candado `clientas_documento_tipo_valido`). */
export function tipoDocumentoDe(valor: string | null | undefined): TipoDocumentoClienta {
  return esTipoDocumentoClienta(valor) ? valor : "dni";
}

/** El número a medias en pantalla (71•••482): el mostrador lo ve la clienta de al lado. Completo viaja al comprobante. */
export function numeroEnmascarado(numero: string | null): string | null {
  if (!numero) return null;
  const n = numero.trim();
  if (n.length < 6) return n;
  return `${n.slice(0, 2)}•••${n.slice(-3)}`;
}

/**
 * El DNI y el celular de un cliente como se leen en Clientes (Felipe 2026-10-13, auditoría de 20 puntos, punto 18): completos
 * para el líder, a medias para los demás. Es lo que se VE en la lista y en la ficha; la caja de edición muestra el número
 * completo porque hace falta para corregirlo. `formatoCelular` es el formato
 * legible de quien llama (el mismo del resto de la pantalla).
 */
export function contactoVisible(
  c: { documentoTipo: TipoDocumentoClienta; documentoNumero: string | null; telefonoWhatsapp: string | null },
  verCompleto: boolean,
  formatoCelular: (telefono: string) => string = (t) => t
): { documento: string | null; celular: string | null } {
  return {
    documento: documentoLegible(c.documentoTipo, c.documentoNumero, !verCompleto),
    // El celular a medias con la MISMA pieza que Proveedores y los avisos del club («9•• ••• 321»; un número que no es celular, «•••»).
    celular: !c.telefonoWhatsapp ? null : verCompleto ? formatoCelular(c.telefonoWhatsapp) : enmascararCelular(c.telefonoWhatsapp),
  };
}

/** «DNI 71•••482», «CE 00•••123», «Pasaporte AB•••456»; null sin número. */
export function documentoLegible(tipo: TipoDocumentoClienta, numero: string | null, enmascarar = true): string | null {
  if (!numero) return null;
  const corta = TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === tipo)?.corta ?? "DNI";
  return `${corta} ${enmascarar ? numeroEnmascarado(numero) : numero}`;
}

/**
 * Qué documento lleva la boleta de una venta a esta clienta: el de su ficha, con su tipo. Desde la tanda 1e (ADR-0288 D-3,
 * OK de Felipe) el comprobante acepta DNI, carné de extranjería y pasaporte, y a Lucode viajan con el catálogo 06 de SUNAT
 * («1», «4», «7»: `documento-comprobante-reglas.ts`). Un número que no cumple el formato de su tipo (una ficha vieja, de
 * antes del candado de la 1a) no pasa: esa boleta sale «sin documento» con su nombre, en vez de frenar la venta.
 */
export function documentoParaComprobante(
  tipo: TipoDocumentoClienta,
  numero: string | null
): { tipo: TipoDocumentoClienta; numero: string } | null {
  if (!numero) return null;
  const limpio = normalizarNumeroDocumento(numero);
  if (!limpio || problemaDocumento(tipo, limpio)) return null;
  return { tipo, numero: limpio };
}
