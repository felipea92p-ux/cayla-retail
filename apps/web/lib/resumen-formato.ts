// Cómo se escriben los números del Resumen (2026-09-19, ADR-0121). Puro. Una
// sola casa para que la tabla, las tarjetas, los gráficos y el detalle digan
// «1.7» y no «1.70» en un lado y «1.7333» en otro. Convención de Perú: punto
// decimal y coma de miles («S/ 51,870», «4.1 uds/día»).

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

/** Igual pero con la unidad, para frases: «1.7 días», «1 día», «> 60 días». */
export function formatoCoberturaConUnidad(dias: number): string {
  const texto = formatoCoberturaDias(dias);
  return `${texto} ${texto === "1" ? "día" : "días"}`;
}

export function formatoDias(dias: number): string {
  const n = Math.round(dias * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "día" : "días"}`;
}

/** «S/ 51,870» — sin céntimos: es una cifra para decidir, no para cuadrar. */
export function formatoSoles(monto: number): string {
  return `S/ ${Math.round(monto).toLocaleString("en-US")}`;
}

/** Variación porcentual con signo: «+12%», «−8%», «0%». */
export function formatoVariacion(pct: number): string {
  const n = Math.round(pct);
  if (n === 0) return "0%";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}%`;
}

export function formatoPorcentaje(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`;
}

export function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** «Tienda Trujillo» → «Trujillo»; el Taller y lo demás quedan igual. Para
 *  columnas angostas donde «Tienda» es ruido. */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/^Tienda\s+/i, "").trim() || nombre;
}
