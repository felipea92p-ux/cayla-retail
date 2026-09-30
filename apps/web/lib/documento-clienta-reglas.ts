// El documento de una clienta (ADR-0288, D-2; CL-2): DNI por defecto, carné de extranjería o pasaporte. Lógica pura: la
// importan la ficha (/clientas), Cobrar y Apartados, del lado del servidor y del navegador.
//
// Las reglas son las MISMAS que la base (`retail.fn_documento_clienta` y el candado `clientas_documento_formato`,
// migración 20260930160000): la pantalla avisa antes de guardar, y la base es la que manda. Si una cambia, cambian las
// dos.

export type TipoDocumentoClienta = "dni" | "carne_extranjeria" | "pasaporte";

export const TIPOS_DOCUMENTO_CLIENTA: readonly { valor: TipoDocumentoClienta; etiqueta: string; corta: string }[] = [
  { valor: "dni", etiqueta: "DNI", corta: "DNI" },
  { valor: "carne_extranjeria", etiqueta: "Carné de extranjería", corta: "CE" },
  { valor: "pasaporte", etiqueta: "Pasaporte", corta: "Pasaporte" },
];

export function esTipoDocumentoClienta(valor: unknown): valor is TipoDocumentoClienta {
  return valor === "dni" || valor === "carne_extranjeria" || valor === "pasaporte";
}

/** El tipo que llega de la base (texto libre para TypeScript). Uno desconocido se lee como DNI, el valor por defecto de la
 *  columna: la base no deja guardar otro (candado `clientas_documento_tipo_valido`). */
export function tipoDocumentoDe(valor: string | null | undefined): TipoDocumentoClienta {
  return esTipoDocumentoClienta(valor) ? valor : "dni";
}

/** Sin espacios y en mayúsculas: así lo guarda la base («ab 12 34 56» → «AB123456»). */
export function normalizarNumeroDocumento(numero: string): string {
  return numero.replace(/\s/g, "").toUpperCase();
}

/**
 * Qué está mal del número, en palabras de la tienda, o `null` si está bien. Vacío es válido: el documento es opcional para
 * registrar a una clienta (lo exige el club, CL-1, en la tanda 1b).
 */
export function problemaDocumento(tipo: TipoDocumentoClienta, numero: string): string | null {
  const n = normalizarNumeroDocumento(numero);
  if (n === "") return null;
  if (tipo === "dni") return /^[0-9]{8}$/.test(n) ? null : "El DNI tiene 8 dígitos.";
  if (!/^[A-Z0-9]{6,12}$/.test(n)) {
    return `El ${tipo === "pasaporte" ? "pasaporte" : "carné de extranjería"} tiene de 6 a 12 letras o números, sin guiones.`;
  }
  return null;
}

/** Cuántos caracteres admite el campo: el DNI se corta en 8, los demás en 12. */
export function largoMaximoDocumento(tipo: TipoDocumentoClienta): number {
  return tipo === "dni" ? 8 : 12;
}

/**
 * Lo que queda escrito en la caja del número al tipear o al cambiar de tipo: solo lo que ese tipo admite (dígitos en el DNI;
 * letras y dígitos en mayúsculas en carné y pasaporte) y hasta su largo. Al cambiar de tipo el número NO se vacía: en la
 * ficha, un cambio de tipo por error y su vuelta atrás borrarían el documento de la clienta al guardar.
 */
export function ajustarNumeroAlTipo(tipo: TipoDocumentoClienta, numero: string): string {
  const permitido = tipo === "dni" ? numero.replace(/\D/g, "") : normalizarNumeroDocumento(numero).replace(/[^A-Z0-9]/g, "");
  return permitido.slice(0, largoMaximoDocumento(tipo));
}

/** El número a medias en pantalla (71•••482): el mostrador lo ve la clienta de al lado. Completo viaja al comprobante. */
export function numeroEnmascarado(numero: string | null): string | null {
  if (!numero) return null;
  const n = numero.trim();
  if (n.length < 6) return n;
  return `${n.slice(0, 2)}•••${n.slice(-3)}`;
}

/** «DNI 71•••482», «CE 00•••123», «Pasaporte AB•••456»; null sin número. */
export function documentoLegible(tipo: TipoDocumentoClienta, numero: string | null, enmascarar = true): string | null {
  if (!numero) return null;
  const corta = TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === tipo)?.corta ?? "DNI";
  return `${corta} ${enmascarar ? numeroEnmascarado(numero) : numero}`;
}

/**
 * Qué documento lleva el comprobante de una venta a esta clienta. Hoy el comprobante solo acepta DNI (y RUC en factura):
 * un carné o un pasaporte salen como «sin documento» con su nombre, igual que la boleta de una extranjera hasta ahora. La
 * tanda 1e (comprobante con carné y pasaporte, OK de Felipe, ADR-0288 D-3) cambia solo esta función.
 */
export function documentoParaComprobante(tipo: TipoDocumentoClienta, numero: string | null): string | null {
  if (!numero) return null;
  return tipo === "dni" ? numero : null;
}
