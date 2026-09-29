// Reglas puras de `useStockEnVivo.ts`, en su propio archivo — igual que el resto del repo — porque el hook
// importa `@/lib/supabase/client`, y esa cadena no se puede probar con Vitest hoy (ningún archivo que la
// importa, ni transitivamente, tiene un `.test.ts`; auditoría 2026-09-29). Lo puro se prueba acá, sin
// arrastrar esa cadena. `useStockEnVivo.ts` importa el tipo y la función de acá, nunca al revés.

/**
 * Tres números por prenda, de las MISMAS filas: lo cobrable (`cobrable`, el piso disponible), el almacén disponible de
 * esta sede (`almacen`, `null` sin almacén) y lo apartado en el piso (`apartado`). El almacén no se cobra, pero sin
 * releerlo la caja diría «está en el almacén» de algo que ya se trasladó, o «agotada» de lo que acaba de llegar al
 * almacén (D-40, D-42). Y sin releer lo apartado, una prenda que otra caja aparta después de cargar la pantalla diría
 * «agotada» y no «apartada para una clienta».
 */
export type StockReleido = { cobrable: Map<string, number>; almacen: Map<string, number | null>; apartado: Map<string, number> };

/**
 * ¿Dos lecturas dicen lo mismo? Compara las tres mapas de un `StockReleido` valor por valor —
 * `useStockEnVivo` la usa para no avisar (y no disparar un repintado de la grilla entera) cuando el sondeo
 * de cada 10 s vuelve a traer exactamente lo que ya se tenía, que es el caso más común: nadie más vendió,
 * apartó ni repuso nada en esos 10 s (hallazgo de rendimiento del Punto de Venta, 2026-09-29).
 */
function mismoMapa<V>(a: Map<string, V>, b: Map<string, V>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (!b.has(k) || b.get(k) !== v) return false;
  return true;
}

export function mismoStock(a: StockReleido, b: StockReleido): boolean {
  return mismoMapa(a.cobrable, b.cobrable) && mismoMapa(a.almacen, b.almacen) && mismoMapa(a.apartado, b.apartado);
}
