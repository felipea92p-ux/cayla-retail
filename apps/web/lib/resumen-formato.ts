import type { Cobertura } from "./resumen-reglas";
import { AYUDA_ROTACION, MOTIVOS_SIN_ROTACION, TEXTO_MOTIVO_ROTACION, type RotacionComparada, type UniversoRotacion } from "./rotacion";

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

/** Cobertura de un TOTAL («95», «3.2»): sin el tope de «> 60» de una prenda suelta, porque una cifra
 *  total de «> 60 d → > 60 d» con «−18 días» debajo no se entiende. */
export function formatoCoberturaTotal(dias: number): string {
  if (dias <= 0) return "0";
  return dias >= 10 ? String(Math.round(dias)) : String(Math.round(dias * 10) / 10);
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

/** «S/ 950», «S/ 18.4k», «S/ 1.25M» — la cifra grande de una tarjeta, donde S/ 18,412 no cabe. */
export function formatoSolesCompacto(monto: number): string {
  const signo = monto < 0 ? "−" : "";
  const a = Math.abs(monto);
  const limpio = (x: number, decimales: number) => (x >= 100 ? String(Math.round(x)) : String(Number(x.toFixed(decimales))));
  if (a < 1000) return `${signo}S/ ${Math.round(a)}`;
  if (a < 1_000_000) return `${signo}S/ ${limpio(a / 1000, 1)}k`;
  return `${signo}S/ ${limpio(a / 1_000_000, 2)}M`;
}

/** «0.74x», «1.20x»: cuántas veces rotó el inventario (dos decimales: 0.74 y 0.79 no son lo mismo). */
export function formatoRotacion(veces: number): string {
  return `${veces.toFixed(2)}x`;
}

/** «61%», «0%»: el sell-through ya viene redondeado a un decimal desde `calcularSellThrough`; acá se muestra entero. */
export function formatoSellThrough(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** «−4 días», «+1 día», «sin cambio»: la diferencia de cobertura entre A y B. */
export function formatoDeltaDias(dias: number): string {
  const n = Math.round(dias);
  if (n === 0) return "sin cambio";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)} ${Math.abs(n) === 1 ? "día" : "días"}`;
}

/** «+19 pp», «−4 pp», «0 pp»: puntos porcentuales con signo (sell-through A → B). */
export function formatoDeltaPp(pp: number): string {
  const n = Math.round(pp);
  return n === 0 ? "0 pp" : `${n > 0 ? "+" : "−"}${Math.abs(n)} pp`;
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

/** «3.3 d», «0 d», «> 60 d», «Sin ventas», «N/D» — cómo se escribe una cobertura en una celda
 *  (Existencias, Comparar períodos). Un dato que no se puede calcular nunca sale como NaN ni vacío. */
export function textoCobertura(c: Cobertura): string {
  if (c.tipo === "agotado") return "0 d";
  if (c.tipo === "medida") return `${formatoCoberturaDias(c.dias ?? 0)} d`;
  if (c.tipo === "sin_ventas") return "Sin ventas";
  return "N/D";
}

// ---------------------------------------------------------------------------
// Rotación: con qué universo se calculó una cifra total
// ---------------------------------------------------------------------------

/** «95 de 100 variantes comparables»: lo que dice la tarjeta de un total (Rotación, Sell-through) cuando NO
 *  cubre todas las variantes. null si no hay nada que avisar (todas entraron, o no hay variantes). */
function textoUniverso(total: number, validas: number, excluidas: number): string | null {
  if (excluidas === 0) return null;
  return `${validas} de ${pluralizar(total, "variante", "variantes")} ${total === 1 ? "comparable" : "comparables"}`;
}

export function textoUniversoRotacion(u: UniversoRotacion): string | null {
  return textoUniverso(u.totalVariantes, u.variantesValidas, u.variantesExcluidas);
}

/** Igual que `textoUniversoRotacion`, para el sell-through total del conjunto (`sellThroughComparado`). */
export function textoUniversoSellThrough(k: { totalVariantes: number; variantesComparables: number; variantesExcluidas: number }): string | null {
  return textoUniverso(k.totalVariantes, k.variantesComparables, k.variantesExcluidas);
}

/** Por qué quedaron fuera las variantes excluidas, de lo más corregible a lo menos: «Hay ventas sin costo registrado (3) · …». */
function detalleExcluidas(u: UniversoRotacion): string {
  return MOTIVOS_SIN_ROTACION.filter((m) => u.excluidasPorMotivo[m] > 0)
    .map((m) => `${TEXTO_MOTIVO_ROTACION[m]} (${u.excluidasPorMotivo[m]})`)
    .join(" · ");
}

/** El tooltip de la tarjeta de Rotación de Comparar: la fórmula y, si hay variantes fuera, con qué universo se calculó. */
export function ayudaRotacionComparada(r: RotacionComparada): string {
  const base = `Veces que rotó el inventario en el período. ${AYUDA_ROTACION}`;
  if (r.variantesExcluidas === 0) return base;
  const cruce = `${r.validasEnA} en A, ${r.validasEnB} en B`;
  const alcance =
    r.variantesValidas > 0
      ? `Se calcula solo con las ${r.variantesValidas} variantes con datos válidos en A y en B a la vez (${cruce}), las mismas en los dos períodos.`
      : `Ninguna variante tiene datos válidos en A y en B a la vez (${cruce}), así que no hay cifra.`;
  return `${base} ${alcance} Fuera del cálculo: ${detalleExcluidas(r)}.`;
}
