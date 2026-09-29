/**
 * Lo que comparten las pantallas de Revisar y Confirmar del conteo (rediseño 2026-09-29): unir las líneas de la base con
 * lo que el catálogo sabe de cada prenda, ordenar lo que se revisa, y decir con palabras de la casa qué pasó cuando el
 * cierre falla. Puro y sin React: lo importan las páginas (servidor) y los componentes (navegador), y se prueba en
 * `conteo-revision.test.ts`. Imports relativos a propósito: vitest no resuelve `@/` para valores.
 *
 * Por qué vive aparte de `conteo-reglas.ts`: aquel archivo dice QUÉ ES un estado, un resumen o un bloqueo (reglas del
 * negocio, iguales en SQL y en TS); este arma las listas que esas dos pantallas dibujan. Si mañana Revisar cambia de
 * forma, las reglas no se mueven.
 */

import { agruparConteo, type GrupoConteo, type LineaConteo, type PrendaConteo } from "./conteo-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";

/** Una línea del conteo con lo que hace falta para dibujarla: cómo se llama la prenda y cómo se ve. */
export type FilaConteoVista = LineaConteo & Pick<PrendaConteo, "productoId" | "referencia" | "talla" | "color" | "colorHex" | "fotoUrl" | "sku">;

/**
 * Cruza las líneas (que solo traen `varianteId`) con el catálogo. Una variante que el catálogo ya no conoce NO se
 * descarta —cuenta en el resumen y en el cierre—: se dibuja con un nombre honesto en vez de desaparecer de la pantalla.
 */
export function unirLineasConPrendas(lineas: readonly LineaConteo[], prendas: readonly Pick<PrendaConteo, "varianteId" | "productoId" | "referencia" | "talla" | "color" | "colorHex" | "fotoUrl" | "sku">[]): FilaConteoVista[] {
  const porVariante = new Map(prendas.map((p) => [p.varianteId, p]));
  return lineas.map((l) => {
    const p = porVariante.get(l.varianteId);
    return {
      ...l,
      productoId: p?.productoId ?? l.varianteId,
      referencia: p?.referencia ?? "Prenda sin ficha en el catálogo",
      talla: p?.talla ?? null,
      color: p?.color ?? null,
      colorHex: p?.colorHex ?? null,
      fotoUrl: p?.fotoUrl ?? null,
      sku: p?.sku ?? "",
    };
  });
}

/**
 * Las variantes verificadas cuya cantidad no coincide con lo que CAYLA esperaba, confirmadas o no, en el orden fijo de
 * siempre (modelo, color, talla del rack). Es la lista de «Diferencias» de Revisar y la de «Se actualizarán N variantes»
 * de Confirmar: la misma regla, así lo que se revisa es exactamente lo que se cierra.
 */
export function diferenciasEnOrden(filas: readonly FilaConteoVista[]): FilaConteoVista[] {
  const conDiferencia = filas.filter((f) => f.estado === "con_diferencia" || f.estado === "diferencia_confirmada");
  return agruparConteo(conDiferencia).flatMap((g) => g.tallas);
}

/**
 * Las que todavía no tienen cantidad —pendientes y en reconteo—, juntas por percha (un modelo en un color) para que
 * quien vuelve a contar las encuentre de a una percha y no de a 150 renglones sueltos.
 */
export function pendientesPorPercha(filas: readonly FilaConteoVista[]): GrupoConteo<FilaConteoVista>[] {
  return agruparConteo(filas.filter((f) => f.estado === "pendiente" || f.estado === "en_reconteo"));
}

/**
 * Cuánto habrá en la sede DESPUÉS de aplicar el ajuste de esta línea: el ajuste se suma al stock de HOY (nunca «fija el
 * stock en lo contado»), así que lo que se vendió después de contar se conserva. `null` si no se sabe (el conteo ya no
 * está abierto) o no hay ajuste. Un resultado negativo significa que el cierre entero se rechazaría: la pantalla lo avisa
 * antes de que la persona lo descubra al pulsar el botón.
 */
export function existenciaTrasElAjuste(l: Pick<LineaConteo, "actual" | "diferencia">): number | null {
  if (l.actual === null || l.diferencia === null || l.diferencia === 0) return null;
  return l.actual + l.diferencia;
}

/**
 * La frase de una variante cuyo ajuste dejaría la existencia en negativo: «Hoy hay 1 por movimientos posteriores: el ajuste
 * la dejaría en −2 y así el conteo no se puede cerrar.» Solo tiene sentido cuando `existenciaTrasElAjuste` es negativa.
 * El signo es el menos tipográfico («−2»), el mismo que se lee en una pantalla y no se confunde con un guion.
 */
export function textoAjusteNegativo(l: { actual: number; quedaria: number }): string {
  return `Hoy hay ${l.actual} por movimientos posteriores: el ajuste la dejaría en −${Math.abs(l.quedaria)} y así el conteo no se puede cerrar.`;
}

/** El aviso de arriba de la lista de Confirmar cuando alguna variante tiene ese problema. */
export function textoQuedarianEnNegativo(n: number): string {
  return n === 1
    ? "1 variante quedaría con existencia negativa y el conteo no se puede cerrar así. Vuelve a revisar y cuéntala otra vez."
    : `${n} variantes quedarían con existencia negativa y el conteo no se puede cerrar así. Vuelve a revisar y cuéntalas otra vez.`;
}

/**
 * «Confirma o vuelve a contar 2 diferencias para continuar.» — lo que falta antes de poder avanzar. `para` completa la
 * frase: la misma explicación sirve al botón «Continuar» y al de «Cerrar como conteo parcial».
 */
export function textoConfirmaPrimero(n: number, para: "continuar" | "cerrar como conteo parcial"): string {
  return `Confirma o vuelve a contar ${n} ${n === 1 ? "diferencia" : "diferencias"} para ${para}.`;
}

/**
 * Lo que la persona lee cuando `cerrar_conteo` falla. El cierre es todo o nada: si la base lo rechaza, NO se movió ninguna
 * existencia, y eso es lo primero que hay que decir. Los rechazos de la base (P0001) ya vienen en castellano de CAYLA
 * («El ajuste dejaría stock negativo…», «…hay 3 apartadas para clientas — libera o resuelve esos apartados primero»).
 *
 * La excepción es la conexión: si se cortó, la base pudo guardar y no llegar la respuesta. Ahí NO se afirma que no cambió
 * nada —sería mentira y invitaría a repetir—: `incierto` le dice a la pantalla que ofrezca mirar cómo quedó el conteo.
 */
export function mensajeDeCierre(error: ErrorEscritura): { texto: string; incierto: boolean } {
  const incierto = esRespuestaIncierta(error);
  const base = traducirError(error, "cerrar el conteo", { confirmarAntesDeRepetir: true });
  return { texto: incierto ? base : `El conteo no se cerró y no cambió ninguna existencia. ${base}`, incierto };
}
