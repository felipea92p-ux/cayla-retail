/**
 * «La tengo en la mano» en Bajar al piso (ADR-0328, actividad 9): las reglas puras del callejón «el sistema dice 0 en el
 * almacén y la prenda está en mi mano», sin React, sin DOM y sin supabase.
 *
 * CONTRATO
 *   PROMETE: decir qué se le ofrece a la asesora cuando una lectura no se puede bajar porque el almacén está en 0 (corregir y
 *            colgar, o primero preguntar si es una de las que el sistema ya cuenta colgadas); armar la llamada a
 *            `retail.bajar_en_mano` (`20261004223100`); leer su respuesta y sus rechazos; y los textos de cada paso.
 *   ASUME:   la base decide lo que se puede (permiso, tope del día, lo apartado, la prenda que nunca entró) y lo dice en su
 *            mensaje; aquí no se repite ninguna regla de negocio de la base, solo se decide QUÉ PREGUNTAR antes de llamarla.
 *   NO HACE: no escribe nada ni cuenta stock: la cifra viene de la pantalla (lo que el sistema decía) y de la respuesta.
 */

import { nombreDePrenda, type PrendaBajable } from "./bajada-reglas";
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
 * - `corregir`: el sistema no cuenta esta prenda en el almacén ni en el piso (o las del piso son las que ella misma acaba de
 *   colgar aquí): la que tiene en la mano prueba que existe una más. Se ofrece corregir y colgar.
 * - `preguntar`: el sistema YA cuenta `enPiso` colgadas de esta prenda. La que tiene puede ser una de esas (la carga inicial
 *   «al piso» dejó así prendas que seguían guardadas): primero «Ya estaba colgada», que no escribe nada; y, si es otra
 *   unidad, corregir y colgar. Solo ella sabe qué unidad tiene en la mano: la base no lo decide (20261004223100).
 * `danadas`: las de esta prenda en cuarentena; si hay, se le advierte que la suya puede ser la dañada.
 */
export type OfertaEnMano = { tipo: "corregir"; danadas: number } | { tipo: "preguntar"; enPiso: number; danadas: number };

/**
 * `colgadasAqui`: las que ella corrigió y colgó en esta pantalla desde que la abrió. El piso que cuenta el sistema las incluye
 * (o las incluirá cuando la pantalla se relea): si no se descontaran, la segunda blusa igual del mismo fardo le preguntaría
 * «¿ya estaba colgada?» por la que ella misma colgó hace un minuto.
 */
export function ofertaEnMano(prenda: Pick<PrendaBajable, "piso" | "danado">, colgadasAqui: number): OfertaEnMano {
  const danadas = Math.max(0, prenda.danado ?? 0);
  const enPiso = Math.max(0, prenda.piso - Math.max(0, colgadasAqui));
  return enPiso > 0 ? { tipo: "preguntar", enPiso, danadas } : { tipo: "corregir", danadas };
}

function plural(n: number, singular: string, varias: string): string {
  return `${n} ${n === 1 ? singular : varias}`;
}

/** La tarjeta bajo el campo (y la bandeja de la cámara): qué dice el sistema y qué puede hacer ella. */
export function textoDeOferta(o: OfertaEnMano, prenda: Pick<PrendaBajable, "referencia" | "talla" | "color">, sede: string): string {
  const nombre = nombreDePrenda(prenda);
  const danadas = o.danadas > 0 ? ` Ojo: hay ${plural(o.danadas, "dañada", "dañadas")} en cuarentena; si la tuya es esa, no la cuelgues.` : "";
  if (o.tipo === "preguntar") {
    return `${nombre}: el almacén de ${sede} está en 0 y el sistema ya cuenta ${plural(o.enPiso, "colgada", "colgadas")}. ¿La que tienes es una de esas?${danadas}`;
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
    "Se baja al piso, igual que una prenda escaneada: la caja ya la puede cobrar.",
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
const TEXTO_RED_CAIDA = `Se cortó la conexión y no sabemos si se guardó. Pulsa «${BOTON_EN_MANO_DE_NUEVO}»: si ya se había guardado, no se repite.`;

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

/** Cuántas de esta prenda corrigió y colgó aquí (para `ofertaEnMano`). Una respuesta repetida (la misma bajada) cuenta una vez. */
export function colgadasAquiDe(hechas: readonly HechaEnMano[], varianteId: string): number {
  return new Set(hechas.filter((h) => h.varianteId === varianteId).map((h) => h.bajadaId)).size;
}

/** Suma lo nuevo a la lista de hechas, sin repetir una bajada que ya estaba (un reintento que respondió «ya registrada»). */
export function sumarHecha(hechas: readonly HechaEnMano[], nueva: HechaEnMano): HechaEnMano[] {
  return hechas.some((h) => h.bajadaId === nueva.bajadaId) ? [...hechas] : [nueva, ...hechas];
}

/** «+1 en el almacén» o «el almacén ya la tenía», para la línea de la lista. */
export function textoDeHecha(h: HechaEnMano): string {
  return h.corregida ? `${h.hora} · +1 en el almacén y al piso` : `${h.hora} · al piso (el almacén ya la tenía)`;
}
