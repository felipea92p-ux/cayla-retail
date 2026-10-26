// El ranking de la lista de Proveedores (dirección «C · Filas con su venta», elegida por Felipe el 2026-10-26; maqueta en
// docs/maquetas/proveedores-v5-2026-10/). La pestaña Mercadería deja de ser un directorio y pasa a ser un ranking: cada proveedor al que se le
// compró, del que más le compras al que menos, con cuánto se vendió, en cuántas semanas se vende lo que queda y qué hacer.
//
// Puro, sin I/O. No inventa cuentas: las filas salen de `rankingDeProveedores` (las mismas de «Lo que le compré» y del veredicto) y el ritmo es la
// regla única de `proveedor-ritmo-reglas.ts`, la que ya usan el aviso «frenar» y el veredicto del ranking. Así la lista, los avisos y la ficha no
// se contradicen.

import { ritmoDeDatos, type Ritmo } from "./proveedor-ritmo-reglas";
import { rankingDeProveedores, type FilaDeRanking, type RendimientoProveedor } from "./proveedor-prendas-reglas";

/** Lo que dice el ritmo, en una palabra que la tienda entiende. */
export type ClaseRitmo = "rapido" | "medio" | "lento" | "nomide";

export const RITMOS: Record<ClaseRitmo, { palabra: string; tono: "verde" | "pizarra" | "ambar" | "neutro"; ayuda: string }> = {
  rapido: { palabra: "Repón", tono: "verde", ayuda: "Lo que le queda se acaba en 6 semanas o menos" },
  medio: { palabra: "A su ritmo", tono: "pizarra", ayuda: "Lo que le queda se vende en 6 a 16 semanas" },
  lento: { palabra: "Frena", tono: "ambar", ayuda: "Vender lo que le queda tardaría 16 semanas o más" },
  nomide: { palabra: "Poco para medir", tono: "neutro", ayuda: "Le compraste menos de 20 prendas o llegó hace menos de 3 semanas" },
};

export function claseDeRitmo(r: Ritmo): ClaseRitmo {
  if (!r.juzgable) return "nomide";
  if (r.lento) return "lento";
  // Lo que ya se vendió entero también es «repón»: no le queda nada en estantes.
  if (r.agota || (r.enEstantes === 0 && r.vendidas > 0)) return "rapido";
  return "medio";
}

export type FilaRanking = FilaDeRanking & {
  puesto: number;
  ritmo: Ritmo;
  clase: ClaseRitmo;
};

/**
 * Las filas del ranking: los proveedores de mercadería activos a los que se les compró algo, ordenados por prendas compradas (y, si empatan,
 * por lo gastado y el nombre). El Taller va aparte, como en todo Proveedores (ADR-0502 act. (b)). `activos` son los ids de los proveedores de
 * mercadería activos: un proveedor desactivado o de servicios no entra al ranking aunque tenga prendas.
 */
export function filasDelRanking(
  filas: readonly RendimientoProveedor[],
  activos: ReadonlySet<string>,
  hoy: string,
): { filas: FilaRanking[]; taller: (RendimientoProveedor & { pesoPct: number }) | null } {
  const { ranking, taller } = rankingDeProveedores(filas, hoy);
  const ordenadas = ranking
    .filter((f) => activos.has(f.proveedorId) && f.unidadesCompradas > 0)
    .sort((a, b) => b.unidadesCompradas - a.unidadesCompradas || b.gasto - a.gasto || a.nombre.localeCompare(b.nombre, "es"));
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
