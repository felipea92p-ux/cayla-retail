import type { CoberturaPiso, DiaExposicion, RitmoReciente } from "./existencias-ritmo";

// Cómo se escriben los números de Inventario (2026-09-19, ADR-0121; nació para
// el Resumen, el Análisis de antes de la v4). Puro. Una sola casa para que cada
// pantalla diga «1.7» y no «1.70» en un lado y «1.7333» en otro: hoy lo usan
// Existencias, Inicio y el Observatorio. Convención de Perú: punto decimal y coma
// de miles («S/ 51,870», «4.1 uds/día»).

/** «4.1», «12», «0.8»; lo que sea menos de 0.05 no es cero: «< 0.1». */
export function formatoVelocidad(unidadesDia: number): string {
  if (unidadesDia > 0 && unidadesDia < 0.05) return "< 0.1";
  if (unidadesDia >= 10) return String(Math.round(unidadesDia));
  return String(Math.round(unidadesDia * 10) / 10);
}

/** Días de cobertura, sin unidad: «0», «1.7», «12», «> 60». */
export function formatoCoberturaDias(dias: number): string {
  if (dias <= 0) return "0";
  if (dias > 60) return "> 60";
  if (dias >= 10) return String(Math.round(dias));
  return String(Math.round(dias * 10) / 10);
}

/** «S/ 51,870» — sin céntimos: es una cifra para decidir, no para cuadrar. */
export function formatoSoles(monto: number): string {
  return `S/ ${Math.round(monto).toLocaleString("en-US")}`;
}

/** «Tienda Trujillo» → «Trujillo»; el Taller y lo demás quedan igual. Para
 *  columnas angostas donde «Tienda» es ruido. */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/^Tienda\s+/i, "").trim() || nombre;
}

// ---------------------------------------------------------------------------
// Ritmo reciente / Cobertura piso de Existencias (2026-09-25, sobre el ledger único)
// ---------------------------------------------------------------------------

/** «D1: 3 · D2: 1» — los hechos crudos, día por día, mientras no hay base para una tasa
 *  (`RitmoReciente.tipo === "insuficiente"`). Tipografía secundaria pequeña, nunca un badge. */
export function textoDiasCompacto(dias: readonly DiaExposicion[]): string {
  return dias.map((d, i) => `D${i + 1}: ${d.ventas}`).join(" · ");
}

/** «2.0/día», «Sin salida reciente», o los días crudos («D1: 3 · D2: 1») antes del tercer día
 *  de exposición — nunca una tasa fabricada con menos evidencia de la que pide el dominio. */
export function textoRitmoReciente(r: RitmoReciente): string {
  if (r.tipo === "insuficiente") return textoDiasCompacto(r.dias);
  if (r.tipo === "sin_salida") return "Sin salida reciente";
  return `${formatoVelocidad(r.unidadesDia)}/día`;
}

/** La celda «Ritmo reciente» de la tabla de Existencias tal como la dibuja el diseño aprobado (2026-09-28): «1 ud/día»,
 *  «2 uds/día», «Sin salida reciente» y, con menos jornadas de las que pide la política, «Sin datos suficientes». Solo cambia
 *  cómo se escribe: los hechos por jornada («D1: 3 · D2: 1») siguen en el detalle que abre la celda y `textoRitmoReciente`
 *  (el CSV y el cálculo del detalle) no se toca. */
export function textoRitmoRecienteCelda(r: RitmoReciente): string {
  if (r.tipo === "insuficiente") return "Sin datos suficientes";
  if (r.tipo === "sin_salida") return "Sin salida reciente";
  const cifra = formatoVelocidad(r.unidadesDia);
  return `${cifra} ${cifra === "1" ? "ud" : "uds"}/día`;
}

/** «5 d», «0 d» (agotado), «No estimable» (sin jornadas suficientes todavía) o «No estimable
 *  por ausencia de salida reciente» (sí hubo jornadas, pero cero ventas) — nunca infinito,
 *  nunca una cobertura fabricada sobre una tasa insuficiente o en cero (Felipe, 2026-09-25). */
export function textoCoberturaPiso(c: CoberturaPiso): string {
  if (c.tipo === "agotado") return "0 d";
  if (c.tipo === "medida") return `${formatoCoberturaDias(c.dias)} d`;
  return c.razon === "sin_salida" ? "No estimable por ausencia de salida reciente" : "No estimable";
}
