"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// "cayla_ubicacion_activa" — el nombre del cookie está repetido acá y en
// lib/persona-actual.ts a propósito (mismo patrón que ya usaba V1 con
// COOKIE_SEDE): un archivo "use server" solo puede exportar funciones
// async, así que esta constante no se puede compartir importándola.
//
// Cambia la ubicación sobre la que "se para" un líder (selector del AppShell,
// Fase 2 — pendiente desde que Fase 1 dejó fuera al selector de ubicación,
// ver app/(app)/layout.tsx). Mismo mecanismo que V1 (app/actions/sede.ts,
// cookie httpOnly), adaptado a ubicaciones en vez de sedes.
//
// Esto es solo la PERSPECTIVA de la app — el permiso real de cada operación
// lo vuelve a validar el servidor en cada RPC (fn_puede_operar_ubicacion).
// Por eso esta acción también llama a esa misma función antes de guardar la
// cookie: nunca guarda un id que la persona no podría usar de todas formas,
// pero tampoco es la única puerta — si algún día alguien llama a una RPC
// saltándose esta acción, esa RPC igual la frena.
//
// ADR-0275: el valor "global" (repetido aquí por la misma razón que el nombre de la cookie; es `VALOR_VISTA_GLOBAL` de
// lib/vista-global.ts) elige CAYLA Global, la vista de toda la empresa. Se guarda solo si la base dice que la cuenta ve
// el módulo `cayla_global` (al nacer, solo el Admin); si no, no pasa nada, igual que con una sede que no puede operar.
// Devuelve si la cambió: el selector no lo necesita (repinta y la cabecera dice dónde quedó), pero /global/entrar sí,
// para no volver a /global en círculo cuando la base dice que no.
export async function cambiarUbicacionActiva(ubicacionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: verificado } = await supabase.auth.getClaims();
  if (!verificado?.claims?.sub) return false;

  if (ubicacionId === "global") {
    const { data: veGlobal } = await supabase.rpc("fn_ve_modulo", { p_clave: "cayla_global" });
    if (veGlobal !== true) return false;
  } else {
    const { data: puedeOperarla } = await supabase.rpc("fn_puede_operar_ubicacion", {
      p_ubicacion_id: ubicacionId,
    });
    if (!puedeOperarla) return false;
  }

  const cookieStore = await cookies();
  cookieStore.set("cayla_ubicacion_activa", ubicacionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}
