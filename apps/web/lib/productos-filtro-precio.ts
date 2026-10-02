// El filtro de precio de /productos, sin React. Nació porque el control iba de S/ 0 a S/ 999 escrito a mano, cuando la
// prenda más cara del catálogo costaba S/ 119 (producción, 2026-10-02): el 88 % del recorrido no filtraba nada y la
// pantalla mostraba «S/0–999», un precio que no existe. Ahora los límites salen de los precios reales de lo que se está
// viendo (sin contar el propio filtro de precio, si no el rango se encogería solo al moverlo) y se escriben en cajas
// «Desde / Hasta» (Felipe, 2026-10-02). Análisis: docs/pantallas/productos-filtros.md #3.

export type LimitesPrecio = { min: number; max: number };

/** Redondea hacia afuera a múltiplos de 10 (S/ 22 → 20, S/ 119 → 120): números que se leen de un vistazo y que no dejan
 *  fuera a la prenda más barata ni a la más cara. Un solo precio (o ninguno) no hace un rango: se abre 10 hacia arriba. */
export function limitesRedondeados(precios: { min: number | null; max: number | null } | null): LimitesPrecio | null {
  if (!precios || precios.min == null || precios.max == null || !Number.isFinite(precios.min) || !Number.isFinite(precios.max)) return null;
  const lo = Math.max(0, Math.floor(Math.min(precios.min, precios.max) / 10) * 10);
  const hi = Math.ceil(Math.max(precios.min, precios.max) / 10) * 10;
  return { min: lo, max: hi > lo ? hi : lo + 10 };
}

/** Cuánto avanza el control por paso. De a S/ 5 en un rango corto (el de hoy: S/ 20–120 son 20 pasos), más largo si el
 *  rango crece, para que nunca haya cientos de paradas en 130 px (antes: 200 paradas, ~S/ 10 por píxel). */
export function pasoDePrecio(limites: LimitesPrecio): number {
  const rango = limites.max - limites.min;
  if (rango <= 300) return 5;
  if (rango <= 1500) return 10;
  return 50;
}

/** «S/ 40» o «S/ 39.90»: el rango es de números redondos, pero quien escribe puede pedir céntimos. */
export function solesFiltro(n: number): string {
  return Number.isInteger(n) ? `S/ ${n}` : `S/ ${n.toFixed(2)}`;
}

/** Lo que dice el filtro aplicado (chip y control). Nunca un tope inventado: sin desde ni hasta no hay texto. */
export function textoRangoPrecio(min: string | null | undefined, max: string | null | undefined): string | null {
  const a = leerMonto(min ?? "");
  const b = leerMonto(max ?? "");
  if (a != null && b != null) return `${solesFiltro(a)} – ${solesFiltro(b)}`;
  if (a != null) return `Desde ${solesFiltro(a)}`;
  if (b != null) return `Hasta ${solesFiltro(b)}`;
  return null;
}

/** Lo escrito en una caja, como número: acepta «39,90» y «39.90» (en el mostrador se escribe de las dos formas) y
 *  descarta todo lo demás. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}

/** Lo que va a la URL desde una caja: el número normalizado («39,90» → «39.90»), o vacío si no es un monto. La URL solo
 *  acepta `\d+(\.\d+)?` (`filtrosProductosDesdeParams`): con la coma, el filtro se ignoraba en silencio. */
export function montoParaUrl(texto: string): string {
  const n = leerMonto(texto);
  return n == null ? "" : String(n);
}

/** Lo que muestra una caja que no se está escribiendo: el monto de la URL con sus céntimos («79.9» → «79.90»). */
export function montoParaCaja(enUrl: string): string {
  const n = leerMonto(enUrl);
  if (n == null) return enUrl;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** El control de arrastre en cada punta manda «sin tope» (vacío), no el número de la punta: así una prenda nueva más cara
 *  que el máximo de hoy no queda fuera por un tope que nadie pidió. */
export function rangoDesdeControl(lo: number, hi: number, limites: LimitesPrecio): { precioMin: string; precioMax: string } {
  return { precioMin: lo > limites.min ? String(lo) : "", precioMax: hi < limites.max ? String(hi) : "" };
}

/** Dónde se dibujan los dos tiradores: el filtro de la URL, recortado a los límites (un enlace viejo con S/ 999 no saca el
 *  tirador de la barra). */
export function posicionEnControl(min: string, max: string, limites: LimitesPrecio): [number, number] {
  const recortar = (n: number) => Math.min(limites.max, Math.max(limites.min, n));
  const a = leerMonto(min);
  const b = leerMonto(max);
  return [a == null ? limites.min : recortar(a), b == null ? limites.max : recortar(b)];
}
