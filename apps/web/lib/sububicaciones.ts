import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { exigir } from "@/lib/resultado";

// Equivalente V2 de `ubicaciones.ts`, un nivel más abajo. `tipo` es texto
// libre a propósito (retail.sububicaciones no tiene CHECK): 'piso_venta',
// 'almacen_tienda' y 'cuarentena' son los tres únicos valores que el motor
// de inventario entiende (20260914230000_inventario_piso_almacen.sql,
// 20260917100000_cuarentena_prendas_danadas.sql), pero una ubicación como
// Taller puede seguir usando lo que quiera ("rack", sin tipo, etc.) sin que
// este archivo tenga que saber de esos nombres.
export type Sububicacion = {
  id: string;
  nombre: string;
  tipo: string | null;
};

export const getSububicaciones = cache(async (ubicacionId: string): Promise<Sububicacion[]> => {
  const supabase = await createClient();
  const datos = exigir(
    await supabase.from("sububicaciones").select("id, nombre, tipo").eq("ubicacion_id", ubicacionId).order("nombre"),
    "las sububicaciones de esta ubicación"
  );
  return datos as Sububicacion[];
});

/** La sububicación de piso/almacén/cuarentena de una ubicación, si las usa — null si no. */
export function encontrarPorTipo(sububicaciones: Sububicacion[], tipo: "piso_venta" | "almacen_tienda" | "cuarentena"): Sububicacion | null {
  return sububicaciones.find((s) => s.tipo === tipo) ?? null;
}
