// El saldo por prenda de Movimientos (ADR-0234, «Actualización 2026-09-26 (saldo)»): cuántas quedaron en la tienda
// —piso + almacén, sin la cuarentena, el «total» de Existencias— al terminar la operación de cada movimiento. El número
// lo calcula la base (`fn_movimientos_saldos`, que lee `fn_ledger_puntos`); acá solo se dice en palabras de tienda.
// Vive aparte de `movimientos-reglas.ts` para que la fila lo diga sin importar el servidor.

/** «quedan 4» · «queda 1» · «no queda ninguna». Null = la base no lo pudo decir (la fila sigue sin él). */
export function textoQuedan(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  if (n <= 0) return "no queda ninguna";
  return n === 1 ? "queda 1" : `quedan ${n.toLocaleString("es-PE")}`;
}

/** Lo que devuelve la base, por id de movimiento. Una fila rara (sin id o sin número) se ignora, no rompe la lista. */
export function leerSaldos(data: unknown): Record<string, number> {
  const saldos: Record<string, number> = {};
  if (!Array.isArray(data)) return saldos;
  for (const fila of data as { movimiento_id?: unknown; quedan?: unknown }[]) {
    if (typeof fila?.movimiento_id === "string" && typeof fila.quedan === "number") saldos[fila.movimiento_id] = fila.quedan;
  }
  return saldos;
}
