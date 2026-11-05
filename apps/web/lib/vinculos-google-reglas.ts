// Clientas ▸ Avisos ▸ «Cuentas de Google unidas a un miembro» (ADR-0469). Lógica pura: la usan la página (servidor) y el bloque (navegador),
// y se prueba con `vinculos-google-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer las filas de `fn_vinculos_google_recientes` sin confiar en ellas (una fila rota o de un estado que esta web no conoce
//            se ignora), armar el mensaje de WhatsApp para la dueña de la ficha y su enlace, y decir si se puede mandar tal como está.
//   ASUME:   QUÉ vínculos aparecen (los últimos 60 días, con la cuenta todavía abierta, sin deshacer) lo decide la base.
//   NO HACE: no envía nada ni escribe en la base: WhatsApp lo abre el bloque y lo anota `vinculos-google-acciones.ts`. El aviso NO es
//            publicidad (no pasa por el permiso de WhatsApp del Club ni por el tope de promociones): es avisarle a la dueña de una ficha
//            que alguien la unió a una cuenta de Google. Por eso el texto no dice «responde BAJA».

import { numeroWhatsApp } from "./facturacion-comprobantes-reglas";
import { primerNombre } from "./club-avisos-reglas";

export type EstadoAvisoVinculo = "pendiente" | "enviado" | "sin_celular";

const ESTADOS: readonly EstadoAvisoVinculo[] = ["pendiente", "enviado", "sin_celular"];

/** Una fila tal como la devuelve `fn_vinculos_google_recientes()`. */
export type FilaVinculoGoogle = {
  id: string;
  clienta_id: string;
  nombre: string | null;
  telefono: string | null;
  nombre_google: string | null;
  correo: string | null;
  creado_en: string;
  aviso_estado: string;
  avisado_en: string | null;
};

export type VinculoGoogle = {
  id: string;
  clientaId: string;
  /** La ficha a la que se unió la cuenta de Google. */
  nombre: string;
  /** Completo: solo viaja al enlace de WhatsApp. En pantalla, `celularAMedias`. */
  telefono: string | null;
  /** El nombre con que Google se presentó: lo que un líder compara con la ficha para decidir si es la misma persona. */
  nombreGoogle: string;
  correo: string;
  creadoEn: string;
  aviso: EstadoAvisoVinculo;
  avisadoEn: string | null;
};

export function leerVinculos(filas: readonly FilaVinculoGoogle[]): VinculoGoogle[] {
  const vistos = new Set<string>();
  const salida: VinculoGoogle[] = [];
  for (const f of filas) {
    if (!f || !f.id || !f.clienta_id || !f.correo) continue;
    const aviso = ESTADOS.find((e) => e === f.aviso_estado);
    if (!aviso || vistos.has(f.id)) continue;
    vistos.add(f.id);
    salida.push({
      id: f.id,
      clientaId: f.clienta_id,
      nombre: f.nombre?.trim() || "Miembro sin nombre",
      telefono: f.telefono?.trim() || null,
      nombreGoogle: f.nombre_google?.trim() || "—",
      correo: f.correo,
      creadoEn: f.creado_en,
      aviso,
      avisadoEn: f.avisado_en,
    });
  }
  return salida;
}

/** «an••••@gmail.com»: el correo de Google se muestra a medias en el mensaje a la dueña de la ficha (el aviso puede llegar a quien no es). */
export function correoAMedias(correo: string): string {
  const [local = "", dominio = ""] = correo.split("@");
  if (!dominio) return "••••";
  return `${local.slice(0, 2)}••••@${dominio}`;
}

/** El mensaje de WhatsApp a la dueña de la ficha. Sin datos de más: ni su documento ni el nombre con que Google se presentó. */
export function textoDelAviso(v: Pick<VinculoGoogle, "nombre" | "correo">, tienda: string): string {
  const nombre = primerNombre(v.nombre);
  const saludo = nombre ? `Hola ${nombre}` : "Hola";
  return (
    `${saludo}, te escribimos de CAYLA (${tienda.trim()}). ` +
    `Hoy alguien entró a nuestra tienda online con la cuenta de Google ${correoAMedias(v.correo)} y la unió a tus datos de CAYLA. ` +
    `Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, respóndenos a este mensaje y lo revisamos de inmediato.`
  );
}

/** El enlace que abre WhatsApp WEB en el chat de la dueña con el texto escrito; `null` si el número no es un celular peruano. */
export function enlaceDelAviso(v: Pick<VinculoGoogle, "telefono">, texto: string): string | null {
  const n = numeroWhatsApp(v.telefono);
  return n ? `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(texto)}` : null;
}

/** Por qué este aviso no se puede mandar, o null. */
export function problemaParaAvisar(v: Pick<VinculoGoogle, "telefono" | "aviso">): string | null {
  if (v.aviso === "enviado") return "Ya se le avisó.";
  if (!numeroWhatsApp(v.telefono)) return "Su ficha no tiene un celular que se entienda: corrígelo en su ficha o avísale en la tienda.";
  return null;
}

/** Los que faltan avisar, primero; después los ya avisados. Dentro de cada grupo, el más reciente arriba. */
export function ordenarVinculos(vinculos: readonly VinculoGoogle[]): VinculoGoogle[] {
  const rango = (v: VinculoGoogle) => (v.aviso === "enviado" ? 1 : 0);
  return [...vinculos].sort((a, b) => rango(a) - rango(b) || (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0));
}
