// Contrato de calidad del dato del dominio Inventario (decisión de Felipe, 2026-09-24, sección 5 —
// "esto NO lo considero opcional"). Antes de esto, cada métrica de Comportamiento del inventario declaraba
// su propia forma de decir "no es exacto" (`calculable`/`motivo` en `rotacion.ts` y `RotacionUnidades`;
// `estimado` en `SellThroughExposicion`; `estado`/`estimada` en `Velocidad`; `null` a secas en Tendencia y
// en «Sin venta») — cuatro vocabularios distintos para la misma idea. Esto no los reemplaza (romper esos
// tipos habría significado tocar cada consumidor sin necesidad) — les da una PROYECCIÓN común: una función
// por métrica que traduce su forma propia a este contrato, para que cualquier pantalla pueda preguntar
// "¿qué tan confiable es este número, y por qué" de la MISMA manera sin importar de qué métrica viene.

/** Los tres estados posibles de cualquier valor de este dominio. Nunca se finge exactitud que no existe. */
export type EstadoCalidad = "exacto" | "estimado" | "no_disponible";

/**
 * Por qué un valor es `estimado` o `no_disponible` — una sola taxonomía para todo el dominio, no una por
 * métrica. Cada motivo tiene una causa raíz real en el modelo de datos de CAYLA, no es genérico:
 *
 *   TRAZABILIDAD_INSUFICIENTE  se necesitó una aproximación determinista por CANTIDAD (FIFO), nunca por
 *                              identidad física — `mover_interno` no lleva lote_id (inventario-exposicion.ts)
 *   EXPOSICION_INSUFICIENTE   la muestra observada es corta frente al período, o ninguna cohorte maduró
 *   SIN_INVENTARIO            el promedio de inventario no es positivo: no hay base para dividir
 *   HISTORIAL_INCOMPLETO      el ledger de movimientos no explica el stock de hoy (ledgerConsistente=false)
 *   SIN_BASE_COMPARABLE       falta una de las dos mitades/períodos que una comparación necesita
 *   SIN_COSTO_VERIFICABLE     (solo para la rotación VALORIZADA, rotacion.ts) costo/COGS no confiable
 */
export type MotivoCalidad = "TRAZABILIDAD_INSUFICIENTE" | "EXPOSICION_INSUFICIENTE" | "SIN_INVENTARIO" | "HISTORIAL_INCOMPLETO" | "SIN_BASE_COMPARABLE" | "SIN_COSTO_VERIFICABLE";

export type Calidad = { estado: "exacto" } | { estado: "estimado"; motivo: MotivoCalidad } | { estado: "no_disponible"; motivo: MotivoCalidad };

/** Une un valor con su calidad — lo que cada métrica del dominio puede declarar: valor, estado, y por qué
 *  cuando no es exacto (sección 5 del pedido: "cada métrica debe poder declarar: valor; estado de calidad;
 *  razón cuando no es exacta"). */
export type ConCalidad<T> = { valor: T | null; calidad: Calidad };

const EXACTO: Calidad = { estado: "exacto" };
const noDisponible = (motivo: MotivoCalidad): Calidad => ({ estado: "no_disponible", motivo });
const estimado = (motivo: MotivoCalidad): Calidad => ({ estado: "estimado", motivo });

/** Sell-through de exposición: `estimado` apenas hubo un ciclo piso↔almacén (aproximación por cantidad,
 *  nunca por unidad física); `no_disponible` cuando ninguna cohorte maduró todavía. */
export function calidadDeSellThroughExposicion(s: { pct: number | null; estimado: boolean }): Calidad {
  if (s.pct === null) return noDisponible("EXPOSICION_INSUFICIENTE");
  return s.estimado ? estimado("TRAZABILIDAD_INSUFICIENTE") : EXACTO;
}

/** Rotación piso/total (unidades, `inventario-exposicion.ts`): sin promedio positivo no hay base para
 *  dividir. Sin ledger consistente, la causa raíz real es OTRA (el historial no cuadra, no que falte
 *  inventario) — por eso este helper recibe `ledgerConsistente` en vez de asumirlo del `calculable`. */
export function calidadDeRotacionUnidades(r: { calculable: boolean }, ledgerConsistente: boolean): Calidad {
  if (r.calculable) return EXACTO;
  return noDisponible(ledgerConsistente ? "SIN_INVENTARIO" : "HISTORIAL_INCOMPLETO");
}

/** Rotación valorizada (soles, `rotacion.ts`): motivo propio porque su causa raíz es de costo, no de
 *  cantidad — nunca se confunde con "sin_inventario" de la rotación en unidades. */
export function calidadDeRotacionValorizada(r: { calculable: boolean; motivo: "ventas_sin_costo" | "inventario_sin_valor" | "sin_inventario" | null }): Calidad {
  if (r.calculable) return EXACTO;
  if (r.motivo === "sin_inventario") return noDisponible("SIN_INVENTARIO");
  return noDisponible("SIN_COSTO_VERIFICABLE"); // ventas_sin_costo | inventario_sin_valor
}

/** Ritmo observado (`calcularVelocidad`, `resumen-reglas.ts`): `estimado` cuando el ledger no cuadra (la
 *  velocidad cae al denominador de calendario, marcado `estimada` en el tipo `Velocidad`); `no_disponible`
 *  sin base honesta (poco o ningún historial). */
export function calidadDeVelocidad(v: { unidadesDia: number | null; estimada: boolean; estado: string }): Calidad {
  if (v.unidadesDia === null && v.estado !== "sin_ventas") return noDisponible("EXPOSICION_INSUFICIENTE");
  if (v.unidadesDia === null) return EXACTO; // "sin_ventas" es un dato real (0), no falta de dato
  return v.estimada ? estimado("HISTORIAL_INCOMPLETO") : EXACTO;
}

/** «Sin venta»: reconstruido en SQL (intervalos crudos, nunca cohortes — ya pausa/reanuda por diseño). Sin
 *  historial suficiente para reconstruir ningún intervalo, N/D. */
export function calidadDeSinVenta(dias: number | null): Calidad {
  return dias === null ? noDisponible("HISTORIAL_INCOMPLETO") : EXACTO;
}

/** Tendencia: N/D cuando cualquiera de las dos mitades no tiene base comparable — nunca "estable" por
 *  defecto (resumen-reglas.ts, `calcularTendencia`). */
export function calidadDeTendencia(t: unknown): Calidad {
  return t === null ? noDisponible("SIN_BASE_COMPARABLE") : EXACTO;
}

/** Exposición en piso del período (`AnalisisDesempeno.diasConStockPiso`): SIEMPRE la misma suma exacta
 *  de intervalos reconstruidos del ledger, nunca una técnica distinta de cálculo — por eso este
 *  contrato nunca declara `estimado` para ella (corregido 2026-09-24, sección 6 del pedido: "no
 *  inventes estimado solo para completar la taxonomía"). "Muestra limitada" (`muestraLimitada`,
 *  `ritmoMuestraLimitada` en `inventario-exposicion.ts`) es una ADVERTENCIA de confianza estadística
 *  —pocos días observados frente al período— sobre un número que sigue siendo exacto, no una
 *  aproximación de método (a diferencia del sell-through de exposición, que SÍ sustituye identidad
 *  física por cantidad): por eso vive aparte, como su propio booleano, no en este contrato. Sin ningún
 *  intervalo de piso reconstruido (historial insuficiente), no hay base. */
export function calidadDeExposicion(diasConStockPiso: number | null): Calidad {
  return diasConStockPiso === null ? noDisponible("HISTORIAL_INCOMPLETO") : EXACTO;
}
