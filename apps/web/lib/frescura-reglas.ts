import { compararInstantes, historiaDeCohortes, type EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import type { PisoAnterior } from "./frescura-piso";
import type { Tolerado } from "./resultado";
import {
  aplicarDecisiones,
  completarTraslados,
  exposicionDeEventos,
  leerDecisiones,
  type DecisionDePrenda,
  type DecisionesDeSede,
  type ExposicionDe,
  type LecturaDecisiones,
} from "./frescura-decisiones-reglas";

// Frescura del piso, paso 3 del 3c (ADR-0208 «Actualización 2026-09-27 — diseño 3c», ADR-0248, plan
// `docs/PLAN-FRESCURA-3C.md`): las reglas puras que convierten la lectura de una sede (`retail.fn_frescura_sede`) en el
// estado de cada prenda. Sin React ni supabase: la usa `frescura.ts` en el servidor y se prueba en
// `frescura-reglas.test.ts`.
//
// LA PREGUNTA: ¿esta prenda (modelo+color) lleva en el piso más tiempo del que tardan en venderse las de su categoría
// en ESTA sede? Tres piezas:
//   1. LA VARA de cada categoría × sede: cuántos días colgada tarda en venderse cada unidad (Kaplan-Meier: lo que sigue
//      colgado cuenta como «al menos N días»). Sus cortes P50, P75 y P90 dan los tramos Nueva, Vigente, Envejecida y
//      Crítica. Decisión de Felipe del 2026-09-27: SIN partir por mitad del año; la temporada da otro aviso, aparte.
//      Cada prenda se ubica contra los cortes de su categoría SIN ella (D5, 2026-09-27): con ella adentro, lo más quieto
//      de una categoría corría los cortes con sus propias unidades y se escondía detrás de ellos.
//   2. EL RELOJ DE NOVEDAD de la prenda: los segundos con alguna de sus tallas LIBRE en el piso desde la primera vez que
//      se colgó en la sede. Nunca se reinicia (una prenda repuesta no vuelve a ser Nueva) y no corre agotada, guardada ni
//      apartada para una clienta (R7-1, Felipe 2026-09-27: lo apartado ya tiene dueña, no está colgado).
//   3. LA RAPIDEZ: cuántas vendió contra cuántas habría vendido una prenda típica de su categoría (sin ella) con los
//      mismos días colgada, con las unidades de TODA la lectura. Separa «vieja y lenta» (quieta) de «vieja pero se sigue
//      vendiendo» (un pilar, que nunca va al perchero salvo que su temporada ya pasó: D2). Lo que lleva sus últimos 30
//      días en el piso sin vender no es pilar aunque su índice de 120 días lo diga (revisión 6; «en el piso», R7-2).
//      Lo apartado para una clienta tampoco cuenta como colgado aquí: es una venta desde que se apartó, o una pausa si
//      la clienta no se la llevó (revisión 8, `eventosConApartados`).
//
// Lo que NO vive aquí, a propósito: el FIFO de cohortes. Es UNO solo, `historiaDeCohortes` de `inventario-exposicion.ts`
// (ADR-0208 (d), ADR-0248); aquí solo se preparan sus eventos (quitar las bajadas tardías, recortar la ventana) y se
// leen sus salidas.

// ---------------------------------------------------------------------------
// Constantes del negocio
// ---------------------------------------------------------------------------

/** Las ventanas que puede usar la vara, de la más corta a la más larga (días). Se elige la más corta que alcanza. */
export const VENTANAS_VARA_DIAS = [30, 60, 90, 120] as const;
/** Unidades vendidas CON EDAD CONOCIDA que necesita una ventana para usarse (y es el umbral de «Sólido»). */
export const VARA_MIN_VENDIDAS = 20;
/** La ventana de la bajada tardía: lo vendido en [t, t + 10 min] de una bajada la delata (ADR-0208, W del núcleo). */
export const VENTANA_TARDIA_SEGUNDOS = 10 * 60;
/**
 * La ventana de la entrega de algo apartado (revisión 8): una liberación seguida de una venta de la misma talla dentro
 * de estos segundos es la entrega a su clienta. Entregar una separación libera y vende en la misma operación (0
 * segundos); «Se la entrego al cliente ahora» de Apartados libera y se cobra enseguida en Vender.
 */
export const VENTANA_ENTREGA_SEGUNDOS = 10 * 60;
/** Índice de rapidez de una prenda que se vende igual que su categoría a la misma edad. */
export const RAPIDEZ_IGUAL = 100;
/** Evidencia mínima para hablar de rapidez: vendidas + esperadas. Con menos, «sin dato» (nunca «lenta»). */
export const RAPIDEZ_MIN_EVIDENCIA = 1;
/**
 * Días sin vender que piden «revisa sus ventas» a una prenda sin tramo firme (D4+D6, 2026-09-27): sus últimos
 * este-tantos días EN EL PISO (con algo libre colgado; R7-2) sin ninguna venta de su modelo+color en la sede. Es la
 * ventana más corta de la vara: lo que se considera «reciente» en toda la pantalla.
 */
export const DIAS_CALLADA = 30;

/** Las marcas de cada evento de `fn_frescura_sede` (bits). */
export const MARCA_VENTA = 1;
export const MARCA_INTERNO = 2;
export const MARCA_EDAD_DESCONOCIDA = 4;
/** Una fila del cuadre del piso (ADR-0328, `20261004200050`): antes y después de ese instante, el piso de la sede se cuenta
 *  distinto (antes estaba subcontado), así que la medida de «Ya decidí» se corta ahí (`frescura-decisiones-reglas.ts`). */
export const MARCA_CUADRE = 8;

/**
 * Los días de ventas con que se arma la vara del mes (ADR-0208, act. 2026-10-10 (b), decisión 2 de Felipe: «el día 1 se
 * recalcula con las ventas de los últimos 3 meses y queda fija todo el mes»). Cabe en la lectura de 120 días hasta el día 30
 * del mes; el 31 empieza un día más tarde (en `desde`), sin otra consecuencia.
 */
export const DIAS_VARA_DEL_MES = 90;

const MS_POR_DIA = 86_400_000;
const EPS = 1e-9;
// Lima no cambia de hora en el año: UTC−5 fijo (el mismo supuesto de `actividad-reglas.ts`).
const LIMA_MS = 5 * 60 * 60 * 1000;

/** Las 00:00 de Lima del día 1 del mes de `ahora`, en UTC: el corte de la vara del mes. */
export function inicioDelMesLima(ahora: string): string {
  const lima = new Date(Date.parse(ahora) - LIMA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), 1) + LIMA_MS).toISOString();
}
/**
 * Tolerancia (en segundos) al comparar el reloj de una prenda con un corte o con `tMax`. Los dos lados salen de sumas
 * distintas de las mismas horas (el reloj por tramos, la exposición de una unidad de una sola resta, o por tramos si
 * tuvo pausas), y en coma flotante pueden diferir en 1e-11: sin tolerancia, la prenda más vieja de una categoría sin
 * P75 salía «aún sin referencia» en el 15 % de las historias al azar (revisión 4). Un microsegundo no es un día.
 */
const TOL_SEGUNDOS = 1e-6;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Los tres niveles de confianza de una cifra (ADR-0208, decisión 5 del bloque 3): 1-9, 10-19, 20 o más. */
export type NivelConfianza = "pocos_datos" | "aceptable" | "solido";
export type Tramo = "nueva" | "vigente" | "envejecida" | "critica";
/**
 * Lo que Frescura puede sugerir. «Rebajar» NO existe: la rebaja es del líder, por sede y en tramos (bloque 7).
 * `sigue_vendiendo`: «Sigue vendiendo: decide si la dejas hasta agotar o la retiras», solo para un pilar de venta (que no
 * dejó de venderse) cuya temporada ya pasó (D2, Felipe 2026-09-27), o para lo que no tiene dato de rapidez y vendió en
 * sus últimos 30 días en el piso (pregunta 8, Felipe 2026-09-28); es una pregunta, no una orden, y nunca trae
 * «trasladar».
 */
export type Sugerencia =
  | "revisar_ventas"
  | "cambiar_lugar"
  | "trasladar"
  | "retirar"
  | "sigue_vendiendo"
  | "guardar_hasta_su_estacion"
  // Paso 4b (`sugerenciasConHistoria`): salen del RESULTADO de lo que ya se decidió, no de la lectura del piso.
  | "dejar_hasta_agotar"
  | "rebaja_chica";
/**
 * Lo que dicen sus ventas de sus últimos `DIAS_CALLADA` días EN EL PISO (revisión 6; R7-2): `vendio` (vendió algo en
 * ellos), `dejo_de_vender` (la lectura tiene esos días colgada y no vendió nada) o `no_se_sabe` (no vendió, pero la
 * lectura no la tiene colgada tanto tiempo: todavía no dice nada). Son días con algo libre en el piso, no días de
 * calendario: el éxito que se agotó 35 días y se repuso ayer sigue midiéndose con lo que vendió antes de agotarse. Es la
 * ÚNICA medida de «¿se sigue vendiendo?» de la pantalla: la usan el pilar (y con él «sigue vendiendo») y la prenda
 * callada.
 */
export type Recientes = "vendio" | "dejo_de_vender" | "no_se_sabe";

/** Una talla de la lectura de la sede (una fila de `prendas` de `fn_frescura_sede`). */
/** Una venta anotada en caja sin su prenda que sigue pendiente: lo que se sabe de ella (ADR-0208, act. 2026-10-10 (c)). */
export type DudaVendida = { categoriaId: string; talla: string | null; colorCodigo: string | null };

export type TallaFrescuraCruda = {
  varianteId: string;
  productoId: string;
  productoNombre: string;
  codigo: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  talla: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
  /** Clave de la temporada efectiva (color → producto → categoría), o null: «Sin temporada». */
  temporada: string | null;
  temporadaOrigen: "color" | "producto" | "categoria" | null;
  esClasico: boolean;
  /** Fin de la estación de la última llegada de su modelo+color A CAYLA (`ultimaLlegadaCayla`, D1); null sin temporada,
   *  clásico todo el año o sin ninguna llegada a CAYLA registrada. */
  finEstacion: string | null;
  enEstacionAhora: boolean | null;
  /** La primera vez que su MODELO+COLOR (cualquier talla) estuvo en el piso de ESTA sede, en todo su historial. */
  primeraExhibicion: string | null;
  /** La última llegada de ESTA talla a ESTA sede (lote, producción, recepción de un traslado o carga inicial). */
  ultimaLlegada: string | null;
  /** La llegada de su MODELO+COLOR A CAYLA que manda, en cualquier sede: la última por lote o producción del Taller y,
   *  si no tiene ninguna, la PRIMERA carga inicial (pregunta 7, Felipe 2026-09-27: una carga posterior no reinicia la
   *  temporada de lo que llegó por lote). La recepción de un traslado no cuenta: la prenda ya estaba en CAYLA. De aquí
   *  sale `finEstacion` (D1, Felipe 2026-09-27). */
  ultimaLlegadaCayla: string | null;
  /** Lo LIBRE en el piso hoy: sin lo apartado para una clienta (R7-1). */
  pisoHoy: number;
  /** Lo LIBRE en el almacén hoy (sin la cuarentena ni lo apartado): lo único que se puede trasladar. */
  almacenHoy: number;
  /** Lo apartado para clientas en esta sede (piso y almacén): la pantalla lo dice, y no cuenta como colgado. */
  apartadasHoy: number;
  /** De lo apartado, lo que está en el PISO (paso 4, `apartadas_piso_hoy`). La pantalla lo necesita para saber si una
   *  prenda sin nada libre colgado está «apartada» (lo apartado es del piso) o «guardada» (está en el almacén): Apartar
   *  toma del almacén cuando el piso está vacío. Con una lectura de antes del paso 4, sale de `apartados` (−Σ delta). */
  apartadasPisoHoy: number;
};

export type TardiaCruda = { oid: string; varianteId: string; bajadaEn: string; unidadesTardias: number };

/** Un cambio en lo apartado del piso (R7-1): `delta` es lo que cambia lo LIBRE (apartar resta, liberar suma). */
export type PuntoApartado = { ts: string; delta: number };

export type LecturaFrescuraConPiso = {
  separaPiso: true;
  desde: string;
  ahora: string;
  tallas: TallaFrescuraCruda[];
  /** Por variante: los puntos del PISO del libro desde `desde`, en orden, ya como `EventoPiso`. */
  eventos: Record<string, EventoPiso[]>;
  /** Por variante: lo apartado del piso desde `desde` (el saldo con que arranca, primero). El reloj lo resta de lo libre;
   *  la vara, la rapidez y las ventas recientes lo leen como venta o como pausa (`eventosConApartados`, revisión 8). Sin
   *  la clave, nada apartado (una lectura de antes de R7-1). */
  apartados?: Record<string, PuntoApartado[]>;
  tardias: TardiaCruda[];
  dudosas: string[];
  /** Los instantes en que se cuadró el piso de la sede dentro de la lectura (las filas con la marca 8), en orden. Sin la
   *  clave, ninguno (una lectura de antes del cuadre). */
  cuadres?: string[];
};
/** El Taller (o cualquier sede sin piso y almacén separados) no tiene frescura que medir. */
export type LecturaFrescuraSede = { separaPiso: false } | LecturaFrescuraConPiso;

/** Una unidad para la curva: cuántos segundos estuvo colgada y si se vendió (si no, «al menos» esos segundos). */
export type Observacion = { segundos: number; vendida: boolean; peso: number };

/** Kaplan-Meier con su riesgo acumulado (Nelson-Aalen), en segundos colgada. */
export type Curva = {
  /** Los instantes (segundos colgada) en que se vendió algo, de menor a mayor. */
  tiempos: number[];
  /** Fracción de unidades que sigue sin venderse justo después de cada instante de `tiempos`. */
  supervivencia: number[];
  /** Ventas esperadas por unidad hasta cada instante: Σ vendidas ÷ en riesgo. Es lo que usa la rapidez. */
  riesgoAcumulado: number[];
  /** Unidades vendidas en cada instante de `tiempos` (con su peso). */
  vendidasEn: number[];
  /** Unidades en riesgo (todavía colgadas) justo antes de cada instante de `tiempos`. */
  enRiesgo: number[];
  /** La observación más larga (vendida o no). Un corte que la curva no alcanza queda después de esto. */
  tMax: number;
  /** Cada instante observado (vendido o no), de menor a mayor, y cuántas unidades salen de la curva en él (con su
   *  peso). Solo sirve para saber la observación más larga SIN una prenda (`contraElResto`) sin rearmar la curva. */
  tiemposObservados: number[];
  pesosObservados: number[];
  vendidas: number;
  unidades: number;
};

/** Los días (en segundos) en que se vendió la mitad, 3 de cada 4 y 9 de cada 10. Null: la curva no llega. */
export type Cortes = { p50: number | null; p75: number | null; p90: number | null };

export type Vara = {
  ventanaDias: number;
  curva: Curva;
  cortes: Cortes;
  /** Unidades vendidas con edad conocida dentro de la ventana: las que cuentan para el nivel. */
  vendidas: number;
  nivel: NivelConfianza | null;
};

export type RelojNovedad = {
  segundos: number;
  /** «Al menos N días»: la primera exhibición es anterior a la ventana, o su edad es desconocida (carga inicial, saldo,
   *  ajuste: ADR-0248, decisión 3). Puede subir de tramo; nunca es «Nueva». Una bajada tardía NO la pone: sus unidades
   *  salen de la vara, pero la prenda sigue pudiendo ser «Nueva» (revisión 3). */
  alMenos: boolean;
};

/**
 * Vendidas contra esperadas: 100 = igual que su categoría con los mismos días colgada; 200 = el doble de rápido.
 * `referencia`: las ventas con edad conocida del RESTO de su categoría contra las que se midió (sin las suyas). Es la
 * evidencia real de la cifra: una prenda que es casi toda su categoría puede tener una vara «Sólido» hecha de sus propias
 * ventas y medirse contra 2 (revisión 4). Lo que mueve plata («Trasladar») exige que ESTA sea «Sólido».
 */
export type Rapidez = { indice: number; vendidas: number; esperadas: number; referencia: number };

type ComunEstado = {
  /** Terminó la estación de su última llegada (solo moda con temporada). */
  temporadaPasada: boolean;
  /** Chip «Sin temporada · complétala»: se mide igual, sin aviso de fin de estación. */
  sinTemporada: boolean;
  /** «Por decidir»: vieja y lenta, o de temporada pasada (también un pilar de venta, D2); un pilar nunca por vieja
   *  (`estaQuieta`). */
  quieta: boolean;
  sugerencias: Sugerencia[];
};

/** El estado de una prenda en Frescura. Cerrado: la pantalla tiene que decir algo distinto para cada uno. */
export type EstadoFrescura = ComunEstado &
  (
    /** `alMenos`: el tramo es un piso, puede ser más. Su reloj es «al menos» (edad desconocida o anterior a la ventana), o
     *  ya pasó todo lo que la curva de su categoría vio y falta el corte siguiente («al menos Envejecida»). */
    | { tipo: "semaforo"; tramo: Tramo; alMenos: boolean }
    /** Su categoría no vendió nada con edad conocida en esta sede: solo días colgada y la referencia de CAYLA. */
    | { tipo: "sin_ventas_sede" }
    /** Hay ventas, pero su categoría SIN ella no vendió ni la mitad (sin P50): «aún sin referencia». También la única
     *  prenda de su categoría que vende: sin ella no queda contra qué medirla (D5). */
    | { tipo: "sin_vara" }
    /** Su reloj no alcanza para salir de «Nueva», pero su edad es desconocida: no se puede decir que es nueva. */
    | { tipo: "sin_edad_conocida" }
    /** Clásico: fuera del semáforo de novedad (ADR-0208, decisión 10). */
    | { tipo: "clasico"; fueraDeSuEstacion: boolean }
    /** El libro de alguna de sus tallas no cuadra (piso negativo): no se juzga. */
    | { tipo: "dudosa" }
  );

// ---------------------------------------------------------------------------
// Lectura de lo que devuelve la base (dato externo: se valida, no se confía en el tipo)
// ---------------------------------------------------------------------------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const esFecha = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const fechaONull = (v: unknown): string | null => (esFecha(v) ? v : null);

/** Los eventos de una variante: `[ts, delta, marcas, oid]`. Un evento con forma rara se descarta en silencio (como
 *  `leerEventosPiso`): mejor una curva con menos evidencia que una rota por un dato inesperado. */
export function leerEventosFrescura(v: unknown): EventoPiso[] {
  if (!Array.isArray(v)) return [];
  const eventos: EventoPiso[] = [];
  for (const item of v) {
    if (!Array.isArray(item) || !esFecha(item[0])) continue;
    const delta = numero(item[1]);
    if (delta === 0) continue;
    const marcas = Math.trunc(numero(item[2]));
    const oid = texto(item[3]);
    eventos.push({
      ts: item[0],
      delta,
      esVenta: (marcas & MARCA_VENTA) !== 0,
      esMovimientoInterno: (marcas & MARCA_INTERNO) !== 0,
      edadDesconocida: (marcas & MARCA_EDAD_DESCONOCIDA) !== 0,
      ...(oid ? { oid } : {}),
    });
  }
  return eventos;
}

/**
 * Los instantes del cuadre del piso en los eventos crudos de `fn_frescura_sede` (los que traen la marca 8), sin repetir y en
 * orden. Todas las filas de un mismo cuadre comparten su instante (la hora de su transacción): un cuadre es un instante.
 */
export function instantesDeCuadre(eventos: unknown): string[] {
  if (!esObjeto(eventos)) return [];
  const vistos = new Map<number, string>();
  for (const lista of Object.values(eventos)) {
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      if (!Array.isArray(item) || !esFecha(item[0]) || (Math.trunc(numero(item[2])) & MARCA_CUADRE) === 0) continue;
      const t = Date.parse(item[0]);
      if (!vistos.has(t)) vistos.set(t, item[0]);
    }
  }
  return [...vistos.entries()].sort(([a], [b]) => a - b).map(([, ts]) => ts);
}

const ORIGENES = ["color", "producto", "categoria"] as const;

/** Lo apartado en el piso de una talla según sus puntos de `apartados`: el saldo al empezar la ventana más lo de adentro,
 *  con el signo de lo libre (apartar resta), así que lo apartado de hoy es −Σ delta. Es lo que devuelve
 *  `apartadas_piso_hoy` (lo prueba T2i de frescura_lectura); sirve mientras producción no tenga la clave. */
const apartadasPisoSegun = (puntos: readonly PuntoApartado[] | undefined, apartadasHoy: number): number =>
  Math.max(0, Math.min(apartadasHoy, -(puntos ?? []).reduce((s, p) => s + p.delta, 0)));

function leerTalla(v: unknown, apartados: Readonly<Record<string, PuntoApartado[]>>): TallaFrescuraCruda | null {
  if (!esObjeto(v)) return null;
  const varianteId = texto(v.variante_id);
  const productoId = texto(v.producto_id);
  if (!varianteId || !productoId) return null;
  const origen = ORIGENES.find((o) => o === v.temporada_origen) ?? null;
  return {
    varianteId,
    productoId,
    productoNombre: texto(v.producto_nombre) ?? "",
    codigo: texto(v.codigo),
    colorCodigo: texto(v.color_codigo),
    colorNombre: texto(v.color_nombre),
    talla: texto(v.talla),
    categoriaId: texto(v.categoria_id),
    categoriaNombre: texto(v.categoria_nombre),
    temporada: texto(v.temporada),
    temporadaOrigen: origen,
    esClasico: v.es_clasico === true,
    finEstacion: fechaONull(v.fin_estacion),
    enEstacionAhora: typeof v.en_estacion_ahora === "boolean" ? v.en_estacion_ahora : null,
    primeraExhibicion: fechaONull(v.primera_exhibicion),
    ultimaLlegada: fechaONull(v.ultima_llegada),
    ultimaLlegadaCayla: fechaONull(v.ultima_llegada_cayla),
    pisoHoy: numero(v.piso_hoy),
    almacenHoy: numero(v.almacen_hoy),
    apartadasHoy: numero(v.apartadas_hoy),
    apartadasPisoHoy:
      v.apartadas_piso_hoy === undefined || v.apartadas_piso_hoy === null
        ? apartadasPisoSegun(apartados[varianteId], numero(v.apartadas_hoy))
        : numero(v.apartadas_piso_hoy),
  };
}

/** Lo apartado de una variante: `[ts, delta]`. Lo que no tiene forma se descarta, como en `leerEventosFrescura`. */
function leerApartados(v: unknown): PuntoApartado[] {
  if (!Array.isArray(v)) return [];
  const puntos: PuntoApartado[] = [];
  for (const item of v) {
    if (!Array.isArray(item) || !esFecha(item[0])) continue;
    const delta = numero(item[1]);
    if (delta !== 0) puntos.push({ ts: item[0], delta });
  }
  return puntos;
}

/**
 * El jsonb de `retail.fn_frescura_sede`. Devuelve null si la forma no es la del contrato (sin `separa_piso`, sin
 * `desde`/`ahora` o sin la lista de prendas): quien llama lo trata como un fallo de lectura, nunca como una sede vacía.
 */
export function leerFrescuraSede(v: unknown): LecturaFrescuraSede | null {
  if (!esObjeto(v)) return null;
  if (v.separa_piso === false) return { separaPiso: false };
  if (v.separa_piso !== true || !esFecha(v.desde) || !esFecha(v.ahora) || !Array.isArray(v.prendas)) return null;
  const apartados: Record<string, PuntoApartado[]> = {};
  if (esObjeto(v.apartados)) for (const [id, lista] of Object.entries(v.apartados)) apartados[id] = leerApartados(lista);
  const tallas = v.prendas.map((p) => leerTalla(p, apartados)).filter((t): t is TallaFrescuraCruda => t !== null);
  const eventos: Record<string, EventoPiso[]> = {};
  if (esObjeto(v.eventos)) for (const [id, lista] of Object.entries(v.eventos)) eventos[id] = leerEventosFrescura(lista);
  const tardias: TardiaCruda[] = [];
  if (Array.isArray(v.tardias)) {
    for (const t of v.tardias) {
      if (!esObjeto(t)) continue;
      const oid = texto(t.oid);
      const varianteId = texto(t.variante_id);
      const unidadesTardias = numero(t.unidades_tardias);
      if (oid && varianteId && unidadesTardias > 0) tardias.push({ oid, varianteId, bajadaEn: fechaONull(t.bajada_en) ?? "", unidadesTardias });
    }
  }
  const dudosas = Array.isArray(v.dudosas) ? v.dudosas.filter((d): d is string => typeof d === "string") : [];
  return { separaPiso: true, desde: v.desde, ahora: v.ahora, tallas, eventos, apartados, tardias, dudosas, cuadres: instantesDeCuadre(v.eventos) };
}

/** Una fila de `retail.fn_confianza_registro`: el registro al colgar de una sede en un mes de Lima. */
export type FilaConfianza = {
  ubicacionId: string;
  sede: string;
  /** Primer día del mes, `YYYY-MM-DD`. */
  mes: string;
  filas: number;
  unidades: number;
  tardias: number;
  /** 1 − tardías ÷ unidades (0 a 1); null si no hubo unidades. */
  confianza: number | null;
  nivel: NivelConfianza | null;
};

const NIVELES: readonly NivelConfianza[] = ["pocos_datos", "aceptable", "solido"];

export function leerConfianzaRegistro(v: unknown): FilaConfianza[] {
  if (!Array.isArray(v)) return [];
  const filas: FilaConfianza[] = [];
  for (const f of v) {
    if (!esObjeto(f)) continue;
    const ubicacionId = texto(f.ubicacion_id);
    const mes = texto(f.mes);
    if (!ubicacionId || !mes) continue;
    const confianza = f.confianza === null || f.confianza === undefined ? null : numero(f.confianza);
    filas.push({
      ubicacionId,
      sede: texto(f.sede) ?? "",
      mes: mes.slice(0, 10),
      filas: numero(f.filas),
      unidades: numero(f.unidades),
      tardias: numero(f.tardias),
      confianza,
      nivel: NIVELES.find((n) => n === f.nivel) ?? null,
    });
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Preparar los eventos (sin tocar el FIFO)
// ---------------------------------------------------------------------------

const ms = (ts: string) => Date.parse(ts);

/**
 * Saca del cálculo de edad las unidades de una bajada tardía (ADR-0208, decisión 3 del bloque 3): una bajada registrada
 * 10 minutos o menos antes de venderse delata una prenda que ya estaba colgada sin registro. Se reconoce la bajada por
 * su movimiento (`oid`, ADR-0248), no por la hora. Por cada bajada tardía se restan sus unidades tardías de la bajada
 * Y de las ventas de esa talla en [t, t + 10 min] (los dos bordes adentro, como el núcleo; también la venta que deja lo
 * apartado a la hora en que se apartó: revisión 9), empezando por la ÚLTIMA: el FIFO le da las primeras ventas a lo que
 * ya estaba en el piso, así que las que delataron la bajada son las de después. Se resta lo mismo de los dos lados
 * (topado por lo vendido en la ventana): el nivel del piso después de la ventana no cambia.
 *
 * `tardias`: oid del movimiento de la bajada → unidades tardías. Devuelve los eventos en orden, sin los que quedan en 0;
 * si ninguna bajada de la talla es tardía (lo normal), una copia tal cual llegaron.
 */
export function excluirTardias(
  eventos: readonly EventoPiso[],
  tardias: ReadonlyMap<string, number>,
  ventanaSegundos: number = VENTANA_TARDIA_SEGUNDOS,
): EventoPiso[] {
  if (!eventos.some((e) => e.oid !== undefined && e.delta > 0 && (tardias.get(e.oid) ?? 0) > 0)) return [...eventos];
  const copia = [...eventos].sort((a, b) => compararInstantes(a.ts, b.ts)).map((e) => ({ ...e }));
  for (const bajada of copia) {
    const tardia = bajada.oid !== undefined ? tardias.get(bajada.oid) : undefined;
    if (tardia === undefined || tardia <= 0 || bajada.delta <= 0) continue;
    const t0 = ms(bajada.ts);
    const t1 = t0 + ventanaSegundos * 1000;
    const ventas = copia
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.esVenta && e.delta < 0 && ms(e.ts) >= t0 && ms(e.ts) <= t1)
      .sort((a, b) => compararInstantes(b.e.ts, a.e.ts) || b.i - a.i);
    const vendido = ventas.reduce((s, { e }) => s - e.delta, 0);
    let porQuitar = Math.min(tardia, bajada.delta, vendido);
    if (porQuitar <= 0) continue;
    bajada.delta -= porQuitar;
    for (const { e } of ventas) {
      if (porQuitar <= 0) break;
      const q = Math.min(porQuitar, -e.delta);
      e.delta += q;
      porQuitar -= q;
    }
  }
  return copia.filter((e) => e.delta !== 0);
}

/**
 * Los eventos vistos desde `inicio`: lo que había en el piso antes se vuelve un saldo inicial con edad desconocida, igual
 * que hace `fn_frescura_sede` con su propia ventana. Así la vara a 30 días mide lo mismo que mediría una lectura de 30
 * días. (Límite heredado de la lectura: una unidad que estaba guardada en el almacén al empezar la ventana y vuelve
 * adentro de ella abre una cohorte con edad conocida; la lectura de la base hace lo mismo.)
 */
export function recortarEventos(eventos: readonly EventoPiso[], inicio: string): EventoPiso[] {
  const t = ms(inicio);
  let saldo = 0;
  const dentro: EventoPiso[] = [];
  for (const e of eventos) {
    if (ms(e.ts) < t) saldo += e.delta;
    else dentro.push(e);
  }
  if (saldo <= 0) return dentro;
  return [{ ts: inicio, delta: saldo, esVenta: false, esMovimientoInterno: false, edadDesconocida: true }, ...dentro];
}

/**
 * Los eventos del piso de una talla con lo apartado para clientas adentro: lo que leen el FIFO de la vara, la rapidez y
 * las ventas «recientes» (revisión 8; R7-1, Felipe 2026-09-27: lo apartado ya tiene dueña, no está colgado). La unidad
 * que una clienta aparta es demanda: para «¿cuánto tarda en venderse?» se vendió cuando se apartó, no cuando se entrega.
 * Cada liberación cierra lo más viejo que seguía apartado de la talla (el libro no dice qué apartado cierra cada una; con
 * una sola separación a la vez, lo normal, es exacto):
 *   · lo que sigue apartado hoy → una VENTA a la hora en que se apartó;
 *   · lo que se liberó y se vendió en los `VENTANA_ENTREGA_SEGUNDOS` siguientes (la entrega: entregar una separación
 *     libera y vende en una sola operación, y «Se la entrego al cliente ahora» de Apartados se cobra enseguida en
 *     Vender) → una venta a la hora en que se apartó, y a la venta de la entrega se le quita esa unidad (ya se contó);
 *   · lo que se liberó sin venderse enseguida (la clienta no vino, un error) → una PAUSA, como guardarla en el almacén:
 *     no suma días colgada mientras estuvo apartada y vuelve con la edad que tenía (la vuelta es la misma entrada interna
 *     que volver a colgar desde el almacén, sin marca de edad desconocida: revisión 9, N2).
 * Lo que se libera sin nada apartado que lo explique (el libro no cuadra) no mueve el FIFO. Sin nada apartado, devuelve
 * los mismos eventos. El reloj de novedad no pasa por aquí: resta lo apartado de lo libre (`tramosColgada`).
 * Va ANTES de `excluirTardias` (revisión 9, N1/F1/F2): la venta que deja un apartado (a la hora en que se apartó) tiene
 * que estar en los eventos cuando se buscan las ventas que delataron una bajada tardía, igual que su gemela vendida.
 */
export function eventosConApartados(
  eventos: readonly EventoPiso[],
  apartados: readonly PuntoApartado[] | undefined,
  ventanaEntregaSegundos: number = VENTANA_ENTREGA_SEGUNDOS,
): readonly EventoPiso[] {
  if (!apartados || apartados.length === 0) return eventos;
  const puntos = apartados
    .map((a) => ({ a, t: ms(a.ts) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((x, y) => x.t - y.t);
  // Las ventas del libro, en orden: las que pueden ser la entrega de algo apartado. `yaContadas`: las unidades de cada
  // una que ya se contaron al apartar.
  const ventas = eventos
    .map((e, i) => ({ i, t: ms(e.ts), unidades: e.esVenta && e.delta < 0 ? -e.delta : 0 }))
    .filter((v) => v.unidades > 0 && !Number.isNaN(v.t))
    .sort((x, y) => x.t - y.t || x.i - y.i);
  const yaContadas = new Map<number, number>();
  const abiertos: { ts: string; t: number; cantidad: number }[] = [];
  // Lo que vuelve al piso va ANTES de los eventos de su mismo instante (una venta en ese instante puede llevársela); lo
  // que sale al apartarse, DESPUÉS (una bajada en ese instante ya está colgada cuando se aparta).
  const antes: EventoPiso[] = [];
  const despues: EventoPiso[] = [];
  const salida = (ts: string, cantidad: number, esVenta: boolean): EventoPiso => ({ ts, delta: -cantidad, esVenta, esMovimientoInterno: !esVenta });
  for (const { a, t } of puntos) {
    if (a.delta < 0) {
      abiertos.push({ ts: a.ts, t, cantidad: -a.delta });
      continue;
    }
    // Lo que cierra esta liberación, de lo más viejo a lo más nuevo.
    const cerradas: { ts: string; t: number; cantidad: number }[] = [];
    let porCerrar = a.delta;
    while (porCerrar > 0 && abiertos.length > 0) {
      const ab = abiertos[0];
      const q = Math.min(ab.cantidad, porCerrar);
      cerradas.push({ ts: ab.ts, t: ab.t, cantidad: q });
      porCerrar -= q;
      ab.cantidad -= q;
      if (ab.cantidad <= 0) abiertos.shift();
    }
    // Cuántas se entregaron: las ventas de la talla en la ventana de la entrega que no se contaron todavía.
    let porEntregar = cerradas.reduce((s, c) => s + c.cantidad, 0);
    for (const v of ventas) {
      if (porEntregar <= 0 || v.t > t + ventanaEntregaSegundos * 1000) break;
      if (v.t < t) continue;
      const libre = v.unidades - (yaContadas.get(v.i) ?? 0);
      const q = Math.min(libre, porEntregar);
      if (q <= 0) continue;
      yaContadas.set(v.i, (yaContadas.get(v.i) ?? 0) + q);
      porEntregar -= q;
    }
    let entregadas = cerradas.reduce((s, c) => s + c.cantidad, 0) - porEntregar;
    for (const c of cerradas) {
      const entregado = Math.min(c.cantidad, entregadas);
      entregadas -= entregado;
      if (entregado > 0) despues.push(salida(c.ts, entregado, true));
      // Apartada y liberada en el mismo instante: no estuvo apartada ningún segundo, no hay pausa.
      if (c.cantidad > entregado && c.t < t) {
        despues.push(salida(c.ts, c.cantidad - entregado, false));
        // La vuelta es la MISMA entrada interna que volver a colgar desde el almacén (revisión 9, N2): reanuda la pausa
        // más vieja de la talla, y si una bajada del almacén ya la reanudó mientras estaba apartada, abre una cohorte con
        // edad conocida desde que se libera, igual que su gemela guardada. Con la marca de edad desconocida, en esa carrera
        // la siguiente venta salía «sin edad» y el pilar de temporada pasada perdía «sigue vendiendo».
        antes.push({ ts: a.ts, delta: c.cantidad - entregado, esVenta: false, esMovimientoInterno: true });
      }
    }
  }
  for (const ab of abiertos) despues.push(salida(ab.ts, ab.cantidad, true));
  const propios: EventoPiso[] = [];
  for (const [i, e] of eventos.entries()) {
    const q = yaContadas.get(i) ?? 0;
    if (q <= 0) propios.push(e);
    else if (e.delta + q !== 0) propios.push({ ...e, delta: e.delta + q });
  }
  // `sort` es estable: en un mismo instante queda lo que vuelve, los eventos del libro en su orden y lo que se aparta.
  return [...antes, ...propios, ...despues].sort((x, y) => compararInstantes(x.ts, y.ts));
}

/** Lo que una talla aporta a la vara en una ventana, y las ventas a las que no se les puede medir la edad. */
export type UnidadesTalla = {
  /** Sus unidades con edad conocida (las de la curva). */
  observaciones: Observacion[];
  /** Las ventas que el FIFO sacó de una cohorte con edad desconocida (carga inicial, ajuste, saldo de la ventana): cuándo
   *  y cuántas unidades. La hora queda como texto: solo se lee si la prenda colgó algo con edad conocida. */
  ventasSinEdad: { ts: string; cantidad: number }[];
  /** Cuándo (milisegundos) se colgó su primera unidad con edad conocida; null si no tiene ninguna. */
  primeraConEdad: number | null;
};

/**
 * Las unidades con EDAD CONOCIDA de una variante, para la curva: cada venta con los segundos que llevaba colgada; cada
 * salida sin venta (traslado a otra sede, merma) y cada unidad que sigue en la sede como «al menos» esos segundos. Lo que
 * tiene edad desconocida no entra (ADR-0248): su reloj no es su edad. Y aparte, las ventas que salieron de lo que tiene
 * edad desconocida y cuándo se colgó lo primero con edad conocida: el FIFO le da las ventas a lo más viejo, así que una
 * talla de la carga inicial que se repone vende primero lo de la carga y lo repuesto parece sin vender (la rapidez lo
 * necesita: `ventasQueEsconden`). `observaciones` NO viene ordenado (primero las salidas, después lo colgado): quien lo
 * necesite en orden lo ordena (`contraElResto`, `kaplanMeier`).
 */
export function unidadesParaVara(eventos: readonly EventoPiso[], ahora: string): UnidadesTalla {
  const { cohortes, salidas } = historiaDeCohortes(eventos);
  const ahoraMs = ms(ahora);
  const obs: Observacion[] = [];
  const ventasSinEdad: UnidadesTalla["ventasSinEdad"] = [];
  let primeraConEdad: number | null = null;
  for (const s of salidas) {
    if (s.cantidad <= 0) continue;
    if (s.edadDesconocida) {
      if (s.tipo === "venta") ventasSinEdad.push({ ts: s.ts, cantidad: s.cantidad });
    } else obs.push({ segundos: s.segundosExpuesta, vendida: s.tipo === "venta", peso: s.cantidad });
  }
  for (const c of cohortes) {
    if (c.edadDesconocida) continue;
    // «Cuándo se colgó lo primero con edad conocida», aunque ya se haya vendido entero: la primera cohorte conocida. El
    // FIFO las deja en el orden en que entraron (agrega al final y parte cada una en su lugar): no hace falta buscar.
    primeraConEdad ??= ms(c.ts);
    if (c.cantidadRestante <= 0) continue;
    const abierto = c.abiertaDesde !== null ? Math.max(0, ahoraMs - ms(c.abiertaDesde)) / 1000 : 0;
    obs.push({ segundos: c.segundosAcumulados + abierto, vendida: false, peso: c.cantidadRestante });
  }
  return { observaciones: obs, ventasSinEdad, primeraConEdad };
}

/**
 * Las ventas sin edad que pueden esconderle ventas a lo que sí tiene edad (revisión 6): las de cualquier talla de la
 * prenda hechas DESDE que colgó su primera unidad con edad conocida. Ahí el FIFO puede darle a la carga inicial una venta
 * que era de lo repuesto (las gemelas K y U), o la talla de la carga vende mientras la repuesta cuelga (E-Y08): la rapidez
 * medida solo con lo conocido diría «lenta» de algo que se vende. Las de ANTES no: la carga que se agotó antes de que
 * llegara lo repuesto no le quitó ninguna venta, y con A1 (toda la lectura) la vetaba 120 días.
 */
function ventasQueEsconden(tallas: readonly UnidadesTalla[]): number {
  let primera = Infinity;
  for (const u of tallas) if (u.primeraConEdad !== null && u.primeraConEdad < primera) primera = u.primeraConEdad;
  if (primera === Infinity) return 0;
  let n = 0;
  for (const u of tallas) for (const v of u.ventasSinEdad) if (ms(v.ts) >= primera) n += v.cantidad;
  return n;
}


// ---------------------------------------------------------------------------
// La curva y sus cortes
// ---------------------------------------------------------------------------

/**
 * Kaplan-Meier sobre unidades con peso. En cada instante con ventas, la fracción sin vender se multiplica por
 * (1 − vendidas ÷ en riesgo); una unidad que sigue colgada (o salió sin venderse) cuenta en riesgo hasta sus segundos y
 * después sale sin empujar la curva: por eso lo que sigue colgado no acorta la referencia, como sí lo hacía el promedio
 * de lo vendido (ADR-0208, «Regla de los tramos»). Una unidad sin vender en el mismo instante que una venta cuenta en
 * riesgo en ese instante (la convención de siempre).
 */
export function kaplanMeier(observaciones: readonly Observacion[]): Curva {
  const obs = observaciones.filter((o) => o.peso > 0 && Number.isFinite(o.segundos)).sort((a, b) => a.segundos - b.segundos);
  const unidades = obs.reduce((s, o) => s + o.peso, 0);
  const curva: Curva = {
    tiempos: [],
    supervivencia: [],
    riesgoAcumulado: [],
    vendidasEn: [],
    enRiesgo: [],
    tMax: obs.length ? obs[obs.length - 1].segundos : 0,
    tiemposObservados: [],
    pesosObservados: [],
    vendidas: 0,
    unidades,
  };
  let enRiesgo = unidades;
  let s = 1;
  let h = 0;
  for (let i = 0; i < obs.length; ) {
    const t = obs[i].segundos;
    let vendidas = 0;
    let salen = 0;
    while (i < obs.length && obs[i].segundos === t) {
      if (obs[i].vendida) vendidas += obs[i].peso;
      salen += obs[i].peso;
      i++;
    }
    curva.tiemposObservados.push(t);
    curva.pesosObservados.push(salen);
    if (vendidas > 0 && enRiesgo > EPS) {
      s *= 1 - vendidas / enRiesgo;
      h += vendidas / enRiesgo;
      curva.tiempos.push(t);
      curva.supervivencia.push(s);
      curva.riesgoAcumulado.push(h);
      curva.vendidasEn.push(vendidas);
      curva.enRiesgo.push(enRiesgo);
      curva.vendidas += vendidas;
    }
    enRiesgo -= salen;
  }
  return curva;
}

/** El último índice de `tiempos` que es ≤ `segundos`, o −1. */
function indiceHasta(curva: Pick<Curva, "tiempos">, segundos: number): number {
  let lo = 0;
  let hi = curva.tiempos.length - 1;
  let r = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (curva.tiempos[mid] <= segundos) {
      r = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return r;
}

/** Fracción de la categoría que seguía sin venderse a `segundos` colgada. */
export function supervivenciaEn(curva: Curva, segundos: number): number {
  const i = indiceHasta(curva, segundos);
  return i < 0 ? 1 : curva.supervivencia[i];
}

type Supervivencia = Pick<Curva, "tiempos" | "supervivencia">;

function corteEn(curva: Supervivencia, queda: number): number | null {
  const i = curva.supervivencia.findIndex((s) => s <= queda + EPS);
  return i < 0 ? null : curva.tiempos[i];
}

/** P50, P75 y P90: el primer instante en que ya se vendió la mitad, 3 de cada 4 y 9 de cada 10. */
export function cortes(curva: Supervivencia): Cortes {
  return { p50: corteEn(curva, 0.5), p75: corteEn(curva, 0.25), p90: corteEn(curva, 0.1) };
}

/** El último instante con venta de una curva: cuánto se vendió hasta ahí (supervivencia y riesgo acumulado) y cuántas ventas la forman. */
export type FinDeCurva = { t: number; s: number; h: number; vendidas: number };

export function finDeCurva(c: Pick<Curva, "tiempos" | "supervivencia" | "riesgoAcumulado" | "vendidas">): FinDeCurva | null {
  const i = c.tiempos.length - 1;
  return i < 0 ? null : { t: c.tiempos[i], s: c.supervivencia[i], h: c.riesgoAcumulado[i], vendidas: c.vendidas };
}

/**
 * Los cortes que la curva no alcanza, extendidos con su PROPIO ritmo (ADR-0208, act. 2026-10-10 (b), actividad 6). Cuando una categoría se
 * estanca, sus unidades sin vender sostienen la curva: nunca llega a «3 de cada 4 vendidas», el corte queda vacío y NADA de ella sale
 * Envejeciendo (lo mostró el ensayo: Jeans de 25 días, «Vigentes»). Pasado lo observado se supone que sigue vendiendo a su ritmo
 * promedio —el riesgo acumulado entre los días, λ = H(t)/t—: S(t + x) = S(t)·e^(−λx), así que el corte q está en t + ln(S(t)/q)/λ.
 * Solo con `VENTAS_PARA_JUZGAR_SOLA` ventas o más (con menos, el ritmo es ruido: «aún aprendiendo») y solo P75 y P90, cuando P50 se alcanzó
 * de verdad: una categoría que ni vendió la mitad sigue «aún sin referencia». Extrapolar su mitad la estiraría (Casacas: 25 % vendido en 60
 * días daba una mitad a los ~115) y sus prendas de 60 días saldrían Frescas: lo contrario de lo que se busca. Un corte alcanzado no cambia.
 */
export function cortesConCola(c: Cortes, fin: FinDeCurva | null): Cortes {
  if (c.p50 === null || fin === null || fin.vendidas < VENTAS_PARA_JUZGAR_SOLA - EPS || fin.t <= 0 || fin.h <= EPS) return c;
  const lambda = fin.h / fin.t;
  const extender = (corte: number | null, queda: number): number | null =>
    corte !== null || fin.s <= queda + EPS ? corte : fin.t + Math.log(fin.s / queda) / lambda;
  return { p50: c.p50, p75: extender(c.p75, 0.25), p90: extender(c.p90, 0.1) };
}

/** El nivel de confianza por unidades vendidas CON EDAD CONOCIDA: 0 → null (no hay vara), 1-9, 10-19, 20 o más. */
export function nivelPorVentas(vendidas: number): NivelConfianza | null {
  if (vendidas <= 0) return null;
  if (vendidas < 10) return "pocos_datos";
  if (vendidas < VARA_MIN_VENDIDAS) return "aceptable";
  return "solido";
}

export function construirVara(observaciones: readonly Observacion[], ventanaDias: number): Vara {
  const curva = kaplanMeier(observaciones);
  return { ventanaDias, curva, cortes: cortes(curva), vendidas: curva.vendidas, nivel: nivelPorVentas(curva.vendidas) };
}

/** Una ventana alcanza con 20 vendidas con edad conocida Y los tres cortes. */
const alcanza = (v: Vara) => v.vendidas >= VARA_MIN_VENDIDAS - EPS && v.cortes.p50 !== null && v.cortes.p75 !== null && v.cortes.p90 !== null;

/**
 * La ventana de la vara: la más corta (30, 60, 90 o 120 días) con al menos 20 unidades vendidas con edad conocida Y los
 * tres cortes. Lo reciente manda cuando alcanza; si ninguna alcanza, la más larga. `varas` no puede venir vacío.
 */
export function elegirVentana(varas: readonly Vara[]): Vara {
  const orden = [...varas].sort((a, b) => a.ventanaDias - b.ventanaDias);
  if (orden.length === 0) throw new Error("elegirVentana necesita al menos una vara");
  return orden.find(alcanza) ?? orden[orden.length - 1];
}

/**
 * La misma regla de `elegirVentana` sobre `VENTANAS_VARA_DIAS`, pero arma cada ventana recién cuando la necesita: si la
 * de 30 días alcanza, las otras tres ni se calculan. Con mucha venta (donde cuesta) casi siempre alcanza la primera.
 */
export function varaPorVentanas(unidadesEn: (dias: number) => readonly Observacion[]): Vara {
  const calculadas: Vara[] = [];
  for (const d of VENTANAS_VARA_DIAS) {
    const vara = construirVara(unidadesEn(d), d);
    calculadas.push(vara);
    if (alcanza(vara)) break;
  }
  // Las de antes no alcanzaron: la regla elige la última calculada si alcanza y, si ninguna, la más larga.
  return elegirVentana(calculadas);
}

/** Un tramo y si es un piso («al menos»): la prenda ya pasó todo lo que la curva vio y falta el corte siguiente. */
export type TramoUbicado = { tramo: Tramo; alMenos: boolean };

/**
 * El tramo de una prenda con `segundos` en el piso, por los cortes de su categoría en su sede (en `analizarSede`, los
 * de su categoría SIN ella: `contraElResto`, D5):
 *   · sin P50 (su categoría no vendió ni la mitad): null, «aún sin referencia» (la pantalla muestra el % vendido a N
 *     días, ADR-0208 decisión 6). Sin esta regla, toda prenda con edad conocida de una categoría lenta salía «Nueva»
 *     (el reloj casi siempre queda antes de `tMax`), aunque llevara 60 días sin vender una (revisión 3).
 *   · con P50 pero sin P75 o P90: un corte que la curva no alcanza está MÁS ALLÁ de su observación más larga (`tMax`).
 *     Si la prenda está antes de eso, se sabe que no lo pasó: el tramo es exacto. Si ya pasó todo lo que la curva vio,
 *     igual se sabe que pasó el corte anterior: ese tramo, como piso («al menos Envejecida»). Antes era null, y la prenda
 *     más quieta de la categoría (la de la carga inicial, que siempre tiene el reloj más largo) desaparecía en «aún sin
 *     referencia» sin siquiera «revisa sus ventas» (revisión 4).
 * Las comparaciones llevan `TOL_SEGUNDOS`: el reloj de una prenda puede ser la misma exposición que la observación más
 * larga (otra prenda colgada en el mismo instante), calculada por otro camino, y en coma flotante quedar 1e-11 arriba
 * (revisión 4).
 */
export function tramoDe(segundos: number, c: Cortes, tMax: number): TramoUbicado | null {
  if (c.p50 === null) return null;
  const pasos: [Tramo, number | null][] = [
    ["nueva", c.p50],
    ["vigente", c.p75],
    ["envejecida", c.p90],
  ];
  for (const [tramo, corte] of pasos) {
    if (corte === null) return { tramo, alMenos: segundos > tMax + TOL_SEGUNDOS };
    if (segundos < corte - TOL_SEGUNDOS) return { tramo, alMenos: false };
  }
  return { tramo: "critica", alMenos: false };
}

// ---------------------------------------------------------------------------
// El reloj de novedad y la rapidez de una prenda
// ---------------------------------------------------------------------------

/** Lo que mide el reloj de una prenda: los eventos del piso de cada talla y, si hay, lo apartado de cada una. */
export type EntradaReloj = {
  eventosPorTalla: readonly (readonly EventoPiso[])[];
  /** Lo apartado del piso de cada talla (R7-1): resta de lo libre mientras dura. Sin esto, nada apartado. */
  apartadosPorTalla?: readonly (readonly PuntoApartado[])[];
  primeraExhibicion: string | null;
  desde: string;
  ahora: string;
};

/**
 * La línea del piso de una prenda: los tramos (milisegundos, `[inicio0, fin0, inicio1, fin1, …]`, de menor a mayor y sin
 * tocarse) en que tuvo algo LIBRE colgado —la suma de sus tallas en el piso, menos lo apartado, mayor que 0— entre
 * `desde` y `ahora`, y sus entradas en orden. De ella salen el reloj de novedad (la suma de los tramos) y sus últimos 30
 * días en el piso (R7-2): una sola línea, para que las dos preguntas no puedan medir el piso de dos maneras.
 */
export type LineaDelPiso = { tramos: number[]; entradas: { e: EventoPiso; t: number }[] };

function tramosColgada(p: EntradaReloj): LineaDelPiso {
  // La hora de cada evento se lee UNA vez (ordenar comparando textos de fecha la leía en cada comparación).
  const eventos = p.eventosPorTalla
    .flat()
    .map((e) => ({ e, t: ms(e.ts) }))
    .filter((x) => !Number.isNaN(x.t));
  const pasos: { t: number; delta: number }[] = eventos.map((x) => ({ t: x.t, delta: x.e.delta }));
  for (const lista of p.apartadosPorTalla ?? []) {
    for (const a of lista) {
      const t = ms(a.ts);
      if (!Number.isNaN(t)) pasos.push({ t, delta: a.delta });
    }
  }
  pasos.sort((a, b) => a.t - b.t);
  const desdeMs = ms(p.desde);
  const ahoraMs = ms(p.ahora);
  // En milisegundos enteros: sumar tramos ya divididos entre 1000 acumula error de coma flotante, y el reloj de la
  // prenda más vieja se compara con su propia exposición (`tramoDe`, revisión 4).
  const tramos: number[] = [];
  const abrir = (a: number, b: number) => {
    if (b <= a) return;
    if (tramos.length > 0 && tramos[tramos.length - 1] === a) tramos[tramos.length - 1] = b;
    else tramos.push(a, b);
  };
  let nivel = 0;
  let previo = desdeMs;
  for (const { t: cuando, delta } of pasos) {
    const t = Math.min(ahoraMs, Math.max(previo, cuando));
    if (nivel > 0) abrir(previo, t);
    nivel += delta;
    previo = t;
  }
  if (nivel > 0) abrir(previo, Math.max(previo, ahoraMs));
  eventos.sort((a, b) => a.t - b.t);
  return { tramos, entradas: eventos.filter((x) => x.e.delta > 0) };
}

/** Los segundos de unos tramos (una sola división al final). */
function segundosDe(tramos: readonly number[]): number {
  let milisegundos = 0;
  for (let i = 0; i < tramos.length; i += 2) milisegundos += tramos[i + 1] - tramos[i];
  return milisegundos / 1000;
}

/**
 * Desde qué instante (milisegundos) la prenda suma sus últimos `dias` días colgada, contando hacia atrás desde el final
 * de sus tramos; null si en toda la lectura no suma tantos (R7-2). Los días agotada, guardada o apartada no cuentan: el
 * éxito que se agotó hace 35 días y se repuso ayer tiene 1 día colgado desde ayer y los otros 29 antes de agotarse.
 */
export function inicioDeSusUltimosDias(tramos: readonly number[], dias: number): number | null {
  let falta = dias * MS_POR_DIA;
  for (let i = tramos.length - 2; i >= 0; i -= 2) {
    const largo = tramos[i + 1] - tramos[i];
    if (largo >= falta) return tramos[i + 1] - falta;
    falta -= largo;
  }
  return null;
}

/**
 * El reloj de novedad de una prenda (modelo+color) en la sede: los segundos con la SUMA de sus tallas LIBRE en el piso
 * > 0, desde su primera exhibición. Agotada, guardada en el almacén o apartada entera para una clienta no corre (R7-1:
 * lo apartado ya tiene dueña; una separación de semanas no envejece a la prenda); repuesta o liberada sigue desde donde
 * iba (nunca vuelve a «Nueva», ADR-0208 decisión 9). Se mide en tiempo continuo, no por días calendario (plan 3c,
 * corrección 3).
 *
 * `alMenos` cuando no se sabe desde cuándo está: la primera exhibición del modelo+color es anterior a la ventana
 * (`desde`), o lo primero que entró al piso tiene edad desconocida (saldo, carga inicial, ajuste: ADR-0248, decisión 3).
 * Sin primera exhibición (lo único que entró al piso se apartó en el mismo instante: el pedido de otra sede, revisión 9,
 * N3), «al menos» solo si algo de lo que entró tiene edad desconocida: lo que nunca se colgó puede ser «Nueva».
 * Una bajada tardía NO cuenta como edad desconocida: sus unidades salen de la vara (`excluirTardias`), pero la prenda sigue
 * pudiendo ser «Nueva». Antes del 3b una tardía también es «la clienta pidió otra talla y se la trajeron» o el fardo
 * nuevo que se vende a los 3 minutos: marcarla «al menos» dejaba sin «Nueva» para siempre justo a lo que mejor se vende
 * (revisión 3). Los eventos van SIN quitar las tardías: el reloj mide lo que el piso registró.
 * `linea`: la línea del piso de la prenda, si quien llama ya la armó (`analizarSede`, que la usa también para sus
 * últimos 30 días en el piso); si no, se arma aquí.
 */
export function relojNovedad(p: EntradaReloj, linea: LineaDelPiso = tramosColgada(p)): RelojNovedad {
  const segundos = segundosDe(linea.tramos);
  const { entradas } = linea;
  if (p.primeraExhibicion === null) return { segundos, alMenos: entradas.some((x) => x.e.edadDesconocida === true) };
  if (ms(p.primeraExhibicion) < ms(p.desde)) return { segundos, alMenos: true };
  const primera = entradas[0];
  const deLaPrimera = primera ? entradas.filter((x) => x.t === primera.t).map((x) => x.e) : [];
  const desconocida = deLaPrimera.some((e) => e.edadDesconocida === true);
  return { segundos, alMenos: desconocida };
}

/** Una tanda de unidades colgadas HOY de una talla, con los segundos que lleva colgada cada una. */
export type UnidadColgada = { segundos: number; unidades: number; edadDesconocida: boolean };

/**
 * Las unidades de una talla que están colgadas AHORA, cada tanda con los segundos que lleva en el piso: el FIFO de
 * `historiaDeCohortes` (ADR-0248), que no corre mientras la unidad está en el almacén o apartada y nunca se reinicia. Es
 * el reloj de la UNIDAD (ADR-0208, act. 2026-10-10 (b)): «un polo que lleva 8 días colgado». Lo que se guardó en el almacén
 * no está colgado y no sale; lo que entró sin fecha (carga inicial, ajuste, saldo de la ventana) sale con
 * `edadDesconocida`: su reloj es un piso, «al menos».
 * Límite de la convención del FIFO: retirar una prenda y volver a colgarla reanuda la cohorte pausada MÁS VIEJA, así que
 * lo que baja trae la edad de lo que se guardó antes. Esconder una prenda en el almacén no la rejuvenece.
 */
export function colgadasDe(eventos: readonly EventoPiso[], ahora: string): UnidadColgada[] {
  const ahoraMs = ms(ahora);
  const colgadas: UnidadColgada[] = [];
  for (const c of historiaDeCohortes(eventos).cohortes) {
    if (c.cantidadRestante <= 0 || c.abiertaDesde === null) continue;
    colgadas.push({
      segundos: c.segundosAcumulados + Math.max(0, ahoraMs - ms(c.abiertaDesde)) / 1000,
      unidades: c.cantidadRestante,
      edadDesconocida: c.edadDesconocida,
    });
  }
  return colgadas;
}

/**
 * El reloj de la unidad más vieja colgada de una prenda (todas sus tallas): lo que dice si «se está quedando». `alMenos`
 * si alguna unidad colgada entró sin fecha: la más vieja podría ser ella, y llevar más de lo que se ve. Sin nada colgado,
 * 0 segundos.
 */
export function relojDeLaUnidad(colgadas: readonly UnidadColgada[]): RelojNovedad {
  let segundos = 0;
  let alMenos = false;
  for (const u of colgadas) {
    if (u.unidades <= 0) continue;
    if (u.segundos > segundos) segundos = u.segundos;
    if (u.edadDesconocida) alMenos = true;
  }
  return { segundos, alMenos };
}

/**
 * El tramo con los DOS relojes (ADR-0208, act. 2026-10-10 (b)), contra los cortes de su categoría:
 *   · Fresca («nueva») lo dice el reloj del MODELO+COLOR: todavía no llegó a P50, el día en que su categoría vendió la mitad.
 *     Es novedad para el cliente que vuelve: reponer o volver de agotada no la hace fresca otra vez (ADR-0208, decisión 9).
 *   · Pasado P50, lo dice la unidad más vieja colgada: Vigente antes de P75, «envejecida» antes de P90, «crítica» después.
 *     La curva de la categoría es de UNIDADES (cuánto tarda cada una en venderse), así que se compara con una unidad: con el
 *     reloj del modelo, que nunca se reinicia, un modelo de 6 unidades que se repone de a una llegaba a «Hay que moverla»
 *     el 97 % de las veces vendiéndose al ritmo de su categoría (simulado, 2026-10-10).
 * Siempre `unidad ≤ modelo` (una unidad no puede llevar colgada más que su modelo), así que los tramos no se pisan. Lo que
 * falta de la curva se trata como en `tramoDe`: un corte que no alcanza queda después de `tMax`, y pasado eso el tramo es un
 * piso («al menos»). Con `unidad === modelo` es exactamente `tramoDe`.
 */
export function tramoDosRelojes(modelo: number, unidad: number, c: Cortes, tMax: number): TramoUbicado | null {
  if (c.p50 === null) return null;
  if (modelo < c.p50 - TOL_SEGUNDOS) return { tramo: "nueva", alMenos: false };
  const pasos: [Tramo, number | null][] = [
    ["vigente", c.p75],
    ["envejecida", c.p90],
  ];
  for (const [tramo, corte] of pasos) {
    if (corte === null) return { tramo, alMenos: unidad > tMax + TOL_SEGUNDOS };
    if (unidad < corte - TOL_SEGUNDOS) return { tramo, alMenos: false };
  }
  return { tramo: "critica", alMenos: false };
}

/** Su categoría SIN una prenda: contra qué se ubica su tramo y se mide su rapidez (revisión 3; D5, 2026-09-27). */
export type MedidaContraElResto = {
  cortes: Cortes;
  tMax: number;
  /** Ventas con edad conocida del resto (la evidencia de la rapidez: `Rapidez.referencia`). */
  vendidas: number;
  /** Σ peso × riesgo acumulado del resto en los segundos de cada unidad de `suyas`: lo que la rapidez espera. */
  esperadas: number;
  /** El último instante con venta del resto (de ahí sale la cola de sus cortes). */
  fin: FinDeCurva | null;
};

/**
 * Su categoría SIN las unidades de una prenda: contra qué se miden su rapidez y su tramo.
 *   · La rapidez (revisión 3): con la prenda adentro se compara contra sí misma. Sumar el riesgo acumulado de cada unidad
 *     en su tiempo de salida da exactamente lo vendido (Nelson-Aalen), así que la única prenda de su categoría tenía
 *     índice 100 siempre y nunca quedaba «quieta», aunque fuera Crítica.
 *   · El tramo (D5, 2026-09-27): con la prenda adentro, sus unidades sin vender sostienen la curva. El pantalón de 70
 *     días con 0 de 3 vendidas llevaba el P50 de su categoría de 10 a 30 días y borraba el P75: salía «Vigente» y nunca
 *     llegaba a «Por decidir». La cabecera de la categoría sigue mostrando la curva completa (`VaraCategoria`).
 * `curva` es la de la categoría CON la prenda (como la arma la vara); `propias`, las unidades con que la prenda está en
 * ella (se restan); `suyas`, aquellas en que se mide su rapidez (toda la lectura). Se resta instante por instante sobre la
 * curva acumulada de la categoría, sin volver a ordenarla ni guardar la curva del resto: es lo mismo que `kaplanMeier`
 * sobre el resto (la prueba lo compara en 400 categorías al azar), en una pasada por los instantes con venta de la
 * categoría. `analizarSede` lo llama una vez por prenda: rearmando o guardando la curva del resto por prenda, una sede de
 * 2.000 tallas en una sola categoría con 6.600 ventas tardaba 372 ms en la web (antes de D5, 191; así, ~155).
 */
export function contraElResto(curva: Curva, propias: readonly Observacion[], suyas: readonly Observacion[]): MedidaContraElResto {
  return restar(curva, propias, suyas);
}

/** Las observaciones que cuentan (peso positivo, segundos finitos), de menor a mayor. */
function ordenadas(obs: readonly Observacion[]): Observacion[] {
  return obs.filter((o) => o.peso > 0 && Number.isFinite(o.segundos)).sort((a, b) => a.segundos - b.segundos);
}

/**
 * LA resta: una pasada por los instantes con venta de la categoría, quitándole a cada uno lo que era de la prenda (sus
 * ventas en ese instante y sus unidades todavía en riesgo). En la misma pasada, los cortes del resto (su supervivencia no
 * sube: el primer instante que cruza cada umbral) y el riesgo acumulado en los segundos de cada unidad de `consultas`
 * (cada una espera el del último instante con venta que no pasa de sus segundos). Sin llamadas ni arreglos por instante:
 * es lo que corre miles de veces por sede.
 */
function restar(curva: Curva, propias: readonly Observacion[], consultas: readonly Observacion[]): MedidaContraElResto {
  const mias = ordenadas(propias);
  // Si la ventana de la vara cubre toda la lectura, las unidades que se restan y las que se miden son las mismas.
  const cons = consultas === propias ? mias : ordenadas(consultas);
  const { tiempos, vendidasEn, enRiesgo } = curva;
  const T = tiempos.length;
  let misEnRiesgo = 0;
  for (const o of mias) misEnRiesgo += o.peso;
  let h = 0;
  let s = 1;
  let vendidasResto = 0;
  let esperadas = 0;
  let tUltima = 0;
  // Los cortes se cruzan en orden (la supervivencia no sube): el que falta es `umbral`.
  const umbrales = [0.5 + EPS, 0.25 + EPS, 0.1 + EPS, -Infinity];
  const cortesHallados: (number | null)[] = [null, null, null];
  let u = 0;
  let umbral = umbrales[0];
  // Los segundos y el peso de cada consulta, en arreglos planos (el lazo los lee en cada instante).
  const nc = cons.length;
  const consT = new Float64Array(nc);
  const consP = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    consT[c] = cons[c].segundos;
    consP[c] = cons[c].peso;
  }
  let proxima = nc > 0 ? consT[0] : Infinity;
  let q = 0;
  let i = 0;
  let j = 0;
  // Por tramos entre los instantes propios: dentro de cada tramo lo suyo en riesgo es fijo y no vende (el lazo más
  // corto posible, sin mirar sus unidades en cada instante); en el instante de una unidad propia, se le restan sus ventas.
  while (i < T) {
    const g = j < mias.length ? mias[j].segundos : Infinity;
    let misVendidas = 0;
    let fin = i;
    while (fin < T && tiempos[fin] < g) fin++;
    const hasta = fin < T && tiempos[fin] === g ? fin + 1 : fin;
    if (hasta > fin) for (let k = j; k < mias.length && mias[k].segundos === g; k++) if (mias[k].vendida) misVendidas += mias[k].peso;
    for (; i < hasta; i++) {
      const vendidas = i === fin ? vendidasEn[i] - misVendidas : vendidasEn[i];
      const riesgo = enRiesgo[i] - misEnRiesgo;
      if (!(vendidas > EPS && riesgo > EPS)) continue;
      const t = tiempos[i];
      while (proxima < t) {
        esperadas += consP[q++] * h;
        proxima = q < nc ? consT[q] : Infinity;
      }
      const tasa = vendidas / riesgo;
      h += tasa;
      s *= 1 - tasa;
      vendidasResto += vendidas;
      tUltima = t;
      while (s <= umbral) {
        cortesHallados[u++] = t;
        umbral = umbrales[u];
      }
    }
    // Las unidades propias de este instante salen del riesgo después de él.
    while (j < mias.length && mias[j].segundos <= g) misEnRiesgo -= mias[j++].peso;
    if (g === Infinity) break;
  }
  // Una unidad más vieja que la última venta del resto espera lo acumulado hasta ahí MÁS la cola: seguir vendiendo a su ritmo promedio
  // (λ = H/t; el mismo supuesto que `cortesConCola`). Antes el riesgo quedaba plano y a una unidad de 100 días se le esperaba lo de 30: su
  // índice salía inflado hacia «pilar». Con pocas ventas del resto, sin cola (el ritmo sería ruido).
  const cola = vendidasResto >= VENTAS_PARA_JUZGAR_SOLA - EPS && tUltima > 0 ? h / tUltima : 0;
  while (q < nc) {
    esperadas += consP[q] * (h + cola * Math.max(0, consT[q] - tUltima));
    q++;
  }
  const [p50, p75, p90] = cortesHallados;
  const fin: FinDeCurva | null = vendidasResto > EPS ? { t: tUltima, s, h, vendidas: vendidasResto } : null;
  return { cortes: cortesConCola({ p50, p75, p90 }, fin), tMax: tMaxSin(curva, mias), vendidas: vendidasResto, esperadas, fin };
}

/** La observación más larga del resto: el último instante observado al que le queda algo que no es de la prenda. */
function tMaxSin(curva: Curva, mias: readonly Observacion[]): number {
  let k = mias.length - 1;
  for (let i = curva.tiemposObservados.length - 1; i >= 0; i--) {
    const t = curva.tiemposObservados[i];
    while (k >= 0 && mias[k].segundos > t) k--;
    let mio = 0;
    for (let q = k; q >= 0 && mias[q].segundos === t; q--) mio += mias[q].peso;
    if (curva.pesosObservados[i] - mio > EPS) return t;
  }
  return 0;
}

/**
 * La rapidez de una prenda contra su categoría A LA MISMA EDAD: cuántas vendió (`vendidas`) contra cuántas habría vendido
 * una prenda típica de su categoría con los mismos segundos colgada (`esperadas`: Σ del riesgo acumulado de su categoría
 * SIN ella en los segundos de cada una de sus unidades, `contraElResto`). 100 = igual; 200 = el doble de rápido. Solo
 * unidades con edad conocida. `referencia`: las ventas del resto contra las que se midió.
 * Con ella adentro se compararía contra sí misma. Sus unidades son las de TODA la lectura (120 días), no las recortadas
 * a la ventana de la vara (hallazgo 1 de la revisión 5):
 * el recorte convertía en «edad desconocida» lo que ya estaba colgado al empezar la ventana, y la prenda colgada 100 días
 * sin vender en una vara de 30 salía «sin dato» en vez de lenta. ADR-0248 solo reconoce como desconocido el saldo con que
 * arranca la LECTURA, la carga inicial y los ajustes. Una unidad más vieja que todo lo que la curva vio espera lo que la
 * curva acumuló hasta su final (el riesgo acumulado no baja).
 * Null («sin dato») con menos de `RAPIDEZ_MIN_EVIDENCIA` entre vendidas y esperadas, o si el resto de su categoría no
 * vendió nada a esas edades (no hay contra qué medirla): una prenda recién colgada que no vendió todavía no es «lenta»,
 * es «sin dato» (plan 3c, corrección 4), y la única de su categoría tampoco es «pilar».
 * Si alguna venta de lo que tiene edad desconocida pudo esconderle ventas a lo que sí la tiene (`ventasSinEdad`, de
 * `ventasQueEsconden`: las hechas desde que la prenda colgó lo primero con edad conocida), se mide DOS veces: sin
 * contarlas (lo que se sabe) y contándolas como vendidas de lo conocido (lo que podría ser). Si las dos dicen lo mismo
 * (las dos pilar o las dos lentas), vale la primera; si no, null («sin dato»). El FIFO le da las ventas a la cohorte más
 * vieja, así que la talla de la carga inicial que se repone vende lo de la carga y lo repuesto parece sin vender: medida
 * solo con lo repuesto salía 0, «lenta», y el éxito que vino en la carga iba a «Por decidir» con «Trasladar» (revisión 4,
 * las gemelas K y U: 125 contra 0; con las dos cuentas siguen sin dato). Antes, CUALQUIER venta así dejaba sin dato la
 * lectura entera: una sola devolución revendida le quitaba la rapidez 120 días a un éxito del lote, y con la temporada
 * pasada le daba «cambiar de lugar» y «retirar» en vez de «sigue vendiendo» (R7-3). Las ventas de una carga que se agotó
 * ANTES de que llegara lo repuesto ni se cuentan (revisión 6).
 */
export function rapidez(vendidas: number, esperadas: number, referencia: number, ventasSinEdad = 0): Rapidez | null {
  const r = medirRapidez(vendidas, esperadas, referencia);
  if (ventasSinEdad <= 0 || r === null) return r;
  const conEllas = medirRapidez(vendidas + ventasSinEdad, esperadas, referencia);
  return conEllas !== null && (conEllas.indice >= RAPIDEZ_IGUAL) === (r.indice >= RAPIDEZ_IGUAL) ? r : null;
}

/** Vendidas contra esperadas, sin mirar ventas escondidas. Null sin evidencia o sin contra qué medirla. */
function medirRapidez(vendidas: number, esperadas: number, referencia: number): Rapidez | null {
  // Sin esperadas no hay contra qué medirla: el resto de su categoría no vendió nada a esas edades.
  if (vendidas + esperadas < RAPIDEZ_MIN_EVIDENCIA || esperadas <= EPS) return null;
  return { indice: Math.round((vendidas / esperadas) * 100), vendidas, esperadas: Math.round(esperadas * 100) / 100, referencia };
}

/** Unidades vendidas (con su peso) de unas observaciones. */
export function vendidasDe(observaciones: readonly Observacion[]): number {
  let n = 0;
  for (const o of observaciones) if (o.peso > 0 && o.vendida) n += o.peso;
  return n;
}

/**
 * Un pilar de venta: se vende como su categoría o más rápido, a la misma edad, Y se sigue vendiendo. Nunca va al
 * perchero por vieja. El índice cuenta toda la lectura (120 días): el éxito que vendió 14 de 20 en sus 3 primeros días y
 * después nada (le quedaron tallas sueltas) seguía «más rápido que su categoría» los 120 días. Por eso deja de ser pilar
 * si sus últimos 30 días en el piso pasaron sin una venta (`dejo_de_vender`, revisión 6; era el «SE ROMPE SI» de D2):
 * entonces es lenta. Días en el piso, no de calendario (R7-2): agotado no podía vender.
 */
export function esPilar(r: Rapidez | null, recientes: Recientes): boolean {
  return r !== null && r.indice >= RAPIDEZ_IGUAL && recientes !== "dejo_de_vender";
}

/**
 * `Recientes` a partir de las ventas del modelo+color en sus últimos `DIAS_CALLADA` días en el piso y sus segundos
 * colgada en la lectura: sin ventas, «dejó de vender» solo si la lectura la tiene colgada esos días (R7-2). Exportada
 * para la pantalla (paso 4): «dejó de venderse» y «30 días sin vender» se dicen con ESTA definición, no con otra.
 */
export function recientesDe(ventasRecientes: number | null, segundosColgada: number): Recientes {
  if (ventasRecientes === null) return "no_se_sabe";
  if (ventasRecientes > 0) return "vendio";
  return segundosColgada >= DIAS_CALLADA * 86_400 - TOL_SEGUNDOS ? "dejo_de_vender" : "no_se_sabe";
}

/**
 * El cuantil de una Gamma(forma a, tasa b) por la aproximación de Wilson-Hilferty (la Gamma elevada a 1/3 es casi normal). Con a ≥ 1 el
 * error es de centésimas, de sobra para decir de qué lado de un umbral cae. Lo usan «lenta» (aquí) y la acogida (`frescura-aguja.ts`).
 */
export function cuantilGamma(a: number, b: number, z: number): number {
  const c = 1 / (9 * a);
  return (a / b) * Math.max(0, 1 - c + z * Math.sqrt(c)) ** 3;
}

/**
 * Cuánta evidencia hace falta para llamar «lenta» a una prenda (ADR-0208, act. 2026-10-10 (b)). Su rapidez se contrae hacia 1 como si
 * llevara `PRIOR_LENTA` ventas de su categoría —Gamma(3 + vendidas, 3 + esperadas)— y se mira su cota de 9 de cada 10. Dos escalones,
 * según lo que cuesta equivocarse:
 *   · LENTA (`COTA_LENTA`, 1): con 9 de cada 10 de confianza vende más lento que su categoría. Basta para «Por decidir» y «cambiar de
 *     lugar», que es barato: una prenda que se vende como las demás sale lenta 1 de cada 10 veces. Antes bastaba vender menos que lo esperado
 *     con 2 esperadas o más: con 2, «lenta» es vender 0 o 1, y salía lenta el 41 % de las veces (no «1 de 7», como decía este comentario:
 *     e⁻²·(1 + 2)); con el volumen de TRU, unas 33 falsas «Por decidir» por semana contra 14 de verdad.
 *   · MUY LENTA (`COTA_LENTA_FUERTE`, 0,7): con 9 de cada 10 de confianza vende menos de 7 de cada 10 de lo que su categoría. La pide
 *     «Trasladar», que mueve mercadería entre tiendas (simulado: de 31 % a 80 % de acierto).
 */
export const PRIOR_LENTA = 3;
export const COTA_LENTA = 1;
export const COTA_LENTA_FUERTE = 0.7;
const Z90 = 1.2816;

/**
 * La rapidez que puede decidir: la misma, o null si dice «lenta» (índice < 100) sin la evidencia de arriba. Con poca evidencia el índice
 * solo PROTEGE (un pilar con 0,5 esperadas sigue siendo pilar: no se actúa), nunca CONDENA: un pilar falso no cuesta nada, una lenta falsa
 * manda a mover una prenda que se vende. La que dejó de vender (`dejo_de_vender`: sus últimos 30 días en el piso sin una venta) pasa
 * entera: esos 30 días son evidencia por sí solos, y es lo que la revisión 6 ya decidía. Con null, `estaQuieta` no la llama lenta y
 * `sugerenciasDe` le da «revisa sus ventas» si es vieja, como a la que no tiene dato.
 */
export function rapidezParaDecidir(r: Rapidez | null, recientes: Recientes): Rapidez | null {
  if (r === null || recientes === "dejo_de_vender" || r.indice >= RAPIDEZ_IGUAL) return r;
  return esLentaConEvidencia(r) ? r : null;
}

/** Su rapidez, contraída, queda bajo `cota` con 9 de cada 10 de confianza (`COTA_LENTA` o, para mover mercadería, `COTA_LENTA_FUERTE`). */
export function esLentaConEvidencia(r: Pick<Rapidez, "vendidas" | "esperadas">, cota: number = COTA_LENTA): boolean {
  return cuantilGamma(PRIOR_LENTA + r.vendidas, PRIOR_LENTA + r.esperadas, Z90) < cota;
}

// ---------------------------------------------------------------------------
// Quieta, sugerencias y estado
// ---------------------------------------------------------------------------

/**
 * «Por decidir»: la prenda está en el piso y su temporada ya pasó, o es (Envejecida o Crítica) Y más lenta que su
 * categoría (ADR-0208, plan 3c: «vieja y lenta», no solo «vieja»). Sin dato de rapidez no es «lenta»: una prenda de la
 * carga inicial que se vende bien no va al perchero por falta de dato.
 * Un pilar de venta no entra por vieja, pero SÍ por su temporada pasada (D2, Felipe 2026-09-27): el bikini que se sigue
 * vendiendo después del 20 de marzo es una decisión del líder (dejarlo hasta agotar o retirarlo), y lo que no se decide
 * no aparece. Su sugerencia es otra (`sigue_vendiendo`, ver `sugerenciasDe`), nunca «trasladar» ni «rebajar».
 * Con dato de rapidez, una prenda es pilar o lenta: la que dejó de venderse (`esPilar`) es lenta aunque su índice de
 * toda la lectura pase de 100.
 */
export function estaQuieta(p: { tramo: Tramo | null; temporadaPasada: boolean; rapidez: Rapidez | null; recientes: Recientes; pisoHoy: number }): boolean {
  if (p.pisoHoy <= 0) return false;
  if (p.temporadaPasada) return true;
  if (esPilar(p.rapidez, p.recientes)) return false;
  const vieja = p.tramo === "envejecida" || p.tramo === "critica";
  const lenta = p.rapidez !== null;
  return vieja && lenta;
}

/**
 * «Trasladar» mueve mercadería entre sedes (ADR-0208, bloque 3, decisión 5: «lo que mueve plata espera el Sólido»): solo
 * con una vara «Sólido», algo en el almacén y dato de rapidez, Y con «Sólido» en la referencia que de verdad midió su
 * rapidez (20 o más ventas del RESTO de su categoría). La vara cuenta las ventas de la propia prenda: la falda que es 28
 * de las 30 ventas de su categoría tenía vara «Sólido» y se medía contra 2 (revisión 4).
 */
export function puedeTrasladar(p: { nivel: NivelConfianza | null; almacenHoy: number; rapidez: Rapidez | null }): boolean {
  return (
    p.nivel === "solido" &&
    p.almacenHoy > 0 &&
    p.rapidez !== null &&
    nivelPorVentas(p.rapidez.referencia) === "solido" &&
    // Mueve mercadería: además de lenta, muy lenta con evidencia (act. 2026-10-10 (b)).
    (p.rapidez.indice >= RAPIDEZ_IGUAL || esLentaConEvidencia(p.rapidez, COTA_LENTA_FUERTE))
  );
}

/**
 * Lo que se sugiere, en el orden de la escalera de ADR-0208 (decisión 11) sin su último escalón: primero mirar, después
 * cambiarla de lugar 7 días, después trasladarla; con la temporada pasada y algo en el piso, además retirarla (ADR-0246,
 * decisión 10: «al terminar su estación, Frescura avisa y sugiere»). La rebaja no se sugiere nunca aquí.
 *   · Un pilar de venta de temporada pasada recibe SOLO «sigue vendiendo: decide si la dejas hasta agotar o la retiras»
 *     (D2, Felipe 2026-09-27): cambiarla de lugar o trasladarla no tiene sentido para lo que se vende, y «retirar» a
 *     secas era una orden donde hay una decisión. Un pilar que dejó de venderse ya no lo es (`esPilar`, revisión 6).
 *     Lo que no tiene dato de rapidez (lo que vino en la carga inicial) y vendió en sus últimos 30 días en el piso
 *     (`recientes = vendio`) recibe lo mismo que su gemelo con dato (DECIDIDO por Felipe el 2026-09-28, pregunta 8 de la
 *     revisión 6): sin índice no se sabe si vende «bien», y Felipe aceptó pagar eso (la chompa que vendió 1 de 4 en 42
 *     días también dice «sigue vendiendo») antes que darle «cambiar de lugar» y «retirar» a un éxito de la carga.
 *   · `callada` (D4+D6): sin tramo firme y sus últimos 30 días en el piso sin ninguna venta. Recibe «revisa sus ventas»
 *     con o sin dato de rapidez: nunca queda una prenda quieta sin ninguna pista.
 */
export function sugerenciasDe(p: {
  quieta: boolean;
  tramo: Tramo | null;
  temporadaPasada: boolean;
  fueraDeSuEstacion: boolean;
  rapidez: Rapidez | null;
  recientes: Recientes;
  nivel: NivelConfianza | null;
  pisoHoy: number;
  almacenHoy: number;
  callada: boolean;
}): Sugerencia[] {
  const s: Sugerencia[] = [];
  if (p.fueraDeSuEstacion && p.pisoHoy > 0) s.push("guardar_hasta_su_estacion");
  const sigueVendiendo = esPilar(p.rapidez, p.recientes) || (p.rapidez === null && p.recientes === "vendio");
  if (p.temporadaPasada && p.pisoHoy > 0 && sigueVendiendo) {
    s.push("sigue_vendiendo");
    return s;
  }
  const vieja = p.tramo === "envejecida" || p.tramo === "critica";
  if ((p.rapidez === null && (p.quieta || (vieja && p.pisoHoy > 0))) || p.callada) s.push("revisar_ventas");
  if (p.quieta) {
    s.push("cambiar_lugar");
    if (puedeTrasladar(p)) s.push("trasladar");
  }
  if (p.temporadaPasada && p.pisoHoy > 0) s.push("retirar");
  return s;
}

export type EntradaEstado = {
  dudosa: boolean;
  esClasico: boolean;
  temporada: string | null;
  finEstacion: string | null;
  enEstacionAhora: boolean | null;
  ahora: string;
  /** Contra qué se ubica: el nivel de la vara de su categoría (cuántas ventas la forman) y los cortes y la observación
   *  más larga de su categoría SIN ella (`contraElResto`, D5). */
  vara: Pick<Vara, "cortes" | "nivel"> & { curva: Pick<Curva, "tMax"> };
  /** El reloj del modelo+color: dice si todavía es Fresca (`tramoDosRelojes`). */
  reloj: RelojNovedad;
  /** El reloj de su unidad más vieja colgada (`relojDeLaUnidad`): dice, pasada la mitad, si se está quedando. Sin él, la
   *  unidad más vieja lleva lo mismo que su modelo (una sola tanda colgada desde el principio, sin reponer). */
  relojUnidad?: RelojNovedad;
  rapidez: Rapidez | null;
  pisoHoy: number;
  almacenHoy: number;
  /** Unidades de su modelo+color vendidas (o apartadas para una clienta: revisión 8) en la sede en sus últimos
   *  `DIAS_CALLADA` días en el piso (con menos días colgada en la lectura, en todos los que tiene); null si quien llama
   *  no lo sabe. Dicen si se sigue vendiendo
   *  (`Recientes`): el pilar y la callada. */
  ventasRecientes: number | null;
};

/** «Temporada pasada»: terminó la estación de su última llegada. Nunca para un clásico ni para lo que no tiene temporada. */
export function esTemporadaPasada(p: { esClasico: boolean; temporada: string | null; finEstacion: string | null; ahora: string }): boolean {
  return !p.esClasico && p.temporada !== null && p.finEstacion !== null && ms(p.finEstacion) <= ms(p.ahora);
}

export function estadoFrescura(e: EntradaEstado): EstadoFrescura {
  const temporadaPasada = esTemporadaPasada(e);
  const sinTemporada = e.temporada === null;
  const recientes = recientesDe(e.ventasRecientes, e.reloj.segundos);
  // La rapidez que decide: ni la del clásico ni la de la dudosa (tienen su propio estado), ni la que descansa en menos de
  // 2 ventas esperadas (`rapidezParaDecidir`). La cruda se sigue mostrando en la fila y en la hoja.
  const rapidezUsable = e.dudosa || e.esClasico ? null : rapidezParaDecidir(e.rapidez, recientes);
  let tramo: Tramo | null = null;
  let base:
    | { tipo: "semaforo"; tramo: Tramo; alMenos: boolean }
    | { tipo: "sin_ventas_sede" }
    | { tipo: "sin_vara" }
    | { tipo: "sin_edad_conocida" }
    | { tipo: "clasico"; fueraDeSuEstacion: boolean }
    | { tipo: "dudosa" };
  if (e.dudosa) base = { tipo: "dudosa" };
  else if (e.esClasico) base = { tipo: "clasico", fueraDeSuEstacion: e.enEstacionAhora === false };
  else if (e.vara.nivel === null) base = { tipo: "sin_ventas_sede" };
  else {
    const unidad = e.relojUnidad ?? e.reloj;
    const t = tramoDosRelojes(e.reloj.segundos, unidad.segundos, e.vara.cortes, e.vara.curva.tMax);
    if (t === null) base = { tipo: "sin_vara" };
    else if (t.tramo === "nueva" && e.reloj.alMenos) base = { tipo: "sin_edad_conocida" };
    else {
      // Fresca es exacta (su modelo no llega a P50). Pasada la mitad, el tramo es un piso si el reloj que lo decide —el de la
      // unidad— lo es, o si la curva no llega hasta él.
      base = { tipo: "semaforo", tramo: t.tramo, alMenos: t.tramo !== "nueva" && (unidad.alMenos || t.alMenos) };
      tramo = t.tramo;
    }
  }
  const quieta = estaQuieta({ tramo, temporadaPasada, rapidez: rapidezUsable, recientes, pisoHoy: e.pisoHoy });
  // D4+D6: sin tramo firme (sin referencia, sin ventas en la sede, sin edad conocida o un tramo que es solo un piso),
  // y sus últimos 30 días en el piso sin ninguna venta. Ni el clásico ni la dudosa: tienen su propio estado.
  const sinTramoFirme =
    base.tipo === "sin_ventas_sede" || base.tipo === "sin_vara" || base.tipo === "sin_edad_conocida" || (base.tipo === "semaforo" && base.alMenos);
  const callada = sinTramoFirme && e.pisoHoy > 0 && recientes === "dejo_de_vender";
  const sugerencias = sugerenciasDe({
    quieta,
    tramo,
    temporadaPasada,
    fueraDeSuEstacion: base.tipo === "clasico" && base.fueraDeSuEstacion,
    rapidez: rapidezUsable,
    recientes,
    nivel: e.vara.nivel,
    pisoHoy: e.pisoHoy,
    almacenHoy: e.almacenHoy,
    callada,
  });
  return { ...base, temporadaPasada, sinTemporada, quieta, sugerencias };
}

/**
 * La lectura de una sede COMO ERA en `cuando` (ADR-0208, act. 2026-10-10 (b): comparar el piso con el de hace 4 semanas sin guardar fotos):
 * el libro y lo apartado hasta ese instante, `ahora` en ese instante y, de cada talla, lo libre en el piso que salía del libro entonces
 * (el nivel menos lo apartado en el piso). Lo que no se puede saber de entonces queda neutro: el almacén en 0 (solo lo usa «Trasladar») y
 * la primera exhibición borrada si fue después. Límite: la temporada y las llegadas son las de hoy (no cambian lo que pinta la barra).
 */
export function lecturaAl(l: LecturaFrescuraConPiso, cuando: string): LecturaFrescuraConPiso {
  const t = ms(cuando);
  const hasta = <T extends { ts: string }>(lista: readonly T[] | undefined): T[] => (lista ?? []).filter((x) => ms(x.ts) <= t);
  const eventos: Record<string, EventoPiso[]> = {};
  for (const [id, lista] of Object.entries(l.eventos)) eventos[id] = hasta(lista);
  const apartados: Record<string, PuntoApartado[]> = {};
  for (const [id, lista] of Object.entries(l.apartados ?? {})) apartados[id] = hasta(lista);
  const tallas = l.tallas.map((talla): TallaFrescuraCruda => {
    const nivel = Math.max(0, (eventos[talla.varianteId] ?? []).reduce((s, e) => s + e.delta, 0));
    const apartadoPiso = Math.min(nivel, Math.max(0, -(apartados[talla.varianteId] ?? []).reduce((s, a) => s + a.delta, 0)));
    const primera = talla.primeraExhibicion !== null && ms(talla.primeraExhibicion) <= t ? talla.primeraExhibicion : null;
    return { ...talla, pisoHoy: nivel - apartadoPiso, almacenHoy: 0, apartadasHoy: apartadoPiso, apartadasPisoHoy: apartadoPiso, primeraExhibicion: primera };
  });
  return {
    ...l,
    ahora: cuando,
    tallas,
    eventos,
    apartados,
    tardias: l.tardias.filter((x) => x.bajadaEn !== "" && ms(x.bajadaEn) <= t),
    cuadres: (l.cuadres ?? []).filter((c) => ms(c) <= t),
  };
}

// ---------------------------------------------------------------------------
// Una sede entera
// ---------------------------------------------------------------------------

/** La vara de una categoría en una sede (o en CAYLA), lista para la pantalla: sin la curva entera. */
export type VaraCategoria = {
  categoriaId: string;
  categoriaNombre: string;
  ventanaDias: number;
  cortes: Cortes;
  /** La observación más larga de la curva: «aún sin referencia» se dice con el % vendido a estos segundos. */
  tMax: number;
  /** Fracción vendida a `tMax` (0 a 1). */
  vendidoAlFinal: number;
  vendidas: number;
  unidades: number;
  nivel: NivelConfianza | null;
  /** La vara de CAYLA de esta categoría (ADR-0208, act. 2026-10-07), si el cron la calculó y sigue vigente; `enUso` cuando
   *  las prendas de la categoría se juzgaron contra ella (la tienda no llega a `VENTAS_PARA_JUZGAR_SOLA`). */
  respaldo: RespaldoCategoria | null;
  /** La vara del mes (ADR-0208, act. 2026-10-10 (b)): la curva de la categoría en la tienda con lo ocurrido hasta el día 1,
   *  congelada todo el mes; `enUso` cuando llega a `VENTAS_PARA_JUZGAR_SOLA` ventas y sus prendas se juzgaron contra ella. La
   *  vara de arriba (`cortes`, `ventanaDias`…) sigue siendo la de HOY: las dos juntas dicen si la categoría se puso más lenta.
   *  Null cuando quien analizó no pidió la vara del mes (el cron de CAYLA). */
  delMes: VaraDelMesCategoria | null;
};

/**
 * La vara que JUZGÓ a la categoría (la que decide Fresca · Vigente · Envejeciendo de sus prendas): la del mes si llegó a sus ventas, si no la
 * de CAYLA si se usó de respaldo, y si no la de hoy. Una sola definición para la pantalla y la aguja (Formidable 2026-10-10 (c): la ayuda
 * dibujaba la escala de hoy mientras las prendas se juzgaban con la del mes, y la encargada vio dos escalas para la misma categoría).
 */
export function varaQueJuzgo(v: VaraCategoria): { cortes: Cortes; ventanaDias: number; vendidas: number; cual: "mes" | "cayla" | "hoy" } {
  if (v.delMes?.enUso) return { cortes: v.delMes.cortes, ventanaDias: v.delMes.ventanaDias, vendidas: v.delMes.vendidas, cual: "mes" };
  if (v.respaldo?.enUso) return { cortes: v.respaldo.cortes, ventanaDias: v.respaldo.ventanaDias, vendidas: v.respaldo.vendidas, cual: "cayla" };
  return { cortes: v.cortes, ventanaDias: v.ventanaDias, vendidas: v.vendidas, cual: "hoy" };
}

/** La vara de CAYLA de una categoría, para la pantalla: la misma forma que la de la tienda, más cuándo se calculó y si decidió. */
export type RespaldoCategoria = Omit<VaraCategoria, "respaldo" | "delMes"> & { calculadaEn: string; enUso: boolean };

/** La vara del mes de una categoría, para la pantalla: la misma forma que la de hoy, más su corte y si decidió. */
export type VaraDelMesCategoria = Omit<VaraCategoria, "respaldo" | "delMes"> & { corte: string; enUso: boolean };

/**
 * Ventas con edad conocida que necesita una categoría EN LA TIENDA para juzgar sus prendas sola (ADR-0208, actualización
 * 2026-10-07, decisión 2 de Felipe). Con menos, y con esta cifra o más en CAYLA, el tramo y la rapidez se miden contra la
 * curva de las tres tiendas (`RespaldoCayla`) y la fila lo dice. Es el corte de «Pocos datos» de `nivelPorVentas`: con 3
 * ventas rápidas, P50 = 1 día y P75 = 2, y una prenda de 4 días salía «Se está quedando» (verificado el 2026-10-07).
 */
export const VENTAS_PARA_JUZGAR_SOLA = 10;

/** La vara de CAYLA de una categoría como respaldo: la curva con las unidades de las tres tiendas (`frescura_vara_cayla`,
 *  rearmada con `kaplanMeier`), su ventana, sus ventas, su nivel y cuándo la calculó el cron. */
export type VaraRespaldo = { curva: Curva; ventanaDias: number; vendidas: number; nivel: NivelConfianza | null; calculadaEn: string };
/** categoriaId → su vara de CAYLA, solo las vigentes (`leerRespaldoCayla` en `frescura-vara-cayla.ts` las filtra). */
export type RespaldoCayla = ReadonlyMap<string, VaraRespaldo>;

export type FrescuraPrenda = {
  clave: string;
  productoId: string;
  productoNombre: string;
  codigo: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  categoriaId: string;
  categoriaNombre: string;
  tallas: {
    varianteId: string;
    talla: string | null;
    pisoHoy: number;
    almacenHoy: number;
    apartadasHoy: number;
    apartadasPisoHoy: number;
    /** Lo colgado hoy de esta talla, cada tanda con sus segundos (`colgadasDe`): lo que cuenta la barra del piso, unidad por
     *  unidad (ADR-0208, act. 2026-10-10 (b)). Vacío para la clásica y la que no cuadra, que no se juzgan. Sin las unidades que
     *  apartó lo vendido sin registrar (`dudadas`). */
    colgadas: UnidadColgada[];
    /** Unidades colgadas que puede ser que ya se vendieron sin registrar (una venta anotada en caja de su categoría, talla y color):
     *  no se juzgan y van a «Aún no se sabe» (ADR-0208, act. 2026-10-10 (c)). */
    dudadas?: number;
  }[];
  /** Lo libre en el piso y en el almacén (sin lo apartado: R7-1). */
  pisoHoy: number;
  almacenHoy: number;
  /** Lo apartado para clientas (piso y almacén). Con el piso entero apartado, `pisoHoy` es 0: no envejece ni recibe
   *  sugerencias, y la pantalla la muestra como apartada. */
  apartadasHoy: number;
  /** De lo apartado, lo del PISO (paso 4): «apartada» solo si hay algo aquí; si todo lo apartado está en el almacén, la
   *  prenda está guardada. */
  apartadasPisoHoy: number;
  /** El reloj del modelo+color en la sede: la novedad (si todavía es Fresca). */
  reloj: RelojNovedad;
  /** El reloj de su unidad más vieja colgada hoy: si se está quedando (ADR-0208, act. 2026-10-10 (b)). Sin nada colgado, 0. */
  relojUnidad: RelojNovedad;
  primeraExhibicion: string | null;
  /** La última llegada de cualquiera de sus tallas a ESTA sede (incluye la recepción de un traslado). */
  ultimaLlegada: string | null;
  /** La llegada de su modelo+color A CAYLA que manda (la última por lote o producción; sin ninguna, la primera carga
   *  inicial): de aquí sale `finEstacion` (D1, pregunta 7). La pantalla lo dice junto a «Temporada pasada»: la tienda
   *  que la recibió trasladada la semana pasada tiene que ver por qué ya pasó. */
  ultimaLlegadaCayla: string | null;
  temporada: string | null;
  temporadaOrigen: TallaFrescuraCruda["temporadaOrigen"];
  esClasico: boolean;
  finEstacion: string | null;
  rapidez: Rapidez | null;
  /** Unidades vendidas en la sede en sus últimos `DIAS_CALLADA` días en el piso (R7-2; con menos en la lectura, en
   *  todos), contando lo que una clienta apartó en esos días (revisión 8). Sin ventas y con menos de esos días colgada,
   *  «no se sabe» todavía si dejó de venderse. */
  ventasRecientes: number;
  /**
   * Contra qué se ubicó su tramo y se midió su rapidez: su categoría SIN ella (cortes, observación más larga y ventas con
   * edad conocida del resto). Null para el clásico y la dudosa, que no se miden. PASO 4: la pantalla tiene que decir que
   * cada prenda se mide sin ella; la cabecera de la categoría (`VaraCategoria`) muestra la curva completa, y una prenda
   * que es mucho de su categoría puede quedar en un tramo que esos cortes no explican (D5).
   */
  categoriaSinElla: { cortes: Cortes; tMax: number; vendidas: number } | null;
  /** Contra qué se juzgó (ADR-0208, act. 2026-10-07): su categoría en la tienda, o la de CAYLA cuando la tienda no llega a
   *  `VENTAS_PARA_JUZGAR_SOLA` ventas y CAYLA sí. `categoriaSinElla` es la curva que de verdad la juzgó. */
  juzgadaContra: "sede" | "cayla";
  /** Se juzgó contra la vara del mes de su categoría (congelada el día 1). Falso: la del mes todavía no llega a
   *  `VENTAS_PARA_JUZGAR_SOLA` ventas y se juzgó con la de hoy («aún aprendiendo su ritmo»), o es clásica o no cuadra. */
  varaDelMes: boolean;
  estado: EstadoFrescura;
  /**
   * «Por decidir» (paso 4b): quieta Y sin decisión vigente. ES EL ÚNICO LUGAR que lo dice: la cifra, el filete, el filtro y
   * «Las N tiendas» leen este campo y ninguno vuelve a mirar `estado.quieta` (lo vigila una prueba). `analizarSede` lo deja
   * igual a `quieta`; `aplicarDecisiones` lo corrige con la libreta.
   */
  porDecidir: boolean;
  /** Lo que la tienda anotó de esta prenda (la libreta, con cómo le fue a cada línea). Null: nada anotado. */
  decision: DecisionDePrenda | null;
};

export type CifrasSede = {
  unidadesEnPiso: number;
  /** Promedio de días de novedad de lo colgado (moda, sin clásicos ni dudosas), ponderado por unidades en el piso. */
  edadDelPisoDias: number | null;
  /** Alguna prenda de ese promedio dice «al menos»: el promedio también. */
  edadDelPisoAlMenos: boolean;
  unidadesNuevas: number;
  /** Unidades en el piso cuya prenda tiene tramo: el denominador honesto de «% Nuevas». */
  unidadesConTramo: number;
  pctNuevas: number | null;
  porDecidir: number;
  /** Prendas con una decisión vigente (paso 4b): las que ya no piden nada por ahora. */
  decididas: number;
};

export type FrescuraSede = {
  separaPiso: true;
  desde: string;
  ahora: string;
  categorias: VaraCategoria[];
  prendas: FrescuraPrenda[];
  cifras: CifrasSede;
  /** Lo decidido en la sede (paso 4b) o el aviso de que no se pudo leer. `analizarSede` la deja «sin lectura»; la llena `aplicarDecisiones`. */
  decisiones: DecisionesDeSede;
  /** El piso de hace 4 semanas, por categoría (ADR-0208, act. 2026-10-10 (b): la meta es contra el mes anterior). Lo pone quien lee la
   *  sede si se lo piden (`pisoAnterior`, `frescura-piso.ts`); null si no se pudo reconstruir o la lectura no llega tan atrás. */
  haceUnMes?: PisoAnterior | null;
  /** Cuánto estuvo colgada y cuánto vendió cada categoría en los últimos 14 y 28 días (ADR-0208, act. 2026-10-10 (b): lo que mueve la
   *  aguja). Unidad·días LIBRES en el piso y ventas registradas (lo apartado cuenta como venta), sin mirar la edad: funciona aunque casi todo
   *  sea carga inicial. Sin clásicos ni lo que no cuadra, como la barra. */
  ritmoPorCategoria: RitmoCategoria[];
};

/** El ritmo de una categoría en una ventana: lo que pesa en el piso (unidad·días) contra lo que vende. */
export type RitmoCategoria = { categoriaId: string; dias: number; unidadDias: number; vendidas: number };

/** Las ventanas del ritmo: 14 días manda; 28 si en 14 todavía no hay con qué juzgar. */
export const DIAS_RITMO = [14, 28] as const;

/** Lo que una sede aporta a la referencia de CAYLA: por categoría, sus unidades con edad conocida en cada ventana (se
 *  calculan al pedirlas y quedan guardadas). Vive en el servidor: no va a la pantalla. */
export type ObservacionesSede = Record<string, { nombre: string; unidadesEn: (dias: number) => readonly Observacion[] }>;

const SIN_CATEGORIA = "";
const NOMBRE_SIN_CATEGORIA = "Sin categoría";

/** La vara, lista para la pantalla, SIN su respaldo: quien llama lo pone (la sede lo sabe; la referencia de CAYLA no tiene). */
function aVaraCategoria(categoriaId: string, categoriaNombre: string, v: Vara): Omit<VaraCategoria, "respaldo" | "delMes"> {
  return {
    categoriaId,
    categoriaNombre,
    ventanaDias: v.ventanaDias,
    cortes: cortesConCola(v.cortes, finDeCurva(v.curva)),
    tMax: v.curva.tMax,
    vendidoAlFinal: 1 - supervivenciaEn(v.curva, v.curva.tMax),
    vendidas: v.vendidas,
    unidades: v.curva.unidades,
    nivel: v.nivel,
  };
}

/** Guarda lo que calcula `f` por ventana: cada ventana de cada talla se arma una sola vez. */
function porVentana<T>(f: (dias: number) => T): (dias: number) => T {
  const hechas = new Map<number, T>();
  return (dias) => {
    if (!hechas.has(dias)) hechas.set(dias, f(dias));
    return hechas.get(dias)!;
  };
}

/** Guarda lo que calcula `f` la primera vez que se pide. */
function unaVez<T>(f: () => T): () => T {
  let hecho: { v: T } | null = null;
  return () => (hecho ??= { v: f() }).v;
}

/** Lo que una talla aporta: sus unidades en cada ventana de la vara, y las de TODA la lectura (para su rapidez). */
type UnidadesDeTalla = { enVentana: (dias: number) => UnidadesTalla; todas: () => UnidadesTalla };

/**
 * La sede entera: eventos sin tardías → unidades por ventana → vara de cada categoría (sin clásicos ni dudosas) → reloj,
 * tramo y rapidez de cada prenda contra su categoría SIN ella → estado. `observaciones` sirve para la referencia de
 * CAYLA (`referenciaCayla`).
 * `opciones.corteDelMes` (ADR-0208, act. 2026-10-10 (b)): el instante de la vara del mes (`inicioDelMesLima`). Con él, cada
 * categoría se juzga contra su curva con lo ocurrido hasta ese instante (los `DIAS_VARA_DEL_MES` anteriores), congelada todo
 * el mes, cuando esa curva llega a `VENTAS_PARA_JUZGAR_SOLA` ventas; si no, como sin él. Sin él, la vara es la de hoy: así lo
 * pide el cron de CAYLA, que guarda las unidades de hoy.
 * `opciones.dudas` (act. 2026-10-10 (c)): lo vendido sin registrar que sigue pendiente; cada una aparta una unidad colgada (ver abajo).
 */
export function analizarSede(
  l: LecturaFrescuraConPiso,
  respaldo?: RespaldoCayla,
  opciones: { corteDelMes?: string; dudas?: readonly DudaVendida[] } = {},
): { sede: FrescuraSede; observaciones: ObservacionesSede; exposicion: ExposicionDe } {
  const tardiasPorOid = new Map<string, number>();
  for (const t of l.tardias) tardiasPorOid.set(t.oid, (tardiasPorOid.get(t.oid) ?? 0) + t.unidadesTardias);
  const dudosas = new Set(l.dudosas);
  const desdeMs = ms(l.desde);
  const ahoraMs = ms(l.ahora);
  const apartados = l.apartados ?? {};

  // Unidades de cada talla en cada ventana (solo lo que entra a la vara de su categoría) y en toda la lectura (lo que
  // mide su rapidez), calculadas al pedirlas. Si la ventana empieza antes que la lectura, es la lectura entera.
  const unidadesDeTalla = new Map<string, UnidadesDeTalla>();
  // Los eventos del piso de cada talla ya limpios (sin bajadas tardías, con lo apartado adentro): los mismos que leen la vara y
  // la rapidez. Los reusa la medición de «¿sirvió?» de las decisiones (paso 4b): una sola preparación de los eventos.
  const limpiosPorVariante = new Map<string, readonly EventoPiso[]>();
  const tallasDeCategoria = new Map<string, { nombre: string; ids: string[] }>();
  for (const talla of l.tallas) {
    const cat = talla.categoriaId ?? SIN_CATEGORIA;
    const grupo = tallasDeCategoria.get(cat) ?? { nombre: talla.categoriaNombre ?? NOMBRE_SIN_CATEGORIA, ids: [] };
    tallasDeCategoria.set(cat, grupo);
    if (talla.esClasico || dudosas.has(talla.varianteId)) continue;
    grupo.ids.push(talla.varianteId);
    // Lo apartado entra aquí como venta o como pausa (revisión 8): la vara de la categoría y la rapidez de la prenda no
    // cuentan como colgado lo que ya tiene dueña. Y PRIMERO (revisión 9, N1/F1/F2): las bajadas tardías se quitan
    // después, así la separación o la entrega de los 10 minutos siguientes a una bajada sale de la vara y de la rapidez
    // igual que su gemela vendida. Al revés, la separación entraba como una venta de 0 a 3 minutos, y la entrega de una
    // separación dentro de la ventana dejaba una unidad fantasma (se borraba su venta y la liberación quedaba como pausa).
    // `fn_frescura_sede` cuenta lo apartado en la ventana para las tardías de la lectura (20260928120330).
    const limpios = excluirTardias(eventosConApartados(l.eventos[talla.varianteId] ?? [], apartados[talla.varianteId]), tardiasPorOid);
    limpiosPorVariante.set(talla.varianteId, limpios);
    const todas = unaVez(() => unidadesParaVara(limpios, l.ahora));
    unidadesDeTalla.set(talla.varianteId, {
      todas,
      enVentana: porVentana((d) => {
        const inicioMs = ahoraMs - d * MS_POR_DIA;
        return inicioMs <= desdeMs ? todas() : unidadesParaVara(recortarEventos(limpios, new Date(inicioMs).toISOString()), l.ahora);
      }),
    });
  }
  // Los eventos de una talla COMO LOS VIO EL CRON a la hora de la foto de CAYLA: el libro y lo apartado hasta `calculadaEn`, y
  // recién después las tardías. No sirve cortar `limpios` por hora: ahí lo apartado ya entró con lo que se sabe HOY, y un apartado
  // que en la foto seguía abierto (una venta para el cron) hoy puede ser una pausa (se liberó sin venderse): la resta no lo
  // encontraría y su venta quedaría dentro de «su categoría sin ella» (revisión adversaria, 2026-10-08).
  const limpiosEnLaFoto = (varianteId: string, calcMs: number): EventoPiso[] =>
    excluirTardias(
      eventosConApartados(
        (l.eventos[varianteId] ?? []).filter((e) => ms(e.ts) <= calcMs),
        apartados[varianteId]?.filter((a) => ms(a.ts) <= calcMs),
      ),
      tardiasPorOid,
    );
  // Las unidades de cada talla en la vara del mes: los eventos COMO ESTABAN en el corte (`limpiosEnLaFoto`, el mismo cuidado
  // que la foto de CAYLA: lo apartado de entonces se lee con lo que se sabía entonces), en los `DIAS_VARA_DEL_MES` anteriores.
  // Un corte que no cae dentro de la lectura no arma vara del mes.
  const corteDelMes = opciones.corteDelMes ?? null;
  const corteMs = corteDelMes !== null ? ms(corteDelMes) : NaN;
  const unidadesDelMes = new Map<string, () => readonly Observacion[]>();
  if (corteDelMes !== null && corteMs > desdeMs && corteMs <= ahoraMs) {
    const inicioMs = corteMs - DIAS_VARA_DEL_MES * MS_POR_DIA;
    for (const id of limpiosPorVariante.keys()) {
      unidadesDelMes.set(
        id,
        unaVez(() => {
          const hastaElCorte = limpiosEnLaFoto(id, corteMs);
          const eventos = inicioMs <= desdeMs ? hastaElCorte : recortarEventos(hastaElCorte, new Date(inicioMs).toISOString());
          return unidadesParaVara(eventos, corteDelMes).observaciones;
        }),
      );
    }
  }
  const observaciones: ObservacionesSede = {};
  for (const [cat, { nombre, ids }] of tallasDeCategoria) {
    if (ids.length === 0) continue;
    observaciones[cat] = { nombre, unidadesEn: porVentana((d) => ids.flatMap((id) => unidadesDeTalla.get(id)!.enVentana(d).observaciones)) };
  }

  // La vara de cada categoría que tiene prendas en la sede (aunque no tenga unidades con edad conocida), y si sus prendas se
  // juzgan contra ella o contra la de CAYLA (ADR-0208, act. 2026-10-07): con menos de `VENTAS_PARA_JUZGAR_SOLA` ventas aquí y
  // esa cifra o más en CAYLA, CAYLA. Lo sin categoría no tiene respaldo: no se sabe contra qué.
  // Y antes que las dos, la vara del mes (act. 2026-10-10 (b)): si llega a `VENTAS_PARA_JUZGAR_SOLA` ventas, juzga ella. Una
  // vara que se recalcula con lo mismo que mide se ajusta sola —con venta exponencial, el piso de una tienda en equilibrio sale
  // siempre 50/25/15/10 se haga bien o mal—; congelada, la tienda que se pone lenta se ve más vieja.
  const varas = new Map<string, { nombre: string; vara: Vara; respaldo: VaraRespaldo | null; usaRespaldo: boolean; mes: Vara | null; usaMes: boolean }>();
  for (const [cat, { nombre, ids }] of tallasDeCategoria) {
    const vara = varaPorVentanas(observaciones[cat]?.unidadesEn ?? (() => []));
    const mes = unidadesDelMes.size > 0 ? construirVara(ids.flatMap((id) => unidadesDelMes.get(id)?.() ?? []), DIAS_VARA_DEL_MES) : null;
    const usaMes = mes !== null && mes.vendidas >= VENTAS_PARA_JUZGAR_SOLA - EPS;
    const r = cat === SIN_CATEGORIA ? null : (respaldo?.get(cat) ?? null);
    const usaRespaldo = !usaMes && r !== null && vara.vendidas < VENTAS_PARA_JUZGAR_SOLA - EPS && r.vendidas >= VENTAS_PARA_JUZGAR_SOLA - EPS;
    varas.set(cat, { nombre, vara, respaldo: r, usaRespaldo, mes, usaMes });
  }

  // Las tallas, juntas por prenda (modelo+color).
  const porPrenda = new Map<string, TallaFrescuraCruda[]>();
  for (const talla of l.tallas) {
    const k = clavePrendaDe(talla.productoId, talla.colorCodigo, talla.colorNombre);
    const lista = porPrenda.get(k);
    if (lista) lista.push(talla);
    else porPrenda.set(k, [talla]);
  }

  // Lo vendido sin registrar (act. 2026-10-10 (c); Felipe: «rapidez sí, días no»): cada venta anotada en caja que sigue pendiente aparta la
  // unidad colgada MÁS VIEJA de su categoría, talla y color —puede ser la que se vendió— y esa unidad deja de juzgarse: no empuja a su
  // prenda a «Por decidir» y en la barra cuenta como «Aún no se sabe». No toca el stock ni la vara de días (las observaciones no cambian:
  // no se sabe desde cuándo colgaba). Es un puente: lo colgado sin etiqueta se va vendiendo o etiquetando, y con eso se acaba.
  const colgadasConDudas = new Map<string, UnidadColgada[]>();
  const dudadasDeTalla = new Map<string, number>();
  for (const d of opciones.dudas ?? []) {
    let mejor: { varianteId: string; i: number; segundos: number } | null = null;
    for (const t of l.tallas) {
      if (t.pisoHoy <= 0 || (t.categoriaId ?? SIN_CATEGORIA) !== d.categoriaId || t.talla !== d.talla || t.colorCodigo !== d.colorCodigo) continue;
      const eventos = limpiosPorVariante.get(t.varianteId);
      if (!eventos) continue; // clásica o que no cuadra: no se juzga, no hay qué apartar
      if (!colgadasConDudas.has(t.varianteId)) colgadasConDudas.set(t.varianteId, colgadasDe(eventos, l.ahora).map((u) => ({ ...u })));
      const lista = colgadasConDudas.get(t.varianteId)!;
      for (let i = 0; i < lista.length; i++) {
        if (lista[i].unidades > 0 && (mejor === null || lista[i].segundos > mejor.segundos)) mejor = { varianteId: t.varianteId, i, segundos: lista[i].segundos };
      }
    }
    if (mejor === null) continue;
    colgadasConDudas.get(mejor.varianteId)![mejor.i].unidades -= 1;
    dudadasDeTalla.set(mejor.varianteId, (dudadasDeTalla.get(mejor.varianteId) ?? 0) + 1);
  }

  const prendas: FrescuraPrenda[] = [];
  for (const [clave, tallas] of porPrenda) {
    const f = tallas[0];
    const cat = f.categoriaId ?? SIN_CATEGORIA;
    const { nombre: categoriaNombre, vara, respaldo: varaCayla, usaRespaldo, mes: varaMes, usaMes } = varas.get(cat)!;
    const esClasico = tallas.some((t) => t.esClasico);
    const dudosa = tallas.some((t) => dudosas.has(t.varianteId));
    const temporada = tallas.find((t) => t.temporada !== null)?.temporada ?? null;
    // La estación de la ÚLTIMA llegada manda (plan 3c, «Temporada pasada»). Desde D1 la base ya la da por modelo+color
    // (su última llegada A CAYLA), igual en todas sus tallas; quedarse con la más tardía sigue siendo lo correcto si no.
    const conFin = tallas.filter((t) => t.finEstacion !== null).sort((a, b) => compararInstantes(b.finEstacion!, a.finEstacion!));
    const finEstacion = conFin[0]?.finEstacion ?? null;
    const enEstacionAhora = (conFin[0] ?? tallas.find((t) => t.enEstacionAhora !== null))?.enEstacionAhora ?? null;
    const primeras = tallas.map((t) => t.primeraExhibicion).filter((x): x is string => x !== null).sort(compararInstantes);
    const llegadas = tallas.map((t) => t.ultimaLlegada).filter((x): x is string => x !== null).sort(compararInstantes);
    const llegadasCayla = tallas.map((t) => t.ultimaLlegadaCayla).filter((x): x is string => x !== null).sort(compararInstantes);
    const pisoHoy = tallas.reduce((s, t) => s + t.pisoHoy, 0);
    const almacenHoy = tallas.reduce((s, t) => s + t.almacenHoy, 0);
    const apartadasHoy = tallas.reduce((s, t) => s + t.apartadasHoy, 0);
    const apartadasPisoHoy = tallas.reduce((s, t) => s + t.apartadasPisoHoy, 0);
    const eventosPorTalla = tallas.map((t) => l.eventos[t.varianteId] ?? []);
    const entradaReloj: EntradaReloj = {
      eventosPorTalla,
      apartadosPorTalla: tallas.map((t) => apartados[t.varianteId] ?? []),
      primeraExhibicion: primeras[0] ?? null,
      desde: l.desde,
      ahora: l.ahora,
    };
    // El reloj y sus últimos 30 días en el piso salen de la MISMA línea de tiempo (R7-2): las ventas «recientes» son las
    // de esos días, aunque para juntarlos haya que ir más atrás que 30 días de calendario.
    const linea = tramosColgada(entradaReloj);
    const reloj = relojNovedad(entradaReloj, linea);
    const inicioRecientes = inicioDeSusUltimosDias(linea.tramos, DIAS_CALLADA) ?? desdeMs;
    // Lo que una clienta apartó en esos días es una venta de esos días (revisión 8); lo que ya estaba apartado al
    // empezar la lectura (su saldo, a la hora de `desde`, donde no cae ninguna venta del libro) no es reciente: no se sabe
    // cuándo se apartó.
    let ventasRecientes = 0;
    for (const [k, t] of tallas.entries()) {
      for (const e of eventosConApartados(eventosPorTalla[k], apartados[t.varianteId])) {
        const cuando = ms(e.ts);
        if (e.esVenta && e.delta < 0 && cuando >= inicioRecientes && cuando > desdeMs) ventasRecientes -= e.delta;
      }
    }
    // Su tramo y su rapidez se miden contra su categoría SIN ella (`contraElResto`: se le restan las unidades con que ella
    // entra a la vara, las de la ventana de la vara). La rapidez, con sus unidades de TODA la lectura: sin dato solo si
    // alguna venta salió de lo que de verdad no tiene edad (saldo inicial de la lectura, carga inicial, ajustes) desde que
    // colgó lo primero con edad conocida (`ventasQueEsconden`).
    const medibles = esClasico || dudosa ? [] : tallas.map((t) => unidadesDeTalla.get(t.varianteId)).filter((u): u is UnidadesDeTalla => u !== undefined);
    const suyas = medibles.map((u) => u.todas());
    const suyasObs = suyas.flatMap((u) => u.observaciones);
    const enLaVara = medibles.map((u) => u.enVentana(vara.ventanaDias));
    // Con la vara de toda la lectura, lo que se resta y lo que se mide es lo mismo (y se ordena una vez).
    const propiasObs = enLaVara.every((u, k) => u === suyas[k]) ? suyasObs : enLaVara.flatMap((u) => u.observaciones);
    const juzgadaContra: FrescuraPrenda["juzgadaContra"] = usaRespaldo && medibles.length > 0 ? "cayla" : "sede";
    const varaDelMes = usaMes && varaMes !== null && medibles.length > 0;
    // El reloj de su unidad más vieja colgada: el FIFO de los eventos ya limpios (los mismos de la vara). La clásica y la que no
    // cuadra no tienen eventos limpios: no se juzgan, su reloj de unidad queda en 0.
    const colgadasPorTalla = tallas.map((t) => {
      const conDudas = colgadasConDudas.get(t.varianteId);
      if (conDudas) return conDudas.filter((u) => u.unidades > 0);
      const eventos = limpiosPorVariante.get(t.varianteId);
      return eventos ? colgadasDe(eventos, l.ahora) : [];
    });
    const relojUnidad = relojDeLaUnidad(colgadasPorTalla.flat());
    let resto: MedidaContraElResto | null = null;
    if (varaDelMes) {
      // Contra la vara del mes, sus propias unidades se restan como estaban EN EL CORTE (las mismas con que entran a esa curva);
      // lo que se MIDE (`suyasObs`) es lo de hoy, como contra CAYLA.
      const propiasDelMes = tallas.flatMap((t) => unidadesDelMes.get(t.varianteId)?.() ?? []);
      resto = contraElResto(varaMes.curva, propiasDelMes, suyasObs);
    } else if (medibles.length > 0 && juzgadaContra === "cayla" && varaCayla !== null) {
      // Contra CAYLA, sus propias unidades se restan COMO LAS VIO EL CRON (D5, «sin ella»): los mismos eventos hasta
      // `calculadaEn` —el libro y los apartados de entonces, `limpiosEnLaFoto`—, la misma ventana y el mismo FIFO. La curva de
      // CAYLA es una foto de la madrugada; restarle lo que la prenda tiene HOY le quitaría unidades con una edad que la foto no
      // tenía (lo que se colgó después no está en ella, y lo que sigue colgado tiene más horas). Lo que se MIDE (`suyasObs`) sí
      // es lo de hoy: a esa edad se espera la venta. Límite conocido: la lectura de hoy empieza hasta 3 días después que la del
      // cron (los mismos `FRESCURA_DIAS_LECTURA`, contados desde ahora y no desde la foto), así que una unidad de la prenda
      // colgada en esos días —120 días atrás— entra a la lectura como saldo sin edad y no se resta: a lo sumo un puñado de
      // unidades viejas entre 10 ventas o más.
      const calcMs = ms(varaCayla.calculadaEn);
      const inicioMs = calcMs - varaCayla.ventanaDias * MS_POR_DIA;
      const propiasEnLaFoto = tallas.flatMap((t) => {
        if (!limpiosPorVariante.has(t.varianteId)) return [];
        const hastaLaFoto = limpiosEnLaFoto(t.varianteId, calcMs);
        const eventos = inicioMs <= desdeMs ? hastaLaFoto : recortarEventos(hastaLaFoto, new Date(inicioMs).toISOString());
        return unidadesParaVara(eventos, varaCayla.calculadaEn).observaciones;
      });
      resto = contraElResto(varaCayla.curva, propiasEnLaFoto, suyasObs);
    } else if (medibles.length > 0) {
      resto = contraElResto(vara.curva, propiasObs, suyasObs);
    }
    const r =
      resto === null
        ? null
        : rapidez(
            vendidasDe(suyasObs),
            resto.esperadas,
            resto.vendidas,
            ventasQueEsconden(suyas),
          );
    const estado = estadoFrescura({
      dudosa,
      esClasico,
      temporada,
      finEstacion,
      enEstacionAhora,
      ahora: l.ahora,
      // El nivel es el de la vara que juzga: el de CAYLA cuando es CAYLA (de ahí sale si «Trasladar» puede sugerirse).
      vara:
        resto === null
          ? vara
          : {
              nivel: varaDelMes ? varaMes.nivel : juzgadaContra === "cayla" && varaCayla ? varaCayla.nivel : vara.nivel,
              cortes: resto.cortes,
              curva: { tMax: resto.tMax },
            },
      reloj,
      relojUnidad,
      rapidez: r,
      pisoHoy,
      almacenHoy,
      ventasRecientes,
    });
    prendas.push({
      clave,
      productoId: f.productoId,
      productoNombre: f.productoNombre,
      codigo: f.codigo,
      colorCodigo: f.colorCodigo,
      colorNombre: f.colorNombre,
      categoriaId: cat,
      categoriaNombre,
      tallas: tallas.map((t, k) => ({
        varianteId: t.varianteId,
        talla: t.talla,
        pisoHoy: t.pisoHoy,
        almacenHoy: t.almacenHoy,
        apartadasHoy: t.apartadasHoy,
        apartadasPisoHoy: t.apartadasPisoHoy,
        colgadas: colgadasPorTalla[k],
        // Solo cuando hay: la forma de la talla no cambia para la inmensa mayoría.
        ...(dudadasDeTalla.has(t.varianteId) ? { dudadas: dudadasDeTalla.get(t.varianteId)! } : {}),
      })),
      pisoHoy,
      almacenHoy,
      apartadasHoy,
      apartadasPisoHoy,
      reloj,
      relojUnidad,
      primeraExhibicion: primeras[0] ?? null,
      ultimaLlegada: llegadas[llegadas.length - 1] ?? null,
      ultimaLlegadaCayla: llegadasCayla[llegadasCayla.length - 1] ?? null,
      temporada,
      temporadaOrigen: tallas.find((t) => t.temporada !== null)?.temporadaOrigen ?? null,
      esClasico,
      finEstacion,
      rapidez: r,
      ventasRecientes,
      categoriaSinElla: resto === null ? null : { cortes: resto.cortes, tMax: resto.tMax, vendidas: resto.vendidas },
      juzgadaContra,
      varaDelMes,
      estado,
      porDecidir: estado.quieta,
      decision: null,
    });
  }
  prendas.sort((a, b) => a.categoriaNombre.localeCompare(b.categoriaNombre, "es") || b.reloj.segundos - a.reloj.segundos || a.clave.localeCompare(b.clave));

  // El respaldo está EN USO solo si alguna prenda de la categoría se juzgó contra CAYLA: una categoría de puros clásicos (o de
  // prendas que no cuadran) no se juzga contra nada, y el tablero no debe decir «Contra CAYLA» (revisión adversaria, 2026-10-08).
  const juzgadasContraCayla = new Set(prendas.filter((p) => p.juzgadaContra === "cayla").map((p) => p.categoriaId));
  const juzgadasContraElMes = new Set(prendas.filter((p) => p.varaDelMes).map((p) => p.categoriaId));
  const categorias = [...varas.entries()]
    .map(([id, { nombre, vara, respaldo: r, mes }]) => ({
      ...aVaraCategoria(id, nombre, vara),
      delMes: mes === null || corteDelMes === null ? null : { ...aVaraCategoria(id, nombre, mes), corte: corteDelMes, enUso: juzgadasContraElMes.has(id) },
      respaldo:
        r === null
          ? null
          : { ...aVaraCategoria(id, nombre, { ventanaDias: r.ventanaDias, curva: r.curva, cortes: cortes(r.curva), vendidas: r.vendidas, nivel: r.nivel }), calculadaEn: r.calculadaEn, enUso: juzgadasContraCayla.has(id) },
    }))
    .sort((a, b) => a.categoriaNombre.localeCompare(b.categoriaNombre, "es"));

  // Cuánto vendió y cuánto estuvo colgada (libre en el piso) una prenda entre dos instantes: null si no se mide (clásica,
  // que no cuadra, o no está en la sede). Es la medida de «¿sirvió?» de una decisión.
  const exposicion: ExposicionDe = (clave, desde, hasta) => {
    const tallas = porPrenda.get(clave);
    if (!tallas) return null;
    let unidadSegundos = 0;
    let vendidas = 0;
    for (const t of tallas) {
      const eventos = limpiosPorVariante.get(t.varianteId);
      if (eventos === undefined) return null;
      const e = exposicionDeEventos(eventos, desde, hasta);
      unidadSegundos += e.unidadSegundos;
      vendidas += e.vendidas;
    }
    return { unidadSegundos, vendidas };
  };

  // El ritmo de cada categoría (lo que mueve la aguja): la exposición de siempre (`exposicionDeEventos`, la medida de «¿sirvió?»), sumada.
  const ritmoPorCategoria: RitmoCategoria[] = [];
  for (const dias of DIAS_RITMO) {
    const desdeRitmo = new Date(Math.max(desdeMs, ahoraMs - dias * MS_POR_DIA)).toISOString();
    for (const [cat, { ids }] of tallasDeCategoria) {
      if (ids.length === 0) continue;
      let unidadSegundos = 0;
      let vendidas = 0;
      for (const id of ids) {
        const e = exposicionDeEventos(limpiosPorVariante.get(id) ?? [], desdeRitmo, l.ahora);
        unidadSegundos += e.unidadSegundos;
        vendidas += e.vendidas;
      }
      ritmoPorCategoria.push({ categoriaId: cat, dias, unidadDias: unidadSegundos / 86_400, vendidas });
    }
  }

  return {
    sede: {
      separaPiso: true,
      desde: l.desde,
      ahora: l.ahora,
      categorias,
      prendas,
      ritmoPorCategoria,
      cifras: cifrasSede(prendas),
      // Hasta que `aplicarDecisiones` lea la libreta, no se sabe nada de lo decidido.
      decisiones: { estado: "sin_lectura", aviso: "" },
    },
    observaciones,
    exposicion,
  };
}

/** Las cifras de cabecera de una sede: edad del piso, % Nuevas y cuántas prendas están «por decidir». */
export function cifrasSede(prendas: readonly FrescuraPrenda[]): CifrasSede {
  let unidadesEnPiso = 0;
  let pesoEdad = 0;
  let sumaEdad = 0;
  let edadDelPisoAlMenos = false;
  let unidadesNuevas = 0;
  let unidadesConTramo = 0;
  let porDecidir = 0;
  for (const p of prendas) {
    if (p.estado.quieta) porDecidir++;
    if (p.pisoHoy <= 0) continue;
    unidadesEnPiso += p.pisoHoy;
    if (p.estado.tipo === "clasico" || p.estado.tipo === "dudosa") continue;
    pesoEdad += p.pisoHoy;
    sumaEdad += p.pisoHoy * (p.reloj.segundos / 86_400);
    if (p.reloj.alMenos) edadDelPisoAlMenos = true;
    if (p.estado.tipo === "semaforo") {
      unidadesConTramo += p.pisoHoy;
      if (p.estado.tramo === "nueva") unidadesNuevas += p.pisoHoy;
    }
  }
  return {
    unidadesEnPiso,
    edadDelPisoDias: pesoEdad > 0 ? Math.round((sumaEdad / pesoEdad) * 10) / 10 : null,
    edadDelPisoAlMenos,
    unidadesNuevas,
    unidadesConTramo,
    pctNuevas: unidadesConTramo > 0 ? Math.round((unidadesNuevas / unidadesConTramo) * 1000) / 10 : null,
    porDecidir,
    decididas: 0,
  };
}

/**
 * La referencia de CAYLA: UNA curva por categoría con las unidades de todas las sedes juntas (ADR-0208, decisión 6 del
 * bloque 3; plan 3c, «Referencia de CAYLA»). No es el promedio de los P50 de cada sede: una sede con 2 ventas pesaría lo
 * mismo que una con 200. Solo la ve el líder (el único que lee las 3 sedes).
 */
export function referenciaCayla(sedes: readonly ObservacionesSede[]): VaraCategoria[] {
  const nombres = new Map<string, string>();
  for (const sede of sedes) for (const [cat, grupo] of Object.entries(sede)) if (!nombres.has(cat)) nombres.set(cat, grupo.nombre);
  return [...nombres]
    .map(([cat, nombre]) => ({ ...aVaraCategoria(cat, nombre, varaPorVentanas((d) => sedes.flatMap((sede) => sede[cat]?.unidadesEn(d) ?? []))), respaldo: null, delMes: null }))
    .sort((a, b) => a.categoriaNombre.localeCompare(b.categoriaNombre, "es"));
}

// ---------------------------------------------------------------------------
// La vuelta del líder: todas sus tiendas, el registro al colgar y la referencia de CAYLA
// ---------------------------------------------------------------------------
//
// Vive aquí y no en `frescura.ts` para poder probarla con la salida REAL de la base (`__fixtures__/frescura-sede.json`,
// prueba `frescura-contrato.test.ts`): quien llama pasa `rpc` (en el servidor, `supabase.rpc`), así esta parte no
// importa Supabase. `frescura.ts` solo dice a quién preguntar.
//
// Mismo patrón que `existencias-ritmo-servidor.ts` («Tolerado»): cada bloque falla por su cuenta. Si Trujillo no
// responde, Arequipa y Lima se siguen viendo, y la tarjeta de Trujillo dice «no se pudo cargar». Lo único que NO se arma
// a medias es la referencia de CAYLA: con una sede caída, una curva «de las 3 sedes» hecha con dos sería una cifra que
// miente (principio 9: degradarse con gracia es decir qué falta, no inventar).

export type FrescuraDeSede = {
  ubicacionId: string;
  nombre: string;
  /** `{ separaPiso: false }`: la sede no separa piso y almacén (no hay frescura que medir). */
  lectura: Tolerado<FrescuraSede | { separaPiso: false }>;
};

export type FrescuraLider = {
  sedes: FrescuraDeSede[];
  /** El registro al colgar de cada sede, este mes y el anterior. */
  confianza: Tolerado<FilaConfianza[]>;
  /** Una curva por categoría con las unidades de todas las tiendas juntas (solo el líder la ve). */
  referenciaCayla: Tolerado<VaraCategoria[]>;
};

/** Lo que devuelve una RPC de supabase-js, sin acoplarse a su tipo. */
export type RespuestaRpc = { data: unknown; error: { message: string; hint?: string | null } | null };
/** Las cuatro lecturas de Frescura. En el servidor: `(fn, args) => supabase.rpc(fn, args)`. */
export type LlamarRpcFrescura = (
  fn: "fn_frescura_sede" | "fn_confianza_registro" | "fn_frescura_decisiones" | "fn_frescura_vara_cayla",
  args: { p_ubicacion_id: string; p_dias: number } | Record<string, never>,
) => PromiseLike<RespuestaRpc>;

/** El aviso para la pantalla, sin jerga de Postgres. La pista `frescura_sin_permiso` es un «no tienes acceso», no un fallo. */
function avisoFrescura(que: string, error: RespuestaRpc["error"]): string {
  if (error?.hint === "frescura_sin_permiso") return `No tienes acceso a ${que}.`;
  return `No se pudo cargar ${que}. Lo demás de esta pantalla sí está al día.`;
}

/**
 * Lo decidido en una sede (paso 4b), aparte de la lectura del piso: si `fn_frescura_decisiones` no responde, la pantalla se
 * dibuja igual —«Por decidir» vuelve a ser «quieta», más prendas de las debidas y nunca menos— y lo dice. Nunca lanza.
 */
async function leerDecisionesDeSede(rpc: LlamarRpcFrescura, u: { id: string; nombre: string }, dias: number): Promise<LecturaDecisiones | null> {
  try {
    const { data, error } = await rpc("fn_frescura_decisiones", { p_ubicacion_id: u.id, p_dias: dias });
    if (error) {
      console.error(`No se pudo leer lo decidido en ${u.nombre}:`, error.message);
      return null;
    }
    const lectura = leerDecisiones(data);
    if (lectura === null) console.error(`No se pudo leer lo decidido en ${u.nombre}: la respuesta no tiene la forma de fn_frescura_decisiones.`);
    return lectura;
  } catch (e) {
    console.error(`No se pudo leer lo decidido en ${u.nombre}:`, e);
    return null;
  }
}

/** Una sede ya leída y analizada, con lo que hace falta para medir «La trasladé» en la tienda destino (solo el líder). */
type SedeLeida = {
  fila: FrescuraDeSede;
  observaciones: ObservacionesSede | null;
  medicion: { sede: FrescuraSede; lectura: LecturaDecisiones | null; exposicion: ExposicionDe; cuadres: readonly string[] } | null;
};

/** Cómo se reconstruye el piso de hace 4 semanas (`pisoAnterior` de `frescura-piso.ts`): lo pasa quien lee, para que este archivo no
 *  dependa de la barra. */
export type CalcularAnterior = (lectura: LecturaFrescuraConPiso, respaldo?: RespaldoCayla) => PisoAnterior | null;

/** Cómo se piden las ventas sin registrar pendientes de una sede (lo pasa el servidor; si falla, ninguna: la pantalla sigue entera). */
export type CargarDudas = (ubicacionId: string) => Promise<readonly DudaVendida[]>;

async function leerSedeFrescura(
  rpc: LlamarRpcFrescura,
  u: { id: string; nombre: string },
  dias: number,
  respaldo?: RespaldoCayla,
  anterior?: CalcularAnterior,
  cargarDudas?: CargarDudas,
): Promise<SedeLeida> {
  const que = `la frescura de ${u.nombre}`;
  const fila = (lectura: FrescuraDeSede["lectura"]): FrescuraDeSede => ({ ubicacionId: u.id, nombre: u.nombre, lectura });
  const fallo = (mensaje: string) => ({ fila: fila({ datos: null, fallo: mensaje }), observaciones: null, medicion: null });
  // Las dos lecturas salen a la vez: la de decisiones no espera a la del piso.
  const enCurso = leerDecisionesDeSede(rpc, u, dias);
  const dudasEnCurso: Promise<readonly DudaVendida[]> = cargarDudas ? cargarDudas(u.id).catch(() => []) : Promise.resolve([]);
  try {
    const { data, error } = await rpc("fn_frescura_sede", { p_ubicacion_id: u.id, p_dias: dias });
    if (error) {
      console.error(`No se pudo leer ${que}:`, error.message);
      return fallo(avisoFrescura(que, error));
    }
    const lectura = leerFrescuraSede(data);
    if (lectura === null) {
      console.error(`No se pudo leer ${que}: la respuesta no tiene la forma de fn_frescura_sede.`);
      return fallo(avisoFrescura(que, null));
    }
    if (!lectura.separaPiso) return { fila: fila({ datos: { separaPiso: false }, fallo: null }), observaciones: {}, medicion: null };
    // La pantalla juzga contra la vara del mes (act. 2026-10-10 (b)); el cron de CAYLA, que guarda las unidades de hoy, no.
    const { sede, observaciones, exposicion } = analizarSede(lectura, respaldo, { corteDelMes: inicioDelMesLima(lectura.ahora), dudas: await dudasEnCurso });
    // El piso de hace 4 semanas (la meta es contra el mes anterior): si no se puede reconstruir, la pantalla no compara y sigue entera.
    if (anterior) {
      try {
        sede.haceUnMes = anterior(lectura, respaldo);
      } catch (e) {
        console.error(`No se pudo reconstruir el piso de hace 4 semanas de ${u.nombre}:`, e);
        sede.haceUnMes = null;
      }
    }
    const decisiones = await enCurso;
    const cuadres = lectura.cuadres ?? [];
    sede.decisiones = aplicarDecisiones(sede, decisiones, exposicion, sede.ahora, cuadres);
    return { fila: fila({ datos: sede, fallo: null }), observaciones, medicion: { sede, lectura: decisiones, exposicion, cuadres } };
  } catch (e) {
    console.error(`No se pudo leer ${que}:`, e);
    return fallo(avisoFrescura(que, null));
  }
}

async function leerConfianzaFrescura(rpc: LlamarRpcFrescura): Promise<Tolerado<FilaConfianza[]>> {
  const que = "el registro al colgar de las sedes";
  try {
    const { data, error } = await rpc("fn_confianza_registro", {});
    if (error) {
      console.error(`No se pudo leer ${que}:`, error.message);
      return { datos: null, fallo: avisoFrescura(que, error) };
    }
    return { datos: leerConfianzaRegistro(data), fallo: null };
  } catch (e) {
    console.error(`No se pudo leer ${que}:`, e);
    return { datos: null, fallo: avisoFrescura(que, null) };
  }
}

/**
 * Frescura del piso de UNA tienda, para quien tiene el módulo sin ser líder (paso 4, ADR-0253): lee solo su sede, sin el
 * registro al colgar ni la referencia de CAYLA (las dos necesitan leer las otras tiendas, y quien no es líder no las
 * opera). Mismo camino y mismos avisos que cada tienda de la vuelta del líder.
 */
export async function armarFrescuraSede(
  tienda: { id: string; nombre: string },
  rpc: LlamarRpcFrescura,
  dias: number,
  respaldo?: RespaldoCayla,
  anterior?: CalcularAnterior,
  cargarDudas?: CargarDudas,
): Promise<FrescuraDeSede> {
  return (await leerSedeFrescura(rpc, tienda, dias, respaldo, anterior, cargarDudas)).fila;
}

/**
 * Frescura del piso para el líder, en una vuelta y EN PARALELO: una `fn_frescura_sede` por tienda (una sola lectura del
 * libro por sede) y una `fn_confianza_registro` para todas. Las lecturas que fallan vuelven con su aviso; ninguna tumba
 * la pantalla.
 */
export async function armarFrescuraLider(
  tiendas: readonly { id: string; nombre: string }[],
  rpc: LlamarRpcFrescura,
  dias: number,
  respaldo?: RespaldoCayla,
  anterior?: CalcularAnterior,
  cargarDudas?: CargarDudas,
): Promise<FrescuraLider> {
  const [lecturas, confianza] = await Promise.all([Promise.all(tiendas.map((t) => leerSedeFrescura(rpc, t, dias, respaldo, anterior, cargarDudas))), leerConfianzaFrescura(rpc)]);

  // «La trasladé» se mide en la tienda destino con SU lectura: solo el líder, que las lee todas, puede.
  completarTraslados(
    lecturas
      .filter((l): l is SedeLeida & { medicion: NonNullable<SedeLeida["medicion"]> } => l.medicion !== null)
      .map((l) => ({
        id: l.fila.ubicacionId,
        nombre: l.fila.nombre,
        sede: l.medicion.sede,
        decisiones: l.medicion.sede.decisiones,
        lectura: l.medicion.lectura,
        exposicion: l.medicion.exposicion,
        cuadres: l.medicion.cuadres,
      })),
    lecturas.find((l) => l.medicion !== null)?.medicion?.sede.ahora ?? new Date().toISOString(),
  );

  const caidas = lecturas.filter((l) => l.observaciones === null).map((l) => l.fila.nombre);
  const cayla: Tolerado<VaraCategoria[]> =
    caidas.length > 0
      ? { datos: null, fallo: `La referencia de CAYLA necesita todas las tiendas y falta ${caidas.join(", ")}.` }
      : { datos: referenciaCayla(lecturas.map((l) => l.observaciones ?? {})), fallo: null };

  return { sedes: lecturas.map((l) => l.fila), confianza, referenciaCayla: cayla };
}
