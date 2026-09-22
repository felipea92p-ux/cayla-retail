import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Permiso } from "@/lib/menu";
import {
  leerModulos,
  modulosDeHoy,
  permisosDeModulos,
  TIPOS_TERMINAL_LEGADO,
  type ClaveModulo,
  type ModuloDeCuenta,
  type TipoTerminalLegado,
} from "@/lib/modulos";

// Integración con Dynamic (2026-09-12): retail ya no tiene su propia
// tabla `personas` — Dynamic es dueño de esa identidad (rol, estado,
// sede) y retail solo la interpreta, vía `fn_persona_actual_resumen()`
// (supabase/migrations/0009_integracion_dynamic.sql). Una sola RPC en
// vez de una consulta cruzada de schema: retail no necesita ver las 37
// columnas de RRHH/planilla de `public.personas`, solo nombre/rol/sede.
export type PersonaActualV2 = {
  /** El nombre de la persona o, si la sesión es de una terminal (ADR-0162), el del APARATO («Terminal Ventas TRU»). */
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
  /** ¿Esta sesión es la de una TERMINAL (un aparato)? ES EL DATO que dice «esto es un aparato, no alguien»: desde el
   *  ADR-0162 una terminal es una cuenta de Auth SIN persona (`retail.terminales`), fija a una tienda y nunca líder. Con
   *  él, el pie del menú muestra el aparato y no una persona, «Mi perfil» no se ofrece (no hay perfil de RRHH que mostrar)
   *  y, si su rol ve el Punto de venta, aterriza en `/vender`. Ya NO tiene tipo (20260923040000): lo que ve y hace lo
   *  decide su ROL (`modulos`), igual que a una persona. Lo que hace lo FIRMA el responsable elegido (ADR-0161). */
  terminal: boolean;
  /** Lo que puede hacer además de operar su tienda, resuelto UNA vez desde sus módulos (`permisosDeModulos`).
   *  Las pantallas y los botones preguntan por un permiso (`puede`), no por «¿es líder?». */
  permisos: readonly Permiso[];
  /** Los módulos que ve esta cuenta según su ROL (ADR-0161 B2, `fn_mis_modulos()`): de acá salen el menú, `permisos` y
   *  la puerta `exigirModulo`. Si la base aún no tiene la función, son los de hoy (`modulosDeHoy`): nada cambia. */
  modulos: readonly ModuloDeCuenta[];
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
 *  todavía — se manda a /login con el mismo mensaje de siempre.
 *
 *  Una TERMINAL (ADR-0162) no tiene persona, pero `fn_persona_actual_resumen()` le devuelve igual su fila (nombre del
 *  aparato, nunca líder, su tienda) y `fn_mi_terminal()` su nombre (antes, su tipo): por eso entra por el mismo camino.
 *  Solo cuando NO hay fila se mira si es una terminal desactivada, para decírselo con su propio mensaje. */
export const requirePersonaActualV2 = cache(async (): Promise<PersonaActualV2> => {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  // «¿Es un aparato?» se pide EN PARALELO con el resumen: no suma una espera. `fn_mi_terminal()` devuelve el nombre del
  // aparato (una base vieja, su tipo); vacío o error = una persona. Falla cerrado (principio 9).
  // Los módulos del rol también van en paralelo (ADR-0161). Si la función aún no existe (web publicada antes de pegar
  // 20260923030000), la cuenta ve lo de hoy: ni más ni menos (principio 9).
  const [{ data, error }, { data: miTerminal, error: errorTerminal }, { data: filasModulos, error: errorModulos }] = await Promise.all([
    supabase.rpc("fn_persona_actual_resumen").maybeSingle(),
    supabase.rpc("fn_mi_terminal"),
    supabase.rpc("fn_mis_modulos"),
  ]);

  if (error || !data || !data.ubicacion_id) {
    redirect(`/login?error=${await motivoSinAcceso(supabase, claims.claims.sub)}`);
  }

  const textoTerminal = !errorTerminal && typeof miTerminal === "string" ? miTerminal.trim() : "";
  const terminal = textoTerminal !== "";
  const rol = data.es_lider ? "lider" : "integrante";
  const deLaBase = !errorModulos && Array.isArray(filasModulos);
  // Sin `fn_mis_modulos()` (base anterior a los roles): una terminal ve lo de su tipo viejo, si la base aún lo devuelve.
  const legado = (TIPOS_TERMINAL_LEGADO as readonly string[]).includes(textoTerminal) ? (textoTerminal as TipoTerminalLegado) : null;
  const modulos = deLaBase ? leerModulos(filasModulos) : modulosDeHoy(rol, terminal ? { legado } : null);

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
    permisos: permisosDeModulos(rol, modulos),
    modulos,
  };
});

/** Por qué una cuenta sin fila en `fn_persona_actual_resumen()` no entra. Una terminal desactivada (ADR-0162) se ve a sí
 *  misma en `retail.terminales` (RLS: `auth_user_id = auth.uid()`, activa o no) y merece un aviso que diga qué pasó —«pide
 *  a un líder que te dé de alta» no le sirve a un aparato—. Solo corre en el camino del rechazo: no suma nada a la carga
 *  normal. Si la tabla aún no existe o la lectura falla, cae al mensaje de siempre (falla cerrado: igual no entra). */
async function motivoSinAcceso(supabase: Awaited<ReturnType<typeof createClient>>, authUserId: string): Promise<"sin_persona" | "terminal_desactivada"> {
  const { data, error } = await supabase.from("terminales").select("activo").eq("auth_user_id", authUserId).maybeSingle();
  return !error && data && !data.activo ? "terminal_desactivada" : "sin_persona";
}

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

/** ¿Esta cuenta ve el módulo? (su rol lo incluye; el líder ve todos). Visibilidad: el candado real sigue en la base. */
export function veModulo(persona: Pick<PersonaActualV2, "modulos">, clave: ClaveModulo): boolean {
  return persona.modulos.some((m) => m.clave === clave);
}

/** La puerta de pantalla por MÓDULO (ADR-0161 B2): quien llega por URL directa a un módulo que su rol no ve, cae en
 *  «Sin acceso» en vez de ver una pantalla que después falla al guardar. No reemplaza a `exigirPermiso` (que sigue
 *  valiendo para lo que exige un poder, como Facturación): se suman. Va en el `layout.tsx` del módulo o en su página. */
export async function exigirModulo(clave: ClaveModulo): Promise<PersonaActualV2> {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, clave)) redirect(`/sin-acceso?modulo=${clave}`);
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
