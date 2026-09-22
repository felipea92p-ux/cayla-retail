import { createClient } from "@/lib/supabase/server";
import { exigir, tolerar, type Tolerado } from "@/lib/resultado";
import { esClaveModulo, type ClaveModulo } from "@/lib/modulos";
import type { CuentaConRol, RolVista } from "@/lib/roles-reglas";

// Lectura de «Roles y accesos» (ADR-0161 B, migración 20260923030000_roles_por_modulo.sql). El líder o quien ve el módulo
// Roles y accesos (20260923131000): las tablas `roles` y `rol_modulos` se leen por RLS (`fn_puede_administrar_roles()`)
// y las cuentas por `fn_cuentas_con_rol()`, que lo vuelve a exigir. Las escrituras van por RPC desde el cliente (`lib/roles-acciones.ts`).

const CLAVES_SISTEMA = ["lider", "integrante", "terminal_ventas", "terminal_administrativa"] as const;

export async function getRoles(): Promise<RolVista[]> {
  const supabase = await createClient();
  const [roles, modulos] = await Promise.all([
    supabase.from("roles").select("id, clave, nombre, descripcion, es_sistema, fijo, limitado_como_hoy, archivado_at").order("creado_at"),
    supabase.from("rol_modulos").select("rol_id, modulo"),
  ]);
  const filas = exigir(roles, "los roles");
  const porRol = new Map<string, ClaveModulo[]>();
  for (const f of exigir(modulos, "los módulos de cada rol")) {
    if (!esClaveModulo(f.modulo)) continue;
    porRol.set(f.rol_id, [...(porRol.get(f.rol_id) ?? []), f.modulo]);
  }
  return filas.map((r) => ({
    id: r.id,
    clave: (CLAVES_SISTEMA as readonly string[]).includes(r.clave ?? "") ? (r.clave as RolVista["clave"]) : null,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSistema: r.es_sistema,
    fijo: r.fijo,
    limitadoComoHoy: r.limitado_como_hoy,
    archivado: r.archivado_at !== null,
    modulos: porRol.get(r.id) ?? [],
  }));
}

/** Todas las cuentas con su rol. Tolerado: en Colaboradores, si falla, solo se pierde la columna del rol. */
export async function getCuentasConRol(): Promise<Tolerado<CuentaConRol[]>> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc("fn_cuentas_con_rol"), "las cuentas y sus roles");
  if (!datos) return { datos: null, fallo };
  return {
    datos: datos.map((c) => ({
      tipo: c.tipo === "terminal" ? "terminal" : "persona",
      id: c.id,
      nombre: c.nombre,
      ubicacion: c.ubicacion_nombre,
      rolId: c.rol_id,
      esLider: c.es_lider,
      estado: c.estado,
    })),
    fallo: null,
  };
}

/** Los roles, tolerado (para Colaboradores: la pantalla sigue aunque la migración aún no esté pegada). */
export async function getRolesTolerado(): Promise<RolVista[] | null> {
  try {
    return await getRoles();
  } catch {
    return null;
  }
}
