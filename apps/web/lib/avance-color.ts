// El color de lo que se lleva (Felipe 2026-11-02, maqueta `docs/maquetas/recibir-boceto-2026-11/`): una barra de avance va de rojo (recién empieza) a ámbar (a
// la mitad) y a verde (llena), de a poco, mientras se llena. `--color-avance-medio` existe porque el ámbar del sistema es un marrón oscuro hecho para que un
// texto se lea: en una barra no se distingue del verde.

/** El avance como se lee: con 148 de 114,447, «0%» parecía que no se había guardado nada (prueba ciega, 2026-11-02); y «100%» con algo por contar dice que ya se terminó. */
export function textoDeAvance(pct: number): string {
  const p = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  if (p > 0 && p < 1) return "menos de 1%";
  if (p > 99 && p < 100) return "99%";
  return `${Math.round(p)}%`;
}

/** El color para `<BarraAvance color>` o para el Trayecto, de 0 a 100. Lo que viene mal (un número raro, pasado de 100) se queda en la punta que le toca. */
export function colorDeAvance(pct: number): string {
  const p = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  if (p >= 100) return "var(--color-verde)";
  return p <= 50
    ? `color-mix(in oklab, var(--color-avance-medio) ${Math.round(p * 2)}%, var(--color-rojo))`
    : `color-mix(in oklab, var(--color-verde) ${Math.round((p - 50) * 2)}%, var(--color-avance-medio))`;
}
