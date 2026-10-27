import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerPreguntasEquipo, type DatosEquipo } from "@/lib/asistente/equipo";
import { leerInformes, type InformeLeido } from "@/lib/asistente/informe";

// «Preguntas del equipo» (ADR-0536, actividad 9): lo que lee el servidor. El candado real (el módulo, y qué sede ve cada cuenta) está
// en la base, `fn_asistente_preguntas_equipo`.

/** Las preguntas de un mes en una sede (`null` = todas, en CAYLA Global). `{ datos: null, falla }` si la base no respondió o todavía
 *  no tiene la función (web publicada antes de pegar 20261027182000): la pantalla lo dice, nunca muestra ceros que no son. */
export async function getPreguntasEquipo(desde: string, hasta: string, ubicacionId: string | null): Promise<{ datos: DatosEquipo | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_asistente_preguntas_equipo" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ubicacionId } as never);
  if (error) {
    console.error(`[preguntas-equipo] no se pudieron leer: ${error.code ?? "sin código"}`);
    return { datos: null, falla: "No se pudieron leer las preguntas del equipo. Vuelve a intentarlo en un momento." };
  }
  const datos = leerPreguntasEquipo(data);
  return datos ? { datos, falla: null } : { datos: null, falla: "La base respondió algo que esta pantalla no entiende." };
}

/** Los últimos informes del lunes (actividad 10), el más nuevo primero. `null` si la cuenta no los ve (el informe junta todas las sedes:
 *  es del líder o del Admin) o la base todavía no tiene la función: la tarjeta no se dibuja. */
export async function getInformesAsistente(): Promise<InformeLeido[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_asistente_informes" as never, { p_limite: 4 } as never);
  return error ? null : leerInformes(data);
}
