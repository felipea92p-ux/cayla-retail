import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Lectura pura (principio del repo: lib/ nunca escribe). Alta, edición y archivo
// pasan por las RPC directo desde el componente cliente (registrar_proveedor /
// actualizar_proveedor / archivar_proveedor,
// 20260914150000_proveedores_administrables.sql).
export type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  activo: boolean;
  /** Facturas vigentes (las anuladas no cuentan). */
  facturas: number;
  /** Lo que se le debe hoy, sumando el saldo de sus facturas vigentes. */
  saldo: number;
  ultima_compra: string | null;
};

export async function getProveedores(): Promise<Proveedor[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_proveedores");
  // `saldo` llega como texto (numeric de Postgres viaja como string por JSON) y
  // `facturas` como número: se normaliza acá para que la pantalla no tenga que saberlo.
  return (exigir(res, "el directorio de proveedores") as unknown as Array<Omit<Proveedor, "saldo"> & { saldo: string | number }>).map(
    (p) => ({ ...p, saldo: Number(p.saldo) })
  );
}
