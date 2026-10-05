/**
 * «Subir a almacén» (ADR-0300): las reglas puras de la ventana que sube varias tallas del piso al almacén, sin React ni supabase.
 *
 * EL PROBLEMA. «Colgar en el piso» sube varias tallas de una vez porque existe `bajar_al_piso`; el movimiento contrario solo tenía
 * una llamada por talla, y con dos llamadas una prenda podía quedar subida a medias. `retirar_del_piso`
 * (`20261001150000_retirar_del_piso.sql`) las sube TODAS en una transacción, con una marca de reintento por lista.
 *
 * CONTRATO. Esta pantalla manda UNA llamada con las líneas y la marca, y lee de vuelta una de tres cosas: «hecho» (o «ya estaba
 * hecho»), «no alcanza» (con la lista de tallas que no, y no se movió NADA) o «no sé» (corte de red: las cifras quedan fijas
 * y se reenvía lo mismo con la misma marca). No hay estado intermedio que la pantalla tenga que reconstruir.
 * El nombre del lugar y los textos viven aquí para que la prueba los fije contra la migración (`PARAMETROS_RPC_RETIRO`).
 */

import { BOTON_CONFIRMAR_DE_NUEVO, itemsParaRpc, lineasSinAlcance, type ItemRpc, type LineaBajada } from "./bajada-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import { RETIRO_NO_ES_BAJA } from "./inventario-reglas";
import { quedaraPidiendoColgar } from "./piso-plan";
import type { Cantidades, TallaParaBajar } from "./bajar-prenda-reglas";

/** La RPC y sus parámetros en un solo lugar: `retiro-reglas.test.ts` los fija contra la migración. */
export const RPC_RETIRO = "retirar_del_piso";
export const PARAMETROS_RPC_RETIRO = ["p_ubicacion_id", "p_items", "p_nota", "p_token"] as const;

/** El máximo de la nota (la base lo exige igual: hint `retiro_nota_larga`). */
export const MAX_NOTA_RETIRO = 200;

export type ArgumentosDeRetiro = { p_ubicacion_id: string; p_items: ItemRpc[]; p_nota: string | null; p_token: string };

export type RespuestaRetiro = { ya_registrada: boolean; lineas: number; unidades: number };

/** El objeto que recibe `rpc(RPC_RETIRO, …)`: la pantalla no escribe los nombres de los parámetros a mano. Una nota en blanco es «sin nota». */
export function argumentosDeRetiro(ubicacionId: string, lineas: readonly LineaBajada[], nota: string, token: string): ArgumentosDeRetiro {
  return { p_ubicacion_id: ubicacionId, p_items: itemsParaRpc(lineas), p_nota: nota.trim() || null, p_token: token };
}

/** Valida la forma del jsonb que devuelve `retirar_del_piso`; null si no calza. */
export function leerRespuestaDeRetiro(data: unknown): RespuestaRetiro | null {
  if (typeof data !== "object" || data === null) return null;
  const { ya_registrada, lineas, unidades } = data as Record<string, unknown>;
  const entero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (typeof ya_registrada !== "boolean" || !entero(lineas) || !entero(unidades)) return null;
  return { ya_registrada, lineas, unidades };
}

// Aquí no va el «no se guardó nada» genérico: sería falso si la respuesta se perdió DESPUÉS de guardar. La misma marca con la misma
// lista hace seguro volver a enviar; por eso las cifras se congelan hasta que la base responda.
const TEXTO_RED_CAIDA = `Se cortó la conexión y no sabemos si se subieron. Tus cifras siguen aquí: pulsa «${BOTON_CONFIRMAR_DE_NUEVO}». Si ya se habían subido, no se repite.`;

export type ErrorDeRetiro =
  | { tipo: "red"; mensaje: string }
  | { tipo: "sin_alcance"; mensaje: string; lineas: { varianteId: string; hay: number; motivo: string }[] }
  | { tipo: "otro"; mensaje: string };

/** El rechazo de la base, dicho para quien está junto a la percha; nunca lanza, ni con un `details` roto. */
export function interpretarErrorDeRetiro(error: ErrorEscritura, sede: string): ErrorDeRetiro {
  if (esRespuestaIncierta(error)) return { tipo: "red", mensaje: TEXTO_RED_CAIDA };
  if (error?.code === "40P01") {
    return { tipo: "otro", mensaje: "Otra operación estaba moviendo las mismas prendas en ese momento. No se subió nada: vuelve a confirmar." };
  }
  const contexto = sede.trim() ? `subir las prendas al almacén de ${sede.trim()}` : "subir las prendas al almacén";
  if (error?.hint === "retiro_sin_alcance") {
    return { tipo: "sin_alcance", mensaje: error.message || traducirError(error, contexto), lineas: lineasSinAlcance(error.details) };
  }
  return { tipo: "otro", mensaje: traducirError(error, contexto) };
}

// Los rechazos que la base levanta DESPUÉS de mirar la marca: prueban que esa marca no guardó nada, o ya la tenía.
const HINTS_DESPUES_DE_LA_MARCA = new Set([
  "retiro_sin_alcance",
  "responsable_requerido",
  "responsable_no_presente",
  "retiro_tienda_sin_piso",
  "mover_interno_token_reusado",
]);

/**
 * En un REENVÍO (la marca ya viajó una vez y no se supo qué pasó): ¿esta respuesta dice qué pasó con esa marca? Sí con éxito, con un
 * rechazo posterior a mirar la marca o con un choque de candados (40P01: pasó la marca y se deshizo entero). No con un corte de red,
 * una sesión vencida, el módulo apagado o la tienda sin permiso: la base contestó sin mirar la marca, y soltarla dejaría subir dos
 * veces lo que quizá ya se guardó.
 */
export function respuestaResuelveLaMarcaDeRetiro(error: ErrorEscritura): boolean {
  if (!error) return true;
  if (esRespuestaIncierta(error)) return false;
  if (error.code === "40P01") return true;
  return !!error.hint && HINTS_DESPUES_DE_LA_MARCA.has(error.hint);
}

/** Debajo del rechazo, mientras las cifras siguen congeladas porque la base no miró la marca. `hora` ya viene en 24 h de Lima. */
export function textoMarcaSinResolverDeRetiro(hora: string): string {
  return `Todavía no sabemos si lo que enviaste a las ${hora} se subió. Cuando se resuelva lo de arriba, pulsa «${BOTON_CONFIRMAR_DE_NUEVO}»: si ya se había subido, no se repite.`;
}

/** El botón: dice cuánto sube apenas hay algo elegido, y tras un corte de red pide confirmar lo mismo de nuevo. */
export function textoBotonSubir(total: number, congelado: boolean): string {
  if (congelado) return BOTON_CONFIRMAR_DE_NUEVO;
  if (total <= 0) return "Subir a almacén";
  return total === 1 ? "Subir 1 prenda" : `Subir ${total} prendas`;
}

/** El aviso de éxito de la esquina. */
export function tituloDeExitoRetiro(unidades: number): string {
  return unidades === 1 ? "1 prenda subida al almacén" : `${unidades} prendas subidas al almacén`;
}

export const TEXTO_YA_ESTABA_SUBIDA = "Esta subida ya estaba registrada. No se repitió.";

/** Lo que Existencias va a decir de una talla que se quede sin ninguna colgada (y que el piso pide: del centro o vendida ayer u
 *  hoy): se avisa ANTES de confirmar (ADR-0208, bloque 3). Decía «las que queden con poco» hasta que «Por reponer» se fundió en
 *  «Por colgar» (basta 1 por color: lo único que vuelve a pedir bajar es quedarse sin ninguna). */
export const AVISO_QUEDA_SIN_COLGAR = "Alguna talla se queda sin ninguna colgada: Existencias va a pedir bajarla de nuevo.";

/** Los dos textos que puede mostrar el bloque de abajo, para que la ventana reserve el alto del más largo (ADR-0185). */
export const TEXTOS_BLOQUE_SUBIR: readonly string[] = [RETIRO_NO_ES_BAJA, AVISO_QUEDA_SIN_COLGAR];

/**
 * El texto del bloque: si alguna talla elegida quedaría pidiendo colgar según el motor del piso, lo dice; si no,
 * recuerda que subir no es dar de baja. Pregunta a `quedaraPidiendoColgar` (`lib/piso-plan.ts`), la misma regla que después
 * pinta la fila, con el requisito de cada talla, y recibe lo DISPONIBLE como la ventana.
 */
export function textoDelBloqueSubir(tallas: readonly TallaParaBajar[], cantidades: Cantidades): string {
  const quedaCorto = tallas.some((t) => {
    const n = Math.min(Math.max(0, Math.trunc(cantidades[t.varianteId] ?? 0)), t.piso);
    return n > 0 && quedaraPidiendoColgar({ piso: t.piso, almacen: t.almacen }, n, t.requisito);
  });
  return quedaCorto ? AVISO_QUEDA_SIN_COLGAR : RETIRO_NO_ES_BAJA;
}
