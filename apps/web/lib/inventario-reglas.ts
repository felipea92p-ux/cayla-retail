// Reglas de Inventario sin nada de servidor: las importan los componentes
// cliente y las pruebas. Las lecturas contra Postgres viven en
// `inventario-v2.ts` (mismo reparto que compras-reglas / compras).

import { compararTallas } from "./tallas";
import { BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";
import { esRespuestaIncierta, traducirError, type ErrorEscritura } from "./error-escritura";
import { calcularAccionHoy } from "./existencias-recomendaciones";
import type { PoliticaOperativaInventario } from "./politica-operativa-inventario";

/** Con cuántas unidades en el ALMACÉN de la tienda (no el total) la prenda
 *  pasa a «Stock bajo». Decisión de Felipe: 10 o menos — mira solo la
 *  reserva, no el piso. Bajó de 20 a 10 el 2026-09-17, probando la
 *  pantalla: con 20, casi todo el catálogo de arranque (lotes chicos de
 *  boutique) caía en «Stock bajo» de entrada — el umbral se quedó corto
 *  para distinguir "de verdad crítico" de "recién llegado, en cantidad
 *  normal". La pregunta que resuelve sigue siendo «¿a esta tienda todavía
 *  le queda de dónde sacar si el piso se vacía?», no «¿cuánto hay hoy en
 *  total?» — por eso NO suma piso.
 *
 *  Es distinto de `productos.stock_minimo` (Catálogo), que mira el total de
 *  la RED por modelo y avisa cuándo pedir al proveedor. Este mira el
 *  almacén de UNA tienda y avisa cuándo pedir un traslado. Dos preguntas
 *  distintas, dos números. */
export const UMBRAL_STOCK_BAJO_ALMACEN = 10;

/** SOLO para el motor de Análisis (`resumen-reglas.ts`, `planDeReposicion`, rama «bajar al piso»
 *  sin ritmo medible) — ritmo de 30 días. Existencias YA NO lo usa (2026-09-25): tenía su propio
 *  semáforo (`EstadoStock`/`calcularEstado`/`necesitaReponerPiso`), retirado por redundante con
 *  el motor único de «Acción hoy» (`calcularAccionHoy`, `existencias-recomendaciones.ts`) — no
 *  hay dos motores paralelos decidiendo lo mismo con números distintos (sección 9/12 del pedido
 *  de Felipe). El umbral equivalente de Existencias vive, consciente y aparte, en
 *  `politica-operativa-inventario.ts` (`umbralStockPisoReposicion` = 4 unidades de PISO, una
 *  regla física — NO este número, y no es un umbral de días). */
export const UMBRAL_REPOSICION_PISO = 7;

// `EstadoStock`/`calcularEstado`/`necesitaReponerPiso` (semáforo de Existencias, piso ≤ 7) se
// retiraron el 2026-09-25 y NO se restauran al integrar main (decisión explícita de Felipe, cuarta
// ronda del cierre): eran consumidos SOLO por Existencias — auditado de nuevo tras encontrar que
// `porColgar`/su test suite (abajo, mergeados desde main, ADR-0208) también los mencionaban. Esa
// mención era ilustrativa (contrastar «Por colgar» con la vieja «Reponer»), no una dependencia
// funcional real: `porColgar` nunca llamó a `necesitaReponerPiso`. El test que sí la invocaba
// («toda talla por colgar conserva su botón Reponer») se reescribió contra `calcularAccionHoy`
// (`inventario-reglas.test.ts`, «toda talla por colgar tiene Acción hoy…») — misma garantía, fuente canónica nueva.

/** «Por colgar» (Frescura del piso, 2026-09-25): la talla tiene unidades DISPONIBLES en el almacén de
 *  la tienda y NINGUNA disponible colgada en el piso. Es ropa que la clienta no ve ni puede comprar:
 *  al 25-09 TRU tenía 66 u. de 22 tallas así, guardadas sin que nadie las bajara.
 *
 *  No usa el umbral de «Reponer a piso» (`umbralStockPisoReposicion`) a propósito: esa pregunta es «¿queda POCO colgado?» (reponer antes
 *  de que se note); esta es «¿no hay NADA colgado?» — la talla ya desapareció del piso. Por eso toda
 *  talla por colgar también ofrece «Reponer» (piso 0 está bajo cualquier umbral), pero no al revés.
 *
 *  Se mira lo DISPONIBLE (neto de apartados), no lo físico, igual que «Acción hoy» y el modal de
 *  Reponer: si las dos del piso están apartadas para una clienta, en el piso no queda nada que vender
 *  y la talla está por colgar; si lo del almacén está todo apartado, no hay nada que bajar y no lo está.
 *  Donde la sede no separa piso de almacén (Taller: `null`) la pregunta no existe → nunca. */
export function porColgar(c: Pick<Cantidades, "pisoDisponible" | "almacenDisponible">): boolean {
  if (c.pisoDisponible === null || c.almacenDisponible === null) return false;
  return c.pisoDisponible <= 0 && c.almacenDisponible > 0;
}

/** El contador del filtro «Por colgar»: cuántas tallas y cuántas unidades se podrían colgar hoy (lo
 *  disponible en el almacén de esas tallas — lo mismo que el modal de Reponer deja bajar). */
export function resumirPorColgar(filas: Pick<Cantidades, "pisoDisponible" | "almacenDisponible">[]): { tallas: number; unidades: number } {
  let tallas = 0;
  let unidades = 0;
  for (const f of filas) {
    if (!porColgar(f)) continue;
    tallas += 1;
    unidades += f.almacenDisponible ?? 0;
  }
  return { tallas, unidades };
}

/** Orden de la lista «Por colgar»: modelo, color y talla en su curva (S · M · L, 36 · 38). La encargada
 *  cuelga por percha —un modelo en un color—, no talla por talla: si la M y la L de la misma casaca
 *  negra salen separadas por otras prendas, baja una y se olvida de la otra. El `productoId` desempata
 *  dos modelos con el mismo nombre para que sus tallas no se intercalen. Lo que no tiene color o talla
 *  va al final de su grupo, no se pierde. Devuelve un arreglo nuevo: no reordena el que recibe. */
export function ordenarPorModeloColorTalla<T extends { referencia: string; productoId: string; color: string | null; talla: string | null }>(filas: T[]): T[] {
  const alFinal = (a: string | null, b: string | null, comparar: (x: string, y: string) => number) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : comparar(a, b);
  return [...filas].sort(
    (a, b) =>
      a.referencia.localeCompare(b.referencia, "es") ||
      a.productoId.localeCompare(b.productoId) ||
      alFinal(a.color, b.color, (x, y) => x.localeCompare(y, "es")) ||
      alFinal(a.talla, b.talla, compararTallas)
  );
}

/** La percha de una talla: el modelo (por `productoId`, no por nombre) en un color. Es el grupo que
 *  `ordenarPorModeloColorTalla` deja contiguo y que la paginación de «Por colgar» no parte entre páginas
 *  (`paginarSinPartirGrupos`). */
export function clavePercha(f: { productoId: string; color: string | null }): string {
  return JSON.stringify([f.productoId, f.color]);
}

// --- Mover entre piso y almacén, en los dos sentidos -------------------------
// Bajar al piso (reponer) y retirar del piso (D-41: «pasa de verdad, falta la
// pantalla») son LA MISMA operación con origen y destino invertidos: las dos van
// por `retail.mover_interno` (20260914230000_inventario_piso_almacen.sql), que
// acepta cualquier par de sububicaciones de la misma sede y no cambia el total
// de la tienda. Por eso el sentido es un dato, no un segundo modal: de él salen
// de dónde sale la prenda, a dónde va, cuánto se puede mover y cómo se dice.

export type SentidoPiso = "bajar" | "retirar";
export type LugarTienda = "piso" | "almacen";

export type ReglaSentidoPiso = {
  origen: LugarTienda;
  destino: LugarTienda;
  /** El título del modal. Bajar desde la fila se sigue llamando «Reponer piso», como su botón «Reponer»:
   *  «Bajar al piso» es el botón de la pantalla de escaneo de ADR-0208 (/inventario/bajar), y dos cosas
   *  distintas con el mismo nombre confunden. En Movimientos las dos quedan como «Bajada al piso». */
  titulo: string;
  etiquetaCantidad: string;
  /** El recorrido, en palabras de tienda: va en la bajada del título para que ni un error ni el aviso lo tapen. */
  recorrido: string;
  /** Lo que se le dice a la persona cuando pide más de lo que hay en el origen. */
  noAlcanza: (pedido: number, hay: number) => string;
  exito: (n: number) => string;
  /** Qué se estaba intentando, para `traducirError` («No se pudo …»). */
  accion: string;
};

export const SENTIDO_PISO: Record<SentidoPiso, ReglaSentidoPiso> = {
  bajar: {
    origen: "almacen",
    destino: "piso",
    titulo: "Reponer piso",
    etiquetaCantidad: "Cantidad a reponer",
    recorrido: "Almacén de tienda → Piso de venta",
    noAlcanza: (pedido, hay) => `No hay ${pedido} unidades en el almacén — hay ${hay}.`,
    // «bajada», no «repuesta»: es la palabra con la que la fila queda en Movimientos («Bajada al piso»).
    exito: (n) => `${n} ${n === 1 ? "unidad bajada" : "unidades bajadas"} al piso`,
    accion: "reponer el piso",
  },
  retirar: {
    origen: "piso",
    destino: "almacen",
    titulo: "Retirar del piso",
    etiquetaCantidad: "Cantidad a retirar",
    recorrido: "Piso de venta → Almacén de tienda",
    // Lo apartado para una clienta sigue colgado pero no se retira: la cifra ya viene neta.
    noAlcanza: (pedido, hay) => `No hay ${pedido} unidades libres en el piso — hay ${hay} (lo apartado para clientas no se retira).`,
    exito: (n) => `${n} ${n === 1 ? "unidad retirada" : "unidades retiradas"} del piso`,
    accion: "retirar del piso",
  },
};

/** Si una talla ofrece «Retirar del piso»: basta con que quede algo LIBRE colgado (neto de lo
 *  apartado para clientas). Sin umbral a propósito — «Reponer a piso» avisa desde
 *  `umbralStockPisoReposicion` (`politica-operativa-inventario.ts`) porque es una alarma (la clienta se va sin su talla); retirar no es
 *  alarma sino una decisión de la tienda (guardar lo de otra temporada, una talla que sobra en
 *  la percha) y tiene sentido con 1 unidad o con 30. `null` = la sede no separa piso y almacén
 *  (Taller): no hay piso del que retirar. */
export function puedeRetirarPiso(pisoDisponible: number | null): boolean {
  return pisoDisponible !== null && pisoDisponible > 0;
}

/** Cuántas unidades se pueden mover en ese sentido: lo DISPONIBLE del origen (neto de lo
 *  apartado — la base igual rechaza mover una prenda apartada, ADR-0141). Nunca negativo. */
export function topeMovimientoPiso(sentido: SentidoPiso, disponible: { piso: number | null; almacen: number | null }): number {
  return Math.max(0, disponible[SENTIDO_PISO[sentido].origen] ?? 0);
}

// ============================================================================
// Umbrales del Resumen (ADR-0101; rehechos en ADR-0121) — los usa
// `resumen-reglas.ts`. Viven acá, junto a los de piso/almacén, para que "cuánto
// es poco" tenga una sola casa: ningún componente ni ninguna función de reglas
// lleva un número suelto. Son el primer número razonable, NO ajustado todavía
// con meses de venta real (a diferencia de los de arriba, que Felipe corrigió
// varias veces probando la pantalla): los marcados «por confirmar» son
// decisiones de negocio que esta implementación tomó por defecto y que Felipe
// puede cambiar tocando UNA constante.
// ============================================================================

// --- Bandas de cobertura (días de stock al ritmo del período) ---------------

/** Cobertura en días o menos = «crítica»: se acaba en los próximos días. */
export const UMBRAL_COBERTURA_CRITICA_DIAS = 3;

/** Cobertura en días o menos = «atención». Es también el PUNTO DE REPOSICIÓN:
 *  a partir de acá el motor de recomendaciones propone traer más. */
export const UMBRAL_COBERTURA_RIESGO_DIAS = 7;

/** Más de esto es «30+ días» en el gráfico de cobertura (banda «alta»). */
export const UMBRAL_COBERTURA_SALUDABLE_DIAS = 30;

/** Más de esto, con baja rotación detrás, es «posible sobrestock» y es el corte
 *  del «capital con cobertura alta». Reemplaza las 12 semanas del ADR-0101: la
 *  referencia de Felipe habla de «> 60 días». */
export const UMBRAL_COBERTURA_ALTA_DIAS = 60;

// --- Cuánta evidencia hace falta antes de afirmar algo ----------------------

/** Con menos días EN VENTA que esto no se calcula velocidad: «poco historial».
 *  Con 3 días ya hay ritmo (una prenda que vendió 10 en 5 días vende 2/día). */
export const MIN_DIAS_CON_STOCK_VELOCIDAD = 3;

/** Con menos días en venta que esto no se afirma «no se vende» ni «sobrestock»:
 *  quince días sin venta es una señal; cinco, una racha. */
export const MIN_DIAS_CON_STOCK_AFIRMAR = 14;

/** Por debajo de esta cantidad no vale la pena hablar de sobrestock. */
export const MIN_UNIDADES_SOBRESTOCK = 3;

/** Sell-through (% del inventario disponible que se vendió) por debajo de esto,
 *  con evidencia, es baja rotación; por encima del segundo, alta rotación. */
export const SELL_THROUGH_BAJO_PCT = 20;
export const SELL_THROUGH_ALTO_PCT = 60;

/** Distribución de sell-through de «Comparar períodos» (2026-09-19): límite SUPERIOR de cada rango, en %, sobre el
 *  porcentaje redondeado al entero → 0–25 · 26–50 · 51–75 · 76–100. El gráfico y sus etiquetas salen de acá. */
export const RANGOS_SELL_THROUGH_PCT = [25, 50, 75, 100] as const;

/** Desde cuántos puntos porcentuales de diferencia de sell-through entre A y B se destaca como «cambio
 *  relevante» de una variante (subió o bajó al menos esto). */
export const SELL_THROUGH_CAMBIO_RELEVANTE_PP = 10;

// --- Motor de reposición (por confirmar por Felipe) --------------------------

/** Cuántos días de venta se busca cubrir al reponer. Era 14 en el ADR-0101. */
export const DIAS_OBJETIVO_COBERTURA = 14;

/** Reserva de seguridad, en días de venta: lo que se vende mientras llega un
 *  traslado (ETA típica de 1–3 días). NO es `productos.stock_minimo` (Catálogo,
 *  por producto y red: avisa cuándo pedir al proveedor) ni los umbrales de
 *  piso/almacén de Existencias (política fija por tienda): es derivada de la
 *  velocidad de cada variante, y por eso no se configura por variante. */
export const DIAS_RESERVA_SEGURIDAD = 3;

/** El piso debe alcanzar para esta cantidad de días de venta al bajar mercadería. */
export const DIAS_OBJETIVO_PISO = 7;

/** Si el piso cubre menos que esto (con stock atrás) se sugiere bajar al piso. */
export const DIAS_PISO_ALERTA = 3;

/** Días de venta propia que una sede conserva al ceder mercadería: lo que ella
 *  misma consideraría «sano» (sobre su punto de reposición) más su reserva.
 *  Así su propio Resumen no le pide la prenda de vuelta al día siguiente. */
export const DIAS_COBERTURA_MINIMA_ORIGEN = UMBRAL_COBERTURA_RIESGO_DIAS + DIAS_RESERVA_SEGURIDAD;

// --- Lectura de la demanda ---------------------------------------------------

/** «Alta demanda»: entre las variantes con velocidad medible de la sede, las del
 *  percentil más alto… */
export const ALTA_DEMANDA_PERCENTIL = 0.8;
/** …siempre que además vendan al menos esto por día (en una sede lenta el
 *  percentil solo no significa «alta»). */
export const ALTA_DEMANDA_MIN_UDS_DIA = 0.5;

/** Cambio de velocidad contra el período de comparación que se considera
 *  tendencia (en % — por debajo es «estable»). */
export const TENDENCIA_UMBRAL_PCT = 25;

/** Tendencia de un período (Desempeño, 2026-09-19): 2.ª mitad contra 1.ª. Con menos unidades netas
 *  que esto en TODO el período no se afirma «aceleró»/«desaceleró»: 1 venta contra 2 es un +100% que
 *  no dice nada. Es evidencia, no umbral de cambio (ese es `TENDENCIA_UMBRAL_PCT`). */
export const TENDENCIA_MIN_UNIDADES = 4;

/** «Ritmo reciente» de Existencias: los últimos N días de venta con que se mide cuánto dura el
 *  stock de hoy (cobertura). Mismo período que el Resumen usa por defecto. */
export const DIAS_RITMO_RECIENTE = 30;

// --- Comportamiento comercial: piso vs. almacén (Análisis, 2026-09-24) -------
// Por confirmar por Felipe: son el primer número razonable para separar "cómo
// responde la variante en piso" de "cuánto inventario total se mantiene", no
// meses de venta real como las de arriba. Una sola casa para los tres, para no
// repartir el mismo criterio entre la tabla, el tooltip y la lectura.

/** Una cohorte de unidades que llegó al piso madura (se puede juzgar su sell-through) a partir de
 *  este número de días desde que llegó, o antes si se vendió entera primero. Con menos, penalizaría
 *  a una reposición reciente que todavía no tuvo tiempo de venderse — ver sección 8 del pedido de
 *  Felipe (sell-through de exposición, cohortes FIFO en `resumen-exposicion.ts`). */
export const SELL_THROUGH_EXPOSURE_WINDOW_DAYS = 7;

/** Ritmo observado con «muestra limitada»: cuando la exposición en piso fue menos de esta fracción
 *  del período completo. El número de ritmo es igual de correcto matemáticamente, pero la UI lo
 *  marca para que no se lea como "vende esto todos los días" cuando apenas tuvo unas horas de
 *  evidencia (ej. 1 de 7 días). Fracción, no días fijos, porque "poco" es relativo al período elegido
 *  (7, 30 o 90 días). */
export const RITMO_MUESTRA_LIMITADA_FRACCION = 0.5;

/** Rotación total por debajo de esta fracción de la rotación en piso = «responde bien en piso, pero
 *  mantiene mucho inventario total» (sección 15, caso "buen producto + sobrestock"). 0.5 = la mitad
 *  del inventario invertido gira a la mitad de velocidad que lo expuesto — línea razonable para
 *  separar "algo más de colchón en almacén" de "casi todo el inventario duerme atrás". */
export const SOBRESTOCK_ROTACION_TOTAL_VS_PISO = 0.5;

// --- Exactitud del inventario -------------------------------------------------

/** Un conteo cerrado más antiguo que esto ya no valida el inventario de hoy. */
export const DIAS_CONTEO_VIGENTE = 30;

/** Por debajo de este % de líneas correctas el conteo no da confianza aunque
 *  sea reciente (misma escala de colores que `tonoExactitud`: < 95 = a mejorar). */
export const EXACTITUD_ACEPTABLE_PCT = 95;

// --- La miniatura de una prenda ------------------------------------------------
// Vivía en `inventario-v2.ts` (solo servidor). Se mudó acá, sin cambiar su lógica,
// cuando Conteo empezó a dibujar la prenda igual que Existencias: la regla de
// cuál foto es LA foto de un producto tiene que ser una sola, y `inventario-v2`
// no se puede importar desde un componente cliente.

export type FotoCruda = { url: string; orden: number; es_principal: boolean };

/** De las fotos de un producto (0 a N, en cualquier orden de llegada), la
 *  que se muestra como miniatura: la marcada `es_principal`, o si ninguna
 *  lo está, la de menor `orden` — mismo criterio que ya usan
 *  `catalogo_crear_producto`/`catalogo_actualizar_producto` en SQL al
 *  elegir cuál queda de `es_principal` por defecto. */
export function fotoPrincipal(fotos: FotoCruda[] | null | undefined): string | null {
  if (!fotos || fotos.length === 0) return null;
  return (fotos.find((f) => f.es_principal) ?? [...fotos].sort((a, b) => a.orden - b.orden)[0]).url;
}

/** Las cantidades de una prenda en una sede. */
export type Cantidades = {
  total: number;
  piso: number | null;
  almacen: number | null;
  danado: number | null;
  apartado: number;
  disponible: number;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
};
export type FilaCantidadCruda = { variante_id: string; cantidad: number; cantidad_apartada: number; sububicacion: { tipo: string | null } | null };

/**
 * Las reglas de cantidades en UN solo lugar (cuarentena no suma, lo apartado no se vende, piso vs. almacén): las
 * usan Existencias (`getStockPorUbicacion`, con el detalle de cada prenda) y la caja (`getDisponibleEnSede`, solo
 * números). Por variante; las filas de piso y almacén de una misma prenda se suman.
 */
export function sumarCantidades(filas: FilaCantidadCruda[]): Map<string, Cantidades> {
  // Una sola ubicación es piso/almacén o no lo es — nunca "depende de la
  // variante". Se decide una vez sobre todas las filas, no por fila: una
  // prenda que todavía no tiene stock en ningún lado de la tienda igual
  // cuenta como "separa" (para mostrar SIN STOCK, no para desaparecer).
  const separaPisoAlmacen = filas.some((f) => f.sububicacion?.tipo === "piso_venta" || f.sububicacion?.tipo === "almacen_tienda");

  const acumulado = new Map<string, { total: number; piso: number; almacen: number; danado: number; apartado: number; apartadoPiso: number; apartadoAlmacen: number }>();
  for (const f of filas) {
    let a = acumulado.get(f.variante_id);
    if (!a) {
      a = { total: 0, piso: 0, almacen: 0, danado: 0, apartado: 0, apartadoPiso: 0, apartadoAlmacen: 0 };
      acumulado.set(f.variante_id, a);
    }
    // Cuarentena (20260917100000) NUNCA suma a `total`: es stock dañado,
    // no vendible — mezclarlo con piso/almacén inflaría "Prendas
    // disponibles" con algo que, de hecho, no se puede vender.
    if (f.sububicacion?.tipo === "cuarentena") {
      a.danado += f.cantidad;
      continue;
    }
    a.total += f.cantidad;
    a.apartado += f.cantidad_apartada;
    if (f.sububicacion?.tipo === "piso_venta") {
      a.piso += f.cantidad;
      a.apartadoPiso += f.cantidad_apartada;
    } else if (f.sububicacion?.tipo === "almacen_tienda") {
      a.almacen += f.cantidad;
      a.apartadoAlmacen += f.cantidad_apartada;
    }
  }

  const cantidades = new Map<string, Cantidades>();
  for (const [varianteId, a] of acumulado) {
    cantidades.set(varianteId, {
      total: a.total,
      danado: separaPisoAlmacen ? a.danado : null,
      piso: separaPisoAlmacen ? a.piso : null,
      almacen: separaPisoAlmacen ? a.almacen : null,
      apartado: a.apartado,
      disponible: a.total - a.apartado,
      pisoDisponible: separaPisoAlmacen ? a.piso - a.apartadoPiso : null,
      almacenDisponible: separaPisoAlmacen ? a.almacen - a.apartadoAlmacen : null,
    });
  }
  return cantidades;
}

// La nota no llega a Existencias (solo al detalle de Movimientos): el aviso no la vende como remedio, pide avisar al equipo.
const NOTA_SOLO_EN_MOVIMIENTOS = "Si la guardas a propósito, avisa a tu equipo: en Existencias la nota no se ve, solo al abrir el movimiento.";
// «libre»: la cifra es neta de lo apartado, la misma que muestra «Stock actual» en la tabla (lo apartado va debajo).
const AVISO_RETIRO_POR_COLGAR = `Quedará 0 libre en el piso: Existencias la mostrará «Por colgar» y pedirá bajarla. ${NOTA_SOLO_EN_MOVIMIENTOS}`;
const avisoRetiroReponer = (quedan: number) =>
  `${quedan === 1 ? "Quedará 1 libre" : `Quedarán ${quedan} libres`} en el piso: Existencias sugerirá «Reponer». ${NOTA_SOLO_EN_MOVIMIENTOS}`;

/** El bloque del retiro cuando la fila no va a pedir nada: «retirar» se lee fácil como «dar de baja», y no lo es. */
// Lo del almacén no se cobra (la venta descuenta del piso): «siguen disponibles para vender» sería falso.
export const RETIRO_NO_ES_BAJA = "Pasan al almacén de la tienda: siguen siendo stock de la tienda (no es una baja), pero la caja no las cobra hasta que vuelvan al piso.";

/** Todo lo que puede mostrar ese bloque, para que el modal reserve el alto del más largo (ADR-0185). El de «Reponer» más
 *  largo es el de la cifra más alta que todavía pide reponer: el umbral de la sede (al menos 2, para reservar el plural). */
export function textosBloqueRetiro(politica: PoliticaOperativaInventario): readonly string[] {
  return [RETIRO_NO_ES_BAJA, AVISO_RETIRO_POR_COLGAR, avisoRetiroReponer(Math.max(2, politica.umbralStockPisoReposicion))];
}

/** Qué va a decir Existencias de la talla DESPUÉS de retirar `n` del piso, si eso contradice el retiro.
 *  «Acción hoy» solo mira cifras (`calcularAccionHoy`, `porColgar`): no sabe que la encargada guardó la
 *  talla a propósito (fin de temporada), así que al turno siguiente le pide bajarla de nuevo. Hasta que
 *  exista una marca de «retirada de la venta» (decisión de Felipe, bloque 3 de ADR-0208), el modal lo avisa
 *  ANTES de confirmar y dice dónde queda la nota. `null`: la fila no va a pedir nada, o la cantidad no vale
 *  (de eso se encargan los otros mensajes). Recibe lo DISPONIBLE, como el modal y «Acción hoy».
 *
 *  Pregunta a `calcularAccionHoy` con la política de la sede, no a un umbral propio: el aviso tiene que decir lo
 *  mismo que después va a pintar la fila (hasta el 2026-09-25 lo decidía `necesitaReponerPiso`, retirado). */
export function avisoTrasRetiro(disponible: { piso: number | null; almacen: number | null }, n: number, politica: PoliticaOperativaInventario): string | null {
  if (!Number.isInteger(n) || n <= 0 || disponible.piso === null || disponible.almacen === null) return null;
  const piso = disponible.piso - n;
  const almacen = disponible.almacen + n;
  if (piso < 0) return null;
  if (porColgar({ pisoDisponible: piso, almacenDisponible: almacen })) return AVISO_RETIRO_POR_COLGAR;
  const despues = calcularAccionHoy({ varianteId: "", pisoDisponible: piso, almacenDisponible: almacen, enTransito: 0 }, politica);
  if (despues.tipo === "reponer_a_piso") return avisoRetiroReponer(piso);
  return null;
}

/**
 * El error de «Reponer» o «Retirar del piso», dicho para quien está junto a la percha. El modal manda una marca por
 * intento (ADR-0208, `mover_interno` con `p_token`): tras una respuesta incierta la cantidad queda fija y reenviar
 * con la misma marca no mueve dos veces; por eso aquí nunca se dice «no se guardó nada» ni «revisa antes de repetir».
 * `conDuda`: antes de este rechazo ya había un envío sin respuesta, y el rechazo no dice qué pasó con él.
 */
export function mensajeErrorMovimientoPiso(sentido: SentidoPiso, error: ErrorEscritura, conDuda = false): string {
  const { accion } = SENTIDO_PISO[sentido];
  if (esRespuestaIncierta(error)) {
    return `Se cortó la conexión mientras se intentaba ${accion}: no sabemos si llegó a guardarse. La cantidad queda fija: pulsa «${BOTON_CONFIRMAR_DE_NUEVO}» sin cambiar nada; si ya se había guardado, no se repite.`;
  }
  const mensaje = traducirError(error, accion);
  // La marca ya se había usado con otros datos: la base lo dice entero («Cierra y revisa Existencias…»).
  if (!conDuda || error?.hint === "mover_interno_token_reusado") return mensaje;
  // Los textos de la base no siempre cierran con punto («…se pide trasladar 2»): sin él, las dos frases se pegan.
  return `${/[.!?…»]$/.test(mensaje.trim()) ? mensaje.trim() : `${mensaje.trim()}.`} Aún no sabemos si el envío anterior se guardó: cuando se resuelva, pulsa «${BOTON_CONFIRMAR_DE_NUEVO}» (no se repite), o cierra y revisa Existencias.`;
}
