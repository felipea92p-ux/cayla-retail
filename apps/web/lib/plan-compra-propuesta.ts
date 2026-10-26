// Plan de campaña: proponer flojo, normal y bueno de una categoría (ADR-0372, C4 · Felipe 2026-10-12). Lógica pura, sin React ni red.
//
// LAS REGLAS DE FELIPE, tienda por tienda y sumadas (el plan es de toda CAYLA):
//   · Normal: lo que la categoría vende en un mes estándar = lo vendido en los últimos 90 días con ERP, llevado a 30 días; y a los días que
//     dura la campaña (un mes de 31 días casi igual; una campaña de 15, la mitad).
//   · Flojo: el mes más bajo de los últimos 6 (ventanas de 30 días completas dentro del ERP), llevado a los días de la campaña. Si una
//     tienda que vende la categoría todavía no tiene un mes completo en el ERP, el flojo no se propone: escribirlo a ojo es mejor que un
//     piso inventado.
//   · Bueno, en este orden (el primero que exista):
//       1. La misma campaña del año anterior está en el ERP: el punto medio entre «normal × el multiplicador real de esa tienda» y «lo que
//          vendió esa categoría en esa campaña» (Felipe: «si en Navidad 2025 vendí 400 y este año la estimación da 450, el punto medio,
//          425»). Si esa categoría se agotó el año anterior, NO se promedia: lo vendido quedó corto por falta de stock, no de clientes, y
//          bajaría el plan justo donde faltó (Felipe 2026-10-12).
//       2. No está en el ERP pero sí en el historial cargado (Sinatra, `retail.ventas_historicas`): normal × el multiplicador de esa tienda
//          en esa campaña del año anterior, medido con la MISMA regla de la pantalla Historial (`medir`: soles por día de la campaña ÷ soles
//          por día de sus 60 días de antes). Sinatra sabe soles por tienda, no prendas por categoría: por eso no hay punto medio aquí
//          (Felipe 2026-10-13: el historial dice ~1,8 en Trujillo y ~1,1 en Arequipa, y el × 3 compraba de más).
//       3. Ni en el ERP ni en el historial: normal × 3.
//   · Las cifras se ordenan como las pide la base (flojo ≤ normal ≤ bueno): si un mes bajo quedó por encima del ritmo de 90 días (pasa con
//     poca historia), el flojo es el normal.
//
// CONTRATO: PROMETE una propuesta que se puede guardar tal cual (enteros, ordenados) y, en palabras de tienda, de dónde salió cada cifra.
// NO decide por nadie: la persona la acepta, la corrige o la ignora. ASUME que el historial que recibe `conHistorial` cubre la campaña del
// año anterior y sus 60 días de antes (`rangoDeCampana(previa)`); si no llega o no alcanza, esa tienda cae al × 3, como antes.

import { medir, type LecturaHistorial } from "./plan-compra-historial";
import { diasDeVentasDelErp, ultimosDeVentas } from "./plan-compra-periodo";

export const RPC_PROPUESTA = "fn_plan_compra_propuesta";
export const RPC_GUARDAR_RECUPERO = "guardar_plan_compra_recupero";
/** El bueno cuando la campaña del año anterior no está ni en el ERP ni en el historial cargado (R-19, Felipe: «diciembre triplica un mes»). */
export const MULTIPLICADOR_SIN_HISTORIA = 3;

export type TiendaPropuesta = {
  id: string;
  nombre: string;
  /** Días de los últimos 90 en que la tienda ya vendía en el ERP. */
  dias90: number;
  /** Cuántas ventanas de 30 días completas tiene (0 a 6). */
  ventanas: number;
  /** El ERP ya cubría la misma campaña del año anterior (y sus 60 días de antes). */
  previaDisponible: boolean;
  /** Cuántas veces vendió por día en esa campaña lo de un día normal (los 60 días de antes); null si no hay con qué. */
  multiplicador: number | null;
  /** Lo mismo, medido en el historial cargado (Sinatra) cuando el ERP no cubre esa campaña; null si no hay con qué (lo llena `conHistorial`). */
  multiplicadorHistorial: number | null;
};
export type HechoCategoria = { tienda: string; u90: number; ventanas: number[]; previa: number; agotada: boolean };
export type LecturaPropuesta = {
  planId: string;
  diasCampana: number;
  previa: { desde: string; hasta: string };
  recupero: { pct: number | null; heredado: boolean };
  tiendas: TiendaPropuesta[];
  /** categoría → sus hechos por tienda. */
  categorias: Map<string, HechoCategoria[]>;
  /** Todas las tiendas activas, vendan o no (Lima también): el reparto les toca a todas. Vacío si la base todavía no lo manda. */
  tiendasActivas: { id: string; nombre: string }[];
  /** tienda → el mínimo (0 a 1) que fijó un líder para esta campaña. */
  minimos: Map<string, number>;
  /** Se pudo leer el historial de la campaña anterior: sin él, «× 3» no puede decir que la campaña no está en el historial. */
  historialLeido: boolean;
  /** Cuándo recibió la pantalla esta lectura (ISO). Una pestaña abierta desde ayer lo dice: se guarda junto a la propuesta (ADR-0520). */
  leidaEn?: string;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Lo que devuelve `fn_plan_compra_propuesta`; null si no se entiende (la hoja sigue sin propuesta, como antes). `ahora`: cuándo llegó (se inyecta en las pruebas). */
export function leerPropuesta(v: unknown, ahora: Date = new Date()): LecturaPropuesta | null {
  if (!esObjeto(v)) return null;
  const planId = texto(v.plan_id);
  const diasCampana = num(v.dias_campana);
  const previa = esObjeto(v.previa) ? { desde: fechaIso(v.previa.desde), hasta: fechaIso(v.previa.hasta) } : null;
  if (!planId || !diasCampana || diasCampana <= 0 || !previa?.desde || !previa.hasta) return null;
  const recupero = esObjeto(v.recupero_defecto) ? v.recupero_defecto : {};
  const pct = num(recupero.pct);
  const tiendas = lista(v.tiendas).flatMap((t): TiendaPropuesta[] => {
    const id = texto(t.id);
    const nombre = texto(t.nombre);
    if (!id || !nombre) return [];
    const m = num(t.multiplicador);
    return [{ id, nombre, dias90: Math.max(0, num(t.dias_90) ?? 0), ventanas: Math.max(0, Math.min(6, num(t.ventanas) ?? 0)), previaDisponible: t.previa_disponible === true, multiplicador: m !== null && m > 0 ? m : null, multiplicadorHistorial: null }];
  });
  const categorias = new Map<string, HechoCategoria[]>();
  for (const c of lista(v.categorias)) {
    const cat = texto(c.c);
    const tienda = texto(c.u);
    if (!cat || !tienda) continue;
    const ventanas = Array.isArray(c.ventanas) ? c.ventanas.map((x) => Math.max(0, num(x) ?? 0)) : [];
    (categorias.get(cat) ?? categorias.set(cat, []).get(cat)!).push({ tienda, u90: Math.max(0, num(c.u90) ?? 0), ventanas, previa: Math.max(0, num(c.previa) ?? 0), agotada: c.agotada === true });
  }
  return {
    planId,
    diasCampana,
    previa: { desde: previa.desde, hasta: previa.hasta },
    recupero: { pct: pct !== null && pct >= 0 && pct <= 100 ? Math.round(pct) : null, heredado: recupero.heredado === true },
    tiendas,
    categorias,
    tiendasActivas: lista(v.tiendas_activas).flatMap((t) => (texto(t.id) && texto(t.nombre) ? [{ id: t.id as string, nombre: t.nombre as string }] : [])),
    minimos: new Map(
      lista(v.minimos).flatMap((m) => {
        const pct = num(m.pct);
        return texto(m.u) && pct !== null && pct > 0 && pct <= 100 ? [[m.u as string, pct / 100] as const] : [];
      }),
    ),
    historialLeido: false,
    leidaEn: ahora.toISOString(),
  };
}

/**
 * La propuesta con el multiplicador de cada tienda medido en su historial, para la misma campaña del año anterior (`l.previa`). Se mide
 * con `medir`, la regla de la pantalla Historial: así el Plan y el Historial nunca dan dos números distintos para la misma campaña. Sin
 * historial (no se pudo leer), la lectura vuelve tal cual y cada tienda sin ERP cae al × 3.
 */
export function conHistorial(l: LecturaPropuesta, h: LecturaHistorial | null): LecturaPropuesta {
  if (!h) return l;
  const porId = new Map(h.tiendas.map((t) => [t.id, t]));
  return {
    ...l,
    historialLeido: true,
    tiendas: l.tiendas.map((t) => {
      const th = porId.get(t.id);
      const m = th ? medir(h, th, l.previa.desde, l.previa.hasta) : null;
      // Tres decimales, como manda la base el multiplicador del ERP: la misma cifra se redondea igual venga de donde venga.
      const valor = m?.estado === "medida" && !m.enCurso && m.multiplicador !== null && m.multiplicador > 0 ? Math.round(m.multiplicador * 1000) / 1000 : null;
      return { ...t, multiplicadorHistorial: valor };
    }),
  };
}

export type PorQueTienda = {
  tienda: string;
  normal: number;
  flojo: number | null;
  bueno: number;
  /** Cómo salió el bueno de esta tienda. */
  como: "x3" | "historial" | "punto-medio" | "agotada";
  multiplicador: number | null;
  previa: number;
};
export type PropuestaCategoria = {
  flojo: number | null;
  normal: number;
  bueno: number;
  diasCampana: number;
  tiendas: PorQueTienda[];
  motivoSinFlojo: string | null;
  /** Para explicar el × 3: si se leyó el historial, la campaña no estaba en él; si no, no se sabe. */
  historialLeido: boolean;
  /** Los días de ventas que el ERP lleva de verdad dentro de la ventana de 90: con cuántos días se hizo esta propuesta. */
  diasDeVentas?: number;
};

/** La propuesta de una categoría; null si no vendió en ninguna tienda en 90 días (no hay de dónde proponer). */
export function proponer(l: LecturaPropuesta, categoriaId: string): PropuestaCategoria | null {
  const hechos = l.categorias.get(categoriaId) ?? [];
  const porTienda = new Map(l.tiendas.map((t) => [t.id, t]));
  const aLaCampana = l.diasCampana / 30;
  const partes: PorQueTienda[] = [];
  const sinMes: string[] = [];
  for (const h of hechos) {
    const t = porTienda.get(h.tienda);
    if (!t || t.dias90 <= 0 || h.u90 <= 0) continue;
    // Enteros por tienda ANTES de multiplicar: si la pantalla dice «normal 3 × 3», el bueno tiene que ser 9 (con 2,6 × 3 salía 8 y no se
    // entendía). Una categoría que vendió algo nunca propone 0.
    const normal = Math.max(1, Math.round((h.u90 / t.dias90) * 30 * aLaCampana));
    const completas = h.ventanas.slice(0, t.ventanas);
    const flojo = completas.length > 0 ? Math.round(Math.min(...completas) * aLaCampana) : null;
    if (flojo === null) sinMes.push(t.nombre);
    // El multiplicador sale del primero que exista: la campaña en el ERP, la campaña en el historial, o el × 3 (ver las reglas arriba).
    const enErp = t.previaDisponible && t.multiplicador !== null;
    const como: PorQueTienda["como"] = enErp ? (h.agotada ? "agotada" : "punto-medio") : t.multiplicadorHistorial !== null ? "historial" : "x3";
    const multiplicador = enErp ? t.multiplicador! : (t.multiplicadorHistorial ?? MULTIPLICADOR_SIN_HISTORIA);
    const estimado = normal * multiplicador;
    const bueno = Math.round(como === "punto-medio" ? (estimado + h.previa) / 2 : estimado);
    partes.push({ tienda: t.nombre, normal, flojo, bueno, como, multiplicador: como === "x3" ? null : multiplicador, previa: h.previa });
  }
  if (partes.length === 0) return null;
  const normal = Math.max(1, Math.round(partes.reduce((s, p) => s + p.normal, 0)));
  const bueno = Math.max(normal, Math.round(partes.reduce((s, p) => s + p.bueno, 0)));
  const flojo = sinMes.length > 0 ? null : Math.min(normal, Math.round(partes.reduce((s, p) => s + (p.flojo ?? 0), 0)));
  const motivoSinFlojo = sinMes.length > 0 ? `${unir(sinMes)} todavía no ${sinMes.length === 1 ? "tiene" : "tienen"} un mes completo de ventas en el ERP: escribe el flojo tú.` : null;
  return { flojo, normal, bueno, diasCampana: l.diasCampana, tiendas: partes, motivoSinFlojo, historialLeido: l.historialLeido, diasDeVentas: diasDeVentasDelErp(l.tiendas) };
}

const unir = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
const entero = (n: number) => Math.round(n).toLocaleString("es-PE");
const veces = (m: number) => `×${m.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

/** De dónde salió cada cifra, en palabras de tienda: una línea por escenario. */
export function explicarPropuesta(p: PropuestaCategoria): { normal: string; flojo: string; bueno: string } {
  const normal = `Normal ${entero(p.normal)}: lo que vende a su ritmo de ${ultimosDeVentas(p.diasDeVentas)}, en los ${p.diasCampana} días de la campaña.`;
  const flojo = p.flojo === null ? (p.motivoSinFlojo ?? "Sin un mes completo de ventas: escribe el flojo tú.") : `Flojo ${entero(p.flojo)}: su mes más bajo de los últimos seis.`;
  const porComo = (c: PorQueTienda["como"]) => p.tiendas.filter((t) => t.como === c);
  const sinCampana = p.historialLeido ? "esa campaña del año pasado no está ni en el ERP ni en su historial" : "todavía no hay la campaña del año pasado en el ERP";
  const partes = [
    porComo("x3").length > 0 ? `${unir(porComo("x3").map((t) => t.tienda))}: normal × 3 (${sinCampana})` : null,
    ...porComo("historial").map((t) => `${t.tienda}: normal × ${veces(t.multiplicador!).slice(1)} (lo que esa tienda vendió de más en esa campaña el año pasado, según su historial)`),
    ...porComo("punto-medio").map((t) => `${t.tienda}: el punto medio entre normal × ${veces(t.multiplicador!).slice(1)} (lo que esa tienda vendió de más el año pasado) y las ${entero(t.previa)} que vendió en esa campaña`),
    ...porComo("agotada").map((t) => `${t.tienda}: normal × ${veces(t.multiplicador!).slice(1)}, sin promediar, porque el año pasado se agotó`),
  ].filter(Boolean);
  return { normal, flojo, bueno: `Bueno ${entero(p.bueno)}: ${partes.join("; ")}.` };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que sobra de CAYLA (C5): el % por campaña, que fija un líder
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que rechaza `guardar_plan_compra_recupero` (null = se puede guardar): un entero de 0 a 100. */
export function problemaDelRecupero(texto: string): string | null {
  const t = texto.trim();
  if (t === "") return "Escribe a qué % del precio se vende lo que sobra.";
  if (!/^\d{1,3}$/.test(t) || Number(t) > 100) return "Lo que sobra va de 0 a 100 % del precio.";
  return null;
}

/** Los argumentos de `guardar_plan_compra_recupero`; `null` lo quita (cada categoría vuelve a escribirlo sola). */
export const argsGuardarRecupero = (planId: string, texto: string | null) => ({ p_plan_id: planId, p_pct: texto === null ? null : Number(texto.trim()) });

/** La frase de la pantalla sobre lo que sobra: de dónde sale el % que traen las categorías nuevas. */
export function fraseDelRecupero(r: LecturaPropuesta["recupero"]): string {
  if (r.pct === null) return "Nadie fijó todavía a qué % del precio se vende lo que sobra en esta campaña: cada categoría lo escribe.";
  return `Lo que sobra se vende al ${r.pct} % del precio${r.heredado ? " (el de la campaña anterior)" : ""}: con eso arranca cada categoría nueva, y cada una puede cambiarlo.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// El simulador (Felipe 2026-10-12, lo rescatado de Toolio e Increff): mover supuestos y ver la compra al instante, sin guardar nada
// ---------------------------------------------------------------------------------------------------------------------

export type LineaSimulable = { normal: number; flojo: number; bueno: number; precio: number; costo: number; recuperoPct: number; stock: number };

/**
 * La compra de las categorías con plan si el bueno fuera `multiplicador` × el normal y lo que sobra se vendiera al `recuperoPct` (null =
 * el de cada categoría). Usa la MISMA cuenta que el Plan (`calcular`, que se recibe para no duplicarla): solo cambia los supuestos.
 */
export function simular(
  lineas: readonly LineaSimulable[],
  multiplicador: number,
  recuperoPct: number | null,
  calcular: (l: Omit<LineaSimulable, "stock">, stock: number) => { comprar: number; inversion: number },
): { prendas: number; inversion: number } {
  return lineas.reduce(
    (a, l) => {
      const bueno = Math.max(l.normal + 1, Math.round(l.normal * multiplicador));
      const c = calcular({ ...l, bueno, recuperoPct: recuperoPct ?? l.recuperoPct }, l.stock);
      return { prendas: a.prendas + c.comprar, inversion: Math.round((a.inversion + c.inversion) * 100) / 100 };
    },
    { prendas: 0, inversion: 0 },
  );
}
