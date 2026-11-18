import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { leerProveedorRegistrado, type ProveedorRegistrado } from "@/lib/proveedor-de-orden-reglas";
import { leerMarcaRegistrada, RPC_MARCA_DE_RECEPCION, RPC_PROVEEDOR_DE_RECEPCION } from "@/lib/recepcion-altas-reglas";

// Crear el proveedor o la marca que no están, desde Recibir (ADR-0635). Firman con quien recibe («Quién cuenta»): la base no crea nada sin una persona.

/** El proveedor nuevo, o el que ya estaba (`yaExistia`): la misma forma que devuelve el alta de Mis compras. */
export async function registrarProveedorDeRecepcion(
  args: { p_nombre: string; p_ruc: string | null },
  firma: Firma | null,
): Promise<{ proveedor: ProveedorRegistrado | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_PROVEEDOR_DE_RECEPCION as never, args as never), firma);
  return { proveedor: error ? null : leerProveedorRegistrado(data), error: error ?? null };
}

/** La marca nueva unida a su proveedor, o la que ya existía con ese nombre (`nueva = false`), a la que se le suma el proveedor. */
export async function registrarMarcaDeRecepcion(
  args: { p_nombre: string; p_proveedor_id: string },
  firma: Firma | null,
): Promise<{ marca: { id: string; nombre: string; nueva: boolean } | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_MARCA_DE_RECEPCION as never, args as never), firma);
  return { marca: error ? null : leerMarcaRegistrada(data), error: error ?? null };
}
