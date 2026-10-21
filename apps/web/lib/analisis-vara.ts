// Análisis ▸ «No se vende» contra la vara de su categoría (ADR-0357, act. 2026-10-14; Felipe 2026-10-12 y 2026-10-14). Lógica pura.
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
// CUÁNDO NO. Para liquidar (dinero) la vara tiene que tener las ventas con que Frescura juzga sola (`VENTAS_PARA_JUZGAR_SOLA`): con 3
// ventas rápidas, p90 sale de 2 días y todo lo colgado hace 3 parecería para rebajar. Sin esa vara —o sin Frescura— manda «Liquidar
// desde», que pasa a ser el respaldo (Felipe 2026-10-12), y «Vigílalas» sigue desde un mes.

import { varaQueJuzgo, VENTAS_PARA_JUZGAR_SOLA, type VaraCategoria } from "./frescura-reglas";
import { diasDeCorte } from "./frescura-pantalla";
import type { PrendaAnalisis, UmbralesQuieta } from "./analisis-tipos";

/** Los dos escalones de una categoría, en días, o null si su vara no alcanza para juzgar (cae a «Liquidar desde»). */
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

/** Cada talla con los escalones de su tipo (si los tiene): se copian al modelo, que es del mismo tipo. */
export function conUmbrales<T extends Pick<PrendaAnalisis, "categoria">>(tallas: readonly T[], porTipo: ReadonlyMap<string, UmbralesQuieta>): T[] {
  return tallas.map((t) => {
    const u = t.categoria ? porTipo.get(t.categoria.trim()) : undefined;
    return u ? { ...t, umbrales: u } : t;
  });
}
