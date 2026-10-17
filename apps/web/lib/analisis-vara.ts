// Análisis ▸ «No se vende» contra la vara de su categoría (ADR-0357, act. 2026-10-14; Felipe 2026-10-12 y 2026-10-14; act. 2026-10-17, B1). Lógica pura.
//
// EL PROBLEMA PRIMERO. «Liquidar desde» era un número de días para todo: con 15, en TRU no se señalaba ninguna prenda (nada que se vaya
// a vender tarda tanto) y con 60, menos; además, «Vigílalas» (de 30 días al umbral) no podía tener filas con un umbral menor que 30. Un
// solo número no sirve para un polo que se vende en 3 días y un vestido que tarda 10.
//
// LA REGLA. Una prenda quieta se compara con lo que tardan en venderse las de SU tipo en el piso de la tienda: la vara de Frescura, con su
// cascada (la del mes, la de CAYLA, la de hoy: `varaQueJuzgo`). Se vigila desde que lleva más que 3 de cada 4 que sí se vendieron (p75,
// el «Envejeciendo» de Frescura) y se manda o se liquida desde que lleva más que 9 de cada 10 (p90, el «Envejecida»). Así las dos
// pantallas dicen lo mismo de la misma prenda.
//
// CUÁNDO NO (B1, 2026-10-17). Para decidir (dinero) la vara tiene que tener las ventas con que Frescura juzga sola (`VENTAS_PARA_JUZGAR_SOLA`): con 3
// ventas rápidas, p90 sale de 2 días y todo lo colgado hace 3 parecería para rebajar. Un tipo sin esa vara NO se mide con un número de días fijo (Felipe:
// «no es lo mismo un polo que un jean»): sus modelos quietos quedan en «Todavía sin ritmo» (`SinRitmo`), sin rebajar, sin mandar y sin vigilar.

import { varaQueJuzgo, VENTAS_PARA_JUZGAR_SOLA, type VaraCategoria } from "./frescura-reglas";
import { diasDeCorte } from "./frescura-pantalla";
import type { PrendaAnalisis, SinRitmo, UmbralesQuieta } from "./analisis-tipos";

/** Los dos escalones de una categoría, en días, o null si su vara no alcanza para juzgar (queda «Todavía sin ritmo»: `sinRitmoDeVara`). */
export function umbralesDeVara(v: VaraCategoria): UmbralesQuieta | null {
  const vara = varaQueJuzgo(v);
  if (vara.vendidas < VENTAS_PARA_JUZGAR_SOLA || vara.cortes.p75 === null || vara.cortes.p90 === null) return null;
  return { vigila: diasDeCorte(vara.cortes.p75), liquidar: diasDeCorte(vara.cortes.p90), vara: vara.cual, vendidas: Math.round(vara.vendidas) };
}

/** Los escalones de cada tipo (por nombre de categoría, como agrupa Análisis); solo los que alcanzan. */
export function umbralesPorTipo(categorias: readonly VaraCategoria[]): Map<string, UmbralesQuieta> {
  const porTipo = new Map<string, UmbralesQuieta>();
  for (const c of categorias) {
    const u = umbralesDeVara(c);
    if (u) porTipo.set(c.categoriaNombre.trim(), u);
  }
  return porTipo;
}

/** El nombre del tipo como lo agrupa Frescura: sin categoría, «Sin categoría» (una prenda sin categoría también tiene su vara, y no se pierde en silencio). */
const SIN_CATEGORIA_FRESCURA = "Sin categoría";
const claveDeTipo = (categoria: string | null): string => categoria?.trim() || SIN_CATEGORIA_FRESCURA;

/** Cada talla con los escalones de su tipo (si los tiene): se copian al modelo, que es del mismo tipo. */
export function conUmbrales<T extends Pick<PrendaAnalisis, "categoria">>(tallas: readonly T[], porTipo: ReadonlyMap<string, UmbralesQuieta>): T[] {
  return tallas.map((t) => {
    const u = porTipo.get(claveDeTipo(t.categoria));
    return u ? { ...t, umbrales: u } : t;
  });
}

/**
 * Lo que se sabe de un tipo cuya vara NO alcanza para juzgar (menos de `VENTAS_PARA_JUZGAR_SOLA` ventas, o sin P75/P90), o null si sí alcanza o si
 * no vendió nada (sin ninguna venta con edad conocida no hay con qué comparar: ningún modelo se rotula). `desde`: los días en el piso desde los que
 * un modelo ya lleva más que la mitad de su tipo (P50) o, si ni la mitad se vendió, más que la venta más lenta vista de su tipo (ninguna de las que sí se vendieron tardó tanto).
 */
export function sinRitmoDeVara(v: VaraCategoria): Extract<SinRitmo, { motivo: "poca_venta" }> | null {
  if (umbralesDeVara(v) !== null) return null;
  const juzga = varaQueJuzgo(v);
  // La misma vara que juzgó (la del mes, la de CAYLA o la de hoy) también trae la última venta vista.
  const fuente = v.delMes?.enUso ? v.delMes : v.respaldo?.enUso ? v.respaldo : v;
  if (!(juzga.vendidas > 0)) return null;
  const ultima = fuente.ultimaVentaSeg ?? null;
  const desde = juzga.cortes.p50 !== null ? diasDeCorte(juzga.cortes.p50) : ultima !== null ? diasDeCorte(ultima) : null;
  return { motivo: "poca_venta", desde, vendidas: Math.round(juzga.vendidas), unidades: Math.round(fuente.unidades) };
}

/** Lo que se sabe de cada tipo sin ritmo suficiente (por nombre de categoría, como agrupa Análisis). */
export function sinRitmoPorTipo(categorias: readonly VaraCategoria[]): Map<string, Extract<SinRitmo, { motivo: "poca_venta" }>> {
  const porTipo = new Map<string, Extract<SinRitmo, { motivo: "poca_venta" }>>();
  for (const c of categorias) {
    const s = sinRitmoDeVara(c);
    if (s) porTipo.set(c.categoriaNombre.trim(), s);
  }
  return porTipo;
}

/**
 * A cada talla de un tipo SIN vara suficiente, por qué: `poca_venta` con lo que se sabe de su tipo (si Frescura se leyó), o `sin_lectura` con el motivo
 * (si no). Una talla que ya tiene `umbrales` no se toca. Con Frescura leída, un tipo sin ninguna venta no recibe nada: no se rotula.
 */
export function conSinRitmo<T extends Pick<PrendaAnalisis, "categoria" | "umbrales">>(
  tallas: readonly T[],
  porTipo: ReadonlyMap<string, Extract<SinRitmo, { motivo: "poca_venta" }>>,
  frescura: "ok" | "sin_modulo" | "fallo" | "no_aplica",
): T[] {
  return tallas.map((t) => {
    if (t.umbrales) return t;
    if (frescura !== "ok") return { ...t, sinRitmo: { motivo: "sin_lectura", porque: frescura } satisfies SinRitmo };
    const s = porTipo.get(claveDeTipo(t.categoria));
    return s ? { ...t, sinRitmo: s } : t;
  });
}
