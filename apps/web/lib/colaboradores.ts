import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { TIPOS_TERMINAL, type TipoTerminal } from "@/lib/menu";

// Lectura pura (principio del repo: lib/ nunca escribe). Las escrituras pasan por las RPC
// directo desde el componente cliente (`lib/colaboradores-acciones.ts`).
// Cada persona aparece en UNA sola lista: activos, suspendidos o inactivos en Dynamic
// (20260922110000_colaboradores_suspender_y_actividad.sql).
export type RolColaborador = "lider" | "colaborador";

export type Colaborador = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
  rol: RolColaborador;
  ubicacion_asignada: string | null;
  agregado_en: string;
  ubicacion_id: string | null;
  /** La persona que está mirando la pantalla: a ella no se le ofrece suspenderse ni quitarse. */
  es_yo: boolean;
  ultimo_acceso: string | null;
  /** Si es una cuenta TERMINAL de su tienda (ADR-0160) y de qué tipo; `null` o ausente = una persona. */
  terminal?: TipoTerminal | null;
};

export type ColaboradorSuspendido = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
  rol: RolColaborador;
  ubicacion_asignada: string | null;
  suspendido_en: string;
  suspendido_por_nombre: string | null;
  motivo: string | null;
};

export type ColaboradorInactivo = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
  estado_dynamic: string;
  rol: RolColaborador;
  /** Tenía el acceso suspendido cuando Dynamic la dio de baja. */
  suspendida: boolean;
};

export type ColaboradorPendiente = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
  ubicacion_asignada: string | null;
  /** Quién propuso el alta (D-70: no es la misma persona que la aprueba necesariamente). */
  propuesto_por: string | null;
  propuesto_en: string;
};

export type AccionAcceso = "alta" | "baja" | "suspension" | "reactivacion" | "ubicacion" | "aprobacion";

export type EventoAcceso = {
  id: number;
  accion: AccionAcceso;
  persona_nombre: string | null;
  /** Nulo = alta inicial sembrada al crear el historial (nadie la hizo desde esta pantalla). */
  por_nombre: string | null;
  rol: RolColaborador | null;
  ubicacion_anterior: string | null;
  ubicacion_nueva: string | null;
  motivo: string | null;
  created_at: string;
  /** Total de eventos en el historial, aunque aquí solo vengan los más recientes. */
  total: number;
};

export type DynamicDisponible = {
  persona_id: string;
  nombre: string;
  correo: string;
  sede: string | null;
};

export async function getColaboradores(): Promise<Colaborador[]> {
  const supabase = await createClient();
  const [res, resTerminales] = await Promise.all([
    supabase.rpc("fn_colaboradores"),
    // El tipo de terminal (ADR-0160) se lee APARTE: `fn_colaboradores()` no lo devuelve y agregárselo exigiría borrarla y
    // recrearla (cambiar el tipo de retorno no admite `create or replace`). Solo el líder lee `colaboradores` (RLS) y esta
    // pantalla es de líder. Si la columna aún no existe en esa base (la web se desplegó antes que la migración) el error
    // se ignora: nadie sale como terminal, que es el lado seguro.
    supabase.from("colaboradores").select("persona_id, terminal").not("terminal", "is", null),
  ]);
  const lista = exigir(res, "los colaboradores") as unknown as Colaborador[];
  const terminales = new Map<string, TipoTerminal>();
  for (const f of resTerminales.error ? [] : (resTerminales.data ?? [])) {
    if ((TIPOS_TERMINAL as readonly string[]).includes(f.terminal ?? "")) terminales.set(f.persona_id, f.terminal as TipoTerminal);
  }
  return lista.map((c) => ({ ...c, terminal: terminales.get(c.persona_id) ?? null }));
}

export async function getColaboradoresPendientes(): Promise<ColaboradorPendiente[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_colaboradores_pendientes");
  return exigir(res, "las altas pendientes de aprobación") as unknown as ColaboradorPendiente[];
}

export async function getColaboradoresSuspendidos(): Promise<ColaboradorSuspendido[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_colaboradores_suspendidos");
  return exigir(res, "los colaboradores suspendidos") as unknown as ColaboradorSuspendido[];
}

export async function getColaboradoresInactivos(): Promise<ColaboradorInactivo[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_colaboradores_inactivos");
  return exigir(res, "las cuentas inactivas en Dynamic") as unknown as ColaboradorInactivo[];
}

export async function getActividadAccesos(limite = 100): Promise<EventoAcceso[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_colaboradores_actividad", { p_limite: limite });
  return exigir(res, "el historial de accesos") as unknown as EventoAcceso[];
}

export async function getDynamicDisponibles(): Promise<DynamicDisponible[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_dynamic_disponibles");
  return exigir(res, "las cuentas de Dynamic disponibles") as unknown as DynamicDisponible[];
}
