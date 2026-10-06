// Comportamiento comercial de Inventario (definición canónica de Felipe, 2026-09-24 — reemplaza la primera
// versión de este archivo, que reiniciaba el reloj de exposición). Vive con prefijo `inventario-` a propósito,
// no `resumen-`: es un concepto del DOMINIO de Inventario —cómo se reconstruye la exposición comercial de una
// variante—, reutilizable por cualquier pantalla de Inventario (hoy lo usan Frescura y el ritmo de Existencias).
// Puro: sin `@/lib/supabase`, sin JSX. El sell-through de exposición y la rotación en unidades que también
// vivían acá eran del Análisis de antes de la v4 y se borraron con él (2026-10-06).
//
// EL RELOJ DE EXPOSICIÓN (sección 5 del pedido) CORRE en piso, SE PAUSA en almacén, y CONTINÚA —nunca se
// reinicia— cuando la cantidad vuelve al piso. 5 días en piso + 3 en almacén + 4 en piso = 9 días
// acumulados, no 4. Esto es TRAZABILIDAD POR CANTIDAD, no por unidad física: `mover_interno` (el único
// camino piso↔almacén) no deja lote_id ni ningún identificador de línea — reconstruir qué unidad exacta
// volvió es imposible con los datos reales de CAYLA (verificado: sección 6 del pedido, auditoría de dominio
// 2026-09-24). La política de abajo es una aproximación DETERMINISTA y documentada, nunca fingida como
// exacta: FIFO por cantidad, nunca por identidad física.
//
// LA SEÑAL: `esMovimientoInterno` (viaja en `EventoPiso`). La calcula `retail.fn_es_traslado_interno` dentro de
// `fn_ledger_puntos` (ADR-0203): un traslado con la MISMA sede de origen y destino, por su estructura y no por su
// motivo (antes se comparaba `motivo = 'movimiento_interno'`, que solo `mover_interno()` garantiza por costumbre).
// Una entrada con esa marca REANUDA la cohorte pausada más vieja; si no hay ninguna pausada que la explique (lo
// normal: una bajada de mercadería que nunca estuvo colgada), el sobrante abre una cohorte nueva. Una entrada sin
// la marca es stock genuinamente nuevo (traslado recibido de otra sede, devolución: reloj en cero). Una salida con
// la marca pausa (no vende, no destruye historia); una salida sin ella y sin venta es pérdida permanente (ajuste,
// merma, traslado a otra sede: nunca vuelve, se resta de `cantidadInicial` igual que antes — caso Q del pedido).
//
// EDAD DESCONOCIDA (ADR-0248): el reloj de una cohorte mide desde que el SISTEMA la vio llegar al piso. Para el saldo
// con que arranca la ventana, la carga inicial o un ajuste al piso, ese momento no es cuando se colgó. La marca
// `edadDesconocida` viaja con la unidad (se hereda al partir, pausar y reanudar) y no cambia el FIFO: solo avisa a
// quien lea la edad (Frescura) que ese reloj no es la edad de la prenda.

/** Un evento que afecta el piso: `delta` positivo = entró, negativo = salió. `esVenta` distingue una venta
 *  real (o un cambio) de cualquier otra salida; `esMovimientoInterno` distingue un traslado piso↔almacén
 *  de la propia sede (pausable/reanudable) de cualquier otro movimiento (entrada nueva o pérdida permanente). */
export type EventoPiso = {
  ts: string;
  delta: number;
  esVenta: boolean;
  esMovimientoInterno: boolean;
  /** Id del movimiento (el `oid` de `fn_ledger_puntos`). El FIFO no lo lee: sirve para sacar una bajada tardía por su
   *  movimiento antes de armar las cohortes, sin adivinar por la hora (ADR-0248). */
  oid?: string;
  /** Lo que entra con este evento no tiene fecha real de colgado (ADR-0248). Solo cuenta en una entrada: la cohorte
   *  que abre queda marcada, y sus pedazos y sus salidas también. */
  edadDesconocida?: boolean;
};

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
  /** Su reloj no es su edad: entró sin fecha real de colgado (ver `EventoPiso.edadDesconocida`). Pasa a sus pedazos. */
  edadDesconocida: boolean;
};

/** Unidades que dejaron el piso sin volver al almacén de la sede, con lo que llevaban expuestas en ese momento. Una
 *  por evento y por cohorte de la que salieron: una venta de 3 que vacía una cohorte de 2 y toma 1 de la siguiente
 *  da dos salidas, cada una con su propia exposición. */
export type SalidaDeCohorte = {
  tipo: "venta" | "perdida";
  cantidad: number;
  /** Segundos colgada al salir, sin contar el tiempo en el almacén (el mismo reloj de las cohortes). */
  segundosExpuesta: number;
  edadDesconocida: boolean;
  /** Cuándo salió (la hora del evento). */
  ts: string;
};

export type HistoriaDeCohortes = { cohortes: Cohorte[]; salidas: SalidaDeCohorte[] };

const MS_POR_SEGUNDO = 1000;

/** Orden de dos instantes por el RELOJ, no por el texto (ADR-0248). Postgres escribe «10:00:00+00:00» cuando la hora cae
 *  justo en el segundo y «10:00:00.5+00:00» cuando no; `localeCompare` pone el «+» después del «.» y los invertía. Un
 *  texto que no es fecha se ordena como texto, para no romper el orden de los demás. Empate (mismo milisegundo): 0, y
 *  el orden estable de `sort` respeta el que trajo el libro. */
export function compararInstantes(a: string, b: string): number {
  const d = Date.parse(a) - Date.parse(b);
  return Number.isNaN(d) ? a.localeCompare(b) : d;
}

/** Congela el tramo abierto de una cohorte al instante `ts`: suma lo transcurrido a `segundosAcumulados`
 *  y la deja pausada. No hace nada si ya estaba pausada (evita sumar dos veces). */
function congelar(c: Cohorte, ts: string): void {
  if (c.abiertaDesde === null) return;
  c.segundosAcumulados += Math.max(0, new Date(ts).getTime() - new Date(c.abiertaDesde).getTime()) / MS_POR_SEGUNDO;
  c.abiertaDesde = null;
}

/** Pone el pedazo de la cohorte `i` justo después de ella: comparte su `ts`, así que el arreglo sigue ordenado
 *  por antigüedad. Al final quedaría detrás de cohortes más nuevas y el FIFO lo tomaría tarde (ADR-0248). */
function partir(cohortes: Cohorte[], i: number, pedazo: Cohorte): void {
  cohortes.splice(i + 1, 0, pedazo);
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
 *
 * FIFO POR ANTIGÜEDAD (ADR-0248): «la más vieja» es la de `ts` más antiguo, no la que quedó primero en el
 * arreglo. El arreglo se mantiene ORDENADO por `ts` para que recorrerlo en orden sea recorrerlo por
 * antigüedad: cada cohorte nueva nace con el `ts` del evento, que nunca es anterior a ninguna de las que ya
 * existen (los eventos se procesan en orden), y el pedazo de una cohorte partida se inserta JUNTO a su
 * madre (mismo `ts`), nunca al final. Hasta el 2026-09-27 el pedazo iba al final: una cohorte del día 1
 * que volvía en parte del almacén quedaba detrás de una del día 5, y la venta se llevaba la del día 5.
 *
 * LAS SALIDAS (ADR-0248): cada venta o pérdida permanente queda anotada con lo que la cohorte llevaba expuesta en
 * ese momento y con su marca de edad desconocida — es lo que necesita una curva de «cuánto tarda en venderse»
 * (Frescura). Una salida al almacén no se anota: es una pausa. Lo que sale sin ninguna cohorte que lo explique (el
 * libro no cuadra) tampoco: no hay edad que medirle. Es la ÚNICA implementación del FIFO del piso: nadie arma
 * cohortes por su cuenta (ADR-0208 (d)).
 */
export function historiaDeCohortes(eventos: readonly EventoPiso[]): HistoriaDeCohortes {
  const ordenados = [...eventos].sort((a, b) => compararInstantes(a.ts, b.ts));
  const cohortes: Cohorte[] = [];
  const salidas: SalidaDeCohorte[] = [];

  for (const e of ordenados) {
    if (e.delta > 0) {
      const edadDesconocida = e.edadDesconocida === true;
      if (e.esMovimientoInterno) {
        let porReanudar = e.delta;
        for (let i = 0; i < cohortes.length && porReanudar > 0; i++) {
          const c = cohortes[i];
          if (c.cantidadRestante <= 0 || c.abiertaDesde !== null) continue; // ya activa, o agotada
          const cantidad = Math.min(c.cantidadRestante, porReanudar);
          if (cantidad < c.cantidadRestante) {
            partir(cohortes, i, { ts: c.ts, cantidadInicial: cantidad, cantidadRestante: cantidad, segundosAcumulados: c.segundosAcumulados, abiertaDesde: e.ts, edadDesconocida: c.edadDesconocida });
            c.cantidadInicial -= cantidad;
            c.cantidadRestante -= cantidad;
          } else {
            c.abiertaDesde = e.ts;
          }
          porReanudar -= cantidad;
        }
        if (porReanudar > 0) cohortes.push({ ts: e.ts, cantidadInicial: porReanudar, cantidadRestante: porReanudar, segundosAcumulados: 0, abiertaDesde: e.ts, edadDesconocida });
      } else {
        cohortes.push({ ts: e.ts, cantidadInicial: e.delta, cantidadRestante: e.delta, segundosAcumulados: 0, abiertaDesde: e.ts, edadDesconocida });
      }
      continue;
    }

    let porQuitar = -e.delta;
    const instante = new Date(e.ts);
    for (let i = 0; i < cohortes.length && porQuitar > 0; i++) {
      const c = cohortes[i];
      if (c.cantidadRestante <= 0 || c.abiertaDesde === null) continue; // pausada: no se puede vender ni volver a pausar
      const quitado = Math.min(c.cantidadRestante, porQuitar);
      if (e.esVenta) {
        salidas.push({ tipo: "venta", cantidad: quitado, segundosExpuesta: segundosDeExposicion(c, instante), edadDesconocida: c.edadDesconocida, ts: e.ts });
        c.cantidadRestante -= quitado;
      } else if (e.esMovimientoInterno) {
        congelar(c, e.ts);
        if (quitado < c.cantidadRestante) {
          const restanteActivo = c.cantidadRestante - quitado;
          const inicialActivo = (c.cantidadInicial * restanteActivo) / c.cantidadRestante;
          partir(cohortes, i, { ts: c.ts, cantidadInicial: c.cantidadInicial - inicialActivo, cantidadRestante: quitado, segundosAcumulados: c.segundosAcumulados, abiertaDesde: null, edadDesconocida: c.edadDesconocida });
          c.cantidadInicial = inicialActivo;
          c.cantidadRestante = restanteActivo;
          c.abiertaDesde = e.ts;
        }
        // si `quitado === cantidadRestante`, toda la cohorte pausa: ya quedó congelada arriba, nada más que hacer.
      } else {
        salidas.push({ tipo: "perdida", cantidad: quitado, segundosExpuesta: segundosDeExposicion(c, instante), edadDesconocida: c.edadDesconocida, ts: e.ts });
        c.cantidadRestante -= quitado;
        c.cantidadInicial -= quitado;
      }
      porQuitar -= quitado;
    }
  }
  return { cohortes, salidas };
}

/** Segundos de exposición de una cohorte a `comoDe`: lo ya cerrado, más lo que lleva corriendo el tramo
 *  abierto actual (0 si está pausada). */
function segundosDeExposicion(c: Cohorte, comoDe: Date): number {
  const abierto = c.abiertaDesde !== null ? Math.max(0, comoDe.getTime() - new Date(c.abiertaDesde).getTime()) / MS_POR_SEGUNDO : 0;
  return c.segundosAcumulados + abierto;
}
