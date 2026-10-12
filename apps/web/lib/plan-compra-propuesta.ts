// Plan de campaña: proponer flojo, normal y bueno de una categoría (ADR-0372, C4 · Felipe 2026-10-12). Lógica pura, sin React ni red.
//
// LAS REGLAS DE FELIPE, tienda por tienda y sumadas (el plan es de toda CAYLA):
//   · Normal: lo que la categoría vende en un mes estándar = lo vendido en los últimos 90 días con ERP, llevado a 30 días; y a los días que
//     dura la campaña (un mes de 31 días casi igual; una campaña de 15, la mitad).
//   · Flojo: el mes más bajo de los últimos 6 (ventanas de 30 días completas dentro del ERP), llevado a los días de la campaña. Si una
//     tienda que vende la categoría todavía no tiene un mes completo en el ERP, el flojo no se propone: escribirlo a ojo es mejor que un
//     piso inventado.
//   · Bueno: mientras no haya la misma campaña del año anterior en el ERP, normal × 3. Cuando la hay, el punto medio entre «normal × el
//     multiplicador real de esa tienda» y «lo que vendió esa categoría en esa campaña» (Felipe: «si en Navidad 2025 vendí 400 y este año
//     la estimación da 450, el punto medio, 425»). Si esa categoría se agotó el año anterior, NO se promedia: lo vendido quedó corto por
//     falta de stock, no de clientes, y bajaría el plan justo donde faltó (Felipe 2026-10-12).
//   · Las cifras se ordenan como las pide la base (flojo ≤ normal ≤ bueno): si un mes bajo quedó por encima del ritmo de 90 días (pasa con
//     poca historia), el flojo es el normal.
//
// CONTRATO: PROMETE una propuesta que se puede guardar tal cual (enteros, ordenados) y, en palabras de tienda, de dónde salió cada cifra.
// NO decide por nadie: la persona la acepta, la corrige o la ignora.

export const RPC_PROPUESTA = "fn_plan_compra_propuesta";
export const RPC_GUARDAR_RECUPERO = "guardar_plan_compra_recupero";
/** «Diciembre triplica un mes»: el bueno mientras no haya una campaña anterior con qué comparar (R-19, Felipe). */
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
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Lo que devuelve `fn_plan_compra_propuesta`; null si no se entiende (la hoja sigue sin propuesta, como antes). */
export function leerPropuesta(v: unknown): LecturaPropuesta | null {
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
    return [{ id, nombre, dias90: Math.max(0, num(t.dias_90) ?? 0), ventanas: Math.max(0, Math.min(6, num(t.ventanas) ?? 0)), previaDisponible: t.previa_disponible === true, multiplicador: m !== null && m > 0 ? m : null }];
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
  };
}

export type PorQueTienda = {
  tienda: string;
  normal: number;
  flojo: number | null;
  bueno: number;
  /** Cómo salió el bueno de esta tienda. */
  como: "x3" | "punto-medio" | "agotada";
  multiplicador: number | null;
  previa: number;
};
export type PropuestaCategoria = { flojo: number | null; normal: number; bueno: number; diasCampana: number; tiendas: PorQueTienda[]; motivoSinFlojo: string | null };

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
    const conHistoria = t.previaDisponible && t.multiplicador !== null;
    const estimado = conHistoria ? normal * t.multiplicador! : normal * MULTIPLICADOR_SIN_HISTORIA;
    const como: PorQueTienda["como"] = !conHistoria ? "x3" : h.agotada ? "agotada" : "punto-medio";
    const bueno = Math.round(como === "punto-medio" ? (estimado + h.previa) / 2 : estimado);
    partes.push({ tienda: t.nombre, normal, flojo, bueno, como, multiplicador: conHistoria ? t.multiplicador : null, previa: h.previa });
  }
  if (partes.length === 0) return null;
  const normal = Math.max(1, Math.round(partes.reduce((s, p) => s + p.normal, 0)));
  const bueno = Math.max(normal, Math.round(partes.reduce((s, p) => s + p.bueno, 0)));
  const flojo = sinMes.length > 0 ? null : Math.min(normal, Math.round(partes.reduce((s, p) => s + (p.flojo ?? 0), 0)));
  const motivoSinFlojo = sinMes.length > 0 ? `${unir(sinMes)} todavía no ${sinMes.length === 1 ? "tiene" : "tienen"} un mes completo de ventas en el ERP: escribe el flojo tú.` : null;
  return { flojo, normal, bueno, diasCampana: l.diasCampana, tiendas: partes, motivoSinFlojo };
}

const unir = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
const entero = (n: number) => Math.round(n).toLocaleString("es-PE");
const veces = (m: number) => `×${m.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

/** De dónde salió cada cifra, en palabras de tienda: una línea por escenario. */
export function explicarPropuesta(p: PropuestaCategoria): { normal: string; flojo: string; bueno: string } {
  const normal = `Normal ${entero(p.normal)}: lo que vende a su ritmo de los últimos 90 días, en los ${p.diasCampana} días de la campaña.`;
  const flojo = p.flojo === null ? (p.motivoSinFlojo ?? "Sin un mes completo de ventas: escribe el flojo tú.") : `Flojo ${entero(p.flojo)}: su mes más bajo de los últimos seis.`;
  const porComo = (c: PorQueTienda["como"]) => p.tiendas.filter((t) => t.como === c);
  const partes = [
    porComo("x3").length > 0 ? `${unir(porComo("x3").map((t) => t.tienda))}: normal × 3 (todavía no hay la campaña del año pasado en el ERP)` : null,
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
