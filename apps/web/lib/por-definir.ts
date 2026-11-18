import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaParaComprar } from "@/lib/compra-rapida-reglas";
import { RPC_COMPRAS_POR_DEFINIR, leerPorDefinir, type ModeloPorDefinir } from "@/lib/por-definir-reglas";

// «Por definir» (ADR-0660): lo que espera su categoría o su precio (`fn_compras_por_definir`) y, si hay algo, las categorías para elegir
// (con cuáles admiten S/ 0: las familias fuera de los motores, ADR-0377/0384). `null` si no se pudo leer (la web antes que la migración, o la
// base caída): la pantalla lo dice, nunca un «nada por definir» inventado (principio 9).

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type PorDefinirLeido = { modelos: ModeloPorDefinir[]; categorias: CategoriaParaComprar[] };

export async function getPorDefinir(): Promise<PorDefinirLeido | null> {
  const supabase = await createClient();
  const r = (await (supabase.rpc(RPC_COMPRAS_POR_DEFINIR as never) as unknown as Respuesta)) as Awaited<Respuesta>;
  if (r.error) {
    console.error(`por definir: ${r.error.message}`);
    return null;
  }
  const modelos = leerPorDefinir(r.data);
  if (modelos.length === 0) return { modelos, categorias: [] };
  const [c, f] = await Promise.all([
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("familias").select("codigo, entra_a_motores"),
  ]);
  if (c.error) {
    console.error(`por definir: categorías: ${c.error.message}`);
    return null;
  }
  // Una ayuda: si las familias no cargan, ninguna admite S/ 0 (lo mismo que la base sin dato) y la hoja sigue.
  if (f.error) console.error(`por definir: familias: ${f.error.message}`);
  const admitenCero = new Set((f.data ?? []).filter((x) => x.entra_a_motores === false).map((x) => x.codigo));
  return {
    modelos,
    categorias: (c.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, prefijo: x.prefijo ?? null, familia: x.familia ?? null, admitePrecioCero: x.familia != null && admitenCero.has(x.familia) })),
  };
}
