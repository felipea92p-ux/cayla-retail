import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_MARCAS_DE_COMPRAS, idsParaMarcas, leerMarcasDeCompras } from "@/lib/marcas-de-compras-reglas";

// La marca primero (ADR-0644): las marcas de una página de compras (comprobantes) o de papeles de «Mis compras». Es un adorno de la fila: si la
// función todavía no está en la base o falla, se avisa en el registro y la lista se ve como antes (principio 9), nunca se cae la pantalla.
export async function getMarcasDeCompras(ids: { compras?: readonly string[]; papeles?: readonly string[] }): Promise<Map<string, string[]>> {
  const compras = idsParaMarcas(ids.compras ?? []);
  const papeles = idsParaMarcas(ids.papeles ?? []);
  if (compras.length === 0 && papeles.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc(RPC_MARCAS_DE_COMPRAS as never, { p_compras: compras, p_papeles: papeles } as never) as unknown as PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>);
  if (error) {
    console.error(`marcas de compras: ${error.message}`);
    return new Map();
  }
  return leerMarcasDeCompras(data);
}
