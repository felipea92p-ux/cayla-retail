import { formatoPorFirma, type FormatoDeFoto } from "./foto-elegida-reglas";

// La foto de un modelo tomada con el celular por un QR (ADR-0699, actividad 2c; migración 20261124161000). Lógica pura: la usan la ruta
// que recibe la foto (`app/api/foto-qr/[permiso]`), la página del celular (`app/foto/[permiso]`) y la placa del contador.
//
// CONTRATO
//   PROMETE: decir si un permiso tiene la forma de los que da la base (32 caracteres base64 para URL), qué foto se acepta (firma de
//            imagen de verdad, hasta 10 MB) y dónde se guarda; y traducir el motivo de la base a una frase para quien tiene el celular.
//   ASUME:   que el permiso lo crea `crear_foto_por_qr` y que la base solo guarda su huella sha256.
//   NO HACE: no toca la red ni la base.

/** Lo que da `crear_foto_por_qr`: 24 bytes al azar en base64 para URL. Cualquier otra cosa no se mira siquiera. */
export const FORMA_DEL_PERMISO = /^[A-Za-z0-9_-]{32}$/;
export const esPermiso = (texto: string): boolean => FORMA_DEL_PERMISO.test(texto);

/** El tope del almacén `retail-fotos-por-qr` (la migración dice lo mismo). */
export const MAX_BYTES_FOTO_QR = 10 * 1024 * 1024;
/** Cuántas fotos admite un permiso (la tabla lo exige: `fotos_por_qr_tope`). */
export const FOTOS_POR_QR = 3;
/** Cada cuánto la computadora pregunta si llegó algo, mientras el QR está a la vista. */
export const ESPERA_ENTRE_PREGUNTAS_MS = 2500;

const TIPO: Record<FormatoDeFoto, { tipo: string; ext: string }> = {
  jpeg: { tipo: "image/jpeg", ext: "jpg" },
  png: { tipo: "image/png", ext: "png" },
  webp: { tipo: "image/webp", ext: "webp" },
  heic: { tipo: "image/heic", ext: "heic" },
  avif: { tipo: "image/avif", ext: "avif" },
};

/** ¿Es una foto que se acepta? Se mira la firma del archivo (sus primeros bytes), nunca lo que dice su nombre ni su tipo. */
export function fotoAceptada(primeros: Uint8Array, bytes: number): { tipo: string; ext: string } | { motivo: string } {
  if (bytes <= 0) return { motivo: "La foto llegó vacía. Tómala otra vez." };
  if (bytes > MAX_BYTES_FOTO_QR) return { motivo: "La foto pesa más de 10 MB. Tómala otra vez, sin zoom." };
  const formato = formatoPorFirma(primeros);
  return formato ? TIPO[formato] : { motivo: "Eso no es una foto. Toca «Tomar la foto» otra vez." };
}

/** Dónde queda en el almacén privado: una carpeta por permiso, un nombre al azar por foto. */
export const rutaDeFotoQr = (qrId: string, nombre: string, ext: string): string => `${qrId}/${nombre}.${ext}`;

/** La dirección que lleva el QR. */
export const urlDelQr = (origen: string, permiso: string): string => `${origen.replace(/\/+$/, "")}/foto/${permiso}`;

/** El motivo de la base, dicho para quien tiene el celular en la mano. */
export function mensajeDelQr(pista: string | null | undefined): string {
  if (pista === "qr_vencido") return "Este código ya venció. Pide uno nuevo en la computadora.";
  if (pista === "qr_lleno") return "Con este código ya se subieron 3 fotos. Pide uno nuevo en la computadora.";
  if (pista === "qr_no_existe") return "Este código no es de CAYLA.";
  return "No se pudo subir la foto. Inténtalo otra vez.";
}
