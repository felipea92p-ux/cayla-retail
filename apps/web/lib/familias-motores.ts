// Familias que quedan FUERA de los motores (Bolsas de despacho, 2026-10-10): la familia «Empaque» no es mercadería de piso, así que ninguna
// pantalla que decide qué colgar, pedir o comprar la cuenta. La base ya lo respeta en sus lecturas (`retail.fn_categoria_entra_a_motores`,
// migraciones 20261010231000 a 20261010233000); este archivo es lo mismo para las dos lecturas que Frescura hace DIRECTO de la cola de ventas
// sin registrar (`lib/frescura.ts`), que no pasan por una función SQL.
//
// CONTRATO
//   PROMETE: dar el conjunto de categorías cuya familia está apagada, y quitar de una lista las filas de esas categorías.
//   ASUME:   lo que no se sabe sigue contando, igual que la base: una categoría sin familia, una fila sin categoría o una lectura que falla
//            NO sacan nada (ante la duda, la pantalla cuenta como antes; nunca esconde una prenda de verdad).
//   NO HACE: no decide qué es una bolsa; solo lee la marca `familias.entra_a_motores` que un líder pone en Catálogo ▸ Familias.
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lo que devuelve la lectura: cada categoría con su familia (PostgREST la trae como objeto, o como lista de uno según la relación). */
export type CategoriaConFamilia = {
  id: string;
  familias: { entra_a_motores: boolean } | { entra_a_motores: boolean }[] | null;
};

/** Los ids de las categorías cuya familia está apagada. Una sin familia, o con la marca encendida, no entra. */
export function categoriasApagadas(filas: readonly CategoriaConFamilia[]): Set<string> {
  const fuera = new Set<string>();
  for (const f of filas) {
    const familia = Array.isArray(f.familias) ? f.familias[0] : f.familias;
    if (familia && familia.entra_a_motores === false) fuera.add(f.id);
  }
  return fuera;
}

/** Quita de una lista las filas cuya categoría está apagada. Una fila sin categoría se queda (no se sabe: sigue contando). */
export function sinCategoriasApagadas<T>(filas: readonly T[], fuera: ReadonlySet<string>, categoriaDe: (fila: T) => string | null | undefined): T[] {
  if (fuera.size === 0) return [...filas];
  return filas.filter((f) => {
    const categoria = categoriaDe(f);
    return !categoria || !fuera.has(categoria);
  });
}

/**
 * Las categorías de las familias apagadas, leídas de la base (son pocas: «Bolsas», «Cajas»…). Nunca lanza: si la lectura falla devuelve
 * vacío y la pantalla cuenta como antes. Cada llamada es una consulta chica; el motor no la guarda en memoria porque un líder puede
 * apagar o encender una familia en cualquier momento.
 */
export async function categoriasFueraDeMotores(supabase: Supabase): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from("categorias").select("id, familias!inner(entra_a_motores)").eq("familias.entra_a_motores", false);
    if (error || !data) return new Set();
    return categoriasApagadas(data as unknown as CategoriaConFamilia[]);
  } catch {
    return new Set();
  }
}
