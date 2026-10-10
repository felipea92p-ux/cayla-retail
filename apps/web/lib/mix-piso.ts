import type { CategoriaMix, GrupoMix } from "./plan-piso-grupos";
import type { LecturaDelPiso } from "./piso-plan";
import { codigoDeSede, META_DE_VENTA_FUERA_DEL_RIEL, PARTIDA_DEL_RIEL, type CodigoSede, type MetaDeVenta } from "./mix-piso-partida";

/**
 * La propuesta del mix del piso frente a lo que hay hoy (ADR-0329, «Actualización 2026-10-04»; investigación del 2026-10-05).
 *
 * El primer mix sale del punto de partida de la industria (`mix-piso-partida.ts`) y la venta propia le va ganando peso. Aquí está
 * el cálculo, puro y sin red: qué cuelga hoy por grupo, qué dice la venta propia (con su rango de error), cuánto pesa, y cuántas
 * prendas le tocan a cada grupo para que el reparto sume EXACTAMENTE la capacidad de la sede.
 *
 * LAS TRES DECISIONES MATEMÁTICAS (investigación del 2026-10-05, §3.2):
 *  1. El peso de la venta propia se mide en PRENDAS CONFIRMADAS, no en días: `n_ef / (n_ef + K)`. El peso viejo, `días / (días + 28)`,
 *     cuenta días (un día de TRU no es un día de AQP) y supone que la industria y TRU difieren solo ±1,7 puntos, lo que los propios
 *     catálogos desmienten (Topitop y Oechsle difieren 11 puntos en polos). Es la forma del estimador bayesiano empírico
 *     (Brown 2008, ec. 4.4): peso = n / (n + n₀), con n₀ = lo que vale la industria, expresado en ventas.
 *  2. Solo cuentan las ventas CONFIRMADAS (escaneadas, con su prenda real): las «sin registrar» llevan una categoría puesta a mano y,
 *     hoy, son ≈ 7 de cada 10 en TRU. Se muestran aparte; no mueven la propuesta hasta que se regularicen.
 *  3. El peso tiene TECHO: la venta de un grupo repite el espacio que ya tenía (lo que más cuelga, más vende), así que nunca
 *     gobierna sola (ADR-0329, decisión 4: el mix no se deriva de las ventas).
 *
 * PROMETE: un reparto en prendas que suma la capacidad (o ninguno si no se conoce), sin números inventados: lo que no se puede
 * calcular sale `null` con su motivo, nunca 0. ASUME: `categorias` trae el grupo de cada categoría activa (`fn_categorias_grupo_mix`).
 */

/** Cuánto vale el punto de partida de la industria, expresado en ventas confirmadas (n₀). Es CRITERIO, no dato: equivale a decir que el mix
 *  real de una sede puede apartarse del de la industria ≈ ±6 puntos en una categoría del 26 % (`p(1−p)/τ² − 1`, τ = 6 puntos). */
export const PESO_DE_LA_INDUSTRIA = 50;
/** Una cliente que se lleva varias prendas cuenta como varias ventas que no son independientes: la muestra efectiva es menor. Criterio. */
export const EFECTO_DE_DISENO = 1.5;
/** El techo del peso de la venta propia (el mismo 75 % que Felipe fijó para los tres meses, ADR-0329 act. 2026-10-04, punto 3). */
export const PESO_MAXIMO_DE_LA_VENTA = 0.75;

export type EntradaMix = {
  grupos: readonly GrupoMix[];
  categorias: readonly CategoriaMix[];
  /** La lectura del motor del piso de ESA sede: lo colgado por categoría y las ventas de la ventana (`fn_piso_plan_lectura`). */
  lectura: LecturaDelPiso;
  /** m² × densidad de la sede (`fn_capacidad_piso`); `null` si no la tiene. */
  capacidad: number | null;
  /** El código corto de la sede (`codigoDeTienda`): «tru», «aqp», «lim» u otro. */
  codigoSede: string;
};

export type FilaDelRiel = {
  grupo: GrupoMix;
  /** Prendas libres colgadas en el piso hoy, de las categorías de este grupo. */
  colgadas: number;
  /** % del riel que ocupa hoy; `null` si no hay nada colgado en ningún grupo. */
  hoyPct: number | null;
  /** Ventas confirmadas (escaneadas) del grupo en la ventana y las «sin registrar» pendientes (no cuentan para la propuesta). */
  ventasConfirmadas: number;
  ventasAnotadas: number;
  /** % de las ventas confirmadas del riel; `null` si todavía no hay ninguna confirmada. */
  ventaPct: number | null;
  /** Entre qué porcentajes estaría la venta real de este grupo el 95 % de las veces (intervalo de Wilson con la muestra efectiva); `null` si no hay ventas.
   *  No es «± algo»: con 0 ventas de un grupo, el rango llega hasta ≈ 7 %, y un «0 % ± 0» diría «seguro que no se vende». */
  rangoDeVenta: { desde: number; hasta: number } | null;
  /** El punto de partida de la industria para esta sede; `null` si la sede no tiene uno. */
  partidaPct: number | null;
  /** La propuesta (partida y venta mezcladas); `null` sin punto de partida. */
  propuestaPct: number | null;
  /** Prendas que le tocan, sumando EXACTAMENTE la capacidad; `null` sin capacidad o sin propuesta. */
  propuestaPrendas: number | null;
  /** Propuesta − hoy, en prendas: positivo = faltan, negativo = sobran; `null` si falta alguno de los dos. */
  diferencia: number | null;
};

export type FilaFueraDelRiel = {
  grupo: GrupoMix;
  colgadas: number;
  ventasConfirmadas: number;
  /** % de TODAS las ventas confirmadas (riel y fuera del riel); `null` si no hay ventas confirmadas. */
  ventaPct: number | null;
  /** La meta de la sede como % de la venta; `null` si la sede no lo lleva o no tiene punto de partida. */
  meta: MetaDeVenta;
  /** La sede no lleva este grupo (LIM, bolsos y calzado). */
  noLoLleva: boolean;
};

export type PropuestaMix = {
  /** Por qué no hay propuesta (la sede no es de las tres, no tiene piso de venta…). Con motivo, `enRiel` trae solo lo de hoy. */
  motivoSinPropuesta: string | null;
  codigoSede: CodigoSede | null;
  enRiel: FilaDelRiel[];
  fueraDelRiel: FilaFueraDelRiel[];
  capacidad: number | null;
  /** Lo colgado en total en el riel (todos los grupos). */
  colgadasEnElRiel: number;
  ventasConfirmadasDelRiel: number;
  ventasAnotadasDelRiel: number;
  /** Muestra efectiva (confirmadas ÷ efecto de diseño) y el peso que tiene la venta propia en la propuesta (0 a `PESO_MAXIMO`). */
  muestraEfectiva: number;
  pesoDeLaVenta: number;
  /** Días de la ventana de ventas. */
  dias: number;
  /** El piso de la sede ya se cuadró: sin cuadre, «lo que cuelga hoy» no es confiable (TRU: 138 en el sistema contra 600–750 reales). */
  cuadrado: boolean;
  /** Lo que cuelga o se vendió de categorías que no pertenecen a ningún grupo («Sin grupo»): no entra al reparto, pero se dice. */
  sinGrupo: { colgadas: number; ventasConfirmadas: number; categorias: number };
};

/** Reparte `total` prendas según `fracciones` (que suman 1) con el método del resto mayor: la suma sale EXACTA y ninguna difiere de su
 *  parte proporcional en más de una prenda. Los empates los gana el primero de la lista. */
export function repartirEnPrendas(fracciones: readonly number[], total: number): number[] {
  const base = fracciones.map((f) => Math.floor(f * total + 1e-9));
  let faltan = total - base.reduce((a, b) => a + b, 0);
  const restos = fracciones.map((f, i) => ({ i, resto: f * total - base[i]! })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of restos) {
    if (faltan <= 0) break;
    base[i]!++;
    faltan--;
  }
  return base;
}

const redondear = (x: number, decimales = 1) => Math.round(x * 10 ** decimales) / 10 ** decimales;

/** El intervalo de Wilson al 95 % de una proporción `p` con `n` observaciones efectivas, en %. A diferencia de «p ± 1,96·√(p(1−p)/n)», no se
 *  degenera en 0 cuando `p` es 0 ni se sale de 0–100. */
export function rangoDeWilson(p: number, n: number): { desde: number; hasta: number } {
  const z2 = 1.96 * 1.96;
  const denom = 1 + z2 / n;
  const centro = (p + z2 / (2 * n)) / denom;
  const mitad = (1.96 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { desde: redondear(Math.max(0, centro - mitad) * 100), hasta: redondear(Math.min(1, centro + mitad) * 100) };
}

/** El peso de la venta propia: `n_ef / (n_ef + n₀)` con techo. Sin ventas confirmadas, 0 (la propuesta es la de la industria, tal cual). */
export function pesoDeLaVenta(ventasConfirmadas: number): { muestraEfectiva: number; peso: number } {
  const muestraEfectiva = Math.max(0, ventasConfirmadas) / EFECTO_DE_DISENO;
  const peso = muestraEfectiva === 0 ? 0 : Math.min(PESO_MAXIMO_DE_LA_VENTA, muestraEfectiva / (muestraEfectiva + PESO_DE_LA_INDUSTRIA));
  return { muestraEfectiva, peso };
}

export function armarPropuesta(e: EntradaMix): PropuestaMix {
  const codigo = codigoDeSede(e.codigoSede);
  const grupoDeCategoria = new Map<string, string>();
  for (const c of e.categorias) if (c.grupoClave !== null) grupoDeCategoria.set(c.categoriaId, c.grupoClave);
  const clavesConocidas = new Set(e.grupos.map((g) => g.clave));
  const grupoDe = (categoriaId: string | null): string | null => {
    const g = categoriaId ? grupoDeCategoria.get(categoriaId) : undefined;
    return g !== undefined && clavesConocidas.has(g) ? g : null;
  };

  // Lo colgado por grupo (el mismo número que el motor del piso: lo libre en el piso) y lo que no tiene grupo.
  const colgadas = new Map<string, number>();
  let colgadasSinGrupo = 0;
  for (const t of e.lectura.tallas) {
    const n = Math.max(0, t.pisoLibre);
    const g = grupoDe(t.categoriaId);
    if (g === null) colgadasSinGrupo += n;
    else colgadas.set(g, (colgadas.get(g) ?? 0) + n);
  }
  // Las ventas de la ventana por grupo: confirmadas (escaneadas) y «sin registrar» (anotadas, pendientes).
  const confirmadas = new Map<string, number>();
  const anotadas = new Map<string, number>();
  let confirmadasSinGrupo = 0;
  for (const v of e.lectura.ventas) {
    const g = grupoDe(v.categoriaId);
    if (g === null) {
      confirmadasSinGrupo += Math.max(0, v.escaneadas);
      continue;
    }
    confirmadas.set(g, (confirmadas.get(g) ?? 0) + Math.max(0, v.escaneadas));
    anotadas.set(g, (anotadas.get(g) ?? 0) + Math.max(0, v.anotadas));
  }
  const categoriasSinGrupo = e.categorias.filter((c) => grupoDe(c.categoriaId) === null).length;

  const delRiel = e.grupos.filter((g) => g.enRiel);
  const fuera = e.grupos.filter((g) => !g.enRiel);
  const colgadasEnElRiel = delRiel.reduce((s, g) => s + (colgadas.get(g.clave) ?? 0), 0);
  const ventasDelRiel = delRiel.reduce((s, g) => s + (confirmadas.get(g.clave) ?? 0), 0);
  const anotadasDelRiel = delRiel.reduce((s, g) => s + (anotadas.get(g.clave) ?? 0), 0);
  const ventasFuera = fuera.reduce((s, g) => s + (confirmadas.get(g.clave) ?? 0), 0);
  const ventasTotales = ventasDelRiel + ventasFuera;

  let motivoSinPropuesta: string | null = null;
  if (!e.lectura.separaPiso) motivoSinPropuesta = "Esta sede no tiene piso de venta: el plan del piso es de las tiendas.";
  else if (codigo === null) motivoSinPropuesta = "Esta sede todavía no tiene un punto de partida: hoy solo lo hay para las tres tiendas (TRU, AQP y LIM).";

  const { muestraEfectiva, peso } = pesoDeLaVenta(ventasDelRiel);
  const partida = codigo ? PARTIDA_DEL_RIEL[codigo] : null;

  // Propuesta: la partida y la venta, mezcladas con el peso de la venta. Ambas son un reparto entre los grupos del riel que suma 1.
  const sumaPartida = partida ? delRiel.reduce((s, g) => s + (partida[g.clave] ?? 0), 0) : 0;
  const partidaDe = (g: GrupoMix): number | null => (partida && sumaPartida > 0 ? (partida[g.clave] ?? 0) / sumaPartida : null);
  const propuesta = delRiel.map((g) => {
    const p0 = partidaDe(g);
    if (p0 === null || motivoSinPropuesta) return null;
    const v = ventasDelRiel > 0 ? (confirmadas.get(g.clave) ?? 0) / ventasDelRiel : 0;
    return peso * v + (1 - peso) * p0;
  });
  const prendas = propuesta.every((p) => p !== null) && e.capacidad !== null && !motivoSinPropuesta ? repartirEnPrendas(propuesta as number[], e.capacidad) : null;

  const enRiel: FilaDelRiel[] = delRiel.map((grupo, i) => {
    const col = colgadas.get(grupo.clave) ?? 0;
    const conf = confirmadas.get(grupo.clave) ?? 0;
    const ventaFrac = ventasDelRiel > 0 ? conf / ventasDelRiel : null;
    const propuestaPrendas = prendas ? prendas[i]! : null;
    return {
      grupo,
      colgadas: col,
      hoyPct: colgadasEnElRiel > 0 ? redondear((col / colgadasEnElRiel) * 100) : null,
      ventasConfirmadas: conf,
      ventasAnotadas: anotadas.get(grupo.clave) ?? 0,
      ventaPct: ventaFrac !== null ? redondear(ventaFrac * 100) : null,
      rangoDeVenta: ventaFrac !== null && muestraEfectiva > 0 ? rangoDeWilson(ventaFrac, muestraEfectiva) : null,
      partidaPct: partidaDe(grupo) !== null ? redondear((partidaDe(grupo) as number) * 100) : null,
      propuestaPct: propuesta[i] !== null && propuesta[i] !== undefined ? redondear((propuesta[i] as number) * 100) : null,
      propuestaPrendas,
      diferencia: propuestaPrendas !== null ? propuestaPrendas - col : null,
    };
  });

  const metas = codigo ? META_DE_VENTA_FUERA_DEL_RIEL[codigo] : null;
  const fueraDelRiel: FilaFueraDelRiel[] = fuera.map((grupo) => {
    const conf = confirmadas.get(grupo.clave) ?? 0;
    const tieneClave = metas !== null && grupo.clave in metas;
    return {
      grupo,
      colgadas: colgadas.get(grupo.clave) ?? 0,
      ventasConfirmadas: conf,
      ventaPct: ventasTotales > 0 ? redondear((conf / ventasTotales) * 100) : null,
      meta: tieneClave ? (metas as Record<string, MetaDeVenta>)[grupo.clave]! : null,
      noLoLleva: tieneClave && (metas as Record<string, MetaDeVenta>)[grupo.clave] === null,
    };
  });

  return {
    motivoSinPropuesta,
    codigoSede: codigo,
    enRiel,
    fueraDelRiel,
    capacidad: e.capacidad,
    colgadasEnElRiel,
    ventasConfirmadasDelRiel: ventasDelRiel,
    ventasAnotadasDelRiel: anotadasDelRiel,
    muestraEfectiva: redondear(muestraEfectiva),
    pesoDeLaVenta: peso,
    dias: e.lectura.dias,
    cuadrado: e.lectura.cuadradoEn !== null,
    sinGrupo: { colgadas: colgadasSinGrupo, ventasConfirmadas: confirmadasSinGrupo, categorias: categoriasSinGrupo },
  };
}

// ── La lectura de cada grupo, en palabras ─────────────────────────────────────────────────────────────────────────────────────

/** Hasta cuántos puntos del RIEL (de su capacidad) puede apartarse lo que cuelga de la meta de un grupo y seguir «dentro de lo esperado». Es el mismo
 *  ±3 con el que ADR-0329 acota cada movimiento mensual del mix: apartarse menos que lo que se puede mover en un mes no pide hacer nada. Criterio, no dato. */
export const TOLERANCIA_DE_PUNTOS = 3;

export type LecturaDeGrupo = {
  /** El estado en una palabra de color: verde = al día, ámbar = hay algo por hacer, pizarra = informativo (no se puede decir todavía). */
  tono: "verde" | "ambar" | "pizarra";
  texto: string;
};

/**
 * Qué dice la propuesta de UN grupo del riel, en palabras de la tienda y no solo en cifras: «Faltan 88: cuelga más de este grupo», «Dentro de lo
 * esperado», «Sobran 20: no cuelgues más hasta llegar a su parte». La persona que cuelga no tiene por qué restar prendas ni comparar porcentajes
 * (Norman: el error es del diseño). `null` si no hay propuesta (sede sin punto de partida, sin piso de venta).
 *
 * EL SIGNO SALE DE LAS PRENDAS, NO DE LOS PORCENTAJES. La meta de un grupo es `capacidad × %` (la misma que usa el motor del piso: «pasó su meta» =
 * colgadas ≥ meta). Con el riel a medias (300 de 600 colgadas), un grupo puede tener más de su PARTE de lo que cuelga y aun así estar lejos de su meta:
 * comparar porcentajes diría «sobra» y la diferencia en prendas «faltan 88». Se sigue la diferencia en prendas; solo sin capacidad conocida se
 * compara el porcentaje.
 *
 * LAS REGLAS (todas salen de lo ya decidido en ADR-0329; no agregan negocio):
 *   · Sin cuadrar el piso, no se dice qué falta: lo que el sistema cree colgado puede ser una fracción de lo real (TRU: 138 contra 600–750).
 *   · Un grupo que la sede no lleva (0 %) dice «no entra en esta sede».
 *   · A menos de ±`TOLERANCIA_DE_PUNTOS` de la capacidad de su meta está «dentro de lo esperado».
 *   · Si faltan, se cuelga más; si sobran, se deja de colgar nuevo: **nada se saca a la fuerza** (ADR-0329, act. 2026-10-04, punto 10) y un destino
 *     no baja sin el OK del líder (punto 4).
 */
export function lecturaDeGrupo(f: FilaDelRiel, p: { cuadrado: boolean; capacidad: number | null }): LecturaDeGrupo | null {
  if (f.propuestaPct === null) return null;
  if (!p.cuadrado) return { tono: "pizarra", texto: "Por cuadrar: sin saber lo que cuelga de verdad no se dice qué falta." };
  if (f.propuestaPct === 0) {
    return { tono: "pizarra", texto: f.colgadas > 0 ? "No entra en esta sede: no se cuelga más de este grupo." : "No entra en esta sede: va por pedido o desde otra sede." };
  }
  // El sentido y la tolerancia: en prendas si se conoce la capacidad (lo normal); si no, en puntos del porcentaje de lo que cuelga.
  const n = f.diferencia;
  const dentro = n !== null && p.capacidad !== null ? Math.abs(n) <= (p.capacidad * TOLERANCIA_DE_PUNTOS) / 100 : Math.abs(f.propuestaPct - (f.hoyPct ?? 0)) <= TOLERANCIA_DE_PUNTOS;
  if (dentro) return { tono: "verde", texto: "Dentro de lo esperado." };
  const faltan = n !== null ? n > 0 : f.propuestaPct > (f.hoyPct ?? 0);
  if (faltan) return { tono: "ambar", texto: n !== null ? `Faltan ${n}: cuelga más de este grupo.` : "Falta: cuelga más de este grupo." };
  const sobran = n !== null ? `Sobran ${Math.abs(n)}` : "Sobra";
  return {
    tono: "ambar",
    texto: f.grupo.rol === "destino" ? `${sobran}: es destino, no baja sin el OK del líder.` : `${sobran}: no cuelgues más hasta llegar a su parte; no se retira nada.`,
  };
}
