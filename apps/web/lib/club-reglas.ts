// El club de clientas en la web (ADR-0288, D-4 reescrita y tanda 1b). Lógica pura: la usan Cobrar, el ticket impreso,
// /clientas, el cartel y Configuración, del lado del servidor y del navegador.
//
// Dos permisos distintos (Ley 32323, CL-31):
//   · SOCIA (club): su «sí» de palabra en caja o en la ficha. Beneficios y avisos informativos (su apartado, la talla que
//     pidió, su boleta).
//   · PUBLICIDAD por WhatsApp: SOLO si ella escribe primero desde el QR. La base no deja marcarla de otra forma.
// Lo que manda es la base (`unirse_al_club`, `registrar_mensaje_publicidad`…); esto solo arma textos y enlaces.

import { enlaceWhatsAppA } from "./facturacion-comprobantes-reglas";

export type TipoTextoClub = "club" | "mensaje_personal" | "mensaje_generico";
export type TextoClub = { tipo: TipoTextoClub; version: number; texto: string };

/** Cómo está una ficha frente al club. */
export type EstadoClub = "no_socia" | "socia" | "socia_con_publicidad";

export function estadoClub(c: { clubDesde: string | null; publicidadDesde: string | null }): EstadoClub {
  if (!c.clubDesde) return "no_socia";
  return c.publicidadDesde ? "socia_con_publicidad" : "socia";
}

/** Un celular peruano: 9 dígitos que empiezan en 9 (la base exige lo mismo para el de la tienda). */
export function celularValido(numero: string | null | undefined): boolean {
  return /^9[0-9]{8}$/.test((numero ?? "").replace(/\s/g, ""));
}

/** Solo los dígitos, hasta 9: lo que queda en la caja del celular al escribir o pegar «+51 987 654 321». */
export function ajustarCelular(numero: string): string {
  const d = numero.replace(/\D/g, "");
  return (d.length > 9 && d.startsWith("51") ? d.slice(2) : d).slice(0, 9);
}

/** El texto vigente de un tipo, o null si no hay (sin texto `club` no se ofrece «Invitar»). */
export function textoVigente(textos: readonly TextoClub[], tipo: TipoTextoClub): TextoClub | null {
  return textos.filter((t) => t.tipo === tipo).sort((a, b) => b.version - a.version)[0] ?? null;
}

/** El mensaje personalizado que ella envía, con su código de socia en lugar de `{codigo}`. */
export function mensajePersonal(plantilla: string, codigoClub: string): string {
  return plantilla.split("{codigo}").join(codigoClub);
}

/**
 * El enlace que abre el WhatsApp DE LA TIENDA con el texto listo para que ELLA lo envíe (el QR lo codifica). `null` si la
 * tienda no tiene número cargado (Configuración ▸ Tiendas y caja): sin número no hay QR, y el club sigue sin publicidad.
 */
export function enlaceQrClub(numeroTienda: string | null | undefined, texto: string): string | null {
  if (!celularValido(numeroTienda)) return null;
  return enlaceWhatsAppA(numeroTienda!.replace(/\s/g, ""), texto);
}

/** «C-0142»: así se lee el código en caja, en la ficha y en el mensaje que llega. */
export function codigoClubLegible(codigo: string | null): string | null {
  return codigo ? codigo.toUpperCase() : null;
}

/**
 * Del texto que llegó por WhatsApp (o que escribe la asesora), el código de socia que trae, normalizado: «club c-142»,
 * «(Club C-0142)» o «C0142» → «C-0142». null si no trae ninguno.
 */
export function codigoEnTexto(texto: string): string | null {
  const m = texto.toUpperCase().match(/\bC-?\s?(\d{1,6})\b/);
  return m ? `C-${m[1]!.padStart(4, "0")}` : null;
}
