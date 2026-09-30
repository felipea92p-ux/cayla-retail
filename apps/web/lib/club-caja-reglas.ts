// El club en la CAJA (ADR-0288, tanda 1b): qué muestra la caja de la clienta en Cobrar, qué piden «Registrar clienta» e
// «Invitar», y qué QR sale en el ticket impreso. Lógica pura, sin React ni red: la usan la página de Vender (servidor),
// `PuntoDeVenta`, `ClientaDelTicket`, `InvitarAlClub` y `CamposDelClub`.
//
// El dibujo sigue el spike visual del club (rama `claude/spyke-club-clientas-visual-631f7a`,
// `docs/maquetas/club-clientas-spike-2026-09/fuente/src/45-club-caja.js` y `47-club-qr.js`): lo del club va DENTRO de la
// caja del nombre y el documento, plegado; «Invitar» llega con el celular y el cumpleaños de la ficha; al unirla, su QR.
//
// CONTRATO
//   PROMETE: decir qué se ofrece en caja según lo que la base contestó (`resumen_clienta_caja`, `fn_club_textos_vigentes`,
//            `ubicaciones.whatsapp_numero`), validar lo que la asesora escribe al registrarla o invitarla (y la guía de foco
//            de esas dos hojas, que sale de la MISMA validación), y armar el QR del ticket.
//   ASUME:   quien decide si alguien PUEDE ser socia es la base (`unirse_al_club`: celular, documento y nombre, texto `club`
//            vigente, ficha activa). Esto solo evita ofrecer lo que la base rechazaría y dice por qué.
//   NO HACE: no registra la publicidad. Ese permiso solo nace cuando ELLA escribe desde el QR (D-4, Ley 32323), y lo marca
//            la tienda en /clientas («Llegó su mensaje»). Tampoco el camino B del spike (página pública con casilla): el ADR
//            no lo admite.

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
import type { ResumenClientaCaja } from "./club-acciones";
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
 *   · `activa`: ya escribió desde el QR — «Publicidad», en verde;
 *   · `qr`: todavía no, y la tienda tiene su QR — «Sin publicidad · QR», tocable: abre su QR para que lo escanee ahora;
 *   · `sin_qr`: todavía no, y no hay QR (la tienda sin su WhatsApp cargado, o sin mensaje vigente) — «Sin publicidad», quieto.
 */
export type PublicidadEnCaja = "activa" | "qr" | "sin_qr";

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
    const publicidad: PublicidadEnCaja = r.conPublicidad ? "activa" : codigo && qrDeLaSocia(v.club, codigo).tipo === "qr" ? "qr" : "sin_qr";
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

/* ------------------------------------------------------------------ El cumpleaños */

export const MESES_DEL_ANIO = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/**
 * El combo del mes (la forma de `Opcion` de `components/ui/campos`). Abreviado como el spike (`MESES`): día, mes y año van
 * en tres cajas iguales y a 375 px cada una mide ~100 px; «Setiembre» entero no cabría en la del medio.
 */
export const OPCIONES_MES_CUMPLE = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map((texto, i) => ({
  valor: String(i + 1),
  texto,
}));

/** El cumpleaños tal como está en la hoja: textos, vacíos si no se eligió. */
export type CumpleEscrito = { dia: string; mes: string; anio: string };
export const CUMPLE_VACIO: CumpleEscrito = { dia: "", mes: "", anio: "" };

/** Lo que queda en la caja del día al tipear: solo dígitos, hasta 2. */
export const ajustarDia = (texto: string) => texto.replace(/\D/g, "").slice(0, 2);
/** Lo que queda en la caja del año al tipear: solo dígitos, hasta 4. */
export const ajustarAnio = (texto: string) => texto.replace(/\D/g, "").slice(0, 4);

/** No escribió nada del cumpleaños (ni día, ni mes, ni año). */
export const cumpleVacio = (c: CumpleEscrito) => c.dia.trim() === "" && c.mes.trim() === "" && c.anio.trim() === "";

/** El que ya tenía la ficha (el año no viaja en el resumen: si lo tenía, la base lo conserva al unirse sin él). */
export function cumpleDelResumen(resumen: Pick<ResumenClientaCaja, "cumpleDia" | "cumpleMes"> | null): CumpleEscrito {
  if (!resumen?.cumpleDia || !resumen.cumpleMes) return CUMPLE_VACIO;
  return { dia: String(resumen.cumpleDia), mes: String(resumen.cumpleMes), anio: "" };
}

const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const esBisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** Nadie del club nació hace más de esto: un año más viejo es un error de tipeo. */
const EDAD_MAXIMA = 110;

/**
 * Por qué el cumpleaños escrito no sirve, o null. Vacío sirve: no es obligatorio para entrar al club, aunque sin él no hay
 * beneficio de cumpleaños (CL-3). Día y mes van juntos; el año es opcional y solo con ellos.
 */
export function problemaCumple(c: CumpleEscrito, anioActual: number): string | null {
  const dia = c.dia.trim();
  const mes = c.mes.trim();
  const anio = c.anio.trim();
  if (!dia && !mes) return anio ? "Con el año, elige también el día y el mes." : null;
  if (!dia) return "Falta el día de su cumpleaños.";
  if (!mes) return "Falta el mes de su cumpleaños.";
  const d = Number(dia);
  const m = Number(mes);
  if (!Number.isInteger(m) || m < 1 || m > 12) return "Elige el mes de la lista.";
  if (!Number.isInteger(d) || d < 1 || d > DIAS_DEL_MES[m - 1]!) return `${MESES_DEL_ANIO[m - 1]} no tiene día ${dia}.`;
  if (!anio) return null;
  if (!/^[0-9]{4}$/.test(anio)) return "El año va con sus 4 cifras (o déjalo vacío).";
  const a = Number(anio);
  if (a > anioActual || a < anioActual - EDAD_MAXIMA) return `El año ${anio} no puede ser el de su nacimiento.`;
  if (m === 2 && d === 29 && !esBisiesto(a)) return `En ${anio} febrero tuvo 28 días.`;
  return null;
}

/** Lo que viaja a `unirse_al_club`, una vez que `problemaCumple` dio null. */
export function cumpleParaGuardar(c: CumpleEscrito): { cumpleDia: number | null; cumpleMes: number | null; cumpleAnio: number | null } {
  const n = (t: string) => (t.trim() === "" ? null : Number(t.trim()));
  const dia = n(c.dia);
  const mes = n(c.mes);
  return { cumpleDia: dia, cumpleMes: mes, cumpleAnio: dia !== null && mes !== null ? n(c.anio) : null };
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
  const completo = h.cumple.dia.trim() !== "" && h.cumple.mes.trim() !== "" && pCumple === null;
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
      hecho: h.cumple.dia.trim() !== "" && h.cumple.mes.trim() !== "" && pCumple === null,
      pendiente: pCumple ?? "Sin él no hay beneficio de cumpleaños.",
    },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: h.responsableListo, pendiente: h.responsableMotivo ?? "Elige quién registra." },
  ];
}

/* ------------------------------------------------------------------ El QR */

/** El QR que la hoja muestra al terminar: el mensaje personal con su código, al WhatsApp de la tienda. */
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

/** Lo que el ticket impreso lleva al pie para el club. */
export type ClubEnElTicket = { enlace: string; titulo: string; linea: string };

const LINEA_DEL_TICKET = "¿Novedades por WhatsApp? Escanea y envía el mensaje.";

/**
 * El QR del club al pie del ticket (ADR-0288, «Actualización 2026-09-30»: la tabla de dónde está el QR).
 *   · Venta a una socia: el mensaje personal, con su código (así la tienda sabe de quién es cuando llega).
 *   · Cualquier otra venta (sin clienta, o con una que todavía no es socia): el genérico, que pide unirse al club.
 *   · Una socia que ya recibe novedades no necesita el QR: el ticket no le pide nada nuevo.
 *   · Sin número de la tienda, o sin el texto que toca, nada.
 * `resumen`: lo que la caja sabe de la clienta del ticket, o null si no hay clienta (o no se pudo leer).
 */
export function clubEnElTicket(
  club: ClubDeLaCaja,
  resumen: Pick<ResumenClientaCaja, "esSocia" | "codigoClub" | "conPublicidad"> | null
): ClubEnElTicket | null {
  if (!club.whatsappTienda) return null;
  const codigo = resumen?.esSocia ? codigoClubLegible(resumen.codigoClub) : null;
  if (resumen?.esSocia && resumen.conPublicidad) return null;
  if (codigo) {
    const qr = qrDeLaSocia(club, codigo);
    return qr.tipo === "qr" ? { enlace: qr.enlace, titulo: `Club CAYLA · Socia ${codigo}`, linea: LINEA_DEL_TICKET } : null;
  }
  const generico = textoVigente(club.textos, "mensaje_generico");
  const enlace = generico ? enlaceQrClub(club.whatsappTienda, generico.texto) : null;
  return enlace ? { enlace, titulo: "Club CAYLA", linea: LINEA_DEL_TICKET } : null;
}
