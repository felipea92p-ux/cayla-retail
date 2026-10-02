// El club en la CAJA (ADR-0288, tandas 1b y 1g): qué muestra la caja de la clienta en Cobrar, qué pide «Registrar clienta»
// (en Cobrar y en /clientas). Lógica pura, sin React ni red: la usan la página de Vender
// (servidor), `PuntoDeVenta`, `ClientaDelTicket` y `NuevaClientaModal`. El cumpleaños tiene su propia regla
// (`lib/club-cumple-reglas.ts`), y sus canjes, las suyas (`club-cumple-canje-reglas.ts`, `club-aniversario-canje-reglas.ts`).
//
// El dibujo sigue el spike visual del club (`docs/maquetas/club-clientas-spike-2026-09/fuente/src/45-club-caja.js`, commit
// 94f2dece): lo del club va DENTRO de la caja del nombre y el documento, plegado.
//
// Tanda 1g («Actualización 2026-10-01 (g)», G-1, G-2): ella se une sola, escaneando el cartel del club. La caja ya no invita
// ni muestra un QR personal: registra a la clienta solo con su documento y, si no es socia, le pide a la asesora que le
// muestre el cartel; la tarjeta vuelve a leer su resumen sola y pasa a «Socia» cuando ella se une con ese documento.
//
// CONTRATO
//   PROMETE: decir qué se ofrece en caja según lo que la base contestó (`resumen_clienta_caja`, `fn_club_textos_vigentes`,
//            `ubicaciones.whatsapp_numero`), validar lo que la asesora escribe al registrarla (y la guía de foco de esa hoja,
//            que sale de la MISMA validación), decir hasta cuándo la tarjeta pregunta si ya se unió.
//   ASUME:   quien decide si alguien ES socia es la base: se une desde la página del cartel (`registrarse_en_el_club`).
//   NO HACE: no une al club ni registra la publicidad: ese permiso solo nace de un acto de ELLA, en la página del cartel
//            (D-4, Ley 32323; G-12: la casilla es opcional).

import { celularValido, codigoClubLegible, ajustarCelular, type TextoClub, type TipoTextoClub } from "./club-reglas";
import type { ResumenClientaCaja } from "./club-acciones";
import { MESES_DEL_ANIO } from "./club-cumple-reglas";
import { PCT_CUMPLE_POR_DEFECTO, pctLegible } from "./club-cumple-canje-reglas";
import { lineaDeClienta, type ClientaDelTicket } from "./clienta-ticket-reglas";
import { normalizarNumeroDocumento, problemaDocumento, type TipoDocumentoClienta } from "./documento-clienta-reglas";
import type { CampoDeGuia } from "./guia-campos";

/* ------------------------------------------------------------------ Lo que la caja sabe del club al abrir Vender */

/**
 * Los textos vigentes y el WhatsApp de ESTA tienda. Los lee el servidor al abrir Vender. Si la lectura falla (o la migración
 * todavía no está en producción), llega apagado y la venta sigue igual (principio 9): sin «Invitar» y sin QR.
 */
export type ClubDeLaCaja = { textos: readonly TextoClub[]; whatsappTienda: string | null };
export const CLUB_APAGADO: ClubDeLaCaja = { textos: [], whatsappTienda: null };

const TIPOS_TEXTO: readonly TipoTextoClub[] = ["club", "mensaje_personal", "mensaje_generico"];

/** Arma `ClubDeLaCaja` con lo que devolvió la base. Descarta lo que no entiende: un tipo nuevo, un texto vacío, un número
 *  que no es un celular. */
export function clubDeLaCaja(
  filas: readonly { tipo: string; version: number; texto: string | null }[] | null | undefined,
  numeroTienda: string | null | undefined
): ClubDeLaCaja {
  const textos: TextoClub[] = [];
  for (const f of filas ?? []) {
    const tipo = TIPOS_TEXTO.find((t) => t === f.tipo);
    if (tipo && f.texto?.trim()) textos.push({ tipo, version: Number(f.version), texto: f.texto });
  }
  const numero = (numeroTienda ?? "").replace(/\s/g, "");
  return { textos, whatsappTienda: celularValido(numero) ? numero : null };
}

/* ------------------------------------------------------------------ La fila de la clienta en Cobrar */

/** Lo que la fila sabe de la clienta frente al club (`resumen_clienta_caja`). */
export type LecturaClub =
  /** Sin clienta en el ticket, o sin el módulo «Clientas»: no se pregunta nada. */
  | { estado: "sin_leer" }
  | { estado: "leyendo" }
  /** La base no respondió, o todavía no tiene la función: la fila queda como antes del club y la venta sigue. */
  | { estado: "fallo" }
  | { estado: "listo"; resumen: ResumenClientaCaja };

/**
 * La publicidad de una socia, como la dice su chip: `activa` («Publicidad», en verde) si marcó la casilla en la página del
 * cartel; si no, `sin` («Sin publicidad»). Ya no es tocable: la publicidad la pide ella desde el cartel (G-1, G-12), no hay
 * QR personal que mostrarle.
 */
export type PublicidadEnCaja = "activa" | "sin";

export type CajaDelClub =
  /** Leyendo, sin leer, o la base no respondió: la caja queda como antes del club y la venta sigue (principio 9). */
  | { tipo: "nada" }
  /** Socia: su código va en la línea del documento; `cumple` es la fila de adentro (plegada por defecto). */
  | { tipo: "socia"; codigo: string | null; publicidad: PublicidadEnCaja; cumple: string | null }
  /**
   * Tiene ficha y no es del club: la fila «Pídele que escanee el cartel del club». `sinDocumento`: su ficha no tiene
   * documento, así que al unirse desde el cartel (que pide el documento) no caería en ESTA ficha: la fila lo dice y la
   * tarjeta no se queda esperando.
   */
  | { tipo: "identificada"; sinDocumento: boolean };

/**
 * Lo del club dentro de la caja de la clienta del ticket (spike del club, `clientaDelTicketHTML` y `partesClub`).
 *   · Socia: el chip «Socia», el de su publicidad y, adentro, su cumpleaños y su vale de aniversario.
 *   · Identificada: el chip «Identificada» y la fila del cartel, en cada compra (G-2).
 * `ficha`: lo que el ticket sabe de ella (su documento).
 */
export function cajaDelClub(v: { lectura: LecturaClub; ficha: Pick<ClientaDelTicket, "documentoNumero"> }): CajaDelClub {
  if (v.lectura.estado !== "listo") return { tipo: "nada" };
  const r = v.lectura.resumen;
  if (r.esSocia) {
    const codigo = codigoClubLegible(r.codigoClub);
    return { tipo: "socia", codigo, publicidad: r.conPublicidad ? "activa" : "sin", cumple: textoCumple(r.cumpleDia, r.cumpleMes) };
  }
  return { tipo: "identificada", sinDocumento: !normalizarNumeroDocumento(v.ficha.documentoNumero ?? "") };
}

/** «Cumple el 12 de setiembre», o null si la ficha no tiene día y mes. */
export function textoCumple(dia: number | null, mes: number | null): string | null {
  if (!dia || !mes || mes < 1 || mes > 12) return null;
  return `Cumple el ${dia} de ${MESES_DEL_ANIO[mes - 1]!.toLocaleLowerCase("es")}`;
}

/**
 * El nombre y la línea de abajo de la caja: «DNI 45•••236 · Cel. 987 654 321 · C-0142» (spike). El celular, el más fresco
 * (el del resumen: pudo cambiar al unirse desde el cartel); el código, solo si es socia.
 */
export function lineaDeLaClientaEnCaja(clienta: ClientaDelTicket, celularFresco: string | null, codigo: string | null): { titulo: string; detalle: string } {
  const celular = celularFresco ?? clienta.celular;
  const l = lineaDeClienta({ ...clienta, celular: celular ? celularLegible(celular) : null });
  return { titulo: l.titulo, detalle: [l.detalle, codigo].filter(Boolean).join(" · ") };
}

/** Cómo se lee la clienta en la lista del buscador (spike: «… · Socia» / «… · Identificada»). */
export function estadoEnLaLibreta(clubDesde: string | null | undefined): "Socia" | "Identificada" {
  return clubDesde ? "Socia" : "Identificada";
}

/* ------------------------------------------------------------------ El celular */

/** «987 654 321»: así se lee en la caja; a la base viajan solo los 9 dígitos (`ajustarCelular`). */
export function celularLegible(numero: string): string {
  const d = ajustarCelular(numero);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(" ");
}

/** El celular es opcional (en «Editar» de la ficha), pero si se escribe, bien: la base lo rechaza igual (`celular_invalido`). */
export function problemaCelularOpcional(celular: string): string | null {
  return celular.trim() === "" || celularValido(celular) ? null : "Un celular peruano tiene 9 dígitos y empieza con 9.";
}

/* ------------------------------------------------------------------ La guía de foco de «Registrar clienta» */
//
// CLAUDE.md «Guía de foco» (ADR-0284): lo que la hoja marca como hecho, lo que sigue y lo que falta sale de la MISMA regla que
// apaga su botón (`sePuedeConfirmar(campos)` es lo que se pregunta al confirmar).

/** Lo escrito en «Registrar clienta» (Cobrar y Clientas ▸ Nueva clienta; spike, `modalRegistrar`). */
export type HojaRegistrar = {
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string;
  nombre: string;
  responsableListo: boolean;
  responsableMotivo: string | null;
};

/** Un nombre de verdad: el spike pide 3 letras como mínimo (`modalRegistrar`, `nOk`); con DNI lo trae el padrón. */
export const nombreSuficiente = (nombre: string) => nombre.trim().length >= 3;

/**
 * Registrar a una clienta (tanda 1g, G-2): SOLO su documento. Con DNI el nombre llega del padrón DENTRO del mismo bloque (si
 * no responde, se escribe ahí); con carné o pasaporte, en su propio bloque. El celular y el cumpleaños ya no se piden: los
 * escribe ella al unirse desde el cartel, y «Editar» de su ficha los corrige. Y quién registra. Es la MISMA regla en Cobrar
 * (`ClientaDelTicket`) y en Clientas ▸ Nueva clienta (`NuevaClientaModal`).
 */
export function camposDeRegistrar(h: HojaRegistrar): CampoDeGuia[] {
  const esDni = h.documentoTipo === "dni";
  const problema = problemaDocumento(h.documentoTipo, h.documentoNumero);
  const documentoBien = normalizarNumeroDocumento(h.documentoNumero) !== "" && problema === null;
  const nombreBien = nombreSuficiente(h.nombre);
  return [
    {
      id: "documento",
      // Con DNI, el nombre vive en este mismo bloque: si el documento ya está y falta el nombre, lo que falta es el nombre.
      nombre: esDni && documentoBien && !nombreBien ? "Nombre" : "Documento",
      requerido: true,
      hecho: documentoBien && (!esDni || nombreBien),
      pendiente: normalizarNumeroDocumento(h.documentoNumero) === "" ? "Elige el tipo y escribe el número." : (problema ?? "Escribe su nombre."),
    },
    ...(esDni ? [] : [{ id: "nombre", nombre: "Nombre", requerido: true, hecho: nombreBien, pendiente: "Escribe su nombre." }]),
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién registra." },
  ];
}

/* ------------------------------------------------------------------ El QR del camino A */


/* ------------------------------------------------------------------ «Pídele que escanee el cartel» (tanda 1g, G-2) */
//
// Mientras la tarjeta de una clienta que no es socia está a la vista, Cobrar vuelve a leer su resumen cada 3 s: cuando ella
// se une desde el cartel con ese documento, la tarjeta pasa sola a «Socia» (con su chip y, si es su mes, su cumpleaños).
// Deja de preguntar con la pestaña oculta y a los 10 minutos («¿Ya se unió? Actualizar»): una tarjeta olvidada no pregunta
// toda la tarde. Sin animación en bucle (ADR-0136): la fila dice que se actualiza sola, no late.

/** Cada cuánto se le pregunta a la base si ya se unió. */
export const CONSULTA_CARTEL_CADA_MS = 3_000;
/** Hasta cuándo: después queda «¿Ya se unió? Actualizar». */
export const CONSULTA_CARTEL_HASTA_MS = 10 * 60_000;

/**
 * Si la tarjeta sigue preguntando:
 *   · `esperando`: sí, cada 3 s;
 *   · `pausada`: la pestaña está oculta (nadie la mira): deja de preguntar y sigue sola al volver;
 *   · `vencida`: pasaron 10 minutos desde que empezó a esperar: deja de preguntar y ofrece «Actualizar».
 */
export type EsperaDelCartel = "esperando" | "pausada" | "vencida";

export function esperaDelCartel(v: { visible: boolean; desdeMs: number; ahoraMs: number }): EsperaDelCartel {
  if (v.ahoraMs - v.desdeMs >= CONSULTA_CARTEL_HASTA_MS) return "vencida";
  return v.visible ? "esperando" : "pausada";
}

/** Lo que dice la fila del cartel. `actualizar`: lleva el botón «Actualizar» (la espera venció). `consultar`: la tarjeta
 *  pregunta sola. */
export type FilaDelCartel = { destacado: string; bajada: string; ayuda: string; actualizar: boolean; consultar: boolean };

/**
 * La fila de una clienta que no es socia: «Pídele que escanee el cartel del club» y, en una línea, por qué le conviene (el
 * cupón de cumpleaños y el vale de aniversario). El % sale de la base (`cumple_pct`), nunca escrito a mano.
 */
export function filaDelCartel(v: { sinDocumento: boolean; espera: EsperaDelCartel; cumplePct: number | null }): FilaDelCartel {
  const pct = pctLegible(v.cumplePct && v.cumplePct > 0 ? v.cumplePct : PCT_CUMPLE_POR_DEFECTO);
  const destacado = "Pídele que escanee el cartel del club";
  const porQue = `Gana ${pct} % en su cumpleaños y un vale cada aniversario`;
  if (v.sinDocumento) {
    return {
      destacado,
      bajada: `${porQue}. Su ficha no tiene documento: complétalo en Clientas para que se una con esta ficha.`,
      ayuda: "En el cartel se une con su documento: sin él en esta ficha, se crearía otra.",
      actualizar: false,
      consultar: false,
    };
  }
  const ayuda = "Se une sola, en su celular, con este mismo documento. La tarjeta se actualiza cuando lo haga.";
  if (v.espera === "vencida") return { destacado, bajada: `${porQue}. ¿Ya se unió? Toca «Actualizar».`, ayuda, actualizar: true, consultar: false };
  return { destacado, bajada: `${porQue} · se actualiza sola`, ayuda, actualizar: false, consultar: v.espera === "esperando" };
}

// El ticket impreso no lleva QR del club (ADR-0288 act. j, Felipe 2026-10-01): la clienta se une con el QR del cartel.
