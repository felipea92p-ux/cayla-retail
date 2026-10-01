// El club en la CAJA (ADR-0288, tanda 1b): qué muestra la caja de la clienta en Cobrar, qué piden «Registrar clienta» e
// «Invitar», qué dice la cara de su QR y qué QR sale en el ticket impreso. Lógica pura, sin React ni red: la usan la página
// de Vender (servidor), `PuntoDeVenta`, `ClientaDelTicket`, `InvitarAlClub` y la cara del QR que comparten Cobrar y la ficha
// de /clientas (`components/clientas/CaraDelQrClub.tsx`). El cumpleaños tiene su propia regla: `lib/club-cumple-reglas.ts`.
//
// El dibujo sigue el spike visual del club (rama `claude/spyke-club-clientas-visual-631f7a`,
// `docs/maquetas/club-clientas-spike-2026-09/fuente/src/45-club-caja.js` y `47-club-qr.js`): lo del club va DENTRO de la
// caja del nombre y el documento, plegado; «Invitar» llega con el celular y el cumpleaños de la ficha; al unirla, su QR.
//
// CONTRATO
//   PROMETE: decir qué se ofrece en caja según lo que la base contestó (`resumen_clienta_caja`, `fn_club_textos_vigentes`,
//            `ubicaciones.whatsapp_numero`), validar lo que la asesora escribe al registrarla o invitarla (y la guía de foco
//            de esas hojas, que sale de la MISMA validación), decir qué muestra la cara del QR en cada momento (camino B, con
//            el camino A de respaldo) y armar el QR del ticket.
//   ASUME:   quien decide si alguien PUEDE ser socia es la base (`unirse_al_club`: celular, documento y nombre, texto `club`
//            vigente, ficha activa). Esto solo evita ofrecer lo que la base rechazaría y dice por qué.
//   NO HACE: no registra la publicidad. Ese permiso solo nace de un acto de ELLA (D-4, Ley 32323): marcar la casilla en la
//            página de CAYLA que abre su QR (camino B, ADR-0288 act. c; lo registra `confirmar_invitacion_club`) o escribirle
//            a la tienda (camino A, «Llegó su mensaje», de respaldo). El ticket impreso sigue con el QR del camino A.

import {
  ajustarCelular,
  celularValido,
  codigoClubLegible,
  enlaceQrClub,
  mensajePersonal,
  textoVigente,
  type TextoClub,
  type TipoTextoClub,
} from "./club-reglas";
import { enlacePaginaClub } from "./club-reglas";
import type { ResumenClientaCaja } from "./club-acciones";
import { CUMPLE_VACIO, MESES_DEL_ANIO, cumpleCompleto, cumpleVacio, problemaCumple, type CumpleEscrito } from "./club-cumple-reglas";
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
 * La publicidad de una socia, como la dice su chip (spike, `chipPub`):
 *   · `activa`: ya la pidió — «Publicidad», en verde;
 *   · `qr`: todavía no — «Sin publicidad · QR», tocable: abre su QR para que lo escanee ahora. Con el camino B (ADR-0288
 *     act. c) su QR es la página de CAYLA y no depende del WhatsApp de la tienda: siempre hay algo que mostrarle (si la
 *     página no se puede preparar, el QR del WhatsApp de la tienda; si tampoco hay, la hoja lo dice y queda «Llegó su
 *     mensaje»).
 */
export type PublicidadEnCaja = "activa" | "qr";

/** Qué le falta a una clienta para que «Invitar» termine bien en caja. */
export type FaltaParaInvitar =
  /** La hoja lo pide: la tarjeta avisa «· falta su celular» y se invita igual. */
  | "celular"
  /** La base exige documento y nombre para ser socia (CL-1, `socia_sin_documento`) y la hoja de Cobrar no los pide: se
   *  completan en su ficha de Clientas. «Invitar» se apaga, con el porqué. */
  | "documento";

export type CajaDelClub =
  /** Leyendo, sin leer, o la base no respondió: la caja queda como antes del club y la venta sigue (principio 9). */
  | { tipo: "nada" }
  /** Socia: su código va en la línea del documento; `cumple` es la fila de adentro (plegada por defecto). */
  | { tipo: "socia"; codigo: string | null; publicidad: PublicidadEnCaja; cumple: string | null }
  /** Tiene ficha y no es del club. `invitar` null: no se la puede invitar desde aquí (sin texto `club`, sin el módulo). */
  | { tipo: "identificada"; invitar: { callada: boolean; falta: FaltaParaInvitar | null } | null };

/**
 * Lo del club dentro de la caja de la clienta del ticket (spike del club, `clientaDelTicketHTML` y `partesClub`).
 *   · Socia: el chip «Socia», el de su publicidad y, adentro, su cumpleaños (el 10 % es de la tanda 1c: aquí solo la fecha).
 *   · Identificada: el chip «Identificada» y la tarjeta «No es del club todavía — Invitar / Ahora no», en cada compra
 *     (CL-8). Con «Ahora no» en ESTA venta queda solo el enlace «Invitar al club».
 *   · Sin texto `club` vigente no se invita: la asesora no tendría qué leerle, y la base lo rechazaría (`club_sin_texto`).
 *   · Invitar es del módulo «Clientas» (la base lo exige): sin él, no se ofrece.
 * `ficha`: lo que el ticket sabe de ella (su documento, nombre y celular), por si el resumen no trae el celular.
 */
export function cajaDelClub(v: {
  lectura: LecturaClub;
  puedeInvitar: boolean;
  club: ClubDeLaCaja;
  ahoraNo: boolean;
  ficha: Pick<ClientaDelTicket, "documentoNumero" | "nombre" | "celular">;
}): CajaDelClub {
  if (v.lectura.estado !== "listo") return { tipo: "nada" };
  const r = v.lectura.resumen;
  if (r.esSocia) {
    const codigo = codigoClubLegible(r.codigoClub);
    const publicidad: PublicidadEnCaja = r.conPublicidad ? "activa" : "qr";
    return { tipo: "socia", codigo, publicidad, cumple: textoCumple(r.cumpleDia, r.cumpleMes) };
  }
  if (!v.puedeInvitar || !textoVigente(v.club.textos, "club")) return { tipo: "identificada", invitar: null };
  const sinDocumento = !normalizarNumeroDocumento(v.ficha.documentoNumero ?? "") || !v.ficha.nombre?.trim();
  const sinCelular = !celularValido(r.celular ?? v.ficha.celular);
  return { tipo: "identificada", invitar: { callada: v.ahoraNo, falta: sinDocumento ? "documento" : sinCelular ? "celular" : null } };
}

/** «Cumple el 12 de setiembre», o null si la ficha no tiene día y mes. */
export function textoCumple(dia: number | null, mes: number | null): string | null {
  if (!dia || !mes || mes < 1 || mes > 12) return null;
  return `Cumple el ${dia} de ${MESES_DEL_ANIO[mes - 1]!.toLocaleLowerCase("es")}`;
}

/**
 * El nombre y la línea de abajo de la caja: «DNI 45•••236 · Cel. 987 654 321 · C-0142» (spike). El celular, el más fresco
 * (el del resumen: pudo cambiar al invitarla); el código, solo si es socia.
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

/** El celular con que se abre la hoja: el de la ficha (o el del resumen, más fresco), ya limpio. */
export function celularParaInvitar(resumen: Pick<ResumenClientaCaja, "celular"> | null, celularDelTicket: string | null): string {
  return ajustarCelular(resumen?.celular ?? celularDelTicket ?? "");
}

/** «987 654 321»: así se lee (y se escribe) en la caja; a la base viajan solo los 9 dígitos (`ajustarCelular`). */
export function celularLegible(numero: string): string {
  const d = ajustarCelular(numero);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(" ");
}

const CELULAR_MAL = "Un celular peruano tiene 9 dígitos y empieza con 9.";

/** Por qué el celular escrito no sirve para el club, o null. El club son avisos por WhatsApp: sin celular no hay socia (CL-1). */
export function problemaCelular(celular: string): string | null {
  if (celular.trim() === "") return "Escribe su celular: el club le avisa por WhatsApp.";
  return celularValido(celular) ? null : CELULAR_MAL;
}

/** Al registrarla el celular es opcional (sin él queda identificada, no socia), pero si se escribe, bien: la base lo rechaza
 *  igual (`celular_invalido`). */
export function problemaCelularOpcional(celular: string): string | null {
  return celular.trim() === "" || celularValido(celular) ? null : CELULAR_MAL;
}

/** «wa.me/51987654321»: el enlace del QR sin el mensaje, para que la asesora vea adónde lleva (spike: la línea en mono). */
export function destinoDelQr(club: ClubDeLaCaja): string | null {
  return club.whatsappTienda ? `wa.me/51${club.whatsappTienda}` : null;
}

/* ------------------------------------------------------------------ El cumpleaños (la regla: lib/club-cumple-reglas.ts) */

/** El que ya tenía la ficha (el año no viaja en el resumen: si lo tenía, la base lo conserva al unirse sin él). */
export function cumpleDelResumen(resumen: Pick<ResumenClientaCaja, "cumpleDia" | "cumpleMes"> | null): CumpleEscrito {
  if (!resumen?.cumpleDia || !resumen.cumpleMes) return CUMPLE_VACIO;
  return { dia: String(resumen.cumpleDia), mes: String(resumen.cumpleMes), anio: "" };
}

/* ------------------------------------------------------------------ La guía de foco de las dos hojas */
//
// CLAUDE.md «Guía de foco» (ADR-0284): lo que cada hoja marca como hecho, lo que sigue y lo que falta sale de la MISMA regla
// que apaga su botón (`sePuedeConfirmar(campos)` es lo que se pregunta al confirmar). Lo sugerido nunca bloquea.

/** Lo escrito en «Invitar a … al Club CAYLA» (spike, `modalInvitar`). */
export type HojaInvitar = {
  celular: string;
  cumple: CumpleEscrito;
  /** «Omitir por ahora»: no tiene el cumpleaños a mano. Se agrega después en su ficha. */
  cumpleOmitido: boolean;
  /** «Se lo leí y la clienta dijo que sí». */
  leido: boolean;
  responsableListo: boolean;
  responsableMotivo: string | null;
};

/**
 * Invitar (ADR-0288 D-9): el celular (obligatorio: el club son avisos, CL-1), el cumpleaños (sugerido: sin él no hay
 * beneficio, CL-3; a medias o mal escrito, sí bloquea), leerle el texto del club y quién registra.
 */
export function camposDeInvitar(h: HojaInvitar, anioActual: number): CampoDeGuia[] {
  const pCelular = problemaCelular(h.celular);
  const pCumple = problemaCumple(h.cumple, anioActual);
  const completo = cumpleCompleto(h.cumple, anioActual);
  return [
    { id: "celular", nombre: "Celular", requerido: true, hecho: pCelular === null, pendiente: pCelular ?? "" },
    {
      id: "cumple",
      nombre: "Cumpleaños",
      requerido: pCumple !== null,
      sugerido: true,
      hecho: completo || (h.cumpleOmitido && cumpleVacio(h.cumple)),
      pendiente: pCumple ?? "Sin él no hay beneficio de cumpleaños.",
    },
    { id: "leido", nombre: "Leer el texto del club", requerido: true, hecho: h.leido, pendiente: "Léele el texto y confirma que dijo que sí." },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién registra." },
  ];
}

/** Lo escrito en «Registrar clienta» del ticket (spike, `modalRegistrar`). */
export type HojaRegistrar = {
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string;
  nombre: string;
  celular: string;
  cumple: CumpleEscrito;
  responsableListo: boolean;
  responsableMotivo: string | null;
};

/**
 * Registrar en el ticket (ADR-0288 D-9 y D-4: «identificada» es la que da su documento; spike, `modalRegistrar`):
 *   · documento y nombre: obligatorios. Con DNI el nombre llega del padrón DENTRO del mismo bloque (si no responde, se
 *     escribe ahí); con carné o pasaporte, en su propio bloque. Es la misma regla que el alta de /clientas (`NuevaClientaModal`);
 *   · el celular y el cumpleaños, sugeridos (README del spike, punto 7): con ellos, unirla al club después es un toque. Si se
 *     escriben, bien escritos (la base rechaza un celular mal escrito, `celular_invalido`);
 *   · y quién registra.
 */
export function camposDeRegistrar(h: HojaRegistrar, anioActual: number): CampoDeGuia[] {
  const esDni = h.documentoTipo === "dni";
  const problema = problemaDocumento(h.documentoTipo, h.documentoNumero);
  const documentoBien = normalizarNumeroDocumento(h.documentoNumero) !== "" && problema === null;
  const nombreBien = h.nombre.trim() !== "";
  const pCelular = problemaCelularOpcional(h.celular);
  const pCumple = problemaCumple(h.cumple, anioActual);
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
    {
      id: "celular",
      nombre: "Celular",
      requerido: pCelular !== null,
      sugerido: true,
      hecho: celularValido(h.celular),
      pendiente: pCelular ?? "Sin él queda identificada, no socia.",
    },
    {
      id: "cumple",
      nombre: "Cumpleaños",
      requerido: pCumple !== null,
      sugerido: true,
      hecho: cumpleCompleto(h.cumple, anioActual),
      pendiente: pCumple ?? "Sin él no hay beneficio de cumpleaños.",
    },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién registra." },
  ];
}

/* ------------------------------------------------------------------ El QR del camino A */

/**
 * El QR del camino A: el WhatsApp de la tienda con su mensaje personal y su código. Es el del ticket impreso y, en la hoja,
 * el RESPALDO del camino B (sale cuando la página de CAYLA no se pudo preparar).
 */
export type QrDeLaSocia =
  | { tipo: "qr"; enlace: string }
  /** La tienda no tiene su número cargado (Configuración ▸ Tiendas y caja): es socia igual, pero sin QR. */
  | { tipo: "sin_numero" }
  /** No hay mensaje personal vigente (`club_textos`): tampoco hay QR. */
  | { tipo: "sin_mensaje" };

export function qrDeLaSocia(club: ClubDeLaCaja, codigoClub: string): QrDeLaSocia {
  if (!club.whatsappTienda) return { tipo: "sin_numero" };
  const plantilla = textoVigente(club.textos, "mensaje_personal");
  if (!plantilla) return { tipo: "sin_mensaje" };
  const enlace = enlaceQrClub(club.whatsappTienda, mensajePersonal(plantilla.texto, codigoClub));
  return enlace ? { tipo: "qr", enlace } : { tipo: "sin_numero" };
}

/* ------------------------------------------------------------------ La cara del QR: camino B (ADR-0288, act. c) */
//
// «Mostrar su QR» (Cobrar y la ficha de /clientas) crea una invitación de un solo uso (`crear_invitacion_club`, con la firma
// del responsable) y dibuja el QR de la página pública `/club/{token}`: ella marca la casilla en SU celular y la hoja se
// entera sola, preguntando `resumen_clienta_caja` cada 3 s mientras está a la vista. Si la invitación no se puede crear (sin
// conexión, la base sin la función, cualquier error), sale el QR del camino A: nunca se queda sin salida (principio 9).
// Dibujo: spike del club, `47-club-qr.js` (`modalQR`), sin el punto que late (regla de movimiento, ADR-0136).

/** Cada cuánto se le pregunta a la base si ya confirmó. */
export const CONSULTA_QR_CADA_MS = 3_000;
/** Hasta cuándo: después queda «¿Ya lo hizo? Actualizar» (una hoja olvidada abierta no pregunta toda la tarde). */
export const CONSULTA_QR_HASTA_MS = 10 * 60_000;

/** La invitación de la página, tal como va. `detalle`: por qué falló, en castellano, o null si fue la conexión. */
export type InvitacionDelQr = { estado: "sin_pedir" } | { estado: "lista"; token: string } | { estado: "fallo"; detalle: string | null };

/** Cómo llegó su publicidad, para decirlo en «Listo». */
export type ComoLlegoLaPublicidad =
  /** La hoja la vio llegar sola: ella marcó la casilla en la página (o alguien la registró en otra caja). */
  | "pagina"
  /** «Llegó su mensaje (respaldo)»: ella le escribió a la tienda. */
  | "mensaje"
  /** La base ya la tenía (`ya_tiene_publicidad` al crear la invitación). */
  | "ya_tenia";

/**
 * Si la hoja sigue preguntando:
 *   · `esperando`: sí, cada 3 s;
 *   · `pausada`: la pestaña está oculta (nadie la mira): deja de preguntar y sigue sola al volver;
 *   · `vencida`: pasaron 10 minutos desde que empezó a esperar: deja de preguntar y ofrece «Actualizar».
 */
export type EsperaDelQr = "esperando" | "pausada" | "vencida";

export function esperaDelQr(v: { visible: boolean; desdeMs: number; ahoraMs: number }): EsperaDelQr {
  if (v.ahoraMs - v.desdeMs >= CONSULTA_QR_HASTA_MS) return "vencida";
  return v.visible ? "esperando" : "pausada";
}

export type CaraDelQr =
  /** Sin responsable no se crea la invitación (la base exige quién): la hoja lo pide antes que nada. */
  | { tipo: "pide_responsable"; pendiente: string }
  /** Pidiendo la invitación a la base. */
  | { tipo: "preparando" }
  /** Camino B: el QR de su página. `consultar`: la hoja pregunta sola. `pie`: la nota de abajo (`pieDelQr`). */
  | { tipo: "pagina"; enlace: string; destino: string; espera: EsperaDelQr; consultar: boolean; pie: string }
  /** Camino A de respaldo: la página no se pudo preparar. `enlace` null: tampoco hay QR de WhatsApp (`como` dice por qué). */
  | { tipo: "respaldo"; enlace: string | null; destino: string | null; aviso: string; detalle: string | null; como: string; pie: string }
  /** Ya recibe novedades. */
  | { tipo: "listo"; etiqueta: string; titulo: string; detalle: string };

/** «cayla.pe/club/…»: la dirección de la página sin el protocolo, para que la asesora vea adónde lleva (spike, `URL_CLUB`). */
export function destinoDePagina(enlace: string): string {
  return enlace.replace(/^https?:\/\//, "");
}

/** ¿Hay que pedirle la invitación a la base ahora? Solo una vez, con alguien que firme y si todavía no tiene publicidad. */
export function debePedirInvitacion(v: { invitacion: InvitacionDelQr; publicidad: ComoLlegoLaPublicidad | null; responsableListo: boolean }): boolean {
  return v.invitacion.estado === "sin_pedir" && v.publicidad === null && v.responsableListo;
}

const SI_TE_ESCRIBE = "Si te escribe por WhatsApp por su cuenta, toca «Llegó su mensaje». Es socia igual.";

/**
 * La nota de abajo de la cara (spike: «El mismo QR sale impreso en su ticket…»). El ticket sigue con el QR del camino A, así
 * que solo se promete si de verdad sale: con el WhatsApp de la tienda, su mensaje y su código (lo mismo que `clubEnElTicket`).
 */
export function pieDelQr(club: ClubDeLaCaja, codigo: string | null): string {
  const sinQr = "Sin QR no pasa nada: sigue siendo del club, solo que sin publicidad.";
  return codigo && qrDeLaSocia(club, codigo).tipo === "qr" ? `En su ticket también sale un QR: puede hacerlo en casa. ${sinQr}` : sinQr;
}

/**
 * Qué muestra la cara del QR (spike, `modalQR`). Manda, en este orden: que ya tenga la publicidad; la invitación (lista →
 * su página; falló → el camino A); y, sin pedirla todavía, que haya quién la firme.
 * `origen`: el del navegador (`window.location.origin`): la página vive en el mismo dominio que el ERP.
 */
export function caraDelQr(v: {
  nombre: string;
  codigo: string | null;
  club: ClubDeLaCaja;
  origen: string;
  invitacion: InvitacionDelQr;
  publicidad: ComoLlegoLaPublicidad | null;
  responsableListo: boolean;
  responsableMotivo: string | null;
  espera: EsperaDelQr;
}): CaraDelQr {
  if (v.publicidad === "ya_tenia") {
    return { tipo: "listo", etiqueta: "Ya estaba", titulo: "Ya recibe novedades", detalle: `${v.nombre} ya las había pedido: no hace falta su QR.` };
  }
  if (v.publicidad) {
    return {
      tipo: "listo",
      etiqueta: v.publicidad === "pagina" ? "Confirmó" : "Registrado",
      titulo: `Listo: ${v.nombre} recibe novedades por WhatsApp`,
      detalle:
        v.publicidad === "pagina"
          ? "Lo confirmó ella, en su celular: queda en su historia con la hora y el texto que vio. Se da de baja escribiendo BAJA a la tienda."
          : "Con su mensaje a la tienda: el chat es la prueba. Se da de baja escribiendo BAJA a la tienda.",
    };
  }
  const inv = v.invitacion;
  if (inv.estado === "lista") {
    const enlace = enlacePaginaClub(v.origen, inv.token);
    return { tipo: "pagina", enlace, destino: destinoDePagina(enlace), espera: v.espera, consultar: v.espera === "esperando", pie: pieDelQr(v.club, v.codigo) };
  }
  if (inv.estado === "fallo") {
    const qr: QrDeLaSocia | null = v.codigo ? qrDeLaSocia(v.club, v.codigo) : null;
    const base = { tipo: "respaldo" as const, aviso: "No se pudo preparar su página de CAYLA.", detalle: inv.detalle, pie: pieDelQr(v.club, v.codigo) };
    if (qr?.tipo === "qr") {
      return {
        ...base,
        enlace: qr.enlace,
        destino: destinoDelQr(v.club),
        como: "Si no se abre la página, que te escriba por WhatsApp: este QR abre el chat de la tienda con su mensaje y su código. Cuando llegue, toca «Llegó su mensaje».",
      };
    }
    const porQue = !qr
      ? "Sin su código de socia tampoco se arma el QR del WhatsApp de la tienda."
      : qr.tipo === "sin_numero"
        ? "La tienda tampoco tiene su WhatsApp cargado (Configuración ▸ Tiendas y caja): hoy no hay QR."
        : "Tampoco hay mensaje del club para el QR del WhatsApp de la tienda: hoy no hay QR.";
    return { ...base, enlace: null, destino: null, como: `${porQue} ${SI_TE_ESCRIBE}` };
  }
  if (!v.responsableListo) return { tipo: "pide_responsable", pendiente: v.responsableMotivo ?? "Elige quién le muestra el QR." };
  return { tipo: "preparando" };
}

/**
 * «Llegó su mensaje (respaldo)» en Cobrar: el número desde el que escribió (viene con el de su ficha) y quién lo registra.
 * Es la MISMA regla que apaga «Registrar su permiso» (la base vuelve a exigir el celular, `celular_invalido`).
 */
export function camposDeLlegoSuMensaje(h: { numero: string; responsableListo: boolean; responsableMotivo: string | null }): CampoDeGuia[] {
  const p = problemaCelular(h.numero);
  return [
    {
      id: "numero",
      nombre: "Número que escribió",
      requerido: true,
      hecho: p === null,
      pendiente: h.numero.trim() === "" ? "El número desde el que le escribió a la tienda." : (p ?? ""),
    },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién registra." },
  ];
}

// El QR del ticket impreso vive desde la tanda 1g en `lib/club-qr-reglas.ts` (`clubEnElTicket`): abre la página de registro de
// la tienda de la venta (ADR-0288 act. g, G-1).
