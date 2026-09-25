import { RITMO_MUESTRA_LIMITADA_FRACCION, SELL_THROUGH_EXPOSURE_WINDOW_DAYS, SOBRESTOCK_ROTACION_TOTAL_VS_PISO } from "./inventario-reglas";

// Comportamiento comercial de Inventario (definición canónica de Felipe, 2026-09-24 — reemplaza la primera
// versión de este archivo, que reiniciaba el reloj de exposición y calculaba rotación en soles). Vive con
// prefijo `inventario-` a propósito, no `resumen-`: son conceptos del DOMINIO de Inventario —cómo se
// reconstruye la exposición comercial de una variante, cómo se mide su rotación en unidades— reutilizables
// por cualquier pantalla de Inventario, no solo por Análisis. Puro: sin `@/lib/supabase`, sin JSX.
//
// EL RELOJ DE EXPOSICIÓN (sección 5 del pedido) CORRE en piso, SE PAUSA en almacén, y CONTINÚA —nunca se
// reinicia— cuando la cantidad vuelve al piso. 5 días en piso + 3 en almacén + 4 en piso = 9 días
// acumulados, no 4. Esto es TRAZABILIDAD POR CANTIDAD, no por unidad física: `mover_interno` (el único
// camino piso↔almacén) no deja lote_id ni ningún identificador de línea — reconstruir qué unidad exacta
// volvió es imposible con los datos reales de CAYLA (verificado: sección 6 del pedido, auditoría de dominio
// 2026-09-24). La política de abajo es una aproximación DETERMINISTA y documentada, nunca fingida como
// exacta: FIFO por cantidad, nunca por identidad física.
//
// LA SEÑAL: `esMovimientoInterno` (viaja en `EventoPiso`, calculada en SQL desde `motivo = 'movimiento_interno'`
// — el único camino real piso↔almacén, `mover_interno()`). Una entrada con esa marca es un REGRESO desde
// almacén (reanuda una cohorte pausada, nunca abre una nueva); una entrada sin ella es stock genuinamente
// nuevo (compra, producción, traslado recibido de otra sede, carga inicial: nunca estuvo expuesto antes,
// así que SÍ le corresponde un reloj en cero). Una salida con la marca pausa (no vende, no destruye
// historia); una salida sin ella y sin venta es pérdida permanente (ajuste, merma, traslado a otra sede:
// nunca vuelve, se resta de `cantidadInicial` igual que antes — caso Q del pedido).

/** Un evento que afecta el piso: `delta` positivo = entró, negativo = salió. `esVenta` distingue una venta
 *  real (o un cambio) de cualquier otra salida; `esMovimientoInterno` distingue un traslado piso↔almacén
 *  de la propia sede (pausable/reanudable) de cualquier otro movimiento (entrada nueva o pérdida permanente). */
export type EventoPiso = { ts: string; delta: number; esVenta: boolean; esMovimientoInterno: boolean };

/** `piso_eventos` llega como jsonb ya parseado por PostgREST — pero es dato externo: se valida fila por
 *  fila en vez de confiar en el tipo. Un evento con forma rara se descarta en silencio (mejor un FIFO
 *  con menos evidencia que uno roto por un dato inesperado). */
export function leerEventosPiso(v: unknown): EventoPiso[] {
  if (!Array.isArray(v)) return [];
  const eventos: EventoPiso[] = [];
  for (const item of v) {
    if (item && typeof item === "object" && "ts" in item && "delta" in item) {
      const ts = String((item as { ts: unknown }).ts);
      const delta = Number((item as { delta: unknown }).delta);
      const esVenta = (item as { esVenta?: unknown }).esVenta === true;
      const esMovimientoInterno = (item as { esMovimientoInterno?: unknown }).esMovimientoInterno === true;
      if (ts && Number.isFinite(delta) && delta !== 0) eventos.push({ ts, delta, esVenta, esMovimientoInterno });
    }
  }
  return eventos;
}

export type Cohorte = {
  /** Cuándo se abrió esta cohorte (entrada real, la primera vez que esta cantidad existió en piso). */
  ts: string;
  /** Lo que realmente llegó a existir en esta cohorte — descontado lo que salió sin venderse y sin volver. */
  cantidadInicial: number;
  /** Lo que le queda sin vender (esté expuesta en piso ahora mismo, o pausada en almacén). */
  cantidadRestante: number;
  /** Segundos de exposición YA acumulados de tramos de piso CERRADOS (no cuenta el tramo abierto actual). */
  segundosAcumulados: number;
  /** Cuándo empezó el tramo de piso ABIERTO actual; `null` = la cohorte está pausada en almacén ahora mismo. */
  abiertaDesde: string | null;
};

const MS_POR_SEGUNDO = 1000;

/** Congela el tramo abierto de una cohorte al instante `ts`: suma lo transcurrido a `segundosAcumulados`
 *  y la deja pausada. No hace nada si ya estaba pausada (evita sumar dos veces). */
function congelar(c: Cohorte, ts: string): void {
  if (c.abiertaDesde === null) return;
  c.segundosAcumulados += Math.max(0, new Date(ts).getTime() - new Date(c.abiertaDesde).getTime()) / MS_POR_SEGUNDO;
  c.abiertaDesde = null;
}

/**
 * FIFO por cantidad, con el reloj de exposición pausa/reanuda (nunca reinicia) a través de un ciclo
 * piso→almacén→piso. Cuatro movimientos posibles, según `delta` y las dos señales del evento:
 *
 *   entrada, NO es regreso   → cohorte NUEVA (stock genuinamente nuevo: nunca estuvo expuesto, reloj en 0)
 *   entrada, SÍ es regreso   → REANUDA la(s) cohorte(s) pausada(s) más vieja(s) (FIFO), nunca abre una nueva
 *                              salvo que no haya suficiente cantidad pausada que emparejar (el ledger no
 *                              cuadra, o es la primera vez que se ve esta cantidad): el sobrante se trata
 *                              como nuevo — mejor eso que fingir un regreso que los datos no sostienen.
 *   salida, es venta         → consume de las cohortes ACTIVAS (nunca de las pausadas: no se vende lo que
 *                              está en almacén), solo `cantidadRestante` — la historia de exposición no se
 *                              toca, es lo que se compara contra `cantidadInicial` para saber qué se vendió.
 *   salida, es regreso a alm.→ PAUSA la porción que sale (congela su reloj, no se pierde su historia); si
 *                              es una salida parcial de la cohorte, esta se divide (ver abajo).
 *   salida, pérdida permanente→ nunca vuelve: resta de `cantidadInicial` Y `cantidadRestante` (caso Q).
 *
 * DIVISIÓN DE COHORTES: una cohorte puede tener SOLO PARTE de su cantidad pausada/reanudada — sin
 * identidad física por unidad, la porción que cambia de estado se separa en una cohorte nueva que hereda
 * la misma historia (`ts`, `segundosAcumulados`); si la cohorte ya tenía ventas parciales antes de
 * pausarse, `cantidadInicial` se reparte PROPORCIONALMENTE entre las dos mitades (una aproximación
 * documentada, no una identidad física: no hay forma de saber cuáles unidades exactas se vendieron antes
 * de cuáles se pausaron). Una cohorte PAUSADA nunca tiene ventas parciales previas a su propia pausa entre
 * `cantidadInicial`/`cantidadRestante` de esa pausa — solo se puede vender desde el piso — así que reanudar
 * una porción de una cohorte pausada NUNCA necesita la proporción, solo restar cantidades enteras.
 */
export function armarCohortes(eventos: readonly EventoPiso[]): Cohorte[] {
  const ordenados = [...eventos].sort((a, b) => a.ts.localeCompare(b.ts));
  const cohortes: Cohorte[] = [];

  for (const e of ordenados) {
    if (e.delta > 0) {
      if (e.esMovimientoInterno) {
        let porReanudar = e.delta;
        for (const c of cohortes) {
          if (porReanudar <= 0) break;
          if (c.cantidadRestante <= 0 || c.abiertaDesde !== null) continue; // ya activa, o agotada
          const cantidad = Math.min(c.cantidadRestante, porReanudar);
          if (cantidad < c.cantidadRestante) {
            cohortes.push({ ts: c.ts, cantidadInicial: cantidad, cantidadRestante: cantidad, segundosAcumulados: c.segundosAcumulados, abiertaDesde: e.ts });
            c.cantidadInicial -= cantidad;
            c.cantidadRestante -= cantidad;
          } else {
            c.abiertaDesde = e.ts;
          }
          porReanudar -= cantidad;
        }
        if (porReanudar > 0) cohortes.push({ ts: e.ts, cantidadInicial: porReanudar, cantidadRestante: porReanudar, segundosAcumulados: 0, abiertaDesde: e.ts });
      } else {
        cohortes.push({ ts: e.ts, cantidadInicial: e.delta, cantidadRestante: e.delta, segundosAcumulados: 0, abiertaDesde: e.ts });
      }
      continue;
    }

    let porQuitar = -e.delta;
    for (const c of cohortes) {
      if (porQuitar <= 0) break;
      if (c.cantidadRestante <= 0 || c.abiertaDesde === null) continue; // pausada: no se puede vender ni volver a pausar
      const quitado = Math.min(c.cantidadRestante, porQuitar);
      if (e.esVenta) {
        c.cantidadRestante -= quitado;
      } else if (e.esMovimientoInterno) {
        congelar(c, e.ts);
        if (quitado < c.cantidadRestante) {
          const restanteActivo = c.cantidadRestante - quitado;
          const inicialActivo = (c.cantidadInicial * restanteActivo) / c.cantidadRestante;
          cohortes.push({ ts: c.ts, cantidadInicial: c.cantidadInicial - inicialActivo, cantidadRestante: quitado, segundosAcumulados: c.segundosAcumulados, abiertaDesde: null });
          c.cantidadInicial = inicialActivo;
          c.cantidadRestante = restanteActivo;
          c.abiertaDesde = e.ts;
        }
        // si `quitado === cantidadRestante`, toda la cohorte pausa: ya quedó congelada arriba, nada más que hacer.
      } else {
        c.cantidadRestante -= quitado;
        c.cantidadInicial -= quitado;
      }
      porQuitar -= quitado;
    }
  }
  return cohortes;
}

/** Segundos de exposición de una cohorte a `comoDe`: lo ya cerrado, más lo que lleva corriendo el tramo
 *  abierto actual (0 si está pausada). */
function segundosDeExposicion(c: Cohorte, comoDe: Date): number {
  const abierto = c.abiertaDesde !== null ? Math.max(0, comoDe.getTime() - new Date(c.abiertaDesde).getTime()) / MS_POR_SEGUNDO : 0;
  return c.segundosAcumulados + abierto;
}

/** Una cohorte ya se puede juzgar: acumuló la ventana de madurez (con pausas incluidas), o se vendió
 *  entera antes — la venta total es prueba definitiva, no hace falta esperar el resto de la ventana. */
function esMadura(c: Cohorte, comoDe: Date, ventanaDias: number): boolean {
  if (c.cantidadRestante <= 0) return true;
  return segundosDeExposicion(c, comoDe) / 86_400 >= ventanaDias;
}

export type SellThroughExposicion = {
  /** % (0–100), redondeado a un decimal; null = ninguna cohorte madura todavía (sin base). */
  pct: number | null;
  vendidoMaduro: number;
  disponibleMaduro: number;
  /** Unidades en cohortes que todavía no maduran y no se vendieron del todo: «N nuevas pendientes». */
  pendienteMadurez: number;
  /** `false` = ningún evento de la ventana fue un regreso desde almacén: el resultado es EXACTO (no hizo
   *  falta ninguna aproximación). `true` = hubo al menos un ciclo piso↔almacén: el resultado es una
   *  aproximación determinista y documentada (política de arriba), nunca una identidad física real —
   *  ninguna trazabilidad de CAYLA la permite (sección 6 del pedido). */
  estimado: boolean;
};

/**
 * Sell-through de exposición: `vendidoMaduro ÷ disponibleMaduro` de las cohortes maduras a `comoDe`, con
 * madurez por EXPOSICIÓN COMERCIAL ACUMULADA (pausa/reanuda, sección 11-13). Las inmaduras no entran ni al
 * numerador ni al denominador — quedan en `pendienteMadurez` para decirlo aparte («10 nuevas pendientes»),
 * nunca mezcladas en el % general.
 */
export function sellThroughExposicion(eventos: readonly EventoPiso[], comoDe: Date, ventanaDias: number = SELL_THROUGH_EXPOSURE_WINDOW_DAYS): SellThroughExposicion {
  let vendidoMaduro = 0;
  let disponibleMaduro = 0;
  let pendienteMadurez = 0;
  for (const c of armarCohortes(eventos)) {
    if (c.cantidadInicial <= 1e-9) continue; // una cohorte que perdió todo por salidas sin venta: no existió
    if (esMadura(c, comoDe, ventanaDias)) {
      disponibleMaduro += c.cantidadInicial;
      vendidoMaduro += c.cantidadInicial - c.cantidadRestante;
    } else {
      pendienteMadurez += c.cantidadRestante;
    }
  }
  return {
    pct: disponibleMaduro > 0 ? Math.round((vendidoMaduro / disponibleMaduro) * 1000) / 10 : null,
    vendidoMaduro: Math.round(vendidoMaduro * 100) / 100,
    disponibleMaduro: Math.round(disponibleMaduro * 100) / 100,
    pendienteMadurez: Math.round(pendienteMadurez * 100) / 100,
    estimado: eventos.some((e) => e.esMovimientoInterno),
  };
}

// ---------------------------------------------------------------------------
// Rotación EN UNIDADES (sección 14 del pedido): numerador y denominador SIEMPRE en unidades, nunca en
// soles. Deliberadamente separada de `rotacion.ts` (COGS ÷ inventario a costo): esa sigue siendo la
// rotación CONTABLE válida donde ya se usa (KPI de arriba, ranking, Comparar) — no se toca, no se destruye,
// pero no le presta su fórmula a «Rotación piso»/«Rotación total» de esta tabla: son métricas distintas
// que no deben compartir nombre ni implementación (rotacion.ts:16-17 ya lo anticipaba desde el 2026-09-19).
// ---------------------------------------------------------------------------

export type MotivoSinRotacionUnidades = "sin_inventario";

export type RotacionUnidades =
  | { calculable: true; veces: number; motivo: null; unidadesVendidas: number; unidadesPromedio: number }
  | { calculable: false; veces: null; motivo: MotivoSinRotacionUnidades; unidadesVendidas: number; unidadesPromedio: number | null };

/** unidadesVendidas ÷ unidadesPromedio. N/D-estricta: sin un promedio positivo no hay rotación que afirmar
 *  (nunca 0 disfrazado de N/D, nunca N/D disfrazado de 0 — `calculable` distingue los dos sin ambigüedad). */
export function rotacionUnidades(unidadesVendidas: number, unidadesPromedio: number | null): RotacionUnidades {
  if (unidadesPromedio === null || unidadesPromedio <= 0) return { calculable: false, veces: null, motivo: "sin_inventario", unidadesVendidas, unidadesPromedio };
  return { calculable: true, veces: unidadesVendidas / unidadesPromedio, motivo: null, unidadesVendidas, unidadesPromedio };
}

/** Ritmo observado con «muestra limitada»: la exposición en piso fue menos de la fracción del período
 *  que marca `RITMO_MUESTRA_LIMITADA_FRACCION` — el número sigue siendo correcto, pero la evidencia es
 *  poca (sección 10 del pedido). Sin días de período no hay fracción que calcular: no hay muestra. */
export function ritmoMuestraLimitada(diasConStock: number | null, diasPeriodo: number): boolean {
  if (diasConStock === null || diasPeriodo <= 0) return true;
  return diasConStock < diasPeriodo * RITMO_MUESTRA_LIMITADA_FRACCION;
}

/** «Responde bien en piso, pero mantiene mucho inventario total» (sección 16, caso B): la rotación total
 *  cae por debajo de una fracción de la rotación en piso. Sin las dos rotaciones calculables no hay
 *  comparación posible — nunca se afirma sobrestock sin evidencia de ambas. */
export function esSobrestockTotal(vecesPiso: number | null, vecesTotal: number | null): boolean {
  if (vecesPiso === null || vecesTotal === null || vecesPiso <= 0) return false;
  return vecesTotal < vecesPiso * SOBRESTOCK_ROTACION_TOTAL_VS_PISO;
}

/**
 * «Problema de reposición»: en algún punto de la ventana reconstruida el piso llegó a 0 y DESPUÉS volvió a
 * recibir stock — un quiebre intermedio, distinto del cierre agotado de HOY (eso ya lo cubre la regla
 * «Se agotó»). El primer evento de `pisoEventos` representa el saldo con que arrancó la ventana (ver
 * `armarCohortes`), así que la suma acumulada en orden cronológico ES el nivel de piso en cada instante —
 * no hace falta reconstruir cohortes para esto, solo el nivel.
 */
export function tuvoQuiebreEnPiso(eventos: readonly EventoPiso[]): boolean {
  const ordenados = [...eventos].sort((a, b) => a.ts.localeCompare(b.ts));
  let nivel = 0;
  let tocoCero = false;
  for (const e of ordenados) {
    nivel += e.delta;
    if (nivel <= 0) tocoCero = true;
    else if (tocoCero && e.delta > 0) return true;
  }
  return false;
}
