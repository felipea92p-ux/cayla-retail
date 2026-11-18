// El ranking de la lista de Proveedores (dirección «C · Filas con su venta», elegida por Felipe el 2026-10-26; maqueta en
// docs/maquetas/proveedores-v5-2026-10/). La pestaña Mercadería deja de ser un directorio y pasa a ser un ranking: cada proveedor al que se le
// compró, del que más le compras al que menos, con cuánto se vendió, en cuántas semanas se vende lo que queda y qué hacer.
//
// Puro, sin I/O. No inventa cuentas: las filas salen de `rankingDeProveedores` (las mismas de «Lo que le compré» y del veredicto) y el ritmo es la
// regla única de `proveedor-ritmo-reglas.ts`, la que ya usan el aviso «frenar» y el veredicto del ranking. Así la lista, los avisos y la ficha no
// se contradicen.

import { diasEntreFechas } from "./fechas-lima";
import { ritmoDeDatos, type Ritmo } from "./proveedor-ritmo-reglas";
import { COSTO_REAL_MIN_PCT, rankingDeProveedores, type FilaDeRanking, type RendimientoProveedor } from "./proveedor-prendas-reglas";

/** Lo que dice el ritmo, en una palabra que la tienda entiende. */
export type ClaseRitmo = "rapido" | "medio" | "lento" | "nomide";

// «Frena compras», no «Frena» (Formidable 2026-10-26): sola, la palabra se leía igual como un estado del proveedor que como una orden para ti.
// `que` es lo que toca hacer, en una frase: lo dice la vista rápida junto a los números.
export const RITMOS: Record<ClaseRitmo, { palabra: string; tono: "verde" | "pizarra" | "ambar" | "neutro"; ayuda: string; que: string }> = {
  rapido: { palabra: "Repón", tono: "verde", ayuda: "Lo que le queda se acaba en 6 semanas o menos", que: "Repón: lo que le queda se acaba pronto." },
  medio: { palabra: "A su ritmo", tono: "pizarra", ayuda: "Lo que le queda se vende en 6 a 16 semanas", que: "Va a su ritmo: lo que le queda se vende en una temporada." },
  lento: { palabra: "Frena compras", tono: "ambar", ayuda: "Vender lo que le queda tardaría 16 semanas o más", que: "Frena las compras: primero vende lo que tienes." },
  nomide: { palabra: "Poco para medir", tono: "neutro", ayuda: "Te llegaron menos de 20 prendas o llegaron hace menos de 3 semanas", que: "Todavía es poco para decir cómo se vende." },
};

export function claseDeRitmo(r: Ritmo): ClaseRitmo {
  if (!r.juzgable) return "nomide";
  if (r.lento) return "lento";
  // Lo que ya se vendió entero también es «repón»: no le queda nada en estantes.
  if (r.agota || (r.enEstantes === 0 && r.vendidas > 0)) return "rapido";
  return "medio";
}

/** Con qué se mide «cuánto le compras»: las prendas compradas o el dinero gastado (Felipe 2026-10-26: cada una con su ícono). */
export type MedidaRanking = "prendas" | "soles";

export type FilaRanking = FilaDeRanking & {
  puesto: number;
  ritmo: Ritmo;
  clase: ClaseRitmo;
};

/**
 * Las filas del ranking: los proveedores de mercadería activos a los que se les compró algo, ordenados por prendas compradas o por dinero gastado
 * según `medida` (y, si empatan, por la otra medida y el nombre). El Taller va aparte, como en todo Proveedores (ADR-0502 act. (b)). `activos` son los ids de los proveedores de
 * mercadería activos: un proveedor desactivado o de servicios no entra al ranking aunque tenga prendas.
 */
export function filasDelRanking(
  filas: readonly RendimientoProveedor[],
  activos: ReadonlySet<string>,
  hoy: string,
  medida: MedidaRanking = "prendas",
): { filas: FilaRanking[]; taller: (RendimientoProveedor & { pesoPct: number }) | null } {
  const { ranking, taller } = rankingDeProveedores(filas, hoy);
  const [primero, segundo] = medida === "soles" ? (["gasto", "unidadesCompradas"] as const) : (["unidadesCompradas", "gasto"] as const);
  const ordenadas = ranking
    .filter((f) => activos.has(f.proveedorId) && f.unidadesCompradas > 0)
    .sort((a, b) => b[primero] - a[primero] || b[segundo] - a[segundo] || a.nombre.localeCompare(b.nombre, "es"));
  return {
    filas: ordenadas.map((f, i) => {
      const ritmo = ritmoDeDatos(
        { unidadesVendidas: f.unidadesVendidas, unidadesCompradas: f.unidadesCompradas, unidadesEnEstantes: f.unidadesEnEstantes, primeraEntrada: f.primeraEntrada },
        hoy,
      );
      return { ...f, puesto: i + 1, ritmo, clase: claseDeRitmo(ritmo) };
    }),
    taller,
  };
}

/** Las semanas para vender lo que queda, cortas para la fila: «3 sem», «100+ sem», «Sin ventas»; `null` si no se puede medir. */
export function semanasCortas(r: Ritmo): string | null {
  if (!r.juzgable) return null;
  if (r.enEstantes === 0) return "Agotado";
  if (!Number.isFinite(r.semanasParaAgotar)) return "Sin ventas";
  if (r.semanasParaAgotar >= 100) return "100+ sem";
  return `${Math.max(1, Math.round(r.semanasParaAgotar))} sem`;
}

/** Las semanas exactas, para la comparación: ahí «100+ sem» empataba a 385 con 202. `null` si no se puede medir. */
export function semanasExactas(r: Ritmo): string | null {
  if (!r.juzgable) return null;
  if (r.enEstantes === 0) return "Agotado";
  if (!Number.isFinite(r.semanasParaAgotar)) return "Sin ventas";
  return `${Math.max(1, Math.round(r.semanasParaAgotar)).toLocaleString("es-PE")} sem`;
}

/** Cuántas vende por semana, para leerse junto a las semanas («1.5 por semana», con el punto de los montos del ERP). */
export const porSemanaTexto = (r: Ritmo) => `${(Math.round(r.porSemana * 10) / 10).toLocaleString("es-PE")} por semana`;

/**
 * El «¿Por qué?» de la insignia, para la vista rápida (Formidable 2026-10-26: antes vivía solo al pasar el mouse). Los números con los que se
 * decidió, en palabras de tienda; los mismos de `ritmoDeDatos`, sin cuentas nuevas.
 */
export function porqueDelRitmo(f: Pick<FilaRanking, "ritmo" | "clase" | "unidadesCompradas">): { que: string; numeros: string[] } {
  const r = f.ritmo;
  const que = RITMOS[f.clase].que;
  if (!r.juzgable) return { que, numeros: [`Te llegaron ${f.unidadesCompradas.toLocaleString("es-PE")} prendas suyas.`, "Se mide con 20 prendas o más que lleven 3 semanas en tus tiendas."] };
  const numeros = [`Vende ${porSemanaTexto(r)} (${r.vendidas.toLocaleString("es-PE")} desde que llegó).`, `Le quedan ${r.enEstantes.toLocaleString("es-PE")} en tus tiendas.`];
  if (r.enEstantes === 0) numeros.push("Ya se vendió todo lo que te llegó.");
  else if (!Number.isFinite(r.semanasParaAgotar)) numeros.push("No ha vendido nada: no se puede decir cuándo se acaba.");
  else numeros.push(`A ese ritmo, venderlo todo tardaría unas ${Math.max(1, Math.round(r.semanasParaAgotar)).toLocaleString("es-PE")} semanas.`);
  return { que, numeros };
}

/** Lo que dice la insignia del ritmo: las semanas y la palabra («3 sem · Repón»), o «Poco para medir». */
export function textoRitmo(f: Pick<FilaRanking, "ritmo" | "clase">): string {
  const sem = semanasCortas(f.ritmo);
  return sem ? `${sem} · ${RITMOS[f.clase].palabra}` : RITMOS[f.clase].palabra;
}

/** Los filtros de la lista: por ritmo o «con deuda vencida». `null` = todos. */
export type FiltroRanking = ClaseRitmo | "vencido" | null;

export function contarPorRitmo(filas: readonly Pick<FilaRanking, "clase">[]): Record<ClaseRitmo, number> {
  const n: Record<ClaseRitmo, number> = { rapido: 0, medio: 0, lento: 0, nomide: 0 };
  for (const f of filas) n[f.clase] += 1;
  return n;
}

export function pasaFiltroRanking(f: Pick<FilaRanking, "clase">, filtro: FiltroRanking, vencido: boolean): boolean {
  if (!filtro) return true;
  if (filtro === "vencido") return vencido;
  return f.clase === filtro;
}

/** Cuántas filas se ven antes de «Ver los que faltan». */
export const FILAS_A_LA_VISTA = 20;

/** Cuántos proveedores se comparan a la vez en la columna derecha (la maqueta C). */
export const MAX_COMPARAR = 3;

/**
 * Marca o desmarca un proveedor para compararlo. Con 3 ya marcados, el cuarto entra y sale el primero que se marcó: perdona en vez de
 * preguntar (ADR-0350, ley 7), y la comparación a la vista dice quién quedó.
 */
export function alternarComparar(lista: readonly string[], id: string): string[] {
  if (lista.includes(id)) return lista.filter((x) => x !== id);
  return [...lista.slice(-(MAX_COMPARAR - 1)), id];
}

/** Cuánto le compras a un proveedor en la medida elegida. */
export const valorDe = (f: Pick<FilaRanking, "unidadesCompradas" | "gasto">, medida: MedidaRanking) => (medida === "soles" ? f.gasto : f.unidadesCompradas);

/**
 * El dinero de un proveedor es aproximado cuando la mitad o más de lo que le compraste vino por la carga inicial (costo estimado): se escribe con
 * «≈». La misma regla que decide «Costo por confirmar» (`COSTO_REAL_MIN_PCT`).
 */
export const esAproximado = (f: Pick<FilaRanking, "costoRealPct">) => f.costoRealPct < COSTO_REAL_MIN_PCT;

/** Cuántos puestos subió (positivo) o bajó (negativo) al cambiar de medida; 0 si no se movió o no estaba antes. */
export function cambioDePuesto(antes: ReadonlyMap<string, number> | null, f: Pick<FilaRanking, "proveedorId" | "puesto">): number {
  const previo = antes?.get(f.proveedorId);
  return previo == null ? 0 : previo - f.puesto;
}

/** Los totales de las dos tarjetas de arriba: todas las prendas compradas, todo el dinero gastado y qué parte de las prendas vino por la carga. */
export function totalesDelRanking(filas: readonly Pick<FilaRanking, "unidadesCompradas" | "unidadesCompras" | "gasto">[]): { prendas: number; gasto: number; cargaPct: number } {
  const prendas = filas.reduce((a, f) => a + f.unidadesCompradas, 0);
  const compras = filas.reduce((a, f) => a + f.unidadesCompras, 0);
  return { prendas, gasto: filas.reduce((a, f) => a + f.gasto, 0), cargaPct: prendas > 0 ? ((prendas - compras) / prendas) * 100 : 0 };
}

// ---------------------------------------------------------------------------
// La columna derecha, «Lo que no se ve a simple vista»: lo de hoy (lo vencido, las entregas atrasadas, lo que te deben) y cuánto de lo que
// compras se concentra en pocos proveedores. Los avisos de compra (frenar, plata parada, margen, reponer) vienen de `hallazgosDeCartera`.
// ---------------------------------------------------------------------------

type ProveedorDeHoy = { id: string; nombre: string; saldo_vencido: number | null; facturas_atrasadas: number | null; saldo_favor: number | null };

/** Lo que pide actuar hoy, de mayor a menor: lo vencido, las entregas atrasadas y lo que los proveedores te deben (saldo a favor). */
export function paraHoy<P extends ProveedorDeHoy>(proveedores: readonly P[]) {
  const de = (k: "saldo_vencido" | "facturas_atrasadas" | "saldo_favor"): P[] =>
    proveedores.filter((p) => (p[k] ?? 0) > 0).sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0) || a.nombre.localeCompare(b.nombre, "es"));
  const suma = (xs: readonly P[], k: "saldo_vencido" | "facturas_atrasadas" | "saldo_favor") => xs.reduce((a, p) => a + (p[k] ?? 0), 0);
  const vencidos = de("saldo_vencido"), atrasados = de("facturas_atrasadas"), aFavor = de("saldo_favor");
  return {
    vencidos, vencido: suma(vencidos, "saldo_vencido"),
    atrasados, atrasadas: suma(atrasados, "facturas_atrasadas"),
    aFavor, favor: suma(aFavor, "saldo_favor"),
  };
}

// ---------------------------------------------------------------------------
// Las ventas por día de cada proveedor (`fn_proveedores_ventas_diarias`, 20261026172000): la línea chica de cada fila y «N esta semana».
// ---------------------------------------------------------------------------

/** Cuántos días mira la línea de cada fila. */
export const DIAS_DE_VENTAS = 28;

/**
 * La serie de cada proveedor: `dias` valores, del más viejo al de hoy, con cero los días sin ventas (la base no los manda). Un día fuera de la
 * ventana se ignora.
 */
export function seriesDeVentas(filas: readonly { proveedor_id: string; dia: string; vendidas: number }[], hoy: string, dias = DIAS_DE_VENTAS): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const f of filas) {
    const atras = diasEntreFechas(f.dia, hoy);
    if (atras < 0 || atras >= dias) continue;
    (out[f.proveedor_id] ??= Array.from({ length: dias }, () => 0))[dias - 1 - atras] += f.vendidas;
  }
  return out;
}

/** Lo vendido los últimos 7 días contra los 7 de antes: lo que dice la fila («19 esta semana ↑»). */
export function semanaDeVentas(serie: readonly number[]): { estaSemana: number; anterior: number; tendencia: "sube" | "baja" | "igual" } {
  const suma = (xs: readonly number[]) => xs.reduce((a, v) => a + v, 0);
  const estaSemana = suma(serie.slice(-7));
  const anterior = suma(serie.slice(-14, -7));
  return { estaSemana, anterior, tendencia: estaSemana > anterior ? "sube" : estaSemana < anterior ? "baja" : "igual" };
}
