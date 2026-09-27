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
//   2. EL RELOJ DE NOVEDAD de la prenda: los segundos con alguna de sus tallas en el piso desde la primera vez que se
//      colgó en la sede. Nunca se reinicia (una prenda repuesta no vuelve a ser Nueva) y no corre agotada ni guardada.
//   3. LA RAPIDEZ: cuántas vendió contra cuántas habría vendido una prenda típica de su categoría con los mismos días
//      colgada. Separa «vieja y lenta» (quieta) de «vieja pero se sigue vendiendo» (un pilar, que nunca va al perchero).
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

/** Las marcas de cada evento de `fn_frescura_sede` (bits). */
export const MARCA_VENTA = 1;
export const MARCA_INTERNO = 2;
export const MARCA_EDAD_DESCONOCIDA = 4;

const MS_POR_DIA = 86_400_000;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Los tres niveles de confianza de una cifra (ADR-0208, decisión 5 del bloque 3): 1-9, 10-19, 20 o más. */
export type NivelConfianza = "pocos_datos" | "aceptable" | "solido";
export type Tramo = "nueva" | "vigente" | "envejecida" | "critica";
/** Lo que Frescura puede sugerir. «Rebajar» NO existe: la rebaja es del líder, por sede y en tramos (bloque 7). */
export type Sugerencia = "revisar_ventas" | "cambiar_lugar" | "trasladar" | "retirar" | "guardar_hasta_su_estacion";

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
  /** Fin de la estación de su última llegada a la sede; null sin temporada, clásico todo el año o sin llegada. */
  finEstacion: string | null;
  enEstacionAhora: boolean | null;
  /** La primera vez que esta talla estuvo en el piso de ESTA sede, en todo su historial. */
  primeraExhibicion: string | null;
  ultimaLlegada: string | null;
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
  /** La observación más larga (vendida o no). Un corte que la curva no alcanza queda después de esto. */
  tMax: number;
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
   *  ajuste, o la primera bajada fue tardía). Puede subir de tramo; nunca es «Nueva». */
  alMenos: boolean;
};

/** Vendidas contra esperadas: 100 = igual que su categoría con los mismos días colgada; 200 = el doble de rápido. */
export type Rapidez = { indice: number; vendidas: number; esperadas: number };

type ComunEstado = {
  /** Terminó la estación de su última llegada (solo moda con temporada). */
  temporadaPasada: boolean;
  /** Chip «Sin temporada · complétala»: se mide igual, sin aviso de fin de estación. */
  sinTemporada: boolean;
  /** «Por decidir»: vieja y lenta, o de temporada pasada; nunca un pilar de venta (`estaQuieta`). */
  quieta: boolean;
  sugerencias: Sugerencia[];
};

/** El estado de una prenda en Frescura. Cerrado: la pantalla tiene que decir algo distinto para cada uno. */
export type EstadoFrescura = ComunEstado &
  (
    | { tipo: "semaforo"; tramo: Tramo; alMenos: boolean }
    /** Su categoría no vendió nada con edad conocida en esta sede: solo días colgada y la referencia de CAYLA. */
    | { tipo: "sin_ventas_sede" }
    /** Hay ventas, pero la curva no llega al corte que haría falta para ubicarla («aún sin referencia»). */
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

/**
 * Las unidades con EDAD CONOCIDA de una variante, para la curva: cada venta con los segundos que llevaba colgada; cada
 * salida sin venta (traslado a otra sede, merma) y cada unidad que sigue en la sede como «al menos» esos segundos. Lo que
 * tiene edad desconocida no entra (ADR-0248): su reloj no es su edad.
 */
export function observacionesDe(eventos: readonly EventoPiso[], ahora: string): Observacion[] {
  const { cohortes, salidas } = historiaDeCohortes(eventos);
  const ahoraMs = ms(ahora);
  const obs: Observacion[] = [];
  for (const s of salidas) {
    if (!s.edadDesconocida && s.cantidad > 0) obs.push({ segundos: s.segundosExpuesta, vendida: s.tipo === "venta", peso: s.cantidad });
  }
  for (const c of cohortes) {
    if (c.edadDesconocida || c.cantidadRestante <= 0) continue;
    const abierto = c.abiertaDesde !== null ? Math.max(0, ahoraMs - ms(c.abiertaDesde)) / 1000 : 0;
    obs.push({ segundos: c.segundosAcumulados + abierto, vendida: false, peso: c.cantidadRestante });
  }
  return obs;
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
  const curva: Curva = { tiempos: [], supervivencia: [], riesgoAcumulado: [], tMax: obs.length ? obs[obs.length - 1].segundos : 0, vendidas: 0, unidades };
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
    if (vendidas > 0 && enRiesgo > EPS) {
      s *= 1 - vendidas / enRiesgo;
      h += vendidas / enRiesgo;
      curva.tiempos.push(t);
      curva.supervivencia.push(s);
      curva.riesgoAcumulado.push(h);
      curva.vendidas += vendidas;
    }
    enRiesgo -= salen;
  }
  return curva;
}

/** El último índice de `tiempos` que es ≤ `segundos`, o −1. */
function indiceHasta(curva: Curva, segundos: number): number {
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

/** Ventas esperadas por unidad hasta `segundos` colgada (Nelson-Aalen). */
export function riesgoAcumuladoEn(curva: Curva, segundos: number): number {
  const i = indiceHasta(curva, segundos);
  return i < 0 ? 0 : curva.riesgoAcumulado[i];
}

function corteEn(curva: Curva, queda: number): number | null {
  const i = curva.supervivencia.findIndex((s) => s <= queda + EPS);
  return i < 0 ? null : curva.tiempos[i];
}

/** P50, P75 y P90: el primer instante en que ya se vendió la mitad, 3 de cada 4 y 9 de cada 10. */
export function cortes(curva: Curva): Cortes {
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

/**
 * El tramo de una prenda con `segundos` en el piso, por los cortes de su categoría en su sede. Un corte que la curva no
 * alcanza está MÁS ALLÁ de su observación más larga (`tMax`): si la prenda está antes de eso, igual se sabe que no lo
 * pasó. Null: la prenda ya pasó todo lo que la curva vio y no hay corte con qué seguir («aún sin referencia»).
 */
export function tramoDe(segundos: number, c: Cortes, tMax: number): Tramo | null {
  const pasos: [Tramo, number | null][] = [
    ["nueva", c.p50],
    ["vigente", c.p75],
    ["envejecida", c.p90],
  ];
  for (const [tramo, corte] of pasos) {
    if (corte !== null) {
      if (segundos < corte) return tramo;
    } else {
      return segundos <= tMax ? tramo : null;
    }
  }
  return "critica";
}

// ---------------------------------------------------------------------------
// El reloj de novedad y la rapidez de una prenda
// ---------------------------------------------------------------------------

/**
 * El reloj de novedad de una prenda (modelo+color) en la sede: los segundos con la SUMA de sus tallas en el piso > 0,
 * desde su primera exhibición. Agotada o guardada en el almacén no corre; repuesta sigue desde donde iba (nunca vuelve a
 * «Nueva», ADR-0208 decisión 9). Se mide en tiempo continuo, no por días calendario (plan 3c, corrección 3).
 *
 * `alMenos` cuando no se sabe desde cuándo está: la primera exhibición es anterior a la ventana (`desde`), o lo primero
 * que entró al piso tiene edad desconocida (saldo, carga inicial, ajuste) o fue una bajada tardía (ya estaba colgada).
 * Los eventos van SIN quitar las tardías: el reloj mide lo que el piso registró.
 */
export function relojNovedad(p: {
  eventosPorTalla: readonly (readonly EventoPiso[])[];
  primeraExhibicion: string | null;
  desde: string;
  ahora: string;
  oidsTardios?: ReadonlySet<string>;
}): RelojNovedad {
  // La hora de cada evento se lee UNA vez (ordenar comparando textos de fecha la leía en cada comparación).
  const todos = p.eventosPorTalla
    .flat()
    .map((e) => ({ e, t: ms(e.ts) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  const desdeMs = ms(p.desde);
  const ahoraMs = ms(p.ahora);
  let nivel = 0;
  let segundos = 0;
  let previo = desdeMs;
  for (const { e, t: cuando } of todos) {
    const t = Math.min(ahoraMs, Math.max(previo, cuando));
    if (nivel > 0) segundos += (t - previo) / 1000;
    nivel += e.delta;
    previo = t;
  }
  if (nivel > 0) segundos += Math.max(0, ahoraMs - previo) / 1000;

  const entradas = todos.filter((x) => x.e.delta > 0);
  if (p.primeraExhibicion === null) return { segundos, alMenos: entradas.length > 0 };
  if (ms(p.primeraExhibicion) < desdeMs) return { segundos, alMenos: true };
  const primera = entradas[0];
  const deLaPrimera = primera ? entradas.filter((x) => x.t === primera.t).map((x) => x.e) : [];
  const desconocida = deLaPrimera.some((e) => e.edadDesconocida === true || (e.oid !== undefined && p.oidsTardios?.has(e.oid) === true));
  return { segundos, alMenos: desconocida };
}

/**
 * La rapidez de una prenda contra su categoría A LA MISMA EDAD: cuántas vendió contra cuántas habría vendido una prenda
 * típica de su categoría con los mismos segundos colgada (Σ del riesgo acumulado de la curva en los segundos de cada una
 * de sus unidades). 100 = igual; 200 = el doble de rápido. Solo unidades con edad conocida (son las de la curva).
 * Null («sin dato») con menos de `RAPIDEZ_MIN_EVIDENCIA` entre vendidas y esperadas: una prenda recién colgada que no
 * vendió todavía no es «lenta», es «sin dato» (plan 3c, corrección 4).
 */
export function rapidez(observaciones: readonly Observacion[], curva: Curva): Rapidez | null {
  let vendidas = 0;
  let esperadas = 0;
  for (const o of observaciones) {
    if (o.peso <= 0) continue;
    if (o.vendida) vendidas += o.peso;
    esperadas += o.peso * riesgoAcumuladoEn(curva, o.segundos);
  }
  // Si la prenda vendió, esa venta está en la curva de su categoría (sus unidades son parte de ella), así que el riesgo
  // acumulado en ese instante ya es > 0: `esperadas` solo es 0 cuando tampoco vendió.
  if (vendidas + esperadas < RAPIDEZ_MIN_EVIDENCIA || esperadas <= EPS) return null;
  return { indice: Math.round((vendidas / esperadas) * 100), vendidas, esperadas: Math.round(esperadas * 100) / 100 };
}

/** Un pilar de venta: se vende como su categoría o más rápido, a la misma edad. Nunca va al perchero. */
export function esPilar(r: Rapidez | null): boolean {
  return r !== null && r.indice >= RAPIDEZ_IGUAL;
}

// ---------------------------------------------------------------------------
// Quieta, sugerencias y estado
// ---------------------------------------------------------------------------

/**
 * «Por decidir»: la prenda está en el piso y es (Envejecida o Crítica) Y más lenta que su categoría, o su temporada ya
 * pasó. Un pilar de venta nunca (ADR-0208, plan 3c: «vieja y lenta», no solo «vieja»). Sin dato de rapidez no es
 * «lenta»: una prenda de la carga inicial que se vende bien no va al perchero por falta de dato.
 */
export function estaQuieta(p: { tramo: Tramo | null; temporadaPasada: boolean; rapidez: Rapidez | null; pisoHoy: number }): boolean {
  if (p.pisoHoy <= 0 || esPilar(p.rapidez)) return false;
  const vieja = p.tramo === "envejecida" || p.tramo === "critica";
  const lenta = p.rapidez !== null && p.rapidez.indice < RAPIDEZ_IGUAL;
  return (vieja && lenta) || p.temporadaPasada;
}

/** «Trasladar» mueve mercadería entre sedes: solo con una vara «Sólido», algo en el almacén y dato de rapidez. */
export function puedeTrasladar(p: { nivel: NivelConfianza | null; almacenHoy: number; rapidez: Rapidez | null }): boolean {
  return p.nivel === "solido" && p.almacenHoy > 0 && p.rapidez !== null;
}

/**
 * Lo que se sugiere, en el orden de la escalera de ADR-0208 (decisión 11) sin su último escalón: primero mirar, después
 * cambiarla de lugar 7 días, después trasladarla; con la temporada pasada, además retirarla (ADR-0246, decisión 10). La
 * rebaja no se sugiere nunca aquí.
 */
export function sugerenciasDe(p: {
  quieta: boolean;
  tramo: Tramo | null;
  temporadaPasada: boolean;
  fueraDeSuEstacion: boolean;
  rapidez: Rapidez | null;
  nivel: NivelConfianza | null;
  pisoHoy: number;
  almacenHoy: number;
}): Sugerencia[] {
  const s: Sugerencia[] = [];
  if (p.fueraDeSuEstacion && p.pisoHoy > 0) s.push("guardar_hasta_su_estacion");
  const vieja = p.tramo === "envejecida" || p.tramo === "critica";
  if (p.rapidez === null && (p.quieta || (vieja && p.pisoHoy > 0))) s.push("revisar_ventas");
  if (p.quieta) {
    s.push("cambiar_lugar");
    if (puedeTrasladar(p)) s.push("trasladar");
    if (p.temporadaPasada) s.push("retirar");
  }
  return s;
}

export type EntradaEstado = {
  dudosa: boolean;
  esClasico: boolean;
  temporada: string | null;
  finEstacion: string | null;
  enEstacionAhora: boolean | null;
  ahora: string;
  vara: Pick<Vara, "cortes" | "nivel"> & { curva: Pick<Curva, "tMax"> };
  reloj: RelojNovedad;
  rapidez: Rapidez | null;
  pisoHoy: number;
  almacenHoy: number;
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
    else if (t === "nueva" && e.reloj.alMenos) base = { tipo: "sin_edad_conocida" };
    else {
      base = { tipo: "semaforo", tramo: t, alMenos: e.reloj.alMenos };
      tramo = t;
    }
  }
  const quieta = estaQuieta({ tramo, temporadaPasada, rapidez: rapidezUsable, pisoHoy: e.pisoHoy });
  const sugerencias = sugerenciasDe({
    quieta,
    tramo,
    temporadaPasada,
    fueraDeSuEstacion: base.tipo === "clasico" && base.fueraDeSuEstacion,
    rapidez: rapidezUsable,
    nivel: e.vara.nivel,
    pisoHoy: e.pisoHoy,
    almacenHoy: e.almacenHoy,
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
  ultimaLlegada: string | null;
  temporada: string | null;
  temporadaOrigen: TallaFrescuraCruda["temporadaOrigen"];
  esClasico: boolean;
  finEstacion: string | null;
  rapidez: Rapidez | null;
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

/**
 * La sede entera: eventos sin tardías → unidades por ventana → vara de cada categoría (sin clásicos ni dudosas) → reloj,
 * rapidez y estado de cada prenda. `observaciones` sirve para la referencia de CAYLA (`referenciaCayla`).
 */
export function analizarSede(l: LecturaFrescuraConPiso): { sede: FrescuraSede; observaciones: ObservacionesSede } {
  const tardiasPorOid = new Map<string, number>();
  for (const t of l.tardias) tardiasPorOid.set(t.oid, (tardiasPorOid.get(t.oid) ?? 0) + t.unidadesTardias);
  const oidsTardios = new Set(tardiasPorOid.keys());
  const dudosas = new Set(l.dudosas);
  const desdeMs = ms(l.desde);
  const ahoraMs = ms(l.ahora);

  // Unidades de cada talla en cada ventana (solo lo que entra a la vara de su categoría), calculadas al pedirlas.
  const unidadesDeTalla = new Map<string, (dias: number) => Observacion[]>();
  const tallasDeCategoria = new Map<string, { nombre: string; ids: string[] }>();
  for (const talla of l.tallas) {
    const cat = talla.categoriaId ?? SIN_CATEGORIA;
    const grupo = tallasDeCategoria.get(cat) ?? { nombre: talla.categoriaNombre ?? NOMBRE_SIN_CATEGORIA, ids: [] };
    tallasDeCategoria.set(cat, grupo);
    if (talla.esClasico || dudosas.has(talla.varianteId)) continue;
    grupo.ids.push(talla.varianteId);
    const limpios = excluirTardias(l.eventos[talla.varianteId] ?? [], tardiasPorOid);
    unidadesDeTalla.set(
      talla.varianteId,
      porVentana((d) => {
        const inicioMs = ahoraMs - d * MS_POR_DIA;
        return observacionesDe(inicioMs <= desdeMs ? limpios : recortarEventos(limpios, new Date(inicioMs).toISOString()), l.ahora);
      }),
    );
  }
  const observaciones: ObservacionesSede = {};
  for (const [cat, { nombre, ids }] of tallasDeCategoria) {
    if (ids.length === 0) continue;
    observaciones[cat] = { nombre, unidadesEn: porVentana((d) => ids.flatMap((id) => unidadesDeTalla.get(id)!(d))) };
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
    // La estación de la ÚLTIMA llegada de cualquiera de sus tallas manda (plan 3c, «Temporada pasada»).
    const conFin = tallas.filter((t) => t.finEstacion !== null).sort((a, b) => compararInstantes(b.finEstacion!, a.finEstacion!));
    const finEstacion = conFin[0]?.finEstacion ?? null;
    const enEstacionAhora = (conFin[0] ?? tallas.find((t) => t.enEstacionAhora !== null))?.enEstacionAhora ?? null;
    const primeras = tallas.map((t) => t.primeraExhibicion).filter((x): x is string => x !== null).sort(compararInstantes);
    const llegadas = tallas.map((t) => t.ultimaLlegada).filter((x): x is string => x !== null).sort(compararInstantes);
    const pisoHoy = tallas.reduce((s, t) => s + t.pisoHoy, 0);
    const almacenHoy = tallas.reduce((s, t) => s + t.almacenHoy, 0);
    const reloj = relojNovedad({
      eventosPorTalla: tallas.map((t) => l.eventos[t.varianteId] ?? []),
      primeraExhibicion: primeras[0] ?? null,
      desde: l.desde,
      ahora: l.ahora,
      oidsTardios,
    });
    const r =
      esClasico || dudosa
        ? null
        : rapidez(
            tallas.flatMap((t) => unidadesDeTalla.get(t.varianteId)?.(vara.ventanaDias) ?? []),
            vara.curva,
          );
    const estado = estadoFrescura({
      dudosa,
      esClasico,
      temporada,
      finEstacion,
      enEstacionAhora,
      ahora: l.ahora,
      vara,
      reloj,
      rapidez: r,
      pisoHoy,
      almacenHoy,
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
      temporada,
      temporadaOrigen: tallas.find((t) => t.temporada !== null)?.temporadaOrigen ?? null,
      esClasico,
      finEstacion,
      rapidez: r,
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
