// Plan de campaña ▸ Resultados (ADR-0372, C6 · Felipe 2026-10-12): lo que se vendió de verdad en una campaña, por tienda, familia, categoría,
// prenda y color; cuántas veces lo de un día normal vendió cada tienda (el multiplicador REAL, que el año siguiente reemplaza al × 3); qué
// categorías se agotaron; y a qué % del precio se vendió lo que sobró. Lógica pura, sin React ni red.
//
// LAS REGLAS (las mismas que el Historial y la propuesta: una sola vara):
//   · Multiplicador real de una tienda = unidades por día en la campaña ÷ unidades por día en los 60 días de antes. Solo si el ERP ya
//     cubría esos 60 días; si no, no se inventa.
//   · Agotada = la categoría se vendió en la campaña y, al cerrar lo medido, quedó en cero en esa tienda (sin Cuarentena).
//   · Lo que sobró = lo vendido en los 60 días después de la campaña: lo cobrado ÷ lo que valía a precio de etiqueta.

import { fraseDeLoReal } from "./plan-compra-reglas";
import type { LecturaPropuesta } from "./plan-compra-propuesta";

export const RPC_RESULTADOS = "fn_plan_compra_resultados";
const DIAS_BASE = 60;

export type TiendaResultado = { id: string; nombre: string; unidades: number; soles: number; baseUnidades: number | null };
/** `rebajadas`: de esas unidades, las cobradas por debajo de su precio de etiqueta (0 si la base todavía no lo manda). */
export type FilaVendida = { tienda: string; categoria: string; producto: string | null; color: string | null; unidades: number; soles: number; rebajadas: number };
export type LecturaResultados = {
  plan: { id: string; nombre: string; desde: string; hasta: string };
  hoy: string;
  medidoHasta: string;
  tiendas: TiendaResultado[];
  filas: FilaVendida[];
  agotadas: { tienda: string; categoria: string }[];
  despues: { hasta: string | null; categorias: { categoria: string; unidades: number; soles: number; aPrecioLista: number }[] };
  lineas: Map<string, { flojo: number; normal: number; bueno: number; recuperoPct: number }>;
  categorias: Map<string, { nombre: string; familia: string | null }>;
  familias: Map<string, string>;
  productos: Map<string, string>;
  colores: Map<string, { nombre: string; hex: string | null }>;
  /** Unidades vendidas cada día de la campaña (toda CAYLA); vacío si la base todavía no lo manda. */
  porDia: Map<string, number>;
  /** categoría → lo que hay hoy y lo que había al cerrar lo medido (todas las sedes, sin Cuarentena); null si la base no lo manda. */
  stock: Map<string, { hoy: number; cierre: number }> | null;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Lo que devuelve `fn_plan_compra_resultados`; null si no se entiende. */
export function leerResultados(v: unknown): LecturaResultados | null {
  if (!esObjeto(v) || !esObjeto(v.plan)) return null;
  const id = texto(v.plan.id);
  const nombre = texto(v.plan.nombre);
  const desde = fechaIso(v.plan.desde);
  const hasta = fechaIso(v.plan.hasta);
  const hoy = fechaIso(v.hoy);
  const medidoHasta = fechaIso(v.medido_hasta);
  if (!id || !nombre || !desde || !hasta || !hoy || !medidoHasta) return null;
  const despues = esObjeto(v.despues) ? v.despues : {};
  return {
    plan: { id, nombre, desde, hasta },
    hoy,
    medidoHasta,
    tiendas: lista(v.tiendas).flatMap((t) => {
      const tid = texto(t.id);
      const tn = texto(t.nombre);
      return tid && tn ? [{ id: tid, nombre: tn, unidades: num(t.unidades), soles: num(t.soles), baseUnidades: t.base_unidades == null ? null : num(t.base_unidades) }] : [];
    }),
    filas: lista(v.filas).flatMap((f) => {
      const tienda = texto(f.u);
      const categoria = texto(f.c);
      return tienda && categoria ? [{ tienda, categoria, producto: texto(f.p), color: texto(f.color), unidades: num(f.unidades), soles: num(f.soles), rebajadas: num(f.rebajadas) }] : [];
    }),
    agotadas: lista(v.agotadas).flatMap((a) => (texto(a.u) && texto(a.c) ? [{ tienda: a.u as string, categoria: a.c as string }] : [])),
    despues: {
      hasta: fechaIso(despues.hasta),
      categorias: lista(despues.categorias).flatMap((d) => (texto(d.c) ? [{ categoria: d.c as string, unidades: num(d.unidades), soles: num(d.soles), aPrecioLista: num(d.a_precio_lista) }] : [])),
    },
    lineas: new Map(lista(v.lineas).flatMap((l) => (texto(l.c) ? [[l.c as string, { flojo: num(l.flojo), normal: num(l.normal), bueno: num(l.bueno), recuperoPct: num(l.recupero_pct) }] as const] : []))),
    categorias: new Map(lista(v.categorias).flatMap((c) => (texto(c.id) && texto(c.nombre) ? [[c.id as string, { nombre: c.nombre as string, familia: texto(c.familia) }] as const] : []))),
    familias: new Map(lista(v.familias).flatMap((f) => (texto(f.codigo) && texto(f.nombre) ? [[f.codigo as string, f.nombre as string] as const] : []))),
    productos: new Map(lista(v.productos).flatMap((p) => (texto(p.id) && texto(p.nombre) ? [[p.id as string, p.nombre as string] as const] : []))),
    colores: new Map(lista(v.colores).flatMap((c) => (texto(c.codigo) && texto(c.nombre) ? [[c.codigo as string, { nombre: c.nombre as string, hex: texto(c.hex) }] as const] : []))),
    porDia: new Map(lista(v.por_dia).flatMap((d) => (fechaIso(d.f) ? [[d.f as string, num(d.u)] as const] : []))),
    stock: Array.isArray(v.stock)
      ? new Map(lista(v.stock).flatMap((s) => (texto(s.c) ? [[s.c as string, { hoy: Math.max(0, num(s.hoy)), cierre: Math.max(0, num(s.cierre)) }] as const] : [])))
      : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Durante la campaña: «¿Cómo va?» y «Pedir más o impulsar» (Felipe 2026-10-12, lo rescatado del WSSI de los compradores de moda)
// ---------------------------------------------------------------------------------------------------------------------

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * El peso de cada día de la campaña: cómo se repartió la venta en la misma campaña el año pasado (soles por día de la historia), para
 * que el plan «a hoy» no sea una línea recta (Navidad vende más al final). Sin historia suficiente (menos de la mitad de los días con
 * venta), todos los días pesan lo mismo.
 */
export function pesosDeLosDias(desde: string, hasta: string, anterior: ReadonlyMap<string, number> | null): number[] {
  const dias = diasEntre(desde, hasta) + 1;
  if (!anterior) return Array(dias).fill(1);
  const pesos = Array.from({ length: dias }, (_, i) => anterior.get(sumarDias(sumarDias(desde, i), -365)) ?? anterior.get(sumarDias(sumarDias(desde, i), -366)) ?? 0);
  return pesos.filter((p) => p > 0).length >= dias / 2 ? pesos.map((p) => (p > 0 ? p : Math.min(...pesos.filter((x) => x > 0)))) : Array(dias).fill(1);
}

export type ComoVa = {
  /** El plan de toda la campaña (suma de los «normal» de las categorías con plan); null si nadie armó el plan. */
  planTotal: number | null;
  vendido: number;
  /** Lo que el plan esperaba a hoy; null sin plan. */
  esperado: number | null;
  /** vendido ÷ esperado − 1 (0.08 = +8 %); null sin plan. */
  diferencia: number | null;
  /** Dónde termina si sigue así: lo vendido ÷ la parte de la campaña que ya pasó. */
  proyeccion: number;
  dias: number;
  medidos: number;
  /** Para el gráfico: acumulados por día (el real solo hasta lo medido). */
  plan: number[] | null;
  real: number[];
  proyectado: number[];
};

/** «¿Cómo va?»: lo vendido contra el plan, a hoy, y la proyección al cierre con la forma de la campaña del año pasado. */
export function comoVa(r: LecturaResultados, pesos: readonly number[]): ComoVa {
  const dias = pesos.length;
  const medidos = Math.min(dias, diasMedidos(r));
  const total = pesos.reduce((a, p) => a + p, 0);
  const fraccion = (n: number) => pesos.slice(0, n).reduce((a, p) => a + p, 0) / total;
  const planTotal = r.lineas.size > 0 ? [...r.lineas.values()].reduce((a, l) => a + l.normal, 0) : null;
  const real: number[] = [];
  for (let i = 0; i < medidos; i++) real.push((real.at(-1) ?? 0) + (r.porDia.get(sumarDias(r.plan.desde, i)) ?? 0));
  const vendido = real.at(-1) ?? 0;
  const yaPaso = fraccion(medidos);
  const proyeccion = yaPaso > 0 ? Math.round(vendido / yaPaso) : 0;
  const esperado = planTotal !== null ? Math.round(planTotal * yaPaso) : null;
  const plan = planTotal !== null ? pesos.map((_, i) => planTotal * fraccion(i + 1)) : null;
  const proyectado = pesos.map((_, i) => (i < medidos ? real[i] : vendido + (proyeccion - vendido) * ((fraccion(i + 1) - yaPaso) / Math.max(1e-9, 1 - yaPaso))));
  return { planTotal, vendido, esperado, diferencia: esperado ? vendido / esperado - 1 : null, proyeccion, dias, medidos, plan, real, proyectado };
}

export type Senal = "pedir" | "impulsar" | "bien";
export type SenalCategoria = { id: string; nombre: string; vendidas: number; diferencia: number | null; alcanzaDias: number | null; senal: Senal };

/**
 * «Pedir más o impulsar», por categoría y contra el FIN DE ESTA CAMPAÑA (Análisis mide la prenda, por tienda y contra Navidad: para la
 * prenda exacta se lleva allá). Pedir: lo que queda se acaba antes del fin y no va por debajo del plan. Impulsar: va 20 % o más por
 * debajo del plan y lo que queda alcanza para 1.5 veces lo que falta. Sin plan, solo «pedir» (no hay contra qué decir que va lenta).
 */
export function senales(r: LecturaResultados, pesos: readonly number[]): SenalCategoria[] {
  if (!r.stock) return [];
  const dias = pesos.length;
  const medidos = Math.min(dias, diasMedidos(r));
  const faltan = dias - medidos;
  const total = pesos.reduce((a, p) => a + p, 0);
  const yaPaso = pesos.slice(0, medidos).reduce((a, p) => a + p, 0) / total;
  return porCategoria(r, null)
    .filter((c) => c.unidades > 0)
    .map((c): SenalCategoria => {
      const diferencia = c.plan && c.plan.normal > 0 && yaPaso > 0 ? c.unidades / (c.plan.normal * yaPaso) - 1 : null;
      const porDia = medidos > 0 ? c.unidades / medidos : 0;
      const queda = r.stock?.get(c.id)?.hoy ?? 0;
      const alcanzaDias = porDia > 0 ? queda / porDia : null;
      const senal: Senal =
        alcanzaDias !== null && alcanzaDias < faltan && (diferencia === null || diferencia > -0.05) ? "pedir"
        : diferencia !== null && diferencia <= -0.2 && (alcanzaDias === null || alcanzaDias > faltan * 1.5) ? "impulsar"
        : "bien";
      return { id: c.id, nombre: c.nombre, vendidas: c.unidades, diferencia, alcanzaDias, senal };
    });
}

// ---------------------------------------------------------------------------------------------------------------------
// Al terminar: el cierre con sell-through (lo que miden los grandes: qué parte se vendió a precio lleno)
// ---------------------------------------------------------------------------------------------------------------------

export type CierreCategoria = { id: string; nombre: string; lleno: number; rebajadas: number; sobra: number; total: number; pctLleno: number };

/**
 * Por categoría: lo vendido a precio lleno, lo vendido con rebaja y lo que sobró al cerrar. Sin facturas de compra ligadas al plan, «lo que
 * había» se mide como vendido + lo que quedó (todas las sedes, sin Cuarentena). null si la base todavía no manda el stock.
 */
export function cierre(r: LecturaResultados): { categorias: CierreCategoria[]; pctLleno: number; pctRebaja: number; sobra: number; liquidarPrimero: CierreCategoria | null } | null {
  if (!r.stock) return null;
  const categorias = porCategoria(r, null)
    .filter((c) => c.unidades > 0 || (r.stock?.get(c.id)?.cierre ?? 0) > 0)
    .map((c): CierreCategoria => {
      const rebajadas = r.filas.filter((f) => f.categoria === c.id).reduce((a, f) => a + f.rebajadas, 0);
      const sobra = r.stock?.get(c.id)?.cierre ?? 0;
      const total = c.unidades + sobra;
      return { id: c.id, nombre: c.nombre, lleno: c.unidades - rebajadas, rebajadas, sobra, total, pctLleno: total > 0 ? (c.unidades - rebajadas) / total : 0 };
    })
    .filter((c) => c.total > 0);
  const total = categorias.reduce((a, c) => a + c.total, 0);
  const lleno = categorias.reduce((a, c) => a + c.lleno, 0);
  const rebaja = categorias.reduce((a, c) => a + c.rebajadas, 0);
  const sobra = categorias.reduce((a, c) => a + c.sobra, 0);
  const liquidarPrimero = [...categorias].sort((a, b) => b.sobra - a.sobra || a.nombre.localeCompare(b.nombre, "es"))[0] ?? null;
  return { categorias, pctLleno: total > 0 ? lleno / total : 0, pctRebaja: total > 0 ? rebaja / total : 0, sobra, liquidarPrimero: liquidarPrimero && liquidarPrimero.sobra > 0 ? liquidarPrimero : null };
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export type MomentoResultados = "por-venir" | "en-curso" | "terminada";
export const momentoDeResultados = (r: Pick<LecturaResultados, "plan" | "hoy">): MomentoResultados => (r.hoy <= r.plan.desde ? "por-venir" : r.hoy <= r.plan.hasta ? "en-curso" : "terminada");

/** Días medidos de la campaña (hasta ayer si sigue en curso). */
export const diasMedidos = (r: Pick<LecturaResultados, "plan" | "medidoHasta">): number => Math.max(0, diasEntre(r.plan.desde, r.medidoHasta) + 1);

/** El multiplicador real de una tienda; null si el ERP no cubría los 60 días de antes o no vendió nada en ellos. */
export function multiplicadorReal(r: Pick<LecturaResultados, "plan" | "medidoHasta">, t: TiendaResultado): number | null {
  const dias = diasMedidos(r);
  if (dias <= 0 || t.baseUnidades === null || t.baseUnidades <= 0) return null;
  return t.unidades / dias / (t.baseUnidades / DIAS_BASE);
}

export type FilaCategoria = {
  id: string;
  nombre: string;
  familia: string;
  unidades: number;
  soles: number;
  /** El plan de esa categoría, si lo tuvo. */
  plan: { flojo: number; normal: number; bueno: number; recuperoPct: number } | null;
  /** «Se vendieron 140: entre el normal y el bueno.» (solo con plan). */
  lectura: string | null;
  /** Las tiendas donde quedó en cero. */
  agotadaEn: string[];
  /** A qué % del precio de etiqueta se vendió lo de después (lo que sobró); null si no hubo ventas después o la campaña sigue. */
  recuperoReal: number | null;
};

/** Una fila por categoría (vendida o con plan), de la que más vendió a la que menos. `tienda` filtra (null = todas). */
export function porCategoria(r: LecturaResultados, tienda: string | null): FilaCategoria[] {
  const nombres = new Map(r.tiendas.map((t) => [t.id, t.nombre]));
  const ids = new Set([...r.filas.map((f) => f.categoria), ...r.lineas.keys()]);
  return [...ids]
    .map((id): FilaCategoria => {
      const vendidas = r.filas.filter((f) => f.categoria === id && (tienda === null || f.tienda === tienda));
      const unidades = vendidas.reduce((s, f) => s + f.unidades, 0);
      const plan = r.lineas.get(id) ?? null;
      const cat = r.categorias.get(id);
      const desp = r.despues.categorias.find((d) => d.categoria === id);
      return {
        id,
        nombre: cat?.nombre ?? "Categoría",
        familia: (cat?.familia && r.familias.get(cat.familia)) ?? cat?.familia ?? "Sin familia",
        unidades,
        soles: vendidas.reduce((s, f) => s + f.soles, 0),
        // El plan es de toda CAYLA: la lectura contra el plan solo vale mirando todas las tiendas.
        plan,
        lectura: plan && tienda === null ? fraseDeLoReal(unidades, plan).replace(/diciembre /g, "") : null,
        agotadaEn: r.agotadas.filter((a) => a.categoria === id && (tienda === null || a.tienda === tienda)).map((a) => nombres.get(a.tienda) ?? "una tienda"),
        recuperoReal: desp && desp.aPrecioLista > 0 && tienda === null ? Math.round((desp.soles / desp.aPrecioLista) * 100) : null,
      };
    })
    .filter((f) => f.unidades > 0 || f.plan !== null)
    .sort((a, b) => b.unidades - a.unidades || b.soles - a.soles || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo vendido agrupado por familia, de la que más a la que menos. */
export function porFamilia(r: LecturaResultados, tienda: string | null): { familia: string; unidades: number; soles: number }[] {
  const m = new Map<string, { unidades: number; soles: number }>();
  for (const f of r.filas) {
    if (tienda !== null && f.tienda !== tienda) continue;
    const cat = r.categorias.get(f.categoria);
    const fam = (cat?.familia && r.familias.get(cat.familia)) ?? cat?.familia ?? "Sin familia";
    const x = m.get(fam) ?? { unidades: 0, soles: 0 };
    m.set(fam, { unidades: x.unidades + f.unidades, soles: x.soles + f.soles });
  }
  return [...m.entries()].map(([familia, v]) => ({ familia, ...v })).sort((a, b) => b.unidades - a.unidades || a.familia.localeCompare(b.familia, "es"));
}

/** Las prendas que más vendieron (prenda + color), hasta `n`. Lo anotado «sin registrar» va como «Sin registrar · <categoría>». */
export function prendasQueMasVendieron(r: LecturaResultados, tienda: string | null, n = 10, categoria: string | null = null): { clave: string; prenda: string; color: string | null; hex: string | null; unidades: number; soles: number }[] {
  const m = new Map<string, { prenda: string; color: string | null; hex: string | null; unidades: number; soles: number }>();
  for (const f of r.filas) {
    if ((tienda !== null && f.tienda !== tienda) || (categoria !== null && f.categoria !== categoria)) continue;
    const clave = `${f.producto ?? `anotada:${f.categoria}`}|${f.color ?? ""}`;
    const prenda = f.producto ? (r.productos.get(f.producto) ?? "Prenda") : `Sin registrar · ${r.categorias.get(f.categoria)?.nombre ?? "categoría"}`;
    const color = f.color ? (r.colores.get(f.color) ?? null) : null;
    const x = m.get(clave) ?? { prenda, color: color?.nombre ?? null, hex: color?.hex ?? null, unidades: 0, soles: 0 };
    m.set(clave, { ...x, unidades: x.unidades + f.unidades, soles: x.soles + f.soles });
  }
  return [...m.entries()]
    .map(([clave, v]) => ({ clave, ...v }))
    .sort((a, b) => b.unidades - a.unidades || b.soles - a.soles || a.prenda.localeCompare(b.prenda, "es"))
    .slice(0, n);
}

/** Los colores que más vendieron, hasta `n`. */
export function coloresQueMasVendieron(r: LecturaResultados, tienda: string | null, n = 8, categoria: string | null = null): { codigo: string; nombre: string; hex: string | null; unidades: number }[] {
  const m = new Map<string, number>();
  for (const f of r.filas) if (f.color && (tienda === null || f.tienda === tienda) && (categoria === null || f.categoria === categoria)) m.set(f.color, (m.get(f.color) ?? 0) + f.unidades);
  return [...m.entries()]
    .map(([codigo, unidades]) => ({ codigo, nombre: r.colores.get(codigo)?.nombre ?? codigo, hex: r.colores.get(codigo)?.hex ?? null, unidades }))
    .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, n);
}

/** El % real de lo que sobró de toda la campaña (lo cobrado ÷ lo que valía), para sugerirlo la próxima vez; null si no hay con qué. */
export function recuperoRealTotal(r: LecturaResultados): number | null {
  const soles = r.despues.categorias.reduce((s, d) => s + d.soles, 0);
  const lista = r.despues.categorias.reduce((s, d) => s + d.aPrecioLista, 0);
  return lista > 0 ? Math.round((soles / lista) * 100) : null;
}

/** Qué campaña muestra Resultados sin `?plan=`: la que está en curso; si no, la que terminó más tarde; si no, la próxima. */
export function campanaParaResultados<T extends { id: string; desde: string; hasta: string; archivado: boolean }>(planes: readonly T[], hoy: string): T | null {
  const activas = planes.filter((p) => !p.archivado);
  const enCurso = activas.filter((p) => p.desde <= hoy && hoy <= p.hasta).sort((a, b) => a.hasta.localeCompare(b.hasta))[0];
  const terminada = activas.filter((p) => p.hasta < hoy).sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
  const proxima = activas.filter((p) => p.desde > hoy).sort((a, b) => a.desde.localeCompare(b.desde))[0];
  return enCurso ?? terminada ?? proxima ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// La tabla de categorías: buscar y ordenar (Felipe 2026-10-12, «como en el Historial»)
// ---------------------------------------------------------------------------------------------------------------------

export type OrdenResultados = "mas" | "menos" | "az" | "za";
export const ORDENES_RESULTADOS: { valor: OrdenResultados; texto: string }[] = [
  { valor: "mas", texto: "Más vendidas primero" },
  { valor: "menos", texto: "Menos vendidas primero" },
  { valor: "az", texto: "Nombre, A a Z" },
  { valor: "za", texto: "Nombre, Z a A" },
];

const comparable = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Las categorías que calzan con lo buscado (nombre o familia, sin tildes ni mayúsculas), en el orden pedido. «Más vendidas» es el de siempre. */
export function filtrarYOrdenarCategorias(filas: readonly FilaCategoria[], q: string, orden: OrdenResultados): FilaCategoria[] {
  const busca = comparable(q.trim());
  const quedan = busca ? filas.filter((f) => comparable(`${f.nombre} ${f.familia}`).includes(busca)) : [...filas];
  const porNombre = (a: FilaCategoria, b: FilaCategoria) => a.nombre.localeCompare(b.nombre, "es");
  if (orden === "az") return quedan.sort(porNombre);
  if (orden === "za") return quedan.sort((a, b) => porNombre(b, a));
  if (orden === "menos") return quedan.sort((a, b) => a.unidades - b.unidades || a.soles - b.soles || porNombre(a, b));
  return quedan.sort((a, b) => b.unidades - a.unidades || b.soles - a.soles || porNombre(a, b));
}

// ---------------------------------------------------------------------------------------------------------------------
// El detalle de una categoría: contra lo esperado y contra la campaña pasada (Felipe 2026-10-12)
// ---------------------------------------------------------------------------------------------------------------------

/** Qué parte de la campaña ya pasó (0 a 1), con el peso de cada día; 1 si terminó. */
export function parteQuePaso(r: Pick<LecturaResultados, "plan" | "medidoHasta">, pesos: readonly number[]): number {
  const total = pesos.reduce((a, p) => a + p, 0);
  if (total <= 0) return 0;
  return pesos.slice(0, Math.min(pesos.length, diasMedidos(r))).reduce((a, p) => a + p, 0) / total;
}

export type ContraLoEsperado = {
  /** Lo vendido en todas las tiendas (el plan es de toda CAYLA). */
  vendidas: number;
  plan: { flojo: number; normal: number; bueno: number };
  /** Lo que el «normal» esperaba a hoy; igual al normal si la campaña terminó. */
  esperado: number;
  /** vendidas ÷ esperado − 1; null si no se esperaba nada todavía. */
  diferencia: number | null;
  terminada: boolean;
};

/** Una categoría contra su plan, a hoy (o al cierre). null si la categoría no tuvo plan: no hay contra qué comparar. */
export function contraLoEsperado(r: LecturaResultados, categoriaId: string, pesos: readonly number[]): ContraLoEsperado | null {
  const plan = r.lineas.get(categoriaId);
  if (!plan) return null;
  const vendidas = r.filas.filter((f) => f.categoria === categoriaId).reduce((a, f) => a + f.unidades, 0);
  const terminada = momentoDeResultados(r) === "terminada";
  const esperado = Math.round(plan.normal * (terminada ? 1 : parteQuePaso(r, pesos)));
  return { vendidas, plan: { flojo: plan.flojo, normal: plan.normal, bueno: plan.bueno }, esperado, diferencia: esperado > 0 ? vendidas / esperado - 1 : null, terminada };
}

export type ContraLaPasada = {
  desde: string;
  hasta: string;
  /** Lo que vendió esa categoría en la misma campaña del año anterior, en toda la campaña, sumando las tiendas con dato. */
  unidades: number;
  /** Tiendas que ya vendían en el ERP en esa campaña (con sus 60 días de antes). */
  conDato: string[];
  /** Tiendas sin esa campaña en el ERP: Sinatra trae soles por tienda, no categorías, así que no hay con qué comparar. */
  sinDato: string[];
};

/**
 * La misma categoría en la misma campaña del año anterior, por unidades. Sale de la propuesta del Plan (C4), que ya lo lee. null si la
 * propuesta no se pudo leer. `tienda` filtra (null = todas).
 */
export function contraLaCampanaPasada(p: LecturaPropuesta | null, categoriaId: string, tienda: string | null): ContraLaPasada | null {
  if (!p) return null;
  const tiendas = p.tiendas.filter((t) => tienda === null || t.id === tienda);
  const conDato = tiendas.filter((t) => t.previaDisponible);
  const hechos = p.categorias.get(categoriaId) ?? [];
  const unidades = hechos.filter((h) => conDato.some((t) => t.id === h.tienda)).reduce((a, h) => a + h.previa, 0);
  return { desde: p.previa.desde, hasta: p.previa.hasta, unidades, conDato: conDato.map((t) => t.nombre), sinDato: tiendas.filter((t) => !t.previaDisponible).map((t) => t.nombre) };
}
