import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerCargaInicial, type LecturaCargaInicial } from "@/lib/carga-inicial-reglas";

// La fecha de cierre de la carga inicial de cada sede (ADR-0328, actividad 4), leída en el servidor para Configuración y
// Nuevo producto. Sale de `fn_carga_inicial_sedes()` (20261004210100): cada sede activa con su fecha y si está abierta, y
// el «hoy» de la base.
//
// SI FALLA (la web salió antes que el SQL, o la base no responde): devuelve `null` y la pantalla sigue SIN avisos ni
// controles de cierre. No se pierde nada: el candado vive en la base, y con el SQL pegado la puerta cerrada lo dice con su
// propia frase al guardar.
export async function getCargaInicial(): Promise<LecturaCargaInicial | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_carga_inicial_sedes");
  if (error) return null;
  return leerCargaInicial(data);
}
