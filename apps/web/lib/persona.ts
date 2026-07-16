import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type PersonaActual = {
  id: string;
  nombre: string;
  rol: "lider" | "integrante";
  sedeId: string;
  sedeCodigo: string;
};

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

  return {
    id: data.id,
    nombre: data.nombre,
    rol: data.rol as "lider" | "integrante",
    sedeId: data.sede_id,
    sedeCodigo: sede?.codigo ?? "",
  };
}
