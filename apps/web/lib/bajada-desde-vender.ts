/**
 * La bajada al piso que se olvidó, registrada desde Vender (ADR-0320): el contrato con la base, sin React ni supabase.
 *
 * EL PROBLEMA. A veces cuelgan una prenda del almacén sin registrar la bajada. Al escanearla en la caja, el sistema dice
 * «0 en el piso» y Vender no la deja entrar al ticket. `bajar_al_piso_desde_vender`
 * (`20261003233000_bajar_al_piso_desde_vender.sql`) registra la bajada desde la misma caja y la venta sigue.
 *
 * CONTRATO. La caja manda cuántas libres tiene que haber en el PISO para el ticket (no «cuántas bajar»): la base baja solo
 * lo que falta. Así un reenvío tras un corte de red, o una bajada que otra persona registró en Existencias mientras tanto,
 * no cuentan la misma prenda dos veces en el piso. Vuelve lo libre en el piso y en el almacén DESPUÉS, para que la caja no
 * tenga que releer. El nombre y los parámetros viven aquí para que la prueba los fije contra la migración.
 */

import { DONDE_SE_BAJA } from "./vender-stock-local";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";

/** La RPC y sus parámetros en un solo lugar: `bajada-desde-vender.test.ts` los fija contra la migración. */
export const RPC_BAJADA_DESDE_VENDER = "bajar_al_piso_desde_vender";
export const PARAMETROS_RPC_BAJADA_DESDE_VENDER = ["p_ubicacion_id", "p_variante_id", "p_piso_necesario", "p_token"] as const;

/** Sin tope, una conexión colgada dejaría el loader encima de la caja: a los 20 s se corta y se trata como un corte de red
 *  (la base pudo haber guardado; volver a escanear no repite la bajada). */
export const TOPE_ESPERA_BAJADA_MS = 20_000;

export type ArgumentosDeBajadaDesdeVender = { p_ubicacion_id: string; p_variante_id: string; p_piso_necesario: number; p_token: string };

export type RespuestaBajadaDesdeVender = { yaRegistrada: boolean; bajadas: number; piso: number; almacen: number };

/** Cuántas libres tiene que haber en el PISO (según la base) para que el ticket lleve una más de esta prenda: las que ya
 *  lleva, la que entra, y lo vendido sin conexión que aún no subió (la pantalla ya lo descontó del piso; la base todavía
 *  no). La base baja solo lo que FALTA: si mientras tanto otra persona ya registró la bajada, no se baja nada. */
export function pisoNecesarioParaUnaMas({ enTicket, comprometidoEnCola = 0 }: { enTicket: number; comprometidoEnCola?: number }): number {
  return Math.max(0, enTicket) + 1 + Math.max(0, comprometidoEnCola);
}

/** El objeto que recibe `rpc(RPC_BAJADA_DESDE_VENDER, …)`: la pantalla no escribe los nombres de los parámetros a mano. */
export function argumentosDeBajadaDesdeVender(
  ubicacionId: string,
  varianteId: string,
  { enTicket, comprometidoEnCola = 0 }: { enTicket: number; comprometidoEnCola?: number },
  token: string,
): ArgumentosDeBajadaDesdeVender {
  return {
    p_ubicacion_id: ubicacionId,
    p_variante_id: varianteId,
    p_piso_necesario: pisoNecesarioParaUnaMas({ enTicket, comprometidoEnCola }),
    p_token: token,
  };
}

/** Valida la forma del jsonb que devuelve la base; null si no calza (la caja lo trata como un error, no inventa cifras). */
export function leerRespuestaBajadaDesdeVender(data: unknown): RespuestaBajadaDesdeVender | null {
  if (typeof data !== "object" || data === null) return null;
  const { ya_registrada, bajadas, piso, almacen } = data as Record<string, unknown>;
  const entero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (typeof ya_registrada !== "boolean" || !entero(bajadas) || !entero(piso) || !entero(almacen)) return null;
  return { yaRegistrada: ya_registrada, bajadas, piso, almacen };
}

/** Lo que dice el aviso de error si la bajada no se pudo registrar, para la colaboradora con la clienta delante:
 *  · corte de red (o la respuesta no llegó): no se sabe si se guardó, y volver a escanear es seguro (la base baja solo lo
 *    que falta). Nunca «no se guardó nada»: sería falso si la respuesta se perdió DESPUÉS de guardar;
 *  · la base todavía sin la función (la web se publicó antes de pegar la migración): el camino de siempre, sin códigos;
 *  · lo demás (no queda libre en el almacén, falta el responsable, otra tienda) ya viene en castellano de la base. */
export function textoErrorBajadaDesdeCaja(error: ErrorEscritura, nombre: string): string {
  if (error?.code === "PGRST202") {
    return `Registrar la bajada desde Vender todavía no está activo. Regístrala en ${DONDE_SE_BAJA} y vuelve a escanear ${nombre}.`;
  }
  if (esRespuestaIncierta(error)) {
    return `Se cortó la conexión y no sabemos si la bajada de ${nombre} se registró. Vuelve a escanearla: si ya estaba registrada, no se repite.`;
  }
  return traducirError(error, `registrar la bajada de ${nombre}`);
}
