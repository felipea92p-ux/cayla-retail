import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar, type Tolerado } from "@/lib/resultado";

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
};

/** Un aparato compartido de una tienda (ADR-0162, `retail.terminales`): cuenta de Auth propia, SIN persona. Ya no es
 *  una fila de `fn_colaboradores()` — la terminal-persona del ADR-0160 se retiró (`colaboradores.terminal` siempre null).
 *  Sin tipo desde 20260923040000: se distingue por tienda + nombre, y lo que ve lo decide su ROL. */
export type Terminal = {
  id: string;
  nombre: string;
  /** El rol de la cuenta (ADR-0161 B): los módulos que ve. */
  rol_id: string;
  rol_nombre: string;
  /** El correo de su cuenta de Auth (generado, sin datos de nadie): el que se escribe en el aparato para entrar. */
  correo: string | null;
  ubicacion_id: string;
  ubicacion_nombre: string;
  activo: boolean;
  creada_at: string;
  desactivada_at: string | null;
  /** Último inicio de sesión de la cuenta del aparato (`auth.users.last_sign_in_at`); `null` = nunca entró. */
  ultimo_acceso: string | null;
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
  const res = await supabase.rpc("fn_colaboradores");
  return exigir(res, "los colaboradores") as unknown as Colaborador[];
}

/** Las terminales de todas las tiendas (`fn_terminales()`, solo líder). Se TOLERA el fallo: es un listado de apoyo en
 *  una pestaña, no plata ni stock — si la base todavía no tiene la migración (la web se publicó antes), el resto de
 *  Colaboradores sigue funcionando y la pestaña dice que no pudo leerlas. Una base sin 20260923040000 no devuelve el rol:
 *  se trata como «no se pudieron leer» en vez de pintar filas a medias. */
export async function getTerminales(): Promise<Tolerado<Terminal[]>> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc("fn_terminales"), "las terminales");
  if (!datos) return { datos: null, fallo };
  if (datos.some((t) => !t.rol_id)) return { datos: null, fallo: "Falta pegar en la base la migración de terminales sin tipo (20260923040000)." };
  return { datos, fallo: null };
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
