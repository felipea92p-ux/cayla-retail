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

/**
 * Lo que se recuerda de la última lectura completa que salió bien: la huella de la sede en ese momento
 * (`fn_stock_huella`, un md5 de 32 letras) y qué prendas conocía la pantalla. `null` = no hay nada que comparar.
 */
export type UltimaHuella = { huella: string; conocidos: string } | null;

/** Las prendas que conoce la pantalla, en un texto que no depende del orden en que llegaron. */
export function claveDeConocidos(conocidos: readonly string[]): string {
  return [...conocidos].sort().join(",");
}

/**
 * ¿Hay que bajar otra vez todas las filas de la sede? (auditoría 2026-10-13, punto 20). Antes, el sondeo de cada
 * 10 s releía las 1.507 filas de TRU aunque nadie hubiera vendido nada. Ahora pregunta primero la huella y solo se
 * salta la relectura si es la MISMA de la última lectura completa Y la pantalla sigue conociendo las mismas prendas:
 * una prenda recién creada en el catálogo tiene que recibir su número aunque el stock no se haya movido. Sin huella
 * (la función todavía no existe en esa base, o falló) se relee siempre: más lento, nunca viejo.
 */
export function hayQueReleer(ultima: UltimaHuella, huella: string | null, conocidos: string): boolean {
  if (huella === null || ultima === null) return true;
  return ultima.huella !== huella || ultima.conocidos !== conocidos;
}

/**
 * Qué huella recordar después de una lectura completa. La huella se pide ANTES de bajar las filas; si algo cambió en medio y
 * después volvió exacto (apartar y liberar la misma prenda), la huella siguiente coincidiría con la recordada y la pantalla se
 * quedaría con el estado intermedio. Por eso se pide otra huella DESPUÉS de las filas y solo se recuerda si las dos coinciden: si
 * no, `null`, y la próxima vuelta relee. Sin huella (la función no existe o falló), tampoco se recuerda nada.
 */
export function huellaParaRecordar(antes: string | null, despues: string | null, conocidos: string): UltimaHuella {
  return antes !== null && antes === despues ? { huella: antes, conocidos } : null;
}
