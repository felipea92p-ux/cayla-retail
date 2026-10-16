// Tienda web ▸ Vitrina ▸ «Esperan una talla» (ADR-0408, actividad 12; maqueta docs/maquetas/tienda-online-2026-10, la cifra
// «Esperan una talla · Tocaron «Avísame»» de `vVitrina`): lo que los clientes de la tienda online esperan, por prenda (modelo, color
// y talla) y tienda. Lógica pura: se importa desde el servidor y desde el cliente, y se prueba con `vitrina-esperan-reglas.test.ts`.
//
// CONTRATO
//   PROMETE: leer lo que devuelve `retail.fn_vitrina_esperan()` sin caerse ante un dato raro; las cifras y los filtros de la
//            pantalla; y cada fila en palabras de tienda («2 personas», «hace 3 días», «Ya llegó: 2 libres»).
//   ASUME:   que la base decide qué cuenta (las esperas vivas, lo libre sin Cuarentena, si el modelo se ve en la web) y que no manda
//            ningún dato de quién espera: aquí solo hay cuántas personas.
//   NO HACE: leer la base ni decidir permisos (lo hace `fn_exigir_modulo('vitrina_web')`).

import { normalizarBusqueda } from "./combo-reglas";
import { diaLima, diasEntreFechas } from "./fechas-lima";
import { nombreCortoSede } from "./stock-por-sede";

export type TiendaEsperan = { id: string; nombre: string };
export type FilaEsperan = {
  /** La prenda y la tienda: única en la lista. */
  clave: string;
  varianteId: string;
  producto: { id: string; nombre: string; codigo: string | null; categoria: string | null; prefijo: string | null; familia: string | null; foto: string | null };
  color: { codigo: string; nombre: string; hex: string | null } | null;
  talla: string | null;
  /** La tienda donde la esperan, o `null`: en cualquier tienda de la web. */
  sede: TiendaEsperan | null;
  personas: number;
  desde: string;
  ultima: string;
  /** Lo libre ahora en ese alcance (la tienda, o todas las de la web). */
  libre: number;
  /** Las tiendas de la web con algo libre de esa prenda. */
  hayEn: { id: string; nombre: string; libre: number }[];
  seVe: boolean;
};
export type LecturaEsperan = { tiendas: TiendaEsperan[]; personas: number; filas: FilaEsperan[] };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const entero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function tiendaDeJson(v: unknown): TiendaEsperan | null {
  if (!esObjeto(v)) return null;
  const id = texto(v.id);
  const nombre = texto(v.nombre);
  return id && nombre ? { id, nombre } : null;
}

/** Una fila como la manda la base, o `null` si le falta la prenda (no se dibuja a medias). */
export function filaDeJson(v: unknown): FilaEsperan | null {
  if (!esObjeto(v) || !esObjeto(v.producto)) return null;
  const varianteId = texto(v.variante_id);
  const productoId = texto(v.producto.id);
  const nombre = texto(v.producto.nombre);
  const desde = texto(v.desde);
  if (!varianteId || !productoId || !nombre || !desde) return null;
  const sede = v.sede === null || v.sede === undefined ? null : tiendaDeJson(v.sede);
  if (v.sede && !sede) return null;
  const c = esObjeto(v.color) ? v.color : null;
  return {
    clave: `${varianteId}|${sede?.id ?? "cualquiera"}`,
    varianteId,
    producto: {
      id: productoId,
      nombre,
      codigo: texto(v.producto.codigo),
      categoria: texto(v.producto.categoria),
      prefijo: texto(v.producto.prefijo),
      familia: texto(v.producto.familia),
      foto: texto(v.producto.foto),
    },
    color: c && texto(c.codigo) && texto(c.nombre) ? { codigo: texto(c.codigo)!, nombre: texto(c.nombre)!, hex: texto(c.hex) } : null,
    talla: texto(v.talla),
    sede,
    personas: entero(v.personas),
    desde,
    ultima: texto(v.ultima) ?? desde,
    libre: entero(v.libre),
    hayEn: lista(v.hay_en).flatMap((h) => {
      const t = tiendaDeJson(h);
      return t && esObjeto(h) ? [{ ...t, libre: entero(h.libre) }] : [];
    }),
    seVe: v.se_ve === true,
  };
}

/** Lo que devuelve `fn_vitrina_esperan()`. Un dato raro deja la lista vacía, nunca la pantalla caída. */
export function leerEsperan(v: unknown): LecturaEsperan {
  if (!esObjeto(v)) return { tiendas: [], personas: 0, filas: [] };
  return {
    tiendas: lista(v.tiendas).flatMap((t) => {
      const x = tiendaDeJson(t);
      return x ? [x] : [];
    }),
    personas: entero(v.personas),
    filas: lista(v.filas).flatMap((f) => {
      const x = filaDeJson(f);
      return x ? [x] : [];
    }),
  };
}

/* ---------------- Lo que dice cada fila ---------------- */

/** Ya llegó (hay libre en ese alcance), falta, o el modelo ya no se ve en la web. */
export type EstadoEspera = "falta" | "llego" | "fuera";

export function estadoFila(f: FilaEsperan): EstadoEspera {
  if (!f.seVe) return "fuera";
  return f.libre > 0 ? "llego" : "falta";
}

/** «Negro · M». */
export const prendaDicha = (f: FilaEsperan): string => [f.color?.nombre, f.talla].filter(Boolean).join(" · ");

/** «Trujillo» o «Cualquier tienda». */
export const tiendaDicha = (f: FilaEsperan): string => (f.sede ? nombreCortoSede(f.sede.nombre) : "Cualquier tienda");

/** «1 persona», «3 personas». */
export const personasDichas = (n: number): string => `${n} ${n === 1 ? "persona" : "personas"}`;

/** Desde cuándo la esperan, contado en días de Lima: «hoy», «ayer», «hace 3 días». */
export function desdeCuando(iso: string, hoy: string): string {
  const dia = diaLima(iso);
  if (!dia) return "—";
  const d = Math.max(0, diasEntreFechas(dia, hoy));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

/** Lo que dice la columna «Ahora»: si llegó, cuánto hay libre; si falta, dónde hay (para pedirla a otra sede). */
export function ahoraDicho(f: FilaEsperan): string {
  const estado = estadoFila(f);
  if (estado === "fuera") return "No se ve en la web";
  if (estado === "llego") return `Ya llegó: ${f.libre} ${f.libre === 1 ? "libre" : "libres"}`;
  const otras = f.hayEn.filter((h) => h.id !== f.sede?.id);
  if (otras.length === 0) return "No hay en ninguna tienda";
  return `Hay en ${otras.map((h) => `${nombreCortoSede(h.nombre)} (${h.libre})`).join(", ")}`;
}

/* ---------------- Cifras y filtros ---------------- */

export type CifrasEsperan = { personas: number; faltan: number; llegaron: number };

export function cifrasEsperan(l: LecturaEsperan): CifrasEsperan {
  return {
    personas: l.personas,
    faltan: l.filas.filter((f) => estadoFila(f) === "falta").length,
    llegaron: l.filas.filter((f) => estadoFila(f) === "llego").length,
  };
}

/** `todas`, una tienda por su id, o `cualquiera` (las que dan igual la tienda). */
export type FiltroTienda = string;
export type FiltroEstado = "todos" | "faltan" | "llegaron";

export function filtrarEsperan(filas: readonly FilaEsperan[], { tienda, estado, busqueda }: { tienda: FiltroTienda; estado: FiltroEstado; busqueda: string }): FilaEsperan[] {
  const q = normalizarBusqueda(busqueda.trim());
  return filas.filter((f) => {
    if (tienda === "cualquiera" && f.sede !== null) return false;
    if (tienda !== "todas" && tienda !== "cualquiera" && f.sede?.id !== tienda) return false;
    if (estado === "faltan" && estadoFila(f) !== "falta") return false;
    if (estado === "llegaron" && estadoFila(f) !== "llego") return false;
    if (!q) return true;
    return normalizarBusqueda(`${f.producto.nombre} ${f.producto.codigo ?? ""} ${f.color?.nombre ?? ""} ${f.talla ?? ""} ${f.producto.categoria ?? ""}`).includes(q);
  });
}

/** Las píldoras de tienda: Todas · cada tienda de la web · Cualquier tienda, cada una con cuántas filas tiene. */
export function pildorasDeTienda(l: LecturaEsperan): { valor: FiltroTienda; texto: string; cuantas: number }[] {
  return [
    { valor: "todas", texto: "Todas", cuantas: l.filas.length },
    ...l.tiendas.map((t) => ({ valor: t.id, texto: nombreCortoSede(t.nombre), cuantas: l.filas.filter((f) => f.sede?.id === t.id).length })),
    { valor: "cualquiera", texto: "Cualquier tienda", cuantas: l.filas.filter((f) => f.sede === null).length },
  ];
}

/** La cifra de la Vitrina: cuántas personas esperan algo (la cuenta de la base) o, si no se pudo leer, `null`. */
export function personasQueEsperan(v: unknown): number | null {
  return esObjeto(v) ? entero(v.personas) : null;
}
