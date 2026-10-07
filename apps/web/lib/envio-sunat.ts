// Envío automático a SUNAT desde el navegador (D-60). Las dos llamadas van en segundo plano y nunca
// avisan nada: si Lucode no responde, la ruta deja el comprobante en la cola de reintento y la
// pantalla Comprobantes lo muestra. `x-espera: no` para que el loader global no bloquee a nadie
// (ADR-0149); `keepalive` para que salgan aunque se cierre la pestaña.

const OPCIONES = { method: "POST", headers: { "Content-Type": "application/json", "x-espera": "no" }, keepalive: true } as const;

/** Declara la boleta o factura de una venta recién cobrada. */
export function enviarVentaASunat(ventaId: string): void {
  fetch("/api/lucode/emitir", { ...OPCIONES, body: JSON.stringify({ venta_id: ventaId }) }).catch(() => {
    // Sin red: el comprobante sigue `pendiente` y lo recoge el próximo barrido.
  });
}

/** Reintenta lo vencido de la cola y pregunta por lo que quedó esperando a SUNAT (`null` = todas las sedes, solo
 *  líder). Devuelve cuántos comprobantes cambiaron o se intentaron: si es más de 0, la pantalla se refresca. */
export async function barrerColaSunat(ubicacionId: string | null): Promise<number> {
  try {
    const r = await fetch("/api/lucode/reintentar", { ...OPCIONES, body: JSON.stringify({ ubicacion_id: ubicacionId }) });
    if (!r.ok) return 0;
    const j = (await r.json()) as { tomados?: number; actualizados?: number };
    return (j.tomados ?? 0) + (j.actualizados ?? 0);
  } catch {
    return 0;
  }
}
