// Tienda web ▸ Recomendaciones (ADR-0408, Felipe 2026-10-15; migraciones 20261015134000 y 20261015135000): lo que los clientes
// recomiendan desde la tienda online, SIEMPRE con su nombre, sobre una tienda o sobre CAYLA en general. Aquí, sin red ni React: lo
// que devuelve `fn_recomendaciones` puesto en tipos, el estado de cada una, las cifras, los filtros y la búsqueda, y qué le falta a
// una respuesta. Quien decide de verdad es la base (el módulo, el responsable, el largo, «ya tiene respuesta»): estas reglas solo
// dicen ANTES lo mismo que ella, para no mandar algo que va a rechazar.

import { hrefLista, leerParamsLista } from "./clientas-lista-reglas";
import { diaLima, diaYHoraLima } from "./fechas-lima";
import { sinTildes } from "./marcas";
import { temaQueSeRepite, type TemaId } from "./recomendaciones-temas";
import { TODOS } from "./pildora-reglas";

/** El largo de una respuesta: el mismo de `responder_recomendacion` (de 2 a 400 letras, ya limpias). */
const MIN_RESPUESTA = 2;
export const MAX_RESPUESTA = 400;
/** Cuántas se ven por página en la tabla (la lista entera ya está en memoria: `fn_recomendaciones` trae hasta 1000). */
export const POR_PAGINA = 25;

/* ------------------------------------------------------------------ Lo que devuelve fn_recomendaciones */

type Crudo = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esObjeto = (x: unknown): x is Crudo => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
/** Un instante que se puede leer (lo demás, null: la fila no se muestra a medias). */
const instante = (x: unknown): string | null => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null);
const uuid = (x: unknown): string | null => (typeof x === "string" && UUID.test(x) ? x : null);

function leerTienda(x: unknown): TiendaRecomendacion | null {
  if (!esObjeto(x)) return null;
  const id = uuid(x.id);
  const nombre = texto(x.nombre);
  return id && nombre ? { id, nombre } : null;
}

/** Una fila de la lista, o null si llegó rara (sin id, sin texto, sin fecha, o con un par «cuándo/quién» que no calza). */
function leerRecomendacion(x: unknown): Recomendacion | null {
  if (!esObjeto(x)) return null;
  const id = uuid(x.id);
  const creadaEn = instante(x.creada_en);
  if (!id || !creadaEn || typeof x.texto !== "string") return null;
  // Lo que puede faltar: si viene, tiene que leerse (una tienda o un cliente a medias no se muestran como «general» o «sin nombre»).
  const tienda = x.tienda === null ? null : leerTienda(x.tienda);
  if (x.tienda !== null && !tienda) return null;
  let cliente: Recomendacion["cliente"] = null;
  if (x.cliente !== null) {
    if (!esObjeto(x.cliente)) return null;
    const fichaId = uuid(x.cliente.ficha_id);
    const nombre = texto(x.cliente.nombre);
    if (!fichaId || !nombre) return null;
    cliente = { fichaId, nombre };
  }
  const respuesta = typeof x.respuesta === "string" ? x.respuesta : null;
  return {
    id,
    texto: x.texto,
    creadaEn,
    tienda,
    cliente,
    leidaEn: instante(x.leida_en),
    leidaPor: texto(x.leida_por),
    respuesta,
    respondidaEn: instante(x.respondida_en),
    respondidaPor: texto(x.respondida_por),
    archivadaEn: instante(x.archivada_en),
    archivadaPor: texto(x.archivada_por),
  };
}

export type TiendaRecomendacion = { id: string; nombre: string };

export type Recomendacion = {
  id: string;
  texto: string;
  creadaEn: string;
  /** Sobre qué tienda es; null: CAYLA en general. */
  tienda: TiendaRecomendacion | null;
  /** Quién la escribió y su ficha; null: su ficha se anonimizó (la recomendación se queda sin su nombre). */
  cliente: { fichaId: string; nombre: string } | null;
  leidaEn: string | null;
  leidaPor: string | null;
  respuesta: string | null;
  respondidaEn: string | null;
  respondidaPor: string | null;
  archivadaEn: string | null;
  archivadaPor: string | null;
};

export type ListaRecomendaciones = {
  /** Quien mira ve las fichas de clientes (su rol tiene «Clientes»): solo entonces se ofrece ir a la ficha. */
  veFichas: boolean;
  tiendas: TiendaRecomendacion[];
  recomendaciones: Recomendacion[];
  /** Hay más de las 1000 que trae la base. */
  hayMas: boolean;
};

/** La respuesta de `fn_recomendaciones`. null si la forma no se entiende (la pantalla lo dice: nunca una lista a medias). Una fila que
 *  llega mal formada se deja fuera y las demás se muestran. */
export function leerRecomendaciones(dato: unknown): ListaRecomendaciones | null {
  if (!esObjeto(dato) || typeof dato.ve_fichas !== "boolean" || typeof dato.hay_mas !== "boolean") return null;
  if (!Array.isArray(dato.tiendas) || !Array.isArray(dato.recomendaciones)) return null;
  return {
    veFichas: dato.ve_fichas,
    hayMas: dato.hay_mas,
    tiendas: dato.tiendas.flatMap((t) => {
      const tienda = leerTienda(t);
      return tienda ? [tienda] : [];
    }),
    recomendaciones: dato.recomendaciones.flatMap((x) => {
      const r = leerRecomendacion(x);
      return r ? [r] : [];
    }),
  };
}

/* ------------------------------------------------------------------ El estado de cada una */

// Desde la hoja de 2026-10-17 (decisión #2 A) ya no se «marca como leída»: una recomendación espera hasta que alguien le responde o la
// archiva sin responder. Leerla no la saca de los pendientes, porque el cliente no recibe nada por haber sido leído (antes, «Leída»
// apagaba la cifra y el aviso del Resumen mientras el cliente seguía esperando). Una vieja que alguien marcó leída sin responder vuelve
// a «Por responder»: es lo que es.
export type EstadoRecomendacion = "por_responder" | "sin_nombre" | "respondida" | "archivada";

/** Archivada manda (ya no pide nada); si no, respondida; si no, por responder, salvo que su ficha se haya anonimizado: a esa ya no se
 *  le responde (solo se archiva), así que no cuenta como pendiente. */
export function estadoDe(r: Pick<Recomendacion, "respuesta" | "archivadaEn" | "cliente">): EstadoRecomendacion {
  if (r.archivadaEn) return "archivada";
  if (r.respuesta !== null) return "respondida";
  return r.cliente ? "por_responder" : "sin_nombre";
}

/** La insignia de cada estado (`<Chip>`): por responder en ámbar (espera algo de CAYLA), respondida en verde, archivada apagada. */
export const INSIGNIA: Record<EstadoRecomendacion, { texto: string; tono: "ambar" | "neutro" | "verde" | "apagado" }> = {
  por_responder: { texto: "Por responder", tono: "ambar" },
  sin_nombre: { texto: "Sin respuesta", tono: "neutro" },
  respondida: { texto: "Respondida", tono: "verde" },
  archivada: { texto: "Archivada", tono: "apagado" },
};

/** «Tienda Trujillo» o «CAYLA en general». */
export const sobreQue = (r: Pick<Recomendacion, "tienda">) => r.tienda?.nombre ?? "CAYLA en general";

/** Quién la escribió, como se lee en la lista: su nombre, o «Sin nombre» si su ficha se anonimizó (la hoja y el título del botón dicen por qué). */
export const deQuien = (r: Pick<Recomendacion, "cliente">) => r.cliente?.nombre ?? "Sin nombre";

/** Cuándo, en hora de Lima: «15/10 · 10:42». */
export function cuando(instanteIso: string): string {
  const { dia, hora } = diaYHoraLima(instanteIso);
  return `${dia} · ${hora}`;
}

/** La ficha del cliente en Clientes: la lista buscando su nombre (como «Ficha del cliente» desde el Historial de ventas). */
export const hrefFicha = (nombre: string) => hrefLista(leerParamsLista({}), { termino: nombre });

/* ------------------------------------------------------------------ Las cifras */

export type CifrasRecomendaciones = {
  porResponder: number;
  respondidas: number;
  delMes: number;
  archivadas: number;
  enBandeja: number;
  /** Lo que más piden este mes, si dos o más lo nombran (para el Resumen de Tienda web, actividad 4); null si nada se repite. */
  temaDelMes: { id: TemaId; nombre: string; veces: number } | null;
};

/** Lo que dicen las tarjetas (y el aviso del Resumen de Tienda web). «Del mes»: las que llegaron en el mes de Lima de `hoy`
 *  (aaaa-mm-dd), archivadas o no. */
export function cifrasDe(lista: readonly Recomendacion[], hoy: string): CifrasRecomendaciones {
  const mes = hoy.slice(0, 7);
  const c: CifrasRecomendaciones = { porResponder: 0, respondidas: 0, delMes: 0, archivadas: 0, enBandeja: 0, temaDelMes: null };
  const textosDelMes: string[] = [];
  for (const r of lista) {
    const e = estadoDe(r);
    if (e === "por_responder") c.porResponder++;
    if (r.respuesta !== null) c.respondidas++;
    if (e === "archivada") c.archivadas++;
    else c.enBandeja++;
    if (diaLima(r.creadaEn)?.slice(0, 7) === mes) {
      c.delMes++;
      textosDelMes.push(r.texto);
    }
  }
  c.temaDelMes = temaQueSeRepite(textosDelMes);
  return c;
}

/* ------------------------------------------------------------------ Los filtros y la búsqueda */

/** Qué estado se mira. Lo de siempre es «Por responder»: lo que espera algo de CAYLA. «En la bandeja»: todo lo que no se archivó. */
export type FiltroEstado = "por_responder" | "bandeja" | "respondidas" | "archivadas" | "todas";
export const ESTADO_POR_DEFECTO: FiltroEstado = "por_responder";
export const OPCIONES_ESTADO: readonly { valor: FiltroEstado; texto: string }[] = [
  { valor: "por_responder", texto: "Por responder" },
  { valor: "bandeja", texto: "En la bandeja" },
  { valor: "respondidas", texto: "Respondidas" },
  { valor: "archivadas", texto: "Archivadas" },
  { valor: "todas", texto: "Todas" },
];
export const esFiltroEstado = (v: string): v is FiltroEstado => OPCIONES_ESTADO.some((o) => o.valor === v);

/** «Sobre qué»: todas, CAYLA en general, o una tienda (su id). */
const SOBRE_GENERAL = "general";
export function opcionesSobre(tiendas: readonly TiendaRecomendacion[]): { valor: string; texto: string }[] {
  return [{ valor: TODOS, texto: "Todas" }, { valor: SOBRE_GENERAL, texto: "CAYLA en general" }, ...tiendas.map((t) => ({ valor: t.id, texto: t.nombre }))];
}

const pasaEstado = (r: Recomendacion, f: FiltroEstado): boolean => {
  const e = estadoDe(r);
  switch (f) {
    case "por_responder":
      return e === "por_responder";
    case "bandeja":
      return e !== "archivada";
    case "respondidas":
      return r.respuesta !== null;
    case "archivadas":
      return e === "archivada";
    case "todas":
      return true;
  }
};

/** Lo que queda con el estado, la tienda y lo que se busca (en el texto, el nombre del cliente o su respuesta; sin tildes ni
 *  mayúsculas). En el orden en que llegaron: la más nueva primero. */
export function filtrar(lista: readonly Recomendacion[], f: { estado: FiltroEstado; sobre: string; q: string }): Recomendacion[] {
  const q = sinTildes(f.q.trim());
  return lista.filter(
    (r) =>
      pasaEstado(r, f.estado) &&
      (f.sobre === TODOS || (f.sobre === SOBRE_GENERAL ? r.tienda === null : r.tienda?.id === f.sobre)) &&
      (!q || [r.texto, r.cliente?.nombre ?? "", r.respuesta ?? ""].some((t) => sinTildes(t).includes(q))),
  );
}

/* ------------------------------------------------------------------ La respuesta */

/** El texto como lo guarda la base (`fn_recomendacion_texto`): sin invisibles ni caracteres de control, espacios seguidos en uno, a
 *  lo más una línea en blanco, sin espacios en las puntas. Así el contador cuenta lo mismo que la base. */
export function textoLimpio(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    // Lo que se quita: invisibles y caracteres de control (menos el salto de línea).
    .replace(/[\u0001-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "")
    .replace(/[\t   -   　]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \n]+|[ \n]+$/g, "");
}

/** Cuántas letras cuenta la base (por carácter, no por unidad de JavaScript: un emoji es una). */
export const letras = (texto: string) => [...textoLimpio(texto)].length;

/** Qué le falta a la respuesta (null: nada). Vacía también falta: la otra salida de la hoja es archivarla sin responder, a la vista. */
function problemaDeRespuesta(texto: string): string | null {
  const n = letras(texto);
  if (n === 0) return "Escribe tu respuesta, o archívala si no hace falta responder.";
  if (n < MIN_RESPUESTA) return "Escribe tu respuesta.";
  if (n > MAX_RESPUESTA) return `Te pasaste por ${n - MAX_RESPUESTA} ${n - MAX_RESPUESTA === 1 ? "letra" : "letras"}: acórtala un poco.`;
  return null;
}

/** ¿Se puede responder esta? Solo una sin respuesta, en la bandeja y con nombre (a una ficha anonimizada ya no se le responde). */
export const sePuedeResponder = (r: Pick<Recomendacion, "respuesta" | "archivadaEn" | "cliente">) =>
  r.respuesta === null && !r.archivadaEn && r.cliente !== null;

/** Lo que le falta al botón principal de la hoja («Enviar respuesta»), sin contar quién lo hace: la respuesta, si todavía se puede
 *  responder. Archivar o sacar del archivo no piden más. Es la regla que la guía refleja. */
export function problemaParaConfirmar(r: Pick<Recomendacion, "respuesta" | "archivadaEn" | "cliente">, respuesta: string): string | null {
  return sePuedeResponder(r) ? problemaDeRespuesta(respuesta) : null;
}

/** Cuánto espera una respuesta antes de salir, para poder deshacerla (Felipe 2026-10-17, actividad 3): la base no deja corregirla
 *  después, así que este es el único momento para arrepentirse de una falta o de un tono. */
export const SEGUNDOS_PARA_DESHACER = 8;

/** Los segundos que le quedan a un envío que vence en `venceMs` (redondeados hacia arriba: «Se envía en 1 s» hasta el final). */
export const segundosQueFaltan = (venceMs: number, ahoraMs: number) => Math.max(0, Math.ceil((venceMs - ahoraMs) / 1000));

const FECHA_TIENDA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" });
/** La fecha como la muestra la tienda online en «Lo que nos escribiste»: «17 oct», en hora de Lima. */
export const fechaDeLaTienda = (instanteIso: string) => FECHA_TIENDA.format(new Date(instanteIso)).replace(/\.$/, "");

/** El aviso de un error que esta pantalla sabe decir mejor que el mensaje general: sin red (marcar, responder lo mismo y archivar no se
 *  repiten, así que reintentar es seguro) y otra persona que respondió mientras tanto (la hoja ya muestra su respuesta). null: el de
 *  siempre (`traducirError`). */
export function avisoDelError(e: { hint?: string | null }, sinRed: boolean): { titulo: string; detalle: string } | null {
  if (sinRed) return { titulo: "Se cortó la conexión", detalle: "Vuelve a intentarlo: si ya había llegado, no se repite." };
  if (e.hint === "recomendacion_ya_respondida")
    return { titulo: "Ya le respondieron", detalle: "Otra persona le respondió mientras la tenías abierta: ahora ves su respuesta." };
  return null;
}

/** Lo que dijo la base y pide releer la lista (otra persona ya respondió, o ya no existe). */
export const pideReleer = (hint: string | null | undefined) =>
  hint === "recomendacion_ya_respondida" || hint === "recomendacion_no_existe" || hint === "recomendacion_sin_nombre";
