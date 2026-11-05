// De quién son las unidades de una prenda en una sede con dos empresas (ADR-0542). Lógica pura, sin React ni Supabase; la lectura vive
// en `lib/stock-por-dueno.ts`.
//
// EL PROBLEMA. En Tienda LIM conviven CAYLA y CLAURE, y una misma prenda puede tener unidades de las dos (Felipe, 2026-10-27: «lo indica
// la persona que hace la operación»). Existencias decía «hay 5» sin decir de quién: la colaboradora no sabía de cuál vender ni de cuál
// tocar al ajustar.
//
// LA REGLA. Se dice de quién es SOLO cuando hay unidades de alguien que no es la casa: marcar «CAYLA 3» en 450 prendas sería ruido
// (la misma razón por la que la insignia «CLAURE» sale y la de CAYLA nunca, ADR-0505). Una prenda toda de CAYLA no dice nada. Donde
// la base no responde, o la sede tiene una sola empresa, no hay nada que decir: la pantalla se degrada, nunca inventa un reparto.

/** Una fila de `fn_stock_por_dueno`: cuántas unidades (y cuántas apartadas) de una prenda tiene una empresa en la sede. */
export type RepartoDeStock = { varianteId: string; empresaId: string; clave: string; cantidad: number; cantidadApartada: number };

/** Lo que una prenda lleva en Existencias: las unidades de una empresa, con el nombre que se escribe en pantalla. */
export type DuenoDeStock = { empresaId: string; clave: string; nombre: string; cantidad: number; cantidadApartada: number };

/** La clave de la empresa de la casa: va primero y lleva el contorno de tinta (ADR-0532: CAYLA en tinta, CLAURE en pizarra). */
export const CLAVE_CASA = "cayla";

/** Agrupa el reparto por prenda (variante), con el nombre de cada empresa y la casa primero. Solo cuentan las filas con unidades. */
export function agruparPorDueno(
  filas: readonly RepartoDeStock[],
  nombres: ReadonlyMap<string, string>,
): Map<string, DuenoDeStock[]> {
  const porVariante = new Map<string, DuenoDeStock[]>();
  for (const f of filas) {
    if (f.cantidad <= 0 && f.cantidadApartada <= 0) continue;
    const lista = porVariante.get(f.varianteId) ?? [];
    lista.push({ empresaId: f.empresaId, clave: f.clave, nombre: nombres.get(f.empresaId) ?? f.clave.toUpperCase(), cantidad: f.cantidad, cantidadApartada: f.cantidadApartada });
    porVariante.set(f.varianteId, lista);
  }
  for (const lista of porVariante.values()) {
    lista.sort((a, b) => (a.clave === CLAVE_CASA ? 0 : 1) - (b.clave === CLAVE_CASA ? 0 : 1) || a.nombre.localeCompare(b.nombre, "es"));
  }
  return porVariante;
}

/** Le pone `duenos` a cada fila que tiene reparto (la página lo hace como con la marca). Sin reparto, las filas quedan tal cual. */
export function conDuenos<T extends { varianteId: string }>(
  filas: readonly T[],
  reparto: ReadonlyMap<string, DuenoDeStock[]> | null,
): (T & { duenos?: DuenoDeStock[] })[] {
  if (!reparto || reparto.size === 0) return [...filas];
  return filas.map((f) => {
    const duenos = reparto.get(f.varianteId);
    return duenos ? { ...f, duenos } : { ...f };
  });
}

/** Lo que dice la línea «De quién es» de una talla, o `null` si no hay nada que decir (nadie que no sea la casa tiene unidades). */
export function lineaDeDuenos(duenos: readonly DuenoDeStock[] | undefined): DuenoDeStock[] | null {
  if (!duenos || duenos.length === 0) return null;
  const hayOtroDueno = duenos.some((d) => d.clave !== CLAVE_CASA && d.cantidad > 0);
  if (!hayOtroDueno) return null;
  return duenos.filter((d) => d.cantidad > 0);
}

/** El texto de una empresa en la línea: «CLAURE 2». Para el lector de pantalla y para el `title` de la insignia. */
export function textoDeDueno(d: Pick<DuenoDeStock, "nombre" | "cantidad">): string {
  return `${d.nombre} ${d.cantidad}`;
}
