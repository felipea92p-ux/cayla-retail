// Lo que /clientas necesita del club (ADR-0288, D-4 reescrita y tanda 1b), sin React ni red: el estado de una ficha en
// palabras, cómo se lee su cumpleaños, el aviso al cambiarle el celular a una socia con novedades y, sobre todo, «Llegó un
// mensaje de WhatsApp»: leer lo que ella escribió y decidir qué se registra. Las reglas de verdad (quién puede ser socia, que la publicidad solo nace de un mensaje de ella)
// las hace cumplir la base; esto solo elige cuál de sus funciones llamar y qué decirle a la asesora.
//
// CONTRATO
//   PROMETE: `leerMensaje` separa una BAJA de un pedido de novedades y saca el código de socia si lo trae;
//            `queHacerConElMensaje` dice, para la ficha encontrada (o ninguna), qué función del club corresponde.
//   ASUME:   el mensaje lo pegó la asesora tal cual llegó al WhatsApp de la tienda.
//   NO HACE: no busca la ficha (eso es `clientas-acciones.ts`) ni guarda nada.

import { ajustarCelular, codigoClubLegible, codigoEnTexto, estadoClub } from "./club-reglas";

/* ------------------------------------------------------------------
   El estado de una ficha frente al club, en palabras
   ------------------------------------------------------------------ */

type FichaDelClub = { clubDesde: string | null; publicidadDesde: string | null; codigoClub: string | null };

export type TextoEstadoClub = {
  /** La línea principal en la ficha: «No es del club», «Socia desde 12 oct. 2026 · C-0142»… */
  titulo: string;
  /** La línea chica de abajo (qué significa), o null. */
  detalle: string | null;
  /** Lo que va en la fila de la lista: «C-0142 · Con novedades». */
  corto: string;
};

/** `fecha` formatea un ISO como lo muestra la pantalla («12 oct. 2026»): se recibe para que esto no dependa del idioma del navegador. */
export function textoEstadoClub(c: FichaDelClub, fecha: (iso: string) => string): TextoEstadoClub {
  const codigo = codigoClubLegible(c.codigoClub);
  switch (estadoClub(c)) {
    case "no_socia":
      return { titulo: "No es del club", detalle: null, corto: "No es del club" };
    case "socia":
      return {
        titulo: ["Socia desde " + fecha(c.clubDesde!), codigo].filter(Boolean).join(" · "),
        detalle: "Sin novedades por WhatsApp: le llegan solo si ella las pide desde su QR (o le escribe a la tienda).",
        corto: [codigo, "Socia"].filter(Boolean).join(" · "),
      };
    case "socia_con_publicidad":
      return {
        titulo: "Socia · recibe novedades por WhatsApp",
        detalle: [codigo, `socia desde ${fecha(c.clubDesde!)}`, `novedades desde ${fecha(c.publicidadDesde!)}`].filter(Boolean).join(" · "),
        corto: [codigo, "Con novedades"].filter(Boolean).join(" · "),
      };
  }
}

/* ------------------------------------------------------------------
   El cumpleaños (CL-3: día y mes; el año es opcional). La regla que valida lo escrito es UNA para Cobrar y /clientas:
   `lib/club-cumple-reglas.ts`. Aquí solo cómo se lee en la ficha.
   ------------------------------------------------------------------ */

/** «12/3», «12/3/1990» o «—». */
export function cumpleLegible(dia: number | null, mes: number | null, anio: number | null): string {
  if (!dia || !mes) return "—";
  return anio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`;
}

/* ------------------------------------------------------------------
   Cambiar el celular de una socia con publicidad
   ------------------------------------------------------------------ */

export const AVISO_CAMBIO_CELULAR = "Si cambias su celular, deja de recibir novedades hasta que las vuelva a pedir desde el número nuevo.";

/**
 * El aviso ANTES de guardar un celular nuevo en la ficha de una socia que recibe novedades: la base se las quita sola al
 * cambiarlo (`editar_clienta` escribe el `revoca` con medio `cambio_celular`, y el disparador `clientas_celular_con_publicidad`
 * no deja hacerlo por otro camino). null si no pierde nada: sin publicidad, el mismo número, o vacío (eso lo frena otra
 * regla: a una socia no se le borra el celular, `socia_sin_celular`).
 */
export function avisoCambioDeCelular(c: { publicidadDesde: string | null; telefonoWhatsapp: string | null }, celularNuevo: string): string | null {
  if (!c.publicidadDesde || ajustarCelular(celularNuevo) === "") return null;
  return cambiaDeCelular(c.telefonoWhatsapp, celularNuevo) ? AVISO_CAMBIO_CELULAR : null;
}

/* ------------------------------------------------------------------
   «Llegó un mensaje de WhatsApp»
   ------------------------------------------------------------------ */

export type LoQuePide = "novedades" | "baja";

/** Minúsculas, sin tildes, sin signos ni emojis, un solo espacio: para comparar lo que escribió sin fijarse en la forma. */
export function normalizarMensaje(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Lo que cuenta como BAJA es el mensaje ENTERO, no una palabra suelta: los dos mensajes del QR dicen «me doy de baja
// escribiendo BAJA», y «¿la blusa baja de precio?» no es una baja. Si no calza, la asesora la marca a mano en «Qué pide».
const FRASES_BAJA: ReadonlySet<string> = new Set(["baja", "stop", "de baja", "dar de baja", "darme de baja", "quiero darme de baja", "me doy de baja"]);

/** ¿El mensaje entero es un pedido de baja? («BAJA», «baja.», «STOP», «Darme de baja»). */
export function pideBaja(texto: string): boolean {
  return FRASES_BAJA.has(normalizarMensaje(texto));
}

export type LecturaMensaje = { pide: LoQuePide; codigo: string | null };

/** Qué pide y, si trae su código de socia («(Club C-0142)»), cuál. Una baja no busca código: vale para su número. */
export function leerMensaje(texto: string): LecturaMensaje {
  if (pideBaja(texto)) return { pide: "baja", codigo: null };
  return { pide: "novedades", codigo: codigoEnTexto(texto) };
}

/** ¿El número que escribió es otro que el de su ficha? (Si es otro, `registrar_mensaje_publicidad` lo deja como su celular.) */
export function cambiaDeCelular(celularDeLaFicha: string | null, numeroQueEscribio: string): boolean {
  return ajustarCelular(celularDeLaFicha ?? "") !== ajustarCelular(numeroQueEscribio);
}

type FichaParaMensaje = FichaDelClub & { documentoNumero: string | null; nombre: string | null; telefonoWhatsapp: string | null };

/** CL-1 (ajuste del contrato 1b, 2026-09-30): para ser socia hacen falta documento, nombre y celular. Esto dice qué le falta
 *  a una ficha ANTES de ofrecerle el club (el celular se pide en el mismo paso); `null` si tiene documento y nombre. */
export function faltaParaSerSocia(c: { documentoNumero: string | null; nombre: string | null }): string | null {
  const falta = [!c.documentoNumero ? "documento" : null, !c.nombre?.trim() ? "nombre" : null].filter(Boolean);
  return falta.length ? `Para unirla al club, su ficha necesita ${falta.join(" y ")}: complétalos con «Editar».` : null;
}

export type QueHacer =
  /** `registrar_baja_whatsapp` con el número que escribió. */
  | { accion: "baja" }
  /** Es socia sin publicidad, o con publicidad pero escribió desde otro número: `registrar_mensaje_publicidad` (el número
   *  que escribió pasa a ser su celular). */
  | { accion: "registrar_mensaje"; cambiaCelular: boolean }
  /** Ya tiene la publicidad y escribió desde el mismo número: no hay nada que registrar. */
  | { accion: "ya_tiene_publicidad" }
  /** Tiene ficha con documento y nombre pero no es socia: `registrar_desde_whatsapp` con SU documento la hace socia con
   *  novedades. */
  | { accion: "unir_con_su_documento" }
  /** Sin ficha (el cartel, un ticket sin clienta) o una ficha sin documento o sin nombre: hay que pedírselos en el chat
   *  (CL-1: socia = documento + nombre + celular). Con `completaFicha`, se guardan primero en la ficha encontrada, para no
   *  crear otra con el mismo celular. */
  | { accion: "pedir_documento"; completaFicha: boolean };

export function queHacerConElMensaje(pide: LoQuePide, ficha: FichaParaMensaje | null, numeroQueEscribio: string): QueHacer {
  if (pide === "baja") return { accion: "baja" };
  if (!ficha) return { accion: "pedir_documento", completaFicha: false };
  switch (estadoClub(ficha)) {
    case "socia_con_publicidad":
      return cambiaDeCelular(ficha.telefonoWhatsapp, numeroQueEscribio) ? { accion: "registrar_mensaje", cambiaCelular: true } : { accion: "ya_tiene_publicidad" };
    case "socia":
      return { accion: "registrar_mensaje", cambiaCelular: cambiaDeCelular(ficha.telefonoWhatsapp, numeroQueEscribio) };
    case "no_socia":
      return faltaParaSerSocia(ficha) === null ? { accion: "unir_con_su_documento" } : { accion: "pedir_documento", completaFicha: true };
  }
}
