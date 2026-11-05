// Configuración ▸ Metas (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): un tubo por mes y otro por día. Lógica pura de lo que dibujan.
// Solo dibuja: las reglas de qué meta rige siguen en la base (`fn_parametros_caja`, `fn_configuracion_metas`).

const ALTURA_MINIMA = 0.04;

/** Lo que vale «Lo normal» en un mes cualquiera: la semana tipo llevada a 30 días. Es para comparar tubos, no una meta: la del mes de verdad la suma la base. */
export function mesTipico(semana: readonly (number | null)[]): number | null {
  if (semana.every((m) => m === null)) return null;
  return (semana.reduce<number>((t, m) => t + (m ?? 0), 0) * 30) / 7;
}

/** Hasta dónde se llena cada tubo, de 0 a 1, contra el más alto. Sin dato, vacío; con poco, se alcanza a ver. */
export function alturas(valores: readonly (number | null)[]): number[] {
  const tope = Math.max(0, ...valores.map((v) => v ?? 0));
  if (tope <= 0) return valores.map(() => 0);
  return valores.map((v) => (v === null || v <= 0 ? 0 : Math.max(ALTURA_MINIMA, v / tope)));
}

/** «123 mil», «850», «1,2 M»: lo que cabe bajo un tubo. Sin dato, «—». El monto exacto va en el nombre del botón. */
export function montoCorto(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} M`;
  if (v >= 10_000) return `${Math.round(v / 1000)} mil`;
  if (v >= 1000) return `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil`;
  return String(Math.round(v));
}

/** Un mes hereda si no tiene ningún día propio: usa la semana de «Lo normal». */
export function heredaLoNormal(semana: readonly (number | null)[]): boolean {
  return semana.every((m) => m === null);
}

/** Lo que muestra cada día: el suyo o, si está vacío, el de «Lo normal». */
export function semanaEfectiva(semana: readonly (number | null)[], normal: readonly (number | null)[]): (number | null)[] {
  return semana.map((m, i) => m ?? normal[i] ?? null);
}

/** El mes con la meta más alta, o null si ninguno tiene. */
export function mesMasAlto<T extends { total: number | null }>(meses: readonly T[]): T | null {
  return meses.reduce<T | null>((mejor, m) => (m.total !== null && m.total > (mejor?.total ?? 0) ? m : mejor), null);
}

/** Por dónde empezar en una tienda sin metas: la semana «Normal», de la que salen todos los meses. Con al menos un día escrito, `null` (prueba ciega, 2026-11-05). */
export function primerPasoMetas(normal: readonly (number | null)[]): string | null {
  return heredaLoNormal(normal) ? "Empieza por «Normal»: escribe cuánto vender cada día de la semana. Vale para todos los meses." : null;
}
