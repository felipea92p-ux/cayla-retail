import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type PersonaActual = {
  id: string;
  nombre: string;
  rol: "lider" | "integrante";
  /** Sede sobre la que trabaja AHORA. Para una Encargada es siempre su sede; un Líder
   *  puede "pararse" en cualquier tienda o en el Taller con el selector del AppShell. */
  sedeId: string;
  sedeCodigo: string;
};

const COOKIE_SEDE = "cayla_sede_activa";

/** Trae la persona ligada al usuario logueado. Si no existe, no puede usar la app todavía
 *  (falta que un Líder la dé de alta) — se manda a /login con el mensaje. */
export async function requirePersonaActual(): Promise<PersonaActual> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("personas")
    .select("id, nombre, rol, sede_id, sedes(codigo)")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) {
    redirect("/login?error=sin_persona");
  }

  const sede = Array.isArray(data.sedes) ? data.sedes[0] : data.sedes;
  let sedeId = data.sede_id;
  let sedeCodigo = sede?.codigo ?? "";

  // Selector de sede del Líder: la cookie solo cambia la PERSPECTIVA de la app; el
  // permiso real lo valida el servidor en cada operación (fn_puede_operar_sede, 0012).
  if (data.rol === "lider") {
    const cookieStore = await cookies();
    const activa = cookieStore.get(COOKIE_SEDE)?.value;
    if (activa && activa !== data.sede_id) {
      const { data: sedeActiva } = await supabase
        .from("sedes")
        .select("id, codigo, tipo")
        .eq("id", activa)
        .maybeSingle();
      if (sedeActiva && sedeActiva.tipo !== "almacen") {
        sedeId = sedeActiva.id;
        sedeCodigo = sedeActiva.codigo;
      }
    }
  }

  return {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol as "lider" | "integrante",
    sedeId,
    sedeCodigo,
  };
}
