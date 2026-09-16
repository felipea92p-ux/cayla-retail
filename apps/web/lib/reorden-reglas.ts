// Reglas de punto de reorden e indicador de rotación (20260916100000), sin
// nada de servidor: las lecturas contra Postgres viven en `catalogo-v2.ts`
// (`fn_productos`/`fn_productos_resumen` ya calculan demanda/lead time/punto
// de reorden — acá solo se formatea lo que ya llegó calculado).

/** "Vende ~2.3/día" si se mueve rápido, "cada ~12 días" si se mueve lento,
 *  o null si no hubo ventas en los últimos 30 días (nada que mostrar). */
export function describirRotacion(demandaDiaria: number): string | null {
  if (demandaDiaria <= 0) return null;
  if (demandaDiaria >= 1) return `~${demandaDiaria.toFixed(1)}/día`;
  const dias = Math.round(1 / demandaDiaria);
  return `cada ~${dias} ${dias === 1 ? "día" : "días"}`;
}
