import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { exigir } from "@/lib/resultado";
import { hoyLima } from "@/lib/fechas-lima";
import { horasDeCierreDeHoy } from "@/lib/recordatorio-cierre-reglas";

// Equivalente V2 de `sedes.ts`. No es una edición de ese archivo: `retail.sedes`
// (V1) era una vista puente sobre Dynamic con columnas que V2 no tiene
// (`codigo`, `tienda_asociada_id`) — mezclar los dos tipos en un solo archivo
// habría dejado un campo que a veces existe y a veces no. V2 además no
// necesita traducir nada: `ubicaciones.nombre` ya es legible ("Tienda Lima"),
// a diferencia del `codigo` de V1 que la unificación con Dynamic volvió
// ilegible (el Taller es `LIM` y la tienda de Lima, `003`).
export type Ubicacion = {
  id: string;
  nombre: string;
  tipo: "tienda" | "almacen" | "taller";
  activo: boolean;
  /** Meta de venta del día, en soles. Null = sin meta configurada (20260918080000). */
  metaVentaDiaria: number | null;
  /**
   * A qué hora cierra HOY («21:00», hora de Lima). Sale del horario por días de Tienda web ▸ Conf. Tienda y de sus cierres por fecha
   * (`fn_horas_de_cierre`, ADR-0642). Null = hoy no abre o no tiene horario: no se proyecta la venta del día ni se recuerda el cierre.
   */
  horaCierre: string | null;
  /** ¿La sede tiene horario cargado (por días en Tienda web ▸ Conf. Tienda, o la hora suelta de antes)? Sin él, «falta» el horario; con él y sin hora de hoy, hoy no abre. */
  horarioCargado: boolean;
};

/** Todas las ubicaciones activas, una vez por request (mismo patrón que getSedes()). */
export const getUbicaciones = cache(async (): Promise<Ubicacion[]> => {
  const supabase = await createClient();
  // El cierre de hoy se pregunta EN PARALELO. Si la función todavía no está en la base (o no responde), cae a la hora suelta de antes
  // (`ubicaciones.hora_cierre`): un horario que no se pudo leer no debe tumbar toda pantalla que lista sedes.
  const [lectura, cierres] = await Promise.all([
    supabase
      .from("ubicaciones")
      .select("id, nombre, tipo, activo, meta_venta_diaria, hora_cierre")
      .eq("activo", true)
      .order("nombre"),
    supabase.rpc("fn_horas_de_cierre" as never, { p_fecha: hoyLima() } as never).then(
      (r) => r,
      () => ({ data: null, error: true }),
    ),
  ]);
  const datos = exigir(lectura, "las ubicaciones");
  const horas = horasDeCierreDeHoy((cierres as { data: unknown; error: unknown }).error ? null : (cierres as { data: unknown }).data);
  return datos.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    tipo: u.tipo as Ubicacion["tipo"],
    activo: u.activo,
    metaVentaDiaria: u.meta_venta_diaria === null ? null : Number(u.meta_venta_diaria),
    horaCierre: horas ? (horas.get(u.id)?.hora ?? null) : u.hora_cierre ? String(u.hora_cierre).slice(0, 5) : null,
    horarioCargado: horas ? (horas.get(u.id)?.cargado ?? false) : !!u.hora_cierre,
  }));
});
