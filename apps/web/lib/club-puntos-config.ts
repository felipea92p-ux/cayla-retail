import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerResumenDeBeneficios, type ResumenDeBeneficios } from "@/lib/club-puntos-config-reglas";

// La lectura de Clientes ▸ Beneficios del club del lado del servidor (programa de puntos, actividad 8). El navegador escribe con
// `club-puntos-acciones.ts`. Si la base todavía no tiene la migración 20261019215000, la lectura devuelve `falla` en vez de tumbar la
// pantalla (principio 9): la pantalla lo dice y no abre un formulario con valores inventados.

export type LecturaDeBeneficios = { resumen: ResumenDeBeneficios | null; falla: string | null };

/** La configuración vigente, la programada, las cifras del programa y los últimos cambios (`resumen_beneficios_puntos`, módulo «beneficios_club»). */
export async function getResumenDeBeneficios(): Promise<LecturaDeBeneficios> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resumen_beneficios_puntos");
  if (error) return { resumen: null, falla: `No se pudieron leer los beneficios del club: ${error.message}` };
  const resumen = leerResumenDeBeneficios(data);
  return resumen ? { resumen, falla: null } : { resumen: null, falla: "La base todavía no da los beneficios completos del club." };
}
