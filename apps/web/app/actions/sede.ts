"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const COOKIE_SEDE = "cayla_sede_activa";

// Cambia la sede sobre la que trabaja un Líder (selector del AppShell). Solo UI:
// el permiso real ya lo valida el servidor en cada RPC (fn_puede_operar_sede, 0012).
// Una Encargada no puede cambiarse de sede — se ignora la llamada.
export async function cambiarSedeActiva(sedeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: persona } = await supabase
    .from("personas")
    .select("rol")
    .eq("auth_user_id", user.id)
    .single();
  // El rol viene de dynamic: 'admin' es el Líder que puede cambiar de sede.
  if (persona?.rol !== "admin") return;

  const { data: sede } = await supabase
    .from("sedes")
    .select("id, tipo")
    .eq("id", sedeId)
    .maybeSingle();
  if (!sede || sede.tipo === "almacen") return; // solo tiendas y taller, no almacenes

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_SEDE, sede.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
