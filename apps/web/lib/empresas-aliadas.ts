import { createClient } from "@/lib/supabase/server";
import { leerAliadas, type LecturaAliadas } from "@/lib/empresas-aliadas-reglas";

/**
 * Las empresas aliadas para Configuración ▸ Empresa y tiendas (ADR-0683), con sus tiendas y sus cuentas vigentes.
 * `null` si la base no responde o todavía no tiene `fn_empresas_aliadas` (la web se publica antes que la migración): la sección no se dibuja y lo
 * demás de la pantalla sigue igual.
 */
export async function getEmpresasAliadas(): Promise<LecturaAliadas | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_empresas_aliadas" as never);
  if (error) {
    console.error(`Configuración: no se pudieron leer las empresas aliadas (${error.code ?? "sin código"})`);
    return null;
  }
  return leerAliadas(data);
}
