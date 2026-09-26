import { hoyEnLima } from "./resumen-periodo";
import { leerEventosPiso, type EventoPiso } from "./inventario-exposicion";

// Ritmo reciente de Existencias (2026-09-25, pedido de Felipe) — sobre el ledger único.
// Puro: sin `@/lib/supabase`, sin JSX. Entrada: `piso_eventos` de `retail.fn_ritmo_reciente_json`
// (MISMA forma que `piso_eventos` de Análisis — `leerEventosPiso`, reutilizada tal cual).
//
// «Ritmo reciente» NO es ventas ÷ 7 días calendario: es ventas comerciales ÷ JORNADAS DE
// EXPOSICIÓN — una jornada normal de tienda en la que la variante permaneció disponible en piso
// como parte de la operación normal. NO horas equivalentes: `diasExposicionComercial` no
// convierte «2 horas + 24 horas + 24 horas» en «2.08 jornadas», cuenta jornadas completas.
//
// QUÉ ES EXACTAMENTE Y QUÉ NO (precisado 2026-09-25, segunda ronda del pedido): es una
// APROXIMACIÓN OPERATIVA por fecha calendario de Lima, basada en la permanencia normal en piso
// — NO una medición horaria exacta de cuánto tiempo estuvo expuesta la prenda. Auditado cómo se
// registra un movimiento piso↔almacén (`retail.mover_interno`, migración
// `20260914230000_inventario_piso_almacen.sql:682`, comentario propio en
// `20260916150000_traslados_dos_fases.sql:27`: «sigue instantáneo a propósito»): cada movimiento
// es un timestamp preciso de una acción manual y deliberada de una colaboradora — no hay lote,
// no hay redondeo, y nada en el dominio sugiere que se use para exposiciones de segundos o
// minutos. Por eso «tuvo piso > 0 en algún instante de la jornada» es un proxy razonable de
// «estuvo disponible en piso esa jornada como parte de la operación normal» — pero sigue siendo
// un proxy: dos movimientos deliberados y rapidísimos (bajar y corregir el error al toque) EN
// TEORÍA marcarían esa jornada como expuesta, aunque en la práctica nunca ocurre así. No se
// construyó nada para detectar ese caso — sería complejidad nueva para un escenario que la
// propia operación no produce (pedido de Felipe: «no construyas complejidad adicional»). Textos,
// tipos y tests dicen «jornada de exposición» y evitan prometer una precisión horaria que este
// dominio no tiene ni necesita.
//
// Auditado también (2026-09-25): este repo no tiene un concepto propio de horario comercial/
// calendario de tienda por sede (`Ubicacion.horaCierre` es solo la hora de cierre para proyectar
// la venta del día en Caja, sin hora de apertura ni feriados) — «jornada» es, y sigue siendo, el
// día calendario simple de Lima que ya usa todo el repo (`hoyEnLima`), nunca un horario nuevo
// construido para esto.
//
// Un día entero en almacén no es una jornada de observación: no castiga ni cuenta. Con menos de
// `minDiasExposicion` jornadas no se afirma un ritmo — se muestran los hechos crudos (jornada por
// jornada) para que la persona los lea sin que CAYLA invente una tasa prematura. El mínimo de
// jornadas y el umbral de reposición son política operativa — `politica-operativa-inventario.ts`,
// nunca un número local a este archivo.

/** Ventana operativa de «Ritmo reciente»: últimos N días calendario (no de exposición). */
export const VENTANA_RITMO_RECIENTE_DIAS = 7;

export type DiaExposicion = {
  /** «aaaa-mm-dd», calendario de Lima — la jornada. */
  fecha: string;
  /** Unidades vendidas comercialmente ESA jornada (ventas reales o cambios — nunca movimiento
   *  interno, nunca liquidación dañada: mismo criterio `esVenta` que ya viaja en el evento). */
  ventas: number;
};

/**
 * Las jornadas de exposición de una variante en `[desde, hasta)`: cada «aaaa-mm-dd» de Lima en
 * que el nivel de piso fue > 0 en algún instante de esa jornada, con las ventas comerciales de
 * esa jornada — jornada completa, no fracción de horas (ver cabecera del archivo). Es una
 * APROXIMACIÓN OPERATIVA por fecha calendario, no una medición horaria exacta de cuánto tiempo
 * estuvo expuesta la prenda — ver cabecera del archivo para el porqué es razonable (movimientos
 * piso↔almacén instantáneos y deliberados, nunca por lotes ni en segundos). Una jornada sin
 * ningún instante con piso > 0 (estuvo en almacén, o nunca llegó) no aparece — ni como jornada ni
 * como cero: no es evidencia, es ausencia de evidencia (caso E/N).
 *
 * Orden ascendente por fecha: el índice + 1 en el arreglo devuelto ES la «jornada comercial N».
 */
export function diasExposicionComercial(eventos: readonly EventoPiso[], desde: Date, hasta: Date): DiaExposicion[] {
  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  if (hastaMs <= desdeMs) return [];

  // Puntos ordenados (instante, nivel VIGENTE desde ese instante). El nivel antes del primer
  // punto es 0 salvo que `fn_ledger_puntos` ya haya incluido el saldo de partida como evento
  // (mismo criterio que `piso_eventos` de Análisis: el saldo de partida SOLO viaja si no era 0).
  const ordenados = [...eventos].filter((e) => {
    const t = new Date(e.ts).getTime();
    return Number.isFinite(t);
  }).sort((a, b) => a.ts.localeCompare(b.ts));

  let nivel = 0;
  const puntos: { ts: number; nivel: number }[] = [];
  for (const e of ordenados) {
    nivel += e.delta;
    puntos.push({ ts: new Date(e.ts).getTime(), nivel });
  }

  // Intervalos [inicio, fin) con el nivel vigente, recortados a [desdeMs, hastaMs).
  const limites = [desdeMs, ...puntos.map((p) => p.ts), hastaMs];
  const nivelPorTramo = [0, ...puntos.map((p) => p.nivel)]; // nivelPorTramo[i] rige [limites[i], limites[i+1])

  const diasConPiso = new Set<string>();
  for (let i = 0; i < limites.length - 1; i++) {
    const inicio = Math.max(limites[i], desdeMs);
    const fin = Math.min(limites[i + 1], hastaMs);
    if (fin <= inicio || nivelPorTramo[i] <= 0) continue;
    for (const fecha of diasLimaEntre(inicio, fin)) diasConPiso.add(fecha);
  }

  const ventasPorDia = new Map<string, number>();
  for (const e of eventos) {
    if (!e.esVenta || e.delta >= 0) continue; // una venta siempre resta del piso
    const fecha = hoyEnLima(new Date(e.ts));
    ventasPorDia.set(fecha, (ventasPorDia.get(fecha) ?? 0) + Math.abs(e.delta));
  }

  return [...diasConPiso].sort().map((fecha) => ({ fecha, ventas: ventasPorDia.get(fecha) ?? 0 }));
}

const MS_POR_HORA = 3_600_000;
/** Perú no tiene horario de verano: UTC−5 fijo, mismo supuesto que ya usa todo el repo (`at time
 *  zone 'America/Lima'` en SQL, sin manejo de DST en ningún lado). */
const OFFSET_LIMA_HORAS = -5;

/** Cada «aaaa-mm-dd» de Lima que el intervalo `[inicioMs, finMs)` (instantes UTC) toca. */
function diasLimaEntre(inicioMs: number, finMs: number): string[] {
  const dias: string[] = [];
  let cursor = inicioMs;
  while (cursor < finMs) {
    const fecha = hoyEnLima(new Date(cursor));
    dias.push(fecha);
    cursor = medianocheLimaSiguiente(cursor);
  }
  return dias;
}

/** El instante UTC de la próxima medianoche de Lima estrictamente después de `ms`. */
function medianocheLimaSiguiente(ms: number): number {
  const fecha = hoyEnLima(new Date(ms));
  const [a, m, d] = fecha.split("-").map(Number);
  // Medianoche de Lima de ESTE día calendario, en UTC: 00:00 Lima = 05:00 UTC (Lima es UTC−5).
  const medianocheHoyUtc = Date.UTC(a, m - 1, d) - OFFSET_LIMA_HORAS * MS_POR_HORA;
  return medianocheHoyUtc > ms ? medianocheHoyUtc : medianocheHoyUtc + 24 * MS_POR_HORA;
}

export type RitmoReciente =
  | { tipo: "insuficiente"; dias: DiaExposicion[] }
  | { tipo: "sin_salida"; dias: DiaExposicion[]; unidadesDia: 0 }
  | { tipo: "medida"; dias: DiaExposicion[]; unidadesDia: number };

/** «Ritmo reciente»: con menos de `minDiasExposicion` jornadas de exposición (política operativa,
 *  `politica-operativa-inventario.ts`), «insuficiente» (se muestran los hechos jornada a jornada,
 *  nunca una tasa). Desde ahí, `unidadesDia` = ventas totales ÷ jornadas de exposición — incluido
 *  el caso de cero ventas (`"sin_salida"`, decisión de Felipe, 2026-09-25): matemáticamente
 *  0.0/día, pero la UI nunca lo pinta como una tasa medida, porque con solo unas jornadas de
 *  evidencia «0.0/día» se lee como «nunca vende» y todavía no lo sabemos. */
export function calcularRitmoReciente(dias: DiaExposicion[], minDiasExposicion: number): RitmoReciente {
  if (dias.length < minDiasExposicion) return { tipo: "insuficiente", dias };
  const totalVentas = dias.reduce((acc, d) => acc + d.ventas, 0);
  if (totalVentas === 0) return { tipo: "sin_salida", dias, unidadesDia: 0 };
  return { tipo: "medida", dias, unidadesDia: totalVentas / dias.length };
}

export type CoberturaPiso =
  | { tipo: "agotado"; dias: 0 }
  | { tipo: "no_estimable"; razon: "insuficiente" | "sin_salida" }
  | { tipo: "medida"; dias: number };

/** «¿Cuánto dura el piso de hoy al ritmo reciente?» Solo se calcula cuando el ritmo es una tasa
 *  MEDIDA de verdad (jornadas de exposición suficientes, ventas > 0) — nunca con una muestra
 *  insuficiente, y nunca infinito cuando no hubo venta reciente: eso es «no estimable por
 *  ausencia de salida reciente» (`razon: "sin_salida"`), no una cobertura enorme fabricada por
 *  dividir entre cero (decisión de Felipe, 2026-09-25). Piso en 0 es «agotado» — 0 días — sea
 *  cual sea el ritmo: no hay nada que cubrir. */
export function calcularCoberturaPiso(stockPiso: number, ritmo: RitmoReciente): CoberturaPiso {
  if (stockPiso <= 0) return { tipo: "agotado", dias: 0 };
  if (ritmo.tipo === "insuficiente") return { tipo: "no_estimable", razon: "insuficiente" };
  if (ritmo.tipo === "sin_salida" || ritmo.unidadesDia <= 0) return { tipo: "no_estimable", razon: "sin_salida" };
  return { tipo: "medida", dias: stockPiso / ritmo.unidadesDia };
}

/** Reexportado para que quien solo tenga el jsonb crudo (`fn_ritmo_reciente_json`) no tenga que
 *  saber que la forma es la misma que `piso_eventos` de Análisis. */
export { leerEventosPiso };
export type { EventoPiso };
