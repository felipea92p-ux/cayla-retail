// Reglas puras de la ruta que transmite un comprobante a SUNAT (`app/api/lucode/emitir/route.ts`): sin
// Supabase ni Lucode, para poder probarlas sin levantar nada. Lo que se transmite no se deshace, así
// que todo lo que pueda frenarlo se decide ANTES de llamar a Lucode, acá.

export type ComprobanteParaTransmitir = {
  estado: string;
  /** La venta de la que salió; `null` en un comprobante manual o una nota (no nacen de una venta). */
  venta_id: string | null;
  /** Lo que se pudo leer de esa venta; `null` si no se pudo leer (RLS o un fallo). */
  venta: { estado: string } | null;
};

export type NoSePuedeTransmitir = { error: string; status: 409 | 503 };

/** Por qué un comprobante NO se puede transmitir ahora, o `null` si sí. Solo se transmiten los
 *  `pendiente` (nunca salieron) y los `rechazado` (su único camino es reintentar, ADR-0093). Y nunca el
 *  de una venta ANULADA: se le devolvió el dinero a la clienta y sus prendas volvieron al stock, así que
 *  declararla a SUNAT sería declarar una venta que no existe. `anular_venta` ya libera el pendiente de
 *  la venta que anula (`20260921121500`); esto cubre el que sigue vivo (un `rechazado`) y cualquier
 *  base que aún no tenga esa migración. Si la venta existe pero no se pudo leer —o llegó sin `estado`:
 *  el `select` perdió el embebido, o PostgREST cambió su forma—, se niega y se pide reintentar: ante la
 *  duda no se declara nada (falla cerrada; `undefined` o un arreglo no pasan por «venta viva»). */
export function motivoParaNoTransmitir(c: ComprobanteParaTransmitir): NoSePuedeTransmitir | null {
  if (c.estado !== "pendiente" && c.estado !== "rechazado") {
    return { error: `Este comprobante ya está en estado "${c.estado}" — no se vuelve a transmitir.`, status: 409 };
  }
  if (c.venta_id !== null && typeof c.venta?.estado !== "string") {
    return { error: "No se pudo comprobar si la venta de este comprobante sigue vigente. Reintenta.", status: 503 };
  }
  if (c.venta?.estado === "anulada") {
    return { error: "La venta de este comprobante está anulada: no se transmite a SUNAT una venta que ya se devolvió.", status: 409 };
  }
  return null;
}
