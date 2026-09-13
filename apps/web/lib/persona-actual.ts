import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

// Integración con Dynamic (2026-09-12): retail ya no tiene su propia
// tabla `personas` — Dynamic es dueño de esa identidad (rol, estado,
// sede) y retail solo la interpreta, vía `fn_persona_actual_resumen()`
// (supabase/migrations/0009_integracion_dynamic.sql). Una sola RPC en
// vez de una consulta cruzada de schema: retail no necesita ver las 37
// columnas de RRHH/planilla de `public.personas`, solo nombre/rol/sede.
export type PersonaActualV2 = {
  nombre: string;
  rol: "lider" | "integrante";
  ubicacionId: string;
  ubicacionEtiqueta: string;
  ubicacionTipo: "tienda" | "almacen";
};

/** Trae la persona actual, resuelta contra Dynamic. Sin persona activa ahí
 *  (o sin ubicación de retail enlazada a su sede), no puede usar la app
 *  todavía — se manda a /login con el mismo mensaje de siempre. */
export const requirePersonaActualV2 = cache(async (): Promise<PersonaActualV2> => {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { data, error } = await supabase.rpc("fn_persona_actual_resumen").maybeSingle();

  if (error || !data || !data.ubicacion_id) {
    redirect("/login?error=sin_persona");
  }

  return {
    nombre: data.nombre ?? "",
    rol: data.es_lider ? "lider" : "integrante",
    ubicacionId: data.ubicacion_id,
    ubicacionEtiqueta: data.ubicacion_nombre ?? "",
    ubicacionTipo: data.ubicacion_tipo === "almacen" ? "almacen" : "tienda",
  };
});
