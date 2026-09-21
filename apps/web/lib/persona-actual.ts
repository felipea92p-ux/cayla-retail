import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";

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
  /** Producción (2026-09-15): `taller` deja de aplastarse a "tienda" — es el
   *  tipo que decide si la persona ve el módulo del Taller sin ser líder. */
  ubicacionTipo: "tienda" | "almacen" | "taller";
  /** Si puede usar el selector de ubicación del AppShell (Fase 2). Hoy es
   *  lo mismo que `rol === "lider"`, pero se guarda aparte para no atar el
   *  AppShell a esa igualdad — el día que "control total temporal"
   *  (0012_control_total_temporal.sql) se revierta, esto puede volver a
   *  distinguirse sin tocar el componente. */
  puedeCambiarUbicacion: boolean;
};

// Mismo nombre que en app/actions/ubicacion.ts — no se comparte como
// constante porque ese archivo es "use server" y solo puede exportar
// funciones (mismo patrón que ya usaba V1 con COOKIE_SEDE).
const COOKIE_UBICACION = "cayla_ubicacion_activa";

// `ubicaciones.tipo` tiene check ('tienda','almacen','taller'); cualquier otra
// cosa (null de una RPC vieja) se lee como tienda, el caso más restrictivo.
function tipoUbicacion(tipo: string | null | undefined): PersonaActualV2["ubicacionTipo"] {
  return tipo === "almacen" || tipo === "taller" ? tipo : "tienda";
}

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

  let ubicacionId = data.ubicacion_id;
  let ubicacionEtiqueta = data.ubicacion_nombre ?? "";
  let ubicacionTipo: PersonaActualV2["ubicacionTipo"] = tipoUbicacion(data.ubicacion_tipo);

  // Selector de ubicación (Fase 2, pendiente desde app/(app)/layout.tsx):
  // la cookie solo cambia la PERSPECTIVA de la app — el permiso real de
  // cada operación lo vuelve a validar el servidor en cada RPC
  // (fn_puede_operar_ubicacion), esto nunca es la única puerta. Mismo
  // mecanismo que V1 (lib/persona.ts, cookie cayla_sede_activa).
  if (data.es_lider) {
    const cookieStore = await cookies();
    const activa = cookieStore.get(COOKIE_UBICACION)?.value;
    if (activa && activa !== ubicacionId) {
      const { data: ubicacion } = await supabase
        .from("ubicaciones")
        .select("id, nombre, tipo")
        .eq("id", activa)
        .eq("activo", true)
        .maybeSingle();
      if (ubicacion) {
        ubicacionId = ubicacion.id;
        ubicacionEtiqueta = ubicacion.nombre;
        ubicacionTipo = tipoUbicacion(ubicacion.tipo);
      }
    }
  }

  return {
    nombre: data.nombre ?? "",
    rol: data.es_lider ? "lider" : "integrante",
    ubicacionId,
    ubicacionEtiqueta,
    ubicacionTipo,
    puedeCambiarUbicacion: !!data.es_lider,
  };
});

/** Pantallas de líder (Facturación, Códigos de descuento…): un integrante vuelve al inicio.
 *  Es la primera de las tres capas —pantalla, RPC, RLS— y cada `page.tsx` la repite: un
 *  layout no vuelve a ejecutarse al navegar entre sus hijas, así que no puede ser la única
 *  puerta. `requirePersonaActualV2` va con `cache`, así que layout y página comparten la
 *  misma lectura de la persona. */
export async function exigirLider(): Promise<PersonaActualV2> {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") redirect("/");
  return persona;
}
