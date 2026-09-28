import { compararInstantes, historiaDeCohortes, type EventoPiso } from "./inventario-exposicion";
import { clavePrendaDe } from "./prenda-clave";
import type { Tolerado } from "./resultado";

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
//   2. EL RELOJ DE NOVEDAD de la prenda: los segundos con alguna de sus tallas en el piso desde la primera vez que se
//      colgó en la sede. Nunca se reinicia (una prenda repuesta no vuelve a ser Nueva) y no corre agotada ni guardada.
//   3. LA RAPIDEZ: cuántas vendió contra cuántas habría vendido una prenda típica de su categoría (sin ella) con los
//      mismos días colgada, con las unidades de TODA la lectura. Separa «vieja y lenta» (quieta) de «vieja pero se sigue
//      vendiendo» (un pilar, que nunca va al perchero salvo que su temporada ya pasó: D2). Lo que dejó de venderse hace
//      30 días no es pilar aunque su índice de 120 días lo diga (revisión 6).
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
/** Índice de rapidez de una prenda que se vende igual que su categoría a la misma edad. */
export const RAPIDEZ_IGUAL = 100;
/** Evidencia mínima para hablar de rapidez: vendidas + esperadas. Con menos, «sin dato» (nunca «lenta»). */
export const RAPIDEZ_MIN_EVIDENCIA = 1;
/**
 * Días sin vender que piden «revisa sus ventas» a una prenda sin tramo firme (D4+D6, 2026-09-27): colgada al menos este
 * tiempo y sin ninguna venta de su modelo+color en la sede en los últimos este-tantos días. Es la ventana más corta de la
 * vara: lo que se considera «reciente» en toda la pantalla.
 */
export const DIAS_CALLADA = 30;

/** Las marcas de cada evento de `fn_frescura_sede` (bits). */
export const MARCA_VENTA = 1;
export const MARCA_INTERNO = 2;
export const MARCA_EDAD_DESCONOCIDA = 4;

const MS_POR_DIA = 86_400_000;
const EPS = 1e-9;
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
 * dejó de venderse) cuya temporada ya pasó (D2, Felipe 2026-09-27); es una pregunta, no una orden, y nunca trae
 * «trasladar».
 */
export type Sugerencia = "revisar_ventas" | "cambiar_lugar" | "trasladar" | "retirar" | "sigue_vendiendo" | "guardar_hasta_su_estacion";
/**
 * Lo que dicen sus ventas de los últimos `DIAS_CALLADA` días (revisión 6): `vendio` (vendió algo), `dejo_de_vender`
 * (lleva colgada al menos esos días y no vendió nada) o `no_se_sabe` (la lectura no cubre esos días, o no vendió pero
 * lleva menos tiempo colgada: todavía no dice nada). Es la ÚNICA medida de «¿se sigue vendiendo?» de la pantalla: la
 * usan el pilar (y con él «sigue vendiendo») y la prenda callada.
 */
export type Recientes = "vendio" | "dejo_de_vender" | "no_se_sabe";

/** Una talla de la lectura de la sede (una fila de `prendas` de `fn_frescura_sede`). */
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
  /** La última vez que su MODELO+COLOR llegó A CAYLA, en cualquier sede (lote, producción del Taller o carga inicial; la
   *  recepción de un traslado no: la prenda ya estaba en CAYLA). De aquí sale `finEstacion` (D1, Felipe 2026-09-27). */
  ultimaLlegadaCayla: string | null;
  pisoHoy: number;
  almacenHoy: number;
};

export type TardiaCruda = { oid: string; varianteId: string; bajadaEn: string; unidadesTardias: number };

export type LecturaFrescuraConPiso = {
  separaPiso: true;
  desde: string;
  ahora: string;
  tallas: TallaFrescuraCruda[];
  /** Por variante: los puntos del PISO del libro desde `desde`, en orden, ya como `EventoPiso`. */
  eventos: Record<string, EventoPiso[]>;
  tardias: TardiaCruda[];
  dudosas: string[];
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

const ORIGENES = ["color", "producto", "categoria"] as const;

function leerTalla(v: unknown): TallaFrescuraCruda | null {
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
  };
}

/**
 * El jsonb de `retail.fn_frescura_sede`. Devuelve null si la forma no es la del contrato (sin `separa_piso`, sin
 * `desde`/`ahora` o sin la lista de prendas): quien llama lo trata como un fallo de lectura, nunca como una sede vacía.
 */
export function leerFrescuraSede(v: unknown): LecturaFrescuraSede | null {
  if (!esObjeto(v)) return null;
  if (v.separa_piso === false) return { separaPiso: false };
  if (v.separa_piso !== true || !esFecha(v.desde) || !esFecha(v.ahora) || !Array.isArray(v.prendas)) return null;
  const tallas = v.prendas.map(leerTalla).filter((t): t is TallaFrescuraCruda => t !== null);
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
  return { separaPiso: true, desde: v.desde, ahora: v.ahora, tallas, eventos, tardias, dudosas };
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
 * Y de las ventas de esa talla en [t, t + 10 min], empezando por la ÚLTIMA: el FIFO le da las primeras ventas a lo que
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

/**
 * El reloj de novedad de una prenda (modelo+color) en la sede: los segundos con la SUMA de sus tallas en el piso > 0,
 * desde su primera exhibición. Agotada o guardada en el almacén no corre; repuesta sigue desde donde iba (nunca vuelve a
 * «Nueva», ADR-0208 decisión 9). Se mide en tiempo continuo, no por días calendario (plan 3c, corrección 3).
 *
 * `alMenos` cuando no se sabe desde cuándo está: la primera exhibición del modelo+color es anterior a la ventana
 * (`desde`), o lo primero que entró al piso tiene edad desconocida (saldo, carga inicial, ajuste: ADR-0248, decisión 3).
 * Una bajada tardía NO cuenta como edad desconocida: sus unidades salen de la vara (`excluirTardias`), pero la prenda sigue
 * pudiendo ser «Nueva». Antes del 3b una tardía también es «la clienta pidió otra talla y se la trajeron» o el fardo
 * nuevo que se vende a los 3 minutos: marcarla «al menos» dejaba sin «Nueva» para siempre justo a lo que mejor se vende
 * (revisión 3). Los eventos van SIN quitar las tardías: el reloj mide lo que el piso registró.
 */
export function relojNovedad(p: {
  eventosPorTalla: readonly (readonly EventoPiso[])[];
  primeraExhibicion: string | null;
  desde: string;
  ahora: string;
}): RelojNovedad {
  // La hora de cada evento se lee UNA vez (ordenar comparando textos de fecha la leía en cada comparación).
  const todos = p.eventosPorTalla
    .flat()
    .map((e) => ({ e, t: ms(e.ts) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  const desdeMs = ms(p.desde);
  const ahoraMs = ms(p.ahora);
  // En milisegundos enteros y una sola división al final: sumar tramos ya divididos entre 1000 acumula error de coma
  // flotante, y el reloj de la prenda más vieja se compara con su propia exposición (`tramoDe`, revisión 4).
  let nivel = 0;
  let milisegundos = 0;
  let previo = desdeMs;
  for (const { e, t: cuando } of todos) {
    const t = Math.min(ahoraMs, Math.max(previo, cuando));
    if (nivel > 0) milisegundos += t - previo;
    nivel += e.delta;
    previo = t;
  }
  if (nivel > 0) milisegundos += Math.max(0, ahoraMs - previo);
  const segundos = milisegundos / 1000;

  const entradas = todos.filter((x) => x.e.delta > 0);
  if (p.primeraExhibicion === null) return { segundos, alMenos: entradas.length > 0 };
  if (ms(p.primeraExhibicion) < desdeMs) return { segundos, alMenos: true };
  const primera = entradas[0];
  const deLaPrimera = primera ? entradas.filter((x) => x.t === primera.t).map((x) => x.e) : [];
  const desconocida = deLaPrimera.some((e) => e.edadDesconocida === true);
  return { segundos, alMenos: desconocida };
}

/** Su categoría SIN una prenda: contra qué se ubica su tramo y se mide su rapidez (revisión 3; D5, 2026-09-27). */
export type MedidaContraElResto = {
  cortes: Cortes;
  tMax: number;
  /** Ventas con edad conocida del resto (la evidencia de la rapidez: `Rapidez.referencia`). */
  vendidas: number;
  /** Σ peso × riesgo acumulado del resto en los segundos de cada unidad de `suyas`: lo que la rapidez espera. */
  esperadas: number;
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
      while (s <= umbral) {
        cortesHallados[u++] = t;
        umbral = umbrales[u];
      }
    }
    // Las unidades propias de este instante salen del riesgo después de él.
    while (j < mias.length && mias[j].segundos <= g) misEnRiesgo -= mias[j++].peso;
    if (g === Infinity) break;
  }
  while (q < nc) esperadas += consP[q++] * h;
  const [p50, p75, p90] = cortesHallados;
  return { cortes: { p50, p75, p90 }, tMax: tMaxSin(curva, mias), vendidas: vendidasResto, esperadas };
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
 * También null si alguna venta de lo que tiene edad desconocida pudo esconderle ventas a lo que sí la tiene
 * (`ventasSinEdad`, de `ventasQueEsconden`: las hechas desde que la prenda colgó lo primero con edad conocida): el FIFO le
 * da las ventas a la cohorte más vieja, así que la talla de la carga inicial que se repone vende lo de la carga y lo
 * repuesto (con edad conocida) parece sin vender. Medida solo con lo repuesto salía 0, «lenta», y el éxito de venta que
 * vino en la carga iba a «Por decidir» con «Trasladar», justo lo que prohíbe la corrección 4 (revisión 4, las gemelas K y
 * U: misma historia física, 125 contra 0). Las ventas de una carga que se agotó ANTES de que llegara lo repuesto no
 * cuentan (revisión 6): con toda la lectura, vetaban 120 días la rapidez de toda reposición.
 */
export function rapidez(vendidas: number, esperadas: number, referencia: number, ventasSinEdad = 0): Rapidez | null {
  if (ventasSinEdad > 0) return null;
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
 * si lleva 30 días colgada sin vender (`dejo_de_vender`, revisión 6; era el «SE ROMPE SI» de D2): entonces es lenta.
 */
export function esPilar(r: Rapidez | null, recientes: Recientes): boolean {
  return r !== null && r.indice >= RAPIDEZ_IGUAL && recientes !== "dejo_de_vender";
}

/** `Recientes` a partir de las ventas del modelo+color en los últimos `DIAS_CALLADA` días y los segundos colgada. */
function recientesDe(ventasRecientes: number | null, segundosColgada: number): Recientes {
  if (ventasRecientes === null) return "no_se_sabe";
  if (ventasRecientes > 0) return "vendio";
  return segundosColgada >= DIAS_CALLADA * 86_400 - TOL_SEGUNDOS ? "dejo_de_vender" : "no_se_sabe";
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
  return p.nivel === "solido" && p.almacenHoy > 0 && p.rapidez !== null && nivelPorVentas(p.rapidez.referencia) === "solido";
}

/**
 * Lo que se sugiere, en el orden de la escalera de ADR-0208 (decisión 11) sin su último escalón: primero mirar, después
 * cambiarla de lugar 7 días, después trasladarla; con la temporada pasada y algo en el piso, además retirarla (ADR-0246,
 * decisión 10: «al terminar su estación, Frescura avisa y sugiere»). La rebaja no se sugiere nunca aquí.
 *   · Un pilar de venta de temporada pasada recibe SOLO «sigue vendiendo: decide si la dejas hasta agotar o la retiras»
 *     (D2, Felipe 2026-09-27): cambiarla de lugar o trasladarla no tiene sentido para lo que se vende, y «retirar» a
 *     secas era una orden donde hay una decisión. Un pilar que dejó de venderse ya no lo es (`esPilar`, revisión 6).
 *     PENDIENTE DE FELIPE (revisión 6): lo que no tiene dato de rapidez (lo que vino en la carga inicial) y vendió en los
 *     últimos 30 días no llega a «sigue vendiendo»: recibe la escalera y «retirar» (ADR-0208, «Revisión 6 del paso 3»).
 *   · `callada` (D4+D6): sin tramo firme, colgada 30 días o más y sin ninguna venta en los últimos 30. Recibe «revisa sus
 *     ventas» con o sin dato de rapidez: nunca queda una prenda quieta sin ninguna pista.
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
  if (p.temporadaPasada && p.pisoHoy > 0 && esPilar(p.rapidez, p.recientes)) {
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
  reloj: RelojNovedad;
  rapidez: Rapidez | null;
  pisoHoy: number;
  almacenHoy: number;
  /** Unidades de su modelo+color vendidas en la sede en los últimos `DIAS_CALLADA` días; null si la lectura no cubre
   *  esos días (entonces no se sabe). Dicen si se sigue vendiendo (`Recientes`): el pilar y la callada. */
  ventasRecientes: number | null;
};

/** «Temporada pasada»: terminó la estación de su última llegada. Nunca para un clásico ni para lo que no tiene temporada. */
export function esTemporadaPasada(p: { esClasico: boolean; temporada: string | null; finEstacion: string | null; ahora: string }): boolean {
  return !p.esClasico && p.temporada !== null && p.finEstacion !== null && ms(p.finEstacion) <= ms(p.ahora);
}

export function estadoFrescura(e: EntradaEstado): EstadoFrescura {
  const temporadaPasada = esTemporadaPasada(e);
  const sinTemporada = e.temporada === null;
  const rapidezUsable = e.dudosa || e.esClasico ? null : e.rapidez;
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
    const t = tramoDe(e.reloj.segundos, e.vara.cortes, e.vara.curva.tMax);
    if (t === null) base = { tipo: "sin_vara" };
    else if (t.tramo === "nueva" && e.reloj.alMenos) base = { tipo: "sin_edad_conocida" };
    else {
      // El tramo es un piso si el reloj lo es, o si la curva no llega hasta su reloj.
      base = { tipo: "semaforo", tramo: t.tramo, alMenos: e.reloj.alMenos || t.alMenos };
      tramo = t.tramo;
    }
  }
  const recientes = recientesDe(e.ventasRecientes, e.reloj.segundos);
  const quieta = estaQuieta({ tramo, temporadaPasada, rapidez: rapidezUsable, recientes, pisoHoy: e.pisoHoy });
  // D4+D6: sin tramo firme (sin referencia, sin ventas en la sede, sin edad conocida o un tramo que es solo un piso),
  // colgada al menos 30 días y sin ninguna venta en los últimos 30. Ni el clásico ni la dudosa: tienen su propio estado.
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
};

export type FrescuraPrenda = {
  clave: string;
  productoId: string;
  productoNombre: string;
  codigo: string | null;
  colorCodigo: string | null;
  colorNombre: string | null;
  categoriaId: string;
  categoriaNombre: string;
  tallas: { varianteId: string; talla: string | null; pisoHoy: number; almacenHoy: number }[];
  pisoHoy: number;
  almacenHoy: number;
  reloj: RelojNovedad;
  primeraExhibicion: string | null;
  /** La última llegada de cualquiera de sus tallas a ESTA sede (incluye la recepción de un traslado). */
  ultimaLlegada: string | null;
  /** La última vez que su modelo+color llegó A CAYLA (de aquí sale `finEstacion`, D1). La pantalla lo dice junto a
   *  «Temporada pasada»: la tienda que la recibió trasladada la semana pasada tiene que ver por qué ya pasó. */
  ultimaLlegadaCayla: string | null;
  temporada: string | null;
  temporadaOrigen: TallaFrescuraCruda["temporadaOrigen"];
  esClasico: boolean;
  finEstacion: string | null;
  rapidez: Rapidez | null;
  /** Unidades vendidas en la sede en los últimos `DIAS_CALLADA` días (null si la lectura no los cubre). */
  ventasRecientes: number | null;
  /**
   * Contra qué se ubicó su tramo y se midió su rapidez: su categoría SIN ella (cortes, observación más larga y ventas con
   * edad conocida del resto). Null para el clásico y la dudosa, que no se miden. PASO 4: la pantalla tiene que decir que
   * cada prenda se mide sin ella; la cabecera de la categoría (`VaraCategoria`) muestra la curva completa, y una prenda
   * que es mucho de su categoría puede quedar en un tramo que esos cortes no explican (D5).
   */
  categoriaSinElla: { cortes: Cortes; tMax: number; vendidas: number } | null;
  estado: EstadoFrescura;
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
};

export type FrescuraSede = {
  separaPiso: true;
  desde: string;
  ahora: string;
  categorias: VaraCategoria[];
  prendas: FrescuraPrenda[];
  cifras: CifrasSede;
};

/** Lo que una sede aporta a la referencia de CAYLA: por categoría, sus unidades con edad conocida en cada ventana (se
 *  calculan al pedirlas y quedan guardadas). Vive en el servidor: no va a la pantalla. */
export type ObservacionesSede = Record<string, { nombre: string; unidadesEn: (dias: number) => readonly Observacion[] }>;

const SIN_CATEGORIA = "";
const NOMBRE_SIN_CATEGORIA = "Sin categoría";

function aVaraCategoria(categoriaId: string, categoriaNombre: string, v: Vara): VaraCategoria {
  return {
    categoriaId,
    categoriaNombre,
    ventanaDias: v.ventanaDias,
    cortes: v.cortes,
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
 */
export function analizarSede(l: LecturaFrescuraConPiso): { sede: FrescuraSede; observaciones: ObservacionesSede } {
  const tardiasPorOid = new Map<string, number>();
  for (const t of l.tardias) tardiasPorOid.set(t.oid, (tardiasPorOid.get(t.oid) ?? 0) + t.unidadesTardias);
  const dudosas = new Set(l.dudosas);
  const desdeMs = ms(l.desde);
  const ahoraMs = ms(l.ahora);
  // Las ventas «recientes» solo se pueden contar si la lectura cubre esos días (con p_dias < 30, no se sabe).
  const recientesDesdeMs = ahoraMs - DIAS_CALLADA * MS_POR_DIA;
  const cubreRecientes = desdeMs <= recientesDesdeMs;

  // Unidades de cada talla en cada ventana (solo lo que entra a la vara de su categoría) y en toda la lectura (lo que
  // mide su rapidez), calculadas al pedirlas. Si la ventana empieza antes que la lectura, es la lectura entera.
  const unidadesDeTalla = new Map<string, UnidadesDeTalla>();
  const tallasDeCategoria = new Map<string, { nombre: string; ids: string[] }>();
  for (const talla of l.tallas) {
    const cat = talla.categoriaId ?? SIN_CATEGORIA;
    const grupo = tallasDeCategoria.get(cat) ?? { nombre: talla.categoriaNombre ?? NOMBRE_SIN_CATEGORIA, ids: [] };
    tallasDeCategoria.set(cat, grupo);
    if (talla.esClasico || dudosas.has(talla.varianteId)) continue;
    grupo.ids.push(talla.varianteId);
    const limpios = excluirTardias(l.eventos[talla.varianteId] ?? [], tardiasPorOid);
    const todas = unaVez(() => unidadesParaVara(limpios, l.ahora));
    unidadesDeTalla.set(talla.varianteId, {
      todas,
      enVentana: porVentana((d) => {
        const inicioMs = ahoraMs - d * MS_POR_DIA;
        return inicioMs <= desdeMs ? todas() : unidadesParaVara(recortarEventos(limpios, new Date(inicioMs).toISOString()), l.ahora);
      }),
    });
  }
  const observaciones: ObservacionesSede = {};
  for (const [cat, { nombre, ids }] of tallasDeCategoria) {
    if (ids.length === 0) continue;
    observaciones[cat] = { nombre, unidadesEn: porVentana((d) => ids.flatMap((id) => unidadesDeTalla.get(id)!.enVentana(d).observaciones)) };
  }

  // La vara de cada categoría que tiene prendas en la sede (aunque no tenga unidades con edad conocida).
  const varas = new Map<string, { nombre: string; vara: Vara }>();
  for (const [cat, { nombre }] of tallasDeCategoria) {
    varas.set(cat, { nombre, vara: varaPorVentanas(observaciones[cat]?.unidadesEn ?? (() => [])) });
  }

  // Las tallas, juntas por prenda (modelo+color).
  const porPrenda = new Map<string, TallaFrescuraCruda[]>();
  for (const talla of l.tallas) {
    const k = clavePrendaDe(talla.productoId, talla.colorCodigo, talla.colorNombre);
    const lista = porPrenda.get(k);
    if (lista) lista.push(talla);
    else porPrenda.set(k, [talla]);
  }

  const prendas: FrescuraPrenda[] = [];
  for (const [clave, tallas] of porPrenda) {
    const f = tallas[0];
    const cat = f.categoriaId ?? SIN_CATEGORIA;
    const { nombre: categoriaNombre, vara } = varas.get(cat)!;
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
    const eventosPorTalla = tallas.map((t) => l.eventos[t.varianteId] ?? []);
    const reloj = relojNovedad({ eventosPorTalla, primeraExhibicion: primeras[0] ?? null, desde: l.desde, ahora: l.ahora });
    let ventasRecientes: number | null = null;
    if (cubreRecientes) {
      ventasRecientes = 0;
      for (const eventos of eventosPorTalla) for (const e of eventos) if (e.esVenta && e.delta < 0 && ms(e.ts) >= recientesDesdeMs) ventasRecientes -= e.delta;
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
    const resto = medibles.length > 0 ? contraElResto(vara.curva, propiasObs, suyasObs) : null;
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
      vara: resto === null ? vara : { nivel: vara.nivel, cortes: resto.cortes, curva: { tMax: resto.tMax } },
      reloj,
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
      tallas: tallas.map((t) => ({ varianteId: t.varianteId, talla: t.talla, pisoHoy: t.pisoHoy, almacenHoy: t.almacenHoy })),
      pisoHoy,
      almacenHoy,
      reloj,
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
      estado,
    });
  }
  prendas.sort((a, b) => a.categoriaNombre.localeCompare(b.categoriaNombre, "es") || b.reloj.segundos - a.reloj.segundos || a.clave.localeCompare(b.clave));

  const categorias = [...varas.entries()]
    .map(([id, { nombre, vara }]) => aVaraCategoria(id, nombre, vara))
    .sort((a, b) => a.categoriaNombre.localeCompare(b.categoriaNombre, "es"));

  return {
    sede: { separaPiso: true, desde: l.desde, ahora: l.ahora, categorias, prendas, cifras: cifrasSede(prendas) },
    observaciones,
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
    .map(([cat, nombre]) => aVaraCategoria(cat, nombre, varaPorVentanas((d) => sedes.flatMap((sede) => sede[cat]?.unidadesEn(d) ?? []))))
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
/** Las dos lecturas de Frescura. En el servidor: `(fn, args) => supabase.rpc(fn, args)`. */
export type LlamarRpcFrescura = (
  fn: "fn_frescura_sede" | "fn_confianza_registro",
  args: { p_ubicacion_id: string; p_dias: number } | Record<string, never>,
) => PromiseLike<RespuestaRpc>;

/** El aviso para la pantalla, sin jerga de Postgres. La pista `frescura_sin_permiso` es un «no tienes acceso», no un fallo. */
function avisoFrescura(que: string, error: RespuestaRpc["error"]): string {
  if (error?.hint === "frescura_sin_permiso") return `No tienes acceso a ${que}.`;
  return `No se pudo cargar ${que}. Lo demás de esta pantalla sí está al día.`;
}

async function leerSedeFrescura(
  rpc: LlamarRpcFrescura,
  u: { id: string; nombre: string },
  dias: number,
): Promise<{ fila: FrescuraDeSede; observaciones: ObservacionesSede | null }> {
  const que = `la frescura de ${u.nombre}`;
  const fila = (lectura: FrescuraDeSede["lectura"]): FrescuraDeSede => ({ ubicacionId: u.id, nombre: u.nombre, lectura });
  const fallo = (mensaje: string) => ({ fila: fila({ datos: null, fallo: mensaje }), observaciones: null });
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
    if (!lectura.separaPiso) return { fila: fila({ datos: { separaPiso: false }, fallo: null }), observaciones: {} };
    const { sede, observaciones } = analizarSede(lectura);
    return { fila: fila({ datos: sede, fallo: null }), observaciones };
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
 * Frescura del piso para el líder, en una vuelta y EN PARALELO: una `fn_frescura_sede` por tienda (una sola lectura del
 * libro por sede) y una `fn_confianza_registro` para todas. Las lecturas que fallan vuelven con su aviso; ninguna tumba
 * la pantalla.
 */
export async function armarFrescuraLider(
  tiendas: readonly { id: string; nombre: string }[],
  rpc: LlamarRpcFrescura,
  dias: number,
): Promise<FrescuraLider> {
  const [lecturas, confianza] = await Promise.all([Promise.all(tiendas.map((t) => leerSedeFrescura(rpc, t, dias))), leerConfianzaFrescura(rpc)]);

  const caidas = lecturas.filter((l) => l.observaciones === null).map((l) => l.fila.nombre);
  const cayla: Tolerado<VaraCategoria[]> =
    caidas.length > 0
      ? { datos: null, fallo: `La referencia de CAYLA necesita todas las tiendas y falta ${caidas.join(", ")}.` }
      : { datos: referenciaCayla(lecturas.map((l) => l.observaciones ?? {})), fallo: null };

  return { sedes: lecturas.map((l) => l.fila), confianza, referenciaCayla: cayla };
}
