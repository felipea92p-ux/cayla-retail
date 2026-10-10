import { tramosDeLaPrenda } from "./frescura-piso";
import { cuantilGamma, type FrescuraPrenda, type RitmoCategoria } from "./frescura-reglas";

// Lo que mueve la aguja (ADR-0208, act. 2026-10-10 (b)): las categorías de mayor impacto, con su acción. El ejemplo de Felipe: «Jeans está
// envejeciendo: rótalo, mejora la exhibición o completa tallas» y «Polos tiene mayor acogida». Dos señales, cada una con su vara:
//
//   1. LA EDAD (un hecho): cuántas unidades de la categoría ya pasaron el tiempo en que su categoría vende 3 de cada 4 (Envejeciendo en la
//      barra). Habla con 3 unidades o más que sean al menos 3 de cada 10 de su piso.
//   2. LA ACOGIDA (una inferencia): cuánto pesa la categoría en el piso contra cuánto vende. θ = ventas ÷ las que tocarían por su espacio al
//      ritmo del RESTO de la tienda (1 = vende lo que ocupa). Con pocas ventas, una cifra sola es ruido (ADR-0214): se acerca a 1 con una
//      Gamma(5 + x/φ, 5 + E/φ) —como el «soles por hora» de Rendimiento acerca a la persona hacia su tienda— y solo habla si su cota
//      prudente sale de la zona neutra: «se está quedando» si con 9 de cada 10 de confianza θ < 0,75; «se lleva más» si θ > 1,33.
//      Simulado con el volumen de TRU (18 categorías, ~45 unidades al día): una falsa alarma cada ~35 semanas con φ = 1,5 (cada ~5 con el
//      peor φ medido), y una caída real a la mitad se ve en ~2 semanas. φ (cuántas unidades se llevan juntas) no está medido todavía.
//
// LO ANOTADO EN CAJA (las ventas «sin registrar», que traen categoría pero no prenda) no entra a la cifra: no dice si la prenda salió del
// piso. Sirve de CONTROL: si sumándolo la acogida cae del otro lado de 1, la categoría no recibe veredicto. Y cuando el piso no se cuadró
// todavía (el sistema no sabe qué cuelga), no hay veredictos: se dice qué se llevan los clientes, que no necesita el piso.
//
// Sin React ni Supabase; lo prueba `frescura-aguja.test.ts`.

/** La fuerza de la contracción: cuántas «ventas esperadas» de evidencia prestada (la estimación sobre TRU dio 4,6; se toma el lado prudente). */
export const K_ACOGIDA = 5;
/** Sobredispersión: las unidades de un mismo ticket o modelo no son independientes. Sin medir; 1,5 de partida. */
export const PHI_ACOGIDA = 1.5;
/** La zona neutra de la acogida y la confianza con que se sale de ella. */
export const ACOGIDA_BAJA = 0.75;
export const ACOGIDA_ALTA = 1.33;
const Z90 = 1.2816;
/** Lo mínimo para hablar de una categoría: las ventas que tocarían por su espacio. Sale de lo que estuvo colgado (unidad·días), así que una
 *  categoría con 1 o 2 prendas en el piso no llega sola; no hace falta otro umbral de piso (y no debe haberlo: las cifras del piso las
 *  decide `piso-plan.ts`, ADR-0328). */
export const ESPERADAS_MINIMAS = 5;
/** La edad habla con 3 unidades envejeciendo que sean al menos 3 de cada 10 de su piso. */
export const VIEJAS_MINIMAS = 3;
export const PARTE_VIEJA = 0.3;
/** Cuántas tarjetas: hasta dos que se quedan y una que se lleva más (o lo que haya). */
export const MAX_TARJETAS = 3;

/** El cuantil de una Gamma (Wilson-Hilferty): vive con la rapidez en `frescura-reglas.ts` y se reexporta aquí. */
export { cuantilGamma };

export type Acogida = {
  categoriaId: string;
  dias: number;
  /** Lo que pesa en el piso y en las ventas de la ventana (0 a 1). */
  partePiso: number;
  parteVentas: number;
  vendidas: number;
  esperadas: number;
  /** θ contraído (media) y sus cotas prudentes. */
  indice: number;
  bajo: number;
  alto: number;
};

/**
 * La acogida de cada categoría en la ventana más corta que alcanza (14 días; 28 si en 14 no llega a las ventas esperadas mínimas). El ritmo
 * de comparación es el del RESTO de la tienda (sin ella), como «sin ella» de la vara: una categoría grande no se compara consigo misma.
 * `extra` suma ventas a una categoría (lo anotado en caja, para el control).
 */
export function acogidas(ritmo: readonly RitmoCategoria[], extra?: (categoriaId: string, dias: number) => number): Map<string, Acogida> {
  const porDias = new Map<number, RitmoCategoria[]>();
  for (const r of ritmo) porDias.set(r.dias, [...(porDias.get(r.dias) ?? []), r]);
  const r: Map<string, Acogida> = new Map();
  for (const dias of [...porDias.keys()].sort((a, b) => a - b)) {
    const filas = porDias.get(dias)!.map((f) => ({ ...f, vendidas: f.vendidas + (extra?.(f.categoriaId, dias) ?? 0) }));
    const totalE = filas.reduce((s, f) => s + f.unidadDias, 0);
    const totalX = filas.reduce((s, f) => s + f.vendidas, 0);
    for (const f of filas) {
      if (r.has(f.categoriaId)) continue;
      const eResto = totalE - f.unidadDias;
      const xResto = totalX - f.vendidas;
      if (eResto <= 0 || f.unidadDias <= 0) continue;
      const esperadas = f.unidadDias * (xResto / eResto);
      if (esperadas < ESPERADAS_MINIMAS && dias !== Math.max(...porDias.keys())) continue;
      const a = K_ACOGIDA + f.vendidas / PHI_ACOGIDA;
      const b = K_ACOGIDA + esperadas / PHI_ACOGIDA;
      r.set(f.categoriaId, {
        categoriaId: f.categoriaId,
        dias,
        partePiso: totalE > 0 ? f.unidadDias / totalE : 0,
        parteVentas: totalX > 0 ? f.vendidas / totalX : 0,
        vendidas: f.vendidas,
        esperadas,
        indice: a / b,
        bajo: cuantilGamma(a, b, -Z90),
        alto: cuantilGamma(a, b, Z90),
      });
    }
  }
  return r;
}

export type TipoSenal = "se_queda" | "se_lleva";

/** Lo que se le propone a una categoría, en el orden de la industria: tallas, luego exhibición; el precio nunca se toca solo. */
export type AccionAguja =
  /** Hay modelos colgados con alguna talla guardada en el almacén: colgarlas (lleva a Bajar al piso con las tallas ya puestas). */
  | { tipo: "completar_tallas"; lineas: { varianteId: string; cantidad: number }[] }
  /** Cambiar de lugar lo que se queda (filtra la lista de abajo a esa categoría). */
  | { tipo: "cambiar_lugar" }
  /** Colgar más de lo que se lleva (lleva a Bajar al piso con lo del almacén). */
  | { tipo: "colgar_mas"; lineas: { varianteId: string; cantidad: number }[]; enAlmacen: number }
  /** Se lleva más y no queda en el almacén: pedir. */
  | { tipo: "pedir" };

export type SenalCategoria = {
  categoriaId: string;
  nombre: string;
  tipo: TipoSenal;
  /** Unidades colgadas hoy y cuántas envejecen. */
  piso: number;
  envejeciendo: number;
  /** La acogida, si habló o acompaña a la edad. */
  acogida: Acogida | null;
  /** Lo que ordena: unidades que sobran (se queda) o la cota prudente (se lleva). */
  impacto: number;
  accion: AccionAguja;
};

/** Hasta cuántas tallas se ponen en una bajada sugerida: una por talla, las de los modelos ya colgados primero. */
const MAX_LINEAS = 12;

/** Las tallas guardadas sin colgar de los modelos que ya cuelgan en la categoría (la «talla rota» que se arregla bajando una). */
function tallasPorColgar(prendas: readonly FrescuraPrenda[]): { varianteId: string; cantidad: number }[] {
  const lineas: { varianteId: string; cantidad: number }[] = [];
  for (const p of prendas) {
    if (p.pisoHoy <= 0) continue;
    for (const t of p.tallas) if (t.pisoHoy <= 0 && t.almacenHoy > 0) lineas.push({ varianteId: t.varianteId, cantidad: 1 });
  }
  return lineas.slice(0, MAX_LINEAS);
}

/** Lo del almacén de la categoría para colgar más: una por talla, lo que no cuelga primero. */
function paraColgarMas(prendas: readonly FrescuraPrenda[]): { varianteId: string; cantidad: number }[] {
  const tallas = prendas.flatMap((p) => p.tallas).filter((t) => t.almacenHoy > 0);
  tallas.sort((a, b) => a.pisoHoy - b.pisoHoy);
  return tallas.slice(0, MAX_LINEAS).map((t) => ({ varianteId: t.varianteId, cantidad: 1 }));
}

/**
 * Las categorías que mueven la aguja: hasta dos que se quedan (por las unidades que sobran) y una que se lleva más (por su cota prudente), o
 * lo que haya hasta tres. Sin el piso cuadrado no hay veredictos (vacío): el sistema no sabe qué cuelga. `anotadas`: lo vendido «sin
 * registrar» por categoría y ventana, para el control de la acogida.
 */
export function loQueMueveLaAguja(
  prendas: readonly FrescuraPrenda[],
  ritmo: readonly RitmoCategoria[],
  o: { pisoCuadrado: boolean; anotadas?: (categoriaId: string, dias: number) => number },
): SenalCategoria[] {
  if (!o.pisoCuadrado) return [];
  const registradas = acogidas(ritmo);
  const conAnotadas = o.anotadas ? acogidas(ritmo, o.anotadas) : null;
  const porCategoria = new Map<string, FrescuraPrenda[]>();
  for (const p of prendas) if (p.categoriaId !== "") porCategoria.set(p.categoriaId, [...(porCategoria.get(p.categoriaId) ?? []), p]);

  const senales: SenalCategoria[] = [];
  for (const [categoriaId, lista] of porCategoria) {
    let piso = 0;
    let envejeciendo = 0;
    for (const p of lista) {
      const t = tramosDeLaPrenda(p).unidades;
      piso += p.pisoHoy;
      envejeciendo += t.envejeciendo;
    }
    if (piso <= 0) continue;
    const a = registradas.get(categoriaId) ?? null;
    // El control: si con lo anotado la acogida cae del otro lado de 1, la acogida no habla (la edad sí, es un hecho).
    const control = conAnotadas?.get(categoriaId) ?? null;
    const vetada = a !== null && control !== null && a.indice < 1 !== control.indice < 1;
    const acogidaHabla = a !== null && !vetada && a.esperadas >= ESPERADAS_MINIMAS;
    const quedaPorAcogida = acogidaHabla && a.alto < ACOGIDA_BAJA;
    const quedaPorEdad = envejeciendo >= VIEJAS_MINIMAS && envejeciendo >= PARTE_VIEJA * piso;
    const llevaMas = acogidaHabla && a.bajo > ACOGIDA_ALTA;
    const nombre = lista[0].categoriaNombre;
    if (quedaPorAcogida || quedaPorEdad) {
      const lineas = tallasPorColgar(lista);
      senales.push({
        categoriaId,
        nombre,
        tipo: "se_queda",
        piso,
        envejeciendo,
        acogida: acogidaHabla ? a : null,
        impacto: Math.max(envejeciendo, quedaPorAcogida ? Math.round(piso * (1 - a.alto)) : 0),
        accion: lineas.length > 0 ? { tipo: "completar_tallas", lineas } : { tipo: "cambiar_lugar" },
      });
    } else if (llevaMas) {
      const enAlmacen = lista.reduce((s, p) => s + p.almacenHoy, 0);
      const lineas = paraColgarMas(lista);
      senales.push({
        categoriaId,
        nombre,
        tipo: "se_lleva",
        piso,
        envejeciendo,
        acogida: a,
        impacto: a.bajo,
        accion: enAlmacen > 0 && lineas.length > 0 ? { tipo: "colgar_mas", lineas, enAlmacen } : { tipo: "pedir" },
      });
    }
  }
  const quedan = senales.filter((s) => s.tipo === "se_queda").sort((x, y) => y.impacto - x.impacto || x.nombre.localeCompare(y.nombre, "es"));
  const llevan = senales.filter((s) => s.tipo === "se_lleva").sort((x, y) => y.impacto - x.impacto || x.nombre.localeCompare(y.nombre, "es"));
  const elegidas = [...quedan.slice(0, 2), ...llevan.slice(0, 1)];
  for (const s of [...quedan.slice(2), ...llevan.slice(1)]) if (elegidas.length < MAX_TARJETAS) elegidas.push(s);
  return elegidas;
}

/** Lo que más se llevan los clientes en los últimos 14 días, por categoría (registrado + anotado en caja): sirve aunque el piso no esté cuadrado. */
export function loQueSeLlevan(
  ritmo: readonly RitmoCategoria[],
  anotadas: (categoriaId: string, dias: number) => number,
  categoriasAnotadas: readonly string[],
  nombreDe: (categoriaId: string) => string,
  cuantas = 3,
): { categoriaId: string; nombre: string; unidades: number }[] {
  const total = new Map<string, number>();
  for (const r of ritmo) if (r.dias === 14) total.set(r.categoriaId, (total.get(r.categoriaId) ?? 0) + r.vendidas);
  for (const c of categoriasAnotadas) total.set(c, (total.get(c) ?? 0) + anotadas(c, 14));
  return [...total]
    .filter(([, n]) => n > 0)
    .map(([categoriaId, unidades]) => ({ categoriaId, nombre: nombreDe(categoriaId), unidades }))
    .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, cuantas);
}

// ---------------------------------------------------------------------------
// Sin estrenar (actividad 5): la novedad que ya está en la tienda
// ---------------------------------------------------------------------------

/** Lo que el cliente nunca vio colgado en esta tienda y espera en el almacén, y la bajada sugerida para estrenarlo. */
export type SinEstrenar = { prendas: number; unidades: number; lineas: { varianteId: string; cantidad: number }[] };

/**
 * Las prendas (modelo+color) que nunca se colgaron en esta sede y tienen algo libre en el almacén: la palanca más barata para refrescar el
 * piso (entra una que el cliente nunca vio; ADR-0329, «entra una, sale una»). Sin lo que ya no es de su estación (temporada pasada, o un
 * clásico fuera de la suya): no se estrena lo que hay que guardar. Las más recién llegadas primero; la bajada sugerida, una por talla.
 */
export function sinEstrenar(prendas: readonly FrescuraPrenda[]): SinEstrenar {
  const lista = prendas
    .filter((p) => p.pisoHoy <= 0 && p.primeraExhibicion === null && p.almacenHoy > 0)
    .filter((p) => !p.estado.temporadaPasada && !(p.estado.tipo === "clasico" && p.estado.fueraDeSuEstacion))
    .sort((a, b) => (b.ultimaLlegada ?? "").localeCompare(a.ultimaLlegada ?? "") || a.productoNombre.localeCompare(b.productoNombre, "es"));
  const lineas: { varianteId: string; cantidad: number }[] = [];
  for (const p of lista) for (const t of p.tallas) if (t.almacenHoy > 0 && lineas.length < MAX_LINEAS) lineas.push({ varianteId: t.varianteId, cantidad: 1 });
  return { prendas: lista.length, unidades: lista.reduce((s, p) => s + p.almacenHoy, 0), lineas };
}

/** «Bajar al piso» con las tallas ya puestas (`?lineas=<variante>:<cantidad>,…`, ADR-0237). */
export function enlaceBajar(lineas: readonly { varianteId: string; cantidad: number }[]): string {
  return `/inventario/bajar?lineas=${lineas.map((l) => `${l.varianteId}:${l.cantidad}`).join(",")}`;
}

/** «8 %»: una parte (0 a 1) en porcentaje entero. */
export const pct = (x: number): string => `${Math.round(x * 100)} %`;
