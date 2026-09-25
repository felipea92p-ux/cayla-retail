import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { exigir } from "@/lib/resultado";

// Equivalente V2 de `sedes.ts`. No es una edición de ese archivo: `retail.sedes`
// (V1) era una vista puente sobre Dynamic con columnas que V2 no tiene
// (`codigo`, `tienda_asociada_id`) — mezclar los dos tipos en un solo archivo
// habría dejado un campo que a veces existe y a veces no. V2 además no
// necesita traducir nada: `ubicaciones.nombre` ya es legible ("Tienda Lima"),
// a diferencia del `codigo` de V1 que la unificación con Dynamic volvió
// ilegible (ver `etiqueta-sede.ts`).
export type Ubicacion = {
  id: string;
  nombre: string;
  tipo: "tienda" | "almacen" | "taller";
  activo: boolean;
  /** Meta de venta del día, en soles. Null = sin meta configurada (20260918080000). */
  metaVentaDiaria: number | null;
  /** A qué hora cierra («21:00», hora de Lima). Null = no se proyecta la venta del día (20260925101000). */
  horaCierre: string | null;
};

/** Todas las ubicaciones activas, una vez por request (mismo patrón que getSedes()). */
export const getUbicaciones = cache(async (): Promise<Ubicacion[]> => {
  const supabase = await createClient();
  const datos = exigir(
    await supabase
      .from("ubicaciones")
      .select("id, nombre, tipo, activo, meta_venta_diaria, hora_cierre")
      .eq("activo", true)
      .order("nombre"),
    "las ubicaciones"
  );
  return datos.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    tipo: u.tipo as Ubicacion["tipo"],
    activo: u.activo,
    metaVentaDiaria: u.meta_venta_diaria === null ? null : Number(u.meta_venta_diaria),
    horaCierre: u.hora_cierre ? String(u.hora_cierre).slice(0, 5) : null,
  }));
});
