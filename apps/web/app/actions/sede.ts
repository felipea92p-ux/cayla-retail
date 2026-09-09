"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { mapearRol } from "@/lib/persona";

const COOKIE_SEDE = "cayla_sede_activa";

// Cambia la sede sobre la que trabaja un Líder (selector del AppShell). Solo UI:
// el permiso real ya lo valida el servidor en cada RPC (fn_puede_operar_sede, 0012).
// Una Encargada no puede cambiarse de sede — se ignora la llamada.
export async function cambiarSedeActiva(sedeId: string) {
  const supabase = await createClient();
  // getClaims() en vez de getUser(): verifica el JWT localmente (ES256 asimétrica), sin
  // viaje a Supabase Auth. Mismo cambio que proxy.ts y lib/persona.ts — ADR-0013.
  const { data: verificado } = await supabase.auth.getClaims();
  const authUserId = verificado?.claims?.sub;
  if (!authUserId) return;

  const { data: persona } = await supabase
    .from("personas")
    .select("rol")
    .eq("auth_user_id", authUserId)
    .single();
  // `personas.rol` trae DOS vocabularios según dónde corra: en producción es una vista
  // puente sobre Dynamic y dice 'admin'; en local es la tabla del propio repo, cuyo CHECK
  // solo admite 'lider'. `mapearRol` conoce ambos y es la única traducción del sistema.
  //
  // Comparar contra 'admin' a secas —como hacía esta línea— dejaba al Líder sin selector
  // de sede en desarrollo local: la acción retornaba en silencio, sin error ni aviso, y en
  // producción funcionaba, así que el bug era invisible. Es exactamente el mismo fallo que
  // `mapearRol` ya había arreglado en lib/persona.ts; este archivo se quedó atrás.
  if (mapearRol(persona?.rol ?? null) !== "lider") return;

  const { data: sede } = await supabase
    .from("sedes")
    .select("id, tipo")
    .eq("id", sedeId)
    .maybeSingle();
  if (!sede || !sede.id || sede.tipo === "almacen") return; // solo tiendas y taller, no almacenes

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_SEDE, sede.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
