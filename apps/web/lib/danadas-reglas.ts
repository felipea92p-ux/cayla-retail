/**
 * Dañadas (ADR-0328, actividad 10): las reglas puras de «Reportar dañada» (Existencias) y de «Se arregló» (la lista de
 * Dañadas), sin React ni supabase.
 *
 * EL PROBLEMA. Una prenda manchada que se descubría en el perchero no tenía puerta: la cuarentena solo recibía lo que volvía
 * por una devolución o un cambio, así que terminaba como ajuste «Merma» o seguía colgada y la caja la cobraba. Y de la
 * cuarentena no se salía «arreglada»: un botón descosido se perdía como merma. `reportar_danada` y `arreglar_prenda_danada`
 * (`20261005110000_danadas_reportar_y_se_arreglo.sql`) son las dos puertas; esta pantalla solo las llama.
 *
 * CONTRATO.
 *   PROMETE: decir qué falta para reportar (la talla, dónde estaba, cuántas, qué tiene) con las MISMAS reglas que la base
 *            (lo libre, 3 a 200 letras); armar los argumentos de cada RPC (sus nombres viven aquí y la prueba los fija contra
 *            la migración); y leer la respuesta en uno de tres finales: hecho (o ya estaba hecho), no alcanza / no se puede,
 *            o «no sé» (corte de red: se reenvía lo mismo con la misma marca).
 *   ASUME:   las cifras que recibe son las LIBRES de Existencias (`pisoDisponible`, `almacenDisponible`: sin lo apartado).
 *   NO HACE: no decide qué se hace con la prenda (eso es del líder, en Dañadas) ni cuenta una pérdida: reportar es moverla a la
 *            cuarentena dentro de la sede.
 */

import { BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import type { CampoDeGuia } from "./guia-campos";

/** Las RPC y sus parámetros en un solo lugar: `danadas-reglas.test.ts` los fija contra la migración. */
export const RPC_REPORTAR_DANADA = "reportar_danada";
export const PARAMETROS_RPC_REPORTAR = ["p_ubicacion_id", "p_variante_id", "p_cantidad", "p_desde", "p_motivo", "p_token"] as const;
export const RPC_ARREGLAR_DANADA = "arreglar_prenda_danada";
export const PARAMETROS_RPC_ARREGLAR = ["p_id", "p_nota", "p_token"] as const;

/** Lo que tiene la prenda y lo que se le arregló: entre 3 y 200 caracteres (la base exige lo mismo). */
export const MIN_TEXTO_DANADA = 3;
export const MAX_TEXTO_DANADA = 200;

export type DesdeDanada = "piso" | "almacen";

/** Una talla de la prenda tal como la ve la ventana: lo LIBRE de hoy en el piso y en el almacén de la sede. */
export type TallaReportable = { varianteId: string; talla: string | null; piso: number; almacen: number };

/** Lo mínimo de una fila de Existencias que la ventana necesita (para no depender del tipo entero). */
type FilaConLibres = { varianteId: string; talla: string | null; pisoDisponible: number | null; almacenDisponible: number | null };

/** Las tallas de un color, con lo libre de cada lugar (null en una sede sin piso y almacén cuenta como 0: allí no se reporta). */
export function tallasReportables(filas: readonly FilaConLibres[]): TallaReportable[] {
  return filas.map((f) => ({ varianteId: f.varianteId, talla: f.talla, piso: Math.max(0, f.pisoDisponible ?? 0), almacen: Math.max(0, f.almacenDisponible ?? 0) }));
}

/** Cuántas libres hay en ese lugar (0 sin talla o sin lugar). */
export function libreEn(t: TallaReportable | null, desde: DesdeDanada | null): number {
  if (!t || !desde) return 0;
  return desde === "piso" ? t.piso : t.almacen;
}

/** ¿Hay algo que reportar en esta talla? (libre en el piso o en el almacén). */
export const tieneAlgoLibre = (t: TallaReportable) => t.piso + t.almacen > 0;

/** La talla que entra elegida: solo si es la ÚNICA con algo libre. Con dos o más, la elige la persona (es la que tiene en la mano). */
export function tallaInicial(tallas: readonly TallaReportable[]): string | null {
  const conAlgo = tallas.filter(tieneAlgoLibre);
  return conAlgo.length === 1 ? conAlgo[0].varianteId : null;
}

/**
 * Dónde estaba: entra elegido solo si es el ÚNICO lugar posible. Con piso y almacén a la vez, la persona lo dice: el sistema no
 * sabe de dónde la sacó, y un lugar marcado de fábrica descuadraría el piso (ADR-0328, decisión técnica 3, el mismo motivo).
 */
export function desdeInicial(t: TallaReportable | null): DesdeDanada | null {
  if (!t) return null;
  if (t.piso > 0 && t.almacen === 0) return "piso";
  if (t.almacen > 0 && t.piso === 0) return "almacen";
  return null;
}

/** Al cambiar de talla o de lugar, la cantidad se acomoda a lo que hay (nunca más de lo libre, nunca menos de 1 si hay algo). */
export function cantidadAjustada(cantidad: number, libre: number): number {
  if (libre <= 0) return 1;
  const n = Number.isFinite(cantidad) ? Math.trunc(cantidad) : 1;
  return Math.min(Math.max(1, n), libre);
}

const largoUtil = (texto: string) => texto.trim().length;

export type EstadoReporte = { talla: TallaReportable | null; desde: DesdeDanada | null; cantidad: number; motivo: string };
export type CampoReporte = "talla" | "desde" | "cantidad" | "motivo";
export type ProblemaReporte = { campo: CampoReporte; texto: string };

/**
 * Lo que impide reportar, en el orden de la ventana. Son las MISMAS reglas que `reportar_danada` (lo libre, 1 o más, 3 a 200
 * letras): la guía de foco sale de aquí y una prueba exige que coincidan.
 */
export function problemasReporte(e: EstadoReporte): ProblemaReporte[] {
  const out: ProblemaReporte[] = [];
  if (!e.talla) out.push({ campo: "talla", texto: "Elige la talla de la prenda dañada." });
  if (!e.desde) out.push({ campo: "desde", texto: "Di dónde estaba: colgada en el piso o guardada en el almacén." });
  else if (e.talla && libreEn(e.talla, e.desde) === 0) {
    out.push({ campo: "desde", texto: `En ${e.desde === "piso" ? "el piso" : "el almacén"} no hay ninguna libre de esa talla: elige el otro lugar.` });
  }
  const libre = libreEn(e.talla, e.desde);
  if (!Number.isInteger(e.cantidad) || e.cantidad < 1) out.push({ campo: "cantidad", texto: "Reporta al menos 1 prenda." });
  else if (libre > 0 && e.cantidad > libre) out.push({ campo: "cantidad", texto: `Solo hay ${libre} libre${libre === 1 ? "" : "s"} ahí.` });
  const largo = largoUtil(e.motivo);
  if (largo < MIN_TEXTO_DANADA) out.push({ campo: "motivo", texto: "Escribe qué tiene la prenda." });
  else if (largo > MAX_TEXTO_DANADA) out.push({ campo: "motivo", texto: `Lo que tiene admite hasta ${MAX_TEXTO_DANADA} caracteres.` });
  return out;
}

const NOMBRE_CAMPO_REPORTE: Record<CampoReporte, string> = {
  talla: "La talla",
  desde: "Dónde estaba",
  cantidad: "Cuántas",
  motivo: "Qué tiene",
};

/** La guía de foco de la ventana (ADR-0284): un campo por pregunta, «hecho» si no tiene problema, y quién lo hace al final. */
export function camposGuiaReporte(e: EstadoReporte, responsableListo: boolean): CampoDeGuia[] {
  const problemas = problemasReporte(e);
  const campo = (id: CampoReporte): CampoDeGuia => {
    const p = problemas.find((x) => x.campo === id);
    return { id, nombre: NOMBRE_CAMPO_REPORTE[id], requerido: true, hecho: !p, pendiente: p?.texto ?? "" };
  };
  return [
    campo("talla"),
    campo("desde"),
    campo("cantidad"),
    campo("motivo"),
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién reporta la prenda." },
  ];
}

/** La guía del panel «Se arregló»: qué se le hizo (lo exige la base) y quién lo hace. */
export function camposGuiaArreglo(nota: string, responsableListo: boolean): CampoDeGuia[] {
  const largo = largoUtil(nota);
  return [
    {
      id: "arreglo",
      nombre: "Qué se arregló",
      requerido: true,
      hecho: largo >= MIN_TEXTO_DANADA && largo <= MAX_TEXTO_DANADA,
      pendiente: largo > MAX_TEXTO_DANADA ? `Admite hasta ${MAX_TEXTO_DANADA} caracteres.` : "Escribe qué se le hizo a la prenda.",
    },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién decide." },
  ];
}

export type ArgumentosDeReporte = {
  p_ubicacion_id: string;
  p_variante_id: string;
  p_cantidad: number;
  p_desde: DesdeDanada;
  p_motivo: string;
  p_token: string;
};

/** El objeto que recibe `rpc(RPC_REPORTAR_DANADA, …)`: la pantalla no escribe los nombres de los parámetros a mano. */
export function argumentosDeReporte(ubicacionId: string, varianteId: string, desde: DesdeDanada, cantidad: number, motivo: string, token: string): ArgumentosDeReporte {
  return { p_ubicacion_id: ubicacionId, p_variante_id: varianteId, p_cantidad: cantidad, p_desde: desde, p_motivo: motivo.trim(), p_token: token };
}

export type ArgumentosDeArreglo = { p_id: string; p_nota: string; p_token: string };

export function argumentosDeArreglo(id: string, nota: string, token: string): ArgumentosDeArreglo {
  return { p_id: id, p_nota: nota.trim(), p_token: token };
}

export type RespuestaDanada = { ya_registrada: boolean; id: string; unidades: number };

/** Valida la forma del jsonb que devuelven las dos RPC; null si no calza. */
export function leerRespuestaDanada(data: unknown): RespuestaDanada | null {
  if (typeof data !== "object" || data === null) return null;
  const { ya_registrada, id, unidades } = data as Record<string, unknown>;
  if (typeof ya_registrada !== "boolean" || typeof id !== "string" || !id) return null;
  if (typeof unidades !== "number" || !Number.isInteger(unidades) || unidades < 1) return null;
  return { ya_registrada, id, unidades };
}

/** Tras un corte de red: no se sabe si se guardó; la misma marca hace seguro reenviar. Nunca «no se guardó nada». */
export const TEXTO_RED_DANADA = `Se cortó la conexión y no sabemos si se guardó. Lo que escribiste sigue aquí: pulsa «${BOTON_CONFIRMAR_DE_NUEVO}». Si ya se había guardado, no se repite.`;

export type ErrorDeDanada = { tipo: "red"; mensaje: string } | { tipo: "sin_alcance"; mensaje: string; hay: number | null } | { tipo: "otro"; mensaje: string };

/** El `detail` de `danada_sin_alcance`: cuántas libres había. Nunca lanza con un detalle roto. */
function hayEnDetalle(details: string | null | undefined): number | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { hay?: unknown };
    return typeof d.hay === "number" && Number.isInteger(d.hay) && d.hay >= 0 ? d.hay : null;
  } catch {
    return null;
  }
}

/** El rechazo de la base, dicho para quien está junto a la percha; nunca lanza. `contexto`: «reportar la prenda dañada». */
export function interpretarErrorDeDanada(error: ErrorEscritura, contexto: string): ErrorDeDanada {
  if (esRespuestaIncierta(error)) return { tipo: "red", mensaje: TEXTO_RED_DANADA };
  if (error?.code === "40P01") {
    return { tipo: "otro", mensaje: "Otra operación estaba moviendo la misma prenda en ese momento. No se guardó nada: vuelve a confirmar." };
  }
  if (error?.hint === "danada_sin_alcance") {
    return { tipo: "sin_alcance", mensaje: error.message || traducirError(error, contexto), hay: hayEnDetalle(error.details) };
  }
  return { tipo: "otro", mensaje: traducirError(error, contexto) };
}

// Los rechazos que la base levanta DESPUÉS de mirar la marca: prueban que esa marca no guardó nada, o ya la tenía.
const HINTS_DESPUES_DE_LA_MARCA = new Set([
  "danada_sin_alcance",
  "arreglo_ya_resuelta",
  "arreglo_sede_sin_almacen",
  "responsable_requerido",
  "responsable_no_presente",
  "responsable_sin_acceso",
  "ubicacion_requerida",
  "mover_interno_token_reusado",
]);

/**
 * En un REENVÍO (la marca ya viajó una vez y no se supo qué pasó): ¿esta respuesta dice qué pasó con esa marca? Sí con éxito,
 * con un rechazo posterior a mirar la marca o con un choque de candados (40P01: se deshizo entero). No con un corte de red, una
 * sesión vencida, el módulo apagado o la sede sin permiso: la base contestó sin mirar la marca, y soltarla dejaría guardar dos
 * veces lo que quizá ya se guardó.
 */
export function respuestaResuelveLaMarca(error: ErrorEscritura): boolean {
  if (!error) return true;
  if (esRespuestaIncierta(error)) return false;
  if (error.code === "40P01") return true;
  return !!error.hint && HINTS_DESPUES_DE_LA_MARCA.has(error.hint);
}

/** El botón de la ventana: dice cuántas apenas se puede, y tras un corte de red pide confirmar lo mismo de nuevo. */
export function textoBotonReportar(cantidad: number, congelado: boolean): string {
  if (congelado) return BOTON_CONFIRMAR_DE_NUEVO;
  if (!Number.isInteger(cantidad) || cantidad <= 1) return "Reportar dañada";
  return `Reportar ${cantidad} dañadas`;
}

export function tituloExitoReporte(unidades: number): string {
  return unidades === 1 ? "Prenda reportada como dañada" : `${unidades} prendas reportadas como dañadas`;
}

export function tituloExitoArreglo(unidades: number): string {
  return unidades === 1 ? "Volvió al almacén" : `${unidades} prendas volvieron al almacén`;
}

export const TEXTO_REPORTE_YA_ESTABA = "Este reporte ya estaba guardado. No se repitió.";
export const TEXTO_ARREGLO_YA_ESTABA = "Esta prenda ya había vuelto al almacén. No se repitió.";

/** Lo que pasa al reportar, en palabras de tienda: se avisa ANTES de confirmar. */
export const QUE_PASA_AL_REPORTAR =
  "Pasa a Dañadas: la caja ya no la puede cobrar. El líder decide si se arregla y vuelve, se liquida, se bota o se dona.";

/** Lo que pasa con «Se arregló»: vuelve al almacén y, para venderla, se baja al piso (así Frescura cuenta su edad desde ahí). */
export function quePasaAlArreglar(sede: string): string {
  const donde = sede.trim() ? `al almacén de ${sede.trim()}` : "al almacén";
  return `Vuelve ${donde}. Para venderla, bájala al piso desde Existencias.`;
}

export type OrigenDanada = "reporte" | "devolucion" | "cambio";

/** De dónde llegó la prenda a Dañadas. La base exige exactamente uno (`prendas_danadas_un_origen`): con motivo es un reporte,
 *  con cambio es un cambio, y lo demás es una devolución (el origen más antiguo de la cuarentena). */
export function origenDeDanada(f: { motivoReporte: string | null; cambioId: string | null }): OrigenDanada {
  if (f.motivoReporte) return "reporte";
  if (f.cambioId) return "cambio";
  return "devolucion";
}

/** La línea que dice de dónde llegó: «Reportada en la tienda: mancha en la manga», «Volvió en una devolución»… */
export function textoOrigenDanada(origen: OrigenDanada, motivoReporte: string | null): string {
  if (origen === "reporte") return motivoReporte ? `Reportada en la tienda: ${motivoReporte}` : "Reportada en la tienda";
  return origen === "cambio" ? "Volvió en un cambio" : "Volvió en una devolución";
}
