/**
 * «La tengo en la mano» en Colgar en el piso (ADR-0328, actividad 9): las reglas puras del callejón «el sistema dice 0 en el
 * almacén y la prenda está en mi mano», sin React, sin DOM y sin supabase.
 *
 * CONTRATO
 *   PROMETE: decir qué se le ofrece a la asesora cuando una lectura no se puede bajar porque el almacén está en 0 (comprobar
 *            la corrección que quedó en duda, corregir y colgar, o primero mirar el rack si el sistema ya la cuenta colgada);
 *            armar la llamada a `retail.bajar_en_mano` (`20261004223100`) con una marca que sobrevive a cerrar la ventana y a
 *            recargar; leer su respuesta y sus rechazos; y los textos de cada paso.
 *   ASUME:   la base decide lo que se puede (permiso, tope del día, lo apartado, la prenda que nunca entró) y lo dice en su
 *            mensaje; aquí no se repite ninguna regla de negocio de la base, solo se decide QUÉ PREGUNTAR antes de llamarla.
 *   NO HACE: no escribe nada ni cuenta stock: la cifra viene de la pantalla (lo que el sistema decía) y de la respuesta.
 */

import { nombreDePrenda, type LineaBajada, type PrendaBajable } from "./bajada-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import { diaYHoraLima } from "./fechas-lima";

/** La RPC y sus parámetros en un solo lugar: `bajada-en-mano.test.ts` los fija contra la migración. */
export const RPC_EN_MANO = "bajar_en_mano";
export const PARAMETROS_RPC_EN_MANO = ["p_ubicacion_id", "p_variante_id", "p_nota", "p_token"] as const;

/** La nota que la base pone siempre a la corrección (la misma `c_nota` de la migración; la prueba lo vigila). */
export const NOTA_AUTOMATICA = "La tenía en la mano al bajarla";
/** Lo más que admite la nota de la persona (`c_max_nota`). */
export const MAX_NOTA_EN_MANO = 200;
/** Cuántas correcciones de una misma prenda, en una tienda y un día, pasan por aquí (`c_tope_del_dia`). */
export const TOPE_DEL_DIA_EN_MANO = 5;

/** Los rótulos del botón principal de la ventana. */
export const BOTON_CORREGIR_Y_COLGAR = "Corregir y colgar";
export const BOTON_EN_MANO_DE_NUEVO = "Enviar de nuevo";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------------------------
// Qué se le ofrece
// ---------------------------------------------------------------------------------------------------------------

/**
 * - `comprobar`: una corrección de ESTA prenda se envió y no se supo si se guardó (`MarcaEnDuda`). Antes de cualquier otra
 *   cosa se reenvía con su misma marca: si ya se había guardado, la base responde «ya registrada» y no corrige dos veces.
 * - `corregir`: el sistema no cuenta esta prenda en el almacén ni en el piso (o las del piso son las que ella misma acaba de
 *   colgar aquí): la que tiene en la mano prueba que existe una más. Se ofrece corregir y colgar.
 * - `preguntar`: el sistema YA cuenta `enPiso` colgadas de esta prenda que ella NO colgó en esta pantalla. La que tiene puede
 *   ser una de esas (la carga inicial «al piso» dejó así prendas que seguían guardadas). Con la prenda en la mano no se puede
 *   contestar «¿es una de esas?»: se le pide MIRAR EL RACK (`preguntaDelRack`). Si están todas, la suya es otra → corregir y
 *   colgar; si falta alguna, la suya es esa → «Ya estaba colgada», que no escribe nada. Ninguna de las dos va por defecto.
 *   Solo ella ve el rack: la base no lo decide (20261004223100). `colgadasAqui` viaja para decir «sin las que colgaste ahora».
 * `danadas`: las de esta prenda en cuarentena; si hay, se le advierte que la suya puede ser la dañada.
 */
export type OfertaEnMano =
  | { tipo: "comprobar"; enviadoEn: string; danadas: number }
  | { tipo: "corregir"; danadas: number }
  | { tipo: "preguntar"; enPiso: number; colgadasAqui: number; danadas: number };

/**
 * `colgadasAqui`: las que ella corrigió y colgó en esta pantalla desde que la abrió. El piso que cuenta el sistema las incluye
 * (o las incluirá cuando la pantalla se relea): si no se descontaran, la segunda blusa igual del mismo fardo le preguntaría
 * «¿ya estaba colgada?» por la que ella misma colgó hace un minuto. `enDuda`: la corrección de esta prenda que quedó sin
 * respuesta, si hay; manda sobre todo lo demás.
 */
export function ofertaEnMano(prenda: Pick<PrendaBajable, "piso" | "danado">, colgadasAqui: number, enDuda: MarcaEnDuda | null = null): OfertaEnMano {
  const danadas = Math.max(0, prenda.danado ?? 0);
  if (enDuda) return { tipo: "comprobar", enviadoEn: enDuda.enviadoEn, danadas };
  const aqui = Math.max(0, colgadasAqui);
  const enPiso = Math.max(0, prenda.piso - aqui);
  return enPiso > 0 ? { tipo: "preguntar", enPiso, colgadasAqui: aqui, danadas } : { tipo: "corregir", danadas };
}

/**
 * La pregunta que se contesta MIRANDO EL RACK, no la prenda en la mano (revisión adversarial de la actividad 9: «¿la que tienes
 * es una de esas?» no se puede responder con la prenda en la mano, y su botón principal la dejaba colgada sin registrar).
 * - `si`: están las N que cuenta el sistema → la suya es otra unidad: corregir y colgar.
 * - `no`: falta alguna → la suya es la que el sistema creía colgada: «Ya estaba colgada» (no se inventa stock).
 */
export function preguntaDelRack(o: { enPiso: number; colgadasAqui: number }): { pregunta: string; si: string; no: string } {
  const sinLasDeAqui = o.colgadasAqui > 0 ? ", sin contar las que colgaste ahora" : "";
  return o.enPiso === 1
    ? { pregunta: `Mira el rack${sinLasDeAqui}: ¿está colgada 1 de esta talla y color?`, si: "Sí, está: la mía es otra", no: "No está: la mía es esa" }
    : {
        pregunta: `Mira el rack${sinLasDeAqui}: ¿están colgadas las ${o.enPiso} de esta talla y color?`,
        si: `Sí, están las ${o.enPiso}: la mía es otra`,
        no: "Falta alguna: la mía es una de esas",
      };
}

/** En la ventana, cuando ella dijo que en el rack están todas las que cuenta el sistema: lo que va a pasar. */
export function textoUnaMasEnPiso(enPiso: number): string {
  return `En el rack ${enPiso === 1 ? "está la 1 colgada" : `están las ${enPiso} colgadas`} que cuenta el sistema: esta se suma como una más.`;
}

function plural(n: number, singular: string, varias: string): string {
  return `${n} ${n === 1 ? singular : varias}`;
}

/** La tarjeta bajo el campo (y la bandeja de la cámara): qué dice el sistema y qué puede hacer ella. */
export function textoDeOferta(o: OfertaEnMano, prenda: Pick<PrendaBajable, "referencia" | "talla" | "color">, sede: string): string {
  const nombre = nombreDePrenda(prenda);
  const danadas = o.danadas > 0 ? ` Ojo: hay ${plural(o.danadas, "dañada", "dañadas")} en cuarentena; si la tuya es esa, no la cuelgues.` : "";
  if (o.tipo === "comprobar") {
    return `${nombre}: la corrección que enviaste a las ${diaYHoraLima(o.enviadoEn).hora} no tuvo respuesta. Compruébala antes de corregir otra: si ya se había guardado, no se repite.`;
  }
  if (o.tipo === "preguntar") {
    return `${nombre}: el almacén de ${sede} está en 0 y el sistema cuenta ${plural(o.enPiso, "colgada", "colgadas")}. ${preguntaDelRack(o).pregunta}${danadas}`;
  }
  return `${nombre}: el sistema no la tiene en el almacén de ${sede}. Si la tienes en la mano, corrígela y cuélgala aquí mismo.${danadas}`;
}

/** Tras «Ya estaba colgada»: no se escribe nada, y se dice así (el detalle del aviso «Ya estaba colgada»). */
export function textoYaEstabaColgada(prenda: Pick<PrendaBajable, "referencia" | "talla" | "color">): string {
  return `${nombreDePrenda(prenda)} ya cuenta en el piso: cuélgala. No se registró nada.`;
}

/** Lo que va a pasar, en la ventana, antes de confirmar. */
export function pasosEnMano(sede: string): [string, string, string] {
  return [
    `Se suma 1 al almacén de ${sede} como «Encontré prendas», con la nota «${NOTA_AUTOMATICA}».`,
    "Se cuelga en el piso, igual que una prenda escaneada: la caja ya la puede cobrar.",
    "Queda en Movimientos con el nombre de quien lo hace.",
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// La llamada a la base
// ---------------------------------------------------------------------------------------------------------------

export type ArgumentosEnMano = { p_ubicacion_id: string; p_variante_id: string; p_nota: string | null; p_token: string };

/** La nota de la persona como la guarda la base: sin espacios de más; vacía = null (la automática va igual). */
export function notaLimpia(nota: string | null | undefined): string | null {
  const limpia = (nota ?? "").replace(/\s+/g, " ").trim();
  return limpia ? limpia : null;
}

/** El objeto que recibe `rpc(RPC_EN_MANO, …)`: la pantalla no escribe los nombres de los parámetros a mano. */
export function argumentosEnMano(ubicacionId: string, varianteId: string, nota: string | null | undefined, token: string): ArgumentosEnMano {
  return { p_ubicacion_id: ubicacionId, p_variante_id: varianteId, p_nota: notaLimpia(nota), p_token: token };
}

export type RespuestaEnMano = {
  bajada_id: string;
  ya_registrada: boolean;
  /** true: se sumó 1 al almacén antes de bajarla. false: el almacén ya la tenía (otra persona la recibió): solo se bajó. */
  corregida: boolean;
  ajuste_movimiento_id: string | null;
  movimiento_id: string | null;
  /** Lo LIBRE del piso y del almacén de esa prenda después. */
  piso: number;
  almacen: number;
  registrada_en: string;
};

const esEntero = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const esUuidONulo = (x: unknown): x is string | null => x === null || (typeof x === "string" && ES_UUID.test(x));

/** Valida la forma del jsonb que devuelve `bajar_en_mano`; null si no calza. */
export function leerRespuestaEnMano(data: unknown): RespuestaEnMano | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const { bajada_id, ya_registrada, corregida, ajuste_movimiento_id, movimiento_id, piso, almacen, registrada_en } = d;
  if (typeof bajada_id !== "string" || !ES_UUID.test(bajada_id)) return null;
  if (typeof ya_registrada !== "boolean" || typeof corregida !== "boolean") return null;
  if (!esUuidONulo(ajuste_movimiento_id ?? null) || !esUuidONulo(movimiento_id ?? null)) return null;
  if (corregida !== (ajuste_movimiento_id !== null && ajuste_movimiento_id !== undefined)) return null;
  if (!esEntero(piso) || !esEntero(almacen)) return null;
  if (typeof registrada_en !== "string" || Number.isNaN(Date.parse(registrada_en))) return null;
  return {
    bajada_id,
    ya_registrada,
    corregida,
    ajuste_movimiento_id: (ajuste_movimiento_id as string | null | undefined) ?? null,
    movimiento_id: (movimiento_id as string | null | undefined) ?? null,
    piso,
    almacen,
    registrada_en,
  };
}

// Aquí no va el «no se guardó nada» genérico: sería falso si la respuesta se perdió DESPUÉS de guardar. La misma marca hace
// seguro volver a enviar (la base responde «ya registrada»); por eso la ventana se congela hasta saberlo.
const TEXTO_RED_CAIDA = `Se cortó la conexión y no sabemos si se guardó. Pulsa «${BOTON_EN_MANO_DE_NUEVO}»: si ya se había guardado, no se repite. Si cierras, queda anotada y se comprueba al volver a abrirla.`;

// Los rechazos que la base levanta DESPUÉS de mirar la marca (20261004223100: marca → responsable → candado → reglas):
// prueban que esa marca no guardó nada (o dicen que es de otra cosa).
const HINTS_DESPUES_DE_LA_MARCA = new Set([
  "en_mano_token_reusado",
  "responsable_requerido",
  "responsable_no_presente",
  "en_mano_apartada",
  "en_mano_sin_historia",
  "en_mano_tope_del_dia",
  // Las que levanta `bajar_al_piso` por dentro, con la misma marca ya mirada.
  "bajada_sin_alcance",
]);

export type ErrorEnMano = { tipo: "red"; mensaje: string } | { tipo: "rechazo"; mensaje: string; hint: string | null };

/** El rechazo de la base, dicho para quien está frente al rack; nunca lanza. */
export function interpretarErrorEnMano(error: ErrorEscritura, sede: string): ErrorEnMano {
  if (esRespuestaIncierta(error)) return { tipo: "red", mensaje: TEXTO_RED_CAIDA };
  if (error?.code === "40P01") {
    return { tipo: "rechazo", mensaje: "Otra operación estaba moviendo la misma prenda en ese momento. No se guardó nada: vuelve a intentarlo.", hint: null };
  }
  const contexto = sede.trim() ? `corregir y colgar la prenda en ${sede.trim()}` : "corregir y colgar la prenda";
  return { tipo: "rechazo", mensaje: traducirError(error, contexto), hint: error?.hint ?? null };
}

/**
 * En un REENVÍO (la marca ya viajó y no se supo qué pasó): ¿esta respuesta dice qué pasó con esa marca? Sí con éxito, con un
 * rechazo posterior a mirar la marca o con un choque de candados (se deshizo entero). No con un corte de red, la sesión
 * vencida, el módulo apagado o la tienda sin permiso: la base contestó sin mirar la marca.
 */
export function respuestaResuelveLaMarcaEnMano(error: ErrorEscritura): boolean {
  if (!error) return true;
  if (esRespuestaIncierta(error)) return false;
  if (error.code === "40P01") return true;
  return !!error.hint && HINTS_DESPUES_DE_LA_MARCA.has(error.hint);
}

// ---------------------------------------------------------------------------------------------------------------
// La marca de cada prenda: sobrevive a cerrar la ventana y a recargar la página
// ---------------------------------------------------------------------------------------------------------------

/*
 * POR QUÉ VIVE FUERA DE LA VENTANA. Tras un corte, la ventana se congela («Enviar de nuevo»), pero se puede cerrar, y la página
 * se puede recargar. Si la siguiente ventana de ESA prenda estrenara otra marca y la primera sí se había guardado, la base
 * corregiría dos veces con una sola prenda en la mano (+1 de más). Por eso la marca de una corrección sin respuesta queda en la
 * pantalla y en el aparato (localStorage, por tienda, como el borrador de la bajada), no en la ventana.
 *
 * CONTRATO
 *   PROMETE: mientras una corrección de una prenda esté en duda, toda ventana de esa prenda reenvía con SU marca y SU nota; la
 *            marca se suelta solo cuando la base dijo qué pasó con ella (`destinoDeLaMarca`). Una marca nueva solo nace
 *            cuando no hay ninguna en duda para esa prenda.
 *   ASUME:   una ventana a la vez; si el aparato no guarda (modo privado), la duda vive mientras la pantalla siga abierta.
 *   NO HACE: no decide si se guardó: eso solo lo sabe la base, al recibir la misma marca otra vez.
 */

/** Una corrección enviada sin respuesta: la marca con la que viajó, cuándo y con qué nota (el reenvío es idéntico). */
export type MarcaEnDuda = { varianteId: string; token: string; enviadoEn: string; nota: string | null };
/** Las marcas en duda de una tienda, por prenda. */
export type MarcasEnDuda = Readonly<Record<string, MarcaEnDuda>>;
/** Con qué abre la ventana: una marca estrenada (`enviadoEn` null) o la que quedó en duda (la ventana abre congelada). */
export type MarcaParaAbrir = { token: string; enviadoEn: string | null; nota: string | null };

export const VERSION_MARCAS_EN_MANO = 1;
/** Lo mismo que vive el borrador de la bajada: una duda de ayer ya no es de esta jornada. */
export const HORAS_DE_VIDA_DE_LA_MARCA = 12;
const MS_HORA = 3_600_000;

export function claveDeMarcasEnMano(ubicacionId: string): string {
  return `cayla:bajada:${ubicacionId}:en-mano`;
}

/** La marca de la ventana que se abre para esta prenda: la que quedó en duda, si hay; si no, una nueva (`nuevaMarca`). */
export function marcaParaAbrir(marcas: MarcasEnDuda, varianteId: string, nuevaMarca: () => string): MarcaParaAbrir {
  const enDuda = marcas[varianteId];
  return enDuda ? { token: enDuda.token, enviadoEn: enDuda.enviadoEn, nota: enDuda.nota } : { token: nuevaMarca(), enviadoEn: null, nota: null };
}

/** Se anota ANTES de llamar a la base: si la luz se corta durante la llamada, al volver la duda sigue ahí. */
export function anotarMarca(marcas: MarcasEnDuda, m: MarcaEnDuda): MarcasEnDuda {
  return { ...marcas, [m.varianteId]: m };
}

export function soltarMarca(marcas: MarcasEnDuda, varianteId: string): MarcasEnDuda {
  if (!(varianteId in marcas)) return marcas;
  const resto = { ...marcas };
  delete resto[varianteId];
  return resto;
}

/**
 * Tras la respuesta, ¿la marca queda en duda o se suelta?
 * - `en_duda`: un corte (no se sabe si se guardó), o un REENVÍO que la base contestó sin mirar la marca (sesión vencida,
 *   módulo apagado): la duda sigue igual.
 * - `suelta`: la base guardó, dijo «ya registrada», o rechazó después de mirar la marca (se deshizo entero). Y un PRIMER envío
 *   rechazado antes de mirarla: esa marca nunca viajó a una transacción que se confirmara, no hay nada que comprobar.
 */
export function destinoDeLaMarca(error: ErrorEscritura, eraReenvio: boolean): "en_duda" | "suelta" {
  if (!error) return "suelta";
  if (esRespuestaIncierta(error)) return "en_duda";
  return eraReenvio && !respuestaResuelveLaMarcaEnMano(error) ? "en_duda" : "suelta";
}

export function serializarMarcas(marcas: MarcasEnDuda): string {
  return JSON.stringify({
    v: VERSION_MARCAS_EN_MANO,
    marcas: Object.values(marcas).map((m) => ({ varianteId: m.varianteId, token: m.token, enviadoEn: m.enviadoEn, nota: m.nota })),
  });
}

/** Lo guardado en el aparato; descarta lo ilegible, lo de otra versión y lo que pasó de 12 h. Nunca lanza. */
export function leerMarcas(texto: string | null, ahora: Date): MarcasEnDuda {
  if (!texto) return {};
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {};
  }
  if (typeof crudo !== "object" || crudo === null || (crudo as { v?: unknown }).v !== VERSION_MARCAS_EN_MANO) return {};
  const lista = (crudo as { marcas?: unknown }).marcas;
  if (!Array.isArray(lista)) return {};
  let marcas: MarcasEnDuda = {};
  for (const x of lista as unknown[]) {
    if (typeof x !== "object" || x === null) continue;
    const { varianteId, token, enviadoEn, nota } = x as Record<string, unknown>;
    if (typeof varianteId !== "string" || !ES_UUID.test(varianteId) || typeof token !== "string" || !ES_UUID.test(token)) continue;
    if (typeof enviadoEn !== "string") continue;
    const enviado = Date.parse(enviadoEn);
    if (Number.isNaN(enviado) || ahora.getTime() - enviado > HORAS_DE_VIDA_DE_LA_MARCA * MS_HORA) continue;
    marcas = anotarMarca(marcas, { varianteId, token, enviadoEn, nota: typeof nota === "string" ? notaLimpia(nota) : null });
  }
  return marcas;
}

/** La línea «En duda» de «Corregidas y colgadas aquí». */
export function textoDeMarcaEnLista(m: Pick<MarcaEnDuda, "enviadoEn">): string {
  return `enviada a las ${diaYHoraLima(m.enviadoEn).hora}, sin respuesta`;
}

/** Lo que dice la ventana al abrirse congelada (la corrección de esta prenda quedó en duda). */
export function textoMarcaEnDuda(enviadoEn: string): string {
  return `Enviaste esta corrección a las ${diaYHoraLima(enviadoEn).hora} y no llegó la respuesta. Pulsa «${BOTON_EN_MANO_DE_NUEVO}»: si ya se había guardado, no se repite.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Lo que se lee después
// ---------------------------------------------------------------------------------------------------------------

/** El aviso de la esquina (`avisar.exito`). */
export function avisoDeEnMano(r: RespuestaEnMano, prenda: Pick<PrendaBajable, "referencia" | "talla" | "color">, sede: string): { titulo: string; detalle: string } {
  const nombre = nombreDePrenda(prenda);
  if (r.ya_registrada) {
    return { titulo: "Ya estaba registrada", detalle: `${nombre} · a las ${diaYHoraLima(r.registrada_en).hora}. No se repitió.` };
  }
  if (r.corregida) return { titulo: "Corregida y colgada", detalle: `${nombre} · +1 «Encontré prendas» y al piso de ${sede}` };
  return { titulo: "Colgada", detalle: `${nombre} · el almacén ya la tenía: no hizo falta corregir` };
}

/** Una línea de «Corregidas y colgadas aquí»: lo que ella hizo, sin volver a abrir Movimientos. */
export type HechaEnMano = { varianteId: string; nombre: string; corregida: boolean; hora: string; bajadaId: string };

export function hechaEnMano(r: RespuestaEnMano, varianteId: string, prenda: Pick<PrendaBajable, "referencia" | "talla" | "color">): HechaEnMano {
  return { varianteId, nombre: nombreDePrenda(prenda), corregida: r.corregida, hora: diaYHoraLima(r.registrada_en).hora, bajadaId: r.bajada_id };
}

/**
 * Una bajada ESCANEADA que se confirmó en esta pantalla: sus líneas, por su marca (`token` de la bajada; un reintento que
 * respondió «ya registrada» trae la misma y no se suma dos veces). Sin esto, con 1 libre en el almacén y 3 iguales en el fardo,
 * la 2.ª lectura daba «tope», ella confirmaba, y la 3.ª le preguntaba «¿ya estaba colgada?» por la que ella misma acababa de
 * colgar (revisión adversarial de la actividad 9).
 */
export type BajadaHechaAqui = { token: string; lineas: readonly LineaBajada[] };

export function sumarBajadaHecha(bajadas: readonly BajadaHechaAqui[], nueva: BajadaHechaAqui): BajadaHechaAqui[] {
  const lineas = nueva.lineas.filter((l) => l.cantidad > 0);
  return lineas.length === 0 || bajadas.some((b) => b.token === nueva.token) ? [...bajadas] : [...bajadas, { token: nueva.token, lineas }];
}

/**
 * Cuántas de esta prenda colgó ella en esta pantalla (para `ofertaEnMano`): las que corrigió y colgó «en la mano» (una bajada
 * repetida cuenta una vez) más las unidades de sus bajadas escaneadas y confirmadas.
 */
export function colgadasAquiDe(hechas: readonly HechaEnMano[], varianteId: string, bajadas: readonly BajadaHechaAqui[] = []): number {
  const enMano = new Set(hechas.filter((h) => h.varianteId === varianteId).map((h) => h.bajadaId)).size;
  const escaneadas = bajadas.reduce((n, b) => n + b.lineas.reduce((m, l) => m + (l.varianteId === varianteId ? l.cantidad : 0), 0), 0);
  return enMano + escaneadas;
}

/** Suma lo nuevo a la lista de hechas, sin repetir una bajada que ya estaba (un reintento que respondió «ya registrada»). */
export function sumarHecha(hechas: readonly HechaEnMano[], nueva: HechaEnMano): HechaEnMano[] {
  return hechas.some((h) => h.bajadaId === nueva.bajadaId) ? [...hechas] : [nueva, ...hechas];
}

/** «+1 en el almacén» o «el almacén ya la tenía», para la línea de la lista. */
export function textoDeHecha(h: HechaEnMano): string {
  return h.corregida ? `${h.hora} · +1 en el almacén y al piso` : `${h.hora} · al piso (el almacén ya la tenía)`;
}
