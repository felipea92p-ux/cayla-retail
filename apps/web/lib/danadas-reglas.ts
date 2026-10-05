/**
 * Dañadas (ADR-0328, actividad 10): las reglas puras de «Reportar dañada» (Existencias) y de «Se arregló» (la lista de
 * Dañadas), sin React ni supabase.
 *
 * EL PROBLEMA. Una prenda manchada que se descubría en el perchero no tenía puerta: la cuarentena solo recibía lo que volvía
 * por una devolución o un cambio, así que terminaba como ajuste «Merma» o seguía colgada y la caja la cobraba. Y de la
 * cuarentena no se salía «arreglada»: un botón descosido se perdía como merma. `reportar_danada` y `arreglar_prenda_danada`
 * (`20261005140000_danadas_reportar_y_se_arreglo.sql`) son las dos puertas; esta pantalla solo las llama.
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

/**
 * Un envío cuya respuesta quedó en duda (ADR-0208), guardado tal cual: los argumentos con su marca, lo que la ventana validó al
 * enviarlos y el nombre de la prenda para el aviso. Mientras exista, la ventana reenvía ESTO y no lo que hoy diga la pantalla.
 */
export type EnvioReporte = { argumentos: ArgumentosDeReporte; estado: EstadoReporte; detalle: string };

/**
 * Lo que la ventana valida: lo elegido ahora o, si un envío quedó en duda, lo que se envió. Tras una respuesta incierta la
 * pantalla se relee, y si el reporte SÍ se guardó, lo libre ya bajó: validar con las cifras nuevas diría «en el piso no hay
 * ninguna libre» de algo que la persona ya no puede cambiar (está congelado) y apagaría «Confirmar de nuevo», que es lo único
 * que dice qué pasó. Esa ventana trabada empujaba a cerrarla y reportar «desde el almacén» una prenda sana con otra marca.
 */
export function estadoValidado(vivo: EstadoReporte, enDuda: EnvioReporte | null): EstadoReporte {
  return enDuda ? enDuda.estado : vivo;
}

/**
 * ¿Se puede enviar? Sin nada en duda, cuando la guía está completa (las mismas reglas que la base). Con un envío en duda, solo
 * falta quién lo hace: se reenvía EXACTAMENTE lo enviado, con la misma marca (como en Reponer). Si ya se había guardado, la base
 * responde «ya estaba» sin moverla otra vez; si no, lo vuelve a intentar y dice si alcanza.
 */
export function puedeEnviarReporte(enDuda: boolean, guiaCompleta: boolean, responsableListo: boolean): boolean {
  return enDuda ? responsableListo : guiaCompleta;
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

const DESTINOS_DE_DANADAS = "En el sistema pasa a Dañadas y el líder decide si se arregla y vuelve, se liquida, se bota o se dona.";

/**
 * Lo que pasa al reportar, en palabras de tienda: se avisa ANTES de confirmar y sigue al lugar elegido. Pide el acto físico
 * primero porque el stock se cuenta por código, no por prenda: si quedan otras iguales en el piso, la caja sigue cobrando ese
 * código, y si la manchada sigue colgada puede salir vendida (y la cuarentena quedaría con una que ya no está).
 */
export function quePasaAlReportar(desde: DesdeDanada | null): string {
  if (desde === "piso") return `Sácala del perchero y guárdala aparte con una nota de lo que tiene: si sigue colgada, se puede vender. ${DESTINOS_DE_DANADAS}`;
  if (desde === "almacen") return `Sácala de su lugar en el almacén y guárdala aparte con una nota de lo que tiene, para que nadie la baje al piso. ${DESTINOS_DE_DANADAS}`;
  return `Guárdala aparte con una nota de lo que tiene. ${DESTINOS_DE_DANADAS}`;
}

/** Lo que el aviso de éxito recuerda hacer con la prenda en la mano (el sistema ya la movió; la percha todavía no). */
export function recordatorioAlReportar(desde: DesdeDanada): string {
  return desde === "piso" ? "Sácala del perchero y guárdala aparte con su nota." : "Guárdala aparte con su nota, lejos de lo que se baja al piso.";
}

/** Lo que pasa con «Se arregló»: vuelve al almacén y, para venderla, se baja al piso (así Frescura cuenta su edad desde ahí). */
export function quePasaAlArreglar(sede: string): string {
  const donde = sede.trim() ? `al almacén de ${sede.trim()}` : "al almacén";
  return `Vuelve ${donde}. Para venderla, bájala al piso desde Existencias.`;
}

/** Los desenlaces de una dañada en palabras de tienda (los valores de `prendas_danadas_estado_check`). */
const ESTADO_DANADA_EN_PALABRAS: Record<string, string> = {
  se_arreglo: "Se arregló",
  liquidada: "Liquidada",
  se_boto: "Se botó",
  donada: "Donada",
  devuelta_proveedor: "Devuelta al proveedor",
};
const YA_RESUELTA_CRUDO = /^Esta prenda ya se resolvió como ([a-z_]+)$/;

/**
 * El rechazo de «Se botó», «Donada» o «Liquidada» que perdió la carrera contra otro líder: `resolver_prenda_danada` y
 * `liquidar_prenda_danada` (de antes de esta pantalla) dicen el estado crudo («…como se_arreglo»). Se dice en palabras de tienda
 * y `yaResuelta` avisa a la pantalla que relea la lista. Cualquier otro rechazo pasa por `traducirError`.
 */
export function textoErrorDeResolucion(error: ErrorEscritura, contexto: string): { mensaje: string; yaResuelta: boolean } {
  const crudo = error?.message ? YA_RESUELTA_CRUDO.exec(error.message.trim()) : null;
  if (crudo) {
    const estado = ESTADO_DANADA_EN_PALABRAS[crudo[1]] ?? crudo[1];
    return { mensaje: `Esta prenda ya se resolvió como «${estado}». La lista se actualizó.`, yaResuelta: true };
  }
  return { mensaje: traducirError(error, contexto), yaResuelta: false };
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
