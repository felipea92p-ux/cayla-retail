/**
 * Refrescar la pantalla cuando una escritura se queda sin respuesta (ADR-0411) — la parte pura y el dato compartido.
 *
 * EL PROBLEMA. Desde ADR-0410, cuando se corta la conexión mientras se guarda, la pantalla dice la verdad: «no podemos
 * confirmar si llegó a guardarse; antes de volver a intentarlo, revisa si ya aparece registrado». Pero lo que hay detrás
 * de la hoja es la foto de cuando se abrió la pantalla: nadie la vuelve a leer. El 2026-10-14, en Producción ▸ Insumos ▸
 * Ingresar insumo, el lote ya estaba en la base y la lista seguía diciendo «0 lotes»: la colaboradora «revisa», no lo ve,
 * cierra la hoja, la abre de nuevo (con otra marca) y el lote entra dos veces.
 *
 * LA DECISIÓN. Se resuelve UNA vez, donde todo pasa, y no pantalla por pantalla: el interceptor de `fetch` del loader
 * (`components/ui/Espera.tsx`, que ya sabe qué petición es un guardado) anota aquí cada escritura que terminó sin
 * respuesta, y `<RefrescoTrasCorte />` (montado una vez en `app/(app)/layout.tsx`) rehace la pantalla con
 * `router.refresh()`: los Server Components vuelven a leer y lo que vive en el navegador (la hoja abierta, lo escrito,
 * su marca) se conserva. Es el mismo refresco silencioso de `<PreciosEnVivo />`.
 *
 * LOS TRES CUIDADOS, y por qué cada uno:
 *  · NUNCA SIN RED. Si la lectura de Next falla, Next no se rinde: pide la página entera (`fetch-server-response.js`,
 *    «Falling back to browser navigation»), y sin red eso es la página «Sin conexión»: la hoja y lo escrito se pierden.
 *    Por eso, antes de refrescar, se le pregunta a la base si responde; si no, se espera al evento `online` y se vuelve a
 *    preguntar cada vez más espaciado (`msHastaOtroSondeo`). Se refresca UNA vez por anotación: nunca en bucle.
 *  · NUNCA BAJO QUIEN TECLEA. Si la persona está escribiendo (una tecla hace menos de `MS_TECLEO`), se espera a que pare.
 *    No se espera a que salga del campo, como hace `<PreciosEnVivo />`: aquí el refresco es lo que le deja ver si ya se
 *    guardó, y quien envió con Enter sigue con el foco en el campo.
 *  · NUNCA EN UNA PANTALLA CON COLA PROPIA. Vender, Recibir y Nuevo producto guardan sin conexión y reintentan con la
 *    misma marca (`PANTALLAS_SIN_CONEXION`, ADR-0210): lo que pasa con su escritura lo cuenta su cola, y pueden estar
 *    mostrando la copia guardada del service worker.
 */

import { pantallaSinConexion } from "./sin-conexion-reglas";

/** Cuánto tiene que pasar desde la última tecla para dar por hecho que la persona dejó de escribir. */
export const MS_TECLEO = 1_500;

/** Entre una pregunta a la base y la siguiente, mientras no responde: cada vez más espaciado, hasta un minuto. */
const ESPERAS_SONDEO_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

/** Cuánto esperar para volver a preguntar después de `fallidos` preguntas seguidas sin respuesta. */
export function msHastaOtroSondeo(fallidos: number): number {
  const i = Math.min(Math.max(0, Math.floor(fallidos)), ESPERAS_SONDEO_MS.length - 1);
  return ESPERAS_SONDEO_MS[i];
}

/** ¿Esta ruta tiene su propia cola sin conexión? Ahí el refresco no se mete (ver arriba). */
export function rutaConColaPropia(ruta: string): boolean {
  return pantallaSinConexion(ruta) !== null;
}

export type PasoRefresco =
  /** No hay ninguna escritura sin respuesta anotada. */
  | { paso: "nada" }
  /** Lo anotado ya no aplica: la persona se fue de esa pantalla (la nueva se leyó al llegar) o la pantalla tiene cola propia. */
  | { paso: "olvidar" }
  /** Pestaña oculta: se mira al volver a ella. */
  | { paso: "dormir" }
  /** La persona está tecleando: se vuelve a mirar en `ms`. */
  | { paso: "esperar"; ms: number }
  /** Preguntarle a la base si responde y, si responde, refrescar. */
  | { paso: "sondear" };

/**
 * Qué hacer ahora con la escritura anotada. `pendienteEn` es la ruta donde quedó sin respuesta (o `null`), `ruta` la de
 * ahora y `msDesdeUltimaTecla` cuánto pasó desde la última tecla (`null` si no se tecleó nada).
 */
export function decidirRefresco(v: { pendienteEn: string | null; ruta: string; visible: boolean; msDesdeUltimaTecla: number | null }): PasoRefresco {
  if (v.pendienteEn === null) return { paso: "nada" };
  if (v.pendienteEn !== v.ruta || rutaConColaPropia(v.ruta)) return { paso: "olvidar" };
  if (!v.visible) return { paso: "dormir" };
  if (v.msDesdeUltimaTecla !== null && v.msDesdeUltimaTecla >= 0 && v.msDesdeUltimaTecla < MS_TECLEO) {
    return { paso: "esperar", ms: MS_TECLEO - v.msDesdeUltimaTecla };
  }
  return { paso: "sondear" };
}

// ---- El dato compartido: la última escritura sin respuesta, fuera de React para que el interceptor de `fetch` la anote ----

type Anotacion = { ruta: string; n: number };

let anotacion: Anotacion | null = null;
let contador = 0;
const oyentes = new Set<() => void>();

/** Una escritura terminó sin respuesta en `ruta`. La anota el interceptor de `fetch` del loader (`Espera.tsx`). */
export function anotarEscrituraSinRespuesta(ruta: string): void {
  anotacion = { ruta, n: ++contador };
  oyentes.forEach((o) => o());
}

/** La escritura sin respuesta que espera su refresco, o `null`. `n` distingue una anotación de la siguiente. */
export function escrituraPendiente(): Anotacion | null {
  return anotacion;
}

/**
 * Da por atendida la anotación `n` (ya se refrescó, o ya no aplica). Si mientras tanto llegó otra (otro guardado sin
 * respuesta durante la pregunta a la base), esa queda: el refresco que se hizo pudo ser anterior a ella.
 */
export function olvidarEscritura(n: number): void {
  if (anotacion?.n === n) anotacion = null;
}

/** Avisa cada vez que se anota una escritura sin respuesta. */
export function suscribirEscritura(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => void oyentes.delete(oyente);
}
