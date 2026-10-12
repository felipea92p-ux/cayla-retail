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

export const RPC_RESULTADOS = "fn_plan_compra_resultados";
const DIAS_BASE = 60;

export type TiendaResultado = { id: string; nombre: string; unidades: number; soles: number; baseUnidades: number | null };
export type FilaVendida = { tienda: string; categoria: string; producto: string | null; color: string | null; unidades: number; soles: number };
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
      return tienda && categoria ? [{ tienda, categoria, producto: texto(f.p), color: texto(f.color), unidades: num(f.unidades), soles: num(f.soles) }] : [];
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
  };
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
export function prendasQueMasVendieron(r: LecturaResultados, tienda: string | null, n = 10): { clave: string; prenda: string; color: string | null; hex: string | null; unidades: number; soles: number }[] {
  const m = new Map<string, { prenda: string; color: string | null; hex: string | null; unidades: number; soles: number }>();
  for (const f of r.filas) {
    if (tienda !== null && f.tienda !== tienda) continue;
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
export function coloresQueMasVendieron(r: LecturaResultados, tienda: string | null, n = 8): { codigo: string; nombre: string; hex: string | null; unidades: number }[] {
  const m = new Map<string, number>();
  for (const f of r.filas) if (f.color && (tienda === null || f.tienda === tienda)) m.set(f.color, (m.get(f.color) ?? 0) + f.unidades);
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
