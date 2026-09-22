import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";
import { permisosDe, TIPOS_TERMINAL, type Permiso, type TipoTerminal } from "@/lib/menu";

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
  /** Si esta cuenta es una TERMINAL de su tienda (ADR-0160) y de qué tipo; `null` = una persona. Una terminal es un
   *  integrante fijo a una tienda que comparte quien trabaja ahí: `ventas` (caja, punto de venta, Facturación) o
   *  `administrativa` (inventario, catálogo y, con ADR-0151, Compras). */
  terminal: TipoTerminal | null;
  /** Lo que puede hacer además de operar su tienda, resuelto UNA vez desde el rol y la terminal (`permisosDe`).
   *  Las pantallas y los botones preguntan por un permiso (`puede`), no por «¿es líder?». */
  permisos: readonly Permiso[];
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

  // El tipo de terminal se pide EN PARALELO con el resumen: no suma una espera. Falla cerrado: si la RPC aún no existe
  // en esa base (la web se desplegó antes de pegar la migración 20260922200000) o responde algo raro, es una persona
  // común — pierde poder, nunca lo gana (principio 9).
  const [{ data, error }, { data: tipoTerminal, error: errorTerminal }] = await Promise.all([
    supabase.rpc("fn_persona_actual_resumen").maybeSingle(),
    supabase.rpc("fn_mi_terminal"),
  ]);

  if (error || !data || !data.ubicacion_id) {
    redirect("/login?error=sin_persona");
  }

  const terminal: TipoTerminal | null =
    !errorTerminal && (TIPOS_TERMINAL as readonly string[]).includes(tipoTerminal ?? "") ? (tipoTerminal as TipoTerminal) : null;
  const rol = data.es_lider ? "lider" : "integrante";

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
    rol,
    ubicacionId,
    ubicacionEtiqueta,
    ubicacionTipo,
    puedeCambiarUbicacion: !!data.es_lider,
    terminal,
    permisos: permisosDe(rol, terminal),
  };
});

/** ¿Esta cuenta tiene el permiso? Es lo que preguntan las pantallas y los botones en vez de «¿es líder?» (ADR-0160):
 *  así una terminal cierra caja o ajusta stock sin ser líder, y el líder sigue pasando por todo. */
export function puede(persona: Pick<PersonaActualV2, "permisos">, permiso: Permiso): boolean {
  return persona.permisos.includes(permiso);
}

/** La puerta de pantalla por permiso: quien no lo tiene vuelve al inicio. Igual que `exigirLider`, cada `page.tsx` la
 *  repite —un layout no vuelve a ejecutarse al navegar entre sus hijas— y el candado real sigue estando en la base. */
export async function exigirPermiso(permiso: Permiso): Promise<PersonaActualV2> {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, permiso)) redirect("/");
  return persona;
}

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
