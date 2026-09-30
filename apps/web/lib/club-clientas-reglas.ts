// Lo que /clientas necesita del club (ADR-0288, D-4 reescrita y tanda 1b), sin React ni red: el estado de una ficha en
// palabras, el cumpleaños con su año opcional y, sobre todo, «Llegó un mensaje de WhatsApp»: leer lo que ella escribió y
// decidir qué se registra. Las reglas de verdad (quién puede ser socia, que la publicidad solo nace de un mensaje de ella)
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
        detalle: "Sin novedades por WhatsApp: le llegan solo si ella le escribe a la tienda (desde el QR o por su cuenta).",
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
   El cumpleaños (CL-3: día y mes; el año es opcional)
   ------------------------------------------------------------------ */

/** «12/3», «12/3/1990» o «—». */
export function cumpleLegible(dia: number | null, mes: number | null, anio: number | null): string {
  if (!dia || !mes) return "—";
  return anio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`;
}

/** Lo que queda en la caja del año al tipear: solo cifras, hasta 4. */
export function ajustarAnio(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 4);
}

/** El año es opcional; si se escribe, son 4 cifras entre 1900 y el año en curso. `null` = está bien (o vacío). */
export function problemaAnio(texto: string, anioActual: number): string | null {
  const t = texto.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!/^\d{4}$/.test(t) || n < 1900 || n > anioActual) return `El año tiene 4 cifras, entre 1900 y ${anioActual}. Si no lo dijo, déjalo vacío.`;
  return null;
}

/** Los meses como los muestra el combo del cumpleaños (como el spike del club). El valor es su número, «1» a «12». */
export const MESES_CUMPLE: readonly { valor: string; texto: string }[] = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map(
  (texto, i) => ({ valor: String(i + 1), texto }),
);

export type EstadoCumple = {
  /** Día y mes válidos (el año, si está, también). */
  completo: boolean;
  /** Lo que impide guardar (día sin mes, un día fuera de 1–31, un año mal), o null. Vacío del todo no es problema: es opcional. */
  problema: string | null;
};

/** El cumpleaños que se escribe en un formulario (como `cumpleForm` del spike del club): opcional, pero si se empieza, completo. */
export function estadoCumple(dia: string, mes: string, anio: string, anioActual: number): EstadoCumple {
  const d = dia.trim();
  const m = mes.trim();
  const diaBien = /^\d{1,2}$/.test(d) && Number(d) >= 1 && Number(d) <= 31;
  const mesBien = /^\d{1,2}$/.test(m) && Number(m) >= 1 && Number(m) <= 12;
  const delAnio = problemaAnio(anio, anioActual);
  if (d === "" && m === "") return { completo: false, problema: anio.trim() === "" ? null : "Falta el día y el mes." };
  if (d !== "" && !diaBien) return { completo: false, problema: "El día va del 1 al 31." };
  if (!diaBien || !mesBien) return { completo: false, problema: "Falta el día o el mes." };
  return { completo: delAnio === null, problema: delAnio };
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

/* ------------------------------------------------------------------
   El filtro de la lista de /clientas (como el spike del club, `fichasHTML`): sobre lo que está a la vista
   ------------------------------------------------------------------ */

export type FiltroClub = "todas" | "socias" | "con_publicidad" | "sin_publicidad" | "sin_celular" | "cumplen_este_mes";

export const FILTROS_CLUB: readonly { valor: FiltroClub; texto: string }[] = [
  { valor: "todas", texto: "Todas" },
  { valor: "socias", texto: "Socias" },
  { valor: "con_publicidad", texto: "Con publicidad" },
  { valor: "sin_publicidad", texto: "Sin publicidad" },
  { valor: "sin_celular", texto: "Sin celular" },
  { valor: "cumplen_este_mes", texto: "Cumplen este mes" },
];

/** «Sin publicidad» son las SOCIAS que todavía no la pidieron (una identificada no tiene nada que pedir). `mesActual`
 *  (1–12, en Lima) llega de afuera para que esto no lea el reloj. */
export function pasaFiltroClub(
  c: FichaDelClub & { telefonoWhatsapp: string | null; cumpleMes: number | null },
  filtro: FiltroClub,
  mesActual: number,
): boolean {
  const estado = estadoClub(c);
  switch (filtro) {
    case "todas":
      return true;
    case "socias":
      return estado !== "no_socia";
    case "con_publicidad":
      return estado === "socia_con_publicidad";
    case "sin_publicidad":
      return estado === "socia";
    case "sin_celular":
      return !c.telefonoWhatsapp?.trim();
    case "cumplen_este_mes":
      return c.cumpleMes === mesActual;
  }
}
